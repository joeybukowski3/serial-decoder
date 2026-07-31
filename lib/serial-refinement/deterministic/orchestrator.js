/**
 * Production deterministic orchestrator combining:
 *   local serial candidate years -> local model DB lookup -> Serper baseline
 *   -> conditional Serper document-focused -> one fast non-grounded Gemini call
 *
 * Reuses the bounded Serper client and receives endpoint-local model evidence
 * when available. Gemini extracts source facts only; code scores candidates.
 */
import { searchModelWithSerper, MANUFACTURER_DOMAINS } from '../../serper/model-search.js';
import { findLocalModelAgeResult } from '../../smart-lookup/age-legacy.js';
import {
  buildEstimatorPrompt,
  callGeminiEstimator,
  DEFAULT_GEMINI_MODEL,
  enforceEstimatorSafety,
} from './gemini-estimator.js';
import { normalizeRelativeDate } from './date-normalizer.js';
import { buildEvidenceExtractionPrompt, normalizeExtractedEvidence } from './evidence-extraction.js';
import { evaluateCandidates } from './candidate-evaluator.js';
import { classifyModelIdentity } from './model-identity.js';

const SERPER_TIMEOUT_MS = 3000;
const GEMINI_TIMEOUT_MS = 8000;
const PROVIDER_RESERVE_MS = 350;
const SERPER_TOTAL_BUDGET_MS = 3000;

/**
 * A baseline result is treated as sufficient (skipping the document-focused
 * follow-up call) only when it already shows era-relevant signal: a
 * manufacturer-domain hit, a visible year, or an exact-title match plus a
 * healthy result count. Otherwise the document-focused query is also run so
 * Gemini has manual/spec-sheet-style evidence to reason over.
 */
export function isBaselineSufficient(baseline) {
  if (baseline.status !== 'success' || baseline.resultCount < 3) return false;
  return Boolean(baseline.manufacturerDomainFound || baseline.yearMentionFound);
}

async function getLocalModelEvidence(brand, model, options) {
  if (Object.hasOwn(options, 'localModelEvidence')) {
    const local = options.localModelEvidence;
    if (!local) return null;
    const start = Number.isInteger(local.start) ? local.start : null;
    const end = Number.isInteger(local.end) ? local.end : null;
    if (start == null && end == null) return null;
    if (start != null && end != null && start > end) return null;
    return {
      ...local,
      start,
      end,
      verifiedExact: Boolean(local.verifiedExact),
    };
  }

  const lookup = options.localLookup || findLocalModelAgeResult;
  const query = `${brand} ${model}`.trim();
  try {
    const local = await lookup(query, query.toLowerCase());
    if (!local?.productionRange || !Number.isInteger(local.productionRange.start) || !Number.isInteger(local.productionRange.end)) {
      return null;
    }
    return {
      start: local.productionRange.start,
      end: local.productionRange.end,
      verifiedExact: Boolean(local.verifiedExact),
    };
  } catch (_) {
    return null;
  }
}

function toEvidenceItem(result, strategyLabel) {
  return result.results.map((r) => ({ ...r, strategy: strategyLabel }));
}

function remainingMs(options, reserveMs = 0) {
  if (options.deadline) return options.deadline.remainingMs(reserveMs);
  return Number.POSITIVE_INFINITY;
}

function timeoutSearchResult(input, strategy) {
  return {
    brand: input.brand,
    model: input.model,
    category: input.category || null,
    query: '',
    durationMs: 0,
    status: 'timeout',
    resultCount: 0,
    exactModelFound: false,
    exactModelInTitle: false,
    manufacturerDomainFound: false,
    yearMentionFound: false,
    results: [],
    errorMessage: `DEADLINE_BEFORE_${strategy.toUpperCase().replace(/-/g, '_')}`,
  };
}

