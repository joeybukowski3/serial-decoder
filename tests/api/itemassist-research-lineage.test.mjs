import test from 'node:test';
import assert from 'node:assert/strict';
import { researchLiveV2 } from '../../lib/itemassist-research/enrich/orchestrate.js';
import { normalizeIdentification } from '../../lib/itemassist-research/enrich/identify.js';
import { buildResearchResponseV2, isValidResearchResponseV2, normalizeLineage } from '../../lib/itemassist-research/contract-v2.js';
import { RESEARCH_CACHE_PREFIX, researchCacheKey } from '../../lib/itemassist-research/cache.js';
import { generalisedName, resolveLineage } from '../../lib/itemassist-research/enrich/lineage.js';
import { S1_ROWS } from '../helpers/itemassist-research-fakes.mjs';

// OFFLINE ONLY. Successor-generation discovery: which generation of a series is presented, from what retailer listings state, never from the model's
// memory. The captured S1 rows (real Serper results, 2026-10-23) are used where they hold the case; the rest are minimal synthetic rows, each titled the way
// a retailer titles a listing. No provider, key or network is touched.
const NOW = Date.UTC(2026, 10, 11, 15);
const QUERY = 'LG C3 55-inch TV';

const identification = (successor, over = {}) => ({
  category: 'tv', profile: 'tv',
  original: { identity: 'LG C3 series 55-inch 4K OLED evo smart TV (2023)', confidence: 'high', characteristics: ['55-inch OLED', '4K', '120 Hz'], uncertainty: null },
  tier: 'PREMIUM', requirements: [],
  successor: { name: successor, why: 'Continues the same OLED line.', differences: 'Newer processor.', concern: null, confidence: 'high', tierVsOriginal: 'SAME', comparison: [] },
  suggestions: [{ name: 'Sony Bravia 8 OLED', why: 'Similar premium class.', differences: 'Different processing.', concern: null, confidence: 'medium', tierVsOriginal: 'HIGHER', comparison: [] }],
  estimates: { originalNew: { low: 1500, high: 2000 }, replacementNew: { low: 1200, high: 1800 } }, clarify: [], ...over,
});

/** The engine's live pipeline over `rows`, with the model's reply mocked. Returns the engine input, the built research.2 response and what was asked of Serper. */
async function run({ query = QUERY, reply = identification('LG C-series OLED'), rows, history = [], only = /^(LG|Samsung)/ } = {}) {
  const asked = [];
  const result = await researchLiveV2(query, {
    env: { SERPER_API_KEY: 'offline-key' }, now: () => NOW,
    identify: async (text) => ({ ok: true, ...normalizeIdentification(reply, text), meta: { requestSent: true, usage: {}, httpStatus: 200 } }),
    serper: async ({ kind, query: text }) => { asked.push([kind, text]); return kind === 'search' ? history : (only.test(text) ? rows : []); },
    serperBudget: { reserve: async (credits) => ({ allowed: true, status: 'allowed', credits }) }, enrichCache: null, enrich: true,
  });
  const response = buildResearchResponseV2(result.input, { requestId: 'offline', elapsedMs: 1, answerSource: 'AI_ESTIMATE', now: NOW });
  assert.equal(isValidResearchResponseV2(response), true, 'every response passes the validator that re-derives each typed block');
  return { result, response, asked, stats: result.meta.enrichment };
}

const lg = (gen, size, code, seller, price, tail = '') => ({ title: `LG ${size}" Class OLED evo AI ${gen} 4K Smart TV${code ? ` ${code}` : ''}${tail}`, seller, price });
const current = (response, candidate = 'SUCCESSOR') => response.pricing.prices.filter((item) => item.kind === 'CURRENT_RETAIL_NEW' && item.candidate === candidate && item.sizeConfirmed !== false);
const amounts = (list) => list.map((item) => item.amount.low).sort((a, b) => a - b);

