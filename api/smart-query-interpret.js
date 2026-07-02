import { buildSmartInterpretCacheKey, prepareInterpretForCache } from '../lib/smart-lookup/cache.js';
import { createDeadline, isTimeoutError } from '../lib/smart-lookup/deadline.js';
import { classifySmartLookupQuery, normalizeWhitespace } from '../lib/smart-lookup/normalize.js';
import { callGeminiInterpretProvider, SmartLookupProviderError } from '../lib/smart-lookup/provider.js';
import {
  boundedRateLimit,
  boundedRedisGet,
  boundedRedisSet,
  createProviderRateLimiter,
  createRedisClient,
  getClientIp,
} from '../lib/smart-lookup/redis.js';
import { createRequestId, logSmartLookup } from '../lib/smart-lookup/telemetry.js';

const TOTAL_BUDGET_MS = 3500;
const PROVIDER_BUDGET_MS = 2500;
const REDIS_CALL_BUDGET_MS = 250;
const CACHE_WRITE_BUDGET_MS = 150;

function validateRequest(body) {
  const query = normalizeWhitespace(body?.query);
  if (!query) return { error: 'MISSING_QUERY' };
  if (query.length > 200) return { error: 'QUERY_TOO_LONG' };
  return { value: { query } };
}

function normalizeSuggestions(value) {
  return Array.isArray(value)
    ? value.map((item) => normalizeWhitespace(item)).filter(Boolean).slice(0, 5)
    : [];
}

function deterministicInterpretation(queryInfo) {
  if (queryInfo.specificityLevel === 'specific') {
    return {
      action: 'bypass', queryKind: 'specific', confidence: 'high', scopeValid: true,
      message: null, suggestions: [queryInfo.query], specificityLevel: 'specific',
    };
  }
  if (queryInfo.specificityLevel === 'partial') {
    return {
      action: 'bypass', queryKind: 'specific', confidence: 'high', scopeValid: true,
      message: 'This appears to be a partial model token. Smart Lookup will preserve it without inventing a complete model.',
      suggestions: [queryInfo.query], specificityLevel: 'partial',
    };
  }
  if (queryInfo.specificityLevel === 'brand-only' || queryInfo.specificityLevel === 'generic') {
    return {
      action: 'bypass', queryKind: 'general', confidence: 'high', scopeValid: true,
      message: null, suggestions: [queryInfo.query], specificityLevel: queryInfo.specificityLevel,
    };
  }
  return null;
}

function normalizeProviderInterpretation(raw, queryInfo) {
  const actions = new Set(['bypass', 'suggest', 'no_results', 'out_of_scope']);
  const kinds = new Set(['general', 'specific']);
  const confidence = new Set(['high', 'medium', 'low']);
  const payload = {
    action: actions.has(raw?.action) ? raw.action : 'suggest',
    queryKind: kinds.has(raw?.queryKind) ? raw.queryKind : 'specific',
    confidence: confidence.has(raw?.confidence) ? raw.confidence : 'medium',
    scopeValid: raw?.scopeValid !== false,
    message: normalizeWhitespace(raw?.message) || null,
    suggestions: normalizeSuggestions(raw?.suggestions),
    specificityLevel: queryInfo.specificityLevel,
  };
  if (payload.action === 'suggest' && !payload.suggestions.length) payload.action = 'no_results';
  if (payload.action === 'bypass' && !payload.suggestions.length) payload.suggestions = [queryInfo.query];
  if (payload.action === 'no_results' && !payload.message) {
    payload.message = "We couldn't identify a physical property item. Enter a brand, model number, or item description.";
    payload.scopeValid = false;
  }
  if (payload.action === 'out_of_scope' && !payload.message) {
    payload.message = 'Decode My Item is designed for appliances, electronics, HVAC, electrical, plumbing, and household equipment.';
    payload.scopeValid = false;
  }
  return payload;
}

