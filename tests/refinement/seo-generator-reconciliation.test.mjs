import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const generatorPath = path.join(root, 'scripts', 'generate-seo-pages.js');
const generator = fs.readFileSync(generatorPath, 'utf8');

const generatedPages = [
  'appliance-age-for-insurance-and-replacement.html',
  'apple.html',
  'asus-serial-number-decoder.html',
  'bosch.html',
  'carrier-serial-number-lookup.html',
  'dishwasher-serial-number.html',
  'dryer-serial-number.html',
  'frigidaire-serial-number-lookup.html',
  'ge-serial-number-lookup.html',
  'goodman-serial-number-lookup.html',
  'google-pixel.html',
  'hp.html',
  'kenmore-serial-number-lookup.html',
  'lg-serial-number-lookup.html',
  'maytag-serial-number-lookup.html',
  'panasonic.html',
  'range-oven-serial-number.html',
  'refrigerator-serial-number.html',
  'rheem-serial-number-lookup.html',
  'samsung-serial-number-lookup.html',
  'samsung-tv-serial-number-decoder.html',
  'sony.html',
  'trane-serial-number-lookup.html',
  'washer-serial-number.html',
  'whirlpool-serial-number-lookup.html',
  'vizio.html'
];

const targetBrandPages = [
  'carrier-serial-number-lookup.html',
  'goodman-serial-number-lookup.html',
  'ge-serial-number-lookup.html',
  'samsung-serial-number-lookup.html'
];

// Pages with a legitimately hand-tuned <title>/<meta description> that differs
// from the generator's default page.title/page.description derivation.
const htmlTitleOverridePages = {
  'appliance-age-for-insurance-and-replacement.html': 'Appliance Age for Insurance Claims & Replacement | Decode My Item',
  'carrier-serial-number-lookup.html': 'Carrier Serial Number Lookup — HVAC Age & Manufacture Date | Decode My Item',
  'ge-serial-number-lookup.html': 'GE Serial Number Lookup — Manufacture Date Decoder | Decode My Item',
  'goodman-serial-number-lookup.html': 'Goodman Serial Number Lookup — HVAC Age & Manufacture Date | Decode My Item',
  'samsung-serial-number-lookup.html': 'Samsung Serial Number Lookup — Manufacture Date & Age | Decode My Item',
  'whirlpool-serial-number-lookup.html': 'Whirlpool Serial Number Decoder — Year Code & Week | Decode My Item'
};

