import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgeLookupHandler } from '../../api/age-lookup.js';
import { createRefineSerialDateHandler } from '../../api/refine-serial-date.js';
import { callGeminiSearchProvider } from '../../lib/smart-lookup/gemini-search-provider.js';
import { createAttemptRecorder, runWithAttemptRecorder } from '../../lib/smart-lookup/provider-attempts.js';
import {
  acknowledgeDisplay, attachRefinement, AUDIT_TTL_SECONDS, auditIndexKey, auditKey,
  createDiagnosticAudit, parseAuditField,
} from '../../lib/smart-lookup/diagnostic-audit.js';
import { REVIEW_COLUMNS, collectExportRows, csvCell, csvRow, exportRows } from '../../lib/smart-lookup/diagnostic-export.js';
import { diagnosticJson } from '../../lib/smart-lookup/diagnostic-projector.js';

function fakeRedis() {
  const hashes = new Map();
  const sets = new Map();
  const ttls = new Map();
  const calls = [];
  const db = {
    calls, hashes, sets, ttls,
    async set(key, value, options) { calls.push('set'); hashes.set(key, JSON.parse(value)); ttls.set(key, options.ex); return 'OK'; },
    async get(key) { const value = hashes.get(key) ?? sets.get(key); return value == null ? null : JSON.stringify(value); },
    async hgetall(key) { return hashes.get(key) || null; },
    async exists(key) { return hashes.has(key) ? 1 : 0; },
    async expire(key, seconds) { calls.push('expire'); ttls.set(key, seconds); return 1; },
    async eval(script, keys, args) {
      calls.push('eval');
      const key = keys[0];
      if (script.includes('table.insert(ids')) {
        const ids = sets.get(key) || [];
        if (!ids.includes(args[0])) ids.push(args[0]);
        sets.set(key, ids);
        ttls.set(key, Number(args[1]));
        return 1;
      }
      const record = hashes.get(key);
      if (!record) return 0;
      if (args[0] === 'display') {
        if (record.display) return 2;
        record.display = JSON.parse(args[1]);
      } else {
        record.refinements ||= [];
        if (record.refinements.length < 4) record.refinements.push(JSON.parse(args[1]));
        else record.refinementTruncated = (record.refinementTruncated || 0) + 1;
      }
      return 1;
    },
  };
  return db;
}

const ACK = 'diagnostic_audit_ack';

function response() {
  return { statusCode: 200, payload: null, status(code) { this.statusCode = code; return this; }, json(body) { this.payload = body; return this; }, end() { return this; }, setHeader() {} };
}

function ageHandler(redis, flag = '1') {
  return createAgeLookupHandler({
    env: { SMART_LOOKUP_DIAGNOSTIC_AUDIT: flag },
    auditRedis: redis,
    redisFactory: () => redis,
    logger: { info() {} },
  });
}

test('flag off writes nothing; accepted local result writes one record with no fake provider attempt', async () => {
  const redis = fakeRedis();
  const req = { method: 'POST', body: { query: '???', rawQuery: '  ???  ', notes: 'note' }, headers: {} };
  const off = response();
  await ageHandler(redis, '0')(req, off);
  assert.equal(redis.calls.length, 0);
  assert.equal(off.payload.auditId, undefined);

  const on = response();
  await ageHandler(redis)(req, on);
  assert.ok(on.payload.auditId);
  assert.equal(redis.hashes.size, 1);
  const hash = await redis.hgetall(auditKey(on.payload.auditId));
  assert.equal(parseAuditField(hash.initial).query, '  ???  ');
  assert.equal(parseAuditField(hash.initial).notes, 'note');
  assert.deepEqual(parseAuditField(hash.final).attempts, []);
  assert.equal(parseAuditField(hash.final).apiResponse.includes(on.payload.auditId), true);
  assert.equal(exportRows(on.payload.auditId, hash).review[1], 'SYSTEM_RESULT_UNAVAILABLE');
  assert.equal(redis.ttls.get(auditKey(on.payload.auditId)), AUDIT_TTL_SECONDS);
  assert.equal(redis.ttls.get(auditIndexKey(new Date().toISOString().slice(0, 10), on.payload.auditId[0])), AUDIT_TTL_SECONDS + 86400);
  const day = new Date().toISOString().slice(0, 10);
  assert.equal((await collectExportRows(redis, day)).reviewRows.length, 2);
  redis.hashes.delete(auditKey(on.payload.auditId)); // Simulate the seven-day record expiry while its index survives.
  assert.equal((await collectExportRows(redis, day)).reviewRows.length, 1);
});

