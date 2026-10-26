import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildResearchResponseV2, isValidResearchResponseV2 } from '../../lib/itemassist-research/contract-v2.js';
import { findResearchClaim } from '../../lib/itemassist-research/contract.js';
import { classifyHost } from '../../lib/itemassist-research/evidence.js';
import { modelEvidence, originalLayout, originalSpec, vetIdentification } from '../../lib/itemassist-research/enrich/claims.js';
import { extractHistory } from '../../lib/itemassist-research/enrich/history.js';
import { normalizeIdentification } from '../../lib/itemassist-research/enrich/identify.js';
import { candidateIdentity, screenListings, sellerHost } from '../../lib/itemassist-research/enrich/listings.js';
import { doorConcern, researchLiveV2, withoutUnusedLines } from '../../lib/itemassist-research/enrich/orchestrate.js';
import { doorCountOf, focusTokens, layoutOf, sizeAgreement, sizeSpec, statedLines } from '../../lib/itemassist-research/enrich/product-tokens.js';
import { buildValuation } from '../../lib/itemassist-research/pricing.js';

// OFFLINE ONLY. Regression tests for what the two live appliance requests (Checkpoint C, 2026-10-26) exposed: original-model prices thrown away
// for having no date, specifics the model invented becoming requirements, a size the original is known to have never applied, a door count
// ignored, "500 Series" treated as a quantity, and a made-up "KitchenAid 300 Series". The replays run the saved rows through the real pipeline.
const FIXTURE = JSON.parse(readFileSync(new URL('../fixtures/itemassist-research/checkpoint-c-appliances.json', import.meta.url), 'utf8'));
const NOW = Date.UTC(2026, 9, 26, 15, 39);
const FRIDGE = FIXTURE.products.refrigerator, DISHWASHER = FIXTURE.products.dishwasher;
const histOf = (rows, query, category = 'appliance', spec = null) => extractHistory(rows, { query, category, now: NOW, spec });
const page = (over) => ({ title: 'Bosch SHPM65Z55N 24 Inch Built-In Dishwasher', url: 'https://www.plessers.com/bosch/shpm65z55n', snippet: 'Price: $1,099.00 Item Discontinued.', date: null, ...over });
const Q = 'Bosch SHPM65Z55N dishwasher';

// ---- 1. historical evidence: what is kept, how it is labelled --------------------------------------------------------------------------------

test('an undated price for the exact original model is kept as an original-model LISTING: undated, never an MSRP', () => {
  const result = histOf([page({})], Q);
  assert.deepEqual(result.items.map((item) => [item.kind, item.amount, item.publishedAt, item.model]), [['ORIGINAL_LISTING', 1099, null, 'SHPM65Z55N']]);
  // The same price on a dated page is advertised past retail; on an undated page it is only a listing.
  assert.equal(histOf([page({ date: '2021-05-01' })], Q).items[0].kind, 'HISTORICAL_RETAIL');
  // One discount listing is not the list price, however low or high.
  const sale = histOf([page({ snippet: 'Sale price $899.00. Regular price $1,099.00 Item Discontinued.' })], Q).items;
  assert.ok(sale.length >= 1 && sale.every((item) => item.kind === 'ORIGINAL_LISTING' && item.publishedAt === null));
});

test('an undated price needs the full model code, a maker or retailer page, and a real price: short tokens, reviews and savings are refused', () => {
  const short = histOf([page({ title: 'LG C3 OLED', snippet: 'Price: $1,899.', url: 'https://www.lg.com/us/tvs/c3' })], 'LG C3 55 inch OLED', 'tv');
  assert.deepEqual([short.items.length, short.skipped.UNDATED], [0, 1], 'a short series token is on lineup pages too');
  const review = histOf([page({ url: 'https://www.reviewed.com/dishwashers/shpm65z55n', snippet: 'We tested it. It costs $1,099.' })], Q);
  assert.deepEqual([review.items.length, review.skipped.UNDATED], [0, 1], 'an undated review price is not a listing');
  assert.equal(histOf([page({ url: 'https://www.example-shop.com/shpm65z55n' })], Q).skipped.SOURCE_NOT_ALLOWED, 1);
  for (const snippet of ['Save $200 on this dishwasher.', 'From $38/mo with financing.', 'Instant rebate $150 off.', 'Price: $39 per month.']) assert.equal(histOf([page({ snippet })], Q).items.length, 0, snippet);
  assert.equal(histOf([page({ title: 'Bosch SHPM65Z55N 220 Volt 50 Hz dishwasher' })], Q).skipped.IMPORT_VOLTAGE, 1, 'another market\'s voltage is another product');
});

