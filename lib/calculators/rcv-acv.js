// Pure RCV/ACV depreciation calculation. No DOM, no I/O.
//
// Model: annual insurance depreciation rate × item age, capped by a user-selected
// Maximum Total Depreciation, with an optional transparent manual adjustment.
// Useful life is not used to calculate depreciation.

const MAX_TOTAL_DEPRECIATION_CEILING = 100;
const MIN_TOTAL_DEPRECIATION_FLOOR = 0;

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

function formatYears(years) {
  return Number.isInteger(years) ? String(years) : String(Math.round(years * 100) / 100);
}

function formatTrimmedPct(value) {
  const rounded = roundPct(value);
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

/**
 * @param {object} inputs
 * @param {number|string} inputs.replacementCost
 * @param {number|string} inputs.ageYears
 * @param {number|string} inputs.annualDepreciationRatePct - annual insurance depreciation rate, e.g. 10 for 10%/year
 * @param {number|string} inputs.maxTotalDepreciationPct - Maximum Total Depreciation cap
 * @param {number|string} [inputs.manualAdjustmentPct] - optional +/- percentage-point adjustment
 * @param {string} [inputs.rateLabel] - label describing the rate's origin for the explanation text, e.g. "Claims Pages reference rate"
 * @returns {{valid:true, ...} | {valid:false, error:string}}
 */
export function calculateRcvAcv(inputs) {
  const replacementCost = toFiniteNumber(inputs.replacementCost);
  const ageYears = toFiniteNumber(inputs.ageYears);
  const annualDepreciationRatePct = toFiniteNumber(inputs.annualDepreciationRatePct);
  const maxTotalDepreciationPct = toFiniteNumber(inputs.maxTotalDepreciationPct);
  const manualAdjustmentPctRaw = toFiniteNumber(inputs.manualAdjustmentPct);
  const manualAdjustmentPct = manualAdjustmentPctRaw === null ? 0 : manualAdjustmentPctRaw;
  const rateLabel = inputs.rateLabel || 'Annual rate';

  if (replacementCost === null || ageYears === null || annualDepreciationRatePct === null || maxTotalDepreciationPct === null) {
    return { valid: false, error: 'Enter a replacement cost, item age, annual depreciation rate, and maximum total depreciation to calculate.' };
  }
  if (
    Number.isNaN(replacementCost) ||
    Number.isNaN(ageYears) ||
    Number.isNaN(annualDepreciationRatePct) ||
    Number.isNaN(maxTotalDepreciationPct) ||
    Number.isNaN(manualAdjustmentPct)
  ) {
    return { valid: false, error: 'Enter valid numbers for every field.' };
  }
  if (replacementCost < 0 || ageYears < 0 || annualDepreciationRatePct < 0 || maxTotalDepreciationPct < 0) {
    return { valid: false, error: 'Values cannot be negative.' };
  }
  if (replacementCost === 0) {
    return { valid: false, error: 'Replacement cost must be greater than $0.' };
  }
  if (maxTotalDepreciationPct > MAX_TOTAL_DEPRECIATION_CEILING) {
    return { valid: false, error: 'Maximum total depreciation cannot exceed 100%.' };
  }

  const cappedMaxTotalDepreciationPct = Math.max(
    MIN_TOTAL_DEPRECIATION_FLOOR,
    Math.min(MAX_TOTAL_DEPRECIATION_CEILING, maxTotalDepreciationPct)
  );

  const rawDepreciationPct = annualDepreciationRatePct * ageYears;
  const manualAdjustmentApplied = manualAdjustmentPct !== 0;
  const adjustedDepreciationPctUnclamped = rawDepreciationPct + manualAdjustmentPct;
  const finalDepreciationPct = Math.max(
    0,
    Math.min(cappedMaxTotalDepreciationPct, adjustedDepreciationPctUnclamped)
  );
  const cappedByMax = adjustedDepreciationPctUnclamped > cappedMaxTotalDepreciationPct;
  const manualAdjustmentClamped = manualAdjustmentApplied && finalDepreciationPct !== adjustedDepreciationPctUnclamped;

  const depreciationAmount = roundCents(replacementCost * (finalDepreciationPct / 100));
  const acv = roundCents(replacementCost - depreciationAmount);

  let detailText = `${rateLabel}: ${annualDepreciationRatePct.toFixed(2)}%/year × ${formatYears(ageYears)} years = ${formatTrimmedPct(rawDepreciationPct)}% calculated depreciation`;
  detailText += cappedByMax
    ? `; limited to the selected ${formatTrimmedPct(cappedMaxTotalDepreciationPct)}% maximum total depreciation.`
    : '.';
  if (manualAdjustmentApplied) {
    const sign = manualAdjustmentPct > 0 ? '+' : '';
    detailText += ` A manual adjustment of ${sign}${formatTrimmedPct(manualAdjustmentPct)} percentage points was applied${manualAdjustmentClamped ? ', held within the 0%–' + formatTrimmedPct(cappedMaxTotalDepreciationPct) + '% range' : ''}, resulting in ${formatTrimmedPct(finalDepreciationPct)}% total depreciation.`;
  }

  return {
    valid: true,
    replacementCost: roundCents(replacementCost),
    acv,
    depreciationPct: roundPct(finalDepreciationPct),
    depreciationAmount,
    difference: depreciationAmount,
    rawDepreciationPct: roundPct(rawDepreciationPct),
    annualDepreciationRatePct: roundPct(annualDepreciationRatePct),
    ageYears,
    maxTotalDepreciationPct: roundPct(cappedMaxTotalDepreciationPct),
    cappedByMax,
    manualAdjustmentPct: roundPct(manualAdjustmentPct),
    manualAdjustmentApplied,
    manualAdjustmentClamped,
    detailText,
  };
}
