import { CONTRACT_VERSION, SCORING_VERSION } from '../replacement-core/enums.js';
import { evaluateReplacement } from '../replacement-core/evaluate.js';
import { televisionProfile } from '../replacement-core/profiles/television.js';
import { refrigeratorProfile } from '../replacement-core/profiles/refrigerator.js';
import { buildRefinementSuggestions } from '../replacement-core/refinement.js';
import { interpretReplacementSearch } from './interpret.js';
import { discoverCandidatePool, DEFAULT_DISCOVERY_LIMIT } from './candidate-provider.js';
import { rankEvaluations, selectRecommendations } from './candidate-ranker.js';

const PROFILES = { television: televisionProfile, refrigerator: refrigeratorProfile };

/** Isolated Phase 2 entry point. A caller supplies discovery; no provider is invoked by default. */
export async function recommendReplacement({ query, notes = '', candidateProvider, discoveryLimit = DEFAULT_DISCOVERY_LIMIT, requirements = [] }) {
  const originalInterpretation = interpretReplacementSearch({ query, notes });
  const original = originalInterpretation.normalizedOriginal;
  const profile = PROFILES[original.category];
  const pool = await discoverCandidatePool({ candidateProvider, original, hints: originalInterpretation.candidateDiscoveryHints, limit: discoveryLimit });
  const evaluations = pool.candidates.map((candidate) => evaluateReplacement({ original, candidate, profile, requirements }));
  const ranked = rankEvaluations(evaluations);
  const selected = selectRecommendations(ranked);
  const allHardFailed = ranked.length > 0 && ranked.every((item) => item.decision.hardFailures.length > 0);
  const reasonCodes = allHardFailed ? ['NO_LKQ_CANDIDATE_FOUND'] : ranked.length ? [] : ['NO_CANDIDATES_DISCOVERED'];
  const refinementSuggestions = selected.primaryRecommendation?.refinementSuggestions || buildRefinementSuggestions(original, profile);
  if (allHardFailed && refinementSuggestions.length === 0) {
    for (const [index, failure] of selected.primaryRecommendation.decision.hardFailures.slice(0, 3).entries()) {
      const label = profile.rules.find((rule) => rule.key === failure.key)?.label || failure.key;
      refinementSuggestions.push({
        contractVersion: CONTRACT_VERSION,
        suggestionId: `${profile.profileId}:find-${failure.key}`,
        fieldKey: failure.key,
        prompt: `Find a candidate that meets the original ${label.toLowerCase()} requirement.`,
        priority: index + 1,
        reasonCode: 'FIND_HARD_COMPLIANT_CANDIDATE',
      });
    }
  }
  return {
    contractVersion: CONTRACT_VERSION,
    input: { query, notes },
    originalInterpretation,
    primaryRecommendation: selected.primaryRecommendation,
    alternatives: selected.alternatives,
    bestAvailableRecommendation: allHardFailed,
    rejectedSummary: [...pool.rejected, ...selected.rejectedSummary],
    internalPoolCount: pool.receivedCount,
    searchStrategy: originalInterpretation.searchStrategy,
    refinementSuggestions,
    versions: { contractVersion: CONTRACT_VERSION, profileVersion: profile.profileVersion, scoringVersion: SCORING_VERSION, discoveryVersion: '1.0.0' },
    reasonCodes,
  };
}
