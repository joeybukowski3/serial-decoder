import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluateReplacement } from '../../lib/replacement-core/evaluate.js';
import { televisionProfile } from '../../lib/replacement-core/profiles/television.js';
import { refrigeratorProfile } from '../../lib/replacement-core/profiles/refrigerator.js';

const tv = JSON.parse(fs.readFileSync(new URL('../fixtures/replacement-core/television-cases.json', import.meta.url)));
const fridge = JSON.parse(fs.readFileSync(new URL('../fixtures/replacement-core/refrigerator-cases.json', import.meta.url)));

test('incomplete TV returns candidate, unknowns, and focused refinement guidance', () => {
  const result = evaluateReplacement({ ...tv.incomplete55, profile: televisionProfile });
  assert.ok(result.candidate);
  assert.equal(result.classification, 'UNCONFIRMED');
  assert.equal(result.confidence, 'LOW');
  assert.deepEqual(result.refinementSuggestions.map((item) => item.fieldKey).slice(0, 3), ['model', 'tier', 'physicalFit']);
  assert.ok(result.refinementSuggestions.length <= 5);
});

test('incomplete refrigerator asks for capacity and fit before minor features', () => {
  const result = evaluateReplacement({ ...fridge.incompleteSideBySide, profile: refrigeratorProfile });
  assert.ok(result.candidate);
  assert.deepEqual(result.refinementSuggestions.map((item) => item.fieldKey), ['totalCapacityCuFt', 'physicalFit', 'dispenser', 'finish', 'model']);
  assert.ok(!result.refinementSuggestions.some((item) => ['handleStyle', 'wifi'].includes(item.fieldKey)));
});

test('feedback-ready output retains IDs, input, candidate and policy versions', () => {
  const result = evaluateReplacement({ ...fridge.incompleteSideBySide, profile: refrigeratorProfile });
  assert.ok(result.resultId.includes(result.candidate.candidateId));
  assert.equal(result.input, 'LG side-by-side refrigerator');
  assert.equal(result.normalizedOriginal.id, 'fridge-original-incomplete');
  assert.equal(result.decision.candidateId, result.candidate.candidateId);
  assert.equal(result.profileVersion, refrigeratorProfile.profileVersion);
  assert.equal(result.scoringVersion, '1.0.0');
  assert.ok(result.decisionReasons.length);
});
