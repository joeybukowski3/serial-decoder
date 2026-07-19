import test from 'node:test';
import assert from 'node:assert/strict';
import {
  providerAttemptCountFromMetadata,
  recordProviderAttemptMetrics,
  reserveProviderBudget,
  secondsUntilNextUtcDay,
  smartLookupBudgetConfig,
  utcBudgetDate,
} from '../../lib/smart-lookup/budget.js';
import { createDeadline } from '../../lib/smart-lookup/deadline.js';

function deadline() {
  return createDeadline({ totalMs: 1000, now: Date.now });
}

function fakeRedis() {
  const values = new Map();
  const ttls = new Map();
  return {
    values,
    ttls,
    async eval(_script, keys, args) {
      const [serviceKey, combinedKey] = keys;
      const serviceLimit = Number(args[0]);
      const combinedLimit = Number(args[1]);
      const ttl = Number(args[2]);
      const serviceCurrent = Number(values.get(serviceKey) || 0);
      const combinedCurrent = Number(values.get(combinedKey) || 0);
      if (serviceCurrent >= serviceLimit || combinedCurrent >= combinedLimit) {
        return [0, serviceCurrent, combinedCurrent];
      }
      const serviceNext = serviceCurrent + 1;
      const combinedNext = combinedCurrent + 1;
      values.set(serviceKey, serviceNext);
      values.set(combinedKey, combinedNext);
      ttls.set(serviceKey, ttl);
      ttls.set(combinedKey, ttl);
      return [1, serviceNext, combinedNext];
    },
    async incrby(key, amount) {
      const next = Number(values.get(key) || 0) + Number(amount);
      values.set(key, next);
      return next;
    },
    async expire(key, ttl) {
      ttls.set(key, ttl);
      return 1;
    },
  };
}

test('budget config supports independent age, LKQ, and combined daily limits', () => {
  const config = smartLookupBudgetConfig({
    SMART_LOOKUP_AGE_DAILY_LIMIT: '3',
    SMART_LOOKUP_LKQ_DAILY_LIMIT: '4',
    SMART_LOOKUP_COMBINED_DAILY_LIMIT: '5',
  });
  assert.equal(config.ageLogicalLimit, 3);
  assert.equal(config.lkqLogicalLimit, 4);
  assert.equal(config.combinedLogicalLimit, 5);
});

test('UTC budget date and expiration use the next UTC day boundary', () => {
  const now = Date.UTC(2026, 6, 19, 23, 59, 30);
  assert.equal(utcBudgetDate(now), '2026-07-19');
  assert.equal(secondsUntilNextUtcDay(now), 30);
});

test('provider budget reservation is atomic for concurrent requests', async () => {
  const redis = fakeRedis();
  const config = { ageLogicalLimit: 1, lkqLogicalLimit: 1, combinedLogicalLimit: 10 };
  const [one, two] = await Promise.all([
    reserveProviderBudget(redis, 'age', deadline(), { config, now: () => Date.UTC(2026, 6, 19) }),
    reserveProviderBudget(redis, 'age', deadline(), { config, now: () => Date.UTC(2026, 6, 19) }),
  ]);
  assert.equal([one.allowed, two.allowed].filter(Boolean).length, 1);
  assert.equal([one.status, two.status].includes('denied'), true);
});

test('provider attempt metrics increment service and combined counters', async () => {
  const redis = fakeRedis();
  const result = await recordProviderAttemptMetrics(redis, 'lkq', 2, deadline(), {
    now: () => Date.UTC(2026, 6, 19, 12),
  });
  assert.equal(result.status, 'recorded');
  assert.equal(redis.values.get('smart-budget:lkq:attempts:2026-07-19'), 2);
  assert.equal(redis.values.get('smart-budget:combined:attempts:2026-07-19'), 2);
});

test('provider attempt count tracks fallback separately from logical lookup', () => {
  assert.equal(providerAttemptCountFromMetadata({ fallbackUsed: false }), 1);
  assert.equal(providerAttemptCountFromMetadata({ fallbackUsed: true }), 2);
  assert.equal(providerAttemptCountFromMetadata(null, 'PROVIDERS_UNAVAILABLE'), 2);
  assert.equal(providerAttemptCountFromMetadata(null, 'GLOBAL_BUDGET_EXHAUSTED'), 0);
});
