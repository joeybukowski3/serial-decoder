import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModelInput, validateTranscriptionAlternatives } from '../../lib/serial-refinement/normalize-model.js';

test('normalization preserves meaningful suffixes while adding structural variants', () => {
  const result = normalizeModelInput('  mpga2ll/a  ');
  assert.equal(result.canonical, 'MPGA2LL/A');
  assert.ok(result.structuralVariants.includes('MPGA2LLA'));
  assert.ok(result.transformations.includes('trimmed-whitespace'));
  assert.ok(result.transformations.includes('uppercased'));
});

test('normalization preserves region and revision separators', () => {
  const result = normalizeModelInput('QN65S90D-AFXZA/REV2');
  assert.equal(result.canonical, 'QN65S90D-AFXZA/REV2');
  assert.ok(result.structuralVariants.includes('QN65S90DAFXZAREV2'));
});

test('O to zero is offered but not silently applied', () => {
  const result = normalizeModelInput('FFTR2045VSO');
  assert.equal(result.canonical, 'FFTR2045VSO');
  assert.equal(result.compact, 'FFTR2045VSO');
  const alternative = result.possibleTranscriptionAlternatives.find((item) => item.value === 'FFTR2045VS0');
  assert.ok(alternative);
  assert.equal(alternative.validated, false);
});

test('transcription alternative becomes validated only against known structured records', () => {
  const normalized = normalizeModelInput('FFTR2045VSO');
  const validated = validateTranscriptionAlternatives(normalized, ['FFTR2045VS0']);
  const alternative = validated.possibleTranscriptionAlternatives.find((item) => item.value === 'FFTR2045VS0');
  assert.equal(alternative.validated, true);
});

test('I and L to one remain disclosed alternatives', () => {
  const result = normalizeModelInput('AB1I2L3');
  assert.ok(result.possibleTranscriptionAlternatives.some((item) => item.change === 'I→1'));
  assert.ok(result.possibleTranscriptionAlternatives.some((item) => item.change === 'L→1'));
  assert.equal(result.canonical, 'AB1I2L3');
});
