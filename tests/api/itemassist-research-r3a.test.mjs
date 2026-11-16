import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { researchLiveV2, rankShopped } from '../../lib/itemassist-research/enrich/orchestrate.js';
import { normalizeIdentification } from '../../lib/itemassist-research/enrich/identify.js';
import { buildResearchResponseV2, isValidResearchResponseV2 } from '../../lib/itemassist-research/contract-v2.js';
import { looksLikeExactModel } from '../../lib/itemassist-research/evidence.js';
import { modelCodeSizes, sizeSpec } from '../../lib/itemassist-research/enrich/product-tokens.js';
import { skuOf } from '../../lib/itemassist-research/enrich/config.js';
import { sizedFamilyName } from '../../lib/itemassist-research/enrich/candidate-label.js';
import { compareFacts, rankCandidates, rankingFacts, splitAlternatives, splitCandidate } from '../../lib/itemassist-research/enrich/candidate-ranking.js';
import { displayTypeOf, settledDisplayStatus, withSettledDisplayClass } from '../../lib/itemassist-research/enrich/display-class.js';

// OFFLINE ONLY. Release 3a: size from the original's model code, "A or B" candidates split, display-class correction, deterministic ranking and the
// size a television family is presented with. No provider, key or network is touched; Gemini and Serper are replaced by in-memory fakes.
const NOW = Date.UTC(2026, 10, 16, 15);
const JU6700 = JSON.parse(readFileSync(new URL('../fixtures/itemassist-research/ju6700-synthetic.json', import.meta.url), 'utf8'));

/** The live pipeline with the model's reply mocked and Shopping rows routed by the query text. Returns the research.2 response and what was asked. */
async function run({ query, reply, route }) {
  const asked = [];
  const result = await researchLiveV2(query, {
    env: { SERPER_API_KEY: 'offline-key' }, now: () => NOW,
    identify: async (text) => ({ ok: true, ...normalizeIdentification(reply, text), meta: { requestSent: true, usage: {}, httpStatus: 200 } }),
    serper: async ({ kind, query: text }) => { asked.push([kind, text]); return kind === 'search' ? [] : route(text); },
    serperBudget: { reserve: async (credits) => ({ allowed: true, status: 'allowed', credits }) }, enrichCache: null, enrich: true,
  });
  const response = buildResearchResponseV2(result.input, { requestId: 'offline', elapsedMs: 1, answerSource: 'AI_ESTIMATE', now: NOW });
  assert.equal(isValidResearchResponseV2(response), true, 'every response passes the research.2 validator');
  return { response, asked, meta: result.meta };
}

const candidates = (response) => [response.successor, ...response.suggestions].filter(Boolean);
const replacementPrices = (response, key) => response.pricing.prices.filter((item) => item.subject === 'REPLACEMENT' && item.kind === 'CURRENT_RETAIL_NEW' && (!key || item.candidate === key));
const sized = (list) => list.filter((item) => item.sizeConfirmed !== false).map((item) => item.amount.low).sort((a, b) => a - b);
const displayRow = (response, candidate) => {
  const id = response.requirements.find((item) => item.key === 'displayClass')?.id;
  return candidate.comparison.find((row) => row.requirementId === id) || null;
};

const tvReply = (suggestion, over = {}) => ({
  category: 'tv', profile: 'tv',
  original: { identity: 'LG C3 series 55-inch 4K OLED evo smart TV (2023)', confidence: 'high', characteristics: ['55-inch OLED', '4K'], uncertainty: null },
  tier: 'PREMIUM', requirements: [],
  successor: null,
  suggestions: [{ name: suggestion, why: 'Similar premium class.', differences: null, concern: null, confidence: 'medium', tierVsOriginal: 'SAME', comparison: [] }],
  estimates: { originalNew: { low: 1500, high: 2000 }, replacementNew: { low: 1200, high: 1800 } }, clarify: [], ...over,
});

// ---- size from the original's model code ----------------------------------------------------------------------------------------------------------

test('a television model code states its size only in a full code shape of a known maker; a bare series never reads as a size', () => {
  assert.deepEqual(modelCodeSizes('Samsung UN55JU6700F'), [55]);
  assert.deepEqual(modelCodeSizes('LG 55UR8000PUA'), [55]);
  assert.deepEqual(modelCodeSizes('Sony KD-55X75WL'), [55]);
  assert.deepEqual(modelCodeSizes('LG OLED65C3PUA'), [65]);
  assert.deepEqual(modelCodeSizes('Samsung QN90D Neo QLED'), [], 'QN90D is a series, not 90 inches');
  assert.deepEqual(modelCodeSizes('Sony X75WL'), [], 'X75WL is a series, not 75 inches');
  assert.deepEqual(modelCodeSizes('LG UR8000'), []);
});

