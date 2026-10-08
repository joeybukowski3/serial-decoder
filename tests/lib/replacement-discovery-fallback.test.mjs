import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendWithResearch } from '../../lib/replacement-discovery/live-recommend.js';
import { createGroundedResearchProvider } from '../../lib/replacement-discovery/providers/grounded-research-provider.js';
import { createFixtureProvider } from '../../lib/replacement-discovery/providers/fixture-provider.js';
import { createDeadline } from '../../lib/smart-lookup/deadline.js';
import { createMockTransport, providerError } from '../fixtures/replacement-discovery/mock-transport.mjs';
import { refrigeratorPool, televisionPool } from '../fixtures/replacement-discovery/candidate-pools.mjs';
import * as tv from '../fixtures/replacement-discovery/grounded-tv-research.mjs';
import * as fridge from '../fixtures/replacement-discovery/grounded-refrigerator-research.mjs';
import { badPayloads, partiallyValidCandidates } from '../fixtures/replacement-discovery/malformed-research.mjs';

const fallbackFridge = () => createFixtureProvider(refrigeratorPool);
const liveFridge = (candidates) => createGroundedResearchProvider({ transport: createMockTransport({ candidates, grounding: fridge.fridgeGrounding }) });
const broadFridge = (researchProvider, extra = {}) => recommendWithResearch({ query: 'LG side by side refrigerator', researchProvider, fallbackProvider: fallbackFridge(), ...extra });
const primaryId = (result) => result.primaryRecommendation?.candidate.candidateId;

test('provider timeout falls back to the baseline and still recommends', async () => {
  const result = await broadFridge(liveFridge(providerError('PROVIDER_TIMEOUT')));
  assert.equal(primaryId(result), 'fridge-lg-sbs-25');
  assert.equal(result.research.candidateSource, 'FALLBACK_BASELINE');
  assert.deepEqual(result.reasonCodes.slice(0, 2), ['LIVE_RESEARCH_UNAVAILABLE', 'FALLBACK_BASELINE_USED']);
  assert.deepEqual(result.research.candidateResearch, { status: 'FAILED', errorCode: 'PROVIDER_TIMEOUT', receivedCount: 0, acceptedCount: 0 });
  assert.ok(result.alternatives.length <= 2);
});

test('provider exceptions degrade safely and never leak error text', async () => {
  const leaky = Object.assign(new Error('request failed for key=sk-SECRET123 at https://internal.example/x'), {});
  const result = await broadFridge(liveFridge(leaky));
  assert.equal(primaryId(result), 'fridge-lg-sbs-25');
  assert.equal(result.research.candidateResearch.errorCode, 'PROVIDER_ERROR');
  assert.ok(!JSON.stringify(result).includes('SECRET123'));
  assert.ok(!JSON.stringify(result).includes('internal.example'));
});

test('an empty grounded result falls back with its own reason code', async () => {
  const result = await broadFridge(liveFridge({ candidates: [] }));
  assert.deepEqual(result.reasonCodes.slice(0, 2), ['LIVE_DISCOVERY_EMPTY', 'FALLBACK_BASELINE_USED']);
  assert.equal(primaryId(result), 'fridge-lg-sbs-25');
});

test('invalid JSON shape or schema falls back', async () => {
  for (const payload of [badPayloads.notObject, badPayloads.candidatesNotArray]) {
    const result = await broadFridge(liveFridge(payload));
    assert.equal(result.research.candidateResearch.status, 'INVALID', JSON.stringify(payload));
    assert.ok(result.reasonCodes.includes('LIVE_RESEARCH_UNAVAILABLE'));
    assert.equal(primaryId(result), 'fridge-lg-sbs-25');
  }
  const unparseable = await broadFridge(liveFridge(providerError('PROVIDER_MALFORMED_JSON')));
  assert.equal(unparseable.research.candidateResearch.errorCode, 'PROVIDER_MALFORMED_JSON');
  assert.equal(primaryId(unparseable), 'fridge-lg-sbs-25');
});

test('when every live candidate is invalid the baseline is used', async () => {
  const result = await broadFridge(liveFridge({ candidates: [{ brand: 'LG' }, 'junk', null] }));
  assert.equal(result.research.candidateResearch.status, 'EMPTY');
  assert.ok(result.reasonCodes.includes('FALLBACK_BASELINE_USED'));
  assert.equal(result.rejectedSummary.filter((item) => ['MISSING_CATEGORY', 'MALFORMED_ENTRY'].includes(item.reasonCode)).length, 3);
  assert.equal(primaryId(result), 'fridge-lg-sbs-25');
});

test('no fallback configured: a failed provider yields an explicit no-candidate result, not an exception', async () => {
  const result = await recommendWithResearch({ query: 'LG side by side refrigerator', researchProvider: liveFridge(providerError('PROVIDER_5XX')) });
  assert.equal(result.primaryRecommendation, null);
  assert.deepEqual(result.reasonCodes, ['LIVE_RESEARCH_UNAVAILABLE', 'NO_CANDIDATES_DISCOVERED']);
  assert.ok(result.refinementSuggestions.length > 0);
  const noProvider = await recommendWithResearch({ query: 'LG side by side refrigerator', fallbackProvider: fallbackFridge() });
  assert.equal(noProvider.research.providerCalls, 0);
  assert.equal(primaryId(noProvider), 'fridge-lg-sbs-25');
  assert.ok(noProvider.reasonCodes.includes('LIVE_RESEARCH_UNAVAILABLE'));
});

