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

test('/asus permanent redirect takes precedence without a competing rewrite', () => {
  const asusRedirects = vercel.redirects.filter((rule) => rule.source === '/asus');
  assert.deepEqual(asusRedirects, [{
    source: '/asus',
    destination: '/asus-serial-number-decoder',
    permanent: true
  }]);
  assert.equal(
    vercel.rewrites.some((rule) => rule.source === '/asus'),
    false,
    'obsolete /asus → asus.html rewrite must be removed'
  );
  assert.ok(
    vercel.rewrites.some((rule) =>
      rule.source === '/asus-serial-number-decoder' &&
      rule.destination === '/asus-serial-number-decoder.html'
    ),
    'canonical ASUS decoder rewrite must remain'
  );
});

test('static brand/support pages do not reference missing DecodeMyItem social assets', () => {
  const pages = [
    'about.html',
    'brands.html',
    'disclaimer.html',
    'find-model-serial-number.html',
    'privacy-policy.html'
  ];
  const missingNames = [
    'decode-my-item-banner.png',
    'decode-my-item-logo.png'
  ];
  for (const file of pages) {
    const html = fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    for (const missing of missingNames) {
      assert.equal(html.includes(missing), false, `${file} still references missing ${missing}`);
    }
    assert.match(html, /assets\/decodemyitem-logo\.png/);
    assert.doesNotMatch(
      html,
      /assets\/item-assist-(?:banner|logo)\.png/,
      `${file} must not substitute Item Assist branding for DecodeMyItem social/logo images`
    );
  }
  assert.equal(fs.existsSync(new URL('../../assets/decodemyitem-logo.png', import.meta.url)), true);
});
