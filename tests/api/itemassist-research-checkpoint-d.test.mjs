import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildResearchResponseV2, isValidResearchResponseV2, normalizeOtherListings } from '../../lib/itemassist-research/contract-v2.js';
import { findResearchClaim } from '../../lib/itemassist-research/contract.js';
import { assessCapacity } from '../../lib/itemassist-research/enrich/capacity.js';
import { modelEvidence, originalSpec, vetIdentification } from '../../lib/itemassist-research/enrich/claims.js';
import { normalizeIdentification } from '../../lib/itemassist-research/enrich/identify.js';
import { screenListings } from '../../lib/itemassist-research/enrich/listings.js';
import { codeSupported, namedCodes, unsupportedCodes, withoutCodes } from '../../lib/itemassist-research/enrich/model-codes.js';
import { researchLiveV2 } from '../../lib/itemassist-research/enrich/orchestrate.js';
import { focusTokens } from '../../lib/itemassist-research/enrich/product-tokens.js';

// OFFLINE ONLY. Regression tests for what the independent live GE Profile PFE28KYNFS request (Checkpoint D, 2026-10-27) exposed: a supported
// capacity thrown away over "cubic feet" against "cu. ft." while "door-in-door" was kept because every refrigerator says "door", a Whirlpool
// model code that no product has presented as a product, and no way to show what Shopping saw when no recognised seller could be priced.
// The replays run the saved rows through the real pipeline.
const FIXTURE = JSON.parse(readFileSync(new URL('../fixtures/itemassist-research/checkpoint-d-ge-profile.json', import.meta.url), 'utf8'));
const GE = FIXTURE.products.refrigerator;
const NOW = Date.parse('2026-10-27T12:26:40Z');
const evidence = modelEvidence(GE.history, focusTokens(GE.query));
const identification = (characteristics, requirements = []) => normalizeIdentification({ ...GE.identification, original: { ...GE.identification.original, characteristics }, requirements }, GE.query).input;
const vet = (characteristics, requirements) => vetIdentification(identification(characteristics, requirements), evidence);

// ---- 1. claim matching -----------------------------------------------------------------------------------------------------------------------

test('the GE capacity is recognised however the unit is written, because the sources state it as 27.7 and 27.8 cu. ft.', () => {
  for (const claim of ['27.8 cubic feet capacity', '27.7 cu ft', '27.7 cu. ft. capacity', '27.8-cu. ft.', '28 cubic feet']) {
    assert.deepEqual(vet([claim]).input.original.characteristics, [claim], claim);
  }
  assert.deepEqual(originalSpec('refrigerator', vet(['27.8 cubic feet capacity']).input.original, true), { kind: 'capacity', value: 27.8, atLeast: true });
});

test('normalising units never makes conflicting measurements equivalent', () => {
  for (const claim of ['30 cu ft capacity', '26 cubic feet', '22.5 cu. ft.', '18 cu ft capacity']) {
    const vetted = vet([claim]);
    assert.deepEqual(vetted.input.original.characteristics, [], `${claim} conflicts with 27.7-27.8`);
    assert.match(vetted.input.original.uncertainty, /Not found in the sources checked/);
  }
  assert.equal(originalSpec('refrigerator', vet(['30 cu ft capacity']).input.original, true), null, 'an unsupported capacity decides no listing');
  // A different unit is not the same quantity: "27.7 inch" is not "27.7 cu ft".
  assert.deepEqual(vet(['27.7 inch width']).input.original.characteristics, []);
});

