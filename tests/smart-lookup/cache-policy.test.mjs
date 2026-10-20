import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SMART_AGE_NEEDS_DETAIL_TTL_SECONDS,
  SMART_AGE_NEGATIVE_TTL_SECONDS,
  buildSmartAgeCacheKey,
  chooseSmartAgeTtl,
  matchesSmartAgeCacheRequest,
  prepareResultForCache,
} from '../../lib/smart-lookup/cache.js';
import { normalizeCachedSmartAgeResult } from '../../lib/smart-lookup/result-schema.js';
import { classifySmartLookupQuery } from '../../lib/smart-lookup/normalize.js';
import { isSmartAgeProductCompatible } from '../../lib/smart-lookup/age-identity.js';

const queryInfo = classifySmartLookupQuery('LG TV');
const source = { title: 'LG history', domain: 'lg.com', uri: 'https://www.lg.com/global/about-lg/history' };

test('cached xAI web age context restores citations and provider labels', () => {
  const cached = prepareResultForCache({
    brand: 'LG',
    category: 'television',
    contextLevel: 'brand-category',
    historicalContext: 'LG television history was researched from current web sources.',
    categoryEntryYear: 1966,
    source: 'xai',
    originSource: 'xai',
    evidenceSource: 'xai-web',
    sources: [source],
    retrievedAt: '2026-07-23T00:00:00.000Z',
    providerAttempted: true,
    fallbackUsed: true,
  });
  const restored = normalizeCachedSmartAgeResult(cached, { queryInfo });
  assert.equal(restored.source, 'cache');
  assert.equal(restored.originSource, 'xai');
  assert.equal(restored.evidenceSource, 'xai-web');
  assert.equal(restored.sources.length, 1);
  assert.equal(restored.sources[0].uri, source.uri);
  assert.equal(chooseSmartAgeTtl(restored), 180 * 24 * 60 * 60);
});

test('successful shared Serper estimates use the long-lived versioned cache policy', () => {
  assert.equal(chooseSmartAgeTtl({ evidenceSource: 'serper-extracted' }), 180 * 24 * 60 * 60);
});

test('provider failures short-cache useful deterministic substitutes', () => {
  assert.equal(chooseSmartAgeTtl({
    evidenceSource: 'heuristic',
    fallbackKind: 'deterministic-exact-model',
    errorCode: 'PROVIDER_ERROR',
  }), SMART_AGE_NEGATIVE_TTL_SECONDS);
  assert.equal(chooseSmartAgeTtl({ evidenceSource: 'none', errorCode: 'PROVIDER_ERROR' }), 0);
});

test('cached xAI ungrounded age context stays uncited', () => {
  const cached = prepareResultForCache({
    brand: 'Dell',
    productFamily: 'XPS 15',
    // Dated: a yearless answer is short-lived by policy (see the needs-detail TTL tests).
    familyIntroductionYear: 2012,
    source: 'xai',
    originSource: 'xai',
    evidenceSource: 'xai-ungrounded',
    sources: [source],
    providerAttempted: true,
    fallbackUsed: true,
  });
  const restored = normalizeCachedSmartAgeResult(cached, { queryInfo: classifySmartLookupQuery('Dell XPS 15') });
  assert.equal(restored.originSource, 'xai');
  assert.equal(restored.evidenceSource, 'xai-ungrounded');
  assert.deepEqual(restored.sources, []);
  assert.equal(chooseSmartAgeTtl(restored), 7 * 24 * 60 * 60);
});

// ── Needs-detail / yearless cache policy ──────────────────────────────────────

test('needs-detail TTL is inside the 15-60 minute window', () => {
  assert.ok(SMART_AGE_NEEDS_DETAIL_TTL_SECONDS >= 15 * 60);
  assert.ok(SMART_AGE_NEEDS_DETAIL_TTL_SECONDS <= 60 * 60);
});

test('a yearless provider answer is never cached for days, however it was produced', () => {
  for (const evidenceSource of ['gemini-grounded', 'gemini-ungrounded', 'openai-web', 'openai-ungrounded', 'xai-web', 'serper-extracted']) {
    assert.equal(
      chooseSmartAgeTtl({ evidenceSource, yearSignal: 'none' }),
      SMART_AGE_NEEDS_DETAIL_TTL_SECONDS,
      evidenceSource,
    );
  }
});

test('general guidance and withheld-timing results get the short TTL', () => {
  assert.equal(chooseSmartAgeTtl({ evidenceSource: 'gemini-ungrounded', routeMode: 'general_guidance', yearSignal: 'year' }), SMART_AGE_NEEDS_DETAIL_TTL_SECONDS);
  assert.equal(chooseSmartAgeTtl({ evidenceSource: 'gemini-grounded', yearEvidenceWithheld: true }), SMART_AGE_NEEDS_DETAIL_TTL_SECONDS);
});

