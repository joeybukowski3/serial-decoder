import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), 'utf8');

const retained = {
  'refrigerator-serial-number.html': /why refrigerator decoding starts with the brand/i,
  'washer-serial-number.html': /top-load and front-load labels are not in the same place/i,
  'dryer-serial-number.html': /dryer configuration changes the search path/i,
  'dishwasher-serial-number.html': /why the door must be open for a complete label check/i,
  'range-oven-serial-number.html': /installed cooking products hide labels in different places/i,
  'whirlpool-serial-number-lookup.html': /worked whirlpool range-family example/i,
  'lg-serial-number-lookup.html': /worked lg washer example/i,
  'frigidaire-serial-number-lookup.html': /worked frigidaire refrigerator example/i,
  'maytag-serial-number-lookup.html': /worked maytag dual-era example/i,
  'kenmore-serial-number-lookup.html': /worked kenmore oem-routing example/i,
  'trane-serial-number-lookup.html': /verified trane format example/i,
  'rheem-serial-number-lookup.html': /choose rheem hvac or water heating before decoding/i,
  'asus-serial-number-decoder.html': /verified asus serial example/i
};

const productGuides = [
  'refrigerator-serial-number.html',
  'washer-serial-number.html',
  'dryer-serial-number.html',
  'dishwasher-serial-number.html',
  'range-oven-serial-number.html'
];

function visibleFaqQuestions(html) {
  return [...html.matchAll(/<details class="bp-faq-item">\s*<summary class="bp-faq-summary">\s*<span>(.*?)<\/span>/g)]
    .map((match) => match[1]);
}

function faqSchemaQuestions(html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1]));
  const faq = blocks.find((block) => block['@type'] === 'FAQPage');
  assert.ok(faq, 'expected one FAQPage schema block');
  return faq.mainEntity.map((entity) => entity.name);
}

function headText(html) {
  return [
    html.match(/<title>(.*?)<\/title>/i)?.[1] || '',
    html.match(/<meta name="description" content="([^"]+)"/i)?.[1] || '',
    html.match(/<h1[^>]*>(.*?)<\/h1>/i)?.[1] || ''
  ].join(' ');
}

test('all 13 retained pages have distinct approved purposes and indexable metadata', () => {
  const sitemap = read('sitemap.xml');
  for (const [file, purpose] of Object.entries(retained)) {
    const html = read(file);
    const route = `/${file.replace(/\.html$/, '')}`;
    assert.match(html, purpose, `${file} should state its approved page-specific purpose`);
    assert.equal((html.match(/<h1\b/g) || []).length, 1, `${file} should contain one H1`);
    assert.equal((html.match(/name="robots"/g) || []).length, 1, `${file} should contain one robots policy`);
    assert.match(html, /name="robots" content="index, follow, max-image-preview:large"/);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://www\\.decodemyitem\\.com${route}"`));
    assert.ok(sitemap.includes(`<loc>https://www.decodemyitem.com${route}</loc>`), `${route} should remain in sitemap`);
    assert.match(html, /href="\/smart-lookup"/, `${file} should link to Smart Lookup`);
    assert.match(html, /href="\/methodology"/, `${file} should link to Methodology`);
  }
});

test('product-type pages are honest brand-routing guides, not universal date formats', () => {
  for (const file of productGuides) {
    const html = read(file);
    assert.match(html, /brand-specific|manufacturer|choose the (?:actual |correct )?brand/i, `${file} should require a brand path`);
    assert.match(html, /href="\/how-old-is-my-appliance"/);
    assert.doesNotMatch(headText(html), /exact manufacture date|universal.*decoder/i);
  }
  assert.match(read('dryer-serial-number.html'), /does not publish a fabricated cross-brand worked example/i);
  assert.doesNotMatch(read('dryer-serial-number.html'), /class="ex-terminal"/);
});

test('brand pages expose the tested format boundaries that distinguish them', () => {
  const expectations = new Map([
    ['whirlpool-serial-number-lookup.html', [/9 alphanumeric characters/i, /week 30/i, /01 and 53/i]],
    ['lg-serial-number-lookup.html', [/candidate years 2004, 2014, or 2024/i, /model numbers begin with a letter/i]],
    ['frigidaire-serial-number-lookup.html', [/factory prefix BA/i, /week 05 of 2021/i, /weeks 01 through 53/i]],
    ['maytag-serial-number-lookup.html', [/pre-2006 path/i, /post-2006 path/i, /1999, 2013, or 2043/i]],
    ['kenmore-serial-number-lookup.html', [/prefix 795/i, /LG-built Kenmore/i, /Whirlpool-family fallback/i]],
    ['trane-serial-number-lookup.html', [/year-only/i, /1427XXXXXX/i, /one-year future tolerance/i]],
    ['rheem-serial-number-lookup.html', [/Rheem HVAC/i, /X4502XXXX/i, /water-heater decoder/i]],
    ['asus-serial-number-decoder.html', [/2010-2025/i, /E5N0CV123456/i, /skipping I, O, and Q/i]]
  ]);

  for (const [file, patterns] of expectations) {
    const html = read(file);
    for (const pattern of patterns) assert.match(html, pattern, `${file} missing ${pattern}`);
  }
});

