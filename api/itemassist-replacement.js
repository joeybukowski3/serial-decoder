import { randomUUID } from 'node:crypto';
import { DEFAULT_DEADLINE_MS, recommendByRetrieval } from '../lib/replacement-discovery/live-retrieval.js';
import { searchProducts } from '../lib/replacement-discovery/providers/explicit-search.js';
import { createReplacementBudget, replacementBudgetConfig } from '../lib/replacement-public/budget.js';
import { createReplacementCache, replacementCacheKey } from '../lib/replacement-public/cache.js';
import { buildErrorResponse, buildPublicResponse, isValidPublicResponse } from '../lib/replacement-public/contract.js';
import { ERROR_HTTP_STATUS } from '../lib/replacement-public/labels.js';
import { isAuthorized, readRequestBody, validateReplacementRequest } from '../lib/replacement-public/request.js';

/**
 * Server-to-server endpoint for the ItemAssist Replacement Finder proxy. Never intended for direct browser use.
 * Order of checks: method, feature flag, bearer token, request validation, cache, provider readiness, provider budget, engine.
 * No provider call, store read or engine call can happen before the token has been verified.
 *
 * Provider readiness: a cache miss needs a configured provider credential (SERPER_API_KEY). Without one no search can happen, so
 * the endpoint answers 503 PROVIDER_UNAVAILABLE before reserving any budget: only real search attempts are ever counted.
 * Cache hits need no provider and are served regardless.
 *
 * Store policy: the cache is best effort (any problem is a miss). The provider budget fails CLOSED: with no working
 * store, new searches are refused (BUDGET_UNAVAILABLE) rather than allowed to spend without a limit.
 */

// Overhead allowed on top of the engine's own deadline before the route gives up. Stays under Vercel's 30s maxDuration.
const ENGINE_GUARD_GRACE_MS = 4000;

const defaultProviderReady = (env) => typeof env.SERPER_API_KEY === 'string' && env.SERPER_API_KEY.trim().length > 0;

async function defaultRedisFactory(env) {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return null;
  const { Redis } = await import('@upstash/redis');
  return new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN });
}

function raceGuard(promise, ms) {
  let timer;
  const guard = new Promise((resolve) => { timer = setTimeout(() => resolve({ timedOut: true }), ms); });
  return Promise.race([promise.then((value) => ({ value })), guard]).finally(() => clearTimeout(timer));
}

/** One reservation per real provider search. A denial stops further searches; the engine then evaluates what it already has. */
function guardSearch(budget, baseSearch, spend) {
  return async (searchRequest, options) => {
    const reservation = await budget.reserveSearch();
    if (!reservation.allowed) {
      spend.denied = reservation.status;
      throw Object.assign(new Error('REPLACEMENT_BUDGET_DENIED'), { code: 'REPLACEMENT_BUDGET_DENIED' });
    }
    spend.reserved += 1;
    return baseSearch(searchRequest, options);
  };
}

/** Maps a finished engine run to a fixed public error code, or null when the outcome can be presented. */
function outcomeError(outcome, spend) {
  if (['UNSUPPORTED', 'INVALID_REQUEST'].includes(outcome.status)) return outcome.status;
  if (spend.denied && spend.reserved === 0) return spend.denied === 'denied' ? 'BUDGET_EXHAUSTED' : 'BUDGET_UNAVAILABLE';
  if (outcome.reasonCodes?.includes('ENGINE_ERROR')) return 'ENGINE_ERROR';
  return null;
}

