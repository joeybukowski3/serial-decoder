import test from 'node:test';
import assert from 'node:assert/strict';

import { createDeadline } from '../../lib/smart-lookup/deadline.js';
import {
  buildGroundedLkqProviderPrompt,
  callSmartLookupGroundedLkqProvider,
  getSmartLookupProviderMetadata,
  isGroundedLkqEnabled,
  SmartLookupProviderError,
} from '../../lib/smart-lookup/provider.js';

const queryInfo = {
  query: 'LG WM3900HWA',
  brand: 'LG',
  modelIdentity: 'WM3900HWA',
  modelCompleteness: 'exact',
};

const validLkqResult = {
  itemSummary: { brand: 'LG', model: 'WM3900HWA', category: 'washer', name: 'LG WM3900HWA', availability: 'Discontinued' },
  specLabels: ['Capacity', 'Type', 'Fuel', 'Voltage', 'Install'],
  originalSpecs: { Capacity: '4.5 cu ft' },
  replacementRelationship: 'direct-successor',
  replacementRationale: 'LG lists WM4000HWA as the successor on lg.com',
  replacement: { name: 'LG WM4000HWA', brand: 'LG', model: 'WM4000HWA', category: 'washer' },
  replacementSpecs: { Capacity: '5.0 cu ft' },
  materialDifferences: ['Larger capacity'],
  compatibilityStatus: 'likely-compatible',
  compatibilityWarnings: [],
  priceObservations: [],
  evidence: [],
};

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, async json() { return body; } };
}

function groundedPayload(value, groundingMetadata) {
  return {
    candidates: [{
      content: { parts: [{ text: '```json\n' + JSON.stringify(value) + '\n```' }] },
      groundingMetadata,
    }],
  };
}

