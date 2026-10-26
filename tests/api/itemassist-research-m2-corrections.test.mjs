import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildResearchResponseV2, isValidResearchResponseV2 } from '../../lib/itemassist-research/contract-v2.js';
import { CATEGORY_SOURCE, detectCategory, settleCategory } from '../../lib/itemassist-research/enrich/category.js';
import { extractHistory } from '../../lib/itemassist-research/enrich/history.js';
import { normalizeIdentification } from '../../lib/itemassist-research/enrich/identify.js';
import { screenListings, sellerHost } from '../../lib/itemassist-research/enrich/listings.js';
import { classifyHost } from '../../lib/itemassist-research/evidence.js';
import { researchLiveV2, shoppingQuery } from '../../lib/itemassist-research/enrich/orchestrate.js';
import { FAMILY_AGREEMENT_RATIO, buildValuation } from '../../lib/itemassist-research/pricing.js';
import { PROFILES, buildRequirements } from '../../lib/itemassist-research/requirements.js';
import { focusTokens, sizeSpec } from '../../lib/itemassist-research/enrich/product-tokens.js';

// OFFLINE ONLY. Regression tests for the three defects the first live request (Checkpoint B, "LG C3 OLED TV, 55 inch", 2026-10-26) exposed:
// a 42-inch price taken as the 55-inch MSRP, a television filed as generic electronics, and listing screening that let protection-plan,
// unsized and other-family rows into one wide range. The replay at the end runs the saved rows of that request through the real pipeline.
const CHECKPOINT = JSON.parse(readFileSync(new URL('../fixtures/itemassist-research/checkpoint-b-lg-c3.json', import.meta.url), 'utf8'));
const NOW = Date.UTC(2026, 9, 26, 12);
const histOf = (rows, query = 'LG C3 55 inch OLED', category = 'tv') => extractHistory(rows, { query, category, now: NOW });
const row = (over) => ({ title: 'LG C3 OLED TV', url: 'https://www.lg.com/us/newsroom/c3', snippet: 'The LG C3 55-inch class OLED has an MSRP of $1,899.', date: '2023-02-28', ...over });
const only = (snippet, over = {}) => histOf([row({ snippet, ...over })]);

// ---- 1. historical attribution: a size after the price, lineup wording, contradictions ---------------------------------------------------

test('the Tom\'s Guide snippet: the 55-inch launch price $1,899 is kept, the 42-inch "cheapest model starts at $1,399" is not the 55-inch price', () => {
  const tomsGuide = CHECKPOINT.history.find((entry) => entry.url.includes('tomsguide.com'));
  const result = histOf([tomsGuide], CHECKPOINT.query);
  assert.deepEqual(result.items.map((item) => [item.kind, item.amount, item.model, item.publishedAt]), [['HISTORICAL_RETAIL', 1899, 'OLED55C3PUA', '2023-03-02']]);
  assert.equal(result.skipped.OTHER_MODEL, 1, 'the $2,499 sits beside the G3');
  assert.equal(result.skipped.OTHER_SIZE, 1, 'the $1,399 is followed by "for a 42-inch model"');
  assert.equal(JSON.stringify(result.items).includes('1399'), false);
});

test('a size AFTER the price counts as much as one before it: "$X for a 42-inch model" is refused, "$X for the 55-inch" is kept', () => {
  assert.equal(only('LG C3 OLED: $1,899 for the 55-inch model, an excellent TV.').items[0]?.amount, 1899);
  const other = only('LG C3 OLED: $1,399 for the 42-inch model, a smaller TV.');
  assert.deepEqual([other.items.length, other.skipped.OTHER_SIZE], [0, 1]);
  assert.equal(only('LG C3 OLED: $1,899 for the 55" model.').items[0]?.amount, 1899);
});

test('a model AFTER the price: "for the OLED55C3PUA" is the original, "for the OLED55G3PUA" is not', () => {
  const own = only('Pricing starts with $1,899 for the OLED55C3PUA.', { title: 'LG OLED lineup' });
  assert.deepEqual(own.items.map((item) => [item.amount, item.model]), [[1899, 'OLED55C3PUA']]);
  const other = only('Pricing starts with $2,499 for the OLED55G3PUA.', { title: 'LG OLED lineup' });
  assert.deepEqual([other.items.length, other.skipped.OTHER_MODEL], [0, 1]);
});

