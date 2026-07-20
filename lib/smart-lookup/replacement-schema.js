import { compactModel, isSameModel, normalizeBrandIdentity, normalizeWhitespace } from './normalize.js';

const ALLOWED_RATINGS = new Set(['MATCH', 'ABOVE LKQ']);
const SUCCESSOR_TYPES = new Set(['direct_successor', 'same_brand_equivalent', 'none']);
const SOURCES = new Set(['cache', 'gemini', 'groq', 'fallback', 'none']);
const RELATIONSHIP_TYPES = new Set(['direct-successor', 'same-series-successor', 'functional-equivalent', 'similar-alternative', 'none-found']);
const COMPATIBILITY_STATUSES = new Set(['likely-compatible', 'compatible-with-caveats', 'not-directly-compatible', 'unknown']);
const LKQ_EVIDENCE_SOURCES = new Set(['manufacturer-grounded', 'retailer-grounded', 'mixed-grounded', 'gemini-ungrounded', 'groq-ungrounded', 'static', 'none']);
const PRICE_TYPES = new Set(['regular', 'sale', 'unknown']);
const PRICE_CONDITIONS = new Set(['new', 'refurbished', 'used', 'open-box', 'unknown']);
const STOCK_STATUSES = new Set(['in-stock', 'out-of-stock', 'unknown']);
const PRICE_OBSERVATION_LIMIT = 8;
const NON_QUALIFYING_SELLER_PATTERN = /\b(accessor(?:y|ies)|replacement part|spare part|warranty|extended protection|installation only|open[\s-]?box|refurb|used|pre[\s-]?owned)\b/i;

export class SmartLookupReplacementValidationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SmartLookupReplacementValidationError';
    this.code = code;
  }
}

export function createReplacementTimings() {
  return {
    cacheReadMs: 0,
    rateLimitMs: 0,
    providerMs: 0,
    postProcessMs: 0,
    cacheWriteMs: 0,
    totalMs: 0,
  };
}

function text(value, maxLength = 500) {
  const normalized = normalizeWhitespace(value);
  return normalized ? normalized.slice(0, maxLength) : '';
}

function isCompatibleCategory(returnedCategory, requestedCategory) {
  const returned = String(returnedCategory || '').toLowerCase();
  const requested = String(requestedCategory || '').toLowerCase();
  if (!returned || !requested) return true;
  return returned.includes(requested) || requested.includes(returned);
}

function normalizeEvidence(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === 'string') return { detail: text(item, 240), source: 'Provider output' };
    if (!item || typeof item !== 'object') return null;
    const detail = text(item.detail || item.supports || item.title, 240);
    const source = text(item.source || item.sourceName || item.type, 120);
    if (!detail && !source) return null;
    return { detail, source: source || 'Provider output' };
  }).filter(Boolean).slice(0, 5);
}

function normalizeSpecs(value, labels) {
  const input = value && typeof value === 'object' ? value : {};
  const result = {};
  for (const label of labels) result[label] = text(input[label], 180) || 'Unknown';
  return result;
}

// Server-derived exclusively from Gemini groundingMetadata (never from
// model-authored JSON), mirroring the age-lookup grounded-sources contract:
// a cached or replayed payload can never smuggle citations into a result
// that did not actually retrieve them.
function normalizeReplacementSources(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 5).map((entry) => {
    if (!entry || typeof entry !== 'object') return null;
    const uri = text(entry.uri, 600);
    if (!/^https:\/\//i.test(uri)) return null;
    const domain = text(entry.domain, 120).toLowerCase();
    const title = text(entry.title, 160) || domain;
    if (!title) return null;
    return { title, domain: domain || null, uri };
  }).filter(Boolean);
}

function normalizeRetrievedAt(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

// A short, defensible heuristic: does any grounded source domain have the
// brand's own normalized token as one of its dot-separated labels? Exact
// label matching (not substring) avoids both directions of failure a naive
// substring check would hit -- a short brand token like "lg" would false-
// positive against "walgreens.com" under substring matching, while an exact
// match on "lg.com" (labels: lg, com) is safe at any token length. This
// still under-matches some real manufacturer domains that don't equal the
// brand name (e.g. "geappliances.com" for GE), but a missed manufacturer
// match only downgrades a direct-successor claim to same-series-successor --
// the safe failure direction -- never the reverse.
function sourceHasManufacturerEvidence(sources, brand) {
  const token = normalizeBrandIdentity(brand);
  if (!token) return false;
  return sources.some((source) => {
    const domain = String(source?.domain || '').toLowerCase();
    if (!domain) return false;
    return domain.split('.').includes(token);
  });
}

function normalizeCompatibilityWarnings(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => text(item, 240)).filter(Boolean).slice(0, 6);
}

