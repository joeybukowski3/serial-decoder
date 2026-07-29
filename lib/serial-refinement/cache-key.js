import { createHash } from 'node:crypto';
import { normalizeCandidateYears } from './candidate-intersection.js';
import { compactModelValue } from './normalize-model.js';

export const SERIAL_REFINEMENT_CACHE_NAMESPACE = 'serial-refinement:v2';
export const SERIAL_REFINEMENT_SCHEMA_VERSION = '2';
export const SERIAL_REFINEMENT_POLICY_VERSION = '2';
export const MODEL_PRODUCTION_DB_VERSION = '2026-07-29';

function safeToken(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
}

export function hashModelIdentifier(value) {
  return createHash('sha256').update(compactModelValue(value)).digest('hex').slice(0, 16);
}

export function buildSerialRefinementCacheKey(
  { brand, category, model, candidateYears, decodedMonth },
  options = {},
) {
  const years = normalizeCandidateYears(options.effectiveCandidateYears || candidateYears).join(',');
  const material = [
    SERIAL_REFINEMENT_SCHEMA_VERSION,
    SERIAL_REFINEMENT_POLICY_VERSION,
    MODEL_PRODUCTION_DB_VERSION,
    safeToken(options.mode || 'legacy_gemini'),
    safeToken(brand),
    safeToken(category),
    compactModelValue(model),
    years,
    safeToken(decodedMonth),
  ].join('|');
  const digest = createHash('sha256').update(material).digest('hex');
  return `${SERIAL_REFINEMENT_CACHE_NAMESPACE}:${digest}`;
}
