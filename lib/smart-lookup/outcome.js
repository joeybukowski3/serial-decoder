/**
 * Server-side Smart Lookup outcome classification.
 *
 * This mirrors the browser controller (src/browser/smart-lookup-controller.js),
 * which is a classic non-module script and cannot import this file. The two
 * implementations are kept honest by tests/analytics/smart-lookup-outcome-parity.test.mjs:
 * any change here MUST be made in the controller too.
 *
 * Input is always a Smart Lookup age response payload. Output is what GA4,
 * server logs and the daily Redis counters report, so all three agree.
 */

export const RESULT_STATUSES = Object.freeze([
  'resolved', 'partial', 'needs-detail', 'conflict', 'no-result', 'error',
]);

export const YEAR_SIGNALS = Object.freeze([
  'exact-unit', 'candidates', 'range', 'open-ended', 'year', 'none',
]);

export const ROUTE_MODES = Object.freeze({
  GENERAL_GUIDANCE: 'general_guidance',
  PRECISION_RESEARCH: 'precision_research',
});

// Validation/provider codes meaning "a response arrived but failed our
// reliability checks" -- distinct from a timeout or a conflict.
const MALFORMED_CODES = new Set([
  'UNRELATED_BRAND', 'UNRELATED_MODEL', 'INVALID_YEAR', 'INVALID_EVIDENCE', 'INVALID_RESULT',
  'PROVIDER_MALFORMED_JSON', 'GROQ_MALFORMED_JSON', 'XAI_MALFORMED_RESPONSE', 'XAI_SCHEMA_INVALID',
  'PROVIDER_EMPTY', 'GROQ_EMPTY', 'XAI_EMPTY_RESULT', 'INVALID_PROVIDER_RESULT',
  'PROVIDER_RESPONSE_INVALID', 'INVALID_YEAR_CONTEXT',
]);

const RATE_LIMIT_REASONS = {
  RATE_LIMIT: 'rate-limited',
  PROVIDER_RATE_LIMIT: 'provider-rate-limited',
  RATE_LIMIT_STORE_UNAVAILABLE: 'rate-limit-store-unavailable',
};

const CAPACITY_CODES = new Set(['GLOBAL_BUDGET_EXHAUSTED', 'BUDGET_STORE_UNAVAILABLE', 'AI_QUOTA_EXCEEDED']);

// The only error code that describes the INPUT rather than a failure.
const INPUT_CODE = 'INSUFFICIENT_QUERY_DETAIL';

const NEEDS_DETAIL_REASONS = {
  'brand-category-recognized': 'brand-category-recognized',
  'product-family-recognized': 'product-recognized-undated',
  'product-year-unverified': 'product-recognized-undated',
  'exact-model-insufficient': 'exact-model-undated',
  'model-only-insufficient': 'model-recognized-undated',
  'missing-input': 'brand-recognized',
  'brand-missing': 'category-recognized',
  'serial-only-no-brand': 'product-identified-no-year',
};

const BROAD_PRECISIONS = new Set(['family-range', 'broad-range', 'general-guidance']);

export function hasUsableAgeInfo(data) {
  if (!data) return false;
  if (data.serialDetected && data.serialDetected.action === 'use-decoder') return true;
  if (Array.isArray(data.manufactureYearCandidates) && data.manufactureYearCandidates.length) return true;
  if (data.historicalContext || data.inventionSummary) return true;
  const context = data.yearContext;
  if (context && context.type !== 'unknown') {
    if (context.value) return true;
    if (context.startYear && context.endYear) return true;
  }
  if (data.introductionYear) return true;
  if (data.individualManufactureYear) return true;
  const range = data.productionRange;
  if (range && (range.start || range.end)) return true;
  return false;
}

/**
 * How much dated information a payload carries. Prefers the value the schema
 * normalizer already derived (it knows where a year came from); falls back to
 * inspecting the payload for responses that predate that field.
 */
export function yearSignalOf(data) {
  if (!data) return 'none';
  if (YEAR_SIGNALS.includes(data.yearSignal)) return data.yearSignal;
  if (data.individualManufactureYear) return 'exact-unit';
  if (Array.isArray(data.manufactureYearCandidates) && data.manufactureYearCandidates.length) return 'candidates';
  const context = data.yearContext && data.yearContext.type !== 'unknown' ? data.yearContext : null;
  const range = data.productionRange;
  if ((range && range.start && range.end) || (context && context.startYear && context.endYear)) return 'range';
  const estimated = data.estimatedRange;
  const hasYear = Boolean(
    (context && context.value) || data.introductionYear || data.familyIntroductionYear
    || data.lineIntroductionYear || data.categoryEntryYear || (range && (range.start || range.end)),
  );
  if (!hasYear) return 'none';
  return estimated && estimated.start && !estimated.end && data.estimateBasis !== 'model-introduction'
    ? 'open-ended'
    : 'year';
}

