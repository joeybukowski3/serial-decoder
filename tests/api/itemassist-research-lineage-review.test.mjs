import test from 'node:test';
import assert from 'node:assert/strict';
import { researchLiveV2 } from '../../lib/itemassist-research/enrich/orchestrate.js';
import { normalizeIdentification } from '../../lib/itemassist-research/enrich/identify.js';
import { buildResearchResponseV2, isValidResearchResponseV2 } from '../../lib/itemassist-research/contract-v2.js';
import { resolveLineage } from '../../lib/itemassist-research/enrich/lineage.js';
import { sizeAgreement } from '../../lib/itemassist-research/enrich/product-tokens.js';
import { screenListings } from '../../lib/itemassist-research/enrich/listings.js';

// OFFLINE ONLY. Each test reproduces a concrete input an independent review of the generation-discovery branch found, so a regression fails here.
// Synthetic rows are titled the way retailers title listings; no provider, key or network is touched.
const NOW = Date.UTC(2026, 10, 11, 15);

const identification = (successor, over = {}) => ({
  category: 'tv', profile: 'tv',
  original: { identity: 'LG C3 series 55-inch 4K OLED evo smart TV (2023)', confidence: 'high', characteristics: ['55-inch OLED', '4K'], uncertainty: null },
  tier: 'PREMIUM', requirements: [],
  successor: { name: successor, why: 'Continues the same line.', differences: 'Newer processor.', concern: null, confidence: 'high', tierVsOriginal: 'SAME', comparison: [] },
  suggestions: [], estimates: { originalNew: { low: 1500, high: 2000 }, replacementNew: { low: 1200, high: 1800 } }, clarify: [], ...over,
});
const original = (identity) => ({ identity, confidence: 'high', characteristics: ['4K'], uncertainty: null });

async function run({ query = 'LG C3 55-inch TV', reply = identification('LG C-series OLED'), rows, only = /^(LG|Samsung)/ }) {
  const result = await researchLiveV2(query, {
    env: { SERPER_API_KEY: 'offline-key' }, now: () => NOW,
    identify: async (text) => ({ ok: true, ...normalizeIdentification(reply, text), meta: { requestSent: true, usage: {}, httpStatus: 200 } }),
    serper: async ({ kind, query: text }) => (kind === 'search' ? [] : (only.test(text) ? rows : [])),
    serperBudget: { reserve: async (credits) => ({ allowed: true, status: 'allowed', credits }) }, enrichCache: null, enrich: true,
  });
  const response = buildResearchResponseV2(result.input, { requestId: 'offline', elapsedMs: 1, answerSource: 'AI_ESTIMATE', now: NOW });
  assert.equal(isValidResearchResponseV2(response), true);
  return { response, stats: result.meta.enrichment };
}
const lg = (gen, size, code, seller, price) => ({ title: `LG ${size}" Class OLED evo AI ${gen} 4K Smart TV${code ? ` ${code}` : ''}`, seller, price });
const sam = (code, label, seller, price) => ({ title: `Samsung 65" Class ${label} 4K Smart TV ${code}`, seller, price });
const current = (response) => response.pricing.prices.filter((item) => item.kind === 'CURRENT_RETAIL_NEW' && item.candidate === 'SUCCESSOR' && item.sizeConfirmed !== false);
const amounts = (list) => list.map((item) => item.amount.low).sort((a, b) => a - b);
const grammarFor = (query, name, identity = query) => resolveLineage({ category: 'tv', query, identity, candidateName: name, now: NOW }).grammar;

