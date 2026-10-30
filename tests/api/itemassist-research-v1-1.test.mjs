import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createItemAssistResearchHandler } from '../../lib/itemassist-research/handler.js';
import { buildResearchResponseV2, isValidResearchResponseV2 } from '../../lib/itemassist-research/contract-v2.js';
import { CONFIG_VERDICT, configKind, configQuestion, judgeConfig, laptopLine, laptopLineMatches, parseConfig, skuOf, wantedConfig } from '../../lib/itemassist-research/enrich/config.js';
import { detectCategory } from '../../lib/itemassist-research/enrich/category.js';
import { buildIdentifyPrompt, normalizeIdentification } from '../../lib/itemassist-research/enrich/identify.js';
import { parseModelJson } from '../../lib/itemassist-research/enrich/json-repair.js';
import { screenListings } from '../../lib/itemassist-research/enrich/listings.js';
import { researchLiveV2, shoppingQuery } from '../../lib/itemassist-research/enrich/orchestrate.js';
import { recognizeFromSources, tidyName } from '../../lib/itemassist-research/enrich/recognize.js';
import { normalizeShopping, sellerLink } from '../../lib/itemassist-research/enrich/serper.js';
import { createEnrichmentCache } from '../../lib/itemassist-research/enrich/cache.js';
import { buildValuation } from '../../lib/itemassist-research/pricing.js';
import { LISTING_SPREAD_RATIO, densestWindow, narrowToAgreement, withinSpread } from '../../lib/itemassist-research/spread.js';
import { createRedis, geminiBody, jsonResponse, rawShopping, routedFetch } from '../helpers/itemassist-research-fakes.mjs';

// OFFLINE ONLY. V1.1 (2026-10-30): what the two Production requests "nintendo wii" and "Asus vivobook 15" exposed. The saved rows are the public
// search text those requests retrieved (see the fixtures); nothing here calls a provider or a real store.
//   - A provider answer that could not be read was reported as "Product not identified" for a console everyone knows.
//   - One name ("Vivobook 15") covers machines from $250 to $1,000, and the headline range was the cheapest, the middle and the dearest of them.
const fixture = (name) => JSON.parse(readFileSync(new URL(`../fixtures/itemassist-research/${name}`, import.meta.url), 'utf8'));
const VIVO = fixture('v1-1-vivobook.json');
const WII = fixture('v1-1-wii.json');
const NOW = Date.parse('2026-10-30T11:53:40Z');
const BUDGET = { reserve: async (credits) => ({ allowed: true, status: 'allowed', credits }) };

async function replay(p, query, { fail = null, listings = p.listings, history = p.history } = {}) {
  const identify = async (q) => (fail
    ? { ok: false, meta: { requestSent: true, usage: {}, errorCode: fail, httpStatus: 200 } }
    : { ok: true, ...normalizeIdentification(p.identification, q), meta: { requestSent: true, usage: {}, errorCode: null } });
  const calls = [];
  const serper = async ({ kind, query: asked }) => {
    calls.push([kind, asked]);
    if (kind === 'search') return history;
    const key = Object.keys(listings).find((name) => asked.toLowerCase().startsWith(name.toLowerCase().split(' ').slice(0, 3).join(' ')));
    if (!key) throw Object.assign(new Error('no saved rows'), { code: 'NO_SAVED_ROWS' });
    return listings[key];
  };
  const result = await researchLiveV2(query, { env: { SERPER_API_KEY: 'replay-key' }, now: () => NOW, identify, serper, serperBudget: BUDGET, enrichCache: null, enrich: true });
  const response = buildResearchResponseV2(result.input, { requestId: 'replay', elapsedMs: 0, answerSource: result.meta.errorCode ? 'CATEGORY_GUIDANCE' : 'AI_ESTIMATE', now: NOW });
  return { result, response, calls };
}
const row = (seller, price, title, link) => ({ seller, price, title, ...(link ? { link } : {}) });

// ---- 1. one range only while the prices agree ------------------------------------------------------------------------------------------------

test('listings share a range only while they agree: the densest group of two or more is used, and with none no listing stands for the rest', () => {
  assert.equal(LISTING_SPREAD_RATIO, 1.75);
  assert.deepEqual(narrowToAgreement([250, 500, 1000], (n) => n), { kept: [], trimmed: true }, 'the Production prices: $250, $500, $1,000');
  assert.deepEqual(narrowToAgreement([250, 480, 500, 520, 1000], (n) => n), { kept: [480, 500, 520], trimmed: true });
  assert.deepEqual(narrowToAgreement([100, 170], (n) => n), { kept: [100, 170], trimmed: false }, '1.7 is within the ratio');
  assert.deepEqual(narrowToAgreement([100, 180], (n) => n), { kept: [], trimmed: true }, '1.8 is not, and a group of one is not a group');
  assert.deepEqual(narrowToAgreement([300], (n) => n), { kept: [300], trimmed: false });
  assert.deepEqual(densestWindow([100, 110, 120, 400, 410], (n) => n), [100, 110, 120]);
  assert.deepEqual(densestWindow([100, 110, 400, 410], (n) => n), [100, 110], 'ties go to the lower-priced group');
  assert.equal(withinSpread([100, 175]), true);
  assert.equal(withinSpread([100, 176]), false);
});

