import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendByRetrieval } from '../../lib/replacement-discovery/live-retrieval.js';
import {
  CACHE_FINGERPRINT, CONTRACT_VERSION, MAX_ALTERNATIVES, MAX_SOURCES, buildErrorResponse, buildPublicResponse, isValidPublicResponse,
} from '../../lib/replacement-public/contract.js';
import { buildExplanation } from '../../lib/replacement-public/explain.js';
import { IMPORTANCE, assessmentFor, describeReason, describeWarning, formatValue, publicFactStatus } from '../../lib/replacement-public/labels.js';
import { createReplacementBudget, replacementBudgetConfig, replacementBudgetKey } from '../../lib/replacement-public/budget.js';
import { CACHE_TTL_SECONDS, createReplacementCache, replacementCacheKey } from '../../lib/replacement-public/cache.js';
import { fridgeProviders, tvProviders, deepKeys, createReplacementRedis, fakeClock, result, q7fUrl, q80cUrl, q80dUrl, q7fPage, q80cPage, syntheticTvPage } from '../helpers/replacement-public-fixtures.mjs';

const META = { requestId: 'req-test', elapsedMs: 12 };
const TV = { category: 'television', brand: 'Samsung', model: 'QN55Q7F' };
const FRIDGE = { category: 'refrigerator', brand: 'LG', model: 'LF25H6200S' };

const run = (request, providers) => recommendByRetrieval({ ...request, deps: providers.deps });
const publicTv = async (notes = '') => { const outcome = await run({ ...TV, notes }, tvProviders()); return { outcome, response: buildPublicResponse(outcome, META) }; };
const publicFridge = async () => { const outcome = await run(FRIDGE, fridgeProviders()); return { outcome, response: buildPublicResponse(outcome, META) }; };

/** Every key name that is allowed to appear anywhere in a public response. */
const PUBLIC_KEYS = new Set(['contractVersion', 'status', 'category', 'retrievalQuality', 'original', 'primary', 'comparison', 'alternatives', 'warnings',
  'needsVerification', 'refinements', 'sources', 'meta', 'brand', 'model', 'displayName', 'facts', 'key', 'label', 'value', 'classification', 'confidence',
  'explanation', 'isBestAvailableOnly', 'importance', 'replacement', 'assessment', 'code', 'note', 'role', 'roleLabel', 'differences', 'severity', 'message',
  'reason', 'fieldKey', 'prompt', 'domain', 'url', 'requestId', 'elapsedMs', 'engineVersion', 'profileVersion', 'cached']);

/** Internal strings that must never reach a browser: evidence/candidate IDs, provider names, queries, source ids, cache/Redis hints. */
function internalStrings(outcome) {
  const report = outcome.report;
  const ids = [
    ...(report.evidence || []).map((item) => item.evidenceId),
    ...(report.recommendation?.primary ? [report.recommendation.primary.candidate.candidateId, report.recommendation.primary.resultId] : []),
    ...(report.recommendation?.alternatives || []).map((item) => item.recommendation.candidate.candidateId),
    ...(report.queries || []).map((item) => item.query),
    ...(report.selectedSources || []).map((item) => item.id),
  ].filter((value) => typeof value === 'string' && value.length > 4);
  return [...new Set([...ids, 'user-input', 'serper', 'SERPER_API_KEY', 'internalCandidatePool', 'rankingExplanation', 'rejectedSummary', 'smart-budget', 'replacement-finder'])];
}

// ---- 11. allowlist mapping -------------------------------------------------------------------------------------------

test('11: the public response is an explicit allowlist, never the raw engine report', async () => {
  for (const { response } of [await publicTv(), await publicFridge()]) {
    assert.equal(response.contractVersion, CONTRACT_VERSION);
    assert.deepEqual(Object.keys(response).sort(), ['alternatives', 'category', 'comparison', 'contractVersion', 'meta', 'needsVerification', 'original',
      'primary', 'refinements', 'retrievalQuality', 'sources', 'status', 'warnings']);
    const unexpected = [...deepKeys(response)].filter((key) => !PUBLIC_KEYS.has(key));
    assert.deepEqual(unexpected, [], 'only allowlisted keys appear anywhere in the response');
    assert.equal(isValidPublicResponse(response), true);
  }
});

