#!/usr/bin/env node
/**
 * Site-wide horizontal layout consistency audit for DecodeMyItem.
 *
 * For every public root-level page, at each configured viewport width, measures:
 *   - documentElement.scrollWidth vs viewport width (horizontal overflow)
 *   - bounding rects for main content, .footer-sitemap, .footer-sitemap-grid, .footer-bottom
 *   - whether footer grid / footer bottom are horizontally centred
 *   - whether footer grid and footer bottom share the same left/right edges
 *   - the widest element responsible for any horizontal overflow
 *
 * Usage:
 *   node tests/helpers/static-server.mjs . 3001 &
 *   node scripts/audit/layout-consistency-audit.mjs [--json <outfile>] [--pages a,b,c]
 *
 * Read-only: never modifies site files.
 */

import { chromium } from 'playwright';
import { readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const BASE_URL = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3001';

const VIEWPORTS = [
  { name: '1920', width: 1920, height: 1080 },
  { name: '1600', width: 1600, height: 900 },
  { name: '1400', width: 1400, height: 900 },
  { name: '390', width: 390, height: 844 },
];

/** Pages excluded from the public audit. */
const EXCLUDED = new Set([
  'brand-page-template.html', // authoring template, not routed
  'analytics-report.html', // internal dashboard
  // noindex redirect stubs: they meta-refresh to /index.html?cat=…, so auditing
  // them just re-measures the homepage under a different name.
  'appliances.html',
  'electronics.html',
  'hvac.html',
  'water-heaters.html',
]);

/** Pages that intentionally ship without the sitemap footer. */
const NO_FOOTER_BY_DESIGN = new Set(['/404']);

/** Tolerance in px for "centred" and "edges align" checks. */
const ALIGN_TOLERANCE = 2;
/** Overflow beyond this many px is reported as a failure. */
const OVERFLOW_TOLERANCE = 1;

function routeForFile(file) {
  if (file === 'index.html') return '/';
  return '/' + file.replace(/\.html$/, '');
}

function listPages() {
  const arg = process.argv.indexOf('--pages');
  if (arg !== -1 && process.argv[arg + 1]) {
    return process.argv[arg + 1].split(',').map((s) => s.trim()).filter(Boolean);
  }
  return readdirSync(ROOT)
    .filter((f) => f.endsWith('.html') && !EXCLUDED.has(f))
    .sort()
    .map(routeForFile);
}

/** Runs in the page. Returns raw geometry; all judgement happens in Node. */
function collectGeometry() {
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
  };

  const vw = document.documentElement.clientWidth;
  const scrollWidth = document.documentElement.scrollWidth;

  // Identify elements that extend past the viewport's right edge or before its left.
  const offenders = [];
  if (scrollWidth > vw + 1) {
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > vw + 1 || r.left < -1) {
        offenders.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className && String(el.className).slice(0, 60)) || '',
          left: Math.round(r.left),
          right: Math.round(r.right),
        });
      }
    }
  }

  const footer = document.querySelector('.footer-sitemap');

  return {
    viewportWidth: vw,
    scrollWidth,
    main: rect(document.querySelector('main')),
    footerSitemap: rect(footer),
    footerGrid: rect(document.querySelector('.footer-sitemap-grid')),
    footerBottom: rect(document.querySelector('.footer-bottom')),
    footerDisplay: footer ? getComputedStyle(footer).display : null,
    hasFooterSitemap: Boolean(footer),
    // The sitemap footer is a full-bleed band; anything other than <body> as its
    // parent means a page wrapper was left unclosed and swallowed it.
    footerParent: footer
      ? (() => {
          const chain = [];
          let el = footer.parentElement;
          while (el && el !== document.documentElement) {
            chain.push(el.tagName + (el.id ? '#' + el.id : ''));
            el = el.parentElement;
          }
          return chain.join(' < ');
        })()
      : null,
    // Deepest offenders only: those whose parent is not itself an offender.
    offenders: offenders.slice(0, 8),
  };
}