function normalizeMaterialDifferences(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => text(item, 240)).filter(Boolean).slice(0, 6);
}

function normalizePrice(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 && num < 1000000 ? Math.round(num * 100) / 100 : null;
}

// Each observation is validated independently; a malformed or non-qualifying
// entry is dropped rather than rejecting the whole result. Qualification
// (new-condition, identifiable seller, no accessory/warranty/installation
// noise) is enforced here so the pricing rules in Phase 5 cannot be bypassed
// by provider-authored text alone.
function normalizePriceObservations(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, PRICE_OBSERVATION_LIMIT).map((entry) => {
    if (!entry || typeof entry !== 'object') return null;
    const seller = text(entry.seller, 120);
    const price = normalizePrice(entry.price);
    if (!seller || price == null) return null;
    if (NON_QUALIFYING_SELLER_PATTERN.test(seller)) return null;
    const currency = /^[A-Z]{3}$/.test(text(entry.currency, 3).toUpperCase()) ? text(entry.currency, 3).toUpperCase() : 'USD';
    const priceType = PRICE_TYPES.has(entry.priceType) ? entry.priceType : 'unknown';
    const condition = PRICE_CONDITIONS.has(entry.condition) ? entry.condition : 'unknown';
    const stockStatus = STOCK_STATUSES.has(entry.stockStatus) ? entry.stockStatus : 'unknown';
    const observedAt = normalizeRetrievedAt(entry.observedAt);
    return { seller, price, currency, observedAt, priceType, condition, stockStatus };
  }).filter(Boolean);
}

// A recommended cost range is computed here, server-side, from already-
// validated observations only -- the model is never trusted to state a range
// directly, so a range can never appear without qualifying evidence behind
// it. Only new-condition observations count; mixed currencies never merge
// into one range (a false average across currencies is worse than no range).
function computeReplacementCostRange(observations) {
  const newOnes = observations.filter((entry) => entry.condition === 'new');
  if (!newOnes.length) return null;
  const currency = newOnes[0].currency;
  const sameCurrency = newOnes.filter((entry) => entry.currency === currency);
  const manufacturerListed = sameCurrency.find((entry) => /manufacturer|official|msrp/i.test(entry.seller));
  if (sameCurrency.length === 1 && !manufacturerListed) return null;
  if (sameCurrency.length === 1 && manufacturerListed) {
    return { low: manufacturerListed.price, high: manufacturerListed.price, currency, basis: 'manufacturer-listed' };
  }
  const prices = sameCurrency.map((entry) => entry.price);
  return { low: Math.min(...prices), high: Math.max(...prices), currency, basis: 'multiple-observations' };
}

function normalizeOption(value, labels, options = {}) {
  if (!value || typeof value !== 'object') return null;
  const rating = text(value.lkqRating, 40).toUpperCase();
  if (!ALLOWED_RATINGS.has(rating)) return null;
  const model = text(value.model, 120);
  const name = text(value.name, 240);
  const brand = text(value.brand, 80);
  if (!model && !name) return null;
  if (options.requestedBrand && brand && normalizeBrandIdentity(brand) !== normalizeBrandIdentity(options.requestedBrand)) return null;
  const evidence = normalizeEvidence(value.evidence || value.supportingEvidence);
  if ((rating === 'MATCH' || rating === 'ABOVE LKQ') && options.requireEvidence && !evidence.length) return null;
  const ungrounded = options.ungrounded === true;
  return {
    name: name || [brand, model].filter(Boolean).join(' '),
    model: model || null,
    brand: brand || null,
    specs: normalizeSpecs(value.specs, labels),
    lkqRating: rating,
    notes: text(value.notes, 500) || 'Review the replacement against the original item specifications.',
    evidence,
    priceRange: ungrounded ? 'Unavailable - unverified' : (text(value.priceRange, 100) || 'N/A'),
    retailerName: ungrounded ? 'Not verified' : (text(value.retailerName, 120) || 'N/A'),
    retailerSearchQuery: text(value.retailerSearchQuery, 200) || [brand, model].filter(Boolean).join(' '),
  };
}

