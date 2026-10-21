import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import defaultHandler, { createItemAssistResearchHandler } from '../../lib/itemassist-research/handler.js';
import { createResearchBudget, researchBudgetKey } from '../../lib/itemassist-research/budget.js';
import { findResearchClaim, isValidResearchResponse } from '../../lib/itemassist-research/contract.js';
import {
  FIXTURE_MODE_ENV, FIXTURE_SCENARIO_IDS, FIXTURE_STATE, createMemoryStore, fixtureModeState, fixtureReplyFor, getFixtureAnswer,
} from '../../lib/itemassist-research/fixture.js';

// OFFLINE ONLY. Fixture mode is the one place a connected Preview answers without a provider; these tests prove what selects it, what it
// refuses to run in, and that it can never reach a provider or Redis.
const TOKEN = 'test-token-0123456789-abcdefghijkl';
const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);
const PREVIEW = Object.freeze({ ITEMASSIST_RESEARCH_ENABLED: 'true', ITEMASSIST_REPLACEMENT_API_TOKEN: TOKEN, [FIXTURE_MODE_ENV]: 'preview', VERCEL_ENV: 'preview' });
const bearer = (token = TOKEN) => ({ authorization: `Bearer ${token}` });
const createReq = (options = {}) => ({ method: options.method ?? 'POST', headers: options.headers ?? bearer(), query: options.query, body: 'body' in options ? options.body : { query: 'LG C3 OLED TV' } });
const createRes = () => ({ statusCode: 200, body: null, headers: {}, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, setHeader(name, value) { this.headers[name] = value; } });
const createLogger = () => { const lines = []; return { lines, info: (line) => lines.push(String(line)) }; };
const FORBIDDEN = async () => assert.fail('this must not be called');

/** A handler wired so that ANY provider, shared-store or shipped-engine use fails the test. */
function build({ env = PREVIEW, logger = createLogger(), ...rest } = {}) {
  return {
    logger,
    handler: createItemAssistResearchHandler({ env, logger, now: () => NOW, requestIdFactory: () => 'req-1', getAnswer: FORBIDDEN, redisFactory: FORBIDDEN, ...rest }),
  };
}
async function call(handler, request = createReq()) { const res = createRes(); await handler(request, res); return res; }

/** Replaces global fetch for the duration of a test so any network use is a failure, and reports how often it was reached. */
async function withNoNetwork(run) {
  const original = globalThis.fetch;
  let reached = 0;
  globalThis.fetch = async () => { reached += 1; throw new Error('network is not allowed in these tests'); };
  try { await run(); } finally { globalThis.fetch = original; }
  assert.equal(reached, 0, 'fetch was reached');
}

// ---- what selects fixture mode -------------------------------------------------------------------------------------------------

test('fixture mode is ACTIVE only for the exact Preview combination; every other use of the flag is REFUSED; no flag is OFF', () => {
  assert.equal(fixtureModeState(PREVIEW), FIXTURE_STATE.ACTIVE);
  for (const env of [{}, { VERCEL_ENV: 'preview' }, { VERCEL_ENV: 'production' }, { [FIXTURE_MODE_ENV]: '' }, { [FIXTURE_MODE_ENV]: '   ', VERCEL_ENV: 'production' }]) {
    assert.equal(fixtureModeState(env), FIXTURE_STATE.OFF, JSON.stringify(env));
  }
  const refused = [
    { VERCEL_ENV: 'production' }, { VERCEL_ENV: 'development' }, { VERCEL_ENV: 'Preview' }, { VERCEL_ENV: 'PREVIEW' }, { VERCEL_ENV: '' }, {}, { VERCEL_ENV: ' preview' },
    { VERCEL_ENV: 'preview', flag: 'true' }, { VERCEL_ENV: 'preview', flag: '1' }, { VERCEL_ENV: 'preview', flag: 'PREVIEW' }, { VERCEL_ENV: 'preview', flag: 'production' },
  ];
  for (const { flag = 'preview', ...rest } of refused) {
    assert.equal(fixtureModeState({ [FIXTURE_MODE_ENV]: flag, ...rest }), FIXTURE_STATE.REFUSED, JSON.stringify({ flag, ...rest }));
  }
  assert.equal(fixtureModeState(undefined), FIXTURE_STATE.OFF);
  assert.equal(fixtureModeState({ [FIXTURE_MODE_ENV]: ['preview'], VERCEL_ENV: 'preview' }), FIXTURE_STATE.OFF);
});

