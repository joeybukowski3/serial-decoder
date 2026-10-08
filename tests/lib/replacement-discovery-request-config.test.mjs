import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { MAX_OUTPUT_TOKENS, PHASE3_GEMINI_MODEL, PHASE3_GENERATION_CONFIG, THINKING_LEVEL, createGeminiGroundedTransport } from '../../lib/replacement-discovery/providers/gemini-grounded-transport.js';
import { CALL_MAX_MS, CALL_RESERVE_MS, DEFAULT_RESEARCH_TOTAL_MS, MAX_RESEARCH_CALLS, createGroundedResearchProvider } from '../../lib/replacement-discovery/providers/grounded-research-provider.js';
import { recommendWithResearch } from '../../lib/replacement-discovery/live-recommend.js';
import { GEMINI_AGE_MODEL } from '../../lib/smart-lookup/provider.js';
import { createDeadline } from '../../lib/smart-lookup/deadline.js';
import * as tv from '../fixtures/replacement-discovery/grounded-tv-research.mjs';

const okBody = (payload) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] }, groundingMetadata: { groundingChunks: [] } }] });
const response = (status, body) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => body });

function harness(responder) {
  const requests = [];
  const fetchImpl = async (url, init) => { requests.push({ url, body: JSON.parse(init.body) }); return responder(requests.length, JSON.parse(init.body)); };
  const transport = createGeminiGroundedTransport({ apiKey: 'test-key-DO-NOT-LEAK', env: {}, fetchImpl, budgetGate: async () => ({ allowed: true }) });
  return { requests, transport };
}
const send = async (responder = () => response(200, okBody({ candidates: [] }))) => {
  const { requests, transport } = harness(responder);
  await transport({ prompt: 'P', stage: 'replacement-research-original', deadline: createDeadline({ totalMs: 5000 }) });
  return requests[0];
};

test('A/B. the request targets gemini-3.8-flash with the documented google_search grounding tool', async () => {
  const { url, body } = await send();
  assert.equal(PHASE3_GEMINI_MODEL, 'gemini-3.8-flash');
  assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
  assert.deepEqual(body.tools, [{ google_search: {} }]);
  assert.ok(!JSON.stringify(body).includes('google_search_retrieval'));
});

test('C/D. no sampling parameters are sent: temperature, topP and topK are all absent', async () => {
  const { body } = await send();
  for (const name of ['temperature', 'topP', 'topK', 'top_p', 'top_k']) {
    assert.ok(!(name in body.generationConfig) && !(name in body), name);
  }
  assert.ok(!JSON.stringify(body).includes('temperature'));
  assert.ok(!JSON.stringify(PHASE3_GENERATION_CONFIG).includes('temperature'));
});

test('E. thinking level is explicitly LOW at the documented generateContent path; no budget, no thought summaries', async () => {
  const { body } = await send();
  assert.equal(THINKING_LEVEL, 'low');
  assert.deepEqual(body.generationConfig.thinkingConfig, { thinkingLevel: 'low' });
  const text = JSON.stringify(body);
  for (const forbidden of ['thinkingBudget', 'thinking_budget', 'includeThoughts', 'include_thoughts', 'responseMimeType']) assert.ok(!text.includes(forbidden), forbidden);
});

test('F. maxOutputTokens is 8192 (thinking tokens share it), bounded and not removed', async () => {
  const { body } = await send();
  assert.equal(body.generationConfig.maxOutputTokens, 8192);
  assert.equal(MAX_OUTPUT_TOKENS, 8192);
  assert.deepEqual(Object.keys(body.generationConfig).sort(), ['maxOutputTokens', 'thinkingConfig']);
  assert.deepEqual(Object.keys(body).sort(), ['contents', 'generationConfig', 'tools']);
});

test('the request configuration is immutable shared state: a request cannot alter later ones', async () => {
  assert.ok(Object.isFrozen(PHASE3_GENERATION_CONFIG) && Object.isFrozen(PHASE3_GENERATION_CONFIG.thinkingConfig));
  const first = await send();
  first.body.generationConfig.maxOutputTokens = 1;
  assert.equal((await send()).body.generationConfig.maxOutputTokens, 8192);
});

test('G. Phase 3 per-call deadline is 25 seconds', () => {
  assert.equal(CALL_MAX_MS, 25000);
  assert.equal(CALL_RESERVE_MS, 350);
});

test('H. total Phase 3 live budget is at most 55 seconds and genuinely bounds BOTH jobs', async () => {
  assert.equal(DEFAULT_RESEARCH_TOTAL_MS, 55000);
  assert.ok(DEFAULT_RESEARCH_TOTAL_MS <= 55000);
  let clock = 0;
  const deadline = createDeadline({ totalMs: DEFAULT_RESEARCH_TOTAL_MS, now: () => clock });
  const budgets = [];
  for (let job = 0; job < 3; job += 1) {
    await deadline.run('research', ({ budgetMs }) => { budgets.push(budgetMs); clock += budgetMs; return null; }, { maxMs: CALL_MAX_MS, reserveMs: CALL_RESERVE_MS });
  }
  assert.deepEqual(budgets.slice(0, 2), [25000, 25000], 'both jobs can each use the full 25 s');
  assert.ok(budgets[0] + budgets[1] <= 55000);
  assert.ok(budgets[2] < CALL_MAX_MS && clock <= 55000, 'a third call would be squeezed by the 55 s total, never exceed it');
});

