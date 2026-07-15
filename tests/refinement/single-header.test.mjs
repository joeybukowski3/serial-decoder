import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function rootHtmlFiles() {
  return fs.readdirSync(new URL('../../', import.meta.url))
    .filter((file) => file.endsWith('.html'));
}

function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

// Pages built from the static "how old is my X" template render the shared
// header inline (nav-inner + nav-logo markers) rather than injecting it via
// script.js at runtime. Only those pages are expected to carry this markup.
function usesStaticHeaderShell(html) {
  return html.includes('class="nav-inner"') && html.includes('class="nav-logo"');
}

const staticShellPages = rootHtmlFiles().filter((file) => {
  const html = fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
  return usesStaticHeaderShell(html);
});

test('at least one page uses the static header shell (sanity check for this test itself)', () => {
  assert.ok(staticShellPages.length > 0, 'expected to find pages using the static header shell markup');
});

for (const file of staticShellPages) {
  test(`${file} renders exactly one site header`, () => {
    const html = fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.equal(countOccurrences(html, '<header>'), 1, `${file} should render exactly one <header> element`);
    assert.equal(countOccurrences(html, '</header>'), 1, `${file} should render exactly one closing </header>`);
  });

  test(`${file} has exactly one primary navigation region`, () => {
    const html = fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.equal(countOccurrences(html, 'class="nav-links"'), 1, `${file} should have exactly one .nav-links nav`);
    assert.equal(countOccurrences(html, 'class="mobile-menu"'), 1, `${file} should have exactly one .mobile-menu nav`);
  });

  test(`${file} does not duplicate mobile menu controls`, () => {
    const html = fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.equal(countOccurrences(html, 'id="mobile-toggle"'), 1, `${file} should have exactly one #mobile-toggle button`);
    assert.equal(countOccurrences(html, 'id="mobile-menu"'), 1, `${file} should have exactly one #mobile-menu nav`);
  });

  test(`${file} header link set is not duplicated`, () => {
    const html = fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    const desktopNavMatch = html.match(/<nav class="nav-links">[\s\S]*?<\/nav>/);
    const mobileNavMatch = html.match(/<nav class="mobile-menu"[^>]*>[\s\S]*?<\/nav>/);
    assert.ok(desktopNavMatch, `${file} should contain a .nav-links nav`);
    assert.ok(mobileNavMatch, `${file} should contain a .mobile-menu nav`);
    const expectedLinks = [
      'https://www.decodemyitem.com/',
      'https://www.decodemyitem.com/decoder-tool',
      'https://www.decodemyitem.com/smart-lookup',
      'https://www.decodemyitem.com/assistant',
      'https://www.decodemyitem.com/methodology',
      'https://www.decodemyitem.com/contact',
      'https://www.decodemyitem.com/feedback',
      'https://www.decodemyitem.com/security'
    ];
    for (const href of expectedLinks) {
      // Each link should appear exactly once in the desktop nav and once in the mobile menu.
      assert.equal(countOccurrences(desktopNavMatch[0], `href="${href}"`), 1, `${file} desktop nav should link to ${href} exactly once`);
      assert.equal(countOccurrences(mobileNavMatch[0], `href="${href}"`), 1, `${file} mobile menu should link to ${href} exactly once`);
    }
  });

  test(`${file} marks exactly one active nav link`, () => {
    const html = fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    const headerMatch = html.match(/<header>[\s\S]*?<\/header>/);
    assert.ok(headerMatch, `${file} should contain a <header> block`);
    const headerHtml = headerMatch[0];
    // One active link in the desktop nav, one in the mobile menu (same page/state).
    assert.equal(countOccurrences(headerHtml, 'class="active"'), 2, `${file} should mark the active nav link exactly once per nav (desktop + mobile)`);
  });
}
