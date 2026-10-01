import { RANK, modelRelation } from './evidence-normalizer.js';
import { modelKey } from './research-schema.js';

const SAME_SERIES_PREFIX = 6;

const lower = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : null);

function compatibleModels(a, b) {
  return ['EXACT', 'VARIANT'].includes(modelRelation(a, b));
}

function sharesSeries({ originalSeries, candidateSeries, originalModel, candidateModel }) {
  if (originalSeries && candidateSeries) return lower(originalSeries) === lower(candidateSeries);
  const a = modelKey(originalModel), b = modelKey(candidateModel);
  return a.length >= SAME_SERIES_PREFIX && b.length >= SAME_SERIES_PREFIX && a.slice(0, SAME_SERIES_PREFIX) === b.slice(0, SAME_SERIES_PREFIX);
}

/**
 * A provider relationship claim is a ceiling, never a fact. Claims are downgraded
 * to the strongest relationship the evidence and identity data actually support.
 * DIRECT_SUCCESSOR needs a grounded manufacturer/retailer source plus a related
 * model that matches the original; similar naming alone never qualifies.
 */
export function resolveRelationship({ claimed, original, candidate, evidence }) {
  const sameBrand = original.brand && candidate.brand ? lower(original.brand) === lower(candidate.brand) : null;
  const isBaseline = !candidate.model;
  let resolved = claimed;

  if (sameBrand === false && ['DIRECT_SUCCESSOR', 'SAME_SERIES', 'SAME_BRAND_ALTERNATIVE'].includes(resolved)) resolved = 'CROSS_BRAND_ALTERNATIVE';
  if (sameBrand === true && resolved === 'CROSS_BRAND_ALTERNATIVE') resolved = 'SAME_BRAND_ALTERNATIVE';
  if (sameBrand === null && ['DIRECT_SUCCESSOR', 'SAME_SERIES', 'SAME_BRAND_ALTERNATIVE', 'CROSS_BRAND_ALTERNATIVE'].includes(resolved)) resolved = 'UNKNOWN';
  if (isBaseline && ['DIRECT_SUCCESSOR', 'SAME_SERIES'].includes(resolved)) resolved = 'FUNCTIONAL_EQUIVALENT';

  if (resolved === 'DIRECT_SUCCESSOR') {
    const supported = evidence.bestRank <= RANK.RETAILER
      && compatibleModels(candidate.relatedModel, original.model)
      && modelKey(candidate.model) !== modelKey(original.model);
    if (!supported) resolved = 'SAME_SERIES';
  }
  if (resolved === 'SAME_SERIES' && !sharesSeries({ originalSeries: original.series, candidateSeries: candidate.series, originalModel: original.model, candidateModel: candidate.model })) {
    resolved = 'SAME_BRAND_ALTERNATIVE';
  }
  return { relationship: resolved, downgradedFrom: resolved === claimed ? null : claimed };
}
