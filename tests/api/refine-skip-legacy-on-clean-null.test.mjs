import test from 'node:test';
import assert from 'node:assert/strict';

import { createRefineSerialDateHandler, isSkipLegacyOnCleanNullEnabled } from '../../api/refine-serial-date.js';
import { recordProviderAttempt } from '../../lib/smart-lookup/provider-attempts.js';
import { buildUsageReport, summarizeUsage } from '../../lib/smart-lookup/provider-usage.js';
import { allowingRateLimiter } from '../helpers/allowing-rate-limiter.mjs';

/**
 * MODEL_REFINEMENT_SKIP_LEGACY_ON_CLEAN_NULL: when native research ran
 * normally but produced nothing to apply (INSUFFICIENT / NO_NARROWING), the
 * legacy gemini-2.5-flash grounded chain is not called. Everything else about
 * the legacy fallback is unchanged.
 */

function createResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; },
  };
}

function request() {
  return {
    method: 'POST',
    headers: { 'x-request-id': 'req-skip-legacy', 'x-forwarded-for': '203.0.113.90' },
    body: {
      brand: 'Whirlpool',
      category: 'appliances',
      serial: 'TRD3481274',
      model: 'WMH31017HS12',
      candidateYears: [1994, 2012, 2024],
      decodedMonth: 'Week 48',
      context: '',
    },
  };
}

/** In-memory Redis: counts usage events, never serves a cache hit. */
function createFakeRedis() {
  const hash = {};
  return {
    hash,
    get: async () => null,
    set: async () => 'OK',
    hincrby: async (_key, field, amount) => { hash[field] = (hash[field] || 0) + amount; return hash[field]; },
    expire: async () => 1,
  };
}

const insufficientNative = async () => ({ usable: false, evidence: [] });
// Usable research with a bound that removes no candidate and gives no start year.
const noNarrowingNative = async () => ({
  usable: true,
  range: { start: null, end: 2030 },
  upperBoundApplied: true,
  precision: 'exact_model',
  confidence: 'high',
  evidence: [],
});
const erroringNative = async () => {
  throw Object.assign(new Error('unusable'), { code: 'PROVIDER_UNUSABLE_OUTPUT' });
};

function makeContext({ flag, native = insufficientNative, nativeEnabled = true, overrides = {} } = {}) {
  const lines = [];
  const usageCalls = [];
  const redis = createFakeRedis();
  const calls = { legacy: 0 };
  const handler = createRefineSerialDateHandler({
    skipLegacyOnCleanNull: flag,
    nativeModelResearchEnabled: nativeEnabled,
    nativeModelResearchLookup: native,
    // A real legacy chain records its own provider attempt; emulate that so
    // "no extra attempts" is observable.
    legacyProviderLookup: async () => {
      calls.legacy += 1;
      await recordProviderAttempt({ provider: 'gemini', model: 'gemini-2.5-flash', providerStatus: 'ok', inputTokens: 300, outputTokens: 80 });
      return { evidence: [] };
    },
    localLookup: async () => ({ evidence: [], normalization: null }),
    modelProductionLookup: async () => null,
    redisFactory: () => redis,
    rateLimitFactory: () => allowingRateLimiter,
    geminiCooldown: { isActive: async () => false, mark: async () => 60 },
    recordProviderUsage: async (_redis, attempt) => { usageCalls.push(attempt); return true; },
    logger: { info: (line) => lines.push(line), error() {}, warn() {} },
    ...overrides,
  });
  const refinementEvent = () => lines
    .map((line) => { try { return JSON.parse(line); } catch (_) { return null; } })
    .filter((event) => event?.event === 'serial_refinement')
    .at(-1);
  return { handler, calls, redis, usageCalls, refinementEvent };
}

async function run(ctx) {
  const res = createResponse();
  await ctx.handler(request(), res);
  return res;
}

const event = (ctx, name) => ctx.redis.hash[`refine|event:${name}`] ?? 0;

test('the flag is OFF unless explicitly enabled', () => {
  assert.equal(isSkipLegacyOnCleanNullEnabled({}), false);
  assert.equal(isSkipLegacyOnCleanNullEnabled({ MODEL_REFINEMENT_SKIP_LEGACY_ON_CLEAN_NULL: 'false' }), false);
  assert.equal(isSkipLegacyOnCleanNullEnabled({ MODEL_REFINEMENT_SKIP_LEGACY_ON_CLEAN_NULL: '1' }), true);
  assert.equal(isSkipLegacyOnCleanNullEnabled({ MODEL_REFINEMENT_SKIP_LEGACY_ON_CLEAN_NULL: 'true' }), true);
});

