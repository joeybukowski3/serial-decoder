// Ensures the hand-maintained HTML pages load the RCV/ACV linkout assets, mirroring
// scripts/inject-responsive-navigation-assets.js.
//
// The 26 SEO/brand pages written by scripts/generate-seo-pages.js are deliberately NOT
// touched here: that generator applies the same shared helper to its own output, so
// injecting a second time would be redundant, and any tag written here would be
// overwritten the next time someone runs `npm run build:seo` anyway.
//
// GENERATOR_OWNED is an explicit list rather than a filename pattern on purpose. Bare
// brand pages (ge.html) are hand-maintained while the same brand's
// *-serial-number-lookup.html is generated, and data-page-kind does not separate them
// either (10 hand-maintained pages also declare data-page-kind="brand-page"), so any
// heuristic would put pages in the wrong bucket. Add an entry here whenever a new page
// is added to generate-seo-pages.js.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureRcvAcvAssets, analyze, verify } from '../lib/rcv-acv-asset-tags.js';

const GENERATOR_OWNED = new Set([
  'apple.html',
  'appliance-age-for-insurance-and-replacement.html',
  'asus-serial-number-decoder.html',
  'bosch.html',
  'carrier-serial-number-lookup.html',
  'dishwasher-serial-number.html',
  'dryer-serial-number.html',
  'frigidaire-serial-number-lookup.html',
  'ge-serial-number-lookup.html',
  'goodman-serial-number-lookup.html',
  'google-pixel.html',
  'hp.html',
  'kenmore-serial-number-lookup.html',
  'lg-serial-number-lookup.html',
  'maytag-serial-number-lookup.html',
  'panasonic.html',
  'range-oven-serial-number.html',
  'refrigerator-serial-number.html',
  'rheem-serial-number-lookup.html',
  'samsung-serial-number-lookup.html',
  'samsung-tv-serial-number-decoder.html',
  'sony.html',
  'trane-serial-number-lookup.html',
  'vizio.html',
  'washer-serial-number.html',
  'whirlpool-serial-number-lookup.html',
]);

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const files = await readdir(root);

let updated = 0;
let skippedGenerated = 0;
const problems = [];

for (const filename of files) {
  if (!filename.endsWith('.html')) continue;
  if (GENERATOR_OWNED.has(filename)) { skippedGenerated += 1; continue; }

  const filePath = path.join(root, filename);
  const html = await readFile(filePath, 'utf8');

  // Markup-gated: pages hosting neither panel are left completely alone.
  if (!analyze(html).needsCss) continue;

  const next = ensureRcvAcvAssets(html);
  if (next !== html) {
    await writeFile(filePath, next, 'utf8');
    updated += 1;
  }
  problems.push(...verify(next, filename));
}

// Fail loudly rather than shipping a page whose module script lost type="module" —
// rcv-acv-linkout.js imports /lib/rcv-acv-linkout-helpers.js and a plain defer tag would
// break that import silently in the browser.
if (problems.length) {
  console.error('RCV/ACV asset injection failed verification:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(
  `Ensured RCV/ACV linkout assets on ${updated} hand-maintained HTML files ` +
  `(${skippedGenerated} generator-owned pages skipped).`,
);
