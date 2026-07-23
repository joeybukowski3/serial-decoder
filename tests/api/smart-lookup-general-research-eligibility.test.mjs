import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgeLookupHandler } from '../../api/age-lookup.js';
import { classifySmartLookupQuery } from '../../lib/smart-lookup/normalize.js';

// Regression cover for the general-search-first eligibility fix: local
// classification (brand/category/family/model) is now a speed/confidence
// hint, never a precondition for whether a nonempty, meaningful query is
// allowed to reach research. See lib/smart-lookup/normalize.js
// (researchEligible) for the exclusion-based policy this replaces the old
// positive-signal allowlist with.

function req(query, extra = {}) {
  return { method: 'POST', body: { query, ...extra }, headers: { 'x-forwarded-for': '127.0.0.1' }, socket: {} };
}
function res() {
  return {
    statusCode: 0, payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    setHeader() {},
  };
}
const redisMiss = {
  get: async () => null, set: async () => {}, eval: async () => [1, 1, 1],
  incrby: async (_key, amount) => amount, expire: async () => 1,
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

const OPENAI_ENV = { OPENAI_API_KEY: 'test-key', SMART_LOOKUP_OPENAI_ENABLED: 'true', OPENAI_SMART_LOOKUP_MODEL: 'test-model' };

// ── Classification: must become provider-eligible ───────────────────────────

test('previously-refused queries with real product signal are now research-eligible', () => {
  const queries = [
    'iPhone 14',
    'Ipohne 14', // misspelled but recognizable
    'refrigerator', // bare category
    'television', // bare category
    'Apple', // bare brand
    'LG', // bare brand
    'Dyson V15', // brand not in any local table at all
    'old red Craftsman mower', // unrecognized brand, no category word
    'DCD791', // obscure bare alphanumeric model code, no brand
    'Zylorix Q900', // linguistically meaningful but wholly unknown commercial product name
  ];
  for (const query of queries) {
    const r = classifySmartLookupQuery(query);
    assert.equal(r.researchEligible, true, `${JSON.stringify(query)} must be research-eligible`);
    assert.equal(r.providerEligible, true, `${JSON.stringify(query)} must be provider-eligible`);
  }
});

// ── Classification: must remain excluded ────────────────────────────────────

test('empty input and genuine keyboard-mash remain excluded from research', () => {
  for (const query of ['', '   ', 'asdkjhqwe']) {
    const r = classifySmartLookupQuery(query);
    assert.equal(r.researchEligible, false, `${JSON.stringify(query)} must not be research-eligible`);
    assert.equal(r.providerEligible, false, `${JSON.stringify(query)} must not be provider-eligible`);
  }
});

test('a trusted serial/service-tag handoff with no other product signal stays excluded from research', () => {
  for (const query of ['Dell service tag JX2K9P1', 'service tag ABC1234', 'serial number 12345678']) {
    const r = classifySmartLookupQuery(query);
    assert.equal(r.researchEligible, false, `${JSON.stringify(query)} must be routed to the decoder, not research`);
  }
});

test('a recognized model line or family alongside a service-tag phrase is unaffected', () => {
  const r = classifySmartLookupQuery('Dell OptiPlex 9020 service tag ABC1234');
  assert.equal(r.serviceTagIntent, true);
  assert.equal(r.querySpecificity, 'model-line');
  assert.equal(r.researchEligible, true);
});

// ── API: previously dead-ending queries now reach the (mocked) provider ────

test('iPhone 14 reaches the provider and returns a useful result, not a pre-provider dead end', async () => {
  let calls = 0;
  const handler = createAgeLookupHandler({
    env: OPENAI_ENV,
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    openAiProviderLookup: async () => {
      calls += 1;
      return withMetadata({
        brand: 'Apple',
        likelyProduct: 'iPhone 14',
        productType: 'smartphone',
        specificityLevel: 'partial',
        introductionYear: 2022,
        identityConfidence: 'high',
        timingConfidence: 'high',
        serialNeededForExactUnitDate: true,
        notes: 'iPhone 14 was introduced in September 2022.',
      }, { provider: 'openai', fallbackUsed: false, grounded: true, webSearchUsed: true, groundedSources: [{ title: 'Apple', domain: 'apple.com', uri: 'https://www.apple.com/iphone-14/' }], searchQueryCount: 1 });
    },
  });
  const out = res();
  await handler(req('iPhone 14'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(calls, 1, 'iPhone 14 must reach the provider');
  assert.notEqual(out.payload.errorCode, 'INSUFFICIENT_QUERY_DETAIL');
  assert.equal(out.payload.likelyProduct, 'iPhone 14');
  assert.equal(out.payload.introductionYear, 2022);
  assert.equal(out.payload.individualManufactureYear, null, 'no unit-specific date without unit-specific evidence');
});

test('an obscure alphanumeric model code with no brand still reaches the provider', async () => {
  let calls = 0;
  const handler = createAgeLookupHandler({
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    providerLookup: async () => { calls += 1; return withMetadata({ brand: 'Unknown', model: 'DCD791', specificityLevel: 'partial' }, { provider: 'gemini' }); },
  });
  const out = res();
  await handler(req('DCD791'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(calls, 1);
});

// ── API: must still NOT call providers ──────────────────────────────────────

test('empty input and whitespace are rejected at validation before classification, and never call the provider', async () => {
  for (const query of ['', '   ']) {
    let calls = 0;
    const handler = createAgeLookupHandler({
      localLookup: async () => null,
      redisFactory: () => redisMiss,
      providerLookup: async () => { calls += 1; return {}; },
      groundedProviderLookup: async () => { calls += 1; return {}; },
    });
    const out = res();
    await handler(req(query), out);
    assert.equal(out.statusCode, 400, JSON.stringify(query));
    assert.equal(calls, 0, `${JSON.stringify(query)} must not call the provider`);
  }
});

test('keyboard mash is classified as unusable and never calls the provider', async () => {
  let calls = 0;
  const handler = createAgeLookupHandler({
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    providerLookup: async () => { calls += 1; return {}; },
    groundedProviderLookup: async () => { calls += 1; return {}; },
  });
  const out = res();
  await handler(req('asdkjhqwe'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(out.payload.querySpecificity, 'unusable');
  assert.equal(calls, 0, 'keyboard mash must not call the provider');
});

test('a trusted serial handoff still never reaches the provider', async () => {
  let calls = 0;
  const handler = createAgeLookupHandler({
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    providerLookup: async () => { calls += 1; return {}; },
  });
  const out = res();
  await handler(req('Dell service tag JX2K9P1'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(calls, 0);
  assert.match(out.payload.notes, /service or asset tag.*not a model number/i);
});

// ── API: provider-failure behavior is never mislabeled as insufficient
//    detail ───────────────────────────────────────────────────────────────

test('a provider-eligible query that runs out of deadline before research starts is labeled a system timeout, not insufficient detail', async () => {
  const handler = createAgeLookupHandler({
    totalBudgetMs: 100, // far below the 1200ms the pre-provider gate requires
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    providerLookup: async () => { throw new Error('must not be called -- deadline exhausted before the provider stage'); },
  });
  const out = res();
  await handler(req('iPhone 14'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(out.payload.errorCode, 'TOTAL_DEADLINE');
  assert.notEqual(out.payload.errorCode, 'INSUFFICIENT_QUERY_DETAIL');
  assert.equal(out.payload.individualManufactureYear, null);
});

test('OpenAI timeout with no xAI fallback configured still returns a safe, non-fabricated result', async () => {
  const handler = createAgeLookupHandler({
    env: OPENAI_ENV,
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    openAiProviderLookup: async () => { throw timeoutError('age-provider-call'); },
  });
  const out = res();
  await handler(req('iPhone 14'), out);
  assert.equal(out.statusCode, 200);
  assert.notEqual(out.payload.errorCode, 'INSUFFICIENT_QUERY_DETAIL');
  assert.equal(out.payload.individualManufactureYear, null);
});

test('a malformed provider response degrades safely without fabricating a result', async () => {
  const handler = createAgeLookupHandler({
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    providerLookup: async () => ({ brand: 'Other', model: 'BAD' }), // brand conflicts with query -- rejected by schema
  });
  const out = res();
  await handler(req('Samsung QN65-Q80A'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(out.payload.errorCode, 'UNRELATED_BRAND');
  assert.equal(out.payload.individualManufactureYear, null);
});

test('both providers unavailable degrades to a deterministic reserve when one exists, and never a raw 5xx', async () => {
  const handler = createAgeLookupHandler({
    ...{ totalBudgetMs: 2000 },
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    groundedProviderLookup: async () => { await new Promise((r) => setTimeout(r, 20)); throw timeoutError('age-provider-call-grounded'); },
    providerLookup: async () => { await new Promise((r) => setTimeout(r, 20)); throw timeoutError('age-provider-call-fallback'); },
  });
  const out = res();
  await handler(req('Acer Nitro 5'), out);
  assert.equal(out.statusCode, 200);
  assert.ok(String(out.payload.fallbackKind).startsWith('deterministic-'));
  assert.notEqual(out.payload.errorCode, 'INSUFFICIENT_QUERY_DETAIL');
  assert.equal(out.payload.individualManufactureYear, null);
});

// ── Regression: existing recognized-tier queries are unaffected ────────────

test('LG TV, Dell XPS 15, and Dell XPS 15 9530 remain classified exactly as before', () => {
  const lgTv = classifySmartLookupQuery('LG TV');
  assert.equal(lgTv.querySpecificity, 'brand-category');
  assert.equal(lgTv.researchEligible, true);

  const xps15 = classifySmartLookupQuery('Dell XPS 15');
  assert.equal(xps15.querySpecificity, 'model-line');
  assert.equal(xps15.researchEligible, true);

  const xps159530 = classifySmartLookupQuery('Dell XPS 15 9530');
  assert.equal(xps159530.querySpecificity, 'model-line');
  assert.equal(xps159530.researchEligible, true);
});

test('a labeled model + serial query keeps its roles separated and stays research-eligible for the model', () => {
  const r = classifySmartLookupQuery('model: WM3900HWA serial: 902KWXXXX');
  assert.equal(r.modelIdentity, 'WM3900HWA');
  assert.equal(r.serialIdentity, '902KWXXXX');
  assert.equal(r.researchEligible, true);
});
