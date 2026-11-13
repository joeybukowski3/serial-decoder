import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgeLookupHandler } from '../../api/age-lookup.js';
import { retrievalFirstLookup } from '../../lib/smart-lookup/retrieval-first.js';
import { classifySmartOutcome } from '../../lib/smart-lookup/outcome.js';
import { allowingRateLimiter } from '../helpers/allowing-rate-limiter.mjs';

const request = (query) => ({ method: 'POST', body: { query }, headers: { 'x-forwarded-for': '127.0.0.1' }, socket: {} });
const response = () => ({ statusCode: 0, payload: null, status(code) { this.statusCode = code; return this; }, json(value) { this.payload = value; return this; }, setHeader() {} });
const row = (title, domain, snippet = title) => ({ title, snippet, url: `https://${domain}/item` });
const fixtures = {
  'mvwx655dw1': { brand: 'Maytag', code: 'MVWX655DW1', productType: 'washer', rows: [
    row('Maytag MVWX655DW1 washer', 'maytag.com', 'Official Maytag MVWX655DW1 washer support'),
    row('Maytag MVWX655DW1 washer parts', 'repairclinic.com'),
  ] },
  'RUNHOOD EB324': { brand: 'Runhood', code: 'EB324', productType: 'battery', rows: [
    row('Runhood EB324 Energy Bar battery', 'runhoodpower.com'),
    row('Runhood EB324 modular battery', 'battery.example'),
  ] },
  'Samsung UN55NU7100': { brand: 'Samsung', code: 'UN55NU7100', productType: 'television', rows: [
    row('Samsung UN55NU7100 television', 'samsung.com'),
    row('Samsung UN55NU7100 television support', 'support.example'),
  ] },
  'ASUS C301SA': { brand: 'ASUS', code: 'C301SA', productType: 'chromebook', rows: [
    row('ASUS C301SA Chromebook', 'asus.com'),
    row('ASUS C301SA Chromebook support', 'support.example'),
  ] },
};

function synthesis(fixture) {
  return { identified: true, brand: fixture.brand, model: fixture.code, exactModel: fixture.code,
    originalIdentifier: fixture.code, identifierType: 'model', productType: fixture.productType,
    likelyProduct: `${fixture.brand} ${fixture.code} ${fixture.productType}`,
    description: `${fixture.brand} ${fixture.code} ${fixture.productType}`,
    identityConfidence: 'high', identityBasis: 'Matching source results', introductionYear: null,
    productionRange: null, dateConfidence: 'unknown', needsMoreDetail: false, refinementSuggestion: null };
}

test('normalized model display names stay on retrieval-first without fallback', async () => {
  for (const [query, model] of [
    ['Samsung UN55NU7100', 'Samsung UN55-NU7100'],
    ['RUNHOOD EB324', 'RUNHOOD EB324 Energy Bar'],
    ['ASUS C301SA', 'ASUS Chromebook C301SA'],
  ]) {
    const fixture = fixtures[query];
    const app = setup({ lookup: (text) => retrievalFirstLookup(text, {
      searchImpl: async () => fixture.rows,
      synthesisImpl: async () => ({ ok: true, result: { ...synthesis(fixture), model, exactModel: fixture.code }, requestCount: 1 }),
    }) });
    const result = await call(app, query);
    assert.equal(result.resultType, 'retrieval-identity', query);
    assert.equal(app.counts().providers, 0, query);
    const log = app.logs.find((entry) => entry.event === 'smart_age_lookup');
    assert.equal(log.retrievalFirstSucceeded, true, query);
    assert.equal(log.retrievalFirstFailureReason, null, query);
  }
});

