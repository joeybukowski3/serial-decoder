import test from 'node:test';
import assert from 'node:assert/strict';

import { createRefineSerialDateHandler } from '../../api/refine-serial-date.js';
import { GeminiSearchProviderError } from '../../lib/smart-lookup/gemini-search-provider.js';
import { recordProviderAttempt } from '../../lib/smart-lookup/provider-attempts.js';
import { callSerialRefinementProvider } from '../../lib/serial-refinement/provider.js';
import { createDeadline } from '../../lib/smart-lookup/deadline.js';
import { allowingRateLimiter } from '../helpers/allowing-rate-limiter.mjs';

/**
 * Cost-control behavior of /api/refine-serial-date: when paid research is
 * skipped, what a Gemini 429 does, cooldown, attempt accounting, and the
 * retry/background telemetry flag.
 */

function createResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; },
  };
}

function request(overrides = {}) {
  return {
    method: 'POST',
    headers: { 'x-request-id': 'req-refine-1', 'x-forwarded-for': '203.0.113.77' },
    body: {
      brand: 'Whirlpool',
      category: 'appliances',
      serial: 'TRD3481274',
      model: 'WMH31017HS12',
      candidateYears: [1994, 2012, 2024],
      decodedMonth: 'Week 48',
      context: '',
      ...overrides,
    },
  };
}

function official(start, end) {
  return [{
    type: 'local-db', title: 'Verified local evidence', quality: 'official', verified: true,
    productionStart: start, productionEnd: end, supports: 'Verified model production window.',
  }];
}

function secondary(start, end) {
  return ['Source A', 'Source B'].map((name) => ({
    type: 'web', title: name, sourceName: name, sourceUrl: `https://${name.replace(' ', '-').toLowerCase()}.example/page`,
    quality: 'strong-secondary', productionStart: start, productionEnd: end, supports: 'Independent source.',
  }));
}

function makeContext(overrides = {}) {
  const lines = [];
  const calls = { native: 0, legacy: 0 };
  const legacyOptions = [];
  const handler = createRefineSerialDateHandler({
    rateLimitFactory: () => allowingRateLimiter,
    localLookup: async () => ({ evidence: [], normalization: null }),
    modelProductionLookup: async () => null,
    nativeModelResearchEnabled: false,
    legacyProviderLookup: async (_input, options) => {
      calls.legacy += 1;
      legacyOptions.push(options);
      return { evidence: [] };
    },
    nativeModelResearchLookup: async () => { calls.native += 1; return null; },
    logger: { info: (line) => lines.push(line), error() {}, warn() {} },
    ...overrides,
  });
  const events = () => lines.map((line) => { try { return JSON.parse(line); } catch (_) { return null; } }).filter(Boolean);
  return {
    handler,
    calls,
    legacyOptions,
    lines,
    refinementEvent: () => events().filter((event) => event.event === 'serial_refinement').at(-1),
    attemptEvents: () => events().filter((event) => event.event === 'provider_attempt'),
  };
}

// --------------------------------------------------------------------------
// Refinement gate: paid research only where it can add value
// --------------------------------------------------------------------------

test('a high-confidence CLOSED local window that leaves several candidates does not trigger paid refinement', async () => {
  const ctx = makeContext({
    localLookup: async () => ({ evidence: official(2010, 2025), normalization: null }),
    nativeModelResearchEnabled: true,
  });
  const res = createResponse();
  await ctx.handler(request(), res);

  assert.equal(ctx.calls.native, 0, 'no native Gemini research');
  assert.equal(ctx.calls.legacy, 0, 'no legacy Gemini research');
  assert.equal(ctx.attemptEvents().length, 0);
  assert.notEqual(res.payload.status, 'unavailable');
  assert.deepEqual(res.payload.remainingCandidateYears, [2012, 2024]);
  assert.equal(ctx.refinementEvent().refinementGateSkipReason, 'local_high_confidence');
  assert.equal(ctx.refinementEvent().providerAttemptCount ?? ctx.refinementEvent().cost?.providerAttemptCount, 0);
});

test('a single serial-valid candidate never triggers paid refinement', async () => {
  const ctx = makeContext({ nativeModelResearchEnabled: true });
  const res = createResponse();
  await ctx.handler(request({ candidateYears: [2024] }), res);

  assert.equal(ctx.calls.native + ctx.calls.legacy, 0);
  assert.equal(res.payload.status, 'resolved');
  assert.equal(res.payload.chosenYear, 2024);
  assert.equal(ctx.refinementEvent().refinementGateSkipReason, 'single_candidate');
});