test('cache hit audit records cache status without inventing a provider attempt', async () => {
  const redis = fakeRedis();
  const cached = { brand: 'Samsung', model: 'QN65Q80A', specificityLevel: 'specific', introductionYear: 2020, productionRange: { start: 2021, end: 2021 } };
  const handler = createAgeLookupHandler({
    env: { SMART_LOOKUP_DIAGNOSTIC_AUDIT: '1' },
    auditRedis: redis,
    redisFactory: () => ({ get: async (key) => String(key).startsWith('smart-age:') ? cached : null }),
    localLookup: async () => null,
    providerLookup: async () => { throw new Error('provider must not run'); },
    logger: { info() {} },
  });
  const out = response();
  await handler({ method: 'POST', body: { query: 'Samsung QN65-Q80A' }, headers: {} }, out);
  assert.equal(out.payload.cacheStatus, 'hit');
  const stored = parseAuditField((await redis.hgetall(auditKey(out.payload.auditId))).final);
  assert.equal(stored.cacheStatus, 'hit');
  assert.deepEqual(stored.attempts, []);
});

test('malformed provider output is bounded in request memory, with no ordinary raw log', async () => {
  const lines = [];
  const recorder = createAttemptRecorder({ auditEnabled: true, requestId: 'test', route: 'age', logger: { info: (line) => lines.push(line) } });
  await assert.rejects(() => runWithAttemptRecorder(recorder, () => callGeminiSearchProvider('LG TV', {
    apiKey: 'secret',
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: `BAD_JSON${'x'.repeat(20000)}` }] } }] }) }),
  })), /malformed/i);
  assert.equal(recorder.diagnostics.length, 1);
  assert.ok(recorder.diagnostics[0].rawResponse.length < 16100);
  assert.match(recorder.diagnostics[0].rawResponse, /\[TRUNCATED\]/);
  assert.ok(lines.every((line) => !line.includes('BAD_JSON')));
  const redis = fakeRedis();
  const audit = createDiagnosticAudit({ env: { SMART_LOOKUP_DIAGNOSTIC_AUDIT: '1' }, redis });
  audit.setInput('LG TV', '');
  await audit.finish({ errorCode: 'PROVIDER_MALFORMED_JSON' }, 200, recorder);
  const stored = parseAuditField((await redis.hgetall(auditKey(audit.id))).final);
  assert.match(stored.providerDiagnostics[0].rawResponse, /BAD_JSON/);
  assert.ok(stored.providerDiagnostics[0].rawResponse.length < 16100);
  recorder.captureDiagnostic({ provider: 'test', rawResponse: '{"api_key":"secret-value","authorization":"Bearer abcdefghijklmnopqrstuvwxyz"}' });
  assert.ok(recorder.diagnostics[1].rawResponse.includes('[REDACTED]'));
  assert.equal(recorder.diagnostics[1].rawResponse.includes('secret-value'), false);
  const privateAudit = createDiagnosticAudit({
    env: { SMART_LOOKUP_DIAGNOSTIC_AUDIT: '1', OPENAI_API_KEY: 'example-credential-123' }, redis,
  });
  privateAudit.setInput('model example-credential-123', '');
  assert.equal(privateAudit.initial.query.includes('example-credential-123'), false);
});

