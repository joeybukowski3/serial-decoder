import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import { lookupModelProduction } from '../lib/model-era-lookup.js';
import {
  isShadowModeEnabled,
  observeRefinementShadow,
  startShadowTask,
} from '../lib/model-evidence/shadow.js';
import { buildSharedModelIdentity } from '../lib/model-evidence/shared-model-identity.js';
import { buildSerialRefinementCacheKey, hashModelIdentifier } from '../lib/serial-refinement/cache-key.js';
import { resolveCandidateIntersection, normalizeCandidateYears } from '../lib/serial-refinement/candidate-intersection.js';
import { evaluateEvidencePolicy } from '../lib/serial-refinement/evidence-policy.js';
import { findLocalRefinementEvidence } from '../lib/serial-refinement/local-evidence.js';
import { callDeterministicSerper } from '../lib/serial-refinement/deterministic-provider.js';
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
import { createDeadline, isTimeoutError } from '../lib/smart-lookup/deadline.js';
import { boundedRateLimit, boundedRedisGet, boundedRedisSet } from '../lib/smart-lookup/redis.js';

// Must exceed provider.js's grounded stage plus its shared Smart Lookup
// fallback budget with margin, or this outer deadline
// clips the grounded call before it can finish.
const TOTAL_BUDGET_MS = 24000;
const PROVIDER_BUDGET_MS = 23000;
const OFFICIAL_TTL_SECONDS = 60 * 60 * 24 * 60;
const SECONDARY_TTL_SECONDS = 60 * 60 * 24 * 10;
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

