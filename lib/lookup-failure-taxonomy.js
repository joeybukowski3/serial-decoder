/**
 * Shared failure taxonomy for Smart Lookup and Serial Refinement.
 *
 * These codes are for telemetry, logs, tests, and ops dashboards.
 * They are not necessarily shown raw to end users.
 */

export const FAILURE_CATEGORIES = Object.freeze([
  'input_unusable',
  'identity_unresolved',
  'local_evidence_miss',
  'cache_read_failure',
  'cache_write_failure',
  'search_timeout',
  'search_rate_limited',
  'search_no_results',
  'extraction_timeout',
  'extraction_malformed',
  'extraction_no_usable_facts',
  'identity_mismatch',
  'canonical_ambiguity',
  'evidence_conflict',
  'candidate_intersection_empty',
  'provider_unavailable',
  'global_deadline',
  'budget_exhausted',
  'schema_invalid',
  'none',
]);

const CATEGORY_SET = new Set(FAILURE_CATEGORIES);

/** Map historical/provider-specific codes onto the shared taxonomy. */
const CODE_TO_CATEGORY = Object.freeze({
  INVALID_BRAND: 'input_unusable',
  INVALID_CATEGORY: 'input_unusable',
  INVALID_SERIAL: 'input_unusable',
  INVALID_MODEL: 'input_unusable',
  INVALID_CANDIDATES: 'input_unusable',
  INVALID_DECODED_MONTH: 'input_unusable',
  INVALID_CONTEXT: 'input_unusable',
  INVALID_INPUT: 'input_unusable',
  LOCAL_EVIDENCE_INSUFFICIENT: 'local_evidence_miss',
  LOCAL_DB_MISS: 'local_evidence_miss',
  GROUNDING_RATE_LIMIT: 'search_rate_limited',
  RATE_LIMIT: 'search_rate_limited',
  SERPER_TIMEOUT: 'search_timeout',
  SEARCH_TIMEOUT: 'search_timeout',
  SERPER_NOT_CONFIGURED: 'provider_unavailable',
  SERPER_PROVIDER_ERROR: 'provider_unavailable',
  NO_SEARCH_RESULTS: 'search_no_results',
  NO_EXACT_MODEL_EVIDENCE: 'extraction_no_usable_facts',
  DETERMINISTIC_INSUFFICIENT_EVIDENCE: 'extraction_no_usable_facts',
  INSUFFICIENT_EVIDENCE: 'extraction_no_usable_facts',
  EVIDENCE_INSUFFICIENT: 'extraction_no_usable_facts',
  EXTRACTOR_TIMEOUT: 'extraction_timeout',
  DETERMINISTIC_TIMEOUT: 'extraction_timeout',
  DETERMINISTIC_GEMINI_ERROR: 'extraction_malformed',
  DETERMINISTIC_SERPER_ERROR: 'provider_unavailable',
  EXTRACTOR_SCHEMA_INVALID: 'extraction_malformed',
  MALFORMED_PROVIDER_JSON: 'extraction_malformed',
  EMPTY_PROVIDER_OUTPUT: 'extraction_malformed',
  EXTRACTOR_NOT_CONFIGURED: 'provider_unavailable',
  REFINEMENT_TIMEOUT: 'global_deadline',
  STAGE_TIMEOUT: 'global_deadline',
  GLOBAL_BUDGET_EXHAUSTED: 'budget_exhausted',
  REFINEMENT_UNAVAILABLE: 'provider_unavailable',
  VARIANT_ONLY_EVIDENCE: 'identity_mismatch',
  EVIDENCE_CONFLICT: 'evidence_conflict',
  IDENTITY_MISMATCH: 'identity_mismatch',
  CANONICAL_AMBIGUITY: 'canonical_ambiguity',
  CANDIDATE_INTERSECTION_EMPTY: 'candidate_intersection_empty',
  SCHEMA_INVALID: 'schema_invalid',
  CACHE_READ_FAILURE: 'cache_read_failure',
  CACHE_WRITE_FAILURE: 'cache_write_failure',
});

const STAGE_TO_CATEGORY = Object.freeze({
  timeout: 'global_deadline',
  rate_limit: 'search_rate_limited',
  local_only: 'local_evidence_miss',
  provider_error: 'provider_unavailable',
  legacy_gemini_insufficient: 'extraction_no_usable_facts',
  deterministic_insufficient: 'extraction_no_usable_facts',
  cache_read: 'cache_read_failure',
  cache_write: 'cache_write_failure',
});

/**
 * Normalize a failure category to a known taxonomy value.
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
export function normalizeFailureCategory(value) {
  if (value == null || value === '') return null;
  const text = String(value).trim().toLowerCase();
  if (CATEGORY_SET.has(text)) return text;
  const mapped = CODE_TO_CATEGORY[String(value).trim().toUpperCase()]
    || CODE_TO_CATEGORY[String(value).trim()];
  return mapped || null;
}

/**
 * Map an error code / stage / shared-evidence failure into taxonomy fields.
 * @param {{ errorCode?: string|null, failureStage?: string|null, failureCategory?: string|null, sharedFailureCategory?: string|null }} input
 */
export function classifyLookupFailure(input = {}) {
  const failureCode = input.errorCode || input.failureCode || null;
  const failureStage = input.failureStage || null;
  const direct = normalizeFailureCategory(input.failureCategory)
    || normalizeFailureCategory(input.sharedFailureCategory)
    || normalizeFailureCategory(failureCode)
    || normalizeFailureCategory(STAGE_TO_CATEGORY[failureStage])
    || null;

  return {
    failureCategory: direct,
    failureStage: failureStage || null,
    failureCode: failureCode || null,
  };
}

/**
 * True when a provider/infra failure still returned a useful result tier.
 * Distinguishes "provider failed, useful result returned" from total failure.
 * @param {{ status?: string, resultTier?: string, remainingCandidateYears?: number[], modelProductionRange?: object|null, deterministicFallbackUsed?: boolean }} response
 */
export function isUsefulDegradedResult(response = {}) {
  const tier = response.resultTier || response.refinementResultTier || response.status || null;
  if (['resolved', 'ranked', 'ambiguous', 'ambiguous_with_era', 'conflict', 'clarification'].includes(tier)) {
    return true;
  }
  if (Number.isInteger(response.modelProductionRange?.start)
    || Number.isInteger(response.modelProductionRange?.end)) {
    return true;
  }
  const remaining = Array.isArray(response.remainingCandidateYears)
    ? response.remainingCandidateYears
    : [];
  return remaining.length > 0 && Boolean(response.deterministicFallbackUsed);
}

/**
 * Build the standard failure envelope attached to responses and telemetry.
 */
export function buildFailureEnvelope(input = {}, response = {}) {
  const classified = classifyLookupFailure(input);
  const resultTierReturned = response.refinementResultTier
    || response.resultTier
    || response.status
    || null;
  return {
    ...classified,
    resultTierReturned,
    deterministicFallbackUsed: Boolean(
      response.deterministicFallbackUsed ?? input.deterministicFallbackUsed,
    ),
    usefulContextPreserved: isUsefulDegradedResult({
      ...response,
      resultTier: resultTierReturned,
      deterministicFallbackUsed: response.deterministicFallbackUsed ?? input.deterministicFallbackUsed,
    }),
  };
}
