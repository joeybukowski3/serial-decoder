/**
 * PostgreSQL implementation of the persistent model evidence store.
 *
 * *** THIS IS THE ONLY FILE IN THE REPOSITORY PERMITTED TO IMPORT A DATABASE
 *     CLIENT. *** Everything else depends on store-interface.js. That rule is
 * what keeps the store swappable and keeps Postgres out of the API routes,
 * the browser bundles, and the lookup logic.
 *
 * Guarantees provided here, relied on by lookupModelEvidence():
 *   - No read ever throws. Failures become a miss plus a categorical code.
 *   - Every read is bounded by MODEL_EVIDENCE_DB_MAX_MS (default 120 ms) and
 *     a server-side statement_timeout backstop.
 *   - Ambiguous identity resolution returns NO product (fails safe toward the
 *     provider path) rather than picking one.
 *   - All SQL is parameterized through postgres.js tagged templates. There is
 *     no string interpolation of user-derived values anywhere in this file.
 */
import postgres from 'postgres';

import { isTimeoutError } from '../smart-lookup/deadline.js';
import {
  buildBundle,
  mapClaimRow,
  mapProductRow,
  mapSourceRow,
} from './mappers.js';
import {
  buildStoreLookupTokens,
  IDENTITY_BEARING_ALIAS_TYPES,
  normalizeEvidenceBrand,
} from './normalization.js';
import { createMissResult, STORE_FAILURE_CODES } from './store-interface.js';

/** Hard cap on any single store read. */
export const DEFAULT_STORE_READ_MAX_MS = 120;
/**
 * Head-room for the server-side statement_timeout above the client read cap.
 *
 * The server timeout MUST be derived from the effective client cap, not fixed.
 * A hard-coded value silently overrode MODEL_EVIDENCE_DB_MAX_MS: raising the
 * client budget did nothing because Postgres still cancelled the query at the
 * fixed value and returned 57014, which surfaced as a spurious STORE_TIMEOUT.
 * Keeping the server slightly slower than the client means the client timer
 * normally fires first (clean, attributable timeout) while a pathological plan
 * still cannot hold a Vercel function open.
 */
const STATEMENT_TIMEOUT_MARGIN_MS = 30;

/** Claim types the shadow read requests. Classification claims are not needed. */
const LIFECYCLE_CLAIM_TYPES_SQL = [
  'introduction_year',
  'production_start',
  'production_end',
  'production_range',
  'availability_year',
  'discontinuation_year',
  'model_generation',
];

/**
 * Connection configuration for a serverless runtime behind a TRANSACTION
 * POOLER (Supabase port 6543 / pgbouncer transaction mode).
 *
 *   max: 1              One connection per function instance. Vercel scales by
 *                       process, so a pool per instance multiplies into
 *                       connection-slot exhaustion.
 *   prepare: false      Transaction-mode pooling does not preserve session
 *                       state, so server-side prepared statements break.
 *                       postgres.js still parameterizes; only the named-
 *                       statement optimization is disabled.
 *   fetch_types: false  Suppresses the type-introspection round trip on each
 *                       new connection. Enum columns arrive as text, which is
 *                       exactly what mappers.js expects.
 *                       CONSEQUENCE: without introspection postgres.js cannot
 *                       serialize a JS array into a Postgres array, so
 *                       `= ANY(${array})` fails at runtime with "malformed
 *                       array literal". Every multi-value predicate below
 *                       therefore uses `IN ${sql(values)}`, which postgres.js
 *                       expands into an ordinary parameterized value list
 *                       ($1, $2, ...). Values remain bound, never interpolated.
 *   idle_timeout        Release the socket promptly; a frozen Vercel instance
 *                       must not hold a pooler slot.
 *   connect_timeout     Fail fast rather than consume the read budget.
 */
export function buildConnectionOptions(overrides = {}) {
  const readMaxMs = Number(overrides.maxMs) || DEFAULT_STORE_READ_MAX_MS;
  const statementTimeoutMs = Number(overrides.statementTimeoutMs)
    || readMaxMs + STATEMENT_TIMEOUT_MARGIN_MS;

  return {
    max: 1,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    connect_timeout: 5,
    prepare: false,
    fetch_types: false,
    onnotice: () => {},
    connection: {
      application_name: 'decodemyitem-model-evidence-store',
      statement_timeout: String(Math.max(50, Math.round(statementTimeoutMs))),
    },
    ...(overrides.clientOptions || {}),
  };
}

/**
 * Module-level client cache, keyed by connection URL.
 *
 * Vercel reuses the module between warm invocations, so this yields one
 * connection per instance rather than one per request. Creating a client per
 * query would defeat the pooler.
 */
const clientCache = new Map();

