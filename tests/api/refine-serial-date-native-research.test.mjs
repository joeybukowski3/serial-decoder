import test from 'node:test';
import assert from 'node:assert/strict';
import { createRefineSerialDateHandler } from '../../api/refine-serial-date.js';
import {
  normalizeNativeModelResearch,
  nativeModelResearchEvidence,
  buildNativeModelResearchQuery,
  researchModelTiming,
} from '../../lib/model-evidence/native-model-research.js';

function createResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; },
  };
}

/** GE GFDS350GL1WW / SV852851C — the reported production case. */
function geRequest(overrides = {}) {
  return {
    method: 'POST',
    headers: { 'x-request-id': 'native-test', 'x-forwarded-for': '203.0.113.11' },
    body: {
      brand: 'GE',
      category: 'appliances',
      serial: 'SV852851C',
      model: 'GFDS350GL1WW',
      candidateYears: [1987, 1999, 2011, 2023],
      decodedMonth: 'November',
      context: '',
      ...overrides,
    },
  };
}

function silentLogger() {
  return { info() {}, error() {}, warn() {} };
}

/** Raw shape returned by lib/smart-lookup/gemini-search-provider.js. */
function nativeResult(overrides = {}) {
  return {
    brand: 'GE',
    product: 'GE GFDS350GL1WW front-load gas dryer',
    model: 'GFDS350GL1WW',
    category: 'dryer',
    bestEstimateYear: 2012,
    estimatedRange: { startYear: 2010, endYear: 2015 },
    precision: 'exact_model',
    confidence: 'high',
    estimateBasis: 'Model appears in retailer and manual listings across this window.',
    summary: 'The GFDS350GL1WW was sold from about 2010 to 2015.',
    isIndividualUnitDate: false,
    caveats: [],
    sources: [
      { title: 'GE Appliances manual', url: 'https://products.geappliances.com/manual' },
      { title: 'Retailer listing', url: 'https://example-retailer.test/gfds350gl1ww' },
    ],
    ...overrides,
  };
}

function jvm3160StrictProductionResult() {
  return nativeResult({
    product: 'GE JVM3160RFSS over-the-range microwave',
    model: 'JVM3160RFSS',
    bestEstimateYear: 2013,
    estimatedRange: { startYear: 2013, endYear: null },
    precision: 'model_line',
    confidence: 'high',
    estimateBasis: 'GE Appliances states this model was manufactured August 2013 to present.',
    summary: 'Manufactured August, 2013 - Present.',
    sources: [{
      title: 'GE Appliances JVM3160RFSS support page',
      url: 'https://products.geappliances.com/appliance/gea-specs/JVM3160RFSS',
    }],
  });
}

/**
 * Handler with the native path enabled and every other network dependency
 * hard-failed, so a passing test proves the native path produced the result.
 */
function nativeHandler(nativeLookup, extras = {}) {
  return createRefineSerialDateHandler({
    nativeModelResearchEnabled: true,
    nativeModelResearchLookup: nativeLookup,
    localLookup: async () => ({ evidence: [], normalization: null }),
    modelProductionLookup: async () => null,
    redisFactory: () => null,
    rateLimitFactory: () => null,
    logger: silentLogger(),
    legacyProviderLookup: async () => { throw new Error('legacy provider must not run'); },
    deterministicProviderLookup: async () => { throw new Error('deterministic provider must not run'); },
    ...extras,
  });
}

test('GE GFDS350GL1WW: native range 2010-2015 resolves candidates to 2011', async () => {
  let receivedQuery = null;
  const handler = nativeHandler(async (request, options) => {
    receivedQuery = buildNativeModelResearchQuery(request);
    assert.equal(options.model, 'gemini-3.5-flash-lite');
    return researchModelTiming(request, {
      ...options,
      providerLookup: async () => nativeResult(),
    });
  });

  const res = createResponse();
  await handler(geRequest(), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.status, 'resolved');
  assert.equal(res.payload.chosenYear, 2011);
  assert.deepEqual(res.payload.remainingCandidateYears, [2011]);
  assert.deepEqual(res.payload.candidateYears, [1987, 1999, 2011, 2023]);
  assert.equal(res.payload.provider, 'gemini-native-search');
  assert.equal(res.payload.estimateBasis, 'native-model-production-range');
  assert.equal(res.payload.confidence, 'high');
  assert.equal(receivedQuery, 'GE GFDS350GL1WW appliances');
});

