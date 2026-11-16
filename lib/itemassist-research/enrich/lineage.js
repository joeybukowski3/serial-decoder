import { focusTokens } from './product-tokens.js';

/**
 * Product lineage for ItemAssist Research: which generation of a series a listing, the original and a candidate belong to.
 *
 * Generation is read from the model names makers actually print, by code, never from the model's memory. A maker's naming convention is a
 * small GRAMMAR: it knows that LG "OLED55C6PUA" is the 55-inch C-series, generation 6, and that Samsung "QN65S90HAEXZA" is the 65-inch S90 series,
 * generation H. A grammar exists only for a maker and a category it has been written and tested for (television today). Every other maker or
 * category has none, and nothing here is guessed for them: a candidate with no grammar stays a family, exactly as before.
 *
 * Pure; no network. The AI's generation (if any) is a hypothesis; this module only ever compares it with what listings state.
 */

const up = (text) => String(text || '').toUpperCase();
const SIZE_OK = (value) => Number.isFinite(value) && value >= 12 && value <= 120;

// A generation is ordered by its MODEL YEAR, never by the digit or letter itself: those wrap (LG C9 is 2019 and C1 is 2021; Samsung T is 2020 and A is
// 2021), so comparing them as numbers would rank an old-stock C9 or Q80T above a current model. A code whose year cannot be read is not guessed.
const currentYear = (year) => (Number.isInteger(year) ? year : new Date().getUTCFullYear());
/** LG's generation digit (C3, G4) is the model year 2020 + digit; a year after the reference year is the previous decade (C9 = 2019, not 2029). */
const lgYear = (digit, reference) => { const year = 2020 + digit; return year > currentYear(reference) ? year - 10 : year; };
/**
 * Samsung's television model-year letter (the letter after the S/Q-series number: QN65S90H..., QN55Q80C...) and the year it names. Letters not in this table
 * are not read.
 *
 * It holds exactly what the classic replacement pipeline's registry holds (lib/replacement-discovery/retrieval-first.js: R, C, D, F, plus the legacy dating letters
 * T, A, B, H), and a test (tests/api/itemassist-research-samsung-years.test.mjs) fails if the two ever differ. Evidence: that registry, a Samsung US product page scoping
 * the Q60R to 2019, and H observed live on samsung.com/us. E and G are not used in these lines.
 *
 * N (2018) is deliberately absent. The only mention in this repository is a parenthetical in a Q60R note whose cited page evidences R = 2019 only, and the
 * 2018 N-suffix sets used one-digit series (Q7FN, Q9FN) that this two-digit-series grammar cannot reach, so N could only fire on a model that does not exist.
 * Letters that repeat across decades (D, F, H were also 2011-2014 letters in UN55D6000, UN55F6400, UN55H6350) never reach the table: those older shapes have
 * no S/Q two-digit series.
 */
export const SAMSUNG_TV_MODEL_YEAR = Object.freeze({ R: 2019, T: 2020, A: 2021, B: 2022, C: 2023, D: 2024, F: 2025, H: 2026 });
/** The letters in release order: by year, not alphabetically (A, 2021, follows T, 2020). */
export const SAMSUNG_TV_LETTER_ORDER = Object.freeze(Object.keys(SAMSUNG_TV_MODEL_YEAR).sort((a, b) => SAMSUNG_TV_MODEL_YEAR[a] - SAMSUNG_TV_MODEL_YEAR[b]));
/** The model year a letter names, or null for any letter the table does not hold (only own properties are letters). */
export const samsungTvYear = (letter) => (typeof letter === 'string' && Object.hasOwn(SAMSUNG_TV_MODEL_YEAR, letter) ? SAMSUNG_TV_MODEL_YEAR[letter] : null);
const samsungYear = samsungTvYear;
// A series code is not read out of a longer token (HW-Q60D is a soundbar, QN90F a different Neo QLED series).
const NOT_AFTER = '(?<![A-Z0-9-])';

/**
 * Model-year letters of three more naming schemes (Release 3b). Every letter here has at least one source that states the model year of a specific model
 * printed with it; a letter with no such source, or with sources that disagree, is absent and reads as "unknown" (see docs/itemassist-research-lineage.md,
 * "Model-year rules (Release 3b)", for each source). Nothing is extrapolated from the alphabet.
 *
 * Samsung UHD / Crystal UHD, letter first (UN55JU6700F, UN55DU7200FXZA): the letter before "U". K (2016) is absent: no model-specific source was found.
 */
