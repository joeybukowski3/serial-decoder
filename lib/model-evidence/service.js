import { createHash } from 'node:crypto';
import { findLocalRefinementEvidence } from '../serial-refinement/local-evidence.js';
import { createDeadline, isTimeoutError } from '../smart-lookup/deadline.js';
import { createDeterministicCache, SHARED_EVIDENCE_SCHEMA_VERSION } from '../serial-refinement/deterministic/cache.js';
import { DEFAULT_GEMINI_MODEL } from '../serial-refinement/deterministic/gemini-estimator.js';
import {
  gatherEvidence,
  runEvidenceExtraction,
} from '../serial-refinement/deterministic/orchestrator.js';
import { resolveEffectiveYear } from '../serial-refinement/deterministic/candidate-evaluator.js';
import { compactModelToken, normalizeEvidenceBrand } from './exact-model-match.js';
import { buildSharedModelIdentity } from './shared-model-identity.js';

const DEFAULT_BUDGET_MS = 10000;
const EVENT_TYPES = {
  product_launch: 'launch',
  product_available: 'availability',
  production_start: 'production_start',
  production_end: 'production_end',
  discontinuation: 'discontinuation',
  manual_published: 'manual_publication',
  review_published: 'review_publication',
  listing_publication: 'listing_publication',
  publication_date: 'listing_publication',
  owner_purchase: 'owner_purchase',
  ownership_age: 'ownership_age',
  troubleshooting_date: 'troubleshooting',
  page_updated: 'page_update',
  unknown: 'unknown',
};

function normalizePrecision(value, hasExtractedYear) {
  if (['day', 'month', 'year', 'approximate'].includes(value)) return value;
  if (value === 'week') return 'approximate';
  return hasExtractedYear ? 'approximate' : 'unknown';
}

function targetForEvent(eventType) {
  if (['production_start', 'production_end', 'launch', 'availability', 'discontinuation'].includes(eventType)) {
    return 'model_lifecycle';
  }
  if (['owner_purchase', 'ownership_age'].includes(eventType)) return 'specific_unit';
  return 'source_only';
}

function parseLocalRange(record) {
  const start = Number.isInteger(record?.productionRangeObject?.start)
    ? record.productionRangeObject.start
    : null;
  const end = Number.isInteger(record?.productionRangeObject?.end)
    ? record.productionRangeObject.end
    : null;
  if (start != null || end != null) return { start, end };
  const years = String(record?.productionRange || '').match(/\b(?:19|20)\d{2}\b/g)?.map(Number) || [];
  return {
    start: years[0] ?? null,
    end: years.length > 1 ? years[years.length - 1] : (years[0] ?? null),
  };
}

function localFacts(local) {
  const record = local?.record;
  if (!record) return [];
  const evidence = Array.isArray(local.evidence) ? local.evidence : [];
  const fallbackRange = parseLocalRange(record);
  const facts = [];

  const addFact = (entry, eventType, year, index) => {
    if (!Number.isInteger(year)) return;
    facts.push({
      source: {
        url: String(entry?.sourceUrl || ''),
        domain: '',
        title: String(entry?.title || `${record.brand} ${record.model} local model record`),
        sourceType: 'local-database',
        resultIndex: index,
      },
      fact: {
        eventType,
        year,
        endYear: null,
        precision: 'year',
        target: 'model_lifecycle',
        claim: String(entry?.supports || `Verified local exact-model ${eventType.replace(/_/g, ' ')} evidence.`),
      },
      identity: {
        deterministicMatchType: 'exact',
        suggestedMatchType: null,
        effectiveMatchType: 'exact',
      },
      extraction: {
        provider: 'local-database',
        model: 'model-age-db',
        confidence: entry?.verified === false ? 'medium' : 'high',
      },
    });
  };

  evidence.forEach((entry, index) => {
    addFact(entry, 'production_start', entry?.productionStart, -(index * 2 + 1));
    addFact(entry, 'production_end', entry?.productionEnd, -(index * 2 + 2));
  });
  if (!facts.length) {
    addFact(null, 'production_start', fallbackRange.start, -1);
    addFact(null, 'production_end', fallbackRange.end, -2);
  }
  return facts;
}

