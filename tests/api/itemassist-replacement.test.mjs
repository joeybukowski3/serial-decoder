import test from 'node:test';
import assert from 'node:assert/strict';
import { createItemAssistReplacementHandler } from '../../api/itemassist-replacement.js';
import { isAuthorized, readRequestBody, validateReplacementRequest, MAX_BODY_BYTES } from '../../lib/replacement-public/request.js';
import { replacementBudgetKey } from '../../lib/replacement-public/budget.js';
import { replacementCacheKey } from '../../lib/replacement-public/cache.js';
import { CACHE_FINGERPRINT } from '../../lib/replacement-public/contract.js';
import {
  ENV, TOKEN, buildHandler, createReplacementRedis, createReq, createRes, fakeClock, invoke, requestBody, result,
  fridgeProviders, tvProviders, q7fPage, q7fUrl, q80cPage, q80cUrl, q80dUrl, syntheticTvPage, deepKeys,
} from '../helpers/replacement-public-fixtures.mjs';

const bearer = (token) => ({ authorization: `Bearer ${token}` });
const providerCalls = (providers) => providers.calls.search.length + providers.calls.fetch.length;
const searchCalls = (redis) => redis.calls.filter(([op]) => op === 'eval').length;
const NEVER = () => assert.fail('the engine must not be called');

// ---- AUTH ------------------------------------------------------------------------------------------------------------

test('1: a missing token is rejected with 401 and no provider work', async () => {
  const { handler, providers, redis } = buildHandler();
  const res = await invoke(handler, createReq({ headers: {} }));
  assert.equal(res.statusCode, 401);
  assert.deepEqual([res.body.status, res.body.errorCode, res.body.contractVersion], ['ERROR', 'UNAUTHORIZED', '1']);
  assert.equal(providerCalls(providers), 0);
  assert.deepEqual(redis.calls, []);
});

test('2: wrong, malformed and wrong-scheme tokens are rejected, and the token never appears in the response or logs', async () => {
  const { handler, providers, logger } = buildHandler();
  for (const headers of [bearer('wrong-token-0123456789-abcdefghijkl'), bearer(`${TOKEN}x`), bearer(TOKEN.slice(0, -1)), { authorization: TOKEN },
    { authorization: `Basic ${TOKEN}` }, { authorization: 'Bearer' }, { authorization: 'Bearer ' }]) {
    const res = await invoke(handler, createReq({ headers }));
    assert.equal(res.statusCode, 401, JSON.stringify(headers));
    assert.equal(JSON.stringify(res.body).includes(TOKEN), false);
    assert.equal(JSON.stringify(res.body).includes('wrong-token'), false);
  }
  assert.equal(providerCalls(providers), 0);
  const logged = logger.lines.join('\n');
  assert.equal(logged.includes(TOKEN), false);
  assert.equal(logged.includes('wrong-token'), false);
});

test('3: the correct token proceeds to a COMPLETE result', async () => {
  const { handler, providers } = buildHandler();
  const res = await invoke(handler, createReq());
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'COMPLETE');
  assert.equal(res.body.original.displayName, 'Samsung QN55Q7F');
  assert.equal(res.body.primary.model, 'QN55Q80C');
  assert.ok(providerCalls(providers) > 0);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(res.headers['X-Request-Id'], res.body.meta.requestId);
});

test('4: no provider, store or engine call happens before authentication passes', async () => {
  const redis = createReplacementRedis();
  let engineCalls = 0;
  const providers = tvProviders();
  const { handler } = buildHandler({ redis, providers, recommend: async () => { engineCalls += 1; return NEVER(); } });
  for (const headers of [{}, bearer('nope-nope-nope-nope-nope-nope')]) await invoke(handler, createReq({ headers }));
  assert.equal(engineCalls, 0);
  assert.equal(providerCalls(providers), 0);
  assert.deepEqual(redis.calls, [], 'not even a cache or budget read');
});

test('4b: a missing or too-short configured token never authorizes anyone', async () => {
  for (const configured of [undefined, '', 'short', 'x'.repeat(23)]) {
    const { handler, providers } = buildHandler({ env: { ...ENV, ITEMASSIST_REPLACEMENT_API_TOKEN: configured } });
    for (const sent of [configured ?? '', 'short', '']) assert.equal((await invoke(handler, createReq({ headers: bearer(sent) }))).statusCode, 401);
    assert.equal(providerCalls(providers), 0);
  }
  assert.equal(isAuthorized(`Bearer ${TOKEN}`, TOKEN), true);
  assert.equal(isAuthorized(`bearer   ${TOKEN}`, TOKEN), true);
  assert.equal(isAuthorized(undefined, TOKEN), false);
  assert.equal(isAuthorized(`Bearer ${TOKEN}`, undefined), false);
});

