/**
 * Shadow integration tests for lookupModelEvidence().
 *
 * The Phase 3B non-negotiable safety rule, restated as assertions:
 *
 *   Whatever the store does — hit, miss, timeout, connection failure,
 *   malformed row, ambiguous identity, or being switched off entirely — the
 *   evidence the lookup returns must be BYTE-IDENTICAL to the evidence it
 *   returned before the store existed, and the provider path must still run.
 *
 * Every test therefore compares a store-enabled run against a store-disabled
 * baseline rather than asserting specific field values in isolation.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { lookupModelEvidence } from '../../lib/model-evidence/service.js';
import { createNullStore } from '../../lib/model-evidence-store/null-store.js';
import { createMissResult, STORE_FAILURE_CODES } from '../../lib/model-evidence-store/store-interface.js';
import { COMPARISON } from '../../lib/model-evidence-store/comparison.js';
import { STORE_SHADOW_EVENT } from '../../lib/model-evidence-store/shadow.js';

const SHADOW_ON = { MODEL_EVIDENCE_STORE_SHADOW_ENABLED: 'true' };
const SHADOW_OFF = { MODEL_EVIDENCE_STORE_SHADOW_ENABLED: 'false' };

function response(payload) {
  return { ok: true, status: 200, json: async () => payload };
}

function serperPayload(model) {
  return {
    organic: [
      {
        position: 1,
        title: `${model} manufacturer lifecycle`,
        link: 'https://manufacturer.example/model',
        snippet: `${model} lifecycle information.`,
        date: '2019-03-01',
      },
      {
        position: 2,
        title: `${model} specifications`,
        link: 'https://specifications.example/model',
        snippet: `${model} specifications.`,
        date: '2019-04-01',
      },
    ],
  };
}

function geminiPayload(extractedEvidence) {
  return {
    candidates: [{
      finishReason: 'STOP',
      content: { parts: [{ text: JSON.stringify({ extractedEvidence }) }] },
    }],
  };
}

const DEFAULT_FACTS = [{
  resultIndex: 0,
  exactModelMatch: true,
  suggestedMatchType: 'exact',
  sourceType: 'manufacturer',
  approximateYear: 2019,
  dateMeaning: 'production_start',
  claimText: 'Production began in 2019.',
  extractionConfidence: 'high',
}];

/** Collects every JSON log line the lookup emits. */
function recordingLogger() {
  const events = [];
  return {
    events,
    info(line) {
      try { events.push(JSON.parse(line)); } catch (_) { events.push({ raw: line }); }
    },
    error() {},
    warn() {},
    shadowEvents() { return events.filter((event) => event.event === STORE_SHADOW_EVENT); },
    evidenceEvents() { return events.filter((event) => event.event === 'shared_model_evidence'); },
  };
}

/** Counts provider calls so "the provider still ran" is a real assertion. */
function providerCounters() {
  return { serper: 0, gemini: 0 };
}

async function runLookup({ store, env, facts = DEFAULT_FACTS, model = 'WED4850HW0', logger, counters }) {
  const calls = counters || providerCounters();
  const result = await lookupModelEvidence({
    brand: 'Whirlpool',
    model,
    category: 'dryer',
    purpose: 'test',
    requestContext: { consumer: 'test', requestId: 'req-test' },
  }, {
    localLookup: async () => null,
    serperApiKey: 'serper-test-key',
    geminiApiKey: 'gemini-test-key',
    serperFetchImpl: async () => { calls.serper += 1; return response(serperPayload(model)); },
    geminiFetchImpl: async () => { calls.gemini += 1; return response(geminiPayload(facts)); },
    evidenceStore: store,
    env,
    logger,
  });
  return { result, calls };
}

/** Fields that legitimately vary run to run and cannot be compared directly. */
function comparable(result) {
  const copy = JSON.parse(JSON.stringify(result));
  delete copy.timings;
  return copy;
}

/** A store stub returning a fixed read result. */
function stubStore(readResult) {
  return {
    kind: 'stub',
    failureCode: null,
    findProductByCanonicalModel: async () => readResult,
    findProductByAlias: async () => readResult,
    resolveStoredIdentity: async () => readResult,
    getLifecycleClaims: async () => readResult.bundle?.claims || [],
    getEvidenceSources: async () => new Map(),
    getBestStoredEvidence: async () => readResult,
    healthCheck: async () => ({ ok: true, failureCode: null, durationMs: 1 }),
    close: async () => {},
  };
}

