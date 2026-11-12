import test from 'node:test';
import assert from 'node:assert/strict';
import { createItemAssistResearchHandler } from '../../lib/itemassist-research/handler.js';
import { researchBudgetKey } from '../../lib/itemassist-research/budget.js';
import { researchCacheKey, createResearchCache } from '../../lib/itemassist-research/cache.js';
import { RESEARCH_CONTRACT_V2, buildResearchResponseV2, isValidResearchResponseV2, lowerUnsupportedConfidence } from '../../lib/itemassist-research/contract-v2.js';
import { fixtureResearch2For } from '../../lib/itemassist-research/fixture-v2.js';
import { serperBudgetKey } from '../../lib/itemassist-research/enrich/serper-budget.js';
import { S1_ROWS, createRedis, routedFetch } from '../helpers/itemassist-research-fakes.mjs';

// OFFLINE ONLY. An answer cached before the confidence cap may carry HIGH on a model no cited page confirms. Lowering that one label is the only change made on
// read: it is served only if the lowered copy passes the full validator, nothing is rewritten in the store (so the expiry stands), and no provider is called.
const TOKEN = 'test-token-0123456789-abcdefghijkl';
const NOW = Date.UTC(2026, 9, 23, 12, 0, 0);
const ENV = Object.freeze({
  ITEMASSIST_RESEARCH_ENABLED: 'true', ITEMASSIST_REPLACEMENT_API_TOKEN: TOKEN, GEMINI_API_KEY: 'gemini-test-key-0123456789abcdef', SERPER_API_KEY: 'serper-test-key-0123456789abcdef',
  ITEMASSIST_RESEARCH_DAILY_CALL_LIMIT: '50', ITEMASSIST_RESEARCH_LIVE_CONTRACT: 'research.2', ITEMASSIST_RESEARCH_ENRICHMENT: 'on',
});
const QUERY = 'LG C3 55 inch OLED';
const reply = {
  category: 'tv', profile: 'tv', tier: 'PREMIUM',
  original: { identity: 'LG C3 series 4K OLED smart TV', confidence: 'high', characteristics: ['OLED panel', '4K'], uncertainty: null }, requirements: [],
  successor: { name: 'LG C-series OLED, current generation', why: 'The next generation of the same line.', differences: 'Newer processor.', concern: null, confidence: 'high' },
  suggestions: [{ name: 'Sony Bravia 8 OLED', why: 'Similar tier.', differences: 'Different platform.', confidence: 'high' }],
  estimates: { originalNew: { low: 1700, high: 2300 }, replacementNew: { low: 900, high: 1600 } }, clarify: [],
};
const fetchFor = () => routedFetch({ gemini: reply, history: () => S1_ROWS.history['lg-c3-55'], listings: (query) => (query.includes('C-series') ? S1_ROWS.listings['lg-c3-55'].rows : []) });
const res = () => ({ statusCode: 200, body: null, headers: {}, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, setHeader() {} });
const clone = (value) => JSON.parse(JSON.stringify(value));
const candidates = (response) => [response.successor, ...response.suggestions].filter(Boolean);

async function seed() {
  const redis = createRedis();
  const fetchImpl = fetchFor();
  const handler = createItemAssistResearchHandler({ env: ENV, logger: { info() {}, warn() {}, error() {} }, now: () => NOW, redisFactory: async () => redis, requestIdFactory: () => 'req-1', fetchImpl });
  const first = res();
  await handler({ method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: { query: QUERY } }, first);
  const key = researchCacheKey(QUERY, { contractVersion: RESEARCH_CONTRACT_V2 });
  return { redis, fetchImpl, handler, first, key };
}
const ask = async (handler) => { const out = res(); await handler({ method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: { query: QUERY } }, out); return out; };
const counts = ({ redis, fetchImpl }) => [fetchImpl.calls.gemini.length, fetchImpl.calls.search.length, fetchImpl.calls.shopping.length, Number(redis.store.get(serperBudgetKey(NOW)) || 0), Number(redis.store.get(researchBudgetKey(NOW)))];
/** The stored entry as an engine without the cap would have written it: HIGH on every candidate. */
function storeOldAnswer({ redis, key }, change = () => {}) {
  const entry = JSON.parse(redis.store.get(key));
  for (const candidate of candidates(entry.response)) candidate.confidence = 'HIGH';
  change(entry.response);
  redis.store.set(key, JSON.stringify(entry));
  return entry;
}

