import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGroundedRefinementPrompt, callGeminiGroundedSearch } from '../../lib/serial-refinement/provider.js';

const request = {
  brand: 'Whirlpool',
  model: 'WMH31017HS12',
  category: 'appliances',
  candidateYears: [1994, 2024],
  decodedMonth: 'Week 48',
  context: '',
};

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload; },
  };
}

function groundedPayload(text, chunks = [{ web: { uri: 'https://manufacturer.example/model', title: 'Official Product Page' } }]) {
  return {
    candidates: [{
      content: { parts: [{ text }] },
      groundingMetadata: { groundingChunks: chunks },
    }],
  };
}

test('grounded prompt asks for boundaries and forbids single-year selection', () => {
  const prompt = buildGroundedRefinementPrompt(request);
  assert.match(prompt, /availability or production boundaries/i);
  assert.match(prompt, /Do not select a manufacture year/i);
  assert.match(prompt, /Do not calculate a midpoint/i);
  assert.match(prompt, /Do not choose the nearest candidate/i);
});

test('grounded provider returns cited structured evidence', async () => {
  let body = null;
  const result = await callGeminiGroundedSearch(request, {
    apiKey: 'test-key',
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return response(200, groundedPayload(JSON.stringify({
        modelIdentity: 'WMH31017HS12',
        evidence: [{
          type: 'manufacturer',
          title: 'Official Product Page',
          sourceIndex: 0,
          productionStart: 2023,
          productionEnd: 2025,
          supports: 'Official product availability window.',
          quality: 'official',
        }],
        notes: '',
      })));
    },
  });
  assert.deepEqual(body.tools, [{ google_search: {} }]);
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].sourceUrl, 'https://manufacturer.example/model');
  assert.equal(result.evidence[0].quality, 'official');
});

test('grounded provider rejects missing grounding metadata', async () => {
  await assert.rejects(
    callGeminiGroundedSearch(request, {
      apiKey: 'test-key',
      fetchImpl: async () => response(200, { candidates: [{ content: { parts: [{ text: '{"evidence":[]}' }] } }] }),
    }),
    (error) => error.code === 'GROUNDING_METADATA_MISSING',
  );
});

test('grounded provider rejects malformed JSON', async () => {
  await assert.rejects(
    callGeminiGroundedSearch(request, {
      apiKey: 'test-key',
      fetchImpl: async () => response(200, groundedPayload('not-json')),
    }),
    /MALFORMED_PROVIDER_JSON/,
  );
});

test('grounded provider maps 429 and 5xx without reading raw response bodies', async () => {
  await assert.rejects(
    callGeminiGroundedSearch(request, { apiKey: 'test-key', fetchImpl: async () => response(429, {}) }),
    (error) => error.code === 'GROUNDING_RATE_LIMIT',
  );
  await assert.rejects(
    callGeminiGroundedSearch(request, { apiKey: 'test-key', fetchImpl: async () => response(500, {}) }),
    (error) => error.code === 'GROUNDING_PROVIDER_ERROR',
  );
});
