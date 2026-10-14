import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { recommendByRetrieval } from '../../lib/replacement-discovery/live-retrieval.js';
import {
  ORIGINAL_EVIDENCE, ORIGINAL_FALLBACK_RETAILERS, assessOriginalFallback, canonicalSourceUrl, trustedOriginalFallbackSources,
} from '../../lib/replacement-discovery/refrigerator-retrieval.js';
import { RETAIL_NOW, PURCHASE_PATH } from '../helpers/retail-evidence.mjs';
import { buildHandler, createReq, fridgeProviders, invoke, lfH6200Url, lfZ6211Url, requestBody, result } from '../helpers/replacement-public-fixtures.mjs';

/**
 * Original-spec fallback: when the LG U.S. pages for LRFCS25D3S are refused (HTTP 403, as observed from the Vercel runtime), the
 * original may be established from exact-model U.S. retailer pages on a strict allowlist. Candidate rules are unchanged.
 */

const MODEL = 'LRFCS25D3S';
const fixture = (name) => fs.readFileSync(new URL(`../fixtures/replacement-discovery/${name}`, import.meta.url), 'utf8');
const lgProductUrl = 'https://www.lg.com/us/refrigerators/lg-lrfcs25d3s-french-3-door-refrigerator';
const lgSupportUrl = 'https://www.lg.com/us/support/product/lg-LRFCS25D3S';
const hdUrl = 'https://www.homedepot.com/p/LG-25-1-cu-ft-French-Door-Refrigerator-LRFCS25D3S/315656245';
const ajUrl = 'https://www.ajmadison.com/cgi-bin/ajmadison/LRFCS25D3S.html';
const lgOriginal = [result(`LG ${MODEL} refrigerator`, lgProductUrl), result(`LG ${MODEL} refrigerator support`, lgSupportUrl)];

/** A retailer product page with a stated specification table (capacity and dimensions). */
const fullRetailPage = (store, { capacity = '25.1', model = MODEL } = {}) => `<html><head><title>LG ${model} ${capacity} cu. ft. French Door Refrigerator - ${store}</title></head>`
  + `<body><h1>LG ${model} French 3-Door Refrigerator in Stainless Steel</h1><ul><li>Model Number ${model}</li><li>Total Capacity (cu. ft.) ${capacity}</li>`
  + '<li>Width 32.75 in</li><li>Height to Top of Hinge 69.88 in</li><li>Depth 35.38 in</li><li>Counter Depth No</li><li>Ice Maker Yes</li></ul>'
  + `<p>${PURCHASE_PATH}</p></body></html>`;
/** A retailer page that only names the model, layout and marketing capacity in its title. */
const minimalRetailPage = (store) => `<html><head><title>LG ${MODEL} 25.1 cu. ft. French 3-Door Refrigerator - ${store}</title></head>`
  + `<body><h1>LG ${MODEL}</h1><p>Smart refrigerator</p></body></html>`;

const candidateResults = [result('LG LF25H6200S French 3-door refrigerator', lfH6200Url), result('LG LF25Z6211S French 3-door refrigerator', lfZ6211Url)];

function providers({ fallback1 = [], fallback2 = [], pages = {}, lgStatus = 403, candidates = candidateResults, candidatePages = {} } = {}) {
  const calls = { search: [], fetch: [] };
  const fridge = fridgeProviders();
  const search = async (request) => {
    calls.search.push({ query: request.query, purpose: request.purpose });
    if (request.purpose === 'candidate') return /builder spec sheet/.test(request.query) ? [] : candidates;
    if (/site:lg\.com/.test(request.query)) return /builder spec sheet/.test(request.query) ? [] : lgOriginal;
    return /site:homedepot\.com/.test(request.query) ? fallback2 : fallback1;
  };
  const fetchPage = async (url) => {
    calls.fetch.push(url);
    const base = url.split('?')[0];
    if (base === lgProductUrl) return lgStatus === 200 ? { status: 200, contentType: 'text/html', text: fixture('lg-lrfcs25d3s-page.html') } : { status: lgStatus, contentType: 'text/html', text: '' };
    if (base === lgSupportUrl) return { status: lgStatus === 200 ? 404 : lgStatus, contentType: 'text/html', text: '' };
    if (pages[base] !== undefined) return { status: 200, contentType: 'text/html', text: pages[base] };
    if (candidatePages[base] !== undefined) return { status: 200, contentType: 'text/html', text: candidatePages[base] };
    return fridge.deps.fetchPage(base);
  };
  return { calls, deps: { search, fetchPage, retailNow: RETAIL_NOW } };
}

