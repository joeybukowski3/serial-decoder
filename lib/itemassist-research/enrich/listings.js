import { MODEL_PATTERN, classifyHost, looksLikeExactModel, safeSourceUrl } from '../evidence.js';
import { narrowToAgreement } from '../spread.js';
import { CONFIG_VERDICT, judgeConfig, laptopLineMatches, skuOf } from './config.js';
import { IMPORTER, MODEL_ISH, doorCountOf, escapeRegExp, layoutOf, matchesFocus, modelKey, sizeAgreement, statedLines, statedWidths } from './product-tokens.js';
import { chooseGeneration, generalisedName } from './lineage.js';
import { buildObservations, groupObserved } from './observations.js';
import { newTally, observationDiagnostics } from './observation-diagnostics.js';

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

// A television listed as 1080p or HD falls short of the essential resolution (4K or higher); one that also says 4K/UHD does not.
const LOW_RESOLUTION = /\b(?:720p|1080p|full[- ]?hd|fhd|hd[- ]ready|1366\s?x\s?768|1920\s?x\s?1080)\b/i;
const HAS_4K = /\b(?:4k|uhd|2160p|3840\s?x\s?2160)\b/i;

// A listing that names a generation but no full model code is a television only if it also reads like one; an accessory or part that merely names the
// series ("Magic Remote for OLED C6 TV") has none of these. A different display class named in the title is a failed essential requirement.
const TV_SIGNAL = /\b(?:4k|uhd|smart)\b/i;
const ACCESSORY_FOR = /\b(?:remote(?: control)?|stand|legs?|feet|mount|bracket|cover|cable|adapter)\b[^|]{0,24}\bfor\b/i;
const OTHER_DISPLAY_CLASS = /\b(?:qled|neo qled|mini[- ]?led|qned|nanocell|led|lcd)\b/i;

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

// A Shopping row's own link, kept only when it is a page on the seller's registered site and not a search or listing page; otherwise null.
const SEARCH_PATH = /\/(?:search|searchresults?|sch|s|browse|b|c|category|categories|collections?|shop|pl|catalog)(?:\/|$)/i;
function directUrl(row, host) {
  if (!row.url || !host) return null;
  const source = safeSourceUrl(row.url);
  const seller = classifyHost(host);
  if (!source || !seller || source.domain !== seller.domain) return null;
  const path = new URL(source.url).pathname;
  return path.length > 1 && !SEARCH_PATH.test(path) ? source.url : null;
}

/** The exact model code named by listings of the most distinct recognised sellers (at least two), with those listings; null when there is none. */
function bestSku(rows) {
  const groups = new Map();
  for (const row of rows) if (row.sku) groups.set(row.sku, [...(groups.get(row.sku) || []), row]);
  const ranked = [...groups.entries()].map(([sku, list]) => ({ sku, rows: list, sellers: new Set(list.map((row) => row.host)).size, low: Math.min(...list.map((row) => row.amount)) }))
    .filter((group) => group.sellers >= 2).sort((a, b) => b.sellers - a.sellers || b.rows.length - a.rows.length || a.low - b.low || a.sku.localeCompare(b.sku));
  return ranked[0] || null;
}

const sameSku = (a, b) => { const [short, long] = a.length <= b.length ? [a, b] : [b, a]; return short === long || (short.length >= 6 && long.startsWith(short) && long.length - short.length <= 6); };

/**
 * The model code to present for one generation: the code named by the most distinct sellers (one seller is enough; it is not corroboration),
 * with short variants of a code counted as the same model, and the longest spelling kept. Null when no listing states a code.
 */
function topSku(rows) {
  const groups = [];
  for (const row of rows.filter((entry) => entry.gen && entry.gen.sku)) {
    const group = groups.find((entry) => sameSku(entry.sku, row.gen.sku));
    if (group) { group.rows.push(row); if (row.gen.sku.length > group.sku.length) group.sku = row.gen.sku; } else groups.push({ sku: row.gen.sku, rows: [row] });
  }
  const ranked = groups.map((group) => ({ ...group, sellers: new Set(group.rows.map((row) => row.host)).size, low: Math.min(...group.rows.map((row) => row.amount)) }))
    .sort((a, b) => b.sellers - a.sellers || b.rows.length - a.rows.length || a.low - b.low || a.sku.localeCompare(b.sku));
  return ranked[0] || null;
}

