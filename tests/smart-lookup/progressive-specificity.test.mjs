import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySmartLookupQuery } from '../../lib/smart-lookup/normalize.js';
import { buildDeterministicBroadResult } from '../../lib/smart-lookup/static-results.js';
import { buildSmartAgeCacheKey } from '../../lib/smart-lookup/cache.js';

// ── Acer Nitro 5 regression fixture ─────────────────────────────────────────

test('Acer Nitro 5 is recognized as brand=Acer, family=Nitro 5, product-family specificity', () => {
  const r = classifySmartLookupQuery('Acer Nitro 5');
  assert.equal(r.brand, 'Acer');
  assert.equal(r.recognizedCategory, 'laptop');
  assert.equal(r.productFamily, 'Nitro 5');
  assert.equal(r.querySpecificity, 'product-family');
  assert.equal(r.exactModel, null);
  assert.equal(r.groundedEligible, true);
  assert.equal(r.providerEligible, true);
});

test('Acer Nitro 5 computer behaves equivalently to Acer Nitro 5', () => {
  const a = classifySmartLookupQuery('Acer Nitro 5');
  const b = classifySmartLookupQuery('Acer Nitro 5 computer');
  assert.equal(b.brand, a.brand);
  assert.equal(b.productFamily, a.productFamily);
  assert.equal(b.querySpecificity, a.querySpecificity);
  assert.equal(b.recognizedCategory, 'computer');
});

test('Acer Nitro 5 laptop behaves equivalently to Acer Nitro 5', () => {
  const a = classifySmartLookupQuery('Acer Nitro 5');
  const b = classifySmartLookupQuery('Acer Nitro 5 laptop');
  assert.equal(b.brand, a.brand);
  assert.equal(b.productFamily, a.productFamily);
  assert.equal(b.querySpecificity, a.querySpecificity);
  assert.equal(b.recognizedCategory, 'laptop');
});

test('Acer AN515-58 is classified as model-line, not exact-model', () => {
  const r = classifySmartLookupQuery('Acer AN515-58');
  assert.equal(r.brand, 'Acer');
  assert.equal(r.productFamily, 'Nitro 5');
  assert.equal(r.querySpecificity, 'model-line');
  assert.equal(r.modelLineId, 'an515');
  assert.equal(r.exactModel, null);
});

test('Acer AN515-58-57Y8 is classified as exact-model', () => {
  const r = classifySmartLookupQuery('Acer AN515-58-57Y8');
  assert.equal(r.brand, 'Acer');
  assert.equal(r.querySpecificity, 'exact-model');
  assert.equal(r.exactModel, 'AN515-58-57Y8');
  assert.equal(r.modelLineId, null);
});

test('an isolated "5" is never treated as an exact model', () => {
  const r = classifySmartLookupQuery('5');
  assert.equal(r.exactModel, null);
  assert.notEqual(r.querySpecificity, 'exact-model');
});

test('Acer Nitro 5 family grounded timeout degrades to a useful family result with AN515 refinement guidance', () => {
  const queryInfo = classifySmartLookupQuery('Acer Nitro 5');
  const result = buildDeterministicBroadResult(queryInfo);
  assert.ok(result);
  assert.equal(result.precisionLevel, 'family-range');
  assert.equal(result.recognizedFamily, 'Nitro 5');
  assert.ok(result.recommendedIdentifiers.some((item) => /AN515/.test(item)));
  // Never claims one exact manufacture year for the whole family.
  assert.notEqual(result.yearContext.type, 'manufacture-year');
  assert.notEqual(result.yearContext.type, 'manufacture-date');
  assert.equal(result.yearContext.isExactUnitDate, false);
});

// ── Classification taxonomy ─────────────────────────────────────────────────

test('exact model: Samsung QN65Q60RAFXZA', () => {
  const r = classifySmartLookupQuery('Samsung QN65Q60RAFXZA');
  assert.equal(r.querySpecificity, 'exact-model');
});

