#!/usr/bin/env node
/**
 * Static site audit for DecodeMyItem.
 *
 * Models Vercel routing (cleanUrls + vercel.json redirects/rewrites) and audits
 * every root-level HTML page for:
 *   - title / H1 / meta description presence and duplication
 *   - canonical URL correctness
 *   - robots meta / robots.txt indexability
 *   - JSON-LD structured data types
 *   - internal links (broken targets, redirect chains, .html links)
 *   - sitemap.xml consistency (missing pages, redirecting entries)
 *   - orphan pages (no inbound internal links)
 *
 * Usage: node scripts/audit/site-audit.mjs [--json <outfile>]
 * Read-only: never modifies site files.
 */

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ORIGIN = 'https://www.decodemyitem.com';

const EXCLUDED_FILES = new Set(['brand-page-template.html', 'serial-guide-refactor.html']);

function readVercelConfig() {
  return JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
}

function listHtmlFiles() {
  return readdirSync(ROOT)
    .filter((f) => f.endsWith('.html'))
    .sort();
}

function routeForFile(file) {
  if (file === 'index.html') return '/';
  return '/' + file.replace(/\.html$/, '');
}

/** Build redirect map: source route -> final destination route (chains followed). */
function buildRedirectMap(config) {
  const map = new Map();
  for (const r of config.redirects || []) {
    if (r.source.includes(':') || r.has) continue; // host/dynamic rules
    map.set(r.source, r.destination.replace(/\.html$/, '') || '/');
  }
  // follow chains
  const followed = new Map();
  for (const [src] of map) {
    let cur = map.get(src);
    let hops = 1;
    const seen = new Set([src]);
    while (map.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      cur = map.get(cur);
      hops++;
    }
    followed.set(src, { target: cur, hops, loop: seen.has(cur) && map.has(cur) });
  }
  return followed;
}

function parseRobotsTxt() {
  const txt = readFileSync(join(ROOT, 'robots.txt'), 'utf8');
  return txt
    .split(/\r?\n/)
    .filter((l) => l.toLowerCase().startsWith('disallow:'))
    .map((l) => l.split(':')[1].trim())
    .filter(Boolean);
}

function parseSitemap() {
  const xml = readFileSync(join(ROOT, 'sitemap.xml'), 'utf8');
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => {
    const u = new URL(m[1].trim());
    return u.pathname === '/' ? '/' : u.pathname.replace(/\/$/, '');
  });
}

