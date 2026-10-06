import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { recommendByRetrieval, validateRetrievalRequest, SUPPORT_MATRIX, MAX_DEADLINE_MS } from '../../lib/replacement-discovery/live-retrieval.js';
import { runRetrievalProof } from '../../lib/replacement-discovery/retrieval-first.js';
import { runRefrigeratorProof, MAX_REFRIGERATOR_SEARCHES } from '../../lib/replacement-discovery/refrigerator-retrieval.js';
import { interpretReplacementSearch } from '../../lib/replacement-discovery/interpret.js';
import { fetchSource } from '../../lib/replacement-discovery/providers/guarded-page-fetch.js';

const fixture = (name) => fs.readFileSync(new URL(`../fixtures/replacement-discovery/${name}`, import.meta.url), 'utf8');
const result = (title, url, rank = 1) => ({ title, url, domain: new URL(url).hostname.replace(/^www\./, ''), snippet: title, providerRank: rank, sourceProvider: 'serper' });

const q7fPage = fixture('samsung-q7f-page.html');
const q80cPage = fixture('samsung-q80c-page.html');
const q7fUrl = 'https://www.samsung.com/us/tvs/qled-tv/55-class-qled-tv-q7f-sku-qn55q7faafxza/';
const q80cUrl = 'https://www.samsung.com/us/televisions-home-theater/tvs/qled-4k-tvs/q80c-55-inch-qled-4k-smart-tv-qn55q80cafxza/';
const q80dUrl = 'https://www.samsung.com/us/tvs/qled-tv/q80d-55-inch-qled-4k-smart-tv-qn55q80dafxza/';
const q80fUrl = 'https://www.samsung.com/us/tvs/qled-tv/q80f-55-inch-qled-4k-smart-tv-qn55q80fafxza/';
const qn85fUrl = 'https://www.samsung.com/us/tvs/neo-qled-tv/qn85f-55-inch-neo-qled-4k-smart-tv-qn55qn85fafxza/';
const syntheticTvPage = (model) => `<html><title>Samsung ${model} 55-inch QLED 4K Smart TV</title><h1>${model}</h1><p>Screen size: 55 inch class</p><p>Actual diagonal: 54.6 inches</p><p>Resolution: 3840 x 2160 4K</p><p>Display QLED</p><p>Native refresh rate: 120 Hz</p><p>Smart TV</p><p>HDR10</p></html>`;

const lg = (model, slug) => `https://www.lg.com/us/refrigerators/lg-${model.toLowerCase()}-${slug}`;
const lfH6200Url = lg('LF25H6200S', 'french-3-door-refrigerator');
const lfG8330Url = lg('LF25G8330S', 'french-4-door-refrigerator');
const lfZ6211Url = lg('LF25Z6211S', 'french-3-door-refrigerator');
const fridgePages = { [lfH6200Url]: fixture('lg-lf25h6200s-page.html'), [lfG8330Url]: fixture('lg-lf25g8330s-page.html'), [lfZ6211Url]: fixture('lg-lf25z6211s-page.html') };

const fakeClock = () => { let now = 0; return { now: () => now, advance: (ms) => { now += ms; } }; };
const noProvider = () => ({
  search: async () => assert.fail('search must not be called'),
  fetchPage: async () => assert.fail('fetch must not be called'),
});

/** Counting, fixture-backed provider doubles. Nothing here can reach the network. */
function tvProviders({ original = [result('Samsung QN55Q7FAAFXZA 55-inch QLED TV', q7fUrl)], candidates = [result('Samsung QN55Q80CAPXPA 55-inch QLED 4K TV', q80cUrl)],
  pages = { [q7fUrl]: q7fPage, [q80cUrl]: q80cPage }, tick = () => {} } = {}) {
  const calls = { search: [], fetch: [] };
  return {
    calls,
    deps: {
      search: async (request, options) => { calls.search.push({ ...request, options }); tick('search'); return request.purpose === 'original' ? original : candidates; },
      fetchPage: async (url, options) => { calls.fetch.push({ url, options }); tick('fetch'); return { status: 200, elapsedMs: 3, contentType: 'text/html', text: pages[url] ?? '' }; },
    },
  };
}

function fridgeProviders({ candidates = [result('LG LF25G8330S French 4-door refrigerator', lfG8330Url), result('LG LF25Z6211S French 3-door refrigerator', lfZ6211Url)],
  pages = fridgePages } = {}) {
  const calls = { search: [], fetch: [] };
  return {
    calls,
    deps: {
      search: async (request) => {
        calls.search.push(request);
        if (request.purpose === 'original') return [result('LG LF25H6200S refrigerator', lfH6200Url)];
        return /builder spec sheet/.test(request.query) ? [] : candidates;
      },
      fetchPage: async (url) => { calls.fetch.push(url); return { status: 200, elapsedMs: 3, contentType: 'text/html', text: pages[url] ?? '' }; },
    },
  };
}

