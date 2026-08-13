import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateRcvAcv } from '../../lib/calculators/rcv-acv.js';

test('standard straight-line calculation under the max', () => {
  const result = calculateRcvAcv({ replacementCost: 1500, ageYears: 3, usefulLifeYears: 15, maxDepreciationPct: 25 });
  assert.equal(result.valid, true);
  assert.equal(result.straightLinePct, 20);
  assert.equal(result.cappedByMax, false);
  assert.equal(result.depreciationPct, 20);
  assert.equal(result.depreciationAmount, 300);
  assert.equal(result.acv, 1200);
});

test('applies the 25% default maximum when straight-line exceeds it', () => {
  const result = calculateRcvAcv({ replacementCost: 2000, ageYears: 10, usefulLifeYears: 15, maxDepreciationPct: 25 });
  assert.equal(result.straightLinePct, 66.67);
  assert.equal(result.cappedByMax, true);
  assert.equal(result.depreciationPct, 25);
  assert.equal(result.depreciationAmount, 500);
  assert.equal(result.acv, 1500);
  assert.match(result.detailText, /limited by the selected 25% maximum/);
});

test('custom maximum changes the cap and result', () => {
  const result = calculateRcvAcv({ replacementCost: 2000, ageYears: 10, usefulLifeYears: 15, maxDepreciationPct: 50 });
  assert.equal(result.cappedByMax, true);
  assert.equal(result.depreciationPct, 50);
  assert.equal(result.acv, 1000);
});

test('manual adjustment shifts depreciation transparently', () => {
  const result = calculateRcvAcv({ replacementCost: 1000, ageYears: 3, usefulLifeYears: 15, maxDepreciationPct: 25, manualAdjustmentPct: 5 });
  assert.equal(result.straightLinePct, 20);
  assert.equal(result.manualAdjustmentApplied, true);
  assert.equal(result.depreciationPct, 25);
  assert.match(result.detailText, /manual adjustment of \+5/);
});

test('manual adjustment is clamped so it cannot exceed the selected maximum', () => {
  const result = calculateRcvAcv({ replacementCost: 1000, ageYears: 10, usefulLifeYears: 15, maxDepreciationPct: 25, manualAdjustmentPct: 20 });
  assert.equal(result.depreciationPct, 25);
  assert.equal(result.manualAdjustmentClamped, true);
});

test('manual adjustment cannot push depreciation below 0%', () => {
  const result = calculateRcvAcv({ replacementCost: 1000, ageYears: 1, usefulLifeYears: 15, maxDepreciationPct: 25, manualAdjustmentPct: -50 });
  assert.equal(result.depreciationPct, 0);
  assert.equal(result.depreciationAmount, 0);
  assert.equal(result.acv, 1000);
  assert.equal(result.manualAdjustmentClamped, true);
});

test('age greater than useful life is capped, never runs away past the maximum', () => {
  const result = calculateRcvAcv({ replacementCost: 800, ageYears: 40, usefulLifeYears: 10, maxDepreciationPct: 25 });
  assert.equal(result.straightLinePct, 400);
  assert.equal(result.cappedByMax, true);
  assert.equal(result.depreciationPct, 25);
  assert.equal(result.acv, 600);
});

test('zero useful life is rejected', () => {
  const result = calculateRcvAcv({ replacementCost: 800, ageYears: 5, usefulLifeYears: 0, maxDepreciationPct: 25 });
  assert.equal(result.valid, false);
  assert.match(result.error, /useful life/i);
});

test('blank inputs are rejected', () => {
  const result = calculateRcvAcv({ replacementCost: '', ageYears: '', usefulLifeYears: '', maxDepreciationPct: '' });
  assert.equal(result.valid, false);
});

test('negative numbers are rejected', () => {
  const result = calculateRcvAcv({ replacementCost: -100, ageYears: 5, usefulLifeYears: 10, maxDepreciationPct: 25 });
  assert.equal(result.valid, false);
  assert.match(result.error, /negative/i);
});

test('NaN / non-numeric input is rejected', () => {
  const result = calculateRcvAcv({ replacementCost: 'abc', ageYears: 5, usefulLifeYears: 10, maxDepreciationPct: 25 });
  assert.equal(result.valid, false);
});

test('maximum depreciation above 100% is rejected', () => {
  const result = calculateRcvAcv({ replacementCost: 800, ageYears: 5, usefulLifeYears: 10, maxDepreciationPct: 150 });
  assert.equal(result.valid, false);
});

test('replacement cost of zero is rejected', () => {
  const result = calculateRcvAcv({ replacementCost: 0, ageYears: 5, usefulLifeYears: 10, maxDepreciationPct: 25 });
  assert.equal(result.valid, false);
});

test('decimal age values are supported', () => {
  const result = calculateRcvAcv({ replacementCost: 1000, ageYears: 2.5, usefulLifeYears: 10, maxDepreciationPct: 25 });
  assert.equal(result.valid, true);
  assert.equal(result.straightLinePct, 25);
  assert.equal(result.depreciationPct, 25);
});

test('100% maximum depreciation is allowed as an explicit custom choice', () => {
  const result = calculateRcvAcv({ replacementCost: 1000, ageYears: 20, usefulLifeYears: 10, maxDepreciationPct: 100 });
  assert.equal(result.valid, true);
  assert.equal(result.depreciationPct, 100);
  assert.equal(result.acv, 0);
});
