import { buildSmartLkqCacheKey, chooseSmartLkqTtl, hashCanonicalQuery, prepareReplacementForCache } from '../lib/smart-lookup/cache.js';
import { providerAttemptCountFromMetadata, recordProviderAttemptMetrics, reserveProviderBudget } from '../lib/smart-lookup/budget.js';
import { createDeadline, isTimeoutError } from '../lib/smart-lookup/deadline.js';
import { classifySmartLookupQuery, normalizeKnownQuery, normalizeSmartLookupNotes, normalizeWhitespace, SMART_LOOKUP_NOTES_MAX_LENGTH } from '../lib/smart-lookup/normalize.js';
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
  const notes = normalizeSmartLookupNotes(body?.notes);
  if (!query) return { error: 'MISSING_QUERY' };
  if (query.length > 300) return { error: 'QUERY_TOO_LONG' };
  if (notes.length > SMART_LOOKUP_NOTES_MAX_LENGTH) return { error: 'NOTES_TOO_LONG' };
  return { value: { query: normalizeKnownQuery(query), notes } };
}

function finish(result, timings, deadline) {
  timings.totalMs = deadline.elapsedMs();
  result.timings = { ...timings };
  return result;
}

function logLkqResult(logger, requestId, queryInfo, result, extra = {}) {
  logSmartLookup(logger, {
    event: 'smart_lkq_lookup',
    requestId,
    canonicalQuery: queryInfo.canonicalQuery,
    specificityLevel: queryInfo.specificityLevel,
    source: result?.source,
    evidenceSource: result?.evidenceSource,
    cacheStatus: result?.cacheStatus,
    providerAttempted: Boolean(result?.providerAttempted),
    fallbackUsed: Boolean(result?.fallbackUsed),
    budgetStatus: extra.budgetStatus || result?.budgetStatus || null,
    logicalLookupCount: extra.logicalLookupCount ?? result?.logicalLookupCount ?? null,
    actualProviderAttemptCount: extra.actualProviderAttemptCount ?? result?.actualProviderAttemptCount ?? null,
    timeoutStage: extra.timeoutStage || null,
    errorCode: result?.errorCode || extra.errorCode || null,
    timings: result?.timings,
  });
}

function recordSharedProviderAttempts(providerPromise, recordAttempts, redis, kind, attempts, deadline, options = {}) {
  if (!attempts) return Promise.resolve({ actualProviderAttemptCount: 0 });
  if (!providerPromise.__smartAttemptMetricsPromise) {
    providerPromise.__smartAttemptMetricsPromise = recordAttempts(redis, kind, attempts, deadline, options);
  }
  return providerPromise.__smartAttemptMetricsPromise;
}

