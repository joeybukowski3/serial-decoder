import test from 'node:test';
import assert from 'node:assert/strict';
import { callDeterministicSerper } from '../../lib/serial-refinement/deterministic-provider.js';

function response(payload) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  };
}

function createRedis() {
  const values = new Map();
  return {
    async get(key) {
      return values.has(key) ? values.get(key) : null;
    },
    async set(key, value) {
      values.set(key, value);
    },
  };
}

const input = {
  brand: 'GE',
  model: 'GNE27JYMFS',
  category: 'refrigerator',
  candidateYears: [2004, 2014, 2024],
};

function serperPayload() {
  return {
    organic: [
      {
        position: 1,
        title: 'GE GNE27JYMFS refrigerator introduced for 2023',
        link: 'https://www.geappliances.com/appliance/GNE27JYMFS',
        snippet: 'The exact GNE27JYMFS refrigerator became available in 2023.',
        date: '2023-05-01',
      },
      {
        position: 2,
        title: 'GNE27JYMFS review',
        link: 'https://reviews.example/GNE27JYMFS',
        snippet: 'A 2023 review of model GNE27JYMFS.',
        date: '2023-06-01',
      },
      {
        position: 3,
        title: 'GNE27JYMFS specifications',
        link: 'https://specs.example/GNE27JYMFS',
        snippet: 'Specifications for exact model GNE27JYMFS.',
        date: '2023-07-01',
      },
    ],
  };
}

function geminiPayload() {
  return {
    candidates: [{
      finishReason: 'STOP',
      content: {
        parts: [{
          text: JSON.stringify({
            extractedEvidence: [
              {
                resultIndex: 0,
                exactModelMatch: true,
                sourceType: 'manufacturer',
                approximateYear: 2023,
                dateMeaning: 'product_launch',
                ownershipAgeYears: null,
                explicitlyNewProduct: true,
                explicitlyDiscontinued: false,
                claimText: 'Exact model introduced in 2023',
              },
              {
                resultIndex: 1,
                exactModelMatch: true,
                sourceType: 'review',
                approximateYear: 2023,
                dateMeaning: 'review_published',
                ownershipAgeYears: null,
                explicitlyNewProduct: false,
                explicitlyDiscontinued: false,
                claimText: 'Exact model reviewed in 2023',
              },
              {
                resultIndex: 2,
                exactModelMatch: true,
                sourceType: 'spec-sheet',
                approximateYear: 2023,
                dateMeaning: 'publication_date',
                ownershipAgeYears: null,
                explicitlyNewProduct: false,
                explicitlyDiscontinued: false,
                claimText: 'Exact model specifications dated 2023',
              },
            ],
          }),
        }],
      },
    }],
  };
}

test('production deterministic provider searches, extracts once, and resolves only a serial candidate', async () => {
  let serperCalls = 0;
  let geminiCalls = 0;
  const result = await callDeterministicSerper(input, {
    redis: null,
    serperApiKey: 'serper-test-key',
    geminiApiKey: 'gemini-test-key',
    serperFetchImpl: async () => {
      serperCalls += 1;
      return response(serperPayload());
    },
    geminiFetchImpl: async () => {
      geminiCalls += 1;
      return response(geminiPayload());
    },
    currentYear: 2026,
  });

  assert.equal(result.status, 'success');
  assert.equal(result.output.resolutionType, 'resolved-single');
  assert.equal(result.output.bestEstimateYear, 2024);
  assert.ok(input.candidateYears.includes(result.output.bestEstimateYear));
  assert.equal(serperCalls, 1);
  assert.equal(geminiCalls, 1);
});

test('raw Serper and extracted-fact caches avoid repeat provider calls', async () => {
  const redis = createRedis();
  let serperCalls = 0;
  let geminiCalls = 0;
  const options = {
    redis,
    serperApiKey: 'serper-test-key',
    geminiApiKey: 'gemini-test-key',
    serperFetchImpl: async () => {
      serperCalls += 1;
      return response(serperPayload());
    },
    geminiFetchImpl: async () => {
      geminiCalls += 1;
      return response(geminiPayload());
    },
    currentYear: 2026,
  };

  const first = await callDeterministicSerper(input, options);
  const second = await callDeterministicSerper(input, options);

  assert.equal(first.output.bestEstimateYear, 2024);
  assert.equal(second.output.bestEstimateYear, 2024);
  assert.equal(serperCalls, 1);
  assert.equal(geminiCalls, 1);
  assert.equal(second.cacheStats.rawHits, 1);
  assert.equal(second.cacheStats.factsHits, 1);
});

test('missing Serper configuration returns insufficient evidence without calling Gemini', async () => {
  let geminiCalls = 0;
  const result = await callDeterministicSerper(input, {
    redis: null,
    serperApiKey: '',
    geminiApiKey: 'gemini-test-key',
    geminiFetchImpl: async () => {
      geminiCalls += 1;
      return response(geminiPayload());
    },
  });

  assert.equal(result.status, 'insufficient');
  assert.equal(result.errorCode, 'DETERMINISTIC_SERPER_ERROR');
  assert.equal(result.output.resolutionType, 'unchanged');
  assert.equal(geminiCalls, 0);
});

test('Gemini cannot upgrade a suffix variant to an exact-model match', async () => {
  const variantInput = {
    brand: 'Samsung',
    model: 'RF28R7351SR/AA',
    category: 'refrigerator',
    candidateYears: [2006, 2016, 2026],
  };
  const variantSearch = {
    organic: [{
      position: 1,
      title: 'Samsung RF28R7351SR refrigerator introduced in 2024',
      link: 'https://www.samsung.com/support/RF28R7351SR',
      snippet: 'Support for the RF28R7351SR model family.',
      date: '2024-01-01',
    }],
  };
  const llmClaimsExact = {
    candidates: [{
      finishReason: 'STOP',
      content: {
        parts: [{
          text: JSON.stringify({
            extractedEvidence: [{
              resultIndex: 0,
              exactModelMatch: true,
              sourceType: 'manufacturer',
              approximateYear: 2024,
              dateMeaning: 'product_launch',
              ownershipAgeYears: null,
              explicitlyNewProduct: true,
              explicitlyDiscontinued: false,
              claimText: 'Model introduced in 2024',
            }],
          }),
        }],
      },
    }],
  };

  const result = await callDeterministicSerper(variantInput, {
    redis: null,
    serperApiKey: 'serper-test-key',
    geminiApiKey: 'gemini-test-key',
    serperFetchImpl: async () => response(variantSearch),
    geminiFetchImpl: async () => response(llmClaimsExact),
    currentYear: 2026,
  });

  assert.equal(result.extractedFacts[0].llmExactModelMatch, true);
  assert.equal(result.extractedFacts[0].modelMatchType, 'variant');
  assert.equal(result.extractedFacts[0].exactModelMatch, false);
  assert.equal(result.output.bestEstimateYear, null);
});
