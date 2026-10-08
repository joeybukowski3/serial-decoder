import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { evaluateReplacement } from '../../lib/replacement-core/evaluate.js';
import { refrigeratorProfile } from '../../lib/replacement-core/profiles/refrigerator.js';
import { compareRefrigeratorConfiguration, REFRIGERATOR_CONFIGURATION_POLICY_VERSION } from '../../lib/replacement-core/refrigerator-configuration.js';
import { normalizeRefrigeratorLayout } from '../../lib/replacement-core/refrigerator-configuration.js';
import { decidingRankKey, rankEvaluations } from '../../lib/replacement-discovery/candidate-ranker.js';
import { consumePageResponse, pdfVisibleText } from '../../lib/replacement-discovery/providers/guarded-page-fetch.js';
import { normalizeSearchResults, searchProducts } from '../../lib/replacement-discovery/providers/explicit-search.js';
import { interpretReplacementSearch } from '../../lib/replacement-discovery/interpret.js';
import {
  extractRefrigeratorFacts, bindRefrigeratorFacts, mergeRefrigeratorSources, planRefrigeratorQueries,
  refrigeratorCandidateIdentity, runRefrigeratorProof,
} from '../../lib/replacement-discovery/refrigerator-retrieval.js';

const originalUrl = 'https://www.lg.com/us/refrigerators/lg-lrfcs25d3s-french-3-door-refrigerator';
const fixture = fs.readFileSync(new URL('../fixtures/replacement-discovery/lg-lrfcs25d3s-page.html', import.meta.url), 'utf8');
const source = { id: 'source-1', model: 'LRFCS25D3S', brand: 'LG', domain: 'lg.com', title: 'LG LRFCS25D3S refrigerator', url: originalUrl };
const facts = () => bindRefrigeratorFacts(extractRefrigeratorFacts(fixture, source.model, { sourceUrl: source.url, brand: 'LG' }), source).facts;
const entry = (value, status = 'KNOWN') => ({ status, value, evidenceRefs: status === 'UNKNOWN' ? [] : ['fixture'] });
const makeEvaluation = (originalFacts = {}, candidateFacts = {}) => ({
  original: { contractVersion: '1.0.0', id: 'fridge-original', rawQuery: 'LG refrigerator', category: 'refrigerator', evidenceRefs: ['fixture'], facts: {
    brand: entry('LG'), totalCapacityCuFt: entry(25.2), installationType: entry('FREESTANDING'),
    configurationFloor: entry('FRENCH_DOOR'), layout: entry('FRENCH_DOOR'), tier: entry('STANDARD'), ...originalFacts,
  } },
  candidate: { contractVersion: '1.0.0', candidateId: 'fridge-candidate', source: { kind: 'TEST' }, relationship: 'SAME_BRAND_ALTERNATIVE',
    discoveryConfidence: 'MEDIUM', evidenceRefs: ['fixture'], providerRank: 99,
    identity: { contractVersion: '1.0.0', id: 'fridge-candidate-identity', rawQuery: null, category: 'refrigerator', evidenceRefs: ['fixture'], facts: {
      brand: entry('LG'), totalCapacityCuFt: entry(26), installationType: entry('FREESTANDING'),
      configurationFloor: entry('FRENCH_DOOR'), layout: entry('FRENCH_DOOR'), tier: entry('STANDARD'), ...candidateFacts,
    } },
  }, profile: refrigeratorProfile,
});
const row = (result, key) => result.decision.comparisons.find((item) => item.key === key);
const result = (title, url, rank = 1) => ({ title, url, domain: new URL(url).hostname.replace(/^www\./, ''), snippet: title, providerRank: rank });

