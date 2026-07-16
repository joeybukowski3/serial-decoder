import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), 'utf8');
const exists = (file) => fs.existsSync(new URL(file, root));
const sitemap = read('sitemap.xml');
const vercel = JSON.parse(read('vercel.json'));
const publicHtml = fs.readdirSync(root).filter((file) => file.endsWith('.html'));

const noindexRoutes = new Map([
  ['/appliance-age-estimator', 'appliance-age-estimator.html'],
  ['/replacement-lookup', 'replacement-lookup.html'],
  ['/hvac-replacement-guide', 'hvac-replacement-guide.html'],
  ['/tv-replacement-guide', 'tv-replacement-guide.html']
]);

const consolidatedRoutes = new Map([
  ['/goodman-model-number-lookup', '/goodman-serial-number-lookup'],
  ['/whirlpool-model-number-lookup', '/whirlpool-serial-number-lookup'],
  ['/whirlpool-refrigerator-serial-number-lookup', '/whirlpool-serial-number-lookup'],
  ['/whirlpool-dishwasher-serial-number-lookup', '/whirlpool-serial-number-lookup']
]);

const consolidatedFiles = [
  'goodman-model-number-lookup.html',
  'whirlpool-model-number-lookup.html',
  'whirlpool-refrigerator-serial-number-lookup.html',
  'whirlpool-dishwasher-serial-number-lookup.html'
];

function count(html, pattern) {
  return (html.match(pattern) || []).length;
}

test('all eight weak-route dispositions are explicit and approval-facing inventory is reduced', () => {
  const decisions = read('docs/ADSENSE_FINAL_ROUTE_DISPOSITIONS_2026-07.md');
  for (const route of [...noindexRoutes.keys(), ...consolidatedRoutes.keys()]) {
    assert.ok(decisions.includes(`| \`${route}\` |`), `${route} needs a recorded disposition`);
    assert.ok(!sitemap.includes(`<loc>https://www.decodemyitem.com${route}</loc>`), `${route} must be absent from sitemap`);
  }
  assert.equal([...sitemap.matchAll(/<loc>/g)].length, 54);
});

test('public workflow utilities have one noindex policy, self-canonical, and minimal schema', () => {
  for (const [route, file] of noindexRoutes) {
    const html = read(file);
    assert.equal(count(html, /<meta name="robots"/g), 1, `${file} should contain one robots policy`);
    assert.match(html, /<meta name="robots" content="noindex, follow">/);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://www\\.decodemyitem\\.com${route}">`));
    assert.equal(count(html, /"@type":"WebPage"/g), 1, `${file} should contain one WebPage schema object`);
    assert.equal(count(html, /"@type":"BreadcrumbList"/g), 1, `${file} should contain one BreadcrumbList schema object`);
    assert.doesNotMatch(html, /"@type":"FAQPage"|"@type":"WebApplication"/);
  }
});

test('consolidated routes redirect once to strong canonical destinations and source pages are removed', () => {
  for (const [source, destination] of consolidatedRoutes) {
    const redirect = vercel.redirects.filter((entry) => entry.source === source);
    assert.deepEqual(redirect, [{ source, destination, permanent: true }]);
    assert.equal(vercel.redirects.some((entry) => entry.source === destination), false, `${destination} must not create a redirect chain`);
    assert.equal(vercel.rewrites.some((entry) => entry.source === source), false, `${source} must not retain a rewrite`);
  }
  for (const file of consolidatedFiles) assert.equal(exists(file), false, `${file} must not remain in production output`);
});

test('current HTML does not link through consolidated redirect sources', () => {
  const combined = publicHtml.map(read).join('\n');
  for (const source of consolidatedRoutes.keys()) {
    assert.doesNotMatch(combined, new RegExp(`href=["']${source.replaceAll('/', '\\/')}(?:["'?#])`, 'i'));
  }
});

