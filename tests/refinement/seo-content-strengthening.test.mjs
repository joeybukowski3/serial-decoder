import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function readPage(file) {
  return fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
}

function faqSchema(html) {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/);
  assert.ok(match, 'expected a FAQPage JSON-LD block');
  return JSON.parse(match[1]);
}

function visibleFaqQuestions(html) {
  const items = [...html.matchAll(/<details class="bp-faq-item">\s*<summary class="bp-faq-summary">\s*<span>(.*?)<\/span>/g)];
  return items.map((m) => m[1]);
}

const brandPages = [
  'carrier-serial-number-lookup.html',
  'goodman-serial-number-lookup.html',
  'ge-serial-number-lookup.html',
  'samsung-serial-number-lookup.html'
];

const forbiddenCertaintyPhrases = [
  /100%\s*accurate/i,
  /always\s+correct/i,
  /guaranteed\s+(accurate|accuracy|result|exact)/i,
  /never\s+wrong/i
];

const competitorToolNames = ['serial number decoder\\.io', 'checkserial', 'decoderatings'];

for (const file of brandPages) {
  test(`${file} contains no unsupported certainty language`, () => {
    const html = readPage(file);
    for (const pattern of forbiddenCertaintyPhrases) {
      assert.doesNotMatch(html, pattern, `${file} should not contain certainty language matching ${pattern}`);
    }
  });

  test(`${file} does not cite a competitor tool as an authority`, () => {
    const html = readPage(file).toLowerCase();
    for (const name of competitorToolNames) {
      assert.doesNotMatch(html, new RegExp(name, 'i'), `${file} should not name ${name}`);
    }
  });

  test(`${file} has no duplicate canonical, robots, H1, or FAQPage schema`, () => {
    const html = readPage(file);
    assert.equal((html.match(/rel="canonical"/g) || []).length, 1, `${file} should have exactly one canonical link`);
    assert.equal((html.match(/name="robots"/g) || []).length, 1, `${file} should have exactly one robots meta tag`);
    assert.equal((html.match(/<h1[^>]*>/g) || []).length, 1, `${file} should have exactly one H1`);
    assert.equal((html.match(/"@type":"FAQPage"/g) || []).length, 1, `${file} should have exactly one FAQPage schema block`);
  });

  test(`${file} FAQ schema matches visible FAQ questions`, () => {
    const html = readPage(file);
    const schema = faqSchema(html);
    const schemaQuestions = schema.mainEntity.map((q) => q.name);
    const visibleQuestions = visibleFaqQuestions(html);
    assert.deepEqual(visibleQuestions, schemaQuestions, `${file} visible FAQ order/text should match FAQPage schema exactly`);
  });

  test(`${file} internal links avoid legacy redirect sources and empty/localhost hrefs`, () => {
    const html = readPage(file);
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    for (const href of hrefs) {
      assert.notEqual(href.trim(), '', `${file} should not contain an empty href`);
      assert.notEqual(href, '#', `${file} should not contain a bare # href`);
      assert.doesNotMatch(href, /localhost|127\.0\.0\.1/, `${file} should not link to a localhost URL`);
    }
    const legacyRedirectSources = ['/carrier', '/goodman', '/ge', '/samsung'];
    for (const source of legacyRedirectSources) {
      assert.ok(!hrefs.includes(source), `${file} should not link to legacy redirect source ${source}`);
    }
  });

  test(`${file} links to Smart Lookup, Serial Number Location Guide, and Methodology`, () => {
    const html = readPage(file);
    assert.match(html, /href="\/smart-lookup"/, `${file} should link to Smart Lookup`);
    assert.match(html, /href="\/serial-number-location-guide"/, `${file} should link to the Serial Number Location Guide`);
    assert.match(html, /href="\/methodology"/, `${file} should link to Methodology`);
  });
}

