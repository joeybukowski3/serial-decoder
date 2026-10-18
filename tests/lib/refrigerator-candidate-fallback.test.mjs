import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { recommendByRetrieval } from '../../lib/replacement-discovery/live-retrieval.js';
import { stableId } from '../../lib/replacement-discovery/normalize-adapter.js';
import {
  EVIDENCE_QUALITY, MAX_ATTEMPTS_PER_SOURCE_CLASS, MAX_SOURCES_PER_MODEL, ORIGINAL_EVIDENCE, ORIGINAL_FALLBACK_RETAILERS,
  CANDIDATE_RETAIL_UNAVAILABLE, candidateEvidenceQuality, candidateRetailRejection, canonicalSourceUrl, trustedOriginalFallbackSources,
} from '../../lib/replacement-discovery/refrigerator-retrieval.js';
import { isValidPublicResponse } from '../../lib/replacement-public/contract.js';
import { RETAIL_NOW, PURCHASE_PATH, withPurchasePath } from '../helpers/retail-evidence.mjs';
import { buildHandler, createReq, invoke, lfH6200Url, lfZ6211Url, requestBody, result } from '../helpers/replacement-public-fixtures.mjs';

/**
 * Trusted-retailer fallback for REPLACEMENT CANDIDATES whose manufacturer pages are blocked (HTTP 403 from the Vercel runtime).
 * Manufacturer evidence stays first; a retailer page can establish the candidate only when it names the exact model and brand, and
 * the unchanged retail gate must still prove NEW + AVAILABLE + CURRENT. Ranking, HARD floors and LKQ rules are not touched.
 */

const MODEL = 'LRFCS25D3S';
const Z = 'LF25Z6211S';
const H = 'LF25H6200S';
const fixture = (name) => fs.readFileSync(new URL(`../fixtures/replacement-discovery/${name}`, import.meta.url), 'utf8');
const lgProductUrl = 'https://www.lg.com/us/refrigerators/lg-lrfcs25d3s-french-3-door-refrigerator';
const lgSupportUrl = 'https://www.lg.com/us/support/product/lg-LRFCS25D3S';
const zPdfUrl = 'https://media.us.lg.com/m/0123456789abcdef/original/LF25Z6211S-LG-Builder-Spec-Sheet.pdf';
const zSupportUrl = 'https://www.lg.com/us/support/product/lg-LF25Z6211S';
const hdZ = 'https://www.homedepot.com/p/LG-25-cu-ft-French-3-Door-Refrigerator-LF25Z6211S/320000001';
const ajZ = 'https://www.ajmadison.com/cgi-bin/ajmadison/LF25Z6211S.html';
const lowesZ = 'https://www.lowes.com/pd/LG-25-cu-ft-French-Door-Refrigerator-LF25Z6211S/5001234567';
const hdH = 'https://www.homedepot.com/p/LG-25-cu-ft-French-3-Door-Refrigerator-LF25H6200S/320000002';

const lgOriginal = [result(`LG ${MODEL} refrigerator`, lgProductUrl), result(`LG ${MODEL} refrigerator support`, lgSupportUrl)];
const lgCandidates = [result(`LG ${H} French 3-door refrigerator`, lfH6200Url), result(`LG ${Z} French 3-door refrigerator`, lfZ6211Url)];
const zResult = (url) => result(`LG ${Z} French 3-door refrigerator`, url);

/** A retailer product page with a stated specification table, for any model. `purchase` is the page's purchase path. */
const retailPage = (model, { store = 'The Home Depot', capacity = '25.1', layout = 'French 3-Door', purchase = PURCHASE_PATH, extra = '', dimensions = true, counterDepth = null } = {}) =>
  `<html><head><title>LG ${model} ${capacity} cu. ft. ${layout} Refrigerator - ${store}</title></head>`
  + `<body><h1>LG ${model} ${layout} Refrigerator in Stainless Steel</h1><ul><li>Model Number ${model}</li><li>Total Capacity (cu. ft.) ${capacity}</li>`
  + `${dimensions ? '<li>Width 32.75 in</li><li>Height to Top of Hinge 69.88 in</li><li>Depth 35.38 in</li>' : ''}${counterDepth ? `<li>Counter Depth ${counterDepth}</li>` : ''}</ul>${extra}<p>${purchase}</p></body></html>`;
/** A retailer page that only names the model, layout and marketing capacity in its title. */
const titleOnlyPage = (model, store = 'The Home Depot') => `<html><head><title>LG ${model} 25.1 cu. ft. French 3-Door Refrigerator - ${store}</title></head>`
  + `<body><h1>LG ${model}</h1><p>Smart refrigerator</p><p>${PURCHASE_PATH}</p></body></html>`;
