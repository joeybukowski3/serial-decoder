import { buildSmartLkqCacheKey, chooseSmartLkqTtl, hashCanonicalQuery, prepareReplacementForCache } from '../lib/smart-lookup/cache.js';
import { providerAttemptCountFromMetadata, recordProviderAttemptMetrics, reserveProviderBudget } from '../lib/smart-lookup/budget.js';
import { createDeadline, isTimeoutError } from '../lib/smart-lookup/deadline.js';
import { classifySmartLookupQuery, deriveReplacementPrecision, normalizeKnownQuery, normalizeSmartLookupNotes, normalizeWhitespace, SMART_LOOKUP_NOTES_MAX_LENGTH } from '../lib/smart-lookup/normalize.js';
import { buildDeterministicReplacementResult } from '../lib/smart-lookup/replacement-static-results.js';
import {
  callGeminiLkqProvider,
  callSmartLookupGroundedLkqProvider,
  getSmartLookupProviderMetadata,
  isGroundedLkqEnabled,
  SmartLookupProviderError,
} from '../lib/smart-lookup/provider.js';
import {
  createReplacementTimings,
  createUnavailableReplacementResult,
  normalizeCachedReplacementResult,
  normalizeDeterministicReplacementResult,
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
// Grounded LKQ research covers more ground per call than grounded age
// research (original identity + replacement identity + compatibility +
// pricing in one pass), so its stage ceiling is measured and set higher
// than age's 4200ms -- see docs/smart-lookup-architecture.md for the full
// measurement notes. It is still bounded below PROVIDER_BUDGET_MS so a
// genuine reserve remains for a same-deadline fallback on timeout.
const GROUNDED_LKQ_STAGE_BUDGET_MS = 5000;
const GROUNDED_LKQ_FALLBACK_MIN_REMAINING_MS = 1500;
const GROUNDED_LKQ_FALLBACK_RESERVE_MS = 300;

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
  const grounded = extra.groundedTelemetry || {};
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
    lkqRequested: true,
    lkqGroundedAttempted: grounded.attempted || false,
    lkqGroundedSucceeded: grounded.succeeded || false,
    lkqGroundedSourceCount: Array.isArray(result?.sources) ? result.sources.length : 0,
    lkqGroundedDurationMs: grounded.durationMs ?? null,
    lkqFallbackAttempted: grounded.fallbackAttempted || false,
    lkqFallbackProvider: grounded.fallbackProvider || null,
    lkqFallbackSucceeded: grounded.fallbackSucceeded ?? null,
    lkqFallbackDurationMs: grounded.fallbackDurationMs ?? null,
    replacementRelationship: result?.replacementRelationship || null,
    compatibilityStatus: result?.compatibilityStatus || null,
    priceObservationCount: Array.isArray(result?.priceObservations) ? result.priceObservations.length : 0,
    priceRangeProduced: Boolean(result?.replacementCostRange),
    // Progressive-LKQ telemetry (Phase 11, additive). Privacy-safe by
    // construction: counts and enum-valued summaries only, never raw query
    // text, notes, model numbers, serial/service-tag content, provider
    // payloads, or candidate descriptions.
    replacementPrecision: result?.replacementPrecision || null,
    originalIdentityLevel: result?.originalIdentityLevel || null,
    candidateCount: Array.isArray(result?.replacementCandidates) ? result.replacementCandidates.length : 0,
    sameBrandCandidateCount: Array.isArray(result?.replacementCandidates)
      ? result.replacementCandidates.filter((candidate) => candidate.brand
        && queryInfo.brand
        && String(candidate.brand).toLowerCase() === String(queryInfo.brand).toLowerCase()).length
      : 0,
    crossBrandCandidateCount: Array.isArray(result?.replacementCandidates)
      ? result.replacementCandidates.filter((candidate) => candidate.brand
        && queryInfo.brand
        && String(candidate.brand).toLowerCase() !== String(queryInfo.brand).toLowerCase()).length
      : 0,
    configurationUnknown: Boolean(result?.configurationUnknown),
    deterministicFallbackUsed: Boolean(result?.deterministicFallbackUsed),
    refinementNeeded: Boolean(result?.refinementNeeded),
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
  const groundedProviderLookup = dependencies.groundedProviderLookup || callSmartLookupGroundedLkqProvider;
  const groundedEnabled = dependencies.groundedEnabled ?? isGroundedLkqEnabled(dependencies.env);
  const reserveBudget = dependencies.reserveProviderBudget || reserveProviderBudget;
  const recordAttempts = dependencies.recordProviderAttemptMetrics || recordProviderAttemptMetrics;
  const limiterFactory = dependencies.rateLimiterFactory || ((redis) => createProviderRateLimiter(redis, {
    requests: 10, window: '1 m', prefix: 'smart-lkq-provider-v2',
  }));
  const logger = dependencies.logger || console;
  const now = dependencies.now || Date.now;
  const providerBudgetMs = dependencies.providerBudgetMs || PROVIDER_BUDGET_MS;
  const groundedStageBudgetMs = dependencies.groundedStageBudgetMs || GROUNDED_LKQ_STAGE_BUDGET_MS;
  const groundedFallbackMinRemainingMs = dependencies.groundedFallbackMinRemainingMs || GROUNDED_LKQ_FALLBACK_MIN_REMAINING_MS;
  const groundedFallbackReserveMs = dependencies.groundedFallbackReserveMs || GROUNDED_LKQ_FALLBACK_RESERVE_MS;
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
    const baseQueryInfo = {
      ...classifySmartLookupQuery(validation.value.query),
      userNotes: validation.value.notes,
      notesHash: validation.value.notes ? hashCanonicalQuery(validation.value.notes) : '',
    };
    const queryInfo = {
      ...baseQueryInfo,
      // Notes can upgrade exact-model to exact-configuration once notes are
      // attached; classifySmartLookupQuery itself has no notes to consult.
      replacementPrecision: deriveReplacementPrecision(baseQueryInfo, validation.value.notes),
    };
    // Grounded research is selective: exact-model queries always qualify
    // (real-world retailer/manufacturer pages are likely to exist), and --
    // as of the progressive-LKQ work -- so do model-line queries and
    // high-confidence product-family queries (`lkqGroundedEligible`,
    // computed in normalize.js). A bare category, weak free-form
    // description, brand-only match, or low-confidence family stays on the
    // closed-book path, where the overclaim guard in
    // buildLkqProviderPrompt/replacement-schema prevents it from naming one
    // arbitrary product as THE family/category successor -- see Phase 4 in
    // docs/smart-lookup-architecture.md.
    const useGrounded = groundedEnabled
      && queryInfo.providerEligible
      && queryInfo.lkqGroundedEligible;

    // A recognized model-line/product-family/brand-category query always
    // has a safe, instant, deterministic replacement card in reserve (Phase
    // 8 -- see docs/smart-lookup-architecture.md "Progressive LKQ
    // degradation"): built once here (cheap, no I/O, no provider budget)
    // and substituted at every provider failure point below instead of the
    // generic "temporarily unavailable" response, so a recognized query
    // never renders an empty replacement panel purely because grounded or
    // ungrounded provider research failed. Never itself written to cache
    // (each substitution re-normalizes with fresh timings) and never
    // labeled grounded or AI-assisted.
    const deterministicFallbackRaw = buildDeterministicReplacementResult(queryInfo);
    // `substituted` carries the failure this card is standing in for, so a
    // deterministic result still reports its errorCode (telemetry attribution
    // and browser retry-gating both depend on distinguishing a substituted
    // timeout from a query that never attempted research).
    const buildDeterministicFallback = (substituted = null) => {
      if (!deterministicFallbackRaw) return null;
      const code = substituted?.errorCode;
      // A capacity failure still has actionable timing guidance that the
      // deterministic card must not swallow: the user needs both what we
      // recognized AND when replacement research can be retried.
      const capacityNote = code === 'RATE_LIMIT'
        ? 'Replacement provider capacity is temporarily limited. The age result remains available.'
        : ((code === 'GLOBAL_BUDGET_EXHAUSTED' || code === 'BUDGET_STORE_UNAVAILABLE')
          ? 'Replacement research capacity is temporarily limited. Please try again tomorrow.'
          : null);
      const raw = capacityNote
        ? {
            ...deterministicFallbackRaw,
            successorStatus: {
              ...deterministicFallbackRaw.successorStatus,
              explanation: [deterministicFallbackRaw.successorStatus?.explanation, capacityNote].filter(Boolean).join(' '),
            },
          }
        : deterministicFallbackRaw;
      return finish(normalizeDeterministicReplacementResult(raw, queryInfo, timings, substituted || {}), timings, deadline);
    };

    const redis = dependencies.redis || redisFactory();
    const cacheKey = buildSmartLkqCacheKey(queryInfo, { grounded: useGrounded });
    let cacheStatus = 'bypass';

    // A query with no recognizable product signal never reaches the
    // provider -- mirrors the age-lookup unusable short-circuit. A missing
    // age result must never be the reason replacement research looks like
    // it "found nothing"; this keeps both routes consistent about what
    // "nothing to work with" means.
    if (queryInfo.querySpecificity === 'unusable') {
      const result = finish(createUnavailableReplacementResult(queryInfo, {
        cacheStatus: 'bypass',
        providerAttempted: false,
        message: "We couldn't identify a physical product from this search.",
      }), timings, deadline);
      logLkqResult(logger, requestId, queryInfo, result);
      return res.status(200).json(result);
    }

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

          if (!useGrounded) {
            return deadline.run('lkq-provider-call', () => providerLookup(queryInfo, {
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

          // Grounded path: bound the grounded attempt below the full
          // provider ceiling so a genuine reserve remains for a same-
          // deadline, same-budget-reservation ungrounded fallback if it
          // times out. This mirrors the age-lookup grounded-timeout-fallback
          // design exactly, including the fix for the outer-wait ceiling
          // below -- see docs/smart-lookup-architecture.md.
          groundedTelemetry.attempted = true;
          const groundedMaxMs = Math.min(groundedStageBudgetMs, deadline.remainingMs(350));
          const groundedStart = now();
          let groundedValue;
          try {
            groundedValue = await deadline.run('lkq-provider-call-grounded', () => groundedProviderLookup(queryInfo, {
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

            // Only a bounded stage timeout gets a same-deadline fallback
            // here; every other grounded failure (400/429/5xx/malformed/
            // empty) is already resolved inside callGeminiWithGroqFallback's
            // existing bounded Groq path before it can reach this scope.
            if (!isTimeoutError(groundedError)) throw groundedError;
            if (!deadline.hasTime(groundedFallbackMinRemainingMs, groundedFallbackReserveMs)) throw groundedError;

            groundedTelemetry.fallbackAttempted = true;
            const fallbackMaxMs = Math.min(providerBudgetMs, deadline.remainingMs(groundedFallbackReserveMs));
            const fallbackStart = now();
            try {
              const fallbackValue = await deadline.run('lkq-provider-call-fallback', () => providerLookup(queryInfo, {
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
        inflightReplacementRequests.set(cacheKey, providerPromise);
        providerPromise.finally(() => {
          if (inflightReplacementRequests.get(cacheKey) === providerPromise) inflightReplacementRequests.delete(cacheKey);
        }).catch(() => {});
      }

      let raw;
      try {
        // Ungrounded-only requests keep the existing providerBudgetMs
        // outer ceiling, sized for one provider call. A grounded request's
        // inner sequence (rate limit, budget reserve, the bounded grounded
        // stage, and on a grounded timeout the bounded same-deadline
        // fallback) is already self-limiting at each stage via this same
        // deadline, so the outer wait only needs to track the true
        // remaining route budget, not re-impose a shorter, single-call
        // sized ceiling on top of an already-bounded multi-stage sequence.
        const providerWaitMaxMs = useGrounded
          ? deadline.remainingMs(300)
          : Math.min(providerBudgetMs, deadline.remainingMs(300));
        raw = await deadline.run('lkq-provider-result-wait', () => providerPromise, {
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
          ? await recordSharedProviderAttempts(providerPromise, recordAttempts, redis, 'lkq', actualAttempts, deadline, {
              stage: 'lkq-provider-attempt-metrics',
              maxMs: CACHE_WRITE_BUDGET_MS,
              now,
            })
          : { actualProviderAttemptCount: 0 };
        // PROVIDERS_UNAVAILABLE means the Groq fallback was actually attempted
        // (and also failed); every other code means Groq was never reached.
        // A recognized model-line/family/brand-category query degrades to
        // the deterministic fallback instead of the generic "temporarily
        // unavailable" message -- the deterministic path makes no provider
        // or Redis call, so it is always safe here regardless of which
        // failure occurred (Phase 8).
        const providerWasAttempted = errorCode !== 'RATE_LIMIT'
          && errorCode !== 'GLOBAL_BUDGET_EXHAUSTED'
          && errorCode !== 'BUDGET_STORE_UNAVAILABLE';
        const result = buildDeterministicFallback({
          errorCode,
          cacheStatus,
          providerAttempted: providerWasAttempted,
        }) || finish(createUnavailableReplacementResult(queryInfo, {
          cacheStatus,
          providerAttempted: providerWasAttempted,
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
          groundedTelemetry,
          errorCode,
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
        // Read the recovery marker off the resolved value itself (not the
        // local groundedTelemetry object): a concurrent request that shared
        // this provider call without running the fallback branch itself
        // still needs to label the shared result correctly.
        const groundedFallbackRecovered = Boolean(raw && raw.__groundedFallbackRecovered);
        const groundedWithMetadata = Boolean(providerMetadata.grounded)
          && Array.isArray(providerMetadata.groundedSources)
          && providerMetadata.groundedSources.length > 0;
        result = normalizeReplacementResult(raw, {
          queryInfo,
          source: providerMetadata.provider,
          originSource: providerMetadata.provider,
          evidenceSource: providerMetadata.provider === 'groq'
            ? 'groq-ungrounded'
            : (groundedWithMetadata ? 'grounded' : 'gemini-ungrounded'),
          sources: groundedWithMetadata ? providerMetadata.groundedSources : [],
          retrievedAt: groundedWithMetadata ? new Date().toISOString() : null,
          groundedFallback: groundedFallbackRecovered,
          cacheStatus,
          providerAttempted: true,
          fallbackUsed: providerMetadata.fallbackUsed,
          timings,
        });
      } catch (error) {
        timings.postProcessMs = Math.max(0, now() - postStart);
        const invalidAttempts = providerAttemptCountFromMetadata(providerMetadata) + (raw && raw.__groundedFallbackRecovered ? 1 : 0);
        const attemptMetrics = await recordSharedProviderAttempts(providerPromise, recordAttempts, redis, 'lkq', invalidAttempts, deadline, {
          stage: 'lkq-provider-attempt-metrics',
          maxMs: CACHE_WRITE_BUDGET_MS,
          now,
        });
        result = buildDeterministicFallback({
          errorCode: error?.code || 'INVALID_PROVIDER_RESULT',
          cacheStatus,
          providerAttempted: true,
        }) || finish(createUnavailableReplacementResult(queryInfo, {
          cacheStatus, providerAttempted: true, fallbackUsed: getSmartLookupProviderMetadata(raw).fallbackUsed,
          errorCode: error?.code || 'INVALID_PROVIDER_RESULT', timings,
        }), timings, deadline);
        logLkqResult(logger, requestId, queryInfo, result, {
          budgetStatus: budgetResult?.status || null,
          logicalLookupCount: budgetResult?.logicalLookupCount ?? null,
          actualProviderAttemptCount: attemptMetrics.actualProviderAttemptCount ?? invalidAttempts,
          groundedTelemetry,
          errorCode: error?.code || 'INVALID_PROVIDER_RESULT',
        });
        return res.status(200).json(result);
      }
      timings.postProcessMs = Math.max(0, now() - postStart);
      // A recovered grounded-timeout result was served by the fallback call,
      // but the discarded grounded attempt was still one real provider call.
      const actualAttempts = providerAttemptCountFromMetadata(providerMetadata) + (raw && raw.__groundedFallbackRecovered ? 1 : 0);
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
        groundedTelemetry,
      });
      return res.status(200).json(result);
    } catch (error) {
      const errorCode = isTimeoutError(error) ? 'TOTAL_DEADLINE' : 'INTERNAL_ERROR';
      const result = buildDeterministicFallback({ errorCode, cacheStatus }) || finish(createUnavailableReplacementResult(queryInfo, {
        cacheStatus,
        errorCode,
        timings,
      }), timings, deadline);
      logLkqResult(logger, requestId, queryInfo, result, {
        timeoutStage: isTimeoutError(error) ? error.stage || 'unknown' : null,
        errorCode,
      });
      return res.status(200).json(result);
    }
  };
}

export default createLkqLookupHandler();