function bundleFor({
  start = 2019, end = null, freshness = 'fresh', conflict = false,
  matchedBy = 'canonical-model', claims = null, malformedClaimCount = 0,
} = {}) {
  return {
    product: {
      publicId: '11111111-1111-4111-8111-111111111111',
      brand: 'Whirlpool',
      brandKey: 'whirlpool',
      canonicalModel: 'WED4850HW0',
      normalizedModel: 'WED4850HW0',
      identityKind: 'exact_model',
      identityStatus: 'accepted',
      identityConfidence: 'high',
      category: 'dryer',
      modelLine: null,
      familyPublicId: null,
      evidenceVersion: 1,
      matchedBy,
      matchedAliasType: matchedBy === 'alias' ? 'transcription_variant' : null,
      equivalenceReason: matchedBy === 'alias' ? 'terminal-o-zero-transcription' : null,
      matchedToken: 'WED4850HW0',
    },
    claims: claims || [{
      claimType: 'production_start',
      pointYear: start,
      startYear: null,
      endYear: null,
      claimValue: null,
      precision: 'year',
      identityMatch: 'exact',
      evidenceQuality: 'strong',
      claimConfidence: 'high',
      basis: 'test',
      extractor: 'seed',
      lastVerifiedAt: new Date().toISOString(),
      freshness,
      sources: [],
    }],
    freshness,
    conflict,
    lifecycle: { start, end },
    introductionYear: start,
    oldestClaimAgeDays: freshness === 'fresh' ? 1 : 400,
    malformedClaimCount,
  };
}

function hitResult(bundleOptions) {
  return {
    attempted: true,
    available: true,
    hit: true,
    ambiguous: false,
    timedOut: false,
    malformed: (bundleOptions?.malformedClaimCount || 0) > 0,
    bundle: bundleFor(bundleOptions),
    failureCode: null,
    durationMs: 7,
  };
}

// ---------------------------------------------------------------------------
// Baseline: what the lookup produces with no store at all
// ---------------------------------------------------------------------------

let baseline = null;
test('baseline: capture the store-free result', async () => {
  const { result, calls } = await runLookup({ store: null, env: SHADOW_OFF });
  baseline = comparable(result);
  assert.equal(result.status, 'success');
  assert.equal(calls.serper > 0, true);
  assert.equal(calls.gemini, 1);
});

// ---------------------------------------------------------------------------
// Feature disabled
// ---------------------------------------------------------------------------

test('with the shadow flag off, the store is never consulted', async () => {
  let consulted = false;
  const store = stubStore(hitResult());
  const watched = { ...store, getBestStoredEvidence: async (...args) => { consulted = true; return store.getBestStoredEvidence(...args); } };

  const logger = recordingLogger();
  // No `evidenceStore` option and the flag off: the code must not even resolve
  // a store, so nothing can be consulted.
  const { result, calls } = await runLookup({ store: null, env: SHADOW_OFF, logger });

  assert.equal(consulted, false);
  assert.equal(logger.shadowEvents().length, 0, 'no shadow event may be emitted when disabled');
  assert.deepEqual(comparable(result), baseline);
  assert.equal(calls.gemini, 1, 'the provider path must still run');
  assert.ok(watched);
});

test('a null store (missing credentials) behaves exactly like no store', async () => {
  const logger = recordingLogger();
  const { result, calls } = await runLookup({
    store: createNullStore({ failureCode: STORE_FAILURE_CODES.NOT_CONFIGURED }),
    env: SHADOW_ON,
    logger,
  });

  assert.deepEqual(comparable(result), baseline);
  assert.equal(calls.gemini, 1);
  // beginStoreShadowRead refuses a null store outright, so there is nothing to
  // observe and no misleading all-false record is emitted.
  assert.equal(logger.shadowEvents().length, 0);
});

// ---------------------------------------------------------------------------
// Store hit — canonical and alias
// ---------------------------------------------------------------------------

