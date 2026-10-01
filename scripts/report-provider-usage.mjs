#!/usr/bin/env node
/**
 * Read-only daily Smart Lookup usage, cost-control and hypothetical-quota report.
 *
 *   node --env-file=.env.local scripts/report-provider-usage.mjs            # today (UTC)
 *   node --env-file=.env.local scripts/report-provider-usage.mjs 2026-09-28 2026-09-29
 *
 * Sources (nothing is written or deleted):
 *   provider-usage:v1:<UTC day>  per-route provider calls/tokens/429s + traffic and quota events
 *   quota:v1:d:<UTC day>         hashed subject -> AI lookups that day (distribution data)
 *   quota:v1:ip:<UTC day>        day-scoped IP hash -> AI lookups (abuse signal)
 *
 * Traffic, AI-utilization and distribution sections are only populated once
 * SMART_LOOKUP_QUOTA_METERING is on in the environment being reported. Only
 * hashes are ever read or printed. Needs UPSTASH_REDIS_REST_URL / _TOKEN.
 */
import { Redis } from '@upstash/redis';
import { readProviderUsage } from '../lib/smart-lookup/provider-usage.js';
import { quotaKeys } from '../lib/quota/meter.js';
import { loadQuotaConfig } from '../lib/quota/config.js';
import { buildSmartLookupReport } from '../lib/quota/report.js';
import { buildUsageReport } from '../lib/smart-lookup/provider-usage.js';

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  console.error('Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (e.g. node --env-file=.env.local ...).');
  process.exit(1);
}

const days = process.argv.slice(2).filter((arg) => /^\d{4}-\d{2}-\d{2}$/.test(arg));
if (!days.length) days.push(new Date().toISOString().slice(0, 10));

const pct = (value, digits = 1) => (value == null ? 'n/a' : `${(value * 100).toFixed(digits)}%`);
const num = (value) => (value == null ? 'n/a' : Number.isInteger(value) ? String(value) : value.toFixed(2));
const users = (count, share) => `${count} user${count === 1 ? '' : 's'} (${pct(share)})`;

const redis = new Redis({ url, token });
const config = loadQuotaConfig(process.env);

