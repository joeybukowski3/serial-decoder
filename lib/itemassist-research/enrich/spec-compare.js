/**
 * An evidence-supported comparison of a television candidate with the original, attribute by attribute.
 *
 * A value is established only from text that states it: the person's own words, a manufacturer page's result title, or the titles of retailer listings. A listing
 * title is the seller's wording, not the manufacturer's specification, and is labelled that way. Nothing is inferred from a model generation ("newer, so
 * faster"), nothing is taken from the model's own reply, and an attribute no source states is "not established", never a guess. Two sources that state different
 * values for one side leave that side not established (the conflict is not resolved by picking one).
 */

export const SPEC_ATTRIBUTES = Object.freeze(['SCREEN_SIZE', 'DISPLAY_CLASS', 'RESOLUTION', 'REFRESH_RATE', 'DOLBY_VISION', 'HDMI_2_1']);
/** Always shown. The rest are shown only when a source states them for at least one side. */
export const CORE_ATTRIBUTES = Object.freeze(['SCREEN_SIZE', 'DISPLAY_CLASS', 'RESOLUTION', 'REFRESH_RATE']);
export const SPEC_BASES = Object.freeze(['USER_STATED', 'MANUFACTURER_PAGE_TITLE', 'LISTING_TITLE']);
export const SPEC_RESULTS = Object.freeze(['MATCH', 'DIFFERENT', 'NOT_ESTABLISHED']);
/** The value shapes the contract accepts for each attribute. */
export const VALUE_SHAPES = Object.freeze({
  SCREEN_SIZE: /^\d{2,3}-inch$/, DISPLAY_CLASS: /^(?:OLED|QD-OLED|QLED|Mini-LED|LED)$/, RESOLUTION: /^(?:4K|8K|1080p)$/, REFRESH_RATE: /^(?:60|100|120|144|165|240) Hz$/,
  DOLBY_VISION: /^Dolby Vision$/, HDMI_2_1: /^HDMI 2\.1$/,
});
const BASIS_RANK = Object.freeze({ USER_STATED: 0, MANUFACTURER_PAGE_TITLE: 1, LISTING_TITLE: 2 });
const REFRESH_RATES = new Set([60, 100, 120, 144, 165, 240]);
// A title that denies a feature ("no HDMI 2.1", "not Dolby Vision") has not stated it.
const NEGATED = /\b(?:no|not|without|non|lacks?)[- ]+(?:dolby vision|hdmi\s?2\.1)/i;
// A query that says what the person wants (a replacement) is not a description of what they have.
const WISH = /\b(?:want|wants|need|needs|looking for|prefer|would like|must have|should have|at least|minimum|upgrade to|replace(?:ment)? with|instead)\b/i;

const unique = (values) => [...new Set(values.filter((value) => value !== null))];
const only = (values) => { const found = unique(values); return found.length === 1 ? found[0] : null; };

