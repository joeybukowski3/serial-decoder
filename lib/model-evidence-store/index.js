/**
 * Persistent model evidence store — factory and feature flags.
 *
 * Phase 3B is SHADOW ONLY. Nothing this module returns may influence a
 * user-facing result; see lib/model-evidence-store/shadow.js for the
 * orchestration and lib/model-evidence/service.js for the single integration
 * point.
 *
 * Environment (all server-only; never exposed to the browser):
 *
 *   MODEL_EVIDENCE_STORE_SHADOW_ENABLED  read + compare + log, result discarded
 *                                        default: off
 *   MODEL_EVIDENCE_STORE_ENABLED         reserved for Phase 3C (live reads)
 *                                        default: off
 *   MODEL_EVIDENCE_DB_URL                Postgres connection string; use the
 *                                        Supabase TRANSACTION pooler (port 6543)
 *   MODEL_EVIDENCE_DB_MAX_MS             read cap in ms; default 120
 */
import { createNullStore } from './null-store.js';
import { isStoreLike, STORE_FAILURE_CODES } from './store-interface.js';

const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on']);

/**
 * Phase guard. Live reads are DESIGNED but NOT IMPLEMENTED in Phase 3B.
 *
 * While this is false, setting MODEL_EVIDENCE_STORE_ENABLED=true cannot change
 * a single user-facing result — the flag is recorded in telemetry and the read
 * still runs in shadow. Phase 3C flips this constant together with the live
 * read path, in one reviewable change.
 */
export const LIVE_READS_IMPLEMENTED = false;

export const DEFAULT_STORE_READ_MAX_MS = 120;
/**
 * Route budget that must remain after a store read. Keeps the store from ever
 * eating the deterministic completion reserve
 * (REFINEMENT_BUDGETS.deterministicCompletionReserveMs).
 */
export const DEFAULT_STORE_READ_RESERVE_MS = 400;

function truthy(value) {
  return TRUTHY_VALUES.has(String(value ?? '').trim().toLowerCase());
}

export function isStoreShadowEnabled(env = process.env) {
  return truthy(env?.MODEL_EVIDENCE_STORE_SHADOW_ENABLED);
}

export function isStoreLiveEnabled(env = process.env) {
  return truthy(env?.MODEL_EVIDENCE_STORE_ENABLED);
}

/**
 * Any store activity at all? Used as the cheap synchronous guard so a disabled
 * store costs zero — no await, no dynamic import, no client construction.
 */
export function isStoreConsulted(env = process.env) {
  return isStoreShadowEnabled(env) || isStoreLiveEnabled(env);
}

/**
 * Effective mode.
 *
 * Returns 'shadow' even when the live flag is set, until
 * LIVE_READS_IMPLEMENTED is true. Premature flag flips degrade to shadow
 * rather than to an untested code path.
 */
export function resolveStoreMode(env = process.env) {
  if (isStoreLiveEnabled(env) && LIVE_READS_IMPLEMENTED) return 'live';
  if (isStoreConsulted(env)) return 'shadow';
  return 'off';
}

export function getStoreReadMaxMs(env = process.env) {
  const raw = Number(env?.MODEL_EVIDENCE_DB_MAX_MS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_STORE_READ_MAX_MS;
  // Bounded on both sides: a misconfigured value must not be able to hand the
  // store an unbounded share of the route deadline.
  return Math.min(1000, Math.max(20, Math.round(raw)));
}

/**
 * Build a store.
 *
 * ALWAYS resolves to something satisfying the read interface — a Postgres
 * store when fully configured and enabled, a null store otherwise. It never
 * rejects, so callers need no try/catch for database availability.
 *
 * @returns {Promise<object>}
 */
export async function createEvidenceStore(env = process.env, options = {}) {
  if (options.store && isStoreLike(options.store)) return options.store;

  if (!options.force && !isStoreConsulted(env)) {
    return createNullStore({ failureCode: STORE_FAILURE_CODES.DISABLED });
  }

  const url = String(options.url || env?.MODEL_EVIDENCE_DB_URL || '').trim();
  if (!url) {
    return createNullStore({ failureCode: STORE_FAILURE_CODES.NOT_CONFIGURED });
  }

  try {
    // Loaded lazily so the Postgres driver is never imported (and never costs
    // cold-start time) on deployments where the store is switched off.
    const { createPostgresStore } = await import('./postgres-store.js');
    // The effective read cap is passed explicitly so the server-side
    // statement_timeout is derived from it. They must not be configured
    // independently: a fixed server timeout would silently override
    // MODEL_EVIDENCE_DB_MAX_MS and cancel queries the client was still waiting for.
    const store = createPostgresStore({
      url,
      maxMs: options.maxMs || getStoreReadMaxMs(env),
      reserveMs: options.reserveMs ?? DEFAULT_STORE_READ_RESERVE_MS,
      now: options.now,
      sql: options.sql,
      clientOptions: options.clientOptions,
      statementTimeoutMs: options.statementTimeoutMs,
    });
    if (!store || !isStoreLike(store)) {
      return createNullStore({ failureCode: STORE_FAILURE_CODES.NOT_CONFIGURED });
    }
    return store;
  } catch (_) {
    // Driver missing, bad URL, module resolution failure — all degrade to a
    // miss. A store that cannot be built is indistinguishable from one with
    // no matching row.
    return createNullStore({ failureCode: STORE_FAILURE_CODES.UNAVAILABLE });
  }
}

/**
 * Process-wide memoized store, keyed by connection URL + mode so a test or a
 * config change gets a fresh instance while normal traffic reuses one client
 * per function instance.
 */
let sharedStorePromise = null;
let sharedStoreKey = null;

export function getSharedEvidenceStore(env = process.env, options = {}) {
  const key = [
    resolveStoreMode(env),
    String(env?.MODEL_EVIDENCE_DB_URL || ''),
    String(getStoreReadMaxMs(env)),
  ].join('|');

  if (!sharedStorePromise || sharedStoreKey !== key) {
    sharedStoreKey = key;
    sharedStorePromise = createEvidenceStore(env, options);
  }
  return sharedStorePromise;
}

/** Test/ops helper: forget the memoized store. */
export async function resetSharedEvidenceStore() {
  const previous = sharedStorePromise;
  sharedStorePromise = null;
  sharedStoreKey = null;
  if (!previous) return;
  try {
    const store = await previous;
    await store?.close?.();
  } catch (_) { /* nothing to release */ }
}

export { createNullStore } from './null-store.js';
export { STORE_FAILURE_CODES, isStoreLike } from './store-interface.js';