test('exact-model range leaving two separated candidates ranks closest to introduction', async () => {
  const handler = nativeHandler(async (request, options) => researchModelTiming(request, {
    ...options,
    providerLookup: async () => nativeResult({
      estimatedRange: { startYear: 2010, endYear: 2024 },
    }),
  }));

  const res = createResponse();
  await handler(geRequest(), res);

  assert.equal(res.payload.status, 'ranked');
  assert.equal(res.payload.preferredCandidateYear, 2011);
  assert.equal(res.payload.confidence, 'high');
  assert.deepEqual(res.payload.remainingCandidateYears, [2011, 2023]);
  assert.deepEqual(res.payload.candidateYears, [1987, 1999, 2011, 2023]);
  assert.equal(res.payload.chosenYear, null);
  assert.equal(res.payload.provider, 'gemini-native-search');
  assert.deepEqual(res.payload.modelProductionRange, { start: 2009, end: 2025 });
});

test('GE GFDS350GL1WW lower bound ranks 2011 and keeps 2023 visible as serial-valid', async () => {
  const handler = nativeHandler(async (request, options) => researchModelTiming(request, {
    ...options,
    providerLookup: async () => nativeResult({
      estimatedRange: { startYear: 2010, endYear: null },
    }),
  }));

  const res = createResponse();
  await handler(geRequest({ candidateYears: [2011, 2023], decodedMonth: 'September' }), res);

  assert.equal(res.payload.status, 'ranked');
  assert.equal(res.payload.preferredCandidateYear, 2011);
  assert.equal(res.payload.confidence, 'high');
  assert.deepEqual(res.payload.remainingCandidateYears, [2011, 2023]);
  assert.deepEqual(res.payload.candidateYears, [2011, 2023]);
  assert.match(res.payload.rankingExplanation, /earliest serial-valid year/i);
  assert.ok(!JSON.stringify(res.payload).includes('bestEstimateYear'));
});

test('closely-spaced candidates still rank (no minimum-lead gate over the alternate)', async () => {
  const handler = nativeHandler(async (request, options) => researchModelTiming(request, {
    ...options,
    providerLookup: async () => nativeResult({
      estimatedRange: { startYear: 2010, endYear: null },
    }),
  }));

  const res = createResponse();
  await handler(geRequest({ candidateYears: [2011, 2013] }), res);

  assert.equal(res.payload.status, 'ranked');
  assert.equal(res.payload.preferredCandidateYear, 2011);
  assert.equal(res.payload.confidence, 'high');
  assert.deepEqual(res.payload.candidateYears, [2011, 2013]);
  assert.deepEqual(res.payload.remainingCandidateYears, [2011, 2013]);
});

test('existing single-year resolved behavior remains unchanged', async () => {
  const handler = nativeHandler(async (request, options) => researchModelTiming(request, {
    ...options,
    providerLookup: async () => nativeResult(),
  }));

  const res = createResponse();
  await handler(geRequest({ candidateYears: [2011] }), res);

  assert.equal(res.payload.status, 'resolved');
  assert.equal(res.payload.chosenYear, 2011);
  assert.equal(res.payload.confidence, 'medium');
  assert.deepEqual(res.payload.candidateYears, [2011]);
  assert.deepEqual(res.payload.remainingCandidateYears, [2011]);
});

test('no candidate inside the range returns conflict and preserves candidateYears', async () => {
  const handler = nativeHandler(async (request, options) => researchModelTiming(request, {
    ...options,
    providerLookup: async () => nativeResult({
      estimatedRange: { startYear: 2016, endYear: 2019 },
    }),
  }));

  const res = createResponse();
  await handler(geRequest(), res);

  assert.equal(res.payload.status, 'conflict');
  assert.deepEqual(res.payload.remainingCandidateYears, []);
  assert.equal(res.payload.chosenYear, null);
  assert.deepEqual(res.payload.candidateYears, [1987, 1999, 2011, 2023]);
});

