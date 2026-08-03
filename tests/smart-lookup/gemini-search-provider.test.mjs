import test from 'node:test';
import assert from 'node:assert/strict';

import {
  callGeminiSearchProvider,
  extractGeminiSearchSources,
  GeminiSearchProviderError,
} from '../../lib/smart-lookup/gemini-search-provider.js';

const groundedResult = {
  brand: 'Microsoft',
  product: 'Xbox One X',
  model: 'Xbox One X',
  category: 'game console',
  bestEstimateYear: 2017,
  estimatedRange: { startYear: 2017, endYear: 2020 },
  precision: 'exact_model',
  confidence: 'high',
  estimateBasis: 'The Xbox One X was introduced in 2017 and remained in production until 2020.',
  summary: 'Xbox One X is the higher-performance Xbox One console introduced in 2017.',
  isIndividualUnitDate: false,
  caveats: ['This dates the model, not an individual console.'],
};

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, async json() { return body; } };
}

function geminiPayload(value, groundingChunks = []) {
  return {
    candidates: [{
      content: { parts: [{ text: `\`\`\`json\n${JSON.stringify(value)}\n\`\`\`` }] },
      groundingMetadata: { groundingChunks, webSearchQueries: ['Xbox One X release date'] },
    }],
  };
}

const groundingChunks = [
  { web: { title: 'Xbox Wire', uri: 'https://example.com/xbox-one-x' } },
  { web: { title: 'Xbox Wire duplicate', uri: 'https://example.com/xbox-one-x' } },
  { web: { title: 'Microsoft Support', uri: 'https://support.example.com/xbox' } },
];

test('returns a normalized grounded structured Smart Lookup result', async () => {
  let request;
  const result = await callGeminiSearchProvider('Xbox One X', {
    apiKey: 'gemini-test',
    fetchImpl: async (url, init) => {
      request = { url, init, body: JSON.parse(init.body) };
      return jsonResponse(200, geminiPayload(groundedResult, groundingChunks));
    },
  });

  assert.match(request.url, /gemini-3\.5-flash-lite:generateContent$/);
  assert.deepEqual(request.body.tools, [{ google_search: {} }]);
  assert.match(request.body.contents[0].parts[0].text, /Xbox One X/);
  assert.equal(request.init.headers['x-goog-api-key'], 'gemini-test');
  assert.deepEqual(result, {
    ...groundedResult,
    sources: [
      { title: 'Xbox Wire', url: 'https://example.com/xbox-one-x' },
      { title: 'Microsoft Support', url: 'https://support.example.com/xbox' },
    ],
  });
});

test('accepts a Gemini model override', async () => {
  let requestUrl;
  await callGeminiSearchProvider('Xbox One X', {
    apiKey: 'gemini-test',
    model: 'gemini-test-model',
    fetchImpl: async (url) => {
      requestUrl = url;
      return jsonResponse(200, geminiPayload(groundedResult, groundingChunks));
    },
  });

  assert.match(requestUrl, /gemini-test-model:generateContent$/);
});

test('returns an otherwise valid result with zero grounding sources', async () => {
  const result = await callGeminiSearchProvider('Xbox One X', {
    apiKey: 'gemini-test',
    fetchImpl: async () => jsonResponse(200, geminiPayload(groundedResult, [])),
  });

  assert.deepEqual(result, {
    ...groundedResult,
    sources: [],
  });
});

test('extracts grounding sources and deduplicates URLs', () => {
  assert.deepEqual(extractGeminiSearchSources({
    groundingMetadata: {
      groundingChunks: [
        ...groundingChunks,
        { web: { title: 'Not web', uri: 'mailto:test@example.com' } },
        {},
      ],
    },
  }), [
    { title: 'Xbox Wire', url: 'https://example.com/xbox-one-x' },
    { title: 'Microsoft Support', url: 'https://support.example.com/xbox' },
  ]);
});

test('classifies malformed Gemini structured output', async () => {
  await assert.rejects(
    callGeminiSearchProvider('Xbox One X', {
      apiKey: 'gemini-test',
      fetchImpl: async () => jsonResponse(200, {
        candidates: [{ content: { parts: [{ text: 'not JSON' }] }, groundingMetadata: { groundingChunks } }],
      }),
    }),
    (error) => error instanceof GeminiSearchProviderError
      && error.code === 'PROVIDER_MALFORMED_JSON'
      && error.provider === 'gemini-search',
  );
});

test('unusable output includes safe normalization diagnostics', async () => {
  const unusable = {
    brand: 'Microsoft',
    product: '',
    model: 'Xbox One X',
    category: 'game console',
    bestEstimateYear: null,
    estimatedRange: { startYear: null, endYear: null },
    precision: 'specific',
    confidence: 'certain',
    estimateBasis: '',
    summary: '',
    isIndividualUnitDate: false,
    caveats: [],
    unexpectedPayload: { apiKey: 'must-not-be-copied' },
  };

  await assert.rejects(
    callGeminiSearchProvider('Xbox One X', {
      apiKey: 'secret-gemini-key',
      fetchImpl: async () => jsonResponse(200, geminiPayload(unusable, [])),
    }),
    (error) => {
      assert.ok(error instanceof GeminiSearchProviderError);
      assert.equal(error.code, 'PROVIDER_UNUSABLE_OUTPUT');
      assert.deepEqual(error.diagnostics, {
        parsedKeys: Object.keys(unusable),
        parsedObject: {
          brand: 'Microsoft',
          product: '',
          model: 'Xbox One X',
          category: 'game console',
          bestEstimateYear: null,
          precision: 'specific',
          confidence: 'certain',
          estimateBasis: '',
          summary: '',
          isIndividualUnitDate: false,
          estimatedRange: { startYear: null, endYear: null },
          caveats: [],
        },
        rawPrecision: 'specific',
        rawConfidence: 'certain',
        hasProduct: false,
        hasSummary: false,
        hasEstimateBasis: false,
        hasBestEstimateYear: false,
        hasEstimatedRange: false,
        groundingSourceCount: 0,
        normalizationFailureReason: 'missing_product,invalid_precision,invalid_confidence,missing_estimate_basis,missing_summary',
      });
      assert.equal(JSON.stringify(error.diagnostics).includes('must-not-be-copied'), false);
      assert.equal(JSON.stringify(error.diagnostics).includes('secret-gemini-key'), false);
      return true;
    },
  );
});

test('classifies timeout and API failures for the future router', async (t) => {
  await t.test('timeout', async () => {
    await assert.rejects(
      callGeminiSearchProvider('Xbox One X', {
        apiKey: 'gemini-test',
        timeoutMs: 20,
        fetchImpl: async () => new Promise(() => {}),
      }),
      (error) => error instanceof GeminiSearchProviderError
        && error.code === 'PROVIDER_TIMEOUT'
        && error.retryable === true,
    );
  });

  await t.test('API failure', async () => {
    await assert.rejects(
      callGeminiSearchProvider('Xbox One X', {
        apiKey: 'gemini-test',
        fetchImpl: async () => jsonResponse(503, {}),
      }),
      (error) => error instanceof GeminiSearchProviderError
        && error.code === 'PROVIDER_5XX'
        && error.status === 503
        && error.retryable === true,
    );
  });
});
