/**
 * Production canary suite — mocked providers only.
 * Covers recent Whirlpool / VIZIO / Lenovo / Nintendo regressions and
 * infrastructure degradation classes without paid live providers.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRefineSerialDateHandler } from '../../api/refine-serial-date.js';
import { buildSharedModelIdentity } from '../../lib/model-evidence/shared-model-identity.js';
import { budgetsForRefinementMode } from '../../lib/serial-refinement/budgets.js';

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

function post(handler, body) {
  const res = createResponse();
  return handler({
    method: 'POST',
    headers: { 'x-request-id': `canary-${body.model}` },
    body: {
      decodedMonth: 'Serial cycle',
      context: '',
      ...body,
    },
  }, res).then(() => res);
}

/** Lower-bound ranking with multiple modern serial cycles → ranked (not resolved). */
function rankedDeterministic(lowerBound = 2010) {
  return {
    status: 'success',
    errorCode: null,
    evidence: [],
    extractedFacts: [{
      resultIndex: 0,
      exactModelMatch: true,
      modelMatchType: 'canonical-equivalent',
      dateMeaning: 'product_launch',
      approximateYear: lowerBound,
      absoluteDate: null,
      normalizedDateYear: lowerBound,
    }],
    output: {
      resolutionType: 'unchanged',
      plausibleYears: [1992, 2012, 2022],
      confidence: 'moderate',
      estimatedModelEra: { startYear: lowerBound, endYear: null },
    },
    lifecycle: { supportedProductionStartYear: lowerBound },
    timings: { serperMs: 12, geminiMs: 18, totalMs: 40, serperRequestCount: 1 },
    sharedEvidence: {
      status: 'success',
      providerSummary: { searchCount: 1, extractorUsed: true, searchResultCount: 4 },
    },
    gemini: { status: 'success' },
  };
}

test('canary: Whirlpool WED4850HWO ranks modern cycle without inventing exact day', async () => {
  let serperCalls = 0;
  let openaiCalls = 0;
  let xaiCalls = 0;
  const handler = createRefineSerialDateHandler({
    refinementMode: 'deterministic_serper',
    localLookup: async () => ({ evidence: [], normalization: null }),
    modelProductionLookup: async () => null,
    deterministicProviderLookup: async () => {
      serperCalls += 1;
      return rankedDeterministic(2010);
    },
    legacyProviderLookup: async () => { throw new Error('legacy must not run'); },
    redisFactory: () => null,
    logger: silentLogger(),
  });
  const identity = buildSharedModelIdentity({
    brand: 'Whirlpool',
    model: 'WED4850HWO',
    category: 'appliances',
  });
  const res = await post(handler, {
    brand: 'Whirlpool',
    category: 'appliances',
    serial: 'MB1930745',
    model: 'WED4850HWO',
    candidateYears: [1992, 2012, 2022],
    decodedMonth: 'Serial cycle',
  });
  assert.equal(res.payload.status, 'ranked');
  assert.equal(res.payload.preferredCandidateYear, 2022);
  assert.equal(res.payload.modelIdentity.canonicalModel, identity.canonicalModel);
  assert.equal(res.payload.chosenYear, null);
  assert.equal(serperCalls, 1);
  assert.equal(openaiCalls + xaiCalls, 0);
  assert.ok((res.payload.timings?.totalMs || 0) < budgetsForRefinementMode('deterministic_serper').apiTotalMs);
});

test('canary: Whirlpool WED4850HW0 same canonical identity', async () => {
  const handler = createRefineSerialDateHandler({
    refinementMode: 'deterministic_serper',
    localLookup: async () => ({ evidence: [], normalization: null }),
    modelProductionLookup: async () => null,
    deterministicProviderLookup: async () => rankedDeterministic(2010),
    redisFactory: () => null,
    logger: silentLogger(),
  });
  const res = await post(handler, {
    brand: 'Whirlpool',
    category: 'appliances',
    serial: 'MB1930745',
    model: 'WED4850HW0',
    candidateYears: [1992, 2012, 2022],
    decodedMonth: 'Serial cycle',
  });
  assert.equal(res.payload.modelIdentity.canonicalModel, 'WED4850HW0');
  assert.equal(res.payload.status, 'ranked');
  assert.equal(res.payload.preferredCandidateYear, 2022);
});

