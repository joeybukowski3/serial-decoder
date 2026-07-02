import { buildSmartGeneralCacheKey } from '../lib/smart-lookup/cache.js';
import { createDeadline, isTimeoutError } from '../lib/smart-lookup/deadline.js';
import { classifySmartLookupQuery, normalizeWhitespace } from '../lib/smart-lookup/normalize.js';
import { callGeminiGeneralProvider, SmartLookupProviderError } from '../lib/smart-lookup/provider.js';
import {
  boundedRateLimit,
  boundedRedisGet,
  boundedRedisSet,
  createProviderRateLimiter,
  createRedisClient,
  getClientIp,
} from '../lib/smart-lookup/redis.js';
import { buildDeterministicBroadResult } from '../lib/smart-lookup/static-results.js';
import { createRequestId, logSmartLookup } from '../lib/smart-lookup/telemetry.js';

const TOTAL_BUDGET_MS = 5000;
const PROVIDER_BUDGET_MS = 3500;
const REDIS_CALL_BUDGET_MS = 250;
const CACHE_WRITE_BUDGET_MS = 150;

function validateRequest(body) {
  const query = normalizeWhitespace(body?.query);
  if (!query) return { error: 'MISSING_QUERY' };
  if (query.length > 200) return { error: 'QUERY_TOO_LONG' };
  return { value: { query } };
}

function clean(value, maxLength = 800) {
  return normalizeWhitespace(value).slice(0, maxLength);
}

function normalizeGeneralPayload(raw, queryInfo) {
  const refineOptions = Array.isArray(raw?.refineOptions)
    ? raw.refineOptions
        .map((item) => ({
          label: clean(item?.label, 180),
          query: clean(item?.query, 180),
          year: clean(item?.year, 20),
        }))
        .filter((item) => item.label && item.query)
        .slice(0, 5)
    : [];
  const fallbackCategory = queryInfo.genericCategory || 'General Property Item';
  return {
    itemCategory: clean(raw?.itemCategory || fallbackCategory, 100),
    brand: clean(raw?.brand || queryInfo.brand, 80),
    overview: clean(raw?.overview, 1000) || 'This broad item search needs a complete model number for model-level timing or replacement research.',
    refineOptions,
    averageModelLabel: clean(raw?.averageModelLabel, 180),
    averageModelQuery: clean(raw?.averageModelQuery, 180),
    averageModelCategory: clean(raw?.averageModelCategory || raw?.itemCategory || fallbackCategory, 100),
  };
}

function deterministicGeneral(queryInfo) {
  const broad = buildDeterministicBroadResult(queryInfo);
  if (!broad) return null;
  return normalizeGeneralPayload({
    itemCategory: broad.category || broad.itemCategory,
    brand: broad.brand === 'Unknown' ? '' : broad.brand,
    overview: broad.inventionSummary || broad.notes,
    averageModelCategory: broad.category || broad.itemCategory,
  }, queryInfo);
}

function withMetadata(payload, metadata = {}) {
  return {
    ...payload,
    cacheStatus: metadata.cacheStatus || 'bypass',
    source: metadata.source || 'static',
    originSource: metadata.originSource || metadata.source || 'static',
    evidenceSource: metadata.evidenceSource || 'none',
    providerAttempted: Boolean(metadata.providerAttempted),
    fallbackUsed: Boolean(metadata.fallbackUsed),
    timings: {
      cacheReadMs: 0,
      rateLimitMs: 0,
      providerMs: 0,
      cacheWriteMs: 0,
      totalMs: 0,
      ...(metadata.timings || {}),
    },
    errorCode: metadata.errorCode || null,
  };
}

function logResult(logger, requestId, queryInfo, result, extra = {}) {
  logSmartLookup(logger, {
    event: 'smart_query_general',
    requestId,
    canonicalQuery: queryInfo.canonicalQuery,
    specificityLevel: queryInfo.specificityLevel,
    source: result.source,
    evidenceSource: result.evidenceSource,
    cacheStatus: result.cacheStatus,
    providerAttempted: result.providerAttempted,
    fallbackUsed: result.fallbackUsed,
    timeoutStage: extra.timeoutStage || null,
    errorCode: result.errorCode,
    timings: result.timings,
  });
}

