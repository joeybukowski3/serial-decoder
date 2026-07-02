import test from 'node:test';
import assert from 'node:assert/strict';
import { createSmartQueryInterpretHandler } from '../../api/smart-query-interpret.js';

function req(query) { return { method: 'POST', body: { query }, headers: { 'x-forwarded-for': '127.0.0.1' }, socket: {} }; }
function res() { return { statusCode: 0, payload: null, status(c) { this.statusCode = c; return this; }, json(p) { this.payload = p; return this; }, setHeader() {} }; }

test('specific deterministic path keeps queryKind and specificity consistent', async () => {
  const out = res();
  await createSmartQueryInterpretHandler()(req('Samsung QN65-Q80A'), out);
  assert.equal(out.payload.queryKind, 'specific');
  assert.equal(out.payload.specificityLevel, 'specific');
});

test('partial deterministic path does not complete model silently', async () => {
  const out = res();
  await createSmartQueryInterpretHandler()(req('QN65Q80A'), out);
  assert.equal(out.payload.queryKind, 'specific');
  assert.equal(out.payload.specificityLevel, 'partial');
  assert.deepEqual(out.payload.suggestions, ['QN65Q80A']);
});

test('provider path deduplicates before rate limiting', async () => {
  let providerCalls = 0;
  let limiterCalls = 0;
  let release;
  const blocker = new Promise((resolve) => { release = resolve; });
  const handler = createSmartQueryInterpretHandler({
    redisFactory: () => ({ get: async () => null, set: async () => {} }),
    rateLimiterFactory: () => ({ limit: async () => { limiterCalls += 1; return { success: true }; } }),
    providerLookup: async () => { providerCalls += 1; await blocker; return { action: 'bypass', queryKind: 'specific', confidence: 'medium', scopeValid: true, suggestions: ['mystery equipment 123'] }; },
  });
  const one = res(); const two = res();
  const p1 = handler(req('mystery equipment 123'), one);
  const p2 = handler(req('mystery equipment 123'), two);
  release();
  await Promise.all([p1, p2]);
  assert.equal(providerCalls, 1);
  assert.equal(limiterCalls, 1);
});
