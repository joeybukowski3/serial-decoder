import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluateReplacement } from '../../lib/replacement-core/evaluate.js';
import { televisionProfile } from '../../lib/replacement-core/profiles/television.js';

const cases = JSON.parse(fs.readFileSync(new URL('../fixtures/replacement-core/television-cases.json', import.meta.url)));
const evaluate = (entry) => evaluateReplacement({ ...entry, profile: televisionProfile });

test('HIGH, MEDIUM, and LOW confidence are independent of LKQ label', () => {
  const high = evaluate(cases.complete65);
  assert.equal(high.confidence, 'HIGH');
  const mediumCase = structuredClone(cases.complete65);
  mediumCase.original.facts.refreshHz = { status: 'UNKNOWN', value: null, evidenceRefs: [] };
  const medium = evaluate(mediumCase);
  assert.equal(medium.confidence, 'MEDIUM');
  assert.equal(medium.classification, 'LKQ');
  const low = evaluate(cases.incomplete55);
  assert.equal(low.confidence, 'LOW');
  assert.equal(low.classification, 'UNCONFIRMED');
});

test('known hard failure remains NOT_LKQ even when other evidence is sparse', () => {
  const entry = structuredClone(cases.incomplete55);
  entry.candidate.identity.facts.screenSizeIn.value = 43;
  const result = evaluate(entry);
  assert.equal(result.confidence, 'LOW');
  assert.equal(result.classification, 'NOT_LKQ');
});

test('result shows KNOWN, INFERRED, ASSUMED, and UNKNOWN facts separately', () => {
  const result = evaluate(cases.incomplete55);
  assert.ok(result.knownFacts.some((item) => item.key === 'screenSizeIn'));
  assert.ok(result.inferredFacts.some((item) => item.key === 'resolution'));
  assert.ok(result.assumptions.some((item) => item.key === 'tier' && item.basis === 'BRAND_CATEGORY_BASELINE'));
  assert.ok(result.unknownImportantFacts.some((item) => item.key === 'refreshHz'));
});

test('comparison assessment vocabulary is reachable and auditable', () => {
  const entry = structuredClone(cases.complete65);
  entry.candidate.identity.facts.screenSizeIn.value = 75;
  entry.candidate.identity.facts.hdmiCount.value = 3;
  entry.original.facts.refreshHz = { status: 'UNKNOWN', value: null, evidenceRefs: [] };
  entry.original.facts.tier = { status: 'ASSUMED', value: 'PREMIUM', evidenceRefs: [], basis: 'BRAND_CATEGORY_BASELINE' };
  entry.original.facts.smart = { status: 'UNKNOWN', value: null, evidenceRefs: [] };
  entry.candidate.identity.facts.smart = { status: 'UNKNOWN', value: null, evidenceRefs: [] };
  const assessments = new Set(evaluate(entry).decision.comparisons.map((row) => row.assessment));
  for (const expected of ['MATCH', 'BETTER', 'DIFFERENT', 'UNKNOWN', 'ASSUMED', 'UNVERIFIED']) assert.ok(assessments.has(expected), expected);
  entry.candidate.identity.facts.screenSizeIn.value = 55;
  assert.ok(evaluate(entry).decision.comparisons.some((row) => row.assessment === 'FAIL'));
});
