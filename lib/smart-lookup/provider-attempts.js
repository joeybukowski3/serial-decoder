import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request record of every paid provider HTTP attempt.
 *
 * Provider functions report the calls they actually make via
 * recordProviderAttempt(); the active recorder is found through
 * AsyncLocalStorage so no parameter has to be threaded through the provider
 * call chains. The recorder is the single source of truth for
 * actualProviderAttemptCount, the per-attempt `provider_attempt` log line and
 * the daily Redis usage aggregate.
 *
 * Privacy: an attempt only ever carries categorical/numeric fields. Raw
 * queries, serials, API keys, IPs and request bodies never enter this module.
 */

const storage = new AsyncLocalStorage();
// Same symbol provider.js attaches provider metadata under; shared by
// Symbol.for() so this module does not import provider.js (circular).
const PROVIDER_METADATA = Symbol.for('smart-lookup-provider-metadata');

export const ATTEMPT_STATUS = Object.freeze({
  OK: 'ok',
  RATE_LIMITED: 'rate_limited',
  SERVER_ERROR: 'server_error',
  TIMEOUT: 'timeout',
  NETWORK_ERROR: 'network_error',
  MALFORMED: 'malformed',
  HTTP_ERROR: 'http_error',
  ERROR: 'error',
});

const MALFORMED_CODE = /(MALFORMED|_EMPTY|EMPTY_RESULT|INVALID|UNUSABLE|SCHEMA|_MISSING)/;

/** True for any provider-side 429/rate-limit signal (never our own per-IP limiter). */
export function isProviderRateLimitError(error) {
  if (!error) return false;
  if (Number(error.status) === 429) return true;
  return /^(PROVIDER|GROQ|OPENAI|XAI|GROUNDING)_RATE_LIMIT$/.test(String(error.code || ''));
}

export function classifyProviderFailure(error) {
  if (isProviderRateLimitError(error)) return ATTEMPT_STATUS.RATE_LIMITED;
  const code = String(error?.code || '');
  const status = Number(error?.status || 0);
  if (status >= 500 || /_5XX$/.test(code)) return ATTEMPT_STATUS.SERVER_ERROR;
  if (error?.name === 'AbortError' || code === 'STAGE_TIMEOUT' || /TIMEOUT/.test(code)) return ATTEMPT_STATUS.TIMEOUT;
  if (/NETWORK_ERROR$/.test(code)) return ATTEMPT_STATUS.NETWORK_ERROR;
  if (MALFORMED_CODE.test(code)) return ATTEMPT_STATUS.MALFORMED;
  if (/HTTP_ERROR$/.test(code) || status >= 400) return ATTEMPT_STATUS.HTTP_ERROR;
  return ATTEMPT_STATUS.ERROR;
}

function tokenCount(value) {
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

/** Gemini generateContent usageMetadata -> normalized token fields. */
export function usageFromGemini(payload) {
  const usage = payload?.usageMetadata;
  return {
    inputTokens: tokenCount(usage?.promptTokenCount),
    outputTokens: tokenCount(usage?.candidatesTokenCount),
    thinkingTokens: tokenCount(usage?.thoughtsTokenCount),
  };
}

/** OpenAI-compatible chat/responses usage -> normalized token fields. */
export function usageFromOpenAiStyle(payload) {
  const usage = payload?.usage;
  return {
    inputTokens: tokenCount(usage?.prompt_tokens ?? usage?.input_tokens),
    outputTokens: tokenCount(usage?.completion_tokens ?? usage?.output_tokens),
    thinkingTokens: null,
  };
}

const ATTEMPT_LOG_FIELDS = [
  'requestId', 'route', 'queryHash', 'provider', 'model', 'attemptNumber',
  'providerStatus', 'httpStatus', 'fallbackReason', 'resultSource', 'cacheStatus',
  'backgroundRefinementTriggered', 'refinementTrigger', 'inputTokens', 'outputTokens',
  'thinkingTokens', 'durationMs', 'inferred', 'grounded', 'searchQueryCount',
];

function safeLogValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value).slice(0, 80);
}

