import { hashCanonicalQuery } from '../../smart-lookup/cache.js';

/**
 * Cache for the two Serper lookups behind a live research.2 answer, in its own key namespace. What is stored is the NORMALIZED provider
 * rows (titles, sellers, prices, dates), never derived prices, so a change to the screening rules applies to cached rows without new spend.
 * A rephrased question that leads to the same history query or the same candidate Shopping query reuses the rows. Best effort: any store
 * problem is a miss or a skipped write, and an entry that does not re-validate is a miss. Failures are never cached.
 */

export const ENRICH_CACHE_PREFIX = 'itemassist-research:enrich:v1';
// Launch prices do not change; a Shopping price is a daily snapshot.
export const ENRICH_TTL_SECONDS = Object.freeze({ history: 7 * 24 * 60 * 60, listings: 12 * 60 * 60 });
const STORE_TIMEOUT_MS = 400;
const MAX_ROWS = 40;

const text = (value, max) => typeof value === 'string' && value.length <= max;
const ROW_CHECKS = Object.freeze({
  history: (row) => row && typeof row === 'object' && text(row.title, 240) && text(row.url, 400) && text(row.snippet, 500) && (row.date === null || /^\d{4}-\d{2}-\d{2}$/.test(row.date)),
  listings: (row) => row && typeof row === 'object' && text(row.title, 200) && text(row.seller, 60) && Number.isFinite(row.price) && row.price > 0 && (row.url === undefined || text(row.url, 300)),
});

export const enrichCacheKey = (kind, query) => [ENRICH_CACHE_PREFIX, kind, hashCanonicalQuery(String(query).toLowerCase().replace(/\s+/g, ' ').trim())].join(':');

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
export function createEnrichmentCache({ redis, timeoutMs = STORE_TIMEOUT_MS } = {}) {
  /** The stored rows, or null on a miss, store problem, kind or key mismatch, or corrupted entry. */
  async function read(kind, query) {
    if (!redis || typeof redis.get !== 'function' || !Object.hasOwn(ROW_CHECKS, kind)) return null;
    const key = enrichCacheKey(kind, query);
    let entry;
    try { entry = parseEntry(await withTimeout(Promise.resolve(redis.get(key)), timeoutMs)); } catch { return null; }
    if (!entry || entry.key !== key || entry.kind !== kind || !Array.isArray(entry.rows) || entry.rows.length > MAX_ROWS || !entry.rows.every(ROW_CHECKS[kind])) return null;
    return entry.rows;
  }

  /** Stores rows from a successful lookup (an empty result is a real answer and is cached too). Returns whether a write succeeded. */
  async function write(kind, query, rows) {
    if (!redis || typeof redis.set !== 'function' || !Object.hasOwn(ROW_CHECKS, kind) || !Array.isArray(rows) || rows.length > MAX_ROWS || !rows.every(ROW_CHECKS[kind])) return false;
    const key = enrichCacheKey(kind, query);
    try {
      await withTimeout(Promise.resolve(redis.set(key, JSON.stringify({ key, kind, rows }), { ex: ENRICH_TTL_SECONDS[kind] })), timeoutMs);
      return true;
    } catch { return false; }
  }

  return { read, write };
}