test('no request parameter can switch fixture mode on: body keys, query string, headers and cookies are ignored or refused', async () => {
  const withoutFlag = { ITEMASSIST_RESEARCH_ENABLED: 'true', ITEMASSIST_REPLACEMENT_API_TOKEN: TOKEN, VERCEL_ENV: 'preview' };
  const attempts = [
    createReq({ body: { query: 'LG C3 OLED TV', fixture: true } }),
    createReq({ body: { query: 'LG C3 OLED TV', fixtureMode: 'preview' } }),
    createReq({ body: { query: 'LG C3 OLED TV', [FIXTURE_MODE_ENV]: 'preview' } }),
    createReq({ query: { fixture: '1', mode: 'fixture', [FIXTURE_MODE_ENV]: 'preview' } }),
    createReq({ headers: { ...bearer(), 'x-fixture': '1', 'x-itemassist-research-mode': 'fixture', 'x-vercel-env': 'preview', cookie: `${FIXTURE_MODE_ENV}=preview; fixture=1` } }),
  ];
  for (const request of attempts) {
    let provider = 0;
    let store = 0;
    const { handler } = build({
      env: withoutFlag, getAnswer: async () => { provider += 1; return { answer: null, meta: { requestSent: false, errorCode: 'X' } }; }, redisFactory: async () => { store += 1; return null; },
    });
    const res = await call(handler, request);
    assert.equal(res.headers['X-ItemAssist-Research-Mode'], undefined);
    assert.equal(provider, 0);
    // Extra body keys are refused outright. The rest reach the NORMAL path, which here has no provider key, so it refuses; never a canned answer.
    if (Object.keys(request.body).length > 1) { assert.deepEqual([res.statusCode, store], [400, 0]); } else { assert.deepEqual([res.statusCode, res.body.errorCode, store], [503, 'PROVIDER_UNAVAILABLE', 1]); }
  }
});

// ---- never outside a Preview ---------------------------------------------------------------------------------------------------

test('the flag in Production (or anywhere that is not a Preview) fails closed: 503, no canned answer, no provider, no store', async () => {
  await withNoNetwork(async () => {
    for (const vercelEnv of ['production', 'development', undefined, '', 'Preview']) {
      const env = { ...PREVIEW, VERCEL_ENV: vercelEnv, GEMINI_API_KEY: 'test-key-0123456789abcdef' };
      const { handler, logger } = build({ env });
      const res = await call(handler);
      assert.equal(res.statusCode, 503, String(vercelEnv));
      assert.deepEqual([res.body.status, res.body.errorCode], ['ERROR', 'API_DISABLED']);
      assert.equal(res.headers['X-ItemAssist-Research-Mode'], undefined);
      assert.match(logger.lines.join('\n'), /fixture_mode_refused/);
    }
  });
});

test('the shipped default handler, driven by the real process environment, refuses fixture mode in Production and serves it in a Preview', async () => {
  const names = ['ITEMASSIST_RESEARCH_ENABLED', 'ITEMASSIST_REPLACEMENT_API_TOKEN', FIXTURE_MODE_ENV, 'VERCEL_ENV', 'GEMINI_API_KEY'];
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const restore = () => names.forEach((name) => { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; });
  try {
    await withNoNetwork(async () => {
      Object.assign(process.env, { ITEMASSIST_RESEARCH_ENABLED: 'true', ITEMASSIST_REPLACEMENT_API_TOKEN: TOKEN, [FIXTURE_MODE_ENV]: 'preview', VERCEL_ENV: 'production' });
      delete process.env.GEMINI_API_KEY;
      const production = await call(defaultHandler);
      assert.deepEqual([production.statusCode, production.body.errorCode], [503, 'API_DISABLED']);
      process.env.VERCEL_ENV = 'preview';
      const preview = await call(defaultHandler);
      assert.equal(preview.statusCode, 200);
      assert.equal(preview.headers['X-ItemAssist-Research-Mode'], 'fixture');
      assert.equal(isValidResearchResponse(preview.body, { allowFixture: true }), true);
    });
  } finally { restore(); }
});

test('with the flag absent the route behaves exactly as before: no fixture header, and a provider is needed', async () => {
  const env = { ITEMASSIST_RESEARCH_ENABLED: 'true', ITEMASSIST_REPLACEMENT_API_TOKEN: TOKEN, VERCEL_ENV: 'preview' };
  const store = createMemoryStore();
  const { handler } = build({ env, redisFactory: async () => store });
  const res = await call(handler);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.errorCode, 'PROVIDER_UNAVAILABLE');
  assert.equal(res.headers['X-ItemAssist-Research-Mode'], undefined);
});

// ---- authentication and the other gates still apply ----------------------------------------------------------------------------

