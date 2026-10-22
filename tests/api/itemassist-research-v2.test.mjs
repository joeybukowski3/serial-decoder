import test from 'node:test';
import assert from 'node:assert/strict';
import { createItemAssistResearchHandler } from '../../lib/itemassist-research/handler.js';
import { RESEARCH_CONTRACT_VERSION, buildResearchResponse, isValidResearchResponse } from '../../lib/itemassist-research/contract.js';
import { RESEARCH_CONTRACT_V2, buildResearchResponseV2, isValidAnyResearchResponse, isValidResearchResponseV2 } from '../../lib/itemassist-research/contract-v2.js';
import { MODEL_RELATION, classifyHost, looksLikeExactModel, modelRelation, normalizeDate, normalizeEvidence, safeSourceUrl } from '../../lib/itemassist-research/evidence.js';
import { CATEGORY_PROFILES, IMPORTANCE, MAX_REQUIREMENTS, PROFILES, buildRequirements, resolveProfile } from '../../lib/itemassist-research/requirements.js';
import { CURRENT_PRICE_MAX_AGE_DAYS, HISTORICAL_BANDS, NOTE_PARAMS, VALUATION_METHOD } from '../../lib/itemassist-research/pricing.js';
import { FIXTURE_CONTRACT_ENV, FIXTURE_V2_SCENARIO_IDS, fixtureResearch2For } from '../../lib/itemassist-research/fixture-v2.js';
import { FIXTURE_MODE_ENV, getFixtureAnswer } from '../../lib/itemassist-research/fixture.js';
import { classifySource } from '../../lib/replacement-discovery/evidence-normalizer.js';
import { createResearchCache, researchCacheKey } from '../../lib/itemassist-research/cache.js';
import { createMemoryStore } from '../../lib/itemassist-research/fixture.js';

// OFFLINE ONLY. research.2: typed price/evidence structures, the pure valuation, essential-requirement exclusion and the self-verifying validator.
const REF = '2026-10-22';
const NOW = Date.UTC(2026, 9, 22, 12);
const TOKEN = 'test-token-0123456789-abcdefghijkl';
const ago = (days) => new Date(Date.parse(REF) - days * 86_400_000).toISOString().slice(0, 10);
const money = (low, high = low) => ({ currency: 'USD', low, high });
const ev = (id, subject, url, extra = {}) => ({ id, subject, sourceUrl: url, subjectModel: 'DEMO-M-1', expectedModel: 'DEMO-M-1', observedAt: ago(1), ...extra });
const price = (id, kind, subject, candidate, amount, extra = {}) => ({ id, kind, subject, candidate, model: null, amount, asOf: null, asOfBasis: 'UNKNOWN', verification: 'NONE', evidenceId: null, ...extra });
const current = (id, candidate, amount, evidenceId, verification = 'VERIFIED_PAGE', extra = {}) => price(id, 'CURRENT_RETAIL_NEW', 'REPLACEMENT', candidate, money(amount), { asOf: ago(1), asOfBasis: 'OBSERVED', verification, evidenceId, ...extra });
const msrp = (id, amount, evidenceId = 'e3', extra = {}) => price(id, 'MSRP', 'ORIGINAL', null, money(amount), { asOf: '2023-03-20', asOfBasis: 'PUBLISHED', verification: 'SEARCH_SNIPPET', evidenceId, ...extra });
const E_S = ev('e1', 'SUCCESSOR', 'https://www.bestbuy.com/');
const E_A = ev('e2', 'ALT_1', 'https://www.abt.com/', { subjectModel: 'DEMO-M-2', expectedModel: 'DEMO-M-2' });
const E_O = ev('e3', 'ORIGINAL', 'https://www.cnet.com/', { observedAt: null, publishedAt: '2023-03-20' });
const cand = (name, extra = {}) => ({ name, why: 'It matches the original’s class.', differences: 'A newer processor.', concern: null, confidence: 'medium', comparison: [], ...extra });
const input = (over = {}, pricing = {}) => ({
  category: 'tv', profile: 'tv', original: { identity: 'LG C3 series OLED TV', confidence: 'high', characteristics: ['OLED panel'], uncertainty: null }, requirements: [],
  successor: { ...cand('LG C-series OLED'), standing: 'RECOMMENDED' }, suggestions: [cand('Samsung S90-series QD-OLED')], clarify: [],
  pricing: { referenceDate: REF, tier: { level: 'PREMIUM', basis: 'AI_ESTIMATE' }, evidence: [E_S, E_A, E_O], prices: [], ...pricing }, ...over,
});
// `fixture: true` is the only way a page-level confirmation survives the builder (see the trust-gate tests below).
const META = { requestId: 'req-1', elapsedMs: 5, answerSource: 'AI_ESTIMATE', now: NOW, fixture: true };
const LIVE_META = { ...META, fixture: false };
const build = (over, pricing) => buildResearchResponseV2(input(over, pricing), META);
const valuation = (prices, over, evidence) => build(over, { prices, ...(evidence ? { evidence } : {}) }).pricing.valuation;
const noteCodes = (v) => v.notes.map((n) => n.code);
const clone = (value) => JSON.parse(JSON.stringify(value));
const REQ = (response, key) => response.requirements.find((item) => item.key === key).id;

// ---- evidence ------------------------------------------------------------------------------------------------------------------------

test('source links: https only, a registered host, no credentials, port, query or fragment; look-alike and unknown hosts are refused', () => {
  assert.deepEqual(safeSourceUrl('https://www.bestbuy.com/site/p?id=1&utm=x#frag'), { url: 'https://www.bestbuy.com/site/p', host: 'bestbuy.com', domain: 'bestbuy.com', sourceClass: 'RETAILER', sourceName: 'Best Buy' });
  assert.equal(safeSourceUrl('https://shop.lg.com/us/tv').sourceClass, 'MANUFACTURER');
  for (const bad of ['http://www.bestbuy.com/', 'https://user:pw@www.bestbuy.com/', 'https://www.bestbuy.com:8443/', 'https://notbestbuy.com/', 'https://bestbuy.com.evil.example/', 'https://evil.example/www.bestbuy.com',
    'https://127.0.0.1/', 'https://localhost/', 'javascript:alert(1)', 'ftp://www.bestbuy.com/', 'https://www.bestbuy.com/ a', 'https://www.bestbuy.com/\u0000', '', null, 42, `https://www.bestbuy.com/${'a'.repeat(400)}`]) {
    assert.equal(safeSourceUrl(bad), null, String(bad));
  }
});

test('the source registry stays in step with the replacement-discovery classifier', () => {
  for (const [host, brand] of [['bestbuy.com', 'samsung'], ['homedepot.com', 'lg'], ['abt.com', 'lg'], ['ajmadison.com', 'ge'], ['samsung.com', 'samsung'], ['lg.com', 'lg'], ['geappliances.com', 'ge'], ['whirlpool.com', 'whirlpool'], ['rtings.com', 'lg'], ['amazon.com', 'lg']]) {
    const mine = classifyHost(host).sourceClass, theirs = classifySource(host, brand).sourceClass;
    assert.equal(mine === 'MARKETPLACE' ? 'OTHER' : mine === 'TECH_DATABASE' ? 'OTHER' : mine, theirs, host);
  }
  assert.equal(classifyHost('unknown-deals.example'), null);
});

test('evidence is derived, not trusted: class, name and relation come from code; a claimed domain that disagrees with the URL is a forged citation', () => {
  const { items, rejections } = normalizeEvidence([
    { id: 'e1', subject: 'ORIGINAL', sourceUrl: 'https://www.cnet.com/review', sourceName: 'Totally Official', sourceClass: 'MANUFACTURER', modelRelation: 'EXACT', subjectModel: 'AB-100', expectedModel: 'AB-200' },
    { id: 'e2', subject: 'ORIGINAL', sourceUrl: 'https://www.cnet.com/review', sourceDomain: 'lg.com' },
    { id: 'e3', subject: 'NOBODY', sourceUrl: 'https://www.cnet.com/' }, { id: 'e1', subject: 'ORIGINAL', sourceUrl: 'https://www.cnet.com/' },
    { id: 'e4', subject: 'ORIGINAL', sourceUrl: 'https://www.cnet.com/', publishedAt: '2026-02-30' }, { id: 'bad id', subject: 'ORIGINAL', sourceUrl: 'https://www.cnet.com/' },
  ]);
  assert.equal(items.length, 1);
  assert.deepEqual([items[0].sourceClass, items[0].sourceName, items[0].firstParty, items[0].modelRelation], ['REVIEW', 'CNET', false, 'DIFFERENT']);
  assert.deepEqual(rejections.map((r) => r.reason).sort(), ['DATE_INVALID', 'SHAPE_INVALID', 'SHAPE_INVALID', 'SHAPE_INVALID', 'SOURCE_FABRICATED']);
});