function withMetadata(payload, metadata = {}) {
  return {
    ...payload,
    cacheStatus: metadata.cacheStatus || 'bypass',
    source: metadata.source || 'static',
    originSource: metadata.originSource || metadata.source || 'static',
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

export function createSmartQueryInterpretHandler(dependencies = {}) {
  const redisFactory = dependencies.redisFactory || createRedisClient;
  const providerLookup = dependencies.providerLookup || callGeminiInterpretProvider;
  const limiterFactory = dependencies.rateLimiterFactory || ((redis) => createProviderRateLimiter(redis, {
    requests: 20, window: '1 m', prefix: 'smart-interpret-provider-v2',
  }));
  const logger = dependencies.logger || console;
  const now = dependencies.now || Date.now;
  const inflightInterpretRequests = new Map();

  return async function handler(req, res) {
    const requestId = createRequestId(req, 'interpret');
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
    const deterministic = deterministicInterpretation(queryInfo);
    if (deterministic) {
      const result = withMetadata(deterministic, { source: 'static', timings });
      result.timings.totalMs = deadline.elapsedMs();
      logSmartLookup(logger, {
        event: 'smart_query_interpret', requestId, canonicalQuery: queryInfo.canonicalQuery,
        specificityLevel: queryInfo.specificityLevel, source: result.source,
        cacheStatus: result.cacheStatus, providerAttempted: false, timings: result.timings,
      });
      return res.status(200).json(result);
    }

    try {
    const redis = dependencies.redis || redisFactory();
    const cacheKey = buildSmartInterpretCacheKey(queryInfo);
    const cacheStart = now();
    const cacheRead = await boundedRedisGet(redis, cacheKey, deadline, {
      stage: 'interpret-cache-read', maxMs: REDIS_CALL_BUDGET_MS, reserveMs: 350,
    });
    timings.cacheReadMs = Math.max(cacheRead.elapsedMs || 0, now() - cacheStart);
    if (cacheRead.status === 'hit' && cacheRead.value && typeof cacheRead.value === 'object') {
      const result = withMetadata(normalizeProviderInterpretation(cacheRead.value, queryInfo), {
        source: 'cache', originSource: cacheRead.value.originSource || cacheRead.value.source || 'gemini',
        cacheStatus: 'hit', providerAttempted: false, timings,
      });
      result.timings.totalMs = deadline.elapsedMs();
      logSmartLookup(logger, {
        event: 'smart_query_interpret', requestId, canonicalQuery: queryInfo.canonicalQuery,
        specificityLevel: queryInfo.specificityLevel, source: result.source,
        cacheStatus: result.cacheStatus, providerAttempted: false, timings: result.timings,
      });
      return res.status(200).json(result);
    }

    let providerPromise = inflightInterpretRequests.get(cacheKey);
    if (!providerPromise) {
      providerPromise = (async () => {
        const limiter = dependencies.rateLimiter || limiterFactory(redis);
        const rate = await boundedRateLimit(limiter, getClientIp(req), deadline, {
          stage: 'interpret-provider-rate-limit', maxMs: REDIS_CALL_BUDGET_MS, reserveMs: 250,
        });
        timings.rateLimitMs = rate.elapsedMs || 0;
        if (!rate.success) {
          const error = new Error('RATE_LIMIT');
          error.code = 'RATE_LIMIT';
          throw error;
        }
        return deadline.run('interpret-provider-call', () => providerLookup(queryInfo, {
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
      inflightInterpretRequests.set(cacheKey, providerPromise);
      providerPromise.finally(() => {
        if (inflightInterpretRequests.get(cacheKey) === providerPromise) inflightInterpretRequests.delete(cacheKey);
      }).catch(() => {});
    }

    const providerStart = now();
    try {
      const raw = await deadline.run('interpret-provider-result-wait', () => providerPromise, {
        maxMs: Math.min(dependencies.providerBudgetMs || PROVIDER_BUDGET_MS, deadline.remainingMs(250)),
        reserveMs: 250,
      });
      timings.providerMs = Math.max(0, now() - providerStart);
      const payload = normalizeProviderInterpretation(raw, queryInfo);
      const result = withMetadata(payload, {
        source: 'gemini', originSource: 'gemini', cacheStatus: cacheRead.status === 'miss' ? 'miss' : 'error',
        providerAttempted: true, timings,
      });
      const cachePayload = prepareInterpretForCache(result);
      if (cachePayload && deadline.hasTime(40)) {
        const write = await boundedRedisSet(redis, cacheKey, cachePayload, 7 * 24 * 60 * 60, deadline, {
          stage: 'interpret-cache-write', maxMs: CACHE_WRITE_BUDGET_MS,
        });
        timings.cacheWriteMs = write.elapsedMs || 0;
      }
      result.timings = { ...timings, totalMs: deadline.elapsedMs() };
      logSmartLookup(logger, {
        event: 'smart_query_interpret', requestId, canonicalQuery: queryInfo.canonicalQuery,
        specificityLevel: queryInfo.specificityLevel, source: result.source,
        cacheStatus: result.cacheStatus, providerAttempted: true, timings: result.timings,
      });
      return res.status(200).json(result);
    } catch (error) {
      timings.providerMs = Math.max(0, now() - providerStart);
      const errorCode = isTimeoutError(error)
        ? 'PROVIDER_TIMEOUT'
        : (error instanceof SmartLookupProviderError ? error.code : 'PROVIDER_UNAVAILABLE');
      const result = withMetadata({
        action: 'bypass', queryKind: 'specific', confidence: 'low', scopeValid: true,
        message: 'The original query is being used because interpretation was unavailable.',
        suggestions: [queryInfo.query], specificityLevel: 'unknown',
      }, {
        source: 'fallback', cacheStatus: cacheRead.status === 'miss' ? 'miss' : 'error',
        providerAttempted: true, fallbackUsed: true, errorCode, timings,
      });
      result.timings.totalMs = deadline.elapsedMs();
      logSmartLookup(logger, {
        event: 'smart_query_interpret', requestId, canonicalQuery: queryInfo.canonicalQuery,
        specificityLevel: queryInfo.specificityLevel, source: result.source,
        cacheStatus: result.cacheStatus, providerAttempted: true, fallbackUsed: true,
        timeoutStage: isTimeoutError(error) ? 'provider' : null, errorCode, timings: result.timings,
      });
      return res.status(200).json(result);
    }
    } catch (error) {
      const result = withMetadata({
        action: 'bypass', queryKind: queryInfo.specificityLevel === 'generic' || queryInfo.specificityLevel === 'brand-only' ? 'general' : 'specific', confidence: 'low', scopeValid: true,
        message: 'The original query is being used because interpretation was unavailable.',
        suggestions: [queryInfo.query], specificityLevel: queryInfo.specificityLevel,
      }, {
        source: 'fallback', cacheStatus: 'error', providerAttempted: false, fallbackUsed: true,
        errorCode: isTimeoutError(error) ? 'TOTAL_DEADLINE' : 'INTERNAL_ERROR', timings,
      });
      result.timings.totalMs = deadline.elapsedMs();
      logSmartLookup(logger, {
        event: 'smart_query_interpret', requestId, canonicalQuery: queryInfo.canonicalQuery,
        specificityLevel: queryInfo.specificityLevel, source: result.source,
        cacheStatus: result.cacheStatus, providerAttempted: false, fallbackUsed: true,
        timeoutStage: isTimeoutError(error) ? error.stage || 'unknown' : null,
        errorCode: result.errorCode, timings: result.timings,
      });
      return res.status(200).json(result);
    }
  };
}

export default createSmartQueryInterpretHandler();
