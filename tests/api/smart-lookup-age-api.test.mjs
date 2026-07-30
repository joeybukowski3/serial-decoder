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

test('exact-model Smart Lookup consumes the shared normalized evidence service', async () => {
  let sharedCalls = 0;
  let broadProviderCalls = 0;
  const handler = createAgeLookupHandler({
    localLookup: async () => null,
    sharedExactEnabled: true,
    modelEvidenceLookup: async ({ purpose }) => {
      sharedCalls += 1;
      assert.equal(purpose, 'smart_lookup');
      return {
        evidenceVersion: '1',
        requestedIdentity: {
          brand: 'Samsung',
          model: 'ZXCV1234',
          normalizedBrand: 'samsung',
          normalizedModel: 'ZXCV1234',
        },
        matchedIdentity: {
          model: 'ZXCV1234',
          normalizedModel: 'ZXCV1234',
          matchType: 'exact',
          deterministicExact: true,
        },
        facts: [{
          source: {
            url: 'https://manufacturer.example/ZXCV1234',
            domain: 'manufacturer.example',
            title: 'ZXCV1234 production history',
            sourceType: 'manufacturer',
            resultIndex: 0,
          },
          fact: {
            eventType: 'production_start',
            year: 2019,
            precision: 'year',
            target: 'model_lifecycle',
            claim: 'Production began in 2019.',
          },
          identity: {
            deterministicMatchType: 'exact',
            suggestedMatchType: 'exact',
            effectiveMatchType: 'exact',
          },
          extraction: { provider: 'gemini', model: 'test-model', confidence: 'high' },
        }, {
          source: {
            url: 'https://manufacturer.example/ZXCV1234-end',
            domain: 'manufacturer.example',
            title: 'ZXCV1234 production end',
            sourceType: 'manufacturer',
            resultIndex: 1,
          },
          fact: {
            eventType: 'production_end',
            year: 2022,
            precision: 'year',
            target: 'model_lifecycle',
            claim: 'Production ended in 2022.',
          },
          identity: {
            deterministicMatchType: 'exact',
            suggestedMatchType: 'exact',
            effectiveMatchType: 'exact',
          },
          extraction: { provider: 'gemini', model: 'test-model', confidence: 'high' },
        }],
        lifecycle: {
          supportedProductionStartYear: 2019,
          supportedProductionEndYear: 2022,
          supportedDiscontinuationYear: null,
        },
        status: 'success',
        failureCategory: null,
        providerSummary: {
          localUsed: false,
          serperUsed: true,
          extractorUsed: true,
          searchCount: 1,
        },
        timings: { localMs: 0, searchMs: 1, extractionMs: 1, totalMs: 2 },
      };
    },
    providerLookup: async () => {
      broadProviderCalls += 1;
      throw new Error('broad provider should not run');
    },
    redisFactory: () => redisMiss,
    rateLimiterFactory: () => ({ limit: async () => ({ success: true }) }),
    reserveProviderBudget: async () => ({ allowed: true, status: 'allowed' }),
    recordProviderAttemptMetrics: async () => ({ status: 'recorded', actualProviderAttemptCount: 2 }),
  });
  const out = res();

  await handler(req('Samsung ZXCV1234 refrigerator'), out);

  assert.equal(out.statusCode, 200);
  assert.equal(sharedCalls, 1);
  assert.equal(broadProviderCalls, 0);
  assert.equal(out.payload.source, 'serper');
  assert.equal(out.payload.evidenceSource, 'serper-extracted');
  assert.deepEqual(out.payload.productionRange, {
    start: 2019,
    end: 2022,
    basis: 'exact-model-lifecycle-evidence',
  });
  assert.equal(out.payload.individualManufactureYear, null);
});

