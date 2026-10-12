import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendByRetrieval } from '../../lib/replacement-discovery/live-retrieval.js';
import { refrigeratorSourcePriority } from '../../lib/replacement-discovery/refrigerator-retrieval.js';
import { fridgeProviders, lfG8330Url, lfZ6211Url, result } from '../helpers/replacement-public-fixtures.mjs';

/** LG refrigerator NO_RESULT diagnosis: source selection must stay on the U.S. storefront, and optional enrichment must not be fatal. */

const lgCanadaUrl = 'https://www.lg.com/ca_en/refrigerators/french-door/lf25z6211s/';
const fetched = (calls) => calls.fetch.filter((url) => /\/ca_en\/|\/ca_fr\/|\/latin_en\//.test(url));

test('non-U.S. lg.com product pages are never ranked as sources for a model', () => {
  const us = result('LG LF25Z6211S refrigerator', lfZ6211Url);
  const canada = result('LG LF25Z6211S refrigerator', lgCanadaUrl);
  assert.equal(refrigeratorSourcePriority(us, 'LF25Z6211S', 'LG'), 1);
  assert.equal(refrigeratorSourcePriority(canada, 'LF25Z6211S', 'LG'), 99);
  const canadaPdf = result('LF25Z6211S', 'https://www.lg.com/content/dam/channel/wcms/ca_en/support/products/documents/LF25Z6211S.pdf');
  assert.equal(refrigeratorSourcePriority(canadaPdf, 'LF25Z6211S', 'LG'), 99);
  const usPdf = result('LF25Z6211S', 'https://www.lg.com/us/support/products/documents/LF25Z6211S_2025_Spec_Sheet_Refrigeration.pdf');
  assert.equal(refrigeratorSourcePriority(usPdf, 'LF25Z6211S', 'LG'), 2);
});

test('a Canadian page ahead of the U.S. page in search results is never fetched or merged into the candidate', async () => {
  const providers = fridgeProviders({ candidates: [result('LG LF25Z6211S refrigerator', lgCanadaUrl), result('LG LF25Z6211S French 3-door refrigerator', lfZ6211Url)] });
  const base = providers.deps.fetchPage;
  const deps = { ...providers.deps, fetchPage: async (url, options) => base(url === lgCanadaUrl ? lfZ6211Url : url, options).then((page) => {
    if (url === lgCanadaUrl) providers.calls.fetch.push(url);
    return page;
  }) };
  const outcome = await recommendByRetrieval({ category: 'refrigerator', brand: 'LG', model: 'LF25H6200S', deps });
  assert.deepEqual(fetched(providers.calls), []);
  assert.ok(Object.keys(outcome.report.retail.eligible).includes('LF25Z6211S'));
  assert.equal(outcome.report.selectedSources.some((source) => /\/ca_en\//.test(source.url)), false);
});

test('a failing optional spec-sheet search does not discard candidates whose product pages were already retrieved', async () => {
  const providers = fridgeProviders({ candidates: [result('LG LF25G8330S French 4-door refrigerator', lfG8330Url), result('LG LF25Z6211S French 3-door refrigerator', lfZ6211Url)] });
  const base = providers.deps.search;
  const specSearchDown = async (request) => {
    if (/builder spec sheet/.test(request.query)) throw Object.assign(new Error('SERPER_HTTP_503'), { code: 'WEB_RETRIEVAL_UNAVAILABLE' });
    return base(request);
  };
  const outcome = await recommendByRetrieval({ category: 'refrigerator', brand: 'LG', model: 'LF25H6200S', deps: { ...providers.deps, search: specSearchDown } });
  assert.notEqual(outcome.status, 'NO_RESULT');
  assert.ok(outcome.report.recommendation.primary, 'a retail-eligible candidate is still evaluated');
  assert.ok(Object.keys(outcome.report.retail.eligible).length > 0);
  assert.equal(outcome.reasonCodes.includes('BASELINE_FALLBACK_USED'), false);
  assert.ok(outcome.reasonCodes.includes('SEARCH_FAILED') || outcome.reasonCodes.includes('CANDIDATE_SEARCH_FAILED'), 'the failure is still reported');
});

test('the retail gate stays strict when the spec-sheet search fails: an out-of-stock candidate is still rejected', async () => {
  const providers = fridgeProviders({ candidates: [result('LG LF25Z6211S French 3-door refrigerator', lfZ6211Url)] });
  const base = providers.deps;
  const deps = { ...base,
    search: async (request) => { if (/builder spec sheet/.test(request.query)) throw new Error('down'); return base.search(request); },
    fetchPage: async (url, options) => {
      const page = await base.fetchPage(url, options);
      return url === lfZ6211Url ? { ...page, text: page.text.replace('<button type="button">Add to cart</button>', '') } : page;
    } };
  const outcome = await recommendByRetrieval({ category: 'refrigerator', brand: 'LG', model: 'LF25H6200S', deps });
  assert.equal(outcome.status, 'NO_RESULT');
  assert.equal(outcome.report.recommendation.primary, null);
  assert.deepEqual(outcome.report.retail.rejected.map((item) => item.model), ['LF25Z6211S']);
});