// ---- FLAG ------------------------------------------------------------------------------------------------------------

test('5: with the feature flag off (default) the endpoint is disabled and makes zero provider calls', async () => {
  for (const flag of [undefined, '', 'false', '1', 'TRUE', 'yes']) {
    const redis = createReplacementRedis();
    const { handler, providers } = buildHandler({ redis, env: { ...ENV, ITEMASSIST_REPLACEMENT_API_ENABLED: flag } });
    const res = await invoke(handler);
    assert.equal(res.statusCode, 503, String(flag));
    assert.deepEqual([res.body.status, res.body.errorCode], ['ERROR', 'API_DISABLED']);
    assert.equal(providerCalls(providers), 0);
    assert.deepEqual(redis.calls, []);
  }
});

test('6: with the flag set to exactly "true" the endpoint serves requests; non-POST methods are refused', async () => {
  const { handler } = buildHandler();
  assert.equal((await invoke(handler)).statusCode, 200);
  for (const method of ['GET', 'PUT', 'DELETE', 'OPTIONS']) {
    const res = await invoke(handler, createReq({ method }));
    assert.equal(res.statusCode, 405);
    assert.equal(res.headers.Allow, 'POST');
  }
});

// ---- VALIDATION ------------------------------------------------------------------------------------------------------

test('7: invalid JSON and non-object bodies are rejected with INVALID_REQUEST before any work', async () => {
  const { handler, providers, redis } = buildHandler();
  for (const body of ['{not json', '', 'null', '[]', '"text"', '42', undefined, null, [], 5, Buffer.from('{bad')]) {
    const res = await invoke(handler, createReq({ body }));
    assert.equal(res.statusCode, 400, String(body));
    assert.equal(res.body.errorCode, 'INVALID_REQUEST');
  }
  assert.equal(providerCalls(providers), 0);
  assert.deepEqual(redis.calls, []);
  // A JSON string body is parsed like a pre-parsed object.
  assert.equal((await invoke(handler, createReq({ body: JSON.stringify(requestBody()) }))).statusCode, 200);
});

test('7b: unknown keys, missing fields and non-string fields are rejected', async () => {
  const { handler, providers } = buildHandler();
  const bad = [
    { ...requestBody(), extra: 'x' }, { ...requestBody(), isAdmin: true },
    JSON.parse('{"category":"television","brand":"Samsung","model":"QN55Q7F","__proto__":{"polluted":true}}'),
    { brand: 'Samsung', model: 'QN55Q7F' }, { category: 'television', model: 'QN55Q7F' }, { category: 'television', brand: 'Samsung' },
    requestBody({ category: 1 }), requestBody({ brand: null }), requestBody({ model: ['QN55Q7F'] }), requestBody({ notes: 5 }), requestBody({ notes: { a: 1 } }),
  ];
  for (const body of bad) assert.equal((await invoke(handler, createReq({ body }))).statusCode, 400, JSON.stringify(body));
  assert.equal(providerCalls(providers), 0);
  assert.equal(({}).polluted, undefined);
});

test('8: an unsupported category is UNSUPPORTED (422), not an error, with no provider work', async () => {
  const { handler, providers } = buildHandler();
  for (const category of ['dishwasher', 'washer', 'phone']) {
    const res = await invoke(handler, createReq({ body: requestBody({ category }) }));
    assert.equal(res.statusCode, 422);
    assert.deepEqual([res.body.status, res.body.errorCode], ['UNSUPPORTED', 'UNSUPPORTED']);
  }
  assert.equal(providerCalls(providers), 0);
});

test('9: unsupported brands and models are UNSUPPORTED; malformed model strings are INVALID_REQUEST', async () => {
  const { handler, providers } = buildHandler();
  const unsupported = [requestBody({ brand: 'LG' }), requestBody({ brand: 'Sony' }), requestBody({ category: 'refrigerator', brand: 'Samsung', model: 'LF25H6200S' }),
    requestBody({ model: 'QN55Q60B' }), requestBody({ model: 'UN55TU8000' }), requestBody({ category: 'refrigerator', brand: 'LG', model: 'XYZ' })];
  for (const body of unsupported) {
    const res = await invoke(handler, createReq({ body }));
    assert.equal(res.statusCode, 422, JSON.stringify(body));
    assert.equal(res.body.errorCode, 'UNSUPPORTED');
  }
  for (const model of ['<script>alert(1)</script>', 'QN55Q7F; DROP TABLE', '../../etc/passwd', '${jndi:x}', '   ']) {
    const res = await invoke(handler, createReq({ body: requestBody({ model }) }));
    assert.equal(res.statusCode, 400, model);
    assert.equal(res.body.errorCode, 'INVALID_REQUEST');
  }
  assert.equal(providerCalls(providers), 0);
});