test('dates are real calendar dates (a full ISO time reduces to its UTC date); anything else is not a date', () => {
  assert.equal(normalizeDate('2026-10-22'), '2026-10-22');
  assert.equal(normalizeDate('2026-10-22T23:30:00-05:00'), '2026-10-23');
  for (const bad of ['2026-02-30', '2026-13-01', '1999-12-31', '2101-01-01', 'Oct 22 2026', '2026-10-22T10:00:00', '', null, 20261022, '2026-1-2']) assert.equal(normalizeDate(bad), null, String(bad));
});

test('model relation and the exact-model detector: a plausible code is not proof; series names are not exact codes', () => {
  assert.equal(modelRelation('QN55Q80D', 'QN55Q80D'), MODEL_RELATION.EXACT);
  assert.equal(modelRelation('QN55Q80DAFXZA', 'QN55Q80D'), MODEL_RELATION.VARIANT);
  assert.equal(modelRelation('QN55Q80D', 'QN65Q90D'), MODEL_RELATION.DIFFERENT);
  assert.equal(modelRelation(null, 'QN55Q80D'), MODEL_RELATION.UNKNOWN);
  // The P3 codes that could not be found, and real-looking ones, all read as exact codes; families and series do not.
  for (const code of ['Samsung RF28B5100SR', 'Whirlpool WRS325SDHN', 'LG WM4000HWB', 'LG LRFDS3006S', 'OLED65C4PUA', 'DEMO-S90-65']) assert.equal(looksLikeExactModel(code), true, code);
  for (const family of ['LG C4 OLED', 'Samsung S90D OLED', 'Sony Bravia 8 OLED', 'LG front load washer series', 'Whirlpool WRF series French door', 'LG LRFXC series French door']) assert.equal(looksLikeExactModel(family), false, family);
});

// ---- requirements --------------------------------------------------------------------------------------------------------------------

test('every profile carries code-owned essentials, and every category maps to valid profiles', () => {
  for (const [profile, rules] of Object.entries(PROFILES)) {
    assert.ok(rules.some((rule) => rule.importance === IMPORTANCE.ESSENTIAL), `${profile} has an essential`);
    assert.equal(new Set(rules.map((rule) => rule.key)).size, rules.length, `${profile} keys are unique`);
  }
  for (const [category, profiles] of Object.entries(CATEGORY_PROFILES)) for (const profile of profiles) assert.ok(PROFILES[profile], `${category}/${profile}`);
  assert.deepEqual(['tv', 'refrigerator', 'washer', 'dishwasher', 'electronics'].map((p) => PROFILES[p].filter((r) => r.importance === 'ESSENTIAL').map((r) => r.key)),
    [['screenSize', 'resolution', 'displayClass'], ['capacity', 'layout', 'fit'], ['capacity', 'loading', 'fit'], ['width', 'fit'], ['formFactor', 'capacity']]);
  assert.equal(resolveProfile('tv', 'washer'), 'tv');
  assert.equal(resolveProfile('appliance', 'washer'), 'washer');
  assert.equal(resolveProfile('appliance', 'tv'), 'appliance');
  assert.equal(resolveProfile('nonsense', 'tv'), 'unknown');
});

test('the model can add criteria but can neither drop, lower nor invent an essential', () => {
  const { items, notes } = buildRequirements([
    { key: 'screenSize', text: 'Screen size within one size class', importance: 'MINOR' }, { key: 'resolution', importance: 'MINOR' },
    { text: 'Same remote style', importance: 'ESSENTIAL' }, { key: 'brightness', text: 'Peak brightness for a bright room', importance: 'IMPORTANT' },
    { text: 'Costs under $500', importance: 'IMPORTANT' }, { text: 'See https://example.com/spec', importance: 'MINOR' }, null, 7,
  ], 'tv');
  const essentials = items.filter((item) => item.importance === 'ESSENTIAL');
  assert.deepEqual(essentials.map((item) => item.key), ['screenSize', 'resolution', 'displayClass']);
  assert.equal(essentials[0].text, 'Screen size within one size class', 'wording may be refined');
  assert.equal(items.find((item) => item.text === 'Same remote style').importance, 'IMPORTANT', 'an AI essential is downgraded');
  assert.equal(items.some((item) => /\$500|example\.com/.test(item.text)), false, 'price and link wording is withheld');
  const small = buildRequirements([{ text: 'Odd', importance: '__proto__' }, { text: 'Constructor', importance: 'constructor' }, 'A bare string'], 'other').items;
  assert.deepEqual(small.filter((item) => item.origin === 'AI_ESTIMATE').map((item) => [item.text, item.importance]), [['Odd', 'MINOR'], ['Constructor', 'MINOR'], ['A bare string', 'MINOR']]);
  assert.ok(notes.some((n) => n.reason === 'IMPORTANCE_FIXED_BY_CODE') && notes.some((n) => n.reason === 'ESSENTIAL_FROM_AI_DOWNGRADED'));
  assert.deepEqual(items.map((item) => item.id), items.map((_, index) => `r${index + 1}`));
});

test('the cap never removes an essential, and re-running the builder on its own output changes nothing', () => {
  const many = Array.from({ length: 20 }, (_, index) => ({ key: `extra${index}`, text: `Extra criterion ${index}`, importance: 'IMPORTANT' }));
  const { items } = buildRequirements(many, 'refrigerator');
  assert.equal(items.length, MAX_REQUIREMENTS);
  assert.equal(items.filter((item) => item.importance === 'ESSENTIAL').length, 3);
  const again = buildRequirements(items, 'refrigerator');
  assert.deepEqual(again.items, items);
  assert.deepEqual(again.notes, []);
});

// ---- price normalisation -------------------------------------------------------------------------------------------------------------

const reasons = (response) => response.pricing.rejections.flatMap((r) => Array(r.count).fill(`${r.scope}:${r.reason}:${r.action}`)).sort();
const accepted = (response) => response.pricing.prices.map((p) => p.id);

test('a source-backed price needs real evidence of an acceptable class; fabricated, missing and wrong-product references are refused', () => {
  const r = build({}, { prices: [
    current('p1', 'SUCCESSOR', 1000, 'e1'),
    current('p2', 'SUCCESSOR', 1000, 'e9'),
    price('p3', 'CURRENT_RETAIL_NEW', 'REPLACEMENT', 'SUCCESSOR', money(1000), { asOf: ago(1), asOfBasis: 'OBSERVED', verification: 'VERIFIED_PAGE' }),
    current('p4', 'SUCCESSOR', 1000, 'e3'),
    current('p5', 'ALT_1', 1000, 'e1'),
    price('p6', 'AI_ESTIMATE', 'REPLACEMENT', null, money(900, 1200), { evidenceId: 'e1' }),
    price('p7', 'MSRP', 'ORIGINAL', 'SUCCESSOR', money(1000), { evidenceId: 'e3', asOf: '2023-03-20', asOfBasis: 'PUBLISHED', verification: 'SEARCH_SNIPPET' }),
  ] });
  assert.deepEqual(accepted(r), ['p1']);
  assert.deepEqual(reasons(r), ['PRICE:ESTIMATE_CITES_SOURCE:REJECTED', 'PRICE:KIND_SOURCE_MISMATCH:REJECTED', 'PRICE:SHAPE_INVALID:REJECTED', 'PRICE:SOURCE_FABRICATED:REJECTED', 'PRICE:SUBJECT_INVALID:REJECTED', 'PRICE:WRONG_PRODUCT:REJECTED']);
  assert.ok(r.warnings.includes('PRICE_EVIDENCE_REJECTED'));
});

