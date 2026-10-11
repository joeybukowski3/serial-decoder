import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateReplacement } from '../../lib/replacement-core/evaluate.js';
import { televisionProfile } from '../../lib/replacement-core/profiles/television.js';
import { refrigeratorProfile } from '../../lib/replacement-core/profiles/refrigerator.js';
import { findMaterialRegressions, MATERIAL_REGRESSION_RATIO } from '../../lib/replacement-core/regression.js';
import { familyIntegrity, rankEvaluations, decidingRankKey, selectRecommendations } from '../../lib/replacement-discovery/candidate-ranker.js';
import { evaluateRecommendationFloor, MIN_STRONG_COVERAGE } from '../../lib/replacement-discovery/quality-floor.js';
import { aggregateCandidateResults, applySizePolicy, parseSamsungTvModel, planCandidateQueries, successorModelHypotheses } from '../../lib/replacement-discovery/retrieval-first.js';
import { recommendByRetrieval } from '../../lib/replacement-discovery/live-retrieval.js';
import { buildPublicResponse, isValidPublicResponse } from '../../lib/replacement-public/contract.js';
import { q7fPage, q7fUrl, q80cPage, q80cUrl, result, tvProviders, fridgeProviders } from '../helpers/replacement-public-fixtures.mjs';
import { RETAIL_NOW, withPurchasePath } from '../helpers/retail-evidence.mjs';

/** Successor-first discovery, family integrity, verified-regression handling and the primary quality floor (television). */

const known = (value, refs = ['page']) => ({ status: 'KNOWN', value, evidenceRefs: refs });
const inferred = (value) => ({ status: 'INFERRED', value, evidenceRefs: ['page'] });
const identity = (model, facts) => ({ contractVersion: '1.0.0', id: model, rawQuery: null, category: 'television', evidenceRefs: ['page'],
  facts: { brand: known('Samsung'), model: known(model), ...facts } });
const original = identity('QN55Q80C', { series: known('Q80 Series'), screenSizeIn: known(55), resolution: known('4K'), displayTechnology: known('QLED'),
  refreshHz: known(120), smart: known(true), hdr: known('QUANTUM HDR+') });
const candidate = (model, facts) => ({ contractVersion: '1.0.0', candidateId: model, identity: identity(model, facts), source: { kind: 'TEST' },
  relationship: 'SAME_BRAND_ALTERNATIVE', discoveryConfidence: 'MEDIUM', evidenceRefs: ['page'], providerRank: null });
const evaluate = (model, facts) => evaluateReplacement({ original, candidate: candidate(model, facts), profile: televisionProfile });
const full = { screenSizeIn: known(55), resolution: known('4K'), displayTechnology: known('QLED'), smart: known(true), hdr: known('QUANTUM HDR+') };
const fullQ80 = (model, extra = {}) => evaluate(model, { ...full, series: known('Q80 Series'), refreshHz: known(120), ...extra });
const modelOf = (evaluation) => evaluation.candidate.identity.facts.model.value;

test('successor-first plan: exact later-generation models, then same family, then a documented higher line, then performance class', () => {
  const parts = parseSamsungTvModel('QN55Q80C');
  assert.deepEqual(parts, { size: 55, prefix: 'Q', family: '80', generation: 'C' });
  assert.deepEqual(successorModelHypotheses(parts), ['QN55Q80D', 'QN55Q80F', 'QN55Q80H', 'QN55QN80D', 'QN55QN80F', 'QN55QN80H']);
  const plan = planCandidateQueries({ series: known('Q80 Series'), screenSizeIn: known(55), displayTechnology: known('QLED'), resolution: known('4K'), refreshHz: known(120) }, 'QN55Q80C');
  assert.deepEqual(plan.map((entry) => entry.intent), ['SAME_FAMILY_SUCCESSOR_MODELS', 'SAME_FAMILY_CURRENT', 'ADJACENT_HIGHER_FAMILY', 'SAME_PERFORMANCE_CLASS']);
  assert.match(plan[0].query, /QN55Q80D OR QN55Q80F OR QN55Q80H/);
  assert.match(plan[2].query, /QN90 55/);
  assert.ok(plan.every((entry) => entry.query.endsWith('site:samsung.com/us')));
  assert.ok(plan.length <= 4);
  // The earlier generation and the original itself are never search targets, and nothing is hardcoded to one result.
  assert.equal(plan[0].query.includes('QN55Q80R'), false);
  assert.equal(plan[0].query.includes('QN55Q80C'), false);
  assert.deepEqual(successorModelHypotheses(parseSamsungTvModel('QN55Q80H')), []);
  assert.equal(parseSamsungTvModel('K-55XR80'), null);
});