const deepKeys = (value, keys = new Set()) => {
  if (Array.isArray(value)) value.forEach((item) => deepKeys(item, keys));
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) { keys.add(key); deepKeys(item, keys); }
  return keys;
};

test('1: a second supported Samsung TV (Q7F) flows through the facade, not just QN55Q80C', async () => {
  const { deps, calls } = tvProviders();
  const outcome = await recommendByRetrieval({ category: 'television', brand: 'Samsung', model: 'QN55Q7F', deps });

  assert.notEqual(outcome.status, 'UNSUPPORTED');
  assert.equal(outcome.report.original.facts.model.value, 'QN55Q7F');
  assert.equal(outcome.report.original.facts.screenSizeIn.value, 55);
  assert.ok(outcome.report.original.facts.screenSizeIn.evidenceRefs.some((ref) => ref !== 'user-input'), 'size is source-backed');
  assert.ok(calls.search[0].query.includes('QN55Q7F'), 'original search derives from the validated model');
  assert.equal(calls.search[0].query.includes('Q80C'), false);
  assert.deepEqual(outcome.report.candidateDiscovery.map((item) => item.model), ['QN55Q80C']);
  assert.equal(outcome.report.recommendation.primary.candidate.identity.facts.model.value, 'QN55Q80C');
  assert.equal(outcome.input.model, 'QN55Q7F');
});

test('1b: a full regional SKU is accepted and researched as its base model', async () => {
  const { deps, calls } = tvProviders();
  const outcome = await recommendByRetrieval({ category: 'tv', brand: 'samsung', model: 'qn55q7faafxza', deps });
  assert.equal(outcome.input.model, 'QN55Q7F');
  assert.equal(outcome.input.brand, 'Samsung');
  assert.equal(outcome.input.category, 'television');
  assert.ok(calls.search[0].query.includes('QN55Q7F') && !calls.search[0].query.includes('AAFXZA'));
});

test('2: a second supported LG refrigerator (LF25H6200S) flows through the facade, not just LRFCS25D3S', async () => {
  const { deps, calls } = fridgeProviders();
  const outcome = await recommendByRetrieval({ category: 'refrigerator', brand: 'LG', model: 'LF25H6200S', deps });

  assert.notEqual(outcome.status, 'UNSUPPORTED');
  assert.equal(outcome.report.original.facts.model.value, 'LF25H6200S');
  assert.equal(outcome.report.original.facts.capacityCuFt.status, 'KNOWN');
  assert.ok(calls.search[0].query.includes('LF25H6200S') && calls.search[0].query.includes('site:lg.com'));
  assert.ok(calls.search.every((request) => !request.query.includes('LRFCS25D3S')), 'no search is tied to the proof model');
  assert.deepEqual(calls.fetch[0], lfH6200Url);
  const models = outcome.report.candidateDiscovery.map((item) => item.model).sort();
  assert.deepEqual(models, ['LF25G8330S', 'LF25Z6211S']);
  assert.ok(outcome.report.recommendation.primary);
  assert.equal(outcome.report.recommendation.internalPoolCount, 2);
});

test('3: legacy proof wrappers still enforce FIXED_TEST_ITEM_ONLY and never reach a provider', async () => {
  const { search, fetchPage } = noProvider();
  await assert.rejects(runRetrievalProof({ query: 'Samsung QN55Q7F', search, fetchPage }), { message: 'FIXED_TEST_ITEM_ONLY' });
  await assert.rejects(runRefrigeratorProof({ query: 'LG LF25H6200S refrigerator', search, fetchPage }), { message: 'FIXED_TEST_ITEM_ONLY' });
});

test('3b: legacy wrappers still run their fixed item with the unchanged single-argument provider calls', async () => {
  const seen = [];
  const report = await runRetrievalProof({
    search: async (...args) => { seen.push(args.length); return []; },
    fetchPage: async () => assert.fail('no fetch without results'),
  });
  assert.ok(seen.length >= 1 && seen.every((count) => count === 1), 'no deadline means no extra provider arguments');
  assert.equal(report.original.facts.model.value, 'QN55Q80C');
  assert.equal(report.reasonCodes.includes('DEADLINE_REACHED'), false);
});

test('4: unsupported category returns UNSUPPORTED with zero provider calls', async () => {
  for (const category of ['washer', 'dishwasher', 'soundbar', '']) {
    const outcome = await recommendByRetrieval({ category, brand: 'Samsung', model: 'QN55Q80C', deps: noProvider() });
    assert.equal(outcome.status, category ? 'UNSUPPORTED' : 'INVALID_REQUEST', category);
    assert.deepEqual(outcome.providerCalls, { search: 0, fetch: 0 });
    assert.equal(outcome.report, null);
  }
});

