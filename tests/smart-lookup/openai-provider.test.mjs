import test from 'node:test';
import assert from 'node:assert/strict';
import {
  callOpenAiResponses,
  callSmartLookupOpenAiAgeProvider,
  describeOpenAiConfig,
  didUseWebSearch,
  extractOpenAiSources,
  isOpenAiSmartLookupEnabled,
} from '../../lib/smart-lookup/openai-provider.js';
import { createDeadline } from '../../lib/smart-lookup/deadline.js';
import { getSmartLookupProviderMetadata } from '../../lib/smart-lookup/provider.js';
import { classifySmartLookupQuery } from '../../lib/smart-lookup/normalize.js';

const ENV = { OPENAI_API_KEY: 'test-key', SMART_LOOKUP_OPENAI_ENABLED: 'true', OPENAI_SMART_LOOKUP_MODEL: 'test-model' };
const QUERY = classifySmartLookupQuery('Nintendo Switch 2');

function deadline() { return createDeadline({ totalMs: 9000 }); }

function responsePayload(overrides = {}) {
  return {
    id: 'resp_test',
    output: [
      { type: 'web_search_call', status: 'completed' },
      {
        type: 'message',
        content: [{
          type: 'output_text',
          text: JSON.stringify({ brand: 'Nintendo', likelyProduct: 'Nintendo Switch 2', introductionYear: 2025 }),
          annotations: [
            { type: 'url_citation', url: 'https://www.nintendo.com/switch-2/', title: 'Nintendo Switch 2' },
          ],
        }],
      },
    ],
    usage: { input_tokens: 100, output_tokens: 50 },
    ...overrides,
  };
}

function okFetch(payload) {
  return async () => ({ ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) });
}
function statusFetch(status, body = '{}') {
  return async () => ({ ok: false, status, json: async () => JSON.parse(body), text: async () => body });
}

test('enablement flag parses the documented truthy forms only', () => {
  for (const value of ['true', '1', 'on', 'TRUE']) {
    assert.equal(isOpenAiSmartLookupEnabled({ SMART_LOOKUP_OPENAI_ENABLED: value }), true, value);
  }
  for (const value of ['false', '0', 'off', '', undefined]) {
    assert.equal(isOpenAiSmartLookupEnabled({ SMART_LOOKUP_OPENAI_ENABLED: value }), false, String(value));
  }
});

test('config description reports key presence without exposing the key', () => {
  const described = describeOpenAiConfig(ENV);
  assert.deepEqual(described, { keyConfigured: true, enabled: true, model: 'test-model' });
  // The secret must not appear anywhere in the serialized description.
  assert.equal(JSON.stringify(described).includes('test-key'), false);
});

test('a successful web-search response yields parsed JSON, sources, and metadata', async () => {
  const value = await callOpenAiResponses('prompt', { env: ENV, deadline: deadline(), fetchImpl: okFetch(responsePayload()) });
  assert.equal(value.likelyProduct, 'Nintendo Switch 2');
  const meta = getSmartLookupProviderMetadata(value);
  assert.equal(meta.provider, 'openai');
  assert.equal(meta.webSearchUsed, true);
  assert.equal(meta.grounded, true);
  assert.equal(meta.groundedSources.length, 1);
  assert.equal(meta.groundedSources[0].domain, 'www.nintendo.com');
  assert.equal(meta.usage.inputTokens, 100);
});

test('sources come only from real annotations, never from model-authored JSON', () => {
  const payload = responsePayload();
  payload.output[1].content[0].text = JSON.stringify({
    brand: 'Nintendo',
    sources: [{ uri: 'https://evil.example/fake', title: 'Fabricated' }],
    evidence: [{ source: 'https://evil.example/also-fake' }],
  });
  const sources = extractOpenAiSources(payload);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].uri, 'https://www.nintendo.com/switch-2/');
  assert.equal(sources.some((s) => s.uri.includes('evil.example')), false);
});