test('dated results keep their existing long-lived TTLs', () => {
  assert.equal(chooseSmartAgeTtl({ evidenceSource: 'gemini-grounded', yearSignal: 'range' }), 180 * 24 * 60 * 60);
  assert.equal(chooseSmartAgeTtl({ evidenceSource: 'gemini-grounded', yearSignal: 'open-ended' }), 180 * 24 * 60 * 60);
  assert.equal(chooseSmartAgeTtl({ evidenceSource: 'gemini-ungrounded', yearSignal: 'year' }), 7 * 24 * 60 * 60);
});

test('route mode is part of the cache identity', () => {
  const info = classifySmartLookupQuery('Samsung Refrigerator');
  const guidance = buildSmartAgeCacheKey(info, { routeMode: 'general_guidance' });
  const precision = buildSmartAgeCacheKey(info, { routeMode: 'precision_research' });
  assert.notEqual(guidance, precision);
});

test('distinct unrecognized models and product-family generations have separate age cache identities', () => {
  const groups = [
    ['HP OfficeJet Pro 8710 All-in-One Printer', 'HP Envy 6055 All-in-One Printer', 'HP LaserJet 1020 printer'],
    ['Samsung Galaxy Tab A8 tablet', 'Samsung Galaxy Tab S9 tablet'],
  ];
  for (const group of groups) {
    const keys = group.map((query) => buildSmartAgeCacheKey(classifySmartLookupQuery(query),
      { grounded: true, routeMode: 'precision_research' }));
    assert.equal(new Set(keys).size, group.length);
    assert.ok(keys.every((key) => key.startsWith('smart-age:v6:estimate-first-single-heavy-2:')));
  }
});

test('non-exact age cache hits require the same normalized request', () => {
  const requested = classifySmartLookupQuery('HP OfficeJet Pro 8710 All-in-One Printer');
  const repeat = classifySmartLookupQuery('  HP   OfficeJet Pro 8710 All-in-One Printer  ');
  const other = classifySmartLookupQuery('HP Envy 6055 All-in-One Printer');
  const stored = prepareResultForCache({ brand: 'HP', introductionYear: 2016,
    requestFingerprint: 'provider-written', source: 'gemini' }, requested);
  assert.equal(buildSmartAgeCacheKey(requested), buildSmartAgeCacheKey(repeat));
  assert.equal(matchesSmartAgeCacheRequest(stored, repeat), true);
  assert.notEqual(stored.requestFingerprint, 'provider-written');
  assert.equal(matchesSmartAgeCacheRequest(stored, other), false);
  assert.equal(matchesSmartAgeCacheRequest({ ...stored, requestFingerprint: undefined }, requested), false);
  const exact = classifySmartLookupQuery('LG WM3900HWA');
  assert.equal(matchesSmartAgeCacheRequest(prepareResultForCache({ brand: 'LG' }), exact), true);
});

test('product identity is checked independently of the request fingerprint', () => {
  for (const [request, correct, wrong] of [
    ['HP OfficeJet Pro 8710 All-in-One Printer', 'HP OfficeJet Pro 8710', 'HP Envy 6055'],
    ['HP Envy 6055 All-in-One Printer', 'HP Envy 6055', 'HP LaserJet 1020'],
    ['Samsung Galaxy Tab A8 tablet', 'Samsung Galaxy Tab A8', 'Samsung Galaxy Tab S9'],
  ]) {
    const info = classifySmartLookupQuery(request);
    assert.equal(isSmartAgeProductCompatible({ brand: info.brand, likelyProduct: correct,
      exactModel: correct }, info), true, request);
    assert.equal(isSmartAgeProductCompatible({ brand: info.brand, likelyProduct: wrong,
      exactModel: wrong }, info), false, request);
  }
  const broad = classifySmartLookupQuery('HP printer');
  assert.equal(isSmartAgeProductCompatible({ brand: 'HP', likelyProduct: 'HP OfficeJet Pro 8710',
    introductionYear: 2016 }, broad), false);
  assert.equal(isSmartAgeProductCompatible({ brand: 'HP', likelyProduct: null }, broad), true);
  const exact = classifySmartLookupQuery('LG WM3900HWA');
  assert.equal(isSmartAgeProductCompatible({ brand: 'LG', model: 'WM3900HWA' }, exact), true);
  assert.equal(isSmartAgeProductCompatible({ brand: 'LG', model: 'WM4000HWA' }, exact), false);
  assert.equal(isSmartAgeProductCompatible({ brand: 'LG', model: 'WM3900HWA',
    likelyProduct: 'LG WM4000HWA washer' }, exact), false);
  const officeJet = classifySmartLookupQuery('HP OfficeJet Pro 8710 All-in-One Printer');
  assert.equal(isSmartAgeProductCompatible({ brand: 'HP', exactModel: 'OfficeJet Pro 8710',
    likelyProduct: 'HP Envy 6055' }, officeJet), false);
  const family = classifySmartLookupQuery('Samsung Galaxy Tab tablet');
  assert.equal(isSmartAgeProductCompatible({ brand: 'Samsung', likelyProduct: 'Samsung Galaxy Tab' }, family), true);
  assert.equal(isSmartAgeProductCompatible({ brand: 'Samsung', likelyProduct: 'Samsung Galaxy Tab S9' }, family), false);
});

