import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResearchBrief, validateResearchBrief } from '../../lib/replacement-brief/index.js';
import { createDeadline } from '../../lib/smart-lookup/deadline.js';
import { createBriefTransport, NOW } from '../fixtures/replacement-brief/brief-transport.mjs';
import { makeGrounding, providerError } from '../fixtures/replacement-discovery/mock-transport.mjs';
import * as tv from '../fixtures/replacement-discovery/grounded-tv-research.mjs';
import * as fridge from '../fixtures/replacement-discovery/grounded-refrigerator-research.mjs';

// All data comes from the existing illustrative mock fixtures. No network, no credentials.
const run = async (spec, query, extra = {}) => {
  const transport = createBriefTransport(spec);
  const brief = await buildResearchBrief({ query, transport, now: () => NOW, ...extra });
  return { brief, transport };
};
const tvReply = (candidates, original = tv.tvOriginalResearchExact.original) => ({ original, candidates });
const tvSpec = (candidates, grounding = tv.tvGrounding) => ({ reply: tvReply(candidates), grounding });
const models = (brief) => brief.suggestions.map((item) => item.model);
const codes = (brief) => brief.warnings.map((item) => item.code);
const checklistIds = (brief) => brief.checklist.map((item) => item.id);
const assertValid = (brief) => assert.deepEqual(validateResearchBrief(brief), { valid: true, errors: [] });
const fact = (brief, key) => brief.original.facts.find((item) => item.key === key);

// ---------------------------------------------------------------- complete

test('complete TV: one grounded call yields original facts, what-matters, provisional suggestions, differences and sources', async () => {
  const { brief, transport } = await run(tvSpec(tv.tvCandidatesResearch.candidates), 'Samsung QN55Q80C');
  assertValid(brief);
  assert.equal(transport.calls.length, 1);
  assert.equal(transport.calls[0].job, 'brief');
  assert.equal(brief.status, 'COMPLETE');
  assert.equal(brief.verificationLevel, 'PROVISIONAL');
  assert.equal(brief.category, 'television');
  assert.equal(brief.research.providerCalls, 1);

  assert.equal(brief.original.displayName, 'Samsung QN55Q80C');
  assert.equal(fact(brief, 'model').status, 'PROVIDED');
  assert.equal(fact(brief, 'refreshHz').status, 'REPORTED');
  assert.deepEqual(fact(brief, 'refreshHz').sources, ['samsung.com']);
  assert.ok(brief.whatMatters.some((item) => item.key === 'screenSizeIn' && item.original?.value === '55"'));

  assert.ok(brief.suggestions.length >= 1 && brief.suggestions.length <= 3);
  assert.equal(brief.suggestions[0].tier, 'PRIMARY');
  assert.equal(brief.suggestions[0].model, 'QN55Q80D');
  assert.ok(brief.suggestions.slice(1).every((item) => item.tier === 'ALTERNATIVE' && item.roleLabel));
  for (const suggestion of brief.suggestions) {
    assert.equal(suggestion.verification, 'PROVISIONAL');
    assert.equal(suggestion.availability.status, 'UNVERIFIED');
    assert.ok(suggestion.whyPromising.length > 0);
    assert.notEqual(suggestion.confidence, 'HIGH');
  }
  assert.ok(brief.suggestions.some((item) => item.differences.length > 0), 'a cross-brand alternative states its differences');

  const ruled = Object.fromEntries(brief.ruledOut.map((item) => [item.model, item.reason]));
  assert.match(ruled.QN50Q60D, /Does not meet a required specification: screen size/);
  assert.match(ruled.QN55Q80B, /discontinued/);
  assert.ok(!models(brief).includes('QN50Q60D'), 'a smaller screen is never suggested while a compliant candidate exists');

  assert.ok(brief.sources.length > 0);
  for (const source of brief.sources) assert.deepEqual([source.pageChecked, source.url.startsWith('https://')], [false, true]);
  assert.ok(checklistIds(brief).includes('availability'));
  assert.ok(codes(brief).includes('PROVISIONAL_RESULTS'));
});