test('10: overlong model, brand, category and notes, and oversized bodies, are rejected', async () => {
  const { handler, providers } = buildHandler();
  for (const body of [requestBody({ model: 'Q'.repeat(41) }), requestBody({ brand: 'S'.repeat(41) }), requestBody({ category: 't'.repeat(41) }), requestBody({ notes: 'n'.repeat(301) })]) {
    assert.equal((await invoke(handler, createReq({ body }))).statusCode, 400);
  }
  assert.equal((await invoke(handler, createReq({ body: requestBody({ notes: 'n'.repeat(300) }) }))).statusCode, 200, '300 characters of notes is the limit');
  const huge = await invoke(handler, createReq({ body: JSON.stringify(requestBody({ notes: 'x'.repeat(MAX_BODY_BYTES + 10) })) }));
  assert.equal(huge.statusCode, 413);
  const declared = await invoke(handler, createReq({ headers: { ...bearer(TOKEN), 'content-length': String(MAX_BODY_BYTES + 1) } }));
  assert.equal(declared.statusCode, 413);
  assert.equal(providerCalls(providers) > 0, true, 'only the valid 300-character request reached the providers');
  const before = providerCalls(providers);
  await invoke(handler, createReq({ body: requestBody({ model: 'Q'.repeat(100) }) }));
  assert.equal(providerCalls(providers), before);
});

test('validation: the server validates independently and normalizes the request it hands to the engine', () => {
  assert.deepEqual(validateReplacementRequest({ category: 'TV', brand: 'samsung', model: ' qn55q7f ', notes: '  fits   a 36 inch opening ' }),
    { ok: true, value: { category: 'television', brand: 'Samsung', model: 'QN55Q7F', notes: 'fits a 36 inch opening' } });
  assert.equal(validateReplacementRequest({ category: 'fridge', brand: 'lg', model: 'lf25h6200s' }).value.category, 'refrigerator');
  assert.equal(readRequestBody({ headers: {}, body: { a: 1 } }).ok, true);
  assert.equal(readRequestBody({ headers: {}, body: Object.create({ inherited: 1 }) }).ok, false);
});

// ---- CONTRACT (API level) --------------------------------------------------------------------------------------------

test('11: the API response is the public allowlist and leaks nothing internal', async () => {
  const redis = createReplacementRedis();
  const { handler } = buildHandler({ redis });
  const res = await invoke(handler, createReq({ body: requestBody({ notes: 'Reusing existing wall mount' }) }));
  const json = JSON.stringify(res.body);
  for (const secret of [TOKEN, 'SERPER', 'serper', 'user-input', 'evidenceId', 'candidateId', 'providerRank', 'internalCandidatePool', 'rankingExplanation', 'rejectedSummary',
    'replacement-finder-budget', 'replacement-finder:result', 'smart-budget', 'queries', 'stack']) assert.equal(json.includes(secret), false, secret);
  assert.equal(deepKeys(res.body).has('decision'), false);
  assert.ok(res.body.sources.every((source) => source.url.startsWith('https://')));
  assert.ok(res.body.sources.length <= 6 && res.body.alternatives.length <= 2);
});

