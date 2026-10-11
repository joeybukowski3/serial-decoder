import { createBoundedAbort } from '../../serial-refinement/bounded-abort.js';
import { SERPER_ENDPOINT } from '../../serper/model-search.js';

const MAX_RESULTS = 10;
const MAX_BYTES = 256_000;

export function normalizeSearchResults(organic, limit = MAX_RESULTS) {
  const seen = new Set();
  return (Array.isArray(organic) ? organic : []).flatMap((entry, index) => {
    let url;
    try {
      url = new URL(entry?.link);
      if (url.protocol !== 'https:' || url.username || url.password || url.port) return [];
      url.hash = '';
    } catch { return []; }
    const key = url.href.replace(/\/$/, '').toLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ title: String(entry.title || '').slice(0, 240), url: url.href,
      domain: url.hostname.toLowerCase().replace(/^www\./, ''), snippet: String(entry.snippet || '').slice(0, 500),
      providerRank: Number.isInteger(entry.position) && entry.position > 0 ? entry.position : index + 1,
      sourceProvider: 'serper' }];
  }).slice(0, Math.max(1, Math.min(MAX_RESULTS, limit)));
}

const MAX_DIAGNOSTIC_TEXT = 200;

function boundedText(value, apiKey) {
  const text = String(value ?? '');
  return (apiKey ? text.split(apiKey).join('[redacted]') : text).slice(0, MAX_DIAGNOSTIC_TEXT);
}

/** Bounded, secret-free description of a failed request. Raw DOMException codes (AbortError is the number 20) never become the report code. */
function describeSearchFailure(error, { apiKey, timeoutMs, aborted, startedAt }) {
  const cause = error?.cause?.code;
  return { errorName: boundedText(error?.name, apiKey), errorMessage: boundedText(error?.message, apiKey),
    errorCode: typeof error?.code === 'string' || typeof error?.code === 'number' ? error.code : null,
    causeCode: typeof cause === 'string' || typeof cause === 'number' ? cause : null,
    timeoutMs, aborted, elapsedMs: Date.now() - startedAt };
}

/** One explicit Serper request. The caller owns the aggregate three-request budget. */
export async function searchProducts({ query, purpose, limit = MAX_RESULTS }, { apiKey = process.env.SERPER_API_KEY, fetchImpl = fetch, timeoutMs = 4000 } = {}) {
  if (!['original', 'candidate'].includes(purpose) || typeof query !== 'string' || !query.trim()) throw new TypeError('invalid search request');
  if (!apiKey) throw Object.assign(new Error('SERPER_API_KEY_MISSING'), { code: 'SERPER_API_KEY_MISSING' });
  const bounded = createBoundedAbort(null, timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetchImpl(SERPER_ENDPOINT, { method: 'POST', signal: bounded.signal,
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, num: Math.min(MAX_RESULTS, Math.max(1, limit)), gl: 'us', hl: 'en' }) });
    if (!response.ok) throw Object.assign(new Error(`SERPER_HTTP_${response.status}`), { code: 'WEB_RETRIEVAL_UNAVAILABLE' });
    const reader = response.body.getReader();
    const chunks = []; let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) { await reader.cancel(); throw Object.assign(new Error('SERPER_RESPONSE_TOO_LARGE'), { code: 'WEB_RETRIEVAL_UNAVAILABLE' }); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return normalizeSearchResults(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))?.organic, limit);
  } catch (error) {
    const aborted = bounded.signal.aborted;
    const diagnostics = describeSearchFailure(error, { apiKey, timeoutMs, aborted, startedAt });
    const code = typeof error?.code === 'string' ? error.code : aborted ? 'SERPER_TIMEOUT' : 'SERPER_REQUEST_FAILED';
    throw Object.assign(new Error(typeof error?.message === 'string' ? boundedText(error.message, apiKey) : code), { code, diagnostics, cause: error });
  } finally { bounded.cleanup(); }
}
