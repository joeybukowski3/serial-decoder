import test from 'node:test';
import assert from 'node:assert/strict';
import { createItemAssistResearchHandler } from '../../lib/itemassist-research/handler.js';
import { researchBudgetKey } from '../../lib/itemassist-research/budget.js';
import { researchCacheKey } from '../../lib/itemassist-research/cache.js';
import { RESEARCH_CONTRACT_V2, buildResearchResponseV2, isValidResearchResponseV2 } from '../../lib/itemassist-research/contract-v2.js';
import { createEnrichmentCache } from '../../lib/itemassist-research/enrich/cache.js';
import { ENGINE_DEADLINE_MS, keyedCandidates, researchLiveV2, shoppingQuery } from '../../lib/itemassist-research/enrich/orchestrate.js';
import { serperBudgetKey } from '../../lib/itemassist-research/enrich/serper-budget.js';
import { researchUsageKey } from '../../lib/itemassist-research/usage.js';
import { S1_ROWS, createRedis, geminiBody, jsonResponse, routedFetch } from '../helpers/itemassist-research-fakes.mjs';

// OFFLINE ONLY. Live research.2 end to end through the real handler, with Gemini and Serper answered from canned data (the S1 study's real
// Serper rows) and an in-memory store. No network, no provider, no real store.
const TOKEN = 'test-token-0123456789-abcdefghijkl';
const GEMINI_KEY = 'gemini-test-key-0123456789abcdef';
const SERPER_KEY = 'serper-test-key-0123456789abcdef';
const NOW = Date.UTC(2026, 9, 23, 12, 0, 0);
const ENV = Object.freeze({
  ITEMASSIST_RESEARCH_ENABLED: 'true', ITEMASSIST_REPLACEMENT_API_TOKEN: TOKEN, GEMINI_API_KEY: GEMINI_KEY, SERPER_API_KEY: SERPER_KEY, ITEMASSIST_RESEARCH_DAILY_CALL_LIMIT: '50',
  ITEMASSIST_RESEARCH_LIVE_CONTRACT: 'research.2', ITEMASSIST_RESEARCH_ENRICHMENT: 'on',
});
const LG_QUERY = 'LG C3 55 inch OLED';
const S90_QUERY = 'Samsung S90C 65 inch OLED';

const tv = (over = {}) => ({
  category: 'tv', profile: 'tv', tier: 'PREMIUM',
  original: { identity: 'LG C3 series 4K OLED smart TV', confidence: 'high', characteristics: ['OLED panel', '4K', '120 Hz'], uncertainty: null },
  requirements: [],
  successor: { name: 'LG C-series OLED, current generation', why: 'The next generation of the same line.', differences: 'Newer processor.', concern: null, confidence: 'high', comparison: [{ requirementKey: 'screenSize', status: 'MEETS' }, { requirementKey: 'displayClass', status: 'MEETS' }] },
  suggestions: [{ name: 'Sony Bravia 8 OLED', why: 'Similar tier with strong processing.', differences: 'Different platform.', confidence: 'medium' }],
  estimates: { originalNew: { low: 1700, high: 2300 }, replacementNew: { low: 900, high: 1600 } }, clarify: [], ...over,
});
const S90_REPLY = tv({
  original: { identity: 'Samsung S90C 65-inch QD-OLED smart TV', confidence: 'high', characteristics: ['QD-OLED panel', '4K', '144 Hz'], uncertainty: null },
  successor: { name: 'Samsung S90-series QD-OLED, current generation', why: 'The next generation of the same line.', differences: 'Brighter panel.', concern: null, confidence: 'high' },
  suggestions: [{ name: 'LG C-series OLED', why: 'Comparable premium OLED.', differences: 'Different platform.', confidence: 'medium' }],
});

const history = (id) => () => S1_ROWS.history[id];
const listings = (id, marker) => (query) => (query.includes(marker) ? S1_ROWS.listings[id].rows : []);
const lgFetch = (over = {}) => routedFetch({ gemini: tv(), history: history('lg-c3-55'), listings: listings('lg-c3-55', 'C-series'), ...over });

function createLogger() { const lines = []; return { lines, info: (line) => lines.push(String(line)), warn: (line) => lines.push(String(line)), error: (line) => lines.push(String(line)) }; }
const createRes = () => ({ statusCode: 200, body: null, headers: {}, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, setHeader(name, value) { this.headers[name] = value; } });
const createReq = (query = LG_QUERY) => ({ method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: { query } });

function build({ env = ENV, redis = createRedis(), fetchImpl = lgFetch(), logger = createLogger(), ...rest } = {}) {
  const handler = createItemAssistResearchHandler({ env, logger, now: () => NOW, redisFactory: async () => redis, requestIdFactory: () => 'req-1', fetchImpl, ...rest });
  return { handler, redis, fetchImpl, logger };
}
async function ask(handler, query = LG_QUERY) { const res = createRes(); await handler(createReq(query), res); return res; }
const usage = (redis) => redis.hashes.get(researchUsageKey(NOW)) || {};
const credits = (redis) => Number(redis.store.get(serperBudgetKey(NOW)) || 0);
const prices = (body, kind) => body.pricing.prices.filter((item) => !kind || item.kind === kind);