test('sizeSpec: the code size is used when nothing contradicts it; a written size and a code that disagree establish no size', () => {
  assert.deepEqual(sizeSpec('tv', 'Samsung UN55JU6700F'), { kind: 'inches', value: 55 });
  assert.deepEqual(sizeSpec('tv', 'Samsung UN55JU6700F 55 inch'), { kind: 'inches', value: 55 });
  assert.equal(sizeSpec('tv', 'Samsung UN55JU6700F 65 inch'), null, 'conflicting sizes are ambiguous, not chosen');
  assert.equal(sizeSpec('tv', 'UN55JU6700F or UN65JU6700F'), null, 'two codes of different sizes');
  assert.equal(sizeSpec('tv', 'Samsung UN55JU6700F', { fromCodes: false }), null, 'only a written size is "their description"');
  assert.equal(sizeSpec('tv', 'Samsung QN90D'), null);
});

// ---- compound candidates ------------------------------------------------------------------------------------------------------------------------

test('"A or B" becomes independent candidates; parentheses, product-line words and non-products are not split', () => {
  assert.deepEqual(splitAlternatives('LG UR8000 or UT75'), ['LG UR8000', 'LG UT75']);
  assert.deepEqual(splitAlternatives('LG C4 or Sony Bravia 8'), ['LG C4', 'Sony Bravia 8']);
  assert.deepEqual(splitAlternatives('Samsung QLED or Neo QLED'), ['Samsung QLED', 'Samsung Neo QLED'], '"Neo" is not a maker');
  assert.deepEqual(splitAlternatives('LG UT75 (43 or 50 inch)'), ['LG UT75 (43 or 50 inch)']);
  assert.deepEqual(splitAlternatives('Sony X75WL'), ['Sony X75WL']);
});

test('a split part does not inherit a shortfall (or a match) the reply stated for the pair: each row becomes UNKNOWN', () => {
  const parts = splitCandidate({ name: 'LG UR8000 or UT75', comparison: [{ requirementKey: 'displayClass', status: 'SHORTFALL', basis: 'AI_ESTIMATE' }] });
  assert.deepEqual(parts.map((part) => [part.name, part.comparison.map((row) => row.status)]), [['LG UR8000', ['UNKNOWN']], ['LG UT75', ['UNKNOWN']]]);
  const single = { name: 'Sony X75WL', comparison: [{ requirementKey: 'displayClass', status: 'SHORTFALL' }] };
  assert.equal(splitCandidate(single)[0], single, 'an ordinary candidate is untouched');
});

// ---- display class ------------------------------------------------------------------------------------------------------------------------------

test('display class: families differ, LCD types are not all equal, only recognised steps are ordered, and the row stays an estimate', () => {
  assert.equal(displayTypeOf('Samsung Crystal UHD DU7200'), 'LED');
  assert.equal(displayTypeOf('Samsung Neo QLED QN90D'), 'MINI_LED');
  assert.equal(displayTypeOf('Samsung S90D QD-OLED'), 'QD_OLED');
  assert.equal(displayTypeOf('an OLED, unlike the original LED panel'), null, 'two panels named: settles nothing');
  assert.equal(settledDisplayStatus('LED', 'LED'), 'MEETS');
  assert.equal(settledDisplayStatus('LED', 'OLED'), 'SHORTFALL', 'a different panel family is a material difference');
  assert.equal(settledDisplayStatus('LED', 'QLED'), 'EXCEEDS');
  assert.equal(settledDisplayStatus('MINI_LED', 'LED'), 'SHORTFALL');
  assert.equal(settledDisplayStatus('QLED', 'NANOCELL'), null, 'not ranked against each other');
  const rows = [{ requirementKey: 'displayClass', status: 'SHORTFALL', basis: 'AI_ESTIMATE' }];
  assert.deepEqual(withSettledDisplayClass(rows, 'LED', 'LED'), [{ requirementKey: 'displayClass', status: 'MEETS', basis: 'AI_ESTIMATE' }], 'corrected, never CONFIRMED');
  assert.equal(withSettledDisplayClass(rows, 'LED', null), rows, 'unsettled: left exactly as given');
  assert.equal(withSettledDisplayClass(undefined, 'LED', 'LED'), undefined);
});

