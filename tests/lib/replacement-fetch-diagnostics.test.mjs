import test from 'node:test';
import assert from 'node:assert/strict';
import { ENV, TOKEN, buildHandler, createLogger, createReq, fridgeProviders, invoke, requestBody, result } from '../helpers/replacement-public-fixtures.mjs';
import { FETCH_DIAGNOSTIC_EVENT, classifyFetchError, createFetchRecorder, safeErrorCode, safeLocation } from '../../lib/replacement-public/fetch-diagnostics.js';

/** TEMPORARY diagnostics for original LG refrigerator fetches: safe metadata only, observation only. */

const ORIGINAL_URL = 'https://www.lg.com/us/refrigerators/lg-lf25h6200s-french-3-door-refrigerator?srsltid=SECRETQUERY123&token=abc';
const BODY_MARKER = 'PAGE-BODY-MARKER-should-never-be-logged';
const fridgeReq = () => createReq({ body: requestBody({ category: 'refrigerator', brand: 'LG', model: 'LF25H6200S' }) });

function run({ fetchPage, env = ENV }) {
  const providers = fridgeProviders();
  const search = async (request) => (request.purpose === 'original' ? [result('LG LF25H6200S refrigerator', ORIGINAL_URL)] : providers.deps.search(request));
  const logger = createLogger();
  const { handler } = buildHandler({ env, logger, providers: { ...providers, deps: { ...providers.deps, search, fetchPage } } });
  return invoke(handler, fridgeReq()).then((res) => ({ res, logger,
    diagnostics: logger.lines.map((line) => JSON.parse(line)).filter((entry) => entry.event === FETCH_DIAGNOSTIC_EVENT) }));
}

const assertSafe = (logger) => {
  const logged = logger.lines.join('\n');
  for (const secret of ['SECRETQUERY123', 'srsltid', 'token=abc', '?', TOKEN, ENV.SERPER_API_KEY, BODY_MARKER, 'authorization', 'cookie'])
    assert.equal(logged.includes(secret), false, `logged ${secret}`);
};

test('an HTTP 403 original fetch logs safe metadata with hostname and query-free path only', async () => {
  const { diagnostics, logger } = await run({ fetchPage: async () => ({ status: 403, contentType: 'text/html; charset=utf-8', text: '', headers: { 'set-cookie': 'cookie=x' } }) });
  assert.ok(diagnostics.length >= 1);
  const [first] = diagnostics;
  assert.deepEqual(Object.keys(first).sort(), ['blocked', 'bodyReceived', 'bytesRead', 'contentType', 'elapsedMs', 'errorClass', 'errorCode', 'event',
    'extractedFactCount', 'extractionFailure', 'extractionRan', 'finalPath', 'hostname', 'httpStatus', 'outcome', 'path', 'reason', 'redirectCount',
    'requestId', 'sourceId', 'stage', 'textLength', 'timeout'].sort());
  assert.equal(first.stage, 'original');
  assert.equal(first.hostname, 'lg.com');
  assert.equal(first.path, '/us/refrigerators/lg-lf25h6200s-french-3-door-refrigerator');
  assert.equal(first.httpStatus, 403);
  assert.equal(first.reason, 'HTTP_403');
  assert.equal(first.blocked, true);
  assert.equal(first.contentType, 'text/html');
  assert.equal(first.extractionRan, false);
  assert.equal(typeof first.requestId, 'string');
  assertSafe(logger);
});

test('network failures map to coarse reasons and never log the error message', async () => {
  const cases = [['ECONNRESET', 'NETWORK_ERROR'], ['SOURCE_TIMEOUT', 'TIMEOUT'], ['ENOTFOUND', 'DNS_ERROR'], ['CERT_HAS_EXPIRED', 'TLS_ERROR']];
  for (const [code, reason] of cases) {
    const fetchPage = async () => { throw Object.assign(new Error(`failed ${BODY_MARKER} ${ORIGINAL_URL}`), { code }); };
    const { diagnostics, logger } = await run({ fetchPage });
    assert.equal(diagnostics[0].reason, reason, code);
    assert.equal(diagnostics[0].errorCode, code);
    assert.equal(diagnostics[0].httpStatus, null);
    assert.equal(diagnostics[0].timeout, reason === 'TIMEOUT');
    assertSafe(logger);
  }
  assert.equal(classifyFetchError('SOURCE_DNS_VALIDATION_FAILED'), 'DNS_ERROR');
  assert.equal(classifyFetchError('SOURCE_CONTENT_TYPE_UNSUPPORTED'), 'UNSUPPORTED_CONTENT_TYPE');
  assert.equal(classifyFetchError('SOURCE_CROSS_DOMAIN_REDIRECT'), 'FETCH_REJECTED');
  assert.equal(classifyFetchError(null), 'UNKNOWN');
  assert.equal(safeErrorCode(new Error('free text with spaces')), null);
  assert.equal(safeErrorCode(Object.assign(new Error('x'), { name: 'AbortError' })), 'ABORT_ERR');
});

test('a fetched page that yields zero facts is distinguishable from a network failure', async () => {
  const shell = `<html><title>LG Appliances</title><body>${BODY_MARKER}</body></html>`;
  const { diagnostics, logger } = await run({ fetchPage: async () => ({ status: 200, contentType: 'text/html', bytesRead: shell.length, text: shell }) });
  const [first] = diagnostics;
  assert.equal(first.reason, 'EXTRACTION_ZERO_FACTS');
  assert.equal(first.httpStatus, 200);
  assert.equal(first.bodyReceived, true);
  assert.equal(first.extractionRan, true);
  assert.equal(first.extractedFactCount, 0);
  assert.equal(first.extractionFailure, 'HEADING_MODEL_MISSING');
  assert.equal(first.errorCode, null);
  assert.equal(first.outcome, 'SOURCE_EXTRACTION_FAILED');
  assertSafe(logger);
});

test('an empty 200 body is EMPTY_BODY and a bound page is OK with its fact count', async () => {
  const empty = await run({ fetchPage: async () => ({ status: 200, contentType: 'text/html', text: '' }) });
  assert.equal(empty.diagnostics[0].reason, 'EMPTY_BODY');
  const providers = fridgeProviders();
  const ok = await run({ fetchPage: (url, options) => providers.deps.fetchPage(url.split('?')[0], options) });
  assert.equal(ok.diagnostics[0].reason, 'OK');
  assert.ok(ok.diagnostics[0].extractedFactCount > 0);
  assertSafe(ok.logger);
});

test('diagnostics are off in production and do not change the public response', async () => {
  const providers = fridgeProviders();
  const fetchPage = (url, options) => providers.deps.fetchPage(url.split('?')[0], options);
  const preview = await run({ fetchPage });
  const production = await run({ fetchPage, env: { ...ENV, VERCEL_ENV: 'production' } });
  assert.equal(production.diagnostics.length, 0);
  const strip = (body) => ({ ...body, meta: { ...body.meta, requestId: null, elapsedMs: null } });
  assert.deepEqual(strip(production.res.body), strip(preview.res.body));
});

test('the recorder passes results and errors through untouched', async () => {
  const page = { status: 200, text: 'x' };
  const ok = createFetchRecorder(async () => page);
  assert.equal(await ok.fetchPage('https://www.lg.com/us/a?q=1'), page);
  const error = Object.assign(new Error('boom'), { code: 'ECONNRESET' });
  const failing = createFetchRecorder(async () => { throw error; });
  await assert.rejects(failing.fetchPage('https://www.lg.com/us/a'), (thrown) => thrown === error);
  assert.deepEqual(safeLocation('not a url'), { hostname: null, path: null });
});
