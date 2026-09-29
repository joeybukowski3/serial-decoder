import { boundedRedisGet, boundedRedisSet } from './redis.js';

/**
 * Short cross-request cooldown after a Gemini 429.
 *
 * Without it, every request during a throttle still spends one Gemini call just
 * to learn the API is throttled (and AI Studio counts each 429). While the
 * cooldown is active, callers skip Gemini entirely and use Groq/OpenAI or the
 * deterministic reserve. State lives in Redis (shared across serverless
 * instances) with an in-process copy so a warm instance stays consistent even
 * when Redis is briefly slow. Redis failures never extend or shorten the
 * cooldown on their own: they are treated as "no cooldown recorded".
 */

export const GEMINI_COOLDOWN_KEY = 'gemini-cooldown:v1';
export const DEFAULT_COOLDOWN_SECONDS = 60;
const MIN_COOLDOWN_SECONDS = 15;
const MAX_COOLDOWN_SECONDS = 300;

export function resolveCooldownSeconds({ env = process.env, retryAfterSeconds = null } = {}) {
  const configured = Number.parseInt(env?.GEMINI_RATE_LIMIT_COOLDOWN_SECONDS, 10);
  const base = Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_COOLDOWN_SECONDS;
  const requested = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds : base;
  return Math.min(MAX_COOLDOWN_SECONDS, Math.max(MIN_COOLDOWN_SECONDS, Math.ceil(requested)));
}

export function createGeminiCooldown({ now = Date.now, env = process.env } = {}) {
  let memoryUntil = 0;
  return {
    async isActive(redis, deadline) {
      if (now() < memoryUntil) return true;
      if (!redis) return false;
      const read = await boundedRedisGet(redis, GEMINI_COOLDOWN_KEY, deadline || { run: (_s, op) => op({}) }, {
        stage: 'gemini-cooldown-read', maxMs: 200,
      });
      if (read.status !== 'hit') return false;
      memoryUntil = now() + 5000; // short local memo so a burst does not re-read Redis every call
      return true;
    },
    async mark(redis, deadline, { retryAfterSeconds = null } = {}) {
      const seconds = resolveCooldownSeconds({ env, retryAfterSeconds });
      memoryUntil = now() + seconds * 1000;
      if (!redis) return seconds;
      await boundedRedisSet(redis, GEMINI_COOLDOWN_KEY, '1', seconds, deadline || { run: (_s, op) => op({}) }, {
        stage: 'gemini-cooldown-write', maxMs: 200,
      });
      return seconds;
    },
  };
}
