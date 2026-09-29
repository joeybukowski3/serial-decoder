import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ATTEMPT_STATUS,
  classifyProviderFailure,
  createAttemptRecorder,
  isProviderRateLimitError,
  recordProviderAttempt,
  runWithAttemptRecorder,
  usageFromGemini,
  usageFromOpenAiStyle,
  withAttemptAccounting,
} from '../../lib/smart-lookup/provider-attempts.js';
import {
  buildUsageReport,
  recordProviderUsage,
  recordUsageEvent,
  summarizeUsage,
  usageFieldsForAttempt,
  usageKeyForDate,
} from '../../lib/smart-lookup/provider-usage.js';
import { createGeminiCooldown, resolveCooldownSeconds } from '../../lib/smart-lookup/gemini-cooldown.js';
import { boundedRateLimit } from '../../lib/smart-lookup/redis.js';
import { createDeadline } from '../../lib/smart-lookup/deadline.js';
import { callSmartLookupAgeProvider } from '../../lib/smart-lookup/provider.js';
import { callGeminiSearchProvider } from '../../lib/smart-lookup/gemini-search-provider.js';
import { evaluateRefinementGate } from '../../lib/serial-refinement/refinement-gate.js';

const silent = { info() {}, warn() {}, error() {} };

// ---------------------------------------------------------------- classification

test('provider failures are classified so a 429 is never confused with other failures', () => {
  const cases = [
    [{ status: 429 }, 'rate_limited'],
    [{ code: 'PROVIDER_RATE_LIMIT' }, 'rate_limited'],
    [{ code: 'GROQ_RATE_LIMIT' }, 'rate_limited'],
    [{ code: 'GROUNDING_RATE_LIMIT' }, 'rate_limited'],
    [{ code: 'PROVIDER_5XX', status: 503 }, 'server_error'],
    [{ code: 'PROVIDER_TIMEOUT' }, 'timeout'],
    [{ code: 'STAGE_TIMEOUT' }, 'timeout'],
    [{ name: 'AbortError' }, 'timeout'],
    [{ code: 'PROVIDER_NETWORK_ERROR' }, 'network_error'],
    [{ code: 'PROVIDER_MALFORMED_JSON' }, 'malformed'],
    [{ code: 'PROVIDER_UNUSABLE_OUTPUT' }, 'malformed'],
    [{ code: 'GROUNDING_METADATA_MISSING' }, 'malformed'],
    [{ code: 'PROVIDER_HTTP_ERROR', status: 400 }, 'http_error'],
    [{ code: 'SOMETHING_ELSE' }, 'error'],
  ];
  for (const [error, expected] of cases) {
    assert.equal(classifyProviderFailure(error), expected, JSON.stringify(error));
  }
  assert.equal(isProviderRateLimitError({ code: 'RATE_LIMIT' }), false, 'our own per-IP limiter is not a provider 429');
  assert.equal(isProviderRateLimitError({ code: 'RATE_LIMIT_STORE_UNAVAILABLE' }), false);
});

test('token usage is normalized for Gemini and OpenAI-style payloads, and is null when absent', () => {
  assert.deepEqual(
    usageFromGemini({ usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4, thoughtsTokenCount: 2 } }),
    { inputTokens: 10, outputTokens: 4, thinkingTokens: 2 },
  );
  assert.deepEqual(usageFromGemini({}), { inputTokens: null, outputTokens: null, thinkingTokens: null });
  assert.deepEqual(usageFromOpenAiStyle({ usage: { prompt_tokens: 7, completion_tokens: 3 } }), { inputTokens: 7, outputTokens: 3, thinkingTokens: null });
  assert.deepEqual(usageFromOpenAiStyle({ usage: { input_tokens: 5, output_tokens: 1 } }), { inputTokens: 5, outputTokens: 1, thinkingTokens: null });
});

// ---------------------------------------------------------------- recorder