test('flag OFF: a clean-null native result still calls the legacy chain (current behavior)', async () => {
  for (const native of [insufficientNative, noNarrowingNative]) {
    const ctx = makeContext({ flag: false, native });
    const res = await run(ctx);

    assert.equal(ctx.calls.legacy, 1);
    assert.equal(res.payload.provider, 'gemini-google-search');
    assert.equal(res.payload.failureStage, 'legacy_gemini_insufficient');
    assert.equal(event(ctx, 'legacy_called_clean_null'), 1);
    assert.equal(event(ctx, 'legacy_skipped_clean_null'), 0);
  }
});

test('flag ON + NATIVE_RESEARCH_INSUFFICIENT skips the legacy chain', async () => {
  const ctx = makeContext({ flag: true, native: insufficientNative });
  const res = await run(ctx);

  assert.equal(ctx.calls.legacy, 0);
  assert.equal(ctx.refinementEvent().nativeResearchFailureCode, 'NATIVE_RESEARCH_INSUFFICIENT');
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.status, 'unavailable');
  assert.equal(event(ctx, 'legacy_skipped_clean_null'), 1);
  assert.equal(event(ctx, 'legacy_called_clean_null'), 0);
  assert.equal(event(ctx, 'legacy_called_native_error'), 0);
  assert.equal(event(ctx, 'legacy_called_other'), 0);
});

test('flag ON + NATIVE_RESEARCH_NO_NARROWING skips the legacy chain', async () => {
  const ctx = makeContext({ flag: true, native: noNarrowingNative });
  const res = await run(ctx);

  assert.equal(ctx.calls.legacy, 0);
  assert.equal(ctx.refinementEvent().nativeResearchFailureCode, 'NATIVE_RESEARCH_NO_NARROWING');
  assert.equal(res.payload.status, 'unavailable');
  assert.equal(event(ctx, 'legacy_skipped_clean_null'), 1);
});

test('flag ON + a native ERROR still calls the legacy chain', async () => {
  const ctx = makeContext({ flag: true, native: erroringNative });
  const res = await run(ctx);

  assert.equal(ctx.calls.legacy, 1);
  assert.equal(ctx.refinementEvent().nativeResearchFailureCode, 'PROVIDER_UNUSABLE_OUTPUT');
  assert.equal(res.payload.provider, 'gemini-google-search');
  assert.equal(event(ctx, 'legacy_called_native_error'), 1);
  assert.equal(event(ctx, 'legacy_skipped_clean_null'), 0);
});

test('flag ON + native research disabled still calls the legacy chain', async () => {
  const ctx = makeContext({ flag: true, nativeEnabled: false });
  await run(ctx);

  assert.equal(ctx.calls.legacy, 1);
  assert.equal(event(ctx, 'legacy_called_other'), 1);
  assert.equal(event(ctx, 'legacy_skipped_clean_null'), 0);
});

test('flag ON + an active Gemini cooldown (native not attempted) still calls the legacy chain', async () => {
  const ctx = makeContext({
    flag: true,
    overrides: { geminiCooldown: { isActive: async () => true, mark: async () => 60 } },
  });
  await run(ctx);

  assert.equal(ctx.calls.legacy, 1);
  assert.equal(event(ctx, 'legacy_called_other'), 1);
});

test('a successful native result never reaches the legacy chain or the legacy counters', async () => {
  const ctx = makeContext({
    flag: true,
    native: async () => ({
      usable: true,
      range: { start: 2023, end: 2025 },
      upperBoundApplied: true,
      precision: 'exact_model',
      confidence: 'high',
      refinementConfidence: 'medium',
      evidence: [],
    }),
  });
  const res = await run(ctx);

  assert.equal(res.payload.status, 'resolved');
  assert.equal(res.payload.chosenYear, 2024);
  assert.equal(ctx.calls.legacy, 0);
  for (const name of ['legacy_skipped_clean_null', 'legacy_called_clean_null', 'legacy_called_native_error', 'legacy_called_other']) {
    assert.equal(event(ctx, name), 0, name);
  }
});

