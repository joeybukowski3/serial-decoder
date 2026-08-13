// Pure sales-tax de-calculation (reverse a tax-inclusive total back to its pre-tax amount).
// No DOM, no I/O.

function roundCents(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toFiniteNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : NaN;
}

/**
 * @param {object} inputs
 * @param {number|string} inputs.totalIncludingTax
 * @param {number|string} inputs.taxRatePct
 * @returns {{valid:true, ...} | {valid:false, error:string}}
 */
export function calculateSalesTaxDecalc(inputs) {
  const totalIncludingTax = toFiniteNumber(inputs.totalIncludingTax);
  const taxRatePct = toFiniteNumber(inputs.taxRatePct);

  if (totalIncludingTax === null || taxRatePct === null) {
    return { valid: false, error: 'Enter the tax-inclusive total and the sales tax rate to calculate.' };
  }
  if (Number.isNaN(totalIncludingTax) || Number.isNaN(taxRatePct)) {
    return { valid: false, error: 'Enter valid numbers for both fields.' };
  }
  if (totalIncludingTax < 0 || taxRatePct < 0) {
    return { valid: false, error: 'Values cannot be negative.' };
  }
  if (totalIncludingTax === 0) {
    return { valid: false, error: 'Enter a total greater than $0.' };
  }
  if (taxRatePct >= 100) {
    return { valid: false, error: 'Sales tax rate must be less than 100%.' };
  }

  const rateDecimal = taxRatePct / 100;
  const preTaxAmount = roundCents(totalIncludingTax / (1 + rateDecimal));
  const embeddedTax = roundCents(totalIncludingTax - preTaxAmount);

  return {
    valid: true,
    totalIncludingTax: roundCents(totalIncludingTax),
    taxRatePct,
    preTaxAmount,
    embeddedTax,
  };
}
