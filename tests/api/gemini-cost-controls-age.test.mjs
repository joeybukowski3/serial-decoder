import test from 'node:test';
import assert from 'node:assert/strict';

import { createAgeLookupHandler } from '../../api/age-lookup.js';
import { allowingRateLimiter } from '../helpers/allowing-rate-limiter.mjs';

/**
 * Cost-control behavior of /api/age-lookup, exercised through the REAL provider
 * code with a fake fetch so HTTP attempts, models and token counts are the
 * things actually being measured.
 */

const QUERY = 'Xbox One X';
const NATIVE_MODEL = 'gemini-3.5-flash-lite';
const CLOSED_BOOK_MODEL = 'gemini-2.5-flash';

function ageResult() {
  return {
    brand: 'Microsoft',
    model: 'Xbox One X',
    likelyProduct: 'Microsoft Xbox One X',
    specificityLevel: 'unknown',
    introductionYear: 2017,
    identityConfidence: 'medium',
    summary: 'Introduced in 2017.',
  };
}

function reply(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
    async json() { return body; },
  };
}

const geminiOk = () => reply(200, {
  candidates: [{ content: { parts: [{ text: JSON.stringify(ageResult()) }] } }],
  usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 40 },
});
const groqOk = () => reply(200, {
  choices: [{ message: { content: JSON.stringify(ageResult()) } }],
  usage: { prompt_tokens: 90, completion_tokens: 30 },
});

/** Routes fake HTTP by URL and records which model/provider was called. */
function makeFetch({ native, closedBook, groq }) {
  const calls = { native: 0, closedBook: 0, groq: 0 };
  const fetchImpl = async (url) => {
    const target = String(url);
    if (target.includes(NATIVE_MODEL)) { calls.native += 1; return native(); }
    if (target.includes(CLOSED_BOOK_MODEL)) { calls.closedBook += 1; return closedBook(); }
    if (target.includes('api.groq.com')) { calls.groq += 1; return groq(); }
    throw new Error(`unexpected provider URL: ${target}`);
  };
  return { fetchImpl, calls };
}

function makeRedis() {
  const store = new Map();
  return {
    store,
    get: async (key) => (store.has(key) ? store.get(key) : null),
    set: async (key, value) => { store.set(key, value); },
    eval: async () => [1, 1, 1],
    incrby: async (_key, amount) => amount,
    expire: async () => 1,
  };
}

function makeHandler({ fetchImpl, redis = makeRedis(), rateLimiter = allowingRateLimiter, localLookup } = {}) {
  const lines = [];
  const usage = [];
  const handler = createAgeLookupHandler({
    env: {
      SMART_LOOKUP_NATIVE_GEMINI_SEARCH_ENABLED: 'true',
      GEMINI_API_KEY: 'test-gemini-key',
      GROQ_API_KEY: 'test-groq-key',
    },
    logger: { info: (line) => lines.push(line), log() {}, warn() {}, error() {} },
    apiKey: 'test-gemini-key', // legacy closed-book provider reads dependencies.apiKey
    localLookup: localLookup || (async () => null),
    redisFactory: () => redis,
    rateLimiter,
    reserveProviderBudget: async () => ({ allowed: true, status: 'allowed', logicalLookupCount: 1 }),
    recordProviderUsage: async (_redis, attempt) => { usage.push(attempt); },
    fetchImpl,
  });
  const parsed = () => lines.map((line) => { try { return JSON.parse(line); } catch (_) { return null; } }).filter(Boolean);
  return {
    handler,
    redis,
    usage,
    lines,
    attemptLogs: () => parsed().filter((entry) => entry.event === 'provider_attempt'),
    requestLog: () => parsed().filter((entry) => entry.event === 'smart_age_lookup').at(-1),
  };
}