test('5: unsupported brand (or brand/category pairing) returns UNSUPPORTED with zero provider calls', async () => {
  const cases = [['television', 'Sony', 'QN55Q80C'], ['television', 'LG', 'OLED65C2PUA'], ['refrigerator', 'Samsung', 'RF28R7351SR'], ['refrigerator', 'GE', 'GNE25JSKSS']];
  for (const [category, brand, model] of cases) {
    const outcome = await recommendByRetrieval({ category, brand, model, deps: noProvider() });
    assert.equal(outcome.status, 'UNSUPPORTED', `${brand} ${category}`);
    assert.deepEqual(outcome.reasonCodes, ['UNSUPPORTED_BRAND']);
    assert.deepEqual(outcome.providerCalls, { search: 0, fetch: 0 });
  }
});

test('6: unsupported model pattern returns UNSUPPORTED with zero provider calls', async () => {
  const cases = [
    ['television', 'Samsung', 'UN55TU8000'], ['television', 'Samsung', 'QN65S90D'], ['television', 'Samsung', 'QN55Q80B'],
    ['television', 'Samsung', 'QN55Q80'], ['television', 'Samsung', 'QN12Q80C'], ['refrigerator', 'LG', 'RF28R7351SR'], ['refrigerator', 'LG', 'LRF'],
  ];
  for (const [category, brand, model] of cases) {
    const outcome = await recommendByRetrieval({ category, brand, model, deps: noProvider() });
    assert.equal(outcome.status, 'UNSUPPORTED', model);
    assert.deepEqual(outcome.reasonCodes, ['UNSUPPORTED_MODEL_PATTERN']);
    assert.deepEqual(outcome.providerCalls, { search: 0, fetch: 0 });
  }
});

test('6b: malformed input is INVALID_REQUEST, never throws, and never reaches a provider', async () => {
  const long = 'x'.repeat(301);
  const cases = [
    [{ category: 'television', brand: 'Samsung', model: 'QN55Q80C', notes: long }, 'NOTES_TOO_LONG'],
    [{ category: 'television', brand: 'Samsung', model: 'QN55Q80C; DROP TABLE' }, 'INVALID_MODEL_CHARACTERS'],
    [{ category: 'television', brand: 'Samsung', model: 'https://evil.test/QN55Q80C' }, 'INVALID_MODEL_CHARACTERS'],
    [{ category: 'television', brand: 'Samsung', model: 'Q'.repeat(41) }, 'FIELD_TOO_LONG'],
    [{ category: 'television', brand: 'Samsung', model: 7 }, 'INPUT_NOT_STRING'],
    [{ category: 'television', brand: 'Samsung', model: '  ' }, 'MISSING_FIELD'],
  ];
  for (const [input, reasonCode] of cases) {
    const outcome = await recommendByRetrieval({ ...input, deps: noProvider() });
    assert.equal(outcome.status, 'INVALID_REQUEST');
    assert.deepEqual(outcome.reasonCodes, [reasonCode]);
    assert.deepEqual(outcome.providerCalls, { search: 0, fetch: 0 });
  }
  assert.equal((await recommendByRetrieval()).status, 'INVALID_REQUEST');
  assert.equal(validateRetrievalRequest({ category: 'television', brand: 'Samsung', model: 'QN55Q80C' }).ok, true);
});

test('6c: the declared support matrix names exactly the supported brands', () => {
  assert.deepEqual(Object.keys(SUPPORT_MATRIX), ['television', 'refrigerator']);
  assert.deepEqual(Object.keys(SUPPORT_MATRIX.television), ['Samsung']);
  assert.deepEqual(Object.keys(SUPPORT_MATRIX.refrigerator), ['LG']);
});

test('7: FIT_ONLY note "50 inches wide" does NOT change TV screen size (and FULL mode still does, for legacy callers)', async () => {
  const notes = 'must fit current opening 50 inches wide';
  // Without any retrieved evidence, the interpreted facts are all the original has.
  const bare = await recommendByRetrieval({ category: 'television', brand: 'Samsung', model: 'QN55Q80C', notes, deps: tvProviders({ original: [] }).deps });
  const size = bare.report.original.facts.screenSizeIn;
  assert.deepEqual([size.status, size.value], ['INFERRED', 55]);
  // With retrieved evidence the source-backed 55 wins.
  const live = await recommendByRetrieval({ category: 'television', brand: 'Samsung', model: 'QN55Q7F', notes, deps: tvProviders().deps });
  assert.equal(live.report.original.facts.screenSizeIn.value, 55);
  assert.equal(live.report.original.facts.screenSizeIn.status, 'KNOWN');
  // Backward compatibility: the default mode is untouched.
  const legacy = interpretReplacementSearch({ query: 'Samsung QN55Q80C television', notes });
  assert.deepEqual([legacy.normalizedOriginal.facts.screenSizeIn.status, legacy.normalizedOriginal.facts.screenSizeIn.value], ['KNOWN', 50]);
  assert.equal(legacy.notesReport, undefined);
});

