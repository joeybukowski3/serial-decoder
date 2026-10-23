import test from 'node:test';
import assert from 'node:assert/strict';

import { classifySmartLookupQuery } from '../../lib/smart-lookup/normalize.js';
import { buildSmartAgeCacheKey } from '../../lib/smart-lookup/cache.js';
import { chooseSmartLookupRoute } from '../../lib/smart-lookup/route-mode.js';
import { isSmartAgeProductCompatible } from '../../lib/smart-lookup/age-identity.js';
import { GENERAL_FAMILY_SEEDS, matchKnownSku } from '../../lib/smart-lookup/family-registry.js';
import { buildDeterministicReplacementResult } from '../../lib/smart-lookup/replacement-static-results.js';
import { createLkqLookupHandler } from '../../api/lkq-lookup.js';
import { allowingRateLimiter } from '../helpers/allowing-rate-limiter.mjs';

// Review findings F1-F3 on the B4 classifier:
//   F1  a hyphenated spec ("i7-12700H", "RTX-4070", "500GB-Black") is not a SKU
//       and must never replace the product identity; a capacity is never half
//       of a model number.
//   F2  a SKU that contradicts the stated manufacturer, family or generation is
//       preserved as a conflict, never silently promoted to the exact model.
//   F3  Xbox accessories are not consoles, and recognizing the Xbox family does
//       not widen paid grounded replacement research.
// Final corrections: a console that mentions a bundled accessory stays a console,
// Xbox returns no empty static replacement card, a labeled CPU/GPU/capacity is
// not a model number, and a recognized SKU never joins to a resolution token.
// Cache-key tails marked "pre-B4" were captured from the classifier before B4.

function info(query) { return classifySmartLookupQuery(query); }
function routeMode(result) { return chooseSmartLookupRoute(result).mode; }
function ageKey(query, grounded = false) {
  const result = info(query);
  return buildSmartAgeCacheKey(result, { grounded, routeMode: routeMode(result) });
}
function keyTail(query, grounded = false) { return ageKey(query, grounded).split(':').pop(); }
function verdict(request, payload) {
  return isSmartAgeProductCompatible({ bestEstimateYear: 2020, ...payload }, info(request));
}

// ── F1. Specs and variants never replace the product identity ────────────────

const SPEC_QUERIES = [
  // [query, line id the query must keep, the spec token that must stay ambiguous, pre-B4 age key tails]
  ['Dell XPS 15 9530 i7-12700H', 'xps-15-9530', 'I712700H', '608e600d4620571e51ffe699', '17fd54a22df7767bcb09fd3c'],
  ['Dell XPS 15 9530 RTX-4070', 'xps-15-9530', 'RTX4070', '4f569411f4d2a3a3450f5fc0', '38747060a2f89d60314fdd81'],
  ['Acer Nitro 5 AN515-58 i5-12500H', 'an515', 'I512500H', 'bb741556a953bae0fa12e021', '959059d2fae56ff9667ddeb3'],
  ['PlayStation 4 500GB-Black', 'playstation-4', '500GBBLACK', 'a83bd50aba4d290505466f67', 'bec48f6a2d550bc323293357'],
];

for (const [query, lineId, spec, ungrounded, grounded] of SPEC_QUERIES) {
  test(`F1: a hyphenated spec does not replace the identity: ${query}`, () => {
    const result = info(query);
    assert.equal(result.querySpecificity, 'model-line');
    assert.equal(result.modelLineId, lineId);
    assert.equal(result.exactModel, null);
    assert.equal(result.modelCompleteness, 'partial');
    assert.ok(result.ambiguousIdentifiers.includes(spec), `${spec} stays visible as an ambiguous identifier`);
    assert.equal(keyTail(query), ungrounded, 'cache identity is unchanged from before B4');
    assert.equal(keyTail(query, true), grounded);
  });
}

test('F1: a correct family answer is accepted and a spec-only answer is rejected', () => {
  const answer = (request, brand, model, product) => verdict(request, { brand, model, product });
  assert.equal(answer('Dell XPS 15 9530 i7-12700H', 'Dell', 'XPS 15 9530', 'Dell XPS 15 9530'), true);
  assert.equal(answer('Dell XPS 15 9530 i7-12700H', 'Dell', 'I7-12700H', 'Intel Core i7-12700H'), false);
  assert.equal(answer('Dell XPS 15 9530 RTX-4070', 'Dell', 'RTX-4070', 'NVIDIA GeForce RTX 4070'), false);
  assert.equal(answer('PlayStation 4 500GB-Black', 'Sony', 'PlayStation 4', 'Sony PlayStation 4'), true);
});