test('the recorder numbers attempts, summarizes them, and logs only allowlisted fields', async () => {
  const lines = [];
  const recorder = createAttemptRecorder({ route: 'age', requestId: 'r1', logger: { info: (l) => lines.push(l) } });
  recorder.setContext({ queryHash: 'abc123', resultSource: 'provider', cacheStatus: 'miss' });
  await recorder.record({ provider: 'gemini', model: 'm1', providerStatus: 'rate_limited', httpStatus: 429, secretField: 'nope', query: 'raw query' });
  await recorder.record({ provider: 'groq', model: 'm2', providerStatus: 'ok', fallbackReason: 'gemini_rate_limited', inputTokens: 9, outputTokens: 3 });

  assert.deepEqual(recorder.attempts.map((a) => a.attemptNumber), [1, 2]);
  assert.deepEqual(recorder.summary(), {
    attemptCount: 2, geminiAttemptCount: 1, groqAttemptCount: 1, otherAttemptCount: 0,
    providerRateLimitCount: 1, geminiRateLimitCount: 1, fallbackAttemptCount: 1,
    attemptModels: ['m1', 'm2'], inputTokens: 9, outputTokens: 3,
  });
  const first = JSON.parse(lines[0]);
  assert.equal(first.event, 'provider_attempt');
  assert.equal('secretField' in first, false);
  assert.equal('query' in first, false);
  assert.equal(lines.join('').includes('raw query'), false);
});

test('a Gemini 429 fires the cooldown hook immediately; other statuses and providers do not', async () => {
  const recorder = createAttemptRecorder({ route: 'age', logger: silent });
  const seen = [];
  recorder.setGeminiRateLimitHook(async (attempt) => { seen.push(attempt.retryAfterSeconds); });
  await recorder.record({ provider: 'groq', providerStatus: 'rate_limited' });
  await recorder.record({ provider: 'gemini', providerStatus: 'malformed' });
  await recorder.record({ provider: 'gemini', providerStatus: 'rate_limited', retryAfterSeconds: 42 });
  assert.deepEqual(seen, [42]);
});

test('withAttemptAccounting infers attempts for silent providers but never double counts self-recording ones', async () => {
  const recorder = createAttemptRecorder({ route: 'age', logger: silent });
  await runWithAttemptRecorder(recorder, async () => {
    // silent (e.g. an injected mock): one inferred attempt
    await withAttemptAccounting({ provider: 'gemini', model: 'm' }, async () => ({ ok: true }));
    // self-recording provider: still exactly one
    await withAttemptAccounting({ provider: 'gemini', model: 'm' }, async () => {
      await recordProviderAttempt({ provider: 'gemini', model: 'm', providerStatus: 'ok' });
      return { ok: true };
    });
    // a null result means nothing was researched: no phantom attempt
    await withAttemptAccounting({ provider: 'gemini', model: 'm' }, async () => null);
    // a failure that never sent a request is not an attempt
    await assert.rejects(withAttemptAccounting({ provider: 'gemini', model: 'm' }, async () => {
      throw Object.assign(new Error('x'), { code: 'PROVIDER_NOT_CONFIGURED' });
    }));
    // a real failure is
    await assert.rejects(withAttemptAccounting({ provider: 'gemini', model: 'm' }, async () => {
      throw Object.assign(new Error('x'), { code: 'PROVIDER_RATE_LIMIT', status: 429 });
    }));
  });
  assert.equal(recorder.count(), 3);
  assert.equal(recorder.count({ providerStatus: ATTEMPT_STATUS.RATE_LIMITED }), 1);
});

test('totalCount counts a request that is still in flight when the deadline fires', async () => {
  const recorder = createAttemptRecorder({ route: 'age', logger: silent });
  let release;
  const pending = runWithAttemptRecorder(recorder, () => withAttemptAccounting(
    { provider: 'gemini', model: 'm' },
    () => new Promise((resolve) => { release = resolve; }),
  ));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(recorder.totalCount(), 1, 'a sent-but-unanswered request is still a paid attempt');
  release({ ok: true });
  await pending;
  assert.equal(recorder.totalCount(), 1, 'and it is not counted twice once it settles');
});

// ---------------------------------------------------------------- daily usage aggregate

test('usage fields aggregate calls, statuses, tokens and fallbacks under route|provider|model', () => {
  const fields = Object.fromEntries(usageFieldsForAttempt({
    route: 'refine', provider: 'gemini', model: 'gemini-2.5-flash', providerStatus: 'rate_limited',
    inputTokens: 10, outputTokens: 5, thinkingTokens: 2, fallbackReason: 'gemini_cooldown',
  }));
  assert.deepEqual(fields, {
    'refine|gemini|gemini-2.5-flash|calls': 1,
    'refine|gemini|gemini-2.5-flash|status:rate_limited': 1,
    'refine|gemini|gemini-2.5-flash|in_tokens': 10,
    'refine|gemini|gemini-2.5-flash|out_tokens': 5,
    'refine|gemini|gemini-2.5-flash|think_tokens': 2,
    'refine|fallback:gemini_cooldown': 1,
  });
});

