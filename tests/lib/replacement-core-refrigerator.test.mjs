import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluateReplacement } from '../../lib/replacement-core/evaluate.js';
import { refrigeratorProfile } from '../../lib/replacement-core/profiles/refrigerator.js';

const cases = JSON.parse(fs.readFileSync(new URL('../fixtures/replacement-core/refrigerator-cases.json', import.meta.url)));
const clone = () => structuredClone(cases.complete25);
const evaluate = (entry) => evaluateReplacement({ ...entry, profile: refrigeratorProfile });
const replace = (entry, key, value, status = 'KNOWN') => { entry.candidate.identity.facts[key] = { status, value, evidenceRefs: ['candidate-sheet'] }; };
const original = (entry, key, value, status = 'KNOWN') => { entry.original.facts[key] = { status, value, evidenceRefs: ['label'] }; };
const row = (result, key) => result.decision.comparisons.find((comparison) => comparison.key === key);

test('complete 25 cu ft French-door fixture is LKQ with HIGH confidence', () => {
  const result = evaluate(cases.complete25);
  assert.equal(result.classification, 'LKQ');
  assert.equal(result.confidence, 'HIGH');
  assert.equal(row(result, 'totalCapacityCuFt').assessment, 'MATCH');
  assert.equal(row(result, 'configurationFloor').assessment, 'MATCH');
});

test('25 to 27 passes capacity; 25 to 24 fails without percentage tolerance', () => {
  const larger = clone();
  replace(larger, 'totalCapacityCuFt', 27);
  assert.equal(row(evaluate(larger), 'totalCapacityCuFt').assessment, 'BETTER');
  assert.notEqual(evaluate(larger).classification, 'NOT_LKQ');
  const smaller = clone();
  replace(smaller, 'totalCapacityCuFt', 24);
  assert.equal(evaluate(smaller).classification, 'NOT_LKQ');
  assert.ok(evaluate(smaller).decision.hardFailures.some((failure) => failure.key === 'totalCapacityCuFt'));
});

test('built-in to freestanding and known physical fit violation are hard failures', () => {
  const builtIn = clone();
  original(builtIn, 'installationType', 'built-in');
  assert.equal(evaluate(builtIn).classification, 'NOT_LKQ');
  const tooWide = clone();
  replace(tooWide, 'physicalFit', false);
  assert.equal(evaluate(tooWide).classification, 'NOT_LKQ');
});

test('unknown opening on a freestanding refrigerator is an advisory, not a block: LKQ with reduced confidence', () => {
  const entry = clone();
  original(entry, 'physicalFit', null, 'UNKNOWN');
  const result = evaluate(entry);
  assert.equal(result.classification, 'LKQ');
  assert.equal(result.confidence, 'MEDIUM');
  const fit = row(result, 'physicalFit');
  assert.deepEqual([fit.assessment, fit.reasonCode, fit.advisory], ['UNVERIFIED', 'VERIFY_FIT', true]);
  assert.equal(result.fitAssessment.status, 'ADVISORY');
  assert.equal(result.fitAssessment.advisory.message, 'Not verified — confirm available space before purchase');
  assert.equal(result.decision.eligible, true);
});

test('French-door to basic top-freezer fails functional floor, not literal door count', () => {
  const mismatch = clone();
  replace(mismatch, 'configurationFloor', 'top-freezer');
  assert.equal(evaluate(mismatch).classification, 'NOT_LKQ');
  const similar = clone();
  replace(similar, 'layout', 'four-door-french');
  const result = evaluate(similar);
  assert.equal(row(result, 'configurationFloor').assessment, 'MATCH');
  assert.equal(row(result, 'layout').assessment, 'DIFFERENT');
  assert.equal(result.classification, 'CLOSE_MATCH');
});

test('dispenser difference changes strong similarity; handle difference alone does not reject', () => {
  const dispenser = clone();
  replace(dispenser, 'dispenser', 'internal-water');
  assert.equal(row(evaluate(dispenser), 'dispenser').assessment, 'DIFFERENT');
  assert.equal(evaluate(dispenser).classification, 'CLOSE_MATCH');
  const handle = clone();
  original(handle, 'handleStyle', 'bar');
  replace(handle, 'handleStyle', 'pocket');
  assert.equal(evaluate(handle).classification, 'LKQ');
});

test('unknown capacity, finish, and dispenser keep baseline candidate and lower confidence', () => {
  const result = evaluate(cases.incompleteSideBySide);
  assert.equal(result.input, 'LG side-by-side refrigerator');
  assert.equal(result.candidate.candidateId, 'fridge-baseline-side-by-side');
  assert.equal(result.classification, 'UNCONFIRMED');
  assert.equal(result.confidence, 'LOW');
  assert.equal(row(result, 'totalCapacityCuFt').assessment, 'UNVERIFIED');
  assert.equal(row(result, 'finish').assessment, 'UNVERIFIED');
  assert.equal(row(result, 'dispenser').assessment, 'UNVERIFIED');
  assert.equal(result.normalizedOriginal.facts.tier.status, 'ASSUMED');
  assert.deepEqual(result.refinementSuggestions.map((item) => item.fieldKey), ['totalCapacityCuFt', 'physicalFit', 'dispenser', 'finish', 'model']);
});

test('ambiguous original hard capacity remains unconfirmed, never silently matched', () => {
  const entry = clone();
  entry.original.facts.totalCapacityCuFt = { status: 'AMBIGUOUS', value: null, alternatives: [24, 25], evidenceRefs: ['two-sources'] };
  const result = evaluate(entry);
  assert.equal(result.classification, 'UNCONFIRMED');
  assert.equal(row(result, 'totalCapacityCuFt').assessment, 'UNVERIFIED');
});

test('documented hinge requirement can promote a secondary specification', () => {
  const entry = clone();
  replace(entry, 'handleStyle', 'pocket');
  const result = evaluateReplacement({ ...entry, profile: refrigeratorProfile, requirements: [{ key: 'handleStyle', hardRule: 'MATCH', requiredValue: 'bar', evidenceRefs: ['clearance-measurement'] }] });
  assert.equal(result.classification, 'NOT_LKQ');
});
