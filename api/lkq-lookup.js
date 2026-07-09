import { buildSmartLkqCacheKey, chooseSmartLkqTtl, prepareReplacementForCache } from '../lib/smart-lookup/cache.js';
import { createDeadline, isTimeoutError } from '../lib/smart-lookup/deadline.js';
import { classifySmartLookupQuery, normalizeKnownQuery, normalizeWhitespace } from '../lib/smart-lookup/normalize.js';
import { callGeminiLkqProvider, getSmartLookupProviderMetadata, SmartLookupProviderError } from '../lib/smart-lookup/provider.js';
import {
  createReplacementTimings,
  createUnavailableReplacementResult,
  normalizeCachedReplacementResult,
  normalizeReplacementResult,
} from '../lib/smart-lookup/replacement-schema.js';
import {
  boundedRateLimit,
  boundedRedisGet,
  boundedRedisSet,
  createProviderRateLimiter,
  createRedisClient,
  getClientIp,
} from '../lib/smart-lookup/redis.js';
import { createRequestId, logSmartLookup } from '../lib/smart-lookup/telemetry.js';

const TOTAL_BUDGET_MS = 9000;
const PROVIDER_BUDGET_MS = 7000;
const REDIS_CALL_BUDGET_MS = 250;
const CACHE_WRITE_BUDGET_MS = 175;

function validateRequest(body) {
  const query = normalizeWhitespace(body?.query);
  if (!query) return { error: 'MISSING_QUERY' };
  if (query.length > 300) return { error: 'QUERY_TOO_LONG' };
  return { value: { query: normalizeKnownQuery(query) } };
}

function finish(result, timings, deadline) {
  timings.totalMs = deadline.elapsedMs();
  result.timings = { ...timings };
  return result;
}

