import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { researchLiveV2 } from '../../lib/itemassist-research/enrich/orchestrate.js';
import { normalizeIdentification } from '../../lib/itemassist-research/enrich/identify.js';
import { buildResearchResponseV2, isValidResearchResponseV2 } from '../../lib/itemassist-research/contract-v2.js';
import { normalizeModelObservations, observationsFit } from '../../lib/itemassist-research/evidence-blocks.js';
import { createEnrichmentCache, enrichCacheKey } from '../../lib/itemassist-research/enrich/cache.js';
import { createRedis } from '../helpers/itemassist-research-fakes.mjs';

// OFFLINE ONLY. Model codes that recognised sellers' listing titles state are kept as OBSERVATIONS, apart from price evidence and from verified identity. A bundle or
// a protection plan can show that a model exists but never sets a price; conflicting codes are kept and none is chosen. Saved Serper rows and mocked replies only.
const FX = (file) => JSON.parse(readFileSync(new URL(`../fixtures/itemassist-research/${file}`, import.meta.url), 'utf8'));
const S1 = FX('s1-rows.json'), CPB = FX('checkpoint-b-lg-c3.json');
const NOW = Date.UTC(2026, 10, 11, 15);
const REPLY = {
  category: 'tv', profile: 'tv', tier: 'PREMIUM', requirements: [],
  original: { identity: 'LG C3 series 55-inch 4K OLED evo smart TV (2023)', confidence: 'high', characteristics: ['55-inch OLED', '4K', '120 Hz'], uncertainty: null },
  successor: { name: 'LG C-series OLED', why: 'Continues the line.', differences: null, concern: null, confidence: 'high', comparison: [] },
  suggestions: [], estimates: { originalNew: { low: 1500, high: 2000 }, replacementNew: { low: 1200, high: 1800 } }, clarify: [],
};
const row = (title, seller, price) => ({ title, seller, price });
const BESTBUY = 'Best Buy', TARGET = 'Target', WALMART = 'Walmart', PCR = 'P.C. Richard & Son';

async function answer(history, listings, { query = 'LG C3 55-inch TV', enrichCache = null, reply = REPLY } = {}) {
  const result = await researchLiveV2(query, {
    env: { SERPER_API_KEY: 'k' }, now: () => NOW, enrichCache, enrich: true,
    identify: async (q) => ({ ok: true, ...normalizeIdentification(reply, q), meta: { requestSent: true, usage: {}, httpStatus: 200 } }),
    serper: async ({ kind }) => (kind === 'search' ? history : listings), serperBudget: { reserve: async (credits) => ({ allowed: true, status: 'allowed', credits }) },
  });
  const response = buildResearchResponseV2(result.input, { requestId: 'r', elapsedMs: 1, answerSource: 'AI_ESTIMATE', now: NOW });
  assert.equal(isValidResearchResponseV2(response), true, 'the response the engine builds always validates');
  return response;
}
const clone = (value) => JSON.parse(JSON.stringify(value));
const priced = (response) => response.pricing.prices.filter((entry) => entry.subject !== 'ORIGINAL');

test('LG C3 to C6, bundle-only: the model code is observed from protection-plan listings, the price is excluded, and the model stays unconfirmed', async () => {
  const response = await answer(CPB.history, CPB.listings['LG C-series OLED 55 inch']);
  const block = response.successor.modelObservations;
  assert.equal(block.conflict, false);
  assert.deepEqual(block.items.map((item) => [item.model, item.status, item.exclusion, item.retailers]), [['OLED55C6PUA', 'EXCLUDED_FROM_PRICE', 'PROTECTION_PLAN', ['Best Buy']]]);
  assert.match(block.items[0].excerpt, /Protection Plan/i);
  assert.equal(response.successor.modelStatus, 'UNVERIFIED_MODEL', 'an observed code is not a verified identity');
  assert.deepEqual(priced(response).filter((entry) => entry.kind !== 'AI_ESTIMATE'), [], 'no bundle or protection-plan price is used');
  assert.equal(response.successor.lineage.generation, 'C6');
  assert.equal(response.pricing.evidence.some((entry) => entry.subject !== 'ORIGINAL'), false, 'nothing is cited for a replacement price that is not used');
});

test('a clean exact-model listing: the model is observed and priced, the protection-plan listings of the same model are not priced', async () => {
  const response = await answer(S1.history['lg-c3-55'], S1.listings['lg-c3-55'].rows);
  const [item] = response.successor.modelObservations.items;
  assert.deepEqual([item.model, item.status, item.exclusion, item.retailers], ['OLED55C6PUA', 'PRICED_LISTING', null, ['Best Buy']]);
  assert.equal(response.successor.modelStatus, 'LISTED_PROVISIONAL');
  assert.equal(response.successor.name, 'LG C6 OLED 55-inch (OLED55C6PUA)');
  const amounts = priced(response).map((entry) => entry.amount ?? entry.price ?? entry.range);
  assert.equal(JSON.stringify(amounts).includes('1224.99'), false, 'the 6-year protection-plan price is excluded');
  assert.equal(JSON.stringify(amounts).includes('999.99'), true);
});