function chooseCacheTtl(policy) {
  if (policy.confidence === 'high') return OFFICIAL_TTL_SECONDS;
  if (policy.confidence === 'medium') return SECONDARY_TTL_SECONDS;
  return 0;
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

function logResult(logger, fields) {
  try {
    logger.info(JSON.stringify({ event: 'serial_refinement', ...fields }));
  } catch (_) {}
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
  const totalBudgetMs = dependencies.totalBudgetMs || TOTAL_BUDGET_MS;
  const providerBudgetMs = dependencies.providerBudgetMs || PROVIDER_BUDGET_MS;
  const refinementMode = resolveModelRefinementMode(
    dependencies.refinementMode ?? process.env.MODEL_REFINEMENT_MODE,
  );
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
      return res.status(400).json({ error: 'Invalid refinement request', errorCode: validation.error });
    }

    const input = validation.value;
    const modelIdentity = buildSharedModelIdentity({
      brand: input.brand,
      model: input.model,
      category: input.category,
    });
    const deadline = createDeadline({ totalMs: totalBudgetMs, now: clock });
    const timings = { localMs: 0, cacheMs: 0, onlineLookupMs: 0, totalMs: 0 };
    let cacheStatus = 'bypass';
    let finalResponse = null;
    let redis = null;
    let local = null;
    let localConfidence = null;
    let localModelRange = null;
    let localModelEvidence = null;
    let localEvidence = [];
    let workingCandidateYears = [...input.candidateYears];
    let shadowTask = null;
    let shadowObserved = false;

    function finish(response) {
      timings.totalMs = Math.max(0, clock() - requestStart);
      response.timings = timings;
      if (!response.modelIdentity) response.modelIdentity = modelIdentity;
      if (!response.searchedModels) response.searchedModels = modelIdentity.searchModels;
      const safeResponse = assertRefinementResponseInvariant(createRefinementResponse(response));
      // Per-request telemetry only (not cumulative counters).
      logResult(logger, {
        requestId,
        mode: refinementMode,
        brand: input.brand.toLowerCase(),
        category: input.category.toLowerCase(),
        modelHash: hashModelIdentifier(input.model),
        enteredModel: modelIdentity.enteredModel,
        canonicalModel: modelIdentity.canonicalModel,
        searchedModels: safeResponse.searchedModels || modelIdentity.searchModels,
        normalizationApplied: Boolean(modelIdentity.normalizationApplied),
        equivalenceReason: modelIdentity.equivalenceReason,
        identityMatchType: safeResponse.identityMatchType || modelIdentity.matchedBy,
        identityConfidence: safeResponse.identityConfidence || modelIdentity.identityConfidence,
        evidenceMatchModel: safeResponse.evidenceMatchModel || null,
        evidenceMatchType: safeResponse.evidenceMatchType || null,
        refinementResultTier: safeResponse.refinementResultTier || safeResponse.status,
        preferredCandidateYear: safeResponse.preferredCandidateYear,
        remainingCandidateYears: safeResponse.remainingCandidateYears,
        modelEraStart: safeResponse.modelProductionRange?.start ?? null,
        modelEraEnd: safeResponse.modelProductionRange?.end ?? null,
        candidateCount: input.candidateYears.length,
        remainingCandidateCount: safeResponse.remainingCandidateYears.length,
        status: safeResponse.status,
        cacheStatus: safeResponse.cacheStatus,
        provider: safeResponse.provider,
        providerAttempted: safeResponse.provider !== 'none' && safeResponse.provider !== 'local-db',
        providerDurationMs: timings.onlineLookupMs,
        deterministicFallbackUsed: Boolean(safeResponse.deterministicFallbackUsed),
        failureStage: safeResponse.failureStage || null,
        failureCode: safeResponse.errorCode,
        ...timings,
        errorCode: safeResponse.errorCode,
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

      return createBestAvailableResult({
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
    }

    try {
      const localStart = clock();
      local = await localLookup(input);
      timings.localMs = Math.max(0, clock() - localStart);
      const localPolicy = evaluateEvidencePolicy(local?.evidence || []);
      localEvidence = localPolicy.evidence || [];
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
          { failureStage: 'local_only' },
        );
        return finish(finalResponse);
      }

      const cacheKey = buildSerialRefinementCacheKey(input, {
        mode: refinementMode,
        effectiveCandidateYears: workingCandidateYears,
      });
      try {
        redis = redisFactory();
      } catch (_) {
        redis = null;
      }
      if (redis) {
        const cacheStart = clock();
        const cached = await boundedRedisGet(redis, cacheKey, deadline, {
          stage: 'serial-refinement-final-cache-read',
          maxMs: 250,
          reserveMs: 500,
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
      }

      let limiter = null;
      try {
        limiter = rateLimitFactory(redis);
      } catch (_) {}
      const rateLimitResult = await boundedRateLimit(limiter, getClientIp(req), deadline, {
        stage: 'serial-refinement-provider-rate-limit',
        maxMs: 250,
        reserveMs: 500,
      });
      if (!rateLimitResult.success) {
        finalResponse = bestAvailable(
          'GROUNDING_RATE_LIMIT',
          workingCandidateYears.length < input.candidateYears.length
            ? `Local model-era evidence narrows the serial-valid years to ${workingCandidateYears.join(', ')}, but online refinement is temporarily rate limited.`
            : 'Online model evidence is temporarily rate limited. The original serial-valid candidate years are preserved.',
          'none',
          [],
          { failureStage: 'rate_limit' },
        );
        return finish(finalResponse);
      }

      if (!deadline.hasTime(500)) {
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
              timeoutMs: Math.min(providerBudgetMs, deadline.remainingMs(10)),
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
        if (refinementMode === 'legacy_gemini') {
          const grounded = await deadline.run(
            'serial-refinement-legacy-gemini',
            ({ signal }) => legacyProviderLookup(
              { ...input, candidateYears: workingCandidateYears },
              { signal },
            ),
            { maxMs: providerBudgetMs, reserveMs: 10 },
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
            finalResponse = createRefinementResponse({
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
              cacheStatus,
              provider: 'gemini-google-search',
              timings,
              errorCode: null,
            });
          } else {
            // Prefer ranked/era degradation over bare unavailable when any
            // model window or partial local narrowing is available.
            finalResponse = bestAvailable(
              'INSUFFICIENT_EVIDENCE',
              null,
              'gemini-google-search',
              policy.evidence || [],
              {
                failureStage: 'legacy_gemini_insufficient',
                estimateBasis: range ? 'model-era-from-grounded-or-local' : null,
              },
            );
            if (range && !finalResponse.modelProductionRange) {
              finalResponse.modelProductionRange = range;
            }
          }
        } else {
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
                timeoutMs: Math.min(providerBudgetMs, deadline.remainingMs(10)),
                requestId,
                logger,
                serperApiKey: dependencies.serperApiKey,
                serperFetchImpl: dependencies.serperFetchImpl || dependencies.fetchImpl,
                geminiApiKey: dependencies.geminiApiKey,
                geminiFetchImpl: dependencies.geminiFetchImpl || dependencies.fetchImpl,
              },
            ),
            { maxMs: providerBudgetMs, reserveMs: 10 },
          );
          const deterministicEvidence = deterministic?.evidence || [];
          // Prefer lifecycle lower bound from shared evidence when evaluator
          // output alone is thin.
          if (Number.isInteger(deterministic?.lifecycle?.supportedProductionStartYear)
            && !localModelRange) {
            localModelRange = {
              start: deterministic.lifecycle.supportedProductionStartYear,
              end: deterministic.lifecycle.supportedProductionEndYear ?? null,
            };
          }
          finalResponse = createDeterministicRefinementResult({
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
          if (!finalResponse) {
            finalResponse = bestAvailable(
              deterministic?.errorCode || 'DETERMINISTIC_INSUFFICIENT_EVIDENCE',
              workingCandidateYears.length < input.candidateYears.length
                ? `Local model-era evidence narrows the serial-valid years to ${workingCandidateYears.join(', ')}, but deterministic web evidence does not establish one manufacture year.`
                : null,
              'deterministic-serper',
              deterministicEvidence,
              {
                failureStage: deterministic?.failureCategory || 'deterministic_insufficient',
                estimateBasis: localModelRange ? 'shared-or-local-model-era' : null,
              },
            );
          }
        }
      } finally {
        timings.onlineLookupMs = Math.max(0, clock() - providerStart);
      }

      const ttl = finalResponse?.errorCode ? 0 : chooseCacheTtl(finalResponse);
      if (ttl > 0 && redis && ['resolved', 'ranked', 'ambiguous', 'ambiguous_with_era'].includes(finalResponse.status)) {
        const write = await boundedRedisSet(redis, cacheKey, finalResponse, ttl, deadline, {
          stage: 'serial-refinement-final-cache-write',
          maxMs: 200,
        });
        timings.cacheMs += write.elapsedMs || 0;
      }
    } catch (error) {
      const timedOut = isTimeoutError(error) || /abort|timeout/i.test(String(error?.message || ''));
      const errorCode = timedOut ? 'REFINEMENT_TIMEOUT' : (error?.code || 'REFINEMENT_UNAVAILABLE');
      finalResponse = bestAvailable(
        errorCode,
        workingCandidateYears.length < input.candidateYears.length
          ? `Local model-era evidence narrows the serial-valid years to ${workingCandidateYears.join(', ')}, but online refinement could not be completed.`
          : null,
        refinementMode === 'deterministic_serper' ? 'deterministic-serper' : 'none',
        [],
        { failureStage: timedOut ? 'timeout' : 'provider_error' },
      );
    }

    return finish(finalResponse);
  };
}

export default createRefineSerialDateHandler();
