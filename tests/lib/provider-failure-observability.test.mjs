import test from 'node:test';
import assert from 'node:assert/strict';

import { createAgeLookupHandler } from '../../api/age-lookup.js';
import {
  createAttemptRecorder, runWithAttemptRecorder, withAttemptAccounting,
} from '../../lib/smart-lookup/provider-attempts.js';
import {
  recordProviderUsage, summarizeUsage, usageFieldsForAttempt, usageKeyForDate,
} from '../../lib/smart-lookup/provider-usage.js';
import { callGeminiSearchProvider, GeminiSearchProviderError } from '../../lib/smart-lookup/gemini-search-provider.js';
import { callOpenAiResponses } from '../../lib/smart-lookup/openai-provider.js';
import { createDeadline } from '../../lib/smart-lookup/deadline.js';
import {
  DURATION_BUCKETS, durationBucket, remainingBudgetBucket,
} from '../../lib/smart-lookup/provider-diagnostics.js';
import {
  DEFAULT_HEAVY_PROVIDER_TIMEOUT_MS, MAX_HEAVY_PROVIDER_TIMEOUT_MS, MIN_HEAVY_PROVIDER_TIMEOUT_MS,
  heavyProviderStageBudgetMs,
} from '../../lib/smart-lookup/heavy-provider-budget.js';
import {
  medianBucket, renderProviderFailureReport, summarizeProviderDiagnostics,
} from '../../lib/smart-lookup/provider-failure-report.js';
import { createFakeRedis } from '../helpers/fake-redis.mjs';
import { allowingRateLimiter } from '../helpers/allowing-rate-limiter.mjs';

const AT = Date.UTC(2026, 9, 3, 12);
const LITE = 'gemini-3.5-flash-lite';
const SECRET_BODY = 'SECRET-RESPONSE-BODY-do-not-log';
const API_KEY = 'test-api-key-do-not-log';
const QUERY = 'Distinctive Query Text Zq9';

function harness(route = 'age') {
  const redis = createFakeRedis();
  const lines = [];
  const recorder = createAttemptRecorder({
    route,
    logger: { info: (line) => lines.push(line) },
    redis,
    usageSink: (client, attempt) => recordProviderUsage(client, attempt, AT),
  });
  const hash = () => redis.hash(usageKeyForDate(AT));
  return { redis, lines, recorder, hash };
}

function reply(status, body = {}) {
  return {
    ok: status < 400,
    status,
    headers: { get: () => null },
    async json() { return body; },
    async text() { return JSON.stringify(body); },
  };
}

async function nativeAttempt(recorder, status, body = { error: { message: SECRET_BODY } }) {
  await runWithAttemptRecorder(recorder, () => callGeminiSearchProvider(QUERY, {
    apiKey: API_KEY, model: LITE, fetchImpl: async () => reply(status, body),
  }).catch(() => null));
}

// ---------------------------------------------------------------- buckets

test('duration buckets are coarse, ordered, and reject unusable values', () => {
  const cases = [
    [0, 'lt1s'], [999, 'lt1s'], [1000, '1-2s'], [3999, '3-4s'], [6499, '6-7s'], [6500, '6-7s'],
    [6999, '6-7s'], [7000, '7-8s'], [9999, '8-10s'], [12999, '10-13s'], [13000, 'ge13s'], [90000, 'ge13s'],
  ];
  for (const [ms, label] of cases) assert.equal(durationBucket(ms), label, `${ms}ms`);
  for (const bad of [-1, NaN, Infinity, null, undefined, '6500']) assert.equal(durationBucket(bad), null, String(bad));
  assert.equal(remainingBudgetBucket(1999), 'lt2s');
  assert.equal(remainingBudgetBucket(13500), 'ge13s');
  assert.equal(remainingBudgetBucket(-5), null);
  const labels = DURATION_BUCKETS.map(([label]) => label);
  assert.equal(new Set(labels).size, labels.length);
  for (const label of labels) assert.match(label, /^[a-z0-9-]+$/, 'labels must survive the field-name sanitizer');
});

