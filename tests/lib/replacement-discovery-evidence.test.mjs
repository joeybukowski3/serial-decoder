import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEvidence } from '../../lib/replacement-core/contracts.js';
import { buildClaimEvidence, classifySource, mergeEvidence, modelRelation } from '../../lib/replacement-discovery/evidence-normalizer.js';
import { applyOriginalEnrichment } from '../../lib/replacement-discovery/original-enrichment.js';
import { interpretReplacementSearch } from '../../lib/replacement-discovery/interpret.js';
import { normalizeCandidateResearch, normalizeOriginalResearch } from '../../lib/replacement-discovery/research-normalizer.js';
import { validateCandidateResearch, validateOriginalResearch } from '../../lib/replacement-discovery/research-schema.js';
import { recommendWithResearch } from '../../lib/replacement-discovery/live-recommend.js';
import { createGroundedResearchProvider } from '../../lib/replacement-discovery/providers/grounded-research-provider.js';
import { createMockTransport, makeGrounding } from '../fixtures/replacement-discovery/mock-transport.mjs';
import * as tv from '../fixtures/replacement-discovery/grounded-tv-research.mjs';

const NOW = '2026-09-30T12:00:00.000Z';
const grounding = makeGrounding(['samsung.com', 'lg.com', 'bestbuy.com', 'rtings.com', 'example-reviews.com', 'other-blog.net', 'amazon.com']);
const evidence = (overrides) => buildClaimEvidence({ fieldKey: 'refreshHz', value: 120, sources: ['samsung.com'], subjectModel: 'QN55Q80D', expectedModel: 'QN55Q80D', brand: 'Samsung', grounding, now: NOW, ...overrides });

