import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendReplacement } from '../../lib/replacement-discovery/recommend.js';
import { createFixtureProvider } from '../../lib/replacement-discovery/providers/fixture-provider.js';
import { televisionPool, tv } from '../fixtures/replacement-discovery/candidate-pools.mjs';

const full = { query: 'Samsung QN55Q80 55 inch QLED 4K 120 Hz smart TV HDR10+', notes: 'tier: premium; physical fit: yes' };
const run = (pool, input = full) => recommendReplacement({ ...input, candidateProvider: createFixtureProvider(pool) });
const count = (result) => Number(Boolean(result.primaryRecommendation)) + result.alternatives.length;

test('one clear fit gives one user-facing candidate', async () => {
  assert.equal(count(await run([televisionPool[0], televisionPool[1], televisionPool[2]])), 1);
});

test('one primary and one distinct cross-brand option give two', async () => {
  assert.equal(count(await run([televisionPool[0], televisionPool[4]])), 2);
});

test('one primary and two meaningful alternatives give three', async () => {
  assert.equal(count(await run([televisionPool[0], televisionPool[3], televisionPool[4]])), 3);
});

test('five discovered but only two useful produce two, without filler', async () => {
  assert.equal(count(await run(televisionPool, { query: '55 Samsung QLED TV' })), 2);
});

test('six discovered never show more than three', async () => {
  const sixth = tv('tv-samsung-other-55', 'SAMSUNG-OTHER-55', 'Samsung', 55, 'PREMIUM', 'QLED');
  const result = await run([...televisionPool, sixth]);
  assert.equal(result.internalPoolCount, 6);
  assert.ok(count(result) <= 3);
});

test('empty provider pool returns an explicit no-candidate result', async () => {
  const result = await run([]);
  assert.equal(result.primaryRecommendation, null);
  assert.deepEqual(result.reasonCodes, ['NO_CANDIDATES_DISCOVERED']);
});

test('provider oversupply is bounded to six drafts before evaluation', async () => {
  const oversupply = [...televisionPool, ...televisionPool];
  const candidateProvider = { async discoverCandidates() { return structuredClone(oversupply); } };
  const result = await recommendReplacement({ ...full, candidateProvider });
  assert.equal(result.internalPoolCount, 10);
  assert.ok(count(result) <= 3);
  assert.ok(result.rejectedSummary.some((item) => item.reasonCode === 'DUPLICATE_CANDIDATE_ID'));
});
