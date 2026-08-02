/**
 * Evidence freshness policy for the persistent model evidence store.
 *
 * Four clocks are kept deliberately distinct (Phase 3A design §10):
 *
 *   evidence freshness   - this module. Is a stored claim still trustworthy?
 *   Redis TTL            - lib/serial-refinement/deterministic/cache.js
 *   negative-lookup TTL  - Redis only; negatives are NEVER persisted
 *   revalidation         - derived from `stale`, acted on in Phase 3F
 *
 * Two thresholds, not one:
 *   stale   -> serve immediately, schedule a refresh
 *   expired -> serve only as a reserve; does not count as a store hit
 *
 * The governing domain fact: appliance and TV production windows are
 * historical. A dryer introduced in 2019 is still a 2019 introduction next
 * year. What actually decays is (a) the END of a window for a still-shipping
 * product and (b) weak single-source claims that may be corrected.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export const FRESHNESS_FRESH = 'fresh';
export const FRESHNESS_STALE = 'stale';
export const FRESHNESS_EXPIRED = 'expired';
export const FRESHNESS_UNKNOWN = 'unknown';

/** Claim types that carry lifecycle timing (as opposed to classification). */
export const LIFECYCLE_CLAIM_TYPES = Object.freeze([
  'introduction_year',
  'production_start',
  'production_end',
  'production_range',
  'availability_year',
  'discontinuation_year',
  'model_generation',
]);

/**
 * staleAfterDays / expireAfterDays === null means "never".
 * Ordered most-specific first; the first matching rule wins.
 */
export const FRESHNESS_RULES = Object.freeze([
  // Human-curated or mirrored from a git-reviewed local registry.
  {
    id: 'verified',
    match: (claim) => claim.evidenceQuality === 'verified',
    staleAfterDays: null,
    expireAfterDays: null,
  },
  // Actively wants a tie-breaking source.
  {
    id: 'conflicting',
    match: (claim) => claim.evidenceQuality === 'conflicting',
    staleAfterDays: 30,
    expireAfterDays: 180,
  },
  // A closed historical window does not change.
  {
    id: 'strong-closed-window',
    match: (claim) => claim.evidenceQuality === 'strong'
      && isStartClaim(claim)
      && Number.isInteger(claim.endYear),
    staleAfterDays: 365,
    expireAfterDays: null,
  },
  // Start year is fixed; revalidation exists to discover the END.
  {
    id: 'strong-open-window',
    match: (claim) => claim.evidenceQuality === 'strong' && isStartClaim(claim),
    staleAfterDays: 180,
    expireAfterDays: null,
  },
  // End dates get revised as stock clears.
  {
    id: 'strong-end',
    match: (claim) => claim.evidenceQuality === 'strong'
      && ['production_end', 'discontinuation_year'].includes(claim.claimType),
    staleAfterDays: 180,
    expireAfterDays: 730,
  },
  {
    id: 'supported',
    match: (claim) => claim.evidenceQuality === 'supported',
    staleAfterDays: 90,
    expireAfterDays: 540,
  },
  {
    id: 'weak',
    match: (claim) => claim.evidenceQuality === 'weak',
    staleAfterDays: 45,
    expireAfterDays: 270,
  },
  // Superseded / deprecated claims are never served, so they are never fresh.
  {
    id: 'deprecated',
    match: (claim) => claim.evidenceQuality === 'deprecated',
    staleAfterDays: 0,
    expireAfterDays: 0,
  },
]);

function isStartClaim(claim) {
  return ['production_start', 'introduction_year', 'availability_year', 'production_range', 'model_generation']
    .includes(claim.claimType);
}

function ruleFor(claim) {
  return FRESHNESS_RULES.find((rule) => rule.match(claim)) || null;
}

/**
 * Age of a claim in whole days. Returns null when lastVerifiedAt is missing or
 * unparseable — an unknown age must never be silently treated as fresh.
 *
 * @param {{lastVerifiedAt?: string|Date}} claim
 * @param {number} [nowMs]
 * @returns {number|null}
 */
export function claimAgeDays(claim, nowMs = Date.now()) {
  const raw = claim?.lastVerifiedAt;
  if (!raw) return null;
  const verifiedAt = raw instanceof Date ? raw.getTime() : Date.parse(String(raw));
  if (!Number.isFinite(verifiedAt)) return null;
  return Math.max(0, Math.floor((nowMs - verifiedAt) / DAY_MS));
}

/**
 * Classify one claim's freshness.
 *
 * @param {object} claim  normalized StoredClaim
 * @param {number} [nowMs]
 * @returns {'fresh'|'stale'|'expired'|'unknown'}
 */
export function classifyFreshness(claim, nowMs = Date.now()) {
  if (!claim || typeof claim !== 'object') return FRESHNESS_UNKNOWN;
  const rule = ruleFor(claim);
  if (!rule) return FRESHNESS_UNKNOWN;

  const ageDays = claimAgeDays(claim, nowMs);
  // A claim whose verification timestamp cannot be read is treated as expired,
  // never fresh: unknown provenance must degrade toward research.
  if (ageDays === null) return FRESHNESS_EXPIRED;

  if (rule.expireAfterDays !== null && ageDays >= rule.expireAfterDays) return FRESHNESS_EXPIRED;
  if (rule.staleAfterDays === null) return FRESHNESS_FRESH;
  if (ageDays >= rule.staleAfterDays) return FRESHNESS_STALE;
  return FRESHNESS_FRESH;
}

/**
 * Weakest freshness across a set of claims, restricted to lifecycle claims
 * (classification claims like `category` do not age in a way that matters).
 *
 * expired < stale < fresh. An empty lifecycle set yields 'unknown'.
 *
 * @param {object[]} claims
 * @param {number} [nowMs]
 */
export function aggregateFreshness(claims, nowMs = Date.now()) {
  const lifecycle = (Array.isArray(claims) ? claims : [])
    .filter((claim) => LIFECYCLE_CLAIM_TYPES.includes(claim?.claimType));
  if (!lifecycle.length) return FRESHNESS_UNKNOWN;

  const levels = lifecycle.map((claim) => classifyFreshness(claim, nowMs));
  if (levels.includes(FRESHNESS_EXPIRED)) return FRESHNESS_EXPIRED;
  if (levels.includes(FRESHNESS_UNKNOWN)) return FRESHNESS_EXPIRED;
  if (levels.includes(FRESHNESS_STALE)) return FRESHNESS_STALE;
  return FRESHNESS_FRESH;
}

/** Age in days of the OLDEST lifecycle claim in a bundle, for telemetry. */
export function oldestLifecycleAgeDays(claims, nowMs = Date.now()) {
  const ages = (Array.isArray(claims) ? claims : [])
    .filter((claim) => LIFECYCLE_CLAIM_TYPES.includes(claim?.claimType))
    .map((claim) => claimAgeDays(claim, nowMs))
    .filter((age) => Number.isInteger(age));
  return ages.length ? Math.max(...ages) : null;
}
