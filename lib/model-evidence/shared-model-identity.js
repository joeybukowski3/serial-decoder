/**
 * Shared model-identity representation used by Smart Lookup and Serial Refinement.
 *
 * Preserves the entered model, exposes safe transcription alternatives for
 * search (O/0, I/1, L/1), and never silently overwrites user input.
 */
import {
  compactModelValue,
  normalizeModelInput,
  prioritizeSearchAlternatives,
} from '../serial-refinement/normalize-model.js';

const MAX_SEARCH_MODELS = 2;

// Brand-agnostic product-category hints from compact model prefixes.
// Used only to improve search query terms, never as manufacture-year evidence.
const CATEGORY_PREFIX_HINTS = [
  { pattern: /^W[EG]D/, category: 'dryer' },
  { pattern: /^YW[EG]D/, category: 'dryer' },
  { pattern: /^WTW|^WFW|^MHW|^MH[WT]/, category: 'washer' },
  { pattern: /^WDT|^WDF|^KDT/, category: 'dishwasher' },
  { pattern: /^WRF|^WRS|^WRB|^GNE|^GFE|^RF\d/, category: 'refrigerator' },
  { pattern: /^WFE|^WEG|^LRE|^JB\d/, category: 'range' },
  { pattern: /^WMH|^RVM|^JVM/, category: 'microwave' },
];

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function inferCategoryFromModel(compactModel, providedCategory) {
  const provided = String(providedCategory || '').trim().toLowerCase();
  if (provided && provided !== 'unknown' && provided !== 'appliances' && provided !== 'appliance') {
    return provided;
  }
  for (const hint of CATEGORY_PREFIX_HINTS) {
    if (hint.pattern.test(compactModel)) return hint.category;
  }
  if (provided === 'appliances' || provided === 'appliance') return 'appliance';
  return provided || null;
}

function equivalenceReasonFromChange(change, preferredAsCanonical = false) {
  const text = String(change || '');
  if (/O→0|0→O/.test(text)) {
    return preferredAsCanonical || text.includes('terminal')
      ? 'terminal-o-zero-transcription'
      : 'o-zero-transcription';
  }
  if (/I→1|1→I|L→1|1→L/.test(text)) return 'i-one-transcription';
  return text ? `transcription:${text}` : null;
}

/**
 * Build a shared model-identity object for evidence retrieval and UI disclosure.
 *
 * @param {{ model?: string, brand?: string, category?: string, knownModels?: string[] }} input
 */
export function buildSharedModelIdentity(input = {}) {
  const enteredModel = String(input.model || '').trim();
  const normalized = normalizeModelInput(enteredModel);
  const compactEntered = normalized.compact;
  const prioritized = prioritizeSearchAlternatives(normalized, {
    knownModels: input.knownModels || [],
    maxAlternatives: MAX_SEARCH_MODELS - 1,
  });

  // Prefer terminal O→0 as the displayed canonical form when present among
  // prioritized alternatives; otherwise keep entered form as canonical.
  const preferredCanonical = prioritized.find((item) => item.preferredAsCanonical)
    || prioritized.find((item) => /O→0/.test(item.change || ''))
    || null;
  const primaryAlternative = preferredCanonical || prioritized[0] || null;
  const searchModels = unique([
    normalized.canonical || enteredModel,
    // Always include the preferred O→0 form when it exists, even if another
    // lower-priority alternative was also generated.
    preferredCanonical?.value,
    ...prioritized.map((item) => item.value),
  ]).slice(0, MAX_SEARCH_MODELS);

  const canonicalModel = preferredCanonical
    ? preferredCanonical.value
    : (normalized.canonical || enteredModel);

  const normalizationApplied = Boolean(
    preferredCanonical
    && compactModelValue(preferredCanonical.value) !== compactEntered,
  );

  const searchCategory = inferCategoryFromModel(
    compactEntered,
    input.category,
  );

  return {
    enteredModel,
    normalizedEnteredModel: normalized.canonical || enteredModel,
    compactEnteredModel: compactEntered,
    canonicalModel,
    searchModels,
    aliases: [],
    possibleTranscriptionAlternatives: prioritized,
    equivalenceReason: preferredCanonical || primaryAlternative
      ? equivalenceReasonFromChange(
        (preferredCanonical || primaryAlternative).change,
        Boolean((preferredCanonical || primaryAlternative).preferredAsCanonical),
      )
      : null,
    normalizationApplied,
    identityConfidence: preferredCanonical ? 'high' : (primaryAlternative ? 'medium' : 'medium'),
    matchedBy: preferredCanonical
      ? 'canonical-equivalent'
      : (compactEntered ? 'entered-model' : null),
    brand: String(input.brand || '').trim() || null,
    category: String(input.category || '').trim() || null,
    searchCategory,
    transformations: normalized.transformations || [],
  };
}

/**
 * True when two compact model tokens differ only by a single safe O/0 or I/1/L
 * transcription substitution (and otherwise match exactly).
 */
export function isCanonicalTranscriptionEquivalent(left, right) {
  const a = compactModelValue(left);
  const b = compactModelValue(right);
  if (!a || !b || a === b || a.length !== b.length) return false;

  let diffIndex = -1;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === b[i]) continue;
    if (diffIndex !== -1) return false;
    diffIndex = i;
  }
  if (diffIndex === -1) return false;

  const pair = `${a[diffIndex]}${b[diffIndex]}`;
  return pair === 'O0' || pair === '0O' || pair === 'I1' || pair === '1I'
    || pair === 'L1' || pair === '1L';
}

export function matchTypesForScoring() {
  return new Set(['exact', 'canonical-equivalent']);
}

export function isScoringMatchType(matchType) {
  return matchType === 'exact' || matchType === 'canonical-equivalent';
}
