const MEANINGFUL_SEPARATORS = /[\s\-/.]+/g;

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function compact(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function shouldOfferAlternative(chars, index, replacement) {
  const before = chars[index - 1] || '';
  const after = chars[index + 1] || '';
  const current = chars[index];
  const neighborHasDigit = /\d/.test(before) || /\d/.test(after);
  const neighborHasLetter = /[A-Z]/.test(before) || /[A-Z]/.test(after);
  const tokenHasDigit = chars.some((char) => /\d/.test(char));

  if (current === 'O' && replacement === '0') {
    return neighborHasDigit || tokenHasDigit;
  }
  if (current === '0' && replacement === 'O') {
    return neighborHasLetter;
  }
  if ((current === 'I' || current === 'L') && replacement === '1') {
    return neighborHasDigit || tokenHasDigit;
  }
  if (current === '1' && (replacement === 'I' || replacement === 'L')) {
    return neighborHasLetter;
  }
  return false;
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
      alternatives.push({
        value: next.join(''),
        change: `${char}\u2192${replacement}`,
        index,
        validated: false,
      });
    });
  });

  return alternatives.slice(0, 12);
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
    })),
  };
}

export function compactModelValue(value) {
  return compact(value);
}