// ---- 1. LG C3 55-inch resolves to a supported LG C6 55-inch candidate -----------------------------------------------------------------------------

test('1. LG C3 55-inch resolves to the C6 55-inch (OLED55C6PUA) from the captured Shopping rows, as a provisional listing, never a confirmed or recommended model', async () => {
  const { response, asked, stats } = await run({ rows: S1_ROWS.listings['lg-c3-55'].rows, history: S1_ROWS.history['lg-c3-55'] });
  // The model named a family with no generation; the listings decide the generation.
  assert.deepEqual(asked.filter(([kind]) => kind === 'shopping').map(([, text]) => text), ['LG C-series OLED 55 inch TV', 'Sony Bravia 8 OLED 55 inch TV']);
  assert.equal(response.successor.name, 'LG C6 OLED 55-inch (OLED55C6PUA)');
  assert.deepEqual(response.successor.lineage, { relation: 'SAME_SERIES_NEWER', generation: 'C6', basis: 'LISTINGS', tier: 'SAME' });
  // (The C4 appears only in an unsized listing from an unlisted seller: no evidence about the requested size, so it is not counted as seen.)
  assert.deepEqual(stats.generations.SUCCESSOR, { chosen: 'C6', newest: 'C6', skipped: null, seen: ['C6', 'C5'] });
  assert.deepEqual([response.successor.modelStatus, response.successor.standing, response.successor.verified], ['LISTED_PROVISIONAL', 'CONDITIONAL', false]);
  const prices = current(response);
  assert.deepEqual(prices.map((item) => [item.amount.low, item.model, item.verification]), [[999.99, 'OLED55C6PUA', 'SEARCH_LISTING']]);
  assert.equal(response.pricing.evidence[0].modelRelation, 'EXACT');
  assert.equal(response.pricing.valuation.method, 'PROVISIONAL_LISTINGS');
  assert.equal(response.pricing.valuation.verified, false);
});

// ---- 2. C4 / C5 / C6 listings stay separated -------------------------------------------------------------------------------------------------------

test('2. C4, C5 and C6 listings are never combined into one price: only the presented generation sets the range', async () => {
  const rows = [
    lg('C4', 55, 'OLED55C4PUA', 'Best Buy', 1000), lg('C5', 55, 'OLED55C5PUA', 'Abt', 1100), lg('C5', 55, 'OLED55C5PUA', 'Target', 1150),
    lg('C6', 55, 'OLED55C6PUA', 'Walmart', 1200), lg('C6', 55, 'OLED55C6PUA', 'Newegg.com', 1260),
    lg('C3', 55, 'OLED55C3PUA', 'Best Buy', 900), lg('C2', 55, 'OLED55C2PUA', 'Abt', 800),
  ];
  const { response, stats } = await run({ rows });
  assert.deepEqual(stats.generations.SUCCESSOR.seen, ['C6', 'C5', 'C4'], 'C3 is the original and C2 is older: neither is offered');
  assert.deepEqual(amounts(current(response)), [1200, 1260], 'only C6 listings');
  // (The original's own C3 listing is shown as the original's context price; it is never a replacement price.)
  const replacement = JSON.stringify(response.pricing.prices.filter((item) => item.subject === 'REPLACEMENT'));
  for (const other of ['1000', '1100', '1150', '900', '800']) assert.equal(replacement.includes(`"low":${other},`), false, `${other} belongs to another generation`);
  assert.deepEqual(response.pricing.valuation.range, { currency: 'USD', low: 1200, high: 1260 });
  assert.deepEqual(response.pricing.evidence.filter((entry) => entry.subject === 'SUCCESSOR').map((entry) => [entry.sourceName, entry.modelRelation]), [['Walmart', 'EXACT'], ['Newegg', 'EXACT']]);
  assert.equal(response.pricing.evidence.some((entry) => entry.subject === 'ORIGINAL'), true, 'the C3 listing of the original stays apart, as context for the original');
});