test('model line: Dell Inspiron 15 3000', () => {
  const r = classifySmartLookupQuery('Dell Inspiron 15 3000');
  assert.equal(r.querySpecificity, 'model-line');
  assert.equal(r.brand, 'Dell');
});

test('product family: Samsung Galaxy Tab', () => {
  const r = classifySmartLookupQuery('Samsung Galaxy Tab');
  assert.equal(r.querySpecificity, 'product-family');
  assert.equal(r.brand, 'Samsung');
  assert.equal(r.productFamily, 'Galaxy Tab');
});

test('brand-category: Whirlpool top-load washer', () => {
  const r = classifySmartLookupQuery('Whirlpool top-load washer');
  assert.equal(r.querySpecificity, 'brand-category');
  assert.equal(r.brand, 'Whirlpool');
  assert.equal(r.genericCategory, 'washer');
});

test('category-only: gaming laptop', () => {
  const r = classifySmartLookupQuery('gaming laptop');
  assert.equal(r.querySpecificity, 'category-only');
  assert.equal(r.brand, '');
  assert.equal(r.genericCategory, 'laptop');
});

test('category-only: refrigerator', () => {
  const r = classifySmartLookupQuery('refrigerator');
  assert.equal(r.querySpecificity, 'category-only');
});

test('free description: a real but unrecognized-brand product phrase', () => {
  const r = classifySmartLookupQuery('black rectangular electronic device with a dragon logo and blue lighting');
  assert.equal(r.querySpecificity, 'free-description');
  assert.equal(r.providerEligible, true);
});

test('unusable: empty input', () => {
  const r = classifySmartLookupQuery('   ');
  assert.equal(r.querySpecificity, 'unusable');
  assert.equal(r.providerEligible, false);
});

test('unusable: random meaningless string', () => {
  const r = classifySmartLookupQuery('asdkj 4432 xx');
  assert.equal(r.querySpecificity, 'unusable');
  assert.equal(r.providerEligible, false);
});

test('ambiguous family token stays scoped to the correct brand (no cross-brand false positive)', () => {
  // "Nitro" alone (no "5") must not match Acer's Nitro 5 family seed.
  const r = classifySmartLookupQuery('Nitro gaming mouse');
  assert.notEqual(r.productFamily, 'Nitro 5');
});

test('category term does not become a model', () => {
  const r = classifySmartLookupQuery('laptop');
  assert.equal(r.exactModel, null);
  assert.equal(r.modelIdentity, '');
});

test('screen size does not become a model', () => {
  const r = classifySmartLookupQuery('65-inch Samsung TV');
  assert.equal(r.exactModel, null);
  assert.equal(r.screenSize, 65);
});

test('capacity measurement does not become a model', () => {
  const r = classifySmartLookupQuery('5 gallon water heater');
  assert.equal(r.exactModel, null);
});

// ── Family/model-line/cache-key regression matrix ───────────────────────────

test('one appliance family (Whirlpool Cabrio) is recognized as product-family', () => {
  const r = classifySmartLookupQuery('Whirlpool Cabrio washer');
  assert.equal(r.brand, 'Whirlpool');
  assert.equal(r.productFamily, 'Cabrio');
  assert.equal(r.querySpecificity, 'product-family');
});

test('one television family already supported (Samsung Q-series) is unaffected by the general registry', () => {
  const r = classifySmartLookupQuery('Samsung Q60 Series TV');
  assert.equal(r.productFamily, 'Q60 Series');
  assert.equal(r.querySpecificity, 'product-family');
  // Legacy TV-seed results never populate familyId (general-registry only).
  assert.equal(r.familyId, null);
});

test('one HVAC model line (Trane XR13) is recognized as product-family', () => {
  const r = classifySmartLookupQuery('Trane XR13 air conditioner');
  assert.equal(r.brand, 'Trane');
  assert.equal(r.productFamily, 'XR13');
  assert.equal(r.querySpecificity, 'product-family');
});