async function searchWithCache(input, strategy, options) {
  const cacheInput = { ...input, strategy };
  const cached = await options.cache?.getRawSearch(cacheInput);
  if (cached) return { ...cached, cacheStatus: 'hit', durationMs: 0 };

  const budgetMs = Math.min(
    options.searchMaxMs ?? SERPER_TIMEOUT_MS,
    remainingMs(options, PROVIDER_RESERVE_MS),
  );
  if (!Number.isFinite(budgetMs) || budgetMs >= 25) {
    const result = await searchModelWithSerper(
      { ...input, timeoutMs: Number.isFinite(budgetMs) ? budgetMs : SERPER_TIMEOUT_MS },
      {
        apiKey: options.serperApiKey,
        fetchImpl: options.serperFetchImpl,
        signal: options.signal,
      },
    );
    if (result.status === 'success') await options.cache?.setRawSearch(cacheInput, result);
    return { ...result, cacheStatus: 'miss' };
  }

  return { ...timeoutSearchResult(input, strategy), cacheStatus: 'bypass' };
}

function uniqueSearchModels(primary, searchModels) {
  const values = [primary, ...(Array.isArray(searchModels) ? searchModels : [])]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return [...new Set(values)].slice(0, 2);
}

function mergeSearchResults(primary, secondary) {
  if (!secondary) return primary;
  if (!primary) return secondary;
  const seen = new Set((primary.results || []).map((item) => item.link || item.title));
  const mergedResults = [...(primary.results || [])];
  for (const item of secondary.results || []) {
    const key = item.link || item.title;
    if (seen.has(key)) continue;
    seen.add(key);
    mergedResults.push(item);
  }
  return {
    ...primary,
    results: mergedResults,
    resultCount: mergedResults.length,
    exactModelFound: Boolean(primary.exactModelFound || secondary.exactModelFound),
    exactModelInTitle: Boolean(primary.exactModelInTitle || secondary.exactModelInTitle),
    manufacturerDomainFound: Boolean(primary.manufacturerDomainFound || secondary.manufacturerDomainFound),
    yearMentionFound: Boolean(primary.yearMentionFound || secondary.yearMentionFound),
    status: primary.status === 'success' || secondary.status === 'success'
      ? 'success'
      : (primary.status || secondary.status),
    durationMs: (primary.durationMs || 0) + (secondary.durationMs || 0),
    searchedModels: uniqueSearchModels(primary.model, [secondary.model]),
    evidenceMatchModel: secondary.exactModelFound && !primary.exactModelFound
      ? secondary.model
      : (primary.exactModelFound ? primary.model : (secondary.model || primary.model)),
  };
}

/**
 * Gathers local-model-DB and Serper evidence — no Gemini call.
 *
 * When `options.searchModels` (or `input.searchModels`) includes a safe
 * transcription alternative, a second baseline search may run inside the same
 * aggregate Serper budget only if the first search lacks useful model signal.
 *
 * @param {{brand:string, model:string, category?:string, searchModels?:string[]}} input
 * @param {object} [options]
 */
