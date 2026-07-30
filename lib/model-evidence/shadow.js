import { createHash } from 'node:crypto';

const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on']);

function safeErrorCode(error) {
  const value = String(error?.code || error?.name || 'SHADOW_ERROR').trim().toUpperCase();
  return /^[A-Z][A-Z0-9_]{0,63}$/.test(value) ? value : 'SHADOW_ERROR';
}

function modelHash(value) {
  return createHash('sha256')
    .update(String(value || '').trim().toUpperCase())
    .digest('hex')
    .slice(0, 16);
}

function selectedShadowYear(deterministic) {
  if (deterministic?.output?.resolutionType !== 'resolved-single') return null;
  return Number.isInteger(deterministic.output.bestEstimateYear)
    ? deterministic.output.bestEstimateYear
    : null;
}

function refinementAgreement(primary, deterministic) {
  const primaryYear = Number.isInteger(primary?.chosenYear) ? primary.chosenYear : null;
  const shadowYear = selectedShadowYear(deterministic);
  if (primaryYear !== null && shadowYear !== null) {
    return primaryYear === shadowYear ? 'selected_year_match' : 'selected_year_mismatch';
  }
  if (primaryYear !== null) return 'primary_only_resolved';
  if (shadowYear !== null) return 'shadow_only_resolved';
  return 'both_unresolved';
}

function validRange(value) {
  const start = Number(value?.start);
  const end = Number(value?.end);
  return Number.isInteger(start) && Number.isInteger(end) && end >= start
    ? { start, end }
    : null;
}

function smartLookupAgreement(primary, shadowResult) {
  const primaryRange = validRange(primary?.productionRange);
  const shadowRange = validRange(shadowResult?.productionRange);
  if (!primaryRange && !shadowRange) return 'both_without_range';
  if (primaryRange && !shadowRange) return 'primary_only_range';
  if (!primaryRange && shadowRange) return 'shadow_only_range';
  if (primaryRange.start === shadowRange.start && primaryRange.end === shadowRange.end) {
    return 'range_match';
  }
  if (primaryRange.start <= shadowRange.end && shadowRange.start <= primaryRange.end) {
    return 'range_overlap';
  }
  return 'range_disjoint';
}

function shadowTelemetryBase(outcome, context) {
  const shared = outcome.ok ? outcome.value?.sharedEvidence : null;
  const facts = Array.isArray(shared?.facts) ? shared.facts : [];
  return {
    event: 'model_evidence_shadow_comparison',
    feature: 'shared-model-evidence-shadow',
    consumer: context.consumer,
    requestHash: context.requestId ? modelHash(context.requestId) : null,
    normalizedBrand: String(context.brand || '').trim().toLowerCase() || null,
    modelHash: modelHash(context.model),
    shadowOutcome: outcome.ok ? 'completed' : 'error',
    shadowStatus: shared?.status || null,
    shadowFailureCategory: shared?.failureCategory
      || (!outcome.ok ? outcome.errorCode : null),
    shadowCacheStatus: shared?.cacheStatus || null,
    deterministicMatchType: shared?.matchedIdentity?.matchType || 'unknown',
    factCount: facts.length,
    lifecycleFactCount: facts.filter((item) => item?.fact?.target === 'model_lifecycle').length,
    shadowSearchCount: Number.isInteger(shared?.providerSummary?.searchCount)
      ? shared.providerSummary.searchCount
      : 0,
    shadowExtractorUsed: shared?.providerSummary?.extractorUsed === true,
    shadowDurationMs: outcome.durationMs,
  };
}

function logShadow(logger, payload) {
  try {
    logger?.info?.(JSON.stringify(payload));
  } catch (_) {}
}

export function isShadowModeEnabled(value) {
  return TRUTHY_VALUES.has(String(value || '').trim().toLowerCase());
}

export function startShadowTask(run, options = {}) {
  const now = options.now || Date.now;
  const startedAt = now();
  return Promise.resolve()
    .then(run)
    .then(
      (value) => ({
        ok: true,
        value,
        errorCode: null,
        durationMs: Math.max(0, now() - startedAt),
      }),
      (error) => ({
        ok: false,
        value: null,
        errorCode: safeErrorCode(error),
        durationMs: Math.max(0, now() - startedAt),
      }),
    );
}

export function observeRefinementShadow(task, context = {}) {
  if (!task) return;
  void Promise.resolve(task).then((outcome) => {
    const deterministic = outcome.ok ? outcome.value?.deterministic : null;
    const candidates = Array.isArray(context.candidateYears) ? context.candidateYears : [];
    const shadowYear = selectedShadowYear(deterministic);
    logShadow(context.logger, {
      ...shadowTelemetryBase(outcome, {
        ...context,
        consumer: 'model_refinement',
      }),
      primaryStatus: context.primary?.status || null,
      primaryProvider: context.primary?.provider || null,
      primaryResolved: Number.isInteger(context.primary?.chosenYear),
      shadowResolved: shadowYear !== null,
      agreement: outcome.ok
        ? refinementAgreement(context.primary, deterministic)
        : 'shadow_error',
      primaryRemainingCandidateCount: Array.isArray(context.primary?.remainingCandidateYears)
        ? context.primary.remainingCandidateYears.length
        : null,
      shadowRemainingCandidateCount: Array.isArray(deterministic?.output?.plausibleYears)
        ? deterministic.output.plausibleYears.length
        : null,
      shadowCandidateInvariant: shadowYear === null || candidates.includes(shadowYear),
    });
  }).catch(() => {});
}

export function observeSmartLookupShadow(task, context = {}) {
  if (!task) return;
  void Promise.resolve(task).then((outcome) => {
    const shadowResult = outcome.ok ? outcome.value?.result : null;
    logShadow(context.logger, {
      ...shadowTelemetryBase(outcome, {
        ...context,
        consumer: 'smart_lookup',
      }),
      primaryStatus: context.primary?.status || null,
      primarySource: context.primary?.source || null,
      primaryHasProductionRange: Boolean(validRange(context.primary?.productionRange)),
      shadowHasProductionRange: Boolean(validRange(shadowResult?.productionRange)),
      shadowExactModelAccepted: Boolean(shadowResult),
      agreement: outcome.ok
        ? smartLookupAgreement(context.primary, shadowResult)
        : 'shadow_error',
    });
  }).catch(() => {});
}
