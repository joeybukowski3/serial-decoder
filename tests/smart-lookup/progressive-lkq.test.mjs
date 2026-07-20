import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySmartLookupQuery, deriveReplacementPrecision } from '../../lib/smart-lookup/normalize.js';
import { buildDeterministicReplacementResult } from '../../lib/smart-lookup/replacement-static-results.js';
import { buildSmartLkqCacheKey } from '../../lib/smart-lookup/cache.js';

// ── Dell OptiPlex 9020 regression fixture ───────────────────────────────────

test('OptiPlex 9020 is recognized as Dell, business desktop, model-line', () => {
  const r = classifySmartLookupQuery('OptiPlex 9020');
  assert.equal(r.brand, 'Dell');
  assert.equal(r.recognizedCategory, 'desktop computer');
  assert.equal(r.productFamily, 'OptiPlex');
  assert.equal(r.querySpecificity, 'model-line');
  assert.equal(r.replacementPrecision, 'model-line');
  assert.equal(r.exactModel, null);
  assert.equal(r.lkqGroundedEligible, true);
  assert.equal(r.providerEligible, true);
});

test('Dell OptiPlex 9020 resolves to the same model-line identity as bare OptiPlex 9020', () => {
  const bare = classifySmartLookupQuery('OptiPlex 9020');
  const withBrand = classifySmartLookupQuery('Dell OptiPlex 9020');
  assert.equal(withBrand.querySpecificity, 'model-line');
  assert.equal(withBrand.modelLineId, bare.modelLineId);
  assert.equal(withBrand.replacementPrecision, 'model-line');
});

test('OptiPlex 9020 SFF captures the small-form-factor hint and stays model-line', () => {
  const r = classifySmartLookupQuery('OptiPlex 9020 SFF');
  assert.equal(r.querySpecificity, 'model-line');
  assert.equal(r.formFactor, 'small-form-factor');
  assert.notEqual(r.exactModel, 'OPTIPLEX9020SFF');
  assert.equal(r.exactModel, null);
});

test('OptiPlex 9020 MT captures the mini-tower hint and is distinct from SFF', () => {
  const sff = classifySmartLookupQuery('OptiPlex 9020 SFF');
  const mt = classifySmartLookupQuery('OptiPlex 9020 MT');
  assert.equal(mt.formFactor, 'mini-tower');
  assert.notEqual(mt.formFactor, sff.formFactor);
});

test('OptiPlex 9020 USFF and Micro are captured only as form-factor hints, never exact-model', () => {
  const usff = classifySmartLookupQuery('OptiPlex 9020 USFF');
  const micro = classifySmartLookupQuery('OptiPlex 9020 Micro');
  assert.equal(usff.formFactor, 'ultra-small-form-factor');
  assert.equal(micro.formFactor, 'micro');
  assert.equal(usff.querySpecificity, 'model-line');
  assert.equal(micro.querySpecificity, 'model-line');
  assert.equal(usff.exactModel, null);
  assert.equal(micro.exactModel, null);
});

test('Generic OptiPlex is product-family, not model-line, with no assumed configuration', () => {
  const r = classifySmartLookupQuery('Generic OptiPlex');
  assert.equal(r.querySpecificity, 'product-family');
  assert.equal(r.replacementPrecision, 'product-family');
  assert.equal(r.modelLineId, null);
  assert.equal(r.exactModel, null);
});

// ── Service-tag safety ───────────────────────────────────────────────────────

test('a bare service-tag-like token is not mistaken for a model line', () => {
  const r = classifySmartLookupQuery('1A2B3C4');
  assert.equal(r.familyId, null);
  assert.equal(r.modelLineId, null);
  assert.notEqual(r.querySpecificity, 'model-line');
  assert.notEqual(r.querySpecificity, 'exact-model');
});

test('explicit "service tag" phrasing sets serviceTagIntent without blocking product recognition', () => {
  const withFamily = classifySmartLookupQuery('Dell OptiPlex 9020 service tag ABC1234');
  assert.equal(withFamily.serviceTagIntent, true);
  assert.equal(withFamily.querySpecificity, 'model-line');
});

test('a service tag alone is not eligible for grounded replacement research', () => {
  const r = classifySmartLookupQuery('service tag ABC1234');
  assert.equal(r.serviceTagIntent, true);
  assert.equal(r.lkqGroundedEligible, false);
});

// ── deriveReplacementPrecision (notes-aware exact-configuration upgrade) ────

test('exact-model plus rich spec notes upgrades to exact-configuration', () => {
  const base = classifySmartLookupQuery('Samsung QN65Q60RAFXZA');
  assert.equal(base.replacementPrecision, 'exact-model');
  const upgraded = deriveReplacementPrecision(base, 'Original has an i7 processor and 16GB RAM installed, 512GB SSD storage');
  assert.equal(upgraded, 'exact-configuration');
});