test('"door-in-door" is not supported by the word "door" or by "French door"; the generic description still is', () => {
  const vetted = vet(['French door layout', 'Door-in-door storage', 'Door in door design', 'Fingerprint resistant stainless steel']);
  assert.deepEqual(vetted.input.original.characteristics, ['French door layout', 'Fingerprint resistant stainless steel']);
  assert.match(vetted.input.original.uncertainty, /Not found in the sources checked: Door-in-door storage/);
  // A compound is supported only whole.
  assert.deepEqual(vet(['Door-in-door storage'], []).input.original.characteristics, []);
  assert.deepEqual(vetIdentification(identification(['Door-in-door storage']), `${evidence} lg instaview door-in-door craft ice`).input.original.characteristics, ['Door-in-door storage'], 'a source that names it supports it');
});

test('a feature the sources do not state never becomes a requirement, however many generic words it shares with them', () => {
  const vetted = vet(['French door layout'], [{ text: 'Must have door-in-door storage', importance: 'IMPORTANT' }, { text: 'Must include a water and ice dispenser in the door', importance: 'IMPORTANT' }, { text: 'Must have a flush pocket handle design', importance: 'IMPORTANT' }]);
  assert.equal(vetted.input.requirements.some((item) => /door-in-door/i.test(item.text)), false);
  assert.equal(vetted.input.requirements.some((item) => /pocket handle/i.test(item.text)), false);
  assert.equal(vetted.input.requirements.some((item) => item.importance === 'ESSENTIAL'), false, 'nothing the model adds is essential');
});

// ---- 2. replacement model identity ------------------------------------------------------------------------------------------------------------

test('a model code is supported by an exact listing, a finish variant of it or a listing that leaves the finish off; a different code is not', () => {
  const texts = ['LG LFXS26973D 26 cu.ft. French Door Refrigerator', 'Whirlpool WRF555SDFZ — Scratch & Dent Grade B', 'LG LRFXS2503S 25 cu ft'];
  assert.equal(codeSupported('LFXS26973D', texts), true, 'exact');
  assert.equal(codeSupported('LFXS26973S', texts), true, 'the same model in another finish');
  assert.equal(codeSupported('LRFXS2503', texts), true, 'a prefix that only leaves the finish off');
  assert.equal(codeSupported('WRF555SZDZ', texts), false, 'two letters differ: another model, not a finish');
  assert.equal(codeSupported('WRF555', texts), false, 'a short token is not a model');
  assert.deepEqual(unsupportedCodes('Whirlpool WRF555SZDZ French Door Refrigerator', texts), ['WRF555SZDZ']);
  assert.deepEqual(unsupportedCodes('Whirlpool WRF555SZDZ French Door Refrigerator', []), [], 'nothing retrieved is not evidence against a code');
  assert.deepEqual(unsupportedCodes('Whirlpool French Door Refrigerator', texts), []);
  assert.deepEqual(namedCodes('LG LFXS26973S French-Door 27.7 cu. ft. (stainless)'), ['LFXS26973S']);
  assert.equal(withoutCodes('Whirlpool WRF555SZDZ French Door Refrigerator', ['WRF555SZDZ']), 'Whirlpool French Door Refrigerator');
  assert.equal(withoutCodes('Whirlpool WRF555SZDZ', ['WRF555SZDZ'], 'refrigerator'), 'Whirlpool refrigerator');
});

async function replay(identificationOverride) {
  const identify = async (query) => ({ ok: true, ...normalizeIdentification(identificationOverride || GE.identification, query), meta: { requestSent: true, usage: {}, errorCode: null } });
  const serper = async ({ kind, query }) => {
    if (kind === 'search') return GE.history;
    const name = Object.keys(GE.listings).find((candidate) => query.startsWith(candidate.slice(0, 60)));
    if (!name) throw Object.assign(new Error('no saved rows'), { code: 'NO_SAVED_ROWS' });
    return GE.listings[name];
  };
  const result = await researchLiveV2(GE.query, { env: { SERPER_API_KEY: 'replay-key' }, now: () => NOW, identify, serper, serperBudget: { reserve: async (credits) => ({ allowed: true, status: 'allowed', credits }) } });
  const response = buildResearchResponseV2(result.input, { requestId: 'replay', elapsedMs: 0, answerSource: 'AI_ESTIMATE', now: NOW });
  return { result, response };
}

