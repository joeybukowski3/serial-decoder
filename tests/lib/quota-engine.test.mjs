import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

import { DEFAULT_TIER_LIMITS, isQuotaEnforcementEnabled, isQuotaMeteringEnabled, loadQuotaConfig } from '../../lib/quota/config.js';
import { buildIdentity, hashIp, hashVisitorId, isValidVisitorId, utcDay, utcMonth } from '../../lib/quota/identity.js';
import { resolveQuota } from '../../lib/quota/resolver.js';
import {
  bucketCounts, buildSmartLookupReport, percentile, splitSubjects, summarizeDistribution, topShare,
} from '../../lib/quota/report.js';
import { summarizeUsage } from '../../lib/smart-lookup/provider-usage.js';

const config = loadQuotaConfig({});
const VISITOR = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

// ---------------------------------------------------------------- config / flags

test('quota defaults match the proposed policy and every flag is off by default', () => {
  assert.deepEqual(config.tiers, {
    anonymous: { daily: 5, monthly: null },
    free: { daily: 10, monthly: 50 },
    pro: { daily: null, monthly: 500 },
    business: { daily: null, monthly: 2500 },
  });
  assert.deepEqual(DEFAULT_TIER_LIMITS.anonymous, { daily: 5, monthly: null });
  assert.equal(config.metering, false);
  assert.equal(config.enforce, false);
});

test('metering and enforcement are separate flags, and enforcement never works without metering', () => {
  assert.equal(isQuotaMeteringEnabled({ SMART_LOOKUP_QUOTA_METERING: '1' }), true);
  assert.equal(isQuotaEnforcementEnabled({ SMART_LOOKUP_QUOTA_METERING: '1' }), false, 'shadow: metering on, enforcement off');
  assert.equal(isQuotaEnforcementEnabled({ SMART_LOOKUP_QUOTA_METERING: 'true', SMART_LOOKUP_QUOTA_ENFORCE: 'true' }), true);
  assert.equal(isQuotaEnforcementEnabled({ SMART_LOOKUP_QUOTA_ENFORCE: 'true' }), false, 'enforce alone is ignored');
});

test('limits are configurable per tier, including "none" and ignoring junk', () => {
  const custom = loadQuotaConfig({
    QUOTA_ANONYMOUS_DAILY: '3', QUOTA_FREE_DAILY: '20', QUOTA_FREE_MONTHLY: '100',
    QUOTA_PRO_MONTHLY: '750', QUOTA_BUSINESS_MONTHLY: 'unlimited', QUOTA_PRO_DAILY: 'banana', QUOTA_IP_DAILY: '12',
  });
  assert.equal(custom.tiers.anonymous.daily, 3);
  assert.deepEqual(custom.tiers.free, { daily: 20, monthly: 100 });
  assert.equal(custom.tiers.pro.monthly, 750);
  assert.equal(custom.tiers.pro.daily, null, 'junk falls back to the default');
  assert.equal(custom.tiers.business.monthly, null);
  assert.equal(custom.ipDailyLimit, 12);
});

// ---------------------------------------------------------------- identity

test('visitor IDs are validated and hashed; the raw ID and IP never appear in the identity', () => {
  assert.equal(isValidVisitorId(VISITOR), true);
  for (const bad of ['', 'short', 'x'.repeat(65), 'has space in it 1234567890', undefined, 12345]) {
    assert.equal(isValidVisitorId(bad), false, String(bad));
  }
  const identity = buildIdentity({
    req: { headers: { 'x-visitor-id': VISITOR } }, ip: '198.51.100.23', config, now: Date.UTC(2026, 8, 29),
  });
  assert.equal(identity.tier, 'anonymous');
  assert.equal(identity.idSource, 'visitor');
  assert.match(identity.subjectId, /^anon:[0-9a-f]{24}$/);
  const serialized = JSON.stringify(identity);
  assert.equal(serialized.includes(VISITOR), false);
  assert.equal(serialized.includes('198.51.100.23'), false);
  // stable across days (needed for monthly metering)...
  const tomorrow = buildIdentity({ req: { headers: { 'x-visitor-id': VISITOR } }, ip: '198.51.100.23', config, now: Date.UTC(2026, 8, 30) });
  assert.equal(tomorrow.subjectId, identity.subjectId);
  // ...but the IP hash rotates daily so it cannot link a person across days
  assert.notEqual(tomorrow.ipHash, identity.ipHash);
  assert.equal(hashIp('1.2.3.4', 's', '2026-09-29'), hashIp('1.2.3.4', 's', '2026-09-29'));
  assert.notEqual(hashVisitorId(VISITOR, 'salt-a'), hashVisitorId(VISITOR, 'salt-b'));
});

