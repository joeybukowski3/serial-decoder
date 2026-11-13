import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { researchLiveV2 } from '../../lib/itemassist-research/enrich/orchestrate.js';
import { normalizeIdentification } from '../../lib/itemassist-research/enrich/identify.js';
import { buildSpecComparison, withoutModelIdentifiers } from '../../lib/itemassist-research/enrich/spec-compare.js';
import { observationDiagnostics } from '../../lib/itemassist-research/enrich/observation-diagnostics.js';
import { createItemAssistResearchHandler } from '../../lib/itemassist-research/handler.js';
import { createResearchCache, researchCacheKey } from '../../lib/itemassist-research/cache.js';
import { buildResearchResponseV2, isValidResearchResponseV2 } from '../../lib/itemassist-research/contract-v2.js';
import { S1_ROWS, createRedis, routedFetch } from '../helpers/itemassist-research-fakes.mjs';

// OFFLINE ONLY. Release 2.1 corrections, from the fresh Production canary for "LG OLED55C3PUA":
//   1. an attribute read from a model identifier is not "what the person said";
//   2. no present-day listing is compared with a different model's historical list price;
//   3. internal, bounded counters say why a `modelObservations` block is or is not emitted, and never reach the public answer.
// Saved Serper rows and mocked replies only: no network, no provider, no real store.
const FX = (file) => JSON.parse(readFileSync(new URL(`../fixtures/itemassist-research/${file}`, import.meta.url), 'utf8'));
const CPB = FX('checkpoint-b-lg-c3.json');
const NOW = Date.UTC(2026, 10, 11, 15);
const REPLY = {
  category: 'tv', profile: 'tv', tier: 'PREMIUM', requirements: [],
  original: { identity: 'LG C3 series 55-inch 4K OLED evo smart TV (2023)', confidence: 'high', characteristics: ['55-inch OLED', '4K', '120 Hz'], uncertainty: null },
  successor: { name: 'LG C-series OLED', why: 'Continues the line.', differences: null, concern: null, confidence: 'high', comparison: [] },
  suggestions: [], estimates: { originalNew: { low: 1500, high: 2000 }, replacementNew: { low: 1200, high: 1800 } }, clarify: [],
};
const row = (title, seller, price) => ({ title, seller, price });
const BESTBUY = 'Best Buy', TARGET = 'Target';
const C3_PAGE = { url: 'https://www.lg.com/us/tvs/lg-oled55c3pua-oled-4k-tv', title: '55 inch Class LG OLED evo C3 4k Smart TV OLED55C3PUA' };
const CANDIDATE_ROWS = [{ title: 'LG C6 OLED evo 55" 4K Smart TV', size: 55 }];

async function run(history, listings, { query = 'LG C3 55-inch TV', reply = REPLY } = {}) {
  const result = await researchLiveV2(query, {
    env: { SERPER_API_KEY: 'k' }, now: () => NOW, enrichCache: null, enrich: true,
    identify: async (q) => ({ ok: true, ...normalizeIdentification(reply, q), meta: { requestSent: true, usage: {}, httpStatus: 200 } }),
    serper: async ({ kind }) => (kind === 'search' ? history : listings), serperBudget: { reserve: async (credits) => ({ allowed: true, status: 'allowed', credits }) },
  });
  const response = buildResearchResponseV2(result.input, { requestId: 'r', elapsedMs: 1, answerSource: 'AI_ESTIMATE', now: NOW });
  assert.equal(isValidResearchResponseV2(response), true);
  return { result, response, diagnostics: result.meta.enrichment.observations };
}

// ---- 1. what the person said -------------------------------------------------------------------------------------------------------------------------------------

const displayRow = (comparison) => comparison.rows.find((entry) => entry.attribute === 'DISPLAY_CLASS');
const sizeRow = (comparison) => comparison.rows.find((entry) => entry.attribute === 'SCREEN_SIZE');

