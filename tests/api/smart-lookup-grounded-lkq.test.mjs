import test from 'node:test';
import assert from 'node:assert/strict';
import { createLkqLookupHandler } from '../../api/lkq-lookup.js';
import { buildSmartLkqCacheKey } from '../../lib/smart-lookup/cache.js';
import { classifySmartLookupQuery } from '../../lib/smart-lookup/normalize.js';

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

const MANUFACTURER_SOURCE = { title: 'lg.com', domain: 'lg.com', uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/a' };
const RETAILER_SOURCE = { title: 'bestbuy.com', domain: 'bestbuy.com', uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/b' };

function withMetadata(value, metadata) {
  Object.defineProperty(value, Symbol.for('smart-lookup-provider-metadata'), {
    value: Object.freeze(metadata),
    enumerable: false,
  });
  return value;
}

function groundedResult(overrides = {}) {
  return withMetadata({
    itemSummary: { brand: 'LG', model: 'WM3900HWA', category: 'washer', name: 'LG WM3900HWA', availability: 'Discontinued' },
    specLabels: ['Capacity', 'Type', 'Fuel', 'Voltage', 'Install'],
    originalSpecs: { Capacity: '4.5 cu ft' },
    replacementRelationship: 'direct-successor',
    replacementRationale: 'LG lists WM4000HWA as the successor on lg.com',
    replacement: { name: 'LG WM4000HWA', brand: 'LG', model: 'WM4000HWA', category: 'washer' },
    replacementSpecs: { Capacity: '5.0 cu ft' },
    materialDifferences: ['Larger capacity'],
    compatibilityStatus: 'likely-compatible',
    compatibilityWarnings: [],
    priceObservations: [
      { seller: 'Best Buy', price: 899.99, currency: 'USD', priceType: 'regular', condition: 'new', stockStatus: 'in-stock' },
    ],
    ...overrides.result,
  }, {
    provider: 'gemini',
    fallbackUsed: false,
    primaryProvider: 'gemini',
    primaryErrorCode: null,
    grounded: true,
    groundedSources: [MANUFACTURER_SOURCE],
    searchQueryCount: 2,
    ...overrides.metadata,
  });
}

function closedBookResult(overrides = {}) {
  return withMetadata({
    itemSummary: { brand: 'LG', model: 'WM3900HWA', category: 'washer', name: 'LG WM3900HWA', availability: 'Discontinued' },
    specLabels: ['Capacity', 'Type', 'Fuel', 'Voltage', 'Install'],
    originalSpecs: {},
    successorStatus: { type: 'none', name: null, model: null, explanation: 'No verified current same-brand successor was established.' },
    replacementOptions: [],
    ...overrides.result,
  }, {
    provider: 'gemini', fallbackUsed: false, primaryProvider: 'gemini', primaryErrorCode: null,
    ...overrides.metadata,
  });
}

// --- Query eligibility -----------------------------------------------------------

test('exact model with grounding enabled runs grounded research', async () => {
  let groundedCalls = 0;
  const handler = createLkqLookupHandler({
    groundedEnabled: true,
    redisFactory: () => redisMiss,
    groundedProviderLookup: async () => { groundedCalls += 1; return groundedResult(); },
    providerLookup: async () => { throw new Error('closed-book should not run'); },
  });
  const out = res();
  await handler(req('LG WM3900HWA'), out);
  assert.equal(groundedCalls, 1);
  assert.equal(out.payload.evidenceSource, 'manufacturer-grounded');
});

test('exact model with grounding disabled uses the closed-book path unchanged', async () => {
  let groundedCalls = 0;
  let closedBookCalls = 0;
  const handler = createLkqLookupHandler({
    groundedEnabled: false,
    redisFactory: () => redisMiss,
    groundedProviderLookup: async () => { groundedCalls += 1; return groundedResult(); },
    providerLookup: async () => { closedBookCalls += 1; return closedBookResult(); },
  });
  const out = res();
  await handler(req('LG WM3900HWA'), out);
  assert.equal(groundedCalls, 0);
  assert.equal(closedBookCalls, 1);
  assert.equal(out.payload.evidenceSource, 'gemini-ungrounded');
});

test('partial model never uses grounded research', async () => {
  let groundedCalls = 0;
  const handler = createLkqLookupHandler({
    groundedEnabled: true,
    redisFactory: () => redisMiss,
    groundedProviderLookup: async () => { groundedCalls += 1; return groundedResult(); },
    providerLookup: async () => closedBookResult(),
  });
  const out = res();
  await handler(req('Whirlpool WTW50'), out);
  assert.equal(groundedCalls, 0);
});

test('broad product family query never uses grounded research', async () => {
  let groundedCalls = 0;
  const handler = createLkqLookupHandler({
    groundedEnabled: true,
    redisFactory: () => redisMiss,
    groundedProviderLookup: async () => { groundedCalls += 1; return groundedResult(); },
    providerLookup: async () => closedBookResult(),
  });
  const out = res();
  await handler(req('Samsung Q60 Series TV'), out);
  assert.equal(groundedCalls, 0);
});

test('plain description without a model never uses grounded research', async () => {
  let groundedCalls = 0;
  const handler = createLkqLookupHandler({
    groundedEnabled: true,
    redisFactory: () => redisMiss,
    groundedProviderLookup: async () => { groundedCalls += 1; return groundedResult(); },
    providerLookup: async () => closedBookResult(),
  });
  const out = res();
  await handler(req('washing machine'), out);
  assert.equal(groundedCalls, 0);
});

test('missing model with only a brand never uses grounded research', async () => {
  let groundedCalls = 0;
  const handler = createLkqLookupHandler({
    groundedEnabled: true,
    redisFactory: () => redisMiss,
    groundedProviderLookup: async () => { groundedCalls += 1; return groundedResult(); },
    providerLookup: async () => closedBookResult(),
  });
  const out = res();
  await handler(req('LG'), out);
  assert.equal(groundedCalls, 0);
});

// --- Grounded result flow through the API handler ---------------------------------

test('mixed-grounded classification (manufacturer + retailer sources) flows through the handler', async () => {
  const handler = createLkqLookupHandler({
    groundedEnabled: true,
    redisFactory: () => redisMiss,
    groundedProviderLookup: async () => groundedResult({ metadata: { groundedSources: [MANUFACTURER_SOURCE, RETAILER_SOURCE] } }),
  });
  const out = res();
  await handler(req('LG WM3900HWA'), out);
  assert.equal(out.payload.evidenceSource, 'mixed-grounded');
  assert.equal(out.payload.sources.length, 2);
  assert.match(out.payload.retrievedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('a grounded result with no sources downgrades to gemini-ungrounded and drops price data', async () => {
  const handler = createLkqLookupHandler({
    groundedEnabled: true,
    redisFactory: () => redisMiss,
    groundedProviderLookup: async () => groundedResult({ metadata: { grounded: true, groundedSources: [] } }),
  });
  const out = res();
  await handler(req('LG WM3900HWA'), out);
  assert.equal(out.payload.evidenceSource, 'gemini-ungrounded');
  assert.deepEqual(out.payload.sources, []);
  assert.deepEqual(out.payload.priceObservations, []);
});

test('grounded output for an unrelated model is rejected by existing validation', async () => {
  const handler = createLkqLookupHandler({
    groundedEnabled: true,
    redisFactory: () => redisMiss,
    groundedProviderLookup: async () => groundedResult({ result: { itemSummary: { brand: 'LG', model: 'WM4000HBA', category: 'washer', name: 'LG WM4000HBA' } } }),
  });
  const out = res();
  await handler(req('LG WM3900HWA'), out);
  assert.equal(out.payload.errorCode, 'UNRELATED_MODEL');
});

test('a cross-category grounded replacement is rejected', async () => {
  const handler = createLkqLookupHandler({
    groundedEnabled: true,
    redisFactory: () => redisMiss,
    groundedProviderLookup: async () => groundedResult({ result: { replacement: { name: 'LG dryer', brand: 'LG', model: 'DLE4000W', category: 'dryer' } } }),
  });
  const out = res();
  // The generic-category comparison only engages when the query itself
  // implies a category (matching the existing UNRELATED_CATEGORY check's
  // behavior); a bare model number carries no category signal on its own.
  await handler(req('LG washer WM3900HWA'), out);
  assert.equal(out.payload.errorCode, 'REPLACEMENT_CATEGORY_MISMATCH');
});

// --- Timeout / fallback reliability -------------------------------------------------

const TIMEOUT_DEPS = {
  totalBudgetMs: 2000,
  groundedStageBudgetMs: 80,
  groundedFallbackMinRemainingMs: 100,
  groundedFallbackReserveMs: 50,
  groundedEnabled: true,
  redisFactory: () => redisMiss,
};

test('a grounded LKQ timeout with sufficient remaining time falls back to closed-book Gemini', async () => {
  let groundedCalls = 0;
  let fallbackCalls = 0;
  const handler = createLkqLookupHandler({
    ...TIMEOUT_DEPS,
    groundedProviderLookup: async () => { groundedCalls += 1; return new Promise(() => {}); },
    providerLookup: async () => { fallbackCalls += 1; return closedBookResult(); },
  });
  const out = res();
  await handler(req('LG WM3900HWA'), out);
  assert.equal(groundedCalls, 1);
  assert.equal(fallbackCalls, 1);
  assert.equal(out.payload.errorCode, null);
  assert.equal(out.payload.evidenceSource, 'gemini-ungrounded');
  assert.equal(out.payload.groundedFallback, true);
});

test('a grounded LKQ timeout with insufficient remaining budget skips fallback and preserves the safe timeout response', async () => {
  let fallbackCalls = 0;
  const handler = createLkqLookupHandler({
    totalBudgetMs: 1400,
    groundedStageBudgetMs: 1000,
    groundedFallbackMinRemainingMs: 1000,
    groundedFallbackReserveMs: 50,
    groundedEnabled: true,
    redisFactory: () => redisMiss,
    groundedProviderLookup: () => new Promise(() => {}),
    providerLookup: async () => { fallbackCalls += 1; return closedBookResult(); },
  });
  const out = res();
  await handler(req('LG WM3900HWA'), out);
  assert.equal(fallbackCalls, 0);
  assert.equal(out.payload.errorCode, 'PROVIDER_TIMEOUT');
  assert.equal(out.payload.groundedFallback, false);
});

test('no second full timeout chain: the fallback stage budget is capped by remaining route time, not a fresh provider ceiling', async () => {
  let capturedMaxMs = null;
  const handler = createLkqLookupHandler({
    totalBudgetMs: 1800,
    providerBudgetMs: 5000,
    groundedStageBudgetMs: 1400,
    groundedFallbackMinRemainingMs: 50,
    groundedFallbackReserveMs: 50,
    groundedEnabled: true,
    redisFactory: () => redisMiss,
    groundedProviderLookup: () => new Promise(() => {}),
    providerLookup: async (_input, options) => { capturedMaxMs = options.maxMs; return closedBookResult(); },
  });
  const out = res();
  const started = Date.now();
  await handler(req('LG WM3900HWA'), out);
  const elapsed = Date.now() - started;
  assert.ok(capturedMaxMs !== null && capturedMaxMs < 1000, `fallback maxMs (${capturedMaxMs}) must be far below the artificial 5000ms provider ceiling`);
  assert.ok(elapsed < 1900, `elapsed (${elapsed}ms) must stay near the 1800ms deadline`);
});

test('one logical daily budget reservation for the full grounded-timeout-fallback sequence', async () => {
  let budgetCalls = 0;
  const handler = createLkqLookupHandler({
    ...TIMEOUT_DEPS,
    reserveProviderBudget: async () => { budgetCalls += 1; return { allowed: true, status: 'allowed', logicalLookupCount: 1 }; },
    groundedProviderLookup: () => new Promise(() => {}),
    providerLookup: async () => closedBookResult(),
  });
  const out = res();
  await handler(req('LG WM3900HWA'), out);
  assert.equal(budgetCalls, 1);
  assert.equal(out.payload.groundedFallback, true);
});

test('concurrent identical grounded requests share one grounded attempt and one fallback chain', async () => {
  let groundedCalls = 0;
  let fallbackCalls = 0;
  const handler = createLkqLookupHandler({
    ...TIMEOUT_DEPS,
    groundedProviderLookup: async () => { groundedCalls += 1; return new Promise(() => {}); },
    providerLookup: async () => { fallbackCalls += 1; return closedBookResult(); },
  });
  const first = res();
  const second = res();
  await Promise.all([handler(req('LG WM3900HWA'), first), handler(req('LG WM3900HWA'), second)]);
  assert.equal(groundedCalls, 1);
  assert.equal(fallbackCalls, 1);
  assert.equal(first.payload.groundedFallback, true);
  assert.equal(second.payload.groundedFallback, true);
});

test('Redis unavailable fails closed before any grounded call', async () => {
  let groundedCalls = 0;
  const handler = createLkqLookupHandler({
    groundedEnabled: true,
    redisFactory: () => null,
    groundedProviderLookup: async () => { groundedCalls += 1; return groundedResult(); },
  });
  const out = res();
  await handler(req('LG WM3900HWA'), out);
  assert.equal(groundedCalls, 0);
  assert.equal(out.payload.errorCode, 'BUDGET_STORE_UNAVAILABLE');
});

test('global LKQ provider budget exhausted blocks grounded calls', async () => {
  let groundedCalls = 0;
  const handler = createLkqLookupHandler({
    groundedEnabled: true,
    redisFactory: () => ({ ...redisMiss, eval: async () => [0, 80, 180] }),
    groundedProviderLookup: async () => { groundedCalls += 1; return groundedResult(); },
  });
  const out = res();
  await handler(req('LG WM3900HWA'), out);
  assert.equal(groundedCalls, 0);
  assert.equal(out.payload.errorCode, 'GLOBAL_BUDGET_EXHAUSTED');
});

test('grounded 400/429/5xx and malformed JSON are already resolved by the internal Groq path, not duplicated', async () => {
  const handler = createLkqLookupHandler({
    groundedEnabled: true,
    redisFactory: () => redisMiss,
    groundedProviderLookup: async () => {
      // Simulates provider.js's own bounded Groq fallback already having
      // run (and succeeded) before this resolved value reaches the handler.
      return withMetadata({
        itemSummary: { brand: 'LG', model: 'WM3900HWA', category: 'washer', name: 'LG WM3900HWA', availability: 'Discontinued' },
        specLabels: ['Capacity', 'Type', 'Fuel', 'Voltage', 'Install'],
        originalSpecs: {},
        successorStatus: { type: 'none', name: null, model: null, explanation: 'No verified current same-brand successor was established.' },
        replacementOptions: [],
      }, {
        provider: 'groq', fallbackUsed: true, primaryProvider: 'gemini', primaryErrorCode: 'PROVIDER_5XX',
      });
    },
  });
  const out = res();
  await handler(req('LG WM3900HWA'), out);
  assert.equal(out.payload.source, 'groq');
  assert.equal(out.payload.fallbackUsed, true);
  assert.equal(out.payload.evidenceSource, 'groq-ungrounded');
});

test('timeout is never cached as a successful result', async () => {
  let setCalls = 0;
  const handler = createLkqLookupHandler({
    totalBudgetMs: 1400,
    groundedStageBudgetMs: 1000,
    groundedFallbackMinRemainingMs: 1000,
    groundedFallbackReserveMs: 50,
    groundedEnabled: true,
    redisFactory: () => ({ ...redisMiss, set: async (...args) => { setCalls += 1; return redisMiss.set(...args); } }),
    groundedProviderLookup: () => new Promise(() => {}),
  });
  const out = res();
  await handler(req('LG WM3900HWA'), out);
  assert.equal(out.payload.errorCode, 'PROVIDER_TIMEOUT');
  assert.equal(setCalls, 0);
});

// --- Cache behavior -----------------------------------------------------------------

test('cache hit bypasses providers entirely', async () => {
  let groundedCalls = 0;
  const cached = {
    itemSummary: { brand: 'LG', model: 'WM3900HWA', category: 'washer', name: 'LG WM3900HWA' },
    replacementRelationship: 'direct-successor',
    replacement: { name: 'LG WM4000HWA', brand: 'LG', model: 'WM4000HWA', category: 'washer' },
    evidenceSource: 'manufacturer-grounded',
    sources: [MANUFACTURER_SOURCE],
    retrievedAt: '2026-07-01T00:00:00.000Z',
    originSource: 'gemini',
    priceObservations: [],
  };
  const handler = createLkqLookupHandler({
    groundedEnabled: true,
    redisFactory: () => ({ get: async (key) => String(key).startsWith('smart-lkq:') ? cached : null, set: async () => {} }),
    groundedProviderLookup: async () => { groundedCalls += 1; return groundedResult(); },
    providerLookup: async () => { throw new Error('should not run'); },
  });
  const out = res();
  await handler(req('LG WM3900HWA'), out);
  assert.equal(groundedCalls, 0);
  assert.equal(out.payload.cacheStatus, 'hit');
  assert.equal(out.payload.evidenceSource, 'manufacturer-grounded');
  assert.equal(out.payload.sources.length, 1);
});

test('grounded and ungrounded LKQ modes use distinct cache keys', () => {
  const info = classifySmartLookupQuery('LG WM3900HWA');
  const grounded = buildSmartLkqCacheKey(info, { grounded: true });
  const ungrounded = buildSmartLkqCacheKey(info, { grounded: false });
  assert.notEqual(grounded, ungrounded);
});

// --- Telemetry -----------------------------------------------------------------------

test('grounded LKQ telemetry logs relationship/compatibility/price summary fields but never raw notes, model text, URLs, or a full payload', async () => {
  const logs = [];
  const handler = createLkqLookupHandler({
    groundedEnabled: true,
    redisFactory: () => redisMiss,
    groundedProviderLookup: async () => groundedResult(),
    logger: { info: (line) => logs.push(line), warn: () => {}, error: () => {} },
  });
  const out = res();
  await handler(req('LG WM3900HWA', { notes: 'bought at a garage sale in 2022' }), out);
  const entry = JSON.parse(logs[logs.length - 1]);
  assert.equal(entry.lkqRequested, true);
  assert.equal(entry.lkqGroundedAttempted, true);
  assert.equal(entry.lkqGroundedSucceeded, true);
  assert.equal(entry.lkqGroundedSourceCount, 1);
  assert.equal(entry.replacementRelationship, 'direct-successor');
  assert.equal(entry.compatibilityStatus, 'likely-compatible');
  assert.equal(entry.priceObservationCount, 1);
  assert.equal(entry.priceRangeProduced, false);
  const logText = logs.join('\n');
  assert.equal(logText.includes('garage sale'), false);
  assert.equal(logText.includes('WM3900HWA'), false);
  assert.equal(logText.includes('vertexaisearch'), false);
  assert.equal(logText.includes('bestbuy.com'), false);
});

// ── Exact-model deterministic reserve (inclusivity audit 2026-07) ────────────

test('an exact-model LKQ timeout returns recognized identity instead of an empty panel', async () => {
  const handler = createLkqLookupHandler({
    totalBudgetMs: 1400,
    groundedStageBudgetMs: 1000,
    groundedFallbackMinRemainingMs: 1000,
    groundedFallbackReserveMs: 50,
    groundedEnabled: true,
    redisFactory: () => redisMiss,
    groundedProviderLookup: () => new Promise(() => {}),
  });
  const out = res();
  await handler(req('Samsung QN65Q60RAFXZA'), out);
  assert.equal(out.payload.itemSummary.model, 'QN65Q60RAFXZA');
  assert.equal(out.payload.deterministicFallbackUsed, true);
  assert.equal(out.payload.errorCode, 'PROVIDER_TIMEOUT');
  // Identity only -- never a fabricated successor, price, or citation.
  assert.equal(out.payload.replacement, null);
  assert.equal(out.payload.replacementRelationship, 'none-found');
  assert.deepEqual(out.payload.sources ?? [], []);
  assert.equal(out.payload.replacementCostRange ?? null, null);
  assert.equal(out.payload.evidenceSource, 'static');
});