test('a table that labels each price keeps each label with its own price, whichever order the sizes come in', () => {
  const table = 'LG C3 OLED prices: 42" $1,299.99 48" $1,399.99 55" $1,799.99 65" $2,199.99 77" $3,299.99 83" $5,299.99';
  assert.deepEqual(only(table).items.map((item) => item.amount), [1799.99]);
  const labelled = 'LG C3 OLED: OLED48C3PUA: $1,399 OLED55C3PUA: $1,899 OLED65C3PUA: $2,499';
  assert.deepEqual(only(labelled).items.map((item) => item.amount), [1899]);
  // "A at $X, B at $Y": the label of the next price is not a size or model stated beside this one.
  assert.deepEqual(only('LG C3 OLED launched at 42-inch at $1,299, 55-inch at $1,799.99, 65-inch at $2,499.99, 77-inch at $3,299.99.').items.map((item) => item.amount), [1799.99]);
  assert.deepEqual(only('The LG C3 OLED starts at $1,299 for the 42-inch, with the 55-inch at $1,799.').items.map((item) => item.amount), [1799], 'the 42-inch lineup price is refused, the 55-inch price beside it is kept');
});

test('lineup wording ("starts at", "the cheapest model", "from $X") is not assigned to the requested variant unless the same phrase names its size or full model', () => {
  for (const snippet of ['The LG C3 OLED starts at $1,399.', 'The cheapest LG C3 OLED model is $1,399.', 'LG C3 OLED TVs from $1,399.', 'LG C3 OLED prices start at $1,399.']) {
    const result = only(snippet);
    assert.deepEqual([result.items.length, result.skipped.LINEUP_PRICE], [0, 1], snippet);
  }
  const sized = only('The LG C3 55-inch OLED starts at $1,899.');
  assert.deepEqual(sized.items.map((item) => [item.kind, item.amount]), [['MSRP', 1899]], 'the phrase names this size');
  const coded = only('The OLED55C3PUA starts at $1,899.', { title: 'LG OLED' });
  assert.deepEqual(coded.items.map((item) => item.amount), [1899], 'the phrase names this exact model');
});

test('contradictory sizes or models beside one price refuse it instead of picking a side', () => {
  const contradictory = only('LG C3 OLED in 55-inch and 65-inch, priced at $1,899 for both.');
  assert.deepEqual([contradictory.items.length, contradictory.skipped.CONTRADICTORY_SIZE], [0, 1]);
  assert.equal(only('LG C3 OLED 55-inch, now $1,899, or the G3 at $2,499.').items.length, 0);
  assert.equal(only('LG C3 55-inch OLED MSRP $1,899 versus the OLED55G3PUA.', { title: 'LG C3' }).items.length, 0);
});

test('MSRP, a launch announcement\'s price and a dated retail price stay three distinct things; nothing is averaged', () => {
  const rows = [
    row({ snippet: 'The LG C3 55-inch class OLED has an MSRP of $1,899.' }),
    row({ url: 'https://www.tomsguide.com/news/c3-prices', date: '2023-03-02', snippet: '55-inch OLED55C3PUA: $1,899. LG C3 OLED.' }),
    row({ url: 'https://www.bestbuy.com/site/c3', date: '2023-04-02', snippet: 'LG C3 55-inch OLED, was $1,999.' }),
  ];
  const result = histOf(rows);
  assert.deepEqual(result.items.map((item) => [item.kind, item.amount, new URL(item.url).hostname]),
    [['MSRP', 1899, 'www.lg.com'], ['HISTORICAL_RETAIL', 1899, 'www.tomsguide.com'], ['HISTORICAL_RETAIL', 1999, 'www.bestbuy.com']]);
  // Every kept amount is a figure a source stated: no mean, median or blended price is ever produced.
  assert.deepEqual(new Set(result.items.map((item) => item.amount)), new Set([1899, 1999]));
});

// ---- 2. category normalisation -------------------------------------------------------------------------------------------------------------

const ELECTRONICS_TV = { ...CHECKPOINT.identification, category: 'electronics', profile: 'electronics' };

