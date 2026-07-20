import test from 'node:test';
import assert from 'node:assert/strict';
import { createLkqLookupHandler } from '../../api/lkq-lookup.js';

function req(query, extra = {}) { return { method: 'POST', body: { query, ...extra }, headers: { 'x-forwarded-for': '127.0.0.1' }, socket: {} }; }
function res() {
  return { statusCode: 0, payload: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; return this; }, setHeader() {} };
}

const redisMiss = {
  get: async () => null,
  set: async () => {},
  eval: async () => [1, 1, 1],
  incrby: async (_key, amount) => amount,
  expire: async () => 1,
};

const MANUFACTURER_SOURCE = { title: 'dell.com', domain: 'dell.com', uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/a' };
const RETAILER_SOURCE = { title: 'bestbuy.com', domain: 'bestbuy.com', uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/b' };

function withMetadata(value, metadata) {
  Object.defineProperty(value, Symbol.for('smart-lookup-provider-metadata'), {
    value: Object.freeze(metadata),
    enumerable: false,
  });
  return value;
}

function groundedModelLineResult(overrides = {}) {
  return withMetadata({
    itemSummary: { brand: 'Dell', model: null, category: 'desktop computer', name: 'Dell OptiPlex 9020', availability: 'Discontinued' },
    specLabels: ['Chassis', 'Processor', 'RAM', 'Storage', 'Graphics'],
    originalSpecs: {},
    replacementRelationship: 'direct-successor',
    replacementRationale: 'Compared against current Dell OptiPlex lineup',
    replacement: { name: 'Dell OptiPlex 7020', brand: 'Dell', model: 'OPTIPLEX7020', category: 'desktop computer' },
    replacementSpecs: {},
    materialDifferences: ['Newer processor generation'],
    compatibilityStatus: 'likely-compatible',
    compatibilityWarnings: [],
    configurationUnknown: true,
    originalIdentity: { brand: 'Dell', family: 'OptiPlex', modelLine: 'OptiPlex 9020', category: 'desktop computer', formFactor: null },
    knownConfigurationVariants: ['Tower', 'Small Form Factor (SFF)', 'Micro / Ultra Small Form Factor (USFF)'],
    comparisonCriteria: ['Processor generation', 'Installed RAM'],
    assumptions: ['The original configuration may vary.'],
    unknownOriginalSpecs: ['Processor', 'RAM'],
    replacementCandidates: [
      {
        rank: 1, brand: 'Dell', family: 'OptiPlex', model: 'OPTIPLEX7020', category: 'desktop computer',
        relationship: 'direct-successor', fitReason: 'Same series, current generation',
        specificationComparison: {}, materialDifferences: [], compatibilityStatus: 'likely-compatible', compatibilityWarnings: [],
      },
      {
        rank: 2, brand: 'Lenovo', family: 'ThinkCentre', model: 'M720', category: 'desktop computer',
        relationship: 'direct-successor', fitReason: 'Comparable cross-brand business desktop',
        specificationComparison: {}, materialDifferences: [], compatibilityStatus: 'likely-compatible', compatibilityWarnings: [],
      },
    ],
    priceObservations: [],
    ...overrides.result,
  }, {
    provider: 'gemini', fallbackUsed: false, primaryProvider: 'gemini', primaryErrorCode: null,
    grounded: true, groundedSources: [MANUFACTURER_SOURCE, RETAILER_SOURCE], searchQueryCount: 2,
    ...overrides.metadata,
  });
}

function closedBookResult(overrides = {}) {
  return withMetadata({
    itemSummary: { brand: 'Dell', model: null, category: 'desktop computer', name: 'Dell OptiPlex 9020', availability: 'Discontinued' },
    specLabels: [], originalSpecs: {},
    successorStatus: { type: 'none', name: null, model: null, explanation: 'No verified current same-brand successor was established.' },
    replacementOptions: [],
    ...overrides.result,
  }, { provider: 'gemini', fallbackUsed: false, primaryProvider: 'gemini', primaryErrorCode: null, ...overrides.metadata });
}

// --- Grounded eligibility widened (Phase 4) ---------------------------------

test('a model-line query (OptiPlex 9020) is grounded-eligible', async () => {
  let groundedCalls = 0;
  const handler = createLkqLookupHandler({
    groundedEnabled: true,
    redisFactory: () => redisMiss,
    groundedProviderLookup: async () => { groundedCalls += 1; return groundedModelLineResult(); },
    providerLookup: async () => { throw new Error('closed-book should not run'); },
  });
  const out = res();
  await handler(req('OptiPlex 9020'), out);
  assert.equal(groundedCalls, 1);
});

test('a high-confidence product-family query (Generic OptiPlex) is grounded-eligible', async () => {
  let groundedCalls = 0;
  const handler = createLkqLookupHandler({
    groundedEnabled: true,
    redisFactory: () => redisMiss,
    groundedProviderLookup: async () => { groundedCalls += 1; return groundedModelLineResult({ result: { replacementRelationship: 'functional-equivalent', replacementCandidates: [] } }); },
    providerLookup: async () => { throw new Error('closed-book should not run'); },
  });
  const out = res();
  await handler(req('Generic OptiPlex'), out);
  assert.equal(groundedCalls, 1);
});

test('a low-confidence product-family query (Dell Inspiron 15) stays on the closed-book path', async () => {
  let groundedCalls = 0;
  let closedBookCalls = 0;
  const handler = createLkqLookupHandler({
    groundedEnabled: true,
    redisFactory: () => redisMiss,
    groundedProviderLookup: async () => { groundedCalls += 1; return groundedModelLineResult(); },
    providerLookup: async () => { closedBookCalls += 1; return closedBookResult(); },
  });
  const out = res();
  await handler(req('Dell Inspiron 15'), out);
  assert.equal(groundedCalls, 0);
  assert.equal(closedBookCalls, 1);
});

test('a bare brand-only query never uses grounded research', async () => {
  let groundedCalls = 0;
  const handler = createLkqLookupHandler({
    groundedEnabled: true,
    redisFactory: () => redisMiss,
    groundedProviderLookup: async () => { groundedCalls += 1; return groundedModelLineResult(); },
    providerLookup: async () => closedBookResult(),
  });
  const out = res();
  await handler(req('Dell'), out);
  assert.equal(groundedCalls, 0);
});

test('bare "desktop computer" (category-only) never uses grounded research or names one arbitrary replacement', async () => {
  let groundedCalls = 0;
  const handler = createLkqLookupHandler({
    groundedEnabled: true,
    redisFactory: () => redisMiss,
    groundedProviderLookup: async () => { groundedCalls += 1; return groundedModelLineResult(); },
    providerLookup: async () => closedBookResult(),
  });
  const out = res();
  await handler(req('desktop computer'), out);
  assert.equal(groundedCalls, 0);
  assert.equal(out.statusCode, 200);
  assert.notEqual(out.payload.replacementRelationship, 'direct-successor');
});

test('unusable input performs no provider call', async () => {
  let providerCalls = 0;
  const handler = createLkqLookupHandler({
    groundedEnabled: true,
    redisFactory: () => redisMiss,
    groundedProviderLookup: async () => { providerCalls += 1; return groundedModelLineResult(); },
    providerLookup: async () => { providerCalls += 1; return closedBookResult(); },
  });
  const out = res();
  await handler(req('xqzvv'), out);
  assert.equal(providerCalls, 0);
  assert.equal(out.statusCode, 200);
});

// --- Direct-successor safeguards for non-exact identity (Phase 6) ----------

test('direct-successor is downgraded for a model-line query even with manufacturer-grounded evidence', async () => {
  const handler = createLkqLookupHandler({
    groundedEnabled: true,
    redisFactory: () => redisMiss,
    groundedProviderLookup: async () => groundedModelLineResult(),
  });
  const out = res();
  await handler(req('OptiPlex 9020'), out);
  assert.notEqual(out.payload.replacementRelationship, 'direct-successor');
  assert.equal(out.payload.replacementRelationship, 'same-series-successor');
});

test('replacementCandidates never carry direct-successor for a model-line query', async () => {
  const handler = createLkqLookupHandler({
    groundedEnabled: true,
    redisFactory: () => redisMiss,
    groundedProviderLookup: async () => groundedModelLineResult(),
  });
  const out = res();
  await handler(req('OptiPlex 9020'), out);
  const candidates = out.payload.replacementCandidates;
  assert.ok(Array.isArray(candidates) && candidates.length >= 2);
  for (const candidate of candidates) {
    assert.notEqual(candidate.relationship, 'direct-successor');
  }
});

test('ranked candidates include a same-brand and a cross-brand candidate when evidence provides them', async () => {
  const handler = createLkqLookupHandler({
    groundedEnabled: true,
    redisFactory: () => redisMiss,
    groundedProviderLookup: async () => groundedModelLineResult(),
  });
  const out = res();
  await handler(req('OptiPlex 9020'), out);
  const candidates = out.payload.replacementCandidates;
  assert.ok(candidates.some((c) => c.brand === 'Dell'));
  assert.ok(candidates.some((c) => c.brand === 'Lenovo'));
});

test('sources are still derived only from grounding metadata for a model-line result', async () => {
  const handler = createLkqLookupHandler({
    groundedEnabled: true,
    redisFactory: () => redisMiss,
    groundedProviderLookup: async () => groundedModelLineResult(),
  });
  const out = res();
  await handler(req('OptiPlex 9020'), out);
  assert.ok(Array.isArray(out.payload.sources) && out.payload.sources.length > 0);
  assert.ok(out.payload.sources.every((s) => /^https:\/\//.test(s.uri)));
});

test('a model-line result never claims an exact original configuration', async () => {
  const handler = createLkqLookupHandler({
    groundedEnabled: true,
    redisFactory: () => redisMiss,
    groundedProviderLookup: async () => groundedModelLineResult(),
  });
  const out = res();
  await handler(req('OptiPlex 9020'), out);
  assert.equal(out.payload.configurationUnknown, true);
  assert.equal(out.payload.compatibilityStatus, 'compatible-with-caveats');
});

// --- Deterministic degradation (Phase 8) ------------------------------------

test('a recognized model-line query degrades to deterministic guidance on provider timeout, not an empty panel', async () => {
  const handler = createLkqLookupHandler({
    groundedEnabled: false,
    redisFactory: () => redisMiss,
    totalBudgetMs: 300,
    providerLookup: () => new Promise(() => {}),
  });
  const out = res();
  await handler(req('OptiPlex 9020'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(out.payload.deterministicFallbackUsed, true);
  assert.equal(out.payload.evidenceSource, 'static');
  assert.ok(out.payload.comparisonCriteria.length > 0);
  assert.equal(out.payload.replacementRelationship, 'none-found');
});

test('deterministic fallback is never labeled grounded or AI-assisted', async () => {
  const handler = createLkqLookupHandler({
    groundedEnabled: false,
    redisFactory: () => redisMiss,
    totalBudgetMs: 300,
    providerLookup: () => new Promise(() => {}),
  });
  const out = res();
  await handler(req('OptiPlex 9020'), out);
  assert.notEqual(out.payload.evidenceSource, 'gemini-ungrounded');
  assert.notEqual(out.payload.evidenceSource, 'manufacturer-grounded');
  assert.equal(out.payload.sources.length, 0);
  assert.equal(out.payload.priceObservations.length, 0);
  assert.equal(out.payload.groundedFallback, false);
});

test('deterministic fallback fires on invalid provider output too, not just timeout', async () => {
  const handler = createLkqLookupHandler({
    groundedEnabled: false,
    redisFactory: () => redisMiss,
    providerLookup: async () => withMetadata({
      itemSummary: { brand: 'Samsung', model: null, category: 'television', name: 'wrong brand' },
    }, { provider: 'gemini', fallbackUsed: false, primaryProvider: 'gemini', primaryErrorCode: null }),
  });
  const out = res();
  await handler(req('OptiPlex 9020'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(out.payload.deterministicFallbackUsed, true);
});

test('deterministic fallback does not consume an extra provider budget reservation', async () => {
  let budgetCalls = 0;
  const handler = createLkqLookupHandler({
    groundedEnabled: false,
    redisFactory: () => redisMiss,
    totalBudgetMs: 300,
    reserveProviderBudget: async () => { budgetCalls += 1; return { allowed: true, status: 'allowed', logicalLookupCount: 1 }; },
    providerLookup: () => new Promise(() => {}),
  });
  const out = res();
  await handler(req('OptiPlex 9020'), out);
  assert.equal(budgetCalls, 1);
  assert.equal(out.payload.deterministicFallbackUsed, true);
});

test('a query with no recognizable identity at all still gets the plain unavailable message, not a fabricated deterministic card', async () => {
  const handler = createLkqLookupHandler({
    groundedEnabled: false,
    redisFactory: () => redisMiss,
    totalBudgetMs: 300,
    providerLookup: () => new Promise(() => {}),
  });
  const out = res();
  await handler(req('teal curtains'), out);
  assert.equal(out.statusCode, 200);
  assert.notEqual(out.payload.deterministicFallbackUsed, true);
});

// --- Existing safeguards remain intact --------------------------------------

test('exact-model appliance LKQ (LG WM3900HWA) is unaffected by the progressive-LKQ changes', async () => {
  const handler = createLkqLookupHandler({
    groundedEnabled: true,
    redisFactory: () => redisMiss,
    groundedProviderLookup: async () => withMetadata({
      itemSummary: { brand: 'LG', model: 'WM3900HWA', category: 'washer', name: 'LG WM3900HWA', availability: 'Discontinued' },
      specLabels: ['Capacity', 'Type', 'Fuel', 'Voltage', 'Install'],
      originalSpecs: { Capacity: '4.5 cu ft' },
      replacementRelationship: 'direct-successor',
      replacementRationale: 'LG lists WM4000HWA as the successor on lg.com',
      replacement: { name: 'LG WM4000HWA', brand: 'LG', model: 'WM4000HWA', category: 'washer' },
      replacementSpecs: {}, materialDifferences: [], compatibilityStatus: 'likely-compatible', compatibilityWarnings: [], priceObservations: [],
    }, {
      provider: 'gemini', fallbackUsed: false, primaryProvider: 'gemini', primaryErrorCode: null,
      grounded: true, groundedSources: [{ title: 'lg.com', domain: 'lg.com', uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/a' }], searchQueryCount: 1,
    }),
  });
  const out = res();
  await handler(req('LG WM3900HWA'), out);
  assert.equal(out.payload.replacementRelationship, 'direct-successor');
  assert.equal(out.payload.replacementPrecision, 'exact-model');
  assert.equal(out.payload.configurationUnknown, false);
});

test('cross-category candidates remain rejected', async () => {
  const handler = createLkqLookupHandler({
    groundedEnabled: true,
    redisFactory: () => redisMiss,
    groundedProviderLookup: async () => withMetadata({
      itemSummary: { brand: 'LG', model: 'WM3900HWA', category: 'washer', name: 'LG WM3900HWA' },
      specLabels: [], originalSpecs: {},
      replacementRelationship: 'functional-equivalent',
      replacement: { name: 'LG dryer', brand: 'LG', model: 'DLE4000W', category: 'dryer' },
    }, { provider: 'gemini', fallbackUsed: false, primaryProvider: 'gemini', primaryErrorCode: null, grounded: true, groundedSources: [MANUFACTURER_SOURCE], searchQueryCount: 1 }),
  });
  const out = res();
  await handler(req('LG washer WM3900HWA'), out);
  assert.equal(out.payload.errorCode, 'REPLACEMENT_CATEGORY_MISMATCH');
});

test('Redis failure does not trigger paid-provider work for a model-line query', async () => {
  let providerCalls = 0;
  const redisDown = {
    get: async () => { throw new Error('redis down'); },
    set: async () => { throw new Error('redis down'); },
    eval: async () => { throw new Error('redis down'); },
    incrby: async () => { throw new Error('redis down'); },
    expire: async () => { throw new Error('redis down'); },
  };
  const handler = createLkqLookupHandler({
    groundedEnabled: true,
    redisFactory: () => redisDown,
    groundedProviderLookup: async () => { providerCalls += 1; return groundedModelLineResult(); },
    providerLookup: async () => { providerCalls += 1; return closedBookResult(); },
  });
  const out = res();
  await handler(req('OptiPlex 9020'), out);
  assert.equal(providerCalls, 0);
  assert.equal(out.statusCode, 200);
});

test('in-flight duplicate model-line requests share one logical budget reservation', async () => {
  let budgetCalls = 0;
  let groundedCalls = 0;
  const handler = createLkqLookupHandler({
    groundedEnabled: true,
    redisFactory: () => redisMiss,
    reserveProviderBudget: async () => { budgetCalls += 1; return { allowed: true, status: 'allowed', logicalLookupCount: 1 }; },
    groundedProviderLookup: async () => { groundedCalls += 1; return groundedModelLineResult(); },
  });
  const first = res();
  const second = res();
  await Promise.all([handler(req('OptiPlex 9020'), first), handler(req('OptiPlex 9020'), second)]);
  assert.equal(budgetCalls, 1);
  assert.equal(groundedCalls, 1);
});
