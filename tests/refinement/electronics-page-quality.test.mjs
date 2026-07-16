import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), 'utf8');

const retained = {
  'apple.html': /legacy serials versus randomized serials/i,
  'hp.html': /what the supported hp rule reads/i,
  'sony.html': /what the sony suffix can determine/i,
  'bosch.html': /how the supported bosch fd path works/i,
  'vizio.html': /why vizio uses a model path/i,
  'samsung-tv-serial-number-decoder.html': /supported samsung tv serial positions/i
};
const noindex = ['google-pixel.html', 'panasonic.html'];
const targetFiles = [...Object.keys(retained), ...noindex];

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

test('retained electronics pages have distinct approved purposes and required recovery links', () => {
  for (const [file, purpose] of Object.entries(retained)) {
    const html = read(file);
    assert.match(html, purpose, `${file} should state its approved page-specific purpose`);
    assert.match(html, /href="\/smart-lookup"/, `${file} should link to Smart Lookup`);
    assert.match(html, /href="\/methodology"/, `${file} should link to Methodology`);
    assert.match(html, /href="\/how-old-is-my-electronics"/, `${file} should link to the electronics guide`);
    assert.equal((html.match(/<h1\b/g) || []).length, 1, `${file} should contain one H1`);
    assert.equal((html.match(/name="robots"/g) || []).length, 1, `${file} should contain one robots policy`);
    assert.match(html, /name="robots" content="index, follow, max-image-preview:large"/);
  }
});

test('narrow pages do not position model or randomized identifiers as universal serial manufacture-date decoders', () => {
  const apple = read('apple.html');
  const sony = read('sony.html');
  const vizio = read('vizio.html');

  assert.match(apple, /randomized serials do not provide a dependable date pattern/i);
  assert.doesNotMatch(apple, /<h1[^>]*>[^<]*manufacture date/i);
  assert.match(sony, /model-generation context, not the manufacture date/i);
  assert.match(sony, /Enter Sony TV Model Number/);
  assert.doesNotMatch(sony, /<h1[^>]*>.*Serial Number Decoder/i);
  assert.match(vizio, /model number is required/i);
  assert.match(vizio, /arbitrary serials are not decoded into dates/i);
  assert.doesNotMatch(vizio, /<h1[^>]*>.*Serial Number Decoder/i);
});

test('worked examples match repository-backed decoder fixtures', () => {
  const examples = new Map([
    ['apple.html', ['C02X12ABCDEF', '2019 or 2029', 'week field']],
    ['hp.html', ['CNX7120BXX', '2007 or 2017', 'production week 12']],
    ['sony.html', ['XR65A90K', '2022 model-year family']],
    ['bosch.html', ['FD8605123456', '2006', 'May']],
    ['vizio.html', ['VW32L HDTV10A', 'September 2007', 'V505-J09']],
    ['samsung-tv-serial-number-decoder.html', ['07R5CAHJB001234', '2017 or 2037', 'November']]
  ]);
  for (const [file, markers] of examples) {
    const html = read(file);
    for (const marker of markers) assert.match(html, new RegExp(marker, 'i'), `${file} missing ${marker}`);
  }
});

test('retained FAQ schema exactly matches visible brand-specific FAQs', () => {
  const questionSets = new Set();
  for (const file of Object.keys(retained)) {
    const html = read(file);
    const visible = visibleFaqQuestions(html);
    assert.deepEqual(visible, faqSchemaQuestions(html), `${file} FAQ schema should match visible questions`);
    const signature = visible.join('|').toLowerCase();
    assert.ok(!questionSets.has(signature), `${file} should not reuse another page's FAQ set`);
    questionSets.add(signature);
  }
});

test('noindex electronics pages are public but excluded from sitemap and rich-result schema', () => {
  const sitemap = read('sitemap.xml');
  for (const file of noindex) {
    const route = `/${file.replace(/\.html$/, '')}`;
    const html = read(file);
    assert.equal((html.match(/name="robots"/g) || []).length, 1, `${file} should contain one robots policy`);
    assert.match(html, /name="robots" content="noindex, follow"/);
    assert.equal((html.match(/"@type":"FAQPage"/g) || []).length, 0, `${file} should keep schema minimal`);
    assert.equal((html.match(/"@type":"WebApplication"/g) || []).length, 0, `${file} should not promote a provisional decoder in schema`);
    assert.ok(!sitemap.includes(`<loc>https://www.decodemyitem.com${route}</loc>`), `${route} must not be in sitemap`);
  }
});

test('primary discovery surfaces exclude noindex electronics routes and point to retained canonical pages', () => {
  const surfaces = ['index.html', 'brands.html', 'how-old-is-my-electronics.html'];
  for (const file of surfaces) {
    const html = read(file);
    assert.doesNotMatch(html, /href="\/(?:google-pixel|panasonic)"/, `${file} should not promote noindex electronics pages`);
  }
  const hub = read('how-old-is-my-electronics.html');
  for (const route of ['/apple', '/hp', '/sony', '/vizio', '/samsung-tv-serial-number-decoder', '/asus-serial-number-decoder']) {
    assert.match(hub, new RegExp(`href="${route}"`), `electronics hub should link to ${route}`);
  }
  assert.doesNotMatch(hub, /<div class="brand-card-name">(?:Carrier|Kenmore|Whirlpool)<\/div>/);
});

test('target pages contain no old generic electronics-template conclusions or unresolved filler examples', () => {
  const combined = targetFiles.map(read).join('\n');
  assert.doesNotMatch(combined, /Find appliance age, decode serial numbers, or start from the model number/i);
  assert.doesNotMatch(combined, /Use the current Decode My Item decoder and Smart Lookup tools right on this page/i);
  assert.doesNotMatch(combined, /Illustrative .* pattern/i);
  assert.doesNotMatch(combined, /Most appliances place the label on the door frame/i);
});

test('electronics similarity audit prevents a return to near-identical editorial pages', () => {
  const result = spawnSync(process.execPath, ['scripts/audit/electronics-page-similarity.mjs', '--enforce'], {
    cwd: new URL('../../', import.meta.url),
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /mean pair similarity:/);
});

test('AdSense ownership configuration remains unchanged and target pages contain no visible ad units', () => {
  assert.equal(read('ads.txt').trim(), 'google.com, pub-5946778263750869, DIRECT, f08c47fec0942fa0');
  for (const file of targetFiles) {
    const html = read(file);
    assert.equal((html.match(/ca-pub-5946778263750869/g) || []).length, 1, `${file} should preserve one verification loader`);
    assert.doesNotMatch(html, /<ins\b[^>]*adsbygoogle|data-ad-slot|class="[^"]*ad-container/i, `${file} must not contain visible ad units`);
  }
});
