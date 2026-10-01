import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RESULT_STATUSES,
  YEAR_SIGNALS,
  classifySmartOutcome,
  yearSignalOf,
} from '../../lib/smart-lookup/outcome.js';
import { normalizeSmartAgeResult } from '../../lib/smart-lookup/result-schema.js';
import { classifySmartLookupQuery } from '../../lib/smart-lookup/normalize.js';

const status = (data) => classifySmartOutcome(data).resultStatus;
const reason = (data) => classifySmartOutcome(data).outcomeReason;

test('the result statuses are exactly the documented set', () => {
  assert.deepEqual([...RESULT_STATUSES], ['resolved', 'partial', 'needs-detail', 'conflict', 'no-result', 'error']);
});

test('recognized-but-undated outcomes are needs-detail, not no-result', () => {
  const fixtures = [
    [{ brand: 'Whirlpool', category: 'washer', querySpecificity: 'brand-category' }, 'brand-category-recognized'],
    [{ brand: 'Whirlpool', model: 'WRF535', querySpecificity: 'free-description' }, 'model-recognized-undated'],
    [{ brand: 'Whirlpool', querySpecificity: 'brand-only' }, 'brand-recognized'],
    [{ category: 'washer', querySpecificity: 'category-only' }, 'category-recognized'],
    [{ brand: 'Dell', productFamily: 'OptiPlex', yearContext: { type: 'unknown' } }, 'product-recognized-undated'],
    [{ brand: 'LG', productFamily: 'C3', exactModel: 'OLED55C3PUA', yearContext: { type: 'unknown' } }, 'product-recognized-undated'],
    [{ brand: 'Unknown', likelyProduct: 'iPhone 14', querySpecificity: 'free-description' }, 'product-identified-no-year'],
  ];
  for (const [data, expected] of fixtures) {
    assert.equal(status(data), 'needs-detail', JSON.stringify(data));
    assert.equal(reason(data), expected, JSON.stringify(data));
  }
});

test('an exact model recognized with no year is needs-detail with its own reason', () => {
  const data = { brand: 'Dell', productFamily: 'OptiPlex', exactModel: 'OPTIPLEX9020' };
  assert.equal(status(data), 'needs-detail');
  assert.equal(reason(data), 'exact-model-undated');
});

test('general-guidance results report needs-detail with the guidance reason', () => {
  const data = { brand: 'Samsung', category: 'refrigerator', querySpecificity: 'brand-category', routeMode: 'general_guidance' };
  assert.deepEqual(classifySmartOutcome(data), {
    resultStatus: 'needs-detail', outcomeReason: 'general-guidance', yearSignal: 'none', routeMode: 'general_guidance',
  });
  // Even with trusted local category history (usable info, but no year), it is guidance.
  const withHistory = { ...data, historicalContext: 'Category history.', routeMode: 'general_guidance' };
  assert.equal(status(withHistory), 'needs-detail');
});

test('429, RATE_LIMIT and limiter-store failures are errors, even with a recognized product', () => {
  for (const [code, expected] of [
    ['PROVIDER_RATE_LIMIT', 'provider-rate-limited'],
    ['RATE_LIMIT', 'rate-limited'],
    ['RATE_LIMIT_STORE_UNAVAILABLE', 'rate-limit-store-unavailable'],
  ]) {
    for (const extra of [{}, { productFamily: 'OptiPlex', yearContext: { type: 'unknown' } }, { querySpecificity: 'brand-category', brand: 'Acer', category: 'laptop' }]) {
      const data = { brand: 'Dell', errorCode: code, ...extra };
      assert.equal(status(data), 'error', `${code} ${JSON.stringify(extra)}`);
      assert.equal(reason(data), expected, code);
    }
  }
});

test('other technical failures are errors, including with a recognized family', () => {
  for (const [code, expected] of [
    ['PROVIDER_TIMEOUT', 'provider-timeout'],
    ['TOTAL_DEADLINE', 'provider-timeout'],
    ['PROVIDER_MALFORMED_JSON', 'provider-malformed'],
    ['GLOBAL_BUDGET_EXHAUSTED', 'capacity'],
    ['BUDGET_STORE_UNAVAILABLE', 'capacity'],
    ['AI_QUOTA_EXCEEDED', 'capacity'],
    ['INTERNAL_ERROR', 'internal-error'],
    ['PROVIDERS_UNAVAILABLE', 'provider-unavailable'],
    ['OPENAI_SCHEMA_INVALID', 'provider-unavailable'],
  ]) {
    assert.deepEqual(
      [status({ brand: 'Dell', errorCode: code }), reason({ brand: 'Dell', errorCode: code })],
      ['error', expected],
      code,
    );
    assert.equal(status({ brand: 'Dell', productFamily: 'OptiPlex', yearContext: { type: 'unknown' }, errorCode: code }), 'error', `${code} with family`);
  }
  assert.equal(status(null), 'error');
  assert.equal(reason(null), 'network-error');
});

test('no-result is reserved for input that carries nothing to recognize', () => {
  assert.deepEqual(
    [status({ querySpecificity: 'unusable' }), reason({ querySpecificity: 'unusable' })],
    ['no-result', 'unusable-query'],
  );
  assert.deepEqual(
    [status({ brand: 'Unknown' }), reason({ brand: 'Unknown' })],
    ['no-result', 'nothing-recognized'],
  );
  assert.deepEqual(
    [status({ errorCode: 'INSUFFICIENT_QUERY_DETAIL', brand: 'Unknown' }), reason({ errorCode: 'INSUFFICIENT_QUERY_DETAIL', brand: 'Unknown' })],
    ['no-result', 'insufficient-input'],
  );
});

