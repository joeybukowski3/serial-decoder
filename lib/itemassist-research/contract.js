import { DISCLOSURE } from '../replacement-quick/quick-prompt.js';
import { ANSWER_STATUS, REQUIREMENTS_SOURCE, findUnsafeClaim } from '../replacement-quick/quick-sanitize.js';

/**
 * Public ItemAssist Research contract. A strict, field-by-field allowlist over the Fast Answer's sanitized answer: nothing the
 * engine adds later (internal flags, removed-claim types, raw provider text) can reach a caller unless it is listed here.
 * Every suggestion is provisional: `verified` is always false and no field can carry a price, link or availability claim.
 */

export const RESEARCH_CONTRACT_VERSION = 'research.1';
export const RESEARCH_KIND = 'ITEMASSIST_RESEARCH';

export const RESEARCH_STATUS = Object.freeze({ ...ANSWER_STATUS });
// UNAVAILABLE carries category guidance only (provider failure); INVALID_REQUEST is rejected before this contract is built.
const PUBLIC_STATUSES = Object.freeze([ANSWER_STATUS.OK, ANSWER_STATUS.PARTIAL, ANSWER_STATUS.GUIDANCE_ONLY, ANSWER_STATUS.UNAVAILABLE]);
export const ANSWER_SOURCE = Object.freeze({ AI: 'AI_ESTIMATE', GUIDANCE: 'CATEGORY_GUIDANCE' });
const REQUIREMENT_SOURCES = Object.freeze(Object.values(REQUIREMENTS_SOURCE));

const WARNING_CODES = Object.freeze([
  'UNSAFE_CLAIMS_REMOVED', 'REQUIREMENTS_FROM_CATEGORY_GUIDANCE', 'PRODUCT_NOT_IDENTIFIED', 'SUGGESTIONS_WITHHELD', 'CATEGORY_MISMATCH',
  'IDENTITY_MISMATCH', 'IDENTIFICATION_UNCERTAIN', 'SUCCESSOR_CONDITIONAL', 'DIFFERENCES_MISSING', 'PROVIDER_UNAVAILABLE',
]);
const CATEGORIES = Object.freeze(['tv', 'refrigerator', 'appliance', 'electronics', 'other', 'unknown']);
const CONFIDENCES = Object.freeze(['HIGH', 'MEDIUM', 'LOW']);
const STANDINGS = Object.freeze(['RECOMMENDED', 'CONDITIONAL']);
const MAX_TEXT = 160;
const MAX_LIST = 6;

export const ERROR_MESSAGES = Object.freeze({
  API_DISABLED: 'ItemAssist Research is not available right now.',
  UNAUTHORIZED: 'Authentication is required.',
  INVALID_REQUEST: 'The request could not be processed. Check the description and try again.',
  BUDGET_EXHAUSTED: 'ItemAssist Research has reached its daily capacity. Try again tomorrow.',
  BUDGET_UNAVAILABLE: 'ItemAssist Research is temporarily unavailable.',
  PROVIDER_UNAVAILABLE: 'ItemAssist Research is temporarily unavailable.',
  ENGINE_ERROR: 'ItemAssist Research could not be completed. Try again later.',
});

export const ERROR_HTTP_STATUS = Object.freeze({
  API_DISABLED: 503, UNAUTHORIZED: 401, INVALID_REQUEST: 400, BUDGET_EXHAUSTED: 429, BUDGET_UNAVAILABLE: 503, PROVIDER_UNAVAILABLE: 503, ENGINE_ERROR: 502,
});

export function buildResearchError(errorCode, { requestId = null } = {}) {
  const code = ERROR_MESSAGES[errorCode] ? errorCode : 'ENGINE_ERROR';
  return {
    contractVersion: RESEARCH_CONTRACT_VERSION, kind: RESEARCH_KIND, status: 'ERROR', errorCode: code, message: ERROR_MESSAGES[code],
    ...(requestId ? { requestId } : {}),
  };
}