const offerJsonLd = (model, price, availability = 'InStock') => `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: `LG ${model} refrigerator`,
  sku: model, url: `https://www.homedepot.com/p/${model}`, offers: { '@type': 'Offer', price, priceCurrency: 'USD', availability: `https://schema.org/${availability}`,
    itemCondition: 'https://schema.org/NewCondition', seller: { '@type': 'Organization', name: 'The Home Depot' } } })}</script>`;

const BLOCKED = { status: 403, contentType: 'text/html', text: '' };
const pageOf = (value) => (typeof value === 'string' ? { status: 200, contentType: 'text/html', text: value } : { contentType: 'text/html', text: '', ...value });

/** Counting provider doubles. Z's manufacturer pages are blocked by default; every other unknown page is a 404. */
function providers({ candidates = lgCandidates, retailerSearch = [], specSheet = [], pages = {}, originalStatus = 200 } = {}) {
  const calls = { search: [], fetch: [] };
  const table = {
    [lgProductUrl]: originalStatus === 200 ? fixture('lg-lrfcs25d3s-page.html') : { status: originalStatus, text: '' },
    [lgSupportUrl]: { status: 404, text: '' },
    [lfH6200Url]: withPurchasePath(fixture('lg-lf25h6200s-page.html')),
    [lfZ6211Url]: BLOCKED, [zPdfUrl]: BLOCKED, [zSupportUrl]: BLOCKED,
    ...pages,
  };
  const search = async (request) => {
    calls.search.push({ query: request.query, purpose: request.purpose });
    if (request.purpose !== 'candidate') return /builder spec sheet/.test(request.query) ? [] : lgOriginal;
    if (/site:homedepot\.com/.test(request.query)) return retailerSearch;
    return /builder spec sheet/.test(request.query) ? specSheet : candidates;
  };
  const fetchPage = async (url) => {
    calls.fetch.push(url);
    const base = url.split('?')[0];
    return Object.hasOwn(table, base) ? pageOf(table[base]) : { status: 404, contentType: 'text/html', text: '' };
  };
  return { calls, deps: { search, fetchPage, retailNow: RETAIL_NOW } };
}

const run = async (options = {}, request = {}) => {
  const provider = providers(options);
  const outcome = await recommendByRetrieval({ category: 'refrigerator', brand: 'LG', model: MODEL, deps: provider.deps, ...request });
  return { outcome, report: outcome.report, calls: provider.calls, provider };
};

const fetchesOf = (calls, url) => calls.fetch.filter((entry) => canonicalSourceUrl(entry) === canonicalSourceUrl(url)).length;
const zFetches = (calls) => calls.fetch.filter((url) => /LF25Z6211S/i.test(url));
const zSources = (report) => report.selectedSources.filter((source) => source.model === Z);
const discovery = (report, model) => report.candidateDiscovery.find((entry) => entry.model === model);
const modelOf = (item) => item.candidate.identity.facts.model.value;
const ranked = (report) => [modelOf(report.recommendation.primary), ...report.recommendation.alternatives.map((item) => modelOf(item.recommendation))];
const searchesFor = (calls, pattern) => calls.search.filter((entry) => pattern.test(entry.query));
/** Where a candidate ended up in the engine's evaluation, so HARD-rule tests can read its verdict. */
function evaluationOf(report, model) {
  const { primary, alternatives, rejectedSummary } = report.recommendation;
  if (primary && modelOf(primary) === model) return { where: 'primary', evaluation: primary };
  const alternative = alternatives.find((item) => modelOf(item.recommendation) === model);
  if (alternative) return { where: 'alternative', evaluation: alternative.recommendation };
  const rejected = rejectedSummary.find((item) => item.candidateId === stableId('retrieved-fridge', model));
  return rejected ? { where: 'rejected', evaluation: rejected } : { where: null, evaluation: null };
}
const withRetailer = (...extra) => ({ candidates: [...lgCandidates, ...extra] });

test('1 and 14: Z manufacturer pages 403 plus a trusted retailer page is evaluated, not silently dropped', async () => {
  const { report, calls } = await run({ ...withRetailer(zResult(hdZ)), pages: { [hdZ]: retailPage(Z) } });
  assert.equal(fetchesOf(calls, lfZ6211Url), 1);
  assert.equal(fetchesOf(calls, hdZ), 1);
  assert.equal(report.candidateEvidence[Z].quality, EVIDENCE_QUALITY.TRUSTED_RETAILER);
  assert.equal(discovery(report, Z).retailEligible, true);
  assert.equal(report.retail.eligible[Z].sourceName, 'The Home Depot');
  assert.equal(report.retail.eligible[Z].eligible, true);
  const facts = discovery(report, Z).facts;
  assert.deepEqual([facts.totalCapacityCuFt.value, facts.configuration.value, facts.model.value], [25.1, 'FRENCH_DOOR', Z]);
  // The unchanged ranking decides order. Z reached LKQ evaluation (the pool counted it); here the existing ranker sets it aside as
  // indistinguishable from the manufacturer-backed H6200S, which stays primary. The fallback never reorders anything.
  assert.equal(modelOf(report.recommendation.primary), H);
  assert.equal(report.recommendation.internalPoolCount, 2);
  assert.notEqual(evaluationOf(report, Z).where, null);
});

test('2: Z manufacturer 403 plus a retailer reporting out of stock is explicitly rejected by the retail gate', async () => {
  const { report } = await run({ ...withRetailer(zResult(hdZ)), pages: { [hdZ]: retailPage(Z, { purchase: '<p>Out of stock</p><p>$899.99</p>' }) } });
  const entry = discovery(report, Z);
  assert.equal(entry.retailEligible, false);
  assert.equal(entry.rejectionReason, 'CANDIDATE_RETAIL_UNAVAILABLE');
  assert.ok(entry.retailReasons.includes('PAGE_NOT_PURCHASABLE'));
  assert.ok(report.retail.rejected.some((item) => item.model === Z && item.retail.purchaseStatus === 'UNAVAILABLE'));
  assert.equal(report.retail.eligible[Z], undefined);
  assert.deepEqual(ranked(report), [H]);
});

test('3: a retailer page for a different exact model never establishes Z', async () => {
  const wrongUrl = 'https://www.homedepot.com/p/LG-25-cu-ft-French-3-Door-Refrigerator-LF25Z6212S/320000009';
  const mislabelled = retailPage('LF25Z6212S');
  const { report, calls } = await run({ ...withRetailer(zResult(hdZ), result('LG LF25Z6212S refrigerator', wrongUrl)),
    pages: { [hdZ]: mislabelled, [wrongUrl]: mislabelled } });
  // The other model's URL fails the model-in-URL gate for Z, so it is never read as a Z source (it is its own candidate instead);
  // the Z URL is fetched, then fails the heading gate.
  assert.equal(zSources(report).some((source) => source.url === wrongUrl), false);
  assert.equal(fetchesOf(calls, hdZ), 1);
  const fetched = report.fetchResults.find((item) => zSources(report).find((source) => source.id === item.sourceId)?.url === hdZ);
  assert.equal(fetched.extraction.rejectionReason, 'HEADING_MODEL_MISSING');
  assert.equal(discovery(report, Z).rejectionReason, 'CANDIDATE_SOURCE_UNAVAILABLE');
  assert.equal(report.candidateEvidence[Z].quality, null);
  assert.equal(report.evidence.some((item) => item.claim.subjectModel === Z), false);
  assert.equal(report.retail.eligible[Z], undefined);
  assert.equal(report.retail.rejected.some((item) => item.model === Z), false);
});

test('4: marketplace, used and third-party-seller sources never support a candidate', async () => {
  const rejected = [`https://www.amazon.com/LG-${Z}-Refrigerator/dp/B0EXAMPLE`, `https://www.ebay.com/itm/LG-${Z}-refrigerator/1234`,
    `https://www.reddit.com/r/appliances/comments/${Z}-refrigerator`, `https://www.homedepot.com/p/Refurbished-LG-${Z}-Refrigerator/2`,
    `https://www.abt.com/LG-${Z}-Refrigerator/p/1`, `https://www.walmart.com/ip/LG-${Z}-Refrigerator/3`];
  const { report, calls } = await run(withRetailer(...rejected.map(zResult)));
  for (const url of rejected) assert.equal(fetchesOf(calls, url), 0, url);
  assert.deepEqual(trustedOriginalFallbackSources(rejected.map(zResult), Z), []);
  assert.equal(discovery(report, Z).rejectionReason, 'CANDIDATE_SOURCE_UNAVAILABLE');
  // An allowlisted retailer page whose seller is a third party fails the retail gate even with a purchase control.
  const third = await run({ ...withRetailer(zResult(hdZ)), pages: { [hdZ]: retailPage(Z, { extra: '<p>Sold by SuperDeals Outlet LLC</p>' }) } });
  assert.equal(discovery(third.report, Z).retailEligible, false);
  assert.ok(discovery(third.report, Z).retailReasons.includes('THIRD_PARTY_SELLER'));
  assert.equal(third.report.retail.eligible[Z], undefined);
});