test('bounded LG fixture validates exact identity and extracts normalized facts with provenance', () => {
  const raw = extractRefrigeratorFacts(fixture, 'LRFCS25D3S', { sourceUrl: originalUrl, brand: 'LG' });
  assert.deepEqual(raw.capacityCuFt, { value: 25.2, precisionCuFt: 0.1, capacityBasis: 'TOTAL_SPECIFICATION' });
  assert.deepEqual([raw.configuration, raw.installationType, raw.counterDepth, raw.dispenser, raw.iceMaker],
    ['FRENCH_DOOR', 'FREESTANDING', false, 'NONE', 'SINGLE']);
  assert.deepEqual([raw.widthIn, raw.heightIn, raw.depthIn], [32.875, 69.875, 35.5]);
  assert.deepEqual([raw.clearanceWidthIn, raw.clearanceHeightIn, raw.clearanceDepthIn], [0.125, 1, 2]);
  assert.deepEqual([raw.refrigeratorCapacityCuFt, raw.freezerCapacityCuFt], [16.9, 8.3]);
  assert.equal(raw.smart, false);
  assert.equal(raw.tier, undefined);
  assert.equal(raw.modelYear, undefined);
  assert.equal(raw.family, undefined);
  assert.equal(raw.layout, 'FRENCH_DOOR_3_DOOR');
  assert.equal(facts().capacityCuFt.status, 'KNOWN');
  assert.equal(facts().capacityCuFt.precisionCuFt, 0.1);
  assert.ok(facts().capacityCuFt.evidenceRefs.length);
  assert.deepEqual(extractRefrigeratorFacts(fixture, 'LRFCS2603S', { sourceUrl: originalUrl, brand: 'LG' }), {});
});

test('product page and exact-model manufacturer sheet merge with field-level provenance and precision', () => {
  const page = '<title>LG LRFCS25D3S 25 cu. ft. French 3-door refrigerator</title><h1>LRFCS25D3S French 3-door refrigerator</h1>';
  const specUrl = 'https://media.us.lg.com/spec/LRFCS25D3S-builder-spec.pdf';
  const spec = `LG LRFCS25D3S French 3-door refrigerator\nTotal Capacity 25.2 cu. ft.\nInstallation Type Freestanding\nDepth Type Standard Depth\nIce & Water Dispenser No\nIce Maker Single\nWidth 32 7/8 in\nHeight 69 7/8 in\nDepth 35 1/2 in\nLG LF25G8330S French 4-door refrigerator\nIce & Water Dispenser Yes`;
  const pageBound = bindRefrigeratorFacts(extractRefrigeratorFacts(page, source.model, { sourceUrl: source.url }), source);
  const specSource = { ...source, id: 'source-2', url: specUrl };
  const specBound = bindRefrigeratorFacts(extractRefrigeratorFacts(spec, source.model, { sourceUrl: specUrl }), specSource);
  const merged = mergeRefrigeratorSources([pageBound, specBound]);
  assert.equal(pageBound.facts.capacityCuFt.value, 25);
  assert.equal(pageBound.facts.capacityCuFt.precisionCuFt, 1);
  assert.equal(pageBound.facts.capacityCuFt.capacityBasis, 'NOMINAL_MARKETING');
  assert.equal(merged.facts.capacityCuFt.value, 25.2);
  assert.equal(merged.facts.capacityCuFt.precisionCuFt, 0.1);
  assert.equal(merged.facts.capacityCuFt.capacityBasis, 'TOTAL_SPECIFICATION');
  assert.deepEqual(merged.facts.capacityCuFt.sourceIds, ['source-2']);
  assert.equal(merged.facts.dispenser.value, 'NONE');
  assert.deepEqual([merged.facts.widthIn.value, merged.facts.heightIn.value, merged.facts.depthIn.value], [32.875, 69.875, 35.5]);
  assert.equal(merged.facts.layout.value, 'FRENCH_DOOR_3_DOOR');
  assert.ok(merged.evidence.every((item) => item.claim.subjectModel === 'LRFCS25D3S'));
  assert.deepEqual(extractRefrigeratorFacts(spec, 'LF25G8330S', { sourceUrl: specUrl }), {});
});

test('PDF text streams are bounded to visible text operators', () => {
  const pdf = Buffer.from('%PDF-1.4\n<< /Length 60 >>\nstream\nBT (LG LRFCS25D3S refrigerator) Tj (Total Capacity 25.2 cu. ft.) Tj ET\nendstream');
  assert.match(pdfVisibleText(pdf), /Total Capacity 25\.2/);
  assert.equal(pdfVisibleText(Buffer.from('not a PDF')), '');
});