export async function gatherEvidence(input, options = {}) {
  const { brand, model } = input;
  const category = options.searchCategory || input.category;
  const timings = {};
  const start = Date.now();
  const searchModels = uniqueSearchModels(model, options.searchModels || input.searchModels);
  let serperRequestCount = 0;
  let evidenceMatchModel = null;

  const localModelEvidence = await getLocalModelEvidence(brand, model, options);

  const totalSearchBudgetMs = options.serperTotalBudgetMs || SERPER_TOTAL_BUDGET_MS;
  let baseline = null;

  for (let index = 0; index < searchModels.length; index += 1) {
    const searchModel = searchModels[index];
    const remainingBudgetMs = Math.max(0, totalSearchBudgetMs - (Date.now() - start));
    if (remainingBudgetMs < 25 && index > 0) break;

    // First model may use up to the full per-call timeout; alternatives only
    // spend remaining aggregate budget so dual-form search never doubles cost.
    const perCallBudget = index === 0
      ? Math.min(SERPER_TIMEOUT_MS, totalSearchBudgetMs)
      : Math.min(SERPER_TIMEOUT_MS, remainingBudgetMs);

    const next = await searchWithCache(
      {
        brand,
        model: searchModel,
        category,
        allowBrandless: options.allowBrandlessSearch === true,
      },
      index === 0 ? 'baseline' : 'baseline-alternative',
      { ...options, searchMaxMs: perCallBudget },
    );
    serperRequestCount += 1;
    if (next.status === 'success' && (next.exactModelFound || next.yearMentionFound)) {
      evidenceMatchModel = searchModel;
    }
    baseline = mergeSearchResults(baseline, { ...next, model: searchModel });

    // Skip further search forms when the first already found strong signal.
    if (index === 0 && (isBaselineSufficient(next) || next.exactModelFound)) break;
  }

  if (!baseline) {
    baseline = timeoutSearchResult({ brand, model, category }, 'baseline');
  }

  let documentFocused = null;
  const sufficient = isBaselineSufficient(baseline);
  if (!sufficient) {
    const remainingSearchBudgetMs = Math.max(0, totalSearchBudgetMs - (Date.now() - start));
    const docModel = evidenceMatchModel || searchModels[searchModels.length - 1] || model;
    if (remainingSearchBudgetMs >= 25) {
      documentFocused = await searchWithCache(
        {
          brand,
          model: docModel,
          category: 'manual specifications',
          allowBrandless: options.allowBrandlessSearch === true,
        },
        'document-focused',
        { ...options, searchMaxMs: remainingSearchBudgetMs },
      );
      serperRequestCount += 1;
      if (documentFocused.status === 'success' && documentFocused.exactModelFound) {
        evidenceMatchModel = docModel;
      }
    }
  }
  timings.serperMs = Date.now() - start;
  timings.serperRequestCount = serperRequestCount;
  timings.baselineSufficient = sufficient;
  timings.searchedModels = searchModels;
  timings.evidenceMatchModel = evidenceMatchModel;

  const serperResults = [
    ...toEvidenceItem(baseline, 'baseline'),
    ...(documentFocused ? toEvidenceItem(documentFocused, 'document-focused') : []),
  ];

  return {
    localModelEvidence,
    baseline,
    documentFocused,
    serperResults,
    timings,
    searchedModels: searchModels,
    evidenceMatchModel,
  };
}

/**
 * Single fast non-grounded Gemini call plus safety enforcement over
 * already-gathered evidence, for a given candidate-year ordering. Order is
 * preserved verbatim into the prompt (buildEstimatorPrompt never sorts).
 *
 * @param {{brand:string, model:string, category?:string, candidateYears:number[]}} input
 * @param {{localModelEvidence:object|null, serperResults:Array}} evidence
 * @param {object} [options]
 */
export async function runGeminiEstimateOverEvidence(input, evidence, options = {}) {
  const { brand, model, category, candidateYears } = input;
  const { localModelEvidence, serperResults } = evidence;

  const prompt = buildEstimatorPrompt({
    brand,
    model,
    category,
    candidateYears,
    localModelEvidence,
    serperResults,
    currentYear: new Date().getFullYear(),
  });

  const geminiStart = Date.now();
  const geminiTimeoutMs = Math.min(
    options.geminiTimeoutMs || GEMINI_TIMEOUT_MS,
    remainingMs(options, PROVIDER_RESERVE_MS),
  );
  const gemini = await callGeminiEstimator(prompt, {
    apiKey: options.geminiApiKey,
    fetchImpl: options.geminiFetchImpl,
    timeoutMs: Number.isFinite(geminiTimeoutMs) ? Math.max(1, geminiTimeoutMs) : options.geminiTimeoutMs,
    model: options.geminiModel,
    signal: options.signal,
  });
  const geminiMs = Date.now() - geminiStart;

  let output = null;
  if (gemini.status === 'success' && gemini.parsed) {
    output = enforceEstimatorSafety(gemini.parsed, {
      candidateYears,
      serperResults,
      localModelEvidence,
      manufacturerDomains: MANUFACTURER_DOMAINS,
    });
  }

  return { prompt, gemini, output, geminiMs, rawParsed: gemini.parsed || null };
}

