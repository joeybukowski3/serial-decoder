import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgeLookupHandler } from '../../api/age-lookup.js';
import { normalizeCachedSmartAgeResult } from '../../lib/smart-lookup/result-schema.js';
import { SmartLookupProviderError } from '../../lib/smart-lookup/provider.js';

function req(query, extra = {}) { return { method: 'POST', body: { query, ...extra }, headers: { 'x-forwarded-for': '127.0.0.1' }, socket: {} }; }
function res() {
  return { statusCode: 0, payload: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; return this; }, setHeader() {} };
}

const redisMiss = {
  get: async () => null,
  set: async () => {},
  eval: async () => [1, 1, 1],
  incrby: async (_key, amount) => amount,
  expire: async () => 1,
};

function withMetadata(value, metadata) {
  Object.defineProperty(value, Symbol.for('smart-lookup-provider-metadata'), {
    value: Object.freeze(metadata),
    enumerable: false,
  });
  return value;
}

function neverResolvingGrounded() {
  return () => new Promise(() => {});
}

function closedBookGeminiSuccess(overrides = {}) {
  return async () => withMetadata({
    brand: 'LG',
    model: 'WM3900HWA',
    specificityLevel: 'specific',
    introductionYear: 2019,
    productionRange: { start: 2019, end: 2022, basis: 'model-availability' },
    notes: 'Closed-book model-generation knowledge.',
    evidence: [{ detail: 'Model pattern knowledge.', source: 'Model pattern' }],
    suggestedModelNumbers: [],
    ...overrides.result,
  }, {
    provider: 'gemini',
    fallbackUsed: false,
    primaryProvider: 'gemini',
    primaryErrorCode: null,
    ...overrides.metadata,
  });
}

function closedBookGroqSuccess() {
  return async () => withMetadata({
    brand: 'LG',
    model: 'WM3900HWA',
    specificityLevel: 'specific',
    introductionYear: 2019,
    productionRange: { start: 2019, end: 2022, basis: 'model-availability' },
    notes: 'Closed-book model-generation knowledge from the backup provider.',
    evidence: [{ detail: 'Model pattern knowledge.', source: 'Model pattern' }],
    suggestedModelNumbers: [],
  }, {
    provider: 'groq',
    fallbackUsed: true,
    primaryProvider: 'gemini',
    primaryErrorCode: 'PROVIDER_5XX',
  });
}

const BASE_TIMEOUT_DEPS = {
  totalBudgetMs: 2000,
  groundedStageBudgetMs: 80,
  groundedFallbackMinRemainingMs: 100,
  groundedFallbackReserveMs: 50,
  groundedEnabled: true,
  localLookup: async () => null,
  redisFactory: () => redisMiss,
};

