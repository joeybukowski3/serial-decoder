import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import defaultHandler, { createItemAssistResearchHandler } from '../../lib/itemassist-research/handler.js';
import { getQuickAnswer } from '../../lib/replacement-quick/quick-answer.js';
import { CATEGORY_GUIDANCE, ANSWER_STATUS, buildFallbackAnswer } from '../../lib/replacement-quick/quick-sanitize.js';
import { MAX_QUERY_CHARS } from '../../lib/replacement-quick/quick-prompt.js';
import { createResearchBudget, researchBudgetKey } from '../../lib/itemassist-research/budget.js';
import { CACHE_TTL_SECONDS, researchCacheKey } from '../../lib/itemassist-research/cache.js';
import { buildResearchResponse, findResearchClaim, isValidResearchResponse } from '../../lib/itemassist-research/contract.js';
import { MAX_BODY_BYTES } from '../../lib/itemassist-research/request.js';
import { researchUsageKey } from '../../lib/itemassist-research/usage.js';

// OFFLINE ONLY: the provider is a mock fetch handed to the real Fast Answer engine; the store is an in-memory fake.
const TOKEN = 'test-token-0123456789-abcdefghijkl';
const FAKE_KEY = 'test-key-0123456789abcdef';
const ENV = Object.freeze({ ITEMASSIST_RESEARCH_ENABLED: 'true', ITEMASSIST_REPLACEMENT_API_TOKEN: TOKEN, GEMINI_API_KEY: FAKE_KEY, ITEMASSIST_RESEARCH_DAILY_CALL_LIMIT: '50' });
const QUERY = 'LG C3 OLED TV';
const NOW = Date.UTC(2026, 9, 20, 12, 0, 0);

const goodReply = Object.freeze({
  category: 'tv',
  original: { identity: 'LG C3 series 4K OLED smart TV', confidence: 'high', characteristics: ['OLED panel', '4K resolution', '120 Hz'], uncertainty: 'Screen size was not given' },
  requirements: ['Same screen size class', 'OLED or better panel', '4K resolution', 'At least 4 HDMI 2.1 ports', 'Similar smart TV platform'],
  successor: { name: 'LG C-series OLED, next generation', why: 'Direct successor line with the same panel type.', differences: 'Newer processor.', concern: null, confidence: 'high' },
  suggestions: [
    { name: 'Samsung S90 series QD-OLED', why: 'Comparable premium OLED-class picture.', differences: 'Different smart platform.', confidence: 'medium' },
    { name: 'Sony Bravia 8 OLED', why: 'Similar tier with strong processing.', differences: 'Fewer gaming features on some sizes.', confidence: 'medium' },
  ],
  clarify: ['Which screen size do you have?'],
});

const geminiBody = (reply) => ({
  candidates: [{ content: { parts: [{ text: typeof reply === 'string' ? reply : JSON.stringify(reply) }] }, finishReason: 'STOP' }],
  usageMetadata: { promptTokenCount: 340, candidatesTokenCount: 420, thoughtsTokenCount: 10 },
});
const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function mockFetch(respond) {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url: String(url), init }); return respond(calls.length, init); };
  fetchImpl.calls = calls;
  return fetchImpl;
}
const okFetch = (reply = goodReply) => mockFetch(() => jsonResponse(geminiBody(reply)));

/** In-memory stand-in for Upstash, with the two Lua scripts the budget uses and the pipeline the usage writer uses. */
function createRedis({ failGet = false, failEval = false, failSet = false } = {}) {
  const store = new Map();
  const hashes = new Map();
  const calls = [];
  const ttls = new Map();
  return {
    store, hashes, calls, ttls,
    async get(key) { calls.push(['get', key]); if (failGet) throw new Error('store down'); return store.has(key) ? store.get(key) : null; },
    async set(key, value, options = {}) { calls.push(['set', key]); if (failSet) throw new Error('store down'); store.set(key, value); ttls.set(key, options.ex); return 'OK'; },
    async eval(script, keys, args) {
      calls.push(['eval', ...keys]);
      if (failEval) throw new Error('store down');
      const current = Number(store.get(keys[0]) || 0);
      if (script.includes('DECR')) { if (current <= 0) return 0; store.set(keys[0], current - 1); return current - 1; }
      if (current >= Number(args[0])) return [0, current];
      store.set(keys[0], current + 1); ttls.set(keys[0], Number(args[1]));
      return [1, current + 1];
    },
    pipeline() {
      const ops = [];
      const api = {
        hincrby(key, field, amount) { ops.push([key, field, amount]); return api; },
        expire() { return api; },
        async exec() { calls.push(['pipeline']); for (const [key, field, amount] of ops) { const hash = hashes.get(key) || {}; hash[field] = (hash[field] || 0) + amount; hashes.set(key, hash); } return []; },
      };
      return api;
    },
  };
}

function createLogger() {
  const lines = [];
  return { lines, info: (line) => lines.push(String(line)), warn: (line) => lines.push(String(line)), error: (line) => lines.push(String(line)) };
}
function createRes() {
  return { statusCode: 200, body: null, headers: {}, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, setHeader(name, value) { this.headers[name] = value; } };
}
const bearer = (token = TOKEN) => ({ authorization: `Bearer ${token}` });
const createReq = (options = {}) => ({ method: options.method ?? 'POST', headers: options.headers ?? bearer(), body: 'body' in options ? options.body : { query: QUERY } });

