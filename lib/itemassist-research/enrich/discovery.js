/**
 * Market discovery for televisions (Release 3b follow-up).
 *
 * The successor slot's Shopping lookup is normally pinned to the series the model named. When that series is dated by its own model code to a model year
 * that is no longer current ("Samsung CU7000", 2023, asked in 2026), the listings for it are old stock at marketplace sellers and the newer models a
 * shopper would actually be offered are never retrieved. In that case the same single lookup is spent on the original maker's current range instead:
 * "<maker> <size> inch 4K <display type> TV", built only from the original's own attributes. The successor is still screened against those rows (its
 * series, its newest dated generation at the size), and the rows also name the maker's other current series, from which one same-brand ALTERNATIVE can
 * be offered. Nothing is added to the provider budget: one Gemini call, one search about the original, two Shopping lookups.
 *
 * A discovered model never becomes the successor and is never "verified": it is screened by `screenListings` exactly like a named candidate (recognised
 * sellers only, new single units, the stated size, a dated generation, its own model code, the outlier band) and is offered only when at least two
 * recognised sellers price that exact code at the requested size. Pure; no network.
 */
import { screenListings, sellerHost } from './listings.js';
import { brandOf, resolveLineage, tvGrammarFor } from './lineage.js';
import { agreedDisplayType, displayFamilyOf, displayTypeOf, settledDisplayStatus } from './display-class.js';

export const DISCOVERY_MODE = Object.freeze({ OFF: 'off', STALE: 'stale', ALWAYS: 'always' });

// Makers with a television generation grammar, as they are written in a query.
const MAKER = Object.freeze({ samsung: 'Samsung', lg: 'LG', sony: 'Sony' });
const TECH_WORD = Object.freeze({ OLED: 'OLED', QD_OLED: 'OLED', QLED: 'QLED', MINI_LED: 'Mini-LED', QNED: 'QNED', NANOCELL: 'NanoCell', LED: 'LED' });
const FOUR_K = /\b(?:4k|uhd|2160p|ultra hd)\b/i;
// A nomination dated more than this many model years before the request year is not current: its listings are old stock. Two, not one: last year's and the
// year before's sets are still widely sold (a 2024 set in late 2026), and a broad query can miss one a targeted query finds.
const CURRENT_YEARS = 2;
// A discovered model older than this many model years before the request year is not offered as a current replacement.
const DISCOVERY_FLOOR_YEARS = 2;
// An engine-discovered model has no nomination behind it, so it needs more than one seller: two recognised sellers pricing its exact code at the size.
export const MIN_DISCOVERY_SELLERS = 2;
const MAX_SERIES = 12;
// How many of the maker's dated, recognised-seller listings a broad result must hold before a series' absence from it is stated as absence.
export const MIN_MARKET_COVERAGE = 3;

/** The original's maker when it has a television grammar ("samsung"), from the person's words first, then the identification; otherwise null. */
export function discoveryMaker(query, identity) {
  const brand = [brandOf(query), brandOf(identity)].find((entry) => Object.hasOwn(MAKER, entry));
  return brand || null;
}

/**
 * Whether the successor's lookup is spent on market discovery, and why. Only a television of a maker with a grammar, at a known size, whose successor is that
 * maker's: in STALE mode only when the successor's own name dates it to a model year more than CURRENT_YEARS before the request year, and only for a grammar
 * whose Shopping query keeps the generation the model named (Samsung Crystal UHD, LG UHD, Sony: `seriesByGrammar`). The LG OLED and Samsung QLED/OLED
 * grammars already drop the generation from the query ("LG C-series OLED 55 inch TV"), so their lookup spans every year and is not replaced.
 * (A generation digit read as the previous decade, "LG C7" as 2017, is dated by the grammar's own rule.)
 */
