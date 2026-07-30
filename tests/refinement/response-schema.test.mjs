import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertRefinementResponseInvariant,
  createRefinementResponse,
} from '../../lib/serial-refinement/response-schema.js';

test('resolved year must belong to the original serial candidate list', () => {
  const response = createRefinementResponse({
    status: 'resolved',
    candidateYears: [1978, 1990, 2002, 2014, 2026],
    remainingCandidateYears: [2023],
    chosenYear: 2023,
  });

  assert.equal(response.chosenYear, null);
  assert.deepEqual(response.remainingCandidateYears, []);
  assert.throws(
    () => assertRefinementResponseInvariant(response),
    /Resolved response requires chosenYear/,
  );
});

test('assertion rejects a selected year outside serial candidates', () => {
  assert.throws(
    () => assertRefinementResponseInvariant({
      status: 'resolved',
      candidateYears: [1978, 1990, 2002, 2014, 2026],
      remainingCandidateYears: [2023],
      chosenYear: 2023,
    }),
    /remainingCandidateYears must be a subset/,
  );
});
