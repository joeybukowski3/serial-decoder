import { looksLikeExactModel } from '../evidence.js';
import { escapeRegExp, modelKey } from './product-tokens.js';

/**
 * Whether the exact model code a replacement candidate is named by is supported by anything the search returned. The model that suggests
 * candidates can write a plausible code that no product has (a Whirlpool "WRF555SZDZ" next to the real WRF555SDFZ). A code nothing retrieved
 * shows is not presented as a product: the candidate is kept by family, and says so. Nothing is ever substituted for the dropped code.
 */

const CODE_STRIP = /^[^A-Za-z0-9]+|[^A-Za-z0-9-]+$/g;
// A code is a regional or colour variant of another when one only adds a short suffix, or the last letter (the finish) differs.
const MAX_SUFFIX = 3;
// A model-looking token in a listing title: five or more letters and digits, with both (LFXS26973D, LRFXS2503S, WRF555SDFZ).
const MODEL_TOKEN = /\b[A-Z0-9][A-Z0-9-]{4,}\b/g;

/** The exact-looking model codes in a candidate's name, as written. */
export function namedCodes(name) {
  return String(name || '').split(/\s+/).map((token) => token.replace(CODE_STRIP, '')).filter((token) => token && looksLikeExactModel(token));
}

/** True when `token` is `key` or a variant of it (both as `modelKey`s): a short suffix, the finish letter left off, or another finish. */
export function sameModel(key, token) {
  if (token === key) return true;
  if (token.startsWith(key) && token.length - key.length <= MAX_SUFFIX) return true;
  // Listings often leave the finish letter off ("LFXS26973" for "LFXS26973S").
  if (token.length >= 7 && key.startsWith(token) && key.length - token.length === 1) return true;
  // The same model in another finish ("LFXS26973S" / "LFXS26973D"): same length, only the last letter differs.
  return token.length === key.length && token.length >= 6 && token.slice(0, -1) === key.slice(0, -1) && /[A-Z]$/.test(token) && /[A-Z]$/.test(key);
}

/** True when any text states `code` or a variant of it. */
export function codeSupported(code, texts) {
  const key = modelKey(code);
  return (Array.isArray(texts) ? texts : []).some((text) => [...String(text || '').toUpperCase().matchAll(MODEL_TOKEN)].some((match) => /[A-Z]/.test(match[0]) && /\d/.test(match[0]) && sameModel(key, modelKey(match[0]))));
}

/**
 * The codes in the candidate's name that none of the retrieved texts support. Judged only when something was retrieved: no rows at all is not
 * evidence against a code, so the name is left as it is (it stays flagged as an unverified model).
 */
export function unsupportedCodes(name, texts) {
  const retrieved = (Array.isArray(texts) ? texts : []).filter(Boolean);
  if (!retrieved.length) return [];
  return namedCodes(name).filter((code) => !codeSupported(code, retrieved));
}

/** The name without the given codes ("Whirlpool WRF555SZDZ French Door Refrigerator" -> "Whirlpool French Door Refrigerator"). */
export function withoutCodes(name, codes, noun = '') {
  const stripped = codes.reduce((value, code) => value.replace(new RegExp(`(^|[\\s(])${escapeRegExp(code)}(?=$|[\\s),])`, 'gi'), '$1'), String(name || '')).replace(/\s+/g, ' ').trim();
  return stripped.split(' ').length < 2 && noun ? `${stripped} ${noun}`.trim() : stripped;
}