test('8: a FIT_ONLY opening note becomes a fit constraint that the unchanged fit rules evaluate', async () => {
  const tight = await recommendByRetrieval({ category: 'television', brand: 'Samsung', model: 'QN55Q7F', notes: 'must fit 45 inch wide opening', deps: tvProviders().deps });
  assert.deepEqual(tight.notes.fitConstraintKeys, ['openingWidthIn']);
  assert.deepEqual(tight.report.original.facts.openingWidthIn.value, 45);
  assert.equal(tight.report.original.facts.openingWidthIn.basis, 'USER_FIT_CONSTRAINT');
  const tightPrimary = tight.report.recommendation.primary;
  assert.equal(tightPrimary.fitAssessment.status, 'VIOLATION');
  assert.equal(tightPrimary.classification, 'NOT_LKQ');

  const roomy = await recommendByRetrieval({ category: 'television', brand: 'Samsung', model: 'QN55Q7F', notes: 'must fit 50 inch wide opening', deps: tvProviders().deps });
  assert.equal(roomy.report.recommendation.primary.fitAssessment.status, 'VERIFIED');
  assert.deepEqual(roomy.notes.notScored, []);

  const none = await recommendByRetrieval({ category: 'television', brand: 'Samsung', model: 'QN55Q7F', deps: tvProviders().deps });
  assert.equal(none.report.recommendation.primary.fitAssessment.status, 'ADVISORY');
});

test('9: "needs water dispenser" becomes NOTE_NOT_SCORED and does not become an original fact', async () => {
  const outcome = await recommendByRetrieval({ category: 'refrigerator', brand: 'LG', model: 'LRFVS3006S', notes: 'needs water dispenser', deps: { search: async () => [], fetchPage: async () => assert.fail('no fetch') } });
  assert.deepEqual(outcome.notes.notScored, [{ code: 'NOTE_NOT_SCORED', kind: 'FEATURE_PREFERENCE', text: 'needs water dispenser' }]);
  assert.ok(outcome.reasonCodes.includes('NOTE_NOT_SCORED'));
  assert.equal(outcome.report.original.facts.dispenser, undefined);
  assert.deepEqual(outcome.notes.fitConstraintKeys, []);
});

test('10: an HDMI preference becomes NOTE_NOT_SCORED and does not become a fact', async () => {
  const outcome = await recommendByRetrieval({ category: 'television', brand: 'Samsung', model: 'QN55Q80C',
    notes: 'wall mount stays; needs at least 3 HDMI ports', deps: tvProviders({ original: [] }).deps });
  const preference = outcome.notes.notScored.find((item) => /HDMI/.test(item.text));
  assert.deepEqual(preference, { code: 'NOTE_NOT_SCORED', kind: 'FEATURE_PREFERENCE', text: 'needs at least 3 HDMI ports' });
  assert.equal(outcome.report.original.facts.hdmiCount, undefined);
  assert.equal(outcome.report.original.facts.tier.status, 'ASSUMED');
});

test('10b: a note can carry both a fit constraint and a feature request; only the request is unscored', async () => {
  const outcome = await recommendByRetrieval({ category: 'refrigerator', brand: 'LG', model: 'LRFVS3006S',
    notes: 'must fit 36 inch wide opening, needs a water dispenser. tier: luxury', deps: { search: async () => [], fetchPage: async () => assert.fail('no fetch') } });
  assert.deepEqual(outcome.notes.fitConstraintKeys, ['openingWidthIn']);
  assert.deepEqual(outcome.notes.notScored.map((item) => item.text), ['needs a water dispenser', 'tier: luxury']);
  assert.equal(outcome.report.original.facts.tier.status, 'ASSUMED');
  assert.equal(outcome.report.original.facts.dispenser, undefined);
});