test('F1: a capacity is never joined into a model number, in either order', () => {
  for (const query of [
    'PlayStation 4 CUH-1215A 500GB',
    'Sony CUH-1215A 500GB',
    '500GB Sony CUH-1215A',
    'PlayStation 4 1.5TB CUH-1215A',
    'Sony PlayStation 4 500GB CUH-2215B',
  ]) {
    const result = info(query);
    assert.doesNotMatch(result.modelIdentity, /(?:GB|TB)/, `${query}: no capacity inside the identity`);
    assert.equal(result.querySpecificity, 'exact-model', query);
    assert.match(result.exactModel, /^CUH\d{4}[A-Z]$/, query);
  }
  assert.deepEqual(info('Sony CUH-1215A 500GB').ambiguousIdentifiers, ['500GB']);
});

test('F1: a model split by a stray space still joins, and two complete identifiers still do not', () => {
  assert.equal(info('QN65 Q60RAFXZA').modelIdentity, 'QN65Q60RAFXZA');
  assert.equal(info('GE FR31424IN GFW850SPN0DG').modelIdentity, 'GFW850SPN0DG');
});

test('F1: the exact SKU is still promoted when the registry recognizes it and it agrees with the line', () => {
  for (const query of [
    'PlayStation 4 CUH-1215A', 'PS4 CUH-1215A', 'Sony PlayStation 4 CUH-1215A',
    'PlayStation 4 CUH-1215A 500GB', 'PlayStation 5 CFI-1015A', 'PS5 CFI-1015A',
  ]) {
    const result = info(query);
    assert.equal(result.querySpecificity, 'exact-model', query);
    assert.equal(result.identifierConflict, null, query);
    assert.equal(result.modelLineId, null, query);
  }
  assert.equal(info('PlayStation 4 CUH-1215A').exactModel, 'CUH1215A');
  assert.equal(info('PlayStation 5 CFI-1015A').exactModel, 'CFI1015A');
  assert.equal(keyTail('PlayStation 4 CUH-1215A'), keyTail('PS4 CUH-1215A'));
  assert.equal(keyTail('PlayStation 4 CUH-1215A'), keyTail('PlayStation 4 CUH1215A'));
});

test('F1: an explicit "model" label is still honored when it does not conflict', () => {
  assert.equal(info('PlayStation 4 model CUH1215A').exactModel, 'CUH1215A');
});

test('F1: service tags and controller codes beside a line name are never promoted', () => {
  for (const query of ['Dell OptiPlex 9020 7PJ2XK1', 'PlayStation 4 7PJ2XK1', 'PlayStation 4 controller CUH-ZCT2U']) {
    assert.notEqual(info(query).querySpecificity, 'exact-model', query);
  }
});

// ── Known SKU vocabulary ─────────────────────────────────────────────────────

test('matchKnownSku recognizes only explicit console SKUs', () => {
  assert.deepEqual(matchKnownSku('CUH-1215A'), { brand: 'Sony', familyId: 'playstation', modelLineId: 'playstation-4' });
  assert.equal(matchKnownSku('cuh1215a').modelLineId, 'playstation-4');
  assert.equal(matchKnownSku('CUH-7215B').modelLineId, 'playstation-4');
  assert.equal(matchKnownSku('CFI-1015A').modelLineId, 'playstation-5');
  for (const token of ['RTX-4070', 'I7-12700H', '500GB-BLACK', 'CUH-ZCT2U', 'CFI-ZCT1W', 'CUH-1215', 'CUH-12150A', 'SCPH-9000', 'CECH-2001A', '7PJ2XK1', '', null, undefined]) {
    assert.equal(matchKnownSku(token), null, String(token));
  }
});

// ── F2. Contradictions are preserved, never silently resolved ────────────────

