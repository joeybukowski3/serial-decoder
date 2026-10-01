import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendWithResearch } from '../../lib/replacement-discovery/live-recommend.js';
import { createGroundedResearchProvider } from '../../lib/replacement-discovery/providers/grounded-research-provider.js';
import { stableId } from '../../lib/replacement-discovery/normalize-adapter.js';
import { modelKey } from '../../lib/replacement-discovery/research-schema.js';
import { createMockTransport, makeGrounding } from '../fixtures/replacement-discovery/mock-transport.mjs';
import * as tv from '../fixtures/replacement-discovery/grounded-tv-research.mjs';

const idOf = (category, brand, model) => stableId('grounded', [category, brand.toLowerCase().replace(/\s+/g, '-'), modelKey(model)].join('|'));
const modelsByOrder = (result) => {
  const names = new Map();
  for (const candidate of Object.values(tv.unsourcedPool)) names.set(idOf('television', candidate.brand, candidate.model), candidate.model);
  return [result.primaryRecommendation.candidate.identity.facts.model.value, ...result.rankingExplanation.map((entry) => names.get(entry.versusCandidateId) ?? entry.versusCandidateId)];
};
const broad = (candidates, { query = '55 Samsung QLED TV', original, grounding = tv.noGrounding } = {}) => recommendWithResearch({
  query,
  researchProvider: createGroundedResearchProvider({ transport: createMockTransport({ original, candidates: { candidates }, grounding }) }),
});
const pool = tv.unsourcedPool;

test('premise: ordering these four candidates by candidateId alone would NOT pick the closest match', () => {
  const ids = Object.values(pool).map((c) => [idOf('television', c.brand, c.model), c.model]).sort((a, b) => a[0].localeCompare(b[0]));
  assert.notEqual(ids[0][1], pool.sameBrandSameDisplay.model, 'otherwise this suite could not tell likeness from the hash');
});

test('all-unsourced pool: a recommendation is returned, UNCONFIRMED / LOW, flagged provisional, and chosen by likeness (not the hash)', async () => {
  const result = await broad([pool.upgrade65, pool.crossBrand, pool.sameBrandLed, pool.sameBrandSameDisplay]);
  const primary = result.primaryRecommendation;
  assert.equal(primary.candidate.identity.facts.model.value, 'QN55Q80XA');
  assert.equal(primary.classification, 'UNCONFIRMED');
  assert.equal(primary.confidence, 'LOW');
  for (const code of ['LIVE_RESEARCH_UNGROUNDED', 'PROVISIONAL_UNSOURCED_RECOMMENDATION']) assert.ok(result.reasonCodes.includes(code), code);
  assert.ok(result.alternatives.length <= 2);
  for (const entry of [primary, ...result.alternatives.map((item) => item.recommendation)]) assert.equal(entry.classification, 'UNCONFIRMED');
});

test('likeness order follows the stated priorities: same class first, then brand, then display/family; the 65-inch upgrade is last', async () => {
  const result = await broad([pool.upgrade65, pool.crossBrand, pool.sameBrandLed, pool.sameBrandSameDisplay]);
  assert.deepEqual(modelsByOrder(result), ['QN55Q80XA', 'UN55DU7XA', 'K-55XR70', 'QN65QN90XA']);
  const decided = Object.fromEntries(result.rankingExplanation.map((entry) => [entry.decidedBy, true]));
  assert.ok(decided['likeness: family/display/configuration mismatches'], 'primary vs the LED set');
  assert.ok(decided['likeness: same brand'], 'primary vs the cross-brand set');
  assert.ok(decided['likeness: nominal size/capacity class'], 'primary vs the 65-inch upgrade');
  assert.ok(result.rankingExplanation.every((entry) => entry.decidedBy !== 'candidateId (stability tie-break)'), 'the hash decided nothing');
});

test('an unnecessary 65-inch premium upgrade does not beat the closer 55-inch match, wherever the provider lists it', async () => {
  for (const order of [[pool.upgrade65, pool.sameBrandSameDisplay], [pool.sameBrandSameDisplay, pool.upgrade65]]) {
    const result = await broad(order.map((c, i) => ({ ...c, providerRank: i === 0 ? 1 : 2 })));
    assert.equal(result.primaryRecommendation.candidate.identity.facts.model.value, 'QN55Q80XA');
  }
});