test('missing or invalid dates: a current price needs an observation date; a historical or MSRP price may be undated and says so', () => {
  const r = build({}, { prices: [
    price('p1', 'CURRENT_RETAIL_NEW', 'REPLACEMENT', 'SUCCESSOR', money(1000), { verification: 'VERIFIED_PAGE', evidenceId: 'e1' }),
    current('p2', 'SUCCESSOR', 1000, 'e1', 'VERIFIED_PAGE', { asOfBasis: 'PUBLISHED' }),
    current('p3', 'SUCCESSOR', 1000, 'e1', 'VERIFIED_PAGE', { asOf: '2026-02-30' }),
    current('p4', 'SUCCESSOR', 1000, 'e1', 'VERIFIED_PAGE', { asOf: '2027-01-01' }),
    price('p5', 'MSRP', 'ORIGINAL', null, money(1999), { verification: 'SEARCH_SNIPPET', evidenceId: 'e3' }),
    price('p6', 'HISTORICAL_RETAIL', 'ORIGINAL', null, money(1500), { asOf: '2023-03-20', asOfBasis: 'PUBLISHED', verification: 'SEARCH_SNIPPET', evidenceId: 'e3' }),
    price('p7', 'MSRP', 'ORIGINAL', null, money(1999), { asOf: '2023-03-20', asOfBasis: 'UNKNOWN', verification: 'SEARCH_SNIPPET', evidenceId: 'e3' }),
  ] });
  assert.deepEqual(accepted(r), ['p5', 'p6']);
  assert.equal(r.pricing.prices[0].asOf, null);
  assert.equal(r.pricing.prices[0].asOfBasis, 'UNKNOWN');
  assert.deepEqual(reasons(r), ['PRICE:DATE_INVALID:REJECTED', 'PRICE:DATE_INVALID:REJECTED', 'PRICE:DATE_IN_FUTURE:REJECTED', 'PRICE:DATE_REQUIRED:REJECTED', 'PRICE:DATE_REQUIRED:REJECTED']);
});

test('a "current" price older than the freshness window is a dated price, never presented as current', () => {
  const fresh = build({}, { prices: [current('p1', 'SUCCESSOR', 1000, 'e1', 'VERIFIED_PAGE', { asOf: ago(CURRENT_PRICE_MAX_AGE_DAYS) })] });
  assert.equal(fresh.pricing.prices[0].kind, 'CURRENT_RETAIL_NEW');
  const stale = build({}, { prices: [current('p1', 'SUCCESSOR', 1000, 'e1', 'VERIFIED_PAGE', { asOf: ago(CURRENT_PRICE_MAX_AGE_DAYS + 1) })] });
  assert.equal(stale.pricing.prices[0].kind, 'HISTORICAL_RETAIL');
  assert.deepEqual(reasons(stale), ['PRICE:STALE_CURRENT_PRICE:DOWNGRADED']);
  assert.equal(stale.pricing.valuation.method, VALUATION_METHOD.INSUFFICIENT, 'a dated price sets no current range');
  assert.ok(noteCodes(stale.pricing.valuation).includes('STALE_PRICES_NOT_CURRENT'));
  assert.equal(stale.pricing.valuation.range, null);
});

test('amounts: USD only, positive and bounded; an observed price is a single amount; an estimate may be a bounded band, never verified, never cited, never dated', () => {
  const r = build({}, { prices: [
    price('p1', 'AI_ESTIMATE', 'REPLACEMENT', null, money(500, 900)),
    price('p2', 'AI_ESTIMATE', 'REPLACEMENT', null, { currency: 'EUR', low: 500, high: 900 }),
    price('p3', 'AI_ESTIMATE', 'REPLACEMENT', null, money(900, 500)), price('p4', 'AI_ESTIMATE', 'REPLACEMENT', null, money(0, 500)), price('p5', 'AI_ESTIMATE', 'REPLACEMENT', null, money(1, 8)),
    price('p6', 'AI_ESTIMATE', 'REPLACEMENT', null, money(100, 5000)), price('p7', 'AI_ESTIMATE', 'REPLACEMENT', null, money(500, 900), { verification: 'VERIFIED_PAGE' }),
    price('p8', 'AI_ESTIMATE', 'REPLACEMENT', null, money(500, 900), { asOf: ago(1), asOfBasis: 'OBSERVED' }),
    current('p9', 'SUCCESSOR', 1000, 'e1', 'VERIFIED_PAGE', { amount: money(900, 1100) }),
    price('p10', 'AI_ESTIMATE', 'REPLACEMENT', null, { currency: 'USD', low: 'cheap', high: 900 }), price('p11', 'AI_ESTIMATE', 'REPLACEMENT', null, money(2_000_000, 3_000_000)),
  ] });
  assert.deepEqual(accepted(r), ['p1', 'p5']);
  assert.equal(r.pricing.prices[0].verification, 'NONE');
  assert.ok(r.pricing.valuation.verified === false);
});

test('verification can only go down: a page-level confirmation needs a non-marketplace source about the exact model', () => {
  const evidence = [E_S, ev('e4', 'ALT_1', 'https://www.abt.com/', { subjectModel: null, expectedModel: null }), ev('e5', 'SUCCESSOR', 'https://www.ebay.com/', { observedAt: ago(1) }), E_O];
  const r = build({}, { evidence, prices: [
    current('p1', 'SUCCESSOR', 1000, 'e1'), current('p2', 'ALT_1', 1100, 'e4'),
    price('p3', 'SECONDARY_REPORT', 'REPLACEMENT', 'SUCCESSOR', money(700), { asOf: ago(2), asOfBasis: 'OBSERVED', verification: 'VERIFIED_PAGE', evidenceId: 'e5' }),
    price('p4', 'CURRENT_RETAIL_NEW', 'REPLACEMENT', 'SUCCESSOR', money(700), { asOf: ago(2), asOfBasis: 'OBSERVED', verification: 'VERIFIED_PAGE', evidenceId: 'e5' }),
    price('p5', 'MSRP', 'ORIGINAL', null, money(1999), { asOf: '2023-03-20', asOfBasis: 'PUBLISHED', verification: 'SEARCH_LISTING', evidenceId: 'e3' }),
  ] });
  const byId = Object.fromEntries(r.pricing.prices.map((p) => [p.id, p]));
  assert.equal(byId.p1.verification, 'VERIFIED_PAGE');
  assert.equal(byId.p2.verification, 'SEARCH_LISTING', 'no exact-model evidence: not a page confirmation');
  assert.equal(byId.p3.verification, 'SEARCH_LISTING', 'a marketplace page never verifies');
  assert.equal(byId.p5.verification, 'SEARCH_SNIPPET', 'a listing is not a verification level for an MSRP');
  assert.equal(byId.p4, undefined, 'a marketplace listing is not a new-retail price');
});

test('a plausible model number is not proof: a price on a candidate named by an exact code needs evidence about that exact model', () => {
  const r = build({ successor: { ...cand('Whirlpool WRS325SDHN'), standing: 'RECOMMENDED' } }, {
    evidence: [ev('e4', 'SUCCESSOR', 'https://www.bestbuy.com/', { subjectModel: null, expectedModel: null }), E_O],
    prices: [current('p1', 'SUCCESSOR', 1000, 'e4', 'SEARCH_LISTING'), price('p2', 'AI_ESTIMATE', 'REPLACEMENT', 'SUCCESSOR', money(900, 1200))],
  });
  assert.deepEqual(accepted(r), ['p2'], 'only the estimate survives');
  assert.deepEqual(reasons(r), ['PRICE:MODEL_UNVERIFIED:REJECTED']);
  assert.equal(r.successor.modelStatus, 'UNVERIFIED_MODEL');
  assert.ok(r.warnings.includes('MODEL_NOT_VERIFIED'));
  const verified = build({ successor: { ...cand('Whirlpool WRS325SDHN'), standing: 'RECOMMENDED' } }, {
    evidence: [ev('e6', 'SUCCESSOR', 'https://www.bestbuy.com/', { subjectModel: 'WRS325SDHN', expectedModel: 'WRS325SDHN' }), E_O], prices: [current('p1', 'SUCCESSOR', 1000, 'e6')],
  });
  assert.equal(verified.successor.modelStatus, 'VERIFIED_LISTING');
});