// ---- the LG C3 55" example ---------------------------------------------------------------------------------------------------------------

test('LG C3 55": a research.2 answer with listing prices from three recognised sellers, labelled as listings, and the C3\'s own price never invented', async () => {
  const { handler, fetchImpl, redis } = build();
  const res = await ask(handler);
  const body = res.body;
  assert.equal(res.statusCode, 200);
  assert.equal(isValidResearchResponseV2(body), true, 'the validator re-derives every typed block from the response itself');
  assert.deepEqual([body.contractVersion, body.status, body.meta.answerSource], [RESEARCH_CONTRACT_V2, 'OK', 'AI_ESTIMATE']);

  const current = prices(body, 'CURRENT_RETAIL_NEW').filter((item) => item.sizeConfirmed !== false);
  assert.deepEqual(current.map((item) => [item.candidate, item.amount.low, item.verification, item.asOf, item.asOfBasis]),
    [['SUCCESSOR', 999.99, 'SEARCH_LISTING', '2026-10-23', 'OBSERVED'], ['SUCCESSOR', 1096, 'SEARCH_LISTING', '2026-10-23', 'OBSERVED'], ['SUCCESSOR', 1449.99, 'SEARCH_LISTING', '2026-10-23', 'OBSERVED']]);
  assert.equal(current[0].model, 'OLED55C6PUA');
  assert.equal(body.pricing.prices.some((item) => item.verification === 'VERIFIED_PAGE'), false, 'nothing is page-confirmed: no page was fetched');

  const { valuation } = body.pricing;
  assert.deepEqual([valuation.method, valuation.basis, valuation.verified, valuation.confidence], ['PROVISIONAL_LISTINGS', 'PROVISIONAL_LISTINGS', false, 'MEDIUM']);
  assert.deepEqual(valuation.range, { currency: 'USD', low: 999.99, high: 1449.99 });
  assert.equal(valuation.asOf, '2026-10-23');
  assert.equal(valuation.reference, null, 'an AI estimate of the original is never the reference price');
  assert.equal(valuation.notes.some((note) => note.code === 'MSRP_CONTEXT_ONLY'), false);
  assert.deepEqual(valuation.excluded.map((entry) => [entry.candidate, entry.reason]), [['ALT_1', 'NO_CURRENT_PRICE']]);

  // The C3's launch price is not in the results (they belong to the G3, C5 or the whole lineup), so the original carries only a labelled estimate.
  assert.deepEqual(prices(body).filter((item) => item.subject === 'ORIGINAL').map((item) => [item.kind, item.amount.low, item.amount.high, item.verification, item.evidenceId]), [['AI_ESTIMATE', 1700, 2300, 'NONE', null]]);
  assert.deepEqual(body.pricing.tier, { level: 'PREMIUM', basis: 'AI_ESTIMATE' });

  // Listing evidence names the seller, never a product page: Shopping rows have no page of their own.
  assert.deepEqual(body.pricing.evidence.map((entry) => [entry.sourceName, entry.sourceClass, new URL(entry.sourceUrl).pathname, entry.observedAt, entry.modelRelation]),
    [['Best Buy', 'RETAILER', '/', '2026-10-23', 'UNKNOWN'], ['Newegg', 'RETAILER', '/', '2026-10-23', 'UNKNOWN'], ['Target', 'RETAILER', '/', '2026-10-23', 'UNKNOWN'], ['P.C. Richard & Son', 'RETAILER', '/', '2026-10-23', 'UNKNOWN']]);
  // Listings that state no screen size are shown as examples, marked as such; they are not comparables and do not move the range above.
  const examples = prices(body, 'CURRENT_RETAIL_NEW').filter((item) => item.sizeConfirmed === false);
  assert.ok(examples.length >= 1 && examples.length <= 2, 'at most the lowest and the highest unsized listing');
  assert.equal(examples.every((item) => item.verification === 'SEARCH_LISTING' && item.candidate === 'SUCCESSOR'), true);
  assert.equal(valuation.comparables.some((row) => examples.some((item) => item.id === row.priceId)), false);
  assert.equal(body.successor.modelStatus, 'FAMILY_LEVEL');

  // Budget: one identification, one dated search and two Shopping queries (the successor family and the first alternative).
  assert.equal(fetchImpl.calls.gemini.length, 1);
  assert.equal(fetchImpl.calls.search.length, 1);
  assert.deepEqual(fetchImpl.calls.shopping, ['LG C-series OLED 55 inch TV', 'Sony Bravia 8 OLED 55 inch TV']);
  assert.equal(fetchImpl.calls.other.length, 0);
  assert.equal(credits(redis), 5);
  assert.deepEqual([usage(redis).serper_calls, usage(redis).serper_credits, usage(redis).provider_calls], [3, 5, 1]);
  assert.equal(Number(redis.store.get(researchBudgetKey(NOW))), 1);
});

