import test from 'node:test';
import assert from 'node:assert/strict';
import { PHASE3_GEMINI_MODEL, createGeminiGroundedTransport } from '../../lib/replacement-discovery/providers/gemini-grounded-transport.js';
import { createGroundedResearchProvider } from '../../lib/replacement-discovery/providers/grounded-research-provider.js';
import { createFixtureProvider } from '../../lib/replacement-discovery/providers/fixture-provider.js';
import { recommendWithResearch } from '../../lib/replacement-discovery/live-recommend.js';
import { createDeadline } from '../../lib/smart-lookup/deadline.js';
import { createMockTransport, providerError } from '../fixtures/replacement-discovery/mock-transport.mjs';
import { televisionPool } from '../fixtures/replacement-discovery/candidate-pools.mjs';
import * as tv from '../fixtures/replacement-discovery/grounded-tv-research.mjs';

const KEY = 'test-key-DO-NOT-LEAK';
const MARKER = 'SECRET-PROVIDER-TEXT-9931';
// The exact error captured from the first live smoke run (gemini-2.5-flash).
const LIVE_404_MESSAGE = 'This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash for the latest features and improvements.';

const errorResponse = (status, googleStatus, message, extra = {}) => ({ ok: false, status, headers: { get: () => null }, json: async () => ({ error: { code: status, message, status: googleStatus, ...extra } }) });
const okResponse = (payload) => ({
  ok: true, status: 200, headers: { get: () => null },
  json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] }, groundingMetadata: { groundingChunks: tv.tvGrounding.sources.map((s) => ({ web: { uri: s.uri, title: s.title } })) } }] }),
});

function transportWith(responder) {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return responder(calls.length, JSON.parse(init.body)); };
  const transport = createGeminiGroundedTransport({ apiKey: KEY, env: {}, fetchImpl, budgetGate: async () => ({ allowed: true }) });
  return { transport, calls };
}
const callOnce = (responder) => {
  const { transport } = transportWith(responder);
  return transport({ prompt: 'P', stage: 'replacement-research-original', deadline: createDeadline({ totalMs: 5000 }) }).then(() => null, (error) => error);
};

test('Phase 3 uses its own model constant, not the shared Smart Lookup one', async () => {
  assert.equal(PHASE3_GEMINI_MODEL, 'gemini-3.8-flash');
  const { transport, calls } = transportWith(() => okResponse({ candidates: [] }));
  await transport({ prompt: 'P', stage: 'x', deadline: createDeadline({ totalMs: 5000 }) });
  assert.match(calls[0].url, /\/models\/gemini-3\.8-flash:generateContent$/);
});

test('request body follows the documented generateContent grounding shape: google_search, never google_search_retrieval', async () => {
  const { transport, calls } = transportWith(() => okResponse({ candidates: [] }));
  await transport({ prompt: 'P', stage: 'x', deadline: createDeadline({ totalMs: 5000 }) });
  const { body } = calls[0];
  assert.deepEqual(body.tools, [{ google_search: {} }]);
  assert.deepEqual(Object.keys(body).sort(), ['contents', 'generationConfig', 'tools']);
  assert.ok(!JSON.stringify(body).includes('google_search_retrieval'));
  assert.deepEqual(body.contents, [{ parts: [{ text: 'P' }] }]);
});

test('model-unavailable is recognised narrowly: 404 NOT_FOUND about the model, or 400 INVALID_ARGUMENT unsupported model', async () => {
  const terminal = [
    errorResponse(404, 'NOT_FOUND', LIVE_404_MESSAGE),
    errorResponse(404, 'NOT_FOUND', 'models/gemini-9-flash is not found for API version v1beta, or is not supported for generateContent.'),
    errorResponse(404, 'NOT_FOUND', 'The model gemini-x does not exist.'.replace('does not exist', 'is not available')),
    errorResponse(400, 'INVALID_ARGUMENT', 'Google Search tool is not supported for this model.'),
    errorResponse(400, 'INVALID_ARGUMENT', 'Unsupported model: gemini-x'),
  ];
  for (const response of terminal) {
    const error = await callOnce(() => response);
    assert.equal(error?.code, 'PROVIDER_MODEL_UNAVAILABLE', response.json && JSON.stringify(await response.json()));
    assert.equal(error.status, response.status);
  }
});

