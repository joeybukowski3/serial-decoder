import { compactModel, isSameModel, normalizeBrandIdentity, normalizeWhitespace } from './normalize.js';

const SPECIFICITY_LEVELS = new Set(['generic', 'brand-only', 'partial', 'specific', 'unknown']);
const SOURCES = new Set(['local-db', 'decoder-verified', 'cache', 'static', 'gemini', 'groq', 'fallback', 'none']);
const EVIDENCE_SOURCES = new Set(['local-db', 'user-verified', 'gemini-ungrounded', 'groq-ungrounded', 'heuristic', 'none']);
const YEAR_CONTEXT_TYPES = new Set(['model-year-family', 'market-introduction', 'release-year', 'production-range', 'manufacture-year', 'manufacture-date', 'unknown']);
const YEAR_CONTEXT_CONFIDENCE = new Set(['high', 'medium', 'low', 'partial']);
const YEAR_CONTEXT_SOURCES = new Set(['local-seed', 'local-model-evidence', 'provider', 'serial', 'cache']);

export class SmartLookupValidationError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'SmartLookupValidationError';
    this.code = code;
  }
}

export function createSmartLookupTimings() {
  return {
    rateLimitMs: 0,
    localLookupMs: 0,
    verifiedLookupMs: 0,
    cacheReadMs: 0,
    providerMs: 0,
    postProcessMs: 0,
    cacheWriteMs: 0,
    totalMs: 0,
  };
}

function cleanText(value, maxLength = 1000) {
  const text = normalizeWhitespace(value);
  return text ? text.slice(0, maxLength) : '';
}

function normalizeYear(value, currentYear, field) {
  if (value === null || value === undefined || value === '' || value === 'Unknown') return null;
  const match = String(value).match(/\b(18|19|20|21)\d{2}\b/);
  if (!match) return null;
  const year = Number(match[0]);
  if (!Number.isInteger(year) || year < 1800 || year > currentYear) {
    throw new SmartLookupValidationError('INVALID_YEAR', `${field} is outside the supported range.`);
  }
  return year;
}

export function parseProductionRange(value, currentYear = new Date().getFullYear()) {
  if (!value) return null;
  if (typeof value === 'object') {
    const start = normalizeYear(value.start, currentYear, 'productionRange.start');
    const end = normalizeYear(value.end ?? value.start, currentYear, 'productionRange.end');
    if (start == null || end == null) return null;
    if (end < start) throw new SmartLookupValidationError('REVERSED_RANGE');
    return { start, end, basis: cleanText(value.basis || 'model-availability', 80) || 'model-availability' };
  }

  const years = String(value).match(/\b(18|19|20|21)\d{2}\b/g) || [];
  if (!years.length) return null;
  const start = normalizeYear(years[0], currentYear, 'productionRange.start');
  const end = normalizeYear(years[years.length - 1], currentYear, 'productionRange.end');
  if (end < start) throw new SmartLookupValidationError('REVERSED_RANGE');
  return { start, end, basis: 'model-availability' };
}

function normalizeEvidence(value) {
  if (value != null && !Array.isArray(value)) throw new SmartLookupValidationError('INVALID_EVIDENCE');
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map((entry) => {
    if (typeof entry === 'string') return { detail: cleanText(entry, 500), source: 'Unspecified' };
    if (!entry || typeof entry !== 'object') return null;
    const detail = cleanText(entry.detail || entry.supports || entry.title, 500);
    const source = cleanText(entry.source || entry.sourceName || entry.type, 160);
    if (!detail && !source) return null;
    return { detail, source: source || 'Unspecified' };
  }).filter(Boolean);
}

function formatRange(range) {
  if (!range) return null;
  return range.start === range.end ? String(range.start) : `${range.start}-${range.end}`;
}

function normalizeSuggestions(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(item, 120)).filter(Boolean).slice(0, 5);
}

function normalizeSource(value, allowed, fallback) {
  return allowed.has(value) ? value : fallback;
}

function defaultYearContextSource(source, type) {
  if (source === 'cache') return 'cache';
  if (type === 'manufacture-year' || type === 'manufacture-date') return 'serial';
  if (source === 'static') return 'local-seed';
  if (source === 'local-db' || source === 'decoder-verified') return 'local-model-evidence';
  return 'provider';
}

