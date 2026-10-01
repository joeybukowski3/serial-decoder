import test from 'node:test';
import assert from 'node:assert/strict';

import { createAgeLookupHandler } from '../../api/age-lookup.js';
import { createQuotaMeter } from '../../lib/quota/meter.js';
import { classifySmartOutcome } from '../../lib/smart-lookup/outcome.js';
import { allowingRateLimiter } from '../helpers/allowing-rate-limiter.mjs';
import { createFakeRedis } from '../helpers/fake-redis.mjs';

/**
 * GENERAL_GUIDANCE vs PRECISION_RESEARCH through the real /api/age-lookup
 * handler, with providers stubbed at the HTTP boundary (fetchImpl). Native
 * research is told apart from the cheap guidance call by its request body: the
 * grounded call carries a `google_search` tool, the guidance call never may.
 */

const MODEL = 'gemini-3.5-flash-lite';
const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);
const VISITOR = 'cccccccccccccccccccccccccccccccc';

const reply = (status, body, headers = {}) => ({
  ok: status < 400,
  status,
  headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
  async json() { return body; },
});

function nativeBody(overrides = {}) {
  return {
    brand: null,
    product: 'Whirlpool WRF535SWHZ00 refrigerator',
    model: 'WRF535SWHZ00',
    category: 'Refrigerator',
    bestEstimateYear: 2018,
    estimatedRange: { startYear: 2017, endYear: 2020 },
    precision: 'exact_model',
    confidence: 'high',
    estimateBasis: 'Introduced in 2017.',
    summary: 'French-door refrigerator.',
    isIndividualUnitDate: false,
    caveats: [],
    ...overrides,
  };
}

const nativeReply = (overrides = {}, sources = [{ web: { uri: 'https://www.whirlpool.com/a', title: 'whirlpool.com' } }]) => reply(200, {
  candidates: [{
    content: { parts: [{ text: JSON.stringify(nativeBody(overrides)) }] },
    groundingMetadata: { groundingChunks: sources },
  }],
  usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 200 },
});

const guidanceReply = (object) => reply(200, {
  candidates: [{ content: { parts: [{ text: typeof object === 'string' ? object : JSON.stringify(object) }] } }],
  usageMetadata: { promptTokenCount: 320, candidatesTokenCount: 60 },
});

function harness(options = {}) {
  const {
    native = () => nativeReply(),
    guidance = () => guidanceReply({ productContext: 'Refrigerators keep food cold using a sealed cooling system.', nextSteps: ['Look for the label inside the fresh-food compartment.'] }),
    guidanceEnabled = true,
    redis = createFakeRedis(),
    rateLimiter = allowingRateLimiter,
    meterOn = false,
    env = {},
  } = options;
  const calls = { native: 0, guidance: 0, other: 0 };
  const bodies = [];
  const lines = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    bodies.push({ url: String(url), body });
    if (!String(url).includes(MODEL)) { calls.other += 1; throw new Error(`unexpected provider URL ${url}`); }
    if (body.tools) { calls.native += 1; return native(); }
    calls.guidance += 1;
    return guidance();
  };
  const handler = createAgeLookupHandler({
    env: {
      SMART_LOOKUP_NATIVE_GEMINI_SEARCH_ENABLED: 'true',
      SMART_LOOKUP_GUIDANCE_ENABLED: guidanceEnabled ? 'true' : 'false',
      GEMINI_API_KEY: 'test-gemini-key',
      ...env,
    },
    apiKey: 'test-gemini-key',
    logger: { info: (line) => lines.push(line), log() {}, warn() {}, error() {} },
    localLookup: async () => null,
    redisFactory: () => redis,
    rateLimiter,
    reserveProviderBudget: async () => ({ allowed: true, status: 'allowed', logicalLookupCount: 1 }),
    quotaMeter: createQuotaMeter({
      env: meterOn ? { SMART_LOOKUP_QUOTA_METERING: '1' } : {},
      now: () => NOW,
    }),
    fetchImpl,
  });
  return {
    handler, redis, calls, bodies,
    logs: () => lines.map((line) => { try { return JSON.parse(line); } catch (_) { return null; } })
      .filter((event) => event && event.event === 'smart_age_lookup'),
  };
}