export function createAttemptRecorder(options = {}) {
  const attempts = [];
  const context = {
    resultSource: null,
    cacheStatus: null,
    backgroundRefinementTriggered: Boolean(options.backgroundRefinementTriggered),
    refinementTrigger: options.refinementTrigger || null,
    queryHash: options.queryHash || null,
  };
  const now = options.now || Date.now;
  const logger = options.logger || console;
  let usageSink = options.usageSink || null;
  let redis = options.redis || null;
  let geminiRateLimitHook = null;
  let telemetryExtras = null;
  // Call-site wrappers still awaiting a provider. A request that was sent but
  // has not reported back (e.g. the route deadline fired first) is still a
  // paid attempt, so it counts once here until the provider records itself.
  const inFlight = new Set();

  const recorder = {
    route: options.route || 'unknown',
    requestId: options.requestId || null,
    setContext(patch = {}) { Object.assign(context, patch); },
    getContext() { return { ...context }; },
    setRedis(nextRedis) { redis = nextRedis || null; },
    setUsageSink(sink) { usageSink = sink || null; },
    // Extra log-safe fields (e.g. quota shadow metering) merged into the request log line.
    setTelemetryExtras(fn) { telemetryExtras = typeof fn === 'function' ? fn : null; },
    telemetryExtras() { try { return telemetryExtras ? telemetryExtras() || {} : {}; } catch (_) { return {}; } },
    // Invoked as soon as a Gemini 429 is recorded so the cooldown starts
    // immediately, not when the whole request finishes.
    setGeminiRateLimitHook(hook) { geminiRateLimitHook = hook || null; },
    get attempts() { return attempts.map((attempt) => ({ ...attempt })); },
    trackInFlight(entry) { inFlight.add(entry); return () => inFlight.delete(entry); },
    /** Recorded attempts plus in-flight calls that have not recorded anything yet. */
    totalCount() {
      let pending = 0;
      for (const entry of inFlight) if (attempts.length === entry.startCount) pending += 1;
      return attempts.length + pending;
    },
    count(filter) {
      if (!filter) return attempts.length;
      return attempts.filter((attempt) => Object.entries(filter).every(([key, value]) => attempt[key] === value)).length;
    },
    async record(input = {}) {
      const attempt = {
        requestId: recorder.requestId,
        route: recorder.route,
        queryHash: context.queryHash,
        provider: input.provider || 'unknown',
        model: input.model || null,
        attemptNumber: attempts.length + 1,
        providerStatus: input.providerStatus || ATTEMPT_STATUS.OK,
        httpStatus: Number.isFinite(input.httpStatus) ? input.httpStatus : null,
        fallbackReason: input.fallbackReason || null,
        resultSource: input.resultSource || context.resultSource,
        cacheStatus: input.cacheStatus || context.cacheStatus,
        backgroundRefinementTriggered: context.backgroundRefinementTriggered,
        refinementTrigger: context.refinementTrigger,
        inputTokens: tokenCount(input.inputTokens),
        outputTokens: tokenCount(input.outputTokens),
        thinkingTokens: tokenCount(input.thinkingTokens),
        // grounded = the request was sent with a web-search tool attached (not
        // "the answer had sources"). searchQueryCount is only what the provider
        // reported; null means unknown, never an assumed 1-per-request.
        grounded: Boolean(input.grounded),
        searchQueryCount: tokenCount(input.searchQueryCount),
        durationMs: Number.isFinite(input.durationMs) ? Math.max(0, Math.round(input.durationMs)) : null,
        inferred: Boolean(input.inferred),
        retryAfterSeconds: Number.isFinite(input.retryAfterSeconds) ? input.retryAfterSeconds : null,
        at: now(),
      };
      attempts.push(attempt);
      try {
        const line = { event: 'provider_attempt' };
        for (const field of ATTEMPT_LOG_FIELDS) line[field] = safeLogValue(attempt[field]);
        (logger || console).info(JSON.stringify(line));
      } catch (_) { /* telemetry must never break a lookup */ }
      if (usageSink && redis) {
        try { await usageSink(redis, attempt); } catch (_) { /* best effort */ }
      }
      if (geminiRateLimitHook && attempt.provider === 'gemini' && attempt.providerStatus === ATTEMPT_STATUS.RATE_LIMITED) {
        try { await geminiRateLimitHook(attempt); } catch (_) { /* best effort */ }
      }
      return attempt;
    },
    summary() {
      const isGemini = (attempt) => attempt.provider === 'gemini';
      const gemini = attempts.filter(isGemini);
      const models = [...new Set(attempts.map((attempt) => attempt.model).filter(Boolean))];
      const sum = (key) => attempts.reduce((total, attempt) => total + (attempt[key] || 0), 0);
      return {
        attemptCount: attempts.length,
        geminiAttemptCount: gemini.length,
        groqAttemptCount: attempts.filter((attempt) => attempt.provider === 'groq').length,
        otherAttemptCount: attempts.filter((attempt) => attempt.provider !== 'gemini' && attempt.provider !== 'groq').length,
        providerRateLimitCount: attempts.filter((attempt) => attempt.providerStatus === ATTEMPT_STATUS.RATE_LIMITED).length,
        geminiRateLimitCount: gemini.filter((attempt) => attempt.providerStatus === ATTEMPT_STATUS.RATE_LIMITED).length,
        fallbackAttemptCount: attempts.filter((attempt) => attempt.fallbackReason).length,
        attemptModels: models,
        inputTokens: sum('inputTokens'),
        outputTokens: sum('outputTokens'),
        thinkingTokens: sum('thinkingTokens'),
        groundedAttemptCount: attempts.filter((attempt) => attempt.grounded).length,
        searchQueryCount: sum('searchQueryCount'),
        // Per provider/model roll-ups feeding the cost counters
        // (outcome-counters.js); fallbacks are broken out separately.
        byModel: rollUpByModel(attempts),
        fallbackByModel: rollUpByModel(attempts.filter((attempt) => attempt.fallbackReason)),
      };
    },
  };
  return recorder;
}