test('17: the refrigerator flow works through the same endpoint', async () => {
  const providers = fridgeProviders();
  const { handler } = buildHandler({ providers });
  const res = await invoke(handler, createReq({ body: requestBody({ category: 'refrigerator', brand: 'LG', model: 'LF25H6200S' }) }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.category, 'refrigerator');
  assert.ok(res.body.alternatives.length <= 2);
  assert.ok(res.body.comparison.some((row) => row.key === 'totalCapacityCuFt'));
});

// ---- CACHE -----------------------------------------------------------------------------------------------------------

test('21: a cache hit avoids the engine and every provider call', async () => {
  const redis = createReplacementRedis();
  let engineCalls = 0;
  const providers = tvProviders();
  const { handler } = buildHandler({ redis, providers, recommend: async (args) => { engineCalls += 1; const { recommendByRetrieval } = await import('../../lib/replacement-discovery/live-retrieval.js'); return recommendByRetrieval(args); } });
  const first = await invoke(handler);
  assert.equal(first.body.meta.cached, false);
  const callsAfterFirst = providerCalls(providers);
  const evalsAfterFirst = searchCalls(redis);
  const key = replacementCacheKey({ category: 'television', brand: 'Samsung', model: 'QN55Q7F', notes: '' });
  assert.ok(redis.store.has(key), 'a COMPLETE result is cached');
  assert.equal(redis.ttls.get(key), 86_400);

  const second = await invoke(handler);
  assert.equal(second.statusCode, 200);
  assert.equal(engineCalls, 1);
  assert.equal(providerCalls(providers), callsAfterFirst);
  assert.equal(searchCalls(redis), evalsAfterFirst, 'a cache hit spends no budget');
  assert.equal(second.body.meta.cached, true);
  assert.notEqual(second.body.meta.requestId, first.body.meta.requestId);
  assert.deepEqual({ ...second.body, meta: null }, { ...first.body, meta: null });
});

test('22: different model, category or notes never share a cached answer', async () => {
  const redis = createReplacementRedis();
  const providers = tvProviders();
  const { handler } = buildHandler({ redis, providers });
  await invoke(handler, createReq({ body: requestBody() }));
  const afterBase = providerCalls(providers);
  const noted = await invoke(handler, createReq({ body: requestBody({ notes: 'Must fit a 36 inch wide opening' }) }));
  assert.equal(noted.body.meta.cached, false, 'different notes are a different query');
  assert.ok(providerCalls(providers) > afterBase);
  const other = await invoke(handler, createReq({ body: requestBody({ model: 'QN55Q80C' }) }));
  assert.equal(other.body.meta.cached, false);
  assert.equal(other.body.original.model, 'QN55Q80C');
  const fridge = await invoke(handler, createReq({ body: requestBody({ category: 'refrigerator', brand: 'LG', model: 'LF25H6200S' }) }));
  assert.equal(fridge.body.category, 'refrigerator');
  assert.equal(fridge.body.meta.cached, false);
  const again = await invoke(handler, createReq({ body: requestBody() }));
  assert.equal(again.body.meta.cached, true);
  assert.equal(again.body.original.model, 'QN55Q7F', 'the original model answer is still its own');
  for (const key of redis.store.keys()) assert.equal(key.includes('36'), false, 'raw notes never appear in a store key');
});

test('23: a corrupted cache entry fails safely: it is a miss, the engine runs, and the bad entry is replaced', async () => {
  const key = replacementCacheKey({ category: 'television', brand: 'Samsung', model: 'QN55Q7F', notes: '' });
  for (const raw of ['{not json', 'null', '{"key":"other","response":{}}', JSON.stringify({ key, engineVersion: CACHE_FINGERPRINT, response: { contractVersion: '1', status: 'COMPLETE' } })]) {
    const redis = createReplacementRedis({ initial: { [key]: raw } });
    const providers = tvProviders();
    const { handler } = buildHandler({ redis, providers });
    const res = await invoke(handler);
    assert.equal(res.statusCode, 200, raw);
    assert.equal(res.body.meta.cached, false);
    assert.ok(providerCalls(providers) > 0);
    assert.notEqual(redis.store.get(key), raw, 'the corrupted entry was overwritten with a valid one');
  }
});

test('23b: an unavailable cache does not break the endpoint, and is not a way around the budget', async () => {
  const redis = createReplacementRedis({ failSet: true });
  const providers = tvProviders();
  const { handler } = buildHandler({ redis, providers });
  const res = await invoke(handler);
  assert.equal(res.statusCode, 200);
  assert.equal(searchCalls(redis), providers.calls.search.length, 'every search still reserved budget');
});

test('cache: PARTIAL and NO_RESULT outcomes are not cached', async () => {
  const clock = fakeClock();
  const providers = tvProviders({
    original: [result('Samsung QN55Q80C specs', q80cUrl)], candidates: [result('Samsung QN55Q7F 55-inch QLED TV', q7fUrl, 1), result('Samsung QN55Q80D 55-inch QLED 4K TV', q80dUrl, 5)],
    pages: { [q80cUrl]: q80cPage, [q80dUrl]: syntheticTvPage('QN55Q80D'), [q7fUrl]: q7fPage },
    tick: (() => { let fetches = 0; return (kind) => { if (kind === 'fetch' && (fetches += 1) === 2) clock.advance(25_000); }; })(),
  });
  const redis = createReplacementRedis();
  const { handler } = buildHandler({ redis, providers, engineNow: clock.now });
  const res = await invoke(handler, createReq({ body: requestBody({ model: 'QN55Q80C' }) }));
  assert.equal(res.body.status, 'PARTIAL');
  assert.equal([...redis.store.keys()].some((key) => key.startsWith('replacement-finder:result')), false);

  const empty = buildHandler({ providers: tvProviders({ original: [], candidates: [] }) });
  const none = await invoke(empty.handler);
  assert.notEqual(none.body.status, 'COMPLETE');
  assert.equal([...empty.redis.store.keys()].some((key) => key.startsWith('replacement-finder:result')), false);
});

// ---- BUDGET ----------------------------------------------------------------------------------------------------------

test('24: the replacement budget is its own namespace and counts actual provider searches, not requests', async () => {
  const redis = createReplacementRedis();
  const providers = tvProviders();
  const { handler } = buildHandler({ redis, providers });
  await invoke(handler);
  const budgetKey = replacementBudgetKey(Date.now());
  assert.ok(budgetKey.startsWith('replacement-finder-budget:v1:'));
  assert.equal(Number(redis.store.get(budgetKey)), providers.calls.search.length, 'one unit per real search');
  assert.ok(providers.calls.search.length >= 2);
  const evalKeys = redis.calls.filter(([op]) => op === 'eval').flatMap(([, ...keys]) => keys);
  assert.ok(evalKeys.every((key) => key === budgetKey));

  // A request refused before searching spends nothing.
  const before = Number(redis.store.get(budgetKey));
  await invoke(handler, createReq({ body: requestBody({ model: 'nonsense<>' }) }));
  await invoke(handler, createReq({ headers: {} }));
  assert.equal(Number(redis.store.get(budgetKey)), before);
});

test('25: an exhausted budget returns BUDGET_EXHAUSTED and starts no provider work', async () => {
  const redis = createReplacementRedis({ initial: { [replacementBudgetKey(Date.now())]: '50' } });
  const providers = tvProviders();
  const { handler, logger } = buildHandler({ redis, providers });
  const res = await invoke(handler);
  assert.equal(res.statusCode, 429);
  assert.deepEqual([res.body.status, res.body.errorCode], ['ERROR', 'BUDGET_EXHAUSTED']);
  assert.equal(providerCalls(providers), 0);
  assert.equal(searchCalls(redis), 0);
  assert.match(logger.lines.at(-1), /BUDGET_EXHAUSTED/);
});

test('25b: the budget running out mid-run stops further searches, returns a limited result and does not cache it', async () => {
  const redis = createReplacementRedis({ initial: { [replacementBudgetKey(Date.now())]: '49' } });
  const providers = tvProviders();
  const { handler } = buildHandler({ redis, providers });
  const res = await invoke(handler);
  assert.equal(providers.calls.search.length, 1, 'only the single remaining search ran');
  assert.equal(res.statusCode, 200);
  assert.notEqual(res.body.status, 'COMPLETE');
  assert.equal(Number(redis.store.get(replacementBudgetKey(Date.now()))), 50, 'never goes over the limit');
  assert.equal([...redis.store.keys()].some((key) => key.startsWith('replacement-finder:result')), false);
});

test('25c: with no budget store the endpoint fails closed: no provider work, BUDGET_UNAVAILABLE', async () => {
  for (const redis of [null, createReplacementRedis({ failGet: true }), createReplacementRedis({ failEval: true, initial: {} })]) {
    const providers = tvProviders();
    const { handler } = buildHandler({ providers, redisFactory: async () => redis });
    const res = await invoke(handler);
    if (redis && !redis.failGet) {
      // get works, eval fails: the very first reservation is denied, so no search ever starts.
      assert.equal(providers.calls.search.length, 0);
      assert.notEqual(res.body.status, 'COMPLETE');
    } else {
      assert.equal(res.statusCode, 503);
      assert.equal(res.body.errorCode, 'BUDGET_UNAVAILABLE');
      assert.equal(providerCalls(providers), 0);
    }
  }
});

test('25d: a throwing store factory is treated as an unavailable store, never as a crash', async () => {
  const providers = tvProviders();
  const { handler } = buildHandler({ providers, redisFactory: async () => { throw new Error('connect ECONNREFUSED 10.0.0.1'); } });
  const res = await invoke(handler);
  assert.equal(res.statusCode, 503);
  assert.equal(JSON.stringify(res.body).includes('ECONNREFUSED'), false);
  assert.equal(providerCalls(providers), 0);
});

test('26: it never reads, spends or mutates the age/LKQ Smart Lookup budgets, and their exhaustion does not block it', async () => {
  const smart = {
    'smart-budget:age:logical:2026-10-06': '120', 'smart-budget:lkq:logical:2026-10-06': '80', 'smart-budget:combined:logical:2026-10-06': '180',
    'smart-budget:age:attempts:2026-10-06': '9', 'smart-budget:combined:attempts:2026-10-06': '9',
  };
  const redis = createReplacementRedis({ initial: { ...smart } });
  let smartBudgetCalls = 0;
  const { handler, providers } = buildHandler({ redis, reserveProviderBudget: () => { smartBudgetCalls += 1; }, recordProviderAttemptMetrics: () => { smartBudgetCalls += 1; } });
  const res = await invoke(handler);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'COMPLETE');
  assert.ok(providers.calls.search.length >= 2);
  assert.equal(smartBudgetCalls, 0);
  for (const [key, value] of Object.entries(smart)) assert.equal(redis.store.get(key), value, `${key} is untouched`);
  assert.equal(redis.calls.flat().some((part) => typeof part === 'string' && part.startsWith('smart-budget')), false);
  assert.equal([...redis.store.keys()].some((key) => key.startsWith('replacement-finder-budget:v1:')), true);
});