test('browser acknowledgement updates System result; concurrent refinement preserves final response', async () => {
  const redis = fakeRedis();
  const audit = createDiagnosticAudit({ env: { SMART_LOOKUP_DIAGNOSTIC_AUDIT: '1' }, redis, now: () => Date.parse('2026-10-29T12:00:00Z') });
  audit.setInput('=LG TV', 'notes');
  await audit.finish({ status: 'partial-success', bestEstimateYear: 2022 }, 200, { attempts: [], summary: () => ({}) });
  await Promise.all([
    acknowledgeDisplay(redis, { id: audit.id, text: 'LG TV: 2022', status: 'success', rendererVersion: 'v1' }),
    attachRefinement(redis, audit.id, { status: 'resolved', chosenYear: 2022 }),
  ]);
  const hash = await redis.hgetall(auditKey(audit.id));
  const row = exportRows(audit.id, hash);
  assert.equal(row.review[1], 'LG TV: 2022');
  assert.equal(row.review[4], 'success');
  assert.ok(parseAuditField(hash.final).apiResponse.includes('2022'));
  assert.equal(hash.refinements.at(-1).status, 'resolved');
  assert.ok(row.diagnostic[3].includes('2022'));
});

test('only an explicitly linked refinement attaches its result to an existing lookup', async () => {
  const redis = fakeRedis();
  const audit = createDiagnosticAudit({ env: { SMART_LOOKUP_DIAGNOSTIC_AUDIT: '1' }, redis });
  audit.setInput('Whirlpool WMH31017HS12', '');
  await audit.finish({ status: 'partial-success' }, 200, { attempts: [], summary: () => ({}) });
  const refine = createRefineSerialDateHandler({
    env: { SMART_LOOKUP_DIAGNOSTIC_AUDIT: '1' },
    redisFactory: () => redis,
    localLookup: async () => ({ evidence: [{
      type: 'local-db', title: 'Verified local evidence', quality: 'official', verified: true,
      productionStart: 2023, productionEnd: 2025, supports: 'Verified model production window.',
    }], normalization: null }),
    logger: { info() {} },
  });
  const out = response();
  await refine({ method: 'POST', headers: {}, body: {
    brand: 'Whirlpool', category: 'appliances', serial: 'TRD3481274', model: 'WMH31017HS12',
    candidateYears: [1994, 2024], decodedMonth: 'Week 48', context: '', smartLookupAuditId: audit.id,
  } }, out);
  assert.equal(out.payload.status, 'resolved');
  const attached = (await redis.hgetall(auditKey(audit.id))).refinements.at(-1);
  assert.equal(attached.triggered, true);
  assert.equal(attached.status, 'resolved');
  assert.equal(redis.hashes.size, 1);
});

test('ack action is write-only and storage failure cannot alter API response', async () => {
  const redis = fakeRedis();
  const audit = createDiagnosticAudit({ env: { SMART_LOOKUP_DIAGNOSTIC_AUDIT: '1' }, redis });
  audit.setInput('LG TV', '');
  await audit.finish({ status: 'partial-success' }, 200, { attempts: [], summary: () => ({}) });
  const ack = ageHandler(redis);
  const res = response();
  await ack({ method: 'POST', headers: { 'content-type': 'application/json', host: 'localhost' }, body: { action: ACK, auditId: audit.id, displayedResultText: 'Shown card', displayStatus: 'success', rendererVersion: 'v1' } }, res);
  assert.equal(res.statusCode, 204);
  assert.equal(exportRows(audit.id, await redis.hgetall(auditKey(audit.id))).review[1], 'Shown card');
  const rejected = response();
  await ack({ method: 'POST', headers: { 'content-type': 'application/json', host: 'localhost', origin: 'https://elsewhere.example' }, body: { action: ACK, auditId: audit.id, displayedResultText: 'Tampered', displayStatus: 'success' } }, rejected);
  assert.equal(rejected.statusCode, 403);
  assert.equal(exportRows(audit.id, await redis.hgetall(auditKey(audit.id))).review[1], 'Shown card');
  const unknown = response();
  await ack({ method: 'POST', headers: { 'content-type': 'application/json', host: 'localhost' }, body: { action: ACK, auditId: '851e61c9-9dec-401e-af85-02b6e57ca056', displayedResultText: 'No record', displayStatus: 'success', rendererVersion: 'v1' } }, unknown);
  assert.equal(unknown.statusCode, 202);
  assert.equal(redis.hashes.size, 1);

  const broken = fakeRedis();
  broken.set = async () => { throw new Error('Redis unavailable'); };
  const apiResponse = response();
  await ageHandler(broken)({ method: 'POST', body: { query: '???' }, headers: {} }, apiResponse);
  assert.equal(apiResponse.statusCode, 200);
  assert.ok(apiResponse.payload.auditId);
});