test('fixture mode still needs the research flag and the bearer token, and checks them before touching anything', async () => {
  for (const [env, request, code, status] of [
    [{ ...PREVIEW, ITEMASSIST_RESEARCH_ENABLED: 'false' }, createReq(), 'API_DISABLED', 503],
    [PREVIEW, createReq({ headers: {} }), 'UNAUTHORIZED', 401],
    [PREVIEW, createReq({ headers: bearer('wrong-token-0123456789-abcdefghijkl') }), 'UNAUTHORIZED', 401],
    [PREVIEW, createReq({ headers: { authorization: TOKEN } }), 'UNAUTHORIZED', 401],
    [{ ...PREVIEW, ITEMASSIST_REPLACEMENT_API_TOKEN: undefined }, createReq(), 'UNAUTHORIZED', 401],
    [PREVIEW, createReq({ body: { query: '' } }), 'INVALID_REQUEST', 400],
    [PREVIEW, createReq({ method: 'GET' }), 'INVALID_REQUEST', 405],
  ]) {
    const { handler } = build({ env });
    const res = await call(handler, request);
    assert.deepEqual([res.statusCode, res.body.errorCode], [status, code]);
    assert.equal(res.body.status, 'ERROR');
  }
});

// ---- the canned answers --------------------------------------------------------------------------------------------------------

const CASES = Object.freeze([
  { query: 'LG C3 OLED TV', scenario: 'tv', status: 'OK', successor: 'RECOMMENDED', suggestions: 2 },
  { query: 'Samsung RF28 refrigerator', scenario: 'refrigerator', status: 'OK', successor: 'CONDITIONAL', suggestions: 2 },
  { query: 'Whirlpool dishwasher', scenario: 'appliance', status: 'PARTIAL', successor: null, suggestions: 0 },
  { query: 'something I cannot describe', scenario: 'generic', status: 'GUIDANCE_ONLY', successor: null, suggestions: 0 },
]);

test('every scenario returns a contract-valid, claim-free answer through the real sanitizer and contract, with no provider and no Redis', async () => {
  await withNoNetwork(async () => {
    for (const item of CASES) {
      const { handler } = build();
      const res = await call(handler, createReq({ body: { query: item.query } }));
      assert.equal(res.statusCode, 200, item.query);
      assert.equal(isValidResearchResponse(res.body, { allowFixture: true }), true, item.query);
      assert.equal(res.headers['X-ItemAssist-Research-Mode'], 'fixture');
      assert.equal(res.body.status, item.status, item.query);
      assert.equal(res.body.successor?.standing ?? null, item.successor, item.query);
      assert.equal(res.body.suggestions.length, item.suggestions, item.query);
      assert.equal(res.body.meta.answerSource, 'AI_ESTIMATE');
      assert.equal(res.body.suggestions.concat(res.body.successor ? [res.body.successor] : []).every((candidate) => candidate.verified === false), true);
      // The sanitizer removed nothing and found no mismatch: the canned text is clean and agrees with its own trigger query.
      for (const warning of ['UNSAFE_CLAIMS_REMOVED', 'IDENTITY_MISMATCH', 'CATEGORY_MISMATCH', 'SUGGESTIONS_WITHHELD']) assert.equal(res.body.warnings.includes(warning), false, `${item.query}: ${warning}`);
      assert.equal(JSON.stringify(res.body).split('"').filter((part) => part.length > 3).some((part) => findResearchClaim(part)), false, item.query);
    }
  });
  assert.deepEqual([...FIXTURE_SCENARIO_IDS].sort(), CASES.map((item) => item.scenario).sort());
});

test('the TV scenario carries the pieces the workspace shows: original, requirements, successor, alternatives and a size question', async () => {
  const { handler } = build();
  const { body } = await call(handler);
  assert.equal(body.original.identity, 'LG C3 series 4K OLED smart TV');
  assert.equal(body.original.characteristics.length >= 3, true);
  assert.equal(body.requirements.length >= 4, true);
  assert.equal(body.requirementsSource, 'AI_ESTIMATE');
  assert.match(body.successor.name, /C4/);
  assert.equal(body.clarify.length, 1);
  assert.match(body.clarify[0], /size/i);
});

test('the scenario is chosen from the cleaned query text only, and a size in the query removes the size question', async () => {
  assert.equal(fixtureReplyFor('lg c3 65 inch').id, 'tv');
  assert.equal(fixtureReplyFor('tv').id, 'tv');
  assert.equal(fixtureReplyFor('').id, 'generic');
  assert.equal(fixtureReplyFor(undefined).id, 'generic');
  const { handler } = build();
  const { body } = await call(handler, createReq({ body: { query: 'LG C3 OLED TV 65 inch' } }));
  assert.deepEqual(body.clarify, []);
  const run = await getFixtureAnswer('LG C3 OLED TV');
  assert.deepEqual([run.meta.fixture, run.meta.requestSent, run.meta.errorCode], [true, false, null]);
});

// ---- budget, cache and usage still run -----------------------------------------------------------------------------------------

