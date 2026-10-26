/**
 * Small text helpers shared by the history and listing stages: which model tokens identify the original, whether a piece of text is
 * about that product, and whether a size in the text agrees with the size the user asked about. Plain pattern matching on purpose: these
 * decide only what is shown as a provisional, labelled price, never what is treated as confirmed.
 */

export const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const UNIT_TOKEN = /^\d+(?:K|P|IN|INCH|HZ|CU|FT|LB|W)$/;
// A model-looking token: letters, digits, letters (C3, S90C, QN65S90C, OLED55C6PUA, WRS325SDHZ, RF28R7351SR). Never a bare number or "4K".
export const MODEL_ISH = /\b[A-Z]{1,4}\d{1,3}[A-Z0-9]*\b/g;

export const modelKey = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** The model-like tokens in the user's own text (never invented): "LG C3 55 inch OLED" -> ["C3"]. */
export function focusTokens(query) {
  const found = String(query || '').toUpperCase().match(/\b(?=[A-Z0-9-]*[A-Z])(?=[A-Z0-9-]*\d)[A-Z0-9-]{2,}\b/g) || [];
  return [...new Set(found.map(modelKey).filter((token) => token.length >= 2 && !UNIT_TOKEN.test(token)))];
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

const CAPACITY = /(\d{1,2}(?:\.\d{1,2})?)\s?(?:cu\.?\s?ft\.?|cubic f(?:ee|oo)t)/gi;
const INCHES = /(\d{2,3}(?:\.\d)?)\s?(?:-\s?inch(?:es)?|\s?inch(?:es)?|\s?in\b\.?|["”])/gi;
const TV_EMBEDDED = /\b(?:OLED|QN|UN|KD|XR|NS|LS)-?(\d{2,3})[A-Z]/gi;
const allMatches = (pattern, text) => [...String(text || '').matchAll(pattern)].map((match) => Number(match[1])).filter(Number.isFinite);

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
  const fits = (value) => Math.abs(value - spec.value) <= tolerance;
  return { stated, agrees: stated.some(fits), disagrees: stated.some((value) => !fits(value)) };
}

/** MATCH, MISMATCH or UNKNOWN (the text states no size of that kind). Capacity allows 15%; inches must agree to within an inch. */
export function sizeAgreement(spec, category, text) {
  const facts = sizeFacts(spec, category, text);
  if (!facts.stated.length) return 'UNKNOWN';
  return facts.agrees ? 'MATCH' : 'MISMATCH';
}
