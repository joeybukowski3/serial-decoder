import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Same IIFE-extraction pattern as progressive-specificity-ui.test.mjs, kept
// in its own file since this suite's focus (progressive LKQ/replacement
// rendering) is distinct from the age-side suite.
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
    globalThis.__smartLookupLkqTestApi = {
      renderReplacement, classifyReplacementOutcome, escapeHtml,
      isDeterministicLkqFallback, isGroundedLkqResult, isLkqTimeoutFallbackResult,
      hasProgressiveReplacementGuidance, lkqSourceQualifier,
    };
  }());`;
  vm.runInContext(wrapped, ctx);
  return ctx.__smartLookupLkqTestApi;
}

const api = loadSmartLookupController();

function modelLineResult(overrides = {}) {
  return {
    replacementPrecision: 'model-line',
    originalIdentityLevel: 'model-line',
    configurationUnknown: true,
    originalIdentity: { brand: 'Dell', family: 'OptiPlex', modelLine: 'OptiPlex 9020', category: 'desktop computer', formFactor: null },
    knownConfigurationVariants: ['Tower', 'Small Form Factor (SFF)', 'Micro / Ultra Small Form Factor (USFF)'],
    comparisonCriteria: ['Chassis/form factor', 'Processor generation and core count'],
    recommendedMinimumSpecs: ['Match or exceed the original processor generation.'],
    assumptions: ['The original configuration may vary.'],
    unknownOriginalSpecs: ['Processor', 'Installed RAM'],
    recommendedIdentifiers: ['Enter the chassis/form factor from the case label.'],
    replacementRelationship: 'none-found',
    replacement: null,
    replacementRationale: 'Live replacement research did not complete.',
    replacementCandidates: [],
    materialDifferences: [],
    compatibilityStatus: 'unknown',
    compatibilityWarnings: [],
    priceObservations: [],
    sources: [],
    evidenceSource: 'static',
    deterministicFallbackUsed: true,
    groundedFallback: false,
    ...overrides,
  };
}

test('a deterministic model-line replacement result classifies as success, not unavailable', () => {
  const data = modelLineResult();
  assert.equal(api.classifyReplacementOutcome(data), 'success');
});

test('deterministic model-line rendering shows the recognized identity and "configuration varies" note', () => {
  const html = api.renderReplacement(modelLineResult());
  assert.match(html, /Model-line guidance/);
  assert.match(html, /OptiPlex 9020/);
  assert.match(html, /Original configuration varies/);
});

test('deterministic model-line rendering shows the comparison checklist and refinement guidance', () => {
  const html = api.renderReplacement(modelLineResult());
  assert.match(html, /Compare candidates on/);
  assert.match(html, /Chassis\/form factor/);
  assert.match(html, /To narrow this result/);
  assert.match(html, /chassis\/form factor from the case label/);
});

test('deterministic fallback is never labeled grounded or AI-assisted in the rendered qualifier', () => {
  const data = modelLineResult();
  const qualifier = api.lkqSourceQualifier(data);
  assert.doesNotMatch(qualifier, /Grounded in live Google Search/);
  assert.doesNotMatch(qualifier, /AI-assisted/);
  const html = api.renderReplacement(data);
  assert.doesNotMatch(html, /Sources consulted/);
});

test('deterministic fallback never renders price observations or source links', () => {
  const html = api.renderReplacement(modelLineResult());
  assert.doesNotMatch(html, /Current price observations/);
  assert.doesNotMatch(html, /target="_blank"/);
});

test('a ranked candidate list renders rank, relationship, and compatibility for each candidate', () => {
  const data = modelLineResult({
    replacementCandidates: [
      {
        rank: 1, brand: 'Dell', family: 'OptiPlex', model: 'OPTIPLEX7020', category: 'desktop computer',
        relationship: 'same-series-successor', fitReason: 'Same series, newer generation',
        specificationComparison: { Processor: 'Newer generation' }, materialDifferences: ['Faster CPU'],
        compatibilityStatus: 'compatible-with-caveats', compatibilityWarnings: ['Chassis size not confirmed'], priceObservations: [],
      },
      {
        rank: 2, brand: 'Lenovo', family: 'ThinkCentre', model: 'M720', category: 'desktop computer',
        relationship: 'functional-equivalent', fitReason: 'Comparable cross-brand business desktop',
        specificationComparison: {}, materialDifferences: [], compatibilityStatus: 'unknown', compatibilityWarnings: [], priceObservations: [],
      },
    ],
  });
  const html = api.renderReplacement(data);
  assert.match(html, /Ranked replacement candidates/);
  assert.match(html, /#1 Dell OPTIPLEX7020/);
  assert.match(html, /Same-series successor/);
  assert.match(html, /#2 Lenovo M720/);
  assert.match(html, /Current functional equivalent/);
  assert.doesNotMatch(html, /Direct manufacturer successor/);
});

test('no candidate is ever rendered with the direct-successor label for a model-line result', () => {
  const data = modelLineResult({
    replacementCandidates: [
      { rank: 1, brand: 'Dell', family: 'OptiPlex', model: 'OPTIPLEX7020', category: 'desktop computer', relationship: 'same-series-successor', specificationComparison: {}, materialDifferences: [], compatibilityWarnings: [], priceObservations: [] },
    ],
  });
  const html = api.renderReplacement(data);
  assert.doesNotMatch(html, /Direct manufacturer successor/);
});

test('exact-model rendering (existing path) is not decorated with the new precision badge or identity block', () => {
  const exactModelData = {
    replacementPrecision: 'exact-model',
    configurationUnknown: false,
    originalIdentity: { brand: 'LG', family: null, modelLine: null, category: 'washer', formFactor: null },
    replacementRelationship: 'direct-successor',
    replacement: { brand: 'LG', model: 'WM4000HWA', name: 'LG WM4000HWA', category: 'washer' },
    replacementRationale: 'LG lists this as the successor.',
    materialDifferences: [],
    compatibilityStatus: 'likely-compatible',
    compatibilityWarnings: [],
    priceObservations: [],
    sources: [{ title: 'lg.com', domain: 'lg.com', uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/a' }],
    evidenceSource: 'manufacturer-grounded',
    retrievedAt: '2026-01-01T00:00:00.000Z',
    deterministicFallbackUsed: false,
    groundedFallback: false,
    recommendedIdentifiers: ['Should not render for exact-model'],
  };
  const html = api.renderReplacement(exactModelData);
  assert.doesNotMatch(html, /smart-lookup-precision-badge/);
  assert.doesNotMatch(html, /lkq-original-identity/);
  assert.doesNotMatch(html, /To narrow this result/);
  assert.match(html, /Direct manufacturer successor/);
});

test('escapeHtml is applied to provider-authored candidate text', () => {
  const data = modelLineResult({
    replacementCandidates: [
      { rank: 1, brand: '<script>alert(1)</script>', family: null, model: null, category: 'desktop computer', relationship: 'similar-alternative', fitReason: '<img src=x onerror=alert(1)>', specificationComparison: {}, materialDifferences: [], compatibilityWarnings: [], priceObservations: [] },
    ],
  });
  const html = api.renderReplacement(data);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<img /);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img /);
});

test('unavailable card renders when neither a grounded result nor progressive guidance exists', () => {
  const data = { replacementRelationship: 'none-found', replacement: null, replacementOptions: [], replacementPrecision: 'unusable' };
  assert.equal(api.classifyReplacementOutcome(data), 'unavailable');
  const html = api.renderReplacement(data);
  assert.match(html, /smart-lookup-status--noresult/);
});

// ── Exact-model deterministic reserve (inclusivity audit 2026-07) ────────────
// An exact-model LKQ timeout previously rendered the generic unavailable card
// because hasProgressiveReplacementGuidance gated exact tiers out entirely --
// the demonstrated Samsung QN65Q60RAFXZA / LG WM3900HWA production failure.

function exactModelReserve(overrides = {}) {
  return {
    itemSummary: { brand: 'Samsung', model: 'QN65Q60RAFXZA', category: 'television', name: 'Samsung QN65Q60RAFXZA' },
    replacementPrecision: 'exact-model',
    replacementRelationship: 'none-found',
    replacement: null,
    replacementOptions: [],
    replacementCandidates: [],
    comparisonCriteria: ['Screen size (diagonal)', 'Panel technology and resolution'],
    originalIdentity: { brand: 'Samsung', model: 'QN65Q60RAFXZA', category: 'television' },
    replacementRationale: 'Replacement research did not complete within the request budget.',
    deterministicFallbackUsed: true,
    groundedFallback: false,
    errorCode: 'PROVIDER_TIMEOUT',
    ...overrides,
  };
}

test('an exact-model deterministic reserve renders guidance instead of the unavailable card', () => {
  const data = exactModelReserve();
  assert.equal(api.classifyReplacementOutcome(data), 'success');
  const html = api.renderReplacement(data);
  assert.doesNotMatch(html, /smart-lookup-status--noresult/);
  assert.match(html, /Screen size/);
});

test('an exact-model reserve says research did not complete, not that nothing was found', () => {
  const html = api.renderReplacement(exactModelReserve());
  assert.match(html, /Replacement research did not complete/);
  assert.doesNotMatch(html, /No single defensible replacement found/);
});

test('an exact-model reserve is never worded as grounded or AI-assisted', () => {
  const html = api.renderReplacement(exactModelReserve());
  assert.doesNotMatch(html, /grounded in live Google Search/i);
  assert.doesNotMatch(html, /Web sources consulted/i);
  assert.doesNotMatch(html, /AI-assisted/i);
});

test('a real exact-model provider result is unaffected by the reserve branch', () => {
  // Same precision tier, but NOT a deterministic fallback: must not be treated
  // as progressive guidance, so the existing exact-model path stays unchanged.
  const data = exactModelReserve({
    deterministicFallbackUsed: false,
    comparisonCriteria: ['Should not qualify as guidance'],
  });
  assert.equal(api.hasProgressiveReplacementGuidance(data), false);
});