test('5: non-U.S. retailer and manufacturer storefronts are never fetched, and a non-USD offer is not purchasable', async () => {
  const rejected = [`https://www.homedepot.ca/product/lg-${Z}-refrigerator/1001`, `https://www.bestbuy.ca/en-ca/product/lg-${Z}-refrigerator/150`,
    `https://www.lg.com/ca_en/refrigerators/lg-${Z.toLowerCase()}-french-3-door-refrigerator`];
  const { report, calls } = await run(withRetailer(...rejected.map(zResult)));
  for (const url of rejected) assert.equal(fetchesOf(calls, url), 0, url);
  assert.equal(discovery(report, Z).rejectionReason, 'CANDIDATE_SOURCE_UNAVAILABLE');
  const cad = await run({ ...withRetailer(zResult(hdZ)), pages: { [hdZ]: retailPage(Z, { purchase: '', extra: offerJsonLd(Z, 899.99).replace('"USD"', '"CAD"') }) } });
  assert.equal(discovery(cad.report, Z).retailEligible, false);
  assert.ok(discovery(cad.report, Z).retailReasons.includes('NOT_U_S_STOREFRONT'));
});

test('6: retailer specs without affirmative current availability are CANDIDATE_RETAIL_UNVERIFIED, never accepted', async () => {
  const cases = { 'no price or control': '', 'price only': '<p>$899.99</p>', 'control only': '<button type="button">Add to cart</button>',
    'disabled control': '<p>$899.99</p><button type="button" disabled>Add to cart</button>' };
  for (const [name, purchase] of Object.entries(cases)) {
    const { report } = await run({ ...withRetailer(zResult(hdZ)), pages: { [hdZ]: retailPage(Z, { purchase }) } });
    const entry = discovery(report, Z);
    assert.equal(entry.retailEligible, false, name);
    assert.equal(entry.rejectionReason, 'CANDIDATE_RETAIL_UNVERIFIED', name);
    assert.equal(entry.retailReasons.includes('NO_AFFIRMATIVE_PURCHASE_EVIDENCE'), true, name);
    assert.equal(report.retail.eligible[Z], undefined, name);
    assert.ok(report.retail.rejected.some((item) => item.model === Z && item.retail.purchaseStatus === 'UNKNOWN'), name);
    assert.deepEqual(ranked(report), [H], name);
  }
  // An ambiguous seller is also unproven, not unavailable.
  const third = await run({ ...withRetailer(zResult(hdZ)), pages: { [hdZ]: retailPage(Z, { extra: '<p>Sold by SuperDeals Outlet LLC</p>' }) } });
  assert.equal(discovery(third.report, Z).rejectionReason, 'CANDIDATE_RETAIL_UNVERIFIED');
});