test('CSV starts with review pair and escapes formula-like values', () => {
  assert.deepEqual(REVIEW_COLUMNS.slice(0, 2), ['User search query', 'System result']);
  for (const value of ['=SUM(1,1)', '+1', '-1', '@x', '  =1']) assert.equal(csvCell(value).startsWith('"\''), true);
  assert.equal(csvRow(['a"b', 'line\nb']), '"a""b","line\nb"');
});

test('record and index use expiring atomic writes even if EXPIRE would fail', async () => {
  const redis = fakeRedis();
  redis.expire = async () => { throw new Error('EXPIRE unavailable'); };
  const audit = createDiagnosticAudit({ env: { SMART_LOOKUP_DIAGNOSTIC_AUDIT: '1' }, redis });
  audit.setInput('LG TV', '');
  await audit.finish({ status: 'partial-success' }, 200, { attempts: [], summary: () => ({}) });
  assert.equal(redis.ttls.get(auditKey(audit.id)), AUDIT_TTL_SECONDS);
  assert.equal(redis.ttls.get(auditIndexKey(audit.initial.timestamp.slice(0, 10), audit.id[0])), AUDIT_TTL_SECONDS + 86400);
  assert.equal(redis.calls.includes('expire'), false);
});

test('index retry recovers a transient failure; persistent failure leaves no permanent record', async () => {
  const redis = fakeRedis();
  const original = redis.eval;
  let failures = 1;
  redis.eval = async (...args) => { if (failures-- > 0) throw new Error('index failure'); return original(...args); };
  const audit = createDiagnosticAudit({ env: { SMART_LOOKUP_DIAGNOSTIC_AUDIT: '1' }, redis });
  audit.setInput('LG TV', '');
  await audit.finish({}, 200, { attempts: [], summary: () => ({}) });
  assert.equal((await collectExportRows(redis, audit.initial.timestamp.slice(0, 10))).reviewRows.length, 2);
  redis.sets.clear(); // A missing index cannot be fabricated by the exporter.
  assert.equal((await collectExportRows(redis, audit.initial.timestamp.slice(0, 10))).reviewRows.length, 1);
  assert.equal(redis.ttls.get(auditKey(audit.id)), AUDIT_TTL_SECONDS);
});

test('ack and refinement never recreate expired records or refresh their TTL', async () => {
  const redis = fakeRedis();
  const audit = createDiagnosticAudit({ env: { SMART_LOOKUP_DIAGNOSTIC_AUDIT: '1' }, redis });
  audit.setInput('LG TV', '');
  await audit.finish({}, 200, { attempts: [], summary: () => ({}) });
  const key = auditKey(audit.id);
  const before = redis.ttls.get(key);
  assert.equal(await acknowledgeDisplay(redis, { id: audit.id, text: 'Displayed', status: 'success', rendererVersion: 'v1' }), true);
  assert.equal(await attachRefinement(redis, audit.id, { status: 'resolved' }), true);
  assert.equal(redis.ttls.get(key), before);
  redis.hashes.delete(key);
  assert.equal(await acknowledgeDisplay(redis, { id: audit.id, text: 'Late', status: 'success', rendererVersion: 'v1' }), false);
  assert.equal(await attachRefinement(redis, audit.id, { status: 'late' }), false);
  assert.equal(redis.hashes.has(key), false);
});

test('first nonempty display wins; oversized and extra acknowledgement fields are rejected', async () => {
  const redis = fakeRedis();
  const audit = createDiagnosticAudit({ env: { SMART_LOOKUP_DIAGNOSTIC_AUDIT: '1' }, redis });
  await audit.finish({}, 200, { attempts: [], summary: () => ({}) });
  const ack = ageHandler(redis);
  const send = async (body, headers = {}) => {
    const out = response();
    await ack({ method: 'POST', headers: { 'content-type': 'application/json', host: 'localhost', ...headers }, body }, out);
    return out.statusCode;
  };
  const body = { action: ACK, auditId: audit.id, displayedResultText: 'Visible', displayStatus: 'success', rendererVersion: 'v1', rawQuery: '  LG TV  ' };
  assert.equal(await send({ ...body, displayedResultText: '  ' }), 400);
  assert.equal(await send(body, { 'content-length': '20000' }), 413);
  assert.equal(await send({ ...body, secret: 'x' }), 400);
  assert.equal(await send(body), 204);
  assert.equal(await send({ ...body, displayedResultText: 'Replacement' }), 204);
  const stored = await redis.hgetall(auditKey(audit.id));
  assert.equal(stored.display.text, 'Visible');
  assert.equal(stored.display.rawQuery, '  LG TV  ');
});