const CONFLICTS = [
  // [query, kind, line id kept, pre-B4 age key tails]
  ['PlayStation 5 CUH-1215A', 'generation', 'playstation-5', '3515f72c1fd35b84096fe7fa', '2beda07697877a3635052718'],
  ['PS5 CUH-1215A', 'generation', 'playstation-5', '62f0945a4fc93264b10f2747', 'a1287a84ac80c3ff2ce2463e'],
  ['PlayStation 4 CFI-1015A', 'generation', 'playstation-4', '49432fb30e53efc5abde923d', '92609082243704052dd15fca'],
  ['PlayStation 5 model CUH1215A', 'generation', 'playstation-5', '9ac21128e221f8aa0774ca22', 'd722534199f012162b0ae093'],
];

for (const [query, kind, lineId, ungrounded, grounded] of CONFLICTS) {
  test(`F2: a generation conflict is preserved, not promoted: ${query}`, () => {
    const result = info(query);
    assert.equal(result.identifierConflict?.kind, kind);
    assert.equal(result.querySpecificity, 'model-line');
    assert.equal(result.modelLineId, lineId);
    assert.equal(result.exactModel, null);
    // The contradicting SKU stays visible: as an ambiguous identifier, or, for a
    // labeled model (which the label parser removes from the residual text), in
    // identifierConflict.identifier.
    assert.ok(matchKnownSku(result.identifierConflict.identifier), 'the recorded identifier is the contradicting SKU');
    assert.ok(result.ambiguousIdentifiers.length === 1 || /model/i.test(query), 'unlabeled SKU is ambiguous');
    assert.equal(keyTail(query), ungrounded, 'cache identity is unchanged from before B4');
    assert.equal(keyTail(query, true), grounded);
  });
}

test('F2: a conflicted query never shares cache identity with the exact SKU or with its sibling conflict', () => {
  // Every exact-SKU key a conflicted query could be mistaken for.
  const exactKeys = new Map([
    ['Sony CUH-1215A', keyTail('Sony CUH-1215A')],
    ['PlayStation 4 CUH-1215A', keyTail('PlayStation 4 CUH-1215A')],
    ['PlayStation CUH-1215A', keyTail('PlayStation CUH-1215A')],
    ['Sony CFI-1015A', keyTail('Sony CFI-1015A')],
    ['PlayStation 5 CFI-1015A', keyTail('PlayStation 5 CFI-1015A')],
  ]);
  assert.equal(exactKeys.size, 5);
  const conflictedQueries = [
    'PlayStation 5 CUH-1215A', 'PS5 CUH-1215A', 'PlayStation 5 model CUH1215A', 'PlayStation 4 CFI-1015A',
    'Xbox One CUH-1215A', 'Xbox CUH-1215A', 'Samsung CUH-1215A', 'Microsoft CUH-1215A',
    'Sony Bravia CUH-1215A', 'Sony Bravia XR CUH-1215A',
  ];
  const conflictedKeys = conflictedQueries.map((query) => keyTail(query));
  for (const [index, query] of conflictedQueries.entries()) {
    assert.ok(info(query).identifierConflict, `${query} is a conflict`);
    for (const [exactQuery, exactKey] of exactKeys) {
      assert.notEqual(conflictedKeys[index], exactKey, `${query} must not share the key of ${exactQuery}`);
    }
  }
  assert.equal(new Set(conflictedKeys).size, conflictedQueries.length, 'conflicted queries do not share a key with each other');
  assert.notEqual(keyTail('PlayStation 4 CFI-1015A'), keyTail('PlayStation 5 CFI-1015A'));
});

test('F2: a family conflict is preserved and the SKU is not the model', () => {
  // The SKU belongs to the PlayStation family but the query names Bravia.
  for (const query of ['Sony Bravia CUH-1215A', 'Sony Bravia XR CUH-1215A', 'Sony Bravia CFI-1015A']) {
    const result = info(query);
    assert.equal(result.identifierConflict?.kind, 'family', query);
    assert.equal(result.identifierConflict.skuFamilyId, 'playstation', query);
    assert.equal(result.identifierConflict.requestedFamilyId, 'bravia', query);
    assert.equal(result.identifierConflict.skuBrand, 'Sony', query);
    assert.equal(result.querySpecificity, 'product-family', query);
    assert.equal(result.familyId, 'bravia', query);
    assert.equal(result.exactModel, null, query);
    assert.equal(result.modelIdentity, '', query);
    assert.equal(result.modelCompleteness, 'none', query);
    assert.equal(result.ambiguousIdentifiers.length, 1, query);
    assert.ok(matchKnownSku(result.identifierConflict.identifier), query);
  }
  assert.notEqual(keyTail('Sony Bravia CUH-1215A'), keyTail('Sony Bravia'), 'the SKU still separates the cache entry');
  assert.notEqual(keyTail('Sony Bravia CUH-1215A'), keyTail('Sony CUH-1215A'));
  assert.notEqual(keyTail('Sony Bravia CUH-1215A'), keyTail('Sony Bravia CFI-1015A'));
});

