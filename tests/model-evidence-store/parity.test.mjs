/**
 * Smart Lookup / Serial Refinement parity for the persistent evidence store.
 *
 * The two workflows legitimately return different response shapes (one has
 * serial candidates, the other does not). What must NOT differ is how the
 * store interprets the same model: identity, alias match, lifecycle evidence,
 * freshness, and comparison classification are properties of the model, not of
 * the caller.
 *
 * Driven by the existing tests/fixtures/cross-workflow-parity.json so the
 * store is exercised with the same identities the rest of the suite uses.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildSharedModelIdentity } from '../../lib/model-evidence/shared-model-identity.js';
import { lookupModelEvidence } from '../../lib/model-evidence/service.js';
import { createPostgresStore } from '../../lib/model-evidence-store/postgres-store.js';
import { buildStoreLookupTokens } from '../../lib/model-evidence-store/normalization.js';
import { STORE_SHADOW_EVENT } from '../../lib/model-evidence-store/shadow.js';

const TEST_DB_URL = String(process.env.MODEL_EVIDENCE_TEST_DB_URL || '').trim();
const shouldSkip = !TEST_DB_URL;
const skipReason = 'MODEL_EVIDENCE_TEST_DB_URL is not set; store parity tests skipped';

const PARITY_FIXTURES = JSON.parse(
  await readFile(new URL('../fixtures/cross-workflow-parity.json', import.meta.url), 'utf8'),
);

// MODEL_EVIDENCE_DB_MAX_MS is the operational control and overrides the store's
// own default, so it must be set generously here: this suite is about whether
// the two workflows INTERPRET a model identically, not about how fast a cold
// connection opens. Cold-connection timeout behaviour is asserted separately in
// store-adapter.test.mjs.
const SHADOW_ON = {
  MODEL_EVIDENCE_STORE_SHADOW_ENABLED: 'true',
  MODEL_EVIDENCE_DB_MAX_MS: '5000',
};

function response(payload) {
  return { ok: true, status: 200, json: async () => payload };
}

function providerStubs() {
  return {
    serperFetchImpl: async () => response({
      organic: [{
        position: 1,
        title: 'Model lifecycle',
        link: 'https://manufacturer.example/model',
        snippet: 'Lifecycle information.',
        date: '2019-03-01',
      }],
    }),
    geminiFetchImpl: async () => response({
      candidates: [{
        finishReason: 'STOP',
        content: {
          parts: [{
            text: JSON.stringify({
              extractedEvidence: [{
                resultIndex: 0,
                exactModelMatch: true,
                suggestedMatchType: 'exact',
                sourceType: 'manufacturer',
                approximateYear: 2019,
                dateMeaning: 'production_start',
                claimText: 'Production began in 2019.',
                extractionConfidence: 'high',
              }],
            }),
          }],
        },
      }],
    }),
  };
}

function shadowRecorder() {
  const events = [];
  return {
    events,
    info(line) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.event === STORE_SHADOW_EVENT) events.push(parsed);
      } catch (_) { /* not a JSON log line */ }
    },
    error() {}, warn() {},
  };
}

let sharedStore = null;
function store() {
  if (!sharedStore) sharedStore = createPostgresStore({ url: TEST_DB_URL, maxMs: 2000 });
  return sharedStore;
}

/**
 * Open the connection before any comparison runs.
 *
 * The read budget covers connect + auth as well as the query, so an unwarmed
 * first call can time out while the second (warm) call succeeds — which would
 * look like a parity failure when it is really a cold-start artefact.
 */
let warmupPromise = null;
function warmConnection() {
  if (!warmupPromise) {
    warmupPromise = store().healthCheck({ maxMs: 5000 }).catch(() => {});
  }
  return warmupPromise;
}

test.after(async () => {
  if (sharedStore) await sharedStore.close();
});

/** Run one consumer's lookup and return its store-shadow observation. */
async function observeFor(consumer, fixture) {
  await warmConnection();
  const logger = shadowRecorder();
  await lookupModelEvidence({
    brand: fixture.brand,
    model: fixture.enteredModel,
    category: fixture.category,
    purpose: consumer,
    requestContext: { consumer, requestId: `${consumer}-${fixture.id}` },
  }, {
    localLookup: async () => null,
    serperApiKey: 'serper-test-key',
    geminiApiKey: 'gemini-test-key',
    ...providerStubs(),
    evidenceStore: store(),
    env: SHADOW_ON,
    logger,
  });
  return logger.events[0] || null;
}

/** The store-interpretation fields that must be identical across consumers. */
function interpretation(event) {
  if (!event) return null;
  return {
    hit: event.persistentStoreHit,
    matchType: event.persistentStoreMatchType,
    aliasMatched: event.persistentStoreAliasMatched,
    product: event.persistentStoreProductMatched,
    evidenceCount: event.persistentStoreEvidenceCount,
    fresh: event.persistentStoreFresh,
    stale: event.persistentStoreStale,
    comparison: event.persistentStoreComparison,
    agreement: event.persistentStoreAgreement,
    identityDisagreement: event.persistentStoreIdentityDisagreement,
    lifecycleDisagreement: event.persistentStoreLifecycleDisagreement,
    storeStart: event.comparisonDetails?.storeStart ?? null,
    storeEnd: event.comparisonDetails?.storeEnd ?? null,
  };
}

