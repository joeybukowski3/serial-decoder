import { CONTRACT_VERSION } from './enums.js';
import { getFact } from './normalize-values.js';

export function buildRefinementSuggestions(original, profile, limit = 5) {
  const byKey = new Map(profile.rules.map((rule) => [rule.key, rule]));
  return profile.refinementOrder.flatMap((key, index) => {
    if (key === 'modelYear' && ['KNOWN', 'INFERRED'].includes(getFact(original, 'model').status)) return [];
    const entry = getFact(original, key);
    if (!['UNKNOWN', 'AMBIGUOUS', 'ASSUMED'].includes(entry.status)) return [];
    const rule = byKey.get(key);
    return [{
      contractVersion: CONTRACT_VERSION,
      suggestionId: `${profile.profileId}:${key}`,
      fieldKey: key,
      prompt: key === 'model' ? 'Provide the exact model number from the product label.' : (rule?.refinement || `Provide the original ${rule?.label || key}.`),
      priority: index + 1,
      reasonCode: entry.status === 'ASSUMED' ? 'VERIFY_ASSUMPTION' : entry.status === 'AMBIGUOUS' ? 'RESOLVE_AMBIGUITY' : 'FILL_UNKNOWN',
    }];
  }).slice(0, limit);
}

/** An intrinsic fit question that cannot be verified (e.g. a built-in opening) outranks every other suggestion. */
export function prioritizeFitSuggestion(suggestions, fit, profile) {
  if (!fit?.intrinsic || fit.status !== 'CONSTRAINT_UNVERIFIED') return suggestions;
  const rule = profile.rules.find((item) => item.key === 'physicalFit');
  const first = {
    contractVersion: CONTRACT_VERSION,
    suggestionId: `${profile.profileId}:physicalFit`,
    fieldKey: 'physicalFit',
    prompt: rule?.refinement || 'Provide the installation opening to verify fit.',
    priority: 1,
    reasonCode: 'VERIFY_FIT',
  };
  const others = suggestions.filter((item) => item.fieldKey !== 'physicalFit');
  return [first, ...others.map((item, index) => ({ ...item, priority: index + 2 }))];
}
