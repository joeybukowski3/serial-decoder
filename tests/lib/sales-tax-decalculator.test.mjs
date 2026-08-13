import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSalesTaxDecalc } from '../../lib/calculators/sales-tax-decalc.js';

test('standard reverse calculation matches the documented example', () => {
  const result = calculateSalesTaxDecalc({ totalIncludingTax: 2500, taxRatePct: 7 });
  assert.equal(result.valid, true);
  assert.equal(result.preTaxAmount, 2336.45);
  assert.equal(result.embeddedTax, 163.55);
  assert.equal(result.totalIncludingTax, 2500);
});

test('simply subtracting the tax percentage would be wrong (sanity check against naive approach)', () => {
  const result = calculateSalesTaxDecalc({ totalIncludingTax: 2500, taxRatePct: 7 });
  const naiveWrongAnswer = 2500 - 2500 * 0.07; // 2325.00 — incorrect
  assert.notEqual(result.preTaxAmount, naiveWrongAnswer);
});

test('decimal tax rates are supported', () => {
  const result = calculateSalesTaxDecalc({ totalIncludingTax: 1000, taxRatePct: 8.25 });
  assert.equal(result.valid, true);
  assert.equal(result.preTaxAmount, 923.79);
  assert.equal(result.embeddedTax, 76.21);
});

test('zero percent tax returns the total unchanged', () => {
  const result = calculateSalesTaxDecalc({ totalIncludingTax: 500, taxRatePct: 0 });
  assert.equal(result.valid, true);
  assert.equal(result.preTaxAmount, 500);
  assert.equal(result.embeddedTax, 0);
});

test('large amounts calculate correctly', () => {
  const result = calculateSalesTaxDecalc({ totalIncludingTax: 1250000, taxRatePct: 6.5 });
  assert.equal(result.valid, true);
  assert.equal(result.preTaxAmount, 1173708.92);
  assert.equal(roundToCents(result.preTaxAmount + result.embeddedTax), 1250000);
});

test('blank inputs are rejected', () => {
  const result = calculateSalesTaxDecalc({ totalIncludingTax: '', taxRatePct: '' });
  assert.equal(result.valid, false);
});

test('negative total is rejected', () => {
  const result = calculateSalesTaxDecalc({ totalIncludingTax: -100, taxRatePct: 7 });
  assert.equal(result.valid, false);
});

test('negative tax rate is rejected', () => {
  const result = calculateSalesTaxDecalc({ totalIncludingTax: 100, taxRatePct: -5 });
  assert.equal(result.valid, false);
});

test('non-numeric input is rejected', () => {
  const result = calculateSalesTaxDecalc({ totalIncludingTax: 'abc', taxRatePct: 7 });
  assert.equal(result.valid, false);
});

test('tax rate of 100% or more is rejected', () => {
  const result = calculateSalesTaxDecalc({ totalIncludingTax: 100, taxRatePct: 100 });
  assert.equal(result.valid, false);
});

test('rounding behavior stays at cents precision', () => {
  const result = calculateSalesTaxDecalc({ totalIncludingTax: 19.99, taxRatePct: 7.375 });
  assert.equal(result.valid, true);
  assert.equal(Number.isInteger(result.preTaxAmount * 100), true);
  assert.equal(Number.isInteger(result.embeddedTax * 100), true);
});

function roundToCents(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
