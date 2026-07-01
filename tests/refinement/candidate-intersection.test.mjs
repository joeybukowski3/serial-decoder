import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCandidateYears,
  parseYearRange,
  intersectCandidateYears,
  resolveCandidateIntersection,
} from '../../lib/serial-refinement/candidate-intersection.js';

test('candidate parsing sorts and deduplicates years', () => {
  assert.deepEqual(parseCandidateYears('2024 / 1994 / 2024'), [1994, 2024]);
});

test('closed and open ranges parse without midpoint calculation', () => {
  assert.deepEqual(parseYearRange('2013-2016'), { start: 2013, end: 2016 });
  assert.deepEqual(parseYearRange('2012-Present', { currentYear: 2026 }), { start: 2012, end: 2026 });
  assert.deepEqual(parseYearRange('since 2020'), { start: 2020, end: null });
});

test('intersection resolves only when exactly one serial-valid year remains', () => {
  const decision = resolveCandidateIntersection({
    candidateYears: [2004, 2014, 2024],
    evidenceRange: { start: 2013, end: 2016 },
    evidenceAvailable: true,
    evidenceSufficient: true,
  });
  assert.equal(decision.status, 'resolved');
  assert.equal(decision.chosenYear, 2014);
});

test('multiple intersecting candidates remain ambiguous', () => {
  const decision = resolveCandidateIntersection({
    candidateYears: [2004, 2014, 2024],
    evidenceRange: { start: 2000, end: 2020 },
    evidenceAvailable: true,
    evidenceSufficient: true,
  });
  assert.equal(decision.status, 'ambiguous');
  assert.equal(decision.chosenYear, null);
  assert.deepEqual(decision.remainingCandidateYears, [2004, 2014]);
});

test('zero-candidate intersection is a conflict and never chooses nearest', () => {
  const decision = resolveCandidateIntersection({
    candidateYears: [2017, 2019],
    evidenceRange: { start: 2008, end: 2008 },
    evidenceAvailable: true,
    evidenceSufficient: true,
  });
  assert.equal(decision.status, 'conflict');
  assert.equal(decision.chosenYear, null);
  assert.deepEqual(decision.remainingCandidateYears, []);
});

test('insufficient evidence preserves original candidates', () => {
  const decision = resolveCandidateIntersection({
    candidateYears: [1994, 2024],
    evidenceRange: { start: 2023, end: 2025 },
    evidenceAvailable: true,
    evidenceSufficient: false,
  });
  assert.equal(decision.status, 'unavailable');
  assert.deepEqual(decision.remainingCandidateYears, [1994, 2024]);
});

test('future years are retained unless evidence actually excludes them', () => {
  assert.deepEqual(intersectCandidateYears([2027, 1997], { start: 1990, end: null }), [1997, 2027]);
});
