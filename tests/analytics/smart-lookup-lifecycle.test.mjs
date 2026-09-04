import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const controllerSource = fs.readFileSync('src/browser/smart-lookup-controller.js', 'utf8').replace(/\r\n/g, '\n');
const legacySource = fs.readFileSync('script.js', 'utf8');

function loadControllerAnalytics() {
  const completions = [];
  const ctx = {
    console,
    setTimeout: () => 0,
    clearTimeout() {},
    fetch: async () => ({ ok: false, status: 0, json: async () => ({}) }),
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
    document: {
      readyState: 'complete', addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; },
      getElementById() { return null; }, createElement() { return { classList: { add() {} }, querySelector() { return null; }, querySelectorAll() { return []; } }; },
    },
  };
  ctx.window = ctx;
  ctx.DecodeMyItemAnalytics = {
    beginSmartAttempt() { return { completed: false }; },
    completeSmartAttempt(attempt, outcome) {
      if (!attempt || attempt.completed) return false;
      attempt.completed = true;
      completions.push(JSON.parse(JSON.stringify(outcome)));
      return true;
    },
  };
  vm.createContext(ctx);
  const openMarker = "(function () {\n  'use strict';\n";
  const closeMarker = '\n}());\n';
  assert.ok(controllerSource.startsWith(openMarker) && controllerSource.endsWith(closeMarker));
  const body = controllerSource.slice(openMarker.length, -closeMarker.length);
  vm.runInContext(`(function () {\n${body}\n globalThis.__api = { beginAnalyticsAttempt, completeAnalyticsAttempt, classifyAgeOutcome, hasReplacementResult, smartResultStatus };\n}());`, ctx);
  return { api: ctx.__api, completions };
}

test('active Smart controller maps success, partial, conflict, timeout, no-result, and error once', () => {
  const { api, completions } = loadControllerAnalytics();
  const fixtures = [
    [{ individualManufactureYear: 2020, exactModel: 'X', brand: 'LG', itemCategory: 'washer' }, 'success', 'resolved'],
    [{ introductionYear: 2018, productFamily: 'Family', precisionLevel: 'family-range', brand: 'Acer', itemCategory: 'computer' }, 'success', 'partial'],
    [{ evidenceConflict: true, brand: 'LG', category: 'television' }, 'conflict', 'conflict'],
    [{ introductionYear: 2018, errorCode: 'PROVIDER_TIMEOUT', fallbackKind: 'deterministic-family', providerAttempted: true }, 'success', 'partial'],
    [{ querySpecificity: 'unusable' }, 'unusable-query', 'no-result'],
    [null, 'network-error', 'error'],
  ];
  fixtures.forEach(([data, bucket, expected]) => {
    const attempt = api.beginAnalyticsAttempt();
    assert.equal(api.completeAnalyticsAttempt(attempt, data, bucket), true);
    assert.equal(api.completeAnalyticsAttempt(attempt, data, bucket), false);
    assert.equal(completions.at(-1).result_status, expected);
  });
  assert.equal(completions.length, fixtures.length);
  assert.equal(completions[3].timeout_with_useful_fallback, true);
  assert.equal(completions[2].conflict_detected, true);
});

test('active Smart controller honors structured lifecycle flags', () => {
  const { api, completions } = loadControllerAnalytics();
  const attempt = api.beginAnalyticsAttempt();
  api.completeAnalyticsAttempt(attempt, {
    identityLevel: 'model-line',
    localEvidenceHit: true,
    groundedResult: true,
    deterministicFallbackUsed: true,
    clarificationRecommended: true,
    timeoutWithUsefulFallback: true,
    introductionYear: 2020,
  }, 'success');
  assert.equal(completions[0].identity_level, 'model-line');
  assert.equal(completions[0].local_evidence_hit, true);
  assert.equal(completions[0].grounded_result, true);
  assert.equal(completions[0].deterministic_fallback_used, true);
  assert.equal(completions[0].clarification_recommended, true);
  assert.equal(completions[0].timeout_with_useful_fallback, true);
});

test('replacement_result_available comes only from structured result fixtures', () => {
  const { api } = loadControllerAnalytics();
  assert.equal(api.hasReplacementResult({ replacementResultAvailable: true }), true);
  assert.equal(api.hasReplacementResult({ replacementResultAvailable: false, replacementCandidates: [{}] }), false);
  assert.equal(api.hasReplacementResult({ replacement: { available: true } }), true);
  assert.equal(api.hasReplacementResult({ replacementCandidates: [{ model: 'safe fixture' }] }), true);
  assert.equal(api.hasReplacementResult({ notes: 'replacement appears in free-form copy' }), false);
});

test('active and legacy Smart paths call the shared attempt lifecycle contract', () => {
  assert.match(controllerSource, /beginSmartAttempt/);
  assert.match(controllerSource, /completeSmartAttempt/);
  assert.match(legacySource, /beginLegacySmartLifecycle/);
  assert.match(legacySource, /completeLegacySmartLifecycle/);
  assert.match(legacySource, /beginSmartAttempt/);
  assert.match(legacySource, /completeSmartAttempt/);
});