test('non-https and duplicate citations are rejected', () => {
  const payload = responsePayload();
  payload.output[1].content[0].annotations = [
    { type: 'url_citation', url: 'http://insecure.example/a', title: 'Insecure' },
    { type: 'url_citation', url: 'javascript:alert(1)', title: 'XSS' },
    { type: 'url_citation', url: 'https://ok.example/a', title: 'Fine' },
    { type: 'url_citation', url: 'https://ok.example/a', title: 'Duplicate' },
  ];
  const sources = extractOpenAiSources(payload);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].uri, 'https://ok.example/a');
});

test('a response without a web_search call is not treated as web grounded', async () => {
  const payload = responsePayload();
  payload.output = payload.output.filter((item) => item.type !== 'web_search_call');
  payload.output[0].content[0].annotations = [];
  const value = await callOpenAiResponses('prompt', { env: ENV, deadline: deadline(), fetchImpl: okFetch(payload) });
  const meta = getSmartLookupProviderMetadata(value);
  assert.equal(meta.webSearchUsed, false);
  assert.equal(meta.grounded, false);
  assert.equal(meta.groundedSources.length, 0);
  assert.equal(didUseWebSearch(payload), false);
});

test('HTTP failures map to stable internal codes and leak no response body', async () => {
  const cases = [
    [401, '{}', 'OPENAI_AUTH_ERROR'],
    [403, '{}', 'OPENAI_AUTH_ERROR'],
    [404, '{"error":{"code":"model_not_found"}}', 'OPENAI_MODEL_UNAVAILABLE'],
    [429, '{}', 'OPENAI_RATE_LIMIT'],
    [500, '{}', 'OPENAI_HTTP_ERROR'],
  ];
  for (const [status, body, expected] of cases) {
    await assert.rejects(
      () => callOpenAiResponses('p', { env: ENV, deadline: deadline(), fetchImpl: statusFetch(status, body), enableGroqFallback: false }),
      (error) => {
        assert.equal(error.code, expected, `status ${status}`);
        assert.equal(String(error.message).includes('model_not_found'), false, 'raw body must not leak into the message');
        return true;
      },
    );
  }
});

test('a 200 response that names an unknown model still maps to MODEL_UNAVAILABLE', async () => {
  await assert.rejects(
    () => callOpenAiResponses('p', {
      env: ENV, deadline: deadline(), enableGroqFallback: false,
      fetchImpl: statusFetch(400, '{"error":{"message":"The model `x` does not exist"}}'),
    }),
    (error) => error.code === 'OPENAI_MODEL_UNAVAILABLE',
  );
});

test('missing configuration produces distinct disabled and not-configured codes', async () => {
  await assert.rejects(
    () => callOpenAiResponses('p', { env: { ...ENV, SMART_LOOKUP_OPENAI_ENABLED: 'false' }, deadline: deadline() }),
    (error) => error.code === 'OPENAI_DISABLED',
  );
  await assert.rejects(
    () => callOpenAiResponses('p', { env: { ...ENV, OPENAI_API_KEY: '' }, deadline: deadline() }),
    (error) => error.code === 'OPENAI_NOT_CONFIGURED',
  );
});

test('empty output and unparseable output map to distinct codes', async () => {
  await assert.rejects(
    () => callOpenAiResponses('p', { env: ENV, deadline: deadline(), fetchImpl: okFetch({ output: [] }) }),
    (error) => error.code === 'OPENAI_EMPTY_RESULT',
  );
  const notJson = responsePayload();
  notJson.output[1].content[0].text = 'I could not determine this product.';
  await assert.rejects(
    () => callOpenAiResponses('p', { env: ENV, deadline: deadline(), fetchImpl: okFetch(notJson) }),
    (error) => error.code === 'OPENAI_SCHEMA_INVALID',
  );
});

