import test from 'node:test';
import assert from 'node:assert/strict';
import { searchProducts } from '../../lib/replacement-discovery/providers/explicit-search.js';
import { runRefrigeratorProof } from '../../lib/replacement-discovery/refrigerator-retrieval.js';

const QUERY = 'LRFCS25D3S LG refrigerator specifications site:lg.com';
const API_KEY = 'offline-secret-key-0123456789';
const okResponse = () => new Response(JSON.stringify({ organic: [{ title: 'LG LRFCS25D3S', link: 'https://www.lg.com/us/refrigerators/lg-lrfcs25d3s', position: 1 }] }), { status: 200 });
// Mirrors undici: an aborted request rejects with the signal's DOMException (AbortError, legacy code 20).
const abortAware = (signal) => new Promise((_, reject) => {
  if (signal.aborted) return reject(signal.reason);
  signal.addEventListener('abort', () => reject(signal.reason), { once: true });
});

test('a valid query reaches the provider intact with a live, un-aborted signal', async () => {
  let seen;
  const results = await searchProducts({ query: QUERY, purpose: 'original', limit: 10 }, {
    apiKey: API_KEY,
    fetchImpl: async (url, init) => { seen = { url, init, abortedAtCall: init.signal.aborted }; return okResponse(); },
  });
  assert.equal(results.length, 1);
  assert.equal(seen.url, 'https://google.serper.dev/search');
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers['Content-Type'], 'application/json');
  assert.equal(seen.init.headers['X-API-KEY'], API_KEY);
  assert.deepEqual(JSON.parse(seen.init.body), { q: QUERY, num: 10, gl: 'us', hl: 'en' });
  assert.equal(seen.abortedAtCall, false);
});

test('timeout abort is reported as SERPER_TIMEOUT with bounded diagnostics, not the numeric DOMException code', async () => {
  const error = await searchProducts({ query: QUERY, purpose: 'original' }, {
    apiKey: API_KEY, timeoutMs: 20, fetchImpl: async (_url, { signal }) => abortAware(signal),
  }).then(() => null, (caught) => caught);
  assert.ok(error, 'must reject');
  assert.equal(error.code, 'SERPER_TIMEOUT');
  assert.equal(typeof error.code, 'string');
  assert.equal(error.diagnostics.errorName, 'AbortError');
  assert.equal(error.diagnostics.errorCode, 20);
  assert.equal(error.diagnostics.timeoutMs, 20);
  assert.equal(error.diagnostics.aborted, true);
  assert.equal(typeof error.diagnostics.elapsedMs, 'number');
  assert.ok(error.diagnostics.errorMessage.length > 0);
});

test('network failures keep name, message, code and cause code and are not labelled as timeouts', async () => {
  const cause = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
  const error = await searchProducts({ query: QUERY, purpose: 'original' }, {
    apiKey: API_KEY, timeoutMs: 5000, fetchImpl: async () => { throw new TypeError('fetch failed', { cause }); },
  }).then(() => null, (caught) => caught);
  assert.equal(error.code, 'SERPER_REQUEST_FAILED');
  assert.equal(error.diagnostics.errorName, 'TypeError');
  assert.equal(error.diagnostics.errorMessage, 'fetch failed');
  assert.equal(error.diagnostics.causeCode, 'ECONNRESET');
  assert.equal(error.diagnostics.aborted, false);
  assert.equal(error.diagnostics.timeoutMs, 5000);
});

test('existing provider codes survive and diagnostics never contain the API key', async () => {
  const http = await searchProducts({ query: QUERY, purpose: 'original' }, {
    apiKey: API_KEY, fetchImpl: async () => new Response('{}', { status: 403 }),
  }).then(() => null, (caught) => caught);
  assert.equal(http.code, 'WEB_RETRIEVAL_UNAVAILABLE');
  assert.equal(http.message, 'SERPER_HTTP_403');
  const leaky = await searchProducts({ query: QUERY, purpose: 'original' }, {
    apiKey: API_KEY, fetchImpl: async () => { throw new TypeError(`bad header ${API_KEY} ${'x'.repeat(1000)}`); },
  }).then(() => null, (caught) => caught);
  assert.equal(JSON.stringify(leaky.diagnostics).includes(API_KEY), false);
  assert.ok(leaky.diagnostics.errorMessage.length <= 200);
});

test('a timed-out request does not poison the next request: each call gets a fresh signal', async () => {
  const signals = [];
  const fetchImpl = async (_url, { signal }) => {
    signals.push(signal);
    if (signals.length === 1) return abortAware(signal);
    return okResponse();
  };
  await assert.rejects(searchProducts({ query: QUERY, purpose: 'original' }, { apiKey: API_KEY, timeoutMs: 20, fetchImpl }), { code: 'SERPER_TIMEOUT' });
  const results = await searchProducts({ query: QUERY, purpose: 'original' }, { apiKey: API_KEY, timeoutMs: 1000, fetchImpl });
  assert.equal(results.length, 1);
  assert.notEqual(signals[0], signals[1]);
  assert.equal(signals[0].aborted, true);
  assert.equal(signals[1].aborted, false);
});

test('proof report records a string error code plus diagnostics for a provider timeout', async () => {
  const report = await runRefrigeratorProof({
    search: (request) => searchProducts(request, { apiKey: API_KEY, timeoutMs: 20, fetchImpl: async (_url, { signal }) => abortAware(signal) }),
    fetchPage: async () => assert.fail('no page fetch after a failed search'),
  });
  const [entry] = report.queries;
  assert.equal(entry.ok, false);
  assert.equal(entry.error, 'SERPER_TIMEOUT');
  assert.equal(entry.diagnostics.errorName, 'AbortError');
  assert.equal(entry.diagnostics.errorCode, 20);
  assert.equal(entry.diagnostics.aborted, true);
  assert.equal(report.error, 'SERPER_TIMEOUT');
  assert.ok(report.reasonCodes.includes('SEARCH_FAILED'));
});
