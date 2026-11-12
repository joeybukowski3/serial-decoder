import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { researchLiveV2 } from '../../lib/itemassist-research/enrich/orchestrate.js';
import { normalizeIdentification } from '../../lib/itemassist-research/enrich/identify.js';
import { buildResearchResponseV2, isValidResearchResponseV2 } from '../../lib/itemassist-research/contract-v2.js';
import { normalizeSpecComparison } from '../../lib/itemassist-research/evidence-blocks.js';
import { buildSpecComparison, compareSpecs, factsOf } from '../../lib/itemassist-research/enrich/spec-compare.js';

// OFFLINE ONLY. An original-versus-candidate comparison built only from text that states each attribute: the person's words, the original manufacturer page's result
// title, and retailer listing titles. A listing title is the seller's wording, labelled as such. Nothing is inferred from a generation, and the model's own reply
// (which says "120 Hz" about the original below) is never a source.
const FX = (file) => JSON.parse(readFileSync(new URL(`../fixtures/itemassist-research/${file}`, import.meta.url), 'utf8'));
const S1 = FX('s1-rows.json');
const NOW = Date.UTC(2026, 10, 11, 15);
const LG_REPLY = {
  category: 'tv', profile: 'tv', tier: 'PREMIUM', requirements: [],
  original: { identity: 'LG C3 series 55-inch 4K OLED evo smart TV (2023)', confidence: 'high', characteristics: ['55-inch OLED', '4K', '120 Hz', 'HDMI 2.1'], uncertainty: null },
  successor: { name: 'LG C-series OLED', why: 'Continues the line, with a brighter and faster panel.', differences: 'Improved processor and brighter display.', concern: null, confidence: 'high', comparison: [] },
  suggestions: [], estimates: { originalNew: { low: 1500, high: 2000 }, replacementNew: { low: 1200, high: 1800 } }, clarify: [],
};
const row = (title, seller, price) => ({ title, seller, price });

async function answer(history, listings, { query = 'LG C3 55-inch TV', reply = LG_REPLY } = {}) {
  const result = await researchLiveV2(query, {
    env: { SERPER_API_KEY: 'k' }, now: () => NOW, enrichCache: null, enrich: true,
    identify: async (q) => ({ ok: true, ...normalizeIdentification(reply, q), meta: { requestSent: true, usage: {}, httpStatus: 200 } }),
    serper: async ({ kind }) => (kind === 'search' ? history : listings), serperBudget: { reserve: async (credits) => ({ allowed: true, status: 'allowed', credits }) },
  });
  const response = buildResearchResponseV2(result.input, { requestId: 'r', elapsedMs: 1, answerSource: 'AI_ESTIMATE', now: NOW });
  assert.equal(isValidResearchResponseV2(response), true);
  return response;
}
const byAttribute = (comparison) => Object.fromEntries(comparison.rows.map((entry) => [entry.attribute, entry]));
const clone = (value) => JSON.parse(JSON.stringify(value));

test('what a title states: size, display class, resolution and refresh rate, and nothing when it states two different things', () => {
  assert.deepEqual(factsOf('LG 55" OLED evo C6 4K Smart TV oled55c6pua').SCREEN_SIZE, '55-inch');
  const full = factsOf('Samsung 65-Inch Class QLED 4K Q80D 120Hz Smart TV with Dolby Vision, HDMI 2.1');
  assert.deepEqual([full.SCREEN_SIZE, full.DISPLAY_CLASS, full.RESOLUTION, full.REFRESH_RATE, full.DOLBY_VISION, full.HDMI_2_1], ['65-inch', 'QLED', '4K', '120 Hz', 'Dolby Vision', 'HDMI 2.1']);
  assert.equal(factsOf('LG OLED evo AI C6 4K Smart webOS TV').SCREEN_SIZE, null, 'no size stated');
  assert.equal(factsOf('LG OLED evo AI C6 4K Smart webOS TV').REFRESH_RATE, null, 'no refresh rate stated');
  assert.equal(factsOf('55 inch or 65 inch OLED TV').SCREEN_SIZE, null, 'two sizes are not a size');
  assert.equal(factsOf('OLED vs QLED 4K comparison TV').DISPLAY_CLASS, null, 'two classes are not a class');
  assert.equal(factsOf('Samsung QD-OLED S90D 4K').DISPLAY_CLASS, 'QD-OLED');
  assert.equal(factsOf('LG 55" TV', 55).SCREEN_SIZE, '55-inch');
  assert.equal(factsOf('Made in 2024 with 240 fps motion').REFRESH_RATE, null, 'only Hz is a refresh rate');
});