const runFallback = (options) => {
  const provider = providers(options);
  return recommendByRetrieval({ category: 'refrigerator', brand: 'LG', model: MODEL, deps: provider.deps }).then((outcome) => ({ outcome, report: outcome.report, calls: provider.calls }));
};
const roles = (report) => report.queries.map((item) => item.role);
const fetchesOf = (calls, url) => calls.fetch.filter((entry) => canonicalSourceUrl(entry) === canonicalSourceUrl(url)).length;

test('1: manufacturer 403 plus one sufficient trusted retailer page verifies the original and runs candidate discovery', async () => {
  const { outcome, report, calls } = await runFallback({ fallback1: [result(`LG ${MODEL} French Door Refrigerator`, hdUrl)], pages: { [hdUrl]: fullRetailPage('The Home Depot') } });
  assert.equal(report.originalEvidence, ORIGINAL_EVIDENCE.TRUSTED_RETAILER);
  assert.ok(report.reasonCodes.includes('MANUFACTURER_SOURCE_BLOCKED'));
  assert.ok(report.reasonCodes.includes('ORIGINAL_FROM_TRUSTED_RETAIL'));
  assert.equal(report.reasonCodes.includes('ORIGINAL_RESEARCH_INSUFFICIENT'), false);
  // Blocked pages are fetched once each; the unfetchable LG spec-sheet search is skipped; one fallback search suffices.
  assert.equal(fetchesOf(calls, lgProductUrl), 1);
  assert.equal(fetchesOf(calls, lgSupportUrl), 1);
  assert.deepEqual(roles(report).slice(0, 2), ['original', 'original-fallback']);
  assert.equal(roles(report).includes('original-spec'), false);
  assert.equal(report.candidateSearches.length, 4);
  const facts = report.original.facts;
  assert.deepEqual([facts.totalCapacityCuFt.value, facts.configuration.value, facts.layout.value], [25.1, 'FRENCH_DOOR', 'FRENCH_DOOR_3_DOOR']);
  assert.ok(report.candidateDiscovery.some((item) => item.model === 'LF25H6200S' && item.retailEligible));
  assert.ok(outcome.report.recommendation.primary);
  // Non-manufacturer original evidence: never RETRIEVED_STRONG (so never COMPLETE) and capped at LOW confidence.
  assert.equal(outcome.retrievalQuality, 'RETRIEVED_PARTIAL');
  assert.equal(outcome.status, 'PARTIAL');
  assert.equal(outcome.report.recommendation.primary.confidence, 'LOW');
});

test('2: manufacturer 403 plus two corroborating trusted retailers verifies the original as multi-source', async () => {
  const fallback1 = [result(`LG ${MODEL} refrigerator`, hdUrl), result(`LG ${MODEL} refrigerator`, ajUrl)];
  const { report } = await runFallback({ fallback1, pages: { [hdUrl]: minimalRetailPage('The Home Depot'), [ajUrl]: minimalRetailPage('AJ Madison') } });
  assert.equal(report.originalEvidence, ORIGINAL_EVIDENCE.MULTI_SOURCE_TRUSTED_RETAILER);
  assert.deepEqual(report.originalFallback.sources.map((item) => item.hostname).sort(), ['ajmadison.com', 'homedepot.com']);
  assert.deepEqual([...report.original.facts.totalCapacityCuFt.sourceIds].sort(), report.originalFallback.sources.map((item) => item.sourceId).sort());
  assert.equal(report.candidateSearches.length, 4);
});

test('3: manufacturer 403 plus only one weak retailer page stays ORIGINAL_UNVERIFIED with no candidate discovery', async () => {
  const weak = result(`LG ${MODEL} refrigerator`, hdUrl);
  const tracked = result(`LG ${MODEL} refrigerator`, `${hdUrl}?srsltid=abc123`);
  const { outcome, report, calls } = await runFallback({ fallback1: [weak], fallback2: [tracked], pages: { [hdUrl]: minimalRetailPage('The Home Depot') } });
  assert.equal(outcome.status, 'NO_RESULT');
  assert.equal(report.originalEvidence, null);
  assert.ok(report.reasonCodes.includes('ORIGINAL_RESEARCH_INSUFFICIENT'));
  assert.ok(report.reasonCodes.includes('MANUFACTURER_SOURCE_BLOCKED'));
  assert.equal(report.reasonCodes.includes('ORIGINAL_FROM_TRUSTED_RETAIL'), false);
  assert.deepEqual(roles(report), ['original', 'original-fallback', 'original-fallback']);
  assert.equal(report.candidateSearches.length, 0);
  assert.equal(fetchesOf(calls, hdUrl), 1);
  assert.equal(report.evidence.length, 0);
});

