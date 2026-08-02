/**
 * Persistent-store telemetry fields, shared by BOTH allowlist loggers.
 *
 * Why this module exists:
 *
 *   lib/smart-lookup/telemetry.js and lib/serial-refinement/telemetry.js each
 *   build an explicit allowlist and SILENTLY DROP any field not named in it.
 *   This repository has already shipped a bug of exactly that shape (the
 *   progressive-LKQ fields were emitted for weeks and never reached
 *   production logs). Defining the projection once and importing it into both
 *   allowlists makes it structurally impossible for one logger to carry a
 *   field the other does not.
 *
 * Safety: every value is boolean, finite number, uuid, or a categorical
 * string. No raw model number, serial, query, URL, source text, connection
 * string, or internal database id can pass through here.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

function booleanOrNull(value) {
  return value === undefined || value === null ? null : Boolean(value);
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

/** Categorical token only; anything else is dropped rather than logged. */
function codeOrNull(value) {
  if (value === undefined || value === null) return null;
  const text = String(value);
  return CODE_PATTERN.test(text) ? text : null;
}

/** Public uuid only. An internal bigint id can never satisfy this. */
function publicIdOrNull(value) {
  if (!value) return null;
  const text = String(value);
  return UUID_PATTERN.test(text) ? text : null;
}

/**
 * Project persistent-store fields for an allowlist logger.
 *
 * @param {object} fields raw log fields
 * @returns {object} the persistent-store slice, all keys always present
 */
export function persistentStoreTelemetryFields(fields = {}) {
  return {
    persistentStoreAttempted: booleanOrNull(fields.persistentStoreAttempted),
    persistentStoreAvailable: booleanOrNull(fields.persistentStoreAvailable),
    persistentStoreHit: booleanOrNull(fields.persistentStoreHit),
    persistentStoreFresh: booleanOrNull(fields.persistentStoreFresh),
    persistentStoreStale: booleanOrNull(fields.persistentStoreStale),
    persistentStoreDurationMs: finiteOrNull(fields.persistentStoreDurationMs),

    persistentStoreMatchType: codeOrNull(fields.persistentStoreMatchType),
    persistentStoreProductMatched: publicIdOrNull(fields.persistentStoreProductMatched),
    persistentStoreAliasMatched: booleanOrNull(fields.persistentStoreAliasMatched),
    persistentStoreEvidenceCount: finiteOrNull(fields.persistentStoreEvidenceCount),
    persistentStoreEvidenceAgeDays: finiteOrNull(fields.persistentStoreEvidenceAgeDays),

    persistentStoreComparison: codeOrNull(fields.persistentStoreComparison),
    persistentStoreAgreement: booleanOrNull(fields.persistentStoreAgreement),
    persistentStoreIdentityDisagreement: booleanOrNull(fields.persistentStoreIdentityDisagreement),
    persistentStoreLifecycleDisagreement: booleanOrNull(fields.persistentStoreLifecycleDisagreement),

    persistentStoreAmbiguous: booleanOrNull(fields.persistentStoreAmbiguous),
    persistentStoreMalformed: booleanOrNull(fields.persistentStoreMalformed),
    persistentStoreTimedOut: booleanOrNull(fields.persistentStoreTimedOut),
    persistentStoreFailureCode: codeOrNull(fields.persistentStoreFailureCode),

    // Phase 3B invariants. A shadow read must never skip a provider call and
    // never schedule a refresh; both are asserted by tests. The fields exist
    // now so the metric series is continuous into Phase 3C/3F.
    providerAvoided: booleanOrNull(fields.providerAvoided),
    refreshScheduled: booleanOrNull(fields.refreshScheduled),
  };
}

/** Field names carried by both allowlists. Used by tests to assert parity. */
export const PERSISTENT_STORE_TELEMETRY_FIELD_NAMES = Object.freeze(
  Object.keys(persistentStoreTelemetryFields({})),
);
