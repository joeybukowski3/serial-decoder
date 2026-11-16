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
/**
 * Screen sizes printed inside a television's full model code, by maker. Each pattern needs the whole code (a prefix, the size, then a series that itself
 * holds a digit), so a bare series name never reads as a size: "QN90D" (a Samsung series) is not 90 inches and "X75WL" (a Sony series) is not 75.
 * Only these makers' code shapes are read; any other code states no size here.
 *   Samsung    UN55JU6700F, UN55DU7200FXZA, QN65S90C, QN65QN90D, QE55Q80C, QN55LST7TAFXZA   (UN/QN/QE/UE, size, then letters and digits)
 *   LG OLED    OLED55C3PUA, OLED65G4WUA, OLED65CXPUA                          (OLED, size, series letter, then a digit or the 2020 "X" and a letter)
 *   LG LCD     55UR8000PUA, 55UT7570PUB, 65NANO75UQA, 65QNED80URA             (size first, then U?, NANO, QNED, SM or SK and digits)
 *   Sony       KD-55X75WL, XR-65A80L, XBR-55X900E, K-55S25                    (KD/XR/XBR/K, optional hyphen, size, series with a digit)
 *   Insignia   NS-55F301NA                                                   (NS, optional hyphen, size, letters and three digits)
 */
const TV_CODE_SIZES = Object.freeze([
  /^(?:UN|QN|QE|UE)(\d{2,3})[A-Z]{1,3}\d{1,4}[A-Z0-9]*$/,
  /^OLED(\d{2,3})[A-Z](?:\d|X[A-Z])[A-Z0-9]*$/,
  /^(\d{2})(?:U[A-Z]\d{3,4}|NANO\d{2,4}|QNED\d{2,4}|SM\d{4}|SK\d{4})[A-Z0-9]*$/,
  /^(?:KD|XR|XBR|K)-?(\d{2,3})[A-Z]{1,2}\d{1,3}[A-Z0-9]*$/,
  /^NS-?(\d{2})[A-Z]{1,2}\d{3}[A-Z0-9]*$/,
]);
const TV_SIZE_RANGE = Object.freeze([19, 120]);
const CODE_TOKEN = /(?<![A-Z0-9-])[A-Z0-9][A-Z0-9-]{3,22}(?![A-Z0-9-])/g;

/** The screen sizes the television model codes in `text` print, read only from the full code shapes above. */
export function modelCodeSizes(text) {
  const sizes = [];
  for (const [token] of String(text || '').toUpperCase().matchAll(CODE_TOKEN)) {
    const value = TV_CODE_SIZES.map((pattern) => pattern.exec(token)).filter(Boolean).map((found) => Number(found[1]))[0];
    if (Number.isFinite(value) && value >= TV_SIZE_RANGE[0] && value <= TV_SIZE_RANGE[1]) sizes.push(value);
  }
  return sizes;
}
// A stated "28 cu ft" is rounded to the nearest cubic foot at most (the real figure may be 27.8): 2% covers the rounding, and no more.
const AT_LEAST_ALLOWANCE = 0.98;
const allMatches = (pattern, text) => [...String(text || '').matchAll(pattern)].map((match) => Number(match[1])).filter(Number.isFinite);

/** The widths (inches, 24 to 48) a refrigerator title states: "36 inch", "33\"". A larger figure is a height and is not read as a width. */
export const statedWidths = (text) => allMatches(INCHES, text).filter((value) => value >= 24 && value <= 48);

/**
 * The size the user asked about: a TV's screen size in inches, otherwise capacity in cubic feet, otherwise a width in inches.
 * A television's size may also come from the full model code the text names ("UN55JU6700F" is 55 inches; see `modelCodeSizes`), unless `fromCodes` is
 * false. A written size and a code size that disagree, or two codes of different sizes, establish no size: the size is ambiguous, not chosen.
 */
export function sizeSpec(category, text, { fromCodes = true } = {}) {
  const inches = allMatches(INCHES, text).filter((value) => value >= 12 && value <= 120)[0];
  if (category === 'tv') {
    const coded = fromCodes ? [...new Set(modelCodeSizes(text))] : [];
    if (inches) return coded.length && !coded.some((value) => Math.abs(value - inches) <= 1) ? null : { kind: 'inches', value: inches };
    return coded.length === 1 ? { kind: 'inches', value: coded[0] } : null;
  }
  const capacity = allMatches(CAPACITY, text)[0];
  if (capacity) return { kind: 'capacity', value: capacity };
  return inches ? { kind: 'inches', value: inches } : null;
}

/** True when the text states a television size (written or in a model code) but the sizes it states disagree, so no size is established from anything. */
export function sizeConflict(category, text) {
  if (category !== 'tv' || sizeSpec(category, text)) return false;
  return allMatches(INCHES, text).some((value) => value >= 12 && value <= 120) || modelCodeSizes(text).length > 0;
}

/**
 * The sizes a piece of text states, split by whether they agree with the size asked about. Used on a short window around a price, so a
 * price can be judged by a size that sits before it ("55-inch: $1,899") or after it ("$1,399 for a 42-inch model").
 * @returns {{stated: number[], agrees: boolean, disagrees: boolean}} `agrees` and `disagrees` can both be true: that text contradicts itself
 */
export function sizeFacts(spec, category, text) {
  if (!spec) return { stated: [], agrees: false, disagrees: false };
  const stated = spec.kind === 'capacity' ? allMatches(CAPACITY, text)
    : [...allMatches(INCHES, text), ...(category === 'tv' ? modelCodeSizes(text) : [])].filter((value) => value >= 12 && value <= 120);
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
