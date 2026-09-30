import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendReplacement } from '../../lib/replacement-discovery/recommend.js';
import { createFixtureProvider } from '../../lib/replacement-discovery/providers/fixture-provider.js';
import { refrigeratorPool, televisionPool, tv } from '../fixtures/replacement-discovery/candidate-pools.mjs';

const fullTv = { query: 'Samsung QN55Q80 55 inch QLED 4K 120 Hz smart TV HDR10+', notes: 'tier: premium; physical fit: yes' };
const run = (pool, input = fullTv) => recommendReplacement({ ...input, candidateProvider: createFixtureProvider(pool) });

test('TV pool rejects smaller and lower-tier candidates; exact LKQ outranks upgrade and cross-brand option', async () => {
  const result = await run(televisionPool);
  assert.equal(result.primaryRecommendation.candidate.candidateId, 'tv-samsung-qled-55');
  assert.equal(result.primaryRecommendation.classification, 'LKQ');
  assert.ok(result.rejectedSummary.some((item) => item.candidateId === 'tv-samsung-qled-50' && item.reasonCode === 'KNOWN_HARD_FAILURE'));
  assert.ok(result.rejectedSummary.some((item) => item.candidateId === 'tv-samsung-led-standard' && item.reasonCode === 'KNOWN_HARD_FAILURE'));
  assert.ok(result.alternatives.length <= 2);
  assert.ok(result.alternatives.some((item) => item.recommendation.candidate.candidateId === 'tv-sony-qled-55'));
  assert.ok(result.alternatives.some((item) => item.recommendation.candidate.candidateId === 'tv-samsung-neo-55'));
});

test('a tight LKQ match outranks an unnecessary Above LKQ screen and tier upgrade', async () => {
  const upgrade = tv('tv-unnecessary-upgrade', 'SAMSUNG-QLED-75', 'Samsung', 75, 'LUXURY', 'QLED', { series: 'Q80 Series' });
  const result = await run([upgrade, televisionPool[0]]);
  assert.equal(result.primaryRecommendation.candidate.candidateId, 'tv-samsung-qled-55');
  assert.equal(result.alternatives[0].recommendation.classification, 'ABOVE_LKQ');
  assert.equal(result.alternatives[0].role, 'ABOVE_LKQ_OPTION');
});

test('valid cross-brand television outranks same-brand hard failure', async () => {
  const result = await run([televisionPool[1], televisionPool[4]]);
  assert.equal(result.primaryRecommendation.candidate.candidateId, 'tv-sony-qled-55');
  assert.equal(result.alternatives.length, 0);
});

test('incomplete TV still returns a baseline; weaker same-brand LED does not displace comparable Sony', async () => {
  const result = await run(televisionPool, { query: '55 Samsung QLED TV' });
  assert.equal(result.primaryRecommendation.candidate.candidateId, 'tv-samsung-qled-55');
  assert.equal(result.primaryRecommendation.classification, 'UNCONFIRMED');
  assert.equal(result.primaryRecommendation.confidence, 'LOW');
  assert.deepEqual(result.alternatives.map((item) => item.recommendation.candidate.candidateId), ['tv-sony-qled-55']);
  assert.ok(result.originalInterpretation.unknownImportantFacts.some((item) => item.key === 'physicalFit'));
  assert.ok(result.refinementSuggestions.length > 0);
});

test('known refrigerator capacity and configuration eliminate lower-capacity and top-freezer candidates', async () => {
  const result = await run(refrigeratorPool, { query: 'LG 25 cu ft side by side refrigerator', notes: 'tier: premium; physical fit: yes; freestanding; stainless' });
  assert.equal(result.primaryRecommendation.candidate.candidateId, 'fridge-lg-sbs-25');
  assert.ok(result.rejectedSummary.some((item) => item.candidateId === 'fridge-lg-sbs-24' && item.reasonCode === 'KNOWN_HARD_FAILURE'));
  assert.ok(result.rejectedSummary.some((item) => item.candidateId === 'fridge-lg-top-freezer' && item.reasonCode === 'KNOWN_HARD_FAILURE'));
  assert.ok(result.alternatives.length <= 2);
});

test('valid cross-brand refrigerator outranks inferior same-brand candidates', async () => {
  const result = await run([refrigeratorPool[1], refrigeratorPool[3], refrigeratorPool[4]], { query: 'LG 25 cu ft side by side refrigerator', notes: 'tier: premium; physical fit: yes; freestanding' });
  assert.equal(result.primaryRecommendation.candidate.candidateId, 'fridge-ge-sbs-25');
  assert.equal(result.alternatives.length, 0);
});

test('incomplete LG refrigerator returns plausible baseline and omits capacity-only filler variants', async () => {
  const result = await run(refrigeratorPool, { query: 'LG side by side refrigerator' });
  assert.equal(result.primaryRecommendation.candidate.candidateId, 'fridge-lg-sbs-25');
  assert.equal(result.primaryRecommendation.classification, 'UNCONFIRMED');
  assert.equal(result.primaryRecommendation.confidence, 'LOW');
  assert.deepEqual(result.alternatives.map((item) => item.recommendation.candidate.candidateId), ['fridge-ge-sbs-25']);
  assert.deepEqual(result.refinementSuggestions.slice(0, 2).map((item) => item.fieldKey), ['totalCapacityCuFt', 'physicalFit']);
});

test('all hard-fail candidates still yield one least-bad NOT_LKQ primary', async () => {
  const bad = [tv('small-50', 'SMALL-50', 'Samsung', 50, 'PREMIUM', 'QLED'), tv('small-low-49', 'SMALL-49', 'Samsung', 49, 'STANDARD', 'QLED')];
  const result = await run(bad);
  assert.equal(result.primaryRecommendation.candidate.candidateId, 'small-50');
  assert.equal(result.primaryRecommendation.classification, 'NOT_LKQ');
  assert.equal(result.bestAvailableRecommendation, true);
  assert.ok(result.reasonCodes.includes('NO_LKQ_CANDIDATE_FOUND'));
  assert.equal(result.alternatives.length, 0);
  assert.ok(result.refinementSuggestions.some((item) => item.reasonCode === 'FIND_HARD_COMPLIANT_CANDIDATE'));
});

test('provider rank and price cannot change deterministic primary', async () => {
  const pool = structuredClone(televisionPool);
  const before = await run(pool);
  pool[0].providerRank = 99;
  pool[4].providerRank = 1;
  pool[4].price = 1;
  const after = await run(pool);
  assert.equal(before.primaryRecommendation.candidate.candidateId, after.primaryRecommendation.candidate.candidateId);
  assert.equal(before.primaryRecommendation.decision.score.weightedTotal, after.primaryRecommendation.decision.score.weightedTotal);
});
