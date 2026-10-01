import { TIERS } from '../replacement-core/enums.js';
import { comparableValue, getFact, normalizeTier, numeric, present } from '../replacement-core/normalize-values.js';

/**
 * Likeness signals for the sparse-evidence fallback.
 *
 * They are the LAST substantive ranking keys, used only when every ordinary key (hard failures, classification,
 * similarity, confidence, tighter upgrade) cannot tell candidates apart, which is what happens when all researched
 * specifications are ASSUMED. They read the facts that are present at any status, so they can never override a known
 * hard failure or a properly evidenced result, and they use no provider rank and no price.
 */

const SIZE_KEY = Object.freeze({ television: 'screenSizeIn', refrigerator: 'totalCapacityCuFt' });
const FAMILY_KEYS = Object.freeze({ television: ['displayTechnology', 'series'], refrigerator: ['configurationFloor', 'layout', 'series'] });
const SPEC_KEYS = Object.freeze({ television: ['resolution', 'refreshHz', 'smart', 'hdr', 'tier'], refrigerator: ['installationType', 'dispenser', 'iceMaker', 'counterDepth', 'finish', 'tier'] });
const UNKNOWN_SIZE_SCORE = 2;
const SMALLER_SIZE_BASE = 3;

const valueOf = (identity, key) => { const entry = getFact(identity, key); return present(entry) ? entry.value : null; };
const same = (a, b) => (typeof a === 'number' && typeof b === 'number' ? a === b : String(a).toLowerCase() === String(b).toLowerCase());

function ordinal(key, value) {
  if (key === 'tier') { const index = TIERS.indexOf(normalizeTier(value)); return index < 0 ? null : index + 1; }
  const parsed = comparableValue(key, value);
  return typeof parsed === 'number' ? parsed : null;
}

function compareKeys(original, candidate, keys) {
  let matches = 0, mismatches = 0, overshoot = 0;
  for (const key of keys) {
    const o = valueOf(original, key), c = valueOf(candidate, key);
    if (o === null || c === null) continue;
    if (same(o, c)) { matches += 1; continue; }
    mismatches += 1;
    const from = ordinal(key, o), to = ordinal(key, c);
    if (from !== null && to !== null && from > 0 && to > from) overshoot += (to - from) / from;
  }
  return { matches, mismatches, overshoot };
}

const cache = new WeakMap();

/** Lower is better for every field except `familyMatches`. */
export function likeness(evaluation) {
  if (cache.has(evaluation)) return cache.get(evaluation);
  const original = evaluation.normalizedOriginal, candidate = evaluation.candidate.identity;
  const sizeKey = SIZE_KEY[original.category];
  const o = numeric(valueOf(original, sizeKey)), c = numeric(valueOf(candidate, sizeKey));
  // Same class first, then the closest LARGER size (an unnecessary upgrade), then unknown, then smaller (likely a hard failure once sourced).
  const sizeScore = o === null || c === null ? UNKNOWN_SIZE_SCORE : c === o ? 0 : c > o ? 1 + (c - o) / o : SMALLER_SIZE_BASE + (o - c) / o;
  const ob = valueOf(original, 'brand'), cb = valueOf(candidate, 'brand');
  const family = compareKeys(original, candidate, FAMILY_KEYS[original.category] || []);
  const spec = compareKeys(original, candidate, SPEC_KEYS[original.category] || []);
  const result = {
    categoryMismatch: Number(candidate.category !== original.category),
    sizeScore,
    brandMismatch: ob !== null && cb !== null ? Number(!same(ob, cb)) : 0,
    familyMismatches: family.mismatches,
    familyMatches: family.matches,
    specMismatches: spec.mismatches,
    overshoot: spec.overshoot,
  };
  cache.set(evaluation, result);
  return result;
}

/** In priority order: category, nominal size/capacity class, brand, family/display/configuration, closest non-excessive spec match. */
export const LIKENESS_KEYS = Object.freeze([
  ['likeness: same category', (l) => l.categoryMismatch],
  ['likeness: nominal size/capacity class', (l) => l.sizeScore],
  ['likeness: same brand', (l) => l.brandMismatch],
  ['likeness: family/display/configuration mismatches', (l) => l.familyMismatches],
  ['likeness: family/display/configuration matches', (l) => -l.familyMatches],
  ['likeness: closest specification match', (l) => l.specMismatches],
  ['likeness: non-excessive specification', (l) => l.overshoot],
]);