test('recordProviderUsage writes one pipeline to the UTC-day hash, and never throws or hangs on Redis trouble', async () => {
  const written = [];
  const redis = {
    pipeline() {
      const ops = [];
      const chain = {
        hincrby: (key, field, amount) => { ops.push(['hincrby', key, field, amount]); return chain; },
        expire: (key, ttl) => { ops.push(['expire', key, ttl]); return chain; },
        exec: async () => { written.push(...ops); return []; },
      };
      return chain;
    },
  };
  const at = Date.UTC(2026, 8, 29, 12, 0, 0);
  assert.equal(await recordProviderUsage(redis, { route: 'age', provider: 'gemini', model: 'm', providerStatus: 'ok' }, at), true);
  assert.equal(written.every((op) => op[1] === 'provider-usage:v1:2026-09-29'), true);
  assert.ok(written.some((op) => op[0] === 'expire'));
  assert.equal(usageKeyForDate(at), 'provider-usage:v1:2026-09-29');

  const failing = { pipeline: () => { throw new Error('redis down'); } };
  assert.equal(await recordProviderUsage(failing, { route: 'age', provider: 'g', model: 'm', providerStatus: 'ok' }), false);
  const hanging = { pipeline: () => ({ hincrby() { return this; }, expire() { return this; }, exec: () => new Promise(() => {}) }) };
  const started = Date.now();
  assert.equal(await recordProviderUsage(hanging, { route: 'age', provider: 'g', model: 'm', providerStatus: 'ok' }), false);
  assert.ok(Date.now() - started < 1000, 'a hung Redis must not stall the lookup');
  assert.equal(await recordUsageEvent(null, 'age', 'paid_lookup'), false);
});

test('summarizeUsage yields per-route/model rows with 429 counts and tokens, plus events and fallbacks', () => {
  const summary = summarizeUsage({
    'age|gemini|gemini-3.5-flash-lite|calls': '10',
    'age|gemini|gemini-3.5-flash-lite|status:rate_limited': '4',
    'age|gemini|gemini-3.5-flash-lite|status:ok': '5',
    'age|gemini|gemini-3.5-flash-lite|status:malformed': '1',
    'age|gemini|gemini-3.5-flash-lite|in_tokens': '3000',
    'age|gemini|gemini-3.5-flash-lite|out_tokens': '900',
    'refine|event:gate_skip:single_candidate': '7',
    'refine|fallback:gemini_rate_limited': '3',
  });
  assert.deepEqual(summary.rows, [{
    route: 'age', provider: 'gemini', model: 'gemini-3.5-flash-lite',
    calls: 10, rateLimited: 4, otherFailures: 1, inputTokens: 3000, outputTokens: 900, thinkingTokens: 0,
  }]);
  assert.equal(summary.events['refine|gate_skip:single_candidate'], 7);
  assert.equal(summary.fallbacks['refine|gemini_rate_limited'], 3);
});

// ---------------------------------------------------------------- cooldown

test('the Gemini cooldown is shared through Redis and sized from Retry-After within sane bounds', async () => {
  const store = new Map();
  const redis = {
    get: async (key) => (store.has(key) ? store.get(key) : null),
    set: async (key, value, options) => { store.set(key, { value, ex: options?.ex }); return 'OK'; },
  };
  redis.get = async (key) => (store.has(key) ? '1' : null);
  const deadline = createDeadline({ totalMs: 5000 });
  const first = createGeminiCooldown();
  assert.equal(await first.isActive(redis, deadline), false);
  await first.mark(redis, deadline, { retryAfterSeconds: 90 });
  assert.equal(store.get('gemini-cooldown:v1').ex, 90);
  // another "instance" with no memory of the 429 still sees it via Redis
  assert.equal(await createGeminiCooldown().isActive(redis, deadline), true);

  assert.equal(resolveCooldownSeconds({ env: {} }), 60);
  assert.equal(resolveCooldownSeconds({ env: {}, retryAfterSeconds: 2 }), 15);
  assert.equal(resolveCooldownSeconds({ env: {}, retryAfterSeconds: 9999 }), 300);
  assert.equal(resolveCooldownSeconds({ env: { GEMINI_RATE_LIMIT_COOLDOWN_SECONDS: '120' } }), 120);
});

