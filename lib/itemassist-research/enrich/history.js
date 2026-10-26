import { MODEL_PATTERN, SOURCE_CLASS, safeSourceUrl } from '../evidence.js';
import { MODEL_ISH, focusTokens, matchesFocus, modelKey, sizeFacts, sizeSpec } from './product-tokens.js';

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
 * MSRP and typical past retail stay apart: a price is MSRP only when a manufacturer, review or reference page states it as a list or launch
 * price ("MSRP", "list price", "starting at"...). Every other dated price, including a bare price on a manufacturer page, is advertised past
 * retail. An undated result, a snippet about the whole lineup, or a price for another size is skipped, never guessed. Conflicting prices
 * are all kept (up to three). With nothing left the caller shows a labelled AI estimate, never a price presented as found. A dated price is
 * one observation on one date: nothing here averages prices or describes the result as a lifetime or typical price.
 */

export const MAX_HISTORY_PRICES = 3;
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
  // No model token beside the price: the title must name the original, and the text must name no other model.
  const hit = upperTokens(title).map(test).find(Boolean);
  const others = upperTokens(text).filter((token) => !test(token));
  return hit && !others.length ? { token: null, focus: hit.focus, size: null } : { reject: 'UNATTRIBUTED' };
}

/**
 * @param {{title: string, url: string, snippet: string, date: string|null}[]} rows  normalized organic results
 * @param {{query: string, category: string, now: number}} context
 * @returns {{items: {kind: 'MSRP'|'HISTORICAL_RETAIL', amount: number, publishedAt: string, url: string, model: string|null, subjectModel: string|null, expectedModel: string|null}[], skipped: Record<string, number>}}
 */
export function extractHistory(rows, { query, category, now }) {
  const skipped = {};
  const skip = (reason) => { skipped[reason] = (skipped[reason] || 0) + 1; };
  const focuses = focusTokens(query);
  const spec = sizeSpec(category, query);
  if (!focuses.length) { skip('NO_MODEL_TOKEN'); return { items: [], skipped }; }
  // A television price belongs to one screen size; without the size there is no price to attribute.
  if (category === 'tv' && !spec) { skip('SIZE_NEEDED'); return { items: [], skipped }; }
  const today = new Date(now).toISOString().slice(0, 10);
  const found = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    const source = safeSourceUrl(row?.url);
    if (!source || [SOURCE_CLASS.MARKETPLACE].includes(source.sourceClass)) { skip('SOURCE_NOT_ALLOWED'); continue; }
    if (!row.date) { skip('UNDATED'); continue; }
    if (row.date > today) { skip('DATE_IN_FUTURE'); continue; }
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
      if (NOT_A_PURCHASE_PRICE.test(text.slice(end, end + 16)) || (!msrpLead && !wasLead && DEAL_LEAD.test(lead))) { skip('DEAL_PRICE'); continue; }
      const who = attribute(text, row.title, match.index, phrase, { focuses, spec });
      if (who.reject) { skip(who.reject); continue; }
      // The sizes stated beside this price (back to the previous price's phrase, and forward to the end of its own) must agree with the size asked about.
      const near = `${text.slice(Math.max(sinceLastPrice, match.index - BEFORE_WINDOW), match.index)} ${phrase}`;
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
      found.push({
        kind: listPrice ? 'MSRP' : 'HISTORICAL_RETAIL', amount, publishedAt: row.date, url: source.url,
        model: who.token && MODEL_PATTERN.test(who.token) && who.token.length >= 6 ? who.token : null,
        subjectModel: full ? who.token : null, expectedModel: full ? who.focus : null,
      });
    }
  }

  const seen = new Set();
  const items = found
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'MSRP' ? -1 : 1) || a.publishedAt.localeCompare(b.publishedAt) || a.amount - b.amount)
    .filter((item) => { const key = `${new URL(item.url).hostname}|${item.amount}`; if (seen.has(key)) return false; seen.add(key); return true; })
    .slice(0, MAX_HISTORY_PRICES);
  return { items, skipped };
}