test('11: the deadline stops further provider work, and per-call timeouts are capped by the time remaining', async () => {
  const clock = fakeClock();
  const { deps, calls } = tvProviders({ tick: () => clock.advance(15_000) });
  const outcome = await recommendByRetrieval({ category: 'television', brand: 'Samsung', model: 'QN55Q7F', deadlineMs: 20_000, deps: { ...deps, now: clock.now } });

  assert.equal(calls.search.length, 1, 'only the original search ran');
  assert.equal(calls.fetch.length, 1, 'only the original page fetch ran');
  assert.equal(outcome.deadline.reached, true);
  assert.ok(outcome.reasonCodes.includes('DEADLINE_REACHED'));
  assert.deepEqual(outcome.providerCalls, { search: 1, fetch: 1 });
  assert.deepEqual(outcome.report.candidateSearches ?? [], [], 'no candidate search is planned or reported after the deadline');
  assert.equal(outcome.report.queries.length, 1);

  const capped = tvProviders();
  await recommendByRetrieval({ category: 'television', brand: 'Samsung', model: 'QN55Q7F', deadlineMs: 1500, deps: capped.deps });
  const timeout = capped.calls.search[0].options.timeoutMs;
  assert.ok(timeout > 0 && timeout <= 1250, `search timeout ${timeout} must fit the remaining time less the evaluation reserve`);
  assert.ok(capped.calls.fetch[0].options.timeoutMs <= 1250);
  assert.ok(capped.calls.fetch[0].options.signal instanceof AbortSignal);
});

test('11b: a deadline that is already spent makes zero provider calls but still returns a structured result', async () => {
  const clock = fakeClock();
  const providers = tvProviders({ tick: () => clock.advance(1) });
  clock.advance(0);
  const outcome = await recommendByRetrieval({ category: 'television', brand: 'Samsung', model: 'QN55Q7F', deadlineMs: 1, deps: { ...providers.deps, now: clock.now } });
  assert.equal(outcome.providerCalls.search + outcome.providerCalls.fetch, 0);
  assert.ok(outcome.reasonCodes.includes('DEADLINE_REACHED'));
  assert.equal(outcome.status, 'NO_RESULT');
  assert.equal(outcome.report.original.facts.model.value, 'QN55Q7F');
});

test('11c: a hung provider is cut off by the deadline instead of blocking the run', async () => {
  const outcome = await recommendByRetrieval({ category: 'television', brand: 'Samsung', model: 'QN55Q7F', deadlineMs: 700,
    deps: { search: () => new Promise(() => {}), fetchPage: async () => assert.fail('no fetch') } });
  assert.ok(outcome.reasonCodes.includes('DEADLINE_REACHED'), outcome.reasonCodes.join(','));
  assert.equal(outcome.deadline.reached, true);
  assert.ok(outcome.deadline.elapsedMs < 2000, 'returned promptly');
  assert.equal(outcome.status, 'NO_RESULT');
});

test('12: evidence gathered before the deadline is still evaluated into a PARTIAL recommendation', async () => {
  const clock = fakeClock();
  const q80dResult = result('Samsung QN55Q80D 55-inch QLED 4K TV', q80dUrl, 5);
  const q7fResult = result('Samsung QN55Q7F 55-inch QLED TV', q7fUrl, 1);
  const providers = tvProviders({
    original: [result('Samsung QN55Q80C specs', q80cUrl)], candidates: [q7fResult, q80dResult],
    pages: { [q80cUrl]: q80cPage, [q80dUrl]: syntheticTvPage('QN55Q80D'), [q7fUrl]: q7fPage },
    // The first CANDIDATE page fetch exhausts the budget, so the second candidate must not be fetched.
    tick: (() => { let fetches = 0; return (kind) => { if (kind === 'fetch' && (fetches += 1) === 2) clock.advance(25_000); }; })(),
  });
  const outcome = await recommendByRetrieval({ category: 'television', brand: 'Samsung', model: 'QN55Q80C', deadlineMs: 20_000, deps: { ...providers.deps, now: clock.now } });

  assert.equal(providers.calls.fetch.length, 2, 'original + the single highest-priority candidate');
  assert.equal(providers.calls.fetch[1].url, q80dUrl, 'same-family Q80D is fetched before Q7F regardless of search rank');
  assert.equal(outcome.status, 'PARTIAL');
  assert.equal(outcome.deadline.reached, true);
  assert.ok(outcome.reasonCodes.includes('DEADLINE_REACHED'));
  assert.deepEqual(outcome.report.candidateDiscovery.map((item) => item.model), ['QN55Q80D']);
  assert.equal(outcome.report.recommendation.primary.candidate.identity.facts.model.value, 'QN55Q80D');
  assert.equal(outcome.report.original.facts.resolution.status, 'KNOWN', 'original evidence was kept');
});

test('12b: the refrigerator run keeps gathered evidence when the deadline lands mid-run', async () => {
  const clock = fakeClock();
  const providers = fridgeProviders();
  const fetchPage = async (url, options) => { const page = await providers.deps.fetchPage(url, options); if (providers.calls.fetch.length === 2) clock.advance(25_000); return page; };
  const outcome = await recommendByRetrieval({ category: 'refrigerator', brand: 'LG', model: 'LF25H6200S', deadlineMs: 20_000, deps: { search: providers.deps.search, fetchPage, now: clock.now } });
  assert.equal(outcome.deadline.reached, true);
  assert.ok(outcome.reasonCodes.includes('DEADLINE_REACHED'));
  assert.equal(outcome.report.original.facts.capacityCuFt.status, 'KNOWN');
  assert.equal(outcome.report.candidateDiscovery.length, 1, 'one candidate was bound before the deadline');
  assert.ok(outcome.report.recommendation.primary);
  assert.equal(outcome.status, 'PARTIAL');
});