test('6b: positively-known unavailability is CANDIDATE_RETAIL_UNAVAILABLE, and the reason stays internal', async () => {
  const unavailable = {
    'text out of stock': { purchase: '<p>Out of stock</p>' }, 'notify me': { purchase: '<p>$899.99</p><p>Notify me when available</p>' },
    'structured OutOfStock': { purchase: '', extra: offerJsonLd(Z, 899.99, 'OutOfStock') },
    'structured Discontinued': { purchase: '', extra: offerJsonLd(Z, 899.99, 'Discontinued') },
    'discontinued notice': { purchase: PURCHASE_PATH, extra: '<p>This product has been discontinued.</p>' },
  };
  for (const [name, options] of Object.entries(unavailable)) {
    const { report } = await run({ ...withRetailer(zResult(hdZ)), pages: { [hdZ]: retailPage(Z, options) } });
    const entry = discovery(report, Z);
    assert.equal(entry.retailEligible, false, name);
    assert.equal(entry.rejectionReason, 'CANDIDATE_RETAIL_UNAVAILABLE', name);
    assert.equal(candidateRetailRejection(report.retail.rejected.find((item) => item.model === Z).retail), CANDIDATE_RETAIL_UNAVAILABLE, name);
    assert.equal(report.retail.eligible[Z], undefined, name);
  }
  const provider = providers({ ...withRetailer(zResult(hdZ)), pages: { [hdZ]: retailPage(Z, { purchase: '<p>Out of stock</p>' }) } });
  const { handler } = buildHandler({ providers: provider });
  const res = await invoke(handler, createReq({ body: requestBody({ category: 'refrigerator', brand: 'LG', model: MODEL }) }));
  assert.equal(isValidPublicResponse(res.body), true);
  assert.equal(JSON.stringify(res.body).includes('CANDIDATE_RETAIL_UNAVAILABLE'), false);
  assert.equal(JSON.stringify(res.body).includes('CANDIDATE_RETAIL_UNVERIFIED'), false);
});

test('7: blocked manufacturer pages do not consume the retailer slot and attempts stay bounded', async () => {
  assert.deepEqual([MAX_SOURCES_PER_MODEL, MAX_ATTEMPTS_PER_SOURCE_CLASS], [2, 2]);
  const { report, calls } = await run({ ...withRetailer(zResult(zPdfUrl), zResult(zSupportUrl), zResult(hdZ), zResult(ajZ), zResult(lowesZ)),
    pages: { [hdZ]: retailPage(Z), [ajZ]: retailPage(Z, { store: 'AJ Madison' }), [lowesZ]: retailPage(Z, { store: "Lowe's" }) } });
  const byClass = (name) => zSources(report).filter((source) => source.sourceClass === name);
  // Product page and spec PDF are blocked (two manufacturer attempts, the cap); the support page is not tried; retailers still are.
  assert.equal(byClass('MANUFACTURER').length, MAX_ATTEMPTS_PER_SOURCE_CLASS);
  assert.equal(fetchesOf(calls, zSupportUrl), 0);
  assert.equal(fetchesOf(calls, hdZ), 1);
  assert.ok(byClass('RETAILER').length >= 1 && byClass('RETAILER').length <= MAX_ATTEMPTS_PER_SOURCE_CLASS);
  // Two usable retailer pages already fill the useful-evidence cap, so the third trusted retailer is never fetched.
  assert.equal(fetchesOf(calls, lowesZ), 0);
  assert.ok(zFetches(calls).length <= 2 * MAX_ATTEMPTS_PER_SOURCE_CLASS + 1);
  assert.equal(report.candidateEvidence[Z].quality, EVIDENCE_QUALITY.MULTI_SOURCE_TRUSTED_RETAILER);
});

