import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RCV_ACV_ITEM_IDS,
  parseCandidateYears,
  hasSingleResolvedYear,
  ageFromYear,
  isCleanSingleYear,
  matchRcvAcvItemFromCategoryText,
  mapDecoderCategoryToItemId,
  buildRcvAcvUrl,
} from '../../lib/rcv-acv-linkout-helpers.js';
import { findRcvAcvItem } from '../../lib/calculators/rcv-acv-items.js';

// 11. query params cannot override canonical Claims Pages rates — the linkout module
// only ever emits item *ids*, and every id it can emit must resolve to a real,
// CONFIRMED dataset entry so the calculator always loads the rate from
// rcv-acv-items.js itself, never from anything computed here.
test('every RCV_ACV_ITEM_IDS value resolves to a real, CONFIRMED rcv-acv-items.js entry', () => {
  for (const id of Object.values(RCV_ACV_ITEM_IDS)) {
    const item = findRcvAcvItem(id);
    assert.ok(item, `id "${id}" does not exist in rcv-acv-items.js`);
    assert.equal(item.confidence, 'CONFIRMED', `id "${id}" is not a CONFIRMED item`);
  }
});

// 1. deterministic decoder result produces a valid age
test('a clean single-year decoder result is deterministic and yields a correct age', () => {
  assert.equal(hasSingleResolvedYear('2016'), true);
  assert.equal(ageFromYear(2016, 2026), 10);
});

// 4. ambiguous/range decoder result does not invent an age
test('a repeating-cycle (slash-joined) decoder year is not treated as a single resolved year', () => {
  assert.equal(hasSingleResolvedYear('2014/2016'), false);
  assert.deepEqual(parseCandidateYears('2014/2016'), [2014, 2016]);
});

test('an "X or Y" ambiguous decoder message is not treated as a single resolved year', () => {
  assert.equal(hasSingleResolvedYear('2014 or 2016'), false);
});

test('an empty decoder year (no-match/fallback state) is not a single resolved year', () => {
  assert.equal(hasSingleResolvedYear(''), false);
  assert.equal(hasSingleResolvedYear('   '), false);
});

test('ageFromYear never returns a negative age for a future year', () => {
  assert.equal(ageFromYear(2030, 2026), null);
});

// 2. known product type produces a valid item id (decoder category shortcut)
test('the Water Heaters decoder category maps to the confirmed Water Heater item id', () => {
  assert.equal(mapDecoderCategoryToItemId('waterHeaters'), RCV_ACV_ITEM_IDS.WATER_HEATER);
});

// 3. unknown/ambiguous product type passes age only (no item mapping)
test('Appliances, HVAC, and Electronics decoder categories are intentionally not mapped (ambiguous)', () => {
  assert.equal(mapDecoderCategoryToItemId('appliances'), null);
  assert.equal(mapDecoderCategoryToItemId('hvac'), null);
  assert.equal(mapDecoderCategoryToItemId('electronics'), null);
  assert.equal(mapDecoderCategoryToItemId(''), null);
  assert.equal(mapDecoderCategoryToItemId(undefined), null);
});

// 5. Smart Lookup single estimate can prefill age
test('a clean single Smart Lookup estimated year is usable as an age basis', () => {
  assert.equal(isCleanSingleYear('2018'), true);
  assert.equal(isCleanSingleYear(2018), true);
  assert.equal(ageFromYear(2018, 2026), 8);
});

// 6. Smart Lookup production-range-only result does not use the midpoint
test('a Smart Lookup production range string is never treated as a clean single year', () => {
  assert.equal(isCleanSingleYear('2013-2016'), false);
  assert.equal(isCleanSingleYear('2013–2016'), false);
});

test('isCleanSingleYear rejects "Unknown", empty, and non-year text', () => {
  assert.equal(isCleanSingleYear('Unknown'), false);
  assert.equal(isCleanSingleYear(''), false);
  assert.equal(isCleanSingleYear(null), false);
  assert.equal(isCleanSingleYear(undefined), false);
  assert.equal(isCleanSingleYear('abc'), false);
});

// Smart Lookup category → item mapping (keyword matching, word-boundary safe)
test('category text matching: dishwasher is not confused with washer (dishwasher contains "washer")', () => {
  assert.equal(matchRcvAcvItemFromCategoryText('Dishwasher'), RCV_ACV_ITEM_IDS.DISHWASHER);
  assert.equal(matchRcvAcvItemFromCategoryText('Built-in Dishwasher'), RCV_ACV_ITEM_IDS.DISHWASHER);
});

test('category text matching: plain washer/washing machine maps to Washing Machine', () => {
  assert.equal(matchRcvAcvItemFromCategoryText('Washer'), RCV_ACV_ITEM_IDS.WASHER);
  assert.equal(matchRcvAcvItemFromCategoryText('Washing Machine'), RCV_ACV_ITEM_IDS.WASHER);
  assert.equal(matchRcvAcvItemFromCategoryText('Clothes Washers'), RCV_ACV_ITEM_IDS.WASHER);
});

