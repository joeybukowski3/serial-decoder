import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { originalManufacturerPages, validManufacturerPage, normalizeManufacturerPages } from '../../lib/itemassist-research/enrich/original-source.js';
import { researchLiveV2 } from '../../lib/itemassist-research/enrich/orchestrate.js';
import { normalizeIdentification } from '../../lib/itemassist-research/enrich/identify.js';
import { buildResearchResponseV2, isValidResearchResponseV2 } from '../../lib/itemassist-research/contract-v2.js';
import { sizeSpec } from '../../lib/itemassist-research/enrich/product-tokens.js';

// OFFLINE ONLY. The original's own manufacturer page, taken from the search results the engine already fetched. It is never built from a naming pattern, never
// stands in for a successor, and establishes one thing: that the manufacturer lists this model.
const FX = (file) => JSON.parse(readFileSync(new URL(`../fixtures/itemassist-research/${file}`, import.meta.url), 'utf8'));
const S1 = FX('s1-rows.json'), CPB = FX('checkpoint-b-lg-c3.json'), CPC = FX('checkpoint-c-appliances.json'), CPD = FX('checkpoint-d-ge-profile.json'), FRIG = FX('phase-b-frigidaire.json');
const find = (query, rows, identity = '') => originalManufacturerPages(rows, { query, identity, spec: sizeSpec('tv', query) });
const row = (url, title = '', snippet = '') => ({ url, title, snippet, date: null });
const urls = (pages) => pages.map((page) => page.url);

test('LG C3 55-inch: the US product page for exactly that model is found in the existing results, and nothing else is taken', () => {
  for (const [name, rows] of [['S1', S1.history['lg-c3-55']], ['saved production request', CPB.history]]) {
    const pages = find('LG C3 55-inch TV', rows);
    assert.deepEqual(pages, [{
      url: 'https://www.lg.com/us/tvs/lg-oled55c3pua-oled-4k-tv', domain: 'lg.com', sourceName: 'LG', sourceClass: 'MANUFACTURER', model: 'OLED55C3PUA', pageKind: 'PRODUCT',
      title: '55 inch Class LG OLED evo C3 4k Smart TV OLED55C3PUA', foundVia: 'SEARCH_RESULT',
    }], name);
  }
});

test('regional storefronts, newsroom articles, reviews and retailers are not the original\'s manufacturer page', () => {
  const rows = [...S1.history['lg-c3-55'], ...CPB.history];
  const accepted = urls(find('LG C3 55-inch TV', rows));
  for (const rejected of ['https://www.lg.com/in/tv-soundbars/oled-evo/oled55c3psa/', 'https://www.lg.com/uk/tvs-soundbars/smart-tvs/oled55c34la/',
    'https://www.lg.com/us/newsroom/media-entertainment/lg-begins-us-rollout-of-2023-oled-tv-lineup']) {
    assert.equal(rows.some((entry) => entry.url === rejected), true, `${rejected} is in the saved results`);
    assert.equal(accepted.includes(rejected), false, rejected);
  }
  assert.deepEqual([...new Set(accepted)], ['https://www.lg.com/us/tvs/lg-oled55c3pua-oled-4k-tv']);
});

test('a manufacturer URL that belongs to a different model is rejected', () => {
  const cases = {
    'a later generation': 'https://www.lg.com/us/tvs/lg-oled55c4pua-oled-4k-tv',
    'another series': 'https://www.lg.com/us/tvs/lg-oled55g3pua-oled-4k-tv',
    'another size of the same series': 'https://www.lg.com/us/tvs/lg-oled83c3pua-oled-4k-tv',
    'a longer code that merely begins with the series': 'https://www.lg.com/us/tvs/lg-oled55c34pua-oled-4k-tv',
    'a page with no model code in its address': 'https://www.lg.com/us/tvs/oled-evo',
  };
  for (const [label, url] of Object.entries(cases)) assert.deepEqual(find('LG C3 55-inch TV', [row(url, '55 inch Class LG OLED evo TV')]), [], label);
  assert.equal(find('LG C3 55-inch TV', [row('https://www.lg.com/us/tvs/lg-oled55c3pua-oled-4k-tv', 'LG OLED55C3PUA vs OLED55C4PUA comparison')]).length, 0, 'a page whose title also names another model');
  assert.equal(find('LG C3 TV', [row('https://www.lg.com/us/tvs/lg-oled55c3pua-oled-4k-tv', 'LG OLED55C3PUA')]).length, 0, 'with no size asked, which size of the C3 is meant is not established');
  assert.equal(find('Samsung S90C 65 inch', [row('https://www.lg.com/us/tvs/lg-oled65c3pua-oled-4k-tv', 'LG OLED65C3PUA')]).length, 0, 'another maker');
});

