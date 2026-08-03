import test from 'node:test';
import assert from 'node:assert/strict';

import { createAgeLookupHandler } from '../../api/age-lookup.js';
import { GeminiSearchProviderError } from '../../lib/smart-lookup/gemini-search-provider.js';

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
    likelyProduct: 'Legacy Xbox result',
    specificityLevel: 'unknown',
    introductionYear: 2018,
    identityConfidence: 'medium',
    summary: 'Legacy research result.',
  };
}

function harness({ enabled, native, legacy, budgetResult } = {}) {
  const calls = { native: 0, legacy: 0, grounded: 0, serialRefinement: 0 };
  const handler = createAgeLookupHandler({
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

test('flag on and unavailable budget store permits one successful native attempt', async () => {
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
  assert.equal(calls.native, 1);
  assert.equal(calls.legacy, 0);
  assert.equal(out.payload.summary, nativeResult().summary);
});

test('flag on and unavailable budget store does not enter legacy research after native failure', async () => {
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
  assert.equal(calls.native, 1);
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
