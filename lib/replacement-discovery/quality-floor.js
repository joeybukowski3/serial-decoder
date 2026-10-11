/**
 * Primary quality floor: what a candidate must show before it is presented as a normal "Recommended Replacement".
 *
 * It is built only from evidence the core evaluation already produces (hard rules, classification, strong coverage, verified
 * regressions); there is no new score and no percentage. A candidate below the floor can still be returned, but only as the
 * closest available option, never as an equal of a confirmed like-kind-and-quality match. Retail eligibility is a separate,
 * earlier gate and is not repeated here.
 *
 * An UNKNOWN capability (for example a refresh rate the page does not publish) is not a floor failure: it stays a
 * needs-verification item and already caps confidence below HIGH. Only a VERIFIED downgrade, an unverified HARD requirement
 * (including an assumed tier), or too little strong evidence keeps a candidate below the floor.
 *
 * Applies to television. Refrigerator results are unchanged until that profile has an evidence model suited to a floor.
 */

/** Matches the core classifier's own "strong evidence is sparse" boundary, so the floor and the classification agree. */
export const MIN_STRONG_COVERAGE = 0.5;
export const FLOOR_CATEGORIES = Object.freeze(['television']);
const NORMAL_CLASSIFICATIONS = Object.freeze(['LKQ', 'ABOVE_LKQ', 'CLOSE_MATCH']);

/**
 * @param {object} evaluation a core recommendation result
 * @returns {{applies: boolean, met: boolean, reasons: string[]}} `reasons` lists every floor condition that failed
 */
export function evaluateRecommendationFloor(evaluation) {
  if (!FLOOR_CATEGORIES.includes(evaluation?.normalizedOriginal?.category)) return { applies: false, met: true, reasons: [] };
  const { decision } = evaluation;
  const reasons = [];
  if (decision.hardFailures.length) reasons.push('HARD_FAILURE');
  else if (decision.eligible !== true) reasons.push('HARD_REQUIREMENT_UNVERIFIED');
  if (decision.materialRegressions?.length) reasons.push('MATERIAL_PERFORMANCE_REGRESSION');
  if (!NORMAL_CLASSIFICATIONS.includes(evaluation.classification)) reasons.push('CLASSIFICATION_BELOW_FLOOR');
  if (evaluation.strongSimilaritySummary.coverage < MIN_STRONG_COVERAGE) reasons.push('STRONG_EVIDENCE_BELOW_FLOOR');
  return { applies: true, met: reasons.length === 0, reasons };
}
