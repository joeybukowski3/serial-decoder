import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function readPage(file) {
  return fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
}

const ge = () => readPage('ge-serial-number-lookup.html');
const legacyGe = () => readPage('ge.html');

test('GE remains preselected in the brand selection script', () => {
  const html = ge();
  assert.match(html, /brandSelect\.value = 'ge';/, 'expected the existing GE preselection logic to remain unchanged');
});

test('GE decoder flow markup is intact (brand select, serial input, decode button, scripts)', () => {
  const html = ge();
  assert.match(html, /<select id="brand" class="search-select">/, 'expected the brand select element');
  assert.match(html, /<input type="text" id="serial" class="search-input"/, 'expected the serial input element');
  assert.match(html, /onclick="decodeSerial\(\)"/, 'expected the decode button wiring');
  assert.match(html, /<script defer src="decoder-data\.js"><\/script>/, 'expected decoder-data.js to still be loaded');
  assert.match(html, /<script defer src="lkq-engine\.js"><\/script>/, 'expected lkq-engine.js to still be loaded');
  assert.match(html, /<script defer src="\/serial-refinement-controller\.js"><\/script>/, 'expected serial-refinement-controller.js to still be loaded');
});

test('canonical points to the intended GE lookup URL', () => {
  const html = ge();
  const matches = [...html.matchAll(/<link rel="canonical" href="([^"]+)">/g)];
  assert.equal(matches.length, 1, 'expected exactly one canonical link');
  assert.equal(matches[0][1], 'https://www.decodemyitem.com/ge-serial-number-lookup');
});

test('legacy ge.html canonical relationship and indexability are unchanged', () => {
  const html = legacyGe();
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.decodemyitem\.com\/ge-serial-number-lookup">/, 'expected ge.html to keep canonicalizing to the lookup page');
  assert.match(html, /<meta name="robots" content="index, follow, max-image-preview:large">/, 'expected ge.html robots meta to remain index,follow (no noindex added in this phase)');
});

test('major editorial sections are present as crawlable static HTML', () => {
  const html = ge();
  const requiredHeadings = [
    'What this decoder currently supports for GE',
    'Decoding GE appliances by product type',
    'Important GE decoding eras',
    'GE company history and ownership',
    'Unsupported formats and limitations',
    'Evidence and sources',
    'Worked example 1: straightforward decode confirmed by model evidence',
    'Worked example 2: repeating-cycle ambiguous decode (serial AA182127G, model GTWN8250D0WS)',
    'Worked example 3: historical code not yet supported by this decoder'
  ];
  for (const heading of requiredHeadings) {
    assert.match(html, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `expected heading: ${heading}`);
  }
});

test('heading hierarchy has exactly one H1 and no heading levels beyond H4', () => {
  const html = ge();
  assert.equal((html.match(/<h1[^>]*>/g) || []).length, 1, 'expected exactly one H1');
  assert.equal((html.match(/<h5[^>]*>|<h6[^>]*>/g) || []).length, 0, 'did not expect H5/H6 headings');
});

test('wordmark is real accessible text, not an image', () => {
  const html = ge();
  assert.match(html, /class="bp-hero-wordmark"[^>]*>GE<\/div>/, 'expected a visible text wordmark reading GE');
});

test('three worked examples and the limitations section reference verified serials/models', () => {
  const html = ge();
  assert.match(html, /RZ825479/);
  assert.match(html, /GTH18GBCDCRBB/);
  assert.match(html, /AA182127G/);
  assert.match(html, /AB123456/);
  assert.match(html, /A, D, F, G, H, L, M, R, S, T, V, Z/, 'expected the verified 12-letter year-code set');
});

test('evidence section separates technical sources from historical sources', () => {
  const html = ge();
  assert.match(html, /Technical sources for the serial-decoding rule/);
  assert.match(html, /Historical and ownership sources/);
  assert.match(html, /products\.geappliances\.com/);
  assert.match(html, /edison\.rutgers\.edu/);
});

test('GE\'s official manufacture-date page is the primary (and only) technical source', () => {
  const html = ge();
  assert.match(html, /https:\/\/products\.geappliances\.com\/appliance\/gea-support-search-content\?contentId=16195/, 'expected the official GE manufacture-date chart URL');
  assert.doesNotMatch(html, /cannonsappliance\.com/, 'unverified third-party technical source should be removed');
  assert.doesNotMatch(html, /lumayeconsulting\.com/, 'unverified third-party technical source should be removed');
  assert.doesNotMatch(html, /en\.tab-tv\.com/, 'unverified third-party technical source should be removed');
});

