/**
 * Small text helpers shared by the history and listing stages: which model tokens identify the original, whether a piece of text is
 * about that product, and whether a size in the text agrees with the size the user asked about. Plain pattern matching on purpose: these
 * decide only what is shown as a provisional, labelled price, never what is treated as confirmed.
 */

export const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const UNIT_TOKEN = /^\d+(?:K|P|IN|INCH|HZ|CU|FT|LB|W|GB|TB|MB|MM|CM)$/;
// A processor class or memory type is a part of a machine, never the machine's own model ("Core i5", "DDR5" in a laptop's description).
const PART_TOKEN = /^(?:I[3579]|DDR\d|LPDDR\d)$/;
// A model-looking token: letters, digits, letters (C3, S90C, QN65S90C, OLED55C6PUA, WRS325SDHZ, RF28R7351SR). Never a bare number or "4K".
export const MODEL_ISH = /\b[A-Z]{1,4}\d{1,3}[A-Z0-9]*\b/g;

export const modelKey = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** The model-like tokens in the user's own text (never invented): "LG C3 55 inch OLED" -> ["C3"]. */
export function focusTokens(query) {
  const found = String(query || '').toUpperCase().match(/\b(?=[A-Z0-9-]*[A-Z])(?=[A-Z0-9-]*\d)[A-Z0-9-]{2,}\b/g) || [];
  return [...new Set(found.map(modelKey).filter((token) => token.length >= 2 && !UNIT_TOKEN.test(token) && !PART_TOKEN.test(token)))];
}

/**
 * Does `token` (already upper-case) name the same product as `focus`? Equal; a short regional or colour suffix (QN65S90C vs QN65S90CAFXZA);
 * or the focus series inside a full model code that carries the screen size (OLED55C3PUA, QN65S90C for "C3", "S90C").
 * @returns {{match: boolean, size: number|null}} `size` is the screen size embedded in the token, when it carries one
 */
export function matchesFocus(token, focus) {
  if (!token || !focus) return { match: false, size: null };
  if (token === focus) return { match: true, size: null };
  if (token.startsWith(focus) && token.length - focus.length <= 6) return { match: true, size: null };
  if (focus.length >= 6 && focus.startsWith(token) && token.length >= 6) return { match: true, size: null };
  const embedded = new RegExp(`^[A-Z]{0,4}(\\d{2,3})${escapeRegExp(focus)}[A-Z0-9]{0,8}$`).exec(token);
  return embedded ? { match: true, size: Number(embedded[1]) } : { match: false, size: null };
}

// "28 cu ft", "27.8 cu. ft.", "28 Cu.Ft", "28.6-Cu. Feet", "28 cubic feet".
const CAPACITY = /(\d{1,2}(?:\.\d{1,2})?)[\s-]?(?:cu\.?\s?(?:ft|feet)\.?|cubic f(?:ee|oo)t)/gi;
// A listing for the other voltage or market (220 V, 50 Hz, export) is not the product sold here.
export const IMPORTER = /\b(?:220|230|240)\s?-?\s?v(?:olt|ac)?\b|\b50\s?hz\b|\bexport\b|\binternational\b|\bglobal version\b/i;
// A product line named by its number ("500 Series"): meaningful, unlike a count ("4-Door") or a size.
const LINE_STATEMENT = /\b(\d{2,4})[- ]?series\b/gi;
const LINE_STATEMENT_TEXT = (text) => [...String(text || '').matchAll(LINE_STATEMENT)].map((match) => match[1]);
export const statedLines = LINE_STATEMENT_TEXT;

/** The number of doors a text states ("4-Door French Door" -> 4), or null. */
export const doorCountOf = (text) => { const found = /\b(\d)[- ]door\b/i.exec(String(text || '')); return found ? Number(found[1]) : null; };

/** The door configuration a refrigerator's text states (FRENCH_DOOR, SIDE_BY_SIDE, TOP_FREEZER, BOTTOM_FREEZER), or null. */
export function layoutOf(text) {
  const value = String(text || '');
  if (/french[- ]?door/i.test(value)) return 'FRENCH_DOOR';
  if (/side[- ]by[- ]side/i.test(value)) return 'SIDE_BY_SIDE';
  if (/top[- ]freezer/i.test(value)) return 'TOP_FREEZER';
  if (/bottom[- ]freezer/i.test(value)) return 'BOTTOM_FREEZER';
  return null;
}
const INCHES = /(\d{2,3}(?:\.\d)?)\s?(?:-\s?inch(?:es)?|\s?inch(?:es)?|\s?in\b\.?|["”])/gi;
const TV_EMBEDDED = /\b(?:OLED|QN|UN|KD|XR|NS|LS)-?(\d{2,3})[A-Z]/gi;
// A stated "28 cu ft" is rounded to the nearest cubic foot at most (the real figure may be 27.8): 2% covers the rounding, and no more.
const AT_LEAST_ALLOWANCE = 0.98;
const allMatches = (pattern, text) => [...String(text || '').matchAll(pattern)].map((match) => Number(match[1])).filter(Number.isFinite);

/** The widths (inches, 24 to 48) a refrigerator title states: "36 inch", "33\"". A larger figure is a height and is not read as a width. */
export const statedWidths = (text) => allMatches(INCHES, text).filter((value) => value >= 24 && value <= 48);

/** The size the user asked about: a TV's screen size in inches, otherwise capacity in cubic feet, otherwise a width in inches. */
export function sizeSpec(category, text) {
  const inches = allMatches(INCHES, text).filter((value) => value >= 12 && value <= 120)[0];
  if (category === 'tv') return inches ? { kind: 'inches', value: inches } : null;
  const capacity = allMatches(CAPACITY, text)[0];
  if (capacity) return { kind: 'capacity', value: capacity };
  return inches ? { kind: 'inches', value: inches } : null;
}

/**
 * The sizes a piece of text states, split by whether they agree with the size asked about. Used on a short window around a price, so a
 * price can be judged by a size that sits before it ("55-inch: $1,899") or after it ("$1,399 for a 42-inch model").
 * @returns {{stated: number[], agrees: boolean, disagrees: boolean}} `agrees` and `disagrees` can both be true: that text contradicts itself
 */
export function sizeFacts(spec, category, text) {
  if (!spec) return { stated: [], agrees: false, disagrees: false };
  const stated = spec.kind === 'capacity' ? allMatches(CAPACITY, text)
    : [...allMatches(INCHES, text), ...(category === 'tv' ? allMatches(TV_EMBEDDED, text) : [])].filter((value) => value >= 12 && value <= 120);
  const tolerance = spec.kind === 'capacity' ? spec.value * 0.15 : 1;
  // A capacity that must be met ("equal or greater", with a rounding allowance) fits from 98% upward; any other size must agree both ways.
  const fits = (value) => (spec.atLeast ? value >= spec.value * AT_LEAST_ALLOWANCE : Math.abs(value - spec.value) <= tolerance);
  return { stated, agrees: stated.some(fits), disagrees: stated.some((value) => !fits(value)) };
}

/** MATCH, MISMATCH or UNKNOWN (the text states no size of that kind). Capacity allows 15%; inches must agree to within an inch. */
export function sizeAgreement(spec, category, text) {
  const facts = sizeFacts(spec, category, text);
  if (!facts.stated.length) return 'UNKNOWN';
  return facts.agrees ? 'MATCH' : 'MISMATCH';
}
