import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../../lookup-completion-analytics.js', import.meta.url), 'utf8');

function createHarness({ withGtag = true, gtagImpl } = {}) {
  const calls = [];
  const listeners = {};
  const document = {
    readyState: 'complete',
    documentElement: {},
    addEventListener(type, handler) { listeners[type] = handler; },
    getElementById() { return null; },
    querySelector() { return null; },
  };
  const window = {
    gtag: withGtag
      ? (gtagImpl || function (...args) { calls.push(args); })
      : undefined,
  };
  class MutationObserver {
    constructor(callback) { this.callback = callback; }
    observe() {}
  }
  const context = vm.createContext({
    window,
    document,
    MutationObserver,
    setTimeout(callback) { callback(); return 1; },
    clearTimeout() {},
    Map,
    Boolean,
    Number,
    String,
    Object,
    Array,
    Math,
    JSON,
    isFinite,
  });
  vm.runInContext(source, context, { filename: 'lookup-completion-analytics.js' });
  return { api: window.DecodeMyItemAnalytics, calls, listeners };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('emits the canonical GA4 event through the existing gtag path', () => {
  const { api, calls } = createHarness();
  const result = api.track('decode_complete', {
    lookup_type: 'serial_decode',
    result_status: 'resolved',
    candidate_year_count: 1,
  });
  assert.equal(result, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(plain(calls[0]), ['event', 'decode_complete', {
    lookup_type: 'serial-decode',
    result_status: 'resolved',
    candidate_year_count: 1,
  }]);
});

test('is non-blocking and safe when gtag is unavailable or throws', () => {
  const unavailable = createHarness({ withGtag: false });
  assert.equal(unavailable.api.track('decode_complete', { lookup_type: 'serial_decode' }), false);

  const blocked = createHarness({ gtagImpl() { throw new Error('blocked'); } });
  assert.doesNotThrow(() => blocked.api.track('smart_lookup_complete', { lookup_type: 'smart_lookup' }));
  assert.equal(blocked.api.track('smart_lookup_complete', { lookup_type: 'smart_lookup' }), false);
});

test('drops unknown parameters and never serializes raw fixture values', () => {
  const { api, calls } = createHarness();
  const fixtures = [
    'FR31424IN',
    'GFW850SPN0DG',
    'GFW850SPNDG',
    'QN65Q60RAFXZA',
    'WM3900HWA',
    '7PJ2XK1',
    'private notes fixture',
    'provider raw error fixture',
  ];
  api.track('smart_lookup_complete', {
    lookup_type: 'smart_lookup',
    result_status: 'resolved',
    identity_level: 'exact-model',
    raw_query: fixtures.join('|'),
    model: fixtures[1],
    serial: fixtures[0],
    notes: fixtures[6],
    raw_error: fixtures[7],
  });
  assert.equal(calls.length, 1);
  const serialized = JSON.stringify(calls[0]);
  fixtures.forEach((fixture) => assert.equal(serialized.includes(fixture), false, fixture));
  assert.deepEqual([...Object.keys(calls[0][2])].sort(), ['identity_level', 'lookup_type', 'result_status']);
});

test('rejects unsupported event names', () => {
  const { api, calls } = createHarness();
  assert.equal(api.track('decode_item', { lookup_type: 'serial_decode' }), false);
  assert.equal(calls.length, 0);
});

test('source binds attempts to user submissions and not retry controls', () => {
  assert.match(source, /#decodeBtn, \[data-smart-lookup-submit=/);
  assert.match(source, /event\.target\.id === 'smart-lookup-input'/);
  assert.doesNotMatch(source, /data-smart-lookup-retry[^\n]+beginSmartAttempt/);
  assert.match(source, /decodeFiredFor !== state\.decodeSequence/);
  assert.match(source, /smartFiredFor !== state\.smartSequence/);
});
