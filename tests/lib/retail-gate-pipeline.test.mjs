import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recommendByRetrieval } from '../../lib/replacement-discovery/live-retrieval.js';
import { buildPublicResponse, isValidPublicResponse } from '../../lib/replacement-public/contract.js';
import {
  ENV, buildHandler, createReq, invoke, q7fPage, q7fUrl, q80cPage, q80cUrl, q80dUrl, requestBody, result, syntheticTvPage, tvProviders, lfG8330Url, lfZ6211Url,
  fridgeProviders,
} from '../helpers/replacement-public-fixtures.mjs';
import { RETAIL_NOW, withDiscontinuedNotice } from '../helpers/retail-evidence.mjs';

/** Pipeline behaviour of the hard retail gate: discovery -> retail eligibility -> LKQ -> rank -> recommend. */

const q80rUrl = 'https://www.samsung.com/us/tvs/qled-tv/q80r-55-inch-qled-4k-smart-tv-qn55q80rafxza/';
const q80fUrl = 'https://www.samsung.com/us/tvs/qled-tv/q80f-55-inch-qled-4k-smart-tv-qn55q80fafxza/';
const q80rResult = result('Samsung QN55Q80R 55-inch QLED 4K TV', q80rUrl, 1);
const q80fResult = result('Samsung QN55Q80F 55-inch QLED 4K TV', q80fUrl, 5);
const q7fResult = result('Samsung QN55Q7F 55-inch QLED TV', q7fUrl, 9);
const q80dResult = result('Samsung QN55Q80D 55-inch QLED 4K TV', q80dUrl, 4);

const run = async (candidates, pages, { model = 'QN55Q80C', brand = 'Samsung', category = 'television' } = {}) => {
  const providers = tvProviders({ original: [result('Samsung QN55Q80C specs', q80cUrl)], candidates, pages: { [q80cUrl]: q80cPage, ...pages } });
  const outcome = await recommendByRetrieval({ category, brand, model, deps: providers.deps });
  return { outcome, providers };
};
const models = (outcome) => [outcome.report.recommendation.primary, ...outcome.report.recommendation.alternatives.map((item) => item.recommendation)]
  .filter(Boolean).map((item) => item.candidate.identity.facts.model.value);

test('QN55Q80C: the legacy QN55Q80R is never the recommendation, even when it matches the original specs exactly', async () => {
  // The Q80R page shows a price and an Add to cart control, and its specs equal the original's. Only its model year (2019) disqualifies it.
  const { outcome } = await run([q80rResult], { [q80rUrl]: syntheticTvPage('QN55Q80R') });
  assert.equal(outcome.status, 'NO_RESULT');
  assert.equal(outcome.report.recommendation.primary, null);
  assert.deepEqual(outcome.report.recommendation.alternatives, []);
  assert.ok(outcome.reasonCodes.includes('NO_CURRENT_RETAIL_REPLACEMENT'));
  assert.equal(outcome.reasonCodes.includes('BASELINE_FALLBACK_USED'), false);
  const rejected = outcome.report.retail.rejected.find((item) => item.model === 'QN55Q80R');
  assert.equal(rejected.retail.catalogStatus, 'LEGACY');
  assert.ok(rejected.retail.reasons.includes('MODEL_YEAR_FAR_BEHIND_CURRENT'));
  assert.equal(outcome.report.refinementSuggestions[0].fieldKey, 'retailAvailability');
});

test('8: a better-matching legacy model loses to a slightly lower-scoring current retail model (availability is a hard gate)', async () => {
  // Control: the same specs on a CURRENT model (Q80F) outrank the Q7F, so the Q80-class page really is the better spec match.
  const control = await run([q7fResult, q80fResult], { [q7fUrl]: q7fPage, [q80fUrl]: syntheticTvPage('QN55Q80F') });
  assert.equal(models(control.outcome)[0], 'QN55Q80F');

  // The identical specs on the legacy QN55Q80R are not eligible, so the current Q7F wins.
  const gated = await run([q7fResult, q80rResult], { [q7fUrl]: q7fPage, [q80rUrl]: syntheticTvPage('QN55Q80R') });
  assert.equal(gated.outcome.status === 'NO_RESULT', false);
  assert.deepEqual(models(gated.outcome), ['QN55Q7F']);
  assert.equal(gated.outcome.report.recommendation.alternatives.length, 0);
  assert.equal(gated.outcome.report.recommendation.internalPoolCount, 1);
  assert.deepEqual(gated.outcome.report.retail.rejected.map((item) => item.model), ['QN55Q80R']);
});

