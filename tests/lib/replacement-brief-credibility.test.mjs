import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResearchBrief, validateResearchBrief } from '../../lib/replacement-brief/index.js';
import { isOriginalModel } from '../../lib/replacement-brief/research.js';
import { discoverCandidatePool } from '../../lib/replacement-discovery/candidate-provider.js';
import { evaluateReplacement } from '../../lib/replacement-core/evaluate.js';
import { createBriefTransport, NOW } from '../fixtures/replacement-brief/brief-transport.mjs';
import { makeGrounding } from '../fixtures/replacement-discovery/mock-transport.mjs';
import * as tv from '../fixtures/replacement-discovery/grounded-tv-research.mjs';

// Regression tests for the Phase 1 quality review. Mock transports and the existing illustrative fixtures only.
const run = async (candidates, { query = 'Samsung QN55Q80C', grounding = tv.tvGrounding, original = tv.tvOriginalResearchExact.original, ...extra } = {}) => {
  const transport = createBriefTransport({ reply: { original, candidates }, grounding });
  const brief = await buildResearchBrief({ query, transport, now: () => NOW, ...extra });
  return { brief, transport };
};
const models = (brief) => brief.suggestions.map((item) => item.model);
const codes = (brief) => brief.warnings.map((item) => item.code);
const ruledOutModels = (brief) => brief.ruledOut.map((item) => item.model).sort();
const assertValid = (brief) => assert.deepEqual(validateResearchBrief(brief), { valid: true, errors: [] });
const withSources = (candidate, sources) => ({
  ...candidate,
  identitySources: sources,
  facts: Object.fromEntries(Object.entries(candidate.facts).map(([key, claim]) => [key, { ...claim, sources }])),
  tier: { ...candidate.tier, sources },
});

// ---------------------------------------------------------------- 1. source credibility

test('a manufacturer-backed model is STRONG: at most MEDIUM, never HIGH, and it still says the page was not opened', async () => {
  const { brief } = await run([tv.currentQled55, tv.crossBrand]);
  assertValid(brief);
  assert.equal(brief.status, 'COMPLETE');
  for (const suggestion of brief.suggestions) {
    assert.equal(suggestion.sourceStrength, 'STRONG');
    assert.ok(['MEDIUM', 'LOW'].includes(suggestion.confidence));
    assert.match(suggestion.sourceNote, /product page was not opened/);
  }
});

test('an approved retailer can also support a strong source', async () => {
  const { brief } = await run([withSources(tv.currentQled55, ['bestbuy.com'])]);
  assert.equal(brief.suggestions[0].sourceStrength, 'STRONG');
  assert.equal(brief.status, 'COMPLETE');
});