// ---------------------------------------------------------------- native Gemini status codes

test('Gemini 4xx statuses are preserved on the attempt and as per-code counters', async () => {
  const { recorder, hash } = harness();
  await nativeAttempt(recorder, 400);
  await nativeAttempt(recorder, 400);
  await nativeAttempt(recorder, 403);
  await nativeAttempt(recorder, 404);

  assert.deepEqual(recorder.attempts.map((a) => [a.providerStatus, a.httpStatus]), [
    ['http_error', 400], ['http_error', 400], ['http_error', 403], ['http_error', 404],
  ]);
  const fields = hash();
  assert.equal(fields[`age|gemini|${LITE}|http:400`], 2);
  assert.equal(fields[`age|gemini|${LITE}|http:403`], 1);
  assert.equal(fields[`age|gemini|${LITE}|http:404`], 1);
  assert.equal(fields[`age|gemini|${LITE}|status:http_error`], 4);
  assert.equal(fields[`age|gemini|${LITE}|dur:http_error:lt1s`], 4);

  // The per-code counters must not be mistaken for extra failures by the existing summary.
  const [row] = summarizeUsage(fields).rows;
  assert.equal(row.calls, 4);
  assert.equal(row.otherFailures, 4);
});

test('Gemini 5xx and 429 statuses are preserved without changing their outcome classes', async () => {
  const { recorder, hash } = harness();
  await nativeAttempt(recorder, 500);
  await nativeAttempt(recorder, 503);
  await nativeAttempt(recorder, 429);

  assert.deepEqual(recorder.attempts.map((a) => [a.providerStatus, a.httpStatus]), [
    ['server_error', 500], ['server_error', 503], ['rate_limited', 429],
  ]);
  const fields = hash();
  assert.equal(fields[`age|gemini|${LITE}|http:500`], 1);
  assert.equal(fields[`age|gemini|${LITE}|http:503`], 1);
  assert.equal(fields[`age|gemini|${LITE}|http:429`], 1);
  assert.equal(fields[`age|gemini|${LITE}|status:server_error`], 2);
  assert.equal(fields[`age|gemini|${LITE}|status:rate_limited`], 1);
});

