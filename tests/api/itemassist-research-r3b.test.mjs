import test from 'node:test';
import assert from 'node:assert/strict';
import { researchLiveV2 } from '../../lib/itemassist-research/enrich/orchestrate.js';
import { buildIdentifyPrompt, normalizeIdentification } from '../../lib/itemassist-research/enrich/identify.js';
import { buildResearchResponseV2, isValidResearchResponseV2 } from '../../lib/itemassist-research/contract-v2.js';
import { LG_UHD_YEAR, SAMSUNG_UHD_YEAR, SONY_TV_YEAR, presentedName, resolveLineage, tvGrammarFor } from '../../lib/itemassist-research/enrich/lineage.js';
import { skuOf } from '../../lib/itemassist-research/enrich/config.js';

// OFFLINE ONLY. Release 3b: model-year grammars for Samsung UHD / Crystal UHD, LG UHD (LED/LCD) and Sony, sourced year letters only (see
// docs/itemassist-research-lineage.md, "Model-year rules (Release 3b)"). Titles are written the way US retailers title listings; the Sony case is SYNTHETIC
// (no Sony X-series capture exists). No provider, key or network is touched.
const NOW = Date.UTC(2026, 10, 16, 15);
const lineageFor = (query, candidateName, identity = '') => resolveLineage({ category: 'tv', query, identity, candidateName, now: NOW });
const read = (lineage, title) => { const parsed = lineage.parse(title); return parsed && [parsed.series, parsed.ordinal, parsed.label, parsed.size, parsed.sku]; };

test('the year tables hold exactly the letters a source dates, and nothing extrapolated', () => {
  assert.deepEqual(SAMSUNG_UHD_YEAR, { J: 2015, M: 2017, N: 2018, R: 2019, T: 2020, A: 2021, B: 2022, C: 2023, D: 2024 }, 'K (2016) has no model-specific source');
  assert.deepEqual(LG_UHD_YEAR, { N: 2020, P: 2021, Q: 2022, R: 2023, T: 2024, A: 2025 });
  assert.deepEqual(SONY_TV_YEAR, { H: 2020, J: 2021, K: 2022, L: 2023 });
  for (const table of [SAMSUNG_UHD_YEAR, LG_UHD_YEAR, SONY_TV_YEAR]) assert.ok(Object.isFrozen(table));
});

test('Samsung UHD / Crystal UHD: the letter before "U" (to 2024) and the letter after the number (2025 on) date a code; an unsourced letter dates nothing', () => {
  const lineage = lineageFor('Samsung UN55JU6700F', 'Samsung Crystal UHD U8000');
  assert.equal(lineage.grammar.id, 'samsung-uhd');
  assert.deepEqual(lineage.original && [lineage.original.label, lineage.original.ordinal], ['JU6700', 2015]);
  assert.deepEqual(read(lineage, 'Samsung 55" Class U8000F Crystal UHD 4K Smart TV UN55U8000FFXZA'), ['8000', 2025, 'U8000F', 55, 'UN55U8000FFXZA']);
  assert.deepEqual(read(lineage, 'Samsung 55" Class DU8000 Crystal UHD UN55DU8000FXZA'), ['8000', 2024, 'DU8000', 55, 'UN55DU8000FXZA']);
  assert.deepEqual(read(lineage, 'Samsung 55" Class CU8000 Crystal UHD 4K Smart TV'), ['8000', 2023, 'CU8000', null, null]);
  assert.equal(read(lineage, 'Samsung 55 inch KU6300 4K UN55KU6300FXZA'), null, 'K is not dated by any source');
  assert.equal(read(lineage, 'Samsung 55" Class U8000H Crystal UHD UN55U8000HFXZA'), null, 'H has no model-specific source in this shape');
  assert.equal(read(lineage, 'Samsung 55" Class Q60D QLED QN55Q60DAFXZA'), null, 'a QLED code is not a Crystal UHD generation');
  assert.equal(lineageFor('Samsung QN65S90C', 'Samsung S90-series OLED').grammar.id, 'samsung-tv', 'the S/Q grammar still reads S/Q names');
});

