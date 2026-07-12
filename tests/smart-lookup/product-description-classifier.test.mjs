import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySmartLookupQuery } from '../../lib/smart-lookup/normalize.js';

// ── Upgrade 1 fixture: marketing-style product descriptions must not be
//    misclassified as serial-only or brand-missing ──────────────────────────

test('Samsung Q60 retailer-title query is classified as a marketing description, not serial-only', () => {
  const r = classifySmartLookupQuery('Samsung - 65" Class Q60 Series LED 4K UHD Smart Tizen TV');
  assert.equal(r.brand, 'Samsung');
  assert.equal(r.genericCategory, 'television');
  assert.equal(r.productType, 'television');
  assert.equal(r.productFamily, 'Q60 Series');
  assert.equal(r.screenSize, 65);
  assert.equal(r.exactModel, null);
  assert.equal(r.isMarketingDescription, true);
  assert.equal(r.isSerialOnly, false);
  assert.equal(r.needsExactModel, true);
});

test('a question-style query with the same product description is recognized identically', () => {
  const r = classifySmartLookupQuery('when was the Samsung 65 Class Q60 Series LED 4K UHD Smart Tizen TV released');
  assert.equal(r.brand, 'Samsung');
  assert.equal(r.productFamily, 'Q60 Series');
  assert.equal(r.isMarketingDescription, true);
  assert.equal(r.needsExactModel, true);
});

test('an exact Samsung Q60 model code is recognized as an exact model with model-year-family context', () => {
  const r = classifySmartLookupQuery('Samsung QN65Q60RAFXZA');
  assert.equal(r.brand, 'Samsung');
  assert.equal(r.exactModel, 'QN65Q60RAFXZA');
  assert.equal(r.specificityLevel, 'specific');
  assert.equal(r.needsExactModel, false);
  // The suffix letter is labeled as a model-YEAR-FAMILY, never as a claimed
  // manufacture year.
  assert.equal(r.modelYearFamilyLetter, 'R');
  assert.equal(r.modelYearFamilyYear, 2019);
  assert.match(r.modelYearFamilyLabel, /model-year family/i);
  assert.doesNotMatch(r.modelYearFamilyLabel, /^manufacture year/i);
});

test('Samsung Q60A partial query recognizes the family and its model-year letter without claiming a unit date', () => {
  const r = classifySmartLookupQuery('Samsung Q60A 65 inch TV');
  assert.equal(r.brand, 'Samsung');
  assert.equal(r.productFamily, 'Q60 Series');
  assert.equal(r.screenSize, 65);
  assert.equal(r.modelYearFamilyLetter, 'A');
  assert.equal(r.modelYearFamilyYear, 2021);
  assert.equal(r.exactModel, null, 'a partial token must never be promoted to an exact model');
  assert.equal(r.needsExactModel, true);
});

test('a bare serial-like token with no brand stays serial-only-compatible (unchanged, acceptable behavior)', () => {
  const r = classifySmartLookupQuery('CB2501800');
  assert.equal(r.brand, '');
  assert.equal(r.productFamily, null);
  assert.equal(r.isMarketingDescription, false);
});

test('a product description with no brand is left brand-ambiguous rather than mis-tagged as serial-only', () => {
  const r = classifySmartLookupQuery('65 inch Q60 Series Smart TV');
  assert.equal(r.brand, '');
  assert.equal(r.genericCategory, 'television');
  assert.equal(r.screenSize, 65);
  assert.equal(r.isSerialOnly, false, 'a recognized category must not be treated as a bare serial');
});

// ── Seed-rule scope: must not fire for unrelated Samsung queries ────────────

test('the Q-series seed does not fire for unrelated Samsung appliance queries', () => {
  const washer = classifySmartLookupQuery('Samsung WF45T6000AW washer');
  assert.equal(washer.productFamily, null);
  const fridge = classifySmartLookupQuery('Samsung refrigerator');
  assert.equal(fridge.productFamily, null);
});

// ── Screen-size parsing tolerance (Upgrade 4) ───────────────────────────────

test('screen size is recognized across common retailer phrasings', () => {
  assert.equal(classifySmartLookupQuery('Samsung 65" QLED TV').screenSize, 65);
  assert.equal(classifySmartLookupQuery('Samsung 65 inch QLED TV').screenSize, 65);
  assert.equal(classifySmartLookupQuery('Samsung 65-inch QLED TV').screenSize, 65);
  assert.equal(classifySmartLookupQuery('Samsung 65 Class QLED TV').screenSize, 65);
});

test('LG C3 family queries are recognized without promoting C3 to an exact model', () => {
  for (const query of ['LG C3 TV', 'lg oled c3', 'LG OLED-C3', '65 inch LG C3 TV']) {
    const r = classifySmartLookupQuery(query);
    assert.equal(r.brand, 'LG', query);
    assert.equal(r.productType, 'television', query);
    assert.equal(r.productFamily, 'C3', query);
    assert.equal(r.seriesLine, 'OLED C3', query);
    assert.equal(r.exactModel, null, query);
    assert.equal(r.isProductFamilyQuery, true, query);
    assert.equal(r.isMarketingDescription, true, query);
    assert.equal(r.isSerialOnly, false, query);
    assert.equal(r.needsExactModel, true, query);
    assert.equal(r.modelYearFamilyYear, 2023, query);
    assert.match(r.modelYearFamilyLabel, /model-year family/i, query);
  }
  assert.equal(classifySmartLookupQuery('65 inch LG C3 TV').screenSize, 65);
});

test('an exact LG OLED model preserves its model, screen size, and family context', () => {
  for (const query of ['LG OLED65C3PUA', 'OLED65C3PUA', 'LG-OLED-65-C3-PUA']) {
    const r = classifySmartLookupQuery(query);
    assert.equal(r.brand, 'LG', query);
    assert.equal(r.productType, 'television', query);
    assert.equal(r.productFamily, 'C3', query);
    assert.equal(r.exactModel, 'OLED65C3PUA', query);
    assert.equal(r.screenSize, 65, query);
    assert.equal(r.isProductFamilyQuery, false, query);
    assert.equal(r.isMarketingDescription, false, query);
    assert.equal(r.needsExactModel, false, query);
    assert.equal(r.modelYearFamilyYear, 2023, query);
  }
  const conflictingBrand = classifySmartLookupQuery('Sony OLED65C3PUA');
  assert.equal(conflictingBrand.brand, 'Sony');
  assert.equal(conflictingBrand.productFamily, null);
});

test('seeded LG OLED families recognize C2, G3, and B3 only with LG television context', () => {
  for (const [query, family, year] of [
    ['LG C2 TV', 'C2', 2022],
    ['LG G3 TV', 'G3', 2023],
    ['LG B3 TV', 'B3', 2023],
  ]) {
    const r = classifySmartLookupQuery(query);
    assert.equal(r.productFamily, family, query);
    assert.equal(r.productType, 'television', query);
    assert.equal(r.modelYearFamilyYear, year, query);
  }
  assert.equal(classifySmartLookupQuery('LG C3 washer').productFamily, null);
});

test('short C3 tokens remain ambiguous without safe LG context', () => {
  const bare = classifySmartLookupQuery('C3');
  assert.equal(bare.brand, '');
  assert.equal(bare.productFamily, null);
  assert.equal(bare.isSerialOnly, true);

  const noBrand = classifySmartLookupQuery('65 inch C3 OLED TV');
  assert.equal(noBrand.brand, '');
  assert.equal(noBrand.productFamily, null);
  assert.equal(noBrand.productType, 'television');
  assert.equal(noBrand.isSerialOnly, false);
});
