import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateFact, validateIdentity, validateCandidate, validateEvidence, validateDecision, validateRecommendationResult } from '../../lib/replacement-core/contracts.js';
import { evaluateReplacement } from '../../lib/replacement-core/evaluate.js';
import { televisionProfile } from '../../lib/replacement-core/profiles/television.js';

const cases = JSON.parse(fs.readFileSync(new URL('../fixtures/replacement-core/contract-cases.json', import.meta.url)));
const tv = JSON.parse(fs.readFileSync(new URL('../fixtures/replacement-core/television-cases.json', import.meta.url)));

test('fact status preserves known, unknown, ambiguous, inferred, and assumed values', () => {
  assert.deepEqual(validateFact(cases.validFact), []);
  assert.deepEqual(validateFact(cases.unknownFact), []);
  assert.deepEqual(validateFact(cases.ambiguousFact), []);
  assert.ok(validateFact(cases.invalidFact).length);
  assert.deepEqual(validateFact({ status: 'INFERRED', value: '4K', evidenceRefs: ['context'] }), []);
  assert.deepEqual(validateFact({ status: 'ASSUMED', value: 'PREMIUM', evidenceRefs: [] }), []);
  assert.ok(validateFact({ status: 'UNKNOWN', value: '4K', evidenceRefs: [] }).length);
});

test('identity, candidate, decision, and recommendation contracts validate fixture output', () => {
  assert.deepEqual(validateIdentity(tv.complete65.original), []);
  assert.deepEqual(validateCandidate(tv.complete65.candidate), []);
  const result = evaluateReplacement({ ...tv.complete65, profile: televisionProfile });
  assert.deepEqual(validateDecision(result.decision), []);
  assert.deepEqual(validateRecommendationResult(result), []);
  assert.equal(result.contractVersion, '1.0.0');
  assert.equal(result.profileVersion, '1.0.0');
  assert.equal(result.scoringVersion, '1.0.0');
  assert.equal(result.resultId.includes(tv.complete65.candidate.candidateId), true);
  assert.equal(result.input, tv.complete65.original.rawQuery);
});

test('invalid version, missing category, and unresolved value are rejected', () => {
  const invalid = structuredClone(tv.complete65.original);
  invalid.contractVersion = '0.0.0';
  invalid.category = '';
  invalid.facts.screenSizeIn = { status: 'UNKNOWN', value: 65, evidenceRefs: [] };
  assert.equal(validateIdentity(invalid).length, 3);
  assert.throws(() => evaluateReplacement({ original: invalid, candidate: tv.complete65.candidate, profile: televisionProfile }), /original/);
});

test('evidence contract requires a source, claim, and supported role', () => {
  const evidence = {
    contractVersion: '1.0.0', evidenceId: 'spec-1', sourceType: 'SPEC_SHEET', sourceName: 'Manufacturer specification',
    url: 'https://example.com/spec', sourceClass: 'MANUFACTURER', observedAt: '2026-09-30T12:00:00Z',
    claim: { subjectId: 'tv-original-65', fieldKey: 'resolution', normalizedValue: '4K', conciseClaim: '4K resolution' },
    confidence: 'HIGH', firstParty: true, supports: ['SPECIFICATION'],
  };
  assert.deepEqual(validateEvidence(evidence), []);
  assert.ok(validateEvidence({ ...evidence, url: 'http://example.com/spec' }).includes('invalid evidence URL'));
});
