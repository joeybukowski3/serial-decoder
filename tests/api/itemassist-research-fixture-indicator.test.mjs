import test from 'node:test';
import assert from 'node:assert/strict';
import defaultHandler, { createItemAssistResearchHandler } from '../../lib/itemassist-research/handler.js';
import { createResearchCache, researchCacheKey } from '../../lib/itemassist-research/cache.js';
import { buildResearchResponse, isValidResearchResponse } from '../../lib/itemassist-research/contract.js';
import { FIXTURE_MODE_ENV, createMemoryStore, getFixtureAnswer } from '../../lib/itemassist-research/fixture.js';
import { getQuickAnswer } from '../../lib/replacement-quick/quick-answer.js';
import { sanitizeQuickAnswer } from '../../lib/replacement-quick/quick-sanitize.js';

// OFFLINE ONLY. The fixture indicator (meta.fixture === true) tells the Preview UI that an answer is canned. It is set by the route's
// server-side fixture mode and by nothing else; these tests prove it cannot be forged and never appears outside a Preview.
const TOKEN = 'test-token-0123456789-abcdefghijkl';
const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);
const PREVIEW = Object.freeze({ ITEMASSIST_RESEARCH_ENABLED: 'true', ITEMASSIST_REPLACEMENT_API_TOKEN: TOKEN, [FIXTURE_MODE_ENV]: 'preview', VERCEL_ENV: 'preview' });
const QUERIES = Object.freeze(['LG C3 OLED TV', 'Samsung RF28 refrigerator', 'Whirlpool dishwasher', 'something I cannot describe']);
const bearer = (token = TOKEN) => ({ authorization: `Bearer ${token}` });
const createReq = (options = {}) => ({ method: 'POST', headers: options.headers ?? bearer(), query: options.query, body: 'body' in options ? options.body : { query: QUERIES[0] } });
const createRes = () => ({ statusCode: 200, body: null, headers: {}, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, setHeader(name, value) { this.headers[name] = value; } });
const quiet = { info() {} };
const FORBIDDEN = async () => assert.fail('this must not be called');
const hasFixtureKey = (value) => /"fixture"/.test(JSON.stringify(value));

function build({ env = PREVIEW, ...rest } = {}) {
  return createItemAssistResearchHandler({ env, logger: quiet, now: () => NOW, requestIdFactory: () => 'req-1', getAnswer: FORBIDDEN, redisFactory: FORBIDDEN, ...rest });
}
async function call(handler, request = createReq()) { const res = createRes(); await handler(request, res); return res; }

test('every fixture response carries meta.fixture === true (fresh and cached), and nothing else names it', async () => {
  for (const query of QUERIES) {
    const handler = build();
    const first = await call(handler, createReq({ body: { query } }));
    const second = await call(handler, createReq({ body: { query } }));
    assert.equal(first.body.meta.fixture, true, query);
    assert.equal(second.body.meta.cached, true);
    assert.equal(second.body.meta.fixture, true, query);
    assert.deepEqual(Object.keys(first.body.meta).sort(), ['answerSource', 'cached', 'elapsedMs', 'fixture', 'requestId']);
    assert.equal(hasFixtureKey({ ...first.body, meta: { ...first.body.meta, fixture: undefined } }), false, 'only meta.fixture may name it');
  }
});

test('a real (non-fixture) response never carries the indicator, even when the provider tries to forge it', async () => {
  const forged = {
    category: 'tv', fixture: true, demo: true, meta: { fixture: true },
    original: { identity: 'LG C3 series 4K OLED smart TV', confidence: 'high', characteristics: ['OLED panel'], uncertainty: null, fixture: true },
    requirements: ['Same screen size class', 'OLED or better panel', '4K resolution', 'Several HDMI 2.1 ports'],
    successor: { name: 'LG C4 series OLED', why: 'Next generation of the same line.', differences: 'Newer processor.', concern: null, confidence: 'high', fixture: true },
    suggestions: [{ name: 'Sony Bravia 8 OLED', why: 'Similar tier.', differences: 'Different platform.', confidence: 'medium', fixture: true }],
    clarify: [],
  };
  const fetchImpl = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(forged) }] }, finishReason: 'STOP' }], usageMetadata: {} }), { status: 200, headers: { 'content-type': 'application/json' } });
  const env = { ITEMASSIST_RESEARCH_ENABLED: 'true', ITEMASSIST_REPLACEMENT_API_TOKEN: TOKEN, GEMINI_API_KEY: 'test-key-0123456789abcdef', VERCEL_ENV: 'production' };
  const store = createMemoryStore();
  const handler = build({ env, redisFactory: async () => store, getAnswer: (query, options) => getQuickAnswer(query, { ...options, apiKey: env.GEMINI_API_KEY, fetchImpl }) });
  const res = await call(handler);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'OK');
  assert.equal(hasFixtureKey(res.body), false);
  assert.equal(JSON.stringify(res.body).includes('demo'), false);
  assert.equal(res.headers['X-ItemAssist-Research-Mode'], undefined);
  assert.equal(hasFixtureKey(sanitizeQuickAnswer(forged, { query: QUERIES[0] })), false);
});

