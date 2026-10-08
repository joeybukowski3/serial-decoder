import { SmartLookupProviderError, extractJsonFromText, parseGroundingSources } from '../../smart-lookup/provider.js';
import { ATTEMPT_STATUS, classifyProviderFailure, recordProviderAttempt, usageFromGemini } from '../../smart-lookup/provider-attempts.js';

/**
 * Gemini + Google Search grounding transport for replacement research.
 *
 * Mirrors the grounded path of lib/smart-lookup/provider.js `callGeminiJson`
 * (not exported, so not callable without editing that production file) and
 * reuses its exported helpers: JSON extraction, grounding-source parsing, the
 * provider error type, attempt accounting and the Gemini cooldown interface.
 *
 * One call here is exactly one paid HTTP request: no retries, and a 429 ends
 * Gemini use (cooldown marked) per docs/provider-cost-controls.md. It is never
 * wired to a route, and it refuses to run without an explicit budget gate.
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
/**
 * Phase 3 generation settings for gemini-3.8-flash (verified against Google's generateContent docs):
 * - no temperature/topP/topK: Gemini 3 advises its defaults, so none are sent;
 * - thinkingLevel "low": factual extraction over grounded search needs little reasoning, and the model default is "medium";
 * - maxOutputTokens 8192: thinking tokens count toward this hard limit, so 4096 risked truncating the JSON.
 * No thinkingBudget and no includeThoughts (no thought summaries).
 */
export const MAX_OUTPUT_TOKENS = 8192;
export const THINKING_LEVEL = 'low';
export const PHASE3_GENERATION_CONFIG = Object.freeze({ maxOutputTokens: MAX_OUTPUT_TOKENS, thinkingConfig: Object.freeze({ thinkingLevel: THINKING_LEVEL }) });
/**
 * Phase 3 owns its model choice on purpose. The shared GEMINI_AGE_MODEL in lib/smart-lookup/provider.js
 * (gemini-2.5-flash) serves existing Smart Lookup paths and is deliberately NOT touched or reused here:
 * the first live smoke showed it returns 404 "no longer available to new users".
 * Request shape follows the documented generateContent grounding call: tools: [{ google_search: {} }].
 */
export const PHASE3_GEMINI_MODEL = 'gemini-3.8-flash';

// A model/provider CONFIGURATION failure (retrying or sending the next job with the same model cannot help), as
// opposed to any other 404/400. Both the HTTP status and Google's error status must agree, and the message must be about the model.
const MODEL_FAILURE_MESSAGE = /\bmodels?\b.{0,160}\b(?:not found|no longer available|not available|unavailable|not supported|unsupported|deprecated)\b|\b(?:not found|no longer available|not available|unavailable|not supported|unsupported)\b.{0,160}\bmodels?\b/i;
const MAX_ERROR_MESSAGE_CHARS = 500;

const providerError = (code, message, options = {}) => new SmartLookupProviderError(code, message, { provider: 'gemini', ...options });

/** Reads the error body ONLY to classify it. Provider text is never stored, thrown or returned. */
async function isModelUnavailable(response, status) {
  if (status !== 404 && status !== 400) return false;
  let body;
  try { body = await response.json(); } catch (_) { return false; }
  const message = typeof body?.error?.message === 'string' ? body.error.message.slice(0, MAX_ERROR_MESSAGE_CHARS) : '';
  const expectedStatus = status === 404 ? 'NOT_FOUND' : 'INVALID_ARGUMENT';
  return body?.error?.status === expectedStatus && MODEL_FAILURE_MESSAGE.test(message);
}