test('9: a blocked spec PDF does not stop retailer evidence, and the dead manufacturer spec-sheet search is skipped', async () => {
  const { report, calls } = await run({ candidates: [...lgCandidates.slice(0, 1), zResult(zPdfUrl), zResult(hdZ)], pages: { [hdZ]: retailPage(Z) } });
  assert.equal(fetchesOf(calls, zPdfUrl), 1);
  assert.equal(fetchesOf(calls, hdZ), 1);
  assert.equal(searchesFor(calls, new RegExp(`${Z}.*builder spec sheet`)).length, 0);
  assert.equal(discovery(report, Z).retailEligible, true);
});

test('10: candidate provenance names every attempted source and never labels retailer facts as manufacturer evidence', async () => {
  const { report } = await run({ ...withRetailer(zResult(`${hdZ}?srsltid=tracking`)), pages: { [hdZ]: retailPage(Z) } });
  const { quality, sources } = report.candidateEvidence[Z];
  assert.equal(quality, EVIDENCE_QUALITY.TRUSTED_RETAILER);
  const retailer = sources.find((item) => item.hostname === 'homedepot.com');
  assert.deepEqual([retailer.sourceClass, retailer.sourceType, retailer.extractionStatus, retailer.httpStatus],
    ['RETAILER', 'RETAILER_LISTING', 'FACTS_BOUND', 200]);
  assert.ok(!Number.isNaN(Date.parse(retailer.observedAt)));
  assert.ok(retailer.url.startsWith('https://www.homedepot.com/p/') && retailer.factKeys.includes('totalCapacityCuFt'));
  const manufacturer = sources.find((item) => item.hostname === 'lg.com' || item.hostname === 'www.lg.com');
  assert.deepEqual([manufacturer.sourceClass, manufacturer.sourceType, manufacturer.extractionStatus, manufacturer.blocked, manufacturer.httpStatus],
    ['MANUFACTURER', 'MANUFACTURER_PAGE', 'SOURCE_FETCH_FAILED', true, 403]);
  assert.equal(manufacturer.observedAt, null);
  const evidence = report.evidence.filter((item) => item.claim.subjectModel === Z);
  assert.ok(evidence.length > 0);
  for (const record of evidence) {
    assert.deepEqual([record.sourceClass, record.firstParty, record.domain, record.sourceType], ['RETAILER', false, 'homedepot.com', 'RETAILER_LISTING']);
    assert.ok(record.url && record.observedAt);
  }
  assert.equal(discovery(report, Z).evidenceQuality, EVIDENCE_QUALITY.TRUSTED_RETAILER);
});

test('11: price never changes ranking, even when it is observed from a structured offer', async () => {
  const outcome = (price) => run({ ...withRetailer(zResult(hdZ)), pages: { [hdZ]: retailPage(Z, { purchase: '', extra: offerJsonLd(Z, price) }),
    [lfH6200Url]: `${withPurchasePath(fixture('lg-lf25h6200s-page.html'))}${offerJsonLd(H, price === 99.99 ? 9999.99 : 99.99)}` } });
  const cheap = await outcome(99.99);
  const expensive = await outcome(9999.99);
  assert.equal(cheap.report.retail.eligible[Z].observedPrice.amount, 99.99);
  assert.equal(expensive.report.retail.eligible[Z].observedPrice.amount, 9999.99);
  assert.deepEqual(ranked(cheap.report), ranked(expensive.report));
  assert.equal(evaluationOf(cheap.report, Z).where, evaluationOf(expensive.report, Z).where);
  assert.notEqual(evaluationOf(cheap.report, Z).where, null);
});

test('12: the HARD capacity floor is unchanged for retailer-backed candidates and unknown HARD values stay unknown', async () => {
  const small = await run({ ...withRetailer(zResult(hdZ)), pages: { [hdZ]: retailPage(Z, { capacity: '24.0' }) } });
  const verdict = evaluationOf(small.report, Z);
  // 24.0 cu ft is below the original's 25.1 less the 0.2 cu ft tolerance: a known HARD failure, exactly as for manufacturer evidence.
  assert.equal(verdict.where, 'rejected');
  assert.deepEqual([verdict.evaluation.classification, verdict.evaluation.reasonCode], ['NOT_LKQ', 'KNOWN_HARD_FAILURE']);
  assert.equal(modelOf(small.report.recommendation.primary), H);
  // Title-only evidence establishes model, layout and nominal capacity; everything else stays unknown and nothing is inferred.
  const sparse = await run({ ...withRetailer(zResult(hdZ)), pages: { [hdZ]: titleOnlyPage(Z) } });
  const facts = discovery(sparse.report, Z).facts;
  for (const key of ['widthIn', 'heightIn', 'depthIn', 'installationType', 'counterDepth', 'iceMaker']) assert.equal(facts[key], undefined, key);
  const sparseEvaluation = evaluationOf(sparse.report, Z).evaluation;
  assert.ok(sparseEvaluation);
  assert.notEqual(sparseEvaluation.confidence, 'HIGH');
  assert.equal(['LKQ', 'ABOVE_LKQ'].includes(sparseEvaluation.classification) && sparseEvaluation.confidence !== 'LOW', false);
});

