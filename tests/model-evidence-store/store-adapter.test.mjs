/**
 * Persistent evidence store adapter tests.
 *
 * Two layers:
 *   - Fake-`sql` tests (always run): failure, timeout, malformed rows, and
 *     budget behaviour, which cannot be produced against a healthy database
 *     — the schema's CHECK constraints make a malformed row unstorable, which
 *     is exactly why the mapper's rejection path needs a stub to be exercised.
 *   - Real-Postgres tests (skipped without MODEL_EVIDENCE_TEST_DB_URL):
 *     canonical hit, alias hit, miss, and ambiguity against real SQL.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import postgres from 'postgres';

import { createDeadline } from '../../lib/smart-lookup/deadline.js';
import { buildSharedModelIdentity } from '../../lib/model-evidence/shared-model-identity.js';
import { createPostgresStore } from '../../lib/model-evidence-store/postgres-store.js';
import { createNullStore } from '../../lib/model-evidence-store/null-store.js';
import { STORE_FAILURE_CODES, isStoreLike } from '../../lib/model-evidence-store/store-interface.js';
import { isWellFormedClaimRow, mapClaimRow } from '../../lib/model-evidence-store/mappers.js';

const TEST_DB_URL = String(process.env.MODEL_EVIDENCE_TEST_DB_URL || '').trim();
const shouldSkip = !TEST_DB_URL;
const skipReason = 'MODEL_EVIDENCE_TEST_DB_URL is not set; real-Postgres adapter tests skipped';

/**
 * Minimal tagged-template stub standing in for a postgres.js client.
 * `responder` receives the assembled query text and returns rows (or throws).
 *
 * postgres.js overloads its client: called as a TAGGED TEMPLATE it runs a
 * query, but called with a plain value (`sql(tokens)` inside a template) it
 * builds an inline fragment and runs nothing. The stub must honour that
 * distinction — otherwise every `IN ${sql(tokens)}` fragment would be treated
 * as a second query and, when the responder throws, produce an unhandled
 * rejection that no production code path can actually generate.
 *
 * Template-strings arrays carry a `.raw` property; fragment arguments do not.
 */
function makeFakeSql(responder) {
  const calls = [];
  const fake = (strings, ...values) => {
    if (!strings || !Object.prototype.hasOwnProperty.call(strings, 'raw')) {
      return { __fragment: true, values: strings };
    }
    const text = Array.from(strings).join('?');
    calls.push({ text, values });
    return Promise.resolve().then(() => responder(text, values, calls.length));
  };
  fake.calls = calls;
  fake.end = async () => {};
  return fake;
}

function identityFor(model, brand = 'Whirlpool', category = 'dryer') {
  return buildSharedModelIdentity({ brand, model, category });
}

// ---------------------------------------------------------------------------
// Interface conformance
// ---------------------------------------------------------------------------

test('the null store satisfies the read interface and always misses', async () => {
  const store = createNullStore();
  assert.equal(isStoreLike(store), true);

  const result = await store.getBestStoredEvidence({ brand: 'Whirlpool', model: 'WED4850HW0' });
  assert.equal(result.hit, false);
  assert.equal(result.attempted, false);
  assert.equal(result.available, false);
  assert.equal(result.bundle, null);
  assert.equal(result.failureCode, STORE_FAILURE_CODES.DISABLED);
  assert.deepEqual(await store.getLifecycleClaims({}), []);
});

test('the postgres store satisfies the read interface', () => {
  const store = createPostgresStore({ url: 'postgres://unused', sql: makeFakeSql(() => []) });
  assert.equal(isStoreLike(store), true);
});

// ---------------------------------------------------------------------------
// Failure absorption — nothing here may ever throw
// ---------------------------------------------------------------------------

