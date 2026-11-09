import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgeLookupHandler } from '../../api/age-lookup.js';
import { retrievalFirstLookup } from '../../lib/smart-lookup/retrieval-first.js';
import { allowingRateLimiter } from '../helpers/allowing-rate-limiter.mjs';

const request = (query) => ({ method: 'POST', body: { query }, headers: { 'x-forwarded-for': '127.0.0.1' }, socket: {} });
const response = () => ({ statusCode: 0, payload: null, status(code) { this.statusCode = code; return this; }, json(value) { this.payload = value; return this; }, setHeader() {} });
const row = (title, domain, snippet = title) => ({ title, snippet, url: `https://${domain}/item` });
const fixtures = {
  'mvwx655dw1': { brand: 'Maytag', code: 'MVWX655DW1', productType: 'washer', rows: [
    row('Maytag MVWX655DW1 washer', 'maytag.com', 'Official Maytag MVWX655DW1 washer support'),
    row('Maytag MVWX655DW1 washer parts', 'repairclinic.com'),
  ] },
  'RUNHOOD EB324': { brand: 'Runhood', code: 'EB324', productType: 'battery', rows: [
    row('Runhood EB324 Energy Bar battery', 'runhoodpower.com'),
    row('Runhood EB324 modular battery', 'battery.example'),
  ] },
};

function synthesis(fixture) {
  return { identified: true, brand: fixture.brand, model: fixture.code, exactModel: fixture.code,
    originalIdentifier: fixture.code, identifierType: 'model', productType: fixture.productType,
    likelyProduct: `${fixture.brand} ${fixture.code} ${fixture.productType}`,
    description: `${fixture.brand} ${fixture.code} ${fixture.productType}`,
    identityConfidence: 'high', identityBasis: 'Matching source results', introductionYear: null,
    productionRange: null, dateConfidence: 'unknown', needsMoreDetail: false, refinementSuggestion: null };
}

function fakeRedis(initial = null) {
  let stored = initial;
  const writes = [];
  return { writes, get: async () => stored, set: async (_key, value) => { stored = value; writes.push(value); },
    eval: async () => [1, 1, 1], incrby: async (_key, amount) => amount, expire: async () => 1 };
}

function setup({ enabled = true, lookup, localLookup = async () => null, redis = fakeRedis(), providerLookup, env = {}, totalBudgetMs } = {}) {
  const logs = [];
  let providers = 0;
  let retrievals = 0;
  let metered = 0;
  const handler = createAgeLookupHandler({
    env: { SMART_LOOKUP_RETRIEVAL_FIRST_ENABLED: enabled ? 'true' : 'false', ...env }, totalBudgetMs,
    logger: { info: (line) => { try { logs.push(JSON.parse(line)); } catch (_) {} } },
    localLookup, redis, rateLimiter: allowingRateLimiter,
    reserveProviderBudget: async () => ({ allowed: true, status: 'allowed', logicalLookupCount: 1 }),
    recordProviderAttemptMetrics: async (_redis, _kind, count) => { metered += count; return { actualProviderAttemptCount: count }; },
    retrievalFirstLookup: async (query, options) => { retrievals += 1; return lookup ? lookup(query, options) : { failureReason: 'NO_SEARCH_RESULTS' }; },
    providerLookup: async (info) => { providers += 1; return providerLookup ? providerLookup(info) : { brand: 'Maytag', model: 'MVWX655DW1', summary: 'Existing provider answer' }; },
  });
  return { handler, logs, redis, counts: () => ({ providers, retrievals, metered }) };
}

async function call(app, query) { const out = response(); await app.handler(request(query), out); return out.payload; }

test('flag off leaves retrieval unused and existing provider runs', async () => {
  const app = setup({ enabled: false });
  await call(app, 'mvwx655dw1');
  assert.equal(app.counts().retrievals, 0);
  assert.equal(app.counts().providers, 1);
});

for (const [query, fixture] of Object.entries(fixtures)) {
  test(`${query} strong retrieval returns a source-backed identity without later provider spend`, async () => {
    const app = setup({ lookup: (text) => retrievalFirstLookup(text, {
      searchImpl: async () => fixture.rows,
      synthesisImpl: async () => ({ ok: true, result: synthesis(fixture), requestCount: 1,
        usage: { inputTokens: 100, outputTokens: 50 } }),
    }) });
    const result = await call(app, query);
    assert.equal(app.counts().retrievals, 1);
    assert.equal(app.counts().providers, 0);
    assert.equal(result.source, 'serper');
    assert.equal(result.evidenceSource, 'serper-extracted');
    assert.equal(result.identityConfidence, 'high');
    assert.equal(result.introductionYear, null);
    assert.equal(result.sources.length, 2);
    assert.equal(result.resultType, 'retrieval-identity');
    assert.equal(app.counts().metered, 2);
    const log = app.logs.find((entry) => entry.event === 'smart_age_lookup');
    assert.equal(log.retrievalFirstAttempted, true);
    assert.equal(log.retrievalFirstSucceeded, true);
    assert.equal(log.retrievalFirstPrimaryQuality, 'STRONG');
    assert.equal(log.retrievalFirstSerperRequests, 1);
    assert.equal(log.retrievalFirstGeminiRequests, 1);
    assert.ok(log.retrievalFirstLatencyMs >= 0);
    assert.ok(app.redis.writes.length > 0);
  });
}

