import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluateReplacement } from '../../lib/replacement-core/evaluate.js';
import { televisionProfile } from '../../lib/replacement-core/profiles/television.js';
import { interpretReplacementSearch } from '../../lib/replacement-discovery/interpret.js';

const cases = JSON.parse(fs.readFileSync(new URL('../fixtures/replacement-core/television-cases.json', import.meta.url)));
const evaluate = (entry) => evaluateReplacement({ ...entry, profile: televisionProfile });
const fact = (value, status = 'KNOWN', ref = 'test') => ({ status, value, evidenceRefs: [ref] });
const fitRow = (result) => result.decision.comparisons.find((row) => row.key === 'physicalFit');

/** The 65-inch complete fixture with NO fit information on either side. */
function noFitInfo() {
  const entry = structuredClone(cases.complete65);
  entry.original.facts.physicalFit = { status: 'UNKNOWN', value: null, evidenceRefs: [] };
  delete entry.candidate.identity.facts.physicalFit;
  return entry;
}
const withOriginal = (entry, facts) => { Object.assign(entry.original.facts, facts); return entry; };
const withCandidate = (entry, facts) => { Object.assign(entry.candidate.identity.facts, facts); return entry; };

test('A. 65" original, 65" valid replacement, no installation constraint: the fit advisory does not prevent LKQ', () => {
  const result = evaluate(noFitInfo());
  assert.equal(result.classification, 'LKQ');
  assert.equal(result.decision.eligible, true);
  assert.equal(result.fitAssessment.status, 'ADVISORY');
  assert.equal(fitRow(result).reasonCode, 'VERIFY_FIT');
  assert.equal(result.fitAssessment.advisory.severity, 'MILD');
  assert.equal(result.fitAssessment.advisory.message, 'Not verified — confirm available space before purchase');
  assert.equal(result.confidence, 'HIGH');
  assert.ok(!result.decision.reasonCodes.includes('HARD_COMPARISON_UNVERIFIED'));
});

test('B. 75" candidate for a 65" original with no known space constraint stays eligible as Above LKQ with a meaningful advisory', () => {
  const entry = withCandidate(noFitInfo(), { screenSizeIn: fact(75) });
  const result = evaluate(entry);
  assert.equal(result.classification, 'ABOVE_LKQ');
  assert.equal(result.decision.eligible, true);
  assert.ok(result.decision.materialUpgrades.includes('MATERIAL_SCREEN_SIZE_UPGRADE'));
  assert.deepEqual([result.fitAssessment.status, result.fitAssessment.advisory.severity], ['ADVISORY', 'MEANINGFUL']);
  assert.equal(result.confidence, 'MEDIUM');
});

test('C. a supplied maximum width that the candidate exceeds is a known violation: NOT_LKQ', () => {
  const entry = withOriginal(noFitInfo(), { openingWidthIn: fact(58, 'KNOWN', 'user-input') });
  withCandidate(entry, { widthIn: fact(72.6), heightIn: fact(41.6) });
  const result = evaluate(entry);
  assert.equal(result.classification, 'NOT_LKQ');
  assert.ok(result.decision.hardFailures.some((failure) => failure.key === 'physicalFit' && failure.reasonCode === 'HARD_FIT_VIOLATION'));
  assert.equal(result.fitAssessment.status, 'VIOLATION');
  assert.deepEqual(result.fitAssessment.dimensions.replacement, { widthIn: 72.6, heightIn: 41.6, depthIn: null });
});

test('C2. a supplied maximum that the candidate satisfies passes the HARD fit rule and can reach LKQ with HIGH confidence', () => {
  const entry = withOriginal(noFitInfo(), { openingWidthIn: fact(75), openingHeightIn: fact(45) });
  withCandidate(entry, { widthIn: fact(72.6), heightIn: fact(41.6) });
  const result = evaluate(entry);
  assert.equal(result.fitAssessment.status, 'VERIFIED');
  assert.equal(fitRow(result).assessment, 'MATCH');
  assert.equal(result.classification, 'LKQ');
  assert.equal(result.confidence, 'HIGH');
});

test('C3. a known space constraint the candidate cannot be checked against is UNVERIFIED (blocking), not an advisory', () => {
  const entry = withOriginal(noFitInfo(), { openingWidthIn: fact(58) });
  const result = evaluate(entry);
  assert.equal(result.fitAssessment.status, 'CONSTRAINT_UNVERIFIED');
  assert.equal(result.classification, 'UNCONFIRMED');
  assert.ok(result.decision.reasonCodes.includes('HARD_COMPARISON_UNVERIFIED'));
});

test('D. required mount reuse with an established incompatibility is NOT_LKQ', () => {
  const entry = withOriginal(noFitInfo(), { mountReuseRequired: fact(true, 'KNOWN', 'user-input'), mountPattern: fact('400x400') });
  withCandidate(entry, { mountPattern: fact('600x400') });
  const result = evaluate(entry);
  assert.equal(result.classification, 'NOT_LKQ');
  assert.ok(result.decision.hardFailures.some((failure) => failure.key === 'physicalFit'));
  const compatible = withCandidate(entry, { mountPattern: fact('400 x 400') });
  assert.equal(evaluate(compatible).fitAssessment.status, 'VERIFIED');
  assert.equal(evaluate(compatible).classification, 'LKQ');
});

