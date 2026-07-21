import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySmartLookupQuery, extractLabeledIdentifiers } from '../../lib/smart-lookup/normalize.js';
import { buildSmartAgeCacheKey, buildSmartLkqCacheKey } from '../../lib/smart-lookup/cache.js';

// Combined label-style input ("GE FR31424IN GFW850SPN0DG") previously collapsed
// into a single mangled token FR31424INGFW850SPN0DG: chooseModel joined adjacent
// model-like tokens and then sorted candidates longest-first, so the
// concatenation always outranked either real identifier. That mangled value
// then flowed into the canonical query, the cache key, and the provider prompt.

const MODEL = 'GFW850SPN0DG';
const SERIAL = 'FR31424IN';

function info(query) { return classifySmartLookupQuery(query); }

// ── Required combined-input regressions ─────────────────────────────────────

for (const query of [
  'GE FR31424IN GFW850SPN0DG',
  'GE model GFW850SPN0DG serial FR31424IN',
  'Serial: FR31424IN Model: GFW850SPN0DG',
  'GFW850SPN0DG FR31424IN',
  'ge fr31424in / gfw850spn0dg',
  'GE-FR31424IN-GFW850SPN0DG',
]) {
  test(`combined input resolves the model, never a concatenated token: ${query}`, () => {
    const result = info(query);
    assert.equal(result.modelIdentity, MODEL);
    assert.doesNotMatch(result.modelIdentity, /FR31424IN/);
    assert.doesNotMatch(result.canonicalQuery, /fr31424ingfw850spn0dg/);
  });
}

test('an explicitly labeled serial is assigned the serial role', () => {
  const result = info('Serial: FR31424IN Model: GFW850SPN0DG');
  assert.equal(result.serialIdentity, SERIAL);
  assert.equal(result.serialSource, 'labeled');
  assert.equal(result.modelIdentity, MODEL);
});

test('an unlabeled second identifier stays ambiguous rather than being guessed into a serial', () => {
  const result = info('GE FR31424IN GFW850SPN0DG');
  assert.equal(result.serialIdentity, '');
  assert.equal(result.serialSource, 'none');
  assert.deepEqual(result.ambiguousIdentifiers, [SERIAL]);
});

test('extractLabeledIdentifiers handles several label spellings', () => {
  for (const query of [
    'model GFW850SPN0DG serial FR31424IN',
    'Model#: GFW850SPN0DG S/N: FR31424IN',
    'model no. GFW850SPN0DG serial number FR31424IN',
  ]) {
    const { labeledModel, labeledSerial } = extractLabeledIdentifiers(query);
    assert.equal(labeledModel, MODEL, query);
    assert.equal(labeledSerial, SERIAL, query);
  }
});

// ── Single-identifier behavior must not regress ─────────────────────────────

test('model-only input is unchanged', () => {
  const result = info('GE GFW850SPN0DG');
  assert.equal(result.modelIdentity, MODEL);
  assert.equal(result.querySpecificity, 'exact-model');
  assert.deepEqual(result.ambiguousIdentifiers, []);
});

test('serial-only input is unchanged', () => {
  const result = info('GE FR31424IN');
  assert.equal(result.modelIdentity, SERIAL);
  assert.deepEqual(result.ambiguousIdentifiers, []);
});

// ── False-positive protections ──────────────────────────────────────────────

test('a service tag is never promoted to the model or the serial', () => {
  const result = info('7PJ2XK1 Dell OptiPlex 9020');
  assert.equal(result.modelIdentity, 'OPTIPLEX9020');
  assert.equal(result.serialIdentity, '');
  assert.ok(result.ambiguousIdentifiers.includes('7PJ2XK1'));
});

test('a part number is not silently promoted to a serial role', () => {
  const result = info('GE GFW850SPN0DG WH45X10136');
  assert.equal(result.serialIdentity, '', 'no label means no serial assignment');
  assert.ok(result.ambiguousIdentifiers.includes('WH45X10136'));
});

test('two plausible identifiers preserve ambiguity and are never merged', () => {
  const result = info('GFW850SPN0DG PFD87ESPV0RS');
  assert.doesNotMatch(result.modelIdentity, /GFW850SPN0DGPFD87ESPV0RS/);
  assert.equal(result.ambiguousIdentifiers.length, 1);
});

test('a single random concatenated token is never split without evidence', () => {
  const result = info('GE X7K2P9Q4M1');
  assert.equal(result.modelIdentity, 'X7K2P9Q4M1');
  assert.deepEqual(result.ambiguousIdentifiers, []);
});

test('a structurally hyphenated model line is not split', () => {
  // AN515-58's parts are not independently complete identifiers, so the
  // hyphen run stays intact -- only label-style runs are split.
  const result = info('Acer AN515-58');
  assert.equal(result.modelIdentity, 'AN51558');
  assert.equal(result.querySpecificity, 'model-line');
});

test('a genuine space-split model fragment still joins', () => {
  // The join heuristic exists for models broken by a stray space; that case
  // must survive the guard that stops serial+model concatenation.
  assert.equal(info('QN65 Q60RAFXZA').modelIdentity, 'QN65Q60RAFXZA');
});

// ── Cache identity ──────────────────────────────────────────────────────────

test('model-only, serial-only, and model+serial never share a cache identity', () => {
  const keys = [
    'GE GFW850SPN0DG',
    'GE FR31424IN',
    'GE FR31424IN GFW850SPN0DG',
    'GE ZZ99999ZZ GFW850SPN0DG',
    'Serial: FR31424IN Model: GFW850SPN0DG',
  ].map((query) => buildSmartAgeCacheKey(info(query)));
  assert.equal(new Set(keys).size, keys.length);
});

test('LKQ cache identity separates model-only from model+serial', () => {
  const a = buildSmartLkqCacheKey(info('GE GFW850SPN0DG'));
  const b = buildSmartLkqCacheKey(info('GE FR31424IN GFW850SPN0DG'));
  assert.notEqual(a, b);
});

test('a cache key never contains a raw model or serial value', () => {
  const key = buildSmartAgeCacheKey(info('GE FR31424IN GFW850SPN0DG'));
  assert.doesNotMatch(key, /GFW850SPN0DG/i);
  assert.doesNotMatch(key, /FR31424IN/i);
});
