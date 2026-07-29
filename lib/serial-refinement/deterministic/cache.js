import { createHash } from 'node:crypto';
import { boundedRedisGet, boundedRedisSet } from '../../smart-lookup/redis.js';

export const DETERMINISTIC_SERPER_CACHE_VERSION = '1';
export const DETERMINISTIC_FACTS_CACHE_VERSION = '1';
export const RAW_SERPER_TTL_SECONDS = 60 * 60 * 24;
export const EXTRACTED_FACTS_TTL_SECONDS = 60 * 60 * 24 * 7;

const RAW_NAMESPACE = `serial-refinement:deterministic:serper:v${DETERMINISTIC_SERPER_CACHE_VERSION}`;
const FACTS_NAMESPACE = `serial-refinement:deterministic:facts:v${DETERMINISTIC_FACTS_CACHE_VERSION}`;

function digest(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function normalizeToken(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function buildRawSerperCacheKey({ brand, model, category, strategy }) {
  const material = [
    DETERMINISTIC_SERPER_CACHE_VERSION,
    normalizeToken(brand),
    normalizeToken(model),
    normalizeToken(category),
    normalizeToken(strategy),
  ].join('|');
  return `${RAW_NAMESPACE}:${digest(material)}`;
}

export function buildExtractedFactsCacheKey({ brand, model, category, evidenceItems, geminiModel }) {
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
    brand: normalizeToken(brand),
    model: normalizeToken(model),
    category: normalizeToken(category),
    geminiModel: normalizeToken(geminiModel),
    evidence: boundedEvidence,
  });
  return `${FACTS_NAMESPACE}:${digest(material)}`;
}

function validRawSearch(value) {
  return Boolean(value && value.status === 'success' && Array.isArray(value.results));
}

function validExtractedFacts(value) {
  return Boolean(value && Array.isArray(value.extractedFacts));
}

export function createDeterministicCache({ redis, deadline } = {}) {
  const stats = {
    rawHits: 0,
    rawMisses: 0,
    factsHits: 0,
    factsMisses: 0,
    readMs: 0,
    writeMs: 0,
  };

  return {
    stats,

    async getRawSearch(input) {
      const key = buildRawSerperCacheKey(input);
      const read = await boundedRedisGet(redis, key, deadline, {
        stage: `deterministic-serper-cache-${input.strategy || 'search'}`,
        maxMs: 180,
        reserveMs: 500,
      });
      stats.readMs += read.elapsedMs || 0;
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
  };
}
