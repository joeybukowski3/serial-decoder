import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRelativeDate } from '../../lib/serial-refinement/deterministic/date-normalizer.js';

const REF = new Date('2026-07-29T00:00:00Z');

test('normalizeRelativeDate handles "N days ago"', () => {
  assert.equal(normalizeRelativeDate('1 day ago', REF).year, 2026);
  assert.equal(normalizeRelativeDate('1 day ago', REF).precision, 'day');
});

test('normalizeRelativeDate handles "yesterday"', () => {
  assert.equal(normalizeRelativeDate('yesterday', REF).year, 2026);
});

test('normalizeRelativeDate handles "N months ago" crossing a year boundary', () => {
  const result = normalizeRelativeDate('8 months ago', REF);
  assert.equal(result.year, 2025);
  assert.equal(result.precision, 'month');
});

test('normalizeRelativeDate handles "N years ago"', () => {
  const result = normalizeRelativeDate('2 years ago', REF);
  assert.equal(result.year, 2024);
  assert.equal(result.precision, 'year');
});

test('normalizeRelativeDate handles "N weeks ago"', () => {
  const result = normalizeRelativeDate('3 weeks ago', REF);
  assert.equal(result.year, 2026);
  assert.equal(result.precision, 'week');
});

test('normalizeRelativeDate handles ISO dates', () => {
  const result = normalizeRelativeDate('2023-09-08', REF);
  assert.equal(result.year, 2023);
  assert.equal(result.precision, 'day');
});

test('normalizeRelativeDate handles "Month D, YYYY"', () => {
  assert.equal(normalizeRelativeDate('September 8, 2023', REF).year, 2023);
  assert.equal(normalizeRelativeDate('Sep 8, 2023', REF).year, 2023);
});

test('normalizeRelativeDate handles "Month YYYY"', () => {
  const result = normalizeRelativeDate('May 2025', REF);
  assert.equal(result.year, 2025);
  assert.equal(result.precision, 'month');
});

test('normalizeRelativeDate handles a bare 4-digit year', () => {
  assert.equal(normalizeRelativeDate('2019', REF).year, 2019);
});

test('normalizeRelativeDate returns null year for unparseable or empty text', () => {
  assert.equal(normalizeRelativeDate(null, REF).year, null);
  assert.equal(normalizeRelativeDate('', REF).year, null);
  assert.equal(normalizeRelativeDate('in stock', REF).year, null);
});

test('normalizeRelativeDate preserves the original raw text', () => {
  assert.equal(normalizeRelativeDate('2 years ago', REF).raw, '2 years ago');
});