test('a recognised LG C3 OLED the model filed as "electronics" is a television, with the television essentials and no storage requirement', () => {
  const result = normalizeIdentification(ELECTRONICS_TV, CHECKPOINT.query);
  assert.deepEqual([result.category, result.profile, result.categorySource], ['tv', 'tv', CATEGORY_SOURCE.QUERY]);
  const response = buildResearchResponseV2({ ...result.input, pricing: { referenceDate: '2026-10-26', tier: { level: 'PREMIUM', basis: 'AI_ESTIMATE' }, evidence: [], prices: [] } }, { requestId: 'r', elapsedMs: 0, answerSource: 'AI_ESTIMATE', now: NOW });
  const essentials = response.requirements.filter((item) => item.importance === 'ESSENTIAL').map((item) => item.key);
  assert.deepEqual(essentials, ['screenSize', 'resolution', 'displayClass']);
  assert.equal(response.requirements.some((item) => /storage|capacity/i.test(item.text)), false, 'no storage or capacity requirement for a television');
  assert.deepEqual(response.requirements.slice(0, 3).map((item) => item.text), PROFILES.tv.slice(0, 3).map((item) => item.text));
});

test('the category is settled from the user\'s words, then the description, then the reply; every other "electronics" becomes the generic profile', () => {
  assert.deepEqual(detectCategory('LG C3 OLED TV, 55 inch'), { category: 'tv', profile: 'tv' });
  assert.deepEqual(detectCategory('Samsung 28 cu ft French door refrigerator'), { category: 'refrigerator', profile: 'refrigerator' });
  assert.deepEqual(detectCategory('LG WM4000 front load washer'), { category: 'appliance', profile: 'washer' });
  assert.deepEqual(detectCategory('MacBook Air 13 inch'), { category: 'electronics', profile: 'electronics' });
  assert.equal(detectCategory('LG washer dryer set'), null, 'two families name nothing');
  assert.equal(detectCategory('OLED phone'), null, 'a phone is not a television');
  assert.equal(detectCategory('mid-range thing'), null, '"range" alone is not a cooking range');
  const reply = { category: 'electronics', profile: 'electronics', identity: 'Acme Z9', characteristics: [] };
  assert.deepEqual(settleCategory({ query: 'Acme Z9', ...reply }), { category: 'other', profile: 'other', source: CATEGORY_SOURCE.MODEL_GENERALISED });
  assert.equal(settleCategory({ query: 'Acme Z9', ...reply, identity: 'Acme Z9 55-inch OLED TV' }).category, 'tv', 'the reply\'s own description counts');
  assert.deepEqual(settleCategory({ query: 'Acme Z9 laptop', ...reply }).profile, 'electronics', 'a laptop does have storage to match');
  assert.deepEqual(settleCategory({ query: 'Acme Z9', category: 'refrigerator', profile: 'refrigerator', identity: 'Acme Z9', characteristics: [] }).source, CATEGORY_SOURCE.MODEL, 'with nothing to override it the model\'s category stands');
});

test('an ambiguous item never gets the storage requirement: it gets the generic "same type, similar size" essentials', () => {
  const result = normalizeIdentification({ ...ELECTRONICS_TV, original: { identity: 'Acme Z9 device', confidence: 'low', characteristics: [] } }, 'Acme Z9');
  assert.deepEqual([result.category, result.profile], ['other', 'other']);
  const response = buildResearchResponseV2({ ...result.input, pricing: { referenceDate: '2026-10-26', tier: { level: 'UNKNOWN', basis: 'UNKNOWN' }, evidence: [], prices: [] } }, { requestId: 'r', elapsedMs: 0, answerSource: 'AI_ESTIMATE', now: NOW });
  assert.deepEqual(response.requirements.filter((item) => item.importance === 'ESSENTIAL').map((item) => item.key), ['type', 'size']);
});

test('the Shopping query keeps the category term for a television the model called electronics', () => {
  const result = normalizeIdentification(ELECTRONICS_TV, CHECKPOINT.query);
  const spec = sizeSpec(result.category, CHECKPOINT.query);
  assert.equal(shoppingQuery({ name: 'LG C-series OLED' }, { category: result.category, profile: result.profile, spec }), 'LG C-series OLED 55 inch TV');
  assert.equal(shoppingQuery({ name: 'LG C-series OLED' }, { category: 'electronics', profile: 'electronics', spec }), 'LG C-series OLED 55 inch', 'before: no noun');
});

// ---- 3. listing screening and the valuation ----------------------------------------------------------------------------------------------

const lr = (title, seller, price) => ({ title, seller, price });
const TV = { category: 'tv', spec: { kind: 'inches', value: 55 }, focuses: ['C3'] };
const C_SERIES = { name: 'LG C-series OLED' };
const BASE = 'LG 55" OLED evo C6 4K Smart TV';
const amountsOf = (result) => result.items.map((item) => item.amount);

