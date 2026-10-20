import { QUICK_CACHE_VERSION } from '../replacement-quick/quick-answer.js';
import { QUICK_MODEL } from '../replacement-quick/quick-prompt.js';
import { hashCanonicalQuery } from '../smart-lookup/cache.js';
import { RESEARCH_CONTRACT_VERSION, isValidResearchResponse } from './contract.js';

/**
 * Result cache for ItemAssist Research, in its own key namespace. Only real AI answers are stored: a provider failure
 * (UNAVAILABLE) is never cached. Best effort: any store problem is a miss or a skipped write; the budget protects cost.
 * The key carries the answer/prompt versions, the contract version and the model, so a change to any of them is a fresh start.
 */

export const RESEARCH_CACHE_PREFIX = 'itemassist-research:answer:v1';
const STORE_TIMEOUT_MS = 400;
const DAY_SECONDS = 24 * 60 * 60;
// An unidentified product is cheap to re-ask and may be rephrased soon; a real answer is stable general knowledge.
export const CACHE_TTL_SECONDS = Object.freeze({ OK: DAY_SECONDS, PARTIAL: DAY_SECONDS, GUIDANCE_ONLY: 60 * 60 });

const slug = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The query enters the key only as a hash. */
export function researchCacheKey(query, { model = QUICK_MODEL } = {}) {
  const canonical = String(query).toLowerCase().replace(/\s+/g, ' ').trim();
  return [RESEARCH_CACHE_PREFIX, slug(QUICK_CACHE_VERSION), slug(RESEARCH_CONTRACT_VERSION), slug(model), hashCanonicalQuery(canonical)].join(':');
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('STORE_TIMEOUT')), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function parseEntry(raw) {
  if (raw === null || raw === undefined) return null;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
}

/** @param {{redis: {get?: Function, set?: Function}|null, timeoutMs?: number}} options */
export function createResearchCache({ redis, timeoutMs = STORE_TIMEOUT_MS } = {}) {
  /** The stored response, or null on a miss, store problem, key mismatch, stale version or corrupted entry. */
  async function read(key) {
    if (!redis || typeof redis.get !== 'function') return null;
    let entry;
    try { entry = parseEntry(await withTimeout(Promise.resolve(redis.get(key)), timeoutMs)); } catch { return null; }
    if (!entry || entry.key !== key || entry.contractVersion !== RESEARCH_CONTRACT_VERSION || !isValidResearchResponse(entry.response)) return null;
    // Only real AI answers are ever written, so an entry claiming anything else did not come from this module.
    return Object.hasOwn(CACHE_TTL_SECONDS, entry.response.status) && entry.response.meta.answerSource === 'AI_ESTIMATE' ? entry.response : null;
  }

  /** Stores OK / PARTIAL / GUIDANCE_ONLY AI answers only. Returns whether a write succeeded. */
  async function write(key, response) {
    const ttl = CACHE_TTL_SECONDS[response?.status];
    if (!ttl || response.meta?.answerSource !== 'AI_ESTIMATE' || !redis || typeof redis.set !== 'function' || !isValidResearchResponse(response)) return false;
    try {
      await withTimeout(Promise.resolve(redis.set(key, JSON.stringify({ key, contractVersion: RESEARCH_CONTRACT_VERSION, response }), { ex: ttl })), timeoutMs);
      return true;
    } catch { return false; }
  }

  return { read, write };
}