test('a connection failure is absorbed and reported as unavailable', async () => {
  const store = createPostgresStore({
    url: 'postgres://unused',
    sql: makeFakeSql(() => {
      const error = new Error('connect ECONNREFUSED');
      error.code = 'ECONNREFUSED';
      throw error;
    }),
  });

  const result = await store.getBestStoredEvidence({
    brand: 'Whirlpool', model: 'WED4850HW0', modelIdentity: identityFor('WED4850HW0'),
  });

  assert.equal(result.hit, false);
  assert.equal(result.available, false);
  assert.equal(result.attempted, true);
  assert.equal(result.failureCode, STORE_FAILURE_CODES.UNAVAILABLE);
  assert.equal(result.bundle, null);
});

test('a query error is absorbed and reported without leaking the driver message', async () => {
  const store = createPostgresStore({
    url: 'postgres://unused',
    sql: makeFakeSql(() => {
      const error = new Error('relation "products" does not exist');
      error.code = '42P01';
      throw error;
    }),
  });

  const result = await store.getBestStoredEvidence({
    brand: 'Whirlpool', model: 'WED4850HW0', modelIdentity: identityFor('WED4850HW0'),
  });
  assert.equal(result.failureCode, STORE_FAILURE_CODES.QUERY_ERROR);
  assert.equal(result.hit, false);
  // The failure code is categorical; no SQL or schema detail escapes.
  assert.equal(/relation/.test(JSON.stringify(result)), false);
});

test('a slow query is cut off at the read budget and reported as a timeout', async () => {
  const store = createPostgresStore({
    url: 'postgres://unused',
    maxMs: 40,
    sql: makeFakeSql(() => new Promise((resolve) => setTimeout(() => resolve([]), 5000))),
  });

  const startedAt = Date.now();
  const result = await store.getBestStoredEvidence({
    brand: 'Whirlpool', model: 'WED4850HW0', modelIdentity: identityFor('WED4850HW0'),
  });
  const elapsed = Date.now() - startedAt;

  assert.equal(result.timedOut, true);
  assert.equal(result.failureCode, STORE_FAILURE_CODES.TIMEOUT);
  assert.equal(result.hit, false);
  assert.ok(elapsed < 1500, `store read must abandon quickly, took ${elapsed}ms`);
});

test('the read budget never consumes the route reserve', async () => {
  // 300ms of route budget with a 400ms reserve: there is no room, so the
  // deadline must refuse the stage rather than borrow from the reserve.
  const deadline = createDeadline({ totalMs: 300 });
  const store = createPostgresStore({
    url: 'postgres://unused',
    maxMs: 120,
    reserveMs: 400,
    sql: makeFakeSql(() => new Promise((resolve) => setTimeout(() => resolve([]), 5000))),
  });

  const result = await store.getBestStoredEvidence(
    { brand: 'Whirlpool', model: 'WED4850HW0', modelIdentity: identityFor('WED4850HW0') },
    { deadline },
  );

  assert.equal(result.hit, false);
  assert.ok(deadline.remainingMs(0) > 0, 'the route deadline must not have been drained');
});

test('a real unreachable host degrades to a miss rather than throwing', { skip: shouldSkip && skipReason }, async () => {
  await warmConnection();
  // Port 1 is closed: this exercises the genuine driver connection-error path,
  // not a stub.
  const store = createPostgresStore({
    url: 'postgres://testuser:testpw@127.0.0.1:1/evidence_test',
    maxMs: 400,
  });
  const result = await store.getBestStoredEvidence({
    brand: 'Whirlpool', model: 'WED4850HW0', modelIdentity: identityFor('WED4850HW0'),
  });
  assert.equal(result.hit, false);
  assert.ok(
    [STORE_FAILURE_CODES.UNAVAILABLE, STORE_FAILURE_CODES.TIMEOUT].includes(result.failureCode),
    `unexpected failure code ${result.failureCode}`,
  );
  await store.close();
});

// ---------------------------------------------------------------------------
// Input guards
// ---------------------------------------------------------------------------

