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
  assert.match(r.modelYearFamilyLabel, /model-year family/i);
  assert.doesNotMatch(r.modelYearFamilyLabel, /^manufacture year/i);
});

test('Samsung Q60A partial query recognizes the family and its model-year letter without claiming a unit date', () => {
  const r = classifySmartLookupQuery('Samsung Q60A 65 inch TV');
  assert.equal(r.brand, 'Samsung');
  assert.equal(r.productFamily, 'Q60 Series');
  assert.equal(r.screenSize, 65);
  assert.equal(r.modelYearFamilyLetter, 'A');
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
