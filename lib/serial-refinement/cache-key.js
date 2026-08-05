import { createHash } from 'node:crypto';
import { normalizeCandidateYears } from './candidate-intersection.js';
import { compactModelValue } from './normalize-model.js';

export const SERIAL_REFINEMENT_CACHE_NAMESPACE = 'serial-refinement:v3';
export const SERIAL_REFINEMENT_SCHEMA_VERSION = '3';
/** Bumped for Phase 2: ranked/era ladder + failure envelope + mode-safe keys. */
export const SERIAL_REFINEMENT_POLICY_VERSION = '3';
export const MODEL_PRODUCTION_DB_VERSION = '2026-07-29';
/** Must stay aligned with deterministic/cache.js IDENTITY_POLICY_VERSION. */
export const IDENTITY_POLICY_VERSION = '1';
/** Bumped for the native Gemini research path (different range semantics). */
export const EVIDENCE_POLICY_VERSION = '3';

function safeToken(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
}

export function hashModelIdentifier(value) {
  return createHash('sha256').update(compactModelValue(value)).digest('hex').slice(0, 16);
}

/**
 * Final refinement response cache key.
 * Includes schema/policy/identity/evidence versions and refinement mode so
 * switching MODEL_REFINEMENT_MODE cannot serve incompatible stale payloads.
 */
export function buildSerialRefinementCacheKey(
  { brand, category, model, candidateYears, decodedMonth },
  options = {},
) {
  const years = normalizeCandidateYears(options.effectiveCandidateYears || candidateYears).join(',');
  // Prefer canonical model for cache identity so safe O/0 equivalents
  // (e.g. WED4850HWO / WED4850HW0) reuse evidence. Callers still preserve
  // the entered form in the response body via modelIdentity.
  const modelForKey = options.canonicalModel || options.cacheModel || model;
  const material = [
    SERIAL_REFINEMENT_SCHEMA_VERSION,
    SERIAL_REFINEMENT_POLICY_VERSION,
    IDENTITY_POLICY_VERSION,
    EVIDENCE_POLICY_VERSION,
    MODEL_PRODUCTION_DB_VERSION,
    safeToken(options.mode || 'legacy_gemini'),
    safeToken(brand),
    safeToken(category),
    compactModelValue(modelForKey),
    years,
    safeToken(decodedMonth),
  ].join('|');
  const digest = createHash('sha256').update(material).digest('hex');
  return `${SERIAL_REFINEMENT_CACHE_NAMESPACE}:${digest}`;
}
