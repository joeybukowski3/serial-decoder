import assert from 'node:assert/strict';
import test from 'node:test';
import { budgetsForRefinementMode, REFINEMENT_BUDGETS } from '../../lib/serial-refinement/budgets.js';
import {
  buildCostProxy,
  buildRefinementTelemetryEvent,
} from '../../lib/serial-refinement/telemetry.js';
import {
  chooseRefinementCacheTtl,
  NEGATIVE_TTL_SECONDS,
  RANKED_OR_ERA_TTL_SECONDS,
  RESOLVED_TTL_SECONDS,
} from '../../lib/serial-refinement/cache-policy.js';
import { runSharedInflight, createInflightStore } from '../../lib/serial-refinement/inflight.js';
import {
  buildSerialRefinementCacheKey,
  SERIAL_REFINEMENT_SCHEMA_VERSION,
} from '../../lib/serial-refinement/cache-key.js';

test('mode budgets stay under the browser hard timeout', () => {
  const det = budgetsForRefinementMode('deterministic_serper');
  const legacy = budgetsForRefinementMode('legacy_gemini');
  assert.ok(det.apiTotalMs <= REFINEMENT_BUDGETS.browserTimeoutMs);
  assert.ok(legacy.apiTotalMs <= REFINEMENT_BUDGETS.browserTimeoutMs);
  assert.ok(det.providerMaxMs < det.apiTotalMs);
  assert.equal(det.serperTotalMs, 3000);
  assert.equal(det.geminiExtractionMs, 4500);
  assert.ok(det.deterministicCompletionReserveMs >= 300);
});

test('cost proxy ignores paid activity on cache hits', () => {
  const hit = buildCostProxy({
    serperCallCount: 2,
    geminiExtractionRan: true,
    cacheHit: true,
  });
  assert.equal(hit.estimatedCostUsd, 0);
  const miss = buildCostProxy({
    serperCallCount: 2,
    geminiExtractionRan: true,
    cacheHit: false,
  });
  assert.ok(miss.estimatedCostUsd > 0);
});

test('telemetry event redacts secrets and includes failure taxonomy', () => {
  const event = buildRefinementTelemetryEvent({
    requestId: 'req-1',
    refinementMode: 'deterministic_serper',
    enteredModel: 'WED4850HWO',
    canonicalModel: 'WED4850HW0',
    searchedModels: ['WED4850HWO', 'WED4850HW0'],
    status: 'ranked',
    refinementResultTier: 'ranked',
    preferredCandidateYear: 2022,
    remainingCandidateYears: [1992, 2022],
    errorCode: 'REFINEMENT_TIMEOUT',
    failureStage: 'timeout',
    deterministicFallbackUsed: true,
    cacheStatus: 'miss',
    serperCallCount: 1,
    geminiExtractionRan: true,
    totalMs: 9000,
  });
  assert.equal(event.event, 'serial_refinement');
  assert.equal(event.routeType, 'serial_refinement');
  assert.equal(event.failureCategory, 'global_deadline');
  assert.equal(event.resultTier, 'ranked');
  assert.equal(event.usefulContextPreserved, true);
  assert.ok(event.cost.estimatedCostUsd > 0);
  assert.doesNotMatch(JSON.stringify(event), /api[_-]?key|authorization|sk-/i);
});

test('cache TTL policy differentiates resolved, ranked, and timeout negatives', () => {
  assert.equal(chooseRefinementCacheTtl({ status: 'resolved', confidence: 'high' }), RESOLVED_TTL_SECONDS);
  assert.equal(chooseRefinementCacheTtl({ status: 'ranked' }), RANKED_OR_ERA_TTL_SECONDS);
  assert.equal(chooseRefinementCacheTtl({ status: 'ambiguous_with_era' }), RANKED_OR_ERA_TTL_SECONDS);
  assert.equal(chooseRefinementCacheTtl({
    status: 'ranked',
    errorCode: 'REFINEMENT_TIMEOUT',
    failureCategory: 'global_deadline',
  }), NEGATIVE_TTL_SECONDS);
});

test('in-flight duplicate keys share one work unit', async () => {
  const store = createInflightStore();
  let runs = 0;
  const work = async () => {
    runs += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { ok: true, runs };
  };
  const [a, b] = await Promise.all([
    runSharedInflight('k1', work, { store }),
    runSharedInflight('k1', work, { store }),
  ]);
  assert.equal(runs, 1);
  assert.equal(a.value.ok, true);
  assert.equal(b.value.ok, true);
  assert.equal(a.shared || b.shared, true);
});

test('mode-specific cache keys prevent stale cross-mode hits', () => {
  const base = {
    brand: 'Whirlpool',
    category: 'appliances',
    model: 'WED4850HWO',
    candidateYears: [1992, 2022],
    decodedMonth: '',
  };
  const legacy = buildSerialRefinementCacheKey(base, { mode: 'legacy_gemini' });
  const det = buildSerialRefinementCacheKey(base, { mode: 'deterministic_serper' });
  assert.notEqual(legacy, det);
  assert.match(det, new RegExp(`serial-refinement:v${SERIAL_REFINEMENT_SCHEMA_VERSION}`));
  // Canonical model option aligns HWO and HW0 for evidence reuse.
  const hwoCanon = buildSerialRefinementCacheKey(base, {
    mode: 'deterministic_serper',
    canonicalModel: 'WED4850HW0',
  });
  const hw0 = buildSerialRefinementCacheKey({ ...base, model: 'WED4850HW0' }, {
    mode: 'deterministic_serper',
    canonicalModel: 'WED4850HW0',
  });
  assert.equal(hwoCanon, hw0);
});