test('grounded timeout with sufficient remaining time falls back to closed-book Gemini', async () => {
  let groundedCalls = 0;
  let fallbackCalls = 0;
  const handler = createAgeLookupHandler({
    ...BASE_TIMEOUT_DEPS,
    groundedProviderLookup: async () => { groundedCalls += 1; return neverResolvingGrounded()(); },
    providerLookup: async () => { fallbackCalls += 1; return closedBookGeminiSuccess()(); },
  });
  const out = res();
  await handler(req('LG WM3900HWA'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(groundedCalls, 1);
  assert.equal(fallbackCalls, 1);
  assert.equal(out.payload.errorCode, null);
  assert.equal(out.payload.source, 'gemini');
  assert.equal(out.payload.evidenceSource, 'gemini-ungrounded');
  assert.equal(out.payload.groundedFallback, true);
  assert.deepEqual(out.payload.sources, []);
  assert.equal(out.payload.model, 'WM3900HWA');
  assert.equal(out.payload.introductionYear, 2019);
});

test('grounded timeout falls back to Groq when closed-book Gemini itself immediately fails', async () => {
  let groundedCalls = 0;
  let fallbackCalls = 0;
  const handler = createAgeLookupHandler({
    ...BASE_TIMEOUT_DEPS,
    groundedProviderLookup: async () => { groundedCalls += 1; return neverResolvingGrounded()(); },
    providerLookup: async () => { fallbackCalls += 1; return closedBookGroqSuccess()(); },
  });
  const out = res();
  await handler(req('LG WM3900HWA'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(groundedCalls, 1);
  assert.equal(fallbackCalls, 1);
  assert.equal(out.payload.source, 'groq');
  assert.equal(out.payload.evidenceSource, 'groq-ungrounded');
  assert.equal(out.payload.groundedFallback, true);
  assert.equal(out.payload.fallbackUsed, true);
  assert.deepEqual(out.payload.sources, []);
});

test('grounded timeout with insufficient remaining budget skips fallback and preserves the safe timeout response', async () => {
  let fallbackCalls = 0;
  const handler = createAgeLookupHandler({
    // Total budget must still clear the pre-provider hasTime(900,300) gate;
    // the grounded stage then consumes most of it, leaving less than
    // groundedFallbackMinRemainingMs for a fallback attempt.
    totalBudgetMs: 1400,
    groundedStageBudgetMs: 1000,
    groundedFallbackMinRemainingMs: 1000,
    groundedFallbackReserveMs: 50,
    groundedEnabled: true,
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    groundedProviderLookup: () => new Promise(() => {}),
    providerLookup: async () => { fallbackCalls += 1; return closedBookGeminiSuccess()(); },
  });
  const out = res();
  await handler(req('LG WM3900HWA'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(fallbackCalls, 0);
  assert.equal(out.payload.errorCode, 'PROVIDER_TIMEOUT');
  assert.equal(out.payload.fallbackUsed, false);
  assert.equal(out.payload.groundedFallback, false);
  assert.deepEqual(out.payload.sources, []);
});

test('grounded malformed output does not duplicate fallback (already resolved inside the bounded Groq path)', async () => {
  // A malformed-JSON failure from groundedProviderLookup means Gemini's own
  // bounded Groq attempt (inside callGeminiWithGroqFallback) already ran and
  // also failed before this error could surface here -- retrying with a
  // second closed-book Gemini call would be a redundant, undemonstrated
  // extra provider attempt for a failure class that already has working
  // recovery. Only a genuine stage timeout gets the new fallback layer.
  let fallbackCalls = 0;
  const handler = createAgeLookupHandler({
    groundedEnabled: true,
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    groundedProviderLookup: async () => {
      throw new SmartLookupProviderError('PROVIDER_MALFORMED_JSON', 'malformed', { provider: 'gemini' });
    },
    providerLookup: async () => { fallbackCalls += 1; return closedBookGeminiSuccess()(); },
  });
  const out = res();
  await handler(req('LG WM3900HWA'), out);
  assert.equal(fallbackCalls, 0);
  assert.equal(out.payload.errorCode, 'PROVIDER_MALFORMED_JSON');
});

test('grounded sourceless success is downgraded without ever invoking the fallback layer', async () => {
  let fallbackCalls = 0;
  const handler = createAgeLookupHandler({
    groundedEnabled: true,
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    groundedProviderLookup: async () => withMetadata({
      brand: 'LG', model: 'WM3900HWA', specificityLevel: 'specific',
      introductionYear: 2019, productionRange: { start: 2019, end: 2022 },
      evidence: [], suggestedModelNumbers: [],
    }, { provider: 'gemini', fallbackUsed: false, grounded: true, groundedSources: [], searchQueryCount: 0 }),
    providerLookup: async () => { fallbackCalls += 1; return closedBookGeminiSuccess()(); },
  });
  const out = res();
  await handler(req('LG WM3900HWA'), out);
  assert.equal(fallbackCalls, 0);
  assert.equal(out.payload.evidenceSource, 'gemini-ungrounded');
  assert.equal(out.payload.groundedFallback, false);
});

test('no second full timeout chain: the fallback stage budget is capped by remaining time, not a fresh provider ceiling', async () => {
  let capturedMaxMs = null;
  // providerBudgetMs is deliberately set far larger than what will actually
  // remain after the grounded stage times out, so a passing assertion that
  // capturedMaxMs is small proves the fallback used deadline.remainingMs()
  // (the one authoritative route deadline) rather than a fresh full ceiling.
  const handler = createAgeLookupHandler({
    totalBudgetMs: 1800,
    providerBudgetMs: 5000,
    groundedStageBudgetMs: 1400,
    groundedFallbackMinRemainingMs: 50,
    groundedFallbackReserveMs: 50,
    groundedEnabled: true,
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    groundedProviderLookup: () => new Promise(() => {}),
    providerLookup: async (_input, options) => {
      capturedMaxMs = options.maxMs;
      return closedBookGeminiSuccess()();
    },
  });
  const out = res();
  const started = Date.now();
  await handler(req('LG WM3900HWA'), out);
  const elapsed = Date.now() - started;
  assert.ok(capturedMaxMs !== null, 'fallback should have been attempted');
  assert.ok(capturedMaxMs < 1000, `fallback maxMs (${capturedMaxMs}) must be far below the artificial 5000ms provider ceiling, proving it is capped by remaining route-deadline time, not a fresh budget`);
  assert.ok(elapsed < 1900, `total elapsed (${elapsed}ms) must stay within the original 1800ms deadline plus scheduling slack`);
});

test('grounded timeout and fallback reserve exactly one logical daily budget', async () => {
  let budgetCalls = 0;
  const handler = createAgeLookupHandler({
    ...BASE_TIMEOUT_DEPS,
    reserveProviderBudget: async () => { budgetCalls += 1; return { allowed: true, status: 'allowed', logicalLookupCount: 1 }; },
    groundedProviderLookup: () => new Promise(() => {}),
    providerLookup: closedBookGeminiSuccess(),
  });
  const out = res();
  await handler(req('LG WM3900HWA'), out);
  assert.equal(budgetCalls, 1);
  assert.equal(out.payload.groundedFallback, true);
});

test('exact model suffix is preserved through a grounded-timeout fallback', async () => {
  const handler = createAgeLookupHandler({
    ...BASE_TIMEOUT_DEPS,
    groundedProviderLookup: () => new Promise(() => {}),
    providerLookup: closedBookGeminiSuccess(),
  });
  const out = res();
  await handler(req('LG WM3900HWA'), out);
  assert.equal(out.payload.model, 'WM3900HWA');
  assert.equal(out.payload.brand, 'LG');
});

test('a fallback result that does not match the exact requested model is still rejected by existing validation', async () => {
  const handler = createAgeLookupHandler({
    ...BASE_TIMEOUT_DEPS,
    groundedProviderLookup: () => new Promise(() => {}),
    providerLookup: closedBookGeminiSuccess({ result: { model: 'WM4000HBA' } }),
  });
  const out = res();
  await handler(req('LG WM3900HWA'), out);
  assert.equal(out.payload.errorCode, 'UNRELATED_MODEL');
});

test('cached ungrounded-via-fallback result remains labeled ungrounded on read, never re-labeled grounded', () => {
  const cachedFallbackPayload = {
    brand: 'LG', model: 'WM3900HWA', specificityLevel: 'specific',
    introductionYear: 2019, productionRange: { start: 2019, end: 2022 },
    evidenceSource: 'gemini-ungrounded',
    groundedFallback: true,
    sources: [{ title: 'not-real.example.com', domain: 'not-real.example.com', uri: 'https://not-real.example.com' }],
    originSource: 'gemini',
  };
  const normalized = normalizeCachedSmartAgeResult(cachedFallbackPayload, {
    queryInfo: { brand: 'LG', modelIdentity: 'WM3900HWA', modelCompleteness: 'exact', specificityLevel: 'specific' },
  });
  assert.equal(normalized.evidenceSource, 'gemini-ungrounded');
  assert.equal(normalized.groundedFallback, true);
  // sources must stay empty: raw.sources is only trusted for evidenceSource
  // 'gemini-grounded', never for an ungrounded (even fallback-recovered) result.
  assert.deepEqual(normalized.sources, []);
  assert.equal(normalized.cacheStatus, 'hit');
});

test('concurrent identical requests during a grounded timeout share one grounded attempt and one fallback chain', async () => {
  let groundedCalls = 0;
  let fallbackCalls = 0;
  const handler = createAgeLookupHandler({
    ...BASE_TIMEOUT_DEPS,
    groundedProviderLookup: async () => { groundedCalls += 1; return new Promise(() => {}); },
    providerLookup: async () => { fallbackCalls += 1; return closedBookGeminiSuccess()(); },
  });
  const first = res();
  const second = res();
  await Promise.all([handler(req('LG WM3900HWA'), first), handler(req('LG WM3900HWA'), second)]);
  assert.equal(groundedCalls, 1);
  assert.equal(fallbackCalls, 1);
  assert.equal(first.payload.groundedFallback, true);
  assert.equal(second.payload.groundedFallback, true);
});

test('grounded-timeout-fallback telemetry logs summary fields but never raw notes, model text, or a provider payload', async () => {
  const logs = [];
  const handler = createAgeLookupHandler({
    ...BASE_TIMEOUT_DEPS,
    groundedProviderLookup: () => new Promise(() => {}),
    providerLookup: closedBookGeminiSuccess(),
    logger: { info: (line) => logs.push(line), warn: () => {}, error: () => {} },
  });
  const out = res();
  await handler(req('LG WM3900HWA', { notes: 'bought secondhand from a neighbor in 2022' }), out);
  const entry = JSON.parse(logs[logs.length - 1]);
  assert.equal(entry.groundedAttempted, true);
  assert.equal(entry.groundedSucceeded, false);
  assert.equal(entry.groundedFailureCode, 'STAGE_TIMEOUT');
  assert.ok(Number.isFinite(entry.groundedDurationMs));
  assert.equal(entry.fallbackAttempted, true);
  assert.equal(entry.fallbackProvider, 'gemini');
  assert.equal(entry.fallbackSucceeded, true);
  assert.ok(Number.isFinite(entry.fallbackDurationMs));
  const logText = logs.join('\n');
  assert.equal(logText.includes('neighbor'), false);
  assert.equal(logText.includes('WM3900HWA'), false);
  assert.equal(out.payload.groundedFallback, true);
});
