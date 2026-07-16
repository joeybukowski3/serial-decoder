import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const responsiveCss = fs.readFileSync(new URL('../../responsive-navigation.css', import.meta.url), 'utf8');
const generator = fs.readFileSync(new URL('../../scripts/generate-seo-pages.js', import.meta.url), 'utf8');
const injector = fs.readFileSync(new URL('../../scripts/inject-responsive-navigation-assets.js', import.meta.url), 'utf8');
const root = new URL('../../', import.meta.url);

test('shared navigation switches to the drawer before its 1290px minimum width', () => {
  assert.match(responsiveCss, /max-width:\s*1290px/);
  assert.match(responsiveCss, /nav > ul \{\s*display: none/);
  assert.match(responsiveCss, /\.hamburger \{\s*display: flex/);
});

test('generated and retained shared shells receive the responsive navigation assets', () => {
  assert.match(generator, /href="responsive-navigation\.css"/);
  assert.match(generator, /src="responsive-navigation\.js"/);
  assert.match(injector, /responsive-navigation\.css/);
  assert.match(injector, /responsive-navigation\.js/);
});

test('responsive navigation assets are present exactly once on every intended static shell', () => {
  for (const file of fs.readdirSync(root).filter((name) => name.endsWith('.html'))) {
    const html = fs.readFileSync(new URL(file, root), 'utf8');
    const usesSharedShell = /href=["'](?:\/)?shared\.css["']/.test(html) && /id=["']hamburgerBtn["']/.test(html);
    const cssCount = (html.match(/href=["']responsive-navigation\.css["']/g) || []).length;
    const scriptCount = (html.match(/src=["']responsive-navigation\.js["']/g) || []).length;
    assert.equal(cssCount, usesSharedShell ? 1 : 0, `${file} responsive CSS count`);
    assert.equal(scriptCount, usesSharedShell ? 1 : 0, `${file} responsive script count`);
  }
});
