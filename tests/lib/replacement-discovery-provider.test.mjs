import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverCandidatePool } from '../../lib/replacement-discovery/candidate-provider.js';
import { interpretReplacementSearch } from '../../lib/replacement-discovery/interpret.js';
import { createFixtureProvider } from '../../lib/replacement-discovery/providers/fixture-provider.js';
import { televisionPool } from '../fixtures/replacement-discovery/candidate-pools.mjs';

const interpretation = interpretReplacementSearch({ query: '55 Samsung QLED TV' });
const args = { original: interpretation.normalizedOriginal, hints: interpretation.candidateDiscoveryHints };

test('fixture provider yields normalized Phase 1 candidates and protects its snapshot', async () => {
  const provider = createFixtureProvider([televisionPool[0]]);
  const first = await discoverCandidatePool({ ...args, candidateProvider: provider });
  assert.equal(first.candidates[0].identity.facts.screenSizeIn.value, 55);
  first.candidates[0].identity.facts.screenSizeIn.value = 1;
  const second = await discoverCandidatePool({ ...args, candidateProvider: provider });
  assert.equal(second.candidates[0].identity.facts.screenSizeIn.value, 55);
});

test('bad and duplicate drafts are reported without losing usable candidates', async () => {
  const provider = createFixtureProvider([televisionPool[0], { candidateId: 'invalid' }, televisionPool[0]]);
  const result = await discoverCandidatePool({ ...args, candidateProvider: provider });
  assert.equal(result.candidates.length, 1);
  assert.deepEqual(result.rejected.map((item) => item.reasonCode), ['INVALID_CANDIDATE_DRAFT', 'DUPLICATE_CANDIDATE_ID']);
});

test('provider contract rejects invalid limits and non-array output', async () => {
  await assert.rejects(discoverCandidatePool({ ...args, candidateProvider: createFixtureProvider([]), limit: 7 }), /1 through 6/);
  await assert.rejects(discoverCandidatePool({ ...args, candidateProvider: { async discoverCandidates() { return null; } } }), /array/);
});