test('noindex workflow links are contextual rather than primary discovery links', () => {
  const primarySurfaces = ['index.html', 'brands.html', 'item-history-guides.html'];
  for (const file of primarySurfaces) {
    const html = read(file);
    for (const route of noindexRoutes.keys()) {
      assert.doesNotMatch(html, new RegExp(`href=["']${route.replaceAll('/', '\\/')}(?:["'?#])`, 'i'), `${file} should not promote ${route}`);
    }
  }
  assert.match(read('how-old-is-my-appliance.html'), /href="\/appliance-age-estimator"/);
  assert.match(read('appliance-age-for-insurance-and-replacement.html'), /href="\/replacement-lookup"/);
  assert.match(read('how-old-is-my-hvac.html'), /href="\/hvac-replacement-guide"/);
  assert.match(read('how-old-is-my-electronics.html'), /href="\/tv-replacement-guide"/);
});

test('homepage states the supported-format contract and exposes compact trust links', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /Decode Any Serial Number|Get the Manufacture Date Instantly|exact manufacture date|universal serial decoder/i);
  assert.match(html, /supported formats/i);
  assert.match(html, /repeating codes/i);
  assert.match(html, /randomized identifiers/i);
  assert.match(html, /deterministic serial decoding is unavailable/i);
  assert.equal(count(html, /class="editorial-trust"/g), 1);
  for (const route of ['/methodology', '/about', '/find-model-serial-number', '/feedback']) {
    assert.match(html, new RegExp(`href="${route}"`));
  }
  assert.doesNotMatch(html, /manufacturer endorsement|licensed (?:team|adjusters?)|guaranteed results/i);
});

test('the eleven audited metadata heads are normalized or eliminated by consolidation', () => {
  const normalized = [
    ...noindexRoutes.values(),
    'contact.html',
    'feedback.html',
    'security.html'
  ];
  for (const file of normalized) {
    const html = read(file);
    const head = html.match(/<head[\s\S]*?<\/head>/i)?.[0] || '';
    assert.match(head, /<title>[^<]*Decode My Item<\/title>/, `${file} title must use Decode My Item`);
    assert.match(head, /<meta property="og:site_name" content="Decode My Item">/);
    assert.match(head, /<meta name="twitter:title" content="[^"]*Decode My Item">/);
    assert.doesNotMatch(head, /(?:content|name)="[^"]*Item Assist|>[^<]*Item Assist/i, `${file} head must not use Item Assist as product branding`);
    assert.equal(count(html, /<h1\b/g), 1, `${file} should retain one H1`);
  }
  for (const file of consolidatedFiles) assert.equal(exists(file), false, `${file} head should be eliminated with its route`);
});

test('About makes no unverified licensing or all-contributor credential claim', () => {
  const html = read('about.html');
  assert.doesNotMatch(html, /team of licensed|licensed insurance adjusters|our team uses this tool daily/i);
  assert.match(html, /claims, appraisal, equipment-research, and repair\s+workflows/i);
  assert.doesNotMatch(html, /license number|certified by|manufacturer partner/i);
});

test('Privacy tables use constrained keyboard-accessible local scrolling', () => {
  const html = read('privacy-policy.html');
  assert.match(html, /\.table-scroll \{[^}]*max-width: 100%[^}]*overflow-x: auto/i);
  assert.match(html, /\.table-scroll:focus-visible/);
  assert.equal(count(html, /<div class="table-scroll" tabindex="0" role="region"/g), 4);
  assert.equal(count(html, /class="table-scroll-hint" id=/g), 4);
  assert.doesNotMatch(html, /overflow-x:\s*hidden/i);
});

test('AdSense verification remains unchanged and no visible units are authored', () => {
  const publisher = 'ca-pub-5946778263750869';
  assert.equal(read('ads.txt').trim(), 'google.com, pub-5946778263750869, DIRECT, f08c47fec0942fa0');
  assert.equal(count(read('index.html'), new RegExp(publisher, 'g')), 1);
  assert.match(read('vercel.json'), /pagead2\.googlesyndication\.com/);
  const combined = publicHtml.map(read).join('\n');
  assert.doesNotMatch(combined, /<ins\b[^>]*adsbygoogle|data-ad-slot|class="[^"]*ad-container/i);
  for (const file of publicHtml) {
    assert.ok(count(read(file), new RegExp(publisher, 'g')) <= 1, `${file} must not duplicate the verification loader`);
  }
});
