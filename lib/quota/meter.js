import { loadQuotaConfig } from './config.js';
import { buildIdentity, utcDay, utcMonth } from './identity.js';
import { resolveQuota } from './resolver.js';
import { getClientIp } from '../smart-lookup/redis.js';
import { recordUsageEvents } from '../smart-lookup/provider-usage.js';

/**
 * Logical AI-lookup metering.
 *
 * One user action that crosses into a paid-provider path is ONE logical AI
 * lookup, however many providers/retries/fallbacks run behind it. It is counted
 * once at admission (`admit`) and refunded (`refund`) if it ends without an AI
 * result, so failures never spend allowance. A repeat of the same query by the
 * same subject within TX_TTL_SECONDS is a retry and is not counted again.
 *
 * Storage (all hashes, no raw identifiers):
 *   quota:v1:d:<UTC day>    subject -> AI lookups that day   (also the distribution data)
 *   quota:v1:m:<UTC month>  subject -> AI lookups that month
 *   quota:v1:ip:<UTC day>   day-scoped IP hash -> AI lookups (abuse signal only)
 *   quota:v1:tx:<subject>:<queryKey>  retry de-duplication marker
 *
 * Every store failure fails OPEN: quota bookkeeping can never block a lookup.
 * (The paid path itself still fails closed on the rate limiter/budget.)
 */

export const QUOTA_KEY_PREFIX = 'quota:v1:';
export const quotaKeys = Object.freeze({
  daily: (day) => `${QUOTA_KEY_PREFIX}d:${day}`,
  monthly: (month) => `${QUOTA_KEY_PREFIX}m:${month}`,
  ip: (day) => `${QUOTA_KEY_PREFIX}ip:${day}`,
  tx: (subjectId, queryKey) => `${QUOTA_KEY_PREFIX}tx:${subjectId}:${queryKey}`,
});

const DAILY_TTL_SECONDS = 45 * 24 * 60 * 60;
const MONTHLY_TTL_SECONDS = 100 * 24 * 60 * 60;
const TX_TTL_SECONDS = 10 * 60;
const STORE_TIMEOUT_MS = 250;

function bounded(work) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('quota store timeout'), { code: 'QUOTA_STORE_TIMEOUT' })), STORE_TIMEOUT_MS);
  });
  return Promise.race([Promise.resolve(work), timeout]).finally(() => clearTimeout(timer));
}

const asCount = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
};

async function runBatch(redis, build) {
  if (typeof redis.pipeline === 'function') {
    const pipeline = redis.pipeline();
    const wanted = build((op, ...args) => { pipeline[op](...args); });
    const results = await bounded(pipeline.exec());
    return { results: Array.isArray(results) ? results : [], wanted };
  }
  // Sequential fallback for clients without pipelines.
  const results = [];
  const wanted = build((op, ...args) => { results.push(redis[op](...args)); });
  return { results: await bounded(Promise.all(results)), wanted };
}

async function incrementCounters(redis, keys, identity, delta) {
  const { results } = await runBatch(redis, (enqueue) => {
    enqueue('hincrby', keys.daily, identity.subjectId, delta);
    enqueue('hincrby', keys.monthly, identity.subjectId, delta);
    enqueue('hincrby', keys.ip, identity.ipHash, delta);
    if (delta > 0) {
      enqueue('expire', keys.daily, DAILY_TTL_SECONDS);
      enqueue('expire', keys.monthly, MONTHLY_TTL_SECONDS);
      enqueue('expire', keys.ip, DAILY_TTL_SECONDS);
    }
  });
  return { today: Number(results[0]), month: Number(results[1]), ip: Number(results[2]) };
}

async function readCounters(redis, keys, identity) {
  const { results } = await runBatch(redis, (enqueue) => {
    enqueue('hget', keys.daily, identity.subjectId);
    enqueue('hget', keys.monthly, identity.subjectId);
    enqueue('hget', keys.ip, identity.ipHash);
  });
  return { today: asCount(results[0]), month: asCount(results[1]), ip: asCount(results[2]) };
}

