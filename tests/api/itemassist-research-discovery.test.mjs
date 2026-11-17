import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { researchLiveV2 } from '../../lib/itemassist-research/enrich/orchestrate.js';
import { buildIdentifyPrompt, normalizeIdentification } from '../../lib/itemassist-research/enrich/identify.js';
import { buildResearchResponseV2, isValidResearchResponseV2 } from '../../lib/itemassist-research/contract-v2.js';
import { DISCOVERY_MODE, discoveryMaker, discoveryPlan, discoveryQuery } from '../../lib/itemassist-research/enrich/discovery.js';
import { resolveLineage } from '../../lib/itemassist-research/enrich/lineage.js';

// OFFLINE ONLY. Market discovery (Release 3b follow-up, see discovery.js). Every Shopping row here is SYNTHETIC (market-discovery-synthetic.json states its
// provenance); no provider, key or network is touched.
const M = JSON.parse(readFileSync(new URL('../fixtures/itemassist-research/market-discovery-synthetic.json', import.meta.url), 'utf8'));
const NOW = Date.UTC(2026, 10, 17, 15);
const MARKET = 'Samsung 55 inch 4K LED TV';
const cand = (name) => ({ name, why: 'Comparable.', differences: null, concern: null, confidence: 'medium', tierVsOriginal: 'SAME', comparison: [] });

async function run({ market = [], targeted = M.targeted, reply = M.ju6700Reply, query = 'Samsung UN55JU6700F', mode } = {}) {
  const asked = [];
  const result = await researchLiveV2(query, {
    env: { SERPER_API_KEY: 'offline-key' }, now: () => NOW, ...(mode ? { discoveryMode: mode } : {}),
    identify: async (text) => ({ ok: true, ...normalizeIdentification(reply, text), meta: { requestSent: true, usage: {}, httpStatus: 200 } }),
    serper: async ({ kind, query: text }) => { asked.push([kind, text]); if (kind === 'search') return []; if (text === MARKET) return market; return targeted[text] || []; },
    serperBudget: { reserve: async (credits) => ({ allowed: true, status: 'allowed', credits }) }, enrichCache: null, enrich: true,
  });
  const response = buildResearchResponseV2(result.input, { requestId: 'offline', elapsedMs: 1, answerSource: 'AI_ESTIMATE', now: NOW });
  assert.equal(isValidResearchResponseV2(response), true);
  const prices = (key) => response.pricing.prices.filter((item) => item.candidate === key && item.kind === 'CURRENT_RETAIL_NEW').map((item) => item.amount.low).sort((a, b) => a - b);
  return { response, asked, prices, stats: result.meta.enrichment };
}
const lineageFor = (name, query = 'Samsung UN55JU6700F') => resolveLineage({ category: 'tv', query, identity: M.ju6700Reply.original.identity, candidateName: name, now: NOW });
const plan = (name, extra = {}) => discoveryPlan({ category: 'tv', size: 55, maker: 'samsung', successor: { name }, lineage: lineageFor(name), requestYear: 2026, ...extra });

test('discovery is used only for a sized television whose same-maker successor is dated more than two model years before the request', () => {
  assert.deepEqual(plan('Samsung CU7000'), { use: true, reason: 'NOMINATION_NOT_CURRENT' }, '2023, asked in 2026');
  assert.deepEqual(plan('Samsung DU7200'), { use: false, reason: 'NOMINATION_CURRENT' }, '2024 is still widely sold');
  assert.deepEqual(plan('Samsung U8000F'), { use: false, reason: 'NOMINATION_CURRENT' });
  assert.deepEqual(plan('Samsung Crystal UHD'), { use: false, reason: 'NOMINATION_UNDATED' }, 'no dated generation: the targeted lookup stays');
  assert.deepEqual(plan('LG UR8000'), { use: false, reason: 'NO_SAME_MAKER_SUCCESSOR' });
  assert.deepEqual(plan('Samsung CU7000', { size: null }), { use: false, reason: 'NOT_A_SIZED_TV' });
  assert.deepEqual(plan('Samsung CU7000', { category: 'refrigerator' }), { use: false, reason: 'NOT_A_SIZED_TV' });
  assert.deepEqual(plan('Samsung CU7000', { maker: null }), { use: false, reason: 'NO_MAKER_GRAMMAR' });
  assert.deepEqual(plan('Samsung CU7000', { mode: DISCOVERY_MODE.OFF }), { use: false, reason: 'OFF' });
  assert.equal(discoveryMaker('Samsung UN55JU6700F', ''), 'samsung');
  assert.equal(discoveryMaker('UN55JU6700F', 'Samsung JU6700 55-inch TV'), 'samsung', 'the identification names the maker when the query does not');
  assert.equal(discoveryMaker('TCL 55S425', 'TCL 4-Series'), null, 'no television grammar for this maker');
});