test('the valuation never builds one range over listings that are further apart than that, even when they reach it that way', () => {
  const listing = (id, amount, candidate = 'SUCCESSOR') => ({ id, kind: 'CURRENT_RETAIL_NEW', subject: 'REPLACEMENT', candidate, model: null, amount: { currency: 'USD', low: amount, high: amount }, asOf: '2026-10-30', asOfBasis: 'OBSERVED', verification: 'SEARCH_LISTING', evidenceId: 'e1' });
  const input = (prices) => ({ prices, requirements: [], candidates: [{ key: 'SUCCESSOR', comparison: [] }], tier: { level: 'VALUE', basis: 'AI_ESTIMATE' }, profile: 'electronics', referenceDate: '2026-10-30' });
  const wide = buildValuation(input([listing('p1', 249.99), listing('p2', 499.99), listing('p3', 999.99)]));
  assert.deepEqual([wide.method, wide.range, wide.comparables], ['INSUFFICIENT', null, []], 'the production $249.99 to $999.99 headline is gone');
  assert.deepEqual(wide.notes.find((note) => note.code === 'LISTINGS_SPREAD_TRIMMED'), { code: 'LISTINGS_SPREAD_TRIMMED', count: 3 });
  assert.equal(wide.excluded.length, 0, 'the candidate has prices; they are only not comparable');
  const grouped = buildValuation(input([listing('p1', 249.99), listing('p2', 480), listing('p3', 499.99), listing('p4', 520), listing('p5', 999.99)]));
  assert.deepEqual([grouped.method, grouped.range, grouped.comparables.map((row) => row.priceId)], ['PROVISIONAL_LISTINGS', { currency: 'USD', low: 480, high: 520 }, ['p2', 'p3', 'p4']]);
  assert.deepEqual(grouped.notes.find((note) => note.code === 'LISTINGS_SPREAD_TRIMMED'), { code: 'LISTINGS_SPREAD_TRIMMED', count: 2 });
  const agreeing = buildValuation(input([listing('p1', 1000), listing('p2', 1200), listing('p3', 1700)]));
  assert.deepEqual([agreeing.method, agreeing.range.high], ['PROVISIONAL_LISTINGS', 1700]);
  assert.equal(agreeing.notes.some((note) => note.code === 'LISTINGS_SPREAD_TRIMMED'), false, 'agreeing listings are untouched');
  // An example whose laptop configuration is not matched never sets the range, however it prices.
  const example = { ...listing('p9', 300), configConfirmed: false };
  assert.deepEqual(buildValuation(input([listing('p1', 500), example])).comparables.map((row) => row.priceId), ['p1']);
});

// ---- 2. the configuration of a laptop --------------------------------------------------------------------------------------------------------

test('a laptop title states its processor class, memory, storage and screen, and a bare "16gb 512gb" is read by size', () => {
  assert.deepEqual(parseConfig('ASUS Vivobook 15 15.6" FHD Laptop Intel Core 5 120U 16GB RAM 512GB SSD'), { cpu: 3, ram: 16, storage: 512, screen: 15.6, twoInOne: false, touch: false });
  assert.deepEqual(parseConfig('ASUS VivoBook 15 15.6" FHD i3-1115G4 4GB 128GB SSD'), { cpu: 2, ram: 4, storage: 128, screen: 15.6, twoInOne: false, touch: false });
  assert.deepEqual(parseConfig('Asus Vivobook 15 Laptop - Intel Core 7 150U - 8GB RAM - 1TB SSD'), { cpu: 4, ram: 8, storage: 1000, screen: null, twoInOne: false, touch: false });
  assert.equal(parseConfig('Asus Vivobook Go 15 Intel Processor N150').cpu, 1);
  assert.equal(parseConfig('Laptop AMD Ryzen 5 7520U').cpu, 3);
  assert.equal(parseConfig('Laptop Core i5 or Core i7').cpu, null, 'two classes in one title state none');
  assert.equal(parseConfig('Yoga 2-in-1 convertible').twoInOne, true);
  // An Apple chip is a processor class of its own, so "M2, 8GB, 256GB" answers the question; "M.2" (a drive) and a stray "M2" are not chips.
  assert.deepEqual(parseConfig('Apple MacBook Air 13.6" M2 8GB 256GB SSD'), { cpu: 12, ram: 8, storage: 256, screen: 13.6, twoInOne: false, touch: false });
  assert.deepEqual([wantedConfig('macbook air m2 8gb 256gb').complete, wantedConfig('macbook air m2 8gb 256gb').labels.cpu], [true, 'Apple M2']);
  assert.equal(parseConfig('Laptop M.2 SSD 512GB Core i5').cpu, 3);
  assert.equal(parseConfig('Dell M2 monitor 15.6 inch').cpu, null);
  const asked = wantedConfig('asus vivobook 15, i5, 16gb, 512gb');
  assert.deepEqual([asked.wanted.cpu, asked.wanted.ram, asked.wanted.storage, asked.complete, asked.missing], [3, 16, 512, true, []]);
  assert.deepEqual(asked.labels, { cpu: 'Core i5', ram: '16GB', storage: '512GB' });
  const partial = wantedConfig('Dell Inspiron 15 8gb ryzen 5');
  assert.deepEqual([partial.complete, partial.missing], [false, ['storage']]);
  assert.equal(wantedConfig('Asus vivobook 15').missing.length, 3);
});