export const SAMSUNG_UHD_YEAR = Object.freeze({ J: 2015, M: 2017, N: 2018, R: 2019, T: 2020, A: 2021, B: 2022, C: 2023, D: 2024 });
/** LG UHD (LED/LCD), size first (55UR8000AUA, 55UT7570PUB, 75UA7700PUA): the letter after "U". M (2019) and earlier are absent. */
export const LG_UHD_YEAR = Object.freeze({ N: 2020, P: 2021, Q: 2022, R: 2023, T: 2024, A: 2025 });
/**
 * Sony LED and OLED with a year suffix (KD-55X80K, XR-65A80L, KD-55X7500H): the last letter. Sony's 2024-and-later names (K-55S30, K-65XR80, K-55XR8M2) carry no
 * year letter, and the two-letter "W" suffix (KD-55X75WL) is dated differently by Sony's own pages (2022 and 2023), so neither is read.
 */
export const SONY_TV_YEAR = Object.freeze({ H: 2020, J: 2021, K: 2022, L: 2023 });
const yearIn = (table, letter) => (typeof letter === 'string' && Object.hasOwn(table, letter) ? table[letter] : null);

// ---- television grammars -----------------------------------------------------------------------------------------------------------------

const LG_OLED = Object.freeze({
  id: 'lg-oled', brand: 'lg',
  sku: /\bOLED(\d{2,3})([BCGMZ])(\d)([A-Z0-9]{1,5})\b/,
  marketing: new RegExp(NOT_AFTER + '([BCGMZ])(\\d)(?![A-Z0-9])'),
  seriesWord: new RegExp(NOT_AFTER + '([BCGMZ])\\s?-?\\s?SERIES\\b'),
  /** What a listing title says: series, generation (as a model year), the size embedded in a full model code, and that code. Null when it states none. */
  parse(title, reference) {
    const text = up(title);
    const sku = this.sku.exec(text);
    if (sku) return { series: sku[2], ordinal: lgYear(Number(sku[3]), reference), label: sku[2] + sku[3], size: SIZE_OK(Number(sku[1])) ? Number(sku[1]) : null, sku: sku[0] };
    const named = this.marketing.exec(text);
    // A bare "C6" is a generation only beside the OLED name: it is not read out of arbitrary text.
    return named && /\bOLED\b/.test(text) ? { series: named[1], ordinal: lgYear(Number(named[2]), reference), label: named[1] + named[2], size: null, sku: null } : null;
  },
  /** The series (and generation, if written) a name or token refers to: "C-series" -> C, "C4" -> C + 2024, "OLED55C6PUA" -> C + 2026. */
  seriesOf(text, reference) {
    const upper = up(text);
    const sku = this.sku.exec(upper);
    if (sku) return { series: sku[2], ordinal: lgYear(Number(sku[3]), reference), label: sku[2] + sku[3] };
    const named = this.marketing.exec(upper);
    if (named) return { series: named[1], ordinal: lgYear(Number(named[2]), reference), label: named[1] + named[2] };
    const word = this.seriesWord.exec(upper);
    return word ? { series: word[1], ordinal: null, label: null } : null;
  },
  /** The name with its generation replaced by `label` ("LG C-series OLED" / "LG C4 OLED" -> "LG C6 OLED"). */
  rename(name, label) {
    const text = String(name);
    if (this.seriesWord.test(up(text))) return text.replace(/(?<![A-Za-z0-9-])[BCGMZ]\s?-?\s?series\b/i, label);
    return text.replace(/(?<![A-Za-z0-9-])[BCGMZ]\d(?![A-Za-z0-9])/i, label);
  },
  /** The name with its generation removed, as a series ("LG C4 OLED" -> "LG C-series OLED"): a Shopping query that spans generations. */
  generalise(name, series) { return String(name).replace(/(?<![A-Za-z0-9-])[BCGMZ]\d(?![A-Za-z0-9])/i, series + '-series'); },
});