// Fields that legitimately differ because the legacy chain did / did not run.
const LEGACY_ONLY_FIELDS = ['provider', 'failureStage', 'timings', 'cost', 'cacheStatus'];
// The legacy "insufficient" branch also re-lists local evidence it was handed
// and labels the basis as grounded-or-local, so those two are legacy-only too.
const LEGACY_LABEL_FIELDS = ['estimateBasis', 'evidence'];
const without = (payload, fields) => Object.fromEntries(
  Object.entries(payload).filter(([key]) => !fields.includes(key)),
);
const withoutLegacyOnly = (payload) => without(payload, LEGACY_ONLY_FIELDS);

test('the skipped response matches the existing bestAvailable fallback (no local evidence)', async () => {
  const skipped = await run(makeContext({ flag: true }));
  const legacyInsufficient = await run(makeContext({ flag: false }));

  assert.deepEqual(withoutLegacyOnly(skipped.payload), withoutLegacyOnly(legacyInsufficient.payload));
  assert.equal(skipped.payload.status, 'unavailable');
  assert.equal(skipped.payload.errorCode, 'INSUFFICIENT_EVIDENCE');
  assert.equal(skipped.payload.failureCategory, 'extraction_no_usable_facts');
  assert.equal(skipped.payload.chosenYear, null);
  assert.deepEqual(skipped.payload.candidateYears, [1994, 2012, 2024]);
  assert.deepEqual(skipped.payload.remainingCandidateYears, [1994, 2012, 2024]);
});

test('the skipped response matches the existing bestAvailable fallback (local model-era ranks)', async () => {
  const overrides = {
    modelProductionLookup: async () => ({
      narrowedYears: [2012, 2024],
      confidence: 'medium',
      source: 'Local model production database',
      sourceUrl: null,
      productionStartYear: 2011,
      matchedModel: 'WMH31017HS12',
      matchType: 'exact',
    }),
  };
  const skipped = await run(makeContext({ flag: true, overrides }));
  const legacyInsufficient = await run(makeContext({ flag: false, overrides }));

  assert.deepEqual(
    without(skipped.payload, [...LEGACY_ONLY_FIELDS, ...LEGACY_LABEL_FIELDS]),
    without(legacyInsufficient.payload, [...LEGACY_ONLY_FIELDS, ...LEGACY_LABEL_FIELDS]),
  );
  assert.equal(skipped.payload.status, 'ranked');
  assert.equal(skipped.payload.preferredCandidateYear, 2012);
  assert.equal(skipped.payload.estimateBasis, 'local-model-era');
  assert.equal(skipped.payload.evidence.length, 1, 'local evidence listed once');
});

test('a skipped request records no legacy provider attempt, tokens or usage', async () => {
  const skipped = makeContext({ flag: true });
  await run(skipped);
  const legacy = makeContext({ flag: false });
  await run(legacy);

  const skippedEvent = skipped.refinementEvent();
  const legacyEvent = legacy.refinementEvent();
  assert.equal(skippedEvent.cost.providerAttemptCount, 1, 'only the native attempt');
  assert.equal(skippedEvent.geminiAttemptCount, 1);
  assert.equal(legacyEvent.cost.providerAttemptCount, 2, 'native + the legacy chain attempt');
  assert.equal(skippedEvent.attemptModels.includes('gemini-2.5-flash'), false);
  assert.equal(skippedEvent.inputTokens, 0);
  assert.equal(skipped.usageCalls.length, 1);
  assert.equal(skipped.usageCalls.some((attempt) => attempt.model === 'gemini-2.5-flash'), false);
  assert.equal(
    Object.keys(skipped.redis.hash).some((field) => field.includes('gemini-2.5-flash')),
    false,
    'no usage fields for the legacy model',
  );
});

test('the new events are annotations: they do not change the refinement-rate denominator', () => {
  const base = { 'refine|event:paid_lookup': 2, 'refine|event:cache_hit': 2 };
  const withLegacy = {
    ...base,
    'refine|event:legacy_skipped_clean_null': 5,
    'refine|event:legacy_called_clean_null': 5,
    'refine|event:legacy_called_native_error': 5,
    'refine|event:legacy_called_other': 5,
  };
  const rate = (hash) => buildUsageReport(summarizeUsage(hash)).routes;
  // buildUsageReport only emits routes that have provider rows; add one.
  const row = { 'refine|gemini|gemini-3.5-flash-lite|calls': 1 };
  const [before] = rate({ ...base, ...row });
  const [after] = rate({ ...withLegacy, ...row });
  assert.equal(after.refineRequestsCounted, before.refineRequestsCounted);
  assert.equal(after.refinementRate, before.refinementRate);
});
