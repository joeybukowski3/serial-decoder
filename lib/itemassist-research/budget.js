import { secondsUntilNextUtcDay, utcBudgetDate } from '../smart-lookup/budget.js';

/**
 * Daily provider-call budget for ItemAssist Research. Own Redis namespace: it can never consume, or be consumed by, the Smart
 * Lookup budgets, the v1 replacement search budget or the shared provider-usage counters. One reservation covers one provider
 * call. The store is required: when it is missing or failing the budget fails CLOSED and no provider call starts.
 */

export const RESEARCH_BUDGET_NAMESPACE = 'itemassist-research-budget:v1';
export const DEFAULT_DAILY_CALL_LIMIT = 100;
const STORE_TIMEOUT_MS = 400;

const RESERVE_SCRIPT = `
local current = tonumber(redis.call("GET", KEYS[1]) or "0")
local limit = tonumber(ARGV[1])
if current >= limit then
  return {0, current}
end
current = redis.call("INCR", KEYS[1])
redis.call("EXPIRE", KEYS[1], tonumber(ARGV[2]))
return {1, current}
`;

// Gives back a reservation whose call was never sent; never goes below zero.
const RELEASE_SCRIPT = `
local current = tonumber(redis.call("GET", KEYS[1]) or "0")
if current <= 0 then
  return 0
end
return redis.call("DECR", KEYS[1])
`;

const positiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export function researchBudgetConfig(env = process.env) {
  return { dailyCallLimit: positiveInteger(env.ITEMASSIST_RESEARCH_DAILY_CALL_LIMIT, DEFAULT_DAILY_CALL_LIMIT) };
}

export const researchBudgetKey = (now = Date.now()) => `${RESEARCH_BUDGET_NAMESPACE}:calls:${utcBudgetDate(now)}`;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('STORE_TIMEOUT')), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** @param {{redis: {eval?: Function}|null, config?: {dailyCallLimit: number}, now?: () => number, timeoutMs?: number}} options */
export function createResearchBudget({ redis, config = researchBudgetConfig(), now = Date.now, timeoutMs = STORE_TIMEOUT_MS } = {}) {
  const limit = config.dailyCallLimit;
  const unavailable = { allowed: false, status: 'unavailable', used: null, limit };

  // The key of the day a reservation was taken on, so a release just after UTC midnight never touches the next day's counter.
  let reservedKey = null;

  /** Atomically takes one call from today's allowance. Call only after validation, auth and a cache miss, immediately before the provider call. */
  async function reserveCall() {
    if (!redis || typeof redis.eval !== 'function') return unavailable;
    try {
      const at = now();
      const key = researchBudgetKey(at);
      const result = await withTimeout(Promise.resolve(redis.eval(RESERVE_SCRIPT, [key], [String(limit), String(secondsUntilNextUtcDay(at))])), timeoutMs);
      // Anything but the script's {0|1, count} pair is an unusable answer from the store, which fails closed like an outage.
      if (!Array.isArray(result) || result.length < 2) return unavailable;
      const [allowed, used] = result;
      const granted = allowed === 1 || allowed === '1';
      if (!granted && allowed !== 0 && allowed !== '0') return unavailable;
      if (granted) reservedKey = key;
      return { allowed: granted, status: granted ? 'allowed' : 'denied', used: Number(used) || 0, limit };
    } catch { return unavailable; }
  }

  /** Best effort. Used only when a reserved call was provably never sent to the provider. */
  async function releaseCall() {
    if (!redis || typeof redis.eval !== 'function' || !reservedKey) return false;
    const key = reservedKey;
    reservedKey = null;
    try { await withTimeout(Promise.resolve(redis.eval(RELEASE_SCRIPT, [key], [])), timeoutMs); return true; } catch { return false; }
  }

  return { reserveCall, releaseCall };
}
