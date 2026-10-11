import { getFact, numeric, resolved } from './normalize-values.js';
import { normalizeRefrigeratorLayout } from './refrigerator-configuration.js';

function compareSimilarity(rule, original, replacement) {
  const a = original.value;
  const b = replacement.value;
  if (rule.comparator === 'numeric-similarity') {
    const left = numeric(a);
    const right = numeric(b);
    if (left === null || right === null) return { assessment: 'UNVERIFIED', reasonCode: 'INVALID_NUMERIC_VALUE', factor: 0 };
    if (right === left) return { assessment: 'MATCH', reasonCode: 'SIMILARITY_MATCH', factor: 1 };
    return right > left
      ? { assessment: 'BETTER', reasonCode: 'SIMILARITY_HIGHER', factor: 1 }
      : { assessment: 'DIFFERENT', reasonCode: 'SIMILARITY_LOWER', factor: 0.35 };
  }
  if (rule.comparator === 'boolean-similarity') {
    if (typeof a !== 'boolean' || typeof b !== 'boolean') return { assessment: 'UNVERIFIED', reasonCode: 'INVALID_BOOLEAN_VALUE', factor: 0 };
    if (a === b) return { assessment: 'MATCH', reasonCode: 'SIMILARITY_MATCH', factor: 1 };
    return b ? { assessment: 'BETTER', reasonCode: 'SIMILARITY_ADDED', factor: 1 }
      : { assessment: 'DIFFERENT', reasonCode: 'SIMILARITY_LOST', factor: 0.35 };
  }
  if (rule.comparator === 'categorical') {
    const left = rule.key === 'layout' ? normalizeRefrigeratorLayout(a) : String(a).toLowerCase();
    const right = rule.key === 'layout' ? normalizeRefrigeratorLayout(b) : String(b).toLowerCase();
    return left === right
      ? { assessment: 'MATCH', reasonCode: 'SIMILARITY_MATCH', factor: 1 }
      : { assessment: 'DIFFERENT', reasonCode: 'SIMILARITY_DIFFERENT', factor: 0.4 };
  }
  throw new TypeError(`Unsupported similarity comparator: ${rule.comparator}`);
}

function compareRule(rule, originalIdentity, candidateIdentity) {
  const original = getFact(originalIdentity, rule.key);
  const replacement = getFact(candidateIdentity, rule.key);
  let outcome;
  if (original.status === 'ASSUMED' || replacement.status === 'ASSUMED') outcome = { assessment: 'ASSUMED', reasonCode: 'SIMILARITY_ASSUMED', factor: 0 };
  else if (original.status === 'AMBIGUOUS' || replacement.status === 'AMBIGUOUS') outcome = { assessment: 'UNVERIFIED', reasonCode: 'SIMILARITY_AMBIGUOUS', factor: 0 };
  else if (!resolved(original) && !resolved(replacement)) outcome = { assessment: 'UNKNOWN', reasonCode: 'SIMILARITY_BOTH_UNKNOWN', factor: 0 };
  else if (!resolved(original) || !resolved(replacement)) outcome = { assessment: 'UNVERIFIED', reasonCode: 'SIMILARITY_UNKNOWN', factor: 0 };
  else outcome = compareSimilarity(rule, original, replacement);
  return { key: rule.key, label: rule.label, bucket: rule.bucket, weightClass: rule.weightClass || null, original, replacement, ...outcome };
}

function bucketScore(rows, weightFor) {
  const possible = rows.reduce((sum, row) => sum + weightFor(row), 0);
  const known = rows.filter((row) => ['MATCH', 'BETTER', 'DIFFERENT'].includes(row.assessment));
  const observed = known.reduce((sum, row) => sum + weightFor(row), 0);
  const earned = known.reduce((sum, row) => sum + weightFor(row) * row.factor, 0);
  return { possible, observed, earned, coverage: possible ? observed / possible : 0, similarity: observed ? earned / observed : null };
}

export function evaluateSimilarity(originalIdentity, candidateIdentity, profile) {
  const comparisons = profile.rules.filter((rule) => rule.bucket !== 'HARD').map((rule) => compareRule(rule, originalIdentity, candidateIdentity));
  const strong = bucketScore(comparisons.filter((row) => row.bucket === 'STRONG'), (row) => row.weightClass === 'HIGH' ? 2 : 1);
  const secondary = bucketScore(comparisons.filter((row) => row.bucket === 'SECONDARY'), () => 1);
  for (const row of comparisons) {
    const bucket = row.bucket === 'STRONG' ? strong : secondary;
    const bucketShare = row.bucket === 'STRONG' ? 85 : 15;
    const ruleWeight = row.bucket === 'STRONG' && row.weightClass === 'HIGH' ? 2 : 1;
    row.maxPoints = bucket.possible ? bucketShare * ruleWeight / bucket.possible : 0;
    row.earnedPoints = row.maxPoints * row.factor;
  }
  // Unknown comparisons earn no match credit. The known-only similarity is
  // paired with explicit coverage so sparse input cannot masquerade as HIGH confidence.
  const weightedTotal = (strong.similarity === null && secondary.similarity === null) ? null
    : Math.round(comparisons.reduce((sum, row) => sum + row.earnedPoints, 0) * 10) / 10;
  return { comparisons, strong, secondary, weightedTotal };
}