test('canary: VIZIO M321i-A2 preserves identity', async () => {
  const handler = createRefineSerialDateHandler({
    refinementMode: 'deterministic_serper',
    localLookup: async () => ({ evidence: [], normalization: null }),
    modelProductionLookup: async () => null,
    deterministicProviderLookup: async () => ({
      status: 'insufficient',
      errorCode: 'DETERMINISTIC_INSUFFICIENT_EVIDENCE',
      evidence: [],
      extractedFacts: [],
      output: {},
      timings: { serperMs: 5, geminiMs: 5, totalMs: 10, serperRequestCount: 1 },
      sharedEvidence: { status: 'no_exact_evidence', failureCategory: 'NO_EXACT_MODEL_EVIDENCE' },
    }),
    redisFactory: () => null,
    logger: silentLogger(),
  });
  const res = await post(handler, {
    brand: 'VIZIO',
    category: 'electronics',
    serial: 'LTAQVB',
    model: 'M321i-A2',
    candidateYears: [2013, 2014],
  });
  assert.equal(res.payload.modelIdentity.enteredModel, 'M321i-A2');
  assert.ok(res.payload.candidateYears.includes(2013));
  assert.equal(res.payload.chosenYear, null);
});

test('canary: LG + M321i-A2 does not invent brand-wrong manufacture year', async () => {
  const handler = createRefineSerialDateHandler({
    refinementMode: 'deterministic_serper',
    localLookup: async () => ({ evidence: [], normalization: null }),
    modelProductionLookup: async () => null,
    deterministicProviderLookup: async () => ({
      status: 'insufficient',
      errorCode: 'DETERMINISTIC_INSUFFICIENT_EVIDENCE',
      evidence: [],
      extractedFacts: [],
      output: {},
      timings: { serperMs: 1, geminiMs: 0, totalMs: 1, serperRequestCount: 1 },
      sharedEvidence: { status: 'no_exact_evidence' },
    }),
    redisFactory: () => null,
    logger: silentLogger(),
  });
  const res = await post(handler, {
    brand: 'LG',
    category: 'electronics',
    serial: '123ABC',
    model: 'M321i-A2',
    candidateYears: [2010, 2020],
  });
  assert.notEqual(res.payload.status, 'resolved');
  assert.equal(res.payload.chosenYear, null);
});

test('canary: Lenovo ThinkSystem ST50 / V2 / 7Y48 keep useful context', async () => {
  for (const model of ['Lenovo ThinkSystem ST50', 'Lenovo ThinkSystem ST50 V2', 'Lenovo 7Y48']) {
    const handler = createRefineSerialDateHandler({
      refinementMode: 'deterministic_serper',
      localLookup: async () => ({ evidence: [], normalization: null }),
      modelProductionLookup: async () => null,
      deterministicProviderLookup: async () => ({
        status: 'timeout',
        errorCode: 'DETERMINISTIC_TIMEOUT',
        failureCategory: 'EXTRACTOR_TIMEOUT',
        evidence: [],
        extractedFacts: [],
        output: {},
        lifecycle: { supportedProductionStartYear: 2018 },
        timings: { serperMs: 3, geminiMs: 3, totalMs: 6, serperRequestCount: 1 },
        sharedEvidence: { status: 'timeout', failureCategory: 'EXTRACTOR_TIMEOUT' },
      }),
      redisFactory: () => null,
      logger: silentLogger(),
    });
    const res = await post(handler, {
      brand: 'Lenovo',
      category: 'electronics',
      serial: 'PF1A2B3C',
      model,
      candidateYears: [2018, 2019, 2020, 2021, 2022, 2023],
    });
    assert.ok(res.payload.candidateYears.length >= 1);
    assert.ok(res.payload.status !== undefined);
    assert.equal(res.payload.modelIdentity.enteredModel, model);
  }
});

test('canary: Nintendo Switch 2 and Sony Bravia preserve entered models', async () => {
  for (const [brand, model] of [
    ['Nintendo', 'Nintendo Switch 2'],
    ['Sony', 'Sony Bravia'],
  ]) {
    const handler = createRefineSerialDateHandler({
      refinementMode: 'deterministic_serper',
      localLookup: async () => ({ evidence: [], normalization: null }),
      modelProductionLookup: async () => null,
      deterministicProviderLookup: async () => ({
        status: 'insufficient',
        errorCode: 'DETERMINISTIC_INSUFFICIENT_EVIDENCE',
        evidence: [],
        extractedFacts: [],
        output: {},
        timings: { serperMs: 1, geminiMs: 0, totalMs: 1, serperRequestCount: 1 },
        sharedEvidence: { status: 'no_exact_evidence' },
      }),
      redisFactory: () => null,
      logger: silentLogger(),
    });
    const res = await post(handler, {
      brand,
      category: 'electronics',
      serial: 'SN123',
      model,
      candidateYears: [2020, 2021, 2022, 2023, 2024, 2025],
    });
    assert.equal(res.payload.modelIdentity.enteredModel, model);
    assert.equal(res.payload.chosenYear, null);
  }
});

