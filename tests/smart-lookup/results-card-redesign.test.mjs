import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadSmartLookupController() {
  const ctx = {
    console,
    setTimeout: (fn) => { fn(); return 0; },
    clearTimeout: () => {},
    fetch: async () => ({ ok: false, status: 0, json: async () => ({}) }),
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
    document: {
      readyState: 'complete',
      addEventListener: () => {},
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
      createElement: () => ({
        value: '', textContent: '', innerHTML: '',
        classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
        appendChild: () => {}, addEventListener: () => {}, removeEventListener: () => {},
        setAttribute: () => {}, getAttribute: () => null, querySelector: () => null,
        querySelectorAll: () => [], closest: () => null, focus: () => {}, select: () => {},
      }),
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);

  const source = fs.readFileSync('src/browser/smart-lookup-controller.js', 'utf8').replace(/\r\n/g, '\n');
  const openMarker = "(function () {\n  'use strict';\n";
  const closeMarker = '\n}());\n';
  if (!source.startsWith(openMarker) || !source.endsWith(closeMarker)) {
    throw new Error('smart-lookup-controller.js IIFE wrapper markers changed; update the test loader.');
  }
  const body = source.slice(openMarker.length, source.length - closeMarker.length);
  const wrapped = `(function () {\n${body}\n
    globalThis.__smartLookupTestApi = {
      renderAge, escapeHtml, specificityLabel, confidenceLabel, estimatedTimingText,
      heroEstimateTypeLabel, sourceQualifier,
    };
  }());`;
  vm.runInContext(wrapped, ctx);
  return ctx.__smartLookupTestApi;
}

const api = loadSmartLookupController();

function exactUnitResult() {
  return {
    brand: 'Whirlpool',
    exactModel: 'WFW5620HW',
    category: 'washer',
    individualManufactureYear: 2019,
    yearContext: {
      value: 2019, type: 'manufacture-year', label: 'Manufacture year',
      confidence: 'high', isExactUnitDate: true,
    },
    estimateBasis: 'serial-decode',
    identityConfidence: 'high',
    timingConfidence: 'high',
    notes: 'Serial evidence establishes the individual unit manufacture year.',
    evidence: [{ detail: 'Decoded serial manufacture year.' }],
    source: 'decoder-verified',
    evidenceSource: 'user-verified',
  };
}

function modelGenerationResult() {
  return {
    brand: 'VIZIO',
    exactModel: 'M321i-A2',
    series: 'M-Series',
    category: 'television',
    productionRange: { start: 2013, end: 2014 },
    estimatedRange: { start: 2013, end: 2014 },
    bestEstimateYear: 2013,
    estimatedYearType: 'model-production',
    estimateBasis: 'verified-model-generation',
    identityConfidence: 'high',
    timingConfidence: 'medium',
    yearContext: {
      type: 'production-range', startYear: 2013, endYear: 2014,
      label: 'Estimated production period', confidence: 'medium', isExactUnitDate: false,
    },
    notes: 'Model-generation evidence supports a 2013-2014 production window.',
    evidence: [{ detail: 'Verified VIZIO model-generation record.' }],
    source: 'local-db',
    evidenceSource: 'local-db',
  };
}

function yearRangeResult() {
  return {
    brand: 'GE',
    exactModel: 'GFW850SPNDG',
    category: 'washer',
    productionRange: { start: 2019, end: 2021 },
    yearContext: {
      type: 'production-range', startYear: 2019, endYear: 2021,
      label: 'Production range', isExactUnitDate: false,
    },
    querySpecificity: 'exact-model',
    notes: 'Exact model production window.',
  };
}

function openEndedResult() {
  return {
    brand: 'Sony',
    productFamily: 'Bravia',
    category: 'television',
    rangeLabel: '2020+',
    yearContext: { value: '2020+', type: 'open-range', label: 'Model era', isExactUnitDate: false },
    precisionLevel: 'family-range',
    querySpecificity: 'product-family',
    notes: 'Open-ended availability from 2020 onward.',
  };
}

function productFamilyResult() {
  return {
    brand: 'Lenovo',
    productFamily: 'ThinkSystem ST50',
    category: 'server',
    yearContext: {
      startYear: 2018, endYear: 2023, type: 'production-range',
      label: 'Model-line production period', isExactUnitDate: false,
    },
    precisionLevel: 'model-line-range',
    querySpecificity: 'model-line',
    notes: 'ThinkSystem ST50 covers a multi-year model line.',
    refinementSuggestion: 'Add the exact machine type code for a narrower estimate.',
  };
}

function timeoutFallbackResult() {
  return {
    brand: 'Lenovo',
    productFamily: 'ThinkSystem ST50',
    category: 'server',
    yearContext: {
      startYear: 2018, endYear: 2023, type: 'production-range',
      label: 'Model-line production period', isExactUnitDate: false,
    },
    precisionLevel: 'model-line-range',
    fallbackKind: 'deterministic-model-line',
    source: 'static',
    evidenceSource: 'heuristic',
    notes: 'Broader model-line timing after research timed out.',
  };
}

function groundedCitedResult() {
  return {
    brand: 'Acer',
    productFamily: 'Nitro 5',
    precisionLevel: 'family-range',
    yearContext: { value: 2017, type: 'market-introduction', label: 'Family launched', isExactUnitDate: false },
    evidenceSource: 'gemini-grounded',
    source: 'gemini',
    retrievedAt: '2026-03-01T00:00:00.000Z',
    sources: [{ title: 'Acer Nitro 5', domain: 'acer.com', uri: 'https://www.acer.com/nitro-5' }],
    evidence: [{ detail: 'Retailer listing confirms family introduction timing.' }],
    notes: 'Grounded family timing.',
  };
}

function cachedResult() {
  return {
    brand: 'Samsung',
    exactModel: 'QN65Q80A',
    introductionYear: 2020,
    source: 'cache',
    cacheStatus: 'hit',
    evidence: [{ detail: 'Cached detail' }],
  };
}

function brandConflictResult() {
  return {
    brand: 'LG',
    enteredBrand: 'LG',
    recognizedBrand: 'VIZIO',
    exactModel: 'M321i-A2',
    enteredModel: 'M321i-A2',
    canonicalModel: 'M321i-A2',
    productionRange: { start: 2013, end: 2014 },
    bestEstimateYear: 2013,
    yearContext: {
      type: 'production-range', startYear: 2013, endYear: 2014,
      label: 'Estimated production period', isExactUnitDate: false,
    },
    evidenceConflict: true,
    evidenceConflictKind: 'brand',
    estimateBasis: 'verified-model-generation',
    notes: 'Model belongs to VIZIO despite the entered LG brand.',
  };
}

function noExactModelResult() {
  return {
    brand: 'Sony',
    productFamily: 'Bravia',
    category: 'television',
    historicalContext: 'Sony Bravia is a long-running television product family.',
    categoryEntryYear: 2005,
    contextLevel: 'product-family',
    querySpecificity: 'product-family',
    precisionLevel: 'family-range',
    yearContext: { value: 2005, type: 'market-introduction', label: 'Product-family introduction', isExactUnitDate: false },
    contextConfidence: 'medium',
  };
}

function incompleteResult() {
  return {
    brand: 'Unknown',
    model: null,
    querySpecificity: 'unusable',
    notes: "We couldn't identify a physical product from this search.",
  };
}

test('report shell includes navy header, product heading, and hero year panel', () => {
  const html = api.renderAge(modelGenerationResult());
  assert.match(html, /smart-age-report/);
  assert.match(html, /Smart Lookup Results/);
  assert.match(html, /smart-age-report__header/);
  assert.match(html, /smart-year-context-value[\s\S]*2013–2014/);
  assert.match(html, /Estimated production period/);
  assert.match(html, /Best available result/i);
});

test('exact individual manufacture year uses unit date fields only', () => {
  const html = api.renderAge(exactUnitResult());
  assert.match(html, /smart-year-context-value[\s\S]*>2019</);
  assert.match(html, /Individual manufacture date[\s\S]*2019/);
  assert.match(html, /Serial-decoded manufacture date|Individual manufacture year/);
  assert.doesNotMatch(html, /Not available without serial/);
});

test('model-generation range does not invent a unit manufacture date', () => {
  const html = api.renderAge(modelGenerationResult());
  assert.match(html, /2013–2014/);
  assert.match(html, /Approximately 2013/);
  assert.match(html, /Individual manufacture date[\s\S]*requires serial number|Not available without serial/i);
  assert.doesNotMatch(html, /Individual manufacture date<\/span><span class="result-value">2013</);
});

test('year range and open-ended timing render existing estimate fields', () => {
  assert.match(api.renderAge(yearRangeResult()), /2019–2021|2019-2021/);
  const open = api.renderAge(openEndedResult());
  assert.match(open, /2020\+/);
  assert.match(open, /Sony Bravia|Bravia/);
});

test('product-family and timeout fallback keep deterministic wording', () => {
  const family = api.renderAge(productFamilyResult());
  assert.match(family, /ThinkSystem ST50/);
  assert.match(family, /Things to Keep in Mind|Things to keep in mind/i);
  assert.match(family, /Add the exact machine type code/i);

  const timeout = api.renderAge(timeoutFallbackResult());
  assert.match(timeout, /live research did not finish/i);
  assert.doesNotMatch(timeout, /AI-assisted model research completed/i);
});

test('grounded citations render collapsible sources; uncited results omit them', () => {
  const grounded = api.renderAge(groundedCitedResult());
  assert.match(grounded, /Web sources consulted/);
  assert.match(grounded, /Findings from current web sources|Evidence supporting this estimate|How this result was determined|Analysis basis/);
  assert.match(grounded, /acer\.com/);
  assert.match(grounded, /aria-expanded="false"/);
  assert.match(grounded, /rel="noopener nofollow"/);

  const noSources = api.renderAge(modelGenerationResult());
  assert.doesNotMatch(noSources, /Web sources consulted/);
});

test('cached result shows cache provenance without inventing citations', () => {
  const html = api.renderAge(cachedResult());
  assert.match(html, /Previously cached Smart Lookup result/);
  assert.doesNotMatch(html, /Web sources consulted/);
});

test('brand conflict preserves entry and keeps the estimate visible', () => {
  const html = api.renderAge(brandConflictResult());
  assert.match(html, /Check the brand on the label/i);
  assert.match(html, /entered brand was LG/i);
  assert.match(html, /matches VIZIO/i);
  assert.match(html, /2013–2014|Approximately 2013/);
  assert.match(html, /Recognized model brand[\s\S]*VIZIO/);
  assert.doesNotMatch(html, /Incomplete Result/i);
});

test('results without exact model omit fabricated model numbers', () => {
  const html = api.renderAge(noExactModelResult());
  assert.match(html, /Sony Bravia|Bravia/);
  assert.match(html, /Exact model[\s\S]*Not provided/);
  assert.match(html, /Specificity[\s\S]*Product family/i);
  assert.match(html, /Confidence[\s\S]*Moderate/i);
});

test('incomplete query payload does not invent a year panel value beyond existing fields', () => {
  const html = api.renderAge(incompleteResult());
  assert.match(html, /Not established|Smart Lookup result|Unknown/i);
  assert.doesNotMatch(html, /smart-year-context-value">20\d{2}</);
});

test('entered and canonical models both appear when they differ', () => {
  const html = api.renderAge({
    brand: 'GE',
    exactModel: 'GFW850SPNDG',
    enteredModel: 'GFW850SPN0DG',
    canonicalModel: 'GFW850SPNDG',
    productionRange: { start: 2019, end: 2021 },
    yearContext: { startYear: 2019, endYear: 2021, type: 'production-range', label: 'Production range', isExactUnitDate: false },
  });
  assert.match(html, /GFW850SPN0DG/);
  assert.match(html, /GFW850SPNDG/);
  assert.match(html, /verified label variant/i);
});

test('empty optional detail rows are omitted while required unit-date row remains', () => {
  const html = api.renderAge({
    brand: 'Samsung',
    introductionYear: 2020,
    notes: 'Model data only.',
  });
  assert.match(html, /Brand[\s\S]*Samsung/);
  assert.match(html, /Individual manufacture date/);
  assert.doesNotMatch(html, /Product family/);
  assert.doesNotMatch(html, /Screen size/);
  assert.doesNotMatch(html, /Estimate basis/);
});

test('specificity and confidence helpers expose readable labels', () => {
  assert.equal(api.specificityLabel({ querySpecificity: 'exact-model' }), 'Exact model');
  assert.equal(api.specificityLabel({ precisionLevel: 'family-range' }), 'Product family');
  assert.equal(api.confidenceLabel({ contextConfidence: 'high' }), 'High');
  assert.equal(api.confidenceLabel({ identityConfidence: 'medium' }), 'Moderate');
  assert.equal(api.confidenceLabel({ confidenceLevel: 'low' }), 'Low');
});

test('hero estimate-type labels derive from existing normalized fields only', () => {
  assert.match(api.heroEstimateTypeLabel(exactUnitResult(), exactUnitResult().yearContext, false), /Individual manufacture year|Serial-decoded/);
  assert.match(
    api.heroEstimateTypeLabel(modelGenerationResult(), modelGenerationResult().yearContext, false),
    /Model production period|Estimated production period/
  );
  assert.equal(
    api.estimatedTimingText(openEndedResult()),
    '2020+'
  );
});