// ---- ranking ------------------------------------------------------------------------------------------------------------------------------------

test('ranking: essential fit, then tier, then newer generation, then model evidence, then price evidence; ties keep the reply order', () => {
  const facts = (over) => ({ shortfalls: 0, tier: 0, generation: null, model: 0, price: 0, ...over });
  assert.ok(compareFacts(facts({ shortfalls: 0, tier: 3 }), facts({ shortfalls: 1 })) < 0, 'essential fit outranks tier');
  assert.ok(compareFacts(facts({ tier: 0 }), facts({ tier: 1, model: 2 })) < 0, 'tier outranks model evidence');
  assert.ok(compareFacts(facts({ generation: 6 }), facts({ generation: 5, model: 2 })) < 0, 'newer generation outranks model evidence');
  assert.equal(compareFacts(facts({ generation: null }), facts({ generation: 5 })), 0, 'unknown generation is neither better nor worse');
  assert.ok(compareFacts(facts({ model: 2 }), facts({ model: 0, price: 2 })) < 0, 'model evidence outranks price evidence');
  const entries = [{ name: 'A', tierVsOriginal: 'LOWER' }, { name: 'B', tierVsOriginal: 'SAME' }, { name: 'C', tierVsOriginal: 'SAME' }];
  assert.deepEqual(rankCandidates(entries, (entry) => rankingFacts(entry, null, 'tv')).map((entry) => entry.name), ['B', 'C', 'A']);
});

// ---- the size a television family is presented with ---------------------------------------------------------------------------------------------

const PRICED_55 = Object.freeze({ items: [{ amount: 1698 }, { amount: 1749 }], sizeStated: true, lineage: null, sku: null, observedSku: null, demotedName: null, conflict: false });

test('a television family whose own priced listings state the size is presented at it; without that support the name is unchanged', () => {
  assert.equal(sizedFamilyName('Sony Bravia 8 OLED', { category: 'tv', size: 55, screened: PRICED_55 }), 'Sony Bravia 8 OLED 55-inch');
  assert.equal(sizedFamilyName('Sony Bravia 8 OLED', { category: 'tv', size: 55, screened: { ...PRICED_55, sizeStated: false } }), 'Sony Bravia 8 OLED', 'listings did not state the size');
  assert.equal(sizedFamilyName('Sony Bravia 8 OLED', { category: 'tv', size: 55, screened: { ...PRICED_55, items: [] } }), 'Sony Bravia 8 OLED', 'nothing priced');
  assert.equal(sizedFamilyName('Sony Bravia 8 OLED', { category: 'tv', size: null, screened: PRICED_55 }), 'Sony Bravia 8 OLED', 'no size established for the original');
  assert.equal(sizedFamilyName('Sony Bravia 8 OLED', { category: 'tv', size: 55, screened: null }), 'Sony Bravia 8 OLED', 'not looked up');
});

test('the size label applies to televisions only: a dishwasher or refrigerator family is never renamed', () => {
  assert.equal(sizedFamilyName('KitchenAid dishwasher', { category: 'dishwasher', size: 24, screened: PRICED_55 }), 'KitchenAid dishwasher');
  assert.equal(sizedFamilyName('GE Profile French door', { category: 'refrigerator', size: 36, screened: PRICED_55 }), 'GE Profile French door');
});

test('the size label is idempotent and never turns a family into an apparent model', () => {
  const once = sizedFamilyName('LG UT75', { category: 'tv', size: 55, screened: PRICED_55 });
  assert.equal(sizedFamilyName(once, { category: 'tv', size: 55, screened: PRICED_55 }), once);
  assert.equal(sizedFamilyName('LG UT75 55"', { category: 'tv', size: 55, screened: PRICED_55 }), 'LG UT75 55"', 'a stated size is not repeated');
  assert.equal(sizedFamilyName('LG UT75 65-inch', { category: 'tv', size: 55, screened: PRICED_55 }), 'LG UT75 65-inch', 'a different stated size is not overwritten');
  assert.equal(looksLikeExactModel(once), false);
  assert.equal(sizedFamilyName('TCL QM8', { category: 'tv', size: 100, screened: PRICED_55 }), 'TCL QM8', '"100-inch" would read as a model code');
  for (const blocked of [{ sku: '55UT7570PUB' }, { observedSku: '55UT7570PUB' }, { lineage: {} }, { demotedName: 'LG television' }, { conflict: true }]) {
    assert.equal(sizedFamilyName('LG UT75', { category: 'tv', size: 55, screened: { ...PRICED_55, ...blocked } }), 'LG UT75', JSON.stringify(blocked));
  }
});

