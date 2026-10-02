import { COST_METRICS } from './outcome-counters.js';
import {
  EMPTY_COST, addCosts, addUsage, emptyUsage, estimateUsageCost, perUnit,
} from './cost-estimate.js';

/**
 * Cost-efficiency report built from the daily provider-usage summary
 * (summarizeUsage()) and a cost config. Pure; every figure is an ESTIMATE of
 * application-side cost (tokens x configured rates), never an invoice.
 *
 * Attribution is exact for mode x final-status x model because the request-time
 * counters (outcome-counters.js) join spend to the outcome. Spend that has no
 * joined outcome (a best-effort counter write that timed out, a path that
 * produced no payload) shows up as `unattributed` in `reconciliation`.
 */

export const REPORT_MODES = Object.freeze(['general_guidance', 'precision_research', 'refinement']);
const UNROUTED_MODE = 'none';
const REFINEMENT = 'refinement';

const METRIC_FIELD = Object.fromEntries(COST_METRICS);

const AGE_CATEGORIES = {
  resolved: 'useful', partial: 'useful', 'needs-detail': 'needsDetail', 'no-result': 'noResult', error: 'error', conflict: 'other',
};
const REFINEMENT_CATEGORIES = {
  resolved: 'useful', ranked: 'useful', ambiguous: 'other', ambiguous_with_era: 'other', conflict: 'other', unavailable: 'error',
};
const CATEGORY_NAMES = ['useful', 'noResult', 'error', 'needsDetail', 'other'];

const routeOfMode = (mode) => (mode === REFINEMENT ? 'refine' : 'age');
const categoryOf = (mode, status) => (mode === REFINEMENT ? REFINEMENT_CATEGORIES : AGE_CATEGORIES)[status] || 'other';
const count = (map, key) => map[key] || 0;

const newModeAccumulator = () => ({
  requests: 0, statuses: {}, attempts: 0, credits: 0, retries: 0, groundedLookups: {}, cells: {}, fallback: {},
});

function addCell(target, provider, model, field, value) {
  const key = `${provider}|${model}`;
  const cell = target[key] || { provider, model, usage: emptyUsage() };
  cell.usage = { ...cell.usage, [field]: cell.usage[field] + value };
  target[key] = cell;
}

/** Folds `event:` counters (summary.events) into per-mode accumulators. */
export function parseModeEvents(events = {}) {
  const modes = {};
  const mode = (name) => modes[name] || (modes[name] = newModeAccumulator());
  for (const [key, raw] of Object.entries(events)) {
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    const parts = key.slice(key.indexOf('|') + 1).split(':');
    const [kind, name] = parts;
    if (kind === 'route_mode') mode(name).requests += value;
    else if (kind === 'route_status') mode(name).statuses[parts[2]] = count(mode(name).statuses, parts[2]) + value;
    else if (kind === 'route_attempts') mode(name).attempts += value;
    else if (kind === 'route_logical_ai') mode(name).credits += value;
    else if (kind === 'route_retry') mode(name).retries += value;
    else if (kind === 'route_gr_lookups') mode(name).groundedLookups[parts[2]] = count(mode(name).groundedLookups, parts[2]) + value;
    else if (kind === 'route_cost' && METRIC_FIELD[parts[3]]) {
      const cells = mode(name).cells[parts[2]] || (mode(name).cells[parts[2]] = {});
      addCell(cells, parts[4], parts.slice(5).join(':'), METRIC_FIELD[parts[3]], value);
    } else if (kind === 'route_fb' && METRIC_FIELD[parts[2]]) {
      addCell(mode(name).fallback, parts[3], parts.slice(4).join(':'), METRIC_FIELD[parts[2]], value);
    }
  }
  return modes;
}

function priceCells(config, cells) {
  return Object.values(cells).reduce((total, cell) => addCosts(total, estimateUsageCost(config, cell.provider, cell.model, cell.usage)), EMPTY_COST);
}

function sumUsage(cellMaps) {
  return cellMaps.flatMap((cells) => Object.values(cells)).reduce((total, cell) => addUsage(total, cell.usage), emptyUsage());
}