test('replay of the saved GE request: the supported capacity and layout stay, door-in-door goes, and nothing else changes about the original', async () => {
  const { response } = await replay();
  assert.equal(isValidResearchResponseV2(response), true);
  assert.equal(response.original.identity, 'GE Profile PFE28KYNFS French Door Refrigerator', 'the independently supported original identity is untouched');
  assert.deepEqual(response.original.characteristics, ['French door layout', 'Fingerprint resistant stainless steel', '27.8 cubic feet capacity']);
  assert.equal(response.original.uncertainty, 'Not found in the sources checked: Door-in-door storage.');
  assert.deepEqual(response.requirements.map((item) => item.origin), Array(6).fill('CATEGORY_RULE'), 'neither unsupported AI requirement survives');
  assert.equal(response.requirements.some((item) => item.importance === 'ESSENTIAL' && item.origin !== 'CATEGORY_RULE'), false);
});

test('replay of the saved GE request: the invented Whirlpool code is not presented as a product; the real-looking LG code is kept; nothing is substituted', async () => {
  const { response, result } = await replay();
  const [lg, whirlpool] = response.suggestions;
  assert.equal(lg.name, 'LG LFXS26973S French Door Refrigerator');
  assert.equal(lg.modelStatus, 'UNVERIFIED_MODEL', 'a listing of a finish variant does not verify the exact model');
  assert.equal(whirlpool.name, 'Whirlpool French Door Refrigerator', 'the code is removed, the family stays');
  assert.equal(whirlpool.modelStatus, 'FAMILY_LEVEL');
  assert.match(whirlpool.concern, /not found in current listings.*product family only/);
  assert.equal(whirlpool.why, 'Matches the French door configuration and exterior finish.', 'useful family-level guidance is kept');
  assert.equal(JSON.stringify(response).includes('WRF555SDFZ'), false, 'no other model number is assumed in its place');
  assert.equal(JSON.stringify(response).includes('WRF555SZDZ'), false);
  assert.deepEqual(result.meta.enrichment.unsupportedCodes, { ALT_2: ['WRF555SZDZ'] });
  assert.deepEqual(response.warnings, ['CANDIDATE_EXCLUDED_ESSENTIAL', 'MODEL_NOT_VERIFIED', 'VALUATION_ESTIMATE_ONLY']);
});

// ---- 3. zero-price Shopping fallback ----------------------------------------------------------------------------------------------------------

const FAMILY = { name: 'LG 3-Door French Door Refrigerator' };
const CONTEXT = { category: 'refrigerator', spec: { kind: 'capacity', value: 27.8, atLeast: true }, focuses: ['PFE28KYNFS'], layout: { kind: 'FRENCH_DOOR', doors: null, settled: true } };
const row = (seller, title, price) => ({ seller, title, price });
const STRANGERS = [
  row('Mazer Appliance', 'LG 28 Cu. Ft. French Door Refrigerator', 2399),
  row('Southeast Steel', 'LG 30 Cu. Ft. Stainless Smart French Door Refrigerator', 1998.95),
  row('Colder\'s', 'LG 28 Cu. Ft. Smart French Door Refrigerator with Door-in-Door', 2499.95),
  row('Gerhards Appliances', 'LG 26 Cu. Ft. French Door Refrigerator', 1979.1),
  row('Roby\'s Furniture & Appliance', 'LG 4 Piece Kitchen Appliances Package with French Door Refrigerator 28 Cu. Ft.', 3499),
  row('Big Tex', 'Refurbished LG 29 Cu. Ft. French Door Refrigerator', 1299),
  row('Slyman Bros', 'LG French Door Refrigerator', 2787),
  row('Canales Furniture', 'LG 27 Cu. Ft. Side-by-Side Refrigerator', 2099.99),
  row('Wagner Appliance Sales', 'Samsung 28 Cu. Ft. French Door Refrigerator', 2200),
];