test('11b: engine fields added later cannot leak, because nothing is spread from the internal report', async () => {
  const { outcome } = await publicTv();
  const tainted = structuredClone(outcome);
  tainted.report.recommendation.primary.internalSecret = 'LEAK-1';
  tainted.report.recommendation.primary.candidate.internalSecret = 'LEAK-2';
  tainted.report.recommendation.primary.comparisonRows[0].internalSecret = 'LEAK-3';
  tainted.report.evidence[0].internalSecret = 'LEAK-4';
  assert.equal(JSON.stringify(buildPublicResponse(tainted, META)).includes('LEAK-'), false);
});

test('11c: the TV and refrigerator profiles map engine buckets to Required / Important / Additional', async () => {
  assert.deepEqual(IMPORTANCE, { HARD: 'REQUIRED', STRONG: 'IMPORTANT', SECONDARY: 'ADDITIONAL' });
  const { response } = await publicTv();
  assert.deepEqual([...new Set(response.comparison.map((row) => row.importance))].sort(), ['ADDITIONAL', 'IMPORTANT', 'REQUIRED']);
  const order = response.comparison.map((row) => row.importance);
  assert.deepEqual(order, [...order].sort((a, b) => ['REQUIRED', 'IMPORTANT', 'ADDITIONAL'].indexOf(a) - ['REQUIRED', 'IMPORTANT', 'ADDITIONAL'].indexOf(b)));
  assert.equal(assessmentFor('MATCH', 'REQUIRED').label, 'Meets requirement');
  assert.equal(assessmentFor('MATCH', 'IMPORTANT').label, 'Match');
});

// ---- 12-13. fact status mapping --------------------------------------------------------------------------------------

test('12: a KNOWN fact backed by a retrieved source is VERIFIED', async () => {
  const { response } = await publicTv();
  const size = response.original.facts.find((fact) => fact.key === 'screenSizeIn');
  assert.deepEqual({ value: size.value, status: size.status }, { value: '55"', status: 'VERIFIED' });
  assert.equal(response.original.facts.find((fact) => fact.key === 'resolution').status, 'VERIFIED');
});

test('13: a KNOWN fact that rests only on user input is PROVIDED, and is never shown as VERIFIED', async () => {
  const { response } = await publicTv();
  assert.equal(response.original.facts.find((fact) => fact.key === 'brand').status, 'PROVIDED');

  // With no usable sources the model number is still only what the user typed.
  const outcome = await run(TV, tvProviders({ original: [], candidates: [] }));
  const unsourced = buildPublicResponse(outcome, META);
  assert.equal(unsourced.original.facts.find((fact) => fact.key === 'model').status, 'PROVIDED');
  assert.equal(unsourced.original.facts.some((fact) => fact.status === 'VERIFIED'), false);
});

test('13b: INFERRED, ASSUMED, AMBIGUOUS and UNKNOWN map straight through; KNOWN needs a retrieved source', () => {
  const ids = new Set(['ev-1']);
  assert.equal(publicFactStatus({ status: 'KNOWN', evidenceRefs: ['ev-1'] }, ids), 'VERIFIED');
  assert.equal(publicFactStatus({ status: 'KNOWN', evidenceRefs: ['user-input'] }, ids), 'PROVIDED');
  assert.equal(publicFactStatus({ status: 'KNOWN', evidenceRefs: [] }, ids), 'PROVIDED');
  assert.equal(publicFactStatus({ status: 'KNOWN', evidenceRefs: ['user-input', 'ev-1'] }, ids), 'VERIFIED');
  for (const status of ['INFERRED', 'ASSUMED', 'AMBIGUOUS', 'UNKNOWN']) assert.equal(publicFactStatus({ status, evidenceRefs: ['ev-1'] }, ids), status);
  assert.equal(publicFactStatus(undefined, ids), 'UNKNOWN');
  assert.equal(publicFactStatus({ status: 'SOMETHING_ELSE' }, ids), 'UNKNOWN');
});

// ---- 14. best available ----------------------------------------------------------------------------------------------