test('1: the same-family exact-size candidate beats a lower-family candidate', () => {
  const sameFamily = fullQ80('QN55Q80D');
  const lowerFamily = evaluate('QN55Q7F', { ...full, series: known('Q7 Series'), refreshHz: known(120) });
  const ranked = rankEvaluations([lowerFamily, sameFamily]);
  assert.equal(modelOf(ranked[0]), 'QN55Q80D');
  assert.equal(familyIntegrity(sameFamily), 0);
  assert.equal(familyIntegrity(lowerFamily), 3);
});

test('2: a lower-family candidate cannot win merely because it has more extracted fields', () => {
  // Same-family candidate with sparse extraction against a different family with every field extracted.
  const sparse = evaluate('QN55Q80F', { screenSizeIn: known(55), resolution: known('4K'), displayTechnology: known('QLED'), series: known('Q80 Series') });
  const complete = evaluate('QN55Q7F', { ...full, series: known('Q7 Series'), refreshHz: known(120) });
  assert.equal(sparse.classification, 'UNCONFIRMED');
  assert.equal(complete.classification, 'UNCONFIRMED');
  assert.ok(complete.decision.score.weightedTotal > sparse.decision.score.weightedTotal, 'the complete candidate does score higher');
  const ranked = rankEvaluations([complete, sparse]);
  assert.equal(modelOf(ranked[0]), 'QN55Q80F');
  assert.equal(decidingRankKey(ranked[0], ranked[1]), 'product family integrity');
});

test('3: wrong-size candidates do not consume priority slots ahead of exact-size candidates', () => {
  const sizes = (models) => models.map((model, index) => ({ model, discoveryPriority: { score: 100 - index } }));
  // Scored highest, but the wrong size: smaller never survives, larger only fills when few exact-size candidates exist.
  const crowded = sizes(['QN65Q80D', 'QN50Q80D', 'QN55Q80D', 'QN55Q80F', 'QN55QN85F', 'QN65Q80F']);
  assert.deepEqual(applySizePolicy(crowded, 55).map((item) => item.model), ['QN55Q80D', 'QN55Q80F', 'QN55QN85F']);
  const sparse = sizes(['QN65Q80D', 'QN55Q80D', 'QN75Q80D', 'QN55Q80F']);
  assert.deepEqual(applySizePolicy(sparse, 55).map((item) => item.model), ['QN55Q80D', 'QN55Q80F', 'QN65Q80D']);
  assert.deepEqual(applySizePolicy(crowded, null).map((item) => item.model), crowded.map((item) => item.model));

  const searchResult = (model, slug) => ({ title: `Samsung ${model}`, url: `https://www.samsung.com/us/tvs/qled-tv/${slug}/`, domain: 'samsung.com', snippet: `Samsung ${model} 2024` });
  const results = [
    searchResult('QN65Q80D', 'q80d-65-inch-qled-4k-smart-tv-qn65q80dafxza'), searchResult('QN55Q80D', 'q80d-55-inch-qled-4k-smart-tv-qn55q80dafxza'),
    searchResult('QN55Q80F', 'q80f-55-inch-qled-4k-smart-tv-qn55q80fafxza'), searchResult('QN50Q80D', 'q80d-50-inch-qled-4k-smart-tv-qn50q80dafxza'),
  ];
  const pool = aggregateCandidateResults([{ query: 'q', intent: 'SAME_FAMILY_CURRENT', results }], { series: known('Q80 Series'), screenSizeIn: known(55) }, 'QN55Q80C');
  assert.deepEqual(pool.map((item) => item.model), ['QN55Q80D', 'QN55Q80F', 'QN65Q80D']);
});