test('Apple and Cummins descriptive identities reach the API without a second provider', async () => {
  for (const [query, brand, code, model, productType, year, domain] of [
    ['A2901', 'Apple', 'A2901', 'Mac Studio', 'desktop computer', 2023, 'apple.com'],
    ['cummins onan rs20a model 20gsbb-6714a', 'Cummins Onan', '20GSBB-6714A', 'RS20A', 'standby generator', 2012, 'cummins.com'],
  ]) {
    const fixture = { brand, code, productType };
    const app = setup({ lookup: (text) => retrievalFirstLookup(text, {
      searchImpl: async () => [row(`${brand} ${model} ${code} ${productType}`, domain),
        row(`${brand} ${code} ${model} ${productType} support`, 'support.example')],
      synthesisImpl: async () => ({ ok: true, requestCount: 1, result: {
        ...synthesis(fixture), model, likelyProduct: `${brand} ${productType}`,
        estimatedIntroductionYear: year, introductionYearConfidence: 'medium',
        introductionYearReason: `Approximate ${year} model-era estimate from the retrieved identity.`,
        introductionYearEvidence: { description: 'Exact-model support', sourceUrl: `https://${domain}/item` },
      } }),
    }) });
    const result = await call(app, query);
    assert.equal(result.resultType, 'retrieval-identity', query);
    assert.equal(result.model, model, query);
    assert.equal(result.exactModel, code, query);
    assert.equal(result.estimatedIntroductionYear, year, query);
    assert.equal(result.introductionYearConfidence, 'medium', query);
    assert.equal(result.identityConfidence, 'high', query);
    assert.equal(result.individualManufactureYear, null, query);
    assert.equal(app.counts().providers, 0, query);
  }
});

test('A2901 keeps a low-confidence model introduction estimate without a dated citation', async () => {
  const fixture = { brand: 'Apple', code: 'A2901', productType: 'desktop computer' };
  const app = setup({ lookup: (text) => retrievalFirstLookup(text, {
    searchImpl: async () => [row('Apple Mac Studio A2901 desktop computer', 'apple.com'),
      row('Apple A2901 Mac Studio support', 'support.example')],
    synthesisImpl: async () => ({ ok: true, requestCount: 1, result: {
      ...synthesis(fixture), model: 'Mac Studio', exactModel: 'A2901',
      likelyProduct: 'Apple Mac Studio', identityConfidence: 'low',
      estimatedIntroductionYear: 2023, introductionYearConfidence: 'low',
      introductionYearReason: 'Approximate model introduction based on the identified generation.',
      introductionYearEvidence: null,
    } }),
  }) });
  const result = await call(app, 'A2901');
  assert.equal(classifySmartOutcome(result).resultStatus, 'resolved');
  assert.equal(result.estimatedIntroductionYear, 2023);
  assert.equal(result.introductionYearConfidence, 'low');
  assert.equal(result.estimateBasis, 'model-introduction');
  assert.equal(result.yearSignal, 'year');
  assert.equal(result.identityConfidence, 'low');
  assert.equal(result.individualManufactureYear, null);
  assert.equal(result.timingConfidence, 'low');
  assert.equal(app.counts().providers, 0);
});

test('supported identity with no reasonable year stays undated', async () => {
  const fixture = { brand: 'Apple', code: 'A2901', productType: 'desktop computer' };
  const app = setup({ lookup: (text) => retrievalFirstLookup(text, {
    searchImpl: async () => [row('Apple Mac Studio A2901 desktop computer', 'apple.com')],
    synthesisImpl: async () => ({ ok: true, requestCount: 1, result: {
      ...synthesis(fixture), model: 'Mac Studio', likelyProduct: 'Apple Mac Studio',
      estimatedIntroductionYear: null, introductionYearConfidence: 'unknown',
    } }),
  }) });
  const result = await call(app, 'A2901');
  assert.equal(result.exactModel, 'A2901');
  assert.equal(result.estimatedIntroductionYear, null);
  assert.equal(result.introductionYear, null);
  assert.equal(result.yearSignal, 'none');
  assert.equal(classifySmartOutcome(result).resultStatus, 'needs-detail');
});

