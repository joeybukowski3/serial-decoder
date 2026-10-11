import { secondsUntilNextUtcDay, utcBudgetDate } from '../smart-lookup/budget.js';

/**
 * Daily provider-search budget for the Replacement Finder API.
 *
 * It lives in its own Redis namespace, so it can never consume (or be consumed by) the Smart Lookup age/LKQ budgets, and it
 * counts actual provider search attempts, one reservation immediately before each search, not HTTP requests. The store is
 * required: when it is missing or failing the budget fails CLOSED and no new provider search starts.
 */

export const BUDGET_NAMESPACE = 'replacement-finder-budget:v1';
export const DEFAULT_DAILY_SEARCH_LIMIT = 100;
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

const positiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export function replacementBudgetConfig(env = process.env) {
  return { dailySearchLimit: positiveInteger(env.ITEMASSIST_REPLACEMENT_DAILY_SEARCH_LIMIT, DEFAULT_DAILY_SEARCH_LIMIT) };
}

export const replacementBudgetKey = (now = Date.now()) => `${BUDGET_NAMESPACE}:searches:${utcBudgetDate(now)}`;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('STORE_TIMEOUT')), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * @param {{redis: {eval?: Function, get?: Function}|null, config?: {dailySearchLimit: number}, now?: () => number, timeoutMs?: number}} options
 * @returns {{peek: () => Promise<object>, reserveSearch: () => Promise<object>}}
 */
export function createReplacementBudget({ redis, config = replacementBudgetConfig(), now = Date.now, timeoutMs = STORE_TIMEOUT_MS } = {}) {
  const limit = config.dailySearchLimit;
  const unavailable = { allowed: false, status: 'unavailable', used: null, limit };

  /** Read-only. Lets the route refuse before any provider work when the day is already spent. */
  async function peek() {
    if (!redis || typeof redis.get !== 'function') return unavailable;
    try {
      const used = Number(await withTimeout(Promise.resolve(redis.get(replacementBudgetKey(now()))), timeoutMs)) || 0;
      return { allowed: used < limit, status: used < limit ? 'allowed' : 'denied', used, limit };
    } catch { return unavailable; }
  }

  /** Atomically takes one search from today's allowance. Call immediately before each provider search. */
  async function reserveSearch() {
    if (!redis || typeof redis.eval !== 'function') return unavailable;
    try {
      const result = await withTimeout(Promise.resolve(redis.eval(RESERVE_SCRIPT, [replacementBudgetKey(now())], [String(limit), String(secondsUntilNextUtcDay(now()))])), timeoutMs);
      const [allowed, used] = Array.isArray(result) ? result : [];
      const granted = allowed === 1 || allowed === '1';
      return { allowed: granted, status: granted ? 'allowed' : 'denied', used: Number(used) || 0, limit };
    } catch { return unavailable; }
  }

  return { peek, reserveSearch };
}
