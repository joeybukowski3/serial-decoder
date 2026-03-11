#!/usr/bin/env node
// monitoring/run_tests.js
// Usage: node monitoring/run_tests.js
// Requires Node 18+ (built-in fetch). No extra dependencies.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(readFileSync(join(__dirname, 'golden_cases.json'), 'utf8'));

// ─── helpers ────────────────────────────────────────────────────────────────

function brandMatch(actual, expected) {
  if (!actual || !expected) return false;
  return actual.trim().toLowerCase() === expected.trim().toLowerCase();
}

// Accept estimatedYear within ±1 of expected, or if yearRange covers expected.
function yearMatch(estimatedYear, yearRange, expectedYear) {
  if (typeof estimatedYear === 'number') {
    if (Math.abs(estimatedYear - expectedYear) <= 1) return true;
  }
  if (typeof yearRange === 'string') {
    const parts = yearRange.match(/\d{4}/g);
    if (parts && parts.length >= 2) {
      const [lo, hi] = [parseInt(parts[0]), parseInt(parts[parts.length - 1])];
      if (expectedYear >= lo - 1 && expectedYear <= hi + 1) return true;
    }
    // single year string e.g. "2018"
    if (parts && parts.length === 1) {
      if (Math.abs(parseInt(parts[0]) - expectedYear) <= 1) return true;
    }
  }
  return false;
}

// Case-insensitive substring match for category and estimatedAgeRange strings.
function looseMatch(actual, expected) {
  if (!actual || !expected) return false;
  return actual.trim().toLowerCase().includes(expected.trim().toLowerCase()) ||
         expected.trim().toLowerCase().includes(actual.trim().toLowerCase());
}

function pass(label, detail) {
  console.log(`  ✅ PASS  ${label}${detail ? `  (${detail})` : ''}`);
}

function fail(label, detail) {
  console.log(`  ❌ FAIL  ${label}${detail ? `  — ${detail}` : ''}`);
}

// ─── runners ────────────────────────────────────────────────────────────────

async function runItemAssistCase(c, endpoint) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: c.input.query }),
  });

  if (!res.ok) {
    fail(c.label, `HTTP ${res.status}`);
    return false;
  }

  const data = await res.json();
  let ok = true;

  // brand
  if (!brandMatch(data.brand, c.expected.brand)) {
    fail(c.label, `brand: got "${data.brand}", expected "${c.expected.brand}"`);
    ok = false;
  }

  // year (estimatedYear ± 1, or yearRange covers expected)
  if (!yearMatch(data.estimatedYear, data.yearRange, c.expected.estimatedYear)) {
    fail(c.label, `year: estimatedYear=${data.estimatedYear} yearRange="${data.yearRange}", expected ~${c.expected.estimatedYear}`);
    ok = false;
  }

  // yearRange present
  if (!data.yearRange) {
    fail(c.label, 'yearRange missing from response');
    ok = false;
  }

  if (ok) pass(c.label, `brand=${data.brand} year=${data.estimatedYear} range=${data.yearRange}`);
  return ok;
}

async function runBoltCase(c, endpoint) {
  const url = new URL(endpoint);
  url.searchParams.set('query', c.input.query);

  const res = await fetch(url.toString(), { method: 'GET' });

  if (!res.ok) {
    fail(c.label, `HTTP ${res.status}`);
    return false;
  }

  const data = await res.json();
  const summary = data.itemSummary || {};
  let ok = true;

  // brand
  if (!brandMatch(summary.brand, c.expected.brand)) {
    fail(c.label, `brand: got "${summary.brand}", expected "${c.expected.brand}"`);
    ok = false;
  }

  // category
  if (!looseMatch(summary.category, c.expected.category)) {
    fail(c.label, `category: got "${summary.category}", expected "${c.expected.category}"`);
    ok = false;
  }

  // estimatedAgeRange — only checked if golden value is set (not FILL_IN)
  if (c.expected.estimatedAgeRange && c.expected.estimatedAgeRange !== 'FILL_IN') {
    if (!looseMatch(summary.estimatedAgeRange, c.expected.estimatedAgeRange)) {
      fail(c.label, `estimatedAgeRange: got "${summary.estimatedAgeRange}", expected "${c.expected.estimatedAgeRange}"`);
      ok = false;
    }
  }

  if (ok) pass(c.label, `brand=${summary.brand} category=${summary.category} range=${summary.estimatedAgeRange}`);
  return ok;
}

// ─── main ───────────────────────────────────────────────────────────────────

async function main() {
  let totalPass = 0;
  let totalFail = 0;

  // ── ItemAssist ──
  const ia = cases.sites.itemassist;
  console.log(`\n[ItemAssist]  ${ia.endpoint}`);
  for (const c of ia.cases) {
    // Skip unfilled placeholders
    if (c.expected.estimatedYear === 0 || String(c.expected.estimatedYear) === 'FILL_IN') {
      console.log(`  ⏭  SKIP   ${c.label}  (estimatedYear not set)`);
      continue;
    }
    try {
      const ok = await runItemAssistCase(c, ia.endpoint);
      ok ? totalPass++ : totalFail++;
    } catch (err) {
      fail(c.label, err.message);
      totalFail++;
    }
  }

  // ── BoltResearchTeam ──
  const bolt = cases.sites.boltresearchteam;
  console.log(`\n[BoltResearchTeam]  ${bolt.endpoint}`);
  for (const c of bolt.cases) {
    try {
      const ok = await runBoltCase(c, bolt.endpoint);
      ok ? totalPass++ : totalFail++;
    } catch (err) {
      fail(c.label, err.message);
      totalFail++;
    }
  }

  // ── summary ──
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${totalPass} passed, ${totalFail} failed`);

  if (totalFail > 0) {
    console.log('Status: FAIL');
    process.exit(1);
  } else {
    console.log('Status: PASS');
  }
}

main();
