import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import { isTimeoutError } from './deadline.js';

export function createRedisClient(env = process.env) {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return null;
  return new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
}

export function createProviderRateLimiter(redis, options = {}) {
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(options.requests || 15, options.window || '1 m'),
    analytics: false,
    prefix: options.prefix || 'smart-lookup-provider-v2',
  });
}

export function getClientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (Array.isArray(forwarded) && forwarded.length) return String(forwarded[0]).split(',')[0].trim();
  if (forwarded) return String(forwarded).split(',')[0].trim();
  const realIp = req.headers?.['x-real-ip'];
  if (realIp) return String(realIp).trim();
  return req.socket?.remoteAddress || 'unknown';
}

function safeStatus(error) {
  if (isTimeoutError(error)) return 'timeout';
  return 'unavailable';
}

export async function boundedRedisGet(redis, key, deadline, options = {}) {
  if (!redis || !key) return { status: 'unavailable', value: null, elapsedMs: 0 };
  const started = Date.now();
  try {
    const value = await deadline.run(options.stage || 'redis-get', () => redis.get(key), {
      maxMs: options.maxMs || 250,
      reserveMs: options.reserveMs || 0,
    });
    return {
      status: value == null ? 'miss' : 'hit',
      value: value == null ? null : value,
      elapsedMs: Date.now() - started,
    };
  } catch (error) {
    return { status: safeStatus(error), value: null, elapsedMs: Date.now() - started };
  }
}

export async function boundedRedisSet(redis, key, value, ttlSeconds, deadline, options = {}) {
  if (!redis || !key || !value || !ttlSeconds) return { status: 'bypass', elapsedMs: 0 };
  const started = Date.now();
  try {
    await deadline.run(options.stage || 'redis-set', () => redis.set(key, value, { ex: ttlSeconds }), {
      maxMs: options.maxMs || 200,
      reserveMs: options.reserveMs || 0,
    });
    return { status: 'written', elapsedMs: Date.now() - started };
  } catch (error) {
    return { status: safeStatus(error), elapsedMs: Date.now() - started };
  }
}

export async function boundedRateLimit(rateLimiter, identifier, deadline, options = {}) {
  if (!rateLimiter) return { status: 'unavailable', success: true, reset: null, elapsedMs: 0 };
  const started = Date.now();
  try {
    const result = await deadline.run(options.stage || 'provider-rate-limit', () => rateLimiter.limit(identifier), {
      maxMs: options.maxMs || 250,
      reserveMs: options.reserveMs || 0,
    });
    return {
      status: 'ok',
      success: result?.success !== false,
      reset: result?.reset || null,
      elapsedMs: Date.now() - started,
    };
  } catch (error) {
    return { status: safeStatus(error), success: true, reset: null, elapsedMs: Date.now() - started };
  }
}