test('family-level research never applies an upper bound, but still ranks by lower bound', async () => {
  const handler = nativeHandler(async (request, options) => researchModelTiming(request, {
    ...options,
    providerLookup: async () => nativeResult({
      precision: 'product_family',
      confidence: 'low',
      estimatedRange: { startYear: 2010, endYear: 2015 },
    }),
  }));

  const res = createResponse();
  await handler(geRequest(), res);

  // Lower bound only (never an upper-bound resolve): 1987 and 1999 are
  // eliminated by hard candidate-intersection, but a usable era start plus
  // remaining serial-valid candidates is enough to rank a Best Estimate
  // even though the evidence is weak (family-level, low confidence).
  assert.equal(res.payload.status, 'ranked');
  assert.equal(res.payload.preferredCandidateYear, 2011);
  assert.equal(res.payload.confidence, 'low');
  assert.deepEqual(res.payload.remainingCandidateYears, [2011, 2023]);
  assert.equal(res.payload.modelProductionRange.end, null);
  assert.equal(res.payload.estimateBasis, 'native-model-lower-bound');
});

test('low-confidence exact-model timing still ranks a Best Estimate, but never at high confidence', async () => {
  const handler = nativeHandler(async (request, options) => researchModelTiming(request, {
    ...options,
    providerLookup: async () => nativeResult({
      confidence: 'low',
      estimatedRange: { startYear: 2010, endYear: null },
    }),
  }));

  const res = createResponse();
  await handler(geRequest(), res);

  assert.equal(res.payload.status, 'ranked');
  assert.equal(res.payload.preferredCandidateYear, 2011);
  assert.notEqual(res.payload.confidence, 'high');
  assert.equal(res.payload.confidence, 'low');
  assert.deepEqual(res.payload.candidateYears, [1987, 1999, 2011, 2023]);
});

test('native failure falls back to the legacy refinement research path', async () => {
  let legacyCalls = 0;
  const handler = createRefineSerialDateHandler({
    nativeModelResearchEnabled: true,
    nativeModelResearchLookup: async () => {
      const error = new Error('Gemini Search provider timed out');
      error.code = 'PROVIDER_TIMEOUT';
      throw error;
    },
    localLookup: async () => ({ evidence: [], normalization: null }),
    modelProductionLookup: async () => null,
    redisFactory: () => null,
    rateLimitFactory: () => null,
    logger: silentLogger(),
    legacyProviderLookup: async () => {
      legacyCalls += 1;
      return {
        evidence: [{
          type: 'manual',
          title: 'GE product manual',
          sourceUrl: 'https://products.geappliances.com/manual',
          sourceName: 'GE Appliances',
          productionStart: 2010,
          productionEnd: 2015,
          quality: 'official',
          verified: true,
          supports: 'Manual lists the production window.',
        }],
      };
    },
  });

  const res = createResponse();
  await handler(geRequest(), res);

  assert.equal(legacyCalls, 1);
  assert.equal(res.payload.status, 'resolved');
  assert.equal(res.payload.chosenYear, 2011);
  assert.equal(res.payload.provider, 'gemini-google-search');
});

test('native research never supplies the unit manufacture year directly', async () => {
  // bestEstimateYear 2012 is NOT one of the serial candidates. It must never
  // appear in the response, and it must not resolve anything by itself.
  const handler = nativeHandler(async (request, options) => researchModelTiming(request, {
    ...options,
    providerLookup: async () => nativeResult({
      bestEstimateYear: 2012,
      isIndividualUnitDate: true,
      precision: 'individual_unit',
      estimatedRange: { startYear: 2010, endYear: 2015 },
    }),
  }));

  const res = createResponse();
  await handler(geRequest(), res);

  assert.equal(res.payload.chosenYear, 2011);
  assert.ok(!res.payload.remainingCandidateYears.includes(2012));
  assert.ok(!res.payload.candidateYears.includes(2012));
  assert.ok(!JSON.stringify(res.payload).includes('2012'));
});