// Production diagnostic audit (Nov 9-12 2026) queries through the full handler.
test('audit identities resolve on retrieval-first without a second provider; KDPS624PS substitution does not', async () => {
  const cases = [
    ['UN65RU800DFXZA', 'Samsung', 'UN65RU800D', 'television', 2019, 'family',
      [row('Samsung UN65RU800DFXZA 65" Class RU800D TV', 'samsung.com'), row('Samsung UN65RU800DFXZA television', 'bestbuy.com')]],
    ['Cummins Onan RS20A model 20GSBB-6714A', 'Cummins Onan', 'RS20A', 'standby generator', 2012, 'descriptive',
      [row('Cummins Onan RS20A 20GSBB-6714A standby generator', 'cummins.com'), row('Cummins 20GSBB-6714A generator', 'parts.example')]],
    // HA-B5T / EBT1-21044 / FCC ID 2ATF51604783 is externally documented; the row carries it.
    ['EBT1-21044', 'JVC', 'HA-B5T', 'earbuds', 2021, 'evidence-alias',
      [row('JVC HA-B5T True Wireless Earbuds', 'fccid.example', 'JVC HA-B5T, Model EBT1-21044, FCC ID 2ATF51604783'), row('EBT1-21044 JVC earbuds', 'support.example')]],
    ['GDF550PGR7WW', 'GE', 'GDF550PGRWW', 'dishwasher', 2018, 'evidence-alias',
      [row('GE GDF550PGR7WW dishwasher', 'partselect.ca', 'GE GDF550PGR7WW (GDF550PGRWW) dishwasher parts'), row('GE GDF550PGR7WW Dishwasher', 'searspartsdirect.com')]],
  ];
  for (const [query, brand, model, productType, year, anchor, rows] of cases) {
    const code = query.split(' ').pop();
    const app = setup({ lookup: (text) => retrievalFirstLookup(text, { searchImpl: async () => rows,
      synthesisImpl: async () => ({ ok: true, requestCount: 1, result: { ...synthesis({ brand, code, productType }), model,
        likelyProduct: `${brand} ${productType}`, identityConfidence: 'medium', estimatedIntroductionYear: year,
        introductionYearConfidence: 'medium', introductionYearReason: 'Model-era estimate.' } }) }) });
    const result = await call(app, query);
    assert.equal(result.resultType, 'retrieval-identity', query);
    assert.equal(result.model, model, query);
    assert.equal(result.exactModel.replace(/[^A-Z0-9]/g, ''), code.toUpperCase().replace(/[^A-Z0-9]/g, ''), query);
    assert.equal(result.estimatedIntroductionYear, year, query);
    assert.equal(app.counts().providers, 0, query);
    const log = app.logs.find((entry) => entry.event === 'smart_age_lookup');
    assert.equal(log.retrievalFirstIdentityAnchor, anchor, query);
    assert.equal(JSON.stringify(log).includes(code), false, `${query} raw code stays out of telemetry`);
  }
  const app = setup({ lookup: (text) => retrievalFirstLookup(text, {
    searchImpl: async () => [row('KitchenAid KDPS624PS KDPS624SPS dishwasher', 'ebay.com'), row('KDPS624PS dishwasher', 'parts.example')],
    synthesisImpl: async () => ({ ok: true, requestCount: 1, result: { ...synthesis({ brand: 'KitchenAid', code: 'KDPS624PS', productType: 'dishwasher' }),
      model: 'KDPS624SPS', estimatedIntroductionYear: 2021, introductionYearConfidence: 'medium' } }) }) });
  const result = await call(app, 'KDPS624PS');
  assert.notEqual(result.resultType, 'retrieval-identity');
  const log = app.logs.find((entry) => entry.event === 'smart_age_lookup');
  assert.equal(log.retrievalFirstFailureReason, 'IDENTIFIER_CHANGED');
  assert.equal(log.retrievalFirstIdentityAnchor, 'competing-identifier');
});

test('a remote part number does not inherit the TV it fits from a bracketed listing', async () => {
  const app = setup({ lookup: (text) => retrievalFirstLookup(text, {
    searchImpl: async () => [row('Remote Control for LG 55UH6150 (AKB75095307)', 'shop.example'), row('LG 55UH6150 55" 4K UHD TV', 'lg.com')],
    synthesisImpl: async () => ({ ok: true, requestCount: 1, result: { ...synthesis({ brand: 'LG', code: 'AKB75095307', productType: 'television' }),
      model: '55UH6150', likelyProduct: 'LG 55UH6150 55-inch 4K TV', estimatedIntroductionYear: 2016, introductionYearConfidence: 'medium' } }) }) });
  const result = await call(app, 'AKB75095307');
  assert.notEqual(result.resultType, 'retrieval-identity');
  assert.notEqual(result.model, '55UH6150');
  assert.doesNotMatch(String(result.likelyProduct ?? ''), /55UH6150/);
  const log = app.logs.find((entry) => entry.event === 'smart_age_lookup');
  assert.equal(log.retrievalFirstFailureReason, 'IDENTIFIER_CHANGED');
  assert.equal(log.retrievalFirstIdentityAnchor, 'unsupported-alias');
});