// ---- DEADLINE --------------------------------------------------------------------------------------------------------

test('27: a deadline-limited result passes through as PARTIAL with its evidence', async () => {
  const clock = fakeClock();
  const providers = tvProviders({
    original: [result('Samsung QN55Q80C specs', q80cUrl)], candidates: [result('Samsung QN55Q7F 55-inch QLED TV', q7fUrl, 1), result('Samsung QN55Q80D 55-inch QLED 4K TV', q80dUrl, 5)],
    pages: { [q80cUrl]: q80cPage, [q80dUrl]: syntheticTvPage('QN55Q80D'), [q7fUrl]: q7fPage },
    tick: (() => { let fetches = 0; return (kind) => { if (kind === 'fetch' && (fetches += 1) === 2) clock.advance(25_000); }; })(),
  });
  const { handler } = buildHandler({ providers, engineNow: clock.now });
  const res = await invoke(handler, createReq({ body: requestBody({ model: 'QN55Q80C' }) }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'PARTIAL');
  assert.equal(res.body.primary.model, 'QN55Q80D');
  assert.ok(res.body.needsVerification.some((item) => item.reason === 'PARTIAL_DEADLINE'));
  assert.ok(res.body.warnings.some((warning) => warning.code === 'DEADLINE_REACHED'));
});

test('28: a deadline result is never converted into a 5xx, and a hung engine becomes ENGINE_TIMEOUT', async () => {
  const clock = fakeClock();
  const providers = tvProviders({ tick: () => clock.advance(30_000) });
  const { handler } = buildHandler({ providers, engineNow: clock.now });
  const res = await invoke(handler);
  assert.equal(res.statusCode, 200);
  assert.ok(['PARTIAL', 'NO_RESULT'].includes(res.body.status), res.body.status);

  const hung = buildHandler({ recommend: () => new Promise(() => {}), guardMs: 40 });
  const timedOut = await invoke(hung.handler);
  assert.equal(timedOut.statusCode, 504);
  assert.equal(timedOut.body.errorCode, 'ENGINE_TIMEOUT');
});

test('28b: the engine receives the default 20 second deadline', async () => {
  let received;
  const { handler } = buildHandler({ recommend: async (args) => { received = args; return { status: 'UNSUPPORTED', reasonCodes: ['UNSUPPORTED_MODEL_PATTERN'] }; } });
  await invoke(handler);
  assert.equal(received.deadlineMs, 20_000);
  assert.deepEqual(Object.keys(received).sort(), ['brand', 'category', 'deadlineMs', 'deps', 'model', 'notes']);
});

// ---- ERRORS ----------------------------------------------------------------------------------------------------------

test('29: an engine exception becomes a safe ENGINE_ERROR', async () => {
  const redis = createReplacementRedis();
  const { handler } = buildHandler({ redis, recommend: async () => { throw new Error('boom SERPER_KEY_abc123 at /srv/app/secret.js:10'); } });
  const res = await invoke(handler);
  assert.equal(res.statusCode, 502);
  assert.deepEqual([res.body.status, res.body.errorCode, res.body.contractVersion], ['ERROR', 'ENGINE_ERROR', '1']);
  assert.deepEqual(Object.keys(res.body).sort(), ['contractVersion', 'errorCode', 'message', 'requestId', 'status']);
  assert.equal([...redis.store.keys()].some((key) => key.startsWith('replacement-finder:result')), false);
});

test('30: no stack trace, raw exception text or secret reaches the response or the logs', async () => {
  const { handler, logger } = buildHandler({ recommend: async () => { throw Object.assign(new Error('boom SERPER_KEY_abc123 at /srv/app/secret.js:10'), { code: 'ECONNRESET' }); } });
  const res = await invoke(handler);
  const text = `${JSON.stringify(res.body)}\n${logger.lines.join('\n')}`;
  for (const leak of ['boom', 'SERPER_KEY_abc123', '/srv/app', 'secret.js', 'ECONNRESET', 'Error:', '    at ', TOKEN]) assert.equal(text.includes(leak), false, leak);
});

test('30b: an engine NO_RESULT carrying ENGINE_ERROR and a facade-level UNSUPPORTED are both mapped to fixed public errors', async () => {
  const engineError = buildHandler({ recommend: async () => ({ status: 'NO_RESULT', supported: true, input: { category: 'television', brand: 'Samsung', model: 'QN55Q7F', notes: '' }, report: null,
    retrievalQuality: 'RETRIEVAL_FAILED', reasonCodes: ['ENGINE_ERROR'], notes: { notScored: [] }, deadline: { reached: false }, providerCalls: { search: 0, fetch: 0 } }) });
  const a = await invoke(engineError.handler);
  assert.deepEqual([a.statusCode, a.body.errorCode], [502, 'ENGINE_ERROR']);

  const unsupported = buildHandler({ recommend: async () => ({ status: 'UNSUPPORTED', reasonCodes: ['MODEL_NOT_RECOGNIZED'] }) });
  const b = await invoke(unsupported.handler);
  assert.deepEqual([b.statusCode, b.body.status, b.body.errorCode], [422, 'UNSUPPORTED', 'UNSUPPORTED']);
});

test('30c: a malformed engine result cannot reach the browser; it becomes ENGINE_ERROR', async () => {
  const { handler } = buildHandler({ recommend: async () => ({ status: 'COMPLETE', input: { category: 'television', brand: 'Samsung', model: 'QN55Q7F' }, report: { recommendation: { primary: { garbage: true } } } }) });
  const res = await invoke(handler);
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.errorCode, 'ENGINE_ERROR');
});

