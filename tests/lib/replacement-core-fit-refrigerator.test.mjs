import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluateReplacement } from '../../lib/replacement-core/evaluate.js';
import { refrigeratorProfile } from '../../lib/replacement-core/profiles/refrigerator.js';
import { interpretReplacementSearch } from '../../lib/replacement-discovery/interpret.js';

const cases = JSON.parse(fs.readFileSync(new URL('../fixtures/replacement-core/refrigerator-cases.json', import.meta.url)));
const evaluate = (entry) => evaluateReplacement({ ...entry, profile: refrigeratorProfile });
const fact = (value, status = 'KNOWN', ref = 'test') => ({ status, value, evidenceRefs: [ref] });
const fitRow = (result) => result.decision.comparisons.find((row) => row.key === 'physicalFit');
const set = (target, facts) => { Object.assign(target, facts); return target; };

/** Complete freestanding French-door fixture with NO fit information on either side. */
function freestanding() {
  const entry = structuredClone(cases.complete25);
  entry.original.facts.physicalFit = { status: 'UNKNOWN', value: null, evidenceRefs: [] };
  delete entry.candidate.identity.facts.physicalFit;
  return entry;
}
/** Same, but a built-in installation on both sides. */
function builtIn() {
  const entry = freestanding();
  set(entry.original.facts, { installationType: fact('built-in') });
  set(entry.candidate.identity.facts, { installationType: fact('built-in') });
  return entry;
}
const candidate = (entry, facts) => set(entry.candidate.identity.facts, facts) && entry;
const original = (entry, facts) => set(entry.original.facts, facts) && entry;

test('A. freestanding, strong candidate, opening unknown: LKQ with reduced confidence, VERIFY_FIT and the candidate dimensions', () => {
  const entry = candidate(freestanding(), { widthIn: fact(35.75), heightIn: fact(69.9), depthIn: fact(33.5) });
  const result = evaluate(entry);
  assert.equal(result.classification, 'LKQ');
  assert.equal(result.confidence, 'MEDIUM');
  assert.equal(result.fitAssessment.status, 'ADVISORY');
  assert.equal(result.fitAssessment.advisory.reasonCode, 'VERIFY_FIT');
  assert.deepEqual(fitRow(result).dimensions, {
    original: { widthIn: null, heightIn: null, depthIn: null },
    replacement: { widthIn: 35.75, heightIn: 69.9, depthIn: 33.5 },
    replacementClearance: { clearanceWidthIn: null, clearanceHeightIn: null, clearanceDepthIn: null },
  });
  assert.equal(fitRow(result).assessment, 'UNVERIFIED');
  assert.equal(result.decision.eligible, true);
  const suggestion = result.refinementSuggestions.find((item) => item.fieldKey === 'physicalFit');
  assert.match(suggestion.prompt, /opening width, height and depth/);
});

test('A2. known original dimensions are retained as context but never assumed to mean the candidate fits', () => {
  const entry = original(candidate(freestanding(), { widthIn: fact(35.75) }), { widthIn: fact(35.5) });
  const result = evaluate(entry);
  assert.equal(result.fitAssessment.dimensions.original.widthIn, 35.5);
  assert.equal(result.fitAssessment.status, 'ADVISORY');
  assert.notEqual(fitRow(result).assessment, 'MATCH');
});

test('B. a known 36" opening that candidate plus required clearance exceeds is NOT_LKQ; one that clears it passes', () => {
  const tooWide = original(candidate(freestanding(), { widthIn: fact(35.75), clearanceWidthIn: fact(0.5) }), { openingWidthIn: fact(36, 'KNOWN', 'user-input') });
  const violated = evaluate(tooWide);
  assert.equal(violated.classification, 'NOT_LKQ');
  assert.ok(violated.decision.hardFailures.some((failure) => failure.key === 'physicalFit'));
  assert.deepEqual(violated.fitAssessment.constraints[0].detail, { available: 36, size: 35.75, required: 36.25 });
  const fits = original(candidate(freestanding(), { widthIn: fact(35.75), clearanceWidthIn: fact(0.25) }), { openingWidthIn: fact(36) });
  assert.equal(evaluate(fits).fitAssessment.status, 'VERIFIED');
  assert.equal(evaluate(fits).classification, 'LKQ');
  const heightViolation = original(candidate(freestanding(), { widthIn: fact(35.75), heightIn: fact(70.5) }), { openingWidthIn: fact(36), openingHeightIn: fact(70) });
  assert.equal(evaluate(heightViolation).classification, 'NOT_LKQ');
});

test('B2. a supplied opening the candidate cannot be measured against stays unverified, never a silent pass', () => {
  const entry = original(freestanding(), { openingWidthIn: fact(36) });
  assert.equal(evaluate(entry).fitAssessment.status, 'CONSTRAINT_UNVERIFIED');
  assert.equal(evaluate(entry).classification, 'UNCONFIRMED');
});

