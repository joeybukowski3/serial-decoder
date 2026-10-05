/**
 * Daily provider-usage aggregate in Redis.
 *
 * Vercel runtime logs on this project are retained for roughly an hour, so
 * per-day questions ("how many Gemini calls per route? what share were 429s?")
 * cannot be answered from logs. Each paid provider attempt therefore also
 * increments counters in one hash per UTC day. Counters carry only route,
 * provider, model, status and token totals -- never a query, serial, IP or key.
 *
 * Field layout (all values are integers):
 *   <route>|<provider>|<model>|calls
 *   <route>|<provider>|<model>|status:<providerStatus>
 *   <route>|<provider>|<model>|in_tokens | out_tokens | think_tokens
 *   <route>|<provider>|<model>|grounded_calls      requests sent with a search tool attached
 *   <route>|<provider>|<model>|grounded_billable   ...of which a response with usage came back
 *   <route>|<provider>|<model>|search_queries      queries the provider REPORTED (not 1 per request)
 *   <route>|<provider>|<model>|search_reported     grounded calls that reported a query count (even 0)
 *   <route>|<provider>|<model>|http:<code>         HTTP status of a NON-ok attempt (e.g. http:400)
 *   <route>|<provider>|<model>|dur:<status>:<bucket>   coarse latency per outcome (see provider-diagnostics.js)
 *   <route>|<provider>|<model>|cap_hit | timeout_route_limited   a timeout bound by the stage cap vs the route
 *   <route>|<provider>|<model>|usable_yes | usable_no   whether a usable response was received
 *   <route>|<provider>|<model>|rem:<bucket>        route budget left when the stage began
 *   <route>|fallback:<reason>
 *   <route>|event:<name>            (paid_lookup, request, gate_skip:<why>, ...)
 */
import { durationBucket, remainingBudgetBucket } from './provider-diagnostics.js';

export const USAGE_KEY_PREFIX = 'provider-usage:v1:';
export const USAGE_TTL_SECONDS = 45 * 24 * 60 * 60;
const USAGE_WRITE_TIMEOUT_MS = 150;

export function usageKeyForDate(value = Date.now()) {
  const day = typeof value === 'string' ? value : new Date(value).toISOString().slice(0, 10);
  return `${USAGE_KEY_PREFIX}${day}`;
}

const SEGMENT_MAX = 60;
// Event names embed mode, status, provider and model (route_cost:...), which
// would be silently truncated -- and merged -- at 60 characters.
const EVENT_SEGMENT_MAX = 120;

function segment(value, max = SEGMENT_MAX) {
  return String(value ?? 'none').replace(/[^a-zA-Z0-9._:-]/g, '_').slice(0, max) || 'none';
}

export function usageFieldsForAttempt(attempt) {
  const base = `${segment(attempt.route)}|${segment(attempt.provider)}|${segment(attempt.model)}`;
  const fields = [[`${base}|calls`, 1], [`${base}|status:${segment(attempt.providerStatus)}`, 1]];
  if (attempt.inputTokens > 0) fields.push([`${base}|in_tokens`, attempt.inputTokens]);
  if (attempt.outputTokens > 0) fields.push([`${base}|out_tokens`, attempt.outputTokens]);
  if (attempt.thinkingTokens > 0) fields.push([`${base}|think_tokens`, attempt.thinkingTokens]);
  if (attempt.grounded) {
    fields.push([`${base}|grounded_calls`, 1]);
    if (attempt.inputTokens != null) fields.push([`${base}|grounded_billable`, 1]);
    if (attempt.searchQueryCount != null) {
      fields.push([`${base}|search_reported`, 1]);
      if (attempt.searchQueryCount > 0) fields.push([`${base}|search_queries`, attempt.searchQueryCount]);
    }
  }
  if (attempt.fallbackReason) fields.push([`${segment(attempt.route)}|fallback:${segment(attempt.fallbackReason)}`, 1]);
  fields.push(...diagnosticFieldsForAttempt(attempt, base));
  return fields;
}