test('13: pricing data never influences output, and no price field appears', async () => {
  const priced = (html) => html.replace('</html>', '<p>Price: $1,299.99</p><p>Sale $899.00 was $1,499.99</p><script type="application/ld+json">{"@type":"Product","offers":{"price":"99.00","priceCurrency":"USD"}}</script></html>');
  const base = tvProviders();
  const noisy = tvProviders({ pages: { [q7fUrl]: priced(q7fPage), [q80cUrl]: priced(q80cPage) },
    candidates: [{ ...result('Samsung QN55Q80CAPXPA 55-inch QLED 4K TV - $49.99 clearance', q80cUrl), snippet: 'Only $49.99!' }] });
  const request = { category: 'television', brand: 'Samsung', model: 'QN55Q7F' };
  const first = await recommendByRetrieval({ ...request, deps: base.deps });
  const second = await recommendByRetrieval({ ...request, price: 1, msrp: 5000, maxPrice: 10, deps: noisy.deps });

  const summarize = (outcome) => {
    const primary = outcome.report.recommendation.primary;
    return { status: outcome.status, model: primary.candidate.identity.facts.model.value, classification: primary.classification, confidence: primary.confidence,
      rows: primary.comparisonRows.map((row) => [row.key, row.assessment]), score: primary.decision.score.weightedTotal };
  };
  assert.deepEqual(summarize(second), summarize(first));
  for (const outcome of [first, second]) {
    const offending = [...deepKeys({ original: outcome.report.original, recommendation: outcome.report.recommendation, input: outcome.input })]
      .filter((key) => /price|msrp|cost|offer|currency/i.test(key));
    assert.deepEqual(offending, []);
  }
});

test('14: provider, search and discovery rank never change the LKQ order', async () => {
  const candidates = [
    result('Samsung QN55Q7F 55-inch QLED TV', q7fUrl, 1), result('Samsung QN55Q80F 55-inch QLED 4K TV', q80fUrl, 9),
    result('Samsung QN55QN85F 55-inch Neo QLED 4K 120Hz TV', qn85fUrl, 7), result('Samsung QN55Q80D 55-inch QLED 4K TV', q80dUrl, 4),
  ];
  const pages = { [q80cUrl]: q80cPage, [q7fUrl]: q7fPage, [q80fUrl]: syntheticTvPage('QN55Q80F'), [qn85fUrl]: syntheticTvPage('QN55QN85F'), [q80dUrl]: syntheticTvPage('QN55Q80D') };
  const run = async (list) => {
    const providers = tvProviders({ original: [result('Samsung QN55Q80C specs', q80cUrl)], candidates: list, pages });
    return recommendByRetrieval({ category: 'television', brand: 'Samsung', model: 'QN55Q80C', deps: providers.deps });
  };
  const forward = await run(candidates);
  const reversed = await run([...candidates].reverse().map((item, index) => ({ ...item, providerRank: 100 - index })));
  const order = (outcome) => [outcome.report.recommendation.primary, ...outcome.report.recommendation.alternatives.map((item) => item.recommendation)]
    .map((item) => item.candidate.identity.facts.model.value);
  assert.deepEqual(order(reversed), order(forward));
  assert.deepEqual(reversed.report.recommendation.rankingExplanation.map((item) => item.decidedBy), forward.report.recommendation.rankingExplanation.map((item) => item.decidedBy));
  assert.equal(forward.report.recommendation.primary.candidate.providerRank, null);
  assert.ok(forward.report.candidateDiscovery.length >= 3);
});

test('refrigerator searches are bounded by a total count', async () => {
  const models = ['LF25A1000S', 'LF25A2000S', 'LF25A3000S', 'LF25A4000S', 'LF25A5000S', 'LF25A6000S'];
  const minimal = (model) => `<title>LG ${model} French 3-door refrigerator</title><h1>${model} refrigerator</h1>`;
  const urls = Object.fromEntries(models.map((model) => [model, lg(model, 'french-3-door-refrigerator')]));
  const providers = fridgeProviders({
    candidates: models.map((model) => result(`LG ${model} French 3-door refrigerator`, urls[model])),
    pages: { ...fridgePages, ...Object.fromEntries(models.map((model) => [urls[model], minimal(model)])) },
  });
  const outcome = await recommendByRetrieval({ category: 'refrigerator', brand: 'LG', model: 'LF25H6200S', deps: providers.deps });
  assert.ok(outcome.providerCalls.search <= MAX_REFRIGERATOR_SEARCHES, `${outcome.providerCalls.search} searches`);
  assert.ok(outcome.reasonCodes.includes('SEARCH_LIMIT_REACHED'));
});

