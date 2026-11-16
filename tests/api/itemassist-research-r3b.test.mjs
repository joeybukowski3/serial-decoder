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
