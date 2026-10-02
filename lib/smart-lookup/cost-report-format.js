import { COST_UNAVAILABLE, formatUsd } from './cost-estimate.js';

/**
 * Text rendering of buildCostReport() for scripts/report-provider-usage.mjs.
 * Returns lines (no I/O) so the wording can be pinned by tests.
 */

const pct = (value) => (value === null || value === undefined ? 'n/a' : `${(value * 100).toFixed(1)}%`);
const num = (value) => (value === null || value === undefined ? 'n/a' : Number.isInteger(value) ? String(value) : value.toFixed(1));
const usd = (value) => formatUsd(value);
// A ratio is 'n/a' when there is nothing to divide by, 'cost unavailable' only when a price is missing.
const per = (value, denominator) => (denominator > 0 ? usd(value) : 'n/a (none)');
// Null (unavailable) stays null instead of being treated as 0.
const plus = (a, b) => (a === null || b === null ? null : a + b);

const MODE_NOTES = {
  none: 'unrouted: answers that never entered a route mode',
  refinement: 'serial-date refinement (route refine); a "resolved/ranked" status counts as useful',
};

const count = (mode, status) => mode.statuses[status] || 0;

function searchQueryText(mode) {
  const { known, count, reportedOn, groundedCalls } = mode.searchQueries;
  if (!groundedCalls) return 'n/a (no grounded requests)';
  if (!known) return 'n/a (provider reported none; not assumed from request count)';
  return `${count} reported on ${reportedOn} of ${groundedCalls} grounded requests`;
}

function modeLines(mode) {
  const lines = [`   [${mode.mode}]${MODE_NOTES[mode.mode] ? `  (${MODE_NOTES[mode.mode]})` : ''}`];
  if (!mode.requests && !mode.attempts) return [...lines, '       no requests recorded'];
  lines.push(
    `       logical lookups (requests): ${mode.requests}   credit-counted: ${num(mode.creditLookups)}   provider attempts: ${mode.attempts}`,
    `       grounded provider requests: ${mode.groundedProviderRequests}   ungrounded: ${mode.ungroundedProviderRequests}   search queries: ${searchQueryText(mode)}`,
    `       tokens: input ${mode.tokens.input}   output ${mode.tokens.output}   thinking ${mode.tokens.thinking}`,
    `       est. token cost: ${usd(mode.cost.token)}   est. grounding/search cost: ${usd(mode.cost.grounding)}   est. total: ${usd(mode.cost.total)}`,
    `       cost/lookup ${per(mode.perLookup, mode.requests)}   cost/resolved result ${per(mode.perResolved, count(mode, 'resolved'))}   cost/useful result (${mode.mode === 'refinement' ? 'resolved+ranked' : 'resolved+partial'}) ${per(mode.perUseful, mode.usefulResults)}`,
    `       avg spend per no-result request ${per(mode.avgSpendPerNoResult, count(mode, 'no-result'))}   per needs-detail request ${per(mode.avgSpendPerNeedsDetail, count(mode, 'needs-detail'))}   per error request ${per(mode.avgSpendPerError, count(mode, 'error'))}`,
  );
  for (const model of mode.models) {
    lines.push(`         ${String(model.calls).padStart(5)} calls (${model.groundedCalls} grounded)  ${model.provider}/${model.model}  est. ${usd(model.cost.total)}`);
  }
  return lines;
}