function req(query, { retry = false, visitor = VISITOR } = {}) {
  const body = { query };
  if (retry) body.retry = true;
  return {
    method: 'POST',
    body,
    headers: { 'x-forwarded-for': '198.51.100.7', 'x-visitor-id': visitor, 'x-request-id': `r-${Math.random().toString(36).slice(2, 8)}` },
    socket: {},
  };
}

function res() {
  return {
    statusCode: 0,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    setHeader() {},
  };
}

async function run(h, query, options) {
  const out = res();
  await h.handler(req(query, options), out);
  await new Promise((resolve) => setImmediate(resolve)); // let best-effort cache writes land
  return out;
}

const usageHash = (redis) => Object.assign({}, ...[...redis.hashes.keys()]
  .filter((key) => key.startsWith('provider-usage:v1:'))
  .map((key) => redis.hash(key)));
const quotaTotal = (redis) => [...redis.hashes.keys()]
  .filter((key) => key.startsWith('quota:v1:d:'))
  .reduce((sum, key) => sum + Object.values(redis.hash(key)).reduce((a, b) => a + Number(b), 0), 0);
const cacheTtls = (redis) => [...redis.ttls.entries()].filter(([key]) => key.startsWith('smart-age:')).map(([, ttl]) => ttl);

// ── Routing ────────────────────────────────────────────────────────────────

test('"Samsung Refrigerator" routes to GENERAL_GUIDANCE and answers needs-detail', async () => {
  const h = harness();
  const out = await run(h, 'Samsung Refrigerator');
  assert.equal(out.statusCode, 200);
  assert.equal(out.payload.routeMode, 'general_guidance');
  assert.equal(out.payload.brand, 'Samsung');
  assert.equal(out.payload.category, 'refrigerator');
  assert.equal(out.payload.exactModel, null);
  assert.match(out.payload.notes, /We identified this as a Samsung refrigerator/);
  assert.match(out.payload.notes, /not enough identifying information yet to estimate a manufacture date/);
  const outcome = classifySmartOutcome(out.payload);
  assert.equal(outcome.resultStatus, 'needs-detail');
  assert.equal(outcome.outcomeReason, 'general-guidance');
  assert.equal(outcome.yearSignal, 'none');
});

test('a broad query never invokes grounded search', async () => {
  const h = harness();
  for (const query of ['Samsung Refrigerator', 'Whirlpool washer', 'LG TV', 'washer', 'Whirlpool']) {
    await run(h, query);
  }
  assert.equal(h.calls.native, 0, 'no grounded/native research call for a broad query');
  assert.ok(h.calls.guidance >= 1, 'the cheap guidance model was used');
  for (const { body } of h.bodies) {
    assert.equal(body.tools, undefined, 'guidance request must not carry any tool');
    assert.doesNotMatch(JSON.stringify(body), /google_search/i);
  }
});

test('a model-like query routes to PRECISION_RESEARCH', async () => {
  const h = harness();
  const out = await run(h, 'Whirlpool WRF535SWHZ00');
  assert.equal(out.payload.routeMode, 'precision_research');
  assert.equal(h.calls.native, 1);
  assert.equal(h.calls.guidance, 0);
  assert.equal(classifySmartOutcome(out.payload).resultStatus, 'resolved');
});

test('an unfamiliar but plausible model token errs toward PRECISION_RESEARCH', async () => {
  for (const query of ['Zephyrix ZX-9000', 'Quasarline QL7 refrigerator', 'XJ-440B']) {
    const h = harness();
    const out = await run(h, query);
    assert.equal(out.payload.routeMode, 'precision_research', query);
    assert.equal(h.calls.native, 1, `${query} must reach research`);
    assert.equal(h.calls.guidance, 0, query);
  }
});

test('general guidance still answers when the cheap model is disabled (no model call at all)', async () => {
  const h = harness({ guidanceEnabled: false });
  const out = await run(h, 'Samsung Refrigerator');
  assert.equal(out.statusCode, 200);
  assert.equal(out.payload.routeMode, 'general_guidance');
  assert.equal(h.calls.guidance, 0);
  assert.equal(h.calls.native, 0);
  assert.equal(out.payload.providerAttempted, false);
  assert.equal(classifySmartOutcome(out.payload).resultStatus, 'needs-detail');
});

