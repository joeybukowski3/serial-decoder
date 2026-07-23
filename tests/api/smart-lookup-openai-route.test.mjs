import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgeLookupHandler } from '../../api/age-lookup.js';

function req(query, extra = {}) {
  return { method: 'POST', body: { query, ...extra }, headers: { 'x-forwarded-for': '127.0.0.1' }, socket: {} };
}
function res() {
  return {
    statusCode: 0, payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    setHeader() {},
  };
}
const redisMiss = {
  get: async () => null, set: async () => {}, eval: async () => [1, 1, 1],
  incrby: async (_key, amount) => amount, expire: async () => 1,
};
const META = Symbol.for('smart-lookup-provider-metadata');
function withMeta(value, metadata) {
  Object.defineProperty(value, META, { value: Object.freeze(metadata), enumerable: false });
  return value;
}

const OPENAI_ENV = {
  OPENAI_API_KEY: 'test-key',
  SMART_LOOKUP_OPENAI_ENABLED: 'true',
  OPENAI_SMART_LOOKUP_MODEL: 'test-model',
};

const SOURCES = [{ title: 'nintendo.com', domain: 'nintendo.com', uri: 'https://www.nintendo.com/switch-2/' }];

function openAiSuccess(overrides = {}) {
  return withMeta({
    brand: 'Nintendo',
    model: null,
    likelyProduct: 'Nintendo Switch 2',
    productType: 'video game console',
    specificityLevel: 'partial',
    introductionYear: 2025,
    identityConfidence: 'high',
    timingConfidence: 'high',
    serialNeededForExactUnitDate: true,
    caveats: ['Release timing is not the manufacture date of your unit.'],
    alternativeMatches: [{ product: 'Nintendo Switch OLED', reason: 'Earlier generation', confidence: 'low' }],
    notes: 'Released June 2025.',
    ...overrides,
  }, {
    provider: 'openai', fallbackUsed: false, primaryProvider: 'openai',
    grounded: true, webSearchUsed: true, groundedSources: SOURCES, searchQueryCount: 1,
  });
}

function harness({ openai, groq, env = OPENAI_ENV } = {}) {
  const calls = { openai: 0, gemini: 0, grounded: 0 };
  const handler = createAgeLookupHandler({
    env,
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    openAiProviderLookup: async (queryInfo, options) => {
      calls.openai += 1;
      return openai ? openai(queryInfo, options) : openAiSuccess();
    },
    providerLookup: async () => { calls.gemini += 1; return { brand: 'X', specificityLevel: 'partial' }; },
    groundedProviderLookup: async () => { calls.grounded += 1; return {}; },
  });
  return { handler, calls };
}

test('an OpenAI web-search result reaches the API response with identity, confidence and sources', async () => {
  const { handler, calls } = harness();
  const out = res();
  await handler(req('Nintendo Switch 2'), out);
  const p = out.payload;
  assert.equal(out.statusCode, 200);
  assert.equal(calls.openai, 1);
  assert.equal(p.likelyProduct, 'Nintendo Switch 2', 'identity must survive normalization');
  assert.equal(p.productType, 'video game console');
  assert.equal(p.introductionYear, 2025);
  assert.equal(p.identityConfidence, 'high');
  assert.equal(p.timingConfidence, 'high');
  assert.equal(p.serialNeededForExactUnitDate, true);
  assert.equal(p.webSearchUsed, true);
  assert.equal(p.evidenceSource, 'openai-web');
  assert.equal(p.sources.length, 1, 'genuine web-search citations must survive');
  assert.equal(p.caveats.length, 1);
  assert.equal(p.alternativeMatches.length, 1);
  assert.equal(p.alternativeMatches[0].product, 'Nintendo Switch OLED');
});

test('Gemini is never called while OpenAI is enabled', async () => {
  const { handler, calls } = harness();
  for (const query of ['Nintendo Switch 2', 'H4080BM miele oven', 'H4080BM', 'LG WM3900HWA']) {
    const out = res();
    await handler(req(query), out);
    assert.equal(out.statusCode, 200, query);
  }
  assert.equal(calls.gemini, 0, 'closed-book Gemini must not run');
  assert.equal(calls.grounded, 0, 'grounded Gemini must not run');
  assert.equal(calls.openai, 4, 'OpenAI handles every research-eligible query');
});

test('an OpenAI result without web search is labelled ungrounded and shows no sources', async () => {
  const { handler } = harness({
    openai: () => withMeta({ brand: 'Miele', likelyProduct: 'Miele H4080BM', specificityLevel: 'partial' }, {
      provider: 'openai', fallbackUsed: false, primaryProvider: 'openai',
      grounded: false, webSearchUsed: false, groundedSources: [], searchQueryCount: 0,
    }),
  });
  const out = res();
  await handler(req('H4080BM miele oven'), out);
  assert.equal(out.payload.evidenceSource, 'openai-ungrounded');
  assert.equal(out.payload.webSearchUsed, false);
  assert.deepEqual(out.payload.sources, [], 'an ungrounded answer must never show citations');
});

