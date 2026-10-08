import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { searchProducts } from '../../lib/replacement-discovery/providers/explicit-search.js';
import {
  bindRefrigeratorFacts, extractRefrigeratorFacts, inspectRefrigeratorSource, mergeRefrigeratorSources, runRefrigeratorProof,
} from '../../lib/replacement-discovery/refrigerator-retrieval.js';

const fixtureUrl = (name) => new URL(`../fixtures/replacement-discovery/${name}`, import.meta.url);
const productPage = fs.readFileSync(fixtureUrl('lg-lrfcs25d3s-page.html'), 'utf8');
const fourDoorPage = fs.readFileSync(fixtureUrl('lg-lf25g8330s-page.html'), 'utf8');
const ORIGINAL = 'LRFCS25D3S';
const productUrl = 'https://www.lg.com/us/refrigerators/lg-lrfcs25d3s-french-3-door-refrigerator';
const supportUrl = 'https://www.lg.com/us/support/product/lg-LRFCS25D3S';
const fourDoorUrl = 'https://www.lg.com/us/refrigerators/lg-lf25g8330s-french-4-door-refrigerator';
const genericSupport = (model) => `<html><head><title>LG ${model} French door refrigerator support</title></head>`
  + `<body><h1>${model}</h1><div>LG ${model} French door refrigerator manuals and downloads</div></body></html>`;
const sourceFor = (id, model, url) => ({ id, model, brand: 'LG', domain: 'lg.com', title: `LG ${model} refrigerator`, url });
const bound = (html, source) => bindRefrigeratorFacts(extractRefrigeratorFacts(html, source.model, { sourceUrl: source.url }), source);
const result = (title, url) => ({ title, url, domain: new URL(url).hostname.replace(/^www\./, ''), snippet: title, providerRank: 1 });

test('generic French door support page does not downgrade or ambiguate a specific 3-door layout, in either order', () => {
  const product = bound(productPage, sourceFor('source-1', ORIGINAL, productUrl));
  const support = bound(genericSupport(ORIGINAL), sourceFor('source-2', ORIGINAL, supportUrl));
  assert.equal(support.facts.layout.value, 'FRENCH_DOOR');
  assert.equal(product.facts.layout.value, 'FRENCH_DOOR_3_DOOR');
  for (const [specific, generic] of [[product, support], [support, product]]) {
    const { facts } = mergeRefrigeratorSources([specific, generic]);
    assert.equal(facts.layout.status, 'KNOWN');
    assert.equal(facts.layout.value, 'FRENCH_DOOR_3_DOOR');
    assert.deepEqual(facts.layout.sourceIds, ['source-1']);
    assert.deepEqual(facts.layout.evidenceRefs, product.facts.layout.evidenceRefs);
    for (const key of ['configuration', 'configurationFloor']) {
      assert.equal(facts[key].status, 'KNOWN');
      assert.equal(facts[key].value, 'FRENCH_DOOR');
      assert.deepEqual([...facts[key].sourceIds].sort(), ['source-1', 'source-2']);
    }
  }
});

test('4-door layout stays distinct from 3-door and survives a generic French door page', () => {
  const fourDoor = bound(fourDoorPage, sourceFor('source-1', 'LF25G8330S', fourDoorUrl));
  const generic = bound(genericSupport('LF25G8330S'), sourceFor('source-2', 'LF25G8330S', 'https://www.lg.com/us/support/product/lg-LF25G8330S'));
  assert.equal(fourDoor.facts.layout.value, 'FRENCH_DOOR_4_DOOR');
  const merged = mergeRefrigeratorSources([generic, fourDoor]).facts;
  assert.equal(merged.layout.value, 'FRENCH_DOOR_4_DOOR');
  assert.equal(merged.configurationFloor.value, 'FRENCH_DOOR');

  const threeDoor = bindRefrigeratorFacts({ layout: 'FRENCH_DOOR_3_DOOR' }, sourceFor('source-1', ORIGINAL, productUrl));
  const fourDoorClaim = bindRefrigeratorFacts({ layout: 'FRENCH_DOOR_4_DOOR' }, sourceFor('source-2', ORIGINAL, supportUrl));
  const conflict = mergeRefrigeratorSources([threeDoor, fourDoorClaim]).facts.layout;
  assert.equal(conflict.status, 'AMBIGUOUS');
  assert.deepEqual(conflict.alternatives, ['FRENCH_DOOR_3_DOOR', 'FRENCH_DOOR_4_DOOR']);
});

