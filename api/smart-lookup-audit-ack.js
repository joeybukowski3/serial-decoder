import { acknowledgeDisplay, auditEnabled } from '../lib/smart-lookup/diagnostic-audit.js';
import { createRedisClient } from '../lib/smart-lookup/redis.js';

export const config = { api: { bodyParser: { sizeLimit: '16kb' } } };
const FIELDS = new Set(['auditId', 'displayedResultText', 'displayStatus', 'rendererVersion', 'rawQuery']);

export function createSmartLookupAuditAckHandler({ env = process.env, redisFactory = createRedisClient } = {}) {
  return async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();
    if (!auditEnabled(env)) return res.status(204).end();
    if (!String(req.headers?.['content-type'] || '').toLowerCase().startsWith('application/json')) return res.status(415).end();
    if (req.headers?.['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin') return res.status(403).end();
    const origin = req.headers?.origin;
    if (origin) {
      try {
        if (new URL(origin).host !== req.headers.host) return res.status(403).end();
      } catch (_) { return res.status(403).end(); }
    }
    if (Number(req.headers?.['content-length'] || 0) > 16384) return res.status(413).end();
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).some((key) => !FIELDS.has(key))
      || typeof body.auditId !== 'string' || body.auditId.length > 36
      || typeof body.displayedResultText !== 'string' || !body.displayedResultText.trim() || body.displayedResultText.length > 12000
      || typeof body.displayStatus !== 'string' || body.displayStatus.length > 20
      || typeof body.rendererVersion !== 'string' || body.rendererVersion.length > 80
      || (body.rawQuery !== undefined && (typeof body.rawQuery !== 'string' || body.rawQuery.length > 1000))) return res.status(400).end();
    let saved = false;
    try {
      const redis = redisFactory(env);
      if (redis) saved = await acknowledgeDisplay(redis, {
        id: body.auditId,
        text: body.displayedResultText,
        status: body.displayStatus,
        rendererVersion: body.rendererVersion,
        rawQuery: body.rawQuery,
      });
    } catch (_) { /* diagnostic only */ }
    return res.status(saved ? 204 : 202).end();
  };
}

export default createSmartLookupAuditAckHandler();