function req(query = QUERY) {
  return { method: 'POST', body: { query }, headers: { 'x-forwarded-for': '198.51.100.23', 'x-request-id': 'req-age-1' }, socket: {} };
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

// --------------------------------------------------------------------------
// 1. A Gemini 429 never triggers a second Gemini request
// --------------------------------------------------------------------------

test('Gemini 429 on the native model does NOT trigger another Gemini model; Groq answers instead', async () => {
  const { fetchImpl, calls } = makeFetch({
    native: () => reply(429, { error: { message: 'quota' } }, { 'retry-after': '30' }),
    closedBook: () => { throw new Error('a second Gemini model must not be called after a 429'); },
    groq: groqOk,
  });
  const ctx = makeHandler({ fetchImpl });
  const out = res();
  await ctx.handler(req(), out);

  assert.equal(out.statusCode, 200);
  assert.equal(calls.native, 1);
  assert.equal(calls.closedBook, 0, 'no gemini-2.5-flash request after a 429');
  assert.equal(calls.groq, 1);
  assert.equal(out.payload.errorCode ?? null, null);
  assert.equal(out.payload.introductionYear, 2017);
});

test('a Gemini 429 is recorded as rate_limited (distinct from other failures) with the right fallback reason', async () => {
  const { fetchImpl } = makeFetch({
    native: () => reply(429, {}, { 'retry-after': '30' }),
    closedBook: () => { throw new Error('must not be called'); },
    groq: groqOk,
  });
  const ctx = makeHandler({ fetchImpl });
  await ctx.handler(req(), res());

  const attempts = ctx.attemptLogs();
  assert.equal(attempts.length, 2);
  assert.deepEqual(
    attempts.map((a) => [a.attemptNumber, a.provider, a.model, a.providerStatus, a.fallbackReason]),
    [
      [1, 'gemini', NATIVE_MODEL, 'rate_limited', null],
      [2, 'groq', 'openai/gpt-oss-20b', 'ok', 'gemini_rate_limited'],
    ],
  );
  const summary = ctx.requestLog();
  assert.equal(summary.actualProviderAttemptCount, 2);
  assert.equal(summary.geminiAttemptCount, 1);
  assert.equal(summary.groqAttemptCount, 1);
  assert.equal(summary.providerRateLimitCount, 1);
  assert.equal(summary.fallbackAttemptCount, 1);
});

test('a Gemini 429 plus an unavailable Groq degrades to PROVIDER_RATE_LIMIT, still with no second Gemini call', async () => {
  const { fetchImpl, calls } = makeFetch({
    native: () => reply(429, {}),
    closedBook: () => { throw new Error('must not be called'); },
    groq: () => reply(500, {}),
  });
  const ctx = makeHandler({ fetchImpl });
  const out = res();
  await ctx.handler(req(), out);

  assert.equal(calls.closedBook, 0);
  assert.equal(out.payload.errorCode, 'PROVIDER_RATE_LIMIT', 'provider 429 is distinct from our own RATE_LIMIT');
  assert.notEqual(out.payload.errorCode, 'RATE_LIMIT');
  assert.equal(out.payload.providerAttempted, true);
  assert.equal(ctx.requestLog().actualProviderAttemptCount, 2);
});

test('after a 429 a cooldown skips Gemini for later requests, even on another instance sharing Redis', async () => {
  const redis = makeRedis();
  const first = makeFetch({
    native: () => reply(429, {}, { 'retry-after': '30' }),
    closedBook: () => { throw new Error('must not be called'); },
    groq: groqOk,
  });
  await makeHandler({ fetchImpl: first.fetchImpl, redis }).handler(req(), res());
  assert.equal(redis.store.get('gemini-cooldown:v1'), '1', 'the 429 starts a shared cooldown');

  // A different serverless instance (fresh in-memory state), a different query.
  const second = makeFetch({
    native: () => { throw new Error('native Gemini must not be called during the cooldown'); },
    closedBook: () => { throw new Error('Gemini must not be called during the cooldown'); },
    groq: groqOk,
  });
  const other = makeHandler({ fetchImpl: second.fetchImpl, redis });
  const out = res();
  await other.handler(req('Xbox Series X console'), out);

  assert.equal(second.calls.native, 0);
  assert.equal(second.calls.closedBook, 0);
  assert.equal(second.calls.groq, 1);
  assert.equal(other.requestLog().geminiCooldownActive, true);
  assert.equal(other.attemptLogs()[0].fallbackReason, 'gemini_cooldown');
});

// --------------------------------------------------------------------------
// 2. Malformed / low-quality output may still use the allowed fallback
// --------------------------------------------------------------------------

test('malformed native output may still fall back to Gemini 2.5, and both attempts are counted', async () => {
  const { fetchImpl, calls } = makeFetch({
    native: () => reply(200, {
      candidates: [{ content: { parts: [{ text: 'this is not json at all' }] } }],
      usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 15 },
    }),
    closedBook: geminiOk,
    groq: () => { throw new Error('Groq is not needed'); },
  });
  const ctx = makeHandler({ fetchImpl });
  const out = res();
  await ctx.handler(req(), out);

  assert.equal(out.statusCode, 200);
  assert.equal(calls.native, 1);
  assert.equal(calls.closedBook, 1, 'a malformed (not rate-limited) answer keeps the Gemini fallback');
  assert.equal(out.payload.introductionYear, 2017);

  const attempts = ctx.attemptLogs();
  assert.deepEqual(
    attempts.map((a) => [a.model, a.providerStatus, a.fallbackReason]),
    [[NATIVE_MODEL, 'malformed', null], [CLOSED_BOOK_MODEL, 'ok', 'native_malformed']],
  );
});

