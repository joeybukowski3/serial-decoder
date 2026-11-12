import { MODEL_PATTERN, modelRelation, safeSourceUrl } from '../evidence.js';
import { findResearchClaim } from '../contract.js';
import { brandOf, tvGrammarFor } from './lineage.js';
import { focusTokens, matchesFocus, modelKey } from './product-tokens.js';

/**
 * The original product's own manufacturer page, taken from the search results the engine has already fetched (the dated search about the original).
 *
 * What a page here establishes is ONE thing: that the manufacturer lists this model, because the model's own code is in the page's address. It says nothing about
 * specifications, price or availability, the page is not opened (it is a search result: an address and a title), and it is never evidence about a successor.
 *
 * A page is accepted only when ALL of these hold:
 *   - its address is exactly one a search result carried (nothing is built, completed or guessed from a naming pattern);
 *   - the host is a registered MANUFACTURER of the same brand as the original;
 *   - it is the maker's US storefront (the app prices in USD): a regional page of the same set has a different model code and is a different product;
 *   - the model's exact code is a whole token of the address, and the address carries no other model;
 *   - that code is the model the person asked about: the typed code (exactly or as a short variant), or for a typed series with a size, a code of that series and
 *     that size (a longer code that merely begins with the series, another size, another series or another maker is rejected);
 *   - the result's title does not name a different model.
 */

const MAX_PAGES = 2;
const MAX_TITLE = 120;
// Storefronts with a region in the path: only the US one counts. Hosts that serve only the US market: any path outside a known region counts.
const US_PREFIX_HOSTS = Object.freeze(['lg.com', 'samsung.com', 'bosch-home.com', 'tcl.com']);
const US_ONLY_HOSTS = Object.freeze(['geappliances.com', 'whirlpool.com', 'maytag.com', 'kitchenaid.com', 'frigidaire.com', 'subzero-wolf.com', 'hisense-usa.com', 'vizio.com', 'insigniaproducts.com']);
const REGION_SEGMENTS = new Set(['in', 'uk', 'ca', 'au', 'nz', 'ie', 'de', 'fr', 'es', 'it', 'nl', 'be', 'at', 'ch', 'se', 'no', 'dk', 'fi', 'pl', 'pt', 'gr', 'tr', 'ru', 'ae', 'sa', 'za', 'levant', 'africa', 'global', 'latin', 'mx', 'br', 'ar', 'cl', 'co', 'pe', 'my', 'sg', 'ph', 'th', 'vn', 'id', 'jp', 'kr', 'cn', 'tw', 'hk']);
const SUPPORT_PATH = /support|owner-center|manual/i;
// Pages that mention a model without being its product or support page.
const NOT_A_PAGE_OF_THE_MODEL = /blog|news|press|review|accessor|compar|parts|deal|mount|discover|article|stor(?:y|ies)|video|buying-guide|inspiration/i;
// A locale segment (en-ca, fr-ca, es-mx) or a country marker closing a segment is a regional page, whatever the host.
const LOCALE_SEGMENT = /^[a-z]{2}[-_][a-z]{2}$/i;
const COUNTRY_SUFFIX = /[-_](?:ca|mx|uk|au|nz|in|br|de|fr|es|it)$/i;

const segments = (pathname) => String(pathname).split('/').filter(Boolean);
const tokensOf = (text) => String(text).toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
// A model code here: a valid model pattern with both letters and digits and at least six characters (PFE28KYNFS, OLED55C3PUA, WM4000HWA). The shared
// looksLikeExactModel heuristic wants three digits, which suits spotting invented-looking names but rejects real codes such as PFE28KYNFS.
const isCode = (token) => token.length >= 6 && /[A-Z]/.test(token) && MODEL_PATTERN.test(token);
const exactCodes = (text) => [...new Set(tokensOf(text).filter(isCode))];

/** True when `pathname` on registered `domain` is the maker's US storefront. */
const isPageOfTheModel = (domain, pathname) => isUsStorefront(domain, pathname) && !NOT_A_PAGE_OF_THE_MODEL.test(pathname);

function isUsStorefront(domain, pathname) {
  const first = (segments(pathname)[0] || '').toLowerCase();
  if (US_PREFIX_HOSTS.includes(domain)) return first === 'us';
  if (US_ONLY_HOSTS.includes(domain)) {
    const parts = segments(pathname);
    const regional = REGION_SEGMENTS.has(first) || (LOCALE_SEGMENT.test(first) && first.toLowerCase() !== 'en-us') || parts.some((part) => COUNTRY_SUFFIX.test(part));
    return !regional;
  }
  return false;
}

/** The distinct model codes of an address that are not short variants of each other. */
const distinctCodes = (codes) => codes.filter((code, index) => !codes.slice(0, index).some((other) => modelRelation(code, other) !== 'DIFFERENT'));

/**
 * A series token (C3) names `code` when the code is of that series at the asked size, the series is not just the start of a longer series (C34), and the maker's
 * grammar reads the SAME generation from the person's words and from the code. A series written without its generation (Samsung Q60 or S90: the generation is a
 * letter later in the code) names several models, so no page is taken for it: the order of search results must never decide which generation is "the original".
 */
