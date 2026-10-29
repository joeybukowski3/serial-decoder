import { MODEL_PATTERN, SOURCE_CLASS, safeSourceUrl } from '../evidence.js';
import { IMPORTER, MODEL_ISH, focusTokens, matchesFocus, modelKey, sizeFacts, sizeSpec } from './product-tokens.js';

/**
 * Historical price of the ORIGINAL from dated web results. A price is kept only when all of these hold:
 *   - the result is on a registered source (a manufacturer, retailer, review or reference site) and carries a publication date
 *     (Serper's date, which is when the page was published, not today)
 *   - the price sits next to the original's own model token and size, not a different series or size (an announcement table lists every
 *     model: a price beside "G3" or "QN77S90C" is not the "C3" or "QN65S90C" price). The model and the size are read on both sides of the
 *     price: "OLED55C3PUA: $1,899" and "$1,899 for the OLED55C3PUA" are the same claim, and "$1,399 for a 42-inch model" is not a 55-inch price
 *   - a size or model that contradicts the original, before or after the price, refuses the price rather than weighing it
 *   - it is a list or "was" price, not a deal ("$500 off", "now $999", "per month")
 *   - it is not a lineup price ("starts at", "the cheapest model", "from $X") unless the same phrase names the original's own size or full model
 * Three kinds of original-model price stay apart:
 *   MSRP             a manufacturer, review or reference page states it as a list or launch price ("MSRP", "list price", "starting at"...)
 *   HISTORICAL_RETAIL any other price with a publication date, including a bare price on a manufacturer page (advertised past retail)
 *   ORIGINAL_LISTING  a price on a manufacturer or retailer page with NO date: a current, sale, clearance or discontinued listing of the exact
 *                     original model. It stays undated and is never a list price: one discount listing says nothing about the MSRP.
 * An undated price needs more than a dated one: the page must name the original's full model code (never a short series token, which a lineup
 * page also carries). A date written inside the text ("Release Date: 2019-07-29") is a product fact, not the date of any price, and is never used.
 * A snippet about the whole lineup, a price for another size or model, financing, a saving, and a listing for another voltage are skipped,
 * never guessed. Conflicting dated prices are all kept (up to three). With nothing left the caller shows a labelled AI estimate, never a price
 * presented as found. A dated price is one observation on one date: nothing here averages prices or describes the result as a typical price.
 */

