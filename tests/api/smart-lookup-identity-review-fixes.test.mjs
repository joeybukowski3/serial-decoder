import test from 'node:test';
import assert from 'node:assert/strict';

import { createAgeLookupHandler } from '../../api/age-lookup.js';
import { buildSmartAgeCacheKey, prepareResultForCache } from '../../lib/smart-lookup/cache.js';
import { classifySmartLookupQuery } from '../../lib/smart-lookup/normalize.js';
import { chooseSmartLookupRoute } from '../../lib/smart-lookup/route-mode.js';
import { normalizeSmartAgeResult } from '../../lib/smart-lookup/result-schema.js';
import { allowingRateLimiter } from '../helpers/allowing-rate-limiter.mjs';
import { createFakeRedis } from '../helpers/fake-redis.mjs';

// Drives the real handler with injected providers and an in-memory Redis.
// Covers marketing-name acceptance, yearContext ranges on the legacy provider
// path and in cache replay, and historical (pre-guard) exact-model records.

const SAMSUNG = 'Samsung QN55Q60BAFXZA';
const OTHER_PRODUCT_YEAR = 2013;

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
function nativeResult(overrides = {}) {
  return {
    brand: 'Samsung', product: 'Samsung QN55Q60BAFXZA', model: 'QN55Q60BAFXZA', category: 'television',
    bestEstimateYear: 2022, estimatedRange: { startYear: 2022, endYear: 2023 }, precision: 'exact_model',
    confidence: 'high', estimateBasis: 'Provider estimate.', summary: 'Provider summary.',
    isIndividualUnitDate: false, caveats: [], sources: [], ...overrides,
  };
}

// `flag` selects the native research route, which is part of the cache key, so
// a test that writes and then reads a cache entry must use the same value.
function createHarness({ native, legacy, redis = createFakeRedis(), flag = Boolean(native) } = {}) {
  const calls = { native: 0, legacy: 0 };
  const handler = createAgeLookupHandler({
    rateLimiter: allowingRateLimiter,
    env: flag ? { SMART_LOOKUP_NATIVE_GEMINI_SEARCH_ENABLED: 'true' } : {},
    logger: { log() {}, warn() {}, error() {}, info() {} },
    localLookup: async () => null,
    redisFactory: () => redis,
    reserveProviderBudget: async () => ({ allowed: true, status: 'allowed', logicalLookupCount: 1 }),
    recordProviderAttemptMetrics: async () => ({ status: 'recorded', actualProviderAttemptCount: 1 }),
    nativeGeminiSearchLookup: async () => { calls.native += 1; if (!native) throw new Error('native not expected'); return native; },
    providerLookup: async () => { calls.legacy += 1; if (!legacy) throw new Error('legacy not expected'); return legacy; },
    groundedProviderLookup: async () => { throw new Error('grounded research must not run'); },
  });
  return { handler, calls, redis };
}

async function lookup(query, options) {
  const harness = createHarness(options);
  const out = res();
  await harness.handler(req(query), out);
  await new Promise((resolve) => setImmediate(resolve));
  return { ...harness, out };
}

// The Redis key the handler reads for a request, learned from a spy.
async function cacheKeyFor(query) {
  const redis = createFakeRedis();
  const seen = [];
  const originalGet = redis.get;
  redis.get = async (key, ...rest) => { seen.push(key); return originalGet.call(redis, key, ...rest); };
  await lookup(query, { redis, flag: true });
  return seen.find((key) => key.startsWith('smart-age:'));
}

// A record exactly as a pre-guard deployment stored it: normalization has
// already written the request's own model back over whatever the provider said.
function historicalRecord(query, raw, { evidenceSource = 'gemini-ungrounded', specificity = 'partial' } = {}) {
  const info = { ...classifySmartLookupQuery(query), userNotes: '', notesHash: '' };
  const level = specificity === 'partial' ? 'product-family' : 'exact-model';
  const result = normalizeSmartAgeResult({
    brand: 'Samsung', specificityLevel: specificity, querySpecificity: level, precisionLevel: 'family-range',
    confidence: 'medium', identityConfidence: 'medium', timingConfidence: 'medium', contextLevel: 'product-family',
    estimateBasis: 'product-family-introduction', serialNeededForExactUnitDate: true, ...raw,
  }, {
    queryInfo: { ...info, specificityLevel: specificity, querySpecificity: level },
    source: 'gemini', originSource: 'gemini', evidenceSource, currentYear: 2026,
  });
  const record = JSON.parse(JSON.stringify(result));
  record.cacheStatus = 'miss';
  record.source = 'gemini';
  record.originSource = 'gemini';
  return record;
}