function modelRows(config, statusCells) {
  const merged = {};
  for (const cells of Object.values(statusCells)) {
    for (const cell of Object.values(cells)) {
      const key = `${cell.provider}|${cell.model}`;
      merged[key] = { ...cell, usage: addUsage(merged[key]?.usage, cell.usage) };
    }
  }
  return Object.values(merged)
    .map((cell) => ({ provider: cell.provider, model: cell.model, ...cell.usage, cost: estimateUsageCost(config, cell.provider, cell.model, cell.usage) }))
    .sort((a, b) => b.calls - a.calls);
}

function categoryBreakdown(mode, statuses, costByStatus, total) {
  const result = Object.fromEntries(CATEGORY_NAMES.map((name) => [name, { requests: 0, cost: EMPTY_COST }]));
  for (const status of new Set([...Object.keys(statuses), ...Object.keys(costByStatus)])) {
    const bucket = result[categoryOf(mode, status)];
    bucket.requests += count(statuses, status);
    bucket.cost = addCosts(bucket.cost, costByStatus[status] || EMPTY_COST);
  }
  return Object.fromEntries(Object.entries(result).map(([name, bucket]) => [
    name,
    { ...bucket, share: total.total === null || !(total.total > 0) || bucket.cost.total === null ? null : bucket.cost.total / total.total },
  ]));
}

/** One mode's volumes, estimated cost and cost-per-outcome figures. */
export function summarizeMode(mode, acc, config, paidLookups = null) {
  const costByStatus = Object.fromEntries(Object.entries(acc.cells).map(([status, cells]) => [status, priceCells(config, cells)]));
  const usage = sumUsage(Object.values(acc.cells));
  const cost = Object.values(costByStatus).reduce(addCosts, EMPTY_COST);
  const spend = (status) => (costByStatus[status] || EMPTY_COST).total;
  const statusCount = (...names) => names.reduce((sum, name) => sum + count(acc.statuses, name), 0);
  const useful = mode === REFINEMENT ? statusCount('resolved', 'ranked') : statusCount('resolved', 'partial');
  const groundedLookups = Object.values(acc.groundedLookups).reduce((sum, value) => sum + value, 0);
  const searchKnown = usage.searchQueriesReported > 0;

  return {
    mode,
    requests: acc.requests,
    creditLookups: mode === REFINEMENT ? paidLookups : acc.credits,
    retries: acc.retries,
    attempts: acc.attempts,
    statuses: acc.statuses,
    usefulResults: useful,
    groundedProviderRequests: usage.groundedCalls,
    ungroundedProviderRequests: Math.max(0, usage.calls - usage.groundedCalls),
    groundedLookups,
    groundedShare: perUnit(groundedLookups, acc.requests),
    searchQueries: { known: searchKnown, count: usage.searchQueries, reportedOn: usage.searchQueriesReported, groundedCalls: usage.groundedCalls },
    tokens: { input: usage.inputTokens, output: usage.outputTokens, thinking: usage.thinkingTokens },
    avgInputTokens: perUnit(usage.inputTokens, acc.requests),
    avgOutputTokens: perUnit(usage.outputTokens + usage.thinkingTokens, acc.requests),
    avgAttempts: perUnit(acc.attempts, acc.requests),
    cost,
    costByStatus,
    perLookup: perUnit(cost.total, acc.requests),
    perResolved: perUnit(cost.total, count(acc.statuses, 'resolved')),
    perUseful: perUnit(cost.total, useful),
    avgSpendPerNoResult: perUnit(spend('no-result'), count(acc.statuses, 'no-result')),
    avgSpendPerNeedsDetail: perUnit(spend('needs-detail'), count(acc.statuses, 'needs-detail')),
    avgSpendPerError: perUnit(spend('error'), count(acc.statuses, 'error')),
    usefulRate: perUnit(useful, acc.requests),
    needsDetailRate: perUnit(count(acc.statuses, 'needs-detail'), acc.requests),
    noResultRate: perUnit(count(acc.statuses, 'no-result'), acc.requests),
    narrowingRate: mode === REFINEMENT ? perUnit(useful, acc.requests) : null,
    groundedByStatus: Object.fromEntries(Object.entries(acc.cells).map(([status, cells]) => [status, {
      providerRequests: sumUsage([cells]).groundedCalls,
      lookups: count(acc.groundedLookups, status),
      requests: count(acc.statuses, status),
    }])),
    models: modelRows(config, acc.cells),
    breakdown: categoryBreakdown(mode, acc.statuses, costByStatus, cost),
    rateLimitedAttempts: usage.rateLimited,
    fallback: {
      calls: sumUsage([acc.fallback]).calls,
      cost: priceCells(config, acc.fallback),
    },
  };
}