test('4: a verified 120 Hz original against a verified materially lower refresh candidate is a material regression', () => {
  const regressed = fullQ80('QN55Q80D', { refreshHz: known(60) });
  assert.deepEqual(regressed.decision.materialRegressions, [{ key: 'refreshHz', reasonCode: 'MATERIAL_PERFORMANCE_REGRESSION' }]);
  assert.ok(regressed.decision.reasonCodes.includes('MATERIAL_PERFORMANCE_REGRESSION'));
  assert.notEqual(regressed.classification, 'LKQ');
  assert.notEqual(regressed.classification, 'ABOVE_LKQ');
  assert.ok(evaluateRecommendationFloor(regressed).reasons.includes('MATERIAL_PERFORMANCE_REGRESSION'));
  // A smaller difference is not material, and a lost verified smart-TV capability is.
  assert.equal(fullQ80('QN55Q80D', { refreshHz: known(100) }).decision.materialRegressions.length, 0);
  assert.ok(100 >= 120 * MATERIAL_REGRESSION_RATIO);
  assert.equal(fullQ80('QN55Q80D', { smart: known(false) }).decision.materialRegressions[0].key, 'smart');
  // It ranks behind an otherwise identical candidate without one.
  const ranked = rankEvaluations([regressed, fullQ80('QN55Q80F')]);
  assert.equal(modelOf(ranked[0]), 'QN55Q80F');
  assert.equal(decidingRankKey(ranked[0], ranked[1]), 'verified performance regression');
});

test('5: a verified original refresh against an UNKNOWN candidate refresh stays needs-verification, not a regression', () => {
  const unknownRefresh = evaluate('QN55Q80D', { ...full, series: known('Q80 Series') });
  const row = unknownRefresh.decision.comparisons.find((item) => item.key === 'refreshHz');
  assert.equal(row.assessment, 'UNVERIFIED');
  assert.deepEqual(unknownRefresh.decision.materialRegressions, []);
  assert.equal(unknownRefresh.decision.reasonCodes.includes('MATERIAL_PERFORMANCE_REGRESSION'), false);
  // Unknown is neither a regression nor a floor failure: it stays a needs-verification item and confidence stays below HIGH.
  assert.deepEqual(evaluateRecommendationFloor(unknownRefresh), { applies: true, met: true, reasons: [] });
  assert.notEqual(unknownRefresh.confidence, 'HIGH');
  // Regressions are only reported for verified values: an assumed candidate value is never one.
  assert.deepEqual(findMaterialRegressions('television', [{ key: 'refreshHz', bucket: 'STRONG', assessment: 'ASSUMED', original: known(120), replacement: { status: 'ASSUMED', value: 60, evidenceRefs: [] } }]), []);
});