test('protection plans, extended warranties and other separately priced services are never part of a television\'s price', () => {
  const rows = [
    lr(`${BASE} with 2 Year Amber Protection Plan`, 'Best Buy', 999.99), lr(`${BASE} with 5 Year Amber Protection Plan (2026)`, 'Target', 1109.99),
    lr(`${BASE} & Extended Protection Plan`, 'Walmart', 1998), lr(`${BASE} and 4 YR Extended Warranty`, 'Costco', 1300), lr(`${BASE} + SquareTrade care plan`, 'Newegg', 1200),
    lr(`${BASE} w/ Dolby Atmos, Vision, HDR10`, 'Crutchfield', 1100),
  ];
  const result = screenListings(rows, C_SERIES, TV);
  assert.deepEqual(amountsOf(result), [1100], 'a feature list after "w/" is not a service');
  assert.equal(result.skipped.SERVICE_PACKAGE + (result.skipped.BUNDLE || 0), 5);
  assert.ok(result.skipped.SERVICE_PACKAGE >= 3);
});

test('add-on hardware after "with" is a bundle even when several words come first (a mount, cable or surge protector)', () => {
  const rows = [
    lr(`${BASE} with a Kanto PMX800 Full Motion Dual Stud Mount`, 'Best Buy', 1700), lr(`${BASE} with an AudioQuest SKY 3m HDMI Cable`, 'Target', 1500),
    lr(`${BASE} with an Austere 5s-ps4-us1 4-Outlet Power Surge Protector`, 'Walmart', 1600), lr(BASE, 'Newegg', 1000),
  ];
  const result = screenListings(rows, C_SERIES, TV);
  assert.deepEqual(amountsOf(result), [1000]);
  assert.equal(result.skipped.BUNDLE, 3);
});

test('a television listing that states no screen size has not confirmed one: it is context, and it never sets or widens the price', () => {
  const rows = [lr('LG C6 OLED evo AI Smart 4K TV', 'Best Buy', 999.99), lr('LG OLED evo AI C5 4K Smart TV', 'Crutchfield', 899), lr('LG 55" OLED evo AI 4K C5 Smart TV', 'Newegg', 1096)];
  const result = screenListings(rows, C_SERIES, TV);
  assert.deepEqual(amountsOf(result), [1096], 'the unsized rows, though cheaper, do not widen the range');
  assert.deepEqual(result.context.map((item) => [item.seller, item.amount, item.reason]), [['Crutchfield', 899, 'SIZE_NOT_STATED'], ['Best Buy', 999.99, 'SIZE_NOT_STATED']]);
  // No size asked for at all: nothing can be confirmed, so no television listing is a price.
  const noSize = screenListings(rows, C_SERIES, { ...TV, spec: null });
  assert.deepEqual([noSize.items.length, noSize.context.length], [0, 2], 'the lowest and the highest unsized listing are kept as examples');
});

test('an older generation of the same lettered series is not a replacement ("C2" for a "C3"), a newer one is', () => {
  const rows = [lr('LG 55" evo OLED C2 Series 4K Smart TV', 'Walmart', 902.99), lr('LG 55" OLED evo C4 4K Smart TV', 'Best Buy', 1199), lr('LG 55" OLED evo AI 4K C5 Smart TV', 'Newegg', 1096)];
  const result = screenListings(rows, C_SERIES, TV);
  assert.deepEqual(amountsOf(result), [1096, 1199]);
  assert.equal(result.skipped.OLDER_GENERATION, 1);
});

test('mismatched variants, used, rental and outlier rows stay out of the primary pool', () => {
  const rows = [
    lr('LG 65" OLED evo C6 4K Smart TV', 'Best Buy', 1600), lr('LG 55" C6 QNED Smart TV', 'Target', 700), lr(`Used ${BASE}`, 'Newegg', 600), lr(`${BASE} rental $39/month`, 'Walmart', 39),
    lr(BASE, 'Best Buy', 1100), lr(BASE, 'Target', 1200), lr(BASE, 'Costco', 1250), lr(BASE, 'Abt', 99_999),
  ];
  const result = screenListings(rows, C_SERIES, TV);
  assert.deepEqual(amountsOf(result), [1100, 1200, 1250]);
  assert.ok(result.skipped.OTHER_SIZE && result.skipped.OTHER_DISPLAY_CLASS && result.skipped.NOT_NEW && result.skipped.RENTAL && result.skipped.PRICE_OUTLIER);
});

