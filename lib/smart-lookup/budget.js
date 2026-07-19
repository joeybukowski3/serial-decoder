const DEFAULT_LIMITS = {
  ageLogical: 120,
  lkqLogical: 80,
  combinedLogical: 180,
};

const RESERVE_SCRIPT = `
local serviceCurrent = tonumber(redis.call("GET", KEYS[1]) or "0")
local combinedCurrent = tonumber(redis.call("GET", KEYS[2]) or "0")
local serviceLimit = tonumber(ARGV[1])
local combinedLimit = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])
if serviceCurrent >= serviceLimit or combinedCurrent >= combinedLimit then
  return {0, serviceCurrent, combinedCurrent}
end
serviceCurrent = redis.call("INCR", KEYS[1])
combinedCurrent = redis.call("INCR", KEYS[2])
redis.call("EXPIRE", KEYS[1], ttl)
redis.call("EXPIRE", KEYS[2], ttl)
return {1, serviceCurrent, combinedCurrent}
`;

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function smartLookupBudgetConfig(env = process.env) {
  return {
    ageLogicalLimit: positiveInteger(env.SMART_LOOKUP_AGE_DAILY_LIMIT, DEFAULT_LIMITS.ageLogical),
    lkqLogicalLimit: positiveInteger(env.SMART_LOOKUP_LKQ_DAILY_LIMIT, DEFAULT_LIMITS.lkqLogical),
    combinedLogicalLimit: positiveInteger(env.SMART_LOOKUP_COMBINED_DAILY_LIMIT, DEFAULT_LIMITS.combinedLogical),
  };
}

export function utcBudgetDate(value = Date.now()) {
  return new Date(value).toISOString().slice(0, 10);
}

export function secondsUntilNextUtcDay(value = Date.now()) {
  const now = new Date(value);
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

function keysFor(kind, dateKey) {
  return {
    logical: `smart-budget:${kind}:logical:${dateKey}`,
    attempts: `smart-budget:${kind}:attempts:${dateKey}`,
    combinedLogical: `smart-budget:combined:logical:${dateKey}`,
    combinedAttempts: `smart-budget:combined:attempts:${dateKey}`,
  };
}

function limitFor(kind, config) {
  return kind === 'lkq' ? config.lkqLogicalLimit : config.ageLogicalLimit;
}

function parseEvalResult(result) {
  const values = Array.isArray(result) ? result : [];
  return {
    allowed: values[0] === 1 || values[0] === '1',
    serviceCount: Number(values[1] || 0),
    combinedCount: Number(values[2] || 0),
  };
}

export async function reserveProviderBudget(redis, kind, deadline, options = {}) {
  const started = Date.now();
  if (!redis || typeof redis.eval !== 'function') {
    return {
      allowed: false,
      status: 'unavailable',
      errorCode: 'BUDGET_STORE_UNAVAILABLE',
      retryAfter: 'tomorrow',
      elapsedMs: 0,
    };
  }

  const now = options.now || Date.now;
  const config = options.config || smartLookupBudgetConfig(options.env);
  const dateKey = utcBudgetDate(now());
  const ttl = secondsUntilNextUtcDay(now());
  const keys = keysFor(kind, dateKey);
  try {
    const result = await deadline.run(options.stage || `${kind}-provider-budget`, () => redis.eval(
      RESERVE_SCRIPT,
      [keys.logical, keys.combinedLogical],
      [String(limitFor(kind, config)), String(config.combinedLogicalLimit), String(ttl)]
    ), {
      maxMs: options.maxMs || 250,
      reserveMs: options.reserveMs || 0,
    });
    const parsed = parseEvalResult(result);
    return {
      allowed: parsed.allowed,
      status: parsed.allowed ? 'allowed' : 'denied',
      errorCode: parsed.allowed ? null : 'GLOBAL_BUDGET_EXHAUSTED',
      retryAfter: parsed.allowed ? null : 'tomorrow',
      logicalLookupCount: parsed.serviceCount,
      combinedLogicalLookupCount: parsed.combinedCount,
      elapsedMs: Date.now() - started,
    };
  } catch (_) {
    return {
      allowed: false,
      status: 'unavailable',
      errorCode: 'BUDGET_STORE_UNAVAILABLE',
      retryAfter: 'tomorrow',
      elapsedMs: Date.now() - started,
    };
  }
}

export async function recordProviderAttemptMetrics(redis, kind, actualAttempts, deadline, options = {}) {
  const attempts = Math.max(0, Number(actualAttempts || 0));
  if (!attempts || !redis || typeof redis.incrby !== 'function') {
    return { status: attempts ? 'unavailable' : 'bypass', actualProviderAttemptCount: attempts };
  }
  const now = options.now || Date.now;
  const dateKey = utcBudgetDate(now());
  const ttl = secondsUntilNextUtcDay(now());
  const keys = keysFor(kind, dateKey);
  try {
    const [serviceCount, combinedCount] = await deadline.run(options.stage || `${kind}-provider-attempt-metrics`, () => Promise.all([
      redis.incrby(keys.attempts, attempts),
      redis.incrby(keys.combinedAttempts, attempts),
    ]), {
      maxMs: options.maxMs || 175,
      reserveMs: options.reserveMs || 0,
    });
    if (typeof redis.expire === 'function') {
      await deadline.run(options.expireStage || `${kind}-provider-attempt-expire`, () => Promise.all([
        redis.expire(keys.attempts, ttl),
        redis.expire(keys.combinedAttempts, ttl),
      ]), {
        maxMs: options.expireMaxMs || 100,
        reserveMs: options.reserveMs || 0,
      });
    }
    return {
      status: 'recorded',
      actualProviderAttemptCount: Number(serviceCount || 0),
      combinedProviderAttemptCount: Number(combinedCount || 0),
    };
  } catch (_) {
    return { status: 'unavailable', actualProviderAttemptCount: attempts };
  }
}

export function providerAttemptCountFromMetadata(metadata, errorCode = null) {
  if (metadata?.fallbackUsed || errorCode === 'PROVIDERS_UNAVAILABLE') return 2;
  if (errorCode === 'RATE_LIMIT' || errorCode === 'GLOBAL_BUDGET_EXHAUSTED' || errorCode === 'BUDGET_STORE_UNAVAILABLE') return 0;
  return 1;
}