test('6: a generic assumed tier is not a verified HARD pass; only the same series inherits the original tier', () => {
  const differentFamily = evaluate('QN55Q7F', { ...full, series: known('Q7 Series'), refreshHz: known(120) });
  const tier = differentFamily.decision.comparisons.find((row) => row.key === 'tier');
  assert.equal(tier.assessment, 'ASSUMED');
  assert.equal(differentFamily.candidate.identity.facts.tier.basis, 'BRAND_CATEGORY_BASELINE');
  assert.equal(differentFamily.decision.eligible, null);
  assert.ok(evaluateRecommendationFloor(differentFamily).reasons.includes('HARD_REQUIREMENT_UNVERIFIED'));

  const sameFamily = fullQ80('QN55Q80F');
  assert.equal(sameFamily.candidate.identity.facts.tier.basis, 'SAME_SERIES_AS_ORIGINAL');
  assert.equal(sameFamily.candidate.identity.facts.tier.status, 'INFERRED');
  assert.equal(sameFamily.decision.eligible, true);
  // A series that only the user typed in, or a missing series, inherits nothing from the series path. (A line the registry documents
  // as the original's own lineage is a separate, explicit rule: see family-lineage-alternatives.test.mjs.)
  const userOnly = evaluate('QN55Q7F', { ...full, series: known('Q7 Series', ['user-input']), refreshHz: known(120) });
  assert.equal(userOnly.candidate.identity.facts.tier.basis, 'BRAND_CATEGORY_BASELINE');
  assert.equal(evaluate('QN55Q7F', { ...full, refreshHz: known(120) }).candidate.identity.facts.tier.basis, 'BRAND_CATEGORY_BASELINE');
});

test('7: a same-family current product with less complete extraction beats a lower-family product when the evidence supports it', () => {
  const lessComplete = evaluate('QN55Q80F', { screenSizeIn: known(55), resolution: known('4K'), displayTechnology: known('QLED'), smart: known(true), series: known('Q80 Series') });
  const lowerFamilyComplete = evaluate('QN55Q7F', { ...full, series: known('Q7 Series'), refreshHz: known(120) });
  assert.equal(lessComplete.classification, 'LKQ');
  assert.equal(lowerFamilyComplete.classification, 'UNCONFIRMED');
  const ranked = rankEvaluations([lowerFamilyComplete, lessComplete]);
  assert.equal(modelOf(ranked[0]), 'QN55Q80F');
  // The less complete candidate is a normal recommendation but not a confident one, and a complete same-family candidate
  // still outranks it on the evidence it adds.
  assert.deepEqual(evaluateRecommendationFloor(lessComplete), { applies: true, met: true, reasons: [] });
  assert.notEqual(lessComplete.confidence, 'HIGH');
  const completeSame = fullQ80('QN55Q80D');
  assert.deepEqual(evaluateRecommendationFloor(completeSame), { applies: true, met: true, reasons: [] });
  assert.equal(modelOf(rankEvaluations([lessComplete, completeSame])[0]), 'QN55Q80D');
});

test('the quality floor needs verified hard rules, a normal classification, enough strong evidence and no verified downgrade', () => {
  assert.equal(MIN_STRONG_COVERAGE, 0.5);
  const q7f = evaluate('QN55Q7F', { screenSizeIn: known(55), resolution: known('4K'), displayTechnology: known('QLED'), smart: known(true), series: known('Q7 Series') });
  assert.deepEqual(evaluateRecommendationFloor(q7f).reasons, ['HARD_REQUIREMENT_UNVERIFIED', 'CLASSIFICATION_BELOW_FLOOR']);
  const sparse = evaluate('QN55Q80F', { screenSizeIn: known(55), resolution: known('4K'), displayTechnology: known('QLED'), series: known('Q80 Series') });
  assert.deepEqual(evaluateRecommendationFloor(sparse).reasons, ['CLASSIFICATION_BELOW_FLOOR', 'STRONG_EVIDENCE_BELOW_FLOOR']);
  const smaller = fullQ80('QN50Q80D', { screenSizeIn: known(50) });
  assert.ok(evaluateRecommendationFloor(smaller).reasons.includes('HARD_FAILURE'));
  const better = selectRecommendations(rankEvaluations([fullQ80('QN55Q80D'), q7f]));
  assert.equal(modelOf(better.primaryRecommendation), 'QN55Q80D');
  assert.deepEqual(better.rejectedSummary.map((item) => item.reasonCode), ['BELOW_QUALITY_FLOOR']);
  assert.deepEqual(better.alternatives, []);
});

