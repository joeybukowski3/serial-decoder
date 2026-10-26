/**
 * Code-owned product category for live research.2. The model names a category and profile, but the profile decides which requirements are
 * ESSENTIAL (a shortfall on one excludes a candidate), so a wrong one is not harmless: a television filed as generic "electronics" was asked
 * for "storage or capacity at least equal to the original". The category is therefore settled in this order:
 *   1. what the user's own words say (a television, a refrigerator, a laptop), when they say one thing clearly
 *   2. what the model's own description of the item says, under the same patterns
 *   3. the model's category, except that "electronics" is kept only for a device that actually has storage; any other "electronics" is the
 *      generic "other" profile (same type, similar size, key features), never the storage-based one
 * Plain keyword patterns on purpose: an ambiguous text (a washer-dryer, a "TV refrigerator") matches two families and settles nothing, so
 * the model's own answer stands. The model's wording of requirements is still used; only the profile that owns the essentials is code-owned.
 */

export const CATEGORY_SOURCE = Object.freeze({ QUERY: 'QUERY', IDENTITY: 'IDENTITY', MODEL: 'MODEL', MODEL_GENERALISED: 'MODEL_GENERALISED' });

const FAMILIES = Object.freeze([
  { category: 'refrigerator', profile: 'refrigerator', pattern: /\b(?:refrigerators?|fridges?|freezers?)\b/i },
  { category: 'appliance', profile: 'washer', pattern: /\b(?:washers?|washing machines?)\b/i },
  { category: 'appliance', profile: 'dryer', pattern: /\b(?:dryers?|tumble dryers?)\b/i },
  { category: 'appliance', profile: 'dishwasher', pattern: /\bdishwashers?\b/i },
  { category: 'appliance', profile: 'microwave', pattern: /\bmicrowaves?\b/i },
  // "range" alone is too common ("mid-range", "long range"): a cooking range is named with its fuel or style.
  { category: 'appliance', profile: 'range', pattern: /\b(?:(?:gas|electric|induction|dual[- ]fuel|slide-in|freestanding|free-standing) (?:range|oven)|wall oven|ranges?(?= (?:with|oven))|cooktops?|stoves?)\b/i },
  // Devices that carry storage, for which "storage or capacity" is a real essential.
  { category: 'electronics', profile: 'electronics', pattern: /\b(?:laptops?|notebooks?|macbooks?|chromebooks?|smartphones?|iphones?|ipads?|tablets?|desktops?|phones?|game consoles?|consoles?|playstation|xbox|nintendo switch|camcorders?|dashcams?|drones?)\b/i },
  { category: 'tv', profile: 'tv', pattern: /\b(?:tvs?|televisions?|oled|qd-?oled|qled|neo qled|qned|mini-?led|bravia|webos|google tv|fire tv|roku tv|smart tv|uhd tv|plasma)\b/i },
]);

/** The one family a text names, or null when it names none or more than one. */
export function detectCategory(text) {
  const hits = FAMILIES.filter((family) => family.pattern.test(String(text || '')));
  return hits.length === 1 ? { category: hits[0].category, profile: hits[0].profile } : null;
}

// A monitor, speaker or printer is "electronics" to a model but has no storage to match.
const GENERIC_PROFILE = Object.freeze({ category: 'other', profile: 'other' });

/**
 * @param {{query: string, category: string, profile: string, identity: string|null, characteristics: string[]}} input  `category` and `profile`
 *   are the model's own (already restricted to the known values)
 * @returns {{category: string, profile: string, source: string}}
 */
export function settleCategory({ query, category, profile, identity, characteristics }) {
  const fromQuery = detectCategory(query);
  if (fromQuery) return { ...fromQuery, source: CATEGORY_SOURCE.QUERY };
  const fromIdentity = detectCategory([identity, ...(Array.isArray(characteristics) ? characteristics : [])].filter(Boolean).join(' '));
  if (fromIdentity) return { ...fromIdentity, source: CATEGORY_SOURCE.IDENTITY };
  if (category === 'electronics') return { ...GENERIC_PROFILE, source: CATEGORY_SOURCE.MODEL_GENERALISED };
  return { category, profile, source: CATEGORY_SOURCE.MODEL };
}
