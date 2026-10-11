import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateReplacement } from '../../lib/replacement-core/evaluate.js';
import { televisionProfile } from '../../lib/replacement-core/profiles/television.js';
import { TV_FAMILY_LINEAGES, samsungTvProductLine, tvFamilyRelation } from '../../lib/replacement-core/normalize-values.js';
import { familyIntegrity, isLowerFamilyThanPrimary, rankEvaluations, selectRecommendations } from '../../lib/replacement-discovery/candidate-ranker.js';
import { evaluateRecommendationFloor } from '../../lib/replacement-discovery/quality-floor.js';
import { ORIGINAL_SOURCE_NON_US } from '../../lib/replacement-discovery/retrieval-first.js';
import { recommendByRetrieval } from '../../lib/replacement-discovery/live-retrieval.js';
import { buildPublicResponse, isValidPublicResponse, PUBLIC_ENGINE_VERSION, CACHE_FINGERPRINT } from '../../lib/replacement-public/contract.js';
import { q7fPage, q7fUrl, q80cPage, q80cUrl, result } from '../helpers/replacement-public-fixtures.mjs';
import { RETAIL_NOW, withPurchasePath } from '../helpers/retail-evidence.mjs';

/** U.S.-only original lookup, documented Q80 <-> QN80 lineage, and lower-family alternative suppression. */

const known = (value, refs = ['page']) => ({ status: 'KNOWN', value, evidenceRefs: refs });
const identity = (model, facts) => ({ contractVersion: '1.0.0', id: model, rawQuery: null, category: 'television', evidenceRefs: ['page'],
  facts: { brand: known('Samsung'), model: known(model), ...facts } });
const q80c = identity('QN55Q80C', { series: known('Q80 Series'), screenSizeIn: known(55), resolution: known('4K'), displayTechnology: known('QLED'),
  refreshHz: known(120), smart: known(true), hdr: known('QUANTUM HDR+') });
const candidate = (model, facts) => ({ contractVersion: '1.0.0', candidateId: model, identity: identity(model, facts), source: { kind: 'TEST' },
  relationship: 'SAME_BRAND_ALTERNATIVE', discoveryConfidence: 'MEDIUM', evidenceRefs: ['page'], providerRank: null });
const evaluate = (model, facts, original = q80c) => evaluateReplacement({ original, candidate: candidate(model, facts), profile: televisionProfile });
const full = { screenSizeIn: known(55), resolution: known('4K'), displayTechnology: known('QLED'), smart: known(true), hdr: known('QUANTUM HDR+') };
// What the live QN80H page yields: model, size, resolution, display technology and smart, with no series and no refresh rate.
const liveLikeQn80 = (model = 'QN55QN80H') => evaluate(model, { screenSizeIn: known(55), resolution: known('4K'), displayTechnology: known('NEO QLED'), smart: known(true) });
const q7f = () => evaluate('QN55Q7F', { ...full, series: known('Q7 Series'), refreshHz: known(120) });
const modelOf = (evaluation) => evaluation.candidate.identity.facts.model.value;

// ---- 1. U.S.-only original lookup ---------------------------------------------------------------------------------------

const latinUrl = 'https://www.samsung.com/latin_en/tvs/qled-tv/q80c-55-inch-qled-4k-smart-tv-qn55q80capxpa/';
const usSearch = 'Samsung QN55Q80C specifications site:samsung.com/us';
const broadSearch = 'Samsung QN55Q80C site:samsung.com';

function lookupProviders({ byQuery, pages }) {
  const calls = { search: [], fetch: [] };
  return {
    calls,
    deps: {
      retailNow: RETAIL_NOW,
      search: async (request) => { calls.search.push(request); return byQuery[request.query] ?? (request.purpose === 'original' ? [] : []); },
      fetchPage: async (url) => { calls.fetch.push(url); return { status: 200, elapsedMs: 3, contentType: 'text/html', text: pages[url] ?? '' }; },
    },
  };
}
const lookup = (providers) => recommendByRetrieval({ category: 'television', brand: 'Samsung', model: 'QN55Q80C', deps: providers.deps });

test('the Samsung TV original lookup targets the U.S. storefront first', async () => {
  const providers = lookupProviders({ byQuery: { [usSearch]: [result('Samsung QN55Q80C specs', q80cUrl)] }, pages: { [q80cUrl]: q80cPage } });
  const outcome = await lookup(providers);
  assert.equal(providers.calls.search.find((request) => request.purpose === 'original').query, usSearch);
  assert.equal(providers.calls.search.filter((request) => request.purpose === 'original').length, 1, 'a U.S. page needs no fallback search');
  assert.equal(providers.calls.fetch[0], q80cUrl);
  assert.equal(outcome.report.reasonCodes.includes(ORIGINAL_SOURCE_NON_US), false);
});

