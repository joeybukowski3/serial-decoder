import { hashCanonicalQuery } from '../smart-lookup/cache.js';
import { getFact, present } from '../replacement-core/normalize-values.js';
import { RESEARCH_PROMPT_VERSION } from './research-prompts.js';
import { RESEARCH_SCHEMA_VERSION, modelKey } from './research-schema.js';

/**
 * Deterministic cache identity for a research result. Design only: nothing here
 * reads or writes Redis. The key is built from normalized facts, never raw text,
 * so spelling/spacing variants share an entry while materially different
 * configurations cannot collide.
 */

export const RESEARCH_CACHE_PREFIX = 'replacement-research:v1';
// Facts that change what research returns. physicalFit is excluded: it is never researched.
const MATERIAL_KEYS = Object.freeze({
  television: ['screenSizeIn', 'resolution', 'displayTechnology', 'refreshHz', 'smart', 'hdr', 'series', 'tier', 'modelYear'],
  refrigerator: ['totalCapacityCuFt', 'installationType', 'configurationFloor', 'layout', 'counterDepth', 'dispenser', 'iceMaker', 'finish', 'series', 'tier', 'modelYear'],
});

function materialValue(original, key) {
  const entry = getFact(original, key);
  // ASSUMED values (e.g. brand-baseline tier) are deterministic functions of other fields, so they add nothing.
  return present(entry) && entry.status !== 'ASSUMED' ? `${key}=${String(entry.value).trim().toLowerCase()}` : null;
}

export function researchIdentityParts(original) {
  const model = getFact(original, 'model');
  return [
    `category=${original.category}`,
    `brand=${String(getFact(original, 'brand').value ?? '').trim().toLowerCase()}`,
    `model=${present(model) ? modelKey(String(model.value)) : ''}`,
    `line=${String(getFact(original, 'modelLine').value ?? getFact(original, 'family').value ?? '').trim().toLowerCase()}`,
    ...(MATERIAL_KEYS[original.category] || []).map((key) => materialValue(original, key)).filter(Boolean).sort(),
  ];
}

/** job: 'original' | 'candidates'. `limit` only matters for candidate discovery. */
export function buildResearchCacheKey({ job, original, mode, limit = null }) {
  if (!['original', 'candidates'].includes(job)) throw new TypeError('job must be original or candidates');
  const identity = [
    `schema=${RESEARCH_SCHEMA_VERSION}`, `prompt=${RESEARCH_PROMPT_VERSION}`, `job=${job}`, `mode=${mode}`,
    ...(job === 'candidates' ? [`limit=${limit}`] : []),
    ...researchIdentityParts(original),
  ].join('|');
  return `${RESEARCH_CACHE_PREFIX}:${job}:${original.category}:${hashCanonicalQuery(identity)}`;
}
