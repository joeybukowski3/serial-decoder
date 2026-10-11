/**
 * Television size semantics: the HARD size rule compares the NOMINAL marketed class (a "55-inch class" TV),
 * never the measured/viewable diagonal (54.6" for that same TV).
 *
 * This is product-size-class semantics, not a percentage tolerance: a measured diagonal is attributed to a
 * marketed class only when it falls inside that class's own band, and a measurement that matches no single
 * class (a genuinely different size) stays unresolved instead of being rounded into one.
 */

export const TV_SIZE_CLASSES = Object.freeze([24, 28, 32, 40, 43, 48, 50, 55, 58, 60, 65, 70, 75, 77, 83, 85, 86, 98, 100]);
// Real panels measure slightly under their marketed class (and occasionally a hair over).
const MEASURED_BELOW_CLASS = 1.0;
const MEASURED_ABOVE_CLASS = 0.5;
const EPSILON = 1e-9;

/** The single marketed class whose band contains this measured diagonal, or null (no class / ambiguous). */
export function nominalClassOf(measuredDiagonal) {
  if (!Number.isFinite(measuredDiagonal)) return null;
  const matches = TV_SIZE_CLASSES.filter((size) => measuredDiagonal >= size - MEASURED_BELOW_CLASS - EPSILON && measuredDiagonal <= size + MEASURED_ABOVE_CLASS + EPSILON);
  return matches.length === 1 ? matches[0] : null;
}

/**
 * A whole number is taken as the marketed class as stated ("explicitly marketed 50" stays 50).
 * A fractional value is a measurement: it is kept as `measured`, and `nominal` is its class when one is unambiguous.
 */
export function splitScreenSize(value) {
  if (!Number.isFinite(value)) return { nominal: null, measured: null };
  return Number.isInteger(value) ? { nominal: value, measured: null } : { nominal: nominalClassOf(value), measured: value };
}
