import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendWithResearch } from '../../lib/replacement-discovery/live-recommend.js';
import { createGroundedResearchProvider } from '../../lib/replacement-discovery/providers/grounded-research-provider.js';
import { upgradeMagnitude } from '../../lib/replacement-discovery/candidate-ranker.js';
import { stableId } from '../../lib/replacement-discovery/normalize-adapter.js';
import { createMockTransport } from '../fixtures/replacement-discovery/mock-transport.mjs';
import * as tv from '../fixtures/replacement-discovery/grounded-tv-research.mjs';
import { unsupportedSuccessor } from '../fixtures/replacement-discovery/malformed-research.mjs';

const run = (candidates, { query = 'Samsung QN55Q80', notes = '', original = tv.tvOriginalResearch } = {}) => {
  const transport = createMockTransport({ original, candidates: { candidates }, grounding: tv.tvGrounding });
  return recommendWithResearch({ query, notes, researchProvider: createGroundedResearchProvider({ transport }) });
};
const modelOf = (item) => item.candidate.identity.facts.model?.value;

test('provider rank 1 is a 50-inch premium TV with an LKQ claim; the valid 55-inch still wins', async () => {
  const result = await run([tv.smaller50, tv.currentQled55]);
  assert.equal(tv.smaller50.providerRank, 1);
  assert.equal(modelOf(result.primaryRecommendation), 'QN55Q80D');
  assert.equal(result.alternatives.length, 0);
  assert.ok(result.rejectedSummary.some((item) => item.reasonCode === 'KNOWN_HARD_FAILURE'));
});

test('a provider LKQ claim is ignored: hard-failing candidate is NOT_LKQ and flagged best-available only', async () => {
  const result = await run([tv.smaller50]);
  const primary = result.primaryRecommendation;
  assert.equal(primary.classification, 'NOT_LKQ');
  assert.equal(result.bestAvailableRecommendation, true);
  assert.ok(result.reasonCodes.includes('NO_LKQ_CANDIDATE_FOUND'));
  assert.ok(primary.decision.hardFailures.some((failure) => failure.key === 'screenSizeIn'));
  for (const field of ['lkq', 'classification', 'score', 'price']) assert.ok(!(field in primary.candidate), field);
  assert.ok(!/"lkq"|"price"|"score":99/.test(JSON.stringify(primary)));
  const warning = result.research.warnings.find((item) => item.code === 'PROVIDER_POLICY_FIELDS_IGNORED');
  assert.deepEqual(warning.fields, ['lkq', 'classification', 'score']);
});

test('provider rank is metadata only: reversing every rank changes neither primary nor score', async () => {
  const pool = [tv.currentQled55, tv.crossBrand, tv.neoQled];
  const before = await run(pool.map((candidate, index) => ({ ...candidate, providerRank: index + 1 })));
  const after = await run(pool.map((candidate, index) => ({ ...candidate, providerRank: pool.length - index })));
  assert.equal(before.primaryRecommendation.candidate.candidateId, after.primaryRecommendation.candidate.candidateId);
  assert.equal(before.primaryRecommendation.decision.score.weightedTotal, after.primaryRecommendation.decision.score.weightedTotal);
  assert.equal(before.primaryRecommendation.candidate.providerRank, 1);
});

test('incidental prices are discarded and cannot influence ranking or appear in output', async () => {
  const cheap = await run([{ ...tv.currentQled55, price: 1, msrp: 1 }, tv.crossBrand]);
  const dear = await run([{ ...tv.currentQled55, price: 99999 }, { ...tv.crossBrand, offers: [{ seller: 'x', amount: 1 }] }]);
  assert.equal(cheap.primaryRecommendation.candidate.candidateId, dear.primaryRecommendation.candidate.candidateId);
  assert.equal(cheap.primaryRecommendation.decision.score.weightedTotal, dear.primaryRecommendation.decision.score.weightedTotal);
  assert.ok(cheap.research.warnings.some((warning) => warning.code === 'INCIDENTAL_PRICE_DISCARDED'));
  assert.ok(!/price|msrp|offers|99999/i.test(JSON.stringify(dear.primaryRecommendation.candidate)));
});

test('successor claims need manufacturer/retailer evidence and a matching related model', async () => {
  const relationships = async (candidate) => (await run([candidate])).primaryRecommendation.candidate.relationship;
  assert.equal(await relationships(tv.currentQled55), 'DIRECT_SUCCESSOR');
  assert.equal(await relationships(unsupportedSuccessor), 'SAME_SERIES');
  assert.equal(await relationships({ ...tv.currentQled55, relatedModel: 'QN55Q90C' }), 'SAME_SERIES');
  assert.equal(await relationships({ ...tv.currentQled55, relationshipSources: ['notarealsource.example'] }), 'SAME_SERIES');
  assert.equal(await relationships({ ...tv.currentQled55, relationshipSources: ['rtings.com'] }), 'SAME_SERIES');
  assert.equal(await relationships({ ...tv.crossBrand, relationship: 'DIRECT_SUCCESSOR', relationshipSources: ['hisense-usa.com'], relatedModel: 'QN55Q80C' }), 'CROSS_BRAND_ALTERNATIVE');
  assert.equal(await relationships({ ...tv.currentQled55, series: undefined, facts: { ...tv.currentQled55.facts, series: { value: 'Crystal UHD', sources: ['samsung.com'], subjectModel: 'QN55Q80D' } }, relationship: 'SAME_SERIES' }), 'SAME_BRAND_ALTERNATIVE');
});

