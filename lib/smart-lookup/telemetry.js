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
    timings: fields.timings || null,
  };
  try {
    (logger || console).info(JSON.stringify(safe));
  } catch (_) {}
}
