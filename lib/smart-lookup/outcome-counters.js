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
 *
 * Cost cells join provider spend to the request's FINAL status, so waste per
 * outcome is exact (the per-attempt rows know cost but not outcome). Provider
 * and model are the only identifiers; the model comes from our own config:
 *   route_cost:<mode>:<status>:<metric>:<provider>:<model>   every attempt of the request
 *   route_fb:<mode>:<metric>:<provider>:<model>              only attempts that were fallbacks
 *   route_gr_lookups:<mode>:<status>                         requests that sent >=1 grounded call
 * Refinement writes the same shapes under the `refine` route with mode `refinement`.
 */

const GROUNDED_EVIDENCE = new Set(['gemini-grounded', 'openai-web', 'xai-web', 'serper-extracted']);

export const REFINEMENT_MODE = 'refinement';
const REFINEMENT_STATUSES = new Set(['resolved', 'ranked', 'ambiguous', 'ambiguous_with_era', 'conflict', 'unavailable']);

/** [counter code, rollUpByModel() field]. Codes are short because field names carry mode+status+model. */
export const COST_METRICS = Object.freeze([
  ['c', 'calls'],
  ['g', 'groundedCalls'],
  ['gb', 'groundedBillable'],
  ['sq', 'searchQueries'],
  ['sqr', 'searchQueriesReported'],
  ['rl', 'rateLimited'],
  ['in', 'inputTokens'],
  ['out', 'outputTokens'],
  ['th', 'thinkingTokens'],
]);

function positive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** One entry per non-zero metric per provider/model row. */
function costCellEntries(prefix, rows) {
  const entries = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    for (const [code, field] of COST_METRICS) {
      const amount = positive(row[field]);
      if (amount > 0) entries.push([`${prefix}:${code}:${row.provider}:${row.model}`, amount]);
    }
  }
  return entries;
}

function spendEntries(mode, status, summary) {
  const byModel = Array.isArray(summary.byModel) ? summary.byModel : [];
  const entries = [
    ...costCellEntries(`route_cost:${mode}:${status}`, byModel),
    ...costCellEntries(`route_fb:${mode}`, summary.fallbackByModel),
  ];
  if (byModel.some((row) => row.groundedCalls > 0)) entries.push([`route_gr_lookups:${mode}:${status}`, 1]);
  return entries;
}

/**
 * Refinement counters (route `refine`): same status/spend join as the age route,
 * keyed by the refinement response status instead of the Smart Lookup status.
 */
export function buildRefinementCounterEntries({ status, summary = {}, attempts = 0 } = {}) {
  const safeStatus = REFINEMENT_STATUSES.has(status) ? status : 'unavailable';
  const entries = [
    [`route_mode:${REFINEMENT_MODE}`, 1],
    [`route_status:${REFINEMENT_MODE}:${safeStatus}`, 1],
  ];
  if (positive(attempts) > 0) entries.push([`route_attempts:${REFINEMENT_MODE}`, positive(attempts)]);
  return [...entries, ...spendEntries(REFINEMENT_MODE, safeStatus, summary)];
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
  return [...entries, ...spendEntries(mode, outcome.resultStatus, summary)];
}