function webFacts(extraction) {
  const itemsByIndex = new Map((extraction.evidenceItems || []).map((item) => [item.index, item]));
  return (extraction.extractedFacts || []).map((fact) => {
    const item = itemsByIndex.get(fact.resultIndex) || {};
    const eventType = EVENT_TYPES[fact.dateMeaning] || 'unknown';
    const year = resolveEffectiveYear(fact);
    return {
      source: {
        url: String(item.link || ''),
        domain: String(item.domain || fact.domain || ''),
        title: String(item.title || item.domain || 'Model evidence source'),
        sourceType: String(fact.sourceType || 'other'),
        resultIndex: fact.resultIndex,
      },
      fact: {
        eventType,
        year,
        endYear: Number.isInteger(fact.approximateEndYear) ? fact.approximateEndYear : null,
        precision: normalizePrecision(
          fact.datePrecision !== 'unknown' ? fact.datePrecision : item.normalizedDatePrecision,
          Number.isInteger(fact.approximateYear),
        ),
        target: targetForEvent(eventType),
        claim: String(fact.claimText || ''),
      },
      identity: {
        deterministicMatchType: fact.modelMatchType || 'unknown',
        suggestedMatchType: fact.suggestedMatchType || (fact.llmExactModelMatch ? 'exact' : 'unknown'),
        effectiveMatchType: fact.modelMatchType || 'unknown',
        matchedToken: fact.matchedToken || null,
      },
      extraction: {
        provider: 'gemini',
        model: extraction.gemini?.model || DEFAULT_GEMINI_MODEL,
        confidence: fact.extractionConfidence || 'low',
      },
    };
  });
}

function aggregateIdentity(facts, requestedModel, local, modelIdentity = null) {
  const precedence = ['exact', 'canonical-equivalent', 'variant', 'family', 'mismatch', 'unknown'];
  const localModel = local?.record?.model || null;
  const matchType = localModel
    ? 'exact'
    : (precedence.find((type) =>
      facts.some((item) => item.identity.effectiveMatchType === type)) || 'unknown');
  const matchedToken = facts.find((item) => item.identity.effectiveMatchType === matchType)
    ?.identity?.matchedToken
    || null;
  const canonicalFromIdentity = modelIdentity?.canonicalModel || null;
  const resolvedModel = localModel
    || (matchType === 'exact' || matchType === 'canonical-equivalent'
      ? (matchedToken || canonicalFromIdentity || requestedModel)
      : null);
  return {
    model: resolvedModel,
    normalizedModel: resolvedModel ? compactModelToken(resolvedModel) : null,
    matchType,
    deterministicExact: matchType === 'exact' || matchType === 'canonical-equivalent',
    matchedBy: local?.normalization?.usedValidatedAlternative
      ? 'exact-alias'
      : (localModel
        ? 'canonical-model'
        : (matchType === 'canonical-equivalent' ? 'canonical-equivalent' : null)),
    equivalenceReason: matchType === 'canonical-equivalent'
      ? (modelIdentity?.equivalenceReason || 'transcription-equivalent')
      : null,
  };
}

function acceptedMatchTypes(querySpecificity) {
  if (querySpecificity === 'exact-model') return new Set(['exact', 'canonical-equivalent']);
  if (querySpecificity === 'model-line') return new Set(['exact', 'canonical-equivalent', 'variant', 'family']);
  if (querySpecificity === 'product-family') return new Set(['exact', 'canonical-equivalent', 'variant', 'family']);
  return new Set(['exact', 'canonical-equivalent', 'variant', 'family']);
}

