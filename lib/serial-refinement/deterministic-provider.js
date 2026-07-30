import { createDeadline } from '../smart-lookup/deadline.js';
import { resolveEffectiveYear } from './deterministic/candidate-evaluator.js';
import { createDeterministicCache } from './deterministic/cache.js';
import { runDeterministicEraEstimate } from './deterministic/orchestrator.js';

const DEFAULT_DETERMINISTIC_BUDGET_MS = 10000;

function qualityForFact(fact) {
  if (fact.sourceType === 'manufacturer' || fact.sourceType === 'energy-star') return 'official';
  return 'strong-secondary';
}

function toResponseEvidence(result) {
  const factsByIndex = new Map((result.extractedFacts || []).map((fact) => [fact.resultIndex, fact]));
  return (result.evidenceItems || []).map((item) => {
    const fact = factsByIndex.get(item.index) || {};
    const effectiveYear = resolveEffectiveYear(fact);
    return {
      type: fact.sourceType || 'other',
      title: item.title || item.domain || 'Model-era source',
      sourceUrl: item.link || null,
      publishedDate: item.rawDate || null,
      availabilityStart: null,
      availabilityEnd: null,
      productionStart: null,
      productionEnd: null,
      supports: fact.claimText || (effectiveYear
        ? `Dated exact-model evidence associated with ${effectiveYear}.`
        : 'Search result reviewed for exact-model era evidence.'),
      quality: qualityForFact(fact),
      verified: false,
      sourceName: item.domain || '',
      exactModelMatch: fact.exactModelMatch === true,
      modelMatchType: fact.modelMatchType || 'mismatch',
      evidenceYear: effectiveYear,
      dateMeaning: fact.dateMeaning || 'unknown',
    };
  });
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

  const result = await runDeterministicEraEstimate(request, {
    cache,
    deadline,
    signal: options.signal,
    localModelEvidence: options.localModelEvidence ?? null,
    serperApiKey: options.serperApiKey,
    serperFetchImpl: options.serperFetchImpl,
    geminiApiKey: options.geminiApiKey,
    geminiFetchImpl: options.geminiFetchImpl,
    geminiTimeoutMs: options.geminiTimeoutMs,
    geminiModel: options.geminiModel,
    referenceDate: options.referenceDate,
    currentYear: options.currentYear,
  });

  return {
    ...result,
    provider: 'deterministic-serper',
    evidence: toResponseEvidence(result),
    cacheStats: { ...cache.stats },
  };
}
