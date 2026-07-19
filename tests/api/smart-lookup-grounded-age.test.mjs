import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgeLookupHandler } from '../../api/age-lookup.js';
import { buildSmartAgeCacheKey } from '../../lib/smart-lookup/cache.js';
import { classifySmartLookupQuery } from '../../lib/smart-lookup/normalize.js';

function req(query, extra = {}) { return { method: 'POST', body: { query, ...extra }, headers: { 'x-forwarded-for': '127.0.0.1' }, socket: {} }; }
function res() {
  return { statusCode: 0, payload: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; return this; }, setHeader() {} };
}

const redisMiss = {
  get: async () => null,
  set: async () => {},
  eval: async () => [1, 1, 1],
  incrby: async (_key, amount) => amount,
  expire: async () => 1,
};

const GROUNDED_SOURCES = [
  { title: 'lg.com', domain: 'lg.com', uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/a' },
  { title: 'energystar.gov', domain: 'energystar.gov', uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/b' },
];

function withMetadata(value, metadata) {
  Object.defineProperty(value, Symbol.for('smart-lookup-provider-metadata'), {
    value: Object.freeze(metadata),
    enumerable: false,
  });
  return value;
}

function groundedProviderResult(overrides = {}) {
  return withMetadata({
    brand: 'LG',
    model: 'WM3900HWA',
    specificityLevel: 'specific',
    introductionYear: 2019,
    productionRange: { start: 2019, end: 2022, basis: 'model-availability' },
    notes: 'Availability window from manufacturer sources.',
    evidence: [{ detail: 'Listed on the manufacturer product page.', source: 'Manufacturer product page' }],
    suggestedModelNumbers: [],
    ...overrides.result,
  }, {
    provider: 'gemini',
    fallbackUsed: false,
    primaryProvider: 'gemini',
    primaryErrorCode: null,
    grounded: true,
    groundedSources: GROUNDED_SOURCES,
    searchQueryCount: 2,
    ...overrides.metadata,
  });
}

test('grounded lookup runs for exact-model queries when enabled and returns cited sources', async () => {
  let groundedCalls = 0;
  let closedBookCalls = 0;
  const handler = createAgeLookupHandler({
    groundedEnabled: true,
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    groundedProviderLookup: async () => { groundedCalls += 1; return groundedProviderResult(); },
    providerLookup: async () => { closedBookCalls += 1; throw new Error('closed-book provider should not run'); },
  });
  const out = res();
  await handler(req('LG WM3900HWA'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(groundedCalls, 1);
  assert.equal(closedBookCalls, 0);
  assert.equal(out.payload.source, 'gemini');
  assert.equal(out.payload.evidenceSource, 'gemini-grounded');
  assert.equal(out.payload.sources.length, 2);
  assert.equal(out.payload.sources[0].domain, 'lg.com');
  assert.match(out.payload.retrievedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(out.payload.model, 'WM3900HWA');
});

test('grounded lookup is skipped when the flag is off', async () => {
  let groundedCalls = 0;
  let closedBookCalls = 0;
  const handler = createAgeLookupHandler({
    groundedEnabled: false,
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    groundedProviderLookup: async () => { groundedCalls += 1; return groundedProviderResult(); },
    providerLookup: async () => {
      closedBookCalls += 1;
      return { brand: 'LG', model: 'WM3900HWA', introductionYear: 2019, productionRange: { start: 2019, end: 2022 } };
    },
  });
  const out = res();
  await handler(req('LG WM3900HWA'), out);
  assert.equal(groundedCalls, 0);
  assert.equal(closedBookCalls, 1);
  assert.equal(out.payload.evidenceSource, 'gemini-ungrounded');
  assert.deepEqual(out.payload.sources, []);
  assert.equal(out.payload.retrievedAt, null);
});

test('partial model tokens never use grounded research', async () => {
  let groundedCalls = 0;
  const handler = createAgeLookupHandler({
    groundedEnabled: true,
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    groundedProviderLookup: async () => { groundedCalls += 1; return groundedProviderResult(); },
    providerLookup: async () => ({ brand: 'Whirlpool', model: null, specificityLevel: 'partial', suggestedModelNumbers: ['WTW5000DW'] }),
  });
  const out = res();
  await handler(req('Whirlpool WTW50'), out);
  assert.equal(groundedCalls, 0);
  assert.equal(out.payload.model, 'WTW50');
  assert.equal(out.payload.introductionYear, null);
});

test('local hits bypass grounded research and provider budget', async () => {
  let groundedCalls = 0;
  let budgetCalls = 0;
  const handler = createAgeLookupHandler({
    groundedEnabled: true,
    localLookup: async () => ({ brand: 'LG', model: 'WM4000HWA', introductionYear: 2019, productionRange: { start: 2019, end: 2024 } }),
    redisFactory: () => { throw new Error('redis should not run'); },
    groundedProviderLookup: async () => { groundedCalls += 1; return groundedProviderResult(); },
    reserveProviderBudget: async () => { budgetCalls += 1; throw new Error('budget should not run'); },
  });
  const out = res();
  await handler(req('LG WM4000HWA'), out);
  assert.equal(out.payload.source, 'local-db');
  assert.equal(groundedCalls, 0);
  assert.equal(budgetCalls, 0);
});

test('cache hits bypass grounded research', async () => {
  let groundedCalls = 0;
  const cached = {
    brand: 'LG', model: 'WM3900HWA', specificityLevel: 'specific',
    introductionYear: 2019, productionRange: { start: 2019, end: 2022 },
    evidenceSource: 'gemini-grounded',
    sources: GROUNDED_SOURCES,
    retrievedAt: '2026-07-01T00:00:00.000Z',
    originSource: 'gemini',
  };
  const handler = createAgeLookupHandler({
    groundedEnabled: true,
    localLookup: async () => null,
    redisFactory: () => ({ get: async (key) => String(key).startsWith('smart-age:') ? cached : null, set: async () => {} }),
    groundedProviderLookup: async () => { groundedCalls += 1; return groundedProviderResult(); },
    providerLookup: async () => { throw new Error('provider should not run'); },
  });
  const out = res();
  await handler(req('LG WM3900HWA'), out);
  assert.equal(groundedCalls, 0);
  assert.equal(out.payload.cacheStatus, 'hit');
  assert.equal(out.payload.source, 'cache');
  assert.equal(out.payload.evidenceSource, 'gemini-grounded');
  assert.equal(out.payload.sources.length, 2);
  assert.equal(out.payload.retrievedAt, '2026-07-01T00:00:00.000Z');
});

test('grounded result without sources is downgraded to ungrounded and never fabricates citations', async () => {
  const handler = createAgeLookupHandler({
    groundedEnabled: true,
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    groundedProviderLookup: async () => groundedProviderResult({ metadata: { groundedSources: [], searchQueryCount: 0 } }),
  });
  const out = res();
  await handler(req('LG WM3900HWA'), out);
  assert.equal(out.payload.evidenceSource, 'gemini-ungrounded');
  assert.deepEqual(out.payload.sources, []);
  assert.equal(out.payload.retrievedAt, null);
  assert.equal(out.payload.introductionYear, 2019);
});

test('model-authored sources in provider JSON are ignored (server-derived only)', async () => {
  const handler = createAgeLookupHandler({
    groundedEnabled: true,
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    groundedProviderLookup: async () => groundedProviderResult({
      result: { sources: [{ title: 'fabricated.example.com', domain: 'fabricated.example.com', uri: 'https://fabricated.example.com' }] },
      metadata: { groundedSources: [], grounded: true },
    }),
  });
  const out = res();
  await handler(req('LG WM3900HWA'), out);
  assert.equal(out.payload.evidenceSource, 'gemini-ungrounded');
  assert.deepEqual(out.payload.sources, []);
});

test('grounded output for an unrelated model is rejected by validation', async () => {
  const handler = createAgeLookupHandler({
    groundedEnabled: true,
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    groundedProviderLookup: async () => groundedProviderResult({ result: { model: 'WM4000HBA' } }),
  });
  const out = res();
  await handler(req('LG WM3900HWA'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(out.payload.errorCode, 'UNRELATED_MODEL');
  assert.deepEqual(out.payload.sources, []);
});

test('exhausted daily budget blocks grounded calls', async () => {
  let groundedCalls = 0;
  const handler = createAgeLookupHandler({
    groundedEnabled: true,
    localLookup: async () => null,
    redisFactory: () => ({ ...redisMiss, eval: async () => [0, 120, 180] }),
    groundedProviderLookup: async () => { groundedCalls += 1; return groundedProviderResult(); },
  });
  const out = res();
  await handler(req('LG WM3900HWA'), out);
  assert.equal(groundedCalls, 0);
  assert.equal(out.payload.errorCode, 'GLOBAL_BUDGET_EXHAUSTED');
});

test('Redis outage fails closed before any grounded call', async () => {
  let groundedCalls = 0;
  const handler = createAgeLookupHandler({
    groundedEnabled: true,
    localLookup: async () => null,
    redisFactory: () => null,
    groundedProviderLookup: async () => { groundedCalls += 1; return groundedProviderResult(); },
  });
  const out = res();
  await handler(req('LG WM3900HWA'), out);
  assert.equal(groundedCalls, 0);
  assert.equal(out.payload.errorCode, 'BUDGET_STORE_UNAVAILABLE');
});

test('grounded timeout returns a safe unavailable result', async () => {
  const handler = createAgeLookupHandler({
    totalBudgetMs: 1400,
    groundedEnabled: true,
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    groundedProviderLookup: () => new Promise(() => {}),
  });
  const out = res();
  await handler(req('LG WM3900HWA'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(out.payload.errorCode, 'PROVIDER_TIMEOUT');
  assert.equal(out.payload.fallbackUsed, false);
  assert.deepEqual(out.payload.sources, []);
});

test('concurrent identical grounded requests share one provider call and one budget reservation', async () => {
  let groundedCalls = 0;
  let budgetCalls = 0;
  const handler = createAgeLookupHandler({
    groundedEnabled: true,
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    reserveProviderBudget: async () => { budgetCalls += 1; return { allowed: true, status: 'allowed', logicalLookupCount: 1 }; },
    groundedProviderLookup: async () => {
      groundedCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 60));
      return groundedProviderResult();
    },
  });
  const first = res();
  const second = res();
  await Promise.all([handler(req('LG WM3900HWA'), first), handler(req('LG WM3900HWA'), second)]);
  assert.equal(groundedCalls, 1);
  assert.equal(budgetCalls, 1);
  assert.equal(first.payload.evidenceSource, 'gemini-grounded');
  assert.equal(second.payload.evidenceSource, 'gemini-grounded');
});

test('grounded and ungrounded modes use distinct cache keys', () => {
  const info = classifySmartLookupQuery('LG WM3900HWA');
  const grounded = buildSmartAgeCacheKey(info, { grounded: true });
  const ungrounded = buildSmartAgeCacheKey(info, { grounded: false });
  const defaulted = buildSmartAgeCacheKey(info);
  assert.notEqual(grounded, ungrounded);
  assert.equal(ungrounded, defaulted);
});

test('grounded telemetry logs source counts but never raw notes or URLs', async () => {
  const logs = [];
  const handler = createAgeLookupHandler({
    groundedEnabled: true,
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    groundedProviderLookup: async () => groundedProviderResult(),
    logger: { info: (line) => logs.push(line), warn: () => {}, error: () => {} },
  });
  const out = res();
  await handler(req('LG WM3900HWA', { notes: 'purchased at estate sale in Ohio' }), out);
  const logText = logs.join('\n');
  const entry = JSON.parse(logs[logs.length - 1]);
  assert.equal(entry.grounded, true);
  assert.equal(entry.groundedSourceCount, 2);
  assert.equal(logText.includes('estate sale'), false);
  assert.equal(logText.includes('vertexaisearch'), false);
});
