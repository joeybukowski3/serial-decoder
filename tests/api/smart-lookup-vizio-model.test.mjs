import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgeLookupHandler } from '../../api/age-lookup.js';
import { findLocalModelAgeResult } from '../../lib/smart-lookup/age-legacy.js';
import { normalizeSmartAgeResult } from '../../lib/smart-lookup/result-schema.js';

function req(query) {
  return {
    method: 'POST',
    body: { query },
    headers: { 'x-forwarded-for': '127.0.0.1' },
    socket: {},
  };
}

function res() {
  return {
    statusCode: 0,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    setHeader() {},
  };
}

function localOnlyHandler(calls) {
  return createAgeLookupHandler({
    redisFactory: () => { calls.redis += 1; throw new Error('Redis must not run for verified local evidence'); },
    providerLookup: async () => { calls.gemini += 1; throw new Error('Gemini must not run for verified local evidence'); },
    groundedProviderLookup: async () => { calls.serperGemini += 1; throw new Error('Shared research must not run for verified local evidence'); },
    openAiProviderLookup: async () => { calls.openai += 1; throw new Error('OpenAI must not run for verified local evidence'); },
    xaiProviderLookup: async () => { calls.xai += 1; throw new Error('xAI must not run for verified local evidence'); },
    logger: { info() {}, warn() {}, error() {}, log() {} },
  });
}

test('verified VIZIO M321i-A2 resolves locally to model-production evidence', async () => {
  const calls = { redis: 0, gemini: 0, serperGemini: 0, openai: 0, xai: 0 };
  const out = res();
  await localOnlyHandler(calls)(req('Brand: VIZIO | Model: M321i-A2'), out);

  assert.equal(out.statusCode, 200);
  assert.equal(out.payload.brand, 'VIZIO');
  assert.equal(out.payload.canonicalModel, 'M321i-A2');
  assert.equal(out.payload.enteredModel, 'M321i-A2');
  assert.equal(out.payload.bestEstimateYear, 2013);
  assert.deepEqual(out.payload.estimatedRange, {
    start: 2013, end: 2014, current: false, basis: 'verified-model-generation',
  });
  assert.equal(out.payload.estimatedYearType, 'model-production');
  assert.equal(out.payload.individualManufactureYear, null);
  assert.equal(out.payload.estimateBasis, 'verified-model-generation');
  assert.equal(out.payload.providerAttempted, false);
  assert.deepEqual(calls, { redis: 0, gemini: 0, serperGemini: 0, openai: 0, xai: 0 });
});

test('LG entry preserves the brand conflict while returning the verified VIZIO estimate', async () => {
  const calls = { redis: 0, gemini: 0, serperGemini: 0, openai: 0, xai: 0 };
  const out = res();
  await localOnlyHandler(calls)(req('Brand: LG | Serial: LWJ20PAP1801284 | Model: M321i-A2'), out);

  assert.equal(out.statusCode, 200);
  assert.equal(out.payload.brand, 'LG');
  assert.equal(out.payload.enteredBrand, 'LG');
  assert.equal(out.payload.recognizedBrand, 'VIZIO');
  assert.equal(out.payload.recognizedModel, 'M321i-A2');
  assert.equal(out.payload.evidenceConflict, true);
  assert.equal(out.payload.evidenceConflictKind, 'brand');
  assert.equal(out.payload.bestEstimateYear, 2013);
  assert.deepEqual(out.payload.productionRange, {
    start: 2013, end: 2014, basis: 'verified-model-generation',
  });
  assert.equal(out.payload.individualManufactureYear, null);
  assert.equal(out.payload.providerAttempted, false);
  assert.match(out.payload.notes, /entered values were preserved/i);
  assert.deepEqual(calls, { redis: 0, gemini: 0, serperGemini: 0, openai: 0, xai: 0 });
});

test('VIZIO model label ambiguity canonicalizes only verified exact variants', async () => {
  const variants = [
    ['M321i-A2', 'canonical-model'],
    ['M321I-A2', 'canonical-model'],
    ['M32li-A2', 'exact-alias'],
    ['M32LI-A2', 'exact-alias'],
    ['M321i A2', 'canonical-model'],
    ['M321iA2', 'canonical-model'],
  ];

  for (const [entered, matchedBy] of variants) {
    const result = await findLocalModelAgeResult(`Brand: VIZIO | Model: ${entered}`);
    assert.equal(result.enteredModel, entered);
    assert.equal(result.canonicalModel, 'M321i-A2');
    assert.equal(result.matchedBy, matchedBy);
    assert.equal(result.bestEstimateYear, 2013);
  }
});

