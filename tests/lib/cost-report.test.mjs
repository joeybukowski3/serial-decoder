import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createAttemptRecorder, runWithAttemptRecorder, withAttemptAccounting, ATTEMPT_STATUS,
} from '../../lib/smart-lookup/provider-attempts.js';
import {
  recordProviderUsage, recordUsageEventCounts, summarizeUsage, usageFieldsForAttempt, usageKeyForDate,
} from '../../lib/smart-lookup/provider-usage.js';
import { buildOutcomeCounterEntries, buildRefinementCounterEntries } from '../../lib/smart-lookup/outcome-counters.js';
import { loadCostConfig, rateKeys } from '../../lib/smart-lookup/cost-estimate.js';
import { buildCostReport, parseModeEvents } from '../../lib/smart-lookup/cost-report.js';
import { renderCostReport } from '../../lib/smart-lookup/cost-report-format.js';
import { createFakeRedis } from '../helpers/fake-redis.mjs';

// Synthetic round-number rates (NOT real prices) so expected values are checkable by hand.
const PRICES = {
  COST_GEMINI_INPUT_PER_MILLION: '1',
  COST_GEMINI_OUTPUT_PER_MILLION: '10',
  COST_GROUNDED_REQUEST: '0.01',
  COST_SEARCH_QUERY: '0.005',
};
const config = loadCostConfig(PRICES);
const AT = Date.UTC(2026, 9, 2, 12);
const FLASH = 'gemini-2.5-flash';
const LITE = 'gemini-3.5-flash-lite';

const close = (actual, expected, message) => assert.ok(
  actual !== null && Math.abs(actual - expected) < 1e-9, `${message || 'value'}: expected ${expected}, got ${actual}`,
);

const silent = { info() {} };
const recorderFor = (redis, route = 'age') => createAttemptRecorder({
  route, logger: silent, redis, usageSink: (client, attempt) => recordProviderUsage(client, attempt, AT),
});

const guidancePayload = { brand: 'Samsung', category: 'refrigerator', querySpecificity: 'brand-category', routeMode: 'general_guidance' };
const precision = (extra) => ({ brand: 'Whirlpool', exactModel: 'WRF535', routeMode: 'precision_research', ...extra });
const resolvedPayload = precision({ introductionYear: 2018, productionRange: { start: 2017, end: 2020 } });
const noResultPayload = { routeMode: 'precision_research' };
const errorPayload = precision({ errorCode: 'PROVIDER_RATE_LIMIT' });

/** Runs one request: records its attempts, then writes the same counters age-lookup writes. */
async function request(redis, payload, attempts) {
  const recorder = recorderFor(redis);
  for (const attempt of attempts) await recorder.record(attempt);
  const entries = buildOutcomeCounterEntries({ payload, summary: recorder.summary(), attempts: recorder.totalCount() });
  await recordUsageEventCounts(redis, 'age', entries, AT);
  return recorder;
}

const attemptsOf = {
  guidance: (input, output) => [{ provider: 'gemini', model: LITE, inputTokens: input, outputTokens: output }],
  resolved: [{ provider: 'gemini', model: FLASH, grounded: true, searchQueryCount: 2, inputTokens: 2000, outputTokens: 500, thinkingTokens: 500 }],
  noResult: [{ provider: 'gemini', model: FLASH, grounded: true, searchQueryCount: 1, inputTokens: 1000, outputTokens: 100 }],
  errorWithFallback: [
    { provider: 'gemini', model: FLASH, grounded: true, providerStatus: ATTEMPT_STATUS.RATE_LIMITED },
    { provider: 'gemini', model: FLASH, fallbackReason: 'grounded_timeout', inputTokens: 500, outputTokens: 50 },
  ],
};

async function seededDay() {
  const redis = createFakeRedis();
  await request(redis, guidancePayload, attemptsOf.guidance(1000, 200));
  await request(redis, guidancePayload, attemptsOf.guidance(1000, 200));
  await request(redis, resolvedPayload, attemptsOf.resolved);
  await request(redis, resolvedPayload, []); // cache hit: counted, no spend
  await request(redis, noResultPayload, attemptsOf.noResult);
  await request(redis, errorPayload, attemptsOf.errorWithFallback);
  return redis;
}