// Formatting equivalence may prevent UNRELATED_MODEL but must not create
// product or year evidence. WF7200 is not an established Epson model.
async function formattingHandlerCall(query, rows, native, { synthesis } = {}) {
  const calls = { native: 0 };
  const handler = createAgeLookupHandler({ rateLimiter: allowingRateLimiter,
    env: { SMART_LOOKUP_RETRIEVAL_FIRST_ENABLED: 'true', SMART_LOOKUP_NATIVE_GEMINI_SEARCH_ENABLED: 'true' },
    logger: { info() {}, log() {}, warn() {}, error() {} }, localLookup: async () => null, redis: fakeRedis(),
    reserveProviderBudget: async () => ({ allowed: true, status: 'allowed', logicalLookupCount: 1 }),
    recordProviderAttemptMetrics: async (_redis, _kind, count) => ({ actualProviderAttemptCount: count }),
    retrievalFirstLookup: (text) => retrievalFirstLookup(text, { searchImpl: async () => rows,
      synthesisImpl: async () => ({ ok: true, requestCount: 1, result: synthesis || { identified: true, brand: native.brand,
        model: native.model, exactModel: native.model, originalIdentifier: query, identifierType: 'model',
        productType: native.category, likelyProduct: native.product, identityConfidence: 'medium', identityBasis: 'Provider match',
        estimatedIntroductionYear: native.bestEstimateYear, introductionYearConfidence: 'medium',
        introductionYearReason: 'Model-era estimate.', needsMoreDetail: false } }) }),
    nativeGeminiSearchLookup: async () => { calls.native += 1; return native; },
    providerLookup: async () => { throw new Error('legacy research must not run'); },
  });
  const out = response();
  await handler(request(query), out);
  return { result: out.payload, calls };
}

const nativeAnswer = (brand, model, category, sourceTitle, year) => ({ brand, model, product: `${brand} ${model} ${category}`, category,
  bestEstimateYear: year, estimatedRange: { startYear: year, endYear: year + 2 }, precision: 'exact_model', confidence: 'medium',
  estimateBasis: 'Model-era estimate.', summary: 'Provider summary.', isIndividualUnitDate: false, caveats: [],
  sources: [{ title: sourceTitle, url: 'https://maker.example/item', evidenceText: [`${sourceTitle} launched ${year}`] }] });

test('WF7200 with only neighbouring Epson evidence stays qualified and undated, never UNRELATED_MODEL', async () => {
  const { result, calls } = await formattingHandlerCall('WF7200',
    [row('Epson WorkForce WF-7210 wide-format printer', 'epson.com'), row('Epson WorkForce WF-7720 all-in-one', 'rtings.com')],
    nativeAnswer('Epson', 'WF-7200', 'printer', 'Epson WorkForce WF-7210', 2017));
  assert.equal(calls.native, 1);
  assert.notEqual(result.errorCode, 'UNRELATED_MODEL');
  assert.notEqual(result.resultType, 'retrieval-identity');
  for (const field of ['estimatedIntroductionYear', 'introductionYear', 'bestEstimateYear']) assert.equal(result[field] ?? null, null, field);
  assert.equal(classifySmartOutcome(result).resultStatus, 'needs-detail');
});

test('a formatting-only match keeps its year only when a cited source names the code', async () => {
  // Fictional code: the control proves the gate, not any real product's date.
  const { result } = await formattingHandlerCall('ZX4100', [row('Acme ZX-3100 widget', 'maker.example')],
    nativeAnswer('Acme', 'ZX-4100', 'widget', 'Acme ZX-4100 widget', 2016));
  assert.notEqual(result.errorCode, 'UNRELATED_MODEL');
  assert.equal(result.bestEstimateYear ?? result.introductionYear, 2016);
});