// ---- 3. a 65-inch listing cannot validate a 55-inch price ------------------------------------------------------------------------------------------

test('3. a 65-inch C6 listing cannot validate a 55-inch price, whether the title says 65 or contradicts its own model code', async () => {
  const rows = [
    lg('C6', 65, 'OLED65C6PUA', 'Best Buy', 1899),
    lg('C6', 55, 'OLED65C6PUA', 'Target', 1600),          // says 55 inch, but its own model code is the 65
    lg('C5', 55, 'OLED55C5PUA', 'Abt', 1100),
  ];
  const { response, stats } = await run({ rows });
  const text = JSON.stringify(response.pricing);
  assert.equal(text.includes('1899') || text.includes('1600'), false, 'no price rests on a listing of another size');
  assert.equal(stats.generations.SUCCESSOR.chosen, 'C5', 'the C6 has no 55-inch listing, so the earlier generation is presented');
  assert.equal(stats.generations.SUCCESSOR.skipped, 'SIZE');
  assert.match(response.successor.concern, /newer generation \(C6\) was seen in listings, but not in the requested 55-inch size/);
  assert.equal(response.successor.lineage.relation, 'SAME_SERIES_OLDER');
});

// ---- 4. missing SKU evidence keeps the family-level status -----------------------------------------------------------------------------------------

test('4. listings that state the generation but no model code price the generation, with no model identity invented', async () => {
  const rows = [lg('C6', 55, '', 'Best Buy', 1199.99), lg('C6', 55, '', 'Abt', 1219.99)];
  const { response } = await run({ rows });
  assert.equal(response.successor.name, 'LG C6 OLED 55-inch', 'no code in the name: none was stated');
  assert.equal(response.successor.modelStatus, 'FAMILY_LEVEL');
  assert.deepEqual(current(response).map((item) => item.model), [null, null]);
  assert.equal(response.successor.lineage.generation, 'C6');
  assert.equal(response.pricing.evidence.every((entry) => entry.modelRelation === 'UNKNOWN'), true);
});

// ---- 5. an older generation is selected when the newest fails a material requirement ---------------------------------------------------------------

test('5. a newer generation whose listings fail an essential requirement is not forced: the earlier generation is presented, with the reason stated', async () => {
  const rows = [
    { title: 'LG 55" OLED evo C6 Smart TV Full HD 1080p OLED55C6PUA', seller: 'Best Buy', price: 899 },
    lg('C5', 55, 'OLED55C5PUA', 'Abt', 1100),
  ];
  const { response, stats } = await run({ rows });
  assert.equal(stats.generations.SUCCESSOR.chosen, 'C5');
  assert.equal(stats.generations.SUCCESSOR.skipped, 'ESSENTIAL');
  assert.match(response.successor.concern, /newer generation \(C6\) was seen, but its listings did not meet an essential requirement/);
  assert.deepEqual(amounts(current(response)), [1100]);
  assert.equal(JSON.stringify(response.pricing).includes('899'), false);
});

// ---- 6. the AI's stale (or invented) generation does not override stronger current evidence --------------------------------------------------------

test('6. the model naming an older or a non-existent generation does not override what listings state', async () => {
  const rows = [lg('C4', 55, 'OLED55C4PUA', 'Best Buy', 1000), lg('C6', 55, 'OLED55C6PUA', 'Walmart', 1200)];
  for (const named of ['LG C4 OLED', 'LG C7 OLED', 'LG C5 OLED, current generation']) {
    const { response, asked } = await run({ reply: identification(named), rows });
    // The Shopping query is the series, not the generation the model guessed, so the rows span generations.
    assert.equal(asked.find(([kind]) => kind === 'shopping')[1], 'LG C-series OLED 55 inch TV', named);
    assert.equal(response.successor.name, 'LG C6 OLED 55-inch (OLED55C6PUA)', named);
    assert.equal(response.successor.lineage.basis, 'LISTINGS', named);
    assert.deepEqual(amounts(current(response)), [1200], named);
  }
});

