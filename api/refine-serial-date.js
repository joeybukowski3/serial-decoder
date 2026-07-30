import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import { lookupModelProduction } from '../lib/model-era-lookup.js';
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
import {
  callGeminiGroundedSearch,
  callSmartLookupModelEvidence,
} from '../lib/serial-refinement/provider.js';
import {
  buildSummary,
  createBestAvailableResult,
  createDeterministicRefinementResult,
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
  const sharedModelEvidenceLookup = dependencies.sharedModelEvidenceLookup || callSmartLookupModelEvidence;
  const redisFactory = dependencies.redisFactory || createDefaultRedis;
  const rateLimitFactory = dependencies.rateLimitFactory || createDefaultRateLimiter;
  const logger = dependencies.logger || console;
  const clock = dependencies.now || nowMs;
  const totalBudgetMs = dependencies.totalBudgetMs || TOTAL_BUDGET_MS;
  const providerBudgetMs = dependencies.providerBudgetMs || PROVIDER_BUDGET_MS;
  const refinementMode = resolveModelRefinementMode(
    dependencies.refinementMode ?? process.env.MODEL_REFINEMENT_MODE,
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

    function finish(response) {
      timings.totalMs = Math.max(0, clock() - requestStart);
      response.timings = timings;
      const safeResponse = assertRefinementResponseInvariant(createRefinementResponse(response));
      logResult(logger, {
        requestId,
        mode: refinementMode,
        brand: input.brand.toLowerCase(),
        category: input.category.toLowerCase(),
        modelHash: hashModelIdentifier(input.model),
        candidateCount: input.candidateYears.length,
        remainingCandidateCount: safeResponse.remainingCandidateYears.length,
        status: safeResponse.status,
        cacheStatus: safeResponse.cacheStatus,
        provider: safeResponse.provider,
        ...timings,
        errorCode: safeResponse.errorCode,
      });
      return res.status(200).json(safeResponse);
    }

    function bestAvailable(errorCode, summary, attemptedProvider = 'none', extraEvidence = []) {
      return createBestAvailableResult({
        input,
        remainingCandidateYears: workingCandidateYears,
        confidence: localConfidence,
        modelProductionRange: localModelRange,
        modelNormalization: local?.normalization || null,
        evidence: [...localEvidence, ...extraEvidence],
        timings,
        cacheStatus,
        provider: attemptedProvider === 'none'
          ? (workingCandidateYears.length < input.candidateYears.length ? 'local-db' : 'none')
          : attemptedProvider,
        errorCode,
        summary,
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
          evidence: localPolicy.evidence,
          summary: buildSummary(localDecision, local?.normalization),
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
          evidence,
          summary: productionStartYear == null
            ? buildSummary(modelDecision, local?.normalization)
            : buildModelProductionSummary(modelDecision, modelProduction),
          cacheStatus: 'bypass',
          provider: 'local-db',
          timings,
          errorCode: null,
        }));
        return finish(finalResponse);
      }

      if (modelDecision?.status === 'ambiguous'
        && modelDecision.remainingCandidateYears.length < workingCandidateYears.length) {
        const productionStartYear = Number.isInteger(modelProduction.productionStartYear)
          ? modelProduction.productionStartYear
          : null;
        workingCandidateYears = modelDecision.remainingCandidateYears;
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
          workingCandidateYears.length < input.candidateYears.length ? null : 'LOCAL_EVIDENCE_INSUFFICIENT',
          null,
          'none',
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
        );
        return finish(finalResponse);
      }

      if (!deadline.hasTime(500)) {
        const timeoutError = new Error('REFINEMENT_TIMEOUT');
        timeoutError.name = 'AbortError';
        timeoutError.code = 'REFINEMENT_TIMEOUT';
        throw timeoutError;
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
          finalResponse = createRefinementResponse({
            ...decision,
            candidateYears: input.candidateYears,
            confidence: policy.confidence,
            resolutionBasis: 'serial-plus-model',
            modelProductionRange: policy.range
              ? { start: policy.range.start, end: policy.range.end }
              : localModelRange,
            modelNormalization: local?.normalization || null,
            evidence: policy.evidence,
            summary: buildSummary(decision, local?.normalization),
            cacheStatus,
            provider: 'gemini-google-search',
            timings,
            errorCode: policy.sufficient ? null : 'INSUFFICIENT_EVIDENCE',
          });
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
                timeoutMs: Math.min(providerBudgetMs, deadline.remainingMs(10)),
              },
            ),
            { maxMs: providerBudgetMs, reserveMs: 10 },
          );
          const deterministicEvidence = deterministic?.evidence || [];
          finalResponse = createDeterministicRefinementResult({
            input,
            workingCandidateYears,
            deterministic,
            localEvidence,
            localModelRange,
            modelNormalization: local?.normalization || null,
            cacheStatus,
            timings,
          });
          if (!finalResponse && deadline.hasTime(500)) {
            let sharedEvidence = null;
            try {
              sharedEvidence = await deadline.run(
                'serial-refinement-shared-model-evidence',
                ({ signal }) => sharedModelEvidenceLookup(
                  { ...input, candidateYears: workingCandidateYears },
                  {
                    signal,
                    deadline,
                    smartLookupBudgetMs: Math.max(250, deadline.remainingMs(10)),
                    fetchImpl: dependencies.fetchImpl,
                    env: dependencies.env || process.env,
                    openAiProviderLookup: dependencies.openAiProviderLookup,
                    smartProviderLookup: dependencies.smartProviderLookup,
                    smartLocalLookup: dependencies.smartLocalLookup,
                  },
                ),
                { maxMs: deadline.remainingMs(10), reserveMs: 10 },
              );
            } catch (_) {
              sharedEvidence = null;
            }
            const combinedEvidence = [
              ...localEvidence,
              ...deterministicEvidence,
              ...(sharedEvidence?.evidence || []),
            ];
            const sharedPolicy = evaluateEvidencePolicy(combinedEvidence);
            const sharedDecision = resolveCandidateIntersection({
              candidateYears: workingCandidateYears,
              evidenceRange: sharedPolicy.range,
              evidenceAvailable: combinedEvidence.length > 0,
              evidenceSufficient: sharedPolicy.sufficient,
            });
            if (sharedPolicy.sufficient && sharedDecision.status !== 'unavailable') {
              finalResponse = createRefinementResponse({
                ...sharedDecision,
                candidateYears: input.candidateYears,
                confidence: sharedPolicy.confidence,
                resolutionBasis: 'serial-plus-model',
                modelProductionRange: sharedPolicy.range
                  ? { start: sharedPolicy.range.start, end: sharedPolicy.range.end }
                  : localModelRange,
                modelNormalization: local?.normalization || null,
                evidence: sharedPolicy.evidence,
                summary: buildSummary(sharedDecision, local?.normalization),
                cacheStatus,
                provider: sharedEvidence?.provider || 'none',
                timings,
                errorCode: null,
              });
            }
          }
          if (!finalResponse) {
            finalResponse = bestAvailable(
              deterministic?.errorCode || 'DETERMINISTIC_INSUFFICIENT_EVIDENCE',
              workingCandidateYears.length < input.candidateYears.length
                ? `Local model-era evidence narrows the serial-valid years to ${workingCandidateYears.join(', ')}, but deterministic web evidence does not establish one manufacture year.`
                : 'Deterministic web evidence was unavailable or insufficient. The original serial-valid candidate years are preserved.',
              'deterministic-serper',
              deterministicEvidence,
            );
          }
        }
      } finally {
        timings.onlineLookupMs = Math.max(0, clock() - providerStart);
      }

      const ttl = finalResponse?.errorCode ? 0 : chooseCacheTtl(finalResponse);
      if (ttl > 0 && redis && ['resolved', 'ambiguous'].includes(finalResponse.status)) {
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
          : 'Model evidence could not be checked. The original serial-valid candidate years are preserved.',
        refinementMode === 'deterministic_serper' ? 'deterministic-serper' : 'none',
      );
    }

    return finish(finalResponse);
  };
}

export default createRefineSerialDateHandler();