const reportFor = (redis, costConfig = config) => buildCostReport(summarizeUsage(redis.hash(usageKeyForDate(AT))), costConfig);

// -- recorder: grounded counters ------------------------------------------------

test('recorder separates grounded from ungrounded requests and rolls usage up per model', async () => {
  const recorder = recorderFor(null);
  for (const attempt of [...attemptsOf.resolved, ...attemptsOf.errorWithFallback, ...attemptsOf.guidance(100, 10)]) await recorder.record(attempt);
  const summary = recorder.summary();

  assert.equal(summary.attemptCount, 4);
  assert.equal(summary.groundedAttemptCount, 2);
  assert.equal(summary.searchQueryCount, 2);
  assert.equal(summary.thinkingTokens, 500);

  const flash = summary.byModel.find((row) => row.model === FLASH);
  assert.equal(flash.calls, 3);
  assert.equal(flash.groundedCalls, 2);
  assert.equal(flash.groundedBillable, 1, 'the 429 never returned usage, so it is sent but not billable');
  assert.equal(flash.rateLimited, 1);
  assert.equal(flash.inputTokens, 2500);
  assert.equal(summary.byModel.find((row) => row.model === LITE).groundedCalls, 0);
  assert.deepEqual(summary.fallbackByModel.map((row) => [row.model, row.calls]), [[FLASH, 1]]);
});

test('inferred attempts carry the grounded flag from the descriptor or provider metadata', async () => {
  const recorder = recorderFor(null);
  const meta = Symbol.for('smart-lookup-provider-metadata');
  await runWithAttemptRecorder(recorder, async () => {
    const value = {};
    value[meta] = { provider: 'openai', grounded: true, searchQueryCount: 1, usage: { inputTokens: 10, outputTokens: 5 } };
    await withAttemptAccounting({ provider: 'openai', model: 'gpt-x', grounded: true }, async () => value);
    await assert.rejects(withAttemptAccounting({ provider: 'openai', model: 'gpt-x', grounded: true }, async () => {
      throw Object.assign(new Error('x'), { status: 429 });
    }));
    await withAttemptAccounting({ provider: 'gemini', model: LITE }, async () => ({ [meta]: { provider: 'gemini', usage: { inputTokens: 3, outputTokens: 1 } } }));
  });
  const [ok, failed, plain] = recorder.attempts;
  assert.deepEqual([ok.grounded, ok.searchQueryCount], [true, 1]);
  assert.deepEqual([failed.grounded, failed.searchQueryCount, failed.providerStatus], [true, null, ATTEMPT_STATUS.RATE_LIMITED]);
  assert.deepEqual([plain.grounded, plain.searchQueryCount], [false, null]);
});

test('per-attempt Redis fields count grounded requests separately from reported search queries', () => {
  const fields = Object.fromEntries(usageFieldsForAttempt({
    route: 'age', provider: 'gemini', model: FLASH, providerStatus: 'ok', grounded: true, searchQueryCount: 3, inputTokens: 10,
  }));
  assert.equal(fields['age|gemini|gemini-2.5-flash|grounded_calls'], 1);
  assert.equal(fields['age|gemini|gemini-2.5-flash|grounded_billable'], 1);
  assert.equal(fields['age|gemini|gemini-2.5-flash|search_queries'], 3);
  assert.equal(fields['age|gemini|gemini-2.5-flash|search_reported'], 1);

  const unknown = Object.fromEntries(usageFieldsForAttempt({
    route: 'age', provider: 'gemini', model: FLASH, providerStatus: 'rate_limited', grounded: true, searchQueryCount: null,
  }));
  assert.equal(unknown['age|gemini|gemini-2.5-flash|grounded_calls'], 1);
  assert.equal(unknown['age|gemini|gemini-2.5-flash|grounded_billable'], undefined);
  assert.equal(unknown['age|gemini|gemini-2.5-flash|search_reported'], undefined);

  const ungrounded = usageFieldsForAttempt({ route: 'age', provider: 'gemini', model: LITE, providerStatus: 'ok', inputTokens: 5 });
  assert.equal(ungrounded.some(([name]) => /grounded|search/.test(name)), false);
});