function normalizeYearContext(raw, derived, options = {}) {
  const input = raw == null ? derived : raw;
  if (input == null) return null;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new SmartLookupValidationError('INVALID_YEAR_CONTEXT');
  }

  const currentYear = options.currentYear || new Date().getFullYear();
  const type = YEAR_CONTEXT_TYPES.has(input.type) ? input.type : null;
  if (!type) throw new SmartLookupValidationError('INVALID_YEAR_CONTEXT');

  const value = normalizeYear(input.value, currentYear, 'yearContext.value');
  const startYear = normalizeYear(input.startYear, currentYear, 'yearContext.startYear');
  const endYear = normalizeYear(input.endYear, currentYear, 'yearContext.endYear');
  if (type === 'production-range') {
    if (startYear == null || endYear == null || endYear < startYear) {
      throw new SmartLookupValidationError(endYear != null && startYear != null ? 'REVERSED_RANGE' : 'INVALID_YEAR_CONTEXT');
    }
  } else if (type !== 'unknown' && value == null) {
    throw new SmartLookupValidationError('INVALID_YEAR_CONTEXT');
  }

  const exactUnitType = type === 'manufacture-year' || type === 'manufacture-date';
  const source = options.source === 'cache'
    ? 'cache'
    : normalizeSource(input.source, YEAR_CONTEXT_SOURCES, defaultYearContextSource(options.source, type));
  const result = {
    type,
    label: cleanText(input.label, 80) || ({
      'model-year-family': 'Model-year family',
      'market-introduction': 'Marketplace introduction year',
      'release-year': 'Release year',
      'production-range': 'Production range',
      'manufacture-year': 'Manufacture year',
      'manufacture-date': 'Manufacture date',
      unknown: 'Year context',
    }[type]),
    confidence: normalizeSource(input.confidence, YEAR_CONTEXT_CONFIDENCE, type === 'unknown' ? 'partial' : 'medium'),
    source,
    isExactUnitDate: exactUnitType && input.isExactUnitDate !== false,
  };
  if (type === 'production-range') {
    result.startYear = startYear;
    result.endYear = endYear;
  } else if (value != null) {
    result.value = value;
  }
  return result;
}

function normalizeYearVariants(value, currentYear) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new SmartLookupValidationError('INVALID_YEAR_CONTEXT');
  return value.slice(0, 12).map((entry) => {
    if (!entry || typeof entry !== 'object') return null;
    const name = cleanText(entry.name || entry.variant, 80);
    const year = normalizeYear(entry.year || entry.value, currentYear, 'yearVariants.year');
    if (!name || year == null) return null;
    return { name, year, type: 'model-year-family', label: 'Model-year family' };
  }).filter(Boolean);
}