test('an ambiguous decode with no local evidence DOES trigger refinement', async () => {
  const ctx = makeContext();
  const res = createResponse();
  await ctx.handler(request(), res);

  assert.equal(ctx.calls.legacy, 1);
  assert.equal(ctx.refinementEvent().refinementGateSkipReason, null);
});

test('an OPEN-ended high-confidence range still triggers refinement (research can find a production end)', async () => {
  const ctx = makeContext({
    localLookup: async () => ({ evidence: official(2010, null), normalization: null }),
  });
  await ctx.handler(request(), createResponse());
  assert.equal(ctx.calls.legacy, 1);
});

test('weak/medium-confidence local evidence still triggers refinement', async () => {
  const ctx = makeContext({
    localLookup: async () => ({ evidence: secondary(2010, 2025), normalization: null }),
  });
  await ctx.handler(request(), createResponse());
  assert.equal(ctx.calls.legacy, 1);
});

test('local evidence that already resolves the decode never reaches a provider (unchanged behavior)', async () => {
  const ctx = makeContext({
    localLookup: async () => ({ evidence: official(2023, 2025), normalization: null }),
    nativeModelResearchEnabled: true,
  });
  const res = createResponse();
  await ctx.handler(request({ candidateYears: [1994, 2024] }), res);

  assert.equal(res.payload.status, 'resolved');
  assert.equal(ctx.calls.native + ctx.calls.legacy, 0);
});

// --------------------------------------------------------------------------
// Gemini 429: no second Gemini request in the same refinement
// --------------------------------------------------------------------------

test('a native Gemini 429 stops further Gemini use: the legacy chain is told Gemini is rate limited', async () => {
  const cooldowns = [];
  const ctx = makeContext({
    nativeModelResearchEnabled: true,
    nativeModelResearchLookup: async () => {
      throw new GeminiSearchProviderError('PROVIDER_RATE_LIMIT', 'rate limited', { status: 429, retryable: true });
    },
    geminiCooldown: {
      isActive: async () => false,
      mark: async (_redis, _deadline, options) => { cooldowns.push(options); return 60; },
    },
  });
  const res = createResponse();
  await ctx.handler(request(), res);

  assert.equal(ctx.legacyOptions.length, 1);
  assert.equal(ctx.legacyOptions[0].geminiRateLimited, true, 'legacy Gemini research must not run after a 429');
  assert.equal(cooldowns.length, 1, 'the 429 starts the shared cooldown');
  assert.equal(ctx.refinementEvent().nativeResearchFailureCode, 'PROVIDER_RATE_LIMIT');
});

test('an active cooldown skips native Gemini entirely and forwards the signal to the legacy chain', async () => {
  const ctx = makeContext({
    nativeModelResearchEnabled: true,
    geminiCooldown: { isActive: async () => true, mark: async () => 60 },
  });
  await ctx.handler(request(), createResponse());

  assert.equal(ctx.calls.native, 0);
  assert.equal(ctx.legacyOptions[0].geminiRateLimited, true);
  assert.equal(ctx.refinementEvent().geminiCooldownActive, true);
});

test('when the provider chain fails after a 429 the response says PROVIDER_RATE_LIMIT, not a generic failure', async () => {
  const ctx = makeContext({
    nativeModelResearchEnabled: true,
    nativeModelResearchLookup: async () => {
      throw new GeminiSearchProviderError('PROVIDER_RATE_LIMIT', 'rate limited', { status: 429 });
    },
    legacyProviderLookup: async () => { throw Object.assign(new Error('GROQ_NOT_CONFIGURED'), { code: 'GROQ_NOT_CONFIGURED' }); },
    geminiCooldown: { isActive: async () => false, mark: async () => 60 },
  });
  const res = createResponse();
  await ctx.handler(request(), res);

  assert.equal(res.payload.errorCode, 'PROVIDER_RATE_LIMIT');
  assert.equal(res.payload.failureCategory, 'search_rate_limited');
  assert.deepEqual(res.payload.candidateYears, [1994, 2012, 2024], 'serial candidates are preserved');
});