test('without a usable visitor ID the subject falls back to the hashed IP, never the raw one', () => {
  const identity = buildIdentity({ req: { headers: { 'x-visitor-id': 'nope' } }, ip: '203.0.113.9', config, now: 0 });
  assert.equal(identity.idSource, 'ip');
  assert.match(identity.subjectId, /^anon:ip-[0-9a-f]{24}$/);
  assert.equal(JSON.stringify(identity).includes('203.0.113.9'), false);
});

test('an account resolver supplies the tier without the engine knowing anything about billing', () => {
  const identity = buildIdentity({ req: { headers: {} }, ip: '1.1.1.1', config, now: 0, account: { accountId: 'acct-42', tier: 'pro' } });
  assert.equal(identity.tier, 'pro');
  assert.equal(identity.idSource, 'account');
  assert.match(identity.subjectId, /^acct:[0-9a-f]{24}$/);
  assert.equal(identity.subjectId.includes('acct-42'), false, 'the metering subject is a hash, not the raw account id');
  const unknownTier = buildIdentity({ req: { headers: {} }, ip: '1.1.1.1', config, now: 0, account: { accountId: 'x', tier: 'platinum' } });
  assert.equal(unknownTier.tier, 'anonymous', 'unknown tiers never grant a bigger allowance');
  assert.equal(utcDay(Date.UTC(2026, 0, 31, 23, 59)), '2026-01-31');
  assert.equal(utcMonth(Date.UTC(2026, 0, 31, 23, 59)), '2026-01');
});

// ---------------------------------------------------------------- resolver

const asTier = (tier) => ({ tier });

test('resolveQuota returns tier, limits, usage, remaining and allowed for anonymous', () => {
  assert.deepEqual(resolveQuota({ identity: asTier('anonymous'), usedToday: 3, usedThisMonth: 9, config }), {
    tier: 'anonymous', dailyLimit: 5, monthlyLimit: null, usedToday: 3, usedThisMonth: 9,
    remainingDaily: 2, remainingMonthly: null, remaining: 2, allowed: true, blockReason: null,
  });
});

test('the fifth lookup fits, the sixth would not (boundary), and remaining never goes negative', () => {
  assert.equal(resolveQuota({ identity: asTier('anonymous'), usedToday: 5, config }).allowed, true);
  const sixth = resolveQuota({ identity: asTier('anonymous'), usedToday: 6, config });
  assert.equal(sixth.allowed, false);
  assert.equal(sixth.blockReason, 'daily');
  assert.equal(sixth.remainingDaily, 0);
});

test('free is limited daily AND monthly; the tighter limit reports the block reason', () => {
  assert.equal(resolveQuota({ identity: asTier('free'), usedToday: 10, usedThisMonth: 50, config }).allowed, true);
  assert.equal(resolveQuota({ identity: asTier('free'), usedToday: 4, usedThisMonth: 51, config }).blockReason, 'monthly');
  const q = resolveQuota({ identity: asTier('free'), usedToday: 8, usedThisMonth: 45, config });
  assert.equal(q.remaining, 2, 'remaining is the smaller of the two');
});

test('pro and business have monthly allowances only; unlimited dimensions never block', () => {
  const pro = resolveQuota({ identity: asTier('pro'), usedToday: 400, usedThisMonth: 500, config });
  assert.equal(pro.dailyLimit, null);
  assert.equal(pro.remainingDaily, null);
  assert.equal(pro.allowed, true);
  assert.equal(resolveQuota({ identity: asTier('pro'), usedThisMonth: 501, config }).allowed, false);
  assert.equal(resolveQuota({ identity: asTier('business'), usedThisMonth: 2500, config }).allowed, true);
  assert.equal(resolveQuota({ identity: asTier('business'), usedThisMonth: 2501, config }).allowed, false);
  assert.equal(resolveQuota({ identity: asTier('mystery'), usedToday: 6, config }).tier, 'anonymous');
});

// ---------------------------------------------------------------- distribution + report

test('users are bucketed 1/2/3/4/5/6-10/11-25/26+', () => {
  const buckets = bucketCounts([1, 1, 2, 3, 4, 5, 5, 6, 10, 11, 25, 26, 90]);
  assert.deepEqual(buckets, { '1': 2, '2': 1, '3': 1, '4': 1, '5': 2, '6-10': 2, '11-25': 2, '26+': 2 });
});

test('percentiles use nearest rank and concentration is the top-N% share of all lookups', () => {
  const counts = Array.from({ length: 100 }, (_, i) => (i === 99 ? 100 : 1));
  const sorted = [...counts].sort((a, b) => a - b);
  assert.equal(percentile(sorted, 50), 1);
  assert.equal(percentile(sorted, 99), 1);
  assert.equal(percentile(sorted, 100), 100);
  assert.equal(percentile([], 50), null);
  assert.equal(topShare(counts, 0.01), 100 / 199, 'the single heaviest user of 100');
  assert.equal(topShare(counts, 0.1), 109 / 199);
  assert.equal(topShare([], 0.05), null);
  assert.equal(topShare([3], 0.01), 1, 'at least one user is always taken');
});