/** Real Fast Answer engine, mock provider. `timeoutMs` stays at the engine default unless a test shortens it. */
function build({ env = ENV, redis = createRedis(), fetchImpl = okFetch(), logger = createLogger(), timeoutMs, ...rest } = {}) {
  const handler = createItemAssistResearchHandler({
    env, logger, now: () => NOW, redisFactory: async () => redis, requestIdFactory: () => 'req-1',
    getAnswer: (query, options) => getQuickAnswer(query, { ...options, apiKey: FAKE_KEY, fetchImpl, ...(timeoutMs ? { timeoutMs } : {}) }),
    ...rest,
  });
  return { handler, redis, fetchImpl, logger };
}
async function call(handler, request = createReq()) {
  const res = createRes();
  await handler(request, res);
  return res;
}
const budgetUsed = (redis) => Number(redis.store.get(researchBudgetKey(NOW)) || 0);
const keysTouched = (redis) => redis.calls.flatMap(([, ...keys]) => keys).filter((part) => typeof part === 'string');
const NEVER_ANSWER = async () => assert.fail('the provider must not be called');

// ---- feature flag and authentication ---------------------------------------------------------------------------------

test('the route is OFF by default: the shipped handler refuses with 503 and touches nothing', async () => {
  const res = await call(createItemAssistResearchHandler({ env: {}, getAnswer: NEVER_ANSWER, redisFactory: async () => assert.fail('no store') }));
  assert.equal(res.statusCode, 503);
  assert.deepEqual([res.body.status, res.body.errorCode, res.body.kind], ['ERROR', 'API_DISABLED', 'ITEMASSIST_RESEARCH']);
  assert.equal(typeof defaultHandler, 'function');
});

test('a disabled flag (unset, false, "1", "TRUE") answers 503 before authentication, store or provider work', async () => {
  for (const flag of [undefined, 'false', '1', 'TRUE', '']) {
    const { handler, redis, fetchImpl } = build({ env: { ...ENV, ITEMASSIST_RESEARCH_ENABLED: flag } });
    const res = await call(handler);
    assert.equal(res.statusCode, 503, String(flag));
    assert.equal(res.body.errorCode, 'API_DISABLED');
    assert.deepEqual(redis.calls, []);
    assert.equal(fetchImpl.calls.length, 0);
  }
});

test('the v1 flag does not enable research, and the research flag does not enable v1', async () => {
  const { handler } = build({ env: { ...ENV, ITEMASSIST_RESEARCH_ENABLED: undefined, ITEMASSIST_REPLACEMENT_API_ENABLED: 'true' } });
  assert.equal((await call(handler)).body.errorCode, 'API_DISABLED');
  const v1 = readFileSync('api/itemassist-replacement.js', 'utf8');
  assert.equal(v1.includes('ITEMASSIST_RESEARCH'), false);
});

test('missing, wrong, malformed and wrong-scheme tokens are rejected with 401 and no store, budget or provider activity', async () => {
  for (const headers of [{}, bearer('wrong-token-0123456789-abcdefghijkl'), bearer(`${TOKEN}x`), bearer(TOKEN.slice(0, -1)), { authorization: TOKEN },
    { authorization: `Basic ${TOKEN}` }, { authorization: 'Bearer' }]) {
    const { handler, redis, fetchImpl, logger } = build();
    const res = await call(handler, createReq({ headers }));
    assert.equal(res.statusCode, 401, JSON.stringify(headers));
    assert.equal(res.body.errorCode, 'UNAUTHORIZED');
    assert.deepEqual(redis.calls, [], 'not even a cache or budget read');
    assert.equal(fetchImpl.calls.length, 0);
    assert.equal(JSON.stringify(res.body).includes(TOKEN), false);
    assert.equal(logger.lines.join('\n').includes(TOKEN), false);
  }
});

test('a missing or too-short configured token never authorizes anyone', async () => {
  for (const configured of [undefined, '', 'short', 'x'.repeat(23)]) {
    const { handler, fetchImpl } = build({ env: { ...ENV, ITEMASSIST_REPLACEMENT_API_TOKEN: configured } });
    for (const headers of [bearer(configured || 'anything-at-all-0123456789'), { authorization: 'Bearer ' }]) assert.equal((await call(handler, createReq({ headers }))).statusCode, 401);
    assert.equal(fetchImpl.calls.length, 0);
  }
});

test('only POST is accepted', async () => {
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const { handler, fetchImpl } = build();
    const res = await call(handler, createReq({ method }));
    assert.equal(res.statusCode, 405);
    assert.equal(res.headers.Allow, 'POST');
    assert.equal(fetchImpl.calls.length, 0);
  }
});

// ---- request validation -----------------------------------------------------------------------------------------------

test('invalid bodies are rejected with 400 before any store, budget or provider activity', async () => {
  const bodies = [undefined, null, '', 'not json', '[]', [], 42, {}, { query: '' }, { query: '   ' }, { query: 42 }, { query: ['LG C3'] }, { query: null },
    { query: 'x'.repeat(MAX_QUERY_CHARS + 1) }, { Query: QUERY }, { query: QUERY, notes: 'extra' }];
  for (const body of bodies) {
    const { handler, redis, fetchImpl } = build();
    const res = await call(handler, createReq({ body }));
    assert.equal(res.statusCode, 400, JSON.stringify(body)?.slice(0, 60));
    assert.deepEqual([res.body.status, res.body.errorCode], ['ERROR', 'INVALID_REQUEST']);
    assert.deepEqual(redis.calls, []);
    assert.equal(fetchImpl.calls.length, 0);
  }
});