test('a release date in the text is a product fact, not the date of a price; an undated explicit MSRP from a maker stays undated MSRP', () => {
  const release = histOf([page({ snippet: 'Release Date: 2019-07-29. Price: $1,099.' })], Q).items;
  assert.deepEqual(release.map((item) => [item.kind, item.publishedAt]), [['ORIGINAL_LISTING', null]], 'the 2019 date is not used');
  const maker = histOf([page({ url: 'https://www.bosch-home.com/us/shpm65z55n', snippet: 'MSRP $1,099.' })], Q).items;
  assert.deepEqual(maker.map((item) => [item.kind, item.amount, item.publishedAt]), [['MSRP', 1099, null]]);
  // A retailer can never state an MSRP: the same words on a retailer page are only a listing.
  assert.equal(histOf([page({ snippet: 'MSRP $1,099.' })], Q).items[0].kind, 'ORIGINAL_LISTING');
});

test('the full model code can sit after the price, in the page\'s own text, and a different model on the page refuses it', () => {
  const after = histOf([page({ title: 'Bosch 500 Series 24" Stainless Steel Dishwasher', url: 'https://www.appliancefactory.com/product/bosch-500', snippet: 'Dishwasher … starting at $899.96 Quantity. Bosch Model #: SHPM65Z55N' })], Q).items;
  assert.deepEqual(after.map((item) => [item.kind, item.amount, item.model]), [['ORIGINAL_LISTING', 899.96, 'SHPM65Z55N']]);
  // The price that follows a different model's name is that model's; a price stated before it is still the original's.
  assert.equal(histOf([page({ snippet: 'Compare: SHP65CM5N at $1,249.' })], Q).items.length, 0);
  assert.deepEqual(histOf([page({ snippet: 'Price: $1,099. Compare with SHP65CM5N at $1,249.' })], Q).items.map((item) => item.amount), [1099]);
});

test('Checkpoint C history rows: the original-model listings are kept undated; the lowest and the highest are shown, nothing is called MSRP', () => {
  const result = extractHistory(DISHWASHER.history, { query: DISHWASHER.query, category: 'appliance', now: NOW, spec: { kind: 'inches', value: 24 } });
  assert.deepEqual(result.items.map((item) => [item.kind, item.amount, item.publishedAt, new URL(item.url).hostname]), [['ORIGINAL_LISTING', 899.96, null, 'www.appliancefactory.com'], ['ORIGINAL_LISTING', 1239.94, null, 'www.townappliance.com']]);
  const fridge = extractHistory(FRIDGE.history, { query: FRIDGE.query, category: 'refrigerator', now: NOW, spec: { kind: 'capacity', value: 28, atLeast: true } });
  assert.deepEqual(fridge.items.map((item) => [item.kind, item.amount, item.publishedAt, new URL(item.url).hostname]), [['ORIGINAL_LISTING', 2575, null, 'www.applianceleaders.com']]);
  assert.ok(fridge.skipped.SOURCE_NOT_ALLOWED >= 1 && !JSON.stringify(fridge.items).includes('4199'), 'the 220 V export shop is not a source, and its price is not used');
  assert.equal(extractHistory([{ title: 'Samsung RF28R7351SR 220 Volt 50 Hz', url: 'https://www.applianceleaders.com/rf28r7351sr', snippet: 'Sale price $4,199.', date: null }], { query: FRIDGE.query, category: 'refrigerator', now: NOW }).skipped.IMPORT_VOLTAGE, 1);
});

// ---- 2. claim control: what the model adds is checked against the sources --------------------------------------------------------------------

const identified = (product) => normalizeIdentification(product.identification, product.query);
const evidenceFor = (product) => modelEvidence(product.history, focusTokens(product.query));

test('the refrigerator: counter-depth and a Family Hub touchscreen are not found in the sources, so they are guidance, not requirements; the "3-door" name is not shown', () => {
  const vetted = vetIdentification(identified(FRIDGE).input, evidenceFor(FRIDGE));
  assert.equal(vetted.available, true);
  assert.deepEqual(vetted.input.original.characteristics, ['28 cu ft capacity', 'French door layout'], 'what the sources support stays');
  assert.equal(vetted.input.requirements.length, 0, 'neither AI requirement was supported');
  assert.equal(vetted.input.original.identity, 'Samsung RF28R7351SR French Door Refrigerator');
  assert.match(vetted.input.original.uncertainty, /Door count not settled: sources say 4-door, first reading said 3\./);
  assert.match(vetted.input.original.uncertainty, /Not found in the sources checked: Counter-depth design; Family Hub touchscreen\./);
  assert.equal(findResearchClaim(vetted.input.original.uncertainty), null, 'the guidance is wording the contract relays');
  assert.deepEqual([vetted.doors, vetted.doorsSettled], [4, false], 'the model said 3 and the sources say 4: a reading, not an established fact');
  assert.deepEqual(originalLayout(vetted.input.original, true, vetted.doors, vetted.doorsSettled), { kind: 'FRENCH_DOOR', doors: 4, settled: false });
  assert.equal(JSON.stringify(vetted.input.original).toLowerCase().includes('counter-depth design"'), false, 'counter-depth is never inferred from a generic French door description');
});