test('every other failure keeps its ordinary meaning: a generic 404/400/403/500 is NOT a model failure', async () => {
  const ordinary = [
    [errorResponse(404, 'NOT_FOUND', 'Requested entity was not found.'), 'PROVIDER_HTTP_ERROR'],
    [errorResponse(404, 'SOMETHING_ELSE', LIVE_404_MESSAGE), 'PROVIDER_HTTP_ERROR'],
    [errorResponse(400, 'INVALID_ARGUMENT', 'Request contains an invalid argument.'), 'PROVIDER_HTTP_ERROR'],
    [errorResponse(400, 'FAILED_PRECONDITION', 'Unsupported model'), 'PROVIDER_HTTP_ERROR'],
    [errorResponse(403, 'PERMISSION_DENIED', LIVE_404_MESSAGE), 'PROVIDER_HTTP_ERROR'],
    [errorResponse(401, 'UNAUTHENTICATED', 'API key not valid. model not found'), 'PROVIDER_HTTP_ERROR'],
    [errorResponse(500, 'INTERNAL', 'model not available'), 'PROVIDER_5XX'],
    [errorResponse(503, 'UNAVAILABLE', 'The model is overloaded.'), 'PROVIDER_5XX'],
    [{ ok: false, status: 404, headers: { get: () => null }, json: async () => { throw new Error('not json'); } }, 'PROVIDER_HTTP_ERROR'],
    [{ ok: false, status: 404, headers: { get: () => null }, json: async () => ({ error: 'model not found' }) }, 'PROVIDER_HTTP_ERROR'],
  ];
  for (const [response, code] of ordinary) assert.equal((await callOnce(() => response))?.code, code);
  // Even with Google's INVALID_ARGUMENT status and model wording, only HTTP 400 and 404 can be a model failure.
  for (const status of [401, 403, 429, 500]) assert.notEqual((await callOnce(() => errorResponse(status, 'INVALID_ARGUMENT', 'Unsupported model')))?.code, 'PROVIDER_MODEL_UNAVAILABLE', String(status));
  assert.equal((await callOnce(() => errorResponse(429, 'RESOURCE_EXHAUSTED', LIVE_404_MESSAGE)))?.code, 'PROVIDER_RATE_LIMIT');
});

test('provider error text is used only to classify and never appears in the thrown error', async () => {
  const error = await callOnce(() => errorResponse(404, 'NOT_FOUND', `models/${MARKER} is no longer available to new users`));
  assert.equal(error.code, 'PROVIDER_MODEL_UNAVAILABLE');
  assert.ok(!JSON.stringify(error).includes(MARKER) && !String(error.message).includes(MARKER) && !String(error.stack).includes(MARKER));
  assert.equal(error.message, 'Gemini model is not available');
});

// ---------------------------------------------------------------- orchestration: exactly how many paid requests are sent
function pipeline(responder, extra = {}) {
  const { transport, calls } = transportWith(responder);
  const researchProvider = createGroundedResearchProvider({ transport });
  return { calls, run: () => recommendWithResearch({ query: 'Samsung QN55Q80C', researchProvider, ...extra }) };
}
const jobOf = (body) => (body.contents[0].parts[0].text.includes('product research on ONE existing') ? 'original' : 'candidates');

test('A. Job A model-unavailable: exactly 1 request, Job B never sent, sanitized reason code, no provider text in the result', async () => {
  const { calls, run } = pipeline(() => errorResponse(404, 'NOT_FOUND', `${MARKER}: ${LIVE_404_MESSAGE}`));
  const result = await run();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls.map((call) => jobOf(call.body)), ['original']);
  assert.equal(result.research.providerCalls, 1);
  assert.ok(result.reasonCodes.includes('PROVIDER_MODEL_UNAVAILABLE'));
  assert.deepEqual(result.reasonCodes.slice(0, 3), ['ORIGINAL_RESEARCH_UNAVAILABLE', 'LIVE_RESEARCH_UNAVAILABLE', 'PROVIDER_MODEL_UNAVAILABLE']);
  assert.deepEqual(result.research.originalResearch, { status: 'FAILED', errorCode: 'PROVIDER_MODEL_UNAVAILABLE' });
  assert.equal(result.research.candidateResearch.errorCode, 'PROVIDER_MODEL_UNAVAILABLE');
  assert.ok(!JSON.stringify(result).includes(MARKER) && !JSON.stringify(result).includes('gemini-2.5-flash'));
  assert.equal(result.primaryRecommendation, null);
});

test('A2. the stop still returns the baseline when a fallback exists (always-return is unchanged)', async () => {
  const { calls, run } = pipeline(() => errorResponse(404, 'NOT_FOUND', LIVE_404_MESSAGE), { fallbackProvider: createFixtureProvider(televisionPool) });
  const result = await run();
  assert.equal(calls.length, 1);
  assert.ok(result.reasonCodes.includes('PROVIDER_MODEL_UNAVAILABLE') && result.reasonCodes.includes('FALLBACK_BASELINE_USED'));
  assert.ok(result.primaryRecommendation);
});