test('an invented model that cites only an unrelated domain is kept but labeled weak, LOW and never COMPLETE', async () => {
  const grounding = makeGrounding(['samsung.com', 'randomtechblog.example']);
  const invented = withSources(tv.tvCandidate({ model: 'QN55Q85Z', relationship: 'SAME_SERIES' }), ['randomtechblog.example']);
  const { brief } = await run([invented], { grounding });
  assertValid(brief);
  const [suggestion] = brief.suggestions;
  assert.deepEqual([suggestion.model, suggestion.sourceStrength, suggestion.confidence, suggestion.sourced], ['QN55Q85Z', 'WEAK', 'LOW', true]);
  assert.equal(brief.status, 'PARTIAL');
  assert.ok(codes(brief).includes('WEAK_SOURCE_SUGGESTION'));
  assert.ok(brief.checklist.some((item) => item.id === 'exists-QN55Q85Z' && /manufacturer's site/.test(item.text)));
});

test('a brand and source mismatch (an LG model citing only Samsung) is weak, not strong', async () => {
  const mismatch = tv.tvCandidate({ model: 'OLED55C5PUA', brand: 'LG', domain: 'samsung.com', relationship: 'CROSS_BRAND_ALTERNATIVE' });
  const { brief } = await run([mismatch]);
  const [suggestion] = brief.suggestions;
  assert.deepEqual([suggestion.sourceStrength, suggestion.confidence], ['WEAK', 'LOW']);
  assert.notEqual(brief.status, 'COMPLETE');
});

test('a marketplace-only model is treated as unsourced (NONE), still suggested at LOW', async () => {
  const grounding = makeGrounding(['samsung.com', 'amazon.com']);
  const { brief } = await run([withSources(tv.currentQled55, ['amazon.com'])], { grounding });
  const [suggestion] = brief.suggestions;
  assert.deepEqual([suggestion.sourceStrength, suggestion.confidence, suggestion.sourced], ['NONE', 'LOW', false]);
  assert.ok(codes(brief).includes('UNSOURCED_SUGGESTION'));
  assert.equal(brief.status, 'PARTIAL');
});

test('an identity source that never appears in the search results counts as no evidence', async () => {
  const { brief } = await run([withSources(tv.currentQled55, ['not-in-search-results.example'])]);
  assert.deepEqual([brief.suggestions[0].sourceStrength, brief.suggestions[0].confidence], ['NONE', 'LOW']);
  assert.notEqual(brief.status, 'COMPLETE');
});

test('partial grounding (identity cited, specifications uncited) cannot reach COMPLETE or MEDIUM', async () => {
  const partial = tv.tvCandidate({ model: 'QN55Q82D' });
  for (const claim of Object.values(partial.facts)) claim.sources = ['not-in-search-results.example'];
  const { brief } = await run([partial]);
  assertValid(brief);
  const [suggestion] = brief.suggestions;
  assert.equal(suggestion.grounding, 'PARTIALLY_GROUNDED');
  assert.deepEqual([suggestion.sourceStrength, suggestion.confidence], ['WEAK', 'LOW']);
  assert.notEqual(brief.status, 'COMPLETE');
});

test('an unconfirmed evaluator verdict can never be COMPLETE even with a strong source', async () => {
  const bare = tv.tvCandidate({ model: 'QN55Q82D' });
  bare.facts = {};
  const { brief } = await run([bare]);
  assert.equal(brief.suggestions[0].matchLevel, 'UNCONFIRMED');
  assert.notEqual(brief.status, 'COMPLETE');
});

// ---------------------------------------------------------------- 2. original-model exclusion

test('the original model, and a suffix variant of it, is never recommended as its own replacement', async () => {
  const same = tv.tvCandidate({ model: 'QN55Q80C' });
  const variant = tv.tvCandidate({ model: 'QN55Q80CAFXZA' });
  const { brief } = await run([same, variant, tv.currentQled55]);
  assertValid(brief);
  assert.deepEqual(models(brief), ['QN55Q80D']);
  const reasons = brief.ruledOut.filter((item) => /already have/.test(item.reason)).map((item) => item.model).sort();
  assert.deepEqual(reasons, ['QN55Q80C', 'QN55Q80CAFXZA']);
  assert.equal(brief.research.candidates.rejected, 2);
});

test('when only the original comes back there is no suggestion and the brief says so', async () => {
  const { brief } = await run([tv.tvCandidate({ model: 'QN55Q80C' })]);
  assert.deepEqual(brief.suggestions, []);
  assert.ok(codes(brief).includes('NO_CANDIDATES_FOUND'));
  assert.notEqual(brief.status, 'COMPLETE');
});

test('a partial typed token does not exclude its own successor, but a model it could mean is excluded', async () => {
  const { brief } = await run([tv.currentQled55, tv.tvCandidate({ model: 'QN55Q80C' })], { query: 'Samsung QN55Q80', original: tv.tvOriginalResearch.original });
  assert.ok(models(brief).includes('QN55Q80D'), 'the successor stays');
  assert.ok(!models(brief).includes('QN55Q80C'), 'a model the token could mean is the customer\'s own');
});

test('isOriginalModel: exact on the token, suffix variants only against a resolved full model', () => {
  const original = (facts) => ({ facts });
  const resolved = original({ model: { value: 'QN55Q80C' }, canonicalModel: { status: 'KNOWN', value: 'QN55Q80C' } });
  assert.equal(isOriginalModel('QN55Q80C', resolved), true);
  assert.equal(isOriginalModel('qn55q80c', resolved), true);
  assert.equal(isOriginalModel('QN55Q80CAFXZA', resolved), true);
  assert.equal(isOriginalModel('QN55Q80D', resolved), false);
  const partial = original({ model: { value: 'QN55Q80' }, canonicalModel: { status: 'AMBIGUOUS', value: null, alternatives: ['QN55Q80B', 'QN55Q80C'] } });
  assert.equal(isOriginalModel('QN55Q80D', partial), false);
  assert.equal(isOriginalModel('QN55Q80B', partial), true);
});

// ---------------------------------------------------------------- 3. candidate selection

const family = (count) => Array.from({ length: count }, (_, index) => tv.tvCandidate({ model: `QN55Q8${index + 1}D`, providerRank: index + 1, price: 100 + index }));
const mixed = () => [
  ...family(5), tv.neoQled, tv.crossBrand, tv.lowerTier, tv.smaller50, tv.tvCandidate({ model: 'QN43Q60D', size: 43, series: 'Q60 Series' }),
];

test('candidate order does not change what is suggested or what is dropped, even at the pool boundary', async () => {
  const candidates = mixed();
  assert.equal(candidates.length, 10);
  const { brief: forward } = await run(candidates);
  const { brief: reversed } = await run([...candidates].reverse());
  const { brief: shuffled } = await run([candidates[4], candidates[9], candidates[0], candidates[7], candidates[2], candidates[5], candidates[1], candidates[8], candidates[3], candidates[6]]);
  for (const other of [reversed, shuffled]) {
    assert.deepEqual(models(other), models(forward));
    assert.deepEqual(ruledOutModels(other), ruledOutModels(forward));
    assert.deepEqual(other.suggestions.map((item) => item.role), forward.suggestions.map((item) => item.role));
  }
  assertValid(forward);
});

test('up to eight candidates are compared, a ninth and tenth are visibly set aside, and the pool is never cut in provider order', async () => {
  const { brief, transport } = await run(mixed());
  assert.equal(transport.calls.length, 1);
  assert.match(transport.calls[0].prompt, /Find up to 8 CURRENT/);
  assert.deepEqual([brief.research.evaluation.compared, brief.research.evaluation.notCompared], [8, 2]);
  assert.ok(codes(brief).includes('CANDIDATES_NOT_COMPARED'));
  const dropped = brief.ruledOut.filter((item) => /ranked below the models compared/.test(item.reason));
  assert.equal(dropped.length, 2);
  assert.ok(dropped.every((item) => item.model), 'each set-aside model is named');
  assert.ok(brief.suggestions.length <= 3);
});

test('exactly eight candidates drop nothing; the output stays one primary and at most two alternatives', async () => {
  const { brief } = await run([...family(5), tv.neoQled, tv.crossBrand, tv.lowerTier]);
  assert.deepEqual([brief.research.evaluation.compared, brief.research.evaluation.notCompared], [8, 0]);
  assert.ok(!codes(brief).includes('CANDIDATES_NOT_COMPARED'));
  assert.ok(brief.suggestions.length >= 2 && brief.suggestions.length <= 3);
  assert.deepEqual(brief.suggestions.map((item) => item.tier), ['PRIMARY', ...Array(brief.suggestions.length - 1).fill('ALTERNATIVE')]);
});

test('eight strong candidates still yield at most three suggestions', async () => {
  const { brief } = await run(family(8));
  assert.ok(brief.suggestions.length <= 3);
  assert.equal(brief.suggestions[0].tier, 'PRIMARY');
  assert.equal(brief.research.evaluation.compared, 8);
});

test('the requested pool is clamped to eight and a smaller request is honoured, still with one provider call', async () => {
  const big = await run(family(2), { candidateLimit: 99 });
  assert.match(big.transport.calls[0].prompt, /Find up to 8 CURRENT/);
  const small = await run(mixed(), { candidateLimit: 3 });
  assert.match(small.transport.calls[0].prompt, /Find up to 3 CURRENT/);
  assert.equal(small.transport.calls.length, 1);
  assert.equal(small.brief.research.evaluation.compared, 3);
  assert.equal(small.brief.research.evaluation.notCompared, 7);
});

test('the shared production discovery limit is unchanged: 6 by default, larger only when a caller opts in', async () => {
  const provider = { async discoverCandidates() { return []; } };
  await assert.rejects(discoverCandidatePool({ candidateProvider: provider, original: {}, hints: {}, limit: 7 }), /discovery limit must be 1 through 6/);
  const pool = await discoverCandidatePool({ candidateProvider: provider, original: {}, hints: {}, limit: 7, maxLimit: 12 });
  assert.deepEqual(pool.candidates, []);
});

test('ranking stays price- and provider-rank-independent across a large pool', async () => {
  const noisy = family(6).map((entry, index) => ({ ...entry, providerRank: 6 - index, price: 1000 - index, msrp: index, lkq: index === 5 }));
  const { brief } = await run(noisy);
  const { brief: clean } = await run(family(6));
  assert.deepEqual(models(brief), models(clean));
  assert.ok(!/msrp|providerRank|"price|"score"/i.test(JSON.stringify(brief)));
});

// ---------------------------------------------------------------- 4. evaluation failures

test('a candidate that cannot be evaluated is reported, the rest survive, and the brief is not COMPLETE', async () => {
  const evaluate = (input) => {
    if (input.candidate.identity.facts.model.value === 'QN55Q80D') throw new Error('boom');
    return evaluateReplacement(input);
  };
  const { brief } = await run([tv.currentQled55, tv.crossBrand], { evaluate });
  assertValid(brief);
  assert.deepEqual(models(brief), ['U8N-55']);
  assert.ok(codes(brief).includes('EVALUATION_FAILED'));
  assert.notEqual(brief.status, 'COMPLETE');
  assert.ok(brief.ruledOut.some((item) => item.model === 'QN55Q80D' && /Could not be compared/.test(item.reason)));
  assert.deepEqual([brief.research.evaluation.status, brief.research.evaluation.failedCandidates], ['FAILED', 1]);
  assert.ok(brief.checklist.some((item) => item.id === 'compare-manually'));
});

test('when evaluation fails outright the original facts, guidance and checklist survive with an explicit warning', async () => {
  const { brief } = await run([tv.currentQled55, tv.crossBrand], { evaluate: () => ({}) });
  assertValid(brief);
  assert.deepEqual(brief.suggestions, []);
  assert.ok(codes(brief).includes('EVALUATION_FAILED'));
  assert.notEqual(brief.status, 'COMPLETE');
  assert.equal(brief.status, 'PARTIAL', 'the original was researched, so the brief is still useful');
  assert.ok(brief.original.facts.some((fact) => fact.key === 'refreshHz' && fact.status === 'REPORTED'));
  assert.ok(brief.whatMatters.length > 0 && brief.checklist.some((item) => item.id === 'fit' || item.id === 'compare-manually'));
  assert.ok(brief.checklist.some((item) => item.id === 'compare-manually'));
});

test('every candidate failing evaluation is never COMPLETE and never silent', async () => {
  const { brief } = await run([tv.currentQled55], { evaluate: () => { throw new TypeError('bad'); } });
  assert.ok(codes(brief).includes('EVALUATION_FAILED'));
  assert.notEqual(brief.status, 'COMPLETE');
  assert.deepEqual(brief.suggestions, []);
});

// ---------------------------------------------------------------- 5. imperfect alternatives

test('when nothing meets a hard requirement, up to two closest alternatives are shown, each naming what fails, at LOW', async () => {
  const third = tv.tvCandidate({ model: 'QN32Q60D', size: 32, series: 'Q60 Series' });
  const { brief } = await run([tv.smaller50, tv.tvCandidate({ model: 'QN43Q60D', size: 43, series: 'Q60 Series' }), third]);
  assertValid(brief);
  assert.equal(brief.suggestions.length, 3);
  assert.deepEqual(brief.suggestions.map((item) => item.tier), ['PRIMARY', 'ALTERNATIVE', 'ALTERNATIVE']);
  for (const suggestion of brief.suggestions) {
    assert.equal(suggestion.matchLevel, 'CLOSEST_OPTION');
    assert.equal(suggestion.confidence, 'LOW');
    assert.equal(suggestion.isBestAvailableOnly, true);
    assert.match(suggestion.failedRequirements[0], /^Screen size: \d+" \(original: 55"\)$/);
    assert.doesNotMatch(suggestion.whyPromising.join(' '), /meet or exceed/);
    assert.match(suggestion.whyPromising[0], /does not meet screen size/);
  }
  assert.ok(brief.suggestions.slice(1).every((item) => item.role === 'CLOSEST_OPTION' && /Closest option/.test(item.roleLabel)));
  assert.ok(['NO_STRICT_MATCH', 'CLOSEST_ALTERNATIVE'].every((code) => codes(brief).includes(code)));
  assert.equal(brief.status, 'PARTIAL');
});

test('one requirement-meeting option plus closest options: the meeting one leads and closest options are labeled', async () => {
  const { brief } = await run([tv.currentQled55, tv.smaller50, tv.tvCandidate({ model: 'QN43Q60D', size: 43, series: 'Q60 Series' })]);
  assertValid(brief);
  assert.equal(brief.suggestions[0].model, 'QN55Q80D');
  assert.equal(brief.suggestions[0].isBestAvailableOnly, false);
  assert.ok(brief.suggestions.slice(1).every((item) => item.role === 'CLOSEST_OPTION' && item.failedRequirements.length > 0 && item.confidence === 'LOW'));
  assert.notEqual(brief.status, 'COMPLETE');
});

test('two requirement-meeting options leave no room for a failing one, which stays in ruled out with its reason', async () => {
  const { brief } = await run([tv.currentQled55, tv.crossBrand, tv.smaller50]);
  assert.ok(brief.suggestions.every((item) => item.failedRequirements.length === 0));
  assert.ok(brief.ruledOut.some((item) => item.model === 'QN50Q60D' && /screen size/.test(item.reason)));
  assert.ok(!ruledOutModels(brief).some((model) => models(brief).includes(model)), 'a shown model is never also listed as ruled out');
});

// ---------------------------------------------------------------- 6. specification transparency

test('every compared specification carries where each side came from, and nothing is called verified', async () => {
  const { brief } = await run([tv.currentQled55, tv.crossBrand]);
  const [primary] = brief.suggestions;
  assert.ok(primary.specs.length >= 4);
  const refresh = primary.specs.find((item) => item.key === 'refreshHz');
  assert.deepEqual([refresh.originalStatus, refresh.replacementStatus, refresh.replacementSources], ['REPORTED', 'REPORTED', ['samsung.com']]);
  assert.ok(primary.specs.some((item) => item.key === 'tier' && item.replacementStatus === 'INFERRED'));
  assert.ok(primary.specs.every((item) => item.comparison && !/verified/i.test(item.comparison)));
  assert.ok(!JSON.stringify(brief).includes('"VERIFIED'));
});

test('without sources a candidate specification is ASSUMED, not reported', async () => {
  const { brief } = await run([tv.currentQled55], { grounding: tv.noGrounding });
  const specs = brief.suggestions[0].specs;
  assert.ok(specs.some((item) => item.replacementStatus === 'ASSUMED'));
  assert.ok(specs.every((item) => item.replacementStatus !== 'REPORTED'));
});

test('customer-facing labels never imply verification and the evaluator class stays internal', async () => {
  const { brief } = await run([tv.currentQled55, tv.crossBrand, tv.smaller50]);
  for (const suggestion of brief.suggestions) {
    assert.ok(!('classification' in suggestion));
    assert.doesNotMatch(`${suggestion.matchLabel} ${suggestion.matchSummary}`, /LKQ/);
    assert.doesNotMatch(`${suggestion.matchLabel}`, /(?<!not )verified/i);
  }
  assert.equal(brief.suggestions[0].matchLevel, 'MEETS_REPORTED');
});

// ---------------------------------------------------------------- validator cross-checks

test('the validator rejects claims that outrun their evidence', async () => {
  const { brief } = await run([tv.smaller50]);
  const errorsOf = (mutate, source = brief) => { const copy = structuredClone(source); mutate(copy); return validateResearchBrief(copy).errors.join('|'); };
  assert.match(errorsOf((b) => { b.suggestions[0].confidence = 'MEDIUM'; }), /FAILED_REQUIREMENT_NOT_CLOSEST_OPTION/);
  assert.match(errorsOf((b) => { b.suggestions[0].matchLevel = 'MEETS_REPORTED'; }), /FAILED_REQUIREMENT_NOT_CLOSEST_OPTION/);
  assert.match(errorsOf((b) => { b.suggestions[0].classification = 'LKQ'; }), /EVALUATOR_CLASSIFICATION_EXPOSED/);
  assert.match(errorsOf((b) => { b.suggestions[0].confidence = 'HIGH'; }), /CONFIDENCE_TOO_HIGH/);
  assert.match(errorsOf((b) => { b.suggestions[0].specs[0].replacementStatus = 'VERIFIED'; }), /BAD_SPEC_STATUS/);

  const { brief: weak } = await run([withSources(tv.currentQled55, ['randomtechblog.example'])], { grounding: makeGrounding(['samsung.com', 'randomtechblog.example']) });
  assert.match(errorsOf((b) => { b.suggestions[0].confidence = 'MEDIUM'; }, weak), /CONFIDENCE_EXCEEDS_SOURCES/);
  assert.match(errorsOf((b) => { b.status = 'COMPLETE'; }, weak), /COMPLETE_WITHOUT_STRONG_SUGGESTIONS/);
});