test('6b. with no listing evidence at all, the model\'s generation stays a labelled hypothesis: it filters nothing and prices nothing', async () => {
  const { response } = await run({ reply: identification('LG C5 OLED'), rows: [] });
  assert.equal(response.successor.name, 'LG C5 OLED');
  assert.deepEqual(response.successor.lineage, { relation: 'SAME_SERIES_NEWER', generation: 'C5', basis: 'AI_HYPOTHESIS', tier: 'SAME' });
  assert.equal(response.successor.modelStatus, 'FAMILY_LEVEL');
  assert.equal(current(response).length, 0);
  // A digit past the current model year cannot be told from its namesake of ten years earlier (a C7 is 2027, or the 2017 C7), so no "newer" is claimed for it.
  const future = await run({ reply: identification('LG C7 OLED'), rows: [] });
  assert.deepEqual(future.response.successor.lineage, { relation: 'UNKNOWN', generation: 'C7', basis: 'AI_HYPOTHESIS', tier: 'SAME' });
});

// ---- 7 & 8. one listing stays provisional; unconfirmed family prices are not exact-model prices ---------------------------------------------------

test('7. one retailer listing stays provisional whatever the model\'s confidence: low confidence, one seller, never verified or recommended', async () => {
  const { response } = await run({ rows: [lg('C6', 55, 'OLED55C6PUA', 'Best Buy', 999.99)] });
  const { valuation } = response.pricing;
  assert.deepEqual([valuation.method, valuation.verified, valuation.confidence, valuation.comparables.length], ['PROVISIONAL_LISTINGS', false, 'LOW', 1]);
  assert.equal(response.successor.standing, 'CONDITIONAL', 'the model said high confidence and RECOMMENDED; confidence alone never establishes it');
  assert.notEqual(response.successor.modelStatus, 'VERIFIED_LISTING');
  assert.equal(response.pricing.prices.some((item) => item.verification === 'VERIFIED_PAGE'), false);
});

test('8. a family with no grammar (another maker) keeps its family-level price handling and is not given a generation', async () => {
  const sony = [{ title: 'Sony 55" Class BRAVIA 8 OLED 4K HDR Smart TV', seller: 'Best Buy', price: 1698 }, { title: 'Sony 55 inch BRAVIA 8 OLED 4K Google TV', seller: 'Abt', price: 1749 }];
  const { response } = await run({ rows: sony, only: /^Sony/ });
  const alt = response.suggestions[0];
  assert.equal(alt.name, 'Sony Bravia 8 OLED');
  assert.equal(alt.modelStatus, 'FAMILY_LEVEL');
  assert.deepEqual(alt.lineage, { relation: 'OTHER_BRAND', generation: null, basis: 'NONE', tier: 'HIGHER' });
  assert.deepEqual(amounts(current(response, 'ALT_1')), [1698, 1749]);
});

test('8b. listings that state no generation cannot be tied to one, so a series with a grammar prices none of them', async () => {
  const rows = [{ title: 'LG 55" Class OLED evo AI 4K Smart TV', seller: 'Best Buy', price: 1299 }, { title: 'LG 55" OLED evo 4K Smart TV w/ Dolby Atmos', seller: 'Abt', price: 1349 }];
  const { response, stats } = await run({ rows });
  assert.equal(current(response).length, 0);
  assert.equal(stats.generations.SUCCESSOR.chosen, null);
  assert.equal(response.successor.modelStatus, 'FAMILY_LEVEL');
});

// ---- non-LG: Samsung S90 (captured rows) -----------------------------------------------------------------------------------------------------------

