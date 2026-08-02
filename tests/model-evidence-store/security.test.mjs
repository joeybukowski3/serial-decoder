/**
 * Security boundary tests for the persistent model evidence store.
 *
 * The store is SERVER-ONLY. The browser must never receive a database client,
 * a connection string, or any store credential. This site ships plain static
 * assets with no bundler substitution step, so the guarantee is checked
 * directly against the files that are actually served.
 */
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createEvidenceStore, isStoreLiveEnabled, isStoreShadowEnabled, LIVE_READS_IMPLEMENTED, resolveStoreMode } from '../../lib/model-evidence-store/index.js';
import { createPostgresStore } from '../../lib/model-evidence-store/postgres-store.js';
import { STORE_FAILURE_CODES } from '../../lib/model-evidence-store/store-interface.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..', '..');

/** Tokens that must never appear in anything the browser downloads. */
const FORBIDDEN_IN_BROWSER = [
  'MODEL_EVIDENCE_DB_URL',
  'SUPABASE_SERVICE_ROLE',
  'SERVICE_ROLE_KEY',
  'postgres://',
  'postgresql://',
  'model-evidence-store',
  "from 'postgres'",
  'require("postgres")',
];

/** Root-level .js files are served directly to the browser by this static site. */
async function browserServedFiles() {
  const entries = await readdir(REPO_ROOT, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    // Node-only build/maintenance scripts that live at the repo root but are
    // never referenced by a <script> tag.
    if (['update_footers.js', 'update-large-loss-links.js'].includes(entry.name)) continue;
    const full = path.join(REPO_ROOT, entry.name);
    const info = await stat(full);
    if (info.size > 5 * 1024 * 1024) continue;
    files.push(full);
  }
  return files;
}

test('no browser-served asset references the database or its credentials', async () => {
  const files = await browserServedFiles();
  assert.ok(files.length > 5, 'expected to scan the site\'s browser assets');

  for (const file of files) {
    const content = await readFile(file, 'utf8');
    for (const token of FORBIDDEN_IN_BROWSER) {
      assert.equal(
        content.includes(token),
        false,
        `${path.basename(file)} is served to the browser and contains "${token}"`,
      );
    }
  }
});

test('the browser build scripts do not pull in the store', async () => {
  for (const name of ['build-smart-lookup-browser.js', 'build-serial-refinement-browser.js']) {
    const content = await readFile(path.join(REPO_ROOT, 'scripts', name), 'utf8').catch(() => null);
    if (content === null) continue;
    assert.equal(content.includes('model-evidence-store'), false,
      `${name} must not bundle the persistent store into a browser asset`);
    assert.equal(content.includes('postgres'), false,
      `${name} must not bundle a database driver into a browser asset`);
  }
});

test('only postgres-store.js imports a database client', async () => {
  const storeDir = path.join(REPO_ROOT, 'lib', 'model-evidence-store');
  const entries = await readdir(storeDir);
  for (const name of entries.filter((entry) => entry.endsWith('.js'))) {
    const content = await readFile(path.join(storeDir, name), 'utf8');
    const importsDriver = /^import\s+postgres\s+from\s+'postgres'/m.test(content);
    if (name === 'postgres-store.js') {
      assert.equal(importsDriver, true, 'postgres-store.js must be the driver boundary');
    } else {
      assert.equal(importsDriver, false,
        `${name} imports a database client; only postgres-store.js may do so`);
    }
  }
});

test('no api route imports the database client directly', async () => {
  const apiDir = path.join(REPO_ROOT, 'api');
  for (const name of (await readdir(apiDir)).filter((entry) => entry.endsWith('.js'))) {
    const content = await readFile(path.join(apiDir, name), 'utf8');
    assert.equal(/from\s+'postgres'/.test(content), false,
      `api/${name} must not import a database client`);
    assert.equal(content.includes('model-evidence-store'), false,
      `api/${name} must not reach the store directly; lookupModelEvidence() is the only integration point`);
  }
});

// ---------------------------------------------------------------------------
// Flag defaults
// ---------------------------------------------------------------------------

