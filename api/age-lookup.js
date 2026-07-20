import { buildSmartAgeCacheKey, chooseSmartAgeTtl, hashCanonicalQuery, prepareResultForCache } from '../lib/smart-lookup/cache.js';
import { providerAttemptCountFromMetadata, recordProviderAttemptMetrics, reserveProviderBudget } from '../lib/smart-lookup/budget.js';
import { createDeadline, isTimeoutError } from '../lib/smart-lookup/deadline.js';
import { applyEraHints, decodeHvacSerial, findLocalModelAgeResult } from '../lib/smart-lookup/age-legacy.js';
import { classifySmartLookupQuery, getVerifiedModelKey, normalizeSmartLookupNotes, normalizeWhitespace, SMART_LOOKUP_NOTES_MAX_LENGTH } from '../lib/smart-lookup/normalize.js';
import {
  callGeminiAgeProvider,
  callSmartLookupGroundedAgeProvider,
  getSmartLookupProviderMetadata,
  isGroundedAgeEnabled,
  SmartLookupProviderError,
} from '../lib/smart-lookup/provider.js';
import {
  createSmartLookupTimings,
  createUnavailableSmartAgeResult,
  normalizeCachedSmartAgeResult,
  normalizeSmartAgeResult,
} from '../lib/smart-lookup/result-schema.js';
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

const TOTAL_BUDGET_MS = 8500;
const PROVIDER_BUDGET_MS = 6500;
const REDIS_PHASE_BUDGET_MS = 500;
const REDIS_CALL_BUDGET_MS = 250;
const CACHE_WRITE_BUDGET_MS = 175;
const PROVIDER_RATE_LIMIT_REQUESTS = 15;
// Grounded search is bounded below the full PROVIDER_BUDGET_MS ceiling so a
// genuine reserve remains, inside the SAME route deadline, for a bounded
// ungrounded fallback if grounding times out. The total deadline never
// changes and no fresh timeout chain is started.
const GROUNDED_STAGE_BUDGET_MS = 4200;
const GROUNDED_FALLBACK_MIN_REMAINING_MS = 1200;
const GROUNDED_FALLBACK_RESERVE_MS = 300;

function validateRequestBody(body) {
  const query = normalizeWhitespace(body?.query);
  const notes = normalizeSmartLookupNotes(body?.notes);
  if (!query) return { error: 'MISSING_QUERY' };
  if (query.length > 200) return { error: 'QUERY_TOO_LONG' };
  if (notes.length > SMART_LOOKUP_NOTES_MAX_LENGTH) return { error: 'NOTES_TOO_LONG' };
  return { value: { query, notes } };
}

function normalizeLegacyResult(raw, queryInfo, options = {}) {
  const source = options.source || 'fallback';
  const copy = { ...raw };
  if (copy.estimatedYear && !copy.estimatedYearType) {
    copy.estimatedYearType = options.allowIndividualManufactureYear
      ? 'individual-manufacture'
      : 'model-introduction';
  }
  if (options.allowIndividualManufactureYear && copy.estimatedYear && copy.individualManufactureYear == null) {
    copy.individualManufactureYear = copy.estimatedYear;
  }
  return normalizeSmartAgeResult(copy, {
    queryInfo,
    source,
    originSource: source,
    evidenceSource: options.evidenceSource || 'none',
    cacheStatus: options.cacheStatus || 'bypass',
    providerAttempted: Boolean(options.providerAttempted),
    fallbackUsed: Boolean(options.fallbackUsed),
    timings: options.timings,
    errorCode: options.errorCode || null,
    allowIndividualManufactureYear: Boolean(options.allowIndividualManufactureYear),
    currentYear: options.currentYear,
  });
}