// B3: production shape. Grounding titles are bare domains, URLs are redirects,
// and evidenceText is the provider's own sentence attributed to a chunk, so it
// cannot vouch for the code the provider wrote.
const REDIRECT = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/a';
const EPSON_NEIGHBOUR_ROWS = [row('Epson WorkForce WF-7210 wide-format printer', 'epson.com'), row('Epson WorkForce WF-7720 all-in-one', 'rtings.com')];
const productionNative = () => ({ ...nativeAnswer('Epson', 'WF-7200', 'printer', 'epson.com', 2017),
  summary: 'Epson WorkForce wide-format printer. The Epson WF-7200 launched in 2017.',
  estimateBasis: 'The WF-7200 was introduced in 2017.',
  sources: [{ title: 'epson.com', url: REDIRECT, evidenceText: ['The Epson WF-7200 launched in 2017.'] }] });

function assertUndated(result) {
  assert.notEqual(result.errorCode, 'UNRELATED_MODEL');
  for (const field of ['estimatedIntroductionYear', 'introductionYear', 'bestEstimateYear']) assert.equal(result[field] ?? null, null, field);
  assert.equal(classifySmartOutcome(result).resultStatus, 'needs-detail');
  for (const field of ['summary', 'notes', 'introductionYearReason', 'historicalContext']) assert.doesNotMatch(String(result[field] ?? ''), /2017/, field);
  for (const item of result.evidence || []) assert.doesNotMatch(String(item?.detail ?? ''), /2017/, 'evidence detail');
}

// Round 4: a search-results page echoes the query; it is not independent evidence.
const ECHO_ROW = { title: 'Wf7200 for sale | eBay', snippet: 'Find great deals on eBay for wf7200.', url: 'https://www.ebay.com/sch/i.html?_nkw=wf7200' };

test('native: a search page echoing WF7200 cannot establish a formatting-only year', async () => {
  const { result, calls } = await formattingHandlerCall('WF7200', [...EPSON_NEIGHBOUR_ROWS, ECHO_ROW], productionNative(),
    { synthesis: { identified: false } });
  assert.equal(calls.native, 1);
  assertUndated(result);
  assert.equal(result.confidence ?? result.confidenceLevel, 'low');
});

test('native: a genuine content page listing WF-7200 among other models still counts', async () => {
  const { result } = await formattingHandlerCall('WF7200',
    [...EPSON_NEIGHBOUR_ROWS, ECHO_ROW, row('Ink cartridges for WF-7210, WF-7710, WF-7200 printers', 'ink.example')], productionNative(),
    { synthesis: { identified: false } });
  assert.notEqual(result.errorCode, 'UNRELATED_MODEL');
  assert.equal(result.bestEstimateYear ?? result.introductionYear, 2017);
});

test('native: the provider\'s own attributed sentence cannot establish a formatting-only year', async () => {
  const { result, calls } = await formattingHandlerCall('WF7200', EPSON_NEIGHBOUR_ROWS, productionNative());
  assert.equal(calls.native, 1);
  assertUndated(result);
  assert.equal(result.confidence ?? result.confidenceLevel, 'low');
});

test('native: a retrieved Serper row naming the code allows the formatting-only year', async () => {
  const { result, calls } = await formattingHandlerCall('WF7200',
    [row('Epson WorkForce WF-7200 printer', 'epson.com'), ...EPSON_NEIGHBOUR_ROWS], productionNative(),
    { synthesis: { identified: false } });
  assert.equal(calls.native, 1);
  assert.notEqual(result.errorCode, 'UNRELATED_MODEL');
  assert.equal(result.bestEstimateYear ?? result.introductionYear, 2017);
});

