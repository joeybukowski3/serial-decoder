/**
 * User-facing vocabulary for the public replacement contract. Internal engine enums, bucket names and reason codes are
 * translated here; anything this module does not recognise is dropped or replaced by a generic phrase, never passed through.
 */

export const IMPORTANCE = Object.freeze({ HARD: 'REQUIRED', STRONG: 'IMPORTANT', SECONDARY: 'ADDITIONAL' });
export const IMPORTANCE_ORDER = Object.freeze({ REQUIRED: 0, IMPORTANT: 1, ADDITIONAL: 2 });

export const RETRIEVAL_QUALITY = Object.freeze({
  RETRIEVED_STRONG: 'STRONG', RETRIEVED_PARTIAL: 'PARTIAL', RETRIEVAL_WEAK: 'WEAK', RETRIEVAL_FAILED: 'FAILED',
});

export const CLASSIFICATIONS = Object.freeze(['ABOVE_LKQ', 'LKQ', 'CLOSE_MATCH', 'NOT_LKQ', 'UNCONFIRMED']);
export const CONFIDENCES = Object.freeze(['HIGH', 'MEDIUM', 'LOW']);

export const ROLE_LABELS = Object.freeze({
  CLOSE_MATCH: 'Close match',
  ABOVE_LKQ_OPTION: 'Above like-kind-and-quality',
  HIGHER_CONFIDENCE_OPTION: 'Higher-confidence option',
  SAME_BRAND_ALTERNATIVE: 'Same-brand alternative',
  CROSS_BRAND_ALTERNATIVE: 'Different-brand alternative',
});

/** Plain-language names for the engine's material-upgrade codes. */
export const UPGRADE_LABELS = Object.freeze({
  MATERIAL_SCREEN_SIZE_UPGRADE: 'screen size',
  MATERIAL_CAPACITY_UPGRADE: 'capacity',
  MATERIAL_TIER_UPGRADE: 'product tier',
  MULTIPLE_HIGH_CAPABILITY_UPGRADES: 'several key features',
});

const ASSESSMENT_CODES = Object.freeze({
  MATCH: 'MATCH', BETTER: 'EXCEEDS', DIFFERENT: 'DIFFERS', UNKNOWN: 'UNKNOWN', ASSUMED: 'ASSUMED', UNVERIFIED: 'VERIFY', FAIL: 'FAIL',
});

const ASSESSMENT_LABELS = Object.freeze({
  MATCH: 'Match', EXCEEDS: 'Exceeds', DIFFERS: 'Differs', UNKNOWN: 'Not verified', ASSUMED: 'Assumed', VERIFY: 'Needs verification', FAIL: 'Does not match',
});

/** `{ code, label }` for one comparison row. A required row that matches reads "Meets requirement". */
export function assessmentFor(assessment, importance) {
  const code = ASSESSMENT_CODES[assessment] || 'UNKNOWN';
  const required = importance === 'REQUIRED';
  const label = code === 'MATCH' && required ? 'Meets requirement'
    : code === 'FAIL' && required ? 'Does not meet requirement'
      : ASSESSMENT_LABELS[code];
  return { code, label };
}

export const isResolvedAssessment = (code) => ['MATCH', 'EXCEEDS', 'DIFFERS'].includes(code);

/**
 * Engine reason code -> user-facing phrase plus the needs-verification reason it belongs to (when it does).
 * `reason: null` means the code explains a comparison but is not itself an open question.
 */
