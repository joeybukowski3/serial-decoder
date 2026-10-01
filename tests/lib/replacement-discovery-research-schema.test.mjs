import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELD_SPECS, MAX_RAW_CANDIDATES, modelToken, normalizeDomain, validateCandidateResearch, validateOriginalResearch } from '../../lib/replacement-discovery/research-schema.js';
import { candidateFieldPlan, planResearch } from '../../lib/replacement-discovery/research-priority.js';
import { buildResearchCacheKey } from '../../lib/replacement-discovery/research-cache-key.js';
import { interpretReplacementSearch } from '../../lib/replacement-discovery/interpret.js';
import { televisionProfile } from '../../lib/replacement-core/profiles/television.js';
import { refrigeratorProfile } from '../../lib/replacement-core/profiles/refrigerator.js';
import { tvCandidate } from '../fixtures/replacement-discovery/grounded-tv-research.mjs';

const fact = (value) => ({ value, sources: ['samsung.com'], subjectModel: 'QN55Q80D' });
const normalized = (key, value, category = 'television') => FIELD_SPECS[category][key].normalize(value);

test('field values are validated and normalized to the vocabulary replacement-core compares', () => {
  assert.equal(normalized('resolution', 'UHD'), '4K');
  assert.equal(normalized('resolution', '2160p'), '4K');
  assert.equal(normalized('resolution', 'full hd'), undefined);
  assert.equal(normalized('displayTechnology', 'Neo QLED'), 'NEO QLED');
  assert.equal(normalized('displayTechnology', 'QD-OLED'), 'OLED');
  assert.equal(normalized('displayTechnology', 'plasma'), undefined);
  assert.equal(normalized('hdr', 'HDR10, HDR10+ and HLG'), 'HDR10+');
  assert.equal(normalized('hdr', 'Dolby Vision'), 'DOLBY VISION');
  assert.equal(normalized('screenSizeIn', '55'), 55);
  assert.equal(normalized('screenSizeIn', '55 inches'), undefined);
  assert.equal(normalized('screenSizeIn', 5500), undefined);
  assert.equal(normalized('refreshHz', 119.5), undefined);
  assert.equal(normalized('smart', 'yes'), true);
  assert.equal(normalized('smart', 'maybe'), undefined);
  assert.equal(normalized('finish', 'Fingerprint Resistant Stainless Steel', 'refrigerator'), 'stainless');
  assert.equal(normalized('finish', 'Black Stainless Steel', 'refrigerator'), 'black-stainless');
  assert.equal(normalized('configurationFloor', 'Side by Side', 'refrigerator'), 'side-by-side');
  assert.equal(normalized('totalCapacityCuFt', 250, 'refrigerator'), undefined);
});

test('enum fields only accept their own vocabulary: prototype property names are not values', () => {
  for (const word of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
    assert.equal(normalized('displayTechnology', word), undefined, word);
    assert.equal(normalized('dispenser', word, 'refrigerator'), undefined, word);
    assert.equal(normalized('configurationFloor', word, 'refrigerator'), undefined, word);
    assert.equal(normalized('installationType', word, 'refrigerator'), undefined, word);
    assert.equal(normalized('resolution', word), undefined, word);
  }
});

test('free-text fields refuse markup and control characters so nothing researched can carry HTML', () => {
  for (const hostile of ['<img src=x onerror=alert(1)>', '<script>alert(1)</script>', 'a"b', 'x;drop', '`cmd`']) {
    assert.equal(normalized('series', hostile), undefined, hostile);
    assert.equal(normalized('finish', hostile, 'refrigerator'), undefined, hostile);
  }
  assert.equal(normalized('series', "Q80 Series (2024) - Samsung's"), "Q80 Series (2024) - Samsung's");
  const result = validateCandidateResearch({ candidates: [{ ...tvCandidate({ model: 'QN55Q80D' }), brand: '<b>Samsung</b>' }, { ...tvCandidate({ model: 'QN55Q80D' }), model: undefined, baselineLabel: '<script>' }] }, 'television');
  assert.deepEqual(result.rejected.map((item) => item.reasonCode), ['MISSING_BRAND', 'MISSING_MODEL']);
});

test('hostile value shapes reject one entry instead of throwing out of validation', () => {
  let deep = [];
  for (let index = 0; index < 6000; index += 1) deep = [deep];
  const result = validateCandidateResearch({ candidates: [{ ...tvCandidate({ model: 'QN55Q80D' }), availability: deep }, tvCandidate({ model: 'QN55Q85D' })] }, 'television');
  assert.deepEqual(result.rejected.map((item) => item.reasonCode), ['MALFORMED_ENTRY']);
  assert.equal(result.candidates.length, 1);
});

test('physicalFit and brand are not researchable for either category', () => {
  for (const specs of Object.values(FIELD_SPECS)) assert.ok(!('physicalFit' in specs) && !('brand' in specs) && !('model' in specs));
});