test('shared extractor distinguishes layouts, installation, depth, dispenser, and ice across exact models', () => {
  const cases = [
    ['LF25G8330S', 'French 4-door', 'Freestanding', 'Counter Depth', 'Ice & Water Dispenser Yes', 'Dual Ice Maker Yes', 'FRENCH_DOOR_4_DOOR', true, 'WATER_AND_ICE', 'DUAL'],
    ['LF25H6200S', 'French 3-door', 'Freestanding built-in look', 'Standard Depth', 'Water Dispenser Yes', 'Ice Maker Single', 'FRENCH_DOOR_3_DOOR', false, 'WATER', 'SINGLE'],
  ];
  for (const [model, layout, installation, depth, dispenser, ice, expectedLayout, expectedDepth, expectedDispenser, expectedIce] of cases) {
    const url = `https://www.lg.com/us/refrigerators/lg-${model.toLowerCase()}-refrigerator`;
    const html = `<title>LG ${model} ${layout} refrigerator</title><h1>${model} refrigerator</h1><p>Total Capacity 25.0 cu. ft.</p><p>Installation Type ${installation}</p><p>Depth Type ${depth}</p><p>${dispenser}</p><p>${ice}</p><p>Width 33 in</p><p>Height 70 in</p><p>Depth 35 in</p>`;
    const raw = extractRefrigeratorFacts(html, model, { sourceUrl: url });
    assert.equal(raw.configurationFloor, 'FRENCH_DOOR');
    assert.equal(raw.layout, expectedLayout);
    assert.equal(raw.installationType, 'FREESTANDING');
    assert.equal(raw.counterDepth, expectedDepth);
    assert.equal(raw.dispenser, expectedDispenser);
    assert.equal(raw.iceMaker, expectedIce);
    assert.deepEqual([raw.widthIn, raw.heightIn, raw.depthIn], [33, 70, 35]);
    assert.deepEqual(raw.capacityCuFt, { value: 25, precisionCuFt: 0.1, capacityBasis: 'TOTAL_SPECIFICATION' });
    assert.equal(raw.tier, undefined);
  }
  assert.notEqual(normalizeRefrigeratorLayout('FRENCH_DOOR_3_DOOR'), normalizeRefrigeratorLayout('FRENCH_DOOR_4_DOOR'));
  const evaluated = evaluateReplacement(makeEvaluation({ layout: entry('FRENCH_DOOR_3_DOOR') },
    { layout: entry('FRENCH_DOOR_4_DOOR') }));
  assert.equal(row(evaluated, 'configurationFloor').assessment, 'MATCH');
  assert.equal(row(evaluated, 'layout').assessment, 'DIFFERENT');
});

test('installation and ice absence require explicit exact-model wording', () => {
  const model = 'LF25H6330S';
  const url = `https://www.lg.com/us/refrigerators/lg-${model.toLowerCase()}-refrigerator`;
  const page = (installation, ice = 'No') => `<title>LG ${model} French 3-door refrigerator</title><h1>${model} refrigerator</h1><p>Installation Type ${installation}</p><p>Ice Maker ${ice}</p>`;
  assert.equal(extractRefrigeratorFacts(page('Built-In'), model, { sourceUrl: url }).installationType, 'BUILT_IN');
  assert.equal(extractRefrigeratorFacts(page('Integrated'), model, { sourceUrl: url }).installationType, 'INTEGRATED');
  assert.equal(extractRefrigeratorFacts(page('Column'), model, { sourceUrl: url }).installationType, 'COLUMN');
  assert.equal(extractRefrigeratorFacts(page('Built-in look'), model, { sourceUrl: url }).installationType, undefined);
  assert.equal(extractRefrigeratorFacts(page('Freestanding'), model, { sourceUrl: url }).iceMaker, 'NONE');
});