// ── Identity-validation bypasses: contradictory secondary fields, identity-less dated cache ──

const IDENTITY_CASES = [
  { request: 'HP OfficeJet Pro 8710 All-in-One Printer', brand: 'HP', product: 'HP OfficeJet Pro 8710', model: 'OfficeJet Pro 8710',
    rival: 'HP Envy 6055' },
  { request: 'HP OfficeJet Pro 8710', brand: 'HP', product: 'HP OfficeJet Pro 8710', model: 'OfficeJet Pro 8710',
    rival: 'HP Envy 6055' },
  { request: 'HP Envy 6055', brand: 'HP', product: 'HP Envy 6055', model: 'Envy 6055', rival: 'HP LaserJet 1020' },
  { request: 'HP LaserJet 1020', brand: 'HP', product: 'HP LaserJet 1020', model: 'LaserJet 1020',
    rival: 'HP OfficeJet Pro 8710' },
  { request: 'Samsung Galaxy Tab A8 tablet', brand: 'Samsung', product: 'Samsung Galaxy Tab A8', model: 'Galaxy Tab A8',
    rival: 'Samsung Galaxy Tab S9' },
  { request: 'Samsung Galaxy Tab S9', brand: 'Samsung', product: 'Samsung Galaxy Tab S9', model: 'Galaxy Tab S9',
    rival: 'Samsung Galaxy Tab A8' },
];
const YEAR_CLAIMS = {
  bestEstimateYear: 2020,
  introductionYear: 2020,
  estimatedYear: '2020',
  familyIntroductionYear: 2020,
  lineIntroductionYear: 2020,
  modelYearFamilyYear: 2020,
  yearRange: '2019-2021',
  productionRange: { start: 2019, end: 2021 },
  estimatedRange: { start: 2019, end: 2021 },
  estimatedAgeRange: '5-7 years',
  endOfRetailAvailability: { date: '2022', confidence: 'high' },
  endOfManufacturerSupport: { date: '2025', confidence: 'high' },
};

test('a contradicting displayName or identifiedProduct rejects the result even when model matches', () => {
  for (const { request, brand, model, product, rival } of IDENTITY_CASES) {
    const info = classifySmartLookupQuery(request);
    for (const secondary of ['displayName', 'identifiedProduct', 'likelyProduct']) {
      for (const primary of ['model', 'exactModel']) {
        const result = { brand, [primary]: model, [secondary]: rival, bestEstimateYear: 2020 };
        assert.equal(isSmartAgeProductCompatible(result, info), false, `${request}: ${primary}=${model} vs ${secondary}=${rival}`);
      }
      // The order of the fields must not matter, and a matching field cannot launder a conflicting one.
      assert.equal(isSmartAgeProductCompatible({ brand, [secondary]: product, displayName: rival }, info),
        false, `${request}: ${secondary}=${product} vs displayName=${rival}`);
    }
  }
});

test('a contradicting secondary field is rejected on exact-model requests too', () => {
  const exact = classifySmartLookupQuery('LG WM3900HWA');
  assert.equal(isSmartAgeProductCompatible({ brand: 'LG', model: 'WM3900HWA', displayName: 'LG WM4000HWA washer' }, exact), false);
  assert.equal(isSmartAgeProductCompatible({ brand: 'LG', exactModel: 'WM3900HWA', identifiedProduct: 'LG WM4000HWA' }, exact), false);
  assert.equal(isSmartAgeProductCompatible({ brand: 'LG', model: 'WM3900HWA', displayName: 'LG Front Load Washer WM3900HWA' }, exact), true);
  assert.equal(isSmartAgeProductCompatible({ brand: 'LG', model: 'WM3900HWA', displayName: 'LG Front Load Washer (2019)' }, exact), true);
});

