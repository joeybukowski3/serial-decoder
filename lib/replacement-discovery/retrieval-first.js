import { interpretReplacementSearch } from './interpret.js';
import { applyOriginalEnrichment, describeOriginal } from './original-enrichment.js';
import { recommendFromInterpretation } from './recommend.js';
import { stableId } from './normalize-adapter.js';
import { classifySource } from './evidence-normalizer.js';
import { searchProducts } from './providers/explicit-search.js';
import { fetchSource } from './providers/guarded-page-fetch.js';

export const TEST_QUERY = 'Samsung QN55Q80C';
const MODEL = 'QN55Q80C';
const MAX_ORIGINAL_SEARCH = 3;
const MAX_CANDIDATE_SEARCH = 4;
const MAX_ORIGINAL_FETCH = 3;
const MAX_CANDIDATE_FETCH = 6;
const EXTRACT_FIELDS = ['model', 'fullModel', 'screenSizeIn', 'measuredDiagonalIn', 'resolution', 'displayTechnology', 'refreshHz', 'smart', 'hdr', 'widthIn', 'heightIn', 'depthIn', 'series', 'modelYear', 'availability'];
const URL_ALLOWLIST = ['samsung.com', 'bestbuy.com', 'abt.com', 'crutchfield.com', 'rtings.com'];
const hostMatches = (domain, base) => domain === base || domain.endsWith(`.${base}`);
const safeDomain = (domain) => URL_ALLOWLIST.some((base) => hostMatches(domain, base));
const modelKey = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const TV_MODEL_YEAR_VERSION = '1.0.0';
const SAMSUNG_YEAR_SUFFIX = Object.freeze({ R: 2019, C: 2023, D: 2024, F: 2025 });

export function candidateModelYear(result, identity) {
  const model = identity.baseModel;
  const suffix = model.match(/^QN\d{2}(?:QN\d{2}|Q\d{1,2})([A-Z])$/)?.[1];
  const registered = SAMSUNG_YEAR_SUFFIX[suffix] || null;
  const wording = `${result.title} ${result.snippet}`;
  const explicit = wording.match(/\b(?:2019|2023|2024|2025)\b/);
  const stated = explicit ? Number(explicit[0]) : null;
  if (registered && stated && registered !== stated) return { year: null, basis: 'CONFLICT', registryVersion: TV_MODEL_YEAR_VERSION };
  return { year: registered || stated, basis: registered ? 'EXACT_MODEL_NAMING_REGISTRY' : stated ? 'SEARCH_RESULT_WORDING' : 'UNKNOWN', registryVersion: TV_MODEL_YEAR_VERSION };
}

export function sourcePriority(result, model) {
  if (!safeDomain(result.domain)) return 99;
  const haystack = `${result.title} ${new URL(result.url).pathname}`.toUpperCase();
  if (!haystack.includes(modelKey(model))) return 99;
  if (hostMatches(result.domain, 'samsung.com')) return /support|manual|specification/.test(result.url.toLowerCase()) ? 2 : 1;
  if (['bestbuy.com', 'abt.com', 'crutchfield.com'].some((domain) => hostMatches(result.domain, domain))) return 3;
  return 4;
}

const SAMSUNG_TV_MODEL = /\bQN\d{2}(?:QN\d{2}|Q\d{1,2})[A-Z](?:AAFXZA|AFXZA|APXPA|AFXZC)?\b/gi;
const SKU_SUFFIXES = ['AAFXZA', 'AFXZA', 'APXPA', 'AFXZC'];