function retryAfterSeconds(response) {
  const value = Number(response?.headers?.get ? response.headers.get('retry-after') : NaN);
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function markCooldown(cooldown, redis, deadline, seconds) {
  if (!cooldown) return;
  try { await cooldown.mark(redis, deadline, { retryAfterSeconds: seconds }); } catch (_) { /* best effort; never masks the 429 */ }
}

async function parseResponse(response, attempt) {
  let data;
  try { data = await response.json(); } catch (_) { throw providerError('PROVIDER_RESPONSE_INVALID', 'Gemini response was not JSON'); }
  attempt.usage = usageFromGemini(data);
  const candidate = data?.candidates?.[0];
  const text = Array.isArray(candidate?.content?.parts) ? candidate.content.parts.map((part) => part?.text).filter(Boolean).join('') : '';
  const json = extractJsonFromText(text);
  if (!json) throw providerError(text ? 'PROVIDER_MALFORMED_JSON' : 'PROVIDER_EMPTY', 'Gemini returned no structured output');
  try { return { parsed: JSON.parse(json), grounding: parseGroundingSources(candidate) }; } catch (_) { throw providerError('PROVIDER_MALFORMED_JSON', 'Gemini returned malformed JSON'); }
}

async function sendRequest({ fetchImpl, model, key, prompt, signal, attempt }) {
  try {
    attempt.requestSent = true;
    return await fetchImpl(`${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      // Grounded calls cannot request responseMimeType JSON; the text is fence-stripped and parsed instead.
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: PHASE3_GENERATION_CONFIG }),
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    // Static message on purpose: transport errors must never echo request details or the key.
    throw providerError('PROVIDER_NETWORK_ERROR', 'Gemini provider network error');
  }
}

/**
 * @param {object} options
 * @param {(ctx: {stage: string}) => Promise<{allowed: boolean}>} options.budgetGate  REQUIRED. Called before every request; must fail closed.
 * @param {{isActive: Function, mark: Function}} [options.cooldown]  shared Gemini cooldown (createGeminiCooldown)
 * @returns {(call: {prompt: string, stage: string, deadline: object, signal?: AbortSignal}) => Promise<{parsed: object, grounding: object}>}
 * The caller (grounded research provider) owns the time bound and supplies the abort `signal`.
 */
export function createGeminiGroundedTransport({ apiKey, env = process.env, fetchImpl = globalThis.fetch, model = PHASE3_GEMINI_MODEL, cooldown = null, redis = null, budgetGate } = {}) {
  if (typeof budgetGate !== 'function') throw new TypeError('budgetGate is required for live Gemini research');
  return async function groundedTransport({ prompt, stage, deadline, signal }) {
    const key = apiKey ?? env?.GEMINI_API_KEY;
    if (!key) throw providerError('PROVIDER_NOT_CONFIGURED', 'Gemini provider is not configured');
    if (!deadline) throw providerError('MISSING_DEADLINE', 'Research deadline is required');
    if (cooldown && await cooldown.isActive(redis, deadline)) throw providerError('GEMINI_COOLDOWN_ACTIVE', 'Gemini is cooling down after a rate limit');
    const gate = await budgetGate({ stage });
    if (!gate || gate.allowed !== true) throw providerError('LIVE_BUDGET_DENIED', 'Live research budget denied');

    const startedAt = Date.now();
    const attempt = { requestSent: false, httpStatus: null, usage: {} };
    const report = (providerStatus, error = null) => (attempt.requestSent
      ? recordProviderAttempt({ provider: 'gemini', model, providerStatus, httpStatus: attempt.httpStatus, durationMs: Date.now() - startedAt, retryAfterSeconds: error?.retryAfterSeconds ?? null, ...attempt.usage })
      : null);
    let result;
    try {
      const response = await sendRequest({ fetchImpl, model, key, prompt, signal, attempt });
      attempt.httpStatus = Number(response.status || 0);
      if (!response.ok) {
        if (attempt.httpStatus === 429) {
          const seconds = retryAfterSeconds(response);
          await markCooldown(cooldown, redis, deadline, seconds);
          throw providerError('PROVIDER_RATE_LIMIT', 'Gemini provider rate limit', { status: 429, retryAfterSeconds: seconds });
        }
        if (await isModelUnavailable(response, attempt.httpStatus)) throw providerError('PROVIDER_MODEL_UNAVAILABLE', 'Gemini model is not available', { status: attempt.httpStatus });
        throw providerError(attempt.httpStatus >= 500 ? 'PROVIDER_5XX' : 'PROVIDER_HTTP_ERROR', 'Gemini provider request failed', { status: attempt.httpStatus });
      }
      result = await parseResponse(response, attempt);
    } catch (error) {
      await report(classifyProviderFailure(error), error);
      throw error;
    }
    await report(ATTEMPT_STATUS.OK);
    return result;
  };
}