function buildVerifiedResult(record, queryInfo, timings) {
  const year = Number(record?.estimatedYear || record?.yearStart || record?.yearEnd);
  const productionRange = Number.isInteger(year)
    ? { start: year, end: year, basis: 'user-verified-serial-example' }
    : null;
  return normalizeSmartAgeResult({
    brand: record?.brand || queryInfo.brand,
    model: record?.model || queryInfo.modelIdentity,
    category: record?.category || null,
    specificityLevel: 'specific',
    productionRange,
    notes: record?.notes || 'A prior serial decode confirms that this exact model existed in the recorded year; it does not establish the manufacture date of another unit.',
    refinementSuggestion: 'Use the physical unit serial number to determine an individual manufacture date.',
    evidence: [{
      detail: 'Exact model observed in a prior successful serial-number decode.',
      source: 'Decode My Item user-verified serial record',
    }],
  }, {
    queryInfo,
    source: 'decoder-verified',
    originSource: 'decoder-verified',
    evidenceSource: 'user-verified',
    cacheStatus: 'bypass',
    providerAttempted: false,
    timings,
  });
}

function finalizeTimings(result, timings, deadline) {
  timings.totalMs = deadline.elapsedMs();
  result.timings = { ...timings };
  return result;
}

function logResult(logger, requestId, queryInfo, result, extra = {}) {
  const grounded = extra.groundedTelemetry || {};
  logSmartLookup(logger, {
    event: 'smart_age_lookup',
    requestId,
    canonicalQuery: queryInfo.canonicalQuery,
    specificityLevel: queryInfo.specificityLevel,
    source: result?.source,
    evidenceSource: result?.evidenceSource,
    cacheStatus: result?.cacheStatus,
    providerAttempted: result?.providerAttempted,
    fallbackUsed: result?.fallbackUsed,
    timeoutStage: extra.timeoutStage || null,
    errorCode: result?.errorCode,
    grounded: result?.evidenceSource === 'gemini-grounded',
    groundedSourceCount: Array.isArray(result?.sources) ? result.sources.length : 0,
    groundedAttempted: grounded.attempted || false,
    groundedSucceeded: grounded.succeeded || false,
    groundedFailureCode: grounded.failureCode || null,
    groundedDurationMs: grounded.durationMs ?? null,
    fallbackAttempted: grounded.fallbackAttempted || false,
    fallbackProvider: grounded.fallbackProvider || null,
    fallbackSucceeded: grounded.fallbackSucceeded ?? null,
    fallbackDurationMs: grounded.fallbackDurationMs ?? null,
    budgetStatus: extra.budgetStatus || result?.budgetStatus || null,
    logicalLookupCount: extra.logicalLookupCount ?? result?.logicalLookupCount ?? null,
    actualProviderAttemptCount: extra.actualProviderAttemptCount ?? result?.actualProviderAttemptCount ?? null,
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

export function createAgeLookupHandler(dependencies = {}) {
  const localLookup = dependencies.localLookup || findLocalModelAgeResult;
  const providerLookup = dependencies.providerLookup || callGeminiAgeProvider;
  const groundedProviderLookup = dependencies.groundedProviderLookup || callSmartLookupGroundedAgeProvider;
  const groundedEnabled = dependencies.groundedEnabled ?? isGroundedAgeEnabled(dependencies.env);
  const reserveBudget = dependencies.reserveProviderBudget || reserveProviderBudget;
  const recordAttempts = dependencies.recordProviderAttemptMetrics || recordProviderAttemptMetrics;
  const redisFactory = dependencies.redisFactory || createRedisClient;
  const rateLimiterFactory = dependencies.rateLimiterFactory || ((redis) => createProviderRateLimiter(redis, {
    requests: PROVIDER_RATE_LIMIT_REQUESTS,
    window: '1 m',
    prefix: 'smart-age-provider-v2',
  }));
  const logger = dependencies.logger || console;
  const now = dependencies.now || Date.now;
  const totalBudgetMs = dependencies.totalBudgetMs || TOTAL_BUDGET_MS;
  const providerBudgetMs = dependencies.providerBudgetMs || PROVIDER_BUDGET_MS;
  const groundedStageBudgetMs = dependencies.groundedStageBudgetMs || GROUNDED_STAGE_BUDGET_MS;
  const groundedFallbackMinRemainingMs = dependencies.groundedFallbackMinRemainingMs || GROUNDED_FALLBACK_MIN_REMAINING_MS;
  const groundedFallbackReserveMs = dependencies.groundedFallbackReserveMs || GROUNDED_FALLBACK_RESERVE_MS;
  const inflightProviderRequests = new Map();

  return async function handler(req, res) {
    const requestId = createRequestId(req, 'age');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const validation = validateRequestBody(req.body || {});
    if (validation.error) {
      return res.status(400).json({
        error: validation.error === 'MISSING_QUERY'
          ? 'Missing query'
          : (validation.error === 'NOTES_TOO_LONG' ? 'Notes too long' : 'Query too long'),
        errorCode: validation.error,
      });
    }

    const deadline = createDeadline({ totalMs: totalBudgetMs, now });
    const timings = createSmartLookupTimings();
    const queryInfo = {
      ...classifySmartLookupQuery(validation.value.query),
      userNotes: validation.value.notes,
      notesHash: validation.value.notes ? hashCanonicalQuery(validation.value.notes) : '',
    };
    const currentYear = new Date().getFullYear();
    let redis = null;
    let cacheStatus = 'bypass';

    try {
      // A recognized product-family query must stay a family query. In
      // particular, do not let a short legacy alias such as "C3" promote the
      // request to one arbitrary screen-size model from the local database.
      if (queryInfo.productFamily) {
        const productFamilyResult = buildDeterministicBroadResult(queryInfo);
        if (productFamilyResult) {
          const result = finalizeTimings(normalizeLegacyResult(productFamilyResult, queryInfo, {
            source: 'static',
            evidenceSource: 'heuristic',
            timings,
            currentYear,
          }), timings, deadline);
          logResult(logger, requestId, queryInfo, result);
          return res.status(200).json(result);
        }
      }

      const localStart = now();
      let localResult = null;
      try {
        localResult = await deadline.run('local-model-lookup', () => localLookup(queryInfo.query, queryInfo.normalizedQuery), {
          maxMs: 400,
          reserveMs: 700,
        });
      } catch (error) {
        logSmartLookup(logger, {
          event: 'smart_age_local_error', requestId, canonicalQuery: queryInfo.canonicalQuery,
          specificityLevel: queryInfo.specificityLevel, source: 'local-db',
          errorCode: error?.code || 'LOCAL_LOOKUP_ERROR', timings,
        });
      }
      timings.localLookupMs = Math.max(0, now() - localStart);

      if (localResult) {
        const result = finalizeTimings(normalizeLegacyResult(localResult, queryInfo, {
          source: 'local-db',
          evidenceSource: 'local-db',
          timings,
          currentYear,
        }), timings, deadline);
        logResult(logger, requestId, queryInfo, result);
        return res.status(200).json(result);
      }

      const hvacQuick = decodeHvacSerial(queryInfo.query, queryInfo.normalizedQuery, queryInfo);
      if (hvacQuick) {
        const result = finalizeTimings(normalizeLegacyResult(hvacQuick, queryInfo, {
          source: 'static',
          evidenceSource: 'heuristic',
          timings,
          currentYear,
          allowIndividualManufactureYear: true,
        }), timings, deadline);
        logResult(logger, requestId, queryInfo, result);
        return res.status(200).json(result);
      }

      const broadResult = buildDeterministicBroadResult(queryInfo);
      if (broadResult) {
        const result = finalizeTimings(normalizeLegacyResult(broadResult, queryInfo, {
          source: 'static',
          evidenceSource: 'heuristic',
          timings,
          currentYear,
        }), timings, deadline);
        logResult(logger, requestId, queryInfo, result);
        return res.status(200).json(result);
      }

      redis = dependencies.redis || redisFactory();
      // Grounded research is selective: only exact-model queries that already
      // missed every local, verified, and deterministic path. Everything else
      // keeps the existing closed-book provider behavior.
      const useGrounded = groundedEnabled
        && queryInfo.providerEligible
        && queryInfo.modelCompleteness === 'exact';
      const cacheKey = buildSmartAgeCacheKey(queryInfo, { grounded: useGrounded });
      const verifiedKey = getVerifiedModelKey(queryInfo);
      let cacheRead = { status: 'unavailable', value: null, elapsedMs: 0 };
      let verifiedRead = { status: 'unavailable', value: null, elapsedMs: 0 };

      const redisPhaseStart = now();
      try {
        [cacheRead, verifiedRead] = await deadline.run('redis-phase', () => Promise.all([
          boundedRedisGet(redis, cacheKey, deadline, {
            stage: 'age-cache-read',
            maxMs: REDIS_CALL_BUDGET_MS,
            reserveMs: 650,
          }),
          verifiedKey
            ? boundedRedisGet(redis, verifiedKey, deadline, {
                stage: 'verified-model-read',
                maxMs: REDIS_CALL_BUDGET_MS,
                reserveMs: 650,
              })
            : Promise.resolve({ status: 'miss', value: null, elapsedMs: 0 }),
        ]), {
          maxMs: REDIS_PHASE_BUDGET_MS,
          reserveMs: 650,
        });
      } catch (_) {}
      const redisPhaseElapsed = Math.max(0, now() - redisPhaseStart);
      timings.cacheReadMs = Math.min(redisPhaseElapsed, cacheRead.elapsedMs || redisPhaseElapsed);
      timings.verifiedLookupMs = verifiedRead.elapsedMs || 0;
      cacheStatus = cacheRead.status === 'hit' ? 'hit' : (cacheRead.status === 'miss' ? 'miss' : 'error');

      if (verifiedRead.status === 'hit' && verifiedRead.value) {
        try {
          const result = finalizeTimings(buildVerifiedResult(verifiedRead.value, queryInfo, timings), timings, deadline);
          logResult(logger, requestId, queryInfo, result);
          return res.status(200).json(result);
        } catch (_) {}
      }

      if (cacheRead.status === 'hit' && cacheRead.value) {
        try {
          const result = normalizeCachedSmartAgeResult(cacheRead.value, { queryInfo, currentYear });
          result.providerAttempted = false;
          result.timings = { ...timings, totalMs: deadline.elapsedMs() };
          logResult(logger, requestId, queryInfo, result);
          return res.status(200).json(result);
        } catch (_) {
          cacheStatus = 'error';
        }
      }

      if (!queryInfo.providerEligible || !deadline.hasTime(900, 300)) {
        const result = finalizeTimings(createUnavailableSmartAgeResult(queryInfo, {
          source: 'fallback',
          evidenceSource: 'none',
          cacheStatus,
          providerAttempted: false,
          timings,
          errorCode: 'INSUFFICIENT_QUERY_DETAIL',
        }), timings, deadline);
        logResult(logger, requestId, queryInfo, result);
        return res.status(200).json(result);
      }

      const providerStart = now();
      let rawProvider;
      let providerPromise = inflightProviderRequests.get(cacheKey);
      let budgetResult = null;
      const groundedTelemetry = {
        attempted: false,
        succeeded: false,
        failureCode: null,
        durationMs: null,
        fallbackAttempted: false,
        fallbackProvider: null,
        fallbackSucceeded: null,
        fallbackDurationMs: null,
        recovered: false,
      };
      if (!providerPromise) {
        providerPromise = (async () => {
          const rateLimiter = dependencies.rateLimiter || rateLimiterFactory(redis);
          const rateResult = await boundedRateLimit(rateLimiter, getClientIp(req), deadline, {
            stage: 'age-provider-rate-limit',
            maxMs: REDIS_CALL_BUDGET_MS,
            reserveMs: 400,
          });
          timings.rateLimitMs = rateResult.elapsedMs || 0;
          if (!rateResult.success) {
            const error = new Error('RATE_LIMIT');
            error.code = 'RATE_LIMIT';
            throw error;
          }
          budgetResult = await reserveBudget(redis, 'age', deadline, {
            stage: 'age-provider-global-budget',
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

          if (!useGrounded) {
            return deadline.run('age-provider-call', () => providerLookup(queryInfo, {
              deadline,
              maxMs: Math.min(providerBudgetMs, deadline.remainingMs(350)),
              reserveMs: 350,
              fetchImpl: dependencies.fetchImpl,
              apiKey: dependencies.apiKey,
            }), {
              maxMs: Math.min(providerBudgetMs, deadline.remainingMs(350)),
              reserveMs: 350,
            });
          }

          // Grounded path: bound the grounded attempt below the full provider
          // ceiling so a genuine reserve remains for a same-deadline,
          // same-budget-reservation ungrounded fallback if it times out.
          // Every other grounded failure (400/429/5xx/malformed/empty) is
          // already resolved inside callGeminiWithGroqFallback's existing
          // bounded Groq path before it can reach this catch block, so only
          // a genuine stage timeout is handled here -- this targets exactly
          // the demonstrated gap (grounded timeouts never got any fallback)
          // without duplicating already-working failure handling.
          groundedTelemetry.attempted = true;
          const groundedMaxMs = Math.min(groundedStageBudgetMs, deadline.remainingMs(350));
          const groundedStart = now();
          let groundedValue;
          try {
            groundedValue = await deadline.run('age-provider-call-grounded', () => groundedProviderLookup(queryInfo, {
              deadline,
              maxMs: groundedMaxMs,
              reserveMs: 350,
              fetchImpl: dependencies.fetchImpl,
              apiKey: dependencies.apiKey,
            }), {
              maxMs: groundedMaxMs,
              reserveMs: 350,
            });
          } catch (groundedError) {
            groundedTelemetry.durationMs = Math.max(0, now() - groundedStart);
            groundedTelemetry.failureCode = isTimeoutError(groundedError)
              ? 'STAGE_TIMEOUT'
              : (groundedError instanceof SmartLookupProviderError ? groundedError.code : 'PROVIDER_UNAVAILABLE');

            if (!isTimeoutError(groundedError)) throw groundedError;
            if (!deadline.hasTime(groundedFallbackMinRemainingMs, groundedFallbackReserveMs)) throw groundedError;

            groundedTelemetry.fallbackAttempted = true;
            const fallbackMaxMs = Math.min(providerBudgetMs, deadline.remainingMs(groundedFallbackReserveMs));
            const fallbackStart = now();
            try {
              const fallbackValue = await deadline.run('age-provider-call-fallback', () => providerLookup(queryInfo, {
                deadline,
                maxMs: fallbackMaxMs,
                reserveMs: groundedFallbackReserveMs,
                fetchImpl: dependencies.fetchImpl,
                apiKey: dependencies.apiKey,
              }), {
                maxMs: fallbackMaxMs,
                reserveMs: groundedFallbackReserveMs,
              });
              groundedTelemetry.fallbackDurationMs = Math.max(0, now() - fallbackStart);
              groundedTelemetry.fallbackSucceeded = true;
              groundedTelemetry.fallbackProvider = getSmartLookupProviderMetadata(fallbackValue).provider;
              groundedTelemetry.recovered = true;
              // Mark the shared resolved value itself (not just this
              // request's local groundedTelemetry) so a concurrent
              // "hitchhiker" request awaiting the same in-flight promise --
              // which never runs this branch itself -- still labels the
              // result as recovered instead of defaulting to false.
              if (fallbackValue && typeof fallbackValue === 'object') fallbackValue.__groundedFallbackRecovered = true;
              return fallbackValue;
            } catch (fallbackError) {
              groundedTelemetry.fallbackDurationMs = Math.max(0, now() - fallbackStart);
              groundedTelemetry.fallbackSucceeded = false;
              groundedTelemetry.fallbackProvider = fallbackError instanceof SmartLookupProviderError ? fallbackError.provider : null;
              // Preserve the original grounded timeout as the reported
              // error; the fallback attempt failing too still means "the
              // deadline could not produce a useful result."
              throw groundedError;
            }
          }

          groundedTelemetry.durationMs = Math.max(0, now() - groundedStart);
          const groundedMeta = getSmartLookupProviderMetadata(groundedValue);
          groundedTelemetry.succeeded = Boolean(groundedMeta.grounded)
            && Array.isArray(groundedMeta.groundedSources)
            && groundedMeta.groundedSources.length > 0;
          return groundedValue;
        })();
        inflightProviderRequests.set(cacheKey, providerPromise);
        providerPromise.finally(() => {
          if (inflightProviderRequests.get(cacheKey) === providerPromise) inflightProviderRequests.delete(cacheKey);
        }).catch(() => {});
      }

      try {
        // Ungrounded-only requests keep the existing providerBudgetMs
        // (6500ms) outer ceiling, sized for one provider call. A grounded
        // request's inner sequence -- rate limit, budget reserve, the
        // bounded grounded stage, and (on a grounded timeout) the bounded
        // same-deadline fallback -- is already self-limiting at each stage
        // via this same deadline, so the outer wait only needs to track the
        // true remaining route budget, not re-impose a shorter, single-call
        // sized ceiling on top of an already-bounded multi-stage sequence.
        // This never extends the total deadline: if the true 8500ms is
        // exhausted, the inner stages' own deadline.run calls (and this
        // outer wait, now watching the same remaining time) time out at
        // that same real boundary either way.
        const providerWaitMaxMs = useGrounded
          ? deadline.remainingMs(300)
          : Math.min(providerBudgetMs, deadline.remainingMs(300));
        rawProvider = await deadline.run('provider-result-wait', () => providerPromise, {
          maxMs: providerWaitMaxMs,
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
        // A grounded timeout that also attempted (and failed) a same-deadline
        // fallback made one additional real provider call beyond what
        // providerAttemptCountFromMetadata infers from the reported error
        // alone; account for it so daily attempt metrics are not undercounted.
        const actualAttempts = providerAttemptCountFromMetadata(null, errorCode) + (groundedTelemetry.fallbackAttempted ? 1 : 0);
        const attemptMetrics = actualAttempts
          ? await recordSharedProviderAttempts(providerPromise, recordAttempts, redis, 'age', actualAttempts, deadline, {
              stage: 'age-provider-attempt-metrics',
              maxMs: CACHE_WRITE_BUDGET_MS,
              now,
            })
          : { actualProviderAttemptCount: 0 };
        // PROVIDERS_UNAVAILABLE means the Groq fallback was actually attempted
        // (and also failed) before this error surfaced; every other code means
        // Groq was never reached, so fallbackUsed must stay false here.
        const result = finalizeTimings(createUnavailableSmartAgeResult(queryInfo, {
          source: 'fallback',
          evidenceSource: 'none',
          cacheStatus,
          providerAttempted: errorCode !== 'RATE_LIMIT' && errorCode !== 'GLOBAL_BUDGET_EXHAUSTED' && errorCode !== 'BUDGET_STORE_UNAVAILABLE',
          fallbackUsed: errorCode === 'PROVIDERS_UNAVAILABLE',
          timings,
          errorCode,
          notes: errorCode === 'RATE_LIMIT'
            ? 'Smart Lookup provider capacity is temporarily limited. Local and cached lookups remain available.'
            : (errorCode === 'GLOBAL_BUDGET_EXHAUSTED' || errorCode === 'BUDGET_STORE_UNAVAILABLE'
              ? 'Smart Lookup provider capacity is temporarily limited. Please try again tomorrow.'
              : undefined),
        }), timings, deadline);
        logResult(logger, requestId, queryInfo, result, {
          timeoutStage: isTimeoutError(error) ? 'provider' : null,
          budgetStatus: error.budgetResult?.status || budgetResult?.status || null,
          logicalLookupCount: error.budgetResult?.logicalLookupCount ?? budgetResult?.logicalLookupCount ?? null,
          actualProviderAttemptCount: attemptMetrics.actualProviderAttemptCount ?? actualAttempts,
          groundedTelemetry,
        });
        return res.status(errorCode === 'RATE_LIMIT' ? 429 : 200).json(result);
      }
      timings.providerMs = Math.max(0, now() - providerStart);

      const postStart = now();
      let result;
      let providerMetadata = null;
      try {
        // callGeminiAgeProvider already resolved through Gemini or its bounded
        // Groq fallback; read which one actually served this result instead
        // of assuming Gemini succeeded.
        providerMetadata = getSmartLookupProviderMetadata(rawProvider);
        const groundedWithSources = Boolean(providerMetadata.grounded)
          && Array.isArray(providerMetadata.groundedSources)
          && providerMetadata.groundedSources.length > 0;
        // Read the marker off the resolved value itself (not the local
        // groundedTelemetry object): a concurrent request that shared this
        // provider call without running the fallback branch itself still
        // needs to label the shared result correctly.
        const groundedFallbackRecovered = Boolean(rawProvider && rawProvider.__groundedFallbackRecovered);
        const providerOptions = {
          queryInfo,
          source: providerMetadata.provider,
          originSource: providerMetadata.provider,
          evidenceSource: providerMetadata.provider === 'groq'
            ? 'groq-ungrounded'
            : (groundedWithSources ? 'gemini-grounded' : 'gemini-ungrounded'),
          groundedSources: groundedWithSources ? providerMetadata.groundedSources : [],
          retrievedAt: groundedWithSources ? new Date().toISOString() : null,
          groundedFallback: groundedFallbackRecovered,
          cacheStatus,
          providerAttempted: true,
          fallbackUsed: providerMetadata.fallbackUsed,
          timings,
          currentYear,
        };
        const validatedProvider = normalizeSmartAgeResult(rawProvider, providerOptions);
        const hinted = applyEraHints(validatedProvider, queryInfo.normalizedQuery);
        result = normalizeSmartAgeResult(hinted, providerOptions);
      } catch (error) {
        timings.postProcessMs = Math.max(0, now() - postStart);
        const invalidAttempts = providerAttemptCountFromMetadata(providerMetadata) + (rawProvider && rawProvider.__groundedFallbackRecovered ? 1 : 0);
        const attemptMetrics = await recordSharedProviderAttempts(providerPromise, recordAttempts, redis, 'age', invalidAttempts, deadline, {
          stage: 'age-provider-attempt-metrics',
          maxMs: CACHE_WRITE_BUDGET_MS,
          now,
        });
        result = createUnavailableSmartAgeResult(queryInfo, {
          source: 'fallback',
          evidenceSource: 'none',
          cacheStatus,
          providerAttempted: true,
          fallbackUsed: Boolean(providerMetadata?.fallbackUsed),
          timings,
          errorCode: error?.code || 'INVALID_PROVIDER_RESULT',
        });
        finalizeTimings(result, timings, deadline);
        logResult(logger, requestId, queryInfo, result, {
          budgetStatus: budgetResult?.status || null,
          logicalLookupCount: budgetResult?.logicalLookupCount ?? null,
          actualProviderAttemptCount: attemptMetrics.actualProviderAttemptCount ?? invalidAttempts,
          groundedTelemetry,
        });
        return res.status(200).json(result);
      }
      timings.postProcessMs = Math.max(0, now() - postStart);
      // A recovered grounded-timeout result was served by the fallback call,
      // but the discarded grounded attempt was still one real provider call.
      const actualAttempts = providerAttemptCountFromMetadata(providerMetadata) + (rawProvider && rawProvider.__groundedFallbackRecovered ? 1 : 0);
      const attemptMetrics = await recordSharedProviderAttempts(providerPromise, recordAttempts, redis, 'age', actualAttempts, deadline, {
        stage: 'age-provider-attempt-metrics',
        maxMs: CACHE_WRITE_BUDGET_MS,
        now,
      });

      const ttlSeconds = chooseSmartAgeTtl(result);
      if (ttlSeconds > 0 && deadline.hasTime(50)) {
        const cachePayload = prepareResultForCache(result);
        boundedRedisSet(redis, cacheKey, cachePayload, ttlSeconds, deadline, {
          stage: 'age-cache-write',
          maxMs: CACHE_WRITE_BUDGET_MS,
        }).then((writeResult) => {
          timings.cacheWriteMs = writeResult.elapsedMs || 0;
        }).catch(() => {});
      }

      finalizeTimings(result, timings, deadline);
      logResult(logger, requestId, queryInfo, result, {
        budgetStatus: budgetResult?.status || null,
        logicalLookupCount: budgetResult?.logicalLookupCount ?? null,
        actualProviderAttemptCount: attemptMetrics.actualProviderAttemptCount ?? actualAttempts,
        groundedTelemetry,
      });
      return res.status(200).json(result);
    } catch (error) {
      const result = finalizeTimings(createUnavailableSmartAgeResult(queryInfo, {
        source: 'fallback',
        evidenceSource: 'none',
        cacheStatus,
        providerAttempted: false,
        timings,
        errorCode: isTimeoutError(error) ? 'TOTAL_DEADLINE' : 'INTERNAL_ERROR',
      }), timings, deadline);
      logResult(logger, requestId, queryInfo, result, { timeoutStage: isTimeoutError(error) ? error.stage || 'unknown' : null });
      return res.status(200).json(result);
    }
  };
}

export default createAgeLookupHandler();
