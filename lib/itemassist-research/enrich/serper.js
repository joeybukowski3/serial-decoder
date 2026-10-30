import { createBoundedAbort } from '../../serial-refinement/bounded-abort.js';
import { classifyHost } from '../evidence.js';

/**
 * Serper transport for ItemAssist Research enrichment: one dated web search and one Shopping query, each a single bounded request.
 * Unlike the replacement-discovery adapter this keeps the publication date of an organic result (the only date a historical price
 * has) and reads Shopping rows. Nothing here retries; a failure is a coded error the caller turns into "no evidence".
 *
 * Only plain fields leave this module: no image or tracking id is kept. A Shopping link is kept only when it is an https page on a registered
 * seller's own site (see `sellerLink`); the usual Shopping link is a Google page, which is not a product page and is never kept.
 * The API key is read by the caller and never appears in an error, a log line or a returned row.
 */

export const SERPER_SEARCH_URL = 'https://google.serper.dev/search';
export const SERPER_SHOPPING_URL = 'https://google.serper.dev/shopping';
export const SERPER_CREDITS = Object.freeze({ search: 1, shopping: 2 });
const MAX_BYTES = 400_000;
const MAX_ORGANIC = 10;
const MAX_SHOPPING = 40;
const MIN_PRICE = 1;
const MAX_PRICE = 999_999;

const MONTHS = Object.freeze({ jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 });

/** "Feb 28, 2023" or "2023-02-28" as YYYY-MM-DD; a relative date ("3 years ago") or anything else is null: no date is better than a guess. */
export function parseSerperDate(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const named = /^([A-Za-z]{3,9})\.? (\d{1,2}), (\d{4})$/.exec(text);
  const parts = iso ? [Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])] : named && Object.hasOwn(MONTHS, named[1].slice(0, 3).toLowerCase())
    ? [Number(named[3]), MONTHS[named[1].slice(0, 3).toLowerCase()], Number(named[2])] : null;
  if (!parts) return null;
  const date = new Date(Date.UTC(parts[0], parts[1], parts[2]));
  return date.getUTCFullYear() === parts[0] && date.getUTCMonth() === parts[1] && date.getUTCDate() === parts[2] && parts[0] >= 2000
    ? date.toISOString().slice(0, 10) : null;
}

/** A dollar amount as a number, from a number or a string such as "$1,269.99"; anything not a plausible USD price is null. */
export function parsePrice(value) {
  const number = typeof value === 'number' ? value : typeof value === 'string' && /^\s*\$\s?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?\s*$/.test(value) ? Number(value.replace(/[$,\s]/g, '')) : NaN;
  return Number.isFinite(number) && number >= MIN_PRICE && number <= MAX_PRICE ? Math.round(number * 100) / 100 : null;
}

/** The link of a Shopping row when it points at a registered seller's own https site (no query, fragment or credentials), else null. */
export function sellerLink(value) {
  let url;
  try { url = new URL(String(value)); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !classifyHost(url.hostname)) return null;
  const link = `${url.origin}${url.pathname}`;
  return link.length <= 300 ? link : null;
}

const clip = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export function normalizeOrganic(payload) {
  const seen = new Set();
  return (Array.isArray(payload?.organic) ? payload.organic : []).flatMap((entry) => {
    let url;
    try { url = new URL(entry?.link); } catch { return []; }
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return [];
    const key = `${url.hostname}${url.pathname}`.toLowerCase().replace(/\/$/, '');
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ title: clip(entry.title, 240), url: `${url.origin}${url.pathname}`, snippet: clip(entry.snippet, 500), date: parseSerperDate(entry.date) }];
  }).slice(0, MAX_ORGANIC);
}

export function normalizeShopping(payload) {
  return (Array.isArray(payload?.shopping) ? payload.shopping : []).flatMap((entry) => {
    const price = parsePrice(entry?.price);
    const seller = clip(entry?.source ?? entry?.seller, 60);
    const title = clip(entry?.title, 200);
    const url = sellerLink(entry?.link);
    return price !== null && seller && title ? [{ title, seller, price, ...(url ? { url } : {}) }] : [];
  }).slice(0, MAX_SHOPPING);
}

const codedError = (code) => Object.assign(new Error(code), { code });

async function readCapped(response) {
  const reader = response.body?.getReader?.();
  if (!reader) return JSON.parse(await response.text());
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) { await reader.cancel(); throw codedError('SERPER_RESPONSE_TOO_LARGE'); }
    chunks.push(value);
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
}

/**
 * One request. `kind` is "search" (1 credit) or "shopping" (2 credits).
 * @returns {Promise<object[]>} normalized rows: `{title, url, snippet, date}` for search, `{title, seller, price, url?}` for shopping
 * @throws an Error whose `code` is SERPER_API_KEY_MISSING, SERPER_HTTP_<status>, SERPER_TIMEOUT, SERPER_RESPONSE_TOO_LARGE or SERPER_REQUEST_FAILED
 */
export async function serperRequest({ kind, query }, { apiKey, fetchImpl = fetch, timeoutMs = 2500 } = {}) {
  if (!['search', 'shopping'].includes(kind) || typeof query !== 'string' || !query.trim()) throw new TypeError('invalid serper request');
  if (!apiKey) throw codedError('SERPER_API_KEY_MISSING');
  const bounded = createBoundedAbort(null, timeoutMs);
  try {
    const response = await fetchImpl(kind === 'search' ? SERPER_SEARCH_URL : SERPER_SHOPPING_URL, {
      method: 'POST', signal: bounded.signal, headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query.trim().slice(0, 200), num: 10, gl: 'us', hl: 'en' }),
    });
    if (!response.ok) throw codedError(`SERPER_HTTP_${response.status}`);
    const payload = await readCapped(response);
    return kind === 'search' ? normalizeOrganic(payload) : normalizeShopping(payload);
  } catch (error) {
    if (typeof error?.code === 'string' && error.code.startsWith('SERPER_')) throw error;
    throw codedError(bounded.signal.aborted ? 'SERPER_TIMEOUT' : 'SERPER_REQUEST_FAILED');
  } finally { bounded.cleanup(); }
}
