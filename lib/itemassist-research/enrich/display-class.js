/**
 * Display technology of a television, read from text, and what it means for the essential "same display technology class" requirement.
 *
 * Two panel FAMILIES are told apart: self-emissive (OLED, QD-OLED: every pixel makes its own light) and LCD (a backlit liquid-crystal panel: plain LED,
 * quantum-dot QLED, NanoCell, QNED, Mini-LED). A different family is a material difference. Within the LCD family the types are NOT treated as equal:
 * a quantum-dot or Mini-LED panel is a step above a plain LED one, and only steps that are generally recognised are ordered (plain LED below QLED,
 * NanoCell and QNED; those below Mini-LED). NanoCell, QLED and QNED are not ranked against each other.
 *
 * What this module decides is only the comparison row's STATUS, and only where the text settles it. The row stays an estimate (basis AI_ESTIMATE): a family or
 * type read from a product name or a listing title is never a verified like-kind-and-quality match, and it never makes a row CONFIRMED.
 * Pure; no network.
 */

export const DISPLAY_FAMILY = Object.freeze({ SELF_EMISSIVE: 'SELF_EMISSIVE', LCD: 'LCD' });
export const DISPLAY_TYPE = Object.freeze({
  OLED: 'OLED', QD_OLED: 'QD_OLED', LED: 'LED', QLED: 'QLED', NANOCELL: 'NANOCELL', QNED: 'QNED', MINI_LED: 'MINI_LED',
});

const FAMILY_OF = Object.freeze({
  OLED: DISPLAY_FAMILY.SELF_EMISSIVE, QD_OLED: DISPLAY_FAMILY.SELF_EMISSIVE,
  LED: DISPLAY_FAMILY.LCD, QLED: DISPLAY_FAMILY.LCD, NANOCELL: DISPLAY_FAMILY.LCD, QNED: DISPLAY_FAMILY.LCD, MINI_LED: DISPLAY_FAMILY.LCD,
});

/** Ordered steps within the LCD family: [lower, higher]. Only these pairs (and what follows from them) are compared; anything else is not ranked. */
const LCD_STEPS = Object.freeze([
  ['LED', 'QLED'], ['LED', 'NANOCELL'], ['LED', 'QNED'], ['LED', 'MINI_LED'],
  ['QLED', 'MINI_LED'], ['NANOCELL', 'MINI_LED'], ['QNED', 'MINI_LED'],
]);

// Most specific first: a "Neo QLED" is a Mini-LED panel, "QNED Mini-LED" too; "QD-OLED" is not plain OLED; "QLED" and "OLED" contain "LED" but are not plain LED.
const READINGS = Object.freeze([
  [DISPLAY_TYPE.QD_OLED, /\bQD-?\s?OLED\b/i],
  [DISPLAY_TYPE.OLED, /(?<![A-Za-z-])OLED(?![A-Za-z])/i],
  [DISPLAY_TYPE.MINI_LED, /\bmini[- ]?led\b|\bneo[- ]?qled\b/i],
  // A series number may follow directly ("QNED80", "QLED Q60C" or "Q60 QLED", "NANO75"): only a letter after the word ends the match.
  [DISPLAY_TYPE.QNED, /(?<![A-Za-z])QNED(?![A-Za-z])/i],
  [DISPLAY_TYPE.NANOCELL, /\bnano ?cell\b|(?<![A-Za-z])NANO\d{2,3}(?![0-9])/i],
  [DISPLAY_TYPE.QLED, /(?<![A-Za-z])QLED(?![A-Za-z])|\bquantum[- ]dot\b/i],
  // Samsung's "Crystal UHD" line is its LED-backlit LCD range without quantum dots. "LED" and "LCD" on their own name the plain LCD type.
  [DISPLAY_TYPE.LED, /\bLED\b|\bLCD\b|\bcrystal uhd\b/i],
]);

/**
 * The single display type a text states, or null when it states none or states two that are not one panel (a comparison sentence such as "an OLED, unlike
 * the original's LED panel" names both, so it settles nothing).
 */
