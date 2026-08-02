/**
 * REAL PostgreSQL schema and constraint tests.
 *
 * These run against an actual database and actually execute the checked-in
 * migrations. Mocked JavaScript tests cannot prove that a CHECK constraint
 * rejects a malformed row, that a partial index exists, or that the DDL is
 * even valid — and the schema is the foundation of the rest of Phase 3.
 *
 * Requires MODEL_EVIDENCE_TEST_DB_URL. Skipped (not failed) when absent, so
 * `npm test` stays offline-safe:
 *
 *   docker run -d --name dmi-evidence-test \
 *     -e POSTGRES_PASSWORD=testpw -e POSTGRES_USER=testuser \
 *     -e POSTGRES_DB=evidence_test -p 55432:5432 postgres:16-alpine
 *
 *   MODEL_EVIDENCE_TEST_DB_URL=postgres://testuser:testpw@localhost:55432/evidence_test \
 *     npm run test:evidence-store
 *
 * Every test runs inside a transaction that is always rolled back, so the
 * suite never mutates the seeded database.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

import { applySqlDirectory, verifySchema } from '../../scripts/model-evidence-store-migrate.mjs';

const TEST_DB_URL = String(process.env.MODEL_EVIDENCE_TEST_DB_URL || '').trim();
const shouldSkip = !TEST_DB_URL;
const skipReason = 'MODEL_EVIDENCE_TEST_DB_URL is not set; real-Postgres schema tests skipped';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..', '..');

const ROLLBACK = '__test_rollback__';

let sql = null;

function client() {
  if (!sql) {
    sql = postgres(TEST_DB_URL, { max: 1, prepare: false, fetch_types: false, onnotice: () => {} });
  }
  return sql;
}

/**
 * Run `fn` in a transaction that is always rolled back.
 * Returns the database error when `fn` violated a constraint, or null when it
 * completed successfully.
 */
async function attempt(fn) {
  try {
    await client().begin(async (tx) => {
      await fn(tx);
      throw new Error(ROLLBACK);
    });
    return null;
  } catch (error) {
    if (error?.message === ROLLBACK) return null;
    return error;
  }
}

/** Assert the statement was rejected, optionally by a named constraint. */
async function expectRejected(fn, constraintName) {
  const error = await attempt(fn);
  assert.ok(error, `expected a constraint violation but the row was accepted (${constraintName || 'any'})`);
  if (constraintName) {
    const actual = error.constraint_name || error.constraint || error.message;
    assert.ok(
      String(actual).includes(constraintName),
      `expected violation of ${constraintName}, got ${actual}`,
    );
  }
  return error;
}

/** Assert the statement was accepted (then rolled back). */
async function expectAccepted(fn) {
  const error = await attempt(fn);
  assert.equal(error, null, `expected the row to be accepted, got ${error?.message}`);
}

/** Insert a valid product inside `tx` and return its id. */
async function insertProduct(tx, overrides = {}) {
  const row = {
    brand: 'Whirlpool',
    brand_key: 'whirlpool',
    canonical_model: 'TESTMODEL1',
    normalized_model: 'TESTMODEL1',
    identity_kind: 'exact_model',
    ...overrides,
  };
  const [inserted] = await tx`
    INSERT INTO products ${tx(row)} RETURNING id
  `;
  return inserted.id;
}

test.after(async () => {
  if (sql) await sql.end({ timeout: 5 }).catch(() => {});
});

// ---------------------------------------------------------------------------
// Migrations actually execute
// ---------------------------------------------------------------------------

test('migrations apply cleanly and are idempotent', { skip: shouldSkip && skipReason }, async () => {
  const directory = path.join(REPO_ROOT, 'db', 'migrations');
  const silent = { log() {} };

  const first = await applySqlDirectory(client(), directory, silent);
  assert.deepEqual(first, [
    '0001_model_evidence_store.sql',
    '0002_model_evidence_indexes.sql',
    '0003_model_evidence_roles_rls.sql',
  ]);

  // Re-running must not throw: a partially applied migration is a normal
  // recovery scenario and must be safe to retry.
  const second = await applySqlDirectory(client(), directory, silent);
  assert.deepEqual(second, first);
});

