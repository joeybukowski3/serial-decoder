/**
 * Database rows -> provider-neutral store shapes.
 *
 * Two responsibilities:
 *
 *  1. Normalize rows into the StoredClaim / StoredSource / StoredProductIdentity
 *     shapes declared in store-interface.js.
 *  2. REJECT malformed rows.
 *
 * (2) matters even though the schema has a claim_shape CHECK constraint. The
 * constraint protects rows written through this application; it does not
 * protect against a hand-run SQL fix, a future migration defect, or a partially
 * applied schema. A malformed row must be dropped and counted, never
 * interpreted — a claim with a lifecycle type and no year would otherwise read
 * as "no evidence" and be indistinguishable from a genuine absence.
 */
import {
  aggregateFreshness,
  classifyFreshness,
  LIFECYCLE_CLAIM_TYPES,
  oldestLifecycleAgeDays,
} from './freshness.js';

const POINT_CLAIM_TYPES = new Set([
  'introduction_year',
  'production_start',
  'production_end',
  'availability_year',
  'discontinuation_year',
]);
const RANGE_CLAIM_TYPES = new Set(['production_range', 'model_generation']);
const VALUE_CLAIM_TYPES = new Set(['family_membership', 'category', 'brand_identity', 'canonical_model']);

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

function toYear(value) {
  if (value === null || value === undefined) return null;
  const year = Number(value);
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) return null;
  return year;
}