/** What one text states, per attribute (null where it states nothing, or states two different things). `codeSize` is a screen size the model code itself states. */
export function factsOf(text, codeSize = null) {
  const title = String(text || '');
  const sizes = unique([...title.matchAll(/(?<![\d.])(\d{2,3})\s?(?:"|”|-?\s?inch(?:es)?\b|in\b)/gi)].map((match) => Number(match[1])).filter((value) => value >= 24 && value <= 100).concat(codeSize ? [codeSize] : []));
  const display = unique([
    /\bQD-?\s?OLED\b/i.test(title) ? 'QD-OLED' : null, /\bOLED(?![A-Za-z])/i.test(title) && !/\bQD-?\s?OLED\b/i.test(title) ? 'OLED' : null,
    /\b(?:neo )?QLED\b/i.test(title) ? 'QLED' : null, /\bmini[- ]?LED\b/i.test(title) ? 'Mini-LED' : null,
  ]);
  const plainLed = display.length === 0 && /\bLED\b/i.test(title) ? ['LED'] : [];
  const resolution = unique([/\b(?:4k|uhd|2160p)\b/i.test(title) ? '4K' : null, /\b8k\b/i.test(title) ? '8K' : null, /\b(?:1080p|full[- ]?hd)\b/i.test(title) ? '1080p' : null]);
  // "120/144Hz" states two rates, so it states neither.
  const rates = unique([...title.matchAll(/(?<![\d.])((?:\d{2,3}\s?\/\s?)*\d{2,3})\s?hz\b/gi)].flatMap((match) => match[1].split('/').map((part) => Number(part.trim()))).filter((value) => REFRESH_RATES.has(value)));
  return {
    SCREEN_SIZE: sizes.length === 1 ? `${sizes[0]}-inch` : null,
    DISPLAY_CLASS: display.length + plainLed.length === 1 ? [...display, ...plainLed][0] : null,
    RESOLUTION: resolution.length === 1 ? resolution[0] : null,
    REFRESH_RATE: rates.length === 1 ? `${rates[0]} Hz` : null,
    DOLBY_VISION: /\bdolby vision\b/i.test(title) && !NEGATED.test(title) ? 'Dolby Vision' : null,
    HDMI_2_1: /\bhdmi\s?2\.1a?\b/i.test(title) && !NEGATED.test(title) ? 'HDMI 2.1' : null,
  };
}

/** The value a set of sources agrees on, as {value, basis, sources}; null when none states it or they disagree. `sources` are `{basis, text, codeSize?}`. */
function settle(attribute, sources) {
  const stated = sources.map((source) => ({ basis: source.basis, value: factsOf(source.text, source.codeSize ?? null)[attribute] })).filter((entry) => entry.value !== null);
  const value = only(stated.map((entry) => entry.value));
  if (value === null) return null;
  const basis = stated.map((entry) => entry.basis).sort((a, b) => BASIS_RANK[a] - BASIS_RANK[b])[0];
  return { value, basis, sources: Math.min(stated.length, 99) };
}

/**
 * @param {{original: {basis: string, text: string, codeSize?: number}[], candidate: {basis: string, text: string, codeSize?: number}[]}} sources
 * @param {{sizeInches?: number|null}} stated  the screen size the person stated, when they did
 * @returns {{rows: object[], compared: string[], notEstablished: string[]}}
 */
export function compareSpecs({ original, candidate }, { sizeInches = null } = {}) {
  const rows = [];
  for (const attribute of SPEC_ATTRIBUTES) {
    // The person's own words come first: what they say their TV is, is what they have. Otherwise the titles must agree.
    const userSources = original.filter((source) => source.basis === 'USER_STATED');
    const user = attribute === 'SCREEN_SIZE' && sizeInches ? { value: `${sizeInches}-inch`, basis: 'USER_STATED', sources: 1 } : settle(attribute, userSources);
    const before = user || settle(attribute, original.filter((source) => source.basis !== 'USER_STATED'));
    const after = settle(attribute, candidate);
    if (!CORE_ATTRIBUTES.includes(attribute) && !before && !after) continue;
    const result = !before || !after ? 'NOT_ESTABLISHED' : before.value === after.value ? 'MATCH' : 'DIFFERENT';
    rows.push({ attribute, original: before, candidate: after, result });
  }
  return {
    rows, compared: rows.filter((row) => row.result !== 'NOT_ESTABLISHED').map((row) => row.attribute),
    notEstablished: rows.filter((row) => row.result === 'NOT_ESTABLISHED').map((row) => row.attribute),
  };
}

/**
 * The comparison for one television candidate from what was already retrieved: the person's words, the original's manufacturer page titles (found in search results
 * and not opened), the titles of listings of the original model, and the titles of listings of the presented generation. Null when there is nothing to read.
 * @param {{query: string, sizeInches: number|null, manufacturerPages: {title: string|null}[], specSources: {candidate: {title: string, size: number|null}[], original: string[]}|null}} input
 */
export function buildSpecComparison({ query, sizeInches = null, manufacturerPages = [], specSources }) {
  if (!specSources || !specSources.candidate.length) return null;
  // The person's words describe their own television unless they say what they want in a replacement; then only the size they gave (see `sizeInches`) is theirs.
  const original = [
    ...(WISH.test(String(query || '')) ? [] : [{ basis: 'USER_STATED', text: String(query || '') }]),
    ...manufacturerPages.filter((page) => page.title).map((page) => ({ basis: 'MANUFACTURER_PAGE_TITLE', text: page.title })),
    ...specSources.original.map((text) => ({ basis: 'LISTING_TITLE', text })),
  ];
  const candidate = specSources.candidate.map((row) => ({ basis: 'LISTING_TITLE', text: row.title, codeSize: row.size ?? null }));
  return compareSpecs({ original, candidate }, { sizeInches });
}