test('the seed applies and is idempotent', { skip: shouldSkip && skipReason }, async () => {
  const directory = path.join(REPO_ROOT, 'db', 'seed');
  const silent = { log() {} };
  await applySqlDirectory(client(), directory, silent);
  const [before] = await client()`SELECT count(*)::int AS n FROM products`;
  await applySqlDirectory(client(), directory, silent);
  const [after] = await client()`SELECT count(*)::int AS n FROM products`;
  assert.equal(after.n, before.n, 'the seed must not duplicate rows on re-run');
});

test('every expected table, index and RLS setting exists', { skip: shouldSkip && skipReason }, async () => {
  const report = await verifySchema(client());

  assert.deepEqual(report.tables.sort(), [
    'claim_sources', 'evidence_claims', 'evidence_sources', 'product_aliases', 'products',
  ]);

  for (const index of [
    'products_identity_uq',
    'products_public_id_uq',
    'products_family_idx',
    'products_model_only_idx',
    'product_aliases_identity_uq',
    'product_aliases_active_idx',
    'product_aliases_product_idx',
    'evidence_claims_active_idx',
    'evidence_claims_revalidate_idx',
    'evidence_claims_superseded_by_idx',
    'evidence_claims_conflict_scan_idx',
    'evidence_sources_url_hash_uq',
    'evidence_sources_domain_idx',
    'claim_sources_source_idx',
  ]) {
    assert.ok(report.indexes.includes(index), `missing index ${index}`);
  }

  // Default-deny is the whole point of enabling RLS on a server-only store.
  for (const entry of report.rls) {
    assert.equal(entry.enabled, true, `RLS not enabled on ${entry.table}`);
    assert.equal(entry.forced, true, `RLS not forced on ${entry.table}`);
  }

  const [policies] = await client()`
    SELECT count(*)::int AS n FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('products','product_aliases','evidence_claims','evidence_sources','claim_sources')
  `;
  assert.equal(policies.n, 0, 'RLS must have zero policies (default deny)');
});

test('the Phase 3B role holds SELECT only and no write grants', { skip: shouldSkip && skipReason }, async () => {
  const grants = await client()`
    SELECT table_name, privilege_type
      FROM information_schema.role_table_grants
     WHERE grantee = 'model_evidence_reader'
       AND table_name IN ('products','product_aliases','evidence_claims','evidence_sources','claim_sources')
  `;
  assert.ok(grants.length >= 5, 'reader role should hold grants on all five tables');
  const privileges = new Set(grants.map((row) => row.privilege_type));
  assert.deepEqual([...privileges], ['SELECT'],
    'Phase 3B is read-only: the reader role must hold no INSERT/UPDATE/DELETE');
});

// ---------------------------------------------------------------------------
// products constraints
// ---------------------------------------------------------------------------

test('products rejects un-normalized brand and model values', { skip: shouldSkip && skipReason }, async () => {
  // Normalization lives in JavaScript. These constraints only assert that the
  // application normalized correctly; they can reject but never transform.
  await expectRejected(
    (tx) => insertProduct(tx, { brand_key: 'Whirlpool' }),
    'products_brand_key_normalized',
  );
  await expectRejected(
    (tx) => insertProduct(tx, { brand_key: 'whirl pool' }),
    'products_brand_key_normalized',
  );
  await expectRejected(
    (tx) => insertProduct(tx, { normalized_model: 'wed4850hw0' }),
    'products_model_normalized',
  );
  await expectRejected(
    (tx) => insertProduct(tx, { normalized_model: 'WED-4850' }),
    'products_model_normalized',
  );
});

test('products enforces the identity uniqueness triple', { skip: shouldSkip && skipReason }, async () => {
  const error = await expectRejected(async (tx) => {
    await insertProduct(tx, { normalized_model: 'DUPMODEL1', canonical_model: 'DUPMODEL1' });
    await insertProduct(tx, { normalized_model: 'DUPMODEL1', canonical_model: 'DUPMODEL1' });
  });
  assert.equal(error.code, '23505', 'expected a unique violation');

  // The same token under a different tier is a DIFFERENT identity and is legal:
  // this is what lets WED4850H exist as both a family and (hypothetically) an
  // exact model without collision.
  await expectAccepted(async (tx) => {
    await insertProduct(tx, { normalized_model: 'TIERTEST1', identity_kind: 'exact_model' });
    await insertProduct(tx, { normalized_model: 'TIERTEST1', identity_kind: 'model_family' });
  });
});