test('F2: a family conflict does not accept the SKU owner\'s answer', () => {
  const ps4 = { brand: 'Sony', model: 'CUH-1215A', product: 'Sony PlayStation 4 CUH-1215A' };
  assert.equal(verdict('Sony CUH-1215A', ps4), true, 'control: the same answer fits the plain SKU');
  assert.equal(verdict('Sony Bravia CUH-1215A', ps4), false);
  assert.equal(verdict('Sony Bravia CFI-1015A', { ...ps4, model: 'CFI-1015A', product: 'Sony PlayStation 5 CFI-1015A' }), false);
});

test('F2: a family match that agrees with the SKU is not a conflict', () => {
  for (const query of ['PlayStation CUH-1215A', 'Sony PlayStation CFI-1015A']) {
    assert.equal(info(query).identifierConflict, null, query);
    assert.equal(info(query).exactModel?.length > 0, true, query);
  }
});

test('F2: a PS5 request containing a PS4 SKU does not accept a PS4 answer', () => {
  const sony = (model, product) => ({ brand: 'Sony', model, product });
  for (const request of ['PlayStation 5 CUH-1215A', 'PS5 CUH-1215A']) {
    assert.equal(verdict(request, sony('CUH-1215A', 'Sony PlayStation 4 CUH-1215A')), false, request);
    assert.equal(verdict(request, sony('PlayStation 4', 'Sony PlayStation 4')), false, request);
  }
  assert.equal(verdict('PlayStation 4 CFI-1015A', sony('CFI-1015A', 'Sony PlayStation 5 CFI-1015A')), false);
  assert.equal(verdict('PlayStation 4 CFI-1015A', sony('CFI-1015A', 'Sony PlayStation 4 CFI-1015A')), false);
});

test('F2: agreeing SKU and line are accepted, and the exact SKU guard is unchanged', () => {
  const sony = (model, product) => ({ brand: 'Sony', model, product });
  assert.equal(verdict('PlayStation 5 CFI-1015A', sony('CFI-1015A', 'Sony PlayStation 5 CFI-1015A')), true);
  assert.equal(verdict('PlayStation 4 CUH-1215A', sony('CUH-1215A', 'Sony PlayStation 4 CUH-1215A')), true);
  assert.equal(verdict('PlayStation 4 CUH-1215A', sony('CUH-2215B', 'Sony PlayStation 4 CUH-2215B')), false);
});

test('F2: a manufacturer or family conflict is preserved and the SKU is not the model', () => {
  const cases = [
    // [query, kind, specificity, family id, line id]
    ['Xbox One CUH-1215A', 'manufacturer', 'model-line', 'xbox', 'xbox-one'],
    ['Xbox CUH-1215A', 'manufacturer', 'product-family', 'xbox', null],
    ['Samsung CUH-1215A', 'manufacturer', 'brand-only', null, null],
    ['Microsoft CUH-1215A', 'manufacturer', 'brand-only', null, null],
  ];
  for (const [query, kind, specificity, familyId, lineId] of cases) {
    const result = info(query);
    assert.equal(result.identifierConflict?.kind, kind, query);
    assert.equal(result.identifierConflict?.skuBrand, 'Sony', query);
    assert.equal(result.querySpecificity, specificity, query);
    assert.equal(result.familyId, familyId, query);
    assert.equal(result.modelLineId, lineId, query);
    assert.equal(result.exactModel, null, query);
    assert.deepEqual(result.ambiguousIdentifiers, ['CUH1215A'], query);
    assert.notEqual(ageKey(query), ageKey('Sony CUH-1215A'), query);
  }
});

test('F2: a manufacturer conflict does not accept the SKU owner\'s answer as a verified match', () => {
  const sony = { brand: 'Sony', model: 'CUH-1215A', product: 'Sony PlayStation 4 CUH-1215A' };
  assert.equal(verdict('Xbox One CUH-1215A', sony), false);
  assert.equal(verdict('Samsung CUH-1215A', sony), false);
});

