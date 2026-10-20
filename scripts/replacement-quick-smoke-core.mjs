/**
 * Core of the MANUAL, local-only live smoke test for Fast Answer. Nothing imports this except scripts/replacement-quick-smoke.mjs
 * and its offline test; it is never part of a build or route. It is independent of the Phase 2A brief smoke harness.
 *
 * Safety model (every layer is enforced in code and covered by tests/lib/replacement-quick-smoke.test.mjs):
 *  - Dry run by default. A live run needs the env flag, --confirm-live AND the exact --approve token.
 *  - Refuses to run when it looks like a production/Vercel environment, or when GEMINI_API_KEY is missing.
 *  - ONE ungrounded request: a fetch guard allows exactly one POST to the one generateContent URL of the Fast Answer model,
 *    redirects off, and throws before any network call for anything else (a second request, another URL, or a body with `tools`).
 *  - getQuickAnswer never retries and has its own 5.5 s end-to-end timeout.
 *  - Output is a sanitized JSON file outside the repository; the API key and request headers are never written or printed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildQuickRequestBody, getQuickAnswer, quickEndpoint } from '../lib/replacement-quick/quick-answer.js';
import { QUICK_GENERATION_CONFIG, QUICK_JSON_SHAPE, QUICK_MAX_OUTPUT_TOKENS, QUICK_MODEL, QUICK_TIMEOUT_MS, buildQuickPrompt } from '../lib/replacement-quick/quick-prompt.js';

export const SMOKE_QUERY = 'LG C3 OLED TV';
export const APPROVAL_TOKEN = 'LGC3OLED-QUICK-1-REQUEST';
export const LIVE_ENV_FLAG = 'ITEMASSIST_LIVE_QUICK_SMOKE';
export const REQUEST_CAP = 1;
export const HARD_STOP_MS = QUICK_TIMEOUT_MS + 2_500;

/** Published Gemini API pricing for gemini-3.5-flash-lite, read from the pricing page on 2026-10-19. Output includes thinking tokens. */
export const PRICING = Object.freeze({
  model: QUICK_MODEL, source: 'https://ai.google.dev/gemini-api/docs/pricing', readOn: '2026-10-19', inputPerMillionUsd: 0.30, outputPerMillionUsd: 2.50,
});

const safeInt = (value) => (Number.isFinite(value) && value >= 0 ? Math.round(value) : null);
const round = (value) => Math.round(value * 1e6) / 1e6;

export function estimateCost({ inputTokens, outputTokens, thinkingTokens = 0 }) {
  return round(((inputTokens || 0) * PRICING.inputPerMillionUsd + ((outputTokens || 0) + (thinkingTokens || 0)) * PRICING.outputPerMillionUsd) / 1e6);
}

/** Upper bound before sending: the prompt is estimated conservatively (3 chars/token) and output + thinking is assumed to hit the cap. */
export function estimateUpperBound(promptChars) {
  const inputTokens = Math.ceil(promptChars / 3);
  return { inputTokens, outputPlusThinkingTokens: QUICK_MAX_OUTPUT_TOKENS, totalUsd: estimateCost({ inputTokens, outputTokens: QUICK_MAX_OUTPUT_TOKENS }) };
}

/** What is still needed before a live run. Empty means every gate is open. */
export function missingApprovals({ argv, env }) {
  const missing = [];
  if (env[LIVE_ENV_FLAG] !== '1') missing.push(`set ${LIVE_ENV_FLAG}=1`);
  if (!argv.includes('--confirm-live')) missing.push('pass --confirm-live');
  if (!argv.includes(`--approve=${APPROVAL_TOKEN}`)) missing.push(`pass --approve=${APPROVAL_TOKEN}`);
  return missing;
}

export const looksLikeProduction = (env) => Boolean(env.VERCEL || env.VERCEL_ENV || env.NODE_ENV === 'production');

/** Removes the API key value and anything shaped like a Google API key from the text that will be written. */
export function scrub(text, apiKey) {
  let out = String(text).replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted]');
  if (apiKey && apiKey.length >= 8) out = out.split(apiKey).join('[redacted]');
  return out;
}

function requestHasTools(init) {
  try {
    const body = JSON.parse(String(init.body || '{}'));
    return Object.keys(body).some((key) => /^tool/i.test(key)) || 'tools' in (body.generationConfig || {});
  } catch {
    return true; // an unreadable body is not allowed through
  }
}