test('legitimate identities, formatting differences and broad-to-exact upgrades stay compatible', () => {
  for (const { request, brand, model, product } of IDENTITY_CASES) {
    const info = classifySmartLookupQuery(request);
    const lower = product.toLowerCase().replace(/ /g, '-');
    for (const result of [
      { brand, model, displayName: product, bestEstimateYear: 2020 },
      { brand, exactModel: model, likelyProduct: product, displayName: `${product} Printer`, introductionYear: 2016 },
      { brand, exactModel: model, identifiedProduct: product, bestEstimateYear: 2020 },
      { brand, likelyProduct: lower, displayName: product.toUpperCase(), bestEstimateYear: 2020 },
      { brand, displayName: product, bestEstimateYear: 2020 },
    ]) {
      assert.equal(isSmartAgeProductCompatible(result, info), true, `${request}: ${JSON.stringify(result)}`);
    }
  }
});

test('model-bearing requests fail closed on dated results with no product identity', () => {
  for (const { request, brand } of IDENTITY_CASES) {
    const info = classifySmartLookupQuery(request);
    for (const [field, value] of Object.entries(YEAR_CLAIMS)) {
      assert.equal(isSmartAgeProductCompatible({ brand, [field]: value }, info), false, `${request}: ${field}`);
    }
    // A name that carries no model token is not defensible identity for a model-bearing request.
    assert.equal(isSmartAgeProductCompatible({ brand, displayName: `${brand} printer`, bestEstimateYear: 2020 }, info), false, request);
    // Undated results (needs-detail guidance, clarification) stay readable, as do legacy shapes with a null year.
    assert.equal(isSmartAgeProductCompatible({ brand, yearSignal: 'none', bestEstimateYear: null, yearContext: null,
      manufactureYearCandidates: [] }, info), true, request);
  }
  const exact = classifySmartLookupQuery('LG WM3900HWA');
  assert.equal(isSmartAgeProductCompatible({ brand: 'LG', bestEstimateYear: 2020 }, exact), false);
});

test('broad requests with no model token are unaffected by the dated-identity requirement', () => {
  for (const request of ['HP printer', 'LG TV', 'Samsung Galaxy Tab']) {
    const info = classifySmartLookupQuery(request);
    assert.equal(isSmartAgeProductCompatible({ brand: info.brand, categoryEntryYear: 1984 }, info), true, request);
  }
});

test('a bare model number cannot hide a contradicting displayName', () => {
  const officeJet = classifySmartLookupQuery('HP OfficeJet Pro 8710 All-in-One Printer');
  assert.equal(isSmartAgeProductCompatible({ brand: 'HP', model: '8710', displayName: 'HP Envy 6055', bestEstimateYear: 2020 }, officeJet), false);
  assert.equal(isSmartAgeProductCompatible({ brand: 'HP', model: '8710', displayName: 'HP OfficeJet Pro 8710', bestEstimateYear: 2016 }, officeJet), true);
  const tab = classifySmartLookupQuery('Samsung Galaxy Tab A8');
  assert.equal(isSmartAgeProductCompatible({ brand: 'Samsung', model: 'Galaxy Tab A8', displayName: 'Samsung Galaxy Tab S9', bestEstimateYear: 2022 }, tab), false);
});

test('series and family fields can contradict a model request but never establish identity', () => {
  const tab = classifySmartLookupQuery('Samsung Galaxy Tab A8 tablet');
  const base = { brand: 'Samsung', likelyProduct: 'Samsung Galaxy Tab A8', introductionYear: 2022 };
  assert.equal(isSmartAgeProductCompatible({ ...base, series: 'Galaxy Tab S9' }, tab), false);
  assert.equal(isSmartAgeProductCompatible({ ...base, seriesLine: 'Galaxy Tab S9', productFamily: 'Galaxy Tab' }, tab), false);
  assert.equal(isSmartAgeProductCompatible({ ...base, series: 'Galaxy Tab A8', productFamily: 'Galaxy Tab' }, tab), true);
  // A bare family label is not identity for a dated model-bearing result; a series naming the model is.
  assert.equal(isSmartAgeProductCompatible({ brand: 'Samsung', productFamily: 'Galaxy Tab', series: 'Galaxy Tab',
    introductionYear: 2022 }, tab), false);
  assert.equal(isSmartAgeProductCompatible({ brand: 'Samsung', series: 'Galaxy Tab A8', introductionYear: 2022 }, tab), true);
  // A parent family token ("Q60") is broader than, not contradictory to, the requested model.
  const q60 = classifySmartLookupQuery('Samsung QN55Q60BAFXZA');
  assert.equal(isSmartAgeProductCompatible({ brand: 'Samsung', exactModel: 'QN55Q60BAFXZA', series: 'Q60', introductionYear: 2022 }, q60), true);
});