test('non-LG: Samsung S90C 65-inch finds the S90H in the captured rows, names it without inventing a price from the S90D or bundles', async () => {
  const reply = identification('Samsung S90-series OLED', {
    original: { identity: 'Samsung S90C 65-inch QD-OLED smart TV (2023)', confidence: 'high', characteristics: ['65-inch QD-OLED', '4K'], uncertainty: null },
    suggestions: [],
  });
  const { response, stats, asked } = await run({ query: 'Samsung S90C 65 inch OLED TV', reply, rows: S1_ROWS.listings['samsung-s90c-65'].rows });
  assert.equal(asked.find(([kind]) => kind === 'shopping')[1], 'Samsung S90-series OLED 65 inch TV');
  assert.equal(stats.generations.SUCCESSOR.newest, 'S90H');
  assert.equal(stats.generations.SUCCESSOR.chosen, 'S90H');
  assert.match(response.successor.name, /^Samsung S90H OLED 65-inch/);
  assert.equal(response.successor.lineage.relation, 'SAME_SERIES_NEWER');
  assert.equal(response.successor.lineage.generation, 'S90H');
  // The S90D listings (a factory-reconditioned set, bundles, an unlisted seller) are another generation and never priced here.
  for (const other of ['1949.99', '1497.99', '1697.99']) assert.equal(JSON.stringify(response.pricing).includes(other), false, other);
  assert.notEqual(response.successor.modelStatus, 'VERIFIED_LISTING');
  // Retailers truncate a model code (QN65S90HAE, QN65S90HAEXZ): short spellings of one code are the same model, and the fullest spelling is kept.
  assert.equal(response.successor.name, 'Samsung S90H OLED 65-inch (QN65S90HAEXZA)');
  assert.equal(response.successor.modelStatus, 'UNVERIFIED_MODEL', 'a code seen only in bundle and protection-plan titles names the model but confirms nothing');
});

// ---- non-TV: the grammars are not applied to appliances ---------------------------------------------------------------------------------------------

test('a television grammar is never applied to another category, nor to a maker it was not written for', () => {
  assert.equal(resolveLineage({ category: 'refrigerator', query: 'LG C3', candidateName: 'LG C-series OLED' }), null);
  assert.equal(resolveLineage({ category: 'appliance', query: 'LG C3', candidateName: 'LG C-series OLED' }), null);
  assert.equal(resolveLineage({ category: 'tv', query: 'Sony A80J', candidateName: 'Sony Bravia 8 OLED' }), null, 'no Sony grammar');
  assert.equal(resolveLineage({ category: 'tv', query: 'LG C3', candidateName: 'LG OLED evo' }), null, 'a name with no series is not a series');
  const lineage = resolveLineage({ category: 'tv', query: 'LG C3 55 inch', identity: 'LG C3 OLED', candidateName: 'LG C4 OLED' });
  // Generations are model years: the C3 is 2023 and the C4 is 2024.
  assert.deepEqual([lineage.series, lineage.originalOrdinal, lineage.sameSeries, lineage.hypothesisOrdinal], ['C', 2023, true, 2024]);
  assert.equal(generalisedName('LG C4 OLED', lineage), 'LG C-series OLED');
  const other = resolveLineage({ category: 'tv', query: 'LG C3 55 inch', identity: 'LG C3 OLED', candidateName: 'LG G-series OLED' });
  assert.deepEqual([other.series, other.sameSeries, other.originalOrdinal], ['G', false, null], 'another series of the same maker is not the original\'s series');
  const cross = resolveLineage({ category: 'tv', query: 'LG C3 55 inch', identity: 'LG C3 OLED', candidateName: 'Samsung S90-series OLED' });
  assert.equal(cross.original, null, 'an original of another maker has no generation to compare');
});