export function normalizeSmartAgeResult(raw, options = {}) {
  if (!raw || typeof raw !== 'object') throw new SmartLookupValidationError('INVALID_RESULT');
  const queryInfo = options.queryInfo || {};
  const currentYear = options.currentYear || new Date().getFullYear();
  const requestedSpecificity = queryInfo.specificityLevel || 'unknown';
  let specificityLevel = SPECIFICITY_LEVELS.has(raw.specificityLevel) ? raw.specificityLevel : requestedSpecificity;
  if (!SPECIFICITY_LEVELS.has(specificityLevel)) specificityLevel = 'unknown';

  let brand = cleanText(raw.brand || queryInfo.brand || 'Unknown', 80) || 'Unknown';
  if (queryInfo.brand && brand !== 'Unknown' && normalizeBrandIdentity(brand) !== normalizeBrandIdentity(queryInfo.brand)) {
    throw new SmartLookupValidationError('UNRELATED_BRAND');
  }
  let model = cleanText(raw.model, 120) || null;
  const returnedModel = model;

  if (requestedSpecificity === 'specific') {
    if (returnedModel && queryInfo.modelIdentity && !isSameModel(returnedModel, queryInfo.modelIdentity)) {
      throw new SmartLookupValidationError('UNRELATED_MODEL');
    }
    model = queryInfo.modelIdentity || compactModel(returnedModel) || returnedModel || null;
    specificityLevel = 'specific';
  } else if (requestedSpecificity === 'partial') {
    model = queryInfo.modelIdentity || model || null;
    specificityLevel = 'partial';
  } else if (requestedSpecificity === 'generic') {
    model = null;
    specificityLevel = 'generic';
  } else if (requestedSpecificity === 'brand-only') {
    model = null;
    specificityLevel = 'brand-only';
  }

  let introductionYear = normalizeYear(raw.introductionYear, currentYear, 'introductionYear');
  if (introductionYear == null && raw.estimatedYearType === 'model-introduction') {
    introductionYear = normalizeYear(raw.estimatedYear, currentYear, 'estimatedYear');
  }
  if (introductionYear == null && raw.estimatedYear && raw.estimatedYearType !== 'individual-manufacture') {
    introductionYear = normalizeYear(raw.estimatedYear, currentYear, 'estimatedYear');
  }

  let productionRange = parseProductionRange(raw.productionRange || raw.yearRange, currentYear);
  let individualManufactureYear = normalizeYear(raw.individualManufactureYear, currentYear, 'individualManufactureYear');
  if (individualManufactureYear == null && raw.estimatedYearType === 'individual-manufacture') {
    individualManufactureYear = normalizeYear(raw.estimatedYear, currentYear, 'estimatedYear');
  }
  if (!options.allowIndividualManufactureYear) individualManufactureYear = null;

  if (requestedSpecificity === 'generic' || requestedSpecificity === 'brand-only' || requestedSpecificity === 'partial') {
    introductionYear = null;
    productionRange = null;
    individualManufactureYear = null;
  }

  if (introductionYear != null && productionRange && introductionYear > productionRange.end) {
    throw new SmartLookupValidationError('INTRODUCTION_AFTER_RANGE');
  }

  const source = normalizeSource(options.source || raw.source || raw._source, SOURCES, 'fallback');
  const originSource = normalizeSource(options.originSource || raw.originSource || (source === 'cache' ? raw._source : source), SOURCES, source === 'cache' ? 'fallback' : source);
  const evidenceSource = normalizeSource(options.evidenceSource || raw.evidenceSource, EVIDENCE_SOURCES, 'none');
  const estimatedYear = individualManufactureYear ?? introductionYear;
  const estimatedYearType = individualManufactureYear != null
    ? 'individual-manufacture'
    : (introductionYear != null ? 'model-introduction' : null);
  const yearRange = formatRange(productionRange);
  const timings = { ...createSmartLookupTimings(), ...(options.timings || raw.timings || {}) };
  const modelYearFamilyYear = normalizeYear(raw.modelYearFamilyYear ?? queryInfo.modelYearFamilyYear, currentYear, 'modelYearFamilyYear');
  const trustedFamilyContext = raw.yearContext?.source === 'local-seed'
    || raw.yearContext?.source === 'local-model-evidence'
    || raw.yearContext?.source === 'serial';
  const rawYearContext = requestedSpecificity === 'partial' && !trustedFamilyContext ? null : raw.yearContext;
  let derivedYearContext = null;
  if (individualManufactureYear != null) {
    derivedYearContext = { value: individualManufactureYear, type: 'manufacture-year', label: 'Manufacture year', confidence: 'high', isExactUnitDate: true };
  } else if (introductionYear != null) {
    derivedYearContext = { value: introductionYear, type: 'market-introduction', label: 'Marketplace introduction year', confidence: 'medium', isExactUnitDate: false };
  } else if (modelYearFamilyYear != null) {
    derivedYearContext = { value: modelYearFamilyYear, type: 'model-year-family', label: 'Model-year family', confidence: 'high', source: 'local-seed', isExactUnitDate: false };
  } else if (productionRange) {
    derivedYearContext = { startYear: productionRange.start, endYear: productionRange.end, type: 'production-range', label: 'Production range', confidence: 'medium', isExactUnitDate: false };
  }
  const yearContext = normalizeYearContext(rawYearContext, derivedYearContext, { currentYear, source });
  const yearVariants = normalizeYearVariants(raw.yearVariants, currentYear);

  return {
    brand,
    displayName: cleanText(raw.displayName, 160) || null,
    model,
    itemCategory: cleanText(raw.itemCategory || raw.category || queryInfo.genericCategory, 100) || null,
    category: cleanText(raw.category || raw.itemCategory || queryInfo.genericCategory, 100) || null,
    specificityLevel,
    estimatedYear: estimatedYear == null ? null : String(estimatedYear),
    estimatedYearType,
    introductionYear,
    productionRange,
    individualManufactureYear,
    yearContext,
    yearVariants,
    yearRange,
    timeline: cleanText(raw.timeline, 1000) || null,
    inventionSummary: cleanText(raw.inventionSummary, 1000) || null,
    refinementSuggestion: cleanText(raw.refinementSuggestion, 500) || null,
    notes: cleanText(raw.notes, 2000) || null,
    evidence: normalizeEvidence(raw.evidence),
    serialLocation: cleanText(raw.serialLocation, 500) || null,
    serialRule: cleanText(raw.serialRule, 500) || null,
    exampleModelNumber: cleanText(raw.exampleModelNumber, 120) || null,
    suggestedModelNumbers: normalizeSuggestions(raw.suggestedModelNumbers),
    cacheStatus: options.cacheStatus || raw.cacheStatus || 'bypass',
    source,
    originSource,
    evidenceSource,
    providerAttempted: Boolean(options.providerAttempted ?? raw.providerAttempted),
    fallbackUsed: Boolean(options.fallbackUsed ?? raw.fallbackUsed ?? raw._fallbackUsed),
    timings,
    errorCode: options.errorCode || raw.errorCode || null,
    // Product-description recall fields (marketing titles like "Samsung
    // Q60 Series" recognized without an exact model number). These are
    // classification metadata only -- never a substitute for
    // estimatedYear/productionRange, and never treated as a manufacture date.
    productFamily: cleanText(raw.productFamily || queryInfo.productFamily, 120) || null,
    productType: cleanText(raw.productType || queryInfo.productType, 100) || null,
    seriesLine: cleanText(raw.seriesLine || queryInfo.seriesLine, 120) || null,
    screenSize: Number.isInteger(raw.screenSize ?? queryInfo.screenSize) ? (raw.screenSize ?? queryInfo.screenSize) : null,
    exactModel: cleanText(raw.exactModel || queryInfo.exactModel, 120) || null,
    modelYearFamilyYear,
    modelYearFamilyLabel: cleanText(raw.modelYearFamilyLabel || queryInfo.modelYearFamilyLabel, 120) || null,
    isProductFamilyQuery: Boolean(raw.isProductFamilyQuery ?? queryInfo.isProductFamilyQuery),
    isMarketingDescription: Boolean(raw.isMarketingDescription ?? queryInfo.isMarketingDescription),
    needsExactModel: Boolean(raw.needsExactModel ?? queryInfo.needsExactModel),
    status: cleanText(raw.status, 40) || null,
    outcome: cleanText(raw.outcome, 80) || null,
    resultType: cleanText(raw.resultType, 80) || null,
    _source: source,
    _fallbackUsed: Boolean(options.fallbackUsed ?? raw.fallbackUsed ?? raw._fallbackUsed),
  };
}

