/**
 * Deterministic shadow comparison: stored evidence vs the live evidence the
 * lookup actually produced.
 *
 * This module exists ONLY for rollout analysis. Nothing here can influence a
 * user-facing result — it is a pure function over two already-computed
 * objects, and its output goes to telemetry and nowhere else.
 *
 * Policy notes:
 *
 *   Ranges are compared by OVERLAP, not equality. Requiring exact equality
 *   would report disagreement for two sources that both place a product in the
 *   same era with different precision, which is the normal case and would make
 *   the rollout metric useless.
 *
 *   Staleness is reported as its own classification (the Phase 3B metric set
 *   requires a stale rate) AND the lifecycle relation is still computed into
 *   `details.lifecycleRelation`, so a stale record's correctness remains
 *   measurable rather than being hidden behind the staleness label.
 */
import { isCanonicalTranscriptionEquivalent, compactModelToken, normalizeEvidenceBrand } from './normalization.js';
import { STORE_FAILURE_CODES } from './store-interface.js';

export const COMPARISON = Object.freeze({
  NOT_ATTEMPTED: 'store_not_attempted',
  UNAVAILABLE: 'store_unavailable',
  TIMEOUT: 'store_timeout',
  AMBIGUOUS: 'store_ambiguous',
  MALFORMED: 'store_malformed',
  NO_RECORD: 'no_store_record',
  IDENTITY_DISAGREEMENT: 'identity_disagreement',
  STALE: 'store_stale',
  AGREEMENT: 'agreement',
  LIFECYCLE_DIFFERENCE: 'identity_agreement_lifecycle_difference',
  CONFLICTING_LIFECYCLE: 'conflicting_lifecycle',
  STORE_STRONGER: 'store_stronger',
  LIVE_STRONGER: 'live_stronger',
});

const LIFECYCLE_EVENT_TYPES = new Set([
  'launch', 'availability', 'production_start', 'production_end', 'discontinuation',
]);
const START_EVENT_TYPES = new Set(['launch', 'availability', 'production_start']);
const CONFIDENCE_RANK = { low: 1, medium: 2, high: 3 };

/**
 * Project the live shared-evidence result onto the small set of fields the
 * comparison actually uses.
 *
 * Reads only documented fields of the shared evidence contract
 * (lib/model-evidence/service.js), so a change to response rendering cannot
 * break the comparison.
 */
export function projectLiveEvidence(shared) {
  if (!shared || typeof shared !== 'object') {
    return {
      brandKey: '', canonicalModel: '', normalizedModel: '', category: null,
      start: null, end: null, introductionYear: null,
      identityConfidence: null, evidenceConfidence: null,
      matchType: 'unknown', hasEvidence: false,
    };
  }

  const facts = Array.isArray(shared.facts) ? shared.facts : [];
  const lifecycleFacts = facts.filter((item) =>
    item?.fact?.target === 'model_lifecycle'
    && LIFECYCLE_EVENT_TYPES.has(item?.fact?.eventType)
    && Number.isInteger(item?.fact?.year));

  const startYears = lifecycleFacts
    .filter((item) => START_EVENT_TYPES.has(item.fact.eventType))
    .map((item) => item.fact.year);

  const evidenceConfidence = facts
    .map((item) => CONFIDENCE_RANK[item?.extraction?.confidence] || 0)
    .reduce((max, value) => Math.max(max, value), 0);

  const canonicalModel = shared.matchedIdentity?.model
    || shared.requestedIdentity?.canonicalModel
    || shared.requestedIdentity?.model
    || '';

  return {
    brandKey: normalizeEvidenceBrand(shared.requestedIdentity?.brand),
    canonicalModel: String(canonicalModel),
    normalizedModel: compactModelToken(canonicalModel),
    category: shared.requestedIdentity?.searchCategory || null,
    start: Number.isInteger(shared.lifecycle?.supportedProductionStartYear)
      ? shared.lifecycle.supportedProductionStartYear
      : null,
    end: Number.isInteger(shared.lifecycle?.supportedProductionEndYear)
      ? shared.lifecycle.supportedProductionEndYear
      : (Number.isInteger(shared.lifecycle?.supportedDiscontinuationYear)
        ? shared.lifecycle.supportedDiscontinuationYear
        : null),
    introductionYear: startYears.length ? Math.min(...startYears) : null,
    identityConfidence: shared.requestedIdentity?.identityConfidence
      || shared.modelIdentity?.identityConfidence
      || null,
    evidenceConfidence: evidenceConfidence
      ? Object.keys(CONFIDENCE_RANK).find((key) => CONFIDENCE_RANK[key] === evidenceConfidence)
      : null,
    matchType: shared.matchedIdentity?.matchType || 'unknown',
    hasEvidence: lifecycleFacts.length > 0,
  };
}