export function createItemAssistReplacementHandler(dependencies = {}) {
  const env = dependencies.env || process.env;
  const logger = dependencies.logger || console;
  const now = dependencies.now || Date.now;
  const recommend = dependencies.recommend || recommendByRetrieval;
  const baseSearch = dependencies.search || searchProducts;
  const redisFactory = dependencies.redisFactory || defaultRedisFactory;
  const budgetFactory = dependencies.budgetFactory || ((redis) => createReplacementBudget({ redis, config: replacementBudgetConfig(env), now }));
  const cacheFactory = dependencies.cacheFactory || ((redis) => createReplacementCache({ redis }));
  const providerReady = dependencies.providerReady || defaultProviderReady;
  const makeRequestId = dependencies.requestIdFactory || randomUUID;
  const deadlineMs = dependencies.deadlineMs || DEFAULT_DEADLINE_MS;
  const guardMs = dependencies.guardMs ?? deadlineMs + ENGINE_GUARD_GRACE_MS;

  /** Structured, secret-free log line: identifiers and counters only (never headers, notes, provider data or exceptions). */
  const log = (fields) => { try { logger.info(JSON.stringify({ event: 'itemassist_replacement', ...fields })); } catch { /* logging must never affect a reply */ } };

  /** A store that cannot be created is the same as no store: the cache misses and the budget refuses. */
  async function openStore() {
    try { return (await redisFactory(env)) || null; } catch { return null; }
  }

  async function execute(request, spend, budget) {
    const deps = { search: guardSearch(budget, baseSearch, spend), fetchPage: dependencies.fetchPage, now: dependencies.engineNow };
    try {
      const run = await raceGuard(recommend({ ...request, deadlineMs, deps }), guardMs);
      return run.timedOut ? { error: 'ENGINE_TIMEOUT' } : { outcome: run.value };
    } catch { return { error: 'ENGINE_ERROR', reason: 'engine_exception' }; }
  }

  return async function handler(req, res) {
    const startedAt = now();
    const requestId = makeRequestId();
    res.setHeader?.('Cache-Control', 'no-store');
    res.setHeader?.('X-Request-Id', requestId);
    const fail = (errorCode, status = ERROR_HTTP_STATUS[errorCode], fields = {}) => {
      log({ requestId, status: errorCode, httpStatus: status, elapsedMs: now() - startedAt, ...fields });
      return res.status(status).json(buildErrorResponse(errorCode, { requestId }));
    };

    if (req.method !== 'POST') { res.setHeader?.('Allow', 'POST'); return fail('INVALID_REQUEST', 405); }
    if (env.ITEMASSIST_REPLACEMENT_API_ENABLED !== 'true') return fail('API_DISABLED');
    if (!isAuthorized(req.headers?.authorization, env.ITEMASSIST_REPLACEMENT_API_TOKEN)) return fail('UNAUTHORIZED');

    const body = readRequestBody(req);
    if (!body.ok) return fail(body.errorCode, body.status);
    const checked = validateReplacementRequest(body.value);
    if (!checked.ok) return fail(checked.errorCode, checked.status);
    const request = checked.value;
    const base = { category: request.category, brand: request.brand, model: request.model };

    const redis = await openStore();
    const cache = cacheFactory(redis);
    const cacheKey = replacementCacheKey(request);
    const cached = await cache.read(cacheKey);
    if (cached) {
      const elapsedMs = now() - startedAt;
      log({ requestId, ...base, status: cached.status, elapsedMs, cacheHit: true, searchCount: 0, deadlineReached: false });
      return res.status(200).json({ ...cached, meta: { ...cached.meta, requestId, elapsedMs, cached: true } });
    }

    if (!providerReady(env)) return fail('PROVIDER_UNAVAILABLE', undefined, { ...base, cacheHit: false, searchCount: 0, reason: 'provider_not_configured' });

    const budget = budgetFactory(redis);
    const allowance = await budget.peek();
    if (!allowance.allowed) return fail(allowance.status === 'denied' ? 'BUDGET_EXHAUSTED' : 'BUDGET_UNAVAILABLE', undefined, { ...base, cacheHit: false, searchCount: 0 });

    const spend = { reserved: 0, denied: null };
    const run = await execute(request, spend, budget);
    const fields = { ...base, cacheHit: false, searchCount: spend.reserved, deadlineReached: run.error === 'ENGINE_TIMEOUT' || run.outcome?.deadline?.reached === true };
    if (run.error) return fail(run.error, undefined, { ...fields, ...(run.reason ? { reason: run.reason } : {}) });
    const refusal = outcomeError(run.outcome, spend);
    if (refusal) return fail(refusal, undefined, { ...fields, ...(refusal === 'ENGINE_ERROR' ? { reason: 'engine_no_result' } : {}) });

    let response;
    try {
      response = buildPublicResponse(run.outcome, { requestId, elapsedMs: now() - startedAt, budgetLimited: Boolean(spend.denied) });
    } catch { return fail('ENGINE_ERROR', undefined, { ...fields, reason: 'contract_build_failed' }); }
    if (!isValidPublicResponse(response)) return fail('ENGINE_ERROR', undefined, { ...fields, reason: 'contract_invalid' });

    if (response.status === 'COMPLETE' && !spend.denied) await cache.write(cacheKey, response);
    log({ requestId, ...fields, status: response.status, elapsedMs: response.meta.elapsedMs });
    return res.status(200).json(response);
  };
}

export default createItemAssistReplacementHandler();