test('exactly one short question asks for what is missing, in plain words', () => {
  assert.equal(configQuestion([]), null);
  assert.equal(configQuestion(['processor', 'RAM', 'storage']), 'What processor, RAM and storage does it have? (for example Core i5, 16 GB, 512 GB)');
  assert.equal(configQuestion(['storage']), 'What storage does it have?');
  assert.equal(configQuestion(['RAM', 'storage']), 'What RAM and storage does it have?');
  assert.ok(configQuestion(['processor', 'RAM', 'storage']).length <= 110, 'fits the clarify limit');
  assert.equal(configKind('Asus vivobook 15'), 'laptop');
  assert.equal(configKind('LG C3 55 inch OLED'), null);
});

test('a listing matches only when it states every asked facet and agrees; a different configuration is a mismatch and an unstated one is unknown', () => {
  const ask = wantedConfig('vivobook 15 i5 16gb 512gb');
  assert.equal(judgeConfig(ask, 'Vivobook 15 Core i5-1334U 16GB RAM 512GB SSD'), CONFIG_VERDICT.MATCH);
  assert.equal(judgeConfig(ask, 'Vivobook 15 Core i5-1334U 16GB RAM 1TB SSD'), CONFIG_VERDICT.MISMATCH, 'twice the storage is another machine');
  assert.equal(judgeConfig(ask, 'Vivobook 15 Core i7-1355U 16GB RAM 512GB SSD'), CONFIG_VERDICT.MISMATCH);
  assert.equal(judgeConfig(ask, 'Vivobook 15 Core i5-1334U 8GB RAM 512GB SSD'), CONFIG_VERDICT.MISMATCH, 'less memory');
  assert.equal(judgeConfig(ask, 'Vivobook 15 Core i5-1334U 16GB RAM 512GB SSD 2-in-1'), CONFIG_VERDICT.MISMATCH, 'a convertible is another form factor');
  assert.equal(judgeConfig(ask, 'Vivobook 15 15.6" Touchscreen Laptop'), CONFIG_VERDICT.UNKNOWN, 'states none of it');
  assert.equal(judgeConfig(wantedConfig('vivobook 15'), 'Vivobook 15 Core i5-1334U 16GB RAM 512GB SSD'), CONFIG_VERDICT.UNKNOWN, 'with nothing asked, nothing matches');
});

test('a Vivobook 15 listing is of that line; Go, S, Pro and "S15" are other lines of the brand', () => {
  const line = laptopLine('Asus VivoBook 15 Series');
  const matches = (title) => laptopLineMatches(line, title);
  assert.deepEqual([line.brand, line.names, line.number], ['asus', ['vivobook'], '15']);
  assert.equal(matches('ASUS Vivobook 15 FHD 15.6" Laptop Intel Core 5 320'), true);
  assert.equal(matches('Asus Vivobook 15.6 Fhd Laptop with Intel i5-1334U'), true, 'the 15.6-inch class');
  assert.equal(matches('Asus M1502naqgs76 15.6 inch Vivobook 15 Laptop AMD Ryzen 7'), true);
  for (const title of ['Asus Vivobook Go 15 Laptop 15.6 FHD', 'ASUS Vivobook S 15 15.6" 3K OLED Laptop', 'ASUS VivoBook S15', 'ASUS - VivoBook S15 Slim 15.6" FHD', 'ASUS Vivobook Pro 15 OLED', 'Asus Vivobook 16', 'ASUS Vivobook R 15.6-inch', 'ASUS 15.6" TouchScreen Laptop Core i5']) {
    assert.equal(matches(title), false, title);
  }
  const ideapad = laptopLine('Lenovo IdeaPad Slim 3');
  assert.equal(laptopLineMatches(ideapad, 'Lenovo IdeaPad Slim 3 15IAH8 15.6" Laptop'), true);
  assert.equal(laptopLineMatches(ideapad, 'Lenovo IdeaPad Slim 5 16" Laptop'), false);
});

// ---- 3. exact model codes ---------------------------------------------------------------------------------------------------------------------

test('a model code is read from a title, and parts, displays and processors are not model codes', () => {
  assert.equal(skuOf('ASUS VivoBook 15 Slim F1502ZA-OS34 Laptop 15.6" Screen Intel Core i3'), 'F1502ZA-OS34');
  assert.equal(skuOf('Asus M1502naqgs76 15.6 inch Vivobook 15 Laptop'), 'M1502NAQGS76');
  assert.equal(skuOf('LG 55" Class OLED evo C4 Series OLED55C4PUA 4K'), 'OLED55C4PUA');
  assert.equal(skuOf('Laptop RTX4060 16GB DDR5-5600 Core i5-1334U FHD1080P'), null);
  assert.equal(skuOf('ASUS Vivobook 15 15.6 FHD'), null);
});