const sampleGroundingMetadata = {
  webSearchQueries: ['LG WM3900HWA successor', 'LG WM4000HWA price'],
  groundingChunks: [
    { web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/a', title: 'lg.com' } },
    { web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/b', title: 'bestbuy.com' } },
  ],
};

test('isGroundedLkqEnabled reads its own env flag, independent of the age flag', () => {
  assert.equal(isGroundedLkqEnabled({}), false);
  assert.equal(isGroundedLkqEnabled({ SMART_LOOKUP_GROUNDED_AGE: '1' }), false);
  assert.equal(isGroundedLkqEnabled({ SMART_LOOKUP_GROUNDED_LKQ: '1' }), true);
  assert.equal(isGroundedLkqEnabled({ SMART_LOOKUP_GROUNDED_LKQ: 'true' }), true);
  assert.equal(isGroundedLkqEnabled({ SMART_LOOKUP_GROUNDED_LKQ: 'on' }), true);
});

test('grounded LKQ prompt requires identity-before-pricing sequencing and source discipline', () => {
  const prompt = buildGroundedLkqProviderPrompt(queryInfo);
  assert.match(prompt, /WM3900HWA/);
  assert.match(prompt, /identify the original item, identify the best-supported replacement candidate, compare specifications, classify the replacement relationship, and only then gather current price evidence/i);
  assert.match(prompt, /Preserve the exact original model token/i);
  assert.match(prompt, /manufacturer current product page/i);
  assert.match(prompt, /Do not claim direct-successor status without explicit manufacturer evidence/i);
  assert.match(prompt, /Do not invent a URL/i);
  assert.match(prompt, /Exclude accessories, parts, warranties, and installation-only/i);
  assert.match(prompt, /none-found/);
});

test('grounded LKQ request enables google_search and omits responseMimeType', async () => {
  let requestBody = null;
  const result = await callSmartLookupGroundedLkqProvider(queryInfo, {
    apiKey: 'gemini-test',
    deadline: createDeadline({ totalMs: 1000 }),
    fetchImpl: async (url, init) => {
      requestBody = JSON.parse(init.body);
      return jsonResponse(200, groundedPayload(validLkqResult, sampleGroundingMetadata));
    },
  });

  assert.deepEqual(requestBody.tools, [{ google_search: {} }]);
  assert.equal(requestBody.generationConfig.responseMimeType, undefined);
  assert.deepEqual(result, validLkqResult);
  const metadata = getSmartLookupProviderMetadata(result);
  assert.equal(metadata.provider, 'gemini');
  assert.equal(metadata.grounded, true);
  assert.equal(metadata.groundedSources.length, 2);
  assert.equal(metadata.searchQueryCount, 2);
});

test('grounded LKQ malformed JSON falls back to bounded Groq as ungrounded', async () => {
  const urls = [];
  const result = await callSmartLookupGroundedLkqProvider(queryInfo, {
    apiKey: 'gemini-test',
    groqApiKey: 'groq-test',
    deadline: createDeadline({ totalMs: 2000 }),
    fetchImpl: async (url) => {
      urls.push(url);
      if (url.includes('generativelanguage')) {
        return jsonResponse(200, { candidates: [{ content: { parts: [{ text: 'not json at all' }] } }] });
      }
      return jsonResponse(200, { choices: [{ message: { content: JSON.stringify(validLkqResult) } }] });
    },
  });
  assert.equal(urls.length, 2);
  const metadata = getSmartLookupProviderMetadata(result);
  assert.equal(metadata.provider, 'groq');
  assert.equal(metadata.fallbackUsed, true);
  assert.equal(metadata.grounded, false);
});

test('a grounded LKQ stage timeout does not start Groq (no second timeout chain)', async () => {
  const urls = [];
  await assert.rejects(
    callSmartLookupGroundedLkqProvider(queryInfo, {
      apiKey: 'gemini-test',
      groqApiKey: 'groq-test',
      deadline: createDeadline({ totalMs: 400 }),
      maxMs: 120,
      reserveMs: 10,
      fetchImpl: async (url) => {
        urls.push(url);
        await new Promise((resolve) => setTimeout(resolve, 300));
        return jsonResponse(200, groundedPayload(validLkqResult, sampleGroundingMetadata));
      },
    }),
    (error) => error?.code === 'STAGE_TIMEOUT'
  );
  assert.equal(urls.length, 1);
});

test('grounded LKQ HTTP 400 (tool misconfiguration) is fallback-eligible', async () => {
  const urls = [];
  const result = await callSmartLookupGroundedLkqProvider(queryInfo, {
    apiKey: 'gemini-test',
    groqApiKey: 'groq-test',
    deadline: createDeadline({ totalMs: 2000 }),
    fetchImpl: async (url) => {
      urls.push(url);
      if (url.includes('generativelanguage')) return jsonResponse(400, { error: { message: 'tool not supported' } });
      return jsonResponse(200, { choices: [{ message: { content: JSON.stringify(validLkqResult) } }] });
    },
  });
  assert.equal(urls.length, 2);
  assert.equal(getSmartLookupProviderMetadata(result).provider, 'groq');
});

test('grounded LKQ prompt and request never contain the API key', async () => {
  let request = null;
  await callSmartLookupGroundedLkqProvider(queryInfo, {
    apiKey: 'secret-gemini-key',
    deadline: createDeadline({ totalMs: 1000 }),
    fetchImpl: async (url, init) => {
      request = { url, body: init.body };
      return jsonResponse(200, groundedPayload(validLkqResult, sampleGroundingMetadata));
    },
  });
  assert.equal(request.url.includes('secret-gemini-key'), false);
  assert.equal(request.body.includes('secret-gemini-key'), false);
});

test('missing Gemini configuration surfaces PROVIDER_NOT_CONFIGURED without a Groq key', async () => {
  await assert.rejects(
    callSmartLookupGroundedLkqProvider(queryInfo, {
      apiKey: '',
      groqApiKey: '',
      deadline: createDeadline({ totalMs: 500 }),
      fetchImpl: async () => { throw new Error('should not fetch'); },
    }),
    (error) => error instanceof SmartLookupProviderError && error.code === 'PROVIDER_NOT_CONFIGURED'
  );
});