test('a query at exactly the Fast Answer limit is accepted; one character more is not', async () => {
  const exact = 'a'.repeat(MAX_QUERY_CHARS);
  const { handler } = build();
  assert.equal((await call(handler, createReq({ body: { query: exact } }))).statusCode, 200);
  assert.equal((await call(handler, createReq({ body: { query: `${exact}a` } }))).statusCode, 400);
});

test('request-body size is capped: oversized declared length or payload gets 413 with no work done', async () => {
  const { handler, redis, fetchImpl } = build();
  const declared = await call(handler, createReq({ headers: { ...bearer(), 'content-length': String(MAX_BODY_BYTES + 1) } }));
  const payload = await call(handler, createReq({ body: JSON.stringify({ query: 'a'.repeat(MAX_BODY_BYTES) }) }));
  const object = await call(handler, createReq({ body: { query: QUERY, pad: 'p'.repeat(MAX_BODY_BYTES) } }));
  for (const res of [declared, payload, object]) assert.deepEqual([res.statusCode, res.body.errorCode], [413, 'INVALID_REQUEST']);
  assert.deepEqual(redis.calls, []);
  assert.equal(fetchImpl.calls.length, 0);
});

test('no request parameter can select a fixture, model, timeout or budget bypass: unknown keys are refused', async () => {
  for (const extra of [{ fixture: 'ok' }, { model: 'gemini-pro' }, { timeoutMs: 60000 }, { skipBudget: true }, { bypassBudget: true }, { cache: false }, { mode: 'verify' }, { retry: true }]) {
    const { handler, redis, fetchImpl } = build();
    const res = await call(handler, createReq({ body: { query: QUERY, ...extra } }));
    assert.equal(res.statusCode, 400, JSON.stringify(extra));
    assert.deepEqual(redis.calls, []);
    assert.equal(fetchImpl.calls.length, 0);
  }
  const { handler, fetchImpl } = build({ fetchImpl: okFetch() });
  await call(handler);
  const sent = JSON.parse(fetchImpl.calls[0].init.body);
  assert.equal(fetchImpl.calls[0].url.includes('gemini-3.5-flash-lite'), true);
  assert.equal('tools' in sent, false);
});

test('control characters and extra whitespace are normalised in the query that reaches the provider', async () => {
  const { handler, fetchImpl } = build();
  assert.equal((await call(handler, createReq({ body: { query: '  LG\u0000  C3\n\tOLED  ' } }))).statusCode, 200);
  assert.equal(JSON.parse(fetchImpl.calls[0].init.body).contents[0].parts[0].text.includes('"LG C3 OLED"'), true);
});

// ---- cache ------------------------------------------------------------------------------------------------------------

test('a cache miss makes exactly ONE provider call, reserves ONE unit of budget and returns a valid versioned response', async () => {
  const { handler, redis, fetchImpl } = build();
  const res = await call(handler);
  assert.equal(res.statusCode, 200);
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(budgetUsed(redis), 1);
  assert.equal(isValidResearchResponse(res.body), true);
  assert.deepEqual([res.body.contractVersion, res.body.kind, res.body.status, res.body.meta.cached, res.body.meta.answerSource], ['research.1', 'ITEMASSIST_RESEARCH', 'OK', false, 'AI_ESTIMATE']);
  assert.equal(res.body.original.identity, 'LG C3 series 4K OLED smart TV');
  assert.equal(res.body.successor.name, 'LG C-series OLED, next generation');
  assert.equal(res.body.suggestions.length, 2);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(res.headers['X-Request-Id'], 'req-1');
  assert.equal(redis.ttls.get(researchCacheKey(QUERY)), CACHE_TTL_SECONDS.OK);
});

test('a cache hit makes NO provider call and consumes NO budget, and is served even when the budget is exhausted', async () => {
  const redis = createRedis();
  const first = build({ redis });
  await call(first.handler);
  assert.equal(first.fetchImpl.calls.length, 1);
  redis.store.set(researchBudgetKey(NOW), '999999');
  const second = build({ redis, fetchImpl: mockFetch(() => assert.fail('no provider call on a hit')) });
  const evalsBefore = redis.calls.filter(([op]) => op === 'eval').length;
  const res = await call(second.handler, createReq({ body: { query: '  lg c3   oled tv ' } }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.meta.cached, true);
  assert.equal(second.fetchImpl.calls.length, 0);
  assert.equal(redis.calls.filter(([op]) => op === 'eval').length, evalsBefore, 'no budget reservation on a hit');
  assert.equal(budgetUsed(redis), 999999);
});

test('a corrupted, tampered or unsafe cache entry is a miss, never served', async () => {
  const key = researchCacheKey(QUERY);
  const good = (await call(build().handler)).body;
  const unsafe = { ...good, suggestions: [{ ...good.suggestions[0], why: 'Buy it at https://example.com for $499' }] };
  for (const raw of ['{not json', JSON.stringify({ key: 'other', contractVersion: 'research.1', response: good }), JSON.stringify({ key, contractVersion: 'research.0', response: good }),
    JSON.stringify({ key, contractVersion: 'research.1', response: unsafe }), JSON.stringify({ key, contractVersion: 'research.1', response: { ...good, extra: 1 } })]) {
    const redis = createRedis();
    redis.store.set(key, raw);
    const { handler, fetchImpl } = build({ redis });
    const res = await call(handler);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.meta.cached, false);
    assert.equal(fetchImpl.calls.length, 1);
  }
});