test('original research failing (non rate-limit) does not block candidate discovery', async () => {
  const transport = createMockTransport({ original: providerError('PROVIDER_TIMEOUT'), candidates: tv.tvCandidatesResearch, grounding: tv.tvGrounding });
  const result = await recommendWithResearch({ query: 'Samsung QN55Q80', researchProvider: createGroundedResearchProvider({ transport }), fallbackProvider: createFixtureProvider(televisionPool) });
  assert.equal(transport.calls.length, 2);
  assert.deepEqual(result.research.originalResearch, { status: 'FAILED', errorCode: 'PROVIDER_TIMEOUT' });
  assert.ok(result.reasonCodes.includes('ORIGINAL_RESEARCH_UNAVAILABLE'));
  assert.equal(result.research.candidateSource, 'LIVE_RESEARCH');
  assert.equal(result.primaryRecommendation.candidate.identity.facts.model.value, 'QN55Q80D');
  assert.equal(result.originalInterpretation.normalizedOriginal.facts.resolution, undefined);
  assert.equal(result.originalInterpretation.normalizedOriginal.facts.tier.status, 'ASSUMED');
});

test('a partly valid payload is salvaged: bad entries rejected with reasons, the good one recommended, no fallback', async () => {
  const transport = createMockTransport({ original: tv.tvOriginalResearch, candidates: partiallyValidCandidates, grounding: tv.tvGrounding });
  const result = await recommendWithResearch({ query: 'Samsung QN55Q80', researchProvider: createGroundedResearchProvider({ transport }), fallbackProvider: createFixtureProvider(televisionPool) });
  assert.equal(result.primaryRecommendation.candidate.identity.facts.model.value, 'QN55Q80D');
  assert.equal(result.research.candidateSource, 'LIVE_RESEARCH');
  assert.deepEqual(result.research.candidateResearch, { status: 'OK', errorCode: null, receivedCount: 7, acceptedCount: 1 });
  assert.deepEqual(result.rejectedSummary.map((item) => item.reasonCode).sort(), ['MALFORMED_ENTRY', 'MALFORMED_ENTRY', 'MISSING_BRAND', 'MISSING_MODEL', 'VAGUE_MODEL', 'WRONG_CATEGORY']);
  assert.deepEqual(result.reasonCodes, ['LIVE_DISCOVERY_PARTIAL']);
  assert.ok(!result.reasonCodes.includes('FALLBACK_BASELINE_USED'));
});

test('invalid individual facts are dropped with warnings while the candidate survives', async () => {
  const dirty = { ...tv.currentQled55, facts: { ...tv.currentQled55.facts, refreshHz: { value: 'fast', sources: ['samsung.com'] }, screenSizeIn: { value: 5500, sources: ['samsung.com'], subjectModel: 'QN55Q80D' } } };
  const transport = createMockTransport({ candidates: { candidates: [dirty] }, grounding: tv.tvGrounding });
  const result = await recommendWithResearch({ query: '55 Samsung QLED TV', researchProvider: createGroundedResearchProvider({ transport }) });
  const facts = result.primaryRecommendation.candidate.identity.facts;
  assert.ok(!('refreshHz' in facts) && !('screenSizeIn' in facts));
  assert.deepEqual(result.research.warnings.filter((warning) => warning.code === 'FACT_INVALID').map((warning) => warning.key).sort(), ['refreshHz', 'screenSizeIn']);
  assert.ok(result.primaryRecommendation);
});

test('a hung provider is cut off by the deadline and the baseline is returned', async () => {
  const hung = createGroundedResearchProvider({ transport: () => new Promise(() => {}) });
  const started = Date.now();
  const result = await recommendWithResearch({
    query: 'Samsung QN55Q80', researchProvider: hung, fallbackProvider: createFixtureProvider(televisionPool), deadline: createDeadline({ totalMs: 700 }),
  });
  const elapsed = Date.now() - started;
  // The first (original) call is genuinely cut off by its budget; the second finds the deadline exhausted.
  assert.ok(elapsed >= 200 && elapsed < 1500, `elapsed ${elapsed}ms: the hung call must be cut off by the deadline, not skipped`);
  assert.equal(result.research.originalResearch.errorCode, 'STAGE_TIMEOUT');
  assert.equal(result.research.candidateResearch.errorCode, 'STAGE_TIMEOUT');
  assert.ok(result.reasonCodes.includes('FALLBACK_BASELINE_USED'));
  assert.ok(result.primaryRecommendation);
});