export function createLkqLookupHandler(dependencies = {}) {
  const redisFactory = dependencies.redisFactory || createRedisClient;
  const providerLookup = dependencies.providerLookup || callGeminiLkqProvider;
  const limiterFactory = dependencies.rateLimiterFactory || ((redis) => createProviderRateLimiter(redis, {
    requests: 10, window: '1 m', prefix: 'smart-lkq-provider-v2',
  }));
  const logger = dependencies.logger || console;
  const now = dependencies.now || Date.now;
  const inflightReplacementRequests = new Map();

  return async function handler(req, res) {
    const requestId = createRequestId(req, 'lkq');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const validation = validateRequest(req.body || {});
    if (validation.error) {
      return res.status(400).json({
        error: validation.error === 'MISSING_QUERY' ? 'Missing query' : 'Query too long',
        errorCode: validation.error,
      });
    }

    const deadline = createDeadline({ totalMs: dependencies.totalBudgetMs || TOTAL_BUDGET_MS, now });
    const timings = createReplacementTimings();
    const queryInfo = classifySmartLookupQuery(validation.value.query);
    const redis = dependencies.redis || redisFactory();
    const cacheKey = buildSmartLkqCacheKey(queryInfo);
    let cacheStatus = 'bypass';

    try {
      const cacheRead = await boundedRedisGet(redis, cacheKey, deadline, {
        stage: 'lkq-cache-read', maxMs: REDIS_CALL_BUDGET_MS, reserveMs: 500,
      });
      timings.cacheReadMs = cacheRead.elapsedMs || 0;
      cacheStatus = cacheRead.status === 'hit' ? 'hit' : (cacheRead.status === 'miss' ? 'miss' : 'error');
      if (cacheRead.status === 'hit' && cacheRead.value) {
        try {
          const result = finish(normalizeCachedReplacementResult(cacheRead.value, { queryInfo }), timings, deadline);
          logSmartLookup(logger, {
            event: 'smart_lkq_lookup', requestId, canonicalQuery: queryInfo.canonicalQuery,
            specificityLevel: queryInfo.specificityLevel, source: result.source,
            evidenceSource: result.evidenceSource, cacheStatus: result.cacheStatus,
            providerAttempted: false, timings: result.timings,
          });
          return res.status(200).json(result);
        } catch (_) {
          cacheStatus = 'error';
        }
      }

      const providerStart = now();
      let providerPromise = inflightReplacementRequests.get(cacheKey);
      if (!providerPromise) {
        providerPromise = (async () => {
          const limiter = dependencies.rateLimiter || limiterFactory(redis);
          const rate = await boundedRateLimit(limiter, getClientIp(req), deadline, {
            stage: 'lkq-provider-rate-limit', maxMs: REDIS_CALL_BUDGET_MS, reserveMs: 400,
          });
          timings.rateLimitMs = rate.elapsedMs || 0;
          if (!rate.success) {
            const error = new Error('RATE_LIMIT');
            error.code = 'RATE_LIMIT';
            throw error;
          }
          return deadline.run('lkq-provider-call', () => providerLookup(queryInfo, {
            deadline,
            maxMs: Math.min(dependencies.providerBudgetMs || PROVIDER_BUDGET_MS, deadline.remainingMs(350)),
            reserveMs: 350,
            fetchImpl: dependencies.fetchImpl,
            apiKey: dependencies.apiKey,
          }), {
            maxMs: Math.min(dependencies.providerBudgetMs || PROVIDER_BUDGET_MS, deadline.remainingMs(350)),
            reserveMs: 350,
          });
        })();
        inflightReplacementRequests.set(cacheKey, providerPromise);
        providerPromise.finally(() => {
          if (inflightReplacementRequests.get(cacheKey) === providerPromise) inflightReplacementRequests.delete(cacheKey);
        }).catch(() => {});
      }

      let raw;
      try {
        raw = await deadline.run('lkq-provider-result-wait', () => providerPromise, {
          maxMs: Math.min(dependencies.providerBudgetMs || PROVIDER_BUDGET_MS, deadline.remainingMs(300)),
          reserveMs: 300,
        });
      } catch (error) {
        timings.providerMs = Math.max(0, now() - providerStart);
        const errorCode = error?.code === 'RATE_LIMIT'
          ? 'RATE_LIMIT'
          : (isTimeoutError(error)
            ? 'PROVIDER_TIMEOUT'
            : (error instanceof SmartLookupProviderError ? error.code : 'PROVIDER_UNAVAILABLE'));
        // PROVIDERS_UNAVAILABLE means the Groq fallback was actually attempted
        // (and also failed); every other code means Groq was never reached.
        const result = finish(createUnavailableReplacementResult(queryInfo, {
          cacheStatus, providerAttempted: errorCode !== 'RATE_LIMIT', fallbackUsed: errorCode === 'PROVIDERS_UNAVAILABLE', errorCode, timings,
          message: errorCode === 'RATE_LIMIT' ? 'Replacement provider capacity is temporarily limited. The age result remains available.' : undefined,
        }), timings, deadline);
        logSmartLookup(logger, {
          event: 'smart_lkq_lookup', requestId, canonicalQuery: queryInfo.canonicalQuery,
          specificityLevel: queryInfo.specificityLevel, source: result.source,
          evidenceSource: result.evidenceSource, cacheStatus: result.cacheStatus,
          providerAttempted: true, fallbackUsed: true,
          timeoutStage: isTimeoutError(error) ? 'provider' : null,
          errorCode, timings: result.timings,
        });
        return res.status(200).json(result);
      }
      timings.providerMs = Math.max(0, now() - providerStart);

      const postStart = now();
      let result;
      try {
        // providerLookup already resolved through Gemini or its bounded Groq
        // fallback; read which one actually served this result instead of
        // assuming Gemini succeeded.
        const providerMetadata = getSmartLookupProviderMetadata(raw);
        result = normalizeReplacementResult(raw, {
          queryInfo,
          source: providerMetadata.provider,
          originSource: providerMetadata.provider,
          evidenceSource: providerMetadata.provider === 'groq' ? 'groq-ungrounded' : 'gemini-ungrounded',
          cacheStatus,
          providerAttempted: true,
          fallbackUsed: providerMetadata.fallbackUsed,
          timings,
        });
      } catch (error) {
        timings.postProcessMs = Math.max(0, now() - postStart);
        result = finish(createUnavailableReplacementResult(queryInfo, {
          cacheStatus, providerAttempted: true, fallbackUsed: getSmartLookupProviderMetadata(raw).fallbackUsed,
          errorCode: error?.code || 'INVALID_PROVIDER_RESULT', timings,
        }), timings, deadline);
        return res.status(200).json(result);
      }
      timings.postProcessMs = Math.max(0, now() - postStart);

      const ttl = chooseSmartLkqTtl(result);
      if (ttl && deadline.hasTime(40)) {
        const cachePayload = prepareReplacementForCache(result);
        boundedRedisSet(redis, cacheKey, cachePayload, ttl, deadline, {
          stage: 'lkq-cache-write', maxMs: CACHE_WRITE_BUDGET_MS,
        }).then((write) => {
          timings.cacheWriteMs = write.elapsedMs || 0;
        }).catch(() => {});
      }

      finish(result, timings, deadline);
      logSmartLookup(logger, {
        event: 'smart_lkq_lookup', requestId, canonicalQuery: queryInfo.canonicalQuery,
        specificityLevel: queryInfo.specificityLevel, source: result.source,
        evidenceSource: result.evidenceSource, cacheStatus: result.cacheStatus,
        providerAttempted: true, timings: result.timings,
      });
      return res.status(200).json(result);
    } catch (error) {
      const result = finish(createUnavailableReplacementResult(queryInfo, {
        cacheStatus,
        errorCode: isTimeoutError(error) ? 'TOTAL_DEADLINE' : 'INTERNAL_ERROR',
        timings,
      }), timings, deadline);
      return res.status(200).json(result);
    }
  };
}

export default createLkqLookupHandler();