const current = (id, candidate, amount) => ({ id, kind: 'CURRENT_RETAIL_NEW', subject: 'REPLACEMENT', candidate, model: null, amount: { currency: 'USD', low: amount, high: amount }, asOf: '2026-10-26', asOfBasis: 'OBSERVED', verification: 'SEARCH_LISTING', evidenceId: 'e1' });
const candidates = ['SUCCESSOR', 'ALT_1', 'ALT_2'].map((key) => ({ key, comparison: [] }));
const value = (prices) => buildValuation({ prices, requirements: [], candidates, tier: { level: 'PREMIUM', basis: 'AI_ESTIMATE' }, profile: 'tv', referenceDate: '2026-10-26' });

test('cross-family contamination: families whose prices disagree never share one interval; the successor sets it and the others stay visible', () => {
  const wide = value([current('p1', 'SUCCESSOR', 999.99), current('p2', 'SUCCESSOR', 1096), current('p3', 'ALT_1', 1398), current('p4', 'ALT_1', 2359.41)]);
  assert.deepEqual(wide.range, { currency: 'USD', low: 999.99, high: 1096 }, 'the C-series prices set the range; the Sony prices do not stretch it to $2,359.41');
  assert.deepEqual(wide.comparables.map((item) => item.priceId), ['p1', 'p2']);
  assert.deepEqual(wide.excluded.map((item) => item.candidate), ['ALT_2'], 'the Sony family is not excluded (only ALT_2, which has no price at all, is)');
  assert.ok(wide.notes.some((note) => note.code === 'OTHER_FAMILIES_SEPARATE' && note.count === 1));
  assert.equal(wide.confidence, 'MEDIUM');
  // Families that agree within the ratio still share one range (the demo fixtures rely on it).
  const agreeing = value([current('p1', 'SUCCESSOR', 1000), current('p2', 'ALT_1', 1000 * FAMILY_AGREEMENT_RATIO)]);
  assert.deepEqual(agreeing.range, { currency: 'USD', low: 1000, high: 1500 });
  assert.equal(agreeing.notes.some((note) => note.code === 'OTHER_FAMILIES_SEPARATE'), false);
  assert.equal(value([current('p1', 'SUCCESSOR', 1000), current('p2', 'ALT_1', 1501)]).range.high, 1000);
});

test('with no successor price the best-supported alternative leads, and a page-confirmed family outranks a listing-only successor', () => {
  const alt = value([current('p1', 'ALT_1', 1400), current('p2', 'ALT_2', 2400), current('p3', 'ALT_2', 2450)]);
  assert.deepEqual([alt.range.low, alt.range.high, alt.comparables.map((item) => item.candidate)], [2400, 2450, ['ALT_2', 'ALT_2']], 'the family with more prices leads');
  const confirmed = value([current('p1', 'SUCCESSOR', 1000), { ...current('p2', 'ALT_1', 2000), verification: 'VERIFIED_PAGE' }]);
  assert.deepEqual([confirmed.method, confirmed.range.low, confirmed.comparables.map((item) => item.candidate)], ['VERIFIED_SINGLE', 2000, ['ALT_1']]);
});

// ---- 3b. usability pass: size-not-confirmed examples, listing anchor, seller name, requirement de-duplication --------------------------------

test('"B&H Photo-Video-Audio" is a recognised seller on the already approved B&H domain, and nothing wider is', () => {
  for (const name of ['B&H Photo-Video-Audio', 'B&H Photo Video', 'B&H Photo', 'B&H', 'B & H Photo-Video']) assert.equal(sellerHost(name), 'bhphotovideo.com', name);
  for (const name of ['B&H Photo-Video-Audio - Walts TV', 'Newegg.com - B&H Photo-Video-Audio', 'B&H Photo-Video-Audio Outlet', 'BH Photo Video Clearance']) assert.equal(sellerHost(name), null, name);
  assert.equal(classifyHost('bhphotovideo.com')?.sourceClass, 'RETAILER');
  assert.equal(classifyHost('bhphotovideo-audio.com'), null, 'the host allowlist is unchanged');
});

const unsized = (id, candidate, amount) => ({ ...current(id, candidate, amount), sizeConfirmed: false });