/**
 * Billing-relevant totals per provider/model. A call is "billable" when a
 * response with usage metadata came back (failed/429 attempts return none), so a
 * grounded request that never got a response is counted as sent but not billed.
 */
export function rollUpByModel(attempts) {
  const rows = new Map();
  for (const attempt of attempts) {
    const key = `${attempt.provider}|${attempt.model || 'unknown'}`;
    const row = rows.get(key) || {
      provider: attempt.provider, model: attempt.model || 'unknown',
      calls: 0, groundedCalls: 0, groundedBillable: 0, searchQueries: 0, searchQueriesReported: 0,
      rateLimited: 0, inputTokens: 0, outputTokens: 0, thinkingTokens: 0,
    };
    row.calls += 1;
    if (attempt.grounded) {
      row.groundedCalls += 1;
      if (attempt.inputTokens != null) row.groundedBillable += 1;
      if (attempt.searchQueryCount != null) {
        row.searchQueriesReported += 1;
        row.searchQueries += attempt.searchQueryCount;
      }
    }
    if (attempt.providerStatus === ATTEMPT_STATUS.RATE_LIMITED) row.rateLimited += 1;
    row.inputTokens += attempt.inputTokens || 0;
    row.outputTokens += attempt.outputTokens || 0;
    row.thinkingTokens += attempt.thinkingTokens || 0;
    rows.set(key, row);
  }
  return [...rows.values()];
}

export function runWithAttemptRecorder(recorder, fn) {
  return storage.run(recorder, fn);
}