test('a non-U.S. page in the U.S. search is not used; the broad fallback prefers a U.S. page over any other storefront', async () => {
  const providers = lookupProviders({
    byQuery: { [usSearch]: [result('Samsung QN55Q80C latin', latinUrl)], [broadSearch]: [result('Samsung QN55Q80C latin', latinUrl), result('Samsung QN55Q80C specs', q80cUrl)] },
    pages: { [q80cUrl]: q80cPage, [latinUrl]: q80cPage },
  });
  const outcome = await lookup(providers);
  assert.deepEqual(providers.calls.search.filter((request) => request.purpose === 'original').map((request) => request.query), [usSearch, broadSearch]);
  assert.equal(providers.calls.fetch[0], q80cUrl);
  assert.equal(providers.calls.fetch.includes(latinUrl), false);
  assert.equal(outcome.report.reasonCodes.includes(ORIGINAL_SOURCE_NON_US), false);
});

test('a non-U.S. original page is a flagged last resort, never silently as authoritative as a U.S. page', async () => {
  const providers = lookupProviders({ byQuery: { [broadSearch]: [result('Samsung QN55Q80C latin', latinUrl)] }, pages: { [latinUrl]: q80cPage } });
  const outcome = await lookup(providers);
  assert.equal(providers.calls.fetch[0], latinUrl, 'the fallback is preserved when no U.S. page exists');
  assert.ok(outcome.report.reasonCodes.includes(ORIGINAL_SOURCE_NON_US));
  const response = buildPublicResponse(outcome, { requestId: 'req', elapsedMs: 1 });
  const warning = response.warnings.find((item) => item.code === ORIGINAL_SOURCE_NON_US);
  assert.equal(warning.severity, 'WARNING');
});

// ---- 2. documented Q80 <-> QN80 lineage ----------------------------------------------------------------------------------

test('the lineage is explicit registry data and parses product lines from model numbers', () => {
  assert.deepEqual(TV_FAMILY_LINEAGES['samsung-80'].lines, ['Q80', 'QN80']);
  assert.ok(Object.isFrozen(TV_FAMILY_LINEAGES) && Object.isFrozen(TV_FAMILY_LINEAGES['samsung-80'].lines));
  assert.equal(samsungTvProductLine('QN55Q80C'), 'Q80');
  assert.equal(samsungTvProductLine('QN55QN80H'), 'QN80');
  assert.equal(samsungTvProductLine('K-55XR80'), null);
});

test('Q80 and QN80 are equivalent in both directions; Q7 is not; QN90 is a higher family, not the same one', () => {
  assert.equal(tvFamilyRelation('QN55Q80C', 'QN55QN80H').relation, 'EQUIVALENT_LINEAGE');
  assert.equal(tvFamilyRelation('QN55QN80H', 'QN55Q80C').relation, 'EQUIVALENT_LINEAGE');
  assert.equal(tvFamilyRelation('QN55Q80C', 'QN55Q80D').relation, 'SAME_LINE');
  assert.equal(tvFamilyRelation('QN55Q80C', 'QN55Q7F').relation, 'DIFFERENT_LINE');
  assert.equal(tvFamilyRelation('QN55Q80C', 'QN55QN90F').relation, 'HIGHER_LINE');
  assert.equal(tvFamilyRelation('QN55QN90F', 'QN55Q80C').relation, 'DIFFERENT_LINE', 'a lower line is never equivalent to a higher one');
  assert.equal(tvFamilyRelation('QN55Q80C', 'not-a-model').relation, 'UNKNOWN');
});

test('a Q80 original with a QN80 candidate that names no series is the same family, not an unknown one', () => {
  const successor = liveLikeQn80();
  assert.equal(familyIntegrity(successor), 0);
  assert.equal(successor.candidate.identity.facts.tier.basis, 'FAMILY_LINEAGE_REGISTRY');
  assert.equal(successor.candidate.identity.facts.tier.status, 'INFERRED');
  assert.equal(successor.candidate.identity.facts.tier.value, 'PREMIUM');
  assert.equal(successor.candidate.identity.facts.series, undefined, 'no series is fabricated');
  // Without the registry the same page is an unknown family on an assumed tier.
  const withoutLineage = evaluate('QN55Q8F', { screenSizeIn: known(55), resolution: known('4K'), displayTechnology: known('NEO QLED'), smart: known(true) });
  assert.equal(withoutLineage.candidate.identity.facts.tier.basis, 'BRAND_CATEGORY_BASELINE');
  assert.equal(familyIntegrity(withoutLineage), 2);
});