// Failure-diagnosis counters. Deliberately NOT named `status:*`: summarizeUsage
// counts every `status:` field except ok as a failure, so a per-code
// `status:http_error:400` would double count the existing `status:http_error`
// total. Only categorical values (status code, bucket label, flags) are stored.
function diagnosticFieldsForAttempt(attempt, base) {
  const fields = [];
  const code = attempt.httpStatus;
  if (attempt.providerStatus !== 'ok' && Number.isInteger(code) && code >= 100 && code <= 599) {
    fields.push([`${base}|http:${code}`, 1]);
  }
  const latency = durationBucket(attempt.durationMs);
  if (latency) fields.push([`${base}|dur:${segment(attempt.providerStatus)}:${latency}`, 1]);
  if (attempt.capHit === true) fields.push([`${base}|cap_hit`, 1]);
  else if (attempt.providerStatus === 'timeout' && attempt.capHit === false) fields.push([`${base}|timeout_route_limited`, 1]);
  if (attempt.usableResponse === true) fields.push([`${base}|usable_yes`, 1]);
  else if (attempt.usableResponse === false) fields.push([`${base}|usable_no`, 1]);
  const remaining = remainingBudgetBucket(attempt.remainingBudgetMs);
  if (remaining) fields.push([`${base}|rem:${remaining}`, 1]);
  return fields;
}

async function incrementFields(redis, fields, now = Date.now()) {
  if (!redis || !fields.length) return false;
  const key = usageKeyForDate(now);
  const work = (async () => {
    if (typeof redis.pipeline === 'function') {
      const pipeline = redis.pipeline();
      for (const [field, amount] of fields) pipeline.hincrby(key, field, amount);
      pipeline.expire(key, USAGE_TTL_SECONDS);
      await pipeline.exec();
      return true;
    }
    if (typeof redis.hincrby !== 'function') return false;
    for (const [field, amount] of fields) await redis.hincrby(key, field, amount);
    if (typeof redis.expire === 'function') await redis.expire(key, USAGE_TTL_SECONDS);
    return true;
  })();
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(false), USAGE_WRITE_TIMEOUT_MS); });
  try {
    return await Promise.race([work, timeout]);
  } catch (_) {
    return false;
  } finally {
    clearTimeout(timer);
    work.catch(() => {});
  }
}

/** Best-effort: never throws, never blocks a lookup for longer than the write timeout. */
export function recordProviderUsage(redis, attempt, now = Date.now()) {
  return incrementFields(redis, usageFieldsForAttempt(attempt), now);
}

export function recordUsageEvent(redis, route, event, amount = 1, now = Date.now()) {
  return incrementFields(redis, [[`${segment(route)}|event:${segment(event, EVENT_SEGMENT_MAX)}`, amount]], now);
}

/** Several events with explicit amounts (counts, tokens) in one pipelined write. */
export function recordUsageEventCounts(redis, route, entries, now = Date.now()) {
  return incrementFields(
    redis,
    entries
      .filter(([, amount]) => Number.isFinite(amount) && amount > 0)
      .map(([event, amount]) => [`${segment(route)}|event:${segment(event, EVENT_SEGMENT_MAX)}`, amount]),
    now,
  );
}

/** Several events in one pipelined write (e.g. a request's outcome plus its quota events). */
export function recordUsageEvents(redis, route, events, now = Date.now()) {
  return incrementFields(redis, events.map((event) => [`${segment(route)}|event:${segment(event, EVENT_SEGMENT_MAX)}`, 1]), now);
}