test('when nothing from a recognised seller can be priced, relevant listings from other sellers are kept as unverified context: the lowest and the highest', () => {
  const screened = screenListings(STRANGERS, FAMILY, CONTEXT);
  assert.deepEqual(screened.items, [], 'nothing is priced');
  assert.deepEqual(screened.unrecognised, [
    { seller: 'Southeast Steel', amount: 1998.95, model: null },
    { seller: 'Colder\'s', amount: 2499.95, model: null },
  ]);
  // The screening that applies to recognised sellers applies here: size (26 cu ft), bundle, refurbished, layout, other brand, size not stated.
  assert.equal(screened.skipped.SELLER_NOT_RECOGNISED, STRANGERS.length, 'every one of them is counted as an unrecognised seller');
});

test('listings from unrecognised sellers never appear when a recognised seller could be priced, and never become a price', () => {
  const withRecognised = [...STRANGERS, row('Best Buy', 'LG 28 Cu.Ft Stainless Steel French Door Refrigerator with Ice & Water', 1899.99)];
  const screened = screenListings(withRecognised, FAMILY, CONTEXT);
  assert.deepEqual(screened.items.map((item) => [item.host, item.amount]), [['bestbuy.com', 1899.99]]);
  assert.deepEqual(screened.unrecognised, []);
});

test('a family listing is not read as the exact model: an exact-code candidate takes only listings that state its code; size must be stated', () => {
  const exact = screenListings(STRANGERS, { name: 'LG LFXS26973S French Door Refrigerator' }, CONTEXT);
  assert.deepEqual([exact.items, exact.unrecognised], [[], []], 'general LG listings do not match an exact model');
  const stated = screenListings([row('Appliances 4 Less Concord', 'LG LFXS26973S 28 cu.ft. French Door Refrigerator', 1449)], { name: 'LG LFXS26973S French Door Refrigerator' }, CONTEXT);
  assert.deepEqual(stated.unrecognised, [{ seller: 'Appliances 4 Less Concord', amount: 1449, model: 'LFXS26973S' }]);
  const unsized = screenListings([row('Mazer Appliance', 'LG French Door Refrigerator', 2399)], FAMILY, CONTEXT);
  assert.deepEqual(unsized.unrecognised, [], 'a title that states no size has not confirmed one');
  const sibling = screenListings([row('Appliances 4 Less Concord', 'LG LFXS26973D 26 cu.ft. French Door Refrigerator', 1449)], { name: 'LG LFXS26973S French Door Refrigerator' }, CONTEXT);
  assert.deepEqual(sibling.unrecognised, [], 'another finish, and 26 cu ft is short of 27.8: not attributed to this candidate');
});

const FAMILY_IDENTIFICATION = {
  ...GE.identification,
  suggestions: [{ name: 'LG 3-Door French Door Refrigerator', why: 'Offers a similar French door layout.', differences: 'Different cooling technology.', concern: null, confidence: 'high', comparison: [] }],
};

async function replayFamily(rows) {
  const identify = async (query) => ({ ok: true, ...normalizeIdentification(FAMILY_IDENTIFICATION, query), meta: { requestSent: true, usage: {}, errorCode: null } });
  const serper = async ({ kind }) => (kind === 'search' ? GE.history : rows);
  const result = await researchLiveV2(GE.query, { env: { SERPER_API_KEY: 'replay-key' }, now: () => NOW, identify, serper, serperBudget: { reserve: async (credits) => ({ allowed: true, status: 'allowed', credits }) } });
  return buildResearchResponseV2(result.input, { requestId: 'replay', elapsedMs: 0, answerSource: 'AI_ESTIMATE', now: NOW });
}

