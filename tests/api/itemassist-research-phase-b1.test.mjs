import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildResearchResponseV2, isValidResearchResponseV2 } from '../../lib/itemassist-research/contract-v2.js';
import { sourcedSize } from '../../lib/itemassist-research/enrich/claims.js';
import { normalizeIdentification } from '../../lib/itemassist-research/enrich/identify.js';
import { screenListings } from '../../lib/itemassist-research/enrich/listings.js';
import { NEUTRAL_WHY, withoutUnsupportedOpinions } from '../../lib/itemassist-research/enrich/opinions.js';
import { researchLiveV2 } from '../../lib/itemassist-research/enrich/orchestrate.js';

// OFFLINE ONLY. Regression tests for the replacement-price eligibility defect the one live Frigidaire Gallery FGHB2868TF request exposed
// (Phase B, 2026-10-28): the model's capacity claim (27.8 cu ft) was wrong and unconfirmed, so the original's size was unknown, every Frigidaire
// listing passed on brand alone, and a 30-inch, 18.4 cu ft model (FRFN1801AF, $1,393) set the low end of the headline range. The replays run
// the saved Serper rows through the real pipeline.
const fixture = (name) => JSON.parse(readFileSync(new URL(`../fixtures/itemassist-research/${name}`, import.meta.url), 'utf8'));
const FRIG = fixture('phase-b-frigidaire.json');
const NOW = Date.parse('2026-10-28T13:08:05Z');
const FOCUS = ['FGHB2868TF'];

async function replay(p, { now = NOW, history = p.history, identification = p.identification } = {}) {
  const identify = async (query) => ({ ok: true, ...normalizeIdentification(identification, query), meta: { requestSent: true, usage: {}, errorCode: null } });
  const base = (name) => name.replace(/\s+(?:refrigerator|dishwasher)$/i, '').slice(0, 60);
  const serper = async ({ kind, query }) => {
    if (kind === 'search') return history;
    const family = Object.keys(p.listings).find((candidate) => query.startsWith(base(candidate)));
    if (!family) throw Object.assign(new Error('no saved rows'), { code: 'NO_SAVED_ROWS' });
    return p.listings[family];
  };
  const result = await researchLiveV2(p.query, { env: { SERPER_API_KEY: 'replay-key' }, now: () => now, identify, serper, serperBudget: { reserve: async (credits) => ({ allowed: true, status: 'allowed', credits }) } });
  const response = buildResearchResponseV2(result.input, { requestId: 'replay', elapsedMs: 0, answerSource: 'AI_ESTIMATE', now });
  return { result, response };
}
const cuFt = (title) => Number(/(\d{1,2}(?:\.\d)?)\s*cu/i.exec(title)?.[1]);
const rowFor = (p, price) => Object.values(p.listings).flat().find((row) => row.price === price.amount.low);

// ---- 1. the original's size from its own sources -----------------------------------------------------------------------------------------------

