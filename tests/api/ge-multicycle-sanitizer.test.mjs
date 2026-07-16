import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../serial-multicycle-year-patch.js', import.meta.url), 'utf8');

function loadPatchedSanitizer() {
  const window = {};
  window.sanitizeDecodeResult = function original(result) {
    if (!result || typeof result !== 'object') return { valid: false, reason: 'No result' };
    if (typeof result.month !== 'string' || !result.month) return { valid: false, reason: 'Invalid month' };
    const years = String(result.year || '').split('/');
    if (years.length < 1 || years.length > 4) return { valid: false, reason: 'Too many years' };
    if (!years.every((year) => /^(19|20)\d{2}$/.test(year))) return { valid: false, reason: 'Invalid year' };
    return { valid: true };
  };
  const context = vm.createContext({ window, Date, Number, Object });
  vm.runInContext(source, context);
  return window.sanitizeDecodeResult;
}

function normalize(value) {
  return JSON.parse(JSON.stringify(value));
}

test('valid GE A-code five-cycle result is preserved instead of becoming incomplete', () => {
  const sanitize = loadPatchedSanitizer();
  const result = sanitize({
    year: '1977/1989/2001/2013/2025',
    month: 'January',
    yearCode: 'A',
    monthCode: 'A'
  });

  assert.deepEqual(normalize(result), { valid: true });
});

test('extended candidate support does not admit malformed, duplicate, unordered, or future years', () => {
  const sanitize = loadPatchedSanitizer();
  const invalidYears = [
    '1977/1989/2001/2013/not-a-year',
    '1977/1989/2001/2013/2013',
    '1977/1989/2013/2001/2025',
    '1977/1989/2001/2013/2099',
    '1977/1989/2001/2013/2025/2037/2049/2061/2073'
  ];

  for (const year of invalidYears) {
    assert.equal(sanitize({ year, month: 'January' }).valid, false, year);
  }
});

test('original sanitizer still controls non-year fields', () => {
  const sanitize = loadPatchedSanitizer();
  assert.equal(sanitize({ year: '1977/1989/2001/2013/2025', month: '' }).valid, false);
});