/** Merges category breakdowns of several modes into one overall split. */
function mergeBreakdowns(summaries) {
  const total = summaries.reduce((sum, mode) => addCosts(sum, mode.cost), EMPTY_COST);
  const merged = Object.fromEntries(CATEGORY_NAMES.map((name) => [name, summaries.reduce(
    (bucket, mode) => ({ requests: bucket.requests + mode.breakdown[name].requests, cost: addCosts(bucket.cost, mode.breakdown[name].cost) }),
    { requests: 0, cost: EMPTY_COST },
  )]));
  return {
    total,
    categories: Object.fromEntries(Object.entries(merged).map(([name, bucket]) => [
      name,
      { ...bucket, share: total.total === null || !(total.total > 0) || bucket.cost.total === null ? null : bucket.cost.total / total.total },
    ])),
  };
}

function rowCost(config, row) {
  return estimateUsageCost(config, row.provider, row.model, {
    ...row, searchQueriesReported: row.searchReported,
  });
}

/**
 * Per-attempt spend by route (all providers, all routes) against the spend the
 * joined counters could attribute to an outcome.
 */
function reconcile(summary, modeSummaries, config) {
  const routes = {};
  for (const row of summary.rows) {
    const entry = routes[row.route] || (routes[row.route] = { route: row.route, calls: 0, cost: EMPTY_COST });
    routes[row.route] = { ...entry, calls: entry.calls + row.calls, cost: addCosts(entry.cost, rowCost(config, row)) };
  }
  const attributed = (route) => modeSummaries
    .filter((mode) => routeOfMode(mode.mode) === route)
    .reduce((sum, mode) => addCosts(sum, mode.cost), EMPTY_COST);
  return Object.values(routes).sort((a, b) => b.calls - a.calls).map((entry) => {
    const joined = ['age', 'refine'].includes(entry.route) ? attributed(entry.route) : null;
    return {
      route: entry.route,
      calls: entry.calls,
      cost: entry.cost,
      attributed: joined,
      unattributed: joined && entry.cost.total !== null && joined.total !== null ? Math.max(0, entry.cost.total - joined.total) : null,
    };
  });
}

/**
 * @param {{rows: object[], events: Record<string, number>}} summary summarizeUsage() result
 * @param {{rates: Record<string, number>}} config loadCostConfig() result
 */
export function buildCostReport(summary, config) {
  const parsed = parseModeEvents(summary.events);
  const paid = summary.events['refine|paid_lookup'] ?? null;
  const names = [...REPORT_MODES, ...(parsed[UNROUTED_MODE] ? [UNROUTED_MODE] : [])];
  const modes = names.map((name) => summarizeMode(name, parsed[name] || newModeAccumulator(), config, name === REFINEMENT ? paid : null));
  const byName = Object.fromEntries(modes.map((mode) => [mode.mode, mode]));
  const smartLookup = modes.filter((mode) => mode.mode !== REFINEMENT);
  const missing = [...new Set(modes.flatMap((mode) => [...mode.cost.missing, ...mode.fallback.cost.missing]))];
  return {
    modes: byName,
    order: names,
    overall: mergeBreakdowns(smartLookup),
    refinement: byName[REFINEMENT],
    reconciliation: reconcile(summary, modes, config),
    missingPricing: missing,
  };
}
