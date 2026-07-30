import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyModelIdentity } from '../../lib/serial-refinement/deterministic/model-identity.js';

test('classifies a complete normalized model token as exact', () => {
  const result = classifyModelIdentity({
    model: 'GNE27JYMFS',
    title: 'GE GNE27JYMFS refrigerator',
    snippet: 'Specifications for model GNE27JYMFS.',
  });
  assert.equal(result.matchType, 'exact');
});

test('normalizes punctuation without changing model characters', () => {
  const result = classifyModelIdentity({
    model: 'WTW-5000-DW',
    title: 'Whirlpool WTW 5000 DW washer manual',
    snippet: '',
  });
  assert.equal(result.matchType, 'exact');
});

test('classifies a missing or different regional suffix as a variant, not exact', () => {
  const missingSuffix = classifyModelIdentity({
    model: 'RF28R7351SR/AA',
    title: 'Samsung RF28R7351SR refrigerator support',
    snippet: '',
  });
  const differentSuffix = classifyModelIdentity({
    model: 'RF28R7351SR/AA',
    title: 'Samsung RF28R7351SR/AB refrigerator support',
    snippet: '',
  });
  assert.equal(missingSuffix.matchType, 'variant');
  assert.equal(differentSuffix.matchType, 'variant');
});

test('classifies a related model line as family and an unrelated model as mismatch', () => {
  const family = classifyModelIdentity({
    model: 'RF28R7351SR',
    title: 'Samsung RF28R7551SR refrigerator review',
    snippet: '',
  });
  const mismatch = classifyModelIdentity({
    model: 'RF28R7351SR',
    title: 'Samsung WA50R5400AV washer review',
    snippet: '',
  });
  assert.equal(family.matchType, 'family');
  assert.equal(mismatch.matchType, 'mismatch');
});

test('does not treat a requested model embedded in a longer identifier as exact', () => {
  const result = classifyModelIdentity({
    model: 'ABC1234',
    title: 'Manual for ABC1234X',
    snippet: '',
  });
  assert.equal(result.matchType, 'variant');
});

test('supports long numeric model identifiers without confusing them with a nearby family', () => {
  const result = classifyModelIdentity({
    model: '795.72053.110',
    title: 'Service manual 795 72053 110',
    snippet: '',
  });
  assert.equal(result.matchType, 'exact');
});