test('model tokens and source domains are strictly shaped', () => {
  assert.equal(modelToken(' qn55q80d '), 'QN55Q80D');
  assert.equal(modelToken('Samsung 55 inch QLED'), null);
  assert.equal(modelToken('ab'), null);
  assert.equal(modelToken('<script>'), null);
  assert.equal(normalizeDomain('https://www.Samsung.com/us/tvs?x=1'), 'samsung.com');
  assert.equal(normalizeDomain('samsung'), null);
  assert.equal(normalizeDomain('javascript:alert(1)'), null);
});

test('candidate payload: valid entries pass, each invalid entry is rejected with a specific reason', () => {
  const cases = [
    [{ ...tvCandidate({ model: 'QN55Q80D' }), brand: undefined }, 'MISSING_BRAND'],
    [{ ...tvCandidate({ model: 'QN55Q80D' }), category: undefined }, 'MISSING_CATEGORY'],
    [{ ...tvCandidate({ model: 'QN55Q80D' }), category: 'refrigerator' }, 'WRONG_CATEGORY'],
    [{ ...tvCandidate({ model: 'QN55Q80D' }), model: undefined }, 'MISSING_MODEL'],
    [{ ...tvCandidate({ model: 'QN55Q80D' }), model: 'a great 55 inch tv' }, 'VAGUE_MODEL'],
    [tvCandidate({ model: 'QN55Q80D', availability: 'DISCONTINUED' }), 'NOT_CURRENT_NEW_RETAIL'],
    [tvCandidate({ model: 'QN55Q80D', availability: 'MARKETPLACE_ONLY' }), 'NOT_CURRENT_NEW_RETAIL'],
    [tvCandidate({ model: 'QN55Q80D', condition: 'REFURBISHED' }), 'NOT_CURRENT_NEW_RETAIL'],
    [tvCandidate({ model: 'QN55Q80D', condition: 'used' }), 'NOT_CURRENT_NEW_RETAIL'],
    [42, 'MALFORMED_ENTRY'],
    [[tvCandidate({ model: 'QN55Q80D' })], 'MALFORMED_ENTRY'],
  ];
  const result = validateCandidateResearch({ candidates: [...cases.map(([entry]) => entry), tvCandidate({ model: 'QN55Q80D' })] }, 'television');
  assert.deepEqual(result.rejected.map((item) => item.reasonCode), cases.map(([, reason]) => reason));
  assert.equal(result.candidates.length, 1);
  assert.equal(result.receivedCount, cases.length + 1);
});

test('payload shape: missing or wrongly typed containers are INVALID, not exceptions', () => {
  for (const raw of [null, undefined, 'x', 7, [], {}, { candidates: 'no' }, { candidates: { 0: {} } }]) {
    assert.equal(validateCandidateResearch(raw, 'television').status, 'INVALID');
  }
  for (const raw of [null, {}, { original: 'x' }, { original: [] }]) assert.equal(validateOriginalResearch(raw, 'television').status, 'INVALID');
  assert.equal(validateCandidateResearch({ candidates: [] }, 'washer').errorCode, 'UNSUPPORTED_CATEGORY');
});

test('oversized candidate arrays are truncated with a warning before any processing', () => {
  const many = Array.from({ length: 40 }, (_, index) => tvCandidate({ model: `QN55Q${index + 100}D` }));
  const result = validateCandidateResearch({ candidates: many }, 'television');
  assert.equal(result.candidates.length, MAX_RAW_CANDIDATES);
  assert.deepEqual(result.warnings.find((warning) => warning.code === 'CANDIDATES_TRUNCATED'), { code: 'CANDIDATES_TRUNCATED', received: 40 });
});

test('invalid relationship labels degrade to UNKNOWN with a warning; provider rank and confidence are sanitized', () => {
  const result = validateCandidateResearch({ candidates: [{ ...tvCandidate({ model: 'QN55Q80D' }), relationship: 'BEST_EVER', providerRank: 'first', providerConfidence: 'certain' }] }, 'television');
  assert.equal(result.candidates[0].relationship, 'UNKNOWN');
  assert.deepEqual([result.candidates[0].providerRank, result.candidates[0].providerConfidence], [null, null]);
  assert.ok(result.warnings.some((warning) => warning.code === 'RELATIONSHIP_INVALID'));
});

test('bare fact values are accepted as unsourced claims; over-long text and control characters are refused', () => {
  const entry = { ...tvCandidate({ model: 'QN55Q80D' }), facts: { screenSizeIn: 55, series: 'x'.repeat(200), featurePackage: fact('ok\u0000pkg') } };
  const [candidate] = validateCandidateResearch({ candidates: [entry] }, 'television').candidates;
  assert.deepEqual(candidate.facts.screenSizeIn, { value: 55, sources: [], subjectModel: null });
  assert.ok(!('series' in candidate.facts));
  assert.equal(candidate.facts.featurePackage.value, 'ok pkg');
});

