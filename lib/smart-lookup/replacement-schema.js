import { compactModel, isSameModel, normalizeBrandIdentity, normalizeWhitespace } from './normalize.js';

const ALLOWED_RATINGS = new Set(['MATCH', 'ABOVE LKQ']);
const SUCCESSOR_TYPES = new Set(['direct_successor', 'same_brand_equivalent', 'none']);
const SOURCES = new Set(['cache', 'gemini', 'fallback', 'none']);

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

  return {
    itemSummary,
    specLabels: labels,
    originalSpecs: normalizeSpecs(raw.originalSpecs, labels),
    successorStatus,
    bestMatchLabel: text(raw.bestMatchLabel, 120) || 'Best Replacement Option',
    replacementOptions,
    cacheStatus: options.cacheStatus || raw.cacheStatus || 'bypass',
    source,
    originSource,
    evidenceSource: options.evidenceSource || raw.evidenceSource || 'none',
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