test('9: when no current-retail candidate survives, no obsolete model is emitted (legacy, discontinued and out-of-stock)', async () => {
  const outOfStock = syntheticTvPage('QN55Q80D').replace('<button type="button">Add to cart</button>', '<p>Out of stock</p>');
  const { outcome } = await run([q80rResult, q80dResult], { [q80rUrl]: withDiscontinuedNotice(syntheticTvPage('QN55Q80R')), [q80dUrl]: outOfStock });
  assert.equal(outcome.status, 'NO_RESULT');
  assert.equal(outcome.report.recommendation.primary, null);
  assert.equal(outcome.report.recommendation.internalPoolCount, 0);
  assert.ok(outcome.reasonCodes.includes('NO_CURRENT_RETAIL_REPLACEMENT'));
  assert.equal(outcome.report.evidence.some((item) => /q80[dr]/i.test(item.url)), false, 'a rejected candidate contributes no evidence');
  const byModel = Object.fromEntries(outcome.report.retail.rejected.map((item) => [item.model, item.retail]));
  assert.equal(byModel.QN55Q80R.catalogStatus, 'LEGACY');
  assert.equal(byModel.QN55Q80D.purchaseStatus, 'UNAVAILABLE');
  assert.deepEqual(outcome.report.retail.eligible, {});
});

test('used, refurbished and open-box pages are excluded even when the search result looked like a normal product', async () => {
  for (const word of ['Certified Refurbished', 'Open-Box', 'Used']) {
    const page = syntheticTvPage('QN55Q80D').replace('<title>Samsung QN55Q80D', `<title>${word} Samsung QN55Q80D`);
    const { outcome } = await run([q80dResult], { [q80dUrl]: page });
    assert.equal(outcome.report.recommendation.primary, null, word);
    assert.equal(outcome.report.retail.rejected[0].retail.condition, 'NON_NEW', word);
  }
});

test('a current product with a live purchase path is recommended and carries its availability evidence', async () => {
  const page = `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'Samsung QN55Q80D', sku: 'QN55Q80DAFXZA', size: '55"',
    offers: { '@type': 'Offer', availability: 'https://schema.org/InStock', itemCondition: 'https://schema.org/NewCondition', price: '1099.99', priceCurrency: 'USD' } })}</script>${syntheticTvPage('QN55Q80D')}`;
  const { outcome } = await run([q80dResult], { [q80dUrl]: page });
  assert.deepEqual(models(outcome), ['QN55Q80D']);
  const retail = outcome.report.retail.eligible.QN55Q80D;
  assert.equal(retail.eligible, true);
  assert.equal(retail.sourceName, 'Samsung.com');
  assert.deepEqual(retail.observedPrice, { amount: 1099.99, currency: 'USD' });
  assert.equal(retail.observedAt, new Date(RETAIL_NOW()).toISOString());

  const publicResponse = buildPublicResponse(outcome, { requestId: 'req-1', elapsedMs: 5 });
  assert.equal(isValidPublicResponse(publicResponse), true);
  assert.deepEqual(publicResponse.primary.retail, { statusLabel: 'AVAILABLE NEW', condition: 'NEW', purchaseStatus: 'AVAILABLE', catalogStatus: 'CURRENT',
    sellerType: 'MANUFACTURER', sourceName: 'Samsung.com', sourceDomain: 'samsung.com', sourceUrl: q80dUrl,
    observedPrice: { amount: 1099.99, currency: 'USD' }, observedAt: new Date(RETAIL_NOW()).toISOString() });
});

test('price is observed only: it never changes which candidate is recommended', async () => {
  const priced = (model, price) => `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: `Samsung ${model}`, sku: `${model}AFXZA`, size: '55"',
    offers: { availability: 'https://schema.org/InStock', price, priceCurrency: 'USD' } })}</script>${syntheticTvPage(model)}`;
  const order = async (priceF, priceD) => models((await run([q80fResult, q80dResult], { [q80fUrl]: priced('QN55Q80F', priceF), [q80dUrl]: priced('QN55Q80D', priceD) })).outcome);
  assert.deepEqual(await order('999.99', '2999.99'), await order('2999.99', '999.99'));
});

