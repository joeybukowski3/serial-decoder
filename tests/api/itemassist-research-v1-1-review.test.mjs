import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createItemAssistResearchHandler } from '../../lib/itemassist-research/handler.js';
import { RESEARCH_CACHE_PREFIX, researchCacheKey } from '../../lib/itemassist-research/cache.js';
import { buildResearchResponseV2, isValidResearchResponseV2 } from '../../lib/itemassist-research/contract-v2.js';
import { laptopLine, wantedConfig } from '../../lib/itemassist-research/enrich/config.js';
import { screenListings } from '../../lib/itemassist-research/enrich/listings.js';
import { buildValuation } from '../../lib/itemassist-research/pricing.js';
import { createRedis, geminiBody, jsonResponse, routedFetch } from '../helpers/itemassist-research-fakes.mjs';

// OFFLINE ONLY. V1.1 review checks: identity is not suitability, the spread rule runs only on listings already eligible, the provider-failure
// fallback claims nothing it does not have, the answer-cache bump touches nothing, and what is logged for a provider failure is only a fixed code
// and a status number.
const fixture = (name) => JSON.parse(readFileSync(new URL(`../fixtures/itemassist-research/${name}`, import.meta.url), 'utf8'));
const VIVO = fixture('v1-1-vivobook.json');
const WII = fixture('v1-1-wii.json');
const NOW = Date.parse('2026-10-30T11:53:40Z');
const row = (seller, price, title) => ({ seller, price, title });

// ---- identity is not suitability -------------------------------------------------------------------------------------------------------------

const FRIDGE = { name: 'Samsung French Door Refrigerator' };
const FRIDGE_CONTEXT = { category: 'refrigerator', spec: { kind: 'capacity', value: 27.8, atLeast: true }, focuses: [], layout: { kind: 'FRENCH_DOOR', doors: 4, settled: false }, width: null };

test('sellers agreeing that a model exists do not make it suitable: only listings that pass the size and layout screen count toward its code', () => {
  const named = (seller, price, size = '28 Cu. Ft.') => row(seller, price, `Samsung RF28R7351SR 4-Door French Door Refrigerator ${size}`);
  const both = screenListings([named('Walmart', 2499), named('Best Buy', 2599)], FRIDGE, FRIDGE_CONTEXT);
  assert.equal(both.sku, 'RF28R7351SR');
  assert.equal(both.items.every((item) => item.compatibilityOpen === true), true, 'the unresolved door count still travels with the price: the code is an identity, not a fit');
  // The same code at a seller whose listing states another size is another refrigerator: it is rejected before any code is counted.
  const other = screenListings([named('Walmart', 2499, '18.4 Cu. Ft.'), named('Best Buy', 2599)], FRIDGE, FRIDGE_CONTEXT);
  assert.equal(other.skipped.OTHER_SIZE, 1);
  assert.equal(other.sku, null, 'one eligible seller does not make a model');
  // A listing that states no size is never priced for a refrigerator, whoever names the code.
  const unsized = screenListings([row('Walmart', 2499, 'Samsung RF28R7351SR 4-Door French Door Refrigerator'), row('Best Buy', 2599, 'Samsung RF28R7351SR 4-Door French Door Refrigerator')], FRIDGE, FRIDGE_CONTEXT);
  assert.deepEqual([unsized.sku, unsized.items], [null, []]);
  // A listing of another door layout is rejected too.
  const layout = screenListings([row('Walmart', 2499, 'Samsung RF28R7351SR 4-Door Side-by-Side Refrigerator 28 Cu. Ft.'), named('Best Buy', 2599)], FRIDGE, FRIDGE_CONTEXT);
  assert.equal(layout.sku, null);
});