const REPLACEMENT = { name: 'Asus VivoBook 15 Series' };
const LAPTOP_CONTEXT = (query) => ({ category: 'electronics', spec: null, focuses: [], config: { request: wantedConfig(query), line: laptopLine(REPLACEMENT.name) } });
const LAPTOP_ROWS = [
  row('Walmart', 499, 'Asus Vivobook 15 15.6" FHD Laptop Intel Core 5 120U 16GB RAM 512GB SSD'),
  row('Best Buy', 529.99, 'ASUS Vivobook 15 15.6" Laptop Intel Core 5 120U 16GB Memory 512GB SSD'),
  row('Target', 549.99, 'Asus Vivobook 15 FHD 15.6" Laptop Core 5 120U 16GB 512GB SSD'),
  row('Walmart', 249.99, 'Asus Vivobook Go 15 15.6" Laptop Intel Processor N150 8GB 256GB SSD'),
  row('Best Buy', 799, 'ASUS Vivobook S 15 15.6" OLED Laptop Core Ultra 7 16GB 512GB SSD'),
  row('B&H Photo-Video-Audio', 999.99, 'ASUS Vivobook 15 Laptop AMD Ryzen 7 7730U 16GB RAM 1TB SSD'),
  row('Staples', 450, 'ASUS Vivobook 15 15.6" Laptop Intel Core 5 120U 16GB RAM 512GB SSD'),
];

test('laptop listings: with the configuration given, only that configuration of that line sets a price', () => {
  const screened = screenListings(LAPTOP_ROWS, REPLACEMENT, LAPTOP_CONTEXT('Asus vivobook 15, core i5, 16gb, 512gb'));
  assert.deepEqual(screened.items.map((item) => [item.host, item.amount]), [['walmart.com', 499], ['bestbuy.com', 529.99], ['target.com', 549.99]]);
  assert.deepEqual(screened.skipped, { OTHER_LINE: 2, OTHER_CONFIGURATION: 1, SELLER_NOT_RECOGNISED: 1 }, 'Go and S are other lines; the Ryzen 7 and 1 TB machine is another configuration');
  assert.deepEqual([screened.context, screened.sku], [[], null]);
  assert.equal(screened.items.every((item) => !('compatibilityOpen' in item)), true);
});

test('laptop listings: with nothing given, no listing sets a price and the rest are examples marked as not matched', () => {
  const screened = screenListings(LAPTOP_ROWS, REPLACEMENT, LAPTOP_CONTEXT('Asus vivobook 15'));
  assert.deepEqual(screened.items, []);
  assert.ok(screened.context.length >= 1 && screened.context.length <= 2);
  assert.equal(screened.context.every((item) => item.reason === 'CONFIG_NOT_CONFIRMED'), true);
});

test('prices far apart are not one product: of an agreeing group and two outliers only the group is used, and spread is counted as skipped', () => {
  const rows = [
    row('Walmart', 250, 'Asus Vivobook 15 15.6" Core 5 120U 16GB 512GB SSD'), row('Best Buy', 480, 'ASUS Vivobook 15 Core 5 120U 16GB RAM 512GB SSD'),
    row('Target', 500, 'Asus Vivobook 15 Core 5 120U 16GB 512GB'), row('Newegg', 520, 'ASUS Vivobook 15 Core 5 120U 16GB 512GB SSD'), row('Costco', 1000, 'ASUS Vivobook 15 Core 5 120U 16GB 512GB SSD'),
  ];
  const screened = screenListings(rows, REPLACEMENT, LAPTOP_CONTEXT('vivobook 15 i5 16gb 512gb'));
  assert.deepEqual(screened.items.map((item) => item.amount), [480, 500, 520]);
  assert.deepEqual([screened.spreadTrimmed, screened.skipped.PRICE_SPREAD], [true, 2]);
});

test('one model code named by two or more recognised sellers is the candidate\'s model; a code one seller names, or none, is not', () => {
  const sku = 'F1502ZA-OS34';
  const named = (seller, price, extra = '') => row(seller, price, `ASUS VivoBook 15 Slim ${sku} Laptop 15.6" Intel Core i5 16GB RAM 512GB SSD${extra}`);
  const two = screenListings([named('Walmart', 599), named('Best Buy', 629.99), row('Target', 650, 'Asus Vivobook 15 15.6" Core i5 16GB 512GB SSD')], REPLACEMENT, LAPTOP_CONTEXT('vivobook 15 i5 16gb 512gb'));
  assert.equal(two.sku, sku);
  assert.deepEqual(two.items.map((item) => [item.host, item.amount, item.model]), [['walmart.com', 599, sku], ['bestbuy.com', 629.99, sku]], 'the price is that model\'s: the family listing without the code stands aside');
  const one = screenListings([named('Walmart', 599), row('Best Buy', 629.99, 'ASUS Vivobook 15 15.6" Core i5 16GB RAM 512GB SSD')], REPLACEMENT, LAPTOP_CONTEXT('vivobook 15 i5 16gb 512gb'));
  assert.equal(one.sku, null);
  assert.equal(one.items.length, 2, 'the family-level listings still price the family');
});