test('a successful Gemini attempt records latency but no http counter; a timeout records neither a code nor a cap', async () => {
  const { recorder, hash } = harness();
  const okBody = {
    candidates: [{ content: { parts: [{ text: JSON.stringify({ brand: 'Microsoft', product: 'Xbox', summary: 's', bestEstimateYear: 2017, precision: 'exact_model', confidence: 'high', estimateBasis: 'b', isIndividualUnitDate: false }) }] } }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
  };
  await runWithAttemptRecorder(recorder, async () => {
    await callGeminiSearchProvider(QUERY, { apiKey: API_KEY, model: LITE, fetchImpl: async () => reply(200, okBody) }).catch(() => null);
    await assert.rejects(callGeminiSearchProvider(QUERY, {
      apiKey: API_KEY, model: LITE, timeoutMs: 20, fetchImpl: () => new Promise(() => {}),
    }), (error) => error.code === 'PROVIDER_TIMEOUT');
  });
  const fields = hash();
  assert.equal(Object.keys(fields).some((key) => key.includes('|http:')), false, 'no status code exists for ok or a pre-response timeout');
  assert.equal(fields[`age|gemini|${LITE}|status:timeout`], 1);
  assert.equal(fields[`age|gemini|${LITE}|dur:timeout:lt1s`], 1);
  assert.equal(Object.keys(fields).some((key) => key.endsWith('|cap_hit')), false);
});

// ---------------------------------------------------------------- privacy

test('no response body, API key or query text reaches logs, attempts or Redis fields', async () => {
  const { recorder, lines, hash } = harness();
  await nativeAttempt(recorder, 400);
  await nativeAttempt(recorder, 500, { error: { message: SECRET_BODY } });
  await runWithAttemptRecorder(recorder, () => withAttemptAccounting(
    { provider: 'openai', model: 'm', grounded: true, diagnostics: { stageCapMs: 6500 } },
    () => callOpenAiResponses(QUERY, {
      env: { OPENAI_API_KEY: API_KEY, SMART_LOOKUP_OPENAI_ENABLED: 'true', OPENAI_SMART_LOOKUP_MODEL: 'm' },
      deadline: createDeadline({ totalMs: 15000 }),
      openAiMaxMs: 500,
      diagnostics: { stageCapMs: 6500 },
      fetchImpl: async () => reply(500, { error: { message: SECRET_BODY } }),
    }),
  ).catch(() => null));

  const everything = JSON.stringify({ lines, attempts: recorder.attempts, fields: hash() });
  for (const forbidden of [SECRET_BODY, API_KEY, QUERY, 'Zq9']) {
    assert.equal(everything.includes(forbidden), false, `leaked: ${forbidden}`);
  }
  const line = JSON.parse(lines[0]);
  assert.equal(line.httpStatus, 400);
  assert.equal(line.durationBucket, 'lt1s');
});

// ---------------------------------------------------------------- OpenAI telemetry

const OPENAI_ENV = { OPENAI_API_KEY: API_KEY, SMART_LOOKUP_OPENAI_ENABLED: 'true', OPENAI_SMART_LOOKUP_MODEL: 'test-model' };

function hangingFetch() {
  return (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
}

async function openAiAttempt({ totalMs = 15000, openAiMaxMs, stageCapMs, fetchImpl }) {
  const h = harness();
  const diagnostics = { stageCapMs };
  const deadline = createDeadline({ totalMs });
  const outcome = await runWithAttemptRecorder(h.recorder, () => withAttemptAccounting(
    { provider: 'openai', model: 'test-model', fallbackReason: 'native_http_error', grounded: true, diagnostics },
    () => callOpenAiResponses('prompt', { env: OPENAI_ENV, deadline, openAiMaxMs, diagnostics, fetchImpl }),
  ).then((value) => ({ value }), (error) => ({ error })));
  return { ...h, outcome, diagnostics, attempt: h.recorder.attempts[0] };
}

test('an OpenAI timeout bound by its stage cap records the cap hit, no usable response and the budget at start', async () => {
  const { outcome, attempt, hash, diagnostics } = await openAiAttempt({
    openAiMaxMs: 120, stageCapMs: 120, fetchImpl: hangingFetch(),
  });
  assert.equal(outcome.error?.code, 'STAGE_TIMEOUT');
  assert.equal(attempt.providerStatus, 'timeout');
  assert.equal(attempt.capHit, true);
  assert.equal(attempt.stageBudgetMs, 120);
  assert.equal(attempt.stageCapMs, 120);
  assert.equal(attempt.usableResponse, false);
  assert.equal(attempt.httpStatus, null, 'no status exists before a non-streaming response arrives');
  assert.ok(attempt.remainingBudgetMs >= 14000, `remaining at start was ${attempt.remainingBudgetMs}`);
  assert.equal(diagnostics.httpStatus, undefined);

  const fields = hash();
  const base = 'age|openai|test-model';
  assert.equal(fields[`${base}|status:timeout`], 1);
  assert.equal(fields[`${base}|cap_hit`], 1);
  assert.equal(fields[`${base}|usable_no`], 1);
  assert.equal(fields[`${base}|dur:timeout:lt1s`], 1);
  assert.equal(fields[`${base}|rem:ge13s`], 1);
  assert.equal(fields['age|fallback:native_http_error'], 1);
});

test('an OpenAI timeout caused by the route running out of time is not counted as a cap hit', async () => {
  const { attempt, hash } = await openAiAttempt({
    totalMs: 600, openAiMaxMs: 5000, stageCapMs: 5000, fetchImpl: hangingFetch(),
  });
  assert.equal(attempt.providerStatus, 'timeout');
  assert.equal(attempt.capHit, false);
  assert.ok(attempt.stageBudgetMs < attempt.stageCapMs);
  const fields = hash();
  assert.equal(fields['age|openai|test-model|timeout_route_limited'], 1);
  assert.equal(Object.keys(fields).some((key) => key.endsWith('|cap_hit')), false);
});

test('an OpenAI HTTP error keeps its status; a usable answer is flagged and adds no http counter', async () => {
  const failed = await openAiAttempt({
    openAiMaxMs: 500, stageCapMs: 500, fetchImpl: async () => reply(500, { error: { message: SECRET_BODY } }),
  });
  assert.equal(failed.attempt.httpStatus, 500);
  assert.equal(failed.attempt.providerStatus, 'server_error');
  assert.equal(failed.attempt.usableResponse, false);
  assert.equal(failed.attempt.capHit, null, 'only timeouts can hit a cap');
  assert.equal(failed.hash()['age|openai|test-model|http:500'], 1);

  const payload = {
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ brand: 'Nintendo', introductionYear: 2025 }), annotations: [] }] }],
    usage: { input_tokens: 5, output_tokens: 5 },
  };
  const ok = await openAiAttempt({ openAiMaxMs: 500, stageCapMs: 500, fetchImpl: async () => reply(200, payload) });
  assert.equal(ok.attempt.providerStatus, 'ok');
  assert.equal(ok.attempt.usableResponse, true);
  assert.equal(ok.diagnostics.httpStatus, 200);
  const fields = ok.hash();
  assert.equal(fields['age|openai|test-model|usable_yes'], 1);
  assert.equal(Object.keys(fields).some((key) => key.includes('|http:')), false);
});

