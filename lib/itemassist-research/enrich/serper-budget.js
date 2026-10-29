import { secondsUntilNextUtcDay, utcBudgetDate } from '../../smart-lookup/budget.js';

/**
 * Daily Serper credit allowance for ItemAssist Research enrichment. Own Redis key, so it never consumes or is consumed by any other
 * budget. Unlike the Gemini call budget this one does NOT block the answer when it is unavailable: enrichment is skipped and the
 * response is built from the identification alone (no listings, no history), which is still a useful, clearly labelled answer.
 * A search costs 1 credit and a Shopping query 2 (Serper's published pricing, confirmed by the S1 study).
 */

export const SERPER_BUDGET_NAMESPACE = 'itemassist-research-budget:v1';
// 30 credits is six uncached requests at the 5-credit maximum (one search + two Shopping queries). Raise it by environment variable only.
export const DEFAULT_DAILY_CREDIT_LIMIT = 30;
const STORE_TIMEOUT_MS = 400;

const RESERVE_SCRIPT = `
local current = tonumber(redis.call("GET", KEYS[1]) or "0")
local cost = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
if current + cost > limit then
  return {0, current}
end
current = redis.call("INCRBY", KEYS[1], cost)
redis.call("EXPIRE", KEYS[1], tonumber(ARGV[3]))
return {1, current}
`;

// Gives back credits for a request that was never sent; never goes below zero.
const RELEASE_SCRIPT = `
local current = tonumber(redis.call("GET", KEYS[1]) or "0")
local cost = tonumber(ARGV[1])
if current <= 0 then
  return 0
end
if cost > current then
  cost = current
end
return redis.call("DECRBY", KEYS[1], cost)
`;

const positiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export function serperBudgetConfig(env = process.env) {
  return { dailyCreditLimit: positiveInteger(env.ITEMASSIST_RESEARCH_DAILY_SERPER_CREDIT_LIMIT, DEFAULT_DAILY_CREDIT_LIMIT) };
}

export const serperBudgetKey = (now = Date.now()) => `${SERPER_BUDGET_NAMESPACE}:serper-credits:${utcBudgetDate(now)}`;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('STORE_TIMEOUT')), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** @param {{redis: {eval?: Function}|null, config?: {dailyCreditLimit: number}, now?: () => number, timeoutMs?: number}} options */
export function createSerperBudget({ redis, config = serperBudgetConfig(), now = Date.now, timeoutMs = STORE_TIMEOUT_MS } = {}) {
  const limit = config.dailyCreditLimit;
  const unavailable = { allowed: false, status: 'unavailable', used: null, limit, key: null, credits: 0 };

  /** Atomically takes `credits` from today's allowance. Call immediately before the request that will spend them. */
  async function reserve(credits) {
    if (!redis || typeof redis.eval !== 'function' || !Number.isInteger(credits) || credits < 1) return unavailable;
    try {
      const at = now();
      const key = serperBudgetKey(at);
      const result = await withTimeout(Promise.resolve(redis.eval(RESERVE_SCRIPT, [key], [String(credits), String(limit), String(secondsUntilNextUtcDay(at))])), timeoutMs);
      if (!Array.isArray(result) || result.length < 2) return unavailable;
      const [allowed, used] = result;
      const granted = allowed === 1 || allowed === '1';
      if (!granted && allowed !== 0 && allowed !== '0') return unavailable;
      return { allowed: granted, status: granted ? 'allowed' : 'denied', used: Number(used) || 0, limit, key: granted ? key : null, credits: granted ? credits : 0 };
    } catch { return unavailable; }
  }

  /** Best effort. Only for a reservation whose request provably never left (for example, no API key). */
  async function release(reservation) {
    if (!redis || typeof redis.eval !== 'function' || !reservation?.key || !reservation.credits) return false;
    try { await withTimeout(Promise.resolve(redis.eval(RELEASE_SCRIPT, [reservation.key], [String(reservation.credits)])), timeoutMs); return true; } catch { return false; }
  }

  return { reserve, release };
}
