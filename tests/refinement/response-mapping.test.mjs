import test from 'node:test';
import assert from 'node:assert/strict';
import { rankCandidatesByModelLowerBound, lowerBoundRankingExplanation } from '../../lib/serial-refinement/response-mapping.js';

// Deterministic lifecycle-based ranking: the earliest serial-valid candidate
// at or after the model-era start year is always the Best Estimate. This is
// unconditional — no minimum lead over the next candidate, no distance cap,
// no evidence-strength requirement. Every other serial-valid candidate stays
// visible as an alternate (the array is never narrowed by this rule).

test('example 1: model era start 2009, candidates [2011, 2023] => best estimate 2011, alternate 2023', () => {
  const result = rankCandidatesByModelLowerBound([2011, 2023], 2009);

  assert.equal(result.status, 'ranked');
  assert.equal(result.preferredCandidateYear, 2011);
  assert.deepEqual(result.remainingCandidateYears, [2011, 2023]);
});

test('example 2: model era start 2002, candidates [2008, 2020] => best estimate 2008, alternate 2020', () => {
  const result = rankCandidatesByModelLowerBound([2008, 2020], 2002);

  assert.equal(result.status, 'ranked');
  assert.equal(result.preferredCandidateYear, 2008);
  assert.deepEqual(result.remainingCandidateYears, [2008, 2020]);
});

test('ranking is not blocked when candidates are close together (no minimum-lead gate)', () => {
  const result = rankCandidatesByModelLowerBound([2011, 2013], 2009);

  assert.equal(result.status, 'ranked');
  assert.equal(result.preferredCandidateYear, 2011);
  assert.deepEqual(result.remainingCandidateYears, [2011, 2013]);
});

test('ranking is not blocked when the best estimate is 5+ years after model introduction', () => {
  const result = rankCandidatesByModelLowerBound([2016, 2023], 2011);

  assert.equal(result.status, 'ranked');
  assert.equal(result.preferredCandidateYear, 2016);
  assert.deepEqual(result.remainingCandidateYears, [2016, 2023]);
});

test('no best estimate is invented when every candidate is before the model-era start', () => {
  assert.equal(rankCandidatesByModelLowerBound([1984, 1996], 2019), null);
});

test('a single candidate year is not eligible for ranking (nothing to rank against)', () => {
  assert.equal(rankCandidatesByModelLowerBound([2020], 2002), null);
});

test('an unusable (non-integer) model-era start never produces a ranking', () => {
  assert.equal(rankCandidatesByModelLowerBound([2008, 2020], null), null);
  assert.equal(rankCandidatesByModelLowerBound([2008, 2020], undefined), null);
});

test('ranking picks the earliest eligible year regardless of candidate input order', () => {
  const forward = rankCandidatesByModelLowerBound([2011, 2023], 2009);
  const reversed = rankCandidatesByModelLowerBound([2023, 2011], 2009);

  assert.equal(reversed.preferredCandidateYear, forward.preferredCandidateYear);
  assert.deepEqual(reversed.remainingCandidateYears, forward.remainingCandidateYears);
});

test('GE PSC26NSWC / DR420690 acceptance shape: candidates before the era start are hard-eliminated, not shown as alternates', () => {
  // Model era start ~2002; serial-valid candidates 1984, 1996, 2008, 2020.
  // A unit could not have been made before the model existed, so 1984 and
  // 1996 are eliminated. 2008 is the earliest remaining candidate (Best
  // Estimate); 2020 is the only Alternate.
  const result = rankCandidatesByModelLowerBound([1984, 1996, 2008, 2020], 2002);

  assert.equal(result.status, 'ranked');
  assert.equal(result.preferredCandidateYear, 2008);
  assert.deepEqual(result.remainingCandidateYears, [2008, 2020]);
});

test('a single candidate at or after the era start resolves outright, eliminating the rest', () => {
  const result = rankCandidatesByModelLowerBound([1984, 1996, 2008], 2002);

  assert.equal(result.status, 'resolved');
  assert.equal(result.chosenYear, 2008);
  assert.equal(result.preferredCandidateYear, null);
  assert.deepEqual(result.remainingCandidateYears, [2008]);
});

test('GE 12-year cycle resolves to 2024 at a strict 2013 production lower bound', () => {
  const result = rankCandidatesByModelLowerBound([1988, 2000, 2012, 2024], 2013);

  assert.equal(result.status, 'resolved');
  assert.equal(result.chosenYear, 2024);
  assert.equal(result.preferredCandidateYear, null);
  assert.deepEqual(result.remainingCandidateYears, [2024]);
});

test('lowerBoundRankingExplanation states the era start and why the estimate is earliest-after-start', () => {
  const explanation = lowerBoundRankingExplanation(2002, 2008);
  assert.match(explanation, /2002/);
  assert.match(explanation, /2008/);
  assert.match(explanation, /earliest serial-valid year/i);
});