test('the cooldown expires in-process once its time has passed', async () => {
  let clock = 1_000_000;
  const cooldown = createGeminiCooldown({ now: () => clock });
  await cooldown.mark(null, null, { retryAfterSeconds: 20 });
  assert.equal(await cooldown.isActive(null, null), true);
  clock += 21_000;
  assert.equal(await cooldown.isActive(null, null), false);
});

// ---------------------------------------------------------------- fail-closed limiter

test('boundedRateLimit keeps fail-open by default but fails closed for paid callers', async () => {
  const deadline = () => createDeadline({ totalMs: 5000 });
  const throwing = { limit: async () => { throw new Error('redis down'); } };
  const open = await boundedRateLimit(throwing, 'ip', deadline());
  assert.equal(open.success, true);
  assert.equal(open.storeUnavailable, true);

  for (const limiter of [throwing, null, { limit: () => new Promise(() => {}) }]) {
    const closed = await boundedRateLimit(limiter, 'ip', deadline(), { failClosed: true, maxMs: 30 });
    assert.equal(closed.success, false, 'unavailable limiter must deny paid access');
    assert.equal(closed.storeUnavailable, true);
  }

  const ok = await boundedRateLimit({ limit: async () => ({ success: true }) }, 'ip', deadline(), { failClosed: true });
  assert.equal(ok.success, true);
  assert.equal(ok.storeUnavailable, false);
  const denied = await boundedRateLimit({ limit: async () => ({ success: false }) }, 'ip', deadline(), { failClosed: true });
  assert.equal(denied.success, false);
  assert.equal(denied.storeUnavailable, false, 'a real limit hit is distinguishable from a store outage');
});

// ---------------------------------------------------------------- real providers

function reply(status, body, headers = {}) {
  return { ok: status < 400, status, headers: { get: (name) => headers[String(name).toLowerCase()] ?? null }, async json() { return body; } };
}

test('callSmartLookupAgeProvider: a Gemini 429 falls back to Groq with exactly one Gemini request', async () => {
  const fetched = [];
  const fetchImpl = async (url) => {
    fetched.push(String(url).includes('groq') ? 'groq' : 'gemini');
    if (String(url).includes('groq')) {
      return reply(200, { choices: [{ message: { content: '{"brand":"Acme"}' } }], usage: { prompt_tokens: 40, completion_tokens: 10 } });
    }
    return reply(429, {}, { 'retry-after': '25' });
  };
  const recorder = createAttemptRecorder({ route: 'age', logger: silent });
  await runWithAttemptRecorder(recorder, () => callSmartLookupAgeProvider(
    { query: 'acme thing', providerQuery: 'acme thing' },
    { deadline: createDeadline({ totalMs: 8000 }), fetchImpl, apiKey: 'k', groqApiKey: 'g', env: {} },
  ));

  assert.deepEqual(fetched, ['gemini', 'groq']);
  const [gemini, groq] = recorder.attempts;
  assert.equal(gemini.providerStatus, 'rate_limited');
  assert.equal(gemini.retryAfterSeconds, 25);
  assert.equal(groq.provider, 'groq');
  assert.equal(groq.fallbackReason, 'gemini_rate_limited');
  assert.equal(groq.inputTokens, 40);
});

