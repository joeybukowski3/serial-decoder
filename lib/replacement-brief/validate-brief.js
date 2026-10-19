import { BRIEF_STATUS, BRIEF_VERSION, FACT_STATUS, MATCH_LEVELS, SOURCE_STRENGTH, SUPPORTED_CATEGORIES, VERIFICATION_LEVEL } from './brief-text.js';

/**
 * Structural safety check for a research brief, for tests now and for a route's outgoing/cached response later. It fails on
 * anything that would let a provisional result read as verified: a VERIFIED status, a retail/price field, a suggestion that
 * is not PROVISIONAL with UNVERIFIED availability, a source claiming its page was checked, or more than three suggestions. It
 * also checks that claims stay consistent with their evidence: a failed requirement means a closest option at LOW confidence,
 * anything but strong sources means LOW confidence, and COMPLETE is only possible when every suggestion is strongly sourced.
 */

export const MAX_BRIEF_SUGGESTIONS = 3;
const TOP_LEVEL = Object.freeze(['briefVersion', 'status', 'verificationLevel', 'category', 'supportedCategories', 'original', 'whatMatters',
  'suggestions', 'ruledOut', 'checklist', 'sources', 'warnings', 'research']);
const FORBIDDEN_KEY = /price|retail|msrp|providerRank|^rank$|^score$|observedAt/i;
const LISTS = Object.freeze(['whatMatters', 'suggestions', 'ruledOut', 'checklist', 'sources', 'warnings']);

function forbiddenKeys(value, path = '$') {
  if (Array.isArray(value)) return value.flatMap((item, index) => forbiddenKeys(item, `${path}[${index}]`));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => (FORBIDDEN_KEY.test(key) ? [`${path}.${key}`] : forbiddenKeys(child, `${path}.${key}`)));
}

const isCompleteSuggestion = (suggestion) => suggestion.sourceStrength === SOURCE_STRENGTH.STRONG && suggestion.grounding === 'GROUNDED'
  && suggestion.failedRequirements?.length === 0 && suggestion.matchLevel !== 'UNCONFIRMED' && suggestion.matchLevel !== 'CLOSEST_OPTION';

function suggestionErrors(suggestion, index) {
  const errors = [];
  if (suggestion.verification !== VERIFICATION_LEVEL) errors.push(`SUGGESTION_NOT_PROVISIONAL:${index}`);
  if (suggestion.availability?.status !== 'UNVERIFIED') errors.push(`AVAILABILITY_NOT_UNVERIFIED:${index}`);
  if (index === 0 ? suggestion.tier !== 'PRIMARY' : suggestion.tier !== 'ALTERNATIVE') errors.push(`BAD_TIER:${index}`);
  if ('classification' in suggestion) errors.push(`EVALUATOR_CLASSIFICATION_EXPOSED:${index}`);
  if (!MATCH_LEVELS.includes(suggestion.matchLevel)) errors.push(`BAD_MATCH_LEVEL:${index}`);
  if (!Object.values(SOURCE_STRENGTH).includes(suggestion.sourceStrength)) errors.push(`BAD_SOURCE_STRENGTH:${index}`);
  if (suggestion.failedRequirements?.length && (suggestion.matchLevel !== 'CLOSEST_OPTION' || suggestion.confidence !== 'LOW' || !suggestion.isBestAvailableOnly)) errors.push(`FAILED_REQUIREMENT_NOT_CLOSEST_OPTION:${index}`);
  if (suggestion.sourceStrength !== SOURCE_STRENGTH.STRONG && suggestion.confidence !== 'LOW') errors.push(`CONFIDENCE_EXCEEDS_SOURCES:${index}`);
  if (suggestion.confidence === 'HIGH') errors.push(`CONFIDENCE_TOO_HIGH:${index}`);
  for (const spec of suggestion.specs || []) {
    if (!FACT_STATUS.includes(spec.originalStatus) || !FACT_STATUS.includes(spec.replacementStatus)) errors.push(`BAD_SPEC_STATUS:${index}:${spec.key}`);
  }
  return errors;
}

/** @returns {{ valid: boolean, errors: string[] }} */
export function validateResearchBrief(brief) {
  const errors = [];
  if (!brief || typeof brief !== 'object' || Array.isArray(brief)) return { valid: false, errors: ['NOT_AN_OBJECT'] };
  const keys = Object.keys(brief);
  if (keys.length !== TOP_LEVEL.length || !TOP_LEVEL.every((key) => keys.includes(key))) errors.push('UNEXPECTED_TOP_LEVEL_KEYS');
  if (brief.briefVersion !== BRIEF_VERSION) errors.push('BAD_VERSION');
  if (!Object.values(BRIEF_STATUS).includes(brief.status)) errors.push('BAD_STATUS');
  if (brief.verificationLevel !== VERIFICATION_LEVEL) errors.push('NOT_PROVISIONAL');
  if (brief.category !== null && !SUPPORTED_CATEGORIES.includes(brief.category)) errors.push('BAD_CATEGORY');
  for (const key of LISTS) if (!Array.isArray(brief[key])) errors.push(`NOT_A_LIST:${key}`);
  if (errors.length) return { valid: false, errors };

  if (!Array.isArray(brief.original?.facts)) errors.push('NOT_A_LIST:original.facts');
  for (const fact of brief.original?.facts || []) if (!FACT_STATUS.includes(fact.status)) errors.push(`BAD_FACT_STATUS:${fact.key}:${fact.status}`);
  if (brief.suggestions.length > MAX_BRIEF_SUGGESTIONS) errors.push('TOO_MANY_SUGGESTIONS');
  for (const [index, suggestion] of brief.suggestions.entries()) errors.push(...suggestionErrors(suggestion, index));
  if (brief.status === BRIEF_STATUS.COMPLETE && !brief.suggestions.every(isCompleteSuggestion)) errors.push('COMPLETE_WITHOUT_STRONG_SUGGESTIONS');
  for (const source of brief.sources) {
    if (typeof source.url !== 'string' || !source.url.startsWith('https://')) errors.push('SOURCE_NOT_HTTPS');
    if (source.pageChecked !== false) errors.push('SOURCE_CLAIMS_PAGE_CHECKED');
  }
  errors.push(...forbiddenKeys(brief).map((path) => `FORBIDDEN_FIELD:${path}`));
  return { valid: errors.length === 0, errors };
}