test('the sources state the original as 26.8 cu ft in several separate results, so that is its capacity; one result alone is not enough, and a conflict is unknown', () => {
  assert.deepEqual(sourcedSize(FRIG.history, FOCUS), { capacity: 26.8, width: null }, 'the width is stated by one result only');
  const row = (title, snippet, url = 'https://www.frigidaire.com/en/p/FGHB2868TF') => ({ title, snippet, url, date: null });
  const stated = [row('FGHB2868TF 36-inch French Door, 26.8 Cu. Ft.', ''), row('Frigidaire Gallery 36 inch', 'Model FGHB2868TF holds 26.8 cu ft.', 'https://www.bestbuy.com/site/x')];
  assert.deepEqual(sourcedSize(stated, FOCUS), { capacity: 26.8, width: 36 });
  assert.deepEqual(sourcedSize([stated[0]], FOCUS), { capacity: null, width: null }, 'one result is not enough');
  assert.deepEqual(sourcedSize([...stated, row('FGHB2868TF 27.8 Cu. Ft.', '')], FOCUS).capacity, null, 'a result that states another capacity makes it unknown');
  assert.deepEqual(sourcedSize([row('FGHB2868TF 26.8 Cu. Ft.', ''), row('FGHB2868TF 26.9 Cu. Ft.', '')], FOCUS).capacity, 26.8, 'rounding between sources is one figure');
  // A result about another model, a marketplace, or a sibling named in the same field is never the original's measurement.
  assert.deepEqual(sourcedSize([row('Frigidaire FGHB2867TF 30 Cu. Ft.', ''), row('Frigidaire FGHB2867TF 30 Cu. Ft.', 'x')], FOCUS), { capacity: null, width: null });
  assert.equal(sourcedSize([row('FGHB2868TF 26.8 Cu. Ft.', '', 'https://www.ebay.com/itm/1'), row('FGHB2868TF 26.8 Cu. Ft.', '', 'https://www.amazon.com/dp/1')], FOCUS).capacity, null, 'marketplaces');
  assert.equal(sourcedSize(stated, []).capacity, null, 'no model token, no evidence');
  assert.equal(sourcedSize(null, FOCUS).capacity, null);
});

test('replay of the saved Frigidaire request: the model\'s unsupported 27.8 cu ft stays guidance, and the sources\' 26.8 is the size listings are held to', async () => {
  const { response, result } = await replay(FRIG);
  assert.equal(isValidResearchResponseV2(response), true);
  assert.deepEqual(response.original.characteristics, [], 'the unconfirmed claims are not shown as characteristics');
  assert.match(response.original.uncertainty, /Not found in the sources checked: 27\.8 cu ft capacity/);
  assert.equal(response.requirements.every((item) => item.origin === 'CATEGORY_RULE'), true);
  assert.equal(response.requirements.some((item) => /27\.8|26\.8/.test(item.text)), false, 'no figure becomes a requirement');
  assert.deepEqual(result.meta.enrichment.sourcedSize, { capacity: 26.8, width: null });
  assert.deepEqual(result.meta.enrichment.claims, { checked: true, unconfirmed: 3 });
});

// ---- 2. which listings may set the range -------------------------------------------------------------------------------------------------------

test('replay of the saved Frigidaire request: the FRFN1801AF listing and the other undersized Frigidaire listings no longer set, or appear in, the range', async () => {
  const { response } = await replay(FRIG);
  const { prices, valuation, evidence } = response.pricing;
  const replacement = prices.filter((price) => price.subject === 'REPLACEMENT');
  assert.equal(JSON.stringify(response).includes('FRFN1801AF'), false, 'the 30-inch, 18.4 cu ft model is gone');
  for (const gone of [1393, 1593, 2299.99]) assert.equal(replacement.some((price) => price.candidate === 'SUCCESSOR' && price.amount.low === gone), false, `$${gone}`);
  // What still sets the range: the four listings that state a capacity at or above the original's 26.8 cu ft.
  const setting = valuation.comparables.map((entry) => prices.find((price) => price.id === entry.priceId));
  assert.deepEqual(setting.map((price) => [price.candidate, price.amount.low]).sort(), [['ALT_1', 1998], ['ALT_1', 2018], ['ALT_1', 2399.99], ['SUCCESSOR', 2292.01]].sort());
  for (const price of setting) assert.ok(cuFt(rowFor(FRIG, price).title) >= 26.8 * 0.98, rowFor(FRIG, price).title);
  assert.equal(valuation.method, 'PROVISIONAL_LISTINGS');
  assert.deepEqual(valuation.range, { currency: 'USD', low: 1998, high: 2399.99 });
  assert.equal(setting.every((price) => price.verification === 'SEARCH_LISTING' && price.sizeConfirmed === undefined), true);
  assert.equal(evidence.every((entry) => entry.modelRelation !== 'EXACT' || entry.subject === 'ORIGINAL'), true, 'no listing is presented as the exact model');
  assert.equal(isValidResearchResponseV2(response), true);
});