test('F2: queries without a contradiction carry no conflict', () => {
  for (const query of ['Sony CUH-1215A', 'PlayStation CUH-1215A', 'PlayStation 4 CUH-1215A', 'Xbox One', 'PlayStation 4', 'Samsung SM-X200', 'GE GFW850SPN0DG']) {
    assert.equal(info(query).identifierConflict, null, query);
  }
});

test('F2 (documented gap): contradictions outside the SKU vocabulary are not detected', () => {
  // SCPH/CECH and other brands' codes are not in knownSkus, so a contradiction
  // involving them keeps the pre-B4 behavior: no conflict flag, and the line
  // name wins instead of the code being promoted.
  for (const query of ['PlayStation 4 SCPH-9000', 'PlayStation 4 CECH-2001A', 'PlayStation 5 SCPH-9000']) {
    const result = info(query);
    assert.equal(result.identifierConflict, null, query);
    assert.equal(result.querySpecificity, 'model-line', query);
    assert.equal(result.exactModel, null, query);
  }
});

// ── F3. Xbox consoles versus accessories, and LKQ eligibility ────────────────

const XBOX_ACCESSORIES = [
  'Xbox Wireless Controller', 'Xbox 360 controller', 'Xbox Elite Series 2 Controller',
  'Xbox One headset', 'Xbox Kinect', 'Xbox One charging dock', 'Xbox Series X battery pack',
  'Microsoft Xbox Adaptive Controller',
];

for (const query of XBOX_ACCESSORIES) {
  test(`F3: an accessory is not classified as a console: ${query}`, () => {
    const result = info(query);
    assert.equal(result.brand, 'Microsoft');
    assert.equal(result.familyId, null);
    assert.equal(result.productFamily, null);
    assert.equal(result.modelLineId, null);
    assert.equal(result.productType, null);
    assert.equal(result.querySpecificity, 'brand-only');
    assert.equal(result.lkqGroundedEligible, false);
  });
}

for (const [query, lineId] of [
  ['Xbox One', 'xbox-one'], ['Xbox One X', 'xbox-one'], ['Xbox One S', 'xbox-one'],
  ['Xbox Series X', 'xbox-series-x'], ['Xbox Series S', 'xbox-series-s'], ['Xbox 360', 'xbox-360'],
  ['Microsoft Xbox Series X console', 'xbox-series-x'],
]) {
  test(`F3: a console is still recognized: ${query}`, () => {
    const result = info(query);
    assert.equal(result.brand, 'Microsoft');
    assert.equal(result.familyId, 'xbox');
    assert.equal(result.modelLineId, lineId);
    assert.equal(result.productType, 'game console');
    assert.equal(result.querySpecificity, 'model-line');
  });
}

test('F3: Xbox One variants and consoles keep distinct cache identity', () => {
  const keys = ['Xbox One', 'Xbox One S', 'Xbox One X', 'Xbox Series X', 'Xbox Series S', 'Xbox 360'].map((query) => keyTail(query));
  assert.equal(new Set(keys).size, keys.length);
  assert.notEqual(keyTail('Xbox One'), keyTail('Xbox Wireless Controller'));
});

test('F3: Xbox recognition does not expand paid LKQ grounded eligibility', () => {
  // Every one of these was ineligible before the Xbox seed existed.
  for (const query of [
    'Xbox One', 'Xbox One X', 'Xbox Series X', 'Xbox Series S', 'Xbox 360', 'Microsoft Xbox One 1540',
    'Xbox model 1 console', ...XBOX_ACCESSORIES,
  ]) {
    assert.notEqual(info(query).lkqGroundedEligible, true, query);
  }
  const xbox = GENERAL_FAMILY_SEEDS.find((seed) => seed.familyId === 'xbox');
  assert.equal(xbox.lkqGroundedAllowed, false);
});

