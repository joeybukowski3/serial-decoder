import { createHash } from 'node:crypto';
import { boundedRedisGet, boundedRedisSet } from '../../smart-lookup/redis.js';
import { compactModelToken, normalizeEvidenceBrand } from '../../model-evidence/exact-model-match.js';

export const DETERMINISTIC_SERPER_CACHE_VERSION = '1';
export const DETERMINISTIC_FACTS_CACHE_VERSION = '3';
export const SHARED_EVIDENCE_SCHEMA_VERSION = '2';
export const EXTRACTION_PROMPT_VERSION = '2';
export const IDENTITY_POLICY_VERSION = '1';
export const RAW_SERPER_TTL_SECONDS = 60 * 60 * 24;
export const EXTRACTED_FACTS_TTL_SECONDS = 60 * 60 * 24 * 7;
export const SHARED_EVIDENCE_TTL_SECONDS = 60 * 60 * 24 * 180;
export const NEGATIVE_EVIDENCE_TTL_SECONDS = 60 * 15;

const RAW_NAMESPACE = `model-evidence:serper:v${SHARED_EVIDENCE_SCHEMA_VERSION}`;
const FACTS_NAMESPACE = `model-evidence:facts:v${DETERMINISTIC_FACTS_CACHE_VERSION}`;
const RESULT_NAMESPACE = `model-evidence:normalized:v${SHARED_EVIDENCE_SCHEMA_VERSION}`;
const LEGACY_RAW_NAMESPACE = `serial-refinement:deterministic:serper:v${DETERMINISTIC_SERPER_CACHE_VERSION}`;