test('10: refrigerator behavior is untouched by the television floor, family and regression rules', async () => {
  const outcome = await recommendByRetrieval({ category: 'refrigerator', brand: 'LG', model: 'LF25H6200S', deps: { ...fridgeProviders().deps, retailNow: RETAIL_NOW } });
  const primary = outcome.report.recommendation.primary;
  assert.deepEqual(evaluateRecommendationFloor(primary), { applies: false, met: true, reasons: [] });
  assert.equal(familyIntegrity(primary), 0);
  assert.deepEqual(primary.decision.materialRegressions, []);
  assert.deepEqual(findMaterialRegressions(refrigeratorProfile.category, [{ key: 'refreshHz', bucket: 'STRONG', assessment: 'DIFFERENT', original: known(120), replacement: known(30) }]), []);
  const response = buildPublicResponse(outcome, { requestId: 'req', elapsedMs: 1 });
  assert.equal(response.primary.recommendationLevel, 'RECOMMENDED');
  assert.equal(isValidPublicResponse(response), true);
});

// ---- pipeline: discovery -> retail gate -> LKQ -> floor -> public contract ------------------------------------------------

const strongPage = (model, { refresh = '120 Hz', hdr = 'Quantum HDR+' } = {}) => {
  const [, family] = model.match(/^QN\d{2}(Q\d{2})[A-Z]$/) || [];
  return withPurchasePath(`<html><title>Samsung 55" ${family}${model.slice(-1)} QLED 4K Smart TV (${model})</title><h1>Samsung 55" ${family}${model.slice(-1)} QLED 4K Smart TV ${model}</h1>`
    + '<p>Screen Size</p><p>55"</p><p>Resolution</p><p>3,840 x 2,160</p><p>Product</p><p>QLED</p>'
    + `${refresh ? `<p>Refresh Rate</p><p>${refresh}</p>` : ''}<p>Operating System</p><p>Tizen Smart TV</p>${hdr ? `<p>HDR (High Dynamic Range)</p><p>${hdr}</p>` : ''}</html>`);
};
const slug = (model, size = '55') => `https://www.samsung.com/us/tvs/qled-tv/${model.slice(4, 8).toLowerCase()}-${size}-inch-qled-4k-smart-tv-${model.toLowerCase()}afxza/`;
const hit = (model, size, rank) => result(`Samsung ${model} ${size}-inch QLED 4K TV`, slug(model, size), rank);
const run = async (candidates, pages) => {
  const providers = tvProviders({ original: [result('Samsung QN55Q80C specs', q80cUrl)], candidates, pages: { [q80cUrl]: q80cPage, ...pages } });
  const outcome = await recommendByRetrieval({ category: 'television', brand: 'Samsung', model: 'QN55Q80C', deps: providers.deps });
  return { outcome, providers, response: buildPublicResponse(outcome, { requestId: 'req', elapsedMs: 1 }) };
};
const q7fHit = result('Samsung QN55Q7F 55-inch QLED TV', q7fUrl, 1);

test('pipeline: the current same-family successor is the recommended primary and the lower-family Q7F is not shown beside it', async () => {
  const { outcome, response } = await run([q7fHit, hit('QN55Q80D', '55', 5)], { [q7fUrl]: q7fPage, [slug('QN55Q80D')]: strongPage('QN55Q80D') });
  const primary = outcome.report.recommendation.primary;
  assert.equal(modelOf(primary), 'QN55Q80D');
  assert.equal(primary.classification, 'LKQ');
  assert.equal(evaluateRecommendationFloor(primary).met, true);
  assert.equal(response.primary.recommendationLevel, 'RECOMMENDED');
  assert.equal(response.primary.isBestAvailableOnly, false);
  assert.equal(response.primary.retail.statusLabel, 'AVAILABLE NEW');
  assert.equal(response.warnings.some((item) => item.code === 'NO_CONFIRMED_LKQ'), false);
  assert.deepEqual(response.alternatives, []);
  assert.deepEqual(outcome.report.recommendation.rejectedSummary.map((item) => item.reasonCode), ['BELOW_QUALITY_FLOOR']);
});

