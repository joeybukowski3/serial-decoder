import test from 'node:test';
import assert from 'node:assert/strict';

import { classifySmartLookupQuery, compactModel } from '../../lib/smart-lookup/normalize.js';
import { buildSmartAgeCacheKey } from '../../lib/smart-lookup/cache.js';
import { chooseSmartLookupRoute } from '../../lib/smart-lookup/route-mode.js';
import { isSmartAgeProductCompatible } from '../../lib/smart-lookup/age-identity.js';
import { buildDeterministicBroadResult } from '../../lib/smart-lookup/static-results.js';

// Classifier-only corrections (Phase B4). None of these add alias or
// equivalence data: they stop the classifier from asserting things it cannot
// know (a Samsung phone SKU is not a tablet), stop a more specific query from
// scoring less specific than a shorter one, and keep two forms of a model
// number apart: `exactModel` is the human-readable display value (format
// unchanged from before B4) and `modelIdentity` is the compact value used for
// comparison, deduplication and cache keys. The PR #133 raw-provider identity
// guard is exercised below to prove it was neither loosened nor bypassed.
// Conflicting identifiers, non-SKU hyphenated tokens and Xbox accessories are
// covered in classifier-sku-conflicts.test.mjs.

function info(query) { return classifySmartLookupQuery(query); }
function verdict(request, payload) {
  return isSmartAgeProductCompatible({ bestEstimateYear: 2020, ...payload }, info(request));
}

// ── 1. Samsung SM- SKUs no longer imply a tablet / Galaxy Tab ────────────────

for (const [query, display, compact] of [
  ['Samsung SM-S918U', 'SM-S918U', 'SMS918U'],
  ['Samsung SM-G991B', 'SM-G991B', 'SMG991B'],
  ['Samsung SM-X200', 'SM-X200', 'SMX200'],
  ['Samsung SM-X205', 'SM-X205', 'SMX205'],
]) {
  test(`an SM- SKU does not assign a category or family and stays human-readable: ${query}`, () => {
    const result = info(query);
    assert.equal(result.brand, 'Samsung');
    assert.equal(result.exactModel, display);
    assert.equal(result.modelIdentity, compact);
    assert.equal(result.productType, null);
    assert.equal(result.productFamily, null);
    assert.equal(result.familyId, null);
    assert.equal(result.querySpecificity, 'exact-model');
  });
}

test('a brandless SM- SKU still resolves Samsung and carries no tablet claim', () => {
  const result = info('SM-S918U');
  assert.equal(result.brand, 'Samsung');
  assert.equal(result.exactModel, 'SM-S918U');
  assert.equal(result.modelIdentity, 'SMS918U');
  assert.equal(result.productType, null);
  assert.equal(result.productFamily, null);
});

test('a brandless SM- SKU and the branded query share one canonical identity', () => {
  assert.equal(info('SM-X200').canonicalQuery, info('Samsung SM-X200').canonicalQuery);
  assert.equal(info('Samsung SM-X200').canonicalQuery, 'samsung smx200');
});

test('SM- SKUs are not reported as a second ambiguous identifier of themselves', () => {
  assert.deepEqual(info('Samsung SM-X200').ambiguousIdentifiers, []);
  assert.deepEqual(info('SM-X200').ambiguousIdentifiers, []);
});

test('the Galaxy Tab family is still recognized from the user\'s own words', () => {
  const family = info('Samsung Galaxy Tab A8');
  assert.equal(family.productFamily, 'Galaxy Tab');
  assert.equal(family.productType, 'tablet');
  assert.equal(family.querySpecificity, 'product-family');

  const both = info('Samsung Galaxy Tab A8 SM-X200');
  assert.equal(both.productFamily, 'Galaxy Tab');
  assert.equal(both.productType, 'tablet');
  assert.equal(both.exactModel, 'SM-X200');
  assert.equal(both.modelIdentity, 'SMX200');
  assert.equal(both.querySpecificity, 'exact-model');
});

// Identity is the compact form: sibling SKUs and regional variants (a suffix
// after the base SKU) must never collapse together, while spelling variants of
// one SKU must always collapse.
const ageKey = (query) => {
  const result = info(query);
  return buildSmartAgeCacheKey(result, { grounded: false, routeMode: chooseSmartLookupRoute(result).mode });
};