// The legacy provider path (native search off) applies the same gate.
const legacyAnswer = (sources) => {
  const value = { brand: 'Epson', model: 'WF-7200', likelyProduct: 'Epson WorkForce WF-7200 printer', specificityLevel: 'specific',
    introductionYear: 2017, productionRange: { start: 2017, end: 2019, basis: 'model-availability' },
    summary: 'Epson WorkForce wide-format printer. The Epson WF-7200 launched in 2017.', notes: 'Introduced in 2017.',
    historicalContext: 'Part of the 2017 WorkForce refresh.', evidence: [{ detail: 'Introduced in 2017 per Epson.', source: 'Epson' }] };
  Object.defineProperty(value, Symbol.for('smart-lookup-provider-metadata'), { enumerable: false, value: Object.freeze({
    provider: 'gemini', fallbackUsed: false, primaryProvider: 'gemini', primaryErrorCode: null, grounded: true,
    groundedSources: sources, searchQueryCount: 1 }) });
  return value;
};

async function legacyHandlerCall(query, rows, answer) {
  const calls = { legacy: 0 };
  const handler = createAgeLookupHandler({ rateLimiter: allowingRateLimiter,
    env: { SMART_LOOKUP_RETRIEVAL_FIRST_ENABLED: 'true', SMART_LOOKUP_NATIVE_GEMINI_SEARCH_ENABLED: 'false' },
    logger: { info() {}, log() {}, warn() {}, error() {} }, localLookup: async () => null, redis: fakeRedis(),
    reserveProviderBudget: async () => ({ allowed: true, status: 'allowed', logicalLookupCount: 1 }),
    recordProviderAttemptMetrics: async (_redis, _kind, count) => ({ actualProviderAttemptCount: count }),
    retrievalFirstLookup: (text) => retrievalFirstLookup(text, { searchImpl: async () => rows,
      synthesisImpl: async () => ({ ok: true, requestCount: 1, result: { identified: false } }) }),
    nativeGeminiSearchLookup: async () => { throw new Error('native search must not run'); },
    providerLookup: async () => { calls.legacy += 1; return answer; },
  });
  const out = response();
  await handler(request(query), out);
  return { result: out.payload, calls };
}

test('legacy: attributed provider text cannot establish a formatting-only year', async () => {
  const { result, calls } = await legacyHandlerCall('WF7200', EPSON_NEIGHBOUR_ROWS,
    legacyAnswer([{ title: 'epson.com', domain: 'epson.com', uri: REDIRECT, evidenceText: ['The Epson WF-7200 launched in 2017.'] }]));
  assert.equal(calls.legacy, 1);
  assertUndated(result);
});

test('legacy: a cited page title naming the code leaves the answer ungated', async () => {
  const { result, calls } = await legacyHandlerCall('WF7200', EPSON_NEIGHBOUR_ROWS,
    legacyAnswer([{ title: 'Epson WorkForce WF-7200 Printer', domain: 'epson.com', uri: 'https://epson.com/wf-7200' }]));
  assert.equal(calls.legacy, 1);
  assert.notEqual(result.errorCode, 'UNRELATED_MODEL');
  // The gate leaves this answer whole (its year prose survives). The structured
  // year itself is then withheld by the normalizer's existing rule for a
  // brandless partial legacy query, exactly as on main.
  assert.match(result.summary, /2017/);
  assert.match(result.notes, /2017/);
});

function fakeRedis(initial = null) {
  let stored = initial;
  const writes = [];
  return { writes, get: async () => stored, set: async (_key, value) => { stored = value; writes.push(value); },
    eval: async () => [1, 1, 1], incrby: async (_key, amount) => amount, expire: async () => 1 };
}

function setup({ enabled = true, lookup, localLookup = async () => null, redis = fakeRedis(), providerLookup, env = {}, totalBudgetMs } = {}) {
  const logs = [];
  let providers = 0;
  let retrievals = 0;
  let metered = 0;
  const handler = createAgeLookupHandler({
    env: { SMART_LOOKUP_RETRIEVAL_FIRST_ENABLED: enabled ? 'true' : 'false', ...env }, totalBudgetMs,
    logger: { info: (line) => { try { logs.push(JSON.parse(line)); } catch (_) {} } },
    localLookup, redis, rateLimiter: allowingRateLimiter,
    reserveProviderBudget: async () => ({ allowed: true, status: 'allowed', logicalLookupCount: 1 }),
    recordProviderAttemptMetrics: async (_redis, _kind, count) => { metered += count; return { actualProviderAttemptCount: count }; },
    retrievalFirstLookup: async (query, options) => { retrievals += 1; return lookup ? lookup(query, options) : { failureReason: 'NO_SEARCH_RESULTS' }; },
    providerLookup: async (info) => { providers += 1; return providerLookup ? providerLookup(info) : { brand: 'Maytag', model: 'MVWX655DW1', summary: 'Existing provider answer' }; },
  });
  return { handler, logs, redis, counts: () => ({ providers, retrievals, metered }) };
}

