import { normalizeTier, numeric, resolved } from './normalize-values.js';
import { TIERS } from './enums.js';

function materialUpgrades(hardComparisons, strongComparisons) {
  const upgrades = [];
  for (const row of hardComparisons) {
    if (row.assessment !== 'BETTER' || !resolved(row.original) || !resolved(row.replacement)) continue;
    if (row.key === 'screenSizeIn' && numeric(row.replacement.value) >= numeric(row.original.value) * 1.15) upgrades.push('MATERIAL_SCREEN_SIZE_UPGRADE');
    if (row.key === 'totalCapacityCuFt' && numeric(row.replacement.value) >= numeric(row.original.value) * 1.15) upgrades.push('MATERIAL_CAPACITY_UPGRADE');
    if (row.key === 'tier' && TIERS.indexOf(normalizeTier(row.replacement.value)) - TIERS.indexOf(normalizeTier(row.original.value)) >= 2) upgrades.push('MATERIAL_TIER_UPGRADE');
  }
  const highBetter = strongComparisons.filter((row) => row.weightClass === 'HIGH' && row.assessment === 'BETTER').length;
  if (highBetter >= 2) upgrades.push('MULTIPLE_HIGH_CAPABILITY_UPGRADES');
  return upgrades;
}

export function classifyDecision(hard, similarity) {
  const strongRows = similarity.comparisons.filter((row) => row.bucket === 'STRONG');
  const highLosses = strongRows.filter((row) => row.weightClass === 'HIGH' && row.assessment === 'DIFFERENT');
  const normalLosses = strongRows.filter((row) => row.weightClass === 'NORMAL' && row.assessment === 'DIFFERENT');
  const upgrades = materialUpgrades(hard.comparisons, strongRows);
  const reasonCodes = [];
  if (hard.hardFailures.length) return { classification: 'NOT_LKQ', upgrades, reasonCodes: ['KNOWN_HARD_FAILURE'] };
  if (hard.eligible === null) return { classification: 'UNCONFIRMED', upgrades, reasonCodes: ['HARD_COMPARISON_UNVERIFIED'] };
  if (similarity.strong.coverage < 0.5) return { classification: 'UNCONFIRMED', upgrades, reasonCodes: ['STRONG_EVIDENCE_SPARSE'] };
  if (similarity.strong.similarity < 0.5 || highLosses.length >= 3) return { classification: 'NOT_LKQ', upgrades, reasonCodes: ['SEVERE_STRONG_LOSSES'] };
  if (highLosses.length || normalLosses.length >= 2 || similarity.strong.similarity < 0.8) return { classification: 'CLOSE_MATCH', upgrades, reasonCodes: ['MEANINGFUL_STRONG_DIFFERENCE'] };
  if (upgrades.length) return { classification: 'ABOVE_LKQ', upgrades, reasonCodes: ['MATERIAL_UPGRADE_WITHOUT_OFFSET'] };
  return { classification: 'LKQ', upgrades, reasonCodes: ['HARD_PASS_STRONG_MATCH'] };
}
