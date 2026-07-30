import { createDeadline } from '../smart-lookup/deadline.js';
import {
  sharedEvidenceToRefinementEvidence,
  sharedEvidenceToRefinementInput,
} from '../model-evidence/adapters.js';
import { lookupModelEvidence } from '../model-evidence/service.js';
import { evaluateCandidates } from './deterministic/candidate-evaluator.js';
import { createDeterministicCache } from './deterministic/cache.js';

const DEFAULT_DETERMINISTIC_BUDGET_MS = 10000;

function compatibilityStatus(shared) {
  if (shared.status === 'timeout') {
    return { status: 'timeout', errorCode: 'DETERMINISTIC_TIMEOUT' };
  }
  if (shared.status === 'error' || shared.status === 'unavailable') {
    if (['SERPER_NOT_CONFIGURED', 'NO_SEARCH_RESULTS', 'NO_EXACT_MODEL_EVIDENCE']
      .includes(shared.failureCategory)) {
      return { status: 'insufficient', errorCode: 'DETERMINISTIC_SERPER_ERROR' };
    }
    return {
      status: 'provider_error',
      errorCode: shared.failureCategory === 'SERPER_PROVIDER_ERROR'
        ? 'DETERMINISTIC_SERPER_ERROR'
        : 'DETERMINISTIC_GEMINI_ERROR',
    };
  }
  if (['no_exact_evidence', 'variant_only'].includes(shared.status)) {
    return { status: 'insufficient', errorCode: 'DETERMINISTIC_INSUFFICIENT_EVIDENCE' };
  }
  return { status: 'success', errorCode: null };
}

export async function callDeterministicSerper(request, options = {}) {
  const deadline = options.deadline || createDeadline({
    totalMs: options.timeoutMs || DEFAULT_DETERMINISTIC_BUDGET_MS,
    now: options.now,
  });
  const cache = options.cache || createDeterministicCache({
    redis: options.redis || null,
    deadline,
  });

  const sharedEvidence = await (options.modelEvidenceLookup || lookupModelEvidence)({
    brand: request.brand,
    model: request.model,
    category: request.category,
    purpose: 'model_refinement',
    deadline,
    requestContext: {
      consumer: 'model_refinement',
      requestId: options.requestId || null,
      scoringPath: 'phase1-deterministic-evaluator',
    },
  }, {
    cache,
    redis: options.redis || null,
    signal: options.signal,
    serperApiKey: options.serperApiKey,
    serperFetchImpl: options.serperFetchImpl,
    geminiApiKey: options.geminiApiKey,
    geminiFetchImpl: options.geminiFetchImpl,
    geminiTimeoutMs: options.geminiTimeoutMs,
    geminiModel: options.geminiModel,
    referenceDate: options.referenceDate,
    currentYear: options.currentYear,
    logger: options.logger,
  });
  const extractedFacts = sharedEvidenceToRefinementInput(sharedEvidence);
  const output = evaluateCandidates({
    candidateYears: request.candidateYears,
    evidenceFacts: extractedFacts,
    localModelEvidence: options.localModelEvidence ?? null,
  });
  const compatibility = compatibilityStatus(sharedEvidence);
  const evidence = sharedEvidenceToRefinementEvidence(sharedEvidence);
  const evidenceItems = (sharedEvidence.facts || []).map((item, index) => ({
    index: Number.isInteger(item.source?.resultIndex) ? item.source.resultIndex : index,
    strategy: item.extraction?.provider === 'local-database' ? 'local' : 'shared-exact-model',
    title: item.source?.title || '',
    snippet: item.fact?.claim || '',
    domain: item.source?.domain || '',
    link: item.source?.url || null,
    rawDate: null,
    normalizedDateYear: Number.isInteger(item.fact?.year) ? item.fact.year : null,
    normalizedDatePrecision: item.fact?.precision || 'unknown',
  }));

  return {
    brand: request.brand,
    model: request.model,
    category: request.category || null,
    candidateYears: request.candidateYears,
    localModelEvidence: options.localModelEvidence ?? null,
    serper: null,
    gemini: {
      status: sharedEvidence.providerSummary.extractorStatus
        || (sharedEvidence.providerSummary.extractorUsed ? 'success' : 'skipped'),
      model: options.geminiModel || null,
      durationMs: sharedEvidence.timings.extractionMs,
      parsed: null,
      rawText: null,
      finishReason: sharedEvidence.cacheStatus === 'hit' ? 'CACHE_HIT' : null,
      usage: null,
    },
    extractedFacts,
    evidenceItems,
    output,
    status: compatibility.status,
    errorCode: compatibility.errorCode,
    cacheStatus: sharedEvidence.cacheStatus,
    timings: {
      serperMs: sharedEvidence.timings.searchMs,
      serperRequestCount: sharedEvidence.providerSummary.searchCount,
      geminiMs: sharedEvidence.timings.extractionMs,
      totalMs: sharedEvidence.timings.totalMs,
    },
    prompt: null,
    provider: 'deterministic-serper',
    evidence,
    sharedEvidence,
    cacheStats: { ...cache.stats },
  };
}