test('a model identifier is not the person\'s description: "OLED" at the start of OLED55C3PUA is not "your description"', () => {
  const comparison = buildSpecComparison({ query: 'LG OLED55C3PUA', sizeInches: null, manufacturerPages: [C3_PAGE], specSources: { candidate: CANDIDATE_ROWS, original: [] } });
  assert.deepEqual(displayRow(comparison).original, { value: 'OLED', basis: 'MANUFACTURER_PAGE_TITLE', sources: 1 }, 'a page title that states OLED is the basis');
  assert.deepEqual(sizeRow(comparison).original, { value: '55-inch', basis: 'MANUFACTURER_PAGE_TITLE', sources: 1 });
  for (const entry of comparison.rows) assert.notEqual(entry.original?.basis, 'USER_STATED', entry.attribute);
});

test('with no page or listing of the original to read, an attribute that only the model identifier implies is "not established"', () => {
  const comparison = buildSpecComparison({ query: 'LG OLED55C3PUA', sizeInches: null, manufacturerPages: [], specSources: { candidate: CANDIDATE_ROWS, original: [] } });
  assert.equal(displayRow(comparison).original, null);
  assert.equal(displayRow(comparison).result, 'NOT_ESTABLISHED');
  assert.equal(sizeRow(comparison).original, null, 'the 55 inside the code is not a size the person gave');
  assert.equal(comparison.rows.some((entry) => entry.original?.basis === 'USER_STATED'), false);
});

test('what the person actually wrote is still their description, alongside a model code', () => {
  const described = buildSpecComparison({ query: 'my LG OLED TV OLED55C3PUA, 55-inch', sizeInches: 55, manufacturerPages: [], specSources: { candidate: CANDIDATE_ROWS, original: [] } });
  assert.deepEqual(displayRow(described).original, { value: 'OLED', basis: 'USER_STATED', sources: 1 });
  assert.deepEqual(sizeRow(described).original, { value: '55-inch', basis: 'USER_STATED', sources: 1 });
  const spaced = buildSpecComparison({ query: 'LG C3 OLED 55 inch 4K', sizeInches: 55, manufacturerPages: [], specSources: { candidate: CANDIDATE_ROWS, original: [] } });
  assert.equal(displayRow(spaced).original.basis, 'USER_STATED');
  assert.equal(spaced.rows.find((entry) => entry.attribute === 'RESOLUTION').original.basis, 'USER_STATED');
});

test('other makers\' identifiers are not read either (a Samsung code states no display class or size)', () => {
  const comparison = buildSpecComparison({ query: 'Samsung QN65S90C', sizeInches: null, manufacturerPages: [], specSources: { candidate: [{ title: 'Samsung S95D 65" QD-OLED 4K', size: 65 }], original: [] } });
  assert.equal(comparison.rows.some((entry) => entry.original?.basis === 'USER_STATED'), false);
});

test('shorthand the person typed is still their description: only a full model identifier (letters after the digits) is removed', () => {
  for (const shorthand of ['my LG OLED55 TV', 'Samsung QLED55 TV', 'LG 4K120Hz OLED65', 'UHD65 tv']) assert.equal(withoutModelIdentifiers(shorthand), shorthand, shorthand);
  for (const identifier of ['OLED55C3PUA', 'oled55c3pua', 'QN65S90C', 'UN55CU7000', 'LG OLED77G3PUA']) assert.equal(/\d/.test(withoutModelIdentifiers(identifier).replace(/^LG /, '')), false, identifier);
  const typed = buildSpecComparison({ query: 'my LG OLED55 TV', sizeInches: null, manufacturerPages: [], specSources: { candidate: CANDIDATE_ROWS, original: [] } });
  assert.deepEqual(displayRow(typed).original, { value: 'OLED', basis: 'USER_STATED', sources: 1 });
});

// ---- 2. historical list price ---------------------------------------------------------------------------------------------------------------------------------------