async function call(app, query) { const out = response(); await app.handler(request(query), out); return out.payload; }

test('flag off leaves retrieval unused and existing provider runs', async () => {
  const app = setup({ enabled: false });
  await call(app, 'mvwx655dw1');
  assert.equal(app.counts().retrievals, 0);
  assert.equal(app.counts().providers, 1);
});

for (const [query, fixture] of Object.entries(fixtures)) {
  test(`${query} strong retrieval returns a source-backed identity without later provider spend`, async () => {
    const app = setup({ lookup: (text) => retrievalFirstLookup(text, {
      searchImpl: async () => fixture.rows,
      synthesisImpl: async () => ({ ok: true, result: synthesis(fixture), requestCount: 1,
        usage: { inputTokens: 100, outputTokens: 50 } }),
    }) });
    const result = await call(app, query);
    assert.equal(app.counts().retrievals, 1);
    assert.equal(app.counts().providers, 0);
    assert.equal(result.source, 'serper');
    assert.equal(result.evidenceSource, 'serper-extracted');
    assert.equal(result.identityConfidence, 'high');
    assert.equal(result.introductionYear, null);
    assert.equal(result.sources.length, 2);
    assert.equal(result.resultType, 'retrieval-identity');
    assert.equal(app.counts().metered, 2);
    const log = app.logs.find((entry) => entry.event === 'smart_age_lookup');
    assert.equal(log.retrievalFirstAttempted, true);
    assert.equal(log.retrievalFirstSucceeded, true);
    assert.equal(log.retrievalFirstPrimaryQuality, 'STRONG');
    assert.equal(log.retrievalFirstSerperRequests, 1);
    assert.equal(log.retrievalFirstGeminiRequests, 1);
    assert.ok(log.retrievalFirstLatencyMs >= 0);
    assert.ok(app.redis.writes.length > 0);
  });
}

test('Gemini Maytag introduction estimate reaches the API and survives a cache read', async () => {
  const fixture = fixtures.mvwx655dw1;
  const redis = fakeRedis();
  const app = setup({ redis, lookup: (text) => retrievalFirstLookup(text, {
    searchImpl: async () => [
      row('Maytag MVWX655DW1 washer technical documentation', 'maytag.com',
        'Maytag MVWX655DW1 washer technical documentation'),
      ...fixture.rows,
    ],
    synthesisImpl: async () => ({ ok: true, result: { ...synthesis(fixture),
      estimatedIntroductionYear: 2016, introductionYearConfidence: 'medium',
      introductionYearReason: 'Known mid-2010s market position and retrieved exact-model documentation support a 2016 estimate.',
      introductionYearEvidence: { description: 'Maytag MVWX655DW1 exact-model documentation',
        sourceUrl: 'https://maytag.com/item' } }, requestCount: 1 }),
  }) });
  const result = await call(app, 'mvwx655dw1');
  assert.equal(result.estimatedIntroductionYear, 2016);
  assert.equal(result.exactModel, 'MVWX655DW1');
  assert.equal(result.introductionYearConfidence, 'medium');
  assert.match(result.introductionYearReason, /2016/);
  assert.match(result.introductionYearEvidence.description, /MVWX655DW1/);
  assert.equal(result.individualManufactureYear, null);
  const cached = await call(app, 'mvwx655dw1');
  assert.equal(cached.estimatedIntroductionYear, 2016);
  assert.equal(cached.introductionYearReason, result.introductionYearReason);
  assert.equal(cached.introductionYearEvidence.sourceUrl, result.introductionYearEvidence.sourceUrl);
});

