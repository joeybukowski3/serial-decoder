import { createHash } from 'node:crypto';

export const SMART_AGE_SCHEMA_VERSION = 'v5';
// Bumped for progressive specificity: the cache key identity now includes
// querySpecificity and the recognized family/model-line id, so an exact,
// model-line, product-family, and brand-category result for the same text
// can never collide -- and no pre-existing v5/model-semantics-2 entry is
// misread under the new identity shape.
export const SMART_AGE_POLICY_VERSION = 'model-semantics-4';
export const SMART_INTERPRET_SCHEMA_VERSION = 'v2';
// Bumped for progressive LKQ: form factor, replacement precision, and
// service-tag intent now participate in the key identity so
// "OptiPlex 9020" / "OptiPlex 9020 SFF" / "OptiPlex 9020 MT" / a generic
// "OptiPlex" family match / a service-tag-only lookup can never collide.
export const SMART_LKQ_SCHEMA_VERSION = 'v9';
export const SMART_GENERAL_SCHEMA_VERSION = 'v2';

export function hashCanonicalQuery(value) {
  return createHash('sha256').update(String(value || '')).digest('hex').slice(0, 24);
}

export function buildSmartAgeCacheKey(queryInfo, options = {}) {
  const schemaVersion = options.schemaVersion || SMART_AGE_SCHEMA_VERSION;
  const policyVersion = options.policyVersion || SMART_AGE_POLICY_VERSION;
  const identity = [
    queryInfo?.canonicalQuery || queryInfo?.normalizedQuery || '',
    queryInfo?.brand || '',
    queryInfo?.modelCompleteness === 'exact' ? queryInfo?.modelIdentity || '' : '',
    queryInfo?.notesHash || '',
    // Progressive specificity tier and recognized family/model-line
    // participate in the key identity so an exact-model, model-line,
    // product-family, and brand-category result for otherwise-identical
    // query text can never satisfy each other's cache reads.
    queryInfo?.querySpecificity || '',
    queryInfo?.familyId || '',
    queryInfo?.modelLineId || '',
    // A labeled serial and any unassigned identifier tokens participate in
    // the key identity, so "model only", "serial only", "model + serial",
    // and "model + a different serial" can never satisfy each other's cache
    // reads. Values are inputs to the sha256 identity hash only -- the stored
    // key never contains a raw serial or model.
    queryInfo?.serialIdentity || '',
    Array.isArray(queryInfo?.ambiguousIdentifiers) ? queryInfo.ambiguousIdentifiers.join(',') : '',
    // Grounded and closed-book results have different evidence strength, so a
    // runtime flag flip must never serve one mode's cache to the other.
    options.grounded ? 'g1' : 'g0',
  ].join('|').toLowerCase();
  return `smart-age:${schemaVersion}:${policyVersion}:${hashCanonicalQuery(identity)}`;
}

export function buildSmartInterpretCacheKey(queryInfo) {
  return `smart-interpret:${SMART_INTERPRET_SCHEMA_VERSION}:${hashCanonicalQuery(queryInfo?.canonicalQuery || queryInfo?.normalizedQuery || '')}`;
}

export function buildSmartLkqCacheKey(queryInfo, options = {}) {
  const identity = [
    queryInfo?.canonicalQuery || queryInfo?.normalizedQuery || '',
    queryInfo?.brand || '',
    // Model exactness now participates in the key identity (a v5 gap) so a
    // partial-token query can never read/write the same entry as an
    // exact-model query for the same canonical text.
    queryInfo?.modelCompleteness === 'exact' ? queryInfo?.modelIdentity || '' : '',
    queryInfo?.genericCategory || '',
    queryInfo?.notesHash || '',
    // Same progressive-specificity/family separation as the age cache key.
    queryInfo?.querySpecificity || '',
    queryInfo?.familyId || '',
    queryInfo?.modelLineId || '',
    // Replacement-specific identity (Phase 9, additive): a numbered model
    // line ("optiplex-9020") is shared by every chassis variant of that
    // line, so form factor must be its own identity component -- without
    // it, "OptiPlex 9020" and "OptiPlex 9020 SFF" would resolve to the same
    // modelLineId and collide.
    queryInfo?.replacementPrecision || '',
    queryInfo?.formFactor || '',
    // A service-tag-only lookup must never satisfy (or be satisfied by) a
    // generic model-line/family result for otherwise-similar query text.
    // A labeled serial and any unassigned identifier tokens participate in
    // the key identity, so "model only", "serial only", "model + serial",
    // and "model + a different serial" can never satisfy each other's cache
    // reads. Values are inputs to the sha256 identity hash only -- the stored
    // key never contains a raw serial or model.
    queryInfo?.serialIdentity || '',
    Array.isArray(queryInfo?.ambiguousIdentifiers) ? queryInfo.ambiguousIdentifiers.join(',') : '',
    queryInfo?.serviceTagIntent ? 'st1' : 'st0',
    // Grounded and closed-book replacement research carry different
    // evidence strength, so a runtime flag flip must never serve one mode's
    // cache to the other -- same pattern as the age cache key.
    options.grounded ? 'g1' : 'g0',
  ].join('|').toLowerCase();
  return `smart-lkq:${SMART_LKQ_SCHEMA_VERSION}:${hashCanonicalQuery(identity)}`;
}