export function createLkqLookupHandler(dependencies = {}) {
  const redisFactory = dependencies.redisFactory || createRedisClient;
  const providerLookup = dependencies.providerLookup || callGeminiLkqProvider;
  const reserveBudget = dependencies.reserveProviderBudget || reserveProviderBudget;
  const recordAttempts = dependencies.recordProviderAttemptMetrics || recordProviderAttemptMetrics;
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
        error: validation.error === 'MISSING_QUERY'
          ? 'Missing query'
          : (validation.error === 'NOTES_TOO_LONG' ? 'Notes too long' : 'Query too long'),
        errorCode: validation.error,
      });
    }

    const deadline = createDeadline({ totalMs: dependencies.totalBudgetMs || TOTAL_BUDGET_MS, now });
    const timings = createReplacementTimings();
    const queryInfo = {
      ...classifySmartLookupQuery(validation.value.query),
      userNotes: validation.value.notes,
      notesHash: validation.value.notes ? hashCanonicalQuery(validation.value.notes) : '',
    };
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
          logLkqResult(logger, requestId, queryInfo, result);
          return res.status(200).json(result);
        } catch (_) {
          cacheStatus = 'error';
        }
      }

      const providerStart = now();
      let providerPromise = inflightReplacementRequests.get(cacheKey);
      let budgetResult = null;
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
          budgetResult = await reserveBudget(redis, 'lkq', deadline, {
            stage: 'lkq-provider-global-budget',
            maxMs: REDIS_CALL_BUDGET_MS,
            reserveMs: 400,
            now,
            env: dependencies.env,
          });
          if (!budgetResult.allowed) {
            const error = new Error(budgetResult.errorCode || 'BUDGET_STORE_UNAVAILABLE');
            error.code = budgetResult.errorCode || 'BUDGET_STORE_UNAVAILABLE';
            error.budgetResult = budgetResult;
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
          : (error?.code === 'GLOBAL_BUDGET_EXHAUSTED' || error?.code === 'BUDGET_STORE_UNAVAILABLE'
            ? error.code
          : (isTimeoutError(error)
            ? 'PROVIDER_TIMEOUT'
            : (error instanceof SmartLookupProviderError ? error.code : 'PROVIDER_UNAVAILABLE')));
        const actualAttempts = providerAttemptCountFromMetadata(null, errorCode);
        const attemptMetrics = actualAttempts
          ? await recordSharedProviderAttempts(providerPromise, recordAttempts, redis, 'lkq', actualAttempts, deadline, {
              stage: 'lkq-provider-attempt-metrics',
              maxMs: CACHE_WRITE_BUDGET_MS,
              now,
            })
          : { actualProviderAttemptCount: 0 };
        // PROVIDERS_UNAVAILABLE means the Groq fallback was actually attempted
        // (and also failed); every other code means Groq was never reached.
        const result = finish(createUnavailableReplacementResult(queryInfo, {
          cacheStatus,
          providerAttempted: errorCode !== 'RATE_LIMIT' && errorCode !== 'GLOBAL_BUDGET_EXHAUSTED' && errorCode !== 'BUDGET_STORE_UNAVAILABLE',
          fallbackUsed: errorCode === 'PROVIDERS_UNAVAILABLE',
          errorCode,
          timings,
          message: errorCode === 'RATE_LIMIT'
            ? 'Replacement provider capacity is temporarily limited. The age result remains available.'
            : (errorCode === 'GLOBAL_BUDGET_EXHAUSTED' || errorCode === 'BUDGET_STORE_UNAVAILABLE'
              ? 'Replacement research capacity is temporarily limited. Please try again tomorrow.'
              : undefined),
        }), timings, deadline);
        logLkqResult(logger, requestId, queryInfo, result, {
          timeoutStage: isTimeoutError(error) ? 'provider' : null,
          budgetStatus: error.budgetResult?.status || budgetResult?.status || null,
          logicalLookupCount: error.budgetResult?.logicalLookupCount ?? budgetResult?.logicalLookupCount ?? null,
          actualProviderAttemptCount: attemptMetrics.actualProviderAttemptCount ?? actualAttempts,
        });
        return res.status(200).json(result);
      }
      timings.providerMs = Math.max(0, now() - providerStart);

      const postStart = now();
      let result;
      let providerMetadata = null;
      try {
        // providerLookup already resolved through Gemini or its bounded Groq
        // fallback; read which one actually served this result instead of
        // assuming Gemini succeeded.
        providerMetadata = getSmartLookupProviderMetadata(raw);
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
        const actualAttempts = providerAttemptCountFromMetadata(providerMetadata);
        const attemptMetrics = await recordSharedProviderAttempts(providerPromise, recordAttempts, redis, 'lkq', actualAttempts, deadline, {
          stage: 'lkq-provider-attempt-metrics',
          maxMs: CACHE_WRITE_BUDGET_MS,
          now,
        });
        result = finish(createUnavailableReplacementResult(queryInfo, {
          cacheStatus, providerAttempted: true, fallbackUsed: getSmartLookupProviderMetadata(raw).fallbackUsed,
          errorCode: error?.code || 'INVALID_PROVIDER_RESULT', timings,
        }), timings, deadline);
        logLkqResult(logger, requestId, queryInfo, result, {
          budgetStatus: budgetResult?.status || null,
          logicalLookupCount: budgetResult?.logicalLookupCount ?? null,
          actualProviderAttemptCount: attemptMetrics.actualProviderAttemptCount ?? actualAttempts,
        });
        return res.status(200).json(result);
      }
      timings.postProcessMs = Math.max(0, now() - postStart);
      const actualAttempts = providerAttemptCountFromMetadata(providerMetadata);
      const attemptMetrics = await recordSharedProviderAttempts(providerPromise, recordAttempts, redis, 'lkq', actualAttempts, deadline, {
        stage: 'lkq-provider-attempt-metrics',
        maxMs: CACHE_WRITE_BUDGET_MS,
        now,
      });

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
      logLkqResult(logger, requestId, queryInfo, result, {
        budgetStatus: budgetResult?.status || null,
        logicalLookupCount: budgetResult?.logicalLookupCount ?? null,
        actualProviderAttemptCount: attemptMetrics.actualProviderAttemptCount ?? actualAttempts,
      });
      return res.status(200).json(result);
    } catch (error) {
      const result = finish(createUnavailableReplacementResult(queryInfo, {
        cacheStatus,
        errorCode: isTimeoutError(error) ? 'TOTAL_DEADLINE' : 'INTERNAL_ERROR',
        timings,
      }), timings, deadline);
      logLkqResult(logger, requestId, queryInfo, result, {
        timeoutStage: isTimeoutError(error) ? error.stage || 'unknown' : null,
      });
      return res.status(200).json(result);
    }
  };
}

export default createLkqLookupHandler();