/**
 * Runs the full combined pipeline for one model and returns a full record
 * suitable for both production-decision benchmarking and human review.
 *
 * @param {{brand:string, model:string, category?:string, candidateYears:number[]}} input
 * @param {object} [options]
 */
export async function runEraEstimator(input, options = {}) {
  const overallStart = Date.now();
  const evidence = await gatherEvidence(input, options);
  const { gemini, output, geminiMs, prompt } = await runGeminiEstimateOverEvidence(input, evidence, options);

  const timings = {
    ...evidence.timings,
    geminiMs,
    totalMs: Date.now() - overallStart,
  };

  return {
    brand: input.brand,
    model: input.model,
    category: input.category || null,
    candidateYears: input.candidateYears,
    localModelEvidence: evidence.localModelEvidence,
    serper: { baseline: evidence.baseline, documentFocused: evidence.documentFocused },
    gemini,
    output,
    timings,
    prompt,
  };
}

/**
 * DETERMINISTIC-SCORING ARCHITECTURE (candidate-order-bias fix).
 *
 * Gemini is called exactly ONCE here, purely to extract objective per-source
 * facts (see evidence-extraction.js) — it is never shown candidateYears and
 * never asked to pick, narrow, or eliminate a year. Because of that, this
 * extraction call is entirely independent of candidate ordering: calling it
 * once and reusing the result for as many candidateYears permutations as
 * needed (via evaluateCandidates, a pure function) is both correct and far
 * cheaper than the prior one-Gemini-call-per-permutation approach.
 *
 * @param {{brand:string, model:string, category?:string}} input
 * @param {{serperResults:Array}} evidence from gatherEvidence()
 * @param {object} [options]
 */
const MAX_EVIDENCE_ITEMS_SENT_TO_GEMINI = 6;

/**
 * Deduplicates Serper results by domain (keeping the first/highest-relevance
 * occurrence) and caps the list to MAX_EVIDENCE_ITEMS_SENT_TO_GEMINI before
 * they reach the prompt — mirrored/duplicate listings add tokens and
 * latency without adding scoring signal (candidate-evaluator.js already
 * dedupes by domain for scoring purposes, so trimming here is a pure
 * latency win, not a quality loss).
 */
function dedupeAndCapEvidence(serperResults, limit) {
  const seenDomains = new Set();
  const deduped = [];
  for (const r of serperResults) {
    const key = r.domain || r.title;
    if (seenDomains.has(key)) continue;
    seenDomains.add(key);
    deduped.push(r);
    if (deduped.length >= limit) break;
  }
  return deduped;
}

