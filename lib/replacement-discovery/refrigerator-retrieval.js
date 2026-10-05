import { interpretReplacementSearch } from './interpret.js';
import { applyOriginalEnrichment, describeOriginal } from './original-enrichment.js';
import { recommendFromInterpretation } from './recommend.js';
import { stableId } from './normalize-adapter.js';
import { classifySource } from './evidence-normalizer.js';
import { searchProducts } from './providers/explicit-search.js';
import { fetchSource } from './providers/guarded-page-fetch.js';
import { visibleText } from './retrieval-first.js';
import { normalizeRefrigeratorConfiguration } from '../replacement-core/refrigerator-configuration.js';

export const REFRIGERATOR_RETRIEVAL_VERSION = '1.1.0';
export const REFRIGERATOR_TEST_QUERY = 'LG LRFCS25D3S refrigerator';
const ORIGINAL_MODEL = 'LRFCS25D3S';
const MAX_CANDIDATE_QUERIES = 4;
const MAX_CANDIDATES = 6;
const MAX_SOURCES_PER_MODEL = 2;
const BRANDS = Object.freeze({ 'lg.com': 'LG', 'samsung.com': 'Samsung', 'geappliances.com': 'GE', 'whirlpool.com': 'Whirlpool', 'frigidaire.com': 'Frigidaire', 'kitchenaid.com': 'KitchenAid' });
const RETAILERS = ['bestbuy.com', 'abt.com', 'homedepot.com', 'lowes.com', 'ajmadison.com'];
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

