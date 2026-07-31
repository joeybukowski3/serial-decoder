import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import { lookupModelProduction } from '../lib/model-era-lookup.js';
import {
  isShadowModeEnabled,
  observeRefinementShadow,
  startShadowTask,
} from '../lib/model-evidence/shadow.js';
import { buildSharedModelIdentity } from '../lib/model-evidence/shared-model-identity.js';
import { classifyLookupFailure } from '../lib/lookup-failure-taxonomy.js';
import { budgetsForRefinementMode } from '../lib/serial-refinement/budgets.js';
import { chooseRefinementCacheTtl } from '../lib/serial-refinement/cache-policy.js';
import { buildSerialRefinementCacheKey, hashModelIdentifier } from '../lib/serial-refinement/cache-key.js';
import { resolveCandidateIntersection, normalizeCandidateYears } from '../lib/serial-refinement/candidate-intersection.js';
import { evaluateEvidencePolicy } from '../lib/serial-refinement/evidence-policy.js';
import { findLocalRefinementEvidence } from '../lib/serial-refinement/local-evidence.js';
import { callDeterministicSerper } from '../lib/serial-refinement/deterministic-provider.js';
import { runSharedInflight } from '../lib/serial-refinement/inflight.js';
import {
  buildModelProductionSummary,
  mergeLocalModelEvidence,
  modelProductionDecision,
  modelProductionEvidence,
} from '../lib/serial-refinement/model-production.js';
import { callGeminiGroundedSearch } from '../lib/serial-refinement/provider.js';
import {
  buildSummary,
  createBestAvailableResult,
  createDeterministicRefinementResult,
  rankCandidatesByModelLowerBound,
} from '../lib/serial-refinement/response-mapping.js';
import { assertRefinementResponseInvariant, createRefinementResponse } from '../lib/serial-refinement/response-schema.js';
import {
  buildCostProxy,
  logRefinementTelemetry,
} from '../lib/serial-refinement/telemetry.js';
import { createDeadline, isTimeoutError } from '../lib/smart-lookup/deadline.js';
import { boundedRateLimit, boundedRedisGet, boundedRedisSet } from '../lib/smart-lookup/redis.js';

const MAX_CANDIDATES = 12;
const GROUNDED_RATE_LIMIT_REQUESTS = 10;
const GROUNDED_RATE_LIMIT_WINDOW = '1 m';
const REFINEMENT_MODES = new Set(['legacy_gemini', 'deterministic_serper', 'local_only']);

function nowMs() {
  return Date.now();
}

function cleanString(value, maxLength) {
  const text = String(value || '').trim();
  if (!text || text.length > maxLength) return null;
  return text;
}

function validateRequestBody(body) {
  const brand = cleanString(body?.brand, 80);
  const category = cleanString(body?.category || 'unknown', 40);
  const serial = cleanString(body?.serial, 80);
  const model = cleanString(body?.model, 120);
  const decodedMonth = body?.decodedMonth == null ? '' : cleanString(body.decodedMonth, 80);
  const context = body?.context == null || body.context === '' ? '' : cleanString(body.context, 300);
  const candidateYears = normalizeCandidateYears(body?.candidateYears || []);

  if (!brand) return { error: 'INVALID_BRAND' };
  if (!category) return { error: 'INVALID_CATEGORY' };
  if (!serial) return { error: 'INVALID_SERIAL' };
  if (!model) return { error: 'INVALID_MODEL' };
  if (!candidateYears.length || candidateYears.length > MAX_CANDIDATES) return { error: 'INVALID_CANDIDATES' };
  if (decodedMonth === null) return { error: 'INVALID_DECODED_MONTH' };
  if (context === null) return { error: 'INVALID_CONTEXT' };

  return {
    value: { brand, category, serial, model, candidateYears, decodedMonth, context },
  };
}

export function resolveModelRefinementMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  return REFINEMENT_MODES.has(mode) ? mode : 'legacy_gemini';
}

