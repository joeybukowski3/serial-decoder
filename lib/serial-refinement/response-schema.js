import { normalizeCandidateYears } from './candidate-intersection.js';

const VALID_STATUSES = new Set(['resolved', 'ambiguous', 'conflict', 'unavailable']);
const VALID_CONFIDENCE = new Set(['high', 'medium', 'low', null]);
const VALID_BASIS = new Set(['serial-plus-model', 'model-only', 'serial-only']);
const VALID_PROVIDERS = new Set([
  'local-db',
  'redis',
  'deterministic-serper',
  'gemini-google-search',
  'openai-web-search',
  'smart-lookup-local',
  'smart-lookup-openai',
  'smart-lookup-xai',
  'smart-lookup-gemini',
  'smart-lookup-groq',
  'none',
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
  const confidence = VALID_CONFIDENCE.has(input.confidence) ? input.confidence : null;
  const resolutionBasis = VALID_BASIS.has(input.resolutionBasis)
    ? input.resolutionBasis
    : 'serial-plus-model';

  return {
    status,
    candidateYears,
    remainingCandidateYears: status === 'conflict' ? [] : remainingCandidateYears,
    chosenYear,
    confidence: status === 'resolved' || status === 'ambiguous' ? confidence : null,
    resolutionBasis,
    modelProductionRange: input.modelProductionRange || null,
    modelNormalization: input.modelNormalization || null,
    evidence: Array.isArray(input.evidence) ? input.evidence : [],
    summary: String(input.summary || ''),
    cacheStatus: ['hit', 'miss', 'bypass'].includes(input.cacheStatus) ? input.cacheStatus : 'bypass',
    provider: VALID_PROVIDERS.has(input.provider) ? input.provider : 'none',
    timings: {
      localMs: Number(input.timings?.localMs || 0),
      cacheMs: Number(input.timings?.cacheMs || 0),
      onlineLookupMs: Number(input.timings?.onlineLookupMs || 0),
      totalMs: Number(input.timings?.totalMs || 0),
    },
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
  if (response.status === 'conflict' && response.remainingCandidateYears.length !== 0) {
    throw new Error('Conflict response must have no remaining candidates');
  }
  return response;
}