test('projection bounds nested objects without calling toJSON or serializing all keys', () => {
  const giant = { text: 'x'.repeat(1000000), children: Array.from({ length: 100000 }, () => ({ password: 'secret' })), toJSON() { throw new Error('must not run'); } };
  const output = diagnosticJson(giant, 16000);
  assert.ok(output.length < 16100);
  assert.match(output, /TRUNCATED/);
  assert.equal(output.includes('must not run'), false);
});

test('malformed non-JSON provider body is retained within the diagnostic limit', async () => {
  const recorder = createAttemptRecorder({ auditEnabled: true, requestId: 'test', route: 'age', logger: { info() {} } });
  await assert.rejects(() => runWithAttemptRecorder(recorder, () => callGeminiSearchProvider('LG TV', {
    apiKey: 'secret', fetchImpl: async () => new Response(`INVALID_JSON${'x'.repeat(20000)}`, { status: 200 }),
  })));
  assert.match(recorder.diagnostics[0].rawResponse, /INVALID_JSON/);
  assert.ok(recorder.diagnostics[0].rawResponse.length < 16100);
});

test('later provider diagnostics remain visible with an explicit overflow count', () => {
  const recorder = createAttemptRecorder({ auditEnabled: true });
  for (let index = 0; index < 7; index += 1) recorder.captureDiagnostic({ provider: `provider-${index}`, rawResponse: String(index) });
  assert.equal(recorder.diagnostics[0].provider, 'provider-0');
  assert.equal(recorder.diagnostics[3].provider, 'provider-6');
  assert.deepEqual(recorder.diagnostics.at(-1), { provider: 'TRUNCATED_ATTEMPTS', omittedCount: 3 });
});

test('audit setup exception does not change the lookup response', async () => {
  const dependencies = {
    env: { SMART_LOOKUP_DIAGNOSTIC_AUDIT: '1' },
    redisFactory: () => null,
    logger: { info() {} },
  };
  Object.defineProperty(dependencies, 'auditRedis', { get() { throw new Error('audit setup failed'); } });
  const output = response();
  await createAgeLookupHandler(dependencies)({ method: 'POST', body: { query: '???' }, headers: {} }, output);
  assert.equal(output.statusCode, 200);
  assert.equal(output.payload.auditId, undefined);
});

test('provider HTTP error body is never copied into diagnostics', async () => {
  const recorder = createAttemptRecorder({ auditEnabled: true, requestId: 'test', route: 'age', logger: { info() {} } });
  await assert.rejects(() => runWithAttemptRecorder(recorder, () => callGeminiSearchProvider('LG TV', {
    apiKey: 'secret', fetchImpl: async () => new Response('private provider error body', { status: 500 }),
  })));
  assert.equal(recorder.diagnostics.some((item) => item.rawResponse?.includes('private provider error body')), false);
});

test('persistent index failure leaves a seven-day record but no invented export row', async () => {
  const redis = fakeRedis();
  redis.eval = async () => { throw new Error('index unavailable'); };
  const audit = createDiagnosticAudit({ env: { SMART_LOOKUP_DIAGNOSTIC_AUDIT: '1' }, redis });
  audit.setInput('LG TV', '');
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (message) => warnings.push(message);
  try { assert.equal(await audit.finish({}, 200, { attempts: [], summary: () => ({}) }), false); }
  finally { console.warn = originalWarn; }
  assert.equal(redis.ttls.get(auditKey(audit.id)), AUDIT_TTL_SECONDS);
  assert.equal((await collectExportRows(redis, audit.initial.timestamp.slice(0, 10))).reviewRows.length, 1);
  assert.deepEqual(warnings, ['smart_lookup_diagnostic_index_write_failed']);
});