test('replay of the saved Frigidaire request: listings that state no capacity are labelled examples, never prices; the original\'s own listing and estimate keep their roles', async () => {
  const { response } = await replay(FRIG);
  const { prices, valuation } = response.pricing;
  const examples = prices.filter((price) => price.sizeConfirmed === false);
  assert.deepEqual(examples.map((price) => price.amount.low).sort((a, b) => a - b), [1738, 2649]);
  assert.equal(examples.every((price) => price.kind === 'CURRENT_RETAIL_NEW' && price.verification === 'SEARCH_LISTING' && !valuation.comparables.some((entry) => entry.priceId === price.id)), true);
  const original = prices.filter((price) => price.subject === 'ORIGINAL');
  assert.deepEqual(original.map((price) => [price.kind, price.amount.low, price.verification]).sort(), [['AI_ESTIMATE', 1800, 'NONE'], ['ORIGINAL_LISTING', 1499.5, 'SEARCH_SNIPPET']].sort());
  assert.equal(prices.some((price) => price.subject === 'ORIGINAL' && valuation.comparables.some((entry) => entry.priceId === price.id)), false, 'an original-model price never sets a replacement range');
});

test('a known capacity, width or configuration mismatch excludes a listing; a listing that states no size is only an example; nothing is assumed to fit', () => {
  const row = (title, price = 1500) => ({ title, seller: 'Best Buy', price });
  const family = { name: 'Frigidaire Gallery French Door Series' };
  const ctx = { category: 'refrigerator', spec: { kind: 'capacity', value: 26.8, atLeast: true }, focuses: FOCUS, layout: { kind: 'FRENCH_DOOR', doors: 3, settled: true }, width: 36 };
  const screened = (title, extra = {}) => screenListings([row(title)], family, { ...ctx, ...extra });
  // capacity
  assert.deepEqual(screened('Frigidaire 19 Cu. Ft. Standard-Depth French Door Refrigerator frfn1801af').skipped, { OTHER_SIZE: 1 });
  assert.deepEqual(screened('Frigidaire Gallery 23.3 Cu. Ft. Counter-Depth French Door Refrigerator').skipped, { OTHER_SIZE: 1 });
  assert.equal(screened('Frigidaire Gallery 27.8 Cu. Ft. French Door Refrigerator').items.length, 1);
  assert.equal(screened('Frigidaire 26.5 Cu. Ft. French Door Refrigerator').items.length, 1, 'within the rounding allowance');
  // width: a stated width that is not the original's is another size of refrigerator; an unstated width is not read as a match or a mismatch
  assert.deepEqual(screened('Frigidaire Gallery 30" 27 Cu. Ft. French Door Refrigerator').skipped, { OTHER_SIZE: 1 });
  assert.equal(screened('Frigidaire Gallery 36 Inch 27 Cu. Ft. French Door Refrigerator').items.length, 1);
  assert.equal(screened('Frigidaire Gallery 27 Cu. Ft. French Door Refrigerator').items.length, 1);
  assert.equal(screened('Frigidaire Gallery 30" 27 Cu. Ft. French Door Refrigerator', { width: null }).items.length, 1, 'no known width, no width test');
  // configuration
  assert.deepEqual(screened('Frigidaire Gallery 28 Cu. Ft. Side-by-Side Refrigerator').skipped, { OTHER_LAYOUT: 1 });
  assert.deepEqual(screened('Frigidaire Gallery 27 Cu. Ft. 4-Door French Door Refrigerator').skipped, { OTHER_LAYOUT: 1 });
  // a title that states no size has not confirmed one
  const unsized = screened('Frigidaire Gallery French Door Refrigerator with Ice Maker');
  assert.deepEqual([unsized.items.length, unsized.context.length], [0, 1], 'an unsized family listing is an example, not a price');
  // a refrigerator whose original size is unknown prices nothing: even a listing that states a size cannot be shown to fit
  const unknown = screenListings([row('Frigidaire Gallery 27.8 Cu. Ft. French Door Refrigerator')], family, { ...ctx, spec: null, width: null });
  assert.deepEqual([unknown.items.length, unknown.context.length], [0, 1]);
  // other categories keep their rule: a dishwasher with no size asked about is priced on brand and series
  const dishwasher = screenListings([row('Bosch 24" Dishwasher SHX78', 899)], { name: 'Bosch dishwasher' }, { category: 'appliance', spec: null, focuses: [] });
  assert.equal(dishwasher.items.length, 1);
});

