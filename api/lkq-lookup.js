import { buildSmartLkqCacheKey, chooseSmartLkqTtl, prepareReplacementForCache } from '../lib/smart-lookup/cache.js';
import { createDeadline, isTimeoutError } from '../lib/smart-lookup/deadline.js';
import { classifySmartLookupQuery, normalizeKnownQuery, normalizeWhitespace } from '../lib/smart-lookup/normalize.js';
import { callGeminiLkqProvider, SmartLookupProviderError } from '../lib/smart-lookup/provider.js';
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

function extractLgTvSeriesInfo(value) {
  const text = String(value || '').toUpperCase();
  const match = text.match(/OLED\d+[A-Z]{0,3}([BCGZM])(\d)[A-Z0-9]*/)
    || text.match(/\b([BCGZM])(\d)\b/)
    || text.match(/\b([BCGZM])(\d)[A-Z0-9]{2,}\b/);
  if (!match) return null;
  return { family: match[1], generationDigit: parseInt(match[2], 10) };
}

function getCurrentLgTvGenerationDigit() {
  const year = new Date().getFullYear();
  return Math.max(1, year - 2021);
}

function rewriteLgTvModelToGeneration(value, targetDigit) {
  const text = String(value || '');
  if (!text || !Number.isFinite(targetDigit)) return text;
  return text
    .replace(/(OLED\d+[A-Z]{0,3})([BCGZM])(\d)([A-Z0-9]*)/i, (_, prefix, family, __, suffix) => `${prefix}${family}${targetDigit}${suffix || ''}`)
    .replace(/\b([BCGZM])(\d)([A-Z0-9]{2,})\b/i, (_, family, __, suffix) => `${family}${targetDigit}${suffix}`)
    .replace(/\b([BCGZM])(\d)\b/i, (_, family) => `${family}${targetDigit}`);
}

export function maybePromoteCurrentSuccessor(result) {
  if (!result || typeof result !== 'object') return result;
  const copy = JSON.parse(JSON.stringify(result));
  const summary = copy.itemSummary || {};
  const successor = copy.successorStatus || {};
  const options = Array.isArray(copy.replacementOptions) ? copy.replacementOptions : [];
  const first = options[0];
  const brand = String(summary.brand || first?.brand || successor.name || '').toLowerCase();
  const category = String(summary.category || '').toLowerCase();
  const originalInfo = extractLgTvSeriesInfo(summary.model || summary.modelNumber || summary.name || '');
  const successorInfo = extractLgTvSeriesInfo(successor.model || first?.model || successor.name || first?.name || '');
  if (brand !== 'lg' || (category.indexOf('tv') === -1 && category.indexOf('oled') === -1)) return copy;
  if (!originalInfo || !successorInfo || originalInfo.family !== successorInfo.family) return copy;
  const currentDigit = getCurrentLgTvGenerationDigit();
  if (!Number.isFinite(currentDigit) || currentDigit <= successorInfo.generationDigit || currentDigit <= originalInfo.generationDigit) return copy;
  const upgradeText = `Promoted to current in-market ${successorInfo.family}-series successor based on the current model cycle.`;
  if (successor.model) successor.model = rewriteLgTvModelToGeneration(successor.model, currentDigit);
  if (successor.name) successor.name = rewriteLgTvModelToGeneration(successor.name, currentDigit);
  successor.explanation = successor.explanation ? `${successor.explanation} ${upgradeText}` : upgradeText;
  if (first) {
    if (first.model) first.model = rewriteLgTvModelToGeneration(first.model, currentDigit);
    if (first.name) first.name = rewriteLgTvModelToGeneration(first.name, currentDigit);
    if (first.retailerSearchQuery) first.retailerSearchQuery = rewriteLgTvModelToGeneration(first.retailerSearchQuery, currentDigit);
    first.notes = first.notes ? `${first.notes} ${upgradeText}` : upgradeText;
  }
  return copy;
}

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
          const cached = maybePromoteCurrentSuccessor(cacheRead.value);
          const result = finish(normalizeCachedReplacementResult(cached, { queryInfo }), timings, deadline);
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

      const limiter = dependencies.rateLimiter || limiterFactory(redis);
      const rate = await boundedRateLimit(limiter, getClientIp(req), deadline, {
        stage: 'lkq-provider-rate-limit', maxMs: REDIS_CALL_BUDGET_MS, reserveMs: 400,
      });
      timings.rateLimitMs = rate.elapsedMs || 0;
      if (!rate.success) {
        const result = finish(createUnavailableReplacementResult(queryInfo, {
          cacheStatus, errorCode: 'RATE_LIMIT', timings,
          message: 'Replacement provider capacity is temporarily limited. The age result remains available.',
        }), timings, deadline);
        return res.status(429).json(result);
      }

      const providerStart = now();
      let providerPromise = inflightReplacementRequests.get(cacheKey);
      if (!providerPromise) {
        providerPromise = deadline.run('lkq-provider-call', () => providerLookup(queryInfo, {
          deadline,
          maxMs: Math.min(dependencies.providerBudgetMs || PROVIDER_BUDGET_MS, deadline.remainingMs(350)),
          reserveMs: 350,
          fetchImpl: dependencies.fetchImpl,
          apiKey: dependencies.apiKey,
        }), {
          maxMs: Math.min(dependencies.providerBudgetMs || PROVIDER_BUDGET_MS, deadline.remainingMs(350)),
          reserveMs: 350,
        });
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
        const errorCode = isTimeoutError(error)
          ? 'PROVIDER_TIMEOUT'
          : (error instanceof SmartLookupProviderError ? error.code : 'PROVIDER_UNAVAILABLE');
        const result = finish(createUnavailableReplacementResult(queryInfo, {
          cacheStatus, providerAttempted: true, fallbackUsed: true, errorCode, timings,
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
        result = normalizeReplacementResult(maybePromoteCurrentSuccessor(raw), {
          queryInfo,
          source: 'gemini',
          originSource: 'gemini',
          evidenceSource: 'gemini-ungrounded',
          cacheStatus,
          providerAttempted: true,
          timings,
        });
      } catch (error) {
        timings.postProcessMs = Math.max(0, now() - postStart);
        result = finish(createUnavailableReplacementResult(queryInfo, {
          cacheStatus, providerAttempted: true, fallbackUsed: true,
          errorCode: error?.code || 'INVALID_PROVIDER_RESULT', timings,
        }), timings, deadline);
        return res.status(200).json(result);
      }
      timings.postProcessMs = Math.max(0, now() - postStart);

      const ttl = chooseSmartLkqTtl(result);
      if (ttl && deadline.hasTime(40)) {
        const write = await boundedRedisSet(redis, cacheKey, prepareReplacementForCache(result), ttl, deadline, {
          stage: 'lkq-cache-write', maxMs: CACHE_WRITE_BUDGET_MS,
        });
        timings.cacheWriteMs = write.elapsedMs || 0;
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
