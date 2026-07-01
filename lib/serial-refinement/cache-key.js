import { createHash } from 'node:crypto';
import { normalizeCandidateYears } from './candidate-intersection.js';
import { compactModelValue } from './normalize-model.js';

export const SERIAL_REFINEMENT_CACHE_NAMESPACE = 'serial-refinement:v1';
export const SERIAL_REFINEMENT_SCHEMA_VERSION = '1';
export const SERIAL_REFINEMENT_POLICY_VERSION = '1';

function safeToken(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
}

export function hashModelIdentifier(value) {
  return createHash('sha256').update(compactModelValue(value)).digest('hex').slice(0, 16);
}

export function buildSerialRefinementCacheKey({ brand, category, model, candidateYears, decodedMonth }) {
  const years = normalizeCandidateYears(candidateYears).join(',');
  const material = [
    SERIAL_REFINEMENT_SCHEMA_VERSION,
    SERIAL_REFINEMENT_POLICY_VERSION,
    safeToken(brand),
    safeToken(category),
    compactModelValue(model),
    years,
    safeToken(decodedMonth),
  ].join('|');
  const digest = createHash('sha256').update(material).digest('hex');
  return `${SERIAL_REFINEMENT_CACHE_NAMESPACE}:${digest}`;
}