test('when the original\'s size is unknown, every listing is an example: no listing prices, and the answer falls back to the labelled AI estimate or to insufficient evidence', async () => {
  // The same history with every capacity and width removed: nothing states the original's size.
  const bare = FRIG.history.map((entry) => ({ ...entry, title: entry.title.replace(/\d+(?:\.\d+)?[ -]?(?:cu\.? ?ft\.?|inch)/gi, 'size'), snippet: entry.snippet.replace(/\d+(?:\.\d+)?[ -]?(?:cu\.? ?ft\.?|inch|cubic feet)/gi, 'size') }));
  assert.deepEqual(sourcedSize(bare, FOCUS), { capacity: null, width: null });
  const noEstimate = await replay(FRIG, { history: bare });
  assert.equal(noEstimate.result.input.pricing.prices.some((price) => price.subject === 'REPLACEMENT' && price.kind === 'CURRENT_RETAIL_NEW' && price.sizeConfirmed !== false), false, 'no listing is a price');
  assert.equal(noEstimate.response.pricing.valuation.method, 'INSUFFICIENT');
  assert.equal(noEstimate.response.pricing.valuation.range, null);
  assert.equal(noEstimate.response.pricing.prices.some((price) => price.sizeConfirmed === false), true, 'useful uncertain listings stay as labelled examples');
  assert.deepEqual(noEstimate.response.warnings.includes('VALUATION_INSUFFICIENT'), true);
  const withEstimate = await replay(FRIG, { history: bare, identification: { ...FRIG.identification, estimates: { ...FRIG.identification.estimates, replacementNew: { low: 1600, high: 2400 } } } });
  assert.equal(withEstimate.response.pricing.valuation.method, 'AI_ESTIMATE_ONLY');
  assert.deepEqual(withEstimate.response.pricing.valuation.range, { currency: 'USD', low: 1600, high: 2400 });
  assert.equal(isValidResearchResponseV2(withEstimate.response), true);
});

// ---- 3. unsupported opinions and confidence ------------------------------------------------------------------------------------------------------

test('reliability opinions and claims about what a newer generation changed are omitted; plain layout, capacity and class comparisons are kept', () => {
  const clean = (fields) => withoutUnsupportedOpinions({ why: 'x', differences: null, concern: null, ...fields });
  assert.equal(clean({ concern: 'Ice maker reliability has been a historical pain point in this line.' }).concern, null);
  assert.equal(clean({ concern: 'Linear compressors have had long-term reliability concerns.' }).concern, null);
  assert.equal(clean({ concern: 'Known issues with the water dispenser. Check the HDMI 2.1 port count for your size.' }).concern, 'Check the HDMI 2.1 port count for your size.', 'only the opinion sentence goes');
  assert.equal(clean({ concern: 'Depth and door swing can differ between generations, so measure the opening first.' }).concern, 'Depth and door swing can differ between generations, so measure the opening first.');
  assert.equal(clean({ differences: 'Updated internal shelving and slightly refined exterior styling.' }).differences, null);
  assert.equal(clean({ differences: 'Incremental brightness and processor updates' }).differences, null);
  assert.equal(clean({ differences: 'Uses QD-OLED panel technology instead of W-OLED' }).differences, 'Uses QD-OLED panel technology instead of W-OLED');
  assert.equal(clean({ differences: 'Different internal bin layout and cooling system design.' }).differences, 'Different internal bin layout and cooling system design.');
  assert.equal(clean({ differences: 'Fewer HDMI 2.1 ports in some sizes.' }).differences, 'Fewer HDMI 2.1 ports in some sizes.');
  assert.equal(clean({ why: 'Matches the capacity and French door layout. It is known for excellent reliability.' }).why, 'Matches the capacity and French door layout.');
  assert.equal(clean({ why: 'Matches the high build quality and premium cleaning performance.' }).why, NEUTRAL_WHY, 'a reason made only of an opinion becomes the neutral line');
  assert.equal(clean({ why: 'It continues the line with newer styling.' }).why, 'It continues the line with newer styling.', 'a generation claim is withheld from "differences" only; the reason keeps its lineage sentence');
  assert.deepEqual(clean({ differences: '   ', concern: '' }), { why: 'x', differences: '   ', concern: '' }, 'blank text is left to the normaliser');
});