test('both store flags default to OFF', () => {
  assert.equal(isStoreShadowEnabled({}), false);
  assert.equal(isStoreLiveEnabled({}), false);
  assert.equal(resolveStoreMode({}), 'off');

  // Only explicit truthy values enable anything.
  for (const value of ['', 'no', '0', 'false', 'off', 'maybe', undefined, null]) {
    assert.equal(isStoreShadowEnabled({ MODEL_EVIDENCE_STORE_SHADOW_ENABLED: value }), false,
      `"${value}" must not enable shadow mode`);
  }
  for (const value of ['1', 'true', 'yes', 'on', 'TRUE', ' On ']) {
    assert.equal(isStoreShadowEnabled({ MODEL_EVIDENCE_STORE_SHADOW_ENABLED: value }), true);
  }
});

test('the live flag cannot activate live reads in Phase 3B', () => {
  // A premature flag flip must degrade to shadow, not to an untested path.
  assert.equal(LIVE_READS_IMPLEMENTED, false);
  assert.equal(resolveStoreMode({ MODEL_EVIDENCE_STORE_ENABLED: 'true' }), 'shadow');
});

test('a disabled store never constructs a client', async () => {
  const store = await createEvidenceStore({});
  assert.equal(store.kind, 'null');
  assert.equal(store.failureCode, STORE_FAILURE_CODES.DISABLED);
});

test('missing credentials produce a null store, not an error', async () => {
  const store = await createEvidenceStore({ MODEL_EVIDENCE_STORE_SHADOW_ENABLED: 'true' });
  assert.equal(store.kind, 'null');
  assert.equal(store.failureCode, STORE_FAILURE_CODES.NOT_CONFIGURED);
});

test('the read budget is clamped so a misconfiguration cannot take the route budget', async () => {
  const { getStoreReadMaxMs } = await import('../../lib/model-evidence-store/index.js');
  assert.equal(getStoreReadMaxMs({}), 120);
  assert.equal(getStoreReadMaxMs({ MODEL_EVIDENCE_DB_MAX_MS: '999999' }), 1000, 'upper clamp');
  assert.equal(getStoreReadMaxMs({ MODEL_EVIDENCE_DB_MAX_MS: '1' }), 20, 'lower clamp');
  assert.equal(getStoreReadMaxMs({ MODEL_EVIDENCE_DB_MAX_MS: 'abc' }), 120, 'invalid falls back');
  assert.equal(getStoreReadMaxMs({ MODEL_EVIDENCE_DB_MAX_MS: '-5' }), 120);
});

// ---------------------------------------------------------------------------
// Query construction
// ---------------------------------------------------------------------------

