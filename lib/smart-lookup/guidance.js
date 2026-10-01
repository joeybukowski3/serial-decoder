import { normalizeSmartAgeResult } from './result-schema.js';
import { buildGeneralGuidanceResult } from './static-results.js';
import { ROUTE_MODES } from './outcome.js';
import { boundedRateLimit } from './redis.js';
import { reserveGuidanceBudget } from './budget.js';
import { withAttemptAccounting } from './provider-attempts.js';
import {
  callGuidanceProvider,
  getGuidanceModel,
  getGuidanceTimeoutMs,
} from './guidance-provider.js';

// Reserve kept for the rest of the request after the cheap call.
const GUIDANCE_RESERVE_MS = 350;
const GUIDANCE_MIN_REMAINING_MS = 1200;

/**
 * GENERAL_GUIDANCE orchestration.
 *
 * The deterministic card is always built first and is always a valid answer.
 * The cheap ungrounded model call is an optional enrichment: it is attempted
 * only when enabled, within the per-IP limiter and the separate guidance
 * budget (both fail closed), and any failure, rejection or empty output falls
 * back to the deterministic card. It never needs a research credit.
 *
 * @returns {Promise<{result: object, enrichment: string, attempted: boolean, model: string|null, failureCode: string|null}>}
 */
export async function buildGeneralGuidance({
  queryInfo,
  timings,
  currentYear,
  cacheStatus,
  deadline,
  redis,
  rateLimiter,
  clientId,
  env = process.env,
  enabled = false,
  providerLookup = callGuidanceProvider,
  reserveBudget = reserveGuidanceBudget,
  apiKey,
  fetchImpl,
}) {
  const base = buildGeneralGuidanceResult(queryInfo);
  const baseOptions = {
    queryInfo,
    source: 'static',
    originSource: 'static',
    evidenceSource: 'heuristic',
    cacheStatus,
    providerAttempted: false,
    fallbackUsed: false,
    timings,
    currentYear,
    routeMode: ROUTE_MODES.GENERAL_GUIDANCE,
  };
  const deterministic = (extra = {}) => normalizeSmartAgeResult(base, { ...baseOptions, ...extra });
  const skipped = (enrichment) => ({
    result: deterministic(), enrichment, attempted: false, model: null, failureCode: null,
  });

  if (!enabled) return skipped('disabled');
  if (!deadline.hasTime(GUIDANCE_MIN_REMAINING_MS, GUIDANCE_RESERVE_MS)) return skipped('skipped-deadline');

  const rate = await boundedRateLimit(rateLimiter, clientId, deadline, {
    stage: 'guidance-rate-limit',
    maxMs: 250,
    reserveMs: 400,
    failClosed: true,
  });
  if (!rate.success) return skipped(rate.storeUnavailable ? 'skipped-store' : 'skipped-rate-limit');

  const budget = await reserveBudget(redis, deadline, { env, stage: 'guidance-budget', maxMs: 250, reserveMs: 400 });
  if (!budget.allowed) return skipped(budget.status === 'unavailable' ? 'skipped-store' : 'skipped-budget');

  const model = getGuidanceModel(env);
  let output;
  try {
    output = await withAttemptAccounting({ provider: 'gemini', model }, () => providerLookup(queryInfo, {
      env,
      apiKey,
      fetchImpl,
      model,
      timeoutMs: Math.min(getGuidanceTimeoutMs(env), deadline.remainingMs(GUIDANCE_RESERVE_MS)),
    }));
  } catch (error) {
    return {
      result: deterministic({ providerAttempted: true }),
      enrichment: 'failed',
      attempted: true,
      model,
      failureCode: error?.code || 'PROVIDER_UNAVAILABLE',
    };
  }

  const nextSteps = Array.isArray(output?.nextSteps) ? output.nextSteps : [];
  if (!output?.productContext && !nextSteps.length) {
    return {
      result: deterministic({ providerAttempted: true }),
      enrichment: output?.rejected ? 'rejected-claims' : 'empty',
      attempted: true,
      model,
      failureCode: null,
    };
  }

  const merged = {
    ...base,
    summary: output.productContext || null,
    recommendedIdentifiers: [...base.recommendedIdentifiers, ...nextSteps].slice(0, 6),
  };
  return {
    result: normalizeSmartAgeResult(merged, {
      ...baseOptions,
      source: 'gemini',
      originSource: 'gemini',
      evidenceSource: 'gemini-ungrounded',
      providerAttempted: true,
      groundedSources: [],
      webSearchUsed: false,
    }),
    enrichment: output.rejected ? 'ok-partial' : 'ok',
    attempted: true,
    model,
    failureCode: null,
  };
}