/** The only door to the network. One POST to the one Gemini URL, no tools, redirects off; everything else throws BEFORE any request. */
export function createGuardedFetch(fetchImpl) {
  const state = { requests: 0, blocked: [], response: null, latencyMs: null };
  const guarded = async (url, init = {}) => {
    const block = (reason) => { state.blocked.push(reason); throw new Error(reason); };
    if (String(url) !== quickEndpoint()) block('SMOKE_BLOCKED_URL');
    if ((init.method || 'GET').toUpperCase() !== 'POST') block('SMOKE_BLOCKED_METHOD');
    if (requestHasTools(init)) block('SMOKE_BLOCKED_TOOLS');
    if (state.requests >= REQUEST_CAP) block('SMOKE_REQUEST_CAP_REACHED');
    state.requests += 1;
    const startedAt = Date.now();
    const response = await fetchImpl(url, { ...init, redirect: 'error' });
    state.latencyMs = Date.now() - startedAt;
    state.response = await readResponseFacts(response);
    return response;
  };
  guarded.state = state;
  return guarded;
}

async function readResponseFacts(response) {
  const facts = { httpStatus: Number(response?.status || 0), finishReason: null, usage: null };
  if (!response?.ok) return facts; // an error body is never read or stored
  try {
    const body = await response.clone().json();
    const usage = body?.usageMetadata;
    return {
      ...facts,
      finishReason: typeof body?.candidates?.[0]?.finishReason === 'string' ? body.candidates[0].finishReason : null,
      usage: usage ? { promptTokenCount: safeInt(usage.promptTokenCount), candidatesTokenCount: safeInt(usage.candidatesTokenCount), thoughtsTokenCount: safeInt(usage.thoughtsTokenCount), totalTokenCount: safeInt(usage.totalTokenCount) } : null,
    };
  } catch { return facts; }
}

function dryRunReport(missing) {
  const prompt = buildQuickPrompt(SMOKE_QUERY);
  return {
    query: SMOKE_QUERY, model: QUICK_MODEL, endpoint: quickEndpoint(), plannedRequests: REQUEST_CAP, retries: 0, timeoutMs: QUICK_TIMEOUT_MS,
    tools: 'none (no Google Search, no grounding)', generationConfig: QUICK_GENERATION_CONFIG, pricing: PRICING,
    size: { promptChars: prompt.length, jsonShapeChars: QUICK_JSON_SHAPE.length, requestBodyChars: JSON.stringify(buildQuickRequestBody(SMOKE_QUERY)).length },
    upperBoundCost: estimateUpperBound(prompt.length), stillNeededForLive: missing, called: 'nothing',
  };
}

/** @returns {Promise<{mode: 'DRY_RUN'|'LIVE'|'REFUSED', exitCode: number, report: object, outputPath: string|null}>} */
export async function runQuickSmoke({ argv = [], env = process.env, fetchImpl = globalThis.fetch, outputDir = null, now = () => new Date(), print = () => {} } = {}) {
  const missing = missingApprovals({ argv, env });
  if (missing.length) return { mode: 'DRY_RUN', exitCode: 0, outputPath: null, report: dryRunReport(missing) };
  const refuse = (refused) => ({ mode: 'REFUSED', exitCode: 2, outputPath: null, report: { query: SMOKE_QUERY, model: QUICK_MODEL, refused } });
  if (looksLikeProduction(env)) return refuse('PRODUCTION_ENVIRONMENT_DETECTED');
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) return refuse('GEMINI_API_KEY_NOT_SET');

  const guard = createGuardedFetch(fetchImpl);
  const { answer, meta } = await getQuickAnswer(SMOKE_QUERY, { apiKey, fetchImpl: guard, timeoutMs: QUICK_TIMEOUT_MS, captureRaw: true });
  const facts = guard.state.response;
  const report = {
    query: SMOKE_QUERY, model: QUICK_MODEL, ranAt: now().toISOString(), requestsSent: guard.state.requests, blockedRequests: guard.state.blocked, retries: 0,
    httpStatus: facts?.httpStatus ?? meta.httpStatus, latencyMs: { request: guard.state.latencyMs, total: meta.durationMs }, errorCode: meta.errorCode,
    finishReason: facts?.finishReason ?? meta.finishReason, tokens: facts?.usage ?? null,
    estimatedActualCost: facts?.usage ? estimateCost({ inputTokens: facts.usage.promptTokenCount, outputTokens: facts.usage.candidatesTokenCount, thinkingTokens: facts.usage.thoughtsTokenCount }) : null,
    rawTextChars: meta.rawTextChars, rawText: meta.rawText ?? null, answer,
  };
  const text = scrub(JSON.stringify(report, null, 2), apiKey);
  if (text.includes(apiKey)) throw new Error('SMOKE_OUTPUT_CONTAINS_KEY');
  const dir = outputDir || join(tmpdir(), 'itemassist-replacement-quick-smoke');
  mkdirSync(dir, { recursive: true });
  const outputPath = join(dir, `quick-smoke-${now().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(outputPath, text, 'utf8');
  print(`wrote ${outputPath}`);
  return { mode: 'LIVE', exitCode: meta.errorCode ? 1 : 0, outputPath, report: JSON.parse(text) };
}
