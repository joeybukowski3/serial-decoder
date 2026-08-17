import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../../', import.meta.url);

const pages = [
  'how-old-is-my-appliance.html',
  'how-old-is-my-hvac.html',
  'how-old-is-my-plumbing.html',
  'how-old-is-my-electronics.html',
  'serial-number-location-guide.html',
];

const specializedTools = [
  ['https://www.decodemyitem.com/large-loss-decoder', 'Large Loss Decoder'],
  ['https://www.decodemyitem.com/assistant', 'AI Assistant'],
  ['https://www.decodemyitem.com/rcv-acv-calculator', 'RCV / ACV Calculator'],
  ['https://www.decodemyitem.com/sales-tax-decalculator', 'Sales Tax De-Calculator'],
];

for (const file of pages) {
  const html = fs.readFileSync(new URL(file, root), 'utf8');

  const headerMatch = html.match(/<header>([\s\S]*?)<\/header>/);
  assert.ok(headerMatch, `${file} should have a <header> element`);
  const header = headerMatch[1];

  const desktopMatch = header.match(/<nav class="nav-links">([\s\S]*?)<\/nav>/);
  const mobileMatch = header.match(/<nav class="mobile-menu"[^>]*>([\s\S]*?)<\/nav>/);
  assert.ok(desktopMatch, `${file} should have a desktop nav-links block`);
  assert.ok(mobileMatch, `${file} should have a mobile-menu block`);
  const desktopNav = desktopMatch[1];
  const mobileNav = mobileMatch[1];

  const assertTopLevelOrder = (nav, label) => {
    const home = nav.indexOf('>Home<');
    const decoder = nav.indexOf('>Serial Number Decoder<');
    const smartLookup = nav.indexOf('>Smart Lookup<');
    const resourcesToggle = nav.indexOf('class="nav-resources-toggle"');
    const resourcesPanelEnd = nav.indexOf('nav-resources-panel', nav.indexOf('nav-resources-panel') + 1);
    const contact = nav.indexOf('>Contact<');
    const security = nav.indexOf('>Security &amp; Data<');

    for (const [name, idx] of [
      ['Home', home], ['Serial Number Decoder', decoder], ['Smart Lookup', smartLookup],
      ['Resources toggle', resourcesToggle], ['Contact', contact], ['Security & Data', security],
    ]) {
      assert.notEqual(idx, -1, `${file}: ${label} nav missing ${name}`);
    }

    assert.ok(home < decoder && decoder < smartLookup && smartLookup < resourcesToggle, `${file}: ${label} nav order (Home/Decoder/Smart Lookup/Resources) is wrong`);
    // Contact and Security must come after the Resources panel closes, not be swallowed inside it.
    assert.ok(contact > resourcesPanelEnd, `${file}: ${label} nav Contact must appear after the Resources panel`);
    assert.ok(security > contact, `${file}: ${label} nav Security & Data must appear after Contact`);
  };

  test(`${file}: top-level desktop nav is exactly Home, Serial Number Decoder, Smart Lookup, Resources, Contact, Security & Data`, () => {
    assertTopLevelOrder(desktopNav, 'desktop');
  });

  test(`${file}: top-level mobile nav is exactly Home, Serial Number Decoder, Smart Lookup, Resources, Contact, Security & Data`, () => {
    assertTopLevelOrder(mobileNav, 'mobile');
  });

  test(`${file}: AI Assistant is not a top-level nav peer in desktop or mobile nav`, () => {
    const desktopTopLevel = desktopNav.split('<div class="nav-resources"')[0];
    const mobileTopLevel = mobileNav.split('<div class="nav-resources"')[0];
    assert.doesNotMatch(desktopTopLevel, /AI Assistant/, `${file}: desktop top-level must not contain AI Assistant`);
    assert.doesNotMatch(mobileTopLevel, /AI Assistant/, `${file}: mobile top-level must not contain AI Assistant`);
  });

  test(`${file}: Large Loss Decoder is not a top-level nav peer in desktop or mobile nav`, () => {
    const desktopTopLevel = desktopNav.split('<div class="nav-resources"')[0];
    const mobileTopLevel = mobileNav.split('<div class="nav-resources"')[0];
    assert.doesNotMatch(desktopTopLevel, /Large Loss Decoder/, `${file}: desktop top-level must not contain Large Loss Decoder`);
    assert.doesNotMatch(mobileTopLevel, /Large Loss Decoder/, `${file}: mobile top-level must not contain Large Loss Decoder`);
  });

  test(`${file}: all four specialized/support tools are reachable exactly once from the desktop Resources panel`, () => {
    const panelMatch = desktopNav.match(/<div class="nav-resources-panel"[^>]*>([\s\S]*?)<\/div>/);
    assert.ok(panelMatch, `${file}: desktop nav should have a Resources panel`);
    const panel = panelMatch[1];
    for (const [href, label] of specializedTools) {
      const re = new RegExp(`href="${href.replace(/[/.]/g, '\\$&')}" role="menuitem">${label.replace(/[/]/g, '\\/')}</a>`);
      assert.equal((panel.match(new RegExp(re, 'g')) || []).length, 1, `${file}: desktop Resources panel should contain ${label} exactly once`);
    }
  });

  test(`${file}: all four specialized/support tools are reachable exactly once from the mobile Resources panel`, () => {
    const panelMatch = mobileNav.match(/<div class="nav-resources-panel"[^>]*>([\s\S]*?)<\/div>/);
    assert.ok(panelMatch, `${file}: mobile nav should have a Resources panel`);
    const panel = panelMatch[1];
    for (const [href, label] of specializedTools) {
      const re = new RegExp(`href="${href.replace(/[/.]/g, '\\$&')}" role="menuitem">${label.replace(/[/]/g, '\\/')}</a>`);
      assert.equal((panel.match(new RegExp(re, 'g')) || []).length, 1, `${file}: mobile Resources panel should contain ${label} exactly once`);
    }
  });

  test(`${file}: desktop Resources control has working toggle markup (button + aria + panel)`, () => {
    assert.match(desktopNav, /<button type="button" class="nav-resources-toggle" aria-haspopup="true" aria-expanded="false" aria-controls="nav-resources-panel-desktop">/);
    assert.match(desktopNav, /<div class="nav-resources-panel" id="nav-resources-panel-desktop" role="menu">/);
  });

  test(`${file}: mobile Resources control has working toggle markup (button + aria + panel)`, () => {
    assert.match(mobileNav, /<button type="button" class="nav-resources-toggle" aria-haspopup="true" aria-expanded="false" aria-controls="nav-resources-panel-mobile">/);
    assert.match(mobileNav, /<div class="nav-resources-panel" id="nav-resources-panel-mobile" role="menu">/);
  });

  test(`${file}: no duplicate tool links within the desktop nav or within the mobile nav`, () => {
    for (const nav of [desktopNav, mobileNav]) {
      for (const [href] of specializedTools) {
        const count = (nav.match(new RegExp(`href="${href.replace(/[/.]/g, '\\$&')}"`, 'g')) || []).length;
        assert.equal(count, 1, `${file}: ${href} should appear exactly once in this nav block`);
      }
    }
  });

  test(`${file}: mobile Resources panel does not use absolute positioning (avoids horizontal overflow in the mobile drawer)`, () => {
    const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
    assert.ok(styleMatch, `${file} should have an embedded <style> block`);
    assert.match(styleMatch[1], /\.mobile-menu \.nav-resources-panel \{[^}]*position: static;/);
  });

  test(`${file}: Material Symbols cold-load overflow fix is present`, () => {
    const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
    assert.ok(styleMatch, `${file} should have an embedded <style> block`);
    assert.match(
      styleMatch[1],
      /\.material-symbols-outlined \{[^}]*overflow: hidden;[^}]*white-space: nowrap;[^}]*flex-shrink: 0;/,
      `${file}: .material-symbols-outlined should retain the cold-load overflow containment rule`
    );
  });

  test(`${file}: mobile Resources toggle JS wiring is present`, () => {
    assert.match(html, /document\.querySelectorAll\('\.nav-resources-toggle'\)\.forEach/);
    assert.match(html, /document\.addEventListener\('keydown', \(e\) => \{\s*if \(e\.key === 'Escape'\)/);
  });
}