test('model status: page-confirmed, listing-only, family-level and unverified are kept apart, and an input claim cannot raise it', () => {
  const r = build({ successor: { ...cand('LG C-series OLED'), modelStatus: 'VERIFIED_LISTING', standing: 'RECOMMENDED' }, suggestions: [{ ...cand('Samsung S90-series QD-OLED'), modelStatus: 'VERIFIED_LISTING' }, { ...cand('Sony RF28B5100SR'), modelStatus: 'FAMILY_LEVEL' }] }, {
    evidence: [E_S, E_A, E_O], prices: [current('p1', 'SUCCESSOR', 1000, 'e1', 'SEARCH_LISTING')],
  });
  assert.deepEqual([r.successor.modelStatus, ...r.suggestions.map((s) => s.modelStatus)], ['LISTED_PROVISIONAL', 'FAMILY_LEVEL', 'UNVERIFIED_MODEL']);
  assert.ok(reasons(r).includes('CANDIDATE:MODEL_STATUS_DOWNGRADED:DOWNGRADED'));
});

// ---- valuation -----------------------------------------------------------------------------------------------------------------------

test('multiple verified qualifying comparables set a range; confidence depends on how tightly they agree', () => {
  const v = valuation([current('p1', 'SUCCESSOR', 1000, 'e1'), current('p2', 'ALT_1', 1100, 'e2', 'VERIFIED_PAGE', { asOf: ago(3) })]);
  assert.deepEqual([v.method, v.basis, v.verified, v.confidence], ['VERIFIED_MULTI', 'VERIFIED_CURRENT_RETAIL', true, 'HIGH']);
  assert.deepEqual(v.range, { currency: 'USD', low: 1000, high: 1100 });
  assert.equal(v.asOf, ago(1), 'the latest observation');
  const wide = valuation([current('p1', 'SUCCESSOR', 1000, 'e1'), current('p2', 'ALT_1', 2500, 'e2')]);
  assert.deepEqual([wide.method, wide.confidence], ['VERIFIED_MULTI', 'LOW']);
});

test('ONE verified comparable is enough; three are never required', () => {
  const v = valuation([current('p1', 'SUCCESSOR', 1200, 'e1')]);
  assert.deepEqual([v.method, v.verified, v.confidence], ['VERIFIED_SINGLE', true, 'MEDIUM']);
  assert.deepEqual(v.range, { currency: 'USD', low: 1200, high: 1200 });
  assert.ok(noteCodes(v).includes('ONE_COMPARABLE'));
  assert.deepEqual(v.comparables, [{ priceId: 'p1', candidate: 'SUCCESSOR', verification: 'VERIFIED_PAGE' }]);
});

test('provisional retailer listings: never labelled verified, with their own basis and an explicit "not confirmed" note', () => {
  const only = valuation([current('p1', 'SUCCESSOR', 1000, 'e1', 'SEARCH_LISTING'), current('p2', 'ALT_1', 1200, 'e2', 'SEARCH_LISTING')]);
  assert.deepEqual([only.method, only.basis, only.verified, only.confidence], ['PROVISIONAL_LISTINGS', 'PROVISIONAL_LISTINGS', false, 'MEDIUM']);
  assert.ok(noteCodes(only).includes('LISTINGS_NOT_CONFIRMED'));
  assert.equal(valuation([current('p1', 'SUCCESSOR', 1000, 'e1', 'SEARCH_LISTING')]).confidence, 'LOW');
  const mixed = valuation([current('p1', 'SUCCESSOR', 1000, 'e1'), current('p2', 'ALT_1', 1300, 'e2', 'SEARCH_LISTING')]);
  assert.deepEqual([mixed.method, mixed.basis, mixed.verified, mixed.range.low, mixed.range.high], ['MIXED_VERIFIED_AND_LISTINGS', 'MIXED_CURRENT_RETAIL', false, 1000, 1300]);
});

test('historical evidence plus a category band: a clearly labelled estimate, never verified, dated and aged correctly', () => {
  const older = valuation([msrp('p1', 2000)]);
  assert.deepEqual([older.method, older.basis, older.verified, older.confidence], ['HISTORICAL_TIER_ESTIMATE', 'TIER_ESTIMATE', false, 'LOW']);
  assert.deepEqual(older.range, { currency: 'USD', low: 800, high: 1800 }, '3+ years old: the older television band');
  assert.deepEqual(older.notes[0], { code: 'TIER_ESTIMATE_BAND', low: 0.4, high: 0.9 });
  const recent = valuation([msrp('p1', 2000, 'e3', { asOf: '2025-06-01' })]);
  assert.deepEqual(recent.range, { currency: 'USD', low: 1100, high: 2000 });
  const undated = valuation([msrp('p1', 2000, 'e3', { asOf: null, asOfBasis: 'UNKNOWN' })]);
  assert.deepEqual([undated.range.low, undated.range.high], [800, 1800]);
  assert.ok(noteCodes(undated).includes('ORIGINAL_DATE_UNKNOWN'));
  const unknownTier = build({}, { tier: { level: 'UNKNOWN', basis: 'UNKNOWN' }, prices: [msrp('p1', 2000)] }).pricing.valuation;
  assert.deepEqual([unknownTier.range.low, unknownTier.range.high], [600, 1800], 'an unknown tier widens the lower end');
  assert.ok(noteCodes(unknownTier).includes('TIER_UNKNOWN_WIDENED'));
  const washer = build({ category: 'appliance', profile: 'washer' }, { prices: [msrp('p1', 1000, 'e3', { asOf: '2025-06-01' })] }).pricing.valuation;
  assert.deepEqual(washer.range, { currency: 'USD', low: 750, high: 1100 });
  assert.deepEqual(Object.keys(HISTORICAL_BANDS), ['tv', 'appliance', 'electronics', 'other']);
});

test('an AI estimate alone is a labelled, low-confidence band; with nothing at all there is no range and no invention', () => {
  const ai = valuation([price('p1', 'AI_ESTIMATE', 'REPLACEMENT', null, money(500, 900)), price('p2', 'AI_ESTIMATE', 'REPLACEMENT', null, money(700, 1500))]);
  assert.deepEqual([ai.method, ai.basis, ai.verified, ai.confidence], ['AI_ESTIMATE_ONLY', 'AI_ESTIMATE', false, 'LOW']);
  assert.deepEqual(ai.range, { currency: 'USD', low: 500, high: 1500 });
  assert.equal(ai.asOf, null);
  const none = valuation([]);
  assert.deepEqual([none.method, none.basis, none.range, none.verified, none.comparables], ['INSUFFICIENT', 'NONE', null, false, []]);
  assert.ok(noteCodes(none).includes('INSUFFICIENT'));
  assert.equal(noteCodes(none).at(-1), 'NOT_AN_APPRAISAL');
  // An estimate of the ORIGINAL's historical value is not a replacement value.
  assert.equal(valuation([price('p1', 'AI_ESTIMATE', 'ORIGINAL', null, money(400, 1500))]).method, 'INSUFFICIENT');
});

test('MSRP supplies context only: it never sets, nudges or qualifies a range, however high it is', () => {
  const prices = (amount) => [msrp('p9', amount), current('p1', 'SUCCESSOR', 1200, 'e1')];
  const low = valuation(prices(1500)), high = valuation(prices(9000));
  assert.deepEqual(low.range, { currency: 'USD', low: 1200, high: 1200 });
  assert.deepEqual(high.range, low.range);
  assert.deepEqual([high.comparables, high.excluded], [low.comparables, low.excluded], 'MSRP never changes which candidates qualify');
  assert.ok(noteCodes(high).includes('MSRP_CONTEXT_ONLY'));
  assert.deepEqual(high.notes.find((n) => n.code === 'CURRENT_BELOW_ORIGINAL'), { code: 'CURRENT_BELOW_ORIGINAL', ratio: 0.13 });
  assert.equal(noteCodes(low).includes('CURRENT_BELOW_ORIGINAL'), false);
  assert.deepEqual(high.reference, { priceId: 'p9', kind: 'MSRP' });
});

test('historical prices of a replacement and secondhand reports are context, never a current price', () => {
  const v = valuation([
    price('p1', 'HISTORICAL_RETAIL', 'REPLACEMENT', 'SUCCESSOR', money(700), { asOf: '2024-01-10', asOfBasis: 'PUBLISHED', verification: 'SEARCH_SNIPPET', evidenceId: 'e1' }),
    price('p2', 'SECONDARY_REPORT', 'REPLACEMENT', 'SUCCESSOR', money(400), { asOf: ago(1), asOfBasis: 'OBSERVED', verification: 'SEARCH_LISTING', evidenceId: 'e1' }),
  ]);
  assert.equal(v.method, 'INSUFFICIENT');
  assert.equal(v.range, null);
});

