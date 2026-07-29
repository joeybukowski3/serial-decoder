import { normalizeCandidateYears } from './candidate-intersection.js';

export function buildModelProductionSummary(result, modelProduction) {
  const toleranceStart = modelProduction.productionStartYear - 1;
  const modelLabel = modelProduction.matchedModel || 'the matched model family';
  if (result.status === 'resolved') {
    return `The local model database dates ${modelLabel} to ${modelProduction.productionStartYear} or later. Allowing one year of introduction-date tolerance leaves ${result.chosenYear}.`;
  }
  if (result.status === 'ambiguous') {
    return `The local model database dates ${modelLabel} to ${modelProduction.productionStartYear} or later. Allowing one year of introduction-date tolerance narrows the serial-valid years to ${result.remainingCandidateYears.join(', ')}.`;
  }
  return `The local model database dates ${modelLabel} to ${modelProduction.productionStartYear} or later, but no serial-valid candidate is ${toleranceStart} or newer.`;
}

export function modelProductionDecision(candidateYears, modelProduction) {
  if (!Array.isArray(modelProduction?.narrowedYears)) return null;
  const candidateSet = new Set(candidateYears);
  const remainingCandidateYears = normalizeCandidateYears(modelProduction.narrowedYears)
    .filter((year) => candidateSet.has(year));
  if (remainingCandidateYears.length === 1) {
    return {
      status: 'resolved',
      candidateYears,
      remainingCandidateYears,
      chosenYear: remainingCandidateYears[0],
    };
  }
  if (remainingCandidateYears.length > 1) {
    return {
      status: 'ambiguous',
      candidateYears,
      remainingCandidateYears,
      chosenYear: null,
    };
  }
  return {
    status: 'conflict',
    candidateYears,
    remainingCandidateYears: [],
    chosenYear: null,
  };
}

export function modelProductionEvidence(input, modelProduction) {
  const productionStartYear = Number.isInteger(modelProduction?.productionStartYear)
    ? modelProduction.productionStartYear
    : null;
  return {
    type: 'local-db',
    title: `${input.brand} ${modelProduction?.matchedModel || input.model} model production record`,
    sourceUrl: modelProduction?.sourceUrl || null,
    productionStart: productionStartYear,
    productionEnd: null,
    supports: productionStartYear == null
      ? 'The matched model record narrows the serial-valid candidate years.'
      : `The model record starts in ${productionStartYear}. This is a model-era lower bound, not proof of the individual unit manufacture year; candidates before ${productionStartYear - 1} are excluded with one year of tolerance.`,
    quality: 'strong-secondary',
    verified: false,
    sourceName: modelProduction?.source || 'Local model production database',
  };
}

export function mergeLocalModelEvidence(existing, next) {
  if (!existing) return next;
  if (!next) return existing;
  const startValues = [existing.start, next.start].filter(Number.isInteger);
  const endValues = [existing.end, next.end].filter(Number.isInteger);
  const start = startValues.length ? Math.max(...startValues) : null;
  const end = endValues.length ? Math.min(...endValues) : null;
  if (start != null && end != null && start > end) return existing;
  return {
    start,
    end,
    verifiedExact: Boolean(existing.verifiedExact || next.verifiedExact),
  };
}