test('meaningful layout difference ranks before candidateId, provider rank, and price', () => {
  const make = (candidateId, layout, providerRank, price) => {
    const input = makeEvaluation({ layout: entry('FRENCH_DOOR_3_DOOR'), tier: entry('STANDARD', 'ASSUMED') },
      { layout: entry(layout), tier: entry('STANDARD', 'ASSUMED'), price: entry(price) });
    input.candidate.candidateId = candidateId;
    input.candidate.providerRank = providerRank;
    return evaluateReplacement(input);
  };
  const close = make('z-last', 'FRENCH_DOOR_3_DOOR', 99, 9000);
  const changed = make('a-first', 'FRENCH_DOOR_4_DOOR', 1, 1);
  assert.equal(rankEvaluations([changed, close])[0].candidate.candidateId, 'z-last');
  assert.doesNotMatch(decidingRankKey(close, changed), /candidateId/);
  assert.equal(rankEvaluations([make('z-last', 'FRENCH_DOOR_3_DOOR', 1, 1),
    make('a-first', 'FRENCH_DOOR_4_DOOR', 99, 9000)])[0].candidate.candidateId, 'z-last');
  assert.equal(close.decision.comparisons.find((item) => item.key === 'tier').assessment, 'ASSUMED');
});

test('generic category and unrelated pages cannot provide exact product facts', () => {
  const genericUrl = 'https://www.lg.com/us/refrigerators';
  assert.deepEqual(extractRefrigeratorFacts(fixture, 'LRFCS25D3S', { sourceUrl: genericUrl, brand: 'LG' }), {});
  const unrelated = '<title>LG French Door Refrigerators</title><h1>French Door Refrigerators</h1><p>LRFCS25D3S 25.2 cu ft</p>';
  assert.deepEqual(extractRefrigeratorFacts(unrelated, 'LRFCS25D3S', { sourceUrl: originalUrl, brand: 'LG' }), {});
  assert.equal(refrigeratorCandidateIdentity(result('LG refrigerators', 'https://www.lg.com/us/refrigerators')).identity, null);
});

test('capacity strings retain stated precision and configuration stays separate from installation', () => {
  for (const [text, expected, precision] of [['25.5 cu. ft.', 25.5, 0.1], ['27 cu ft', 27, 1], ['26.8 cubic feet', 26.8, 0.1]]) {
    const interpreted = interpretReplacementSearch({ query: `LG ${text} French door refrigerator` });
    assert.equal(interpreted.normalizedOriginal.facts.capacityCuFt.value, expected);
    assert.equal(interpreted.normalizedOriginal.facts.capacityCuFt.precisionCuFt, precision);
    assert.equal(interpreted.normalizedOriginal.facts.installationType, undefined);
  }
  const counter = interpretReplacementSearch({ query: 'LG counter-depth French door refrigerator' });
  assert.equal(counter.normalizedOriginal.facts.installationType, undefined);
  assert.equal(counter.normalizedOriginal.facts.counterDepth.value, true);
});

test('versioned broad configuration floor allows compatible layouts and rejects downgrades', () => {
  assert.equal(REFRIGERATOR_CONFIGURATION_POLICY_VERSION, '1.1.0');
  assert.equal(compareRefrigeratorConfiguration('FRENCH_DOOR', 'FOUR_DOOR').assessment, 'BETTER');
  assert.equal(compareRefrigeratorConfiguration('FRENCH_DOOR', 'TOP_FREEZER').assessment, 'FAIL');
  assert.equal(compareRefrigeratorConfiguration('SIDE_BY_SIDE', 'TOP_FREEZER').assessment, 'FAIL');
  assert.equal(compareRefrigeratorConfiguration('COLUMN', 'FREESTANDING').assessment, 'UNVERIFIED');
  assert.equal(compareRefrigeratorConfiguration('COLUMN', 'FRENCH_DOOR').assessment, 'FAIL');
});