// -- Redis round trip -----------------------------------------------------------

test('cost cells are keyed by mode, status and model and never carry query text', async () => {
  const redis = await seededDay();
  const names = Object.keys(redis.hash(usageKeyForDate(AT))).filter((name) => /route_cost|route_fb|route_gr/.test(name));
  assert.ok(names.includes('age|event:route_cost:precision_research:resolved:g:gemini:gemini-2.5-flash'));
  assert.ok(names.includes('age|event:route_cost:general_guidance:needs-detail:in:gemini:gemini-3.5-flash-lite'));
  assert.ok(names.includes('age|event:route_gr_lookups:precision_research:no-result'));
  assert.ok(names.includes('age|event:route_fb:precision_research:in:gemini:gemini-2.5-flash'));
  for (const name of names) assert.match(name, /^age\|event:[a-z_]+:[a-z_-]+(:[a-z0-9_.-]+)*$/, name);
});

test('long model names are not truncated into a different counter', () => {
  const model = 'gemini-2.5-flash-lite-preview-09-2025-experimental';
  const entries = buildOutcomeCounterEntries({
    payload: precision({ introductionYear: 2018, productionRange: { start: 2017, end: 2020 } }),
    summary: { byModel: [{ provider: 'gemini', model, calls: 1, groundedCalls: 1, inputTokens: 10 }] },
  });
  const redis = createFakeRedis();
  return recordUsageEventCounts(redis, 'age', entries, AT).then(() => {
    const parsed = parseModeEvents(summarizeUsage(redis.hash(usageKeyForDate(AT))).events);
    const cells = Object.values(parsed.precision_research.cells.resolved);
    assert.equal(cells[0].model, model);
    assert.equal(cells[0].usage.inputTokens, 10);
  });
});

test('grounded and ungrounded provider requests are reported separately per mode and by model', async () => {
  const report = reportFor(await seededDay());
  const p = report.modes.precision_research;
  assert.equal(p.groundedProviderRequests, 3);
  assert.equal(p.ungroundedProviderRequests, 1);
  assert.equal(p.groundedLookups, 3, 'requests that sent at least one grounded call');
  assert.equal(p.groundedShare, 3 / 4);
  assert.deepEqual(p.models.map((row) => [row.model, row.calls, row.groundedCalls]), [[FLASH, 4, 3]]);

  const g = report.modes.general_guidance;
  assert.equal(g.groundedProviderRequests, 0);
  assert.equal(g.ungroundedProviderRequests, 2);
  assert.equal(g.groundedShare, 0);
});

test('grounded requests are broken down by the final status they returned', async () => {
  const p = reportFor(await seededDay()).modes.precision_research;
  assert.deepEqual(p.groundedByStatus.resolved, { providerRequests: 1, lookups: 1, requests: 2 });
  assert.deepEqual(p.groundedByStatus['no-result'], { providerRequests: 1, lookups: 1, requests: 1 });
  assert.deepEqual(p.groundedByStatus.error, { providerRequests: 1, lookups: 1, requests: 1 });
  assert.equal(p.groundedByStatus['needs-detail'], undefined);
});

// -- search queries vs grounded requests ----------------------------------------

test('search-query count is what the provider reported, never inferred from request count', async () => {
  const redis = createFakeRedis();
  await request(redis, resolvedPayload, [
    { provider: 'gemini', model: FLASH, grounded: true, searchQueryCount: 3, inputTokens: 100, outputTokens: 10 },
    { provider: 'gemini', model: FLASH, grounded: true, searchQueryCount: 0, inputTokens: 100, outputTokens: 10 },
    { provider: 'gemini', model: FLASH, grounded: true, searchQueryCount: null, inputTokens: 100, outputTokens: 10 },
  ]);
  const p = reportFor(redis).modes.precision_research;
  assert.equal(p.groundedProviderRequests, 3);
  assert.deepEqual(p.searchQueries, { known: true, count: 3, reportedOn: 2, groundedCalls: 3 });
  // 3 billable grounded requests x 0.01 + 3 reported queries x 0.005: two independent prices.
  close(p.cost.grounding, 0.03 + 0.015, 'grounding cost');

  const text = renderCostReport(reportFor(redis)).join('\n');
  assert.match(text, /3 reported on 2 of 3 grounded requests/);
});