test('provider failures and guidance answers are never cached; an unidentified product is cached briefly', async () => {
  const redis = createRedis();
  const { handler } = build({ redis, fetchImpl: mockFetch(() => jsonResponse({}, 500)) });
  await call(handler);
  assert.equal(redis.store.has(researchCacheKey(QUERY)), false);
  const unknown = createRedis();
  const guidance = build({ redis: unknown, fetchImpl: okFetch({ category: 'unknown', original: { identity: null, confidence: 'low' }, requirements: [] }) });
  const res = await call(guidance.handler);
  assert.equal(res.body.status, 'GUIDANCE_ONLY');
  assert.equal(unknown.ttls.get(researchCacheKey(QUERY)), CACHE_TTL_SECONDS.GUIDANCE_ONLY);
});

test('cache write failures do not affect the reply', async () => {
  const { handler } = build({ redis: createRedis({ failSet: true }) });
  assert.equal((await call(handler)).statusCode, 200);
});

// ---- provider failure and timeout ---------------------------------------------------------------------------------------

test('a provider failure is NOT retried: one request, guidance answer, labelled as category guidance, never presented as researched', async () => {
  for (const status of [429, 500, 503, 400]) {
    const { handler, fetchImpl, redis } = build({ fetchImpl: mockFetch(() => jsonResponse({ error: 'secret provider body' }, status)) });
    const res = await call(handler, createReq({ body: { query: 'Samsung 55 inch QLED TV' } }));
    assert.equal(fetchImpl.calls.length, 1, `status ${status}`);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'UNAVAILABLE');
    assert.equal(res.body.meta.answerSource, 'CATEGORY_GUIDANCE');
    assert.ok(res.body.warnings.includes('PROVIDER_UNAVAILABLE'));
    assert.equal(res.body.original.identity, null);
    assert.equal(res.body.successor, null);
    assert.deepEqual(res.body.suggestions, []);
    assert.deepEqual(res.body.requirements, CATEGORY_GUIDANCE.tv.slice(0, 4));
    assert.equal(JSON.stringify(res.body).includes('secret provider body'), false);
    assert.equal(budgetUsed(redis), 1, 'the attempted call keeps its reservation');
  }
});

test('a provider timeout makes one request, returns guidance and honours the engine timeout', async () => {
  const hang = mockFetch((_n, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))));
  const { handler } = build({ fetchImpl: hang, timeoutMs: 40 });
  const started = Date.now();
  const res = await call(handler);
  assert.ok(Date.now() - started < 1500);
  assert.equal(hang.calls.length, 1);
  assert.deepEqual([res.statusCode, res.body.status, res.body.meta.answerSource], [200, 'UNAVAILABLE', 'CATEGORY_GUIDANCE']);
});

test('malformed provider output yields guidance, not an error or a fabricated answer', async () => {
  for (const reply of ['not json at all', '[]', '"just a string"', '']) {
    const { handler, fetchImpl } = build({ fetchImpl: mockFetch(() => jsonResponse(geminiBody(reply))) });
    const res = await call(handler);
    assert.equal(fetchImpl.calls.length, 1);
    assert.equal(res.statusCode, 200);
    assert.notEqual(res.body.meta.answerSource === 'AI_ESTIMATE' && res.body.status === 'OK', true);
    assert.deepEqual(res.body.suggestions, []);
  }
});

test('an engine that throws is contained: guidance answer and no unhandled error', async () => {
  const { handler } = build({ getAnswer: async () => { throw new Error('boom with secret'); } });
  const res = await call(handler);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'UNAVAILABLE');
  assert.equal(JSON.stringify(res.body).includes('boom'), false);
});

test('provider not configured: 503 PROVIDER_UNAVAILABLE before any budget reservation', async () => {
  const { handler, redis, fetchImpl } = build({ env: { ...ENV, GEMINI_API_KEY: '  ' }, providerReady: undefined });
  const res = await call(handler);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.errorCode, 'PROVIDER_UNAVAILABLE');
  assert.equal(fetchImpl.calls.length, 0);
  assert.equal(redis.calls.some(([op]) => op === 'eval'), false);
});

test('a reservation is released when the provider request was provably never sent', async () => {
  const { handler, redis } = build({ getAnswer: async (query) => ({ answer: buildFallbackAnswer({ status: ANSWER_STATUS.UNAVAILABLE, query }), meta: { requestSent: false, errorCode: 'PROVIDER_NOT_CONFIGURED', usage: {} } }) });
  const res = await call(handler);
  assert.equal(res.body.status, 'UNAVAILABLE');
  assert.equal(budgetUsed(redis), 0);
});

// ---- budget -----------------------------------------------------------------------------------------------------------

test('budget exhausted: 429 BUDGET_EXHAUSTED, no provider call, and the counter does not move', async () => {
  const redis = createRedis();
  redis.store.set(researchBudgetKey(NOW), '3');
  const { handler, fetchImpl } = build({ redis, env: { ...ENV, ITEMASSIST_RESEARCH_DAILY_CALL_LIMIT: '3' } });
  const res = await call(handler);
  assert.deepEqual([res.statusCode, res.body.errorCode], [429, 'BUDGET_EXHAUSTED']);
  assert.equal(fetchImpl.calls.length, 0);
  assert.equal(budgetUsed(redis), 3);
});

test('the daily limit is atomic: concurrent distinct requests never exceed it', async () => {
  const redis = createRedis();
  const { handler, fetchImpl } = build({ redis, env: { ...ENV, ITEMASSIST_RESEARCH_DAILY_CALL_LIMIT: '3' } });
  const results = await Promise.all(Array.from({ length: 8 }, (_, index) => call(handler, createReq({ body: { query: `LG OLED model ${index}` } }))));
  assert.equal(fetchImpl.calls.length, 3);
  assert.equal(results.filter((res) => res.statusCode === 429).length, 5);
  assert.equal(budgetUsed(redis), 3);
});

