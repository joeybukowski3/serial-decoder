import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateRcvAcv } from '../../lib/calculators/rcv-acv.js';

test('rate × age calculation below the cap', () => {
  const result = calculateRcvAcv({ replacementCost: 1000, ageYears: 4, annualDepreciationRatePct: 10, maxTotalDepreciationPct: 75 });
  assert.equal(result.valid, true);
  assert.equal(result.rawDepreciationPct, 40);
  assert.equal(result.cappedByMax, false);
  assert.equal(result.depreciationPct, 40);
  assert.equal(result.depreciationAmount, 400);
  assert.equal(result.acv, 600);
  assert.equal(result.detailText, 'Annual rate: 10.00%/year × 4 years = 40% calculated depreciation.');
});

test('calculation exceeding the cap is limited to the selected maximum', () => {
  const result = calculateRcvAcv({ replacementCost: 1000, ageYears: 9, annualDepreciationRatePct: 10, maxTotalDepreciationPct: 75, rateLabel: 'Claims Pages reference rate' });
  assert.equal(result.rawDepreciationPct, 90);
  assert.equal(result.cappedByMax, true);
  assert.equal(result.depreciationPct, 75);
  assert.equal(result.depreciationAmount, 750);
  assert.equal(result.acv, 250);
  assert.equal(result.detailText, 'Claims Pages reference rate: 10.00%/year × 9 years = 90% calculated depreciation; limited to the selected 75% maximum total depreciation.');
});

test('75% is the default Maximum Total Depreciation and leaves at least 25% of value', () => {
  const result = calculateRcvAcv({ replacementCost: 2000, ageYears: 50, annualDepreciationRatePct: 10, maxTotalDepreciationPct: 75 });
  assert.equal(result.depreciationPct, 75);
  assert.equal(result.acv, 500); // 25% of 2000
});

test('custom maximum changes the cap and result', () => {
  const result = calculateRcvAcv({ replacementCost: 1000, ageYears: 9, annualDepreciationRatePct: 10, maxTotalDepreciationPct: 90 });
  assert.equal(result.cappedByMax, false);
  assert.equal(result.depreciationPct, 90);
  assert.equal(result.acv, 100);
});

test('positive manual adjustment increases depreciation before the cap', () => {
  const result = calculateRcvAcv({ replacementCost: 1000, ageYears: 4, annualDepreciationRatePct: 10, maxTotalDepreciationPct: 75, manualAdjustmentPct: 5 });
  assert.equal(result.rawDepreciationPct, 40);
  assert.equal(result.manualAdjustmentApplied, true);
  assert.equal(result.depreciationPct, 45);
  assert.match(result.detailText, /manual adjustment of \+5 percentage points/);
});

test('negative manual adjustment decreases depreciation before the cap', () => {
  const result = calculateRcvAcv({ replacementCost: 1000, ageYears: 4, annualDepreciationRatePct: 10, maxTotalDepreciationPct: 75, manualAdjustmentPct: -5 });
  assert.equal(result.depreciationPct, 35);
  assert.match(result.detailText, /manual adjustment of -5 percentage points/);
});

test('manual adjustment plus cap: adjustment pushes past the max and is clamped', () => {
  const result = calculateRcvAcv({ replacementCost: 1000, ageYears: 8, annualDepreciationRatePct: 10, maxTotalDepreciationPct: 75, manualAdjustmentPct: 10 });
  // raw 80 + 10 = 90, clamped to 75
  assert.equal(result.rawDepreciationPct, 80);
  assert.equal(result.manualAdjustmentClamped, true);
  assert.equal(result.depreciationPct, 75);
});

test('manual adjustment cannot push depreciation below 0%', () => {
  const result = calculateRcvAcv({ replacementCost: 1000, ageYears: 1, annualDepreciationRatePct: 5, maxTotalDepreciationPct: 75, manualAdjustmentPct: -50 });
  assert.equal(result.depreciationPct, 0);
  assert.equal(result.depreciationAmount, 0);
  assert.equal(result.acv, 1000);
  assert.equal(result.manualAdjustmentClamped, true);
});