test('exact-model with only a single spec keyword in notes stays exact-model', () => {
  const base = classifySmartLookupQuery('Samsung QN65Q60RAFXZA');
  const notUpgraded = deriveReplacementPrecision(base, 'has a nice processor');
  assert.equal(notUpgraded, 'exact-model');
});

test('model-line queries are never upgraded to exact-configuration by notes alone', () => {
  const base = classifySmartLookupQuery('OptiPlex 9020');
  const stillModelLine = deriveReplacementPrecision(base, 'processor, ram, storage, graphics all specified');
  assert.equal(stillModelLine, 'model-line');
});

// ── Generalized business-computer + laptop family support ──────────────────

test('Lenovo ThinkCentre M720 resolves to model-line', () => {
  const r = classifySmartLookupQuery('Lenovo ThinkCentre M720');
  assert.equal(r.brand, 'Lenovo');
  assert.equal(r.querySpecificity, 'model-line');
  assert.equal(r.recognizedCategory, 'desktop computer');
});

test('HP EliteDesk 800 G3 resolves to model-line', () => {
  const r = classifySmartLookupQuery('HP EliteDesk 800 G3');
  assert.equal(r.brand, 'HP');
  assert.equal(r.querySpecificity, 'model-line');
});

test('Dell Inspiron 15 stays product-family and is not LKQ grounded-eligible (low confidence)', () => {
  const r = classifySmartLookupQuery('Dell Inspiron 15');
  assert.equal(r.querySpecificity, 'product-family');
  assert.equal(r.lkqGroundedEligible, false);
});

test('Acer AN515-58 model-line classification is unchanged by the business-computer additions', () => {
  const r = classifySmartLookupQuery('Acer AN515-58');
  assert.equal(r.querySpecificity, 'model-line');
  assert.equal(r.modelLineId, 'an515');
  assert.equal(r.lkqGroundedEligible, true);
});

// ── Deterministic replacement fallback content (Phase 8) ────────────────────

test('deterministic fallback for OptiPlex 9020 communicates Dell OptiPlex recognition and configuration variance', () => {
  const queryInfo = classifySmartLookupQuery('OptiPlex 9020');
  const raw = buildDeterministicReplacementResult(queryInfo);
  assert.ok(raw);
  assert.equal(raw.itemSummary.brand, 'Dell');
  assert.match(raw.itemSummary.description, /OptiPlex/);
  assert.match(raw.itemSummary.description, /varies/);
  assert.equal(raw.replacementRelationship, 'none-found');
  assert.ok(raw.comparisonCriteria.length > 0);
  assert.ok(raw.recommendedIdentifiers.length > 0);
});

test('deterministic fallback is null for a truly unusable query', () => {
  const queryInfo = classifySmartLookupQuery('xqzvv');
  assert.equal(buildDeterministicReplacementResult(queryInfo), null);
});

test('deterministic fallback is null for exact-model queries (they never need a fallback card)', () => {
  const queryInfo = classifySmartLookupQuery('Samsung QN65Q60RAFXZA');
  assert.equal(buildDeterministicReplacementResult(queryInfo), null);
});

// ── Cache identity (Phase 9) ─────────────────────────────────────────────────

function lkqKey(query, grounded = false) {
  return buildSmartLkqCacheKey(classifySmartLookupQuery(query), { grounded });
}

test('OptiPlex 9020 and OptiPlex 9020 SFF never collide', () => {
  assert.notEqual(lkqKey('OptiPlex 9020'), lkqKey('OptiPlex 9020 SFF'));
});

test('OptiPlex 9020 MT and OptiPlex 9020 SFF never collide', () => {
  assert.notEqual(lkqKey('OptiPlex 9020 MT'), lkqKey('OptiPlex 9020 SFF'));
});

test('Generic OptiPlex and OptiPlex 9020 never collide', () => {
  assert.notEqual(lkqKey('Generic OptiPlex'), lkqKey('OptiPlex 9020'));
});

test('different OptiPlex model lines never collide', () => {
  assert.notEqual(lkqKey('OptiPlex 9020'), lkqKey('OptiPlex 7020'));
});

test('grounded and ungrounded keys for the same query differ', () => {
  assert.notEqual(lkqKey('OptiPlex 9020', true), lkqKey('OptiPlex 9020', false));
});

test('notes/specification context changes the cache key safely (hashed, not raw)', () => {
  const withoutNotes = classifySmartLookupQuery('OptiPlex 9020');
  const withNotes = { ...withoutNotes, notesHash: 'abcdef0123456789' };
  const keyA = buildSmartLkqCacheKey(withoutNotes, { grounded: false });
  const keyB = buildSmartLkqCacheKey(withNotes, { grounded: false });
  assert.notEqual(keyA, keyB);
});