test("a present-day listing is never compared with the original's historical list price; the list price stays separately dated context", async () => {
  // The canary shape: a 2023 list price for the original in the search results, a present-day listing of the newer generation.
  const { response } = await run(CPB.history, S1_ROWS.listings['lg-c3-55'].rows);
  const codes = response.pricing.valuation.notes.map((note) => note.code);
  assert.equal(response.pricing.prices.some((entry) => entry.subject === 'ORIGINAL' && ['HISTORICAL_RETAIL', 'MSRP'].includes(entry.kind)), true, 'the dated historical price is still carried');
  assert.equal(codes.includes('MSRP_CONTEXT_ONLY'), true, 'and is still labelled as context that sets no range');
  assert.equal(codes.includes('CURRENT_BELOW_ORIGINAL'), false, 'no cross-model, cross-year percentage');
  assert.equal(JSON.stringify(response.pricing.valuation).includes('"ratio"'), false);
  assert.deepEqual(response.pricing.valuation.range, { currency: 'USD', low: 999.99, high: 999.99 }, 'the range is unchanged by the list price');
});

// ---- 3. diagnostics ------------------------------------------------------------------------------------------------------------------------------------------------

const COUNTER_KEYS = ['rowsConsidered', 'sellersRecognised', 'rowsOfSeries', 'rowsObservable', 'rowsOfPresentedGeneration', 'rowsWithCodeToken', 'identifiersRecognised', 'accessoryRowsSkipped', 'observationsRetained'];
const EXCLUSION_KEYS = ['PROTECTION_PLAN', 'BUNDLE', 'NOT_USED_IN_PRICE', 'CONFLICTING_CODES'];

function assertWellFormed(counters) {
  assert.deepEqual(Object.keys(counters).sort(), [...COUNTER_KEYS, 'conflict', 'observationsExcluded'].sort(), 'a fixed, bounded set of fields');
  for (const key of COUNTER_KEYS) assert.equal(Number.isInteger(counters[key]) && counters[key] >= 0 && counters[key] <= 99, true, key);
  assert.deepEqual(Object.keys(counters.observationsExcluded).sort(), [...EXCLUSION_KEYS].sort());
  for (const key of EXCLUSION_KEYS) assert.equal(Number.isInteger(counters.observationsExcluded[key]), true, key);
  assert.equal(typeof counters.conflict, 'boolean');
  assert.equal(counters.rowsOfPresentedGeneration <= counters.rowsObservable && counters.rowsObservable <= counters.rowsOfSeries && counters.rowsObservable <= counters.sellersRecognised, true, 'each stage is a subset of the one before');
  assert.equal(counters.sellersRecognised <= counters.rowsConsidered && counters.rowsWithCodeToken <= counters.rowsConsidered, true);
}
const excluded = (counters) => Object.fromEntries(Object.entries(counters.observationsExcluded).filter(([, count]) => count > 0));

test('bundle-only listings: the code is recognised, retained as an excluded observation, and the counters say why', async () => {
  const { response, diagnostics } = await run(CPB.history, CPB.listings['LG C-series OLED 55 inch']);
  const counters = diagnostics.SUCCESSOR;
  assertWellFormed(counters);
  assert.equal(counters.rowsConsidered, CPB.listings['LG C-series OLED 55 inch'].length);
  assert.deepEqual([counters.observationsRetained, counters.identifiersRecognised, counters.conflict], [1, 1, false]);
  assert.deepEqual(excluded(counters), { PROTECTION_PLAN: 1 });
  assert.equal(counters.rowsWithCodeToken >= 2 && counters.rowsOfPresentedGeneration >= 2, true);
  assert.equal(response.successor.modelObservations.items.length, 1, 'the block the counters describe is the one emitted');
});

