/**
 * Cache TTL policy for Serial Refinement final responses and shared evidence.
 *
 * Evidence-layer TTLs live in deterministic/cache.js.
 * Final-response TTLs are applied by api/refine-serial-date.js.
 */

/** Resolved exact year with strong evidence — long-lived. */
export const RESOLVED_TTL_SECONDS = 60 * 60 * 24 * 60; // 60 days
/** Ranked / era-context useful results — intentional mid TTL. */
export const RANKED_OR_ERA_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days
/** Ambiguous (narrowed but no preferred) secondary TTL. */
export const AMBIGUOUS_TTL_SECONDS = 60 * 60 * 24 * 10; // 10 days
/** Provider timeout / rate-limit / thin negative — short. */
export const NEGATIVE_TTL_SECONDS = 60 * 15; // 15 minutes
/** Malformed provider / schema invalid — very short. */
export const MALFORMED_NEGATIVE_TTL_SECONDS = 60 * 5; // 5 minutes

/**
 * Choose final-response cache TTL.
 * @param {{ status?: string, confidence?: string|null, errorCode?: string|null, failureCategory?: string|null }} response
 * @returns {number} seconds (0 = do not cache)
 */
export function chooseRefinementCacheTtl(response = {}) {
  const status = response.status || response.refinementResultTier || null;
  const failureCategory = response.failureCategory || null;
  const errorCode = response.errorCode || response.failureCode || null;

  if (['global_deadline', 'search_timeout', 'extraction_timeout', 'budget_exhausted'].includes(failureCategory)
    || /TIMEOUT|BUDGET|RATE_LIMIT/i.test(String(errorCode || ''))) {
    return NEGATIVE_TTL_SECONDS;
  }
  if (['extraction_malformed', 'schema_invalid'].includes(failureCategory)
    || /MALFORMED|SCHEMA/i.test(String(errorCode || ''))) {
    return MALFORMED_NEGATIVE_TTL_SECONDS;
  }

  if (status === 'resolved' && !errorCode) {
    if (response.confidence === 'high') return RESOLVED_TTL_SECONDS;
    if (response.confidence === 'medium') return AMBIGUOUS_TTL_SECONDS;
    return AMBIGUOUS_TTL_SECONDS;
  }
  if (status === 'ranked' || status === 'ambiguous_with_era') {
    return RANKED_OR_ERA_TTL_SECONDS;
  }
  if (status === 'ambiguous' && !errorCode) {
    return AMBIGUOUS_TTL_SECONDS;
  }
  // conflict / clarification / unavailable without a short negative reason: skip
  return 0;
}