const SAMSUNG_TV = Object.freeze({
  id: 'samsung-tv', brand: 'samsung',
  sku: /\b(?:QN|QE|UN)(\d{2,3})([SQ])(\d{2})([A-Z])([A-Z0-9]{0,8})\b/,
  marketing: new RegExp(NOT_AFTER + '([SQ]\\d{2})([A-Z])(?![A-Z0-9])'),
  seriesWord: new RegExp(NOT_AFTER + '([SQ]\\d{2})\\s?-?\\s?SERIES\\b'),
  bareSeries: new RegExp(NOT_AFTER + '([SQ]\\d{2})(?![A-Z0-9])'),
  parse(title) {
    const text = up(title);
    const sku = this.sku.exec(text);
    if (sku) {
      const year = samsungYear(sku[4]);
      return year === null ? null : { series: sku[2] + sku[3], ordinal: year, label: sku[2] + sku[3] + sku[4], size: SIZE_OK(Number(sku[1])) ? Number(sku[1]) : null, sku: sku[0] };
    }
    const named = this.marketing.exec(text);
    const year = named ? samsungYear(named[2]) : null;
    return named && year !== null ? { series: named[1], ordinal: year, label: named[1] + named[2], size: null, sku: null } : null;
  },
  seriesOf(text) {
    const upper = up(text);
    const sku = this.sku.exec(upper);
    if (sku) { const year = samsungYear(sku[4]); return year === null ? null : { series: sku[2] + sku[3], ordinal: year, label: sku[2] + sku[3] + sku[4] }; }
    const named = this.marketing.exec(upper);
    if (named) { const year = samsungYear(named[2]); return year === null ? null : { series: named[1], ordinal: year, label: named[1] + named[2] }; }
    const word = this.seriesWord.exec(upper) || this.bareSeries.exec(upper);
    return word ? { series: word[1], ordinal: null, label: null } : null;
  },
  rename(name, label) {
    const text = String(name);
    if (this.seriesWord.test(up(text))) return text.replace(/(?<![A-Za-z0-9-])[SQ]\d{2}\s?-?\s?series\b/i, label);
    if (this.marketing.test(up(text))) return text.replace(/(?<![A-Za-z0-9-])[SQ]\d{2}[A-Z](?![A-Za-z0-9])/i, label);
    return text.replace(/(?<![A-Za-z0-9-])[SQ]\d{2}(?![A-Za-z0-9])/i, label);
  },
  generalise(name, series) { return String(name).replace(/(?<![A-Za-z0-9-])[SQ]\d{2}[A-Z](?![A-Za-z0-9])/i, series + '-series'); },
});

/**
 * A grammar for a scheme where a model's series is a number and its generation is a year letter, read from a full model code, a marketing name, or a bare
 * series. `codes`, `names` and `bare` are lists of { pattern, read(match) -> {series, letter, label, size?, sku?} }. A letter the year table does not hold
 * makes the code, name or title state nothing (unknown), never a guessed year. Its names keep the generation the model named in the Shopping query
 * (`generalise` returns the name unchanged), so the queries these makers get are the same as before Release 3b.
 */
function yearLetterGrammar({ id, brand, table, codes, names, bare }) {
  const first = (list, text) => { for (const entry of list) { const found = entry.pattern.exec(text); if (found) return entry.read(found); } return null; };
  const dated = (read) => {
    if (!read) return null;
    const year = yearIn(table, read.letter);
    return year === null ? null : { series: read.series, ordinal: year, label: read.label };
  };
  return Object.freeze({
    // The listing screen lets this grammar's own reading of a row's series decide series membership (see listings.js).
    id, brand, seriesByGrammar: true,
    /** The series of a code or name this scheme recognises but cannot date (an unsourced letter), or null. Such a row is counted, never priced. */
    unread(title) {
      const text = up(title);
      const raw = first(codes, text) || first(names, text);
      return raw && yearIn(table, raw.letter) === null ? { series: raw.series } : null;
    },
    parse(title) {
      const text = up(title);
      const code = first(codes, text);
      if (code) { const read = dated(code); return read ? { ...read, size: SIZE_OK(code.size) ? code.size : null, sku: code.sku } : null; }
      const named = dated(first(names, text));
      return named ? { ...named, size: null, sku: null } : null;
    },
    seriesOf(text) {
      const upper = up(text);
      const code = first(codes, upper) || first(names, upper);
      if (code) return dated(code);
      const series = first(bare, upper);
      return series ? { series: series.series, ordinal: null, label: null } : null;
    },
    rename(name, label) {
      const text = String(name);
      // "X80-series" or "UR8000-series" names the series: it becomes the generation ("X80L", "UT8000"), not "X80L-series".
      for (const entry of [...bare, ...names]) {
        const word = new RegExp(`${entry.pattern.source.replace(/\(\?!\[A-Z0-9\]\)$/, '')}\\s?-?\\s?SERIES\\b`, 'i');
        if (word.test(text)) return text.replace(word, label);
      }
      for (const entry of [...names, ...bare]) {
        const pattern = new RegExp(entry.pattern.source, 'i');
        if (pattern.test(text)) return text.replace(pattern, label);
      }
      return text;
    },
    generalise(name) { return String(name); },
  });
}

