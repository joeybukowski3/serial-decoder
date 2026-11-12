import test from 'node:test';
import assert from 'node:assert/strict';
import { researchLiveV2 } from '../../lib/itemassist-research/enrich/orchestrate.js';
import { normalizeIdentification } from '../../lib/itemassist-research/enrich/identify.js';
import { buildResearchResponseV2, isValidResearchResponseV2 } from '../../lib/itemassist-research/contract-v2.js';
import { fixtureResearch2For } from '../../lib/itemassist-research/fixture-v2.js';
import { createResearchCache, researchCacheKey } from '../../lib/itemassist-research/cache.js';
import { S1_ROWS, createRedis } from '../helpers/itemassist-research-fakes.mjs';

// OFFLINE ONLY. A candidate's confidence is the model's opinion that it is a sensible successor. It is capped at MEDIUM unless a cited page confirms the
// model; one retailer listing naming a model supports "this model exists in a listing", not "this is the right replacement, and verified".
const REF = '2026-10-22';
const NOW = Date.UTC(2026, 9, 22, 12);
const QUERIES = ['LG C3 OLED TV', 'Samsung S90D 65', 'Samsung RF28 refrigerator', 'front load washer 27 inch', 'Samsung 65 inch TV', 'Bosch dishwasher', 'unsupported price claims tv', 'something I cannot describe'];
const built = (query) => buildResearchResponseV2(fixtureResearch2For(query, REF).input, { requestId: 'r', elapsedMs: 1, answerSource: 'AI_ESTIMATE', fixture: true, now: NOW });
const candidates = (response) => [response.successor, ...response.suggestions].filter(Boolean);

test('a candidate is HIGH confidence only when a cited page confirms its model', () => {
  for (const query of QUERIES) for (const candidate of candidates(built(query))) {
    if (candidate.confidence === 'HIGH') assert.equal(candidate.modelStatus, 'VERIFIED_LISTING', `${query}: ${candidate.name}`);
  }
  const premium = built('LG C3 OLED TV');
  assert.deepEqual([premium.successor.modelStatus, premium.successor.confidence], ['LISTED_PROVISIONAL', 'MEDIUM'], 'the model said high; a listing naming the model does not make it verified');
  const strong = built('Samsung S90D 65');
  assert.deepEqual([strong.successor.modelStatus, strong.successor.confidence], ['VERIFIED_LISTING', 'HIGH'], 'a page-confirmed model keeps what the model said');
});

test('the validator rejects a HIGH candidate whose model no page confirms, and accepts one that is confirmed', () => {
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const premium = clone(built('LG C3 OLED TV'));
  assert.equal(isValidResearchResponseV2(premium, { allowFixture: true }), true);
  premium.successor.confidence = 'HIGH';
  assert.equal(isValidResearchResponseV2(premium, { allowFixture: true }), false, 'HIGH on LISTED_PROVISIONAL');
  for (const status of ['FAMILY_LEVEL', 'UNVERIFIED_MODEL']) {
    const other = clone(built('LG C3 OLED TV'));
    other.successor.modelStatus = status;
    other.successor.confidence = 'HIGH';
    assert.equal(isValidResearchResponseV2(other, { allowFixture: true }), false, `HIGH on ${status}`);
  }
  assert.equal(isValidResearchResponseV2(clone(built('Samsung S90D 65')), { allowFixture: true }), true);
});

test('live: one retailer listing naming the model leaves identification, lineage, comparison and pricing as four separate statements', async () => {
  const reply = {
    category: 'tv', profile: 'tv', original: { identity: 'LG C3 series 55-inch 4K OLED evo smart TV (2023)', confidence: 'high', characteristics: ['55-inch OLED', '4K'], uncertainty: null },
    tier: 'PREMIUM', requirements: [], successor: { name: 'LG C-series OLED', why: 'Continues the line.', differences: null, concern: null, confidence: 'high', tierVsOriginal: 'SAME', comparison: [{ requirementKey: 'screenSize', status: 'MEETS' }] },
    suggestions: [], estimates: { originalNew: { low: 1500, high: 2000 }, replacementNew: { low: 1200, high: 1800 } }, clarify: [],
  };
  const at = Date.UTC(2026, 10, 11, 15);
  const result = await researchLiveV2('LG C3 55-inch TV', {
    env: { SERPER_API_KEY: 'k' }, now: () => at, identify: async (q) => ({ ok: true, ...normalizeIdentification(reply, q), meta: { requestSent: true, usage: {}, httpStatus: 200 } }),
    serper: async ({ kind }) => (kind === 'search' ? S1_ROWS.history['lg-c3-55'] : S1_ROWS.listings['lg-c3-55'].rows), serperBudget: { reserve: async (credits) => ({ allowed: true, status: 'allowed', credits }) }, enrichCache: null, enrich: true,
  });
  const response = buildResearchResponseV2(result.input, { requestId: 'r', elapsedMs: 1, answerSource: 'AI_ESTIMATE', now: at });
  assert.equal(isValidResearchResponseV2(response), true);
  assert.equal(response.successor.modelStatus, 'LISTED_PROVISIONAL');
  assert.equal(response.successor.confidence, 'MEDIUM', 'candidate fit: capped');
  assert.equal(response.original.confidence, 'HIGH', 'identification of the original is its own statement and is not changed by this cap');
  assert.equal(response.successor.lineage.basis, 'LISTINGS', 'lineage: where the generation came from');
  assert.ok(response.successor.comparison.every((row) => row.basis === 'AI_ESTIMATE'), 'comparability: nothing is confirmed by a source');
  assert.equal(response.pricing.valuation.confidence, 'LOW', 'pricing evidence: one listing');
  assert.equal(response.successor.standing, 'CONDITIONAL');
});

test('an answer cached before the cap (HIGH on a listing-backed model) is never served with HIGH: it is served lowered to MEDIUM (see the cached-confidence tests)', async () => {
  const response = JSON.parse(JSON.stringify(built('LG C3 OLED TV')));
  delete response.meta.fixture;
  const key = researchCacheKey('lg c3 oled tv', { contractVersion: 'research.2' });
  const old = JSON.parse(JSON.stringify(response));
  old.successor.confidence = 'HIGH';
  const redis = createRedis();
  redis.store.set(key, JSON.stringify({ key, contractVersion: 'research.2', response: old }));
  const cache = createResearchCache({ redis, contractVersion: 'research.2', allowFixture: false });
  assert.equal(isValidResearchResponseV2(old), false, 'as stored it fails validation');
  assert.equal((await cache.read(key)).successor.confidence, 'MEDIUM', 'what is served is the validated copy with the label lowered');
});