/** Folds the raw hash into per-route/provider/model rows plus event and fallback totals. */
export function summarizeUsage(hash = {}) {
  const rows = new Map();
  const events = {};
  const fallbacks = {};
  for (const [field, raw] of Object.entries(hash || {})) {
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    const parts = field.split('|');
    if (parts[1]?.startsWith('event:')) { events[`${parts[0]}|${parts[1].slice(6)}`] = value; continue; }
    if (parts[1]?.startsWith('fallback:')) { fallbacks[`${parts[0]}|${parts[1].slice(9)}`] = value; continue; }
    if (parts.length !== 4) continue;
    const key = parts.slice(0, 3).join('|');
    const row = rows.get(key) || {
      route: parts[0], provider: parts[1], model: parts[2],
      calls: 0, rateLimited: 0, otherFailures: 0, inputTokens: 0, outputTokens: 0, thinkingTokens: 0,
      groundedCalls: 0, groundedBillable: 0, searchQueries: 0, searchReported: 0,
    };
    const metric = parts[3];
    if (metric === 'calls') row.calls += value;
    else if (metric === 'status:rate_limited') row.rateLimited += value;
    else if (metric.startsWith('status:') && metric !== 'status:ok') row.otherFailures += value;
    else if (metric === 'in_tokens') row.inputTokens += value;
    else if (metric === 'out_tokens') row.outputTokens += value;
    else if (metric === 'think_tokens') row.thinkingTokens += value;
    else if (metric === 'grounded_calls') row.groundedCalls += value;
    else if (metric === 'grounded_billable') row.groundedBillable += value;
    else if (metric === 'search_queries') row.searchQueries += value;
    else if (metric === 'search_reported') row.searchReported += value;
    rows.set(key, row);
  }
  return { rows: [...rows.values()].sort((a, b) => b.calls - a.calls), events, fallbacks };
}

const NON_OUTCOME_EVENTS = new Set([
  'retry',
  'gemini_cooldown_skip',
  // Legacy-fallback routing counters; they annotate a request, they are not its outcome.
  'legacy_skipped_clean_null',
  'legacy_called_clean_null',
  'legacy_called_native_error',
  'legacy_called_other',
]);

/**
 * Derived, per-route metrics from a summarizeUsage() result:
 *   calls (all providers) and Gemini calls, calls per paid lookup, 429 rate,
 *   fallback rate, refinement rate (refine only), model usage and tokens.
 * Rates are null when their denominator is unknown/zero (never a fake 0).
 */
export function buildUsageReport(summary) {
  const routes = {};
  const ratio = (numerator, denominator) => (denominator > 0 ? numerator / denominator : null);
  for (const row of summary.rows) {
    const route = routes[row.route] || (routes[row.route] = {
      route: row.route, calls: 0, geminiCalls: 0, rateLimited: 0, geminiRateLimited: 0, otherFailures: 0,
      inputTokens: 0, outputTokens: 0, thinkingTokens: 0, fallbacks: 0, models: {},
      groundedCalls: 0, searchQueries: 0,
    });
    route.groundedCalls += row.groundedCalls;
    route.searchQueries += row.searchQueries;
    route.calls += row.calls;
    route.rateLimited += row.rateLimited;
    route.otherFailures += row.otherFailures;
    route.inputTokens += row.inputTokens;
    route.outputTokens += row.outputTokens;
    route.thinkingTokens += row.thinkingTokens;
    if (row.provider === 'gemini') {
      route.geminiCalls += row.calls;
      route.geminiRateLimited += row.rateLimited;
    }
    route.models[`${row.provider}/${row.model}`] = (route.models[`${row.provider}/${row.model}`] || 0) + row.calls;
  }
  for (const [key, count] of Object.entries(summary.fallbacks)) {
    const name = key.split('|')[0];
    if (routes[name]) routes[name].fallbacks += count;
  }
  for (const route of Object.values(routes)) {
    const paidLookups = summary.events[`${route.route}|paid_lookup`] ?? null;
    route.paidLookups = paidLookups;
    route.callsPerPaidLookup = ratio(route.calls, paidLookups);
    route.rateLimitRate = ratio(route.rateLimited, route.calls);
    route.fallbackRate = ratio(route.fallbacks, route.calls);
    if (route.route === 'refine') {
      const outcomes = Object.entries(summary.events)
        .filter(([key]) => key.startsWith('refine|') && !NON_OUTCOME_EVENTS.has(key.slice(7)))
        .reduce((total, [, count]) => total + count, 0);
      route.refineRequestsCounted = outcomes;
      route.refinementRate = ratio(paidLookups ?? 0, outcomes);
    }
  }
  return { routes: Object.values(routes).sort((a, b) => b.calls - a.calls), events: summary.events };
}

/** Raw day hash (read-only); {} when Redis is unavailable. */
export async function readProviderUsageHash(redis, day) {
  if (!redis || typeof redis.hgetall !== 'function') return {};
  return (await redis.hgetall(usageKeyForDate(day))) || {};
}

export async function readProviderUsage(redis, day) {
  return summarizeUsage(await readProviderUsageHash(redis, day));
}
