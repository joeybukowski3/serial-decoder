import { CONTRACT_VERSION, SCORING_VERSION } from './enums.js';
import { assertValid, validateCandidate, validateIdentity, validateRecommendationResult } from './contracts.js';
import { validateProfile } from './profile-validator.js';
import { withTierBaseline } from './normalize-values.js';
import { evaluateHardRules } from './eligibility.js';
import { evaluateSimilarity } from './scoring.js';
import { classifyDecision } from './classification.js';
import { calculateConfidence } from './confidence.js';
import { buildComparisonRows } from './comparison.js';
import { buildRefinementSuggestions } from './refinement.js';

function factSummaries(original, profile) {
  const knownFacts = [];
  const inferredFacts = [];
  const assumptions = [];
  const unknownImportantFacts = [];
  const important = new Set(profile.rules.filter((rule) => rule.bucket === 'HARD' || (rule.bucket === 'STRONG' && rule.weightClass === 'HIGH')).map((rule) => rule.key));
  for (const [key, entry] of Object.entries(original.facts)) {
    const summary = { key, value: entry.value, status: entry.status, basis: entry.basis || null, evidenceRefs: entry.evidenceRefs };
    if (entry.status === 'KNOWN') knownFacts.push(summary);
    if (entry.status === 'INFERRED') inferredFacts.push(summary);
    if (entry.status === 'ASSUMED') assumptions.push(summary);
    if (important.has(key) && ['UNKNOWN', 'AMBIGUOUS', 'ASSUMED'].includes(entry.status)) unknownImportantFacts.push(summary);
  }
  for (const key of important) {
    if (!(key in original.facts)) unknownImportantFacts.push({ key, value: null, status: 'UNKNOWN', basis: null, evidenceRefs: [] });
  }
  return { knownFacts, inferredFacts, assumptions, unknownImportantFacts };
}

/** Evaluate one supplied candidate. Discovery and pricing are intentionally outside this pure function. */
export function evaluateReplacement({ original, candidate, profile, requirements = [] }) {
  assertValid(validateIdentity(original), 'original');
  assertValid(validateCandidate(candidate), 'candidate');
  assertValid(validateProfile(profile), 'profile');
  if (profile.category !== original.category) throw new TypeError('profile category must match original');
  const normalizedOriginal = withTierBaseline(original);
  const normalizedCandidate = { ...candidate, identity: withTierBaseline(candidate.identity) };
  const hard = evaluateHardRules(normalizedOriginal, normalizedCandidate.identity, profile, requirements);
  const similarity = evaluateSimilarity(normalizedOriginal, normalizedCandidate.identity, profile);
  const classificationResult = classifyDecision(hard, similarity);
  const confidenceResult = calculateConfidence(normalizedOriginal, normalizedCandidate, hard, similarity);
  const comparisons = [...hard.comparisons, ...similarity.comparisons];
  const decision = {
    contractVersion: CONTRACT_VERSION,
    profileId: profile.profileId,
    profileVersion: profile.profileVersion,
    scoringVersion: SCORING_VERSION,
    originalId: original.id,
    candidateId: candidate.candidateId,
    eligible: hard.eligible,
    hardFailures: hard.hardFailures,
    warnings: hard.warnings,
    comparisons,
    score: { weightedTotal: hard.eligible === false ? null : similarity.weightedTotal, strong: similarity.strong, secondary: similarity.secondary },
    materialUpgrades: classificationResult.upgrades,
    classification: classificationResult.classification,
    confidence: confidenceResult.confidence,
    confidenceFactors: confidenceResult,
    reasonCodes: [...classificationResult.reasonCodes, ...hard.warnings.map((warning) => warning.reasonCode)],
  };
  const summaries = factSummaries(normalizedOriginal, profile);
  const result = {
    contractVersion: CONTRACT_VERSION,
    resultId: `${profile.profileId}:${original.id}:${candidate.candidateId}:${profile.profileVersion}`,
    input: original.rawQuery || '',
    normalizedOriginal,
    ...summaries,
    candidate: normalizedCandidate,
    classification: decision.classification,
    confidence: decision.confidence,
    hardRuleSummary: { eligible: hard.eligible, failures: hard.hardFailures, unverified: hard.warnings },
    strongSimilaritySummary: similarity.strong,
    secondarySimilaritySummary: similarity.secondary,
    comparisonRows: buildComparisonRows(hard.comparisons, similarity.comparisons),
    refinementSuggestions: buildRefinementSuggestions(normalizedOriginal, profile),
    decisionReasons: decision.reasonCodes,
    profileVersion: profile.profileVersion,
    scoringVersion: SCORING_VERSION,
    decision,
  };
  assertValid(validateRecommendationResult(result), 'recommendation result');
  return result;
}
