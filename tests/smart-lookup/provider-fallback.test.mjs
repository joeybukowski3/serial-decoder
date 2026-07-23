import test from 'node:test';
import assert from 'node:assert/strict';

import { createDeadline } from '../../lib/smart-lookup/deadline.js';
import {
  callSmartLookupAgeProvider,
  getSmartLookupProviderMetadata,
  SmartLookupProviderError,
} from '../../lib/smart-lookup/provider.js';

const queryInfo = {
  query: 'Samsung QN65Q80A television',
  brand: 'Samsung',
  modelIdentity: 'QN65Q80A',
  modelCompleteness: 'complete',
};

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

function geminiPayload(value) {
  return {
    candidates: [{
      content: {
        parts: [{ text: JSON.stringify(value) }],
      },
    }],
  };
}

function groqPayload(value) {
  return {
    choices: [{
      message: {
        content: JSON.stringify(value),
      },
    }],
  };
}

const validAgeResult = {
  brand: 'Samsung',
  model: 'QN65Q80A',
  specificityLevel: 'specific',
  introductionYear: 2021,
  productionRange: { start: 2021, end: 2022, basis: 'model availability' },
  notes: 'Model-level availability only.',
  evidence: [],
  suggestedModelNumbers: [],
};

test('Gemini remains the primary Smart Lookup provider', async () => {
  const calls = [];
  const result = await callSmartLookupAgeProvider(queryInfo, {
    apiKey: 'gemini-test',
    groqApiKey: 'groq-test',
    deadline: createDeadline({ totalMs: 500 }),
    fetchImpl: async (url) => {
      calls.push(url);
      return jsonResponse(200, geminiPayload(validAgeResult));
    },
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0], /generativelanguage\.googleapis\.com/);
  assert.deepEqual(result, validAgeResult);
  assert.deepEqual(getSmartLookupProviderMetadata(result), {
    provider: 'gemini',
    fallbackUsed: false,
    primaryProvider: 'gemini',
    primaryErrorCode: null,
  });
});

test('Gemini 429 immediately falls back to Groq inside the same deadline', async () => {
  const calls = [];
  const result = await callSmartLookupAgeProvider(queryInfo, {
    apiKey: 'gemini-test',
    groqApiKey: 'groq-test',
    deadline: createDeadline({ totalMs: 700 }),
    groqMaxMs: 250,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (String(url).includes('generativelanguage.googleapis.com')) {
        return jsonResponse(429, {});
      }
      return jsonResponse(200, groqPayload(validAgeResult));
    },
  });

  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /api\.groq\.com\/openai\/v1\/chat\/completions/);
  assert.equal(calls[1].init.headers.Authorization, 'Bearer groq-test');
  const requestBody = JSON.parse(calls[1].init.body);
  assert.equal(requestBody.model, 'openai/gpt-oss-20b');
  assert.deepEqual(requestBody.response_format, { type: 'json_object' });
  assert.deepEqual(getSmartLookupProviderMetadata(result), {
    provider: 'groq',
    fallbackUsed: true,
    primaryProvider: 'gemini',
    primaryErrorCode: 'PROVIDER_RATE_LIMIT',
    model: 'openai/gpt-oss-20b',
  });
});

test('malformed Gemini JSON is eligible for Groq fallback', async () => {
  let calls = 0;
  const result = await callSmartLookupAgeProvider(queryInfo, {
    apiKey: 'gemini-test',
    groqApiKey: 'groq-test',
    deadline: createDeadline({ totalMs: 700 }),
    fetchImpl: async (url) => {
      calls += 1;
      if (String(url).includes('generativelanguage.googleapis.com')) {
        return jsonResponse(200, {
          candidates: [{ content: { parts: [{ text: '{not-json' }] } }],
        });
      }
      return jsonResponse(200, groqPayload(validAgeResult));
    },
  });

  assert.equal(calls, 2);
  assert.equal(getSmartLookupProviderMetadata(result).provider, 'groq');
  assert.equal(getSmartLookupProviderMetadata(result).primaryErrorCode, 'PROVIDER_MALFORMED_JSON');
});

