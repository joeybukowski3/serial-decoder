/**
 * Replacement candidates as independent products, and the order they are presented in.
 *
 * The identification reply sometimes names two products in one candidate ("LG UR8000 or UT75"). Each is a different product with its own listings,
 * size range and generation, so each becomes a candidate of its own (`splitAlternatives`), judged on its own; none is preferred for being named first.
 *
 * The order (`rankCandidates`) compares, in this sequence, and moves to the next criterion only on a tie:
 *   1. essential fit        fewer SETTLED essential shortfalls: a capacity its own listings show is short, a confirmed row, or a row code settled from
 *                           the product's name or its listing titles (display class; see display-class.js)
 *   2. product class/tier   same market tier as the original, then unknown, then higher, then lower
 *   3. generation currency  a newer generation the listings state (only where a generation grammar reads one); unknown ranks as neither
 *   4. model evidence       an exact model code priced from listings, then one only seen in listings, then a family
 *   5. price evidence       listings that priced it at the requested size, then size-unconfirmed examples, then none
 *   6. estimated fit        fewer essential shortfalls that only the model's reply asserts (AI_ESTIMATE, not settled by code)
 * An estimated shortfall therefore never outranks sourced evidence; it only orders candidates that tie on everything else. It still keeps the candidate
 * out of the value range (pricing.js, SUSPECTED_ESSENTIAL_SHORTFALL): ranking does not change that safeguard.
 * Ties keep the reply's order. Nothing here rewards a candidate for being older or easier to document: generation is compared only as "newer is better", and
 * evidence is counted only for the product as presented (never documentation volume). Pure; no network.
 */

import { IMPORTANCE, PROFILES } from '../requirements.js';
import { isSettledRow } from './display-class.js';

const MAX_PARTS = 3;
const TIER_ORDER = Object.freeze({ SAME: 0, UNKNOWN: 1, HIGHER: 2, LOWER: 3 });
// " or " and " / " between two products. Text in parentheses is a remark, not a product name, so it is never split.
const ALTERNATIVE = /\s+or\s+|\s+\/\s+/i;
const SEPARATOR = /(?<=\s)(?:or|\/)(?=\s)/gi;
const FIRST_WORD = /^\s*([A-Za-z][A-Za-z&.]*)(?=\s|$)/;
const HAS_DIGIT_OR_WORD = /[A-Za-z0-9]{2,}/;
// "or newer", "or similar", "or better OLED": a hedge on the first product, not a second product. Such a name is not split.
const HEDGE = /^(?:an?\s+)?(?:newer|similar|equivalent|better|higher|lower|later|comparable|successor|alternative|another|equal|same|anything|whichever|any|other|current|latest|next)\b/i;
// Makers a part may name itself with ("LG C4 or Sony Bravia 8"). Any other first word ("Neo QLED", "Crystal UHD", "UT75") is a product name of the first part's maker.
const MAKERS = new Set(['lg', 'samsung', 'sony', 'tcl', 'hisense', 'vizio', 'panasonic', 'philips', 'sharp', 'toshiba', 'insignia', 'roku', 'amazon', 'westinghouse',
  'ge', 'whirlpool', 'frigidaire', 'kitchenaid', 'bosch', 'maytag', 'electrolux', 'miele', 'beko', 'haier', 'cafe', 'monogram', 'thermador', 'amana', 'midea', 'fisher',
  'apple', 'dell', 'hp', 'lenovo', 'asus', 'acer', 'microsoft', 'google', 'nintendo']);

/** The known maker a name starts with ("LG UR8000" -> "lg"), or null when its first word is not a known maker. */
export function makerOf(name) {
  const word = (FIRST_WORD.exec(String(name || '')) || [, ''])[1].toLowerCase();
  return MAKERS.has(word) ? word : null;
}

/**
 * The products a candidate name names: one for an ordinary name, two or three for "Brand A or B". A part without a brand of its own takes the first
 * part's ("LG UR8000 or UT75" -> "LG UR8000", "LG UT75"). A name whose "or" sits inside parentheses, or whose parts are not product names, is not split.
 */