test('public contract: no current retail replacement is a NO_RESULT with a blocking warning and guidance, and names no rejected model', async () => {
  const { outcome } = await run([q80rResult], { [q80rUrl]: syntheticTvPage('QN55Q80R') });
  const response = buildPublicResponse(outcome, { requestId: 'req-2', elapsedMs: 5 });
  assert.equal(response.status, 'NO_RESULT');
  assert.equal(response.primary, null);
  assert.deepEqual(response.alternatives, []);
  const warning = response.warnings.find((item) => item.code === 'NO_CURRENT_RETAIL_REPLACEMENT');
  assert.equal(warning.severity, 'BLOCKING');
  assert.ok(response.refinements.some((item) => item.fieldKey === 'retailAvailability'));
  assert.equal(JSON.stringify(response).includes('Q80R'), false);
  assert.equal(isValidPublicResponse(response), true);
});

test('public contract fails closed: a primary without eligible retail evidence is removed, and stored responses without it are invalid', async () => {
  const { outcome } = await run([q80dResult], { [q80dUrl]: syntheticTvPage('QN55Q80D') });
  const good = buildPublicResponse(outcome, { requestId: 'req-3', elapsedMs: 5 });
  assert.equal(good.primary.model, 'QN55Q80D');

  const tampered = { ...outcome, report: { ...outcome.report, retail: { ...outcome.report.retail, eligible: {} } } };
  const refused = buildPublicResponse(tampered, { requestId: 'req-4', elapsedMs: 5 });
  assert.equal(refused.status, 'NO_RESULT');
  assert.equal(refused.primary, null);
  assert.ok(refused.warnings.some((item) => item.code === 'NO_CURRENT_RETAIL_REPLACEMENT'));

  const ineligibleRecord = { ...outcome.report.retail.eligible.QN55Q80D, eligible: false, purchaseStatus: 'UNKNOWN' };
  const spoofed = { ...outcome, report: { ...outcome.report, retail: { ...outcome.report.retail, eligible: { QN55Q80D: ineligibleRecord } } } };
  assert.equal(buildPublicResponse(spoofed, { requestId: 'req-5', elapsedMs: 5 }).primary, null);

  assert.equal(isValidPublicResponse(good), true);
  assert.equal(isValidPublicResponse({ ...good, primary: { ...good.primary, retail: null } }), false);
  assert.equal(isValidPublicResponse({ ...good, primary: { ...good.primary, retail: { ...good.primary.retail, catalogStatus: 'LEGACY' } } }), false);
  const { retail: _omitted, ...withoutRetail } = good.primary;
  assert.equal(isValidPublicResponse({ ...good, primary: withoutRetail }), false);
});

test('public contract: alternatives without eligible retail evidence are dropped, those with it carry their own availability', async () => {
  const outcome = await recommendByRetrieval({ category: 'refrigerator', brand: 'LG', model: 'LF25H6200S', deps: fridgeProviders().deps });
  const withAlternatives = (alternativeModels) => {
    const forced = structuredClone(outcome);
    const template = forced.report.recommendation.primary;
    forced.report.recommendation.alternatives = alternativeModels.map((model) => {
      const recommendation = structuredClone(template);
      recommendation.candidate.identity.facts.model.value = model;
      return { role: 'CLOSE_MATCH', recommendation };
    });
    return forced;
  };
  // LF25G8330S is eligible in this run; LF25X0000S was never assessed, so it has no retail evidence at all.
  const response = buildPublicResponse(withAlternatives(['LF25G8330S', 'LF25X0000S']), { requestId: 'req-6', elapsedMs: 5 });
  assert.deepEqual(response.alternatives.map((item) => item.model), ['LF25G8330S']);
  assert.equal(response.alternatives[0].retail.statusLabel, 'AVAILABLE NEW');
  assert.equal(response.alternatives[0].retail.sourceDomain, 'lg.com');
  assert.equal(isValidPublicResponse(response), true);
  const smuggled = { ...response, alternatives: [{ ...response.alternatives[0], retail: null }] };
  assert.equal(isValidPublicResponse(smuggled), false);
});