// ---- LOGGING ---------------------------------------------------------------------------------------------------------

test('logging: one structured, secret-free line per request with the agreed fields', async () => {
  const { handler, logger } = buildHandler();
  await invoke(handler, createReq({ body: requestBody({ notes: 'Private note about my living room' }) }));
  const entry = JSON.parse(logger.lines.at(-1));
  assert.deepEqual(Object.keys(entry).sort(), ['brand', 'cacheHit', 'category', 'deadlineReached', 'elapsedMs', 'event', 'model', 'requestId', 'searchCount', 'status']);
  assert.equal(entry.event, 'itemassist_replacement');
  assert.equal(entry.cacheHit, false);
  assert.ok(entry.searchCount >= 2);
  const all = logger.lines.join('\n');
  for (const leak of ['Private note', 'living room', TOKEN, 'serper', 'Authorization', 'authorization']) assert.equal(all.includes(leak), false, leak);
});

test('module: the default export is a ready handler and the Vercel duration is 30 seconds', async () => {
  const mod = await import('../../api/itemassist-replacement.js');
  assert.equal(typeof mod.default, 'function');
  assert.equal(typeof createItemAssistReplacementHandler, 'function');
  const res = createRes();
  const saved = process.env.ITEMASSIST_REPLACEMENT_API_ENABLED;
  delete process.env.ITEMASSIST_REPLACEMENT_API_ENABLED;
  try { await mod.default({ method: 'POST', headers: {}, body: requestBody() }, res); } finally { if (saved !== undefined) process.env.ITEMASSIST_REPLACEMENT_API_ENABLED = saved; }
  assert.equal(res.statusCode, 503, 'disabled by default when no environment is configured');
  const config = JSON.parse((await import('node:fs')).readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.functions['api/itemassist-replacement.js'].maxDuration, 30);
  assert.equal(config.functions['api/age-lookup.js'].maxDuration, 35, 'unrelated routes are unchanged');
});

