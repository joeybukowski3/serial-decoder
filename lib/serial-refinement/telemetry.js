/**
 * Standardized Serial Refinement telemetry + cost proxies.
 * Intentionally avoids serial numbers, API keys, and unbounded free text.
 */

import { hashModelIdentifier } from './cache-key.js';
import { buildFailureEnvelope } from '../lookup-failure-taxonomy.js';
import { persistentStoreTelemetryFields } from '../model-evidence-store/telemetry-fields.js';

/**
 * Approximate cost proxies (USD) for operational rollups.
 * Not a billing source of truth — order-of-magnitude only.
 */
export const COST_PROXIES_USD = Object.freeze({
  serperQuery: 0.001,
  geminiExtraction: 0.0025,
  geminiGrounded: 0.01,
  openaiHeavy: 0.015,
  xaiHeavy: 0.012,
});

/**
 * Build a cost-proxy snapshot from provider activity.
 * @param {{
 *   searchQueryCount?: number,
 *   serperCallCount?: number,
 *   geminiExtractionRan?: boolean,
 *   geminiGroundedRan?: boolean,
 *   heavyProvider?: string|null,
 *   cacheHit?: boolean,
 *   promptTokens?: number|null,
 *   completionTokens?: number|null,
 *   providerReportedCostUsd?: number|null,
 * }} input
 */
export function buildCostProxy(input = {}) {
  const searchQueryCount = Math.max(0, Number(input.searchQueryCount) || 0);
  const serperCallCount = Math.max(0, Number(input.serperCallCount) || searchQueryCount || 0);
  const geminiExtractionRan = Boolean(input.geminiExtractionRan);
  const geminiGroundedRan = Boolean(input.geminiGroundedRan);
  const heavyProvider = input.heavyProvider || null;
  const cacheHit = Boolean(input.cacheHit);

  let estimatedCostUsd = 0;
  if (!cacheHit) {
    estimatedCostUsd += serperCallCount * COST_PROXIES_USD.serperQuery;
    if (geminiExtractionRan) estimatedCostUsd += COST_PROXIES_USD.geminiExtraction;
    if (geminiGroundedRan) estimatedCostUsd += COST_PROXIES_USD.geminiGrounded;
    if (heavyProvider === 'openai') estimatedCostUsd += COST_PROXIES_USD.openaiHeavy;
    if (heavyProvider === 'xai') estimatedCostUsd += COST_PROXIES_USD.xaiHeavy;
  }

  const promptTokens = Number.isFinite(input.promptTokens) ? input.promptTokens : null;
  const completionTokens = Number.isFinite(input.completionTokens) ? input.completionTokens : null;
  const totalTokens = (promptTokens != null || completionTokens != null)
    ? (promptTokens || 0) + (completionTokens || 0)
    : null;

  return {
    searchQueryCount,
    serperCallCount,
    geminiExtractionRan,
    geminiGroundedRan,
    heavyProviderRan: Boolean(heavyProvider) || geminiGroundedRan,
    heavyProvider: heavyProvider || (geminiGroundedRan ? 'gemini-grounded' : null),
    providerAttemptCount: Math.max(
      0,
      Number(input.providerAttemptCount)
        || ((serperCallCount > 0 ? 1 : 0)
          + (geminiExtractionRan ? 1 : 0)
          + (geminiGroundedRan ? 1 : 0)
          + (heavyProvider ? 1 : 0)),
    ),
    cacheHit,
    promptTokens,
    completionTokens,
    totalTokens,
    providerReportedCostUsd: Number.isFinite(input.providerReportedCostUsd)
      ? input.providerReportedCostUsd
      : null,
    estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
  };
}

/**
 * Build the standard serial_refinement log event.
 * Drop raw serials and free-form user context.
 */
