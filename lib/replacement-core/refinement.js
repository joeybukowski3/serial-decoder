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
