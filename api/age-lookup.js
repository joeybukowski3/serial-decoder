import { buildSmartAgeCacheKey, chooseSmartAgeTtl, hashCanonicalQuery, prepareResultForCache } from '../lib/smart-lookup/cache.js';
import { providerAttemptCountFromMetadata, recordProviderAttemptMetrics, reserveProviderBudget } from '../lib/smart-lookup/budget.js';
import { sharedEvidenceToSmartLookupInput } from '../lib/model-evidence/adapters.js';
import { lookupModelEvidence } from '../lib/model-evidence/service.js';
import { createDeadline, isTimeoutError } from '../lib/smart-lookup/deadline.js';
import { applyEraHints, decodeHvacSerial, findLocalModelAgeResult, findVerifiedExactEvidenceRecord } from '../lib/smart-lookup/age-legacy.js';
import { classifySmartLookupQuery, getVerifiedModelKey, normalizeSmartLookupNotes, normalizeWhitespace, SMART_LOOKUP_NOTES_MAX_LENGTH } from '../lib/smart-lookup/normalize.js';
import {
  callGeminiAgeProvider,
  callSmartLookupGroundedAgeProvider,
  getSmartLookupProviderMetadata,
  isGroundedAgeEnabled,
  SmartLookupProviderError,
} from '../lib/smart-lookup/provider.js';
import {
  callSmartLookupOpenAiAgeProvider,
  isOpenAiSmartLookupEnabled,
  DEFAULT_OPENAI_STAGE_MAX_MS,
} from '../lib/smart-lookup/openai-provider.js';
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
import { buildDeterministicBroadResult, buildExactModelReserveResult } from '../lib/smart-lookup/static-results.js';
import { createRequestId, logSmartLookup } from '../lib/smart-lookup/telemetry.js';