test('a clean exact-model listing: one priced observation, nothing excluded', async () => {
  const { response, diagnostics } = await run(S1_ROWS.history['lg-c3-55'], S1_ROWS.listings['lg-c3-55'].rows);
  const counters = diagnostics.SUCCESSOR;
  assertWellFormed(counters);
  assert.equal(counters.observationsRetained, 1);
  assert.equal(counters.identifiersRecognised >= counters.observationsRetained, true, 'identifiers are counted across every generation seen, observations only for the one presented');
  assert.deepEqual(excluded(counters), {});
  assert.equal(response.successor.modelObservations.items[0].status, 'PRICED_LISTING');
});

test('listings that state no model code (the canary case): generation rows are counted, no code is, and no block is emitted', async () => {
  const rows = [row('LG - 55" Class C6 Series OLED evo 4K UHD Smart webOS TV', TARGET, 1025), row('LG C6 OLED evo 55-Inch 4K Smart TV with webOS', BESTBUY, 1099.99), row('LG 55 inch Class C6 OLED evo 4K UHD Smart TV', 'P.C. Richard & Son', 999.99)];
  const { response, diagnostics } = await run(CPB.history, rows);
  const counters = diagnostics.SUCCESSOR;
  assertWellFormed(counters);
  assert.deepEqual([counters.rowsConsidered, counters.rowsWithCodeToken, counters.identifiersRecognised, counters.observationsRetained], [3, 0, 0, 0]);
  assert.equal(counters.rowsOfPresentedGeneration >= 1, true, 'the generation was seen, so the absence is "no code in any title", not "no rows"');
  assert.equal('modelObservations' in response.successor, false);
  assert.equal(response.successor.lineage.generation, 'C6');
});

test('conflicting codes: both are retained as observations, each counted as excluded for the conflict', async () => {
  const rows = [row('LG - 55" Class C6 Series OLED evo 4K UHD Smart webOS TV OLED55C6PUA', BESTBUY, 1299.99), row('LG 55 Inch Class C6 OLED evo 4K Smart TV OLED55C6AUA', TARGET, 1249.99)];
  const { response, diagnostics } = await run(CPB.history, rows);
  const counters = diagnostics.SUCCESSOR;
  assertWellFormed(counters);
  assert.deepEqual([counters.conflict, counters.identifiersRecognised, counters.observationsRetained], [true, 2, 2]);
  assert.deepEqual(excluded(counters), { CONFLICTING_CODES: 2 });
  assert.equal(response.successor.modelObservations.conflict, true);
});

test('no listings were retrieved: there are no counters to report, and nothing is invented', async () => {
  const { diagnostics } = await run(CPB.history, []);
  assert.equal(diagnostics?.SUCCESSOR?.rowsConsidered ?? 0, 0);
});

test('the counters carry numbers and fixed labels only: no listing title, seller, link, code or query', async () => {
  const { diagnostics } = await run(CPB.history, CPB.listings['LG C-series OLED 55 inch'], { query: 'LG C3 55-inch TV' });
  const text = JSON.stringify(diagnostics);
  for (const forbidden of ['OLED55C6PUA', 'Protection Plan', 'Best Buy', 'http', 'LG C3 55-inch TV', 'Amber']) assert.equal(text.includes(forbidden), false, forbidden);
});

// ---- the handler: the log carries the counters and the emitted flag; the public answer carries neither ------------------------------------------------------------

