import { normalizeCandidateYears } from './candidate-intersection.js';
import { createRefinementResponse } from './response-schema.js';

export function buildSummary(result, normalization) {
  const alternativeNote = normalization?.usedValidatedAlternative && normalization?.validatedAlternative
    ? ` The entered model was matched to validated alternative ${normalization.validatedAlternative.value} (${normalization.validatedAlternative.change}).`
    : '';
  if (result.status === 'resolved') {
    return `Serial decoding produced ${result.candidateYears.join(', ')}. Model evidence eliminates the other serial-valid cycles and leaves ${result.chosenYear}.${alternativeNote}`;
  }
  if (result.status === 'ambiguous') {
    return `Model evidence narrows the serial-valid years to ${result.remainingCandidateYears.join(', ')}, but does not establish one manufacture year.${alternativeNote}`;
  }
  if (result.status === 'conflict') {
    return `The model evidence does not overlap the serial-valid candidate years. The original serial result is preserved for review.${alternativeNote}`;
  }
  return `Model evidence was unavailable or insufficient. The original serial-valid candidate years are preserved.${alternativeNote}`;
}

function createUnavailableResult({ input, timings, cacheStatus, errorCode, summary }) {
  return createRefinementResponse({
    status: 'unavailable',
    candidateYears: input.candidateYears,
    remainingCandidateYears: input.candidateYears,
    chosenYear: null,
    confidence: null,
    resolutionBasis: 'serial-plus-model',
    modelProductionRange: null,
    evidence: [],
    summary,
    cacheStatus,
    provider: 'none',
    timings,
    errorCode,
  });
}

export function createBestAvailableResult({
  input,
  remainingCandidateYears,
  confidence,
  modelProductionRange,
  modelNormalization,
  evidence,
  timings,
  cacheStatus,
  provider,
  errorCode,
  summary,
}) {
  const narrowed = normalizeCandidateYears(remainingCandidateYears);
  if (narrowed.length > 0 && narrowed.length < input.candidateYears.length) {
    return createRefinementResponse({
      status: 'ambiguous',
      candidateYears: input.candidateYears,
      remainingCandidateYears: narrowed,
      chosenYear: null,
      confidence: confidence || 'low',
      resolutionBasis: 'serial-plus-model',
      modelProductionRange: modelProductionRange || null,
      modelNormalization: modelNormalization || null,
      evidence: evidence || [],
      summary: summary || `Local model-era evidence narrows the serial-valid years to ${narrowed.join(', ')}, but does not establish one manufacture year.`,
      cacheStatus,
      provider: provider || 'local-db',
      timings,
      errorCode,
    });
  }
  if (provider && provider !== 'none') {
    return createRefinementResponse({
      status: 'unavailable',
      candidateYears: input.candidateYears,
      remainingCandidateYears: input.candidateYears,
      chosenYear: null,
      confidence: null,
      resolutionBasis: 'serial-plus-model',
      modelProductionRange: modelProductionRange || null,
      modelNormalization: modelNormalization || null,
      evidence: evidence || [],
      summary: summary || 'Model evidence was unavailable or insufficient. The original serial-valid candidate years are preserved.',
      cacheStatus,
      provider,
      timings,
      errorCode,
    });
  }
  return createUnavailableResult({
    input,
    timings,
    cacheStatus,
    errorCode,
    summary: summary || 'Model evidence was unavailable or insufficient. The original serial-valid candidate years are preserved.',
  });
}

function narrowedDecision(candidateYears, remainingCandidateYears) {
  const candidates = normalizeCandidateYears(candidateYears);
  const candidateSet = new Set(candidates);
  const remaining = normalizeCandidateYears(remainingCandidateYears).filter((year) => candidateSet.has(year));
  if (remaining.length === 1) {
    return { status: 'resolved', candidateYears: candidates, remainingCandidateYears: remaining, chosenYear: remaining[0] };
  }
  if (remaining.length > 1 && remaining.length < candidates.length) {
    return { status: 'ambiguous', candidateYears: candidates, remainingCandidateYears: remaining, chosenYear: null };
  }
  return null;
}

function mapDeterministicConfidence(value) {
  if (value === 'high') return 'high';
  if (value === 'moderate') return 'medium';
  return 'low';
}

function hasUsableDeterministicWebFacts(result) {
  if (result?.status !== 'success' || result?.gemini?.status !== 'success') return false;
  return (result.extractedFacts || []).some((fact) =>
    fact?.exactModelMatch === true
    && fact?.dateMeaning !== 'unknown'
    && (
      Number.isInteger(fact?.absoluteDate)
      || Number.isInteger(fact?.approximateYear)
      || Number.isInteger(fact?.normalizedDateYear)
    ));
}

export function createDeterministicRefinementResult({
  input,
  workingCandidateYears,
  deterministic,
  localEvidence,
  localModelRange,
  modelNormalization,
  cacheStatus,
  timings,
}) {
  const output = deterministic?.output || {};
  if (!hasUsableDeterministicWebFacts(deterministic)) return null;

  let decision = null;
  if (output.resolutionType === 'resolved-single'
    && Number.isInteger(output.bestEstimateYear)
    && workingCandidateYears.includes(output.bestEstimateYear)) {
    decision = narrowedDecision(input.candidateYears, [output.bestEstimateYear]);
  } else if (output.resolutionType === 'narrowed') {
    const plausible = normalizeCandidateYears(output.plausibleYears || [])
      .filter((year) => workingCandidateYears.includes(year));
    decision = narrowedDecision(input.candidateYears, plausible);
  }
  if (!decision) return null;

  const estimatedEra = output.estimatedModelEra || {};
  const estimatedRange = Number.isInteger(estimatedEra.startYear) || Number.isInteger(estimatedEra.endYear)
    ? {
        start: Number.isInteger(estimatedEra.startYear) ? estimatedEra.startYear : null,
        end: Number.isInteger(estimatedEra.endYear) ? estimatedEra.endYear : null,
      }
    : localModelRange;

  return createRefinementResponse({
    ...decision,
    confidence: mapDeterministicConfidence(output.confidence),
    resolutionBasis: 'serial-plus-model',
    modelProductionRange: estimatedRange,
    modelNormalization,
    evidence: [...localEvidence, ...(deterministic?.evidence || [])],
    summary: buildSummary(decision, modelNormalization),
    cacheStatus,
    provider: 'deterministic-serper',
    timings,
    errorCode: null,
  });
}
