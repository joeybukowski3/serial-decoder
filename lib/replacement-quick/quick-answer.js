import { GeminiSearchProviderError, extractJson, fetchWithTimeout } from '../smart-lookup/gemini-search-provider.js';
import { usageFromGemini } from '../smart-lookup/provider-attempts.js';
import {
  QUICK_GENERATION_CONFIG, QUICK_MAX_TIMEOUT_MS, QUICK_MODEL, QUICK_PROMPT_VERSION, QUICK_TIMEOUT_MS, buildQuickPrompt, cleanQuery,
} from './quick-prompt.js';
import { ANSWER_STATUS, ANSWER_VERSION, buildFallbackAnswer, sanitizeQuickAnswer } from './quick-sanitize.js';

/** Changes whenever the prompt or the public answer shape does; a future cache keys on it (with the model and the cleaned query). */
export const QUICK_CACHE_VERSION = `answer-${ANSWER_VERSION}.prompt-${QUICK_PROMPT_VERSION}`;

/**
 * Fast Answer: ONE ungrounded Gemini request, never retried, bounded end to end by a single timeout.
 *
 * - No `tools` entry anywhere: no Google Search, no grounding, no source handling. Nothing here can produce a URL.
 * - Reuses the existing transport helpers (fetchWithTimeout, extractJson, the provider error type, usage parsing).
 * - Never throws: a provider problem becomes an UNAVAILABLE answer carrying category guidance, with the reason in `meta.errorCode`.
 * - Provider error bodies are never read, stored or returned.
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export const quickEndpoint = (model = QUICK_MODEL) => `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`;

export const buildQuickRequestBody = (query) => ({
  contents: [{ parts: [{ text: buildQuickPrompt(query) }] }],
  generationConfig: QUICK_GENERATION_CONFIG,
});

/** Positive finite milliseconds, clamped to the 6 s ceiling; anything else gets the 5.5 s default. */
export function resolveTimeoutMs(value) {
  const requested = Number(value);
  if (!Number.isFinite(requested) || requested <= 0) return QUICK_TIMEOUT_MS;
  return Math.min(QUICK_MAX_TIMEOUT_MS, requested);
}

const timeoutError = () => new GeminiSearchProviderError('PROVIDER_TIMEOUT', 'Fast answer provider timed out', { retryable: true });

/** fetchWithTimeout only bounds the wait for response headers; this bounds reading the body inside the same overall deadline. */
async function readJsonBefore(response, deadlineAt) {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) throw timeoutError();
  let timerId;
  const timer = new Promise((_, reject) => { timerId = setTimeout(() => reject(timeoutError()), remaining); });
  try {
    return await Promise.race([response.json(), timer]);
  } catch (error) {
    if (error instanceof GeminiSearchProviderError) {
      try { await response.body?.cancel?.(); } catch (_) { /* best effort */ }
      throw error;
    }
    throw new GeminiSearchProviderError('PROVIDER_RESPONSE_INVALID', 'Fast answer response was not valid JSON');
  } finally {
    clearTimeout(timerId);
  }
}

function failureForStatus(status) {
  if (status === 429) return new GeminiSearchProviderError('PROVIDER_RATE_LIMIT', 'Fast answer provider rate limit', { status, retryable: true });
  if (status >= 500) return new GeminiSearchProviderError('PROVIDER_5XX', 'Fast answer provider unavailable', { status, retryable: true });
  return new GeminiSearchProviderError('PROVIDER_HTTP_ERROR', 'Fast answer provider request failed', { status });
}

function replyText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  return Array.isArray(parts) ? parts.filter((part) => !part?.thought).map((part) => part?.text || '').join('') : '';
}

async function performCall(query, { model, apiKey, fetchImpl, timeoutMs }, attempt) {
  if (!apiKey) throw new GeminiSearchProviderError('PROVIDER_NOT_CONFIGURED', 'Fast answer provider is not configured');
  const deadlineAt = Date.now() + timeoutMs;
  attempt.requestSent = true;
  const response = await fetchWithTimeout(quickEndpoint(model), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(buildQuickRequestBody(query)),
  }, fetchImpl, timeoutMs);
  attempt.httpStatus = Number(response?.status || 0);
  if (!response?.ok) throw failureForStatus(attempt.httpStatus);

  const payload = await readJsonBefore(response, deadlineAt);
  attempt.usage = usageFromGemini(payload);
  attempt.finishReason = typeof payload?.candidates?.[0]?.finishReason === 'string' ? payload.candidates[0].finishReason : null;
  const text = replyText(payload);
  attempt.rawText = text;
  if (!text.trim()) throw new GeminiSearchProviderError('PROVIDER_EMPTY', 'Fast answer provider returned no text');
  const parsed = extractJson(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new GeminiSearchProviderError('PROVIDER_MALFORMED_JSON', 'Fast answer provider returned malformed output');
  }
  return parsed;
}

const errorCodeOf = (error) => (error instanceof GeminiSearchProviderError ? error.code : 'QUICK_UNEXPECTED_ERROR');

/**
 * @param {string} query  the user's description of the item to replace (max 160 chars)
 * @param {object} [options]
 * @param {string} [options.apiKey]    defaults to env.GEMINI_API_KEY
 * @param {Function} [options.fetchImpl]  defaults to global fetch
 * @param {number} [options.timeoutMs]  total budget, default 5.5 s, clamped to 6 s
 * @param {boolean} [options.captureRaw]  include the raw model text in `meta` (smoke tests only)
 * @returns {Promise<{answer: object, meta: object}>}  always resolves; at most ONE provider request is ever sent
 */
export async function getQuickAnswer(query, options = {}) {
  const cleaned = cleanQuery(query);
  const model = options.model || QUICK_MODEL;
  const timeoutMs = resolveTimeoutMs(options.timeoutMs);
  const attempt = { requestSent: false, httpStatus: null, usage: {}, finishReason: null, rawText: '' };
  const startedAt = Date.now();
  const meta = (errorCode) => ({
    model, cacheVersion: QUICK_CACHE_VERSION, requestSent: attempt.requestSent, httpStatus: attempt.httpStatus, durationMs: Date.now() - startedAt, timeoutMs,
    finishReason: attempt.finishReason, usage: attempt.usage, errorCode, rawTextChars: attempt.rawText.length,
    ...(options.captureRaw ? { rawText: attempt.rawText.slice(0, 4000) } : {}),
  });
  if (!cleaned) return { answer: buildFallbackAnswer({ status: ANSWER_STATUS.INVALID_REQUEST }), meta: meta('INVALID_REQUEST') };

  try {
    const parsed = await performCall(cleaned, {
      model,
      apiKey: options.apiKey ?? (options.env || process.env).GEMINI_API_KEY,
      fetchImpl: options.fetchImpl || globalThis.fetch,
      timeoutMs,
    }, attempt);
    return { answer: sanitizeQuickAnswer(parsed, { query: cleaned }), meta: meta(null) };
  } catch (error) {
    return { answer: buildFallbackAnswer({ status: ANSWER_STATUS.UNAVAILABLE, query: cleaned }), meta: meta(errorCodeOf(error)) };
  }
}