test('a SKU-less priced listing beside a bundle that states the code: the price is kept, the name carries no code, and the observed code is shown with its exclusion', async () => {
  const rows = [
    row('LG 55" OLED evo AI C6 4K Smart webOS TV', TARGET, 1449.99),
    row('LG Oled55c6pua 55 inch Class OLED AI C6 4K Smart TV with 2 Year Amber Protection Plan', BESTBUY, 999.99),
  ];
  const response = await answer([], rows);
  assert.equal(response.successor.name.includes('OLED55C6PUA'), false, 'a code only a protection-plan listing states does not name the candidate');
  assert.ok(priced(response).length >= 1, 'the SKU-less Target price is not dropped');
  assert.deepEqual(response.successor.modelObservations.items.map((item) => [item.model, item.status, item.exclusion]), [['OLED55C6PUA', 'EXCLUDED_FROM_PRICE', 'PROTECTION_PLAN']]);
  assert.equal(JSON.stringify(priced(response)).includes('999.99'), false, 'the protection-plan listing sets no price');
});

test('conflicting model codes from recognised sellers are preserved; no code is chosen, named, or priced as one exact model', async () => {
  const rows = [
    row('LG 55" OLED evo C6 4K Smart TV OLED55C6PUA', BESTBUY, 1299.99),
    row('LG 55" Class OLED evo C6 4K Smart TV OLED55C6AUA', TARGET, 1349.99),
    row('LG OLED55C6PUA 55" OLED evo C6 4K', WALMART, 1319.99),
  ];
  const response = await answer([], rows);
  const block = response.successor.modelObservations;
  assert.equal(block.conflict, true);
  assert.deepEqual(block.items.map((item) => item.model).sort(), ['OLED55C6AUA', 'OLED55C6PUA']);
  assert.equal(/OLED55C6[AP]UA/.test(response.successor.name), false, 'the name carries neither code');
  assert.notEqual(response.successor.modelStatus, 'LISTED_PROVISIONAL', 'no exact-model listing status');
  assert.equal(response.successor.modelStatus, 'FAMILY_LEVEL', 'the candidate is a family, not one exact model');
  assert.match(response.successor.concern, /more than one model code/, 'the conflict is stated');
  assert.equal(observationsFit(block, 'LG C6 OLED 55-inch (OLED55C6PUA)', 'LISTED_PROVISIONAL'), false, 'a conflict beside a named code does not fit');
});

test('short spellings of one code are one model, not a conflict', async () => {
  const rows = [row('LG 55" OLED evo C6 4K Smart TV OLED55C6PUA', BESTBUY, 1299.99), row('LG 55" OLED evo C6 4K Smart TV OLED55C6P', WALMART, 1309.99)];
  const response = await answer([], rows);
  assert.equal(response.successor.modelObservations.conflict, false);
  assert.deepEqual(response.successor.modelObservations.items.map((item) => item.model), ['OLED55C6PUA']);
});

test('wrong-size, other-generation, accessory and unrecognised-seller rows are never observed', async () => {
  const rows = [
    row('LG 65" OLED evo C6 4K Smart TV OLED65C6PUA', BESTBUY, 1899.99),
    row('LG 55" OLED evo C5 4K Smart TV OLED55C5PUA', BESTBUY, 1099.99),
    row('Wall mount for LG OLED55C6PUA 55 inch C6 TV', TARGET, 49.99),
    row('LG 55" OLED evo C6 4K Smart TV OLED55C6PUA', 'Some Marketplace Shop', 899.99),
    row('LG 55" OLED evo C6 4K Smart TV OLED55C6PUA', WALMART, 1289.99),
  ];
  const response = await answer([], rows);
  const models = (response.successor.modelObservations?.items || []).map((item) => item.model);
  assert.deepEqual(models, ['OLED55C6PUA']);
  assert.deepEqual(response.successor.modelObservations.items[0].retailers, ['Walmart'], 'only the recognised seller of the right size and generation');
});

test('no cross-generation pricing: a code of another generation is neither observed nor priced for the presented one', async () => {
  const rows = [row('LG 55" OLED evo C5 4K Smart TV OLED55C5PUA', BESTBUY, 1099.99), row('LG 55" OLED evo C5 4K Smart TV OLED55C5PUA', WALMART, 1089.99)];
  const response = await answer([], rows);
  const text = JSON.stringify(response.successor.modelObservations || {});
  assert.equal(text.includes('C6'), false);
  assert.equal(response.successor.lineage.generation, 'C5');
  assert.deepEqual(response.successor.modelObservations.items.map((item) => item.model), ['OLED55C5PUA'], 'the generation presented is the one the listings state');
});

