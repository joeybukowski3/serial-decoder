import { hashCanonicalQuery } from '../smart-lookup/cache.js';
import { CACHE_FINGERPRINT, isValidPublicResponse } from './contract.js';

/**
 * 24-hour result cache for COMPLETE public responses. Best effort only: any store problem is a miss or a skipped write,
 * never an error, and the provider budget (not this cache) is what protects cost.
 */

export const CACHE_TTL_SECONDS = 24 * 60 * 60;
const CACHE_PREFIX = 'replacement-finder:result:v1';
const STORE_TIMEOUT_MS = 400;

const slug = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Notes enter the key only as a hash. Model, brand and category are non-sensitive and kept readable for operators. */
export function replacementCacheKey({ category, brand, model, notes = '' }) {
  const normalizedNotes = String(notes).toLowerCase().replace(/\s+/g, ' ').trim();
  const notesHash = normalizedNotes ? hashCanonicalQuery(normalizedNotes) : 'none';
  return [CACHE_PREFIX, CACHE_FINGERPRINT, slug(category), slug(brand), slug(model), notesHash].join(':');
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
export function createReplacementCache({ redis, timeoutMs = STORE_TIMEOUT_MS } = {}) {
  /** Returns the stored public response, or null on a miss, a store problem, a key mismatch or a corrupted entry. */
  async function read(key) {
    if (!redis || typeof redis.get !== 'function') return null;
    let entry;
    try { entry = parseEntry(await withTimeout(Promise.resolve(redis.get(key)), timeoutMs)); } catch { return null; }
    // The stored key must echo the requested key, so a misplaced or tampered entry can never answer a different query.
    if (!entry || entry.key !== key || entry.engineVersion !== CACHE_FINGERPRINT || !isValidPublicResponse(entry.response)) return null;
    if (entry.response.status !== 'COMPLETE') return null;
    return entry.response;
  }

  /** Stores COMPLETE responses only. Returns whether a write was attempted successfully. */
  async function write(key, response) {
    if (!redis || typeof redis.set !== 'function' || response?.status !== 'COMPLETE' || !isValidPublicResponse(response)) return false;
    try {
      await withTimeout(Promise.resolve(redis.set(key, JSON.stringify({ key, engineVersion: CACHE_FINGERPRINT, response }), { ex: CACHE_TTL_SECONDS })), timeoutMs);
      return true;
    } catch { return false; }
  }

  return { read, write };
}
