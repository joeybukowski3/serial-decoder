import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluateReplacement } from '../../lib/replacement-core/evaluate.js';
import { televisionProfile } from '../../lib/replacement-core/profiles/television.js';

const cases = JSON.parse(fs.readFileSync(new URL('../fixtures/replacement-core/television-cases.json', import.meta.url)));
const clone = () => structuredClone(cases.complete65);
const evaluate = (entry) => evaluateReplacement({ ...entry, profile: televisionProfile });
const replace = (entry, key, value, status = 'KNOWN') => { entry.candidate.identity.facts[key] = { status, value, evidenceRefs: ['candidate-sheet'] }; };
const original = (entry, key, value, status = 'KNOWN') => { entry.original.facts[key] = { status, value, evidenceRefs: ['label'] }; };
const row = (result, key) => result.decision.comparisons.find((comparison) => comparison.key === key);

test('complete 65-inch QLED fixture returns LKQ with HIGH confidence and original first', () => {
  const result = evaluate(cases.complete65);
  assert.equal(result.classification, 'LKQ');
  assert.equal(result.confidence, 'HIGH');
  assert.equal(result.candidate.candidateId, 'tv-replacement-65');
  assert.equal(result.knownFacts.find((item) => item.key === 'screenSizeIn').value, 65);
  assert.equal(row(result, 'screenSizeIn').assessment, 'MATCH');
  assert.ok(result.comparisonRows.length <= 12);
});

test('65 to 75 passes size and is Above LKQ with known fit; 65 to 55 fails despite upgrades', () => {
  const larger = clone();
  replace(larger, 'screenSizeIn', 75);
  const above = evaluate(larger);
  assert.equal(row(above, 'screenSizeIn').assessment, 'BETTER');
  assert.equal(above.classification, 'ABOVE_LKQ');
  const smaller = clone();
  replace(smaller, 'screenSizeIn', 55);
  replace(smaller, 'tier', 'LUXURY');
  replace(smaller, 'refreshHz', 240);
  assert.equal(evaluate(smaller).classification, 'NOT_LKQ');
  assert.ok(evaluate(smaller).decision.hardFailures.some((failure) => failure.key === 'screenSizeIn'));
});

test('larger screen with unknown fit retains candidate and unconfirmed classification', () => {
  const entry = clone();
  replace(entry, 'screenSizeIn', 75);
  original(entry, 'physicalFit', null, 'UNKNOWN');
  const result = evaluate(entry);
  assert.equal(row(result, 'screenSizeIn').assessment, 'BETTER');
  assert.equal(result.classification, 'UNCONFIRMED');
  assert.ok(result.candidate);
});

test('4K to 4K and 1080p to 4K pass; 4K to 1080p fails', () => {
  assert.equal(row(evaluate(clone()), 'resolution').assessment, 'MATCH');
  const higher = clone();
  original(higher, 'resolution', '1080p');
  assert.equal(row(evaluate(higher), 'resolution').assessment, 'BETTER');
  const lower = clone();
  replace(lower, 'resolution', '1080p');
  assert.equal(evaluate(lower).classification, 'NOT_LKQ');
});

test('Premium to Standard fails; Premium to Premium or Upper Premium passes', () => {
  const lower = clone();
  replace(lower, 'tier', 'STANDARD');
  assert.equal(evaluate(lower).classification, 'NOT_LKQ');
  assert.equal(row(evaluate(clone()), 'tier').assessment, 'MATCH');
  const higher = clone();
  replace(higher, 'tier', 'UPPER_PREMIUM');
  assert.equal(row(evaluate(higher), 'tier').assessment, 'BETTER');
  assert.notEqual(evaluate(higher).classification, 'NOT_LKQ');
});

test('QLED same-technology matches; OLED is different without a universal quality ladder', () => {
  assert.equal(row(evaluate(clone()), 'displayTechnology').assessment, 'MATCH');
  const oled = clone();
  replace(oled, 'displayTechnology', 'OLED');
  const result = evaluate(oled);
  assert.equal(row(result, 'displayTechnology').assessment, 'DIFFERENT');
  assert.equal(result.classification, 'CLOSE_MATCH');
  assert.equal(result.decision.materialUpgrades.length, 0);
});