/**
 * The model code recognised sellers state most often for a generation: short spellings of one code (retailers truncate them) count together and the
 * fullest spelling is kept. Null when none was stated.
 */
function topObserved(skus) {
  const groups = [];
  for (const [sku, count] of skus.entries()) {
    const group = groups.find((entry) => sameSku(entry.sku, sku));
    if (group) { group.count += count; if (sku.length > group.sku.length) group.sku = sku; } else groups.push({ sku, count });
  }
  groups.sort((a, b) => b.count - a.count || a.sku.localeCompare(b.sku));
  return groups[0] ? groups[0].sku : null;
}

const modelOf = (title) => {
  const token = [...String(title).toUpperCase().matchAll(MODEL_ISH)].map((match) => modelKey(match[0])).find((value) => MODEL_PATTERN.test(value) && looksLikeExactModel(value));
  return token || null;
};


/**
 * @param {{title: string, seller: string, price: number}[]} rows  normalized Shopping rows
 * @param {{name: string}} candidate  the candidate as named by the engine (a family, never an invented model code)
 * @param {{category: string, spec: {kind: string, value: number, atLeast?: boolean}|null, focuses?: string[], layout?: {kind: string, doors: number|null, settled?: boolean}|null, width?: number|null, config?: {request: object, line: object}|null}} context
 *   `focuses` are the original's own model tokens: a listing of the original itself is not a replacement candidate, but it is the original's own
 *   current listing price and is returned separately. `layout` is the original's door configuration (kind and, if settled, door count), when known.
 *   `width` is a refrigerator's nominal width in inches when its own sources state it: a listing that states another width is rejected.
 *   `config` is set for a laptop: its product line and the configuration the person asked for (see config.js). A listing then has to be of that line
 *   and state that configuration to set a price; one that states another is rejected, and one that does not state it is an example.
 * @returns {{items: object[], skipped: Record<string, number>, context: object[], originals: object[], unrecognised: object[], seriesDropped: string[], doorNote: object|null}}
 *   `items` are the provisional prices that may set a range. `context` are listings that passed every other check but did not state the size
 *   asked about: examples only, never a price. `originals` are listings of the original model itself. `unrecognised` are listings from sellers
 *   that are not recognised sources and passed every other check; they are returned only when nothing from a recognised seller could be priced,
 *   as unverified context (never a price, never a source). `seriesDropped` are numbered product lines in the candidate's name that no listing
 *   of that brand uses (the name is then matched by brand alone).
 */