test('the identification keeps no opinion: a candidate whose only concern was a reliability opinion carries none, and its standing follows what is left', () => {
  const ident = (candidate) => normalizeIdentification({
    category: 'refrigerator', profile: 'refrigerator', original: { identity: 'Frigidaire Gallery FGHB2868TF French Door Refrigerator', confidence: 'high', characteristics: [], uncertainty: null },
    successor: { why: 'Continues the line.', differences: null, concern: null, comparison: [], confidence: 'high', ...candidate }, suggestions: [],
  }, 'Frigidaire Gallery FGHB2868TF refrigerator').input;
  const opinion = ident({ name: 'Frigidaire Gallery French Door Series', concern: 'Ice maker reliability has been a historical pain point.', differences: 'Updated shelving.' }).successor;
  assert.deepEqual([opinion.concern, opinion.differences, opinion.standing], [null, null, 'RECOMMENDED']);
  const real = ident({ name: 'Frigidaire Gallery French Door Series', concern: 'Depth can differ, so measure the opening.' }).successor;
  assert.deepEqual([real.concern, real.standing], ['Depth can differ, so measure the opening.', 'CONDITIONAL']);
});

test('confidence in a replacement is never HIGH when only a family, or an exact code nothing confirms, is supported; lower confidence and confirmed models are untouched', () => {
  const candidate = (name, confidence) => ({ name, why: 'Matches the layout.', differences: 'Different shelving.', concern: null, confidence, comparison: [] });
  const input = (successor, suggestions = []) => ({ category: 'refrigerator', profile: 'refrigerator', original: { identity: 'Frigidaire Gallery FGHB2868TF French Door Refrigerator', confidence: 'HIGH', characteristics: [], uncertainty: null }, requirements: [], successor, suggestions, clarify: [], warnings: [], pricing: { referenceDate: '2026-10-28', tier: { level: 'STANDARD', basis: 'AI_ESTIMATE' }, evidence: [], prices: [] } });
  const built = buildResearchResponseV2(input({ ...candidate('Frigidaire Gallery French Door Series', 'high'), standing: 'RECOMMENDED' }, [candidate('Whirlpool WRF555SDFZ French Door', 'HIGH'), candidate('LG French Door Series', 'medium'), candidate('Samsung French Door Series', 'low')]), { requestId: 'r', elapsedMs: 1, answerSource: 'AI_ESTIMATE', now: NOW });
  assert.deepEqual([built.successor.modelStatus, built.successor.confidence], ['FAMILY_LEVEL', 'MEDIUM']);
  assert.deepEqual(built.suggestions.map((item) => [item.modelStatus, item.confidence]), [['UNVERIFIED_MODEL', 'MEDIUM'], ['FAMILY_LEVEL', 'MEDIUM']]);
  assert.equal(isValidResearchResponseV2(built), true);
  const low = buildResearchResponseV2(input(candidate('Frigidaire Gallery French Door Series', 'low')), { requestId: 'r', elapsedMs: 1, answerSource: 'AI_ESTIMATE', now: NOW });
  assert.equal(low.successor.confidence, 'LOW');
});

