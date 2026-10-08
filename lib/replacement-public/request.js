import { createHash, timingSafeEqual } from 'node:crypto';
import { MAX_FIELD_LENGTH, MAX_NOTES_LENGTH, validateRetrievalRequest } from '../replacement-discovery/live-retrieval.js';

export const MAX_BODY_BYTES = 2048;
export const MIN_TOKEN_LENGTH = 24;
const ALLOWED_KEYS = Object.freeze(['category', 'brand', 'model', 'notes']);
const REQUIRED_KEYS = Object.freeze(['category', 'brand', 'model']);

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const invalid = (status = 400) => ({ ok: false, status, errorCode: 'INVALID_REQUEST' });

/** Reads the already-parsed (or raw) request body. Never throws. */
export function readRequestBody(req) {
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

/**
 * Server-side validation, independent of whatever the calling proxy already checked. Shape and size are checked on the raw
 * strings first; the facade's own validator then enforces the support matrix and model pattern.
 */
export function validateReplacementRequest(body) {
  const keys = Object.keys(body);
  if (keys.some((key) => !ALLOWED_KEYS.includes(key)) || REQUIRED_KEYS.some((key) => !keys.includes(key))) return invalid();
  if (keys.some((key) => typeof body[key] !== 'string')) return invalid();
  if (REQUIRED_KEYS.some((key) => body[key].length > MAX_FIELD_LENGTH) || (body.notes ?? '').length > MAX_NOTES_LENGTH) return invalid();
  const checked = validateRetrievalRequest({ category: body.category, brand: body.brand, model: body.model, notes: body.notes ?? '' });
  if (!checked.ok) return { ok: false, status: checked.status === 'UNSUPPORTED' ? 422 : 400, errorCode: checked.status === 'UNSUPPORTED' ? 'UNSUPPORTED' : 'INVALID_REQUEST' };
  const { category, brand, model, notes } = checked.value;
  return { ok: true, value: { category, brand, model, notes } };
}

const digest = (value) => createHash('sha256').update(value).digest();

/**
 * Constant-time bearer check. Both sides are hashed to equal length first, so the comparison cost does not depend on how
 * much of the token matched. A missing or too-short configured token never authorizes anything.
 */
export function isAuthorized(authorizationHeader, expectedToken) {
  const provided = /^Bearer[ \t]+(\S+)$/i.exec(String(authorizationHeader || ''))?.[1] || '';
  const token = typeof expectedToken === 'string' ? expectedToken.trim() : ''; // a pasted trailing newline must not lock everyone out
  const configured = token.length >= MIN_TOKEN_LENGTH;
  const equal = timingSafeEqual(digest(provided), digest(configured ? token : ''));
  return equal && configured && provided.length > 0;
}