export function refrigeratorSourcePriority(result, model, brand = 'LG') {
  let url;
  try { url = new URL(result.url); } catch { return 99; }
  const path = decodeURIComponent(url.pathname).toUpperCase();
  if (url.protocol !== 'https:' || url.hostname.replace(/^www\./, '') !== result.domain || !path.includes(modelKey(model))) return 99;
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
  const counterValue = specValue(/^Counter Depth\b/i) || valueAfter(/^Counter Depth\b/i);
  const depth = `${title} ${valueAfter(/^Depth Type\b/i)} ${specValue(/^Standard\/Counter Depth\b/i)} ${counterValue}`;
  if (/^(?:no|false)\b/i.test(counterValue) || /\b(?:standard[\s-]*depth|not[\s-]*counter[\s-]*depth|non[\s-]*counter[\s-]*depth)\b/i.test(depth)) facts.counterDepth = false;
  else if (/^(?:yes|true)\b/i.test(counterValue) || /\bcounter[\s-]*depth\b/i.test(depth) && !/\bbuilt[\s-]*in look\b/i.test(depth)) facts.counterDepth = true;
  if (/^yes\b/i.test(specValue(/^Standard Depth$/i))) facts.counterDepth = false;
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

/** Resolve exact-model sources in priority order; finer manufacturer capacity supersedes nominal marketing capacity. */
export function mergeRefrigeratorSources(boundSources) {
  const facts = {}, evidence = boundSources.flatMap((item) => item.evidence);
  for (const { facts: supplied } of boundSources) for (const [key, incoming] of Object.entries(supplied)) {
    const current = facts[key];
    if (!current) { facts[key] = incoming; continue; }
    if (current.value === incoming.value) {
      facts[key] = { ...current, evidenceRefs: [...new Set([...current.evidenceRefs, ...incoming.evidenceRefs])],
        sourceIds: [...new Set([...current.sourceIds, ...incoming.sourceIds])],
        ...(incoming.precisionCuFt && (!current.precisionCuFt || incoming.precisionCuFt < current.precisionCuFt) ? { precisionCuFt: incoming.precisionCuFt } : {}),
        ...(incoming.capacityBasis === 'TOTAL_SPECIFICATION' ? { capacityBasis: incoming.capacityBasis } : {}) };
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
    else facts[key] = { status: 'AMBIGUOUS', value: null, alternatives: [current.value, incoming.value],
      evidenceRefs: [...new Set([...current.evidenceRefs, ...incoming.evidenceRefs])],
      sourceIds: [...new Set([...current.sourceIds, ...incoming.sourceIds])], basis: 'SOURCE_CONFLICT' };
  }
  return { facts, evidence };
}

export async function runRefrigeratorProof({ query = REFRIGERATOR_TEST_QUERY, search = searchProducts, fetchPage = fetchSource } = {}) {
  if (query !== REFRIGERATOR_TEST_QUERY) throw new Error('FIXED_TEST_ITEM_ONLY');
  let interpretation = interpretReplacementSearch({ query });
  const report = { version: REFRIGERATOR_RETRIEVAL_VERSION, queries: [], searchAttemptCount: 0, searchRequestCount: 0,
    selectedSources: [], fetchResults: [], mergeDiagnostics: [], candidateSearches: [], internalCandidatePool: [], candidateDiscovery: [],
    original: null, recommendation: null, retrievalQuality: 'RETRIEVAL_FAILED', reasonCodes: [] };
  const evidence = [], drafts = [];
  let searchStage = 'original';
  async function doSearch(text, purpose, role = purpose) {
    searchStage = purpose;
    report.searchAttemptCount += 1; report.searchRequestCount += 1;
    // `purpose` is the provider-validated request role (original | candidate); `role` is the orchestration label.
    const entry = { query: text, purpose, role, ok: false, resultCount: 0, error: null };
    report.queries.push(entry);
    try {
      const results = await search({ query: text, purpose, limit: 10 });
      Object.assign(entry, { ok: true, resultCount: results.length });
      return results;
    } catch (error) {
      entry.error = error.code || error.message;
      if (error.diagnostics) entry.diagnostics = error.diagnostics;
      if (error.code === 'SERPER_API_KEY_MISSING') report.searchRequestCount -= 1;
      throw error;
    }
  }
  async function fetchExact(result, model, brand, role) {
    if (report.selectedSources.filter((source) => source.model === model && source.role === role).length >= MAX_SOURCES_PER_MODEL) return null;
    const source = { ...result, id: `source-${report.selectedSources.length + 1}`, model, brand, role };
    report.selectedSources.push(source);
    try {
      const fetched = await fetchPage(result.url);
      const usable = fetched.status === 200 && Boolean(fetched.text);
      const { facts: raw, diagnostics } = usable ? inspectRefrigeratorSource(fetched.text, model, { sourceUrl: source.url, brand })
        : { facts: {}, diagnostics: null };
      const bound = bindRefrigeratorFacts(raw, source);
      const accepted = bound.facts.model?.value === modelKey(model);
      report.fetchResults.push({ sourceId: source.id, status: fetched.status, usableText: usable,
        finalUrl: fetched.url || result.url, redirectCount: fetched.redirectCount || 0, truncated: Boolean(fetched.truncated),
        contentType: fetched.contentType || null, bytesRead: fetched.bytesRead ?? null, textLength: String(fetched.text || '').length,
        extractedFields: Object.keys(raw), extraction: diagnostics, bound: accepted,
        outcome: !usable ? 'SOURCE_FETCH_FAILED' : accepted ? 'FACTS_BOUND' : 'SOURCE_EXTRACTION_FAILED', error: null });
      return accepted ? { source, bound } : null;
    } catch (error) {
      report.fetchResults.push({ sourceId: source.id, status: null, usableText: false, outcome: 'SOURCE_FETCH_FAILED', error: error.code || error.message });
      return null;
    }
  }
  async function researchModel(model, brand, role, initialResults, allowRetailer = false) {
    const exact = initialResults.filter((item) => refrigeratorSourcePriority(item, model, brand) < 99)
      .filter((item) => allowRetailer || sourceClass(item, brand) === 'MANUFACTURER')
      .sort((a, b) => refrigeratorSourcePriority(a, model, brand) - refrigeratorSourcePriority(b, model, brand));
    const gathered = [];
    for (const item of exact) {
      if (gathered.length >= MAX_SOURCES_PER_MODEL) break;
      const page = await fetchExact(item, model, brand, role);
      if (!page) continue;
      gathered.push(page.bound);
      if (!needsEnrichment(mergeRefrigeratorSources(gathered).facts)) break;
    }
    const merged = mergeRefrigeratorSources(gathered);
    report.mergeDiagnostics.push({ model, role, inputSourceCount: gathered.length,
      inputFactCounts: gathered.map((item) => Object.keys(item.facts).length), outputFactCount: Object.keys(merged.facts).length,
      ambiguousFactKeys: Object.entries(merged.facts).filter(([, fact]) => fact.status === 'AMBIGUOUS').map(([key]) => key) });
    return merged;
  }
  try {
    const originalQueries = [`${ORIGINAL_MODEL} LG refrigerator specifications site:lg.com`, `${ORIGINAL_MODEL} LG refrigerator site:lg.com`];
    let originalResults = [];
    for (const text of originalQueries) {
      originalResults.push(...(await doSearch(text, 'original')).filter((item) => refrigeratorSourcePriority(item, ORIGINAL_MODEL, 'LG') < 99));
      originalResults = [...new Map(originalResults.map((item) => [item.url, item])).values()]
        .sort((a, b) => refrigeratorSourcePriority(a, ORIGINAL_MODEL, 'LG') - refrigeratorSourcePriority(b, ORIGINAL_MODEL, 'LG'));
      if (originalResults.some((item) => refrigeratorSourcePriority(item, ORIGINAL_MODEL, 'LG') === 1)) break;
    }
    if (originalResults.length) {
      let bound = await researchModel(ORIGINAL_MODEL, 'LG', 'original', originalResults);
      if (needsEnrichment(bound.facts)) {
        const supplemental = await doSearch(`${ORIGINAL_MODEL} LG builder spec sheet pdf site:lg.com`, 'original', 'original-spec');
        const extra = await researchModel(ORIGINAL_MODEL, 'LG', 'original', supplemental.filter((item) =>
          !report.selectedSources.some((source) => source.url === item.url)));
        bound = mergeRefrigeratorSources([bound, extra]);
      }
      if (bound.facts.model) {
        evidence.push(...bound.evidence);
        interpretation = applyOriginalEnrichment(interpretation, bound).interpretation;
      }
    }
    if (evidence.length) {
      const facts = interpretation.normalizedOriginal.facts;
      const searches = [];
      const plans = planRefrigeratorQueries(facts);
      if (!plans.length) report.reasonCodes.push('ORIGINAL_RESEARCH_INSUFFICIENT');
      for (const plan of plans) {
        const results = await doSearch(plan.query, 'candidate');
        searches.push({ ...plan, results });
      }
      report.candidateSearches = searches.map(({ intent, query: text, results }) => ({ intent, query: text, resultCount: results.length,
        exactModels: [...new Set(results.map((item) => refrigeratorCandidateIdentity(item).identity?.baseModel).filter(Boolean))] }));
      const pool = aggregateRefrigeratorResults(searches, facts);
      report.internalCandidatePool = pool.map((item) => ({ model: item.model, fullSku: item.identity.fullSku,
        source: item.result.url, discoveryPriority: item.discoveryPriority, foundBy: item.foundBy }));
      for (const item of pool) {
        const sameModel = [...new Map(searches.flatMap((search) => search.results)
          .filter((entry) => refrigeratorSourcePriority(entry, item.model, item.identity.brand) < 99)
          .map((entry) => [entry.url, entry])).values()];
        let bound = await researchModel(item.model, item.identity.brand, 'candidate', sameModel);
        if (needsEnrichment(bound.facts)) {
          const supplemental = await doSearch(`${item.model} ${item.identity.brand} builder spec sheet pdf site:${item.identity.brand.toLowerCase()}.com`, 'candidate', 'candidate-spec');
          const extra = await researchModel(item.model, item.identity.brand, 'candidate', supplemental.filter((entry) =>
            !report.selectedSources.some((source) => source.url === entry.url)));
          bound = mergeRefrigeratorSources([bound, extra]);
        }
        if (needsEnrichment(bound.facts)) {
          const retailer = await researchModel(item.model, item.identity.brand, 'candidate', sameModel
            .filter((entry) => sourceClass(entry, item.identity.brand) === 'RETAILER'), true);
          bound = mergeRefrigeratorSources([bound, retailer]);
        }
        if (!bound.facts.model) continue;
        const source = report.selectedSources.find((entry) => entry.id === bound.facts.model.sourceIds?.[0]);
        evidence.push(...bound.evidence);
        const identityFacts = { category: { status: 'KNOWN', value: 'refrigerator', evidenceRefs: [], basis: 'DISCOVERY_CONTEXT' }, ...bound.facts };
        drafts.push({ candidateId: stableId('retrieved-fridge', item.model), category: 'refrigerator', facts: identityFacts,
          source: { kind: 'EXPLICIT_RETRIEVAL', name: source.domain }, relationship: 'SAME_BRAND_ALTERNATIVE',
          discoveryConfidence: 'MEDIUM', evidenceRefs: bound.evidence.map((entry) => entry.evidenceId), providerRank: null });
        report.candidateDiscovery.push({ model: item.model, fullSku: item.identity.fullSku, source: source.url,
          discoveryPriority: item.discoveryPriority, foundBy: item.foundBy, facts: bound.facts });
      }
    }
  } catch (error) {
    report.reasonCodes.push(searchStage === 'candidate' ? 'CANDIDATE_SEARCH_FAILED' : 'SEARCH_FAILED');
    report.error = error.code || error.message;
  }
  if (!evidence.length && report.fetchResults.some((item) => item.usableText)) report.reasonCodes.push('SOURCE_EXTRACTION_FAILED');
  if (!evidence.length && report.fetchResults.some((item) => !item.usableText)) report.reasonCodes.push('SOURCE_FETCH_FAILED');
  if (!evidence.length) report.reasonCodes.push('ORIGINAL_RESEARCH_INSUFFICIENT');
  const result = await recommendFromInterpretation({ input: { query, notes: '' }, originalInterpretation: interpretation,
    candidateProvider: { async discoverCandidates() { return drafts; } }, discoveryLimit: MAX_CANDIDATES });
  if (!drafts.length) report.reasonCodes.push('BASELINE_FALLBACK_USED');
  report.original = { view: describeOriginal({ interpretation, evidence }), facts: interpretation.normalizedOriginal.facts };
  report.recommendation = { primary: result.primaryRecommendation, alternatives: result.alternatives,
    rankingExplanation: result.rankingExplanation, internalPoolCount: result.internalPoolCount, rejectedSummary: result.rejectedSummary };
  report.evidence = evidence;
  const originalCore = ['capacityCuFt', 'configuration', 'widthIn', 'heightIn', 'depthIn'].every((key) => report.original.facts[key]?.status === 'KNOWN');
  const candidateCore = drafts.some((draft) => ['totalCapacityCuFt', 'configurationFloor'].every((key) => draft.facts[key]?.status === 'KNOWN'));
  report.retrievalQuality = originalCore && candidateCore && result.primaryRecommendation ? 'RETRIEVED_STRONG'
    : evidence.length ? 'RETRIEVED_PARTIAL' : report.selectedSources.length ? 'RETRIEVAL_WEAK' : 'RETRIEVAL_FAILED';
  return report;
}
