import assert from 'node:assert/strict';
import test from 'node:test';
import { createRefineSerialDateHandler } from '../../api/refine-serial-date.js';

function createResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; },
  };
}

function silentLogger() {
  return { info() {}, error() {}, warn() {} };
}

function request(overrides = {}) {
  return {
    method: 'POST',
    headers: { 'x-request-id': 'mode-parity', 'x-forwarded-for': '203.0.113.10' },
    body: {
      brand: 'Whirlpool',
      category: 'appliances',
      serial: 'MB1930745',
      model: 'WED4850HWO',
      candidateYears: [1992, 2012, 2022],
      decodedMonth: 'Serial cycle',
      context: '',
      ...overrides,
    },
  };
}

const SCHEMA_FIELDS = [
  'status',
  'candidateYears',
  'remainingCandidateYears',
  'chosenYear',
  'preferredCandidateYear',
  'confidence',
  'resolutionBasis',
  'modelProductionRange',
  'modelIdentity',
  'evidence',
  'summary',
  'refinementResultTier',
  'searchedModels',
  'cacheStatus',
  'provider',
  'timings',
  'errorCode',
  'failureCategory',
  'failureStage',
  'failureCode',
  'deterministicFallbackUsed',
];

function assertSchemaCompatible(payload) {
  for (const field of SCHEMA_FIELDS) {
    assert.ok(field in payload, `missing schema field ${field}`);
  }
  assert.ok(payload.modelIdentity);
  assert.equal(payload.modelIdentity.enteredModel, 'WED4850HWO');
  assert.equal(payload.modelIdentity.canonicalModel, 'WED4850HW0');
  assert.ok(Array.isArray(payload.searchedModels));
  assert.ok(payload.searchedModels.includes('WED4850HWO'));
  assert.ok(payload.searchedModels.includes('WED4850HW0'));
}

test('legacy_gemini and deterministic_serper produce schema-compatible responses', async () => {
  const legacy = createRefineSerialDateHandler({
    refinementMode: 'legacy_gemini',
    localLookup: async () => ({ evidence: [], normalization: null }),
    modelProductionLookup: async () => null,
    legacyProviderLookup: async () => ({
      evidence: [{
        type: 'manufacturer',
        title: 'Whirlpool WED4850HW0',
        quality: 'official',
        verified: true,
        productionStart: 2019,
        productionEnd: null,
        supports: 'Model introduced 2019+',
        sourceUrl: 'https://example.com/wed4850',
      }],
    }),
    redisFactory: () => null,
    logger: silentLogger(),
  });
  const deterministic = createRefineSerialDateHandler({
    refinementMode: 'deterministic_serper',
    localLookup: async () => ({ evidence: [], normalization: null }),
    modelProductionLookup: async () => null,
    deterministicProviderLookup: async () => ({
      status: 'success',
      errorCode: null,
      evidence: [{
        type: 'manufacturer',
        title: 'Whirlpool WED4850HW0',
        quality: 'official',
        verified: false,
        productionStart: 2019,
        productionEnd: null,
        supports: 'Model introduced 2019+',
        sourceUrl: 'https://example.com/wed4850',
      }],
      extractedFacts: [{
        resultIndex: 0,
        exactModelMatch: true,
        modelMatchType: 'canonical-equivalent',
        dateMeaning: 'product_launch',
        approximateYear: 2019,
        absoluteDate: null,
        normalizedDateYear: 2019,
      }],
      output: {
        resolutionType: 'narrowed',
        plausibleYears: [2022],
        bestEstimateYear: 2022,
        confidence: 'moderate',
        estimatedModelEra: { startYear: 2019, endYear: null },
      },
      modelIdentity: null,
      searchedModels: ['WED4850HWO', 'WED4850HW0'],
      lifecycle: { supportedProductionStartYear: 2019, supportedProductionEndYear: null },
      timings: { serperMs: 10, geminiMs: 20, totalMs: 30, serperRequestCount: 1 },
      sharedEvidence: {
        status: 'success',
        failureCategory: null,
        providerSummary: { searchCount: 1, extractorUsed: true, searchResultCount: 5 },
      },
      gemini: { status: 'success' },
    }),
    redisFactory: () => null,
    logger: silentLogger(),
  });

  const legacyRes = createResponse();
  const detRes = createResponse();
  await legacy(request(), legacyRes);
  await deterministic(request(), detRes);

  assertSchemaCompatible(legacyRes.payload);
  assertSchemaCompatible(detRes.payload);
  assert.equal(legacyRes.payload.modelIdentity.canonicalModel, detRes.payload.modelIdentity.canonicalModel);
  assert.deepEqual(legacyRes.payload.candidateYears, detRes.payload.candidateYears);
});