test('a QN80 original with a Q80 candidate is equivalent when the original carries a resolved tier', () => {
  const qn80 = identity('QN55QN80H', { series: known('QN80 Series'), tier: { status: 'INFERRED', value: 'PREMIUM', evidenceRefs: ['page'] }, screenSizeIn: known(55),
    resolution: known('4K'), displayTechnology: known('NEO QLED'), refreshHz: known(120), smart: known(true) });
  const reverse = evaluate('QN55Q80D', { ...full, displayTechnology: known('NEO QLED') }, qn80);
  assert.equal(familyIntegrity(reverse), 0);
  assert.equal(reverse.candidate.identity.facts.tier.basis, 'FAMILY_LINEAGE_REGISTRY');
});

test('equivalence fabricates and verifies nothing, and cannot weaken the hard gates', () => {
  const successor = liveLikeQn80();
  const rows = Object.fromEntries(successor.decision.comparisons.map((row) => [row.key, row]));
  for (const key of ['refreshHz', 'hdr', 'series', 'physicalFit']) assert.equal(rows[key].assessment, 'UNVERIFIED', `${key} stays needs-verification`);
  assert.deepEqual(successor.decision.materialRegressions, []);
  assert.equal(successor.candidate.identity.facts.refreshHz, undefined);
  assert.notEqual(successor.confidence, 'HIGH');
  // The hard size gate still fails a smaller screen inside the same lineage.
  const smaller = evaluate('QN50QN80H', { screenSizeIn: known(50), resolution: known('4K'), displayTechnology: known('NEO QLED'), smart: known(true) });
  assert.ok(smaller.decision.hardFailures.length > 0);
  assert.ok(evaluateRecommendationFloor(smaller).reasons.includes('HARD_FAILURE'));
  // A line outside the lineage inherits nothing, and neither does a candidate whose retrieved series names another line.
  const q7 = q7f();
  assert.equal(q7.candidate.identity.facts.tier.basis, 'BRAND_CATEGORY_BASELINE');
  assert.equal(familyIntegrity(q7), 3);
  const contradicted = evaluate('QN55QN80H', { screenSizeIn: known(55), resolution: known('4K'), displayTechnology: known('NEO QLED'), smart: known(true), series: known('Q7 Series') });
  assert.equal(contradicted.candidate.identity.facts.tier.basis, 'BRAND_CATEGORY_BASELINE');
  // A QN90 candidate on a verified tier is a different, higher family: ranked as such, never as the same family.
  const qn90 = evaluate('QN55QN90D', { ...full, series: known('QN90 Series'), displayTechnology: known('NEO QLED') });
  assert.equal(familyIntegrity(qn90), 1);
});

// ---- 3. lower-family alternative suppression -----------------------------------------------------------------------------

test('a verified lower family is suppressed beside a best-available same-lineage primary', () => {
  const primary = liveLikeQn80();
  const lower = q7f();
  assert.equal(evaluateRecommendationFloor(primary).met, false);
  assert.equal(evaluateRecommendationFloor(primary).reasons.includes('HARD_FAILURE'), false);
  const selection = selectRecommendations(rankEvaluations([lower, primary]));
  assert.equal(modelOf(selection.primaryRecommendation), 'QN55QN80H');
  assert.deepEqual(selection.alternatives, []);
  assert.deepEqual(selection.rejectedSummary.map((item) => item.reasonCode), ['LOWER_FAMILY_THAN_PRIMARY']);
});

test('equivalent-family, verified higher-family and hard-requirement-resolving alternatives are not suppressed', () => {
  const primary = liveLikeQn80();
  assert.equal(isLowerFamilyThanPrimary(liveLikeQn80('QN55QN80F'), primary), false, 'equivalent family');
  assert.equal(isLowerFamilyThanPrimary(evaluate('QN55QN90D', { ...full, series: known('QN90 Series'), displayTechnology: known('NEO QLED') }), primary), false, 'higher family');
  assert.equal(isLowerFamilyThanPrimary(evaluate('QN55Q8F', { screenSizeIn: known(55), resolution: known('4K'), displayTechnology: known('NEO QLED'), smart: known(true) }), primary), false, 'unknown family');
  // The primary leaves resolution open; the lower-family candidate verifies it, so it resolves a hard requirement the primary does not.
  const resolutionOpen = evaluate('QN55QN80H', { screenSizeIn: known(55), displayTechnology: known('NEO QLED'), smart: known(true) });
  assert.equal(evaluateRecommendationFloor(resolutionOpen).met, false);
  assert.equal(isLowerFamilyThanPrimary(q7f(), resolutionOpen), false);
  assert.equal(isLowerFamilyThanPrimary(q7f(), liveLikeQn80()), true, 'control: with the same hard gaps it is suppressed');
});