const TOKEN = 'test-token-0123456789-abcdefghijkl';
const ENV = Object.freeze({
  ITEMASSIST_RESEARCH_ENABLED: 'true', ITEMASSIST_REPLACEMENT_API_TOKEN: TOKEN, GEMINI_API_KEY: 'gemini-test-key-0123456789abcdef', SERPER_API_KEY: 'serper-test-key-0123456789abcdef',
  ITEMASSIST_RESEARCH_DAILY_CALL_LIMIT: '50', ITEMASSIST_RESEARCH_LIVE_CONTRACT: 'research.2', ITEMASSIST_RESEARCH_ENRICHMENT: 'on',
});
const createRes = () => ({ statusCode: 200, body: null, headers: {}, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, setHeader(name, value) { this.headers[name] = value; } });
// The production request shape: a successor and one alternative, so one search and two Shopping lookups.
const REPLY_WITH_ALTERNATIVE = { ...REPLY, suggestions: [{ name: 'Sony Bravia 8 OLED', why: 'Similar tier.', differences: 'Different platform.', confidence: 'medium' }] };
async function ask(listings, query = 'LG C3 55 inch OLED') {
  const lines = [];
  let calls = 0;
  const inner = routedFetch({ gemini: REPLY_WITH_ALTERNATIVE, history: () => CPB.history, listings: () => listings });
  const fetchImpl = async (...args) => { calls += 1; return inner(...args); };
  const handler = createItemAssistResearchHandler({ env: ENV, logger: { info: (line) => lines.push(String(line)) }, now: () => NOW, redisFactory: async () => createRedis(), requestIdFactory: () => 'req-1', fetchImpl });
  const res = createRes();
  await handler({ method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: { query } }, res);
  return { res, calls, line: JSON.parse(lines.find((entry) => entry.includes('"status":"OK"'))) };
}

test('the log line reports the counters and whether the block was emitted; the public response contains neither', async () => {
  const { res, line } = await ask(CPB.listings['LG C-series OLED 55 inch']);
  assert.equal(res.statusCode, 200);
  const counters = line.enrichment.observations.SUCCESSOR;
  assert.deepEqual([counters.observationsRetained, counters.emitted], [1, true]);
  assert.equal(Boolean(res.body.successor.modelObservations), true);
  const body = JSON.stringify(res.body);
  for (const internal of ['rowsConsidered', 'rowsWithCodeToken', 'identifiersRecognised', 'observationsRetained', 'observationsExcluded', 'emitted', 'enrichment']) assert.equal(body.includes(internal), false, internal);
});

test('an absent block is explained in the log: rows and generation seen, no code, emitted false', async () => {
  const { res, line } = await ask([row('LG - 55" Class C6 Series OLED evo 4K UHD Smart webOS TV', TARGET, 1025), row('LG C6 OLED evo 55-Inch 4K Smart TV with webOS', BESTBUY, 1099.99)]);
  const counters = line.enrichment.observations.SUCCESSOR;
  assert.deepEqual([counters.rowsConsidered, counters.rowsWithCodeToken, counters.observationsRetained, counters.emitted], [2, 0, 0, false]);
  assert.equal('modelObservations' in res.body.successor, false);
});

test('the log line holds no listing title, seller link, query or key, and provider usage is unchanged (one Gemini call, one search, two Shopping lookups)', async () => {
  const { line, calls } = await ask(CPB.listings['LG C-series OLED 55 inch']);
  const text = JSON.stringify(line);
  for (const forbidden of ['OLED55C6PUA', 'Protection Plan', 'Amber', 'LG C3 55 inch OLED', ENV.GEMINI_API_KEY, ENV.SERPER_API_KEY, TOKEN]) assert.equal(text.includes(forbidden), false, forbidden);
  assert.deepEqual([line.serperCalls, line.serperCredits, line.providerCalled], [3, 5, true]);
  assert.equal(calls, 4, '1 Gemini + 3 Serper requests, as before the counters existed');
});

