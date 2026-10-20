import test from 'node:test';
import assert from 'node:assert/strict';

import { createAgeLookupHandler } from '../../api/age-lookup.js';
import { GeminiSearchProviderError } from '../../lib/smart-lookup/gemini-search-provider.js';
import { allowingRateLimiter } from '../helpers/allowing-rate-limiter.mjs';
import { createFakeRedis } from '../helpers/fake-redis.mjs';
import { buildSmartAgeCacheKey, prepareResultForCache } from '../../lib/smart-lookup/cache.js';
import { classifySmartLookupQuery } from '../../lib/smart-lookup/normalize.js';
import { chooseSmartLookupRoute } from '../../lib/smart-lookup/route-mode.js';

function req(query) {
  return { method: 'POST', body: { query }, headers: { 'x-forwarded-for': '127.0.0.1' }, socket: {} };
}

function res() {
  return {
    statusCode: 0,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    setHeader() {},
  };
}

const redisMiss = {
  get: async () => null,
  set: async () => {},
  eval: async () => [1, 1, 1],
  incrby: async (_key, amount) => amount,
  expire: async () => 1,
};

function nativeResult(overrides = {}) {
  return {
    brand: 'Microsoft',
    product: 'Xbox One X',
    model: 'Xbox One X',
    category: 'Home video game console',
    bestEstimateYear: 2017,
    estimatedRange: { startYear: 2017, endYear: 2020 },
    precision: 'exact_model',
    confidence: 'high',
    estimateBasis: 'Introduced in 2017 and produced through 2020.',
    summary: 'Microsoft released Xbox One X as its higher-performance Xbox One console.',
    isIndividualUnitDate: false,
    caveats: ['This dates the model, not an individual console.'],
    sources: [{ title: 'xbox.com', url: 'https://www.xbox.com/xbox-one-x' }],
    ...overrides,
  };
}

function legacyResult() {
  return {
    brand: 'Microsoft',
    model: 'Xbox One X',
    likelyProduct: 'Microsoft Xbox One X',
    specificityLevel: 'unknown',
    introductionYear: 2018,
    identityConfidence: 'medium',
    summary: 'Legacy research result.',
  };
}

function harness({ enabled, native, legacy, budgetResult } = {}) {
  const calls = { native: 0, legacy: 0, grounded: 0, serialRefinement: 0 };
  const handler = createAgeLookupHandler({
    rateLimiter: allowingRateLimiter,
    env: { SMART_LOOKUP_NATIVE_GEMINI_SEARCH_ENABLED: enabled ? 'true' : 'false' },
    logger: { log() {}, warn() {}, error() {} },
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    reserveProviderBudget: async () => budgetResult || {
      allowed: true,
      status: 'allowed',
      logicalLookupCount: 1,
    },
    nativeGeminiSearchLookup: async (...args) => {
      calls.native += 1;
      return native ? native(...args) : nativeResult();
    },
    providerLookup: async (...args) => {
      calls.legacy += 1;
      return legacy ? legacy(...args) : legacyResult();
    },
    groundedProviderLookup: async () => {
      calls.grounded += 1;
      throw new Error('grounded legacy research must not run');
    },
    serialRefinementLookup: async () => {
      calls.serialRefinement += 1;
      throw new Error('Serial Refinement must remain untouched');
    },
  });
  return { handler, calls };
}

test('flag false preserves the legacy Smart Lookup route', async () => {
  const { handler, calls } = harness({ enabled: false });
  const out = res();
  await handler(req('Xbox One X'), out);

  assert.equal(out.statusCode, 200);
  assert.equal(calls.native, 0);
  assert.equal(calls.legacy, 1);
  assert.equal(calls.serialRefinement, 0);
  assert.equal(out.payload.summary, 'Legacy research result.');
});

test('flag true returns native Gemini success without legacy research', async () => {
  const { handler, calls } = harness({ enabled: true });
  const out = res();
  await handler(req('Xbox One X'), out);

  assert.equal(out.statusCode, 200);
  assert.equal(calls.native, 1);
  assert.equal(calls.legacy, 0);
  assert.equal(calls.grounded, 0);
  assert.equal(calls.serialRefinement, 0);
  assert.equal(out.payload.bestEstimateYear, 2017);
  assert.deepEqual(out.payload.estimatedRange, {
    start: 2017, end: 2020, current: false, basis: 'model-introduction',
  });
  assert.equal(out.payload.precisionLevel, 'exact');
  assert.equal(out.payload.confidenceLevel, 'high');
  assert.equal(out.payload.summary, nativeResult().summary);
  assert.deepEqual(out.payload.caveats, nativeResult().caveats);
  assert.equal(out.payload.notes, nativeResult().estimateBasis);
  assert.equal(out.payload.evidenceSource, 'gemini-grounded');
  assert.deepEqual(out.payload.sources, [{
    title: 'xbox.com', domain: 'xbox.com', uri: 'https://www.xbox.com/xbox-one-x',
  }]);
});