function uniqueLifecycleYear(facts, eventType, allowedMatches = new Set(['exact'])) {
  const years = [...new Set(facts
    .filter((item) =>
      allowedMatches.has(item.identity.effectiveMatchType)
      && item.fact.eventType === eventType
      && Number.isInteger(item.fact.year))
    .map((item) => item.fact.year))];
  return { value: years.length === 1 ? years[0] : null, conflict: years.length > 1 };
}

function uniqueProductionEndYear(facts, allowedMatches = new Set(['exact'])) {
  const years = [...new Set(facts
    .filter((item) =>
      allowedMatches.has(item.identity.effectiveMatchType)
      && item.fact.target === 'model_lifecycle')
    .flatMap((item) => [
      item.fact.eventType === 'production_end' ? item.fact.year : null,
      item.fact.endYear,
    ])
    .filter(Number.isInteger))];
  return { value: years.length === 1 ? years[0] : null, conflict: years.length > 1 };
}

function classifySearchFailure(evidence) {
  const results = [evidence?.baseline, evidence?.documentFocused].filter(Boolean);
  if (results.some((result) => result.status === 'timeout')) return 'SERPER_TIMEOUT';
  const errorMessages = results.map((result) => result.errorMessage || '');
  if (errorMessages.some((message) => message === 'SERPER_API_KEY_MISSING')) return 'SERPER_NOT_CONFIGURED';
  if (errorMessages.some((message) => /SERPER_HTTP_429/.test(message))) return 'SERPER_RATE_LIMIT';
  if (results.some((result) => result.status === 'provider_error')) return 'SERPER_PROVIDER_ERROR';
  if (!results.some((result) => result.resultCount > 0)) return 'NO_SEARCH_RESULTS';
  return null;
}

function statusFor({ facts, extraction, evidence, conflict, querySpecificity }) {
  const exact = facts.some((item) =>
    item.identity.effectiveMatchType === 'exact'
    || item.identity.effectiveMatchType === 'canonical-equivalent');
  const variant = facts.some((item) => item.identity.effectiveMatchType === 'variant');
  const acceptableDatedFacts = facts.filter((item) =>
    acceptedMatchTypes(querySpecificity).has(item.identity.effectiveMatchType)
      && Number.isInteger(item.fact?.year));
  const acceptableDomains = new Set(acceptableDatedFacts.map((item) => item.source?.domain).filter(Boolean));
  const acceptableDatedFact = acceptableDatedFacts.some((item) =>
    ['launch', 'availability', 'production_start'].includes(item.fact?.eventType)
      || ['manufacturer', 'manual', 'spec-sheet', 'energy-star', 'retailer', 'review', 'parts'].includes(item.source?.sourceType))
    || acceptableDomains.size >= 2
    || acceptableDatedFacts.some((item) => item.identity?.effectiveMatchType === 'family');
  const searchFailure = classifySearchFailure(evidence);
  const extractorStatus = extraction?.gemini?.status;
  const extractorSchemaInvalid = (
    extractorStatus === 'success'
      && extraction?.cacheStatus !== 'hit'
      && !extraction?.gemini?.parsed
  ) || /EMPTY_GEMINI_OUTPUT|MALFORMED_GEMINI_JSON/.test(
    String(extraction?.gemini?.errorMessage || ''),
  );
  const extractorNotConfigured = /GEMINI_API_KEY_MISSING/.test(
    String(extraction?.gemini?.errorMessage || ''),
  );
  if (conflict) return { status: 'partial', failureCategory: 'EVIDENCE_CONFLICT' };
  if (querySpecificity !== 'exact-model' && acceptableDatedFact) {
    return { status: 'success', failureCategory: null };
  }
  if (exact && (searchFailure || extractorSchemaInvalid || ['timeout', 'error'].includes(extractorStatus))) {
    return {
      status: 'partial',
      failureCategory: searchFailure
        || (extractorSchemaInvalid ? 'EXTRACTOR_SCHEMA_INVALID' : null)
        || (extractorNotConfigured ? 'EXTRACTOR_NOT_CONFIGURED' : null)
        || (extractorStatus === 'timeout' ? 'EXTRACTOR_TIMEOUT' : 'EXTRACTOR_PROVIDER_ERROR'),
    };
  }
  if (exact) return { status: 'success', failureCategory: null };
  if (variant) return { status: 'variant_only', failureCategory: 'VARIANT_ONLY_EVIDENCE' };
  if (extractorStatus === 'timeout' || searchFailure === 'SERPER_TIMEOUT') {
    return { status: 'timeout', failureCategory: extractorStatus === 'timeout' ? 'EXTRACTOR_TIMEOUT' : searchFailure };
  }
  if (extractorSchemaInvalid) {
    return { status: 'error', failureCategory: 'EXTRACTOR_SCHEMA_INVALID' };
  }
  if (extractorNotConfigured) {
    return { status: 'unavailable', failureCategory: 'EXTRACTOR_NOT_CONFIGURED' };
  }
  if (searchFailure && searchFailure !== 'NO_SEARCH_RESULTS') {
    return { status: 'unavailable', failureCategory: searchFailure };
  }
  return { status: 'no_exact_evidence', failureCategory: 'NO_EXACT_MODEL_EVIDENCE' };
}