test('ranking twice does not append the size twice and does not move a price to another candidate', () => {
  const input = { successor: null, suggestions: [{ name: 'Sony Bravia 8 OLED', why: 'Similar tier.', comparison: [], tierVsOriginal: 'SAME' }] };
  const shopped = [['ALT_1', input.suggestions[0], { ...PRICED_55, displayTitles: [] }]];
  const first = rankShopped(input, shopped, { category: 'tv', profile: 'tv', size: 55 });
  const second = rankShopped(first.input, first.shopped, { category: 'tv', profile: 'tv', size: 55 });
  assert.equal(first.input.suggestions[0].name, 'Sony Bravia 8 OLED 55-inch');
  assert.equal(second.input.suggestions[0].name, 'Sony Bravia 8 OLED 55-inch');
  assert.equal(second.input, first.input, 'nothing changes the second time');
  assert.deepEqual(second.shopped.map(([key, candidate, screened]) => [key, candidate.name, screened.items.length]), [['ALT_1', 'Sony Bravia 8 OLED 55-inch', 2]]);
});

test('a listing code that holds the series is the model: "UR8000 Series … 55UR8000AUA" names 55UR8000AUA', () => {
  assert.equal(skuOf('LG 55" Class UR8000 Series LED 4K UHD Smart webOS TV 55UR8000AUA'), '55UR8000AUA');
  assert.equal(skuOf('LG 55" Class OLED evo C4 Series OLED55C4PUA 4K'), 'OLED55C4PUA');
  assert.equal(skuOf('Samsung 55" DU7200 Crystal UHD UN55DU7200FXZA'), 'UN55DU7200FXZA');
});

// ---- the live pipeline, offline ------------------------------------------------------------------------------------------------------------------

test('Sony Bravia 8 at a supported 55 inches: sized family name, family-level status, only 55-inch prices, no extra provider call', async () => {
  const rows = [
    { title: 'Sony 55" Class BRAVIA 8 OLED 4K HDR Smart TV', seller: 'Best Buy', price: 1698 },
    { title: 'Sony 55 inch BRAVIA 8 OLED 4K Google TV', seller: 'Abt', price: 1749 },
    { title: 'Sony 65" Class BRAVIA 8 OLED 4K HDR Smart TV', seller: 'Crutchfield', price: 2298 },
  ];
  const { response, asked } = await run({ query: 'LG C3 55-inch TV', reply: tvReply('Sony Bravia 8 OLED'), route: (text) => (/Sony/.test(text) ? rows : []) });
  const sony = candidates(response).find((entry) => /Sony/.test(entry.name));
  assert.equal(sony.name, 'Sony Bravia 8 OLED 55-inch');
  assert.equal(sony.modelStatus, 'FAMILY_LEVEL', 'a size-qualified family, not a verified model');
  assert.equal(sony.verified, false);
  const prices = replacementPrices(response).filter((item) => item.subject === 'REPLACEMENT');
  assert.deepEqual(sized(prices), [1698, 1749], 'the 65-inch listing is never priced for a 55-inch original');
  assert.equal(prices.some((item) => item.amount.low === 2298), false);
  assert.deepEqual(asked.map(([kind]) => kind), ['search', 'shopping'], 'one search and one Shopping query for one candidate');
});

test('a television family whose listings state no size keeps its name and gets no sized price', async () => {
  const rows = [
    { title: 'Sony BRAVIA 8 OLED 4K HDR Smart Google TV', seller: 'Best Buy', price: 1698 },
    { title: 'Sony BRAVIA 8 OLED 4K Google TV', seller: 'Abt', price: 1749 },
  ];
  const { response } = await run({ query: 'LG C3 55-inch TV', reply: tvReply('Sony Bravia 8 OLED'), route: (text) => (/Sony/.test(text) ? rows : []) });
  const sony = candidates(response).find((entry) => /Sony/.test(entry.name));
  assert.equal(sony.name, 'Sony Bravia 8 OLED');
  assert.deepEqual(sized(replacementPrices(response)), [], 'unsized listings are examples only (sizeConfirmed: false)');
});