const OTHER_PRODUCT_YEARS = {
  bestEstimateYear: OTHER_PRODUCT_YEAR, familyIntroductionYear: OTHER_PRODUCT_YEAR,
  estimatedRange: { start: OTHER_PRODUCT_YEAR, end: OTHER_PRODUCT_YEAR + 2, current: false, basis: 'x' },
  familyRange: { start: OTHER_PRODUCT_YEAR, end: OTHER_PRODUCT_YEAR + 2, basis: 'x' },
};

function assertNoOtherProductYear(payload, label) {
  assert.ok(!JSON.stringify(payload).includes(String(OTHER_PRODUCT_YEAR)), `${label}: other product's year leaked`);
}

// --- Finding 1 ---------------------------------------------------------------

test('native exact-model answers with marketing product names are accepted', async () => {
  for (const [request, overrides] of [
    [SAMSUNG, { product: 'Samsung 55-inch Class Q60B QLED 4K Smart TV' }],
    [SAMSUNG, { product: 'Samsung Q60B QLED TV' }],
    // LG OLED65C3PUA never reaches a provider (a static seed answers it first),
    // so its marketing name is covered at guard level in age-identity-marketing-names.
  ]) {
    const run = await lookup(request, { native: nativeResult(overrides) });
    assert.equal(run.out.payload.source, 'gemini', `${request}: ${overrides.product}`);
    assert.equal(run.out.payload.errorCode ?? null, null, `${request}: ${overrides.product}`);
    assert.equal(run.out.payload.bestEstimateYear, 2022, `${request}: ${overrides.product}`);
    assert.equal(run.calls.native, 1);
    assert.equal(run.calls.legacy, 0);
  }
});

test('native exact-model answers naming a different SKU, series or family stay rejected', async () => {
  for (const overrides of [
    { product: 'Samsung 55-inch Class Q80B QLED 4K Smart TV' },
    { product: 'Samsung UN55TU7000 4K UHD TV' },
    { product: 'Samsung Q600 QLED TV' },
    { model: 'QN55Q60CAFXZA', product: 'Samsung Q60C QLED TV' },
    { model: 'UN55TU7000', product: 'Samsung Q60B QLED TV' },
  ]) {
    const run = await lookup(SAMSUNG, { native: nativeResult(overrides) });
    assert.equal(run.out.payload.errorCode, 'UNRELATED_MODEL', JSON.stringify(overrides));
    assert.notEqual(run.out.payload.source, 'gemini', JSON.stringify(overrides));
    assert.equal(run.calls.legacy, 0);
  }
});

// --- Finding 2 ---------------------------------------------------------------

const RANGE_ONLY = {
  brand: 'Samsung', specificityLevel: 'specific',
  yearContext: { type: 'production-range', startYear: 2012, endYear: 2014, confidence: 'high' },
};

test('a legacy provider yearContext range with no identity is rejected', async () => {
  const run = await lookup(SAMSUNG, { legacy: RANGE_ONLY });
  const { payload } = run.out;
  assert.equal(payload.errorCode, 'UNRELATED_MODEL');
  assert.notEqual(payload.source, 'gemini');
  assert.notEqual(payload.yearContext?.type, 'production-range');
  for (const year of ['2012', '2013', '2014']) assert.ok(!JSON.stringify(payload).includes(year), year);
  assert.equal(run.calls.legacy, 1);
});

test('a rejected legacy yearContext range is never replayed from cache', async () => {
  const redis = createFakeRedis();
  await lookup(SAMSUNG, { legacy: RANGE_ONLY, redis });
  // Whatever the repeat serves (the short-lived deterministic fallback), it is
  // not the provider's range.
  const repeat = await lookup(SAMSUNG, { legacy: RANGE_ONLY, redis });
  assert.notEqual(repeat.out.payload.source, 'gemini');
  assert.notEqual(repeat.out.payload.yearContext?.type, 'production-range');
  for (const year of ['2012', '2013', '2014']) assert.ok(!JSON.stringify(repeat.out.payload).includes(year), year);
});

test('a legacy yearContext range with defensible identity is accepted', async () => {
  const run = await lookup(SAMSUNG, { legacy: {
    brand: 'Samsung', model: 'QN55Q60BAFXZA', likelyProduct: 'Samsung Q60B QLED TV', specificityLevel: 'specific',
    yearContext: { type: 'production-range', startYear: 2022, endYear: 2023, confidence: 'high' },
  } });
  assert.equal(run.out.payload.source, 'gemini');
  assert.equal(run.out.payload.errorCode ?? null, null);
  assert.equal(run.out.payload.yearContext.startYear, 2022);
  assert.equal(run.out.payload.yearContext.endYear, 2023);
});