test('the answer, the log and the usage record never contain either API key, the query or a Shopping link', async () => {
  const logger = createLogger();
  const { handler, redis } = build({ logger });
  const res = await ask(handler);
  const everything = `${logger.lines.join('\n')}\n${JSON.stringify(res.body)}\n${JSON.stringify([...redis.hashes.entries()])}`;
  for (const secret of [GEMINI_KEY, SERPER_KEY, TOKEN, 'google.com/search', LG_QUERY]) assert.equal(everything.includes(secret), false, secret);
  const line = JSON.parse(logger.lines.find((entry) => entry.includes('"status":"OK"')));
  assert.deepEqual([line.serperCalls, line.serperCredits, line.enrichment.history, line.enrichment.listings], [3, 5, 'serper', { SUCCESSOR: 'serper', ALT_1: 'serper' }]);
});

test('Samsung S90C 65": dated history from the sources that name the S90C 65", conflicting prices preserved, and tier now backed by price evidence', async () => {
  const fetchImpl = routedFetch({ gemini: S90_REPLY, history: history('samsung-s90c-65'), listings: listings('samsung-s90c-65', 'S90') });
  const { handler } = build({ fetchImpl });
  const { body } = await ask(handler, S90_QUERY);
  assert.equal(isValidResearchResponseV2(body), true);
  const original = prices(body).filter((item) => item.subject === 'ORIGINAL');
  assert.deepEqual(original.map((item) => [item.kind, item.amount.low, item.asOf, item.asOfBasis, item.verification, item.model]),
    [['HISTORICAL_RETAIL', 2600, '2023-04-11', 'PUBLISHED', 'SEARCH_SNIPPET', 'QN65S90C'], ['HISTORICAL_RETAIL', 3299, '2025-05-14', 'PUBLISHED', 'SEARCH_SNIPPET', null]]);
  assert.deepEqual(body.pricing.tier, { level: 'PREMIUM', basis: 'MSRP_EVIDENCE' });
  assert.deepEqual(body.pricing.evidence.filter((entry) => entry.subject === 'ORIGINAL').map((entry) => [entry.sourceName, entry.publishedAt]), [['CNET', '2023-04-11'], ['PCMag', '2025-05-14']]);
  assert.equal(prices(body, 'AI_ESTIMATE').some((item) => item.subject === 'ORIGINAL'), false, 'no AI estimate beside source-backed history');
  // Every S90 row from a recognised seller is a protection-plan or mount package, another series, or states another size, so no listing sets a
  // price and the labelled band from the original's dated price is what remains.
  assert.equal(prices(body, 'CURRENT_RETAIL_NEW').filter((item) => item.sizeConfirmed !== false).length, 0);
  assert.equal(body.pricing.valuation.method, 'HISTORICAL_TIER_ESTIMATE');
  assert.ok(body.pricing.valuation.reference, 'the history anchors the band');
});

// ---- caching ---------------------------------------------------------------------------------------------------------------------------

test('a complete answer is cached for a day: the second ask spends no Gemini call, no Serper credit and no budget', async () => {
  const { handler, fetchImpl, redis } = build();
  const first = await ask(handler);
  const before = [fetchImpl.calls.gemini.length, fetchImpl.calls.search.length, fetchImpl.calls.shopping.length, credits(redis), Number(redis.store.get(researchBudgetKey(NOW)))];
  const second = await ask(handler);
  assert.equal(second.body.meta.cached, true);
  assert.deepEqual({ ...second.body, meta: { ...second.body.meta, cached: false, requestId: first.body.meta.requestId, elapsedMs: first.body.meta.elapsedMs } }, first.body);
  assert.deepEqual([fetchImpl.calls.gemini.length, fetchImpl.calls.search.length, fetchImpl.calls.shopping.length, credits(redis), Number(redis.store.get(researchBudgetKey(NOW)))], before);
  assert.equal(usage(redis).cache_hit, 1);
  assert.ok(redis.ttls.get(researchCacheKey(LG_QUERY, { contractVersion: RESEARCH_CONTRACT_V2 })) > 0);
});

test('an answer built while a Serper lookup failed is returned but not cached, so the next ask can do better', async () => {
  const fetchImpl = lgFetch({ serperStatus: 500 });
  const { handler, redis } = build({ fetchImpl });
  const first = await ask(handler);
  assert.equal(first.statusCode, 200);
  assert.equal(isValidResearchResponseV2(first.body), true);
  assert.equal(first.body.pricing.valuation.method, 'AI_ESTIMATE_ONLY', 'still a labelled estimate, never an invented price');
  assert.equal(prices(first.body).every((item) => item.kind === 'AI_ESTIMATE'), true);
  assert.equal(redis.store.has(researchCacheKey(LG_QUERY, { contractVersion: RESEARCH_CONTRACT_V2 })), false);
  await ask(handler);
  assert.equal(fetchImpl.calls.gemini.length, 2);
});

test('Serper rows are cached by query: a differently worded question that leads to the same lookups spends no Serper credit', async () => {
  const redis = createRedis();
  const first = build({ redis });
  await ask(first.handler);
  assert.equal(credits(redis), 5);
  // Same successor family and the same dated search text only if the user text matches, so ask the same words in another case; the answer cache key is the canonical query, so clear it.
  for (const key of [...redis.store.keys()]) if (key.startsWith('itemassist-research:answer:')) redis.store.delete(key);
  const second = build({ redis });
  await ask(second.handler, 'lg c3 55 INCH oled');
  assert.deepEqual([second.fetchImpl.calls.search.length, second.fetchImpl.calls.shopping.length, second.fetchImpl.calls.gemini.length], [0, 0, 1]);
  assert.equal(credits(redis), 5);
});

