import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluateReplacement } from '../../lib/replacement-core/evaluate.js';
import { refrigeratorProfile } from '../../lib/replacement-core/profiles/refrigerator.js';
import { rankEvaluations, upgradeMagnitude } from '../../lib/replacement-discovery/candidate-ranker.js';

const base = JSON.parse(fs.readFileSync(new URL('../fixtures/replacement-core/refrigerator-cases.json', import.meta.url))).complete25;
const fact = (value) => ({ status: 'KNOWN', value, evidenceRefs: ['candidate-sheet'] });

/** Freestanding original with no fit data: every candidate below carries only a VERIFY_FIT advisory. */
function original() {
  const entry = structuredClone(base.original);
  entry.facts.physicalFit = { status: 'UNKNOWN', value: null, evidenceRefs: [] };
  return entry;
}

function candidate(id, facts = {}, discoveryConfidence = 'HIGH') {
  const source = structuredClone(base.candidate);
  delete source.identity.facts.physicalFit;
  Object.assign(source.identity.facts, Object.fromEntries(Object.entries(facts).map(([key, value]) => [key, fact(value)])));
  return { ...source, candidateId: id, discoveryConfidence, identity: { ...source.identity, id: `identity-${id}` } };
}

const evaluateAll = (candidates) => candidates.map((entry) => evaluateReplacement({ original: original(), candidate: entry, profile: refrigeratorProfile }));
const order = (candidates) => rankEvaluations(evaluateAll(candidates)).map((item) => item.candidate.candidateId);
// candidateId sorts alphabetically, so 'a-…' would win the old hash-style final tie-break.
const bothOrders = (list) => [order(list), order([...list].reverse())];

test('E. closer adequate capacity wins an otherwise exact tie, whatever the input or id order', () => {
  const tight = candidate('z-tight', { totalCapacityCuFt: 25 });
  const larger = candidate('a-larger', { totalCapacityCuFt: 27 });
  const evaluations = evaluateAll([tight, larger]);
  assert.deepEqual(evaluations.map((item) => item.classification), ['LKQ', 'LKQ']);
  assert.deepEqual(evaluations.map((item) => item.decision.score.weightedTotal), [evaluations[1].decision.score.weightedTotal, evaluations[1].decision.score.weightedTotal]);
  for (const result of bothOrders([tight, larger])) assert.deepEqual(result, ['z-tight', 'a-larger']);
  assert.equal(upgradeMagnitude(evaluations[0]), 0);
  assert.ok(upgradeMagnitude(evaluations[1]) > 0.07);
});

test('tie-break prefers the smaller of two upgrades, including tier steps', () => {
  const slight = candidate('z-slight', { totalCapacityCuFt: 26 });
  const big = candidate('a-big', { totalCapacityCuFt: 30 });
  const tier = candidate('b-tier', { totalCapacityCuFt: 26, tier: 'UPPER_PREMIUM' });
  for (const result of bothOrders([slight, big, tier])) assert.deepEqual(result, ['z-slight', 'b-tier', 'a-big']);
});

test('never rescues an inferior candidate: a worse similarity score loses despite a tighter match', () => {
  const inferior = candidate('z-tight-worse', { totalCapacityCuFt: 25, dispenser: 'none' });
  const better = candidate('a-larger-better', { totalCapacityCuFt: 27 });
  const [inferiorResult, betterResult] = evaluateAll([inferior, better]);
  assert.equal(inferiorResult.classification, 'CLOSE_MATCH');
  assert.equal(betterResult.classification, 'LKQ');
  assert.ok(upgradeMagnitude(inferiorResult) < upgradeMagnitude(betterResult));
  for (const result of bothOrders([inferior, better])) assert.deepEqual(result, ['a-larger-better', 'z-tight-worse']);
});

test('never rescues an inferior candidate: a known hard failure loses despite zero upgrade', () => {
  const failing = candidate('z-fails', { totalCapacityCuFt: 24, installationType: 'freestanding' });
  const valid = candidate('a-valid-larger', { totalCapacityCuFt: 30 });
  const [failingResult] = evaluateAll([failing]);
  assert.equal(failingResult.decision.hardFailures.length, 1);
  assert.equal(upgradeMagnitude(failingResult), 0);
  for (const result of bothOrders([failing, valid])) assert.deepEqual(result, ['a-valid-larger', 'z-fails']);
});

test('never rescues an inferior candidate: lower confidence loses despite a tighter match', () => {
  const lowConfidence = candidate('z-tight-low', { totalCapacityCuFt: 25 }, 'LOW');
  const highConfidence = candidate('a-larger-high', { totalCapacityCuFt: 27 }, 'HIGH');
  const [low, high] = evaluateAll([lowConfidence, highConfidence]);
  assert.equal(low.decision.score.weightedTotal, high.decision.score.weightedTotal);
  assert.ok(['LOW'].includes(low.confidence) && high.confidence !== 'LOW');
  for (const result of bothOrders([lowConfidence, highConfidence])) assert.deepEqual(result, ['a-larger-high', 'z-tight-low']);
});

test('never rescues an inferior candidate: a better classification loses nothing to a tighter UNCONFIRMED one', () => {
  const unconfirmed = candidate('z-tight-unconfirmed', { totalCapacityCuFt: 25, iceMaker: undefined });
  delete unconfirmed.identity.facts.iceMaker;
  delete unconfirmed.identity.facts.dispenser;
  delete unconfirmed.identity.facts.counterDepth;
  delete unconfirmed.identity.facts.capacityBalance;
  const larger = candidate('a-larger-lkq', { totalCapacityCuFt: 27 });
  const [weak, strong] = evaluateAll([unconfirmed, larger]);
  assert.equal(strong.classification, 'LKQ');
  assert.notEqual(weak.classification, 'LKQ');
  for (const result of bothOrders([unconfirmed, larger])) assert.deepEqual(result, ['a-larger-lkq', 'z-tight-unconfirmed']);
});