test('API: the QN55Q80C lookup answers NO_RESULT with guidance, never the legacy model, and the answer is not cached', async () => {
  const providers = tvProviders({ original: [result('Samsung QN55Q80C specs', q80cUrl)], candidates: [q80rResult], pages: { [q80cUrl]: q80cPage, [q80rUrl]: syntheticTvPage('QN55Q80R') } });
  const { handler, redis } = buildHandler({ env: ENV, providers });
  const res = await invoke(handler, createReq({ body: requestBody({ model: 'QN55Q80C' }) }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'NO_RESULT');
  assert.equal(res.body.primary, null);
  assert.equal(JSON.stringify(res.body).includes('Q80R'), false);
  assert.ok(res.body.warnings.some((item) => item.code === 'NO_CURRENT_RETAIL_REPLACEMENT'));
  assert.equal(redis.calls.some(([op]) => op === 'set'), false, 'NO_RESULT outcomes are never cached');
});

test('LG refrigerators: a discontinued candidate is excluded while a current one is still recommended', async () => {
  const providers = fridgeProviders();
  const base = providers.deps.fetchPage;
  const deps = { ...providers.deps, fetchPage: async (url, options) => {
    const page = await base(url, options);
    return url === lfG8330Url ? { ...page, text: withDiscontinuedNotice(page.text) } : page;
  } };
  const outcome = await recommendByRetrieval({ category: 'refrigerator', brand: 'LG', model: 'LF25H6200S', deps });
  assert.deepEqual(models(outcome), ['LF25Z6211S']);
  const rejected = outcome.report.retail.rejected.find((item) => item.model === 'LF25G8330S');
  assert.equal(rejected.retail.catalogStatus, 'LEGACY');
  assert.deepEqual(Object.keys(outcome.report.retail.eligible), ['LF25Z6211S']);
  assert.equal(outcome.report.candidateDiscovery.find((item) => item.model === 'LF25G8330S').retailEligible, false);
});

test('LG refrigerators: when no candidate has a live purchase path the result is NO_CURRENT_RETAIL_REPLACEMENT', async () => {
  const providers = fridgeProviders();
  const base = providers.deps.fetchPage;
  const deps = { ...providers.deps, fetchPage: async (url, options) => {
    const page = await base(url, options);
    return url === lfG8330Url || url === lfZ6211Url ? { ...page, text: page.text.replace('<button type="button">Add to cart</button>', '') } : page;
  } };
  const outcome = await recommendByRetrieval({ category: 'refrigerator', brand: 'LG', model: 'LF25H6200S', deps });
  assert.equal(outcome.status, 'NO_RESULT');
  assert.ok(outcome.reasonCodes.includes('NO_CURRENT_RETAIL_REPLACEMENT'));
  assert.equal(outcome.report.recommendation.primary, null);
  assert.deepEqual(new Set(outcome.report.retail.rejected.map((item) => item.model)), new Set(['LF25G8330S', 'LF25Z6211S']));
});

test('discovery: non-U.S. storefront results never become candidates, and candidate queries target the U.S. storefront', async () => {
  const { candidateIdentity, planCandidateQueries } = await import('../../lib/replacement-discovery/retrieval-first.js');
  const { refrigeratorCandidateIdentity } = await import('../../lib/replacement-discovery/refrigerator-retrieval.js');
  const q80dCa = result('Samsung QN55Q80D 55-inch QLED', 'https://www.samsung.com/ca/tvs/qled-tv/q80d-55-inch-qled-4k-tizen-os-smart-tv-qn55q80dafxzc/');
  const q80rLatin = result('Samsung QN55Q80R 55-inch QLED', 'https://www.samsung.com/latin_en/tvs/qled-tv/q80r-55-inch-qled-4k-smart-tv-qn55q80rapxpa/');
  assert.equal(candidateIdentity(q80dCa).reason, 'NON_US_STOREFRONT');
  assert.equal(candidateIdentity(q80rLatin).reason, 'NON_US_STOREFRONT');
  assert.equal(candidateIdentity(q80dResult).identity.baseModel, 'QN55Q80D');
  const lgCanada = result('LG LF25H6330S refrigerator', 'https://www.lg.com/ca_en/refrigerators/french-door/lf25h6330s/');
  assert.equal(refrigeratorCandidateIdentity(lgCanada).reason, 'NON_US_STOREFRONT');
  assert.equal(refrigeratorCandidateIdentity(result('LG LF25G8330S refrigerator', lfG8330Url)).identity.baseModel, 'LF25G8330S');
  const known = (value) => ({ status: 'KNOWN', value, evidenceRefs: ['source-1'] });
  const plan = planCandidateQueries({ series: known('Q80 Series'), screenSizeIn: known(55), displayTechnology: known('QLED'), resolution: known('4K'), refreshHz: known(120) });
  assert.ok(plan.length >= 3 && plan.every((entry) => entry.query.endsWith('site:samsung.com/us') || /site:samsung\.com\/us$/.test(entry.query)));
});