test('review: a throwing body getter, a padded configured token and engine-error reasons are all handled', async () => {
  const throwing = { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, get body() { throw new Error('Invalid JSON'); } };
  const { handler, logger, providers } = buildHandler();
  const res = await invoke(handler, throwing);
  assert.deepEqual([res.statusCode, res.body.errorCode], [400, 'INVALID_REQUEST']);
  assert.equal(providerCalls(providers), 0);

  assert.equal(isAuthorized(`Bearer ${TOKEN}`, `${TOKEN}
`), true, 'a trailing newline in the configured token is ignored');
  assert.equal(isAuthorized(`Bearer ${TOKEN}`, `  ${' '.repeat(30)}`), false, 'whitespace alone is never a token');

  const failing = buildHandler({ recommend: async () => { throw new Error('boom'); } });
  await invoke(failing.handler);
  assert.equal(JSON.parse(failing.logger.lines.at(-1)).reason, 'engine_exception');
  assert.equal(failing.logger.lines.at(-1).includes('boom'), false);
  assert.equal(logger.lines.length, 1);
});

// ---- PROVIDER READINESS ----------------------------------------------------------------------------------------------

const withoutProviderKey = (value) => { const { SERPER_API_KEY, ...rest } = ENV; return value === undefined ? rest : { ...rest, SERPER_API_KEY: value }; };

