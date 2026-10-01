import { TIERS } from '../replacement-core/enums.js';
import { comparableValue, getFact, normalizeTier, present } from '../replacement-core/normalize-values.js';
import { LIKENESS_KEYS, likeness } from './ranking-likeness.js';

const CLASS_ORDER = Object.freeze({ LKQ: 0, ABOVE_LKQ: 1, CLOSE_MATCH: 2, UNCONFIRMED: 3, NOT_LKQ: 4 });
const CONFIDENCE_ORDER = Object.freeze({ HIGH: 0, MEDIUM: 1, LOW: 2 });

function compareNumbersDescending(a, b) { return (b ?? -1) - (a ?? -1); }

function ordinal(key, value) {
  if (key === 'tier') {
    const index = TIERS.indexOf(normalizeTier(value));
    return index < 0 ? null : index + 1;
  }
  return comparableValue(key, value);
}

/** Relative size of hard-rule overshoot (bigger screen, more capacity, higher tier). Smaller means a tighter match to the original. */
export function upgradeMagnitude(evaluation) {
  return evaluation.decision.comparisons
    .filter((row) => row.bucket === 'HARD' && row.assessment === 'BETTER' && !row.promoted)
    .reduce((sum, row) => {
      const from = ordinal(row.key, row.original.value), to = ordinal(row.key, row.replacement.value);
      return typeof from === 'number' && typeof to === 'number' && from > 0 ? sum + (to - from) / from : sum;
    }, 0);
}

const EPSILON = 1e-9;
const numericKey = (name, measure) => ({ name, compare: (a, b) => { const d = measure(a) - measure(b); return Math.abs(d) > EPSILON ? d : 0; } });

/**
 * Ordered ranking keys. The first key that separates two candidates decides; `decidingRankKey` reports which one, so a
 * result can always say WHY a primary ranked first. Likeness keys only matter once every ordinary key ties (typically when
 * all researched specs are ASSUMED); the candidateId hash is the last, purely mechanical stability tie-break.
 */
const RANK_KEYS = Object.freeze([
  { name: 'hard-rule failures', compare: (a, b) => {
    const aFailures = a.decision.hardFailures.length, bFailures = b.decision.hardFailures.length;
    if ((aFailures > 0) !== (bFailures > 0)) return Number(aFailures > 0) - Number(bFailures > 0);
    return aFailures > 0 && bFailures > 0 ? aFailures - bFailures : 0;
  } },
  { name: 'classification', compare: (a, b) => CLASS_ORDER[a.classification] - CLASS_ORDER[b.classification] },
  { name: 'similarity score', compare: (a, b) => compareNumbersDescending(a.decision.score.weightedTotal, b.decision.score.weightedTotal) },
  { name: 'strong similarity', compare: (a, b) => compareNumbersDescending(a.strongSimilaritySummary.similarity, b.strongSimilaritySummary.similarity) },
  { name: 'confidence', compare: (a, b) => CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence] },
  { name: 'discovery confidence', compare: (a, b) => CONFIDENCE_ORDER[a.candidate.discoveryConfidence] - CONFIDENCE_ORDER[b.candidate.discoveryConfidence] },
  // Prefer the tighter match over an unnecessary upgrade. Without it such ties fell to a hash of candidateId.
  numericKey('smaller upgrade', upgradeMagnitude),
  ...LIKENESS_KEYS.map(([name, measure]) => numericKey(name, (evaluation) => measure(likeness(evaluation)))),
  { name: 'candidateId (stability tie-break)', compare: (a, b) => a.candidate.candidateId.localeCompare(b.candidate.candidateId) },
]);

export function rankEvaluations(evaluations) {
  return [...evaluations].sort((a, b) => {
    for (const key of RANK_KEYS) {
      const difference = key.compare(a, b);
      if (difference) return difference;
    }
    return 0;
  });
}