test('refrigerator research is unchanged: its candidates carry no generation and the listing rules are the ones before this change', async () => {
  const fridge = S1_ROWS.listings['samsung-rf28r7351sr'];
  const reply = {
    category: 'refrigerator', profile: 'refrigerator',
    original: { identity: 'Samsung RF28R7351SR 4-door French door refrigerator', confidence: 'high', characteristics: ['28 cu ft'], uncertainty: null },
    tier: 'PREMIUM', requirements: [],
    successor: { name: 'Samsung Bespoke 4-Door French Door refrigerator', why: 'Same line.', differences: 'Newer controls.', concern: null, confidence: 'medium', comparison: [] },
    suggestions: [], estimates: { originalNew: { low: 2500, high: 3200 }, replacementNew: { low: 2500, high: 3300 } }, clarify: [],
  };
  const { response, stats } = await run({ query: 'Samsung RF28R7351SR refrigerator 28 cu ft', reply, rows: fridge.rows, only: /^Samsung/ });
  assert.equal(stats.generations, undefined, 'no generation census for a refrigerator');
  assert.equal(response.successor.name, 'Samsung Bespoke 4-Door French Door refrigerator');
  assert.equal(response.successor.lineage, undefined, 'a block that would say nothing is not sent');
});

// ---- contract ---------------------------------------------------------------------------------------------------------------------------------------

test('the lineage block is strict, optional, and built by code: unknown values, extra keys and free text yield none', () => {
  const ok = { relation: 'SAME_SERIES_NEWER', generation: 'C6', basis: 'LISTINGS', tier: 'SAME' };
  assert.deepEqual(normalizeLineage(ok), ok);
  assert.deepEqual(normalizeLineage({ ...ok, generation: null, basis: 'NONE' }), { ...ok, generation: null, basis: 'NONE' });
  for (const bad of [null, 'C6', [], { ...ok, relation: 'DIRECT' }, { ...ok, basis: 'NONE' }, { ...ok, generation: null }, { ...ok, generation: 'see https://x.example' }, { ...ok, generation: 'c6' }, { ...ok, tier: 'MUCH_HIGHER' }, { relation: 'UNKNOWN' }]) {
    assert.equal(normalizeLineage(bad), null, JSON.stringify(bad));
  }
  assert.deepEqual(normalizeLineage({ ...ok, note: 'extra' }), ok, 'an extra key is dropped when built (and a response carrying it fails the validator)');
});

test('a response without any lineage block is as valid as before (older responses stay compatible)', async () => {
  const { response } = await run({ reply: identification('Sony Bravia 8 OLED'), rows: [] });
  for (const candidate of [response.successor, ...response.suggestions]) delete candidate.lineage;
  assert.equal(isValidResearchResponseV2(response), true);
});

// ---- cache ------------------------------------------------------------------------------------------------------------------------------------------

test('the answer cache is scoped to v3: a generic-family answer cached under v2 is never served, and nothing is deleted', () => {
  assert.equal(RESEARCH_CACHE_PREFIX, 'itemassist-research:answer:v3');
  const key = researchCacheKey(QUERY, { contractVersion: 'research.2' });
  assert.match(key, /^itemassist-research:answer:v3:/);
  assert.notEqual(key, key.replace(':answer:v3:', ':answer:v2:'));
});

// ---- cost and size (offline) --------------------------------------------------------------------------------------------------------------------------

test('no provider call is added: still one search and two Shopping queries, and the extra work is parsing the rows already fetched', async () => {
  const { asked } = await run({ rows: S1_ROWS.listings['lg-c3-55'].rows, history: S1_ROWS.history['lg-c3-55'] });
  assert.deepEqual(asked.map(([kind]) => kind).sort(), ['search', 'shopping', 'shopping']);
  const started = process.hrtime.bigint();
  for (let index = 0; index < 50; index += 1) await run({ rows: S1_ROWS.listings['lg-c3-55'].rows, history: S1_ROWS.history['lg-c3-55'] });
  const perRunMs = Number(process.hrtime.bigint() - started) / 1e6 / 50;
  assert.ok(perRunMs < 50, `a full offline run takes ${perRunMs.toFixed(2)} ms (the screening itself is a few milliseconds)`);
});
