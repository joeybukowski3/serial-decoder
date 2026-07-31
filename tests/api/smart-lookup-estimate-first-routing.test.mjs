import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgeLookupHandler } from '../../api/age-lookup.js';

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

const ENV = {
  SMART_LOOKUP_SHARED_MODEL_EVIDENCE_ENABLED: 'true',
  SMART_LOOKUP_OPENAI_ENABLED: 'true',
  OPENAI_API_KEY: 'test-openai-key',
  OPENAI_SMART_LOOKUP_MODEL: 'test-openai-model',
  SMART_LOOKUP_XAI_ENABLED: 'true',
  XAI_API_KEY: 'test-xai-key',
  XAI_SMART_LOOKUP_MODEL: 'test-xai-model',
};

function evidence({ brand, model, matchType = 'exact', year = 2025, eventType = 'launch', secondYear = null }) {
  const facts = [{
    source: { url: 'https://manufacturer.example/product', domain: 'manufacturer.example', title: `${model} launch`, sourceType: 'manufacturer', resultIndex: 0 },
    fact: { eventType, year, endYear: null, precision: 'year', target: eventType === 'launch' ? 'model_lifecycle' : 'source_only', claim: `${model} dated evidence` },
    identity: { deterministicMatchType: matchType, suggestedMatchType: matchType, effectiveMatchType: matchType },
    extraction: { provider: 'gemini', model: 'test-gemini', confidence: eventType === 'launch' ? 'high' : 'medium' },
  }];
  if (secondYear != null) facts.push({
    source: { url: 'https://review.example/article', domain: 'review.example', title: `${model} review`, sourceType: 'review', resultIndex: 1 },
    fact: { eventType: 'review_publication', year: secondYear, endYear: null, precision: 'year', target: 'source_only', claim: `${model} review evidence` },
    identity: { deterministicMatchType: matchType, suggestedMatchType: matchType, effectiveMatchType: matchType },
    extraction: { provider: 'gemini', model: 'test-gemini', confidence: 'medium' },
  });
  return {
    evidenceVersion: '2',
    requestedIdentity: { brand, model, normalizedBrand: brand.toLowerCase(), normalizedModel: model.replace(/\W/g, '').toUpperCase() },
    matchedIdentity: { model, normalizedModel: model.replace(/\W/g, '').toUpperCase(), matchType, deterministicExact: matchType === 'exact' },
    facts,
    lifecycle: { supportedProductionStartYear: null, supportedProductionEndYear: null, supportedDiscontinuationYear: null },
    status: 'success',
    failureCategory: null,
    providerSummary: { localUsed: false, serperUsed: true, extractorUsed: true, searchCount: 1, extractorCallCount: 1 },
    timings: { localMs: 0, searchMs: 25, extractionMs: 30, totalMs: 55 },
    cacheStatus: 'miss',
  };
}

function harness({ shared, openai, xai, env = ENV, logs = [] } = {}) {
  const calls = { shared: 0, openai: 0, xai: 0 };
  const handler = createAgeLookupHandler({
    env,
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    modelEvidenceLookup: async (input, options) => {
      calls.shared += 1;
      return shared(input, options);
    },
    openAiProviderLookup: async (queryInfo, options) => {
      calls.openai += 1;
      assert.equal(options.enableXaiFallback, false);
      return openai(queryInfo, options);
    },
    xaiProviderLookup: async (queryInfo, options) => {
      calls.xai += 1;
      return xai(queryInfo, options);
    },
    logger: { info: (line) => logs.push(line) },
  });
  return { handler, calls };
}

test('product-family shared evidence returns an open estimate and stops heavyweight routing', async () => {
  const { handler, calls } = harness({
    shared: (input, options) => {
      assert.equal(input.querySpecificity, 'product-family');
      assert.equal(input.model, 'Switch 2');
      assert.equal(input.deadline, options.deadline, 'shared stages must use the route deadline');
      assert.equal(options.serperTotalBudgetMs, 3000);
      assert.equal(options.geminiTimeoutMs, 4000);
      return evidence({ brand: 'Nintendo', model: 'Switch 2', year: 2025 });
    },
    openai: () => { throw new Error('OpenAI must not run'); },
    xai: () => { throw new Error('xAI must not run'); },
  });
  const out = res();
  await handler(req('Nintendo Switch 2'), out);
  assert.equal(out.statusCode, 200);
  assert.deepEqual(calls, { shared: 1, openai: 0, xai: 0 });
  assert.equal(out.payload.familyIntroductionYear, 2025);
  assert.equal(out.payload.bestEstimateYear, 2025);
  assert.equal(out.payload.rangeLabel, '2025 or later');
  assert.equal(out.payload.estimateBasis, 'product-family-introduction');
  assert.equal(out.payload.individualManufactureYear, null);
  assert.match(out.payload.notes, /not the manufacture date of an individual unit/i);
});