/**
 * Samsung UHD / Crystal UHD: UN + size + year letter + U + four digits (UN55JU6700F, UN55DU7200FXZA), and from 2025 UN + size + U + four digits + year letter
 * (UN55U8000FFXZA, using the S/Q table's F; H, 2026, has no model-specific source in this shape and reads as unknown). The series is the four digits (8000
 * in AU8000, BU8000, CU8000, DU8000 and U8000F).
 */
const SAMSUNG_UHD = yearLetterGrammar({
  id: 'samsung-uhd', brand: 'samsung', table: { ...SAMSUNG_UHD_YEAR, F: SAMSUNG_TV_MODEL_YEAR.F },
  codes: [
    { pattern: /\bUN(\d{2,3})([A-Z])U(\d{4})([A-Z0-9]{0,8})\b/, read: (m) => (m[2] === 'F' || m[2] === 'H' ? null : { series: m[3], letter: m[2], label: `${m[2]}U${m[3]}`, size: Number(m[1]), sku: m[0] }) },
    { pattern: /\bUN(\d{2,3})U(\d{4})([FH])([A-Z0-9]{0,8})\b/, read: (m) => ({ series: m[2], letter: m[3], label: `U${m[2]}${m[3]}`, size: Number(m[1]), sku: m[0] }) },
  ],
  names: [
    { pattern: new RegExp(NOT_AFTER + '([JMNRTABCD])U(\\d{4})(?![A-Z0-9])'), read: (m) => ({ series: m[2], letter: m[1], label: `${m[1]}U${m[2]}` }) },
    { pattern: new RegExp(NOT_AFTER + 'U(\\d{4})([FH])(?![A-Z0-9])'), read: (m) => ({ series: m[1], letter: m[2], label: `U${m[1]}${m[2]}` }) },
  ],
  bare: [{ pattern: new RegExp(NOT_AFTER + 'U(\\d{4})(?![A-Z0-9])'), read: (m) => ({ series: m[1] }) }],
});

/**
 * LG UHD (LED/LCD): size + U + year letter + four digits + suffix (55UR8000AUA, 55UT7570PUB, 75UA7700PUA). The series is the first two digits (80 in UR8000 and
 * UT8000, 75 in UQ7570 and UT7570), which is also the marketing name's number (UT75, UA77).
 */
const LG_UHD = yearLetterGrammar({
  id: 'lg-uhd', brand: 'lg', table: LG_UHD_YEAR,
  codes: [{ pattern: /\b(\d{2,3})U([A-Z])(\d{2})(\d{2})([A-Z]{3}[A-Z0-9]?)\b/, read: (m) => ({ series: m[3], letter: m[2], label: `U${m[2]}${m[3]}${m[4]}`, size: Number(m[1]), sku: m[0] }) }],
  names: [{ pattern: new RegExp(NOT_AFTER + 'U([NPQRTA])(\\d{2})(\\d{2})?(?![A-Z0-9])'), read: (m) => ({ series: m[2], letter: m[1], label: `U${m[1]}${m[2]}${m[3] || ''}` }) }],
  bare: [],
});

/**
 * Sony LED (X) and OLED (A) with a year suffix: KD/XR/XBR + size + series + year letter (KD-55X80K, XR-65A80L, KD-55X7500H). The series is the letter and the
 * first two digits (X80, X75, A80). A two-letter suffix (X75WL) and the 2024-and-later names (K-55S30, K-65XR80) state no year here.
 */
const SONY_TV = yearLetterGrammar({
  id: 'sony-tv', brand: 'sony', table: SONY_TV_YEAR,
  codes: [{ pattern: /\b(?:KD|XR|XBR)-?(\d{2,3})([XA]\d{2})(\d{2})?([A-Z])\b/, read: (m) => ({ series: m[2], letter: m[4], label: `${m[2]}${m[3] || ''}${m[4]}`, size: Number(m[1]), sku: m[0].replace('-', '') }) }],
  names: [{ pattern: new RegExp(NOT_AFTER + '([XA]\\d{2})(\\d{2})?([HJKL])(?![A-Z0-9])'), read: (m) => ({ series: m[1], letter: m[3], label: `${m[1]}${m[2] || ''}${m[3]}` }) }],
  bare: [{ pattern: new RegExp(NOT_AFTER + '([XA]\\d{2})(?![A-Z0-9])'), read: (m) => ({ series: m[1] }) }],
});