/**
 * Do two year windows overlap? A null bound is treated as unbounded, so
 * "2019 or later" overlaps "2020-2022".
 */
export function rangesOverlap(left, right) {
  const leftStart = left.start ?? Number.NEGATIVE_INFINITY;
  const leftEnd = left.end ?? Number.POSITIVE_INFINITY;
  const rightStart = right.start ?? Number.NEGATIVE_INFINITY;
  const rightEnd = right.end ?? Number.POSITIVE_INFINITY;
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

function hasWindow(window) {
  return window.start !== null || window.end !== null;
}

function compareLifecycle(storeWindow, liveWindow) {
  const storeHas = hasWindow(storeWindow);
  const liveHas = hasWindow(liveWindow);

  if (!storeHas && !liveHas) return COMPARISON.AGREEMENT;
  if (storeHas && !liveHas) return COMPARISON.STORE_STRONGER;
  if (!storeHas && liveHas) return COMPARISON.LIVE_STRONGER;
  if (!rangesOverlap(storeWindow, liveWindow)) return COMPARISON.CONFLICTING_LIFECYCLE;
  if (storeWindow.start === liveWindow.start && storeWindow.end === liveWindow.end) {
    return COMPARISON.AGREEMENT;
  }
  return COMPARISON.LIFECYCLE_DIFFERENCE;
}

function identityAgrees(storeProduct, live) {
  // Brand must agree when both sides state one. An empty brandKey means
  // "unknown brand", which is not a disagreement.
  if (storeProduct.brandKey && live.brandKey && storeProduct.brandKey !== live.brandKey) {
    return false;
  }
  const storeModel = compactModelToken(storeProduct.normalizedModel);
  const liveModel = live.normalizedModel;
  if (!storeModel || !liveModel) return true; // nothing to contradict
  if (storeModel === liveModel) return true;
  // The bounded Phase 1 O/0, I/1, L/1 equivalences are agreement, not conflict.
  return isCanonicalTranscriptionEquivalent(storeModel, liveModel);
}

/**
 * Classify one shadow observation.
 *
 * @param {import('./store-interface.js').StoreReadResult} storeResult
 * @param {object} sharedEvidence  the live result from lookupModelEvidence()
 * @returns {{classification: string, agreement: boolean,
 *            identityDisagreement: boolean, lifecycleDisagreement: boolean,
 *            details: object}}
 */
export function compareStoreWithLive(storeResult, sharedEvidence) {
  const live = projectLiveEvidence(sharedEvidence);
  const base = {
    agreement: false,
    identityDisagreement: false,
    lifecycleDisagreement: false,
    details: {
      liveStart: live.start,
      liveEnd: live.end,
      liveIntroductionYear: live.introductionYear,
      liveMatchType: live.matchType,
      liveIdentityConfidence: live.identityConfidence,
      liveEvidenceConfidence: live.evidenceConfidence,
      storeStart: null,
      storeEnd: null,
      storeIntroductionYear: null,
      storeIdentityConfidence: null,
      storeEvidenceQuality: null,
      storeFreshness: null,
      storeClaimCount: 0,
      storeMalformedClaimCount: 0,
      brandAgreement: null,
      categoryAgreement: null,
      modelLineAgreement: null,
      introductionYearAgreement: null,
      lifecycleRelation: null,
    },
  };

  if (!storeResult || !storeResult.attempted) {
    return { ...base, classification: COMPARISON.NOT_ATTEMPTED };
  }
  if (storeResult.timedOut) {
    return { ...base, classification: COMPARISON.TIMEOUT };
  }
  if (storeResult.ambiguous) {
    return { ...base, classification: COMPARISON.AMBIGUOUS };
  }
  if (!storeResult.available
    || [STORE_FAILURE_CODES.UNAVAILABLE, STORE_FAILURE_CODES.QUERY_ERROR,
      STORE_FAILURE_CODES.NOT_CONFIGURED, STORE_FAILURE_CODES.DISABLED,
      STORE_FAILURE_CODES.INVALID_INPUT, STORE_FAILURE_CODES.NO_BUDGET]
      .includes(storeResult.failureCode)) {
    return { ...base, classification: COMPARISON.UNAVAILABLE };
  }
  if (!storeResult.hit || !storeResult.bundle) {
    return { ...base, classification: COMPARISON.NO_RECORD };
  }

  const bundle = storeResult.bundle;
  const product = bundle.product || {};
  const storeWindow = { start: bundle.lifecycle?.start ?? null, end: bundle.lifecycle?.end ?? null };
  const liveWindow = { start: live.start, end: live.end };
  const lifecycleRelation = compareLifecycle(storeWindow, liveWindow);

  const details = {
    ...base.details,
    storeStart: storeWindow.start,
    storeEnd: storeWindow.end,
    storeIntroductionYear: bundle.introductionYear ?? null,
    storeIdentityConfidence: product.identityConfidence || null,
    storeEvidenceQuality: strongestQuality(bundle.claims),
    storeFreshness: bundle.freshness || null,
    storeClaimCount: Array.isArray(bundle.claims) ? bundle.claims.length : 0,
    storeMalformedClaimCount: bundle.malformedClaimCount || 0,
    storeMatchedBy: product.matchedBy || null,
    storeIdentityKind: product.identityKind || null,
    brandAgreement: product.brandKey && live.brandKey
      ? product.brandKey === live.brandKey
      : null,
    categoryAgreement: product.category && live.category
      ? String(product.category).toLowerCase() === String(live.category).toLowerCase()
      : null,
    modelLineAgreement: product.modelLine && sharedEvidence?.requestedIdentity?.modelLine
      ? String(product.modelLine).toLowerCase() === String(sharedEvidence.requestedIdentity.modelLine).toLowerCase()
      : null,
    introductionYearAgreement: Number.isInteger(bundle.introductionYear) && Number.isInteger(live.introductionYear)
      ? bundle.introductionYear === live.introductionYear
      : null,
    lifecycleRelation,
  };

  // A malformed row that left NOTHING usable is a data-integrity signal and
  // outranks every other classification. A malformed row alongside usable
  // claims is reported in details instead, so one bad row cannot mask the
  // agreement measurement the rollout depends on.
  if (bundle.malformedClaimCount > 0 && !details.storeClaimCount) {
    return { ...base, details, classification: COMPARISON.MALFORMED };
  }

  if (!identityAgrees(product, live)) {
    return {
      ...base,
      details,
      classification: COMPARISON.IDENTITY_DISAGREEMENT,
      identityDisagreement: true,
    };
  }

  if (bundle.conflict) {
    return {
      ...base,
      details,
      classification: COMPARISON.CONFLICTING_LIFECYCLE,
      lifecycleDisagreement: true,
    };
  }

  if (bundle.freshness === 'stale' || bundle.freshness === 'expired') {
    return {
      ...base,
      details,
      classification: COMPARISON.STALE,
      lifecycleDisagreement: lifecycleRelation === COMPARISON.CONFLICTING_LIFECYCLE
        || lifecycleRelation === COMPARISON.LIFECYCLE_DIFFERENCE,
    };
  }

  return {
    ...base,
    details,
    classification: lifecycleRelation,
    agreement: lifecycleRelation === COMPARISON.AGREEMENT,
    lifecycleDisagreement: lifecycleRelation === COMPARISON.CONFLICTING_LIFECYCLE
      || lifecycleRelation === COMPARISON.LIFECYCLE_DIFFERENCE,
  };
}

const QUALITY_RANK = ['deprecated', 'conflicting', 'weak', 'supported', 'strong', 'verified'];

function strongestQuality(claims) {
  let best = null;
  let bestRank = -1;
  for (const claim of Array.isArray(claims) ? claims : []) {
    const rank = QUALITY_RANK.indexOf(claim?.evidenceQuality);
    if (rank > bestRank) {
      bestRank = rank;
      best = claim.evidenceQuality;
    }
  }
  return best;
}