test('two sources that disagree leave a side not established; the person\'s own words come first', () => {
  const sources = (texts, basis = 'LISTING_TITLE') => texts.map((text) => ({ basis, text }));
  const conflict = compareSpecs({ original: sources(['LG 55" OLED 4K'], 'USER_STATED'), candidate: sources(['LG 55" OLED 4K 120Hz', 'LG 55" OLED 4K 144Hz']) });
  assert.equal(byAttribute(conflict).REFRESH_RATE.candidate, null, 'listings state different rates: not established, none picked');
  assert.equal(byAttribute(conflict).REFRESH_RATE.result, 'NOT_ESTABLISHED');
  const user = compareSpecs({ original: [{ basis: 'USER_STATED', text: 'my 77 inch OLED' }, { basis: 'LISTING_TITLE', text: 'LG 65" OLED' }], candidate: sources(['LG 77" OLED']) });
  assert.deepEqual([byAttribute(user).SCREEN_SIZE.original.value, byAttribute(user).SCREEN_SIZE.original.basis, byAttribute(user).SCREEN_SIZE.result], ['77-inch', 'USER_STATED', 'MATCH']);
  const different = compareSpecs({ original: sources(['LG 55" OLED 4K 120Hz'], 'USER_STATED'), candidate: sources(['LG 55" OLED 8K 144Hz']) });
  assert.deepEqual([byAttribute(different).RESOLUTION.result, byAttribute(different).REFRESH_RATE.result], ['DIFFERENT', 'DIFFERENT']);
  assert.deepEqual(different.compared, ['SCREEN_SIZE', 'DISPLAY_CLASS', 'RESOLUTION', 'REFRESH_RATE']);
  assert.deepEqual(different.notEstablished, []);
});

test('LG C3 to C6 from saved results: size, display class and resolution are compared with their basis; refresh rate and the rest stay not established', async () => {
  const response = await answer(S1.history['lg-c3-55'], S1.listings['lg-c3-55'].rows);
  const comparison = response.successor.specComparison;
  const rows = byAttribute(comparison);
  assert.deepEqual([rows.SCREEN_SIZE.original, rows.SCREEN_SIZE.candidate.basis, rows.SCREEN_SIZE.result], [{ value: '55-inch', basis: 'USER_STATED', sources: 1 }, 'LISTING_TITLE', 'MATCH']);
  assert.deepEqual([rows.DISPLAY_CLASS.original.value, rows.DISPLAY_CLASS.original.basis, rows.DISPLAY_CLASS.candidate.value, rows.DISPLAY_CLASS.result], ['OLED', 'MANUFACTURER_PAGE_TITLE', 'OLED', 'MATCH']);
  assert.deepEqual([rows.RESOLUTION.original.value, rows.RESOLUTION.candidate.value, rows.RESOLUTION.result], ['4K', '4K', 'MATCH']);
  assert.deepEqual(rows.REFRESH_RATE, { attribute: 'REFRESH_RATE', original: null, candidate: null, result: 'NOT_ESTABLISHED' });
  assert.deepEqual(comparison.compared, ['SCREEN_SIZE', 'DISPLAY_CLASS', 'RESOLUTION']);
  assert.ok(comparison.notEstablished.includes('REFRESH_RATE'));
  // The model's own claims about the original (120 Hz, HDMI 2.1) and its wording about the candidate (brighter, faster, improved) are not sources.
  assert.equal(JSON.stringify(comparison).includes('120 Hz'), false);
  assert.equal(JSON.stringify(comparison).includes('HDMI'), false);
  assert.equal(/brighter|faster|improved|better|upgrade/i.test(JSON.stringify(comparison)), false);
  for (const entry of comparison.rows) if (entry.candidate) assert.equal(entry.candidate.basis, 'LISTING_TITLE', 'a candidate attribute is only ever what listing titles state');
});