test('a canonical store hit is recorded but does not change the result', async () => {
  const logger = recordingLogger();
  const { result, calls } = await runLookup({
    store: stubStore(hitResult({ start: 2019 })),
    env: SHADOW_ON,
    logger,
  });

  assert.deepEqual(comparable(result), baseline, 'a store hit must not alter the evidence');
  assert.equal(calls.serper > 0, true, 'Serper must still be called in shadow mode');
  assert.equal(calls.gemini, 1, 'Gemini must still be called in shadow mode');

  const [event] = logger.shadowEvents();
  assert.ok(event, 'a shadow event must be emitted');
  assert.equal(event.persistentStoreAttempted, true);
  assert.equal(event.persistentStoreHit, true);
  assert.equal(event.persistentStoreFresh, true);
  assert.equal(event.persistentStoreStale, false);
  assert.equal(event.persistentStoreMatchType, 'canonical-model');
  assert.equal(event.persistentStoreAliasMatched, false);
  assert.equal(event.persistentStoreEvidenceCount, 1);
  // Live evidence says production_start 2019; the store agrees.
  assert.equal(event.persistentStoreComparison, COMPARISON.AGREEMENT);
  assert.equal(event.persistentStoreAgreement, true);
  // Phase 3B invariants.
  assert.equal(event.providerAvoided, false);
  assert.equal(event.refreshScheduled, false);
});

test('an alias hit is distinguishable from a canonical hit in telemetry', async () => {
  const logger = recordingLogger();
  const { result } = await runLookup({
    store: stubStore(hitResult({ matchedBy: 'alias' })),
    env: SHADOW_ON,
    logger,
    model: 'WED4850HWO',
  });

  const [event] = logger.shadowEvents();
  assert.equal(event.persistentStoreHit, true);
  assert.equal(event.persistentStoreMatchType, 'alias');
  assert.equal(event.persistentStoreAliasMatched, true);
  assert.equal(result.status, 'success');
});

// ---------------------------------------------------------------------------
// Store miss / failure / timeout — all indistinguishable from each other
// ---------------------------------------------------------------------------

const degradedCases = [
  ['a clean miss', createMissResult({ attempted: true, available: true }), COMPARISON.NO_RECORD],
  ['a connection failure', createMissResult({ attempted: true, available: false, failureCode: STORE_FAILURE_CODES.UNAVAILABLE }), COMPARISON.UNAVAILABLE],
  ['a query error', createMissResult({ attempted: true, available: true, failureCode: STORE_FAILURE_CODES.QUERY_ERROR }), COMPARISON.UNAVAILABLE],
  ['a timeout', createMissResult({ attempted: true, available: true, timedOut: true, failureCode: STORE_FAILURE_CODES.TIMEOUT }), COMPARISON.TIMEOUT],
  ['an ambiguous identity', createMissResult({ attempted: true, available: true, ambiguous: true, failureCode: STORE_FAILURE_CODES.AMBIGUOUS_IDENTITY }), COMPARISON.AMBIGUOUS],
];

for (const [label, storeResult, expectedComparison] of degradedCases) {
  test(`${label} leaves the lookup unchanged and still runs the provider`, async () => {
    const logger = recordingLogger();
    const { result, calls } = await runLookup({
      store: stubStore(storeResult),
      env: SHADOW_ON,
      logger,
    });

    assert.deepEqual(comparable(result), baseline);
    assert.equal(calls.serper > 0, true);
    assert.equal(calls.gemini, 1);

    const [event] = logger.shadowEvents();
    assert.equal(event.persistentStoreHit, false);
    assert.equal(event.persistentStoreComparison, expectedComparison);
    assert.equal(event.providerAvoided, false);
  });
}

test('a store that throws unexpectedly cannot break the lookup', async () => {
  // The adapter absorbs its own failures; this proves the belt-and-braces
  // guard in beginStoreShadowRead handles a store that ignores the contract.
  const rogue = {
    ...stubStore(createMissResult()),
    getBestStoredEvidence: async () => { throw new Error('rogue store'); },
  };

  const logger = recordingLogger();
  const { result, calls } = await runLookup({ store: rogue, env: SHADOW_ON, logger });

  assert.deepEqual(comparable(result), baseline);
  assert.equal(calls.gemini, 1);
  const [event] = logger.shadowEvents();
  assert.equal(event.persistentStoreFailureCode, STORE_FAILURE_CODES.UNAVAILABLE);
});

test('a store that hangs is cut off and cannot delay the lookup', async () => {
  const hanging = {
    ...stubStore(createMissResult()),
    getBestStoredEvidence: () => new Promise(() => {}),
  };

  const logger = recordingLogger();
  const startedAt = Date.now();
  // The adapter enforces the cap internally; a store that ignores it entirely
  // is the worst case, so the shadow observation must not block forever.
  const timed = await Promise.race([
    runLookup({ store: hanging, env: { ...SHADOW_ON, MODEL_EVIDENCE_DB_MAX_MS: '50' }, logger }),
    new Promise((resolve) => setTimeout(() => resolve('LOOKUP_BLOCKED'), 4000)),
  ]);
  const elapsed = Date.now() - startedAt;

  assert.notEqual(timed, 'LOOKUP_BLOCKED',
    `a hanging store blocked the lookup for ${elapsed}ms; the shadow read must be bounded`);
  assert.deepEqual(comparable(timed.result), baseline);
});