test('benign unknown yearContext values do not trip the identity guard', async () => {
  const run = await lookup(SAMSUNG, { legacy: {
    brand: 'Samsung', model: 'QN55Q60BAFXZA', likelyProduct: 'Samsung Q60B QLED TV', specificityLevel: 'specific',
    introductionYear: 2022, yearContext: { type: 'unknown' },
  } });
  assert.equal(run.out.payload.source, 'gemini');
  assert.equal(run.out.payload.introductionYear, 2022);
});

test('a cached yearContext range with only echoed identity is a cache miss', async () => {
  const key = await cacheKeyFor(SAMSUNG);
  const redis = createFakeRedis();
  const record = historicalRecord(SAMSUNG, { yearContext: { type: 'production-range', startYear: OTHER_PRODUCT_YEAR, endYear: OTHER_PRODUCT_YEAR + 2, confidence: 'high' } },
    { specificity: 'specific' });
  assert.equal(record.yearContext.type, 'production-range');
  assert.equal(record.yearContext.value, undefined);
  await redis.set(key, record);
  const run = await lookup(SAMSUNG, { native: nativeResult(), redis });
  assert.notEqual(run.out.payload.cacheStatus, 'hit');
  assert.equal(run.out.payload.bestEstimateYear, 2022);
  assert.equal(run.calls.native, 1);
  assertNoOtherProductYear(run.out.payload, 'yearContext replay');
});

test('a fingerprint-matched cache entry carrying only a yearContext range and no identity is a miss', async () => {
  const query = 'Dell XPS 15';
  const info = classifySmartLookupQuery(query);
  const key = buildSmartAgeCacheKey(info, { grounded: true, routeMode: chooseSmartLookupRoute(info).mode });
  for (const yearContext of [
    { type: 'production-range', startYear: OTHER_PRODUCT_YEAR, endYear: OTHER_PRODUCT_YEAR + 2 },
    { type: 'production-range', startYear: OTHER_PRODUCT_YEAR },
  ]) {
    const redis = createFakeRedis();
    await redis.set(key, prepareResultForCache({ brand: 'Dell', source: 'gemini', evidenceSource: 'gemini-ungrounded', yearContext }, info));
    const run = await lookup(query, { redis, flag: true, native: nativeResult({
      brand: 'Dell', category: 'laptop', precision: 'model_line', product: 'Dell XPS 15 9530', model: 'XPS 15 9530',
      bestEstimateYear: 2023, estimatedRange: { startYear: 2023, endYear: 2025 } }) });
    assert.notEqual(run.out.payload.cacheStatus, 'hit', JSON.stringify(yearContext));
    assert.equal(run.out.payload.bestEstimateYear, 2023, JSON.stringify(yearContext));
    assert.equal(run.calls.native, 1);
    assertNoOtherProductYear(run.out.payload, JSON.stringify(yearContext));
  }
});

test('a fingerprint-matched cache entry with a benign unknown yearContext and no identity still hits', async () => {
  const query = 'Dell XPS 15';
  const info = classifySmartLookupQuery(query);
  const key = buildSmartAgeCacheKey(info, { grounded: true, routeMode: chooseSmartLookupRoute(info).mode });
  const redis = createFakeRedis();
  await redis.set(key, prepareResultForCache({ brand: 'Dell', source: 'gemini', evidenceSource: 'gemini-ungrounded',
    yearContext: { type: 'unknown', label: 'Year context', confidence: 'partial', source: 'local-seed', isExactUnitDate: false } }, info));
  const run = await lookup(query, { redis, flag: true });
  assert.equal(run.out.payload.cacheStatus, 'hit');
  assert.equal(run.calls.native + run.calls.legacy, 0);
});

// --- Finding 3 ---------------------------------------------------------------