test('sibling SKUs and regional variants keep distinct identities and cache keys', () => {
  const skus = [
    'Samsung SM-S918U', 'Samsung SM-S918U1', 'Samsung SM-S918U/DS', 'Samsung SM-S918B',
    'Samsung SM-X200', 'Samsung SM-X205',
    'LG OLED55C3PUA', 'LG OLED55C3AUA', 'LG OLED65C3PUA',
    'PlayStation 4 CUH-1215A', 'PlayStation 4 CUH-1215B', 'PlayStation 4 CUH-2215A',
  ];
  assert.equal(new Set(skus.map((query) => info(query).modelIdentity)).size, skus.length);
  assert.equal(new Set(skus.map((query) => info(query).canonicalQuery)).size, skus.length);
  assert.equal(new Set(skus.map(ageKey)).size, skus.length);
});

test('a regional-variant suffix is never truncated into its base SKU', () => {
  assert.equal(info('Samsung SM-S918U/DS').modelIdentity, 'SMS918UDS');
  assert.notEqual(info('Samsung SM-S918U/DS').modelIdentity, info('Samsung SM-S918U').modelIdentity);
});

test('spelling variants of one SKU share one identity and one cache key', () => {
  for (const group of [
    ['Samsung SM-X200', 'samsung sm-x200', 'SAMSUNG  SM-X200', 'Samsung model SM-X200'],
    ['Sony CUH-1215A', 'sony cuh-1215a', 'Sony CUH1215A'],
  ]) {
    assert.equal(new Set(group.map((query) => info(query).modelIdentity)).size, 1, group.join(' | '));
    assert.equal(new Set(group.map(ageKey)).size, 1, group.join(' | '));
  }
});

// ── 2. An exact SKU keeps its tier when a line/family name accompanies it ────

for (const query of [
  'PlayStation 4 CUH-1215A',
  'Sony PlayStation 4 CUH-1215A',
  'PS4 CUH-1215A',
  'Sony CUH-1215A',
]) {
  test(`a console SKU stays exact-model with its line name: ${query}`, () => {
    const result = info(query);
    assert.equal(result.brand, 'Sony');
    assert.equal(result.exactModel, 'CUH1215A');
    assert.equal(result.modelCompleteness, 'exact');
    assert.equal(result.querySpecificity, 'exact-model');
    assert.deepEqual(result.ambiguousIdentifiers, []);
  });
}

test('the console SKU does not fall back to the line token or demote to ambiguous', () => {
  const result = info('PlayStation 4 CUH-1215A');
  assert.equal(result.modelIdentity, 'CUH1215A');
  assert.equal(result.productFamily, 'PlayStation');
  assert.equal(result.modelLineId, null);
  assert.equal(result.canonicalQuery, 'sony cuh1215a');
  assert.equal(result.canonicalQuery, info('Sony CUH-1215A').canonicalQuery);
});

test('a sibling console SKU keeps a distinct identity', () => {
  assert.equal(info('PlayStation 4 CUH-2215B').exactModel, 'CUH2215B');
  assert.notEqual(info('PlayStation 4 CUH-2215B').canonicalQuery, info('PlayStation 4 CUH-1215A').canonicalQuery);
});

test('a service tag next to a line name never displaces the line or becomes the model', () => {
  for (const query of ['PlayStation 4 7PJ2XK1', 'Dell OptiPlex 9020 7PJ2XK1', '7PJ2XK1 Dell OptiPlex 9020']) {
    const result = info(query);
    assert.notEqual(result.exactModel, '7PJ2XK1', query);
    assert.equal(result.querySpecificity, 'model-line', query);
    assert.ok(result.ambiguousIdentifiers.includes('7PJ2XK1'), query);
  }
});

test('an explicitly labeled model wins over the line name', () => {
  const result = info('PlayStation 4 model CUH1215A');
  assert.equal(result.exactModel, 'CUH1215A');
  assert.equal(result.querySpecificity, 'exact-model');
});

test('a recognized SKU is exact with or without a hyphen; an unrecognized shape stays at the line tier', () => {
  // The SKU is recognized by the registry vocabulary, not by a hyphen.
  const hyphenless = info('PlayStation 4 CUH1215A');
  assert.equal(hyphenless.querySpecificity, 'exact-model');
  assert.equal(hyphenless.exactModel, 'CUH1215A');
  // Without a hyphen or a brand word the token is only a partial model, so it
  // is not promoted over the line name (conservative, documented).
  const bare = info('PS4 CUH1215A');
  assert.equal(bare.querySpecificity, 'model-line');
  assert.ok(bare.ambiguousIdentifiers.includes('CUH1215A'));
});