const shortfall = (basis, evidenceId = null) => ({ requirementKey: 'screenSize', status: 'SHORTFALL', basis, ...(evidenceId ? { evidenceId } : {}) });

test('a confirmed essential shortfall excludes a candidate, even with a higher or a lower advertised price, and never silently', () => {
  for (const excludedPrice of [3000, 500]) {
    const r = build({ successor: { ...cand('Too small series', { comparison: [shortfall('CONFIRMED', 'e1')] }), standing: 'CONDITIONAL' } }, {
      prices: [current('p1', 'SUCCESSOR', excludedPrice, 'e1'), current('p2', 'ALT_1', 1000, 'e2')],
    });
    const v = r.pricing.valuation;
    assert.deepEqual(v.range, { currency: 'USD', low: 1000, high: 1000 }, `excluded price ${excludedPrice} never enters`);
    assert.deepEqual(v.excluded, [{ candidate: 'SUCCESSOR', reason: 'CONFIRMED_ESSENTIAL_SHORTFALL' }]);
    assert.ok(v.notes.some((n) => n.code === 'EXCLUDED_CONFIRMED_SHORTFALL' && n.candidate === 'SUCCESSOR'));
    assert.ok(r.warnings.includes('CANDIDATE_EXCLUDED_ESSENTIAL'));
    assert.equal(r.successor.comparison[0].basis, 'CONFIRMED');
  }
});

test('when the only priced candidate fails an essential requirement, its price is not used: the valuation falls back honestly', () => {
  const withMsrp = build({ successor: { ...cand('Too small series', { comparison: [shortfall('CONFIRMED', 'e1')] }), standing: 'CONDITIONAL' }, suggestions: [] }, { prices: [msrp('p9', 2000), current('p1', 'SUCCESSOR', 3000, 'e1')] }).pricing.valuation;
  assert.equal(withMsrp.method, 'HISTORICAL_TIER_ESTIMATE');
  assert.ok(withMsrp.range.high < 3000);
  const none = build({ successor: { ...cand('Too small series', { comparison: [shortfall('CONFIRMED', 'e1')] }), standing: 'CONDITIONAL' }, suggestions: [] }, { prices: [current('p1', 'SUCCESSOR', 3000, 'e1')] }).pricing.valuation;
  assert.equal(none.method, 'INSUFFICIENT');
  assert.equal(none.range, null);
});

test('a suspected shortfall excludes too (labelled as suspected); an unknown essential or a shortfall on a non-essential requirement does not', () => {
  const run = (comparison, successorExtra = {}) => build({ successor: { ...cand('Series A', { comparison }), standing: 'CONDITIONAL', ...successorExtra }, suggestions: [] }, { prices: [current('p1', 'SUCCESSOR', 1000, 'e1')] }).pricing.valuation;
  assert.deepEqual(run([shortfall('AI_ESTIMATE')]).excluded, [{ candidate: 'SUCCESSOR', reason: 'SUSPECTED_ESSENTIAL_SHORTFALL' }]);
  assert.equal(run([{ requirementKey: 'screenSize', status: 'UNKNOWN', basis: 'AI_ESTIMATE' }]).method, 'VERIFIED_SINGLE');
  assert.equal(run([{ requirementKey: 'hdmi', status: 'SHORTFALL', basis: 'CONFIRMED', evidenceId: 'e1' }]).method, 'VERIFIED_SINGLE', 'HDMI is important, not essential');
  assert.equal(run([shortfall('CONFIRMED')]).excluded[0].reason, 'SUSPECTED_ESSENTIAL_SHORTFALL', 'a "confirmed" shortfall with no evidence is only suspected');
});

test('the valuation is deterministic and independent of price order', () => {
  const prices = [current('p1', 'SUCCESSOR', 1000, 'e1'), current('p2', 'ALT_1', 1100, 'e2'), msrp('p3', 2000)];
  const a = valuation(prices), b = valuation([...prices].reverse());
  assert.deepEqual(a, b);
  assert.deepEqual(valuation(prices), a);
  for (const note of a.notes) assert.ok(Object.hasOwn(NOTE_PARAMS, note.code));
});

// ---- the research.2 contract ---------------------------------------------------------------------------------------------------------

const scenarioResponse = (query) => { const { id, input: raw } = fixtureResearch2For(query, REF); return { id, response: buildResearchResponseV2(raw, { ...META, fixture: true }) }; };
const QUERIES = { 'tv-premium-oled': 'LG C3 OLED TV', 'tv-strong-retail': 'Samsung S90D 65', 'fridge-constraints': 'Samsung RF28 refrigerator', 'washer-dimensions': 'front load washer 27 inch', 'ambiguous-model': 'Samsung 65 inch TV',
  'sparse-estimate': 'Bosch dishwasher', 'unsupported-claims': 'unsupported price claims tv', insufficient: 'something I cannot describe' };
const EXPECTED = { 'tv-premium-oled': ['PROVISIONAL_LISTINGS', false], 'tv-strong-retail': ['VERIFIED_MULTI', true], 'fridge-constraints': ['VERIFIED_SINGLE', true], 'washer-dimensions': ['MIXED_VERIFIED_AND_LISTINGS', false],
  'ambiguous-model': ['AI_ESTIMATE_ONLY', false], 'sparse-estimate': ['HISTORICAL_TIER_ESTIMATE', false], 'unsupported-claims': ['AI_ESTIMATE_ONLY', false], insufficient: ['INSUFFICIENT', false] };

test('every fixture scenario builds a valid research.2 response with the intended valuation, and is routed by its query', () => {
  assert.deepEqual([...FIXTURE_V2_SCENARIO_IDS].sort(), Object.keys(QUERIES).sort());
  for (const [id, query] of Object.entries(QUERIES)) {
    const built = scenarioResponse(query);
    assert.equal(built.id, id, query);
    assert.equal(isValidResearchResponseV2(built.response, { allowFixture: true }), true, id);
    assert.equal(isValidAnyResearchResponse(built.response, { allowFixture: true }), true, id);
    assert.deepEqual([built.response.pricing.valuation.method, built.response.pricing.valuation.verified], EXPECTED[id], id);
  }
});

test('the fixture illustrates the required cases: MSRP context, essential-shortfall exclusion, retail evidence, sparse and ambiguous inputs', () => {
  const tv = scenarioResponse(QUERIES['tv-premium-oled']).response;
  assert.deepEqual(tv.pricing.tier, { level: 'PREMIUM', basis: 'MSRP_EVIDENCE' });
  assert.ok(noteCodes(tv.pricing.valuation).includes('CURRENT_BELOW_ORIGINAL') && noteCodes(tv.pricing.valuation).includes('MSRP_CONTEXT_ONLY'));
  const fridge = scenarioResponse(QUERIES['fridge-constraints']).response;
  assert.deepEqual(fridge.pricing.valuation.excluded.map((e) => [e.candidate, e.reason]), [['ALT_1', 'NO_CURRENT_PRICE'], ['ALT_2', 'CONFIRMED_ESSENTIAL_SHORTFALL']]);
  assert.equal(fridge.pricing.valuation.range.high, 2399, 'the 3,299 price of the side-by-side never counts');
  const washer = scenarioResponse(QUERIES['washer-dimensions']).response;
  assert.equal(washer.profile, 'washer');
  assert.deepEqual(washer.pricing.valuation.excluded, [{ candidate: 'ALT_2', reason: 'CONFIRMED_ESSENTIAL_SHORTFALL' }]);
  assert.equal(washer.pricing.valuation.range.low, 999, 'the cheaper, too-wide 799 never counts');
  const ambiguous = scenarioResponse(QUERIES['ambiguous-model']).response;
  assert.deepEqual([ambiguous.status, ambiguous.successor, ambiguous.suggestions, ambiguous.pricing.tier.level], ['PARTIAL', null, [], 'UNKNOWN']);
  assert.ok(ambiguous.clarify.length > 0);
  const strong = scenarioResponse(QUERIES['tv-strong-retail']).response;
  assert.equal(strong.pricing.valuation.confidence, 'HIGH');
  assert.ok(strong.pricing.prices.every((p) => p.kind !== 'CURRENT_RETAIL_NEW' || p.verification === 'VERIFIED_PAGE'));
  assert.equal(scenarioResponse(QUERIES.insufficient).response.status, 'GUIDANCE_ONLY');
  for (const id of Object.keys(QUERIES)) assert.ok(scenarioResponse(QUERIES[id]).response.requirements.filter((r) => r.importance === 'ESSENTIAL').length >= 2, id);
});