test('with no provider-reported query counts the report says n/a instead of guessing', async () => {
  const redis = createFakeRedis();
  await request(redis, resolvedPayload, [{ provider: 'gemini', model: FLASH, grounded: true, inputTokens: 100, outputTokens: 10 }]);
  const report = reportFor(redis);
  assert.equal(report.modes.precision_research.searchQueries.known, false);
  assert.match(renderCostReport(report).join('\n'), /search queries: n\/a \(provider reported none; not assumed from request count\)/);
});

// -- model-specific aggregation and pricing -------------------------------------

test('tokens aggregate per model and model-specific rates override the provider rate', async () => {
  const redis = await seededDay();
  const base = reportFor(redis).modes.general_guidance;
  close(base.cost.token, 2 * (1000 * 1 + 200 * 10) / 1e6, 'guidance token cost at provider rates');

  const overridden = loadCostConfig({ ...PRICES, COST_MODEL_GEMINI_3_5_FLASH_LITE_INPUT_PER_MILLION: '0.5', COST_MODEL_GEMINI_3_5_FLASH_LITE_OUTPUT_PER_MILLION: '4' });
  const cheap = reportFor(redis, overridden);
  close(cheap.modes.general_guidance.cost.token, 2 * (1000 * 0.5 + 200 * 4) / 1e6, 'guidance token cost with model override');
  assert.equal(cheap.modes.precision_research.cost.total, reportFor(redis).modes.precision_research.cost.total, 'other models keep the provider rate');
  assert.deepEqual(rateKeys('input', 'gemini', 'gemini-3.5-flash-lite'), ['COST_MODEL_GEMINI_3_5_FLASH_LITE_INPUT_PER_MILLION', 'COST_GEMINI_INPUT_PER_MILLION']);
});

test('thinking tokens are priced at the output rate and reported separately', async () => {
  const p = reportFor(await seededDay()).modes.precision_research;
  assert.equal(p.tokens.thinking, 500);
  close(p.costByStatus.resolved.token, (2000 * 1 + (500 + 500) * 10) / 1e6, 'resolved token cost');
});

// -- cost attribution ------------------------------------------------------------

test('spend is attributed to the final status: resolved, no-result and error', async () => {
  const p = reportFor(await seededDay()).modes.precision_research;
  close(p.costByStatus.resolved.total, 0.012 + 0.02, 'resolved');
  close(p.costByStatus['no-result'].total, 0.002 + 0.015, 'no-result');
  close(p.costByStatus.error.total, 0.001, 'error: the 429 is unbilled, only the fallback cost tokens');
  close(p.cost.total, 0.032 + 0.017 + 0.001, 'mode total');

  close(p.avgSpendPerNoResult, 0.017, 'avg spend per no-result request');
  close(p.avgSpendPerError, 0.001, 'avg spend per error request');
  assert.equal(p.avgSpendPerNeedsDetail, null, 'no needs-detail requests in this mode');
  assert.equal(p.rateLimitedAttempts, 1);
  assert.deepEqual([p.fallback.calls, p.fallback.cost.total], [1, 0.001]);
});

test('percentages split spend into resolved/partial, no-result/error and needs-detail', async () => {
  const { overall } = reportFor(await seededDay());
  const c = overall.categories;
  close(overall.total.total, 0.006 + 0.05, 'all Smart Lookup spend');
  close(c.useful.cost.total, 0.032, 'useful');
  close(c.noResult.cost.total + c.error.cost.total, 0.018, 'no-result + error');
  close(c.needsDetail.cost.total, 0.006, 'needs-detail');
  close(c.useful.share + c.noResult.share + c.error.share + c.needsDetail.share + c.other.share, 1, 'shares sum to 1');
});