test('native Smart Lookup can reuse one grounded call for a cited lifecycle date', async () => {
  let prompt = '';
  const { handler, calls } = harness({
    enabled: true,
    native: async (_query, options) => {
      prompt = options.prompt;
      return nativeResult({ sources: [{ title: 'xbox.com', url: 'https://www.xbox.com/xbox-one-x',
        evidenceText: ['Microsoft Xbox One X normal new-product retail sales ended in the US in 2021.'] }],
      endOfRetailAvailability: [{
        product: 'Microsoft Xbox One X', event: 'normal_new_product_retail_sales_end',
        date: '2021', market: 'US', confidence: 'medium',
        evidenceExcerpt: 'Normal new-product retail sales ended in the US in 2021.',
        sourceUrl: 'https://www.xbox.com/xbox-one-x',
      }] });
    },
  });
  const out = res();
  await handler(req('Xbox One X'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(calls.native, 1);
  assert.equal(calls.legacy, 0);
  assert.match(prompt, /Do not perform another search just for these facts/);
  assert.equal(out.payload.bestEstimateYear, 2017);
  assert.equal(out.payload.endOfRetailAvailability?.date, '2021');
});

test('age route rejects old and mismatched broad cache records and reuses matching records', async () => {
  const redis = createFakeRedis();
  const query = 'HP OfficeJet Pro 8710 All-in-One Printer';
  const info = classifySmartLookupQuery(query);
  const cacheKey = buildSmartAgeCacheKey(info,
    { grounded: true, routeMode: chooseSmartLookupRoute(info).mode });
  const unrelated = prepareResultForCache({ brand: 'HP', likelyProduct: 'HP Envy 6055',
    identityConfidence: 'high', introductionYear: 2020, source: 'gemini', evidenceSource: 'gemini-ungrounded' },
  classifySmartLookupQuery('HP Envy 6055 All-in-One Printer'));
  await redis.set(cacheKey, unrelated);
  let calls = 0;
  const handler = createAgeLookupHandler({
    rateLimiter: allowingRateLimiter,
    env: { SMART_LOOKUP_NATIVE_GEMINI_SEARCH_ENABLED: 'true' },
    logger: { log() {}, warn() {}, error() {} },
    localLookup: async () => null,
    redisFactory: () => redis,
    reserveProviderBudget: async () => ({ allowed: true, status: 'allowed', logicalLookupCount: 1 }),
    nativeGeminiSearchLookup: async () => {
      calls += 1;
      return nativeResult({ brand: 'HP', product: 'HP OfficeJet Pro 8710', model: 'OfficeJet Pro 8710',
        category: 'printer', bestEstimateYear: 2016, estimatedRange: { startYear: 2016, endYear: 2020 },
        sources: [] });
    },
  });
  const first = res();
  await handler(req(query), first);
  assert.equal(first.payload.introductionYear, 2016);
  assert.equal(calls, 1);
  const repeat = res();
  await handler(req('  HP   OfficeJet Pro 8710 All-in-One Printer  '), repeat);
  assert.equal(repeat.payload.cacheStatus, 'hit');
  assert.equal(repeat.payload.introductionYear, 2016);
  assert.equal(calls, 1);
  await redis.set(cacheKey, prepareResultForCache(unrelated, info));
  const matchingFingerprintWrongProduct = res();
  await handler(req(query), matchingFingerprintWrongProduct);
  assert.equal(matchingFingerprintWrongProduct.payload.introductionYear, 2016);
  assert.notEqual(matchingFingerprintWrongProduct.payload.likelyProduct, 'HP Envy 6055');
  assert.equal(calls, 2);
  const oldEntry = { ...unrelated };
  delete oldEntry.requestFingerprint;
  await redis.set(cacheKey, oldEntry);
  const legacy = res();
  await handler(req(query), legacy);
  assert.equal(legacy.payload.introductionYear, 2016);
  assert.equal(calls, 3);
});

test('age route never serves a fingerprint-matched cache entry without defensible product identity', async () => {
  for (const [query, brand, entry] of [
    ['HP OfficeJet Pro 8710 All-in-One Printer', 'HP', { brand: 'HP', bestEstimateYear: 2020, introductionYear: 2020 }],
    ['Samsung Galaxy Tab A8 tablet', 'Samsung', { brand: 'Samsung', introductionYear: 2020, bestEstimateYear: 2020 }],
    ['HP OfficeJet Pro 8710 All-in-One Printer', 'HP', { brand: 'HP', model: '8710', displayName: 'HP Envy 6055',
      likelyProduct: 'HP OfficeJet Pro 8710', introductionYear: 2020, bestEstimateYear: 2020 }],
    ['Samsung Galaxy Tab A8 tablet', 'Samsung', { brand: 'Samsung', exactModel: 'Galaxy Tab A8',
      displayName: 'Samsung Galaxy Tab S9', introductionYear: 2022, bestEstimateYear: 2022 }],
  ]) {
    const redis = createFakeRedis();
    const info = classifySmartLookupQuery(query);
    const cacheKey = buildSmartAgeCacheKey(info, { grounded: true, routeMode: chooseSmartLookupRoute(info).mode });
    await redis.set(cacheKey, prepareResultForCache({ source: 'gemini', evidenceSource: 'gemini-ungrounded', ...entry }, info));
    let calls = 0;
    const handler = createAgeLookupHandler({
      rateLimiter: allowingRateLimiter,
      env: { SMART_LOOKUP_NATIVE_GEMINI_SEARCH_ENABLED: 'true' },
      logger: { log() {}, warn() {}, error() {} },
      localLookup: async () => null,
      redisFactory: () => redis,
      reserveProviderBudget: async () => ({ allowed: true, status: 'allowed', logicalLookupCount: 1 }),
      nativeGeminiSearchLookup: async () => {
        calls += 1;
        return nativeResult({ brand, product: `${brand} ${query}`, model: query.includes('Tab') ? 'Galaxy Tab A8' : 'OfficeJet Pro 8710',
          category: 'device', bestEstimateYear: 2016, estimatedRange: { startYear: 2016, endYear: 2020 }, sources: [] });
      },
    });
    const out = res();
    await handler(req(query), out);
    assert.notEqual(out.payload.cacheStatus, 'hit', JSON.stringify(entry));
    assert.notEqual(out.payload.introductionYear, entry.introductionYear, JSON.stringify(entry));
    assert.equal(calls, 1, JSON.stringify(entry));
  }
});

test('age route still reuses a cached entry whose identity matches the request', async () => {
  for (const [query, brand, model, product, year] of [
    ['HP OfficeJet Pro 8710 All-in-One Printer', 'HP', 'OfficeJet Pro 8710', 'HP OfficeJet Pro 8710', 2016],
    ['Samsung Galaxy Tab A8 tablet', 'Samsung', 'Galaxy Tab A8', 'Samsung Galaxy Tab A8', 2022],
  ]) {
    const redis = createFakeRedis();
    const info = classifySmartLookupQuery(query);
    const cacheKey = buildSmartAgeCacheKey(info, { grounded: true, routeMode: chooseSmartLookupRoute(info).mode });
    await redis.set(cacheKey, prepareResultForCache({ brand, exactModel: model, likelyProduct: product, displayName: product,
      identityConfidence: 'high', introductionYear: year, bestEstimateYear: year, source: 'gemini', evidenceSource: 'gemini-ungrounded' }, info));
    let calls = 0;
    const handler = createAgeLookupHandler({
      rateLimiter: allowingRateLimiter,
      env: { SMART_LOOKUP_NATIVE_GEMINI_SEARCH_ENABLED: 'true' },
      logger: { log() {}, warn() {}, error() {} },
      localLookup: async () => null,
      redisFactory: () => redis,
      reserveProviderBudget: async () => ({ allowed: true, status: 'allowed', logicalLookupCount: 1 }),
      nativeGeminiSearchLookup: async () => { calls += 1; return nativeResult(); },
    });
    const out = res();
    await handler(req(query), out);
    assert.equal(out.payload.cacheStatus, 'hit', query);
    assert.equal(out.payload.introductionYear, year, query);
    assert.equal(calls, 0, query);
  }
});

test('fresh native research cannot return a different model without an additional provider call', async () => {
  let calls = 0;
  const handler = createAgeLookupHandler({
    rateLimiter: allowingRateLimiter,
    env: { SMART_LOOKUP_NATIVE_GEMINI_SEARCH_ENABLED: 'true' },
    logger: { log() {}, warn() {}, error() {} },
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    reserveProviderBudget: async () => ({ allowed: true, status: 'allowed', logicalLookupCount: 1 }),
    nativeGeminiSearchLookup: async () => {
      calls += 1;
      return nativeResult({ brand: 'HP', product: 'HP Envy 6055', model: 'Envy 6055',
        category: 'printer', bestEstimateYear: 2020, sources: [] });
    },
  });
  const out = res();
  await handler(req('HP OfficeJet Pro 8710 All-in-One Printer'), out);
  assert.equal(out.statusCode, 200);
  assert.notEqual(out.payload.introductionYear, 2020);
  assert.notEqual(out.payload.likelyProduct, 'HP Envy 6055');
  assert.equal(calls, 1);
});

test('classified native Gemini failure falls back to legacy Smart Lookup', async () => {
  const { handler, calls } = harness({
    enabled: true,
    native: async () => {
      throw new GeminiSearchProviderError('PROVIDER_TIMEOUT', 'timed out', { retryable: true });
    },
  });
  const out = res();
  await handler(req('Xbox One X'), out);

  assert.equal(out.statusCode, 200);
  assert.equal(calls.native, 1);
  assert.equal(calls.legacy, 1);
  assert.equal(calls.serialRefinement, 0);
  assert.equal(out.payload.summary, 'Legacy research result.');
});

test('flag off and unavailable budget store blocks native research', async () => {
  const { handler, calls } = harness({
    enabled: false,
    budgetResult: {
      allowed: false,
      status: 'unavailable',
      errorCode: 'BUDGET_STORE_UNAVAILABLE',
    },
  });
  const out = res();
  await handler(req('Xbox One X'), out);

  assert.equal(out.statusCode, 200);
  assert.equal(calls.native, 0);
  assert.equal(calls.legacy, 0);
  assert.equal(out.payload.errorCode, 'BUDGET_STORE_UNAVAILABLE');
});

test('flag on and unavailable budget store blocks native research (paid access fails closed)', async () => {
  const { handler, calls } = harness({
    enabled: true,
    budgetResult: {
      allowed: false,
      status: 'unavailable',
      errorCode: 'BUDGET_STORE_UNAVAILABLE',
    },
  });
  const out = res();
  await handler(req('Xbox One X'), out);

  assert.equal(out.statusCode, 200);
  assert.equal(calls.native, 0, 'no paid Gemini call without a working budget store');
  assert.equal(calls.legacy, 0);
  assert.equal(out.payload.errorCode, 'BUDGET_STORE_UNAVAILABLE');
  assert.equal(out.payload.providerAttempted, false);
});

test('flag on and unavailable budget store never reaches native or legacy research', async () => {
  const { handler, calls } = harness({
    enabled: true,
    budgetResult: {
      allowed: false,
      status: 'unavailable',
      errorCode: 'BUDGET_STORE_UNAVAILABLE',
    },
    native: async () => {
      throw new GeminiSearchProviderError('PROVIDER_TIMEOUT', 'timed out', { retryable: true });
    },
  });
  const out = res();
  await handler(req('Xbox One X'), out);

  assert.equal(out.statusCode, 200);
  assert.equal(calls.native, 0);
  assert.equal(calls.legacy, 0);
  assert.equal(calls.grounded, 0);
  assert.equal(out.payload.errorCode, 'BUDGET_STORE_UNAVAILABLE');
  assert.equal(out.payload.providerAttempted, false);
});

test('flag on and exhausted global budget blocks native research', async () => {
  const { handler, calls } = harness({
    enabled: true,
    budgetResult: {
      allowed: false,
      status: 'denied',
      errorCode: 'GLOBAL_BUDGET_EXHAUSTED',
    },
  });
  const out = res();
  await handler(req('Xbox One X'), out);

  assert.equal(out.statusCode, 200);
  assert.equal(calls.native, 0);
  assert.equal(calls.legacy, 0);
  assert.equal(out.payload.errorCode, 'GLOBAL_BUDGET_EXHAUSTED');
});

test('healthy budget preserves native failure fallback to legacy research', async () => {
  const { handler, calls } = harness({
    enabled: true,
    native: async () => {
      throw new GeminiSearchProviderError('PROVIDER_TIMEOUT', 'timed out', { retryable: true });
    },
    budgetResult: {
      allowed: true,
      status: 'allowed',
      logicalLookupCount: 1,
    },
  });
  const out = res();
  await handler(req('Xbox One X'), out);

  assert.equal(out.statusCode, 200);
  assert.equal(calls.native, 1);
  assert.equal(calls.legacy, 1);
  assert.equal(out.payload.summary, 'Legacy research result.');
});

for (const [precision, expectedPrecision] of [
  ['model_line', 'model-line-range'],
  ['generation', 'narrow-range'],
  ['product_family', 'family-range'],
]) {
  test(`native ${precision} result bypasses exact-model rejection`, async () => {
    const { handler, calls } = harness({
      enabled: true,
      native: async () => nativeResult({ model: null, precision }),
    });
    const out = res();
    await handler(req('Xbox One X'), out);

    assert.equal(out.statusCode, 200);
    assert.equal(calls.native, 1);
    assert.equal(calls.legacy, 0);
    assert.equal(calls.serialRefinement, 0);
    assert.equal(out.payload.precisionLevel, expectedPrecision);
    assert.equal(out.payload.summary, nativeResult().summary);
  });
}