test('providers that pass no diagnostics sink add no stage fields', () => {
  const fields = Object.fromEntries(usageFieldsForAttempt({
    route: 'age', provider: 'gemini', model: 'm', providerStatus: 'ok',
  }));
  assert.deepEqual(fields, { 'age|gemini|m|calls': 1, 'age|gemini|m|status:ok': 1 });
});

// ---------------------------------------------------------------- report

test('the report summarizes status codes, outcomes, latency and cap hits per provider', async () => {
  const { recorder, hash } = harness();
  for (let i = 0; i < 7; i += 1) await nativeAttempt(recorder, 400);
  await nativeAttempt(recorder, 500);
  await nativeAttempt(recorder, 500);
  for (let i = 0; i < 3; i += 1) {
    await recorder.record({
      provider: 'openai', model: 'test-model', providerStatus: 'timeout', durationMs: 6520,
      stageBudgetMs: 6500, stageCapMs: 6500, capHit: true, usableResponse: false, remainingBudgetMs: 13900,
    });
  }
  const rows = summarizeProviderDiagnostics(hash());
  const gemini = rows.find((row) => row.provider === 'gemini');
  assert.deepEqual(gemini.httpStatuses, { 400: 7, 500: 2 });
  assert.equal(gemini.statuses.http_error, 7);
  assert.equal(gemini.statuses.server_error, 2);
  const openai = rows.find((row) => row.provider === 'openai');
  assert.equal(openai.capHits, 3);
  assert.equal(medianBucket(openai.durations), '6-7s');

  const text = renderProviderFailureReport(rows).join('\n');
  assert.match(text, /Gemini gemini-3\.5-flash-lite\s+calls 9\s+ok 0\s+failed 9/);
  assert.match(text, /400: 7\s+500: 2/);
  assert.match(text, /timeout 0/, 'a zero timeout count is shown, not omitted');
  assert.match(text, /OpenAI test-model\s+calls 3\s+ok 0\s+failed 3/);
  assert.match(text, /timeout 3/);
  assert.match(text, /median 6-7s/);
  assert.match(text, /bound by the stage cap: 3/);
  assert.match(text, /usable response received:\s+yes 0\s+no 3/);
  assert.match(text, /route budget left when the stage began:\s+13s\+|ge13s 3/);
});

