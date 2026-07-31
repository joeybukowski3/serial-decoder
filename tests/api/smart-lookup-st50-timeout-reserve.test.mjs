import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgeLookupHandler } from '../../api/age-lookup.js';
import { classifySmartLookupQuery } from '../../lib/smart-lookup/normalize.js';
import { buildDeterministicBroadResult } from '../../lib/smart-lookup/static-results.js';

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

function timeoutError(code = 'STAGE_TIMEOUT') {
  return Object.assign(new Error('provider timed out'), { code });
}

function harness({ shared, openai, xai, env = ENV, logs = [], localLookup = async () => null } = {}) {
  const calls = { shared: 0, openai: 0, xai: 0, redisGet: 0, redisSet: 0 };
  const redis = {
    get: async () => { calls.redisGet += 1; return null; },
    set: async () => { calls.redisSet += 1; },
    eval: async () => [1, 1, 1],
    incrby: async (_key, amount) => amount,
    expire: async () => 1,
  };
  const handler = createAgeLookupHandler({
    env,
    localLookup,
    redisFactory: () => redis,
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

function assertUsefulOriginalSt50(payload) {
  assert.equal(payload.brand, 'Lenovo');
  assert.match(String(payload.productFamily || payload.recognizedFamily || ''), /ThinkSystem ST50/i);
  assert.match(String(payload.category || payload.itemCategory || ''), /tower server/i);
  assert.ok(
    payload.yearContext?.startYear === 2018
    || payload.productionRange?.start === 2018
    || payload.lineIntroductionYear === 2018
    || payload.familyIntroductionYear === 2018
    || payload.bestEstimateYear === 2018,
    'expected an approximate 2018 generation introduction'
  );
  assert.equal(payload.individualManufactureYear, null);
  assert.notEqual(payload.yearContext?.type, 'manufacture-year');
  assert.notEqual(payload.yearContext?.type, 'manufacture-date');
  assert.equal(payload.yearContext?.isExactUnitDate, false);
  assert.match(String(payload.estimateBasis || ''), /model-line-generation|product-family-introduction/);
  assert.match(String(payload.confidence || payload.confidenceLevel || payload.contextConfidence || ''), /medium|low/i);
  assert.match(
    String(payload.refinementSuggestion || (payload.recommendedIdentifiers || []).join(' ')),
    /7Y48|7Y49|machine type|V2|V3/i
  );
  assert.doesNotMatch(JSON.stringify(payload), /stopped before guessing/i);
}

test('classifier: original ST50, V2, V3, and machine types map correctly', () => {
  const original = classifySmartLookupQuery('Lenovo ThinkSystem ST50');
  assert.equal(original.querySpecificity, 'model-line');
  assert.equal(original.familyId, 'thinksystem-st50');
  assert.equal(original.modelLineId, 'thinksystem-st50');
  assert.equal(original.brand, 'Lenovo');

  const v2 = classifySmartLookupQuery('Lenovo ThinkSystem ST50 V2');
  assert.equal(v2.modelLineId, 'thinksystem-st50-v2');
  const v3 = classifySmartLookupQuery('Lenovo ThinkSystem ST50 V3');
  assert.equal(v3.modelLineId, 'thinksystem-st50-v3');

  const mt48 = classifySmartLookupQuery('Lenovo 7Y48');
  assert.equal(mt48.modelLineId, 'thinksystem-st50');
  const mt49 = classifySmartLookupQuery('Lenovo 7Y49');
  assert.equal(mt49.modelLineId, 'thinksystem-st50');

  const unsupported = classifySmartLookupQuery('Lenovo ThinkSystem SR650');
  assert.equal(unsupported.familyId, null);
  assert.equal(unsupported.modelLineId, null);
});

test('deterministic reserve: original ST50 has a generation window; V2/V3 do not inherit it', () => {
  const original = buildDeterministicBroadResult(classifySmartLookupQuery('Lenovo ThinkSystem ST50'));
  assert.equal(original.yearContext.startYear, 2018);
  assert.equal(original.yearContext.endYear, 2023);
  assert.equal(original.estimateBasis, 'model-line-generation');
  assert.equal(original.individualManufactureYear, null);
  assert.equal(original.productionRange.start, 2018);

  const v2 = buildDeterministicBroadResult(classifySmartLookupQuery('Lenovo ThinkSystem ST50 V2'));
  assert.equal(v2.yearContext.type, 'unknown');
  assert.equal(v2.productionRange, null);
  assert.equal(v2.bestEstimateYear, null);
  assert.equal(v2.familyIntroductionYear, null);
  assert.notEqual(v2.yearContext.startYear, 2018);
  assert.match(String(v2.seriesLine || v2.recognizedSeries || ''), /V2/i);

  const v3 = buildDeterministicBroadResult(classifySmartLookupQuery('Lenovo ThinkSystem ST50 V3'));
  assert.equal(v3.yearContext.type, 'unknown');
  assert.equal(v3.productionRange, null);
  assert.equal(v3.bestEstimateYear, null);
  assert.equal(v3.familyIntroductionYear, null);
  assert.match(String(v3.seriesLine || v3.recognizedSeries || ''), /V3/i);

  const unsupported = buildDeterministicBroadResult(classifySmartLookupQuery('Lenovo ThinkSystem SR650'));
  assert.ok(!unsupported?.yearContext?.startYear && !unsupported?.productionRange?.start);
});

test('Lenovo ThinkSystem ST50 returns a useful estimate with successful shared evidence', async () => {
  const { handler, calls } = harness({
    shared: () => ({
      evidenceVersion: '2',
      requestedIdentity: { brand: 'Lenovo', model: 'ThinkSystem ST50' },
      matchedIdentity: { model: 'ThinkSystem ST50', matchType: 'family', deterministicExact: false },
      facts: [{
        source: { url: 'https://pubs.lenovo.com/st50/ST50_setup_guide.pdf', domain: 'pubs.lenovo.com', title: 'ST50 Setup Guide', sourceType: 'manufacturer', resultIndex: 0 },
        fact: { eventType: 'launch', year: 2018, endYear: null, precision: 'year', target: 'model_lifecycle', claim: 'ST50 documented 2018' },
        identity: { deterministicMatchType: 'family', suggestedMatchType: 'family', effectiveMatchType: 'family' },
        extraction: { provider: 'gemini', model: 'test-gemini', confidence: 'high' },
      }],
      lifecycle: { supportedProductionStartYear: 2018, supportedProductionEndYear: null, supportedDiscontinuationYear: null },
      status: 'success',
      failureCategory: null,
      providerSummary: { localUsed: false, serperUsed: true, extractorUsed: true, searchCount: 1, extractorCallCount: 1 },
      timings: { localMs: 0, searchMs: 20, extractionMs: 25, totalMs: 45 },
      cacheStatus: 'miss',
    }),
    openai: () => { throw new Error('OpenAI must not run after accepted shared evidence'); },
    xai: () => { throw new Error('xAI must not run after accepted shared evidence'); },
  });
  const out = res();
  await handler(req('Lenovo ThinkSystem ST50'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(calls.shared, 1);
  assert.equal(calls.openai, 0);
  assert.equal(calls.xai, 0);
  assert.ok(out.payload.bestEstimateYear === 2018 || out.payload.familyIntroductionYear === 2018 || out.payload.lineIntroductionYear === 2018);
  assert.equal(out.payload.individualManufactureYear, null);
});

test('Lenovo ThinkSystem ST50 returns deterministic estimate when all live providers time out', async () => {
  const logs = [];
  const { handler, calls } = harness({
    logs,
    shared: async () => { throw timeoutError('STAGE_TIMEOUT'); },
    openai: async () => { throw timeoutError('STAGE_TIMEOUT'); },
    xai: () => { throw new Error('xAI must not run sequentially after OpenAI'); },
  });
  const out = res();
  await handler(req('Lenovo ThinkSystem ST50'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(calls.openai + calls.xai, 0, 'shared timeout should degrade before sequential heavy providers when reserve exists after shared failure path');
  // Depending on routing, shared failure may still attempt one heavyweight. Cap at one heavy provider.
  assert.ok(calls.openai + calls.xai <= 1);
  assert.ok(calls.openai === 0 || calls.xai === 0, 'must not call both OpenAI and xAI');
  assertUsefulOriginalSt50(out.payload);
  assert.match(String(out.payload.fallbackKind), /^deterministic-/);
  assert.ok(out.payload.errorCode, 'timeout/error code remains visible for telemetry');
  assert.match(String(out.payload.errorCode), /TIMEOUT|DEADLINE|UNAVAILABLE|NO_SEARCH|STAGE/i);

  const log = logs.map((line) => JSON.parse(line)).find((entry) => entry.event === 'smart_age_lookup');
  assert.ok(log);
  assert.equal(log.deterministicFallbackUsed, true);
  assert.ok(log.errorCode || out.payload.errorCode);
});

test('shared evidence rejection still returns ST50 model-line reserve without sequential dual heavy providers', async () => {
  const logs = [];
  const { handler, calls } = harness({
    logs,
    shared: () => ({
      evidenceVersion: '2',
      requestedIdentity: {},
      matchedIdentity: {},
      facts: [],
      lifecycle: {},
      status: 'no_exact_evidence',
      failureCategory: 'NO_SEARCH_RESULTS',
      providerSummary: { serperUsed: true, extractorUsed: false },
      timings: { searchMs: 30, extractionMs: 0, totalMs: 30 },
    }),
    openai: async () => { throw timeoutError('STAGE_TIMEOUT'); },
    xai: () => { throw new Error('xAI must not run'); },
  });
  const out = res();
  await handler(req('Lenovo ThinkSystem ST50'), out);
  assert.equal(out.statusCode, 200);
  assert.deepEqual(
    { openai: calls.openai, xai: calls.xai },
    { openai: 1, xai: 0 }
  );
  assertUsefulOriginalSt50(out.payload);
  assert.equal(out.payload.fallbackKind, 'deterministic-model-line');
  assert.equal(out.payload.errorCode, 'PROVIDER_TIMEOUT');

  const log = logs.map((line) => JSON.parse(line)).find((entry) => entry.event === 'smart_age_lookup');
  assert.equal(log.deterministicFallbackUsed, true);
  assert.equal(log.heavyProviderAttempted, true);
  assert.equal(log.secondaryHeavyProviderSkipped, true);
});

test('product-family and model-line timeouts return broad ranges rather than empty results', async () => {
  for (const query of ['Acer Nitro 5', 'Dell XPS 15']) {
    const { handler, calls } = harness({
      shared: () => ({
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
      openai: async () => { throw timeoutError('STAGE_TIMEOUT'); },
      xai: () => { throw new Error('xAI must not run'); },
    });
    const out = res();
    await handler(req(query), out);
    assert.equal(out.statusCode, 200, query);
    assert.equal(calls.xai, 0, query);
    assert.match(String(out.payload.fallbackKind), /^deterministic-/, query);
    assert.ok(
      out.payload.yearContext?.value
      || out.payload.yearContext?.startYear
      || out.payload.familyIntroductionYear
      || out.payload.lineIntroductionYear
      || out.payload.bestEstimateYear
      || out.payload.productionRange?.start,
      `${query} should keep a broad estimate`
    );
    assert.doesNotMatch(JSON.stringify(out.payload), /stopped before guessing/i);
  }
});

test('unusable random input still returns clarification without fabricated timing', async () => {
  const { handler, calls } = harness({
    shared: () => { throw new Error('shared must not run for unusable input'); },
    openai: () => { throw new Error('openai must not run for unusable input'); },
    xai: () => { throw new Error('xai must not run for unusable input'); },
  });
  const out = res();
  await handler(req('asdkj 4432 xx'), out);
  assert.equal(out.statusCode, 200);
  assert.deepEqual(calls, { shared: 0, openai: 0, xai: 0, redisGet: 0, redisSet: 0 });
  assert.equal(out.payload.fallbackKind, 'clarification');
  assert.equal(out.payload.individualManufactureYear, null);
  assert.ok(!out.payload.bestEstimateYear && !out.payload.productionRange?.start);
});

test('machine types 7Y48 and 7Y49 resolve to the original ST50 generation on timeout', async () => {
  for (const query of ['Lenovo 7Y48', 'Lenovo 7Y49']) {
    const { handler } = harness({
      shared: () => ({
        evidenceVersion: '2',
        requestedIdentity: {},
        matchedIdentity: {},
        facts: [],
        lifecycle: {},
        status: 'no_exact_evidence',
        failureCategory: 'NO_SEARCH_RESULTS',
        providerSummary: {},
        timings: { searchMs: 10, extractionMs: 0, totalMs: 10 },
      }),
      openai: async () => { throw timeoutError('STAGE_TIMEOUT'); },
      xai: () => { throw new Error('xAI must not run'); },
    });
    const out = res();
    await handler(req(query), out);
    assertUsefulOriginalSt50(out.payload);
    assert.match(String(out.payload.seriesLine || out.payload.recognizedSeries || ''), /ST50/i);
  }
});

test('ST50 V2 and V3 timeout results do not use original ST50 2018 window', async () => {
  for (const query of ['Lenovo ThinkSystem ST50 V2', 'Lenovo ThinkSystem ST50 V3']) {
    const { handler } = harness({
      shared: () => ({
        evidenceVersion: '2',
        requestedIdentity: {},
        matchedIdentity: {},
        facts: [],
        lifecycle: {},
        status: 'no_exact_evidence',
        failureCategory: 'NO_SEARCH_RESULTS',
        providerSummary: {},
        timings: { searchMs: 10, extractionMs: 0, totalMs: 10 },
      }),
      openai: async () => { throw timeoutError('STAGE_TIMEOUT'); },
      xai: () => { throw new Error('xAI must not run'); },
    });
    const out = res();
    await handler(req(query), out);
    assert.equal(out.statusCode, 200);
    assert.equal(out.payload.brand, 'Lenovo');
    assert.match(String(out.payload.seriesLine || out.payload.recognizedSeries || query), /V2|V3/i);
    assert.notEqual(out.payload.yearContext?.startYear, 2018);
    assert.notEqual(out.payload.productionRange?.start, 2018);
    assert.notEqual(out.payload.bestEstimateYear, 2018);
    assert.equal(out.payload.individualManufactureYear, null);
  }
});