test('the observation is evidence of a listing title only: no source link, no price, no specification claim, and the contract refuses an edited block', async () => {
  const response = await answer(CPB.history, CPB.listings['LG C-series OLED 55 inch']);
  const keys = Object.keys(response.successor.modelObservations.items[0]).sort();
  assert.deepEqual(keys, ['excerpt', 'exclusion', 'listings', 'model', 'retailers', 'retrievedAt', 'retrievedBasis', 'status']);
  const forged = {
    'a retailer that is not in the registry': (b) => { b.items[0].retailers = ['Totally Real Store']; },
    'a model code that is not a model code': (b) => { b.items[0].model = 'hello'; },
    'a price in the excerpt': (b) => { b.items[0].excerpt = 'LG OLED55C6PUA only $999.99 today'; },
    'a link in the excerpt': (b) => { b.items[0].excerpt = 'see https://example.com/deal'; },
    'priced with an exclusion': (b) => { b.items[0].status = 'PRICED_LISTING'; },
    'excluded without a reason': (b) => { b.items[0].exclusion = null; },
    'an invented retrieval time': (b) => { b.items[0].retrievedBasis = 'UNKNOWN'; },
    'a conflict with one model': (b) => { b.conflict = true; },
    'an extra key': (b) => { b.items[0].price = 999; },
    'a source publication time': (b) => { b.items[0].publishedAt = '2026-11-01'; },
  };
  for (const [label, change] of Object.entries(forged)) {
    const copy = clone(response);
    change(copy.successor.modelObservations);
    assert.equal(isValidResearchResponseV2(copy), false, label);
    assert.equal(normalizeModelObservations(copy.successor.modelObservations), null, label);
  }
  const stripped = clone(response);
  delete stripped.successor.modelObservations;
  assert.equal(isValidResearchResponseV2(stripped), true, 'the block is optional: a response without it is as valid as ever');
});

test('a priced model needs a listing-backed status, and observations never raise a model status', async () => {
  const response = await answer(CPB.history, CPB.listings['LG C-series OLED 55 inch']);
  const copy = clone(response);
  copy.successor.modelObservations.items[0].status = 'PRICED_LISTING';
  copy.successor.modelObservations.items[0].exclusion = null;
  assert.equal(isValidResearchResponseV2(copy), false, 'UNVERIFIED_MODEL cannot carry a priced observation');
  assert.equal(response.successor.modelStatus, 'UNVERIFIED_MODEL');
});

test('retrieval time: a fresh lookup is stamped with its retrieval date; a cache hit carries the time its entry was stored; an entry without one is unknown', async () => {
  const redis = createRedis();
  const cache = createEnrichmentCache({ redis });
  const fresh = await answer(CPB.history, CPB.listings['LG C-series OLED 55 inch'], { enrichCache: cache });
  assert.deepEqual([fresh.successor.modelObservations.items[0].retrievedAt, fresh.successor.modelObservations.items[0].retrievedBasis], ['2026-11-11', 'RETRIEVED']);
  const hit = await answer(CPB.history, CPB.listings['LG C-series OLED 55 inch'], { enrichCache: cache });
  assert.equal(hit.successor.modelObservations.items[0].retrievedAt, '2026-11-11', 'the stored time, not today');
  // An entry stored before the time was recorded: the retrieval time is unknown, and nothing is invented.
  for (const [key, value] of redis.store.entries()) if (key.includes(':listings:')) { const entry = JSON.parse(value); delete entry.at; redis.store.set(key, JSON.stringify(entry)); }
  const legacy = await answer(CPB.history, CPB.listings['LG C-series OLED 55 inch'], { enrichCache: cache });
  assert.deepEqual([legacy.successor.modelObservations.items[0].retrievedAt, legacy.successor.modelObservations.items[0].retrievedBasis], [null, 'UNKNOWN']);
  assert.ok(redis.store.has(enrichCacheKey('listings', 'LG C-series OLED 55 inch tv')) || redis.store.size > 0);
});