test('end to end: the unverified listings ride on the candidate, outside prices, evidence and the valuation, and the AI-only estimate stays separate', async () => {
  const response = await replayFamily(STRANGERS);
  assert.equal(isValidResearchResponseV2(response), true);
  assert.deepEqual(response.suggestions[0].otherSellerListings, [
    { seller: 'Southeast Steel', amount: 1998.95, model: null },
    { seller: 'Colder\'s', amount: 2499.95, model: null },
  ]);
  const { prices, valuation, evidence } = response.pricing;
  assert.equal(prices.some((price) => price.kind === 'CURRENT_RETAIL_NEW'), false, 'no listing becomes a price');
  assert.equal(JSON.stringify(evidence).includes('Southeast'), false, 'no seller becomes a source');
  assert.equal(valuation.method, 'AI_ESTIMATE_ONLY');
  assert.deepEqual(valuation.range, { currency: 'USD', low: 2500, high: 3200 }, 'the range is the estimate, untouched by the listings');
  assert.deepEqual(valuation.comparables.map((entry) => prices.find((price) => price.id === entry.priceId).kind), ['AI_ESTIMATE']);
  assert.equal(prices.filter((price) => price.subject === 'ORIGINAL' && price.kind === 'ORIGINAL_LISTING').length, 2, 'the original model\'s own listings stay context for the original');
  assert.equal(prices.some((price) => price.subject === 'REPLACEMENT' && price.kind !== 'AI_ESTIMATE'), false, 'original-model prices are never used as replacement values');
});

test('end to end: with no relevant listing the answer says so by carrying nothing, and the estimate is still labelled', async () => {
  const response = await replayFamily([row('Gerhards Appliances', 'LG 26 Cu. Ft. French Door Refrigerator', 1979.1), row('Homery', 'LG 4 Piece Kitchen Appliances Package with French Door Refrigerator', 6480)]);
  assert.equal(isValidResearchResponseV2(response), true);
  assert.equal('otherSellerListings' in response.suggestions[0], false);
  assert.deepEqual(response.pricing.valuation.excluded, [{ candidate: 'ALT_1', reason: 'NO_CURRENT_PRICE' }]);
  assert.equal(response.pricing.valuation.method, 'AI_ESTIMATE_ONLY');
  assert.deepEqual(response.warnings.includes('VALUATION_ESTIMATE_ONLY'), true);
});

test('the field is held to a strict schema: names are plain text, links are refused, the list is short, and a forged entry fails validation', async () => {
  assert.deepEqual(normalizeOtherListings([{ seller: 'Shop.example.com', amount: 100 }, { seller: 'https://x.test/a', amount: 100 }, { seller: 'Good Seller', amount: 0 }, { seller: 'Fine Seller Inc.', amount: '1,200' }]), [], 'link-like names and bad amounts');
  assert.deepEqual(normalizeOtherListings([
    { seller: 'Shop.example.com', amount: 100 }, { seller: ' Fine  Seller ', amount: 1200.456, model: 'LFXS26973S' }, { seller: 'fine seller', amount: 1300 }, { seller: 'Third Seller', amount: 1400 }, { seller: 'Fourth Seller', amount: 1500 },
  ]), [{ seller: 'Fine Seller', amount: 1200.46, model: 'LFXS26973S' }, { seller: 'Third Seller', amount: 1400, model: null }], 'at most two, unique by seller, no link-like name');
  const response = await replayFamily(STRANGERS);
  const forged = (change) => ({ ...response, suggestions: [{ ...response.suggestions[0], ...change(response.suggestions[0]) }] });
  assert.equal(isValidResearchResponseV2(forged((item) => ({ otherSellerListings: [{ ...item.otherSellerListings[0], url: 'https://x.test/' }] }))), false, 'an extra key');
  assert.equal(isValidResearchResponseV2(forged((item) => ({ otherSellerListings: [{ ...item.otherSellerListings[0], seller: 'See www.evil.test' }] }))), false, 'a link-like name');
  assert.equal(isValidResearchResponseV2(forged(() => ({ otherSellerListings: [] }))), false, 'an empty list is not carried');
  assert.equal(isValidResearchResponseV2(forged((item) => ({ otherSellerListings: [item.otherSellerListings[0], item.otherSellerListings[0], item.otherSellerListings[0]] }))), false, 'too many');
});