test('a typed full model code must match exactly (or as a short variant); another code does not', () => {
  const page = row('https://www.lg.com/us/tvs/lg-oled55c3pua-oled-4k-tv', 'LG OLED55C3PUA');
  assert.equal(find('LG OLED55C3PUA', [page]).length, 1);
  assert.equal(find('LG OLED55C3PU', [page]).length, 1, 'a truncated typed code is a short variant of it, as everywhere else in the engine');
  assert.equal(find('LG OLED55C3PSA', [page]).length, 0, 'the regional code of the same set is a different model');
  assert.equal(find('LG OLED55C4PUA', [page]).length, 0);
});

test('the same rule works for appliances and for other makers, from the saved results: support pages are labelled as support pages', () => {
  const none = (query, rows) => originalManufacturerPages(rows, { query, identity: '', spec: null });
  assert.deepEqual(none('LG WM4000HWA washer', S1.history['lg-wm4000hwa']).map((page) => [page.url, page.pageKind, page.model]),
    [['https://www.lg.com/us/washers-dryers/lg-wm4000hwa-front-load-washer', 'PRODUCT', 'WM4000HWA']]);
  assert.deepEqual(none('Bosch SHPM65Z55N dishwasher', CPC.products.dishwasher.history).map((page) => [page.url, page.pageKind, page.model]),
    [['https://www.bosch-home.com/us/supportdetail/product/SHPM65Z55N/01', 'SUPPORT', 'SHPM65Z55N']]);
  // GE has two genuine pages for the model: its product page and a support page. The product page comes first; at most two are kept.
  assert.deepEqual(none('GE Profile PFE28KYNFS refrigerator', CPD.products.refrigerator.history).map((page) => [page.sourceName, page.pageKind, page.model, page.domain]),
    [['GE Appliances', 'PRODUCT', 'PFE28KYNFS', 'geappliances.com'], ['GE Appliances', 'SUPPORT', 'PFE28KYNFS', 'geappliances.com']]);
  assert.deepEqual(none('Frigidaire Gallery FGHB2868TF refrigerator', FRIG.history).map((page) => [page.url, page.pageKind]), [['https://www.frigidaire.com/en/p/owner-center/product-support/FGHB2868TF', 'SUPPORT']]);
  // Category pages and regional support pages of the same makers are not model pages.
  assert.deepEqual(none('Samsung RF28R7351SR refrigerator', CPC.products.refrigerator.history), []);
  assert.deepEqual(none('Samsung S90C 65 inch OLED TV', S1.history['samsung-s90c-65']), [], 'the only samsung.com results are a regional support page and a news article');
});

test('the URL is exactly one the search returned: nothing is constructed, guessed or completed from a naming pattern', () => {
  const sets = [[S1.history['lg-c3-55'], 'LG C3 55-inch TV'], [CPB.history, 'LG C3 55-inch TV'], [S1.history['lg-wm4000hwa'], 'LG WM4000HWA washer'], [CPC.products.dishwasher.history, 'Bosch SHPM65Z55N dishwasher'], [FRIG.history, 'Frigidaire FGHB2868TF']];
  for (const [rows, query] of sets) {
    const given = new Set(rows.map((entry) => entry.url));
    for (const page of originalManufacturerPages(rows, { query, identity: '', spec: sizeSpec('tv', query) })) assert.equal(given.has(page.url), true, page.url);
  }
  // With no result for the model there is no page; a pattern is never used to make one.
  assert.deepEqual(find('LG C6 55-inch TV', S1.history['lg-c3-55']), []);
  assert.deepEqual(find('LG C3 55-inch TV', []), []);
  assert.deepEqual(find('LG C3 55-inch TV', undefined), []);
});