test('an exact model code becomes the candidate: named, listed at the sellers, and labelled as seen in a search listing, not confirmed', async () => {
  const sku = 'F1502ZA-OS34';
  const listing = (seller, price) => row(seller, price, `ASUS VivoBook 15 Slim ${sku} Laptop 15.6" Intel Core i5 16GB RAM 512GB SSD`);
  const { response, result } = await replay(VIVO, 'Asus vivobook 15, core i5, 16gb, 512gb', { listings: { 'Asus VivoBook 15': [listing('Walmart', 599), listing('Best Buy', 629.99)], 'Lenovo IdeaPad Slim 3': [] } });
  assert.equal(isValidResearchResponseV2(response), true);
  assert.equal(response.successor.name, `Asus ${sku}`);
  assert.equal(response.successor.modelStatus, 'LISTED_PROVISIONAL');
  assert.deepEqual(response.pricing.evidence.map((entry) => [entry.sourceName, entry.modelRelation, entry.subjectModel, entry.expectedModel]), [['Walmart', 'EXACT', sku, sku], ['Best Buy', 'EXACT', sku, sku]]);
  assert.deepEqual(response.pricing.prices.filter((price) => price.candidate === 'SUCCESSOR').map((price) => [price.amount.low, price.model, price.verification, price.asOf]), [[599, sku, 'SEARCH_LISTING', '2026-10-30'], [629.99, sku, 'SEARCH_LISTING', '2026-10-30']]);
  assert.deepEqual([response.pricing.valuation.method, response.pricing.valuation.range], ['PROVISIONAL_LISTINGS', { currency: 'USD', low: 599, high: 629.99 }]);
  assert.equal(response.successor.concern, null, 'the family-name note no longer applies');
  assert.equal(result.meta.serperCredits, 5, 'no credit beyond the usual one search and two Shopping queries');
  assert.equal(response.warnings.includes('MODEL_NOT_VERIFIED'), false);
});

// ---- 4. links ---------------------------------------------------------------------------------------------------------------------------------

test('a Shopping link is kept only when it is a page on a registered seller\'s own site; Google, tracking and search pages are never kept', () => {
  assert.equal(sellerLink('https://www.walmart.com/ip/Asus-Vivobook-15/123456?athbdg=L1600#x'), 'https://www.walmart.com/ip/Asus-Vivobook-15/123456');
  for (const bad of ['https://www.google.com/search?q=x', 'https://www.google.com/aclk?sa=l', 'http://www.walmart.com/ip/1', 'https://user:pw@www.walmart.com/ip/1', 'https://evil.example/ip/1', 'not a url', '']) assert.equal(sellerLink(bad), null, bad);
  const rows = normalizeShopping({ shopping: [
    { title: 'Asus Vivobook 15', source: 'Walmart', price: '$499.00', link: 'https://www.walmart.com/ip/Asus-Vivobook-15/123456?x=1' },
    { title: 'Asus Vivobook 15 b', source: 'Best Buy', price: '$529.99', link: 'https://www.google.com/search?q=x' },
  ] });
  assert.deepEqual(rows.map((entry) => entry.url ?? null), ['https://www.walmart.com/ip/Asus-Vivobook-15/123456', null]);
});

test('a listing links to the seller\'s product page only when its own row did; otherwise the evidence is the seller\'s site and says so', () => {
  const rows = [
    { title: 'Asus Vivobook 15 15.6" Core 5 120U 16GB 512GB SSD', seller: 'Walmart', price: 499, url: 'https://www.walmart.com/ip/Asus-Vivobook-15/123456' },
    { title: 'Asus Vivobook 15 15.6" Core 5 120U 16GB 512GB SSD', seller: 'Best Buy', price: 529.99, url: 'https://www.walmart.com/ip/Another/1' },
    { title: 'Asus Vivobook 15 15.6" Core 5 120U 16GB 512GB SSD', seller: 'Target', price: 549.99, url: 'https://www.target.com/s/laptops' },
  ];
  const screened = screenListings(rows, REPLACEMENT, LAPTOP_CONTEXT('vivobook 15 i5 16gb 512gb'));
  assert.deepEqual(screened.items.map((item) => item.url ?? null), ['https://www.walmart.com/ip/Asus-Vivobook-15/123456', null, null], 'another seller\'s page, and a search page, are not this seller\'s product page');
});

test('the cache accepts a listing row with or without a link and still refuses a malformed one', async () => {
  const redis = createRedis();
  const cache = createEnrichmentCache({ redis });
  assert.equal(await cache.write('listings', 'q', [{ title: 't', seller: 'Walmart', price: 1 }, { title: 't', seller: 'Walmart', price: 2, url: 'https://www.walmart.com/ip/1' }]), true);
  assert.equal(await cache.write('listings', 'q2', [{ title: 't', seller: 'Walmart', price: 2, url: 5 }]), false);
});