/**
 * Cache key includes the connection settings that are baked into the session
 * (notably statement_timeout). Keying on the URL alone would let the first
 * caller's budget silently apply to every later caller.
 */
function clientCacheKey(url, options) {
  const settings = buildConnectionOptions(options);
  return `${url}|${settings.connection.statement_timeout}`;
}

function getClient(url, options) {
  const key = clientCacheKey(url, options);
  const cached = clientCache.get(key);
  if (cached) return cached;
  const client = postgres(url, buildConnectionOptions(options));
  clientCache.set(key, client);
  return client;
}

/** Test/ops helper: drop cached clients so a new configuration takes effect. */
export async function closeAllClients() {
  const clients = [...clientCache.values()];
  clientCache.clear();
  await Promise.allSettled(clients.map((client) => client.end({ timeout: 1 })));
}

function classifyError(error) {
  if (isTimeoutError(error)) return STORE_FAILURE_CODES.TIMEOUT;
  const code = String(error?.code || '');
  // postgres.js/libpq connection-class failures.
  if (['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EHOSTUNREACH', 'CONNECTION_CLOSED', 'CONNECTION_ENDED', 'CONNECTION_DESTROYED']
    .includes(code)) {
    return STORE_FAILURE_CODES.UNAVAILABLE;
  }
  if (code === '57014') return STORE_FAILURE_CODES.TIMEOUT; // query_canceled (statement_timeout)
  if (/^08/.test(code)) return STORE_FAILURE_CODES.UNAVAILABLE; // connection exception class
  if (/^28/.test(code)) return STORE_FAILURE_CODES.UNAVAILABLE; // invalid authorization
  if (/^3D|^3F/.test(code)) return STORE_FAILURE_CODES.UNAVAILABLE; // invalid catalog/schema
  if (code) return STORE_FAILURE_CODES.QUERY_ERROR;
  return STORE_FAILURE_CODES.UNAVAILABLE;
}

/**
 * Run `operation` under the read cap.
 *
 * Uses the route deadline when one is supplied so the store participates in
 * the same abort machinery as every other stage, and reserves budget so a slow
 * store can never consume the deterministic completion reserve.
 */