test('zero age is valid and produces zero depreciation', () => {
  const result = calculateRcvAcv({ replacementCost: 1000, ageYears: 0, annualDepreciationRatePct: 10, maxTotalDepreciationPct: 75 });
  assert.equal(result.valid, true);
  assert.equal(result.rawDepreciationPct, 0);
  assert.equal(result.depreciationPct, 0);
  assert.equal(result.acv, 1000);
});

test('invalid (negative) age is rejected', () => {
  const result = calculateRcvAcv({ replacementCost: 1000, ageYears: -2, annualDepreciationRatePct: 10, maxTotalDepreciationPct: 75 });
  assert.equal(result.valid, false);
  assert.match(result.error, /negative/i);
});

test('invalid (non-numeric) age is rejected', () => {
  const result = calculateRcvAcv({ replacementCost: 1000, ageYears: 'abc', annualDepreciationRatePct: 10, maxTotalDepreciationPct: 75 });
  assert.equal(result.valid, false);
});

test('invalid (zero) replacement cost is rejected', () => {
  const result = calculateRcvAcv({ replacementCost: 0, ageYears: 4, annualDepreciationRatePct: 10, maxTotalDepreciationPct: 75 });
  assert.equal(result.valid, false);
});

test('invalid (negative) replacement cost is rejected', () => {
  const result = calculateRcvAcv({ replacementCost: -500, ageYears: 4, annualDepreciationRatePct: 10, maxTotalDepreciationPct: 75 });
  assert.equal(result.valid, false);
  assert.match(result.error, /negative/i);
});

test('undetermined / Other-Custom items require a manual rate — blank rate is rejected', () => {
  const result = calculateRcvAcv({ replacementCost: 1000, ageYears: 4, annualDepreciationRatePct: '', maxTotalDepreciationPct: 75 });
  assert.equal(result.valid, false);
  assert.match(result.error, /annual depreciation rate/i);
});

test('a manually entered rate for an undetermined item calculates normally once provided', () => {
  const result = calculateRcvAcv({ replacementCost: 1000, ageYears: 4, annualDepreciationRatePct: 12.5, maxTotalDepreciationPct: 75, rateLabel: 'Custom rate' });
  assert.equal(result.valid, true);
  assert.equal(result.rawDepreciationPct, 50);
  assert.match(result.detailText, /^Custom rate: 12\.50%\/year/);
});

test('maximum total depreciation above 100% is rejected', () => {
  const result = calculateRcvAcv({ replacementCost: 1000, ageYears: 4, annualDepreciationRatePct: 10, maxTotalDepreciationPct: 150 });
  assert.equal(result.valid, false);
});

test('blank inputs are rejected', () => {
  const result = calculateRcvAcv({ replacementCost: '', ageYears: '', annualDepreciationRatePct: '', maxTotalDepreciationPct: '' });
  assert.equal(result.valid, false);
});

test('no useful-life-derived calculation remains: an extraneous usefulLifeYears input is ignored entirely', () => {
  const withUsefulLife = calculateRcvAcv({ replacementCost: 1000, ageYears: 4, annualDepreciationRatePct: 10, maxTotalDepreciationPct: 75, usefulLifeYears: 5 });
  const withoutUsefulLife = calculateRcvAcv({ replacementCost: 1000, ageYears: 4, annualDepreciationRatePct: 10, maxTotalDepreciationPct: 75 });
  assert.deepEqual(withUsefulLife, withoutUsefulLife);
  assert.equal('usefulLifeYears' in withUsefulLife, false);
});

test('known value: Dishwasher-equivalent rate (10.00%/yr) at 3 years', () => {
  const result = calculateRcvAcv({ replacementCost: 800, ageYears: 3, annualDepreciationRatePct: 10.00, maxTotalDepreciationPct: 75 });
  assert.equal(result.rawDepreciationPct, 30);
});

test('known value: Computer rate (25.00%/yr) reaches the default cap quickly', () => {
  const result = calculateRcvAcv({ replacementCost: 1200, ageYears: 3, annualDepreciationRatePct: 25.00, maxTotalDepreciationPct: 75 });
  assert.equal(result.rawDepreciationPct, 75);
  assert.equal(result.cappedByMax, false); // exactly at the cap, not over it
  assert.equal(result.depreciationPct, 75);
});
