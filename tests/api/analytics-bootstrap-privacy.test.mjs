import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../analytics.js', import.meta.url), 'utf8');

function normalize(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadAnalytics() {
  const gtagCalls = [];
  const storage = new Map();
  const document = {
    readyState: 'complete',
    title: 'Smart Lookup',
    body: { getAttribute() { return 'smart-lookup'; } },
    addEventListener() {}
  };
  const window = {
    gtag(...args) { gtagCalls.push(args); },
    matchMedia() { return { matches: false }; }
  };
  const localStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, value); },
    removeItem(key) { storage.delete(key); }
  };
  const context = vm.createContext({
    window,
    document,
    localStorage,
    location: { pathname: '/smart-lookup' },
    globalThis: window,
    Date,
    Object,
    Array,
    Number,
    String,
    Boolean,
    JSON,
  });
  vm.runInContext(source, context);
  return { window, gtagCalls };
}

test('sitewide analytics bootstrap strips raw Smart Lookup fields from GA4', () => {
  const { window, gtagCalls } = loadAnalytics();
  window.gtag('event', 'smart_lookup_success', {
    brand: 'Samsung',
    category: 'electronics',
    result_type: 'provider',
    context: 'Samsung QN65Q80A serial 123456789',
    query: 'Samsung QN65Q80A',
    refinedQuery: 'Samsung QN65Q80A television',
    serial: '123456789',
    model: 'QN65Q80A',
    email: 'person@example.com',
    arbitraryRenamedInput: 'private value'
  });

  const event = gtagCalls.at(-1);
  assert.deepEqual(normalize(event), [
    'event',
    'smart_lookup_success',
    { brand: 'Samsung', category: 'electronics', result_type: 'provider' }
  ]);
});

test('sitewide analytics bootstrap keeps non-event gtag calls unchanged', () => {
  const { window, gtagCalls } = loadAnalytics();
  window.gtag('config', 'G-C3TXQS1DYP', { send_page_view: false });
  assert.deepEqual(normalize(gtagCalls.at(-1)), [
    'config',
    'G-C3TXQS1DYP',
    { send_page_view: false }
  ]);
});
