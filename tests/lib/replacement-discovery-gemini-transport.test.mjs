import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeminiGroundedTransport } from '../../lib/replacement-discovery/providers/gemini-grounded-transport.js';
import { createGroundedResearchProvider } from '../../lib/replacement-discovery/providers/grounded-research-provider.js';
import { createAttemptRecorder, runWithAttemptRecorder } from '../../lib/smart-lookup/provider-attempts.js';
import { createDeadline } from '../../lib/smart-lookup/deadline.js';
import { recommendWithResearch } from '../../lib/replacement-discovery/live-recommend.js';
import { tvCandidate } from '../fixtures/replacement-discovery/grounded-tv-research.mjs';

const KEY = 'test-key-DO-NOT-LEAK';
const payload = { candidates: [tvCandidate({ model: 'QN55Q80D' })] };
const grounded = (text, extra = {}) => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  json: async () => ({
    candidates: [{ content: { parts: [{ text }] }, groundingMetadata: { groundingChunks: [{ web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc', title: 'samsung.com' } }], webSearchQueries: ['q'] } }],
    usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 80, thoughtsTokenCount: 5 },
    ...extra,
  }),
});
const fenced = (value) => grounded(`\`\`\`json\n${JSON.stringify(value)}\n\`\`\``);
const failure = (status, headers = {}) => ({ ok: false, status, headers: { get: (name) => headers[name] ?? null }, json: async () => ({}) });

function harness({ fetchImpl, budgetGate = async () => ({ allowed: true }), cooldown = null, apiKey = KEY } = {}) {
  const fetchCalls = [];
  const gateCalls = [];
  const fetchSpy = async (url, init) => { fetchCalls.push({ url, init }); return fetchImpl(url, init); };
  const transport = createGeminiGroundedTransport({ apiKey, fetchImpl: fetchSpy, budgetGate: async (ctx) => { gateCalls.push(ctx); return budgetGate(ctx); }, cooldown, env: {} });
  const call = () => transport({ prompt: 'PROMPT', stage: 'replacement-research-candidates', deadline: createDeadline({ totalMs: 5000 }), signal: undefined });
  return { transport, fetchCalls, gateCalls, call };
}

test('a budget gate is mandatory: live research cannot be constructed without one', () => {
  assert.throws(() => createGeminiGroundedTransport({ apiKey: KEY, fetchImpl: async () => grounded('{}') }), /budgetGate is required/);
});

test('sends one grounded request with the key only in a header and parses fenced JSON plus grounding sources', async () => {
  const { call, fetchCalls, gateCalls } = harness({ fetchImpl: async () => fenced(payload) });
  const result = await call();
  assert.equal(fetchCalls.length, 1);
  assert.equal(gateCalls.length, 1);
  const { url, init } = fetchCalls[0];
  assert.match(url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.8-flash:generateContent$/);
  assert.equal(init.headers['x-goog-api-key'], KEY);
  assert.ok(!url.includes(KEY) && !init.body.includes(KEY));
  const body = JSON.parse(init.body);
  assert.deepEqual(body.tools, [{ google_search: {} }]);
  assert.equal(body.generationConfig.responseMimeType, undefined);
  assert.equal(body.generationConfig.temperature, undefined);
  assert.equal(body.contents[0].parts[0].text, 'PROMPT');
  assert.equal(result.parsed.candidates[0].model, 'QN55Q80D');
  assert.deepEqual(result.grounding.sources.map((source) => source.domain), ['samsung.com']);
});

test('nothing is sent when the key is missing, the budget is denied, or the Gemini cooldown is active', async () => {
  const missing = harness({ fetchImpl: async () => fenced(payload), apiKey: '' });
  await assert.rejects(missing.call(), { code: 'PROVIDER_NOT_CONFIGURED' });
  assert.deepEqual([missing.fetchCalls.length, missing.gateCalls.length], [0, 0]);
  const denied = harness({ fetchImpl: async () => fenced(payload), budgetGate: async () => ({ allowed: false }) });
  await assert.rejects(denied.call(), { code: 'LIVE_BUDGET_DENIED' });
  assert.equal(denied.fetchCalls.length, 0);
  const falsy = harness({ fetchImpl: async () => fenced(payload), budgetGate: async () => undefined });
  await assert.rejects(falsy.call(), { code: 'LIVE_BUDGET_DENIED' });
  const cooling = harness({ fetchImpl: async () => fenced(payload), cooldown: { isActive: async () => true, mark: async () => 0 } });
  await assert.rejects(cooling.call(), { code: 'GEMINI_COOLDOWN_ACTIVE' });
  assert.deepEqual([cooling.fetchCalls.length, cooling.gateCalls.length], [0, 0]);
});

test('a 429 ends Gemini use: no retry, cooldown is marked with the Retry-After hint', async () => {
  const marks = [];
  const cooldown = { isActive: async () => false, mark: async (...args) => { marks.push(args[2]); return 30; } };
  const { call, fetchCalls } = harness({ fetchImpl: async () => failure(429, { 'retry-after': '30' }), cooldown });
  await assert.rejects(call(), (error) => error.code === 'PROVIDER_RATE_LIMIT' && error.status === 429 && error.retryAfterSeconds === 30);
  assert.equal(fetchCalls.length, 1);
  assert.deepEqual(marks, [{ retryAfterSeconds: 30 }]);
});

test('a cooldown write failure never masks the rate-limit error', async () => {
  const cooldown = { isActive: async () => false, mark: async () => { throw new Error('redis down'); } };
  const { call } = harness({ fetchImpl: async () => failure(429), cooldown });
  await assert.rejects(call(), { code: 'PROVIDER_RATE_LIMIT' });
});

test('HTTP and content failures map to stable codes', async () => {
  const codeFor = async (fetchImpl) => harness({ fetchImpl }).call().then(() => null, (error) => error.code);
  assert.equal(await codeFor(async () => failure(503)), 'PROVIDER_5XX');
  assert.equal(await codeFor(async () => failure(400)), 'PROVIDER_HTTP_ERROR');
  assert.equal(await codeFor(async () => grounded('not json at all')), 'PROVIDER_MALFORMED_JSON');
  assert.equal(await codeFor(async () => grounded('')), 'PROVIDER_EMPTY');
  assert.equal(await codeFor(async () => grounded('{"candidates": [oops]}')), 'PROVIDER_MALFORMED_JSON');
  assert.equal(await codeFor(async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => { throw new Error('bad'); } })), 'PROVIDER_RESPONSE_INVALID');
});