test('the dishwasher: CrystalDry/Zeolith and a "flush" handle are not mandatory; the checked width stays', () => {
  const vetted = vetIdentification(identified(DISHWASHER).input, evidenceFor(DISHWASHER));
  assert.deepEqual(vetted.input.requirements, []);
  assert.match(vetted.input.original.uncertainty, /^Not found in the sources checked: CrystalDry technology/);
  assert.ok(vetted.input.original.characteristics.includes('24-inch built-in'));
  assert.deepEqual(originalSpec('appliance', vetted.input.original, vetted.available), { kind: 'inches', value: 24 });
});

test('with nothing said about the model there is nothing to check against: claims are left alone and no size is taken from them', () => {
  const input = identified(FRIDGE).input;
  assert.equal(modelEvidence([], focusTokens(FRIDGE.query)), '');
  assert.equal(modelEvidence(FRIDGE.history, []), '', 'no model token, no evidence');
  const vetted = vetIdentification(input, '');
  assert.deepEqual([vetted.input === input, vetted.available], [true, false]);
  assert.equal(originalSpec('refrigerator', input.original, false), null, 'an unchecked capacity never decides eligibility');
  assert.equal(originalLayout(input.original, false), null);
});

test('the capacity the original is known to have is "equal or greater": 27.8 or 30 cu ft qualify for a 28 cu ft original, 27 and 22 do not', () => {
  const spec = originalSpec('refrigerator', { identity: 'Samsung RF28R7351SR French Door Refrigerator', characteristics: ['28 cu ft capacity'] }, true);
  assert.deepEqual(spec, { kind: 'capacity', value: 28, atLeast: true });
  const verdict = (title) => sizeAgreement(spec, 'refrigerator', title);
  assert.deepEqual(['27.8 cu. ft.', '28 Cu.Ft', '30 Cu. ft', '28.6-Cu. Feet', '27 cu. ft.', '22 cu ft', '24 Cu. Ft.'].map((text) => verdict(`Samsung French Door ${text}`)), ['MATCH', 'MATCH', 'MATCH', 'MATCH', 'MISMATCH', 'MISMATCH', 'MISMATCH']);
  assert.equal(verdict('Samsung French Door Refrigerator'), 'UNKNOWN', 'a missing capacity stays unknown');
});

// ---- 3. eligibility of listings ---------------------------------------------------------------------------------------------------------------

const lr = (title, seller, price) => ({ title, seller, price });
const FR = { category: 'refrigerator', spec: { kind: 'capacity', value: 28, atLeast: true }, focuses: ['RF28R7351SR'], layout: { kind: 'FRENCH_DOOR', doors: 4 } };
const SAM = { name: 'Samsung Bespoke French Door Refrigerator' };

test('a known-ineligible listing never sets the price: too small, another layout, or another door count; an unstated capacity is only an example', () => {
  const rows = [
    lr('Samsung 22 cu. ft. Bespoke 4-Door French Door Refrigerator', 'Best Buy', 2200), lr('Samsung 28 cu. ft. Side-by-Side Refrigerator', 'Target', 2500),
    lr('Samsung 29 cu. ft. Bespoke 3-Door French Door Refrigerator', 'Lowe\'s', 2100), lr('Samsung Bespoke 4-Door French Door Refrigerator', 'P.C. Richard & Son', 3800),
    lr('Samsung 29 cu. ft. Bespoke 4-Door French Door Refrigerator', 'The Home Depot', 3599),
  ];
  const result = screenListings(rows, SAM, FR);
  assert.deepEqual(result.items.map((item) => [item.seller, item.amount]), [['The Home Depot', 3599]]);
  assert.deepEqual(result.context.map((item) => [item.seller, item.amount]), [['P.C. Richard & Son', 3800]]);
  assert.deepEqual([result.skipped.OTHER_SIZE, result.skipped.OTHER_LAYOUT], [1, 2]);
});