test('a model shorter than MIN_EXACT_TOKEN_LENGTH never reaches a query', async () => {
  const fake = makeFakeSql(() => []);
  const store = createPostgresStore({ url: 'postgres://unused', sql: fake });

  const result = await store.getBestStoredEvidence({
    brand: 'Whirlpool', model: 'WED', modelIdentity: identityFor('WED'),
  });

  assert.equal(result.failureCode, STORE_FAILURE_CODES.INVALID_INPUT);
  assert.equal(fake.calls.length, 0, 'no query should be issued for an unusable token');
});

// ---------------------------------------------------------------------------
// Malformed row rejection
// ---------------------------------------------------------------------------

test('malformed claim rows are rejected rather than interpreted', () => {
  // A lifecycle claim with no year would otherwise read as "no evidence" and
  // be indistinguishable from a genuine absence.
  assert.equal(isWellFormedClaimRow({ claim_type: 'production_start' }), false);
  assert.equal(isWellFormedClaimRow({ claim_type: 'production_start', point_year: 2019 }), true);
  assert.equal(isWellFormedClaimRow({ claim_type: 'production_start', point_year: 2019, start_year: 2019 }), false);
  assert.equal(isWellFormedClaimRow({ claim_type: 'production_range', start_year: 2022, end_year: 2019 }), false);
  assert.equal(isWellFormedClaimRow({ claim_type: 'production_range', start_year: 2019, end_year: 2022 }), true);
  assert.equal(isWellFormedClaimRow({ claim_type: 'production_start', point_year: 1492 }), false);
  // A claim_type this code does not know about is rejected, not guessed at.
  assert.equal(isWellFormedClaimRow({ claim_type: 'future_claim_type', point_year: 2019 }), false);
  assert.equal(mapClaimRow({ claim_type: 'production_start' }), null);
});

test('a malformed stored row produces a flagged miss, not a wrong bundle', async () => {
  const store = createPostgresStore({
    url: 'postgres://unused',
    sql: makeFakeSql((text) => {
      if (/FROM products p/.test(text) && /UNION ALL/.test(text)) {
        return [{
          id: 1, public_id: '11111111-1111-4111-8111-111111111111',
          brand: 'Whirlpool', brand_key: 'whirlpool',
          canonical_model: 'WED4850HW0', normalized_model: 'WED4850HW0',
          identity_kind: 'exact_model', identity_status: 'accepted',
          identity_confidence: 'high', category: 'dryer', model_line: null,
          evidence_version: 1, family_public_id: null,
          matched_by: 'canonical-model', matched_alias_type: null,
          equivalence_reason: null, matched_token: 'WED4850HW0',
        }];
      }
      // A lifecycle claim with no year at all — impossible through the CHECK
      // constraint, possible via a hand-run SQL fix or a future migration bug.
      return [{
        claim_id: 9, claim_type: 'production_start',
        start_year: null, end_year: null, point_year: null, claim_value: null,
        precision: 'year', identity_match: 'exact', evidence_quality: 'strong',
        claim_confidence: 'high', basis: 'broken', extractor: 'gemini',
        last_verified_at: new Date().toISOString(),
        url: null, domain: null, source_type: null, source_quality: null,
        title: null, publication_date: null, normalized_fact: null,
        exact_model_match: null, canonical_equivalent_match: null,
        matched_token: null, provider: null,
      }];
    }),
  });

  const result = await store.getBestStoredEvidence({
    brand: 'Whirlpool', model: 'WED4850HW0', modelIdentity: identityFor('WED4850HW0'),
  });

  assert.equal(result.malformed, true);
  assert.equal(result.failureCode, STORE_FAILURE_CODES.MALFORMED_ROW);
  assert.equal(result.bundle.claims.length, 0, 'the malformed claim must be dropped');
  assert.equal(result.bundle.malformedClaimCount, 1);
  assert.equal(result.bundle.lifecycle.start, null);
});

// ---------------------------------------------------------------------------
// Real Postgres: identity resolution
// ---------------------------------------------------------------------------

let realSql = null;
function realClient() {
  if (!realSql) {
    realSql = postgres(TEST_DB_URL, { max: 1, prepare: false, fetch_types: false, onnotice: () => {} });
  }
  return realSql;
}