test('research plan follows policy priority and skips secondary detail', () => {
  const original = (query, notes) => interpretReplacementSearch({ query, notes }).normalizedOriginal;
  const tvPlan = planResearch(original('Samsung QN55Q80'), televisionProfile);
  assert.equal(tvPlan.mode, 'EXACT_MODEL');
  assert.equal(tvPlan.originalResearch, true);
  const keys = tvPlan.priorityFields.map((field) => field.key);
  assert.deepEqual(keys.slice(0, 2), ['resolution', 'tier']);
  assert.ok(keys.indexOf('resolution') < keys.indexOf('refreshHz') && keys.indexOf('refreshHz') < keys.indexOf('hdr'));
  assert.ok(!keys.some((key) => ['tuner', 'hdmiCount', 'hdmiGeneration', 'speaker', 'physicalFit', 'screenSizeIn', 'brand'].includes(key)));
  assert.equal(keys.at(-1), 'modelYear');
  const fridgePlan = planResearch(original('LG side by side refrigerator'), refrigeratorProfile);
  assert.equal(fridgePlan.mode, 'BROAD_BASELINE');
  assert.equal(fridgePlan.originalResearch, false);
  assert.equal(fridgePlan.priorityFields[0].key, 'totalCapacityCuFt');
  assert.deepEqual(fridgePlan.informationalFields, []);
  const exactFridge = planResearch(original('LG LRSXS2706S side by side refrigerator'), refrigeratorProfile);
  assert.deepEqual(exactFridge.informationalFields, ['widthIn', 'heightIn', 'depthIn', 'clearanceWidthIn', 'clearanceHeightIn', 'clearanceDepthIn', 'panelReady']);
  const candidateKeys = candidateFieldPlan(televisionProfile).map((field) => field.key);
  assert.ok(candidateKeys.includes('tier') && candidateKeys.includes('screenSizeIn') && !candidateKeys.includes('tuner'));
});

test('a fully specified original needs no original-research call', () => {
  const full = interpretReplacementSearch({ query: 'Samsung QN55Q80 55 inch QLED 4K 120 Hz smart TV HDR10+', notes: 'tier: premium; physical fit: yes' }).normalizedOriginal;
  const plan = planResearch(full, televisionProfile);
  assert.deepEqual(plan.priorityFields.map((field) => field.key), ['featurePackage', 'gamingFeatures', 'modelYear']);
  assert.equal(plan.originalResearch, false);
});

const cacheOriginal = (query, notes) => interpretReplacementSearch({ query, notes }).normalizedOriginal;
const keyFor = (original, overrides = {}) => buildResearchCacheKey({ job: 'candidates', original, mode: 'EXACT_MODEL', limit: 6, ...overrides });

test('cache identity ignores spelling, spacing, casing and the undocumented-fit note, and never embeds raw text', () => {
  const base = keyFor(cacheOriginal('Samsung QN55Q80 55 inch QLED'));
  assert.equal(keyFor(cacheOriginal('  samsung   qn55q80  55 INCH qled ')), base);
  assert.equal(keyFor(cacheOriginal('Samsung QN55Q80 55 inch QLED', 'physical fit: yes')), base);
  assert.ok(/^replacement-research:v1:candidates:television:[0-9a-f]{24}$/.test(base));
});

test('cache identity separates materially different items, jobs, modes and limits', () => {
  const keys = new Set([
    keyFor(cacheOriginal('Samsung QN55Q80 55 inch QLED')),
    keyFor(cacheOriginal('Samsung QN65Q80 65 inch QLED')),
    keyFor(cacheOriginal('Samsung QN55Q80 55 inch OLED')),
    keyFor(cacheOriginal('Samsung QN55Q80 55 inch QLED 120 Hz')),
    keyFor(cacheOriginal('Samsung QN55Q80 55 inch QLED', 'tier: luxury')),
    keyFor(cacheOriginal('Sony QN55Q80 55 inch QLED')),
    keyFor(cacheOriginal('Samsung QN55Q80 55 inch QLED'), { job: 'original' }),
    keyFor(cacheOriginal('Samsung QN55Q80 55 inch QLED'), { mode: 'BROAD_BASELINE' }),
    keyFor(cacheOriginal('Samsung QN55Q80 55 inch QLED'), { limit: 3 }),
    keyFor(cacheOriginal('LG side by side refrigerator 25 cu ft')),
    keyFor(cacheOriginal('LG side by side refrigerator 26 cu ft')),
    keyFor(cacheOriginal('LG french door refrigerator 25 cu ft')),
    keyFor(cacheOriginal('LG side by side refrigerator 25 cu ft stainless')),
  ]);
  assert.equal(keys.size, 13);
  assert.throws(() => buildResearchCacheKey({ job: 'pricing', original: cacheOriginal('Samsung QN55Q80'), mode: 'EXACT_MODEL' }), /job must be/);
});