test('normalization drops unit-year fields and gates the upper bound', () => {
  const strong = normalizeNativeModelResearch(nativeResult());
  assert.equal(strong.usable, true);
  assert.deepEqual(strong.range, { start: 2009, end: 2016 });
  assert.equal(strong.upperBoundApplied, true);
  assert.equal(strong.refinementConfidence, 'medium');
  assert.equal('bestEstimateYear' in strong, false);
  assert.equal('isIndividualUnitDate' in strong, false);

  const weakConfidence = normalizeNativeModelResearch(nativeResult({ confidence: 'low' }));
  assert.equal(weakConfidence.range.end, null);
  assert.equal(weakConfidence.refinementConfidence, 'low');

  const openEnded = normalizeNativeModelResearch(nativeResult({
    estimatedRange: { startYear: 2010, endYear: null },
  }));
  assert.equal(openEnded.range.end, null);

  const noStart = normalizeNativeModelResearch(nativeResult({
    estimatedRange: { startYear: null, endYear: 2015 },
  }));
  assert.equal(noStart.usable, false);
  assert.equal(noStart.range, null);
});

test('strict first-party manufacturing start is preserved while approximate timing keeps grace', () => {
  const strict = normalizeNativeModelResearch(jvm3160StrictProductionResult());
  assert.deepEqual(strict.range, { start: 2013, end: null });
  assert.equal(strict.lowerBoundSemantics, 'strict-production');

  const approximate = normalizeNativeModelResearch(nativeResult({
    estimatedRange: { startYear: 2013, endYear: null },
    estimateBasis: 'The model was introduced and became available in 2013.',
    summary: 'Retailer listings begin in 2013.',
  }));
  assert.deepEqual(approximate.range, { start: 2012, end: null });
  assert.equal(approximate.lowerBoundSemantics, 'approximate-timing');

  const secondary = normalizeNativeModelResearch(nativeResult({
    estimatedRange: { startYear: 2013, endYear: null },
    estimateBasis: 'A secondary listing says the product was manufactured beginning in 2013.',
    summary: 'The timing is not confirmed by the manufacturer.',
    sources: [{ title: 'GE JVM3160 microwave retailer listing', url: 'https://example-retailer.test/jvm3160' }],
  }));
  assert.deepEqual(secondary.range, { start: 2012, end: null });
  assert.equal(secondary.lowerBoundSemantics, 'approximate-timing');
});

test('GE TZ201988L / JVM3160RF9SS resolves to October 2024 from strict manufacturer production evidence', async () => {
  const handler = nativeHandler(async (request, options) => {
    assert.equal(request.model, 'JVM3160RF9SS');
    return researchModelTiming(request, {
      ...options,
      providerLookup: async () => jvm3160StrictProductionResult(),
    });
  });

  const res = createResponse();
  await handler(geRequest({
    serial: 'TZ201988L',
    model: 'JVM3160RF9SS',
    candidateYears: [1988, 2000, 2012, 2024],
    decodedMonth: 'October',
  }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.status, 'resolved');
  assert.equal(res.payload.chosenYear, 2024);
  assert.deepEqual(res.payload.remainingCandidateYears, [2024]);
  assert.deepEqual(res.payload.candidateYears, [1988, 2000, 2012, 2024]);
  assert.deepEqual(res.payload.modelProductionRange, { start: 2013, end: null });
  assert.equal(res.payload.provider, 'gemini-native-search');
});

test('one research conclusion produces exactly one ranged evidence record', () => {
  const normalized = normalizeNativeModelResearch(nativeResult());
  const evidence = nativeModelResearchEvidence(normalized, { brand: 'GE', model: 'GFDS350GL1WW' });
  const ranged = evidence.filter((item) =>
    item.productionStart != null || item.productionEnd != null);

  assert.equal(ranged.length, 1);
  assert.equal(ranged[0].quality, 'model-intelligence');
  assert.equal(evidence.length, 2);
  assert.equal(evidence[1].quality, 'citation');
  assert.equal(evidence[1].productionStart, null);
});