test('cost per useful result counts resolved + partial and not needs-detail', async () => {
  const redis = createFakeRedis();
  const partial = precision({ introductionYear: 2018, precisionLevel: 'family-range', productionRange: { start: 2015, end: 2020 } });
  await request(redis, resolvedPayload, attemptsOf.resolved); // 0.032
  await request(redis, partial, attemptsOf.noResult); // 0.017
  await request(redis, precision({ yearEvidenceWithheld: true }), attemptsOf.noResult); // needs-detail, 0.017
  const p = reportFor(redis).modes.precision_research;
  assert.deepEqual([p.statuses.resolved, p.statuses.partial, p.statuses['needs-detail']], [1, 1, 1]);
  assert.equal(p.usefulResults, 2);
  close(p.cost.total, 0.032 + 0.017 + 0.017, 'total');
  close(p.perUseful, (0.032 + 0.017 + 0.017) / 2, 'fully loaded cost per useful result');
  close(p.perResolved, 0.032 + 0.017 + 0.017, 'cost per resolved result');
  close(p.perLookup, (0.032 + 0.017 + 0.017) / 3, 'cost per lookup');
  close(p.avgSpendPerNeedsDetail, 0.017, 'avg spend per needs-detail request');
});

test('spend without a joined outcome shows up as unattributed in the reconciliation', async () => {
  const redis = await seededDay();
  // A paid attempt whose request never wrote outcome counters (best-effort write lost).
  await recorderFor(redis).record({ provider: 'gemini', model: FLASH, inputTokens: 1000, outputTokens: 100 });
  const age = reportFor(redis).reconciliation.find((entry) => entry.route === 'age');
  close(age.unattributed, 0.002, 'unattributed');
  close(age.cost.total, age.attributed.total + 0.002, 'route total');
});

test('fully joined spend reconciles to zero unattributed', async () => {
  const age = reportFor(await seededDay()).reconciliation.find((entry) => entry.route === 'age');
  close(age.unattributed, 0, 'unattributed');
});

// -- missing pricing -------------------------------------------------------------

test('missing pricing yields cost unavailable, never an invented number', async () => {
  const redis = await seededDay();
  const report = reportFor(redis, loadCostConfig({}));
  const p = report.modes.precision_research;
  for (const value of [p.cost.token, p.cost.grounding, p.cost.total, p.perLookup, p.perResolved, p.perUseful, p.avgSpendPerNoResult]) assert.equal(value, null);
  assert.ok(report.missingPricing.includes('COST_GEMINI_INPUT_PER_MILLION'));
  assert.ok(report.missingPricing.includes('COST_GROUNDED_REQUEST'));
  assert.equal(report.overall.categories.useful.share, null);

  const text = renderCostReport(report).join('\n');
  assert.match(text, /cost unavailable where a rate is missing\. Set: .*COST_GEMINI_INPUT_PER_MILLION/);
  assert.match(text, /est\. total: cost unavailable/);
  assert.doesNotMatch(text, /\$0\.0000 per/);
  // Counts and tokens still print without prices.
  assert.match(text, /grounded provider requests: 3/);
});

test('a partial config prices tokens but leaves grounding unavailable until both grounding prices are set', async () => {
  const redis = await seededDay();
  const partial = loadCostConfig({ COST_GEMINI_INPUT_PER_MILLION: '1', COST_GEMINI_OUTPUT_PER_MILLION: '10', COST_SEARCH_QUERY: '0.005' });
  const p = reportFor(redis, partial).modes.precision_research;
  assert.notEqual(p.cost.token, null);
  assert.equal(p.cost.grounding, null);
  assert.equal(p.cost.total, null);
  assert.deepEqual(reportFor(redis, partial).missingPricing, ['COST_GROUNDED_REQUEST']);

  const zeroed = loadCostConfig({ ...PRICES, COST_SEARCH_QUERY: '0' });
  close(reportFor(redis, zeroed).modes.precision_research.costByStatus.resolved.grounding, 0.01, 'per-request pricing only');
});

test('invalid or negative rates are ignored rather than priced', () => {
  const bad = loadCostConfig({ COST_GEMINI_INPUT_PER_MILLION: 'abc', COST_GEMINI_OUTPUT_PER_MILLION: '-3', COST_SEARCH_QUERY: '' });
  assert.deepEqual(bad.rates, {});
});

// -- zero denominators ------------------------------------------------------------