test('a listing that does not confirm the screen size never sets, widens or confirms anything: it is an example', () => {
  const alone = value([unsized('p1', 'SUCCESSOR', 899)]);
  assert.deepEqual([alone.method, alone.range, alone.comparables, alone.excluded.map((item) => item.reason)], ['INSUFFICIENT', null, [], ['NO_CURRENT_PRICE', 'NO_CURRENT_PRICE', 'NO_CURRENT_PRICE']]);
  const beside = value([current('p1', 'SUCCESSOR', 1096), unsized('p2', 'SUCCESSOR', 899), unsized('p3', 'ALT_1', 2359.41)]);
  assert.deepEqual([beside.range, beside.comparables.map((item) => item.priceId)], [{ currency: 'USD', low: 1096, high: 1096 }, ['p1']]);
  assert.equal(beside.notes.some((note) => note.code === 'OTHER_FAMILIES_SEPARATE'), false, 'an unsized example is not a family that disagrees');
  assert.deepEqual(beside.excluded.map((item) => item.candidate), ['ALT_1', 'ALT_2'], 'a candidate with only examples has no price in the range');
});

test('the size flag survives only on a current listing; a forged flag on any other price is dropped', () => {
  const evidence = [{ id: 'e1', subject: 'SUCCESSOR', sourceUrl: 'https://www.bestbuy.com/', observedAt: '2026-10-26' }, { id: 'e2', subject: 'ORIGINAL', sourceUrl: 'https://www.lg.com/us/newsroom/c3', publishedAt: '2023-02-28' }];
  const base = { category: 'tv', profile: 'tv', original: { identity: 'LG C3', confidence: 'high', characteristics: [], uncertainty: null }, requirements: [], successor: { name: 'LG C-series OLED', why: 'The same line.', differences: 'Newer.', concern: null, confidence: 'high' }, suggestions: [], clarify: [] };
  const listing = { kind: 'CURRENT_RETAIL_NEW', subject: 'REPLACEMENT', candidate: 'SUCCESSOR', amount: { currency: 'USD', low: 999.99, high: 999.99 }, asOf: '2026-10-26', asOfBasis: 'OBSERVED', verification: 'SEARCH_LISTING', evidenceId: 'e1' };
  const msrp = { kind: 'MSRP', subject: 'ORIGINAL', candidate: null, amount: { currency: 'USD', low: 1899, high: 1899 }, asOf: '2023-02-28', asOfBasis: 'PUBLISHED', verification: 'SEARCH_SNIPPET', evidenceId: 'e2' };
  const answer = (prices) => buildResearchResponseV2({ ...base, pricing: { referenceDate: '2026-10-26', tier: { level: 'PREMIUM', basis: 'MSRP_EVIDENCE' }, evidence, prices } }, { requestId: 'r', elapsedMs: 0, answerSource: 'AI_ESTIMATE', now: NOW });
  const built = answer([{ id: 'p1', ...msrp, sizeConfirmed: false }, { id: 'p2', ...listing, sizeConfirmed: false }, { id: 'p3', ...listing, amount: { currency: 'USD', low: 1100, high: 1100 }, sizeConfirmed: true }, { id: 'p4', ...listing, amount: { currency: 'USD', low: 1200, high: 1200 } }]);
  assert.deepEqual(built.pricing.prices.map((item) => [item.id, item.sizeConfirmed]), [['p1', undefined], ['p2', false], ['p3', undefined], ['p4', undefined]]);
  assert.deepEqual(built.pricing.valuation.comparables.map((item) => item.priceId), ['p3', 'p4'], 'only the prices that do not carry the flag set the range');
  assert.equal(isValidResearchResponseV2(built), true);
  // The flag cannot be added or removed after the fact: the validator re-derives the valuation from it.
  const stripped = JSON.parse(JSON.stringify(built));
  delete stripped.pricing.prices[1].sizeConfirmed;
  assert.equal(isValidResearchResponseV2(stripped), false);
});

test('one qualifying listing stays a single price: no interval is manufactured around it, and broader guidance appears only when there is no current price at all', () => {
  const reference = { id: 'p9', kind: 'HISTORICAL_RETAIL', subject: 'ORIGINAL', candidate: null, amount: { currency: 'USD', low: 1899, high: 1899 }, asOf: '2023-03-02', asOfBasis: 'PUBLISHED', verification: 'SEARCH_SNIPPET', evidenceId: 'e1' };
  const one = value([current('p1', 'SUCCESSOR', 1096), reference]);
  assert.deepEqual([one.method, one.range, one.comparables.length], ['PROVISIONAL_LISTINGS', { currency: 'USD', low: 1096, high: 1096 }, 1]);
  assert.equal(one.notes.some((note) => note.code === 'TIER_ESTIMATE_BAND'), false, 'the original\'s price never widens a current anchor into a band');
  // No current price at all: the labelled estimate from the original's market tier and dated price is still given, and says so.
  const none = value([reference]);
  assert.equal(none.method, 'HISTORICAL_TIER_ESTIMATE');
  assert.ok(none.notes.some((note) => note.code === 'TIER_ESTIMATE_BAND'));
  // Only unsized examples are "no current price" too, not an interval built from them.
  const examplesOnly = value([unsized('p1', 'SUCCESSOR', 899), unsized('p2', 'SUCCESSOR', 1399), reference]);
  assert.equal(examplesOnly.method, 'HISTORICAL_TIER_ESTIMATE');
  assert.deepEqual(examplesOnly.comparables, []);
});