test('canary: provider timeout fixture preserves candidates', async () => {
  const handler = createRefineSerialDateHandler({
    refinementMode: 'deterministic_serper',
    localLookup: async () => ({ evidence: [], normalization: null }),
    modelProductionLookup: async () => null,
    deterministicProviderLookup: async () => {
      const err = new Error('timeout');
      err.name = 'AbortError';
      err.code = 'STAGE_TIMEOUT';
      throw err;
    },
    redisFactory: () => null,
    logger: silentLogger(),
  });
  const res = await post(handler, {
    brand: 'Whirlpool',
    category: 'appliances',
    serial: 'MB1930745',
    model: 'WED4850HWO',
    candidateYears: [1992, 2022],
  });
  assert.deepEqual(res.payload.candidateYears, [1992, 2022]);
  assert.ok(res.payload.remainingCandidateYears.length >= 1
    || res.payload.status === 'unavailable'
    || res.payload.status === 'conflict');
  assert.equal(res.payload.failureCategory, 'global_deadline');
  assert.equal(res.payload.deterministicFallbackUsed, true);
});

test('canary: malformed extraction fixture does not resolve a year', async () => {
  const handler = createRefineSerialDateHandler({
    refinementMode: 'deterministic_serper',
    localLookup: async () => ({ evidence: [], normalization: null }),
    modelProductionLookup: async () => null,
    deterministicProviderLookup: async () => ({
      status: 'provider_error',
      errorCode: 'DETERMINISTIC_GEMINI_ERROR',
      failureCategory: 'EXTRACTOR_SCHEMA_INVALID',
      evidence: [],
      extractedFacts: 'not-an-array',
      output: { resolutionType: 'resolved-single', bestEstimateYear: 2099 },
      timings: { serperMs: 1, geminiMs: 1, totalMs: 2, serperRequestCount: 1 },
      sharedEvidence: { status: 'error', failureCategory: 'EXTRACTOR_SCHEMA_INVALID' },
    }),
    redisFactory: () => null,
    logger: silentLogger(),
  });
  const res = await post(handler, {
    brand: 'Whirlpool',
    category: 'appliances',
    serial: 'MB1930745',
    model: 'WED4850HWO',
    candidateYears: [1992, 2022],
  });
  assert.notEqual(res.payload.chosenYear, 2099);
  assert.notEqual(res.payload.status, 'resolved');
});

test('canary: redis failure fixture still returns ranked result', async () => {
  const handler = createRefineSerialDateHandler({
    refinementMode: 'deterministic_serper',
    localLookup: async () => ({ evidence: [], normalization: null }),
    modelProductionLookup: async () => null,
    deterministicProviderLookup: async () => rankedDeterministic(2010),
    redisFactory: () => ({
      get: async () => { throw new Error('redis'); },
      set: async () => { throw new Error('redis'); },
    }),
    rateLimitFactory: () => ({ limit: async () => ({ success: true }) }),
    logger: silentLogger(),
  });
  const res = await post(handler, {
    brand: 'Whirlpool',
    category: 'appliances',
    serial: 'MB1930745',
    model: 'WED4850HWO',
    candidateYears: [1992, 2012, 2022],
    decodedMonth: 'Serial cycle',
  });
  assert.equal(res.payload.status, 'ranked');
});

test('canary: unusable input fixture returns 400 taxonomy', async () => {
  const handler = createRefineSerialDateHandler({
    refinementMode: 'deterministic_serper',
    logger: silentLogger(),
  });
  const res = createResponse();
  await handler({
    method: 'POST',
    headers: {},
    body: { brand: '', model: '', serial: '', candidateYears: [] },
  }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.failureCategory, 'input_unusable');
});

test('canary: no sequential heavy providers in deterministic mode', async () => {
  let det = 0;
  let legacy = 0;
  const handler = createRefineSerialDateHandler({
    refinementMode: 'deterministic_serper',
    localLookup: async () => ({ evidence: [], normalization: null }),
    modelProductionLookup: async () => null,
    deterministicProviderLookup: async () => {
      det += 1;
      return rankedDeterministic(2019);
    },
    legacyProviderLookup: async () => {
      legacy += 1;
      return { evidence: [] };
    },
    redisFactory: () => null,
    logger: silentLogger(),
  });
  await post(handler, {
    brand: 'Whirlpool',
    category: 'appliances',
    serial: 'MB1930745',
    model: 'WED4850HWO',
    candidateYears: [1992, 2022],
  });
  assert.equal(det, 1);
  assert.equal(legacy, 0);
});
