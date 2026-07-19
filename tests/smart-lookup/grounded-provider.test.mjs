import test from 'node:test';
import assert from 'node:assert/strict';

import { createDeadline } from '../../lib/smart-lookup/deadline.js';
import {
  buildGroundedAgeProviderPrompt,
  callSmartLookupGroundedAgeProvider,
  extractJsonFromText,
  getSmartLookupProviderMetadata,
  isGroundedAgeEnabled,
  parseGroundingSources,
  SmartLookupProviderError,
} from '../../lib/smart-lookup/provider.js';

const queryInfo = {
  query: 'LG WM3900HWA',
  brand: 'LG',
  modelIdentity: 'WM3900HWA',
  modelCompleteness: 'exact',
};

const validAgeResult = {
  brand: 'LG',
  model: 'WM3900HWA',
  specificityLevel: 'specific',
  introductionYear: 2019,
  productionRange: { start: 2019, end: 2022, basis: 'model-availability' },
  notes: 'Model-level availability only.',
  evidence: [],
  suggestedModelNumbers: [],
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
  webSearchQueries: ['LG WM3900HWA specifications', 'LG WM3900HWA discontinued'],
  groundingChunks: [
    { web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc', title: 'lg.com' } },
    { web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/def', title: 'energystar.gov' } },
    { web: { uri: 'http://insecure.example.com/x', title: 'insecure.example.com' } },
    { web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/ghi', title: 'Best Buy — LG washer' } },
  ],
  groundingSupports: [{ segment: { startIndex: 0, endIndex: 10 }, groundingChunkIndices: [0] }],
};

test('isGroundedAgeEnabled reads the env flag and defaults off', () => {
  assert.equal(isGroundedAgeEnabled({}), false);
  assert.equal(isGroundedAgeEnabled({ SMART_LOOKUP_GROUNDED_AGE: '0' }), false);
  assert.equal(isGroundedAgeEnabled({ SMART_LOOKUP_GROUNDED_AGE: '1' }), true);
  assert.equal(isGroundedAgeEnabled({ SMART_LOOKUP_GROUNDED_AGE: 'true' }), true);
  assert.equal(isGroundedAgeEnabled({ SMART_LOOKUP_GROUNDED_AGE: 'on' }), true);
});

test('extractJsonFromText strips fences and surrounding prose', () => {
  assert.equal(extractJsonFromText('```json\n{"a":1}\n```'), '{"a":1}');
  assert.equal(extractJsonFromText('Here you go: {"a":{"b":2}} thanks'), '{"a":{"b":2}}');
  assert.equal(extractJsonFromText('no json here'), null);
  assert.equal(extractJsonFromText(''), null);
});

test('parseGroundingSources keeps https redirect sources and drops non-https', () => {
  const { sources, searchQueryCount } = parseGroundingSources({ groundingMetadata: sampleGroundingMetadata });
  assert.equal(searchQueryCount, 2);
  assert.equal(sources.length, 3);
  assert.equal(sources[0].domain, 'lg.com');
  assert.equal(sources[0].title, 'lg.com');
  assert.equal(sources[1].domain, 'energystar.gov');
  // Non-hostname titles keep the title but fall back to the URI hostname.
  assert.equal(sources[2].title, 'Best Buy — LG washer');
  assert.equal(sources[2].domain, 'vertexaisearch.cloud.google.com');
  assert.ok(sources.every((source) => source.uri.startsWith('https://')));
});

test('parseGroundingSources tolerates malformed metadata without throwing', () => {
  assert.deepEqual(parseGroundingSources(null), { sources: [], searchQueryCount: 0 });
  assert.deepEqual(parseGroundingSources({}), { sources: [], searchQueryCount: 0 });
  assert.deepEqual(parseGroundingSources({ groundingMetadata: { groundingChunks: 'nope', webSearchQueries: 'nope' } }), { sources: [], searchQueryCount: 0 });
  assert.deepEqual(
    parseGroundingSources({ groundingMetadata: { groundingChunks: [{}, { web: {} }, { web: { uri: 42 } }] } }),
    { sources: [], searchQueryCount: 0 }
  );
});

test('parseGroundingSources caps the source list at five entries', () => {
  const chunks = Array.from({ length: 9 }, (_, index) => ({
    web: { uri: `https://vertexaisearch.cloud.google.com/grounding-api-redirect/${index}`, title: `source${index}.com` },
  }));
  const { sources } = parseGroundingSources({ groundingMetadata: { groundingChunks: chunks } });
  assert.equal(sources.length, 5);
});

test('grounded prompt preserves the exact model token and source preference order', () => {
  const prompt = buildGroundedAgeProviderPrompt(queryInfo);
  assert.match(prompt, /WM3900HWA/);
  assert.match(prompt, /suffix or regional-variant characters exactly/i);
  assert.match(prompt, /manufacturer product pages/i);
  assert.match(prompt, /official registries/i);
  assert.match(prompt, /Never treat marketplace listings/i);
  assert.match(prompt, /do not silently complete it/i);
  assert.match(prompt, /Do not estimate the manufacture date of an individual physical unit/i);
});

test('grounded request enables google_search and omits responseMimeType', async () => {
  let requestBody = null;
  const result = await callSmartLookupGroundedAgeProvider(queryInfo, {
    apiKey: 'gemini-test',
    deadline: createDeadline({ totalMs: 1000 }),
    fetchImpl: async (url, init) => {
      requestBody = JSON.parse(init.body);
      return jsonResponse(200, groundedPayload(validAgeResult, sampleGroundingMetadata));
    },
  });

  assert.deepEqual(requestBody.tools, [{ google_search: {} }]);
  assert.equal(requestBody.generationConfig.responseMimeType, undefined);
  assert.deepEqual(result, validAgeResult);
  const metadata = getSmartLookupProviderMetadata(result);
  assert.equal(metadata.provider, 'gemini');
  assert.equal(metadata.grounded, true);
  assert.equal(metadata.groundedSources.length, 3);
  assert.equal(metadata.searchQueryCount, 2);
});

test('ungrounded request keeps responseMimeType application/json', async () => {
  const { callSmartLookupAgeProvider } = await import('../../lib/smart-lookup/provider.js');
  let requestBody = null;
  await callSmartLookupAgeProvider(queryInfo, {
    apiKey: 'gemini-test',
    deadline: createDeadline({ totalMs: 1000 }),
    fetchImpl: async (url, init) => {
      requestBody = JSON.parse(init.body);
      return jsonResponse(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(validAgeResult) }] } }] });
    },
  });
  assert.equal(requestBody.generationConfig.responseMimeType, 'application/json');
  assert.equal(requestBody.tools, undefined);
});

