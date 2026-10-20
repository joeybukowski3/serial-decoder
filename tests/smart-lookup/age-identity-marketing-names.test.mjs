import test from 'node:test';
import assert from 'node:assert/strict';

import { isSmartAgeProductCompatible } from '../../lib/smart-lookup/age-identity.js';
import { classifySmartLookupQuery } from '../../lib/smart-lookup/normalize.js';

// Provider-only payloads (no request-derived fields). Each carries a year so
// the guard has a dated claim to protect.
function verdict(request, payload) {
  return isSmartAgeProductCompatible({ bestEstimateYear: 2022, ...payload }, classifySmartLookupQuery(request));
}
function accepts(request, payload) {
  assert.equal(verdict(request, payload), true, `${request}: ${JSON.stringify(payload)}`);
}
function rejects(request, payload) {
  assert.equal(verdict(request, payload), false, `${request}: ${JSON.stringify(payload)}`);
}

const SAMSUNG = 'Samsung QN55Q60BAFXZA';

// --- Finding 1: marketing names that do not repeat the full SKU --------------

test('an exact-model request accepts a matching model field with a marketing product name', () => {
  for (const product of [
    'Samsung QN55Q60BAFXZA',
    'Samsung 55-inch Class Q60B QLED 4K Smart TV',
    'Samsung 55" Class Q60B QLED 4K Smart TV',
    'Samsung Q60B QLED TV',
    'Samsung QN55Q60B 55 inch QLED',
    'Samsung QLED TV',
  ]) {
    accepts(SAMSUNG, { brand: 'Samsung', model: 'QN55Q60BAFXZA', likelyProduct: product, displayName: product });
  }
  accepts(SAMSUNG, { brand: 'Samsung', exactModel: 'QN55Q60BAFXZA', likelyProduct: 'Samsung Q60B QLED TV' });
});

test('an LG exact-model request accepts the C3 marketing name', () => {
  accepts('LG OLED65C3PUA', { brand: 'LG', model: 'OLED65C3PUA',
    likelyProduct: 'LG C3 65-inch OLED evo TV', displayName: 'LG C3 65-inch OLED evo TV' });
  accepts('LG OLED65C3PUA', { brand: 'LG', model: 'OLED65C3PUA', likelyProduct: 'LG OLED evo C3 Series 4K TV' });
});

test('a marketing product name still has to carry the requested model somewhere', () => {
  // No model field and no SKU in the product: the name alone cannot identify the unit.
  rejects(SAMSUNG, { brand: 'Samsung', likelyProduct: 'Samsung 55-inch Class Q60B QLED 4K Smart TV' });
  rejects(SAMSUNG, { brand: 'Samsung', likelyProduct: 'Samsung QLED 4K Smart TV' });
  rejects(SAMSUNG, { brand: 'Samsung', likelyProduct: 'Samsung Crystal UHD TV' });
});

test('an explicit contradictory SKU, series or family is rejected even with a matching model field', () => {
  const model = { brand: 'Samsung', model: 'QN55Q60BAFXZA' };
  rejects(SAMSUNG, { ...model, likelyProduct: 'Samsung 55-inch Class Q80B QLED 4K Smart TV' });
  rejects(SAMSUNG, { ...model, likelyProduct: 'Samsung UN55TU7000 4K UHD TV' });
  rejects(SAMSUNG, { ...model, displayName: 'Samsung QN55Q60CAFXZA' });
  rejects(SAMSUNG, { ...model, identifiedProduct: 'Samsung Q80B QLED TV' });
  rejects(SAMSUNG, { ...model, productFamily: 'Q80 series' });
  rejects(SAMSUNG, { ...model, productFamily: 'Q600 series' });
  rejects(SAMSUNG, { ...model, series: 'TU7000 series' });
  rejects(SAMSUNG, { ...model, seriesLine: 'Q80B' });
  accepts(SAMSUNG, { ...model, productFamily: 'Q60 series', series: 'Q60B' });
});

