import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgeLookupHandler } from '../../api/age-lookup.js';

function req(query) { return { method: 'POST', body: { query }, headers: { 'x-forwarded-for': '127.0.0.1' }, socket: {} }; }
function res() {
  return { statusCode: 0, payload: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; return this; }, setHeader() {} };
}

const redisMiss = { get: async () => null, set: async () => {} };

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
