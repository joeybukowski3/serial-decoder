import { compactModelToken, MIN_EXACT_TOKEN_LENGTH } from '../../model-evidence/exact-model-match.js';
import { isCanonicalTranscriptionEquivalent } from '../../model-evidence/shared-model-identity.js';

const MAX_SUFFIX_LENGTH = 4;
const MIN_FAMILY_PREFIX_LENGTH = 6;

function sourceModelTokens(value, requestedToken) {
  const parts = String(value || '').toUpperCase().match(/[A-Z0-9]+/g) || [];
  const tokens = new Set();
  const maxLength = requestedToken.length + MAX_SUFFIX_LENGTH;

  for (let start = 0; start < parts.length; start += 1) {
    let token = '';
    for (let end = start; end < parts.length && end < start + 4; end += 1) {
      token += parts[end];
      if (token.length > maxLength) break;
      if (token.length >= MIN_EXACT_TOKEN_LENGTH && /\d/.test(token)) {
        tokens.add(token);
      }
    }
  }

  return [...tokens];
}

function commonPrefixLength(left, right) {
  const limit = Math.min(left.length, right.length);
  let index = 0;
  while (index < limit && left[index] === right[index]) index += 1;
  return index;
}

function isSuffixOrRevisionVariant(requestedToken, sourceToken) {
  const shorterLength = Math.min(requestedToken.length, sourceToken.length);
  const longerLength = Math.max(requestedToken.length, sourceToken.length);
  if (shorterLength < MIN_EXACT_TOKEN_LENGTH) return false;

  if (
    (requestedToken.startsWith(sourceToken) || sourceToken.startsWith(requestedToken))
    && longerLength - shorterLength <= MAX_SUFFIX_LENGTH
  ) {
    return true;
  }

  const prefixLength = commonPrefixLength(requestedToken, sourceToken);
  return requestedToken.length === sourceToken.length
    && requestedToken.length - prefixLength <= 2
    && prefixLength >= MIN_FAMILY_PREFIX_LENGTH
    && !isCanonicalTranscriptionEquivalent(requestedToken, sourceToken);
}

function isModelFamilyMatch(requestedToken, sourceToken) {
  const shorterLength = Math.min(requestedToken.length, sourceToken.length);
  const prefixLength = commonPrefixLength(requestedToken, sourceToken);
  return prefixLength >= MIN_FAMILY_PREFIX_LENGTH && prefixLength >= Math.ceil(shorterLength / 2);
}

/**
 * Classifies source identity without using an LLM assertion. Exact matching
 * requires the full normalized requested token to appear as a complete model
 * token. A single safe O/0 or I/1 transcription difference is
 * `canonical-equivalent` rather than a weak variant.
 *
 * @param {{ model: string, title?: string, snippet?: string, searchModels?: string[] }} input
 */
export function classifyModelIdentity({ model, title, snippet, searchModels }) {
  const requestedToken = compactModelToken(model);
  if (requestedToken.length < MIN_EXACT_TOKEN_LENGTH) {
    return { matchType: 'mismatch', requestedToken, matchedToken: null };
  }

  const equivalentTokens = new Set(
    [requestedToken, ...(searchModels || []).map(compactModelToken)]
      .filter((token) => token && token.length >= MIN_EXACT_TOKEN_LENGTH),
  );

  const sourceTokens = sourceModelTokens(`${title || ''} ${snippet || ''}`, requestedToken);

  const exactToken = sourceTokens.find((token) => token === requestedToken);
  if (exactToken) {
    return { matchType: 'exact', requestedToken, matchedToken: exactToken };
  }

  // Source uses a form that is an exact match for a searched transcription
  // alternative, or differs from the entered token only by safe O/0 I/1.
  const canonicalToken = sourceTokens.find((token) =>
    equivalentTokens.has(token)
    || isCanonicalTranscriptionEquivalent(requestedToken, token)
    || [...equivalentTokens].some((candidate) => isCanonicalTranscriptionEquivalent(candidate, token)));
  if (canonicalToken) {
    return {
      matchType: 'canonical-equivalent',
      requestedToken,
      matchedToken: canonicalToken,
    };
  }

  const variantToken = sourceTokens.find((token) => isSuffixOrRevisionVariant(requestedToken, token));
  if (variantToken) {
    return { matchType: 'variant', requestedToken, matchedToken: variantToken };
  }

  const familyToken = sourceTokens.find((token) => isModelFamilyMatch(requestedToken, token));
  if (familyToken) {
    return { matchType: 'family', requestedToken, matchedToken: familyToken };
  }

  return { matchType: 'mismatch', requestedToken, matchedToken: null };
}
