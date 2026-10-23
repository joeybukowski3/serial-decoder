import { MODEL_PATTERN, classifyHost, looksLikeExactModel } from '../evidence.js';
import { MODEL_ISH, escapeRegExp, matchesFocus, modelKey, sizeAgreement } from './product-tokens.js';

/**
 * Basic screening of Google Shopping rows for ONE replacement candidate, down to at most three provisional prices.
 *
 * Screening is deliberately plain: a listing must be a new, single-unit purchase from a recognised seller, name the candidate's brand and
 * series, and not contradict the size or display technology the user needs. What is left is thinned by seller (the lowest price per
 * seller) and by a wide median band that removes rentals and absurd outliers, then reduced to the lowest, the median and the highest
 * price. A Shopping row never becomes more than a labelled listing: it has no product page, so nothing here can confirm it.
 */

export const MAX_LISTINGS_PER_CANDIDATE = 3;
const BAND_LOW = 0.35;
const BAND_HIGH = 2.5;

// Seller display name (anchored) -> registered host. A seller that is not here is not a recognised source, so its price is not used.
const SELLERS = Object.freeze([
  [/^best ?buy$/i, 'bestbuy.com'], [/^(?:the )?home ?depot$/i, 'homedepot.com'], [/^lowe'?s(?: home improvement)?$/i, 'lowes.com'], [/^walmart$/i, 'walmart.com'],
  [/^target$/i, 'target.com'], [/^costco(?: wholesale)?$/i, 'costco.com'], [/^sam'?s club$/i, 'samsclub.com'], [/^abt(?: electronics)?$/i, 'abt.com'],
  [/^aj ?madison$/i, 'ajmadison.com'], [/^appliances ?connection$/i, 'appliancesconnection.com'], [/^crutchfield$/i, 'crutchfield.com'],
  [/^b ?& ?h(?: photo(?: video)?)?$/i, 'bhphotovideo.com'], [/^p\.? ?c\.? richard(?: (?:&|and) son)?$/i, 'pcrichard.com'], [/^newegg(?:\.com)?$/i, 'newegg.com'],
  [/^brandsmart usa$/i, 'brandsmartusa.com'], [/^bj'?s wholesale club$/i, 'bjs.com'], [/^micro ?center$/i, 'microcenter.com'], [/^electronic ?express$/i, 'electronicexpress.com'], [/^yale appliance(?: (?:\+|&|and) lighting)?$/i, 'yaleappliance.com'],
  [/^lg(?: electronics)?(?: usa)?$/i, 'lg.com'], [/^samsung(?: electronics)?(?: us)?$/i, 'samsung.com'], [/^sony(?: electronics)?$/i, 'sony.com'],
  [/^ge appliances$/i, 'geappliances.com'], [/^whirlpool$/i, 'whirlpool.com'], [/^frigidaire$/i, 'frigidaire.com'], [/^kitchenaid$/i, 'kitchenaid.com'],
  [/^hisense(?: usa)?$/i, 'hisense-usa.com'], [/^tcl$/i, 'tcl.com'], [/^vizio$/i, 'vizio.com'],
]);

const NOT_NEW = /\b(?:used|pre-?owned|refurb(?:ished)?|renewed|open[- ]?box|scratch(?: and|&) dent|as[- ]is|for parts|damaged|demo(?:nstration)?|floor model|reconditioned|b[- ]grade)\b/i;
const IMPORTER = /\b(?:220|230|240)\s?-?\s?v(?:olt|ac)?\b|\b50\s?hz\b|\bexport\b|\binternational\b|\bglobal version\b/i;
const RENTAL = /\b(?:rent(?:al|s)?|lease|rent-?to-?own|lease-?to-?own|per month|\/\s?mo|monthly|weekly|payments?)\b/i;
const BUNDLE = /\bbundle[ds]?\b|\bcombo\b|\bkit\b|\bpack of\b|\b\d\s?-?\s?pack\b|\bsoundbar\b|(?:\b(?:with|w\/)|\+)\s+(?:a\s+|an\s+|free\s+)?(?:[\w-]+\s+){0,2}(?:wall ?mount|mount|stand|speaker|warranty|protection plan|subscription|installation|delivery|haul)/i;
const PART = /\b(?:(?:replacement|universal|spare) remote(?: control)?|replacement (?:part|filter)|water filter|gasket|bracket|screen protector|cover|shelf|handle|control board|power cord|cable|manual)\b/i;
// Words that describe the product's line rather than identify its series.
const NAME_FILLER = new Set(['series', 'current', 'generation', 'newest', 'latest', 'new', 'line', 'family', 'class', 'model', 'models', 'smart', 'tv', 'the', 'and', 'or', 'of', 'with', 'by']);

const median = (sorted) => (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2);

/** The registered host for a Shopping seller name, or null when the seller is not a recognised source. */
export function sellerHost(name) {
  const entry = SELLERS.find(([pattern]) => pattern.test(String(name || '').trim()));
  return entry && classifyHost(entry[1]) ? entry[1] : null;
}

/** What a title must show to be about this candidate: its brand, and its series (C-series -> C5, S90-series -> S90D, RF28-series -> RF28...). */
export function candidateIdentity(name) {
  const text = String(name || '').replace(/,.*$/, ' ').replace(/\([^)]*\)/g, ' ');
  const brand = (/^[A-Za-z][A-Za-z&.]*/.exec(text.trim()) || [''])[0].toLowerCase();
  const letters = [...text.matchAll(/\b([A-Za-z]{1,2})[- ]series\b/gi)].map((match) => `letter:${match[1].toUpperCase()}`);
  const words = text.replace(/(\d)\.(\d)/g, '$1$2').split(/[^A-Za-z0-9]+/).filter(Boolean);
  // A code has a digit. A bare number is a size or a count ("55", "500 Series", "4 Door") unless it is one digit that names the line ("Bravia 8").
  const codes = words.filter((token, index) => /\d/.test(token) && !/^\d+(?:k|hz|in|inch|door|burner|cu|ft)$/i.test(token) && !NAME_FILLER.has(token.toLowerCase())
    && !(/^\d+$/.test(token) && (token.length >= 2 || /^(?:door|doors|burner|burners|cu|ft|inch|in|series|k|hz)$/i.test(words[index + 1] || ''))))
    .map((token) => `code:${token.toUpperCase()}`);
  return { brand, series: [...letters, ...codes].slice(0, 3), oled: /\boled\b/i.test(text) };
}

function seriesMatches(series, title) {
  if (series.startsWith('letter:')) {
    const letter = escapeRegExp(series.slice(7));
    return new RegExp(`(?:\\b${letter}\\d{1,2}\\b|OLED\\d{2}${letter}\\d)`, 'i').test(title);
  }
  const code = escapeRegExp(series.slice(5));
  return new RegExp(`(?:\\b${code}|[A-Z]{2}\\d{2}${code})`, 'i').test(title);
}

const modelOf = (title) => {
  const token = [...String(title).toUpperCase().matchAll(MODEL_ISH)].map((match) => modelKey(match[0])).find((value) => MODEL_PATTERN.test(value) && looksLikeExactModel(value));
  return token || null;
};

/**
 * @param {{title: string, seller: string, price: number}[]} rows  normalized Shopping rows
 * @param {{name: string}} candidate  the candidate as named by the engine (a family, never an invented model code)
 * @param {{category: string, spec: {kind: string, value: number}|null, focuses?: string[]}} context
 *   `focuses` are the original's own model tokens; a listing of the original itself is not a replacement candidate.
 * @returns {{items: {seller: string, host: string, amount: number, model: string|null}[], skipped: Record<string, number>}}
 */
export function screenListings(rows, candidate, { category, spec, focuses = [] }) {
  const skipped = {};
  const skip = (reason) => { skipped[reason] = (skipped[reason] || 0) + 1; };
  const identity = candidateIdentity(candidate?.name);
  const kept = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    const host = sellerHost(row.seller);
    if (!host) { skip('SELLER_NOT_RECOGNISED'); continue; }
    if (NOT_NEW.test(row.title)) { skip('NOT_NEW'); continue; }
    if (IMPORTER.test(row.title)) { skip('IMPORT_VOLTAGE'); continue; }
    if (RENTAL.test(row.title) || RENTAL.test(row.seller)) { skip('RENTAL'); continue; }
    if (BUNDLE.test(row.title)) { skip('BUNDLE'); continue; }
    if (PART.test(row.title)) { skip('ACCESSORY_OR_PART'); continue; }
    const title = row.title.toLowerCase();
    if (identity.brand && !title.includes(identity.brand) && !host.startsWith(identity.brand)) { skip('OTHER_BRAND'); continue; }
    if (identity.series.length && !identity.series.some((series) => seriesMatches(series, row.title))) { skip('OTHER_SERIES'); continue; }
    if (category === 'tv' && identity.oled && !/oled/i.test(row.title)) { skip('OTHER_DISPLAY_CLASS'); continue; }
    const size = sizeAgreement(spec, category, row.title);
    if (size === 'MISMATCH') { skip('OTHER_SIZE'); continue; }
    const tokens = [...row.title.toUpperCase().matchAll(MODEL_ISH)].map((match) => modelKey(match[0]));
    if (focuses.some((focus) => tokens.some((token) => matchesFocus(token, focus).match))) { skip('SAME_AS_ORIGINAL'); continue; }
    kept.push({ seller: row.seller.trim(), host, amount: row.price, model: modelOf(row.title), size });
  }

  // Prefer rows that state the right size when two sellers do; then keep one price per seller (the lowest).
  const confirmed = kept.filter((row) => row.size === 'MATCH');
  const usable = new Set(confirmed.map((row) => row.host)).size >= 2 ? confirmed : kept;
  const bySeller = new Map();
  for (const row of usable) if (!bySeller.has(row.host) || row.amount < bySeller.get(row.host).amount) bySeller.set(row.host, row);
  const pool = [...bySeller.values()];

  const sorted = pool.map((row) => row.amount).sort((a, b) => a - b);
  const mid = sorted.length ? median(sorted) : 0;
  const inBand = pool.filter((row) => row.amount >= mid * BAND_LOW && row.amount <= mid * BAND_HIGH).sort((a, b) => a.amount - b.amount);
  for (let index = 0; index < pool.length - inBand.length; index += 1) skip('PRICE_OUTLIER');

  const picked = inBand.length <= MAX_LISTINGS_PER_CANDIDATE ? inBand : [inBand[0], inBand[Math.floor((inBand.length - 1) / 2)], inBand.at(-1)];
  return { items: picked.map(({ seller, host, amount, model }) => ({ seller, host, amount, model })), skipped };
}
