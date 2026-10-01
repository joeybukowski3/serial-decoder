import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SMART_AGE_NEEDS_DETAIL_TTL_SECONDS,
  SMART_AGE_NEGATIVE_TTL_SECONDS,
  buildSmartAgeCacheKey,
  chooseSmartAgeTtl,
  prepareResultForCache,
} from '../../lib/smart-lookup/cache.js';
import { normalizeCachedSmartAgeResult } from '../../lib/smart-lookup/result-schema.js';
import { classifySmartLookupQuery } from '../../lib/smart-lookup/normalize.js';

const queryInfo = classifySmartLookupQuery('LG TV');
const source = { title: 'LG history', domain: 'lg.com', uri: 'https://www.lg.com/global/about-lg/history' };

test('cached xAI web age context restores citations and provider labels', () => {
  const cached = prepareResultForCache({
    brand: 'LG',
    category: 'television',
    contextLevel: 'brand-category',
    historicalContext: 'LG television history was researched from current web sources.',
    categoryEntryYear: 1966,
    source: 'xai',
    originSource: 'xai',
    evidenceSource: 'xai-web',
    sources: [source],
    retrievedAt: '2026-07-23T00:00:00.000Z',
    providerAttempted: true,
    fallbackUsed: true,
  });
  const restored = normalizeCachedSmartAgeResult(cached, { queryInfo });
  assert.equal(restored.source, 'cache');
  assert.equal(restored.originSource, 'xai');
  assert.equal(restored.evidenceSource, 'xai-web');
  assert.equal(restored.sources.length, 1);
  assert.equal(restored.sources[0].uri, source.uri);
  assert.equal(chooseSmartAgeTtl(restored), 180 * 24 * 60 * 60);
});

test('successful shared Serper estimates use the long-lived versioned cache policy', () => {
  assert.equal(chooseSmartAgeTtl({ evidenceSource: 'serper-extracted' }), 180 * 24 * 60 * 60);
});

test('provider failures short-cache useful deterministic substitutes', () => {
  assert.equal(chooseSmartAgeTtl({
    evidenceSource: 'heuristic',
    fallbackKind: 'deterministic-exact-model',
    errorCode: 'PROVIDER_ERROR',
  }), SMART_AGE_NEGATIVE_TTL_SECONDS);
  assert.equal(chooseSmartAgeTtl({ evidenceSource: 'none', errorCode: 'PROVIDER_ERROR' }), 0);
});

test('cached xAI ungrounded age context stays uncited', () => {
  const cached = prepareResultForCache({
    brand: 'Dell',
    productFamily: 'XPS 15',
    // Dated: a yearless answer is short-lived by policy (see the needs-detail TTL tests).
    familyIntroductionYear: 2012,
    source: 'xai',
    originSource: 'xai',
    evidenceSource: 'xai-ungrounded',
    sources: [source],
    providerAttempted: true,
    fallbackUsed: true,
  });
  const restored = normalizeCachedSmartAgeResult(cached, { queryInfo: classifySmartLookupQuery('Dell XPS 15') });
  assert.equal(restored.originSource, 'xai');
  assert.equal(restored.evidenceSource, 'xai-ungrounded');
  assert.deepEqual(restored.sources, []);
  assert.equal(chooseSmartAgeTtl(restored), 7 * 24 * 60 * 60);
});

// ── Needs-detail / yearless cache policy ──────────────────────────────────────

test('needs-detail TTL is inside the 15-60 minute window', () => {
  assert.ok(SMART_AGE_NEEDS_DETAIL_TTL_SECONDS >= 15 * 60);
  assert.ok(SMART_AGE_NEEDS_DETAIL_TTL_SECONDS <= 60 * 60);
});

test('a yearless provider answer is never cached for days, however it was produced', () => {
  for (const evidenceSource of ['gemini-grounded', 'gemini-ungrounded', 'openai-web', 'openai-ungrounded', 'xai-web', 'serper-extracted']) {
    assert.equal(
      chooseSmartAgeTtl({ evidenceSource, yearSignal: 'none' }),
      SMART_AGE_NEEDS_DETAIL_TTL_SECONDS,
      evidenceSource,
    );
  }
});

test('general guidance and withheld-timing results get the short TTL', () => {
  assert.equal(chooseSmartAgeTtl({ evidenceSource: 'gemini-ungrounded', routeMode: 'general_guidance', yearSignal: 'year' }), SMART_AGE_NEEDS_DETAIL_TTL_SECONDS);
  assert.equal(chooseSmartAgeTtl({ evidenceSource: 'gemini-grounded', yearEvidenceWithheld: true }), SMART_AGE_NEEDS_DETAIL_TTL_SECONDS);
});

test('dated results keep their existing long-lived TTLs', () => {
  assert.equal(chooseSmartAgeTtl({ evidenceSource: 'gemini-grounded', yearSignal: 'range' }), 180 * 24 * 60 * 60);
  assert.equal(chooseSmartAgeTtl({ evidenceSource: 'gemini-grounded', yearSignal: 'open-ended' }), 180 * 24 * 60 * 60);
  assert.equal(chooseSmartAgeTtl({ evidenceSource: 'gemini-ungrounded', yearSignal: 'year' }), 7 * 24 * 60 * 60);
});

test('route mode is part of the cache identity', () => {
  const info = classifySmartLookupQuery('Samsung Refrigerator');
  const guidance = buildSmartAgeCacheKey(info, { routeMode: 'general_guidance' });
  const precision = buildSmartAgeCacheKey(info, { routeMode: 'precision_research' });
  assert.notEqual(guidance, precision);
});