export const MAX_HISTORY_PRICES = 3;
export const MAX_ORIGINAL_LISTINGS = 2;
const MIN_AMOUNT = 100;
const MAX_AMOUNT = 99_999;
const LOOKBACK = 140;
const BEFORE_WINDOW = 60;
const AFTER_WINDOW = 60;
const PRICE = /\$\s?((?:\d{1,3}(?:,\d{3})+|\d{3,5})(?:\.\d{2})?)/g;
const PRICE_AHEAD = /\$\s?\d/;
const MSRP_LEAD = /\b(?:msrp|list price|launch price|suggested (?:retail )?price|starting (?:at|price)|starts at|priced at|retails? (?:at|for)|retail price)\b[^$]{0,15}$/i;
const WAS_LEAD = /\b(?:originally|original(?: price)?|was|regularly|reg\.?|usually|compare at)\b[^$]{0,12}$/i;
const DEAL_LEAD = /\b(?:deals?|sale|off|save|saving|slash(?:ed)?|discount|now|today|only|just|low as|drops?|dropped|clearance|rebate|trade-?in|monthly|per month|lowest)\b[^$]{0,20}$/i;
const NOT_A_PURCHASE_PRICE = /^\s*(?:\/\s?mo|\/\s?month|per month|a month|off\b)/i;
// What is not a price for the product, whatever the page: a saving, financing, a rebate. (A sale or "now" price IS the listing price.)
const NOT_A_LISTING_PRICE = /\b(?:save|saving|savings|off|discount|rebate|trade-?in|monthly|per month|financ\w*|low as|lowest)\b[^$]{0,20}$/i;
// A price for the cheapest or entry model of a line says nothing about the model asked about.
const LINEUP_LEAD = /\b(?:(?:starts?|starting|begins?) (?:at|from)|prices? (?:start|begin|range)[^$]{0,10}|starting price|cheapest|least expensive|lowest[- ]priced|entry[- ]level)\b[^$]{0,30}$|\b(?:from|as low as)\s*$/i;
// Where the phrase that belongs to a price ends: a sentence, a clause break, or a conjunction.
const AFTER_STOP = /\.\s|[;…]|\s(?:and|but|while|whereas|or)\s|\s[-–—]\s/i;
// A size or model token that ends a window right before the NEXT price is that price's label ("... 48" $1,399"), not this price's context.
const DANGLING_LABEL = /(?:\b[A-Z]{1,4}\d{1,3}[A-Z0-9]*|\b\d{2,3}(?:\.\d)?\s?(?:-\s?inch|\s?inch|["”]))\s*[:=\-–]?\s*$/i;
// Spec names that look like model tokens ("HDMI2.1", "USB3", "HDR10") are not products.
const SPEC_NAME = /^(?:HDMI|USB|WIFI|HDR|DDR|PCIE|DTS|BT|DV)\d/;

const upperTokens = (text) => [...String(text).toUpperCase().matchAll(MODEL_ISH)].map((match) => modelKey(match[0])).filter((token) => !SPEC_NAME.test(token));

/**
 * The words that belong to the price, after it: up to the end of the sentence or clause, or the next price. Whatever sits between the last
 * separator and the next price is that price's label ("..., 65-inch at $2,499"), so it is cut off; so is a bare size or model right before it.
 * The phrase is always a prefix of the text after the price.
 */
function afterPhrase(text, end) {
  let phrase = text.slice(end, end + AFTER_WINDOW);
  const next = phrase.search(PRICE_AHEAD);
  const stop = phrase.search(AFTER_STOP);
  if (stop >= 0 && (next < 0 || stop < next)) return phrase.slice(0, stop);
  if (next < 0) return phrase;
  phrase = phrase.slice(0, next);
  const separator = Math.max(...[...',;/|•・'].map((mark) => phrase.lastIndexOf(mark)));
  return separator >= 0 ? phrase.slice(0, separator) : phrase.replace(DANGLING_LABEL, '');
}

/**
 * The words just before a price, back to the previous price's phrase or BEFORE_WINDOW characters. The window never starts inside a word or a number:
 * a cut "26.8 Cu. Ft." would read as "6.8 Cu. Ft." and contradict the size it states.
 */
function beforePrice(text, index, since) {
  let start = Math.max(since, index - BEFORE_WINDOW);
  if (start > since && /\S/.test(text[start - 1] || '') && /\S/.test(text[start] || '')) {
    const space = text.slice(start, index).search(/\s/);
    start = space < 0 ? index : start + space;
  }
  return text.slice(start, index);
}

function attribute(text, title, index, phrase, { focuses, spec }) {
  const before = text.slice(Math.max(0, index - LOOKBACK), index);
  const nearest = upperTokens(before).at(-1) || null;
  const test = (token) => focuses.map((focus) => ({ focus, ...matchesFocus(token, focus) })).find((result) => result.match) || null;
  const wrongSize = (hit) => Boolean(hit.size && spec && spec.kind === 'inches' && hit.size !== spec.value);
  const afterTokens = upperTokens(phrase);
  // A model named right after the price that is not the original contradicts the attribution, whatever stands before it.
  if (afterTokens.some((token) => !test(token))) return { reject: 'OTHER_MODEL' };
  if (nearest) {
    const hit = test(nearest);
    if (!hit) return { reject: 'OTHER_MODEL' };
    if (wrongSize(hit)) return { reject: 'OTHER_SIZE' };
    return { token: nearest, focus: hit.focus, size: hit.size };
  }
  // Nothing ahead of the price: the original named just after it ("$1,899 for the OLED55C3PUA") is as good as one named before it.
  const afterToken = afterTokens.find((token) => test(token));
  if (afterToken) {
    const hit = test(afterToken);
    return wrongSize(hit) ? { reject: 'OTHER_SIZE' } : { token: afterToken, focus: hit.focus, size: hit.size };
  }
  // No model token beside the price: the title must name the original, and the text must name no other model. A page whose text names the
  // original's FULL model code (and no other model) is as good as a title that does ("Bosch Model #: SHPM65Z55N" after the price).
  const titleHit = upperTokens(title).map(test).find(Boolean);
  const own = upperTokens(text).find((token) => test(token));
  const hit = titleHit || (own && test(own).focus.length >= 6 ? test(own) : null);
  const others = upperTokens(text).filter((token) => !test(token));
  if (!hit || others.length) return { reject: 'UNATTRIBUTED' };
  return { token: hit.focus.length >= 6 && own ? own : null, focus: hit.focus, size: null };
}

/**
 * @param {{title: string, url: string, snippet: string, date: string|null}[]} rows  normalized organic results
 * @param {{query: string, category: string, now: number, spec?: {kind: string, value: number, atLeast?: boolean}|null}} context
 *   `spec` is the size the original is known to have when the user's words do not say (its capacity or width from the identification).
 * @returns {{items: {kind: 'MSRP'|'HISTORICAL_RETAIL'|'ORIGINAL_LISTING', amount: number, publishedAt: string|null, url: string, model: string|null, subjectModel: string|null, expectedModel: string|null}[], skipped: Record<string, number>}}
 *   `publishedAt` is null for an undated price (an ORIGINAL_LISTING, or an undated MSRP): it stays undated.
 */
export function extractHistory(rows, { query, category, now, spec: knownSpec = null }) {
  const skipped = {};
  const skip = (reason) => { skipped[reason] = (skipped[reason] || 0) + 1; };
  const focuses = focusTokens(query);
  const spec = sizeSpec(category, query) || knownSpec;
  if (!focuses.length) { skip('NO_MODEL_TOKEN'); return { items: [], skipped }; }
  // A television price belongs to one screen size; without the size there is no price to attribute.
  if (category === 'tv' && !spec) { skip('SIZE_NEEDED'); return { items: [], skipped }; }
  const today = new Date(now).toISOString().slice(0, 10);
  const found = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    const source = safeSourceUrl(row?.url);
    if (!source || [SOURCE_CLASS.MARKETPLACE].includes(source.sourceClass)) { skip('SOURCE_NOT_ALLOWED'); continue; }
    const undated = !row.date;
    if (!undated && row.date > today) { skip('DATE_IN_FUTURE'); continue; }
    if (IMPORTER.test(`${row.title} ${row.url} ${row.snippet}`)) { skip('IMPORT_VOLTAGE'); continue; }
    const text = `${row.title}. ${row.snippet}`;
    let claimedUpTo = 0;
    for (const match of text.matchAll(PRICE)) {
      const end = match.index + match[0].length;
      const phrase = afterPhrase(text, end);
      // The words after the previous price belong to it, not to this one.
      const sinceLastPrice = claimedUpTo;
      claimedUpTo = end + phrase.length;
      const amount = Number(match[1].replace(/,/g, ''));
      if (amount < MIN_AMOUNT || amount > MAX_AMOUNT) { skip('AMOUNT_OUT_OF_RANGE'); continue; }
      const lead = text.slice(Math.max(0, match.index - 32), match.index);
      const msrpLead = MSRP_LEAD.test(lead), wasLead = WAS_LEAD.test(lead);
      // A dated price must not be a deal. An undated listing may be a sale or clearance price (that IS its price), but never a saving or financing.
      const notAPrice = NOT_A_PURCHASE_PRICE.test(text.slice(end, end + 16)) || (undated ? NOT_A_LISTING_PRICE.test(lead) : !msrpLead && !wasLead && DEAL_LEAD.test(lead));
      if (notAPrice) { skip('DEAL_PRICE'); continue; }
      const who = attribute(text, row.title, match.index, phrase, { focuses, spec });
      if (who.reject) { skip(who.reject); continue; }
      // The sizes stated beside this price (back to the previous price's phrase, and forward to the end of its own) must agree with the size asked about.
      const near = `${beforePrice(text, match.index, sinceLastPrice)} ${phrase}`;
      const facts = sizeFacts(spec, category, near);
      if (facts.agrees && facts.disagrees) { skip('CONTRADICTORY_SIZE'); continue; }
      if (facts.disagrees) { skip('OTHER_SIZE'); continue; }
      const full = who.token && who.focus.length >= 6 && MODEL_PATTERN.test(who.token);
      // "Starts at", "the cheapest model" and "from $X" describe a line; they count only where the phrase names this size or this exact model.
      if (LINEUP_LEAD.test(text.slice(Math.max(0, match.index - 48), match.index))) {
        const named = facts.agrees || Boolean(who.size && spec && spec.kind === 'inches' && who.size === spec.value) || Boolean(full);
        if (!named) { skip('LINEUP_PRICE'); continue; }
      }
      // Only an explicit list or launch price on a manufacturer, review or reference page is MSRP; a bare or "was" price is past retail.
      const listPrice = msrpLead && [SOURCE_CLASS.MANUFACTURER, SOURCE_CLASS.REVIEW, SOURCE_CLASS.TECH_DATABASE].includes(source.sourceClass);
      let kind = listPrice ? 'MSRP' : 'HISTORICAL_RETAIL';
      if (undated) {
        // No date to rest on: the page must name the exact model, and a bare price is only a listing, from a maker or a retailer.
        if (!full) { skip('UNDATED'); continue; }
        if (!listPrice) {
          if (![SOURCE_CLASS.MANUFACTURER, SOURCE_CLASS.RETAILER].includes(source.sourceClass)) { skip('UNDATED'); continue; }
          kind = 'ORIGINAL_LISTING';
        }
      }
      found.push({
        kind, amount, publishedAt: row.date || null, url: source.url,
        model: who.token && MODEL_PATTERN.test(who.token) && who.token.length >= 6 ? who.token : null,
        subjectModel: full ? who.token : null, expectedModel: full ? who.focus : null,
      });
    }
  }

  const seen = new Set();
  const order = { MSRP: 0, HISTORICAL_RETAIL: 1, ORIGINAL_LISTING: 2 };
  const unique = found
    .sort((a, b) => order[a.kind] - order[b.kind] || String(a.publishedAt || '9999').localeCompare(String(b.publishedAt || '9999')) || a.amount - b.amount)
    .filter((item) => { const key = `${new URL(item.url).hostname}|${item.amount}`; if (seen.has(key)) return false; seen.add(key); return true; });
  const priced = unique.filter((item) => item.kind !== 'ORIGINAL_LISTING').slice(0, MAX_HISTORY_PRICES);
  // The original model's undated listings: the lowest and the highest seen, so the spread is visible without a list of every shop.
  const listings = unique.filter((item) => item.kind === 'ORIGINAL_LISTING').sort((a, b) => a.amount - b.amount);
  return { items: [...priced, ...(listings.length > MAX_ORIGINAL_LISTINGS ? [listings[0], listings.at(-1)] : listings)], skipped };
}
