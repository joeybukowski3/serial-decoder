import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgeLookupHandler } from '../../api/age-lookup.js';
import { createLkqLookupHandler } from '../../api/lkq-lookup.js';
import { buildSmartAgeCacheKey } from '../../lib/smart-lookup/cache.js';
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

function withMetadata(value, metadata) {
  Object.defineProperty(value, Symbol.for('smart-lookup-provider-metadata'), {
    value: Object.freeze(metadata),
    enumerable: false,
  });
  return value;
}

function timeoutError(stage) {
  const error = new Error('timeout');
  error.name = 'AbortError';
  error.isTimeout = true;
  error.stage = stage;
  return error;
}

const BASE_DEPS = {
  totalBudgetMs: 2000,
  providerBudgetMs: 1800,
  groundedStageBudgetMs: 300,
  groundedFallbackMinRemainingMs: 200,
  groundedEnabled: true,
  env: { SMART_LOOKUP_GROUNDED_AGE: '1' },
  redisFactory: () => redisMiss,
};

// ── Regression case 1: Acer Nitro 5 grounded failure -> deterministic-family,
//    never labeled AI-assisted or groundedFallback ──────────────────────────

test('Acer Nitro 5: grounded failure (no time for ungrounded recovery) degrades to a deterministic-family result, never AI-assisted', async () => {
  const handler = createAgeLookupHandler({
    ...BASE_DEPS,
    groundedStageBudgetMs: 30,
    groundedFallbackMinRemainingMs: 5000, // forces "no time for same-deadline fallback"
    groundedProviderLookup: async () => { await new Promise((r) => setTimeout(r, 40)); throw timeoutError('age-provider-call-grounded'); },
    providerLookup: async () => { throw new Error('should never be called -- no time remained for a real recovery attempt'); },
  });
  const out = res();
  await handler(req('Acer Nitro 5'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(out.payload.brand, 'Acer');
  assert.equal(out.payload.productFamily, 'Nitro 5');
  assert.equal(out.payload.precisionLevel, 'family-range');
  assert.equal(out.payload.fallbackKind, 'deterministic-family');
  // The core semantic fix: never falsely labeled as an AI recovery.
  assert.equal(out.payload.groundedFallback, false);
  assert.notEqual(out.payload.evidenceSource, 'gemini-grounded');
  assert.notEqual(out.payload.evidenceSource, 'gemini-ungrounded');
  assert.equal(out.payload.evidenceSource, 'heuristic');
  assert.equal(out.payload.source, 'static');
  // Never claims one exact manufacture year for the whole family.
  assert.notEqual(out.payload.yearContext.type, 'manufacture-year');
  assert.ok(out.payload.recommendedIdentifiers.some((item) => /AN515/.test(item)));
});

test('Acer Nitro 5: grounded timeout followed by ungrounded fallback timeout also degrades to deterministic-family, not groundedFallback', async () => {
  const handler = createAgeLookupHandler({
    ...BASE_DEPS,
    groundedProviderLookup: async () => { await new Promise((r) => setTimeout(r, 50)); throw timeoutError('age-provider-call-grounded'); },
    providerLookup: async () => { await new Promise((r) => setTimeout(r, 50)); throw timeoutError('age-provider-call-fallback'); },
  });
  const out = res();
  await handler(req('Acer Nitro 5'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(out.payload.fallbackKind, 'deterministic-family');
  assert.equal(out.payload.groundedFallback, false);
  assert.equal(out.payload.precisionLevel, 'family-range');
});

// ── Regression case 2: Acer Nitro 5 grounded timeout -> successful ungrounded
//    Gemini recovery, correctly labeled groundedFallback + AI-assisted ─────

test('Acer Nitro 5: grounded timeout with a successful ungrounded Gemini recovery is marked groundedFallback + fallbackKind ungrounded-provider, with no sources', async () => {
  const handler = createAgeLookupHandler({
    ...BASE_DEPS,
    groundedProviderLookup: async () => { await new Promise((r) => setTimeout(r, 50)); throw timeoutError('age-provider-call-grounded'); },
    providerLookup: async () => withMetadata({
      brand: 'Acer',
      specificityLevel: 'partial',
      notes: 'Closed-book model-family knowledge.',
      evidence: [{ detail: 'Model pattern knowledge.', source: 'Model pattern' }],
    }, { provider: 'gemini', fallbackUsed: false }),
  });
  const out = res();
  await handler(req('Acer Nitro 5'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(out.payload.groundedFallback, true);
  assert.equal(out.payload.fallbackKind, 'ungrounded-provider');
  assert.notEqual(out.payload.evidenceSource, 'gemini-grounded');
  assert.deepEqual(out.payload.sources, []);
});

// ── Regression case 3: Whirlpool top-load washer brand-category grounded
//    eligibility ────────────────────────────────────────────────────────────

test('Whirlpool top-load washer is recognized as brand-category and eligible for bounded age grounding', () => {
  const info = classifySmartLookupQuery('Whirlpool top-load washer');
  assert.equal(info.querySpecificity, 'brand-category');
  assert.equal(info.providerEligible, true);
  assert.equal(info.groundedEligible, true);
});

test('Whirlpool top-load washer: a grounded broad-range result can render (known product eras) without selecting an arbitrary exact model', async () => {
  const handler = createAgeLookupHandler({
    ...BASE_DEPS,
    groundedProviderLookup: async () => withMetadata({
      brand: 'Whirlpool',
      specificityLevel: 'brand-only',
      // A broad known-era range is exactly the defensible information a
      // brand-category grounded response is allowed to report.
      yearContext: { type: 'production-range', startYear: 1990, endYear: 2020, basis: 'model-availability' },
      notes: 'Whirlpool has sold top-load washers across many decades and model lines.',
      generationSummary: ['Mechanical-dial top-load washers common through the 1990s-2000s.', 'Digital-control top-load washers common since the 2010s.'],
      recommendedIdentifiers: ['Look for the model number on the inside of the door frame or the rear panel.'],
      evidence: [{ detail: 'Manufacturer product-line history.', source: 'whirlpool.com' }],
    }, {
      provider: 'gemini',
      fallbackUsed: false,
      grounded: true,
      groundedSources: [{ title: 'Whirlpool', domain: 'whirlpool.com', uri: 'https://www.whirlpool.com/laundry' }],
      searchQueryCount: 1,
    }),
  });
  const out = res();
  await handler(req('Whirlpool top-load washer'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(out.payload.evidenceSource, 'gemini-grounded');
  assert.equal(out.payload.precisionLevel, 'broad-range');
  // No arbitrary exact model was selected for a brand-category query.
  assert.equal(out.payload.model, null);
  assert.equal(out.payload.exactModel, null);
  // The broad known-era range renders...
  assert.equal(out.payload.yearContext.type, 'production-range');
  assert.equal(out.payload.yearContext.startYear, 1990);
  // ...but never as a claimed manufacture year.
  assert.notEqual(out.payload.yearContext.type, 'manufacture-year');
  assert.notEqual(out.payload.yearContext.type, 'manufacture-date');
});

test('Whirlpool top-load washer: a provider trying to invent a family or claim one manufacture year is stripped by the schema', async () => {
  const handler = createAgeLookupHandler({
    ...BASE_DEPS,
    groundedProviderLookup: async () => withMetadata({
      brand: 'Whirlpool',
      specificityLevel: 'brand-only',
      productFamily: 'Cabrio', // invented -- classifier never recognized a family for this query
      model: 'WTW5000DW', // invented -- must never be trusted for brand-category
      yearContext: { type: 'manufacture-year', value: 2020 }, // must be stripped
      notes: 'Attempted overclaim.',
    }, {
      provider: 'gemini', fallbackUsed: false, grounded: true,
      groundedSources: [{ title: 'Whirlpool', domain: 'whirlpool.com', uri: 'https://www.whirlpool.com/x' }],
      searchQueryCount: 1,
    }),
  });
  const out = res();
  await handler(req('Whirlpool top-load washer'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(out.payload.productFamily, null);
  assert.equal(out.payload.model, null);
  // The invented manufacture-year claim is stripped entirely (no
  // introductionYear/productionRange survives for brand-only either), so
  // the result correctly has no year context at all rather than a
  // downgraded-but-still-wrong one.
  assert.equal(out.payload.yearContext, null);
});

test('Whirlpool top-load washer: grounded/provider failure degrades to deterministic brand-category guidance, not an empty timeout card', async () => {
  const handler = createAgeLookupHandler({
    ...BASE_DEPS,
    groundedProviderLookup: async () => { await new Promise((r) => setTimeout(r, 50)); throw timeoutError('age-provider-call-grounded'); },
    providerLookup: async () => { await new Promise((r) => setTimeout(r, 50)); throw timeoutError('age-provider-call-fallback'); },
  });
  const out = res();
  await handler(req('Whirlpool top-load washer'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(out.payload.brand, 'Whirlpool');
  assert.equal(out.payload.category, 'washer');
  assert.equal(out.payload.fallbackKind, 'deterministic-brand-category');
  assert.equal(out.payload.groundedFallback, false);
  assert.equal(out.payload.precisionLevel, 'broad-range');
  assert.match(out.payload.notes, /Whirlpool|washer/i);
});

// ── Regression case 4: refrigerator (category-only) stays deterministic ────

test('refrigerator (category-only) reserves no provider budget by default and returns general guidance only', async () => {
  let calls = 0;
  const handler = createAgeLookupHandler({
    ...BASE_DEPS,
    providerLookup: async () => { calls += 1; return withMetadata({}, { provider: 'gemini' }); },
    groundedProviderLookup: async () => { calls += 1; return withMetadata({}, { provider: 'gemini' }); },
  });
  const out = res();
  await handler(req('refrigerator'), out);
  assert.equal(calls, 0);
  assert.equal(out.statusCode, 200);
  assert.equal(out.payload.querySpecificity, 'category-only');
  assert.equal(out.payload.fallbackKind, 'none');
});

test('a bare brand with no category ("Whirlpool" alone) is not meaningful enough for grounded research', () => {
  const info = classifySmartLookupQuery('Whirlpool');
  assert.equal(info.querySpecificity, 'brand-category');
  assert.equal(info.groundedEligible, false);
  assert.equal(info.providerEligible, false);
});

// ── Regression case 5: meaningless input -> no provider call, clarification
//    only ─────────────────────────────────────────────────────────────────

test('unusable (random meaningless) input makes no provider call and returns a clarification result', async () => {
  let calls = 0;
  const handler = createAgeLookupHandler({
    ...BASE_DEPS,
    providerLookup: async () => { calls += 1; return withMetadata({}, { provider: 'gemini' }); },
    groundedProviderLookup: async () => { calls += 1; return withMetadata({}, { provider: 'gemini' }); },
  });
  const out = res();
  await handler(req('asdkj 4432 xx'), out);
  assert.equal(calls, 0);
  assert.equal(out.statusCode, 200);
  assert.equal(out.payload.querySpecificity, 'unusable');
  assert.equal(out.payload.fallbackKind, 'clarification');
  assert.equal(out.payload.groundedFallback, false);
});

// ── Regression case 6: cache -- distinct labeling, no cross-tier/cross-
//    fallback contamination ─────────────────────────────────────────────────

test('cache keys distinguish exact-model, model-line, product-family, and brand-category for the same underlying brand', () => {
  const exact = classifySmartLookupQuery('Acer AN515-58-57Y8');
  const line = classifySmartLookupQuery('Acer AN515-58');
  const family = classifySmartLookupQuery('Acer Nitro 5');
  const brandCategory = classifySmartLookupQuery('Acer laptop');
  const keys = new Set([
    buildSmartAgeCacheKey(exact, { grounded: false }),
    buildSmartAgeCacheKey(line, { grounded: false }),
    buildSmartAgeCacheKey(family, { grounded: false }),
    buildSmartAgeCacheKey(brandCategory, { grounded: false }),
  ]);
  assert.equal(keys.size, 4);
});

test('a degraded (deterministic-family) result is never cached, regardless of fallbackKind', async () => {
  let setCalls = 0;
  const redis = { ...redisMiss, set: async () => { setCalls += 1; } };
  const handler = createAgeLookupHandler({
    ...BASE_DEPS,
    redisFactory: () => redis,
    groundedProviderLookup: async () => { await new Promise((r) => setTimeout(r, 20)); throw timeoutError('age-provider-call-grounded'); },
    providerLookup: async () => { await new Promise((r) => setTimeout(r, 20)); throw timeoutError('age-provider-call-fallback'); },
  });
  const out = res();
  await handler(req('Acer Nitro 5'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(out.payload.fallbackKind, 'deterministic-family');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(setCalls, 0);
});

test('a real ungrounded-provider recovery result IS eligible for caching and is labeled distinctly from a deterministic fallback', async () => {
  let setCalls = 0;
  const cachedPayloads = [];
  const redis = { ...redisMiss, set: async (_key, value) => { setCalls += 1; cachedPayloads.push(value); } };
  const handler = createAgeLookupHandler({
    ...BASE_DEPS,
    redisFactory: () => redis,
    groundedProviderLookup: async () => { await new Promise((r) => setTimeout(r, 50)); throw timeoutError('age-provider-call-grounded'); },
    providerLookup: async () => withMetadata({
      brand: 'Acer',
      specificityLevel: 'partial',
      notes: 'Closed-book model-family knowledge.',
      evidence: [{ detail: 'Model pattern knowledge.', source: 'Model pattern' }],
    }, { provider: 'gemini', fallbackUsed: false }),
  });
  const out = res();
  await handler(req('Acer Nitro 5'), out);
  assert.equal(out.payload.fallbackKind, 'ungrounded-provider');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(setCalls, 1);
  assert.equal(cachedPayloads[0].fallbackKind, 'ungrounded-provider');
});

test('a grounded success for an exact Acer model is unaffected by the family-degradation ladder', async () => {
  const handler = createAgeLookupHandler({
    ...BASE_DEPS,
    groundedProviderLookup: async () => withMetadata({
      brand: 'Acer',
      model: 'AN515-58-57Y8',
      specificityLevel: 'specific',
      introductionYear: 2022,
      notes: 'Grounded model evidence.',
      evidence: [{ detail: 'Manufacturer spec sheet.', source: 'acer.com' }],
    }, {
      provider: 'gemini',
      fallbackUsed: false,
      grounded: true,
      groundedSources: [{ title: 'Acer', domain: 'acer.com', uri: 'https://www.acer.com/product' }],
      searchQueryCount: 1,
    }),
  });
  const out = res();
  await handler(req('Acer AN515-58-57Y8'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(out.payload.exactModel, 'AN515-58-57Y8');
  assert.equal(out.payload.evidenceSource, 'gemini-grounded');
  assert.equal(out.payload.fallbackKind, 'none');
});

// ── LKQ interaction (unchanged scope -- not expanded beyond exact-model) ───

test('LKQ: unusable input makes no provider call', async () => {
  let calls = 0;
  const handler = createLkqLookupHandler({
    groundedEnabled: true,
    redisFactory: () => redisMiss,
    providerLookup: async () => { calls += 1; return withMetadata({}, { provider: 'gemini' }); },
    groundedProviderLookup: async () => { calls += 1; return withMetadata({}, { provider: 'gemini' }); },
  });
  const out = res();
  await handler(req('asdkj 4432 xx'), out);
  assert.equal(calls, 0);
  assert.equal(out.statusCode, 200);
});

test('LKQ: a brand-category query never names one arbitrary current product as a direct successor', async () => {
  const handler = createLkqLookupHandler({
    groundedEnabled: false,
    redisFactory: () => redisMiss,
    providerLookup: async () => withMetadata({
      itemSummary: { name: 'Whirlpool washer', brand: 'Whirlpool', category: 'washer' },
      successorStatus: { type: 'direct_successor', name: 'Whirlpool WTW5015LW', model: 'WTW5015LW', explanation: 'Current lineup.' },
      replacementRelationship: 'direct-successor',
      replacement: { name: 'Whirlpool WTW5015LW', brand: 'Whirlpool', model: 'WTW5015LW', category: 'washer' },
      replacementOptions: [],
    }, { provider: 'gemini', fallbackUsed: false }),
  });
  const out = res();
  await handler(req('Whirlpool top-load washer'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(out.payload.successorStatus.type, 'none');
  assert.equal(out.payload.replacementRelationship, 'similar-alternative');
});

test('LKQ grounding stays exact-model only -- not expanded to brand-category by this follow-up', async () => {
  let groundedCalls = 0;
  const handler = createLkqLookupHandler({
    groundedEnabled: true,
    redisFactory: () => redisMiss,
    groundedProviderLookup: async () => { groundedCalls += 1; return withMetadata({}, { provider: 'gemini', grounded: true, groundedSources: [] }); },
    providerLookup: async () => withMetadata({
      itemSummary: { name: 'Whirlpool washer', brand: 'Whirlpool', category: 'washer' },
      successorStatus: { type: 'none' },
      replacementRelationship: 'none-found',
      replacementOptions: [],
    }, { provider: 'gemini', fallbackUsed: false }),
  });
  const out = res();
  await handler(req('Whirlpool top-load washer'), out);
  assert.equal(groundedCalls, 0);
  assert.equal(out.statusCode, 200);
});

test('LKQ: an age-lookup failure never affects a concurrent independent replacement lookup', async () => {
  // Sanity check that the age and LKQ handlers are fully independent request
  // paths (no shared mutable state) -- an age timeout must never make LKQ
  // fail too.
  const ageHandler = createAgeLookupHandler({
    ...BASE_DEPS,
    groundedProviderLookup: async () => { throw timeoutError('age-provider-call-grounded'); },
    providerLookup: async () => { throw timeoutError('age-provider-call'); },
  });
  const lkqHandler = createLkqLookupHandler({
    groundedEnabled: false,
    redisFactory: () => redisMiss,
    providerLookup: async () => withMetadata({
      itemSummary: { name: 'Whirlpool washer', brand: 'Whirlpool', category: 'washer' },
      successorStatus: { type: 'none' },
      replacementRelationship: 'none-found',
      replacementOptions: [],
    }, { provider: 'gemini', fallbackUsed: false }),
  });
  const ageOut = res();
  const lkqOut = res();
  await Promise.all([
    ageHandler(req('Whirlpool top-load washer'), ageOut),
    lkqHandler(req('Whirlpool top-load washer'), lkqOut),
  ]);
  assert.equal(ageOut.statusCode, 200);
  assert.equal(lkqOut.statusCode, 200);
});