test('H1: generations are compared by model year, so an old-era code (LG C9, Samsung R/T) never reads as newer than a current one', async () => {
  const lgGrammar = grammarFor('LG C3 55 inch', 'LG C-series OLED');
  const samGrammar = grammarFor('Samsung S90C 65 inch', 'Samsung S90-series OLED');
  const year = (grammar, title) => grammar.parse(title, 2026).ordinal;
  assert.deepEqual(['C9', 'C1', 'C3', 'C6'].map((gen) => year(lgGrammar, `LG OLED evo ${gen} 4K Smart TV`)), [2019, 2021, 2023, 2026]);
  assert.deepEqual(['R', 'T', 'A', 'C', 'D', 'F', 'H'].map((letter) => year(samGrammar, `Samsung QN65Q80${letter}AFXZA`)), [2019, 2020, 2021, 2023, 2024, 2025, 2026]);
  assert.equal(samGrammar.parse('Samsung QN65Q80EAFXZA', 2026), null, 'a model-year letter this table does not know is not guessed');

  // A Q80T original (2020): the Q80A (2021) and Q80D (2024) are newer; the letter wrap must not make them "older".
  const samsung = await run({
    query: 'Samsung QN65Q80T 65 inch', reply: identification('Samsung Q80-series QLED', { original: original('Samsung QN65Q80T 65-inch QLED (2020)') }),
    rows: [sam('QN65Q80DAFXZA', 'Q80D QLED', 'Best Buy', 1000), sam('QN65Q80AAFXZA', 'Q80A QLED', 'Abt', 900)], only: /^Samsung/,
  });
  assert.equal(samsung.stats.generations.SUCCESSOR.chosen, 'Q80D');

  // A leftover 2019 LG C9 does not beat the current C6 as "newest".
  const old = await run({ rows: [lg('C9', 55, 'OLED55C9PUA', 'Best Buy', 900), lg('C6', 55, 'OLED55C6PUA', 'Target', 1400), lg('C5', 55, 'OLED55C5PUA', 'Walmart', 1200)] });
  assert.equal(old.stats.generations.SUCCESSOR.chosen, 'C6');
  assert.deepEqual(amounts(current(old.response)), [1400]);

  // A C9 original (2019) still finds a newer C-series generation.
  const nine = await run({ query: 'LG C9 55 inch OLED', reply: identification('LG C-series OLED', { original: original('LG C9 OLED 55-inch (2019)') }), rows: [lg('C6', 55, 'OLED55C6PUA', 'Target', 1400), lg('C1', 55, 'OLED55C1PUB', 'Abt', 1000)] });
  assert.equal(nine.stats.generations.SUCCESSOR.chosen, 'C6');
});

test('H2: an accessory that names a generation cannot choose it or be priced as the television', async () => {
  const rows = [lg('C5', 55, 'OLED55C5PUA', 'Best Buy', 1200), lg('C5', 55, 'OLED55C5PUA', 'Target', 1250), { title: 'LG Magic Remote for OLED C6 TV 55"', seller: 'Walmart', price: 40 }];
  const { response, stats } = await run({ rows });
  assert.equal(stats.generations.SUCCESSOR.chosen, 'C5');
  assert.deepEqual(amounts(current(response)), [1200, 1250]);
  assert.equal(JSON.stringify(response.pricing).includes('"low":40,'), false);
  // A title that names a generation and a size but is not a television (no 4K, UHD or Smart) is not counted either.
  const stand = await run({ rows: [lg('C5', 55, 'OLED55C5PUA', 'Best Buy', 1200), { title: 'LG OLED C6 55" replacement table stand legs', seller: 'Abt', price: 35 }] });
  assert.equal(stand.stats.generations.SUCCESSOR.chosen, 'C5');
});

test('M1: a bare series in the query does not turn every generation into the original', () => {
  // (Through the whole pipeline the engine's existing repeatsOriginal rule drops a candidate that repeats the typed "S90" first, so the listing screen is exercised directly.)
  const rows = [{ title: 'Samsung 65" Class S90F OLED 4K Smart TV QN65S90FAFXZA', seller: 'Best Buy', price: 1500 }, { title: 'Samsung 65" Class S90D OLED 4K Smart TV QN65S90DAFXZA', seller: 'Abt', price: 1300 }];
  const lineage = resolveLineage({ category: 'tv', query: 'Samsung S90 65 inch OLED', identity: 'Samsung S90 65-inch OLED', candidateName: 'Samsung S90-series OLED', now: NOW });
  assert.equal(lineage.originalOrdinal, null, 'no generation is known for the original');
  const screened = screenListings(rows, { name: 'Samsung S90-series OLED' }, { category: 'tv', spec: { kind: 'inches', value: 65 }, focuses: ['S90'], lineage });
  assert.deepEqual(screened.originals, [], 'no row is taken for the original merely because it shares the series');
  assert.equal(screened.generation.label, 'S90F');
  assert.deepEqual(screened.items.map((item) => item.amount), [1500]);
  // With the original's generation known, only a row of that generation is the original.
  const known = resolveLineage({ category: 'tv', query: 'Samsung S90D 65 inch OLED', identity: 'Samsung S90D', candidateName: 'Samsung S90-series OLED', now: NOW });
  const again = screenListings(rows, { name: 'Samsung S90-series OLED' }, { category: 'tv', spec: { kind: 'inches', value: 65 }, focuses: ['S90D'], lineage: known });
  assert.deepEqual(again.originals.map((item) => item.amount), [1300]);
  assert.equal(again.generation.label, 'S90F');
});

