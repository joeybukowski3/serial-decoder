import test from 'node:test';
import assert from 'node:assert/strict';
import { rankCandidatesByModelLowerBound } from '../../lib/serial-refinement/response-mapping.js';

test('lower-bound ranking prefers the closest serial-valid year after model introduction', () => {
  const result = rankCandidatesByModelLowerBound([2011, 2023], 2009);

  assert.equal(result.status, 'ranked');
  assert.equal(result.preferredCandidateYear, 2011);
  assert.deepEqual(result.remainingCandidateYears, [2011, 2023]);
  assert.deepEqual(result.orderedCandidateYears, [2011, 2023]);
  assert.equal(result.distanceFromStart, 2);
  assert.equal(result.materialLeadYears, 12);
});

test('lower-bound ranking does not force a primary when candidates are similarly close', () => {
  assert.equal(rankCandidatesByModelLowerBound([2011, 2013], 2009), null);
});

test('lower-bound ranking is independent of candidate input order', () => {
  const forward = rankCandidatesByModelLowerBound([2011, 2023], 2009);
  const reversed = rankCandidatesByModelLowerBound([2023, 2011], 2009);

  assert.equal(reversed.preferredCandidateYear, forward.preferredCandidateYear);
  assert.deepEqual(reversed.remainingCandidateYears, forward.remainingCandidateYears);
});
