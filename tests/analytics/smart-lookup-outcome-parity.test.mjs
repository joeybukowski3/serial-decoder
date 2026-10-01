import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

import { classifyAgeBucket, classifySmartOutcome, yearSignalOf } from '../../lib/smart-lookup/outcome.js';

/**
 * The browser controller (a classic script) and lib/smart-lookup/outcome.js
 * (used for server logs and Redis counters) each implement the same outcome
 * classification. This test runs one shared fixture table through BOTH and
 * fails on any difference, so GA4, logs and counters can never disagree.
 */

const controllerSource = fs.readFileSync('src/browser/smart-lookup-controller.js', 'utf8').replace(/\r\n/g, '\n');

function loadController() {
  const ctx = {
    console,
    setTimeout: () => 0,
    clearTimeout() {},
    fetch: async () => ({ ok: false, status: 0, json: async () => ({}) }),
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
    document: {
      readyState: 'complete', addEventListener() {}, querySelector() { return null }, querySelectorAll() { return []; },
      getElementById() { return null; }, createElement() { return { classList: { add() {} }, querySelector() { return null; }, querySelectorAll() { return []; } }; },
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  const open = "(function () {\n  'use strict';\n";
  const close = '\n}());\n';
  assert.ok(controllerSource.startsWith(open) && controllerSource.endsWith(close));
  const body = controllerSource.slice(open.length, -close.length);
  vm.runInContext(`(function () {\n${body}\n globalThis.__api = { classifyAgeOutcome, classifySmartOutcome, yearSignalOf, renderNeedsDetail, copyForAgeOutcome, beginAnalyticsAttempt, completeAnalyticsAttempt, rememberNeedsDetail };\n}());`, ctx);
  return { api: ctx.__api, ctx };
}

const { api } = loadController();

function buildFixtures() {
  const fixtures = [];
  const add = (label, data) => fixtures.push([label, data]);

  const codes = [
    'RATE_LIMIT', 'PROVIDER_RATE_LIMIT', 'RATE_LIMIT_STORE_UNAVAILABLE', 'PROVIDER_TIMEOUT', 'TOTAL_DEADLINE',
    'GLOBAL_BUDGET_EXHAUSTED', 'BUDGET_STORE_UNAVAILABLE', 'AI_QUOTA_EXCEEDED', 'INTERNAL_ERROR', 'PROVIDERS_UNAVAILABLE',
    'OPENAI_SCHEMA_INVALID', 'OPENAI_HTTP_ERROR', 'PROVIDER_UNAVAILABLE', 'PROVIDER_5XX', 'PROVIDER_UNUSABLE_OUTPUT',
    'PROVIDER_MALFORMED_JSON', 'GROQ_EMPTY', 'UNRELATED_BRAND', 'INVALID_YEAR', 'INSUFFICIENT_QUERY_DETAIL',
    'INTRODUCTION_AFTER_RANGE', 'REVERSED_RANGE', 'SOMETHING_NEW',
  ];
  for (const code of codes) {
    add(`${code} plain`, { brand: 'Whirlpool', category: 'washer', errorCode: code, querySpecificity: 'brand-category' });
    add(`${code} unknown brand`, { brand: 'Unknown', errorCode: code });
    add(`${code} family`, { brand: 'Dell', productFamily: 'OptiPlex', yearContext: { type: 'unknown' }, errorCode: code });
    add(`${code} exact family`, { brand: 'LG', productFamily: 'C3', exactModel: 'OLED55C3PUA', errorCode: code });
    add(`${code} with dated fallback`, { introductionYear: 2018, errorCode: code, fallbackKind: 'deterministic-family' });
  }
  for (const routeMode of [null, 'general_guidance', 'precision_research']) {
    add(`brand-category ${routeMode}`, { brand: 'Whirlpool', category: 'washer', querySpecificity: 'brand-category', routeMode });
    add(`brand+model ${routeMode}`, { brand: 'Whirlpool', model: 'WRF535', querySpecificity: 'free-description', routeMode });
    add(`brand only ${routeMode}`, { brand: 'Whirlpool', querySpecificity: 'brand-only', routeMode });
    add(`category only ${routeMode}`, { category: 'washer', querySpecificity: 'category-only', routeMode });
    add(`category history ${routeMode}`, { category: 'washer', querySpecificity: 'category-only', historicalContext: 'History.', routeMode });
    add(`likelyProduct only ${routeMode}`, { brand: 'Unknown', likelyProduct: 'iPhone 14', querySpecificity: 'free-description', routeMode });
    add(`nothing ${routeMode}`, { brand: 'Unknown', querySpecificity: 'free-description', routeMode });
  }
  add('unusable', { querySpecificity: 'unusable' });
  add('null payload', null);
  add('empty payload', {});
  add('serial handoff only', { serialDetected: { action: 'use-decoder' }, brand: 'Unknown' });
  add('withheld timing', { brand: 'LG', category: 'television', querySpecificity: 'brand-category', yearEvidenceWithheld: true });
  add('conflict flag', { evidenceConflict: true, brand: 'LG', category: 'television' });
  add('conflict flag with year', { evidenceConflict: true, introductionYear: 2019, brand: 'LG' });
  for (const [label, extra] of [
    ['exact unit', { individualManufactureYear: 2020 }],
    ['introduction year', { introductionYear: 2018 }],
    ['candidates', { manufactureYearCandidates: [2019, 2029] }],
    ['production range', { productionRange: { start: 2017, end: 2020 } }],
    ['year context value', { yearContext: { type: 'market-introduction', value: 2016 } }],
    ['year context range', { yearContext: { type: 'production-range', startYear: 2014, endYear: 2018 } }],
    ['family year', { familyIntroductionYear: 2012 }],
    ['category entry', { categoryEntryYear: 1966 }],
    ['open-ended explicit', { introductionYear: 2015, estimatedRange: { start: 2015, end: null }, estimateBasis: 'product-family-introduction' }],
    ['open-ended from schema', { introductionYear: 2015, openEndedRange: true, yearSignal: 'open-ended' }],
    ['year via introduction basis', { introductionYear: 2015, estimatedRange: { start: 2015, end: null }, estimateBasis: 'model-introduction' }],
  ]) {
    add(label, { brand: 'LG', ...extra });
    add(`${label} family-range`, { brand: 'LG', ...extra, precisionLevel: 'family-range' });
    add(`${label} broad-range`, { brand: 'LG', ...extra, precisionLevel: 'broad-range' });
    add(`${label} general-guidance`, { brand: 'LG', ...extra, precisionLevel: 'general-guidance' });
    add(`${label} deterministic`, { brand: 'LG', ...extra, fallbackKind: 'deterministic-model-line' });
    add(`${label} guidance route`, { brand: 'LG', ...extra, routeMode: 'general_guidance' });
  }
  add('year signal supplied by schema', { brand: 'LG', introductionYear: 2018, yearSignal: 'range' });
  add('year signal supplied but invalid', { brand: 'LG', introductionYear: 2018, yearSignal: 'bogus' });
  return fixtures;
}

const fixtures = buildFixtures();

test('the fixture table is broad enough to be meaningful', () => {
  assert.ok(fixtures.length > 150, `only ${fixtures.length} fixtures`);
});

test('browser and server classify every fixture identically', () => {
  const mismatches = [];
  for (const [label, data] of fixtures) {
    const serverBucket = classifyAgeBucket(data);
    const clientBucket = api.classifyAgeOutcome(data);
    const server = classifySmartOutcome(data, serverBucket);
    const client = JSON.parse(JSON.stringify(api.classifySmartOutcome(data, clientBucket)));
    if (serverBucket !== clientBucket || JSON.stringify(server) !== JSON.stringify(client)) {
      mismatches.push({ label, serverBucket, clientBucket, server, client });
    }
  }
  assert.deepEqual(mismatches, []);
});

test('browser and server agree on the year signal', () => {
  for (const [label, data] of fixtures) {
    assert.equal(api.yearSignalOf(data), yearSignalOf(data), label);
  }
});

test('the mapping never produces a status outside the documented set', () => {
  const allowed = new Set(['resolved', 'partial', 'needs-detail', 'conflict', 'no-result', 'error']);
  for (const [label, data] of fixtures) {
    assert.ok(allowed.has(classifySmartOutcome(data).resultStatus), label);
  }
});

test('429, RATE_LIMIT and limiter outages are errors in the browser too', () => {
  for (const code of ['PROVIDER_RATE_LIMIT', 'RATE_LIMIT', 'RATE_LIMIT_STORE_UNAVAILABLE']) {
    assert.equal(api.classifySmartOutcome({ brand: 'Dell', errorCode: code }).resultStatus, 'error', code);
  }
});

// ── Analytics payload ─────────────────────────────────────────────────────────

test('the completion event reports status, reason, year signal, route mode and refinement', () => {
  const { api: controller, ctx } = loadController();
  const completions = [];
  ctx.DecodeMyItemAnalytics = {
    beginSmartAttempt(metadata) { return { completed: false, metadata: metadata || {} }; },
    completeSmartAttempt(attempt, outcome) {
      if (!attempt || attempt.completed) return false;
      attempt.completed = true;
      completions.push({ ...(attempt.metadata || {}), ...JSON.parse(JSON.stringify(outcome)) });
      return true;
    },
  };
  const attempt = controller.beginAnalyticsAttempt('samsung refrigerator');
  controller.completeAnalyticsAttempt(attempt, {
    brand: 'Samsung', category: 'refrigerator', querySpecificity: 'brand-category', routeMode: 'general_guidance',
  }, 'brand-category-recognized');
  const [event] = completions;
  assert.equal(event.result_status, 'needs-detail');
  assert.equal(event.outcome_reason, 'general-guidance');
  assert.equal(event.year_signal, 'none');
  assert.equal(event.route_mode, 'general_guidance');
  assert.equal(event.refinement_of_needs_detail, undefined, 'a first lookup is not a refinement');
});

// ── "Needs detail" is guidance, never "No result" ─────────────────────────────

test('the needs-detail card shows what is known, never "No result", and never a date', () => {
  const data = {
    brand: 'Samsung', category: 'refrigerator', querySpecificity: 'brand-category', routeMode: 'general_guidance',
    notes: 'We identified this as a Samsung refrigerator, but there is not enough identifying information yet to estimate a manufacture date.',
    recommendedIdentifiers: ['Enter the complete model number from the product label.', 'Enter the serial number for a unit-specific manufacture date.'],
    providerAttempted: false,
  };
  const html = api.renderNeedsDetail(data, api.copyForAgeOutcome('brand-category-recognized', data));
  assert.match(html, /General product match/);
  assert.match(html, /We identified this as a Samsung refrigerator/);
  assert.match(html, /<span class="result-label">Manufacturer<\/span><span class="result-value">Samsung<\/span>/);
  assert.match(html, /<span class="result-label">Product type<\/span><span class="result-value">refrigerator<\/span>/);
  assert.match(html, /<span class="result-label">Exact model<\/span><span class="result-value">Not identified<\/span>/);
  assert.match(html, /<span class="result-label">Manufacture date<\/span><span class="result-value">Needs more detail<\/span>/);
  assert.match(html, /To narrow it down/);
  assert.match(html, /model number/i);
  assert.doesNotMatch(html, /No result/i);
  assert.doesNotMatch(html, /\b(19|20)\d{2}\b/, 'no year appears anywhere in a guidance card');
  assert.doesNotMatch(html, /data-smart-lookup-retry/, 'there is nothing new to research for broad guidance');
});

test('a precision answer with no year offers a real re-research action', () => {
  const data = {
    brand: 'Whirlpool', exactModel: 'WRF535SWHZ00', likelyProduct: 'Whirlpool WRF535SWHZ00 refrigerator',
    querySpecificity: 'exact-model', routeMode: 'precision_research', providerAttempted: true, summary: 'A French-door refrigerator.',
  };
  const html = api.renderNeedsDetail(data, api.copyForAgeOutcome('model-only-insufficient', data));
  assert.match(html, /data-smart-lookup-retry="age"/);
  assert.match(html, /Identified as:<\/strong> Whirlpool WRF535SWHZ00 refrigerator/);
  assert.match(html, /Needs more detail/);
  assert.doesNotMatch(html, /No result/i);
});

test('rendered values are HTML-escaped', () => {
  const html = api.renderNeedsDetail({
    brand: '<img src=x onerror=alert(1)>', category: '<b>x</b>', routeMode: 'general_guidance', notes: '<script>1</script>',
  }, null);
  assert.doesNotMatch(html, /<img |<script>|<b>x/);
});

// ── Refinement after needs-detail (measurable client-side, boolean only) ───────

test('a different query soon after a needs-detail result is flagged as a refinement', () => {
  const { api: controller, ctx } = loadController();
  const begun = [];
  ctx.DecodeMyItemAnalytics = {
    beginSmartAttempt(metadata) { const attempt = { completed: false, metadata: metadata || {} }; begun.push(attempt); return attempt; },
    completeSmartAttempt() { return true; },
  };
  controller.beginAnalyticsAttempt('samsung refrigerator');
  controller.rememberNeedsDetail('samsung refrigerator', { resultStatus: 'needs-detail' });

  controller.beginAnalyticsAttempt('samsung refrigerator'); // same text: a Retry, not a refinement
  controller.beginAnalyticsAttempt('samsung rf28r7551sr');  // more detail: a refinement
  controller.rememberNeedsDetail('samsung rf28r7551sr', { resultStatus: 'resolved' });
  controller.beginAnalyticsAttempt('something else');       // previous lookup was not needs-detail

  assert.deepEqual(begun.map((attempt) => attempt.metadata.refinement_of_needs_detail === true), [false, false, true, false]);
  assert.ok(begun.every((attempt) => Object.keys(attempt.metadata).every((key) => key === 'refinement_of_needs_detail')), 'only a boolean is sent, never the previous query');
});