export function getActiveAttemptRecorder() {
  return storage.getStore() || null;
}

/** Record an attempt on the active recorder; a no-op outside a request context. */
export async function recordProviderAttempt(input) {
  const recorder = storage.getStore();
  if (!recorder) return null;
  return recorder.record(input);
}

/**
 * Wraps a provider call whose internals do not report attempts (an injected
 * mock, or a provider not yet instrumented) and records what actually
 * happened from its outcome, so counts stay correct either way. Providers that
 * DO record their own attempts are left alone, which prevents double counting.
 */
export async function withAttemptAccounting(descriptor, fn) {
  const recorder = storage.getStore();
  if (!recorder) return fn();
  const before = recorder.count();
  const startedAt = Date.now();
  const done = recorder.trackInFlight({ startCount: before });
  try {
    const value = await fn();
    // A null result means nothing was researched (no request was made).
    if (recorder.count() === before && value != null) {
      await recordInferredAttempts(recorder, descriptor, { value, durationMs: Date.now() - startedAt });
    }
    return value;
  } catch (error) {
    if (recorder.count() === before) {
      await recordInferredAttempts(recorder, descriptor, { error, durationMs: Date.now() - startedAt });
    }
    throw error;
  } finally {
    done();
  }
}

async function recordInferredAttempts(recorder, descriptor, { value, error, durationMs }) {
  const base = { inferred: true, durationMs, fallbackReason: descriptor.fallbackReason || null };
  const meta = value && typeof value === 'object' ? value[PROVIDER_METADATA] || null : null;
  // descriptor.grounded: the request carried a search tool (known even when it
  // failed). Without it, only a response that reports grounding counts.
  const groundedRequest = descriptor.grounded ?? Boolean(meta?.grounded || meta?.webSearchUsed);
  const primary = { provider: descriptor.provider, model: descriptor.model || null };

  if (error) {
    // Aggregate Gemini+Groq failure: both providers were actually called.
    if (error.code === 'PROVIDERS_UNAVAILABLE') {
      await recorder.record({ ...base, ...primary, grounded: groundedRequest, providerStatus: statusFromCode(error.primaryErrorCode) });
      await recorder.record({ ...base, provider: 'groq', fallbackReason: 'primary_failed', providerStatus: statusFromCode(error.fallbackErrorCode) });
      return;
    }
    // A provider that never sent a request (not configured / no time left).
    if (['PROVIDER_NOT_CONFIGURED', 'GEMINI_NOT_CONFIGURED', 'GROQ_NOT_CONFIGURED', 'INVALID_QUERY', 'MISSING_DEADLINE'].includes(error.code)) return;
    await recorder.record({ ...base, ...primary, grounded: groundedRequest, providerStatus: classifyProviderFailure(error), httpStatus: error.status, retryAfterSeconds: error.retryAfterSeconds });
    return;
  }

  if (meta?.fallbackUsed) {
    await recorder.record({ ...base, provider: meta.primaryProvider || primary.provider, model: primary.model, grounded: descriptor.grounded === true, providerStatus: statusFromCode(meta.primaryErrorCode) });
    await recorder.record({ ...base, provider: meta.provider || 'groq', model: meta.model || null, fallbackReason: 'primary_failed', providerStatus: ATTEMPT_STATUS.OK });
    return;
  }
  await recorder.record({
    ...base,
    provider: meta?.provider || primary.provider,
    model: meta?.model || primary.model,
    providerStatus: ATTEMPT_STATUS.OK,
    grounded: groundedRequest,
    searchQueryCount: groundedRequest ? meta?.searchQueryCount : null,
    inputTokens: meta?.usage?.inputTokens,
    outputTokens: meta?.usage?.outputTokens,
    thinkingTokens: meta?.usage?.thinkingTokens,
  });
}

function statusFromCode(code) {
  return classifyProviderFailure({ code: code || '' });
}