test('budget storage unavailable fails CLOSED: 503 and no provider call (store error, no store, store timeout)', async () => {
  for (const redis of [createRedis({ failEval: true }), null]) {
    const { handler, fetchImpl } = build({ redis, redisFactory: async () => redis });
    const res = await call(handler);
    assert.deepEqual([res.statusCode, res.body.errorCode], [503, 'BUDGET_UNAVAILABLE']);
    assert.equal(fetchImpl.calls.length, 0);
  }
  const failing = build({ redisFactory: async () => { throw new Error('cannot connect'); } });
  assert.equal((await call(failing.handler)).body.errorCode, 'BUDGET_UNAVAILABLE');
  assert.equal(failing.fetchImpl.calls.length, 0);
  const slow = createRedis();
  slow.eval = () => new Promise(() => {});
  const stuck = build({ redis: slow });
  assert.equal((await call(stuck.handler)).body.errorCode, 'BUDGET_UNAVAILABLE');
  assert.equal(stuck.fetchImpl.calls.length, 0);
});

test('a cache read failure is only a miss; the budget still protects the provider', async () => {
  const { handler, fetchImpl } = build({ redis: createRedis({ failGet: true }) });
  assert.equal((await call(handler)).statusCode, 200);
  assert.equal(fetchImpl.calls.length, 1);
});

// ---- response allowlist and claim safety -------------------------------------------------------------------------------

const deepKeys = (value, keys = new Set()) => {
  if (Array.isArray(value)) value.forEach((item) => deepKeys(item, keys));
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) { keys.add(key); deepKeys(item, keys); }
  return keys;
};
const ALLOWED_KEYS = new Set(['contractVersion', 'kind', 'status', 'category', 'original', 'identity', 'confidence', 'characteristics', 'uncertainty', 'requirements', 'requirementsSource',
  'successor', 'name', 'why', 'differences', 'concern', 'standing', 'verified', 'suggestions', 'clarify', 'disclosure', 'warnings', 'meta', 'requestId', 'elapsedMs', 'cached', 'answerSource']);

test('the response contains only allowlisted fields, whatever the provider returns', async () => {
  const noisy = { ...goodReply, apiKey: 'AIza-secret', price: '$499', url: 'https://x.example', sources: ['https://x.example'], internalNotes: 'leak', rawText: 'leak',
    original: { ...goodReply.original, debug: 'leak', price: 1 },
    successor: { ...goodReply.successor, sku: 'ABC123', url: 'https://x.example', inStock: true },
    suggestions: goodReply.suggestions.map((item) => ({ ...item, price: '$1', retailer: 'Best Buy', unverified: false, verified: true, classification: 'LKQ' })) };
  const { handler } = build({ fetchImpl: okFetch(noisy) });
  const res = await call(handler);
  assert.equal(res.statusCode, 200);
  for (const key of deepKeys(res.body)) assert.equal(ALLOWED_KEYS.has(key), true, `unexpected key ${key}`);
  assert.deepEqual(Object.keys(res.body).sort(), ['category', 'clarify', 'contractVersion', 'disclosure', 'kind', 'meta', 'original', 'requirements', 'requirementsSource', 'status', 'successor', 'suggestions', 'warnings']);
  const serialised = JSON.stringify(res.body);
  for (const leak of ['AIza', 'x.example', 'leak', 'Best Buy', '499', 'ABC123']) assert.equal(serialised.includes(leak), false, leak);
  assert.equal([res.body.successor, ...res.body.suggestions].every((item) => item.verified === false), true);
});

test('provider-written price, availability, retailer, link and LKQ claims never reach the caller', async () => {
  const claims = {
    ...goodReply,
    original: { ...goodReply.original, characteristics: ['OLED panel', 'Only $899 right now', 'Verified LKQ equivalent'], uncertainty: 'In stock at Best Buy today' },
    requirements: [...goodReply.requirements, 'Certified like kind and quality match', 'See https://www.lg.com/us/tvs', 'Currently in production'],
    successor: { ...goodReply.successor, name: 'LG C5 OLED', why: 'Confirmed equivalent replacement for your TV', differences: 'Priced at $1,299', concern: null },
    suggestions: [
      { name: 'Sony A95L', why: 'A verified LKQ match', differences: 'Brighter', confidence: 'high' },
      { name: 'Samsung S95D', why: 'Premium QD-OLED picture', differences: 'Sold at Walmart', confidence: 'high' },
      { name: 'Panasonic Z95A', why: 'Strong OLED panel with a good processor', differences: 'Fewer apps', confidence: 'medium' },
    ],
  };
  const { handler } = build({ fetchImpl: okFetch(claims) });
  const res = await call(handler);
  assert.equal(res.statusCode, 200);
  const serialised = JSON.stringify(res.body);
  for (const forbidden of [/\$\s?\d/, /https?:/i, /best\s?buy/i, /walmart/i, /in\s+stock/i, /in\s+production/i, /\blkq\b/i, /like[-\s]kind/i, /\bverified\s+(?:lkq|match|equivalent)/i, /confirmed equivalent/i, /\bpriced?\b/i]) {
    assert.equal(forbidden.test(serialised), false, String(forbidden));
  }
  assert.equal(res.body.suggestions.some((item) => item.name === 'Panasonic Z95A'), true, 'safe suggestions survive');
  assert.ok(res.body.warnings.includes('UNSAFE_CLAIMS_REMOVED'));
  assert.equal(isValidResearchResponse(res.body), true);
});