test('provider: a missing or blank SERPER_API_KEY on a cache miss consumes zero budget, makes zero provider calls and writes nothing', async () => {
  for (const env of [withoutProviderKey(), withoutProviderKey(''), withoutProviderKey('   '), withoutProviderKey('\n')]) {
    const redis = createReplacementRedis();
    const providers = tvProviders();
    let engineCalls = 0;
    const { handler } = buildHandler({ env, redis, providers, recommend: async () => { engineCalls += 1; return NEVER(); } });
    const res = await invoke(handler);
    assert.equal(res.statusCode, 503);
    assert.deepEqual([res.body.status, res.body.errorCode], ['ERROR', 'PROVIDER_UNAVAILABLE']);
    assert.equal(engineCalls, 0);
    assert.equal(providerCalls(providers), 0);
    assert.equal(searchCalls(redis), 0, 'no budget reservation');
    assert.equal(redis.calls.some(([op]) => op === 'set'), false, 'no cache write');
    assert.equal(redis.store.has(replacementBudgetKey(Date.now())), false, 'the budget counter was never touched');
  }
});

test('provider: the response and logs for a missing key are fixed text with no env value, key name or diagnostics', async () => {
  const { handler, logger } = buildHandler({ env: withoutProviderKey() });
  const res = await invoke(handler);
  assert.deepEqual(Object.keys(res.body).sort(), ['contractVersion', 'errorCode', 'message', 'requestId', 'status']);
  const text = `${JSON.stringify(res.body)}\n${logger.lines.join('\n')}`;
  for (const leak of ['SERPER', 'serper', 'API_KEY', 'fake-serper-key', TOKEN, 'process.env', 'MISSING']) assert.equal(text.includes(leak), false, leak);
  assert.equal(JSON.parse(logger.lines.at(-1)).reason, 'provider_not_configured');
});

test('provider: auth and the feature flag are still checked before provider readiness', async () => {
  const noKey = withoutProviderKey();
  const unauthorized = await invoke(buildHandler({ env: noKey }).handler, createReq({ headers: {} }));
  assert.equal(unauthorized.body.errorCode, 'UNAUTHORIZED');
  const disabled = await invoke(buildHandler({ env: { ...noKey, ITEMASSIST_REPLACEMENT_API_ENABLED: 'false' } }).handler);
  assert.equal(disabled.body.errorCode, 'API_DISABLED');
  const invalid = await invoke(buildHandler({ env: noKey }).handler, createReq({ body: { nope: 1 } }));
  assert.equal(invalid.body.errorCode, 'INVALID_REQUEST', 'validation also comes first');
});

test('provider: a cache hit still succeeds without SERPER_API_KEY because it needs no provider', async () => {
  const redis = createReplacementRedis();
  const warm = buildHandler({ redis });
  const first = await invoke(warm.handler);
  assert.equal(first.body.status, 'COMPLETE');
  const providers = tvProviders();
  const evalsBefore = searchCalls(redis);
  const cold = buildHandler({ env: withoutProviderKey(), redis, providers });
  const hit = await invoke(cold.handler);
  assert.equal(hit.statusCode, 200);
  assert.equal(hit.body.meta.cached, true);
  assert.equal(providerCalls(providers), 0);
  assert.equal(searchCalls(redis), evalsBefore, 'no budget spent on a hit');
  const miss = await invoke(cold.handler, createReq({ body: requestBody({ model: 'QN55Q80C' }) }));
  assert.equal(miss.body.errorCode, 'PROVIDER_UNAVAILABLE', 'but an uncached model is refused');
});

test('provider: with a valid key the normal budget behaviour applies and the readiness check spends nothing itself', async () => {
  const redis = createReplacementRedis();
  const providers = tvProviders();
  const { handler } = buildHandler({ redis, providers });
  const res = await invoke(handler);
  assert.equal(res.body.status, 'COMPLETE');
  assert.equal(Number(redis.store.get(replacementBudgetKey(Date.now()))), providers.calls.search.length);
  const exhausted = buildHandler({ redis: createReplacementRedis({ initial: { [replacementBudgetKey(Date.now())]: '50' } }) });
  assert.equal((await invoke(exhausted.handler)).body.errorCode, 'BUDGET_EXHAUSTED');
  const unavailable = buildHandler({ redisFactory: async () => null });
  assert.equal((await invoke(unavailable.handler)).body.errorCode, 'BUDGET_UNAVAILABLE', 'budget stays fail-closed');
});