// --------------------------------------------------------------------------
// 3. Attempt counts are accurate, and tokens/privacy are handled
// --------------------------------------------------------------------------

test('actualProviderAttemptCount includes the failed native call that fell through (previously undercounted)', async () => {
  const { fetchImpl } = makeFetch({
    native: () => reply(200, { candidates: [{ content: { parts: [{ text: 'garbage' }] } }] }),
    closedBook: geminiOk,
    groq: groqOk,
  });
  const ctx = makeHandler({ fetchImpl });
  await ctx.handler(req(), res());

  assert.equal(ctx.requestLog().actualProviderAttemptCount, 2, 'one failed native + one successful closed-book call');
  assert.equal(ctx.requestLog().geminiAttemptCount, 2);
});

test('a single successful native call is exactly one attempt', async () => {
  const native = () => reply(200, {
    candidates: [{
      content: { parts: [{ text: JSON.stringify({
        brand: 'Microsoft', product: 'Xbox One X', model: 'Xbox One X', category: 'Home video game console',
        bestEstimateYear: 2017, estimatedRange: { startYear: 2017, endYear: 2020 }, precision: 'exact_model',
        confidence: 'high', estimateBasis: 'Introduced in 2017.', summary: 'Higher-performance Xbox One console.',
        isIndividualUnitDate: false, caveats: [],
      }) }] },
      groundingMetadata: { groundingChunks: [{ web: { uri: 'https://www.xbox.com/xbox-one-x', title: 'xbox.com' } }] },
    }],
    usageMetadata: { promptTokenCount: 310, candidatesTokenCount: 95, thoughtsTokenCount: 12 },
  });
  const { fetchImpl, calls } = makeFetch({
    native,
    closedBook: () => { throw new Error('unexpected'); },
    groq: () => { throw new Error('unexpected'); },
  });
  const ctx = makeHandler({ fetchImpl });
  await ctx.handler(req(), res());

  assert.equal(calls.native, 1);
  assert.equal(ctx.requestLog().actualProviderAttemptCount, 1);
  const [attempt] = ctx.attemptLogs();
  assert.equal(attempt.model, NATIVE_MODEL);
  assert.equal(attempt.inputTokens, 310);
  assert.equal(attempt.outputTokens, 95);
  assert.equal(attempt.thinkingTokens, 12);
});

test('provider_attempt lines carry the requested fields and never a raw query, IP, key or body', async () => {
  const { fetchImpl } = makeFetch({
    native: () => reply(429, {}),
    closedBook: () => { throw new Error('must not be called'); },
    groq: groqOk,
  });
  const ctx = makeHandler({ fetchImpl });
  await ctx.handler(req(), res());

  const [first] = ctx.attemptLogs();
  for (const field of [
    'requestId', 'route', 'queryHash', 'provider', 'model', 'attemptNumber', 'providerStatus',
    'fallbackReason', 'resultSource', 'cacheStatus', 'backgroundRefinementTriggered', 'inputTokens', 'outputTokens',
  ]) {
    assert.ok(field in first, `provider_attempt is missing ${field}`);
  }
  assert.equal(first.requestId, 'req-age-1');
  assert.equal(first.route, 'age');
  assert.match(first.queryHash, /^[0-9a-f]{24}$/);
  assert.equal(first.resultSource, 'provider');
  assert.equal(first.cacheStatus, 'miss');
  assert.equal(first.backgroundRefinementTriggered, false);

  const everything = ctx.lines.join('\n');
  assert.equal(everything.includes('Xbox One X'), false, 'raw query must never be logged');
  assert.equal(everything.includes('198.51.100.23'), false, 'full IP must never be logged');
  assert.equal(everything.includes('test-gemini-key'), false);
  assert.equal(everything.includes('test-groq-key'), false);
});

test('every attempt feeds the daily usage aggregate with route, provider, model, status and tokens', async () => {
  const { fetchImpl } = makeFetch({
    native: () => reply(429, {}),
    closedBook: () => { throw new Error('must not be called'); },
    groq: groqOk,
  });
  const ctx = makeHandler({ fetchImpl });
  await ctx.handler(req(), res());

  assert.deepEqual(
    ctx.usage.map((a) => [a.route, a.provider, a.model, a.providerStatus]),
    [['age', 'gemini', NATIVE_MODEL, 'rate_limited'], ['age', 'groq', 'openai/gpt-oss-20b', 'ok']],
  );
  assert.equal(ctx.usage[1].inputTokens, 90);
  assert.equal(ctx.usage[1].outputTokens, 30);
});