function readPage(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

test('generator navLinks includes the Resources dropdown and Item History Guides', () => {
  assert.match(generator, /nav-dropdown-item/);
  assert.match(generator, /Resources <span class="nav-chevron"/);
  assert.match(generator, /Item History Guides/);
  assert.match(generator, /href="\/item-history-guides"/);
  assert.match(generator, /href="\/large-loss-decoder">Large Loss Decoder</);
});

test('generator footer includes the Item History Guides column and Large Loss Decoder link', () => {
  assert.match(generator, /footer-col-heading">Item History Guides/);
  assert.match(generator, /href="\/large-loss-decoder">Large Loss Decoder</);
});

test('generator does not reference the legacy /where-is-my-serial-number slug', () => {
  assert.doesNotMatch(generator, /where-is-my-serial-number/);
});

test('generator branding is Decode My Item, not Item Assist', () => {
  // pageHtmlTitle/pageSocialTitle legitimately reference the literal string 'Item Assist'
  // as backward-compatible find/replace logic for any page.title that still contains it.
  // What must NOT exist is a hardcoded "Item Assist" used directly as an emitted value.
  assert.doesNotMatch(generator, /'Item Assist Serial Number Decoder'/);
  assert.doesNotMatch(generator, /name: 'Item Assist'/);
  assert.match(generator, /return 'Decode My Item';/);
  assert.match(generator, /name: page\.applicationName \|\| 'Decode My Item Serial Number Decoder'/);
});

test('generator supports per-page htmlTitleOverride and metaDescriptionOverride', () => {
  assert.match(generator, /function pageHtmlTitle\(page\) \{\s*if \(page\.htmlTitleOverride\)/);
  assert.match(generator, /function pageMetaDescription\(page\) \{\s*return page\.metaDescriptionOverride \|\| page\.description;/);
});

test('generator supports per-page socialTitleOverride and socialDescriptionOverride', () => {
  assert.match(generator, /socialTitleOverride/);
  assert.match(generator, /socialDescriptionOverride/);
});

for (const [file, expectedTitle] of Object.entries(htmlTitleOverridePages)) {
  test(`${file} preserves its hand-tuned <title> after regeneration`, () => {
    const html = readPage(file);
    assert.match(html, new RegExp(`<title>${expectedTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</title>`));
  });
}

for (const file of generatedPages) {
  test(`${file} has exactly one header/navigation shell`, () => {
    const html = readPage(file);
    assert.equal((html.match(/<nav>/g) || []).length, 1, `${file} should have exactly one primary <nav>`);
    assert.equal((html.match(/id="hamburgerBtn"/g) || []).length, 1, `${file} should have exactly one hamburger control`);
    assert.equal((html.match(/<h1[^>]*>/g) || []).length, 1, `${file} should have exactly one H1`);
  });

  test(`${file} uses Decode My Item branding, not Item Assist`, () => {
    const html = readPage(file);
    assert.doesNotMatch(html, /Item Assist/, `${file} should not contain stale Item Assist branding`);
  });

  test(`${file} links directly to current canonical routes, not legacy redirect sources`, () => {
    const html = readPage(file);
    assert.doesNotMatch(html, /href="\/where-is-my-serial-number"/);
    assert.match(html, /href="\/serial-number-location-guide"/);
  });
}

for (const file of targetBrandPages) {
  test(`${file} generated output retains the SEO-strengthening content`, () => {
    const html = readPage(file);
    assert.match(html, /href="\/smart-lookup"/);
    assert.match(html, /href="\/serial-number-location-guide"/);
    assert.match(html, /href="\/methodology"/);
  });
}

test('Carrier generated output contains the worked examples and era-variance explanation', () => {
  const html = readPage('carrier-serial-number-lookup.html');
  assert.match(html, /1419XXXX/);
  assert.match(html, /Why Carrier-family serials can vary/);
});

test('Goodman generated output contains the age section and verified worked examples', () => {
  const html = readPage('goodman-serial-number-lookup.html');
  assert.match(html, /How old is my Goodman unit\?/);
  assert.match(html, /1908123456/);
  assert.match(html, /1404123456/);
});

test('GE generated output contains the multi-cycle explanation and sanitized example', () => {
  const html = readPage('ge-serial-number-lookup.html');
  assert.match(html, /Why does GE show multiple possible years\?/);
  assert.match(html, /AA182127G/);
  assert.match(html, /1977, 1989, 2001, 2013, and 2025/);
});

test('Samsung generated output distinguishes appliance vs. TV serials', () => {
  const html = readPage('samsung-serial-number-lookup.html');
  assert.match(html, /Samsung appliance serials vs\. Samsung TV serials vs\. model numbers/);
  assert.match(html, /A00843ESC00128/);
});

test('running the generator twice in a row is deterministic (no diff between runs)', () => {
  execFileSync('node', [generatorPath], { cwd: root });
  const firstRun = generatedPages.map((f) => fs.readFileSync(path.join(root, f), 'utf8'));
  execFileSync('node', [generatorPath], { cwd: root });
  const secondRun = generatedPages.map((f) => fs.readFileSync(path.join(root, f), 'utf8'));
  generatedPages.forEach((f, i) => {
    assert.equal(secondRun[i], firstRun[i], `${f} should be byte-identical across two consecutive generator runs`);
  });
});
