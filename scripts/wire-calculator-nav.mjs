// One-off migration: insert RCV/ACV Calculator + Sales Tax De-Calculator links into the
// nav "Reference" dropdown column and footer "Resources" column across every existing HTML page.
// Safe to re-run — it no-ops on files that already contain the links.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SKIP_FILES = new Set(['rcv-acv-calculator.html', 'sales-tax-decalculator.html']);

const NAV_ANCHOR = '        <a href="/how-to-read-serial-number" role="menuitem">How to Read a Serial Number</a>';
const NAV_INSERT = '        <a href="/rcv-acv-calculator" role="menuitem">RCV / ACV Calculator</a>\n        <a href="/sales-tax-decalculator" role="menuitem">Sales Tax De-Calculator</a>\n' + NAV_ANCHOR;

const FOOTER_ANCHOR = '        <li><a href="/how-to-read-serial-number">How to Read a Serial Number</a></li>';
const FOOTER_INSERT = '        <li><a href="/rcv-acv-calculator">RCV / ACV Calculator</a></li>\n        <li><a href="/sales-tax-decalculator">Sales Tax De-Calculator</a></li>\n' + FOOTER_ANCHOR;

let navPatched = 0;
let footerPatched = 0;
let filesTouched = 0;

for (const file of readdirSync(ROOT)) {
  if (!file.endsWith('.html') || SKIP_FILES.has(file)) continue;
  const path = join(ROOT, file);
  let content = readFileSync(path, 'utf8');
  let changed = false;

  if (content.includes(NAV_ANCHOR) && !content.includes('href="/rcv-acv-calculator" role="menuitem"')) {
    content = content.replace(NAV_ANCHOR, NAV_INSERT);
    navPatched++;
    changed = true;
  }

  if (content.includes(FOOTER_ANCHOR) && !content.includes('href="/rcv-acv-calculator">RCV')) {
    content = content.replace(FOOTER_ANCHOR, FOOTER_INSERT);
    footerPatched++;
    changed = true;
  }

  if (changed) {
    writeFileSync(path, content, 'utf8');
    filesTouched++;
  }
}

console.log(`nav patched: ${navPatched}, footer patched: ${footerPatched}, files touched: ${filesTouched}`);