test('HDMI count and tuner differences remain secondary and do not reject', () => {
  const entry = clone();
  replace(entry, 'hdmiCount', 3);
  replace(entry, 'tuner', 'ATSC 3.0');
  const result = evaluate(entry);
  assert.equal(result.classification, 'LKQ');
  assert.equal(row(result, 'hdmiCount').assessment, 'DIFFERENT');
  assert.equal(row(result, 'tuner').assessment, 'DIFFERENT');
});

test('documented HDMI requirement promotes secondary feature to HARD', () => {
  const entry = clone();
  replace(entry, 'hdmiGeneration', '2.0');
  const result = evaluateReplacement({ ...entry, profile: televisionProfile, requirements: [{ key: 'hdmiGeneration', hardRule: 'MATCH', requiredValue: '2.1', evidenceRefs: ['connected-equipment'] }] });
  assert.equal(result.classification, 'NOT_LKQ');
  assert.ok(result.decision.hardFailures.some((failure) => failure.reasonCode === 'PROMOTED_HARD_FAILED'));
  assert.throws(() => evaluateReplacement({ ...entry, profile: televisionProfile, requirements: [{ key: 'hdmiGeneration', hardRule: 'MATCH', requiredValue: '2.1', evidenceRefs: [] }] }), /documented/);
});

test('unknown refresh or series does not stop recommendation; unknown high strong lowers confidence', () => {
  const entry = clone();
  original(entry, 'refreshHz', null, 'UNKNOWN');
  original(entry, 'series', null, 'UNKNOWN');
  const result = evaluate(entry);
  assert.ok(result.candidate);
  assert.equal(result.classification, 'LKQ');
  assert.equal(result.confidence, 'MEDIUM');
});

test('tier baseline is an explicit assumption; absent baseline leaves tier unverified', () => {
  const baseline = structuredClone(cases.incomplete55);
  const result = evaluate(baseline);
  assert.equal(result.classification, 'UNCONFIRMED');
  assert.equal(result.normalizedOriginal.facts.tier.status, 'ASSUMED');
  assert.equal(result.normalizedOriginal.facts.tier.basis, 'BRAND_CATEGORY_BASELINE');
  assert.equal(row(result, 'tier').assessment, 'ASSUMED');
  const missing = clone();
  original(missing, 'brand', 'Unlisted Brand');
  replace(missing, 'brand', 'Unlisted Brand');
  delete missing.original.facts.tier;
  const unverified = evaluate(missing);
  assert.equal(row(unverified, 'tier').assessment, 'UNVERIFIED');
  assert.notEqual(unverified.confidence, 'HIGH');
});

test('provider rank and price do not affect deterministic similarity', () => {
  const entry = clone();
  const before = evaluate(entry);
  entry.candidate.providerRank = 100;
  entry.candidate.price = 1;
  const after = evaluate(entry);
  assert.equal(before.decision.score.weightedTotal, after.decision.score.weightedTotal);
  assert.equal(before.classification, after.classification);
});

test('similarity score decomposes into per-spec earned points and unknown earns none', () => {
  const entry = clone();
  original(entry, 'refreshHz', null, 'UNKNOWN');
  const result = evaluate(entry);
  const scored = result.decision.comparisons.filter((comparison) => comparison.bucket !== 'HARD');
  const total = scored.reduce((sum, comparison) => sum + comparison.earnedPoints, 0);
  assert.equal(result.decision.score.weightedTotal, Math.round(total * 10) / 10);
  assert.equal(row(result, 'refreshHz').earnedPoints, 0);
  assert.ok(row(result, 'refreshHz').maxPoints > 0);
});

test('wrong candidate category is NOT_LKQ', () => {
  const entry = clone();
  entry.candidate.identity.category = 'refrigerator';
  assert.equal(evaluate(entry).classification, 'NOT_LKQ');
});