test('a model-line-only query is unchanged and stays below exact-model', () => {
  for (const [query, lineId] of [
    ['PlayStation 4', 'playstation-4'],
    ['Sony PS5', 'playstation-5'],
  ]) {
    const result = info(query);
    assert.equal(result.querySpecificity, 'model-line', query);
    assert.equal(result.modelLineId, lineId, query);
    assert.equal(result.exactModel, null, query);
    assert.equal(result.modelCompleteness, 'partial', query);
  }
});

test('hyphenated model-line tokens without a configuration suffix still stay partial', () => {
  const nitro = info('Acer Nitro 5 AN515-58');
  assert.equal(nitro.querySpecificity, 'model-line');
  assert.equal(nitro.exactModel, null);
  assert.equal(nitro.modelCompleteness, 'partial');

  const xps = info('Dell XPS 15 9530');
  assert.equal(xps.querySpecificity, 'model-line');
  assert.equal(xps.modelLineId, 'xps-15-9530');
  assert.equal(xps.exactModel, null);
});

// ── 3. exactModel / modelIdentity use one compact form ───────────────────────

test('family-pattern exact models keep a readable exactModel and a compact identity', () => {
  for (const query of ['Acer Nitro 5 AN515-58-52XX', 'AN515-58-52XX']) {
    const result = info(query);
    assert.equal(result.exactModel, 'AN515-58-52XX', query);
    assert.equal(result.modelIdentity, 'AN5155852XX', query);
    assert.deepEqual(result.ambiguousIdentifiers, [], query);
  }
  const inspiron = info('Dell Inspiron 15 5000-5593');
  assert.equal(inspiron.exactModel, 'INSPIRON 15 5000-5593');
  assert.equal(inspiron.modelIdentity, 'INSPIRON1550005593');
});

test('exactModel display values are unchanged from the shipped format', () => {
  // Pinned from the pre-B4 classifier: family-pattern models keep their matched
  // text, other models keep the compact identity, and LG TV models are compact.
  for (const [query, expected] of [
    ['Acer AN515-58-57Y8', 'AN515-58-57Y8'],
    ['Samsung SM-X200', 'SM-X200'],
    ['Sony CUH-1215A', 'CUH1215A'],
    ['LG OLED55C3PUA', 'OLED55C3PUA'],
    ['Samsung QN55Q60BAFXZA', 'QN55Q60BAFXZA'],
    ['GE GFW850SPN0DG', 'GFW850SPN0DG'],
  ]) {
    assert.equal(info(query).exactModel, expected, query);
  }
});

test('Inspiron spellings of one SKU share one identity and one cache key', () => {
  const spellings = ['Dell Inspiron 15 5000 5593', 'Dell Inspiron 15 5000-5593', 'dell inspiron 15 5000 - 5593'];
  assert.equal(new Set(spellings.map((query) => info(query).modelIdentity)).size, 1);
  assert.equal(new Set(spellings.map((query) => info(query).canonicalQuery)).size, 1);
  assert.equal(new Set(spellings.map(ageKey)).size, 1);
});

test('exactModel always compacts to modelIdentity when the model is exact', () => {
  for (const query of [
    'Samsung SM-X200', 'PlayStation 4 CUH-1215A', 'LG OLED55C3PUA', 'Samsung QN55Q60BAFXZA',
    'GE GFW850SPN0DG', 'Acer Nitro 5 AN515-58-52XX', 'LG C3 OLED55C3PUA', 'Dell Inspiron 15 5000 5593',
  ]) {
    const result = info(query);
    assert.ok(result.exactModel, query);
    assert.equal(compactModel(result.exactModel), result.modelIdentity, query);
  }
});

