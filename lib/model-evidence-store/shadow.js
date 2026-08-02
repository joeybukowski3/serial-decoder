/**
 * Shadow-read orchestration for the persistent model evidence store.
 *
 * Phase 3B contract, in one sentence: read the store, compare what it says
 * with what the live path actually produced, log the comparison, and throw the
 * store's answer away.
 *
 * The read is started BEFORE the provider work so that awaiting it afterwards
 * costs effectively nothing (Serper + Gemini take seconds; the store read is
 * capped at 120 ms and has long since settled). It is nevertheless bounded on
 * both ends so that a path where providers fail instantly still cannot be
 * delayed by more than the cap.
 */
import { createHash } from 'node:crypto';

import { compareStoreWithLive, COMPARISON } from './comparison.js';
import {
  DEFAULT_STORE_READ_RESERVE_MS,
  getStoreReadMaxMs,
  isStoreConsulted,
  resolveStoreMode,
} from './index.js';
import { createMissResult, STORE_FAILURE_CODES } from './store-interface.js';

export const STORE_SHADOW_EVENT = 'model_evidence_store_shadow';

/**
 * Head-room allowed above the store's own read cap before the shadow layer
 * abandons the read itself. Small enough to stay well inside the route
 * deadline, large enough that the adapter's more precise timeout normally
 * fires first and reports the accurate failure code.
 */
export const STORE_SHADOW_GRACE_MS = 60;

function modelHash(value) {
  return createHash('sha256')
    .update(String(value || '').trim().toUpperCase())
    .digest('hex')
    .slice(0, 16);
}

/**
 * Start a bounded shadow read.
 *
 * @returns {Promise<import('./store-interface.js').StoreReadResult>|null}
 *          null when the store must not be consulted at all
 */
export function beginStoreShadowRead(input = {}, options = {}) {
  const env = options.env || process.env;
  const store = options.store;
  if (!store || store.kind === 'null') return null;
  if (!options.force && !isStoreConsulted(env)) return null;

  const now = options.now || Date.now;
  const maxMs = options.maxMs || getStoreReadMaxMs(env);
  const reserveMs = options.reserveMs ?? DEFAULT_STORE_READ_RESERVE_MS;
  const deadline = options.deadline;

  // Never start a read that could not finish inside its own cap while leaving
  // the reserve intact. This is what guarantees the store cannot consume the
  // deterministic completion reserve.
  if (deadline && !deadline.hasTime(maxMs, reserveMs)) {
    return Promise.resolve(createMissResult({
      attempted: true,
      failureCode: STORE_FAILURE_CODES.NO_BUDGET,
    }));
  }

  const startedAt = now();
  const storeCall = Promise.resolve()
    .then(() => store.getBestStoredEvidence(
      {
        brand: input.brand,
        model: input.model,
        category: input.category,
        modelIdentity: input.modelIdentity,
      },
      { deadline, maxMs, reserveMs },
    ))
    .then(
      (result) => result || createMissResult({ attempted: true, durationMs: Math.max(0, now() - startedAt) }),
      // The adapter already absorbs its own failures; this is a belt-and-braces
      // guard so an unexpected throw can never surface into the lookup path.
      () => createMissResult({
        attempted: true,
        failureCode: STORE_FAILURE_CODES.UNAVAILABLE,
        durationMs: Math.max(0, now() - startedAt),
      }),
    );

  // INDEPENDENT outer bound.
  //
  // The Postgres adapter already caps itself, but the safety rule cannot rest
  // on a store implementation honouring its own contract: a store that hangs
  // must not be able to hold the lookup open. This race guarantees the shadow
  // task settles even if getBestStoredEvidence never resolves.
  //
  // The grace period lets the adapter's own (more precise) timeout win
  // normally, so a genuine query timeout is still reported as STORE_TIMEOUT
  // rather than being masked by this backstop.
  let timer;
  const abandon = new Promise((resolve) => {
    timer = setTimeout(
      () => resolve(createMissResult({
        attempted: true,
        timedOut: true,
        failureCode: STORE_FAILURE_CODES.TIMEOUT,
        durationMs: Math.max(0, now() - startedAt),
      })),
      maxMs + STORE_SHADOW_GRACE_MS,
    );
    // Never hold a serverless function (or a test runner) open for this.
    timer?.unref?.();
  });

  return Promise.race([storeCall, abandon]).finally(() => clearTimeout(timer));
}

/**
 * Settle a shadow task without ever rejecting.
 *
 * @returns {Promise<import('./store-interface.js').StoreReadResult|null>}
 */
export async function settleStoreShadowRead(task) {
  if (!task) return null;
  try {
    return await task;
  } catch (_) {
    return createMissResult({ attempted: true, failureCode: STORE_FAILURE_CODES.UNAVAILABLE });
  }
}