test('13: retailer evidence cannot bypass configuration or fit checks', async () => {
  const hdTop = 'https://www.homedepot.com/p/LG-25-cu-ft-Top-Freezer-Refrigerator-LF25Z6211S/320000003';
  const topFreezer = await run({ ...withRetailer(zResult(hdTop)), pages: { [hdTop]: retailPage(Z, { layout: 'Top Freezer' }) } });
  assert.equal(discovery(topFreezer.report, Z).facts.configuration.value, 'TOP_FREEZER');
  const configuration = evaluationOf(topFreezer.report, Z);
  assert.equal(configuration.where === 'primary', false);
  assert.equal(['LKQ', 'ABOVE_LKQ'].includes(configuration.evaluation?.classification), false);
  const tight = await run({ ...withRetailer(zResult(hdZ)), pages: { [hdZ]: retailPage(Z), [lfH6200Url]: BLOCKED } },
    { notes: 'must fit 30 inch wide opening' });
  // With H6200S unavailable Z is the only candidate; it may be shown as best-available, but never as LKQ: its 32.75-inch width
  // is checked against the 30-inch opening exactly as manufacturer evidence would be.
  const fit = evaluationOf(tight.report, Z).evaluation;
  assert.equal(fit.classification, 'NOT_LKQ');
  assert.deepEqual(fit.decision.hardFailures.map((failure) => [failure.key, failure.reasonCode]), [['physicalFit', 'HARD_FIT_VIOLATION']]);
});

test('8: a readable manufacturer page stays first priority; retailer facts only supplement and are labelled as such', async () => {
  const zOk = withPurchasePath(fixture('lg-lf25z6211s-page.html'));
  const { report } = await run({ ...withRetailer(zResult(hdZ)), pages: { [lfZ6211Url]: zOk, [hdZ]: retailPage(Z) } });
  const entry = discovery(report, Z);
  assert.equal(entry.source, lfZ6211Url);
  assert.equal(report.selectedSources.find((source) => source.id === entry.facts.model.sourceIds[0]).sourceClass, 'MANUFACTURER');
  const sources = report.candidateEvidence[Z].sources;
  assert.equal(sources.findIndex((item) => item.sourceClass === 'MANUFACTURER'), 0);
  assert.equal(report.candidateEvidence[Z].quality, EVIDENCE_QUALITY.MANUFACTURER_AND_TRUSTED_RETAILER);
  assert.equal(report.queries.some((item) => item.role === 'candidate-fallback'), false);
  assert.equal((await run({ pages: { [lfZ6211Url]: zOk } })).report.candidateEvidence[Z].quality, EVIDENCE_QUALITY.MANUFACTURER);
});

test('15: no extra search or fetch work when manufacturer evidence already succeeds', async () => {
  const successPages = { [lfZ6211Url]: withPurchasePath(fixture('lg-lf25z6211s-page.html')) };
  const { report, calls } = await run({ ...withRetailer(zResult(hdZ)), pages: successPages });
  assert.equal(searchesFor(calls, /site:homedepot\.com/).length, 0);
  assert.equal(report.queries.some((item) => item.role === 'candidate-fallback'), false);
  // The retailer page is only read as the second slot of the usual enrichment, exactly as before; nothing is fetched twice.
  assert.equal(new Set(calls.fetch.map(canonicalSourceUrl)).size, calls.fetch.length);
  assert.equal(report.candidateEvidence[Z].sources.filter((item) => item.sourceClass === 'MANUFACTURER' && item.extractionStatus === 'FACTS_BOUND').length, 1);
  assert.notEqual(report.candidateEvidence[Z].quality, EVIDENCE_QUALITY.TRUSTED_RETAILER);
  // Call counts recorded against the pre-change engine (HEAD): identical search and fetch sequences in manufacturer-success runs.
  assert.equal(calls.fetch.length, 4);
  assert.equal(calls.search.length, 7);
  assert.ok(report.candidateEvidence[H].quality === EVIDENCE_QUALITY.MANUFACTURER || report.candidateEvidence[H].quality === EVIDENCE_QUALITY.MANUFACTURER_AND_TRUSTED_RETAILER);
});

test('16: tracking-parameter variants of a candidate retailer page consume a single attempt', async () => {
  const variants = [hdZ, `${hdZ}?srsltid=a`, `${hdZ}?srsltid=b#reviews`, hdZ.replace('https://www.', 'https://')].map(zResult);
  const { calls, report } = await run({ ...withRetailer(...variants), pages: { [hdZ]: retailPage(Z) } });
  assert.equal(fetchesOf(calls, hdZ), 1);
  assert.equal(zSources(report).filter((source) => source.sourceClass === 'RETAILER').length, 1);
});

test('17: with no safe fallback the candidate is dropped visibly, with a reason, and one retailer search at most is spent', async () => {
  const { report, calls } = await run({});
  const entry = discovery(report, Z);
  assert.equal(entry.retailEligible, false);
  assert.equal(entry.rejectionReason, 'CANDIDATE_SOURCE_UNAVAILABLE');
  assert.equal(entry.evidenceQuality, null);
  assert.equal(report.candidateEvidence[Z].sources[0].blocked, true);
  assert.equal(searchesFor(calls, /site:homedepot\.com/).length, 1);
  assert.equal(report.evidence.some((item) => item.claim.subjectModel === Z), false);
  assert.deepEqual(ranked(report), [H]);
});

