import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseSmartAgeTtl, prepareResultForCache } from '../../lib/smart-lookup/cache.js';
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
  assert.equal(chooseSmartAgeTtl(restored), 7 * 24 * 60 * 60);
});

test('cached xAI ungrounded age context stays uncited', () => {
  const cached = prepareResultForCache({
    brand: 'Dell',
    productFamily: 'XPS 15',
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
