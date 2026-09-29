/**
 * Decides whether paid provider research (native Gemini, grounded Gemini, the
 * Smart Lookup model-evidence fallback) can add anything for this request.
 *
 * Provider research only ever CONSTRAINS the serial-valid candidate years with
 * a model production window; it never decides a unit's year. So it adds value
 * only while more than one candidate remains AND the local evidence is not
 * already a confident, closed window that research could not tighten.
 *
 * Skipped requests are still answered (the caller returns the best available
 * deterministic/local result); they simply do not spend paid tokens.
 *
 *   single_candidate       one serial-valid year is all that is left.
 *   local_high_confidence  official-quality local evidence with BOTH a start and
 *                          an end year already brackets the candidates; no
 *                          further research can narrow a closed window.
 *
 * An open-ended range (no end year) is deliberately NOT skipped: research can
 * still discover a production end that removes later candidate years.
 */
export const REFINEMENT_GATE_REASONS = Object.freeze({
  SINGLE_CANDIDATE: 'single_candidate',
  LOCAL_HIGH_CONFIDENCE: 'local_high_confidence',
});

function isClosedRange(range) {
  return Number.isInteger(range?.start) && Number.isInteger(range?.end);
}

export function evaluateRefinementGate({ workingCandidateYears, localPolicy, localDecision } = {}) {
  const candidates = Array.isArray(workingCandidateYears) ? workingCandidateYears : [];
  if (candidates.length <= 1) {
    return { skip: true, reason: REFINEMENT_GATE_REASONS.SINGLE_CANDIDATE };
  }
  if (
    localPolicy?.sufficient === true
    && localPolicy.confidence === 'high'
    && localDecision?.status === 'ambiguous'
    && isClosedRange(localPolicy.range)
  ) {
    return { skip: true, reason: REFINEMENT_GATE_REASONS.LOCAL_HIGH_CONFIDENCE };
  }
  return { skip: false, reason: null };
}