/** Grammars by category, then maker. A category with no entry has no generation parsing at all. A maker may have more than one scheme; the first that reads a name wins. */
const GRAMMARS = Object.freeze({ tv: Object.freeze([LG_OLED, SAMSUNG_TV, LG_UHD, SAMSUNG_UHD, SONY_TV]) });

/** The maker a text starts with ("LG C3 55-inch TV" -> "lg"), or '' when it does not start with a word. */
export const brandOf = (text) => (/^\s*([A-Za-z][A-Za-z&]*)/.exec(String(text || '')) || [, ''])[1].toLowerCase();

/** The grammar of a maker (by brandOf) that reads `text` ("LG UR8000" -> LG UHD, "LG C4" -> LG OLED), or null when none of the maker's grammars reads it. */
const grammarReading = (grammars, brand, text, reference) => grammars.find((grammar) => grammar.brand === brand && grammar.seriesOf(text, reference)) || null;

/**
 * The television grammar of a maker (by brandOf), or null when there is none. With `text`, the maker's grammar that reads it (a maker may have several
 * schemes: LG OLED and LG UHD); without it, or when none reads it, the maker's first grammar.
 */
export const tvGrammarFor = (brand, text = null) => (text ? grammarReading(GRAMMARS.tv, brand, text, 0) : null) || GRAMMARS.tv.find((grammar) => grammar.brand === brand) || null;

/**
 * The grammar and series for a candidate, relative to the original, or null when there is no grammar for this category and maker or the
 * candidate's name carries no series. `original` is the original's own generation (from the user's words, then the identification) when it is
 * the same maker; `sameSeries` is true only when the original is the same series as the candidate.
 */
export function resolveLineage({ category, query, identity = '', originalHint = '', candidateName, now = Date.now() }) {
  const grammars = Object.hasOwn(GRAMMARS, category) ? GRAMMARS[category] : null;
  if (!grammars) return null;
  const reference = new Date(now).getUTCFullYear();
  const brand = brandOf(candidateName);
  const grammar = grammarReading(grammars, brand, candidateName, reference);
  if (!grammar) return null;
  const named = grammar.seriesOf(candidateName, reference);
  const originalBrand = grammars.some((entry) => entry.brand === brandOf(query)) ? brandOf(query) : brandOf(identity);
  let original = null;
  if (originalBrand === brand) {
    // The user's own model tokens first ("C3"), then the identification's wording, then the model's stated generation.
    const sources = [...focusTokens(query), identity, originalHint].filter(Boolean);
    for (const source of sources) {
      const found = grammar.seriesOf(source, reference);
      if (found && found.ordinal !== null) { original = found; break; }
    }
  }
  const sameSeries = Boolean(original && original.series === named.series);
  return {
    grammar, brand, reference, parse: (title) => grammar.parse(title, reference), unread: (title) => (grammar.unread ? grammar.unread(title) : null),
    series: named.series, hypothesisOrdinal: named.ordinal, hypothesisLabel: named.label,
    original, sameSeries, originalOrdinal: sameSeries ? original.ordinal : null,
  };
}

/** The Shopping query's name: a generation the model named is dropped to its series, so the rows span generations and the listings, not the model, decide. */
export const generalisedName = (name, lineage) => (lineage && lineage.hypothesisOrdinal !== null ? lineage.grammar.generalise(name, lineage.series) : String(name));

// ---- generation census ---------------------------------------------------------------------------------------------------------------------

/**
 * Chooses the generation to present from what the listings state.
 *
 * `groups` maps a generation's ordinal to what was seen of it, as built by the listing screen:
 *   { label, ordinal, series, sized: number (rows of the requested size from the candidate's maker, whether or not they can set a price: a bundle, a
 *     protection plan or an unlisted seller still shows the model exists in that size), priced: number (of those, the new, single-unit rows from a
 *     recognised seller that can set a price), essential: number (rows set aside for failing an essential requirement), otherSize: number }
 * Only generations after the original's are offered when the candidate is the original's own series; another series is offered whole.
 *
 * `named` is the newest generation that has a listing in the requested size: that is the candidate, priced only if `priced` says some listing can set
 * a price. An older generation is presented only when the newer one has no listing in the requested size or its listings fail an essential requirement
 * (`skipped` says which); a newer generation is never skipped merely because its listings are bundles or from unlisted sellers.
 */