test('a historical exact-model record with only a generic product and a foreign year is a cache miss', async () => {
  const key = await cacheKeyFor(SAMSUNG);
  for (const raw of [
    { likelyProduct: 'Samsung Crystal UHD TV', displayName: 'Samsung Crystal UHD TV' },
    { likelyProduct: 'Samsung QLED TV' },
    { model: 'UN55TU7000', likelyProduct: 'Samsung Crystal UHD TV' },
    {},
  ]) {
    const redis = createFakeRedis();
    const record = historicalRecord(SAMSUNG, { ...OTHER_PRODUCT_YEARS, ...raw });
    assert.equal(record.exactModel, 'QN55Q60BAFXZA', 'normalization echoed the requested model');
    assert.equal(record.bestEstimateYear, OTHER_PRODUCT_YEAR);
    await redis.set(key, record);
    const run = await lookup(SAMSUNG, { native: nativeResult(), redis });
    assert.notEqual(run.out.payload.cacheStatus, 'hit', JSON.stringify(raw));
    assert.equal(run.out.payload.bestEstimateYear, 2022, JSON.stringify(raw));
    assert.equal(run.calls.native, 1, JSON.stringify(raw));
    assertNoOtherProductYear(run.out.payload, JSON.stringify(raw));
  }
});

test('a historical exact-model record whose product names the requested model still hits', async () => {
  const key = await cacheKeyFor(SAMSUNG);
  for (const likelyProduct of [
    'Samsung QN55Q60BAFXZA 55 inch QLED',
    'Samsung 55-inch Class Q60B QLED 4K Smart TV',
    'Samsung Q60B QLED TV',
  ]) {
    const redis = createFakeRedis();
    await redis.set(key, historicalRecord(SAMSUNG, {
      likelyProduct, displayName: likelyProduct, model: 'QN55Q60BAFXZA', bestEstimateYear: 2022, familyIntroductionYear: 2022,
      estimatedRange: { start: 2022, end: 2023, current: false, basis: 'x' }, familyRange: { start: 2022, end: 2023, basis: 'x' } }));
    const run = await lookup(SAMSUNG, { redis, flag: true });
    assert.equal(run.out.payload.cacheStatus, 'hit', likelyProduct);
    assert.equal(run.out.payload.bestEstimateYear, 2022, likelyProduct);
    assert.equal(run.calls.native + run.calls.legacy, 0, likelyProduct);
  }
});

test('a historical exact-model record whose product contradicts the requested model is a miss', async () => {
  const key = await cacheKeyFor(SAMSUNG);
  const redis = createFakeRedis();
  await redis.set(key, historicalRecord(SAMSUNG, { ...OTHER_PRODUCT_YEARS, likelyProduct: 'Samsung UN55TU7000 4K UHD TV' }));
  const run = await lookup(SAMSUNG, { native: nativeResult(), redis });
  assert.notEqual(run.out.payload.cacheStatus, 'hit');
  assert.equal(run.out.payload.bestEstimateYear, 2022);
  assertNoOtherProductYear(run.out.payload, 'contradictory product');
});

test('an undated historical exact-model record is not affected by the product-evidence rule', async () => {
  const key = await cacheKeyFor(SAMSUNG);
  const redis = createFakeRedis();
  await redis.set(key, historicalRecord(SAMSUNG, { likelyProduct: 'Samsung Crystal UHD TV' }));
  const run = await lookup(SAMSUNG, { redis, flag: true });
  assert.equal(run.out.payload.cacheStatus, 'hit');
  assert.equal(run.out.payload.bestEstimateYear ?? null, null);
});

test('a fresh exact-model answer with a generic product is cached and reused without another provider call', async () => {
  // The provider named the requested model, so the guard accepted it. Its
  // generic product name must not make our own cache entry a permanent miss.
  const redis = createFakeRedis();
  const first = await lookup(SAMSUNG, { native: nativeResult({ product: 'Samsung QLED TV' }), redis });
  assert.equal(first.out.payload.source, 'gemini');
  assert.equal(first.calls.native, 1);
  const repeat = await lookup(SAMSUNG, { redis, flag: true });
  assert.equal(repeat.out.payload.cacheStatus, 'hit');
  assert.equal(repeat.out.payload.bestEstimateYear, 2022);
  assert.equal(repeat.calls.native + repeat.calls.legacy, 0);
});

test('a cached exact-model record for another model is never reused', async () => {
  const redis = createFakeRedis();
  await lookup(SAMSUNG, { native: nativeResult({ product: 'Samsung QLED TV' }), redis });
  const key = [...redis.strings.keys()].find((k) => k.startsWith('smart-age:'));
  // Same key (as if it collided) but the stamp belongs to another model.
  const record = JSON.parse(JSON.stringify(redis.strings.get(key)));
  await redis.set(key, { ...record, model: 'QN65Q80BAFXZA', exactModel: 'QN65Q80BAFXZA' });
  const run = await lookup(SAMSUNG, { native: nativeResult({ bestEstimateYear: 2021, estimatedRange: { startYear: 2021, endYear: 2022 } }), redis });
  assert.notEqual(run.out.payload.cacheStatus, 'hit');
});