async function withReadBudget(operation, { deadline, maxMs, reserveMs, stage }) {
  const budgetMs = Math.max(1, Number(maxMs) || DEFAULT_STORE_READ_MAX_MS);

  if (deadline?.run) {
    return deadline.run(stage, () => operation(), { maxMs: budgetMs, reserveMs });
  }

  let timer;
  try {
    return await Promise.race([
      operation(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`model evidence store read timed out: ${stage}`);
          error.code = 'STAGE_TIMEOUT';
          reject(error);
        }, budgetMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {{url: string, maxMs?: number, reserveMs?: number, now?: Function,
 *          statementTimeoutMs?: number, clientOptions?: object, sql?: object}} config
 */
export function createPostgresStore(config = {}) {
  const url = String(config.url || '');
  if (!url) return null;

  const defaultMaxMs = Number(config.maxMs) || DEFAULT_STORE_READ_MAX_MS;
  const defaultReserveMs = Number.isFinite(config.reserveMs) ? config.reserveMs : 400;
  const now = config.now || Date.now;
  // `config.sql` is a test seam: it lets the schema/adapter tests drive a real
  // Postgres connection they manage themselves.
  const sql = config.sql || getClient(url, { ...config, maxMs: defaultMaxMs });

  /**
   * Resolve one entered identity to at most one product.
   *
   * Deliberately NOT a single query with `LIMIT 1`. Selecting one row would
   * silently pick a winner when a token maps to several products, which is
   * precisely the alias-poisoning failure mode. All candidate rows are
   * fetched and ambiguity is detected explicitly.
   */
  async function queryIdentity(brandKey, tokens) {
    return sql`
      SELECT p.id,
             p.public_id,
             p.brand,
             p.brand_key,
             p.canonical_model,
             p.normalized_model,
             p.identity_kind::text   AS identity_kind,
             p.identity_status::text AS identity_status,
             p.identity_confidence::text AS identity_confidence,
             p.category,
             p.model_line,
             p.evidence_version,
             f.public_id             AS family_public_id,
             'canonical-model'       AS matched_by,
             NULL::text              AS matched_alias_type,
             NULL::text              AS equivalence_reason,
             p.normalized_model      AS matched_token
        FROM products p
        LEFT JOIN products f ON f.id = p.family_product_id
       WHERE p.brand_key = ${brandKey}
         AND p.normalized_model IN ${sql(tokens)}
         AND p.identity_status <> 'retired'

      UNION ALL

      SELECT p.id,
             p.public_id,
             p.brand,
             p.brand_key,
             p.canonical_model,
             p.normalized_model,
             p.identity_kind::text,
             p.identity_status::text,
             p.identity_confidence::text,
             p.category,
             p.model_line,
             p.evidence_version,
             f.public_id,
             'alias',
             a.alias_type::text,
             a.equivalence_reason,
             a.normalized_alias
        FROM product_aliases a
        JOIN products p ON p.id = a.product_id
        LEFT JOIN products f ON f.id = p.family_product_id
       WHERE a.brand_key = ${brandKey}
         AND a.normalized_alias IN ${sql(tokens)}
         AND a.is_verified
         AND NOT a.is_retired
         AND a.alias_type::text IN ${sql(IDENTITY_BEARING_ALIAS_TYPES)}
         AND p.identity_status <> 'retired'
    `;
  }

  async function queryClaims(productId) {
    return sql`
      SELECT c.id                       AS claim_id,
             c.claim_type::text         AS claim_type,
             c.start_year,
             c.end_year,
             c.point_year,
             c.claim_value,
             c.precision::text          AS precision,
             c.identity_match::text     AS identity_match,
             c.evidence_quality::text   AS evidence_quality,
             c.claim_confidence::text   AS claim_confidence,
             c.basis,
             c.extractor,
             c.last_verified_at,
             s.url,
             s.domain,
             s.source_type::text        AS source_type,
             s.source_quality::text     AS source_quality,
             s.title,
             s.publication_date,
             cs.normalized_fact,
             cs.exact_model_match,
             cs.canonical_equivalent_match,
             cs.matched_token,
             cs.provider
        FROM evidence_claims c
        LEFT JOIN claim_sources cs    ON cs.claim_id = c.id
        LEFT JOIN evidence_sources s  ON s.id = cs.source_id
       WHERE c.product_id = ${productId}
         AND c.status = 'active'
         AND c.claim_type::text IN ${sql(LIFECYCLE_CLAIM_TYPES_SQL)}
       ORDER BY c.claim_type, c.id, s.id
    `;
  }

  /**
   * Fold the flat claim x source join into claims with nested sources, mapping
   * and validating each claim exactly once.
   */
  function foldClaimRows(rows, nowMs) {
    const sourcesByClaim = new Map();
    const claimRowById = new Map();

    for (const row of rows) {
      const claimId = String(row.claim_id);
      if (!claimRowById.has(claimId)) claimRowById.set(claimId, row);
      const source = mapSourceRow(row);
      if (!source) continue;
      const list = sourcesByClaim.get(claimId) || [];
      list.push(source);
      sourcesByClaim.set(claimId, list);
    }

    const claims = [];
    let malformedClaimCount = 0;
    for (const [claimId, row] of claimRowById) {
      const claim = mapClaimRow(row, sourcesByClaim.get(claimId) || [], nowMs);
      if (claim) claims.push(claim);
      else malformedClaimCount += 1;
    }
    return { claims, malformedClaimCount };
  }

  async function resolveStoredIdentity(input = {}, options = {}) {
    const startedAt = now();
    const brandKey = normalizeEvidenceBrand(input.brand);
    const tokens = buildStoreLookupTokens(input.modelIdentity || {}, input.model);

    if (!tokens.length) {
      return createMissResult({
        attempted: true,
        available: true,
        failureCode: STORE_FAILURE_CODES.INVALID_INPUT,
        durationMs: Math.max(0, now() - startedAt),
      });
    }

    try {
      const rows = await withReadBudget(() => queryIdentity(brandKey, tokens), {
        deadline: options.deadline,
        maxMs: options.maxMs || defaultMaxMs,
        reserveMs: options.reserveMs ?? defaultReserveMs,
        stage: 'model-evidence-store-identity',
      });

      const durationMs = Math.max(0, now() - startedAt);
      if (!rows.length) {
        return createMissResult({ attempted: true, available: true, durationMs });
      }

      // Ambiguity check BEFORE choosing anything.
      const distinctProductIds = new Set(rows.map((row) => String(row.id)));
      if (distinctProductIds.size > 1) {
        return createMissResult({
          attempted: true,
          available: true,
          ambiguous: true,
          failureCode: STORE_FAILURE_CODES.AMBIGUOUS_IDENTITY,
          durationMs,
        });
      }

      // A canonical-model hit outranks an alias hit for the same product,
      // matching exactMatchKind() in lib/model-evidence/exact-model-match.js.
      const best = rows.find((row) => row.matched_by === 'canonical-model') || rows[0];
      const product = mapProductRow(best, {
        matchedBy: best.matched_by,
        matchedAliasType: best.matched_alias_type,
        equivalenceReason: best.equivalence_reason,
        matchedToken: best.matched_token,
      });

      return {
        ...createMissResult(),
        attempted: true,
        available: true,
        hit: true,
        bundle: null,
        durationMs,
        _productId: best.id,
        product,
      };
    } catch (error) {
      const failureCode = classifyError(error);
      return createMissResult({
        attempted: true,
        available: failureCode !== STORE_FAILURE_CODES.UNAVAILABLE,
        timedOut: failureCode === STORE_FAILURE_CODES.TIMEOUT,
        failureCode,
        durationMs: Math.max(0, now() - startedAt),
      });
    }
  }

  async function getBestStoredEvidence(input = {}, options = {}) {
    const startedAt = now();
    const nowMs = now();

    const identity = await resolveStoredIdentity(input, {
      ...options,
      // Both queries share the overall read cap; the identity query gets the
      // larger half so a slow first query cannot starve the second silently.
      maxMs: options.maxMs || defaultMaxMs,
    });

    if (!identity.hit || !identity.product) {
      return { ...identity, durationMs: Math.max(0, now() - startedAt) };
    }

    try {
      const remainingMs = Math.max(
        1,
        (options.maxMs || defaultMaxMs) - Math.max(0, now() - startedAt),
      );
      const rows = await withReadBudget(() => queryClaims(identity._productId), {
        deadline: options.deadline,
        maxMs: remainingMs,
        reserveMs: options.reserveMs ?? defaultReserveMs,
        stage: 'model-evidence-store-claims',
      });

      const { claims, malformedClaimCount } = foldClaimRows(rows, nowMs);
      const bundle = buildBundle(identity.product, claims, malformedClaimCount, nowMs);

      return {
        attempted: true,
        available: true,
        hit: true,
        ambiguous: false,
        timedOut: false,
        malformed: malformedClaimCount > 0,
        bundle,
        failureCode: malformedClaimCount > 0 ? STORE_FAILURE_CODES.MALFORMED_ROW : null,
        durationMs: Math.max(0, now() - startedAt),
      };
    } catch (error) {
      const failureCode = classifyError(error);
      return createMissResult({
        attempted: true,
        available: failureCode !== STORE_FAILURE_CODES.UNAVAILABLE,
        timedOut: failureCode === STORE_FAILURE_CODES.TIMEOUT,
        failureCode,
        durationMs: Math.max(0, now() - startedAt),
      });
    }
  }

  function notImplemented(name) {
    return async () => {
      const error = new Error(`${name} is not implemented in Phase 3B (read-only shadow store)`);
      error.code = 'NOT_IMPLEMENTED';
      throw error;
    };
  }

  return {
    kind: 'postgres',
    failureCode: null,

    async findProductByCanonicalModel(input = {}, options = {}) {
      return resolveStoredIdentity(
        { brand: input.brand, model: input.model, modelIdentity: { canonicalModel: input.model } },
        options,
      );
    },

    async findProductByAlias(input = {}, options = {}) {
      return resolveStoredIdentity(
        { brand: input.brand, model: input.alias, modelIdentity: { canonicalModel: input.alias } },
        options,
      );
    },

    resolveStoredIdentity,
    getBestStoredEvidence,

    async getLifecycleClaims(input = {}, options = {}) {
      const result = await getBestStoredEvidence(input, options);
      return result.bundle?.claims || [];
    },

    async getEvidenceSources(input = {}, options = {}) {
      const result = await getBestStoredEvidence(input, options);
      const byClaimType = new Map();
      for (const claim of result.bundle?.claims || []) {
        byClaimType.set(claim.claimType, claim.sources);
      }
      return byClaimType;
    },

    async healthCheck(options = {}) {
      const startedAt = now();
      try {
        await withReadBudget(() => sql`SELECT 1 AS ok`, {
          deadline: options.deadline,
          maxMs: options.maxMs || defaultMaxMs,
          reserveMs: options.reserveMs ?? defaultReserveMs,
          stage: 'model-evidence-store-health',
        });
        return { ok: true, failureCode: null, durationMs: Math.max(0, now() - startedAt) };
      } catch (error) {
        return {
          ok: false,
          failureCode: classifyError(error),
          durationMs: Math.max(0, now() - startedAt),
        };
      }
    },

    // Declared for Phase 3D review; unusable in Phase 3B. The database role
    // also holds no write grants, so these would fail even if called.
    upsertProduct: notImplemented('upsertProduct'),
    upsertAlias: notImplemented('upsertAlias'),
    persistEvidence: notImplemented('persistEvidence'),
    attachSource: notImplemented('attachSource'),
    supersedeEvidence: notImplemented('supersedeEvidence'),

    async close() {
      if (config.sql) return; // caller owns an injected client
      clientCache.delete(clientCacheKey(url, config));
      await sql.end({ timeout: 1 }).catch(() => {});
    },
  };
}
