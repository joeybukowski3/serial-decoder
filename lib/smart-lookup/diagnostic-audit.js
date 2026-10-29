import { randomUUID } from 'node:crypto';
import { classifySmartOutcome } from './outcome.js';
import { createRedisClient } from './redis.js';
import { addCosts, EMPTY_COST, estimateUsageCost, loadCostConfig } from './cost-estimate.js';
import { redactDiagnosticSecrets } from './diagnostic-privacy.js';
import { diagnosticJson } from './diagnostic-projector.js';

export const AUDIT_TTL_SECONDS = 7 * 24 * 60 * 60;
export const AUDIT_PREFIX = 'smart-lookup-diagnostic:v1:';
export const AUDIT_INDEX_TTL_SECONDS = AUDIT_TTL_SECONDS + 86400;
const WRITE_LIMIT_MS = 150;
const RAW_LIMIT = 16000;
const JSON_LIMIT = 64000;

export function auditEnabled(env = process.env) {
  return env.SMART_LOOKUP_DIAGNOSTIC_AUDIT === '1';
}

export function auditKey(id) { return `${AUDIT_PREFIX}record:${id}`; }
export function auditIndexKey(day, shard) { return `${AUDIT_PREFIX}day:${day}:${shard}`; }
export function validAuditId(id) { return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id); }

export function boundedText(value, max = RAW_LIMIT, env = process.env) {
  const raw = String(value ?? '');
  const text = redactDiagnosticSecrets(raw.slice(0, max + 1), env);
  return raw.length > max || text.length > max ? `${text.slice(0, max)} [TRUNCATED]` : text;
}

export function boundedJson(value, max = JSON_LIMIT, env = process.env) { return diagnosticJson(value, max, env); }

export function parseAuditField(value) {
  if (value == null) return null;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (_) { return null; }
}

export function estimateAuditCost(attempts, env = process.env) {
  const config = loadCostConfig(env);
  return attempts.reduce((total, attempt) => addCosts(total, estimateUsageCost(config, attempt.provider, attempt.model, {
    inputTokens: attempt.inputTokens || 0,
    outputTokens: attempt.outputTokens || 0,
    thinkingTokens: attempt.thinkingTokens || 0,
    groundedBillable: attempt.grounded && attempt.inputTokens != null ? 1 : 0,
    searchQueries: attempt.searchQueryCount || 0,
  })), EMPTY_COST).total;
}

export function auditYearRange(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const range = (value) => {
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (!value || typeof value !== 'object') return null;
    const start = value.startYear ?? value.start ?? value.from ?? value.value;
    const end = value.endYear ?? value.end ?? value.to;
    return start != null && end != null ? `${start}–${end}` : start != null ? String(start) : null;
  };
  const parts = [];
  const unit = payload.individualManufactureYear ?? payload.manufactureYear;
  if (unit != null) parts.push(`Unit: ${unit}`);
  if (Array.isArray(payload.manufactureYearCandidates) && payload.manufactureYearCandidates.length) {
    parts.push(`Candidates: ${payload.manufactureYearCandidates.slice(0, 10).join('/')}`);
  }
  const production = range(payload.productionRange || payload.yearRange);
  if (production) parts.push(`Production: ${production}`);
  const estimated = range(payload.estimatedRange) || (payload.bestEstimateYear != null ? String(payload.bestEstimateYear) : null)
    || (payload.estimatedYear != null ? String(payload.estimatedYear) : null);
  if (estimated) parts.push(`Estimate: ${estimated}`);
  const context = range(payload.yearContext);
  if (context && !parts.length) parts.push(`Context: ${context}`);
  if (payload.introductionYear != null && !parts.length) parts.push(`Introduced: ${payload.introductionYear}`);
  return parts.length ? boundedText(parts.join('; '), 500) : null;
}

async function bounded(work, maxMs = WRITE_LIMIT_MS) {
  let timer;
  try {
    return await Promise.race([work, new Promise((resolve) => { timer = setTimeout(() => resolve(false), maxMs); })]);
  } catch (_) { return false; }
  finally { clearTimeout(timer); work.catch(() => {}); }
}

async function writeRecord(redis, id, fields, timestamp) {
  const key = auditKey(id);
  const day = timestamp.slice(0, 10);
  const indexScript = `
    local current = redis.call('GET', KEYS[1])
    local ids = current and cjson.decode(current) or {}
    for _, member in ipairs(ids) do if member == ARGV[1] then return 1 end end
    if #ids >= 2000 then return 0 end
    table.insert(ids, ARGV[1])
    redis.call('SET', KEYS[1], cjson.encode(ids), 'EX', ARGV[2])
    return 1
  `;
  const work = (async () => {
    // SET EX is one Redis command: neither a record nor an index can be left
    // without expiry by a failed follow-up EXPIRE command.
    await redis.set(key, JSON.stringify(fields), { ex: AUDIT_TTL_SECONDS });
    const indexKey = auditIndexKey(day, id[0]);
    try {
      if (await redis.eval(indexScript, [indexKey], [id, String(AUDIT_INDEX_TTL_SECONDS)]) !== 1) throw new Error('index full');
    }
    catch (_) {
      // A bounded retry recovers transient index failures; the record still expires.
      try {
        if (await redis.eval(indexScript, [indexKey], [id, String(AUDIT_INDEX_TTL_SECONDS)]) !== 1) throw new Error('index full');
      } catch (_) { console.warn('smart_lookup_diagnostic_index_write_failed'); return false; }
    }
    return true;
  })();
  return bounded(work);
}