test('a misbehaving injected provider object cannot crash the pipeline', async () => {
  const rogue = { researchOriginal() { throw new Error('boom'); }, researchCandidates() { throw providerError('PROVIDER_5XX'); } };
  const result = await recommendWithResearch({ query: 'Samsung QN55Q80', researchProvider: rogue, fallbackProvider: createFixtureProvider(televisionPool) });
  assert.equal(result.research.originalResearch.status, 'FAILED');
  assert.ok(result.reasonCodes.includes('FALLBACK_BASELINE_USED'));
  assert.ok(result.primaryRecommendation);
});

test('a provider rate limit, cooldown or budget denial on the original call ends paid research for the request', async () => {
  for (const code of ['PROVIDER_RATE_LIMIT', 'GEMINI_COOLDOWN_ACTIVE', 'LIVE_BUDGET_DENIED']) {
    const transport = createMockTransport({ original: providerError(code), candidates: tv.tvCandidatesResearch, grounding: tv.tvGrounding });
    const result = await recommendWithResearch({ query: 'Samsung QN55Q80', researchProvider: createGroundedResearchProvider({ transport }), fallbackProvider: createFixtureProvider(televisionPool) });
    assert.deepEqual(transport.calls.map((call) => call.job), ['original'], code);
    assert.equal(result.research.providerCalls, 1);
    assert.equal(result.research.candidateResearch.errorCode, code);
    assert.deepEqual(result.reasonCodes.slice(0, 3), ['ORIGINAL_RESEARCH_UNAVAILABLE', 'LIVE_RESEARCH_UNAVAILABLE', 'FALLBACK_BASELINE_USED']);
    assert.ok(result.primaryRecommendation);
  }
});

test('an invalid discovery limit is rejected before any paid provider call', async () => {
  const transport = createMockTransport({ original: tv.tvOriginalResearch, candidates: tv.tvCandidatesResearch, grounding: tv.tvGrounding });
  const researchProvider = createGroundedResearchProvider({ transport });
  for (const discoveryLimit of [0, 7, 2.5, '3', NaN]) {
    await assert.rejects(recommendWithResearch({ query: 'Samsung QN55Q80', researchProvider, discoveryLimit }), RangeError);
  }
  assert.equal(transport.calls.length, 0);
});

test('malformed provider return shapes degrade to the baseline instead of throwing', async () => {
  const shapes = [
    { researchOriginal: async () => ({ status: 'OK' }), researchCandidates: async () => undefined },
    { researchOriginal: async () => undefined, researchCandidates: async () => ({ status: 'OK' }) },
    { researchOriginal: async () => ({ status: 'OK', enrichment: { facts: null } }), researchCandidates: async () => ({ status: 'NOPE', drafts: 'x' }) },
    { researchOriginal: async () => 7, researchCandidates: async () => ({ status: 'OK', drafts: null, evidence: 5, warnings: {}, rejected: 'x' }) },
  ];
  for (const rogue of shapes) {
    const result = await recommendWithResearch({ query: 'Samsung QN55Q80', researchProvider: rogue, fallbackProvider: createFixtureProvider(televisionPool) });
    assert.ok(result.primaryRecommendation, JSON.stringify(result.research.candidateResearch));
    assert.equal(result.research.originalResearch.status, 'FAILED');
  }
});

test('a throwing fallback provider yields an explicit no-candidate result, not an exception', async () => {
  const fallbackProvider = { async discoverCandidates() { throw new Error('boom'); } };
  const result = await recommendWithResearch({ query: 'LG side by side refrigerator', researchProvider: liveFridge(providerError('PROVIDER_5XX')), fallbackProvider });
  assert.equal(result.primaryRecommendation, null);
  assert.ok(result.reasonCodes.includes('NO_CANDIDATES_DISCOVERED'));
  assert.ok(!result.reasonCodes.includes('FALLBACK_BASELINE_USED'));
  assert.equal(result.research.candidateSource, 'NONE');
});

test('live drafts that all fail final validation still reach the fallback', async () => {
  const researchProvider = {
    researchOriginal: async () => ({ status: 'OK', enrichment: { facts: {}, evidence: [] }, evidence: [], warnings: [] }),
    researchCandidates: async () => ({ status: 'OK', errorCode: null, drafts: [{ candidateId: 'bad-1' }, { candidateId: 'bad-2', category: 'television', facts: { x: { value: 1 } } }], evidence: [], rejected: [], warnings: [], receivedCount: 2 }),
  };
  const result = await recommendWithResearch({ query: 'Samsung QN55Q80', researchProvider, fallbackProvider: createFixtureProvider(televisionPool) });
  assert.equal(result.research.candidateSource, 'FALLBACK_BASELINE');
  assert.ok(result.reasonCodes.includes('LIVE_DISCOVERY_EMPTY') && result.reasonCodes.includes('FALLBACK_BASELINE_USED'));
  assert.ok(result.primaryRecommendation);
  const noFallback = await recommendWithResearch({ query: 'Samsung QN55Q80', researchProvider });
  assert.equal(noFallback.primaryRecommendation, null);
  assert.ok(noFallback.reasonCodes.includes('NO_CANDIDATES_DISCOVERED'));
});