// ---- 4. original specification attribution ---------------------------------------------------------------------------------------------------

const reviewRow = (snippet, title = 'GE Profile PFE28KYNFS Refrigerator Review') => ({ title, url: 'https://www.consumerreports.org/appliances/refrigerators/ge-profile-pfe28kynfs/m405722/', snippet, date: null });

test('a measurement that belongs to a sibling model named in the same snippet is never evidence for the original', () => {
  // The saved Consumer Reports row describes the GFE28GYNFS (70" high, 36" wide, 32" deep) under a page titled for the PFE28KYNFS.
  const saved = modelEvidence(GE.history, focusTokens(GE.query));
  assert.deepEqual(vet(['32-inch depth']).input.original.characteristics, [], 'the only 32" in the saved rows is the sibling\'s');
  assert.deepEqual(vet(['36-inch wide']).input.original.characteristics, ['36-inch wide'], 'the original\'s own 36 Inch row (Plesser\'s) still supports it');
  assert.equal(saved.includes('gfe28gynfs'), true, 'the text is kept; only the sibling\'s measurements are removed');
  const mixed = modelEvidence([reviewRow('The GE GFE28GYNFS measures 36" wide and holds 25 cu ft. The PFE28KYNFS holds 27.7 cu ft.')], focusTokens(GE.query));
  const claims = (list) => vetIdentification(identification(list), mixed).input.original.characteristics;
  assert.deepEqual(claims(['25 cu ft capacity']), [], 'the sibling\'s capacity');
  assert.deepEqual(claims(['36-inch width']), [], 'the sibling\'s width');
  assert.deepEqual(claims(['27.7 cu ft capacity']), ['27.7 cu ft capacity'], 'the original\'s own, nearer to its own code');
});

test('a snippet that names only the original, or no model at all, keeps its measurements; counts such as "4-Door" are not models', () => {
  const only = modelEvidence([reviewRow('The PFE28KYNFS is a 4-Door French door refrigerator with 27.7 cu ft.')], focusTokens(GE.query));
  assert.deepEqual(vetIdentification(identification(['27.7 cu ft capacity']), only).input.original.characteristics, ['27.7 cu ft capacity']);
  const titleOnly = modelEvidence([reviewRow('Spacious 28 cu. ft. 4-Door French Door Refrigerator with a Food Showcase drawer for every shelf of the kitchen.', 'PFE28KYNFS review')], focusTokens(GE.query));
  assert.deepEqual(vetIdentification(identification(['28 cu ft capacity']), titleOnly).input.original.characteristics, ['28 cu ft capacity']);
});

// ---- 5. candidate capacity: code-owned, not the model's guess ----------------------------------------------------------------------------------

const SPEC = { kind: 'capacity', value: 27.8, atLeast: true };
const lgRows = (...titles) => titles.map((title) => ({ title, seller: 'Appliances 4 Less Concord', price: 1449 }));
const meets = (name) => ({ name, comparison: [{ requirementKey: 'capacity', status: 'MEETS', basis: 'AI_ESTIMATE' }, { requirementKey: 'layout', status: 'MEETS', basis: 'AI_ESTIMATE' }] });
const capacityRow = (result) => result.comparison.find((row) => row.requirementKey === 'capacity');