test('an otherwise valid answer cached with HIGH on an unconfirmed model is served with MEDIUM, spending no provider call, no credit and no budget', async () => {
  const world = await seed();
  const old = storeOldAnswer(world);
  assert.ok(candidates(old.response).every((c) => c.confidence === 'HIGH' && c.modelStatus !== 'VERIFIED_LISTING'), 'the stored answer is pre-cap');
  const before = counts(world);
  const ttlBefore = world.redis.ttls.get(world.key);
  const setsBefore = world.redis.calls.filter((call) => call[0] === 'set').length;
  const second = await ask(world.handler);
  assert.equal(second.statusCode, 200);
  assert.equal(second.body.meta.cached, true);
  assert.ok(candidates(second.body).every((c) => c.confidence === 'MEDIUM'), 'no unsupported HIGH is ever served');
  assert.equal(isValidResearchResponseV2({ ...second.body, meta: { ...second.body.meta } }), true);
  assert.deepEqual(counts(world), before, 'no Gemini, no Serper, no credit, no budget');
  assert.equal(world.redis.ttls.get(world.key), ttlBefore, 'the expiry stands');
  assert.equal(world.redis.calls.filter((call) => call[0] === 'set').length, setsBefore, 'nothing is rewritten in the store');
  // Everything but the label is what was cached: the lowering changes no price, status, standing, evidence or identification.
  const strip = (body) => { const copy = clone(body); for (const c of candidates(copy)) delete c.confidence; delete copy.meta; return copy; };
  assert.deepEqual(strip(second.body), strip(old.response));
  assert.equal(second.body.original.confidence, old.response.original.confidence, 'the identification of the original is its own statement');
});

test('an answer that is invalid for any reason other than that label is still a miss, and is researched again', async () => {
  const world = await seed();
  const forgeries = {
    'a model claimed verified with no page behind it': (response) => { response.successor.modelStatus = 'VERIFIED_LISTING'; },
    'an edited valuation': (response) => { response.pricing.valuation.confidence = 'HIGH'; },
    'an added source link': (response) => { response.original.manufacturerPages = [{ url: 'https://example.com/x', domain: 'example.com', sourceName: 'X', sourceClass: 'MANUFACTURER', model: 'ABC12345', pageKind: 'PRODUCT', title: null, foundVia: 'SEARCH_RESULT' }]; },
    'a standing that the evidence does not support': (response) => { response.successor.standing = 'RECOMMENDED'; },
  };
  for (const [label, change] of Object.entries(forgeries)) {
    storeOldAnswer(world, change);
    const gemini = world.fetchImpl.calls.gemini.length;
    const out = await ask(world.handler);
    assert.equal(out.body.meta.cached, false, label);
    assert.equal(world.fetchImpl.calls.gemini.length, gemini + 1, `${label}: researched again`);
    assert.ok(candidates(out.body).every((c) => c.confidence !== 'HIGH' || c.modelStatus === 'VERIFIED_LISTING'), label);
  }
});

test('lowerUnsupportedConfidence lowers only a HIGH candidate whose model is not page-confirmed, never mutates its input, and returns the same object when nothing applies', () => {
  const built = (query) => buildResearchResponseV2(fixtureResearch2For(query, '2026-10-22').input, { requestId: 'r', elapsedMs: 1, answerSource: 'AI_ESTIMATE', fixture: true, now: Date.UTC(2026, 9, 22, 12) });
  const confirmed = built('Samsung S90D 65');
  assert.equal(lowerUnsupportedConfidence(confirmed), confirmed, 'a page-confirmed HIGH is kept');
  const old = clone(built('LG C3 OLED TV'));
  old.successor.confidence = 'HIGH';
  const snapshot = JSON.stringify(old);
  const lowered = lowerUnsupportedConfidence(old);
  assert.equal(JSON.stringify(old), snapshot, 'the input is not mutated');
  assert.notEqual(lowered, old);
  assert.equal(lowered.successor.confidence, 'MEDIUM');
  assert.equal(lowered.successor.modelStatus, old.successor.modelStatus, 'the model status is never raised or changed');
  assert.equal(lowered.original.confidence, old.original.confidence);
  const medium = built('LG C3 OLED TV');
  assert.equal(lowerUnsupportedConfidence(medium), medium, 'nothing to lower');
  for (const bad of [null, 'x', 3, [], { successor: 5, suggestions: 'x' }]) assert.equal(lowerUnsupportedConfidence(bad), bad);
});

test('the cache applies it only to real AI answers of the served version, and a fixture-marked or other-version entry stays a miss', async () => {
  const built = clone(buildResearchResponseV2(fixtureResearch2For('LG C3 OLED TV', '2026-10-22').input, { requestId: 'r', elapsedMs: 1, answerSource: 'AI_ESTIMATE', fixture: true, now: Date.UTC(2026, 9, 22, 12) }));
  built.successor.confidence = 'HIGH';
  const key = researchCacheKey('lg c3 oled tv', { contractVersion: RESEARCH_CONTRACT_V2 });
  const store = (response, contractVersion = RESEARCH_CONTRACT_V2) => { const redis = createRedis(); redis.store.set(key, JSON.stringify({ key, contractVersion, response })); return redis; };
  assert.equal(await createResearchCache({ redis: store(built), contractVersion: RESEARCH_CONTRACT_V2, allowFixture: false }).read(key), null, 'a fixture-marked answer is never served by a real cache');
  const real = clone(built); delete real.meta.fixture;
  assert.equal((await createResearchCache({ redis: store(real), contractVersion: RESEARCH_CONTRACT_V2, allowFixture: false }).read(key)).successor.confidence, 'MEDIUM');
  const other = clone(real); other.meta.answerSource = 'GUIDANCE';
  assert.equal(await createResearchCache({ redis: store(other), contractVersion: RESEARCH_CONTRACT_V2, allowFixture: false }).read(key), null);
  assert.equal(await createResearchCache({ redis: store(real, 'research.1'), contractVersion: RESEARCH_CONTRACT_V2, allowFixture: false }).read(key), null);
});