// ---- 5. the two Production requests ---------------------------------------------------------------------------------------------------------

test('"Asus vivobook 15" as sent in Production: no headline range from mixed configurations, one question asks for the configuration', async () => {
  const { response, result, calls } = await replay(VIVO, 'Asus vivobook 15');
  assert.equal(isValidResearchResponseV2(response), true);
  const { valuation } = response.pricing;
  assert.equal(valuation.range?.low === 249.99 && valuation.range?.high === 999.99, false, 'the Production headline');
  assert.notEqual(valuation.method, 'PROVISIONAL_LISTINGS');
  assert.deepEqual(valuation.comparables.map((row) => response.pricing.prices.find((price) => price.id === row.priceId).kind), valuation.comparables.map(() => 'AI_ESTIMATE'), 'only the labelled estimate is left');
  const listed = response.pricing.prices.filter((price) => price.kind === 'CURRENT_RETAIL_NEW');
  assert.ok(listed.length >= 1 && listed.every((price) => price.configConfirmed === false), 'named sellers are shown as examples, not as a value');
  assert.deepEqual(response.clarify, ['What processor, RAM and storage does it have? (for example Core i5, 16 GB, 512 GB)']);
  assert.deepEqual(response.original.characteristics, ['15-inch display'], 'the model\'s guess at the processor, memory and storage is not shown as a characteristic of the machine');
  assert.deepEqual(result.meta.enrichment.config, { kind: 'laptop', complete: false, missing: ['processor', 'RAM', 'storage'] });
  assert.deepEqual([calls.filter(([kind]) => kind === 'search').length, calls.filter(([kind]) => kind === 'shopping').length, result.meta.serperCredits], [1, 2, 5], 'the same Serper spend as before');
  assert.deepEqual(response.suggestions.map((item) => item.modelStatus), ['FAMILY_LEVEL', 'FAMILY_LEVEL'], 'no exact model is claimed without evidence');
});

test('"Asus vivobook 15" with its configuration given: the Shopping query carries it, and the question is not asked again', async () => {
  const { response, calls } = await replay(VIVO, 'Asus vivobook 15, core 3, 8gb, 256gb');
  assert.equal(isValidResearchResponseV2(response), true);
  assert.deepEqual(calls.filter(([kind]) => kind === 'shopping').map(([, asked]) => asked), ['Asus VivoBook 15 Series laptop Core i3 8GB 256GB', 'Lenovo IdeaPad Slim 3 laptop Core i3 8GB 256GB']);
  assert.deepEqual(response.clarify, [], 'the model\'s own question about the configuration is dropped once it is given');
  const used = response.pricing.valuation.comparables.map((row) => response.pricing.prices.find((price) => price.id === row.priceId));
  assert.ok(used.length >= 1 && used.every((price) => price.kind === 'CURRENT_RETAIL_NEW' && price.configConfirmed !== false));
  const range = response.pricing.valuation.range;
  assert.ok(range.high / range.low <= LISTING_SPREAD_RATIO, `${range.low} to ${range.high}`);
});

test('shoppingQuery: a laptop is searched with its configuration; every other query is exactly as before', () => {
  assert.equal(shoppingQuery({ name: 'Asus VivoBook 15 Series' }, { category: 'electronics', profile: 'electronics', spec: null, request: wantedConfig('vivobook 15 i5 16gb 512gb') }), 'Asus VivoBook 15 Series laptop Core i5 16GB 512GB');
  assert.equal(shoppingQuery({ name: 'LG C-series OLED, current generation' }, { category: 'tv', profile: 'tv', spec: { kind: 'inches', value: 55 } }), 'LG C-series OLED 55 inch TV');
});

test('"nintendo wii" when the provider\'s answer could not be read: recognised from the results, reported as an incomplete request, never as an unknown product', async () => {
  const { response, result } = await replay(WII, 'nintendo wii', { fail: 'PROVIDER_MALFORMED_JSON' });
  assert.equal(isValidResearchResponseV2(response), true);
  assert.deepEqual([response.status, response.original.identity, response.original.confidence, response.category], ['PARTIAL', 'Nintendo Wii', 'LOW', 'electronics']);
  assert.equal(response.warnings.includes('PROVIDER_UNAVAILABLE'), true);
  assert.equal(response.warnings.includes('PRODUCT_NOT_IDENTIFIED'), false);
  assert.deepEqual([response.successor, response.suggestions, response.pricing.prices, response.pricing.evidence, response.original.characteristics], [null, [], [], [], []], 'nothing is invented: no specification, price, source or replacement');
  assert.match(response.original.uncertainty, /did not finish/);
  assert.equal(result.meta.enrichment.recognised, true);
  assert.equal(result.meta.errorCode, 'PROVIDER_MALFORMED_JSON');
});