export async function runEvidenceExtraction(input, evidence, options = {}) {
  const { brand, model, category } = input;
  const currentYear = options.currentYear || new Date().getFullYear();
  const limit = options.maxEvidenceItems || MAX_EVIDENCE_ITEMS_SENT_TO_GEMINI;

  const evidenceItems = dedupeAndCapEvidence(evidence.serperResults, limit).map((r, index) => {
    const normalized = normalizeRelativeDate(r.date, options.referenceDate);
    return {
      index,
      strategy: r.strategy,
      title: r.title,
      snippet: r.snippet,
      domain: r.domain,
      link: r.link,
      rawDate: r.date,
      normalizedDateYear: normalized.year,
      normalizedDatePrecision: normalized.precision,
    };
  });

  const prompt = buildEvidenceExtractionPrompt({ brand, model, category, currentYear, evidenceItems });
  const cacheInput = {
    brand,
    model,
    category,
    evidenceItems,
    geminiModel: options.geminiModel || DEFAULT_GEMINI_MODEL,
  };
  const cached = await options.cache?.getExtractedFacts(cacheInput);
  if (cached) {
    return {
      prompt: null,
      gemini: {
        status: 'success',
        model: options.geminiModel || DEFAULT_GEMINI_MODEL,
        durationMs: 0,
        parsed: null,
        rawText: null,
        finishReason: 'CACHE_HIT',
        usage: null,
      },
      extractionMs: 0,
      extractedFacts: cached.extractedFacts,
      evidenceItems,
      cacheStatus: 'hit',
    };
  }

  if (!evidenceItems.length) {
    return {
      prompt,
      gemini: {
        status: 'skipped',
        model: options.geminiModel || DEFAULT_GEMINI_MODEL,
        durationMs: 0,
        parsed: null,
        rawText: null,
        finishReason: null,
        usage: null,
        errorMessage: 'NO_SERPER_EVIDENCE',
      },
      extractionMs: 0,
      extractedFacts: [],
      evidenceItems,
      cacheStatus: 'bypass',
    };
  }

  const extractionStart = Date.now();
  const geminiTimeoutMs = Math.min(
    options.geminiTimeoutMs || GEMINI_TIMEOUT_MS,
    remainingMs(options, PROVIDER_RESERVE_MS),
  );
  let gemini;
  try {
    gemini = await callGeminiEstimator(prompt, {
      apiKey: options.geminiApiKey,
      fetchImpl: options.geminiFetchImpl,
      timeoutMs: Number.isFinite(geminiTimeoutMs) ? Math.max(1, geminiTimeoutMs) : options.geminiTimeoutMs,
      model: options.geminiModel,
      signal: options.signal,
      // Latency-optimization pass: evidence sent to Gemini is now deduped and
      // capped to MAX_EVIDENCE_ITEMS_SENT_TO_GEMINI (6) items, and the unused
      // absoluteDate field was dropped from the extraction schema, so the
      // 2048 ceiling the richer legacy schema needs is no longer required
      // here. 1408 sits mid-range in the requested 1280-1536 window with
      // headroom for 6 sources x 8 fields (verified via finishReason during
      // the calibration retest — see the report's Latency Comparison section).
      maxOutputTokens: options.maxOutputTokens || 1408,
    });
  } catch (error) {
    gemini = {
      status: 'error',
      model: options.geminiModel || DEFAULT_GEMINI_MODEL,
      durationMs: 0,
      parsed: null,
      rawText: null,
      finishReason: null,
      usage: null,
      errorMessage: String(error?.message || 'EXTRACTOR_PROVIDER_ERROR'),
    };
  }
  const extractionMs = Date.now() - extractionStart;

  const rawFacts = gemini.status === 'success' && gemini.parsed
    ? normalizeExtractedEvidence(gemini.parsed, evidenceItems.length)
    : [];

  // Merge Gemini's per-source facts back with the deterministically-known
  // domain and normalizedDateYear for that same index, so the evaluator has
  // everything it needs without re-deriving anything from Gemini's output.
  const searchModels = options.searchModels || input.searchModels || [model];
  const factsByIndex = new Map(rawFacts.map((f) => [f.resultIndex, f]));
  const extractedFacts = evidenceItems.map((item) => {
    const fact = factsByIndex.get(item.index);
    const identity = classifyModelIdentity({
      model,
      title: item.title,
      snippet: item.snippet,
      searchModels,
    });
    const scoringMatch = identity.matchType === 'exact'
      || identity.matchType === 'canonical-equivalent';
    return {
      resultIndex: item.index,
      domain: item.domain,
      normalizedDateYear: item.normalizedDateYear,
      modelMatchType: identity.matchType,
      matchedToken: identity.matchedToken || null,
      exactModelMatch: scoringMatch,
      llmExactModelMatch: fact?.exactModelMatch ?? false,
      suggestedMatchType: fact?.suggestedMatchType ?? (fact?.exactModelMatch ? 'exact' : 'unknown'),
      sourceType: fact?.sourceType ?? 'other',
      absoluteDate: fact?.absoluteDate ?? null,
      approximateYear: fact?.approximateYear ?? null,
      approximateEndYear: fact?.approximateEndYear ?? null,
      dateMeaning: fact?.dateMeaning ?? 'unknown',
      datePrecision: fact?.datePrecision ?? 'unknown',
      evidenceTarget: fact?.evidenceTarget ?? 'source_only',
      extractionConfidence: fact?.extractionConfidence ?? 'low',
      ownershipAgeYears: fact?.ownershipAgeYears ?? null,
      explicitlyNewProduct: fact?.explicitlyNewProduct ?? false,
      explicitlyDiscontinued: fact?.explicitlyDiscontinued ?? false,
      claimText: fact?.claimText ?? '',
    };
  });

  if (gemini.status === 'success') {
    await options.cache?.setExtractedFacts(cacheInput, { extractedFacts });
  }

  return {
    prompt,
    gemini,
    extractionMs,
    extractedFacts,
    evidenceItems,
    cacheStatus: 'miss',
  };
}