test('14: a least-bad primary is flagged isBestAvailableOnly and carries a blocking warning', async () => {
  const { response } = await publicTv('Must fit a 20 inch wide opening');
  assert.equal(response.primary.isBestAvailableOnly, true);
  assert.equal(response.primary.classification, 'NOT_LKQ');
  assert.ok(response.warnings.some((warning) => warning.code === 'NO_LKQ_CANDIDATE' && warning.severity === 'BLOCKING'));
  assert.match(response.primary.explanation, /closest available option and not a like-kind-and-quality replacement/);
  assert.ok(response.comparison.some((row) => row.key === 'physicalFit' && row.assessment.code === 'FAIL'));

  const normal = (await publicTv()).response;
  assert.equal(normal.primary.isBestAvailableOnly, false);
  assert.equal(normal.warnings.some((warning) => warning.code === 'NO_LKQ_CANDIDATE'), false);
});

// ---- 15-17. caps and source filtering --------------------------------------------------------------------------------

test('15: alternatives are capped at two', async () => {
  const { outcome } = await publicFridge();
  const forced = structuredClone(outcome);
  const [template] = forced.report.recommendation.alternatives.length ? forced.report.recommendation.alternatives : [{ role: 'CLOSE_MATCH', recommendation: forced.report.recommendation.primary }];
  forced.report.recommendation.alternatives = Array.from({ length: 5 }, () => structuredClone(template));
  const response = buildPublicResponse(forced, META);
  assert.equal(response.alternatives.length, MAX_ALTERNATIVES);
  assert.ok(response.alternatives.every((alt) => alt.differences.length <= 3 && typeof alt.roleLabel === 'string'));
});

const evidenceRecord = (url, subjectModel = 'QN55Q7F') => ({ evidenceId: `e-${url}`, url, claim: { fieldKey: 'resolution', subjectModel }, sourceClass: 'MANUFACTURER' });

test('16: sources are capped at six', async () => {
  const { outcome } = await publicTv();
  const forced = structuredClone(outcome);
  forced.report.evidence = Array.from({ length: 12 }, (_, index) => evidenceRecord(`https://www.samsung.com/us/tvs/page-${index}/`));
  const response = buildPublicResponse(forced, META);
  assert.equal(response.sources.length, MAX_SOURCES);
});