test('LG UHD (LED/LCD): the letter after "U" dates a code; the OLED grammar still reads OLED names', () => {
  const lineage = lineageFor('LG 55UR8000AUA', 'LG UT75');
  assert.equal(lineage.grammar.id, 'lg-uhd');
  assert.deepEqual(read(lineage, 'LG 55" Class UT75 Series LED 4K UHD Smart webOS TV 55UT7570PUB'), ['75', 2024, 'UT7570', 55, '55UT7570PUB']);
  assert.deepEqual(read(lineage, 'LG 55" Class UQ7570 PUJ Series 55UQ7570PUJ'), ['75', 2022, 'UQ7570', 55, '55UQ7570PUJ']);
  assert.deepEqual(read(lineage, 'LG 75 Inch Class UHD AI UA77 4K Smart TV 75UA7700PUA'), ['77', 2025, 'UA7700', 75, '75UA7700PUA']);
  assert.equal(read(lineage, 'LG 55" UM7300 Series 4K 55UM7300PUA'), null, 'M (2019) is not dated here');
  assert.equal(read(lineage, 'LG 65" NANO75 Series 4K 65NANO75UPA'), null, 'NanoCell is not read by this grammar');
  assert.equal(lineageFor('LG C3 55 inch', 'LG C-series OLED').grammar.id, 'lg-oled');
  assert.equal(tvGrammarFor('lg', 'LG UR8000').id, 'lg-uhd');
  assert.equal(tvGrammarFor('lg').id, 'lg-oled', 'without text, the maker\'s first grammar as before');
});

test('Sony: the last letter of an X or A series code dates it; the "W" two-letter suffix and the 2024-on K- names are unknown', () => {
  const lineage = lineageFor('Sony KD-55X80J', 'Sony X80-series');
  assert.equal(lineage.grammar.id, 'sony-tv');
  assert.deepEqual(lineage.original && [lineage.original.label, lineage.original.ordinal], ['X80J', 2021]);
  assert.deepEqual(read(lineage, 'Sony 55" Class X80K 4K HDR LED Google TV KD-55X80K'), ['X80', 2022, 'X80K', 55, 'KD55X80K']);
  assert.deepEqual(read(lineage, 'Sony BRAVIA 55 inch X80L 4K LED Google TV KD55X80L'), ['X80', 2023, 'X80L', 55, 'KD55X80L']);
  assert.deepEqual(read(lineage, 'Sony 55" X7500H 4K TV KD-55X7500H'), ['X75', 2020, 'X7500H', 55, 'KD55X7500H']);
  assert.equal(read(lineage, 'Sony 55" Class X75WL 4K LED Google TV KD-55X75WL'), null, 'Sony\'s own pages date the X75WL differently');
  assert.equal(read(lineage, 'Sony 55" BRAVIA 3 4K HDR LED Google TV K-55S30'), null);
  assert.equal(lineageFor('Sony KD-55X80J', 'Sony Bravia 8 OLED'), null, 'a 2024-on BRAVIA name has no generation grammar and stays a family');
  assert.equal(presentedName('Sony X80-series', lineage, 'X80L', { size: 55, sku: 'KD55X80L' }), 'Sony X80L 55-inch (KD55X80L)');
});

test('a listing that states both a series designation and a full code keeps the full code', () => {
  assert.equal(skuOf('LG 55" UR8000-Series 4K UHD 55UR8000AUA'), '55UR8000AUA');
  assert.equal(skuOf('LG 55" Class UR8000 Series LED 4K UHD 55UR8000AUA'), '55UR8000AUA');
  assert.equal(skuOf('LG 55" Class UR8000-Series LED 4K'), 'UR8000-SERIES', 'with no full code, the series token is still read (and treated as the family)');
});