test('subjects are split into visitors, IP-only subjects and accounts', () => {
  const groups = splitSubjects({
    'anon:aaaaaaaaaaaaaaaaaaaaaaaa': '3', 'anon:bbbbbbbbbbbbbbbbbbbbbbbb': 7,
    'anon:ip-cccccccccccccccccccccccc': '40', 'acct:dddddddddddddddddddddddd': '2', 'bogus': '5', 'anon:zero': '0',
  });
  assert.deepEqual(groups.visitors.sort(), [3, 7]);
  assert.deepEqual(groups.ipFallback, [40]);
  assert.deepEqual(groups.accounts, [2]);
});

test('hypothetical impact distinguishes users who would HIT a limit from those who would be BLOCKED', () => {
  const counts = [1, 1, 2, 3, 5, 5, 6, 8, 12, 40];
  const summary = summarizeDistribution(counts, [5, 10]);
  const five = summary.thresholds.find((t) => t.limit === 5);
  const ten = summary.thresholds.find((t) => t.limit === 10);
  assert.equal(summary.users, 10);
  assert.equal(five.hit, 6, 'reached 5 or more');
  assert.equal(five.exceed, 4, 'went past 5: would be blocked at least once');
  assert.equal(five.exceedShare, 0.4);
  assert.equal(five.blockedLookups, 1 + 3 + 7 + 35);
  assert.equal(ten.exceed, 2);
  assert.equal(summary.median, 5, 'mean of the two middle values (5 and 5)');
  assert.equal(summarizeDistribution([1, 2, 3, 10], []).median, 2.5);
  assert.equal(summarizeDistribution([4], []).median, 4);
  assert.equal(summary.p90, 12);
  assert.equal(summary.max, 40);
});

test('the full report answers traffic, AI utilization, cost control, distribution and quota impact', () => {
  const usage = summarizeUsage({
    'age|event:outcome:local': '40', 'age|event:outcome:cache': '25', 'age|event:outcome:deterministic': '5', 'age|event:outcome:ai': '30',
    'age|event:ai_lookup': '28', 'age|event:ai_lookup_refunded': '3', 'age|event:ai_lookup_duplicate': '2',
    'age|event:paid_lookup': '24', 'age|event:quota_would_block': '4', 'age|event:gemini_cooldown_skip': '1',
    'age|gemini|gemini-3.5-flash-lite|calls': '30', 'age|gemini|gemini-3.5-flash-lite|status:rate_limited': '6',
    'age|gemini|gemini-3.5-flash-lite|in_tokens': '9000', 'age|gemini|gemini-3.5-flash-lite|out_tokens': '2000',
    'age|groq|openai/gpt-oss-20b|calls': '6', 'age|openai|gpt-x|calls': '2', 'age|xai|grok|calls': '1',
    'age|fallback:gemini_rate_limited': '6',
    'refine|event:paid_lookup': '5', 'refine|event:gate_skip:single_candidate': '15',
    'refine|gemini|gemini-3.5-flash-lite|calls': '5',
  });
  const daily = {};
  for (let i = 0; i < 20; i += 1) daily[`anon:${String(i).padStart(24, '0')}`] = i < 13 ? 1 : (i < 17 ? 3 : (i === 17 ? 7 : 30));
  const report = buildSmartLookupReport({ usage, daily, ipDaily: { a: 4, b: 40, c: 31 }, config });

  assert.equal(report.traffic.totalAttempts, 100);
  assert.equal(report.traffic.outcomes.local, 40);
  assert.equal(report.traffic.shares.ai, 0.3);
  assert.equal(report.aiUtilization.logicalAiLookups, 28);
  assert.equal(report.aiUtilization.netLogicalAiLookups, 25);
  assert.deepEqual(report.aiUtilization.byProvider, { gemini: 30, openai: 2, xai: 1, groq: 6 });
  assert.equal(report.aiUtilization.providerAttempts, 39);
  assert.equal(report.aiUtilization.attemptsPerLogicalLookup, 39 / 25);
  assert.equal(report.aiUtilization.attemptsPerPaidChain, 39 / 24);
  assert.deepEqual(report.aiUtilization.tokens, { input: 9000, output: 2000, thinking: 0 });
  assert.equal(report.costControl.geminiRateLimitRate, 6 / 30);
  assert.equal(report.costControl.fallbackRate, 6 / 39);
  assert.equal(report.costControl.geminiCooldownSkips, 1);
  assert.equal(report.costControl.refinement.refinementRate, 5 / 20);
  assert.equal(report.users.anonymousVisitors, 20);
  assert.equal(report.users.distribution.buckets['26+'], 2);
  assert.equal(report.hypotheticalQuota.thresholds[0].limit, 5);
  assert.equal(report.hypotheticalQuota.thresholds[0].exceed, 3, 'users at 7, 30, 30');
  assert.equal(report.hypotheticalQuota.ipsOverLimit, 2);
  assert.equal(report.hypotheticalQuota.ipsSeen, 3);
});

