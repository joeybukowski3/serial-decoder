// Pure RCV/ACV straight-line depreciation calculation. No DOM, no I/O.

const MAX_REASONABLE_MAX_DEPRECIATION = 100;
const MIN_MAX_DEPRECIATION = 0;

function roundCents(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundPct(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toFiniteNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : NaN;
}

/**
 * @param {object} inputs
 * @param {number|string} inputs.replacementCost
 * @param {number|string} inputs.ageYears
 * @param {number|string} inputs.usefulLifeYears
 * @param {number|string} inputs.maxDepreciationPct
 * @param {number|string} [inputs.manualAdjustmentPct] - optional +/- percentage-point adjustment
 * @returns {{valid:true, ...} | {valid:false, error:string}}
 */
export function calculateRcvAcv(inputs) {
  const replacementCost = toFiniteNumber(inputs.replacementCost);
  const ageYears = toFiniteNumber(inputs.ageYears);
  const usefulLifeYears = toFiniteNumber(inputs.usefulLifeYears);
  const maxDepreciationPct = toFiniteNumber(inputs.maxDepreciationPct);
  const manualAdjustmentPctRaw = toFiniteNumber(inputs.manualAdjustmentPct);
  const manualAdjustmentPct = manualAdjustmentPctRaw === null ? 0 : manualAdjustmentPctRaw;

  if (replacementCost === null || ageYears === null || usefulLifeYears === null || maxDepreciationPct === null) {
    return { valid: false, error: 'Enter a replacement cost, item age, useful life, and maximum depreciation to calculate.' };
  }
  if (
    Number.isNaN(replacementCost) ||
    Number.isNaN(ageYears) ||
    Number.isNaN(usefulLifeYears) ||
    Number.isNaN(maxDepreciationPct) ||
    Number.isNaN(manualAdjustmentPct)
  ) {
    return { valid: false, error: 'Enter valid numbers for every field.' };
  }
  if (replacementCost < 0 || ageYears < 0 || usefulLifeYears < 0 || maxDepreciationPct < 0) {
    return { valid: false, error: 'Values cannot be negative.' };
  }
  if (replacementCost === 0) {
    return { valid: false, error: 'Replacement cost must be greater than $0.' };
  }
  if (usefulLifeYears === 0) {
    return { valid: false, error: 'Expected useful life must be greater than 0 years.' };
  }
  if (maxDepreciationPct > MAX_REASONABLE_MAX_DEPRECIATION) {
    return { valid: false, error: 'Maximum depreciation cannot exceed 100%.' };
  }

  const cappedMaxDepreciationPct = Math.max(MIN_MAX_DEPRECIATION, Math.min(MAX_REASONABLE_MAX_DEPRECIATION, maxDepreciationPct));

  const straightLinePct = (ageYears / usefulLifeYears) * 100;
  const cappedByMax = straightLinePct > cappedMaxDepreciationPct;
  const baseDepreciationPct = Math.min(straightLinePct, cappedMaxDepreciationPct);

  const manualAdjustmentApplied = manualAdjustmentPct !== 0;
  const adjustedPctUnclamped = baseDepreciationPct + manualAdjustmentPct;
  const finalDepreciationPct = Math.max(0, Math.min(cappedMaxDepreciationPct, adjustedPctUnclamped));
  const manualAdjustmentClamped = manualAdjustmentApplied && finalDepreciationPct !== adjustedPctUnclamped;

  const depreciationAmount = roundCents(replacementCost * (finalDepreciationPct / 100));
  const acv = roundCents(replacementCost - depreciationAmount);

  let detailText = `Age ${formatYears(ageYears)} ÷ ${formatYears(usefulLifeYears)}-year useful life = ${roundPct(straightLinePct)}% straight-line depreciation`;
  detailText += cappedByMax
    ? `, limited by the selected ${roundPct(cappedMaxDepreciationPct)}% maximum.`
    : '.';
  if (manualAdjustmentApplied) {
    const sign = manualAdjustmentPct > 0 ? '+' : '';
    detailText += ` A manual adjustment of ${sign}${roundPct(manualAdjustmentPct)} percentage points was applied${manualAdjustmentClamped ? ', held within the 0%–' + roundPct(cappedMaxDepreciationPct) + '% range' : ''}, resulting in ${roundPct(finalDepreciationPct)}% total depreciation.`;
  }

  return {
    valid: true,
    replacementCost: roundCents(replacementCost),
    acv,
    depreciationPct: roundPct(finalDepreciationPct),
    depreciationAmount,
    difference: depreciationAmount,
    straightLinePct: roundPct(straightLinePct),
    maxDepreciationPct: roundPct(cappedMaxDepreciationPct),
    cappedByMax,
    manualAdjustmentPct: roundPct(manualAdjustmentPct),
    manualAdjustmentApplied,
    manualAdjustmentClamped,
    detailText,
  };
}

function formatYears(years) {
  return Number.isInteger(years) ? String(years) : String(Math.round(years * 100) / 100);
}
