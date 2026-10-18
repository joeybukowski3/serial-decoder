import { interpretReplacementSearch } from './interpret.js';
import { applyOriginalEnrichment, describeOriginal } from './original-enrichment.js';
import { recommendFromInterpretation } from './recommend.js';
import { stableId } from './normalize-adapter.js';
import { classifySource } from './evidence-normalizer.js';
import { searchProducts } from './providers/explicit-search.js';
import { fetchSource } from './providers/guarded-page-fetch.js';
import { visibleText, createRetrievalBudget, DEADLINE_REACHED, SEARCH_CALL_CAP_MS, FETCH_CALL_CAP_MS } from './retrieval-first.js';
import { normalizeRefrigeratorConfiguration } from '../replacement-core/refrigerator-configuration.js';
import { assessRetailEligibility, isNonUsStorefront, pickRetailEligibility, unassessedRetailEligibility, NO_CURRENT_RETAIL_REPLACEMENT, NO_RETAIL_REFINEMENT, RETAIL_POLICY_VERSION } from './retail-eligibility.js';

export const REFRIGERATOR_RETRIEVAL_VERSION = '1.1.0';
export const REFRIGERATOR_TEST_QUERY = 'LG LRFCS25D3S refrigerator';
const ORIGINAL_MODEL = 'LRFCS25D3S';
const MAX_CANDIDATE_QUERIES = 4;
const MAX_CANDIDATES = 6;
/**
 * Source-slot policy for one model and role. Two independent bounds:
 *  - MAX_SOURCES_PER_MODEL caps USEFUL evidence: pages whose facts were bound. A blocked or unreadable page never counts toward it.
 *  - MAX_ATTEMPTS_PER_SOURCE_CLASS caps ATTEMPTED fetches per source class (manufacturer / retailer), so blocked manufacturer pages
 *    spend only the manufacturer attempts and can never use up the trusted-retailer fallback. Worst case is 2 + 2 fetches per model.
 */
export const MAX_SOURCES_PER_MODEL = 2;
export const MAX_ATTEMPTS_PER_SOURCE_CLASS = 2;
// Bound on provider searches in one generalized run (original 3 + candidate 4 + per-candidate spec lookups).
// The fixed proof wrapper keeps its historical ceiling of 13 so its behavior is unchanged.
export const MAX_REFRIGERATOR_SEARCHES = 10;
const PROOF_MAX_SEARCHES = 13;
const REFRIGERATOR_SUPPORTED_BRAND = 'LG';
// Declared support: LG refrigerator model numbers (L + letters + 2-5 digits + 2-6 alphanumerics, e.g. LRFCS25D3S, LF25G8330S).
// These are the shapes the lg.com identity gates, the model-token candidate parser and the LG spec extraction handle.
const LG_REFRIGERATOR_MODEL = /^L[A-Z]{1,5}\d{2,5}[A-Z0-9]{2,6}$/;
const BRANDS = Object.freeze({ 'lg.com': 'LG', 'samsung.com': 'Samsung', 'geappliances.com': 'GE', 'whirlpool.com': 'Whirlpool', 'frigidaire.com': 'Frigidaire', 'kitchenaid.com': 'KitchenAid' });

/** Returns `{ baseModel }` for a supported LG refrigerator model, else null. */
export function normalizeSupportedRefrigeratorModel(value) {
  const key = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return key.length >= 7 && key.length <= 14 && LG_REFRIGERATOR_MODEL.test(key) ? { baseModel: key } : null;
}
const RETAILERS = ['bestbuy.com', 'abt.com', 'homedepot.com', 'lowes.com', 'ajmadison.com'];
// Spec fallback for the original AND for replacement candidates, used only when no manufacturer page yields evidence (blocked,
// unreadable or not found). Exact-model U.S. retailer product pages from this list are the only acceptable substitute; hosts
// like homedepot.ca never match. One allowlist serves both, so the two trust policies cannot drift apart.
export const ORIGINAL_FALLBACK_RETAILERS = Object.freeze(['homedepot.com', 'lowes.com', 'bestbuy.com', 'ajmadison.com']);
export const ORIGINAL_EVIDENCE = Object.freeze({ MANUFACTURER: 'MANUFACTURER', TRUSTED_RETAILER: 'TRUSTED_RETAILER',
  MULTI_SOURCE_TRUSTED_RETAILER: 'MULTI_SOURCE_TRUSTED_RETAILER' });
/** Evidence quality of one model's facts. A candidate that mixes both source classes is labelled as such, never as manufacturer-only. */
export const EVIDENCE_QUALITY = Object.freeze({ ...ORIGINAL_EVIDENCE, MANUFACTURER_AND_TRUSTED_RETAILER: 'MANUFACTURER_AND_TRUSTED_RETAILER' });
const RETAILER_ONLY_QUALITY = new Set([EVIDENCE_QUALITY.TRUSTED_RETAILER, EVIDENCE_QUALITY.MULTI_SOURCE_TRUSTED_RETAILER]);
export const CANDIDATE_SOURCE_UNAVAILABLE = 'CANDIDATE_SOURCE_UNAVAILABLE';
export const CANDIDATE_RETAIL_UNVERIFIED = 'CANDIDATE_RETAIL_UNVERIFIED';
export const CANDIDATE_RETAIL_UNAVAILABLE = 'CANDIDATE_RETAIL_UNAVAILABLE';
/** UNAVAILABLE only when the gate positively proved it (out of stock, discontinued, legacy page); missing or ambiguous evidence stays UNVERIFIED. */
export const candidateRetailRejection = (retail) => (retail.purchaseStatus === 'UNAVAILABLE' || retail.catalogStatus === 'LEGACY'
  ? CANDIDATE_RETAIL_UNAVAILABLE : CANDIDATE_RETAIL_UNVERIFIED);
const MAX_FALLBACK_SEARCHES = 2;
const MAX_FALLBACK_SOURCES = 2;
const BLOCKED_STATUSES = new Set([401, 403, 429]);
const MINIMUM_ORIGINAL_FACTS = ['model', 'configuration', 'totalCapacityCuFt'];
const DIMENSION_FACTS = ['widthIn', 'heightIn', 'depthIn'];