test('refinement attempts are capped with a visible count and bounded server IDs', async () => {
  const redis = fakeRedis();
  const audit = createDiagnosticAudit({ env: { SMART_LOOKUP_DIAGNOSTIC_AUDIT: '1' }, redis });
  await audit.finish({}, 200, { attempts: [], summary: () => ({}) });
  for (let index = 0; index < 6; index += 1) {
    assert.equal(await attachRefinement(redis, audit.id, { status: `attempt-${index}` }, [], 'x'.repeat(1000)), true);
  }
  const stored = await redis.hgetall(auditKey(audit.id));
  assert.equal(stored.refinements.length, 4);
  assert.equal(stored.refinementTruncated, 2);
  assert.ok(stored.refinements[0].requestId.length < 100);
  assert.match(exportRows(audit.id, stored).review[27], /TRUNCATED 2 ATTEMPTS/);
});

test('ack action through /api/age-lookup never runs lookup, provider, quota or telemetry work', async () => {
  const redis = fakeRedis();
  const audit = createDiagnosticAudit({ env: { SMART_LOOKUP_DIAGNOSTIC_AUDIT: '1' }, redis });
  await audit.finish({}, 200, { attempts: [], summary: () => ({}) });
  const forbidden = [];
  const trap = (name) => async () => { forbidden.push(name); throw new Error(`${name} must not run`); };
  const handler = createAgeLookupHandler({
    env: { SMART_LOOKUP_DIAGNOSTIC_AUDIT: '1' },
    auditRedis: redis,
    redisFactory: () => redis,
    localLookup: trap('localLookup'),
    providerLookup: trap('providerLookup'),
    groqOnlyLookup: trap('groqOnlyLookup'),
    recordProviderUsage: trap('recordProviderUsage'),
    recordProviderAttemptMetrics: trap('recordProviderAttemptMetrics'),
    reserveProviderBudget: trap('reserveProviderBudget'),
    quotaMeter: { createSession() { forbidden.push('quotaMeter'); throw new Error('quota must not run'); } },
    logger: { info(line) { forbidden.push(`log:${line}`); } },
  });
  const res = response();
  await handler({ method: 'POST', headers: { 'content-type': 'application/json', host: 'localhost' }, body: {
    action: ACK, auditId: audit.id, displayedResultText: 'Shown', displayStatus: 'success', rendererVersion: 'v1',
  } }, res);
  assert.equal(res.statusCode, 204);
  assert.equal(res.payload, null);
  assert.deepEqual(forbidden, []);
  assert.equal(redis.hashes.get(auditKey(audit.id)).display.text, 'Shown');
  assert.equal(redis.hashes.size, 1);
});

test('ack action respects the flag, method, content type and body validation', async () => {
  const redis = fakeRedis();
  const audit = createDiagnosticAudit({ env: { SMART_LOOKUP_DIAGNOSTIC_AUDIT: '1' }, redis });
  await audit.finish({}, 200, { attempts: [], summary: () => ({}) });
  const valid = { action: ACK, auditId: audit.id, displayedResultText: 'Shown', displayStatus: 'success', rendererVersion: 'v1' };
  const headers = { 'content-type': 'application/json', host: 'localhost' };
  const send = async (handler, req) => { const out = response(); await handler(req, out); return out.statusCode; };

  assert.equal(await send(ageHandler(redis, '0'), { method: 'POST', headers, body: valid }), 204);
  assert.equal(redis.hashes.get(auditKey(audit.id)).display, undefined);
  assert.equal(await send(ageHandler(redis), { method: 'POST', headers: { host: 'localhost' }, body: valid }), 415);
  assert.equal(await send(ageHandler(redis), { method: 'POST', headers: { ...headers, 'sec-fetch-site': 'cross-site' }, body: valid }), 403);
  assert.equal(await send(ageHandler(redis), { method: 'POST', headers, body: { ...valid, auditId: 'x'.repeat(37) } }), 400);
  assert.equal(await send(ageHandler(redis), { method: 'POST', headers, body: { ...valid, displayedResultText: 'x'.repeat(12001) } }), 400);
  assert.equal(await send(ageHandler(redis), { method: 'POST', headers, body: { ...valid, rawQuery: 'x'.repeat(1001) } }), 400);
  assert.equal(await send(ageHandler(redis), { method: 'POST', headers, body: { ...valid, displayStatus: 5 } }), 400);
  assert.equal(await send(ageHandler(redis), { method: 'GET', headers, body: valid }), 405);
  assert.equal(redis.hashes.get(auditKey(audit.id)).display, undefined);
  assert.equal(await send(ageHandler(redis), { method: 'POST', headers, body: valid }), 204);
  assert.equal(redis.hashes.get(auditKey(audit.id)).display.text, 'Shown');
});