test('appliances and other non-television results carry neither block and are otherwise unchanged', async () => {
  const fridge = { category: 'refrigerator', profile: 'refrigerator', tier: 'MID', requirements: [], original: { identity: 'Samsung RF28 French door refrigerator', confidence: 'medium', characteristics: ['28 cu ft'], uncertainty: null },
    successor: { name: 'Samsung RF28 series French door', why: 'Same line.', differences: null, concern: null, confidence: 'medium', comparison: [] }, suggestions: [], estimates: { originalNew: { low: 2000, high: 2600 }, replacementNew: { low: 2000, high: 2600 } }, clarify: [] };
  const rows = [row('Samsung 28 cu. ft. French Door Refrigerator RF28R7351SR', BESTBUY, 2099.99), row('Samsung RF28R7351SR 28 cu ft refrigerator', WALMART, 2049.99)];
  const response = await answer([], rows, { query: 'Samsung RF28 refrigerator', reply: fridge });
  for (const candidate of [response.successor, ...response.suggestions].filter(Boolean)) {
    assert.equal(Object.hasOwn(candidate, 'modelObservations'), false);
    assert.equal(Object.hasOwn(candidate, 'specComparison'), false);
  }
});

test('the saved engine outputs the web fixtures are made from validate as research.2 responses', () => {
  for (const name of ['lg-c3-r2-clean-listing', 'lg-c3-r2-bundle-only', 'lg-c3-r2-conflict', 'lg-c3-r2-sku-less-with-bundle-code']) {
    const body = FX(`r2-engine-output/${name}.engine.json`);
    assert.equal(isValidResearchResponseV2(body), true, name);
    assert.ok(body.successor.modelObservations && body.successor.specComparison, name);
  }
});

test('review: a manufacturer storefront among the sellers is a recognised seller and keeps the observation block', async () => {
  const rows = [row('LG 55" OLED evo C6 4K Smart TV OLED55C6PUA', 'LG Electronics', 1299.99), row('LG 55" OLED evo C6 4K Smart TV OLED55C6PUA', BESTBUY, 1309.99)];
  const response = await answer([], rows);
  assert.deepEqual(response.successor.modelObservations.items[0].retailers, ['Best Buy', 'LG']);
  const conflict = await answer([], [row('LG 55" OLED evo C6 4K Smart TV OLED55C6PUA', 'LG Electronics', 1299.99), row('LG 55" OLED evo C6 4K Smart TV OLED55C6AUA', BESTBUY, 1309.99)]);
  assert.equal(conflict.successor.modelObservations.conflict, true, 'the conflict is preserved, not silently lost');
});

test('review: an accessory kit that names a model is not a television observation and creates no conflict', async () => {
  const rows = [row('LG 55" OLED evo C6 4K Smart TV OLED55C6PUA', BESTBUY, 1299.99), row('Universal Wall Mount Kit for LG OLED55C6AUA 55 inch C6 OLED TV', TARGET, 39.99)];
  const response = await answer([], rows);
  assert.equal(response.successor.modelObservations.conflict, false);
  assert.deepEqual(response.successor.modelObservations.items.map((item) => item.model), ['OLED55C6PUA']);
  assert.equal(response.successor.modelStatus, 'LISTED_PROVISIONAL', 'the clean priced model is not demoted by an accessory');
});

test('review: the validator refuses null blocks, a page-title basis with no original page, a priced model the name does not carry, and an implausible retrieval date', async () => {
  const response = await answer(CPB.history, CPB.listings['LG C-series OLED 55 inch']);
  const nulls = clone(response);
  nulls.successor.modelObservations = null;
  assert.equal(isValidResearchResponseV2(nulls), false, 'a null observation block');
  const nullComparison = clone(response);
  nullComparison.successor.specComparison = null;
  assert.equal(isValidResearchResponseV2(nullComparison), false, 'a null comparison');
  const noPage = clone(response);
  delete noPage.original.manufacturerPages;
  assert.equal(noPage.successor.specComparison.rows.some((entry) => entry.original?.basis === 'MANUFACTURER_PAGE_TITLE'), true, 'the fixture cites the page');
  assert.equal(isValidResearchResponseV2(noPage), false, 'a page-title basis needs the original page');
  for (const retrievedAt of ['2099-01-01', '1999-01-01']) {
    const dated = clone(response);
    dated.successor.modelObservations.items[0].retrievedAt = retrievedAt;
    assert.equal(isValidResearchResponseV2(dated), false, retrievedAt);
  }
  const clean = await answer(S1.history['lg-c3-55'], S1.listings['lg-c3-55'].rows);
  const other = clone(clean);
  other.successor.modelObservations.items[0].model = 'OLED55C6XUA';
  assert.equal(isValidResearchResponseV2(other), false, 'a priced model that is not the one the name carries');
});

test('review: observed variants that become variants of each other through a third form one model, not a conflict that cannot validate', async () => {
  const { groupObserved } = await import('../../lib/itemassist-research/enrich/observations.js');
  const groups = groupObserved([{ sku: 'QN65S90F' }, { sku: 'QN65S90FAFXZA123' }, { sku: 'QN65S90FAFXZ' }]);
  assert.equal(groups.length, 1);
});
