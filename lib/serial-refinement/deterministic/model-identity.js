import { compactModelToken, MIN_EXACT_TOKEN_LENGTH } from '../../model-evidence/exact-model-match.js';

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
    && prefixLength >= MIN_FAMILY_PREFIX_LENGTH;
}

function isModelFamilyMatch(requestedToken, sourceToken) {
  const shorterLength = Math.min(requestedToken.length, sourceToken.length);
  const prefixLength = commonPrefixLength(requestedToken, sourceToken);
  return prefixLength >= MIN_FAMILY_PREFIX_LENGTH && prefixLength >= Math.ceil(shorterLength / 2);
}

/**
 * Classifies source identity without using an LLM assertion. Exact matching
 * requires the full normalized requested token to appear as a complete model
 * token (including any requested suffix/revision).
 */
export function classifyModelIdentity({ model, title, snippet }) {
  const requestedToken = compactModelToken(model);
  if (requestedToken.length < MIN_EXACT_TOKEN_LENGTH) {
    return { matchType: 'mismatch', requestedToken, matchedToken: null };
  }

  const sourceTokens = sourceModelTokens(`${title || ''} ${snippet || ''}`, requestedToken);
  const exactToken = sourceTokens.find((token) => token === requestedToken);
  if (exactToken) {
    return { matchType: 'exact', requestedToken, matchedToken: exactToken };
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