export function createSmartQueryGeneralHandler(dependencies = {}) {
  const redisFactory = dependencies.redisFactory || createRedisClient;
  const providerLookup = dependencies.providerLookup || callGeminiGeneralProvider;
  const limiterFactory = dependencies.rateLimiterFactory || ((redis) => createProviderRateLimiter(redis, {
    requests: 20,
    window: '1 m',
    prefix: 'smart-general-provider-v2',
  }));
  const now = dependencies.now || Date.now;
  const logger = dependencies.logger || console;
  const inflightGeneralRequests = new Map();

  return async function handler(req, res) {
    const requestId = createRequestId(req, 'general');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const validation = validateRequest(req.body || {});
    if (validation.error) {
      return res.status(400).json({
        error: validation.error === 'MISSING_QUERY' ? 'Missing query' : 'Query too long',
        errorCode: validation.error,
      });
    }

    const deadline = createDeadline({ totalMs: dependencies.totalBudgetMs || TOTAL_BUDGET_MS, now });
    const timings = { cacheReadMs: 0, rateLimitMs: 0, providerMs: 0, cacheWriteMs: 0, totalMs: 0 };
    const queryInfo = classifySmartLookupQuery(validation.value.query);
    let cacheStatus = 'bypass';

    try {
      const deterministic = deterministicGeneral(queryInfo);
      if (deterministic) {
        const result = withMetadata(deterministic, { source: 'static', evidenceSource: 'heuristic', timings });
        result.timings.totalMs = deadline.elapsedMs();
        logResult(logger, requestId, queryInfo, result);
        return res.status(200).json(result);
      }

      const redis = dependencies.redis || redisFactory();
      const cacheKey = buildSmartGeneralCacheKey(queryInfo);
      const cacheRead = await boundedRedisGet(redis, cacheKey, deadline, {
        stage: 'general-cache-read',
        maxMs: REDIS_CALL_BUDGET_MS,
        reserveMs: 300,
      });
      timings.cacheReadMs = cacheRead.elapsedMs || 0;
      cacheStatus = cacheRead.status === 'hit' ? 'hit' : (cacheRead.status === 'miss' ? 'miss' : 'error');
      if (cacheRead.status === 'hit' && cacheRead.value) {
        const result = withMetadata(normalizeGeneralPayload(cacheRead.value, queryInfo), {
          source: 'cache',
          originSource: cacheRead.value.originSource || cacheRead.value.source || 'gemini',
          evidenceSource: cacheRead.value.evidenceSource || 'gemini-ungrounded',
          cacheStatus: 'hit',
          timings,
        });
        result.timings.totalMs = deadline.elapsedMs();
        logResult(logger, requestId, queryInfo, result);
        return res.status(200).json(result);
      }

      let providerPromise = inflightGeneralRequests.get(cacheKey);
      if (!providerPromise) {
        providerPromise = (async () => {
          const limiter = dependencies.rateLimiter || limiterFactory(redis);
          const rate = await boundedRateLimit(limiter, getClientIp(req), deadline, {
            stage: 'general-provider-rate-limit',
            maxMs: REDIS_CALL_BUDGET_MS,
            reserveMs: 250,
          });
          timings.rateLimitMs = rate.elapsedMs || 0;
          if (!rate.success) {
            const error = new Error('RATE_LIMIT');
            error.code = 'RATE_LIMIT';
            throw error;
          }
          return deadline.run('general-provider-call', () => providerLookup(queryInfo, {
            deadline,
            maxMs: Math.min(dependencies.providerBudgetMs || PROVIDER_BUDGET_MS, deadline.remainingMs(250)),
            reserveMs: 250,
            fetchImpl: dependencies.fetchImpl,
            apiKey: dependencies.apiKey,
          }), {
            maxMs: Math.min(dependencies.providerBudgetMs || PROVIDER_BUDGET_MS, deadline.remainingMs(250)),
            reserveMs: 250,
          });
        })();
        inflightGeneralRequests.set(cacheKey, providerPromise);
        providerPromise.finally(() => {
          if (inflightGeneralRequests.get(cacheKey) === providerPromise) inflightGeneralRequests.delete(cacheKey);
        }).catch(() => {});
      }

      const providerStart = now();
      let raw;
      try {
        raw = await deadline.run('general-provider-result-wait', () => providerPromise, {
          maxMs: Math.min(dependencies.providerBudgetMs || PROVIDER_BUDGET_MS, deadline.remainingMs(250)),
          reserveMs: 250,
        });
      } catch (error) {
        timings.providerMs = Math.max(0, now() - providerStart);
        const errorCode = isTimeoutError(error)
          ? 'PROVIDER_TIMEOUT'
          : (error instanceof SmartLookupProviderError ? error.code : 'PROVIDER_UNAVAILABLE');
        const result = withMetadata(normalizeGeneralPayload({}, queryInfo), {
          source: 'fallback',
          cacheStatus,
          providerAttempted: true,
          fallbackUsed: true,
          errorCode,
          timings,
        });
        result.timings.totalMs = deadline.elapsedMs();
        logResult(logger, requestId, queryInfo, result, { timeoutStage: isTimeoutError(error) ? 'provider' : null });
        return res.status(200).json(result);
      }
      timings.providerMs = Math.max(0, now() - providerStart);

      const result = withMetadata(normalizeGeneralPayload(raw, queryInfo), {
        source: 'gemini',
        originSource: 'gemini',
        evidenceSource: 'gemini-ungrounded',
        cacheStatus,
        providerAttempted: true,
        timings,
      });
      if (deadline.hasTime(40)) {
        const cachePayload = { ...result, timings: { cacheReadMs: 0, rateLimitMs: 0, providerMs: 0, cacheWriteMs: 0, totalMs: 0 } };
        boundedRedisSet(redis, cacheKey, cachePayload, 7 * 24 * 60 * 60, deadline, {
          stage: 'general-cache-write',
          maxMs: CACHE_WRITE_BUDGET_MS,
        }).then((write) => {
          timings.cacheWriteMs = write.elapsedMs || 0;
        }).catch(() => {});
      }
      result.timings = { ...timings, totalMs: deadline.elapsedMs() };
      logResult(logger, requestId, queryInfo, result);
      return res.status(200).json(result);
    } catch (error) {
      const result = withMetadata(normalizeGeneralPayload({}, queryInfo), {
        source: 'fallback',
        cacheStatus,
        fallbackUsed: true,
        errorCode: isTimeoutError(error) ? 'TOTAL_DEADLINE' : 'INTERNAL_ERROR',
        timings,
      });
      result.timings.totalMs = deadline.elapsedMs();
      logResult(logger, requestId, queryInfo, result, { timeoutStage: isTimeoutError(error) ? error.stage || 'unknown' : null });
      return res.status(200).json(result);
    }
  };
}

export default createSmartQueryGeneralHandler();