test('installed physical fit is never researchable: a provider-supplied fit claim is dropped, not trusted', async () => {
  const claimsFit = { ...tv.currentQled55, facts: { ...tv.currentQled55.facts, physicalFit: { value: true, sources: ['samsung.com'], subjectModel: 'QN55Q80D' } } };
  const undocumented = await run([claimsFit]);
  const documented = await run([claimsFit], { notes: 'physical fit: yes' });
  for (const result of [undocumented, documented]) assert.ok(!('physicalFit' in result.primaryRecommendation.candidate.identity.facts));
  const ignored = undocumented.research.warnings.find((warning) => warning.code === 'UNSUPPORTED_FIELDS_IGNORED');
  assert.deepEqual(ignored.fields, ['physicalFit']);
  // No constraint known: the claim is irrelevant and fit is an advisory. A documented fit constraint cannot be satisfied by the provider's say-so.
  assert.equal(undocumented.primaryRecommendation.fitAssessment.status, 'ADVISORY');
  assert.equal(documented.primaryRecommendation.classification, 'UNCONFIRMED');
  assert.equal(documented.primaryRecommendation.fitAssessment.status, 'CONSTRAINT_UNVERIFIED');
  assert.ok(documented.primaryRecommendation.decision.reasonCodes.includes('HARD_COMPARISON_UNVERIFIED'));
});

test('tier from price is rejected and the brand/category baseline is kept', async () => {
  const pricey = { ...tv.currentQled55, tier: { value: 'LUXURY', basis: 'PRICE', sources: ['samsung.com'], subjectModel: 'QN55Q80D' } };
  const result = await run([pricey]);
  assert.ok(result.research.warnings.some((warning) => warning.code === 'TIER_FROM_PRICE_REJECTED'));
  const tier = result.primaryRecommendation.candidate.identity.facts.tier;
  assert.deepEqual([tier.status, tier.basis, tier.value], ['ASSUMED', 'BRAND_CATEGORY_BASELINE', 'PREMIUM']);
});

test('a tighter match beats an unnecessary larger screen regardless of discovery order', async () => {
  const wide = tv.tvCandidate({ model: 'QN65Q80X', size: 65 });
  const tight = tv.tvCandidate({ model: 'QN55Q80X' });
  // Premise: the wider TV's candidateId sorts first, so only the upgrade tie-break (not the old hash order) can pick the tight match.
  const id = (model) => stableId('grounded', `television|samsung|${model}`);
  assert.ok(id('QN65Q80X') < id('QN55Q80X'));
  for (const pool of [[wide, tight], [tight, wide]]) {
    const result = await run(pool);
    assert.equal(modelOf(result.primaryRecommendation), 'QN55Q80X');
    assert.deepEqual(result.alternatives.map((item) => modelOf(item.recommendation)), ['QN65Q80X']);
    assert.ok(upgradeMagnitude(result.alternatives[0].recommendation) > upgradeMagnitude(result.primaryRecommendation));
  }
});

test('upgradeMagnitude measures hard-rule overshoot only', async () => {
  const result = await run([tv.tvCandidate({ model: 'QN65Q80D', size: 66 }), tv.currentQled55]);
  const evaluations = [result.primaryRecommendation, ...result.alternatives.map((item) => item.recommendation)];
  const magnitudes = Object.fromEntries(evaluations.map((item) => [modelOf(item), upgradeMagnitude(item)]));
  assert.equal(magnitudes.QN55Q80D, 0);
  if ('QN65Q80D' in magnitudes) assert.ok(magnitudes.QN65Q80D > 0.19);
});

test('hostile keys cannot pollute prototypes or smuggle fields into replacement-core', async () => {
  const hostile = JSON.parse(`{"__proto__":{"polluted":true},"constructor":{"x":1},"brand":"Samsung","model":"QN55Q80D","category":"television","availability":"CURRENT","identitySources":["samsung.com"],
    "facts":{"__proto__":{"polluted":true},"screenSizeIn":{"value":55,"sources":["samsung.com"],"subjectModel":"QN55Q80D"},"toString":{"value":"x"}},"hack":"<script>alert(1)</script>"}`);
  const result = await run([hostile]);
  assert.equal({}.polluted, undefined);
  assert.equal(modelOf(result.primaryRecommendation), 'QN55Q80D');
  assert.ok(!('hack' in result.primaryRecommendation.candidate));
  const ignored = result.research.warnings.find((warning) => warning.code === 'UNSUPPORTED_FIELDS_IGNORED');
  assert.ok(['hack', 'toString'].every((name) => ignored.fields.includes(name)));
  assert.ok(!JSON.stringify(result.primaryRecommendation.candidate).includes('script'));
});
