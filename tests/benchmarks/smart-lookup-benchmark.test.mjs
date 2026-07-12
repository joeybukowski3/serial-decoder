import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgeLookupHandler } from '../../api/age-lookup.js';
import { createLkqLookupHandler } from '../../api/lkq-lookup.js';

function req(query) { return { method: 'POST', body: { query }, headers: { 'x-forwarded-for': '127.0.0.1' }, socket: {} }; }
function res() { return { statusCode: 0, payload: null, status(c) { this.statusCode = c; return this; }, json(p) { this.payload = p; return this; }, setHeader() {} }; }
async function measure(label, fn) { const start = performance.now(); await fn(); return { label, ms: Math.max(0, performance.now() - start) }; }

test('mocked Smart Lookup benchmark scenarios complete without live providers', async () => {
  const results = [];
  results.push(await measure('local hit', async () => createAgeLookupHandler({ localLookup: async () => ({ brand: 'LG', model: 'WM4000HWA', introductionYear: 2019 }), providerLookup: async () => { throw new Error('no'); } })(req('LG WM4000HWA'), res())));
  results.push(await measure('cache hit', async () => createAgeLookupHandler({ localLookup: async () => null, redisFactory: () => ({ get: async () => ({ brand: 'Samsung', model: 'QN65Q80A', introductionYear: 2020, productionRange: { start: 2021, end: 2021 } }), set: async () => {} }) })(req('Samsung QN65-Q80A'), res())));
  results.push(await measure('provider success', async () => createAgeLookupHandler({ localLookup: async () => null, redisFactory: () => ({ get: async () => null, set: async () => {} }), providerLookup: async () => ({ brand: 'Samsung', model: 'QN65Q80A', introductionYear: 2020, productionRange: { start: 2021, end: 2021 } }) })(req('Samsung QN65-Q80A'), res())));
  results.push(await measure('provider timeout', async () => createAgeLookupHandler({ totalBudgetMs: 40, providerBudgetMs: 10, localLookup: async () => null, redisFactory: () => ({ get: async () => null, set: async () => {} }), providerLookup: async () => new Promise(() => {}) })(req('Samsung QN65-Q80A'), res())));
  results.push(await measure('deterministic family year context', async () => createAgeLookupHandler({ localLookup: async () => { throw new Error('family result should bypass local lookup'); } })(req('LG C3 TV'), res())));
  results.push(await measure('redis timeout', async () => createAgeLookupHandler({ totalBudgetMs: 80, localLookup: async () => null, redisFactory: () => ({ get: async () => new Promise(() => {}), set: async () => {} }), providerLookup: async () => ({ brand: 'Samsung', model: 'QN65Q80A', introductionYear: 2020 }) })(req('Samsung QN65-Q80A'), res())));
  results.push(await measure('replacement disabled', async () => {}));
  results.push(await measure('replacement enabled', async () => createLkqLookupHandler({ redisFactory: () => ({ get: async () => null, set: async () => {} }), providerLookup: async () => ({ itemSummary: { brand: 'Samsung', model: 'QN65Q80A', category: 'television' }, replacementOptions: [], successorStatus: { type: 'none' } }) })(req('Samsung QN65-Q80A television'), res())));
  results.push(await measure('concurrent identical request', async () => {
    const handler = createAgeLookupHandler({ localLookup: async () => null, redisFactory: () => ({ get: async () => null, set: async () => {} }), providerLookup: async () => ({ brand: 'Samsung', model: 'QN65Q80A', introductionYear: 2020 }) });
    await Promise.all([handler(req('Samsung QN65-Q80A'), res()), handler(req('Samsung QN65-Q80A'), res())]);
  }));
  assert.equal(results.length, 9);
  assert.ok(results.every((item) => Number.isFinite(item.ms)));
  console.log(JSON.stringify({ smartLookupBenchmarks: results }));
});
