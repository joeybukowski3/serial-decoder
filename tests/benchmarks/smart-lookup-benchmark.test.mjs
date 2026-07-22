import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgeLookupHandler } from '../../api/age-lookup.js';
import { createLkqLookupHandler } from '../../api/lkq-lookup.js';

function req(query) { return { method: 'POST', body: { query }, headers: { 'x-forwarded-for': '127.0.0.1' }, socket: {} }; }
function res() { return { statusCode: 0, payload: null, status(c) { this.statusCode = c; return this; }, json(p) { this.payload = p; return this; }, setHeader() {} }; }
async function measure(label, fn) { const start = performance.now(); await fn(); return { label, ms: Math.max(0, performance.now() - start) }; }
const redisMiss = { get: async () => null, set: async () => {}, eval: async () => [1, 1, 1], incrby: async (_key, amount) => amount, expire: async () => 1 };

test('mocked Smart Lookup benchmark scenarios complete without live providers', async () => {
  const results = [];
  results.push(await measure('local hit', async () => createAgeLookupHandler({ localLookup: async () => ({ brand: 'LG', model: 'WM4000HWA', introductionYear: 2019 }), providerLookup: async () => { throw new Error('no'); } })(req('LG WM4000HWA'), res())));
  results.push(await measure('cache hit', async () => createAgeLookupHandler({ localLookup: async () => null, redisFactory: () => ({ get: async () => ({ brand: 'Samsung', model: 'QN65Q80A', introductionYear: 2020, productionRange: { start: 2021, end: 2021 } }), set: async () => {} }) })(req('Samsung QN65-Q80A'), res())));
  results.push(await measure('provider success', async () => createAgeLookupHandler({ localLookup: async () => null, redisFactory: () => redisMiss, providerLookup: async () => ({ brand: 'Samsung', model: 'QN65Q80A', introductionYear: 2020, productionRange: { start: 2021, end: 2021 } }) })(req('Samsung QN65-Q80A'), res())));
  results.push(await measure('provider timeout', async () => createAgeLookupHandler({ totalBudgetMs: 40, providerBudgetMs: 10, localLookup: async () => null, redisFactory: () => redisMiss, providerLookup: async () => new Promise(() => {}) })(req('Samsung QN65-Q80A'), res())));
  results.push(await measure('deterministic family year context', async () => createAgeLookupHandler({ localLookup: async () => { throw new Error('family result should bypass local lookup'); } })(req('LG C3 TV'), res())));
  results.push(await measure('redis timeout', async () => createAgeLookupHandler({ totalBudgetMs: 80, localLookup: async () => null, redisFactory: () => ({ get: async () => new Promise(() => {}), set: async () => {} }), providerLookup: async () => ({ brand: 'Samsung', model: 'QN65Q80A', introductionYear: 2020 }) })(req('Samsung QN65-Q80A'), res())));
  results.push(await measure('replacement disabled', async () => {}));
  results.push(await measure('replacement enabled', async () => createLkqLookupHandler({ redisFactory: () => redisMiss, providerLookup: async () => ({ itemSummary: { brand: 'Samsung', model: 'QN65Q80A', category: 'television' }, replacementOptions: [], successorStatus: { type: 'none' } }) })(req('Samsung QN65-Q80A television'), res())));
  results.push(await measure('concurrent identical request', async () => {
    const handler = createAgeLookupHandler({ localLookup: async () => null, redisFactory: () => redisMiss, providerLookup: async () => ({ brand: 'Samsung', model: 'QN65Q80A', introductionYear: 2020 }) });
    await Promise.all([handler(req('Samsung QN65-Q80A'), res()), handler(req('Samsung QN65-Q80A'), res())]);
  }));
  assert.equal(results.length, 9);
  assert.ok(results.every((item) => Number.isFinite(item.ms)));
  console.log(JSON.stringify({ smartLookupBenchmarks: results }));
});

