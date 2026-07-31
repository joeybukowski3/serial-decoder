import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSharedModelIdentity,
  isCanonicalTranscriptionEquivalent,
} from '../../lib/model-evidence/shared-model-identity.js';
import { prioritizeSearchAlternatives, normalizeModelInput } from '../../lib/serial-refinement/normalize-model.js';

test('O/0 equivalence maps WED4850HWO and WED4850HW0 to the same search set', () => {
  const entered = buildSharedModelIdentity({
    brand: 'Whirlpool',
    model: 'WED4850HWO',
    category: 'appliances',
  });
  const canonical = buildSharedModelIdentity({
    brand: 'Whirlpool',
    model: 'WED4850HW0',
    category: 'appliances',
  });

  assert.equal(entered.enteredModel, 'WED4850HWO');
  assert.equal(entered.canonicalModel, 'WED4850HW0');
  assert.ok(entered.searchModels.includes('WED4850HWO'));
  assert.ok(entered.searchModels.includes('WED4850HW0'));
  assert.equal(entered.searchModels.length, 2);
  assert.equal(entered.equivalenceReason, 'terminal-o-zero-transcription');
  assert.equal(entered.normalizationApplied, true);

  assert.equal(canonical.enteredModel, 'WED4850HW0');
  assert.ok(canonical.searchModels.includes('WED4850HW0'));
  assert.equal(canonical.searchCategory, 'dryer');
  assert.equal(entered.searchCategory, 'dryer');
});

test('I/1 safe ambiguity is offered and bounded', () => {
  const identity = buildSharedModelIdentity({
    brand: 'Test',
    model: 'ABC1I2345',
    category: 'appliances',
  });
  assert.ok(identity.searchModels.length <= 2);
  assert.ok(identity.searchModels.includes('ABC1I2345'));
  assert.ok(
    identity.possibleTranscriptionAlternatives.some((item) => item.value === 'ABC112345'),
  );
});

test('does not invent combinatorial alternatives or rewrite unrelated models', () => {
  const identity = buildSharedModelIdentity({
    brand: 'Whirlpool',
    model: 'COMPLETELYDIFFERENT',
    category: 'appliances',
  });
  assert.equal(identity.enteredModel, 'COMPLETELYDIFFERENT');
  assert.equal(identity.searchModels.length, 1);
  assert.equal(identity.normalizationApplied, false);

  const normalized = normalizeModelInput('BOOK');
  const alts = prioritizeSearchAlternatives(normalized, { maxAlternatives: 2 });
  // No digit-bearing structure → no forced O/0 explosion into dozens of forms.
  assert.ok(alts.length <= 2);
});

test('isCanonicalTranscriptionEquivalent only allows single safe substitutions', () => {
  assert.equal(isCanonicalTranscriptionEquivalent('WED4850HWO', 'WED4850HW0'), true);
  assert.equal(isCanonicalTranscriptionEquivalent('ABC1I23', 'ABC1123'), true);
  assert.equal(isCanonicalTranscriptionEquivalent('WED4850HWO', 'WED4850HW1'), false);
  assert.equal(isCanonicalTranscriptionEquivalent('WED4850HWO', 'WED4950HW0'), false);
  assert.equal(isCanonicalTranscriptionEquivalent('WED4850HWO', 'WED4850HWO'), false);
});