test('unsupported price and model claims are rejected with fixed reason codes, and none of the rejected content reaches the response', () => {
  const { response } = scenarioResponse(QUERIES['unsupported-claims']);
  const text = JSON.stringify(response);
  for (const leaked of ['example-deals', 'http://', '$', 'Best Buy at', 'Currently', 'e9']) assert.equal(text.includes(leaked), false, leaked);
  assert.deepEqual(reasons(response), ['EVIDENCE:SOURCE_INVALID:REJECTED', 'EVIDENCE:SOURCE_NOT_ALLOWED:REJECTED', 'PRICE:DATE_REQUIRED:REJECTED', 'PRICE:ESTIMATE_CITES_SOURCE:REJECTED', 'PRICE:MODEL_UNVERIFIED:REJECTED',
    'PRICE:SOURCE_FABRICATED:REJECTED', 'PRICE:SOURCE_FABRICATED:REJECTED', 'PRICE:STALE_CURRENT_PRICE:DOWNGRADED', 'PRICE:WRONG_PRODUCT:REJECTED', 'REQUIREMENT:ESSENTIAL_FROM_AI_DOWNGRADED:DOWNGRADED', 'TIER:TIER_BASIS_DOWNGRADED:DOWNGRADED']);
  assert.equal(response.successor.modelStatus, 'UNVERIFIED_MODEL');
  assert.equal(response.successor.differences, null, 'the price wording in free text was removed');
  for (const code of ['UNSAFE_CLAIMS_REMOVED', 'PRICE_EVIDENCE_REJECTED', 'MODEL_NOT_VERIFIED', 'VALUATION_ESTIMATE_ONLY']) assert.ok(response.warnings.includes(code), code);
  assert.deepEqual([response.pricing.valuation.method, response.pricing.valuation.verified], ['AI_ESTIMATE_ONLY', false], 'what survives is an estimate, labelled as one');
  assert.equal(response.pricing.tier.basis, 'AI_ESTIMATE', 'a tier claiming MSRP evidence with none accepted is downgraded');
});

