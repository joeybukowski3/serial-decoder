import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import { createAgeLookupHandler } from '../../api/age-lookup.js';
import {
  loadVizioGenerationRegistry,
  resolveVizioModelGeneration,
} from '../../lib/vizio/model-generation-resolver.js';

function response() {
  return {
    statusCode: 0,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    setHeader() {},
  };
}

test('VIZIO local resolver benchmark reports coverage, avoidance, latency, and fallback safety', async (context) => {
  const registry = await loadVizioGenerationRegistry();
  const canonicalModels = [
    ...registry.exactModels.map((item) => item.canonicalModel),
    ...registry.generationPatterns.flatMap((item) => item.canonicalModels),
  ];
  const normalizedAliases = [
    ...registry.exactModels.flatMap((item) => item.aliases || []),
    ...canonicalModels.slice(0, 12).map((model) => model.replace('-', ' ')),
    ...canonicalModels.slice(12, 24).map((model) => model.replace('-', '')),
  ];
  const unsupportedModels = [
    'M321i-Z9', 'M322i-B9', 'M801i-B3', 'P65-D1',
    'V505-Z9', 'OLED75-H1', 'VQP85C-84', 'D75u-D9',
  ];
  const localInputs = [...canonicalModels, ...normalizedAliases];

  const startedAt = performance.now();
  const localResults = await Promise.all(localInputs.map((model) => resolveVizioModelGeneration(model)));
  const resolverDurationMs = performance.now() - startedAt;
  const unsupportedResults = await Promise.all(unsupportedModels.map((model) => resolveVizioModelGeneration(model)));

  const calls = { redis: 0, gemini: 0, serperGemini: 0, openai: 0, xai: 0 };
  const handler = createAgeLookupHandler({
    redisFactory: () => { calls.redis += 1; throw new Error('Redis should not run'); },
    providerLookup: async () => { calls.gemini += 1; throw new Error('Gemini should not run'); },
    groundedProviderLookup: async () => { calls.serperGemini += 1; throw new Error('Shared provider should not run'); },
    openAiProviderLookup: async () => { calls.openai += 1; throw new Error('OpenAI should not run'); },
    xaiProviderLookup: async () => { calls.xai += 1; throw new Error('xAI should not run'); },
    logger: { info() {}, warn() {}, error() {}, log() {} },
  });
  const conflictBrands = ['LG', 'Samsung', 'Acme'];
  for (let index = 0; index < canonicalModels.length; index += 1) {
    const model = canonicalModels[index];
    const brand = index % 10 === 0 ? conflictBrands[(index / 10) % conflictBrands.length | 0] : 'VIZIO';
    const out = response();
    await handler({
      method: 'POST', body: { query: `Brand: ${brand} | Model: ${model}` },
      headers: { 'x-forwarded-for': '127.0.0.1' }, socket: {},
    }, out);
    assert.equal(out.statusCode, 200, model);
    assert.equal(out.payload.canonicalModel, model, model);
    assert.equal(out.payload.providerAttempted, false, model);
  }

  const resolvedCount = localResults.filter(Boolean).length;
  const falsePositiveCount = unsupportedResults.filter(Boolean).length;
  const metrics = {
    exactAndAliasInputs: localInputs.length,
    localResolutionRate: resolvedCount / localInputs.length,
    providerCallsAvoided: canonicalModels.length,
    averageLocalResolverLatencyMs: resolverDurationMs / localInputs.length,
    unsupportedInputs: unsupportedModels.length,
    unsupportedFallbackCount: unsupportedResults.filter((result) => result === null).length,
    falsePositiveRate: falsePositiveCount / unsupportedModels.length,
    providerCalls: calls,
  };
  context.diagnostic(JSON.stringify(metrics));

  assert.equal(metrics.localResolutionRate, 1);
  assert.equal(metrics.falsePositiveRate, 0);
  assert.equal(metrics.unsupportedFallbackCount, unsupportedModels.length);
  assert.deepEqual(calls, { redis: 0, gemini: 0, serperGemini: 0, openai: 0, xai: 0 });
});