test('Samsung UN55JU6700F (SYNTHETIC fixture, not the Production response): 55 inches from the code, split candidates, LED-vs-LED meets, 55-inch prices only', async () => {
  assert.match(JU6700._provenance, /^SYNTHETIC/);
  const route = (text) => { const key = Object.keys(JU6700.listings).find((name) => text.includes(name)); return key ? JU6700.listings[key] : []; };
  const { response, asked, meta } = await run({ query: JU6700.query, reply: JU6700.reply, route });
  assert.deepEqual(asked, [['search', 'Samsung UN55JU6700F launch price MSRP'], ['shopping', 'LG UR8000 55 inch TV'], ['shopping', 'LG UT75 55 inch TV']]);
  assert.equal(meta.serperCalls, 3, 'the same one search and two Shopping queries as before R3a');
  const list = candidates(response);
  assert.deepEqual(list.map((entry) => [entry.name, entry.modelStatus]), [
    ['LG 55UR8000AUA', 'LISTED_PROVISIONAL'], // an exact code two recognised sellers list at 55 inches (still provisional, never verified)
    ['LG UT75 55-inch', 'FAMILY_LEVEL'], // a family the listings show at 55 inches, with no single model code
    ['Sony X75WL', 'FAMILY_LEVEL'], // not looked up (two Shopping queries), so neither sized nor priced
  ]);
  assert.ok(list.every((entry) => entry.verified === false));
  // The reply's display-class SHORTFALL for "LG UR8000 or UT75" is not attributed to either; their own LED listings settle LED-vs-LED as MEETS (an estimate).
  assert.deepEqual(list.map((entry) => displayRow(response, entry) && [displayRow(response, entry).status, displayRow(response, entry).basis]), [['MEETS', 'AI_ESTIMATE'], ['MEETS', 'AI_ESTIMATE'], ['MEETS', 'AI_ESTIMATE']]);
  assert.deepEqual(sized(replacementPrices(response, 'SUCCESSOR')), [348, 349.99]);
  assert.deepEqual(sized(replacementPrices(response, 'ALT_1')), [379.99, 389]);
  assert.equal(replacementPrices(response).some((item) => [479.99, 248].includes(item.amount.low)), false, 'the 65- and 43-inch listings are not priced');
  assert.equal(response.pricing.valuation.method, 'PROVISIONAL_LISTINGS');
});

// ---- review findings -----------------------------------------------------------------------------------------------------------------------------

test('a hedge after "or" is not a second product, and parts keep their remarks with normal spacing', () => {
  for (const name of ['LG UT75 or newer', 'Sony A80L or equivalent', 'LG C4 or similar', 'LG C4 or better OLED', 'Samsung QN90D or higher']) assert.deepEqual(splitAlternatives(name), [name]);
  assert.deepEqual(splitAlternatives('Samsung (Neo) QN90D or QN85D'), ['Samsung (Neo) QN90D', 'Samsung QN85D']);
  assert.deepEqual(splitAlternatives('LG C4 (2024) or G4 (2024)'), ['LG C4 (2024)', 'LG G4 (2024)']);
});

test('QNED, QLED and NanoCell are read when a series number follows them, so a QNED listing is not mistaken for plain LED', () => {
  assert.equal(displayTypeOf('LG QNED80 Series'), 'QNED');
  assert.equal(displayTypeOf('LG 55" Class QNED80 Series LED 4K UHD Smart TV 55QNED80URA'), 'QNED');
  assert.equal(displayTypeOf('LG 65" NANO75 Series 4K LED TV'), 'NANOCELL');
  assert.equal(displayTypeOf('Samsung 55" Class Q60C QLED 4K'), 'QLED');
  assert.equal(displayTypeOf('Samsung 55" Class Neo QLED QN90D'), 'MINI_LED');
});

test('2020 LG OLED codes (CX, GX, BX, WX) and Samsung LS codes state their size', () => {
  assert.deepEqual(modelCodeSizes('OLED65CXPUA OLED55BXPUA OLED65GXPUA OLED77WXPUA'), [65, 55, 65, 77]);
  assert.deepEqual(modelCodeSizes('Samsung QN55LST7TAFXZA'), [55]);
  assert.deepEqual(modelCodeSizes('Samsung QN90D QN85D'), []);
});