// The Fast Answer sanitizer removes links, prices, stock, retailer and lifecycle claims. This contract adds the claims the default
// tier must never make: that a suggestion is a certified or verified like-kind-and-quality (LKQ) equivalent or a confirmed match.
// Any mention of LKQ is withheld outright, including VERIFIED_LKQ and verifiedLKQ: no \b, because "_" and letters are word characters.
const LKQ_TERM = /lkq|like[-\s_]*kind/i;
// Honest uncertainty ("not verified", "not a confirmed match", "not guaranteed") is kept: negated assurances are blanked before the claim test.
const NEGATED_ASSURANCE = /\b(?:not|no|never|isn't|aren't|wasn't|cannot|can't|without)\s+(?:(?:a|an|yet|been|be|fully|currently)\s+)*(?:certified|verified|confirmed|guaranteed|approved)\b/gi;
const ASSURANCE = '(?:certified|verified|confirmed|approved|proven|guaranteed)';
const ASSURANCE_CLAIM = new RegExp([
  String.raw`\b${ASSURANCE}\s+(?:\w+\s+){0,2}(?:match\w*|equivalen\w*|replacement|substitute|spec(?:s|ification)?s?|compatib\w*|availab\w*|pric\w*|fit)\b`,
  String.raw`\bequivalen(?:t|ce)\s+(?:is\s+|are\s+|has\s+been\s+)?${ASSURANCE}\b`,
  String.raw`\b(?:exact|identical|perfect)\s+(?:match|equivalen\w*|replacement|substitute)\b`,
  String.raw`\bguarantee[ds]?\b|\bprice\s+(?:match|lock)\w*`,
  String.raw`\b(?:current|currently)\s+(?:retail\s+)?(?:availab\w*|in\s+stock|sold|offered|on\s+sale)\b|\bretail\s+availab\w*|\bavailab\w*\s+(?:at\s+)?retail\b`,
].join('|'), 'i');
/** Name of the first claim this contract refuses to relay (a Fast Answer claim type or an LKQ / assurance claim), or null. */
export const findResearchClaim = (value) => findUnsafeClaim(value)
  || (LKQ_TERM.test(value) || ASSURANCE_CLAIM.test(value.replace(NEGATED_ASSURANCE, ' ')) ? 'LKQ_CLAIM' : null);

const text = (value) => (typeof value === 'string' && value && !findResearchClaim(value) ? value.slice(0, MAX_TEXT) : null);
const confidenceOf = (value) => (typeof value === 'string' && CONFIDENCES.includes(value.toUpperCase()) ? value.toUpperCase() : 'LOW');
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** `text` that also records, in `seen.dropped`, that a non-empty string was refused. */
const tracked = (seen) => (value) => {
  const kept = text(value);
  if (kept === null && typeof value === 'string' && value.trim()) seen.dropped = true;
  return kept;
};

function projectCandidate(item, t, { withStanding = false } = {}) {
  if (!isObject(item) || !t(item.name) || !t(item.why)) return null;
  const concern = t(item.concern);
  // A concern the sanitizer raised but this contract withheld still counts: withholding its text must never upgrade the successor.
  const concernWithheld = typeof item.concern === 'string' && item.concern.trim() !== '' && concern === null;
  return {
    name: t(item.name),
    why: t(item.why),
    differences: t(item.differences),
    ...(withStanding ? { concern } : {}),
    confidence: confidenceOf(item.confidence),
    ...(withStanding ? { standing: STANDINGS.includes(item.standing) && !concernWithheld ? item.standing : 'CONDITIONAL' } : {}),
    verified: false,
  };
}

/**
 * @param {object} answer  a sanitized Fast Answer (never raw provider output)
 * @param {{requestId: string, elapsedMs: number, cached?: boolean, answerSource: string, fixture?: boolean}} meta
 *   `fixture: true` is set only by the route's server-side fixture mode and adds the one additive `meta.fixture` indicator.
 */