test('error and refused responses never carry the indicator, in any environment', async () => {
  for (const [env, request] of [
    [{ ...PREVIEW, VERCEL_ENV: 'production' }, createReq()],
    [{ ...PREVIEW, ITEMASSIST_RESEARCH_ENABLED: 'false' }, createReq()],
    [PREVIEW, createReq({ headers: {} })],
    [PREVIEW, createReq({ body: { query: 'LG C3', fixture: true } })],
    [{}, createReq()],
  ]) {
    const res = await call(build({ env }), request);
    assert.equal(hasFixtureKey(res.body), false);
    assert.equal(res.headers['X-ItemAssist-Research-Mode'], undefined);
  }
});

test('request data cannot add the indicator: a body key, query string, header or cookie yields no marker and no canned answer', async () => {
  const env = { ITEMASSIST_RESEARCH_ENABLED: 'true', ITEMASSIST_REPLACEMENT_API_TOKEN: TOKEN, VERCEL_ENV: 'preview' };
  for (const request of [
    createReq({ body: { query: 'LG C3', fixture: true } }), createReq({ body: { query: 'LG C3', meta: { fixture: true } } }), createReq({ query: { fixture: '1' } }),
    createReq({ headers: { ...bearer(), 'x-fixture': '1', cookie: 'fixture=1' } }),
  ]) {
    const res = await call(build({ env, redisFactory: async () => createMemoryStore() }), request);
    assert.equal(hasFixtureKey(res.body), false);
    assert.notEqual(res.statusCode, 200);
  }
});

test('the validator accepts meta.fixture only as the literal true, and only when the caller allows it', async () => {
  const run = await getFixtureAnswer(QUERIES[0]);
  const options = { requestId: 'r', elapsedMs: 5, answerSource: 'AI_ESTIMATE' };
  const base = buildResearchResponse(run.answer, options);
  const marked = buildResearchResponse(run.answer, { ...options, fixture: true });
  assert.equal('fixture' in base.meta, false);
  assert.equal(marked.meta.fixture, true);
  assert.equal(isValidResearchResponse(base), true);
  assert.equal(isValidResearchResponse(base, { allowFixture: true }), true);
  assert.equal(isValidResearchResponse(marked), false, 'a marked response is invalid outside fixture mode');
  assert.equal(isValidResearchResponse(marked, { allowFixture: true }), true);
  for (const bad of [false, 'true', 1, 'yes', {}, null, ['x']]) {
    assert.equal(isValidResearchResponse({ ...marked, meta: { ...marked.meta, fixture: bad } }, { allowFixture: true }), false, JSON.stringify(bad));
    assert.equal('fixture' in buildResearchResponse(run.answer, { ...options, fixture: bad }).meta, false, JSON.stringify(bad));
  }
  for (const extra of [{ fixture: true }, { demo: true }]) assert.equal(isValidResearchResponse({ ...base, ...extra }, { allowFixture: true }), false);
});

test("the shared cache never stores or serves a fixture-marked answer; only fixture mode's own memory cache does", async () => {
  const run = await getFixtureAnswer(QUERIES[0]);
  const marked = buildResearchResponse(run.answer, { requestId: 'r', elapsedMs: 5, answerSource: 'AI_ESTIMATE', fixture: true });
  const key = researchCacheKey(QUERIES[0]);
  const writes = [];
  const shared = createResearchCache({ redis: { get: async () => null, set: async (...args) => { writes.push(args); return 'OK'; } } });
  assert.equal(await shared.write(key, marked), false);
  assert.deepEqual(writes, []);
  const planted = JSON.stringify({ key, contractVersion: marked.contractVersion, response: marked });
  assert.equal(await createResearchCache({ redis: { get: async () => planted } }).read(key), null);
  const memory = createMemoryStore();
  const own = createResearchCache({ redis: memory, allowFixture: true });
  assert.equal(await own.write(key, marked), true);
  assert.equal((await own.read(key)).meta.fixture, true);
  assert.equal(await createResearchCache({ redis: memory }).read(key), null, 'the same entry is a miss for a non-fixture cache');
});

test('Production-shaped traffic through the shipped default handler never sees the indicator', async () => {
  const names = ['ITEMASSIST_RESEARCH_ENABLED', 'ITEMASSIST_REPLACEMENT_API_TOKEN', FIXTURE_MODE_ENV, 'VERCEL_ENV', 'GEMINI_API_KEY'];
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    Object.assign(process.env, { ITEMASSIST_RESEARCH_ENABLED: 'true', ITEMASSIST_REPLACEMENT_API_TOKEN: TOKEN, VERCEL_ENV: 'production' });
    delete process.env[FIXTURE_MODE_ENV];
    delete process.env.GEMINI_API_KEY;
    const res = await call(defaultHandler);
    assert.equal(hasFixtureKey(res.body), false);
    assert.equal(res.headers['X-ItemAssist-Research-Mode'], undefined);
    process.env[FIXTURE_MODE_ENV] = 'preview';
    const refused = await call(defaultHandler);
    assert.equal(refused.statusCode, 503);
    assert.equal(hasFixtureKey(refused.body), false);
  } finally { names.forEach((name) => { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; }); }
});
