import { acknowledgeDisplay, auditEnabled } from './diagnostic-audit.js';

export const DIAGNOSTIC_AUDIT_ACK_ACTION = 'diagnostic_audit_ack';
const MAX_BODY_BYTES = 16384;
const FIELDS = new Set(['action', 'auditId', 'displayedResultText', 'displayStatus', 'rendererVersion', 'rawQuery']);

// True only for a POST whose JSON body explicitly asks for the acknowledgement.
// Ordinary lookup bodies never carry `action`, so they are never matched.
export function isDiagnosticAuditAck(req) {
  const body = req?.body;
  return req?.method === 'POST'
    && Boolean(body) && typeof body === 'object' && !Array.isArray(body)
    && body.action === DIAGNOSTIC_AUDIT_ACK_ACTION;
}

function validAckBody(body) {
  return Object.keys(body).every((key) => FIELDS.has(key))
    && typeof body.auditId === 'string' && body.auditId.length <= 36
    && typeof body.displayedResultText === 'string' && Boolean(body.displayedResultText.trim()) && body.displayedResultText.length <= 12000
    && typeof body.displayStatus === 'string' && body.displayStatus.length <= 20
    && typeof body.rendererVersion === 'string' && body.rendererVersion.length <= 80
    && (body.rawQuery === undefined || (typeof body.rawQuery === 'string' && body.rawQuery.length <= 1000));
}

// Update-only display acknowledgement. Never calls a provider, the quota meter or
// route telemetry: the caller dispatches here before any lookup work starts.
export async function handleDiagnosticAuditAck(req, res, { env = process.env, getRedis } = {}) {
  if (!auditEnabled(env)) return res.status(204).end();
  if (!String(req.headers?.['content-type'] || '').toLowerCase().startsWith('application/json')) return res.status(415).end();
  if (req.headers?.['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin') return res.status(403).end();
  const origin = req.headers?.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host) return res.status(403).end();
    } catch (_) { return res.status(403).end(); }
  }
  if (Number(req.headers?.['content-length'] || 0) > MAX_BODY_BYTES) return res.status(413).end();
  const { body } = req;
  // Content-Length may be absent (chunked), so also bound the parsed body itself.
  // Applies to acknowledgements only; ordinary lookups never reach this function.
  let bodyBytes;
  try { bodyBytes = Buffer.byteLength(JSON.stringify(body), 'utf8'); } catch (_) { return res.status(400).end(); }
  if (bodyBytes > MAX_BODY_BYTES) return res.status(413).end();
  if (!validAckBody(body)) return res.status(400).end();
  let saved = false;
  try {
    const redis = getRedis();
    if (redis) saved = await acknowledgeDisplay(redis, {
      id: body.auditId,
      text: body.displayedResultText,
      status: body.displayStatus,
      rendererVersion: body.rendererVersion,
      rawQuery: body.rawQuery,
    });
  } catch (_) { /* diagnostic only */ }
  return res.status(saved ? 204 : 202).end();
}