export function normalizeReplacementResult(raw, options = {}) {
  if (!raw || typeof raw !== 'object') throw new SmartLookupReplacementValidationError('INVALID_RESULT');
  const queryInfo = options.queryInfo || {};
  const summaryInput = raw.itemSummary && typeof raw.itemSummary === 'object' ? raw.itemSummary : {};
  const returnedModel = text(summaryInput.model, 120);
  const returnedBrand = text(summaryInput.brand, 80);
  const returnedCategory = text(summaryInput.category, 120);
  if (queryInfo.brand && returnedBrand && normalizeBrandIdentity(returnedBrand) !== normalizeBrandIdentity(queryInfo.brand)) {
    throw new SmartLookupReplacementValidationError('UNRELATED_BRAND');
  }
  if (queryInfo.genericCategory && returnedCategory && !isCompatibleCategory(returnedCategory, queryInfo.genericCategory)) {
    throw new SmartLookupReplacementValidationError('UNRELATED_CATEGORY');
  }
  if (queryInfo.modelCompleteness === 'exact' && returnedModel && !isSameModel(returnedModel, queryInfo.modelIdentity)) {
    throw new SmartLookupReplacementValidationError('UNRELATED_MODEL');
  }

  const labels = Array.isArray(raw.specLabels)
    ? raw.specLabels.map((item) => text(item, 80)).filter(Boolean).slice(0, 5)
    : [];
  while (labels.length < 5) labels.push(`Specification ${labels.length + 1}`);

  const itemSummary = {
    name: text(summaryInput.name, 240) || [queryInfo.brand, queryInfo.modelIdentity].filter(Boolean).join(' ') || queryInfo.query,
    brand: text(summaryInput.brand, 80) || queryInfo.brand || null,
    model: queryInfo.modelCompleteness === 'exact'
      ? (queryInfo.modelIdentity || compactModel(returnedModel) || returnedModel || null)
      : (queryInfo.modelCompleteness === 'partial' ? (queryInfo.modelIdentity || null) : (returnedModel || null)),
    category: returnedCategory || queryInfo.genericCategory || null,
    description: text(summaryInput.description, 600) || null,
    estimatedAgeRange: text(summaryInput.estimatedAgeRange, 80) || null,
    availability: text(summaryInput.availability, 80) || 'Availability Unconfirmed',
    originalPriceDisplay: (options.evidenceSource === 'gemini-ungrounded' || raw.evidenceSource === 'gemini-ungrounded') ? 'Unavailable - unverified' : (text(summaryInput.originalPriceDisplay, 120) || 'N/A'),
  };

  const successorInput = raw.successorStatus && typeof raw.successorStatus === 'object' ? raw.successorStatus : {};
  const successorType = SUCCESSOR_TYPES.has(successorInput.type) ? successorInput.type : 'none';
  const successorStatus = {
    type: successorType,
    name: successorType === 'none' ? null : (text(successorInput.name, 240) || null),
    model: successorType === 'none' ? null : (text(successorInput.model, 120) || null),
    explanation: text(successorInput.explanation, 600) || 'No verified current same-brand successor was established.',
  };

  const sourceForValidation = options.source || raw.source || 'fallback';
  const ungrounded = options.evidenceSource === 'gemini-ungrounded' || raw.evidenceSource === 'gemini-ungrounded';
  const replacementOptions = Array.isArray(raw.replacementOptions)
    ? raw.replacementOptions.map((item) => normalizeOption(item, labels, {
        requestedBrand: queryInfo.brand,
        requireEvidence: sourceForValidation === 'gemini' || ungrounded,
        ungrounded,
      })).filter(Boolean).slice(0, 3)
    : [];

  if (successorType !== 'none' && replacementOptions.length && successorStatus.model) {
    const first = replacementOptions[0];
    if (first.model && !isSameModel(first.model, successorStatus.model)) {
      successorStatus.type = 'none';
      successorStatus.name = null;
      successorStatus.model = null;
      successorStatus.explanation = 'The returned successor relationship did not match the lead replacement and requires manual review.';
    }
  }

  const source = SOURCES.has(options.source || raw.source) ? (options.source || raw.source) : 'fallback';
  const originSource = SOURCES.has(options.originSource || raw.originSource)
    ? (options.originSource || raw.originSource)
    : (source === 'cache' ? 'fallback' : source);

  // --- Grounded replacement-research fields (additive; existing fields
  // above are untouched so the current browser rendering keeps working). ---
  // The caller passes the sentinel 'grounded' (not itself a stored value)
  // when the provider call used Google Search grounding; this function is
  // the single place that resolves it into the specific manufacturer /
  // retailer / mixed label, since that classification depends on the
  // sources and brand this function already computes.
  const requestedEvidenceSource = options.evidenceSource || raw.evidenceSource;
  const wasGroundedAttempt = requestedEvidenceSource === 'grounded';
  const cachedGroundedLabel = requestedEvidenceSource === 'manufacturer-grounded'
    || requestedEvidenceSource === 'retailer-grounded'
    || requestedEvidenceSource === 'mixed-grounded';
  const sourcesInput = options.sources !== undefined
    ? options.sources
    : ((wasGroundedAttempt || cachedGroundedLabel) ? raw.sources : null);
  const sources = normalizeReplacementSources(sourcesInput);

  let evidenceSource;
  if (wasGroundedAttempt) {
    // A grounded attempt with zero retrieved sources is downgraded,
    // mirroring the age-lookup contract: grounded wording must never
    // appear without real citations behind it.
    if (!sources.length) {
      evidenceSource = source === 'groq' ? 'groq-ungrounded' : 'gemini-ungrounded';
    } else {
      const hasManufacturer = sourceHasManufacturerEvidence(sources, itemSummary.brand);
      const hasNonManufacturer = sources.some((entry) => {
        const domain = String(entry?.domain || '').toLowerCase();
        const token = normalizeBrandIdentity(itemSummary.brand);
        return domain && (!token || !domain.split('.').includes(token));
      });
      evidenceSource = hasManufacturer && hasNonManufacturer
        ? 'mixed-grounded'
        : (hasManufacturer ? 'manufacturer-grounded' : 'retailer-grounded');
    }
  } else if (cachedGroundedLabel) {
    // An already-classified value read back from cache; trust it as-is
    // unless sources turned out empty, which still enforces the
    // no-citations-no-grounded-label rule on the read path too.
    evidenceSource = sources.length ? requestedEvidenceSource : (source === 'groq' ? 'groq-ungrounded' : 'gemini-ungrounded');
  } else {
    evidenceSource = LKQ_EVIDENCE_SOURCES.has(requestedEvidenceSource) ? requestedEvidenceSource : 'none';
  }

  const retrievedAt = sources.length
    ? normalizeRetrievedAt(options.retrievedAt ?? raw.retrievedAt) || new Date().toISOString()
    : null;
  const groundedFallback = Boolean(options.groundedFallback !== undefined ? options.groundedFallback : raw.groundedFallback);

  const replacementInput = raw.replacement && typeof raw.replacement === 'object' ? raw.replacement : {};
  const replacementCategory = text(replacementInput.category, 120);
  if (queryInfo.genericCategory && replacementCategory && !isCompatibleCategory(replacementCategory, queryInfo.genericCategory)) {
    throw new SmartLookupReplacementValidationError('REPLACEMENT_CATEGORY_MISMATCH');
  }

  let relationship = RELATIONSHIP_TYPES.has(raw.replacementRelationship) ? raw.replacementRelationship : 'none-found';
  let replacementModelRaw = text(replacementInput.model, 120);
  const replacementModelLooksValid = replacementModelRaw
    ? compactModel(replacementModelRaw).length >= 4 && /\d/.test(replacementModelRaw)
    : false;
  if (replacementModelRaw && !replacementModelLooksValid) {
    // A malformed/partial replacement model token is dropped, not trusted --
    // and a relationship that implies a specific successor model can no
    // longer claim that specificity, so it is downgraded rather than kept.
    replacementModelRaw = '';
    if (relationship === 'direct-successor' || relationship === 'same-series-successor') {
      relationship = 'functional-equivalent';
    }
  }

  // A direct-successor claim requires real grounded evidence whose source
  // domain plausibly belongs to the original brand's own manufacturer site;
  // anything less is downgraded to same-series-successor rather than
  // rejected outright, preserving a still-useful (if less specific) result.
  if (relationship === 'direct-successor' && !(sources.length && sourceHasManufacturerEvidence(sources, itemSummary.brand))) {
    relationship = 'same-series-successor';
  }

  const replacement = relationship === 'none-found' ? null : {
    name: text(replacementInput.name, 240) || null,
    brand: text(replacementInput.brand, 80) || null,
    model: replacementModelRaw || null,
    category: replacementCategory || null,
  };

  const replacementLabels = labels.length ? labels : Array.from({ length: 5 }, (_, index) => `Specification ${index + 1}`);
  const replacementSpecs = normalizeSpecs(raw.replacementSpecs, replacementLabels);
  const compatibilityStatus = COMPATIBILITY_STATUSES.has(raw.compatibilityStatus) ? raw.compatibilityStatus : 'unknown';
  const compatibilityWarnings = normalizeCompatibilityWarnings(raw.compatibilityWarnings);
  const materialDifferences = normalizeMaterialDifferences(raw.materialDifferences);

  // Price evidence is only trusted for genuinely grounded results; an
  // ungrounded/static/none result can never contribute a price observation
  // regardless of what the provider text claims.
  const priceEligible = evidenceSource === 'manufacturer-grounded' || evidenceSource === 'retailer-grounded' || evidenceSource === 'mixed-grounded';
  const priceObservations = priceEligible ? normalizePriceObservations(raw.priceObservations) : [];
  const replacementCostRange = priceEligible ? computeReplacementCostRange(priceObservations) : null;

  return {
    itemSummary,
    specLabels: labels,
    originalSpecs: normalizeSpecs(raw.originalSpecs, labels),
    successorStatus,
    bestMatchLabel: text(raw.bestMatchLabel, 120) || 'Best Replacement Option',
    replacementOptions,
    replacementRelationship: relationship,
    replacementRationale: text(raw.replacementRationale, 600) || null,
    replacement,
    replacementSpecs,
    materialDifferences,
    compatibilityStatus,
    compatibilityWarnings,
    priceObservations,
    replacementCostRange,
    sources,
    retrievedAt,
    groundedFallback,
    cacheStatus: options.cacheStatus || raw.cacheStatus || 'bypass',
    source,
    originSource,
    evidenceSource,
    providerAttempted: Boolean(options.providerAttempted ?? raw.providerAttempted),
    fallbackUsed: Boolean(options.fallbackUsed ?? raw.fallbackUsed),
    timings: { ...createReplacementTimings(), ...(options.timings || raw.timings || {}) },
    errorCode: options.errorCode || raw.errorCode || null,
  };
}