test('a support page that names another model, or a shell without the exact model, contributes nothing', () => {
  const other = genericSupport('LF25H6200S');
  assert.deepEqual(extractRefrigeratorFacts(other, ORIGINAL, { sourceUrl: supportUrl }), {});
  assert.equal(inspectRefrigeratorSource(other, ORIGINAL, { sourceUrl: supportUrl }).diagnostics.rejectionReason, 'HEADING_MODEL_MISSING');
  assert.equal(inspectRefrigeratorSource(genericSupport(ORIGINAL), ORIGINAL,
    { sourceUrl: 'https://www.lg.com/us/support/product/lg-LF25H6200S' }).diagnostics.rejectionReason, 'URL_MODEL_MISMATCH');
});

test('extraction diagnostics name the gate that rejected a source', () => {
  const inspect = (html, sourceUrl = supportUrl) => inspectRefrigeratorSource(html, ORIGINAL, { sourceUrl }).diagnostics;
  assert.equal(inspect('<title>LG Appliances</title><body>JavaScript required</body>').rejectionReason, 'HEADING_MODEL_MISSING');
  assert.equal(inspect(`<title>${ORIGINAL} | LG USA</title><body><div>${ORIGINAL}</div></body>`).rejectionReason, 'TITLE_NOT_REFRIGERATOR');
  assert.equal(inspect('<title>x</title>', 'not a url').rejectionReason, 'INVALID_SOURCE_URL');
  assert.equal(inspect(genericSupport(ORIGINAL), 'https://www.lg.com/us/refrigerators/all-refrigerators/lg-lrfcs25d3s').rejectionReason, 'GENERIC_PAGE_PATH');

  const ld = (body) => `<title>LG</title><script type="application/ld+json">${JSON.stringify(body)}</script>`;
  const product = { '@type': 'Product', name: `LG ${ORIGINAL} refrigerator`, url: productUrl };
  const accepted = inspect(ld(product), productUrl);
  assert.deepEqual([accepted.jsonLdBlockCount, accepted.jsonLdProductCount, accepted.jsonLdAcceptedCount], [1, 1, 1]);
  assert.equal(accepted.rejectionReason, 'MODEL_LINE_NOT_FOUND');
  // A Product nested in an array is visible to diagnostics but is not accepted as identity.
  const arrayShape = inspect(ld([product]), productUrl);
  assert.deepEqual([arrayShape.jsonLdProductCount, arrayShape.jsonLdAcceptedCount], [1, 0]);
  assert.equal(arrayShape.rejectionReason, 'HEADING_MODEL_MISSING');

  const ok = inspectRefrigeratorSource(productPage, ORIGINAL, { sourceUrl: productUrl });
  assert.equal(ok.diagnostics.rejectionReason, null);
  assert.equal(ok.diagnostics.modelLineFound, true);
  assert.ok(ok.diagnostics.extractedFactKeys.includes('capacityCuFt'));
  assert.equal(ok.diagnostics.extractedFactCount, Object.keys(ok.facts).length);
  assert.deepEqual(ok.facts, extractRefrigeratorFacts(productPage, ORIGINAL, { sourceUrl: productUrl }));
});

test('extraction diagnostics are deterministic and bounded for oversized pages', () => {
  const huge = `<title>${'LG appliance '.repeat(5000)}</title><body>${'<div>filler</div>'.repeat(20000)}</body>`;
  const first = inspectRefrigeratorSource(huge, ORIGINAL, { sourceUrl: supportUrl }).diagnostics;
  const second = inspectRefrigeratorSource(huge, ORIGINAL, { sourceUrl: supportUrl }).diagnostics;
  assert.deepEqual(first, second);
  assert.ok(first.titleSample.length <= 160);
  assert.ok(JSON.stringify(first).length < 1500);
  assert.equal(JSON.stringify(first).includes('filler'), false);
});

test('proof report records bounded per-source diagnostics, search outcomes and merge counts without raw page bodies', async () => {
  const shell = '<html><head><title>LG Appliances</title></head><body>JavaScript required SECRET_BODY_MARKER</body></html>';
  const replay = await runRefrigeratorProof({
    search: async ({ purpose }) => purpose === 'original' ? [result(`LG ${ORIGINAL} refrigerator`, productUrl), result(`LG ${ORIGINAL} refrigerator`, supportUrl)] : [],
    fetchPage: async () => ({ status: 200, text: shell, contentType: 'text/html', bytesRead: 4321 }),
  });
  assert.ok(replay.queries.every((item) => item.ok === true && item.resultCount === 2 && item.error === null));
  assert.equal(replay.fetchResults.length, 2);
  for (const item of replay.fetchResults) {
    assert.equal(item.bytesRead, 4321);
    assert.equal(item.textLength, shell.length);
    assert.equal(item.bound, false);
    assert.equal(item.outcome, 'SOURCE_EXTRACTION_FAILED');
    assert.equal(item.extraction.rejectionReason, 'HEADING_MODEL_MISSING');
    assert.equal(item.extraction.titleSample, 'LG Appliances');
    assert.equal(item.extraction.extractedFactCount, 0);
  }
  assert.deepEqual(replay.mergeDiagnostics.map((item) => [item.role, item.inputSourceCount, item.outputFactCount]), [['original', 0, 0], ['original', 0, 0]]);
  assert.equal(JSON.stringify(replay).includes('SECRET_BODY_MARKER'), false);
});

