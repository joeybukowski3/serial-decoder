/**
 * Coarse, privacy-safe latency buckets for provider telemetry.
 *
 * Exact durations would explode Redis hash cardinality, so provider attempts
 * are counted per bucket instead. Labels only use [a-z0-9-] so they survive
 * the field-name sanitizer in provider-usage.js unchanged.
 */

// [label, exclusive upper bound in ms]. Finer around 5-8s because the heavy
// provider stage cap (6500 ms by default) lands in that range.
export const DURATION_BUCKETS = Object.freeze([
  ['lt1s', 1000],
  ['1-2s', 2000],
  ['2-3s', 3000],
  ['3-4s', 4000],
  ['4-5s', 5000],
  ['5-6s', 6000],
  ['6-7s', 7000],
  ['7-8s', 8000],
  ['8-10s', 10000],
  ['10-13s', 13000],
  ['ge13s', Infinity],
]);

// How much route budget was left when a stage began.
export const REMAINING_BUDGET_BUCKETS = Object.freeze([
  ['lt2s', 2000],
  ['2-4s', 4000],
  ['4-7s', 7000],
  ['7-10s', 10000],
  ['10-13s', 13000],
  ['ge13s', Infinity],
]);

function bucketFor(buckets, ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return null;
  for (const [label, upperBound] of buckets) {
    if (ms < upperBound) return label;
  }
  return null;
}

export function durationBucket(ms) {
  return bucketFor(DURATION_BUCKETS, ms);
}

export function remainingBudgetBucket(ms) {
  return bucketFor(REMAINING_BUDGET_BUCKETS, ms);
}