test('input order and provider rank/price cannot change the outcome', async () => {
  const reference = await broad([pool.sameBrandSameDisplay, pool.crossBrand, pool.sameBrandLed, pool.upgrade65]);
  const variants = [
    [pool.upgrade65, pool.sameBrandLed, pool.crossBrand, pool.sameBrandSameDisplay],
    Object.values(pool).map((c, i) => ({ ...c, providerRank: 4 - i, price: 100 + i, msrp: 1, lkq: true })),
    Object.values(pool).map((c, i) => ({ ...c, providerRank: i + 1, price: 99999 - i, classification: 'LKQ', score: 100 })),
  ];
  for (const variant of variants) {
    const result = await broad(variant);
    assert.deepEqual(modelsByOrder(result), modelsByOrder(reference));
    assert.equal(result.primaryRecommendation.candidate.candidateId, reference.primaryRecommendation.candidate.candidateId);
  }
});

test('candidateId is only the FINAL stability tie-break: candidates identical in every likeness signal fall to it, deterministically', async () => {
  const twin = (model) => tv.unsourcedTv({ model });
  const forward = await broad([twin('QN55TWINA'), twin('QN55TWINB')]);
  const reversed = await broad([twin('QN55TWINB'), twin('QN55TWINA')]);
  assert.equal(forward.rankingExplanation[0].decidedBy, 'candidateId (stability tie-break)');
  assert.equal(forward.primaryRecommendation.candidate.candidateId, reversed.primaryRecommendation.candidate.candidateId);
});

test('the fallback never overrides a known hard failure: a sourced 50-inch ranks below every unsourced candidate', async () => {
  const sourced50 = { ...tv.tvCandidate({ model: 'QN50Q80XA', size: 50 }) };
  const result = await broad([sourced50, pool.upgrade65, pool.sameBrandSameDisplay], { grounding: makeGrounding(['samsung.com']) });
  assert.notEqual(result.primaryRecommendation.candidate.identity.facts.model.value, 'QN50Q80XA');
  assert.ok(result.rejectedSummary.some((item) => item.reasonCode === 'KNOWN_HARD_FAILURE'));
  assert.ok(result.rankingExplanation.some((entry) => entry.decidedBy === 'hard-rule failures'));
});

test('ordinary sourced ranking is unchanged: a properly evidenced cross-brand LKQ beats a poor same-brand candidate on classification, not likeness', async () => {
  const poorSameBrand = tv.tvCandidate({ model: 'QN55Q60XA', display: 'LED', refresh: 60, series: 'Q60 Series' });
  // Brand AND series are both NORMAL-weight strong rules, so a cross-brand LKQ is one that reports no conflicting series.
  const goodCrossBrand = tv.tvCandidate({ model: 'K-55XR80', brand: 'Sony', domain: 'sony.com', relationship: 'CROSS_BRAND_ALTERNATIVE' });
  delete goodCrossBrand.facts.series;
  for (const order of [[poorSameBrand, goodCrossBrand], [goodCrossBrand, poorSameBrand]]) {
    const result = await broad(order, { query: 'Samsung QN55Q80C', original: tv.tvOriginalResearchExact, grounding: makeGrounding(['samsung.com', 'sony.com']) });
    assert.equal(result.primaryRecommendation.candidate.identity.facts.brand.value, 'Sony');
    assert.equal(result.primaryRecommendation.classification, 'LKQ');
    assert.equal(result.rankingExplanation[0].decidedBy, 'classification');
    assert.ok(!result.reasonCodes.includes('PROVISIONAL_UNSOURCED_RECOMMENDATION'));
  }
});

test('refrigerator fallback: same capacity class first, then brand, then configuration; the larger model last', async () => {
  const fridge = (brand, model, capacity, configuration) => ({
    brand, model, category: 'refrigerator', availability: 'CURRENT', condition: 'NEW', identitySources: [], relationship: 'SAME_BRAND_ALTERNATIVE', relationshipSources: [], relatedModel: null,
    facts: { totalCapacityCuFt: { value: capacity }, configurationFloor: { value: configuration }, layout: { value: configuration }, installationType: { value: 'freestanding' } },
  });
  const entries = [fridge('LG', 'LRSXL3000S', 30, 'side-by-side'), fridge('GE', 'GSS25GYHFS', 25, 'side-by-side'), fridge('LG', 'LRTLS2403S', 25, 'top-freezer'), fridge('LG', 'LRSXC2606S', 25, 'side-by-side')];
  const result = await broad(entries, { query: 'LG side-by-side refrigerator 25 cu ft', grounding: tv.noGrounding });
  const names = new Map(entries.map((e) => [idOf('refrigerator', e.brand, e.model), e.model]));
  const order = [result.primaryRecommendation.candidate.identity.facts.model.value, ...result.rankingExplanation.map((entry) => names.get(entry.versusCandidateId))];
  assert.deepEqual(order, ['LRSXC2606S', 'LRTLS2403S', 'GSS25GYHFS', 'LRSXL3000S']);
  assert.equal(result.primaryRecommendation.classification, 'UNCONFIRMED');
});
