import test from 'node:test';
import assert from 'node:assert/strict';
import { createRefineSerialDateHandler } from '../../api/refine-serial-date.js';

function createResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; },
  };
}

function request(overrides = {}) {
  return {
    method: 'POST',
    headers: { 'x-request-id': 'test-request' },
    body: {
      brand: 'Whirlpool',
      category: 'appliances',
      serial: 'TRD3481274',
      model: 'WMH31017HS12',
      candidateYears: [1994, 2024],
      decodedMonth: 'Week 48',
      context: '',
      ...overrides,
    },
  };
}

function officialEvidence(start, end) {
  return [{
    type: 'local-db',
    title: 'Verified local evidence',
    quality: 'official',
    verified: true,
    productionStart: start,
    productionEnd: end,
    supports: 'Verified model production window.',
  }];
}

function silentLogger() {
  return { info() {}, error() {}, warn() {} };
}

test('local exact model evidence resolves by intersection without provider call', async () => {
  let providerCalls = 0;
  const handler = createRefineSerialDateHandler({
    localLookup: async () => ({ evidence: officialEvidence(2023, 2025), normalization: null }),
    providerLookup: async () => { providerCalls += 1; return { evidence: [] }; },
    redisFactory: () => null,
    logger: silentLogger(),
  });
  const res = createResponse();
  await handler(request(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.status, 'resolved');
  assert.equal(res.payload.chosenYear, 2024);
  assert.equal(res.payload.provider, 'local-db');
  assert.equal(providerCalls, 0);
});

test('local family heuristic cannot resolve an exact year', async () => {
  const handler = createRefineSerialDateHandler({
    localLookup: async () => ({ evidence: [{ type: 'heuristic', quality: 'heuristic', yearRange: '2023-2025' }], normalization: null }),
    providerLookup: async () => { const error = new Error('missing'); error.code = 'GROUNDING_NOT_CONFIGURED'; throw error; },
    redisFactory: () => null,
    logger: silentLogger(),
  });
  const res = createResponse();
  await handler(request(), res);
  assert.equal(res.payload.status, 'unavailable');
  assert.equal(res.payload.chosenYear, null);
  assert.deepEqual(res.payload.remainingCandidateYears, [1994, 2024]);
});

test('Redis hit returns versioned cached structured response', async () => {
  const cached = {
    status: 'resolved',
    candidateYears: [1994, 2024],
    remainingCandidateYears: [2024],
    chosenYear: 2024,
    confidence: 'high',
    resolutionBasis: 'serial-plus-model',
    modelProductionRange: { start: 2023, end: 2025 },
    evidence: [],
    summary: 'Cached resolution',
    cacheStatus: 'miss',
    provider: 'gemini-google-search',
    timings: {},
    errorCode: null,
  };
  const handler = createRefineSerialDateHandler({
    localLookup: async () => ({ evidence: [], normalization: null }),
    providerLookup: async () => { throw new Error('provider should not run'); },
    redisFactory: () => ({ get: async () => cached, set: async () => {} }),
    logger: silentLogger(),
  });
  const res = createResponse();
  await handler(request(), res);
  assert.equal(res.payload.status, 'resolved');
  assert.equal(res.payload.cacheStatus, 'hit');
  assert.equal(res.payload.provider, 'redis');
});

test('Redis failure fails open to grounded provider', async () => {
  const handler = createRefineSerialDateHandler({
    localLookup: async () => ({ evidence: [], normalization: null }),
    providerLookup: async () => ({ evidence: [{
      type: 'manufacturer',
      title: 'Official product page',
      sourceUrl: 'https://manufacturer.example/model',
      quality: 'official',
      productionStart: 2023,
      productionEnd: 2025,
    }] }),
    redisFactory: () => ({ get: async () => { throw new Error('redis down'); }, set: async () => { throw new Error('redis down'); } }),
    logger: silentLogger(),
  });
  const res = createResponse();
  await handler(request(), res);
  assert.equal(res.payload.status, 'resolved');
  assert.equal(res.payload.provider, 'gemini-google-search');
});

test('two cited secondary sources can resolve a candidate', async () => {
  const handler = createRefineSerialDateHandler({
    localLookup: async () => ({ evidence: [], normalization: null }),
    providerLookup: async () => ({ evidence: [
      { type: 'retailer', title: 'A', sourceUrl: 'https://a.example/item', quality: 'strong-secondary', availabilityStart: 2023, availabilityEnd: 2025 },
      { type: 'review', title: 'B', sourceUrl: 'https://b.example/review', quality: 'strong-secondary', availabilityStart: 2024, availabilityEnd: 2026 },
    ] }),
    redisFactory: () => null,
    logger: silentLogger(),
  });
  const res = createResponse();
  await handler(request(), res);
  assert.equal(res.payload.status, 'resolved');
  assert.equal(res.payload.chosenYear, 2024);
  assert.equal(res.payload.confidence, 'medium');
});

test('missing citations cannot select a year', async () => {
  const handler = createRefineSerialDateHandler({
    localLookup: async () => ({ evidence: [], normalization: null }),
    providerLookup: async () => ({ evidence: [{ type: 'manufacturer', title: 'No URL', quality: 'official', productionStart: 2023, productionEnd: 2025 }] }),
    redisFactory: () => null,
    logger: silentLogger(),
  });
  const res = createResponse();
  await handler(request(), res);
  assert.equal(res.payload.status, 'unavailable');
  assert.equal(res.payload.chosenYear, null);
  assert.equal(res.payload.errorCode, 'INSUFFICIENT_EVIDENCE');
});

test('conflicting model and serial evidence returns conflict without nearest year', async () => {
  const handler = createRefineSerialDateHandler({
    localLookup: async () => ({ evidence: officialEvidence(2010, 2012), normalization: null }),
    redisFactory: () => null,
    logger: silentLogger(),
  });
  const res = createResponse();
  await handler(request(), res);
  assert.equal(res.payload.status, 'conflict');
  assert.equal(res.payload.chosenYear, null);
  assert.deepEqual(res.payload.remainingCandidateYears, []);
});

test('provider timeout preserves serial candidates', async () => {
  const handler = createRefineSerialDateHandler({
    localLookup: async () => ({ evidence: [], normalization: null }),
    providerLookup: async () => { const error = new Error('aborted'); error.name = 'AbortError'; throw error; },
    redisFactory: () => null,
    logger: silentLogger(),
  });
  const res = createResponse();
  await handler(request(), res);
  assert.equal(res.payload.status, 'unavailable');
  assert.equal(res.payload.errorCode, 'REFINEMENT_TIMEOUT');
  assert.deepEqual(res.payload.remainingCandidateYears, [1994, 2024]);
});


test('endpoint deadline returns even when a provider ignores AbortController', async () => {
  const handler = createRefineSerialDateHandler({
    localLookup: async () => ({ evidence: [], normalization: null }),
    providerLookup: async () => new Promise(() => {}),
    redisFactory: () => null,
    logger: silentLogger(),
    totalBudgetMs: 1000,
    providerBudgetMs: 40,
  });
  const res = createResponse();
  const started = Date.now();
  await handler(request(), res);
  assert.ok(Date.now() - started < 250);
  assert.equal(res.payload.status, 'unavailable');
  assert.equal(res.payload.errorCode, 'REFINEMENT_TIMEOUT');
  assert.equal(res.payload.chosenYear, null);
});

test('429 and 5xx provider errors do not leak raw errors or choose a year', async () => {
  for (const code of ['GROUNDING_RATE_LIMIT', 'GROUNDING_PROVIDER_ERROR']) {
    const handler = createRefineSerialDateHandler({
      localLookup: async () => ({ evidence: [], normalization: null }),
      providerLookup: async () => { const error = new Error('raw provider body secret'); error.code = code; throw error; },
      redisFactory: () => null,
      logger: silentLogger(),
    });
    const res = createResponse();
    await handler(request(), res);
    assert.equal(res.payload.status, 'unavailable');
    assert.equal(res.payload.chosenYear, null);
    assert.doesNotMatch(JSON.stringify(res.payload), /raw provider body secret/);
  }
});

test('strict chosenYear invariant holds for every non-resolved status', async () => {
  const handler = createRefineSerialDateHandler({
    localLookup: async () => ({ evidence: [], normalization: null }),
    providerLookup: async () => ({ evidence: [] }),
    redisFactory: () => null,
    logger: silentLogger(),
  });
  const res = createResponse();
  await handler(request(), res);
  assert.notEqual(res.payload.status, 'resolved');
  assert.equal(res.payload.chosenYear, null);
  assert.deepEqual(Object.keys(res.payload.timings).sort(), ['cacheMs', 'localMs', 'onlineLookupMs', 'totalMs'].sort());
});

test('input validation rejects malformed candidates and oversized context', async () => {
  const handler = createRefineSerialDateHandler({ logger: silentLogger() });
  const res1 = createResponse();
  await handler(request({ candidateYears: [] }), res1);
  assert.equal(res1.statusCode, 400);
  const res2 = createResponse();
  await handler(request({ context: 'x'.repeat(301) }), res2);
  assert.equal(res2.statusCode, 400);
});
