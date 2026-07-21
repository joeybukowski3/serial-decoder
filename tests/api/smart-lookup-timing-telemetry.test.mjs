import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgeLookupHandler } from '../../api/age-lookup.js';

function req(query, extra = {}) { return { method: 'POST', body: { query, ...extra }, headers: { 'x-forwarded-for': '127.0.0.1' }, socket: {} }; }
function res() {
  return { statusCode: 0, payload: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; return this; }, setHeader() {} };
}
const redisMiss = { get: async () => null, set: async () => {}, eval: async () => [1, 1, 1], incrby: async (_k, a) => a, expire: async () => 1 };

function capture() {
  const lines = [];
  return { lines, logger: { info: (line) => lines.push(JSON.parse(line)) } };
}

// Production showed repeated provider timeouts with no way to tell "grounding
// gave up with no time left to recover" from "recovery ran and failed". These
// fields close that gap without changing any budget.

test('a grounded timeout records the failing stage and the time actually left', async () => {
  const { lines, logger } = capture();
  const handler = createAgeLookupHandler({
    totalBudgetMs: 1400,
    groundedStageBudgetMs: 1000,
    groundedFallbackMinRemainingMs: 5000, // force recovery to be skipped
    groundedEnabled: true,
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    groundedProviderLookup: () => new Promise(() => {}),
    logger,
  });
  await handler(req('LG WM3900HWA'), res());
  const log = lines.at(-1);
  assert.equal(log.routeType, 'age');
  assert.equal(log.identityLevel, 'exact-model');
  assert.equal(log.groundedFailureCode, 'STAGE_TIMEOUT');
  assert.equal(log.timeoutStage, 'provider');
  assert.ok(Number.isFinite(log.groundedDurationMs));
  // The diagnostic that was previously impossible to obtain.
  assert.ok(Number.isFinite(log.remainingMsAfterGrounded));
  assert.equal(log.fallbackAttempted, false);
  assert.equal(log.errorCode, 'PROVIDER_TIMEOUT');
});

test('a deterministic reserve is reported as such and keeps its errorCode', async () => {
  const { lines, logger } = capture();
  const handler = createAgeLookupHandler({
    totalBudgetMs: 1400,
    groundedStageBudgetMs: 1000,
    groundedFallbackMinRemainingMs: 5000,
    groundedEnabled: true,
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    groundedProviderLookup: () => new Promise(() => {}),
    logger,
  });
  await handler(req('Samsung QN65Q60RAFXZA'), res());
  const log = lines.at(-1);
  assert.equal(log.deterministicFallbackUsed, true);
  assert.equal(log.errorCode, 'PROVIDER_TIMEOUT');
  assert.equal(log.resultEvidenceType, 'heuristic');
});

test('a local-evidence hit reports no provider attempt', async () => {
  const { lines, logger } = capture();
  let providerCalls = 0;
  const handler = createAgeLookupHandler({
    redisFactory: () => redisMiss,
    localLookup: async () => ({
      brand: 'LG', model: 'WM3900HWA', category: 'washer', specificityLevel: 'specific',
      estimatedYear: 2019, notes: 'local', evidence: [{ detail: 'local', source: 'local-db' }],
    }),
    providerLookup: async () => { providerCalls += 1; return {}; },
    logger,
  });
  await handler(req('LG WM3900HWA'), res());
  const log = lines.at(-1);
  assert.equal(providerCalls, 0);
  assert.equal(log.localEvidenceHit, true);
  assert.equal(log.providerAttempted, false);
  assert.equal(log.groundedAttempted, false);
});

test('telemetry never contains a raw query, model, or serial value', async () => {
  const { lines, logger } = capture();
  const handler = createAgeLookupHandler({
    totalBudgetMs: 1400,
    groundedStageBudgetMs: 1000,
    groundedEnabled: true,
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    groundedProviderLookup: () => new Promise(() => {}),
    logger,
  });
  await handler(req('GE FR31424IN GFW850SPN0DG', { notes: 'bought at ACME Store' }), res());
  const serialized = JSON.stringify(lines);
  for (const secret of ['GFW850SPN0DG', 'FR31424IN', 'ACME', 'gfw850spn0dg', 'fr31424in']) {
    assert.ok(!serialized.includes(secret), `telemetry leaked ${secret}`);
  }
});

test('concurrent identical requests flag the shared in-flight call and count one logical lookup', async () => {
  const { lines, logger } = capture();
  let providerCalls = 0;
  let release;
  const blocker = new Promise((resolve) => { release = resolve; });
  const handler = createAgeLookupHandler({
    redisFactory: () => redisMiss,
    localLookup: async () => null,
    providerLookup: async () => {
      providerCalls += 1;
      await blocker;
      return { brand: 'LG', model: 'WM3900HWA', category: 'washer', specificityLevel: 'specific', productionRange: { start: 2019, end: 2020 } };
    },
    logger,
  });
  const first = handler(req('LG WM3900HWA'), res());
  const second = handler(req('LG WM3900HWA'), res());
  release();
  await Promise.all([first, second]);
  assert.equal(providerCalls, 1, 'one real provider call');
  const shared = lines.filter((line) => line.inFlightShared === true);
  assert.equal(shared.length, 1, 'exactly one request attached to the in-flight call');
  assert.ok(lines.every((line) => line.logicalLookupCount == null || line.logicalLookupCount <= 1));
});
