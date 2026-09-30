import { CONTRACT_VERSION, SCORING_VERSION } from './enums.js';
import { validateRule } from './contracts.js';

export const COMPARATORS = Object.freeze([
  'numeric-minimum', 'resolution-minimum', 'tier-minimum', 'boolean-match',
  'categorical-match', 'configuration-floor', 'categorical', 'numeric-similarity', 'boolean-similarity',
]);

export function validateProfile(profile) {
  const errors = [];
  if (!profile || typeof profile !== 'object') return ['profile must be an object'];
  if (profile.contractVersion !== CONTRACT_VERSION || profile.scoringVersion !== SCORING_VERSION || !profile.profileVersion) errors.push('invalid profile version');
  if (typeof profile.category !== 'string' || !profile.category.trim()) errors.push('category required');
  if (!Array.isArray(profile.rules) || profile.rules.length === 0) return [...errors, 'rules required'];
  const seen = new Set();
  for (const rule of profile.rules) {
    errors.push(...validateRule(rule).map((error) => `${rule?.key || 'unknown'}: ${error}`));
    if (!COMPARATORS.includes(rule.comparator)) errors.push(`${rule.key}: unregistered comparator`);
    if (seen.has(rule.key)) errors.push(`${rule.key}: duplicate rule`);
    seen.add(rule.key);
  }
  if (!Array.isArray(profile.refinementOrder) || profile.refinementOrder.some((key) => typeof key !== 'string')) errors.push('invalid refinementOrder');
  return errors;
}