/**
 * Real-database store for the identity-resolution tests.
 *
 * `maxMs` is deliberately generous. These tests assert WHICH product resolves,
 * not how fast, and the shared test database also serves schema.test.mjs,
 * whose DDL takes exclusive locks that can push an ordinary SELECT past the
 * 120 ms production budget. Budget behaviour is asserted separately and
 * explicitly (see the cold-connection and slow-query tests above).
 */
function realStore(options = {}) {
  return createPostgresStore({ url: TEST_DB_URL, sql: realClient(), maxMs: 5000, ...options });
}

/**
 * Establish the connection before the timed tests run.
 *
 * The read budget covers TCP connect + authentication as well as the query, so
 * on a COLD client the first read can legitimately exceed 120 ms and return a
 * timeout miss. That is correct production behaviour (fail fast, fall through
 * to research) and is asserted separately below — but a test about identity
 * resolution must not silently become a test about connection latency.
 */
let warmupPromise = null;
function warmConnection() {
  if (!warmupPromise) warmupPromise = realClient()`SELECT 1 AS ok`.catch(() => {});
  return warmupPromise;
}

test('a cold connection that exceeds the read budget degrades to a miss', { skip: shouldSkip && skipReason }, async () => {
  // A deliberately tiny budget stands in for a cold connect on a new function
  // instance. The requirement is not that it succeeds — it is that it never
  // throws and never blocks the lookup.
  const cold = createPostgresStore({ url: TEST_DB_URL, maxMs: 1 });
  const result = await cold.getBestStoredEvidence({
    brand: 'Whirlpool', model: 'WED4850HW0', modelIdentity: identityFor('WED4850HW0'),
  });
  assert.equal(result.hit, false);
  assert.equal(result.timedOut, true);
  assert.equal(result.failureCode, STORE_FAILURE_CODES.TIMEOUT);
  await cold.close();
});

/**
 * Fixtures this file creates are namespaced per process.
 *
 * `node --test` runs test FILES concurrently against one database, and this
 * suite is not the only file writing to it. A shared literal key made the
 * ambiguity fixture visible to (and deletable by) a concurrent run, which
 * showed up as an intermittent failure. A per-process key removes the shared
 * mutable state entirely rather than papering over it with retries.
 */
const RUN_ID = `adaptertest${process.pid}`.toLowerCase().replace(/[^a-z0-9]/g, '');
/** Alias tokens must also be unique per process: they are brand-scoped unique. */
const TOKEN = (prefix) => `${prefix}${process.pid}`.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 40);
const RETIRED_TOKEN = TOKEN('RETIREDALIAS');
const UNVERIFIED_TOKEN = TOKEN('UNVERIFIEDAL');
const FAMILY_TOKEN = TOKEN('FAMILYALIAS');

test.after(async () => {
  if (realSql) {
    await realSql`DELETE FROM product_aliases WHERE source = ${RUN_ID}`.catch(() => {});
    await realSql`DELETE FROM products WHERE brand_key = ${RUN_ID}`.catch(() => {});
    await realSql.end({ timeout: 5 }).catch(() => {});
  }
});

test('a canonical model resolves against real SQL', { skip: shouldSkip && skipReason }, async () => {
  await warmConnection();
  const result = await realStore().getBestStoredEvidence({
    brand: 'Whirlpool', model: 'WED4850HW0', modelIdentity: identityFor('WED4850HW0'),
  });

  assert.equal(result.hit, true);
  assert.equal(result.available, true);
  assert.equal(result.bundle.product.canonicalModel, 'WED4850HW0');
  assert.equal(result.bundle.product.matchedBy, 'canonical-model');
  assert.equal(result.bundle.product.identityKind, 'exact_model');
  // Identity without lifecycle evidence: the seed deliberately holds no years
  // for this model, and the bundle must say so rather than imply absence of
  // the product.
  assert.equal(result.bundle.claims.length, 0);
  assert.equal(result.bundle.lifecycle.start, null);
});