test('M2: a refurbished or rental set does not create a "newer generation was seen" note', async () => {
  const rows = [lg('C5', 55, 'OLED55C5PUA', 'Best Buy', 1200), { title: 'Refurbished LG OLED evo C6 65" 4K Smart TV OLED65C6PUA', seller: 'Walmart', price: 900 }, { title: 'LG OLED evo C6 55" 4K Smart TV OLED55C6PUA rental $39/month', seller: 'Abt', price: 39 }];
  const { response, stats } = await run({ rows });
  assert.equal(stats.generations.SUCCESSOR.skipped, null);
  assert.equal(response.successor.concern, null);
});

test('M3: a title that only omits the word OLED is not reported as a failed essential requirement; one that states another display class is', async () => {
  const noWord = { title: 'Samsung - 65" Class S90F Series 4K UHD Smart Tizen TV QN65S90FAFXZA', seller: 'Best Buy', price: 1500 };
  const good = { title: 'Samsung 65" S90D OLED 4K QN65S90DAFXZA', seller: 'Abt', price: 1300 };
  const reply = identification('Samsung S90-series OLED', { original: original('Samsung S90C 65-inch QD-OLED smart TV (2023)') });
  const query = 'Samsung S90C 65 inch OLED';
  const first = await run({ query, reply, rows: [noWord, good], only: /^Samsung/ });
  assert.equal(first.stats.generations.SUCCESSOR.chosen, 'S90D');
  assert.doesNotMatch(String(first.response.successor.concern), /essential/);
  const second = await run({ query, reply, rows: [{ title: 'Samsung 65" Class S90F QLED 4K Smart TV QN65S90FAFXZA', seller: 'Best Buy', price: 900 }, good], only: /^Samsung/ });
  assert.equal(second.stats.generations.SUCCESSOR.skipped, 'ESSENTIAL');
});

test('M4: unlisted-seller examples are limited to the model code the presented model is named by', async () => {
  const rows = [
    { title: 'LG 55" OLED evo AI C6 4K Smart TV OLED55C6PUA with 2 Year Amber Protection Plan', seller: 'Best Buy', price: 999.99 },
    { title: 'LG 55" Class OLED evo AI C6 4K Smart TV OLED55C6PUA', seller: 'Foo TV Shop', price: 1400 },
    { title: 'LG 55" Class OLED evo AI C6 4K Smart TV OLED55C6AUA', seller: 'Bar Electronics', price: 1100 },
  ];
  const { response } = await run({ rows });
  assert.equal(response.successor.name, 'LG C6 OLED 55-inch (OLED55C6PUA)');
  assert.deepEqual((response.successor.otherSellerListings || []).map((entry) => [entry.seller, entry.amount]), [['Foo TV Shop', 1400]]);
});

test('L1-L4: an unexpected category does not throw; bare Samsung series names, short LG codes and QE codes work; soundbar codes do not parse', () => {
  assert.equal(resolveLineage({ category: 'constructor', query: 'LG C3', candidateName: 'LG C-series OLED', now: NOW }), null);
  assert.equal(resolveLineage({ category: '__proto__', query: 'LG C3', candidateName: 'LG C-series OLED', now: NOW }), null);
  const bare = resolveLineage({ category: 'tv', query: 'Samsung S90C 65 inch', identity: 'Samsung S90C', candidateName: 'Samsung S90 OLED', now: NOW });
  assert.deepEqual([bare.series, bare.originalOrdinal], ['S90', 2023]);
  assert.equal(grammarFor('LG C3', 'LG C-series OLED').parse('LG OLED55B6P 55" OLED 4K', 2026).label, 'B6');
  const samGrammar = grammarFor('Samsung S90C', 'Samsung S90-series OLED');
  assert.equal(samGrammar.parse('Samsung HW-Q60D 3.1ch soundbar', 2026), null);
  assert.equal(samGrammar.parse('Samsung Q60D QLED 4K', 2026).label, 'Q60D');
  assert.equal(sizeAgreement({ kind: 'inches', value: 65 }, 'tv', 'Samsung QE65S95DATXZT OLED'), 'MATCH');
  assert.equal(sizeAgreement({ kind: 'inches', value: 55 }, 'tv', 'Samsung QE65S95DATXZT OLED'), 'MISMATCH');
});
