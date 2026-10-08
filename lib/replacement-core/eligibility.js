import { getFact, normalizeResolution, normalizeTier, numeric, resolved } from './normalize-values.js';
import { TIERS } from './enums.js';
import { evaluateFit, fitOutcome } from './fit.js';
import { compareRefrigeratorConfiguration } from './refrigerator-configuration.js';
import { REFRIGERATOR_CAPACITY_TOLERANCE_CU_FT } from './profiles/refrigerator.js';

function decimalUnits(left, right, tolerance) {
  const values = [left, right, tolerance].map((value) => String(value).trim());
  if (values.some((value) => !/^\d+(?:\.\d+)?$/.test(value))) return null;
  const places = Math.max(...values.map((value) => value.split('.')[1]?.length || 0));
  return values.map((value) => {
    const [whole, fraction = ''] = value.split('.');
    return BigInt(whole + fraction.padEnd(places, '0'));
  });
}

function compareHard(rule, original, replacement) {
  const a = original.value;
  const b = replacement.value;
  if (rule.comparator === 'refrigerator-capacity-minimum') {
    const left = numeric(a), right = numeric(b);
    if (left === null || right === null || left <= 0 || right <= 0
      || [original, replacement].some((entry) => entry.capacityBasis && entry.capacityBasis !== 'TOTAL_SPECIFICATION'))
      return { assessment: 'UNVERIFIED', reasonCode: 'CAPACITY_COMPARISON_UNVERIFIED' };
    const units = decimalUnits(a, b, REFRIGERATOR_CAPACITY_TOLERANCE_CU_FT);
    if (!units) return { assessment: 'UNVERIFIED', reasonCode: 'CAPACITY_COMPARISON_UNVERIFIED' };
    const [originalUnits, replacementUnits, toleranceUnits] = units;
    if (replacementUnits === originalUnits) return { assessment: 'MATCH', reasonCode: 'CAPACITY_MATCH' };
    if (replacementUnits > originalUnits) return { assessment: 'BETTER', reasonCode: 'CAPACITY_ABOVE_ORIGINAL' };
    return replacementUnits + toleranceUnits >= originalUnits
      ? { assessment: 'MATCH', reasonCode: 'CAPACITY_WITHIN_REFRIGERATOR_TOLERANCE' }
      : { assessment: 'FAIL', reasonCode: 'CAPACITY_BELOW_ALLOWED_FLOOR' };
  }
  if (rule.comparator === 'capacity-minimum') {
    const left = numeric(a), right = numeric(b);
    if (left === null || right === null) return { assessment: 'UNVERIFIED', reasonCode: 'INVALID_NUMERIC_VALUE' };
    const leftPrecision = original.precisionCuFt || 0;
    const rightPrecision = replacement.precisionCuFt || 0;
    if (Math.abs(right - left) < 0.000001) return { assessment: 'MATCH', reasonCode: 'NOMINAL_CAPACITY_MATCH' };
    if (right + rightPrecision / 2 < left - leftPrecision / 2) return { assessment: 'FAIL', reasonCode: 'HARD_MINIMUM_FAILED' };
    if (right - rightPrecision / 2 <= left + leftPrecision / 2 + 0.000001) return { assessment: 'UNVERIFIED', reasonCode: 'CAPACITY_ROUNDING_OVERLAP' };
    return { assessment: 'BETTER', reasonCode: 'HARD_MINIMUM_PASSED' };
  }
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
  if (rule.comparator === 'configuration-floor' && rule.configurationPolicy === 'REFRIGERATOR_V1')
    return compareRefrigeratorConfiguration(a, b);
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
  const fit = evaluateFit(originalIdentity, candidateIdentity, profile);
  for (const rule of hardRules) {
    const original = getFact(originalIdentity, rule.key);
    const replacement = getFact(candidateIdentity, rule.key);
    if (fit && rule.key === 'physicalFit') {
      const outcome = fitOutcome(fit);
      comparisons.push({ key: rule.key, label: rule.label, bucket: 'HARD', original, replacement, ...outcome, fitStatus: fit.status, dimensions: fit.dimensions, ...(fit.advisory ? { advisory: true } : {}) });
      if (outcome.assessment === 'FAIL') hardFailures.push({ key: rule.key, reasonCode: outcome.reasonCode, evidenceRefs: [...original.evidenceRefs, ...replacement.evidenceRefs] });
      if (fit.status === 'CONSTRAINT_UNVERIFIED') warnings.push({ key: rule.key, reasonCode: outcome.reasonCode });
      continue;
    }
    let outcome;
    if (original.status === 'ASSUMED' || replacement.status === 'ASSUMED') outcome = { assessment: 'ASSUMED', reasonCode: 'HARD_ASSUMPTION' };
    else if (original.status === 'AMBIGUOUS' || replacement.status === 'AMBIGUOUS') outcome = { assessment: 'UNVERIFIED', reasonCode: rule.comparator === 'refrigerator-capacity-minimum' ? 'CAPACITY_COMPARISON_UNVERIFIED' : 'HARD_AMBIGUOUS' };
    else if (!resolved(original) && !resolved(replacement)) outcome = { assessment: 'UNKNOWN', reasonCode: 'HARD_BOTH_UNKNOWN' };
    else if (!resolved(original) || !resolved(replacement)) outcome = { assessment: 'UNVERIFIED', reasonCode: rule.comparator === 'refrigerator-capacity-minimum' ? 'CAPACITY_COMPARISON_UNVERIFIED' : 'HARD_VALUE_UNKNOWN' };
    else outcome = compareHard(rule, original, replacement);
    const comparison = { key: rule.key, label: rule.label, bucket: 'HARD', original, replacement, ...outcome };
    comparisons.push(comparison);
    if (outcome.assessment === 'FAIL') hardFailures.push({ key: rule.key, reasonCode: outcome.reasonCode, evidenceRefs: [...original.evidenceRefs, ...replacement.evidenceRefs] });
    if (['UNKNOWN', 'UNVERIFIED', 'ASSUMED'].includes(outcome.assessment)) warnings.push({ key: rule.key, reasonCode: outcome.reasonCode });
  }

  if (profile.category === 'refrigerator' && getFact(originalIdentity, 'counterDepthRequired').value === true) {
    const replacement = getFact(candidateIdentity, 'counterDepth');
    const original = getFact(originalIdentity, 'counterDepthRequired');
    const outcome = resolved(replacement) ? replacement.value === true
      ? { assessment: 'MATCH', reasonCode: 'COUNTER_DEPTH_REQUIRED_PASSED' }
      : { assessment: 'FAIL', reasonCode: 'COUNTER_DEPTH_REQUIRED_FAILED' }
      : { assessment: 'UNVERIFIED', reasonCode: 'COUNTER_DEPTH_REQUIRED_UNVERIFIED' };
    comparisons.push({ key: 'counterDepthRequired', label: 'Required counter depth', bucket: 'HARD', original, replacement, ...outcome });
    if (outcome.assessment === 'FAIL') hardFailures.push({ key: 'counterDepthRequired', reasonCode: outcome.reasonCode, evidenceRefs: [...original.evidenceRefs, ...replacement.evidenceRefs] });
    if (outcome.assessment === 'UNVERIFIED') warnings.push({ key: 'counterDepthRequired', reasonCode: outcome.reasonCode });
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
  return { comparisons, hardFailures, warnings, fit, eligible: hardFailures.length ? false : warnings.length ? null : true };
}
