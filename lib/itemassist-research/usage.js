/**
 * Sanitized usage counters for ItemAssist Research: one Redis hash per UTC day in a research-only namespace (the shared
 * `provider-usage:v1:` hash is never written). Fields are categorical or numeric only: outcome, cache hit, provider status and
 * token counts. Never a query, answer text, header, IP address or key.
 */

export const RESEARCH_USAGE_PREFIX = 'itemassist-research:usage:v1:';
export const USAGE_TTL_SECONDS = 45 * 24 * 60 * 60;
const WRITE_TIMEOUT_MS = 150;

const segment = (value) => String(value ?? 'none').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40) || 'none';
const count = (value) => (Number.isFinite(value) && value > 0 ? Math.round(value) : 0);

export const researchUsageKey = (now = Date.now()) => `${RESEARCH_USAGE_PREFIX}${new Date(now).toISOString().slice(0, 10)}`;

/** Counter fields for one finished request. `outcome` is a public status or an error code. */
export function usageFields({ outcome, cacheHit = false, providerCalled = false, providerErrorCode = null, usage = {}, serperCredits = 0, serperCalls = 0 }) {
  const fields = [['requests', 1], [`outcome:${segment(outcome)}`, 1]];
  if (cacheHit) fields.push(['cache_hit', 1]);
  if (count(serperCalls)) fields.push(['serper_calls', count(serperCalls)], ['serper_credits', count(serperCredits)]);
  if (providerCalled) {
    fields.push(['provider_calls', 1]);
    if (providerErrorCode) fields.push([`provider_error:${segment(providerErrorCode)}`, 1]);
    for (const [name, value] of [['in_tokens', usage.inputTokens], ['out_tokens', usage.outputTokens], ['think_tokens', usage.thinkingTokens]]) {
      if (count(value)) fields.push([name, count(value)]);
    }
  }
  return fields;
}

/** Best effort: never throws and never delays a reply beyond the write timeout. */
export async function recordResearchUsage(redis, event, now = Date.now()) {
  if (!redis) return false;
  const key = researchUsageKey(now);
  const work = (async () => {
    if (typeof redis.pipeline === 'function') {
      const pipeline = redis.pipeline();
      for (const [field, amount] of usageFields(event)) pipeline.hincrby(key, field, amount);
      pipeline.expire(key, USAGE_TTL_SECONDS);
      await pipeline.exec();
      return true;
    }
    if (typeof redis.hincrby !== 'function') return false;
    for (const [field, amount] of usageFields(event)) await redis.hincrby(key, field, amount);
    if (typeof redis.expire === 'function') await redis.expire(key, USAGE_TTL_SECONDS);
    return true;
  })();
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(false), WRITE_TIMEOUT_MS); });
  try { return await Promise.race([work, timeout]); } catch { return false; } finally { clearTimeout(timer); work.catch(() => {}); }
}