// ── Needs-detail vs no-result, errors, open-ended ranges ─────────────────────

test('a precision answer that identifies a product but has no year is needs-detail, not no-result', async () => {
  const h = harness({
    native: () => nativeReply({ bestEstimateYear: null, estimatedRange: { startYear: null, endYear: null }, confidence: 'low' }, []),
  });
  const out = await run(h, 'Whirlpool WRF535SWHZ00');
  const outcome = classifySmartOutcome(out.payload);
  assert.equal(outcome.resultStatus, 'needs-detail');
  assert.equal(outcome.yearSignal, 'none');
  assert.notEqual(outcome.resultStatus, 'no-result');
});

test('429, per-IP RATE_LIMIT and a limiter outage are errors, never no-result', async () => {
  const rate429 = harness({ native: () => reply(429, {}, { 'retry-after': '30' }) });
  const a = await run(rate429, 'Whirlpool WRF535SWHZ00');
  assert.equal(a.payload.errorCode, 'PROVIDER_RATE_LIMIT');
  assert.deepEqual(
    [classifySmartOutcome(a.payload).resultStatus, classifySmartOutcome(a.payload).outcomeReason],
    ['error', 'provider-rate-limited'],
  );

  const perIp = harness({ rateLimiter: { limit: async () => ({ success: false, reset: NOW }) } });
  const b = await run(perIp, 'Whirlpool WRF535SWHZ00');
  assert.equal(b.payload.errorCode, 'RATE_LIMIT');
  assert.deepEqual(
    [classifySmartOutcome(b.payload).resultStatus, classifySmartOutcome(b.payload).outcomeReason],
    ['error', 'rate-limited'],
  );

  const down = harness({ rateLimiter: { limit: async () => { throw new Error('limiter store down'); } } });
  const c = await run(down, 'Whirlpool WRF535SWHZ00');
  assert.equal(c.payload.errorCode, 'RATE_LIMIT_STORE_UNAVAILABLE');
  assert.deepEqual(
    [classifySmartOutcome(c.payload).resultStatus, classifySmartOutcome(c.payload).outcomeReason],
    ['error', 'rate-limit-store-unavailable'],
  );
});

test('open-ended ranges ("2015 or later") remain usable instead of being discarded', async () => {
  for (const precision of ['exact_model', 'model_line', 'product_family']) {
    for (const confidence of ['high', 'low']) {
      const h = harness({
        native: () => nativeReply({ precision, confidence, bestEstimateYear: null, estimatedRange: { startYear: 2015, endYear: null } }),
      });
      const out = await run(h, 'Whirlpool WRF535SWHZ00');
      const label = `${precision}/${confidence}`;
      assert.equal(out.payload.yearSignal, 'open-ended', label);
      assert.equal(out.payload.rangeLabel, '2015 or later', label);
      assert.equal(out.payload.openEndedRange, true, label);
      const outcome = classifySmartOutcome(out.payload);
      assert.ok(['resolved', 'partial'].includes(outcome.resultStatus), `${label} -> ${outcome.resultStatus}`);
      assert.equal(outcome.yearSignal, 'open-ended', label);
    }
  }
});

// ── General guidance never invents a precise year ─────────────────────────────

test('general guidance discards any date or lifecycle claim the cheap model makes', async () => {
  const h = harness({
    guidance: () => guidanceReply({
      productContext: 'Samsung introduced this refrigerator line in 2011 and produced it until 2016.',
      nextSteps: ['Check whether it was made in the 1990s', 'Look for the model label inside the door.'],
    }),
  });
  const out = await run(h, 'Samsung Refrigerator');
  assert.equal(out.payload.summary, null, 'the dated sentence is dropped');
  assert.ok(!/\b(19|20)\d{2}\b/.test(JSON.stringify([out.payload.summary, out.payload.recommendedIdentifiers, out.payload.notes])), 'no year anywhere in the guidance text');
  assert.ok(out.payload.recommendedIdentifiers.includes('Look for the model label inside the door.'), 'the safe suggestion is kept');
  for (const field of ['estimatedYear', 'introductionYear', 'individualManufactureYear', 'productionRange', 'yearContext', 'familyIntroductionYear', 'lineIntroductionYear', 'categoryEntryYear']) {
    assert.equal(out.payload[field], null, field);
  }
  assert.equal(out.payload.yearSignal, 'none');
});

