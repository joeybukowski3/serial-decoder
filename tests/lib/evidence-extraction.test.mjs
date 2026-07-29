import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceExtractionPrompt, normalizeExtractedEvidence } from '../../lib/serial-refinement/deterministic/evidence-extraction.js';

test('buildEvidenceExtractionPrompt has no candidateYears parameter and never leaks a candidate-year list', () => {
  assert.equal(buildEvidenceExtractionPrompt.length, 1, 'function should take a single options object with no candidateYears field consumed');
  const prompt = buildEvidenceExtractionPrompt({
    brand: 'GE',
    model: 'GNE27JYMFS',
    category: 'refrigerator',
    currentYear: 2026,
    // Intentionally pass candidateYears to prove it is ignored even if a caller mistakenly includes it.
    candidateYears: [2006, 2016, 2026],
    evidenceItems: [{ index: 0, strategy: 'baseline', title: 'T', snippet: 'S', domain: 'geappliances.com', rawDate: '2 years ago', normalizedDateYear: 2024, normalizedDatePrecision: 'year' }],
  });
  assert.ok(!prompt.includes('2006, 2016, 2026'), 'prompt must never render a candidate-year list');
  assert.ok(prompt.includes('2024'), 'prompt should still surface the deterministically-computed reference year');
});

test('normalizeExtractedEvidence drops out-of-range resultIndex entries', () => {
  const normalized = normalizeExtractedEvidence({
    extractedEvidence: [
      { resultIndex: 0, exactModelMatch: true, sourceType: 'youtube', dateMeaning: 'review_published', claimText: 'ok' },
      { resultIndex: 5, exactModelMatch: true, sourceType: 'youtube', dateMeaning: 'review_published', claimText: 'out of range' },
    ],
  }, 2);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].resultIndex, 0);
});

test('normalizeExtractedEvidence defaults invalid enum values to safe fallbacks', () => {
  const normalized = normalizeExtractedEvidence({
    extractedEvidence: [
      { resultIndex: 0, sourceType: 'not-a-real-type', dateMeaning: 'not-a-real-meaning' },
    ],
  }, 1);
  assert.equal(normalized[0].sourceType, 'other');
  assert.equal(normalized[0].dateMeaning, 'unknown');
  assert.equal(normalized[0].exactModelMatch, false);
});

test('normalizeExtractedEvidence ignores non-array input', () => {
  assert.deepEqual(normalizeExtractedEvidence({}, 5), []);
  assert.deepEqual(normalizeExtractedEvidence(null, 5), []);
});