/** Fetch identity of a page: host without www plus path, ignoring query, fragment and case, so tracking variants fetch once. */
export function canonicalSourceUrl(value) {
  try {
    const url = new URL(value);
    return `${url.hostname.toLowerCase().replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch { return String(value); }
}

const hasFacts = (facts, keys) => keys.every((key) => facts[key]?.status === 'KNOWN');

/**
 * Minimum verification for retailer-sourced original specs: either two trusted hosts that each establish the minimum fact set and
 * agree once merged, or one host that also states total capacity as a specification and at least two dimensions. A conflict
 * between sources leaves the merged fact AMBIGUOUS, so the original stays unverified.
 */
export function assessOriginalFallback(accepted) {
  const merged = mergeRefrigeratorSources(accepted.map((item) => item.bound));
  const complete = accepted.filter((item) => hasFacts(item.bound.facts, MINIMUM_ORIGINAL_FACTS));
  const conflicts = Object.entries(merged.facts).filter(([, fact]) => fact.status === 'AMBIGUOUS').map(([key]) => key);
  const strong = (facts) => facts.totalCapacityCuFt.capacityBasis === 'TOTAL_SPECIFICATION'
    && DIMENSION_FACTS.filter((key) => facts[key]?.status === 'KNOWN').length >= 2;
  const quality = !hasFacts(merged.facts, MINIMUM_ORIGINAL_FACTS) ? null
    : new Set(complete.map((item) => item.host)).size >= 2 ? ORIGINAL_EVIDENCE.MULTI_SOURCE_TRUSTED_RETAILER
      : complete.some((item) => strong(item.bound.facts)) ? ORIGINAL_EVIDENCE.TRUSTED_RETAILER : null;
  return { verified: Boolean(quality), quality, merged, conflicts };
}

/**
 * Where a model's facts came from, from the pages that actually supplied them. `pages` are `{ sourceClass, host }`.
 * Null when nothing supplied facts. Retailer-only evidence is never reported as manufacturer evidence.
 */
export function candidateEvidenceQuality(pages) {
  const retailerHosts = new Set(pages.filter((page) => page.sourceClass === 'RETAILER').map((page) => page.host));
  if (pages.some((page) => page.sourceClass === 'MANUFACTURER')) return retailerHosts.size ? EVIDENCE_QUALITY.MANUFACTURER_AND_TRUSTED_RETAILER : EVIDENCE_QUALITY.MANUFACTURER;
  if (!retailerHosts.size) return null;
  return retailerHosts.size >= 2 ? EVIDENCE_QUALITY.MULTI_SOURCE_TRUSTED_RETAILER : EVIDENCE_QUALITY.TRUSTED_RETAILER;
}

/** Exact-model, allowlisted U.S. retailer results for a model (original or candidate), in search order, one per canonical page. */
export function trustedOriginalFallbackSources(results, model, brand = REFRIGERATOR_SUPPORTED_BRAND) {
  const seen = new Set();
  return results.filter((item) => ORIGINAL_FALLBACK_RETAILERS.some((root) => hostMatches(item.domain, root))
    && refrigeratorSourcePriority(item, model, brand) === 4).filter((item) => {
    const key = canonicalSourceUrl(item.url);
    return !seen.has(key) && seen.add(key);
  });
}
const MODEL_TOKEN = /\b[A-Z]{2,6}\d{2,5}[A-Z0-9]{2,8}\b/gi;
const FIELDS = new Set(['brand', 'model', 'fullModel', 'family', 'series', 'modelYear', 'capacityCuFt', 'totalCapacityCuFt', 'refrigeratorCapacityCuFt', 'freezerCapacityCuFt', 'configuration', 'configurationFloor', 'layout', 'installationType', 'counterDepth', 'dispenser', 'iceMaker', 'widthIn', 'heightIn', 'depthIn', 'clearanceWidthIn', 'clearanceHeightIn', 'clearanceDepthIn', 'finish', 'smart']);

const hostMatches = (host, root) => host === root || host.endsWith(`.${root}`);
const modelKey = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const verified = (facts, key) => facts[key]?.status === 'KNOWN' && facts[key]?.evidenceRefs?.length ? facts[key].value : null;
const needsEnrichment = (facts) => ['capacityCuFt', 'layout', 'installationType', 'counterDepth', 'dispenser', 'iceMaker',
  'widthIn', 'heightIn', 'depthIn'].some((key) => facts[key]?.status !== 'KNOWN') || facts.capacityCuFt?.precisionCuFt >= 1;

function sourceClass(result, brand) {
  const domain = result.domain;
  if (Object.entries(BRANDS).some(([root, name]) => hostMatches(domain, root) && name.toLowerCase() === brand.toLowerCase())) return 'MANUFACTURER';
  if (RETAILERS.some((root) => hostMatches(domain, root))) return 'RETAILER';
  return 'OTHER';
}

export function refrigeratorSourcePriority(result, model, brand = REFRIGERATOR_SUPPORTED_BRAND) {
  let url;
  try { url = new URL(result.url); } catch { return 99; }
  const path = decodeURIComponent(url.pathname).toUpperCase();
  if (url.protocol !== 'https:' || url.hostname.replace(/^www\./, '') !== result.domain || !path.includes(modelKey(model))) return 99;
  // The multi-country manufacturer host (www.lg.com) serves one storefront per country; only /us/ may supply specifications, because
  // a Canadian or Latin American page for the same model carries different figures. Dedicated subdomains are not storefronts.
  if (Object.hasOwn(BRANDS, result.domain) && isNonUsStorefront(result.domain, path)) return 99;
  if (/\b(?:used|refurbished|marketplace|open.box)\b/i.test(`${result.title} ${result.snippet} ${path}`)) return 99;
  const kind = sourceClass(result, brand);
  if (kind === 'MANUFACTURER') return /\.pdf$/i.test(path) || /spec|builder|technical/i.test(path) ? 2 : /support|manual/i.test(path) ? 3 : 1;
  return kind === 'RETAILER' ? 4 : 99;
}

export function refrigeratorCandidateIdentity(result, originalModel = ORIGINAL_MODEL) {
  let url;
  try { url = new URL(result.url); } catch { return { identity: null, reason: 'INVALID_URL' }; }
  const domain = url.hostname.toLowerCase().replace(/^www\./, '');
  if (url.protocol !== 'https:' || domain !== result.domain || url.username || url.password) return { identity: null, reason: 'UNTRUSTED_SOURCE' };
  if (isNonUsStorefront(domain, url.pathname)) return { identity: null, reason: 'NON_US_STOREFRONT' };
  if (/\b(?:used|refurbished|marketplace|open.box|pre.owned)\b/i.test(`${result.title} ${result.snippet} ${url.pathname}`)) return { identity: null, reason: 'NON_PRODUCT_PAGE' };
  const brand = Object.entries(BRANDS).find(([root]) => hostMatches(domain, root))?.[1]
    || (RETAILERS.some((root) => hostMatches(domain, root)) ? Object.values(BRANDS).find((name) => new RegExp(`\\b${name}\\b`, 'i').test(result.title)) : null);
  if (!brand || sourceClass(result, brand) === 'OTHER') return { identity: null, reason: 'UNTRUSTED_SOURCE' };
  const path = decodeURIComponent(url.pathname);
  if (/\b(?:category|collections?|view-all|search|guide|compare|all-refrigerators)\b/i.test(path)
    || !/(?:refrigerator|fridge|appliance|product)/i.test(path)) return { identity: null, reason: 'GENERIC_OR_NON_PRODUCT_PAGE' };
  const fields = { title: result.title || '', url: path, snippet: result.snippet || '' };
  const tokens = Object.entries(fields).flatMap(([field, value]) => [...value.matchAll(MODEL_TOKEN)].map(([token]) => ({ field, token: modelKey(token) })));
  const plausible = tokens.filter(({ token }) => token.length >= 8 && !/^(?:REFRIGERATOR|APPLIANCE)/.test(token));
  const models = [...new Set(plausible.map(({ token }) => token))];
  if (models.length !== 1) return { identity: null, reason: models.length ? 'CONFLICTING_MODELS' : 'NO_EXACT_MODEL' };
  const model = models[0];
  if (model === modelKey(originalModel)) return { identity: null, reason: 'SAME_AS_ORIGINAL' };
  if (!modelKey(path).includes(model)) return { identity: null, reason: 'MODEL_NOT_IN_PRODUCT_URL' };
  return { identity: { baseModel: model, fullSku: model, brand, sourceFields: plausible.map((item) => item.field),
    currentStatus: /\bdiscontinued\b/i.test(`${result.title} ${result.snippet}`) ? 'DISCONTINUED' : 'UNKNOWN' }, reason: 'ACCEPTED_EXACT_PRODUCT' };
}

export function planRefrigeratorQueries(facts) {
  const brand = verified(facts, 'brand');
  const configuration = normalizeRefrigeratorConfiguration(verified(facts, 'configuration') || verified(facts, 'configurationFloor'));
  const capacity = verified(facts, 'capacityCuFt') ?? verified(facts, 'totalCapacityCuFt');
  const family = verified(facts, 'family') || verified(facts, 'series');
  const counterDepth = verified(facts, 'counterDepth');
  if (!brand || configuration === 'UNKNOWN' || capacity === null) return [];
  const layout = configuration.replace(/_/g, ' ').toLowerCase();
  const rounded = Math.round(capacity);
  const plans = [
    { intent: 'SAME_BRAND_CONFIGURATION_CLOSE_CAPACITY', query: `${brand} ${layout} ${rounded} cu ft current refrigerator model` },
    { intent: 'SAME_BRAND_CONFIGURATION_CAPACITY_FLOOR', query: `${brand} ${layout} ${Math.floor(capacity)} cu ft or larger current refrigerator` },
    { intent: 'SAME_BRAND_COMPATIBLE_LAYOUT', query: `${brand} ${configuration === 'FRENCH_DOOR' ? 'four door' : layout} ${rounded} cu ft current refrigerator` },
    { intent: 'BROADER_FALLBACK', query: `${layout} ${rounded} cu ft current refrigerator model` },
  ];
  if (family) plans[0].query = `${brand} ${family} current ${layout} ${rounded} cu ft refrigerator`;
  if (counterDepth === true) plans[1].query = `${brand} counter depth ${layout} ${Math.floor(capacity)} cu ft current refrigerator`;
  return plans.slice(0, MAX_CANDIDATE_QUERIES);
}

export function refrigeratorDiscoveryPriority(result, identity, facts) {
  const title = `${result.title} ${result.snippet}`.toLowerCase();
  const originalBrand = String(verified(facts, 'brand') || '').toLowerCase();
  const configuration = normalizeRefrigeratorConfiguration(verified(facts, 'configuration') || verified(facts, 'configurationFloor'));
  const capacity = verified(facts, 'capacityCuFt') ?? verified(facts, 'totalCapacityCuFt');
  const reasons = [];
  if (identity.brand.toLowerCase() === originalBrand) reasons.push('SAME_BRAND');
  if (configuration !== 'UNKNOWN' && title.includes(configuration.replace(/_/g, ' ').toLowerCase())) reasons.push('SAME_CONFIGURATION');
  const stated = title.match(/\b(\d{2}(?:\.\d+)?)\s*(?:cu\.?\s*ft\.?|cubic\s*feet)\b/i);
  const delta = stated && capacity ? Math.abs(Number(stated[1]) - capacity) : null;
  if (delta !== null && delta <= 2) reasons.push('CLOSE_CAPACITY');
  if (sourceClass(result, identity.brand) === 'MANUFACTURER') reasons.push('MANUFACTURER_PAGE');
  if (verified(facts, 'counterDepth') === true && /counter[\s-]*depth/.test(title)) reasons.push('COUNTER_DEPTH_MATCH');
  const score = (reasons.includes('SAME_BRAND') ? 40 : 0) + (reasons.includes('SAME_CONFIGURATION') ? 30 : 0)
    + (reasons.includes('CLOSE_CAPACITY') ? 15 - Math.min(10, delta * 3) : 0)
    + (reasons.includes('MANUFACTURER_PAGE') ? 10 : 0) + (reasons.includes('COUNTER_DEPTH_MATCH') ? 5 : 0)
    - (identity.currentStatus === 'DISCONTINUED' ? 30 : 0);
  return { score, reasons };
}

export function aggregateRefrigeratorResults(searches, facts, originalModel = ORIGINAL_MODEL) {
  const pool = new Map();
  for (const { intent, query, results } of searches) for (const result of results) {
    const identity = refrigeratorCandidateIdentity(result, originalModel).identity;
    if (!identity) continue;
    const priority = refrigeratorDiscoveryPriority(result, identity, facts);
    const previous = pool.get(identity.baseModel);
    const foundBy = { intent, query, url: result.url };
    if (!previous) pool.set(identity.baseModel, { model: identity.baseModel, identity, result, discoveryPriority: priority, foundBy: [foundBy] });
    else {
      previous.foundBy.push(foundBy);
      if (priority.score > previous.discoveryPriority.score) Object.assign(previous, { identity, result, discoveryPriority: priority });
    }
  }
  return [...pool.values()].sort((a, b) => b.discoveryPriority.score - a.discoveryPriority.score || a.model.localeCompare(b.model)).slice(0, MAX_CANDIDATES);
}

function headingText(html) {
  return [...String(html).matchAll(/<(?:title|h1)\b[^>]*>([\s\S]*?)<\/(?:title|h1)>/gi)].map((match) => visibleText(match[1]));
}

function productSpecifications(html) {
  const nextData = String(html).match(/<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (nextData) {
    try {
      const product = JSON.parse(nextData[1]).props?.pageProps?.productData;
      if (product?.allInfo && product.product?.categoryInfo?.some((item) => item.categoryCode === 'refrigerators'))
        return product.allInfo.flatMap((group) => group.tableData || []).filter((item) => item.term && item.description)
          .map((item) => ({ label: item.term, value: item.description }));
    } catch { /* Invalid embedded product data cannot supply facts. */ }
  }
  return [...String(html).matchAll(/<li\b[^>]*class=["'][^"']*c-compare-selling__item[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)]
    .map(([, row]) => {
      const label = row.match(/c-compare-selling__spec-name[^>]*>([\s\S]*?)<\/div>/i)?.[1];
      const value = row.match(/c-compare-selling__spec-desc[^>]*>([\s\S]*?)<\/div>/i)?.[1];
      return { label: visibleText(label || '').trim(), value: visibleText(value || '').trim() };
    }).filter((item) => item.label && item.value);
}

function numberInches(value) {
  const match = String(value).match(/(\d{1,3})(?:\s+(\d+)\s*\/\s*(\d+)|\s*\/\s*(\d+)|\.(\d+))?\s*(?:["”]|in(?:ches)?\b)?/i);
  if (!match) return null;
  if (match[4]) return Number(match[1]) / Number(match[4]);
  return Number(match[1]) + (match[2] ? Number(match[2]) / Number(match[3]) : match[5] ? Number(`0.${match[5]}`) : 0);
}

const GENERIC_PATH = /\b(?:category|collections?|view-all|search|guide|compare|all-refrigerators)\b/i;
const TITLE_SAMPLE_CHARS = 160;
const REFRIGERATOR_TERM = /\b(?:refrigerator|fridge)\b/i;
const jsonLdProducts = (data) => (Array.isArray(data) ? data : Array.isArray(data?.['@graph']) ? data['@graph'] : [data])
  .filter((item) => item && (item['@type'] === 'Product' || item['@type']?.includes?.('Product')));

/** Identity gates for one source. Diagnostics are bounded and non-sensitive; they name the gate that rejected the page. */
function inspectIdentity(html, model, sourceUrl) {
  const diagnostics = { sourceUrlValid: false, isPdf: false, pathHasModel: false, genericPath: false, headingCount: 0,
    headingHasModel: false, headingHasRefrigeratorTerm: false, titleSample: '', jsonLdBlockCount: 0, jsonLdProductCount: 0,
    jsonLdAcceptedCount: 0, nextDataPresent: false, modelLineFound: false, normalizedTextLength: 0, rejectionReason: null };
  let url;
  try { url = new URL(sourceUrl); } catch { return { ok: false, diagnostics: { ...diagnostics, rejectionReason: 'INVALID_SOURCE_URL' } }; }
  const path = decodeURIComponent(url.pathname);
  const expected = modelKey(model);
  const pdfText = /\.pdf$/i.test(path);
  const headings = pdfText ? [String(html).split(/[\n\f]/).slice(0, 12).join(' ')] : headingText(html);
  if (!pdfText) for (const match of String(html).matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    diagnostics.jsonLdBlockCount += 1;
    try {
      const product = JSON.parse(match[1]);
      diagnostics.jsonLdProductCount += jsonLdProducts(product).length;
      if (/^product$/i.test(product['@type']) && modelKey(product.name).includes(expected)
        && modelKey(product['@id'] || product.url).includes(expected)) { headings.push(product.name); diagnostics.jsonLdAcceptedCount += 1; }
    } catch { /* Invalid structured data cannot establish identity. */ }
  }
  const headingLine = headings.join(' ');
  Object.assign(diagnostics, { sourceUrlValid: true, isPdf: pdfText, pathHasModel: modelKey(path).includes(expected),
    genericPath: GENERIC_PATH.test(path), nextDataPresent: !pdfText && /id=["']__NEXT_DATA__["']/i.test(String(html)),
    headingCount: headings.length, headingHasModel: headings.some((heading) => modelKey(heading).includes(expected)),
    headingHasRefrigeratorTerm: REFRIGERATOR_TERM.test(headingLine), titleSample: headingLine.replace(/\s+/g, ' ').trim().slice(0, TITLE_SAMPLE_CHARS) });
  const rejectionReason = !diagnostics.pathHasModel ? 'URL_MODEL_MISMATCH' : diagnostics.genericPath ? 'GENERIC_PAGE_PATH'
    : !diagnostics.headingHasModel ? 'HEADING_MODEL_MISSING' : null;
  return { ok: !rejectionReason, diagnostics: { ...diagnostics, rejectionReason }, headings, path, pdfText, expected };
}

const BOOLEAN_TOKEN = /^(yes|no|true|false)\s*[.;]?$/i;
const DEPTH_TYPE_VALUE = /^(?:standard|non[\s-]*counter|counter)[\s-]*depth(?:\s*max)?\W*$/i;
const NEGATIVE_DEPTH = /\b(?:standard|non[\s-]*counter|not[\s-]*counter)[\s-]*depth\b/i;
const POSITIVE_DEPTH = /\bcounter[\s-]*depth\b/i;
const BUILT_IN_LOOK = /\bbuilt[\s-]*in look\b/i;

/** Every value, among the lines labelled `label`, that `accepts`. A label with no inline value reads the next line only if it is itself an accepted value. */
function labelledValues(lines, label, accepts) {
  return lines.flatMap((entry, index) => {
    if (!label.test(entry) || entry.length >= 180) return [];
    const value = entry.replace(label, '').replace(/^\s*[:：-]?\s*/, '').trim() || lines[index + 1] || '';
    return accepts.test(value) ? [value] : [];
  });
}

/**
 * Counter-depth from explicit evidence about THIS model only, never from silence. `lines` is the exact-model section; `headings`
 * are the page title, first heading and any heading naming the model (a related product's heading is not evidence).
 *  - explicit negative: "Counter Depth: No", "Standard Depth: Yes", "Depth Type: Standard Depth", a "standard-depth" heading
 *  - explicit positive: "Counter Depth: Yes", "Depth Type: Counter Depth", a "counter-depth" heading
 * Both kinds present is a conflict. Returns true, false, `{ ambiguous: [true, false] }`, or undefined (unknown).
 */
function counterDepthEvidence(lines, specValue, headings) {
  const found = new Set();
  for (const value of labelledValues(lines, /^Counter[\s-]*Depth\b/i, BOOLEAN_TOKEN)) found.add(/^(?:yes|true)/i.test(value) ? 'YES' : 'NO');
  if (labelledValues(lines, /^Standard Depth\b/i, BOOLEAN_TOKEN).some((value) => /^(?:yes|true)/i.test(value))) found.add('NO');
  const typed = [...labelledValues(lines, /^Depth Type\b/i, DEPTH_TYPE_VALUE), specValue(/^Standard\/Counter Depth\b/i)].filter(Boolean);
  for (const text of [...typed, ...headings]) {
    if (NEGATIVE_DEPTH.test(text)) found.add('NO');
    if (POSITIVE_DEPTH.test(text.replace(new RegExp(NEGATIVE_DEPTH.source, 'gi'), ' ')) && !BUILT_IN_LOOK.test(text)) found.add('YES');
  }
  if (found.size === 2) return { ambiguous: [true, false] };
  return found.has('YES') ? true : found.has('NO') ? false : undefined;
}

/** An exact title or heading and a model-bearing product URL are required before any page text is used. */
export function extractRefrigeratorFacts(html, model, options = {}) {
  return inspectRefrigeratorSource(html, model, options).facts;
}

/** Same extraction as extractRefrigeratorFacts, plus bounded per-gate diagnostics for the proof report. */
export function inspectRefrigeratorSource(html, model, { sourceUrl, brand = 'LG' } = {}) {
  const gate = inspectIdentity(html, model, sourceUrl);
  const conclude = (facts, extra = {}) => ({ facts, diagnostics: { ...gate.diagnostics, ...extra,
    extractedFactKeys: Object.keys(facts), extractedFactCount: Object.keys(facts).length } });
  if (!gate.ok) return conclude({});
  const { headings, path, pdfText, expected } = gate;
  const text = pdfText ? String(html) : visibleText(html);
  const lines = text.split(/[\n\f]/).map((line) => line.trim()).filter(Boolean);
  // A multi-model source can contribute only its exact-model section.
  const first = lines.findIndex((line) => modelKey(line).includes(expected));
  if (first < 0) return conclude({}, { rejectionReason: 'MODEL_LINE_NOT_FOUND', normalizedTextLength: text.length });
  if (first > 0) lines.splice(0, first);
  const next = lines.findIndex((line, index) => index > 0 && /\b[A-Z]{2,6}\d{2,5}[A-Z0-9]{2,8}\b/i.test(line)
    && !modelKey(line).includes(expected));
  if (next >= 0) lines.length = next;
  const specs = pdfText ? [] : productSpecifications(html);
  const specValue = (label) => specs.find((item) => label.test(item.label))?.value || '';
  for (const item of specs) lines.push(`${item.label} ${item.value}`);
  const title = pdfText ? lines.slice(0, 2).join(' ') : headings.join(' ');
  const textStats = { modelLineFound: true, normalizedTextLength: text.length };
  if (!REFRIGERATOR_TERM.test(title)) return conclude({}, { ...textStats, rejectionReason: 'TITLE_NOT_REFRIGERATOR' });
  const valueAfter = (label) => {
    const line = lines.find((entry) => label.test(entry) && entry.length < 180);
    if (!line) return '';
    const prefix = line.match(label)?.[0] || '';
    const value = line.slice(line.indexOf(prefix) + prefix.length).replace(/^\s*[:：-]?\s*/, '').trim();
    return value || lines[lines.indexOf(line) + 1] || '';
  };
  const facts = { model: expected, brand };
  const statedTotalCapacity = specValue(/^(?:Total Capacity|Volume Total|CAPACITY - Volume Total)\b/i)
    || valueAfter(/^Total Capacity(?:\s*\(cu\.?\s*ft\.?\))?/i);
  const capacity = statedTotalCapacity || valueAfter(/^Capacity(?:\s*\(cu\.?\s*ft\.?\))?/i) || title;
  const capMatch = capacity.match(/\b(\d{1,2}(?:\.\d+)?)\s*(?:cu\.?\s*ft\.?|cubic\s*feet)\b/i)
    || capacity.match(/^(\d{1,2}(?:\.\d+)?)$/);
  if (capMatch) {
    const value = Number(capMatch[1]);
    const precisionCuFt = capMatch[1].includes('.') ? 10 ** -capMatch[1].split('.')[1].length : 1;
    const capacityBasis = statedTotalCapacity ? 'TOTAL_SPECIFICATION' : 'NOMINAL_MARKETING';
    facts.capacityCuFt = { value, precisionCuFt, capacityBasis };
    facts.totalCapacityCuFt = { value, precisionCuFt, capacityBasis };
  }
  for (const [key, label] of [['refrigeratorCapacityCuFt', /^Refrigerator\s*\(cu\.?\s*ft\.?\)/i], ['freezerCapacityCuFt', /^Freezer\s*\(cu\.?\s*ft\.?\)/i]]) {
    const match = (specValue(label) || specValue(key === 'refrigeratorCapacityCuFt' ? /^Volume Refrigerator\b/i : /^Volume Freezer\b/i)
      || valueAfter(label)).match(/^\d{1,2}(?:\.\d+)?/);
    if (match) facts[key] = Number(match[0]);
  }
  const layoutText = `${title} ${path.replace(/[-_]/g, ' ')} ${valueAfter(/^Product Type\b/i)} ${valueAfter(/^Configuration\b/i)} ${valueAfter(/^Door Type\b/i)}`;
  const doorCount = layoutText.match(/\b(?:french[\s-]*)?([34])[\s-]*door\b/i)?.[1]
    || (/\b(?:three|four)[\s-]*door\b/i.test(layoutText) ? /\bfour[\s-]*door\b/i.test(layoutText) ? '4' : '3' : null);
  const layouts = [
    [/\b(?:four|4)[\s-]*door\b/i, 'FOUR_DOOR'], [/\bfrench[\s-]*door\b/i, 'FRENCH_DOOR'],
    [/\bside[\s-]*by[\s-]*side\b/i, 'SIDE_BY_SIDE'], [/\btop[\s-]*freezer\b/i, 'TOP_FREEZER'],
    [/\bbottom[\s-]*freezer\b/i, 'BOTTOM_FREEZER'], [/\bcolumn\b/i, 'COLUMN'],
  ].filter(([pattern]) => pattern.test(layoutText)).map(([, value]) => value);
  if (layouts.length === 1 || (layouts.includes('FOUR_DOOR') && layouts.includes('FRENCH_DOOR')) || (/\bfrench\b/i.test(layoutText) && doorCount)) {
    facts.configuration = /\bfrench\b/i.test(layoutText) ? 'FRENCH_DOOR' : layouts[0];
    facts.configurationFloor = facts.configuration;
    facts.layout = doorCount === '4' || layouts.includes('FOUR_DOOR') ? 'FRENCH_DOOR_4_DOOR'
      : doorCount === '3' ? 'FRENCH_DOOR_3_DOOR' : layouts[0];
  }
  const installation = valueAfter(/^Installation Type\b/i);
  if (/\bintegrated\b/i.test(installation)) facts.installationType = 'INTEGRATED';
  else if (/\bbuilt[\s-]*in\b/i.test(installation) && !/\blook\b/i.test(installation)) facts.installationType = 'BUILT_IN';
  else if (/\bcolumn\b/i.test(installation) || /\bcolumn refrigerator\b/i.test(title)) facts.installationType = 'COLUMN';
  else if (/\bfree[\s-]*standing\b/i.test(installation)) facts.installationType = 'FREESTANDING';
  const firstTag = (tag) => visibleText(String(html).match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))?.[1] || '');
  // Only the page title, its first heading and headings naming this model speak for it; a related product's heading does not.
  const ownHeadings = pdfText ? [title] : [...new Set([firstTag('title'), firstTag('h1'), ...headings.filter((heading) => modelKey(heading).includes(expected))].filter(Boolean))];
  const counterDepth = counterDepthEvidence(lines, specValue, ownHeadings);
  if (counterDepth !== undefined) facts.counterDepth = counterDepth;
  const dispenserLine = lines.find((line) => /^(?:Ice\s*(?:&|and)\s*Water|In-Door|Water|Ice)\s*Dispenser\b/i.test(line)) || '';
  const dispenser = dispenserLine.replace(/^(?:Ice\s*(?:&|and)\s*Water|In-Door|Water|Ice)\s*Dispenser\b/i, '').trim();
  if (/^(?:no|none|false)\b/i.test(dispenser)) facts.dispenser = 'NONE';
  else if (/^(?:yes|true)\b/i.test(dispenser)) facts.dispenser = /(?:ice\s*(?:&|and)\s*water|water\s*(?:&|and)\s*ice|in-door)/i.test(dispenserLine) ? 'WATER_AND_ICE' : 'WATER';
  else if (/\b(?:ice\s*(?:&|and)\s*water|water\s*(?:&|and)\s*ice)\b/i.test(dispenser)) facts.dispenser = 'WATER_AND_ICE';
  else if (/\bwater\b/i.test(dispenser)) facts.dispenser = 'WATER';
  const dispenserType = specValue(/^Dispenser Type$/i) || specValue(/^Ice & Water Dispenser$/i);
  if (/\bice\s*(?:&|and)\s*water\b|\bcube\s*&\s*crushed ice\b/i.test(dispenserType)) facts.dispenser = 'WATER_AND_ICE';
  else if (/^yes\b/i.test(dispenserType) && /\binternal water dispenser\b/i.test(text)) facts.dispenser = 'WATER';
  else if (/\binternal water dispenser\b/i.test(text) && facts.dispenser === undefined) facts.dispenser = 'WATER';
  const dualIce = valueAfter(/^Dual Ice Maker\b/i);
  const ice = `${valueAfter(/^Ice System\b/i)} ${dualIce} ${valueAfter(/^Ice Maker\b/i)}`;
  if (/^(?:yes|true)\b/i.test(dualIce) || /\bdual\b|\byes\s*\(2\)/i.test(ice)) facts.iceMaker = 'DUAL';
  else if (/\b(?:factory installed|single|installed|yes)\b/i.test(ice)) facts.iceMaker = 'SINGLE';
  else if (/\b(?:no|none)\b/i.test(ice) && !/\byes\b/i.test(ice)) facts.iceMaker = 'NONE';
  if (/^yes\b/i.test(specValue(/^Dual l?ce Maker$/i)) || specValue(/^In-Door Ice Maker Ice Type$/i)
    && specValue(/^Freezer Ice Maker Ice Type$/i)) facts.iceMaker = 'DUAL';
  else if (specValue(/^Freezer Ice Maker Ice Type$/i) || /^yes\b/i.test(specValue(/^Automatic Ice Maker$/i))) facts.iceMaker = 'SINGLE';
  for (const [key, label] of [
    ['widthIn', /^Width\b(?!.*(?:Door|Carton))/i], ['heightIn', /^(?:Height to Top of (?:Door )?Hinge|Height)\b/i],
    ['depthIn', /^Depth\b(?!\s*Type)/i],
  ]) {
    const productDimensions = specValue(/^Product Dimension \(WxHxD, inch\)$/i).split(/\s+x\s+/i);
    const source = key === 'widthIn' ? specValue(/^Width$/i) || productDimensions[0]
      : key === 'heightIn' ? specValue(/^Height to Top of Door Hinge$|^Height to Top of Hinge or Door Cap Deco/i) || productDimensions[1]
        : specValue(/^Depth with Handles$|^Depth with handle \(inch\)$/i) || productDimensions[2];
    const amount = numberInches(source || (specs.length ? '' : valueAfter(label)));
    if (amount !== null) facts[key] = amount;
  }
  const clearances = valueAfter(/^Installation Clearance\b/i);
  for (const [key, label] of [['clearanceWidthIn', 'Sides'], ['clearanceHeightIn', 'Top'], ['clearanceDepthIn', 'Back']]) {
    const segment = clearances.match(new RegExp(`\\b${label}\\s+([^,]+)`, 'i'))?.[1];
    const amount = numberInches(segment);
    if (amount !== null) facts[key] = amount;
  }
  const finish = `${title} ${specValue(/^All Available Colors$|^Finish \(Door\)$/i)} ${valueAfter(/^Color Availability\b/i)}`;
  if (/\bstainless\b/i.test(finish)) facts.finish = 'STAINLESS';
  if (/\bWi[\s-]*Fi Enabled\s*Yes\b/i.test(lines.join(' '))) facts.smart = true;
  else if (/\bWi[\s-]*Fi Enabled\s*No\b/i.test(lines.join(' '))) facts.smart = false;
  return conclude(facts, { ...textStats, specFactCount: Object.keys(facts).length - 2 });
}

export function bindRefrigeratorFacts(raw, source) {
  const classification = classifySource(source.domain, source.brand);
  if (!['MANUFACTURER', 'RETAILER'].includes(classification.sourceClass)) return { facts: {}, evidence: [] };
  const facts = {}, evidence = [];
  for (const [key, rawValue] of Object.entries(raw)) {
    if (!FIELDS.has(key)) continue;
    // Conflicting evidence inside one exact-model source: AMBIGUOUS, with no value and no evidence record that could back either side.
    if (Array.isArray(rawValue?.ambiguous)) {
      facts[key] = { status: 'AMBIGUOUS', value: null, alternatives: rawValue.ambiguous, evidenceRefs: [], sourceIds: [source.id], basis: 'SOURCE_CONFLICT',
        conflicts: rawValue.ambiguous.map((value) => ({ value, sourceClass: classification.sourceClass })) };
      continue;
    }
    const value = rawValue && typeof rawValue === 'object' && 'value' in rawValue ? rawValue.value : rawValue;
    const precisionCuFt = rawValue && typeof rawValue === 'object' ? rawValue.precisionCuFt : undefined;
    const capacityBasis = rawValue && typeof rawValue === 'object' ? rawValue.capacityBasis : undefined;
    const evidenceId = stableId('retrieved', `${source.id}|${key}|${JSON.stringify(value)}`);
    facts[key] = { status: 'KNOWN', value, evidenceRefs: [evidenceId], sourceIds: [source.id], basis: 'RETRIEVED_PAGE',
      ...(precisionCuFt ? { precisionCuFt } : {}), ...(capacityBasis ? { capacityBasis } : {}) };
    evidence.push({ contractVersion: '1.0.0', evidenceId, sourceType: classification.sourceType, sourceName: source.title,
      url: source.url, sourceClass: classification.sourceClass, observedAt: new Date().toISOString(),
      claim: { fieldKey: key, value, subjectModel: source.model }, confidence: classification.sourceClass === 'MANUFACTURER' ? 'HIGH' : 'MEDIUM',
      firstParty: classification.sourceClass === 'MANUFACTURER', supports: ['SPECIFICATION'], domain: source.domain, sourceRank: classification.baseRank });
  }
  return { facts, evidence };
}

/**
 * Resolve exact-model sources in priority order; finer manufacturer capacity supersedes nominal marketing capacity.
 *
 * Source authority: a manufacturer's exact-model statement outranks a retailer's only in that a retailer fills what the
 * manufacturer left unstated. When two sources of ANY class state different values for the same fact, neither side wins: the fact is
 * AMBIGUOUS (no value), `alternatives` lists the values and `conflicts` records which source class stated each, so a retailer can
 * never silently overwrite a manufacturer value, nor the reverse. Silence is not a statement and never conflicts.
 */
export function mergeRefrigeratorSources(boundSources) {
  const facts = {}, evidence = boundSources.flatMap((item) => item.evidence);
  const byId = new Map(evidence.map((record) => [record.evidenceId, record]));
  const sidesOf = (fact) => fact.conflicts ?? fact.evidenceRefs.map((id) => byId.get(id)).filter(Boolean)
    .map((record) => ({ value: record.claim.value, sourceClass: record.sourceClass }));
  const unionSides = (...sides) => [...new Map(sides.flatMap(sidesOf).map((side) => [`${side.value}|${side.sourceClass}`, side])).values()];
  for (const { facts: supplied } of boundSources) for (const [key, incoming] of Object.entries(supplied)) {
    const current = facts[key];
    if (!current) { facts[key] = incoming; continue; }
    if (current.value === incoming.value) {
      facts[key] = { ...current, evidenceRefs: [...new Set([...current.evidenceRefs, ...incoming.evidenceRefs])],
        sourceIds: [...new Set([...current.sourceIds, ...incoming.sourceIds])],
        ...(incoming.precisionCuFt && (!current.precisionCuFt || incoming.precisionCuFt < current.precisionCuFt) ? { precisionCuFt: incoming.precisionCuFt } : {}),
        ...(incoming.capacityBasis === 'TOTAL_SPECIFICATION' ? { capacityBasis: incoming.capacityBasis } : {}),
        ...(current.status === 'AMBIGUOUS' ? { conflicts: unionSides(current, incoming) } : {}) };
    } else if (key === 'layout' && current.value === 'FRENCH_DOOR'
      && /^FRENCH_DOOR_[34]_DOOR$/.test(incoming.value)) facts[key] = incoming;
    else if (key === 'layout' && incoming.value === 'FRENCH_DOOR'
      && /^FRENCH_DOOR_[34]_DOOR$/.test(current.value)) continue;
    else if (['capacityCuFt', 'totalCapacityCuFt'].includes(key) && current.precisionCuFt && incoming.precisionCuFt
      && Math.abs(current.value - incoming.value) <= Math.max(current.precisionCuFt, incoming.precisionCuFt) / 2
      && incoming.precisionCuFt < current.precisionCuFt) facts[key] = incoming;
    else if (['capacityCuFt', 'totalCapacityCuFt'].includes(key) && current.precisionCuFt && incoming.precisionCuFt
      && Math.abs(current.value - incoming.value) <= Math.max(current.precisionCuFt, incoming.precisionCuFt) / 2
      && current.precisionCuFt < incoming.precisionCuFt) continue;
    else facts[key] = { status: 'AMBIGUOUS', value: null, alternatives: [...new Set([...(current.alternatives ?? [current.value]), ...(incoming.alternatives ?? [incoming.value])])],
      evidenceRefs: [...new Set([...current.evidenceRefs, ...incoming.evidenceRefs])], conflicts: unionSides(current, incoming),
      sourceIds: [...new Set([...current.sourceIds, ...incoming.sourceIds])], basis: 'SOURCE_CONFLICT' };
  }
  return { facts, evidence };
}

/** Fixed-item proof wrapper: only the LRFCS25D3S proof item is accepted. Use runRefrigeratorRetrieval for any other supported model. */
export async function runRefrigeratorProof({ query = REFRIGERATOR_TEST_QUERY, search = searchProducts, fetchPage = fetchSource, retailNow = Date.now } = {}) {
  if (query !== REFRIGERATOR_TEST_QUERY) throw new Error('FIXED_TEST_ITEM_ONLY');
  return runRefrigeratorRetrieval({ model: ORIGINAL_MODEL, brand: REFRIGERATOR_SUPPORTED_BRAND, query, notes: '', search, fetchPage, maxSearches: PROOF_MAX_SEARCHES, retailNow });
}

/**
 * Retrieval-first refrigerator run for any model accepted by normalizeSupportedRefrigeratorModel (LG only). `interpretation`
 * may be supplied (the facade builds it with FIT_ONLY notes). With a `deadline`, every provider call is capped by the time
 * remaining and retrieval stops, still evaluating collected evidence, once it is reached. Installation type is never inferred.
 *
 * Only candidates with a live, new, first-party purchase path (retail eligibility) are drafted; see retail-eligibility.js.
 */
export async function runRefrigeratorRetrieval({ model, brand = REFRIGERATOR_SUPPORTED_BRAND, query, notes = '', interpretation: supplied = null,
  deadline = null, search = searchProducts, fetchPage = fetchSource, maxSearches = MAX_REFRIGERATOR_SEARCHES, retailNow = Date.now } = {}) {
  if (brand !== REFRIGERATOR_SUPPORTED_BRAND) throw new Error('UNSUPPORTED_REFRIGERATOR_BRAND');
  const supported = normalizeSupportedRefrigeratorModel(model);
  if (!supported || supported.baseModel !== modelKey(model)) throw new Error('UNSUPPORTED_REFRIGERATOR_MODEL');
  const originalModel = supported.baseModel;
  const originalDomain = Object.entries(BRANDS).find(([, name]) => name === brand)[0];
  const budget = createRetrievalBudget(deadline);
  let interpretation = supplied || interpretReplacementSearch(notes ? { query, notes, notesMode: 'FIT_ONLY' } : { query });
  const report = { version: REFRIGERATOR_RETRIEVAL_VERSION, queries: [], searchAttemptCount: 0, searchRequestCount: 0,
    selectedSources: [], fetchResults: [], mergeDiagnostics: [], candidateSearches: [], internalCandidatePool: [], candidateDiscovery: [], candidateEvidence: {},
    original: null, originalEvidence: null, originalFallback: null, recommendation: null, retrievalQuality: 'RETRIEVAL_FAILED', reasonCodes: [],
    retail: { policyVersion: RETAIL_POLICY_VERSION, eligible: {}, rejected: [] } };
  const evidence = [], drafts = [];
  const retailChecks = new Map();
  let searchStage = 'original';
  async function doSearch(text, purpose, role = purpose) {
    if (report.searchAttemptCount >= maxSearches) {
      if (!report.reasonCodes.includes('SEARCH_LIMIT_REACHED')) report.reasonCodes.push('SEARCH_LIMIT_REACHED');
      return [];
    }
    if (!budget.canStart()) return [];
    searchStage = purpose;
    report.searchAttemptCount += 1; report.searchRequestCount += 1;
    // `purpose` is the provider-validated request role (original | candidate); `role` is the orchestration label.
    const entry = { query: text, purpose, role, ok: false, resultCount: 0, error: null };
    report.queries.push(entry);
    const request = { query: text, purpose, limit: 10 };
    try {
      const results = await budget.call('retrieval-search', SEARCH_CALL_CAP_MS, ({ timeoutMs }) => (timeoutMs ? search(request, { timeoutMs }) : search(request)));
      Object.assign(entry, { ok: true, resultCount: results.length });
      return results;
    } catch (error) {
      entry.error = error.code || error.message;
      if (error.diagnostics) entry.diagnostics = error.diagnostics;
      if (error.code === 'SERPER_API_KEY_MISSING') report.searchRequestCount -= 1;
      if (budget.reached) return []; // Deadline cut this search off; keep the evidence already gathered.
      throw error;
    }
  }
  // Spec-sheet searches only enrich a model whose product page is already in hand. A failure there is reported but never discards
  // the evidence gathered so far, and one failure stops further enrichment searches rather than retrying a down provider.
  let enrichmentSearchFailed = false;
  async function doEnrichmentSearch(text, purpose, role) {
    if (enrichmentSearchFailed) return [];
    try { return await doSearch(text, purpose, role); } catch (error) {
      enrichmentSearchFailed = true;
      report.reasonCodes.push(purpose === 'candidate' ? 'CANDIDATE_SEARCH_FAILED' : 'SEARCH_FAILED');
      report.error = error.code || error.message;
      return [];
    }
  }
  const alreadySelected = (url, model) => report.selectedSources.some((source) => source.model === model
    && canonicalSourceUrl(source.url) === canonicalSourceUrl(url));
  const wasBound = (source) => report.fetchResults.some((entry) => entry.sourceId === source.id && entry.bound);
  /** Useful-evidence cap and per-class attempt cap (see MAX_SOURCES_PER_MODEL); a blocked page spends only its own class's attempts. */
  function slotAvailable(model, role, klass) {
    const slot = report.selectedSources.filter((source) => source.model === model && source.role === role);
    return slot.filter(wasBound).length < MAX_SOURCES_PER_MODEL && slot.filter((source) => source.sourceClass === klass).length < MAX_ATTEMPTS_PER_SOURCE_CLASS;
  }
  async function fetchExact(result, model, brand, role) {
    const klass = sourceClass(result, brand);
    if (!slotAvailable(model, role, klass)) return null;
    // A page already read for this model (including a tracking-parameter variant or a blocked page) is never fetched again.
    if (alreadySelected(result.url, model)) return null;
    if (!budget.canStart()) return null;
    const source = { ...result, id: `source-${report.selectedSources.length + 1}`, model, brand, role, sourceClass: klass };
    report.selectedSources.push(source);
    try {
      const fetched = await budget.call('retrieval-fetch', FETCH_CALL_CAP_MS, ({ timeoutMs, signal }) => (timeoutMs ? fetchPage(result.url, { timeoutMs, signal }) : fetchPage(result.url)));
      const usable = fetched.status === 200 && Boolean(fetched.text);
      const { facts: raw, diagnostics } = usable ? inspectRefrigeratorSource(fetched.text, model, { sourceUrl: source.url, brand })
        : { facts: {}, diagnostics: null };
      const bound = bindRefrigeratorFacts(raw, source);
      const accepted = bound.facts.model?.value === modelKey(model);
      // Retail evidence is read from every candidate page that was fetched, whether or not its specs were usable. A retailer page
      // must additionally pass the exact-model identity gates (model in URL and heading, no generic path): a page that merely
      // carries the model in its URL while describing something else proves nothing about this model.
      const identityConfirmed = Boolean(diagnostics?.pathHasModel && diagnostics.headingHasModel && !diagnostics.genericPath);
      if (usable && role.startsWith('candidate') && (klass !== 'RETAILER' || identityConfirmed)) {
        const checks = retailChecks.get(model) || [];
        checks.push(assessRetailEligibility({ html: fetched.text, url: source.url, brand, model, now: retailNow }));
        retailChecks.set(model, checks);
      }
      report.fetchResults.push({ sourceId: source.id, status: fetched.status, usableText: usable, blocked: BLOCKED_STATUSES.has(fetched.status),
        finalUrl: fetched.url || result.url, redirectCount: fetched.redirectCount || 0, truncated: Boolean(fetched.truncated),
        contentType: fetched.contentType || null, bytesRead: fetched.bytesRead ?? null, textLength: String(fetched.text || '').length,
        extractedFields: Object.keys(raw), extraction: diagnostics, bound: accepted,
        outcome: !usable ? 'SOURCE_FETCH_FAILED' : accepted ? 'FACTS_BOUND' : 'SOURCE_EXTRACTION_FAILED', error: null });
      return accepted ? { source, bound, diagnostics } : null;
    } catch (error) {
      report.fetchResults.push({ sourceId: source.id, status: null, usableText: false, outcome: 'SOURCE_FETCH_FAILED', error: error.code || error.message });
      return null;
    }
  }
  const namesBrand = (page, brand) => new RegExp(`\\b${brand}\\b`, 'i').test(page.diagnostics?.titleSample || '');
  /**
   * Reads a model's pages in priority order. Manufacturer pages by default; with `retailer`, only allowlisted U.S. retailer pages
   * that name the exact model and the brand, one page per host. Every page that supplied facts is appended to `pages` for provenance.
   */
  async function researchModel(model, brand, role, initialResults, { retailer = false, pages = [] } = {}) {
    const exact = (retailer ? trustedOriginalFallbackSources(initialResults, model, brand)
      : initialResults.filter((item) => refrigeratorSourcePriority(item, model, brand) < 99 && sourceClass(item, brand) === 'MANUFACTURER'))
      .sort((a, b) => refrigeratorSourcePriority(a, model, brand) - refrigeratorSourcePriority(b, model, brand))
      .filter((item, index, list) => list.findIndex((other) => canonicalSourceUrl(other.url) === canonicalSourceUrl(item.url)) === index);
    const gathered = [];
    for (const item of exact) {
      if (gathered.length >= MAX_SOURCES_PER_MODEL) break;
      const page = await fetchExact(item, model, brand, role);
      if (!page) continue;
      if (retailer && (!namesBrand(page, brand) || pages.some((entry) => entry.host === item.domain))) continue;
      gathered.push(page.bound);
      pages.push({ host: item.domain, sourceClass: page.source.sourceClass, source: page.source, bound: page.bound });
      if (!needsEnrichment(mergeRefrigeratorSources(gathered).facts)) break;
    }
    const merged = mergeRefrigeratorSources(gathered);
    report.mergeDiagnostics.push({ model, role, inputSourceCount: gathered.length,
      inputFactCounts: gathered.map((item) => Object.keys(item.facts).length), outputFactCount: Object.keys(merged.facts).length,
      ambiguousFactKeys: Object.entries(merged.facts).filter(([, fact]) => fact.status === 'AMBIGUOUS').map(([key]) => key) });
    return merged;
  }
  const sourceById = (id) => report.selectedSources.find((source) => source.id === id);
  /** A manufacturer original page answered 401/403/429: recorded as unavailable, never as evidence. */
  const manufacturerBlocked = () => report.fetchResults.some((item) => item.blocked && sourceById(item.sourceId)?.role === 'original');
  /**
   * Only called when no manufacturer page produced evidence. At most two exact-model searches; up to two allowlisted retailer
   * pages on distinct hosts, each needing the exact model in its URL and heading, the brand in its heading and a refrigerator title.
   */
  async function researchOriginalFromTrustedRetail() {
    const queries = [`${originalModel} ${brand} refrigerator specifications`,
      `${originalModel} ${brand} refrigerator ${ORIGINAL_FALLBACK_RETAILERS.map((root) => `site:${root}`).join(' OR ')}`];
    const accepted = [];
    let verdict = assessOriginalFallback(accepted);
    for (const text of queries.slice(0, MAX_FALLBACK_SEARCHES)) {
      if (!budget.canStart()) break;
      const results = await doEnrichmentSearch(text, 'original', 'original-fallback');
      for (const item of trustedOriginalFallbackSources(results, originalModel, brand)) {
        if (accepted.length >= MAX_FALLBACK_SOURCES || accepted.some((entry) => entry.host === item.domain)) continue;
        const page = await fetchExact(item, originalModel, brand, 'original-fallback');
        if (page && new RegExp(`\\b${brand}\\b`, 'i').test(page.diagnostics?.titleSample || '')) accepted.push({ host: item.domain, source: page.source, bound: page.bound });
      }
      verdict = assessOriginalFallback(accepted);
      if (verdict.verified) break;
    }
    report.originalFallback = { attempted: true, quality: verdict.quality, conflicts: verdict.conflicts,
      sources: accepted.map(({ host, source, bound }) => ({ sourceId: source.id, url: source.url, hostname: host,
        sourceType: bound.evidence[0]?.sourceType || null, observedAt: bound.evidence[0]?.observedAt || null,
        extractionStatus: report.fetchResults.find((entry) => entry.sourceId === source.id)?.outcome || null, factKeys: Object.keys(bound.facts) })) };
    return verdict;
  }
  /** A manufacturer page for this candidate answered 401/403/429, so its spec-sheet PDFs will be refused too. */
  const candidateManufacturerBlocked = (model) => report.fetchResults.some((item) => {
    const source = sourceById(item.sourceId);
    return item.blocked && source?.model === model && source.sourceClass === 'MANUFACTURER';
  });
  /**
   * Candidate evidence in priority order: manufacturer pages; a manufacturer spec-sheet search (skipped once the manufacturer is
   * refusing this runtime); then allowlisted trusted-retailer pages. When the manufacturer left the candidate unestablished and no
   * retailer page was among the results, ONE retailer search takes the place of the skipped spec-sheet search. When manufacturer
   * evidence already succeeded no retailer search is ever made.
   */
  async function researchCandidate(item, searches) {
    const { model, identity: { brand: candidateBrand } } = item;
    const pages = [];
    const seen = new Map();
    const remember = (results) => results.filter((entry) => refrigeratorSourcePriority(entry, model, candidateBrand) < 99)
      .forEach((entry) => { if (!seen.has(canonicalSourceUrl(entry.url))) seen.set(canonicalSourceUrl(entry.url), entry); });
    remember(searches.flatMap((search) => search.results));
    let bound = await researchModel(model, candidateBrand, 'candidate', [...seen.values()], { pages });
    if (needsEnrichment(bound.facts) && !candidateManufacturerBlocked(model)) {
      const supplemental = await doEnrichmentSearch(`${model} ${candidateBrand} builder spec sheet pdf site:${candidateBrand.toLowerCase()}.com`, 'candidate', 'candidate-spec');
      remember(supplemental);
      const extra = await researchModel(model, candidateBrand, 'candidate', supplemental.filter((entry) => !alreadySelected(entry.url, model)), { pages });
      bound = mergeRefrigeratorSources([bound, extra]);
    }
    if (needsEnrichment(bound.facts)) {
      if (!bound.facts.model && !trustedOriginalFallbackSources([...seen.values()], model, candidateBrand).length) {
        remember(await doEnrichmentSearch(`${model} ${candidateBrand} refrigerator ${ORIGINAL_FALLBACK_RETAILERS.map((root) => `site:${root}`).join(' OR ')}`, 'candidate', 'candidate-fallback'));
      }
      bound = mergeRefrigeratorSources([bound, await researchModel(model, candidateBrand, 'candidate', [...seen.values()], { retailer: true, pages })]);
    }
    return { bound, pages, results: [...seen.values()] };
  }
  /** Internal provenance: every attempted source for a model (blocked ones included) and which of them supplied facts. */
  function recordCandidateEvidence(model, brand, pages, quality) {
    const used = new Map(pages.map((page) => [page.source.id, page]));
    report.candidateEvidence[model] = { quality, sources: report.selectedSources
      .filter((source) => source.model === model && source.role.startsWith('candidate')).map((source) => {
        const fetched = report.fetchResults.find((entry) => entry.sourceId === source.id);
        const page = used.get(source.id);
        return { sourceId: source.id, url: source.url, hostname: source.domain, sourceClass: source.sourceClass,
          sourceType: classifySource(source.domain, brand).sourceType, observedAt: page?.bound.evidence[0]?.observedAt || null,
          extractionStatus: fetched?.outcome || null, httpStatus: fetched?.status ?? null, blocked: Boolean(fetched?.blocked),
          usedForSpecs: Boolean(page), factKeys: page ? Object.keys(page.bound.facts) : [] };
      }) };
  }
  /**
   * Research one discovered candidate and either draft it or record why not. Nothing is dropped silently: a candidate whose specs
   * no safe source could establish, or whose retail gate failed, appears in candidateDiscovery with a rejectionReason.
   * Retailer-only evidence must establish the minimum fact set; where sources conflict that fact is AMBIGUOUS and the candidate fails.
   */
  async function processCandidate(item, searches) {
    const { model, identity } = item;
    const { bound, pages, results } = await researchCandidate(item, searches);
    const established = Boolean(bound.facts.model)
      && (pages.some((page) => page.sourceClass === 'MANUFACTURER') || hasFacts(bound.facts, MINIMUM_ORIGINAL_FACTS));
    const quality = established ? candidateEvidenceQuality(pages) : null;
    const entry = { model, fullSku: identity.fullSku, discoveryPriority: item.discoveryPriority, foundBy: item.foundBy, evidenceQuality: quality };
    if (!established) {
      // A candidate the deadline cut off before any source was attempted is covered by DEADLINE_REACHED, not by a source verdict.
      if (budget.reached && !report.selectedSources.some((candidate) => candidate.model === model)) return;
      recordCandidateEvidence(model, identity.brand, [], null);
      report.candidateDiscovery.push({ ...entry, source: item.result.url, retailEligible: false, rejectionReason: CANDIDATE_SOURCE_UNAVAILABLE });
      return;
    }
    const source = report.selectedSources.find((candidate) => candidate.id === bound.facts.model.sourceIds?.[0]);
    // HARD retail gate, before any LKQ evaluation. If the spec pages proved no purchase path, one allowlisted retailer page for
    // this exact model (already present in the search results) is read for retail evidence only.
    if (!pickRetailEligibility(retailChecks.get(model))?.eligible && budget.canStart()) {
      const retailer = trustedOriginalFallbackSources(results, model, identity.brand).find((candidate) => !alreadySelected(candidate.url, model));
      if (retailer) await fetchExact(retailer, model, identity.brand, 'candidate-retail');
    }
    recordCandidateEvidence(model, identity.brand, pages, quality);
    const retail = pickRetailEligibility(retailChecks.get(model)) || unassessedRetailEligibility({ url: source.url, brand: identity.brand, now: retailNow });
    if (!retail.eligible) {
      report.retail.rejected.push({ model, retail });
      report.candidateDiscovery.push({ ...entry, source: source.url, retailEligible: false, retailReasons: retail.reasons, rejectionReason: candidateRetailRejection(retail) });
      return;
    }
    report.retail.eligible[model] = retail;
    evidence.push(...bound.evidence);
    const identityFacts = { category: { status: 'KNOWN', value: 'refrigerator', evidenceRefs: [], basis: 'DISCOVERY_CONTEXT' }, ...bound.facts };
    drafts.push({ candidateId: stableId('retrieved-fridge', model), category: 'refrigerator', facts: identityFacts,
      source: { kind: 'EXPLICIT_RETRIEVAL', name: source.domain }, relationship: 'SAME_BRAND_ALTERNATIVE',
      // MEDIUM needs manufacturer evidence for BOTH the original and the candidate; retailer-only evidence on either side caps at LOW.
      discoveryConfidence: report.originalEvidence === ORIGINAL_EVIDENCE.MANUFACTURER && !RETAILER_ONLY_QUALITY.has(quality) ? 'MEDIUM' : 'LOW',
      evidenceRefs: bound.evidence.map((record) => record.evidenceId), providerRank: null });
    report.candidateDiscovery.push({ ...entry, source: source.url, retailEligible: true, facts: bound.facts });
  }
  try {
    const originalQueries = [`${originalModel} ${brand} refrigerator specifications site:${originalDomain}`, `${originalModel} ${brand} refrigerator site:${originalDomain}`];
    let originalResults = [];
    for (const text of originalQueries) {
      originalResults.push(...(await doSearch(text, 'original')).filter((item) => refrigeratorSourcePriority(item, originalModel, brand) < 99));
      originalResults = [...new Map(originalResults.map((item) => [canonicalSourceUrl(item.url), item])).values()]
        .sort((a, b) => refrigeratorSourcePriority(a, originalModel, brand) - refrigeratorSourcePriority(b, originalModel, brand));
      if (originalResults.some((item) => refrigeratorSourcePriority(item, originalModel, brand) === 1)) break;
    }
    if (originalResults.length) {
      let bound = await researchModel(originalModel, brand, 'original', originalResults);
      // The spec-sheet search is spent only when one of its results could still be fetched: a free original source slot and
      // a manufacturer that is not refusing this runtime.
      const originalSlotsLeft = MAX_SOURCES_PER_MODEL - report.selectedSources.filter((source) => source.model === originalModel && source.role === 'original').length;
      if (needsEnrichment(bound.facts) && originalSlotsLeft > 0 && !manufacturerBlocked()) {
        const supplemental = await doEnrichmentSearch(`${originalModel} ${brand} builder spec sheet pdf site:${originalDomain}`, 'original', 'original-spec');
        const extra = await researchModel(originalModel, brand, 'original', supplemental.filter((item) => !alreadySelected(item.url, originalModel)));
        bound = mergeRefrigeratorSources([bound, extra]);
      }
      if (bound.facts.model) {
        evidence.push(...bound.evidence);
        interpretation = applyOriginalEnrichment(interpretation, bound).interpretation;
        report.originalEvidence = ORIGINAL_EVIDENCE.MANUFACTURER;
      }
    }
    if (manufacturerBlocked()) report.reasonCodes.push('MANUFACTURER_SOURCE_BLOCKED');
    if (!evidence.length) {
      const fallback = await researchOriginalFromTrustedRetail();
      if (fallback.verified) {
        evidence.push(...fallback.merged.evidence);
        interpretation = applyOriginalEnrichment(interpretation, fallback.merged).interpretation;
        report.originalEvidence = fallback.quality;
        report.reasonCodes.push('ORIGINAL_FROM_TRUSTED_RETAIL');
      } else if (fallback.conflicts.length) report.reasonCodes.push('ORIGINAL_SOURCES_CONFLICT');
    }
    if (evidence.length) {
      const facts = interpretation.normalizedOriginal.facts;
      const searches = [];
      const plans = planRefrigeratorQueries(facts);
      if (!plans.length) report.reasonCodes.push('ORIGINAL_RESEARCH_INSUFFICIENT');
      for (const plan of plans) {
        if (!budget.canStart()) break;
        const results = await doSearch(plan.query, 'candidate');
        searches.push({ ...plan, results });
      }
      report.candidateSearches = searches.map(({ intent, query: text, results }) => ({ intent, query: text, resultCount: results.length,
        exactModels: [...new Set(results.map((item) => refrigeratorCandidateIdentity(item, originalModel).identity?.baseModel).filter(Boolean))] }));
      const pool = aggregateRefrigeratorResults(searches, facts, originalModel);
      report.internalCandidatePool = pool.map((item) => ({ model: item.model, fullSku: item.identity.fullSku,
        source: item.result.url, discoveryPriority: item.discoveryPriority, foundBy: item.foundBy }));
      for (const item of pool) await processCandidate(item, searches);
    }
  } catch (error) {
    report.reasonCodes.push(searchStage === 'candidate' ? 'CANDIDATE_SEARCH_FAILED' : 'SEARCH_FAILED');
    report.error = error.code || error.message;
  }
  if (!evidence.length && report.fetchResults.some((item) => item.usableText)) report.reasonCodes.push('SOURCE_EXTRACTION_FAILED');
  if (!evidence.length && report.fetchResults.some((item) => !item.usableText)) report.reasonCodes.push('SOURCE_FETCH_FAILED');
  if (!evidence.length) report.reasonCodes.push('ORIGINAL_RESEARCH_INSUFFICIENT');
  if (budget.reached) { report.reasonCodes.push(DEADLINE_REACHED); report.deadlineReached = true; }
  const result = await recommendFromInterpretation({ input: { query, notes }, originalInterpretation: interpretation,
    candidateProvider: { async discoverCandidates() { return drafts; } }, discoveryLimit: MAX_CANDIDATES });
  const noCurrentRetail = !drafts.length && report.retail.rejected.length > 0;
  if (noCurrentRetail) report.reasonCodes.push(NO_CURRENT_RETAIL_REPLACEMENT);
  else if (!drafts.length) report.reasonCodes.push('BASELINE_FALLBACK_USED');
  if (noCurrentRetail) report.refinementSuggestions = [NO_RETAIL_REFINEMENT, ...result.refinementSuggestions];
  report.original = { view: describeOriginal({ interpretation, evidence }), facts: interpretation.normalizedOriginal.facts };
  report.recommendation = { primary: result.primaryRecommendation, alternatives: result.alternatives,
    rankingExplanation: result.rankingExplanation, internalPoolCount: result.internalPoolCount, rejectedSummary: result.rejectedSummary };
  report.evidence = evidence;
  const originalCore = ['capacityCuFt', 'configuration', 'widthIn', 'heightIn', 'depthIn'].every((key) => report.original.facts[key]?.status === 'KNOWN');
  const candidateCore = drafts.some((draft) => ['totalCapacityCuFt', 'configurationFloor'].every((key) => draft.facts[key]?.status === 'KNOWN'));
  const manufacturerOriginal = report.originalEvidence === ORIGINAL_EVIDENCE.MANUFACTURER;
  report.retrievalQuality = manufacturerOriginal && originalCore && candidateCore && result.primaryRecommendation ? 'RETRIEVED_STRONG'
    : evidence.length ? 'RETRIEVED_PARTIAL' : report.selectedSources.length ? 'RETRIEVAL_WEAK' : 'RETRIEVAL_FAILED';
  return report;
}