test('the discovery query is built from the original\'s own attributes, never from a model\'s family name', () => {
  assert.equal(discoveryQuery({ maker: 'samsung', size: 55, originalDisplay: 'LED', originalText: 'Samsung JU6700 55-inch curved 4K LED TV' }), 'Samsung 55 inch 4K LED TV');
  assert.equal(discoveryQuery({ maker: 'lg', size: 65, originalDisplay: 'OLED', originalText: 'LG C3 65 inch OLED 4K' }), 'LG 65 inch 4K OLED TV');
  assert.equal(discoveryQuery({ maker: 'sony', size: 55, originalDisplay: null, originalText: 'Sony KDL-55W800C 1080p' }), 'Sony 55 inch TV', 'no 4K and no display word that the original does not state');
});

test('JU6700 (SYNTHETIC rows shaped like the live 2026-11-17 failure): the stale CU7000 lookup becomes discovery, which offers a priced same-brand model; no extra call', async () => {
  const before = await run({ market: M.samsungMarket, mode: DISCOVERY_MODE.OFF });
  assert.equal(before.response.pricing.prices.filter((item) => item.kind === 'CURRENT_RETAIL_NEW').length, 0, 'today: nothing priceable');
  const { response, asked, prices, stats } = await run({ market: M.samsungMarket });
  assert.deepEqual(asked.map(([kind, text]) => `${kind}:${text}`), ['search:Samsung UN55JU6700F launch price MSRP', `shopping:${MARKET}`, 'shopping:LG UR8000 55 inch TV']);
  assert.equal(asked.length, before.asked.length, 'one search about the original and two Shopping lookups, as before');
  // The successor stays the model's nomination, named by its series and never priced from another series' listings.
  assert.match(response.successor.name, /^Samsung CU7000/);
  assert.equal(prices('SUCCESSOR').length, 0);
  const [lg, found] = response.suggestions;
  assert.match(lg.name, /^LG UR8000/);
  assert.equal(found.name, 'Samsung U8000F 55-inch (UN55U8000FFXZA)');
  assert.equal(found.modelStatus, 'LISTED_PROVISIONAL', 'listed by retailers, never verified');
  assert.equal('standing' in found, false, 'an alternative, not the successor');
  assert.equal(found.lineage.relation, 'SAME_BRAND_OTHER_SERIES');
  assert.match(found.why, /same-brand alternative, not confirmed as the original's successor/);
  assert.match(found.concern, /a newer model may exist/, 'the undatable 2026 U8000H is noted, never priced');
  assert.deepEqual(prices('ALT_2'), [369.99, 379.99], 'the two recognised sellers\' clean 55-inch U8000F listings only (not the bundle, plan, 43/65-inch, Amazon or eBay rows)');
  assert.equal(response.suggestions.some((entry) => /Sony X75L/.test(entry.name)), false, 'the suggestion that was never looked up gives way');
  assert.equal(stats.discovery.chosen, 'U8000F');
  assert.equal(stats.discovery.verdicts.TOO_FEW_SELLERS, 1, 'DU7200 is listed by one recognised seller only');
});

test('discovery ranks the original\'s display type and current model years first, never the newest or cheapest alone', async () => {
  const A = M.samsungMarketAdversarial;
  const premium = await run({ market: A.premiumNewer });
  assert.equal(premium.response.suggestions[1].name, 'Samsung DU8000 55-inch (UN55DU8000FXZA)', 'a plain-LED original: the 2024 LED model ranks above the newer QLED and Mini-LED ones');
  const inferior = await run({ market: A.newerInferior });
  assert.equal(inferior.response.suggestions[1].name, 'Samsung DU8000 55-inch (UN55DU8000FXZA)', 'the newest model offered only renewed or open box is not eligible');
  assert.deepEqual(inferior.prices('ALT_2'), [389.99, 399.99]);
  const sizes = await run({ market: A.mixedSizes });
  assert.equal(sizes.response.suggestions[1].name, 'Samsung DU8000 55-inch (UN55DU8000FXZA)', 'the newer U8000F is listed only in other sizes');
  assert.match(sizes.response.suggestions[1].concern, /newer generation \(U8000F\) was seen in listings, but not in the requested 55-inch size/);
  const parts = await run({ market: A.accessories });
  assert.deepEqual(parts.prices('ALT_2'), [389.99, 399.99], 'mounts, remotes, stands and boards that print the code are never its price');
});

test('discovery claims nothing it cannot support: no recognised retailer, an undatable model year, or one seller', async () => {
  const A = M.samsungMarketAdversarial;
  for (const [label, market] of [['no recognised retailer', A.noApprovedRetailer], ['only the undatable 2026 "H" code', A.ambiguousYear]]) {
    const { response, stats } = await run({ market });
    assert.equal(stats.discovery.chosen, null, label);
    assert.equal(response.pricing.prices.filter((item) => item.kind === 'CURRENT_RETAIL_NEW').length, 0, label);
    assert.equal([response.successor, ...response.suggestions].some((entry) => /\([A-Z0-9]{8,}\)/.test(entry.name)), false, `${label}: no exact model named`);
    assert.match(response.suggestions[1].name, /^Sony X75L/, `${label}: with nothing discovered the model's own suggestion stays`);
    // A code a broad lookup does not show is not evidence that the model invented it: the successor keeps its name and says why nothing is priced.
    assert.match(response.successor.name, /^Samsung CU7000/, label);
    // Too little of the maker's dated range from recognised sellers to say the series is gone: only that it was not confirmed.
    assert.equal(response.successor.concern, 'This series was not confirmed in the broad listing search for this size; no price is attached.', label);
  }
});

test('the successor\'s absence is stated as absence only when the broad result shows enough of the maker\'s current range', async () => {
  const { response } = await run({ market: M.samsungMarketAdversarial.premiumNewer });
  assert.match(response.successor.name, /^Samsung CU7000/);
  assert.equal(response.successor.concern, 'This series did not appear among the maker\'s current listings at this size from recognised retailers, so it may no longer be sold; no price is attached.');
});

test('an empty broad result is not cached and claims nothing', async () => {
  const { response, stats } = await run({ market: [] });
  assert.equal(stats.discovery.used, true);
  assert.equal(stats.listings.SUCCESSOR, 'market_empty', 'not "serper": the answer is returned but not cached');
  assert.equal(response.successor.concern, 'This series was not confirmed in the broad listing search for this size; no price is attached.');
  assert.equal(response.pricing.prices.filter((item) => item.kind === 'CURRENT_RETAIL_NEW').length, 0);
});

test('an exact model code nothing retrieved shows is still removed from the successor\'s name; a series token is not', async () => {
  const reply = { ...M.ju6700Reply, successor: cand('Samsung UN55CU7001FXZA') };
  const { response, stats } = await run({ reply, market: M.samsungMarket });
  assert.equal(stats.discovery.reason, 'NOMINATION_NOT_CURRENT');
  assert.equal(/UN55CU7001FXZA/.test(response.successor.name), false, 'an invented full code is never shown');
});

test('only a grammar whose query keeps the named generation is replaced; LG OLED and Samsung QLED/OLED queries already span every year', () => {
  assert.deepEqual(discoveryPlan({ category: 'tv', size: 55, maker: 'lg', successor: { name: 'LG C7 OLED' }, lineage: resolveLineage({ category: 'tv', query: 'LG OLED55C3PUA', identity: 'LG C3 OLED', candidateName: 'LG C7 OLED', now: NOW }), requestYear: 2026 }), { use: false, reason: 'QUERY_SPANS_GENERATIONS' });
  assert.deepEqual(discoveryPlan({ category: 'tv', size: 65, maker: 'samsung', successor: { name: 'Samsung Q60B' }, lineage: lineageFor('Samsung Q60B'), requestYear: 2026 }), { use: false, reason: 'QUERY_SPANS_GENERATIONS' });
  assert.deepEqual(discoveryPlan({ category: 'tv', size: 55, maker: 'sony', successor: { name: 'Sony X80K' }, lineage: resolveLineage({ category: 'tv', query: 'Sony KD-55X80J', identity: 'Sony X80J', candidateName: 'Sony X80K', now: NOW }), requestYear: 2026 }), { use: true, reason: 'NOMINATION_NOT_CURRENT' });
});

test('with no suggestion looked up, the discovered model takes ALT_1 and its prices, key and diagnostics stay with it', async () => {
  const reply = { ...M.ju6700Reply, suggestions: [] };
  const { response, prices, stats } = await run({ reply, market: M.samsungMarket });
  assert.equal(response.suggestions.length, 1);
  assert.equal(response.suggestions[0].name, 'Samsung U8000F 55-inch (UN55U8000FFXZA)');
  assert.deepEqual(prices('ALT_1'), [369.99, 379.99]);
  assert.equal(stats.listings.ALT_1, 'serper');
  assert.equal(stats.generations.ALT_1.chosen, 'U8000F');
});

test('a discovered model is never older than the original when the grammar dates the original', async () => {
  // A 2025 Crystal UHD original (U8000F): the 2024 DU8000 listed cleanly by two sellers is not offered as its replacement.
  const reply = { ...M.ju6700Reply, original: { ...M.ju6700Reply.original, identity: 'Samsung U7900F 55-inch Crystal UHD 4K LED TV (2025)' }, successor: cand('Samsung CU7000') };
  const { response, stats } = await run({ reply, query: 'Samsung UN55U7900FFXZA', market: M.samsungMarketAdversarial.premiumNewer });
  assert.equal(stats.discovery.verdicts.OLDER_THAN_ORIGINAL >= 1, true, JSON.stringify(stats.discovery));
  assert.equal(response.suggestions.some((entry) => /DU8000/.test(entry.name)), false);
});

test('a current nomination keeps its targeted lookup (a broad lookup can miss a model a targeted one finds)', async () => {
  const reply = { ...M.ju6700Reply, successor: cand(M.broadMisses.successor) };
  const { response, asked, prices, stats } = await run({ reply, market: M.broadMisses.market, targeted: { ...M.targeted, 'Samsung DU7200 55 inch TV': M.broadMisses.targeted } });
  assert.equal(stats.discovery.reason, 'NOMINATION_CURRENT');
  assert.equal(asked.some(([, text]) => text === MARKET), false);
  assert.equal(response.successor.name, 'Samsung DU7200 55-inch (UN55DU7200FXZA)');
  assert.deepEqual(prices('SUCCESSOR'), [319.99, 324.99, 329.99]);
});

test('appliances never use discovery and are looked up exactly as before', async () => {
  const fridge = { category: 'refrigerator', profile: 'refrigerator', tier: 'STANDARD', requirements: [], clarify: [],
    original: { identity: 'Samsung RF28R7351SR 28 cu ft French door refrigerator', confidence: 'high', characteristics: ['28 cu ft'], uncertainty: null },
    successor: cand('Samsung RF28-series'), suggestions: [], estimates: { originalNew: null, replacementNew: null } };
  const { asked, stats } = await run({ reply: fridge, query: 'Samsung RF28R7351SR' });
  assert.equal(stats.discovery.used, false);
  assert.equal(asked.some(([, text]) => /^Samsung \d+ inch/.test(text)), false);
});

test('the identification prompt carries the request date, so "recent" is judged against it', () => {
  const dated = buildIdentifyPrompt('Samsung UN55JU6700F', { referenceDate: '2026-11-17' });
  assert.match(dated, /Request date: 2026-11-17\. Judge "recent" against this date, not your training data\./);
  assert.match(dated, /Never write an exact model code/);
  assert.match(dated, /Retailer listings, not you, decide what is on sale now/);
  assert.equal(/Request date/.test(buildIdentifyPrompt('Samsung UN55JU6700F')), false, 'no date given, none stated');
  assert.equal(/Request date/.test(buildIdentifyPrompt('Samsung UN55JU6700F', { referenceDate: 'next week' })), false, 'only an ISO date is used');
  assert.ok(dated.length < 5200, `prompt is ${dated.length} characters`);
});
