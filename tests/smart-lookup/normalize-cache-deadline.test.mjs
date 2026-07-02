import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSmartAgeCacheKey } from '../../lib/smart-lookup/cache.js';
import { createDeadline } from '../../lib/smart-lookup/deadline.js';
import { classifySmartLookupQuery } from '../../lib/smart-lookup/normalize.js';
import { boundedRedisGet, boundedRateLimit } from '../../lib/smart-lookup/redis.js';
import { normalizeSmartAgeResult } from '../../lib/smart-lookup/result-schema.js';
import { applyEraHints } from '../../lib/smart-lookup/age-legacy.js';

test('query normalization treats punctuation and spacing as equivalent for cache keys', () => {
  const a = classifySmartLookupQuery('Samsung QN65-Q80A');
  const b = classifySmartLookupQuery(' samsung qn65 q80a ');
  assert.equal(a.modelIdentity, b.modelIdentity);
  assert.equal(buildSmartAgeCacheKey(a), buildSmartAgeCacheKey(b));
});

test('exact versus partial classification does not rely on length alone', () => {
  assert.equal(classifySmartLookupQuery('Samsung QN65-Q80A').specificityLevel, 'specific');
  assert.equal(classifySmartLookupQuery('QN65Q80A').specificityLevel, 'partial');
  assert.equal(classifySmartLookupQuery('ABCDEFGHIJKL12345678901234567890').specificityLevel, 'partial');
});

test('introduction year may precede production availability', () => {
  const result = normalizeSmartAgeResult({
    brand: 'Samsung', model: 'QN65Q80A', specificityLevel: 'specific', introductionYear: 2020,
    productionRange: { start: 2021, end: 2021, basis: 'retail availability' },
  }, { queryInfo: classifySmartLookupQuery('Samsung QN65-Q80A'), source: 'local-db', evidenceSource: 'local-db' });
  assert.equal(result.introductionYear, 2020);
  assert.deepEqual(result.productionRange, { start: 2021, end: 2021, basis: 'retail availability' });
});

test('future, reversed, and impossible ranges are rejected', () => {
  const queryInfo = classifySmartLookupQuery('Samsung QN65-Q80A');
  assert.throws(() => normalizeSmartAgeResult({ brand: 'Samsung', model: 'QN65Q80A', productionRange: { start: 2025, end: 2024 } }, { queryInfo }), /REVERSED_RANGE/);
  assert.throws(() => normalizeSmartAgeResult({ brand: 'Samsung', model: 'QN65Q80A', productionRange: { start: 2099, end: 2099 } }, { queryInfo, currentYear: 2026 }), /outside the supported range/);
});

test('broad era hints do not override exact model evidence', () => {
  const base = { brand: 'Samsung', model: 'QN65Q80A', introductionYear: 2020, productionRange: { start: 2021, end: 2021, basis: 'model evidence' }, evidence: [] };
  const hinted = applyEraHints(base, 'samsung qn65q80a vrt');
  assert.equal(hinted.introductionYear, 2020);
  assert.deepEqual(hinted.productionRange, base.productionRange);
});

test('deadline returns when Redis ignores AbortController', async () => {
  const deadline = createDeadline({ totalMs: 30 });
  const redis = { get: () => new Promise(() => {}) };
  const result = await boundedRedisGet(redis, 'k', deadline, { maxMs: 5 });
  assert.equal(result.status, 'timeout');
});

test('rate limiter fails open when Redis-backed limiter is unavailable', async () => {
  const deadline = createDeadline({ totalMs: 100 });
  const limiter = { limit: async () => { throw new Error('redis down'); } };
  const result = await boundedRateLimit(limiter, 'ip', deadline, { maxMs: 20 });
  assert.equal(result.success, true);
  assert.equal(result.status, 'unavailable');
});
