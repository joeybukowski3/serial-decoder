import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOutcomeCounterEntries } from '../../lib/smart-lookup/outcome-counters.js';
import { recordUsageEventCounts, summarizeUsage, usageKeyForDate } from '../../lib/smart-lookup/provider-usage.js';
import { buildRouteDecisionReport, buildRoutingReport, buildSmartLookupReport } from '../../lib/quota/report.js';
import { logSmartLookup, routeDecisionCounterEntries, routeDecisionTelemetryFields } from '../../lib/smart-lookup/telemetry.js';
import { chooseSmartLookupRoute } from '../../lib/smart-lookup/route-mode.js';
import { loadQuotaConfig } from '../../lib/quota/config.js';
import { createFakeRedis } from '../helpers/fake-redis.mjs';

const guidancePayload = {
  brand: 'Samsung', category: 'refrigerator', querySpecificity: 'brand-category', routeMode: 'general_guidance', evidenceSource: 'gemini-ungrounded', sources: [],
};
const precisionPayload = {
  brand: 'Whirlpool', exactModel: 'WRF535', introductionYear: 2018, productionRange: { start: 2017, end: 2020 },
  routeMode: 'precision_research', evidenceSource: 'gemini-grounded', sources: [{ uri: 'https://x.test' }],
};

const toMap = (entries) => Object.fromEntries(entries);

test('arbitrary specificity cannot enter route decision logs or Redis keys', async () => {
  const privateTier = 'private-serial-ABC123';
  const queryInfo = { querySpecificity: privateTier, distinctiveTokenCount: 0, hasDigitToken: true, modelCompleteness: 'none' };
  const route = chooseSmartLookupRoute(queryInfo);
  assert.ok(route.reasons.includes(`tier:${privateTier}`));

  const lines = [];
  logSmartLookup({ info: (line) => lines.push(line) }, { event: 'smart_lookup_route_decision', queryInfo, route });
  const event = JSON.parse(lines[0]);
  assert.equal(lines.length, 1);
  assert.equal(event.query_specificity, 'unknown');
  assert.deepEqual(event.route_reasons, ['digit-token']);
  assert.ok(!event.route_reasons.includes(`tier:${privateTier}`));
  assert.doesNotMatch(lines[0], /tier:private-serial-ABC123|private-serial-ABC123/);

  const redis = createFakeRedis();
  const at = Date.UTC(2026, 9, 1, 12);
  await recordUsageEventCounts(redis, 'age', routeDecisionCounterEntries(routeDecisionTelemetryFields(queryInfo, route)), at);
  const keys = Object.keys(redis.hash(usageKeyForDate(at)));
  assert.ok(!keys.some((key) => key.includes(`tier:${privateTier}`)));
  assert.ok(!keys.some((key) => key.includes(privateTier)));
  assert.ok(keys.some((key) => key.endsWith('route_decision:reason:digit-token')));
  assert.ok(keys.some((key) => key.endsWith('route_decision:specificity:precision_research:unknown')));
});

test('route decision counters and report keep reasons separate and bounded', async () => {
  const redis = createFakeRedis();
  const at = Date.UTC(2026, 9, 1, 12);
  const decision = routeDecisionTelemetryFields({
    querySpecificity: 'brand-category', userNotes: 'private notes', hasDigitToken: true,
    distinctiveTokenCount: 3, modelCompleteness: 'none', hasLabeledIdentifier: false,
  }, { mode: 'precision_research', reasons: ['digit-token', 'user-notes', 'private model ABC123'] });
  assert.deepEqual(decision.route_reasons, ['digit-token', 'user-notes']);
  const entries = routeDecisionCounterEntries(decision);
  assert.equal(toMap(entries)['route_decision:distinctive:precision_research:2_plus'], 1);
  assert.doesNotMatch(JSON.stringify(entries), /private|ABC123/);
  await recordUsageEventCounts(redis, 'age', entries, at);
  const report = buildRouteDecisionReport(summarizeUsage(redis.hash(usageKeyForDate(at))));
  assert.equal(report.modes.precision_research, 1);
  assert.deepEqual(report.precisionSpecificity, { 'brand-category': 1 });
  assert.deepEqual(report.precisionReasons, { 'digit-token': 1, 'user-notes': 1 });
  assert.equal(report.notesPresent.precision_research, 1);
  assert.equal(report.digitSignal.precision_research, 1);
  assert.equal(report.distinctiveBuckets.precision_research['2_plus'], 1);
  assert.equal(report.modelCompleteness.precision_research.none, 1);
  assert.equal(report.labeledIdentifier.precision_research, 0);
});

