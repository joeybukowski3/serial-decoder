import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withTierBaseline, TV_PRODUCT_LINE_TIER_VERSION } from '../../lib/replacement-core/normalize-values.js';
import { evaluateReplacement } from '../../lib/replacement-core/evaluate.js';
import { televisionProfile } from '../../lib/replacement-core/profiles/television.js';
import { candidateIdentity, candidateModelYear, discoveryPriority, aggregateCandidateResults, runRetrievalProof } from '../../lib/replacement-discovery/retrieval-first.js';

const known = (value) => ({ status: 'KNOWN', value, evidenceRefs: ['retrieved-page'] });
const identity = (model, series, brand = 'Samsung') => ({ contractVersion: '1.0.0', id: model, rawQuery: null, category: 'television',
  facts: { brand: known(brand), model: known(model), ...(series ? { series: known(series) } : {}) }, evidenceRefs: ['retrieved-page'] });
const result = (model, wording = '') => ({ title: `Samsung ${model} ${wording}`, snippet: wording,
  url: `https://www.samsung.com/us/tvs/qled-tv/${model.toLowerCase()}-55-inch-qled-tv-${model.toLowerCase()}/`, domain: 'samsung.com' });
const originalFacts = { series: known('Q80 Series'), screenSizeIn: known(55), displayTechnology: known('QLED'),
  refreshHz: known(120), modelYear: known(2023) };

test('verified Q80 generations share a registered tier; unsupported families retain an assumed baseline', () => {
  for (const model of ['QN55Q80C', 'QN55Q80D']) {
    const tier = withTierBaseline(identity(model, 'Q80 Series')).facts.tier;
    assert.equal(tier.value, 'PREMIUM');
    assert.equal(tier.status, 'INFERRED');
    assert.equal(tier.basis, 'PRODUCT_LINE_REGISTRY');
    assert.equal(tier.registryVersion, TV_PRODUCT_LINE_TIER_VERSION);
  }
  const fallback = withTierBaseline(identity('QN55Q7F', 'Q7 Series')).facts.tier;
  assert.deepEqual([fallback.value, fallback.status, fallback.basis], ['PREMIUM', 'ASSUMED', 'BRAND_CATEGORY_BASELINE']);
  assert.equal(withTierBaseline(identity('QN55Q80F', 'Q80 Series')).facts.tier.status, 'ASSUMED');
  assert.equal(withTierBaseline(identity('QN55Q80D', null)).facts.tier.status, 'ASSUMED');
  assert.equal(withTierBaseline(identity('QN55Q80D', 'Q7 Series')).facts.tier.status, 'ASSUMED');
  const userOnly = identity('QN55Q80D', 'Q80 Series');
  userOnly.facts.series.evidenceRefs = ['user-input'];
  assert.equal(withTierBaseline(userOnly).facts.tier.status, 'ASSUMED');
  assert.equal(withTierBaseline(identity('QN55QN90D', 'QN90 Series')).facts.tier.value, 'UPPER_PREMIUM');
});

test('historical new wording gives no current bonus; model year puts Q80D before Q80R', () => {
  const old = result('QN55Q80R', '2019 new Samsung QLED');
  const recent = result('QN55Q80D', '2024 Samsung QLED');
  const oldIdentity = candidateIdentity(old).identity;
  const recentIdentity = candidateIdentity(recent).identity;
  assert.equal(candidateModelYear(old, oldIdentity).year, 2019);
  assert.equal(candidateModelYear(recent, recentIdentity).year, 2024);
  assert.equal(discoveryPriority(old, oldIdentity, originalFacts).reasons.includes('CURRENT_WORDING'), false);
  assert.ok(discoveryPriority(recent, recentIdentity, originalFacts).score > discoveryPriority(old, oldIdentity, originalFacts).score);
  const pool = aggregateCandidateResults([{ query: 'Q80', intent: 'SAME_FAMILY_CURRENT', results: [old, recent] }], originalFacts);
  assert.deepEqual(pool.map((entry) => entry.model), ['QN55Q80D', 'QN55Q80R']);
  const others = [result('QN55Q7F', '2025 Samsung QLED'), result('QN55Q8F', '2025 Samsung QLED')];
  const four = aggregateCandidateResults([{ query: 'offline', intent: 'SAME_FAMILY_CURRENT', results: [old, ...others, recent] }], originalFacts);
  assert.deepEqual(four.map((entry) => entry.model), ['QN55Q80D', 'QN55Q80R', 'QN55Q7F', 'QN55Q8F']);
});

test('year changes discovery only; deterministic evaluation and final score are unchanged', () => {
  const original = identity('QN55Q80C', 'Q80 Series');
  const candidate = { contractVersion: '1.0.0', candidateId: 'candidate', identity: identity('QN55Q80D', 'Q80 Series'),
    source: { kind: 'TEST' }, relationship: 'SAME_BRAND_ALTERNATIVE', discoveryConfidence: 'MEDIUM', evidenceRefs: ['retrieved-page'], providerRank: null };
  const before = evaluateReplacement({ original, candidate, profile: televisionProfile });
  discoveryPriority(result('QN55Q80D', '2024 model'), candidateIdentity(result('QN55Q80D')).identity, originalFacts);
  const after = evaluateReplacement({ original, candidate, profile: televisionProfile });
  assert.deepEqual(after.decision, before.decision);
  assert.equal(after.decision.comparisons.find((row) => row.key === 'tier').assessment, 'MATCH');
});

test('retrieved Q80C and Q80D pages establish the same registry tier in the recommendation', async () => {
  const original = result('QN55Q80C', '2023 QLED');
  const candidate = result('QN55Q80D', '2024 QLED');
  const page = (model, year) => `<html><script type="application/ld+json">{"@type":"Product","sku":"${model}AFXZA"}</script>`
    + `<title>Samsung ${model} Q80${model.at(-1)} 55-inch QLED 4K Smart TV ${year}</title>`
    + `<h1>Samsung ${model} Q80${model.at(-1)} 55-inch QLED</h1><p>Screen Size: 55 inch</p><p>Resolution: 4K</p>`
    + '<p>Native Refresh Rate: 120 Hz</p><p>Smart TV</p></html>';
  const report = await runRetrievalProof({ search: async ({ purpose }) => purpose === 'original' ? [original] : [candidate],
    fetchPage: async (url) => ({ status: 200, text: url === original.url ? page('QN55Q80C', 2023) : page('QN55Q80D', 2024) }) });
  const recommendation = report.recommendation.primary;
  assert.equal(report.original.facts.tier.basis, 'PRODUCT_LINE_REGISTRY');
  assert.equal(recommendation.normalizedOriginal.facts.tier.basis, 'PRODUCT_LINE_REGISTRY');
  assert.equal(recommendation.candidate.identity.facts.tier.basis, 'PRODUCT_LINE_REGISTRY');
  assert.equal(recommendation.decision.comparisons.find((row) => row.key === 'tier').assessment, 'MATCH');
  assert.equal(recommendation.classification, 'LKQ');
  assert.equal(recommendation.confidence, 'MEDIUM');
  assert.equal(recommendation.strongSimilaritySummary.coverage, 8 / 11);
});