test('Carrier page has worked examples and era/plant-family explanation', () => {
  const html = readPage('carrier-serial-number-lookup.html');
  assert.match(html, /1419XXXX/, 'expected the documented 1419XXXX worked example');
  assert.match(html, /0892XXXX/, 'expected the second worked example demonstrating the century pivot');
  assert.match(html, /Why Carrier-family serials can vary/, 'expected the era/plant/family explanation section');
  assert.match(html, /does not currently decode tonnage or capacity from a Carrier model number/, 'expected an honest tonnage limitation, not a fabricated capability');
});

test('Goodman page has the "How old is my Goodman unit?" section and worked examples from verified tests', () => {
  const html = readPage('goodman-serial-number-lookup.html');
  assert.match(html, /How old is my Goodman unit\?/);
  assert.match(html, /1908123456/, 'expected the verified test-fixture example 1908123456 (August 2019)');
  assert.match(html, /1404123456/, 'expected the verified test-fixture example 1404123456 (April 2014)');
  assert.match(html, /this site does not currently decode tonnage or BTU capacity from the model number/, 'expected an honest tonnage limitation, not a fabricated capability');
});

test('GE page contains the multi-cycle explanation and the sanitized AA182127G example', () => {
  const html = readPage('ge-serial-number-lookup.html');
  assert.match(html, /Why does GE show multiple possible years\?/);
  assert.match(html, /12-year repeating letter cycle/);
  assert.match(html, /AA182127G/, 'expected the sanitized worked example serial');
  assert.match(html, /1977, 1989, 2001, 2013, and 2025/, 'expected all 5 candidate years from the current decoder logic');
  assert.doesNotMatch(html, /GTWN8250D0WS[^<]*(?:is|resolves to|confirms)\s+2013/i, 'must not hardcode 2013 as the definitive year for an unverified model');
  assert.match(html, /RZ825479/, 'expected the second, test-verified GE example');
  assert.match(html, /GTH18GBCDCRBB/, 'expected the model used in the real model-narrowing regression test');
});

test('Samsung page distinguishes appliance vs. TV serials and includes both worked example types', () => {
  const html = readPage('samsung-serial-number-lookup.html');
  assert.match(html, /Samsung appliance serials vs\. Samsung TV serials vs\. model numbers/);
  assert.match(html, /Model number vs\. serial number/);
  assert.match(html, /A00843ESC00128/, 'expected the verified appliance worked example');
  assert.match(html, /07R5CAHJB001234/, 'expected the documented TV/electronics worked example');
});

test('methodology page contains all required trust sections', () => {
  const html = readPage('methodology.html');
  assert.match(html, /How decoder rules are researched/);
  assert.match(html, /How rules are verified/);
  assert.match(html, /How ambiguity is handled/);
  assert.match(html, /Correction policy/);
  assert.match(html, /Limitations/);
  assert.match(html, /Testing and change control/);
  assert.match(html, /Decode My Item is provided by Item Assist/);
});

test('methodology page contains no unsupported certainty language and does not cite a competitor as an authority', () => {
  const html = readPage('methodology.html');
  for (const pattern of forbiddenCertaintyPhrases) {
    assert.doesNotMatch(html, pattern);
  }
  for (const name of competitorToolNames) {
    assert.doesNotMatch(html.toLowerCase(), new RegExp(name, 'i'));
  }
});

test('methodology page links to the core tools and feedback', () => {
  const html = readPage('methodology.html');
  assert.match(html, /href="\/feedback"/);
  assert.match(html, /href="\/about"/);
  assert.match(html, /href="\/decoder-tool"/);
  assert.match(html, /href="\/smart-lookup"/);
  assert.match(html, /href="\/brands"/);
  assert.match(html, /href="\/serial-number-location-guide"/);
});

test('generator source config documents the new content for all four brand pages', () => {
  const generator = fs.readFileSync(new URL('../../scripts/generate-seo-pages.js', import.meta.url), 'utf8');
  assert.match(generator, /how-old-is-my-goodman-unit/, 'Goodman config should document the new section');
  assert.match(generator, /why-multiple-years/, 'GE config should document the new section');
  assert.match(generator, /appliance-vs-tv/, 'Samsung config should document the new section');
  assert.match(generator, /why-carrier-varies/, 'Carrier config should document the new section');
});
