import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgeLookupHandler } from '../../api/age-lookup.js';
import { classifySmartOutcome } from '../../lib/smart-lookup/outcome.js';
import { allowingRateLimiter } from '../helpers/allowing-rate-limiter.mjs';
import { createFakeRedis } from '../helpers/fake-redis.mjs';

async function lookup(query, providerResult) {
  let providerCalls = 0;
  const handler = createAgeLookupHandler({
    rateLimiter: allowingRateLimiter,
    logger: { log() {}, warn() {}, error() {}, info() {} },
    localLookup: async () => null,
    redisFactory: () => createFakeRedis(),
    reserveProviderBudget: async () => ({ allowed: true, status: 'allowed', logicalLookupCount: 1 }),
    recordProviderAttemptMetrics: async () => ({ status: 'recorded', actualProviderAttemptCount: 1 }),
    providerLookup: async () => { providerCalls += 1; return providerResult; },
    groundedProviderLookup: async () => { throw new Error('unexpected grounded lookup'); },
  });
  const response = {
    statusCode: 0, payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    setHeader() {},
  };
  await handler({ method: 'POST', body: { query }, headers: { 'x-forwarded-for': '127.0.0.1' }, socket: {} }, response);
  return { ...response, providerCalls };
}

test('research can expand an unrecognized model code, including punctuation variants', async () => {
  for (const query of ['mvwx655dw1', 'MVWX-655-DW1']) {
    const { payload } = await lookup(query, {
      brand: 'Maytag', model: 'MVWX655DW1', exactModel: 'MVWX655DW1',
      likelyProduct: 'Maytag MVWX655DW1 washer', productType: 'washer',
      identityConfidence: 'high', originalIdentifier: query,
    });
    assert.equal(payload.errorCode, null, query);
    assert.equal(payload.brand, 'Maytag', query);
    assert.equal(payload.model, 'MVWX655DW1', query);
    assert.equal(classifySmartOutcome(payload).resultStatus, 'needs-detail', query);
  }
});

test('research cannot replace the supplied model with another product', async () => {
  const { payload } = await lookup('mvwx655dw1', {
    brand: 'Samsung', model: 'WF45T6000AW', likelyProduct: 'Samsung WF45T6000AW washer',
    identityConfidence: 'high', introductionYear: 2020,
  });
  assert.equal(payload.errorCode, 'UNRELATED_MODEL');
});

test('Runhood battery and Ametek part can be identified without a year', async () => {
  for (const [query, result, brand] of [
    ['RUNHOOD EB324', { brand: 'Runhood', model: 'EB324', exactModel: 'EB324', likelyProduct: 'Runhood Energy Bar EB324', productType: 'modular lithium-ion battery module', originalIdentifier: 'EB324' }, 'Runhood'],
    ['Ametek 46e 78570r', { brand: 'Ametek', model: '78570R', likelyProduct: 'Ametek 46E 78570R motor part', productType: 'motor part', originalIdentifier: '46e 78570r' }, 'Ametek'],
  ]) {
    const { payload } = await lookup(query, { ...result, identityConfidence: 'medium', identifierType: 'part number', identifierMatchExplanation: 'The listed code matches the product label.' });
    assert.equal(payload.errorCode, null, query);
    assert.equal(payload.brand, brand, query);
    assert.equal(payload.likelyProduct, result.likelyProduct, query);
    assert.equal(payload.introductionYear, null, query);
    assert.equal(payload.originalIdentifier, result.originalIdentifier, query);
    assert.equal(classifySmartOutcome(payload).resultStatus, 'needs-detail', query);
  }
});

test('bare numeric identifiers clarify deterministically, while labeled serials hand off', async () => {
  for (const query of ['0011579166', '18-100500-07', '6242819002968984']) {
    const { payload, providerCalls } = await lookup(query, {});
    assert.equal(providerCalls, 0, query);
    assert.equal(payload.resultType, 'identifier-clarification', query);
    assert.equal(classifySmartOutcome(payload).outcomeReason, 'identifier-clarification', query);
    assert.equal(payload.serialDetected, null, query);
  }
  const labeled = await lookup('serial 0011579166', {});
  assert.deepEqual(labeled.payload.serialDetected, { token: '0011579166', action: 'use-decoder' });
  assert.equal(labeled.providerCalls, 0);
  const contextual = await lookup('GE microwave serial 010TAKK03877', {
    brand: 'GE', productType: 'microwave', likelyProduct: 'GE microwave', identityConfidence: 'medium',
  });
  assert.equal(contextual.payload.brand, 'GE');
  assert.equal(contextual.payload.category, 'microwave');
  assert.deepEqual(contextual.payload.serialDetected, { token: '010TAKK03877', action: 'use-decoder' });
  assert.equal(contextual.providerCalls, 0);
  for (const [query, brand, serial] of [
    ['Trane HVAC serial 12345678', 'Trane', '12345678'],
    ['Samsung refrigerator serial ABC12345', 'Samsung', 'ABC12345'],
  ]) {
    const result = await lookup(query, {});
    assert.equal(result.providerCalls, 0, query);
    assert.equal(result.payload.brand, brand, query);
    assert.deepEqual(result.payload.serialDetected, { token: serial, action: 'use-decoder' }, query);
  }
});

test('a labeled serial alongside an exact model remains research eligible', async () => {
  const query = 'Maytag MVWX655DW1 serial C12345678';
  const { payload, providerCalls } = await lookup(query, {
    brand: 'Maytag', model: 'MVWX655DW1', exactModel: 'MVWX655DW1',
    likelyProduct: 'Maytag MVWX655DW1 washer', productType: 'washer',
    identityConfidence: 'high', originalIdentifier: 'MVWX655DW1',
  });
  assert.equal(providerCalls, 1);
  assert.equal(payload.model, 'MVWX655DW1');
  assert.deepEqual(payload.serialDetected, { token: 'C12345678', action: 'use-decoder' });
});
