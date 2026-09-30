import { getFact, present } from '../replacement-core/normalize-values.js';

const CLASS_ORDER = Object.freeze({ LKQ: 0, ABOVE_LKQ: 1, CLOSE_MATCH: 2, UNCONFIRMED: 3, NOT_LKQ: 4 });
const CONFIDENCE_ORDER = Object.freeze({ HIGH: 0, MEDIUM: 1, LOW: 2 });

function compareNumbersDescending(a, b) { return (b ?? -1) - (a ?? -1); }

export function rankEvaluations(evaluations) {
  return [...evaluations].sort((a, b) => {
    const aFailure = a.decision.hardFailures.length > 0;
    const bFailure = b.decision.hardFailures.length > 0;
    if (aFailure !== bFailure) return Number(aFailure) - Number(bFailure);
    if (aFailure && bFailure && a.decision.hardFailures.length !== b.decision.hardFailures.length) {
      return a.decision.hardFailures.length - b.decision.hardFailures.length;
    }
    const classDifference = CLASS_ORDER[a.classification] - CLASS_ORDER[b.classification];
    if (classDifference) return classDifference;
    const scoreDifference = compareNumbersDescending(a.decision.score.weightedTotal, b.decision.score.weightedTotal);
    if (scoreDifference) return scoreDifference;
    const strongDifference = compareNumbersDescending(a.strongSimilaritySummary.similarity, b.strongSimilaritySummary.similarity);
    if (strongDifference) return strongDifference;
    const confidenceDifference = CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence];
    if (confidenceDifference) return confidenceDifference;
    const discoveryDifference = CONFIDENCE_ORDER[a.candidate.discoveryConfidence] - CONFIDENCE_ORDER[b.candidate.discoveryConfidence];
    if (discoveryDifference) return discoveryDifference;
    return a.candidate.candidateId.localeCompare(b.candidate.candidateId);
  });
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
