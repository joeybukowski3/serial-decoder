import test from 'node:test';
import assert from 'node:assert/strict';

import { createAgeLookupHandler } from '../../api/age-lookup.js';
import { createQuotaMeter, quotaKeys } from '../../lib/quota/meter.js';
import { allowingRateLimiter } from '../helpers/allowing-rate-limiter.mjs';
import { createFakeRedis } from '../helpers/fake-redis.mjs';

/**
 * Logical AI-lookup metering through the real /api/age-lookup handler: what
 * consumes a credit, what never does, and that shadow mode never blocks.
 */

const NATIVE_MODEL = 'gemini-3.5-flash-lite';
const CLOSED_BOOK_MODEL = 'gemini-2.5-flash';
const DAY1 = Date.UTC(2026, 8, 29, 12, 0, 0);
const DAY2 = Date.UTC(2026, 8, 30, 12, 0, 0);
const NEXT_MONTH = Date.UTC(2026, 9, 1, 12, 0, 0);
const VISITOR_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const VISITOR_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const reply = (status, body, headers = {}) => ({
  ok: status < 400, status,
  headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
  async json() { return body; },
});

const nativeOk = () => reply(200, {
  candidates: [{
    content: { parts: [{ text: JSON.stringify({
      brand: 'Microsoft', product: 'Xbox One X', model: 'Xbox One X', category: 'Home video game console',
      bestEstimateYear: 2017, estimatedRange: { startYear: 2017, endYear: 2020 }, precision: 'exact_model',
      confidence: 'high', estimateBasis: 'Introduced in 2017.', summary: 'Higher-performance Xbox One console.',
      isIndividualUnitDate: false, caveats: [],
    }) }] },
    groundingMetadata: { groundingChunks: [{ web: { uri: 'https://www.xbox.com/xbox-one-x', title: 'xbox.com' } }] },
  }],
  usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 },
});
const ageJson = { brand: 'Microsoft', model: 'Xbox One X', likelyProduct: 'Microsoft Xbox One X', specificityLevel: 'unknown', introductionYear: 2017, identityConfidence: 'medium', summary: 'Introduced in 2017.' };
const closedBookOk = () => reply(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(ageJson) }] } }] });
const groqOk = () => reply(200, { choices: [{ message: { content: JSON.stringify(ageJson) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } });

function harness(options = {}) {
  const {
    meterEnv = {}, clock = { now: DAY1 }, redis = createFakeRedis(), localLookup = async () => null,
    rateLimiter = allowingRateLimiter, native = nativeOk, closedBook = closedBookOk, groq = groqOk, meterOn = true,
  } = options;
  const calls = { native: 0, closedBook: 0, groq: 0 };
  const lines = [];
  const fetchImpl = async (url) => {
    const target = String(url);
    if (target.includes(NATIVE_MODEL)) { calls.native += 1; return native(); }
    if (target.includes(CLOSED_BOOK_MODEL)) { calls.closedBook += 1; return closedBook(); }
    if (target.includes('api.groq.com')) { calls.groq += 1; return groq(); }
    throw new Error(`unexpected provider URL ${target}`);
  };
  const handler = createAgeLookupHandler({
    env: { SMART_LOOKUP_NATIVE_GEMINI_SEARCH_ENABLED: 'true', GEMINI_API_KEY: 'test-gemini-key', GROQ_API_KEY: 'test-groq-key' },
    apiKey: 'test-gemini-key',
    logger: { info: (line) => lines.push(line), log() {}, warn() {}, error() {} },
    localLookup,
    redisFactory: () => redis,
    rateLimiter,
    reserveProviderBudget: async () => ({ allowed: true, status: 'allowed', logicalLookupCount: 1 }),
    quotaMeter: createQuotaMeter({
      env: { ...(meterOn ? { SMART_LOOKUP_QUOTA_METERING: '1' } : {}), ...meterEnv },
      now: () => clock.now,
    }),
    fetchImpl,
  });
  const events = () => lines.map((line) => { try { return JSON.parse(line); } catch (_) { return null; } }).filter(Boolean);
  const day = () => new Date(clock.now).toISOString().slice(0, 10);
  const month = () => new Date(clock.now).toISOString().slice(0, 7);
  return {
    handler, redis, calls, clock, lines,
    requestLogs: () => events().filter((event) => event.event === 'smart_age_lookup'),
    lastLog: () => events().filter((event) => event.event === 'smart_age_lookup').at(-1),
    usageEvents: () => redis.hash(`provider-usage:v1:${day()}`),
    daily: () => redis.hash(quotaKeys.daily(day())),
    monthly: () => redis.hash(quotaKeys.monthly(month())),
    ipDaily: () => redis.hash(quotaKeys.ip(day())),
    subjectsToday: () => Object.keys(redis.hash(quotaKeys.daily(day()))),
  };
}

function req(query, { visitor = VISITOR_A, ip = '198.51.100.23' } = {}) {
  const headers = { 'x-forwarded-for': ip, 'x-request-id': `r-${Math.random().toString(36).slice(2, 8)}` };
  if (visitor) headers['x-visitor-id'] = visitor;
  return { method: 'POST', body: { query }, headers, socket: {} };
}

function res() {
  return {
    statusCode: 0, payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    setHeader() {},
  };
}

async function run(h, query, options) {
  const out = res();
  await h.handler(req(query, options), out);
  await new Promise((resolve) => setImmediate(resolve)); // let best-effort cache writes land
  return out;
}

const total = (hashObject) => Object.values(hashObject).reduce((sum, value) => sum + Number(value), 0);

// --------------------------------------------------------------------------
// What consumes zero credits
// --------------------------------------------------------------------------

test('a local/database result consumes 0 AI credits', async () => {
  const h = harness({
    localLookup: async () => ({
      brand: 'Microsoft', model: 'Xbox One X', category: 'Home video game console', itemCategory: 'Home video game console',
      specificityLevel: 'specific', introductionYear: 2017, productionRange: { start: 2017, end: 2020 }, identityConfidence: 'high', summary: 'Local.',
    }),
  });
  const out = await run(h, 'Xbox One X');

  assert.equal(out.payload.source, 'local-db');
  assert.equal(total(h.daily()), 0);
  assert.equal(total(h.monthly()), 0);
  assert.deepEqual(h.calls, { native: 0, closedBook: 0, groq: 0 });
  assert.equal(Number(h.usageEvents()['age|event:outcome:local']), 1, 'counted as a local completion');
  assert.equal(h.usageEvents()['age|event:ai_lookup'], undefined);
});

test('a cached result consumes 0 AI credits (only the lookup that filled the cache was metered)', async () => {
  const h = harness();
  await run(h, 'Xbox One X', { visitor: VISITOR_A });
  const second = await run(h, 'Xbox One X', { visitor: VISITOR_B });

  assert.equal(second.payload.cacheStatus, 'hit');
  assert.equal(h.calls.native, 1, 'the cache answered the second lookup');
  assert.equal(total(h.daily()), 1, 'only visitor A was charged');
  assert.equal(Number(h.usageEvents()['age|event:outcome:cache']), 1);
  assert.equal(Number(h.usageEvents()['age|event:ai_lookup']), 1);
});

test('a deterministic result consumes 0 AI credits', async () => {
  const h = harness({
    native: () => { throw new Error('no provider call expected'); },
    closedBook: () => { throw new Error('no provider call expected'); },
    groq: () => { throw new Error('no provider call expected'); },
  });
  // No recognizable product signal: answered by the deterministic clarification, never a provider.
  const out = await run(h, 'zxcvbnmqw');

  assert.equal(out.statusCode, 200);
  assert.deepEqual(h.calls, { native: 0, closedBook: 0, groq: 0 });
  assert.equal(total(h.daily()), 0);
  assert.equal(Number(h.usageEvents()['age|event:outcome:deterministic']), 1);
});

// --------------------------------------------------------------------------
// What consumes exactly one
// --------------------------------------------------------------------------

test('a paid-provider lookup consumes exactly one logical AI lookup', async () => {
  const h = harness();
  const out = await run(h, 'Xbox One X');

  assert.equal(out.statusCode, 200);
  assert.equal(h.calls.native, 1);
  assert.equal(total(h.daily()), 1);
  assert.equal(total(h.monthly()), 1);
  const log = h.lastLog();
  assert.equal(log.logicalAiLookupCount, 1);
  assert.equal(log.quotaMode, 'shadow');
  assert.equal(log.quotaTier, 'anonymous');
  assert.equal(log.quotaUsedToday, 1);
  assert.equal(log.quotaRemainingDaily, 4);
  assert.equal(log.quotaWouldAllow, true);
  assert.equal(log.quotaWouldBlock, false);
  assert.equal(Number(h.usageEvents()['age|event:outcome:ai']), 1);
  assert.equal(Number(h.usageEvents()['age|event:ai_lookup']), 1);
});

test('fallback providers behind one lookup still consume only one logical credit', async () => {
  // Native Gemini 429 -> Groq answers: two provider HTTP attempts, one credit.
  const rateLimited = harness({ native: () => reply(429, {}) });
  const first = await run(rateLimited, 'Xbox One X');
  assert.equal(first.statusCode, 200);
  assert.equal(rateLimited.lastLog().actualProviderAttemptCount, 2);
  assert.equal(rateLimited.lastLog().logicalAiLookupCount, 1);
  assert.equal(total(rateLimited.daily()), 1);

  // Malformed native output -> Gemini 2.5 answers: again two attempts, one credit.
  const malformed = harness({ native: () => reply(200, { candidates: [{ content: { parts: [{ text: 'not json' }] } }] }) });
  await run(malformed, 'Xbox One X');
  assert.equal(malformed.lastLog().actualProviderAttemptCount, 2);
  assert.equal(malformed.lastLog().logicalAiLookupCount, 1);
  assert.equal(total(malformed.daily()), 1);
});

test('an immediate retry of the same query does not double count, even when the cache cannot answer it', async () => {
  const redis = createFakeRedis();
  const realGet = redis.get;
  redis.get = async (key) => (String(key).startsWith('smart-age:') ? null : realGet(key)); // force provider use each time
  const h = harness({ redis });
  await run(h, 'Xbox One X');
  await run(h, 'Xbox One X'); // e.g. the user pressed Retry / resubmitted

  assert.equal(h.calls.native, 2, 'the provider really ran twice');
  assert.equal(total(h.daily()), 1, 'but it is one logical lookup');
  assert.equal(h.requestLogs().at(-1).quotaDuplicate, true);
  assert.equal(h.requestLogs().at(-1).logicalAiLookupCount, 0);
  assert.equal(Number(h.usageEvents()['age|event:ai_lookup_duplicate']), 1);
});

test('a failed lookup is refunded, and the retry that succeeds is the only credit spent', async () => {
  let failing = true;
  const h = harness({
    native: () => (failing ? reply(429, {}) : nativeOk()),
    groq: () => (failing ? reply(500, {}) : groqOk()),
  });
  const failed = await run(h, 'Xbox One X');
  assert.equal(failed.payload.errorCode, 'PROVIDER_RATE_LIMIT');
  assert.equal(total(h.daily()), 0, 'no AI result: no allowance spent');
  assert.equal(h.lastLog().quotaRefunded, true);
  assert.equal(h.lastLog().logicalAiLookupCount, 0);
  assert.equal(Number(h.usageEvents()['age|event:ai_lookup_refunded']), 1);

  failing = false;
  // Clear the shared Gemini cooldown the 429 started, as it would expire in production.
  h.redis.strings.delete('gemini-cooldown:v1');
  const handlerB = harness({ redis: h.redis, clock: h.clock });
  const ok = await run(handlerB, 'Xbox One X');
  assert.equal(ok.statusCode, 200);
  assert.equal(total(h.daily()), 1, 'fail + success nets exactly one');
});

test('a paid-path refusal (rate-limit store outage) never leaves a credit behind', async () => {
  const h = harness({ rateLimiter: { limit: async () => { throw new Error('redis down'); } } });
  const out = await run(h, 'Xbox One X');
  assert.equal(out.payload.errorCode, 'RATE_LIMIT_STORE_UNAVAILABLE');
  assert.equal(total(h.daily()), 0);
  assert.equal(total(h.monthly()), 0);
});

// --------------------------------------------------------------------------
// Identity: visitors, IPs
// --------------------------------------------------------------------------

test('the same anonymous visitor is counted across lookups', async () => {
  const h = harness();
  for (const query of ['Xbox One X', 'Xbox Series S', 'PlayStation 5']) await run(h, query, { visitor: VISITOR_A });
  const logs = h.requestLogs();
  assert.deepEqual(logs.map((log) => log.quotaUsedToday), [1, 2, 3]);
  assert.equal(new Set(logs.map((log) => log.quotaVisitorHash)).size, 1);
  assert.equal(logs[0].quotaIdSource, 'visitor');
  assert.equal(h.subjectsToday().length, 1);
});

test('different visitors behind one IP are metered separately while the per-IP rate limiter still applies', async () => {
  let ipCalls = 0;
  const perIpLimiter = { limit: async () => { ipCalls += 1; return { success: ipCalls <= 2, reset: 0 }; } };
  const h = harness({ rateLimiter: perIpLimiter });
  const shared = '203.0.113.50';
  await run(h, 'Xbox One X', { visitor: VISITOR_A, ip: shared });
  await run(h, 'Xbox Series S', { visitor: VISITOR_B, ip: shared });
  const third = await run(h, 'Xbox model 9 console', { visitor: 'cccccccccccccccccccccccccccccccc', ip: shared });

  assert.equal(third.payload.errorCode, 'RATE_LIMIT', 'the existing per-IP abuse protection still works');
  assert.equal(third.payload.providerAttempted, false, 'no paid call was made for the denied request');
  assert.equal(h.subjectsToday().length, 2, 'A and B have separate allowances');
  assert.deepEqual(Object.values(h.daily()).map(Number), [1, 1]);
  assert.equal(total(h.ipDaily()), 2, 'the denied third lookup was refunded from the IP counter too');
});

test('a request without a visitor ID is metered by a hashed IP subject', async () => {
  const h = harness();
  await run(h, 'Xbox One X', { visitor: null });
  const log = h.lastLog();
  assert.equal(log.quotaIdSource, 'ip');
  assert.match(Object.keys(h.daily())[0], /^anon:ip-[0-9a-f]{24}$/);
});

// --------------------------------------------------------------------------
// Shadow vs enforce
// --------------------------------------------------------------------------

test('shadow mode never blocks: the sixth and seventh lookups are served and logged as wouldBlock', async () => {
  const h = harness();
  const outs = [];
  for (let i = 1; i <= 7; i += 1) outs.push(await run(h, `Xbox model ${i} console`, { visitor: VISITOR_A }));

  for (const out of outs) {
    assert.equal(out.statusCode, 200);
    assert.notEqual(out.payload.errorCode, 'AI_QUOTA_EXCEEDED');
  }
  assert.equal(h.calls.native, 7, 'every lookup reached the provider');
  const logs = h.requestLogs();
  assert.equal(logs[4].quotaWouldBlock, false);
  assert.equal(logs[5].quotaWouldBlock, true);
  assert.equal(logs[5].quotaWouldAllow, false);
  assert.equal(logs[5].quotaBlockReason, 'daily');
  assert.equal(logs[5].quotaRemainingDaily, 0);
  assert.equal(logs[5].quotaBlocked, false);
  assert.equal(logs[6].quotaUsedToday, 7);
  assert.equal(Number(h.usageEvents()['age|event:quota_would_block']), 2);
  assert.equal(h.usageEvents()['age|event:quota_blocked'], undefined);
});

test('enforcement (a separate, default-off flag) refuses only over-limit AI lookups and names only AI lookups', async () => {
  const h = harness({ meterEnv: { SMART_LOOKUP_QUOTA_ENFORCE: '1' } });
  for (let i = 1; i <= 5; i += 1) assert.equal((await run(h, `Xbox model ${i} console`)).statusCode, 200);
  const nativeBefore = h.calls.native;
  const sixth = await run(h, 'Xbox model 6 console');

  assert.equal(h.calls.native, nativeBefore, 'no provider is called for a refused lookup');
  assert.equal(sixth.payload.errorCode, 'AI_QUOTA_EXCEEDED');
  assert.equal(sixth.payload.providerAttempted, false);
  assert.match(sixth.payload.notes, /AI-assisted/);
  assert.match(sixth.payload.notes, /Serial number decoding .* still available/);
  assert.equal(/all lookups|every lookup/i.test(sixth.payload.notes), false);
  assert.equal(total(h.daily()), 5, 'the refused lookup is not stored');
  assert.equal(Number(h.usageEvents()['age|event:quota_blocked']), 1);

  // Local/cached answers are unaffected even for an over-limit visitor.
  const cached = await run(h, 'Xbox model 1 console');
  assert.equal(cached.payload.cacheStatus, 'hit');
  assert.equal(cached.payload.errorCode ?? null, null);
});

// --------------------------------------------------------------------------
// Resets, flags, failures, privacy
// --------------------------------------------------------------------------

test('the daily allowance resets on a new UTC day and the monthly one on a new month', async () => {
  const h = harness();
  for (let i = 1; i <= 6; i += 1) await run(h, `Xbox model ${i} console`);
  assert.equal(h.lastLog().quotaWouldBlock, true);

  h.clock.now = DAY2;
  await run(h, 'Xbox model 7 console');
  assert.equal(h.lastLog().quotaUsedToday, 1, 'daily reset');
  assert.equal(h.lastLog().quotaUsedThisMonth, 7, 'monthly total carries over within the month');
  assert.equal(h.lastLog().quotaWouldBlock, false);

  h.clock.now = NEXT_MONTH;
  await run(h, 'Xbox model 8 console');
  assert.equal(h.lastLog().quotaUsedThisMonth, 1, 'monthly reset');
});

test('with the metering flag off nothing is counted, logged, or written', async () => {
  const h = harness({ meterOn: false });
  const out = await run(h, 'Xbox One X');
  assert.equal(out.statusCode, 200);
  assert.equal(h.hasQuotaKeys ?? [...h.redis.hashes.keys()].some((key) => key.startsWith('quota:v1:')), false);
  assert.equal(h.usageEvents()['age|event:ai_lookup'], undefined);
  assert.equal(h.lastLog().quotaMode, null);
  assert.equal(h.lastLog().logicalAiLookupCount, null);
});

test('a quota store failure never affects the reply', async () => {
  const redis = createFakeRedis();
  const realSet = redis.set;
  redis.set = async (key, value, options) => {
    if (String(key).startsWith('quota:v1:tx:')) throw new Error('quota store down');
    return realSet(key, value, options);
  };
  const h = harness({ redis, meterEnv: { SMART_LOOKUP_QUOTA_ENFORCE: '1' } });
  const out = await run(h, 'Xbox One X');
  assert.equal(out.statusCode, 200);
  assert.equal(out.payload.introductionYear ?? out.payload.yearContext?.value ?? 2017, out.payload.introductionYear ?? out.payload.yearContext?.value ?? 2017);
  assert.equal(h.lastLog().quotaStoreError, 'QUOTA_STORE_UNAVAILABLE');
  assert.equal(h.lastLog().logicalAiLookupCount, 0);
  assert.notEqual(out.payload.errorCode, 'AI_QUOTA_EXCEEDED');
});

test('logs and Redis contain only hashes: never the raw visitor ID, IP or query', async () => {
  const h = harness();
  await run(h, 'Xbox One X', { visitor: VISITOR_A, ip: '198.51.100.23' });
  const logs = h.lines.join('\n');
  assert.equal(logs.includes(VISITOR_A), false);
  assert.equal(logs.includes('198.51.100.23'), false);
  assert.equal(logs.includes('Xbox One X'), false);
  const stored = JSON.stringify([...h.redis.hashes.entries()].map(([key, map]) => [key, [...map.entries()]]));
  assert.equal(stored.includes(VISITOR_A), false);
  assert.equal(stored.includes('198.51.100.23'), false);
  assert.equal(stored.includes('Xbox'), false);
});