test('nothing is suppressed when the primary is itself a lower-family fallback, meets the floor, or has a verified regression', () => {
  const lowerPrimary = q7f();
  const otherLower = evaluate('QN55Q6F', { ...full, series: known('Q6 Series'), refreshHz: known(120) });
  assert.equal(isLowerFamilyThanPrimary(otherLower, lowerPrimary), false);
  const floorMet = evaluate('QN55Q80D', { ...full, series: known('Q80 Series'), refreshHz: known(120) });
  assert.equal(evaluateRecommendationFloor(floorMet).met, true);
  assert.equal(isLowerFamilyThanPrimary(q7f(), floorMet), false, 'the floor rule already governs this case');
  const regressed = evaluate('QN55Q80D', { ...full, series: known('Q80 Series'), refreshHz: known(60) });
  assert.equal(isLowerFamilyThanPrimary(q7f(), regressed), false);
});

// ---- pipeline: the observed QN55Q80C result ------------------------------------------------------------------------------

const qn80hUrl = 'https://www.samsung.com/us/tvs/qled-tv/55-inch-neo-qled-4k-tv-qn80h-sku-qn55qn80hafxza/';
const qn80hPage = (extra = '') => withPurchasePath(`<html><title>Samsung 55" Neo QLED 4K Smart TV (QN55QN80H)</title><h1>Samsung 55" Neo QLED 4K Smart TV QN55QN80H</h1>`
  + '<p>Screen Size</p><p>55"</p><p>Resolution</p><p>3,840 x 2,160</p><p>Product</p><p>Neo QLED</p><p>Operating System</p><p>Tizen Smart TV</p></html>') + extra;

function pipeline({ pages, hits }) {
  const calls = { search: [], fetch: [] };
  const deps = {
    retailNow: RETAIL_NOW,
    search: async (request) => { calls.search.push(request); return request.purpose === 'original' ? [result('Samsung QN55Q80C specs', q80cUrl)] : hits; },
    fetchPage: async (url) => { calls.fetch.push(url); return { status: 200, elapsedMs: 3, contentType: 'text/html', text: pages[url] ?? '' }; },
  };
  return recommendByRetrieval({ category: 'television', brand: 'Samsung', model: 'QN55Q80C', deps }).then((outcome) => ({ outcome, calls }));
}

test('pipeline: the Q80 successor is the best-available primary and the verified lower-family Q7F is not shown beside it', async () => {
  const { outcome } = await pipeline({ pages: { [q80cUrl]: q80cPage, [qn80hUrl]: qn80hPage(), [q7fUrl]: q7fPage },
    hits: [result('Samsung QN55Q7F 55-inch QLED TV', q7fUrl, 1), result('Samsung QN55QN80H 55-inch Neo QLED 4K TV', qn80hUrl, 2)] });
  const response = buildPublicResponse(outcome, { requestId: 'req', elapsedMs: 1 });
  assert.equal(response.primary.model, 'QN55QN80H');
  assert.equal(response.primary.recommendationLevel, 'BEST_AVAILABLE');
  assert.equal(response.primary.retail.purchaseStatus, 'AVAILABLE');
  assert.deepEqual(response.alternatives, []);
  assert.deepEqual(outcome.report.recommendation.rejectedSummary.map((item) => item.reasonCode), ['LOWER_FAMILY_THAN_PRIMARY']);
  assert.ok(response.warnings.some((item) => item.code === 'NO_CONFIRMED_LKQ'));
  assert.equal(isValidPublicResponse(response), true);
});

test('pipeline: lineage equivalence never makes a retail-ineligible successor eligible', async () => {
  const unavailable = qn80hPage().replace('<button type="button">Add to cart</button>', '');
  const { outcome } = await pipeline({ pages: { [q80cUrl]: q80cPage, [qn80hUrl]: unavailable }, hits: [result('Samsung QN55QN80H 55-inch Neo QLED 4K TV', qn80hUrl, 1)] });
  assert.equal(outcome.report.recommendation.primary, null);
  assert.ok(outcome.reasonCodes.includes('NO_CURRENT_RETAIL_REPLACEMENT'));
});

test('the engine version is bumped so results cached before these rules cannot be served', () => {
  assert.equal(PUBLIC_ENGINE_VERSION, '1.3.0');
  assert.ok(CACHE_FINGERPRINT.includes('1.3.0'));
});