test('a product the results do not agree on stays unrecognised, and the model itself saying it cannot place an item is still "not identified"', async () => {
  assert.equal(recognizeFromSources('nintendo wii', WII.history).identity, 'Nintendo Wii');
  assert.equal(recognizeFromSources('nintendo wii', WII.history.slice(0, 1)), null, 'one site is not agreement');
  assert.equal(recognizeFromSources('nintendo wii', [{ title: 'Wii', url: 'https://a.example/x', snippet: '' }, { title: 'Wii', url: 'https://b.example/y', snippet: '' }]), null, 'every word of the name must appear');
  assert.equal(recognizeFromSources('wii', WII.history), null, 'one word is not a product name');
  assert.equal(recognizeFromSources('the new', WII.history), null, 'filler is not a name');
  assert.equal(recognizeFromSources('nintendo wii', null), null);
  assert.deepEqual(['nintendo wii', 'ps5 slim', 'lg c3 55 inch oled tv', 'Asus vivobook 15'].map(tidyName), ['Nintendo Wii', 'PS5 Slim', 'LG C3 55 Inch OLED TV', 'Asus Vivobook 15']);
  assert.deepEqual(detectCategory('nintendo wii'), { category: 'electronics', profile: 'electronics' });
  assert.deepEqual(detectCategory('wii u'), { category: 'electronics', profile: 'electronics' });
  // The provider answered and could not place the item: that is a verdict about the item, so it keeps its warning and is not "recognised" from results.
  const identify = async () => ({ ok: true, ...normalizeIdentification({ original: { identity: null, confidence: 'low' } }, 'nintendo wii'), meta: { requestSent: true, usage: {}, errorCode: null } });
  const result = await researchLiveV2('nintendo wii', { env: { SERPER_API_KEY: 'k' }, now: () => NOW, identify, serper: async () => WII.history, serperBudget: BUDGET, enrichCache: null, enrich: true });
  const response = buildResearchResponseV2(result.input, { requestId: 'r', elapsedMs: 0, answerSource: 'AI_ESTIMATE', now: NOW });
  assert.deepEqual([response.status, response.original.identity, response.warnings.includes('PRODUCT_NOT_IDENTIFIED'), response.warnings.includes('PROVIDER_UNAVAILABLE')], ['GUIDANCE_ONLY', null, true, false]);
});

test('the validator keeps the two apart: a provider failure may omit "not identified", an unknown product may not', () => {
  const build = (warnings) => buildResearchResponseV2({ category: 'unknown', profile: 'unknown', original: { identity: null, confidence: 'low', characteristics: [], uncertainty: null }, requirements: [], successor: null, suggestions: [], clarify: [], warnings, pricing: { referenceDate: '2026-10-30', tier: { level: 'UNKNOWN', basis: 'UNKNOWN' }, evidence: [], prices: [] } },
    { requestId: 'r', elapsedMs: 0, answerSource: 'CATEGORY_GUIDANCE', now: NOW });
  const failed = build(['PROVIDER_UNAVAILABLE']);
  assert.equal(failed.warnings.includes('PRODUCT_NOT_IDENTIFIED'), false);
  assert.equal(isValidResearchResponseV2(failed), true);
  const unknown = build([]);
  assert.equal(unknown.warnings.includes('PRODUCT_NOT_IDENTIFIED'), true);
  assert.equal(isValidResearchResponseV2({ ...unknown, warnings: unknown.warnings.filter((code) => code !== 'PRODUCT_NOT_IDENTIFIED') }), false, 'an unknown product cannot shed its warning');
});

// ---- 6. reading the provider's reply ---------------------------------------------------------------------------------------------------------

test('a reply that is nearly JSON is read; what cannot be read is refused, and nothing is added', () => {
  const whole = '{"category":"electronics","original":{"identity":"Nintendo Wii game console","confidence":"medium"},"suggestions":[{"name":"Nintendo Switch","why":"Current Nintendo console"}]}';
  assert.equal(parseModelJson(whole).original.identity, 'Nintendo Wii game console');
  assert.equal(parseModelJson('```json\n' + whole + '\n```').category, 'electronics');
  assert.equal(parseModelJson('{"a":1,"b":[1,2,],}').b.length, 2, 'trailing commas');
  const cut = whole.slice(0, whole.indexOf('"why"') + 20);
  const read = parseModelJson(cut);
  assert.equal(read.original.identity, 'Nintendo Wii game console', 'a reply cut off mid-way keeps what was complete');
  assert.deepEqual(read.suggestions, [{ name: 'Nintendo Switch' }], 'and the half-written item is cut back, not completed');
  assert.equal(parseModelJson('{"original":{"identity":"Wii","confidence":"me').original.identity, 'Wii');
  for (const bad of ['', 'sorry, I cannot help', '[1,2,3]', '{', 'not json {"a":}']) assert.equal(parseModelJson(bad), null, JSON.stringify(bad));
});

