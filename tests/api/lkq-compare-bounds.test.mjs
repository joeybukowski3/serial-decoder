import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const rawSource = fs.readFileSync(new URL('../../api/lkq-compare.js', import.meta.url), 'utf8');
const source = rawSource
  .replace("import { Redis } from '@upstash/redis';", 'const Redis = globalThis.__Redis;')
  .replace("import { Ratelimit } from '@upstash/ratelimit';", 'const Ratelimit = globalThis.__Ratelimit;')
  .replace('export default async function handler', 'async function handler') + '\nglobalThis.__handler = handler;\n';

class FakeRedis {
  constructor() {}
}

class FakeRatelimit {
  static slidingWindow() { return {}; }
  constructor() {}
  async limit() { return { success: true, reset: Date.now() + 60_000 }; }
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

function loadHandler(fetchImpl) {
  const env = { GEMINI_API_KEY: 'test-key' };
  const context = vm.createContext({
    __Redis: FakeRedis,
    __Ratelimit: FakeRatelimit,
    fetch: fetchImpl,
    process: { env },
    AbortController,
    setTimeout,
    clearTimeout,
    Date,
    Object,
    Array,
    String,
    Number,
    Boolean,
    JSON,
    Math,
  });
  vm.runInContext(source, context);
  return context.__handler;
}

async function invoke(body, fetchImpl = async () => {
  throw new Error('fetch should not be called');
}) {
  const handler = loadHandler(fetchImpl);
  const req = { method: 'POST', body, headers: {}, socket: { remoteAddress: '127.0.0.1' } };
  const res = makeResponse();
  await handler(req, res);
  return res;
}

test('LKQ compare accepts a bounded request and sends token limit plus abort signal', async () => {
  let captured;
  const res = await invoke({
    originalItem: 'Whirlpool refrigerator',
    originalSpecs: { Capacity: '25 cu ft', Finish: 'Stainless' },
    specLabels: ['Capacity', 'Finish'],
    recommendation: 'Whirlpool WRS325SDHZ'
  }, async (_url, options) => {
    captured = options;
    return {
      ok: true,
      async json() {
        return { candidates: [{ content: { parts: [{ text: '{"rating":"MATCH"}' }] } }] };
      }
    };
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { rating: 'MATCH' });
  assert.ok(captured.signal instanceof AbortSignal);
  const requestBody = JSON.parse(captured.body);
  assert.equal(requestBody.generationConfig.maxOutputTokens, 2048);
});

test('LKQ compare rejects oversized originalItem before provider call', async () => {
  const res = await invoke({
    originalItem: 'x'.repeat(501),
    recommendation: 'Valid replacement'
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'originalItem too long');
});

test('LKQ compare rejects oversized spec collections and values', async () => {
  const tooMany = Object.fromEntries(Array.from({ length: 21 }, (_, index) => [`k${index}`, 'v']));
  let res = await invoke({ originalItem: 'Item', recommendation: 'Replacement', originalSpecs: tooMany });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'Too many originalSpecs entries');

  res = await invoke({
    originalItem: 'Item',
    recommendation: 'Replacement',
    originalSpecs: { Capacity: 'x'.repeat(501) }
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'originalSpecs value too long');
});

test('LKQ compare rejects too many or excessively long spec labels', async () => {
  let res = await invoke({
    originalItem: 'Item',
    recommendation: 'Replacement',
    specLabels: Array.from({ length: 21 }, (_, index) => `Label ${index}`)
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'Too many specLabels');

  res = await invoke({
    originalItem: 'Item',
    recommendation: 'Replacement',
    specLabels: ['x'.repeat(81)]
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'Invalid specLabels entry');
});

test('LKQ compare redacts raw provider failures', async () => {
  const res = await invoke({ originalItem: 'Item', recommendation: 'Replacement' }, async () => {
    throw new Error('secret provider detail and key');
  });
  assert.equal(res.statusCode, 502);
  assert.deepEqual(res.body, { error: 'AI service unavailable', errorCode: 'PROVIDER_UNAVAILABLE' });
  assert.equal(JSON.stringify(res.body).includes('secret provider detail'), false);
});

test('LKQ compare returns structured invalid JSON failure', async () => {
  const res = await invoke({ originalItem: 'Item', recommendation: 'Replacement' }, async () => ({
    ok: true,
    async json() {
      return { candidates: [{ content: { parts: [{ text: 'not-json' }] } }] };
    }
  }));
  assert.equal(res.statusCode, 502);
  assert.deepEqual(res.body, { error: 'AI service unavailable', errorCode: 'INVALID_RESPONSE' });
});