for (const day of days) {
  const usage = await readProviderUsage(redis, day);
  const daily = (await redis.hgetall(quotaKeys.daily(day))) || {};
  const ipDaily = (await redis.hgetall(quotaKeys.ip(day))) || {};
  const report = buildSmartLookupReport({ usage, daily, ipDaily, config });
  const perRoute = buildUsageReport(usage);

  console.log(`\n=================== ${day} (UTC) ===================`);
  if (!perRoute.routes.length && !report.metered) {
    console.log('No provider usage or quota metering recorded for this day.');
    continue;
  }

  // 1 -------------------------------------------------------------------
  console.log('\n1. TRAFFIC');
  if (!report.traffic.totalAttempts) {
    console.log('   (traffic counters need SMART_LOOKUP_QUOTA_METERING=1 in the reported environment)');
  } else {
    const t = report.traffic;
    console.log(`   Smart Lookup attempts:        ${t.totalAttempts}`);
    for (const name of ['local', 'cache', 'deterministic', 'guidance', 'ai', 'other']) {
      console.log(`     ${name.padEnd(14)} ${String(t.outcomes[name]).padStart(6)}  ${pct(t.shares[name])}`);
    }
  }

  // 2 -------------------------------------------------------------------
  const ai = report.aiUtilization;
  console.log('\n2. AI UTILIZATION');
  console.log(`   Logical AI lookups counted:   ${ai.logicalAiLookups}   (refunded ${ai.refunded}, retries ignored ${ai.duplicatesIgnored}, net ${ai.netLogicalAiLookups})`);
  console.log(`   AI share of attempts:         ${pct(ai.aiShareOfAttempts)}`);
  console.log(`   Provider HTTP attempts (age): ${ai.providerAttempts}`);
  console.log(`     gemini ${ai.byProvider.gemini}   openai ${ai.byProvider.openai}   xai ${ai.byProvider.xai}   groq ${ai.byProvider.groq}`);
  console.log(`   Attempts per logical lookup:  ${num(ai.attemptsPerLogicalLookup)}   (per provider chain that ran: ${num(ai.attemptsPerPaidChain)})`);
  console.log(`   Tokens:                       in ${ai.tokens.input}  out ${ai.tokens.output}  thinking ${ai.tokens.thinking}`);

  // 3 -------------------------------------------------------------------
  const cc = report.costControl;
  console.log('\n3. COST-CONTROL PERFORMANCE');
  console.log(`   429 rate (age):               ${pct(cc.rateLimitRate)}   Gemini-only ${pct(cc.geminiRateLimitRate)}`);
  console.log(`   Fallback rate (age):          ${pct(cc.fallbackRate)}   Gemini cooldown skips: ${cc.geminiCooldownSkips}`);
  if (cc.refinement) {
    console.log(`   Refinement rate:              ${pct(cc.refinement.refinementRate)} of ${cc.refinement.requestsCounted} counted requests (${num(cc.refinement.paidLookups)} paid)`);
  }
  for (const route of perRoute.routes) {
    console.log(`   [${route.route}] provider calls ${route.calls} (Gemini ${route.geminiCalls}), 429 ${pct(route.rateLimitRate)}, other failures ${route.otherFailures}, tokens in ${route.inputTokens} out ${route.outputTokens}`);
    for (const [model, count] of Object.entries(route.models).sort((a, b) => b[1] - a[1])) {
      console.log(`       ${String(count).padStart(5)}  ${model}`);
    }
  }

  // 6 (printed after 3) -- route mode comparison ---------------------------
  const r = report.routing;
  console.log('\n3b. ROUTE MODES (needs the outcome counters; "none" = never routed: local, cache, deterministic, errors before routing)');
  if (!r.totalRequests) {
    console.log('   (no outcome counters recorded for this day)');
  } else {
    console.log(`   requests: ${r.totalRequests}   general_guidance ${pct(r.shares.general_guidance)}   precision_research ${pct(r.shares.precision_research)}   none ${pct(r.shares.none)}`);
    for (const mode of ['general_guidance', 'precision_research', 'none']) {
      const m = r.modes[mode];
      if (!m.requests) continue;
      console.log(`   [${mode}] n=${m.requests}  useful ${pct(m.usefulRate)}  needs-detail ${pct(m.needsDetailRate)}  no-result ${pct(m.noResultRate)}  error ${pct(m.errorRate)}`);
      console.log(`       attempts/request ${num(m.avgProviderAttempts)}  tokens in/out per request ${num(m.avgInputTokens)}/${num(m.avgOutputTokens)}  grounded ${pct(m.groundedShare)}  credits ${m.logicalAiLookups}  retries ${m.retries}`);
    }
    const top = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([name, value]) => `${name} ${value}`).join(', ');
    console.log(`   reasons: ${top(r.reasons)}`);
    console.log(`   year signal: ${top(r.yearSignals)}`);
  }

  // 4 -------------------------------------------------------------------
  const u = report.users;
  const d = u.distribution;
  console.log('\n4. USER USAGE DISTRIBUTION (anonymous visitors with an AI lookup)');
  if (!u.anonymousVisitors) {
    console.log('   No per-visitor data (needs metering on, and browsers sending the visitor ID).');
  } else {
    console.log(`   Anonymous AI users: ${u.anonymousVisitors}   (IP-only subjects: ${u.ipFallbackSubjects}, accounts: ${u.accounts})`);
    console.log(`   Median lookups/user: ${d.median}   P90: ${d.p90}   P95: ${d.p95}   P99: ${d.p99}   Max: ${d.max}`);
    console.log(`   Lookups/day buckets:  ${Object.entries(d.buckets).map(([label, count]) => `${label}: ${count}`).join('   ')}`);
    console.log(`   Share of AI usage from top 1%: ${pct(d.topShare.top1, 0)}   top 5%: ${pct(d.topShare.top5, 0)}   top 10%: ${pct(d.topShare.top10, 0)}`);
  }

  // 5 -------------------------------------------------------------------
  const q = report.hypotheticalQuota;
  console.log('\n5. HYPOTHETICAL QUOTA IMPACT (shadow only: nobody was blocked)');
  for (const threshold of q.thresholds) {
    console.log(`   Would hit ${threshold.limit}/day limit:      ${users(threshold.hit, threshold.hitShare)}`);
    console.log(`   Would be blocked at ${threshold.limit}/day:    ${users(threshold.exceed, threshold.exceedShare)}  -> ${threshold.blockedLookups} lookups (${pct(threshold.blockedLookupShare)} of AI usage)`);
  }
  console.log(`   Lookups flagged would-block (any reason): ${q.wouldBlockAtLeastOnce}`);
  console.log(`   IPs over ${num(q.ipDailyLimit)}/day (all visitor IDs combined): ${q.ipsOverLimit} of ${q.ipsSeen}`);
}