test('dated results keep their status and a conflict stays a conflict', () => {
  assert.equal(status({ individualManufactureYear: 2020, brand: 'LG' }), 'resolved');
  assert.equal(status({ introductionYear: 2018, brand: 'LG' }), 'resolved');
  assert.equal(status({ introductionYear: 2018, precisionLevel: 'family-range' }), 'partial');
  assert.equal(status({ introductionYear: 2018, errorCode: 'PROVIDER_TIMEOUT', fallbackKind: 'deterministic-family' }), 'partial');
  assert.equal(status({ evidenceConflict: true, brand: 'LG' }), 'conflict');
  assert.equal(status({ errorCode: 'INTRODUCTION_AFTER_RANGE' }), 'conflict');
});

test('timing the vague-query guard withheld is needs-detail with its own reason', () => {
  const data = { brand: 'LG', category: 'television', querySpecificity: 'brand-category', yearEvidenceWithheld: true };
  assert.deepEqual([status(data), reason(data)], ['needs-detail', 'low-confidence-estimate']);
});

test('year signal separates exact, range, open-ended, single-year and none', () => {
  assert.equal(yearSignalOf({ individualManufactureYear: 2020 }), 'exact-unit');
  assert.equal(yearSignalOf({ manufactureYearCandidates: [2019, 2029] }), 'candidates');
  assert.equal(yearSignalOf({ productionRange: { start: 2017, end: 2020 } }), 'range');
  assert.equal(yearSignalOf({ introductionYear: 2018 }), 'year');
  assert.equal(yearSignalOf({ introductionYear: 2015, estimatedRange: { start: 2015, end: null }, estimateBasis: 'product-family-introduction' }), 'open-ended');
  assert.equal(yearSignalOf({ brand: 'LG', historicalContext: 'history only' }), 'none');
  assert.equal(yearSignalOf(null), 'none');
  assert.ok(YEAR_SIGNALS.includes('open-ended'));
});

// ── The schema normalizer preserves evidence the provider returned ──────────────

const normalize = (raw, query, extra = {}) => normalizeSmartAgeResult(raw, {
  queryInfo: classifySmartLookupQuery(query), source: 'gemini', evidenceSource: 'gemini-ungrounded', ...extra,
});

test('a best-estimate year alone is preserved as a dated result', () => {
  const result = normalize({ brand: 'Whirlpool', bestEstimateYear: 2018, likelyProduct: 'Whirlpool WRF535SWHZ00', identityConfidence: 'medium' }, 'Whirlpool WRF535SWHZ00');
  assert.equal(result.yearContext.value, 2018);
  assert.equal(result.yearSignal, 'year');
  assert.equal(classifySmartOutcome(result).resultStatus, 'resolved');
});

test('an open-ended range with no best year is preserved, labeled "or later"', () => {
  const result = normalize({
    brand: 'Whirlpool', estimatedRange: { start: 2015, end: null },
    likelyProduct: 'Whirlpool WRF535SWHZ00', identityConfidence: 'medium',
  }, 'Whirlpool WRF535SWHZ00');
  assert.equal(result.yearContext.value, 2015);
  assert.equal(result.rangeLabel, '2015 or later');
  assert.equal(result.openEndedRange, true);
  assert.equal(result.yearSignal, 'open-ended');
  assert.equal(classifySmartOutcome(result).resultStatus, 'resolved');
});

test('open-endedness survives a cache round trip without turning every introduction year open-ended', () => {
  const open = normalize({ brand: 'Whirlpool', estimatedRange: { start: 2015, end: null }, likelyProduct: 'x', identityConfidence: 'medium' }, 'Whirlpool WRF535SWHZ00');
  const again = normalize(JSON.parse(JSON.stringify(open)), 'Whirlpool WRF535SWHZ00');
  assert.equal(again.yearSignal, 'open-ended');

  const single = normalize({ brand: 'Whirlpool', introductionYear: 2018, likelyProduct: 'x', identityConfidence: 'medium' }, 'Whirlpool WRF535SWHZ00');
  assert.equal(single.yearSignal, 'year');
  assert.equal(normalize(JSON.parse(JSON.stringify(single)), 'Whirlpool WRF535SWHZ00').yearSignal, 'year');
});

test('the vague-query guard still withholds timing for an unidentified product, and says so', () => {
  const result = normalize({
    brand: 'Samsung', bestEstimateYear: 2012, estimatedRange: { start: 2010, end: 2014 },
    introductionYear: 2012, productionRange: { start: 2010, end: 2014 },
    likelyProduct: 'Samsung refrigerator', identityConfidence: 'low',
  }, 'Samsung Refrigerator');
  assert.equal(result.introductionYear, null);
  assert.equal(result.productionRange, null);
  assert.equal(result.yearContext, null, 'the guard is not bypassed by the new best-estimate/range preservation');
  assert.equal(result.yearSignal, 'none');
  assert.equal(result.yearEvidenceWithheld, true);
  assert.deepEqual(
    [classifySmartOutcome(result).resultStatus, classifySmartOutcome(result).outcomeReason],
    ['needs-detail', 'low-confidence-estimate'],
  );
});