function logEvidence(logger, result, requestContext = {}) {
  if (!logger?.info) return;
  try {
    logger.info(JSON.stringify({
      event: 'shared_model_evidence',
      feature: 'model-evidence',
      consumer: requestContext.consumer || result.purpose || 'unknown',
      normalizedBrand: result.requestedIdentity.normalizedBrand,
      modelHash: createHash('sha256').update(result.requestedIdentity.normalizedModel).digest('hex').slice(0, 16),
      cacheStatus: result.cacheStatus || 'bypass',
      localStatus: result.providerSummary.localUsed ? 'hit' : 'miss',
      serperStatus: result.providerSummary.serperUsed ? 'used' : 'not-used',
      searchCount: result.providerSummary.searchCount,
      extractorStatus: result.providerSummary.extractorUsed ? 'used' : 'not-used',
      deterministicMatchType: result.matchedIdentity.matchType,
      effectiveMatchType: result.matchedIdentity.matchType,
      factCount: result.facts.length,
      lifecycleFactCount: result.facts.filter((item) => item.fact.target === 'model_lifecycle').length,
      failureCategory: result.failureCategory || null,
      totalDurationMs: result.timings.totalMs,
      scoringPath: requestContext.scoringPath || null,
    }));
  } catch (_) {}
}

export async function lookupModelEvidence(input = {}, options = {}) {
  const startedAt = Date.now();
  const brand = String(input.brand || '').trim();
  const model = String(input.model || '').trim();
  const category = String(input.category || '').trim();
  const purpose = String(input.purpose || 'unknown');
  const querySpecificity = String(input.querySpecificity || 'exact-model');
  const requestContext = input.requestContext || {};
  const modelIdentity = options.modelIdentity
    || buildSharedModelIdentity({ brand, model, category });
  const searchModels = modelIdentity.searchModels?.length
    ? modelIdentity.searchModels
    : (model ? [model] : []);
  const searchCategory = modelIdentity.searchCategory || category || null;
  const normalizedBrand = normalizeEvidenceBrand(brand);
  const normalizedModel = compactModelToken(model);
  const deadline = input.deadline || options.deadline || createDeadline({
    totalMs: options.timeoutMs || DEFAULT_BUDGET_MS,
    now: options.now,
  });
  const cache = options.cache || createDeterministicCache({ redis: options.redis || null, deadline });
  const cacheInput = {
    brand,
    model,
    category: searchCategory || category,
    searchModels: searchModels.join(','),
    geminiModel: options.geminiModel || DEFAULT_GEMINI_MODEL,
    extractorProvider: 'gemini',
  };

  const emptyBase = {
    evidenceVersion: SHARED_EVIDENCE_SCHEMA_VERSION,
    purpose,
    modelIdentity,
    requestedIdentity: {
      brand,
      model,
      enteredModel: modelIdentity.enteredModel || model,
      canonicalModel: modelIdentity.canonicalModel || model,
      normalizedBrand,
      normalizedModel,
      searchedModels: searchModels,
      searchCategory,
      normalizationApplied: Boolean(modelIdentity.normalizationApplied),
      equivalenceReason: modelIdentity.equivalenceReason || null,
      identityConfidence: modelIdentity.identityConfidence || null,
      querySpecificity,
    },
    matchedIdentity: {
      model: null,
      normalizedModel: null,
      matchType: 'unknown',
      deterministicExact: false,
      matchedBy: null,
      equivalenceReason: null,
    },
    facts: [],
    lifecycle: {
      supportedProductionStartYear: null,
      supportedProductionEndYear: null,
      supportedDiscontinuationYear: null,
    },
    status: 'error',
    failureCategory: null,
    providerSummary: {
      localUsed: false,
      serperUsed: false,
      extractorUsed: false,
      extractorStatus: 'skipped',
      searchCount: 0,
      extractorCallCount: 0,
      evidenceMatchModel: null,
    },
    timings: { localMs: 0, searchMs: 0, extractionMs: 0, totalMs: 0 },
    cacheStatus: 'bypass',
  };

  if (!normalizedModel) {
    const result = {
      ...emptyBase,
      status: 'error',
      failureCategory: 'INVALID_INPUT',
      timings: { ...emptyBase.timings, totalMs: Date.now() - startedAt },
    };
    logEvidence(options.logger, result, requestContext);
    return result;
  }

  let local = null;
  const localStart = Date.now();
  try {
    local = brand
      ? await (options.localLookup || findLocalRefinementEvidence)({ brand, model })
      : null;
  } catch (_) {
    local = null;
  }
  const localMs = Date.now() - localStart;
  const localEvidenceFacts = localFacts(local);

  if (!requestContext.localOnly && !local?.record) {
    const cached = await cache.getSharedEvidence?.(cacheInput);
    if (cached) {
      const result = {
        ...cached,
        purpose,
        cacheStatus: 'hit',
        providerSummary: {
          ...cached.providerSummary,
          searchCount: 0,
          extractorCallCount: 0,
        },
        timings: { ...cached.timings, localMs, totalMs: Date.now() - startedAt },
      };
      logEvidence(options.logger, result, requestContext);
      return result;
    }
  }

  if (requestContext.localOnly) {
    const matchedIdentity = aggregateIdentity(localEvidenceFacts, model, local, modelIdentity);
    const productionStart = uniqueLifecycleYear(localEvidenceFacts, 'production_start');
    const productionEnd = uniqueProductionEndYear(localEvidenceFacts);
    const discontinuation = uniqueLifecycleYear(localEvidenceFacts, 'discontinuation');
    const result = {
      ...emptyBase,
      matchedIdentity,
      facts: localEvidenceFacts,
      lifecycle: {
        supportedProductionStartYear: productionStart.value,
        supportedProductionEndYear: productionEnd.value,
        supportedDiscontinuationYear: discontinuation.value,
      },
      status: matchedIdentity.deterministicExact ? 'success' : 'no_exact_evidence',
      failureCategory: matchedIdentity.deterministicExact ? null : 'LOCAL_DB_MISS',
      providerSummary: { ...emptyBase.providerSummary, localUsed: Boolean(local?.record) },
      timings: { ...emptyBase.timings, localMs, totalMs: Date.now() - startedAt },
    };
    logEvidence(options.logger, result, requestContext);
    return result;
  }

  let evidence;
  let extraction;
  try {
    const searchStart = Date.now();
    evidence = await gatherEvidence(
      { brand, model, category: searchCategory || category, searchModels },
      {
        ...options,
        cache,
        deadline,
        localModelEvidence: null,
        allowBrandlessSearch: !brand,
        signal: options.signal,
        searchModels,
        searchCategory: searchCategory || category,
      },
    );
    const searchMs = Date.now() - searchStart;
    extraction = await runEvidenceExtraction(
      { brand, model, category: searchCategory || category, searchModels },
      evidence,
      {
        ...options,
        cache,
        deadline,
        signal: options.signal,
        searchModels,
      },
    );

    const facts = [...localEvidenceFacts, ...webFacts(extraction)];
    const matchedIdentity = aggregateIdentity(facts, model, local, modelIdentity);
    const allowedMatches = acceptedMatchTypes(querySpecificity);
    const productionStart = uniqueLifecycleYear(facts, 'production_start', allowedMatches);
    const productionEnd = uniqueProductionEndYear(facts, allowedMatches);
    const discontinuation = uniqueLifecycleYear(facts, 'discontinuation', allowedMatches);
    const conflict = productionStart.conflict || productionEnd.conflict || discontinuation.conflict;
    const classified = statusFor({ facts, extraction, evidence, conflict, querySpecificity });
    const searchResults = [evidence.baseline, evidence.documentFocused].filter(Boolean);
    const searchCount = Number(evidence.timings?.serperRequestCount)
      || searchResults.filter((item) =>
        item.cacheStatus === 'miss'
        && item.errorMessage !== 'SERPER_API_KEY_MISSING').length;
    const result = {
      ...emptyBase,
      matchedIdentity,
      facts,
      lifecycle: {
        supportedProductionStartYear: productionStart.value,
        supportedProductionEndYear: productionEnd.value,
        supportedDiscontinuationYear: discontinuation.value,
      },
      ...classified,
      providerSummary: {
        localUsed: Boolean(local?.record),
        serperUsed: searchResults.some((item) =>
          item.status === 'success'
          || (item.cacheStatus === 'miss' && item.errorMessage !== 'SERPER_API_KEY_MISSING')),
        extractorUsed: ['success', 'timeout'].includes(extraction.gemini?.status)
          || (extraction.gemini?.status === 'error'
            && !/GEMINI_API_KEY_MISSING/.test(String(extraction.gemini?.errorMessage || ''))),
        extractorStatus: extraction.gemini?.status || 'skipped',
        searchCount,
        extractorCallCount: extraction.cacheStatus === 'hit'
          || extraction.gemini?.status === 'skipped'
          || /GEMINI_API_KEY_MISSING/.test(String(extraction.gemini?.errorMessage || ''))
          ? 0
          : 1,
        evidenceMatchModel: evidence.evidenceMatchModel || matchedIdentity.model || null,
        searchedModels: evidence.searchedModels || searchModels,
      },
      timings: {
        localMs,
        searchMs,
        extractionMs: extraction.extractionMs || 0,
        totalMs: Date.now() - startedAt,
      },
      cacheStatus: extraction.cacheStatus === 'hit' ? 'facts-hit' : 'miss',
    };
    await cache.setSharedEvidence?.(cacheInput, result);
    logEvidence(options.logger, result, requestContext);
    return result;
  } catch (error) {
    const timedOut = isTimeoutError(error);
    const result = {
      ...emptyBase,
      matchedIdentity: aggregateIdentity(localEvidenceFacts, model, local, modelIdentity),
      facts: localEvidenceFacts,
      status: localEvidenceFacts.length ? 'partial' : (timedOut ? 'timeout' : 'error'),
      failureCategory: timedOut ? 'GLOBAL_BUDGET_EXHAUSTED' : 'EVIDENCE_INSUFFICIENT',
      providerSummary: {
        ...emptyBase.providerSummary,
        localUsed: Boolean(local?.record),
      },
      timings: { ...emptyBase.timings, localMs, totalMs: Date.now() - startedAt },
    };
    logEvidence(options.logger, result, requestContext);
    return result;
  }
}