test('requirements: a restatement of a code-owned criterion is dropped, other additions keep their place, and no code-owned criterion is ever crowded out', () => {
  const ai = (text, importance = 'IMPORTANT') => ({ text, importance });
  const built = buildRequirements([ai('55 inch screen size'), ai('OLED display technology'), ai('Four HDMI 2.1 ports', 'ESSENTIAL'), ai('120Hz refresh rate'), ai('Peak brightness for a bright room'), ai('Same remote style', 'MINOR'), ai('Wall-mountable')], 'tv');
  assert.deepEqual(built.items.map((item) => item.text), [...PROFILES.tv.slice(0, 3).map((rule) => rule.text), ...PROFILES.tv.slice(3, 6).map((rule) => rule.text), 'Peak brightness for a bright room', PROFILES.tv[6].text],
    'essentials first, then the important ones (code-owned before added), then the minor code-owned one');
  const owned = built.items.filter((item) => item.origin === 'CATEGORY_RULE');
  assert.equal(owned.length, PROFILES.tv.length, 'all seven code-owned criteria are present');
  assert.deepEqual(built.items.filter((item) => item.origin === 'AI_ESTIMATE').map((item) => item.text), ['Peak brightness for a bright room'], 'one place is left, and the most important non-repeating addition takes it');
  assert.equal(built.items.length, 8);
  assert.deepEqual(built.notes, [], 'a dropped restatement is not recorded as an essential downgrade');
  // Idempotent: the validator rebuilds the stored list and must get the same list back.
  assert.deepEqual(buildRequirements(built.items, 'tv').items, built.items);
  // With room to spare every non-repeating addition stays, lower priorities included.
  const roomy = buildRequirements([ai('Peak brightness for a bright room', 'MINOR'), ai('Same remote style', 'MINOR')], 'other');
  assert.deepEqual(roomy.items.map((item) => item.text), ['Same type of product', 'Similar size or capacity', 'The key features you use most', 'Peak brightness for a bright room', 'Same remote style']);
});

// ---- 4. replay of the saved Checkpoint B request -------------------------------------------------------------------------------------------

async function replay(overrides = {}) {
  const identify = async (query) => ({ ok: true, ...normalizeIdentification(CHECKPOINT.identification, query), meta: { requestSent: true, usage: {}, errorCode: null } });
  const asked = { search: [], shopping: [] };
  const serper = async ({ kind, query }) => {
    asked[kind].push(query);
    if (kind === 'search') return CHECKPOINT.history;
    return CHECKPOINT.listings[query.replace(/ TV$/, '')];
  };
  const result = await researchLiveV2(CHECKPOINT.query, {
    env: { SERPER_API_KEY: 'replay-key' }, now: () => NOW, identify, serper, serperBudget: { reserve: async (credits) => ({ allowed: true, status: 'allowed', credits }) }, ...overrides,
  });
  const response = buildResearchResponseV2(result.input, { requestId: 'replay', elapsedMs: 0, answerSource: 'AI_ESTIMATE', now: NOW });
  return { result, response, asked };
}