test('a candidate named by an exact code that falls short of an essential requirement is still left out of the value, and its code status says only "named in a listing"', () => {
  const input = {
    category: 'refrigerator', profile: 'refrigerator', original: { identity: 'Samsung RF28R7351SR french door refrigerator', confidence: 'high', characteristics: [], uncertainty: null }, requirements: [],
    successor: { name: 'Samsung RF28R7351SR', why: 'Named in retailer listings.', differences: null, concern: null, confidence: 'medium', standing: 'CONDITIONAL', comparison: [{ requirementKey: 'capacity', status: 'SHORTFALL' }] },
    suggestions: [], clarify: [], warnings: [],
    pricing: {
      referenceDate: '2026-10-30', tier: { level: 'UNKNOWN', basis: 'UNKNOWN' },
      evidence: [{ id: 'e1', subject: 'SUCCESSOR', sourceUrl: 'https://www.walmart.com/', observedAt: '2026-10-30', subjectModel: 'RF28R7351SR', expectedModel: 'RF28R7351SR' }],
      prices: [{ id: 'p1', kind: 'CURRENT_RETAIL_NEW', subject: 'REPLACEMENT', candidate: 'SUCCESSOR', model: 'RF28R7351SR', amount: { currency: 'USD', low: 2499, high: 2499 }, asOf: '2026-10-30', asOfBasis: 'OBSERVED', verification: 'SEARCH_LISTING', evidenceId: 'e1' }],
    },
  };
  const response = buildResearchResponseV2(input, { requestId: 'r', elapsedMs: 0, answerSource: 'AI_ESTIMATE', now: NOW });
  assert.equal(isValidResearchResponseV2(response), true);
  assert.equal(response.successor.modelStatus, 'LISTED_PROVISIONAL');
  assert.equal(response.successor.verified, false);
  assert.deepEqual(response.pricing.valuation.excluded, [{ candidate: 'SUCCESSOR', reason: 'SUSPECTED_ESSENTIAL_SHORTFALL' }]);
  assert.deepEqual([response.pricing.valuation.range, response.pricing.valuation.comparables], [null, []]);
  assert.equal(response.warnings.includes('CANDIDATE_EXCLUDED_ESSENTIAL'), true);
  assert.equal(response.successor.comparison.every((entry) => entry.basis === 'AI_ESTIMATE'), true, 'no requirement is marked confirmed because a code was found');
});

// ---- the spread rule runs only after eligibility ---------------------------------------------------------------------------------------------

const LAPTOP = { name: 'Asus VivoBook 15 Series' };
const laptopContext = (query) => ({ category: 'electronics', spec: null, focuses: [], config: { request: wantedConfig(query), line: laptopLine(LAPTOP.name) } });

test('ineligible listings can never bridge a gap: two eligible laptops $250 and $1,000 apart stay unusable however many other-configuration or other-line listings sit between them', () => {
  const rows = [
    row('Walmart', 250, 'Asus Vivobook 15 15.6" Core 5 120U 16GB 512GB SSD'), row('Costco', 1000, 'Asus Vivobook 15 15.6" Core 5 120U 16GB 512GB SSD'),
    row('Best Buy', 500, 'Asus Vivobook 15 15.6" Core 7 150U 16GB 512GB SSD'), row('Target', 520, 'Asus Vivobook 15 15.6" Core 5 120U 16GB 1TB SSD'), row('Newegg', 480, 'Asus Vivobook Go 15 15.6" Core 5 120U 16GB 512GB SSD'),
  ];
  const screened = screenListings(rows, LAPTOP, laptopContext('vivobook 15 i5 16gb 512gb'));
  assert.deepEqual(screened.items, [], 'the three listings in between are another configuration, another line and twice the storage');
  assert.deepEqual([screened.skipped.OTHER_CONFIGURATION, screened.skipped.OTHER_LINE, screened.skipped.PRICE_SPREAD], [2, 1, 2]);
});