test('REAL provider chain: a grounded-search 429 makes no second Gemini request and uses Groq only', async () => {
  const fetched = [];
  const fetchImpl = async (url) => {
    const target = String(url);
    fetched.push(target.includes('api.groq.com') ? 'groq' : (target.match(/models\/([^:]+):/) || [])[1]);
    if (target.includes('api.groq.com')) {
      return {
        ok: true, status: 200, headers: { get: () => null },
        async json() {
          return {
            choices: [{ message: { content: JSON.stringify({
              brand: 'Whirlpool', model: 'WMH31017HS12', category: 'washer', specificityLevel: 'specific',
              introductionYear: 2012, productionRange: { start: 2012, end: 2020 }, identityConfidence: 'high', summary: 'ok',
            }) } }],
            usage: { prompt_tokens: 50, completion_tokens: 20 },
          };
        },
      };
    }
    return { ok: false, status: 429, headers: { get: () => null }, async json() { return {}; } };
  };

  try {
    await callSerialRefinementProvider(
      { brand: 'Whirlpool', model: 'WMH31017HS12', category: 'appliances', candidateYears: [1994, 2012, 2024] },
      {
        fetchImpl,
        apiKey: 'test-gemini-key',
        groqApiKey: 'test-groq-key',
        env: {},
        smartLocalLookup: async () => null,
        deadline: createDeadline({ totalMs: 8000 }),
      },
    );
  } catch (_) { /* the outcome is irrelevant; the request pattern is what matters */ }

  const geminiRequests = fetched.filter((name) => name && name.startsWith('gemini'));
  assert.equal(geminiRequests.length, 1, `exactly one Gemini request, got ${JSON.stringify(fetched)}`);
  assert.equal(fetched.filter((name) => name === 'groq').length, 1, 'Groq is the only fallback');
});

// --------------------------------------------------------------------------
// Attempt accounting, trigger flag, fail-closed store
// --------------------------------------------------------------------------

test('attempt counts include a failed native call plus the legacy chain\'s own recorded attempts', async () => {
  const ctx = makeContext({
    nativeModelResearchEnabled: true,
    nativeModelResearchLookup: async () => {
      throw new GeminiSearchProviderError('PROVIDER_UNUSABLE_OUTPUT', 'unusable', {});
    },
    // A real legacy chain records its own attempts; emulate that here.
    legacyProviderLookup: async () => {
      await recordProviderAttempt({ provider: 'gemini', model: 'gemini-2.5-flash', providerStatus: 'ok', inputTokens: 300, outputTokens: 80 });
      return { evidence: [] };
    },
  });
  await ctx.handler(request(), createResponse());

  const event = ctx.refinementEvent();
  assert.equal(event.geminiAttemptCount, 2, 'failed native (malformed) + legacy attempt');
  assert.equal(event.cost.providerAttemptCount, 2);
  assert.deepEqual(event.attemptModels.includes('gemini-2.5-flash'), true);
  assert.equal(event.inputTokens, 300);
  const attempts = ctx.attemptEvents();
  assert.deepEqual(attempts.map((a) => a.attemptNumber), [1, 2]);
  assert.equal(attempts[0].providerStatus, 'malformed');
  assert.equal(attempts.every((a) => a.route === 'refine'), true);
});

test('provider_attempt lines identify the background refinement, hash only the model, and never log the serial', async () => {
  const ctx = makeContext({
    nativeModelResearchEnabled: true,
    nativeModelResearchLookup: async () => { throw new GeminiSearchProviderError('PROVIDER_TIMEOUT', 'slow', {}); },
  });
  await ctx.handler(request(), createResponse());

  const [attempt] = ctx.attemptEvents();
  assert.equal(attempt.backgroundRefinementTriggered, true);
  assert.equal(attempt.refinementTrigger, 'background');
  assert.match(attempt.queryHash, /^[0-9a-f]{16}$/);
  const everything = ctx.lines.join('\n');
  assert.equal(everything.includes('TRD3481274'), false, 'serial must never be logged');
  assert.equal(everything.includes('203.0.113.77'), false, 'full IP must never be logged');
});

test('a Retry press is distinguishable from the automatic background refinement', async () => {
  const ctx = makeContext();
  await ctx.handler(request({ trigger: 'retry' }), createResponse());

  const event = ctx.refinementEvent();
  assert.equal(event.refinementTrigger, 'retry');
  assert.equal(event.backgroundRefinementTriggered, false);

  const auto = makeContext();
  await auto.handler(request(), createResponse());
  assert.equal(auto.refinementEvent().backgroundRefinementTriggered, true);

  const bogus = makeContext();
  await bogus.handler(request({ trigger: 'something-else' }), createResponse());
  assert.equal(bogus.refinementEvent().refinementTrigger, 'background');
});

test('a limiter store outage prevents the paid call; local narrowing still works', async () => {
  const ctx = makeContext({
    nativeModelResearchEnabled: true,
    rateLimitFactory: () => ({ limit: async () => { throw new Error('redis down'); } }),
  });
  const res = createResponse();
  await ctx.handler(request(), res);

  assert.equal(ctx.calls.native + ctx.calls.legacy, 0);
  assert.equal(res.payload.errorCode, 'RATE_LIMIT_STORE_UNAVAILABLE');
  assert.deepEqual(res.payload.candidateYears, [1994, 2012, 2024]);
  assert.equal(ctx.attemptEvents().length, 0);
});