test('reason codes separate search failure, fetch failure, extraction failure and candidate search failure', async () => {
  const unavailable = () => Object.assign(new Error('SERPER_HTTP_503'), { code: 'WEB_RETRIEVAL_UNAVAILABLE' });
  const searchDown = await runRefrigeratorProof({ search: async () => { throw unavailable(); }, fetchPage: async () => assert.fail('no fetch') });
  assert.deepEqual(searchDown.reasonCodes, ['SEARCH_FAILED', 'ORIGINAL_RESEARCH_INSUFFICIENT', 'BASELINE_FALLBACK_USED']);
  assert.equal(searchDown.error, 'WEB_RETRIEVAL_UNAVAILABLE');
  assert.equal(searchDown.queries[0].ok, false);

  const fetchDown = await runRefrigeratorProof({
    search: async () => [result(`LG ${ORIGINAL} refrigerator`, productUrl)],
    fetchPage: async () => { throw Object.assign(new Error('SOURCE_TIMEOUT'), { code: 'SOURCE_TIMEOUT' }); },
  });
  assert.deepEqual(fetchDown.reasonCodes, ['SOURCE_FETCH_FAILED', 'ORIGINAL_RESEARCH_INSUFFICIENT', 'BASELINE_FALLBACK_USED']);
  assert.equal(fetchDown.reasonCodes.includes('WEB_RETRIEVAL_UNAVAILABLE'), false);
  assert.equal(fetchDown.fetchResults[0].outcome, 'SOURCE_FETCH_FAILED');

  const candidateDown = await runRefrigeratorProof({
    search: async ({ purpose }) => { if (purpose === 'candidate') throw unavailable(); return [result(`LG ${ORIGINAL} refrigerator`, productUrl)]; },
    fetchPage: async () => ({ status: 200, text: productPage }),
  });
  assert.ok(candidateDown.reasonCodes.includes('CANDIDATE_SEARCH_FAILED'));
  assert.equal(candidateDown.reasonCodes.includes('SEARCH_FAILED'), false);
  assert.equal(candidateDown.reasonCodes.includes('ORIGINAL_RESEARCH_INSUFFICIENT'), false);
});

test('logical purpose original-spec never reaches the provider, which still rejects unsupported roles', async () => {
  const requests = [];
  let providerCalls = 0;
  const replay = await runRefrigeratorProof({
    search: async (request) => {
      requests.push(request);
      const organic = request.query.includes('builder spec sheet') ? [{ title: `LG ${ORIGINAL} refrigerator`, link: supportUrl }]
        : [{ title: `LG ${ORIGINAL} refrigerator`, link: productUrl }];
      return searchProducts(request, { apiKey: 'offline-test', fetchImpl: async () => { providerCalls += 1; return new Response(JSON.stringify({ organic }), { status: 200 }); } });
    },
    fetchPage: async (url) => ({ status: 200, text: url === productUrl ? '<title>LG LRFCS25D3S refrigerator</title><h1>LRFCS25D3S refrigerator</h1>' : genericSupport(ORIGINAL) }),
  });
  const specSearch = replay.queries.find((item) => item.role === 'original-spec');
  assert.ok(specSearch, 'the supplemental original search must run and keep its logical role');
  assert.equal(specSearch.purpose, 'original');
  assert.equal(specSearch.ok, true);
  assert.ok(requests.every((item) => ['original', 'candidate'].includes(item.purpose)));
  assert.equal(replay.error, undefined);
  assert.equal(providerCalls, requests.length);
  for (const purpose of ['original-spec', 'candidate-spec', '', undefined]) {
    await assert.rejects(searchProducts({ query: 'LG refrigerator', purpose }, { apiKey: 'offline-test', fetchImpl: async () => assert.fail('network') }),
      { message: 'invalid search request' });
  }
});