export function splitAlternatives(name) {
  const text = String(name || '').trim();
  // A remark in parentheses ("(2024)", "(43 or 50 inch)") is kept with its part but never splits it: the split points are found with the remarks blanked out.
  const outside = text.replace(/\([^)]*\)/g, (match) => ' '.repeat(match.length));
  if (!ALTERNATIVE.test(outside)) return [text];
  // Cut at the separator itself (not the blanked remark around it), then trim each part.
  const cuts = [...outside.matchAll(SEPARATOR)].map((match) => [match.index, match.index + match[0].length]);
  const bounds = [0, ...cuts.flat(), text.length];
  const parts = [];
  for (let index = 0; index < bounds.length; index += 2) parts.push(text.slice(bounds[index], bounds[index + 1]).replace(/\s+/g, ' ').trim());
  if (parts.length < 2 || parts.length > MAX_PARTS || !parts.every((part) => HAS_DIGIT_OR_WORD.test(part)) || parts.slice(1).some((part) => HEDGE.test(part))) return [text];
  const brand = makerOf(parts[0]) ? (FIRST_WORD.exec(parts[0]) || [, ''])[1] : null;
  // A part that names a maker keeps it; any other part is a product of the first part's maker ("UT75" -> "LG UT75"). With no known maker first, parts stand as written.
  const named = parts.map((part, index) => (index === 0 || !brand || makerOf(part) ? part : `${brand} ${part}`));
  return named.length === new Set(named.map((part) => part.toLowerCase())).size ? named : [text];
}

/**
 * One candidate per product its name names, each a copy of the original candidate with that product's name. The reply's comparison rows judged the
 * products together ("LG UR8000 or UT75: display class SHORTFALL" does not say which), so a split part keeps each requirement with status UNKNOWN: no
 * shortfall, and no match, is attributed to a product it may not describe. Code may settle a row again from the part's own name or listings (display-class.js).
 */
export function splitCandidate(candidate) {
  if (!candidate || typeof candidate.name !== 'string') return candidate ? [candidate] : [];
  const names = splitAlternatives(candidate.name);
  if (names.length === 1) return [candidate];
  const comparison = Array.isArray(candidate.comparison) ? candidate.comparison.map((row) => ({ ...row, status: 'UNKNOWN' })) : candidate.comparison;
  return names.map((name) => ({ ...candidate, name, comparison }));
}

const essentialKeys = (profile) => new Set((PROFILES[profile] || PROFILES.unknown).filter((rule) => rule.importance === IMPORTANCE.ESSENTIAL).map((rule) => rule.key));

/**
 * What one candidate is ranked by, from its comparison rows and (when it was looked up) its screened listings.
 * @param {object} candidate  `{comparison, tierVsOriginal}`
 * @param {object|null} screened  the listing screen's result for the candidate, or null when it was not looked up
 */
export function rankingFacts(candidate, screened, profile) {
  const essential = essentialKeys(profile);
  const rows = Array.isArray(candidate?.comparison) ? candidate.comparison : [];
  // The capacity row is replaced by what the candidate's own listings state when they were read (see `assessCapacity`).
  const short = rows.filter((row) => essential.has(row.requirementKey) && row.status === 'SHORTFALL' && !(row.requirementKey === 'capacity' && screened?.capacity));
  const isSettled = (row) => row.basis === 'CONFIRMED' || isSettledRow(row);
  const shortfalls = short.filter(isSettled).length + (screened?.capacity?.concern ? 1 : 0);
  const estimated = short.filter((row) => !isSettled(row)).length;
  const generation = screened?.generation && Number.isFinite(screened.generation.ordinal) ? screened.generation.ordinal : null;
  const model = screened?.sku ? 2 : screened?.observedSku ? 1 : 0;
  const price = screened?.items?.length ? 2 : screened?.context?.length ? 1 : 0;
  return { shortfalls, tier: TIER_ORDER[candidate?.tierVsOriginal] ?? TIER_ORDER.UNKNOWN, generation, model, price, estimated };
}

/** Negative when `a` ranks above `b`, positive when below, 0 on a tie (see the order above). */
export function compareFacts(a, b) {
  if (a.shortfalls !== b.shortfalls) return a.shortfalls - b.shortfalls;
  if (a.tier !== b.tier) return a.tier - b.tier;
  if (a.generation !== null && b.generation !== null && a.generation !== b.generation) return b.generation - a.generation;
  if (a.model !== b.model) return b.model - a.model;
  if (a.price !== b.price) return b.price - a.price;
  return (a.estimated || 0) - (b.estimated || 0);
}

/**
 * Entries in ranked order. Stable: entries that tie keep their given order.
 * @template T
 * @param {T[]} entries
 * @param {(entry: T) => object} factsOf  the entry's ranking facts (see `rankingFacts`)
 * @returns {T[]}
 */
export function rankCandidates(entries, factsOf) {
  return (Array.isArray(entries) ? entries : []).map((entry, index) => ({ entry, index, facts: factsOf(entry) }))
    .sort((a, b) => compareFacts(a.facts, b.facts) || a.index - b.index)
    .map(({ entry }) => entry);
}