test('the O/0 transcription alias resolves to the canonical product', { skip: shouldSkip && skipReason }, async () => {
  await warmConnection();
  const result = await realStore().getBestStoredEvidence({
    brand: 'Whirlpool', model: 'WED4850HWO', modelIdentity: identityFor('WED4850HWO'),
  });

  assert.equal(result.hit, true);
  assert.equal(result.bundle.product.canonicalModel, 'WED4850HW0');
  // buildSharedModelIdentity offers both forms as searchModels, so the
  // canonical branch of the UNION wins. Either branch resolving to the same
  // product is the correctness requirement.
  assert.ok(['canonical-model', 'alias'].includes(result.bundle.product.matchedBy));
});

test('an alias-only token still resolves through the alias branch', { skip: shouldSkip && skipReason }, async () => {
  await warmConnection();
  // M32LIA2 is a registry alias that is NOT the canonical model, so only the
  // alias branch can match it.
  const result = await realStore().getBestStoredEvidence({
    brand: 'VIZIO',
    model: 'M32li-A2',
    modelIdentity: { canonicalModel: 'M32li-A2', searchModels: ['M32li-A2'] },
  });

  assert.equal(result.hit, true);
  assert.equal(result.bundle.product.matchedBy, 'alias');
  assert.equal(result.bundle.product.canonicalModel, 'M321i-A2');
  assert.equal(result.bundle.product.matchedAliasType, 'transcription_variant');
});

test('a product with lifecycle claims returns a usable window and sources', { skip: shouldSkip && skipReason }, async () => {
  await warmConnection();
  const result = await realStore().getBestStoredEvidence({
    brand: 'VIZIO', model: 'M321i-A2', modelIdentity: identityFor('M321i-A2', 'VIZIO', 'television'),
  });

  assert.equal(result.hit, true);
  assert.equal(result.bundle.lifecycle.start, 2013);
  assert.equal(result.bundle.lifecycle.end, 2014);
  assert.equal(result.bundle.introductionYear, 2013);
  assert.equal(result.bundle.conflict, false);
  assert.equal(result.bundle.freshness, 'fresh');

  const withSources = result.bundle.claims.find((claim) => claim.sources.length > 0);
  assert.ok(withSources, 'seeded VIZIO claims must carry provenance');
  assert.ok(withSources.sources.every((source) => source.url.startsWith('https://')));
});

test('an unknown model is a clean miss', { skip: shouldSkip && skipReason }, async () => {
  await warmConnection();
  const result = await realStore().getBestStoredEvidence({
    brand: 'Whirlpool', model: 'ZZZZ999999', modelIdentity: identityFor('ZZZZ999999'),
  });
  assert.equal(result.hit, false);
  assert.equal(result.available, true, 'a miss is not an availability failure');
  assert.equal(result.failureCode, null);
  assert.equal(result.ambiguous, false);
});

test('a brand mismatch prevents a cross-brand match', { skip: shouldSkip && skipReason }, async () => {
  await warmConnection();
  // The model exists under Whirlpool; asking for it under LG must not resolve.
  const result = await realStore().getBestStoredEvidence({
    brand: 'LG', model: 'WED4850HW0', modelIdentity: identityFor('WED4850HW0', 'LG'),
  });
  assert.equal(result.hit, false);
});

