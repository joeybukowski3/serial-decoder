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
/** A letter generation (Samsung's model-year letter) as a number so "C" < "D" < "H". */
const letterOrdinal = (letter) => letter.charCodeAt(0) - 64;
const SIZE_OK = (value) => Number.isFinite(value) && value >= 12 && value <= 120;

// ---- television grammars -----------------------------------------------------------------------------------------------------------------

const LG_OLED = Object.freeze({
  id: 'lg-oled', brand: 'lg',
  sku: /\bOLED(\d{2,3})([BCGMZ])(\d)([A-Z0-9]{2,5})\b/,
  marketing: /(?<![A-Z0-9])([BCGMZ])(\d)(?![A-Z0-9])/,
  seriesWord: /(?<![A-Z0-9])([BCGMZ])\s?-?\s?SERIES\b/,
  /** What a listing title says: series, generation, the size embedded in a full model code, and that code. Null when it states none. */
  parse(title) {
    const text = up(title);
    const sku = this.sku.exec(text);
    if (sku) return { series: sku[2], ordinal: Number(sku[3]), label: sku[2] + sku[3], size: SIZE_OK(Number(sku[1])) ? Number(sku[1]) : null, sku: sku[0] };
    const named = this.marketing.exec(text);
    // A bare "C6" is a generation only beside the OLED name: it is not read out of arbitrary text.
    return named && /\bOLED\b/.test(text) ? { series: named[1], ordinal: Number(named[2]), label: named[1] + named[2], size: null, sku: null } : null;
  },
  /** The series (and generation, if written) a name or token refers to: "C-series" -> C, "C4" -> C + 4, "OLED55C6PUA" -> C + 6. */
  seriesOf(text) {
    const upper = up(text);
    const sku = this.sku.exec(upper);
    if (sku) return { series: sku[2], ordinal: Number(sku[3]), label: sku[2] + sku[3] };
    const named = this.marketing.exec(upper);
    if (named) return { series: named[1], ordinal: Number(named[2]), label: named[1] + named[2] };
    const word = this.seriesWord.exec(upper);
    return word ? { series: word[1], ordinal: null, label: null } : null;
  },
  /** The name with its generation replaced by `label` ("LG C-series OLED" / "LG C4 OLED" -> "LG C6 OLED"). */
  rename(name, label) {
    const text = String(name);
    if (this.seriesWord.test(up(text))) return text.replace(/(?<![A-Za-z0-9])[BCGMZ]\s?-?\s?series\b/i, label);
    return text.replace(/(?<![A-Za-z0-9])[BCGMZ]\d(?![A-Za-z0-9])/i, label);
  },
  /** The name with its generation removed, as a series ("LG C4 OLED" -> "LG C-series OLED"): a Shopping query that spans generations. */
  generalise(name, series) { return String(name).replace(/(?<![A-Za-z0-9])[BCGMZ]\d(?![A-Za-z0-9])/i, `${series}-series`); },
});

const SAMSUNG_TV = Object.freeze({
  id: 'samsung-tv', brand: 'samsung',
  sku: /\b(?:QN|QE|UN)(\d{2,3})([SQ])(\d{2})([A-Z])([A-Z0-9]{0,8})\b/,
  marketing: /(?<![A-Z0-9])([SQ]\d{2})([A-Z])(?![A-Z0-9])/,
  seriesWord: /(?<![A-Z0-9])([SQ]\d{2})\s?-?\s?SERIES\b/,
  parse(title) {
    const text = up(title);
    const sku = this.sku.exec(text);
    if (sku) return { series: sku[2] + sku[3], ordinal: letterOrdinal(sku[4]), label: sku[2] + sku[3] + sku[4], size: SIZE_OK(Number(sku[1])) ? Number(sku[1]) : null, sku: sku[0] };
    const named = this.marketing.exec(text);
    return named ? { series: named[1], ordinal: letterOrdinal(named[2]), label: named[1] + named[2], size: null, sku: null } : null;
  },
  seriesOf(text) {
    const upper = up(text);
    const sku = this.sku.exec(upper);
    if (sku) return { series: sku[2] + sku[3], ordinal: letterOrdinal(sku[4]), label: sku[2] + sku[3] + sku[4] };
    const named = this.marketing.exec(upper);
    if (named) return { series: named[1], ordinal: letterOrdinal(named[2]), label: named[1] + named[2] };
    const word = this.seriesWord.exec(upper);
    return word ? { series: word[1], ordinal: null, label: null } : null;
  },
  rename(name, label) {
    const text = String(name);
    if (this.seriesWord.test(up(text))) return text.replace(/(?<![A-Za-z0-9])[SQ]\d{2}\s?-?\s?series\b/i, label);
    return text.replace(/(?<![A-Za-z0-9])[SQ]\d{2}[A-Z](?![A-Za-z0-9])/i, label);
  },
  generalise(name, series) { return String(name).replace(/(?<![A-Za-z0-9])[SQ]\d{2}[A-Z](?![A-Za-z0-9])/i, `${series}-series`); },
});

/** Grammars by category, then maker. A category with no entry has no generation parsing at all. */
const GRAMMARS = Object.freeze({ tv: Object.freeze([LG_OLED, SAMSUNG_TV]) });

/** The maker a text starts with ("LG C3 55-inch TV" -> "lg"), or '' when it does not start with a word. */
export const brandOf = (text) => (/^\s*([A-Za-z][A-Za-z&]*)/.exec(String(text || '')) || [, ''])[1].toLowerCase();

/**
 * The grammar and series for a candidate, relative to the original, or null when there is no grammar for this category and maker or the
 * candidate's name carries no series. `original` is the original's own generation (from the user's words, then the identification) when it is
 * the same maker; `sameSeries` is true only when the original is the same series as the candidate.
 */
export function resolveLineage({ category, query, identity = '', originalHint = '', candidateName }) {
  const grammars = GRAMMARS[category];
  if (!grammars) return null;
  const brand = brandOf(candidateName);
  const grammar = grammars.find((entry) => entry.brand === brand);
  if (!grammar) return null;
  const named = grammar.seriesOf(candidateName);
  if (!named) return null;
  const originalBrand = grammars.some((entry) => entry.brand === brandOf(query)) ? brandOf(query) : brandOf(identity);
  let original = null;
  if (originalBrand === brand) {
    // The user's own model tokens first ("C3"), then the identification's wording, then the model's stated generation.
    const sources = [...focusTokens(query), identity, originalHint].filter(Boolean);
    for (const source of sources) {
      const found = grammar.seriesOf(source);
      if (found && found.ordinal !== null) { original = found; break; }
    }
  }
  const sameSeries = Boolean(original && original.series === named.series);
  return {
    grammar, brand, series: named.series, hypothesisOrdinal: named.ordinal, hypothesisLabel: named.label,
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
  if (!lineage.sameSeries) return block(originalBrand && candidateBrand === originalBrand ? 'SAME_BRAND_OTHER_SERIES' : 'UNKNOWN', label, basis);
  if (generation && lineage.originalOrdinal !== null && generation.ordinal > lineage.originalOrdinal) {
    return block(newest && newest.ordinal > generation.ordinal ? 'SAME_SERIES_OLDER' : 'SAME_SERIES_NEWER', label, basis);
  }
  return block('UNKNOWN', label, basis);
}