export function createQuotaMeter(options = {}) {
  const env = options.env || process.env;
  const config = options.config || loadQuotaConfig(env);
  const now = options.now || Date.now;
  const accountResolver = options.accountResolver || null;

  async function refund(redis, decision) {
    if (!decision?.counted || decision.refunded || !redis) return false;
    decision.refunded = true; // idempotent even if the store call below fails
    try {
      const { keys, identity } = decision.internal;
      const after = await incrementCounters(redis, keys, identity, -1);
      // Never leave a counter below zero (e.g. a TTL expired between calls), and
      // drop fields that return to zero so the hashes only list real AI users.
      const floors = [[keys.daily, identity.subjectId, after.today], [keys.monthly, identity.subjectId, after.month], [keys.ip, identity.ipHash, after.ip]];
      for (const [key, field, value] of floors) {
        if (!Number.isFinite(value) || value > 0) continue;
        if (value < 0) await bounded(redis.hincrby(key, field, -value));
        await bounded(redis.hdel(key, field));
      }
      await bounded(redis.del(decision.internal.txKey));
      return true;
    } catch (_) {
      return false;
    }
  }

  function createSession({ req, route = 'age' } = {}) {
    const state = { identity: null, decision: null, aiProduced: false, settled: false, redis: null };

    async function identify() {
      if (state.identity) return state.identity;
      let account = null;
      if (accountResolver) {
        try { account = await accountResolver(req); } catch (_) { account = null; }
      }
      state.identity = buildIdentity({ req, ip: getClientIp(req), config, now: now(), account });
      return state.identity;
    }

    return {
      route,
      get enabled() { return config.metering; },
      get decision() { return state.decision; },
      setRedis(redis) { state.redis = redis || null; },
      get redis() { return state.redis; },

      /** Call exactly once, when the request crosses into a paid-provider path. */
      async admit({ redis, queryKey }) {
        if (!config.metering || state.decision) return state.decision;
        const identity = await identify();
        const at = now();
        const keys = { daily: quotaKeys.daily(utcDay(at)), monthly: quotaKeys.monthly(utcMonth(at)), ip: quotaKeys.ip(utcDay(at)) };
        const txKey = quotaKeys.tx(identity.subjectId, queryKey || 'none');
        const base = { tier: identity.tier, idSource: identity.idSource, visitorHash: identity.visitorHash, ipHash: identity.ipHash, internal: { keys, identity, txKey } };
        let claimed = false;
        try {
          if (!redis) throw new Error('no redis');
          claimed = (await bounded(redis.set(txKey, '1', { nx: true, ex: TX_TTL_SECONDS }))) === 'OK';
          const usage = claimed
            ? await incrementCounters(redis, keys, identity, 1)
            : await readCounters(redis, keys, identity);
          if (![usage.today, usage.month, usage.ip].every(Number.isFinite)) throw new Error('unusable counters');

          const quota = resolveQuota({ identity, usedToday: usage.today, usedThisMonth: usage.month, config });
          const ipWouldBlock = config.ipDailyLimit !== null && usage.ip > config.ipDailyLimit;
          const wouldBlock = !quota.allowed || ipWouldBlock;
          const decision = {
            ...base,
            metered: true,
            counted: claimed,
            duplicate: !claimed,
            ...quota,
            ipToday: usage.ip,
            ipWouldBlock,
            wouldAllow: !wouldBlock,
            wouldBlock,
            blockReason: quota.blockReason || (ipWouldBlock ? 'ip' : null),
            // Enforcement is a separate flag; in shadow mode nothing is ever blocked.
            blocked: config.enforce && wouldBlock && claimed,
            refunded: false,
            storeError: null,
          };
          state.decision = decision;
          if (decision.blocked) {
            await refund(redis, decision); // a blocked lookup does not spend allowance
            decision.counted = false;
          }
          return decision;
        } catch (error) {
          if (claimed) { try { await bounded(redis.del(txKey)); } catch (_) { /* best effort */ } }
          state.decision = {
            ...base, metered: false, counted: false, duplicate: false, blocked: false,
            wouldAllow: true, wouldBlock: false, refunded: false,
            storeError: 'QUOTA_STORE_UNAVAILABLE',
          };
          return state.decision;
        }
      },

      markAiProduced() { state.aiProduced = true; },

      /** Refund the logical lookup if the request ended without an AI result. Idempotent. */
      async refundUnproduced(redis) {
        if (state.aiProduced) return false;
        return refund(redis || state.redis, state.decision);
      },

      /**
       * End of request. Refunds an unproduced AI lookup (safety net) and writes
       * the day's traffic events. Best effort and never throws.
       * @param {{getRedis: Function, outcome: string}} args  `outcome` is used for
       *   requests that never crossed into the paid path (local/cache/deterministic).
       */
      async settle({ getRedis, outcome }) {
        if (state.settled || !config.metering) return;
        state.settled = true;
        try {
          let redis = state.redis;
          if (!redis) { try { redis = getRedis ? getRedis() : null; } catch (_) { redis = null; } }
          const decision = state.decision;
          const events = [];
          if (decision) {
            events.push('outcome:ai');
            if (!state.aiProduced) await refund(redis, decision);
            if (decision.counted) events.push('ai_lookup');
            if (decision.duplicate) events.push('ai_lookup_duplicate');
            if (decision.refunded) events.push('ai_lookup_refunded');
            if (decision.wouldBlock) events.push('quota_would_block');
            if (decision.blocked) events.push('quota_blocked');
            if (decision.storeError) events.push('quota_store_error');
          } else if (outcome) {
            events.push(`outcome:${outcome}`);
          }
          if (redis && events.length) await recordUsageEvents(redis, route, events, now());
        } catch (_) { /* bookkeeping must never affect a reply */ }
      },

      /** Log-safe fields (hash prefixes and numbers only). Empty when metering is off. */
      telemetry() {
        if (!config.metering) return {};
        const d = state.decision;
        if (!d) return { quotaMode: config.enforce ? 'enforce' : 'shadow' };
        return {
          quotaMode: config.enforce ? 'enforce' : 'shadow',
          quotaTier: d.tier,
          quotaIdSource: d.idSource,
          quotaVisitorHash: d.visitorHash ? d.visitorHash.slice(0, 12) : null,
          quotaIpHash: d.ipHash ? d.ipHash.slice(0, 12) : null,
          logicalAiLookupCount: d.counted && !d.refunded ? 1 : 0,
          quotaUsedToday: d.usedToday ?? null,
          quotaUsedThisMonth: d.usedThisMonth ?? null,
          quotaRemainingDaily: d.remainingDaily ?? null,
          quotaRemainingMonthly: d.remainingMonthly ?? null,
          quotaWouldAllow: d.wouldAllow,
          quotaWouldBlock: d.wouldBlock,
          quotaBlockReason: d.blockReason ?? null,
          quotaIpWouldBlock: d.ipWouldBlock ?? null,
          quotaDuplicate: d.duplicate,
          quotaRefunded: Boolean(d.refunded),
          quotaBlocked: d.blocked,
          quotaStoreError: d.storeError,
        };
      },
    };
  }

  return {
    config,
    enabled: config.metering,
    enforce: config.enforce,
    createSession,
    refund,
  };
}