test('the identification prompt asks for a known product to be identified at line level, and not to assume a laptop\'s hardware', () => {
  const prompt = buildIdentifyPrompt('nintendo wii');
  assert.match(prompt, /identified even without a model number/);
  assert.match(prompt, /Never assume a laptop's processor, memory or storage/);
  assert.match(prompt, /Never write an exact model code/, 'the existing rule is unchanged');
});

// ---- 7. through the real handler -------------------------------------------------------------------------------------------------------------

const TOKEN = 'test-token-0123456789-abcdefghijkl';
const ENV = Object.freeze({ ITEMASSIST_RESEARCH_ENABLED: 'true', ITEMASSIST_REPLACEMENT_API_TOKEN: TOKEN, GEMINI_API_KEY: 'gemini-test-key-0123456789abcdef', SERPER_API_KEY: 'serper-test-key-0123456789abcdef', ITEMASSIST_RESEARCH_DAILY_CALL_LIMIT: '50', ITEMASSIST_RESEARCH_LIVE_CONTRACT: 'research.2', ITEMASSIST_RESEARCH_ENRICHMENT: 'on' });
async function ask(query, { gemini, history = () => WII.history, listings = () => [] } = {}) {
  const lines = [];
  const fetchImpl = routedFetch({ gemini, history, listings });
  const handler = createItemAssistResearchHandler({ env: ENV, logger: { info: (line) => lines.push(String(line)) }, now: () => NOW, redisFactory: async () => createRedis(), requestIdFactory: () => 'req-1', fetchImpl });
  const res = { statusCode: 200, body: null, headers: {}, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, setHeader() {} };
  await handler({ method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: { query } }, res);
  return { res, log: lines.map((line) => JSON.parse(line)).at(-1), fetchImpl };
}

test('through the handler: a reply the provider returned that cannot be read is logged with its HTTP status and never as an unknown product', async () => {
  const { res, log } = await ask('nintendo wii', { gemini: () => jsonResponse({ candidates: [{ content: { parts: [{ text: 'I think you mean the Nintendo Wii console. {"original": ' }] } }], usageMetadata: {} }) });
  assert.equal(res.statusCode, 200);
  assert.equal(isValidResearchResponseV2(res.body), true);
  assert.deepEqual([res.body.status, res.body.original.identity, res.body.meta.answerSource], ['PARTIAL', 'Nintendo Wii', 'CATEGORY_GUIDANCE']);
  assert.deepEqual([log.providerErrorCode, log.providerHttpStatus, log.status], ['PROVIDER_MALFORMED_JSON', 200, 'PARTIAL']);
  assert.equal(JSON.stringify(log).includes('wii'), false, 'the query is never logged');
});

test('through the handler: a provider HTTP error logs its status code, so a billing failure can be told from a bad reply', async () => {
  const { log } = await ask('nintendo wii', { gemini: () => jsonResponse({}, 402) });
  assert.deepEqual([log.providerErrorCode, log.providerHttpStatus], ['PROVIDER_HTTP_ERROR', 402]);
});

test('through the handler: a reply cut off after the identification is still an answer, not a failed request', async () => {
  const reply = JSON.stringify({ category: 'electronics', profile: 'electronics', original: { identity: 'Nintendo Wii game console', confidence: 'medium', characteristics: ['Motion controls'], uncertainty: null }, tier: 'VALUE', successor: { name: 'Nintendo Switch', why: 'Current Nintendo console', confidence: 'medium' }, suggestions: [{ name: 'Sony PlayStation 5', why: 'Current console', confidence: 'medium' }] });
  const { res, log } = await ask('nintendo wii', { gemini: () => jsonResponse(geminiBody(reply.slice(0, reply.indexOf('"suggestions"') - 1) + ',"suggestions":[{"name":"Sony PlayStation 5","why":"Curr')) });
  assert.equal(isValidResearchResponseV2(res.body), true);
  assert.deepEqual([res.body.status, res.body.original.identity, res.body.successor?.name, res.body.meta.answerSource], ['OK', 'Nintendo Wii game console', 'Nintendo Switch', 'AI_ESTIMATE']);
  assert.equal('providerErrorCode' in log, false);
});

test('shopping rows from the fake provider carry a Google link, and none of it reaches an answer', async () => {
  const rows = [row('Walmart', 499, 'Asus Vivobook 15 15.6" Core 5 120U 16GB 512GB SSD'), row('Best Buy', 529.99, 'ASUS Vivobook 15 Core 5 120U 16GB RAM 512GB SSD')];
  assert.match(rawShopping([{ title: 't', seller: 'Walmart', price: 1 }]).shopping[0].link, /google\.com/);
  const { res } = await ask('Asus vivobook 15, core i5, 16gb, 512gb', {
    gemini: () => jsonResponse(geminiBody(VIVO.identification)), history: () => VIVO.history, listings: (asked) => (asked.startsWith('Asus VivoBook') ? rows : []),
  });
  assert.equal(isValidResearchResponseV2(res.body), true);
  assert.deepEqual(res.body.pricing.evidence.map((entry) => new URL(entry.sourceUrl).pathname), ['/', '/'], 'the seller\'s site, as before');
  assert.equal(JSON.stringify(res.body).includes('google.com'), false);
});