test('in the valuation, a candidate with an essential shortfall and examples marked as unmatched take no part in forming a group', () => {
  const listing = (id, candidate, amount, extra = {}) => ({ id, kind: 'CURRENT_RETAIL_NEW', subject: 'REPLACEMENT', candidate, model: null, amount: { currency: 'USD', low: amount, high: amount }, asOf: '2026-10-30', asOfBasis: 'OBSERVED', verification: 'SEARCH_LISTING', evidenceId: 'e1', ...extra });
  const result = buildValuation({
    prices: [listing('p1', 'ALT_1', 250), listing('p2', 'ALT_1', 1000), listing('p3', 'SUCCESSOR', 500), listing('p4', 'ALT_1', 520, { configConfirmed: false }), listing('p5', 'ALT_1', 480, { sizeConfirmed: false })],
    requirements: [{ id: 'r1', importance: 'ESSENTIAL' }],
    candidates: [{ key: 'SUCCESSOR', comparison: [{ requirementId: 'r1', status: 'SHORTFALL', basis: 'CONFIRMED' }] }, { key: 'ALT_1', comparison: [] }],
    tier: { level: 'UNKNOWN', basis: 'UNKNOWN' }, profile: 'electronics', referenceDate: '2026-10-30',
  });
  assert.deepEqual([result.method, result.range, result.comparables], ['INSUFFICIENT', null, []]);
  assert.deepEqual(result.excluded, [{ candidate: 'SUCCESSOR', reason: 'CONFIRMED_ESSENTIAL_SHORTFALL' }]);
});

// ---- the provider-failure fallback ---------------------------------------------------------------------------------------------------------

const TOKEN = 'test-token-0123456789-abcdefghijkl';
const GEMINI_KEY = 'gemini-test-key-0123456789abcdef';
const ENV = Object.freeze({ ITEMASSIST_RESEARCH_ENABLED: 'true', ITEMASSIST_REPLACEMENT_API_TOKEN: TOKEN, GEMINI_API_KEY: GEMINI_KEY, SERPER_API_KEY: 'serper-test-key-0123456789abcdef', ITEMASSIST_RESEARCH_DAILY_CALL_LIMIT: '50', ITEMASSIST_RESEARCH_LIVE_CONTRACT: 'research.2', ITEMASSIST_RESEARCH_ENRICHMENT: 'on' });
async function ask(query, { gemini, history = () => WII.history, listings = () => [], redis = createRedis(), fetchImpl = routedFetch({ gemini, history, listings }) } = {}) {
  const lines = [];
  const handler = createItemAssistResearchHandler({ env: ENV, logger: { info: (line) => lines.push(String(line)) }, now: () => NOW, redisFactory: async () => redis, requestIdFactory: () => 'req-1', fetchImpl });
  const res = { statusCode: 200, body: null, headers: {}, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, setHeader() {} };
  await handler({ method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: { query } }, res);
  return { res, lines, redis, fetchImpl };
}

test('a name recognised while the provider failed claims no specification, no price, no source and no replacement search, and is never cached', async () => {
  const { res, redis } = await ask('nintendo wii', { gemini: () => jsonResponse({}, 503) });
  const body = res.body;
  assert.equal(isValidResearchResponseV2(body), true);
  assert.deepEqual([body.status, body.original.identity, body.original.confidence, body.meta.answerSource], ['PARTIAL', 'Nintendo Wii', 'LOW', 'CATEGORY_GUIDANCE']);
  assert.deepEqual([body.original.characteristics, body.successor, body.suggestions, body.clarify], [[], null, [], []]);
  assert.deepEqual([body.pricing.prices, body.pricing.evidence, body.pricing.valuation.range, body.pricing.valuation.method], [[], [], null, 'INSUFFICIENT']);
  assert.equal(body.pricing.tier.level, 'UNKNOWN');
  assert.deepEqual(body.warnings.filter((code) => ['PROVIDER_UNAVAILABLE', 'PRODUCT_NOT_IDENTIFIED'].includes(code)), ['PROVIDER_UNAVAILABLE']);
  assert.match(body.original.uncertainty, /did not finish/);
  assert.equal([...redis.store.keys()].some((key) => key.startsWith(RESEARCH_CACHE_PREFIX)), false, 'nothing is cached, so a retry gets a real answer');
  // The requirements are the standard criteria for the type of item, labelled as such; none comes from the model.
  assert.equal(body.requirementsSource, 'CATEGORY_GUIDANCE');
  assert.equal(body.requirements.every((item) => item.origin === 'CATEGORY_RULE'), true);
});

