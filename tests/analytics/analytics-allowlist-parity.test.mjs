import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function guardFields() {
  const source = fs.readFileSync('analytics-privacy-guard.js', 'utf8');
  const window = { gtag() {} };
  vm.runInContext(source, vm.createContext({ window, globalThis: window, Object, Array, Number }));
  return Object.keys(window.ItemAssistAnalyticsPrivacy.allowedEventFields).sort();
}

function bootstrapFields() {
  const source = fs.readFileSync('analytics.js', 'utf8');
  const window = { gtag() {}, matchMedia() { return { matches: false }; } };
  const document = {
    readyState: 'complete', title: '', body: { getAttribute() { return ''; } }, addEventListener() {},
  };
  const localStorage = { getItem() { return null; }, setItem() {} };
  vm.runInContext(source, vm.createContext({
    window, document, localStorage, location: { pathname: '/' }, Date, Object, Array, Number, String, Boolean, JSON,
  }));
  return Object.keys(window.ItemAssistAnalyticsPrivacy.allowedEventFields).sort();
}

test('sitewide analytics and standalone privacy guard allowlists remain identical', () => {
  assert.deepEqual(bootstrapFields(), guardFields());
});
