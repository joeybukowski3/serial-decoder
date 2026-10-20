import { isSameModel, normalizeBrandIdentity } from './normalize.js';

const SUPPORT_CATEGORIES = new Set([
  'technical_support', 'software_security_updates', 'warranty_service', 'repair_parts_support',
]);
const RETAIL_EVENT = 'normal_new_product_retail_sales_end';
const SUPPORT_EVENT = 'manufacturer_support_end';
export const LIFECYCLE_PROVENANCE = Symbol('smart-age-lifecycle-provenance');

// Optional facts from the age research already in progress. A missing fact is
// preferable to turning a production stop or a last-seen listing into a date.
export const LIFECYCLE_RESEARCH_PROMPT = `
Optional lifecycle facts: only report a date when the same research already performed for the age estimate directly documents it. Do not perform another search just for these facts. Omit unsupported facts. A production stop, product discontinuation, sold-out listing, warranty duration, or assumed service life is not an end of normal new-product retail sales or an end of manufacturer support. For each fact give the exact product/model, explicit event, date at the source's precision (YYYY, YYYY-MM, or YYYY-MM-DD), high/medium/low confidence, a short evidence excerpt containing the event and date, and the URL of that particular retrieved source. Retail facts must name the market/region. Support facts must name exactly one category: technical_support, software_security_updates, warranty_service, or repair_parts_support. If sources conflict, return the conflicting claims instead of choosing a date. Never invent a date or URL.
"endOfRetailAvailability": [{"product": "exact product/model", "event": "normal_new_product_retail_sales_end", "date": "YYYY, YYYY-MM, or YYYY-MM-DD", "market": "named market/region", "confidence": "high | medium | low", "evidenceExcerpt": "source text stating event and date", "sourceUrl": "retrieved HTTPS URL"}],
"endOfManufacturerSupport": [{"product": "exact product/model", "event": "manufacturer_support_end", "date": "YYYY, YYYY-MM, or YYYY-MM-DD", "supportCategory": "technical_support | software_security_updates | warranty_service | repair_parts_support", "confidence": "high | medium | low", "evidenceExcerpt": "source text stating category and date", "sourceUrl": "retrieved HTTPS URL"}]
Return empty arrays when absent.`;