const TOTAL_BUDGET_MS = 32000;
// OpenAI-primary budgets, set from measured live preview latency rather than
// guessed: OpenAI web research took 8.7s (Nintendo Switch 2), 8.8s (Sony
// X90L), 9.3s (LG WM3900HWA), 12.9s and 15.6s (the two Miele H4080BM
// phrasings). A 5s stage timed out 100% of the time, so 13s covers the
// measured median and most of the tail while still leaving a real xAI
// window -- the thing the old grounded Gemini stage never did. Live xAI
// Preview validation with grok-4.3 web_search took ~13.5-15.8s for useful
// forced-fallback results, so the route budget must reserve a materially
// larger fallback window than the earlier 2.5s Groq placeholder.
//
// NOTE: this exceeds the original ~8.1s route target. That target predates
// the measurement and is not achievable with web-search research; the old
// 8.1s path returned nothing at all. See the PR discussion.
const OPENAI_STAGE_BUDGET_MS = DEFAULT_OPENAI_STAGE_MAX_MS;
const XAI_FALLBACK_MAX_MS = 18000;
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
    allowSerialEvidence: Boolean(options.allowSerialEvidence),
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
    routeType: 'age',
    identityLevel: queryInfo?.querySpecificity || null,
    providerEligible: queryInfo?.providerEligible,
    groundedEligible: queryInfo?.groundedEligible,
    localEvidenceHit: result?.source === 'local-db' || result?.source === 'decoder-verified',
    remainingMsAfterGrounded: extra.remainingMsAfterGrounded ?? grounded.remainingMsAfterGrounded ?? null,
    inFlightShared: extra.inFlightShared ?? null,
    deterministicFallbackUsed: typeof result?.fallbackKind === 'string'
      ? result.fallbackKind.startsWith('deterministic-')
      : null,
    resultEvidenceType: result?.evidenceSource || null,
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
  // OpenAI (Responses API + web_search) is the primary research provider when
  // enabled. It fully replaces the Gemini stages for the active sequence --
  // see the openAiEnabled branch below for why Gemini is not chained after it.
  const openAiProviderLookup = dependencies.openAiProviderLookup || callSmartLookupOpenAiAgeProvider;
  const modelEvidenceLookup = dependencies.modelEvidenceLookup || lookupModelEvidence;
  const sharedExactEnabled = dependencies.sharedExactEnabled
    ?? ['1', 'true', 'yes', 'on'].includes(
      String((dependencies.env || process.env).SMART_LOOKUP_SHARED_MODEL_EVIDENCE_ENABLED || '')
        .trim()
        .toLowerCase(),
    );
  const openAiEnabled = dependencies.openAiEnabled
    ?? (isOpenAiSmartLookupEnabled(dependencies.env || process.env)
      && Boolean((dependencies.env || process.env).OPENAI_API_KEY));
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

    // A recognized product-family/model-line/brand-category query always
    // has a safe, instant, deterministic answer ready as a fallback --
    // built once here and re-normalized (cheap, no I/O) with fresh timings
    // at whichever point below actually uses it. This is what lets a
    // grounded-research timeout degrade to a useful card instead of an
    // empty result, for any of the three deterministic-eligible tiers.
    const hasDeterministicFallback = Boolean(queryInfo.productFamily) || queryInfo.querySpecificity === 'brand-category';
    const deterministicFallbackRaw = hasDeterministicFallback ? buildDeterministicBroadResult(queryInfo) : null;
    // "Local deterministic results still win when they are stronger."
    // A registry/seed-backed family card that already carries a
    // high-confidence production range (e.g. Samsung Q60 Series 2019-2024,
    // LG C3) is a better answer than anything research would add, and
    // researching it would both spend paid provider budget and risk a weaker
    // model-authored range displacing verified local evidence. Only weak
    // deterministic cards (the low-confidence brand-category "we recognized
    // the brand, now give us a model number" shape) fall through to research.
    const deterministicIsStrong = deterministicFallbackRaw?.yearContext?.confidence === 'high';
    const buildDeterministicFallback = () => (deterministicFallbackRaw
      ? normalizeLegacyResult(deterministicFallbackRaw, queryInfo, {
          source: 'static', evidenceSource: 'heuristic', timings, currentYear,
        })
      : null);
    // Which deterministic evidence kind backs this query's fallback, used
    // ONLY when actually substituting for a failed/timed-out provider
    // attempt below (never on the always-fast path) -- see the
    // FALLBACK_KINDS comment in result-schema.js for why this must never be
    // confused with groundedFallback (reserved for real AI recovery).
    const deterministicFallbackKind = queryInfo.querySpecificity === 'model-line'
      ? 'deterministic-model-line'
      : (queryInfo.querySpecificity === 'exact-model'
        ? 'deterministic-exact-model'
        : (queryInfo.querySpecificity === 'brand-category' ? 'deterministic-brand-category' : 'deterministic-family'));
    // An exact-model query previously had no reserve at all, so a research
    // timeout returned an empty result for a fully identified product. This
    // reserve is intentionally kept OUT of deterministicFallbackRaw: that
    // value drives two fast paths above/below, and feeding it an exact-model
    // card would answer every exact-model query without ever consulting the
    // local model database or the provider. It is only ever substituted here,
    // after a provider attempt has actually failed.
    const exactModelReserveRaw = queryInfo.querySpecificity === 'exact-model'
      ? buildExactModelReserveResult(queryInfo)
      : null;
    // `substitutedErrorCode` keeps the failure this card stands in for visible
    // on the response, so telemetry attribution and retry-gating can still tell
    // a substituted timeout/budget/outage from a query that never attempted
    // research at all. It never changes what the card claims.
    // A broad deterministic card (partial-model or category-only) for a
    // research-eligible query. Previously this card was *returned* outright,
    // which is what dead-ended a bare model token like "H4080BM" into
    // "brand: Unknown / enter the complete model number" without any
    // research attempt. It is now assigned below and held here purely as a
    // last-resort reserve, on the same substitution path as every other
    // deterministic reserve. Declared with `let` because it is computed
    // later in the flow than this closure is defined; the closure is only
    // ever invoked after that assignment has happened.
    let broadReserveRaw = null;
    const degradeToDeterministicFallback = (substitutedErrorCode = null) => {
      const raw = deterministicFallbackRaw || exactModelReserveRaw || broadReserveRaw;
      if (!raw) return null;
      // The broad reserve is not tier-specific, so it reports its own kind
      // rather than borrowing the tier-derived one.
      const fallbackKind = (!deterministicFallbackRaw && !exactModelReserveRaw && broadReserveRaw)
        ? 'deterministic-broad'
        : deterministicFallbackKind;
      const fallback = normalizeLegacyResult(raw, queryInfo, {
        source: 'static', evidenceSource: 'heuristic', timings, currentYear,
      });
      // A capacity failure still has actionable timing guidance ("try again
      // tomorrow") that the deterministic card must not swallow: the user
      // needs both what we recognized AND when research can be retried.
      const capacityNote = substitutedErrorCode === 'RATE_LIMIT'
        ? 'Smart Lookup provider capacity is temporarily limited. Local and cached lookups remain available.'
        : ((substitutedErrorCode === 'GLOBAL_BUDGET_EXHAUSTED' || substitutedErrorCode === 'BUDGET_STORE_UNAVAILABLE')
          ? 'Smart Lookup provider capacity is temporarily limited. Please try again tomorrow.'
          : null);
      return {
        ...fallback,
        fallbackKind,
        groundedFallback: false,
        errorCode: substitutedErrorCode || fallback.errorCode || null,
        notes: [fallback.notes, capacityNote].filter(Boolean).join(' '),
      };
    };

    try {
      // A query with no recognizable product signal at all (empty,
      // keyboard-mash, pure noise) gets a deterministic clarification and
      // never reaches the provider.
      if (queryInfo.querySpecificity === 'unusable') {
        const result = finalizeTimings(normalizeLegacyResult(buildDeterministicBroadResult(queryInfo), queryInfo, {
          source: 'static', evidenceSource: 'heuristic', timings, currentYear,
        }), timings, deadline);
        logResult(logger, requestId, queryInfo, result);
        return res.status(200).json(result);
      }

      // A recognized product-family/brand-category query must stay
      // classified as such. In particular, do not let a short legacy alias
      // such as "C3" promote the request to one arbitrary screen-size model
      // from the local database. When grounded research is not enabled or
      // not eligible for this specificity tier, this deterministic result
      // IS the answer -- same fast, safe behavior as before this change,
      // and fallbackKind stays 'none' (this was never a degraded result).
      // Otherwise, fall through to attempt research within the same route
      // deadline, with this result held in reserve as the fallback for any
      // failure/timeout.
      //
      // Deliberately gated on `researchEligible` and NOT on `groundedEnabled`:
      // whether live web grounding is configured decides *how* the provider
      // is called, never *whether* a query with real product signal is
      // allowed to be researched at all. Coupling the two meant that with
      // SMART_LOOKUP_GROUNDED_AGE unset (its default), every brand-category
      // query -- "Nintendo Switch 2" included -- returned a clarification
      // card without any provider attempt. Closed-book research is still far
      // more useful than "enter a complete model number", and it degrades
      // back to exactly this reserve on any failure.
      if (deterministicFallbackRaw && (!queryInfo.researchEligible || deterministicIsStrong)) {
        const result = finalizeTimings(buildDeterministicFallback(), timings, deadline);
        logResult(logger, requestId, queryInfo, result);
        return res.status(200).json(result);
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
        // A UNIQUE verified exact-evidence hit (canonical model or a verified
        // exactAlias) is the strongest identity signal available, and it is
        // strictly stronger than the text-shape classification that ran before
        // the database was consulted. Promote the query to exact-model so the
        // result is not stripped back to a partial/brand-only shape -- without
        // this, `normalizeSmartAgeResult` discards the production range for a
        // bare model number, which is why "GFW850SPN0DG" returned no range.
        //
        // This is NOT prefix or family inference: it fires only on strict
        // equality against a verified record (see
        // lib/model-evidence/exact-model-match.js), so "GFW850", "WM3900", or
        // "Q60" can never reach it.
        let localQueryInfo = queryInfo;
        const recordBrand = localResult.brand && localResult.brand !== 'Unknown' ? localResult.brand : '';
        const recordCategory = localResult.category || localResult.itemCategory || '';
        // A brand or category the user actually supplied is never overwritten
        // by the record; a conflict is surfaced instead of silently corrected.
        const brandConflict = Boolean(queryInfo.brand && recordBrand
          && queryInfo.brand.toLowerCase() !== recordBrand.toLowerCase());
        const categoryConflict = Boolean(queryInfo.genericCategory && recordCategory
          && queryInfo.genericCategory.toLowerCase() !== recordCategory.toLowerCase());
        const evidenceConflict = brandConflict || categoryConflict;

        if (localResult.verifiedExact && !evidenceConflict && recordBrand && recordCategory) {
          localQueryInfo = {
            ...queryInfo,
            brand: queryInfo.brand || recordBrand,
            genericCategory: queryInfo.genericCategory || recordCategory,
            productType: queryInfo.productType || recordCategory,
            specificityLevel: 'specific',
            querySpecificity: 'exact-model',
            exactModel: localResult.canonicalModel || queryInfo.exactModel,
            modelCompleteness: 'exact',
            providerEligible: false,
            recognizedBrand: queryInfo.brand || recordBrand,
            recognizedCategory: queryInfo.genericCategory || recordCategory,
          };
        }

        const result = finalizeTimings(normalizeLegacyResult(localResult, localQueryInfo, {
          source: 'local-db',
          evidenceSource: 'local-db',
          timings,
          currentYear,
        }), timings, deadline);
        // Diagnostics that let the browser show the entered value alongside the
        // canonical model instead of appearing to silently rewrite the input.
        result.enteredModel = localResult.enteredModel || null;
        result.canonicalModel = localResult.canonicalModel || null;
        result.matchedBy = localResult.matchedBy || null;
        result.localEvidenceHit = true;
        result.evidenceConflict = evidenceConflict || false;
        if (evidenceConflict) {
          result.evidenceConflictKind = brandConflict ? 'brand' : 'category';
          result.refinementNeeded = true;
        }
        logResult(logger, requestId, localQueryInfo, result);
        return res.status(200).json(result);
      }

      // No brand-scoped local hit, but the user supplied a brand: check whether
      // the model is a verified exact match for a DIFFERENT brand. Researching
      // a contradictory identity would waste a paid call and could return a
      // confident answer for a product that does not exist. The user's brand is
      // preserved and the conflict is disclosed rather than silently corrected.
      if (queryInfo.brand) {
        let conflictEvidence = null;
        try {
          conflictEvidence = await deadline.run('local-evidence-conflict-check', () => findVerifiedExactEvidenceRecord(queryInfo.query), {
            maxMs: 300, reserveMs: 700,
          });
        } catch (_) { conflictEvidence = null; }
        const conflictBrand = conflictEvidence?.record?.brand || '';
        if (conflictBrand && conflictBrand.toLowerCase() !== queryInfo.brand.toLowerCase()) {
          const result = finalizeTimings(normalizeLegacyResult({
            brand: queryInfo.brand,
            model: conflictEvidence.enteredModel || queryInfo.modelIdentity || null,
            itemCategory: null,
            category: null,
            specificityLevel: 'partial',
            refinementSuggestion: `Confirm the brand on the product label. This model number matches a verified ${conflictBrand} record.`,
            notes: `The entered brand (${queryInfo.brand}) does not match the brand on the verified record for this model number (${conflictBrand}). No age estimate is given, because the brand and model number describe different products. The entered values were not changed.`,
            evidence: [{
              detail: `Model number matches a verified ${conflictBrand} record, which conflicts with the entered brand.`,
              source: 'Decode My Item verified local model evidence',
            }],
          }, queryInfo, {
            source: 'static', evidenceSource: 'heuristic', timings, currentYear,
          }), timings, deadline);
          result.evidenceConflict = true;
          result.evidenceConflictKind = 'brand';
          result.refinementNeeded = true;
          result.localEvidenceHit = false;
          logResult(logger, requestId, queryInfo, result);
          return res.status(200).json(result);
        }
      }

      const hvacQuick = decodeHvacSerial(queryInfo.query, queryInfo.normalizedQuery, queryInfo, { currentYear });
      if (hvacQuick) {
        const result = finalizeTimings(normalizeLegacyResult(hvacQuick, queryInfo, {
          source: 'static',
          evidenceSource: 'heuristic',
          timings,
          currentYear,
          allowSerialEvidence: true,
        }), timings, deadline);
        logResult(logger, requestId, queryInfo, result);
        return res.status(200).json(result);
      }

      // Skip this for a product-family/model-line/brand-category query that
      // reached here on purpose (grounding is enabled and eligible -- see
      // the branch above): buildDeterministicBroadResult would just rebuild
      // the same deterministicFallbackRaw and short-circuit, defeating the
      // whole point of continuing on to attempt grounded research below.
      const broadResult = deterministicFallbackRaw ? null : buildDeterministicBroadResult(queryInfo);
      // Hold the broad card in reserve rather than returning it when the
      // query still deserves research -- see broadReserveRaw above.
      if (broadResult && queryInfo.researchEligible) {
        broadReserveRaw = broadResult;
      } else if (broadResult) {
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
      // Grounded research covers exact-model queries (as before) plus
      // model-line and product-family queries when grounding is enabled and
      // eligible for this specificity tier -- see queryInfo.groundedEligible.
      const useGrounded = groundedEnabled
        && queryInfo.providerEligible
        && queryInfo.groundedEligible;
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
        // These are two different failures and must not share a message: a
        // query that is not provider-eligible genuinely lacks product signal
        // (insufficient detail), but a provider-eligible query that simply
        // ran out of route deadline before research could start is a system
        // timing issue, not a user-input issue -- misreporting it as
        // "insufficient detail" tells the user to add information that would
        // not have helped.
        const deadlineExhausted = queryInfo.providerEligible && !deadline.hasTime(900, 300);
        const preProviderErrorCode = deadlineExhausted ? 'TOTAL_DEADLINE' : 'INSUFFICIENT_QUERY_DETAIL';
        const degraded = degradeToDeterministicFallback(preProviderErrorCode);
        const result = finalizeTimings(degraded
          || createUnavailableSmartAgeResult(queryInfo, {
              source: 'fallback',
              evidenceSource: 'none',
              cacheStatus,
              providerAttempted: false,
              timings,
              errorCode: preProviderErrorCode,
              notes: deadlineExhausted
                ? 'Smart Lookup ran out of time to research this before responding. Please try again.'
                : undefined,
            }), timings, deadline);
        logResult(logger, requestId, queryInfo, result);
        return res.status(200).json(result);
      }

      const providerStart = now();
      let rawProvider;
      let providerPromise = inflightProviderRequests.get(cacheKey);
      // True when this request attached to an already-running provider
      // call instead of starting one. Distinguishes "slow provider" from
      // "waited behind someone else's slow provider" in latency analysis.
      const inFlightShared = Boolean(providerPromise);
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

          if (sharedExactEnabled
            && queryInfo.querySpecificity === 'exact-model'
            && queryInfo.brand
            && (queryInfo.exactModel || queryInfo.modelIdentity || queryInfo.model)
            && deadline.hasTime(500)) {
            const sharedEvidence = await modelEvidenceLookup({
              brand: queryInfo.brand,
              model: queryInfo.exactModel || queryInfo.modelIdentity || queryInfo.model,
              category: queryInfo.genericCategory || queryInfo.productType || null,
              purpose: 'smart_lookup',
              deadline,
              requestContext: {
                consumer: 'smart_lookup',
                requestId,
                scoringPath: 'shared-exact-model',
              },
            }, {
              redis,
              deadline,
              localLookup: dependencies.modelEvidenceLocalLookup,
              serperApiKey: dependencies.serperApiKey
                || (dependencies.env || process.env).SERPER_API_KEY,
              serperFetchImpl: dependencies.serperFetchImpl || dependencies.fetchImpl,
              geminiApiKey: dependencies.geminiApiKey
                || (dependencies.env || process.env).GEMINI_API_KEY,
              geminiFetchImpl: dependencies.geminiFetchImpl || dependencies.fetchImpl,
              logger,
            });
            const sharedResult = sharedEvidenceToSmartLookupInput(sharedEvidence, queryInfo);
            if (sharedResult) return sharedResult;
          }

          // Active production sequence: OpenAI web research, then xAI Grok,
          // then the caller's deterministic reserve. Gemini is deliberately NOT
          // chained after OpenAI -- doing so would rebuild the measured
          // failure where grounded (~4.2s) plus closed-book (~3.9s) consumed
          // the entire route budget and starved every fallback. The Gemini
          // branches below remain reachable only when OpenAI is disabled, so
          // the provider stays available for benchmarking and re-enablement.
          if (openAiEnabled) {
            groundedTelemetry.attempted = true;
            const openAiStart = now();
            try {
              const value = await openAiProviderLookup(queryInfo, {
                deadline,
                openAiMaxMs: Math.min(OPENAI_STAGE_BUDGET_MS, deadline.remainingMs(350)),
                xaiMaxMs: XAI_FALLBACK_MAX_MS,
                reserveMs: 350,
                fetchImpl: dependencies.fetchImpl,
                env: dependencies.env || process.env,
              });
              groundedTelemetry.durationMs = Math.max(0, now() - openAiStart);
              return value;
            } catch (openAiError) {
              groundedTelemetry.durationMs = Math.max(0, now() - openAiStart);
              groundedTelemetry.failureCode = isTimeoutError(openAiError)
                ? 'STAGE_TIMEOUT'
                : (openAiError instanceof SmartLookupProviderError ? openAiError.code : 'PROVIDER_UNAVAILABLE');
              throw openAiError;
            }
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
          // already resolved inside the legacy Gemini provider's bounded
          // internal fallback before it can reach this catch block, so only
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

            // Captured BEFORE the hasTime gate so a grounded timeout that
            // skips recovery still reports how much budget was actually left --
            // "no time remained" and "recovery ran and failed" are different
            // problems and were previously indistinguishable in logs.
            groundedTelemetry.remainingMsAfterGrounded = deadline.remainingMs(0);
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
        // The aggregate PROVIDERS_UNAVAILABLE hides WHICH provider failed and
        // why, which makes a production provider outage undiagnosable from the
        // response alone. These are stable internal codes only -- never a raw
        // provider body, credential, query, or URL.
        const primaryProviderErrorCode = error?.primaryErrorCode || null;
        const fallbackProviderErrorCode = error?.fallbackErrorCode || null;
        const fallbackProviderStatus = error?.fallbackStatus || null;
        const fallbackProviderLatencyMs = error?.fallbackLatencyMs ?? null;
        const fallbackProviderModel = error?.fallbackModel || null;
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
        // PROVIDERS_UNAVAILABLE means the xAI fallback was actually attempted
        // (and also failed) before this error surfaced; every other code means
        // xAI was never reached, so fallbackUsed must stay false here.
        // A recognized product-family/model-line/brand-category query
        // degrades to its deterministic card instead of an empty
        // "unavailable" result -- this is the graceful-degradation fix: the
        // provider attempt failing (timeout, rate limit, or budget
        // exhaustion) never erases evidence the classifier already had.
        // This is a purely deterministic, non-AI result, so fallbackKind
        // (not groundedFallback) is what labels it -- see
        // degradeToDeterministicFallback above.
        const degraded = degradeToDeterministicFallback(errorCode);
        const result = finalizeTimings(degraded
          || createUnavailableSmartAgeResult(queryInfo, {
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
        if (primaryProviderErrorCode) result.providerErrorCode = primaryProviderErrorCode;
        if (fallbackProviderErrorCode) result.fallbackProviderErrorCode = fallbackProviderErrorCode;
        if (fallbackProviderStatus) result.fallbackProviderStatus = fallbackProviderStatus;
        if (fallbackProviderLatencyMs != null) result.fallbackProviderLatencyMs = fallbackProviderLatencyMs;
        if (fallbackProviderModel) result.fallbackProviderModel = fallbackProviderModel;
        logResult(logger, requestId, queryInfo, result, {
          timeoutStage: isTimeoutError(error) ? 'provider' : null,
          budgetStatus: error.budgetResult?.status || budgetResult?.status || null,
          logicalLookupCount: error.budgetResult?.logicalLookupCount ?? budgetResult?.logicalLookupCount ?? null,
          actualProviderAttemptCount: attemptMetrics.actualProviderAttemptCount ?? actualAttempts,
          groundedTelemetry,
        inFlightShared,
        });
        return res.status(degraded ? 200 : (errorCode === 'RATE_LIMIT' ? 429 : 200)).json(result);
      }
      timings.providerMs = Math.max(0, now() - providerStart);

      const postStart = now();
      let result;
      let providerMetadata = null;
      try {
        // Read which provider actually served this result instead of assuming
        // the primary provider succeeded.
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
          // An OpenAI answer counts as web-researched ONLY when the search
          // tool actually returned citations; otherwise it is labelled as an
          // ungrounded estimate so the card never claims web verification it
          // does not have. SOURCES is a separate gate in result-schema.js.
          evidenceSource: providerMetadata.provider === 'xai'
            ? (groundedWithSources ? 'xai-web' : 'xai-ungrounded')
            : (providerMetadata.provider === 'openai'
              ? (groundedWithSources ? 'openai-web' : 'openai-ungrounded')
              : (providerMetadata.provider === 'groq'
                ? 'groq-ungrounded'
                : (providerMetadata.provider === 'serper'
                  ? 'serper-extracted'
                  : (providerMetadata.provider === 'local-db'
                    ? 'local-db'
                    : (groundedWithSources ? 'gemini-grounded' : 'gemini-ungrounded'))))),
          groundedSources: groundedWithSources ? providerMetadata.groundedSources : [],
          webSearchUsed: providerMetadata.webSearchUsed === true,
          retrievedAt: groundedWithSources ? new Date().toISOString() : null,
          groundedFallback: groundedFallbackRecovered,
          // Real AI produced this result --
          // 'ungrounded-provider' only when the grounded attempt actually
          // timed out and this closed-book call recovered it; 'none' for
          // an ordinary (non-recovered) provider success.
          fallbackKind: groundedFallbackRecovered ? 'ungrounded-provider' : 'none',
          cacheStatus,
          providerAttempted: providerAttemptCountFromMetadata(providerMetadata) > 0,
          fallbackUsed: providerMetadata.fallbackUsed,
          timings,
          currentYear,
        };
        const validatedProvider = normalizeSmartAgeResult(rawProvider, providerOptions);
        const hinted = applyEraHints(validatedProvider, queryInfo.normalizedQuery);
        result = normalizeSmartAgeResult(hinted, providerOptions);
        if (providerMetadata.model) result.providerModel = providerMetadata.model;
      } catch (error) {
        timings.postProcessMs = Math.max(0, now() - postStart);
        const invalidAttempts = providerAttemptCountFromMetadata(providerMetadata) + (rawProvider && rawProvider.__groundedFallbackRecovered ? 1 : 0);
        const attemptMetrics = await recordSharedProviderAttempts(providerPromise, recordAttempts, redis, 'age', invalidAttempts, deadline, {
          stage: 'age-provider-attempt-metrics',
          maxMs: CACHE_WRITE_BUDGET_MS,
          now,
        });
        const degraded = degradeToDeterministicFallback(error?.code || 'INVALID_PROVIDER_RESULT');
        result = degraded
          || createUnavailableSmartAgeResult(queryInfo, {
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
        inFlightShared,
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
        inFlightShared,
      });
      return res.status(200).json(result);
    } catch (error) {
      const degraded = degradeToDeterministicFallback(isTimeoutError(error) ? 'TOTAL_DEADLINE' : 'INTERNAL_ERROR');
      const result = finalizeTimings(degraded
        || createUnavailableSmartAgeResult(queryInfo, {
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