test('partial or substring SKU tokens in a product name are not compatible', () => {
  const model = { brand: 'Samsung', model: 'QN55Q60BAFXZA' };
  // "q6" and "q600" sit inside or beside the Q60 segment but are different lines.
  rejects(SAMSUNG, { ...model, likelyProduct: 'Samsung Q6 QLED TV' });
  rejects(SAMSUNG, { ...model, likelyProduct: 'Samsung Q600 QLED TV' });
  rejects(SAMSUNG, { ...model, likelyProduct: 'Samsung Q60BX QLED TV' });
  rejects('LG OLED65C3PUA', { brand: 'LG', model: 'OLED65C3PUA', likelyProduct: 'LG NC3 65-inch OLED' });
  rejects('LG OLED65C3PUA', { brand: 'LG', model: 'OLED65C3PUA', likelyProduct: 'LG C32 65-inch OLED' });
});

test('LG exact-model marketing names for another line or model are rejected', () => {
  const model = { brand: 'LG', model: 'OLED65C3PUA' };
  rejects('LG OLED65C3PUA', { ...model, likelyProduct: 'LG G3 65-inch OLED evo TV' });
  rejects('LG OLED65C3PUA', { ...model, likelyProduct: 'LG C2 65-inch OLED evo TV' });
  rejects('LG OLED65C3PUA', { ...model, displayName: 'LG OLED65G3PUA' });
  rejects('LG OLED65C3PUA', { brand: 'LG', likelyProduct: 'LG C3 65-inch OLED evo TV' });
});

test('spec tokens such as 4K or 120Hz are neutral but never establish identity', () => {
  accepts(SAMSUNG, { brand: 'Samsung', model: 'QN55Q60BAFXZA', likelyProduct: 'Samsung Q60B 4K 120Hz 55 inch QLED' });
  rejects(SAMSUNG, { brand: 'Samsung', likelyProduct: 'Samsung 4K 120Hz 55 inch QLED' });
  rejects(SAMSUNG, { brand: 'Samsung', model: 'QN55Q60BAFXZA', likelyProduct: 'Samsung UN55TU7000 4K 120Hz' });
});

// --- Finding 2: yearContext ranges without a value ---------------------------

test('a yearContext range is a year claim even without a value', () => {
  const info = classifySmartLookupQuery(SAMSUNG);
  const range = { type: 'production-range', startYear: 2012, endYear: 2014 };
  assert.equal(isSmartAgeProductCompatible({ brand: 'Samsung', yearContext: range }, info), false);
  assert.equal(isSmartAgeProductCompatible({ brand: 'Samsung', yearContext: { type: 'production-range', startYear: 2012 } }, info), false);
  assert.equal(isSmartAgeProductCompatible({ brand: 'Samsung', yearContext: { type: 'production-range', endYear: 2014 } }, info), false);
  assert.equal(isSmartAgeProductCompatible({ brand: 'Samsung', yearContext: { type: 'market-introduction', value: 2013 } }, info), false);
  const dell = classifySmartLookupQuery('Dell XPS 15');
  assert.equal(isSmartAgeProductCompatible({ brand: 'Dell', yearContext: range }, dell), false);
});

test('a yearContext range with defensible identity is accepted', () => {
  const info = classifySmartLookupQuery(SAMSUNG);
  assert.equal(isSmartAgeProductCompatible({ brand: 'Samsung', model: 'QN55Q60BAFXZA',
    likelyProduct: 'Samsung Q60B QLED TV',
    yearContext: { type: 'production-range', startYear: 2022, endYear: 2023 } }, info), true);
});

test('unknown, empty or year-less yearContext values stay benign', () => {
  const info = classifySmartLookupQuery(SAMSUNG);
  for (const yearContext of [
    null,
    {},
    { type: 'unknown' },
    { type: 'unknown', label: 'Year context', confidence: 'partial', source: 'local-seed' },
    { type: 'production-range' },
    { type: 'production-range', startYear: null, endYear: null },
    { type: 'market-introduction', value: null },
  ]) {
    assert.equal(isSmartAgeProductCompatible({ brand: 'Samsung', yearContext }, info), true, JSON.stringify(yearContext));
  }
});

