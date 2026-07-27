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

function groundedPayload(text, chunks = [{ web: { uri: 'https://www.whirlpool.com/model', title: 'Whirlpool Official Product Page' } }]) {
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
  assert.equal(result.evidence[0].sourceUrl, 'https://www.whirlpool.com/model');
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


test('grounded provider does not trust an official label from an unrelated source', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ candidates: [{
      content: { parts: [{ text: JSON.stringify({ evidence: [{
        type: 'manual', title: 'Retailer copy', sourceName: 'Unrelated retailer', sourceIndex: 0,
        productionStart: 2023, productionEnd: 2025, quality: 'official',
      }] }) }] },
      groundingMetadata: { groundingChunks: [{ web: { uri: 'https://example-retailer.test/item', title: 'Example Retailer' } }] },
    }] }),
  });
  const result = await callGeminiGroundedSearch({ brand: 'Whirlpool', model: 'WMH31017HS12', candidateYears: [1994, 2024] }, { apiKey: 'test', fetchImpl });
  assert.equal(result.evidence[0].quality, 'strong-secondary');
});

test('grounded provider grants official quality to a genuine 2-letter brand match', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ candidates: [{
      content: { parts: [{ text: JSON.stringify({ evidence: [{
        type: 'manufacturer', title: 'GE product page', sourceName: 'GE Appliances', sourceIndex: 0,
        productionStart: 2020, productionEnd: 2026, quality: 'official',
      }] }) }] },
      groundingMetadata: {
        groundingChunks: [{
          web: {
            uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQH5RfFN',
            title: 'geappliances.com',
          },
        }],
      },
    }] }),
  });
  const result = await callGeminiGroundedSearch({ brand: 'GE', model: 'JGB735SP1SS', candidateYears: [2018, 2022] }, { apiKey: 'test', fetchImpl });
  assert.equal(result.evidence[0].quality, 'official');
});

test('a 2-letter brand does not spuriously match noise inside the redirect URL', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ candidates: [{
      content: { parts: [{ text: JSON.stringify({ evidence: [{
        type: 'manufacturer', title: 'Unrelated retailer copy', sourceName: 'Unrelated Retailer', sourceIndex: 0,
        productionStart: 2020, productionEnd: 2026, quality: 'official',
      }] }) }] },
      groundingMetadata: {
        groundingChunks: [{
          web: {
            // Deliberately contains "ge" inside the noisy redirect token, but the
            // clean chunk title is unrelated to the "GE" brand.
            uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGeXYZ',
            title: 'unrelated-retailer.example',
          },
        }],
      },
    }] }),
  });
  const result = await callGeminiGroundedSearch({ brand: 'GE', model: 'JGB735SP1SS', candidateYears: [2018, 2022] }, { apiKey: 'test', fetchImpl });
  assert.equal(result.evidence[0].quality, 'strong-secondary');
});

test('grounded provider request avoids incompatible structured-output mode for Gemini 2.5', async () => {
  let requestBody;
  const fetchImpl = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({ candidates: [{
        content: { parts: [{ text: JSON.stringify({ evidence: [{ type: 'manufacturer-support', sourceIndex: 0, availabilityStart: 2023, availabilityEnd: 2025 }] }) }] },
        groundingMetadata: { groundingChunks: [{ web: { uri: 'https://www.whirlpool.com/support/model', title: 'Whirlpool support' } }] },
      }] }),
    };
  };
  await callGeminiGroundedSearch({ brand: 'Whirlpool', model: 'WMH31017HS12', candidateYears: [1994, 2024] }, { apiKey: 'test', fetchImpl });
  assert.equal(requestBody.tools[0].google_search != null, true);
  assert.equal(Object.hasOwn(requestBody.generationConfig, 'responseMimeType'), false);
});