/** Name of the first ranking key that separates two evaluated candidates (or 'identical'). */
export function decidingRankKey(a, b) {
  return RANK_KEYS.find((key) => key.compare(a, b) !== 0)?.name ?? 'identical';
}

function value(identity, key) {
  const entry = getFact(identity, key);
  return present(entry) ? String(entry.value).toLowerCase() : null;
}

const DISTINCT_KEYS = Object.freeze({
  television: ['screenSizeIn', 'tier', 'displayTechnology', 'refreshHz', 'smart', 'hdr', 'series', 'featurePackage', 'gamingFeatures'],
  refrigerator: ['totalCapacityCuFt', 'tier', 'configurationFloor', 'layout', 'counterDepth', 'capacityBalance', 'dispenser', 'iceMaker', 'finish', 'series', 'featurePackage'],
});

function distinction(candidate, selected) {
  const identity = candidate.candidate.identity;
  const other = selected.candidate.identity;
  if (value(identity, 'brand') !== value(other, 'brand')) return 'CROSS_BRAND_ALTERNATIVE';
  if (candidate.classification === 'ABOVE_LKQ' && selected.classification !== 'ABOVE_LKQ') return 'ABOVE_LKQ_OPTION';
  if (candidate.classification === 'CLOSE_MATCH' && selected.classification === 'LKQ') {
    const different = DISTINCT_KEYS[identity.category].some((key) => value(identity, key) !== value(other, key));
    if (different) return 'CLOSE_MATCH';
  }
  if (candidate.confidence === 'HIGH' && selected.confidence !== 'HIGH') return 'HIGHER_CONFIDENCE_OPTION';
  const meaningful = DISTINCT_KEYS[identity.category].some((key) => {
    if (!present(getFact(candidate.normalizedOriginal, key))) return false;
    const left = value(identity, key), right = value(other, key);
    return left !== null && right !== null && left !== right;
  });
  return meaningful ? 'SAME_BRAND_ALTERNATIVE' : null;
}

export function selectRecommendations(ranked, maxAlternatives = 2) {
  if (!ranked.length) return { primaryRecommendation: null, alternatives: [], rejectedSummary: [] };
  const primaryRecommendation = ranked[0];
  const alternatives = [], rejectedSummary = [];
  const allHardFailed = ranked.every((item) => item.decision.hardFailures.length > 0);
  for (const item of ranked.slice(1)) {
    let reasonCode = null;
    if (allHardFailed || item.decision.hardFailures.length) reasonCode = 'KNOWN_HARD_FAILURE';
    else if (item.classification === 'NOT_LKQ') reasonCode = 'SEVERE_STRONG_LOSSES';
    else if (primaryRecommendation.classification === 'LKQ' && item.classification === 'UNCONFIRMED') reasonCode = 'LESS_DEFENSIBLE_THAN_PRIMARY';
    else if (item.decision.score.weightedTotal !== null && primaryRecommendation.decision.score.weightedTotal !== null &&
      item.decision.score.weightedTotal < primaryRecommendation.decision.score.weightedTotal - 7 &&
      item.decision.materialUpgrades.length === 0 &&
      item.decision.comparisons.some((row) => row.bucket === 'STRONG' && row.weightClass === 'HIGH' && row.assessment === 'DIFFERENT')) reasonCode = 'INFERIOR_SIMILARITY';
    else {
      const role = distinction(item, primaryRecommendation);
      const duplicatesSelected = alternatives.some((alternative) => !distinction(item, alternative.recommendation));
      if (!role || duplicatesSelected) reasonCode = 'NO_MEANINGFUL_DISTINCTION';
      else if (alternatives.length < maxAlternatives) alternatives.push({ role, recommendation: item });
      else reasonCode = 'USER_FACING_LIMIT';
    }
    if (reasonCode) rejectedSummary.push({ candidateId: item.candidate.candidateId, classification: item.classification, reasonCode });
  }
  return { primaryRecommendation, alternatives, rejectedSummary };
}
