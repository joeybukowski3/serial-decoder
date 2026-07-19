import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgeLookupHandler } from '../../api/age-lookup.js';

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
function withProviderMetadata(value, metadata) {
  Object.defineProperty(value, Symbol.for('smart-lookup-provider-metadata'), {
    value: Object.freeze(metadata),
    enumerable: false,
  });
  return value;
}

test('local results bypass cache, provider, and rate limit', async () => {
  const handler = createAgeLookupHandler({
    localLookup: async () => ({ brand: 'LG', model: 'WM4000HWA', introductionYear: 2019, productionRange: { start: 2019, end: 2024 } }),
    redisFactory: () => { throw new Error('redis should not run'); },
    providerLookup: async () => { throw new Error('provider should not run'); },
  });
  const out = res();
  await handler(req('LG WM4000HWA'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(out.payload.source, 'local-db');
});

test('local age result does not consume provider budget', async () => {
  let budgetCalls = 0;
  const handler = createAgeLookupHandler({
    localLookup: async () => ({ brand: 'LG', model: 'WM4000HWA', introductionYear: 2019, productionRange: { start: 2019, end: 2024 } }),
    redisFactory: () => { throw new Error('redis should not run'); },
    reserveProviderBudget: async () => { budgetCalls += 1; throw new Error('budget should not run'); },
  });
  const out = res();
  await handler(req('LG WM4000HWA'), out);
  assert.equal(out.payload.source, 'local-db');
  assert.equal(budgetCalls, 0);
});

test('cache hit bypasses provider and limiter', async () => {
  let limiterCalls = 0;
  const cached = { brand: 'Samsung', model: 'QN65Q80A', specificityLevel: 'specific', introductionYear: 2020, productionRange: { start: 2021, end: 2021 } };
  const handler = createAgeLookupHandler({
    localLookup: async () => null,
    redisFactory: () => ({ get: async (key) => String(key).startsWith('smart-age:') ? cached : null, set: async () => {} }),
    rateLimiterFactory: () => ({ limit: async () => { limiterCalls += 1; return { success: true }; } }),
    providerLookup: async () => { throw new Error('provider should not run'); },
  });
  const out = res();
  await handler(req('Samsung QN65-Q80A'), out);
  assert.equal(out.payload.cacheStatus, 'hit');
  assert.equal(limiterCalls, 0);
});

test('cache hit does not consume provider budget', async () => {
  let budgetCalls = 0;
  const cached = { brand: 'Samsung', model: 'QN65Q80A', specificityLevel: 'specific', introductionYear: 2020, productionRange: { start: 2021, end: 2021 } };
  const handler = createAgeLookupHandler({
    localLookup: async () => null,
    redisFactory: () => ({ get: async (key) => String(key).startsWith('smart-age:') ? cached : null, set: async () => {} }),
    reserveProviderBudget: async () => { budgetCalls += 1; throw new Error('budget should not run'); },
    providerLookup: async () => { throw new Error('provider should not run'); },
  });
  const out = res();
  await handler(req('Samsung QN65-Q80A'), out);
  assert.equal(out.payload.cacheStatus, 'hit');
  assert.equal(budgetCalls, 0);
});

test('age lookup sends normalized notes as separate untrusted provider context', async () => {
  let seenInfo = null;
  const handler = createAgeLookupHandler({
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    providerLookup: async (queryInfo) => {
      seenInfo = queryInfo;
      return { brand: 'Samsung', model: 'QN65Q80A', introductionYear: 2020, productionRange: { start: 2021, end: 2021 } };
    },
  });
  const out = res();
  await handler(req('Samsung QN65-Q80A', { notes: '  Label says\npanel replaced   last year  ' }), out);
  assert.equal(out.statusCode, 200);
  assert.equal(seenInfo.userNotes, 'Label says panel replaced last year');
  assert.equal(typeof seenInfo.notesHash, 'string');
  assert.equal(seenInfo.notesHash.length, 24);
});

test('age lookup rejects over-limit notes before provider and logs no raw notes', async () => {
  let providerCalls = 0;
  const logs = [];
  const handler = createAgeLookupHandler({
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    providerLookup: async () => { providerCalls += 1; return {}; },
    logger: { info: (line) => logs.push(line), warn: () => {}, error: () => {} },
  });
  const out = res();
  await handler(req('Samsung QN65-Q80A', { notes: 'sensitive note '.repeat(40) }), out);
  assert.equal(out.statusCode, 400);
  assert.equal(out.payload.errorCode, 'NOTES_TOO_LONG');
  assert.equal(providerCalls, 0);
  assert.equal(logs.join('\n').includes('sensitive note'), false);
});

test('verified-unit evidence does not become individual manufacture date for a different unit', async () => {
  const handler = createAgeLookupHandler({
    localLookup: async () => null,
    redisFactory: () => ({ get: async (key) => key.startsWith('decoder-verified:') ? { brand: 'Samsung', model: 'QN65Q80A', estimatedYear: '2021' } : null, set: async () => {} }),
    providerLookup: async () => { throw new Error('provider should not run'); },
  });
  const out = res();
  await handler(req('Samsung QN65-Q80A'), out);
  assert.equal(out.payload.source, 'decoder-verified');
  assert.equal(out.payload.individualManufactureYear, null);
  assert.equal(out.payload.productionRange.start, 2021);
});

test('verified model result does not consume provider budget', async () => {
  let budgetCalls = 0;
  const handler = createAgeLookupHandler({
    localLookup: async () => null,
    redisFactory: () => ({ get: async (key) => key.startsWith('decoder-verified:') ? { brand: 'Samsung', model: 'QN65Q80A', estimatedYear: '2021' } : null, set: async () => {} }),
    reserveProviderBudget: async () => { budgetCalls += 1; throw new Error('budget should not run'); },
    providerLookup: async () => { throw new Error('provider should not run'); },
  });
  const out = res();
  await handler(req('Samsung QN65-Q80A'), out);
  assert.equal(out.payload.source, 'decoder-verified');
  assert.equal(budgetCalls, 0);
});

test('first paid age lookup reserves logical budget and records one provider attempt', async () => {
  let budgetCalls = 0;
  let recordedAttempts = 0;
  const handler = createAgeLookupHandler({
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    reserveProviderBudget: async () => { budgetCalls += 1; return { allowed: true, status: 'allowed', logicalLookupCount: 1 }; },
    recordProviderAttemptMetrics: async (_redis, _kind, attempts) => { recordedAttempts += attempts; return { status: 'recorded', actualProviderAttemptCount: attempts }; },
    providerLookup: async () => ({ brand: 'Samsung', model: 'QN65Q80A', introductionYear: 2020, productionRange: { start: 2021, end: 2021 } }),
  });
  const out = res();
  await handler(req('Samsung QN65-Q80A'), out);
  assert.equal(out.payload.errorCode, null);
  assert.equal(budgetCalls, 1);
  assert.equal(recordedAttempts, 1);
});

test('fallback age provider result records two actual provider attempts', async () => {
  let recordedAttempts = 0;
  const handler = createAgeLookupHandler({
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    reserveProviderBudget: async () => ({ allowed: true, status: 'allowed', logicalLookupCount: 1 }),
    recordProviderAttemptMetrics: async (_redis, _kind, attempts) => { recordedAttempts += attempts; return { status: 'recorded', actualProviderAttemptCount: attempts }; },
    providerLookup: async () => withProviderMetadata({ brand: 'Samsung', model: 'QN65Q80A', introductionYear: 2020, productionRange: { start: 2021, end: 2021 } }, { provider: 'groq', fallbackUsed: true }),
  });
  const out = res();
  await handler(req('Samsung QN65-Q80A'), out);
  assert.equal(out.payload.fallbackUsed, true);
  assert.equal(recordedAttempts, 2);
});

test('global age budget exhaustion blocks direct provider calls without exposing quota values', async () => {
  let providerCalls = 0;
  const handler = createAgeLookupHandler({
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    reserveProviderBudget: async () => ({ allowed: false, status: 'denied', errorCode: 'GLOBAL_BUDGET_EXHAUSTED', logicalLookupCount: 120 }),
    providerLookup: async () => { providerCalls += 1; return {}; },
  });
  const out = res();
  await handler(req('Samsung QN65-Q80A'), out);
  assert.equal(providerCalls, 0);
  assert.equal(out.payload.errorCode, 'GLOBAL_BUDGET_EXHAUSTED');
  assert.equal(out.payload.providerAttempted, false);
  assert.match(out.payload.notes, /try again tomorrow/i);
  assert.doesNotMatch(JSON.stringify(out.payload), /120|UPSTASH|REDIS/i);
});

test('budget store unavailable blocks paid age provider calls but deterministic paths still work', async () => {
  let providerCalls = 0;
  const paidHandler = createAgeLookupHandler({
    localLookup: async () => null,
    redisFactory: () => null,
    providerLookup: async () => { providerCalls += 1; return {}; },
  });
  const paidOut = res();
  await paidHandler(req('Samsung QN65-Q80A'), paidOut);
  assert.equal(providerCalls, 0);
  assert.equal(paidOut.payload.errorCode, 'BUDGET_STORE_UNAVAILABLE');

  const deterministicHandler = createAgeLookupHandler({
    localLookup: async () => null,
    redisFactory: () => null,
    providerLookup: async () => { providerCalls += 1; return {}; },
  });
  const deterministicOut = res();
  await deterministicHandler(req('LG C3 TV'), deterministicOut);
  assert.equal(deterministicOut.payload.source, 'static');
  assert.equal(providerCalls, 0);
});

test('deduplicated age provider requests consume one logical budget unit', async () => {
  let budgetCalls = 0;
  let providerCalls = 0;
  let attemptMetricCalls = 0;
  let release;
  const blocker = new Promise((resolve) => { release = resolve; });
  const handler = createAgeLookupHandler({
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    reserveProviderBudget: async () => { budgetCalls += 1; return { allowed: true, status: 'allowed', logicalLookupCount: budgetCalls }; },
    recordProviderAttemptMetrics: async () => { attemptMetricCalls += 1; return { status: 'recorded', actualProviderAttemptCount: 1 }; },
    providerLookup: async () => { providerCalls += 1; await blocker; return { brand: 'Samsung', model: 'QN65Q80A', introductionYear: 2020, productionRange: { start: 2021, end: 2021 } }; },
  });
  const one = res(); const two = res();
  const p1 = handler(req('Samsung QN65-Q80A'), one);
  const p2 = handler(req('Samsung QN65-Q80A'), two);
  release();
  await Promise.all([p1, p2]);
  assert.equal(providerCalls, 1);
  assert.equal(budgetCalls, 1);
  assert.equal(attemptMetricCalls, 1);
});

test('provider timeout returns safe unavailable response', async () => {
  const handler = createAgeLookupHandler({
    totalBudgetMs: 2000, providerBudgetMs: 20, localLookup: async () => null, redisFactory: () => redisMiss,
    providerLookup: async () => new Promise(() => {}),
  });
  const out = res();
  await handler(req('Samsung QN65-Q80A'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(out.payload.errorCode, 'PROVIDER_TIMEOUT');
});

test('malformed provider output is rejected safely', async () => {
  const handler = createAgeLookupHandler({ localLookup: async () => null, redisFactory: () => redisMiss, providerLookup: async () => ({ brand: 'Other', model: 'BAD' }) });
  const out = res();
  await handler(req('Samsung QN65-Q80A'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(out.payload.errorCode, 'UNRELATED_BRAND');
});

test('concurrent identical provider requests share one provider and limiter call', async () => {
  let providerCalls = 0;
  let limiterCalls = 0;
  let release;
  const blocker = new Promise((resolve) => { release = resolve; });
  const handler = createAgeLookupHandler({
    localLookup: async () => null, redisFactory: () => redisMiss,
    rateLimiterFactory: () => ({ limit: async () => { limiterCalls += 1; return { success: true }; } }),
    providerLookup: async () => { providerCalls += 1; await blocker; return { brand: 'Samsung', model: 'QN65Q80A', introductionYear: 2020, productionRange: { start: 2021, end: 2021 } }; },
  });
  const one = res(); const two = res();
  const p1 = handler(req('Samsung QN65-Q80A'), one);
  const p2 = handler(req('Samsung QN65-Q80A'), two);
  release();
  await Promise.all([p1, p2]);
  assert.equal(providerCalls, 1);
  assert.equal(limiterCalls, 1);
});

test('HVAC model-only digits are not decoded as serial dates', async () => {
  let providerCalls = 0;
  const handler = createAgeLookupHandler({
    localLookup: async () => null, redisFactory: () => redisMiss,
    providerLookup: async () => { providerCalls += 1; return { brand: 'Carrier', model: '24ACC636A003', introductionYear: 2018, productionRange: { start: 2018, end: 2023 } }; },
  });
  const out = res();
  await handler(req('Carrier 24ACC636A003'), out);
  assert.equal(out.payload.estimatedYearType, 'model-introduction');
  assert.equal(providerCalls, 1);
});

test('Samsung Q60 retailer-title description returns a product-family-recognized result, not brand-needed', async () => {
  let providerCalls = 0;
  const handler = createAgeLookupHandler({
    localLookup: async () => null, redisFactory: () => redisMiss,
    providerLookup: async () => { providerCalls += 1; throw new Error('provider should not run for a brand-only/partial static result'); },
  });
  const out = res();
  await handler(req('Samsung - 65" Class Q60 Series LED 4K UHD Smart Tizen TV'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(out.payload.errorCode, null);
  assert.equal(out.payload.brand, 'Samsung');
  assert.equal(out.payload.category, 'television');
  assert.equal(out.payload.productFamily, 'Q60 Series');
  assert.equal(out.payload.needsExactModel, true);
  assert.equal(out.payload.introductionYear, null, 'must not fabricate an exact manufacture year from a broad title');
  assert.deepEqual(out.payload.yearContext, {
    startYear: 2019,
    endYear: 2024,
    type: 'production-range',
    label: 'Model-year variants',
    confidence: 'high',
    source: 'local-seed',
    isExactUnitDate: false,
  });
  assert.deepEqual(out.payload.yearVariants.map(({ name, year }) => [name, year]), [
    ['Q60R / Q60RA', 2019], ['Q60T', 2020], ['Q60A', 2021],
    ['Q60B', 2022], ['Q60C', 2023], ['Q60D', 2024],
  ]);
  assert.match(out.payload.notes, /Q60 Series/);
  assert.match(out.payload.refinementSuggestion, /QN65Q60RAFXZA/);
  assert.equal(providerCalls, 0);
});

test('a Samsung Q60 description with no exact model does not say "Serial numbers are brand-specific" (verified via bucket-relevant fields)', async () => {
  const handler = createAgeLookupHandler({ localLookup: async () => null, redisFactory: () => redisMiss });
  const out = res();
  await handler(req('Samsung Q60A 65 inch TV'), out);
  assert.equal(out.payload.brand, 'Samsung');
  assert.equal(out.payload.productFamily, 'Q60 Series');
  assert.equal(out.payload.yearContext.value, 2021);
  assert.equal(out.payload.yearContext.type, 'model-year-family');
  assert.equal(out.payload.individualManufactureYear, null);
  assert.notEqual(out.payload.brand, 'Unknown');
});

test('LG C3 family query returns a safe partial result before the legacy C3 alias can substitute a model', async () => {
  let localCalls = 0;
  let providerCalls = 0;
  const handler = createAgeLookupHandler({
    localLookup: async () => {
      localCalls += 1;
      return { brand: 'LG', model: 'OLED55C3PUA', yearRange: '2023-2024' };
    },
    redisFactory: () => redisMiss,
    providerLookup: async () => { providerCalls += 1; return {}; },
  });
  const out = res();
  await handler(req('LG C3 TV'), out);

  assert.equal(out.statusCode, 200);
  assert.equal(out.payload.status, 'partial-success');
  assert.equal(out.payload.outcome, 'product-family-year-context');
  assert.equal(out.payload.resultType, 'product-family-recognized');
  assert.equal(out.payload.brand, 'LG');
  assert.equal(out.payload.category, 'television');
  assert.equal(out.payload.productFamily, 'C3');
  assert.equal(out.payload.seriesLine, 'OLED C3');
  assert.equal(out.payload.model, null);
  assert.equal(out.payload.exactModel, null);
  assert.equal(out.payload.individualManufactureYear, null);
  assert.equal(out.payload.modelYearFamilyYear, 2023);
  assert.deepEqual(out.payload.yearContext, {
    value: 2023,
    type: 'model-year-family',
    label: 'Model-year family',
    confidence: 'high',
    source: 'local-seed',
    isExactUnitDate: false,
  });
  assert.equal(out.payload.needsExactModel, true);
  assert.match(out.payload.notes, /model-year family.*2023|2023.*model-year family/i);
  assert.doesNotMatch(out.payload.notes, /manufacture year is 2023/i);
  assert.match(out.payload.refinementSuggestion, /OLED42C3PUA/);
  assert.equal(localCalls, 0);
  assert.equal(providerCalls, 0);
});

test('LG OLED C3 uses the same deterministic product-family response', async () => {
  const handler = createAgeLookupHandler({
    localLookup: async () => { throw new Error('family query must bypass the local exact-model alias'); },
    redisFactory: () => redisMiss,
  });
  const out = res();
  await handler(req('LG OLED C3'), out);
  assert.equal(out.payload.resultType, 'product-family-recognized');
  assert.equal(out.payload.productFamily, 'C3');
  assert.equal(out.payload.exactModel, null);
  assert.equal(out.payload.yearContext.value, 2023);
  assert.equal(out.payload.yearContext.type, 'model-year-family');
});

test('LG C2 returns 2022 as family context without a manufacture-date claim', async () => {
  const handler = createAgeLookupHandler({ localLookup: async () => null, redisFactory: () => redisMiss });
  const out = res();
  await handler(req('LG C2 TV'), out);
  assert.equal(out.payload.yearContext.value, 2022);
  assert.equal(out.payload.yearContext.type, 'model-year-family');
  assert.equal(out.payload.yearContext.isExactUnitDate, false);
  assert.equal(out.payload.individualManufactureYear, null);
  assert.equal(out.payload.manufactureYear, undefined);
});

test('exact LG OLED model returns exact-model context without a unit manufacture year', async () => {
  const handler = createAgeLookupHandler({
    localLookup: async () => { throw new Error('deterministic exact LG recognition should run first'); },
    redisFactory: () => redisMiss,
  });
  const out = res();
  await handler(req('LG OLED65C3PUA'), out);
  assert.equal(out.payload.status, 'partial-success');
  assert.equal(out.payload.outcome, 'exact-model-year-context');
  assert.equal(out.payload.resultType, 'exact-model-insufficient');
  assert.equal(out.payload.brand, 'LG');
  assert.equal(out.payload.model, 'OLED65C3PUA');
  assert.equal(out.payload.exactModel, 'OLED65C3PUA');
  assert.equal(out.payload.screenSize, 65);
  assert.equal(out.payload.productFamily, 'C3');
  assert.equal(out.payload.modelYearFamilyYear, 2023);
  assert.equal(out.payload.yearContext.value, 2023);
  assert.equal(out.payload.yearContext.type, 'model-year-family');
  assert.equal(out.payload.yearContext.isExactUnitDate, false);
  assert.equal(out.payload.individualManufactureYear, null);
  assert.equal(out.payload.introductionYear, null);
  assert.match(out.payload.notes, /product family context/i);
});
