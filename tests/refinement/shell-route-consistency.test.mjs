import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const generator = fs.readFileSync(new URL('../../scripts/generate-seo-pages.js', import.meta.url), 'utf8');
const home = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

test('generated shell uses Decode My Item as its product brand', () => {
  assert.match(generator, /return 'Decode My Item';/);
  assert.match(generator, /name: 'Decode My Item Serial Number Decoder'/);
  assert.match(generator, /aria-label="Decode My Item home"/);
});

test('homepage Back to Top stays hidden until a meaningful scroll threshold', () => {
  assert.match(home, /window\.scrollY > 480/);
  assert.match(home, /back-to-top-fab\.is-visible/);
});
