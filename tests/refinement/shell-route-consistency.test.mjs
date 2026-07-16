import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const generator = fs.readFileSync(new URL('../../scripts/generate-seo-pages.js', import.meta.url), 'utf8');
const home = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const vercel = JSON.parse(fs.readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));

const legacyRedirects = {
  '/appliance-age-by-serial-number': '/how-old-is-my-appliance',
  '/washer-serial-number-lookup': '/washer-serial-number',
  '/dishwasher-serial-number-lookup': '/dishwasher-serial-number',
  '/dryer-serial-number-lookup': '/dryer-serial-number',
  '/oven-serial-number-lookup': '/range-oven-serial-number',
  '/refrigerator-serial-number-lookup': '/refrigerator-serial-number',
  '/where-is-my-serial-number': '/serial-number-location-guide'
};

function rootHtmlFiles() {
  return fs.readdirSync(new URL('../../', import.meta.url))
    .filter((file) => file.endsWith('.html'));
}

test('generated shell uses Decode My Item as its product brand', () => {
  assert.match(generator, /return 'Decode My Item';/);
  assert.match(generator, /name: page\.applicationName \|\| 'Decode My Item Serial Number Decoder'/);
  assert.match(generator, /aria-label="Decode My Item home"/);
});

test('homepage Back to Top stays hidden until a meaningful scroll threshold', () => {
  assert.match(home, /window\.scrollY > 480/);
  assert.match(home, /back-to-top-fab\.is-visible/);
});

test('public HTML does not link users through legacy redirect sources', () => {
  for (const file of rootHtmlFiles()) {
    const html = fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    for (const source of Object.keys(legacyRedirects)) {
      assert.doesNotMatch(html, new RegExp(`href=["']${source}["']`), `${file} links to ${source}`);
    }
  }
});

test('legacy redirect definitions remain in place with canonical destinations', () => {
  for (const [source, destination] of Object.entries(legacyRedirects)) {
    assert.ok(vercel.redirects.some((rule) => rule.source === source && rule.destination === destination),
      `Missing redirect from ${source} to ${destination}`);
  }
});