const UPDATE_SCRIPT = `
  local current = redis.call('GET', KEYS[1])
  if not current then return 0 end
  local record = cjson.decode(current)
  local value = cjson.decode(ARGV[2])
  if ARGV[1] == 'display' then
    if record.display then return 2 end
    record.display = value
  elseif ARGV[1] == 'refinement' then
    record.refinements = record.refinements or {}
    if #record.refinements < 4 then table.insert(record.refinements, value)
    else record.refinementTruncated = (record.refinementTruncated or 0) + 1 end
  else return 0 end
  redis.call('SET', KEYS[1], cjson.encode(record), 'KEEPTTL')
  return 1
`;

export function createDiagnosticAudit({ env = process.env, redisFactory = createRedisClient, redis = null, now = Date.now } = {}) {
  if (!auditEnabled(env)) return null;
  const id = randomUUID();
  const timestamp = new Date(now()).toISOString();
  const initial = { timestamp, query: '', displayStatus: 'DISPLAY_UNCONFIRMED' };
  let client = redis;
  const getRedis = () => { try { return client || (client = redisFactory(env)); } catch (_) { return null; } };
  return {
    id,
    initial,
    setInput(query, notes) {
      try { initial.query = boundedText(query, 1000, env); initial.notes = boundedText(notes, 1000, env); } catch (_) { /* diagnostic only */ }
    },
    setClassification(info, route) {
      try { Object.assign(initial, {
        normalizedQuery: boundedText(info?.normalizedQuery, 200, env),
        brand: boundedText(info?.brand || info?.recognizedBrand, 120, env),
        category: boundedText(info?.genericCategory || info?.productType, 120, env),
        model: boundedText(info?.modelIdentity || info?.model, 160, env),
        modelCompleteness: info?.modelCompleteness || null,
        querySpecificity: info?.querySpecificity || null,
        routeSelected: route?.mode || null,
        routeReasons: Array.isArray(route?.reasons) ? route.reasons.slice(0, 20).map((reason) => boundedText(reason, 120, env)) : [],
      }); } catch (_) { /* diagnostic only */ }
    },
    async finish(payload, statusCode, recorder) {
      const store = getRedis();
      if (!store) return false;
      const outcome = payload && !payload.error ? classifySmartOutcome(payload) : null;
      const attempts = recorder?.attempts || [];
      const summary = recorder?.summary?.() || {};
      const provider = attempts.at(-1)?.provider || (payload?.providerAttempted ? payload?.source : null);
      const final = {
        apiResponse: boundedJson(payload && typeof payload === 'object' ? { auditId: id, ...payload } : payload, JSON_LIMIT, env),
        httpStatus: statusCode,
        resultStatus: outcome?.resultStatus || (statusCode >= 400 ? 'error' : null),
        outcomeReason: outcome?.outcomeReason || payload?.errorCode || null,
        errorCode: payload?.errorCode || payload?.providerErrorCode || null,
        cacheStatus: payload?.cacheStatus || null,
        provider: provider || null,
        providerModel: provider ? (payload?.providerModel || attempts.at(-1)?.model || null) : null,
        providerOutcome: attempts.at(-1)?.providerStatus || null,
        providerHttpStatus: attempts.at(-1)?.httpStatus || null,
        yearRange: auditYearRange(payload),
        sources: boundedJson(payload?.sources || payload?.groundedSources || payload?.citations
          || (Array.isArray(payload?.evidence) ? payload.evidence.slice(0, 32).map((item) => item?.sourceUrl || item?.url).filter(Boolean) : []), 8000, env),
        searchQueryCount: summary.searchQueryCount ?? null,
        inputTokens: summary.inputTokens ?? null,
        outputTokens: summary.outputTokens ?? null,
        estimatedCost: estimateAuditCost(attempts, env),
        attempts: attempts.map(({ provider, model, providerStatus, httpStatus, searchQueryCount, inputTokens, outputTokens, grounded, inferred }) => ({ provider, model, providerStatus, httpStatus, searchQueryCount, inputTokens, outputTokens, grounded, inferred })),
        providerDiagnostics: recorder?.diagnostics || [],
      };
      return writeRecord(store, id, { initial, final }, timestamp);
    },
  };
}

export async function acknowledgeDisplay(redis, { id, text, status, rendererVersion, rawQuery }) {
  if (!validAuditId(id) || !['success', 'needs-detail', 'error'].includes(status) || typeof text !== 'string' || !text.trim()) return false;
  const key = auditKey(id);
  const display = { text: boundedText(text, 12000), status, rendererVersion: boundedText(rendererVersion, 80), rawQuery: boundedText(rawQuery, 1000), at: new Date().toISOString() };
  const work = (async () => {
    // A completion can race the final write after the API response is sent.
    for (let n = 0; n < 2; n += 1) {
      const updated = await redis.eval(UPDATE_SCRIPT, [key], ['display', JSON.stringify(display)]);
      if (updated === 1 || updated === 2) return true;
      if (n === 0) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return false;
  })();
  return bounded(work, 150);
}

export async function attachRefinement(redis, id, response, diagnostics = [], refinementRequestId = null) {
  if (!validAuditId(id)) return false;
  const key = auditKey(id);
  const work = (async () => {
    return await redis.eval(UPDATE_SCRIPT, [key], ['refinement', JSON.stringify({
      triggered: true, result: boundedJson(response), status: boundedText(response?.status, 80) || null,
      providerResult: boundedJson(diagnostics, RAW_LIMIT),
      requestId: boundedText(refinementRequestId, 80),
    })]) === 1;
  })();
  return bounded(work);
}