test('the report tolerates an empty day and counters that pre-date the diagnostics', () => {
  assert.match(renderProviderFailureReport(summarizeProviderDiagnostics({})).join('\n'), /no provider attempts recorded/);
  const legacy = summarizeProviderDiagnostics({
    'age|gemini|m|calls': '4', 'age|gemini|m|status:ok': '3', 'age|gemini|m|status:http_error': '1',
    'age|event:paid_lookup': '4', 'age|fallback:native_http_error': '1',
  });
  const text = renderProviderFailureReport(legacy).join('\n');
  assert.match(text, /none recorded/);
  assert.match(text, /latency: not recorded/);
  assert.equal(medianBucket({}), null);
});

// ---------------------------------------------------------------- configurable stage budget

test('the heavy-provider stage budget defaults to 6500 ms', () => {
  assert.equal(DEFAULT_HEAVY_PROVIDER_TIMEOUT_MS, 6500);
  assert.equal(heavyProviderStageBudgetMs({}), 6500);
  assert.equal(heavyProviderStageBudgetMs(undefined), 6500);
  assert.equal(heavyProviderStageBudgetMs({ SMART_LOOKUP_HEAVY_PROVIDER_TIMEOUT_MS: '' }), 6500);
  assert.equal(heavyProviderStageBudgetMs({ SMART_LOOKUP_HEAVY_PROVIDER_TIMEOUT_MS: '   ' }), 6500);
});

test('invalid heavy-provider budgets fall back to the default and out-of-range ones are clamped', () => {
  const budget = (value) => heavyProviderStageBudgetMs({ SMART_LOOKUP_HEAVY_PROVIDER_TIMEOUT_MS: value });
  for (const invalid of ['abc', '-5', '0', '6.5e3', '6500.5', '1e9', 'NaN', 'Infinity', '12 000', '0x1000', '6500ms']) {
    assert.equal(budget(invalid), 6500, `invalid: ${invalid}`);
  }
  assert.equal(budget('1'), MIN_HEAVY_PROVIDER_TIMEOUT_MS);
  assert.equal(budget('500'), MIN_HEAVY_PROVIDER_TIMEOUT_MS);
  assert.equal(budget('99999'), MAX_HEAVY_PROVIDER_TIMEOUT_MS);
  assert.equal(budget('999999999'), MAX_HEAVY_PROVIDER_TIMEOUT_MS);
  assert.equal(budget('9000'), 9000);
  assert.equal(budget(' 8000 '), 8000);
  assert.equal(budget(7000), 7000);
  assert.ok(MAX_HEAVY_PROVIDER_TIMEOUT_MS < 15000, 'always below the route deadline');
});

// ---------------------------------------------------------------- route integration

function req(query) {
  return { method: 'POST', body: { query }, headers: { 'x-forwarded-for': '127.0.0.1' }, socket: {} };
}
function res() {
  return {
    statusCode: 0, payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    setHeader() {},
  };
}
const META = Symbol.for('smart-lookup-provider-metadata');
function openAiSuccess() {
  const value = { brand: 'Microsoft', likelyProduct: 'Xbox One X', introductionYear: 2017, identityConfidence: 'high', timingConfidence: 'high' };
  Object.defineProperty(value, META, {
    value: Object.freeze({
      provider: 'openai', fallbackUsed: false, primaryProvider: 'openai', grounded: true, webSearchUsed: true,
      groundedSources: [{ title: 'xbox.com', domain: 'xbox.com', uri: 'https://www.xbox.com/xbox-one-x' }], searchQueryCount: 1,
    }),
    enumerable: false,
  });
  return value;
}

