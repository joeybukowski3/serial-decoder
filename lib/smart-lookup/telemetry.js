import { hashCanonicalQuery } from './cache.js';

export function createRequestId(req, prefix = 'smart') {
  return String(
    req?.headers?.['x-request-id'] ||
    req?.headers?.['x-vercel-id'] ||
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
}

export function logSmartLookup(logger, fields = {}) {
  const safe = {
    event: fields.event || 'smart_lookup',
    requestId: fields.requestId || null,
    queryHash: fields.canonicalQuery ? hashCanonicalQuery(fields.canonicalQuery) : fields.queryHash || null,
    specificityLevel: fields.specificityLevel || null,
    source: fields.source || null,
    evidenceSource: fields.evidenceSource || null,
    cacheStatus: fields.cacheStatus || null,
    providerAttempted: Boolean(fields.providerAttempted),
    fallbackUsed: Boolean(fields.fallbackUsed),
    budgetStatus: fields.budgetStatus || null,
    logicalLookupCount: Number.isFinite(fields.logicalLookupCount) ? fields.logicalLookupCount : null,
    actualProviderAttemptCount: Number.isFinite(fields.actualProviderAttemptCount) ? fields.actualProviderAttemptCount : null,
    timeoutStage: fields.timeoutStage || null,
    errorCode: fields.errorCode || null,
    grounded: fields.grounded === undefined ? null : Boolean(fields.grounded),
    groundedSourceCount: Number.isFinite(fields.groundedSourceCount) ? fields.groundedSourceCount : null,
    groundedAttempted: Boolean(fields.groundedAttempted),
    groundedSucceeded: Boolean(fields.groundedSucceeded),
    groundedFailureCode: fields.groundedFailureCode || null,
    groundedDurationMs: Number.isFinite(fields.groundedDurationMs) ? fields.groundedDurationMs : null,
    fallbackAttempted: Boolean(fields.fallbackAttempted),
    fallbackProvider: fields.fallbackProvider || null,
    fallbackSucceeded: fields.fallbackSucceeded == null ? null : Boolean(fields.fallbackSucceeded),
    fallbackDurationMs: Number.isFinite(fields.fallbackDurationMs) ? fields.fallbackDurationMs : null,
    // LKQ-specific fields, kept distinct from the generic grounded/fallback
    // fields above (which age-lookup populates) so a smart_lkq_lookup log
    // line is unambiguous about which subsystem's grounded attempt it
    // describes, even though both events share this one logger.
    lkqRequested: fields.lkqRequested === undefined ? null : Boolean(fields.lkqRequested),
    lkqGroundedAttempted: Boolean(fields.lkqGroundedAttempted),
    lkqGroundedSucceeded: Boolean(fields.lkqGroundedSucceeded),
    lkqGroundedSourceCount: Number.isFinite(fields.lkqGroundedSourceCount) ? fields.lkqGroundedSourceCount : null,
    lkqGroundedDurationMs: Number.isFinite(fields.lkqGroundedDurationMs) ? fields.lkqGroundedDurationMs : null,
    lkqFallbackAttempted: Boolean(fields.lkqFallbackAttempted),
    lkqFallbackProvider: fields.lkqFallbackProvider || null,
    lkqFallbackSucceeded: fields.lkqFallbackSucceeded == null ? null : Boolean(fields.lkqFallbackSucceeded),
    lkqFallbackDurationMs: Number.isFinite(fields.lkqFallbackDurationMs) ? fields.lkqFallbackDurationMs : null,
    // --- Latency-diagnosis fields -------------------------------------------
    // Added to answer "which stage actually expired, and was there time left
    // to recover?" without raising any budget. All are categorical or numeric;
    // none can carry a raw query, model, serial, tag, note, or URL. This
    // allowlist is exhaustive by construction -- any field not named here is
    // dropped before serialization -- so these additions cannot widen exposure.
    routeType: fields.routeType || null,
    identityLevel: fields.identityLevel || null,
    providerEligible: fields.providerEligible === undefined ? null : Boolean(fields.providerEligible),
    groundedEligible: fields.groundedEligible === undefined ? null : Boolean(fields.groundedEligible),
    localEvidenceHit: fields.localEvidenceHit === undefined ? null : Boolean(fields.localEvidenceHit),
    // The single most diagnostic value for a grounded timeout: how much route
    // budget remained once grounding gave up. A recovery that never runs
    // because ~0ms was left is a different problem from one that runs and
    // fails, and the two were previously indistinguishable in logs.
    remainingMsAfterGrounded: Number.isFinite(fields.remainingMsAfterGrounded) ? fields.remainingMsAfterGrounded : null,
    inFlightShared: fields.inFlightShared === undefined ? null : Boolean(fields.inFlightShared),
    deterministicFallbackUsed: fields.deterministicFallbackUsed === undefined ? null : Boolean(fields.deterministicFallbackUsed),
    resultEvidenceType: fields.resultEvidenceType || null,
    sharedEvidenceAttempted: Boolean(fields.sharedEvidenceAttempted),
    sharedEvidenceAccepted: Boolean(fields.sharedEvidenceAccepted),
    sharedEvidenceFailureCode: fields.sharedEvidenceFailureCode || null,
    sharedEvidenceDurationMs: Number.isFinite(fields.sharedEvidenceDurationMs) ? fields.sharedEvidenceDurationMs : null,
    serperDurationMs: Number.isFinite(fields.serperDurationMs) ? fields.serperDurationMs : null,
    geminiDurationMs: Number.isFinite(fields.geminiDurationMs) ? fields.geminiDurationMs : null,
    heavyProviderSelected: fields.heavyProviderSelected || null,
    heavyProviderAttempted: Boolean(fields.heavyProviderAttempted),
    heavyProviderDurationMs: Number.isFinite(fields.heavyProviderDurationMs) ? fields.heavyProviderDurationMs : null,
    secondaryHeavyProviderSkipped: Boolean(fields.secondaryHeavyProviderSkipped),
    estimateBasis: fields.estimateBasis || null,
    estimatePrecision: fields.estimatePrecision || null,
    // These four were emitted by api/lkq-lookup.js from the progressive-LKQ
    // work but were never added to this allowlist, so they were silently
    // dropped before serialization and never reached production logs.
    replacementPrecision: fields.replacementPrecision || null,
    originalIdentityLevel: fields.originalIdentityLevel || null,
    candidateCount: Number.isFinite(fields.candidateCount) ? fields.candidateCount : null,
    sameBrandCandidateCount: Number.isFinite(fields.sameBrandCandidateCount) ? fields.sameBrandCandidateCount : null,
    replacementRelationship: fields.replacementRelationship || null,
    compatibilityStatus: fields.compatibilityStatus || null,
    priceObservationCount: Number.isFinite(fields.priceObservationCount) ? fields.priceObservationCount : null,
    priceRangeProduced: fields.priceRangeProduced === undefined ? null : Boolean(fields.priceRangeProduced),
    timings: fields.timings || null,
  };
  try {
    (logger || console).info(JSON.stringify(safe));
  } catch (_) {}
}
