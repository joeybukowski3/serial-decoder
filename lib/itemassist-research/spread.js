/**
 * How far apart listing prices may be and still share one range. Pure; used by the listing screen (to choose which listings stand for a
 * candidate) and by the valuation (as a last check on whatever prices reach it), so the two always agree.
 *
 * Listings of one candidate are already held to its brand, line and size. When they still sit further apart than this, they are different
 * products under one name (an entry model beside a flagship, one processor class beside another), and one interval over them would say
 * nothing about any of them. The densest group that does fit is used; with no group of two, no listing is a fair stand-in for the rest.
 */

export const LISTING_SPREAD_RATIO = 1.75;

/**
 * The largest run of items, in price order, whose highest price is within `ratio` of its lowest. Ties go to the lower-priced run.
 * @template T
 * @param {T[]} sorted  items in ascending price order
 * @param {(item: T) => number} amountOf
 * @returns {T[]}
 */
export function densestWindow(sorted, amountOf, ratio = LISTING_SPREAD_RATIO) {
  let best = [];
  let start = 0;
  for (let end = 0; end < sorted.length; end += 1) {
    while (amountOf(sorted[end]) > amountOf(sorted[start]) * ratio) start += 1;
    if (end - start + 1 > best.length) best = sorted.slice(start, end + 1);
  }
  return best;
}

/** True when the highest of the prices is within `ratio` of the lowest (a single price always is). */
export const withinSpread = (amounts, ratio = LISTING_SPREAD_RATIO) => amounts.length < 2 || Math.max(...amounts) <= Math.min(...amounts) * ratio;

/**
 * The listings that may share a range: all of them when they agree, else the densest group of at least two, else none.
 * @template T
 * @param {T[]} items
 * @param {(item: T) => number} amountOf
 * @returns {{kept: T[], trimmed: boolean}}  `trimmed` is true when any item was left out
 */
export function narrowToAgreement(items, amountOf, ratio = LISTING_SPREAD_RATIO) {
  if (items.length < 2 || withinSpread(items.map(amountOf), ratio)) return { kept: items, trimmed: false };
  const window = densestWindow([...items].sort((a, b) => amountOf(a) - amountOf(b)), amountOf, ratio);
  return { kept: window.length >= 2 ? window : [], trimmed: true };
}