test('17: only HTTPS, allowlisted source hosts survive, and query strings and fragments are stripped', async () => {
  const { outcome } = await publicTv();
  const forced = structuredClone(outcome);
  forced.report.evidence = [
    evidenceRecord('https://www.samsung.com/us/tvs/good/?utm_source=x&token=secret#frag'),
    evidenceRecord('http://www.samsung.com/us/tvs/plain-http/'),
    evidenceRecord('https://evil.example.com/us/tvs/not-allowlisted/'),
    evidenceRecord('https://user:pass@www.samsung.com/us/tvs/credentials/'),
    evidenceRecord('https://www.samsung.com:8443/us/tvs/odd-port/'),
    evidenceRecord('https://www.amazon.com/dp/marketplace'),
    evidenceRecord('javascript:alert(1)'),
    evidenceRecord('https://www.bestbuy.com/site/retailer/123.p', 'QN55Q80C'),
    evidenceRecord(null),
  ];
  const { sources } = buildPublicResponse(forced, META);
  assert.deepEqual(sources.map((source) => source.url), ['https://www.samsung.com/us/tvs/good/', 'https://www.bestbuy.com/site/retailer/123.p']);
  assert.deepEqual(sources.map((source) => source.domain), ['samsung.com', 'bestbuy.com']);
  assert.ok(sources.every((source) => source.url.startsWith('https://') && !/[?#@]/.test(source.url)));
});

test('17b: sources are labelled ORIGINAL, REPLACEMENT or SUPPORT and ordered that way', async () => {
  const { response } = await publicTv();
  assert.deepEqual(response.sources.map((source) => source.role), ['ORIGINAL', 'REPLACEMENT']);
});

// ---- 18. leakage -----------------------------------------------------------------------------------------------------

test('18: no diagnostics, internal IDs, queries, ranks or store keys leak, for TV and refrigerator', async () => {
  const cases = [await publicTv(), await publicTv('Must fit a 20 inch wide opening'), await publicFridge()];
  for (const { outcome, response } of cases) {
    const json = JSON.stringify(response);
    for (const secret of internalStrings(outcome)) assert.equal(json.includes(secret), false, `leaked: ${secret}`);
    for (const key of ['evidenceRefs', 'evidenceId', 'candidateId', 'providerRank', 'sourceProvider', 'discoveryPriority', 'internalCandidatePool', 'rejectedSummary',
      'rankingExplanation', 'queries', 'fetchResults', 'retrievedResults', 'searchRequestCount', 'decision', 'normalizedOriginal', 'resultId', 'sourceIds', 'basis', 'error']) {
      assert.equal(deepKeys(response).has(key), false, `leaked key: ${key}`);
    }
  }
});

test('18b: error responses carry only the fixed public fields', () => {
  const error = buildErrorResponse('ENGINE_ERROR', { requestId: 'r1' });
  assert.deepEqual(Object.keys(error).sort(), ['contractVersion', 'errorCode', 'message', 'requestId', 'status']);
  assert.equal(buildErrorResponse('UNSUPPORTED').status, 'UNSUPPORTED');
  assert.equal(buildErrorResponse('NOT_A_REAL_CODE').errorCode, 'ENGINE_ERROR');
});

// ---- 19-20. explanation ----------------------------------------------------------------------------------------------

test('19: explanations are deterministic and short', async () => {
  const first = (await publicTv()).response.primary.explanation;
  const second = (await publicTv()).response.primary.explanation;
  assert.equal(first, second);
  assert.ok(first.length > 20 && first.length <= 420);
  const rows = [{ label: 'Screen size', importance: 'REQUIRED', assessment: { code: 'MATCH' } }, { label: 'Resolution', importance: 'REQUIRED', assessment: { code: 'MATCH' } },
    { label: 'Model family or series', importance: 'IMPORTANT', assessment: { code: 'MATCH' } }];
  const needs = [{ label: 'Mount compatibility', reason: 'UNKNOWN' }];
  const text = buildExplanation({ classification: 'LKQ', isBestAvailableOnly: false, rows, needs });
  assert.equal(text, 'Matches the original screen size, resolution and model family or series. Mount compatibility could not be verified.');
});

test('20: the explanation only names labels that are present in the result and adds no numbers or model names', async () => {
  const rows = [{ label: 'Zeta spec', importance: 'REQUIRED', assessment: { code: 'MATCH' } }, { label: 'Omega spec', importance: 'IMPORTANT', assessment: { code: 'DIFFERS' } }];
  const text = buildExplanation({ classification: 'CLOSE_MATCH', isBestAvailableOnly: false, rows, needs: [{ label: 'Delta spec', reason: 'ASSUMED' }], upgrades: [] });
  assert.match(text, /zeta spec/);
  assert.match(text, /omega spec/);
  assert.match(text, /Delta spec rests on an assumption/);
  assert.equal(/\d/.test(text), false);
  assert.equal(buildExplanation({ classification: 'LKQ', isBestAvailableOnly: false, rows: [], needs: [] }), 'Selected as the closest model among those evaluated.');

  for (const { response } of [await publicTv(), await publicTv('Must fit a 20 inch wide opening'), await publicFridge()]) {
    const vocabulary = new Set([...response.comparison.map((row) => row.label), ...response.needsVerification.map((item) => item.label)].map((label) => label.toLowerCase()));
    const phrases = [...response.primary.explanation.matchAll(/(?:Matches the original|Differs from the original in|Exceeds the original in|Does not meet the required) ([^.]+)\.|([A-Z][^.]+?) (?:could not be verified|rests on an assumption)\./g)];
    assert.ok(phrases.length > 0, response.primary.explanation);
    const labels = [...vocabulary].sort((a, b) => b.length - a.length);
    for (const phrase of phrases) {
      // Removing every known label must leave nothing but list separators, so no unknown wording was introduced.
      const rest = labels.reduce((text, label) => text.split(label).join('|'), (phrase[1] || phrase[2]).toLowerCase()).replace(/ and /g, '|').replace(/[|, ]/g, '');
      assert.equal(rest, '', `"${phrase[1] || phrase[2]}" contains wording that is not a label in this result`);
    }
    assert.equal(/\d/.test(response.primary.explanation), false, 'no figures are introduced');
    assert.equal(response.primary.explanation.toUpperCase().includes(response.primary.model.toUpperCase()), false);
  }
});

test('20b: an ABOVE_LKQ explanation names the exceeded attribute from the engine upgrade codes', () => {
  const text = buildExplanation({ classification: 'ABOVE_LKQ', isBestAvailableOnly: false, rows: [], needs: [], upgrades: ['MATERIAL_CAPACITY_UPGRADE'] });
  assert.match(text, /Exceeds the original in capacity\./);
});

// ---- labels ----------------------------------------------------------------------------------------------------------

test('labels: internal reason codes become user-facing language and raw codes never pass through', () => {
  assert.equal(describeReason('HARD_ASSUMPTION').message, 'Important requirement is based on an assumption');
  assert.equal(describeReason('HARD_BOTH_UNKNOWN').message, 'This required specification could not be verified');
  assert.equal(describeReason('HARD_BOTH_UNKNOWN').reason, 'UNKNOWN');
  assert.equal(describeReason('VERIFY_FIT').reason, 'UNVERIFIED_FIT');
  assert.equal(describeReason('SOME_FUTURE_INTERNAL_CODE', 'UNVERIFIED').message, 'This specification could not be verified');
  assert.equal(describeReason('SOME_FUTURE_INTERNAL_CODE', 'MATCH').message, null);
  assert.equal(describeWarning('WEB_RETRIEVAL_UNAVAILABLE').severity, 'WARNING');
  assert.equal(describeWarning('SOME_FUTURE_INTERNAL_CODE'), null);
  assert.equal(formatValue('screenSizeIn', 55), '55"');
  assert.equal(formatValue('tier', 'UPPER_PREMIUM'), 'Upper premium');
  assert.equal(formatValue('x', true), 'Yes');
  assert.equal(formatValue('x', null), null);
  assert.equal(formatValue('x', 'a\u0000b\n c'.repeat(40)).includes('\u0000'), false);
});

test('labels: no comparison note or message in a real response contains a raw upper-case engine code', async () => {
  for (const { response } of [await publicTv(), await publicTv('Must fit a 20 inch wide opening'), await publicFridge()]) {
    const text = [...response.comparison.map((row) => row.note), ...response.needsVerification.map((item) => item.message), ...response.warnings.map((item) => item.message)].filter(Boolean).join(' ');
    assert.equal(/\b[A-Z]{3,}(?:_[A-Z]{2,})+\b/.test(text), false, text);
  }
});

// ---- status, deadline, refrigerator ----------------------------------------------------------------------------------

test('status: retrieval quality and status map to the public vocabulary; deadline results stay PARTIAL with PARTIAL_DEADLINE', async () => {
  const strong = (await publicTv()).response;
  assert.deepEqual([strong.status, strong.retrievalQuality, strong.category], ['COMPLETE', 'STRONG', 'television']);

  const clock = fakeClock();
  const providers = tvProviders({
    original: [result('Samsung QN55Q80C specs', q80cUrl)], candidates: [result('Samsung QN55Q7F 55-inch QLED TV', q7fUrl, 1), result('Samsung QN55Q80D 55-inch QLED 4K TV', q80dUrl, 5)],
    pages: { [q80cUrl]: q80cPage, [q80dUrl]: syntheticTvPage('QN55Q80D'), [q7fUrl]: q7fPage },
    tick: (() => { let fetches = 0; return (kind) => { if (kind === 'fetch' && (fetches += 1) === 2) clock.advance(25_000); }; })(),
  });
  const outcome = await recommendByRetrieval({ category: 'television', brand: 'Samsung', model: 'QN55Q80C', deadlineMs: 20_000, deps: { ...providers.deps, now: clock.now } });
  const partial = buildPublicResponse(outcome, META);
  assert.equal(partial.status, 'PARTIAL');
  assert.ok(partial.primary, 'the evaluated primary is still returned');
  assert.ok(partial.needsVerification.some((item) => item.reason === 'PARTIAL_DEADLINE'));
  assert.ok(partial.warnings.some((warning) => warning.code === 'DEADLINE_REACHED'));

  const failed = buildPublicResponse(await run(TV, tvProviders({ original: [], candidates: [] })), META);
  assert.equal(failed.primary, null);
  assert.deepEqual([failed.comparison, failed.alternatives], [[], []]);
  assert.ok(['NO_RESULT', 'PARTIAL'].includes(failed.status));
  assert.ok(['WEAK', 'FAILED', 'PARTIAL'].includes(failed.retrievalQuality));
});

test('status: a budget-limited run is never reported as COMPLETE and carries a capacity warning', async () => {
  const { outcome } = await publicTv();
  const limited = buildPublicResponse(outcome, { ...META, budgetLimited: true });
  assert.equal(limited.status, 'PARTIAL');
  assert.ok(limited.warnings.some((warning) => warning.code === 'CAPACITY_LIMITED'));
});

test('refrigerator: the contract carries refrigerator labels and a Required capacity row', async () => {
  const { response } = await publicFridge();
  assert.equal(response.category, 'refrigerator');
  assert.ok(response.comparison.some((row) => row.key === 'totalCapacityCuFt' && row.importance === 'REQUIRED'));
  assert.equal(response.meta.profileVersion, '2.1.0');
});

// ---- validator -------------------------------------------------------------------------------------------------------

test('isValidPublicResponse rejects unknown keys, bad shapes and non-HTTPS sources', async () => {
  const { response } = await publicTv();
  assert.equal(isValidPublicResponse(response), true);
  assert.equal(isValidPublicResponse({ ...response, extra: 1 }), false);
  assert.equal(isValidPublicResponse({ ...response, contractVersion: '2' }), false);
  assert.equal(isValidPublicResponse({ ...response, sources: [{ url: 'http://samsung.com/x', domain: 'samsung.com', role: 'SUPPORT' }] }), false);
  assert.equal(isValidPublicResponse({ ...response, alternatives: [{}, {}, {}] }), false);
  assert.equal(isValidPublicResponse({ ...response, comparison: 'nope' }), false);
  for (const bad of [null, [], 'x', 5]) assert.equal(isValidPublicResponse(bad), false);
});

// ---- budget module ---------------------------------------------------------------------------------------------------

test('budget: a dedicated namespace, configurable limit with a conservative default', () => {
  assert.equal(replacementBudgetConfig({}).dailySearchLimit, 100);
  assert.equal(replacementBudgetConfig({ ITEMASSIST_REPLACEMENT_DAILY_SEARCH_LIMIT: '7' }).dailySearchLimit, 7);
  assert.equal(replacementBudgetConfig({ ITEMASSIST_REPLACEMENT_DAILY_SEARCH_LIMIT: 'abc' }).dailySearchLimit, 100);
  assert.equal(replacementBudgetConfig({ ITEMASSIST_REPLACEMENT_DAILY_SEARCH_LIMIT: '-3' }).dailySearchLimit, 100);
  assert.match(replacementBudgetKey(Date.UTC(2026, 9, 6)), /^replacement-finder-budget:v1:searches:2026-10-06$/);
});

test('budget: reservations are atomic per search, stop at the limit, and reset on the next UTC day', async () => {
  const redis = createReplacementRedis();
  let now = Date.UTC(2026, 9, 6, 12);
  const budget = createReplacementBudget({ redis, config: { dailySearchLimit: 2 }, now: () => now });
  assert.equal((await budget.reserveSearch()).allowed, true);
  assert.equal((await budget.reserveSearch()).allowed, true);
  const denied = await budget.reserveSearch();
  assert.deepEqual([denied.allowed, denied.status, denied.used], [false, 'denied', 2]);
  assert.equal((await budget.peek()).allowed, false);
  now = Date.UTC(2026, 9, 7, 0, 0, 1);
  assert.equal((await budget.reserveSearch()).allowed, true, 'a new UTC day uses a new key');
  assert.ok([...redis.store.keys()].every((key) => key.startsWith('replacement-finder-budget:v1:')));
});

test('budget: fails closed when the store is missing or erroring', async () => {
  for (const redis of [null, {}, createReplacementRedis({ failEval: true, failGet: true })]) {
    const budget = createReplacementBudget({ redis, config: { dailySearchLimit: 5 } });
    assert.deepEqual([(await budget.peek()).allowed, (await budget.peek()).status], [false, 'unavailable']);
    assert.deepEqual([(await budget.reserveSearch()).allowed, (await budget.reserveSearch()).status], [false, 'unavailable']);
  }
});

// ---- cache module ----------------------------------------------------------------------------------------------------

test('cache key: differs by category, brand, model, notes and is stable for equivalent notes; raw notes never appear', () => {
  const base = { category: 'television', brand: 'Samsung', model: 'QN55Q7F', notes: '' };
  const key = replacementCacheKey(base);
  assert.notEqual(key, replacementCacheKey({ ...base, model: 'QN55Q80C' }));
  assert.notEqual(key, replacementCacheKey({ ...base, category: 'refrigerator', brand: 'LG', model: 'LF25H6200S' }));
  assert.notEqual(key, replacementCacheKey({ ...base, brand: 'LG' }));
  const noted = replacementCacheKey({ ...base, notes: 'Must fit a 36 inch opening' });
  assert.notEqual(key, noted);
  assert.equal(noted, replacementCacheKey({ ...base, notes: '  must FIT a 36   inch opening ' }));
  assert.equal(noted.includes('36'), false, 'raw notes are hashed, not embedded');
  assert.equal(key.includes('smart-'), false);
  assert.match(key, /^replacement-finder:result:v1:1\+1\.0\.0\+1\.0\.0\+2\.1\.0:television:samsung:qn55q7f:none$/);
});

test('cache: stores COMPLETE responses for 24 hours and rejects everything else', async () => {
  const { response } = await publicTv();
  const redis = createReplacementRedis();
  const cache = createReplacementCache({ redis });
  const key = replacementCacheKey({ ...TV, notes: '' });
  assert.equal(await cache.write(key, { ...response, status: 'PARTIAL' }), false);
  assert.equal(await cache.write(key, { ...response, extra: true }), false);
  assert.equal(await cache.write(key, response), true);
  assert.equal(redis.ttls.get(key), CACHE_TTL_SECONDS);
  assert.deepEqual(await cache.read(key), response);
  assert.equal(await cache.read(replacementCacheKey({ ...TV, model: 'QN55Q80C', notes: '' })), null);
});

test('cache: corrupted, mismatched or tampered entries are misses, never errors or leaks', async () => {
  const { response } = await publicTv();
  const key = replacementCacheKey({ ...TV, notes: '' });
  const otherKey = replacementCacheKey({ ...TV, model: 'QN55Q80C', notes: '' });
  const entry = (overrides) => JSON.stringify({ key, engineVersion: CACHE_FINGERPRINT, response, ...overrides });
  const bad = ['{not json', '42', 'null', '[]', entry({ key: otherKey }), entry({ engineVersion: '0.0.1' }), entry({ response: { ...response, extra: 1 } }),
    entry({ response: { ...response, status: 'PARTIAL' } }), entry({ response: { ...response, sources: [{ url: 'http://x.example/', domain: 'x.example', role: 'SUPPORT' }] } })];
  for (const raw of bad) assert.equal(await createReplacementCache({ redis: createReplacementRedis({ initial: { [key]: raw } }) }).read(key), null, raw);
  assert.equal(await createReplacementCache({ redis: createReplacementRedis({ failGet: true }) }).read(key), null);
  assert.equal(await createReplacementCache({ redis: null }).read(key), null);
  assert.equal(await createReplacementCache({ redis: createReplacementRedis({ failSet: true }) }).write(key, response), false);
  // Upstash returns already-parsed JSON for string values; that form must also work.
  assert.deepEqual(await createReplacementCache({ redis: createReplacementRedis({ initial: { [key]: JSON.parse(entry({})) } }) }).read(key), response);
});