test('the page is attached to the original only: no successor, price or evidence entry takes anything from it', async () => {
  const reply = { category: 'tv', profile: 'tv', original: { identity: 'LG C3 55-inch OLED TV (2023)', confidence: 'high', characteristics: ['55-inch OLED'], uncertainty: null }, tier: 'PREMIUM', requirements: [],
    successor: { name: 'LG C-series OLED', why: 'Continues the line.', differences: null, concern: null, confidence: 'medium', comparison: [] }, suggestions: [], estimates: { originalNew: { low: 1500, high: 2000 }, replacementNew: { low: 1200, high: 1800 } }, clarify: [] };
  const run = async (history) => {
    const at = Date.UTC(2026, 10, 11, 15);
    const result = await researchLiveV2('LG C3 55-inch TV', { env: { SERPER_API_KEY: 'k' }, now: () => at, identify: async (q) => ({ ok: true, ...normalizeIdentification(reply, q), meta: { requestSent: true, usage: {}, httpStatus: 200 } }),
      serper: async ({ kind }) => (kind === 'search' ? history : S1.listings['lg-c3-55'].rows), serperBudget: { reserve: async (credits) => ({ allowed: true, status: 'allowed', credits }) }, enrichCache: null, enrich: true });
    return buildResearchResponseV2(result.input, { requestId: 'r', elapsedMs: 1, answerSource: 'AI_ESTIMATE', now: at });
  };
  const withPage = await run(S1.history['lg-c3-55']);
  const without = await run(S1.history['lg-c3-55'].filter((entry) => !/lg-oled55c3pua-oled-4k-tv/.test(entry.url)));
  assert.equal(isValidResearchResponseV2(withPage), true);
  assert.deepEqual(withPage.original.manufacturerPages.map((page) => page.model), ['OLED55C3PUA']);
  assert.equal(without.original.manufacturerPages, undefined);
  // Release 2: the page's title may state the ORIGINAL's side of a specification comparison (labelled as such); nothing on the candidate's side or in a price changes.
  const noComparison = (candidate) => { if (!candidate) return candidate; const { specComparison, ...rest } = candidate; return rest; };
  const candidateSides = (candidate) => (candidate?.specComparison?.rows || []).map((row) => [row.attribute, row.candidate]);
  assert.deepEqual(candidateSides(withPage.successor), candidateSides(without.successor), 'the candidate side of a comparison never takes anything from the original page');
  for (const row of withPage.successor.specComparison?.rows || []) if (row.candidate) assert.equal(row.candidate.basis, 'LISTING_TITLE');
  const strip = (response) => JSON.stringify({ successor: noComparison(response.successor), suggestions: response.suggestions.map(noComparison), prices: response.pricing.prices.filter((p) => p.subject === 'REPLACEMENT'), valuation: response.pricing.valuation.method });
  assert.equal(strip(withPage), strip(without), 'the successor, its prices and the valuation are identical with and without the original\'s page');
  assert.equal(withPage.pricing.evidence.some((entry) => entry.sourceUrl.includes('oled55c3pua-oled-4k-tv')), false, 'the page is not a price citation');
});

test('the contract re-derives every page and refuses a forged one', () => {
  const good = find('LG C3 55-inch TV', S1.history['lg-c3-55'])[0];
  assert.deepEqual(validManufacturerPage(good), good);
  assert.deepEqual(normalizeManufacturerPages([good, good, { ...good, url: `${good.url}/` }], 'LG C3 series 55-inch OLED'), [good], 'duplicates collapse, and a trailing slash is the same page');
  assert.deepEqual(normalizeManufacturerPages([good], 'Samsung S90C'), [], 'a page of another maker than the identified original is not carried');
  assert.deepEqual(normalizeManufacturerPages([good], ''), [], 'with no identification there is no original');
  const forged = {
    'a retailer presented as the maker': { ...good, url: 'https://www.bestbuy.com/us/tvs/lg-oled55c3pua-oled-4k-tv', domain: 'bestbuy.com', sourceName: 'Best Buy' },
    'a regional storefront': { ...good, url: 'https://www.lg.com/in/tvs/lg-oled55c3pua-oled-4k-tv' },
    'an address without the model': { ...good, url: 'https://www.lg.com/us/tvs/oled-evo' },
    'a model that is not in the address': { ...good, model: 'OLED55C4PUA' },
    'an unregistered host': { ...good, url: 'https://www.lg.example/us/tvs/lg-oled55c3pua-oled-4k-tv' },
    'http': { ...good, url: 'http://www.lg.com/us/tvs/lg-oled55c3pua-oled-4k-tv' },
    'a query string': { ...good, url: `${good.url}?utm=1` },
    'an extra key': { ...good, verified: true },
    'a wrong kind': { ...good, pageKind: 'SUPPORT' },
    'a source that claims to have been opened': { ...good, foundVia: 'FETCHED_PAGE' },
    'a non-string title': { ...good, title: 42 },
  };
  for (const [label, entry] of Object.entries(forged)) assert.equal(validManufacturerPage(entry), null, label);
  assert.deepEqual(normalizeManufacturerPages('x', 'LG'), []);
  assert.deepEqual(normalizeManufacturerPages([null, 3, {}], 'LG'), []);
  // A claim in the page's title (a price, a link) is withheld, not relayed.
  assert.equal(validManufacturerPage({ ...good, title: 'OLED55C3PUA only $999 today, see https://deals.example' }).title, null);
});

