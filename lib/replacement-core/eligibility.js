import { getFact, normalizeResolution, normalizeTier, numeric, resolved } from './normalize-values.js';
import { TIERS } from './enums.js';

function compareHard(rule, original, replacement) {
  const a = original.value;
  const b = replacement.value;
  if (rule.comparator === 'numeric-minimum') {
    const left = numeric(a);
    const right = numeric(b);
    if (left === null || right === null) return { assessment: 'UNVERIFIED', reasonCode: 'INVALID_NUMERIC_VALUE' };
    return right + 0.000001 < left
      ? { assessment: 'FAIL', reasonCode: 'HARD_MINIMUM_FAILED' }
      : { assessment: right > left + 0.000001 ? 'BETTER' : 'MATCH', reasonCode: 'HARD_MINIMUM_PASSED' };
  }
  if (rule.comparator === 'resolution-minimum') {
    const left = normalizeResolution(a);
    const right = normalizeResolution(b);
    if (left === null || right === null) return { assessment: 'UNVERIFIED', reasonCode: 'INVALID_RESOLUTION' };
    return right < left ? { assessment: 'FAIL', reasonCode: 'HARD_MINIMUM_FAILED' }
      : { assessment: right > left ? 'BETTER' : 'MATCH', reasonCode: 'HARD_MINIMUM_PASSED' };
  }
  if (rule.comparator === 'tier-minimum') {
    const left = TIERS.indexOf(normalizeTier(a));
    const right = TIERS.indexOf(normalizeTier(b));
    if (left < 0 || right < 0) return { assessment: 'UNVERIFIED', reasonCode: 'INVALID_TIER' };
    return right < left ? { assessment: 'FAIL', reasonCode: 'HARD_MINIMUM_FAILED' }
      : { assessment: right > left ? 'BETTER' : 'MATCH', reasonCode: 'HARD_MINIMUM_PASSED' };
  }
  if (rule.comparator === 'boolean-match' || rule.comparator === 'categorical-match' || rule.comparator === 'configuration-floor') {
    return String(a).toLowerCase() === String(b).toLowerCase()
      ? { assessment: 'MATCH', reasonCode: 'HARD_MATCH_PASSED' }
      : { assessment: 'FAIL', reasonCode: 'HARD_MATCH_FAILED' };
  }
  throw new TypeError(`Unsupported hard comparator: ${rule.comparator}`);
}

export function evaluateHardRules(originalIdentity, candidateIdentity, profile, requirements = []) {
  const comparisons = [];
  const hardFailures = [];
  const warnings = [];
  const hardRules = profile.rules.filter((rule) => rule.bucket === 'HARD');
  if (originalIdentity.category !== candidateIdentity.category) {
    hardFailures.push({ key: 'category', reasonCode: 'WRONG_CATEGORY', evidenceRefs: [] });
  }
  for (const rule of hardRules) {
    const original = getFact(originalIdentity, rule.key);
    const replacement = getFact(candidateIdentity, rule.key);
    let outcome;
    if (original.status === 'ASSUMED' || replacement.status === 'ASSUMED') outcome = { assessment: 'ASSUMED', reasonCode: 'HARD_ASSUMPTION' };
    else if (original.status === 'AMBIGUOUS' || replacement.status === 'AMBIGUOUS') outcome = { assessment: 'UNVERIFIED', reasonCode: 'HARD_AMBIGUOUS' };
    else if (!resolved(original) && !resolved(replacement)) outcome = { assessment: 'UNKNOWN', reasonCode: 'HARD_BOTH_UNKNOWN' };
    else if (!resolved(original) || !resolved(replacement)) outcome = { assessment: 'UNVERIFIED', reasonCode: 'HARD_VALUE_UNKNOWN' };
    else outcome = compareHard(rule, original, replacement);
    const comparison = { key: rule.key, label: rule.label, bucket: 'HARD', original, replacement, ...outcome };
    comparisons.push(comparison);
    if (outcome.assessment === 'FAIL') hardFailures.push({ key: rule.key, reasonCode: outcome.reasonCode, evidenceRefs: [...original.evidenceRefs, ...replacement.evidenceRefs] });
    if (['UNKNOWN', 'UNVERIFIED', 'ASSUMED'].includes(outcome.assessment)) warnings.push({ key: rule.key, reasonCode: outcome.reasonCode });
  }

  for (const requirement of requirements) {
    if (!requirement || !profile.rules.some((rule) => rule.key === requirement.key && rule.bucket !== 'HARD') ||
        !['MATCH', 'MINIMUM'].includes(requirement.hardRule) || !Array.isArray(requirement.evidenceRefs) || !requirement.evidenceRefs.length) {
      throw new TypeError('case-specific promotion requires a non-hard rule, comparison type, and documented evidenceRefs');
    }
    const replacement = getFact(candidateIdentity, requirement.key);
    const original = { status: 'KNOWN', value: requirement.requiredValue, evidenceRefs: requirement.evidenceRefs };
    const promotedRule = { key: requirement.key, comparator: requirement.hardRule === 'MINIMUM' ? 'numeric-minimum' : 'categorical-match' };
    const outcome = resolved(replacement) ? compareHard(promotedRule, original, replacement) : { assessment: 'UNVERIFIED', reasonCode: 'PROMOTED_VALUE_UNKNOWN' };
    comparisons.push({ key: requirement.key, label: requirement.key, bucket: 'HARD', promoted: true, original, replacement, ...outcome });
    if (outcome.assessment === 'FAIL') hardFailures.push({ key: requirement.key, reasonCode: 'PROMOTED_HARD_FAILED', evidenceRefs: [...requirement.evidenceRefs, ...replacement.evidenceRefs] });
    if (outcome.assessment === 'UNVERIFIED') warnings.push({ key: requirement.key, reasonCode: outcome.reasonCode });
  }
  return { comparisons, hardFailures, warnings, eligible: hardFailures.length ? false : warnings.length ? null : true };
}