test('F3: the opt-out affects only Xbox: other recognized lines keep their pre-B4 eligibility', () => {
  for (const query of ['PlayStation 4', 'Sony PS5', 'Acer Nitro 5 AN515-58', 'Dell XPS 15 9530', 'Dell OptiPlex 9020']) {
    assert.equal(info(query).lkqGroundedEligible, true, query);
  }
  for (const query of ['Sony CUH-1215A', 'PlayStation 4 CUH-1215A', 'Samsung SM-X200', 'LG OLED55C3PUA']) {
    assert.equal(info(query).lkqGroundedEligible, true, query);
  }
  assert.notEqual(GENERAL_FAMILY_SEEDS.find((seed) => seed.familyId === 'playstation').lkqGroundedAllowed, false);
});

test('F3: an explicitly labeled Xbox model keeps its exact-model tier and pre-B4 eligibility', () => {
  const result = info('Xbox One model RRT-00001');
  assert.equal(result.querySpecificity, 'exact-model');
  assert.equal(result.lkqGroundedEligible, true);
});

test('F3: route mode and age research eligibility are unchanged for Xbox queries', () => {
  for (const query of ['Xbox One', 'Xbox Series X', 'Xbox Wireless Controller', 'Microsoft Xbox']) {
    const result = info(query);
    assert.equal(routeMode(result), 'precision_research', query);
    assert.equal(result.researchEligible, true, query);
    assert.equal(result.groundedEligible, true, query);
  }
});

// ── Final corrections: accessories versus bundled consoles ───────────────────

// Standalone accessories: the deny list sees the accessory noun before any
// "included with" clause, so none of these is a console.
const STANDALONE_ACCESSORIES = [
  'Xbox Wireless Controller', 'Xbox Elite Series 2 controller', 'Xbox Elite Series 2',
  'Xbox One Play and Charge Kit', 'Xbox One Play & Charge Kit', 'Xbox Series X power supply',
  'Xbox One power brick', 'Xbox 360 hard drive', 'Xbox Series X Storage Expansion Card',
  'Xbox Series X vertical stand', 'Xbox Game Pass Ultimate', 'Xbox Live Gold',
  'Xbox One controller with charging dock', 'Xbox Wireless Controller with charge kit',
  'Xbox controller with Xbox One console', 'Xbox One headset with microphone',
];

for (const query of STANDALONE_ACCESSORIES) {
  test(`Xbox accessory is not a console: ${query}`, () => {
    const result = info(query);
    assert.equal(result.brand, 'Microsoft');
    assert.equal(result.familyId, null);
    assert.equal(result.modelLineId, null);
    assert.equal(result.productType, null);
    assert.equal(result.querySpecificity, 'brand-only');
    assert.equal(result.lkqGroundedEligible, false);
  });
}

// Consoles that merely mention an accessory that comes with them.
const BUNDLED_CONSOLES = [
  ['Xbox One with controller', 'xbox-one'],
  ['Xbox Series X bundle with controller', 'xbox-series-x'],
  ['Xbox One X with charging dock', 'xbox-one'],
  ['Xbox Series X includes controller', 'xbox-series-x'],
  ['Xbox One S 1TB console with wireless controller', 'xbox-one'],
  ['Xbox 360 E 250GB with Kinect', 'xbox-360'],
  ['Xbox Series S w/ headset', 'xbox-series-s'],
  ['Xbox One including headset', 'xbox-one'],
  ['Xbox Series X plus controller', 'xbox-series-x'],
  ['Xbox 360 with 250GB hard drive', 'xbox-360'],
];

for (const [query, lineId] of BUNDLED_CONSOLES) {
  test(`Xbox console mentioning a bundled accessory stays a console: ${query}`, () => {
    const result = info(query);
    assert.equal(result.brand, 'Microsoft');
    assert.equal(result.familyId, 'xbox');
    assert.equal(result.modelLineId, lineId);
    assert.equal(result.productType, 'game console');
    assert.equal(result.querySpecificity, 'model-line');
    // Recognition is not approval to spend: paid LKQ stays off.
    assert.equal(result.lkqGroundedEligible, false);
    assert.equal(result.deterministicReplacementAllowed, false);
  });
}

test('Xbox bundled consoles keep generation distinctions and differ from accessories', () => {
  const keys = [
    'Xbox One with controller', 'Xbox Series X with controller', 'Xbox Series S with controller', 'Xbox 360 with controller',
  ].map((query) => keyTail(query));
  assert.equal(new Set(keys).size, keys.length, 'each generation keeps its own cache identity');
  assert.notEqual(keyTail('Xbox One with controller'), keyTail('Xbox Wireless Controller'));
  assert.equal(info('Xbox One with controller').modelLineId, 'xbox-one');
  assert.equal(info('Xbox Series X with controller').modelLineId, 'xbox-series-x');
  assert.equal(info('Xbox Series S with controller').modelLineId, 'xbox-series-s');
});

