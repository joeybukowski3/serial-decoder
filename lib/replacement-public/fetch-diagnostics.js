/**
 * TEMPORARY diagnostic (debug/itemassist-lg-vercel-fetch): explains why original refrigerator product pages yield no evidence in
 * the Vercel runtime. Observes only; it never changes what the engine fetches or how it evaluates a page.
 *
 * Emitted fields are fixed, coarse metadata: hostname, query-free pathname, status, sizes, content type, a normalized reason and
 * an allowlisted error code. Never URLs with query strings, headers, cookies, page text, snippets or error messages.
 */

export const FETCH_DIAGNOSTIC_EVENT = 'itemassist_replacement_fetch_diagnostic';
const MAX_PATH_CHARS = 160;
const SAFE_CODE = /^[A-Z][A-Z0-9_]{1,47}$/;
const TLS_CODE = /^(?:ERR_TLS_|ERR_SSL_|CERT_|UNABLE_TO_|DEPTH_ZERO_|SELF_SIGNED_|HOSTNAME_MISMATCH)/;
const DNS_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'EAI_FAIL', 'EAI_NONAME', 'SOURCE_DNS_VALIDATION_FAILED']);
const TIMEOUT_CODES = new Set(['SOURCE_TIMEOUT', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ABORT_ERR', 'STAGE_TIMEOUT', 'UND_ERR_CONNECT_TIMEOUT']);
const NETWORK_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'EHOSTUNREACH', 'ENETUNREACH', 'ECONNABORTED', 'SOURCE_BODY_INVALID']);
const REJECTED_CODES = new Set(['UNSAFE_SOURCE_URL', 'SOURCE_CROSS_DOMAIN_REDIRECT', 'SOURCE_REDIRECT_LIMIT', 'SOURCE_TOO_LARGE', 'SOURCE_ENCODING_UNSUPPORTED', 'SOURCE_ENCODING_INVALID']);

/** Hostname (without www.) and pathname only; anything unparsable becomes null rather than raw text. */
export function safeLocation(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return { hostname: url.hostname.toLowerCase().replace(/^www\./, ''), path: url.pathname.slice(0, MAX_PATH_CHARS) };
  } catch { return { hostname: null, path: null }; }
}

/** An error code is logged only when it is a short constant-style identifier; error messages are never logged. */
export function safeErrorCode(error) {
  const candidates = [error?.code, error?.cause?.code, error?.message, error?.name === 'AbortError' ? 'ABORT_ERR' : null];
  return candidates.find((value) => typeof value === 'string' && SAFE_CODE.test(value)) || null;
}

export function classifyFetchError(code) {
  if (!code) return 'UNKNOWN';
  if (TIMEOUT_CODES.has(code)) return 'TIMEOUT';
  if (DNS_CODES.has(code)) return 'DNS_ERROR';
  if (TLS_CODE.test(code)) return 'TLS_ERROR';
  if (code === 'SOURCE_CONTENT_TYPE_UNSUPPORTED') return 'UNSUPPORTED_CONTENT_TYPE';
  if (REJECTED_CODES.has(code)) return 'FETCH_REJECTED';
  if (NETWORK_CODES.has(code)) return 'NETWORK_ERROR';
  return 'UNKNOWN';
}

function classifyStatus(status) {
  if (status === 403) return 'HTTP_403';
  if (status === 429) return 'HTTP_429';
  if (status >= 500 && status <= 599) return 'HTTP_5XX';
  return Number.isInteger(status) ? `HTTP_${status}` : 'UNKNOWN';
}

/** Wraps a page fetcher, recording safe per-call metadata. Results and errors pass through untouched. */
export function createFetchRecorder(fetchPage, now = Date.now) {
  const records = [];
  async function recordedFetch(url, options) {
    const record = { url, startedAt: now() };
    records.push(record);
    try {
      const page = await fetchPage(url, options);
      Object.assign(record, { elapsedMs: now() - record.startedAt, status: Number.isInteger(page?.status) ? page.status : null,
        contentType: typeof page?.contentType === 'string' ? page.contentType.split(';')[0].trim().slice(0, 60) : null,
        bytesRead: Number.isFinite(page?.bytesRead) ? page.bytesRead : null, textLength: String(page?.text || '').length,
        redirectCount: Number.isInteger(page?.redirectCount) ? page.redirectCount : 0, finalUrl: page?.url || null });
      return page;
    } catch (error) {
      Object.assign(record, { elapsedMs: now() - record.startedAt, errorCode: safeErrorCode(error) });
      throw error;
    }
  }
  return { fetchPage: recordedFetch, records };
}

/** One diagnostic per original-stage refrigerator fetch, joining the recorder with the engine's own fetch report. */
export function buildOriginalFetchDiagnostics({ outcome, records, requestId = null }) {
  if (outcome?.input?.category !== 'refrigerator') return [];
  const report = outcome.report || {};
  const pending = [...records];
  return (report.selectedSources || []).filter((source) => source.role === 'original').flatMap((source) => {
    const index = pending.findIndex((record) => record.url === source.url);
    if (index < 0) return [];
    const [record] = pending.splice(index, 1);
    const fetchResult = (report.fetchResults || []).find((item) => item.sourceId === source.id) || {};
    const extractionRan = Boolean(fetchResult.extraction);
    const factCount = Array.isArray(fetchResult.extractedFields) ? fetchResult.extractedFields.length : 0;
    const bodyReceived = record.textLength > 0;
    const errorCode = record.errorCode ?? null;
    const errorClass = record.status === undefined ? classifyFetchError(errorCode) : null;
    const reason = errorClass || (record.status !== 200 ? classifyStatus(record.status)
      : !bodyReceived ? 'EMPTY_BODY' : fetchResult.bound ? 'OK' : factCount ? 'EXTRACTION_UNBOUND' : 'EXTRACTION_ZERO_FACTS');
    const location = safeLocation(source.url);
    const final = record.finalUrl ? safeLocation(record.finalUrl) : null;
    const rejection = fetchResult.extraction?.rejectionReason;
    return [{ event: FETCH_DIAGNOSTIC_EVENT, requestId, stage: 'original', sourceId: source.id, hostname: location.hostname, path: location.path,
      finalPath: final && final.path !== location.path ? final.path : null, redirectCount: record.redirectCount ?? 0,
      httpStatus: record.status ?? null, outcome: fetchResult.outcome || null, reason, elapsedMs: record.elapsedMs ?? null,
      bytesRead: record.bytesRead ?? null, textLength: record.textLength ?? 0, contentType: record.contentType ?? null, bodyReceived,
      extractionRan, extractedFactCount: factCount, extractionFailure: typeof rejection === 'string' && SAFE_CODE.test(rejection) ? rejection : null,
      errorCode, errorClass, timeout: errorClass === 'TIMEOUT', blocked: ['HTTP_403', 'HTTP_429', 'FETCH_REJECTED'].includes(reason) }];
  });
}
