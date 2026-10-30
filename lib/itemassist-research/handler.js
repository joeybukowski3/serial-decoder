import { randomUUID } from 'node:crypto';
import { createResearchBudget, researchBudgetConfig } from './budget.js';
import { createResearchCache, researchCacheKey } from './cache.js';
import {
  ANSWER_SOURCE, ERROR_HTTP_STATUS, RESEARCH_CONTRACT_VERSION, buildResearchError, buildResearchResponse,
} from './contract.js';
import { isAuthorized, readResearchBody, validateResearchRequest } from './request.js';
import { FIXTURE_STATE, createMemoryStore, fixtureModeState, getFixtureAnswer } from './fixture.js';
import { RESEARCH_CONTRACT_V2, buildResearchResponseV2, isValidAnyResearchResponse } from './contract-v2.js';
import { FIXTURE_CONTRACT_ENV, fixtureResearch2For } from './fixture-v2.js';
import { recordResearchUsage } from './usage.js';
import { createEnrichmentCache } from './enrich/cache.js';
import { ENRICHMENT_ENV, LIVE_CONTRACT_ENV, guidanceInput, researchLiveV2 } from './enrich/orchestrate.js';
import { createSerperBudget, serperBudgetConfig } from './enrich/serper-budget.js';
import { getQuickAnswer } from '../replacement-quick/quick-answer.js';
import { ANSWER_STATUS, buildFallbackAnswer } from '../replacement-quick/quick-sanitize.js';

/**
 * Server-to-server endpoint for ItemAssist Research (the Fast Answer engine). Never intended for direct browser use.
 * Not a Vercel function of its own (the Hobby plan allows 12): /api/itemassist-research is rewritten to the shared ItemAssist function,
 * whose gateway (lib/itemassist-gateway/gateway.js) calls this handler for that exact path only. Nothing below depends on that.
 * Order of checks: method, feature flag, bearer token, request validation, cache, provider readiness, provider-call budget,
 * the single provider call. No store read, budget reservation or provider call can happen before the token has been verified.
 *
 * One provider call per cache miss, never retried, bounded by the engine's own timeout. Cache hits and every rejected request
 * (disabled, unauthorized, invalid, provider not configured, budget denied) spend no provider budget.
 *
 * Live research.2 (ITEMASSIST_RESEARCH_LIVE_CONTRACT=research.2, default off): the one Gemini call becomes the identification in
 * enrich/identify.js, and ITEMASSIST_RESEARCH_ENRICHMENT=on adds at most one Serper search and two Shopping queries, paid from their own
 * daily credit allowance. Serper problems never block or fail an answer; they only leave that part of the evidence empty.
 *
 * Test doubles enter through `dependencies`. The one server-side fixture mode (a connected Preview, see lib/itemassist-research/fixture.js)
 * is chosen by two environment variables only, after the flag check; nothing in the request can select it or bypass the budget.
 * The caller (the ItemAssist proxy) owns per-IP rate limiting and the customer-facing projection; this route's global
 * protection is the daily provider-call budget, which fails CLOSED when its store is unavailable.
 */

// Only a fixed error code and a plain HTTP status number are ever logged for a provider failure: nothing taken from the provider's reply, the prompt or a header.
const safeErrorCode = (code) => (typeof code === 'string' && /^[A-Z][A-Z0-9_]{2,39}$/.test(code) ? code : 'PROVIDER_ERROR');
const safeHttpStatus = (status) => (Number.isInteger(status) && status >= 100 && status <= 599 ? status : null);

const defaultProviderReady = (env) => typeof env.GEMINI_API_KEY === 'string' && env.GEMINI_API_KEY.trim().length > 0;

async function defaultRedisFactory(env) {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return null;
  const { Redis } = await import('@upstash/redis');
  return new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN });
}