test('guarded fetch: timeoutMs and signal are optional, only tighten, and never relax URL safety', async () => {
  const seen = [];
  const ok = (url, options) => { seen.push(options); return Promise.resolve({ status: 200, text: 'ok' }); };
  await fetchSource('https://www.samsung.com/us/tvs/', { requestImpl: ok });
  assert.equal(seen[0], undefined, 'defaults preserve the historical call shape');

  const controller = new AbortController();
  await fetchSource('https://www.samsung.com/us/tvs/', { requestImpl: ok, timeoutMs: 2500, signal: controller.signal });
  assert.ok(seen[1].timeoutMs <= 2500 && seen[1].timeoutMs > 0);
  assert.equal(seen[1].signal, controller.signal);

  await fetchSource('https://www.samsung.com/us/tvs/', { requestImpl: ok, timeoutMs: 60_000 });
  assert.ok(seen[2].timeoutMs <= 6000, 'a larger budget never exceeds the historical per-hop limit');

  const before = seen.length;
  for (const unsafe of ['http://samsung.com/', 'https://127.0.0.1/', 'https://user:pass@samsung.com/', 'file:///etc/passwd', 'https://samsung.com:8443/']) {
    await assert.rejects(fetchSource(unsafe, { requestImpl: ok, timeoutMs: 1000, signal: controller.signal }), { message: 'UNSAFE_SOURCE_URL' }, unsafe);
  }
  assert.equal(seen.length, before, 'an unsafe URL never reaches the request layer');
  await assert.rejects(fetchSource('https://www.samsung.com/a', { timeoutMs: 1000, requestImpl: async () => ({ status: 302, location: 'https://127.0.0.1/private' }) }));
  await assert.rejects(fetchSource('https://www.samsung.com/a', { timeoutMs: 1000, requestImpl: async () => ({ status: 302, location: 'https://evil.test/a' }) }), { message: 'SOURCE_CROSS_DOMAIN_REDIRECT' });
});

test('guarded fetch: the total budget is shared across redirect hops', async () => {
  let hops = 0;
  const slowRedirect = async () => { hops += 1; await new Promise((resolve) => setTimeout(resolve, 60)); return hops < 3 ? { status: 302, location: `https://www.samsung.com/hop${hops}` } : { status: 200, text: 'ok' }; };
  await assert.rejects(fetchSource('https://www.samsung.com/start', { requestImpl: slowRedirect, timeoutMs: 100 }), { message: 'SOURCE_TIMEOUT' });
  assert.ok(hops < 3, 'the third hop never started once the budget was spent');
});

test('deadline option is clamped so a caller cannot disable the bound', async () => {
  const providers = tvProviders({ original: [] });
  const outcome = await recommendByRetrieval({ category: 'television', brand: 'Samsung', model: 'QN55Q7F', deadlineMs: Number.POSITIVE_INFINITY, deps: providers.deps });
  assert.ok(outcome.deadline.totalMs <= MAX_DEADLINE_MS);
  const negative = await recommendByRetrieval({ category: 'television', brand: 'Samsung', model: 'QN55Q7F', deadlineMs: -5, deps: providers.deps });
  assert.equal(negative.deadline.totalMs, 20_000);
});

// --- FIT_ONLY mount-reuse notes -------------------------------------------------------------------------------------

const TV_QUERY = 'Samsung QN55Q80C television';
const factsOf = (notes, notesMode) => interpretReplacementSearch({ query: TV_QUERY, notes, notesMode }).normalizedOriginal.facts;
const MOUNT_REUSE_PHRASES = ['wall mount will be reused', 'reuse existing wall mount', 'existing mount will be reused',
  'must work with existing wall mount', 'keep existing wall mount'];

test('mount 1: "wall mount will be reused" is recognized in FIT_ONLY as the existing mount-reuse constraint', async () => {
  const report = interpretReplacementSearch({ query: TV_QUERY, notes: 'wall mount will be reused', notesMode: 'FIT_ONLY' });
  const mount = report.normalizedOriginal.facts.mountReuseRequired;
  assert.deepEqual([mount.status, mount.value, mount.basis], ['KNOWN', true, 'USER_FIT_CONSTRAINT']);
  assert.deepEqual(report.notesReport.fitConstraintKeys, ['mountReuseRequired']);
  assert.deepEqual(report.notesReport.notScored, []);

  // Through the facade the unchanged fit rules now see a stated constraint, so fit is no longer a plain "not stated" advisory.
  const outcome = await recommendByRetrieval({ category: 'television', brand: 'Samsung', model: 'QN55Q7F', notes: 'wall mount will be reused', deps: tvProviders().deps });
  assert.deepEqual(outcome.notes.fitConstraintKeys, ['mountReuseRequired']);
  assert.deepEqual(outcome.notes.notScored, []);
  assert.equal(outcome.report.original.facts.mountReuseRequired.value, true);
  const baseline = await recommendByRetrieval({ category: 'television', brand: 'Samsung', model: 'QN55Q7F', deps: tvProviders().deps });
  assert.equal(baseline.report.recommendation.primary.fitAssessment.status, 'ADVISORY');
  const fit = outcome.report.recommendation.primary.fitAssessment;
  assert.equal(fit.status, 'CONSTRAINT_UNVERIFIED');
  assert.deepEqual(fit.constraints.map((item) => [item.id, item.kind, item.result]), [['mount-reuse', 'CONDITIONAL_HARD', 'UNVERIFIED']]);
});