function matchesSeries(code, focus, spec, { query, grammar }) {
  const match = matchesFocus(modelKey(code), focus);
  if (!match.match || match.size === null || !spec || spec.kind !== 'inches' || Math.abs(match.size - spec.value) > 1) return false;
  const at = modelKey(code).indexOf(focus);
  const next = modelKey(code)[at + focus.length];
  if (at < 0 || (next && !/[A-Z]/.test(next))) return false;
  const asked = grammar ? grammar.seriesOf(query, 0) : null;
  const page = grammar ? grammar.parse(code, 0) : null;
  return Boolean(asked && asked.label && page && page.label === asked.label);
}

function matchesOriginal(code, typed, spec, context) {
  const full = typed.filter(isCode);
  if (full.length) return full.some((token) => modelRelation(code, token) === 'EXACT' || modelRelation(code, token) === 'VARIANT');
  return typed.some((token) => matchesSeries(code, token, spec, context));
}

const clipTitle = (value) => {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE);
  // A claim in a third party's title (a price, a link, an assurance) is withheld, not relayed.
  return text && !findResearchClaim(text) ? text : null;
};

const sameAddress = (a, b) => a.replace(/\/$/, '') === b.replace(/\/$/, '');
const pageKind = (pathname) => (SUPPORT_PATH.test(pathname) ? 'SUPPORT' : 'PRODUCT');

/**
 * @param {{url: string, title?: string}[]} rows  the normalized organic results of the search about the original
 * @param {{query: string, identity?: string, spec?: object|null}} original  the person's words, the identification, and the size asked about
 * @returns {object[]} at most two pages, product pages first, each exactly as the contract carries it
 */
export function originalManufacturerPages(rows, { query, identity = '', spec = null }) {
  const typed = focusTokens(query);
  const brand = brandOf(query) || brandOf(identity);
  if (!Array.isArray(rows) || !typed.length || brand.length < 2) return [];
  const context = { query, grammar: tvGrammarFor(brand) };
  const found = [];
  for (const row of rows) {
    const source = row && typeof row.url === 'string' ? safeSourceUrl(row.url) : null;
    if (!source || source.sourceClass !== 'MANUFACTURER' || source.url !== row.url) continue;
    if (!source.sourceName.toLowerCase().replace(/[^a-z]/g, '').startsWith(brand)) continue;
    const pathname = new URL(source.url).pathname;
    if (!isPageOfTheModel(source.domain, pathname)) continue;
    const codes = distinctCodes(exactCodes(pathname));
    if (codes.length !== 1 || !matchesOriginal(codes[0], typed, spec, context)) continue;
    // A title that also names another model is a page about something else (a comparison, a family page).
    if (distinctCodes(exactCodes(row.title || '')).some((other) => modelRelation(other, codes[0]) === 'DIFFERENT')) continue;
    if (found.some((page) => sameAddress(page.url, source.url))) continue;
    found.push({ url: source.url, domain: source.domain, sourceName: source.sourceName, sourceClass: 'MANUFACTURER', model: codes[0], pageKind: pageKind(pathname), title: clipTitle(row.title || '') ?? null, foundVia: 'SEARCH_RESULT' });
  }
  return found.sort((a, b) => (a.pageKind === b.pageKind ? 0 : a.pageKind === 'PRODUCT' ? -1 : 1)).slice(0, MAX_PAGES);
}

const KEYS = ['url', 'domain', 'sourceName', 'sourceClass', 'model', 'pageKind', 'title', 'foundVia'];

/** One page re-derived from its own fields (the registry decides name, domain and class), or null when anything about it is off. */
export function validManufacturerPage(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry) || Object.keys(entry).sort().join() !== [...KEYS].sort().join()) return null;
  const source = typeof entry.url === 'string' ? safeSourceUrl(entry.url) : null;
  if (!source || source.sourceClass !== 'MANUFACTURER' || source.url !== entry.url) return null;
  const pathname = new URL(source.url).pathname;
  if (!isPageOfTheModel(source.domain, pathname)) return null;
  const model = typeof entry.model === 'string' ? entry.model.toUpperCase() : '';
  if (!isCode(model) || !exactCodes(pathname).includes(model) || distinctCodes(exactCodes(pathname)).length !== 1) return null;
  if (entry.pageKind !== pageKind(pathname) || entry.foundVia !== 'SEARCH_RESULT' || entry.sourceClass !== 'MANUFACTURER') return null;
  const title = clipTitle(entry.title);
  if (title === undefined) return null;
  return { url: source.url, domain: source.domain, sourceName: source.sourceName, sourceClass: 'MANUFACTURER', model, pageKind: pageKind(pathname), title, foundVia: 'SEARCH_RESULT' };
}

/** True when the page's maker is the maker the identification starts with ("LG C3 series ..." -> LG). */
const isMakersPage = (page, identity) => {
  const brand = brandOf(identity);
  return brand.length >= 2 && page.sourceName.toLowerCase().replace(/[^a-z]/g, '').startsWith(brand);
};

/** The valid pages of a list that belong to the identified original's maker, without duplicates, product pages first, at most two. */
export function normalizeManufacturerPages(raw, identity) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const entry of raw.slice(0, MAX_PAGES * 2)) {
    const page = validManufacturerPage(entry);
    if (page && isMakersPage(page, identity) && !out.some((other) => sameAddress(other.url, page.url))) out.push(page);
  }
  return out.sort((a, b) => (a.pageKind === b.pageKind ? 0 : a.pageKind === 'PRODUCT' ? -1 : 1)).slice(0, MAX_PAGES);
}