test('4: conflicting retailer capacities stay AMBIGUOUS and never drive candidate discovery', async () => {
  const fallback1 = [result(`LG ${MODEL} refrigerator`, hdUrl), result(`LG ${MODEL} refrigerator`, ajUrl)];
  const { outcome, report } = await runFallback({ fallback1, pages: { [hdUrl]: fullRetailPage('The Home Depot'), [ajUrl]: fullRetailPage('AJ Madison', { capacity: '26.2' }) } });
  assert.deepEqual(report.originalFallback.conflicts.includes('totalCapacityCuFt'), true);
  assert.ok(report.reasonCodes.includes('ORIGINAL_SOURCES_CONFLICT'));
  assert.equal(report.originalEvidence, null);
  assert.equal(report.candidateSearches.length, 0);
  assert.equal(outcome.status, 'NO_RESULT');
  const verdict = assessOriginalFallback([]);
  assert.equal(verdict.verified, false);
});

test('5: exact-model mismatches are rejected, by URL before fetching and by heading after', async () => {
  const otherModelUrl = 'https://www.homedepot.com/p/LG-25-cu-ft-French-Door-Refrigerator-LRFCS2503S/1';
  const { report, calls } = await runFallback({ fallback1: [result('LG LRFCS2503S refrigerator', otherModelUrl), result(`LG ${MODEL} refrigerator`, ajUrl)],
    pages: { [ajUrl]: fullRetailPage('AJ Madison', { model: 'LRFCS2503S' }) } });
  assert.equal(fetchesOf(calls, otherModelUrl), 0);
  assert.equal(fetchesOf(calls, ajUrl), 1);
  const aj = report.fetchResults.find((item) => report.selectedSources.find((source) => source.id === item.sourceId)?.url === ajUrl);
  assert.equal(aj.extraction.rejectionReason, 'HEADING_MODEL_MISSING');
  assert.equal(report.originalEvidence, null);
  assert.equal(report.candidateSearches.length, 0);
});

test('6 and 7: marketplace, non-allowlisted and non-U.S. retailer pages are never fetched for the original', async () => {
  const rejected = [
    `https://www.amazon.com/LG-${MODEL}-Refrigerator/dp/B0EXAMPLE`, `https://www.ebay.com/itm/LG-${MODEL}-refrigerator/1234`,
    `https://www.reddit.com/r/appliances/comments/${MODEL}-refrigerator`, `https://www.homedepot.ca/product/lg-${MODEL}-refrigerator/1001`,
    `https://www.bestbuy.ca/en-ca/product/lg-${MODEL}-refrigerator/150`, `https://www.homedepot.com/p/Refurbished-LG-${MODEL}-Refrigerator/2`,
    `https://www.abt.com/LG-${MODEL}-Refrigerator/p/1`,
  ];
  const { report, calls } = await runFallback({ fallback1: rejected.map((url) => result(`LG ${MODEL} refrigerator`, url)) });
  for (const url of rejected) assert.equal(fetchesOf(calls, url), 0, url);
  assert.deepEqual(trustedOriginalFallbackSources(rejected.map((url) => result(`LG ${MODEL} refrigerator`, url)), MODEL), []);
  assert.deepEqual(ORIGINAL_FALLBACK_RETAILERS, ['homedepot.com', 'lowes.com', 'bestbuy.com', 'ajmadison.com']);
  assert.equal(report.originalEvidence, null);
  assert.ok(report.reasonCodes.includes('ORIGINAL_RESEARCH_INSUFFICIENT'));
});

test('8: a readable manufacturer page still takes priority and no fallback search or retailer fetch happens', async () => {
  const { report, calls } = await runFallback({ lgStatus: 200, fallback1: [result(`LG ${MODEL} refrigerator`, hdUrl)], pages: { [hdUrl]: fullRetailPage('The Home Depot') } });
  assert.equal(report.originalEvidence, ORIGINAL_EVIDENCE.MANUFACTURER);
  assert.equal(roles(report).includes('original-fallback'), false);
  assert.equal(fetchesOf(calls, hdUrl), 0);
  assert.equal(report.reasonCodes.includes('MANUFACTURER_SOURCE_BLOCKED'), false);
  assert.equal(report.originalFallback, null);
  assert.ok(report.evidence.filter((item) => item.claim.subjectModel === MODEL).every((item) => item.sourceClass === 'MANUFACTURER'));
});