test('counter entries carry only categorical names and counts', () => {
  const entries = toMap(buildOutcomeCounterEntries({
    payload: guidancePayload, summary: { inputTokens: 320, outputTokens: 60 }, attempts: 1, creditCounted: false, retry: false,
  }));
  assert.equal(entries['result_status:needs-detail'], 1);
  assert.equal(entries['result_reason:general-guidance'], 1);
  assert.equal(entries['year_signal:none'], 1);
  assert.equal(entries['route_mode:general_guidance'], 1);
  assert.equal(entries['route_status:general_guidance:needs-detail'], 1);
  assert.equal(entries['route_attempts:general_guidance'], 1);
  assert.equal(entries['route_tokens_in:general_guidance'], 320);
  assert.equal(entries['route_tokens_out:general_guidance'], 60);
  assert.equal(entries['route_grounded:general_guidance'], undefined);
  assert.equal(entries['route_logical_ai:general_guidance'], undefined);
  for (const name of Object.keys(entries)) assert.match(name, /^[a-z_]+:[a-z0-9_:-]+$/, name);
});

test('precision entries count grounding, the logical credit and retries', () => {
  const entries = toMap(buildOutcomeCounterEntries({
    payload: precisionPayload, summary: { inputTokens: 295, outputTokens: 248 }, attempts: 2, creditCounted: true, retry: true,
  }));
  assert.equal(entries['route_grounded:precision_research'], 1);
  assert.equal(entries['route_logical_ai:precision_research'], 1);
  assert.equal(entries['route_retry:precision_research'], 1);
  assert.equal(entries['route_attempts:precision_research'], 2);
  assert.equal(entries['route_status:precision_research:resolved'], 1);
});

test('unrouted answers count under route mode "none" and an empty payload counts nothing', () => {
  const entries = toMap(buildOutcomeCounterEntries({ payload: { brand: 'LG', introductionYear: 2019 } }));
  assert.equal(entries['route_mode:none'], 1);
  assert.deepEqual(buildOutcomeCounterEntries({ payload: null }), []);
});

test('counters are written into the day hash and read back by the routing report', async () => {
  const redis = createFakeRedis();
  const at = Date.UTC(2026, 9, 1, 12);
  const write = (payload, extra) => recordUsageEventCounts(redis, 'age', buildOutcomeCounterEntries({ payload, ...extra }), at);
  await write(guidancePayload, { summary: { inputTokens: 300, outputTokens: 50 }, attempts: 1 });
  await write(guidancePayload, { summary: { inputTokens: 340, outputTokens: 70 }, attempts: 1 });
  await write(precisionPayload, { summary: { inputTokens: 300, outputTokens: 250 }, attempts: 1, creditCounted: true });
  await write({ brand: 'Whirlpool', exactModel: 'WRF535', errorCode: 'PROVIDER_RATE_LIMIT', routeMode: 'precision_research' }, { attempts: 1 });

  const summary = summarizeUsage(redis.hash(usageKeyForDate(at)));
  const report = buildRoutingReport(summary);
  assert.equal(report.totalRequests, 4);
  const guidance = report.modes.general_guidance;
  assert.equal(guidance.requests, 2);
  assert.equal(guidance.statuses['needs-detail'], 2);
  assert.equal(guidance.needsDetailRate, 1);
  assert.equal(guidance.usefulRate, 0);
  assert.equal(guidance.avgProviderAttempts, 1);
  assert.equal(guidance.avgInputTokens, 320);
  assert.equal(guidance.avgOutputTokens, 60);
  assert.equal(guidance.groundedShare, 0);
  assert.equal(guidance.logicalAiLookups, 0);

  const precision = report.modes.precision_research;
  assert.equal(precision.requests, 2);
  assert.equal(precision.usefulRate, 0.5);
  assert.equal(precision.errorRate, 0.5);
  assert.equal(precision.noResultRate, 0);
  assert.equal(precision.groundedShare, 0.5);
  assert.equal(precision.logicalAiLookups, 1);
  assert.equal(report.shares.general_guidance, 0.5);
  assert.equal(report.reasons['provider-rate-limited'], 1);
  assert.equal(report.reasons['general-guidance'], 2);
  assert.equal(report.yearSignals.none, 3);
});

test('rates are null, never a fake zero, when a mode saw no requests', () => {
  const report = buildRoutingReport(summarizeUsage({}));
  assert.equal(report.totalRequests, 0);
  assert.equal(report.modes.general_guidance.usefulRate, null);
  assert.equal(report.modes.precision_research.avgProviderAttempts, null);
  assert.equal(report.shares.general_guidance, null);
});

test('the full report embeds the routing section and counts guidance as its own traffic bucket', () => {
  const summary = summarizeUsage({ 'age|event:outcome:guidance': 3, 'age|event:outcome:ai': 1, 'age|event:route_mode:general_guidance': 3 });
  const report = buildSmartLookupReport({ usage: summary, daily: {}, ipDaily: {}, config: loadQuotaConfig({}) });
  assert.equal(report.traffic.outcomes.guidance, 3);
  assert.equal(report.traffic.totalAttempts, 4);
  assert.equal(report.routing.modes.general_guidance.requests, 3);
});