test('products rejects a self-referencing family and a short model', { skip: shouldSkip && skipReason }, async () => {
  await expectRejected(async (tx) => {
    const id = await insertProduct(tx);
    await tx`UPDATE products SET family_product_id = ${id} WHERE id = ${id}`;
  }, 'products_no_self_family');

  await expectRejected(
    (tx) => insertProduct(tx, { normalized_model: 'AB', canonical_model: 'AB' }),
    'products_normalized_model_len',
  );
});

// ---------------------------------------------------------------------------
// product_aliases constraints — the alias-poisoning controls
// ---------------------------------------------------------------------------

test('aliases below MIN_EXACT_TOKEN_LENGTH cannot be stored', { skip: shouldSkip && skipReason }, async () => {
  await expectRejected(async (tx) => {
    const productId = await insertProduct(tx);
    await tx`
      INSERT INTO product_aliases (product_id, brand_key, alias, normalized_alias, alias_type, source)
      VALUES (${productId}, 'whirlpool', 'WED48', 'WED48', 'manufacturer_alias', 'test')
    `;
  }, 'product_aliases_min_length');
});

test('one alias token cannot be claimed by two products in a brand', { skip: shouldSkip && skipReason }, async () => {
  const error = await expectRejected(async (tx) => {
    const first = await insertProduct(tx, { normalized_model: 'FIRSTMODEL', canonical_model: 'FIRSTMODEL' });
    const second = await insertProduct(tx, { normalized_model: 'SECONDMODEL', canonical_model: 'SECONDMODEL' });
    await tx`
      INSERT INTO product_aliases (product_id, brand_key, alias, normalized_alias, alias_type, source)
      VALUES (${first}, 'whirlpool', 'SHAREDALIAS', 'SHAREDALIAS', 'manufacturer_alias', 'test')
    `;
    await tx`
      INSERT INTO product_aliases (product_id, brand_key, alias, normalized_alias, alias_type, source)
      VALUES (${second}, 'whirlpool', 'SHAREDALIAS', 'SHAREDALIAS', 'manufacturer_alias', 'test')
    `;
  });
  assert.equal(error.code, '23505', 'brand-scoped alias uniqueness must be enforced by the database');
});

test('the same alias token is allowed under a different brand', { skip: shouldSkip && skipReason }, async () => {
  // Aliases are brand-scoped, matching matchExactModelEvidence(), so two
  // manufacturers may legitimately use the same string.
  await expectAccepted(async (tx) => {
    const whirlpool = await insertProduct(tx, { normalized_model: 'BRANDTESTA', canonical_model: 'BRANDTESTA' });
    const lg = await insertProduct(tx, {
      brand: 'LG', brand_key: 'lg', normalized_model: 'BRANDTESTB', canonical_model: 'BRANDTESTB',
    });
    await tx`
      INSERT INTO product_aliases (product_id, brand_key, alias, normalized_alias, alias_type, source)
      VALUES (${whirlpool}, 'whirlpool', 'CROSSBRAND', 'CROSSBRAND', 'manufacturer_alias', 'test')
    `;
    await tx`
      INSERT INTO product_aliases (product_id, brand_key, alias, normalized_alias, alias_type, source)
      VALUES (${lg}, 'lg', 'CROSSBRAND', 'CROSSBRAND', 'manufacturer_alias', 'test')
    `;
  });
});

test('a user-observed variant can never be marked verified', { skip: shouldSkip && skipReason }, async () => {
  await expectRejected(async (tx) => {
    const productId = await insertProduct(tx);
    await tx`
      INSERT INTO product_aliases (product_id, brand_key, alias, normalized_alias, alias_type, is_verified, source)
      VALUES (${productId}, 'whirlpool', 'TYPOALIAS1', 'TYPOALIAS1', 'user_observed_variant', true, 'test')
    `;
  }, 'product_aliases_user_observed_never_verified');
});