const REASONS = Object.freeze({
  HARD_ASSUMPTION: { reason: 'ASSUMED', message: 'Important requirement is based on an assumption' },
  HARD_BOTH_UNKNOWN: { reason: 'UNKNOWN', message: 'This required specification could not be verified' },
  HARD_VALUE_UNKNOWN: { reason: 'UNKNOWN', message: 'This required specification is missing for one of the products' },
  HARD_AMBIGUOUS: { reason: 'AMBIGUOUS', message: 'Sources disagree on this required specification' },
  CAPACITY_COMPARISON_UNVERIFIED: { reason: 'UNKNOWN', message: 'Capacity could not be compared with confidence' },
  CAPACITY_ROUNDING_OVERLAP: { reason: 'UNKNOWN', message: 'Published capacities are too close to rank with confidence' },
  INVALID_NUMERIC_VALUE: { reason: 'UNKNOWN', message: 'A published value could not be read reliably' },
  INVALID_RESOLUTION: { reason: 'UNKNOWN', message: 'Resolution could not be read reliably' },
  INVALID_TIER: { reason: 'UNKNOWN', message: 'Product tier could not be determined' },
  VERIFY_FIT: { reason: 'UNVERIFIED_FIT', message: 'Not verified. Confirm available space before purchase' },
  HARD_FIT_UNVERIFIED: { reason: 'UNVERIFIED_FIT', message: 'A fit requirement applies but could not be verified' },
  HARD_FIT_VERIFIED: { reason: null, message: 'Verified against the fit details you provided' },
  HARD_FIT_VIOLATION: { reason: null, message: 'Does not fit the space or mount you described' },
  COUNTER_DEPTH_REQUIRED_UNVERIFIED: { reason: 'UNKNOWN', message: 'Counter-depth could not be verified' },
  COUNTER_DEPTH_REQUIRED_FAILED: { reason: null, message: 'Is not counter-depth' },
  HARD_MINIMUM_FAILED: { reason: null, message: 'Falls below the original on this requirement' },
  HARD_MATCH_FAILED: { reason: null, message: 'Differs from the original on this requirement' },
  CAPACITY_BELOW_ALLOWED_FLOOR: { reason: null, message: 'Capacity is below the original' },
  HARD_MINIMUM_PASSED: { reason: null, message: 'Meets or exceeds the original' },
  SIMILARITY_ASSUMED: { reason: 'ASSUMED', message: 'This comparison is based on an assumption' },
  SIMILARITY_AMBIGUOUS: { reason: 'AMBIGUOUS', message: 'Sources disagree on this specification' },
  SIMILARITY_BOTH_UNKNOWN: { reason: 'UNKNOWN', message: 'This specification could not be verified' },
  SIMILARITY_UNKNOWN: { reason: 'UNKNOWN', message: 'This specification is missing for one of the products' },
});

const GENERIC_UNVERIFIED = Object.freeze({ reason: 'UNKNOWN', message: 'This specification could not be verified' });

/** Never returns the raw code. Unknown codes degrade to a generic, honest phrase. */
export function describeReason(code, assessment = null) {
  if (REASONS[code]) return REASONS[code];
  if (['UNKNOWN', 'UNVERIFIED'].includes(assessment)) return GENERIC_UNVERIFIED;
  if (assessment === 'ASSUMED') return REASONS.HARD_ASSUMPTION;
  return { reason: null, message: null };
}

/** Report-level codes that may reach the browser, with fixed severity and wording. Everything else is dropped. */
const WARNINGS = Object.freeze({
  NO_LKQ_CANDIDATE_FOUND: ['NO_LKQ_CANDIDATE', 'BLOCKING', 'No current model met every required specification. The model shown is the closest available, not a like-kind-and-quality replacement.'],
  NO_CANDIDATES_DISCOVERED: ['NO_CANDIDATES', 'WARNING', 'No replacement candidates could be retrieved.'],
  BASELINE_FALLBACK_USED: ['NO_CANDIDATES', 'WARNING', 'No replacement candidates could be retrieved.'],
  WEB_RETRIEVAL_UNAVAILABLE: ['SOURCES_UNAVAILABLE', 'WARNING', 'Some product sources could not be reached.'],
  SEARCH_FAILED: ['SOURCES_UNAVAILABLE', 'WARNING', 'Some product sources could not be reached.'],
  CANDIDATE_SEARCH_FAILED: ['SOURCES_UNAVAILABLE', 'WARNING', 'Some product sources could not be reached.'],
  WEB_RETRIEVAL_EMPTY: ['NO_SOURCES_FOUND', 'WARNING', 'No matching product pages were found.'],
  WEB_RETRIEVAL_PARTIAL: ['SOURCES_PARTIAL', 'INFO', 'Some product pages could not be read.'],
  SOURCE_FETCH_FAILED: ['SOURCES_PARTIAL', 'INFO', 'Some product pages could not be read.'],
  SOURCE_EXTRACTION_FAILED: ['SOURCES_PARTIAL', 'INFO', 'Some product pages could not be read.'],
  ORIGINAL_RESEARCH_INSUFFICIENT: ['ORIGINAL_UNVERIFIED', 'WARNING', 'The original product could not be verified from available sources.'],
  DEADLINE_REACHED: ['DEADLINE_REACHED', 'WARNING', 'Research stopped at the time limit, so some products may not have been evaluated.'],
  SEARCH_LIMIT_REACHED: ['SEARCH_LIMIT_REACHED', 'INFO', 'The search limit for a single lookup was reached.'],
  NOTE_NOT_SCORED: ['NOTE_NOT_SCORED', 'INFO', 'Some of your notes were recorded but are not included in scoring.'],
  BUDGET_LIMIT_REACHED: ['CAPACITY_LIMITED', 'WARNING', 'Research was limited by today’s capacity, so the result may be incomplete.'],
});

