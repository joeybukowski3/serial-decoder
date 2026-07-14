import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../analytics-privacy-guard.js', import.meta.url), 'utf8');

function loadGuard() {
  const calls = [];
  const window = {
    gtag(...args) { calls.push(args); }
  };
  const context = vm.createContext({ window, globalThis: window, Object, Array, Number });
  vm.runInContext(source, context);
  return { window, calls };
}

function normalize(value) {
  return JSON.parse(JSON.stringify(value));
}

test('GA4 privacy guard strips raw and arbitrarily named user input fields', () => {
  const { window, calls } = loadGuard();
  window.gtag('event', 'feedback_opened', {
    brand: 'Whirlpool',
    category: 'appliances',
    confidence: 'high',
    context: 'TRD3481274',
    serial: 'TRD3481274',
    model: 'WMH31017HS12',
    query: 'raw query',
    refinedQuery: 'Whirlpool WMH31017HS12',
    rawInput: 'secret',
    searchText: 'secret',
    feedbackText: 'secret',
    email: 'person@example.com',
    unexpectedField: 'secret'
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(normalize(calls[0]), [
    'event',
    'feedback_opened',
    { brand: 'Whirlpool', category: 'appliances', confidence: 'high' }
  ]);
});

test('GA4 privacy guard preserves config calls and approved bounded scalars', () => {
  const { window, calls } = loadGuard();
  window.gtag('config', 'G-C3TXQS1DYP', { send_page_view: false });
  window.gtag('event', 'decode_success', {
    brand: 'GE',
    category: 'appliances',
    mobile: false,
    batch_row_count: 4,
    result_type: 'deterministic'
  });

  assert.deepEqual(normalize(calls[0]), ['config', 'G-C3TXQS1DYP', { send_page_view: false }]);
  assert.deepEqual(normalize(calls[1]), [
    'event',
    'decode_success',
    { brand: 'GE', category: 'appliances', mobile: false, batch_row_count: 4, result_type: 'deterministic' }
  ]);
});

test('GA4 privacy guard drops oversized approved string values', () => {
  const { window, calls } = loadGuard();
  window.gtag('event', 'decode_fail', {
    brand: 'x'.repeat(81),
    failure_type: 'unsupported'
  });
  assert.deepEqual(normalize(calls[0][2]), { failure_type: 'unsupported' });
});