test('free text keeps research.1 claim blocking: no price, link, retailer or assurance wording in any text field; links exist only as validated typed fields', () => {
  const r = build({ original: { identity: 'LG C3 for $999', confidence: 'high', characteristics: ['See https://example.com', 'OLED'], uncertainty: 'Sold at Best Buy' },
    successor: { ...cand('LG OLED', { why: 'A verified equivalent replacement.', differences: 'Fine.' }), standing: 'RECOMMENDED' }, suggestions: [cand('Samsung S90', { why: 'Guaranteed to fit.' })], clarify: ['Check www.example.com'] }, { prices: [] });
  assert.equal(r.original.identity, null);
  assert.deepEqual(r.original.characteristics, ['OLED']);
  assert.equal(r.successor, null);
  assert.deepEqual([r.suggestions, r.clarify, r.status], [[], [], 'GUIDANCE_ONLY']);
  assert.ok(r.warnings.includes('UNSAFE_CLAIMS_REMOVED') && r.warnings.includes('PRODUCT_NOT_IDENTIFIED'));
  for (const { response } of Object.values(QUERIES).map(scenarioResponse)) {
    const strings = [response.original.identity, response.original.uncertainty, ...response.original.characteristics, ...response.clarify, ...response.requirements.map((i) => i.text),
      ...[response.successor, ...response.suggestions].filter(Boolean).flatMap((c) => [c.name, c.why, c.differences, c.concern])].filter(Boolean);
    for (const s of strings) assert.equal(/https?:|www\.|\$\d|\bmsrp\b/i.test(s), false, s);
    for (const e of response.pricing.evidence) assert.match(e.sourceUrl, /^https:\/\/[a-z0-9.-]+\/[^?#\s]*$/);
  }
});

test('the validator re-derives every block: a forged, edited or inconsistent response is invalid', () => {
  const good = scenarioResponse(QUERIES['tv-strong-retail']).response;
  const fridge = scenarioResponse(QUERIES['fridge-constraints']).response;
  const premium = scenarioResponse(QUERIES['tv-premium-oled']).response;
  const forge = (source, edit) => { const copy = clone(source); edit(copy); return copy; };
  // A context-only price (the original's MSRP) whose evidence names no model: it cannot be a page-level confirmation, and promoting it changes no range.
  const context = build({}, { evidence: [E_S, ev('e3', 'ORIGINAL', 'https://www.cnet.com/', { subjectModel: null, expectedModel: null, observedAt: null, publishedAt: '2023-03-20' })], prices: [current('p1', 'SUCCESSOR', 1000, 'e1'), msrp('p2', 1999)] });
  assert.equal(isValidResearchResponseV2(context, { allowFixture: true }), true);
  assert.equal(context.pricing.prices[1].verification, 'SEARCH_SNIPPET');
  const forgeries = {
    'a context price promoted to a page verification': forge(context, (r) => { r.pricing.prices[1].verification = 'VERIFIED_PAGE'; }),
    'an unrounded amount': forge(context, (r) => { r.pricing.prices[0].amount = { currency: 'USD', low: 1000.004, high: 1000.004 }; }),
    'a lowered range': forge(good, (r) => { r.pricing.valuation.range.low -= 100; }),
    'a raised confidence': forge(premium, (r) => { r.pricing.valuation.confidence = 'HIGH'; }),
    'a provisional range marked verified': forge(premium, (r) => { r.pricing.valuation.verified = true; }),
    'a changed method': forge(premium, (r) => { r.pricing.valuation.method = 'VERIFIED_MULTI'; }),
    'an edited amount': forge(good, (r) => { r.pricing.prices[1].amount = money(1); }),
    'a price promoted to current': forge(good, (r) => { r.pricing.prices[0].kind = 'CURRENT_RETAIL_NEW'; }),
    'a listing promoted to a page verification': forge(premium, (r) => { r.pricing.prices[1].verification = 'VERIFIED_PAGE'; }),
    'a tampered source link': forge(good, (r) => { r.pricing.evidence[0].sourceUrl = 'https://evil.example/'; }),
    'a renamed source': forge(good, (r) => { r.pricing.evidence[0].sourceName = 'Official Retailer'; }),
    'a source class upgrade': forge(good, (r) => { assert.equal(r.pricing.evidence[1].sourceClass, 'RETAILER'); r.pricing.evidence[1].sourceClass = 'MANUFACTURER'; }),
    'a review promoted to first party': forge(premium, (r) => { const review = r.pricing.evidence.find((entry) => entry.sourceClass === 'REVIEW'); review.firstParty = true; }),
    'a link with a query string': forge(good, (r) => { r.pricing.evidence[1].sourceUrl += '?ref=1'; }),
    'an orphan citation': forge(good, (r) => { r.pricing.evidence.push({ ...r.pricing.evidence[0], id: 'e9' }); }),
    'a dropped essential': forge(good, (r) => { r.requirements.splice(0, 1); }),
    'a lowered essential': forge(good, (r) => { r.requirements[0].importance = 'MINOR'; }),
    'a model status raised': forge(good, (r) => { r.suggestions[0].modelStatus = 'FAMILY_LEVEL'; }),
    'a confirmed comparison without evidence': forge(fridge, (r) => { r.successor.comparison[0].evidenceId = null; }),
    'a hidden shortfall': forge(fridge, (r) => { r.suggestions[1].comparison.find((row) => row.status === 'SHORTFALL').status = 'MEETS'; }),
    'a candidate marked verified': forge(good, (r) => { r.successor.verified = true; }),
    'a recommended successor with a concern': forge(premium, (r) => { r.successor.concern = 'Some concern.'; }),
    'a price in free text': forge(good, (r) => { r.successor.why = 'On sale for $999.'; }),
    'a link in free text': forge(good, (r) => { r.original.uncertainty = 'See https://example.com'; }),
    'an extra top-level key': forge(good, (r) => { r.secret = 'x'; }),
    'a missing key': forge(good, (r) => { delete r.pricing; }),
    'an extra pricing key': forge(good, (r) => { r.pricing.debug = 1; }),
    'a bad rejection reason': forge(good, (r) => { r.pricing.rejections.push({ scope: 'PRICE', reason: 'lower case', action: 'REJECTED', count: 1 }); }),
    'a dropped derived warning': forge(fridge, (r) => { r.warnings = r.warnings.filter((code) => code !== 'CANDIDATE_EXCLUDED_ESSENTIAL'); }),
    'a wrong status': forge(good, (r) => { r.status = 'PARTIAL'; }),
    'a wrong disclosure': forge(good, (r) => { r.disclosure = 'Everything here is verified.'; }),
    'a wrong profile': forge(good, (r) => { r.profile = 'washer'; }),
    'a note with a free-text parameter': forge(good, (r) => { r.pricing.valuation.notes[0].text = 'hello'; }),
  };
  assert.equal(isValidResearchResponseV2(good, { allowFixture: true }), true);
  for (const [name, forged] of Object.entries(forgeries)) assert.equal(isValidResearchResponseV2(forged, { allowFixture: true }), false, name);
  // The fixture marker is valid only where the caller allows it.
  assert.equal(isValidResearchResponseV2(good, { allowFixture: false }), false);
  // Without the marker the page-level confirmations are no longer trusted, so the same data no longer validates (the trust gate).
  assert.equal(isValidResearchResponseV2(forge(good, (r) => { delete r.meta.fixture; }), { allowFixture: false }), false);
  assert.equal(isValidResearchResponseV2(forge(premium, (r) => { delete r.meta.fixture; }), { allowFixture: false }), true, 'a response with no page-level claims stays valid without the marker');
  for (const bad of [null, undefined, 'x', 7, [], {}]) assert.equal(isValidResearchResponseV2(bad), false);
});

test('compatibility: research.1 is untouched and the two versions never validate as each other', async () => {
  const run = await getFixtureAnswer('LG C3 OLED TV');
  const v1 = buildResearchResponse(run.answer, { requestId: 'r', elapsedMs: 5, answerSource: 'AI_ESTIMATE', fixture: true });
  const v2 = scenarioResponse(QUERIES['tv-premium-oled']).response;
  assert.equal(v1.contractVersion, RESEARCH_CONTRACT_VERSION);
  assert.equal(v2.contractVersion, RESEARCH_CONTRACT_V2);
  assert.equal(isValidResearchResponse(v1, { allowFixture: true }), true);
  assert.equal(isValidAnyResearchResponse(v1, { allowFixture: true }), true);
  assert.equal(isValidResearchResponse(v2, { allowFixture: true }), false);
  assert.equal(isValidResearchResponseV2(v1, { allowFixture: true }), false);
  assert.equal(isValidAnyResearchResponse({ ...v2, contractVersion: 'research.3' }), false);
  assert.ok(['category', 'clarify', 'disclosure', 'kind', 'meta', 'original', 'status', 'successor', 'suggestions', 'warnings'].every((key) => key in v2), 'research.2 keeps the research.1 fields');
});

test('the cache is version-aware: research.2 entries live under their own key, and an entry of the wrong version is a miss', async () => {
  assert.notEqual(researchCacheKey('LG C3', { contractVersion: RESEARCH_CONTRACT_V2 }), researchCacheKey('LG C3'));
  const v2 = scenarioResponse(QUERIES['tv-premium-oled']).response;
  const store = createMemoryStore();
  const cache2 = createResearchCache({ redis: store, allowFixture: true, contractVersion: RESEARCH_CONTRACT_V2 });
  const key = researchCacheKey('LG C3', { contractVersion: RESEARCH_CONTRACT_V2 });
  assert.equal(await cache2.write(key, v2), true);
  assert.deepEqual(await cache2.read(key), v2);
  assert.equal(await createResearchCache({ redis: store, allowFixture: true }).read(key), null, 'a research.1 cache never serves research.2');
  assert.equal(await createResearchCache({ redis: store, allowFixture: true }).write(key, v2), false);
  assert.equal(await createResearchCache({ redis: store }).read(key), null, 'a real cache never serves a fixture-marked answer');
  const tampered = clone(v2); tampered.pricing.valuation.range.low = 1;
  assert.equal(await cache2.write(`${key}x`, tampered), false);
  await store.set(`${key}y`, JSON.stringify({ key: `${key}y`, contractVersion: RESEARCH_CONTRACT_V2, response: tampered }));
  assert.equal(await cache2.read(`${key}y`), null, 'a forged cached entry is re-checked on every read');
});

// ---- the route -----------------------------------------------------------------------------------------------------------------------

const PREVIEW = Object.freeze({ ITEMASSIST_RESEARCH_ENABLED: 'true', ITEMASSIST_REPLACEMENT_API_TOKEN: TOKEN, [FIXTURE_MODE_ENV]: 'preview', VERCEL_ENV: 'preview' });
const quiet = { info() {} };
const TRAP = async () => assert.fail('this must not be reached');
const createRes = () => ({ statusCode: 200, body: null, headers: {}, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, setHeader(name, value) { this.headers[name] = value; } });
const call = async (handler, query = 'LG C3 OLED TV') => { const res = createRes(); await handler({ method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: { query } }, res); return res; };
const route = (env) => createItemAssistResearchHandler({ env, logger: quiet, now: () => NOW, requestIdFactory: () => 'req-1', getAnswer: TRAP, redisFactory: TRAP });

test('the route emits research.2 only when the fixture is explicitly told to; the default fixture stays research.1', async () => {
  const v1 = await call(route(PREVIEW));
  assert.equal(v1.body.contractVersion, 'research.1');
  for (const flag of ['research.1', 'research.3', 'RESEARCH.2', ' research.2', '', 'true']) assert.equal((await call(route({ ...PREVIEW, [FIXTURE_CONTRACT_ENV]: flag }))).body.contractVersion, 'research.1', JSON.stringify(flag));
  const handler = route({ ...PREVIEW, [FIXTURE_CONTRACT_ENV]: 'research.2' });
  const first = await call(handler);
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.contractVersion, 'research.2');
  assert.equal(first.body.meta.fixture, true);
  assert.equal(first.headers['X-ItemAssist-Research-Mode'], 'fixture');
  assert.equal(isValidResearchResponseV2(first.body, { allowFixture: true }), true);
  const second = await call(handler);
  assert.equal(second.body.meta.cached, true);
  assert.deepEqual({ ...second.body, meta: { ...second.body.meta, cached: false, requestId: 'req-1' } }, { ...first.body, meta: { ...first.body.meta, elapsedMs: second.body.meta.elapsedMs } });
});

test('the flag does nothing outside the fixture: a real (non-fixture) route never emits research.2, and a refused fixture flag is still refused', async () => {
  const live = { ITEMASSIST_RESEARCH_ENABLED: 'true', ITEMASSIST_REPLACEMENT_API_TOKEN: TOKEN, GEMINI_API_KEY: 'test-key-0123456789abcdef', VERCEL_ENV: 'production', [FIXTURE_CONTRACT_ENV]: 'research.2' };
  const answer = (await getFixtureAnswer('LG C3 OLED TV')).answer;
  const handler = createItemAssistResearchHandler({ env: live, logger: quiet, now: () => NOW, requestIdFactory: () => 'req-1', redisFactory: async () => createMemoryStore(), getAnswer: async () => ({ answer, meta: { requestSent: true, errorCode: null, usage: {} } }) });
  const res = await call(handler);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.contractVersion, 'research.1');
  assert.equal(res.body.meta.fixture, undefined);
  const refused = await call(route({ ...PREVIEW, VERCEL_ENV: 'production', [FIXTURE_CONTRACT_ENV]: 'research.2' }));
  assert.deepEqual([refused.statusCode, refused.body.errorCode], [503, 'API_DISABLED']);
});