test('replay of the saved LG C3 55" request: television category, the 55-inch launch price only, no plan bundles, and a headline from the successor family alone', async () => {
  const { result, response, asked } = await replay();
  assert.equal(isValidResearchResponseV2(response), true, 'the corrected answer passes the validator that re-derives every typed block');
  // Same budget as the live request: one search and two Shopping queries, now carrying the category noun.
  assert.deepEqual(asked, { search: ['LG C3 OLED TV, 55 inch launch price MSRP'], shopping: ['LG C-series OLED 55 inch TV', 'Sony Bravia 8 OLED 55 inch TV'] });
  assert.deepEqual([response.category, response.profile], ['tv', 'tv']);
  assert.deepEqual(response.requirements.filter((item) => item.importance === 'ESSENTIAL').map((item) => item.key), ['screenSize', 'resolution', 'displayClass']);

  const { prices, valuation } = response.pricing;
  assert.deepEqual(prices.filter((item) => item.subject === 'ORIGINAL').map((item) => [item.kind, item.amount.low, item.model]), [['HISTORICAL_RETAIL', 1899, 'OLED55C3PUA']]);
  assert.equal(JSON.stringify(prices).includes('1399'), false, 'the 42-inch price is gone');
  const replacement = prices.filter((item) => item.subject === 'REPLACEMENT');
  assert.deepEqual(replacement.filter((item) => item.sizeConfirmed !== false).map((item) => [item.candidate, item.amount.low, item.verification]), [['SUCCESSOR', 1096, 'SEARCH_LISTING']]);
  // The unsized listings are examples marked "size not confirmed" (the unsized Target Sony listing among them); none is a comparable.
  assert.deepEqual(replacement.filter((item) => item.sizeConfirmed === false).map((item) => [item.candidate, item.amount.low]).sort(), [['ALT_1', 1398], ['ALT_1', 2359.41], ['SUCCESSOR', 999.99], ['SUCCESSOR', 999.99]]);
  assert.equal(valuation.comparables.length, 1);
  assert.deepEqual(response.pricing.evidence.filter((entry) => entry.subject === 'SUCCESSOR').map((entry) => entry.sourceDomain), ['newegg.com', 'bestbuy.com', 'bhphotovideo.com'], 'B&H Photo-Video-Audio is now a recognised seller');
  assert.deepEqual([valuation.method, valuation.range, valuation.confidence, valuation.verified], ['PROVISIONAL_LISTINGS', { currency: 'USD', low: 1096, high: 1096 }, 'LOW', false]);
  assert.deepEqual(valuation.excluded.map((item) => [item.candidate, item.reason]), [['ALT_1', 'NO_CURRENT_PRICE'], ['ALT_2', 'NO_CURRENT_PRICE']]);
  assert.deepEqual(valuation.reference, { priceId: 'p1', kind: 'HISTORICAL_RETAIL' }, 'a launch-announcement price is past retail, not an MSRP');
  assert.ok(valuation.notes.some((note) => note.code === 'CURRENT_BELOW_ORIGINAL'));
  assert.equal(prices.some((item) => item.verification === 'VERIFIED_PAGE'), false);
  assert.deepEqual([response.successor, ...response.suggestions].map((item) => item.modelStatus), ['FAMILY_LEVEL', 'FAMILY_LEVEL', 'FAMILY_LEVEL'], 'no model identity is invented');
  // The listings that were set aside are counted as context for the researcher, never priced.
  assert.deepEqual(result.meta.enrichment.sizeNotStated, { SUCCESSOR: 2, ALT_1: 2 });
  assert.deepEqual(response.requirements.map((item) => item.origin), Array(7).fill('CATEGORY_RULE'), 'the model\'s restatements of the television criteria are dropped, and every code-owned criterion is kept');
  assert.equal(result.meta.enrichment.category, CATEGORY_SOURCE.QUERY);
});

test('replay: the focus tokens and size asked about are read from the user\'s own words, and no price is attributed to another size or product', async () => {
  assert.deepEqual([focusTokens(CHECKPOINT.query), sizeSpec('tv', CHECKPOINT.query)], [['C3'], { kind: 'inches', value: 55 }]);
  const { response } = await replay();
  const text = JSON.stringify(response.pricing);
  for (const wrong of ['Amber', 'Protection', 'Warranty', '1399']) assert.equal(text.includes(wrong), false, wrong);
  // The prices the unsized listings carry are present only as examples, each marked so; none is in the valuation.
  const marked = response.pricing.prices.filter((item) => [999.99, 1398, 2359.41].includes(item.amount.low));
  assert.equal(marked.length, 4);
  assert.equal(marked.every((item) => item.sizeConfirmed === false), true);
  assert.equal(marked.some((item) => response.pricing.valuation.comparables.some((row) => row.priceId === item.id)), false);
});

test('replay without Shopping results falls back to the labelled band from the dated launch price, never to a listing price', async () => {
  const { response } = await replay({ serper: async ({ kind }) => (kind === 'search' ? CHECKPOINT.history : []) });
  assert.equal(isValidResearchResponseV2(response), true);
  assert.equal(response.pricing.valuation.method, 'HISTORICAL_TIER_ESTIMATE');
  assert.equal(response.pricing.prices.some((item) => item.kind === 'CURRENT_RETAIL_NEW'), false);
});
