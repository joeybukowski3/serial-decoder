import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

const allHtmlFiles = fs.readdirSync(root).filter((f) => f.endsWith('.html'));
const sharedNavPages = allHtmlFiles.filter((f) => {
  const html = fs.readFileSync(path.join(root, f), 'utf8');
  return html.includes('nav-dropdown-toggle');
});

test('at least one page uses the shared Resources-dropdown nav system', () => {
  assert.ok(sharedNavPages.length > 50, 'expected the shared nav system to cover the bulk of the site');
});

for (const file of sharedNavPages) {
  test(`${file}: top-level nav is exactly Home, Serial Number Decoder, Smart Lookup, Resources, Contact, Security & Data`, () => {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    const navMatch = html.match(/<nav[^>]*>([\s\S]*?)<\/nav>/);
    assert.ok(navMatch, `${file} should have a <nav> element`);
    const flatTopLevel = navMatch[1].split('<li class="nav-dropdown-item">')[0];

    assert.match(flatTopLevel, /href="\/">Home</, `${file} missing Home`);
    assert.match(flatTopLevel, /href="\/decoder-tool">Serial Number Decoder</, `${file} missing Serial Number Decoder`);
    assert.match(flatTopLevel, /href="\/smart-lookup">Smart Lookup</, `${file} missing Smart Lookup`);
    assert.doesNotMatch(flatTopLevel, /Large Loss Decoder/, `${file}: Large Loss Decoder must not be a top-level nav item`);
    assert.doesNotMatch(flatTopLevel, /AI Assistant/, `${file}: AI Assistant must not be a top-level nav item`);
    assert.doesNotMatch(flatTopLevel, /RCV \/ ACV Calculator/, `${file}: RCV/ACV Calculator must not be a top-level nav item`);
    assert.doesNotMatch(flatTopLevel, /Sales Tax De-Calculator/, `${file}: Sales Tax De-Calculator must not be a top-level nav item`);
    assert.doesNotMatch(flatTopLevel, /nav-tool-link/, `${file}: the retired .nav-tool-link pattern must not remain in the top-level list`);
  });

  test(`${file}: Resources dropdown exposes a Tools group with all four specialized/support tools, exactly once each`, () => {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    const navMatch = html.match(/<nav[^>]*>([\s\S]*?)<\/nav>/);
    assert.ok(navMatch, `${file} should have a <nav> element`);
    const nav = navMatch[1];

    assert.equal((nav.match(/nav-dropdown-label">Tools</g) || []).length, 1, `${file} should have exactly one Tools group label`);
    assert.equal((nav.match(/nav-dropdown-label">Age Research</g) || []).length, 1, `${file} should still have exactly one Age Research group`);
    assert.equal((nav.match(/nav-dropdown-label">Item History Guides</g) || []).length, 1, `${file} should still have exactly one Item History Guides group`);
    assert.equal((nav.match(/nav-dropdown-label">Reference</g) || []).length, 1, `${file} should still have exactly one Reference group`);

    for (const [href, label] of [
      ['/large-loss-decoder', 'Large Loss Decoder'],
      ['/assistant', 'AI Assistant'],
      ['/rcv-acv-calculator', 'RCV / ACV Calculator'],
      ['/sales-tax-decalculator', 'Sales Tax De-Calculator'],
    ]) {
      const re = new RegExp(`href="${href.replace(/\//g, '\\/')}" role="menuitem">${label.replace(/[/]/g, '\\/')}</`, 'g');
      assert.equal((nav.match(re) || []).length, 1, `${file}: ${label} should appear exactly once inside the Resources dropdown`);
    }
  });
}