test('a newer generation does not make a feature known: a refresh rate stated for the candidate alone stays not compared', async () => {
  const rows = [row('LG 55" OLED evo C6 4K 144Hz Smart TV OLED55C6PUA', 'Best Buy', 1299.99), row('LG 55" OLED evo C6 4K 144Hz Smart TV OLED55C6PUA', 'Walmart', 1309.99)];
  const response = await answer([], rows);
  const refresh = byAttribute(response.successor.specComparison).REFRESH_RATE;
  assert.deepEqual([refresh.original, refresh.candidate.value, refresh.candidate.sources, refresh.result], [null, '144 Hz', 2, 'NOT_ESTABLISHED']);
  assert.ok(response.successor.specComparison.notEstablished.includes('REFRESH_RATE'), 'stated for the candidate only: there is nothing to compare it with');
});

test('a refresh rate the person states and the listings state is compared; a listing that states a different one is a difference', async () => {
  const rows = (rate) => [row(`LG 55" OLED evo C6 4K ${rate}Hz Smart TV OLED55C6PUA`, 'Best Buy', 1299.99)];
  const same = await answer([], rows(120), { query: 'LG C3 55-inch TV 120Hz' });
  assert.deepEqual([byAttribute(same.successor.specComparison).REFRESH_RATE.original.basis, byAttribute(same.successor.specComparison).REFRESH_RATE.result], ['USER_STATED', 'MATCH']);
  const other = await answer([], rows(144), { query: 'LG C3 55-inch TV 120Hz' });
  assert.equal(byAttribute(other.successor.specComparison).REFRESH_RATE.result, 'DIFFERENT');
});

test('conflicting listing titles for the candidate leave the attribute not established, and an optional feature appears only when a source states it', async () => {
  const rows = [row('LG 55" OLED evo C6 4K 120Hz Smart TV OLED55C6PUA', 'Best Buy', 1299.99), row('LG 55" OLED evo C6 4K 144Hz Smart TV OLED55C6PUA', 'Walmart', 1309.99)];
  const response = await answer([], rows);
  const comparison = response.successor.specComparison;
  assert.equal(byAttribute(comparison).REFRESH_RATE.candidate, null);
  assert.deepEqual(comparison.rows.map((entry) => entry.attribute), ['SCREEN_SIZE', 'DISPLAY_CLASS', 'RESOLUTION', 'REFRESH_RATE'], 'no optional row when no source states one');
});

test('the original manufacturer page of a different model is not a source; the original side then falls back to the other sources', async () => {
  const history = S1.history['lg-c3-55'].map((entry) => (/lg-oled55c3pua-oled-4k-tv/.test(entry.url) ? { ...entry, url: 'https://www.lg.com/us/tvs/lg-oled55c4pua-oled-4k-tv', title: 'LG 55 inch QLED 8K C4 TV OLED55C4PUA' } : entry));
  const response = await answer(history, S1.listings['lg-c3-55'].rows);
  assert.equal(response.original.manufacturerPages, undefined, 'the C4 page is not the C3\'s page');
  const rows = byAttribute(response.successor.specComparison);
  for (const attribute of ['DISPLAY_CLASS', 'RESOLUTION']) assert.notEqual(rows[attribute].original?.basis, 'MANUFACTURER_PAGE_TITLE', attribute);
  assert.equal(JSON.stringify(response.successor.specComparison).includes('8K'), false);
});

test('Samsung television gets the same comparison; the generation named by the listings is the one compared', async () => {
  const reply = {
    ...LG_REPLY, original: { identity: 'Samsung S90C 65-inch QD-OLED smart TV', confidence: 'high', characteristics: ['QD-OLED', '4K', '144 Hz'], uncertainty: null },
    successor: { name: 'Samsung S90-series QD-OLED', why: 'Continues the line.', differences: null, concern: null, confidence: 'medium', comparison: [] },
  };
  const response = await answer(S1.history['samsung-s90c-65'], S1.listings['samsung-s90c-65'].rows, { query: 'Samsung S90C 65 inch', reply });
  const comparison = response.successor.specComparison;
  assert.ok(comparison, 'a comparison is built for a Samsung television');
  assert.equal(byAttribute(comparison).SCREEN_SIZE.original.value, '65-inch');
  assert.equal(JSON.stringify(comparison).includes('144 Hz'), false, 'the model\'s own claim about the original is not a source');
});