test('an ambiguous token yields NO product and fails safe', { skip: shouldSkip && skipReason }, async () => {
  await warmConnection();
  const sql = realClient();
  // Two distinct products in one brand, where the second claims the first's
  // model string as a verified alias. A LIMIT 1 query would silently pick a
  // winner here; the adapter must refuse instead.
  await sql`
    INSERT INTO products (brand, brand_key, canonical_model, normalized_model, identity_kind)
    VALUES (${RUN_ID}, ${RUN_ID}, 'AMBIGMODELA', 'AMBIGMODELA', 'exact_model'),
           (${RUN_ID}, ${RUN_ID}, 'AMBIGMODELB', 'AMBIGMODELB', 'exact_model')
    ON CONFLICT DO NOTHING
  `;
  await sql`
    INSERT INTO product_aliases (product_id, brand_key, alias, normalized_alias, alias_type, is_verified, source)
    SELECT id, ${RUN_ID}, 'AMBIGMODELA', 'AMBIGMODELA', 'manufacturer_alias', true, ${RUN_ID}
      FROM products
     WHERE brand_key = ${RUN_ID} AND normalized_model = 'AMBIGMODELB'
    ON CONFLICT DO NOTHING
  `;

  const result = await realStore().getBestStoredEvidence({
    brand: RUN_ID,
    model: 'AMBIGMODELA',
    modelIdentity: { canonicalModel: 'AMBIGMODELA', searchModels: ['AMBIGMODELA'] },
  });

  assert.equal(result.ambiguous, true);
  assert.equal(result.hit, false);
  assert.equal(result.bundle, null, 'an ambiguous identity must produce no product at all');
  assert.equal(result.failureCode, STORE_FAILURE_CODES.AMBIGUOUS_IDENTITY);
});

test('a retired alias is inert', { skip: shouldSkip && skipReason }, async () => {
  await warmConnection();
  const sql = realClient();
  await sql`
    INSERT INTO product_aliases (product_id, brand_key, alias, normalized_alias, alias_type, is_verified, is_retired, retired_reason, source)
    SELECT id, 'whirlpool', ${RETIRED_TOKEN}, ${RETIRED_TOKEN}, 'manufacturer_alias', true, true, 'test retirement', ${RUN_ID}
      FROM products
     WHERE brand_key = 'whirlpool' AND normalized_model = 'WED4850HW0'
    ON CONFLICT (brand_key, normalized_alias) DO NOTHING
  `;

  const result = await realStore().getBestStoredEvidence({
    brand: 'Whirlpool',
    model: RETIRED_TOKEN,
    modelIdentity: { canonicalModel: RETIRED_TOKEN, searchModels: [RETIRED_TOKEN] },
  });
  assert.equal(result.hit, false, 'a retired alias must never match');
});

test('an unverified alias is inert', { skip: shouldSkip && skipReason }, async () => {
  await warmConnection();
  const sql = realClient();
  await sql`
    INSERT INTO product_aliases (product_id, brand_key, alias, normalized_alias, alias_type, is_verified, source)
    SELECT id, 'whirlpool', ${UNVERIFIED_TOKEN}, ${UNVERIFIED_TOKEN}, 'manufacturer_alias', false, ${RUN_ID}
      FROM products
     WHERE brand_key = 'whirlpool' AND normalized_model = 'WED4850HW0'
    ON CONFLICT (brand_key, normalized_alias) DO NOTHING
  `;

  const result = await realStore().getBestStoredEvidence({
    brand: 'Whirlpool',
    model: UNVERIFIED_TOKEN,
    modelIdentity: { canonicalModel: UNVERIFIED_TOKEN, searchModels: [UNVERIFIED_TOKEN] },
  });
  assert.equal(result.hit, false, 'an unverified alias must never match');
});

test('a family-type alias cannot satisfy an exact-model lookup', { skip: shouldSkip && skipReason }, async () => {
  await warmConnection();
  const sql = realClient();
  await sql`
    INSERT INTO product_aliases (product_id, brand_key, alias, normalized_alias, alias_type, is_verified, source)
    SELECT id, 'whirlpool', ${FAMILY_TOKEN}, ${FAMILY_TOKEN}, 'family_alias', true, ${RUN_ID}
      FROM products
     WHERE brand_key = 'whirlpool' AND normalized_model = 'WED4850HW0'
    ON CONFLICT (brand_key, normalized_alias) DO NOTHING
  `;

  const result = await realStore().getBestStoredEvidence({
    brand: 'Whirlpool',
    model: FAMILY_TOKEN,
    modelIdentity: { canonicalModel: FAMILY_TOKEN, searchModels: [FAMILY_TOKEN] },
  });
  assert.equal(result.hit, false, 'family_alias is not an identity-bearing alias type');
});