export function normalizeCachedReplacementResult(raw, options = {}) {
  const result = normalizeReplacementResult(raw, {
    ...options,
    source: raw?.originSource || raw?.source || 'fallback',
    originSource: raw?.originSource || raw?.source || 'fallback',
    cacheStatus: 'hit',
    providerAttempted: false,
  });
  result.source = 'cache';
  result.cacheStatus = 'hit';
  result.providerAttempted = false;
  return result;
}

export function createUnavailableReplacementResult(queryInfo, options = {}) {
  return normalizeReplacementResult({
    itemSummary: {
      name: [queryInfo?.brand, queryInfo?.modelIdentity].filter(Boolean).join(' ') || queryInfo?.query || 'Smart Lookup item',
      brand: queryInfo?.brand || null,
      model: queryInfo?.modelIdentity || null,
      category: queryInfo?.genericCategory || null,
      description: 'Replacement research was not completed within the available request budget.',
      availability: 'Availability Unconfirmed',
      originalPriceDisplay: 'N/A',
    },
    specLabels: [],
    originalSpecs: {},
    successorStatus: {
      type: 'none',
      name: null,
      model: null,
      explanation: options.message || 'Replacement options are temporarily unavailable. The age result remains available.',
    },
    replacementOptions: [],
  }, {
    queryInfo,
    source: options.source || 'fallback',
    originSource: options.originSource || options.source || 'fallback',
    evidenceSource: options.evidenceSource || 'none',
    cacheStatus: options.cacheStatus || 'error',
    providerAttempted: Boolean(options.providerAttempted),
    fallbackUsed: Boolean(options.fallbackUsed),
    timings: options.timings,
    errorCode: options.errorCode || 'LKQ_UNAVAILABLE',
  });
}
