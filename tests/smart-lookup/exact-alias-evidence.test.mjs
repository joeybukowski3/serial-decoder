import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  compactModelToken,
  findExactEvidenceCollisions,
  matchExactModelEvidence,
  MIN_EXACT_TOKEN_LENGTH,
} from '../../lib/model-evidence/exact-model-match.js';
import { findLocalModelAgeResult } from '../../lib/smart-lookup/age-legacy.js';

const db = JSON.parse(await readFile(new URL('../../data/model-age-db.json', import.meta.url), 'utf8'));
const records = db.records;

// `exactAliases` was only ever read by serial refinement. Smart Lookup's
// buildSearchTerms covers `model` + `aliases`, so the verified alias
// GFW850SPN0DG resolved in refinement but was invisible to Smart Lookup.

// ── Shared matcher ──────────────────────────────────────────────────────────

test('a verified exact alias resolves to its canonical model', () => {
  const match = matchExactModelEvidence(records, 'GFW850SPN0DG');
  assert.equal(match.matchedBy, 'exact-alias');
  assert.equal(match.canonicalModel, 'GFW850SPNDG');
  assert.equal(match.enteredModel, 'GFW850SPN0DG');
  assert.equal(match.ambiguous, false);
});

test('the canonical model resolves as canonical-model', () => {
  const match = matchExactModelEvidence(records, 'GFW850SPNDG');
  assert.equal(match.matchedBy, 'canonical-model');
  assert.equal(match.canonicalModel, 'GFW850SPNDG');
});

test('approved normalization only: casing and spacing, never digit/letter mutation', () => {
  for (const value of ['gfw850spn0dg', '  GFW850SPN0DG  ', 'GFW850-SPN0DG']) {
    assert.equal(matchExactModelEvidence(records, value).canonicalModel, 'GFW850SPNDG', value);
  }
  // O and 0 are NOT interchanged -- that would be an unsafe global mutation.
  assert.equal(matchExactModelEvidence(records, 'GFW850SPNODG').record, null);
});

test('near matches, prefixes, and substrings never resolve', () => {
  for (const value of ['GFW850SPNXDG', 'GFW8500SPNDG', 'GFW850SPNODG', 'GFW850', 'SPN0DG', 'GFW850SPN0DGX']) {
    const match = matchExactModelEvidence(records, value);
    assert.equal(match.record, null, `${value} must not resolve`);
  }
});

test('a token shorter than the safe minimum can never carry an identity claim', () => {
  assert.ok(MIN_EXACT_TOKEN_LENGTH >= 5);
  assert.equal(matchExactModelEvidence(records, 'GFW').record, null);
});

test('a brand filter blocks a cross-brand exact match', () => {
  assert.equal(matchExactModelEvidence(records, 'GFW850SPN0DG', { brand: 'Samsung' }).record, null);
  assert.ok(matchExactModelEvidence(records, 'GFW850SPN0DG', { brand: 'GE' }).record);
});

test('an ambiguous alias returns no record instead of choosing the first', () => {
  const mock = [
    { brand: 'GE', model: 'AAA111BBB', category: 'washer', exactAliases: ['SHARED9TOKEN'] },
    { brand: 'LG', model: 'CCC222DDD', category: 'dryer', exactAliases: ['SHARED9TOKEN'] },
  ];
  const match = matchExactModelEvidence(mock, 'SHARED9TOKEN');
  assert.equal(match.record, null);
  assert.equal(match.ambiguous, true);
  assert.equal(match.matchCount, 2);
});

test('several entries for the same canonical model are not treated as ambiguous', () => {
  const mock = [
    { brand: 'GE', model: 'AAA111BBB', exactAliases: ['ALIAS9TOKEN'] },
    { brand: 'GE', model: 'AAA111BBB', exactAliases: ['ALIAS9TOKEN'] },
  ];
  assert.equal(matchExactModelEvidence(mock, 'ALIAS9TOKEN').ambiguous, false);
});

test('compactModelToken never mutates digits or letters', () => {
  assert.equal(compactModelToken('gfw850-spn0dg'), 'GFW850SPN0DG');
  assert.equal(compactModelToken('GFW850SPNODG'), 'GFW850SPNODG');
});

// ── Database integrity (Phase 7) ────────────────────────────────────────────

test('the shipped evidence database has no exact-identifier collisions', () => {
  assert.deepEqual(findExactEvidenceCollisions(records), []);
});

test('collision validation detects each unsafe alias shape', () => {
  const duplicate = findExactEvidenceCollisions([
    { brand: 'GE', model: 'AAA111BBB', exactAliases: ['SHARED9TOKEN'] },
    { brand: 'LG', model: 'CCC222DDD', exactAliases: ['SHARED9TOKEN'] },
  ]);
  assert.ok(duplicate.some((entry) => entry.type === 'duplicate-exact-alias'));

  const shadow = findExactEvidenceCollisions([
    { brand: 'GE', model: 'AAA111BBB', exactAliases: [] },
    { brand: 'LG', model: 'CCC222DDD', exactAliases: ['AAA111BBB'] },
  ]);
  assert.ok(shadow.some((entry) => entry.type === 'exact-alias-shadows-canonical-model'));

  const short = findExactEvidenceCollisions([{ brand: 'GE', model: 'AAA111BBB', exactAliases: ['Q60'] }]);
  assert.ok(short.some((entry) => entry.type === 'unsafe-short-exact-alias'));

  const dupCanonical = findExactEvidenceCollisions([
    { brand: 'GE', model: 'AAA111BBB' },
    { brand: 'GE', model: 'AAA111BBB' },
  ]);
  assert.ok(dupCanonical.some((entry) => entry.type === 'duplicate-canonical-model'));
});

// ── Smart Lookup local evidence ─────────────────────────────────────────────

test('Smart Lookup local evidence now resolves the verified exact alias', async () => {
  const result = await findLocalModelAgeResult('GFW850SPN0DG');
  assert.ok(result, 'the alias must produce a local hit');
  assert.equal(result.brand, 'GE');
  assert.equal(result.category, 'washer');
  assert.equal(result.canonicalModel, 'GFW850SPNDG');
  assert.equal(result.matchedBy, 'exact-alias');
  assert.equal(result.verifiedExact, true);
  // The entered value is preserved, not silently replaced.
  assert.equal(result.model, 'GFW850SPN0DG');
});

test('local evidence never asserts an individual manufacture year', async () => {
  const result = await findLocalModelAgeResult('GFW850SPN0DG');
  assert.equal(result.individualManufactureYear ?? null, null);
  assert.equal(result.yearRange, '2019-2021');
});

test('existing exact-alias and canonical regressions still resolve', async () => {
  for (const [query, canonical] of [
    ['PFD87ESPV0RS', 'PFD87ESPVRS'],
    ['PFD87ESPVRS', 'PFD87ESPVRS'],
    ['GFW850SPNDG', 'GFW850SPNDG'],
    ['QN65Q60RAFXZA', 'QN65Q60RAFXZA'],
  ]) {
    const result = await findLocalModelAgeResult(query);
    assert.ok(result, `${query} must resolve`);
    assert.equal(result.canonicalModel || result.model, canonical);
  }
});

test('near matches produce no local evidence hit', async () => {
  for (const query of ['GFW850SPNXDG', 'GFW8500SPNDG', 'GFW850SPNODG', 'SPN0DG']) {
    assert.equal(await findLocalModelAgeResult(query), null, `${query} must not resolve`);
  }
});
