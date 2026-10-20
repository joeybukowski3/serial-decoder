import test from 'node:test';
import assert from 'node:assert/strict';

import { isSmartAgeProductCompatible } from '../../lib/smart-lookup/age-identity.js';
import { classifySmartLookupQuery } from '../../lib/smart-lookup/normalize.js';

// Provider-only payloads (no request-derived fields). Every payload carries a
// year so the identity guard has a dated claim to protect.
function accepts(request, payload) {
  const info = classifySmartLookupQuery(request);
  assert.equal(isSmartAgeProductCompatible({ bestEstimateYear: 2022, ...payload }, info), true,
    `${request}: ${JSON.stringify(payload)}`);
}

function rejects(request, payload) {
  const info = classifySmartLookupQuery(request);
  assert.equal(isSmartAgeProductCompatible({ bestEstimateYear: 2022, ...payload }, info), false,
    `${request}: ${JSON.stringify(payload)}`);
}

test('a series request accepts the exact model of that same series', () => {
  const request = 'Samsung Q60 series TV';
  accepts(request, { brand: 'Samsung', model: 'QN55Q60BAFXZA' });
  accepts(request, { brand: 'Samsung', exactModel: 'QN55Q60BAFXZA' });
  accepts(request, { brand: 'Samsung', model: 'QN55Q60BAFXZA', likelyProduct: 'Samsung Q60 Series QLED' });
  accepts(request, { brand: 'Samsung', likelyProduct: 'Samsung 55 inch Q60B QLED TV' });
});

test('a series request still rejects a different series or an unrelated model', () => {
  const request = 'Samsung Q60 series TV';
  rejects(request, { brand: 'Samsung', model: 'QN55Q80BAFXZA' });
  rejects(request, { brand: 'Samsung', model: 'UN55TU7000' });
  rejects(request, { brand: 'Samsung', model: 'QN55Q60BAFXZA', displayName: 'Samsung Q80 Series' });
  rejects(request, { brand: 'Samsung', likelyProduct: 'Samsung Crystal UHD TV' });
  rejects(request, { brand: 'Samsung', model: 'QN55Q60BAFXZA', identifiedProduct: 'Samsung QN55Q80BAFXZA' });
});

test('a model-line request accepts the exact model carrying that line token', () => {
  accepts('LG C3', { brand: 'LG', model: 'OLED65C3PUA' });
  accepts('LG C3', { brand: 'LG', model: 'OLED65C3PUA', likelyProduct: 'LG C3 OLED TV' });
  accepts('LG C3', { brand: 'LG', likelyProduct: 'LG OLED65C3PUA 65 inch OLED evo' });
});

test('a line token only counts when it is a whole alphanumeric segment of the model', () => {
  rejects('LG C3', { brand: 'LG', model: 'OLED65C2PUA' });
  rejects('LG C3', { brand: 'LG', model: 'OLED65G3PUA' });
  // "C3" is a substring here but belongs to the different segment "NC3".
  rejects('LG C3', { brand: 'LG', model: 'OLED65NC3PUA' });
  rejects('LG C3', { brand: 'LG', model: 'OLED65CX3PUA' });
  rejects('LG C3', { brand: 'LG', model: 'OLED65C3PUA', displayName: 'LG G3 OLED TV' });
});

test('a model-line request accepts a more specific product that extends the line', () => {
  accepts('Dell XPS 15', { brand: 'Dell', model: 'XPS 15 9530' });
  accepts('Dell XPS 15', { brand: 'Dell', likelyProduct: 'Dell XPS 15 9530' });
  accepts('Dell XPS 15', { brand: 'Dell', model: 'XPS 15 9530', likelyProduct: 'Dell XPS 15 9530',
    displayName: 'Dell XPS 15 9530 laptop' });
});

test('an extended product must keep the requested line as whole words', () => {
  rejects('Dell XPS 15', { brand: 'Dell', model: 'XPS 13 9530' });
  rejects('Dell XPS 15', { brand: 'Dell', likelyProduct: 'Dell XPS 13 9530' });
  rejects('Dell XPS 15', { brand: 'Dell', likelyProduct: 'Dell XPS 150 Plus' });
  // Sharing only the brand and a number is not a relationship.
  rejects('Dell XPS 15', { brand: 'Dell', likelyProduct: 'Dell Inspiron 15 3520' });
  rejects('Dell XPS 15', { brand: 'Dell', model: 'Latitude 15 5530' });
  // One compatible field never launders a conflicting one.
  rejects('Dell XPS 15', { brand: 'Dell', model: 'XPS 15 9530', displayName: 'Dell XPS 17 9730' });
  rejects('Dell XPS 15', { brand: 'Dell', model: 'XPS 15 9530', identifiedProduct: 'Dell XPS 13 9315' });
});

test('a brand or category token never establishes a model relationship', () => {
  rejects('Dell XPS 15', { brand: 'Dell', likelyProduct: 'Dell laptop' });
  rejects('Samsung Q60 series TV', { brand: 'Samsung', likelyProduct: 'Samsung TV' });
  rejects('LG C3', { brand: 'LG', likelyProduct: 'LG OLED TV' });
});

test('a dated claim without any provider-supplied identity is rejected', () => {
  for (const request of ['Samsung QN55Q60BAFXZA', 'Samsung Q60 series TV', 'LG C3', 'Dell XPS 15']) {
    const info = classifySmartLookupQuery(request);
    const brand = info.brand || 'Samsung';
    assert.equal(isSmartAgeProductCompatible({ brand, bestEstimateYear: 2022 }, info), false, request);
    assert.equal(isSmartAgeProductCompatible({ brand, introductionYear: 2022 }, info), false, request);
    assert.equal(isSmartAgeProductCompatible({ brand, estimatedRange: { start: 2021, end: 2023 } }, info), false, request);
    assert.equal(isSmartAgeProductCompatible({ brand, endOfRetailAvailability: { date: '2024' } }, info), false, request);
  }
});

test('an undated result without identity stays acceptable', () => {
  const info = classifySmartLookupQuery('Dell XPS 15');
  assert.equal(isSmartAgeProductCompatible({ brand: 'Dell' }, info), true);
});

test('a series field cannot stand in for the requested model unless it names it', () => {
  const info = classifySmartLookupQuery('Dell XPS 15');
  assert.equal(isSmartAgeProductCompatible({ brand: 'Dell', series: 'XPS 15 9530', bestEstimateYear: 2023 }, info), true);
  assert.equal(isSmartAgeProductCompatible({ brand: 'Dell', series: 'Inspiron', bestEstimateYear: 2023 }, info), false);
});