test('complete refrigerator from a broad query skips the original section, still suggests, and rules out failed layouts', async () => {
  const { brief, transport } = await run({ reply: { original: null, candidates: fridge.fridgeCandidatesResearch.candidates }, grounding: fridge.fridgeGrounding }, 'LG side-by-side refrigerator 25 cu ft', { candidateLimit: 6 });
  assertValid(brief);
  assert.equal(transport.calls.length, 1);
  assert.match(transport.calls[0].prompt, /Part A is skipped/);
  assert.equal(brief.category, 'refrigerator');
  assert.equal(brief.research.original.status, 'SKIPPED');
  assert.ok(brief.suggestions.length >= 1 && models(brief).every((model) => model !== 'LRTLS2403S' && model !== 'LRSOS2306S'));
  assert.ok(brief.ruledOut.some((item) => item.model === 'LRTLS2403S'));
  assert.ok(checklistIds(brief).includes('find-model'), 'a broad search asks for the exact model');
  assert.ok(brief.whatMatters.some((item) => item.key === 'totalCapacityCuFt' && /0\.2 cu\. ft\./.test(item.guidance)));
});

test('a model outside the production support matrix is still researched and answered (provisionally)', async () => {
  const swap = (value) => JSON.parse(JSON.stringify(value).replaceAll('LRSOC2506S', 'WRS325SDHZ').replaceAll('lg.com', 'whirlpool.com'));
  const grounding = makeGrounding(['whirlpool.com', 'lg.com', 'bestbuy.com', 'geappliances.com']);
  const { brief, transport } = await run({ reply: { original: swap(fridge.fridgeOriginalResearch).original, candidates: fridge.fridgeCandidatesResearch.candidates }, grounding }, 'Whirlpool WRS325SDHZ refrigerator');
  assertValid(brief);
  assert.notEqual(brief.status, 'UNSUPPORTED');
  assert.equal(transport.calls.length, 1);
  assert.equal(brief.original.brand, 'Whirlpool');
  assert.ok(brief.suggestions.length >= 1);
});

// ---------------------------------------------------------------- partial

test('provider failure still returns category guidance, the checklist and what the customer entered', async () => {
  const { brief, transport } = await run({ reply: providerError('PROVIDER_5XX'), grounding: tv.tvGrounding }, 'Samsung QN55Q80C');
  assertValid(brief);
  assert.equal(transport.calls.length, 1);
  assert.equal(brief.status, 'GUIDANCE_ONLY');
  assert.deepEqual([brief.research.status, brief.research.errorCode], ['FAILED', 'PROVIDER_5XX']);
  assert.deepEqual(brief.suggestions, []);
  assert.ok(codes(brief).includes('RESEARCH_UNAVAILABLE'));
  assert.equal(fact(brief, 'model').status, 'PROVIDED');
  assert.ok(brief.whatMatters.length >= 7 && checklistIds(brief).includes('fit'));
  assert.ok(!checklistIds(brief).includes('find-model'), 'a provider outage is not the customer\'s model problem');
});

test('a missing transport makes no call and degrades to guidance', async () => {
  const brief = await buildResearchBrief({ query: 'Samsung QN55Q80C', now: () => NOW });
  assertValid(brief);
  assert.equal(brief.status, 'GUIDANCE_ONLY');
  assert.deepEqual([brief.research.providerCalls, brief.research.errorCode], [0, 'RESEARCH_PROVIDER_MISSING']);
});

test('a hung transport is cut off by the deadline and still degrades to guidance', async () => {
  const transport = async () => new Promise(() => {});
  const started = Date.now();
  const brief = await buildResearchBrief({ query: 'Samsung QN55Q80C', transport, deadline: createDeadline({ totalMs: 650 }), now: () => NOW });
  assert.ok(Date.now() - started < 2000);
  assert.deepEqual([brief.status, brief.research.errorCode], ['GUIDANCE_ONLY', 'STAGE_TIMEOUT']);
});