test('manufacturer page for the exact model is first-party and makes the fact KNOWN', () => {
  const result = evidence();
  assert.deepEqual([result.status, result.basis, result.bestRank], ['KNOWN', 'MANUFACTURER_SOURCE', 1]);
  const [record] = result.records;
  assert.equal(record.sourceClass, 'MANUFACTURER');
  assert.equal(record.firstParty, true);
  assert.equal(record.confidence, 'HIGH');
  assert.equal(record.observedAt, NOW);
  assert.match(record.url, /^https:\/\//);
  assert.deepEqual(record.claim, { fieldKey: 'refreshHz', value: 120, subjectModel: 'QN55Q80D', modelRelation: 'EXACT' });
});

test('source quality ladder: retailer KNOWN, technical database and other grounded INFERRED, unsourced ASSUMED', () => {
  assert.deepEqual([evidence({ sources: ['bestbuy.com'] }).status, evidence({ sources: ['bestbuy.com'] }).basis], ['KNOWN', 'RETAILER_EXACT_MODEL_SOURCE']);
  assert.deepEqual([evidence({ sources: ['rtings.com'] }).status, evidence({ sources: ['rtings.com'] }).basis], ['INFERRED', 'TECHNICAL_DATABASE_SOURCE']);
  assert.equal(evidence({ sources: ['example-reviews.com'] }).status, 'INFERRED');
  const unsourced = evidence({ sources: [] });
  assert.deepEqual([unsourced.status, unsourced.basis, unsourced.bestRank], ['ASSUMED', 'PROVIDER_UNSOURCED', 5]);
  assert.deepEqual([unsourced.records[0].sourceClass, unsourced.records[0].firstParty, unsourced.records[0].url], ['PROVIDER', false, null]);
});

test('two independent weaker sources corroborate a fact to KNOWN; one does not', () => {
  assert.equal(evidence({ sources: ['example-reviews.com', 'other-blog.net'] }).status, 'KNOWN');
  assert.equal(evidence({ sources: ['example-reviews.com', 'example-reviews.com'] }).status, 'INFERRED');
});

test('corroboration needs the right model and distinct grounded citations, not distinct claimed strings', () => {
  const oneBlog = makeGrounding(['blog.example.com']);
  const claimed = ['example.com', 'blog.example.com'];
  assert.equal(evidence({ sources: claimed, grounding: oneBlog }).status, 'INFERRED');
  assert.equal(evidence({ sources: ['example-reviews.com', 'other-blog.net'], subjectModel: 'QN1ZZZ' }).status, 'INFERRED');
  assert.equal(evidence({ sources: ['example-reviews.com', 'other-blog.net'], subjectModel: null }).status, 'INFERRED');
  assert.equal(evidence({ sources: ['example-reviews.com', 'other-blog.net'] }).status, 'KNOWN');
});

test('a page-controlled grounding title cannot impersonate a manufacturer', () => {
  const spoofed = { sources: [{ title: 'samsung.com', domain: 'samsung.com', uri: 'https://evil.example.net/landing' }] };
  const result = evidence({ grounding: spoofed });
  assert.deepEqual([result.status, result.bestRank], ['ASSUMED', 5]);
  const genuine = { sources: [{ title: 'samsung.com', domain: 'samsung.com', uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc' }] };
  assert.equal(evidence({ grounding: genuine }).status, 'KNOWN');
  const direct = { sources: [{ title: 'Samsung', domain: 'whatever.example', uri: 'https://www.samsung.com/us/tvs/' }] };
  assert.equal(evidence({ grounding: direct }).status, 'KNOWN');
});

test('a claimed domain absent from grounding cannot fabricate a citation', () => {
  const result = evidence({ sources: ['samsung-fake.example'] });
  assert.equal(result.status, 'ASSUMED');
  assert.equal(result.records[0].url, null);
  assert.deepEqual(result.records[0].claim.unresolvedSources, ['samsung-fake.example']);
  assert.equal(evidence({ grounding: null }).status, 'ASSUMED');
});

test('source authority is brand-specific and marketplaces are never authoritative', () => {
  assert.equal(classifySource('samsung.com', 'Samsung').sourceClass, 'MANUFACTURER');
  assert.equal(classifySource('lg.com', 'Samsung').sourceClass, 'OTHER');
  assert.equal(evidence({ sources: ['lg.com'] }).bestRank, 4);
  const marketplace = evidence({ sources: ['amazon.com'] });
  assert.deepEqual([marketplace.bestRank, marketplace.status], [5, 'ASSUMED']);
});

test('a page about a different or unstated model demotes a manufacturer source to inferred', () => {
  assert.equal(evidence({ subjectModel: 'QN65Q80D' }).status, 'INFERRED');
  assert.equal(evidence({ subjectModel: null }).status, 'INFERRED');
  assert.equal(evidence({ subjectModel: 'QN55Q80D' }).status, 'KNOWN');
});

test('model variants: candidates tolerate a regional suffix, originals stay strict', () => {
  assert.equal(modelRelation('QN55Q80D', 'QN55Q80D'), 'EXACT');
  assert.equal(modelRelation('QN55Q80DAFXZA', 'qn55q80d'), 'VARIANT');
  assert.equal(modelRelation('QN55Q80', 'QN55Q80DAFXZAEXTRA'), 'DIFFERENT');
  assert.equal(modelRelation('ABC', 'ABCD'), 'DIFFERENT');
  assert.equal(modelRelation(null, 'QN55Q80D'), 'UNKNOWN');
  assert.equal(evidence({ subjectModel: 'QN55Q80DAFXZA', allowVariant: true }).status, 'KNOWN');
  assert.equal(evidence({ subjectModel: 'QN55Q80DAFXZA', allowVariant: false }).status, 'INFERRED');
});

test('evidence IDs are stable and merging de-duplicates them', () => {
  const a = evidence(), b = evidence();
  assert.equal(a.records[0].evidenceId, b.records[0].evidenceId);
  assert.equal(mergeEvidence(a.records, b.records).length, 1);
});

test('every EvidenceRecord from an end-to-end run satisfies the Phase 1 evidence contract', async () => {
  const transport = createMockTransport({ original: tv.tvOriginalResearch, candidates: tv.tvCandidatesResearch, grounding: tv.tvGrounding });
  const result = await recommendWithResearch({ query: 'Samsung QN55Q80', researchProvider: createGroundedResearchProvider({ transport, now: () => NOW }) });
  assert.ok(result.research.evidence.length > 0);
  for (const record of result.research.evidence) assert.deepEqual(validateEvidence(record), [], record.evidenceId);
});

const originalFor = (query, notes = '') => interpretReplacementSearch({ query, notes }).normalizedOriginal;
const enrich = (query, payload, notes) => {
  const original = originalFor(query, notes);
  const validated = validateOriginalResearch({ original: payload }, original.category);
  return normalizeOriginalResearch({ validated, original, grounding: tv.tvGrounding, now: NOW });
};

test('tier: evidenced model-line tier is INFERRED; price, baseline and unsourced claims never change tier', () => {
  const claim = (overrides) => ({ tier: { value: 'PREMIUM', basis: 'MODEL_LINE', sources: ['samsung.com'], subjectModel: 'QN55Q80C', ...overrides } });
  const accepted = enrich('Samsung QN55Q80', claim({}));
  assert.deepEqual([accepted.facts.tier.status, accepted.facts.tier.basis], ['INFERRED', 'MODEL_LINE_EVIDENCE']);
  assert.ok(!('tier' in enrich('Samsung QN55Q80', claim({ basis: 'PRICE' })).facts));
  assert.ok(enrich('Samsung QN55Q80', claim({ basis: 'PRICE' })).warnings.some((warning) => warning.code === 'TIER_FROM_PRICE_REJECTED'));
  assert.ok(!('tier' in enrich('Samsung QN55Q80', claim({ basis: 'BRAND_CATEGORY' })).facts));
  const unsourced = enrich('Samsung QN55Q80', claim({ sources: ['not-grounded.example'] }));
  assert.ok(!('tier' in unsourced.facts));
  assert.ok(unsourced.warnings.some((warning) => warning.code === 'TIER_UNSOURCED_REJECTED'));
  assert.ok(!('tier' in enrich('Samsung QN55Q80', { tier: { value: 'PLATINUM', basis: 'MODEL_LINE' } }).facts));
});

test('an original whose model token is only a prefix of the researched model is an inference, not KNOWN', () => {
  const partial = enrich('Samsung QN55Q80', { facts: { refreshHz: { value: 120, sources: ['samsung.com'], subjectModel: 'QN55Q80C' } } });
  assert.equal(partial.facts.refreshHz.status, 'INFERRED');
  const full = enrich('Samsung QN55Q80DAFXZA', { facts: { refreshHz: { value: 120, sources: ['samsung.com'], subjectModel: 'QN55Q80D' } } });
  assert.equal(full.facts.refreshHz.status, 'KNOWN');
});

test('canonical model: compatible resolution is an inference; an unrelated model is rejected; several matches stay AMBIGUOUS', () => {
  const resolved = enrich('Samsung QN55Q80', { canonicalModel: { value: 'QN55Q80C', sources: ['samsung.com'] } });
  assert.deepEqual([resolved.facts.canonicalModel.status, resolved.facts.canonicalModel.basis], ['INFERRED', 'CANONICAL_MODEL_INFERENCE']);
  const same = enrich('Samsung QN55Q80C', { canonicalModel: { value: 'QN55Q80C', sources: ['samsung.com'] } });
  assert.equal(same.facts.canonicalModel.status, 'KNOWN');
  const mismatch = enrich('Samsung QN55Q80', { canonicalModel: { value: 'UN43T5300', sources: ['samsung.com'] } });
  assert.ok(!('canonicalModel' in mismatch.facts));
  assert.ok(mismatch.warnings.some((warning) => warning.code === 'CANONICAL_MODEL_MISMATCH'));
  const ambiguous = enrich('Samsung QN55Q80', { possibleModels: ['QN55Q80B', 'QN55Q80C', 'UN43T5300'] });
  assert.deepEqual(ambiguous.facts.canonicalModel.alternatives, ['QN55Q80B', 'QN55Q80C']);
});

const researched = (status, value, basis = 'GROUNDED_SEARCH_SOURCE') => ({ status, value, evidenceRefs: ['ev-1'], basis });
const merge = (query, facts, notes) => applyOriginalEnrichment(interpretReplacementSearch({ query, notes }), { facts, evidence: [{ evidenceId: 'ev-1' }] });

test('merge: the user KNOWN fact always wins; agreement adds evidence, conflict adds a warning', () => {
  const conflict = merge('Samsung 55 inch QLED TV', { screenSizeIn: researched('KNOWN', 65, 'MANUFACTURER_SOURCE') });
  assert.equal(conflict.interpretation.normalizedOriginal.facts.screenSizeIn.value, 55);
  assert.deepEqual(conflict.warnings, [{ code: 'RESEARCH_CONFLICTS_WITH_INPUT', key: 'screenSizeIn' }]);
  const agree = merge('Samsung 55 inch QLED TV', { screenSizeIn: researched('KNOWN', 55, 'MANUFACTURER_SOURCE') });
  assert.deepEqual(agree.interpretation.normalizedOriginal.facts.screenSizeIn.evidenceRefs, ['user-input', 'ev-1']);
  assert.deepEqual(agree.warnings, []);
  const explicitTier = merge('Samsung 55 inch QLED TV', { tier: researched('INFERRED', 'LUXURY', 'MODEL_LINE_EVIDENCE') }, 'tier: value');
  assert.equal(explicitTier.interpretation.normalizedOriginal.facts.tier.value, 'VALUE');
});

test('merge: an inference is upgraded by agreeing KNOWN research and becomes AMBIGUOUS when KNOWN research disagrees', () => {
  const up = merge('Samsung QN55Q80', { screenSizeIn: researched('KNOWN', 55, 'MANUFACTURER_SOURCE') }).interpretation.normalizedOriginal.facts.screenSizeIn;
  assert.deepEqual([up.status, up.basis], ['KNOWN', 'MANUFACTURER_SOURCE']);
  const clash = merge('Samsung QN55Q80', { screenSizeIn: researched('KNOWN', 65, 'MANUFACTURER_SOURCE') });
  assert.deepEqual([clash.interpretation.normalizedOriginal.facts.screenSizeIn.status, clash.interpretation.normalizedOriginal.facts.screenSizeIn.alternatives], ['AMBIGUOUS', [55, 65]]);
  const weak = merge('Samsung QN55Q80', { screenSizeIn: researched('INFERRED', 65) });
  assert.equal(weak.interpretation.normalizedOriginal.facts.screenSizeIn.value, 55);
  assert.equal(weak.warnings[0].code, 'RESEARCH_CONFLICTS_WITH_INFERENCE');
});

test('merge: research replaces an ASSUMED baseline only when it is resolved, and unsourced research stays an assumption', () => {
  const replaced = merge('55 Samsung QLED TV', { tier: researched('INFERRED', 'UPPER_PREMIUM', 'MODEL_LINE_EVIDENCE') }).interpretation.normalizedOriginal.facts.tier;
  assert.deepEqual([replaced.status, replaced.value], ['INFERRED', 'UPPER_PREMIUM']);
  const kept = merge('55 Samsung QLED TV', { tier: researched('ASSUMED', 'LUXURY', 'PROVIDER_UNSOURCED') }).interpretation.normalizedOriginal.facts.tier;
  assert.deepEqual([kept.status, kept.value, kept.basis], ['ASSUMED', 'PREMIUM', 'BRAND_CATEGORY_BASELINE']);
  const filled = merge('55 Samsung QLED TV', { refreshHz: researched('ASSUMED', 120, 'PROVIDER_UNSOURCED') }).interpretation;
  assert.equal(filled.normalizedOriginal.facts.refreshHz.status, 'ASSUMED');
  assert.ok(filled.unknownImportantFacts.some((item) => item.key === 'refreshHz'));
});

test('enrichment re-derives hints so discovery sees the researched original', () => {
  const { interpretation } = merge('55 Samsung QLED TV', { resolution: researched('KNOWN', '4K', 'MANUFACTURER_SOURCE') });
  assert.deepEqual(interpretation.candidateDiscoveryHints.minimumResolution, { value: '4K', status: 'KNOWN' });
  assert.ok(!interpretation.unknownImportantFacts.some((item) => item.key === 'resolution'));
});

const discover = (candidate, query = 'Samsung QN55Q80') => {
  const original = originalFor(query);
  const validated = validateCandidateResearch({ candidates: [candidate] }, original.category);
  return normalizeCandidateResearch({ validated, original, grounding: tv.tvGrounding, now: NOW, limit: 6 });
};

test('candidate discovery confidence is derived from evidence, then only ever lowered by the provider', () => {
  assert.equal(discover(tv.currentQled55).drafts[0].discoveryConfidence, 'HIGH');
  assert.equal(discover({ ...tv.currentQled55, providerConfidence: 'low' }).drafts[0].discoveryConfidence, 'LOW');
  assert.equal(discover({ ...tv.currentQled55, availability: 'UNKNOWN' }).drafts[0].discoveryConfidence, 'MEDIUM');
  assert.equal(discover({ ...tv.currentQled55, identitySources: [] }).drafts[0].discoveryConfidence, 'LOW');
  assert.equal(discover({ ...tv.currentQled55, identitySources: ['rtings.com'] }).drafts[0].discoveryConfidence, 'MEDIUM');
  // A manufacturer-confirmed identity does not make unsourced or sparse specs trustworthy.
  const unsourced = (facts) => ({ ...tv.currentQled55, facts });
  assert.equal(discover(unsourced({ screenSizeIn: 55, resolution: '4K' })).drafts[0].discoveryConfidence, 'MEDIUM');
  assert.equal(discover(unsourced({ screenSizeIn: 55, resolution: '4K', refreshHz: 120, smart: true })).drafts[0].discoveryConfidence, 'MEDIUM');
  const sourced = (value) => ({ value, sources: ['samsung.com'], subjectModel: 'QN55Q80D' });
  const sparse = { screenSizeIn: sourced(55), resolution: sourced('4K') };
  assert.equal(discover({ ...tv.currentQled55, facts: sparse, tier: null }).drafts[0].discoveryConfidence, 'MEDIUM');
  assert.equal(discover({ ...tv.currentQled55, facts: { ...sparse, refreshHz: sourced(120) }, tier: null }).drafts[0].discoveryConfidence, 'HIGH');
});

test('a clearly labeled baseline candidate is allowed only without a model and is always LOW confidence', () => {
  const baseline = { ...tv.currentQled55, model: undefined, baselineLabel: 'Mainstream 55-inch Samsung QLED' };
  const [draft] = discover(baseline, '55 Samsung QLED TV').drafts;
  assert.deepEqual([draft.source.baseline, draft.source.baselineLabel, draft.discoveryConfidence], [true, 'Mainstream 55-inch Samsung QLED', 'LOW']);
  assert.ok(!('model' in draft.facts));
  const dressedUp = { ...baseline, relationship: 'DIRECT_SUCCESSOR', relationshipSources: ['samsung.com'] };
  assert.equal(discover(dressedUp, '55 Samsung QLED TV').drafts[0].relationship, 'FUNCTIONAL_EQUIVALENT');
});

test('duplicate models collapse and the pool limit is enforced with explicit reasons', () => {
  const original = originalFor('Samsung QN55Q80');
  const validated = validateCandidateResearch({ candidates: [tv.currentQled55, { ...tv.currentQled55 }, tv.neoQled, tv.crossBrand] }, original.category);
  const result = normalizeCandidateResearch({ validated, original, grounding: tv.tvGrounding, now: NOW, limit: 2 });
  assert.equal(result.drafts.length, 2);
  assert.deepEqual(result.rejected.map((item) => item.reasonCode), ['DUPLICATE_MODEL', 'POOL_LIMIT_APPLIED']);
});