export function discoveryPlan({ mode = DISCOVERY_MODE.STALE, category, size, maker, successor, lineage, requestYear }) {
  if (mode === DISCOVERY_MODE.OFF) return { use: false, reason: 'OFF' };
  if (category !== 'tv' || !size) return { use: false, reason: 'NOT_A_SIZED_TV' };
  if (!maker) return { use: false, reason: 'NO_MAKER_GRAMMAR' };
  if (!successor || brandOf(successor.name) !== maker) return { use: false, reason: 'NO_SAME_MAKER_SUCCESSOR' };
  if (mode === DISCOVERY_MODE.ALWAYS) return { use: true, reason: 'ALWAYS' };
  if (lineage && !lineage.grammar.seriesByGrammar) return { use: false, reason: 'QUERY_SPANS_GENERATIONS' };
  const dated = lineage && Number.isFinite(lineage.hypothesisOrdinal) ? lineage.hypothesisOrdinal : null;
  if (dated === null) return { use: false, reason: 'NOMINATION_UNDATED' };
  return dated < requestYear - CURRENT_YEARS ? { use: true, reason: 'NOMINATION_NOT_CURRENT' } : { use: false, reason: 'NOMINATION_CURRENT' };
}

/** The discovery query: maker, size, "4K" when the original is 4K, its display type, "TV". Built from the original's attributes, never a model's family name. */
export function discoveryQuery({ maker, size, originalDisplay, originalText }) {
  const tech = originalDisplay ? TECH_WORD[originalDisplay] || '' : '';
  return [MAKER[maker], `${size} inch`, FOUR_K.test(originalText) ? '4K' : '', tech, 'TV'].filter(Boolean).join(' ');
}

/**
 * How the candidate's display type compares with the original's: 0 the same type (or either unknown), 1 another type of the same family that is not known
 * to be lower, null another family or a recognised step below the original (Mini-LED or QLED original, plain LED candidate): a known display shortfall is
 * never offered as a replacement, however new or well priced.
 */
function displayRank(originalDisplay, candidateType) {
  if (!originalDisplay || !candidateType || candidateType === originalDisplay) return 0;
  if (displayFamilyOf(candidateType) !== displayFamilyOf(originalDisplay)) return null;
  return settledDisplayStatus(originalDisplay, candidateType) === 'SHORTFALL' ? null : 1;
}

/**
 * The maker's series the rows name, each by its newest dated label ("Samsung U8000F"), in order of first appearance; at most MAX_SERIES. A row is read by the
 * maker's grammar that reads its title; a title no grammar of the maker reads names no series.
 */
const makerWord = (maker) => new RegExp(`\\b${maker}\\b`, 'i');
/** A row's dated reading by the maker's grammar that reads its title, or null (another maker, no grammar reads it, or a model year no source dates). */
function datedReading(row, maker, requestYear) {
  const title = String(row?.title || '');
  if (!makerWord(maker).test(title)) return null;
  const grammar = tvGrammarFor(maker, title);
  const parsed = grammar ? grammar.parse(title, requestYear) : null;
  return parsed && Number.isFinite(parsed.ordinal) ? { grammar, parsed } : null;
}

/**
 * How much of the maker's current range a broad result shows: its rows from recognised sellers whose model year a grammar dates. Below MIN_MARKET_COVERAGE a
 * series missing from the result is not stated as missing from the market.
 */
export const marketCoverage = (rows, maker, requestYear) => (Array.isArray(rows) ? rows : []).filter((row) => sellerHost(row?.seller) && datedReading(row, maker, requestYear)).length;

/** A full model code (one that carries the screen size, "UN55CU7001FXZA") rather than a series token ("CU7000"). */
export const isFullModelCode = (code, size) => Boolean(size) && String(code).length >= 8 && String(code).includes(String(size));

function seriesIn(rows, maker, requestYear) {
  const found = new Map();
  for (const row of rows) {
    const reading = datedReading(row, maker, requestYear);
    if (!reading) continue;
    const { grammar, parsed } = reading;
    const key = `${grammar.id}:${parsed.series}`;
    const known = found.get(key);
    if (!known) found.set(key, { key, label: parsed.label, ordinal: parsed.ordinal });
    else if (parsed.ordinal > known.ordinal) found.set(key, { ...known, label: parsed.label, ordinal: parsed.ordinal });
  }
  return [...found.values()].slice(0, MAX_SERIES);
}

const WHY = (size, year, sameSeries) => `Found in current US retailer listings at ${size} inches (a ${year} model by its model code). ${sameSeries ? 'A newer generation of the original\'s series' : 'A same-brand alternative'}, not confirmed as the original's successor.`;