test('a candidate named with another door count than the original\'s needs a listing that states the original\'s count; an unstated count is not read as a match', () => {
  const rows = [lr('Samsung 29 cu. ft. Bespoke French Door Refrigerator', 'Best Buy', 2000), lr('Samsung 29 cu. ft. Bespoke 4-Door French Door Refrigerator', 'Target', 3500)];
  const threeDoor = screenListings(rows, { name: 'Samsung Bespoke 3-Door French Door Refrigerator' }, FR);
  assert.deepEqual(threeDoor.items.map((item) => item.amount), [3500]);
  assert.equal(threeDoor.skipped.DOOR_COUNT_NOT_STATED, 1);
  assert.deepEqual(screenListings(rows, SAM, FR).items.map((item) => item.amount), [2000, 3500], 'a name that states no count restricts nothing');
  assert.deepEqual([doorCountOf('Samsung 4-Door French Door'), doorCountOf('French Door'), layoutOf('Samsung 28 cu ft Side by Side'), layoutOf('Bottom Freezer French Door')], [4, null, 'SIDE_BY_SIDE', 'FRENCH_DOOR']);
});

test('dishwasher width: 24" listings qualify, 18" ones do not, and a listing that states no width is an example, not a price', () => {
  const spec = { kind: 'inches', value: 24 };
  const rows = [lr('Bosch 500 Series 24" Built-In Dishwasher', 'Best Buy', 1249.99), lr('Bosch 500 Series 18" Compact Dishwasher', 'Lowe\'s', 999), lr('Bosch 500 Series Built-under Dishwasher', 'The Home Depot', 1249)];
  const result = screenListings(rows, { name: 'Bosch 500 Series dishwasher' }, { category: 'appliance', spec, focuses: ['SHPM65Z55N'] });
  assert.deepEqual(result.items.map((item) => item.amount), [1249.99]);
  assert.deepEqual(result.context.map((item) => [item.seller, item.amount]), [['The Home Depot', 1249]]);
  assert.equal(result.skipped.OTHER_SIZE, 1);
});

// ---- 4. series matching -----------------------------------------------------------------------------------------------------------------------

test('"500 Series" is an identity, not a quantity: it separates Bosch 500 from 300 and 800, and an unstated line is not read as a match', () => {
  assert.deepEqual(candidateIdentity('Bosch 500 Series dishwasher').lines, ['500']);
  assert.deepEqual(statedLines('Bosch 800 Series 24" Dishwasher and Bosch 300-Series'), ['800', '300']);
  assert.deepEqual(candidateIdentity('Samsung Bespoke 4-Door French Door refrigerator').lines, [], '"4-Door" is a count');
  assert.deepEqual(candidateIdentity('Sony Bravia 8 OLED').series, ['code:8'], 'a one-digit line name still works');
  const spec = { kind: 'inches', value: 24 };
  const rows = [lr('Bosch 500 Series 24" Dishwasher', 'Best Buy', 1249), lr('Bosch 800 Series 24" Dishwasher', 'Lowe\'s', 1499), lr('Bosch 300 Series 24" Dishwasher', 'The Home Depot', 899),
    lr('Bosch Built-in 24" Dishwasher SHP65DM6N', 'Abt', 1249.5)];
  const result = screenListings(rows, { name: 'Bosch 500 Series dishwasher' }, { category: 'appliance', spec, focuses: [] });
  assert.deepEqual(result.items.map((item) => item.seller), ['Best Buy']);
  assert.deepEqual([result.skipped.OTHER_SERIES, result.skipped.SERIES_NOT_STATED], [2, 1]);
});

test('a line number no listing of the brand uses is dropped from the candidate (there is no "KitchenAid 300 Series"): the name is then brand-only, with a stated concern', () => {
  const rows = [lr('KitchenAid 24" Third Rack Dishwasher', 'The Home Depot', 699), lr('KitchenAid 24" 360 Max Jets Dishwasher', 'Yale Appliance', 849.99)];
  const candidate = { name: 'KitchenAid 300 Series dishwasher', why: 'Similar.', concern: null };
  const result = screenListings(rows, candidate, { category: 'appliance', spec: { kind: 'inches', value: 24 }, focuses: [] });
  assert.deepEqual([result.seriesDropped, result.items.length], [['300'], 2], 'matched by brand, and sized');
  const input = { successor: null, suggestions: [candidate] };
  const renamed = withoutUnusedLines(input, [['ALT_1', candidate, result]]);
  assert.deepEqual([renamed.suggestions[0].name, renamed.suggestions[0].concern], ['KitchenAid dishwasher', 'The series number in this name was not found in current listings, so it is matched by brand only.']);
  assert.equal(findResearchClaim(renamed.suggestions[0].concern), null);
  assert.equal(withoutUnusedLines(input, [['ALT_1', candidate, { ...result, seriesDropped: [] }]]), input, 'a real line is left alone');
});

// ---- 5. the original model's own listings ------------------------------------------------------------------------------------------------------