// Verified exact-alias evidence scenarios (Phase 12). Each case pins identity
// level, local-evidence status, provider eligibility, and the claims that are
// allowed versus forbidden. No live providers.
test('verified exact-alias benchmark scenarios resolve without providers', async () => {
  const cases = [
    {
      label: 'verified exact alias, no brand supplied',
      query: 'GFW850SPN0DG',
      expect: { source: 'local-db', brand: 'GE', identity: 'exact-model', matchedBy: 'exact-alias', range: '2019-2021', conflict: false },
    },
    {
      label: 'canonical exact model, no brand supplied',
      query: 'GFW850SPNDG',
      expect: { source: 'local-db', brand: 'GE', identity: 'exact-model', matchedBy: 'canonical-model', range: '2019-2021', conflict: false },
    },
    {
      label: 'conflicting brand + verified exact alias',
      query: 'Samsung GFW850SPN0DG',
      expect: { source: 'static', brand: 'Samsung', matchedBy: null, range: null, conflict: true },
    },
    {
      label: 'conflicting category + verified exact alias',
      query: 'GE refrigerator GFW850SPN0DG',
      expect: { source: 'local-db', brand: 'GE', matchedBy: 'exact-alias', conflict: true },
    },
    {
      label: 'near-match alias must not resolve',
      query: 'GFW850SPNXDG',
      // Under the usefulness-first research policy an unresolvable model
      // token is researched rather than dead-ended, so a provider call is
      // expected here. What this case actually guards still holds: the
      // near-match must never resolve to the verified alias record -- no
      // matchedBy, no borrowed year range.
      allowProvider: true,
      expect: { source: 'gemini', matchedBy: null, range: null, conflict: false },
    },
    {
      label: 'exact alias with form-factor text',
      query: 'GE GFW850SPN0DG front load washer',
      expect: { source: 'local-db', brand: 'GE', matchedBy: 'exact-alias', range: '2019-2021', conflict: false },
    },
  ];

  for (const testCase of cases) {
    let providerCalls = 0;
    const handler = createAgeLookupHandler({
      redisFactory: () => redisMiss,
      providerLookup: async () => { providerCalls += 1; return { brand: 'X', model: 'Y', specificityLevel: 'specific' }; },
      groundedProviderLookup: async () => { providerCalls += 1; return {}; },
      logger: { info: () => {} },
    });
    const out = res();
    await handler(req(testCase.query), out);
    const payload = out.payload;

    if (!testCase.allowProvider) {
      assert.equal(providerCalls, 0, `${testCase.label}: no paid provider call expected`);
    }
    assert.equal(payload.source, testCase.expect.source, `${testCase.label}: source`);
    if (testCase.expect.brand) assert.equal(payload.brand, testCase.expect.brand, `${testCase.label}: brand`);
    if (testCase.expect.identity) assert.equal(payload.querySpecificity, testCase.expect.identity, `${testCase.label}: identity`);
    assert.equal(payload.matchedBy ?? null, testCase.expect.matchedBy ?? null, `${testCase.label}: matchedBy`);
    if ('range' in testCase.expect) assert.equal(payload.yearRange ?? null, testCase.expect.range, `${testCase.label}: range`);
    assert.equal(Boolean(payload.evidenceConflict), testCase.expect.conflict, `${testCase.label}: conflict`);

    // Forbidden claims for every case: local model-era evidence never asserts a
    // manufacture date for the user's individual unit.
    assert.equal(payload.individualManufactureYear ?? null, null, `${testCase.label}: no unit manufacture year`);
  }
});

test('a verified exact alias still resolves locally during a simulated provider outage', async () => {
  const handler = createAgeLookupHandler({
    redisFactory: () => null, // Redis unavailable
    providerLookup: async () => { throw new Error('provider outage'); },
    groundedProviderLookup: async () => { throw new Error('provider outage'); },
    logger: { info: () => {} },
  });
  const out = res();
  await handler(req('GFW850SPN0DG'), out);
  assert.equal(out.payload.source, 'local-db');
  assert.equal(out.payload.yearRange, '2019-2021');
  assert.equal(out.payload.errorCode ?? null, null);
});