function extract(html, re) {
  const m = html.match(re);
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

function extractAll(html, re) {
  return [...html.matchAll(re)].map((m) => m[1].replace(/\s+/g, ' ').trim());
}

function stripTags(s) {
  return s ? s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : s;
}

function parsePage(file) {
  const html = readFileSync(join(ROOT, file), 'utf8');
  const title = extract(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const h1s = extractAll(html, /<h1[^>]*>([\s\S]*?)<\/h1>/gi).map(stripTags);
  const metaDesc =
    extract(html, /<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["']/i) ||
    extract(html, /<meta\s+content=["']([\s\S]*?)["']\s+name=["']description["']/i);
  const canonical = extract(html, /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
  const robotsMeta = extract(html, /<meta\s+name=["']robots["']\s+content=["']([^"']+)["']/i);
  const ogTitle = extract(html, /<meta\s+property=["']og:title["']\s+content=["']([\s\S]*?)["']/i);
  const ogUrl = extract(html, /<meta\s+property=["']og:url["']\s+content=["']([^"']+)["']/i);
  const jsonLdTypes = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => {
      try {
        const data = JSON.parse(m[1]);
        const items = Array.isArray(data) ? data : data['@graph'] || [data];
        return items.map((i) => i['@type']).flat().filter(Boolean);
      } catch {
        return ['(invalid JSON-LD)'];
      }
    })
    .flat();
  // internal links from href attributes
  const hrefs = [...html.matchAll(/<a\s[^>]*href=["']([^"'#]+)(?:#[^"']*)?["']/gi)].map((m) => m[1].trim());
  return { file, html, title, h1s, metaDesc, canonical, robotsMeta, ogTitle, ogUrl, jsonLdTypes, hrefs };
}

function classifyLink(href) {
  if (/^(mailto:|tel:|javascript:)/i.test(href)) return { kind: 'ignore' };
  if (/^https?:\/\//i.test(href)) {
    const u = new URL(href);
    if (u.hostname.endsWith('decodemyitem.com')) {
      return { kind: 'internal', path: u.pathname, viaAbsolute: true, nonWww: !u.hostname.startsWith('www.') };
    }
    return { kind: 'external', href };
  }
  if (href.startsWith('//')) return { kind: 'external', href };
  let path = href.split('?')[0];
  if (!path.startsWith('/')) path = '/' + path;
  return { kind: 'internal', path };
}

function main() {
  const config = readVercelConfig();
  const redirects = buildRedirectMap(config);
  const rewriteSources = new Set((config.rewrites || []).map((r) => r.source).filter((s) => !s.includes(':') && !s.includes('(')));
  const disallows = parseRobotsTxt();
  const sitemapPaths = parseSitemap();

  const files = listHtmlFiles();
  const pages = files.map(parsePage);
  const routes = new Map(); // route -> page
  for (const p of pages) routes.set(routeForFile(p.file), p);

  const routeReachable = (path) => {
    // normalize
    let p = path === '' ? '/' : path;
    const isHtmlLink = /\.html$/.test(p);
    if (isHtmlLink) {
      p = p.replace(/\.html$/, '') || '/';
      if (p === '/index') p = '/';
    }
    if (p !== '/' && p.endsWith('/')) p = p.replace(/\/+$/, '');
    const redirect = redirects.get(p);
    const finalPath = redirect ? redirect.target : p;
    const exists =
      routes.has(finalPath) ||
      finalPath === '/' ||
      rewriteSources.has(finalPath) ||
      existsSync(join(ROOT, finalPath.slice(1))); // static assets/dirs
    return { finalPath, redirected: Boolean(redirect) || isHtmlLink, hops: (redirect?.hops || 0) + (isHtmlLink ? 1 : 0), exists };
  };

  // --- link audit ---
  const brokenLinks = [];
  const redirectedLinks = [];
  const htmlSuffixLinks = [];
  const inboundCount = new Map();
  const externalLinks = new Set();

  const retiredSet = new Set([...redirects.keys()]);
  for (const p of pages) {
    const fromRoute = routeForFile(p.file);
    const fromRetired = retiredSet.has(fromRoute) || EXCLUDED_FILES.has(p.file);
    for (const href of p.hrefs) {
      const c = classifyLink(href);
      if (c.kind === 'external') { externalLinks.add(c.href); continue; }
      if (c.kind !== 'internal') continue;
      const r = routeReachable(c.path);
      if (!r.exists) brokenLinks.push({ from: fromRoute, href, fromRetired });
      else {
        inboundCount.set(r.finalPath, (inboundCount.get(r.finalPath) || 0) + 1);
        if (/\.html$/.test(c.path)) htmlSuffixLinks.push({ from: fromRoute, href });
        else if (r.redirected) redirectedLinks.push({ from: fromRoute, href, finalPath: r.finalPath });
      }
      if (c.nonWww) redirectedLinks.push({ from: fromRoute, href, finalPath: r.finalPath, reason: 'non-www absolute link' });
    }
  }

  // --- page-level audit ---
  const retired = new Set([...redirects.keys()]);
  const pageRows = [];
  for (const p of pages) {
    const route = routeForFile(p.file);
    const isRetired = retired.has(route);
    const isExcluded = EXCLUDED_FILES.has(p.file);
    const robotsBlocked = disallows.some((d) => route === d || route + '.html' === d);
    const noindex = /noindex/i.test(p.robotsMeta || '');
    const indexable = !isRetired && !robotsBlocked && !noindex && !isExcluded;
    const canonicalPath = p.canonical ? (() => { try { const u = new URL(p.canonical, ORIGIN); return u.pathname === '/' ? '/' : u.pathname.replace(/\/$/, ''); } catch { return '(invalid)'; } })() : null;
    const issues = [];
    if (!p.title) issues.push('missing title');
    if (!p.metaDesc) issues.push('missing meta description');
    if (p.h1s.length === 0) issues.push('missing H1');
    if (p.h1s.length > 1) issues.push(`multiple H1s (${p.h1s.length})`);
    if (indexable && !p.canonical) issues.push('missing canonical');
    if (indexable && p.canonical && canonicalPath !== route) issues.push(`canonical mismatch: ${canonicalPath} != ${route}`);
    if (indexable && p.canonical && !p.canonical.startsWith(ORIGIN)) issues.push(`canonical not on ${ORIGIN}`);
    if (indexable && canonicalPath && /\.html$/.test(canonicalPath)) issues.push('canonical uses .html');
    const inSitemap = sitemapPaths.includes(route);
    if (indexable && !inSitemap) issues.push('indexable but missing from sitemap');
    if (!indexable && inSitemap) issues.push('non-indexable but in sitemap');
    pageRows.push({
      route, file: p.file, indexable, isRetired, robotsBlocked, noindex, inSitemap,
      title: p.title, h1: p.h1s[0] || null, h1Count: p.h1s.length, metaDesc: p.metaDesc,
      canonical: p.canonical, jsonLdTypes: [...new Set(p.jsonLdTypes)],
      inboundLinks: inboundCount.get(route) || 0, issues,
    });
  }

  // duplicates among indexable pages
  const dupBy = (key) => {
    const seen = new Map();
    for (const r of pageRows.filter((r) => r.indexable && r[key])) {
      const v = r[key].toLowerCase();
      if (!seen.has(v)) seen.set(v, []);
      seen.get(v).push(r.route);
    }
    return [...seen.entries()].filter(([, v]) => v.length > 1).map(([value, routesList]) => ({ value, routes: routesList }));
  };
  const duplicateTitles = dupBy('title');
  const duplicateH1s = dupBy('h1');
  const duplicateDescs = dupBy('metaDesc');

  // sitemap entries that redirect or don't resolve
  const sitemapIssues = [];
  for (const sp of sitemapPaths) {
    const r = routeReachable(sp);
    if (!r.exists) sitemapIssues.push({ path: sp, issue: 'does not resolve' });
    else if (redirects.get(sp)) sitemapIssues.push({ path: sp, issue: `redirects to ${r.finalPath}` });
  }
  const dupSitemap = sitemapPaths.filter((v, i, a) => a.indexOf(v) !== i);
  for (const d of new Set(dupSitemap)) sitemapIssues.push({ path: d, issue: 'duplicate sitemap entry' });

  // orphans: indexable pages with no inbound internal links
  const orphans = pageRows.filter((r) => r.indexable && r.inboundLinks === 0 && r.route !== '/');

  const report = {
    generatedAt: new Date().toISOString(),
    totals: {
      htmlFiles: files.length,
      indexablePages: pageRows.filter((r) => r.indexable).length,
      retiredRoutes: pageRows.filter((r) => r.isRetired).length,
      sitemapEntries: sitemapPaths.length,
      brokenInternalLinks: brokenLinks.filter((b) => !b.fromRetired).length,
      brokenLinksOnRetiredPages: brokenLinks.filter((b) => b.fromRetired).length,
      redirectedInternalLinks: redirectedLinks.length,
      htmlSuffixInternalLinks: htmlSuffixLinks.length,
      orphanPages: orphans.length,
      duplicateTitles: duplicateTitles.length,
      duplicateH1s: duplicateH1s.length,
      duplicateDescriptions: duplicateDescs.length,
      sitemapIssues: sitemapIssues.length,
      externalLinkTargets: externalLinks.size,
      pagesWithIssues: pageRows.filter((r) => r.issues.length).length,
    },
    sitemapIssues,
    brokenLinks,
    redirectedLinks,
    htmlSuffixLinks: htmlSuffixLinks.slice(0, 200),
    duplicateTitles,
    duplicateH1s,
    duplicateDescriptions: duplicateDescs,
    orphans: orphans.map((o) => o.route),
    externalLinks: [...externalLinks].sort(),
    pages: pageRows.map(({ ...r }) => r),
  };

  const jsonIdx = process.argv.indexOf('--json');
  if (jsonIdx !== -1 && process.argv[jsonIdx + 1]) {
    writeFileSync(process.argv[jsonIdx + 1], JSON.stringify(report, null, 2));
  }

  console.log('=== SITE AUDIT SUMMARY ===');
  for (const [k, v] of Object.entries(report.totals)) console.log(`${k}: ${v}`);
  const printList = (label, items, fmt) => {
    if (!items.length) return;
    console.log(`\n--- ${label} (${items.length}) ---`);
    for (const i of items.slice(0, 40)) console.log('  ' + fmt(i));
    if (items.length > 40) console.log(`  ... and ${items.length - 40} more`);
  };
  printList('Sitemap issues', sitemapIssues, (i) => `${i.path}: ${i.issue}`);
  printList('Broken internal links (reachable pages)', brokenLinks.filter((b) => !b.fromRetired), (i) => `${i.from} -> ${i.href}`);
  printList('Links to redirecting URLs', redirectedLinks, (i) => `${i.from} -> ${i.href} (final: ${i.finalPath})`);
  printList('Duplicate titles', duplicateTitles, (i) => `${i.routes.join(', ')}: "${i.value.slice(0, 80)}"`);
  printList('Duplicate H1s', duplicateH1s, (i) => `${i.routes.join(', ')}: "${i.value.slice(0, 80)}"`);
  printList('Duplicate descriptions', duplicateDescs, (i) => `${i.routes.join(', ')}`);
  printList('Orphan pages', orphans, (i) => i.route);
  printList('Pages with issues', pageRows.filter((r) => r.issues.length), (r) => `${r.route}: ${r.issues.join('; ')}`);
}

main();
