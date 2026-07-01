import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { findLocalRefinementEvidence } from '../../lib/serial-refinement/local-evidence.js';
import { evaluateEvidencePolicy } from '../../lib/serial-refinement/evidence-policy.js';
import { resolveCandidateIntersection } from '../../lib/serial-refinement/candidate-intersection.js';

const fixtureUrl = new URL('../fixtures/serial-refinement-cases.json', import.meta.url);
const fixtures = JSON.parse(await readFile(fixtureUrl, 'utf8'));

for (const fixture of fixtures.cases.filter((item) => item.refinementExpected !== false)) {
  test(`fixture ${fixture.id} resolves only through evidence intersection`, async () => {
    const local = await findLocalRefinementEvidence({ brand: fixture.brand, model: fixture.model });
    const policy = evaluateEvidencePolicy(local.evidence);
    const decision = resolveCandidateIntersection({
      candidateYears: fixture.candidateYears,
      evidenceRange: policy.range,
      evidenceAvailable: local.evidence.length > 0,
      evidenceSufficient: policy.sufficient,
    });
    assert.equal(decision.status, fixture.expectedStatus || 'resolved');
    assert.equal(decision.chosenYear, fixture.expectedYear ?? null);
    if (fixture.validatedAlternative) {
      assert.equal(local.normalization.usedValidatedAlternative, true);
      assert.equal(local.normalization.validatedAlternative.value, fixture.validatedAlternative);
    }
  });
}