export function candidateIdentity(result) {
  let url;
  try { url = new URL(result.url); } catch { return { identity: null, reason: 'INVALID_URL' }; }
  const domain = url.hostname.toLowerCase().replace(/^www\./, '');
  if (url.protocol !== 'https:' || domain !== result.domain || !safeDomain(domain)) return { identity: null, reason: 'UNTRUSTED_SOURCE' };
  const classification = classifySource(domain, 'Samsung');
  if (!['MANUFACTURER', 'RETAILER'].includes(classification.sourceClass)) return { identity: null, reason: 'UNSUPPORTED_SOURCE_CLASS' };
  if (domain.includes('community.') || /\b(?:used|refurbished|refurb|open.box|pre.owned|marketplace)\b/i.test(`${result.title} ${url.pathname} ${result.snippet}`))
    return { identity: null, reason: 'NON_PRODUCT_OR_SECONDHAND' };
  let path;
  try { path = decodeURIComponent(url.pathname).toLowerCase(); } catch { return { identity: null, reason: 'INVALID_URL' }; }
  const leaf = path.split('/').filter(Boolean).at(-1) || '';
  const productPage = classification.sourceClass === 'MANUFACTURER'
    ? /\/tvs\//.test(path) && !/buying-guide|all-tvs/.test(path) && !/-tvs$/.test(leaf)
      && /\d{2,3}-(?:inch|class)|qn\d{2}/.test(leaf)
    : /\/(?:p_|site\/|product\/)/.test(path);
  if (!productPage) return { identity: null, reason: 'GENERIC_OR_NON_PRODUCT_PAGE' };
  const fields = { title: String(result.title || ''), url: path, snippet: String(result.snippet || '') };
  const found = Object.entries(fields).flatMap(([field, value]) => [...value.matchAll(SAMSUNG_TV_MODEL)].map(([token]) => {
    const full = token.toUpperCase();
    const suffix = SKU_SUFFIXES.find((item) => full.endsWith(item)) || null;
    return { field, baseModel: suffix ? full.slice(0, -suffix.length) : full, fullSku: suffix ? full : null, regionalSuffix: suffix };
  }));
  if (!found.length) return { identity: null, reason: 'NO_EXACT_MODEL_IN_RESULT' };
  const models = [...new Set(found.map((item) => item.baseModel))];
  if (models.length !== 1) return { identity: null, reason: 'CONFLICTING_MODELS_IN_RESULT' };
  if (models[0] === MODEL) return { identity: null, reason: 'SAME_AS_ORIGINAL' };
  const chosen = found.find((item) => item.fullSku) || found[0];
  return { identity: { ...chosen, sourceFields: [...new Set(found.map((item) => item.field))],
    currentStatus: /\bdiscontinued\b/i.test(`${result.title} ${result.snippet}`) ? 'DISCONTINUED' : 'UNKNOWN' }, reason: 'ACCEPTED_EXACT_PRODUCT' };
}

export function candidateModel(result) {
  return candidateIdentity(result).identity?.baseModel || null;
}

const verified = (facts, key) => facts[key]?.status === 'KNOWN' && facts[key]?.evidenceRefs?.length
  ? facts[key].value : null;

/** Search hypotheses from retrieved original facts; no candidate identity is generated here. */
export function planCandidateQueries(facts) {
  const brand = String(verified(facts, 'brand') || 'Samsung');
  const size = verified(facts, 'screenSizeIn');
  const family = String(verified(facts, 'series') || '').match(/\b(Q\d{1,2})\b/i)?.[1]?.toUpperCase();
  const display = verified(facts, 'displayTechnology');
  const resolution = verified(facts, 'resolution');
  const refresh = verified(facts, 'refreshHz');
  const base = [brand, size].filter(Boolean).join(' ');
  const intents = [
    ...(family ? [
      { intent: 'SAME_FAMILY_CURRENT', query: `${brand} ${family} ${size || ''} current model site:samsung.com` },
      { intent: 'SAME_FAMILY_SUCCESSOR_SEARCH', query: `${brand} ${family} successor ${size || ''} site:samsung.com` },
    ] : []),
    { intent: 'SAME_PERFORMANCE_CLASS', query: [base, display, resolution, refresh ? `${refresh}Hz` : null, 'current model site:samsung.com'].filter(Boolean).join(' ') },
    { intent: 'BROAD_FALLBACK', query: [base, display, 'current model site:samsung.com'].filter(Boolean).join(' ') },
  ];
  return intents.map(({ intent, query }) => ({ intent, query: query.replace(/\s+/g, ' ').trim() }))
    .filter(({ query }, index, all) => all.findIndex((item) => item.query === query) === index).slice(0, MAX_CANDIDATE_SEARCH);
}