test('the disclosure is always present, says the research is unverified, and no field presents a suggestion as verified', async () => {
  const res = await call(build().handler);
  assert.match(res.body.disclosure, /AI estimate/);
  assert.match(res.body.disclosure, /not been verified/);
  assert.equal(/certified|guaranteed|like[-\s]kind/i.test(JSON.stringify(res.body)), false);
});

test('a response whose only candidates are withheld is PARTIAL, not OK', () => {
  const answer = { status: 'OK', category: 'tv', original: { identity: 'LG C3 OLED TV', confidence: 'high', characteristics: [], uncertainty: null }, requirements: ['Same size'], requirementsSource: 'AI_ESTIMATE',
    successor: null, suggestions: [{ name: 'Sony', why: 'A certified like kind and quality match', differences: null, confidence: 'high' }], clarify: [], warnings: [] };
  const response = buildResearchResponse(answer, { requestId: 'r', elapsedMs: 5, answerSource: 'AI_ESTIMATE' });
  assert.equal(response.status, 'PARTIAL');
  assert.deepEqual(response.suggestions, []);
  assert.ok(response.warnings.includes('UNSAFE_CLAIMS_REMOVED'));
});

test('category guidance for every category is a valid, claim-free response', () => {
  for (const category of Object.keys(CATEGORY_GUIDANCE)) {
    const query = { tv: 'old tv', refrigerator: 'old fridge', appliance: 'old washer' }[category] || 'something';
    const response = buildResearchResponse(buildFallbackAnswer({ status: ANSWER_STATUS.UNAVAILABLE, query }), { requestId: 'r', elapsedMs: 1, answerSource: 'CATEGORY_GUIDANCE' });
    assert.equal(isValidResearchResponse(response), true, category);
    assert.equal(response.requirements.length >= 4, true, category);
  }
});

// ---- isolation from existing routes, budgets and counters ----------------------------------------------------------------

test('research touches only its own Redis namespaces: no Smart Lookup, v1 replacement or shared provider-usage keys', async () => {
  const redis = createRedis();
  const { handler } = build({ redis });
  await call(handler);
  await call(handler);
  await call(handler, createReq({ body: { query: 'Samsung QN55Q80C' } }));
  const touched = [...keysTouched(redis), ...redis.store.keys(), ...redis.hashes.keys()];
  assert.ok(touched.length > 0);
  for (const key of touched) assert.match(key, /^itemassist-research(?:-budget)?:/, key);
  for (const other of ['smart-budget', 'replacement-finder', 'provider-usage', 'quota:', 'smart-lookup']) assert.equal(touched.some((key) => key.includes(other)), false, other);
  assert.equal(researchBudgetKey(NOW).startsWith('itemassist-research-budget:v1:calls:'), true);
});

test('a v1 or Smart Lookup budget at its limit does not block research, and research does not consume it', async () => {
  const redis = createRedis();
  const seeded = { 'replacement-finder-budget:v1:searches:2026-10-20': '100', 'smart-budget:age:logical:2026-10-20': '99999', 'provider-usage:v1:2026-10-20': 'x' };
  for (const [key, value] of Object.entries(seeded)) redis.store.set(key, value);
  const { handler } = build({ redis });
  assert.equal((await call(handler)).statusCode, 200);
  for (const [key, value] of Object.entries(seeded)) assert.equal(redis.store.get(key), value);
});

test('usage counters are categorical and numeric only, in the research-only hash', async () => {
  const redis = createRedis();
  const { handler } = build({ redis });
  await call(handler);
  await call(handler);
  await call(handler, createReq({ headers: {} }));
  const hash = redis.hashes.get(researchUsageKey(NOW));
  assert.ok(hash);
  assert.equal(hash.requests, 2);
  assert.equal(hash.cache_hit, 1);
  assert.equal(hash.provider_calls, 1);
  assert.equal(hash.in_tokens, 340);
  assert.equal(hash.out_tokens, 420);
  for (const [field, value] of Object.entries(hash)) {
    assert.match(field, /^[a-z_]+(?::[A-Za-z0-9._-]+)?$/, field);
    assert.equal(Number.isInteger(value), true);
  }
  assert.equal(JSON.stringify([...redis.hashes.entries()]).toLowerCase().includes('lg c3'), false);
});

test('logs and responses never contain the query, the token, the provider key or provider text', async () => {
  const logger = createLogger();
  const { handler } = build({ logger, fetchImpl: mockFetch(() => jsonResponse({ error: 'provider says secret-body' }, 500)) });
  const res = await call(handler, createReq({ body: { query: 'my private item description' } }));
  await call(handler, createReq({ headers: bearer('wrong-token-0123456789-abcdefghijkl') }));
  const everything = `${logger.lines.join('\n')}\n${JSON.stringify(res.body)}`;
  for (const secret of [TOKEN, FAKE_KEY, 'private item', 'secret-body', 'wrong-token']) assert.equal(everything.includes(secret), false, secret);
  assert.ok(logger.lines.every((line) => JSON.parse(line).event === 'itemassist_research'));
});

