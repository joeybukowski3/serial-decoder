import { createHash } from 'node:crypto';

export const SMART_AGE_SCHEMA_VERSION = 'v4';
export const SMART_AGE_POLICY_VERSION = 'model-semantics-2';
export const SMART_INTERPRET_SCHEMA_VERSION = 'v2';
export const SMART_LKQ_SCHEMA_VERSION = 'v5';
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
  ].join('|').toLowerCase();
  return `smart-age:${schemaVersion}:${policyVersion}:${hashCanonicalQuery(identity)}`;
}

export function buildSmartInterpretCacheKey(queryInfo) {
  return `smart-interpret:${SMART_INTERPRET_SCHEMA_VERSION}:${hashCanonicalQuery(queryInfo?.canonicalQuery || queryInfo?.normalizedQuery || '')}`;
}

export function buildSmartLkqCacheKey(queryInfo) {
  const identity = [
    queryInfo?.canonicalQuery || queryInfo?.normalizedQuery || '',
    queryInfo?.notesHash || '',
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
  if (result.evidenceSource === 'heuristic') return 14 * 24 * 60 * 60;
  if (result.evidenceSource === 'user-verified') return 30 * 24 * 60 * 60;
  if (result.evidenceSource === 'local-db') return 60 * 24 * 60 * 60;
  return 14 * 24 * 60 * 60;
}

export function chooseSmartLkqTtl(result) {
  if (!result || result.errorCode || !Array.isArray(result.replacementOptions)) return 0;
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
