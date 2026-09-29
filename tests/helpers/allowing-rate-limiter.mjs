/**
 * Paid-provider handlers now fail CLOSED when their rate-limit store is
 * unavailable (see lib/smart-lookup/redis.js boundedRateLimit). Tests that
 * exercise provider behavior with a mocked Redis must therefore supply a
 * working limiter explicitly; tests about limiter failure inject their own.
 */
export const allowingRateLimiter = Object.freeze({
  limit: async () => ({ success: true, remaining: 999, reset: Date.now() + 60_000 }),
});