/**
 * Runs the full deterministic-scoring pipeline for one model: gathers
 * evidence, extracts facts (1 Gemini call), then scores the given
 * candidateYears ordering with the pure evaluateCandidates() function.
 * Exposed separately from runEvidenceExtraction so a caller (e.g. an
 * order-bias validation script) can extract once and evaluate many
 * candidate-year orderings for free, with zero additional API calls.
 *
 * @param {{brand:string, model:string, category?:string, candidateYears:number[]}} input
 * @param {object} [options]
 */
export async function runDeterministicEraEstimate(input, options = {}) {
  const overallStart = Date.now();
  const evidence = await gatherEvidence(input, options);
  const extraction = await runEvidenceExtraction(input, evidence, options);

  const output = evaluateCandidates({
    candidateYears: input.candidateYears,
    evidenceFacts: extraction.extractedFacts,
    localModelEvidence: evidence.localModelEvidence,
  });

  const searchStatuses = [evidence.baseline?.status, evidence.documentFocused?.status].filter(Boolean);
  let status = 'success';
  let errorCode = null;
  if (extraction.gemini.status === 'timeout') {
    status = 'timeout';
    errorCode = 'DETERMINISTIC_TIMEOUT';
  } else if (extraction.gemini.status === 'error') {
    status = 'provider_error';
    errorCode = 'DETERMINISTIC_GEMINI_ERROR';
  } else if (!extraction.evidenceItems.length) {
    status = searchStatuses.includes('timeout') ? 'timeout' : 'insufficient';
    errorCode = searchStatuses.includes('timeout')
      ? 'DETERMINISTIC_TIMEOUT'
      : (searchStatuses.includes('provider_error')
        ? 'DETERMINISTIC_SERPER_ERROR'
        : 'DETERMINISTIC_INSUFFICIENT_EVIDENCE');
  }

  const timings = {
    ...evidence.timings,
    geminiMs: extraction.extractionMs,
    totalMs: Date.now() - overallStart,
  };

  return {
    brand: input.brand,
    model: input.model,
    category: input.category || null,
    candidateYears: input.candidateYears,
    localModelEvidence: evidence.localModelEvidence,
    serper: { baseline: evidence.baseline, documentFocused: evidence.documentFocused },
    gemini: extraction.gemini,
    extractedFacts: extraction.extractedFacts,
    evidenceItems: extraction.evidenceItems,
    output,
    status,
    errorCode,
    cacheStatus: extraction.cacheStatus,
    timings,
    prompt: extraction.prompt,
  };
}