test('Xbox: "and" is not an included-accessory marker (documented limitation)', () => {
  // Splitting on "and" would classify "Play and Charge Kit" as a console. The
  // price is that "Xbox One console and controller" stays unrecognized (brand-only,
  // the pre-B4 behavior); "with" / "includes" phrasing is the supported form.
  assert.equal(info('Xbox One console and controller').familyId, null);
  assert.equal(info('Xbox One Play and Charge Kit').familyId, null);
  assert.equal(info('Xbox One with controller and headset').modelLineId, 'xbox-one');
});

test('Xbox: remote play is a feature of the console, not a media remote', () => {
  assert.equal(info('Xbox Series X remote play').modelLineId, 'xbox-series-x');
  assert.equal(info('Xbox One media remote').familyId, null);
});

// ── Final corrections: no empty static replacement card for Xbox ─────────────

test('Xbox below the exact-model tier gets no static replacement card; other lines still do', () => {
  for (const query of ['Xbox One', 'Xbox Series X', 'Xbox 360', 'Xbox', 'Xbox One with controller']) {
    const result = info(query);
    assert.equal(result.deterministicReplacementAllowed, false, query);
    assert.equal(buildDeterministicReplacementResult(result), null, query);
  }
  for (const query of [
    'PlayStation 4', 'Sony PS5', 'Dell XPS 15 9530', 'Acer Nitro 5 AN515-58', 'Dell OptiPlex 9020',
    'Sony CUH-1215A', 'PlayStation 4 CUH-1215A', 'Samsung SM-X200', 'LG OLED55C3PUA',
  ]) {
    const result = info(query);
    assert.notEqual(result.deterministicReplacementAllowed, false, query);
    assert.notEqual(buildDeterministicReplacementResult(result), null, query);
  }
  assert.equal(GENERAL_FAMILY_SEEDS.find((seed) => seed.familyId === 'xbox').deterministicReplacementAllowed, false);
  assert.equal(GENERAL_FAMILY_SEEDS.filter((seed) => seed.deterministicReplacementAllowed === false).length, 1);
});

test('Xbox: an explicitly labeled model keeps its exact-model card', () => {
  const result = info('Xbox One model RRT-00001');
  assert.equal(result.querySpecificity, 'exact-model');
  assert.notEqual(buildDeterministicReplacementResult(result), null);
});

function lkqRequest(query) {
  return { method: 'POST', body: { query }, headers: { 'x-forwarded-for': '127.0.0.1' }, socket: {} };
}
function lkqResponse() {
  return { statusCode: 0, payload: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; return this; }, setHeader() {} };
}

async function failingLkqLookup(query) {
  const calls = { grounded: 0, closedBook: 0 };
  const fail = async () => {
    const error = new Error('provider unavailable');
    error.code = 'PROVIDER_TIMEOUT';
    throw error;
  };
  const handler = createLkqLookupHandler({
    rateLimiter: allowingRateLimiter,
    groundedEnabled: true,
    redisFactory: () => ({ get: async () => null, set: async () => {}, eval: async () => [1, 1, 1], incrby: async (_key, amount) => amount, expire: async () => 1 }),
    groundedProviderLookup: async () => { calls.grounded += 1; return fail(); },
    providerLookup: async () => { calls.closedBook += 1; return fail(); },
  });
  const response = lkqResponse();
  await handler(lkqRequest(query), response);
  return { response, calls };
}

test('Xbox provider failure returns the generic unavailable result, not an empty static card', async () => {
  for (const query of ['Xbox One', 'Xbox Series X', 'Xbox', 'Xbox One with controller']) {
    const { response, calls } = await failingLkqLookup(query);
    const payload = response.payload;
    assert.equal(response.statusCode, 200, query);
    assert.equal(payload.evidenceSource, 'none', query);
    assert.equal(payload.itemSummary.name, query, 'named by the query text, as before the family was recognized');
    assert.equal(payload.successorStatus.explanation, 'Replacement options are temporarily unavailable. The age result remains available.', query);
    assert.equal(payload.unknownOriginalSpecs.length, 0, query);
    assert.equal(payload.replacementCandidates?.length ?? 0, 0, query);
    // Provider-call behavior is unchanged: Xbox is not grounded-eligible, so
    // exactly one closed-book attempt and no grounded (paid search) attempt.
    assert.deepEqual(calls, { grounded: 0, closedBook: 1 }, query);
  }
});