test('retirement requires a reason, and is an update rather than a delete', { skip: shouldSkip && skipReason }, async () => {
  await expectRejected(async (tx) => {
    const productId = await insertProduct(tx);
    await tx`
      INSERT INTO product_aliases (product_id, brand_key, alias, normalized_alias, alias_type, is_retired, source)
      VALUES (${productId}, 'whirlpool', 'RETIREDONE', 'RETIREDONE', 'manufacturer_alias', true, 'test')
    `;
  }, 'product_aliases_retired_has_reason');

  await expectAccepted(async (tx) => {
    const productId = await insertProduct(tx);
    await tx`
      INSERT INTO product_aliases (product_id, brand_key, alias, normalized_alias, alias_type, is_retired, retired_reason, source)
      VALUES (${productId}, 'whirlpool', 'RETIREDTWO', 'RETIREDTWO', 'manufacturer_alias', true, 'superseded by verified label variant', 'test')
    `;
  });
});

// ---------------------------------------------------------------------------
// evidence_claims constraints — the claim_shape guarantee
// ---------------------------------------------------------------------------

test('a lifecycle claim without a year cannot be stored', { skip: shouldSkip && skipReason }, async () => {
  // This is the constraint that makes a malformed extraction unstorable.
  await expectRejected(async (tx) => {
    const productId = await insertProduct(tx);
    await tx`
      INSERT INTO evidence_claims (product_id, claim_type, identity_match, evidence_quality, claim_confidence, basis)
      VALUES (${productId}, 'production_start', 'exact', 'strong', 'high', 'test')
    `;
  }, 'evidence_claims_shape');
});

test('a point claim cannot smuggle a year into claim_value or start_year', { skip: shouldSkip && skipReason }, async () => {
  await expectRejected(async (tx) => {
    const productId = await insertProduct(tx);
    await tx`
      INSERT INTO evidence_claims (product_id, claim_type, claim_value, identity_match, evidence_quality, claim_confidence, basis)
      VALUES (${productId}, 'production_start', '2019', 'exact', 'strong', 'high', 'test')
    `;
  }, 'evidence_claims_shape');

  await expectRejected(async (tx) => {
    const productId = await insertProduct(tx);
    await tx`
      INSERT INTO evidence_claims (product_id, claim_type, point_year, start_year, identity_match, evidence_quality, claim_confidence, basis)
      VALUES (${productId}, 'production_start', 2019, 2019, 'exact', 'strong', 'high', 'test')
    `;
  }, 'evidence_claims_shape');
});

test('a range claim rejects an inverted or year-less window', { skip: shouldSkip && skipReason }, async () => {
  await expectRejected(async (tx) => {
    const productId = await insertProduct(tx);
    await tx`
      INSERT INTO evidence_claims (product_id, claim_type, start_year, end_year, identity_match, evidence_quality, claim_confidence, basis)
      VALUES (${productId}, 'production_range', 2022, 2019, 'exact', 'strong', 'high', 'test')
    `;
  }, 'evidence_claims_range_ordered');

  await expectRejected(async (tx) => {
    const productId = await insertProduct(tx);
    await tx`
      INSERT INTO evidence_claims (product_id, claim_type, end_year, identity_match, evidence_quality, claim_confidence, basis)
      VALUES (${productId}, 'production_range', 2019, 'exact', 'strong', 'high', 'test')
    `;
  }, 'evidence_claims_shape');
});

test('claim years outside 1900-2100 are rejected', { skip: shouldSkip && skipReason }, async () => {
  await expectRejected(async (tx) => {
    const productId = await insertProduct(tx);
    await tx`
      INSERT INTO evidence_claims (product_id, claim_type, point_year, identity_match, evidence_quality, claim_confidence, basis)
      VALUES (${productId}, 'production_start', 1492, 'exact', 'strong', 'high', 'test')
    `;
  }, 'evidence_claims_year_bounds');
});