test('model-authored URLs in provider JSON never become displayed sources', async () => {
  const { handler } = harness({
    openai: () => withMeta({
      brand: 'Nintendo',
      likelyProduct: 'Nintendo Switch 2',
      specificityLevel: 'partial',
      sources: [{ uri: 'https://evil.example/fake', title: 'Fabricated', domain: 'evil.example' }],
    }, {
      provider: 'openai', fallbackUsed: false, primaryProvider: 'openai',
      grounded: true, webSearchUsed: true, groundedSources: SOURCES, searchQueryCount: 1,
    }),
  });
  const out = res();
  await handler(req('Nintendo Switch 2'), out);
  const uris = out.payload.sources.map((s) => s.uri).join(' ');
  assert.equal(uris.includes('evil.example'), false, 'model-authored URL must be discarded');
  assert.ok(uris.includes('nintendo.com'), 'server-derived citation must survive');
});

test('a total provider failure still returns the deterministic reserve, not an empty result', async () => {
  const { handler } = harness({
    openai: () => { const e = new Error('down'); e.code = 'PROVIDERS_UNAVAILABLE'; throw e; },
  });
  const out = res();
  await handler(req('Nintendo Switch 2'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(out.payload.brand, 'Nintendo');
  assert.ok(String(out.payload.fallbackKind).startsWith('deterministic-'));
});

for (const [label, fallbackErrorCode] of [
  ['xAI insufficient quota', 'XAI_QUOTA_EXHAUSTED'],
  ['xAI temporary 429', 'XAI_RATE_LIMIT'],
]) {
  test(`${label} returns the deterministic reserve promptly`, async () => {
    const { handler } = harness({
      openai: () => {
        const error = new Error('providers unavailable');
        error.code = 'PROVIDERS_UNAVAILABLE';
        error.primaryErrorCode = 'OPENAI_RATE_LIMIT';
        error.fallbackErrorCode = fallbackErrorCode;
        error.fallbackStatus = 429;
        throw error;
      },
    });
    const started = Date.now();
    const out = res();
    await handler(req('Nintendo Switch 2'), out);
    const elapsed = Date.now() - started;
    assert.equal(out.statusCode, 200);
    assert.equal(out.payload.brand, 'Nintendo');
    assert.ok(String(out.payload.fallbackKind).startsWith('deterministic-'));
    assert.equal(out.payload.fallbackUsed, false, 'deterministic reserve is not a provider result');
    assert.ok(elapsed < 500, `deterministic reserve should be prompt after immediate xAI failure, took ${elapsed}ms`);
  });
}

test('free paths call no provider at all', async () => {
  for (const query of ['Whirlpool', 'refrigerator', 'asdkjhasd', '']) {
    const { handler, calls } = harness({ openai: () => { throw new Error('must not run'); } });
    const out = res();
    await handler(req(query), out);
    assert.equal(calls.openai, 0, `${JSON.stringify(query)} must not reach OpenAI`);
  }
});

test('strong local family evidence still beats OpenAI research', async () => {
  const { handler, calls } = harness({ openai: () => { throw new Error('must not run'); } });
  const out = res();
  await handler(req('Samsung - 65" Class Q60 Series LED 4K UHD Smart Tizen TV'), out);
  assert.equal(calls.openai, 0, 'high-confidence local evidence must win');
  assert.equal(out.payload.productFamily, 'Q60 Series');
});

test('with OpenAI disabled the previous Gemini behaviour is untouched', async () => {
  const { handler, calls } = harness({ env: { SMART_LOOKUP_OPENAI_ENABLED: 'false' } });
  const out = res();
  await handler(req('Nintendo Switch 2'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(calls.openai, 0, 'OpenAI must not run when disabled');
  assert.ok(calls.gemini + calls.grounded > 0, 'the Gemini path remains available as before');
});

test('a missing OpenAI key falls back rather than breaking the route', async () => {
  const { handler, calls } = harness({ env: { SMART_LOOKUP_OPENAI_ENABLED: 'true' } });
  const out = res();
  await handler(req('Nintendo Switch 2'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(calls.openai, 0, 'no OpenAI attempt without a key');
});

test('no response field leaks the API key or an authorization header', async () => {
  const { handler } = harness();
  const out = res();
  await handler(req('Nintendo Switch 2'), out);
  const serialized = JSON.stringify(out.payload);
  assert.equal(serialized.includes('test-key'), false);
  assert.equal(/authorization/i.test(serialized), false);
  assert.equal(/bearer/i.test(serialized), false);
});

test('the whole route stays bounded even when the provider is slow', async () => {
  const { handler } = harness({
    openai: async () => { await new Promise((r) => setTimeout(r, 300)); return openAiSuccess(); },
  });
  const started = Date.now();
  const out = res();
  await handler(req('Nintendo Switch 2'), out);
  const elapsed = Date.now() - started;
  assert.equal(out.statusCode, 200);
  assert.ok(elapsed < 8500, `route must stay bounded, took ${elapsed}ms`);
});

// Every mandatory fixture must produce a 200 and never fabricate an
// individual-unit manufacture year from model-level evidence.
test('all mandatory query fixtures answer safely', async () => {
  const fixtures = [
    'Nintendo Switch 2', 'H4080BM miele oven', 'H4080BM', 'LG WM3900HWA',
    'Samsung Q60R', 'Sony X90L', 'Dell XPS 15 9530', 'Generac Guardian 22kW',
    'Carrier 24ABC636A003', 'PlayStation 5 Slim', 'Whirlpool', 'refrigerator', 'asdkjhasd',
  ];
  for (const query of fixtures) {
    const { handler } = harness();
    const out = res();
    await handler(req(query), out);
    assert.equal(out.statusCode, 200, `${query} must answer`);
    assert.equal(out.payload.individualManufactureYear ?? null, null, `${query}: no invented unit date`);
  }
});