export function buildSmartGeneralCacheKey(queryInfo) {
  return `smart-general:${SMART_GENERAL_SCHEMA_VERSION}:${hashCanonicalQuery(queryInfo?.canonicalQuery || queryInfo?.normalizedQuery || '')}`;
}

export function chooseSmartAgeTtl(result) {
  if (!result || result.errorCode || result.cacheStatus === 'error') return 0;
  if (result.evidenceSource === 'gemini-ungrounded' || result.evidenceSource === 'groq-ungrounded') {
    return 7 * 24 * 60 * 60;
  }
  if (result.evidenceSource === 'gemini-grounded') return 7 * 24 * 60 * 60;
  if (result.evidenceSource === 'heuristic') return 14 * 24 * 60 * 60;
  if (result.evidenceSource === 'user-verified') return 30 * 24 * 60 * 60;
  if (result.evidenceSource === 'local-db') return 60 * 24 * 60 * 60;
  return 14 * 24 * 60 * 60;
}

// A single cache entry (not a separate identity/pricing split -- see
// docs/smart-lookup-architecture.md for why the split was not worth the
// added Redis round-trips and invalidation surface for this feature's first
// version) with a TTL chosen by whichever evidence in it is most volatile.
// Price observations age fastest, so their presence caps the TTL low
// regardless of how strong the underlying replacement-identity evidence is.
export function chooseSmartLkqTtl(result) {
  if (!result || result.errorCode) return 0;
  const hasLegacyOptions = Array.isArray(result.replacementOptions) && result.replacementOptions.length > 0;
  const hasGroundedRelationship = typeof result.replacementRelationship === 'string';
  if (!hasLegacyOptions && !hasGroundedRelationship) return 0;
  const isGrounded = result.evidenceSource === 'manufacturer-grounded'
    || result.evidenceSource === 'retailer-grounded'
    || result.evidenceSource === 'mixed-grounded';
  if (Array.isArray(result.priceObservations) && result.priceObservations.length) {
    return 3 * 24 * 60 * 60;
  }
  if (isGrounded) return 14 * 24 * 60 * 60;
  if (result.evidenceSource === 'gemini-ungrounded' || result.evidenceSource === 'groq-ungrounded') {
    return 5 * 24 * 60 * 60;
  }
  return 3 * 24 * 60 * 60;
}

export function prepareResultForCache(result) {
  if (!result || typeof result !== 'object') return null;
  const copy = JSON.parse(JSON.stringify(result));
  copy.cacheStatus = 'miss';
  copy.source = result.source === 'cache' ? (result.originSource || 'fallback') : result.source;
  copy.originSource = copy.source;
  copy.providerAttempted = Boolean(result.providerAttempted);
  copy.timings = {
    rateLimitMs: 0,
    localLookupMs: 0,
    verifiedLookupMs: 0,
    cacheReadMs: 0,
    providerMs: 0,
    postProcessMs: 0,
    cacheWriteMs: 0,
    totalMs: 0,
  };
  return copy;
}

export function prepareInterpretForCache(result) {
  if (!result || typeof result !== 'object' || result.errorCode) return null;
  const copy = JSON.parse(JSON.stringify(result));
  copy.cacheStatus = 'miss';
  copy.source = result.source === 'cache' ? (result.originSource || 'gemini') : result.source;
  copy.originSource = copy.source;
  copy.providerAttempted = Boolean(result.providerAttempted);
  copy.timings = { cacheReadMs: 0, rateLimitMs: 0, providerMs: 0, cacheWriteMs: 0, totalMs: 0 };
  return copy;
}

export function prepareReplacementForCache(result) {
  if (!result || typeof result !== 'object' || result.errorCode) return null;
  const copy = JSON.parse(JSON.stringify(result));
  copy.cacheStatus = 'miss';
  copy.source = result.source === 'cache' ? (result.originSource || 'gemini') : result.source;
  copy.originSource = copy.source;
  copy.providerAttempted = Boolean(result.providerAttempted);
  copy.timings = { cacheReadMs: 0, rateLimitMs: 0, providerMs: 0, postProcessMs: 0, cacheWriteMs: 0, totalMs: 0 };
  return copy;
}