test('grounded call with missing grounding metadata still parses but reports zero sources', async () => {
  const result = await callSmartLookupGroundedAgeProvider(queryInfo, {
    apiKey: 'gemini-test',
    deadline: createDeadline({ totalMs: 1000 }),
    fetchImpl: async () => jsonResponse(200, groundedPayload(validAgeResult, undefined)),
  });
  const metadata = getSmartLookupProviderMetadata(result);
  assert.equal(metadata.grounded, true);
  assert.deepEqual(metadata.groundedSources, []);
});

test('grounded malformed JSON falls back to bounded Groq as ungrounded', async () => {
  const urls = [];
  const result = await callSmartLookupGroundedAgeProvider(queryInfo, {
    apiKey: 'gemini-test',
    groqApiKey: 'groq-test',
    deadline: createDeadline({ totalMs: 2000 }),
    fetchImpl: async (url) => {
      urls.push(url);
      if (url.includes('generativelanguage')) {
        return jsonResponse(200, { candidates: [{ content: { parts: [{ text: 'not json at all' }] } }] });
      }
      return jsonResponse(200, { choices: [{ message: { content: JSON.stringify(validAgeResult) } }] });
    },
  });
  assert.equal(urls.length, 2);
  const metadata = getSmartLookupProviderMetadata(result);
  assert.equal(metadata.provider, 'groq');
  assert.equal(metadata.fallbackUsed, true);
  assert.equal(metadata.grounded, false);
  assert.deepEqual(metadata.groundedSources, []);
});

test('grounded HTTP 400 (tool misconfiguration) is fallback-eligible', async () => {
  const urls = [];
  const result = await callSmartLookupGroundedAgeProvider(queryInfo, {
    apiKey: 'gemini-test',
    groqApiKey: 'groq-test',
    deadline: createDeadline({ totalMs: 2000 }),
    fetchImpl: async (url) => {
      urls.push(url);
      if (url.includes('generativelanguage')) return jsonResponse(400, { error: { message: 'tool not supported' } });
      return jsonResponse(200, { choices: [{ message: { content: JSON.stringify(validAgeResult) } }] });
    },
  });
  assert.equal(urls.length, 2);
  assert.equal(getSmartLookupProviderMetadata(result).provider, 'groq');
});

test('missing Gemini configuration surfaces PROVIDER_NOT_CONFIGURED without Groq key', async () => {
  await assert.rejects(
    callSmartLookupGroundedAgeProvider(queryInfo, {
      apiKey: '',
      groqApiKey: '',
      deadline: createDeadline({ totalMs: 500 }),
      fetchImpl: async () => { throw new Error('should not fetch'); },
    }),
    (error) => error instanceof SmartLookupProviderError && error.code === 'PROVIDER_NOT_CONFIGURED'
  );
});

test('a grounded stage timeout does not start Groq (no second timeout chain)', async () => {
  const urls = [];
  await assert.rejects(
    callSmartLookupGroundedAgeProvider(queryInfo, {
      apiKey: 'gemini-test',
      groqApiKey: 'groq-test',
      deadline: createDeadline({ totalMs: 400 }),
      maxMs: 120,
      reserveMs: 10,
      fetchImpl: async (url) => {
        urls.push(url);
        await new Promise((resolve) => setTimeout(resolve, 300));
        return jsonResponse(200, groundedPayload(validAgeResult, sampleGroundingMetadata));
      },
    }),
    (error) => error?.code === 'STAGE_TIMEOUT'
  );
  assert.equal(urls.length, 1);
});

test('grounded prompt and request never contain the API key', async () => {
  let request = null;
  await callSmartLookupGroundedAgeProvider(queryInfo, {
    apiKey: 'secret-gemini-key',
    deadline: createDeadline({ totalMs: 1000 }),
    fetchImpl: async (url, init) => {
      request = { url, body: init.body };
      return jsonResponse(200, groundedPayload(validAgeResult, sampleGroundingMetadata));
    },
  });
  assert.equal(request.url.includes('secret-gemini-key'), false);
  assert.equal(request.body.includes('secret-gemini-key'), false);
});