// ---- answers cached by the Release 2 engine ------------------------------------------------------------------------------------------------------------------------
// The answer cache holds an answer for up to a day. One built by the Release 2 engine still carries CURRENT_BELOW_ORIGINAL, which this engine no longer produces, and the validator
// rebuilds the valuation from the prices and requires the notes to match. Without care, every such answer would become a cache miss (a fresh Gemini + Serper call) the moment this
// engine deploys. A real Release 2 engine answer is the fixture.
const LEGACY = FX('release-2-engine-answer-with-ratio-note.json');
const LEGACY_QUERY = 'LG C3 55 inch OLED';
const seedCache = async (redis) => {
  const key = researchCacheKey(LEGACY_QUERY, { contractVersion: 'research.2' });
  await redis.set(key, JSON.stringify({ key, contractVersion: 'research.2', response: LEGACY }), { ex: 86400 });
  return key;
};
const noteCodes = (response) => response.pricing.valuation.notes.map((note) => note.code);

test('the Release 2 engine answer in the fixture is real: it carries the retired note, and the unchanged range and prices', () => {
  assert.equal(noteCodes(LEGACY).includes('CURRENT_BELOW_ORIGINAL'), true);
  assert.equal(isValidResearchResponseV2(LEGACY), false, 'this engine alone would reject it (the reason a cached copy would be a miss)');
});

test('a cached Release 2 answer is served from the cache without the retired note, and nothing else about it changes', async () => {
  const redis = createRedis();
  const key = await seedCache(redis);
  const served = await createResearchCache({ redis, contractVersion: 'research.2' }).read(key);
  assert.ok(served, 'a hit, not a miss');
  assert.equal(isValidResearchResponseV2(served), true, 'the served copy passes the full validator');
  assert.deepEqual(noteCodes(served), noteCodes(LEGACY).filter((code) => code !== 'CURRENT_BELOW_ORIGINAL'));
  const { notes: _a, ...servedValuation } = served.pricing.valuation;
  const { notes: _b, ...storedValuation } = LEGACY.pricing.valuation;
  assert.deepEqual([servedValuation, served.pricing.prices, served.pricing.evidence, served.successor, served.suggestions], [storedValuation, LEGACY.pricing.prices, LEGACY.pricing.evidence, LEGACY.successor, LEGACY.suggestions], 'prices, range, evidence, confidence and model status are untouched');
  assert.equal(JSON.parse(redis.store.get(key)).response.pricing.valuation.notes.some((note) => note.code === 'CURRENT_BELOW_ORIGINAL'), true, 'the stored entry is not rewritten (its expiry stands)');
});

test('an invalid cached answer is still a miss: only the retired note is tolerated', async () => {
  const redis = createRedis();
  const broken = JSON.parse(JSON.stringify(LEGACY));
  broken.pricing.valuation.range.high = 1;
  const key = researchCacheKey(LEGACY_QUERY, { contractVersion: 'research.2' });
  await redis.set(key, JSON.stringify({ key, contractVersion: 'research.2', response: broken }), { ex: 86400 });
  assert.equal(await createResearchCache({ redis, contractVersion: 'research.2' }).read(key), null);
});

test('through the handler: the cached Release 2 answer is a hit, with no provider call and no provider budget used', async () => {
  const redis = createRedis();
  await seedCache(redis);
  let calls = 0;
  const lines = [];
  const handler = createItemAssistResearchHandler({ env: ENV, logger: { info: (line) => lines.push(String(line)) }, now: () => NOW, redisFactory: async () => redis, requestIdFactory: () => 'req-1', fetchImpl: async () => { calls += 1; throw new Error('no provider call is allowed'); } });
  const res = createRes();
  await handler({ method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: { query: LEGACY_QUERY } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual([res.body.meta.cached, calls], [true, 0]);
  assert.equal(noteCodes(res.body).includes('CURRENT_BELOW_ORIGINAL'), false);
  assert.deepEqual(res.body.pricing.valuation.range, LEGACY.pricing.valuation.range);
  assert.equal(lines.some((line) => line.includes('"cacheHit":true')), true);
});

test('a failure while counting can never fail the answer: the counters are simply absent', () => {
  assert.equal(observationDiagnostics({}), null);
  assert.equal(observationDiagnostics({ tally: null, seen: null, observedRows: [], observations: null, conflict: false }), null);
});
