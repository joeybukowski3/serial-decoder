import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const rawSource = fs.readFileSync(new URL('../../api/assistant-chat.js', import.meta.url), 'utf8');
const source = rawSource
  .replace("import { Redis } from '@upstash/redis';", 'const Redis = globalThis.__Redis;')
  .replace("import { Ratelimit } from '@upstash/ratelimit';", 'const Ratelimit = globalThis.__Ratelimit;')
  .replace('export default async function handler', 'async function handler') + '\nglobalThis.__handler = handler;\n';

class FakeRedis {
  constructor() {}
}

function makeRatelimitClass({ limitImpl, constructorImpl } = {}) {
  return class FakeRatelimit {
    static slidingWindow() { return {}; }
    constructor() {
      if (constructorImpl) constructorImpl();
    }
    async limit(ip) {
      if (limitImpl) return limitImpl(ip);
      return { success: true, reset: Date.now() + 60_000 };
    }
  };
}

function normalize(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeResponse() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    setHeader(name, value) { this.headers[name] = value; }
  };
}

function loadHandler({ ratelimitClass, envOverrides = {} } = {}) {
  const env = { GEMINI_API_KEY: 'test-key', ...envOverrides };
  const context = vm.createContext({
    __Redis: FakeRedis,
    __Ratelimit: ratelimitClass || makeRatelimitClass(),
    fetch: async () => ({
      ok: true,
      async json() {
        return { candidates: [{ content: { parts: [{ text: 'Hello from the assistant.' }] } }] };
      }
    }),
    process: { env },
    Array,
    String,
    Number,
    Boolean,
    JSON,
    Math,
    Date,
    Object,
    console,
  });
  vm.runInContext(source, context);
  return context.__handler;
}

async function invoke(handler, { body = { messages: [{ role: 'user', content: 'How old is my dryer?' }] }, headers = {}, socket = { remoteAddress: '127.0.0.1' } } = {}) {
  const req = { method: 'POST', body, headers, socket };
  const res = makeResponse();
  await handler(req, res);
  return res;
}

test('request under the limit reaches Gemini and returns a normal reply', async () => {
  const handler = loadHandler();
  const res = await invoke(handler);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.reply, 'Hello from the assistant.');
});

test('limit exceeded returns 429 with a retryable, provider-free error and Retry-After header', async () => {
  const reset = Date.now() + 45_000;
  const ratelimitClass = makeRatelimitClass({ limitImpl: async () => ({ success: false, reset }) });
  const handler = loadHandler({ ratelimitClass });
  const res = await invoke(handler);

  assert.equal(res.statusCode, 429);
  assert.deepEqual(normalize(res.body), { error: 'Too many requests. Please try again in a moment.', errorCode: 'RATE_LIMIT' });
  assert.ok(res.headers['Retry-After'] >= 0);
  assert.equal(JSON.stringify(res.body).toLowerCase().includes('gemini'), false);
  assert.equal(JSON.stringify(res.body).toLowerCase().includes('upstash'), false);
});

test('malformed/missing client identity still keys and rate-limits without throwing', async () => {
  let capturedKey;
  const ratelimitClass = makeRatelimitClass({
    limitImpl: async (ip) => { capturedKey = ip; return { success: true, reset: Date.now() + 60_000 }; },
  });
  const handler = loadHandler({ ratelimitClass });

  const res = await invoke(handler, { headers: {}, socket: {} });
  assert.equal(res.statusCode, 200);
  assert.equal(capturedKey, 'unknown');
});

test('forwarded-for header is used as the rate-limit key when present', async () => {
  let capturedKey;
  const ratelimitClass = makeRatelimitClass({
    limitImpl: async (ip) => { capturedKey = ip; return { success: true, reset: Date.now() + 60_000 }; },
  });
  const handler = loadHandler({ ratelimitClass });

  await invoke(handler, { headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' } });
  assert.equal(capturedKey, '203.0.113.5');
});

test('Upstash/Redis failure fails open and still returns a normal assistant reply', async () => {
  const ratelimitClass = makeRatelimitClass({
    limitImpl: async () => { throw new Error('ECONNREFUSED: redis unreachable'); },
  });
  const handler = loadHandler({ ratelimitClass });
  const res = await invoke(handler);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.reply, 'Hello from the assistant.');
});

test('normal assistant response flow is unaffected: missing Gemini key still returns its original error', async () => {
  const handler = loadHandler({ envOverrides: { GEMINI_API_KEY: '' } });
  const res = await invoke(handler);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(normalize(res.body), { error: 'Gemini API key is not configured' });
});

test('normal assistant response flow is unaffected: empty messages still returns 400', async () => {
  const handler = loadHandler();
  const res = await invoke(handler, { body: { messages: [] } });
  assert.equal(res.statusCode, 400);
  assert.deepEqual(normalize(res.body), { error: 'Messages are required' });
});

test('non-POST requests are rejected before rate limiting runs', async () => {
  let limitCalls = 0;
  const ratelimitClass = makeRatelimitClass({
    limitImpl: async () => { limitCalls += 1; return { success: true, reset: Date.now() + 60_000 }; },
  });
  const handler = loadHandler({ ratelimitClass });
  const req = { method: 'GET', body: {}, headers: {}, socket: { remoteAddress: '127.0.0.1' } };
  const res = makeResponse();
  await handler(req, res);

  assert.equal(res.statusCode, 405);
  assert.equal(limitCalls, 0);
});