/** The score orders page fetches only. It is never passed to replacement-core. */
export function discoveryPriority(result, identity, facts) {
  const family = String(verified(facts, 'series') || '').match(/\b(Q\d{1,2})\b/i)?.[1]?.toUpperCase();
  const size = verified(facts, 'screenSizeIn');
  const display = String(verified(facts, 'displayTechnology') || '').toUpperCase();
  const refresh = verified(facts, 'refreshHz');
  const originalYear = verified(facts, 'modelYear');
  const modelYear = candidateModelYear(result, identity);
  const haystack = `${result.title} ${result.url} ${result.snippet}`.toUpperCase();
  const reasons = [];
  if (family && new RegExp(`^QN\\d{2}${family}[A-Z]`).test(identity.baseModel)) reasons.push('SAME_FAMILY');
  if (size && identity.baseModel.startsWith(`QN${size}`)) reasons.push('SAME_SIZE');
  if (display && haystack.includes(display)) reasons.push('DISPLAY_CLASS');
  if (refresh && new RegExp(`\\b${refresh}\\s*HZ\\b`).test(haystack)) reasons.push('REFRESH_MATCH');
  if (hostMatches(result.domain, 'samsung.com')) reasons.push('MANUFACTURER_PAGE');
  const currentWording = /\bcurrent (?:model|lineup)\b/i.test(`${result.title} ${result.snippet}`)
    && (!modelYear.year || modelYear.year >= new Date().getUTCFullYear() - 1);
  const retailStock = /\bin stock\b/i.test(`${result.title} ${result.snippet}`);
  if (identity.currentStatus !== 'DISCONTINUED' && (currentWording || retailStock)
    && (!modelYear.year || !originalYear || modelYear.year >= originalYear)) reasons.push('CURRENT_WORDING');
  const yearAdjustment = originalYear && modelYear.year ? modelYear.year < originalYear
    ? -Math.min(40, (originalYear - modelYear.year) * 10) : Math.min(8, (modelYear.year - originalYear) * 2) : 0;
  return { score: (reasons.includes('SAME_FAMILY') ? 100 : 0) + (reasons.includes('SAME_SIZE') ? 20 : 0)
    + (reasons.includes('DISPLAY_CLASS') ? 5 : 0) + (reasons.includes('REFRESH_MATCH') ? 10 : 0)
    + (reasons.includes('MANUFACTURER_PAGE') ? 3 : 0)
    + (reasons.includes('CURRENT_WORDING') ? 1 : 0) + yearAdjustment
    - (identity.currentStatus === 'DISCONTINUED' ? 50 : 0), reasons, modelYear, yearAdjustment };
}

export function aggregateCandidateResults(searches, facts) {
  const byModel = new Map();
  for (const { query, intent, results } of searches) for (const result of results) {
    const identity = candidateIdentity(result).identity;
    if (!identity) continue;
    const priority = discoveryPriority(result, identity, facts);
    const match = { query, intent, url: result.url };
    const existing = byModel.get(identity.baseModel);
    if (!existing) {
      byModel.set(identity.baseModel, { model: identity.baseModel, identity, result, discoveryPriority: priority, foundBy: [match] });
    } else {
      if (!existing.foundBy.some((entry) => entry.query === query && entry.url === result.url)) existing.foundBy.push(match);
      if (priority.score > existing.discoveryPriority.score || (priority.score === existing.discoveryPriority.score
        && sourcePriority(result, identity.baseModel) < sourcePriority(existing.result, existing.model))) {
        existing.result = result; existing.identity = identity; existing.discoveryPriority = priority;
      }
    }
  }
  return [...byModel.values()].sort((a, b) => b.discoveryPriority.score - a.discoveryPriority.score
    || sourcePriority(a.result, a.model) - sourcePriority(b.result, b.model) || a.model.localeCompare(b.model)).slice(0, 6);
}

