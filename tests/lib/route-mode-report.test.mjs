import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOutcomeCounterEntries } from '../../lib/smart-lookup/outcome-counters.js';
import { recordUsageEventCounts, summarizeUsage, usageKeyForDate } from '../../lib/smart-lookup/provider-usage.js';
import { buildRoutingReport, buildSmartLookupReport } from '../../lib/quota/report.js';
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
