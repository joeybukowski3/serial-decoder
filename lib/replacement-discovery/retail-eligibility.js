import { classifySource } from './evidence-normalizer.js';

/**
 * Deterministic retail eligibility for a replacement candidate. This is a HARD gate that runs before LKQ evaluation: a
 * candidate must be sold NEW, be currently purchasable and sit in the current catalog, from the manufacturer itself or a
 * first-party major U.S. retailer. Price is observed and reported separately; it never enters similarity scoring.
 *
 * Fails closed: anything not affirmatively proven by the fetched page (purchase path, condition, seller, catalog status)
 * leaves the candidate ineligible. Page text is only ever matched against fixed patterns; it is never interpreted.
 */

export const RETAIL_POLICY_VERSION = '1.0.0';
/** A model more than this many model years behind the current year is legacy regardless of what its page shows. */
export const MAX_MODEL_YEARS_BEHIND = 3;
export const NO_CURRENT_RETAIL_REPLACEMENT = 'NO_CURRENT_RETAIL_REPLACEMENT';

const MAX_PAGE_CHARS = 200_000;
const MAX_LD_JSON_CHARS = 100_000;
const MAX_PRICE = 1_000_000;
const NONE = null;

/** `[domain, display name, first-party seller pattern, marketplace-capable (needs an explicit first-party seller)]`. */
const RETAILERS = Object.freeze([
  ['bestbuy.com', 'Best Buy', /^(?:the\s+)?best\s*buy\b/i, false],
  ['homedepot.com', 'The Home Depot', /^(?:the\s+)?home\s*depot\b/i, false],
  ['lowes.com', "Lowe's", /^lowe['’]?s\b/i, false],
  ['costco.com', 'Costco', /^costco\b/i, false],
  ['samsclub.com', "Sam's Club", /^sam['’]?s\s*club\b/i, false],
  ['walmart.com', 'Walmart', /^walmart(?:\.com)?\b/i, true],
  ['target.com', 'Target', /^target(?:\.com)?\b/i, true],
  ['abt.com', 'Abt', /^abt\b/i, false],
  ['crutchfield.com', 'Crutchfield', /^crutchfield\b/i, false],
  ['ajmadison.com', 'AJ Madison', /^aj\s*madison\b/i, false],
  ['appliancesconnection.com', 'Appliances Connection', /^appliances\s*connection\b/i, false],
]);
/** Manufacturer sites that serve several countries from one domain; only the U.S. storefront counts. */
const US_ONLY_MANUFACTURERS = Object.freeze(['samsung.com', 'lg.com']);

const IN_STOCK = new Set(['InStock', 'LimitedAvailability', 'OnlineOnly', 'InStoreOnly']);
const OUT_OF_STOCK = new Set(['OutOfStock', 'SoldOut', 'Discontinued', 'PreOrder', 'PreSale', 'BackOrder']);
const NEW_CONDITION = 'NewCondition';
const NON_NEW_CONDITIONS = new Set(['UsedCondition', 'RefurbishedCondition', 'DamagedCondition']);

// Deliberately narrow: marketing copy ("faster than the previous model") and recycling notices ("end of life") appear on current pages.
const DISCONTINUED = /\b(?:discontinued|no longer (?:available|sold|offered|manufactured|in production)|has been retired)\b/i;
const ARCHIVED = /\b(?:archived (?:product|page|model)|legacy (?:product|model))\b/i;
const ARCHIVED_PATH = /\/(?:archive|archived|legacy|previous-models?)(?:\/|$)/i;
const OUT_OF_STOCK_TEXT = /\b(?:out of stock|sold out|currently unavailable|temporarily unavailable|unavailable for purchase|notify me|coming soon|pre-?order|back-?order)\b/i;
const NON_NEW_TEXT = /\b(?:used|pre-?owned|refurbished|re-?newed|reconditioned|open[\s-]?box|scratch (?:and|&) dent|as-is|auction)\b/i;
const PURCHASE_CONTROL = /\b(?:add to (?:cart|bag|basket)|buy now)\b/i;
const DISABLED_CONTROL = /<(?:button|a|input)\b[^>]*(?:\bdisabled\b|aria-disabled=["']true["'])[^>]*>[^<]{0,40}(?:add to (?:cart|bag|basket)|buy now)/i;
const PRICE_TEXT = /\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/;
const SOLD_BY = /\b(?:sold|shipped|fulfilled)(?:\s+and\s+(?:sold|shipped|fulfilled))?\s+by[:\s]+([A-Za-z0-9][A-Za-z0-9'’&.\- ]{1,40})/gi;

const key = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const tail = (value) => String(value || '').split('/').pop();
const hostIs = (host, domain) => host === domain || host.endsWith(`.${domain}`);

/** True for a multi-country manufacturer site (samsung.com, lg.com) outside its `/us/` storefront (for example /ca/, /latin_en/). */
export function isNonUsStorefront(host, path) {
  return US_ONLY_MANUFACTURERS.some((domain) => hostIs(String(host || '').replace(/^www\./, ''), domain)) && !/^\/us(?:\/|$)/i.test(String(path || ''));
}

function decodeEntities(value) {
  return value.replace(/&(?:nbsp|amp|quot|lt|gt|#39|#34|#x27);/gi, (entity) =>
    ({ '&nbsp;': ' ', '&amp;': '&', '&quot;': '"', '&lt;': '<', '&gt;': '>', '&#39;': "'", '&#34;': '"', '&#x27;': "'" })[entity.toLowerCase()] || ' ');
}

function pageText(html) {
  return decodeEntities(String(html).slice(0, MAX_PAGE_CHARS)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ').replace(/<\/(?:p|div|li|tr|h[1-6]|title|button)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')).replace(/[ \t\r ]+/g, ' ');
}

function headings(html) {
  return [...String(html).slice(0, MAX_PAGE_CHARS).matchAll(/<(?:title|h1)\b[^>]*>([\s\S]*?)<\/(?:title|h1)>/gi)].map((match) => pageText(match[1]).trim());
}

/** Product JSON-LD nodes (any depth of @graph/array) whose identity names the expected model. */
function productNodes(html, model) {
  const nodes = [];
  for (const match of String(html).slice(0, MAX_PAGE_CHARS).matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    if (match[1].length > MAX_LD_JSON_CHARS) continue;
    try {
      const data = JSON.parse(match[1]);
      const list = Array.isArray(data) ? data : Array.isArray(data?.['@graph']) ? data['@graph'] : [data];
      for (const item of list) {
        const types = [].concat(item?.['@type'] || []).map((type) => String(type).toLowerCase());
        // Real pages vary the case ("product" on lg.com), so the type is compared case-insensitively. Multi-size pages
        // (samsung.com) publish a ProductGroup whose per-model offers live in `hasVariant`; each variant is judged on its own.
        if (types.includes('product')) nodes.push(item);
        if (types.includes('productgroup')) nodes.push(...[].concat(item.hasVariant || []).filter((variant) => variant && typeof variant === 'object'));
      }
    } catch { /* Malformed untrusted structured data supplies nothing. */ }
  }
  const named = (node) => [node.sku, node.mpn, node.model, node.name, node.productID, node['@id'], node.url].some((field) => key(field).includes(model));
  return { all: nodes, matching: nodes.filter(named) };
}

function offersOf(product) {
  const flat = [].concat(product?.offers || []).flatMap((offer) => (offer?.offers ? [offer, ...[].concat(offer.offers)] : [offer]));
  return flat.filter((offer) => offer && typeof offer === 'object');
}

function structuredOffer(products) {
  const offers = products.flatMap(offersOf);
  const offer = offers.find((item) => item.availability) || offers[0] || null;
  if (!offer) return { availability: NONE, condition: NONE, price: NONE, currency: NONE, sellers: [] };
  const amount = Number(offer.price ?? offer.lowPrice);
  const sellers = offers.map((item) => (typeof item.seller === 'string' ? item.seller : item.seller?.name)).filter(Boolean).map(String);
  return { availability: tail(offer.availability) || NONE, condition: tail(offer.itemCondition) || NONE,
    price: Number.isFinite(amount) && amount > 0 && amount < MAX_PRICE ? Math.round(amount * 100) / 100 : NONE,
    currency: offer.priceCurrency ? String(offer.priceCurrency).toUpperCase() : NONE, sellers };
}

function sourceFor(host, brand) {
  const retailer = RETAILERS.find(([domain]) => hostIs(host, domain));
  if (retailer) return { sellerType: 'RETAILER', name: retailer[1], pattern: retailer[2], explicitSeller: retailer[3] };
  const classification = classifySource(host, brand);
  const root = host.split('.').slice(-2).join('.');
  const name = root.replace(/^./, (char) => char.toUpperCase());
  if (classification.sourceClass === 'MANUFACTURER') return { sellerType: 'MANUFACTURER', name, pattern: new RegExp(`^${String(brand).replace(/[^A-Za-z0-9]/g, '')}\\b`, 'i'), explicitSeller: false };
  if (classification.sourceType === 'MARKETPLACE_LISTING') return { sellerType: 'MARKETPLACE', name, pattern: null, explicitSeller: false };
  return { sellerType: 'UNKNOWN', name, pattern: null, explicitSeller: false };
}

/** First-party retailers can host third-party sellers; seller names found on the page decide, and unknown stays unverified. */
function resolveSeller(source, structuredSellers, text, reasons) {
  if (source.sellerType !== 'RETAILER') return source.sellerType;
  const names = (structuredSellers.length ? structuredSellers : [...text.matchAll(SOLD_BY)].map((match) => match[1])).map((name) => name.trim());
  if (!names.length) {
    if (source.explicitSeller) reasons.push('SELLER_NOT_VERIFIED');
    return source.explicitSeller ? 'UNKNOWN' : 'RETAILER';
  }
  if (names.every((name) => source.pattern.test(name))) return 'RETAILER';
  reasons.push('THIRD_PARTY_SELLER');
  return 'MARKETPLACE';
}

function safeSourceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port ? `${url.origin}${url.pathname}` : NONE;
  } catch { return NONE; }
}

const currentYear = (now) => new Date(typeof now === 'function' ? now() : now).getUTCFullYear();

/** Result for a candidate whose page could not be read: never eligible, never silently dropped from diagnostics. */
export function unassessedRetailEligibility({ url = null, host = null, brand = null, reason = 'PAGE_UNAVAILABLE', now = Date.now } = {}) {
  let name = host;
  try { name = name || new URL(url).hostname.replace(/^www\./, ''); } catch { /* keep null */ }
  return { policyVersion: RETAIL_POLICY_VERSION, condition: 'UNKNOWN', purchaseStatus: 'UNKNOWN', catalogStatus: 'UNKNOWN',
    sellerType: name ? sourceFor(name, brand).sellerType : 'UNKNOWN', sourceName: name, sourceUrl: url ? safeSourceUrl(url) : NONE,
    observedPrice: NONE, observedAt: new Date(typeof now === 'function' ? now() : now).toISOString(), eligible: false, reasons: [reason] };
}

/**
 * @param {{html: string, url: string, brand: string, model: string, modelYear?: number|null, now?: number|(() => number)}} input
 * @returns {{policyVersion: string, condition: 'NEW'|'UNKNOWN'|'NON_NEW', purchaseStatus: 'AVAILABLE'|'UNAVAILABLE'|'UNKNOWN',
 *   catalogStatus: 'CURRENT'|'LEGACY'|'UNKNOWN', sellerType: 'RETAILER'|'MANUFACTURER'|'MARKETPLACE'|'UNKNOWN', sourceName: string|null,
 *   sourceUrl: string|null, observedPrice: {amount: number, currency: string}|null, observedAt: string, eligible: boolean, reasons: string[]}}
 */
export function assessRetailEligibility({ html, url, brand, model, modelYear = null, now = Date.now }) {
  let parsed;
  try { parsed = new URL(url); } catch { return unassessedRetailEligibility({ url, brand, reason: 'INVALID_SOURCE_URL', now }); }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const path = (() => { try { return decodeURIComponent(parsed.pathname); } catch { return parsed.pathname; } })();
  const expected = key(model);
  const reasons = [];
  const source = sourceFor(host, brand);
  const text = pageText(html);
  const titles = headings(html);
  const { all, matching } = productNodes(html, expected);
  const offer = structuredOffer(matching);

  const identified = key(path).includes(expected) || titles.some((title) => key(title).includes(expected)) || matching.length > 0;
  const sellerType = resolveSeller(source, offer.sellers, text, reasons);
  const firstParty = sellerType === 'RETAILER' || sellerType === 'MANUFACTURER';

  // Condition: explicit structured/head evidence decides; a first-party catalog page with no condition markers is new retail.
  const headText = [...titles, path, ...matching.map((node) => node.name)].join(' ');
  const nonNew = NON_NEW_CONDITIONS.has(offer.condition) || NON_NEW_TEXT.test(headText);
  let condition = 'UNKNOWN';
  if (nonNew) { condition = 'NON_NEW'; reasons.push('NOT_SOLD_NEW'); }
  else if (offer.condition === NEW_CONDITION) condition = 'NEW';
  else if (firstParty) { condition = 'NEW'; reasons.push('CONDITION_ASSUMED_NEW_FIRST_PARTY'); }
  else reasons.push('CONDITION_NOT_VERIFIED');

  const discontinued = DISCONTINUED.test(text) || DISCONTINUED.test(headText) || offer.availability === 'Discontinued';
  const archived = ARCHIVED.test(text) || ARCHIVED_PATH.test(path);
  const yearsBehind = Number.isFinite(modelYear) ? currentYear(now) - modelYear : null;
  const farBehind = yearsBehind !== null && yearsBehind > MAX_MODEL_YEARS_BEHIND;
  const nonUs = isNonUsStorefront(host, path) || (offer.currency !== NONE && offer.currency !== 'USD');

  let purchaseStatus = 'UNKNOWN';
  if (!identified) reasons.push('PAGE_MODEL_NOT_CONFIRMED');
  else if (discontinued) { purchaseStatus = 'UNAVAILABLE'; reasons.push('DISCONTINUED'); }
  else if (nonUs) { purchaseStatus = 'UNAVAILABLE'; reasons.push('NOT_U_S_STOREFRONT'); }
  else if (OUT_OF_STOCK.has(offer.availability)) { purchaseStatus = 'UNAVAILABLE'; reasons.push('STRUCTURED_NOT_PURCHASABLE'); }
  else if (IN_STOCK.has(offer.availability)) { purchaseStatus = 'AVAILABLE'; reasons.push('STRUCTURED_IN_STOCK'); }
  else if (OUT_OF_STOCK_TEXT.test(text)) { purchaseStatus = 'UNAVAILABLE'; reasons.push('PAGE_NOT_PURCHASABLE'); }
  else if (PURCHASE_CONTROL.test(text) && !DISABLED_CONTROL.test(String(html)) && PRICE_TEXT.test(text)) { purchaseStatus = 'AVAILABLE'; reasons.push('PURCHASE_CONTROL_WITH_PRICE'); }
  else reasons.push(all.length && !matching.length ? 'STRUCTURED_OFFER_MODEL_MISMATCH' : 'NO_AFFIRMATIVE_PURCHASE_EVIDENCE');

  let catalogStatus = 'UNKNOWN';
  if (discontinued || archived || farBehind) {
    catalogStatus = 'LEGACY';
    if (archived) reasons.push('ARCHIVED_PAGE');
    if (farBehind) reasons.push('MODEL_YEAR_FAR_BEHIND_CURRENT');
  } else if (purchaseStatus === 'AVAILABLE') catalogStatus = 'CURRENT';

  if (!firstParty && sellerType !== 'MARKETPLACE') reasons.push('SELLER_NOT_FIRST_PARTY');
  const eligible = condition === 'NEW' && purchaseStatus === 'AVAILABLE' && catalogStatus === 'CURRENT' && firstParty;
  const observedPrice = eligible && offer.price !== NONE ? { amount: offer.price, currency: offer.currency || 'USD' } : NONE;
  return { policyVersion: RETAIL_POLICY_VERSION, condition, purchaseStatus, catalogStatus, sellerType, sourceName: source.name,
    sourceUrl: safeSourceUrl(url), observedPrice, observedAt: new Date(typeof now === 'function' ? now() : now).toISOString(),
    eligible, reasons: eligible ? ['ELIGIBLE_NEW_CURRENT_RETAIL', ...reasons] : [...new Set(reasons)] };
}

const rejectionRank = (item) => (item.catalogStatus === 'LEGACY' ? 0 : item.purchaseStatus === 'UNAVAILABLE' ? 1 : 2);

/** Several pages can speak for one model: any eligible page qualifies it; otherwise the most informative rejection is kept. */
export function pickRetailEligibility(list) {
  const items = (list || []).filter(Boolean);
  if (!items.length) return NONE;
  const eligible = items.filter((item) => item.eligible);
  if (eligible.length) return eligible.find((item) => item.observedPrice) || eligible[0];
  return [...items].sort((a, b) => rejectionRank(a) - rejectionRank(b))[0];
}

/** Sentence-free guidance shown when no candidate survives; wording lives in the public layer. */
export const NO_RETAIL_REFINEMENT = Object.freeze({ fieldKey: 'retailAvailability',
  prompt: 'Check the manufacturer’s site or a major U.S. retailer for the current model in this series, then look that model number up here.' });