test('network errors never echo the key or request details', async () => {
  const { call } = harness({ fetchImpl: async () => { throw new Error(`connect ECONNRESET while sending ${KEY}`); } });
  await assert.rejects(call(), (error) => error.code === 'PROVIDER_NETWORK_ERROR' && !error.message.includes(KEY) && !JSON.stringify(error).includes(KEY));
});

test('real paid attempts are recorded through the shared attempt recorder, and unsent ones are not', async () => {
  const recorder = createAttemptRecorder({ route: 'replacement-research-test', logger: { info() {} } });
  const ok = harness({ fetchImpl: async () => fenced(payload) });
  await runWithAttemptRecorder(recorder, () => ok.call());
  const limited = harness({ fetchImpl: async () => failure(429) });
  await runWithAttemptRecorder(recorder, () => limited.call().catch(() => null));
  const blocked = harness({ fetchImpl: async () => fenced(payload), budgetGate: async () => ({ allowed: false }) });
  await runWithAttemptRecorder(recorder, () => blocked.call().catch(() => null));
  assert.deepEqual(recorder.attempts.map((attempt) => [attempt.provider, attempt.providerStatus, attempt.httpStatus]), [['gemini', 'ok', 200], ['gemini', 'rate_limited', 429]]);
  assert.deepEqual([recorder.attempts[0].inputTokens, recorder.attempts[0].outputTokens, recorder.attempts[0].thinkingTokens], [120, 80, 5]);
});

test('provider + Gemini transport end to end with a fake fetch: one request per job and candidates reach replacement-core', async () => {
  const responses = [
    fenced({ original: { canonicalModel: { value: null, sources: [] }, possibleModels: [], facts: { resolution: { value: '4K', sources: ['samsung.com'], subjectModel: 'QN55Q80' } }, tier: null } }),
    fenced({ candidates: [tvCandidate({ model: 'QN55Q80D' })] }),
  ];
  const { transport, fetchCalls, gateCalls } = harness({ fetchImpl: async () => responses.shift() });
  const researchProvider = createGroundedResearchProvider({ transport });
  const result = await recommendWithResearch({ query: 'Samsung QN55Q80', researchProvider });
  assert.equal(fetchCalls.length, 2);
  assert.deepEqual(gateCalls.map((ctx) => ctx.stage), ['replacement-research-original', 'replacement-research-candidates']);
  assert.equal(result.primaryRecommendation.candidate.identity.facts.model.value, 'QN55Q80D');
  assert.equal(result.originalInterpretation.normalizedOriginal.facts.resolution.value, '4K');
});