export function normalizeCachedSmartAgeResult(value, options = {}) {
  const normalized = normalizeSmartAgeResult(value, {
    ...options,
    source: value?.originSource || value?.source || value?._source || 'fallback',
    originSource: value?.originSource || value?.source || value?._source || 'fallback',
    cacheStatus: 'hit',
    providerAttempted: false,
  });
  normalized.source = 'cache';
  normalized._source = 'cache';
  normalized.cacheStatus = 'hit';
  return normalized;
}

export function createUnavailableSmartAgeResult(queryInfo, options = {}) {
  return normalizeSmartAgeResult({
    brand: queryInfo?.brand || 'Unknown',
    model: queryInfo?.modelIdentity || null,
    specificityLevel: queryInfo?.specificityLevel || 'unknown',
    refinementSuggestion: options.refinementSuggestion || 'Verify the complete brand and model number, or use the Serial Number Decoder for a unit-specific manufacture date.',
    notes: options.notes || 'Smart Lookup could not establish a defensible model introduction or production range.',
    evidence: [],
  }, {
    queryInfo,
    source: options.source || 'fallback',
    evidenceSource: options.evidenceSource || 'none',
    cacheStatus: options.cacheStatus || 'error',
    providerAttempted: Boolean(options.providerAttempted),
    fallbackUsed: Boolean(options.fallbackUsed),
    timings: options.timings,
    errorCode: options.errorCode || 'LOOKUP_UNAVAILABLE',
  });
}