test('dated Maytag documentation reaches the API and survives a cache read', async () => {
  const fixture = fixtures.mvwx655dw1;
  const redis = fakeRedis();
  const app = setup({ redis, lookup: (text) => retrievalFirstLookup(text, {
    searchImpl: async () => [
      row('Maytag MVWX655DW1 washer technical documentation', 'maytag.com',
        'Maytag MVWX655DW1 washer technical documentation dated May 2016'),
      ...fixture.rows,
    ],
    synthesisImpl: async () => ({ ok: true, result: synthesis(fixture), requestCount: 1 }),
  }) });
  const result = await call(app, 'mvwx655dw1');
  assert.equal(result.estimatedIntroductionYear, 2016);
  assert.equal(result.introductionYearConfidence, 'medium');
  assert.match(result.introductionYearEvidence.description, /MVWX655DW1.*2016/);
  assert.equal(result.individualManufactureYear, null);
  const cached = await call(app, 'mvwx655dw1');
  assert.equal(cached.estimatedIntroductionYear, 2016);
  assert.equal(cached.introductionYearEvidence.sourceUrl, result.introductionYearEvidence.sourceUrl);
});

test('retrieval error and timeout fail open to the existing provider', async () => {
  for (const failureReason of ['RETRIEVAL_ERROR', 'SERPER_TIMEOUT']) {
    const app = setup({ lookup: async () => ({ failureReason, serperRequestCount: 1 }) });
    await call(app, 'mvwx655dw1');
    assert.equal(app.counts().retrievals, 1);
    assert.equal(app.counts().providers, 1);
    const log = app.logs.find((entry) => entry.event === 'smart_age_lookup');
    assert.equal(log.retrievalFirstFailureReason, failureReason);
  }
});

test('retrieval uses its configured Serper timeout and skips when route budget is too small', async () => {
  let options;
  const app = setup({ lookup: async (_query, received) => { options = received; return { failureReason: 'NO_SEARCH_RESULTS' }; } });
  await call(app, 'mvwx655dw1');
  assert.equal(Object.hasOwn(options, 'searchTimeoutMs'), false);
  assert.equal(app.counts().providers, 1);

  const short = setup({ totalBudgetMs: 11000 });
  await call(short, 'mvwx655dw1');
  assert.equal(short.counts().retrievals, 0);
  assert.equal(short.counts().providers, 1);

  const configured = setup({ env: { SMART_LOOKUP_RETRIEVAL_SERPER_TIMEOUT_MS: '10000' } });
  await call(configured, 'mvwx655dw1');
  assert.equal(configured.counts().retrievals, 0);
  assert.equal(configured.counts().providers, 1);
});

test('serial-only, bare numeric and general guidance never attempt retrieval', async () => {
  for (const query of ['serial 0011579166', '0011579166', 'how old is a washer']) {
    const app = setup();
    await call(app, query);
    assert.equal(app.counts().retrievals, 0, query);
  }
});

test('local and cache hits never attempt retrieval', async () => {
  const local = setup({ localLookup: async () => ({ brand: 'Maytag', model: 'MVWX655DW1' }) });
  await call(local, 'mvwx655dw1');
  assert.equal(local.counts().retrievals, 0);
  const first = setup({ enabled: false });
  await call(first, 'mvwx655dw1');
  const cached = setup({ redis: fakeRedis(first.redis.writes[0]) });
  await call(cached, 'mvwx655dw1');
  assert.equal(cached.counts().retrievals, 0);
});

test('unsupported Ametek identifier becomes a safe uncached partial identity', async () => {
  const app = setup({ lookup: (query) => retrievalFirstLookup(query, {
    searchImpl: async (search) => search.includes('78570r') ? [] : [
      row('Ametek 46E vacuum motor', 'motor.example'), row('Ametek 46E motor parts', 'parts.example'),
    ],
    synthesisImpl: async () => ({ ok: true, requestCount: 1, result: {
      identified: true, brand: 'Ametek', model: '78570R', exactModel: '78570R', originalIdentifier: '78570R',
      identifierType: 'part-number', likelyProduct: 'Ametek 78570R motor', identityConfidence: 'high',
    } }),
  }) });
  const result = await call(app, 'Ametek 46e 78570r');
  assert.equal(result.resultType, 'retrieval-partial');
  assert.equal(result.model, null);
  assert.equal(result.exactModel, null);
  assert.equal(result.originalIdentifier.toUpperCase(), '78570R');
  assert.equal(result.identityConfidence, 'low');
  assert.equal(result.needsMoreDetail, true);
  assert.match(result.refinementSuggestion, /78570R.*could not be verified/i);
  assert.equal(app.redis.writes.length, 0);
  assert.equal(app.counts().providers, 0);
  assert.equal(app.counts().metered, 3);
});

test('two searches and one synthesis are the maximum retrieval spend', async () => {
  let searches = 0;
  let syntheses = 0;
  const report = await retrievalFirstLookup('Ametek 46e 78570r', {
    searchImpl: async () => { searches += 1; return []; },
    synthesisImpl: async () => { syntheses += 1; return { ok: false }; },
  });
  assert.equal(searches, 2);
  assert.equal(syntheses, 0);
  assert.equal(report.serperRequestCount, 2);
  assert.equal(report.geminiRequestCount, 0);
});