test('retrieval error and timeout fail open to the existing provider', async () => {
  for (const failureReason of ['RETRIEVAL_ERROR', 'SERPER_TIMEOUT']) {
    const app = setup({ lookup: async () => ({ failureReason, serperRequestCount: 1 }) });
    await call(app, 'mvwx655dw1');
    assert.equal(app.counts().retrievals, 1);
    assert.equal(app.counts().providers, 1);
    const log = app.logs.find((entry) => entry.event === 'smart_age_lookup');
    assert.equal(log.retrievalFirstFailureReason, failureReason);
  }
});

test('retrieval uses its configured Serper timeout and skips when route budget is too small', async () => {
  let options;
  const app = setup({ lookup: async (_query, received) => { options = received; return { failureReason: 'NO_SEARCH_RESULTS' }; } });
  await call(app, 'mvwx655dw1');
  assert.equal(Object.hasOwn(options, 'searchTimeoutMs'), false);
  assert.equal(app.counts().providers, 1);

  const short = setup({ totalBudgetMs: 11000 });
  await call(short, 'mvwx655dw1');
  assert.equal(short.counts().retrievals, 0);
  assert.equal(short.counts().providers, 1);

  const configured = setup({ env: { SMART_LOOKUP_RETRIEVAL_SERPER_TIMEOUT_MS: '10000' } });
  await call(configured, 'mvwx655dw1');
  assert.equal(configured.counts().retrievals, 0);
  assert.equal(configured.counts().providers, 1);
});

test('serial-only, bare numeric and general guidance never attempt retrieval', async () => {
  for (const query of ['serial 0011579166', '0011579166', 'how old is a washer']) {
    const app = setup();
    await call(app, query);
    assert.equal(app.counts().retrievals, 0, query);
  }
});

test('local and cache hits never attempt retrieval', async () => {
  const local = setup({ localLookup: async () => ({ brand: 'Maytag', model: 'MVWX655DW1' }) });
  await call(local, 'mvwx655dw1');
  assert.equal(local.counts().retrievals, 0);
  const first = setup({ enabled: false });
  await call(first, 'mvwx655dw1');
  const cached = setup({ redis: fakeRedis(first.redis.writes[0]) });
  await call(cached, 'mvwx655dw1');
  assert.equal(cached.counts().retrievals, 0);
});

test('unsupported Ametek identifier becomes a safe uncached partial identity', async () => {
  const app = setup({ lookup: (query) => retrievalFirstLookup(query, {
    searchImpl: async (search) => search.includes('78570r') ? [] : [
      row('Ametek 46E vacuum motor', 'motor.example'), row('Ametek 46E motor parts', 'parts.example'),
    ],
    synthesisImpl: async () => ({ ok: true, requestCount: 1, result: {
      identified: true, brand: 'Ametek', model: '78570R', exactModel: '78570R', originalIdentifier: '78570R',
      identifierType: 'part-number', likelyProduct: 'Ametek 78570R motor', identityConfidence: 'high',
    } }),
  }) });
  const result = await call(app, 'Ametek 46e 78570r');
  assert.equal(result.resultType, 'retrieval-partial');
  assert.equal(result.model, null);
  assert.equal(result.exactModel, null);
  assert.equal(result.originalIdentifier.toUpperCase(), '78570R');
  assert.equal(result.identityConfidence, 'low');
  assert.equal(result.needsMoreDetail, true);
  assert.match(result.refinementSuggestion, /78570R.*could not be verified/i);
  assert.equal(app.redis.writes.length, 0);
  assert.equal(app.counts().providers, 0);
  assert.equal(app.counts().metered, 3);
});

test('two searches and one synthesis are the maximum retrieval spend', async () => {
  let searches = 0;
  let syntheses = 0;
  const report = await retrievalFirstLookup('Ametek 46e 78570r', {
    searchImpl: async () => { searches += 1; return []; },
    synthesisImpl: async () => { syntheses += 1; return { ok: false }; },
  });
  assert.equal(searches, 2);
  assert.equal(syntheses, 0);
  assert.equal(report.serperRequestCount, 2);
  assert.equal(report.geminiRequestCount, 0);
});
