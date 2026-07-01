import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSerialRefinementCacheKey,
  SERIAL_REFINEMENT_CACHE_NAMESPACE,
} from '../../lib/serial-refinement/cache-key.js';

test('cache key is versioned and insensitive to candidate order', () => {
  const base = { brand: 'LG', category: 'appliances', model: 'WM3470HWA', candidateYears: [2024, 2004, 2014], decodedMonth: 'December' };
  const a = buildSerialRefinementCacheKey(base);
  const b = buildSerialRefinementCacheKey({ ...base, candidateYears: [2014, 2024, 2004] });
  assert.equal(a, b);
  assert.match(a, new RegExp(`^${SERIAL_REFINEMENT_CACHE_NAMESPACE.replace(':', '\\:')}:`));
});

test('cache key changes for model suffix, candidates, and decoded period', () => {
  const base = { brand: 'GE', category: 'appliances', model: 'JB258DM1WW', candidateYears: [1983, 1995, 2007, 2019], decodedMonth: 'April' };
  const key = buildSerialRefinementCacheKey(base);
  assert.notEqual(key, buildSerialRefinementCacheKey({ ...base, model: 'JB258DM2WW' }));
  assert.notEqual(key, buildSerialRefinementCacheKey({ ...base, candidateYears: [1995, 2007, 2019] }));
  assert.notEqual(key, buildSerialRefinementCacheKey({ ...base, decodedMonth: 'May' }));
});
