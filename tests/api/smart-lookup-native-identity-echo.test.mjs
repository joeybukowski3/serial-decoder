import test from 'node:test';
import assert from 'node:assert/strict';

import { createAgeLookupHandler } from '../../api/age-lookup.js';
import { allowingRateLimiter } from '../helpers/allowing-rate-limiter.mjs';
import { createFakeRedis } from '../helpers/fake-redis.mjs';

// The native Gemini path rebuilds identity from the request while it
// normalizes (the request's model/exactModel are written back into the
// result). These tests drive the real handler, native mapping, validation and
// deterministic fallback with an injected provider, so a provider that never
// established the requested product cannot launder a year through that echo.

const EXACT_REQUEST = 'Samsung QN55Q60BAFXZA';
const PROVIDER_YEAR = 2013;
const YEAR_FIELDS = [
  'bestEstimateYear', 'introductionYear', 'estimatedYear', 'familyIntroductionYear',
  'lineIntroductionYear', 'categoryEntryYear', 'individualManufactureYear',
];

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
    brand: 'Samsung',
    product: null,
    model: null,
    category: 'television',
    bestEstimateYear: PROVIDER_YEAR,
    estimatedRange: { startYear: PROVIDER_YEAR, endYear: PROVIDER_YEAR + 2 },
    precision: 'product_family',
    confidence: 'medium',
    estimateBasis: 'Provider estimate.',
    summary: 'Provider summary.',
    isIndividualUnitDate: false,
    caveats: [],
    sources: [],
    ...overrides,
  };
}

function createHarness(native, { redis } = {}) {
  const calls = { native: 0, legacy: 0 };
  const handler = createAgeLookupHandler({
    rateLimiter: allowingRateLimiter,
    env: { SMART_LOOKUP_NATIVE_GEMINI_SEARCH_ENABLED: 'true' },
    logger: { log() {}, warn() {}, error() {}, info() {} },
    localLookup: async () => null,
    redisFactory: () => redis || { get: async () => null, set: async () => {}, eval: async () => [1, 1, 1],
      incrby: async (_key, amount) => amount, expire: async () => 1 },
    reserveProviderBudget: async () => ({ allowed: true, status: 'allowed', logicalLookupCount: 1 }),
    nativeGeminiSearchLookup: async () => { calls.native += 1; return native; },
    providerLookup: async () => { calls.legacy += 1; throw new Error('legacy research must not run'); },
    groundedProviderLookup: async () => { throw new Error('grounded research must not run'); },
  });
  return { handler, calls };
}

async function lookup(query, native, options) {
  const harness = createHarness(native, options);
  const out = res();
  await harness.handler(req(query), out);
  return { out, calls: harness.calls, handler: harness.handler };
}

function assertRejected({ out, calls }, label) {
  const { payload } = out;
  assert.equal(out.statusCode, 200, label);
  assert.equal(calls.native, 1, `${label}: native provider consulted once`);
  assert.equal(calls.legacy, 0, `${label}: no additional provider call`);
  assert.equal(payload.errorCode, 'UNRELATED_MODEL', `${label}: errorCode`);
  assert.notEqual(payload.source, 'gemini', `${label}: source`);
  assert.ok(!String(payload.evidenceSource || '').startsWith('gemini'), `${label}: evidenceSource`);
  for (const field of YEAR_FIELDS) assert.notEqual(payload[field], PROVIDER_YEAR, `${label}: ${field}`);
  assert.ok(!JSON.stringify(payload).includes(String(PROVIDER_YEAR)), `${label}: provider year absent from payload`);
}

const BROADER_PRECISIONS = ['product_family', 'model_line', 'generation', 'category_era'];

test('native result with no defensible product identity cannot carry a year for an exact-model request', async () => {
  for (const precision of BROADER_PRECISIONS) {
    const run = await lookup(EXACT_REQUEST, nativeResult({ precision }));
    assertRejected(run, `no identity / ${precision}`);
  }
});

test('native result with only generic product-family information is rejected for an exact-model request', async () => {
  for (const product of ['Samsung Crystal UHD TV', 'Samsung QLED TV', 'Samsung television']) {
    for (const precision of BROADER_PRECISIONS) {
      const run = await lookup(EXACT_REQUEST, nativeResult({ product, precision }));
      assertRejected(run, `${product} / ${precision}`);
    }
  }
});

test('native result naming a contradictory model is rejected at every precision', async () => {
  const contradictions = [
    { model: 'UN55TU7000' },
    { model: 'UN55TU7000', product: 'Samsung UN55TU7000 TU7000 Series' },
    { model: null, product: 'Samsung UN55TU7000' },
  ];
  for (const contradiction of contradictions) {
    for (const precision of [...BROADER_PRECISIONS, 'exact_model']) {
      const run = await lookup(EXACT_REQUEST, nativeResult({ precision, ...contradiction }));
      assertRejected(run, `${JSON.stringify(contradiction)} / ${precision}`);
    }
  }
});

test('native result with a matching model but a conflicting product name is rejected', async () => {
  const run = await lookup(EXACT_REQUEST, nativeResult({
    precision: 'model_line', model: 'QN55Q60BAFXZA', product: 'Samsung UN55TU7000' }));
  assertRejected(run, 'conflicting displayName');
});