test('ack action preserves the record TTL and never recreates an expired record', async () => {
  const redis = fakeRedis();
  const audit = createDiagnosticAudit({ env: { SMART_LOOKUP_DIAGNOSTIC_AUDIT: '1' }, redis });
  await audit.finish({}, 200, { attempts: [], summary: () => ({}) });
  const key = auditKey(audit.id);
  const before = redis.ttls.get(key);
  const headers = { 'content-type': 'application/json', host: 'localhost' };
  const body = { action: ACK, auditId: audit.id, displayedResultText: 'Shown', displayStatus: 'success', rendererVersion: 'v1' };
  const first = response();
  await ageHandler(redis)({ method: 'POST', headers, body }, first);
  assert.equal(first.statusCode, 204);
  assert.equal(redis.ttls.get(key), before);
  redis.hashes.delete(key);
  const late = response();
  await ageHandler(redis)({ method: 'POST', headers, body: { ...body, displayedResultText: 'Late' } }, late);
  assert.equal(late.statusCode, 202);
  assert.equal(redis.hashes.has(key), false);
});

test('ordinary lookup bodies without an action keep their behavior and audit linkage', async () => {
  const redis = fakeRedis();
  const out = response();
  await ageHandler(redis)({ method: 'POST', body: { query: '???', rawQuery: '???' }, headers: {} }, out);
  assert.equal(out.statusCode, 200);
  assert.ok(out.payload.auditId);
  assert.equal(redis.hashes.size, 1);
  const off = response();
  await ageHandler(redis, '0')({ method: 'POST', body: { query: '???' }, headers: {} }, off);
  assert.equal(off.statusCode, 200);
  assert.equal(off.payload.auditId, undefined);
});

test('ack body size is bounded with or without Content-Length; ordinary lookups are not', async () => {
  const redis = fakeRedis();
  const audit = createDiagnosticAudit({ env: { SMART_LOOKUP_DIAGNOSTIC_AUDIT: '1' }, redis });
  await audit.finish({}, 200, { attempts: [], summary: () => ({}) });
  const headers = { 'content-type': 'application/json', host: 'localhost' };
  const valid = { action: ACK, auditId: audit.id, displayedResultText: 'Shown', displayStatus: 'success', rendererVersion: 'v1' };
  const send = async (req) => { const out = response(); await ageHandler(redis)(req, out); return out; };
  const oversized = { ...valid, padding: 'x'.repeat(17000) };

  assert.equal((await send({ method: 'POST', headers: { ...headers, 'content-length': '20000' }, body: valid })).statusCode, 413);
  assert.equal((await send({ method: 'POST', headers, body: oversized })).statusCode, 413);
  // Multi-byte characters count as UTF-8 bytes, not string length.
  assert.equal((await send({ method: 'POST', headers, body: { ...valid, displayedResultText: '€'.repeat(6000) } })).statusCode, 413);
  assert.equal(redis.hashes.get(auditKey(audit.id)).display, undefined);

  const lookup = await send({ method: 'POST', headers: {}, body: { query: '???', padding: 'x'.repeat(17000) } });
  assert.equal(lookup.statusCode, 200);
  assert.ok(lookup.payload.auditId);

  assert.equal((await send({ method: 'POST', headers, body: valid })).statusCode, 204);
  assert.equal(redis.hashes.get(auditKey(audit.id)).display.text, 'Shown');
});