/**
 * The best same-brand alternative the discovery rows support, or null. `exclude` holds series keys already represented (the successor's, a same-maker
 * suggestion's). Each series is screened as a candidate of its own; one qualifies only with a dated generation priced, under its own model code, by at
 * least MIN_DISCOVERY_SELLERS recognised sellers at the requested size, a display type of the original's family and not a recognised step below it, and a model year no older than
 * DISCOVERY_FLOOR_YEARS before the request year (nor older than the original, when its year is known). Order: the original's own display type first, then the newest model year, then the number of sellers, then
 * the order the listings gave. Never the cheapest or the newest alone.
 * @returns {{candidate: object, screened: object, lineage: object, diagnostics: object} | {candidate: null, diagnostics: object}}
 */
export function discoverAlternative(rows, { maker, query, identity, spec, focuses, retrievedAt = null, originalDisplay, requestYear, now, exclude = [] }) {
  const size = spec && spec.kind === 'inches' ? spec.value : null;
  const verdicts = {};
  const tally = (reason) => { verdicts[reason] = (verdicts[reason] || 0) + 1; };
  const qualified = [];
  const list = Array.isArray(rows) ? rows : [];
  seriesIn(list, maker, requestYear).forEach((series, order) => {
    const candidate = { name: `${MAKER[maker]} ${series.label}`, why: '', differences: null, concern: null, confidence: 'medium', comparison: [], tierVsOriginal: 'UNKNOWN' };
    const lineage = resolveLineage({ category: 'tv', query, identity, candidateName: candidate.name, now });
    if (!lineage) return tally('NO_LINEAGE');
    if (exclude.includes(`${lineage.grammar.id}:${lineage.series}`)) return tally('ALREADY_A_CANDIDATE');
    if (lineage.sameSeries && lineage.originalOrdinal !== null && series.ordinal <= lineage.originalOrdinal) return tally('ORIGINAL_OR_OLDER');
    const screened = screenListings(list, candidate, { category: 'tv', spec, focuses, layout: null, width: null, lineage, retrievedAt, config: null });
    const generation = screened.generation;
    if (!generation || !generation.priced || !screened.sku) return tally('NOT_PRICED_AS_A_MODEL');
    if (generation.ordinal < requestYear - DISCOVERY_FLOOR_YEARS) return tally('NOT_CURRENT');
    // Never older than the original itself, when the grammar dates the original.
    if (lineage.original && Number.isFinite(lineage.original.ordinal) && generation.ordinal < lineage.original.ordinal) return tally('OLDER_THAN_ORIGINAL');
    if (screened.items.length < MIN_DISCOVERY_SELLERS) return tally('TOO_FEW_SELLERS');
    const type = agreedDisplayType(screened.displayTitles) || displayTypeOf(candidate.name);
    const display = displayRank(originalDisplay, type);
    if (display === null) return tally(displayFamilyOf(type) === displayFamilyOf(originalDisplay) ? 'LOWER_DISPLAY_TYPE' : 'OTHER_DISPLAY_FAMILY');
    tally('QUALIFIED');
    // The display-class row the titles settle (MEETS or EXCEEDS), as an estimate like every other candidate's, so the comparison shown is not empty and the
    // valuation sees the same row; with either type unknown no row is stated.
    const status = settledDisplayStatus(originalDisplay, type);
    const comparison = status ? [{ requirementKey: 'displayClass', status }] : [];
    qualified.push({ candidate: { ...candidate, comparison, why: WHY(size, generation.ordinal, lineage.sameSeries) }, screened, lineage, display, ordinal: generation.ordinal, sellers: screened.items.length, order });
  });
  qualified.sort((a, b) => a.display - b.display || b.ordinal - a.ordinal || b.sellers - a.sellers || a.order - b.order);
  const best = qualified[0] || null;
  const diagnostics = { seriesSeen: Object.values(verdicts).reduce((sum, count) => sum + count, 0), verdicts, chosen: best ? best.screened.generation.label : null };
  return best ? { candidate: best.candidate, screened: best.screened, lineage: best.lineage, diagnostics } : { candidate: null, diagnostics };
}

/** The key ("<grammar>:<series>") of a candidate's series, for `exclude`, or null when it has none. */
export const seriesKeyOf = (lineage) => (lineage ? `${lineage.grammar.id}:${lineage.series}` : null);
