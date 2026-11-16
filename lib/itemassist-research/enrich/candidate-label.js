/**
 * The size a television family recommendation is presented with.
 *
 * A family named without a model code ("Sony Bravia 8 OLED") is sold in several screen sizes. When the listings that priced it each state the requested
 * size, the family is shown at that size ("Sony Bravia 8 OLED 55-inch"). That is a size-qualified FAMILY, not a verified model: the model status is
 * decided elsewhere and is unchanged by this label (a sized name never reads as a model code; see `looksLikeExactModel`).
 *
 * This only changes the presented name, after the listings were screened and priced. Which listings are eligible and what they cost were decided from the
 * candidate as the model named it, and the original's size, before this runs. The size is copied from nothing else: without a priced listing that states
 * it for this candidate, the name is left as it was. Only televisions. Pure; no network.
 */

import { looksLikeExactModel } from '../evidence.js';
import { modelCodeSizes } from './product-tokens.js';

const MAX_NAME = 70;
// A size the name already states: "55-inch", "55 inch", "55in", '55"'.
const STATED_SIZE = /\b(\d{2,3})(?:[- ]?inch(?:es)?\b|in\b|")/i;
// A code that starts with a size in a shape not read by `modelCodeSizes` ("Hisense 55U8K", "TCL 65QM8"): the name may already carry a size.
const SIZE_LED_CODE = /\b\d{2,3}[A-Z]{1,5}\d/i;

/** Whether the candidate's own priced listings each state the requested size (`sizeStated`, set by the listing screen; see listings.js). */
const sizeSupported = (screened) => screened.sizeStated === true && Array.isArray(screened.items) && screened.items.length > 0;

/**
 * The name to present a television family candidate with, or the name unchanged.
 * The name is unchanged when the product is not a television, when no size was established for the original, when the candidate is presented
 * another way (a generation grammar, an exact model code, a demoted model code), when no priced listing states the size, when the name already states a
 * size or a model code with a size, or when the result would be too long or would look like a model code. Applying it twice gives the same name.
 * @param {string} name
 * @param {{category: string, size: number|null, screened: object|null}} context
 */
export function sizedFamilyName(name, { category, size, screened }) {
  const text = String(name || '').trim();
  if (category !== 'tv' || !Number.isFinite(size) || !text || !screened) return name;
  if (screened.lineage || screened.sku || screened.observedSku || screened.demotedName || screened.conflict) return name;
  if (!sizeSupported(screened)) return name;
  if (STATED_SIZE.test(text) || modelCodeSizes(text).length || SIZE_LED_CODE.test(text)) return name;
  // The size follows the product name; a remark after a comma stays after it ("Samsung S90D 55-inch, QD-OLED").
  const [head, ...rest] = text.split(',');
  const base = head.trim();
  const sized = rest.length ? `${base} ${size}-inch,${rest.join(',')}` : `${base} ${size}-inch`;
  if (sized.length > MAX_NAME) return name;
  // "100-inch" alone would read as a model code; a family must not become an apparent exact model because of its size.
  if (looksLikeExactModel(sized) && !looksLikeExactModel(base)) return name;
  return sized;
}