function unproductiveLines(report) {
  const { total, categories: c } = report.overall;
  const lines = [
    `   Smart Lookup modes, attributed by final outcome (total est. ${usd(total.total)})`,
    `     tied to resolved/partial:  ${usd(c.useful.cost.total)}  ${pct(c.useful.share)}`,
    `     tied to no-result/error:   ${usd(plus(c.noResult.cost.total, c.error.cost.total))}  ${pct(plus(c.noResult.share, c.error.share))}`,
    `     tied to needs-detail:      ${usd(c.needsDetail.cost.total)}  ${pct(c.needsDetail.share)}   (not a successful precision result)`,
    `     tied to conflict/other:    ${usd(c.other.cost.total)}  ${pct(c.other.share)}`,
    '   by cause',
    `     no-result:      ${usd(c.noResult.cost.total)}  over ${c.noResult.requests} requests`,
    `     error:          ${usd(c.error.cost.total)}  over ${c.error.requests} requests`,
    `     needs-detail:   ${usd(c.needsDetail.cost.total)}  over ${c.needsDetail.requests} requests`,
  ];
  const modes = report.order.map((name) => report.modes[name]);
  const rateLimited = modes.reduce((sum, mode) => sum + mode.rateLimitedAttempts, 0);
  lines.push(`     429/rate-limited attempts: ${rateLimited}  est. ${rateLimited ? '$0.0000 (429s return no usage; assumed unbilled)' : '$0.0000'}`);
  for (const mode of modes) {
    if (!mode.fallback.calls) continue;
    lines.push(`     fallback calls [${mode.mode}]: ${mode.fallback.calls}  est. ${usd(mode.fallback.cost.total)}`);
  }
  const refinement = report.refinement;
  if (refinement && refinement.requests) {
    const waste = refinement.breakdown;
    lines.push(
      `     refinement with no improved outcome: ${usd(plus(waste.other.cost.total, waste.error.cost.total))}`
        + ` over ${waste.other.requests + waste.error.requests} of ${refinement.requests} requests  (refinement total est. ${usd(refinement.cost.total)})`,
    );
  }
  return lines;
}

function reconciliationLines(report) {
  const lines = ['   attribution check (per-attempt spend vs spend joined to an outcome):'];
  for (const entry of report.reconciliation) {
    const joined = !entry.attributed ? 'not part of the route modes' : entry.unattributed === null ? 'attribution needs complete pricing' : `${usd(entry.attributed.total)} joined, ${usd(entry.unattributed)} unattributed`;
    lines.push(`     ${entry.route.padEnd(10)} ${String(entry.calls).padStart(6)} calls  est. ${usd(entry.cost.total)}   ${joined}`);
  }
  lines.push('   Outcome counters are best-effort writes; any "unattributed" spend is provider cost whose final outcome was not recorded.');
  return lines;
}

function comparisonLines(report) {
  const g = report.modes.general_guidance;
  const p = report.modes.precision_research;
  const r = report.modes.refinement;
  const tokens = (mode) => (mode.avgInputTokens === null ? 'n/a' : `${num(mode.avgInputTokens)} in / ${num(mode.avgOutputTokens)} out`);
  return [
    '   GENERAL_GUIDANCE',
    `     volume ${g.requests}   grounded-request share ${pct(g.groundedShare)}   avg tokens/request ${tokens(g)}`,
    `     est. cost/lookup ${per(g.perLookup, g.requests)}   needs-detail rate ${pct(g.needsDetailRate)}`,
    '   PRECISION_RESEARCH',
    `     volume ${p.requests}   grounded-request share ${pct(p.groundedShare)}   avg tokens/request ${tokens(p)}`,
    `     est. cost/lookup ${per(p.perLookup, p.requests)}   useful-result rate ${pct(p.usefulRate)}   no-result rate ${pct(p.noResultRate)}   est. cost/useful result ${per(p.perUseful, p.usefulResults)}`,
    '   REFINEMENT',
    `     volume ${r.requests}   avg attempts ${num(r.avgAttempts)}   est. cost/request ${per(r.perLookup, r.requests)}   successful narrowing rate ${pct(r.narrowingRate)}`,
  ];
}

/** @returns {string[]} lines for sections 7 (cost efficiency), 8 (unproductive spend) and 9 (comparison) */
export function renderCostReport(report) {
  const header = [
    '',
    '7. COST EFFICIENCY  (estimated application-side cost: tokens x configured COST_* rates; NOT an invoice)',
  ];
  if (report.missingPricing.length) {
    header.push(`   ${COST_UNAVAILABLE} where a rate is missing. Set: ${report.missingPricing.join(', ')}`);
    header.push('   (grounding bills per request OR per search query depending on the model: set the unused price to 0)');
  }
  const efficiency = report.order.flatMap((name) => modeLines(report.modes[name]));
  return [
    ...header,
    ...efficiency,
    '   "logical lookups" = user requests routed to the mode (cache hits included, so cost/lookup is blended); cost/resolved and cost/useful divide ALL mode spend by those results.',
    '',
    '8. UNPRODUCTIVE SPEND  (estimated; spend joined to each request\'s final outcome)',
    ...unproductiveLines(report),
    ...reconciliationLines(report),
    '',
    '9. GENERAL VS PRECISION VS REFINEMENT',
    ...comparisonLines(report),
  ];
}