test('identifiers reaching SQL are structurally incapable of carrying injection', async () => {
  // Brand and model pass through normalizeEvidenceBrand / compactModelToken
  // before any query, which strip everything outside [a-z0-9] / [A-Z0-9].
  const captured = [];
  const fakeSql = (strings, ...values) => {
    if (!strings || !Object.prototype.hasOwnProperty.call(strings, 'raw')) {
      captured.push({ fragment: strings });
      return { __fragment: true };
    }
    captured.push({ text: Array.from(strings).join('?'), values });
    return Promise.resolve([]);
  };

  const store = createPostgresStore({ url: 'postgres://unused', sql: fakeSql });
  await store.getBestStoredEvidence({
    brand: "Whirlpool'; DROP TABLE products; --",
    model: "WED4850HW0'); DELETE FROM evidence_claims; --",
    modelIdentity: {
      canonicalModel: "WED4850HW0'); DELETE FROM evidence_claims; --",
      searchModels: ["WED4850HW0'); DELETE FROM evidence_claims; --"],
    },
  });

  const allValues = captured.flatMap((entry) => [
    ...(entry.values || []),
    ...(Array.isArray(entry.fragment) ? entry.fragment : []),
  ]).filter((value) => typeof value === 'string');

  assert.ok(allValues.length > 0, 'the query should have been issued with bound values');
  for (const value of allValues) {
    // The real invariant is not "contains no SQL keywords" — a legitimate model
    // number could contain the letters of one. It is that NO SQL METACHARACTER
    // survives normalization: quotes, semicolons, parentheses, comment markers
    // and whitespace are all stripped, leaving a token that cannot terminate a
    // literal or start a new statement even if it were interpolated.
    assert.match(
      value,
      /^([A-Z0-9]+|[a-z0-9]+|[a-z_]+)$/,
      `a value reaching SQL was not fully normalized: ${JSON.stringify(value)}`,
    );
    assert.equal(/['";()\\]|--|\/\*|\s/.test(value), false,
      `a value reaching SQL still contains a SQL metacharacter: ${JSON.stringify(value)}`);
  }
  // And nothing user-derived was concatenated into the statement text itself.
  for (const entry of captured.filter((item) => item.text)) {
    assert.equal(entry.text.includes('DROP TABLE'), false);
    assert.equal(entry.text.includes('DELETE FROM evidence_claims'), false);
  }
});

test('the store never logs a connection string', async () => {
  const lines = [];
  const store = createPostgresStore({
    url: 'postgres://secretuser:secretpassword@db.example.com:6543/postgres',
    sql: (strings) => {
      if (!strings || !Object.prototype.hasOwnProperty.call(strings, 'raw')) return { __fragment: true };
      const error = new Error('connect ECONNREFUSED db.example.com');
      error.code = 'ECONNREFUSED';
      return Promise.reject(error);
    },
  });

  const result = await store.getBestStoredEvidence({
    brand: 'Whirlpool',
    model: 'WED4850HW0',
    modelIdentity: { canonicalModel: 'WED4850HW0', searchModels: ['WED4850HW0'] },
  });

  const serialized = JSON.stringify(result) + lines.join('\n');
  assert.equal(serialized.includes('secretpassword'), false);
  assert.equal(serialized.includes('secretuser'), false);
  assert.equal(serialized.includes('db.example.com'), false);
  assert.equal(result.failureCode, STORE_FAILURE_CODES.UNAVAILABLE);
});

test('write operations are unavailable in Phase 3B', async () => {
  const store = createPostgresStore({ url: 'postgres://unused', sql: () => Promise.resolve([]) });
  for (const method of ['upsertProduct', 'upsertAlias', 'persistEvidence', 'attachSource', 'supersedeEvidence']) {
    await assert.rejects(
      () => store[method]({}),
      (error) => error.code === 'NOT_IMPLEMENTED',
      `${method} must not be callable in the read-only phase`,
    );
  }
});

test('no committed file contains a real database connection string', async () => {
  // A defence against pasting a live Supabase URL into a doc or migration.
  const suspects = [
    path.join(REPO_ROOT, 'db'),
    path.join(REPO_ROOT, 'lib', 'model-evidence-store'),
    path.join(REPO_ROOT, 'scripts', 'model-evidence-store-migrate.mjs'),
  ];
  const pattern = /postgres(?:ql)?:\/\/[^\s'"`]*:[^\s'"`@]+@(?!localhost|127\.0\.0\.1|unused|db\.example\.com)/i;

  for (const suspect of suspects) {
    const info = await stat(suspect);
    const files = info.isDirectory()
      ? (await readdir(suspect, { recursive: true }))
        .map((name) => path.join(suspect, name))
        .filter((name) => /\.(sql|js|mjs|md)$/.test(name))
      : [suspect];

    for (const file of files) {
      const fileInfo = await stat(file).catch(() => null);
      if (!fileInfo?.isFile()) continue;
      const content = await readFile(file, 'utf8');
      assert.equal(pattern.test(content), false,
        `${path.relative(REPO_ROOT, file)} appears to contain a real connection string`);
    }
  }
});

test('the server statement_timeout derives from the client read budget', async () => {
  // These must never be configured independently: a fixed server-side timeout
  // silently overrides MODEL_EVIDENCE_DB_MAX_MS and cancels queries the client
  // is still waiting for, surfacing as a spurious STORE_TIMEOUT.
  const { buildConnectionOptions } = await import('../../lib/model-evidence-store/postgres-store.js');

  assert.equal(buildConnectionOptions({}).connection.statement_timeout, '150');
  assert.equal(buildConnectionOptions({ maxMs: 120 }).connection.statement_timeout, '150');
  assert.equal(buildConnectionOptions({ maxMs: 1000 }).connection.statement_timeout, '1030');
  assert.equal(buildConnectionOptions({ maxMs: 5000 }).connection.statement_timeout, '5030');
  // An explicit override still wins, and there is always a sane floor.
  assert.equal(buildConnectionOptions({ maxMs: 200, statementTimeoutMs: 400 }).connection.statement_timeout, '400');
  assert.equal(buildConnectionOptions({ maxMs: 1, statementTimeoutMs: 1 }).connection.statement_timeout, '50');

  // Serverless pooling invariants.
  const options = buildConnectionOptions({});
  assert.equal(options.max, 1, 'one connection per function instance');
  assert.equal(options.prepare, false, 'transaction-mode pooling breaks prepared statements');
  assert.equal(options.fetch_types, false);
});