test('replay of the saved Frigidaire request: no candidate carries a reliability opinion, a generation-change claim or HIGH confidence on a family', async () => {
  const { response } = await replay(FRIG);
  const candidates = [response.successor, ...response.suggestions];
  const text = JSON.stringify(candidates);
  assert.doesNotMatch(text, /reliab|pain point|Updated|refined/i);
  assert.equal(candidates.every((item) => item.modelStatus === 'FAMILY_LEVEL' && item.confidence !== 'HIGH'), true);
  assert.deepEqual(candidates.map((item) => item.confidence), ['MEDIUM', 'MEDIUM', 'MEDIUM']);
  assert.equal(response.successor.differences, null);
  assert.equal(response.suggestions[0].differences, 'Different internal bin layout and cooling system design.', 'a plain difference is kept');
  assert.equal(response.suggestions[1].differences, 'Uses dual evaporator cooling and linear compressor technology.');
});

// ---- 4. the saved regression cases are unchanged ---------------------------------------------------------------------------------------------------

const price = (response, id) => response.pricing.prices.find((item) => item.id === id);
const outcome = (response) => { const v = response.pricing.valuation; return [v.method, v.range && [v.range.low, v.range.high], v.confidence, v.comparables.map((entry) => entry.priceId), v.excluded]; };

test('regression: the saved GE, Samsung, Bosch and LG C3 requests keep the same range-setting listings, valuation and exclusions', async () => {
  const ge = fixture('checkpoint-d-ge-profile.json').products.refrigerator;
  assert.deepEqual(outcome((await replay(ge, { now: Date.parse('2026-10-27T12:26:40Z') })).response), ['AI_ESTIMATE_ONLY', [2500, 3200], 'LOW', ['p4'], [{ candidate: 'ALT_1', reason: 'SUSPECTED_ESSENTIAL_SHORTFALL' }, { candidate: 'ALT_2', reason: 'SUSPECTED_ESSENTIAL_SHORTFALL' }]]);

  const c = fixture('checkpoint-c-appliances.json');
  const day = Date.parse(`${c.referenceDate}T12:00:00Z`);
  const samsung = (await replay(c.products.refrigerator, { now: day })).response;
  assert.deepEqual(outcome(samsung), ['PROVISIONAL_LISTINGS', [3099, 3599.99], 'MEDIUM', ['p1', 'p2'], [{ candidate: 'ALT_2', reason: 'NO_CURRENT_PRICE' }]]);
  assert.deepEqual([price(samsung, 'p1').amount.low, price(samsung, 'p2').amount.low, price(samsung, 'p1').compatibilityOpen], [3599.99, 3099, true]);
  const bosch = (await replay(c.products.dishwasher, { now: day })).response;
  assert.deepEqual(outcome(bosch), ['PROVISIONAL_LISTINGS', [1249.99, 1249.99], 'LOW', ['p1'], [{ candidate: 'ALT_2', reason: 'NO_CURRENT_PRICE' }]]);

  const b = fixture('checkpoint-b-lg-c3.json');
  const lg = (await replay(b, { now: Date.parse(`${b.referenceDate}T12:00:00Z`) })).response;
  assert.deepEqual(outcome(lg), ['PROVISIONAL_LISTINGS', [1096, 1096], 'LOW', ['p2'], [{ candidate: 'ALT_1', reason: 'NO_CURRENT_PRICE' }, { candidate: 'ALT_2', reason: 'NO_CURRENT_PRICE' }]]);
  for (const response of [samsung, bosch, lg]) assert.equal(isValidResearchResponseV2(response), true);
});