export function displayTypeOf(text) {
  let value = String(text || '');
  const found = [];
  for (const [type, pattern] of READINGS) {
    if (!pattern.test(value)) continue;
    found.push(type);
    // Remove what was read so a less specific reading cannot match inside it ("Neo QLED" is not also a QLED, "QD-OLED" not also an OLED).
    value = value.replace(new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`), ' ');
  }
  // "Mini-LED LCD" or "QLED LED TV" describe one LCD panel: the more specific type is the panel's.
  const specific = found.filter((type) => type !== DISPLAY_TYPE.LED);
  if (specific.length === 1 && FAMILY_OF[specific[0]] === DISPLAY_FAMILY.LCD) return specific[0];
  return found.length === 1 ? found[0] : null;
}

export const displayFamilyOf = (type) => (type ? FAMILY_OF[type] || null : null);

/** -1 when `a` is below `b`, 1 when above, 0 when the same type, null when they are not ranked against each other. */
export function compareLcdTypes(a, b) {
  if (a === b) return 0;
  const below = (low, high) => LCD_STEPS.some(([x, y]) => x === low && y === high);
  if (below(a, b)) return -1;
  if (below(b, a)) return 1;
  return null;
}

/**
 * The status the code settles for the essential display-class row, given the original's type and the candidate's, or null when the text does not settle it
 * (either type unknown, or two LCD types that are not ranked against each other). Statuses:
 *   different family (OLED vs any LCD)                         SHORTFALL
 *   same type                                                  MEETS
 *   candidate a recognised step above the original (LED->QLED) EXCEEDS
 *   candidate a recognised step below (Mini-LED->LED)          SHORTFALL
 */
export function settledDisplayStatus(originalType, candidateType) {
  if (!originalType || !candidateType) return null;
  if (displayFamilyOf(originalType) !== displayFamilyOf(candidateType)) return 'SHORTFALL';
  if (originalType === candidateType) return 'MEETS';
  // QD-OLED and OLED are both self-emissive; neither is ranked above the other here.
  if (displayFamilyOf(originalType) === DISPLAY_FAMILY.SELF_EMISSIVE) return null;
  const order = compareLcdTypes(candidateType, originalType);
  return order === 1 ? 'EXCEEDS' : order === -1 ? 'SHORTFALL' : null;
}

/** The display type several texts agree on (every text that states one states the same), or null. */
export function agreedDisplayType(texts) {
  const types = [...new Set((Array.isArray(texts) ? texts : []).map(displayTypeOf).filter(Boolean))];
  return types.length === 1 ? types[0] : null;
}

/**
 * A candidate's comparison rows with the model's display-class row corrected to what the text settles, still as an estimate. Only a row the model gave is
 * corrected: none is added, and a row the text does not settle is left exactly as the model gave it. Returns the same array when nothing changes.
 * @param {{requirementKey: string, status: string, basis: string}[]} comparison
 */
export function withSettledDisplayClass(comparison, originalType, candidateType) {
  if (!Array.isArray(comparison)) return comparison;
  const rows = comparison;
  const index = rows.findIndex((row) => row && row.requirementKey === 'displayClass');
  const status = index >= 0 ? settledDisplayStatus(originalType, candidateType) : null;
  if (!status || (rows[index].status === status && SETTLED_ROWS.has(rows[index]))) return rows;
  const settled = { ...rows[index], status, basis: 'AI_ESTIMATE' };
  SETTLED_ROWS.add(settled);
  return rows.map((entry, at) => (at === index ? settled : entry));
}

// Rows whose status was read from names or listing titles here, not only asserted by the model. Kept outside the row so the engine input and the response
// are unchanged (the public basis stays AI_ESTIMATE); a copy of a row is not in it, which only ever counts as an estimate (the cautious side).
const SETTLED_ROWS = new WeakSet();

/** Whether a comparison row's status was settled from names or listing titles by `withSettledDisplayClass` (not only asserted by the model). */
export function isSettledRow(row) {
  return Boolean(row && typeof row === 'object' && SETTLED_ROWS.has(row));
}