test('original researched but no candidates: PARTIAL with the original facts and a no-candidates warning', async () => {
  const { brief } = await run(tvSpec([]), 'Samsung QN55Q80C');
  assertValid(brief);
  assert.equal(brief.status, 'PARTIAL');
  assert.equal(fact(brief, 'resolution').status, 'REPORTED');
  assert.deepEqual(brief.suggestions, []);
  assert.ok(codes(brief).includes('NO_CANDIDATES_FOUND'));
  assert.ok(brief.whatMatters.length > 0);
});

test('invalid original section but valid candidates: PARTIAL, suggestions kept, original flagged unconfirmed', async () => {
  const { brief } = await run({ reply: { original: 'garbage', candidates: [tv.currentQled55, tv.crossBrand] }, grounding: tv.tvGrounding }, 'Samsung QN55Q80C');
  assertValid(brief);
  assert.equal(brief.status, 'PARTIAL');
  assert.equal(brief.research.original.status, 'INVALID');
  assert.ok(brief.suggestions.length >= 1);
  assert.ok(codes(brief).includes('ORIGINAL_UNVERIFIED'));
});

test('a non-object reply degrades to guidance without throwing', async () => {
  const { brief } = await run({ reply: 'not json at all', grounding: tv.tvGrounding }, 'Samsung QN55Q80C');
  assertValid(brief);
  assert.equal(brief.status, 'GUIDANCE_ONLY');
  assert.equal(brief.research.candidates.status, 'INVALID');
});

test('no grounding at all: suggestions are flagged unsourced, confidence is LOW and nothing is reported', async () => {
  const { brief } = await run(tvSpec([tv.currentQled55, tv.crossBrand], tv.noGrounding), 'Samsung QN55Q80C');
  assertValid(brief);
  assert.equal(brief.status, 'PARTIAL');
  assert.ok(brief.suggestions.length >= 1);
  for (const suggestion of brief.suggestions) assert.deepEqual([suggestion.sourced, suggestion.confidence, suggestion.grounding], [false, 'LOW', 'UNGROUNDED']);
  assert.ok(['RESEARCH_UNGROUNDED', 'UNSOURCED_SUGGESTION'].every((code) => codes(brief).includes(code)));
  assert.ok(brief.original.facts.every((item) => item.status !== 'REPORTED'));
  assert.deepEqual(brief.sources, [], 'no citation is ever invented');
  assert.ok(checklistIds(brief).some((id) => id.startsWith('exists-')));
});

test('when every candidate fails a hard requirement the closest one is shown as such, never as a match', async () => {
  const { brief } = await run(tvSpec([tv.smaller50]), 'Samsung QN55Q80C');
  assertValid(brief);
  const [primary] = brief.suggestions;
  assert.equal(brief.status, 'PARTIAL');
  assert.deepEqual([primary.model, primary.isBestAvailableOnly, primary.matchLevel, primary.confidence], ['QN50Q60D', true, 'CLOSEST_OPTION', 'LOW']);
  assert.match(primary.failedRequirements[0], /^Screen size: 50" \(original: 55"\)$/);
  assert.match(primary.matchSummary, /closest option found/);
  assert.ok(codes(brief).includes('NO_STRICT_MATCH'));
});

test('a candidate with no retail or availability evidence is still suggested, marked unverified', async () => {
  const unknownAvailability = tv.tvCandidate({ model: 'QN55Q80D', relationship: 'DIRECT_SUCCESSOR', relationshipSources: ['samsung.com'], relatedModel: 'QN55Q80C', availability: 'UNKNOWN' });
  const { brief } = await run(tvSpec([unknownAvailability]), 'Samsung QN55Q80C');
  assertValid(brief);
  assert.deepEqual(models(brief), ['QN55Q80D']);
  assert.deepEqual([brief.suggestions[0].availability.status, brief.suggestions[0].availability.reported], ['UNVERIFIED', 'UNKNOWN']);
  assert.ok(!JSON.stringify(brief).includes('"retail"'));
});

