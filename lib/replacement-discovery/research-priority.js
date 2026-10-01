import { getFact, resolved } from '../replacement-core/normalize-values.js';
import { FIELD_SPECS } from './research-schema.js';

/**
 * Decides WHAT is worth a provider call. Order follows the Phase 1 policy:
 * missing HARD fields, then STRONG-HIGH, then STRONG-NORMAL. SECONDARY fields are
 * skipped; model year is the one exception because it helps successor evidence.
 */

const MAX_PRIORITY_FIELDS = 12;
// Published dimensions, clearances and mount patterns are evidence-backed product facts. They feed the deterministic fit check
// only when the user supplied a constraint; research never concludes that a product fits.
const INFORMATIONAL_FIELDS = Object.freeze({
  television: ['measuredDiagonalIn', 'widthIn', 'heightIn', 'depthIn', 'mountPattern'],
  refrigerator: ['widthIn', 'heightIn', 'depthIn', 'clearanceWidthIn', 'clearanceHeightIn', 'clearanceDepthIn', 'panelReady'],
});
const NOT_RESEARCHABLE = Object.freeze(['physicalFit', 'brand']);

const descriptor = (rule, reason) => ({ key: rule.key, label: rule.label, bucket: rule.bucket, weightClass: rule.weightClass || null, reason });

function rankedRules(profile) {
  const rules = profile.rules.filter((rule) => !NOT_RESEARCHABLE.includes(rule.key));
  return [
    ...rules.filter((rule) => rule.bucket === 'HARD').map((rule) => descriptor(rule, 'HARD')),
    ...rules.filter((rule) => rule.bucket === 'STRONG' && rule.weightClass === 'HIGH').map((rule) => descriptor(rule, 'STRONG_HIGH')),
    ...rules.filter((rule) => rule.bucket === 'STRONG' && rule.weightClass === 'NORMAL').map((rule) => descriptor(rule, 'STRONG_NORMAL')),
  ];
}

/** Fields every candidate needs so the deterministic evaluator can compare it. */
export function candidateFieldPlan(profile) {
  const specs = FIELD_SPECS[profile.category];
  const informational = INFORMATIONAL_FIELDS[profile.category].map((key) => ({ key, label: key, bucket: 'INFORMATIONAL', weightClass: null, reason: 'FIT_FACT' }));
  return [...rankedRules(profile).filter((field) => Object.hasOwn(specs, field.key) || field.key === 'tier'), ...informational];
}

/** Job A scope: only fields the original is still missing (ASSUMED tier baselines count as missing). */
export function planResearch(original, profile) {
  const modelKnown = getFact(original, 'model').status === 'KNOWN';
  const specs = FIELD_SPECS[profile.category];
  const priorityFields = rankedRules(profile)
    .filter((field) => (Object.hasOwn(specs, field.key) || field.key === 'tier') && !resolved(getFact(original, field.key)))
    .slice(0, MAX_PRIORITY_FIELDS);
  if (modelKnown && !resolved(getFact(original, 'modelYear')) && !priorityFields.some((field) => field.key === 'modelYear')) {
    priorityFields.push({ key: 'modelYear', label: 'Model year', bucket: 'SECONDARY', weightClass: null, reason: 'SUCCESSOR_EVIDENCE' });
  }
  return {
    mode: modelKnown ? 'EXACT_MODEL' : 'BROAD_BASELINE',
    // A broad query has no exact original to research: its unknowns stay unknown and discovery establishes a baseline.
    // A paid call needs a missing HARD or STRONG-HIGH field; NORMAL/secondary gaps alone never justify one.
    originalResearch: modelKnown && priorityFields.some((field) => ['HARD', 'STRONG_HIGH'].includes(field.reason)),
    priorityFields,
    informationalFields: modelKnown ? INFORMATIONAL_FIELDS[profile.category] : [],
    notResearchable: NOT_RESEARCHABLE.filter((key) => key !== 'brand'),
  };
}