// Cache keys for every query this change does not intentionally reclassify are
// byte-identical to the pre-B4 keys (hash tails captured from the previous
// classifier), so existing cache entries stay readable.
test('cache keys for unaffected queries are unchanged', () => {
  for (const [query, ungrounded, grounded] of [
    ['GE GFW850SPN0DG', '8adc67c3b1d4cf0bf75c6104', '0ecb380764cbb216132b3708'],
    ['LG OLED55C3PUA', 'b5a919f3504ce28bd6a4a3b9', '1ef4ecf8fc8f291e258f2acd'],
    ['Samsung QN55Q60BAFXZA', 'd1c282a0ad75785f6d63facc', 'fe44c47ca7913e6c6ee38f22'],
    ['Sony CUH-1215A', 'ea83f92d397d5f7a458404ae', '9df05081caee41eecd81a9d9'],
    ['PlayStation 4', 'aacef24e7cbb647e5602b127', 'cbb992338f34c9795e9b410b'],
    ['Dell XPS 15 9530', 'd45dd738b7ecb1a3e7da9899', 'd2eddab698bb06f3e418ef16'],
    ['Acer Nitro 5 AN515-58', 'a5256bec4eceeafa0e71aecb', '686a8b0e49287588a4e8b84e'],
    ['Samsung Galaxy Tab A8', '25002fa6b974c39bbdedb7ea', '611a90ba7ed50428b867ac06'],
    ['Whirlpool WTW5000DW', 'e2e40649070e7557f247277e', '4f30f3f343081a5b31ae94d6'],
    ['Samsung Q60B', 'c5a57e7411dc008a3ab5ad8b', '46d1dee3258cfc3cfdb71324'],
  ]) {
    const result = info(query);
    const routeMode = chooseSmartLookupRoute(result).mode;
    assert.equal(buildSmartAgeCacheKey(result, { grounded: false, routeMode }).split(':').pop(), ungrounded, query);
    assert.equal(buildSmartAgeCacheKey(result, { grounded: true, routeMode }).split(':').pop(), grounded, query);
  }
});

// ── 4. Xbox is recognized as a Microsoft product family ──────────────────────

for (const query of ['Xbox One', 'Microsoft Xbox One', 'xbox one']) {
  test(`Xbox One resolves Microsoft and the xbox-one line: ${query}`, () => {
    const result = info(query);
    assert.equal(result.brand, 'Microsoft');
    assert.equal(result.productFamily, 'Xbox');
    assert.equal(result.familyId, 'xbox');
    assert.equal(result.modelLineId, 'xbox-one');
    assert.equal(result.querySpecificity, 'model-line');
    assert.equal(result.exactModel, null);
    assert.equal(result.modelCompleteness, 'partial');
  });
}

test('Xbox Series X and S and Xbox 360 stay distinct lines', () => {
  assert.equal(info('Xbox Series X').modelLineId, 'xbox-series-x');
  assert.equal(info('Xbox Series S').modelLineId, 'xbox-series-s');
  assert.equal(info('Xbox 360').modelLineId, 'xbox-360');
  assert.notEqual(info('Xbox Series X').canonicalQuery, info('Xbox Series S').canonicalQuery);
  assert.notEqual(info('Xbox One').canonicalQuery, info('Xbox Series X').canonicalQuery);
});

test('a bare Xbox query is a product-family query, not a model line', () => {
  const result = info('Microsoft Xbox');
  assert.equal(result.brand, 'Microsoft');
  assert.equal(result.familyId, 'xbox');
  assert.equal(result.modelLineId, null);
  assert.equal(result.querySpecificity, 'product-family');
});

test('the Xbox brand alias does not make the query decoder-backed or invent a category', () => {
  const result = info('Xbox One');
  assert.equal(result.genericCategory, '');
  assert.equal(result.productType, 'game console');
});

test('Xbox recognition adds no manufacture-date or lifecycle claim', () => {
  for (const query of ['Xbox One', 'Xbox Series X', 'Microsoft Xbox']) {
    const result = info(query);
    assert.equal(result.modelYearFamilyYear, null, query);
    assert.equal(result.modelYearFamilyLabel, null, query);
    const card = buildDeterministicBroadResult(result);
    const yearContext = card?.yearContext;
    assert.ok(!yearContext || !['production-range', 'model-year-family', 'market-introduction'].includes(yearContext.type), `${query}: ${JSON.stringify(yearContext)}`);
    assert.ok(!card || !Number.isInteger(card.bestEstimateYear), query);
  }
});

test('an unrelated brand name does not pick up the Xbox family', () => {
  assert.equal(info('Sony PlayStation 4').brand, 'Sony');
  assert.notEqual(info('Sony PlayStation 4').familyId, 'xbox');
  assert.notEqual(info('Samsung Galaxy Tab A8').familyId, 'xbox');
});

// ── PR #133 identity safeguards are unchanged ────────────────────────────────

