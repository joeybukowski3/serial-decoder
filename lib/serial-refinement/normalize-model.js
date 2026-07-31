const MEANINGFUL_SEPARATORS = /[\s\-/.]+/g;
const MAX_GENERATED_ALTERNATIVES = 8;
const DEFAULT_SEARCH_ALTERNATIVE_CAP = 1;

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function compact(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Only offer a substitution when the surrounding token structure makes it
 * plausible (digit-adjacent O/0, letter-adjacent 0/O, digit-like I/L/1, etc.).
 */
function shouldOfferAlternative(chars, index, replacement) {
  const before = chars[index - 1] || '';
  const after = chars[index + 1] || '';
  const current = chars[index];
  const neighborHasDigit = /\d/.test(before) || /\d/.test(after);
  const neighborHasLetter = /[A-Z]/.test(before) || /[A-Z]/.test(after);
  const tokenHasDigit = chars.some((char) => /\d/.test(char));
  const isTerminal = index === chars.length - 1;

  if (current === 'O' && replacement === '0') {
    // Prefer terminal O→0 and O next to digits; still allow digit-bearing tokens.
    return isTerminal || neighborHasDigit || tokenHasDigit;
  }
  if (current === '0' && replacement === 'O') {
    return isTerminal || neighborHasLetter;
  }
  if ((current === 'I' || current === 'L') && replacement === '1') {
    return neighborHasDigit || tokenHasDigit;
  }
  if (current === '1' && (replacement === 'I' || replacement === 'L')) {
    return neighborHasLetter;
  }
  return false;
}

function alternativeScore(alternative, chars) {
  const isTerminal = alternative.index === chars.length - 1;
  const change = String(alternative.change || '');
  let score = 0;
  if (/O→0/.test(change) && isTerminal) score += 100;
  if (/0→O/.test(change) && isTerminal) score += 90;
  if (/O→0/.test(change)) score += 40;
  if (/0→O/.test(change)) score += 30;
  if (/I→1|L→1/.test(change)) score += 20;
  if (/1→I|1→L/.test(change)) score += 10;
  // Prefer substitutions inside or after digit runs.
  const before = chars[alternative.index - 1] || '';
  const after = chars[alternative.index + 1] || '';
  if (/\d/.test(before) || /\d/.test(after)) score += 15;
  // Strongly prefer alternatives marked as preferred canonical forms.
  if (alternative.preferredAsCanonical) score += 50;
  return score;
}

function buildTranscriptionAlternatives(canonical) {
  const chars = canonical.split('');
  const alternatives = [];
  const substitutions = {
    O: ['0'],
    0: ['O'],
    I: ['1'],
    L: ['1'],
    1: ['I', 'L'],
  };

  chars.forEach((char, index) => {
    const replacements = substitutions[char] || [];
    replacements.forEach((replacement) => {
      if (!shouldOfferAlternative(chars, index, replacement)) return;
      const next = chars.slice();
      next[index] = replacement;
      const isTerminal = index === chars.length - 1;
      const change = `${char}\u2192${replacement}`;
      alternatives.push({
        value: next.join(''),
        change: isTerminal && (change === 'O→0' || change === '0→O')
          ? `${change} (terminal)`
          : change,
        index,
        validated: false,
        preferredAsCanonical: isTerminal && change === 'O→0',
      });
    });
  });

  return alternatives
    .sort((left, right) => alternativeScore(right, chars) - alternativeScore(left, chars))
    .slice(0, MAX_GENERATED_ALTERNATIVES);
}

export function normalizeModelInput(value) {
  const original = String(value || '');
  const trimmed = original.trim();
  const transformations = [];
  let canonical = trimmed;

  if (canonical !== original) transformations.push('trimmed-whitespace');
  const upper = canonical.toUpperCase();
  if (upper !== canonical) transformations.push('uppercased');
  canonical = upper;

  const collapsedWhitespace = canonical.replace(/\s+/g, ' ');
  if (collapsedWhitespace !== canonical) transformations.push('collapsed-whitespace');
  canonical = collapsedWhitespace;

  const structuralVariants = unique([
    canonical,
    canonical.replace(MEANINGFUL_SEPARATORS, ''),
    canonical.replace(/[\s/.]+/g, '-'),
  ]);

  return {
    original,
    canonical,
    compact: compact(canonical),
    structuralVariants,
    possibleTranscriptionAlternatives: buildTranscriptionAlternatives(canonical),
    transformations,
  };
}

export function validateTranscriptionAlternatives(normalized, knownModels = []) {
  const known = new Set(
    knownModels
      .map((value) => compact(value))
      .filter(Boolean),
  );

  return {
    ...normalized,
    possibleTranscriptionAlternatives: normalized.possibleTranscriptionAlternatives.map((alternative) => ({
      ...alternative,
      validated: known.has(compact(alternative.value)),
      preferredAsCanonical: Boolean(alternative.preferredAsCanonical)
        || (known.has(compact(alternative.value)) && /O→0/.test(alternative.change)),
    })),
  };
}

/**
 * Select a small bounded set of search alternatives. Prefer validated known
 * models, then terminal O→0, then other high-scoring substitutions.
 */
export function prioritizeSearchAlternatives(normalized, options = {}) {
  const maxAlternatives = Number.isInteger(options.maxAlternatives)
    ? options.maxAlternatives
    : DEFAULT_SEARCH_ALTERNATIVE_CAP;
  const known = new Set(
    (options.knownModels || [])
      .map((value) => compact(value))
      .filter(Boolean),
  );
  const enteredCompact = compact(normalized?.canonical || normalized?.compact);
  const chars = String(normalized?.canonical || '').split('');

  const scored = (normalized?.possibleTranscriptionAlternatives || [])
    .map((alternative) => {
      const valueCompact = compact(alternative.value);
      if (!valueCompact || valueCompact === enteredCompact) return null;
      const validated = known.has(valueCompact) || alternative.validated === true;
      const score = alternativeScore(alternative, chars) + (validated ? 200 : 0);
      return {
        ...alternative,
        validated,
        preferredAsCanonical: Boolean(alternative.preferredAsCanonical)
          || (validated && /O→0/.test(alternative.change)),
        score,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score);

  return scored.slice(0, Math.max(0, maxAlternatives));
}

export function compactModelValue(value) {
  return compact(value);
}