// ---------------------------------------------------------------- empty

test('empty research for an unrecognised model: guidance, a find-the-model checklist item and no invented suggestion', async () => {
  const empty = { original: { canonicalModel: { value: null, sources: [] }, possibleModels: [], facts: {} }, candidates: [] };
  const { brief } = await run({ reply: empty, grounding: tv.tvGrounding }, 'Samsung ZZ99XYZ television');
  assertValid(brief);
  assert.equal(brief.status, 'GUIDANCE_ONLY');
  assert.deepEqual(brief.suggestions, []);
  assert.deepEqual(brief.sources, []);
  assert.ok(['ORIGINAL_UNVERIFIED', 'NO_CANDIDATES_FOUND'].every((code) => codes(brief).includes(code)));
  assert.ok(checklistIds(brief).includes('find-model'));
  assert.equal(brief.whatMatters.length, 7);
  assert.ok(brief.original.facts.some((item) => item.key === 'resolution' && item.status === 'UNKNOWN'));
});

// ---------------------------------------------------------------- conflicting

test('research that contradicts what the customer entered keeps their value and reports the conflict', async () => {
  const { brief } = await run(tvSpec([tv.currentQled55]), 'Samsung QN55Q80C 60Hz TV');
  assertValid(brief);
  assert.deepEqual(brief.original.conflicts, [{ key: 'refreshHz', label: 'Native refresh capability', provided: '60 Hz', reported: '120 Hz' }]);
  assert.deepEqual([fact(brief, 'refreshHz').value, fact(brief, 'refreshHz').status], ['60 Hz', 'PROVIDED']);
  assert.ok(codes(brief).includes('SOURCE_CONFLICT'));
  assert.ok(checklistIds(brief).includes('conflict-refreshHz'));
});

test('an ambiguous model is surfaced as alternatives and a confirm-the-model checklist item', async () => {
  const { brief } = await run({ reply: tvReply(tv.tvCandidatesResearch.candidates, tv.tvOriginalResearch.original), grounding: tv.tvGrounding }, 'Samsung QN55Q80');
  assertValid(brief);
  assert.deepEqual(brief.original.possibleModels, ['QN55Q80B', 'QN55Q80C']);
  assert.ok(codes(brief).includes('MODEL_AMBIGUOUS'));
  const item = brief.checklist.find((entry) => entry.id === 'confirm-model');
  assert.match(item.text, /QN55Q80B or QN55Q80C/);
  assert.ok(brief.suggestions.every((entry) => entry.confidence !== 'HIGH'));
});

// ---------------------------------------------------------------- unsupported

test('an unsupported category makes no provider call and says what is supported', async () => {
  const { brief, transport } = await run(tvSpec([]), 'Whirlpool washer WTW5000DW');
  assertValid(brief);
  assert.equal(transport.calls.length, 0);
  assert.equal(brief.status, 'UNSUPPORTED');
  assert.deepEqual(brief.supportedCategories, ['television', 'refrigerator']);
  assert.deepEqual(codes(brief), ['UNSUPPORTED_CATEGORY']);
  assert.deepEqual([brief.suggestions, brief.whatMatters], [[], []]);
});

test('invalid input makes no provider call', async () => {
  for (const query of ['', '   ', null, 42, 'x'.repeat(161)]) {
    const { brief, transport } = await run(tvSpec([]), query);
    assertValid(brief);
    assert.equal(transport.calls.length, 0, String(query));
    assert.deepEqual([brief.status, codes(brief)], ['UNSUPPORTED', ['INVALID_REQUEST']]);
  }
  const badNotes = await run(tvSpec([]), 'Samsung QN55Q80C', { notes: 'n'.repeat(301) });
  assert.deepEqual([badNotes.transport.calls.length, codes(badNotes.brief)], [0, ['INVALID_REQUEST']]);
});