test('the real budget still guards fixture mode: a denied or unavailable budget stops the answer, and a granted one is released unused', async () => {
  const calls = [];
  const real = (redis) => createResearchBudget({ redis, config: { dailyCallLimit: 3 }, now: () => NOW });
  const { handler } = build({
    budgetFactory: (redis) => { const budget = real(redis); return { reserveCall: async () => { const r = await budget.reserveCall(); calls.push(['reserve', r.status, r.used]); return r; }, releaseCall: async () => { calls.push(['release']); return budget.releaseCall(); } }; },
  });
  const res = await call(handler);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls, [['reserve', 'allowed', 1], ['release']]);

  for (const [status, code, http] of [['denied', 'BUDGET_EXHAUSTED', 429], ['unavailable', 'BUDGET_UNAVAILABLE', 503]]) {
    const denied = build({ budgetFactory: () => ({ reserveCall: async () => ({ allowed: false, status, used: null, limit: 1 }), releaseCall: FORBIDDEN }) });
    const out = await call(denied.handler);
    assert.deepEqual([out.statusCode, out.body.errorCode], [http, code]);
    assert.equal(out.body.original, undefined);
  }
});

test('answers are cached in memory only: a repeat is a cache hit and a restart (new handler) starts empty', async () => {
  const { handler } = build();
  const first = await call(handler);
  const second = await call(handler);
  assert.equal(first.body.meta.cached, false);
  assert.equal(second.body.meta.cached, true);
  assert.equal(isValidResearchResponse({ ...second.body, meta: { ...second.body.meta, cached: false } }, { allowFixture: true }), true);
  const { handler: other } = build();
  assert.equal((await call(other)).body.meta.cached, false);
});

test('fixture mode never opens the shared store, and logs carry fixture:true but never the query, token or answer text', async () => {
  const { handler, logger } = build();
  await call(handler);
  await call(handler);
  const log = logger.lines.join('\n');
  assert.match(log, /"fixture":true/);
  for (const secret of [TOKEN, 'LG C3', 'OLED panel', 'Samsung']) assert.equal(log.includes(secret), false, secret);
});

// ---- the in-memory store -------------------------------------------------------------------------------------------------------

test('the in-memory store runs the REAL budget module: it is atomic, bounded by the limit, releasable, and expires with the day', async () => {
  let clock = NOW;
  const store = createMemoryStore({ now: () => clock });
  const budget = createResearchBudget({ redis: store, config: { dailyCallLimit: 2 }, now: () => clock });
  assert.deepEqual((await budget.reserveCall()), { allowed: true, status: 'allowed', used: 1, limit: 2 });
  assert.equal((await budget.reserveCall()).used, 2);
  assert.deepEqual((await budget.reserveCall()).status, 'denied');
  assert.equal(await budget.releaseCall(), true);
  assert.equal((await budget.reserveCall()).allowed, true);
  assert.equal(Number(await store.get(researchBudgetKey(NOW))), 2);
  clock += 25 * 60 * 60 * 1000;
  assert.equal(await store.get(researchBudgetKey(NOW)), null);
});

test('the in-memory store is bounded and honours expiry, and a fresh store shares nothing with another', async () => {
  let clock = 1000;
  const store = createMemoryStore({ now: () => clock, maxEntries: 3 });
  for (const key of ['a', 'b', 'c', 'd']) await store.set(key, key);
  assert.deepEqual([await store.get('a'), await store.get('d')], [null, 'd']);
  await store.set('t', 'x', { ex: 1 });
  clock += 1001;
  assert.equal(await store.get('t'), null);
  assert.equal(await createMemoryStore().get('d'), null);
});

// ---- isolation (source level) --------------------------------------------------------------------------------------------------

test('fixture code imports no provider, Redis or network code, reads no request data, and the route decides the mode from the environment only', () => {
  const fixture = readFileSync('lib/itemassist-research/fixture.js', 'utf8');
  const imports = [...fixture.matchAll(/from '([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(imports, ['../replacement-quick/quick-sanitize.js']);
  for (const forbidden of ['fetch(', 'process.env', 'Redis', 'upstash', 'GEMINI', 'gemini', 'req.', 'headers', 'node:http']) assert.equal(fixture.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '').includes(forbidden), false, forbidden);
  const route = readFileSync('lib/itemassist-research/handler.js', 'utf8');
  assert.equal((route.match(/fixtureModeState\(/g) || []).length, 1);
  assert.match(route, /fixtureModeState\(env\)/);
  assert.equal(/fixtureModeState\([^)]*req/.test(route), false);
  // The default (shipped) export is built with no dependencies at all: the fixture can only be reached through the environment.
  assert.match(route, /export default createItemAssistResearchHandler\(\);/);
});