/** Coarse bucket for a payload (drives UI copy). Unchanged contract of the controller's classifyAgeOutcome. */
export function classifyAgeBucket(data) {
  if (!data) return 'network-error';
  const code = data.errorCode || null;
  if (hasUsableAgeInfo(data)) return 'success';
  if (RATE_LIMIT_REASONS[code]) return 'rate-limited';
  if (code === 'PROVIDER_TIMEOUT' || code === 'TOTAL_DEADLINE') return 'timeout';
  if (code === 'INTRODUCTION_AFTER_RANGE' || code === 'REVERSED_RANGE') return 'conflict';
  if (code && MALFORMED_CODES.has(code)) return 'malformed';
  if (data.querySpecificity === 'unusable') return 'unusable-query';
  if (data.productFamily && data.yearContext && data.yearContext.type === 'unknown') return 'product-year-unverified';
  if (data.productFamily && data.exactModel) return 'exact-model-insufficient';
  if (data.productFamily) return 'product-family-recognized';
  if (!code && data.querySpecificity === 'brand-category') return 'brand-category-recognized';
  if (code === INPUT_CODE) return 'missing-input';
  if (!code) {
    const hasBrand = Boolean(data.brand) && data.brand !== 'Unknown';
    if (hasBrand && data.model) return 'model-only-insufficient';
    if (hasBrand) return 'missing-input';
    if (data.category) return 'brand-missing';
    return 'serial-only-no-brand';
  }
  return 'unavailable-generic';
}

function isRecognized(data) {
  const brand = Boolean(data.brand) && data.brand !== 'Unknown';
  return Boolean(
    brand || data.recognizedBrand || data.category || data.itemCategory || data.recognizedCategory
    || data.productFamily || data.recognizedFamily || data.exactModel || data.likelyProduct || data.displayName,
  );
}

/**
 * @param {object|null} data  Smart Lookup age response payload
 * @param {string} [bucket]   Optional precomputed bucket
 * @returns {{resultStatus:string, outcomeReason:string, yearSignal:string, routeMode:string|null}}
 */
export function classifySmartOutcome(data, bucket) {
  const resolvedBucket = bucket || classifyAgeBucket(data);
  const yearSignal = yearSignalOf(data);
  const routeMode = (data && data.routeMode) || null;
  const code = (data && data.errorCode) || null;
  const out = (resultStatus, outcomeReason) => ({ resultStatus, outcomeReason, yearSignal, routeMode });

  if ((data && data.evidenceConflict) || resolvedBucket === 'conflict') return out('conflict', 'evidence-conflict');

  if (resolvedBucket === 'success') {
    if (yearSignal === 'none') {
      if (data.serialDetected && data.serialDetected.action === 'use-decoder') return out('resolved', 'serial-handoff');
      return out('needs-detail', routeMode === ROUTE_MODES.GENERAL_GUIDANCE ? 'general-guidance' : 'history-only');
    }
    if (/^deterministic-/.test(String(data.fallbackKind || ''))) return out('partial', 'deterministic-fallback');
    if (BROAD_PRECISIONS.has(data.precisionLevel)) return out('partial', data.precisionLevel);
    return out('resolved', 'dated-result');
  }

  // Technical failures are errors, never no-result -- including 429s and
  // limiter outages, and including a recognized product with a reserve card.
  if (resolvedBucket === 'network-error') return out('error', 'network-error');
  if (resolvedBucket === 'timeout') return out('error', 'provider-timeout');
  if (resolvedBucket === 'rate-limited') return out('error', RATE_LIMIT_REASONS[code] || 'rate-limited');
  if (resolvedBucket === 'malformed') return out('error', 'provider-malformed');
  if (resolvedBucket === 'unusable-query') return out('no-result', 'unusable-query');
  if (code && code !== INPUT_CODE) {
    if (CAPACITY_CODES.has(code)) return out('error', 'capacity');
    return out('error', code === 'INTERNAL_ERROR' ? 'internal-error' : 'provider-unavailable');
  }

  // No failure code: the request succeeded but carried no usable dated info.
  if (data.yearEvidenceWithheld) return out('needs-detail', 'low-confidence-estimate');
  if (isRecognized(data)) {
    return out(
      'needs-detail',
      routeMode === ROUTE_MODES.GENERAL_GUIDANCE ? 'general-guidance' : (NEEDS_DETAIL_REASONS[resolvedBucket] || 'recognized-undated'),
    );
  }
  return out('no-result', code === INPUT_CODE || resolvedBucket === 'missing-input' ? 'insufficient-input' : 'nothing-recognized');
}