test('exact, model-line, product-family, and brand-category cache keys never collide', () => {
  const exact = classifySmartLookupQuery('Acer AN515-58-57Y8');
  const line = classifySmartLookupQuery('Acer AN515-58');
  const family = classifySmartLookupQuery('Acer Nitro 5');
  const brandCategory = classifySmartLookupQuery('Acer laptop');
  const keys = new Set([
    buildSmartAgeCacheKey(exact, { grounded: false }),
    buildSmartAgeCacheKey(line, { grounded: false }),
    buildSmartAgeCacheKey(family, { grounded: false }),
    buildSmartAgeCacheKey(brandCategory, { grounded: false }),
  ]);
  assert.equal(keys.size, 4);
});

test('grounded and ungrounded cache keys are distinct for the same family query', () => {
  const info = classifySmartLookupQuery('Acer Nitro 5');
  const grounded = buildSmartAgeCacheKey(info, { grounded: true });
  const ungrounded = buildSmartAgeCacheKey(info, { grounded: false });
  assert.notEqual(grounded, ungrounded);
});

test('a cached family result cannot satisfy an exact-model request (distinct keys)', () => {
  const family = classifySmartLookupQuery('Acer Nitro 5');
  const exact = classifySmartLookupQuery('Acer AN515-58-57Y8');
  assert.notEqual(
    buildSmartAgeCacheKey(family, { grounded: false }),
    buildSmartAgeCacheKey(exact, { grounded: false }),
  );
});

// ── Fallback-kind semantics (deterministic evidence must never be labeled
//    AI-assisted or grounded) ───────────────────────────────────────────────

test('the deterministic family result itself carries no fallbackKind -- that is assigned only by the API layer at an actual degradation point', () => {
  const queryInfo = classifySmartLookupQuery('Acer Nitro 5');
  const result = buildDeterministicBroadResult(queryInfo);
  assert.equal(result.fallbackKind, undefined);
});

test('the unusable clarification result is always tagged fallbackKind: clarification', () => {
  const queryInfo = classifySmartLookupQuery('asdkj 4432 xx');
  const result = buildDeterministicBroadResult(queryInfo);
  assert.equal(result.fallbackKind, 'clarification');
});

// ── Gap 2: meaningful brand-category eligibility examples ──────────────────

for (const query of ['Whirlpool top-load washer', 'Rheem gas water heater', 'Samsung television', 'Acer gaming laptop', 'Trane heat pump']) {
  test(`meaningful brand-category query is grounded-eligible: "${query}"`, () => {
    const r = classifySmartLookupQuery(query);
    assert.equal(r.querySpecificity, 'brand-category');
    assert.equal(r.providerEligible, true);
    assert.equal(r.groundedEligible, true);
  });
}

for (const query of ['refrigerator', 'gaming laptop', 'washer', 'television', 'appliance']) {
  test(`bare category-only query now reaches research (local classification is a hint, not a gate): "${query}"`, () => {
    const r = classifySmartLookupQuery(query);
    assert.equal(r.querySpecificity, 'category-only');
    assert.equal(r.providerEligible, true);
    assert.equal(r.groundedEligible, true);
  });
}

test('a bare recognized brand with no category still reaches research', () => {
  const r = classifySmartLookupQuery('Whirlpool');
  assert.equal(r.querySpecificity, 'brand-only');
  assert.equal(r.groundedEligible, true);
  assert.equal(r.providerEligible, true);
});

test('the deterministic brand-category result carries broad-range precision and concrete refinement identifiers', () => {
  const queryInfo = classifySmartLookupQuery('Whirlpool top-load washer');
  const result = buildDeterministicBroadResult(queryInfo);
  assert.equal(result.precisionLevel, 'broad-range');
  assert.equal(result.confidenceLevel, 'low');
  assert.equal(result.recognizedBrand, 'Whirlpool');
  assert.equal(result.recognizedCategory, 'washer');
  assert.ok(result.recommendedIdentifiers.length > 0);
});