test('shared exact-model Serper research remains disabled by default', async () => {
  let sharedCalls = 0;
  let providerCalls = 0;
  const handler = createAgeLookupHandler({
    env: {
      SERPER_API_KEY: 'configured-but-not-enabled',
      GEMINI_API_KEY: 'configured-but-not-enabled',
    },
    localLookup: async () => null,
    modelEvidenceLookup: async () => {
      sharedCalls += 1;
      throw new Error('shared evidence should stay disabled');
    },
    providerLookup: async () => {
      providerCalls += 1;
      return {
        brand: 'Samsung',
        model: 'ZXCV1234',
        specificityLevel: 'specific',
        introductionYear: 2019,
      };
    },
    redisFactory: () => redisMiss,
    rateLimiterFactory: () => ({ limit: async () => ({ success: true }) }),
    reserveProviderBudget: async () => ({ allowed: true, status: 'allowed' }),
    recordProviderAttemptMetrics: async () => ({ status: 'recorded', actualProviderAttemptCount: 1 }),
  });
  const out = res();

  await handler(req('Samsung ZXCV1234 refrigerator'), out);

  assert.equal(out.statusCode, 200);
  assert.equal(sharedCalls, 0);
  assert.equal(providerCalls, 1);
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
    providerLookup: async () => withProviderMetadata({ brand: 'Samsung', model: 'QN65Q80A', introductionYear: 2020, productionRange: { start: 2021, end: 2021 } }, { provider: 'xai', fallbackUsed: true, model: 'grok-test-model' }),
  });
  const out = res();
  await handler(req('Samsung QN65-Q80A'), out);
  assert.equal(out.payload.fallbackUsed, true);
  assert.equal(out.payload.source, 'xai');
  assert.equal(out.payload.evidenceSource, 'xai-ungrounded');
  assert.equal(out.payload.providerModel, 'grok-test-model');
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

test('ordinary four-digit HVAC query text never enters the serial-date shortcut', async () => {
  let providerCalls = 0;
  const handler = createAgeLookupHandler({
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    providerLookup: async (queryInfo) => {
      providerCalls += 1;
      return {
        brand: queryInfo.brand || 'Unknown',
        model: queryInfo.modelIdentity || null,
        likelyProduct: [queryInfo.brand, queryInfo.modelIdentity || queryInfo.genericCategory].filter(Boolean).join(' '),
        identityConfidence: 'medium',
        notes: 'Model-level research only.',
      };
    },
  });

  for (const query of [
    'Trane XR14 2019',
    'Goodman furnace installed 2015',
    'Carrier HVAC replaced in 2020',
    'Rheem water heater model 2018',
  ]) {
    const out = res();
    await handler(req(query), out);
    assert.equal(out.statusCode, 200, query);
    assert.equal(out.payload.individualManufactureYear, null, query);
    assert.equal(out.payload.estimatedYearType, null, query);
    assert.equal(out.payload.serialRule, null, query);
    assert.equal(out.payload.serialDetected, null, query);
    assert.doesNotMatch(out.payload.notes || '', /\bweek\s+\d{1,2}\b|WWYY|YYMM/i, query);
  }
  assert.equal(providerCalls, 4);
});

test('explicit HVAC serial preserves century candidates and asks for model-era refinement', async () => {
  let providerCalls = 0;
  const currentYear = new Date().getFullYear();
  const nextTwoDigits = String((currentYear + 1) % 100).padStart(2, '0');
  const serial = `20${nextTwoDigits}`;
  const handler = createAgeLookupHandler({
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    providerLookup: async () => { providerCalls += 1; throw new Error('provider should not run'); },
  });
  const out = res();
  await handler(req(`Trane serial ${serial}`), out);

  assert.equal(out.statusCode, 200);
  assert.equal(out.payload.individualManufactureYear, null);
  assert.equal(out.payload.estimatedYear, null);
  assert.equal(out.payload.manufactureDateAmbiguous, true);
  assert.deepEqual(out.payload.manufactureYearCandidates, [
    1900 + Number(nextTwoDigits),
    2000 + Number(nextTwoDigits),
  ]);
  assert.deepEqual(out.payload.serialDetected, { token: serial, action: 'use-decoder' });
  assert.match(out.payload.notes, /repeats by century/i);
  assert.match(out.payload.refinementSuggestion, /complete model number|model-era evidence/i);
  assert.equal(providerCalls, 0);
});

test('explicit Goodman HVAC serial still recognizes its supported YYMM pattern without false precision', async () => {
  const handler = createAgeLookupHandler({
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    providerLookup: async () => { throw new Error('provider should not run'); },
  });
  const out = res();
  await handler(req('Goodman serial 1404123456'), out);

  assert.equal(out.payload.brand, 'Goodman');
  assert.deepEqual(out.payload.manufactureYearCandidates, [1914, 2014]);
  assert.equal(out.payload.manufactureDateAmbiguous, true);
  assert.equal(out.payload.individualManufactureYear, null);
  assert.match(out.payload.notes, /April.*YYMM/i);
});