function digest(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function normalizeToken(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function buildRawSerperCacheKey({ brand, model, category, strategy }) {
  const material = [
    SHARED_EVIDENCE_SCHEMA_VERSION,
    IDENTITY_POLICY_VERSION,
    normalizeEvidenceBrand(brand),
    compactModelToken(model),
    normalizeToken(category),
    normalizeToken(strategy),
  ].join('|');
  return `${RAW_NAMESPACE}:${digest(material)}`;
}

function buildLegacyRawSerperCacheKey({ brand, model, category, strategy }) {
  const material = [
    DETERMINISTIC_SERPER_CACHE_VERSION,
    normalizeToken(brand),
    normalizeToken(model),
    normalizeToken(category),
    normalizeToken(strategy),
  ].join('|');
  return `${LEGACY_RAW_NAMESPACE}:${digest(material)}`;
}

export function buildExtractedFactsCacheKey({
  brand, model, category, evidenceItems, geminiModel, extractorProvider = 'gemini',
}) {
  const boundedEvidence = (evidenceItems || []).map((item) => ({
    strategy: item.strategy || null,
    title: item.title || '',
    snippet: item.snippet || '',
    domain: item.domain || null,
    rawDate: item.rawDate || null,
    normalizedDateYear: item.normalizedDateYear || null,
  }));
  const material = JSON.stringify({
    version: DETERMINISTIC_FACTS_CACHE_VERSION,
    evidenceVersion: SHARED_EVIDENCE_SCHEMA_VERSION,
    promptVersion: EXTRACTION_PROMPT_VERSION,
    identityPolicyVersion: IDENTITY_POLICY_VERSION,
    brand: normalizeEvidenceBrand(brand),
    model: compactModelToken(model),
    category: normalizeToken(category),
    extractorProvider: normalizeToken(extractorProvider),
    geminiModel: normalizeToken(geminiModel),
    evidence: boundedEvidence,
  });
  return `${FACTS_NAMESPACE}:${digest(material)}`;
}

export function buildSharedEvidenceCacheKey({
  brand, model, category, geminiModel, extractorProvider = 'gemini',
}) {
  const material = [
    SHARED_EVIDENCE_SCHEMA_VERSION,
    EXTRACTION_PROMPT_VERSION,
    IDENTITY_POLICY_VERSION,
    normalizeEvidenceBrand(brand),
    compactModelToken(model),
    normalizeToken(category),
    normalizeToken(extractorProvider),
    normalizeToken(geminiModel),
  ].join('|');
  return `${RESULT_NAMESPACE}:${digest(material)}`;
}

function validRawSearch(value) {
  return Boolean(value && value.status === 'success' && Array.isArray(value.results));
}

function validExtractedFacts(value) {
  return Boolean(value && Array.isArray(value.extractedFacts));
}

function validSharedEvidence(value) {
  return Boolean(value
    && value.evidenceVersion === SHARED_EVIDENCE_SCHEMA_VERSION
    && Array.isArray(value.facts)
    && typeof value.status === 'string');
}

export function createDeterministicCache({ redis, deadline } = {}) {
  const stats = {
    rawHits: 0,
    rawMisses: 0,
    factsHits: 0,
    factsMisses: 0,
    evidenceHits: 0,
    evidenceMisses: 0,
    readMs: 0,
    writeMs: 0,
  };

  return {
    stats,

    async getRawSearch(input) {
      const key = buildRawSerperCacheKey(input);
      let read = await boundedRedisGet(redis, key, deadline, {
        stage: `deterministic-serper-cache-${input.strategy || 'search'}`,
        maxMs: 180,
        reserveMs: 500,
      });
      stats.readMs += read.elapsedMs || 0;
      if (read.status !== 'hit') {
        const legacyRead = await boundedRedisGet(redis, buildLegacyRawSerperCacheKey(input), deadline, {
          stage: `deterministic-serper-legacy-cache-${input.strategy || 'search'}`,
          maxMs: 120,
          reserveMs: 500,
        });
        stats.readMs += legacyRead.elapsedMs || 0;
        if (legacyRead.status === 'hit') read = legacyRead;
      }
      if (read.status === 'hit' && validRawSearch(read.value)) {
        stats.rawHits += 1;
        return read.value;
      }
      stats.rawMisses += 1;
      return null;
    },

    async setRawSearch(input, value) {
      if (!validRawSearch(value)) return;
      const key = buildRawSerperCacheKey(input);
      const write = await boundedRedisSet(redis, key, value, RAW_SERPER_TTL_SECONDS, deadline, {
        stage: `deterministic-serper-cache-write-${input.strategy || 'search'}`,
        maxMs: 140,
        reserveMs: 400,
      });
      stats.writeMs += write.elapsedMs || 0;
    },

    async getExtractedFacts(input) {
      const key = buildExtractedFactsCacheKey(input);
      const read = await boundedRedisGet(redis, key, deadline, {
        stage: 'deterministic-facts-cache-read',
        maxMs: 180,
        reserveMs: 500,
      });
      stats.readMs += read.elapsedMs || 0;
      if (read.status === 'hit' && validExtractedFacts(read.value)) {
        stats.factsHits += 1;
        return read.value;
      }
      stats.factsMisses += 1;
      return null;
    },

    async setExtractedFacts(input, value) {
      if (!validExtractedFacts(value)) return;
      const key = buildExtractedFactsCacheKey(input);
      const write = await boundedRedisSet(redis, key, value, EXTRACTED_FACTS_TTL_SECONDS, deadline, {
        stage: 'deterministic-facts-cache-write',
        maxMs: 140,
        reserveMs: 400,
      });
      stats.writeMs += write.elapsedMs || 0;
    },

    async getSharedEvidence(input) {
      const key = buildSharedEvidenceCacheKey(input);
      const read = await boundedRedisGet(redis, key, deadline, {
        stage: 'shared-model-evidence-cache-read',
        maxMs: 180,
        reserveMs: 500,
      });
      stats.readMs += read.elapsedMs || 0;
      if (read.status === 'hit' && validSharedEvidence(read.value)) {
        stats.evidenceHits += 1;
        return read.value;
      }
      stats.evidenceMisses += 1;
      return null;
    },

    async setSharedEvidence(input, value) {
      if (!validSharedEvidence(value)) return;
      const negative = ['timeout', 'error', 'unavailable', 'no_exact_evidence', 'variant_only'].includes(value.status)
        || (value.status === 'partial' && value.failureCategory !== 'EVIDENCE_CONFLICT');
      const ttl = negative
        ? NEGATIVE_EVIDENCE_TTL_SECONDS
        : SHARED_EVIDENCE_TTL_SECONDS;
      const write = await boundedRedisSet(
        redis,
        buildSharedEvidenceCacheKey(input),
        value,
        ttl,
        deadline,
        { stage: 'shared-model-evidence-cache-write', maxMs: 140, reserveMs: 400 },
      );
      stats.writeMs += write.elapsedMs || 0;
    },
  };
}