test('the research modules are isolated: no import of v1, Smart Lookup or brief code beyond pure helpers, and v1 never imports research', () => {
  const research = readdirSync('lib/itemassist-research', { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile())
    .map((entry) => `${entry.parentPath || entry.path}/${entry.name}`.replaceAll('\\', '/'));
  // The enrichment stage adds only pure transport helpers: the Gemini fetch/parse helpers, usage parsing and the bounded abort.
  const allowedImports = /replacement-quick\/|smart-lookup\/(?:budget|cache|gemini-search-provider|provider-attempts)\.js|replacement-public\/request\.js|serial-refinement\/bounded-abort\.js|itemassist-research\/|node:/;
  for (const file of research) {
    for (const [, spec] of readFileSync(file, 'utf8').matchAll(/from '([^']+)'/g)) {
      if (!spec.startsWith('.')) continue;
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
      if (resolved.startsWith('lib/itemassist-research/')) continue; // a sibling or a module inside the research folder
      assert.match(spec, allowedImports, `${file} imports ${spec}`);
    }
  }
  for (const file of ['api/itemassist-replacement.js', 'api/age-lookup.js', 'api/smart-query-interpret.js', 'lib/replacement-public/budget.js', 'lib/replacement-public/cache.js', 'lib/replacement-public/contract.js']) {
    assert.equal(readFileSync(file, 'utf8').includes('itemassist-research'), false, file);
  }
});

// ---- review additions: assurance claims, preserved uncertainty, fail-closed edge cases ------------------------------------

test('assurance claims are withheld in every spelling: VERIFIED_LKQ, confirmed equivalence, retail availability, guaranteed pricing', () => {
  const claims = ['VERIFIED_LKQ', 'verifiedLKQ match', 'Verified-LKQ replacement', 'Meets LKQ', 'like kind and quality', 'like-kind-and-quality equivalent', 'Confirmed equivalence with your TV',
    'Equivalence is verified', 'Certified equivalent', 'Guaranteed pricing', 'Price guaranteed', 'We guarantee a fit', 'Price match available',
    'Current retail availability', 'Retail availability confirmed', 'Currently available at retail', 'Available at retail', 'Currently in stock', 'An exact replacement',
    'Identical replacement', 'Verified specs', 'Confirmed compatibility', 'Approved substitute', 'Proven match'];
  for (const claim of claims) assert.notEqual(findResearchClaim(claim), null, claim);
});

test('honest uncertainty is NOT withheld: negated assurances and ordinary spec language pass', () => {
  const honest = ['Specifications not verified', 'Not a verified match for your exact model', 'Screen size not confirmed; specs may differ', 'Availability and pricing are not guaranteed',
    'No confirmed equivalent is known', 'Never verified against your model', 'Similar OLED panel with a different smart platform', 'Fewer HDMI 2.1 ports than the original',
    'Newer processor and a brighter panel', 'Mounting pattern may not match your wall mount', 'Model year is uncertain'];
  for (const line of honest) assert.equal(findResearchClaim(line), null, line);
});

test('provider-written assurance claims never reach the caller through the handler', async () => {
  const reply = {
    ...goodReply,
    successor: { ...goodReply.successor, why: 'VERIFIED_LKQ successor for your TV', differences: 'Newer processor.', concern: null },
    suggestions: [
      { name: 'Sony A95L', why: 'Confirmed equivalence with the original', differences: 'Brighter', confidence: 'high' },
      { name: 'Panasonic Z95A', why: 'Strong OLED panel, current retail availability', differences: 'Fewer apps', confidence: 'medium' },
      { name: 'Samsung S95D', why: 'Premium QD-OLED picture', differences: 'Guaranteed pricing, different platform', confidence: 'medium' },
    ],
  };
  const res = await call(build({ fetchImpl: okFetch(reply) }).handler);
  const serialised = JSON.stringify(res.body);
  for (const forbidden of [/lkq/i, /equivalence/i, /retail availability/i, /guarantee/i]) assert.equal(forbidden.test(serialised), false, String(forbidden));
  assert.equal(res.body.successor, null, 'a successor whose reason was withheld is not shown');
  assert.equal(res.body.suggestions.some((item) => item.name === 'Sony A95L' || item.name === 'Panasonic Z95A'), false);
  assert.ok(res.body.warnings.includes('UNSAFE_CLAIMS_REMOVED'));
  assert.equal(isValidResearchResponse(res.body), true);
});

test('differences, concerns, confidence and uncertainty reach the caller intact, and a concern keeps the successor CONDITIONAL', async () => {
  const reply = {
    ...goodReply,
    original: { identity: 'LG C3 OLED TV', confidence: 'medium', characteristics: ['OLED panel', '120 Hz'], uncertainty: 'Screen size and exact model year are not known' },
    successor: { name: 'LG C5 OLED', why: 'Next generation of the same line', differences: 'Brighter panel, newer processor', concern: 'Fewer HDMI 2.1 ports in some sizes', confidence: 'medium' },
    suggestions: [{ name: 'Sony Bravia 8 OLED', why: 'Similar tier', differences: 'Different smart platform', confidence: 'low' }],
  };
  const res = await call(build({ fetchImpl: okFetch(reply) }).handler);
  assert.equal(res.body.original.uncertainty, 'Screen size and exact model year are not known');
  assert.equal(res.body.original.confidence, 'MEDIUM');
  assert.equal(res.body.successor.differences, 'Brighter panel, newer processor');
  assert.equal(res.body.successor.concern, 'Fewer HDMI 2.1 ports in some sizes');
  assert.equal(res.body.successor.standing, 'CONDITIONAL');
  assert.ok(res.body.warnings.includes('SUCCESSOR_CONDITIONAL'));
  assert.equal(res.body.suggestions[0].differences, 'Different smart platform');
  assert.equal(res.body.suggestions[0].confidence, 'LOW');
});

