import test from 'node:test';
import assert from 'node:assert/strict';
import { createLkqLookupHandler } from '../../api/lkq-lookup.js';

function req(query, extra = {}) { return { method: 'POST', body: { query, ...extra }, headers: { 'x-forwarded-for': '127.0.0.1' }, socket: {} }; }
function res() { return { statusCode: 0, payload: null, status(c) { this.statusCode = c; return this; }, json(p) { this.payload = p; return this; }, setHeader() {} }; }
function validReplacement(model = 'QN65Q80C') { return {
  itemSummary: { brand: 'Samsung', model: 'QN65Q80A', category: 'television' },
  specLabels: ['Size', 'Display', 'Resolution', 'Smart', 'Refresh'],
  replacementOptions: [{ brand: 'Samsung', model, name: 'Samsung Q80C', lkqRating: 'MATCH', evidence: ['same QLED series'], notes: 'Same series replacement.' }],
  successorStatus: { type: 'same_brand_equivalent', model, name: 'Samsung Q80C', explanation: 'Grounded same-series option.' },
}; }

test('provider success validates compatible replacement', async () => {
  const handler = createLkqLookupHandler({ redisFactory: () => ({ get: async () => null, set: async () => {} }), providerLookup: async () => validReplacement() });
  const out = res();
  await handler(req('Samsung QN65-Q80A television'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(out.payload.replacementOptions.length, 1);
});

test('LKQ lookup sends normalized notes as separate untrusted provider context', async () => {
  let seenInfo = null;
  const handler = createLkqLookupHandler({
    redisFactory: () => ({ get: async () => null, set: async () => {} }),
    providerLookup: async (queryInfo) => {
      seenInfo = queryInfo;
      return validReplacement();
    },
  });
  const out = res();
  await handler(req('Samsung QN65-Q80A television', { notes: '  Need  like-kind\nreplacement only  ' }), out);
  assert.equal(out.statusCode, 200);
  assert.equal(seenInfo.userNotes, 'Need like-kind replacement only');
  assert.equal(typeof seenInfo.notesHash, 'string');
  assert.equal(seenInfo.notesHash.length, 24);
});

test('LKQ lookup rejects over-limit notes before provider and logs no raw notes', async () => {
  let providerCalls = 0;
  const logs = [];
  const handler = createLkqLookupHandler({
    redisFactory: () => ({ get: async () => null, set: async () => {} }),
    providerLookup: async () => { providerCalls += 1; return validReplacement(); },
    logger: { info: (line) => logs.push(line), warn: () => {}, error: () => {} },
  });
  const out = res();
  await handler(req('Samsung QN65-Q80A television', { notes: 'private context '.repeat(40) }), out);
  assert.equal(out.statusCode, 400);
  assert.equal(out.payload.errorCode, 'NOTES_TOO_LONG');
  assert.equal(providerCalls, 0);
  assert.equal(logs.join('\n').includes('private context'), false);
});

test('LG successor fabrication prevention preserves provider model', async () => {
  const handler = createLkqLookupHandler({ redisFactory: () => ({ get: async () => null, set: async () => {} }), providerLookup: async () => ({
    itemSummary: { brand: 'LG', model: 'OLED65C1PUB', category: 'television' },
    specLabels: ['Size', 'Display', 'Resolution', 'Smart', 'Refresh'],
    replacementOptions: [{ brand: 'LG', model: 'OLED65C2PUA', name: 'LG OLED C2', lkqRating: 'MATCH', evidence: ['same C-series OLED'], notes: 'Provider supplied C2.' }],
    successorStatus: { type: 'direct_successor', model: 'OLED65C2PUA', name: 'LG OLED C2', explanation: 'Provider supplied successor.' },
  }) });
  const out = res();
  await handler(req('LG OLED65C1PUB television'), out);
  assert.equal(out.payload.replacementOptions[0].model, 'OLED65C2PUA');
});

test('replacement brand/category/model validation rejects unrelated output', async () => {
  const handler = createLkqLookupHandler({ redisFactory: () => ({ get: async () => null, set: async () => {} }), providerLookup: async () => ({
    itemSummary: { brand: 'LG', model: 'BAD', category: 'washer' }, replacementOptions: [], successorStatus: { type: 'none' },
  }) });
  const out = res();
  await handler(req('Samsung QN65-Q80A television'), out);
  assert.equal(out.payload.errorCode, 'UNRELATED_BRAND');
});

test('partial input is not silently completed to exact model', async () => {
  const handler = createLkqLookupHandler({ redisFactory: () => ({ get: async () => null, set: async () => {} }), providerLookup: async () => validReplacement('QN65Q80C') });
  const out = res();
  await handler(req('QN65Q80A'), out);
  assert.equal(out.payload.itemSummary.model, 'QN65Q80A');
});

test('concurrent LKQ requests share provider and limiter', async () => {
  let providerCalls = 0; let limiterCalls = 0; let release;
  const blocker = new Promise((resolve) => { release = resolve; });
  const handler = createLkqLookupHandler({
    redisFactory: () => ({ get: async () => null, set: async () => {} }),
    rateLimiterFactory: () => ({ limit: async () => { limiterCalls += 1; return { success: true }; } }),
    providerLookup: async () => { providerCalls += 1; await blocker; return validReplacement(); },
  });
  const one = res(); const two = res();
  const p1 = handler(req('Samsung QN65-Q80A television'), one);
  const p2 = handler(req('Samsung QN65-Q80A television'), two);
  release();
  await Promise.all([p1, p2]);
  assert.equal(providerCalls, 1);
  assert.equal(limiterCalls, 1);
});