test('HARD capacity, installation, tier, configuration, and required fit are deterministic', () => {
  const capacity = evaluateReplacement(makeEvaluation({}, { totalCapacityCuFt: entry(24.5) }));
  assert.equal(capacity.classification, 'NOT_LKQ');
  assert.equal(row(capacity, 'totalCapacityCuFt').assessment, 'FAIL');
  assert.equal(row(evaluateReplacement(makeEvaluation({}, { totalCapacityCuFt: entry(25.1) })), 'totalCapacityCuFt').assessment, 'MATCH');
  assert.equal(row(evaluateReplacement(makeEvaluation({ totalCapacityCuFt: { ...entry(25.2), precisionCuFt: 0.1 } },
    { totalCapacityCuFt: { ...entry(25.3), precisionCuFt: 0.1 } })), 'totalCapacityCuFt').assessment, 'BETTER');
  assert.equal(row(evaluateReplacement(makeEvaluation({}, { installationType: entry('BUILT_IN') })), 'installationType').assessment, 'FAIL');
  assert.equal(row(evaluateReplacement(makeEvaluation({}, { tier: entry('VALUE') })), 'tier').assessment, 'FAIL');
  assert.equal(row(evaluateReplacement(makeEvaluation({}, { configurationFloor: entry('TOP_FREEZER') })), 'configurationFloor').assessment, 'FAIL');
  const opening = { openingWidthIn: entry(33), openingHeightIn: entry(70), openingDepthIn: entry(37) };
  const dimensions = { widthIn: entry(34), heightIn: entry(69), depthIn: entry(35) };
  assert.equal(evaluateReplacement(makeEvaluation(opening, dimensions)).classification, 'NOT_LKQ');
  assert.equal(evaluateReplacement(makeEvaluation(opening, {})).classification, 'UNCONFIRMED');
  assert.equal(evaluateReplacement(makeEvaluation(opening, { widthIn: entry(32), heightIn: entry(69), depthIn: entry(35) })).fitAssessment.status, 'VERIFIED');
});

test('counter depth is strong by default and hard only when explicitly required', () => {
  const base = makeEvaluation({ counterDepth: entry(true) }, { counterDepth: entry(false) });
  const advisory = evaluateReplacement(base);
  assert.equal(row(advisory, 'counterDepth').assessment, 'DIFFERENT');
  assert.equal(advisory.decision.hardFailures.some((failure) => failure.key === 'counterDepthRequired'), false);
  base.original.facts.counterDepthRequired = entry(true);
  assert.equal(evaluateReplacement(base).classification, 'NOT_LKQ');
  assert.equal(row(evaluateReplacement(base), 'counterDepthRequired').assessment, 'FAIL');
  base.candidate.identity.facts.counterDepth = entry(null, 'UNKNOWN');
  assert.equal(evaluateReplacement(base).classification, 'UNCONFIRMED');
});

test('dispenser, ice, finish and configuration affect STRONG; secondary and price do not become HARD', () => {
  const base = makeEvaluation({ dispenser: entry('NONE'), iceMaker: entry('SINGLE'), finish: entry('STAINLESS') },
    { dispenser: entry('WATER_AND_ICE'), iceMaker: entry('DUAL'), finish: entry('BLACK'), layout: entry('FOUR_DOOR'), price: entry(1) });
  const evaluated = evaluateReplacement(base);
  for (const key of ['dispenser', 'iceMaker', 'finish', 'layout']) assert.equal(row(evaluated, key).assessment, 'DIFFERENT');
  assert.equal(row(evaluated, 'price'), undefined);
  assert.equal(evaluated.decision.hardFailures.length, 0);
});

test('candidate planner uses verified original facts without selecting a replacement model', () => {
  const queries = planRefrigeratorQueries(facts());
  assert.deepEqual(queries.map((item) => item.intent), ['SAME_BRAND_CONFIGURATION_CLOSE_CAPACITY',
    'SAME_BRAND_CONFIGURATION_CAPACITY_FLOOR', 'SAME_BRAND_COMPATIBLE_LAYOUT', 'BROADER_FALLBACK']);
  assert.equal(queries.length, 4);
  assert.ok(queries.every((item) => !/LRFCS2603S/.test(item.query)));
  assert.deepEqual(planRefrigeratorQueries({ ...facts(), configuration: { status: 'ASSUMED', value: 'FRENCH_DOOR' }, configurationFloor: { status: 'ASSUMED', value: 'FRENCH_DOOR' } }), []);
});