test('a full Gemini timeout does not start a second provider timeout chain', async () => {
  let calls = 0;
  await assert.rejects(
    callSmartLookupAgeProvider(queryInfo, {
      apiKey: 'gemini-test',
      groqApiKey: 'groq-test',
      deadline: createDeadline({ totalMs: 80 }),
      maxMs: 20,
      reserveMs: 10,
      fetchImpl: async () => {
        calls += 1;
        return new Promise(() => {});
      },
    }),
    (error) => error?.code === 'STAGE_TIMEOUT'
  );

  assert.equal(calls, 1);
});

test('Groq can serve as the immediate fallback when Gemini is not configured', async () => {
  const calls = [];
  const result = await callSmartLookupAgeProvider(queryInfo, {
    apiKey: '',
    groqApiKey: 'groq-test',
    deadline: createDeadline({ totalMs: 500 }),
    fetchImpl: async (url) => {
      calls.push(url);
      return jsonResponse(200, groqPayload(validAgeResult));
    },
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0], /api\.groq\.com/);
  const metadata = getSmartLookupProviderMetadata(result);
  assert.equal(metadata.provider, 'groq');
  assert.equal(metadata.primaryErrorCode, 'PROVIDER_NOT_CONFIGURED');
});

test('dual provider failure returns one bounded aggregate provider error', async () => {
  let calls = 0;
  await assert.rejects(
    callSmartLookupAgeProvider(queryInfo, {
      apiKey: 'gemini-test',
      groqApiKey: 'groq-test',
      deadline: createDeadline({ totalMs: 500 }),
      fetchImpl: async (url) => {
        calls += 1;
        if (String(url).includes('generativelanguage.googleapis.com')) {
          return jsonResponse(500, {});
        }
        return jsonResponse(503, {});
      },
    }),
    (error) => {
      assert.ok(error instanceof SmartLookupProviderError);
      assert.equal(error.code, 'PROVIDERS_UNAVAILABLE');
      assert.equal(error.primaryErrorCode, 'PROVIDER_5XX');
      assert.equal(error.fallbackErrorCode, 'GROQ_5XX');
      return true;
    }
  );

  assert.equal(calls, 2);
});

test('Groq fallback respects the original total deadline', async () => {
  const startedAt = Date.now();
  let calls = 0;

  await assert.rejects(
    callSmartLookupAgeProvider(queryInfo, {
      apiKey: 'gemini-test',
      groqApiKey: 'groq-test',
      deadline: createDeadline({ totalMs: 90 }),
      reserveMs: 5,
      groqMinMs: 5,
      groqMaxMs: 200,
      fetchImpl: async (url) => {
        calls += 1;
        if (String(url).includes('generativelanguage.googleapis.com')) {
          return jsonResponse(429, {});
        }
        return new Promise(() => {});
      },
    }),
    (error) => error?.code === 'PROVIDERS_UNAVAILABLE'
  );

  assert.equal(calls, 2);
  assert.ok(Date.now() - startedAt < 250);
});

test('Gemini requests carry a bounded maxOutputTokens cap', async () => {
  let geminiBody = null;
  await callSmartLookupAgeProvider(queryInfo, {
    deadline: createDeadline({ totalMs: 5000 }),
    maxMs: 4000,
    apiKey: 'test-key',
    fetchImpl: async (url, init) => {
      geminiBody = JSON.parse(init.body);
      return jsonResponse(200, geminiPayload({ brand: 'Samsung', model: 'QN65Q80A', specificityLevel: 'specific' }));
    },
  });
  assert.ok(geminiBody, 'Gemini request was issued');
  const cap = geminiBody.generationConfig?.maxOutputTokens;
  assert.ok(Number.isInteger(cap) && cap > 0 && cap <= 4096, `maxOutputTokens must be a bounded integer, got ${cap}`);
});