// --------------------------------------------------------------------------
// 4. Rate-limit / budget store outage fails closed
// --------------------------------------------------------------------------

test('a rate-limit store outage prevents ANY paid provider call', async () => {
  const { fetchImpl, calls } = makeFetch({
    native: () => { throw new Error('paid call made without a limiter'); },
    closedBook: () => { throw new Error('paid call made without a limiter'); },
    groq: () => { throw new Error('paid call made without a limiter'); },
  });
  const ctx = makeHandler({
    fetchImpl,
    rateLimiter: { limit: async () => { throw new Error('ECONNREFUSED redis'); } },
  });
  const out = res();
  await ctx.handler(req(), out);

  assert.deepEqual(calls, { native: 0, closedBook: 0, groq: 0 });
  assert.equal(out.statusCode, 200);
  assert.equal(out.payload.errorCode, 'RATE_LIMIT_STORE_UNAVAILABLE');
  assert.equal(out.payload.providerAttempted, false);
  assert.equal(ctx.requestLog().actualProviderAttemptCount, 0);
});

test('a missing limiter (no Redis configured) also fails closed for paid research', async () => {
  const { fetchImpl, calls } = makeFetch({
    native: () => { throw new Error('paid call made without a limiter'); },
    closedBook: () => { throw new Error('paid call made without a limiter'); },
    groq: () => { throw new Error('paid call made without a limiter'); },
  });
  const lines = [];
  const handler = createAgeLookupHandler({
    env: { SMART_LOOKUP_NATIVE_GEMINI_SEARCH_ENABLED: 'true', GEMINI_API_KEY: 'k' },
    logger: { info: (l) => lines.push(l), log() {}, warn() {}, error() {} },
    localLookup: async () => null,
    redisFactory: () => makeRedis(),
    rateLimiterFactory: () => null,
    reserveProviderBudget: async () => ({ allowed: true, status: 'allowed', logicalLookupCount: 1 }),
    fetchImpl,
  });
  const out = res();
  await handler(req(), out);

  assert.deepEqual(calls, { native: 0, closedBook: 0, groq: 0 });
  assert.equal(out.payload.errorCode, 'RATE_LIMIT_STORE_UNAVAILABLE');
});

test('local results still work while the rate-limit store is down', async () => {
  const { fetchImpl, calls } = makeFetch({
    native: () => { throw new Error('unexpected'); },
    closedBook: () => { throw new Error('unexpected'); },
    groq: () => { throw new Error('unexpected'); },
  });
  const ctx = makeHandler({
    fetchImpl,
    rateLimiter: { limit: async () => { throw new Error('redis down'); } },
    localLookup: async () => ({
      brand: 'Microsoft', model: 'Xbox One X', category: 'Home video game console', itemCategory: 'Home video game console',
      specificityLevel: 'specific', introductionYear: 2017, productionRange: { start: 2017, end: 2020 },
      identityConfidence: 'high', summary: 'Local record.',
    }),
  });
  const out = res();
  await ctx.handler(req(), out);

  assert.equal(out.statusCode, 200);
  assert.equal(out.payload.source, 'local-db');
  assert.deepEqual(calls, { native: 0, closedBook: 0, groq: 0 });
});

test('an unavailable budget store no longer lets the native path through', async () => {
  const { fetchImpl, calls } = makeFetch({
    native: () => { throw new Error('native fail-open on budget outage is removed'); },
    closedBook: () => { throw new Error('unexpected'); },
    groq: () => { throw new Error('unexpected'); },
  });
  const lines = [];
  const handler = createAgeLookupHandler({
    env: { SMART_LOOKUP_NATIVE_GEMINI_SEARCH_ENABLED: 'true', GEMINI_API_KEY: 'k' },
    logger: { info: (l) => lines.push(l), log() {}, warn() {}, error() {} },
    localLookup: async () => null,
    redisFactory: () => makeRedis(),
    rateLimiter: allowingRateLimiter,
    reserveProviderBudget: async () => ({ allowed: false, status: 'unavailable', errorCode: 'BUDGET_STORE_UNAVAILABLE' }),
    fetchImpl,
  });
  const out = res();
  await handler(req(), out);

  assert.equal(calls.native, 0);
  assert.equal(out.payload.errorCode, 'BUDGET_STORE_UNAVAILABLE');
});
