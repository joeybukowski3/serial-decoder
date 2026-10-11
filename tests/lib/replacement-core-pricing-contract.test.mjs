import test from 'node:test';
import assert from 'node:assert/strict';
import { assessPriceObservation, validatePriceObservation } from '../../lib/replacement-core/contracts.js';

const observation = {
  contractVersion: '1.0.0', observationId: 'price-1', candidateId: 'tv-replacement-65', exactCandidateModel: 'QN65Q80NEW',
  seller: 'Example Retailer', url: 'https://example.com/product', amount: 999.99, currency: 'USD', condition: 'NEW',
  stockStatus: 'IN_STOCK', observedAt: '2026-09-30T12:00:00Z', authorizedRetailer: null,
  sourceEvidenceId: 'retail-source-1', priceType: 'REGULAR',
};

test('valid exact-model new in-stock observation may contribute while fresh', () => {
  assert.deepEqual(validatePriceObservation(observation), []);
  const result = assessPriceObservation(observation, '2026-10-01T12:00:00Z', 'QN65Q80NEW');
  assert.equal(result.valid, true);
  assert.equal(result.contributesToCurrentCost, true);
  assert.equal(result.stale, false);
});

test('sale expires after 24 hours; regular offer after 72 hours', () => {
  assert.equal(assessPriceObservation({ ...observation, priceType: 'SALE' }, '2026-10-01T12:00:01Z', 'QN65Q80NEW').stale, true);
  assert.equal(assessPriceObservation(observation, '2026-10-03T12:00:01Z', 'QN65Q80NEW').stale, true);
});

test('wrong model, out of stock, and non-new offers cannot make current new-retail price', () => {
  assert.ok(assessPriceObservation(observation, '2026-09-30T13:00:00Z', 'OTHER').exclusionReasons.includes('MODEL_MISMATCH'));
  assert.ok(assessPriceObservation({ ...observation, stockStatus: 'OUT_OF_STOCK' }, '2026-09-30T13:00:00Z', 'QN65Q80NEW').exclusionReasons.includes('NOT_IN_STOCK'));
  assert.ok(assessPriceObservation({ ...observation, condition: 'OPEN_BOX' }, '2026-09-30T13:00:00Z', 'QN65Q80NEW').exclusionReasons.includes('NOT_NEW'));
  assert.ok(validatePriceObservation({ ...observation, url: '', amount: -1 }).length >= 2);
  assert.ok(validatePriceObservation({ ...observation, priceType: 'UNKNOWN' }).includes('invalid priceType'));
});
