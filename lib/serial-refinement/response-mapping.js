import { normalizeCandidateYears } from './candidate-intersection.js';
import { createRefinementResponse } from './response-schema.js';

function identityDisclosure(normalization, modelIdentity) {
  const entered = modelIdentity?.enteredModel || normalization?.canonical || normalization?.original || null;
  const recognized = modelIdentity?.canonicalModel
    || (normalization?.usedValidatedAlternative ? normalization?.validatedAlternative?.value : null);
  if (entered && recognized && String(entered).toUpperCase() !== String(recognized).toUpperCase()) {
    const reason = modelIdentity?.equivalenceReason || normalization?.validatedAlternative?.change || 'transcription check';
    return ` Model entered as ${entered}; recognized form ${recognized} (${reason}).`;
  }
  if (normalization?.usedValidatedAlternative && normalization?.validatedAlternative) {
    return ` The entered model was matched to validated alternative ${normalization.validatedAlternative.value} (${normalization.validatedAlternative.change}).`;
  }
  return '';
}

export function buildSummary(result, normalization, modelIdentity = null) {
  const alternativeNote = identityDisclosure(normalization, modelIdentity);
  if (result.status === 'resolved') {
    return `Serial decoding produced ${result.candidateYears.join(', ')}. Model evidence eliminates the other serial-valid cycles and leaves ${result.chosenYear}.${alternativeNote}`;
  }
  if (result.status === 'ranked') {
    const others = result.remainingCandidateYears.filter((year) => year !== result.preferredCandidateYear);
    return `Most likely manufacture year: ${result.preferredCandidateYear}. Other serial-valid candidate${others.length === 1 ? '' : 's'}: ${others.join(', ')}.${alternativeNote}`;
  }
  if (result.status === 'ambiguous_with_era') {
    const range = result.modelProductionRange;
    const rangeText = range?.start != null
      ? (range.end != null ? `${range.start}-${range.end}` : `${range.start} or later`)
      : 'a modern production period';
    return `Serial candidates remain ${result.remainingCandidateYears.join(' or ')}. Model evidence supports ${rangeText} but does not fully resolve the individual unit year.${alternativeNote}`;
  }
  if (result.status === 'ambiguous') {
    return `Model evidence narrows the serial-valid years to ${result.remainingCandidateYears.join(', ')}, but does not establish one manufacture year.${alternativeNote}`;
  }
  if (result.status === 'conflict') {
    return `The model evidence does not overlap the serial-valid candidate years. The original serial result is preserved for review.${alternativeNote}`;
  }
  if (result.status === 'clarification') {
    return result.summary || 'Add a complete model number to narrow the serial-valid manufacture years.';
  }
  return `Model evidence was unavailable or insufficient. The original serial-valid candidate years are preserved.${alternativeNote}`;
}

function createUnavailableResult({ input, timings, cacheStatus, errorCode, summary, modelIdentity, modelNormalization, failureStage }) {
  return createRefinementResponse({
    status: 'unavailable',
    candidateYears: input.candidateYears,
    remainingCandidateYears: input.candidateYears,
    chosenYear: null,
    confidence: null,
    resolutionBasis: 'serial-plus-model',
    modelProductionRange: null,
    modelNormalization: modelNormalization || null,
    modelIdentity: modelIdentity || null,
    evidence: [],
    summary,
    cacheStatus,
    provider: 'none',
    timings,
    errorCode,
    failureStage: failureStage || null,
    refinementResultTier: 'unavailable',
  });
}

/**
 * Build the strongest useful refinement result from local/serial context when
 * online evidence is missing or infrastructure fails.
 */
