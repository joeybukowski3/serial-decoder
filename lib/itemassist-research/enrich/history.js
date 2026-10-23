import { MODEL_PATTERN, SOURCE_CLASS, safeSourceUrl } from '../evidence.js';
import { MODEL_ISH, focusTokens, matchesFocus, modelKey, sizeAgreement, sizeSpec } from './product-tokens.js';

/**
 * Historical price of the ORIGINAL from dated web results. A price is kept only when all of these hold:
 *   - the result is on a registered source (a manufacturer, retailer, review or reference site) and carries a publication date
 *     (Serper's date, which is when the page was published, not today)
 *   - the price sits next to the original's own model token, not a different series or size (an announcement table lists every model:
 *     a price beside "G3" or "QN77S90C" is not the "C3" or "QN65S90C" price)
 *   - it is a list or "was" price, not a deal ("$500 off", "now $999", "per month")
 * MSRP and typical past retail stay apart: a price is MSRP only when a manufacturer, review or reference page states it as a list or launch
 * price ("MSRP", "list price", "starting at"...). Every other dated price, including a bare price on a manufacturer page, is advertised past
 * retail. An undated result, a snippet about the whole lineup, or a price for another size is skipped, never guessed. Conflicting prices
 * are all kept (up to three). With nothing left the caller shows a labelled AI estimate, never a price presented as found.
 */

export const MAX_HISTORY_PRICES = 3;
const MIN_AMOUNT = 100;
const MAX_AMOUNT = 99_999;
const LOOKBACK = 140;
const PRICE = /\$\s?(\d{1,3}(?:,\d{3})+|\d{3,5})(?:\.\d{2})?/g;
const MSRP_LEAD = /\b(?:msrp|list price|launch price|suggested (?:retail )?price|starting (?:at|price)|starts at|priced at|retails? (?:at|for)|retail price)\b[^$]{0,15}$/i;
const WAS_LEAD = /\b(?:originally|original(?: price)?|was|regularly|reg\.?|usually|compare at)\b[^$]{0,12}$/i;
const DEAL_LEAD = /\b(?:deals?|sale|off|save|saving|slash(?:ed)?|discount|now|today|only|just|low as|drops?|dropped|clearance|rebate|trade-?in|monthly|per month|lowest)\b[^$]{0,20}$/i;
const NOT_A_PURCHASE_PRICE = /^\s*(?:\/\s?mo|\/\s?month|per month|a month|off\b)/i;

const upperTokens = (text) => [...String(text).toUpperCase().matchAll(MODEL_ISH)].map((match) => modelKey(match[0]));

function attribute(text, title, index, { focuses, spec, category }) {
  const before = text.slice(Math.max(0, index - LOOKBACK), index);
  const nearest = upperTokens(before).at(-1) || null;
  const test = (token) => focuses.map((focus) => ({ focus, ...matchesFocus(token, focus) })).find((result) => result.match) || null;
  if (nearest) {
    const hit = test(nearest);
    if (!hit) return { reject: 'OTHER_MODEL' };
    if (hit.size && spec && spec.kind === 'inches' && hit.size !== spec.value) return { reject: 'OTHER_SIZE' };
    return { token: nearest, focus: hit.focus };
  }
  // No model token ahead of the price: the title must name the original, and the text must name no other model.
  const hit = upperTokens(title).map(test).find(Boolean);
  const others = upperTokens(text).filter((token) => !test(token));
  return hit && !others.length ? { token: null, focus: hit.focus } : { reject: 'UNATTRIBUTED' };
}

function otherSizeBefore(text, index, spec, category) {
  if (!spec) return false;
  const before = text.slice(Math.max(0, index - 40), index);
  const sizes = [...before.matchAll(/(\d{2,3}(?:\.\d)?)\s?(?:-\s?inch|\s?inch|["”])/gi)];
  const last = sizes.at(-1);
  return Boolean(last) && sizeAgreement(spec, category, last[0]) === 'MISMATCH';
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
    for (const match of text.matchAll(PRICE)) {
      const amount = Number(match[1].replace(/,/g, ''));
      if (amount < MIN_AMOUNT || amount > MAX_AMOUNT) { skip('AMOUNT_OUT_OF_RANGE'); continue; }
      const lead = text.slice(Math.max(0, match.index - 32), match.index);
      const msrpLead = MSRP_LEAD.test(lead), wasLead = WAS_LEAD.test(lead);
      if (NOT_A_PURCHASE_PRICE.test(text.slice(match.index + match[0].length, match.index + match[0].length + 16)) || (!msrpLead && !wasLead && DEAL_LEAD.test(lead))) { skip('DEAL_PRICE'); continue; }
      const who = attribute(text, row.title, match.index, { focuses, spec, category });
      if (who.reject) { skip(who.reject); continue; }
      if (otherSizeBefore(text, match.index, spec, category)) { skip('OTHER_SIZE'); continue; }
      // Only an explicit list or launch price on a manufacturer, review or reference page is MSRP; a bare or "was" price is past retail.
      const listPrice = msrpLead && [SOURCE_CLASS.MANUFACTURER, SOURCE_CLASS.REVIEW, SOURCE_CLASS.TECH_DATABASE].includes(source.sourceClass);
      const full = who.token && who.focus.length >= 6 && MODEL_PATTERN.test(who.token);
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