test('an empty day reports as not metered instead of inventing zeros', () => {
  const report = buildSmartLookupReport({ usage: summarizeUsage({}), daily: {}, ipDaily: {}, config });
  assert.equal(report.metered, false);
  assert.equal(report.traffic.shares.ai, null);
  assert.equal(report.users.distribution.median, null);
});

// ---------------------------------------------------------------- dormant UI foundation

const plain = (value) => JSON.parse(JSON.stringify(value)); // vm arrays have another realm's prototype

function loadQuotaUi() {
  const source = fs.readFileSync(new URL('../../src/browser/smart-lookup-quota-ui.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox);
  const api = sandbox.window.SmartLookupQuotaUI;
  return { ...api, statesFor: (quota) => plain(api.statesFor(quota)) };
}

test('the quota UI is inert unless explicitly enabled', () => {
  const ui = loadQuotaUi();
  const blocked = { tier: 'anonymous', allowed: false, remaining: 0, remainingDaily: 0, remainingMonthly: null };
  assert.equal(ui.render(blocked), '');
  assert.equal(ui.render(blocked, {}), '');
  assert.equal(ui.render(blocked, { enabled: false }), '');
  assert.notEqual(ui.render(blocked, { enabled: true }), '');
});

test('UI states map to tiers: usage remaining, limit reached, create account, upgrade', () => {
  const ui = loadQuotaUi();
  assert.deepEqual(ui.statesFor({ tier: 'anonymous', allowed: true, remaining: 2, remainingDaily: 2 }), ['usage-remaining']);
  assert.deepEqual(ui.statesFor({ tier: 'anonymous', allowed: true, remaining: 4 }), [], 'plenty left: show nothing');
  assert.deepEqual(ui.statesFor({ tier: 'anonymous', allowed: false, remaining: 0 }), ['limit-reached', 'create-account']);
  assert.deepEqual(ui.statesFor({ tier: 'free', allowed: false, remaining: 0 }), ['limit-reached', 'upgrade']);
  assert.deepEqual(ui.statesFor({ tier: 'pro', allowed: false, remaining: 0 }), ['limit-reached']);
  assert.deepEqual(ui.statesFor({ tier: 'pro', allowed: true, remaining: null }), [], 'unlimited dimension: nothing to show');
  assert.deepEqual(ui.statesFor(null), []);
  const html = ui.render({ tier: 'anonymous', allowed: true, remaining: 1, remainingDaily: 1, remainingMonthly: null }, { enabled: true });
  assert.match(html, /1 AI-assisted lookup left today/);
  assert.match(ui.render({ tier: 'free', allowed: false, remaining: 0, remainingMonthly: 0 }, { enabled: true }), /Upgrade to Pro/);
});

test('quota copy only ever refers to AI-assisted lookups and reassures that decoding is unaffected', () => {
  const ui = loadQuotaUi();
  const everything = JSON.stringify([
    ui.COPY.usageRemaining(3, 'day'), ui.COPY.limitReachedTitle, ui.COPY.limitReachedBody, ui.COPY.createAccountTitle,
    ui.COPY.createAccountBody, ui.COPY.upgradeTitle, ui.COPY.upgradeBody,
  ]);
  assert.match(everything, /AI-assisted/);
  assert.match(ui.COPY.limitReachedBody, /Serial number decoding .* still available/);
  assert.equal(/every (serial )?lookup|all lookups|any lookup/i.test(everything), false, 'must not imply every lookup is limited');
});

test('the quota UI is not wired into any page, build output or the live controller', () => {
  const root = new URL('../../', import.meta.url);
  const shipped = ['smart-lookup-controller.js', 'src/browser/smart-lookup-controller.js', 'serial-refinement-controller.js', 'index.html', 'smart-lookup.html']
    .map((file) => fs.readFileSync(new URL(file, root), 'utf8'));
  for (const text of shipped) {
    assert.equal(text.includes('smart-lookup-quota-ui'), false);
    assert.equal(text.includes('SmartLookupQuotaUI'), false);
  }
  const pages = fs.readdirSync(root).filter((name) => name.endsWith('.html'));
  for (const page of pages) {
    assert.equal(fs.readFileSync(new URL(page, root), 'utf8').includes('smart-lookup-quota-ui'), false, page);
  }
  assert.equal(fs.readFileSync(new URL('scripts/build-smart-lookup-browser.js', root), 'utf8').includes('quota-ui'), false);
});