test('9: fallback facts keep retailer provenance and are never presented as manufacturer evidence', async () => {
  const { report } = await runFallback({ fallback1: [result(`LG ${MODEL} refrigerator`, `${hdUrl}?srsltid=tracking`)], pages: { [hdUrl]: fullRetailPage('The Home Depot') } });
  const [source] = report.originalFallback.sources;
  assert.equal(source.hostname, 'homedepot.com');
  assert.equal(source.sourceType, 'RETAILER_LISTING');
  assert.equal(source.extractionStatus, 'FACTS_BOUND');
  assert.ok(!Number.isNaN(Date.parse(source.observedAt)));
  assert.ok(source.url.startsWith('https://www.homedepot.com/p/'));
  const originalEvidence = report.evidence.filter((item) => item.claim.subjectModel === MODEL);
  assert.ok(originalEvidence.length > 0);
  for (const record of originalEvidence) {
    assert.deepEqual([record.sourceClass, record.firstParty, record.domain], ['RETAILER', false, 'homedepot.com']);
    assert.ok(record.url && record.observedAt);
  }
  for (const entry of report.original.view.researchSupported) assert.ok(entry.sources.every((item) => item.sourceClass === 'RETAILER'));
});

test('10: the candidate retail gate is unchanged when the original came from retailers', async () => {
  const { report } = await runFallback({ fallback1: [result(`LG ${MODEL} refrigerator`, hdUrl)], pages: { [hdUrl]: fullRetailPage('The Home Depot') },
    candidatePages: { [lfZ6211Url]: fixture('lg-lf25z6211s-page.html') } });
  assert.ok(Object.keys(report.retail.eligible).includes('LF25H6200S'));
  assert.ok(report.retail.rejected.some((item) => item.model === 'LF25Z6211S'));
  assert.equal(report.recommendation.primary.candidate.identity.facts.model.value, 'LF25H6200S');
});

test('11: candidate price never changes the ranking', async () => {
  const page = fixture('lg-lf25h6200s-page.html');
  const run = (price) => runFallback({ fallback1: [result(`LG ${MODEL} refrigerator`, hdUrl)], pages: { [hdUrl]: fullRetailPage('The Home Depot') },
    candidatePages: { [lfH6200Url]: `${page}<p>${price}</p><button type="button">Add to cart</button>` } });
  const modelOf = (item) => item.candidate.identity.facts.model.value;
  const ranked = (report) => [modelOf(report.recommendation.primary), ...report.recommendation.alternatives.map((item) => modelOf(item.recommendation))];
  const cheap = await run('$99.99');
  const expensive = await run('$9,999.99');
  assert.equal(ranked(cheap.report)[0], 'LF25H6200S');
  assert.deepEqual(ranked(cheap.report), ranked(expensive.report));
});

test('12: tracking-parameter variants of a page are fetched once, for originals and candidates', async () => {
  assert.equal(canonicalSourceUrl(`${hdUrl}?srsltid=a#reviews`), canonicalSourceUrl(`${hdUrl.replace('https://www.', 'https://')}/?srsltid=b`));
  assert.notEqual(canonicalSourceUrl(hdUrl), canonicalSourceUrl(ajUrl));
  const candidates = [result('LG LF25H6200S French 3-door refrigerator', `${lfH6200Url}?srsltid=one`), result('LG LF25H6200S French 3-door refrigerator', `${lfH6200Url}?srsltid=two`),
    result('LG LF25Z6211S French 3-door refrigerator', lfZ6211Url)];
  const { calls } = await runFallback({ fallback1: [result(`LG ${MODEL} refrigerator`, hdUrl), result(`LG ${MODEL} refrigerator`, `${hdUrl}?srsltid=dup`)],
    pages: { [hdUrl]: fullRetailPage('The Home Depot') }, candidates });
  assert.equal(fetchesOf(calls, hdUrl), 1);
  assert.equal(fetchesOf(calls, lfH6200Url), 1);
});

test('public response shows both notices, keeps PARTIAL status and is not cached', async () => {
  const provider = providers({ fallback1: [result(`LG ${MODEL} refrigerator`, hdUrl)], pages: { [hdUrl]: fullRetailPage('The Home Depot') } });
  const { handler, redis } = buildHandler({ providers: provider });
  const res = await invoke(handler, createReq({ body: requestBody({ category: 'refrigerator', brand: 'LG', model: MODEL }) }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'PARTIAL');
  const codes = res.body.warnings.map((item) => item.code);
  assert.ok(codes.includes('MANUFACTURER_SOURCE_UNAVAILABLE'));
  assert.ok(codes.includes('ORIGINAL_FROM_RETAIL_SOURCES'));
  assert.equal(codes.includes('ORIGINAL_UNVERIFIED'), false);
  assert.equal(res.body.warnings.find((item) => item.code === 'ORIGINAL_FROM_RETAIL_SOURCES').message,
    'Original specifications verified from trusted retail sources because the manufacturer page was unavailable.');
  assert.equal(res.body.primary.confidence, 'LOW');
  assert.ok(res.body.sources.filter((item) => item.role === 'ORIGINAL').every((item) => item.domain === 'homedepot.com'));
  assert.equal(redis.calls.some(([op]) => op === 'set'), false);
});