// ---- Serper is optional at every step ---------------------------------------------------------------------------------------------------

test('no Serper key: nothing is requested or reserved, and the answer is a labelled estimate', async () => {
  const { SERPER_API_KEY, ...env } = ENV;
  const { handler, fetchImpl, redis } = build({ env });
  const { body } = await ask(handler);
  assert.equal(isValidResearchResponseV2(body), true);
  assert.deepEqual([fetchImpl.calls.search.length, fetchImpl.calls.shopping.length, credits(redis)], [0, 0, 0]);
  assert.equal(body.pricing.valuation.method, 'AI_ESTIMATE_ONLY');
  assert.deepEqual(body.pricing.valuation.range, { currency: 'USD', low: 900, high: 1600 });
});

test('enrichment off: only the identification runs, and that answer is complete and cached', async () => {
  const { handler, fetchImpl, redis } = build({ env: { ...ENV, ITEMASSIST_RESEARCH_ENRICHMENT: 'off' } });
  const { body } = await ask(handler);
  assert.deepEqual([fetchImpl.calls.gemini.length, fetchImpl.calls.search.length, fetchImpl.calls.shopping.length], [1, 0, 0]);
  assert.equal(body.pricing.valuation.method, 'AI_ESTIMATE_ONLY');
  assert.equal(redis.store.has(researchCacheKey(LG_QUERY, { contractVersion: RESEARCH_CONTRACT_V2 })), true);
});

test('the Serper credit allowance is exhausted: no Serper request is made, the answer still arrives, and it is not cached', async () => {
  const redis = createRedis();
  redis.store.set(serperBudgetKey(NOW), 30);
  const { handler, fetchImpl } = build({ redis });
  const { body } = await ask(handler);
  assert.equal(isValidResearchResponseV2(body), true);
  assert.deepEqual([fetchImpl.calls.gemini.length, fetchImpl.calls.search.length, fetchImpl.calls.shopping.length, credits(redis)], [1, 0, 0, 30], 'the default allowance is 30 credits');
  assert.equal(redis.store.has(researchCacheKey(LG_QUERY, { contractVersion: RESEARCH_CONTRACT_V2 })), false);
});

test('the default allowance (30 credits) funds six full requests of at most 5 credits each, then no Serper request is made and no credit goes over 30', async () => {
  const redis = createRedis();
  // Each call names different families, so no Shopping query is served from the row cache and every request pays in full.
  const letters = 'ABCDEFGH';
  const gemini = (call) => jsonResponse(geminiBody(tv({
    successor: { name: `LG C-series OLED line ${letters[call - 1]}`, why: 'The next generation of the same line.', differences: 'Newer processor.', confidence: 'high' },
    suggestions: [{ name: `Sony Bravia ${letters[call - 1]} OLED`, why: 'Similar tier.', confidence: 'medium' }],
  })));
  const fetchImpl = routedFetch({ gemini, history: history('lg-c3-55'), listings: listings('lg-c3-55', 'C-series') });
  const { handler } = build({ redis, fetchImpl });
  const spent = [];
  for (let index = 0; index < 8; index += 1) {
    const before = credits(redis);
    await ask(handler, `${LG_QUERY} variant ${index}`);
    spent.push(credits(redis) - before);
  }
  assert.ok(spent.every((amount) => amount <= 5), `no request spends more than 5 credits: ${spent}`);
  assert.equal(credits(redis), 30);
  assert.equal(spent.slice(0, 6).every((amount) => amount === 5), true);
  assert.deepEqual(spent.slice(6), [0, 0], 'once the allowance is gone, answers still arrive without Serper');
  assert.equal(fetchImpl.calls.gemini.length, 8);
});

test('three candidates still cost at most 5 credits: one search and two Shopping queries, never a third', async () => {
  const reply = tv({ suggestions: [{ name: 'Sony Bravia 8 OLED', why: 'Similar tier.', confidence: 'medium' }, { name: 'Samsung S90-series QD-OLED', why: 'Comparable.', confidence: 'medium' }] });
  const fetchImpl = routedFetch({ gemini: reply, history: history('lg-c3-55'), listings: listings('lg-c3-55', 'C-series') });
  const { handler, redis } = build({ fetchImpl });
  await ask(handler);
  assert.deepEqual([fetchImpl.calls.search.length, fetchImpl.calls.shopping.length, credits(redis)], [1, 2, 5]);
});

test('the credit reservation fails closed: if the allowance store cannot be read or written, no Serper request is made at all', async () => {
  const { createSerperBudget } = await import('../../lib/itemassist-research/enrich/serper-budget.js');
  for (const broken of [null, createRedis({ failEval: true })]) {
    const { handler, fetchImpl } = build({ serperBudgetFactory: () => createSerperBudget({ redis: broken, now: () => NOW }) });
    const { body } = await ask(handler);
    assert.equal(isValidResearchResponseV2(body), true);
    assert.deepEqual([fetchImpl.calls.search.length, fetchImpl.calls.shopping.length], [0, 0]);
    assert.equal(body.pricing.valuation.method, 'AI_ESTIMATE_ONLY');
  }
});