test('a rejected native result is not served from cache on a repeat request', async () => {
  const redis = createFakeRedis();
  const { handler } = await lookup(EXACT_REQUEST, nativeResult({ precision: 'model_line', model: 'UN55TU7000' }), { redis });
  const repeat = res();
  await handler(req(EXACT_REQUEST), repeat);
  assert.notEqual(repeat.payload.source, 'gemini');
  assert.ok(!JSON.stringify(repeat.payload).includes(String(PROVIDER_YEAR)));
});

test('a native result that identifies the requested exact model is still accepted', async () => {
  const run = await lookup(EXACT_REQUEST, nativeResult({
    precision: 'exact_model', model: 'QN55Q60BAFXZA', product: 'Samsung QN55Q60BAFXZA 55 inch Q60B QLED',
    bestEstimateYear: 2022, estimatedRange: { startYear: 2022, endYear: 2023 }, confidence: 'high' }));
  assert.equal(run.out.payload.source, 'gemini');
  assert.equal(run.out.payload.errorCode ?? null, null);
  assert.equal(run.out.payload.bestEstimateYear, 2022);
  assert.equal(run.out.payload.querySpecificity, 'exact-model');
  assert.equal(run.calls.legacy, 0);
});

test('LG C3 -> OLED65C3PUA is accepted without promoting identity precision or confidence', async () => {
  const run = await lookup('LG C3', nativeResult({
    brand: 'LG', category: 'television', precision: 'model_line', confidence: 'medium',
    product: 'LG C3 OLED TV', model: 'OLED65C3PUA',
    bestEstimateYear: 2023, estimatedRange: { startYear: 2023, endYear: 2024 } }));
  const { payload } = run.out;
  assert.equal(payload.source, 'gemini');
  assert.equal(payload.errorCode ?? null, null);
  assert.equal(payload.bestEstimateYear, 2023);
  // Precision and confidence stay exactly what the provider reported.
  assert.equal(payload.querySpecificity, 'model-line');
  assert.equal(payload.precisionLevel, 'model-line-range');
  assert.equal(payload.confidenceLevel, 'medium');
  assert.notEqual(payload.identityConfidence, 'high');
  assert.equal(payload.exactModel ?? null, null);
});

test('Dell XPS 15 -> Dell XPS 15 9530 is accepted without promoting identity precision or confidence', async () => {
  const run = await lookup('Dell XPS 15', nativeResult({
    brand: 'Dell', category: 'laptop', precision: 'model_line', confidence: 'medium',
    product: 'Dell XPS 15 9530', model: 'XPS 15 9530',
    bestEstimateYear: 2023, estimatedRange: { startYear: 2023, endYear: 2025 } }));
  const { payload } = run.out;
  assert.equal(payload.source, 'gemini');
  assert.equal(payload.errorCode ?? null, null);
  assert.equal(payload.bestEstimateYear, 2023);
  assert.equal(payload.querySpecificity, 'model-line');
  assert.equal(payload.precisionLevel, 'model-line-range');
  assert.equal(payload.confidenceLevel, 'medium');
  assert.notEqual(payload.identityConfidence, 'high');
  assert.equal(payload.exactModel ?? null, null);
});

test('an accepted upgrade never raises the provider-reported confidence', async () => {
  const run = await lookup('Dell XPS 15', nativeResult({
    brand: 'Dell', category: 'laptop', precision: 'model_line', confidence: 'low',
    product: 'Dell XPS 15 9530', model: 'XPS 15 9530',
    bestEstimateYear: 2023, estimatedRange: { startYear: 2023, endYear: 2025 } }));
  assert.equal(run.out.payload.source, 'gemini');
  assert.equal(run.out.payload.confidenceLevel, 'low');
  assert.notEqual(run.out.payload.identityConfidence, 'high');
});

test('conflicting upgrades are rejected through the real native path', async () => {
  const cases = [
    ['LG C3', { brand: 'LG', category: 'television', model: 'OLED65C2PUA', product: 'LG C2 OLED TV' }],
    ['LG C3', { brand: 'LG', category: 'television', model: 'OLED65C3PUA', product: 'LG G3 OLED TV' }],
    ['Dell XPS 15', { brand: 'Dell', category: 'laptop', model: 'XPS 13 9315', product: 'Dell XPS 13 9315' }],
    ['Dell XPS 15', { brand: 'Dell', category: 'laptop', model: 'XPS 15 9530', product: 'Dell XPS 17 9730' }],
  ];
  for (const [request, overrides] of cases) {
    const run = await lookup(request, nativeResult({ precision: 'model_line', ...overrides }));
    assertRejected(run, `${request} / ${overrides.model} / ${overrides.product}`);
  }
});

test('a model-line request with no provider identity is rejected when it carries a year', async () => {
  const run = await lookup('Dell XPS 15', nativeResult({ brand: 'Dell', category: 'laptop', precision: 'model_line' }));
  assertRejected(run, 'Dell XPS 15 / no identity');
});