test('the fuller-code rule leaves laptop codes as they were read before', () => {
  assert.equal(skuOf('HP 15-dw3033dx Laptop'), 'DW3033DX');
  assert.equal(skuOf('Acer Nitro 5 AN515-58-57Y8 AN515-58-57Y8-A'), 'AN515-58');
  assert.equal(skuOf('ASUS VivoBook 15 Slim F1502ZA-OS34 Laptop'), 'F1502ZA-OS34');
});

test('re-ranking two looked-up suggestions moves each price, and each diagnostic, with its own candidate', async () => {
  const { rekeyedStats } = await import('../../lib/itemassist-research/enrich/orchestrate.js');
  const short = { name: 'Brand A', why: 'x', tierVsOriginal: 'SAME', comparison: [{ requirementKey: 'resolution', status: 'SHORTFALL' }] };
  const fits = { name: 'Brand B', why: 'y', tierVsOriginal: 'SAME', comparison: [] };
  const screened = (amount) => ({ items: [{ amount }], sizeStated: false, displayTitles: [] });
  const input = { successor: null, suggestions: [short, fits] };
  const arranged = rankShopped(input, [['ALT_1', short, screened(200)], ['ALT_2', fits, screened(300)]], { category: 'tv', profile: 'tv' });
  assert.deepEqual(arranged.input.suggestions.map((entry) => entry.name), ['Brand B', 'Brand A'], 'the candidate without an essential shortfall ranks first');
  assert.deepEqual(arranged.shopped.map(([key, candidate, s]) => [key, candidate.name, s.items[0].amount]), [['ALT_2', 'Brand A', 200], ['ALT_1', 'Brand B', 300]]);
  const stats = rekeyedStats({ calls: 3, listings: { ALT_1: 'serper', ALT_2: 'cache' }, sizeNotStated: { ALT_1: 1, ALT_2: 0 } }, arranged.keys);
  assert.deepEqual(stats, { calls: 3, listings: { ALT_2: 'serper', ALT_1: 'cache' }, sizeNotStated: { ALT_2: 1, ALT_1: 0 } });
});

test('a query whose own sizes disagree prices nothing as sized, even when the model describes one size', async () => {
  const { sizeConflict } = await import('../../lib/itemassist-research/enrich/product-tokens.js');
  assert.equal(sizeConflict('tv', 'Samsung UN55JU6700F 65 inch'), true);
  assert.equal(sizeConflict('tv', 'Samsung UN55JU6700F'), false);
  assert.equal(sizeConflict('tv', 'Samsung JU6700'), false, 'no size stated is not a conflict');
  const route = (text) => { const key = Object.keys(JU6700.listings).find((name) => text.includes(name)); return key ? JU6700.listings[key] : []; };
  const reply = { ...JU6700.reply, original: { ...JU6700.reply.original, characteristics: ['55-inch curved LED panel', '4K UHD'] } };
  const { response, asked } = await run({ query: 'Samsung UN55JU6700F 65 inch', reply, route });
  assert.ok(asked.filter(([kind]) => kind === 'shopping').every(([, text]) => !/\d{2} inch/.test(text)), 'no size is put in the Shopping queries');
  assert.deepEqual(sized(replacementPrices(response)), []);
  assert.ok(candidates(response).every((entry) => !/-inch/.test(entry.name)));
});

test('the size label keeps a remark after a comma and skips a name that already holds a size-led code', () => {
  assert.equal(sizedFamilyName('Samsung S90D, QD-OLED', { category: 'tv', size: 55, screened: PRICED_55 }), 'Samsung S90D 55-inch, QD-OLED');
  assert.equal(sizedFamilyName('Samsung S90D 55-inch, QD-OLED', { category: 'tv', size: 55, screened: PRICED_55 }), 'Samsung S90D 55-inch, QD-OLED');
  assert.equal(sizedFamilyName('Hisense 55U8K', { category: 'tv', size: 55, screened: PRICED_55 }), 'Hisense 55U8K');
});

// ---- sign-off review 1: an estimated shortfall is not a sourced incompatibility ------------------------------------------------------------------