test('a calendar year in the request is not a model, so a broad era range needs no product identity', () => {
  const info = classifySmartLookupQuery('Whirlpool top-load washer 2015');
  const era = { type: 'production-range', startYear: 1990, endYear: 2020 };
  assert.equal(isSmartAgeProductCompatible({ brand: 'Whirlpool', yearContext: era }, info), true);
  // A named model still fails closed, with or without a year beside it.
  for (const request of ['Whirlpool WTW5000DW', 'Whirlpool WTW5000DW 2015']) {
    assert.equal(isSmartAgeProductCompatible({ brand: 'Whirlpool', yearContext: era }, classifySmartLookupQuery(request)), false, request);
    assert.equal(isSmartAgeProductCompatible({ brand: 'Whirlpool', bestEstimateYear: 2019 }, classifySmartLookupQuery(request)), false, request);
  }
});

test('other year-bearing fields remain protected alongside yearContext', () => {
  const info = classifySmartLookupQuery(SAMSUNG);
  for (const claim of [
    { bestEstimateYear: 2013 }, { introductionYear: 2013 }, { releaseDate: '2013-05-01' },
    { estimatedRange: { start: 2012, end: 2014 } }, { endOfRetailAvailability: { date: '2016' } },
    { endOfManufacturerSupport: { date: '2018' } },
  ]) {
    assert.equal(isSmartAgeProductCompatible({ brand: 'Samsung', ...claim }, info), false, JSON.stringify(claim));
  }
});

// --- Finding 4: sibling product lines sharing a model number -----------------

test('a numeric-only model request requires the requested product line word', () => {
  accepts('Dell XPS 9530', { brand: 'Dell', model: 'XPS 15 9530', likelyProduct: 'Dell XPS 15 9530' });
  accepts('Dell XPS 9530', { brand: 'Dell', model: 'XPS 9530', likelyProduct: 'Dell XPS 9530 laptop' });
  rejects('Dell XPS 9530', { brand: 'Dell', model: 'Latitude 9530', likelyProduct: 'Dell Latitude 9530' });
  rejects('Dell XPS 9530', { brand: 'Dell', model: 'Inspiron 9530', likelyProduct: 'Dell Inspiron 9530' });
  rejects('Dell XPS 9530', { brand: 'Dell', model: 'Precision 9530', likelyProduct: 'Dell Precision 9530' });
  rejects('Dell XPS 9530', { brand: 'Dell', likelyProduct: 'Dell Latitude 9530' });
  rejects('Dell XPS 9530', { brand: 'Dell', model: '9530', likelyProduct: 'Dell Latitude 9530' });
});

test('the XPS 15 to XPS 15 9530 upgrade is preserved', () => {
  accepts('Dell XPS 15', { brand: 'Dell', model: 'XPS 15 9530', likelyProduct: 'Dell XPS 15 9530' });
  rejects('Dell XPS 15', { brand: 'Dell', model: 'Latitude 9530', likelyProduct: 'Dell Latitude 9530' });
});

test('the three-letter line rule does not add false rejects for other families', () => {
  accepts('HP OfficeJet Pro 8710', { brand: 'HP', model: 'OfficeJet Pro 8710', likelyProduct: 'HP OfficeJet Pro 8710 All-in-One Printer' });
  accepts('HP Envy 6055', { brand: 'HP', model: 'Envy 6055', likelyProduct: 'HP Envy 6055 All-in-One Printer' });
  accepts('Canon PIXMA TS3322', { brand: 'Canon', model: 'PIXMA TS3322', likelyProduct: 'Canon PIXMA TS3322 Wireless Printer' });
  // "LED" is a generic category word, not a line the provider must repeat.
  accepts('Samsung LED 7000', { brand: 'Samsung', model: '7000', likelyProduct: 'Samsung 7000 Series TV' });
  rejects('HP Envy 6055', { brand: 'HP', model: 'OfficeJet Pro 8710', likelyProduct: 'HP OfficeJet Pro 8710' });
  accepts('Whirlpool WTW5000DW', { brand: 'Whirlpool', model: 'WTW5000DW', likelyProduct: 'Whirlpool 4.3 cu. ft. Top Load Washer' });
});