test('category text matching: dryer requires a fuel qualifier, otherwise left unmapped', () => {
  assert.equal(matchRcvAcvItemFromCategoryText('Electric Dryer'), RCV_ACV_ITEM_IDS.ELECTRIC_DRYER);
  assert.equal(matchRcvAcvItemFromCategoryText('Gas Dryer'), RCV_ACV_ITEM_IDS.GAS_DRYER);
  assert.equal(matchRcvAcvItemFromCategoryText('Dryer'), null);
  assert.equal(matchRcvAcvItemFromCategoryText('Clothes Dryer'), null);
});

test('category text matching: microwave maps unless it is a built-in variant', () => {
  assert.equal(matchRcvAcvItemFromCategoryText('Microwave Oven'), RCV_ACV_ITEM_IDS.MICROWAVE);
  assert.equal(matchRcvAcvItemFromCategoryText('Built-In Microwave'), null);
});

test('category text matching: refrigerator maps unless it is a mini/compact/built-in/wine variant', () => {
  assert.equal(matchRcvAcvItemFromCategoryText('Refrigerator'), RCV_ACV_ITEM_IDS.REFRIGERATOR);
  assert.equal(matchRcvAcvItemFromCategoryText('Kitchen Fridge'), RCV_ACV_ITEM_IDS.REFRIGERATOR);
  assert.equal(matchRcvAcvItemFromCategoryText('Mini Refrigerator'), null);
  assert.equal(matchRcvAcvItemFromCategoryText('Compact Refrigerator'), null);
  assert.equal(matchRcvAcvItemFromCategoryText('Built-In Refrigerator'), null);
  assert.equal(matchRcvAcvItemFromCategoryText('Wine Refrigerator'), null);
});

test('category text matching: tankless water heater is distinguished from a conventional one', () => {
  assert.equal(matchRcvAcvItemFromCategoryText('Water Heater'), RCV_ACV_ITEM_IDS.WATER_HEATER);
  assert.equal(matchRcvAcvItemFromCategoryText('Electric Water Heaters'), RCV_ACV_ITEM_IDS.WATER_HEATER);
  assert.equal(matchRcvAcvItemFromCategoryText('Tankless Water Heater'), RCV_ACV_ITEM_IDS.TANKLESS_WATER_HEATER);
});

test('category text matching: central air conditioner requires both "central" and an AC term', () => {
  assert.equal(matchRcvAcvItemFromCategoryText('Central Air Conditioner'), RCV_ACV_ITEM_IDS.CENTRAL_AC);
  assert.equal(matchRcvAcvItemFromCategoryText('Central AC'), RCV_ACV_ITEM_IDS.CENTRAL_AC);
  assert.equal(matchRcvAcvItemFromCategoryText('Air Conditioner'), null);
  assert.equal(matchRcvAcvItemFromCategoryText('Window Air Conditioner'), null);
});

test('category text matching: heat pump maps to the Air-to-Air Heat Pump item', () => {
  assert.equal(matchRcvAcvItemFromCategoryText('Heat Pump'), RCV_ACV_ITEM_IDS.HEAT_PUMP);
});

test('category text matching: unrecognized/empty category text yields no mapping', () => {
  assert.equal(matchRcvAcvItemFromCategoryText(''), null);
  assert.equal(matchRcvAcvItemFromCategoryText(undefined), null);
  assert.equal(matchRcvAcvItemFromCategoryText('Smartphone'), null);
});

// URL building — the query-param contract
test('buildRcvAcvUrl includes age, item, source, and basis when all are provided', () => {
  const url = buildRcvAcvUrl({ age: 8, item: RCV_ACV_ITEM_IDS.DISHWASHER, source: 'serial-decoder', basis: 'deterministic' });
  const parsed = new URL(url, 'https://example.test');
  assert.equal(parsed.pathname, '/rcv-acv-calculator');
  assert.equal(parsed.searchParams.get('age'), '8');
  assert.equal(parsed.searchParams.get('item'), RCV_ACV_ITEM_IDS.DISHWASHER);
  assert.equal(parsed.searchParams.get('source'), 'serial-decoder');
  assert.equal(parsed.searchParams.get('basis'), 'deterministic');
});

test('buildRcvAcvUrl omits age/item/basis when not determinable, but always includes source', () => {
  const url = buildRcvAcvUrl({ age: null, item: null, source: 'serial-decoder', basis: null });
  const parsed = new URL(url, 'https://example.test');
  assert.equal(parsed.searchParams.has('age'), false);
  assert.equal(parsed.searchParams.has('item'), false);
  assert.equal(parsed.searchParams.has('basis'), false);
  assert.equal(parsed.searchParams.get('source'), 'serial-decoder');
});

test('buildRcvAcvUrl never includes a rate parameter — the annual rate is never sourced from a query string here', () => {
  const url = buildRcvAcvUrl({ age: 8, item: RCV_ACV_ITEM_IDS.WASHER, source: 'smart-lookup', basis: 'estimated' });
  assert.equal(url.includes('rate'), false);
  assert.equal(url.includes('annualRate'), false);
});