test('an AI-only shortfall is counted apart from a settled one: settled shortfalls rank first, estimates only break the last tie', () => {
  const ai = { name: 'A', tierVsOriginal: 'SAME', comparison: [{ requirementKey: 'displayClass', status: 'SHORTFALL', basis: 'AI_ESTIMATE' }] };
  const settledRows = withSettledDisplayClass([{ requirementKey: 'displayClass', status: 'MEETS', basis: 'AI_ESTIMATE' }], 'LED', 'OLED');
  const settled = { name: 'B', tierVsOriginal: 'SAME', comparison: settledRows };
  assert.deepEqual([rankingFacts(ai, null, 'tv').shortfalls, rankingFacts(ai, null, 'tv').estimated], [0, 1]);
  assert.deepEqual([rankingFacts(settled, null, 'tv').shortfalls, rankingFacts(settled, null, 'tv').estimated], [1, 0], 'OLED for an LED original is read from the name');
  assert.equal(rankingFacts({ name: 'C', comparison: [] }, { capacity: { concern: 'Listings show 26 cu ft.' } }, 'refrigerator').shortfalls, 1, 'a capacity its listings show is short');
  const facts = (over) => ({ shortfalls: 0, tier: 0, generation: null, model: 0, price: 0, estimated: 0, ...over });
  assert.ok(compareFacts(facts({ estimated: 1, model: 2 }), facts({ estimated: 0 })) < 0, 'sourced model evidence outranks an estimated shortfall');
  assert.ok(compareFacts(facts({ estimated: 1, price: 2 }), facts({ estimated: 0 })) < 0, 'sourced price evidence outranks an estimated shortfall');
  assert.ok(compareFacts(facts({ estimated: 1 }), facts({ shortfalls: 1 })) < 0, 'an estimate never ranks below a settled shortfall');
  assert.ok(compareFacts(facts({ estimated: 0 }), facts({ estimated: 1 })) < 0, 'with everything else equal, the estimate orders them');
});

test('an AI-only shortfall does not drop a suggestion before it is looked up, and still keeps it out of the valuation', async () => {
  const reply = tvReply('Samsung S90D QD-OLED', {
    suggestions: [
      { name: 'Samsung S90D QD-OLED', why: 'Comparable panel.', confidence: 'medium', tierVsOriginal: 'SAME', comparison: [{ requirementKey: 'resolution', status: 'SHORTFALL' }] },
      { name: 'Sony Bravia 8 OLED', why: 'Similar tier.', confidence: 'medium', tierVsOriginal: 'SAME', comparison: [] },
      { name: 'Panasonic Z95', why: 'A third.', confidence: 'low', tierVsOriginal: 'SAME', comparison: [] },
    ],
  });
  assert.deepEqual(normalizeIdentification(reply, 'LG C3 55-inch TV').input.suggestions.map((entry) => entry.name), ['Samsung S90D QD-OLED', 'Sony Bravia 8 OLED']);
  const rows = { Samsung: [{ title: 'Samsung 55" Class S90D OLED 4K Smart TV', seller: 'Best Buy', price: 1299 }, { title: 'Samsung 55 inch S90D OLED 4K TV', seller: 'Abt', price: 1349 }] };
  const { response } = await run({ query: 'LG C3 55-inch TV', reply, route: (text) => rows[Object.keys(rows).find((key) => text.startsWith(key))] || [] });
  const samsung = response.suggestions.find((entry) => /S90D/.test(entry.name));
  const key = `ALT_${response.suggestions.indexOf(samsung) + 1}`;
  assert.deepEqual(response.pricing.valuation.excluded.find((entry) => entry.candidate === key), { candidate: key, reason: 'SUSPECTED_ESSENTIAL_SHORTFALL' }, 'the pricing safeguard is unchanged');
});

// ---- sign-off review 2: a product family never becomes an exact model --------------------------------------------------------------------------

test('a listing code that is only the series the candidate is named by is the family, not a model', async () => {
  const { isFamilySeriesCode } = await import('../../lib/itemassist-research/enrich/config.js');
  assert.equal(isFamilySeriesCode('UR8000', 'LG UR8000'), true);
  assert.equal(isFamilySeriesCode('DU7200', 'Samsung Crystal UHD DU7200'), true);
  assert.equal(isFamilySeriesCode('55UR8000AUA', 'LG UR8000'), false, 'a code with a size is a model');
  assert.equal(isFamilySeriesCode('KD55X75WL', 'Sony KD55X75WL'), false, 'an exact model the candidate names keeps its code');
  assert.equal(isFamilySeriesCode('55U8K', 'Hisense 55U8K'), false);
  assert.equal(isFamilySeriesCode('UT7570', 'LG UT75'), false, 'a code the name does not contain');
});