test('a withheld concern never upgrades the successor, and a withheld difference is flagged, not invented', () => {
  const answer = {
    status: 'OK', category: 'tv', original: { identity: 'LG C3 OLED TV', confidence: 'high', characteristics: [], uncertainty: null }, requirements: ['Same size'], requirementsSource: 'AI_ESTIMATE',
    successor: { name: 'LG C5 OLED', why: 'Next generation', differences: 'A verified LKQ difference', concern: 'Certified like kind and quality shortfall', confidence: 'high', standing: 'RECOMMENDED' },
    suggestions: [], clarify: [], warnings: [],
  };
  const response = buildResearchResponse(answer, { requestId: 'r', elapsedMs: 1, answerSource: 'AI_ESTIMATE' });
  assert.equal(response.successor.concern, null);
  assert.equal(response.successor.differences, null);
  assert.equal(response.successor.standing, 'CONDITIONAL');
  assert.ok(response.warnings.includes('DIFFERENCES_MISSING'));
  assert.ok(response.warnings.includes('UNSAFE_CLAIMS_REMOVED'));
});

test('if the identification itself is withheld, no candidates are shown and the answer is guidance only', () => {
  const answer = {
    status: 'OK', category: 'tv', original: { identity: 'Certified like kind and quality TV', confidence: 'high', characteristics: [], uncertainty: null }, requirements: ['Same size'],
    requirementsSource: 'AI_ESTIMATE', successor: { name: 'LG C5', why: 'Next generation', differences: 'Brighter', concern: null, confidence: 'high', standing: 'RECOMMENDED' },
    suggestions: [{ name: 'Sony A95L', why: 'Similar tier', differences: 'Brighter', confidence: 'high' }], clarify: [], warnings: [],
  };
  const response = buildResearchResponse(answer, { requestId: 'r', elapsedMs: 1, answerSource: 'AI_ESTIMATE' });
  assert.deepEqual([response.status, response.successor, response.suggestions, response.original.identity], ['GUIDANCE_ONLY', null, [], null]);
  assert.ok(response.warnings.includes('PRODUCT_NOT_IDENTIFIED'));
  assert.equal(isValidResearchResponse(response), true);
});

test('an unusable answer from the budget store (not the {0|1, count} pair) fails closed before any provider call', async () => {
  for (const result of [undefined, null, 'OK', 1, [], [1], ['maybe', 3], { allowed: 1 }]) {
    const redis = createRedis();
    redis.eval = async () => result;
    const { handler, fetchImpl } = build({ redis });
    const res = await call(handler);
    assert.deepEqual([res.statusCode, res.body.errorCode], [503, 'BUDGET_UNAVAILABLE'], JSON.stringify(result));
    assert.equal(fetchImpl.calls.length, 0);
  }
});

test('a release after UTC midnight gives back the reservation on the day it was taken, never the next day', async () => {
  let clock = Date.UTC(2026, 9, 20, 23, 59, 59, 900);
  const redis = createRedis();
  const budget = createResearchBudget({ redis, now: () => clock });
  const reserved = await budget.reserveCall();
  assert.equal(reserved.allowed, true);
  const dayOne = researchBudgetKey(clock);
  clock = Date.UTC(2026, 9, 21, 0, 0, 0, 200);
  redis.store.set(researchBudgetKey(clock), '7');
  assert.equal(await budget.releaseCall(), true);
  assert.equal(redis.store.get(dayOne), 0);
  assert.equal(redis.store.get(researchBudgetKey(clock)), '7');
  assert.equal(await budget.releaseCall(), false, 'a reservation can be released only once');
});

test('a cache entry that is valid but not an AI answer (guidance source, UNAVAILABLE) is rejected on read', async () => {
  const good = (await call(build().handler)).body;
  const key = researchCacheKey(QUERY);
  for (const response of [{ ...good, meta: { ...good.meta, answerSource: 'CATEGORY_GUIDANCE' } }, { ...good, status: 'UNAVAILABLE', meta: { ...good.meta, answerSource: 'CATEGORY_GUIDANCE' } }]) {
    const redis = createRedis();
    redis.store.set(key, JSON.stringify({ key, contractVersion: 'research.1', response }));
    const { handler, fetchImpl } = build({ redis });
    assert.equal((await call(handler)).body.meta.cached, false);
    assert.equal(fetchImpl.calls.length, 1);
  }
});

test('cache keys change with the answer/prompt version, contract version, model and query, and never contain the query text', () => {
  const base = researchCacheKey(QUERY);
  assert.match(base, /^itemassist-research:answer:v2:answer-\d+-prompt-\d+:research-1:gemini-3-5-flash-lite:[0-9a-f]{24}$/);
  assert.notEqual(base, researchCacheKey(QUERY, { model: 'another-model' }));
  assert.notEqual(base, researchCacheKey('LG C4 OLED TV'));
  assert.equal(researchCacheKey('  LG  c3 oled TV '), base);
  assert.equal(base.toLowerCase().includes('oled'), false);
});

test('an unexpected exception inside the handler is contained as a fixed 502 with no detail', async () => {
  const logger = createLogger();
  const { handler } = build({ logger, cacheFactory: () => { throw new Error('secret internal detail'); } });
  const res = await call(handler);
  assert.deepEqual([res.statusCode, res.body.errorCode], [502, 'ENGINE_ERROR']);
  assert.equal(JSON.stringify(res.body).includes('secret'), false);
  assert.equal(logger.lines.join('\n').includes('secret'), false);
});