test('deterministic_serper supports ranked result tier', async () => {
  const handler = createRefineSerialDateHandler({
    refinementMode: 'deterministic_serper',
    localLookup: async () => ({ evidence: [], normalization: null }),
    modelProductionLookup: async () => null,
    deterministicProviderLookup: async () => ({
      status: 'success',
      errorCode: null,
      evidence: [],
      extractedFacts: [{
        resultIndex: 0,
        exactModelMatch: true,
        modelMatchType: 'canonical-equivalent',
        dateMeaning: 'product_launch',
        approximateYear: 2010,
        absoluteDate: null,
        normalizedDateYear: 2010,
      }],
      output: {
        resolutionType: 'unchanged',
        plausibleYears: [1992, 2012, 2022],
        confidence: 'moderate',
        estimatedModelEra: { startYear: 2010, endYear: null },
      },
      lifecycle: { supportedProductionStartYear: 2010 },
      timings: { serperMs: 5, geminiMs: 5, totalMs: 10, serperRequestCount: 1 },
      sharedEvidence: { status: 'partial', failureCategory: null, providerSummary: { searchCount: 1, extractorUsed: true } },
      gemini: { status: 'success' },
    }),
    redisFactory: () => null,
    logger: silentLogger(),
  });
  const res = createResponse();
  await handler(request({ candidateYears: [1992, 2012, 2022] }), res);
  assert.equal(res.payload.status, 'ranked');
  // Lower-bound ranking prefers the serial-valid year closest to the
  // model's introduction year (2010), not merely the newest candidate.
  assert.equal(res.payload.preferredCandidateYear, 2012);
  assert.deepEqual(res.payload.remainingCandidateYears, [1992, 2012, 2022]);
  assert.equal(res.payload.refinementResultTier, 'ranked');
});

test('timeout returns useful deterministic fallback with failure taxonomy', async () => {
  const logs = [];
  const handler = createRefineSerialDateHandler({
    refinementMode: 'deterministic_serper',
    totalBudgetMs: 50,
    providerBudgetMs: 40,
    completionReserveMs: 5,
    localLookup: async () => ({ evidence: [], normalization: null }),
    modelProductionLookup: async () => ({
      narrowedYears: [2022],
      confidence: 'low',
      source: 'model production',
      sourceUrl: 'https://example.com',
      productionStartYear: 2019,
      matchedModel: 'WED4850HW0',
      matchType: 'exact',
    }),
    // Force online path by not fully resolving via production DB alone when
    // candidates are already narrowed to one — if local resolves, great;
    // otherwise provider throws timeout.
    deterministicProviderLookup: async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
      throw Object.assign(new Error('timeout'), { name: 'AbortError', code: 'STAGE_TIMEOUT' });
    },
    redisFactory: () => null,
    logger: { info: (line) => logs.push(line), error() {}, warn() {} },
  });
  const res = createResponse();
  // Use candidates that model production will not fully resolve alone.
  await handler(request({ candidateYears: [1992, 2012, 2022] }), res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.payload));
  assert.ok(['resolved', 'ranked', 'ambiguous', 'ambiguous_with_era', 'unavailable'].includes(res.payload.status));
  // Serial candidates must remain present in the original set.
  assert.ok(res.payload.candidateYears.includes(1992));
  assert.ok(res.payload.candidateYears.includes(2022));
  if (res.payload.errorCode || res.payload.failureCode) {
    assert.ok(res.payload.failureCategory || res.payload.failureStage);
  }
  const telemetry = logs.map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).find((entry) => entry?.event === 'serial_refinement');
  assert.ok(telemetry);
  assert.equal(telemetry.refinementMode, 'deterministic_serper');
  assert.equal(telemetry.enteredModel, 'WED4850HWO');
  assert.equal(telemetry.canonicalModel, 'WED4850HW0');
  assert.doesNotMatch(JSON.stringify(telemetry), /MB1930745/);
});