function decodeEntities(value) {
  return value.replace(/&(?:nbsp|amp|quot|lt|gt|#39|#34);/gi, (entity) => ({ '&nbsp;': ' ', '&amp;': '&', '&quot;': '"', '&lt;': '<', '&gt;': '>', '&#39;': "'", '&#34;': '"' })[entity.toLowerCase()] || ' ');
}

/** Deterministic extraction: page instructions are never sent to a model or interpreted as commands. */
export function visibleText(html) {
  return decodeEntities(String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[^]*?-->/g, ' ')
    .replace(/<\/(?:p|div|li|tr|h[1-6]|title)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ').replace(/[ \t\r\u00a0]+/g, ' ')).slice(0, 120_000);
}

function pageProductData(html) {
  for (const match of String(html).matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    if (match[1].length > 100_000) continue;
    try {
      const data = JSON.parse(match[1]);
      const products = Array.isArray(data) ? data : Array.isArray(data['@graph']) ? data['@graph'] : [data];
      const product = products.find((item) => item && (item['@type'] === 'Product' || item['@type']?.includes?.('Product')));
      if (product) return product;
    } catch { /* Ignore malformed untrusted page data. */ }
  }
  return null;
}

export function extractTvFacts(html, model, expectedIdentity = null) {
  const headings = [...String(html).matchAll(/<(?:title|h1)\b[^>]*>([\s\S]*?)<\/(?:title|h1)>/gi)].map((match) => visibleText(match[1]));
  const product = pageProductData(html);
  const modelField = [...String(html).matchAll(/<input\b[^>]*>/gi)].map(([tag]) => tag)
    .find((tag) => /\bid=["'](?:apiChangeModelCode|originShopSku)["']/i.test(tag));
  const fullModel = modelField?.match(/\bvalue=["']([A-Z0-9]+)["']/i)?.[1]
    || String(product?.sku || product?.model || '').toUpperCase();
  const expected = modelKey(model);
  const family = expected.match(/^QN\d{2}(Q(?:N)?\d{1,2}[A-Z])/)?.[1];
  const headingMatch = headings.some((heading) => modelKey(heading).includes(expected));
  const structuredMatch = fullModel.startsWith(expected) && headings.some((heading) => family && modelKey(heading).includes(family));
  const urlMatch = expectedIdentity?.sourceUrl && expectedIdentity?.fullSku
    && new URL(expectedIdentity.sourceUrl).pathname.toUpperCase().includes(expectedIdentity.fullSku);
  if (expectedIdentity?.fullSku && fullModel && fullModel !== expectedIdentity.fullSku) return {};
  if (expectedIdentity ? !(structuredMatch || (urlMatch && headings.some((heading) => family && modelKey(heading).includes(family))))
    : !headingMatch && !structuredMatch) return {};
  const text = visibleText(html);
  const lines = text.split(/\n/).map((line) => line.trim()).filter(Boolean);
  const labeled = (label) => {
    for (let i = 0; i < lines.length; i += 1) {
      const match = lines[i].match(label);
      if (match && lines[i].length < 160) return (lines[i].slice(match[0].length).replace(/^\s*[:：-]\s*/, '').trim() || lines[i + 1] || '').slice(0, 160);
    }
    return '';
  };
  const title = headings.join(' ');
  const productText = `${title} ${product?.name || ''} ${product?.description || ''}`;
  const facts = { model: expected };
  if (fullModel && fullModel.startsWith(expected)) facts.fullModel = fullModel;
  const size = (String(product?.size || '') || labeled(/^Screen Size\b/i) || title).match(/\b(\d{2,3})\s*(?:["”]|-?inch\b|in\b|class\b)/i);
  if (size) facts.screenSizeIn = Number(size[1]);
  const measured = (labeled(/^(?:Actual|Measured|Viewable) (?:Screen )?Diagonal\b/i) || lines.find((line) => /measured diagonally/i.test(line)) || '').match(/\b(\d{2,3}\.\d)\s*(?:["”]|-?inches?\b|in\b)/i);
  if (measured) facts.measuredDiagonalIn = Number(measured[1]);
  if (/\b(?:3,?840\s*[x×]\s*2,?160|4K|UHD)\b/i.test(labeled(/^Resolution\b/i) || productText)) facts.resolution = '4K';
  const display = `${labeled(/^(?:Product|Display Technology|Panel Type)\b/i)} ${productText}`.match(/\b(NEO\s+QLED|MINI\s+LED|QLED|OLED|LED|LCD)\b/i);
  if (display) facts.displayTechnology = display[1].replace(/\s+/g, ' ').toUpperCase();
  const refresh = labeled(/^(?:Native )?Refresh Rate\b/i).match(/\b(\d{2,3})\s*Hz\b/i);
  if (refresh) facts.refreshHz = Number(refresh[1]);
  if (/\b(?:Smart\s+TV|Smart\s+Hub|Tizen)\b/i.test(`${productText} ${labeled(/^Operating System\b/i)} ${labeled(/^Smart (?:TV|Hub)\b/i)}`)) facts.smart = true;
  const hdr = labeled(/^HDR(?: \([^)]*\))?/i).match(/(Quantum HDR\+?|HDR10\+?|Dolby Vision|HDR)(?!\w)/i);
  if (hdr) facts.hdr = hdr[1].toUpperCase();
  const year = title.match(/\b(20\d{2})\b/) || labeled(/^Model Year\b/i).match(/\b(20\d{2})\b/);
  if (year) facts.modelYear = Number(year[1]);
  const series = title.match(/\b(Q\d{1,2}[A-Z])\b/i);
  if (series) facts.series = `${series[1].slice(0, -1).toUpperCase()} Series`;
  if (product?.offers?.availability === 'https://schema.org/InStock') facts.availability = 'IN_STOCK';
  const dimensions = labeled(/^Set Size without Stand \(WxHxD\)/i).match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(mm|inches|inch|in)\b/i);
  if (dimensions) for (const [index, key] of ['widthIn', 'heightIn', 'depthIn'].entries())
    facts[key] = Math.round(Number(dimensions[index + 1]) / (dimensions[4].toLowerCase() === 'mm' ? 25.4 : 1) * 100) / 100;
  return Object.fromEntries(Object.entries(facts).filter(([key, value]) => EXTRACT_FIELDS.includes(key) && value !== null));
}

export function validateAiExtraction(output, { source, text, model, requestedFields }) {
  if (!output || typeof output !== 'object' || Array.isArray(output)
    || Object.keys(output).some((key) => !requestedFields.includes(key))) return {};
  const facts = {};
  for (const [key, entry] of Object.entries(output)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
      || Object.keys(entry).some((name) => !['value', 'sourceIds'].includes(name))
      || !Array.isArray(entry.sourceIds) || entry.sourceIds.length !== 1 || entry.sourceIds[0] !== source.id) continue;
    const value = entry.value;
    if (key === 'model' && value !== model) continue;
    if (key === 'fullModel' && (typeof value !== 'string' || !modelKey(value).startsWith(modelKey(model)))) continue;
    if (['screenSizeIn', 'measuredDiagonalIn', 'refreshHz', 'widthIn', 'heightIn', 'depthIn', 'modelYear'].includes(key)
      && (typeof value !== 'number' || !Number.isFinite(value))) continue;
    if (key === 'smart' && value !== true) continue;
    if (['resolution', 'displayTechnology', 'hdr', 'series', 'model', 'fullModel'].includes(key)
      && (typeof value !== 'string' || !value || value.length > 80)) continue;
    const token = key === 'resolution' && value === '4K' ? /\b(?:4K|UHD|3,?840\s*[x×]\s*2,?160)\b/i
      : key === 'smart' ? /\b(?:Smart TV|Smart Hub|Tizen)\b/i
        : new RegExp(String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*'), 'i');
    if (!token.test(text)) continue;
    facts[key] = value;
  }
  return facts;
}

export function bindFacts(raw, source, suppliedSources) {
  if (!suppliedSources.some((item) => item.id === source.id)) return { facts: {}, evidence: [] };
  const facts = {}, evidence = [];
  const classification = classifySource(source.domain, 'Samsung');
  for (const [key, value] of Object.entries(raw)) {
    if (!EXTRACT_FIELDS.includes(key)) continue;
    const evidenceId = stableId('retrieved', `${source.id}|${key}|${JSON.stringify(value)}`);
    facts[key] = { status: ['MANUFACTURER', 'RETAILER'].includes(classification.sourceClass) ? 'KNOWN' : 'INFERRED', value, evidenceRefs: [evidenceId], sourceIds: [source.id], basis: 'RETRIEVED_PAGE' };
    evidence.push({ contractVersion: '1.0.0', evidenceId, sourceType: classification.sourceType, sourceName: source.title,
      url: source.url, sourceClass: classification.sourceClass, observedAt: new Date().toISOString(),
      claim: { fieldKey: key, value, subjectModel: source.model }, confidence: classification.sourceClass === 'MANUFACTURER' ? 'HIGH' : 'MEDIUM',
      firstParty: classification.sourceClass === 'MANUFACTURER', supports: ['SPECIFICATION'], domain: source.domain, sourceRank: classification.baseRank });
  }
  return { facts, evidence };
}

const emptyProvider = { async discoverCandidates() { return []; } };
export async function runRetrievalProof({ query = TEST_QUERY, search = searchProducts, fetchPage = fetchSource, aiExtract = null } = {}) {
  if (query !== TEST_QUERY) throw new Error('FIXED_TEST_ITEM_ONLY');
  let interpretation = interpretReplacementSearch({ query });
  const report = { provider: 'serper', queries: [], searchAttemptCount: 0, searchRequestCount: 0, retrievedResults: [], selectedSources: [], fetchResults: [],
    original: null, candidateDiscovery: [], recommendation: null, retrievalQuality: 'RETRIEVAL_FAILED', reasonCodes: [], refinementSuggestions: [] };
  const sources = []; const evidence = []; const candidateDrafts = [];
  const searchCounts = { original: 0, candidate: 0 };
  const fetchCounts = { original: 0, candidate: 0 };
  async function doSearch(searchQuery, purpose) {
    if (searchCounts[purpose] >= (purpose === 'original' ? MAX_ORIGINAL_SEARCH : MAX_CANDIDATE_SEARCH)) return [];
    report.searchAttemptCount += 1; report.searchRequestCount += 1; report.queries.push({ query: searchQuery, purpose });
    searchCounts[purpose] += 1;
    const results = await search({ query: searchQuery, purpose, limit: 10 });
    report.retrievedResults.push(...results.map((item) => ({ ...item, purpose })));
    return results;
  }
  async function selected(result, model, role, expectedIdentity = null) {
    if (fetchCounts[role] >= (role === 'original' ? MAX_ORIGINAL_FETCH : MAX_CANDIDATE_FETCH)) return null;
    fetchCounts[role] += 1;
    const source = { ...result, id: `source-${sources.length + 1}`, model, sourceType: classifySource(result.domain, 'Samsung').sourceType, role };
    sources.push(source); report.selectedSources.push(source);
    try {
      const fetched = await fetchPage(result.url);
      const usable = fetched.status === 200 && Boolean(fetched.text);
      report.fetchResults.push({ sourceId: source.id, status: fetched.status, elapsedMs: fetched.elapsedMs, contentType: fetched.contentType, usableText: usable, error: null });
      if (!usable) return null;
      const facts = extractTvFacts(fetched.text, model, expectedIdentity && { ...expectedIdentity, sourceUrl: source.url });
      if (aiExtract) {
        const requestedFields = EXTRACT_FIELDS.filter((key) => facts[key] === undefined);
        if (requestedFields.length) {
          const text = visibleText(fetched.text);
          try {
            const output = await aiExtract({ sourceId: source.id, sourceUrl: source.url, sourceDomain: source.domain,
              text, requestedFields });
            Object.assign(facts, validateAiExtraction(output, { source, text, model, requestedFields }));
          } catch { /* Optional extraction must not discard deterministic facts. */ }
        }
      }
      return { source, facts };
    } catch (error) {
      report.fetchResults.push({ sourceId: source.id, status: null, elapsedMs: null, contentType: null, usableText: false, error: error.message });
      return null;
    }
  }
  try {
    let originalResults = await doSearch('Samsung QN55Q80C specifications', 'original');
    let exact = originalResults.filter((item) => sourcePriority(item, MODEL) < 99)
      .sort((a, b) => sourcePriority(a, MODEL) - sourcePriority(b, MODEL));
    if (!exact.length) {
      originalResults = await doSearch('Samsung QN55Q80C site:samsung.com', 'original');
      exact = originalResults.filter((item) => sourcePriority(item, MODEL) < 99).sort((a, b) => sourcePriority(a, MODEL) - sourcePriority(b, MODEL));
    }
    if (exact.length) {
      const fetched = await selected(exact[0], MODEL, 'original');
      if (fetched) {
        const bound = bindFacts(fetched.facts, fetched.source, sources);
        evidence.push(...bound.evidence);
        interpretation = applyOriginalEnrichment(interpretation, { facts: bound.facts, evidence: bound.evidence }).interpretation;
      }
    }
    if (evidence.length) {
      const originalFacts = interpretation.normalizedOriginal.facts;
      const searches = [];
      for (const plan of planCandidateQueries(originalFacts)) {
        const results = await doSearch(plan.query, 'candidate');
        searches.push({ ...plan, results });
        if (aggregateCandidateResults(searches, originalFacts).filter((item) =>
          item.discoveryPriority.reasons.some((reason) => ['SAME_FAMILY', 'REFRESH_MATCH'].includes(reason))).length >= 3) break;
      }
      const candidates = aggregateCandidateResults(searches, originalFacts);
      report.candidateSearches = searches.map(({ query: candidateQuery, intent, results }) => ({
        query: candidateQuery, intent, resultCount: results.length,
        exactModels: [...new Set(results.map((item) => candidateIdentity(item).identity?.baseModel).filter(Boolean))],
      }));
      report.internalCandidatePool = candidates.map((item) => ({ model: item.model, fullSku: item.identity.fullSku,
        url: item.result.url, discoveryPriority: item.discoveryPriority, foundBy: item.foundBy }));
      for (const item of candidates) {
        const fetched = await selected(item.result, item.model, 'candidate', item.identity);
        if (!fetched) continue;
        const bound = bindFacts(fetched.facts, fetched.source, sources); evidence.push(...bound.evidence);
        const identityEvidenceId = stableId('retrieved', `${fetched.source.id}|model|${item.model}`);
        evidence.push({ contractVersion: '1.0.0', evidenceId: identityEvidenceId, sourceType: fetched.source.sourceType, sourceName: fetched.source.title,
          url: fetched.source.url, sourceClass: classifySource(fetched.source.domain, 'Samsung').sourceClass, observedAt: new Date().toISOString(),
          claim: { fieldKey: 'model', value: item.model, subjectModel: item.model }, confidence: 'HIGH', firstParty: hostMatches(fetched.source.domain, 'samsung.com'), supports: ['IDENTITY'] });
        const facts = { category: { status: 'KNOWN', value: 'television', evidenceRefs: [], basis: 'DISCOVERY_CONTEXT' },
          brand: { status: 'KNOWN', value: 'Samsung', evidenceRefs: [identityEvidenceId] },
          model: { status: 'KNOWN', value: item.model, evidenceRefs: [identityEvidenceId] }, ...bound.facts };
        const refs = [identityEvidenceId, ...bound.evidence.map((entry) => entry.evidenceId)];
        candidateDrafts.push({ candidateId: stableId('retrieved-candidate', item.model), category: 'television', facts,
          source: { kind: 'EXPLICIT_RETRIEVAL', name: fetched.source.domain }, relationship: 'SAME_BRAND_ALTERNATIVE', discoveryConfidence: bound.evidence.length ? 'MEDIUM' : 'LOW', evidenceRefs: refs, providerRank: null });
        report.candidateDiscovery.push({ model: item.model, fullSku: item.identity.fullSku, regionalSuffix: item.identity.regionalSuffix,
          currentStatus: item.identity.currentStatus, identityFields: item.identity.sourceFields,
          sourceId: fetched.source.id, url: fetched.source.url, discoveryPriority: item.discoveryPriority,
          foundBy: item.foundBy, facts: bound.facts });
      }
    }
  } catch (error) {
    if (error.code === 'SERPER_API_KEY_MISSING') report.searchRequestCount -= 1;
    report.reasonCodes.push('WEB_RETRIEVAL_UNAVAILABLE'); report.error = error.code || error.message;
  }
  if (!report.retrievedResults.length) report.reasonCodes.push('WEB_RETRIEVAL_EMPTY');
  if (report.fetchResults.some((result) => !result.usableText) || (report.retrievedResults.length && !evidence.length)) report.reasonCodes.push('WEB_RETRIEVAL_PARTIAL');
  const result = await recommendFromInterpretation({ input: { query, notes: '' }, originalInterpretation: interpretation,
    candidateProvider: { async discoverCandidates() { return candidateDrafts; } }, discoveryLimit: 6 });
  if (!candidateDrafts.length) report.reasonCodes.push('BASELINE_FALLBACK_USED');
  report.original = { view: describeOriginal({ interpretation, evidence }), facts: interpretation.normalizedOriginal.facts };
  report.recommendation = { primary: result.primaryRecommendation, alternatives: result.alternatives, rankingExplanation: result.rankingExplanation,
    internalPoolCount: result.internalPoolCount, rejectedSummary: result.rejectedSummary };
  report.refinementSuggestions = result.refinementSuggestions;
  report.evidence = evidence;
  const originalKeys = new Set(evidence.filter((item) => item.claim.subjectModel === MODEL).map((item) => item.claim.fieldKey));
  const candidateHasCoreFacts = candidateDrafts.some((draft) => ['screenSizeIn', 'resolution', 'displayTechnology'].every((key) => draft.facts[key]?.evidenceRefs?.length));
  report.retrievalQuality = originalKeys.has('resolution') && originalKeys.has('displayTechnology') && originalKeys.has('screenSizeIn')
    && candidateHasCoreFacts && result.primaryRecommendation ? 'RETRIEVED_STRONG'
    : evidence.length ? 'RETRIEVED_PARTIAL' : report.retrievedResults.length ? 'RETRIEVAL_WEAK' : 'RETRIEVAL_FAILED';
  return report;
}
