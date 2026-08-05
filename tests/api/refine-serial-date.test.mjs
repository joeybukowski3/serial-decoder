import test from 'node:test';
import assert from 'node:assert/strict';
import { createRefineSerialDateHandler } from '../../api/refine-serial-date.js';

function createResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; },
  };
}

function request(overrides = {}) {
  return {
    method: 'POST',
    headers: { 'x-request-id': 'test-request', 'x-forwarded-for': '203.0.113.10' },
    body: {
      brand: 'Whirlpool',
      category: 'appliances',
      serial: 'TRD3481274',
      model: 'WMH31017HS12',
      candidateYears: [1994, 2024],
      decodedMonth: 'Week 48',
      context: '',
      ...overrides,
    },
  };
}

function officialEvidence(start, end) {
  return [{
    type: 'local-db',
    title: 'Verified local evidence',
    quality: 'official',
    verified: true,
    productionStart: start,
    productionEnd: end,
    supports: 'Verified model production window.',
  }];
}

function silentLogger() {
  return { info() {}, error() {}, warn() {} };
}

test('local exact model evidence bypasses cache, provider, and provider rate limit', async () => {
  let providerCalls = 0;
  let redisFactoryCalls = 0;
  let rateLimitFactoryCalls = 0;
  const handler = createRefineSerialDateHandler({
    localLookup: async () => ({ evidence: officialEvidence(2023, 2025), normalization: null }),
    providerLookup: async () => { providerCalls += 1; return { evidence: [] }; },
    redisFactory: () => { redisFactoryCalls += 1; throw new Error('redis should not run'); },
    rateLimitFactory: () => { rateLimitFactoryCalls += 1; throw new Error('rate limit should not run'); },
    logger: silentLogger(),
  });
  const res = createResponse();
  await handler(request(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.status, 'resolved');
  assert.equal(res.payload.chosenYear, 2024);
  assert.equal(res.payload.provider, 'local-db');
  assert.equal(providerCalls, 0);
  assert.equal(redisFactoryCalls, 0);
  assert.equal(rateLimitFactoryCalls, 0);
});

test('model production lookup narrows candidates before cache and Gemini', async () => {
  let providerCalls = 0;
  let redisFactoryCalls = 0;
  const handler = createRefineSerialDateHandler({
    localLookup: async () => ({ evidence: [], normalization: null }),
    modelProductionLookup: async () => ({
      narrowedYears: [2024],
      confidence: 'low',
      source: 'ENERGY STAR certified listing',
      sourceUrl: 'https://data.energystar.gov/',
      productionStartYear: 2023,
      matchedModel: 'WMH31017HS**',
      matchType: 'model-family',
    }),
    providerLookup: async () => { providerCalls += 1; return { evidence: [] }; },
    redisFactory: () => { redisFactoryCalls += 1; return null; },
    logger: silentLogger(),
  });
  const res = createResponse();
  await handler(request(), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.status, 'resolved');
  assert.equal(res.payload.chosenYear, 2024);
  assert.equal(res.payload.confidence, 'low');
  assert.equal(res.payload.provider, 'local-db');
  assert.equal(res.payload.evidence[0].sourceUrl, 'https://data.energystar.gov/');
  assert.equal(providerCalls, 0);
  assert.equal(redisFactoryCalls, 0);
});

test('model production miss or load failure falls back to Gemini unchanged', async () => {
  for (const modelProductionLookup of [
    async () => null,
    async () => { throw new Error('database unavailable'); },
  ]) {
    let providerCalls = 0;
    const handler = createRefineSerialDateHandler({
      localLookup: async () => ({ evidence: [], normalization: null }),
      modelProductionLookup,
      providerLookup: async () => {
        providerCalls += 1;
        return { evidence: officialEvidence(2023, 2025) };
      },
      redisFactory: () => null,
      logger: silentLogger(),
    });
    const res = createResponse();
    await handler(request(), res);

    assert.equal(res.payload.status, 'resolved');
    assert.equal(res.payload.chosenYear, 2024);
    assert.equal(res.payload.provider, 'gemini-google-search');
    assert.equal(providerCalls, 1);
  }
});

test('Model Refinement shared-evidence shadow mode is disabled by default', async () => {
  let shadowCalls = 0;
  const handler = createRefineSerialDateHandler({
    localLookup: async () => ({ evidence: [], normalization: null }),
    modelProductionLookup: async () => null,
    legacyProviderLookup: async () => ({ evidence: officialEvidence(2023, 2025) }),
    deterministicProviderLookup: async () => {
      shadowCalls += 1;
      throw new Error('shadow provider must remain disabled');
    },
    redisFactory: () => null,
    logger: silentLogger(),
  });
  const res = createResponse();

  await handler(request(), res);

  assert.equal(res.payload.provider, 'gemini-google-search');
  assert.equal(res.payload.chosenYear, 2024);
  assert.equal(shadowCalls, 0);
});

test('Model Refinement shadow comparison cannot replace the legacy response or escape serial candidates', async () => {
  const logs = [];
  let shadowCalls = 0;
  const handler = createRefineSerialDateHandler({
    env: { MODEL_REFINEMENT_SHARED_EVIDENCE_SHADOW_ENABLED: 'true' },
    localLookup: async () => ({ evidence: [], normalization: null }),
    modelProductionLookup: async () => null,
    legacyProviderLookup: async () => ({ evidence: officialEvidence(2023, 2025) }),
    deterministicProviderLookup: async (input, options) => {
      shadowCalls += 1;
      assert.deepEqual(input.candidateYears, [1994, 2024]);
      assert.equal(options.consumer, 'model_refinement_shadow');
      assert.equal(options.scoringPath, 'shadow-phase1-deterministic-evaluator');
      assert.ok(options.deadline.remainingMs() > 0);
      return {
        output: {
          resolutionType: 'resolved-single',
          bestEstimateYear: 1994,
          plausibleYears: [1994],
        },
        sharedEvidence: {
          requestedIdentity: { normalizedBrand: 'whirlpool', normalizedModel: 'WMH31017HS12' },
          matchedIdentity: { matchType: 'exact' },
          facts: [{
            fact: { target: 'model_lifecycle' },
          }],
          status: 'success',
          failureCategory: null,
          cacheStatus: 'miss',
          providerSummary: { searchCount: 1, extractorUsed: true },
        },
      };
    },
    redisFactory: () => null,
    logger: { info: (line) => logs.push(line), error() {}, warn() {} },
  });
  const res = createResponse();

  await handler(request(), res);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(shadowCalls, 1);
  assert.equal(res.payload.provider, 'gemini-google-search');
  assert.equal(res.payload.chosenYear, 2024);
  assert.ok(res.payload.candidateYears.includes(res.payload.chosenYear));
  const shadowLog = logs.map((line) => JSON.parse(line))
    .find((entry) => entry.event === 'model_evidence_shadow_comparison');
  assert.equal(shadowLog.consumer, 'model_refinement');
  assert.equal(shadowLog.agreement, 'selected_year_mismatch');
  assert.equal(shadowLog.shadowCandidateInvariant, true);
  assert.equal(shadowLog.modelHash.length, 16);
  assert.doesNotMatch(JSON.stringify(shadowLog), /TRD3481274|WMH31017HS12|test-request/i);
});

test('Model Refinement shadow failures are telemetry-only', async () => {
  const logs = [];
  const handler = createRefineSerialDateHandler({
    sharedEvidenceShadowEnabled: true,
    localLookup: async () => ({ evidence: [], normalization: null }),
    modelProductionLookup: async () => null,
    legacyProviderLookup: async () => ({ evidence: officialEvidence(2023, 2025) }),
    deterministicProviderLookup: async () => {
      const error = new Error('raw provider body must not be logged');
      error.code = 'SERPER_TIMEOUT';
      throw error;
    },
    redisFactory: () => null,
    logger: { info: (line) => logs.push(line), error() {}, warn() {} },
  });
  const res = createResponse();

  await handler(request(), res);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(res.payload.provider, 'gemini-google-search');
  assert.equal(res.payload.chosenYear, 2024);
  const shadowLog = logs.map((line) => JSON.parse(line))
    .find((entry) => entry.event === 'model_evidence_shadow_comparison');
  assert.equal(shadowLog.shadowOutcome, 'error');
  assert.equal(shadowLog.shadowFailureCategory, 'SERPER_TIMEOUT');
  assert.equal(shadowLog.agreement, 'shadow_error');
  assert.doesNotMatch(JSON.stringify(shadowLog), /raw provider body/i);
});

test('deterministic mode passes partial local narrowing into web refinement and maps the resolved result', async () => {
  let legacyCalls = 0;
  let deterministicCalls = 0;
  const handler = createRefineSerialDateHandler({
    refinementMode: 'deterministic_serper',
    localLookup: async () => ({ evidence: [], normalization: null }),
    modelProductionLookup: async () => ({
      narrowedYears: [2014, 2024],
      confidence: 'low',
      source: 'Local model production database',
      sourceUrl: 'https://example.com/model-record',
      productionStartYear: 2014,
      matchedModel: 'WMH31017HS**',
      matchType: 'model-family',
    }),
    legacyProviderLookup: async () => { legacyCalls += 1; throw new Error('legacy provider must not run'); },
    deterministicProviderLookup: async (input, options) => {
      deterministicCalls += 1;
      assert.deepEqual(input.candidateYears, [2014, 2024]);
      assert.deepEqual(options.deadline.remainingMs() > 0, true);
      assert.deepEqual(options.localModelEvidence, {
        start: 2013,
        end: null,
        verifiedExact: false,
      });
      return {
        status: 'success',
        errorCode: null,
        gemini: { status: 'success' },
        extractedFacts: [{
          resultIndex: 0,
          exactModelMatch: true,
          dateMeaning: 'product_available',
          approximateYear: 2023,
          absoluteDate: null,
          normalizedDateYear: 2023,
        }],
        evidence: [{
          type: 'manufacturer',
          title: 'Official current model page',
          sourceUrl: 'https://manufacturer.example/model',
          productionStart: null,
          productionEnd: null,
          supports: 'Exact model was available in 2023.',
          quality: 'official',
          verified: false,
        }],
        output: {
          resolutionType: 'resolved-single',
          bestEstimateYear: 2024,
          plausibleYears: [2024],
          confidence: 'moderate',
          estimatedModelEra: { startYear: 2023, endYear: 2023, centerYear: 2023 },
        },
      };
    },
    redisFactory: () => null,
    logger: silentLogger(),
  });
  const res = createResponse();
  await handler(request({ candidateYears: [2004, 2014, 2024] }), res);

  assert.equal(res.statusCode, 200);
  // A usable model-era lower bound (2023) leaves only 2024 at or after it —
  // a unit could not have been made before the model existed, so 2014 is
  // hard-eliminated and 2024 resolves outright.
  assert.equal(res.payload.status, 'resolved');
  assert.equal(res.payload.chosenYear, 2024);
  assert.deepEqual(res.payload.candidateYears, [2004, 2014, 2024]);
  assert.deepEqual(res.payload.remainingCandidateYears, [2024]);
  assert.equal(res.payload.confidence, 'medium');
  assert.equal(res.payload.provider, 'deterministic-serper');
  assert.equal(deterministicCalls, 1);
  assert.equal(legacyCalls, 0);
  assert.match(res.payload.evidence[0].supports, /lower bound, not proof/i);
});

test('deterministic provider failure still ranks a best estimate from partial local narrowing, without legacy fallback', async () => {
  let legacyCalls = 0;
  const handler = createRefineSerialDateHandler({
    refinementMode: 'deterministic_serper',
    localLookup: async () => ({ evidence: [], normalization: null }),
    modelProductionLookup: async () => ({
      narrowedYears: [2014, 2024],
      confidence: 'low',
      source: 'Local model production database',
      sourceUrl: null,
      productionStartYear: 2014,
      matchedModel: 'WMH31017HS**',
      matchType: 'model-family',
    }),
    legacyProviderLookup: async () => { legacyCalls += 1; throw new Error('legacy provider must not run'); },
    deterministicProviderLookup: async () => {
      const error = new Error('Serper provider failed');
      error.code = 'DETERMINISTIC_SERPER_ERROR';
      throw error;
    },
    redisFactory: () => null,
    logger: silentLogger(),
  });
  const res = createResponse();
  await handler(request({ candidateYears: [2004, 2014, 2024] }), res);

  // Partial local narrowing with a known model-era lower bound (2014) leaves
  // both remaining candidates at or after it, so 2014 (the earliest) ranks
  // as the Best Estimate while 2024 remains a visible alternate.
  assert.equal(res.payload.status, 'ranked');
  assert.equal(res.payload.preferredCandidateYear, 2014);
  assert.deepEqual(res.payload.remainingCandidateYears, [2014, 2024]);
  assert.equal(res.payload.chosenYear, null);
  assert.equal(res.payload.confidence, 'low');
  assert.equal(res.payload.provider, 'deterministic-serper');
  assert.equal(res.payload.errorCode, 'DETERMINISTIC_SERPER_ERROR');
  assert.equal(legacyCalls, 0);
});

test('local_only ranks a best estimate from partial local narrowing without Redis or either online provider', async () => {
  let legacyCalls = 0;
  let deterministicCalls = 0;
  let redisCalls = 0;
  const handler = createRefineSerialDateHandler({
    refinementMode: 'local_only',
    localLookup: async () => ({ evidence: [], normalization: null }),
    modelProductionLookup: async () => ({
      narrowedYears: [2014, 2024],
      confidence: 'low',
      source: 'Local model production database',
      productionStartYear: 2014,
      matchedModel: 'WMH31017HS**',
      matchType: 'model-family',
    }),
    legacyProviderLookup: async () => { legacyCalls += 1; },
    deterministicProviderLookup: async () => { deterministicCalls += 1; },
    redisFactory: () => { redisCalls += 1; return null; },
    logger: silentLogger(),
  });
  const res = createResponse();
  await handler(request({ candidateYears: [2004, 2014, 2024] }), res);

  assert.equal(res.payload.status, 'ranked');
  assert.equal(res.payload.preferredCandidateYear, 2014);
  assert.deepEqual(res.payload.remainingCandidateYears, [2014, 2024]);
  assert.equal(res.payload.provider, 'local-db');
  assert.equal(res.payload.errorCode, null);
  assert.equal(legacyCalls, 0);
  assert.equal(deterministicCalls, 0);
  assert.equal(redisCalls, 0);
});

test('GE PFD87 label and base models resolve the A-code cycle to 2025', async () => {
  for (const model of ['PFD87ESPV0RS', 'PFD87ESPVRS', '  pfd87espvrs  ']) {
    let providerCalls = 0;
    const handler = createRefineSerialDateHandler({
      providerLookup: async () => { providerCalls += 1; throw new Error('provider should not run'); },
      redisFactory: () => { throw new Error('redis should not run'); },
      rateLimitFactory: () => { throw new Error('rate limit should not run'); },
      logger: silentLogger(),
    });
    const res = createResponse();

    await handler(request({
      brand: 'GE',
      serial: 'LA208110G',
      model,
      candidateYears: [1977, 1989, 2001, 2013, 2025],
      decodedMonth: 'June',
    }), res);

    assert.equal(res.statusCode, 200, model);
    assert.equal(res.payload.status, 'resolved', model);
    assert.equal(res.payload.chosenYear, 2025, model);
    assert.equal(res.payload.provider, 'local-db', model);
    assert.match(res.payload.summary, /leaves 2025/i, model);
    assert.equal(providerCalls, 0, model);
  }
});

test('GE GFW850 demonstrated case: FR31424IN + GFW850SPN0DG resolves March serial cycle to 2020', async () => {
  let providerCalls = 0;
  const handler = createRefineSerialDateHandler({
    providerLookup: async () => { providerCalls += 1; throw new Error('provider should not run'); },
    redisFactory: () => { throw new Error('redis should not run'); },
    rateLimitFactory: () => { throw new Error('rate limit should not run'); },
    logger: silentLogger(),
  });
  const res = createResponse();
  await handler(request({
    brand: 'GE',
    serial: 'FR31424IN',
    model: 'GFW850SPN0DG',
    candidateYears: [1984, 1996, 2008, 2020],
    decodedMonth: 'March',
  }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.status, 'resolved');
  assert.equal(res.payload.chosenYear, 2020);
  assert.equal(res.payload.provider, 'local-db');
  assert.equal(res.payload.errorCode, null);
  assert.equal(res.payload.modelNormalization.usedValidatedAlternative, true);
  assert.equal(res.payload.modelNormalization.validatedAlternative.value, 'GFW850SPNDG');
  assert.equal(providerCalls, 0);
});

test('GE GFW850 canonical family model resolves the same way as the label variant', async () => {
  const handler = createRefineSerialDateHandler({
    providerLookup: async () => { throw new Error('provider should not run'); },
    redisFactory: () => { throw new Error('redis should not run'); },
    logger: silentLogger(),
  });
  const res = createResponse();
  await handler(request({
    brand: 'GE', serial: 'FR31424IN', model: 'GFW850SPNDG',
    candidateYears: [1984, 1996, 2008, 2020], decodedMonth: 'March',
  }), res);
  assert.equal(res.payload.status, 'resolved');
  assert.equal(res.payload.chosenYear, 2020);
});

test('GE GFW850 label variant is safe under lowercase, spacing, and whitespace formatting', async () => {
  for (const model of ['gfw850spn0dg', 'GFW 850 SPN0 DG', '  GFW850SPN0DG  ']) {
    const handler = createRefineSerialDateHandler({
      providerLookup: async () => { throw new Error('provider should not run'); },
      redisFactory: () => { throw new Error('redis should not run'); },
      logger: silentLogger(),
    });
    const res = createResponse();
    await handler(request({
      brand: 'GE', serial: 'FR31424IN', model,
      candidateYears: [1984, 1996, 2008, 2020], decodedMonth: 'March',
    }), res);
    assert.equal(res.payload.status, 'resolved', model);
    assert.equal(res.payload.chosenYear, 2020, model);
  }
});

test('an invalid GFW850 near-match never aliases silently and falls through to normal no-evidence handling', async () => {
  let providerCalls = 0;
  const handler = createRefineSerialDateHandler({
    providerLookup: async () => { providerCalls += 1; return { evidence: [] }; },
    redisFactory: () => ({ get: async () => null, set: async () => {} }),
    rateLimitFactory: () => ({ limit: async () => ({ success: true }) }),
    logger: silentLogger(),
  });
  const res = createResponse();
  await handler(request({
    brand: 'GE', serial: 'FR31424IN', model: 'GFW850SPNXDG',
    candidateYears: [1984, 1996, 2008, 2020], decodedMonth: 'March',
  }), res);
  // No silent alias: local evidence never resolves this token, so it
  // legitimately falls through to the provider stage instead of quietly
  // reusing the GFW850SPNDG family evidence.
  assert.equal(providerCalls, 1);
  assert.equal(res.payload.status, 'unavailable');
  assert.equal(res.payload.chosenYear, null);
  assert.deepEqual(res.payload.remainingCandidateYears, [1984, 1996, 2008, 2020]);
  assert.equal(res.payload.errorCode, 'INSUFFICIENT_EVIDENCE');
});

test('GE GFW850: a retryable provider failure preserves candidates and never fabricates a resolved year', async () => {
  const handler = createRefineSerialDateHandler({
    providerLookup: async () => { const error = new Error('aborted'); error.name = 'AbortError'; throw error; },
    redisFactory: () => ({ get: async () => null, set: async () => {} }),
    rateLimitFactory: () => ({ limit: async () => ({ success: true }) }),
    logger: silentLogger(),
  });
  const res = createResponse();
  await handler(request({
    brand: 'GE', serial: 'FR31424IN', model: 'GFW850SPNXDG',
    candidateYears: [1984, 1996, 2008, 2020], decodedMonth: 'March',
  }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.status, 'unavailable');
  assert.equal(res.payload.errorCode, 'REFINEMENT_TIMEOUT');
  assert.deepEqual(res.payload.remainingCandidateYears, [1984, 1996, 2008, 2020]);
});

test('local family heuristic cannot resolve an exact year', async () => {
  const handler = createRefineSerialDateHandler({
    localLookup: async () => ({ evidence: [{ type: 'heuristic', quality: 'heuristic', yearRange: '2023-2025' }], normalization: null }),
    providerLookup: async () => { const error = new Error('missing'); error.code = 'GROUNDING_NOT_CONFIGURED'; throw error; },
    redisFactory: () => null,
    logger: silentLogger(),
  });
  const res = createResponse();
  await handler(request(), res);
  assert.equal(res.payload.status, 'unavailable');
  assert.equal(res.payload.chosenYear, null);
  assert.deepEqual(res.payload.remainingCandidateYears, [1994, 2024]);
});

test('Redis hit bypasses provider and provider rate limit', async () => {
  let providerCalls = 0;
  let shadowCalls = 0;
  let rateLimitFactoryCalls = 0;
  const cached = {
    status: 'resolved',
    candidateYears: [1994, 2024],
    remainingCandidateYears: [2024],
    chosenYear: 2024,
    confidence: 'high',
    resolutionBasis: 'serial-plus-model',
    modelProductionRange: { start: 2023, end: 2025 },
    evidence: [],
    summary: 'Cached resolution',
    cacheStatus: 'miss',
    provider: 'gemini-google-search',
    timings: {},
    errorCode: null,
  };
  const handler = createRefineSerialDateHandler({
    sharedEvidenceShadowEnabled: true,
    localLookup: async () => ({ evidence: [], normalization: null }),
    providerLookup: async () => { providerCalls += 1; throw new Error('provider should not run'); },
    deterministicProviderLookup: async () => { shadowCalls += 1; throw new Error('shadow should not run'); },
    redisFactory: () => ({ get: async () => cached, set: async () => {} }),
    rateLimitFactory: () => { rateLimitFactoryCalls += 1; throw new Error('rate limit should not run'); },
    logger: silentLogger(),
  });
  const res = createResponse();
  await handler(request(), res);
  assert.equal(res.payload.status, 'resolved');
  assert.equal(res.payload.cacheStatus, 'hit');
  assert.equal(res.payload.provider, 'redis');
  assert.equal(providerCalls, 0);
  assert.equal(shadowCalls, 0);
  assert.equal(rateLimitFactoryCalls, 0);
});

test('Redis and rate-limit failures fail open to grounded provider', async () => {
  let providerCalls = 0;
  const handler = createRefineSerialDateHandler({
    localLookup: async () => ({ evidence: [], normalization: null }),
    providerLookup: async () => { providerCalls += 1; return { evidence: [{
      type: 'manufacturer',
      title: 'Official product page',
      sourceUrl: 'https://manufacturer.example/model',
      quality: 'official',
      productionStart: 2023,
      productionEnd: 2025,
    }] }; },
    redisFactory: () => ({ get: async () => { throw new Error('redis down'); }, set: async () => { throw new Error('redis down'); } }),
    rateLimitFactory: () => ({ limit: async () => { throw new Error('redis down'); } }),
    logger: silentLogger(),
  });
  const res = createResponse();
  await handler(request(), res);
  assert.equal(res.payload.status, 'resolved');
  assert.equal(res.payload.provider, 'gemini-google-search');
  assert.equal(providerCalls, 1);
});

test('provider-eligible requests are limited to ten per IP per minute', async () => {
  let attempts = 0;
  let providerCalls = 0;
  const limiter = {
    async limit(identifier) {
      assert.equal(identifier, '203.0.113.10');
      attempts += 1;
      return { success: attempts <= 10 };
    },
  };
  const handler = createRefineSerialDateHandler({
    localLookup: async () => ({ evidence: [], normalization: null }),
    providerLookup: async () => { providerCalls += 1; return { evidence: [] }; },
    redisFactory: () => ({ get: async () => null, set: async () => {} }),
    rateLimitFactory: () => limiter,
    logger: silentLogger(),
  });

  for (let index = 0; index < 10; index += 1) {
    const res = createResponse();
    await handler(request(), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.errorCode, 'INSUFFICIENT_EVIDENCE');
  }

  const limited = createResponse();
  await handler(request(), limited);
  assert.equal(limited.statusCode, 200);
  assert.equal(limited.payload.status, 'unavailable');
  assert.equal(limited.payload.errorCode, 'GROUNDING_RATE_LIMIT');
  assert.equal(limited.payload.chosenYear, null);
  assert.deepEqual(limited.payload.remainingCandidateYears, [1994, 2024]);
  assert.equal(providerCalls, 10);
  assert.equal(attempts, 11);
  assert.equal(Object.hasOwn(limited.payload, 'reset'), false);
  assert.doesNotMatch(JSON.stringify(limited.payload), /redis down|reset/i);
});

test('two cited secondary sources can resolve a candidate', async () => {
  const handler = createRefineSerialDateHandler({
    localLookup: async () => ({ evidence: [], normalization: null }),
    providerLookup: async () => ({ evidence: [
      { type: 'retailer', title: 'A', sourceUrl: 'https://a.example/item', quality: 'strong-secondary', availabilityStart: 2023, availabilityEnd: 2025 },
      { type: 'review', title: 'B', sourceUrl: 'https://b.example/review', quality: 'strong-secondary', availabilityStart: 2024, availabilityEnd: 2026 },
    ] }),
    redisFactory: () => null,
    logger: silentLogger(),
  });
  const res = createResponse();
  await handler(request(), res);
  assert.equal(res.payload.status, 'resolved');
  assert.equal(res.payload.chosenYear, 2024);
  assert.equal(res.payload.confidence, 'medium');
});

test('missing citations cannot select a year', async () => {
  const handler = createRefineSerialDateHandler({
    localLookup: async () => ({ evidence: [], normalization: null }),
    providerLookup: async () => ({ evidence: [{ type: 'manufacturer', title: 'No URL', quality: 'official', productionStart: 2023, productionEnd: 2025 }] }),
    redisFactory: () => null,
    logger: silentLogger(),
  });
  const res = createResponse();
  await handler(request(), res);
  assert.equal(res.payload.status, 'unavailable');
  assert.equal(res.payload.chosenYear, null);
  assert.equal(res.payload.errorCode, 'INSUFFICIENT_EVIDENCE');
});

test('conflicting model and serial evidence returns conflict without nearest year', async () => {
  const handler = createRefineSerialDateHandler({
    localLookup: async () => ({ evidence: officialEvidence(2010, 2012), normalization: null }),
    redisFactory: () => null,
    logger: silentLogger(),
  });
  const res = createResponse();
  await handler(request(), res);
  assert.equal(res.payload.status, 'conflict');
  assert.equal(res.payload.chosenYear, null);
  assert.deepEqual(res.payload.remainingCandidateYears, []);
});

test('provider timeout preserves serial candidates', async () => {
  const handler = createRefineSerialDateHandler({
    localLookup: async () => ({ evidence: [], normalization: null }),
    providerLookup: async () => { const error = new Error('aborted'); error.name = 'AbortError'; throw error; },
    redisFactory: () => null,
    logger: silentLogger(),
  });
  const res = createResponse();
  await handler(request(), res);
  assert.equal(res.payload.status, 'unavailable');
  assert.equal(res.payload.errorCode, 'REFINEMENT_TIMEOUT');
  assert.deepEqual(res.payload.remainingCandidateYears, [1994, 2024]);
});


test('endpoint deadline returns even when a provider ignores AbortController', async () => {
  const handler = createRefineSerialDateHandler({
    localLookup: async () => ({ evidence: [], normalization: null }),
    providerLookup: async () => new Promise(() => {}),
    redisFactory: () => null,
    logger: silentLogger(),
    totalBudgetMs: 1000,
    providerBudgetMs: 40,
  });
  const res = createResponse();
  const started = Date.now();
  await handler(request(), res);
  assert.ok(Date.now() - started < 250);
  assert.equal(res.payload.status, 'unavailable');
  assert.equal(res.payload.errorCode, 'REFINEMENT_TIMEOUT');
  assert.equal(res.payload.chosenYear, null);
});

test('429 and 5xx provider errors do not leak raw errors or choose a year', async () => {
  for (const code of ['GROUNDING_RATE_LIMIT', 'GROUNDING_PROVIDER_ERROR']) {
    const handler = createRefineSerialDateHandler({
      localLookup: async () => ({ evidence: [], normalization: null }),
      providerLookup: async () => { const error = new Error('raw provider body secret'); error.code = code; throw error; },
      redisFactory: () => null,
      logger: silentLogger(),
    });
    const res = createResponse();
    await handler(request(), res);
    assert.equal(res.payload.status, 'unavailable');
    assert.equal(res.payload.chosenYear, null);
    assert.doesNotMatch(JSON.stringify(res.payload), /raw provider body secret/);
  }
});

test('strict chosenYear invariant holds for every non-resolved status', async () => {
  const handler = createRefineSerialDateHandler({
    localLookup: async () => ({ evidence: [], normalization: null }),
    providerLookup: async () => ({ evidence: [] }),
    redisFactory: () => null,
    logger: silentLogger(),
  });
  const res = createResponse();
  await handler(request(), res);
  assert.notEqual(res.payload.status, 'resolved');
  assert.equal(res.payload.chosenYear, null);
  assert.deepEqual(
    Object.keys(res.payload.timings).sort(),
    ['cacheMs', 'geminiMs', 'localMs', 'onlineLookupMs', 'serperMs', 'totalMs'].sort(),
  );
});

test('input validation rejects malformed candidates and oversized context', async () => {
  const handler = createRefineSerialDateHandler({ logger: silentLogger() });
  const res1 = createResponse();
  await handler(request({ candidateYears: [] }), res1);
  assert.equal(res1.statusCode, 400);
  const res2 = createResponse();
  await handler(request({ context: 'x'.repeat(301) }), res2);
  assert.equal(res2.statusCode, 400);
});

test('deterministic mode does not start the broad shared-provider fallback after insufficient evidence', async () => {
  let sharedCalls = 0;
  const handler = createRefineSerialDateHandler({
    refinementMode: 'deterministic_serper',
    localLookup: async () => ({ evidence: [], normalization: null }),
    modelProductionLookup: async () => null,
    deterministicProviderLookup: async () => ({
      status: 'insufficient',
      evidence: [],
      extractedFacts: [],
      output: null,
      errorCode: 'DETERMINISTIC_INSUFFICIENT_EVIDENCE',
    }),
    sharedModelEvidenceLookup: async () => {
      sharedCalls += 1;
      return {
        provider: 'smart-lookup-openai',
        evidence: [{
          type: 'smart-lookup-model-range',
          title: 'GE GDF650 model era',
          quality: 'model-intelligence',
          productionStart: 2022,
          productionEnd: null,
          supports: 'Model introduction lower bound only.',
        }],
      };
    },
    redisFactory: () => null,
    logger: silentLogger(),
  });
  const res = createResponse();

  await handler(request({
    brand: 'GE',
    serial: 'HV907351B',
    model: 'GDF650SYV0FS',
    candidateYears: [1978, 1990, 2002, 2014, 2026],
    decodedMonth: 'May',
  }), res);

  assert.equal(sharedCalls, 0);
  assert.equal(res.payload.status, 'unavailable');
  assert.equal(res.payload.chosenYear, null);
  assert.deepEqual(res.payload.remainingCandidateYears, [1978, 1990, 2002, 2014, 2026]);
  assert.equal(res.payload.provider, 'deterministic-serper');
});

test('cached refinement cannot inject a year outside the current serial candidates', async () => {
  let providerCalls = 0;
  const handler = createRefineSerialDateHandler({
    localLookup: async () => ({ evidence: [], normalization: null }),
    modelProductionLookup: async () => null,
    providerLookup: async () => {
      providerCalls += 1;
      return { evidence: [] };
    },
    redisFactory: () => ({
      get: async () => ({
        status: 'resolved',
        candidateYears: [1978, 1990, 2002, 2014, 2026],
        remainingCandidateYears: [2023],
        chosenYear: 2023,
        provider: 'gemini-google-search',
      }),
      set: async () => {},
    }),
    rateLimitFactory: () => null,
    logger: silentLogger(),
  });
  const res = createResponse();

  await handler(request({
    brand: 'GE',
    serial: 'HV907351B',
    model: 'GDF650SYV0FS',
    candidateYears: [1978, 1990, 2002, 2014, 2026],
  }), res);

  assert.equal(providerCalls, 1);
  assert.equal(res.payload.chosenYear, null);
  assert.deepEqual(res.payload.remainingCandidateYears, [1978, 1990, 2002, 2014, 2026]);
});

test('Whirlpool WED4850HWO canonical-equivalent evidence ranks or resolves 2022 over 1992', async () => {
  const handler = createRefineSerialDateHandler({
    refinementMode: 'deterministic_serper',
    localLookup: async () => ({ evidence: [], normalization: null }),
    modelProductionLookup: async () => null,
    deterministicProviderLookup: async (req) => ({
      status: 'success',
      evidence: [{
        type: 'manufacturer',
        title: 'Whirlpool WED4850HW0 dryer',
        sourceUrl: 'https://www.whirlpool.com/wed4850hw0',
        productionStart: 2019,
        productionEnd: null,
        supports: 'Modern electric dryer introduction evidence.',
        quality: 'strong-secondary',
        exactModelMatch: true,
        modelMatchType: 'canonical-equivalent',
      }],
      extractedFacts: [{
        resultIndex: 0,
        domain: 'whirlpool.com',
        modelMatchType: 'canonical-equivalent',
        exactModelMatch: true,
        dateMeaning: 'product_launch',
        approximateYear: 2019,
        normalizedDateYear: 2019,
        sourceType: 'manufacturer',
        claimText: 'WED4850HW0 introduced around 2019.',
      }],
      output: {
        resolutionType: 'resolved-single',
        bestEstimateYear: 2022,
        confidence: 'high',
        estimatedModelEra: { startYear: 2019, endYear: null },
        plausibleYears: [2022],
      },
      modelIdentity: {
        enteredModel: req.model,
        canonicalModel: 'WED4850HW0',
        searchModels: ['WED4850HWO', 'WED4850HW0'],
        equivalenceReason: 'terminal-o-zero-transcription',
        normalizationApplied: true,
        matchedBy: 'canonical-equivalent',
        identityConfidence: 'high',
      },
      matchedIdentity: { matchType: 'canonical-equivalent', model: 'WED4850HW0' },
      evidenceMatchModel: 'WED4850HW0',
      lifecycle: { supportedProductionStartYear: 2019, supportedProductionEndYear: null },
      errorCode: null,
    }),
    redisFactory: () => null,
    logger: silentLogger(),
  });
  const res = createResponse();
  await handler(request({
    brand: 'Whirlpool',
    serial: 'MB1930745',
    model: 'WED4850HWO',
    candidateYears: [1992, 2022],
    decodedMonth: 'Week 19',
  }), res);

  assert.equal(res.statusCode, 200);
  assert.notEqual(res.payload.status, 'unavailable');
  if (res.payload.status === 'resolved') {
    assert.equal(res.payload.chosenYear, 2022);
  } else {
    assert.equal(res.payload.status, 'ranked');
    assert.equal(res.payload.preferredCandidateYear, 2022);
    assert.ok(res.payload.remainingCandidateYears.includes(1992));
  }
  assert.equal(res.payload.modelIdentity.enteredModel, 'WED4850HWO');
  assert.equal(res.payload.modelIdentity.canonicalModel, 'WED4850HW0');
  assert.ok(String(res.payload.summary || '').includes('WED4850') || res.payload.modelIdentity);
});

test('Whirlpool timeout degrades with model-era lower bound instead of empty usefulness', async () => {
  const handler = createRefineSerialDateHandler({
    refinementMode: 'deterministic_serper',
    localLookup: async () => ({ evidence: [], normalization: null }),
    modelProductionLookup: async () => ({
      narrowedYears: [1992, 2022],
      confidence: 'low',
      productionStartYear: 2018,
      matchedModel: 'WED****',
      matchType: 'model-family',
    }),
    deterministicProviderLookup: async () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    },
    redisFactory: () => null,
    logger: silentLogger(),
  });
  const res = createResponse();
  await handler(request({
    brand: 'Whirlpool',
    serial: 'MB1930745',
    model: 'WED4850HWO',
    candidateYears: [1992, 2022],
    decodedMonth: 'Week 19',
  }), res);

  // Production start 2018 with tolerance does not resolve alone when both candidates
  // still remain after partial match, but timeout should still rank using lower bound.
  assert.notEqual(res.payload.status, 'unavailable');
  assert.ok(['resolved', 'ranked', 'ambiguous', 'ambiguous_with_era'].includes(res.payload.status));
  if (res.payload.status === 'resolved') assert.equal(res.payload.chosenYear, 2022);
  if (res.payload.status === 'ranked') assert.equal(res.payload.preferredCandidateYear, 2022);
});

test('deterministic ranking from lower-bound facts without full resolve still prefers modern cycle', async () => {
  const handler = createRefineSerialDateHandler({
    refinementMode: 'deterministic_serper',
    localLookup: async () => ({ evidence: [], normalization: null }),
    modelProductionLookup: async () => null,
    deterministicProviderLookup: async () => ({
      status: 'success',
      evidence: [],
      extractedFacts: [{
        resultIndex: 0,
        domain: 'parts.example',
        modelMatchType: 'canonical-equivalent',
        exactModelMatch: true,
        dateMeaning: 'product_available',
        approximateYear: 2019,
        sourceType: 'parts',
        claimText: 'Parts listed for WED4850HW0 in 2019.',
      }],
      output: {
        resolutionType: 'unchanged',
        bestEstimateYear: null,
        confidence: 'moderate',
        estimatedModelEra: { startYear: 2019, endYear: null },
        plausibleYears: [1992, 2022],
      },
      lifecycle: { supportedProductionStartYear: 2019 },
      modelIdentity: {
        enteredModel: 'WED4850HWO',
        canonicalModel: 'WED4850HW0',
        searchModels: ['WED4850HWO', 'WED4850HW0'],
        equivalenceReason: 'terminal-o-zero-transcription',
        normalizationApplied: true,
        matchedBy: 'canonical-equivalent',
        identityConfidence: 'high',
      },
      errorCode: null,
    }),
    redisFactory: () => null,
    logger: silentLogger(),
  });
  const res = createResponse();
  await handler(request({
    brand: 'Whirlpool',
    serial: 'MB1930745',
    model: 'WED4850HWO',
    candidateYears: [1992, 2022],
  }), res);

  assert.ok(['resolved', 'ranked'].includes(res.payload.status));
  if (res.payload.status === 'resolved') assert.equal(res.payload.chosenYear, 2022);
  if (res.payload.status === 'ranked') {
    assert.equal(res.payload.preferredCandidateYear, 2022);
    assert.deepEqual(res.payload.remainingCandidateYears, [1992, 2022]);
  }
});