test('an explicit Rheem water-heater serial does not enter the HVAC shortcut', async () => {
  let providerCalls = 0;
  const handler = createAgeLookupHandler({
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    providerLookup: async () => {
      providerCalls += 1;
      return {
        brand: 'Rheem',
        likelyProduct: 'Rheem water heater',
        productType: 'water heater',
        identityConfidence: 'medium',
        notes: 'Model-level water-heater research only.',
      };
    },
  });
  const out = res();
  await handler(req('Rheem water heater serial X4502XXXX'), out);

  assert.equal(out.payload.individualManufactureYear, null);
  assert.deepEqual(out.payload.manufactureYearCandidates, []);
  assert.equal(out.payload.serialRule, null);
  assert.deepEqual(out.payload.serialDetected, { token: 'X4502XXXX', action: 'use-decoder' });
  assert.equal(providerCalls, 1);
});

test('serial-bearing model queries preserve roles and cannot be spoofed by provider output', async () => {
  const seen = [];
  const handler = createAgeLookupHandler({
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    providerLookup: async (queryInfo) => {
      seen.push(queryInfo);
      const brand = queryInfo.brand || (queryInfo.modelIdentity === 'WM3900HWA' ? 'LG' : 'GE');
      return {
        brand,
        model: queryInfo.modelIdentity || null,
        likelyProduct: `${brand} researched product`,
        identityConfidence: 'high',
        introductionYear: 2019,
        individualManufactureYear: 2014,
        serialDetected: { token: 'PROVIDER-SPOOF', action: 'decoded' },
        serialRule: 'Provider-invented serial format.',
        serialLocation: 'Provider-invented serial location.',
        notes: 'Model-level research result.',
      };
    },
  });

  const cases = [
    ['serial FR31424IN model GFW850SPN0DG', 'GFW850SPN0DG', 'FR31424IN'],
    ['model: WM3900HWA serial: 902KWXXXX', 'WM3900HWA', '902KWXXXX'],
    ['s/n ABC1234567 Samsung TV', '', 'ABC1234567'],
  ];
  for (const [query, model, serial] of cases) {
    const out = res();
    await handler(req(query), out);
    assert.equal(out.statusCode, 200, query);
    assert.equal(out.payload.model || '', model, query);
    assert.deepEqual(out.payload.serialDetected, { token: serial, action: 'use-decoder' }, query);
    assert.equal(out.payload.individualManufactureYear, null, query);
    assert.equal(out.payload.serialRule, null, query);
    assert.equal(out.payload.serialLocation, null, query);
    assert.equal(out.payload.introductionYear, 2019, 'model-level research remains available');
  }
  assert.equal(seen.length, 3);
  for (const queryInfo of seen) {
    assert.ok(queryInfo.serialIdentity);
    assert.doesNotMatch(queryInfo.providerQuery, new RegExp(queryInfo.serialIdentity, 'i'));
  }
});

test('serial-only input returns decoder guidance without provider decoding', async () => {
  let providerCalls = 0;
  const handler = createAgeLookupHandler({
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    providerLookup: async () => { providerCalls += 1; return {}; },
  });
  const out = res();
  await handler(req('serial number 12345678'), out);

  assert.deepEqual(out.payload.serialDetected, { token: '12345678', action: 'use-decoder' });
  assert.equal(out.payload.individualManufactureYear, null);
  assert.equal(out.payload.estimatedYear, null);
  assert.match(out.payload.refinementSuggestion, /Serial Number Decoder/i);
  assert.equal(providerCalls, 0);
});

test('Dell service tag is not treated as a model number or sent to a provider', async () => {
  let providerCalls = 0;
  const handler = createAgeLookupHandler({
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    providerLookup: async () => { providerCalls += 1; return {}; },
  });
  const out = res();
  await handler(req('Dell service tag JX2K9P1'), out);

  assert.equal(out.payload.brand, 'Dell');
  assert.equal(out.payload.model, null);
  assert.equal(out.payload.individualManufactureYear, null);
  assert.match(out.payload.notes, /service or asset tag.*not a model number/i);
  assert.equal(providerCalls, 0);
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
