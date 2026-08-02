/**
 * Provider-neutral contract for the persistent model evidence store.
 *
 * Application code depends on THIS module's shapes, never on a database
 * client. lib/model-evidence-store/postgres-store.js is the only file in the
 * repository permitted to import a Postgres/Supabase client.
 *
 * Every read returns a plain object and NEVER throws. Infrastructure failure
 * is absorbed here and surfaced as a miss plus a failure code, so no caller
 * needs try/catch for database availability.
 */

/**
 * @typedef {Object} StoredProductIdentity
 * @property {string}  publicId          uuid; the only id ever logged
 * @property {string}  brand
 * @property {string}  brandKey
 * @property {string}  canonicalModel
 * @property {string}  normalizedModel
 * @property {'exact_model'|'model_line'|'model_family'} identityKind
 * @property {'provisional'|'accepted'|'disputed'|'retired'} identityStatus
 * @property {'low'|'medium'|'high'} identityConfidence
 * @property {string|null} category
 * @property {string|null} modelLine
 * @property {string|null} familyPublicId
 * @property {number} evidenceVersion
 * @property {'canonical-model'|'alias'} matchedBy
 * @property {string|null} matchedAliasType
 * @property {string|null} equivalenceReason
 * @property {string|null} matchedToken
 */

/**
 * @typedef {Object} StoredSource
 * @property {string} url
 * @property {string} domain
 * @property {string} sourceType
 * @property {string} sourceQuality
 * @property {string|null} title
 * @property {string|null} publicationDate
 * @property {string} normalizedFact
 * @property {boolean} exactModelMatch
 * @property {boolean} canonicalEquivalentMatch
 * @property {string|null} matchedToken
 * @property {string} provider
 */

/**
 * @typedef {Object} StoredClaim
 * @property {string} claimType
 * @property {number|null} pointYear
 * @property {number|null} startYear
 * @property {number|null} endYear
 * @property {string|null} claimValue
 * @property {string} precision
 * @property {string} identityMatch
 * @property {string} evidenceQuality
 * @property {string} claimConfidence
 * @property {string} basis
 * @property {string|null} extractor
 * @property {string} lastVerifiedAt
 * @property {'fresh'|'stale'|'expired'|'unknown'} freshness
 * @property {StoredSource[]} sources
 */

/**
 * @typedef {Object} StoredEvidenceBundle
 * @property {StoredProductIdentity} product
 * @property {StoredClaim[]} claims
 * @property {'fresh'|'stale'|'expired'|'unknown'} freshness
 * @property {boolean} conflict
 * @property {{start: number|null, end: number|null}} lifecycle
 * @property {number|null} introductionYear
 * @property {number|null} oldestClaimAgeDays
 * @property {number} malformedClaimCount
 */

/**
 * @typedef {Object} StoreReadResult
 * @property {boolean} attempted   the store was consulted at all
 * @property {boolean} available   the store was configured and reachable
 * @property {boolean} hit         a usable bundle was produced
 * @property {boolean} ambiguous   the token resolved to >1 product; fails safe
 * @property {boolean} timedOut
 * @property {boolean} malformed
 * @property {StoredEvidenceBundle|null} bundle
 * @property {string|null} failureCode
 * @property {number} durationMs
 */

/**
 * Failure codes. Categorical only — never a driver message, never a
 * connection string, never user input.
 *
 * Mapped onto the shared taxonomy in lib/lookup-failure-taxonomy.js as
 * `cache_read_failure`: the store is architecturally a cache tier, and a store
 * failure must not appear on dashboards as a new class of outage.
 */
export const STORE_FAILURE_CODES = Object.freeze({
  DISABLED: 'STORE_DISABLED',
  NOT_CONFIGURED: 'STORE_NOT_CONFIGURED',
  TIMEOUT: 'STORE_TIMEOUT',
  UNAVAILABLE: 'STORE_UNAVAILABLE',
  QUERY_ERROR: 'STORE_QUERY_ERROR',
  MALFORMED_ROW: 'STORE_MALFORMED_ROW',
  AMBIGUOUS_IDENTITY: 'STORE_AMBIGUOUS_IDENTITY',
  INVALID_INPUT: 'STORE_INVALID_INPUT',
  NO_BUDGET: 'STORE_NO_BUDGET',
});

/**
 * The canonical "nothing happened" result. Every miss, failure, timeout, and
 * disabled state is shaped exactly like this, which is what makes database
 * unavailability structurally indistinguishable from a cache miss.
 *
 * @param {Partial<StoreReadResult>} [overrides]
 * @returns {StoreReadResult}
 */
export function createMissResult(overrides = {}) {
  return {
    attempted: false,
    available: false,
    hit: false,
    ambiguous: false,
    timedOut: false,
    malformed: false,
    bundle: null,
    failureCode: null,
    durationMs: 0,
    ...overrides,
  };
}

/**
 * Read surface every store implementation must provide.
 *
 * Write operations are declared here for Phase 3D review but are NOT
 * implemented in Phase 3B; postgres-store.js throws NOT_IMPLEMENTED for them
 * and the database role holds no write grants (see
 * db/migrations/0003_model_evidence_roles_rls.sql).
 */
export const STORE_READ_METHODS = Object.freeze([
  'findProductByCanonicalModel',
  'findProductByAlias',
  'resolveStoredIdentity',
  'getLifecycleClaims',
  'getEvidenceSources',
  'getBestStoredEvidence',
  'healthCheck',
  'close',
]);

/** True when `candidate` satisfies the read surface above. */
export function isStoreLike(candidate) {
  if (!candidate || typeof candidate !== 'object') return false;
  return STORE_READ_METHODS.every((method) => typeof candidate[method] === 'function');
}