// ---------------------------------------------------------------------------
// Identity tokens are shared, not per-consumer (no database required)
// ---------------------------------------------------------------------------

test('store lookup tokens derive from the shared identity for every parity fixture', () => {
  for (const fixture of PARITY_FIXTURES) {
    const identity = buildSharedModelIdentity({
      brand: fixture.brand,
      model: fixture.enteredModel,
      category: fixture.category,
    });
    const tokens = buildStoreLookupTokens(identity, fixture.enteredModel);

    // Whichever consumer builds the identity, the tokens are a pure function of
    // it — there is no consumer-specific branch anywhere in the store path.
    const again = buildStoreLookupTokens(
      buildSharedModelIdentity({
        brand: fixture.brand, model: fixture.enteredModel, category: fixture.category,
      }),
      fixture.enteredModel,
    );
    assert.deepEqual(tokens, again, `${fixture.id}: token derivation must be deterministic`);

    for (const token of tokens) {
      assert.match(token, /^[A-Z0-9]{6,64}$/, `${fixture.id}: unsafe token ${token}`);
    }
  }
});

test('the Whirlpool fixture searches both the entered and canonical forms', () => {
  const fixture = PARITY_FIXTURES.find((item) => item.id === 'whirlpool-wed4850hwo');
  const tokens = buildStoreLookupTokens(
    buildSharedModelIdentity({
      brand: fixture.brand, model: fixture.enteredModel, category: fixture.category,
    }),
    fixture.enteredModel,
  );
  assert.ok(tokens.includes('WED4850HWO'));
  assert.ok(tokens.includes('WED4850HW0'));
});

// ---------------------------------------------------------------------------
// Both consumers see an identical store interpretation (real database)
// ---------------------------------------------------------------------------

const PARITY_CASES = [
  { id: 'whirlpool-wed4850hwo', brand: 'Whirlpool', enteredModel: 'WED4850HWO', category: 'appliances' },
  { id: 'whirlpool-wed4850hw0', brand: 'Whirlpool', enteredModel: 'WED4850HW0', category: 'appliances' },
  { id: 'vizio-m321i-a2', brand: 'VIZIO', enteredModel: 'M321i-A2', category: 'electronics' },
  { id: 'lenovo-thinksystem-st50', brand: 'Lenovo', enteredModel: 'Lenovo ThinkSystem ST50', category: 'electronics' },
  { id: 'unknown-model', brand: 'Whirlpool', enteredModel: 'ZZZZ999999', category: 'appliances' },
];

for (const fixture of PARITY_CASES) {
  test(`${fixture.id}: Smart Lookup and Serial Refinement see the same store interpretation`, { skip: shouldSkip && skipReason }, async () => {
    const smart = await observeFor('smart_lookup', fixture);
    const refinement = await observeFor('model_refinement', fixture);

    assert.ok(smart, 'Smart Lookup must produce a shadow observation');
    assert.ok(refinement, 'Serial Refinement must produce a shadow observation');

    assert.deepEqual(
      interpretation(smart),
      interpretation(refinement),
      `${fixture.id}: the store interpreted the same model differently for the two workflows`,
    );

    // The consumer label is the ONLY field that may differ.
    assert.equal(smart.consumer, 'smart_lookup');
    assert.equal(refinement.consumer, 'model_refinement');
  });
}

test('the seeded VIZIO model resolves identically for both workflows', { skip: shouldSkip && skipReason }, async () => {
  const fixture = { id: 'vizio', brand: 'VIZIO', enteredModel: 'M321i-A2', category: 'electronics' };
  const smart = await observeFor('smart_lookup', fixture);
  const refinement = await observeFor('model_refinement', fixture);

  for (const event of [smart, refinement]) {
    assert.equal(event.persistentStoreHit, true);
    assert.equal(event.comparisonDetails.storeStart, 2013);
    assert.equal(event.comparisonDetails.storeEnd, 2014);
    assert.equal(event.persistentStoreFresh, true);
  }
  assert.equal(smart.persistentStoreProductMatched, refinement.persistentStoreProductMatched);
});

test('an unknown model is a miss for both workflows, not a partial hit for one', { skip: shouldSkip && skipReason }, async () => {
  const fixture = { id: 'unknown', brand: 'Whirlpool', enteredModel: 'QQQQ888888', category: 'appliances' };
  const smart = await observeFor('smart_lookup', fixture);
  const refinement = await observeFor('model_refinement', fixture);

  assert.equal(smart.persistentStoreHit, false);
  assert.equal(refinement.persistentStoreHit, false);
  assert.equal(smart.persistentStoreComparison, refinement.persistentStoreComparison);
});