test('a candidate whose own listings state a capacity below the original\'s is a shortfall, whatever the model said', () => {
  const result = assessCapacity(meets('LG LFXS26973S French Door Refrigerator'), SPEC, lgRows('LG LFXS26973D 26 cu.ft. French Door Refrigerator'));
  assert.deepEqual(capacityRow(result), { requirementKey: 'capacity', status: 'SHORTFALL', basis: 'AI_ESTIMATE' });
  assert.equal(result.comparison.find((row) => row.requirementKey === 'layout').status, 'MEETS', 'other rows are untouched');
  assert.equal(result.concern, 'Listings show 26 cu ft, below the original\'s 27.8 cu ft.');
  assert.equal(findResearchClaim(result.concern), null, 'wording the contract relays');
  // Within the 2% rounding allowance is not short; the same code with a fitting size is a fit.
  assert.equal(capacityRow(assessCapacity(meets('LG LFXS26973S French Door Refrigerator'), SPEC, lgRows('LG LFXS26973S 27.7 cu ft French Door'))).status, 'MEETS');
  assert.equal(assessCapacity(meets('LG LFXS26973S French Door Refrigerator'), SPEC, lgRows('LG LFXS26973S 27.7 cu ft French Door')).concern, null);
});

test('an unknown or unsupported candidate capacity is UNKNOWN, never MEETS: families, codes no listing shows, unstated or conflicting capacities, an unknown original', () => {
  const unknown = (candidate, spec, rows) => capacityRow(assessCapacity(candidate, spec, rows)).status;
  assert.equal(unknown(meets('LG 3-Door French Door Refrigerator'), SPEC, lgRows('LG 28 Cu. Ft. French Door Refrigerator')), 'UNKNOWN', 'a family: its listings are many sizes');
  assert.equal(unknown(meets('Whirlpool WRF555SZDZ French Door'), SPEC, lgRows('Whirlpool WRF555SDFZ 25 cu ft')), 'UNKNOWN', 'no listing shows this code');
  assert.equal(unknown(meets('LG LFXS26973S French Door'), SPEC, lgRows('LG LFXS26973D French Door Refrigerator')), 'UNKNOWN', 'its listings state no capacity');
  assert.equal(unknown(meets('LG LFXS26973S French Door'), SPEC, lgRows('LG LFXS26973D 26 cu ft', 'LG LFXS26973S 28 cu ft')), 'UNKNOWN', 'listings that disagree');
  assert.equal(unknown(meets('LG LFXS26973S French Door'), null, lgRows('LG LFXS26973S 28 cu ft')), 'UNKNOWN', 'no checked capacity for the original');
  assert.equal(unknown(meets('LG LFXS26973S French Door'), { kind: 'inches', value: 36 }, lgRows('LG LFXS26973S 28 cu ft')), 'UNKNOWN', 'the original\'s size is not a capacity');
  assert.equal(capacityRow(assessCapacity(meets('LG LFXS26973S French Door'), SPEC, [])).basis, 'AI_ESTIMATE');
  // Nothing is invented: no row is added for a candidate the model said nothing about, and a model SHORTFALL with no evidence is left as it is.
  assert.equal(assessCapacity({ name: 'LG LFXS26973S French Door', comparison: [] }, SPEC, []), null);
  assert.equal(assessCapacity({ name: 'LG French Door', comparison: [{ requirementKey: 'capacity', status: 'SHORTFALL', basis: 'AI_ESTIMATE' }] }, SPEC, []), null);
});

test('a capacity stated next to another model\'s code is not the candidate\'s', () => {
  const rows = lgRows('LG LFXS26973S 28 cu ft French Door, compare Samsung RF28R7351SR 22 cu ft', 'LG LRFXS2503S 25 cu ft French Door');
  // 28 sits beside the candidate's code; 22 beside the Samsung's; the other LG row is a different model altogether.
  assert.equal(capacityRow(assessCapacity(meets('LG LFXS26973S French Door'), SPEC, rows)).status, 'MEETS');
  assert.equal(capacityRow(assessCapacity(meets('LG LRFXS2503S French Door'), SPEC, rows)).status, 'SHORTFALL');
});