test('"UR8000 Series" at two retailers with no full code does not make the LG UR8000 a listed model', async () => {
  const listings = { UR8000: [
    { title: 'LG 55" Class UR8000 Series LED 4K UHD Smart webOS TV', seller: 'Best Buy', price: 349.99 },
    { title: 'LG 55 inch UR8000 Series 4K UHD LED Smart TV', seller: 'Walmart', price: 348 },
  ], UT75: JU6700.listings.UT75 };
  const route = (text) => listings[Object.keys(listings).find((name) => text.includes(name))] || [];
  const { response } = await run({ query: JU6700.query, reply: JU6700.reply, route });
  const lg = response.successor;
  assert.match(lg.name, /^LG UR8000\b/);
  assert.notEqual(lg.modelStatus, 'LISTED_PROVISIONAL');
  assert.notEqual(lg.modelStatus, 'VERIFIED_LISTING');
  assert.equal(lg.verified, false);
  assert.equal(replacementPrices(response).some((item) => item.model === 'UR8000'), false, 'no price is presented as the "UR8000" model');
  assert.equal(response.pricing.evidence.some((entry) => entry.subjectModel === 'UR8000'), false);
});

// ---- sign-off review 3: replacement priority is not manufacturer lineage -----------------------------------------------------------------------

const lgOriginal = (successor, suggestions = []) => ({
  ...tvReply('x'), successor: { name: successor, why: 'Continues the line.', differences: null, concern: null, confidence: 'high', tierVsOriginal: 'SAME', comparison: [] }, suggestions,
});

test('the successor slot keeps the original maker\'s product from the reply, in the reply\'s order, never the best-ranked one', () => {
  const first = normalizeIdentification(lgOriginal('LG C4 or Sony Bravia 8'), 'LG C3 55-inch TV').input;
  assert.equal(first.successor.name, 'LG C4');
  assert.deepEqual(first.suggestions.map((entry) => entry.name), ['Sony Bravia 8']);
  assert.equal('standing' in first.suggestions[0], false, 'a part moved to the suggestions is not given the successor\'s standing');
  const reversed = normalizeIdentification(lgOriginal('Sony Bravia 8 or LG C4'), 'LG C3 55-inch TV').input;
  assert.equal(reversed.successor.name, 'LG C4', 'another maker named first is not made the LG successor');
  const lower = { ...lgOriginal('LG B4 OLED or LG C4 OLED'), successor: { ...lgOriginal('x').successor, name: 'LG B4 OLED or LG C4 OLED', tierVsOriginal: 'LOWER' } };
  assert.equal(normalizeIdentification(lower, 'LG C3 55-inch TV').input.successor.name, 'LG B4 OLED', 'among the maker\'s own parts, the reply\'s order decides, not the ranking');
});

test('ranking after the lookups never moves a better-evidenced suggestion into the successor slot', () => {
  const successor = { name: 'LG C-series OLED', why: 'Continues the line.', tierVsOriginal: 'LOWER', standing: 'CONDITIONAL', comparison: [] };
  const rival = { name: 'Sony Bravia 8 OLED', why: 'Similar tier.', tierVsOriginal: 'SAME', comparison: [] };
  const screenedWith = (over) => ({ items: [], context: [], displayTitles: [], ...over });
  const input = { successor, suggestions: [rival] };
  const arranged = rankShopped(input, [['SUCCESSOR', successor, screenedWith({})], ['ALT_1', rival, screenedWith({ sku: 'K55XR80', items: [{ amount: 1 }] })]], { category: 'tv', profile: 'tv' });
  assert.equal(arranged.input.successor.name, 'LG C-series OLED');
  assert.deepEqual(arranged.shopped.map(([key, candidate]) => [key, candidate.name]), [['SUCCESSOR', 'LG C-series OLED'], ['ALT_1', 'Sony Bravia 8 OLED']]);
});

test('a cross-brand successor named by the reply is labelled by its lineage as another brand, never as the same series', async () => {
  const route = (text) => { const key = Object.keys(JU6700.listings).find((name) => text.includes(name)); return key ? JU6700.listings[key] : []; };
  const { response } = await run({ query: JU6700.query, reply: JU6700.reply, route });
  assert.equal(response.successor.lineage.relation, 'OTHER_BRAND', 'an LG television for a Samsung original');
  assert.notEqual(response.successor.standing, 'RECOMMENDED');
});