export function screenListings(rows, candidate, { category, spec, focuses = [], layout = null, width = null, config = null, lineage = null, retrievedAt = null }) {
  const skipped = {};
  const skip = (reason) => { skipped[reason] = (skipped[reason] || 0) + 1; };
  // A candidate whose maker has a generation grammar is matched on its series, never on a generation the model named: the generation is decided below
  // from what the listings state. Everything else is matched exactly as before.
  const identity = candidateIdentity(lineage ? generalisedName(candidate?.name, lineage) : candidate?.name);
  const groups = new Map();
  const groupOf = (parsed) => {
    if (!groups.has(parsed.ordinal)) groups.set(parsed.ordinal, { ordinal: parsed.ordinal, label: parsed.label, series: parsed.series, priced: 0, sized: 0, essential: 0, otherSize: 0, skus: new Map() });
    return groups.get(parsed.ordinal);
  };
  const namedDoors = doorCountOf(candidate?.name);
  const conflictingName = Boolean(layout?.doors && namedDoors && namedDoors !== layout.doors);
  const kept = [];
  const originals = [];
  const strangers = [];
  // Rows of a recognised seller that state something about the generation in the size asked about: kept rows, and bundle or protection-plan rows that can set no price.
  const seen = [];
  // Internal counters for the diagnostic log only (see `observation-diagnostics.js`); they change nothing that is priced, named or shown.
  const tally = newTally();

  /** Every check except who the seller is: the same for a recognised seller and an unrecognised one. */
  const judge = (row, host) => {
    const parsed = lineage ? lineage.parse(row.title) : null;
    const reject = (reason) => ({ verdict: 'skip', reason, parsed });
    if (NOT_NEW.test(row.title)) return reject('NOT_NEW');
    if (IMPORTER.test(row.title)) return reject('IMPORT_VOLTAGE');
    if (RENTAL.test(row.title) || RENTAL.test(row.seller)) return reject('RENTAL');
    if (BUNDLE.test(row.title)) return reject('BUNDLE');
    if (SERVICE_PACKAGE.test(row.title)) return reject('SERVICE_PACKAGE');
    if (PART.test(row.title)) return reject('ACCESSORY_OR_PART');
    const title = row.title.toLowerCase();
    if (identity.brand && !title.includes(identity.brand) && !host.startsWith(identity.brand)) return reject('OTHER_BRAND');
    // A laptop is held to its product line and its configuration instead of a series code: one name covers entry and flagship machines.
    if (config && !laptopLineMatches(config.line, row.title)) return reject('OTHER_LINE');
    if (!config && identity.series.length && !identity.series.some((series) => seriesMatches(series, row.title))) return reject('OTHER_SERIES');
    // (The digit comparison below is the pre-grammar check; with a grammar, generations are compared by model year instead, further down.)
    if (!lineage && olderGeneration(identity, focuses, row.title)) return reject('OLDER_GENERATION');
    if (lineage && lineage.sameSeries && parsed && parsed.series === lineage.series && parsed.ordinal < lineage.originalOrdinal) return reject('OLDER_GENERATION');
    if (category === 'tv' && identity.oled && !/oled/i.test(row.title)) return reject('OTHER_DISPLAY_CLASS');
    if (category === 'tv' && LOW_RESOLUTION.test(row.title) && !HAS_4K.test(row.title)) return reject('BELOW_RESOLUTION');
    if (lineage && (ACCESSORY_FOR.test(row.title) || (parsed && !parsed.sku && !TV_SIGNAL.test(row.title)))) return reject('ACCESSORY_OR_PART');
    // A model code states its own screen size; a title whose words and whose code disagree about it has not shown a size.
    if (parsed && parsed.size !== null && spec && spec.kind === 'inches' && Math.abs(parsed.size - spec.value) > 1) return reject('OTHER_SIZE');
    // For a laptop the verdict on its configuration takes the place of the size verdict below (MATCH / UNKNOWN; a mismatch is rejected here).
    const size = config ? judgeConfig(config.request, row.title) : sizeAgreement(spec, category, row.title);
    if (size === CONFIG_VERDICT.MISMATCH) return reject(config ? 'OTHER_CONFIGURATION' : 'OTHER_SIZE');
    // The original's nominal width, when its own sources state it: a listing that states another width is another size of refrigerator.
    if (width !== null && category === 'refrigerator') { const stated = statedWidths(row.title); if (stated.length && !stated.some((value) => Math.abs(value - width) <= 1)) return reject('OTHER_SIZE'); }
    // A door configuration the title states that is not the original's (side-by-side for a French door, 3 doors for 4) is another kind of
    // refrigerator. A title that states neither is simply unknown here; it is not read as a match.
    if (layout) {
      const kind = layoutOf(row.title), doors = doorCountOf(row.title);
      if ((kind && kind !== layout.kind) || (layout.doors && doors && doors !== layout.doors)) return reject('OTHER_LAYOUT');
      // A candidate named with another door count than the original's (a "3-Door" family for a 4-door original) is known not to be like-kind:
      // only a listing that itself states the original's door count can stand for it.
      if (conflictingName && !doors) return reject('DOOR_COUNT_NOT_STATED');
    }
    const tokens = [...row.title.toUpperCase().matchAll(MODEL_ISH)].map((match) => modelKey(match[0]));
    const model = modelOf(row.title);
    const url = directUrl(row, host);
    // A bare series in the query ("S90") matches every generation of it; with a generation grammar, only a row of the original's own generation is the original.
    const isOriginal = focuses.some((focus) => tokens.some((token) => matchesFocus(token, focus).match))
      && !(lineage && parsed && parsed.series === lineage.series && (lineage.originalOrdinal === null || parsed.ordinal !== lineage.originalOrdinal));
    if (isOriginal) return { verdict: 'original', entry: { seller: row.seller.trim(), host, amount: row.price, model, title: row.title } };
    return { verdict: 'kept', parsed, entry: { seller: row.seller.trim(), host, amount: row.price, model, sku: parsed ? parsed.sku : skuOf(row.title), gen: parsed, url, size, lines: statedLines(row.title) } };
  };

  /**
   * What one row says about the generation it belongs to, for choosing the generation to present (see `chooseGeneration`). A group exists only for a row
   * that is evidence about the generation: one rejected as used, an import, a rental or a part says nothing about what is on sale, and a title that merely
   * omits the word OLED has not failed an essential requirement.
   */
  const observe = (judged, host) => {
    const parsed = judged.parsed;
    if (!lineage || !parsed || parsed.series !== lineage.series || judged.verdict === 'original') return false;
    const sizeStated = () => spec && sizeAgreement(spec, category, judged.title) === 'MATCH' && !(parsed.size !== null && spec.kind === 'inches' && Math.abs(parsed.size - spec.value) > 1);
    let sized = false;
    if (judged.verdict === 'skip') {
      if (judged.reason === 'BELOW_RESOLUTION' || (judged.reason === 'OTHER_DISPLAY_CLASS' && OTHER_DISPLAY_CLASS.test(judged.title))) groupOf(parsed).essential += 1;
      else if (judged.reason === 'OTHER_SIZE') groupOf(parsed).otherSize += 1;
      // A bundle or a protection-plan listing still shows the model exists in this size, though it can set no price.
      else if (['BUNDLE', 'SERVICE_PACKAGE'].includes(judged.reason) && sizeStated()) sized = true;
      if (!sized) return false;
    } else if (judged.entry.size === 'MATCH') {
      sized = true;
    }
    if (!sized) return false;
    const group = groupOf(parsed);
    group.sized += 1;
    if (judged.verdict === 'kept' && host) group.priced += 1;
    // A model code a recognised seller states in this size is remembered so the model can be named when nothing could be priced (see `observedSku`).
    if (host && parsed.sku) group.skus.set(parsed.sku, (group.skus.get(parsed.sku) || 0) + 1);
    return true;
  };

  for (const row of Array.isArray(rows) ? rows : []) {
    const host = sellerHost(row.seller);
    const judged = judge(row, host || '');
    judged.title = row.title;
    const sized = observe(judged, host);
    tally.considered += 1;
    if (host) tally.sellers += 1;
    if (lineage && judged.parsed && judged.parsed.series === lineage.series) tally.series += 1;
    if (skuOf(row.title)) tally.codeTokens += 1;
    // A bundle or protection-plan row is observed only if it still reads as a television: a mount or kit "for" a model is an accessory, and its code is not a TV's.
    const televisionRow = judged.verdict === 'kept' || (TV_SIGNAL.test(row.title) && !ACCESSORY_FOR.test(row.title) && !PART.test(row.title));
    if (sized && host && !televisionRow && ['BUNDLE', 'SERVICE_PACKAGE'].includes(judged.reason)) tally.accessories += 1;
    if (sized && host && televisionRow && (judged.verdict === 'kept' || ['BUNDLE', 'SERVICE_PACKAGE'].includes(judged.reason))) {
      seen.push({ host, title: row.title, ordinal: judged.parsed.ordinal, sku: judged.parsed.sku || null, size: judged.parsed.size, reason: judged.verdict === 'kept' ? null : judged.reason });
    }
    // A seller that is not a recognised source is counted as such whatever else is true of its row; a row that would otherwise have passed is
    // remembered, but only as unverified context (see `unrecognised`).
    if (!host) { skip('SELLER_NOT_RECOGNISED'); if (judged.verdict === 'kept') strangers.push(judged.entry); continue; }
    if (judged.verdict === 'skip') { skip(judged.reason); continue; }
    if (judged.verdict === 'original') { skip('SAME_AS_ORIGINAL'); originals.push(judged.entry); continue; }
    kept.push(judged.entry);
  }

  // A numbered line in the candidate's name ("500 Series") is kept only where listings of that brand use numbered lines at all. Where none does
  // (there is no "KitchenAid 300 Series"), the number was never a real line, so the candidate is matched by its brand alone.
  const seriesDropped = !config && identity.lines.length && !kept.some((row) => row.lines.length) ? identity.lines : [];
  const lines = config || seriesDropped.length ? [] : identity.lines;
  const lineVerdict = (row) => (!lines.length ? 'NA' : !row.lines.length ? 'UNKNOWN' : row.lines.some((line) => lines.includes(line)) ? 'MATCH' : 'MISMATCH');
  const sameLine = kept.filter((row) => { const verdict = lineVerdict(row); if (verdict === 'MISMATCH') skip('OTHER_SERIES'); if (verdict === 'UNKNOWN') skip('SERIES_NOT_STATED'); return verdict === 'MATCH' || verdict === 'NA'; });

  // A title that states no size has not confirmed one. Where a size is asked about (a television's screen, an appliance's capacity or width), only
  // a row that states a fitting size can set a price: a family listing often shows the price of its smallest set. The rest are kept as examples.
  // A refrigerator is always held to it: with no known size for the original (spec is null) nothing can be shown to fit, so every listing is an
  // example, never a price (a family listing can be a 30-inch, 18 cu ft model for a 36-inch, 27 cu ft original).
  const strictSize = Boolean(config) || category === 'tv' || category === 'refrigerator' || spec !== null;
  // Lineage: the generation to present is decided from the generation each listing states, never from the model's guess. Listings of any other
  // generation are not this candidate's, and a listing that states no generation cannot be tied to one.
  const outcome = lineage ? chooseGeneration(groups, lineage) : null;
  const presented = outcome ? outcome.named : null;
  const inGeneration = (row) => Boolean(presented && row.gen && row.gen.series === lineage.series && row.gen.ordinal === presented.ordinal);
  const scoped = lineage ? sameLine.filter((row) => { if (inGeneration(row)) return true; skip(row.gen ? 'OTHER_GENERATION' : 'GENERATION_NOT_STATED'); return false; }) : sameLine;
  const usable = strictSize ? scoped.filter((row) => row.size === 'MATCH') : scoped;
  // The model codes the presented generation's listings state, whether or not those listings can set a price. Codes that are not variants of each other are a
  // conflict: no code is chosen, so the candidate is named without one and no listing is priced as one exact model.
  const observedRows = presented ? seen.filter((row) => row.ordinal === presented.ordinal) : [];
  const conflict = Boolean(lineage) && groupObserved(observedRows).length >= 2;
  const lowestPer = (list, keyOf) => {
    const byKey = new Map();
    for (const row of list) if (!byKey.has(keyOf(row)) || row.amount < byKey.get(keyOf(row)).amount) byKey.set(keyOf(row), row);
    return [...byKey.values()];
  };
  const lowestPerSeller = (list) => lowestPer(list, (row) => row.host);
  // When one exact model code is named by listings of two or more recognised sellers, the price is that model's: a model has one price, a family
  // has many. A code only one seller names, or a part number that is not a model, never makes a model of its own.
  // A television whose maker has a generation grammar keeps the model code its priced listings state even when one seller states it (one seller is
  // not corroboration, and the status stays provisional); a listing of another model code, or one that states none, is not that model's price.
  const group = lineage ? null : bestSku(usable);
  const lineageSku = lineage && !conflict ? topSku(usable) : null;
  const sourceRows = lineageSku ? usable.filter((row) => row.gen && row.gen.sku && sameSku(row.gen.sku, lineageSku.sku)) : (group ? group.rows : usable);
  if (lineageSku) for (const row of usable) if (!sourceRows.includes(row)) skip(row.gen && row.gen.sku ? 'OTHER_MODEL_VARIANT' : 'MODEL_NOT_STATED');
  const pool = lowestPerSeller(sourceRows);
  const withinBand = (list) => {
    const mid = list.length ? median(list.map((row) => row.amount).sort((a, b) => a - b)) : 0;
    return list.filter((row) => row.amount >= mid * BAND_LOW && row.amount <= mid * BAND_HIGH).sort((a, b) => a.amount - b.amount);
  };
  const banded = withinBand(pool);
  for (let index = 0; index < pool.length - banded.length; index += 1) skip('PRICE_OUTLIER');
  // Listings that remain further apart than one range can honestly cover are different products under one name: the densest group of two or
  // more is used, and with none, no listing stands for the rest (see spread.js).
  const agreed = narrowToAgreement(banded, (row) => row.amount);
  for (let index = 0; index < banded.length - agreed.kept.length; index += 1) skip('PRICE_SPREAD');
  const inBand = agreed.kept;

  // Rows that state no size are examples (the lowest and the highest, one per seller, after the same outlier band), never prices.
  const examples = withinBand(strictSize ? lowestPerSeller(scoped.filter((row) => !usable.includes(row))) : []);
  const context = (examples.length > MAX_CONTEXT_LISTINGS ? [examples[0], examples.at(-1)] : examples)
    .map(({ seller, host, amount, model, url }) => ({ seller, host, amount, model, ...(url ? { url } : {}), reason: config ? 'CONFIG_NOT_CONFIRMED' : 'SIZE_NOT_STATED' }));
  // The original model's own current listings: the lowest and the highest, one per seller.
  const own = lowestPerSeller(originals).sort((a, b) => a.amount - b.amount);

  const picked = inBand.length <= MAX_LISTINGS_PER_CANDIDATE ? inBand : [inBand[0], inBand[Math.floor((inBand.length - 1) / 2)], inBand.at(-1)];
  // Where the candidate's name or its prices depend on a door count, say so (see `doorConcern`): the count is the original's, settled or not.
  const doorNote = layout?.doors && (conflictingName || (layout.settled === false && picked.length))
    ? { doors: layout.doors, settled: layout.settled !== false, named: conflictingName ? namedDoors : null, priced: picked.length > 0 } : null;

  // When nothing could be priced, the model code recognised sellers state most often in the requested size still names the model, as an unconfirmed code.
  // With a priced listing the code is the one those listings state (`sku`), so a price is never attached to a code its listing does not name.
  const observedSku = presented && !picked.length && !conflict ? topObserved(presented.skus) : null;
  // When nothing from a recognised seller can be priced, listings from sellers outside the recognised set that pass every other check (same
  // series, a stated fitting size, new, single unit) are kept as unverified context: the lowest and the highest, one per seller name. They
  // never become a price and never name a source; a candidate with a numbered line needs the line stated.
  const strangerPool = picked.length ? [] : strangers.filter((row) => (!identity.lines.length || row.lines.some((line) => identity.lines.includes(line))) && (!strictSize || row.size === 'MATCH') && (!lineage || (inGeneration(row) && (!observedSku || !row.gen.sku || sameSku(row.gen.sku, observedSku)))));
  const strangerBand = withinBand(lowestPer(strangerPool, (row) => row.seller.toLowerCase()));
  const unrecognised = (strangerBand.length > MAX_CONTEXT_LISTINGS ? [strangerBand[0], strangerBand.at(-1)] : strangerBand).map(({ seller, amount, model }) => ({ seller, amount, model }));
  const sku = lineage ? (lineageSku && picked.length ? lineageSku.sku : null) : (group && picked.length ? group.sku : null);
  const generation = presented ? { label: presented.label, ordinal: presented.ordinal, series: presented.series, priced: picked.length > 0 } : null;
  // When nothing could be priced, the model code recognised sellers state most often in the requested size still names the model, as an unconfirmed code.
  // With a priced listing the code is the one those listings state (`sku`), so a price is never attached to a code its listing does not name.
  // What the presented generation's listings say, for the model observations and the specification comparison. Bundle rows can state a model, but their other words
  // describe what is sold with the television, so they are not read for specifications.
  const observations = lineage && presented ? buildObservations(observedRows, { pricedSku: sku, pricedCount: picked.length, retrievedAt }) : null;
  const specSources = lineage && presented ? { candidate: observedRows.filter((row) => row.reason !== 'BUNDLE').map(({ title, size }) => ({ title, size })), original: own.map((row) => row.title).filter(Boolean) } : null;
  return {
    sku, observedSku, observations, specSources, conflict, spreadTrimmed: agreed.trimmed,
    diagnostics: lineage ? observationDiagnostics({ tally, seen, observedRows, observations, conflict }) : null,
    generation, skippedNewer: outcome ? outcome.skipped : null, newestSeen: outcome && outcome.newest ? { label: outcome.newest.label, ordinal: outcome.newest.ordinal } : null,
    generations: outcome ? outcome.offered.map(({ label, ordinal, priced, sized, essential, otherSize }) => ({ label, ordinal, priced, sized, essential, otherSize })) : null,
    items: picked.map(({ seller, host, amount, model, url, gen }) => ({ seller, host, amount, model: sku || model, ...(gen && gen.sku ? { sku: gen.sku } : {}), ...(url ? { url } : {}), ...(layout && layout.settled === false ? { compatibilityOpen: true } : {}) })), skipped, context,
    originals: own.length > MAX_CONTEXT_LISTINGS ? [own[0], own.at(-1)] : own, unrecognised, seriesDropped, doorNote,
  };
}