function routeHarness({ extraEnv = {}, openAiProviderLookup, fetchImpl, redis = createFakeRedis() } = {}) {
  const calls = [];
  const nativeFailure = new GeminiSearchProviderError('PROVIDER_HTTP_ERROR', 'Gemini Search provider request failed', { status: 400 });
  const handler = createAgeLookupHandler({
    rateLimiter: allowingRateLimiter,
    env: {
      SMART_LOOKUP_NATIVE_GEMINI_SEARCH_ENABLED: 'true',
      ...OPENAI_ENV,
      ...extraEnv,
    },
    logger: { log() {}, info() {}, warn() {}, error() {} },
    localLookup: async () => null,
    redisFactory: () => redis,
    fetchImpl,
    now: () => Date.now(),
    nativeGeminiSearchLookup: async () => { calls.push('native'); throw nativeFailure; },
    ...(openAiProviderLookup ? {
      openAiProviderLookup: async (queryInfo, options) => { calls.push({ openai: options }); return openAiProviderLookup(queryInfo, options); },
    } : {}),
    providerLookup: async () => { calls.push('legacy-gemini'); throw new Error('legacy Gemini must not run'); },
    groundedProviderLookup: async () => { calls.push('grounded'); throw new Error('grounded legacy must not run'); },
  });
  return { handler, calls, redis };
}

test('a native Gemini HTTP error still falls back to OpenAI exactly once, in the same order, at the default 6500 ms cap', async () => {
  const { handler, calls } = routeHarness({ openAiProviderLookup: async () => openAiSuccess() });
  const out = res();
  await handler(req('Xbox One X'), out);

  assert.equal(out.statusCode, 200);
  assert.equal(calls[0], 'native');
  assert.equal(calls.length, 2, `unexpected provider calls: ${JSON.stringify(calls.map((c) => (typeof c === 'string' ? c : 'openai')))}`);
  const { openai } = calls[1];
  assert.equal(openai.openAiMaxMs, 6500);
  assert.equal(openai.diagnostics.stageCapMs, 6500);
  assert.equal(openai.enableXaiFallback, false);
  assert.equal(out.payload.errorCode ?? null, null);
});

test('SMART_LOOKUP_HEAVY_PROVIDER_TIMEOUT_MS is honoured, validated and clamped on the route', async () => {
  const seen = async (value) => {
    const { handler, calls } = routeHarness({
      extraEnv: value === undefined ? {} : { SMART_LOOKUP_HEAVY_PROVIDER_TIMEOUT_MS: value },
      openAiProviderLookup: async () => openAiSuccess(),
    });
    await handler(req('Xbox One X'), res());
    return calls.find((c) => typeof c === 'object').openai.openAiMaxMs;
  };
  assert.equal(await seen(undefined), 6500);
  assert.equal(await seen('9000'), 9000);
  assert.equal(await seen('not-a-number'), 6500);
  assert.equal(await seen('-1'), 6500);
  assert.equal(await seen('999999'), 12000);
  assert.equal(await seen('100'), 2000);
});

test('route: native 400 then an OpenAI stage timeout is recorded end to end and the response is unchanged', async () => {
  const { handler, redis, calls } = routeHarness({
    extraEnv: { SMART_LOOKUP_HEAVY_PROVIDER_TIMEOUT_MS: '2000' },
    fetchImpl: hangingFetch(),
  });
  const out = res();
  const startedAt = Date.now();
  await handler(req('Xbox One X'), out);
  const elapsed = Date.now() - startedAt;

  assert.equal(out.statusCode, 200);
  assert.equal(out.payload.errorCode, 'PROVIDER_TIMEOUT', 'user-visible classification is unchanged');
  assert.deepEqual(calls, ['native'], 'the injected native stub is the only other provider called');
  assert.ok(elapsed >= 1900 && elapsed < 4000, `OpenAI stage should stop at its 2000 ms cap, took ${elapsed}ms`);

  const fields = redis.hash(usageKeyForDate(Date.now()));
  assert.equal(fields[`age|gemini|${LITE}|http:400`], 1, 'the native HTTP status reaches Redis');
  assert.equal(fields['age|openai|test-model|status:timeout'], 1);
  assert.equal(fields['age|openai|test-model|cap_hit'], 1);
  assert.equal(fields['age|openai|test-model|usable_no'], 1);
  assert.equal(fields['age|openai|test-model|dur:timeout:2-3s'], 1);
  assert.equal(fields['age|openai|test-model|rem:ge13s'], 1);
  assert.equal(fields['age|fallback:native_http_error'], 1);
});