async function replayWith(identificationOverride, record = []) {
  const identify = async (query) => ({ ok: true, ...normalizeIdentification(identificationOverride, query), meta: { requestSent: true, usage: {}, errorCode: null } });
  const serper = async ({ kind, query }) => {
    record.push([kind, query]);
    if (kind === 'search') return GE.history;
    return GE.listings[Object.keys(GE.listings).find((name) => query.startsWith(name.slice(0, 60)))] || [];
  };
  const result = await researchLiveV2(GE.query, { env: { SERPER_API_KEY: 'replay-key' }, now: () => NOW, identify, serper, serperBudget: { reserve: async (credits) => ({ allowed: true, status: 'allowed', credits }) } });
  return buildResearchResponseV2(result.input, { requestId: 'replay', elapsedMs: 0, answerSource: 'AI_ESTIMATE', now: NOW });
}
const rowStatus = (response, candidate, key) => candidate.comparison.find((row) => response.requirements.find((req) => req.id === row.requirementId).key === key)?.status;

test('replay of the saved GE request: the LG LFXS26973S is a capacity shortfall (26 against 27.8), is excluded from the valuation, and the shortfall is stated', async () => {
  const { response } = await replay();
  const [lg, whirlpool] = response.suggestions;
  assert.equal(rowStatus(response, lg, 'capacity'), 'SHORTFALL');
  assert.equal(lg.concern, 'Listings show 26 cu ft, below the original\'s 27.8 cu ft.');
  assert.equal(rowStatus(response, whirlpool, 'capacity'), 'SHORTFALL', 'the model\'s own shortfall, with nothing behind it, still only keeps a candidate out');
  assert.deepEqual(response.pricing.valuation.excluded, [{ candidate: 'ALT_1', reason: 'SUSPECTED_ESSENTIAL_SHORTFALL' }, { candidate: 'ALT_2', reason: 'SUSPECTED_ESSENTIAL_SHORTFALL' }]);
  assert.equal(response.pricing.valuation.method, 'AI_ESTIMATE_ONLY');
  assert.equal(isValidResearchResponseV2(response), true);
});

test('a successor with a capacity shortfall is conditional, carries the shortfall and cannot set the valuation', async () => {
  const successor = { name: 'LG LFXS26973S French Door Refrigerator', why: 'Offers a similar French door layout and capacity.', differences: 'Different cooling technology.', concern: null, confidence: 'high', comparison: [{ requirementKey: 'capacity', status: 'MEETS' }] };
  const response = await replayWith({ ...GE.identification, successor, suggestions: [] });
  assert.equal(response.successor.standing, 'CONDITIONAL', 'a high-confidence successor with a concern is not recommended');
  assert.match(response.successor.concern, /below the original's 27.8 cu ft/);
  assert.equal(rowStatus(response, response.successor, 'capacity'), 'SHORTFALL');
  assert.deepEqual(response.pricing.valuation.excluded, [{ candidate: 'SUCCESSOR', reason: 'SUSPECTED_ESSENTIAL_SHORTFALL' }]);
  assert.equal(response.pricing.valuation.comparables.every((entry) => entry.candidate === null), true, 'only the labelled AI estimate remains');
});

// ---- 6. Shopping query codes -----------------------------------------------------------------------------------------------------------------

test('whether a candidate code exists cannot be known before its Shopping search: the saved results about the original never mention the candidate\'s brand code, so the query keeps it and the answer demotes afterwards', async () => {
  const record = [];
  await replayWith(GE.identification, record);
  const text = GE.history.map((row) => `${row.title} ${row.snippet}`).join(' ').toUpperCase();
  assert.equal(text.includes('WRF555'), false, 'no advance evidence for or against the Whirlpool code');
  assert.deepEqual(record.filter(([kind]) => kind === 'shopping').map(([, query]) => query), ['LG LFXS26973S French Door Refrigerator 27.8 cu ft', 'Whirlpool WRF555SZDZ French Door Refrigerator 27.8 cu ft']);
});
