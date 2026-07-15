import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), 'utf8');
const publicHtml = fs.readdirSync(root).filter((file) => file.endsWith('.html'));

test('obsolete diagnostic and abandoned pages are absent from production output', () => {
  for (const file of ['diagnostic.html', 'serial-guide-refactor.html', 'universal-decoder.html']) {
    assert.equal(fs.existsSync(new URL(file, root)), false, `${file} must not be deployed`);
  }
  const joined = [read('vercel.json'), read('sitemap.xml'), read('robots.txt'), read('scripts/generate-seo-pages.js')].join('\n');
  for (const route of ['/diagnostic', '/serial-guide-refactor', '/universal-decoder']) {
    assert.doesNotMatch(joined, new RegExp(route.replace('/', '\\/')));
  }
});

test('history hub contains only available guides', () => {
  const history = read('item-history-guides.html');
  assert.doesNotMatch(history, /Coming Soon|status-coming|not-allowed/i);
});

test('public disclosures acknowledge analytics and advertising readiness without active ad units', () => {
  const privacy = read('privacy-policy.html');
  const security = read('security.html');
  assert.match(privacy, /Google Analytics/i);
  assert.match(privacy, /does not currently display approved advertising units/i);
  assert.match(security, /Google Analytics/i);
  assert.match(security, /does not currently display approved ad units/i);
  assert.doesNotMatch(`${privacy}\n${security}`, /No advertising or tracking cookies are used/i);
  assert.doesNotMatch(publicHtml.map(read).join('\n'), /<ins\b[^>]*adsbygoogle|data-ad-slot/i);
});

test('AdSense verification configuration remains unchanged and singular per source page', () => {
  const publisher = 'ca-pub-5946778263750869';
  assert.equal(read('ads.txt').trim(), 'google.com, pub-5946778263750869, DIRECT, f08c47fec0942fa0');
  assert.match(read('vercel.json'), /pagead2\.googlesyndication\.com/);
  assert.ok(publicHtml.filter((file) => (read(file).match(new RegExp(publisher, 'g')) || []).length > 1).length === 0);
});
