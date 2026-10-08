export const REFRIGERATOR_CONFIGURATION_POLICY_VERSION = '1.1.0';

const aliases = Object.freeze({
  'top-freezer': 'TOP_FREEZER', 'bottom-freezer': 'BOTTOM_FREEZER', 'side-by-side': 'SIDE_BY_SIDE',
  'french-door': 'FRENCH_DOOR', 'three-door-french': 'FRENCH_DOOR', 'four-door-french': 'FOUR_DOOR',
  'four-door': 'FOUR_DOOR', column: 'COLUMN', 'built-in': 'BUILT_IN', other: 'OTHER', unknown: 'UNKNOWN',
});

export function normalizeRefrigeratorConfiguration(value) {
  const token = String(value || '').trim().replace(/[\s-]+/g, '_').toUpperCase();
  if (['TOP_FREEZER', 'BOTTOM_FREEZER', 'SIDE_BY_SIDE', 'FRENCH_DOOR', 'FOUR_DOOR', 'COLUMN', 'BUILT_IN', 'OTHER'].includes(token)) return token;
  return aliases[String(value || '').toLowerCase()] || 'UNKNOWN';
}

/** Layout is deliberately more specific than the HARD configuration floor. */
export function normalizeRefrigeratorLayout(value) {
  const token = String(value || '').trim().replace(/[\s-]+/g, '_').toUpperCase();
  if (['FRENCH_DOOR_3_DOOR', 'FRENCH_DOOR_4_DOOR'].includes(token)) return token;
  if (token === 'FOUR_DOOR') return 'FRENCH_DOOR_4_DOOR';
  return normalizeRefrigeratorConfiguration(value);
}

// Rows are original configurations; values are candidate layouts that preserve the broad function.
export const REFRIGERATOR_COMPATIBILITY = Object.freeze({
  TOP_FREEZER: Object.freeze(['TOP_FREEZER', 'BOTTOM_FREEZER', 'SIDE_BY_SIDE', 'FRENCH_DOOR', 'FOUR_DOOR']),
  BOTTOM_FREEZER: Object.freeze(['BOTTOM_FREEZER', 'FRENCH_DOOR', 'FOUR_DOOR']),
  SIDE_BY_SIDE: Object.freeze(['SIDE_BY_SIDE', 'FRENCH_DOOR', 'FOUR_DOOR']),
  FRENCH_DOOR: Object.freeze(['FRENCH_DOOR', 'FOUR_DOOR']),
  FOUR_DOOR: Object.freeze(['FOUR_DOOR']),
  COLUMN: Object.freeze(['COLUMN']),
  BUILT_IN: Object.freeze(['BUILT_IN', 'FRENCH_DOOR', 'FOUR_DOOR', 'SIDE_BY_SIDE', 'COLUMN']),
  OTHER: Object.freeze(['OTHER']),
});

export function compareRefrigeratorConfiguration(original, candidate) {
  const from = normalizeRefrigeratorConfiguration(original);
  const to = normalizeRefrigeratorConfiguration(candidate);
  if (from === 'UNKNOWN' || to === 'UNKNOWN') return { assessment: 'UNVERIFIED', reasonCode: 'UNKNOWN_CONFIGURATION' };
  return REFRIGERATOR_COMPATIBILITY[from]?.includes(to)
    ? { assessment: from === to ? 'MATCH' : 'BETTER', reasonCode: 'CONFIGURATION_FLOOR_PASSED' }
    : { assessment: 'FAIL', reasonCode: 'CONFIGURATION_FLOOR_FAILED' };
}