/** Turns raw geometry into pass/fail findings. */
function evaluate(geo, route) {
  const issues = [];
  const vw = geo.viewportWidth;

  if (geo.scrollWidth > vw + OVERFLOW_TOLERANCE) {
    issues.push({
      code: 'horizontal-overflow',
      detail: `scrollWidth ${geo.scrollWidth} > viewport ${vw} (+${geo.scrollWidth - vw}px)`,
      offenders: geo.offenders,
    });
  }

  if (!geo.hasFooterSitemap) {
    if (!NO_FOOTER_BY_DESIGN.has(route)) {
      issues.push({ code: 'no-sitemap-footer', detail: 'page has no .footer-sitemap element' });
    }
    return issues;
  }

  if (geo.footerParent !== 'BODY') {
    issues.push({
      code: 'footer-mis-nested',
      detail: `.footer-sitemap parent chain is "${geo.footerParent}", expected direct child of BODY`,
    });
  }

  if (geo.footerDisplay && geo.footerDisplay !== 'block') {
    issues.push({
      code: 'footer-not-block',
      detail: `.footer-sitemap computed display is "${geo.footerDisplay}", expected "block"`,
    });
  }

  const centred = (r) => r && Math.abs(r.left - (vw - r.right)) <= ALIGN_TOLERANCE;

  if (geo.footerGrid && !centred(geo.footerGrid)) {
    issues.push({
      code: 'footer-grid-not-centred',
      detail: `grid left ${geo.footerGrid.left}px vs right gutter ${vw - geo.footerGrid.right}px`,
    });
  }

  if (geo.footerBottom && !centred(geo.footerBottom)) {
    issues.push({
      code: 'footer-bottom-not-centred',
      detail: `bottom left ${geo.footerBottom.left}px vs right gutter ${vw - geo.footerBottom.right}px`,
    });
  }

  if (geo.footerGrid && geo.footerBottom) {
    const dLeft = Math.abs(geo.footerGrid.left - geo.footerBottom.left);
    const dRight = Math.abs(geo.footerGrid.right - geo.footerBottom.right);
    if (dLeft > ALIGN_TOLERANCE || dRight > ALIGN_TOLERANCE) {
      issues.push({
        code: 'footer-edges-mismatch',
        detail: `grid [${geo.footerGrid.left}, ${geo.footerGrid.right}] vs bottom [${geo.footerBottom.left}, ${geo.footerBottom.right}] (Δleft ${dLeft}px, Δright ${dRight}px)`,
      });
    }
  }

  return issues;
}

async function main() {
  const pages = listPages();
  const browser = await chromium.launch();
  const results = [];

  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
    });
    // Block third-party requests except web fonts. Icon fonts must load: without
    // them, Material Symbols ligatures render as literal words and report bogus
    // overflow from nav/toggle buttons.
    await context.route('**/*', (route) => {
      const url = route.request().url();
      const allowed =
        url.startsWith(BASE_URL) ||
        url.startsWith('data:') ||
        url.includes('fonts.googleapis.com') ||
        url.includes('fonts.gstatic.com');
      return allowed ? route.continue() : route.abort();
    });
    const page = await context.newPage();

    for (const route of pages) {
      try {
        await page.goto(BASE_URL + route, { waitUntil: 'domcontentloaded', timeout: 20000 });
        // Icon-font metrics change nav width, so measure only once fonts resolve.
        await page.evaluate(() => document.fonts.ready).catch(() => {});
        // Allow JS-injected header/footer/sidebar to settle.
        await page.waitForTimeout(350);
        const geo = await page.evaluate(collectGeometry);
        results.push({ route, viewport: viewport.name, geo, issues: evaluate(geo, route) });
      } catch (err) {
        results.push({
          route,
          viewport: viewport.name,
          geo: null,
          issues: [{ code: 'load-error', detail: String(err.message || err).slice(0, 200) }],
        });
      }
    }

    await context.close();
  }

  await browser.close();

  // ── Report ────────────────────────────────────────────
  const byRoute = new Map();
  for (const r of results) {
    if (!byRoute.has(r.route)) byRoute.set(r.route, []);
    byRoute.get(r.route).push(r);
  }

  let failingPages = 0;
  const codeCounts = new Map();

  for (const [route, entries] of byRoute) {
    const withIssues = entries.filter((e) => e.issues.length > 0);
    if (withIssues.length === 0) continue;
    failingPages++;
    console.log(`\n${route}`);
    for (const e of withIssues) {
      for (const i of e.issues) {
        codeCounts.set(i.code, (codeCounts.get(i.code) || 0) + 1);
        console.log(`  [${e.viewport}] ${i.code}: ${i.detail}`);
        if (i.offenders?.length) {
          for (const o of i.offenders.slice(0, 3)) {
            console.log(`        overflow from <${o.tag} class="${o.cls}"> [${o.left}, ${o.right}]`);
          }
        }
      }
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Pages audited: ${byRoute.size}  |  viewports: ${VIEWPORTS.map((v) => v.name).join(', ')}`);
  console.log(`Pages with issues: ${failingPages}  |  clean: ${byRoute.size - failingPages}`);
  for (const [code, n] of [...codeCounts].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${code}: ${n}`);
  }

  const jsonIdx = process.argv.indexOf('--json');
  if (jsonIdx !== -1 && process.argv[jsonIdx + 1]) {
    writeFileSync(process.argv[jsonIdx + 1], JSON.stringify(results, null, 2));
    console.log(`\nJSON written to ${process.argv[jsonIdx + 1]}`);
  }

  process.exit(failingPages > 0 ? 1 : 0);
}

main();
