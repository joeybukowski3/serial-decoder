import { MAX_QUERY_CHARS, cleanQuery } from '../replacement-quick/quick-prompt.js';

/**
 * Request intake for ItemAssist Research. The body is exactly `{ query: string }`: any other key is refused, so nothing a caller
 * sends can select a fixture, a model, a timeout or a budget behaviour. Authentication reuses isAuthorized from the v1 request module.
 */

export { isAuthorized } from '../replacement-public/request.js';

// `{"query":"…160 chars…"}` is ~175 bytes; multi-byte text can reach ~4x. 1 KiB leaves headroom and is far below the v1 2 KiB limit.
export const MAX_BODY_BYTES = 1024;

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const invalid = (status = 400) => ({ ok: false, status, errorCode: 'INVALID_REQUEST' });

/** Reads the already-parsed (or raw) request body. Never throws. */
export function readResearchBody(req) {
  const declared = Number(req.headers?.['content-length']);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return invalid(413);
  let body;
  try { body = req.body; } catch { return invalid(); } // the platform's lazy body getter throws on malformed JSON
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) return invalid(413);
    try { body = JSON.parse(body); } catch { return invalid(); }
  }
  if (!isPlainObject(body)) return invalid();
  if (Buffer.byteLength(JSON.stringify(body)) > MAX_BODY_BYTES) return invalid(413);
  return { ok: true, value: body };
}

/** The cleaned single-line query (max MAX_QUERY_CHARS), or a fixed invalid-request result. */
export function validateResearchRequest(body) {
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== 'query' || typeof body.query !== 'string') return invalid();
  const query = cleanQuery(body.query);
  return query ? { ok: true, value: { query } } : invalid();
}

export { MAX_QUERY_CHARS };