function dateValue(value, currentYear) {
  if (typeof value !== 'string' || !/^(?:18|19|20|21)\d{2}(?:-\d{2}(?:-\d{2})?)?$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  if (year > currentYear + 1) return null;
  if (value.length === 4) return { value, precision: 'year' };
  if (value.length === 7) return Number(value.slice(5)) >= 1 && Number(value.slice(5)) <= 12
    ? { value, precision: 'month' } : null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value
    ? null : { value, precision: 'day' };
}

function exactSource(url, sources) {
  if (typeof url !== 'string' || !/^https:\/\//i.test(url)) return null;
  try {
    const wanted = new URL(url).href;
    return sources.find((source) => source?.uri && new URL(source.uri).href === wanted) || null;
  } catch (_) { return null; }
}

function containsModelTokens(value, model) {
  const modelTokens = String(model).toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  const valueTokens = String(value).toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  return modelTokens.length > 0 && valueTokens.some((_, index) =>
    modelTokens.every((token, offset) => valueTokens[index + offset] === token));
}

function matchesProduct(product, queryInfo) {
  if (typeof product !== 'string' || !product.trim()) return false;
  if (queryInfo?.brand && !normalizeBrandIdentity(product).includes(normalizeBrandIdentity(queryInfo.brand))) return false;
  const exact = queryInfo?.exactModel || (queryInfo?.modelCompleteness === 'exact' ? queryInfo.modelIdentity : null);
  if (exact) return containsModelTokens(product, exact);
  const named = queryInfo?.modelLineName || queryInfo?.productFamily
    || (queryInfo?.querySpecificity === 'free-description' ? queryInfo.providerQuery : null);
  if (!named) return false;
  return normalizeBrandIdentity(product).includes(normalizeBrandIdentity(named));
}

function requestedMarket(queryInfo) {
  const query = String(queryInfo?.query || queryInfo?.providerQuery || '').toLowerCase();
  const markets = [
    [/\b(?:usa|u\.s\.|united states)\b/, 'US'],
    [/\b(?:uk|u\.k\.|united kingdom)\b/, 'UK'],
    [/\bcanada\b/, 'Canada'],
    [/\b(?:europe|european union|eu)\b/, 'EU'],
    [/\baustralia\b/, 'Australia'],
  ];
  return markets.find(([pattern]) => pattern.test(query))?.[1] || null;
}

function marketName(value) {
  const text = String(value || '').trim();
  if (!text || text.length > 80) return null;
  if (/^(?:us|usa|u\.s\.|united states)$/i.test(text)) return 'US';
  if (/^(?:uk|u\.k\.|united kingdom)$/i.test(text)) return 'UK';
  if (/^canada$/i.test(text)) return 'Canada';
  if (/^(?:eu|europe|european union)$/i.test(text)) return 'EU';
  if (/^australia$/i.test(text)) return 'Australia';
  return text;
}

function sourceMarket(source) {
  try {
    const url = new URL(source.uri);
    const firstPath = url.pathname.split('/').filter(Boolean)[0]?.toLowerCase();
    return ({ us: 'US', usa: 'US', uk: 'UK', gb: 'UK', ca: 'Canada', eu: 'EU', au: 'Australia' })[firstPath] || null;
  } catch (_) { return null; }
}

function excerptNamesMarket(excerpt, market) {
  const aliases = {
    US: /\b(?:US|USA|United States)\b/i,
    UK: /\b(?:UK|United Kingdom)\b/i,
    Canada: /\bCanada\b/i,
    EU: /\b(?:EU|Europe|European Union)\b/i,
    Australia: /\bAustralia\b/i,
  };
  return aliases[market]
    ? aliases[market].test(excerpt)
    : String(excerpt).toLowerCase().includes(market.toLowerCase());
}

function evidenceDate(text, currentYear) {
  const dates = [];
  let remaining = text;
  const month = '(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
  const monthNumber = (name) => String(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    .indexOf(name.slice(0, 3).toLowerCase()) + 1).padStart(2, '0');
  const collect = (pattern, value) => {
    remaining = remaining.replace(pattern, (...match) => {
      dates.push(dateValue(value(...match), currentYear));
      return ' '.repeat(match[0].length);
    });
  };
  collect(/\b((?:18|19|20|21)\d{2}-\d{2}-\d{2})\b/g, (_, value) => value);
  collect(new RegExp(`\\b${month}\\s+(\\d{1,2})(?:st|nd|rd|th)?[,]?\\s+((?:18|19|20|21)\\d{2})\\b`, 'gi'),
    (_, name, day, year) => `${year}-${monthNumber(name)}-${day.padStart(2, '0')}`);
  collect(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${month}\\s+((?:18|19|20|21)\\d{2})\\b`, 'gi'),
    (_, day, name, year) => `${year}-${monthNumber(name)}-${day.padStart(2, '0')}`);
  collect(/\b((?:18|19|20|21)\d{2}-\d{2})\b/g, (_, value) => value);
  collect(new RegExp(`\\b${month}\\s+((?:18|19|20|21)\\d{2})\\b`, 'gi'),
    (_, name, year) => `${year}-${monthNumber(name)}`);
  if (/\b\d{1,2}[/.]\d{1,2}[/.](?:18|19|20|21)\d{2}\b/.test(remaining)) return null;
  collect(/\b((?:18|19|20|21)\d{2})\b/g, (_, value) => value);
  if (!dates.length || dates.some((date) => !date)) return null;
  const mostPrecise = dates.sort((left, right) => right.value.length - left.value.length)[0];
  return dates.every((date) => mostPrecise.value.startsWith(date.value)) ? mostPrecise : null;
}

function excerptSupports(text, kind, supportCategory) {
  text = String(text || '').trim().slice(0, 1000);
  if (!text) return false;
  if (/\b(?:not ended|not discontinued|will not end|did not end|may end|might end|expected to end|planned to end)\b/i.test(text)) return false;
  if (kind === 'retail') {
    return /\b(?:retail\s+(?:sales|availability)|available for (?:purchase|sale))\b/i.test(text)
      && /\b(?:end|ended|cease|ceased|stop|stopped|no longer|discontinu)/i.test(text)
      && !/\b(?:production|manufactur(?:e|ing)|retailer|sold out|out of stock)\b/i.test(text);
  }
  const categoryWords = {
    technical_support: /\btechnical support\b/i,
    software_security_updates: /\b(?:software|security|firmware) updates?\b/i,
    warranty_service: /\bwarranty (?:service|support)\b/i,
    repair_parts_support: /\b(?:repair|replacement) parts?\b/i,
  };
  if (Object.entries(categoryWords).some(([category, pattern]) =>
    category !== supportCategory && pattern.test(text))) return false;
  return categoryWords[supportCategory]?.test(text)
    && !/\b(?:continues|still available|remains available|remains active)\b/i.test(text)
    && /\b(?:end|ended|cease|ceased|stop|stopped|until|last|expir)/i.test(text);
}

function validateOne(entry, kind, sources, queryInfo, currentYear) {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.event !== (kind === 'retail' ? RETAIL_EVENT : SUPPORT_EVENT)) return null;
  if (!['high', 'medium'].includes(entry.confidence)) return null;
  if (!matchesProduct(entry.product, queryInfo)) return null;
  const date = dateValue(entry.date, currentYear);
  const source = exactSource(entry.sourceUrl, sources);
  if (!date || !source) return null;
  const market = kind === 'retail' ? marketName(entry.market) : null;
  const requested = requestedMarket(queryInfo);
  if (kind === 'retail' && (!market || (requested && market !== requested)
    || (sourceMarket(source) && sourceMarket(source) !== market))) return null;
  if (kind === 'support' && !SUPPORT_CATEGORIES.has(entry.supportCategory)) return null;
  const texts = Array.isArray(source.evidenceText) ? source.evidenceText : [];
  const supportingSentences = texts.flatMap((text) => String(text).split(/[.!?]\s+/)).filter((sentence) =>
    matchesProduct(sentence, queryInfo)
    && excerptSupports(sentence, kind, entry.supportCategory)
    && (kind !== 'retail' || excerptNamesMarket(sentence, market)));
  if (!supportingSentences.length) return null;
  const evidenceDates = supportingSentences.map((sentence) => evidenceDate(sentence, currentYear));
  if (evidenceDates.some((candidate) => !candidate)) return null;
  const supportedDate = evidenceDates.sort((left, right) => right.value.length - left.value.length)[0];
  if (evidenceDates.some((candidate) => !supportedDate.value.startsWith(candidate.value))
    || !supportedDate.value.startsWith(date.value)) return null;
  return {
    date: supportedDate.value,
    precision: supportedDate.precision,
    confidence: entry.confidence,
    product: entry.product.trim().slice(0, 160),
    ...(kind === 'retail' ? { market } : { supportCategory: entry.supportCategory }),
    source: { title: source.title, uri: source.uri },
  };
}

function acceptedField(value, kind, sources, queryInfo, currentYear) {
  const entries = Array.isArray(value) ? value : (value ? [value] : []);
  if (!entries.length || entries.length > 5) return null;
  const accepted = entries.map((entry) => validateOne(entry, kind, sources, queryInfo, currentYear));
  // A conflicting or invalid claim means the field is ambiguous, not a choice
  // between whichever candidates happen to pass validation.
  if (accepted.some((entry) => !entry)) return null;
  const first = accepted[0];
  if (accepted.some((entry) => entry.date !== first.date
    || entry.market !== first.market || entry.supportCategory !== first.supportCategory)) return null;
  return first;
}

export function normalizeLifecycleFields(raw, { sources = [], queryInfo = {}, currentYear = new Date().getFullYear() } = {}) {
  try {
    return {
      endOfRetailAvailability: acceptedField(raw?.endOfRetailAvailability, 'retail', sources, queryInfo, currentYear),
      endOfManufacturerSupport: acceptedField(raw?.endOfManufacturerSupport, 'support', sources, queryInfo, currentYear),
    };
  } catch (_) {
    return { endOfRetailAvailability: null, endOfManufacturerSupport: null };
  }
}

function sameValidatedField(left, right) {
  return Boolean(left && right && left.date === right.date && left.precision === right.precision
    && left.confidence === right.confidence && left.product === right.product
    && left.market === right.market && left.supportCategory === right.supportCategory
    && left.source?.uri === right.source?.uri && left.source?.title === right.source?.title);
}

export function createLifecycleProvenance(raw, validated, sources, queryInfo, currentYear) {
  const claims = {};
  for (const field of ['endOfRetailAvailability', 'endOfManufacturerSupport']) {
    if (validated?.[field] && raw?.[field]) claims[field] = raw[field];
  }
  if (!Object.keys(claims).length || !Array.isArray(sources)) return null;
  const urls = new Set(Object.values(claims).flatMap((value) =>
    (Array.isArray(value) ? value : [value]).map((claim) => claim?.sourceUrl)));
  const citedSources = sources.filter((source) => urls.has(source?.uri));
  const proof = JSON.parse(JSON.stringify({ claims, sources: citedSources,
    exactModel: queryInfo?.exactModel || null }));
  const checked = normalizeLifecycleFields(proof.claims, { sources: proof.sources, queryInfo, currentYear });
  return Object.keys(claims).every((field) => sameValidatedField(checked[field], validated[field]))
    ? proof : null;
}

// The second age normalization pass and Redis reads receive fields that were
// already accepted by the server. Recheck their core shape and retained URL.
export function restoreLifecycleFields(raw, { sources = [], queryInfo = {}, currentYear = new Date().getFullYear(), requestIdentityValidated = false,
  cacheRead = false, provenance = null } = {}) {
  const storedModel = raw?.exactModel;
  const originalModel = queryInfo?.exactModel || (queryInfo?.modelCompleteness === 'exact' ? queryInfo.modelIdentity : null);
  if (storedModel && originalModel && !isSameModel(storedModel, originalModel)) {
    return { endOfRetailAvailability: null, endOfManufacturerSupport: null };
  }
  const canUseStoredModel = requestIdentityValidated
    && typeof storedModel === 'string' && storedModel.trim()
    && ['high', 'medium'].includes(raw?.identityConfidence)
    && (!raw?.model || isSameModel(raw.model, storedModel))
    && containsModelTokens(raw?.likelyProduct, storedModel)
    && (originalModel ? isSameModel(originalModel, storedModel) : containsModelTokens(queryInfo?.query, storedModel))
    && (!queryInfo?.brand || normalizeBrandIdentity(raw?.brand) === normalizeBrandIdentity(queryInfo.brand));
  if (storedModel && !originalModel && !canUseStoredModel) {
    return { endOfRetailAvailability: null, endOfManufacturerSupport: null };
  }
  const identityInfo = canUseStoredModel ? { ...queryInfo, exactModel: storedModel } : queryInfo;
  const checked = cacheRead && provenance?.claims && Array.isArray(provenance.sources)
    && provenance.exactModel === (identityInfo.exactModel || null)
    ? normalizeLifecycleFields(provenance.claims, { sources: provenance.sources, queryInfo: identityInfo, currentYear })
    : {};
  const restore = (field, kind, name) => {
    try {
      if (cacheRead && (!sameValidatedField(checked[name], field)
        || !exactSource(checked[name]?.source?.uri, sources))) return null;
      if (!field || typeof field !== 'object' || !['high', 'medium'].includes(field.confidence)
        || !matchesProduct(field.product, identityInfo)) return null;
      const date = dateValue(field.date, currentYear);
      const source = exactSource(field.source?.uri, sources);
      if (!date || !source
        || field.precision !== date.precision) return null;
      if (kind === 'retail') {
        const market = marketName(field.market);
        const requested = requestedMarket(queryInfo);
        if (!market || (requested && market !== requested)
          || (sourceMarket(source) && sourceMarket(source) !== market)) return null;
      } else if (!SUPPORT_CATEGORIES.has(field.supportCategory)) return null;
      return { ...field, source: { title: source.title, uri: source.uri } };
    } catch (_) { return null; }
  };
  return {
    endOfRetailAvailability: restore(raw?.endOfRetailAvailability, 'retail', 'endOfRetailAvailability'),
    endOfManufacturerSupport: restore(raw?.endOfManufacturerSupport, 'support', 'endOfManufacturerSupport'),
  };
}