test('general guidance keeps safe model context and labels it as ungrounded AI analysis', async () => {
  const h = harness();
  const out = await run(h, 'Samsung Refrigerator');
  assert.match(out.payload.summary, /cooling system/);
  assert.equal(out.payload.evidenceSource, 'gemini-ungrounded');
  assert.deepEqual(out.payload.sources, []);
  assert.equal(out.payload.providerAttempted, true);
  assert.equal(out.payload.webSearchUsed, false);
});

// ── Cache policy and Retry ────────────────────────────────────────────────────

test('yearless answers get a 15-60 minute TTL and Retry re-researches instead of replaying them', async () => {
  const yearless = () => nativeReply({ bestEstimateYear: null, estimatedRange: { startYear: null, endYear: null }, confidence: 'low' }, []);
  const h = harness({ native: yearless });

  const first = await run(h, 'Whirlpool WRF535SWHZ00');
  assert.equal(h.calls.native, 1);
  assert.equal(classifySmartOutcome(first.payload).resultStatus, 'needs-detail');
  const ttls = cacheTtls(h.redis);
  assert.equal(ttls.length, 1);
  assert.ok(ttls[0] >= 15 * 60 && ttls[0] <= 60 * 60, `yearless TTL ${ttls[0]}s must be 15-60 minutes, not days`);

  const replay = await run(h, 'Whirlpool WRF535SWHZ00');
  assert.equal(h.calls.native, 1, 'an ordinary repeat inside the TTL is served from cache');
  assert.equal(replay.payload.source, 'cache');

  const retry = await run(h, 'Whirlpool WRF535SWHZ00', { retry: true });
  assert.equal(h.calls.native, 2, 'Retry must research again');
  assert.notEqual(retry.payload.source, 'cache');
  assert.equal(h.logs().at(-1).retryBypassedCache, true);
});

test('a dated precision answer keeps its long-lived cache TTL', async () => {
  const h = harness();
  await run(h, 'Whirlpool WRF535SWHZ00');
  assert.deepEqual(cacheTtls(h.redis), [180 * 24 * 60 * 60]);
});

test('a short-lived guidance answer is cached only when the model contributed', async () => {
  const withModel = harness();
  await run(withModel, 'Samsung Refrigerator');
  const ttls = cacheTtls(withModel.redis);
  assert.equal(ttls.length, 1);
  assert.ok(ttls[0] >= 15 * 60 && ttls[0] <= 60 * 60);

  const without = harness({ guidanceEnabled: false });
  await run(without, 'Samsung Refrigerator');
  assert.deepEqual(cacheTtls(without.redis), []);
});

// ── Quota: at most one logical credit per user action ─────────────────────────

test('general guidance consumes no research credit; precision consumes exactly one, even on Retry', async () => {
  const h = harness({ meterOn: true });

  await run(h, 'Samsung Refrigerator');
  assert.equal(quotaTotal(h.redis), 0, 'a guidance lookup is not a metered research lookup');

  await run(h, 'Whirlpool WRF535SWHZ00');
  assert.equal(quotaTotal(h.redis), 1, 'one precision lookup is one logical credit');

  await run(h, 'Whirlpool WRF535SWHZ00', { retry: true });
  assert.equal(quotaTotal(h.redis), 1, 'a Retry of the same lookup is not counted again');
  assert.equal(h.calls.native, 2, 'the Retry really did research again');
});

test('guidance respects the fail-closed per-IP limiter by serving the deterministic card', async () => {
  const h = harness({ rateLimiter: { limit: async () => ({ success: false }) } });
  const out = await run(h, 'Samsung Refrigerator');
  assert.equal(out.statusCode, 200);
  assert.equal(h.calls.guidance, 0, 'no model call when the limiter denies');
  assert.equal(classifySmartOutcome(out.payload).resultStatus, 'needs-detail');
  assert.equal(h.logs().at(-1).guidanceEnrichment, 'skipped-rate-limit');
});

