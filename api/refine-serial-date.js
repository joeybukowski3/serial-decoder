import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import { buildSerialRefinementCacheKey, hashModelIdentifier } from '../lib/serial-refinement/cache-key.js';
import { resolveCandidateIntersection, normalizeCandidateYears } from '../lib/serial-refinement/candidate-intersection.js';
import { evaluateEvidencePolicy } from '../lib/serial-refinement/evidence-policy.js';
import { findLocalRefinementEvidence } from '../lib/serial-refinement/local-evidence.js';
import { callOpenAiRefinement } from '../lib/serial-refinement/openai-refine-provider.js';
import { assertRefinementResponseInvariant, createRefinementResponse } from '../lib/serial-refinement/response-schema.js';
import { createDeadline, isTimeoutError } from '../lib/smart-lookup/deadline.js';

// Must exceed openai-refine-provider.js's default OpenAI stage budget
// (20000ms) with margin, or this outer deadline clips the grounded call
// before it can finish.
const TOTAL_BUDGET_MS = 24000;
const PROVIDER_BUDGET_MS = 23000;
const OFFICIAL_TTL_SECONDS = 60 * 60 * 24 * 60;
const SECONDARY_TTL_SECONDS = 60 * 60 * 24 * 10;
const MAX_CANDIDATES = 12;
const GROUNDED_RATE_LIMIT_REQUESTS = 10;
const GROUNDED_RATE_LIMIT_WINDOW = '1 m';

function nowMs() {
  return Date.now();
}