test('Shopping rows that name the original model are its current listings: kept apart from replacement prices, and sellers/hosts are the approved ones', () => {
  const rows = [lr('Bosch SHPM65Z55N 24" Dishwasher', 'Best Buy', 1099), lr('Bosch 500 Series 24" Dishwasher', 'Bosch Home US', 1249), lr('Bosch SHPM65Z55N 24" Dishwasher', 'Some Outlet', 799)];
  const result = screenListings(rows, { name: 'Bosch 500 Series dishwasher' }, { category: 'appliance', spec: { kind: 'inches', value: 24 }, focuses: ['SHPM65Z55N'] });
  assert.deepEqual(result.originals.map((item) => [item.host, item.amount]), [['bestbuy.com', 1099]]);
  assert.deepEqual(result.items.map((item) => [item.host, item.amount]), [['bosch-home.com', 1249]]);
  assert.equal(sellerHost('Bosch Home US'), 'bosch-home.com');
  assert.equal(sellerHost('Bosch Home US - Outlet'), null);
  for (const [seller, host] of [['Plesser\'s Appliances', 'plessers.com'], ['Appliance Factory', 'appliancefactory.com'], ['Town Appliance', 'townappliance.com'], ['Appliance Leaders', 'applianceleaders.com']]) {
    assert.equal(sellerHost(seller), host);
    assert.equal(classifyHost(host)?.sourceClass, 'RETAILER');
    assert.equal(classifyHost(`shop.${host}`), null, 'trusted on the exact host only');
  }
});

test('an original-model listing is context: valid in the contract, never a replacement price, a comparable or the valuation\'s reference', () => {
  const evidence = [{ id: 'e1', subject: 'ORIGINAL', sourceUrl: 'https://www.plessers.com/bosch/shpm65z55n', subjectModel: 'SHPM65Z55N', expectedModel: 'SHPM65Z55N' }, { id: 'e2', subject: 'SUCCESSOR', sourceUrl: 'https://www.bestbuy.com/', observedAt: '2026-10-26' }];
  const base = { category: 'appliance', profile: 'dishwasher', original: { identity: 'Bosch 500 Series SHPM65Z55N dishwasher', confidence: 'high', characteristics: [], uncertainty: null }, requirements: [], successor: { name: 'Bosch 500 Series dishwasher', why: 'The line.', differences: 'Newer.', concern: null, confidence: 'high' }, suggestions: [], clarify: [] };
  const listing = { id: 'p1', kind: 'ORIGINAL_LISTING', subject: 'ORIGINAL', candidate: null, model: 'SHPM65Z55N', amount: { currency: 'USD', low: 1099, high: 1099 }, asOf: null, asOfBasis: 'UNKNOWN', verification: 'SEARCH_SNIPPET', evidenceId: 'e1' };
  const current = { id: 'p2', kind: 'CURRENT_RETAIL_NEW', subject: 'REPLACEMENT', candidate: 'SUCCESSOR', amount: { currency: 'USD', low: 1249, high: 1249 }, asOf: '2026-10-26', asOfBasis: 'OBSERVED', verification: 'SEARCH_LISTING', evidenceId: 'e2' };
  const answer = (prices) => buildResearchResponseV2({ ...base, pricing: { referenceDate: '2026-10-26', tier: { level: 'STANDARD', basis: 'MSRP_EVIDENCE' }, evidence, prices } }, { requestId: 'r', elapsedMs: 0, answerSource: 'AI_ESTIMATE', now: NOW });
  const built = answer([listing, current]);
  assert.deepEqual(built.pricing.prices.map((item) => [item.kind, item.asOf, item.asOfBasis]), [['ORIGINAL_LISTING', null, 'UNKNOWN'], ['CURRENT_RETAIL_NEW', '2026-10-26', 'OBSERVED']]);
  assert.equal(built.pricing.evidence[0].modelRelation, 'EXACT');
  assert.equal(isValidResearchResponseV2(built), true);
  assert.deepEqual([built.pricing.valuation.comparables.map((row) => row.priceId), built.pricing.valuation.reference], [['p2'], null], 'not a comparable, not the reference price');
  assert.deepEqual(built.pricing.tier, { level: 'STANDARD', basis: 'AI_ESTIMATE' }, 'a listing does not back the tier like a list price does');
  // It cannot be filed under a replacement, nor cite a review.
  assert.equal(answer([{ ...listing, subject: 'REPLACEMENT', candidate: 'SUCCESSOR', evidenceId: 'e2' }]).pricing.prices.length, 0);
  const only = buildValuation({ prices: [listing], requirements: [], candidates: [{ key: 'SUCCESSOR', comparison: [] }], tier: { level: 'STANDARD', basis: 'AI_ESTIMATE' }, profile: 'dishwasher', referenceDate: '2026-10-26' });
  assert.deepEqual([only.method, only.reference, only.range], ['INSUFFICIENT', null, null], 'an original listing is no basis for any figure');
});

// ---- 6. replay of the saved Checkpoint C requests ---------------------------------------------------------------------------------------------