// ---- the answer cache version ------------------------------------------------------------------------------------------------------------------

test('the research answer cache moved to v2 without touching any entry: an old v1 entry is simply never read, nothing is deleted, and only this namespace changed', async () => {
  assert.equal(RESEARCH_CACHE_PREFIX, 'itemassist-research:answer:v2');
  const key = researchCacheKey('Asus vivobook 15', { contractVersion: 'research.2' });
  assert.match(key, /^itemassist-research:answer:v2:/);
  // A real answer, cached by a first run.
  const first = await ask('Asus vivobook 15', { gemini: () => jsonResponse(geminiBody(VIVO.identification)), history: () => VIVO.history, listings: () => [] });
  const cachedEntry = first.redis.store.get(key);
  assert.ok(cachedEntry, 'a successful answer is cached under the v2 key');
  // The same entry sitting under the v1 key (what V1 wrote) is not served.
  const redis = createRedis();
  const v1Key = key.replace(':answer:v2:', ':answer:v1:');
  redis.store.set(v1Key, cachedEntry);
  const second = await ask('Asus vivobook 15', { redis, gemini: () => jsonResponse(geminiBody(VIVO.identification)), history: () => VIVO.history, listings: () => [] });
  assert.equal(second.fetchImpl.calls.gemini.length, 1, 'a miss: the provider is asked once');
  assert.equal(second.res.body.meta.cached, false);
  assert.equal(redis.store.get(v1Key), cachedEntry, 'the old entry is still there, untouched');
  assert.equal(redis.calls.some(([op]) => !['get', 'set', 'eval'].includes(op)), false, 'only reads, writes of new keys and the budget scripts: no delete, scan or flush');
  assert.equal(redis.calls.filter(([op, k]) => op === 'set' && k === v1Key).length, 0);
  // The Serper rows are cached by their own namespace and are not affected.
  assert.equal([...redis.store.keys()].some((k) => k.startsWith('itemassist-research:enrich:v1:')), true);
});

// ---- what a provider failure may put in the log ----------------------------------------------------------------------------------------------

test('a provider failure logs a fixed code and a status number, never a prompt, a credential, the reply, a header or the query', async () => {
  const query = 'my secret blue widget 4000';
  const { lines } = await ask(query, { gemini: () => jsonResponse({ error: { message: 'LEAK-BODY-xyz prompt echo' } }, 402) });
  const log = JSON.parse(lines.at(-1));
  assert.deepEqual([log.providerErrorCode, log.providerHttpStatus], ['PROVIDER_HTTP_ERROR', 402]);
  const text = lines.join('\n');
  for (const secret of ['LEAK-BODY', 'prompt echo', GEMINI_KEY, TOKEN, 'serper-test-key', 'Authorization', 'x-goog-api-key', query, 'blue widget', 'You are a product research assistant']) assert.equal(text.includes(secret), false, secret);
});

test('a status that is not a plain HTTP status number is not logged at all', async () => {
  const base = routedFetch({ gemini: () => jsonResponse({}, 503), history: () => [] });
  for (const status of [99999, -5, 42.5, 'LEAK-STATUS', NaN]) {
    const fetchImpl = async (url, init) => (String(url).includes('generativelanguage.googleapis.com') ? { ok: false, status, json: async () => ({}), text: async () => 'LEAK-TEXT' } : base(url, init));
    const { lines } = await ask('nintendo wii', { fetchImpl });
    const log = JSON.parse(lines.at(-1));
    assert.equal('providerHttpStatus' in log, false, String(status));
    assert.equal(lines.join('\n').includes('LEAK'), false, String(status));
    assert.match(log.providerErrorCode, /^[A-Z][A-Z0-9_]{2,39}$/);
  }
});