export function createItemAssistResearchHandler(dependencies = {}) {
  const env = dependencies.env || process.env;
  const logger = dependencies.logger || console;
  const now = dependencies.now || Date.now;
  const answerFor = dependencies.getAnswer || getQuickAnswer;
  const redisFactory = dependencies.redisFactory || defaultRedisFactory;
  const budgetFactory = dependencies.budgetFactory || ((redis) => createResearchBudget({ redis, config: researchBudgetConfig(env), now }));
  const cacheFactory = dependencies.cacheFactory || ((redis, options) => createResearchCache({ redis, ...options }));
  const serperBudgetFactory = dependencies.serperBudgetFactory || ((redis) => createSerperBudget({ redis, config: serperBudgetConfig(env), now }));
  const enrichCacheFactory = dependencies.enrichCacheFactory || ((redis) => createEnrichmentCache({ redis }));
  const providerReady = dependencies.providerReady || defaultProviderReady;
  const makeRequestId = dependencies.requestIdFactory || randomUUID;
  // Fixture mode keeps its budget, cache and usage in memory (per function instance), so it never reads or writes Redis.
  let fixtureStore = null;
  const getFixtureStore = () => { fixtureStore = fixtureStore || createMemoryStore({ now }); return fixtureStore; };

  /** Structured, secret-free log line: identifiers and counters only (never the query, answer text, headers or exceptions). */
  const log = (fields) => { try { logger.info(JSON.stringify({ event: 'itemassist_research', ...fields })); } catch { /* logging must never affect a reply */ } };

  /** A store that cannot be created is the same as no store: the cache misses and the budget refuses. */
  async function openStore() {
    try { return (await redisFactory(env)) || null; } catch { return null; }
  }

  /** The single provider call. The engine never throws; anything that does is treated as a failed call with guidance only. */
  async function research(query) {
    try {
      const run = await answerFor(query, { env });
      if (run && typeof run === 'object' && run.answer && run.meta) return run;
    } catch { /* fall through to the guidance answer */ }
    return { answer: buildFallbackAnswer({ status: ANSWER_STATUS.UNAVAILABLE, query }), meta: { requestSent: true, errorCode: 'QUICK_UNEXPECTED_ERROR', usage: {} } };
  }

  /**
   * Live research.2: one Gemini identification plus optional Serper history and Shopping lookups (see enrich/orchestrate.js). Like `research`,
   * it never throws; anything unexpected is a failed call with guidance only.
   */
  async function researchV2(query, redis) {
    try {
      return await researchLiveV2(query, {
        env, now, fetchImpl: dependencies.fetchImpl, geminiFetchImpl: dependencies.geminiFetchImpl, identify: dependencies.identify, serper: dependencies.serper,
        serperBudget: serperBudgetFactory(redis), enrichCache: enrichCacheFactory(redis), enrich: env[ENRICHMENT_ENV] === 'on',
      });
    } catch {
      return { input: guidanceInput(new Date(now()).toISOString().slice(0, 10)), meta: { requestSent: true, errorCode: 'RESEARCH_UNEXPECTED_ERROR', usage: {}, serperCredits: 0, serperCalls: 0, cacheable: false } };
    }
  }

  async function handle(req, res, requestId) {
    const startedAt = now();
    let redis = null;
    // Decided from the environment alone, before the request body is even read.
    const fixtureState = fixtureModeState(env);
    const fixture = fixtureState === FIXTURE_STATE.ACTIVE;
    // research.2 is opt-in on both paths. A fixture emits it only when this server flag asks; the live route emits it only when
    // ITEMASSIST_RESEARCH_LIVE_CONTRACT says so (see below), and otherwise keeps emitting research.1.
    const fixtureV2 = fixture && env[FIXTURE_CONTRACT_ENV] === RESEARCH_CONTRACT_V2;
    // Live research.2 is opt-in by a server flag as well (default off, so the live route keeps emitting research.1). It is never a fixture.
    const liveV2 = !fixture && env[LIVE_CONTRACT_ENV] === RESEARCH_CONTRACT_V2;
    const contractVersion = fixtureV2 || liveV2 ? RESEARCH_CONTRACT_V2 : RESEARCH_CONTRACT_VERSION;
    const v2 = fixtureV2 || liveV2;
    const tag = fixture ? { fixture: true } : {};
    const fail = async (errorCode, status = ERROR_HTTP_STATUS[errorCode], fields = {}) => {
      log({ requestId, status: errorCode, httpStatus: status, elapsedMs: now() - startedAt, ...tag, ...fields });
      if (redis) await recordResearchUsage(redis, { outcome: errorCode, providerCalled: Boolean(fields.providerCalled) }, now());
      return res.status(status).json(buildResearchError(errorCode, { requestId }));
    };

    if (req.method !== 'POST') { res.setHeader?.('Allow', 'POST'); return fail('INVALID_REQUEST', 405); }
    if (env.ITEMASSIST_RESEARCH_ENABLED !== 'true') return fail('API_DISABLED');
    // A fixture flag outside the exact Preview combination fails closed: no real provider call, no canned answer, no store.
    if (fixtureState === FIXTURE_STATE.REFUSED) return fail('API_DISABLED', undefined, { reason: 'fixture_mode_refused' });
    if (!isAuthorized(req.headers?.authorization, env.ITEMASSIST_REPLACEMENT_API_TOKEN)) return fail('UNAUTHORIZED');

    const body = readResearchBody(req);
    if (!body.ok) return fail(body.errorCode, body.status);
    const checked = validateResearchRequest(body.value);
    if (!checked.ok) return fail(checked.errorCode, checked.status);
    const { query } = checked.value;

    if (fixture) res.setHeader?.('X-ItemAssist-Research-Mode', 'fixture');
    redis = fixture ? getFixtureStore() : await openStore();
    const cache = fixture ? createResearchCache({ redis, allowFixture: true, contractVersion }) : cacheFactory(redis, { contractVersion });
    const cacheKey = researchCacheKey(query, { contractVersion });
    const cached = await cache.read(cacheKey);
    if (cached) {
      const elapsedMs = now() - startedAt;
      log({ requestId, status: cached.status, elapsedMs, cacheHit: true, ...tag });
      await recordResearchUsage(redis, { outcome: cached.status, cacheHit: true }, now());
      return res.status(200).json({ ...cached, meta: { ...cached.meta, requestId, elapsedMs, cached: true } });
    }

    // A fixture needs no provider key; the budget below still applies in full.
    if (!fixture && !providerReady(env)) return fail('PROVIDER_UNAVAILABLE', undefined, { cacheHit: false, reason: 'provider_not_configured' });

    const budget = budgetFactory(redis);
    const reservation = await budget.reserveCall();
    if (!reservation.allowed) return fail(reservation.status === 'denied' ? 'BUDGET_EXHAUSTED' : 'BUDGET_UNAVAILABLE', undefined, { cacheHit: false });

    const run = fixtureV2
      ? { input: fixtureResearch2For(query, new Date(now()).toISOString().slice(0, 10)).input, meta: { requestSent: false, errorCode: null, usage: {} } }
      : fixture ? await getFixtureAnswer(query) : liveV2 ? await researchV2(query, redis) : await research(query);
    const { meta } = run;
    // A reservation is only kept for a call that was actually sent to the provider.
    if (meta.requestSent === false) await budget.releaseCall();
    const providerCalled = meta.requestSent !== false;
    const answerSource = meta.errorCode ? ANSWER_SOURCE.GUIDANCE : ANSWER_SOURCE.AI;

    let response;
    try {
      response = v2
        ? buildResearchResponseV2(run.input, { requestId, elapsedMs: now() - startedAt, answerSource, fixture, now: now() })
        : buildResearchResponse(run.answer, { requestId, elapsedMs: now() - startedAt, answerSource, fixture });
    } catch { return fail('ENGINE_ERROR', undefined, { cacheHit: false, providerCalled, reason: 'contract_build_failed' }); }
    if (!isValidAnyResearchResponse(response, { allowFixture: fixture })) return fail('ENGINE_ERROR', undefined, { cacheHit: false, providerCalled, reason: 'contract_invalid' });

    // A live research.2 answer built while a lookup failed or was skipped is returned but not cached, so the next ask can do better.
    if (answerSource === ANSWER_SOURCE.AI && meta.cacheable !== false) await cache.write(cacheKey, response);
    const elapsedMs = now() - startedAt;
    const serper = liveV2 ? { serperCredits: meta.serperCredits || 0, serperCalls: meta.serperCalls || 0 } : {};
    log({ requestId, status: response.status, elapsedMs, cacheHit: false, providerCalled, ...tag, ...serper, ...(liveV2 && meta.enrichment ? { enrichment: meta.enrichment } : {}), ...(meta.errorCode ? { providerErrorCode: safeErrorCode(meta.errorCode), ...(safeHttpStatus(meta.httpStatus) ? { providerHttpStatus: safeHttpStatus(meta.httpStatus) } : {}) } : {}) });
    await recordResearchUsage(redis, { outcome: response.status, providerCalled, providerErrorCode: meta.errorCode || null, usage: meta.usage, ...serper }, now());
    return res.status(200).json({ ...response, meta: { ...response.meta, elapsedMs } });
  }

  /** Last line of defence: nothing unexpected can escape as a stack trace or a hung request; the caller gets a fixed ENGINE_ERROR. */
  return async function handler(req, res) {
    const requestId = makeRequestId();
    res.setHeader?.('Cache-Control', 'no-store');
    res.setHeader?.('X-Request-Id', requestId);
    res.setHeader?.('X-Robots-Tag', 'noindex, nofollow');
    try {
      return await handle(req, res, requestId);
    } catch {
      log({ requestId, status: 'ENGINE_ERROR', httpStatus: 502, reason: 'unexpected_exception' });
      return res.status(ERROR_HTTP_STATUS.ENGINE_ERROR).json(buildResearchError('ENGINE_ERROR', { requestId }));
    }
  };
}

export default createItemAssistResearchHandler();