test('a request that begins near the limit spends only what is left: 26 used leaves room for the search and one Shopping query, never more than 30', async () => {
  const redis = createRedis();
  redis.store.set(serperBudgetKey(NOW), 26);
  const { handler, fetchImpl } = build({ redis });
  const { body } = await ask(handler);
  assert.equal(isValidResearchResponseV2(body), true);
  assert.deepEqual([fetchImpl.calls.search.length, fetchImpl.calls.shopping.length, credits(redis)], [1, 1, 29]);
});

test('a small Serper allowance is never exceeded: the search takes 1 credit and a Shopping query 2, and a query that no longer fits is skipped', async () => {
  const redis = createRedis();
  const { handler, fetchImpl } = build({ redis, env: { ...ENV, ITEMASSIST_RESEARCH_DAILY_SERPER_CREDIT_LIMIT: '4' } });
  const { body } = await ask(handler);
  assert.equal(isValidResearchResponseV2(body), true);
  assert.equal(fetchImpl.calls.search.length + fetchImpl.calls.shopping.length, 2, 'search (1) + one Shopping query (2) fit in 4 credits; the second Shopping query (2) does not');
  assert.ok(credits(redis) <= 4);
});

test('Gemini budget exhausted: the call is refused before any Gemini or Serper request', async () => {
  const redis = createRedis();
  redis.store.set(researchBudgetKey(NOW), 50);
  const { handler, fetchImpl } = build({ redis });
  const res = await ask(handler);
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.errorCode, 'BUDGET_EXHAUSTED');
  assert.deepEqual([fetchImpl.calls.gemini.length, fetchImpl.calls.search.length, fetchImpl.calls.shopping.length], [0, 0, 0]);
});

test('Gemini fails: the product is recognised from the results the parallel search returned, not reported as unknown; not cached; one Serper credit spent', async () => {
  const fetchImpl = lgFetch({ gemini: () => jsonResponse({}, 503) });
  const { handler, redis } = build({ fetchImpl });
  const res = await ask(handler);
  assert.equal(res.statusCode, 200);
  assert.equal(isValidResearchResponseV2(res.body), true);
  // The request failed at the provider, so it is reported as that: PROVIDER_UNAVAILABLE and never PRODUCT_NOT_IDENTIFIED. The sites agree it is a real
  // product, so it is named at low confidence, with no replacement, no specification and no price.
  assert.deepEqual([res.body.status, res.body.meta.answerSource, res.body.warnings.includes('PROVIDER_UNAVAILABLE'), res.body.warnings.includes('PRODUCT_NOT_IDENTIFIED')], ['PARTIAL', 'CATEGORY_GUIDANCE', true, false]);
  assert.deepEqual([res.body.original.confidence, res.body.successor, res.body.suggestions, res.body.pricing.prices], ['LOW', null, [], []]);
  assert.match(res.body.original.identity, /^LG C3/);
  assert.deepEqual([fetchImpl.calls.shopping.length, credits(redis)], [0, 1]);
  assert.equal(redis.store.has(researchCacheKey(LG_QUERY, { contractVersion: RESEARCH_CONTRACT_V2 })), false);
});

test('Gemini fails and the results do not agree on the name: guidance only, still reported as a provider failure and not as an unknown product', async () => {
  const fetchImpl = lgFetch({ gemini: () => jsonResponse({}, 503) });
  const { handler } = build({ fetchImpl });
  const res = await ask(handler, 'quasar widget frobnicator 9000');
  assert.equal(isValidResearchResponseV2(res.body), true);
  assert.deepEqual([res.body.status, res.body.original.identity, res.body.warnings.includes('PROVIDER_UNAVAILABLE'), res.body.warnings.includes('PRODUCT_NOT_IDENTIFIED')], ['GUIDANCE_ONLY', null, true, false]);
});

test('an item the model cannot identify gets guidance and no prices at all', async () => {
  const fetchImpl = lgFetch({ gemini: tv({ original: { identity: null, confidence: 'low' }, successor: null, suggestions: [] }) });
  const { handler, fetchImpl: used } = build({ fetchImpl });
  const { body } = await ask(handler, 'something I cannot describe');
  assert.equal(isValidResearchResponseV2(body), true);
  assert.deepEqual([body.status, body.pricing.prices, body.pricing.evidence], ['GUIDANCE_ONLY', [], []]);
  assert.equal(used.calls.shopping.length, 0);
});

// ---- the contract's own limits still hold -----------------------------------------------------------------------------------------------

