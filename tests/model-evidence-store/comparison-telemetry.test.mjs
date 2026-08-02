/**
 * Comparison policy and telemetry-allowlist tests.
 *
 * The allowlist tests exist because both loggers silently drop unknown fields.
 * This repository has already shipped that bug once (the progressive-LKQ
 * fields), so parity between the two allowlists is asserted mechanically
 * rather than trusted.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { logSmartLookup } from '../../lib/smart-lookup/telemetry.js';
import { buildRefinementTelemetryEvent } from '../../lib/serial-refinement/telemetry.js';
import { normalizeFailureCategory } from '../../lib/lookup-failure-taxonomy.js';
import {
  PERSISTENT_STORE_TELEMETRY_FIELD_NAMES,
  persistentStoreTelemetryFields,
} from '../../lib/model-evidence-store/telemetry-fields.js';
import {
  COMPARISON,
  compareStoreWithLive,
  projectLiveEvidence,
  rangesOverlap,
} from '../../lib/model-evidence-store/comparison.js';
import { createMissResult, STORE_FAILURE_CODES } from '../../lib/model-evidence-store/store-interface.js';

// ---------------------------------------------------------------------------
// Live projection
// ---------------------------------------------------------------------------

function liveEvidence({ start = 2019, end = null, model = 'WED4850HW0', brand = 'Whirlpool' } = {}) {
  return {
    requestedIdentity: {
      brand, model, canonicalModel: model,
      normalizedBrand: 'whirlpool', normalizedModel: model,
      searchCategory: 'dryer', identityConfidence: 'high',
    },
    matchedIdentity: { model, matchType: 'exact' },
    lifecycle: {
      supportedProductionStartYear: start,
      supportedProductionEndYear: end,
      supportedDiscontinuationYear: null,
    },
    facts: [{
      source: { domain: 'manufacturer.example', sourceType: 'manufacturer' },
      fact: { eventType: 'production_start', year: start, target: 'model_lifecycle' },
      identity: { effectiveMatchType: 'exact' },
      extraction: { confidence: 'high' },
    }],
  };
}

function storeHit({ start = 2019, end = null, freshness = 'fresh', conflict = false, model = 'WED4850HW0', brandKey = 'whirlpool', claims } = {}) {
  return {
    attempted: true,
    available: true,
    hit: true,
    ambiguous: false,
    timedOut: false,
    malformed: false,
    failureCode: null,
    durationMs: 5,
    bundle: {
      product: {
        publicId: '11111111-1111-4111-8111-111111111111',
        brandKey, canonicalModel: model, normalizedModel: model,
        identityKind: 'exact_model', identityConfidence: 'high',
        category: 'dryer', modelLine: null, matchedBy: 'canonical-model',
      },
      claims: claims || [{ claimType: 'production_start', pointYear: start, evidenceQuality: 'strong' }],
      freshness,
      conflict,
      lifecycle: { start, end },
      introductionYear: start,
      oldestClaimAgeDays: 3,
      malformedClaimCount: 0,
    },
  };
}

test('the live projection reads only documented shared-evidence fields', () => {
  const projected = projectLiveEvidence(liveEvidence({ start: 2019, end: 2022 }));
  assert.equal(projected.brandKey, 'whirlpool');
  assert.equal(projected.normalizedModel, 'WED4850HW0');
  assert.equal(projected.start, 2019);
  assert.equal(projected.end, 2022);
  assert.equal(projected.introductionYear, 2019);
  assert.equal(projected.hasEvidence, true);

  const empty = projectLiveEvidence(null);
  assert.equal(empty.start, null);
  assert.equal(empty.hasEvidence, false);
});

// ---------------------------------------------------------------------------
// Range policy
// ---------------------------------------------------------------------------

test('open-ended ranges overlap correctly', () => {
  assert.equal(rangesOverlap({ start: 2019, end: null }, { start: 2020, end: 2022 }), true);
  assert.equal(rangesOverlap({ start: 2019, end: 2020 }, { start: 2021, end: 2022 }), false);
  assert.equal(rangesOverlap({ start: null, end: 2015 }, { start: 2010, end: 2012 }), true);
  assert.equal(rangesOverlap({ start: 2013, end: 2014 }, { start: 2013, end: 2014 }), true);
});

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

const cases = [
  ['not attempted', createMissResult(), liveEvidence(), COMPARISON.NOT_ATTEMPTED],
  ['timeout', createMissResult({ attempted: true, available: true, timedOut: true, failureCode: STORE_FAILURE_CODES.TIMEOUT }), liveEvidence(), COMPARISON.TIMEOUT],
  ['ambiguous', createMissResult({ attempted: true, available: true, ambiguous: true, failureCode: STORE_FAILURE_CODES.AMBIGUOUS_IDENTITY }), liveEvidence(), COMPARISON.AMBIGUOUS],
  ['unavailable', createMissResult({ attempted: true, available: false, failureCode: STORE_FAILURE_CODES.UNAVAILABLE }), liveEvidence(), COMPARISON.UNAVAILABLE],
  ['no record', createMissResult({ attempted: true, available: true }), liveEvidence(), COMPARISON.NO_RECORD],
];

for (const [label, storeResult, live, expected] of cases) {
  test(`comparison classifies ${label}`, () => {
    assert.equal(compareStoreWithLive(storeResult, live).classification, expected);
  });
}

test('identical windows are agreement', () => {
  const outcome = compareStoreWithLive(storeHit({ start: 2019 }), liveEvidence({ start: 2019 }));
  assert.equal(outcome.classification, COMPARISON.AGREEMENT);
  assert.equal(outcome.agreement, true);
  assert.equal(outcome.lifecycleDisagreement, false);
});

test('overlapping but unequal windows are a lifecycle difference, not a conflict', () => {
  // The policy deliberately does not demand exact equality: two sources placing
  // a product in the same era with different precision is the normal case.
  const outcome = compareStoreWithLive(
    storeHit({ start: 2019, end: 2024 }),
    liveEvidence({ start: 2020, end: 2022 }),
  );
  assert.equal(outcome.classification, COMPARISON.LIFECYCLE_DIFFERENCE);
  assert.equal(outcome.lifecycleDisagreement, true);
  assert.equal(outcome.agreement, false);
});

test('disjoint windows are a conflict', () => {
  const outcome = compareStoreWithLive(
    storeHit({ start: 1998, end: 1999 }),
    liveEvidence({ start: 2019, end: 2022 }),
  );
  assert.equal(outcome.classification, COMPARISON.CONFLICTING_LIFECYCLE);
  assert.equal(outcome.lifecycleDisagreement, true);
});

test('one side having evidence and the other not is reported directionally', () => {
  const storeOnly = compareStoreWithLive(storeHit({ start: 2019 }), liveEvidence({ start: null, end: null }));
  assert.equal(storeOnly.classification, COMPARISON.STORE_STRONGER);

  const liveOnly = compareStoreWithLive(
    storeHit({ start: null, end: null, claims: [] }),
    liveEvidence({ start: 2019 }),
  );
  assert.equal(liveOnly.classification, COMPARISON.LIVE_STRONGER);

  const neither = compareStoreWithLive(
    storeHit({ start: null, end: null, claims: [] }),
    liveEvidence({ start: null, end: null }),
  );
  assert.equal(neither.classification, COMPARISON.AGREEMENT, 'both silent is agreement');
});

test('a transcription-equivalent identity is agreement, not disagreement', () => {
  const outcome = compareStoreWithLive(
    storeHit({ model: 'WED4850HW0' }),
    liveEvidence({ model: 'WED4850HWO' }),
  );
  assert.equal(outcome.identityDisagreement, false);
  assert.equal(outcome.classification, COMPARISON.AGREEMENT);
});

test('a genuinely different model is an identity disagreement', () => {
  const outcome = compareStoreWithLive(
    storeHit({ model: 'WRF535SWHZ' }),
    liveEvidence({ model: 'WED4850HW0' }),
  );
  assert.equal(outcome.classification, COMPARISON.IDENTITY_DISAGREEMENT);
  assert.equal(outcome.identityDisagreement, true);
});

test('a brand mismatch is an identity disagreement', () => {
  const outcome = compareStoreWithLive(
    storeHit({ brandKey: 'lg' }),
    liveEvidence({ brand: 'Whirlpool' }),
  );
  assert.equal(outcome.classification, COMPARISON.IDENTITY_DISAGREEMENT);
});

test('staleness is its own classification but still measures the lifecycle relation', () => {
  const outcome = compareStoreWithLive(
    storeHit({ start: 2019, freshness: 'stale' }),
    liveEvidence({ start: 2019 }),
  );
  assert.equal(outcome.classification, COMPARISON.STALE);
  // The agreement signal is preserved in details rather than hidden behind the
  // staleness label — otherwise "is stale data still correct?" is unanswerable.
  assert.equal(outcome.details.lifecycleRelation, COMPARISON.AGREEMENT);
  assert.equal(outcome.details.storeFreshness, 'stale');
});

test('an internal store conflict outranks staleness', () => {
  const outcome = compareStoreWithLive(
    storeHit({ conflict: true, freshness: 'stale' }),
    liveEvidence(),
  );
  assert.equal(outcome.classification, COMPARISON.CONFLICTING_LIFECYCLE);
});

test('a malformed record with no usable claims is reported as malformed', () => {
  const result = storeHit();
  result.bundle.claims = [];
  result.bundle.malformedClaimCount = 3;
  result.bundle.lifecycle = { start: null, end: null };
  assert.equal(compareStoreWithLive(result, liveEvidence()).classification, COMPARISON.MALFORMED);
});

test('one malformed row alongside usable claims does not mask the agreement signal', () => {
  const result = storeHit({ start: 2019 });
  result.bundle.malformedClaimCount = 1;
  const outcome = compareStoreWithLive(result, liveEvidence({ start: 2019 }));
  assert.equal(outcome.classification, COMPARISON.AGREEMENT);
  assert.equal(outcome.details.storeMalformedClaimCount, 1);
});

test('comparison details record the per-field agreement dimensions', () => {
  const outcome = compareStoreWithLive(storeHit({ start: 2019 }), liveEvidence({ start: 2019 }));
  assert.equal(outcome.details.brandAgreement, true);
  assert.equal(outcome.details.categoryAgreement, true);
  assert.equal(outcome.details.introductionYearAgreement, true);
  assert.equal(outcome.details.storeIdentityConfidence, 'high');
  assert.equal(outcome.details.storeEvidenceQuality, 'strong');
  assert.equal(outcome.details.storeClaimCount, 1);
});

test('comparison is pure and never throws on malformed input', () => {
  assert.doesNotThrow(() => compareStoreWithLive(null, null));
  assert.doesNotThrow(() => compareStoreWithLive(undefined, {}));
  assert.doesNotThrow(() => compareStoreWithLive(storeHit(), { facts: 'not-an-array' }));
});

// ---------------------------------------------------------------------------
// Telemetry allowlists
// ---------------------------------------------------------------------------

const SAMPLE = {
  persistentStoreAttempted: true,
  persistentStoreAvailable: true,
  persistentStoreHit: true,
  persistentStoreFresh: true,
  persistentStoreStale: false,
  persistentStoreDurationMs: 12,
  persistentStoreMatchType: 'canonical-model',
  persistentStoreProductMatched: '11111111-1111-4111-8111-111111111111',
  persistentStoreAliasMatched: false,
  persistentStoreEvidenceCount: 2,
  persistentStoreEvidenceAgeDays: 41,
  persistentStoreComparison: 'agreement',
  persistentStoreAgreement: true,
  persistentStoreIdentityDisagreement: false,
  persistentStoreLifecycleDisagreement: false,
  persistentStoreAmbiguous: false,
  persistentStoreMalformed: false,
  persistentStoreTimedOut: false,
  persistentStoreFailureCode: 'STORE_TIMEOUT',
  providerAvoided: false,
  refreshScheduled: false,
};

test('the Smart Lookup allowlist carries every persistent-store field', () => {
  let logged = null;
  logSmartLookup({ info: (line) => { logged = JSON.parse(line); } }, { event: 'smart_age_lookup', ...SAMPLE });

  for (const field of PERSISTENT_STORE_TELEMETRY_FIELD_NAMES) {
    assert.ok(field in logged, `smart-lookup allowlist drops ${field}`);
    assert.deepEqual(logged[field], SAMPLE[field], `smart-lookup allowlist mangles ${field}`);
  }
});

test('the Serial Refinement allowlist carries every persistent-store field', () => {
  const event = buildRefinementTelemetryEvent({ status: 'resolved', ...SAMPLE });

  for (const field of PERSISTENT_STORE_TELEMETRY_FIELD_NAMES) {
    assert.ok(field in event, `refinement allowlist drops ${field}`);
    assert.deepEqual(event[field], SAMPLE[field], `refinement allowlist mangles ${field}`);
  }
});

test('both allowlists carry an identical persistent-store field set', () => {
  let smart = null;
  logSmartLookup({ info: (line) => { smart = JSON.parse(line); } }, SAMPLE);
  const refinement = buildRefinementTelemetryEvent({ status: 'resolved', ...SAMPLE });

  const smartFields = Object.keys(smart).filter((key) => key in SAMPLE).sort();
  const refinementFields = Object.keys(refinement).filter((key) => key in SAMPLE).sort();
  assert.deepEqual(smartFields, refinementFields,
    'the two allowlists have drifted; both must import persistentStoreTelemetryFields');
  assert.deepEqual(smartFields, [...PERSISTENT_STORE_TELEMETRY_FIELD_NAMES].sort());
});

test('telemetry never emits an internal database id or raw text', () => {
  const projected = persistentStoreTelemetryFields({
    persistentStoreProductMatched: 4711,
    persistentStoreMatchType: 'WED4850HW0 <script>',
    persistentStoreFailureCode: 'postgres://user:pw@host/db',
  });
  assert.equal(projected.persistentStoreProductMatched, null, 'a bigint id must never be logged');
  assert.equal(projected.persistentStoreMatchType, null, 'free text must be dropped, not logged');
  assert.equal(projected.persistentStoreFailureCode, null, 'a connection string must never be logged');
});

test('store failure codes map onto the existing shared taxonomy', () => {
  // Deliberately no new FAILURE_CATEGORIES entry: the store is a cache tier and
  // must not appear on dashboards as a new class of outage.
  assert.equal(normalizeFailureCategory('STORE_TIMEOUT'), 'cache_read_failure');
  assert.equal(normalizeFailureCategory('STORE_UNAVAILABLE'), 'cache_read_failure');
  assert.equal(normalizeFailureCategory('STORE_QUERY_ERROR'), 'cache_read_failure');
  assert.equal(normalizeFailureCategory('STORE_MALFORMED_ROW'), 'cache_read_failure');
  assert.equal(normalizeFailureCategory('STORE_AMBIGUOUS_IDENTITY'), 'canonical_ambiguity');
});
