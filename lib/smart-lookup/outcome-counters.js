import { classifySmartOutcome } from './outcome.js';

/**
 * Daily Redis counters for Smart Lookup outcomes, written into the existing
 * `provider-usage:v1:<UTC day>` hash (see provider-usage.js) so they survive the
 * ~1 hour Vercel log retention. Every field is categorical or a count: no query,
 * model, serial, IP or visitor identifier ever enters a counter name.
 *
 *   result_status:<status>                 requests by final status
 *   result_reason:<reason>                 requests by outcome reason
 *   year_signal:<signal>                   requests by amount of dated information
 *   route_mode:<mode>                      requests per route (none = never routed)
 *   route_status:<mode>:<status>           mode x status (useful-result rate, error rate)
 *   route_attempts:<mode>                  provider HTTP attempts (avg = / route_mode)
 *   route_tokens_in:<mode> / _out          provider tokens
 *   route_grounded:<mode>                  requests answered with web-grounded sources
 *   route_logical_ai:<mode>                logical AI lookup credits consumed
 *   route_retry:<mode>                     requests that were an explicit Retry
 */

const GROUNDED_EVIDENCE = new Set(['gemini-grounded', 'openai-web', 'xai-web', 'serper-extracted']);

function positive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/**
 * @param {{payload: object|null, summary?: object, attempts?: number, creditCounted?: boolean, retry?: boolean}} input
 * @returns {Array<[string, number]>} [eventName, amount] pairs; empty when there is nothing to count.
 */
export function buildOutcomeCounterEntries({
  payload, summary = {}, attempts = 0, creditCounted = false, retry = false,
} = {}) {
  if (!payload || typeof payload !== 'object') return [];
  const outcome = classifySmartOutcome(payload);
  const mode = outcome.routeMode || 'none';
  const entries = [
    [`result_status:${outcome.resultStatus}`, 1],
    [`result_reason:${outcome.outcomeReason}`, 1],
    [`year_signal:${outcome.yearSignal}`, 1],
    [`route_mode:${mode}`, 1],
    [`route_status:${mode}:${outcome.resultStatus}`, 1],
  ];
  const optional = [
    [`route_attempts:${mode}`, positive(attempts)],
    [`route_tokens_in:${mode}`, positive(summary.inputTokens)],
    [`route_tokens_out:${mode}`, positive(summary.outputTokens)],
    [`route_grounded:${mode}`, GROUNDED_EVIDENCE.has(payload.evidenceSource) && Array.isArray(payload.sources) && payload.sources.length ? 1 : 0],
    [`route_logical_ai:${mode}`, creditCounted ? 1 : 0],
    [`route_retry:${mode}`, retry ? 1 : 0],
  ];
  for (const [name, amount] of optional) if (amount > 0) entries.push([name, amount]);
  return entries;
}