test('C. built-in with an unknown installation envelope: still returned, UNCONFIRMED, fit refinement first', () => {
  for (const variant of ['built-in', 'integrated']) {
    const entry = builtIn();
    original(entry, { installationType: fact(variant) });
    candidate(entry, { installationType: fact(variant), widthIn: fact(35.75) });
    const result = evaluate(entry);
    assert.ok(result.candidate, variant);
    assert.equal(result.classification, 'UNCONFIRMED', variant);
    assert.equal(result.fitAssessment.intrinsic, true);
    assert.equal(result.fitAssessment.status, 'CONSTRAINT_UNVERIFIED');
    assert.equal(fitRow(result).reasonCode, 'HARD_FIT_UNVERIFIED');
    assert.deepEqual([result.refinementSuggestions[0].fieldKey, result.refinementSuggestions[0].priority, result.refinementSuggestions[0].reasonCode], ['physicalFit', 1, 'VERIFY_FIT']);
    assert.equal(new Set(result.refinementSuggestions.map((item) => item.priority)).size, result.refinementSuggestions.length);
  }
  const column = freestanding();
  original(column, { configurationFloor: fact('column') });
  candidate(column, { configurationFloor: fact('column') });
  assert.equal(evaluate(column).fitAssessment.intrinsic, true);
  assert.equal(evaluate(column).classification, 'UNCONFIRMED');
});

test('C2. a built-in candidate with a known violation of the install class is still a hard failure', () => {
  const entry = builtIn();
  candidate(entry, { installationType: fact('freestanding') });
  assert.equal(evaluate(entry).classification, 'NOT_LKQ');
});

test('D. built-in with verified dimensions, clearances and panel requirement passes the fit rule', () => {
  const entry = builtIn();
  original(entry, { openingWidthIn: fact(36), openingHeightIn: fact(84), openingDepthIn: fact(26), panelReady: fact(true, 'KNOWN', 'user-input') });
  candidate(entry, { widthIn: fact(35.5), heightIn: fact(83), depthIn: fact(24.5), clearanceWidthIn: fact(0.25), clearanceHeightIn: fact(0.5), clearanceDepthIn: fact(1), panelReady: fact(true) });
  const result = evaluate(entry);
  assert.equal(result.fitAssessment.status, 'VERIFIED');
  assert.equal(fitRow(result).assessment, 'MATCH');
  assert.equal(result.classification, 'LKQ');
  assert.equal(result.confidence, 'HIGH');
  const noPanel = structuredClone(entry);
  candidate(noPanel, { panelReady: fact(false) });
  assert.equal(evaluate(noPanel).classification, 'NOT_LKQ');
  const panelUnknown = structuredClone(entry);
  delete panelUnknown.candidate.identity.facts.panelReady;
  assert.equal(evaluate(panelUnknown).fitAssessment.status, 'CONSTRAINT_UNVERIFIED');
  const deepViolation = structuredClone(entry);
  candidate(deepViolation, { depthIn: fact(25.5) });
  assert.equal(evaluate(deepViolation).classification, 'NOT_LKQ');
});

test('no fit policy relaxes capacity, installation type, configuration floor or tier', () => {
  const smaller = candidate(freestanding(), { totalCapacityCuFt: fact(24) });
  assert.equal(evaluate(smaller).classification, 'NOT_LKQ');
  const floor = candidate(freestanding(), { configurationFloor: fact('top-freezer') });
  assert.equal(evaluate(floor).classification, 'NOT_LKQ');
  const tier = candidate(freestanding(), { tier: fact('STANDARD') });
  assert.equal(evaluate(tier).classification, 'NOT_LKQ');
  const install = original(freestanding(), { installationType: fact('built-in') });
  assert.equal(evaluate(install).classification, 'NOT_LKQ');
});

test('refrigerator interpretation: an opening needs a cue word; panel-ready and column are intrinsic', () => {
  const facts = (query, notes = '') => interpretReplacementSearch({ query, notes }).normalizedOriginal.facts;
  assert.equal(facts('LG 36 inch wide side by side refrigerator').openingWidthIn, undefined);
  assert.equal(facts('LG side by side refrigerator', 'opening width 36 inches, height 70, depth 28').openingWidthIn.value, 36);
  assert.equal(facts('LG side by side refrigerator', 'opening width 36 inches, height 70, depth 28').openingDepthIn.value, 28);
  assert.equal(facts('LG refrigerator', 'panel-ready built-in').panelReady.value, true);
  assert.equal(facts('LG refrigerator', 'cabinet opening 1000 inches wide').openingWidthIn, undefined);
});