test('offline end-to-end search discovers identities; provider rank and price do not pick primary', async () => {
  const lowModel = 'LRFCS2403S', highModel = 'LRFCS2603S';
  const lowUrl = `https://www.lg.com/us/refrigerators/lg-${lowModel.toLowerCase()}-french-3-door-refrigerator`;
  const highUrl = `https://www.lg.com/us/refrigerators/lg-${highModel.toLowerCase()}-french-3-door-refrigerator`;
  const pages = new Map([[originalUrl, fixture], [lowUrl, fixture.replaceAll('LRFCS25D3S', lowModel).replaceAll('25.2', '24.2')],
    [highUrl, fixture.replaceAll('LRFCS25D3S', highModel).replaceAll('25.2', '26.2')]]);
  const replay = await runRefrigeratorProof({
    search: async ({ purpose }) => purpose === 'original'
      ? [result('LG LRFCS25D3S refrigerator specifications', originalUrl)]
      : [result(`LG ${lowModel} French door 24.2 cu ft refrigerator $1`, lowUrl, 1),
        result(`LG ${highModel} French door 26.2 cu ft refrigerator $9999`, highUrl, 9)],
    fetchPage: async (url) => ({ status: 200, text: pages.get(url), contentType: 'text/html' }),
  });
  assert.equal(replay.candidateSearches.length, 4);
  assert.equal(replay.internalCandidatePool.length, 2);
  assert.equal(replay.candidateDiscovery.length, 2);
  assert.equal(replay.recommendation.primary.candidate.identity.facts.model.value, highModel);
  assert.equal(replay.recommendation.primary.classification, 'UNCONFIRMED');
  assert.equal(replay.recommendation.primary.decision.comparisons.find((item) => item.key === 'tier').assessment, 'ASSUMED');
  assert.equal(replay.retrievalQuality, 'RETRIEVED_STRONG');
  assert.ok(replay.searchAttemptCount <= 6);
  assert.ok(replay.selectedSources.filter((item) => item.role === 'candidate').length <= 6);
});

test('bounded proof fetches product page and manufacturer sheet for one exact model', async () => {
  const specUrl = 'https://media.us.lg.com/spec/LRFCS25D3S-builder-spec.pdf';
  const candidateModel = 'LF25H6200S';
  const candidateUrl = `https://www.lg.com/us/refrigerators/lg-${candidateModel.toLowerCase()}-french-3-door-refrigerator`;
  const pages = new Map([
    [originalUrl, '<title>LG LRFCS25D3S 25 cu. ft. French 3-door refrigerator</title><h1>LRFCS25D3S refrigerator</h1>'],
    [specUrl, 'LG LRFCS25D3S French 3-door refrigerator\nTotal Capacity 25.2 cu. ft.\nInstallation Type Freestanding\nDepth Type Standard Depth\nIce & Water Dispenser No\nIce Maker Single\nWidth 32 7/8 in\nHeight 69 7/8 in\nDepth 35 1/2 in'],
    [candidateUrl, fixture.replaceAll('LRFCS25D3S', candidateModel)],
  ]);
  const replay = await runRefrigeratorProof({
    search: async ({ purpose }) => purpose === 'original'
      ? [result('LG LRFCS25D3S refrigerator', originalUrl), result('LG LRFCS25D3S builder spec sheet', specUrl)]
      : purpose === 'candidate' ? [result(`LG ${candidateModel} refrigerator`, candidateUrl)] : [],
    fetchPage: async (url) => ({ status: 200, text: pages.get(url) || '', contentType: url.endsWith('.pdf') ? 'application/pdf' : 'text/html' }),
  });
  assert.equal(replay.selectedSources.filter((item) => item.role === 'original').length, 2);
  assert.equal(replay.original.facts.totalCapacityCuFt.value, 25.2);
  assert.equal(replay.original.facts.totalCapacityCuFt.precisionCuFt, 0.1);
  assert.equal(replay.original.facts.dispenser.value, 'NONE');
  assert.equal(replay.original.facts.widthIn.value, 32.875);
  assert.equal(replay.candidateDiscovery[0].facts.layout.value, 'FRENCH_DOOR_3_DOOR');
  assert.equal(replay.original.facts.tier.status, 'ASSUMED');
  assert.equal(replay.recommendation.primary.classification, 'UNCONFIRMED');
});

