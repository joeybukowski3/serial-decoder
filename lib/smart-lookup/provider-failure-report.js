/**
 * Read-only failure/latency diagnosis built from the provider-usage hash.
 *
 * Kept separate from summarizeUsage() on purpose: that function's row shape is
 * pinned by other reports, and this one only adds optional counters (HTTP
 * status of failed attempts, latency buckets, stage-cap hits). Counters that
 * pre-date the diagnostics change simply read as absent.
 */
import { DURATION_BUCKETS, REMAINING_BUDGET_BUCKETS } from './provider-diagnostics.js';
import { readProviderUsageHash } from './provider-usage.js';

const LATENCY_ORDER = DURATION_BUCKETS.map(([label]) => label);
const REMAINING_ORDER = REMAINING_BUDGET_BUCKETS.map(([label]) => label);
// Always printed (even at zero) so "timeout: 0" is a visible finding, not an omission.
const ALWAYS_SHOWN_FAILURES = ['http_error', 'timeout', 'malformed', 'rate_limited'];
const OTHER_FAILURES = ['server_error', 'network_error', 'error'];
const PROVIDER_LABELS = { gemini: 'Gemini', openai: 'OpenAI', xai: 'xAI', groq: 'Groq' };

function newRow(route, provider, model) {
  return {
    route, provider, model, calls: 0,
    statuses: {}, httpStatuses: {}, durations: {}, remaining: {},
    capHits: 0, routeLimitedTimeouts: 0, usableYes: 0, usableNo: 0,
  };
}

function bump(map, key, amount) {
  map[key] = (map[key] || 0) + amount;
}

export function summarizeProviderDiagnostics(hash = {}) {
  const rows = new Map();
  for (const [field, raw] of Object.entries(hash || {})) {
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    const parts = field.split('|');
    if (parts.length !== 4) continue;
    const key = parts.slice(0, 3).join('|');
    const row = rows.get(key) || newRow(parts[0], parts[1], parts[2]);
    const metric = parts[3];
    if (metric === 'calls') row.calls += value;
    else if (metric.startsWith('status:')) bump(row.statuses, metric.slice(7), value);
    else if (metric.startsWith('http:')) bump(row.httpStatuses, metric.slice(5), value);
    else if (metric.startsWith('dur:')) bump(row.durations, metric.slice(metric.lastIndexOf(':') + 1), value);
    else if (metric.startsWith('rem:')) bump(row.remaining, metric.slice(4), value);
    else if (metric === 'cap_hit') row.capHits += value;
    else if (metric === 'timeout_route_limited') row.routeLimitedTimeouts += value;
    else if (metric === 'usable_yes') row.usableYes += value;
    else if (metric === 'usable_no') row.usableNo += value;
    rows.set(key, row);
  }
  return [...rows.values()]
    .filter((row) => row.calls > 0)
    .sort((a, b) => a.route.localeCompare(b.route) || b.calls - a.calls);
}

export async function readProviderDiagnostics(redis, day) {
  return summarizeProviderDiagnostics(await readProviderUsageHash(redis, day));
}

/** Bucket containing the median attempt, or null when no latency was recorded. */
export function medianBucket(counts, order = LATENCY_ORDER) {
  const total = order.reduce((sum, label) => sum + (counts[label] || 0), 0);
  if (!total) return null;
  let seen = 0;
  for (const label of order) {
    seen += counts[label] || 0;
    if (seen * 2 >= total) return label;
  }
  return null;
}

function distribution(counts, order) {
  const parts = order.filter((label) => counts[label]).map((label) => `${label} ${counts[label]}`);
  return parts.length ? parts.join('   ') : null;
}

function renderRow(row) {
  const ok = row.statuses.ok || 0;
  const failed = Object.entries(row.statuses).filter(([status]) => status !== 'ok').reduce((sum, [, n]) => sum + n, 0);
  const label = PROVIDER_LABELS[row.provider] || row.provider;
  const lines = [`   [${row.route}] ${label} ${row.model}   calls ${row.calls}  ok ${ok}  failed ${failed}`];

  const failureNames = [...ALWAYS_SHOWN_FAILURES, ...OTHER_FAILURES.filter((name) => row.statuses[name])];
  lines.push(`       outcomes:  ${failureNames.map((name) => `${name} ${row.statuses[name] || 0}`).join('   ')}`);

  const codes = Object.entries(row.httpStatuses).sort(([a], [b]) => Number(a) - Number(b));
  lines.push(`       HTTP status of failed attempts:  ${codes.length ? codes.map(([code, n]) => `${code}: ${n}`).join('   ') : 'none recorded'}`);

  const latency = distribution(row.durations, LATENCY_ORDER);
  lines.push(latency
    ? `       latency (all outcomes, bucketed):  median ${medianBucket(row.durations)}   ${latency}`
    : '       latency: not recorded');

  if (row.capHits || row.routeLimitedTimeouts) {
    lines.push(`       timeouts bound by the stage cap: ${row.capHits}   bound by remaining route time: ${row.routeLimitedTimeouts}`);
  }
  if (row.usableYes || row.usableNo) {
    lines.push(`       usable response received:  yes ${row.usableYes}   no ${row.usableNo}`);
  }
  const remaining = distribution(row.remaining, REMAINING_ORDER);
  if (remaining) lines.push(`       route budget left when the stage began:  ${remaining}`);
  return lines;
}

export function renderProviderFailureReport(rows) {
  const lines = ['\n10. PROVIDER FAILURE DETAIL  (status codes, outcomes and latency per provider/model; latency is bucketed)'];
  if (!rows.length) {
    lines.push('   (no provider attempts recorded for this day)');
    return lines;
  }
  for (const row of rows) lines.push(...renderRow(row));
  lines.push('   HTTP status, latency and stage-cap counters only exist for attempts made after they were introduced.');
  return lines;
}