export function buildRefinementTelemetryEvent(fields = {}) {
  const failure = buildFailureEnvelope({
    errorCode: fields.errorCode || fields.failureCode,
    failureStage: fields.failureStage,
    failureCategory: fields.failureCategory,
    sharedFailureCategory: fields.sharedFailureCategory,
    deterministicFallbackUsed: fields.deterministicFallbackUsed,
  }, {
    status: fields.status,
    refinementResultTier: fields.refinementResultTier || fields.resultTier,
    remainingCandidateYears: fields.remainingCandidateYears,
    modelProductionRange: fields.modelProductionRange
      || (fields.modelEraStart != null || fields.modelEraEnd != null
        ? { start: fields.modelEraStart ?? null, end: fields.modelEraEnd ?? null }
        : null),
    deterministicFallbackUsed: fields.deterministicFallbackUsed,
  });

  const cost = fields.cost || buildCostProxy({
    searchQueryCount: fields.searchQueryCount,
    serperCallCount: fields.serperCallCount,
    geminiExtractionRan: fields.geminiExtractionRan,
    geminiGroundedRan: fields.geminiGroundedRan,
    heavyProvider: fields.heavyProvider,
    cacheHit: fields.cacheStatus === 'hit',
    promptTokens: fields.promptTokens,
    completionTokens: fields.completionTokens,
    providerReportedCostUsd: fields.providerReportedCostUsd,
    providerAttemptCount: fields.providerAttemptCount,
  });

  return {
    event: 'serial_refinement',
    requestId: fields.requestId || null,
    routeType: 'serial_refinement',
    refinementMode: fields.refinementMode || fields.mode || null,
    queryHash: fields.queryHash
      || (fields.enteredModel ? hashModelIdentifier(fields.enteredModel) : null),
    enteredBrand: fields.enteredBrand || fields.brand || null,
    enteredModel: fields.enteredModel || null,
    canonicalModel: fields.canonicalModel || null,
    searchedModels: Array.isArray(fields.searchedModels) ? fields.searchedModels : null,
    equivalenceReason: fields.equivalenceReason || null,
    identityMatchType: fields.identityMatchType || null,
    identityConfidence: fields.identityConfidence || null,
    normalizationApplied: fields.normalizationApplied == null
      ? null
      : Boolean(fields.normalizationApplied),

    localEvidenceHit: fields.localEvidenceHit == null ? null : Boolean(fields.localEvidenceHit),
    productionDatabaseHit: fields.productionDatabaseHit == null
      ? null
      : Boolean(fields.productionDatabaseHit),
    cacheStatus: fields.cacheStatus || null,
    sharedEvidenceAttempted: Boolean(fields.sharedEvidenceAttempted),
    sharedEvidenceAccepted: Boolean(fields.sharedEvidenceAccepted),
    // Native Gemini + Google Search is the primary research path; these three
    // fields measure how often it serves the result vs. falls back.
    nativeResearchAttempted: Boolean(fields.nativeResearchAttempted),
    nativeResearchAccepted: Boolean(fields.nativeResearchAccepted),
    nativeResearchFailureCode: fields.nativeResearchFailureCode || null,
    searchResultCount: Number.isFinite(fields.searchResultCount) ? fields.searchResultCount : null,
    evidenceFactCount: Number.isFinite(fields.evidenceFactCount) ? fields.evidenceFactCount : null,
    evidenceMatchType: fields.evidenceMatchType || null,
    evidenceMatchModel: fields.evidenceMatchModel || null,
    evidenceRejectedReason: fields.evidenceRejectedReason || failure.failureCategory || null,

    serialCandidateYears: Array.isArray(fields.serialCandidateYears)
      ? fields.serialCandidateYears
      : (Array.isArray(fields.candidateYears) ? fields.candidateYears : null),
    preferredCandidateYear: fields.preferredCandidateYear ?? null,
    remainingCandidateYears: Array.isArray(fields.remainingCandidateYears)
      ? fields.remainingCandidateYears
      : null,
    candidatesPreserved: fields.candidatesPreserved == null
      ? true
      : Boolean(fields.candidatesPreserved),
    modelEraStart: fields.modelEraStart ?? null,
    modelEraEnd: fields.modelEraEnd ?? null,
    resultTier: fields.refinementResultTier || fields.resultTier || fields.status || null,
    status: fields.status || null,
    provider: fields.provider || null,

    failureCategory: failure.failureCategory,
    failureStage: failure.failureStage,
    failureCode: failure.failureCode,
    resultTierReturned: failure.resultTierReturned,
    deterministicFallbackUsed: failure.deterministicFallbackUsed,
    usefulContextPreserved: failure.usefulContextPreserved,

    serperDurationMs: Number.isFinite(fields.serperDurationMs) ? fields.serperDurationMs : null,
    geminiDurationMs: Number.isFinite(fields.geminiDurationMs) ? fields.geminiDurationMs : null,
    providerDurationMs: Number.isFinite(fields.providerDurationMs) ? fields.providerDurationMs : null,
    localMs: Number.isFinite(fields.localMs) ? fields.localMs : null,
    cacheMs: Number.isFinite(fields.cacheMs) ? fields.cacheMs : null,
    onlineLookupMs: Number.isFinite(fields.onlineLookupMs) ? fields.onlineLookupMs : null,
    totalMs: Number.isFinite(fields.totalMs) ? fields.totalMs : null,
    inflightShared: fields.inflightShared == null ? null : Boolean(fields.inflightShared),
    retryRequested: fields.retryRequested == null ? null : Boolean(fields.retryRequested),

    // --- Persistent model evidence store (Phase 3B) -------------------------
    // Same projection as lib/smart-lookup/telemetry.js. Both allowlists import
    // it so a field can never be added to one and forgotten in the other.
    ...persistentStoreTelemetryFields(fields),

    cost,
  };
}

export function logRefinementTelemetry(logger, fields = {}) {
  try {
    const event = buildRefinementTelemetryEvent(fields);
    (logger || console).info(JSON.stringify(event));
    return event;
  } catch (_) {
    return null;
  }
}