test('the request uses the Responses API contract: web_search, store false, configured model', async () => {
  let captured = null;
  const fetchImpl = async (url, init) => {
    captured = { url, body: JSON.parse(init.body), headers: init.headers };
    return { ok: true, status: 200, json: async () => responsePayload(), text: async () => '' };
  };
  await callOpenAiResponses('the-prompt', { env: ENV, deadline: deadline(), fetchImpl });
  assert.equal(captured.url, 'https://api.openai.com/v1/responses');
  assert.equal(captured.body.model, 'test-model');
  assert.equal(captured.body.store, false);
  assert.deepEqual(captured.body.tools, [{ type: 'web_search' }]);
  assert.equal(captured.body.input, 'the-prompt');
  assert.ok(captured.body.max_output_tokens > 0, 'output must be bounded');
});

// --- failover ---------------------------------------------------------

// Routes by URL so the OpenAI leg and the Groq leg can fail/succeed
// independently through the single shared fetchImpl.
function routedFetch({ openAiStatus = 200, groqOk = true, counters }) {
  return async (url) => {
    const target = String(url);
    if (target.includes('openai.com')) {
      counters.openai += 1;
      if (openAiStatus !== 200) {
        return { ok: false, status: openAiStatus, json: async () => ({}), text: async () => '{}' };
      }
      return { ok: true, status: 200, json: async () => responsePayload(), text: async () => '' };
    }
    counters.groq += 1;
    if (!groqOk) return { ok: false, status: 500, json: async () => ({}), text: async () => '{}' };
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ brand: 'Nintendo', notes: 'from groq' }) } }] }),
      text: async () => '',
    };
  };
}

for (const [label, openAiStatus] of [['rate limit', 429], ['server error', 500], ['auth error', 401]]) {
  test(`Groq recovers an OpenAI ${label} and is labelled ungrounded with no sources`, async () => {
    const counters = { openai: 0, groq: 0 };
    const value = await callSmartLookupOpenAiAgeProvider(QUERY, {
      env: ENV, deadline: deadline(), groqApiKey: 'groq-key',
      fetchImpl: routedFetch({ openAiStatus, counters }),
    });
    const meta = getSmartLookupProviderMetadata(value);
    assert.equal(meta.provider, 'groq');
    assert.equal(meta.fallbackUsed, true);
    assert.equal(meta.primaryProvider, 'openai');
    assert.equal(meta.model, 'openai/gpt-oss-20b');
    // A Groq answer is closed-book: never web-grounded, never cited.
    assert.equal(meta.grounded, false);
    assert.equal(meta.webSearchUsed, false);
    assert.deepEqual(meta.groundedSources, []);
    assert.equal(counters.openai, 1, 'exactly one OpenAI attempt');
    assert.equal(counters.groq, 1, 'exactly one Groq attempt');
  });
}

test('when both OpenAI and Groq fail the caller sees a combined provider failure', async () => {
  const counters = { openai: 0, groq: 0 };
  const error = await callSmartLookupOpenAiAgeProvider(QUERY, {
    env: ENV, deadline: deadline(), groqApiKey: 'groq-key',
    fetchImpl: routedFetch({ openAiStatus: 429, groqOk: false, counters }),
  }).catch((e) => e);
  assert.equal(error.code, 'PROVIDERS_UNAVAILABLE');
  assert.equal(error.primaryErrorCode, 'OPENAI_RATE_LIMIT');
  assert.equal(counters.openai, 1);
  assert.equal(counters.groq, 1);
});

test('Groq HTTP failures preserve safe status/model diagnostics without raw response text', async () => {
  const counters = { openai: 0, groq: 0 };
  const error = await callSmartLookupOpenAiAgeProvider(QUERY, {
    env: { ...ENV, GROQ_MODEL: 'diagnostic-model' },
    deadline: deadline(),
    groqApiKey: 'groq-key',
    fetchImpl: async (url) => {
      if (String(url).includes('openai.com')) {
        counters.openai += 1;
        return { ok: false, status: 429, json: async () => ({}), text: async () => '{}' };
      }
      counters.groq += 1;
      return {
        ok: false,
        status: 400,
        headers: { get: (key) => key === 'x-ratelimit-remaining-requests' ? '12' : null },
        json: async () => ({}),
        text: async () => '{"error":{"message":"do not leak me"}}',
      };
    },
  }).catch((e) => e);
  assert.equal(error.code, 'PROVIDERS_UNAVAILABLE');
  assert.equal(error.fallbackErrorCode, 'GROQ_HTTP_ERROR');
  assert.equal(error.fallbackStatus, 400);
  assert.equal(error.fallbackModel, 'diagnostic-model');
  assert.equal(String(error.message).includes('do not leak me'), false);
  assert.equal(counters.openai, 1);
  assert.equal(counters.groq, 1);
});

