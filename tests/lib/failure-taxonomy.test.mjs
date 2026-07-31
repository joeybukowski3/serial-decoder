import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFailureEnvelope,
  classifyLookupFailure,
  isUsefulDegradedResult,
  normalizeFailureCategory,
} from '../../lib/lookup-failure-taxonomy.js';

test('normalizes known codes into taxonomy categories', () => {
  assert.equal(normalizeFailureCategory('REFINEMENT_TIMEOUT'), 'global_deadline');
  assert.equal(normalizeFailureCategory('GROUNDING_RATE_LIMIT'), 'search_rate_limited');
  assert.equal(normalizeFailureCategory('extraction_malformed'), 'extraction_malformed');
  assert.equal(normalizeFailureCategory('not-a-real-code'), null);
});

test('classifyLookupFailure prefers explicit category then code then stage', () => {
  assert.equal(classifyLookupFailure({
    failureCategory: 'search_timeout',
    errorCode: 'OTHER',
  }).failureCategory, 'search_timeout');
  assert.equal(classifyLookupFailure({
    errorCode: 'DETERMINISTIC_TIMEOUT',
  }).failureCategory, 'extraction_timeout');
  assert.equal(classifyLookupFailure({
    failureStage: 'rate_limit',
  }).failureCategory, 'search_rate_limited');
});

test('distinguishes useful degraded results from empty failures', () => {
  assert.equal(isUsefulDegradedResult({
    status: 'ranked',
    preferredCandidateYear: 2022,
    remainingCandidateYears: [1992, 2022],
  }), true);
  assert.equal(isUsefulDegradedResult({
    status: 'ambiguous_with_era',
    remainingCandidateYears: [2014, 2024],
    modelProductionRange: { start: 2019, end: null },
  }), true);
  assert.equal(isUsefulDegradedResult({
    status: 'unavailable',
    remainingCandidateYears: [1994, 2024],
    deterministicFallbackUsed: true,
  }), true);
  assert.equal(isUsefulDegradedResult({
    status: 'unavailable',
    remainingCandidateYears: [],
    deterministicFallbackUsed: false,
  }), false);
});

test('buildFailureEnvelope captures tier and fallback flags', () => {
  const envelope = buildFailureEnvelope({
    errorCode: 'REFINEMENT_TIMEOUT',
    failureStage: 'timeout',
    deterministicFallbackUsed: true,
  }, {
    status: 'ranked',
    refinementResultTier: 'ranked',
    remainingCandidateYears: [1992, 2022],
    preferredCandidateYear: 2022,
    deterministicFallbackUsed: true,
  });
  assert.equal(envelope.failureCategory, 'global_deadline');
  assert.equal(envelope.failureStage, 'timeout');
  assert.equal(envelope.failureCode, 'REFINEMENT_TIMEOUT');
  assert.equal(envelope.resultTierReturned, 'ranked');
  assert.equal(envelope.deterministicFallbackUsed, true);
  assert.equal(envelope.usefulContextPreserved, true);
});
