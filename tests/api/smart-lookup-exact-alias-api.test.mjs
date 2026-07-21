import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgeLookupHandler } from '../../api/age-lookup.js';

function req(query, extra = {}) { return { method: 'POST', body: { query, ...extra }, headers: { 'x-forwarded-for': '127.0.0.1' }, socket: {} }; }
function res() {
  return { statusCode: 0, payload: null, status() { return this; }, json(payload) { this.payload = payload; return this; }, setHeader() {} };
}
const redisMiss = { get: async () => null, set: async () => {}, eval: async () => [1, 1, 1], incrby: async (_k, a) => a, expire: async () => 1 };

async function lookup(query, options = {}) {
  let providerCalls = 0;
  const lines = [];
  const handler = createAgeLookupHandler({
    redisFactory: () => redisMiss,
    providerLookup: async () => { providerCalls += 1; return { brand: 'Provider', model: 'PROVIDED', specificityLevel: 'specific' }; },
    groundedProviderLookup: async () => { providerCalls += 1; return {}; },
    logger: { info: (line) => lines.push(JSON.parse(line)) },
    ...options,
  });
  const out = res();
  await handler(req(query), out);
  return { payload: out.payload, providerCalls, log: lines.at(-1) };
}

test('a verified exact alias returns a full local exact-model result with no provider call', async () => {
  const { payload, providerCalls } = await lookup('GFW850SPN0DG');
  assert.equal(providerCalls, 0);
  assert.equal(payload.brand, 'GE');
  assert.equal(payload.category || payload.itemCategory, 'washer');
  assert.equal(payload.enteredModel, 'GFW850SPN0DG');
  assert.equal(payload.canonicalModel, 'GFW850SPNDG');
  assert.equal(payload.matchedBy, 'exact-alias');
  assert.equal(payload.querySpecificity, 'exact-model');
  assert.equal(payload.source, 'local-db');
  assert.equal(payload.evidenceSource, 'local-db');
  assert.equal(payload.yearRange, '2019-2021');
  assert.equal(payload.localEvidenceHit, true);
});

test('the canonical model produces the same evidence, matched as canonical-model', async () => {
  const { payload, providerCalls } = await lookup('GFW850SPNDG');
  assert.equal(providerCalls, 0);
  assert.equal(payload.matchedBy, 'canonical-model');
  assert.equal(payload.canonicalModel, 'GFW850SPNDG');
  assert.equal(payload.yearRange, '2019-2021');
});

test('a local exact result never claims an individual manufacture year', async () => {
  const { payload } = await lookup('GFW850SPN0DG');
  assert.equal(payload.individualManufactureYear ?? null, null);
  assert.equal(payload.estimatedYearType !== 'individual-manufacture', true);
  assert.equal(payload.fallbackKind, 'none');
  assert.equal(payload.errorCode ?? null, null);
});

test('a conflicting brand is disclosed, never silently corrected, and costs no provider call', async () => {
  const { payload, providerCalls } = await lookup('Samsung GFW850SPN0DG');
  assert.equal(providerCalls, 0, 'a contradictory identity must not be researched');
  assert.equal(payload.brand, 'Samsung', 'the entered brand is preserved');
  assert.equal(payload.evidenceConflict, true);
  assert.equal(payload.evidenceConflictKind, 'brand');
  assert.equal(payload.localEvidenceHit, false);
  // No confident exact result for a contradictory identity.
  assert.equal(payload.yearRange ?? null, null);
  assert.equal(payload.individualManufactureYear ?? null, null);
});

test('a conflicting category is disclosed rather than silently reclassified', async () => {
  const { payload } = await lookup('GE refrigerator GFW850SPN0DG');
  assert.equal(payload.evidenceConflict, true);
  assert.equal(payload.evidenceConflictKind, 'category');
  assert.equal(payload.refinementNeeded, true);
});

test('a near match produces no false exact evidence', async () => {
  const { payload } = await lookup('GFW850SPNXDG');
  assert.notEqual(payload.source, 'local-db');
  assert.equal(payload.canonicalModel ?? null, null);
});

test('telemetry reports the exact-model local hit without leaking raw identifiers', async () => {
  const { log } = await lookup('GFW850SPN0DG');
  assert.equal(log.identityLevel, 'exact-model');
  assert.equal(log.localEvidenceHit, true);
  assert.equal(log.providerEligible, false);
  assert.equal(log.providerAttempted, false);
  const serialized = JSON.stringify(log);
  for (const secret of ['GFW850SPN0DG', 'GFW850SPNDG', 'gfw850spn0dg']) {
    assert.ok(!serialized.includes(secret), `telemetry leaked ${secret}`);
  }
});

test('the Q60R record and progressive model lines are unaffected', async () => {
  const q60 = await lookup('QN65Q60RAFXZA');
  assert.equal(q60.providerCalls, 0);
  assert.equal(q60.payload.source, 'local-db');
  assert.equal(q60.payload.yearRange, '2019-2020');

  const optiplex = await lookup('OptiPlex 9020');
  assert.equal(optiplex.payload.querySpecificity, 'model-line');
  assert.notEqual(optiplex.payload.source, 'local-db');
});

// ── Cache behavior (Phase 8) ────────────────────────────────────────────────
// Verified local evidence returns before buildSmartAgeCacheKey is reached, so
// an exact local hit never reads or writes the provider cache at all. That is
// why no cache policy version bump is needed: the semantic cache identity is
// unchanged, and the alias/canonical pair cannot create duplicate entries.

test('a verified local exact hit never reads or writes the provider cache', async () => {
  let reads = 0;
  let writes = 0;
  const spyRedis = {
    get: async () => { reads += 1; return null; },
    set: async () => { writes += 1; },
    eval: async () => [1, 1, 1], incrby: async (_k, a) => a, expire: async () => 1,
  };
  for (const query of ['GFW850SPN0DG', 'GFW850SPNDG']) {
    const { payload } = await lookup(query, { redisFactory: () => spyRedis });
    assert.equal(payload.source, 'local-db');
    assert.equal(payload.cacheStatus, 'bypass');
  }
  assert.equal(reads, 0, 'local evidence must resolve before any cache read');
  assert.equal(writes, 0, 'a local result is never written to the provider cache');
});

test('a conflicting brand result does not reuse the clean exact-model result', async () => {
  const clean = await lookup('GFW850SPN0DG');
  const conflicting = await lookup('Samsung GFW850SPN0DG');
  assert.equal(clean.payload.brand, 'GE');
  assert.equal(conflicting.payload.brand, 'Samsung');
  assert.notEqual(conflicting.payload.source, 'local-db');
  assert.equal(conflicting.payload.evidenceConflict, true);
  assert.notEqual(clean.payload.yearRange, conflicting.payload.yearRange ?? null);
});