test('guard: a sibling SM- SKU is still rejected', () => {
  assert.equal(verdict('Samsung SM-X200', { brand: 'Samsung', model: 'SM-X200', product: 'Samsung Galaxy Tab A8 SM-X200' }), true);
  assert.equal(verdict('Samsung SM-X200', { brand: 'Samsung', model: 'SM-X205', product: 'Samsung Galaxy Tab A8 SM-X205' }), false);
  assert.equal(verdict('Samsung SM-S918U', { brand: 'Samsung', model: 'SM-S918B', product: 'Samsung Galaxy S23 Ultra SM-S918B' }), false);
});

test('guard: the console SKU echo is accepted, a sibling SKU or another generation is rejected', () => {
  assert.equal(verdict('PlayStation 4 CUH-1215A', { brand: 'Sony', model: 'CUH-1215A', product: 'Sony PlayStation 4 CUH-1215A' }), true);
  assert.equal(verdict('PlayStation 4 CUH-1215A', { brand: 'Sony', model: 'CUH-2115A', product: 'Sony PlayStation 4 CUH-2115A' }), false);
  assert.equal(verdict('PlayStation 4 CUH-1215A', { brand: 'Sony', model: 'CFI-1015A', product: 'Sony PlayStation 5 CFI-1015A' }), false);
});

test('guard: a dated payload that names no SKU does not satisfy an exact-SKU request', () => {
  assert.equal(verdict('PlayStation 4 CUH-1215A', { brand: 'Sony', model: 'PlayStation 4', product: 'Sony PlayStation 4' }), false);
  assert.equal(verdict('PS4 CUH-1215A', { brand: 'Sony', model: 'PlayStation 4', product: 'Sony PlayStation 4' }), false);
});

test('guard: Xbox lines are not interchangeable and other brands are rejected', () => {
  assert.equal(verdict('Xbox One', { brand: 'Microsoft', model: 'Xbox One', product: 'Microsoft Xbox One' }), true);
  assert.equal(verdict('Xbox One', { brand: 'Microsoft', model: 'Xbox Series X', product: 'Microsoft Xbox Series X' }), false);
  assert.equal(verdict('Xbox Series X', { brand: 'Microsoft', model: 'Xbox Series S', product: 'Microsoft Xbox Series S' }), false);
  assert.equal(verdict('Xbox One', { brand: 'Sony', model: 'PlayStation 4', product: 'Sony PlayStation 4' }), false);
});

test('guard: a payload with no identity at all is still rejected for every corrected query', () => {
  for (const query of ['Samsung SM-X200', 'PlayStation 4 CUH-1215A', 'Xbox One']) {
    assert.equal(verdict(query, { product: 'Unknown device' }), false, query);
  }
});

test('guard: sibling SKUs and regional variants stay strictly distinct with a readable exactModel', () => {
  const answer = (request, model, product) => verdict(request, { brand: request.split(' ')[0], model, product });
  // A regional variant is its own product: neither direction may be satisfied by the other.
  assert.equal(answer('Samsung SM-S918U/DS', 'SM-S918U/DS', 'Samsung Galaxy S23 Ultra SM-S918U/DS'), true);
  assert.equal(answer('Samsung SM-S918U/DS', 'SM-S918U', 'Samsung Galaxy S23 Ultra SM-S918U'), false);
  assert.equal(answer('Samsung SM-S918U', 'SM-S918U/DS', 'Samsung Galaxy S23 Ultra SM-S918U/DS'), false);
  assert.equal(answer('Samsung SM-S918U', 'SM-S918U1', 'Samsung Galaxy S23 Ultra SM-S918U1'), false);
  // Display punctuation never decides identity.
  assert.equal(answer('Samsung SM-S918U', 'SMS918U', 'Samsung SMS918U'), true);
  assert.equal(answer('Acer AN515-58-57Y8', 'AN515-58-57Y8', 'Acer Nitro 5 AN515-58-57Y8'), true);
  assert.equal(answer('Acer AN515-58-57Y8', 'AN515-58-57Y9', 'Acer Nitro 5 AN515-58-57Y9'), false);
  assert.equal(answer('Dell Inspiron 15 5000 5593', 'Inspiron 15 5000 5593', 'Dell Inspiron 15 5000 5593'), true);
  assert.equal(answer('Dell Inspiron 15 5000 5593', 'Inspiron 15 5000 5594', 'Dell Inspiron 15 5000 5594'), false);
});