test('D2. required mount reuse without a known candidate pattern cannot be verified', () => {
  const entry = withOriginal(noFitInfo(), { mountReuseRequired: fact(true, 'KNOWN', 'user-input'), mountPattern: fact('400x400') });
  assert.equal(evaluate(entry).fitAssessment.status, 'CONSTRAINT_UNVERIFIED');
});

test('E. without a mount-reuse requirement a VESA mismatch alone never rejects an otherwise valid candidate', () => {
  const entry = withOriginal(noFitInfo(), { mountPattern: fact('400x400') });
  withCandidate(entry, { mountPattern: fact('600x400') });
  const result = evaluate(entry);
  assert.equal(result.classification, 'LKQ');
  assert.equal(result.decision.hardFailures.length, 0);
  assert.equal(result.fitAssessment.status, 'ADVISORY');
  const stated = withOriginal(noFitInfo(), { mountReuseRequired: fact(false, 'KNOWN', 'user-input'), mountPattern: fact('400x400') });
  withCandidate(stated, { mountPattern: fact('600x400') });
  assert.equal(evaluate(stated).classification, 'LKQ');
});

test('a candidate explicitly known NOT to fit is a violation even when the original documented nothing', () => {
  const entry = withCandidate(noFitInfo(), { physicalFit: fact(false, 'KNOWN', 'site-measurement') });
  assert.equal(evaluate(entry).classification, 'NOT_LKQ');
});

test('documented fit (physicalFit: yes) still requires a verified candidate fit, or a passing envelope', () => {
  const documented = withOriginal(noFitInfo(), { physicalFit: fact(true, 'KNOWN', 'site-measurement') });
  assert.equal(evaluate(documented).fitAssessment.status, 'CONSTRAINT_UNVERIFIED');
  assert.equal(evaluate(withCandidate(structuredClone(documented), { physicalFit: fact(true, 'KNOWN', 'site-measurement') })).fitAssessment.status, 'VERIFIED');
  const partial = withOriginal(structuredClone(documented), { openingWidthIn: fact(75) });
  withCandidate(partial, { widthIn: fact(72.6) });
  assert.equal(evaluate(partial).fitAssessment.status, 'CONSTRAINT_UNVERIFIED', 'one verified axis cannot satisfy a documented fit');
  const byEnvelope = withOriginal(structuredClone(documented), { openingWidthIn: fact(75), openingHeightIn: fact(45), openingDepthIn: fact(4) });
  withCandidate(byEnvelope, { widthIn: fact(72.6), heightIn: fact(41.6), depthIn: fact(2.5) });
  assert.equal(evaluate(byEnvelope).fitAssessment.status, 'VERIFIED');
});

test('no known fit problem never weakens the other HARD rules', () => {
  const small = withCandidate(noFitInfo(), { screenSizeIn: fact(55) });
  assert.equal(evaluate(small).classification, 'NOT_LKQ');
  const lowerTier = withCandidate(noFitInfo(), { tier: fact('STANDARD') });
  assert.equal(evaluate(lowerTier).classification, 'NOT_LKQ');
  const lowRes = withCandidate(noFitInfo(), { resolution: fact('1080p') });
  assert.equal(evaluate(lowRes).classification, 'NOT_LKQ');
});

test('a broad query with sparse evidence remains UNCONFIRMED / LOW for its own reasons, not for fit', () => {
  const result = evaluate(cases.incomplete55);
  assert.equal(result.classification, 'UNCONFIRMED');
  assert.equal(result.confidence, 'LOW');
  assert.equal(result.fitAssessment.status, 'ADVISORY');
  assert.ok(!result.decision.reasonCodes.includes('HARD_FIT_UNVERIFIED'));
});

test('interpreter reads fit constraints only when the user states them', () => {
  const facts = (query, notes = '') => interpretReplacementSearch({ query, notes }).normalizedOriginal.facts;
  assert.equal(facts('65 Samsung QLED TV').openingWidthIn, undefined);
  assert.deepEqual([facts('65 Samsung QLED TV', 'must fit a 58 inch wide cabinet').openingWidthIn.value, facts('65 Samsung QLED TV', 'must fit a 58 inch wide cabinet').openingWidthIn.status], [58, 'KNOWN']);
  assert.equal(facts('65 Samsung QLED TV', 'maximum width: 58 inches; max height 35').openingHeightIn.value, 35);
  assert.equal(facts('65 Samsung QLED TV, 57 inch wide').openingWidthIn, undefined);
  assert.deepEqual(facts('65 Samsung QLED TV', 'cabinet opening 58 inches wide, cabinet opening 60 inches wide').openingWidthIn.alternatives, [58, 60]);
  assert.equal(facts('65 Samsung QLED TV', 'must reuse existing wall mount, VESA 400x400').mountReuseRequired.value, true);
  assert.equal(facts('65 Samsung QLED TV', 'must reuse existing wall mount, VESA 400x400').mountPattern.value, '400x400');
  assert.equal(facts('65 Samsung QLED TV', 'VESA 400x400').mountReuseRequired, undefined);
});