test('other lines keep their static card and grounded attempt on provider failure', async () => {
  for (const query of ['PlayStation 4', 'Dell XPS 15 9530']) {
    const { response, calls } = await failingLkqLookup(query);
    assert.equal(response.payload.evidenceSource, 'static', query);
    assert.equal(response.payload.unknownOriginalSpecs.length, 6, query);
    assert.deepEqual(calls, { grounded: 1, closedBook: 0 }, query);
  }
});

// ── Final corrections: labeled specifications and SKU/specification joins ────

// Pre-B4 age cache-key tails: [ungrounded, grounded]. A label states intent, but
// it does not turn a CPU, GPU or capacity descriptor into the model number.
const LABELED_SPECS = [
  ['PlayStation 4 model 500GB-Black', 'playstation-4', '4629d2ac50520ebb4d90e905', 'e02a8c12a3bddc0382002a45'],
  ['PlayStation 4 model: 1TB', 'playstation-4', 'a9ae5855453c15b70d94cbdc', '3ed55a54173570aafe3940c5'],
  ['Dell XPS 15 9530 model i7-12700H', 'xps-15-9530', 'b0bcae0100677703e42defd6', '777ecba40dbae6a64daf93b3'],
  ['Dell XPS 15 9530 model RTX-4070', 'xps-15-9530', 'abeb9643482534cb038065b6', 'd5f28b7c23bdf8868c96c7ed'],
  ['Acer Nitro 5 AN515-58 model i5-12500H', 'an515', 'fa853b4090802b5c0b79100c', '1a107e3ba5d3c2e84b6fced0'],
];

for (const [query, lineId, ungrounded, grounded] of LABELED_SPECS) {
  test(`a labeled spec does not replace the identity: ${query}`, () => {
    const result = info(query);
    assert.equal(result.querySpecificity, 'model-line');
    assert.equal(result.modelLineId, lineId);
    assert.equal(result.exactModel, null);
    assert.equal(result.identifierConflict, null);
    assert.equal(keyTail(query), ungrounded, 'cache identity is unchanged from before B4');
    assert.equal(keyTail(query, true), grounded);
  });
}

test('a labeled model number is still promoted over a line name', () => {
  assert.equal(info('PlayStation 4 model CUH-1215A').exactModel, 'CUH1215A');
  assert.equal(info('Acer Nitro 5 model AN515-58-57Y8').querySpecificity, 'exact-model');
  assert.equal(info('Dell XPS 15 9530 model 9530-ABC12').querySpecificity, 'exact-model');
});

test('a resolution beside a recognized SKU is never joined into its identifier', () => {
  // Before the guard, "CUH-1215A" + "1080p" became "CUH1215A1080P", an identifier
  // no manufacturer issued; beside a console line it also hid the SKU entirely.
  for (const query of ['Sony CUH-1215A 1080p', 'PlayStation 4 CUH-1215A 1080p', '1080p Sony CUH-1215A', 'Sony 1080p CFI-1015A']) {
    const result = info(query);
    assert.doesNotMatch(result.modelIdentity, /1080P/, `${query}: no resolution inside the identity`);
    assert.equal(result.querySpecificity, 'exact-model', query);
    assert.match(result.exactModel, /^C(?:UH|FI)\d{4}[A-Z]$/, query);
    assert.deepEqual(result.ambiguousIdentifiers, ['1080P'], query);
  }
  assert.equal(info('Sony CUH-1215A 1080p').exactModel, info('Sony CUH-1215A').exactModel);
});

test('a resolution beside a recognized SKU keeps the exact SKU for the answer guard', () => {
  const sony = { brand: 'Sony', model: 'CUH-1215A', product: 'Sony PlayStation 4 CUH-1215A' };
  assert.equal(verdict('Sony CUH-1215A 1080p', sony), true);
  assert.equal(verdict('Sony CUH-1215A 1080p', { ...sony, model: 'CUH-2215B', product: 'Sony PlayStation 4 CUH-2215B' }), false);
});