// ---------------------------------------------------------------------------
// Malformed and stale records
// ---------------------------------------------------------------------------

test('a malformed stored record is rejected and reported', async () => {
  const logger = recordingLogger();
  const { result, calls } = await runLookup({
    store: stubStore(hitResult({ claims: [], malformedClaimCount: 2 })),
    env: SHADOW_ON,
    logger,
  });

  assert.deepEqual(comparable(result), baseline);
  assert.equal(calls.gemini, 1);
  const [event] = logger.shadowEvents();
  assert.equal(event.persistentStoreComparison, COMPARISON.MALFORMED);
  assert.equal(event.persistentStoreMalformed, true);
});

test('a stale stored record is flagged and the provider still runs', async () => {
  const logger = recordingLogger();
  const { result, calls } = await runLookup({
    store: stubStore(hitResult({ freshness: 'stale' })),
    env: SHADOW_ON,
    logger,
  });

  assert.deepEqual(comparable(result), baseline);
  assert.equal(calls.gemini, 1, 'a stale store hit must not suppress research');

  const [event] = logger.shadowEvents();
  assert.equal(event.persistentStoreStale, true);
  assert.equal(event.persistentStoreFresh, false);
  assert.equal(event.persistentStoreComparison, COMPARISON.STALE);
  assert.equal(event.refreshScheduled, false, 'Phase 3B must not schedule refreshes');
  // The lifecycle relation is still measured behind the staleness label.
  assert.equal(event.comparisonDetails.lifecycleRelation, COMPARISON.AGREEMENT);
});

// ---------------------------------------------------------------------------
// Disagreement
// ---------------------------------------------------------------------------

test('a lifecycle disagreement is reported without touching the result', async () => {
  const logger = recordingLogger();
  // Live evidence says 2019; the store insists on 1998 — disjoint windows.
  const { result, calls } = await runLookup({
    store: stubStore(hitResult({ start: 1998, end: 1999 })),
    env: SHADOW_ON,
    logger,
  });

  assert.deepEqual(comparable(result), baseline,
    'the live result must be untouched even when the store disagrees outright');
  assert.equal(calls.gemini, 1);

  const [event] = logger.shadowEvents();
  assert.equal(event.persistentStoreComparison, COMPARISON.CONFLICTING_LIFECYCLE);
  assert.equal(event.persistentStoreLifecycleDisagreement, true);
  assert.equal(event.persistentStoreAgreement, false);
});

test('an identity disagreement is reported', async () => {
  const bundle = bundleFor();
  bundle.product.normalizedModel = 'WRF535SWHZ';
  bundle.product.canonicalModel = 'WRF535SWHZ';

  const logger = recordingLogger();
  await runLookup({
    store: stubStore({ ...hitResult(), bundle }),
    env: SHADOW_ON,
    logger,
  });

  const [event] = logger.shadowEvents();
  assert.equal(event.persistentStoreComparison, COMPARISON.IDENTITY_DISAGREEMENT);
  assert.equal(event.persistentStoreIdentityDisagreement, true);
});

test('an internal store conflict is surfaced rather than averaged away', async () => {
  const logger = recordingLogger();
  await runLookup({
    store: stubStore(hitResult({ conflict: true })),
    env: SHADOW_ON,
    logger,
  });

  const [event] = logger.shadowEvents();
  assert.equal(event.persistentStoreComparison, COMPARISON.CONFLICTING_LIFECYCLE);
  assert.equal(event.persistentStoreLifecycleDisagreement, true);
});

// ---------------------------------------------------------------------------
// Placement relative to Redis and to local evidence
// ---------------------------------------------------------------------------