test('historical sources prefer primary/institutional sources and demote Wikipedia to supplemental background', () => {
  const html = ge();
  assert.match(html, /Primary\/institutional sources/);
  assert.match(html, /Supplemental background \(not principal evidence\)/);
  assert.match(html, /pressroom\.geappliances\.com\/news\/qingdao-haier-acquires-ge-appliances/);
  assert.match(html, /pressroom\.geappliances\.com\/news\/ge-appliances-celebrates-70-years-of-innovation/, 'expected a GE Appliances corporate source for Appliance Park history instead of Wikipedia');
  assert.match(html, /pressroom\.geappliances\.com\/news\/ge-appliances-corporate-fact-sheet/, 'expected the corporate fact sheet substantiating the current brand portfolio');
  assert.match(html, /hotpoint\.com\/hotpoint-history/, 'expected Hotpoint\'s own official history as the primary source for the 1918 merger');
  // Wikipedia may remain only as clearly-labeled supplemental background, never the principal source for a fact.
  const wikipediaLinks = [...html.matchAll(/<a href="(https:\/\/en\.wikipedia\.org\/[^"]+)"/g)];
  assert.ok(wikipediaLinks.length > 0, 'expected at least one supplemental Wikipedia reference to remain');
  const supplementalSectionIndex = html.indexOf('Supplemental background (not principal evidence)');
  for (const [, url] of wikipediaLinks) {
    assert.ok(html.indexOf(url) > supplementalSectionIndex, `Wikipedia link ${url} must appear only in the supplemental background section`);
  }
});

test('does not claim GE Appliance Park manufacturing was itself "GE-owned brands" language or imply RCA is a current GE Appliances brand', () => {
  const html = ge();
  assert.doesNotMatch(html, /related GE-owned brands/i, 'should describe brands as being within the GE Appliances portfolio, not "GE-owned brands"');
  assert.match(html, /brands within the GE Appliances portfolio/);
  assert.match(html, /RCA is not a brand in GE Appliances' current portfolio|RCA-branded appliances have historically shared/, 'RCA should be framed as historical, not a current portfolio brand');
});

test('does not overclaim that all candidate years are "equally valid"', () => {
  const html = ge();
  assert.doesNotMatch(html, /every candidate year the letter maps to is equally valid/i);
  assert.match(html, /the serial characters alone do not determine which of the candidate years is correct/);
});

test('pre-1977 coverage is framed as a DecodeMyItem limitation, not a GE manufacturer format boundary', () => {
  const html = ge();
  assert.doesNotMatch(html, /not currently covered by this decoder\. The documented month\/year letter pattern on this page applies to serials from 1977 forward; older GE serials are out of scope until a verified pre-1977 format is documented/, 'old boundary-framed language should be gone');
  assert.match(html, /documents historical year codes back to 1944/);
  assert.match(html, /coverage limitation of this decoder, not a boundary in GE's own documentation/);
});

test('Worked Example 3 does not claim "B" is undocumented by GE and instead explains the historical 1945 code', () => {
  const html = ge();
  assert.doesNotMatch(html, /"B" is not one of the twelve year-code letters/, 'must not claim B is not a GE year code');
  assert.match(html, /records "B" as the historical year 1945/);
});

test('GE water heater OEM claim is softened to an unverified-format statement rather than an asserted Rheem manufacturing claim', () => {
  const html = ge();
  assert.doesNotMatch(html, /manufactured by Rheem/i, 'unverified/era-limited OEM manufacturing claim should be removed');
  assert.doesNotMatch(html, /follow Rheem's date-code logic/i);
  assert.match(html, /GE-branded water heaters may use a different serial format that is not covered by this appliance decoder/);
});

test('a visible last-reviewed date is present', () => {
  const html = ge();
  assert.match(html, /Last reviewed: July 24, 2026\./);
});

test('FAQ schema stays in sync after the two new history/ownership questions', () => {
  const html = ge();
  const faqMatch = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/);
  assert.ok(faqMatch, 'expected a FAQPage JSON-LD block');
  const schema = JSON.parse(faqMatch[1]);
  const schemaQuestions = schema.mainEntity.map((q) => q.name);
  const visibleQuestions = [...html.matchAll(/<details class="bp-faq-item">\s*<summary class="bp-faq-summary">\s*<span>(.*?)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(visibleQuestions, schemaQuestions);
  assert.ok(schemaQuestions.includes('Who owns GE Appliances now?'));
  assert.ok(schemaQuestions.includes('When was General Electric founded?'));
});