function createDefaultRedis() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

function getClientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (Array.isArray(forwarded) && forwarded.length) return String(forwarded[0]).split(',')[0].trim();
  if (forwarded) return String(forwarded).split(',')[0].trim();
  const realIp = req.headers?.['x-real-ip'];
  if (realIp) return String(realIp).trim();
  return req.socket?.remoteAddress || 'unknown';
}

function createDefaultRateLimiter(redis) {
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(GROUNDED_RATE_LIMIT_REQUESTS, GROUNDED_RATE_LIMIT_WINDOW),
    analytics: false,
    prefix: 'serial-refinement-grounding-v1',
  });
}

function safeCachedResponse(value, candidateYears) {
  if (!value || typeof value !== 'object') return null;
  try {
    const response = createRefinementResponse({
      ...value,
      candidateYears,
      cacheStatus: 'hit',
      provider: 'redis',
    });
    return assertRefinementResponseInvariant(response);
  } catch (_) {
    return null;
  }
}

function attachFailureFields(response, errorCode, failureStage, failureCategory = null) {
  const classified = classifyLookupFailure({
    errorCode,
    failureStage,
    failureCategory: failureCategory || response?.failureCategory,
  });
  return {
    ...response,
    errorCode: errorCode || response?.errorCode || null,
    failureCode: classified.failureCode || errorCode || response?.failureCode || null,
    failureStage: classified.failureStage || failureStage || response?.failureStage || null,
    failureCategory: classified.failureCategory || response?.failureCategory || null,
  };
}

