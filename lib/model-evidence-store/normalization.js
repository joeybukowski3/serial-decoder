/**
 * Normalization for the persistent model evidence store.
 *
 * CRITICAL: this module does NOT implement identity normalization. It
 * re-exports the existing Phase 1 implementations so there is exactly one
 * definition of "the same model" in the repository. A second implementation
 * would drift from the lookup path and silently produce wrong matches.
 *
 *   compactModelToken       lib/model-evidence/exact-model-match.js
 *   normalizeEvidenceBrand  lib/model-evidence/exact-model-match.js
 *   MIN_EXACT_TOKEN_LENGTH  lib/model-evidence/exact-model-match.js
 *   isCanonicalTranscriptionEquivalent
 *                           lib/model-evidence/shared-model-identity.js
 */
import { createHash } from 'node:crypto';
import {
  compactModelToken,
  MIN_EXACT_TOKEN_LENGTH,
  normalizeEvidenceBrand,
} from '../model-evidence/exact-model-match.js';
import { isCanonicalTranscriptionEquivalent } from '../model-evidence/shared-model-identity.js';

export {
  compactModelToken,
  normalizeEvidenceBrand,
  MIN_EXACT_TOKEN_LENGTH,
  isCanonicalTranscriptionEquivalent,
};

/**
 * Alias types that may back an authoritative exact-model identity match.
 *
 * Mirrors the partial index predicate in
 * db/migrations/0002_model_evidence_indexes.sql (product_aliases_active_idx).
 * The two MUST stay in sync: the index exists to make this predicate fast, and
 * the predicate exists to make the index correct.
 *
 * Deliberately excluded:
 *   family_alias          - a family token can never satisfy an exact query
 *   retailer_alias        - insufficiently authoritative without corroboration
 *   legacy_model_number   - may describe a different product generation
 *   user_observed_variant - an unverified typo; the DB also forbids verifying it
 */
export const IDENTITY_BEARING_ALIAS_TYPES = Object.freeze([
  'transcription_variant',
  'manufacturer_alias',
  'revision_variant',
]);

/** Query-parameter names stripped during URL normalization before hashing. */
const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'fbclid', 'msclkid', 'mc_cid', 'mc_eid', 'ref', 'ref_src',
]);

const MAX_URL_LENGTH = 2048;

/**
 * Tokens safe to use as store lookup keys.
 *
 * Applies the same MIN_EXACT_TOKEN_LENGTH floor the database enforces on
 * aliases, so a token too short to be a legal alias never reaches a query.
 *
 * @param {{canonicalModel?: string, enteredModel?: string, searchModels?: string[]}} identity
 * @param {string} [fallbackModel]
 * @returns {string[]} unique uppercase compact tokens, longest first
 */
export function buildStoreLookupTokens(identity = {}, fallbackModel = '') {
  const candidates = [
    identity.canonicalModel,
    identity.enteredModel,
    identity.normalizedEnteredModel,
    ...(Array.isArray(identity.searchModels) ? identity.searchModels : []),
    fallbackModel,
  ];

  const tokens = [];
  for (const candidate of candidates) {
    const token = compactModelToken(candidate);
    if (!token) continue;
    if (token.length < MIN_EXACT_TOKEN_LENGTH) continue;
    if (token.length > 64) continue; // products_normalized_model_len upper bound
    if (!tokens.includes(token)) tokens.push(token);
  }
  // Longest first: a more specific token is a better identity claim, and this
  // makes token ordering deterministic for tests and for query plans.
  return tokens.sort((left, right) => right.length - left.length);
}

/**
 * Canonicalize a source URL so the same page is one row regardless of
 * tracking parameters, fragments, or host casing.
 *
 * Returns null for anything that must never be stored: non-https schemes,
 * over-length URLs, and hosts that are not publicly routable.
 *
 * @param {string} value
 * @returns {string|null}
 */
export function normalizeSourceUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.length > MAX_URL_LENGTH) return null;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch (_) {
    return null;
  }

  // https only. Blocks http:, data:, javascript:, file: and friends, and is
  // also asserted by the evidence_sources_url_https CHECK constraint.
  if (parsed.protocol !== 'https:') return null;

  const host = parsed.hostname.toLowerCase();
  if (!host || !host.includes('.')) return null;
  if (isNonPublicHost(host)) return null;

  parsed.hostname = host;
  parsed.hash = '';
  parsed.username = '';
  parsed.password = '';
  parsed.port = '';

  const params = [...parsed.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAMS.has(key.toLowerCase()))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  parsed.search = '';
  for (const [key, entryValue] of params) parsed.searchParams.append(key, entryValue);

  const normalized = parsed.toString();
  return normalized.length <= MAX_URL_LENGTH ? normalized : null;
}

function isNonPublicHost(host) {
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host === '0.0.0.0' || host === '::1' || host === '[::1]') return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  return false;
}

/** sha256 hex of a normalized URL. Matches evidence_sources_hash_shape. */
export function urlHash(normalizedUrl) {
  return createHash('sha256').update(String(normalizedUrl || '')).digest('hex');
}

/** Hostname of a normalized URL, for the evidence_sources.domain column. */
export function urlDomain(normalizedUrl) {
  try {
    return new URL(normalizedUrl).hostname.toLowerCase();
  } catch (_) {
    return '';
  }
}

/**
 * sha256 of normalized SEARCH TERMS.
 *
 * Never a raw user query and never a serial: callers pass the already-derived
 * model search tokens, which is what claim_sources.search_query_hash records.
 */
export function searchQueryHash(terms) {
  const normalized = (Array.isArray(terms) ? terms : [terms])
    .map((term) => compactModelToken(term))
    .filter(Boolean)
    .sort()
    .join('|');
  return normalized ? createHash('sha256').update(normalized).digest('hex') : null;
}

/**
 * True when a candidate alias token may be auto-verified as a transcription
 * variant of a canonical model.
 *
 * This is the runtime half of the alias-poisoning defence. The DB enforces
 * length, brand scope, and uniqueness; this enforces that the substitution is
 * one of the bounded Phase 1 O/0, I/1, L/1 equivalences and nothing else.
 */
export function isSafeTranscriptionAlias(canonicalModel, aliasCandidate) {
  const canonical = compactModelToken(canonicalModel);
  const alias = compactModelToken(aliasCandidate);
  if (!canonical || !alias) return false;
  if (alias.length < MIN_EXACT_TOKEN_LENGTH) return false;
  if (alias === canonical) return false;
  return isCanonicalTranscriptionEquivalent(canonical, alias);
}