function elapsed(start) {
  return Math.max(0, nowMs() - start);
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

function buildSummary(result, basis, normalization) {
  const alternativeNote = normalization?.usedValidatedAlternative && normalization?.validatedAlternative
    ? ` The entered model was matched to validated alternative ${normalization.validatedAlternative.value} (${normalization.validatedAlternative.change}).`
    : '';
  if (result.status === 'resolved') {
    return `Serial decoding produced ${result.candidateYears.join(', ')}. Model evidence eliminates the other serial-valid cycles and leaves ${result.chosenYear}.${alternativeNote}`;
  }
  if (result.status === 'ambiguous') {
    return `Model evidence narrows the serial-valid years to ${result.remainingCandidateYears.join(', ')}, but does not establish one manufacture year.${alternativeNote}`;
  }
  if (result.status === 'conflict') {
    return `The model evidence does not overlap the serial-valid candidate years. The original serial result is preserved for review.${alternativeNote}`;
  }
  return `Model evidence was unavailable or insufficient. The original serial-valid candidate years are preserved.${alternativeNote}`;
}

function chooseCacheTtl(policy) {
  if (policy.confidence === 'high') return OFFICIAL_TTL_SECONDS;
  if (policy.confidence === 'medium') return SECONDARY_TTL_SECONDS;
  return 0;
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

function createUnavailableResult({ input, timings, cacheStatus, errorCode, summary }) {
  return assertRefinementResponseInvariant(createRefinementResponse({
    status: 'unavailable',
    candidateYears: input.candidateYears,
    remainingCandidateYears: input.candidateYears,
    chosenYear: null,
    confidence: null,
    resolutionBasis: 'serial-plus-model',
    modelProductionRange: null,
    evidence: [],
    summary,
    cacheStatus,
    provider: 'none',
    timings,
    errorCode,
  }));
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
  const providerLookup = dependencies.providerLookup || callOpenAiRefinement;
  const redisFactory = dependencies.redisFactory || createDefaultRedis;
  const rateLimitFactory = dependencies.rateLimitFactory || createDefaultRateLimiter;
  const logger = dependencies.logger || console;
  const clock = dependencies.now || nowMs;
  const totalBudgetMs = dependencies.totalBudgetMs || TOTAL_BUDGET_MS;
  const providerBudgetMs = dependencies.providerBudgetMs || PROVIDER_BUDGET_MS;

  return async function handler(req, res) {
    const requestStart = clock();
    const requestId = String(req.headers?.['x-request-id'] || req.headers?.['x-vercel-id'] || `ref-${requestStart}-${Math.random().toString(36).slice(2, 8)}`);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const validation = validateRequestBody(req.body || {});
    if (validation.error) {
      return res.status(400).json({ error: 'Invalid refinement request', errorCode: validation.error });
    }

    const input = validation.value;
    const timings = { localMs: 0, cacheMs: 0, onlineLookupMs: 0, totalMs: 0 };
    let cacheStatus = 'bypass';
    let provider = 'none';
    let errorCode = null;
    let finalResponse = null;

    try {
      const localStart = clock();
      const local = await localLookup(input);
      timings.localMs = Math.max(0, clock() - localStart);
      const localPolicy = evaluateEvidencePolicy(local?.evidence || []);
      const localDecision = resolveCandidateIntersection({
        candidateYears: input.candidateYears,
        evidenceRange: localPolicy.range,
        evidenceAvailable: Boolean((local?.evidence || []).length),
        evidenceSufficient: localPolicy.sufficient,
      });

      if (localPolicy.sufficient && ['resolved', 'conflict'].includes(localDecision.status)) {
        provider = 'local-db';
        timings.totalMs = Math.max(0, clock() - requestStart);
        finalResponse = assertRefinementResponseInvariant(createRefinementResponse({
          ...localDecision,
          confidence: localPolicy.confidence,
          resolutionBasis: 'serial-plus-model',
          modelProductionRange: localPolicy.range ? { start: localPolicy.range.start, end: localPolicy.range.end } : null,
          modelNormalization: local?.normalization || null,
          evidence: localPolicy.evidence,
          summary: buildSummary(localDecision, 'serial-plus-model', local?.normalization),
          cacheStatus: 'bypass',
          provider,
          timings,
          errorCode: null,
        }));
        logResult(logger, {
          requestId,
          brand: input.brand.toLowerCase(),
          category: input.category.toLowerCase(),
          modelHash: hashModelIdentifier(input.model),
          candidateCount: input.candidateYears.length,
          remainingCandidateCount: finalResponse.remainingCandidateYears.length,
          status: finalResponse.status,
          cacheStatus: finalResponse.cacheStatus,
          provider: finalResponse.provider,
          ...timings,
          errorCode: null,
        });
        return res.status(200).json(finalResponse);
      }

      const cacheKey = buildSerialRefinementCacheKey(input);
      let redis = null;
      try {
        redis = redisFactory();
      } catch (_) {
        redis = null;
      }
      if (redis) {
        const cacheStart = clock();
        try {
          const cached = await redis.get(cacheKey);
          timings.cacheMs = Math.max(0, clock() - cacheStart);
          const cachedResponse = safeCachedResponse(cached, input.candidateYears);
          if (cachedResponse) {
            cachedResponse.timings = { ...cachedResponse.timings, cacheMs: timings.cacheMs, totalMs: Math.max(0, clock() - requestStart) };
            logResult(logger, {
              requestId,
              brand: input.brand.toLowerCase(),
              category: input.category.toLowerCase(),
              modelHash: hashModelIdentifier(input.model),
              candidateCount: input.candidateYears.length,
              remainingCandidateCount: cachedResponse.remainingCandidateYears.length,
              status: cachedResponse.status,
              cacheStatus: 'hit',
              provider: 'redis',
              ...cachedResponse.timings,
              errorCode: null,
            });
            return res.status(200).json(cachedResponse);
          }
          cacheStatus = 'miss';
        } catch (_) {
          timings.cacheMs = Math.max(0, clock() - cacheStart);
          cacheStatus = 'bypass';
        }
      }

      try {
        const limiter = rateLimitFactory(redis);
        if (limiter) {
          const rateLimitResult = await limiter.limit(getClientIp(req));
          if (!rateLimitResult?.success) {
            timings.totalMs = Math.max(0, clock() - requestStart);
            finalResponse = createUnavailableResult({
              input,
              timings,
              cacheStatus,
              errorCode: 'GROUNDING_RATE_LIMIT',
              summary: 'Grounded model evidence is temporarily rate limited. The original serial-valid candidate years are preserved.',
            });
            logResult(logger, {
              requestId,
              brand: input.brand.toLowerCase(),
              category: input.category.toLowerCase(),
              modelHash: hashModelIdentifier(input.model),
              candidateCount: input.candidateYears.length,
              remainingCandidateCount: finalResponse.remainingCandidateYears.length,
              status: finalResponse.status,
              cacheStatus: finalResponse.cacheStatus,
              provider: finalResponse.provider,
              ...timings,
              errorCode: finalResponse.errorCode,
            });
            return res.status(200).json(finalResponse);
          }
        }
      } catch (_) {
        // Rate limiting fails open so Redis outages do not block refinement.
      }

      const remainingBudget = totalBudgetMs - Math.max(0, clock() - requestStart);
      if (remainingBudget < 500) {
        errorCode = 'REFINEMENT_TIMEOUT';
        throw Object.assign(new Error(errorCode), { code: errorCode });
      }

      // deadline.run() inside the provider (see openai-refine-provider.js)
      // handles its own fetch abort/budget, matching Smart Lookup's pattern.
      // This outer race is a separate, hard backstop: it guarantees the
      // request returns on schedule even if a providerLookup implementation
      // never touches the deadline at all (e.g. hangs completely).
      const providerDeadline = createDeadline({ totalMs: remainingBudget, now: clock });
      const providerTimeoutMs = Math.max(25, Math.min(providerBudgetMs, remainingBudget - 10));
      let providerTimeout;
      const backstopPromise = new Promise((_, reject) => {
        providerTimeout = setTimeout(() => {
          const timeoutError = new Error('REFINEMENT_TIMEOUT');
          timeoutError.name = 'AbortError';
          timeoutError.code = 'REFINEMENT_TIMEOUT';
          reject(timeoutError);
        }, providerTimeoutMs);
      });
      let grounded;
      const providerStart = clock();
      try {
        grounded = await Promise.race([
          providerLookup(input, {
            deadline: providerDeadline,
            openAiMaxMs: providerBudgetMs,
            fetchImpl: dependencies.fetchImpl,
            env: dependencies.env,
          }),
          backstopPromise,
        ]);
      } catch (error) {
        if (isTimeoutError(error)) {
          const timeoutError = new Error('REFINEMENT_TIMEOUT');
          timeoutError.name = 'AbortError';
          timeoutError.code = 'REFINEMENT_TIMEOUT';
          throw timeoutError;
        }
        throw error;
      } finally {
        clearTimeout(providerTimeout);
        timings.onlineLookupMs = Math.max(0, clock() - providerStart);
      }

      const combinedEvidence = [...(local?.evidence || []), ...(grounded?.evidence || [])];
      const policy = evaluateEvidencePolicy(combinedEvidence);
      const decision = resolveCandidateIntersection({
        candidateYears: input.candidateYears,
        evidenceRange: policy.range,
        evidenceAvailable: combinedEvidence.length > 0,
        evidenceSufficient: policy.sufficient,
      });
      provider = 'openai-web-search';
      finalResponse = createRefinementResponse({
        ...decision,
        confidence: policy.confidence,
        resolutionBasis: 'serial-plus-model',
        modelProductionRange: policy.range ? { start: policy.range.start, end: policy.range.end } : null,
        modelNormalization: local?.normalization || null,
        evidence: policy.evidence,
        summary: buildSummary(decision, 'serial-plus-model', local?.normalization),
        cacheStatus,
        provider,
        timings,
        errorCode: policy.sufficient ? null : 'INSUFFICIENT_EVIDENCE',
      });

      const ttl = chooseCacheTtl(policy);
      if (ttl > 0 && redis) {
        try {
          await redis.set(cacheKey, finalResponse, { ex: ttl });
        } catch (_) {}
      }
    } catch (error) {
      const timedOut = error?.name === 'AbortError' || /abort|timeout/i.test(String(error?.message || ''));
      errorCode = timedOut ? 'REFINEMENT_TIMEOUT' : (error?.code || 'REFINEMENT_UNAVAILABLE');
      finalResponse = createUnavailableResult({
        input,
        timings,
        cacheStatus,
        errorCode,
        summary: 'Model evidence could not be checked. The original serial-valid candidate years are preserved.',
      });
    }

    timings.totalMs = Math.max(0, clock() - requestStart);
    finalResponse.timings = timings;
    finalResponse = assertRefinementResponseInvariant(createRefinementResponse(finalResponse));
    logResult(logger, {
      requestId,
      brand: input.brand.toLowerCase(),
      category: input.category.toLowerCase(),
      modelHash: hashModelIdentifier(input.model),
      candidateCount: input.candidateYears.length,
      remainingCandidateCount: finalResponse.remainingCandidateYears.length,
      status: finalResponse.status,
      cacheStatus: finalResponse.cacheStatus,
      provider: finalResponse.provider,
      ...timings,
      errorCode: finalResponse.errorCode,
    });
    return res.status(200).json(finalResponse);
  };
}

export default createRefineSerialDateHandler();