test('four captured LG product pages replay offline with exact layouts and source-bound facts', async () => {
  const urls = {
    LRFCS25D3S: originalUrl,
    LF25G8330S: 'https://www.lg.com/us/refrigerators/lg-lf25g8330s-french-4-door-refrigerator',
    LF25H6200S: 'https://www.lg.com/us/refrigerators/lg-lf25h6200s-french-3-door-refrigerator',
    LF25Z6211S: 'https://www.lg.com/us/refrigerators/lg-lf25z6211s-french-3-door-refrigerator',
    LF25H6330S: 'https://www.lg.com/ca_en/refrigerators/french-door/lf25h6330s/',
  };
  const pages = new Map(Object.entries(urls).map(([model, url]) => [url,
    fs.readFileSync(new URL(`../fixtures/replacement-discovery/lg-${model.toLowerCase()}-page.html`, import.meta.url), 'utf8')]));
  const expected = {
    LF25G8330S: [24.5, true, 'WATER_AND_ICE', 'DUAL', 35.75, 70.25, 32.25],
    LF25H6200S: [25.1, false, undefined, 'SINGLE', 32.937, 69.937, 35.937],
    LF25Z6211S: [25.1, true, 'WATER', 'SINGLE', 35.75, 70.25, undefined],
    LF25H6330S: [24.5, false, 'WATER_AND_ICE', 'DUAL', 32.9375, 69.9375, 35.9375],
  };
  for (const [model, url] of Object.entries(urls).slice(1)) {
    const raw = extractRefrigeratorFacts(pages.get(url), model, { sourceUrl: url });
    assert.equal(raw.model, model);
    assert.equal(raw.configurationFloor, 'FRENCH_DOOR');
    assert.equal(raw.layout, model === 'LF25G8330S' ? 'FRENCH_DOOR_4_DOOR' : 'FRENCH_DOOR_3_DOOR');
    assert.deepEqual([raw.totalCapacityCuFt?.value, raw.counterDepth, raw.dispenser, raw.iceMaker,
      raw.widthIn, raw.heightIn, raw.depthIn], expected[model]);
    assert.equal(raw.clearanceDepthIn, 2);
    assert.equal(raw.installationType, undefined);
    assert.equal(raw.tier, undefined);
    assert.deepEqual(extractRefrigeratorFacts(pages.get(url), 'LRFCS25D3S', { sourceUrl: url }), {});
  }
  const searchResult = (model) => result(`LG ${model} refrigerator`, urls[model]);
  const replay = await runRefrigeratorProof({
    search: async ({ purpose }) => purpose === 'original' ? [searchResult('LRFCS25D3S')]
      : purpose === 'candidate' ? Object.keys(urls).slice(1).map(searchResult) : [],
    fetchPage: async (url) => ({ status: 200, text: pages.get(url) || '', contentType: 'text/html' }),
  });
  assert.equal(replay.retrievalQuality, 'RETRIEVED_STRONG');
  assert.equal(replay.candidateDiscovery.length, 4);
  assert.ok(replay.candidateDiscovery.every((item) => item.facts.totalCapacityCuFt.capacityBasis === 'TOTAL_SPECIFICATION'));
  assert.equal(replay.recommendation.primary.candidate.identity.facts.model.value, 'LF25Z6211S');
  assert.deepEqual([row(replay.recommendation.primary, 'totalCapacityCuFt').assessment,
    row(replay.recommendation.primary, 'totalCapacityCuFt').reasonCode],
  ['MATCH', 'CAPACITY_WITHIN_REFRIGERATOR_TOLERANCE']);
  assert.equal(replay.recommendation.rejectedSummary.filter((item) => item.reasonCode === 'KNOWN_HARD_FAILURE').length, 2);
  assert.deepEqual(replay.recommendation.rankingExplanation.map((item) => item.decidedBy),
    ['similarity score', 'hard-rule failures', 'hard-rule failures']);
  assert.equal(replay.candidateDiscovery.find((item) => item.model === 'LF25G8330S').facts.layout.value, 'FRENCH_DOOR_4_DOOR');
  assert.deepEqual(replay.candidateDiscovery.map((item) => item.facts.totalCapacityCuFt.value), [24.5, 25.1, 24.5, 25.1]);
  assert.ok(replay.candidateDiscovery.every((item) => !item.facts.installationType));
});

