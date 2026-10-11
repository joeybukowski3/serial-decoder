import { resolved } from './normalize-values.js';

/**
 * Verified material performance regression.
 *
 * A strong HIGH-importance capability that is VERIFIED on both the original and the candidate, and is materially lower on
 * the candidate (native 120 Hz original against a verified 60 Hz candidate; smart TV functionality lost), is a known
 * downgrade, not an unknown. It is reported separately from ordinary strong differences so ranking and the primary quality
 * floor can treat it differently from "could not be verified". An unknown candidate value is never a regression: it stays a
 * needs-verification item.
 *
 * Only categories listed here use the rule; other profiles are unchanged.
 */

export const MATERIAL_REGRESSION_RATIO = 0.75;
export const MATERIAL_REGRESSION_REASON = 'MATERIAL_PERFORMANCE_REGRESSION';

const RULES = Object.freeze({
  television: Object.freeze({ refreshHz: 'ratio', smart: 'lost' }),
});

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;

/** @returns {Array<{key: string, reasonCode: string}>} */
export function findMaterialRegressions(category, similarityComparisons) {
  const rules = RULES[category];
  if (!rules) return [];
  return similarityComparisons.flatMap((row) => {
    const kind = rules[row.key];
    if (!kind || row.bucket !== 'STRONG' || row.assessment !== 'DIFFERENT' || !resolved(row.original) || !resolved(row.replacement)) return [];
    const lowered = kind === 'ratio'
      ? isNumber(row.original.value) && isNumber(row.replacement.value) && row.replacement.value < row.original.value * MATERIAL_REGRESSION_RATIO
      : row.original.value === true && row.replacement.value === false;
    return lowered ? [{ key: row.key, reasonCode: MATERIAL_REGRESSION_REASON }] : [];
  });
}
