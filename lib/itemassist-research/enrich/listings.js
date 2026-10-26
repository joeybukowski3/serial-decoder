import { MODEL_PATTERN, classifyHost, looksLikeExactModel } from '../evidence.js';
import { IMPORTER, MODEL_ISH, doorCountOf, escapeRegExp, layoutOf, matchesFocus, modelKey, sizeAgreement, statedLines } from './product-tokens.js';

/**
 * Basic screening of Google Shopping rows for ONE replacement candidate, down to at most three provisional prices.
 *
 * Screening is deliberately plain: a listing must be a new, single-unit purchase from a recognised seller, name the candidate's brand and
 * series, and not contradict the size or display technology the user needs. What is left is thinned by seller (the lowest price per
 * seller) and by a wide median band that removes rentals and absurd outliers, then reduced to the lowest, the median and the highest
 * price. A Shopping row never becomes more than a labelled listing: it has no product page, so nothing here can confirm it.
 */

export const MAX_LISTINGS_PER_CANDIDATE = 3;
export const MAX_CONTEXT_LISTINGS = 2;
const BAND_LOW = 0.35;
const BAND_HIGH = 2.5;

// Seller display name (anchored) -> registered host. A seller that is not here is not a recognised source, so its price is not used.
const SELLERS = Object.freeze([
  [/^best ?buy$/i, 'bestbuy.com'], [/^(?:the )?home ?depot$/i, 'homedepot.com'], [/^lowe'?s(?: home improvement)?$/i, 'lowes.com'], [/^walmart$/i, 'walmart.com'],
  [/^target$/i, 'target.com'], [/^costco(?: wholesale)?$/i, 'costco.com'], [/^sam'?s club$/i, 'samsclub.com'], [/^abt(?: electronics)?$/i, 'abt.com'],
  [/^aj ?madison$/i, 'ajmadison.com'], [/^appliances ?connection$/i, 'appliancesconnection.com'], [/^crutchfield$/i, 'crutchfield.com'],
  [/^b ?& ?h(?: photo(?:[- ]video)?(?:[- ]audio)?)?$/i, 'bhphotovideo.com'], [/^p\.? ?c\.? richard(?: (?:&|and) son)?$/i, 'pcrichard.com'], [/^newegg(?:\.com)?$/i, 'newegg.com'],
  [/^brandsmart usa$/i, 'brandsmartusa.com'], [/^bj'?s wholesale club$/i, 'bjs.com'], [/^micro ?center$/i, 'microcenter.com'], [/^electronic ?express$/i, 'electronicexpress.com'], [/^yale appliance(?: (?:\+|&|and) lighting)?$/i, 'yaleappliance.com'],
  [/^lg(?: electronics)?(?: usa)?$/i, 'lg.com'], [/^samsung(?: electronics)?(?: us)?$/i, 'samsung.com'], [/^sony(?: electronics)?$/i, 'sony.com'],
  [/^ge appliances$/i, 'geappliances.com'], [/^whirlpool$/i, 'whirlpool.com'], [/^frigidaire$/i, 'frigidaire.com'], [/^kitchenaid$/i, 'kitchenaid.com'],
  [/^bosch(?: home(?: appliances)?)?(?: us(?:a)?)?$/i, 'bosch-home.com'],
  [/^plesser'?s(?: appliances?)?$/i, 'plessers.com'], [/^appliance ?factory(?: outlet)?$/i, 'appliancefactory.com'], [/^town appliance$/i, 'townappliance.com'], [/^appliance ?leaders$/i, 'applianceleaders.com'],
  [/^hisense(?: usa)?$/i, 'hisense-usa.com'], [/^tcl$/i, 'tcl.com'], [/^vizio$/i, 'vizio.com'],
]);

const NOT_NEW = /\b(?:used|pre-?owned|refurb(?:ished)?|renewed|open[- ]?box|scratch(?: and|&) dent|as[- ]is|for parts|damaged|demo(?:nstration)?|floor model|reconditioned|b[- ]grade)\b/i;
const RENTAL = /\b(?:rent(?:al|s)?|lease|rent-?to-?own|lease-?to-?own|per month|\/\s?mo|monthly|weekly|payments?)\b/i;
// A product sold with other things: the price is the package's, not the product's. "with" may be followed by a few words before the add-on
// ("with a Kanto PMX800 Full Motion Dual Stud Mount"), but never past a comma, so a feature list ("w/ Dolby Atmos, Vision, HDR10") is not an add-on.
const BUNDLE = /\bbundle[ds]?\b|\bcombo\b|\bkit\b|\bpackage\b|\bpack of\b|\b\d\s?-?\s?pack\b|\bsound ?bar\b|(?:\b(?:with|w\/)|\+|&)\s*(?:an?\s+|the\s+|free\s+)?[^,|()]{0,50}?\b(?:wall ?mount|mount|stand|speakers?|cables?|surge|power strip|power filter|protector|subscription|installation|delivery|haul)\b/i;
// A separately priced service: a protection plan, extended warranty or care plan is not part of the television.
const SERVICE_PACKAGE = /\b(?:protection|warranty|warranties|extended (?:service|coverage)|service plan|care plan|coverage plan|amber|squaretrade|asurion|allstate|assurant)\b/i;
const PART = /\b(?:(?:replacement|universal|spare) remote(?: control)?|replacement (?:part|filter)|water filter|gasket|bracket|screen protector|cover|shelf|(?:replacement|door|drawer) handle|control board|power cord|cable|manual)\b/i;
// Words that describe the product's line rather than identify its series.
const NAME_FILLER = new Set(['series', 'current', 'generation', 'newest', 'latest', 'new', 'line', 'family', 'class', 'model', 'models', 'smart', 'tv', 'the', 'and', 'or', 'of', 'with', 'by']);

const median = (sorted) => (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2);

/** The registered host for a Shopping seller name, or null when the seller is not a recognised source. */
export function sellerHost(name) {
  const entry = SELLERS.find(([pattern]) => pattern.test(String(name || '').trim()));
  return entry && classifyHost(entry[1]) ? entry[1] : null;
}

/**
 * What a title must show to be about this candidate: its brand, and its series (C-series -> C5, S90-series -> S90D, RF28-series -> RF28...).
 * `lines` are product lines named by number ("Bosch 500 Series" -> ["500"]): a title that states another line is another tier of the brand.
 */
export function candidateIdentity(name) {
  const text = String(name || '').replace(/,.*$/, ' ').replace(/\([^)]*\)/g, ' ');
  const brand = (/^[A-Za-z][A-Za-z&.]*/.exec(text.trim()) || [''])[0].toLowerCase();
  const lines = [...new Set(statedLines(text))];
  const letters = [...text.matchAll(/\b([A-Za-z]{1,2})[- ]series\b/gi)].map((match) => `letter:${match[1].toUpperCase()}`);
  const words = text.replace(/(\d)\.(\d)/g, '$1$2').split(/[^A-Za-z0-9]+/).filter(Boolean);
  // A code has a digit. A bare number is a size or a count ("55", "500 Series", "4 Door") unless it is one digit that names the line ("Bravia 8").
  const codes = words.filter((token, index) => /\d/.test(token) && !/^\d+(?:k|hz|in|inch|door|burner|cu|ft)$/i.test(token) && !NAME_FILLER.has(token.toLowerCase())
    && !(/^\d+$/.test(token) && (token.length >= 2 || /^(?:door|doors|burner|burners|cu|ft|inch|in|series|k|hz)$/i.test(words[index + 1] || ''))))
    .map((token) => `code:${token.toUpperCase()}`);
  return { brand, lines, series: [...letters, ...codes].slice(0, 3), oled: /\boled\b/i.test(text) };
}

function seriesMatches(series, title) {
  if (series.startsWith('letter:')) {
    const letter = escapeRegExp(series.slice(7));
    return new RegExp(`(?:\\b${letter}\\d{1,2}\\b|OLED\\d{2}${letter}\\d)`, 'i').test(title);
  }
  const code = escapeRegExp(series.slice(5));
  return new RegExp(`(?:\\b${code}|[A-Z]{2}\\d{2}${code})`, 'i').test(title);
}

/** The generation digit a title gives a lettered series ("C5", "OLED55C6PUA" -> 5, 6), or null. */
function generationOf(letter, title) {
  const found = new RegExp(`(?:\\b${escapeRegExp(letter)}(\\d{1,2})\\b|OLED\\d{2}${escapeRegExp(letter)}(\\d))`, 'i').exec(title);
  return found ? Number(found[1] || found[2]) : null;
}

/** True when the title is an earlier generation of the same lettered series than the original ("C2" for a "C3"): not a replacement. */
function olderGeneration(identity, focuses, title) {
  return identity.series.filter((series) => series.startsWith('letter:')).some((series) => {
    const letter = series.slice(7);
    const mine = focuses.map((focus) => new RegExp(`^${escapeRegExp(letter)}(\\d{1,2})$`, 'i').exec(focus)).find(Boolean);
    const theirs = generationOf(letter, title);
    return Boolean(mine) && theirs !== null && theirs < Number(mine[1]);
  });
}

const modelOf = (title) => {
  const token = [...String(title).toUpperCase().matchAll(MODEL_ISH)].map((match) => modelKey(match[0])).find((value) => MODEL_PATTERN.test(value) && looksLikeExactModel(value));
  return token || null;
};


/**
 * @param {{title: string, seller: string, price: number}[]} rows  normalized Shopping rows
 * @param {{name: string}} candidate  the candidate as named by the engine (a family, never an invented model code)
 * @param {{category: string, spec: {kind: string, value: number, atLeast?: boolean}|null, focuses?: string[], layout?: {kind: string, doors: number|null, settled?: boolean}|null}} context
 *   `focuses` are the original's own model tokens: a listing of the original itself is not a replacement candidate, but it is the original's own
 *   current listing price and is returned separately. `layout` is the original's door configuration (kind and, if settled, door count), when known.
 * @returns {{items: object[], skipped: Record<string, number>, context: object[], originals: object[], seriesDropped: string[], doorNote: object|null}}
 *   `items` are the provisional prices that may set a range. `context` are listings that passed every other check but did not state the size
 *   asked about: examples only, never a price. `originals` are listings of the original model itself. `seriesDropped` are numbered product
 *   lines in the candidate's name that no listing of that brand uses (the name is then matched by brand alone).
 */
export function screenListings(rows, candidate, { category, spec, focuses = [], layout = null }) {
  const skipped = {};
  const skip = (reason) => { skipped[reason] = (skipped[reason] || 0) + 1; };
  const identity = candidateIdentity(candidate?.name);
  const namedDoors = doorCountOf(candidate?.name);
  const conflictingName = Boolean(layout?.doors && namedDoors && namedDoors !== layout.doors);
  const kept = [];
  const originals = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    const host = sellerHost(row.seller);
    if (!host) { skip('SELLER_NOT_RECOGNISED'); continue; }
    if (NOT_NEW.test(row.title)) { skip('NOT_NEW'); continue; }
    if (IMPORTER.test(row.title)) { skip('IMPORT_VOLTAGE'); continue; }
    if (RENTAL.test(row.title) || RENTAL.test(row.seller)) { skip('RENTAL'); continue; }
    if (BUNDLE.test(row.title)) { skip('BUNDLE'); continue; }
    if (SERVICE_PACKAGE.test(row.title)) { skip('SERVICE_PACKAGE'); continue; }
    if (PART.test(row.title)) { skip('ACCESSORY_OR_PART'); continue; }
    const title = row.title.toLowerCase();
    if (identity.brand && !title.includes(identity.brand) && !host.startsWith(identity.brand)) { skip('OTHER_BRAND'); continue; }
    if (identity.series.length && !identity.series.some((series) => seriesMatches(series, row.title))) { skip('OTHER_SERIES'); continue; }
    if (olderGeneration(identity, focuses, row.title)) { skip('OLDER_GENERATION'); continue; }
    if (category === 'tv' && identity.oled && !/oled/i.test(row.title)) { skip('OTHER_DISPLAY_CLASS'); continue; }
    const size = sizeAgreement(spec, category, row.title);
    if (size === 'MISMATCH') { skip('OTHER_SIZE'); continue; }
    // A door configuration the title states that is not the original's (side-by-side for a French door, 3 doors for 4) is another kind of
    // refrigerator. A title that states neither is simply unknown here; it is not read as a match.
    if (layout) {
      const kind = layoutOf(row.title), doors = doorCountOf(row.title);
      if ((kind && kind !== layout.kind) || (layout.doors && doors && doors !== layout.doors)) { skip('OTHER_LAYOUT'); continue; }
      // A candidate named with another door count than the original's (a "3-Door" family for a 4-door original) is known not to be like-kind:
      // only a listing that itself states the original's door count can stand for it.
      if (conflictingName && !doors) { skip('DOOR_COUNT_NOT_STATED'); continue; }
    }
    const tokens = [...row.title.toUpperCase().matchAll(MODEL_ISH)].map((match) => modelKey(match[0]));
    const model = modelOf(row.title);
    if (focuses.some((focus) => tokens.some((token) => matchesFocus(token, focus).match))) { skip('SAME_AS_ORIGINAL'); originals.push({ seller: row.seller.trim(), host, amount: row.price, model }); continue; }
    kept.push({ seller: row.seller.trim(), host, amount: row.price, model, size, lines: statedLines(row.title) });
  }

  // A numbered line in the candidate's name ("500 Series") is kept only where listings of that brand use numbered lines at all. Where none does
  // (there is no "KitchenAid 300 Series"), the number was never a real line, so the candidate is matched by its brand alone.
  const seriesDropped = identity.lines.length && !kept.some((row) => row.lines.length) ? identity.lines : [];
  const lines = seriesDropped.length ? [] : identity.lines;
  const lineVerdict = (row) => (!lines.length ? 'NA' : !row.lines.length ? 'UNKNOWN' : row.lines.some((line) => lines.includes(line)) ? 'MATCH' : 'MISMATCH');
  const sameLine = kept.filter((row) => { const verdict = lineVerdict(row); if (verdict === 'MISMATCH') skip('OTHER_SERIES'); if (verdict === 'UNKNOWN') skip('SERIES_NOT_STATED'); return verdict === 'MATCH' || verdict === 'NA'; });

  // A title that states no size has not confirmed one. Where a size is asked about (a television's screen, an appliance's capacity or width), only
  // a row that states a fitting size can set a price: a family listing often shows the price of its smallest set. The rest are kept as examples.
  const strictSize = category === 'tv' || spec !== null;
  const usable = strictSize ? sameLine.filter((row) => row.size === 'MATCH') : sameLine;
  const lowestPerSeller = (list) => {
    const bySeller = new Map();
    for (const row of list) if (!bySeller.has(row.host) || row.amount < bySeller.get(row.host).amount) bySeller.set(row.host, row);
    return [...bySeller.values()];
  };
  const pool = lowestPerSeller(usable);
  const withinBand = (list) => {
    const mid = list.length ? median(list.map((row) => row.amount).sort((a, b) => a - b)) : 0;
    return list.filter((row) => row.amount >= mid * BAND_LOW && row.amount <= mid * BAND_HIGH).sort((a, b) => a.amount - b.amount);
  };
  const inBand = withinBand(pool);
  for (let index = 0; index < pool.length - inBand.length; index += 1) skip('PRICE_OUTLIER');

  // Rows that state no size are examples (the lowest and the highest, one per seller, after the same outlier band), never prices.
  const examples = withinBand(strictSize ? lowestPerSeller(sameLine.filter((row) => !usable.includes(row))) : []);
  const context = (examples.length > MAX_CONTEXT_LISTINGS ? [examples[0], examples.at(-1)] : examples)
    .map(({ seller, host, amount, model }) => ({ seller, host, amount, model, reason: 'SIZE_NOT_STATED' }));
  // The original model's own current listings: the lowest and the highest, one per seller.
  const own = lowestPerSeller(originals).sort((a, b) => a.amount - b.amount);

  const picked = inBand.length <= MAX_LISTINGS_PER_CANDIDATE ? inBand : [inBand[0], inBand[Math.floor((inBand.length - 1) / 2)], inBand.at(-1)];
  // Where the candidate's name or its prices depend on a door count, say so (see `doorConcern`): the count is the original's, settled or not.
  const doorNote = layout?.doors && (conflictingName || (layout.settled === false && picked.length))
    ? { doors: layout.doors, settled: layout.settled !== false, named: conflictingName ? namedDoors : null, priced: picked.length > 0 } : null;
  return {
    items: picked.map(({ seller, host, amount, model }) => ({ seller, host, amount, model, ...(layout && layout.settled === false ? { compatibilityOpen: true } : {}) })), skipped, context,
    originals: own.length > MAX_CONTEXT_LISTINGS ? [own[0], own.at(-1)] : own, seriesDropped, doorNote,
  };
}