test('worked-example identifiers are tied to repository regression fixtures', () => {
  const regressions = read('tests/decoder-regressions.test.mjs');
  const fixtures = [
    'RX3026733',
    'C21435678',
    '412TATG1H105',
    'BA10515647',
    'NF11910958',
    '12345678WA',
    'W10123456',
    '410KR00219',
    'A00843ESC00128',
    '1427XXXXXX',
    'X4502XXXX',
    'E5N0CV123456',
    'FD8605123456'
  ];
  const combined = Object.keys(retained).map(read).join('\n');
  for (const fixture of fixtures) {
    assert.match(regressions, new RegExp(fixture.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `${fixture} should have regression coverage`);
    assert.match(combined, new RegExp(fixture.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `${fixture} should be used by the generated quality content`);
  }
});

test('target examples contain no illustrative or unresolved filler cards', () => {
  for (const file of Object.keys(retained)) {
    const html = read(file);
    const exampleSection = html.match(/<!-- Examples -->([\s\S]*?)<!-- Location guide -->/)?.[1] || '';
    assert.doesNotMatch(exampleSection, /illustrative|reminder|full serial required|model still helps|context matters/i,
      `${file} should not contain unresolved example cards`);
  }
});

test('visible FAQ sets are distinct and exactly match FAQ schema', () => {
  const signatures = new Set();
  for (const file of Object.keys(retained)) {
    const html = read(file);
    const visible = visibleFaqQuestions(html);
    assert.equal(visible.length, 6, `${file} should have six page-specific questions`);
    assert.deepEqual(visible, faqSchemaQuestions(html), `${file} FAQ schema should match visible questions`);
    const signature = visible.join('|').toLowerCase();
    assert.ok(!signatures.has(signature), `${file} should not reuse another page's FAQ set`);
    signatures.add(signature);
  }
});

test('Rheem route and discovery links consistently mean HVAC, not water heating', () => {
  const rheem = read('rheem-serial-number-lookup.html');
  assert.match(headText(rheem), /Rheem HVAC Serial Number Decoder/i);
  assert.match(rheem, /href="\/how-old-is-my-plumbing"/);
  assert.match(rheem, /data-cat="hvac"/);
  assert.match(read('index.html'), /Rheem HVAC[\s\S]*Heating and cooling serials/);
  assert.doesNotMatch(read('index.html'), /href="\/rheem-serial-number-lookup"[^>]*>[\s\S]{0,180}Water heaters &amp; HVAC/i);
  assert.doesNotMatch(read('how-old-is-my-plumbing.html'), /href="\/rheem-serial-number-lookup"/);
});

test('category-guide links match the retained page purpose', () => {
  for (const file of [...productGuides, 'whirlpool-serial-number-lookup.html', 'lg-serial-number-lookup.html', 'frigidaire-serial-number-lookup.html', 'maytag-serial-number-lookup.html', 'kenmore-serial-number-lookup.html']) {
    assert.match(read(file), /href="\/how-old-is-my-appliance"/, `${file} should link to the appliance guide`);
  }
  for (const file of ['trane-serial-number-lookup.html', 'rheem-serial-number-lookup.html']) {
    assert.match(read(file), /href="\/how-old-is-my-hvac"/, `${file} should link to the HVAC guide`);
  }
  assert.match(read('asus-serial-number-decoder.html'), /href="\/how-old-is-my-electronics"/);
});

test('generalized similarity audit enforces differentiation beyond one threshold', () => {
  const result = spawnSync(process.execPath, ['scripts/audit/generated-page-similarity.mjs', '--enforce'], {
    cwd: new URL('../../', import.meta.url),
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /mean pair similarity:/);
  assert.match(result.stdout, /cluster-wide shared 5-gram ratio:/);
  assert.match(result.stdout, /uniqueWords=/);
});

test('AdSense ownership remains unchanged and no target page contains an authored ad unit', () => {
  assert.equal(read('ads.txt').trim(), 'google.com, pub-5946778263750869, DIRECT, f08c47fec0942fa0');
  for (const file of Object.keys(retained)) {
    const html = read(file);
    assert.equal((html.match(/ca-pub-5946778263750869/g) || []).length, 1, `${file} should keep one verification loader`);
    assert.doesNotMatch(html, /<ins\b[^>]*adsbygoogle|data-ad-slot|class="[^"]*ad-container/i,
      `${file} must not contain an authored visible ad unit`);
  }
});