test('pipeline: when only a weak current product exists it is returned distinctly as the best available, never as a recommendation', async () => {
  const { response } = await run([q7fHit], { [q7fUrl]: q7fPage });
  assert.equal(response.primary.model, 'QN55Q7F');
  assert.equal(response.primary.recommendationLevel, 'BEST_AVAILABLE');
  assert.equal(response.primary.isBestAvailableOnly, true);
  assert.equal(response.primary.retail.purchaseStatus, 'AVAILABLE');
  const warning = response.warnings.find((item) => item.code === 'NO_CONFIRMED_LKQ');
  assert.equal(warning.severity, 'BLOCKING');
  assert.match(response.primary.explanation, /No current model could be confirmed as a like-kind-and-quality replacement/);
  assert.equal(isValidPublicResponse(response), true);
  assert.equal(isValidPublicResponse({ ...response, primary: { ...response.primary, recommendationLevel: 'EQUIVALENT' } }), false);
});

test('pipeline: a verified 60 Hz successor is never a normal recommendation', async () => {
  const { response, outcome } = await run([hit('QN55Q80D', '55', 1)], { [slug('QN55Q80D')]: strongPage('QN55Q80D', { refresh: '60 Hz' }) });
  assert.deepEqual(outcome.report.recommendation.primary.decision.materialRegressions.map((item) => item.key), ['refreshHz']);
  assert.equal(response.primary.recommendationLevel, 'BEST_AVAILABLE');
  assert.ok(response.warnings.some((item) => item.code === 'NO_CONFIRMED_LKQ'));
});

test('pipeline: slots go to exact-size candidates and wrong sizes are never fetched when enough exact sizes exist', async () => {
  const exact = ['QN55Q80D', 'QN55Q80F', 'QN55Q7F'];
  const wrong = [hit('QN65Q80D', '65', 1), hit('QN50Q80D', '50', 2)];
  const { providers, outcome } = await run([...wrong, hit('QN55Q80D', '55', 3), hit('QN55Q80F', '55', 4), q7fHit],
    { [slug('QN55Q80D')]: strongPage('QN55Q80D'), [slug('QN55Q80F')]: strongPage('QN55Q80F'), [q7fUrl]: q7fPage });
  assert.deepEqual(outcome.report.internalCandidatePool.map((item) => item.model).sort(), [...exact].sort());
  const fetched = providers.calls.fetch.map((entry) => entry.url);
  assert.equal(fetched.some((url) => /qn65|qn50/.test(url)), false);
});

test('8/9: retail eligibility stays mandatory for a successor, and the legacy Q80R stays ineligible', async () => {
  const noPurchasePath = strongPage('QN55Q80D').replace('<button type="button">Add to cart</button>', '');
  const { outcome } = await run([hit('QN55Q80D', '55', 1), result('Samsung QN55Q80R 55-inch QLED 4K TV', 'https://www.samsung.com/us/tvs/qled-tv/q80r-55-inch-qled-4k-smart-tv-qn55q80rafxza/', 2)],
    { [slug('QN55Q80D')]: noPurchasePath, 'https://www.samsung.com/us/tvs/qled-tv/q80r-55-inch-qled-4k-smart-tv-qn55q80rafxza/': strongPage('QN55Q80R') });
  assert.equal(outcome.report.recommendation.primary, null);
  assert.ok(outcome.reasonCodes.includes('NO_CURRENT_RETAIL_REPLACEMENT'));
  const byModel = Object.fromEntries(outcome.report.retail.rejected.map((item) => [item.model, item.retail]));
  assert.equal(byModel.QN55Q80D.purchaseStatus, 'UNKNOWN');
  assert.equal(byModel.QN55Q80R.catalogStatus, 'LEGACY');
});