/**
 * Build the flat telemetry payload for one shadow observation.
 *
 * Contains no raw model numbers, no serials, no URLs, no user text, and no
 * internal database ids — the product is identified by its public uuid only.
 */
export function buildStoreShadowEvent(storeResult, sharedEvidence, context = {}) {
  const comparison = compareStoreWithLive(storeResult, sharedEvidence);
  const result = storeResult || createMissResult();
  const bundle = result.bundle;

  return {
    event: STORE_SHADOW_EVENT,
    feature: 'persistent-model-evidence-store',
    phase: '3b-shadow',
    storeMode: context.storeMode || 'shadow',
    consumer: context.consumer || 'unknown',
    requestHash: context.requestId ? modelHash(context.requestId) : null,
    normalizedBrand: String(context.brand || '').trim().toLowerCase() || null,
    modelHash: modelHash(context.model),

    persistentStoreAttempted: Boolean(result.attempted),
    persistentStoreAvailable: Boolean(result.available),
    persistentStoreHit: Boolean(result.hit),
    persistentStoreFresh: bundle ? bundle.freshness === 'fresh' : false,
    persistentStoreStale: bundle
      ? (bundle.freshness === 'stale' || bundle.freshness === 'expired')
      : false,
    persistentStoreDurationMs: Number.isFinite(result.durationMs) ? result.durationMs : null,

    persistentStoreMatchType: bundle?.product?.matchedBy || null,
    persistentStoreProductMatched: bundle?.product?.publicId || null,
    persistentStoreAliasMatched: bundle?.product?.matchedBy === 'alias',
    persistentStoreEvidenceCount: bundle ? bundle.claims.length : 0,
    persistentStoreEvidenceAgeDays: bundle?.oldestClaimAgeDays ?? null,

    persistentStoreComparison: comparison.classification,
    persistentStoreAgreement: comparison.agreement,
    persistentStoreIdentityDisagreement: comparison.identityDisagreement,
    persistentStoreLifecycleDisagreement: comparison.lifecycleDisagreement,

    persistentStoreAmbiguous: Boolean(result.ambiguous),
    persistentStoreMalformed: Boolean(result.malformed),
    persistentStoreTimedOut: Boolean(result.timedOut),
    persistentStoreFailureCode: result.failureCode || null,

    // Hard-coded false in Phase 3B and asserted by tests: a shadow read must
    // not skip a provider call and must not schedule a refresh. These fields
    // exist now so the metric series is continuous into Phase 3C/3F.
    providerAvoided: false,
    refreshScheduled: false,

    comparisonDetails: comparison.details,
  };
}

/**
 * Compact summary suitable for embedding in the existing
 * `shared_model_evidence` log line.
 */
export function summarizeStoreShadow(event) {
  if (!event) return null;
  return {
    attempted: event.persistentStoreAttempted,
    available: event.persistentStoreAvailable,
    hit: event.persistentStoreHit,
    fresh: event.persistentStoreFresh,
    stale: event.persistentStoreStale,
    durationMs: event.persistentStoreDurationMs,
    matchType: event.persistentStoreMatchType,
    aliasMatched: event.persistentStoreAliasMatched,
    evidenceCount: event.persistentStoreEvidenceCount,
    evidenceAgeDays: event.persistentStoreEvidenceAgeDays,
    comparison: event.persistentStoreComparison,
    agreement: event.persistentStoreAgreement,
    timedOut: event.persistentStoreTimedOut,
    failureCode: event.persistentStoreFailureCode,
    providerAvoided: false,
    refreshScheduled: false,
  };
}

/**
 * Observe a shadow read: compare, log, and return a summary.
 *
 * Returns null when no shadow read ran, so callers can omit the fields
 * entirely rather than emitting a misleading all-false record.
 */
export async function observeStoreShadow(task, context = {}) {
  const storeResult = await settleStoreShadowRead(task);
  if (!storeResult) return null;

  let event;
  try {
    event = buildStoreShadowEvent(storeResult, context.sharedEvidence, {
      ...context,
      storeMode: context.storeMode || resolveStoreMode(context.env || process.env),
    });
  } catch (_) {
    // Comparison is pure, but a malformed live object must never break a
    // lookup that has already succeeded.
    event = {
      event: STORE_SHADOW_EVENT,
      feature: 'persistent-model-evidence-store',
      phase: '3b-shadow',
      persistentStoreAttempted: true,
      persistentStoreComparison: COMPARISON.UNAVAILABLE,
      persistentStoreFailureCode: STORE_FAILURE_CODES.QUERY_ERROR,
      providerAvoided: false,
      refreshScheduled: false,
    };
  }

  try {
    (context.logger || console).info?.(JSON.stringify(event));
  } catch (_) { /* logging must never throw into the lookup path */ }

  return summarizeStoreShadow(event);
}