test('18: the retailer-only search result is fetched when no retailer page was in the candidate results', async () => {
  const { report, calls } = await run({ retailerSearch: [zResult(hdZ)], pages: { [hdZ]: retailPage(Z) } });
  assert.equal(searchesFor(calls, /site:homedepot\.com/).length, 1);
  assert.equal(fetchesOf(calls, hdZ), 1);
  assert.ok(report.queries.some((item) => item.role === 'candidate-fallback' && item.purpose === 'candidate'));
  assert.equal(discovery(report, Z).retailEligible, true);
});

test('19: retailer-only evidence caps discovery confidence at LOW while manufacturer evidence keeps MEDIUM', async () => {
  const retailerOnly = await run({ candidates: [zResult(lfZ6211Url), zResult(hdZ)], pages: { [hdZ]: retailPage(Z) } });
  assert.equal(retailerOnly.report.originalEvidence, ORIGINAL_EVIDENCE.MANUFACTURER);
  assert.equal(retailerOnly.report.recommendation.primary.candidate.discoveryConfidence, 'LOW');
  assert.equal(retailerOnly.report.recommendation.primary.confidence, 'LOW');
  const manufacturer = await run({});
  assert.equal(manufacturer.report.recommendation.primary.candidate.discoveryConfidence, 'MEDIUM');
});

test('20: evidence quality labels and the shared allowlist', () => {
  const page = (sourceClass, host) => ({ sourceClass, host });
  assert.equal(candidateEvidenceQuality([]), null);
  assert.equal(candidateEvidenceQuality([page('MANUFACTURER', 'lg.com')]), EVIDENCE_QUALITY.MANUFACTURER);
  assert.equal(candidateEvidenceQuality([page('RETAILER', 'homedepot.com')]), EVIDENCE_QUALITY.TRUSTED_RETAILER);
  assert.equal(candidateEvidenceQuality([page('RETAILER', 'homedepot.com'), page('RETAILER', 'homedepot.com')]), EVIDENCE_QUALITY.TRUSTED_RETAILER);
  assert.equal(candidateEvidenceQuality([page('RETAILER', 'homedepot.com'), page('RETAILER', 'ajmadison.com')]), EVIDENCE_QUALITY.MULTI_SOURCE_TRUSTED_RETAILER);
  assert.equal(candidateEvidenceQuality([page('MANUFACTURER', 'lg.com'), page('RETAILER', 'lowes.com')]), EVIDENCE_QUALITY.MANUFACTURER_AND_TRUSTED_RETAILER);
  assert.equal(EVIDENCE_QUALITY.MANUFACTURER, ORIGINAL_EVIDENCE.MANUFACTURER);
  assert.deepEqual(ORIGINAL_FALLBACK_RETAILERS, ['homedepot.com', 'lowes.com', 'bestbuy.com', 'ajmadison.com']);
});

test('public contract: a retailer-backed candidate shows retailer sources, LOW confidence, and no new fields or warnings', async () => {
  const provider = providers({ candidates: [zResult(lfZ6211Url), zResult(hdZ)], pages: { [hdZ]: retailPage(Z) } });
  const { handler } = buildHandler({ providers: provider });
  const res = await invoke(handler, createReq({ body: requestBody({ category: 'refrigerator', brand: 'LG', model: MODEL }) }));
  assert.equal(res.statusCode, 200);
  assert.equal(isValidPublicResponse(res.body), true);
  assert.deepEqual(Object.keys(res.body), ['contractVersion', 'status', 'category', 'retrievalQuality', 'original', 'primary', 'comparison', 'alternatives',
    'warnings', 'needsVerification', 'refinements', 'sources', 'meta']);
  assert.equal(res.body.primary.model, Z);
  assert.equal(res.body.primary.confidence, 'LOW');
  assert.equal(res.body.primary.retail.sourceDomain, 'homedepot.com');
  assert.ok(res.body.sources.some((item) => item.role === 'REPLACEMENT' && item.domain === 'homedepot.com'));
  assert.equal(res.body.sources.some((item) => item.role === 'REPLACEMENT' && /(^|\.)lg\.com$/.test(item.domain)), false);
  assert.equal(res.body.warnings.some((item) => /^CANDIDATE_/.test(item.code)), false);
  assert.equal(JSON.stringify(res.body).includes('CANDIDATE_SOURCE_UNAVAILABLE'), false);
  assert.equal(JSON.stringify(res.body).includes('candidateEvidence'), false);
});