test('an empty day produces nulls and renders without throwing', () => {
  const report = buildCostReport(summarizeUsage({}), config);
  for (const mode of Object.values(report.modes)) {
    assert.equal(mode.requests, 0);
    for (const value of [mode.perLookup, mode.perResolved, mode.perUseful, mode.groundedShare, mode.usefulRate, mode.avgInputTokens]) assert.equal(value, null);
  }
  assert.equal(report.overall.categories.useful.share, null);
  const text = renderCostReport(report).join('\n');
  assert.match(text, /no requests recorded/);
  assert.match(text, /volume 0/);
});

test('modes with spend but no resolved results leave cost per resolved result unavailable', async () => {
  const g = reportFor(await seededDay()).modes.general_guidance;
  assert.equal(g.statuses.resolved, undefined);
  assert.equal(g.perResolved, null);
  assert.equal(g.perUseful, null);
  close(g.perLookup, 0.003, 'cost per guidance lookup');
  assert.equal(g.needsDetailRate, 1);
});

test('"n/a (none)" means nothing to divide by; "cost unavailable" means a price is missing', async () => {
  const redis = await seededDay();
  const priced = renderCostReport(reportFor(redis)).join('\n');
  assert.match(priced, /cost\/lookup \$0\.0030   cost\/resolved result n\/a \(none\)/, 'priced, but no resolved guidance results');

  const unpriced = renderCostReport(reportFor(redis, loadCostConfig({}))).join('\n');
  assert.match(unpriced, /cost\/lookup cost unavailable   cost\/resolved result n\/a \(none\)/, 'unpriced AND no resolved results');
  assert.match(unpriced, /cost\/lookup cost unavailable   cost\/resolved result cost unavailable/, 'unpriced with resolved results');
});

// -- general vs precision vs refinement ------------------------------------------

test('general, precision and refinement roll up side by side', async () => {
  const redis = await seededDay();
  const refine = async (status, attempts) => {
    const recorder = recorderFor(redis, 'refine');
    for (const attempt of attempts) await recorder.record(attempt);
    await recordUsageEventCounts(redis, 'refine', [
      ['paid_lookup', 1],
      ...buildRefinementCounterEntries({ status, summary: recorder.summary(), attempts: recorder.totalCount() }),
    ], AT);
  };
  await refine('ranked', [{ provider: 'gemini', model: FLASH, grounded: true, searchQueryCount: 1, inputTokens: 800, outputTokens: 100 }]);
  await refine('ambiguous', [
    { provider: 'gemini', model: FLASH, grounded: true, searchQueryCount: 1, inputTokens: 800, outputTokens: 100 },
    { provider: 'gemini', model: FLASH, inputTokens: 100, outputTokens: 10 },
  ]);

  const report = reportFor(redis);
  const [g, p, r] = ['general_guidance', 'precision_research', 'refinement'].map((name) => report.modes[name]);

  assert.deepEqual([g.requests, p.requests, r.requests], [2, 4, 2]);
  assert.equal(g.needsDetailRate, 1);
  close(g.perLookup, 0.003, 'guidance cost/lookup');
  close(p.perLookup, 0.05 / 4, 'precision cost/lookup');
  close(p.usefulRate, 2 / 4, 'precision useful rate');
  close(p.noResultRate, 1 / 4, 'precision no-result rate');
  assert.equal(r.creditLookups, 2);
  assert.equal(r.avgAttempts, 1.5);
  assert.equal(r.narrowingRate, 0.5);
  assert.equal(r.usefulResults, 1);

  const wasted = report.refinement.breakdown;
  assert.equal(wasted.other.requests, 1, 'ambiguous counts as no improved outcome');
  assert.ok(wasted.other.cost.total > 0);
  // Refinement is reported on its own, not folded into the Smart Lookup split.
  close(report.overall.total.total, 0.056, 'Smart Lookup total excludes refinement');
  assert.deepEqual(report.reconciliation.map((entry) => entry.route).sort(), ['age', 'refine']);

  const text = renderCostReport(report).join('\n');
  assert.match(text, /GENERAL_GUIDANCE/);
  assert.match(text, /PRECISION_RESEARCH/);
  assert.match(text, /successful narrowing rate 50\.0%/);
  assert.match(text, /refinement with no improved outcome/);
});