test('callGeminiSearchProvider records the flash-lite attempt, its tokens, and a 429 Retry-After', async () => {
  const recorder = createAttemptRecorder({ route: 'age', logger: silent });
  await runWithAttemptRecorder(recorder, async () => {
    await assert.rejects(callGeminiSearchProvider('Some Product', {
      apiKey: 'k', model: 'gemini-3.5-flash-lite',
      fetchImpl: async () => reply(429, {}, { 'retry-after': '11' }),
    }), (error) => error.code === 'PROVIDER_RATE_LIMIT' && error.retryAfterSeconds === 11);

    await assert.rejects(callGeminiSearchProvider('Some Product', {
      apiKey: 'k', model: 'gemini-3.5-flash-lite',
      fetchImpl: async () => reply(200, { candidates: [{ content: { parts: [{ text: 'no json' }] } }], usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 5 } }),
    }), (error) => error.code === 'PROVIDER_MALFORMED_JSON');

    // never configured: no request is made, so no attempt is recorded
    await assert.rejects(callGeminiSearchProvider('Some Product', { apiKey: '', fetchImpl: async () => { throw new Error('no request expected'); }, model: 'm' }));
  });
  assert.deepEqual(recorder.attempts.map((a) => [a.model, a.providerStatus, a.inputTokens]), [
    ['gemini-3.5-flash-lite', 'rate_limited', null],
    ['gemini-3.5-flash-lite', 'malformed', 50],
  ]);
});

// ---------------------------------------------------------------- refinement gate

test('the refinement gate skips only single-candidate and closed high-confidence windows', () => {
  const high = { sufficient: true, confidence: 'high', range: { start: 2010, end: 2025 } };
  const ambiguous = { status: 'ambiguous' };
  assert.deepEqual(evaluateRefinementGate({ workingCandidateYears: [2012] }), { skip: true, reason: 'single_candidate' });
  assert.deepEqual(evaluateRefinementGate({ workingCandidateYears: [] }), { skip: true, reason: 'single_candidate' });
  assert.deepEqual(evaluateRefinementGate({ workingCandidateYears: [2012, 2024], localPolicy: high, localDecision: ambiguous }), { skip: true, reason: 'local_high_confidence' });
  const noSkip = [
    { localPolicy: { ...high, range: { start: 2010, end: null } }, localDecision: ambiguous },
    { localPolicy: { ...high, confidence: 'medium' }, localDecision: ambiguous },
    { localPolicy: { ...high, sufficient: false }, localDecision: ambiguous },
    { localPolicy: high, localDecision: { status: 'unavailable' } },
    {},
  ];
  for (const extra of noSkip) {
    assert.equal(evaluateRefinementGate({ workingCandidateYears: [2012, 2024], ...extra }).skip, false, JSON.stringify(extra));
  }
});

// ---------------------------------------------------------------- daily report

test('buildUsageReport derives calls per paid lookup, 429 rate, fallback rate, refinement rate and model usage', () => {
  const report = buildUsageReport(summarizeUsage({
    'age|gemini|gemini-3.5-flash-lite|calls': '8',
    'age|gemini|gemini-3.5-flash-lite|status:rate_limited': '2',
    'age|groq|openai/gpt-oss-20b|calls': '2',
    'age|fallback:gemini_rate_limited': '2',
    'age|event:paid_lookup': '8',
    'refine|gemini|gemini-3.5-flash-lite|calls': '6',
    'refine|gemini|gemini-3.5-flash-lite|status:rate_limited': '3',
    'refine|gemini|gemini-3.5-flash-lite|in_tokens': '1200',
    'refine|event:paid_lookup': '6',
    'refine|event:gate_skip:single_candidate': '10',
    'refine|event:cache_hit': '4',
    'refine|event:retry': '2',
    'refine|event:gemini_cooldown_skip': '1',
  }));
  const age = report.routes.find((r) => r.route === 'age');
  assert.equal(age.calls, 10);
  assert.equal(age.geminiCalls, 8);
  assert.equal(age.callsPerPaidLookup, 10 / 8);
  assert.equal(age.rateLimitRate, 2 / 10);
  assert.equal(age.fallbackRate, 2 / 10);
  assert.deepEqual(age.models, { 'gemini/gemini-3.5-flash-lite': 8, 'groq/openai/gpt-oss-20b': 2 });

  const refine = report.routes.find((r) => r.route === 'refine');
  assert.equal(refine.refineRequestsCounted, 20, 'retry and cooldown-skip events are not requests');
  assert.equal(refine.refinementRate, 6 / 20);
  assert.equal(refine.inputTokens, 1200);
  assert.equal(refine.rateLimitRate, 0.5);

  assert.equal(buildUsageReport(summarizeUsage({})).routes.length, 0);
  const unknownDenominator = buildUsageReport(summarizeUsage({ 'age|gemini|m|calls': '3' })).routes[0];
  assert.equal(unknownDenominator.callsPerPaidLookup, null, 'unknown denominator is null, never a fake 0');
});