test('a candidate with a suspected essential shortfall does not set the range, however cheap its listings', async () => {
  const reply = tv({ suggestions: [{ name: 'LG C-series OLED budget line', why: 'A cheaper line.', confidence: 'medium', comparison: [{ requirementKey: 'displayClass', status: 'SHORTFALL' }] }],
    successor: { name: 'Sony Bravia 8 OLED', why: 'Similar tier.', confidence: 'medium' } });
  const fetchImpl = routedFetch({ gemini: reply, history: history('lg-c3-55'), listings: listings('lg-c3-55', 'C-series') });
  const { handler } = build({ fetchImpl });
  const { body } = await ask(handler);
  assert.equal(isValidResearchResponseV2(body), true);
  assert.ok(body.pricing.valuation.excluded.some((entry) => entry.candidate === 'ALT_1' && entry.reason === 'SUSPECTED_ESSENTIAL_SHORTFALL'));
  assert.equal(body.pricing.valuation.comparables.some((entry) => entry.candidate === 'ALT_1'), false);
  assert.ok(body.warnings.includes('CANDIDATE_EXCLUDED_ESSENTIAL'));
});

test('a model reply cannot smuggle a price, link or retailer claim into the answer text', async () => {
  const reply = tv({ successor: { name: 'LG C-series OLED', why: 'Currently $999 at Best Buy, in stock at https://example.com', differences: 'Newer processor.', confidence: 'high' } });
  const { handler } = build({ fetchImpl: routedFetch({ gemini: reply, history: history('lg-c3-55'), listings: listings('lg-c3-55', 'C-series') }) });
  const { body } = await ask(handler);
  assert.equal(isValidResearchResponseV2(body), true);
  assert.equal(body.successor, null, 'the candidate whose reason carried the claim is withheld');
  assert.ok(body.warnings.includes('UNSAFE_CLAIMS_REMOVED'));
});

test('research.2 is opt-in on the live route: without the flag the route still answers research.1 and makes no Serper request', async () => {
  const { ITEMASSIST_RESEARCH_LIVE_CONTRACT, ...env } = ENV;
  const v1Reply = { category: 'tv', original: { identity: 'LG C3 series 4K OLED smart TV', confidence: 'high', characteristics: ['OLED'], uncertainty: null }, requirements: ['Same size', 'OLED', '4K', 'HDMI 2.1'],
    successor: { name: 'LG C-series OLED', why: 'Direct successor line.', differences: 'Newer processor.', concern: null, confidence: 'high' }, suggestions: [], clarify: [] };
  const fetchImpl = routedFetch({ gemini: v1Reply });
  const { handler } = build({ env, fetchImpl });
  const { body } = await ask(handler);
  assert.equal(body.contractVersion, 'research.1');
  assert.deepEqual([fetchImpl.calls.search.length, fetchImpl.calls.shopping.length], [0, 0]);
});

test('a forged cache entry that claims page verification is refused on read', async () => {
  const redis = createRedis();
  const first = build({ redis });
  await ask(first.handler);
  const key = researchCacheKey(LG_QUERY, { contractVersion: RESEARCH_CONTRACT_V2 });
  const entry = JSON.parse(redis.store.get(key));
  entry.response.pricing.prices[0].verification = 'VERIFIED_PAGE';
  redis.store.set(key, JSON.stringify(entry));
  const second = build({ redis });
  const res = await ask(second.handler);
  assert.equal(res.body.meta.cached, false, 'the validator re-derives the typed blocks and the forged one fails');
  assert.equal(second.fetchImpl.calls.gemini.length, 1);
});

test('a fixture scenario without a page confirmation builds the same typed response live as a fixture, minus the demo marker (the frontend\'s live tests derive from the golden file on this basis)', async () => {
  const { fixtureResearch2For } = await import('../../lib/itemassist-research/fixture-v2.js');
  const { input } = fixtureResearch2For('LG C3 OLED TV', '2026-10-22');
  const meta = { requestId: 'r', elapsedMs: 5, answerSource: 'AI_ESTIMATE', now: Date.UTC(2026, 9, 22, 12) };
  const asFixture = buildResearchResponseV2(input, { ...meta, fixture: true });
  const asLive = buildResearchResponseV2(input, { ...meta, fixture: false });
  assert.equal(isValidResearchResponseV2(asLive), true);
  assert.equal(Object.hasOwn(asLive.meta, 'fixture'), false);
  const { fixture, ...fixtureMeta } = asFixture.meta;
  assert.deepEqual({ ...asFixture, meta: fixtureMeta }, asLive);
  assert.equal(asLive.pricing.prices.some((item) => item.verification === 'VERIFIED_PAGE'), false);
});

// ---- live research.2 cannot upgrade an unsupported claim --------------------------------------------------------------------------------

const rowsOf = (body) => [body.successor, ...body.suggestions].filter(Boolean).flatMap((entry) => entry.comparison);