test('HTTP-200 LG source survives guarded normalization, exact binding, and a second source merge', async () => {
  const response = Object.assign(Readable.from([Buffer.from(fixture)]), { headers: { 'content-type': 'text/html' } });
  const fetched = await consumePageResponse(response);
  const [normalized] = normalizeSearchResults([{ title: source.title, link: originalUrl, snippet: 'LG LRFCS25D3S refrigerator' }]);
  assert.equal(fetched.usableText, true);
  assert.equal(fetched.truncated, false);
  assert.equal(normalized.domain, 'lg.com');
  const product = bindRefrigeratorFacts(extractRefrigeratorFacts(fetched.text, source.model, { sourceUrl: normalized.url }), source);
  const support = bindRefrigeratorFacts(extractRefrigeratorFacts(fixture, source.model,
    { sourceUrl: 'https://www.lg.com/us/support/product/lg-LRFCS25D3S' }), { ...source, id: 'source-2', role: 'original' });
  const merged = mergeRefrigeratorSources([product, support]);
  assert.equal(merged.facts.capacityCuFt.value, 25.2);
  assert.equal(merged.facts.layout.value, 'FRENCH_DOOR_3_DOOR');
  assert.deepEqual(merged.facts.capacityCuFt.sourceIds, ['source-1', 'source-2']);
  assert.equal(planRefrigeratorQueries(merged.facts).length, 4);
});

test('supplemental original search uses a valid provider purpose and four valid candidate requests', async () => {
  const candidateModel = 'LF25H6200S';
  const candidateUrl = `https://www.lg.com/us/refrigerators/lg-${candidateModel.toLowerCase()}-french-3-door-refrigerator`;
  const supportUrl = 'https://www.lg.com/us/support/product/lg-LRFCS25D3S';
  const calls = [];
  const replay = await runRefrigeratorProof({
    search: async (request) => {
      calls.push(request);
      const organic = request.query.includes('builder spec sheet') ? [{ title: 'LG LRFCS25D3S refrigerator', link: supportUrl }]
        : request.purpose === 'original' ? [{ title: source.title, link: originalUrl }]
          : [{ title: `LG ${candidateModel} refrigerator`, link: candidateUrl }];
      return searchProducts(request, { apiKey: 'offline-test', fetchImpl: async () => new Response(JSON.stringify({ organic }), { status: 200 }) });
    },
    fetchPage: async (url) => ({ status: 200, text: url === originalUrl
      ? '<title>LG LRFCS25D3S French 3-door refrigerator</title><h1>LRFCS25D3S refrigerator</h1>'
      : url === supportUrl ? fixture : fixture.replaceAll('LRFCS25D3S', candidateModel) }),
  });
  assert.ok(calls.some((item) => item.query.includes('builder spec sheet') && item.purpose === 'original'));
  assert.ok(calls.every((item) => typeof item.query === 'string' && item.query.trim() && ['original', 'candidate'].includes(item.purpose)));
  assert.deepEqual(replay.candidateSearches.map((item) => item.intent), planRefrigeratorQueries(replay.original.facts).map((item) => item.intent));
  assert.equal(replay.candidateSearches.length, 4);
  assert.equal(replay.original.facts.capacityCuFt.value, 25.2);
  assert.equal(replay.reasonCodes.includes('WEB_RETRIEVAL_UNAVAILABLE'), false);
  assert.equal(replay.error, undefined);
});

test('usable exact-model URLs with unbound page shells report extraction failure, not retrieval unavailability', async () => {
  const supportUrl = 'https://www.lg.com/us/support/product/lg-LRFCS25D3S';
  const replay = await runRefrigeratorProof({
    search: async ({ purpose }) => purpose === 'original' ? [result(source.title, originalUrl), result(source.title, supportUrl)] : [],
    fetchPage: async () => ({ status: 200, text: '<html><title>LG Appliances</title><body>JavaScript required</body></html>' }),
  });
  assert.equal(replay.selectedSources.length, 2);
  assert.ok(replay.fetchResults.every((item) => item.usableText && item.extractedFields.length === 0));
  assert.deepEqual(replay.reasonCodes, ['SOURCE_EXTRACTION_FAILED', 'ORIGINAL_RESEARCH_INSUFFICIENT', 'BASELINE_FALLBACK_USED']);
  assert.equal(replay.searchAttemptCount, 2);
  assert.equal(replay.original.view.researchSupported.length, 0);
});

test('invalid search request is the provider purpose guard, before any network call', async () => {
  let requests = 0;
  await assert.rejects(searchProducts({ query: 'LG refrigerator', purpose: 'original-spec' },
    { apiKey: 'offline-test', fetchImpl: async () => { requests += 1; } }), { message: 'invalid search request' });
  assert.equal(requests, 0);
});
