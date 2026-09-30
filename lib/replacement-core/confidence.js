import { resolved } from './normalize-values.js';

export function calculateConfidence(original, candidate, hard, similarity) {
  const hardResolved = hard.comparisons.filter((row) => !row.promoted && resolved(row.original) && resolved(row.replacement)).length;
  const hardTotal = hard.comparisons.filter((row) => !row.promoted).length;
  const hardCoverage = hardTotal ? hardResolved / hardTotal : 0;
  const originalAssumptions = Object.values(original.facts).filter((entry) => entry.status === 'ASSUMED').length;
  const originalAmbiguities = Object.values(original.facts).filter((entry) => entry.status === 'AMBIGUOUS').length;
  const strongCoverage = similarity.strong.coverage;
  const highStrongUnverified = similarity.comparisons.some((row) => row.bucket === 'STRONG' && row.weightClass === 'HIGH' && !['MATCH', 'BETTER', 'DIFFERENT'].includes(row.assessment));
  const inferredHard = hard.comparisons.some((row) => row.bucket === 'HARD' && row.original.status === 'INFERRED');
  let confidence = 'LOW';
  if (hardCoverage === 1 && strongCoverage >= 0.7 && !highStrongUnverified && !inferredHard && originalAssumptions === 0 && originalAmbiguities === 0) confidence = 'HIGH';
  else if (hardCoverage >= 0.6 && strongCoverage >= 0.35 && originalAmbiguities === 0) confidence = 'MEDIUM';
  if (candidate.discoveryConfidence === 'LOW') confidence = 'LOW';
  else if (candidate.discoveryConfidence === 'MEDIUM' && confidence === 'HIGH') confidence = 'MEDIUM';
  return { confidence, hardCoverage, strongCoverage, originalAssumptions, originalAmbiguities };
}