test('review: a series written without its generation names several models, so the order of results never picks one', () => {
  const rows = [row('https://www.samsung.com/us/tvs/qled-4k-tvs/qn55q60tafxza/', 'Samsung 55" Q60T QLED'), row('https://www.samsung.com/us/tvs/qled-4k-tvs/qn55q60cafxza/', 'Samsung 55" Q60C QLED')];
  assert.deepEqual(find('Samsung Q60 55 inch TV', rows), [], 'Q60T and Q60C are different years');
  assert.deepEqual(find('Samsung Q60 55 inch TV', [...rows].reverse()), [], 'in either order');
  assert.deepEqual(find('Samsung S90 65 inch', [row('https://www.samsung.com/us/tvs/oled-tvs/qn65s90dafxza/', 'Samsung 65" S90D')]), [], 'the person never said D');
  // With the generation written, the page of that generation is the original's and the other is not.
  assert.deepEqual(urls(find('Samsung Q60C 55 inch TV', rows)), ['https://www.samsung.com/us/tvs/qled-4k-tvs/qn55q60cafxza/']);
  assert.deepEqual(urls(find('Samsung S90D 65 inch', [row('https://www.samsung.com/us/tvs/oled-tvs/qn65s90dafxza/', 'Samsung 65" S90D'), row('https://www.samsung.com/us/tvs/oled-tvs/qn65s90cafxza/', 'Samsung 65" S90C')])), ['https://www.samsung.com/us/tvs/oled-tvs/qn65s90dafxza/']);
  // LG: the generation is the digit after the series letter, and a market variant of the same generation is the same original.
  assert.deepEqual(urls(find('LG C3 55-inch TV', [row('https://www.lg.com/us/tvs/lg-oled55c4pua-oled-4k-tv', 'LG C4'), row('https://www.lg.com/us/tvs/lg-oled55c3pua-oled-4k-tv', 'LG C3')])), ['https://www.lg.com/us/tvs/lg-oled55c3pua-oled-4k-tv']);
});

test('review: blog posts, reviews, accessory and comparison pages are not the model\'s product page', () => {
  for (const url of ['https://www.lg.com/us/blog/lg-oled55c3pua-review', 'https://www.lg.com/us/tvs/lg-oled55c3pua-oled-4k-tv/accessories', 'https://www.lg.com/us/tvs/oled65c3pua-wall-mount',
    'https://www.lg.com/us/discover/lg-oled55c3pua-tour']) {
    assert.deepEqual(find('LG C3 55-inch TV', [row(url, 'LG OLED55C3PUA')]), [], url);
  }
  for (const url of ['https://www.geappliances.com/blog/pfe28kynfs-best-fridge', 'https://www.whirlpool.com/blog/wrf535swhz']) {
    assert.deepEqual(originalManufacturerPages([row(url, 'x')], { query: url.includes('whirlpool') ? 'Whirlpool WRF535SWHZ' : 'GE Profile PFE28KYNFS', identity: '', spec: null }), [], url);
  }
});

test('review: locale-style and country-marked addresses on US-only hosts are regional pages', () => {
  for (const url of ['https://www.geappliances.com/en-ca/appliance/PFE28KYNFS', 'https://www.geappliances.com/ge/pfe28kynfs-ca/', 'https://www.geappliances.com/fr-ca/appliance/PFE28KYNFS']) {
    assert.deepEqual(originalManufacturerPages([row(url, 'GE PFE28KYNFS')], { query: 'GE Profile PFE28KYNFS', identity: '', spec: null }), [], url);
  }
  assert.deepEqual(urls(originalManufacturerPages([row('https://products.geappliances.com/appliance/PFE28KYNFS/support', 'GE PFE28KYNFS')], { query: 'GE Profile PFE28KYNFS', identity: '', spec: null })).length <= 1, true);
});

test('review: a trailing slash is the same page, and a one-letter first word is no maker', () => {
  const rows = [row('https://www.lg.com/us/tvs/lg-oled55c3pua-oled-4k-tv', 'LG C3'), row('https://www.lg.com/us/tvs/lg-oled55c3pua-oled-4k-tv/', 'LG C3')];
  assert.equal(find('LG C3 55-inch TV', rows).length, 1);
  assert.deepEqual(find('S 90C 65', [row('https://www.samsung.com/us/tvs/oled-tvs/qn65s90cafxza/', 'Samsung S90C')]), [], 'a bare letter is not a maker');
});
