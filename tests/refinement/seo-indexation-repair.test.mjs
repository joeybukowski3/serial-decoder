import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const sitemap = read('sitemap.xml');
const sitemapPaths = [...sitemap.matchAll(/<loc>https:\/\/www\.decodemyitem\.com([^<]*)<\/loc>/g)]
  .map((match) => match[1] || '/');

const redirectSources = [
  '/washer-serial-number-lookup',
  '/dishwasher-serial-number-lookup',
  '/dryer-serial-number-lookup',
  '/oven-serial-number-lookup',
  '/refrigerator-serial-number-lookup'
];

const canonicalDestinations = [
  '/washer-serial-number',
  '/dishwasher-serial-number',
  '/dryer-serial-number',
  '/range-oven-serial-number',
  '/refrigerator-serial-number'
];

function hasStaticInboundLink(target) {
  return fs.readdirSync(root)
    .filter((file) => file.endsWith('.html') && file !== `${target.slice(1)}.html`)
    .some((file) => new RegExp(`href=["']${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:["'#?])`, 'i').test(read(file)));
}

test('sitemap excludes redirect sources and retains canonical appliance routes', () => {
  for (const source of redirectSources) assert.ok(!sitemapPaths.includes(source), `${source} must not be in sitemap.xml`);
  for (const destination of canonicalDestinations) assert.ok(sitemapPaths.includes(destination), `${destination} must remain in sitemap.xml`);
});

test('legacy appliance-age redirect has one unambiguous noindex robots policy', () => {
  const robots = [...read('appliance-age-by-serial-number.html').matchAll(/<meta\s+name=["']robots["']\s+content=["']([^"']+)["']/gi)]
    .map((match) => match[1]);
  assert.deepEqual(robots, ['noindex, nofollow']);
});

test('retained noindex workflows keep contextual static discovery while consolidated routes do not', () => {
  const contextualNoindexPages = [
    '/appliance-age-estimator',
    '/replacement-lookup',
    '/tv-replacement-guide',
    '/hvac-replacement-guide'
  ];
  for (const page of contextualNoindexPages) {
    assert.ok(hasStaticInboundLink(page), `${page} needs a contextual static inbound link`);
    assert.ok(!sitemapPaths.includes(page), `${page} must not be in sitemap.xml`);
  }

  assert.match(read('how-old-is-my-appliance.html'), /href="\/appliance-age-estimator"/);
  assert.match(read('appliance-age-for-insurance-and-replacement.html'), /href="\/replacement-lookup"/);
  assert.match(read('how-old-is-my-electronics.html'), /href="\/tv-replacement-guide"/);
  assert.match(read('how-old-is-my-hvac.html'), /href="\/hvac-replacement-guide"/);
});

test('sitemap omits unreviewed lastmod values instead of blanket stamping them', () => {
  assert.doesNotMatch(sitemap, /<lastmod>/);
  assert.match(read('scripts/generate-seo-pages.js'), /Only publish lastmod when a route has an explicitly maintained, material/);
});

test('normal build is deterministic', () => {
  const buildCommand = process.platform === 'win32'
    ? ['cmd.exe', ['/d', '/s', '/c', 'npm run build']]
    : ['npm', ['run', 'build']];
  const diffNames = () => execFileSync('git', ['diff', '--name-only'], { cwd: root, encoding: 'utf8' });
  execFileSync(buildCommand[0], buildCommand[1], { cwd: root, stdio: 'pipe' });
  const firstBuildDiff = diffNames();
  execFileSync(buildCommand[0], buildCommand[1], { cwd: root, stdio: 'pipe' });
  assert.equal(diffNames(), firstBuildDiff);
});