export function createBestAvailableResult({
  input,
  remainingCandidateYears,
  confidence,
  modelProductionRange,
  modelNormalization,
  modelIdentity,
  evidence,
  timings,
  cacheStatus,
  provider,
  errorCode,
  summary,
  failureStage,
  preferredCandidateYear,
  rankingExplanation,
  estimateBasis,
  identityMatchType,
  identityConfidence,
  evidenceMatchModel,
  evidenceMatchType,
  searchedModels,
  deterministicFallbackUsed,
}) {
  const narrowed = normalizeCandidateYears(remainingCandidateYears);
  const range = modelProductionRange || null;
  const hasEra = Number.isInteger(range?.start) || Number.isInteger(range?.end);
  const identity = modelIdentity || null;
  const commonMeta = {
    modelNormalization: modelNormalization || null,
    modelIdentity: identity,
    evidence: evidence || [],
    timings,
    cacheStatus,
    provider: provider || 'none',
    errorCode: errorCode || null,
    failureStage: failureStage || null,
    estimateBasis: estimateBasis || null,
    identityMatchType: identityMatchType || identity?.matchedBy || null,
    identityConfidence: identityConfidence || identity?.identityConfidence || null,
    evidenceMatchModel: evidenceMatchModel || identity?.canonicalModel || null,
    evidenceMatchType: evidenceMatchType || null,
    searchedModels: searchedModels || identity?.searchModels || null,
    deterministicFallbackUsed: Boolean(deterministicFallbackUsed || errorCode),
  };

  // Strict resolve only when intersection left exactly one serial-valid year.
  if (narrowed.length === 1) {
    const decision = {
      status: 'resolved',
      candidateYears: input.candidateYears,
      remainingCandidateYears: narrowed,
      chosenYear: narrowed[0],
    };
    return createRefinementResponse({
      ...decision,
      confidence: confidence || 'medium',
      resolutionBasis: 'serial-plus-model',
      modelProductionRange: range,
      summary: summary || buildSummary(decision, modelNormalization, identity),
      refinementResultTier: 'resolved',
      ...commonMeta,
      deterministicFallbackUsed: Boolean(deterministicFallbackUsed),
    });
  }

  if (
    Number.isInteger(preferredCandidateYear)
    && narrowed.includes(preferredCandidateYear)
    && narrowed.length > 1
  ) {
    const decision = {
      status: 'ranked',
      candidateYears: input.candidateYears,
      remainingCandidateYears: narrowed,
      preferredCandidateYear,
      modelProductionRange: range,
    };
    return createRefinementResponse({
      ...decision,
      confidence: confidence || 'medium',
      resolutionBasis: 'serial-plus-model',
      modelProductionRange: range,
      summary: summary || buildSummary(decision, modelNormalization, identity),
      rankingExplanation: rankingExplanation || null,
      refinementResultTier: 'ranked',
      ...commonMeta,
    });
  }

  if (narrowed.length > 0 && narrowed.length < input.candidateYears.length) {
    const decision = {
      status: hasEra ? 'ambiguous_with_era' : 'ambiguous',
      candidateYears: input.candidateYears,
      remainingCandidateYears: narrowed,
      modelProductionRange: range,
    };
    return createRefinementResponse({
      ...decision,
      confidence: confidence || 'low',
      resolutionBasis: 'serial-plus-model',
      modelProductionRange: range,
      summary: summary || buildSummary(decision, modelNormalization, identity),
      refinementResultTier: decision.status,
      ...commonMeta,
    });
  }

  if (hasEra && narrowed.length > 1) {
    const decision = {
      status: 'ambiguous_with_era',
      candidateYears: input.candidateYears,
      remainingCandidateYears: narrowed.length ? narrowed : input.candidateYears,
      modelProductionRange: range,
    };
    return createRefinementResponse({
      ...decision,
      confidence: confidence || 'low',
      resolutionBasis: 'serial-plus-model',
      modelProductionRange: range,
      summary: summary || buildSummary(decision, modelNormalization, identity),
      refinementResultTier: 'ambiguous_with_era',
      ...commonMeta,
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
      modelProductionRange: range,
      summary: summary || 'Model evidence was unavailable or insufficient. The original serial-valid candidate years are preserved.',
      refinementResultTier: 'unavailable',
      ...commonMeta,
      provider,
    });
  }

  return createUnavailableResult({
    input,
    timings,
    cacheStatus,
    errorCode,
    summary: summary || 'Model evidence was unavailable or insufficient. The original serial-valid candidate years are preserved.',
    modelIdentity: identity,
    modelNormalization,
    failureStage,
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
  return (result?.extractedFacts || []).some((fact) =>
    (fact?.exactModelMatch === true
      || fact?.modelMatchType === 'exact'
      || fact?.modelMatchType === 'canonical-equivalent')
    && fact?.dateMeaning !== 'unknown'
    && (
      Number.isInteger(fact?.absoluteDate)
      || Number.isInteger(fact?.approximateYear)
      || Number.isInteger(fact?.normalizedDateYear)
    ));
}

function lifecycleLowerBound(extractedFacts) {
  const years = (extractedFacts || [])
    .filter((fact) =>
      (fact.exactModelMatch || fact.modelMatchType === 'exact' || fact.modelMatchType === 'canonical-equivalent')
      && ['product_launch', 'production_start', 'product_available'].includes(fact.dateMeaning)
      && (Number.isInteger(fact.approximateYear) || Number.isInteger(fact.normalizedDateYear) || Number.isInteger(fact.absoluteDate)))
    .map((fact) => fact.approximateYear ?? fact.normalizedDateYear ?? fact.absoluteDate);
  if (!years.length) return null;
  return Math.min(...years);
}

/**
 * When strict resolution is unavailable, rank serial candidates using a model
 * lower-bound year (e.g. modern dryer introduced ~2019 eliminates 1992).
 */
export function rankCandidatesByModelLowerBound(candidateYears, lowerBoundYear, options = {}) {
  const candidates = normalizeCandidateYears(candidateYears);
  if (!Number.isInteger(lowerBoundYear) || candidates.length < 2) return null;
  const tolerance = Number.isInteger(options.toleranceYears) ? options.toleranceYears : 1;
  const preferred = candidates.filter((year) => year >= lowerBoundYear - tolerance);
  const eliminated = candidates.filter((year) => year < lowerBoundYear - tolerance);
  if (!preferred.length || !eliminated.length) return null;
  if (preferred.length === 1) {
    return {
      status: 'resolved',
      remainingCandidateYears: preferred,
      chosenYear: preferred[0],
      preferredCandidateYear: null,
      eliminatedYears: eliminated,
    };
  }
  // Prefer the newest preferred candidate only as ranking, never as silent resolve
  // when multiple serial-valid modern cycles remain.
  const preferredCandidateYear = preferred[preferred.length - 1];
  return {
    status: 'ranked',
    remainingCandidateYears: candidates,
    chosenYear: null,
    preferredCandidateYear,
    eliminatedYears: eliminated,
  };
}

export function createDeterministicRefinementResult({
  input,
  workingCandidateYears,
  deterministic,
  localEvidence,
  localModelRange,
  modelNormalization,
  modelIdentity,
  cacheStatus,
  timings,
}) {
  const output = deterministic?.output || {};
  const extractedFacts = deterministic?.extractedFacts || [];
  const identity = modelIdentity || deterministic?.modelIdentity || null;
  const lowerBound = lifecycleLowerBound(extractedFacts)
    ?? (Number.isInteger(output?.estimatedModelEra?.startYear) ? output.estimatedModelEra.startYear : null)
    ?? (Number.isInteger(localModelRange?.start) ? localModelRange.start : null);

  let decision = null;
  if (hasUsableDeterministicWebFacts(deterministic)) {
    if (output.resolutionType === 'resolved-single'
      && Number.isInteger(output.bestEstimateYear)
      && workingCandidateYears.includes(output.bestEstimateYear)) {
      decision = narrowedDecision(input.candidateYears, [output.bestEstimateYear]);
    } else if (output.resolutionType === 'narrowed') {
      const plausible = normalizeCandidateYears(output.plausibleYears || [])
        .filter((year) => workingCandidateYears.includes(year));
      decision = narrowedDecision(input.candidateYears, plausible);
    }
  }

  if (!decision && Number.isInteger(lowerBound)) {
    const ranked = rankCandidatesByModelLowerBound(workingCandidateYears, lowerBound);
    if (ranked?.status === 'resolved') {
      decision = {
        status: 'resolved',
        candidateYears: input.candidateYears,
        remainingCandidateYears: ranked.remainingCandidateYears,
        chosenYear: ranked.chosenYear,
      };
    } else if (ranked?.status === 'ranked') {
      const estimatedEra = output.estimatedModelEra || {};
      const estimatedRange = Number.isInteger(estimatedEra.startYear) || Number.isInteger(estimatedEra.endYear)
        ? {
            start: Number.isInteger(estimatedEra.startYear) ? estimatedEra.startYear : lowerBound,
            end: Number.isInteger(estimatedEra.endYear) ? estimatedEra.endYear : null,
          }
        : (localModelRange || { start: lowerBound, end: null });
      const entered = identity?.enteredModel || input.model;
      const recognized = identity?.canonicalModel || deterministic?.evidenceMatchModel || entered;
      return createRefinementResponse({
        status: 'ranked',
        candidateYears: input.candidateYears,
        remainingCandidateYears: ranked.remainingCandidateYears,
        preferredCandidateYear: ranked.preferredCandidateYear,
        confidence: mapDeterministicConfidence(output.confidence) || 'medium',
        resolutionBasis: 'serial-plus-model',
        modelProductionRange: estimatedRange,
        modelNormalization,
        modelIdentity: identity,
        evidence: [...localEvidence, ...(deterministic?.evidence || [])],
        summary: buildSummary({
          status: 'ranked',
          candidateYears: input.candidateYears,
          remainingCandidateYears: ranked.remainingCandidateYears,
          preferredCandidateYear: ranked.preferredCandidateYear,
        }, modelNormalization, identity),
        rankingExplanation: `Model evidence places this product in a modern production period (about ${lowerBound} or later), which makes older serial cycles before that period implausible.`,
        refinementResultTier: 'ranked',
        estimateBasis: 'model-lifecycle-lower-bound',
        identityMatchType: deterministic?.matchedIdentity?.matchType || identity?.matchedBy || null,
        identityConfidence: identity?.identityConfidence || null,
        evidenceMatchModel: recognized,
        evidenceMatchType: deterministic?.matchedIdentity?.matchType || null,
        searchedModels: identity?.searchModels || deterministic?.searchedModels || null,
        cacheStatus,
        provider: 'deterministic-serper',
        timings,
        errorCode: null,
      });
    }
  }

  if (!decision && Number.isInteger(lowerBound) && workingCandidateYears.length > 1) {
    return createRefinementResponse({
      status: 'ambiguous_with_era',
      candidateYears: input.candidateYears,
      remainingCandidateYears: workingCandidateYears,
      confidence: 'low',
      resolutionBasis: 'serial-plus-model',
      modelProductionRange: localModelRange || { start: lowerBound, end: null },
      modelNormalization,
      modelIdentity: identity,
      evidence: [...localEvidence, ...(deterministic?.evidence || [])],
      summary: buildSummary({
        status: 'ambiguous_with_era',
        remainingCandidateYears: workingCandidateYears,
        modelProductionRange: { start: lowerBound, end: null },
      }, modelNormalization, identity),
      refinementResultTier: 'ambiguous_with_era',
      estimateBasis: 'model-lifecycle-lower-bound',
      searchedModels: identity?.searchModels || null,
      cacheStatus,
      provider: 'deterministic-serper',
      timings,
      errorCode: null,
    });
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
    modelIdentity: identity,
    evidence: [...localEvidence, ...(deterministic?.evidence || [])],
    summary: buildSummary(decision, modelNormalization, identity),
    refinementResultTier: decision.status,
    estimateBasis: 'deterministic-web-evidence',
    identityMatchType: deterministic?.matchedIdentity?.matchType || identity?.matchedBy || null,
    identityConfidence: identity?.identityConfidence || null,
    evidenceMatchModel: identity?.canonicalModel || deterministic?.evidenceMatchModel || null,
    searchedModels: identity?.searchModels || deterministic?.searchedModels || null,
    cacheStatus,
    provider: 'deterministic-serper',
    timings,
    errorCode: null,
  });
}