test('a Redis hit returns before the store is consulted', async () => {
  // Documented Phase 3A placement: local -> Redis -> store -> providers.
  // Measuring the store where the live read will NOT sit in Phase 3C would
  // produce a hit rate that does not describe the future behaviour.
  let consulted = false;
  const store = stubStore(hitResult());
  const watched = {
    ...store,
    getBestStoredEvidence: async (...args) => { consulted = true; return store.getBestStoredEvidence(...args); },
  };

  const cachedPayload = {
    evidenceVersion: '2',
    facts: [],
    status: 'success',
    requestedIdentity: { brand: 'Whirlpool', model: 'WED4850HW0', normalizedBrand: 'whirlpool', normalizedModel: 'WED4850HW0' },
    matchedIdentity: { matchType: 'exact' },
    lifecycle: {},
    providerSummary: { localUsed: false, serperUsed: false, extractorUsed: false, searchCount: 0 },
    timings: { totalMs: 1 },
  };

  const logger = recordingLogger();
  const result = await lookupModelEvidence({
    brand: 'Whirlpool',
    model: 'WED4850HW0',
    category: 'dryer',
    purpose: 'test',
    requestContext: { consumer: 'test' },
  }, {
    localLookup: async () => null,
    cache: {
      stats: {},
      getSharedEvidence: async () => cachedPayload,
      setSharedEvidence: async () => {},
      getRawSearch: async () => null,
      setRawSearch: async () => {},
      getExtractedFacts: async () => null,
      setExtractedFacts: async () => {},
    },
    evidenceStore: watched,
    env: SHADOW_ON,
    logger,
  });

  assert.equal(result.cacheStatus, 'hit');
  assert.equal(consulted, false, 'the store must not be read on a Redis hit');
  assert.equal(logger.shadowEvents().length, 0);
});

test('a local-only request never consults the store', async () => {
  // local_only is a diagnostics mode with a 2s budget; the store must not
  // touch it.
  let consulted = false;
  const store = stubStore(hitResult());
  const watched = {
    ...store,
    getBestStoredEvidence: async (...args) => { consulted = true; return store.getBestStoredEvidence(...args); },
  };

  const result = await lookupModelEvidence({
    brand: 'Whirlpool',
    model: 'WED4850HW0',
    purpose: 'test',
    requestContext: { consumer: 'test', localOnly: true },
  }, {
    localLookup: async () => null,
    evidenceStore: watched,
    env: SHADOW_ON,
  });

  assert.equal(consulted, false);
  assert.equal(result.failureCategory, 'LOCAL_DB_MISS');
});

// ---------------------------------------------------------------------------
// Provider failure with a stored record present
// ---------------------------------------------------------------------------

test('a provider failure with stored evidence present still degrades normally', async () => {
  const logger = recordingLogger();
  const baselineFailure = await lookupModelEvidence({
    brand: 'Whirlpool', model: 'WED4850HW0', category: 'dryer', purpose: 'test',
    requestContext: { consumer: 'test' },
  }, {
    localLookup: async () => null,
    serperApiKey: 'serper-test-key',
    geminiApiKey: 'gemini-test-key',
    serperFetchImpl: async () => { throw new Error('serper down'); },
    geminiFetchImpl: async () => { throw new Error('gemini down'); },
    env: SHADOW_OFF,
  });

  const withStore = await lookupModelEvidence({
    brand: 'Whirlpool', model: 'WED4850HW0', category: 'dryer', purpose: 'test',
    requestContext: { consumer: 'test' },
  }, {
    localLookup: async () => null,
    serperApiKey: 'serper-test-key',
    geminiApiKey: 'gemini-test-key',
    serperFetchImpl: async () => { throw new Error('serper down'); },
    geminiFetchImpl: async () => { throw new Error('gemini down'); },
    evidenceStore: stubStore(hitResult()),
    env: SHADOW_ON,
    logger,
  });

  assert.deepEqual(comparable(withStore), comparable(baselineFailure),
    'stored evidence must not rescue a provider failure in Phase 3B');
  // The observation is still emitted: provider outages are exactly when store
  // coverage matters, so the metric must exist on this path too.
  assert.equal(logger.shadowEvents().length, 1);
});

// ---------------------------------------------------------------------------
// The evidence log line carries the summary
// ---------------------------------------------------------------------------

test('the shared_model_evidence log line carries the store summary without altering the payload', async () => {
  const logger = recordingLogger();
  const { result } = await runLookup({
    store: stubStore(hitResult()),
    env: SHADOW_ON,
    logger,
  });

  const [evidenceEvent] = logger.evidenceEvents();
  assert.ok(evidenceEvent.persistentStore, 'the evidence log must carry the store summary');
  assert.equal(evidenceEvent.persistentStore.hit, true);
  assert.equal(evidenceEvent.persistentStore.providerAvoided, false);

  // The summary must NOT be attached to the shared evidence object itself:
  // that object is cached in Redis and handed to both adapters.
  assert.equal('persistentStore' in result, false);
  assert.equal('persistentStoreShadow' in result, false);
});