export function buildResearchResponse(answer, { requestId, elapsedMs, cached = false, answerSource, fixture = false }) {
  const source = isObject(answer) ? answer : {};
  const original = isObject(source.original) ? source.original : {};
  const seen = { dropped: false };
  const t = tracked(seen);
  const items = (value) => (Array.isArray(value) ? value.map(t).filter(Boolean).slice(0, MAX_LIST) : []);
  const identity = t(original.identity);
  const sourceStatus = PUBLIC_STATUSES.includes(source.status) ? source.status : ANSWER_STATUS.UNAVAILABLE;
  // Candidates rest on the identification: if its text was withheld, no candidate is shown and the answer is guidance only.
  const unidentified = !identity && sourceStatus !== ANSWER_STATUS.UNAVAILABLE;
  const suggestions = unidentified ? [] : (Array.isArray(source.suggestions) ? source.suggestions : []).map((item) => projectCandidate(item, t)).filter(Boolean).slice(0, 3);
  const successor = unidentified ? null : projectCandidate(source.successor, t, { withStanding: true });
  // OK means at least one candidate is shown; if this contract withheld them all, the answer is PARTIAL.
  const status = unidentified ? ANSWER_STATUS.GUIDANCE_ONLY : sourceStatus === ANSWER_STATUS.OK && !successor && !suggestions.length ? ANSWER_STATUS.PARTIAL : sourceStatus;
  const warnings = (Array.isArray(source.warnings) ? source.warnings : []).filter((code) => WARNING_CODES.includes(code));
  const addWarning = (code) => { if (!warnings.includes(code)) warnings.push(code); };
  if (seen.dropped) addWarning('UNSAFE_CLAIMS_REMOVED');
  if (unidentified) addWarning('PRODUCT_NOT_IDENTIFIED');
  // A difference this contract withheld is flagged, never filled in.
  if ([successor, ...suggestions].some((item) => item && !item.differences)) addWarning('DIFFERENCES_MISSING');
  return {
    contractVersion: RESEARCH_CONTRACT_VERSION,
    kind: RESEARCH_KIND,
    status,
    category: CATEGORIES.includes(source.category) ? source.category : 'unknown',
    original: { identity, confidence: confidenceOf(original.confidence), characteristics: items(original.characteristics).slice(0, 4), uncertainty: t(original.uncertainty) },
    requirements: items(source.requirements),
    requirementsSource: REQUIREMENT_SOURCES.includes(source.requirementsSource) ? source.requirementsSource : REQUIREMENTS_SOURCE.GUIDANCE,
    successor,
    suggestions,
    clarify: items(source.clarify).slice(0, 2),
    disclosure: DISCLOSURE,
    warnings,
    meta: { requestId, elapsedMs: Math.max(0, Math.round(elapsedMs) || 0), cached: Boolean(cached), answerSource, ...(fixture === true ? { fixture: true } : {}) },
  };
}

const TOP_KEYS = ['category', 'clarify', 'contractVersion', 'disclosure', 'kind', 'meta', 'original', 'requirements', 'requirementsSource', 'status', 'successor', 'suggestions', 'warnings'];
const sameKeys = (value, keys) => isObject(value) && Object.keys(value).sort().join() === [...keys].sort().join();
const safeString = (value) => typeof value === 'string' && value.length <= MAX_TEXT && !findResearchClaim(value);
const safeOrNull = (value) => value === null || safeString(value);

function validCandidate(item, withStanding) {
  const keys = ['name', 'why', 'differences', 'confidence', 'verified', ...(withStanding ? ['concern', 'standing'] : [])];
  return sameKeys(item, keys) && safeString(item.name) && safeString(item.why) && safeOrNull(item.differences) && item.verified === false
    && CONFIDENCES.includes(item.confidence) && (!withStanding || (safeOrNull(item.concern) && STANDINGS.includes(item.standing)));
}

const META_KEYS = ['requestId', 'elapsedMs', 'cached', 'answerSource'];

/**
 * Structural and claim-safety check run before every send and every cache read. A failure is treated as a miss / engine error.
 * `meta.fixture` is valid ONLY when the caller says fixture mode is active (`allowFixture`): everywhere else a response that carries
 * the indicator, forged or not, is invalid, so it can never be sent from a real path or read back from the shared cache.
 */
export function isValidResearchResponse(value, { allowFixture = false } = {}) {
  if (!sameKeys(value, TOP_KEYS) || value.contractVersion !== RESEARCH_CONTRACT_VERSION || value.kind !== RESEARCH_KIND) return false;
  if (!PUBLIC_STATUSES.includes(value.status) || !CATEGORIES.includes(value.category) || value.disclosure !== DISCLOSURE) return false;
  const { original } = value;
  if (!sameKeys(original, ['identity', 'confidence', 'characteristics', 'uncertainty']) || !safeOrNull(original.identity) || !safeOrNull(original.uncertainty)
    || !CONFIDENCES.includes(original.confidence) || !Array.isArray(original.characteristics) || !original.characteristics.every(safeString)) return false;
  if (!Array.isArray(value.requirements) || !value.requirements.every(safeString) || !Array.isArray(value.clarify) || !value.clarify.every(safeString)) return false;
  if (value.successor !== null && !validCandidate(value.successor, true)) return false;
  if (!Array.isArray(value.suggestions) || value.suggestions.length > 3 || !value.suggestions.every((item) => validCandidate(item, false))) return false;
  if (!Array.isArray(value.warnings) || !value.warnings.every((code) => WARNING_CODES.includes(code)) || !REQUIREMENT_SOURCES.includes(value.requirementsSource)) return false;
  const metaKeys = allowFixture && isObject(value.meta) && value.meta.fixture === true ? [...META_KEYS, 'fixture'] : META_KEYS;
  return sameKeys(value.meta, metaKeys) && Object.values(ANSWER_SOURCE).includes(value.meta.answerSource);
}