test('H2. the pipeline default deadline is the Phase 3 total, not the Smart Lookup one', async () => {
  const seen = [];
  const researchProvider = {
    researchOriginal: async ({ deadline }) => { seen.push(deadline.totalMs); return { status: 'FAILED', errorCode: 'PROVIDER_TIMEOUT', enrichment: null, evidence: [], warnings: [] }; },
    researchCandidates: async ({ deadline }) => { seen.push(deadline.totalMs); return { status: 'EMPTY', drafts: [], evidence: [], rejected: [], warnings: [], receivedCount: 0 }; },
  };
  await recommendWithResearch({ query: 'Samsung QN55Q80C', researchProvider });
  assert.deepEqual(seen, [55000, 55000]);
});

test('I/J. at most 2 requests and never a retry: persistent failures send exactly one request per job', async () => {
  assert.equal(MAX_RESEARCH_CALLS, 2);
  for (const failure of [response(500, { error: { status: 'INTERNAL', message: 'x' } }), response(404, { error: { status: 'NOT_FOUND', message: 'Requested entity was not found.' } }), response(200, { candidates: [{ content: { parts: [{ text: 'not json' }] } }] })]) {
    const { requests, transport } = harness(() => failure);
    await recommendWithResearch({ query: 'Samsung QN55Q80C', researchProvider: createGroundedResearchProvider({ transport }) });
    assert.equal(requests.length, 2, String(failure.status));
  }
  let allowed = 0;
  const gated = createGeminiGroundedTransport({ apiKey: 'k'.repeat(24), env: {}, fetchImpl: async () => response(200, okBody({ candidates: [] })), budgetGate: async () => ({ allowed: (allowed += 1) <= MAX_RESEARCH_CALLS }) });
  const deadline = createDeadline({ totalMs: 5000 });
  const outcomes = [];
  for (let i = 0; i < 3; i += 1) outcomes.push(await gated({ prompt: 'P', stage: 's', deadline }).then(() => 'ok', (e) => e.code));
  assert.deepEqual(outcomes, ['ok', 'ok', 'LIVE_BUDGET_DENIED']);
});

test('K. existing Smart Lookup timeouts, model and production files are unchanged', () => {
  assert.equal(createDeadline().totalMs, 8500, 'Smart Lookup default route deadline');
  assert.equal(GEMINI_AGE_MODEL, 'gemini-2.5-flash', 'shared Smart Lookup model constant');
  assert.notEqual(PHASE3_GEMINI_MODEL, GEMINI_AGE_MODEL);
  let diff;
  try { diff = execFileSync('git', ['status', '--porcelain', '--', 'lib/smart-lookup', 'api', 'vercel.json', 'data'], { encoding: 'utf8', cwd: new URL('../../', import.meta.url) }); } catch (_) { return; }
  assert.equal(diff.trim(), '', 'no production file may change for Phase 3');
});

test('L. a model-unavailable error is still terminal after Job A: one request, no Job B', async () => {
  const { requests, transport } = harness(() => response(404, { error: { code: 404, status: 'NOT_FOUND', message: 'This model models/x is no longer available to new users.' } }));
  const result = await recommendWithResearch({ query: 'Samsung QN55Q80C', researchProvider: createGroundedResearchProvider({ transport }) });
  assert.equal(requests.length, 1);
  assert.ok(result.reasonCodes.includes('PROVIDER_MODEL_UNAVAILABLE'));
});

test('M. a 429 is unchanged: one request, Job B skipped', async () => {
  const { requests, transport } = harness(() => response(429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'quota' } }));
  const result = await recommendWithResearch({ query: 'Samsung QN55Q80C', researchProvider: createGroundedResearchProvider({ transport }) });
  assert.equal(requests.length, 1);
  assert.equal(result.research.originalResearch.errorCode, 'PROVIDER_RATE_LIMIT');
  assert.ok(!result.reasonCodes.includes('PROVIDER_MODEL_UNAVAILABLE'));
});

test('a normal two-job run still completes within the same bounds with the new request settings', async () => {
  const grounding = tv.tvGrounding.sources.map((s) => ({ web: { uri: s.uri, title: s.title } }));
  const withGrounding = (payload) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] }, groundingMetadata: { groundingChunks: grounding } }] });
  const { requests, transport } = harness((n) => response(200, withGrounding(n === 1 ? tv.tvOriginalResearchExact : tv.tvCandidatesResearch)));
  const result = await recommendWithResearch({ query: 'Samsung QN55Q80C', researchProvider: createGroundedResearchProvider({ transport }) });
  assert.equal(requests.length, 2);
  assert.ok(requests.every((r) => r.body.generationConfig.maxOutputTokens === 8192 && r.body.generationConfig.thinkingConfig.thinkingLevel === 'low' && !('temperature' in r.body.generationConfig)));
  assert.equal(result.primaryRecommendation.classification, 'LKQ');
});