test('guidance respects its own daily cap and never touches the research budget', async () => {
  let researchBudgetCalls = 0;
  const redis = createFakeRedis();
  const handler = createAgeLookupHandler({
    env: { SMART_LOOKUP_GUIDANCE_ENABLED: 'true', SMART_LOOKUP_GUIDANCE_DAILY_LIMIT: '1', GEMINI_API_KEY: 'k' },
    apiKey: 'k',
    logger: { info() {}, log() {}, warn() {}, error() {} },
    localLookup: async () => null,
    redisFactory: () => redis,
    rateLimiter: allowingRateLimiter,
    reserveProviderBudget: async () => { researchBudgetCalls += 1; return { allowed: true, status: 'allowed' }; },
    fetchImpl: async () => guidanceReply({ productContext: 'A cold-storage appliance.', nextSteps: [] }),
    now: () => NOW,
  });
  const first = res();
  await handler(req('Samsung Refrigerator'), first);
  const second = res();
  await handler(req('Whirlpool washer'), second);
  assert.equal(first.payload.providerAttempted, true);
  assert.equal(second.payload.providerAttempted, false, 'the second lookup exceeded the guidance cap');
  assert.equal(classifySmartOutcome(second.payload).resultStatus, 'needs-detail');
  assert.equal(researchBudgetCalls, 0);
});

// ── Telemetry ─────────────────────────────────────────────────────────────────

test('the request log carries route mode, status, reason, year signal and enrichment', async () => {
  const h = harness();
  await run(h, 'Samsung Refrigerator');
  await run(h, 'Whirlpool WRF535SWHZ00');
  const [guidance, precision] = h.logs();
  assert.equal(guidance.routeMode, 'general_guidance');
  assert.equal(guidance.resultStatus, 'needs-detail');
  assert.equal(guidance.outcomeReason, 'general-guidance');
  assert.equal(guidance.yearSignal, 'none');
  assert.equal(guidance.guidanceEnrichment, 'ok');
  assert.equal(guidance.grounded, false);
  assert.equal(guidance.providerAttemptCount, 1);
  assert.equal(guidance.inputTokens, 320);
  assert.equal(precision.routeMode, 'precision_research');
  assert.equal(precision.resultStatus, 'resolved');
  assert.equal(precision.yearSignal, 'range');
  assert.equal(precision.grounded, true);
});

test('daily Redis counters record volume, status and cost per route mode', async () => {
  const h = harness();
  await run(h, 'Samsung Refrigerator');
  await run(h, 'Whirlpool WRF535SWHZ00');
  const usage = usageHash(h.redis);
  assert.equal(usage['age|event:route_mode:general_guidance'], 1);
  assert.equal(usage['age|event:route_mode:precision_research'], 1);
  assert.equal(usage['age|event:route_status:general_guidance:needs-detail'], 1);
  assert.equal(usage['age|event:route_status:precision_research:resolved'], 1);
  assert.equal(usage['age|event:result_reason:general-guidance'], 1);
  assert.equal(usage['age|event:year_signal:none'], 1);
  assert.equal(usage['age|event:route_attempts:general_guidance'], 1);
  assert.equal(usage['age|event:route_tokens_in:general_guidance'], 320);
  assert.equal(usage['age|event:route_grounded:precision_research'], 1);
  assert.equal(usage['age|event:route_grounded:general_guidance'], undefined);
});

test('local, verified and deterministic answers stay Redis-free when metering is off', async () => {
  let factoryCalls = 0;
  const handler = createAgeLookupHandler({
    rateLimiter: allowingRateLimiter,
    logger: { info() {}, log() {}, warn() {}, error() {} },
    localLookup: async () => ({ brand: 'LG', model: 'WM4000HWA', introductionYear: 2019, productionRange: { start: 2019, end: 2024 } }),
    redisFactory: () => { factoryCalls += 1; return createFakeRedis(); },
  });
  const out = res();
  await handler(req('LG WM4000HWA'), out);
  assert.equal(out.payload.source, 'local-db');
  assert.equal(factoryCalls, 0);
});
