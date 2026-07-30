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

  const budgetMs = Math.min(SERPER_TIMEOUT_MS, remainingMs(options, PROVIDER_RESERVE_MS));
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

/**
 * Gathers local-model-DB and Serper evidence for one model ONLY — no Gemini
 * call. Extracted so a caller (e.g. a candidate-order bias benchmark) can
 * fetch evidence exactly once per model and reuse the identical evidence
 * across multiple Gemini calls with different candidate-year orderings,
 * rather than re-fetching Serper per permutation.
 *
 * @param {{brand:string, model:string, category?:string}} input
 * @param {object} [options]
 */
export async function gatherEvidence(input, options = {}) {
  const { brand, model, category } = input;
  const timings = {};
  const start = Date.now();

  const localModelEvidence = await getLocalModelEvidence(brand, model, options);

  const baseline = await searchWithCache({ brand, model, category }, 'baseline', options);

  let documentFocused = null;
  const sufficient = isBaselineSufficient(baseline);
  if (!sufficient) {
    documentFocused = await searchWithCache(
      { brand, model, category: 'manual specifications' },
      'document-focused',
      options,
    );
  }
  timings.serperMs = Date.now() - start;
  timings.serperRequestCount = documentFocused ? 2 : 1;
  timings.baselineSufficient = sufficient;

  const serperResults = [
    ...toEvidenceItem(baseline, 'baseline'),
    ...(documentFocused ? toEvidenceItem(documentFocused, 'document-focused') : []),
  ];

  return { localModelEvidence, baseline, documentFocused, serperResults, timings };
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
  const factsByIndex = new Map(rawFacts.map((f) => [f.resultIndex, f]));
  const extractedFacts = evidenceItems.map((item) => {
    const fact = factsByIndex.get(item.index);
    const identity = classifyModelIdentity({
      model,
      title: item.title,
      snippet: item.snippet,
    });
    return {
      resultIndex: item.index,
      domain: item.domain,
      normalizedDateYear: item.normalizedDateYear,
      modelMatchType: identity.matchType,
      exactModelMatch: identity.matchType === 'exact',
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