test('mount 2: every explicit mount-reuse phrasing is recognized, including "reuse existing wall mount"', () => {
  for (const notes of MOUNT_REUSE_PHRASES) {
    const interpreted = interpretReplacementSearch({ query: TV_QUERY, notes, notesMode: 'FIT_ONLY' });
    assert.equal(interpreted.normalizedOriginal.facts.mountReuseRequired?.value, true, notes);
    assert.deepEqual(interpreted.notesReport.notScored, [], notes);
  }
  const negated = factsOf("don't keep existing wall mount", 'FIT_ONLY').mountReuseRequired;
  assert.equal(negated.value, false, 'an explicit refusal to reuse is recorded as false, as in the shared fit reader');
});

test('mount 3: recognized mount reuse never overwrites or adds product facts', () => {
  const without = factsOf('', 'FIT_ONLY');
  for (const notes of [...MOUNT_REUSE_PHRASES, 'reuse existing wall mount; 4K 120Hz QLED 65 inch Neo QLED tier: luxury needs 3 HDMI ports']) {
    const withMount = factsOf(notes, 'FIT_ONLY');
    const { mountReuseRequired, ...rest } = withMount;
    assert.equal(mountReuseRequired.value, true, notes);
    assert.deepEqual(rest, without, `product facts are unchanged by: ${notes}`);
  }
  assert.deepEqual([without.screenSizeIn.status, without.screenSizeIn.value], ['INFERRED', 55]);
  assert.equal(without.resolution, undefined);
  assert.equal(without.tier.status, 'ASSUMED');
});

test('mount 4: generic or unrelated mount mentions are not promoted to a fit requirement', () => {
  for (const notes of ['TV comes with a mount', 'the TV hangs on a wall mount', 'a mount is needed', 'new mount bracket included', 'wall mount will not be reused']) {
    const interpreted = interpretReplacementSearch({ query: TV_QUERY, notes, notesMode: 'FIT_ONLY' });
    assert.equal(interpreted.normalizedOriginal.facts.mountReuseRequired, undefined, notes);
    assert.deepEqual(interpreted.notesReport.fitConstraintKeys, [], notes);
    assert.deepEqual(interpreted.notesReport.notScored.map((item) => item.text), [notes], `${notes} stays visible as not scored`);
  }
  // Mount reuse is a television constraint; a refrigerator note is never read as one.
  const fridge = interpretReplacementSearch({ query: 'LG LRFCS25D3S refrigerator', notes: 'wall mount will be reused', notesMode: 'FIT_ONLY' });
  assert.equal(fridge.normalizedOriginal.facts.mountReuseRequired, undefined);
});

test('mount 5: legacy FULL behavior is unchanged (the new phrasings are FIT_ONLY-only)', () => {
  assert.equal(factsOf('wall mount will be reused').mountReuseRequired, undefined);
  assert.equal(factsOf('existing mount will be reused').mountReuseRequired, undefined);
  assert.equal(factsOf('must work with existing wall mount').mountReuseRequired, undefined);
  assert.equal(factsOf('reuse existing wall mount').mountReuseRequired.value, true);
  assert.equal(factsOf("don't keep existing wall mount").mountReuseRequired.value, false);
  assert.equal(interpretReplacementSearch({ query: TV_QUERY, notes: 'wall mount will be reused' }).notesReport, undefined);
});

test('mount 6: a mount note and a feature request in one note are split correctly', () => {
  const interpreted = interpretReplacementSearch({ query: TV_QUERY, notes: 'wall mount will be reused; needs at least 3 HDMI ports', notesMode: 'FIT_ONLY' });
  assert.deepEqual(interpreted.notesReport.fitConstraintKeys, ['mountReuseRequired']);
  assert.deepEqual(interpreted.notesReport.notScored, [{ code: 'NOTE_NOT_SCORED', kind: 'FEATURE_PREFERENCE', text: 'needs at least 3 HDMI ports' }]);
});