test('research.2 fixture traffic keeps every control: auth, budget, no store, no provider; and each scenario is served through the route', async () => {
  const env = { ...PREVIEW, [FIXTURE_CONTRACT_ENV]: 'research.2' };
  const handler = route(env);
  for (const [id, query] of Object.entries(QUERIES)) {
    const res = await call(handler, query);
    assert.equal(res.statusCode, 200, id);
    assert.equal(res.body.contractVersion, 'research.2', id);
    assert.equal(res.body.pricing.valuation.method, EXPECTED[id][0], id);
  }
  const noAuth = createRes();
  await route(env)({ method: 'POST', headers: {}, body: { query: 'LG C3 OLED TV' } }, noAuth);
  assert.equal(noAuth.statusCode, 401);
  const forged = createRes();
  await route(env)({ method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: { query: 'LG C3 OLED TV', fixture: true, contract: 'research.1' } }, forged);
  assert.equal(forged.statusCode, 400);
  const limited = createItemAssistResearchHandler({ env: { ...env, ITEMASSIST_RESEARCH_DAILY_CALL_LIMIT: '1' }, logger: quiet, now: () => NOW, getAnswer: TRAP, redisFactory: TRAP });
  for (const query of ['LG C3 OLED TV', 'Samsung RF28 refrigerator', 'front load washer']) assert.equal((await call(limited, query)).statusCode, 200, 'fixture reservations are released, as before');
});

// ---- correction pass: trust gate, model strings, source hosts, confirmation parity ----------------------------------------------------

test('trust gate: outside a fixture a page-level confirmation is never trusted, so no valuation is verified', () => {
  const prices = [current('p1', 'SUCCESSOR', 1000, 'e1'), current('p2', 'ALT_1', 1100, 'e2')];
  const demo = buildResearchResponseV2(input({}, { prices }), META);
  assert.deepEqual([demo.pricing.valuation.method, demo.pricing.valuation.verified], ['VERIFIED_MULTI', true]);
  const live = buildResearchResponseV2(input({}, { prices }), LIVE_META);
  assert.ok(live.pricing.prices.every((p) => p.verification === 'SEARCH_LISTING'), 'claims of a page confirmation are downgraded');
  assert.deepEqual([live.pricing.valuation.method, live.pricing.valuation.verified], ['PROVISIONAL_LISTINGS', false]);
  assert.ok(reasons(live).includes('PRICE:VERIFICATION_DOWNGRADED:DOWNGRADED'));
  assert.equal(isValidResearchResponseV2(live), true);
  // The same claims forged onto a non-fixture response, or a fixture marker where the caller does not allow it, do not validate.
  assert.equal(isValidResearchResponseV2(demo, { allowFixture: false }), false);
  const forged = clone(live);
  forged.pricing.prices.forEach((p) => { p.verification = 'VERIFIED_PAGE'; });
  assert.equal(isValidResearchResponseV2(forged), false);
});

test('model strings are model codes: a link or a call to action cannot be carried as a model', () => {
  for (const bad of ['www.evil.com/free-tv', 'CALL 555 0100 NOW', 'free tv now 1', 'DEMO', 'A1', 'x'.repeat(30) + '1', 'AB-100/ABCDEFG', 'AB-100 <b>', '']) {
    const { items, rejections } = normalizeEvidence([{ id: 'e1', subject: 'ORIGINAL', sourceUrl: 'https://www.cnet.com/', subjectModel: bad }]);
    assert.equal(items.length, 0, JSON.stringify(bad));
    assert.deepEqual(rejections.map((r) => r.reason), ['SHAPE_INVALID'], JSON.stringify(bad));
  }
  for (const good of ['QN55Q80D', 'RF28R7351SR/AA', 'DEMO-C4-77', 'OLED65C4PUA', 'XR-65A80K']) {
    assert.equal(normalizeEvidence([{ id: 'e1', subject: 'ORIGINAL', sourceUrl: 'https://www.cnet.com/', subjectModel: good }]).items.length, 1, good);
  }
  const r = build({}, { prices: [current('p1', 'SUCCESSOR', 1000, 'e1', 'VERIFIED_PAGE', { model: 'www.evil.com/free-tv' })] });
  assert.equal(r.pricing.prices[0].model, null, 'a malformed model string is dropped from the price');
});

test('only the registered domain and its storefront hosts are first party; marketplace, community, seller and forum hosts are not', () => {
  assert.equal(safeSourceUrl('https://shop.lg.com/us/tv').sourceClass, 'MANUFACTURER');
  assert.equal(safeSourceUrl('https://www.samsung.com/us/').sourceClass, 'MANUFACTURER');
  for (const bad of ['https://marketplace.walmart.com/seller/1', 'https://community.samsung.com/post', 'https://forum.lg.com/', 'https://stores.ebay.com/x', 'https://seller.amazon.com/', 'https://evil.lowes.com.example/',
    'https://a.b.bestbuy.com/', 'https://lowes.com./pd', 'https://shop.evil.example/lg.com']) assert.equal(safeSourceUrl(bad), null, bad);
});

test('a confirmed comparison needs a confirming source about this candidate and a known same-model relation; the validator holds the builder to it', () => {
  const evidence = [ev('e1', 'SUCCESSOR', 'https://www.bestbuy.com/', { subjectModel: null, expectedModel: null }), ev('e2', 'ORIGINAL', 'https://www.bestbuy.com/', { observedAt: ago(1) }), E_A, E_O];
  const make = (evidenceId) => build({ successor: { ...cand('LG C-series OLED', { comparison: [{ requirementKey: 'screenSize', status: 'MEETS', basis: 'CONFIRMED', evidenceId }] }), standing: 'RECOMMENDED' } }, { evidence, prices: [current('p1', 'SUCCESSOR', 1000, 'e1', 'SEARCH_LISTING')] });
  const rowOf = (r) => r.successor.comparison[0];
  assert.deepEqual([rowOf(make('e1')).basis, rowOf(make('e1')).evidenceId], ['AI_ESTIMATE', null], 'an unknown model relation is not a confirmation');
  assert.equal(rowOf(make('e2')).basis, 'AI_ESTIMATE', 'evidence about another subject is not a confirmation');
  assert.equal(rowOf(make('e3')).basis, 'AI_ESTIMATE', 'evidence that is not in the response is not a confirmation');
  // The confirming source (a specification database) is separate from the one behind the price, so only the confirmed row depends on its model relation.
  const honest = build({ successor: { ...cand('LG C-series OLED', { comparison: [{ requirementKey: 'screenSize', status: 'MEETS', basis: 'CONFIRMED', evidenceId: 'e4' }] }), standing: 'RECOMMENDED' } },
    { evidence: [E_S, E_A, E_O, ev('e4', 'SUCCESSOR', 'https://www.rtings.com/tv')], prices: [current('p1', 'SUCCESSOR', 1000, 'e1')] });
  assert.equal(rowOf(honest).basis, 'CONFIRMED');
  assert.equal(isValidResearchResponseV2(honest, { allowFixture: true }), true);
  const forged = clone(honest);
  const confirming = forged.pricing.evidence.find((entry) => entry.id === 'e4');
  confirming.subjectModel = null;
  confirming.modelRelation = 'UNKNOWN';
  assert.equal(isValidResearchResponseV2(forged, { allowFixture: true }), false, 'a confirmed row resting on an unknown relation is invalid');
});

// ---- reproducibility: the frontend's generated copies --------------------------------------------------------------------------------

test('the export script is deterministic: the golden fixture and the registry block are the same on every run, and cover every scenario and host', async () => {
  const { goldenText, registryBlock, withRegistryBlock } = await import('../../scripts/itemassist-research-export.mjs');
  assert.equal(goldenText(), goldenText());
  const golden = JSON.parse(goldenText());
  assert.deepEqual(Object.keys(golden.scenarios).sort(), Object.keys(QUERIES).sort());
  for (const entry of Object.values(golden.scenarios)) assert.equal(isValidResearchResponseV2(entry.engine, { allowFixture: true }), true);
  const block = registryBlock();
  assert.equal(block, registryBlock());
  assert.equal(block.split('\n').filter((line) => /^  \["/.test(line)).length, 45, 'one row per registered host');
  assert.ok(block.includes('"shop","us","m","products"'), 'the storefront labels travel with the registry');
  const before = `head\n${block}\ntail\n`;
  assert.equal(withRegistryBlock(before), before, 'regenerating an up-to-date file changes nothing');
  assert.equal(withRegistryBlock(before.replace('"samsung.com"', '"stale.example"')).includes('stale.example'), false, 'a stale row is replaced');
  assert.throws(() => withRegistryBlock('no markers here'));
});