test('unsupported VIZIO suffixes do not inherit the M321i-A2 generation', async () => {
  for (const model of ['M321i-Z9', 'M321i-A9', 'M322i-B9', 'M801i-B3']) {
    assert.equal(await findLocalModelAgeResult(`VIZIO ${model}`), null, model);
  }
});

test('official VIZIO generations resolve locally without Redis or providers', async () => {
  const models = [
    ['M401i-A3', 2013], ['M801d-A3', 2013],
    ['M322i-B1', 2014], ['M492i-B2', 2014], ['M602i-B3', 2014],
    ['M801i-A3', 2014], ['D55u-D1', 2015], ['P65-C1', 2016],
    ['M65-F0', 2018], ['V505-G9', 2019], ['M558-G1', 2019],
    ['OLED65-H1', 2021], ['M65Q7-J01', 2022], ['VQP75C-84', 2023],
  ];
  for (const [model, year] of models) {
    const calls = { redis: 0, gemini: 0, serperGemini: 0, openai: 0, xai: 0 };
    const out = res();
    await localOnlyHandler(calls)(req(`Brand: VIZIO | Model: ${model}`), out);
    assert.equal(out.statusCode, 200, model);
    assert.equal(out.payload.canonicalModel, model, model);
    assert.equal(out.payload.bestEstimateYear, year, model);
    assert.equal(out.payload.individualManufactureYear, null, model);
    assert.equal(out.payload.providerAttempted, false, model);
    assert.deepEqual(calls, { redis: 0, gemini: 0, serperGemini: 0, openai: 0, xai: 0 }, model);
  }
});

test('LG, Samsung, and unknown entered brands preserve VIZIO conflicts and estimates', async () => {
  for (const enteredBrand of ['LG', 'Samsung', 'Acme']) {
    const calls = { redis: 0, gemini: 0, serperGemini: 0, openai: 0, xai: 0 };
    const out = res();
    await localOnlyHandler(calls)(req(`Brand: ${enteredBrand} | Model: M801i-A3`), out);
    assert.equal(out.payload.brand, enteredBrand);
    assert.equal(out.payload.enteredBrand, enteredBrand);
    assert.equal(out.payload.recognizedBrand, 'VIZIO');
    assert.equal(out.payload.canonicalModel, 'M801i-A3');
    assert.equal(out.payload.bestEstimateYear, 2014);
    assert.equal(out.payload.evidenceConflict, true);
    assert.equal(out.payload.providerAttempted, false);
    assert.deepEqual(calls, { redis: 0, gemini: 0, serperGemini: 0, openai: 0, xai: 0 });
  }
});

test('serial manufacture evidence outranks model generation and unresolved serial does not erase it', () => {
  const queryInfo = {
    brand: 'VIZIO', modelIdentity: 'M321IA2', exactModel: 'M321IA2',
    specificityLevel: 'specific', querySpecificity: 'exact-model',
  };
  const modelEvidence = {
    brand: 'VIZIO', model: 'M321i-A2', productionRange: { start: 2013, end: 2014 },
    bestEstimateYear: 2013, estimatedRange: { start: 2013, end: 2014 },
    estimatedYearType: 'model-production', estimateBasis: 'verified-model-generation',
  };

  const unresolved = normalizeSmartAgeResult(modelEvidence, {
    queryInfo, source: 'local-db', currentYear: 2026,
  });
  assert.equal(unresolved.bestEstimateYear, 2013);
  assert.equal(unresolved.individualManufactureYear, null);
  assert.equal(unresolved.estimatedYearType, 'model-production');

  const serialResolved = normalizeSmartAgeResult({ ...modelEvidence, individualManufactureYear: 2014 }, {
    queryInfo, source: 'decoder-verified', allowIndividualManufactureYear: true, currentYear: 2026,
  });
  assert.equal(serialResolved.bestEstimateYear, 2014);
  assert.equal(serialResolved.individualManufactureYear, 2014);
  assert.equal(serialResolved.estimatedYearType, 'individual-manufacture');
  assert.equal(serialResolved.estimateBasis, 'serial-decode');
  assert.deepEqual(serialResolved.estimatedRange, {
    start: 2014, end: 2014, current: false, basis: 'serial-decode',
  });
});