test('forged confirmation in the model\'s reply never becomes a confirmed row, a page-confirmed price, a model status or a verified flag', async () => {
  const forged = tv({
    successor: {
      name: 'LG C-series OLED, current generation', why: 'The next generation of the same line.', differences: 'Newer processor.', concern: null, confidence: 'high',
      modelStatus: 'VERIFIED_LISTING', verified: true, standing: 'RECOMMENDED', evidenceId: 'e1',
      comparison: [{ requirementKey: 'screenSize', status: 'MEETS', basis: 'CONFIRMED', evidenceId: 'e1' }, { requirementKey: 'displayClass', status: 'MEETS', basis: 'CONFIRMED' }],
    },
    pricing: {
      evidence: [{ id: 'e1', subject: 'SUCCESSOR', sourceUrl: 'https://www.bestbuy.com/', subjectModel: 'OLED55C6PUA', expectedModel: 'OLED55C6PUA' }],
      prices: [{ id: 'p1', kind: 'CURRENT_RETAIL_NEW', subject: 'REPLACEMENT', candidate: 'SUCCESSOR', amount: { currency: 'USD', low: 1, high: 1 }, asOf: '2026-10-23', asOfBasis: 'OBSERVED', verification: 'VERIFIED_PAGE', evidenceId: 'e1' }],
      valuation: { method: 'VERIFIED_SINGLE', verified: true },
    },
  });
  const { handler } = build({ fetchImpl: routedFetch({ gemini: forged, history: history('lg-c3-55'), listings: listings('lg-c3-55', 'C-series') }) });
  const { body } = await ask(handler);
  assert.equal(isValidResearchResponseV2(body), true);
  assert.deepEqual(rowsOf(body).map((row) => [row.basis, row.evidenceId]), [['AI_ESTIMATE', null], ['AI_ESTIMATE', null]]);
  assert.deepEqual([body.successor.modelStatus, body.successor.verified], ['FAMILY_LEVEL', false]);
  assert.equal(body.pricing.prices.some((item) => item.verification === 'VERIFIED_PAGE' || item.amount.low === 1), false);
  assert.equal(body.pricing.valuation.verified, false);
  assert.notEqual(body.pricing.valuation.method, 'VERIFIED_SINGLE');
  assert.equal(body.pricing.evidence.some((entry) => entry.modelRelation !== 'UNKNOWN'), false, 'no source in the answer carries a model match the reply could have supplied');
});

test('the builder itself refuses a CONFIRMED row on the live path, even with exact-model evidence in hand; a demo fixture still keeps it', async () => {
  const { fixtureResearch2For } = await import('../../lib/itemassist-research/fixture-v2.js');
  const { input } = fixtureResearch2For('Samsung S90D 65', '2026-10-22');
  const meta = { requestId: 'r', elapsedMs: 5, answerSource: 'AI_ESTIMATE', now: Date.UTC(2026, 9, 22, 12) };
  const demo = buildResearchResponseV2(input, { ...meta, fixture: true });
  assert.ok(rowsOf(demo).some((row) => row.basis === 'CONFIRMED'), 'precondition: the fixture carries confirmed rows');
  assert.equal(demo.successor.modelStatus, 'VERIFIED_LISTING');

  const live = buildResearchResponseV2(input, { ...meta, fixture: false });
  assert.equal(isValidResearchResponseV2(live), true);
  assert.equal(rowsOf(live).some((row) => row.basis === 'CONFIRMED' || row.evidenceId !== null), false);
  assert.notEqual(live.successor.modelStatus, 'VERIFIED_LISTING');
  assert.equal(live.pricing.prices.some((item) => item.verification === 'VERIFIED_PAGE'), false);
  assert.ok(live.pricing.rejections.some((row) => row.scope === 'COMPARISON' && row.reason === 'COMPARISON_NOT_CONFIRMED' && row.action === 'DOWNGRADED'));
  assert.ok(live.pricing.evidence.every((entry) => live.pricing.prices.some((item) => item.evidenceId === entry.id)), 'evidence only a downgraded row cited is dropped');
});

test('the validator refuses a research.2 response with a CONFIRMED row unless it is a demo fixture, and a cached forgery is a miss', async () => {
  const { fixtureResearch2For } = await import('../../lib/itemassist-research/fixture-v2.js');
  const { input } = fixtureResearch2For('Samsung S90D 65', '2026-10-22');
  const demo = buildResearchResponseV2(input, { requestId: 'r', elapsedMs: 5, answerSource: 'AI_ESTIMATE', now: Date.UTC(2026, 9, 22, 12), fixture: true });
  assert.equal(isValidResearchResponseV2(demo, { allowFixture: true }), true);
  const stripped = JSON.parse(JSON.stringify(demo));
  delete stripped.meta.fixture;
  assert.equal(isValidResearchResponseV2(stripped), false, 'the same content with the demo marker removed is a live claim');
  assert.equal(isValidResearchResponseV2(stripped, { allowFixture: true }), false, 'allowing fixtures does not help without the marker');
  assert.equal(isValidResearchResponseV2(demo), false, 'and a marked demo is not valid live');

  const redis = createRedis();
  const key = researchCacheKey(LG_QUERY, { contractVersion: RESEARCH_CONTRACT_V2 });
  redis.store.set(key, JSON.stringify({ key, contractVersion: RESEARCH_CONTRACT_V2, response: stripped }));
  const { handler, fetchImpl } = build({ redis });
  const res = await ask(handler);
  assert.equal(res.body.meta.cached, false);
  assert.equal(fetchImpl.calls.gemini.length, 1);
  assert.equal(rowsOf(res.body).some((row) => row.basis === 'CONFIRMED'), false);
});

// ---- the orchestrator on its own -------------------------------------------------------------------------------------------------------

