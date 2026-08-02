/**
 * Null store — the always-miss implementation.
 *
 * Returned by createEvidenceStore() whenever the store cannot or must not be
 * used: the feature flag is off, credentials are absent, or the client failed
 * to construct.
 *
 * This is the mechanism behind the Phase 3B non-negotiable safety rule.
 * Because every caller receives an object satisfying the same interface,
 * there is exactly ONE code path through lookupModelEvidence(), and
 * "database unavailable" is not a branch — it is a miss.
 */
import { createMissResult, STORE_FAILURE_CODES } from './store-interface.js';

/**
 * @param {{failureCode?: string}} [options]
 */
export function createNullStore(options = {}) {
  const failureCode = options.failureCode || STORE_FAILURE_CODES.DISABLED;

  const miss = async () => createMissResult({ failureCode });

  return {
    kind: 'null',
    failureCode,

    findProductByCanonicalModel: miss,
    findProductByAlias: miss,
    resolveStoredIdentity: miss,
    getLifecycleClaims: async () => [],
    getEvidenceSources: async () => new Map(),
    getBestStoredEvidence: miss,

    async healthCheck() {
      return { ok: false, failureCode, durationMs: 0 };
    },

    async close() {
      /* nothing to release */
    },
  };
}