test('A3. a model failure on Job B (after a successful Job A) is also reported with the same code and sends nothing further', async () => {
  const { calls, run } = pipeline((n) => (n === 1 ? okResponse(tv.tvOriginalResearchExact) : errorResponse(404, 'NOT_FOUND', LIVE_404_MESSAGE)));
  const result = await run();
  assert.equal(calls.length, 2);
  assert.ok(result.reasonCodes.includes('PROVIDER_MODEL_UNAVAILABLE'));
  assert.equal(result.research.originalResearch.status, 'OK');
});

test('B. a generic recoverable failure on Job A still lets Job B run, as designed', async () => {
  for (const response of [errorResponse(500, 'INTERNAL', 'boom'), errorResponse(404, 'NOT_FOUND', 'Requested entity was not found.'), errorResponse(400, 'INVALID_ARGUMENT', 'bad request')]) {
    const { calls, run } = pipeline((n) => (n === 1 ? response : okResponse(tv.tvCandidatesResearch)));
    const result = await run();
    assert.deepEqual(calls.map((call) => jobOf(call.body)), ['original', 'candidates'], String(response.status));
    assert.ok(!result.reasonCodes.includes('PROVIDER_MODEL_UNAVAILABLE'));
    assert.ok(result.reasonCodes.includes('ORIGINAL_RESEARCH_UNAVAILABLE'));
  }
});

test('C. 429 behaviour is unchanged: one request, Job B skipped, no model-unavailable code', async () => {
  const { calls, run } = pipeline(() => errorResponse(429, 'RESOURCE_EXHAUSTED', 'quota'));
  const result = await run();
  assert.equal(calls.length, 1);
  assert.ok(!result.reasonCodes.includes('PROVIDER_MODEL_UNAVAILABLE'));
  assert.equal(result.research.originalResearch.errorCode, 'PROVIDER_RATE_LIMIT');
});

test('D. timeouts and deadlines are unchanged: a hung call is cut off by the deadline (leaving no time for Job B), not treated as a model failure', async () => {
  const calls = [];
  const transport = createGeminiGroundedTransport({
    apiKey: KEY, env: {}, budgetGate: async () => ({ allowed: true }),
    fetchImpl: (url, init) => { calls.push(jobOf(JSON.parse(init.body))); return calls.length === 1 ? new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))) : Promise.resolve(okResponse(tv.tvCandidatesResearch)); },
  });
  const started = Date.now();
  const result = await recommendWithResearch({ query: 'Samsung QN55Q80C', researchProvider: createGroundedResearchProvider({ transport }), deadline: createDeadline({ totalMs: 700 }) });
  const elapsed = Date.now() - started;
  assert.ok(elapsed >= 200 && elapsed < 1500, `elapsed ${elapsed}ms`);
  assert.equal(result.research.originalResearch.errorCode, 'STAGE_TIMEOUT');
  assert.equal(result.research.candidateResearch.errorCode, 'STAGE_TIMEOUT');
  assert.deepEqual(calls, ['original'], 'the deadline is exhausted, so Job B is never sent (same as before this change)');
  assert.ok(!result.reasonCodes.includes('PROVIDER_MODEL_UNAVAILABLE'));
});

test('E. mock providers: only the model-unavailable CODE is terminal; other mock failures and fixture providers behave as before', async () => {
  const spec = (original) => ({ original, candidates: tv.tvCandidatesResearch, grounding: tv.tvGrounding });
  const stopped = createMockTransport(spec(providerError('PROVIDER_MODEL_UNAVAILABLE')));
  const stoppedResult = await recommendWithResearch({ query: 'Samsung QN55Q80C', researchProvider: createGroundedResearchProvider({ transport: stopped }) });
  assert.deepEqual(stopped.calls.map((call) => call.job), ['original']);
  assert.ok(stoppedResult.reasonCodes.includes('PROVIDER_MODEL_UNAVAILABLE'));
  for (const code of ['PROVIDER_HTTP_ERROR', 'PROVIDER_5XX', 'PROVIDER_TIMEOUT', 'PROVIDER_MALFORMED_JSON']) {
    const proceeding = createMockTransport(spec(providerError(code)));
    await recommendWithResearch({ query: 'Samsung QN55Q80C', researchProvider: createGroundedResearchProvider({ transport: proceeding }) });
    assert.deepEqual(proceeding.calls.map((call) => call.job), ['original', 'candidates'], code);
  }
  const fixtureOnly = await recommendWithResearch({ query: 'Samsung QN55Q80C', fallbackProvider: createFixtureProvider(televisionPool) });
  assert.equal(fixtureOnly.research.providerCalls, 0);
  assert.ok(fixtureOnly.primaryRecommendation);
  assert.ok(!fixtureOnly.reasonCodes.includes('PROVIDER_MODEL_UNAVAILABLE'));
});