export function createRefineSerialDateHandler(dependencies = {}) {
  const localLookup = dependencies.localLookup || findLocalRefinementEvidence;
  const modelProductionLookup = dependencies.modelProductionLookup || lookupModelProduction;
  const legacyProviderLookup = dependencies.legacyProviderLookup
    || dependencies.providerLookup
    || callGeminiGroundedSearch;
  const deterministicProviderLookup = dependencies.deterministicProviderLookup || callDeterministicSerper;
  const redisFactory = dependencies.redisFactory || createDefaultRedis;
  const rateLimitFactory = dependencies.rateLimitFactory || createDefaultRateLimiter;
  const logger = dependencies.logger || console;
  const clock = dependencies.now || nowMs;
  const refinementMode = resolveModelRefinementMode(
    dependencies.refinementMode ?? process.env.MODEL_REFINEMENT_MODE,
  );
  const modeBudgets = budgetsForRefinementMode(refinementMode);
  const totalBudgetMs = dependencies.totalBudgetMs || modeBudgets.apiTotalMs;
  const providerBudgetMs = dependencies.providerBudgetMs || modeBudgets.providerMaxMs;
  const completionReserveMs = dependencies.completionReserveMs
    || modeBudgets.deterministicCompletionReserveMs;
  const inflightStore = dependencies.inflightStore || null;
  const sharedEvidenceShadowEnabled = dependencies.sharedEvidenceShadowEnabled
    ?? isShadowModeEnabled(
      (dependencies.env || process.env).MODEL_REFINEMENT_SHARED_EVIDENCE_SHADOW_ENABLED,
    );

  return async function handler(req, res) {
    const requestStart = clock();
    const requestId = String(req.headers?.['x-request-id'] || req.headers?.['x-vercel-id'] || `ref-${requestStart}-${Math.random().toString(36).slice(2, 8)}`);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const validation = validateRequestBody(req.body || {});
    if (validation.error) {
      return res.status(400).json({
        error: 'Invalid refinement request',
        errorCode: validation.error,
        failureCategory: 'input_unusable',
        failureCode: validation.error,
        failureStage: 'validation',
      });
    }

    const input = validation.value;
    const modelIdentity = buildSharedModelIdentity({
      brand: input.brand,
      model: input.model,
      category: input.category,
    });
    const deadline = createDeadline({ totalMs: totalBudgetMs, now: clock });
    const timings = {
      localMs: 0,
      cacheMs: 0,
      onlineLookupMs: 0,
      serperMs: 0,
      geminiMs: 0,
      totalMs: 0,
    };
    let cacheStatus = 'bypass';
    let finalResponse = null;
    let redis = null;
    let local = null;
    let localConfidence = null;
    let localModelRange = null;
    let localModelEvidence = null;
    let localEvidence = [];
    let localEvidenceHit = false;
    let productionDatabaseHit = false;
    let workingCandidateYears = [...input.candidateYears];
    let shadowTask = null;
    let shadowObserved = false;
    let inflightShared = false;
    let sharedEvidenceAttempted = false;
    let sharedEvidenceAccepted = false;
    let searchQueryCount = 0;
    let serperCallCount = 0;
    let geminiExtractionRan = false;
    let geminiGroundedRan = false;
    let searchResultCount = null;
    let evidenceFactCount = null;
    let providerAttemptCount = 0;
    let costSnapshot = null;

    function finish(response) {
      timings.totalMs = Math.max(0, clock() - requestStart);
      response.timings = { ...timings, ...(response.timings || {}) };
      if (!response.modelIdentity) response.modelIdentity = modelIdentity;
      if (!response.searchedModels) response.searchedModels = modelIdentity.searchModels;
      costSnapshot = response.cost || buildCostProxy({
        searchQueryCount,
        serperCallCount,
        geminiExtractionRan,
        geminiGroundedRan,
        cacheHit: (response.cacheStatus || cacheStatus) === 'hit',
        providerAttemptCount,
      });
      response.cost = costSnapshot;
      const safeResponse = assertRefinementResponseInvariant(createRefinementResponse(response));
      logRefinementTelemetry(logger, {
        requestId,
        refinementMode,
        mode: refinementMode,
        enteredBrand: input.brand.toLowerCase(),
        brand: input.brand.toLowerCase(),
        enteredModel: modelIdentity.enteredModel,
        canonicalModel: modelIdentity.canonicalModel,
        searchedModels: safeResponse.searchedModels || modelIdentity.searchModels,
        normalizationApplied: Boolean(modelIdentity.normalizationApplied),
        equivalenceReason: modelIdentity.equivalenceReason,
        identityMatchType: safeResponse.identityMatchType || modelIdentity.matchedBy,
        identityConfidence: safeResponse.identityConfidence || modelIdentity.identityConfidence,
        localEvidenceHit,
        productionDatabaseHit,
        cacheStatus: safeResponse.cacheStatus,
        sharedEvidenceAttempted,
        sharedEvidenceAccepted,
        searchResultCount,
        evidenceFactCount: evidenceFactCount
          ?? (Array.isArray(safeResponse.evidence) ? safeResponse.evidence.length : null),
        evidenceMatchModel: safeResponse.evidenceMatchModel || null,
        evidenceMatchType: safeResponse.evidenceMatchType || null,
        serialCandidateYears: input.candidateYears,
        preferredCandidateYear: safeResponse.preferredCandidateYear,
        remainingCandidateYears: safeResponse.remainingCandidateYears,
        candidatesPreserved: true,
        modelEraStart: safeResponse.modelProductionRange?.start ?? null,
        modelEraEnd: safeResponse.modelProductionRange?.end ?? null,
        refinementResultTier: safeResponse.refinementResultTier || safeResponse.status,
        status: safeResponse.status,
        provider: safeResponse.provider,
        failureCategory: safeResponse.failureCategory,
        failureStage: safeResponse.failureStage || null,
        failureCode: safeResponse.failureCode || safeResponse.errorCode,
        errorCode: safeResponse.errorCode,
        deterministicFallbackUsed: Boolean(safeResponse.deterministicFallbackUsed),
        serperDurationMs: timings.serperMs,
        geminiDurationMs: timings.geminiMs,
        providerDurationMs: timings.onlineLookupMs,
        localMs: timings.localMs,
        cacheMs: timings.cacheMs,
        onlineLookupMs: timings.onlineLookupMs,
        totalMs: timings.totalMs,
        inflightShared,
        searchQueryCount,
        serperCallCount,
        geminiExtractionRan,
        geminiGroundedRan,
        providerAttemptCount,
        cost: costSnapshot,
      });
      if (shadowTask && !shadowObserved) {
        shadowObserved = true;
        observeRefinementShadow(shadowTask, {
          requestId,
          brand: input.brand,
          model: input.model,
          candidateYears: input.candidateYears,
          primary: safeResponse,
          logger,
        });
      }
      return res.status(200).json(safeResponse);
    }

    function bestAvailable(errorCode, summary, attemptedProvider = 'none', extraEvidence = [], extra = {}) {
      const lowerBound = Number.isInteger(localModelRange?.start) ? localModelRange.start : null;
      let preferredCandidateYear = extra.preferredCandidateYear ?? null;
      let remaining = workingCandidateYears;
      let rankingExplanation = extra.rankingExplanation || null;

      if (!Number.isInteger(preferredCandidateYear) && Number.isInteger(lowerBound)) {
        const ranked = rankCandidatesByModelLowerBound(workingCandidateYears, lowerBound);
        if (ranked?.status === 'resolved') {
          remaining = ranked.remainingCandidateYears;
        } else if (ranked?.status === 'ranked') {
          preferredCandidateYear = ranked.preferredCandidateYear;
          remaining = ranked.remainingCandidateYears;
          rankingExplanation = rankingExplanation
            || `Model-era evidence places introduction around ${lowerBound} or later, so older serial cycles are unlikely.`;
        }
      }

      const base = createBestAvailableResult({
        input,
        remainingCandidateYears: remaining,
        confidence: localConfidence,
        modelProductionRange: localModelRange,
        modelNormalization: local?.normalization || null,
        modelIdentity,
        evidence: [...localEvidence, ...extraEvidence],
        timings,
        cacheStatus,
        provider: attemptedProvider === 'none'
          ? (remaining.length < input.candidateYears.length || localModelRange ? 'local-db' : 'none')
          : attemptedProvider,
        errorCode,
        summary,
        failureStage: extra.failureStage || null,
        preferredCandidateYear,
        rankingExplanation,
        estimateBasis: extra.estimateBasis || (localModelRange ? 'local-model-era' : null),
        identityMatchType: modelIdentity.matchedBy,
        identityConfidence: modelIdentity.identityConfidence,
        evidenceMatchModel: modelIdentity.canonicalModel,
        searchedModels: modelIdentity.searchModels,
        deterministicFallbackUsed: true,
      });
      return attachFailureFields(base, errorCode, extra.failureStage, extra.failureCategory);
    }

    try {
      const localStart = clock();
      local = await localLookup(input);
      timings.localMs = Math.max(0, clock() - localStart);
      const localPolicy = evaluateEvidencePolicy(local?.evidence || []);
      localEvidence = localPolicy.evidence || [];
      localEvidenceHit = Boolean((local?.evidence || []).length);
      const localDecision = resolveCandidateIntersection({
        candidateYears: input.candidateYears,
        evidenceRange: localPolicy.range,
        evidenceAvailable: Boolean((local?.evidence || []).length),
        evidenceSufficient: localPolicy.sufficient,
      });

      if (localPolicy.sufficient && ['resolved', 'conflict'].includes(localDecision.status)) {
        finalResponse = assertRefinementResponseInvariant(createRefinementResponse({
          ...localDecision,
          confidence: localPolicy.confidence,
          resolutionBasis: 'serial-plus-model',
          modelProductionRange: localPolicy.range ? { start: localPolicy.range.start, end: localPolicy.range.end } : null,
          modelNormalization: local?.normalization || null,
          modelIdentity,
          evidence: localPolicy.evidence,
          summary: buildSummary(localDecision, local?.normalization, modelIdentity),
          refinementResultTier: localDecision.status,
          searchedModels: modelIdentity.searchModels,
          identityMatchType: modelIdentity.matchedBy,
          identityConfidence: modelIdentity.identityConfidence,
          cacheStatus: 'bypass',
          provider: 'local-db',
          timings,
          errorCode: null,
        }));
        return finish(finalResponse);
      }

      if (localPolicy.sufficient && localDecision.status === 'ambiguous'
        && localDecision.remainingCandidateYears.length < workingCandidateYears.length) {
        workingCandidateYears = localDecision.remainingCandidateYears;
        localConfidence = localPolicy.confidence;
        localModelRange = localPolicy.range
          ? { start: localPolicy.range.start, end: localPolicy.range.end }
          : null;
        localModelEvidence = localPolicy.range
          ? {
              start: localPolicy.range.start,
              end: localPolicy.range.end,
              verifiedExact: localPolicy.confidence === 'high',
            }
          : null;
      }

      let modelProduction = null;
      try {
        modelProduction = await modelProductionLookup(input.brand, input.model, workingCandidateYears);
      } catch (_) {
        modelProduction = null;
      }
      timings.localMs = Math.max(0, clock() - localStart);
      productionDatabaseHit = Boolean(modelProduction?.productionStartYear || modelProduction?.narrowedYears?.length);
      const modelDecision = modelProductionDecision(workingCandidateYears, modelProduction);
      if (modelDecision?.status === 'resolved') {
        const productionStartYear = Number.isInteger(modelProduction.productionStartYear)
          ? modelProduction.productionStartYear
          : null;
        const evidence = [...localEvidence, modelProductionEvidence(input, modelProduction)];
        finalResponse = assertRefinementResponseInvariant(createRefinementResponse({
          ...modelDecision,
          candidateYears: input.candidateYears,
          confidence: ['high', 'medium', 'low'].includes(modelProduction.confidence)
            ? modelProduction.confidence
            : 'low',
          resolutionBasis: 'serial-plus-model',
          modelProductionRange: productionStartYear == null ? null : { start: productionStartYear, end: null },
          modelNormalization: local?.normalization || null,
          modelIdentity,
          evidence,
          summary: productionStartYear == null
            ? buildSummary(modelDecision, local?.normalization, modelIdentity)
            : buildModelProductionSummary(modelDecision, modelProduction),
          refinementResultTier: modelDecision.status,
          estimateBasis: 'local-model-production-database',
          searchedModels: modelIdentity.searchModels,
          identityMatchType: modelIdentity.matchedBy,
          identityConfidence: modelIdentity.identityConfidence,
          evidenceMatchModel: modelProduction.matchedModel || modelIdentity.canonicalModel,
          cacheStatus: 'bypass',
          provider: 'local-db',
          timings,
          errorCode: null,
        }));
        return finish(finalResponse);
      }

      if (modelDecision?.status === 'ambiguous') {
        const productionStartYear = Number.isInteger(modelProduction.productionStartYear)
          ? modelProduction.productionStartYear
          : null;
        if (modelDecision.remainingCandidateYears.length < workingCandidateYears.length) {
          workingCandidateYears = modelDecision.remainingCandidateYears;
        }
        localConfidence = ['high', 'medium', 'low'].includes(modelProduction.confidence)
          ? modelProduction.confidence
          : (localConfidence || 'low');
        localModelRange = productionStartYear == null
          ? localModelRange
          : { start: productionStartYear, end: localModelRange?.end ?? null };
        localEvidence = [...localEvidence, modelProductionEvidence(input, modelProduction)];
        localModelEvidence = mergeLocalModelEvidence(localModelEvidence, productionStartYear == null
          ? null
          : {
              start: productionStartYear - 1,
              end: null,
              verifiedExact: modelProduction.matchType === 'exact',
            });
      }

      if (refinementMode === 'local_only') {
        finalResponse = bestAvailable(
          workingCandidateYears.length < input.candidateYears.length || localModelRange
            ? null
            : 'LOCAL_EVIDENCE_INSUFFICIENT',
          null,
          'none',
          [],
          { failureStage: 'local_only', failureCategory: 'local_evidence_miss' },
        );
        return finish(finalResponse);
      }

      const cacheKey = buildSerialRefinementCacheKey(input, {
        mode: refinementMode,
        effectiveCandidateYears: workingCandidateYears,
        canonicalModel: modelIdentity.canonicalModel,
      });
      try {
        redis = redisFactory();
      } catch (_) {
        redis = null;
      }
      if (redis) {
        const cacheStart = clock();
        try {
          const cached = await boundedRedisGet(redis, cacheKey, deadline, {
            stage: 'serial-refinement-final-cache-read',
            maxMs: modeBudgets.redisReadMaxMs,
            reserveMs: modeBudgets.providerStartReserveMs,
          });
          timings.cacheMs = Math.max(0, clock() - cacheStart);
          const cachedResponse = safeCachedResponse(cached.value, input.candidateYears);
          if (cached.status === 'hit' && cachedResponse) {
            cachedResponse.timings = {
              ...cachedResponse.timings,
              cacheMs: timings.cacheMs,
              totalMs: Math.max(0, clock() - requestStart),
            };
            return finish(cachedResponse);
          }
          if (cached.status === 'miss') {
            cacheStatus = 'miss';
          } else {
            cacheStatus = 'bypass';
          }
        } catch (_) {
          timings.cacheMs = Math.max(0, clock() - cacheStart);
          cacheStatus = 'bypass';
        }
      }

      let limiter = null;
      try {
        limiter = rateLimitFactory(redis);
      } catch (_) {}
      const rateLimitResult = await boundedRateLimit(limiter, getClientIp(req), deadline, {
        stage: 'serial-refinement-provider-rate-limit',
        maxMs: modeBudgets.rateLimitMaxMs,
        reserveMs: modeBudgets.providerStartReserveMs,
      });
      if (!rateLimitResult.success) {
        finalResponse = bestAvailable(
          'GROUNDING_RATE_LIMIT',
          workingCandidateYears.length < input.candidateYears.length
            ? `Local model-era evidence narrows the serial-valid years to ${workingCandidateYears.join(', ')}, but online refinement is temporarily rate limited.`
            : 'Online model evidence is temporarily rate limited. The original serial-valid candidate years are preserved.',
          'none',
          [],
          { failureStage: 'rate_limit', failureCategory: 'search_rate_limited' },
        );
        return finish(finalResponse);
      }

      if (!deadline.hasTime(modeBudgets.providerStartReserveMs, completionReserveMs)) {
        const timeoutError = new Error('REFINEMENT_TIMEOUT');
        timeoutError.name = 'AbortError';
        timeoutError.code = 'REFINEMENT_TIMEOUT';
        throw timeoutError;
      }

      if (sharedEvidenceShadowEnabled && refinementMode === 'legacy_gemini') {
        shadowTask = startShadowTask(async () => {
          const deterministic = await deterministicProviderLookup(
            { ...input, candidateYears: workingCandidateYears },
            {
              deadline,
              redis,
              localModelEvidence,
              timeoutMs: Math.min(providerBudgetMs, deadline.remainingMs(completionReserveMs)),
              requestId,
              logger,
              purpose: 'model_refinement_shadow',
              consumer: 'model_refinement_shadow',
              scoringPath: 'shadow-phase1-deterministic-evaluator',
              serperApiKey: dependencies.serperApiKey,
              serperFetchImpl: dependencies.serperFetchImpl || dependencies.fetchImpl,
              geminiApiKey: dependencies.geminiApiKey,
              geminiFetchImpl: dependencies.geminiFetchImpl || dependencies.fetchImpl,
            },
          );
          return {
            deterministic,
            sharedEvidence: deterministic?.sharedEvidence || null,
          };
        }, { now: clock });
      }

      const providerStart = clock();
      try {
        const providerWork = async () => {
          if (refinementMode === 'legacy_gemini') {
            providerAttemptCount += 1;
            geminiGroundedRan = true;
            const grounded = await deadline.run(
              'serial-refinement-legacy-gemini',
              ({ signal }) => legacyProviderLookup(
                { ...input, candidateYears: workingCandidateYears },
                { signal },
              ),
              { maxMs: providerBudgetMs, reserveMs: completionReserveMs },
            );
            const combinedEvidence = [...localEvidence, ...(grounded?.evidence || [])];
            const policy = evaluateEvidencePolicy(combinedEvidence);
            const decision = resolveCandidateIntersection({
              candidateYears: workingCandidateYears,
              evidenceRange: policy.range,
              evidenceAvailable: combinedEvidence.length > 0,
              evidenceSufficient: policy.sufficient,
            });
            const range = policy.range
              ? { start: policy.range.start, end: policy.range.end }
              : localModelRange;
            if (policy.sufficient) {
              return createRefinementResponse({
                ...decision,
                candidateYears: input.candidateYears,
                confidence: policy.confidence,
                resolutionBasis: 'serial-plus-model',
                modelProductionRange: range,
                modelNormalization: local?.normalization || null,
                modelIdentity,
                evidence: policy.evidence,
                summary: buildSummary(decision, local?.normalization, modelIdentity),
                refinementResultTier: decision.status,
                searchedModels: modelIdentity.searchModels,
                identityMatchType: modelIdentity.matchedBy,
                identityConfidence: modelIdentity.identityConfidence,
                cacheStatus,
                provider: 'gemini-google-search',
                timings,
                errorCode: null,
              });
            }
            // Prefer ranked/era degradation over bare unavailable when any
            // model window or partial local narrowing is available.
            let degraded = bestAvailable(
              'INSUFFICIENT_EVIDENCE',
              null,
              'gemini-google-search',
              policy.evidence || [],
              {
                failureStage: 'legacy_gemini_insufficient',
                failureCategory: 'extraction_no_usable_facts',
                estimateBasis: range ? 'model-era-from-grounded-or-local' : null,
              },
            );
            if (range && !degraded.modelProductionRange) {
              degraded = { ...degraded, modelProductionRange: range };
            }
            return degraded;
          }

          sharedEvidenceAttempted = true;
          providerAttemptCount += 1;
          const deterministic = await deadline.run(
            'serial-refinement-deterministic-serper',
            ({ signal }) => deterministicProviderLookup(
              { ...input, candidateYears: workingCandidateYears },
              {
                signal,
                deadline,
                redis,
                localModelEvidence,
                modelIdentity,
                timeoutMs: Math.min(providerBudgetMs, deadline.remainingMs(completionReserveMs)),
                requestId,
                logger,
                geminiTimeoutMs: modeBudgets.geminiExtractionMs,
                serperApiKey: dependencies.serperApiKey,
                serperFetchImpl: dependencies.serperFetchImpl || dependencies.fetchImpl,
                geminiApiKey: dependencies.geminiApiKey,
                geminiFetchImpl: dependencies.geminiFetchImpl || dependencies.fetchImpl,
              },
            ),
            { maxMs: providerBudgetMs, reserveMs: completionReserveMs },
          );
          const deterministicEvidence = deterministic?.evidence || [];
          timings.serperMs = Number(deterministic?.timings?.serperMs || 0);
          timings.geminiMs = Number(deterministic?.timings?.geminiMs || 0);
          searchQueryCount = Number(deterministic?.timings?.serperRequestCount || 0);
          serperCallCount = searchQueryCount;
          geminiExtractionRan = Boolean(
            deterministic?.gemini?.status === 'success'
            || deterministic?.sharedEvidence?.providerSummary?.extractorUsed,
          );
          searchResultCount = Number.isFinite(deterministic?.sharedEvidence?.providerSummary?.searchResultCount)
            ? deterministic.sharedEvidence.providerSummary.searchResultCount
            : null;
          evidenceFactCount = Array.isArray(deterministic?.extractedFacts)
            ? deterministic.extractedFacts.length
            : null;
          sharedEvidenceAccepted = ['success', 'partial'].includes(deterministic?.sharedEvidence?.status)
            || Boolean(deterministicEvidence.length);

          if (Number.isInteger(deterministic?.lifecycle?.supportedProductionStartYear)
            && !localModelRange) {
            localModelRange = {
              start: deterministic.lifecycle.supportedProductionStartYear,
              end: deterministic.lifecycle.supportedProductionEndYear ?? null,
            };
          }
          let mapped = createDeterministicRefinementResult({
            input,
            workingCandidateYears,
            deterministic,
            localEvidence,
            localModelRange,
            modelNormalization: local?.normalization || null,
            modelIdentity: deterministic?.modelIdentity || modelIdentity,
            cacheStatus,
            timings,
          });
          if (!mapped) {
            mapped = bestAvailable(
              deterministic?.errorCode || 'DETERMINISTIC_INSUFFICIENT_EVIDENCE',
              workingCandidateYears.length < input.candidateYears.length
                ? `Local model-era evidence narrows the serial-valid years to ${workingCandidateYears.join(', ')}, but deterministic web evidence does not establish one manufacture year.`
                : null,
              'deterministic-serper',
              deterministicEvidence,
              {
                failureStage: deterministic?.failureCategory || 'deterministic_insufficient',
                failureCategory: classifyLookupFailure({
                  errorCode: deterministic?.errorCode,
                  failureStage: deterministic?.failureCategory || 'deterministic_insufficient',
                  sharedFailureCategory: deterministic?.failureCategory,
                }).failureCategory,
                estimateBasis: localModelRange ? 'shared-or-local-model-era' : null,
              },
            );
          }
          return mapped;
        };

        const shared = await runSharedInflight(cacheKey, providerWork, { store: inflightStore });
        inflightShared = Boolean(shared.shared);
        finalResponse = shared.value;
      } finally {
        timings.onlineLookupMs = Math.max(0, clock() - providerStart);
      }

      const ttl = chooseRefinementCacheTtl(finalResponse || {});
      if (ttl > 0 && redis && finalResponse
        && ['resolved', 'ranked', 'ambiguous', 'ambiguous_with_era'].includes(finalResponse.status)) {
        try {
          const write = await boundedRedisSet(redis, cacheKey, finalResponse, ttl, deadline, {
            stage: 'serial-refinement-final-cache-write',
            maxMs: modeBudgets.redisWriteMaxMs,
          });
          timings.cacheMs += write.elapsedMs || 0;
        } catch (_) {
          // Cache write failures must not erase useful deterministic results.
        }
      }
    } catch (error) {
      const timedOut = isTimeoutError(error) || /abort|timeout/i.test(String(error?.message || ''));
      const errorCode = timedOut ? 'REFINEMENT_TIMEOUT' : (error?.code || 'REFINEMENT_UNAVAILABLE');
      finalResponse = bestAvailable(
        errorCode,
        workingCandidateYears.length < input.candidateYears.length || localModelRange
          ? (workingCandidateYears.length < input.candidateYears.length
            ? `Local model-era evidence narrows the serial-valid years to ${workingCandidateYears.join(', ')}, but online refinement could not be completed. Broader serial and model-era context is shown instead.`
            : 'Online refinement timed out. Serial-valid candidates and any available model-era context are preserved.')
          : null,
        refinementMode === 'deterministic_serper' ? 'deterministic-serper' : 'none',
        [],
        {
          failureStage: timedOut ? 'timeout' : 'provider_error',
          failureCategory: timedOut ? 'global_deadline' : 'provider_unavailable',
        },
      );
    }

    return finish(finalResponse);
  };
}

export default createRefineSerialDateHandler();