test('the contract refuses an edited, inflated or inconsistent comparison, and accepts a response without one', async () => {
  const response = await answer(S1.history['lg-c3-55'], S1.listings['lg-c3-55'].rows);
  const forged = {
    'a result that does not follow from the values': (c) => { c.rows[0].result = 'DIFFERENT'; },
    'a value outside its shape': (c) => { c.rows[0].original.value = 'huge'; },
    'a basis that is not a source': (c) => { c.rows[0].original.basis = 'AI_ESTIMATE'; },
    'a candidate value from the user or a page': (c) => { c.rows[1].candidate.basis = 'MANUFACTURER_PAGE_TITLE'; },
    'a summary that disagrees with the rows': (c) => { c.compared = ['SCREEN_SIZE']; },
    'a missing core attribute': (c) => { c.rows = c.rows.filter((entry) => entry.attribute !== 'REFRESH_RATE'); c.notEstablished = c.notEstablished.filter((a) => a !== 'REFRESH_RATE'); },
    'an optional row nobody states': (c) => { c.rows.push({ attribute: 'HDMI_2_1', original: null, candidate: null, result: 'NOT_ESTABLISHED' }); c.notEstablished.push('HDMI_2_1'); },
    'a free-text note': (c) => { c.note = 'much better'; },
    'out of order': (c) => { c.rows.reverse(); },
    'an extra key in a side': (c) => { c.rows[0].original.note = 'x'; },
  };
  for (const [label, change] of Object.entries(forged)) {
    const copy = clone(response);
    change(copy.successor.specComparison);
    assert.equal(normalizeSpecComparison(copy.successor.specComparison), null, label);
    assert.equal(isValidResearchResponseV2(copy), false, label);
  }
  const plain = clone(response);
  delete plain.successor.specComparison;
  assert.equal(isValidResearchResponseV2(plain), true);
  const noLineage = clone(response);
  delete noLineage.successor.lineage;
  assert.equal(isValidResearchResponseV2(noLineage), false, 'a comparison belongs to a candidate with a generation grammar');
});

test('buildSpecComparison reads only what it is given and returns null when no candidate listing was retrieved', () => {
  assert.equal(buildSpecComparison({ query: 'LG C3 55-inch TV', sizeInches: 55, manufacturerPages: [], specSources: null }), null);
  assert.equal(buildSpecComparison({ query: 'LG C3 55-inch TV', sizeInches: 55, manufacturerPages: [], specSources: { candidate: [], original: [] } }), null);
  const built = buildSpecComparison({ query: 'LG C3 55-inch TV', sizeInches: 55, manufacturerPages: [{ title: null }], specSources: { candidate: [{ title: 'LG 55" OLED 4K C6', size: 55 }], original: [] } });
  assert.deepEqual(built.compared, ['SCREEN_SIZE'], 'with only the person\'s size on one side, only size is compared');
});

test('review: a title that states two rates, or denies a feature, states neither', () => {
  assert.equal(factsOf('LG 55" OLED 4K 120/144Hz TV').REFRESH_RATE, null);
  assert.equal(factsOf('LG 55" OLED 4K 120Hz TV').REFRESH_RATE, '120 Hz');
  assert.equal(factsOf('TV with no HDMI 2.1 and not Dolby Vision').HDMI_2_1, null);
  assert.equal(factsOf('TV with no HDMI 2.1 and not Dolby Vision').DOLBY_VISION, null);
  assert.equal(factsOf('LG OLED TV with HDMI 2.1a ports').HDMI_2_1, 'HDMI 2.1');
});

test('review: what the person wants in a replacement is not a description of the original', async () => {
  const rows = [row('LG 55" OLED evo C6 4K 120Hz Smart TV OLED55C6PUA', 'Best Buy', 1299.99)];
  const response = await answer([], rows, { query: 'LG C3 55-inch TV, I want 144Hz and HDMI 2.1' });
  const refresh = byAttribute(response.successor.specComparison).REFRESH_RATE;
  assert.equal(refresh.original, null, 'a wish about the replacement is not stated for the original');
  assert.notEqual(refresh.result, 'DIFFERENT');
  assert.equal(byAttribute(response.successor.specComparison).SCREEN_SIZE.original.value, '55-inch', 'the size the person gave is still theirs');
});