test('model-line and partial-model queries can use tier-specific shared evidence', async () => {
  for (const [query, expectedTier, expectedBasis] of [
    ['Dell XPS 15', 'model-line', 'model-line-generation'],
    ['H4080BM', 'free-description', 'heuristic'],
  ]) {
    const { handler, calls } = harness({
      shared: (input) => evidence({
        brand: input.brand || 'Unknown',
        model: input.model,
        year: 2019,
        eventType: expectedTier === 'free-description' ? 'review_publication' : 'launch',
        secondYear: expectedTier === 'free-description' ? 2021 : null,
      }),
      openai: () => { throw new Error('OpenAI must not run'); },
      xai: () => { throw new Error('xAI must not run'); },
    });
    const out = res();
    await handler(req(query), out);
    assert.equal(calls.shared, 1, query);
    assert.equal(calls.openai + calls.xai, 0, query);
    assert.equal(out.payload.estimateBasis, expectedBasis, query);
    assert.ok(out.payload.bestEstimateYear || out.payload.estimatedRange, query);
    assert.equal(out.payload.individualManufactureYear, null, query);
  }
});

test('failed shared evidence calls only selected OpenAI and degrades without xAI', async () => {
  const { handler, calls } = harness({
    shared: () => ({ ...evidence({ brand: 'Nintendo', model: 'Switch 2' }), facts: [], status: 'no_exact_evidence', failureCategory: 'NO_SEARCH_RESULTS' }),
    openai: async () => { throw Object.assign(new Error('timeout'), { code: 'STAGE_TIMEOUT' }); },
    xai: () => { throw new Error('xAI must not run'); },
  });
  const out = res();
  await handler(req('Nintendo Switch 2'), out);
  assert.deepEqual(calls, { shared: 1, openai: 1, xai: 0 });
  assert.equal(out.statusCode, 200);
  assert.match(out.payload.fallbackKind, /^deterministic-/);
  assert.ok(out.payload.productFamily || out.payload.recognizedFamily);
});

test('configured xAI primary is selected directly and OpenAI is skipped', async () => {
  const META = Symbol.for('smart-lookup-provider-metadata');
  const value = { brand: 'Nintendo', likelyProduct: 'Nintendo Switch 2', specificityLevel: 'partial', introductionYear: 2025, identityConfidence: 'high' };
  Object.defineProperty(value, META, { value: { provider: 'xai', fallbackUsed: false, grounded: false, groundedSources: [], webSearchUsed: false } });
  const { handler, calls } = harness({
    env: { ...ENV, SMART_LOOKUP_HEAVY_PROVIDER: 'xai' },
    shared: () => ({ ...evidence({ brand: 'Nintendo', model: 'Switch 2' }), facts: [], status: 'no_exact_evidence', failureCategory: 'NO_SEARCH_RESULTS' }),
    openai: () => { throw new Error('OpenAI must not run'); },
    xai: () => value,
  });
  const out = res();
  await handler(req('Nintendo Switch 2'), out);
  assert.deepEqual(calls, { shared: 1, openai: 0, xai: 1 });
  assert.equal(out.payload.source, 'xai');
});

test('active estimate-first routing skips the legacy provider when no heavyweight is configured', async () => {
  let legacyCalls = 0;
  const handler = createAgeLookupHandler({
    env: { SMART_LOOKUP_SHARED_MODEL_EVIDENCE_ENABLED: 'true' },
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    modelEvidenceLookup: async () => ({
      evidenceVersion: '2',
      requestedIdentity: {},
      matchedIdentity: {},
      facts: [],
      lifecycle: {},
      status: 'unavailable',
      failureCategory: 'SERPER_UNAVAILABLE',
      providerSummary: {},
      timings: { searchMs: 0, extractionMs: 0, totalMs: 0 },
    }),
    providerLookup: async () => { legacyCalls += 1; throw new Error('legacy provider must not run'); },
    logger: { info: () => {} },
  });
  const out = res();
  await handler(req('Nintendo Switch 2'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(legacyCalls, 0);
  assert.equal(out.payload.fallbackKind, 'deterministic-family');
  assert.ok(out.payload.notes || out.payload.historicalContext);
});

test('routing telemetry records shared stages and the skipped secondary heavy provider', async () => {
  const logs = [];
  const { handler } = harness({
    logs,
    shared: () => ({ ...evidence({ brand: 'Nintendo', model: 'Switch 2' }), facts: [], status: 'no_exact_evidence', failureCategory: 'NO_SEARCH_RESULTS' }),
    openai: async () => { throw Object.assign(new Error('timeout'), { code: 'STAGE_TIMEOUT' }); },
    xai: () => { throw new Error('xAI must not run'); },
  });
  await handler(req('Nintendo Switch 2'), res());
  const log = logs.map((line) => JSON.parse(line)).find((entry) => entry.event === 'smart_age_lookup');
  assert.equal(log.identityLevel, 'product-family');
  assert.equal(log.sharedEvidenceAttempted, true);
  assert.equal(log.sharedEvidenceAccepted, false);
  assert.equal(log.sharedEvidenceFailureCode, 'NO_SEARCH_RESULTS');
  assert.equal(log.serperDurationMs, 25);
  assert.equal(log.geminiDurationMs, 30);
  assert.equal(log.heavyProviderSelected, 'openai');
  assert.equal(log.heavyProviderAttempted, true);
  assert.equal(log.secondaryHeavyProviderSkipped, true);
  assert.equal(log.deterministicFallbackUsed, true);
});