export function chooseGeneration(groups, lineage) {
  const floor = lineage.sameSeries && lineage.originalOrdinal !== null ? lineage.originalOrdinal : -Infinity;
  const offered = [...groups.values()].filter((group) => group.ordinal > floor).sort((a, b) => b.ordinal - a.ordinal);
  const named = offered.find((group) => group.sized > 0) || null;
  const priced = named && named.priced > 0 ? named : null;
  const newest = offered[0] || null;
  let skipped = null;
  if (newest && (!named || newest.ordinal > named.ordinal)) {
    skipped = { label: newest.label, reason: newest.otherSize > 0 ? 'SIZE' : newest.essential > 0 ? 'ESSENTIAL' : 'NO_SIZED_LISTING' };
  }
  return { priced, named, newest, skipped, offered };
}

const SKIP_NOTE = Object.freeze({
  SIZE: (label, size) => `A newer generation (${label}) was seen in listings, but not in the requested ${size ? `${size}-inch ` : ''}size.`,
  ESSENTIAL: (label) => `A newer generation (${label}) was seen, but its listings did not meet an essential requirement.`,
  NO_SIZED_LISTING: (label) => `A newer generation (${label}) was seen in listings, but none stated the requested size.`,
});
const UNPRICED_NOTE = 'No clean listing of this model in the requested size was found (the listings were bundles, plans or unlisted sellers), so no price is attached.';

/** The concern that states why the newest generation seen is not the one presented (fixed wording, a label and a size only). */
export const skippedNote = (skipped, size) => (skipped ? SKIP_NOTE[skipped.reason](skipped.label, size) : null);

/** The concern that states a presented model has no price because no clean listing of it exists in the requested size. */
export const unpricedNote = (generation) => (generation && !generation.priced ? UNPRICED_NOTE : null);

/**
 * The name the presented candidate is given once a generation is chosen: the model's family name with its generation set to the one the listings
 * state, the requested size, and the model code when a priced listing names one. A comma suffix ("next generation") is dropped.
 */
export function presentedName(name, lineage, label, { size = null, sku = null } = {}) {
  const base = lineage.grammar.rename(String(name).replace(/,.*$/, '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim(), label);
  const sized = size && !/\b\d{2,3}[- ]?inch\b/i.test(base) ? `${base} ${size}-inch` : base;
  const full = sku ? `${sized} (${sku})` : sized;
  if (full.length <= 70) return full;
  return sku ? `${base} (${sku})`.slice(0, 70) : base.slice(0, 70);
}

/**
 * The `lineage` block of a candidate (research.2, additive), or null when it would say nothing: its relation to the original, the generation it is
 * presented as, where that generation came from, and the AI's own estimate of its market tier. `relation` is lineage only: it is neither comparability
 * (the comparison rows) nor evidence confidence (the model status). `generation` is `{label, ordinal}`: from listings (basis LISTINGS) or the
 * model's hypothesis (AI_HYPOTHESIS, never used to filter or price anything).
 */
export function lineageBlock({ lineage, candidateBrand, originalBrand, generation, basis, tier = 'UNKNOWN', newest = null }) {
  const TIERS = ['SAME', 'HIGHER', 'LOWER', 'UNKNOWN'];
  const block = (relation, label, source) => {
    const out = { relation, generation: label || null, basis: label ? source : 'NONE', tier: TIERS.includes(tier) ? tier : 'UNKNOWN' };
    return out.relation === 'UNKNOWN' && !out.generation && out.tier === 'UNKNOWN' ? null : out;
  };
  const label = generation ? generation.label : null;
  const differentBrand = Boolean(candidateBrand && originalBrand && candidateBrand !== originalBrand);
  if (differentBrand) return block('OTHER_BRAND', label, basis);
  if (!lineage) return block('UNKNOWN', label, basis);
  // Another series of the same maker only when the original's series is known; with no generation read for the original, "newer" is not claimed either.
  if (!lineage.sameSeries) return block(lineage.original ? 'SAME_BRAND_OTHER_SERIES' : 'UNKNOWN', label, basis);
  if (generation && lineage.originalOrdinal !== null && generation.ordinal > lineage.originalOrdinal) {
    return block(newest && newest.ordinal > generation.ordinal ? 'SAME_SERIES_OLDER' : 'SAME_SERIES_NEWER', label, basis);
  }
  return block('UNKNOWN', label, basis);
}