function toIsoString(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

/**
 * Validate a claim row's payload shape.
 *
 * Mirrors the evidence_claims_shape CHECK in
 * db/migrations/0001_model_evidence_store.sql.
 *
 * @returns {boolean} true when the row is well formed
 */
export function isWellFormedClaimRow(row) {
  if (!row || typeof row !== 'object') return false;
  const claimType = String(row.claim_type || '');
  if (!claimType) return false;

  const pointYear = toYear(row.point_year);
  const startYear = toYear(row.start_year);
  const endYear = toYear(row.end_year);
  const claimValue = row.claim_value == null ? null : String(row.claim_value);

  if (POINT_CLAIM_TYPES.has(claimType)) {
    return pointYear !== null && startYear === null && endYear === null && claimValue === null;
  }
  if (RANGE_CLAIM_TYPES.has(claimType)) {
    if (startYear === null || pointYear !== null || claimValue !== null) return false;
    return endYear === null || endYear >= startYear;
  }
  if (VALUE_CLAIM_TYPES.has(claimType)) {
    return Boolean(claimValue) && pointYear === null && startYear === null && endYear === null;
  }
  // Unknown claim_type: a schema newer than this code. Reject rather than guess.
  return false;
}

/** @returns {import('./store-interface.js').StoredSource|null} */
export function mapSourceRow(row) {
  if (!row || !row.url) return null;
  return {
    url: String(row.url),
    domain: String(row.domain || ''),
    sourceType: String(row.source_type || 'other'),
    sourceQuality: String(row.source_quality || 'weak'),
    title: row.title == null ? null : String(row.title),
    publicationDate: row.publication_date
      ? String(row.publication_date instanceof Date
        ? row.publication_date.toISOString().slice(0, 10)
        : row.publication_date).slice(0, 10)
      : null,
    normalizedFact: String(row.normalized_fact || ''),
    exactModelMatch: row.exact_model_match === true,
    canonicalEquivalentMatch: row.canonical_equivalent_match === true,
    matchedToken: row.matched_token == null ? null : String(row.matched_token),
    provider: String(row.provider || 'unknown'),
  };
}

/**
 * @param {object} row
 * @param {import('./store-interface.js').StoredSource[]} sources
 * @param {number} nowMs
 * @returns {import('./store-interface.js').StoredClaim|null} null when malformed
 */
export function mapClaimRow(row, sources = [], nowMs = Date.now()) {
  if (!isWellFormedClaimRow(row)) return null;

  const claim = {
    claimType: String(row.claim_type),
    pointYear: toYear(row.point_year),
    startYear: toYear(row.start_year),
    endYear: toYear(row.end_year),
    claimValue: row.claim_value == null ? null : String(row.claim_value),
    precision: String(row.precision || 'year'),
    identityMatch: String(row.identity_match || 'unknown'),
    evidenceQuality: String(row.evidence_quality || 'weak'),
    claimConfidence: String(row.claim_confidence || 'low'),
    basis: String(row.basis || ''),
    extractor: row.extractor == null ? null : String(row.extractor),
    lastVerifiedAt: toIsoString(row.last_verified_at),
    sources,
  };
  claim.freshness = classifyFreshness(claim, nowMs);
  return claim;
}

/** @returns {import('./store-interface.js').StoredProductIdentity} */
export function mapProductRow(row, matchContext = {}) {
  return {
    publicId: String(row.public_id),
    brand: String(row.brand || ''),
    brandKey: String(row.brand_key || ''),
    canonicalModel: String(row.canonical_model || ''),
    normalizedModel: String(row.normalized_model || ''),
    identityKind: String(row.identity_kind || 'exact_model'),
    identityStatus: String(row.identity_status || 'provisional'),
    identityConfidence: String(row.identity_confidence || 'medium'),
    category: row.category == null ? null : String(row.category),
    modelLine: row.model_line == null ? null : String(row.model_line),
    familyPublicId: row.family_public_id == null ? null : String(row.family_public_id),
    evidenceVersion: Number.isInteger(row.evidence_version) ? row.evidence_version : Number(row.evidence_version || 1),
    matchedBy: matchContext.matchedBy || 'canonical-model',
    matchedAliasType: matchContext.matchedAliasType || null,
    equivalenceReason: matchContext.equivalenceReason || null,
    matchedToken: matchContext.matchedToken || null,
  };
}

/**
 * Derive the lifecycle window from a claim set.
 *
 * `start` prefers the EARLIEST supported start-side year and `end` the LATEST
 * supported end-side year, which mirrors how
 * lib/model-evidence/adapters.js#sharedEvidenceToSmartLookupInput derives
 * introductionYear (Math.min of start facts). Conflicts are reported
 * separately rather than being averaged away.
 */
export function deriveLifecycle(claims = []) {
  const startYears = [];
  const endYears = [];

  for (const claim of claims) {
    switch (claim.claimType) {
      case 'introduction_year':
      case 'production_start':
      case 'availability_year':
        if (claim.pointYear !== null) startYears.push(claim.pointYear);
        break;
      case 'production_end':
      case 'discontinuation_year':
        if (claim.pointYear !== null) endYears.push(claim.pointYear);
        break;
      case 'production_range':
      case 'model_generation':
        if (claim.startYear !== null) startYears.push(claim.startYear);
        if (claim.endYear !== null) endYears.push(claim.endYear);
        break;
      default:
        break;
    }
  }

  return {
    start: startYears.length ? Math.min(...startYears) : null,
    end: endYears.length ? Math.max(...endYears) : null,
  };
}

/**
 * True when two ACTIVE claims of the same lifecycle type assert different
 * years. Preserving disagreement (rather than resolving it by last-write-wins)
 * is a core Phase 3A requirement; this is how the read path reports it.
 */
export function detectConflict(claims = []) {
  const byType = new Map();
  for (const claim of claims) {
    if (!LIFECYCLE_CLAIM_TYPES.includes(claim.claimType)) continue;
    const value = claim.pointYear !== null ? claim.pointYear : claim.startYear;
    if (value === null) continue;
    const seen = byType.get(claim.claimType) || new Set();
    seen.add(value);
    byType.set(claim.claimType, seen);
  }
  for (const values of byType.values()) {
    if (values.size > 1) return true;
  }
  return false;
}

/** Earliest start-side year, used for introduction comparison. */
export function deriveIntroductionYear(claims = []) {
  const years = claims
    .filter((claim) => ['introduction_year', 'production_start', 'availability_year'].includes(claim.claimType))
    .map((claim) => claim.pointYear)
    .filter((year) => Number.isInteger(year));
  if (years.length) return Math.min(...years);
  const ranges = claims
    .filter((claim) => ['production_range', 'model_generation'].includes(claim.claimType))
    .map((claim) => claim.startYear)
    .filter((year) => Number.isInteger(year));
  return ranges.length ? Math.min(...ranges) : null;
}

/**
 * Assemble the final bundle from a product row and its mapped claims.
 *
 * @returns {import('./store-interface.js').StoredEvidenceBundle}
 */
export function buildBundle(product, claims, malformedClaimCount, nowMs = Date.now()) {
  return {
    product,
    claims,
    freshness: aggregateFreshness(claims, nowMs),
    conflict: detectConflict(claims),
    lifecycle: deriveLifecycle(claims),
    introductionYear: deriveIntroductionYear(claims),
    oldestClaimAgeDays: oldestLifecycleAgeDays(claims, nowMs),
    malformedClaimCount,
  };
}