test('Groq rate limits preserve safe rate-limit headers', async () => {
  const error = await callSmartLookupOpenAiAgeProvider(QUERY, {
    env: ENV,
    deadline: deadline(),
    groqApiKey: 'groq-key',
    fetchImpl: async (url) => {
      if (String(url).includes('openai.com')) return { ok: false, status: 500, json: async () => ({}), text: async () => '{}' };
      return {
        ok: false,
        status: 429,
        headers: {
          get: (key) => ({
            'x-ratelimit-limit-requests': '1000',
            'x-ratelimit-remaining-requests': '0',
            'retry-after': '2',
          })[key] || null,
        },
        json: async () => ({}),
        text: async () => '{}',
      };
    },
  }).catch((e) => e);
  assert.equal(error.fallbackErrorCode, 'GROQ_RATE_LIMIT');
  assert.equal(error.fallbackStatus, 429);
  assert.equal(error.fallbackRateLimitHeaders['x-ratelimit-remaining-requests'], '0');
  assert.equal(error.fallbackRateLimitHeaders['retry-after'], '2');
});

test('an OpenAI stage timeout is Groq-eligible (unlike the old Gemini path)', async () => {
  const counters = { openai: 0, groq: 0 };
  const slowThenGroq = async (url) => {
    if (String(url).includes('openai.com')) {
      counters.openai += 1;
      await new Promise((resolve) => setTimeout(resolve, 400));
      return { ok: true, status: 200, json: async () => responsePayload(), text: async () => '' };
    }
    counters.groq += 1;
    return {
      ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ brand: 'Nintendo' }) } }] }),
      text: async () => '',
    };
  };
  const value = await callSmartLookupOpenAiAgeProvider(QUERY, {
    env: ENV, deadline: deadline(), groqApiKey: 'groq-key',
    openAiMaxMs: 80, groqMaxMs: 2000, fetchImpl: slowThenGroq,
  });
  const meta = getSmartLookupProviderMetadata(value);
  assert.equal(meta.provider, 'groq', 'a full OpenAI timeout must still reach Groq');
  assert.equal(meta.primaryErrorCode, 'OPENAI_TIMEOUT');
  assert.equal(counters.groq, 1);
});

test('a usable OpenAI result never triggers Groq', async () => {
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    assert.ok(String(url).includes('openai.com'), 'only OpenAI should be called');
    return { ok: true, status: 200, json: async () => responsePayload(), text: async () => '' };
  };
  const value = await callSmartLookupOpenAiAgeProvider(QUERY, { env: ENV, deadline: deadline(), fetchImpl, groqApiKey: 'groq-key' });
  assert.equal(getSmartLookupProviderMetadata(value).provider, 'openai');
  assert.equal(calls, 1, 'exactly one provider request per lookup');
});

test('Groq is skipped when too little global deadline remains', async () => {
  const tight = createDeadline({ totalMs: 400 });
  const error = await callSmartLookupOpenAiAgeProvider(QUERY, {
    env: ENV, deadline: tight, fetchImpl: statusFetch(500), groqApiKey: 'groq-key',
  }).catch((e) => e);
  // Surfaces the OpenAI failure directly rather than a two-provider failure.
  assert.equal(error.code, 'OPENAI_HTTP_ERROR');
});

test('Gemini is never invoked by the OpenAI sequence', async () => {
  const fetchImpl = async (url) => {
    assert.equal(String(url).includes('generativelanguage'), false, 'Gemini must not be called');
    return { ok: true, status: 200, json: async () => responsePayload(), text: async () => '' };
  };
  await callSmartLookupOpenAiAgeProvider(QUERY, { env: ENV, deadline: deadline(), fetchImpl });
});