/** `{ code, severity, message }` for an allowlisted report-level reason code, else null. */
export function describeWarning(reasonCode) {
  const entry = WARNINGS[reasonCode];
  return entry ? { code: entry[0], severity: entry[1], message: entry[2] } : null;
}

export const NOTE_MESSAGES = Object.freeze({
  FEATURE_PREFERENCE: 'A feature preference in your notes is shown for reference but is not included in scoring.',
  OTHER: 'Part of your notes was recorded but is not included in scoring.',
});

export const DEADLINE_MESSAGE = 'Research stopped at the time limit. Some products may not have been fully evaluated.';

export const ERROR_MESSAGES = Object.freeze({
  API_DISABLED: 'Replacement research is not available right now.',
  UNAUTHORIZED: 'Authentication is required.',
  INVALID_REQUEST: 'The request could not be processed. Check the fields and try again.',
  UNSUPPORTED: 'This product is not supported yet.',
  RATE_LIMITED: 'Too many requests. Try again shortly.',
  BUDGET_EXHAUSTED: 'Replacement research has reached its daily capacity. Try again tomorrow.',
  BUDGET_UNAVAILABLE: 'Replacement research is temporarily unavailable.',
  PROVIDER_UNAVAILABLE: 'Replacement research is temporarily unavailable.',
  ENGINE_TIMEOUT: 'The research took too long to finish. Try again.',
  ENGINE_ERROR: 'Replacement research could not be completed. Try again later.',
});

export const ERROR_HTTP_STATUS = Object.freeze({
  API_DISABLED: 503, UNAUTHORIZED: 401, INVALID_REQUEST: 400, UNSUPPORTED: 422, RATE_LIMITED: 429,
  BUDGET_EXHAUSTED: 429, BUDGET_UNAVAILABLE: 503, PROVIDER_UNAVAILABLE: 503, ENGINE_TIMEOUT: 504, ENGINE_ERROR: 502,
});

const FACT_VALUE_MAX = 80;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g;
const ENUM_KEYS = new Set(['tier', 'finish', 'layout', 'configurationFloor', 'installationType', 'dispenser', 'iceMaker', 'capacityBalance', 'handleStyle', 'shelfLayout']);
const titleCase = (value) => String(value).toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** Short, display-ready text for a fact value. Null for unresolved values. */
export function formatValue(key, value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    if (key === 'screenSizeIn') return `${value}"`;
    if (key === 'totalCapacityCuFt' || key === 'capacityCuFt') return `${value} cu. ft.`;
    if (key === 'refreshHz') return `${value} Hz`;
    if (key.endsWith('In')) return `${value}"`;
    return String(value);
  }
  const text = String(value).replace(CONTROL, ' ').replace(/\s+/g, ' ').trim().slice(0, FACT_VALUE_MAX);
  if (!text) return null;
  return ENUM_KEYS.has(key) || (/^[A-Z_]+$/.test(text) && text.includes('_')) ? titleCase(text) : text;
}

/**
 * Public fact status. KNOWN is only VERIFIED when a retrieved source backs it; a KNOWN fact that rests on the user's
 * own input (or on nothing but discovery context) is PROVIDED. `sourceIds` is the set of retrieved evidence IDs.
 */
export function publicFactStatus(entry, sourceIds) {
  const status = entry?.status;
  if (status === 'KNOWN') return (entry.evidenceRefs || []).some((ref) => sourceIds.has(ref)) ? 'VERIFIED' : 'PROVIDED';
  if (['INFERRED', 'ASSUMED', 'AMBIGUOUS', 'UNKNOWN'].includes(status)) return status;
  return 'UNKNOWN';
}