test('supersession bookkeeping cannot drift out of sync with status', { skip: shouldSkip && skipReason }, async () => {
  await expectRejected(async (tx) => {
    const productId = await insertProduct(tx);
    await tx`
      INSERT INTO evidence_claims (product_id, claim_type, point_year, status, identity_match, evidence_quality, claim_confidence, basis)
      VALUES (${productId}, 'production_start', 2019, 'superseded', 'exact', 'strong', 'high', 'test')
    `;
  }, 'evidence_claims_superseded_consistent');

  // Two conflicting ACTIVE claims are legal and must stay legal: preserving
  // disagreement rather than resolving it by last-write-wins is a core
  // requirement of the design.
  await expectAccepted(async (tx) => {
    const productId = await insertProduct(tx);
    await tx`
      INSERT INTO evidence_claims (product_id, claim_type, point_year, identity_match, evidence_quality, claim_confidence, basis)
      VALUES (${productId}, 'production_start', 2019, 'exact', 'conflicting', 'medium', 'test'),
             (${productId}, 'production_start', 2020, 'exact', 'conflicting', 'medium', 'test')
    `;
  });
});

// ---------------------------------------------------------------------------
// evidence_sources / claim_sources constraints
// ---------------------------------------------------------------------------

test('non-https and over-long source URLs are rejected', { skip: shouldSkip && skipReason }, async () => {
  const hash = 'a'.repeat(64);
  await expectRejected((tx) => tx`
    INSERT INTO evidence_sources (url, url_hash, domain, source_type, source_quality)
    VALUES ('http://example.com/spec', ${hash}, 'example.com', 'manufacturer', 'primary')
  `, 'evidence_sources_url_https');

  await expectRejected((tx) => tx`
    INSERT INTO evidence_sources (url, url_hash, domain, source_type, source_quality)
    VALUES (${`https://example.com/${'x'.repeat(2100)}`}, ${hash}, 'example.com', 'manufacturer', 'primary')
  `, 'evidence_sources_url_len');
});

test('source URLs are deduplicated globally by hash', { skip: shouldSkip && skipReason }, async () => {
  const hash = 'b'.repeat(64);
  const error = await expectRejected(async (tx) => {
    await tx`
      INSERT INTO evidence_sources (url, url_hash, domain, source_type, source_quality)
      VALUES ('https://example.com/a', ${hash}, 'example.com', 'manufacturer', 'primary')
    `;
    await tx`
      INSERT INTO evidence_sources (url, url_hash, domain, source_type, source_quality)
      VALUES ('https://example.com/b', ${hash}, 'example.com', 'retailer', 'secondary')
    `;
  });
  assert.equal(error.code, '23505');
});

test('stored source text is bounded', { skip: shouldSkip && skipReason }, async () => {
  await expectRejected((tx) => tx`
    INSERT INTO evidence_sources (url, url_hash, domain, source_type, source_quality, title)
    VALUES ('https://example.com/t', ${'c'.repeat(64)}, 'example.com', 'manufacturer', 'primary', ${'t'.repeat(301)})
  `, 'evidence_sources_title_len');

  await expectRejected(async (tx) => {
    const productId = await insertProduct(tx);
    const [claim] = await tx`
      INSERT INTO evidence_claims (product_id, claim_type, point_year, identity_match, evidence_quality, claim_confidence, basis)
      VALUES (${productId}, 'production_start', 2019, 'exact', 'strong', 'high', 'test')
      RETURNING id
    `;
    const [source] = await tx`
      INSERT INTO evidence_sources (url, url_hash, domain, source_type, source_quality)
      VALUES ('https://example.com/fact', ${'d'.repeat(64)}, 'example.com', 'manufacturer', 'primary')
      RETURNING id
    `;
    await tx`
      INSERT INTO claim_sources (claim_id, source_id, normalized_fact, provider)
      VALUES (${claim.id}, ${source.id}, ${'f'.repeat(401)}, 'seed')
    `;
  }, 'claim_sources_fact_len');
});

test('a source cannot be deleted while claims still cite it', { skip: shouldSkip && skipReason }, async () => {
  const error = await expectRejected(async (tx) => {
    const productId = await insertProduct(tx);
    const [claim] = await tx`
      INSERT INTO evidence_claims (product_id, claim_type, point_year, identity_match, evidence_quality, claim_confidence, basis)
      VALUES (${productId}, 'production_start', 2019, 'exact', 'strong', 'high', 'test')
      RETURNING id
    `;
    const [source] = await tx`
      INSERT INTO evidence_sources (url, url_hash, domain, source_type, source_quality)
      VALUES ('https://example.com/restrict', ${'e'.repeat(64)}, 'example.com', 'manufacturer', 'primary')
      RETURNING id
    `;
    await tx`
      INSERT INTO claim_sources (claim_id, source_id, normalized_fact, provider)
      VALUES (${claim.id}, ${source.id}, 'supporting fact', 'seed')
    `;
    await tx`DELETE FROM evidence_sources WHERE id = ${source.id}`;
  });
  assert.equal(error.code, '23503', 'ON DELETE RESTRICT must protect cited sources');
});

test('deleting a product cascades to its aliases and claims', { skip: shouldSkip && skipReason }, async () => {
  await expectAccepted(async (tx) => {
    const productId = await insertProduct(tx, { normalized_model: 'CASCADETEST', canonical_model: 'CASCADETEST' });
    await tx`
      INSERT INTO product_aliases (product_id, brand_key, alias, normalized_alias, alias_type, source)
      VALUES (${productId}, 'whirlpool', 'CASCADEALIAS', 'CASCADEALIAS', 'manufacturer_alias', 'test')
    `;
    await tx`
      INSERT INTO evidence_claims (product_id, claim_type, point_year, identity_match, evidence_quality, claim_confidence, basis)
      VALUES (${productId}, 'production_start', 2019, 'exact', 'strong', 'high', 'test')
    `;
    await tx`DELETE FROM products WHERE id = ${productId}`;

    const [aliases] = await tx`SELECT count(*)::int AS n FROM product_aliases WHERE product_id = ${productId}`;
    const [claims] = await tx`SELECT count(*)::int AS n FROM evidence_claims WHERE product_id = ${productId}`;
    assert.equal(aliases.n, 0);
    assert.equal(claims.n, 0);
  });
});

// ---------------------------------------------------------------------------
// The seeded data is queryable in the shape the adapter expects
// ---------------------------------------------------------------------------

test('the seeded Whirlpool alias resolves to the canonical product', { skip: shouldSkip && skipReason }, async () => {
  const rows = await client()`
    SELECT p.canonical_model, a.alias_type::text AS alias_type, a.equivalence_reason
      FROM product_aliases a
      JOIN products p ON p.id = a.product_id
     WHERE a.brand_key = 'whirlpool' AND a.normalized_alias = 'WED4850HWO'
       AND a.is_verified AND NOT a.is_retired
  `;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].canonical_model, 'WED4850HW0');
  assert.equal(rows[0].alias_type, 'transcription_variant');
  assert.equal(rows[0].equivalence_reason, 'terminal-o-zero-transcription');
});

test('the seeded VIZIO product carries cited sources on both claims', { skip: shouldSkip && skipReason }, async () => {
  const rows = await client()`
    SELECT c.claim_type::text AS claim_type, count(cs.source_id)::int AS source_count
      FROM evidence_claims c
      JOIN products p ON p.id = c.product_id
      LEFT JOIN claim_sources cs ON cs.claim_id = c.id
     WHERE p.brand_key = 'vizio' AND p.normalized_model = 'M321IA2'
     GROUP BY c.claim_type
     ORDER BY c.claim_type
  `;
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.source_count, 2, `${row.claim_type} should cite both registry sources`);
  }
});

test('the seeded Whirlpool WED4850HW0 has identity but no lifecycle claim', { skip: shouldSkip && skipReason }, async () => {
  // Deliberate: the repository holds no lifecycle years for this model, so
  // none were invented. This is also the "product known, evidence absent"
  // shadow-comparison case.
  const [row] = await client()`
    SELECT p.identity_kind::text AS identity_kind,
           (SELECT count(*)::int FROM evidence_claims c WHERE c.product_id = p.id) AS claim_count,
           f.normalized_model AS family_model
      FROM products p
      LEFT JOIN products f ON f.id = p.family_product_id
     WHERE p.brand_key = 'whirlpool' AND p.normalized_model = 'WED4850HW0'
  `;
  assert.equal(row.identity_kind, 'exact_model');
  assert.equal(row.claim_count, 0);
  assert.equal(row.family_model, 'WED4850H', 'the exact model must link to its family row');
});