test('counter-depth: unknown stays unknown through the fallback; the HARD verdict does not depend on it', async () => {
  const only = (counterDepth, extra = {}) => run({ candidates: [zResult(lfZ6211Url), zResult(hdZ)], pages: { [hdZ]: retailPage(Z, { counterDepth, ...extra }) } });
  const rowOf = (outcome) => outcome.report.recommendation.primary.comparisonRows.find((row) => row.key === 'counterDepth');
  const unknown = await only(null);
  // The retailer page says nothing about depth: the candidate is still established and eligible, and the fact is absent (not false).
  assert.equal(discovery(unknown.report, Z).retailEligible, true);
  assert.equal(discovery(unknown.report, Z).facts.counterDepth, undefined);
  assert.equal(rowOf(unknown).assessment, 'UNVERIFIED');
  const yes = await only('Yes');
  const no = await only('No');
  assert.equal(discovery(yes.report, Z).facts.counterDepth.value, true);
  assert.equal(discovery(no.report, Z).facts.counterDepth.value, false);
  // Only the counter-depth row differs; the HARD decision, classification and retail result are identical for all three pages.
  const verdict = (outcome) => { const p = outcome.report.recommendation.primary; return [p.classification, p.confidence, JSON.stringify(p.decision.hardFailures), outcome.report.retail.eligible[Z].eligible]; };
  assert.deepEqual(verdict(yes), verdict(unknown));
  assert.deepEqual(verdict(no), verdict(unknown));
  assert.notEqual(rowOf(yes).assessment, 'MATCH');
  assert.equal(rowOf(no).assessment, 'MATCH');
  // Contradictory statements about the exact model: AMBIGUOUS, never resolved either way, and still no effect on HARD rules.
  const conflicted = await only('No', { layout: 'Counter-Depth MAX French 3-Door' });
  const fact = discovery(conflicted.report, Z).facts.counterDepth;
  assert.deepEqual([fact.status, fact.value, fact.alternatives], ['AMBIGUOUS', null, [true, false]]);
  assert.equal(discovery(conflicted.report, Z).retailEligible, true);
  assert.notEqual(rowOf(conflicted).assessment, 'MATCH');
  assert.deepEqual(verdict(conflicted), verdict(unknown));
});

test('source conflict: manufacturer and retailer disagreeing on counter-depth is AMBIGUOUS; the candidate and every HARD result are unchanged', async () => {
  const zOk = withPurchasePath(fixture('lg-lf25z6211s-page.html'));
  // Z alone, so its comparison rows are readable. The retailer page states no dimensions, so counter-depth is the only disagreement.
  const flow = (counterDepth) => run({ candidates: [zResult(lfZ6211Url), zResult(hdZ)],
    pages: { [lfZ6211Url]: zOk, [hdZ]: retailPage(Z, { counterDepth, dimensions: false }) } });
  const rowOf = (outcome) => outcome.report.recommendation.primary.comparisonRows.find((row) => row.key === 'counterDepth');
  const verdict = (outcome) => { const p = outcome.report.recommendation.primary; return [p.classification, p.confidence, JSON.stringify(p.decision.hardFailures), outcome.report.retail.eligible[Z].eligible]; };
  const agree = await flow('Yes');
  const conflict = await flow('No');
  const silent = await flow(null);
  assert.equal(discovery(agree.report, Z).facts.counterDepth.value, true);
  assert.equal(discovery(silent.report, Z).facts.counterDepth.value, true);
  const fact = discovery(conflict.report, Z).facts.counterDepth;
  assert.deepEqual([fact.status, fact.value, [...fact.alternatives].sort()], ['AMBIGUOUS', null, [false, true]]);
  assert.deepEqual(fact.conflicts.map((side) => `${side.value}:${side.sourceClass}`).sort(), ['false:RETAILER', 'true:MANUFACTURER']);
  assert.equal(conflict.report.candidateEvidence[Z].quality, EVIDENCE_QUALITY.MANUFACTURER_AND_TRUSTED_RETAILER);
  // The conflict never drops the candidate or touches a HARD rule, retail result, classification or confidence; only its own row differs.
  assert.equal(discovery(conflict.report, Z).retailEligible, true);
  assert.deepEqual(verdict(conflict), verdict(agree));
  assert.deepEqual(verdict(conflict), verdict(silent));
  assert.notEqual(rowOf(conflict).assessment, rowOf(agree).assessment);
  assert.notEqual(rowOf(conflict).assessment, 'MATCH');
  assert.equal(rowOf(conflict).replacement.status, 'AMBIGUOUS');
  // Price and ranking mechanics are not involved: the conflict run ranks exactly as the agreeing run.
  assert.deepEqual(ranked(conflict.report), ranked(agree.report));
  // Nothing internal reaches the public response; the disagreement shows only as the generic "sources disagree" wording.
  const provider = providers({ candidates: [zResult(lfZ6211Url), zResult(hdZ)], pages: { [lfZ6211Url]: zOk, [hdZ]: retailPage(Z, { counterDepth: 'No', dimensions: false }) } });
  const { handler } = buildHandler({ providers: provider });
  const res = await invoke(handler, createReq({ body: requestBody({ category: 'refrigerator', brand: 'LG', model: MODEL }) }));
  assert.equal(isValidPublicResponse(res.body), true);
  const text = JSON.stringify(res.body);
  for (const internal of ['"conflicts"', 'SOURCE_CONFLICT', 'candidateEvidence', 'CANDIDATE_']) assert.equal(text.includes(internal), false, internal);
  const publicRow = res.body.comparison.find((row) => row.key === 'counterDepth');
  assert.notEqual(publicRow.assessment.code, 'MATCH');
});
