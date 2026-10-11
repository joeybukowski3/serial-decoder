import { resolved } from './normalize-values.js';

export function calculateConfidence(original, candidate, hard, similarity) {
  // An advisory fit row is not a missing requirement; it lowers confidence through the cap below instead.
  const counted = hard.comparisons.filter((row) => !row.promoted && !row.advisory);
  // A fit row is resolved by its own verdict (supplied constraints), not by the physicalFit fact itself.
  const isResolved = (row) => (row.fitStatus ? ['VERIFIED', 'VIOLATION'].includes(row.fitStatus) : resolved(row.original) && resolved(row.replacement));
  const hardResolved = counted.filter(isResolved).length;
  const hardTotal = counted.length;
  const hardCoverage = hardTotal ? hardResolved / hardTotal : 0;
  const originalAssumptions = Object.values(original.facts).filter((entry) => entry.status === 'ASSUMED').length;
  const originalAmbiguities = Object.values(original.facts).filter((entry) => entry.status === 'AMBIGUOUS').length;
  const strongCoverage = similarity.strong.coverage;
  const highStrongUnverified = similarity.comparisons.some((row) => row.bucket === 'STRONG' && row.weightClass === 'HIGH' && !['MATCH', 'BETTER', 'DIFFERENT'].includes(row.assessment));
  const inferredHard = hard.comparisons.some((row) => row.bucket === 'HARD' && !row.advisory && row.original.status === 'INFERRED');
  let confidence = 'LOW';
  if (hardCoverage === 1 && strongCoverage >= 0.7 && !highStrongUnverified && !inferredHard && originalAssumptions === 0 && originalAmbiguities === 0) confidence = 'HIGH';
  else if (hardCoverage >= 0.6 && strongCoverage >= 0.35 && originalAmbiguities === 0) confidence = 'MEDIUM';
  // A meaningful unverified fit question keeps an otherwise strong result at MEDIUM.
  if (confidence === 'HIGH' && hard.fit?.advisory?.severity === 'MEANINGFUL') confidence = 'MEDIUM';
  if (candidate.discoveryConfidence === 'LOW') confidence = 'LOW';
  else if (candidate.discoveryConfidence === 'MEDIUM' && confidence === 'HIGH') confidence = 'MEDIUM';
  return { confidence, hardCoverage, strongCoverage, originalAssumptions, originalAmbiguities, fitAdvisory: hard.fit?.advisory?.severity ?? null };
}
