import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeCachedReplacementResult,
  normalizeReplacementResult,
  SmartLookupReplacementValidationError,
} from '../../lib/smart-lookup/replacement-schema.js';

const lgQueryInfo = { brand: 'LG', modelIdentity: 'WM3900HWA', modelCompleteness: 'exact', genericCategory: 'washer', specificityLevel: 'specific' };

const manufacturerSource = { title: 'lg.com', domain: 'lg.com', uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/a' };
const retailerSource = { title: 'bestbuy.com', domain: 'bestbuy.com', uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/b' };

function baseRaw(overrides = {}) {
  return {
    itemSummary: { brand: 'LG', model: 'WM3900HWA', category: 'washer', name: 'LG WM3900HWA', availability: 'Discontinued' },
    specLabels: ['Capacity', 'Type', 'Fuel', 'Voltage', 'Install'],
    originalSpecs: { Capacity: '4.5 cu ft', Type: 'Front Load' },
    replacementRelationship: 'direct-successor',
    replacementRationale: 'LG lists WM4000HWA as the successor on lg.com',
    replacement: { name: 'LG WM4000HWA', brand: 'LG', model: 'WM4000HWA', category: 'washer' },
    replacementSpecs: { Capacity: '5.0 cu ft', Type: 'Front Load' },
    materialDifferences: ['Larger capacity'],
    compatibilityStatus: 'likely-compatible',
    compatibilityWarnings: [],
    priceObservations: [],
    ...overrides,
  };
}

function normalize(raw, optionOverrides = {}) {
  return normalizeReplacementResult(raw, {
    queryInfo: lgQueryInfo,
    source: 'gemini',
    originSource: 'gemini',
    evidenceSource: 'grounded',
    sources: [manufacturerSource],
    providerAttempted: true,
    ...optionOverrides,
  });
}

// --- Relationship classification -------------------------------------------------

test('valid manufacturer-backed direct successor keeps direct-successor', () => {
  const out = normalize(baseRaw());
  assert.equal(out.replacementRelationship, 'direct-successor');
  assert.equal(out.evidenceSource, 'manufacturer-grounded');
  assert.equal(out.replacement.model, 'WM4000HWA');
});

test('direct-successor claim without manufacturer evidence is downgraded to same-series-successor', () => {
  const out = normalize(baseRaw(), { sources: [retailerSource] });
  assert.equal(out.replacementRelationship, 'same-series-successor');
  assert.equal(out.evidenceSource, 'retailer-grounded');
});

test('same-series-successor relationship passes through unchanged', () => {
  const out = normalize(baseRaw({ replacementRelationship: 'same-series-successor' }));
  assert.equal(out.replacementRelationship, 'same-series-successor');
});

test('functional-equivalent relationship passes through unchanged', () => {
  const out = normalize(baseRaw({ replacementRelationship: 'functional-equivalent' }));
  assert.equal(out.replacementRelationship, 'functional-equivalent');
});

test('similar-alternative relationship passes through unchanged', () => {
  const out = normalize(baseRaw({ replacementRelationship: 'similar-alternative' }));
  assert.equal(out.replacementRelationship, 'similar-alternative');
});

test('none-found relationship produces a null replacement and preserves the rationale', () => {
  const out = normalize(baseRaw({
    replacementRelationship: 'none-found',
    replacement: { name: null, brand: null, model: null, category: null },
    replacementRationale: 'No current equivalent model was found in any searched source.',
  }));
  assert.equal(out.replacementRelationship, 'none-found');
  assert.equal(out.replacement, null);
  assert.match(out.replacementRationale, /No current equivalent/);
});

test('an unrecognized relationship value defaults to none-found', () => {
  const out = normalize(baseRaw({ replacementRelationship: 'best friend forever' }));
  assert.equal(out.replacementRelationship, 'none-found');
});

// --- Model / source integrity -----------------------------------------------------

test('exact original model suffix is preserved regardless of provider casing', () => {
  const out = normalize(baseRaw({ itemSummary: { ...baseRaw().itemSummary, model: 'wm3900hwa' } }));
  assert.equal(out.itemSummary.model, 'WM3900HWA');
});

test('a partial or malformed replacement model token is dropped and the relationship is downgraded', () => {
  const out = normalize(baseRaw({ replacement: { name: 'LG replacement', brand: 'LG', model: 'WM4', category: 'washer' } }));
  assert.equal(out.replacement.model, null);
  assert.equal(out.replacementRelationship, 'functional-equivalent');
});

test('a same-series-successor with a malformed replacement model is also downgraded to functional-equivalent', () => {
  const out = normalize(baseRaw({
    replacementRelationship: 'same-series-successor',
    replacement: { name: 'LG replacement', brand: 'LG', model: 'XY', category: 'washer' },
  }));
  assert.equal(out.replacementRelationship, 'functional-equivalent');
  assert.equal(out.replacement.model, null);
});

test('a cross-category replacement is rejected outright', () => {
  assert.throws(
    () => normalize(baseRaw({ replacement: { name: 'LG dryer', brand: 'LG', model: 'DLE4000W', category: 'dryer' } })),
    (error) => error instanceof SmartLookupReplacementValidationError && error.code === 'REPLACEMENT_CATEGORY_MISMATCH'
  );
});

test('a sourceless grounded response is downgraded to gemini-ungrounded and carries no price data', () => {
  const out = normalize(baseRaw({ priceObservations: [{ seller: 'Best Buy', price: 899.99, condition: 'new' }] }), { sources: [] });
  assert.equal(out.evidenceSource, 'gemini-ungrounded');
  assert.deepEqual(out.sources, []);
  assert.equal(out.retrievedAt, null);
  assert.deepEqual(out.priceObservations, []);
  assert.equal(out.replacementCostRange, null);
});

test('model-generated fake URLs in raw JSON are ignored; sources come only from grounding metadata', () => {
  const out = normalize(baseRaw({
    sources: [{ title: 'fabricated.example.com', domain: 'fabricated.example.com', uri: 'https://fabricated.example.com' }],
  }));
  // raw.sources is never trusted directly for a fresh grounded attempt --
  // only options.sources (the server-derived grounding metadata) is.
  assert.equal(out.sources.length, 1);
  assert.equal(out.sources[0].domain, 'lg.com');
});

test('sources are derived only from grounding metadata, never from provider JSON, on both fresh and cached reads', () => {
  const fresh = normalize(baseRaw());
  const cachedBlob = JSON.parse(JSON.stringify(fresh));
  const readBack = normalizeCachedReplacementResult(cachedBlob, { queryInfo: lgQueryInfo });
  assert.deepEqual(readBack.sources, fresh.sources);
  assert.equal(readBack.evidenceSource, fresh.evidenceSource);
});

// --- Compatibility -----------------------------------------------------------------

test('matching configuration renders likely-compatible with no warnings', () => {
  const out = normalize(baseRaw());
  assert.equal(out.compatibilityStatus, 'likely-compatible');
  assert.deepEqual(out.compatibilityWarnings, []);
});

test('a capacity difference is reported as compatible-with-caveats with a warning', () => {
  const out = normalize(baseRaw({
    compatibilityStatus: 'compatible-with-caveats',
    compatibilityWarnings: ['Capacity increased from 4.5 cu ft to 5.0 cu ft'],
  }));
  assert.equal(out.compatibilityStatus, 'compatible-with-caveats');
  assert.equal(out.compatibilityWarnings.length, 1);
});

test('a voltage/fuel mismatch is reported as not-directly-compatible', () => {
  const out = normalize(baseRaw({
    compatibilityStatus: 'not-directly-compatible',
    compatibilityWarnings: ['Original is gas-fueled; replacement is electric only'],
  }));
  assert.equal(out.compatibilityStatus, 'not-directly-compatible');
});

test('an installation-type mismatch is reported as not-directly-compatible', () => {
  const out = normalize(baseRaw({
    compatibilityStatus: 'not-directly-compatible',
    compatibilityWarnings: ['Original is a built-in unit; replacement is freestanding only'],
  }));
  assert.equal(out.compatibilityStatus, 'not-directly-compatible');
});

test('an unknown critical specification does not fabricate a value and stays unknown', () => {
  const out = normalize(baseRaw({ compatibilityStatus: 'unknown', replacementSpecs: {} }));
  assert.equal(out.compatibilityStatus, 'unknown');
  assert.equal(out.replacementSpecs.Capacity, 'Unknown');
});

test('an unrecognized compatibility value defaults to unknown', () => {
  const out = normalize(baseRaw({ compatibilityStatus: 'probably fine' }));
  assert.equal(out.compatibilityStatus, 'unknown');
});

// --- Pricing -------------------------------------------------------------------------

test('two qualifying new-condition retailer prices produce a range', () => {
  const out = normalize(baseRaw({
    priceObservations: [
      { seller: 'Best Buy', price: 899.99, currency: 'USD', priceType: 'regular', condition: 'new', stockStatus: 'in-stock', observedAt: '2026-07-01' },
      { seller: 'Home Depot', price: 949.99, currency: 'USD', priceType: 'sale', condition: 'new', stockStatus: 'in-stock', observedAt: '2026-07-05' },
    ],
  }));
  assert.equal(out.priceObservations.length, 2);
  assert.deepEqual(out.replacementCostRange, { low: 899.99, high: 949.99, currency: 'USD', basis: 'multiple-observations' });
});

test('one qualifying price produces an observation but no range', () => {
  const out = normalize(baseRaw({
    priceObservations: [{ seller: 'Best Buy', price: 899.99, currency: 'USD', condition: 'new' }],
  }));
  assert.equal(out.priceObservations.length, 1);
  assert.equal(out.replacementCostRange, null);
});

test('a manufacturer-labeled MSRP produces a labeled range even alone', () => {
  const out = normalize(baseRaw({
    priceObservations: [{ seller: 'LG Official MSRP', price: 999, currency: 'USD', condition: 'new' }],
  }));
  assert.deepEqual(out.replacementCostRange, { low: 999, high: 999, currency: 'USD', basis: 'manufacturer-listed' });
});

test('sale and regular prices are distinguished by priceType', () => {
  const out = normalize(baseRaw({
    priceObservations: [
      { seller: 'Best Buy', price: 799.99, currency: 'USD', priceType: 'sale', condition: 'new' },
      { seller: 'Home Depot', price: 899.99, currency: 'USD', priceType: 'regular', condition: 'new' },
    ],
  }));
  assert.equal(out.priceObservations[0].priceType, 'sale');
  assert.equal(out.priceObservations[1].priceType, 'regular');
});

test('used, refurbished, and open-box observations do not count toward the range', () => {
  const out = normalize(baseRaw({
    priceObservations: [
      { seller: 'Best Buy', price: 899.99, currency: 'USD', condition: 'new' },
      { seller: 'eBay Seller', price: 500, currency: 'USD', condition: 'used' },
      { seller: 'Warehouse Deals', price: 650, currency: 'USD', condition: 'refurbished' },
      { seller: 'Outlet Store', price: 700, currency: 'USD', condition: 'open-box' },
    ],
  }));
  assert.equal(out.priceObservations.length, 4);
  // Only one new-condition observation exists, so still no range.
  assert.equal(out.replacementCostRange, null);
});

test('accessory and part listings are excluded entirely', () => {
  const out = normalize(baseRaw({
    priceObservations: [
      { seller: 'Best Buy', price: 899.99, currency: 'USD', condition: 'new' },
      { seller: 'Amazon replacement part', price: 45, currency: 'USD', condition: 'new' },
      { seller: 'Extended protection warranty plan', price: 120, currency: 'USD', condition: 'new' },
    ],
  }));
  assert.equal(out.priceObservations.length, 1);
  assert.equal(out.priceObservations[0].seller, 'Best Buy');
});

test('an out-of-stock listing is kept and its status is preserved', () => {
  const out = normalize(baseRaw({
    priceObservations: [{ seller: 'Best Buy', price: 899.99, currency: 'USD', condition: 'new', stockStatus: 'out-of-stock' }],
  }));
  assert.equal(out.priceObservations[0].stockStatus, 'out-of-stock');
});

test('mixed currencies never merge into one false range', () => {
  const out = normalize(baseRaw({
    priceObservations: [
      { seller: 'Best Buy', price: 899.99, currency: 'USD', condition: 'new' },
      { seller: 'Canada Appliance Co', price: 1199.99, currency: 'CAD', condition: 'new' },
    ],
  }));
  assert.equal(out.priceObservations.length, 2);
  // Only one USD observation qualifies for a range once currencies split.
  assert.equal(out.replacementCostRange, null);
});

test('price observation dates are preserved as normalized ISO strings', () => {
  const out = normalize(baseRaw({
    priceObservations: [{ seller: 'Best Buy', price: 899.99, currency: 'USD', condition: 'new', observedAt: '2026-07-15' }],
  }));
  assert.match(out.priceObservations[0].observedAt, /^2026-07-15T/);
});

test('ambiguous price evidence missing a seller or price is rejected', () => {
  const out = normalize(baseRaw({
    priceObservations: [
      { seller: '', price: 899.99, currency: 'USD', condition: 'new' },
      { seller: 'Best Buy', price: null, currency: 'USD', condition: 'new' },
      { seller: 'Best Buy', price: 899.99, currency: 'USD', condition: 'new' },
    ],
  }));
  assert.equal(out.priceObservations.length, 1);
});

test('price data is never trusted for an ungrounded (non-sentinel) result even if raw JSON includes it', () => {
  const out = normalizeReplacementResult(baseRaw({
    priceObservations: [{ seller: 'Best Buy', price: 899.99, currency: 'USD', condition: 'new' }],
  }), {
    queryInfo: lgQueryInfo,
    source: 'gemini',
    originSource: 'gemini',
    evidenceSource: 'gemini-ungrounded',
    providerAttempted: true,
  });
  assert.deepEqual(out.priceObservations, []);
  assert.equal(out.replacementCostRange, null);
});