const deps = (over = {}) => ({
  env: { GEMINI_API_KEY: GEMINI_KEY, SERPER_API_KEY: SERPER_KEY }, now: () => NOW, fetchImpl: lgFetch(), serperBudget: { reserve: async (n) => ({ allowed: true, status: 'allowed', credits: n }), release: async () => true },
  enrichCache: createEnrichmentCache({ redis: createRedis() }), ...over,
});

test('keys follow the builder: the first two candidates that survive the claim filter, successor first', () => {
  const input = { successor: { name: 'LG C-series OLED', why: 'fine' }, suggestions: [{ name: 'Sony A', why: 'Currently $99 at Best Buy' }, { name: 'Sony B', why: 'fine' }, { name: 'Sony C', why: 'fine' }, { name: 'Sony D', why: 'fine' }] };
  assert.deepEqual(keyedCandidates(input).map(([key, entry]) => [key, entry.name]), [['SUCCESSOR', 'LG C-series OLED'], ['ALT_1', 'Sony B'], ['ALT_2', 'Sony C']]);
  assert.deepEqual(keyedCandidates({ successor: null, suggestions: [{ name: 'Sony B', why: 'fine' }] }).map(([key]) => key), ['ALT_1']);
});

test('the Shopping query is the family, the size the user asked about and the product noun, without trailing detail', () => {
  assert.equal(shoppingQuery({ name: 'LG C-series OLED, current generation' }, { category: 'tv', profile: 'tv', spec: { kind: 'inches', value: 55 } }), 'LG C-series OLED 55 inch TV');
  assert.equal(shoppingQuery({ name: 'Samsung Bespoke 4-Door French Door refrigerator' }, { category: 'appliance', profile: 'refrigerator', spec: { kind: 'capacity', value: 28 } }), 'Samsung Bespoke 4-Door French Door refrigerator 28 cu ft');
  assert.equal(shoppingQuery({ name: 'Bosch 500 Series (2024)' }, { category: 'appliance', profile: 'dishwasher', spec: null }), 'Bosch 500 Series dishwasher');
});

test('cached rows mean zero Serper requests and zero credits', async () => {
  const cache = createEnrichmentCache({ redis: createRedis() });
  await cache.write('history', `${LG_QUERY} launch price MSRP`, [...S1_ROWS.history['lg-c3-55']]);
  await cache.write('listings', 'LG C-series OLED 55 inch TV', S1_ROWS.listings['lg-c3-55'].rows);
  await cache.write('listings', 'Sony Bravia 8 OLED 55 inch TV', []);
  const fetchImpl = lgFetch();
  const result = await researchLiveV2(LG_QUERY, deps({ fetchImpl, enrichCache: cache }));
  assert.deepEqual([fetchImpl.calls.search.length, fetchImpl.calls.shopping.length, result.meta.serperCalls, result.meta.serperCredits, result.meta.cacheable], [0, 0, 0, 0, true]);
  assert.equal(result.input.pricing.prices.filter((item) => item.kind === 'CURRENT_RETAIL_NEW' && item.sizeConfirmed !== false).length, 3);
});

test('the deadline: when the time left after the identification is too short, Shopping is skipped (and the answer is not cacheable) but nothing else is lost', async () => {
  let clock = NOW;
  const fetchImpl = lgFetch({ gemini: () => { clock += ENGINE_DEADLINE_MS - 500; return jsonResponse(geminiBody(tv())); } });
  const result = await researchLiveV2(LG_QUERY, deps({ fetchImpl, now: () => clock }));
  assert.deepEqual([fetchImpl.calls.shopping.length, result.meta.enrichment.listings, result.meta.cacheable], [0, { SUCCESSOR: 'deadline', ALT_1: 'deadline' }, false]);
  const built = buildResearchResponseV2(result.input, { requestId: 'r', elapsedMs: 1, answerSource: 'AI_ESTIMATE', now: clock });
  assert.equal(isValidResearchResponseV2(built), true);
  assert.equal(built.pricing.valuation.method, 'AI_ESTIMATE_ONLY');
});

test('a Shopping failure for one candidate leaves the other candidate\'s prices intact', async () => {
  const fetchImpl = routedFetch({ gemini: tv({ suggestions: [{ name: 'Samsung S90-series QD-OLED', why: 'Comparable.', confidence: 'medium' }] }), history: history('lg-c3-55'),
    listings: (query) => { if (query.includes('S90')) throw new Error('boom'); return S1_ROWS.listings['lg-c3-55'].rows; } });
  const failing = async (url, init) => { try { return await fetchImpl(url, init); } catch { return jsonResponse({}, 500); } };
  failing.calls = fetchImpl.calls;
  const result = await researchLiveV2(LG_QUERY, deps({ fetchImpl: failing }));
  assert.equal(result.input.pricing.prices.filter((item) => item.kind === 'CURRENT_RETAIL_NEW' && item.candidate === 'SUCCESSOR' && item.sizeConfirmed !== false).length, 3);
  assert.equal(result.meta.enrichment.listings.ALT_1, 'SERPER_HTTP_500');
  assert.equal(result.meta.cacheable, false);
});