test('duplicate concurrent requests share inflight work', async () => {
  let providerCalls = 0;
  const store = new Map();
  const handler = createRefineSerialDateHandler({
    refinementMode: 'deterministic_serper',
    inflightStore: store,
    localLookup: async () => ({ evidence: [], normalization: null }),
    modelProductionLookup: async () => null,
    deterministicProviderLookup: async () => {
      providerCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 30));
      return {
        status: 'success',
        errorCode: null,
        evidence: [],
        extractedFacts: [{
          resultIndex: 0,
          exactModelMatch: true,
          modelMatchType: 'exact',
          dateMeaning: 'product_launch',
          approximateYear: 2019,
          absoluteDate: null,
          normalizedDateYear: 2019,
        }],
        output: {
          resolutionType: 'unchanged',
          plausibleYears: [1992, 2022],
          confidence: 'moderate',
          estimatedModelEra: { startYear: 2019, endYear: null },
        },
        lifecycle: { supportedProductionStartYear: 2019 },
        timings: { serperMs: 1, geminiMs: 1, totalMs: 2, serperRequestCount: 1 },
        sharedEvidence: { status: 'success', providerSummary: { searchCount: 1, extractorUsed: true } },
        gemini: { status: 'success' },
      };
    },
    redisFactory: () => null,
    logger: silentLogger(),
  });
  const a = createResponse();
  const b = createResponse();
  await Promise.all([handler(request(), a), handler(request(), b)]);
  assert.equal(providerCalls, 1);
  assert.equal(a.payload.status, b.payload.status);
});

test('malformed deterministic provider degrades without inventing an exact year', async () => {
  const handler = createRefineSerialDateHandler({
    refinementMode: 'deterministic_serper',
    localLookup: async () => ({ evidence: [], normalization: null }),
    modelProductionLookup: async () => null,
    deterministicProviderLookup: async () => ({
      status: 'provider_error',
      errorCode: 'DETERMINISTIC_GEMINI_ERROR',
      failureCategory: 'EXTRACTOR_SCHEMA_INVALID',
      evidence: [],
      extractedFacts: [],
      output: {},
      timings: { serperMs: 2, geminiMs: 2, totalMs: 4, serperRequestCount: 1 },
      sharedEvidence: { status: 'error', failureCategory: 'EXTRACTOR_SCHEMA_INVALID' },
      gemini: { status: 'error' },
    }),
    redisFactory: () => null,
    logger: silentLogger(),
  });
  const res = createResponse();
  await handler(request(), res);
  assert.equal(res.payload.chosenYear, null);
  assert.ok(res.payload.candidateYears.length >= 2);
  assert.notEqual(res.payload.status, 'resolved');
  assert.equal(res.payload.failureCategory, 'extraction_malformed');
});

test('redis failure does not erase deterministic ranked results', async () => {
  const handler = createRefineSerialDateHandler({
    refinementMode: 'deterministic_serper',
    localLookup: async () => ({ evidence: [], normalization: null }),
    modelProductionLookup: async () => null,
    deterministicProviderLookup: async () => ({
      status: 'success',
      errorCode: null,
      evidence: [],
      extractedFacts: [{
        resultIndex: 0,
        exactModelMatch: true,
        modelMatchType: 'canonical-equivalent',
        dateMeaning: 'product_launch',
        approximateYear: 2010,
        absoluteDate: null,
        normalizedDateYear: 2010,
      }],
      output: {
        resolutionType: 'unchanged',
        plausibleYears: [1992, 2012, 2022],
        confidence: 'moderate',
        estimatedModelEra: { startYear: 2010, endYear: null },
      },
      lifecycle: { supportedProductionStartYear: 2010 },
      timings: { serperMs: 1, geminiMs: 1, totalMs: 2, serperRequestCount: 1 },
      sharedEvidence: { status: 'success', providerSummary: { searchCount: 1, extractorUsed: true } },
      gemini: { status: 'success' },
    }),
    redisFactory: () => ({
      async get() { throw new Error('redis down'); },
      async set() { throw new Error('redis down'); },
    }),
    rateLimitFactory: () => ({
      async limit() { return { success: true }; },
    }),
    logger: silentLogger(),
  });
  const res = createResponse();
  await handler(request({ candidateYears: [1992, 2012, 2022] }), res);
  assert.equal(res.payload.status, 'ranked');
  // Lower-bound ranking prefers the serial-valid year closest to the
  // model's introduction year (2010), not merely the newest candidate.
  assert.equal(res.payload.preferredCandidateYear, 2012);
});