test('the identification prompt asks for one series per candidate, the original\'s size, recent US series and no other maker as successor', () => {
  const prompt = buildIdentifyPrompt('Samsung UN55JU6700F');
  assert.match(prompt, /never "A or B" in a name/);
  assert.match(prompt, /Keep the original's screen size/);
  assert.match(prompt, /recent model years over discontinued ones, but never at the cost of an essential specification or the original's market tier/);
  assert.match(prompt, /never another maker's/);
  assert.match(prompt, /Never write an exact model code/);
  assert.match(prompt, /Never say anything is current, in stock or available/);
  assert.ok(prompt.length < 5200, `prompt is ${prompt.length} characters`);
});

// ---- the live pipeline, offline (SYNTHETIC Sony rows) -----------------------------------------------------------------------------------------------

const SONY_ROWS = [
  { title: 'Sony 55" Class X80K 4K HDR LED Google TV KD-55X80K', seller: 'Best Buy', price: 599.99 },
  { title: 'Sony 55 inch X80K 4K LED Google TV KD55X80K', seller: 'Walmart', price: 579 },
  { title: 'Sony 55" Class X80L 4K HDR LED Google TV KD-55X80L', seller: 'Best Buy', price: 649.99 },
  { title: 'Sony BRAVIA 55 inch X80L 4K LED Google TV KD55X80L', seller: 'Crutchfield', price: 629 },
  { title: 'Sony 65" Class X80L 4K HDR LED Google TV KD-65X80L', seller: 'Target', price: 799.99 },
  { title: 'Sony 55" Class X75WL 4K LED Google TV KD-55X75WL', seller: 'Walmart', price: 448 },
];
const sonyReply = {
  category: 'tv', profile: 'tv', tier: 'STANDARD', requirements: [], clarify: [],
  original: { identity: 'Sony X80J 55-inch 4K LED TV (2021)', confidence: 'high', characteristics: ['55-inch LED', '4K'], uncertainty: null },
  successor: { name: 'Sony X80-series', why: 'Continues the line.', differences: null, concern: null, confidence: 'high', tierVsOriginal: 'SAME', comparison: [] },
  suggestions: [{ name: 'LG UT75', why: 'Comparable.', differences: null, concern: null, confidence: 'medium', tierVsOriginal: 'SAME', comparison: [] }],
  estimates: { originalNew: { low: 500, high: 900 }, replacementNew: { low: 400, high: 800 } },
};

test('Sony KD-55X80J (SYNTHETIC rows): the newest dated generation at 55 inches is named by its exact code; other generations, sizes and the undated X75WL are not priced; no extra provider call', async () => {
  const asked = [];
  const result = await researchLiveV2('Sony KD-55X80J', {
    env: { SERPER_API_KEY: 'offline-key' }, now: () => NOW,
    identify: async (text) => ({ ok: true, ...normalizeIdentification(sonyReply, text), meta: { requestSent: true, usage: {}, httpStatus: 200 } }),
    serper: async ({ kind, query }) => { asked.push(kind); return kind === 'search' ? [] : (/^Sony/.test(query) ? SONY_ROWS : []); },
    serperBudget: { reserve: async (credits) => ({ allowed: true, status: 'allowed', credits }) }, enrichCache: null, enrich: true,
  });
  const response = buildResearchResponseV2(result.input, { requestId: 'offline', elapsedMs: 1, answerSource: 'AI_ESTIMATE', now: NOW });
  assert.equal(isValidResearchResponseV2(response), true);
  assert.deepEqual(asked, ['search', 'shopping', 'shopping'], 'one search and two Shopping queries, as before');
  assert.equal(response.successor.name, 'Sony X80L 55-inch (KD55X80L)');
  assert.equal(response.successor.modelStatus, 'LISTED_PROVISIONAL');
  assert.equal(response.successor.verified, false);
  assert.deepEqual(response.successor.lineage, { relation: 'SAME_SERIES_NEWER', generation: 'X80L', basis: 'LISTINGS', tier: 'SAME' });
  const priced = response.pricing.prices.filter((item) => item.candidate === 'SUCCESSOR' && item.kind === 'CURRENT_RETAIL_NEW');
  assert.deepEqual(priced.map((item) => item.amount.low).sort((a, b) => a - b), [629, 649.99], 'only the 55-inch X80L listings');
  assert.equal(priced.some((item) => [599.99, 579, 799.99, 448].includes(item.amount.low)), false, 'not the X80K, the 65-inch X80L or the X75WL');
});

// ---- review findings (Release 3b) ------------------------------------------------------------------------------------------------------------------

/** The live pipeline with one successor and Shopping rows for every query; returns the response and the queries asked. */
async function runOne(query, identity, successor, rows) {
  const reply = { ...sonyReply, original: { ...sonyReply.original, identity }, successor: { ...sonyReply.successor, name: successor }, suggestions: [] };
  const asked = [];
  const result = await researchLiveV2(query, {
    env: { SERPER_API_KEY: 'offline-key' }, now: () => NOW,
    identify: async (text) => ({ ok: true, ...normalizeIdentification(reply, text), meta: { requestSent: true, usage: {}, httpStatus: 200 } }),
    serper: async ({ kind, query: text }) => { asked.push([kind, text]); return kind === 'search' ? [] : rows; },
    serperBudget: { reserve: async (credits) => ({ allowed: true, status: 'allowed', credits }) }, enrichCache: null, enrich: true,
  });
  const response = buildResearchResponseV2(result.input, { requestId: 'offline', elapsedMs: 1, answerSource: 'AI_ESTIMATE', now: NOW });
  assert.equal(isValidResearchResponseV2(response), true);
  const prices = response.pricing.prices.filter((item) => item.candidate === 'SUCCESSOR' && item.kind === 'CURRENT_RETAIL_NEW').map((item) => item.amount.low).sort((a, b) => a - b);
  return { response, asked, prices };
}

test('a generation the model named does not pin the answer: "Sony X80K" finds the newer X80L, and the Shopping query keeps the name as given', async () => {
  const rows = SONY_ROWS.filter((row) => /X80/.test(row.title));
  const { response, asked, prices } = await runOne('Sony KD-55X80J', 'Sony X80J 55-inch 4K LED TV (2021)', 'Sony X80K', rows);
  assert.deepEqual(asked.map(([, text]) => text), ['Sony KD-55X80J launch price MSRP', 'Sony X80K 55 inch TV']);
  assert.equal(response.successor.name, 'Sony X80L 55-inch (KD55X80L)');
  assert.deepEqual(prices, [629, 649.99]);
});

test('Samsung Crystal UHD: the newest dated generation at the size is named; a listing of the series whose year cannot be read is noted, never priced', async () => {
  const rows = [
    { title: 'Samsung 55" Class DU8000 Crystal UHD UN55DU8000FXZA', seller: 'Best Buy', price: 429.99 },
    { title: 'Samsung 55 inch DU8000 Crystal UHD UN55DU8000FXZA', seller: 'Walmart', price: 419 },
    { title: 'Samsung 55" Class U8000F Crystal UHD UN55U8000FFXZA', seller: 'Best Buy', price: 349.99 },
    { title: 'Samsung 55 inch U8000F Crystal UHD UN55U8000FFXZA', seller: 'Target', price: 359.99 },
    { title: 'Samsung 65" Class U8000F Crystal UHD UN65U8000FFXZA', seller: 'Walmart', price: 479.99 },
    { title: 'Samsung 55" Class U8000H Crystal UHD UN55U8000HFXZA', seller: 'Best Buy', price: 399.99 },
  ];
  const { response, prices } = await runOne('Samsung UN55JU6700F', 'Samsung JU6700 55-inch 4K LED TV (2015)', 'Samsung Crystal UHD DU8000', rows);
  assert.equal(response.successor.name, 'Samsung Crystal UHD U8000F 55-inch (UN55U8000FFXZA)');
  assert.equal(response.successor.modelStatus, 'LISTED_PROVISIONAL');
  assert.deepEqual(prices, [349.99, 359.99], 'not the 2024 DU8000, the 65-inch U8000F or the undated U8000H');
  assert.match(response.successor.concern, /model year that could not be confirmed; they are not priced, and a newer model may exist/);
});

test('LG UHD: a "-series" name becomes the generation the listings state, labelled by its full code whatever the listing order', async () => {
  const rows = [
    { title: 'LG 55" Class UT8000 Series LED 4K UHD Smart webOS TV', seller: 'Abt', price: 409 },
    { title: 'LG 55" Class UT8000 Series LED 4K 55UT8000AUA', seller: 'Best Buy', price: 399.99 },
    { title: 'LG 55 inch UT8000 4K TV 55UT8000AUA', seller: 'Walmart', price: 389 },
    { title: 'LG 55" Class UR8000 Series 55UR8000AUA', seller: 'Target', price: 349.99 },
  ];
  const { response, prices } = await runOne('LG 55UN7300PUF', 'LG UN7300 55-inch 4K LED TV (2020)', 'LG UR8000-series', rows);
  assert.equal(response.successor.name, 'LG UT8000 55-inch (55UT8000AUA)');
  assert.deepEqual(prices, [389, 399.99]);
  assert.equal(presentedName('LG UR8000-series', lineageFor('LG 55UN7300PUF', 'LG UR8000-series'), 'UT8000', { size: 55 }), 'LG UT8000 55-inch');
});

test('codes that must not be read by the new grammars, and codes that must', () => {
  const lg = lineageFor('LG 55UN7300PUF', 'LG UR8000');
  assert.deepEqual(read(lg, 'LG 55" UN7300 Series 4K 55UN7300PUC'), ['73', 2020, 'UN7300', 55, '55UN7300PUC'], 'LG\'s 2020 "UN" is not Samsung\'s UN prefix');
  assert.equal(read(lg, 'LG 65" QNED80 Series 65QNED80URA'), null);
  const samsung = lineageFor('Samsung UN55JU6700F', 'Samsung Crystal UHD U8000');
  assert.equal(read(samsung, 'Samsung HW-Q600C 3.1.2ch Soundbar'), null);
  assert.equal(read(samsung, 'Samsung 55" Neo QLED QN90D QN55QN90DAFXZA'), null);
  const sony = lineageFor('Sony XR-65A80J', 'Sony A80-series');
  assert.deepEqual(read(sony, 'Sony 65" BRAVIA XR A80L OLED XR-65A80L'), ['A80', 2023, 'A80L', 65, 'XR65A80L']);
  assert.deepEqual(read(sony, 'Sony 65" A80K OLED XR65A80K'), ['A80', 2022, 'A80K', 65, 'XR65A80K']);
  assert.equal(read(sony, 'Sony 65" BRAVIA 8 OLED K-65XR80'), null);
  assert.equal(lineageFor('LG C3 55 inch', 'LG C4 OLED').grammar.id, 'lg-oled');
  assert.equal(lineageFor('LG C3 55 inch', 'LG UT75').grammar.id, 'lg-uhd', 'one maker, two schemes: the one that reads the name');
});

test('outside televisions, a series designation also gives way to a full code the title states (Release 3b, intentional)', () => {
  assert.equal(skuOf('Whirlpool WRF555-Series French Door Refrigerator WRF555SDFZ'), 'WRF555SDFZ');
  assert.equal(skuOf('KitchenAid KRFF300-Series Refrigerator KRFF300ESS'), 'KRFF300ESS');
  assert.equal(skuOf('Whirlpool WRF555-Series French Door Refrigerator'), 'WRF555-SERIES', 'no full code: unchanged');
  assert.equal(skuOf('HP 15-dw3033dx Laptop'), 'DW3033DX', 'laptop codes read as before');
});