async function replay(product) {
  const identify = async (query) => ({ ok: true, ...normalizeIdentification(product.identification, query), meta: { requestSent: true, usage: {}, errorCode: null } });
  const serper = async ({ kind, query }) => {
    if (kind === 'search') return product.history;
    const name = Object.keys(product.listings).find((candidate) => query.startsWith(candidate.slice(0, 60)));
    if (!name) throw Object.assign(new Error('no saved rows'), { code: 'NO_SAVED_ROWS' });
    return product.listings[name];
  };
  const result = await researchLiveV2(product.query, { env: { SERPER_API_KEY: 'replay-key' }, now: () => NOW, identify, serper, serperBudget: { reserve: async (credits) => ({ allowed: true, status: 'allowed', credits }) } });
  const response = buildResearchResponseV2(result.input, { requestId: 'replay', elapsedMs: 0, answerSource: 'AI_ESTIMATE', now: NOW });
  return { result, response };
}
const sellerOf = (response, price) => response.pricing.evidence.find((entry) => entry.id === price.evidenceId)?.sourceName;

test('replay of the saved Samsung RF28R7351SR request: identity corrected, the original\'s own listing shown undated, only eligible 4-door listings set the price', async () => {
  const { result, response } = await replay(FRIDGE);
  assert.equal(isValidResearchResponseV2(response), true);
  assert.equal(response.original.identity, 'Samsung RF28R7351SR French Door Refrigerator');
  assert.deepEqual(response.original.characteristics, ['28 cu ft capacity', 'French door layout']);
  assert.match(response.original.uncertainty, /Counter-depth design; Family Hub touchscreen/);
  assert.deepEqual(response.requirements.map((item) => item.origin), Array(6).fill('CATEGORY_RULE'), 'no AI-added requirement survives: none was supported');
  const original = response.pricing.prices.filter((price) => price.subject === 'ORIGINAL');
  assert.deepEqual(original.map((price) => [price.kind, price.amount.low, price.asOf, price.model, sellerOf(response, price) || 'no source']), [['ORIGINAL_LISTING', 2575, null, 'RF28R7351SR', 'Appliance Leaders'], ['AI_ESTIMATE', 3000, null, null, 'no source']]);
  assert.deepEqual(response.pricing.tier, { level: 'UPPER_PREMIUM', basis: 'AI_ESTIMATE' });
  const { valuation, prices } = response.pricing;
  const setters = valuation.comparables.map((row) => prices.find((price) => price.id === row.priceId));
  assert.deepEqual(setters.map((price) => [sellerOf(response, price), price.amount.low]).sort(), [['Best Buy', 3599.99], ['The Home Depot', 3099]].sort());
  assert.deepEqual([valuation.range, valuation.method], [{ currency: 'USD', low: 3099, high: 3599.99 }, 'PROVISIONAL_LISTINGS']);
  // The base 27 cu ft model, the 3-door units and the 22 cu ft counter-depth ones are not in the range; the P.C. Richard 4-door is an example.
  assert.equal(JSON.stringify(prices).includes('1599'), false);
  const examples = prices.filter((price) => price.sizeConfirmed === false);
  assert.deepEqual(examples.map((price) => [sellerOf(response, price), price.amount.low]), [['P.C. Richard & Son', 3798.97]]);
  assert.deepEqual(result.meta.enrichment.claims, { checked: true, unconfirmed: 2 });
  // The door count is unresolved (3 said, 4 found): the range is conditional on it, and no candidate is called a match.
  assert.match(response.original.uncertainty, /^Door count not settled/);
  assert.equal(response.original.identity.includes('4-door'), false, 'four doors is not stated as a fact about the original');
  for (const candidate of [response.successor, ...response.suggestions]) {
    assert.match(candidate.concern, /original's door count is not settled/, `${candidate.name} carries the open door count`);
    assert.notEqual(candidate.standing, 'RECOMMENDED');
  }
  assert.match(response.successor.concern, /Price is conditional on 4 doors\./);
  // Provisional listings are search listings, never page-verified; an original-model listing is not among the range's comparables.
  assert.equal(prices.every((price) => !/PAGE/.test(price.verification)), true);
  const ownListings = prices.filter((price) => price.kind === 'ORIGINAL_LISTING').map((price) => price.id);
  assert.deepEqual(valuation.comparables.filter((row) => ownListings.includes(row.priceId)), []);
  assert.notEqual(valuation.reference && valuation.reference.priceId, ownListings[0]);
  assert.equal(prices.filter((price) => price.subject === 'ORIGINAL').every((price) => price.kind !== 'MSRP' && price.kind !== 'HISTORICAL_RETAIL'), true, 'no undated or estimated figure is history');
});

test('a door count is settled only when the sources agree on one and the model did not say another; a settled mismatch is a plain mismatch', () => {
  const identification = (identity) => ({ ...identified(FRIDGE).input, original: { ...identified(FRIDGE).input.original, identity } });
  const agree = vetIdentification(identification('Samsung RF28R7351SR 4-Door French Door Refrigerator'), evidenceFor(FRIDGE));
  assert.deepEqual([agree.doors, agree.doorsSettled], [4, true], 'the model and the sources agree');
  assert.doesNotMatch(agree.input.original.uncertainty || '', /Door count/);
  const silent = vetIdentification(identification('Samsung RF28R7351SR French Door Refrigerator'), evidenceFor(FRIDGE));
  assert.deepEqual([silent.doors, silent.doorsSettled], [4, true], 'the model gave no count and nothing contradicts the sources');
  const several = vetIdentification(identification('Samsung RF28R7351SR French Door Refrigerator'), `${evidenceFor(FRIDGE)} samsung 3 door french door rf28r7351sr`);
  assert.deepEqual([several.doors, several.doorsSettled], [null, false], 'sources that disagree leave it open: no count is chosen');
  assert.match(several.input.original.uncertainty, /Door count not settled: sources mention 4 and 3-door\./);
  // Settled: the safeguard stays exact. Unsettled: the same screening, but the result says its price depends on the count.
  const rows = [lr('Samsung 29 cu. ft. Bespoke 4-Door French Door Refrigerator', 'Target', 3500)];
  const threeDoor = { name: 'Samsung Bespoke 3-Door French Door Refrigerator' };
  const settled = screenListings(rows, threeDoor, FR);
  assert.deepEqual(settled.doorNote, { doors: 4, settled: true, named: 3, priced: true });
  assert.equal(doorConcern(settled.doorNote), 'Named 3-door, but the original is 4-door; only listings stating 4 doors were priced.');
  const open = screenListings(rows, SAM, { ...FR, layout: { ...FR.layout, settled: false } });
  assert.deepEqual(open.items.map((item) => item.amount), [3500]);
  assert.equal(doorConcern(open.doorNote), "The original's door count is not settled (sources say 4), so this price is conditional on 4 doors.");
  assert.equal(screenListings(rows, SAM, FR).doorNote, null, 'a settled count with an unnamed candidate needs no note');
  for (const note of [settled.doorNote, open.doorNote, { doors: 4, settled: false, named: 3, priced: true }]) assert.equal(findResearchClaim(doorConcern(note)), null, 'the note is wording the contract relays');
});

test('a candidate that was never priced is still flagged when its name states a door count the original does not settle', () => {
  const input = { successor: { name: 'Samsung 4-Door French Door' }, suggestions: [{ name: 'Whirlpool 3-Door French Door', concern: null }, { name: 'LG 4-Door French Door', concern: 'Own concern.' }, { name: 'GE French Door', concern: null }] };
  const result = withoutUnusedLines(input, [], { kind: 'FRENCH_DOOR', doors: 4, settled: false });
  assert.equal(result.successor.concern, undefined, 'a name that matches the count needs no flag');
  assert.match(result.suggestions[0].concern, /Named 3-door; the original's door count is not settled \(sources say 4\)/);
  assert.equal(result.suggestions[1].concern, 'Own concern.', 'a concern the engine already gave is kept');
  assert.equal(result.suggestions[2].concern, null);
});

test('replay of the saved Bosch SHPM65Z55N request: width and the 500 Series line decide eligibility, the original\'s listings are undated context, the false series name is dropped', async () => {
  const { response } = await replay(DISHWASHER);
  assert.equal(isValidResearchResponseV2(response), true);
  assert.match(response.original.uncertainty, /^Not found in the sources checked: CrystalDry technology/);
  assert.deepEqual(response.requirements.map((item) => item.origin), Array(5).fill('CATEGORY_RULE'));
  const original = response.pricing.prices.filter((price) => price.subject === 'ORIGINAL');
  assert.deepEqual(original.map((price) => [price.kind, price.amount.low, price.asOf, sellerOf(response, price) || 'no source']),
    [['ORIGINAL_LISTING', 899.96, null, 'Appliance Factory'], ['ORIGINAL_LISTING', 1239.94, null, 'Town Appliance'], ['AI_ESTIMATE', 900, null, 'no source']]);
  assert.equal(response.pricing.prices.some((price) => price.kind === 'MSRP'), false, 'no listing is promoted to an MSRP');
  const { valuation, prices } = response.pricing;
  assert.deepEqual(valuation.comparables.map((row) => sellerOf(response, prices.find((price) => price.id === row.priceId))), ['Best Buy'], 'the one listing that states 24" and the 500 Series');
  assert.deepEqual(valuation.range, { currency: 'USD', low: 1249.99, high: 1249.99 });
  const examples = prices.filter((price) => price.sizeConfirmed === false && price.candidate === 'SUCCESSOR').map((price) => [sellerOf(response, price), price.amount.low]);
  assert.deepEqual(examples, [['The Home Depot', 1249], ['Best Buy', 1299.99]], 'width not stated: examples only');
  assert.deepEqual([response.suggestions[0].name, response.suggestions[0].concern], ['KitchenAid dishwasher', 'The series number in this name was not found in current listings, so it is matched by brand only.']);
  assert.equal(response.successor.name, 'Bosch 500 Series dishwasher', 'a real line is kept');
});

test('the range carries a code-derived COMPATIBILITY_NOT_ESTABLISHED note only when it rests on listings priced under an unresolved door count', async () => {
  const fridge = await replay(FRIDGE), dish = await replay(DISHWASHER);
  const codes = (response) => response.pricing.valuation.notes.map((note) => note.code);
  const open = fridge.response.pricing.prices.filter((price) => price.compatibilityOpen === true);
  assert.deepEqual(codes(fridge.response).filter((code) => code === 'COMPATIBILITY_NOT_ESTABLISHED'), ['COMPATIBILITY_NOT_ESTABLISHED']);
  assert.deepEqual(fridge.response.pricing.valuation.comparables.map((row) => row.priceId).sort(), open.map((price) => price.id).sort(), 'the flagged listings are exactly the ones that set the range');
  assert.deepEqual(fridge.response.pricing.valuation.range, { currency: 'USD', low: 3099, high: 3599.99 }, 'the note changes no figure');
  assert.equal(codes(dish.response).includes('COMPATIBILITY_NOT_ESTABLISHED'), false, 'a settled comparison carries no caution');
  assert.equal(dish.response.pricing.prices.some((price) => price.compatibilityOpen), false);
  // Code-owned: a settled door count never flags a price, and the model's own words cannot raise or clear the note.
  const settledRows = [lr('Samsung 29 cu. ft. Bespoke 4-Door French Door Refrigerator', 'Target', 3500)];
  assert.equal(screenListings(settledRows, SAM, FR).items.some((item) => item.compatibilityOpen), false);
  assert.equal(screenListings(settledRows, SAM, { ...FR, layout: { ...FR.layout, settled: false } }).items.every((item) => item.compatibilityOpen === true), true);
  const raw = JSON.parse(JSON.stringify(fridge.result.input));
  raw.warnings = ['COMPATIBILITY_NOT_ESTABLISHED'];
  raw.original.uncertainty = 'Compatibility not fully established.';
  const withoutFlags = JSON.parse(JSON.stringify(dish.result.input));
  withoutFlags.pricing.prices.forEach((price) => { price.compatibilityOpen = true; });
  const forged = buildResearchResponseV2(withoutFlags, { requestId: 'forged', elapsedMs: 0, answerSource: 'AI_ESTIMATE', now: NOW });
  assert.equal(forged.pricing.prices.some((price) => price.compatibilityOpen === true && price.kind !== 'CURRENT_RETAIL_NEW'), false, 'the flag lives on a current listing only');
  assert.equal(buildResearchResponseV2(raw, { requestId: 'warned', elapsedMs: 0, answerSource: 'AI_ESTIMATE', now: NOW }).pricing.valuation.notes.filter((note) => note.code === 'COMPATIBILITY_NOT_ESTABLISHED').length, 1, 'derived once, from the flagged prices');
  // The validator re-derives it: removing the note, or adding it to a range that is not flagged, makes the response invalid.
  const stripped = JSON.parse(JSON.stringify(fridge.response));
  stripped.pricing.valuation.notes = stripped.pricing.valuation.notes.filter((note) => note.code !== 'COMPATIBILITY_NOT_ESTABLISHED');
  assert.equal(isValidResearchResponseV2(stripped), false);
  const added = JSON.parse(JSON.stringify(dish.response));
  added.pricing.valuation.notes.splice(-1, 0, { code: 'COMPATIBILITY_NOT_ESTABLISHED' });
  assert.equal(isValidResearchResponseV2(added), false);
  for (const candidate of [fridge.response.successor, ...fridge.response.suggestions]) assert.notEqual(candidate.standing, 'RECOMMENDED');
  assert.equal(fridge.response.pricing.valuation.verified, false);
});

test('the Checkpoint C pieces leave the earlier ones alone: no query word for a size or family changes a television, and sizes still come from the user first', () => {
  assert.deepEqual(sizeSpec('tv', 'LG C3 OLED TV, 55 inch'), { kind: 'inches', value: 55 });
  assert.deepEqual(sizeSpec('refrigerator', 'Samsung RF28R7351SR refrigerator'), null, 'the user did not say a capacity; the checked characteristics supply it');
});
