import { normalizeCandidateYears } from './candidate-intersection.js';
import { normalizeFailureCategory } from '../lookup-failure-taxonomy.js';

const VALID_STATUSES = new Set([
  'resolved',
  'ranked',
  'ambiguous',
  'ambiguous_with_era',
  'conflict',
  'clarification',
  'unavailable',
]);
const VALID_CONFIDENCE = new Set(['high', 'medium', 'low', null]);
const VALID_BASIS = new Set(['serial-plus-model', 'model-only', 'serial-only']);
const VALID_PROVIDERS = new Set([
  'local-db',
  'redis',
  'deterministic-serper',
  'gemini-native-search',
  'gemini-google-search',
  'openai-web-search',
  'smart-lookup-local',
  'smart-lookup-openai',
  'smart-lookup-xai',
  'smart-lookup-gemini',
  'smart-lookup-groq',
  'none',
]);
const CONFIDENT_STATUSES = new Set([
  'resolved',
  'ranked',
  'ambiguous',
  'ambiguous_with_era',
]);

export function createRefinementResponse(input = {}) {
  const candidateYears = normalizeCandidateYears(input.candidateYears || []);
  const candidateSet = new Set(candidateYears);
  const remainingCandidateYears = normalizeCandidateYears(input.remainingCandidateYears || candidateYears)
    .filter((year) => candidateSet.has(year));
  const status = VALID_STATUSES.has(input.status) ? input.status : 'unavailable';
  const chosenYear = status === 'resolved' && remainingCandidateYears.length === 1
    ? remainingCandidateYears[0]
    : null;
  const preferredCandidateYear = status === 'ranked'
    && Number.isInteger(input.preferredCandidateYear)
    && candidateSet.has(input.preferredCandidateYear)
    ? input.preferredCandidateYear
    : null;
  const confidence = VALID_CONFIDENCE.has(input.confidence) ? input.confidence : null;
  const resolutionBasis = VALID_BASIS.has(input.resolutionBasis)
    ? input.resolutionBasis
    : 'serial-plus-model';
  const failureCategory = normalizeFailureCategory(input.failureCategory)
    || normalizeFailureCategory(input.errorCode)
    || null;

  return {
    status,
    candidateYears,
    remainingCandidateYears: status === 'conflict' ? [] : remainingCandidateYears,
    chosenYear,
    preferredCandidateYear,
    confidence: CONFIDENT_STATUSES.has(status) ? confidence : null,
    resolutionBasis,
    modelProductionRange: input.modelProductionRange || null,
    modelNormalization: input.modelNormalization || null,
    modelIdentity: input.modelIdentity || null,
    evidence: Array.isArray(input.evidence) ? input.evidence : [],
    summary: String(input.summary || ''),
    rankingExplanation: input.rankingExplanation ? String(input.rankingExplanation) : null,
    refinementResultTier: input.refinementResultTier || status,
    estimateBasis: input.estimateBasis || null,
    identityMatchType: input.identityMatchType || null,
    identityConfidence: input.identityConfidence || null,
    evidenceMatchModel: input.evidenceMatchModel || null,
    evidenceMatchType: input.evidenceMatchType || null,
    searchedModels: Array.isArray(input.searchedModels) ? input.searchedModels : null,
    failureCategory,
    failureStage: input.failureStage || null,
    failureCode: input.failureCode || input.errorCode || null,
    deterministicFallbackUsed: Boolean(input.deterministicFallbackUsed),
    cacheStatus: ['hit', 'miss', 'bypass'].includes(input.cacheStatus) ? input.cacheStatus : 'bypass',
    provider: VALID_PROVIDERS.has(input.provider) ? input.provider : 'none',
    timings: {
      localMs: Number(input.timings?.localMs || 0),
      cacheMs: Number(input.timings?.cacheMs || 0),
      onlineLookupMs: Number(input.timings?.onlineLookupMs || 0),
      serperMs: Number(input.timings?.serperMs || 0),
      geminiMs: Number(input.timings?.geminiMs || 0),
      totalMs: Number(input.timings?.totalMs || 0),
    },
    cost: input.cost && typeof input.cost === 'object' ? input.cost : null,
    errorCode: input.errorCode || null,
  };
}

export function assertRefinementResponseInvariant(response) {
  if (!VALID_STATUSES.has(response.status)) throw new Error('Invalid refinement status');
  const candidateSet = new Set(normalizeCandidateYears(response.candidateYears || []));
  if (response.remainingCandidateYears.some((year) => !candidateSet.has(year))) {
    throw new Error('remainingCandidateYears must be a subset of candidateYears');
  }
  if (response.status === 'resolved') {
    if (!Number.isInteger(response.chosenYear)) throw new Error('Resolved response requires chosenYear');
    if (!candidateSet.has(response.chosenYear)) {
      throw new Error('chosenYear must be one of candidateYears');
    }
    if (response.remainingCandidateYears.length !== 1 || response.remainingCandidateYears[0] !== response.chosenYear) {
      throw new Error('Resolved response must contain exactly one matching remaining candidate');
    }
  } else if (response.chosenYear !== null) {
    throw new Error('chosenYear must be null unless status is resolved');
  }
  if (response.status === 'ranked') {
    if (!Number.isInteger(response.preferredCandidateYear)) {
      throw new Error('Ranked response requires preferredCandidateYear');
    }
    if (!candidateSet.has(response.preferredCandidateYear)) {
      throw new Error('preferredCandidateYear must be one of candidateYears');
    }
    if (response.remainingCandidateYears.length < 2) {
      throw new Error('Ranked response must retain multiple remaining candidates');
    }
    if (!response.remainingCandidateYears.includes(response.preferredCandidateYear)) {
      throw new Error('preferredCandidateYear must remain among remaining candidates');
    }
  } else if (response.preferredCandidateYear != null) {
    throw new Error('preferredCandidateYear must be null unless status is ranked');
  }
  if (response.status === 'conflict' && response.remainingCandidateYears.length !== 0) {
    throw new Error('Conflict response must have no remaining candidates');
  }
  return response;
}
