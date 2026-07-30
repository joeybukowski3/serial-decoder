#!/usr/bin/env node
/**
 * Isolated Serper Google Search proof-of-concept runner.
 *
 * Makes exactly one bounded Serper request per test model (no retries, no
 * second query variation, no webpage fetching) and writes two reports:
 *   artifacts/serper-model-search-results.json
 *   artifacts/serper-model-search-report.md
 *
 * This script is NOT wired into any production workflow. It never logs or
 * writes the SERPER_API_KEY value. Run explicitly via:
 *   npm run test:serper-model-search
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvLocal } from '../lib/serper/env-loader.js';
import { searchModelWithSerper } from '../lib/serper/model-search.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const ARTIFACTS_DIR = join(REPO_ROOT, 'artifacts');
const JSON_REPORT_PATH = join(ARTIFACTS_DIR, 'serper-model-search-results.json');
const MD_REPORT_PATH = join(ARTIFACTS_DIR, 'serper-model-search-report.md');
const TIMEOUT_MS = 3000;

loadEnvLocal();

if (!process.env.SERPER_API_KEY) {
  console.error('SERPER_API_KEY is not configured.');
  process.exit(1);
}

// { brand, model, category, source } — `source` distinguishes real
// repo-documented examples from publicly recognizable models added to reach
// a representative sample of 20.
const TEST_MODELS = [
  // --- Real, repo-documented (tests/fixtures/serial-refinement-cases.json) ---
  { brand: 'LG', model: 'WM3470HWA', category: 'washer', source: 'repo-fixture' },
  { brand: 'Whirlpool', model: 'WMH31017HS12', category: 'microwave', source: 'repo-fixture' },
  { brand: 'Frigidaire', model: 'FFTR2045VS0', category: 'refrigerator', source: 'repo-fixture' },
  { brand: 'Frigidaire', model: 'FFTR2045VSO', category: 'refrigerator', source: 'repo-fixture (revision-suffix variant: O vs 0)' },
  { brand: 'GE', model: 'JB258DM1WW', category: 'range', source: 'repo-fixture' },
  { brand: 'GE', model: 'PFD87ESPV0RS', category: 'refrigerator', source: 'repo-fixture (revision-suffix variant)' },
  { brand: 'GE', model: 'PFD87ESPVRS', category: 'refrigerator', source: 'repo-fixture (base model, no suffix)' },
  { brand: 'Vizio', model: 'VW32L HDTV10A', category: 'television', source: 'repo-fixture (older model, ~2007)' },
  // --- Added: publicly recognizable models, not sourced from repo fixtures ---
  { brand: 'GE', model: 'GNE27JYMFS', category: 'refrigerator', source: 'added (publicly recognizable)' },
  { brand: 'GE', model: 'GTS18GTHWW', category: 'refrigerator', source: 'added (older top-freezer model)' },
  { brand: 'Whirlpool', model: 'WRF767SDHZ', category: 'refrigerator', source: 'added (common current model)' },
  { brand: 'Maytag', model: 'MVWC565FW', category: 'washer', source: 'added (common current model)' },
  { brand: 'Samsung', model: 'RF28R7351SR', category: 'refrigerator', source: 'added (publicly recognizable)' },
  { brand: 'Samsung', model: 'WF45T6000AW', category: 'washer', source: 'added (common current model)' },
  { brand: 'LG', model: 'LFXS28968S', category: 'refrigerator', source: 'added (common current model)' },
  { brand: 'Electrolux', model: 'EI23BC36IS', category: 'refrigerator', source: 'added (common current model)' },
  { brand: 'KitchenAid', model: 'KRFF305ESS', category: 'refrigerator', source: 'added (less-common brand variant)' },
  { brand: 'Carrier', model: '24ABC636A003', category: 'HVAC condenser', source: 'added (HVAC)' },
  { brand: 'Trane', model: '4TTR3036A1000AA', category: 'HVAC condenser', source: 'added (HVAC)' },
  { brand: 'Rheem', model: 'RA1424AJ1NA', category: 'HVAC condenser', source: 'added (HVAC)' },
];

function gitInfo() {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: REPO_ROOT }).toString().trim();
    const commit = execSync('git rev-parse HEAD', { cwd: REPO_ROOT }).toString().trim();
    return { branch, commit };
  } catch (_) {
    return { branch: 'unknown', commit: 'unknown' };
  }
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

function pct(count, total) {
  if (!total) return '0.0';
  return ((count / total) * 100).toFixed(1);
}

function classifySourceType(domain) {
  if (!domain) return 'forum-or-other';
  const manufacturerHost = domain.replace(/\.[a-z]{2,3}(\.[a-z]{2})?$/i, '');
  const RETAILER_HINTS = ['bestbuy', 'homedepot', 'lowes', 'amazon', 'walmart', 'abt.com', 'appliancesconnection', 'ajmadison'];
  const MANUAL_HINTS = ['manualslib', 'manua.ls', 'productmanualguide', 'manualzz', 'manuals'];
  const PARTS_HINTS = ['repairclinic', 'partselect', 'appliancepartspros', 'encompass', 'searspartsdirect'];
  const MARKETPLACE_HINTS = ['ebay', 'craigslist', 'offerup', 'mercari'];
  const FORUM_HINTS = ['reddit', 'forum', 'community', 'justanswer', 'fixya', 'appliantology'];

  if (domain.includes('.gov')) return 'other';
  if (MANUFACTURER_DOMAIN_LOOKUP.has(domain)) return 'manufacturer';
  if (RETAILER_HINTS.some((hint) => domain.includes(hint))) return 'retailer';
  if (MANUAL_HINTS.some((hint) => domain.includes(hint))) return 'manual-or-document-host';
  if (PARTS_HINTS.some((hint) => domain.includes(hint))) return 'parts-site';
  if (MARKETPLACE_HINTS.some((hint) => domain.includes(hint))) return 'marketplace';
  if (FORUM_HINTS.some((hint) => domain.includes(hint))) return 'forum-or-other';
  void manufacturerHost;
  return 'forum-or-other';
}

async function main() {
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const { branch, commit } = gitInfo();
  const timestamp = new Date().toISOString();

  const testResults = [];
  console.log(`Running Serper model-search POC — ${TEST_MODELS.length} models, ${TIMEOUT_MS}ms timeout, 1 request each.\n`);

  for (let i = 0; i < TEST_MODELS.length; i += 1) {
    const testCase = TEST_MODELS[i];
    const result = await searchModelWithSerper(
      { brand: testCase.brand, model: testCase.model, category: testCase.category, timeoutMs: TIMEOUT_MS },
    );
    testResults.push({ ...testCase, ...result });

    const label = `[${i + 1}/${TEST_MODELS.length}] ${testCase.brand} ${testCase.model}`;
    if (result.status === 'success') {
      console.log(`${label} — success — ${result.durationMs} ms — ${result.resultCount} results`);
    } else {
      console.log(`${label} — ${result.status} — ${result.durationMs} ms`);
    }
  }

  writeReports({ testResults, branch, commit, timestamp });
}

const MANUFACTURER_DOMAIN_LOOKUP = new Set([
  'geappliances.com', 'ge.com', 'whirlpool.com', 'maytag.com', 'kitchenaid.com',
  'samsung.com', 'lg.com', 'frigidaire.com', 'electroluxappliances.com', 'electrolux.com',
  'vizio.com', 'carrier.com', 'trane.com', 'lennox.com', 'goodmanmfg.com', 'rheem.com',
  'ruud.com', 'americanstandardair.com', 'york.com',
]);

function writeReports({ testResults, branch, commit, timestamp }) {
  const successCount = testResults.filter((r) => r.status === 'success').length;
  const timeoutCount = testResults.filter((r) => r.status === 'timeout').length;
  const errorCount = testResults.filter((r) => r.status === 'provider_error').length;
  const durations = testResults.map((r) => r.durationMs);
  const under2s = durations.filter((d) => d <= 2000).length;
  const under3s = durations.filter((d) => d <= 3000).length;
  const exactModelCount = testResults.filter((r) => r.exactModelFound).length;
  const exactTitleCount = testResults.filter((r) => r.exactModelInTitle).length;
  const manufacturerCount = testResults.filter((r) => r.manufacturerDomainFound).length;
  const yearCount = testResults.filter((r) => r.yearMentionFound).length;

  const summary = {
    totalModels: testResults.length,
    successCount,
    timeoutCount,
    errorCount,
    medianDurationMs: median(durations),
    p95DurationMs: percentile(durations, 95),
    fastestDurationMs: durations.length ? Math.min(...durations) : null,
    slowestDurationMs: durations.length ? Math.max(...durations) : null,
    pctUnder2s: pct(under2s, testResults.length),
    pctUnder3s: pct(under3s, testResults.length),
    pctExactModelFound: pct(exactModelCount, testResults.length),
    pctExactModelInTitle: pct(exactTitleCount, testResults.length),
    pctManufacturerDomainFound: pct(manufacturerCount, testResults.length),
    pctYearMentionFound: pct(yearCount, testResults.length),
  };

  const jsonReport = {
    generatedAt: timestamp,
    gitBranch: branch,
    gitCommit: commit,
    config: {
      endpoint: 'https://google.serper.dev/search',
      timeoutMs: TIMEOUT_MS,
      numResultsRequested: 5,
      queriesPerModel: 1,
      retriesEnabled: false,
    },
    modelCount: testResults.length,
    summary,
    results: testResults,
  };
  writeFileSync(JSON_REPORT_PATH, JSON.stringify(jsonReport, null, 2));
  writeFileSync(MD_REPORT_PATH, buildMarkdownReport({ testResults, branch, commit, timestamp, summary }));

  console.log(`\nDone. ${successCount}/${testResults.length} succeeded, ${timeoutCount} timed out, ${errorCount} provider errors.`);
  console.log(`Median latency: ${summary.medianDurationMs} ms | P95: ${summary.p95DurationMs} ms`);
  console.log(`Reports written to:\n  ${JSON_REPORT_PATH}\n  ${MD_REPORT_PATH}`);
}

function bestLookingResult(result) {
  if (!result.results.length) return 'No results';
  const preferred = result.results.find((r) => isManufacturerDomainLocal(r.domain)) || result.results[0];
  const title = preferred.title.length > 60 ? `${preferred.title.slice(0, 57)}...` : preferred.title;
  return `"${title}" (${preferred.domain || 'unknown domain'})`;
}

function isManufacturerDomainLocal(domain) {
  return Boolean(domain) && MANUFACTURER_DOMAIN_LOOKUP.has(domain);
}

function recommendation(summary) {
  const exactRate = Number(summary.pctExactModelFound);
  const reliabilityRate = Number(summary.pctUnder3s);
  const medianOk = summary.medianDurationMs != null && summary.medianDurationMs < 2500;
  const eraRate = Number(summary.pctYearMentionFound);

  if (exactRate >= 80 && reliabilityRate >= 95 && medianOk && eraRate >= 50) {
    return 'PROCEED TO GEMINI EXTRACTION PROTOTYPE';
  }
  if (exactRate >= 40) {
    return 'REVISE SEARCH QUERY AND RETEST';
  }
  return 'SERPER RESULTS ARE NOT SUFFICIENT';
}

function buildMarkdownReport({ testResults, branch, commit, timestamp, summary }) {
  const sourceTypeCounts = {};
  for (const result of testResults) {
    for (const item of result.results) {
      const type = classifySourceType(item.domain);
      sourceTypeCounts[type] = (sourceTypeCounts[type] || 0) + 1;
    }
  }
  const totalSources = Object.values(sourceTypeCounts).reduce((sum, n) => sum + n, 0) || 1;
  const sourceTypeLines = Object.entries(sourceTypeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `- **${type}**: ${count} results (${pct(count, totalSources)}%)`)
    .join('\n') || '- No organic results returned across any test model.';

  const rankedByExactness = [...testResults].sort((a, b) => {
    const scoreA = (a.exactModelInTitle ? 2 : a.exactModelFound ? 1 : 0) - (a.durationMs / 100000);
    const scoreB = (b.exactModelInTitle ? 2 : b.exactModelFound ? 1 : 0) - (b.durationMs / 100000);
    return scoreB - scoreA;
  });
  const strongest = rankedByExactness.slice(0, 5);
  const weakest = rankedByExactness.slice(-5).reverse();

  const tableRows = testResults.map((r) => {
    const bestResult = bestLookingResult(r);
    return `| ${r.brand} | ${r.model} | ${r.category || 'unknown'} | ${r.durationMs} ms | ${r.status} | ${r.exactModelFound ? 'Yes' : 'No'} | ${r.exactModelInTitle ? 'Yes' : 'No'} | ${r.manufacturerDomainFound ? 'Yes' : 'No'} | ${r.yearMentionFound ? 'Yes' : 'No'} | ${bestResult} |`;
  }).join('\n');

  const finalRecommendation = recommendation(summary);

  return `# Serper Model-Search Proof of Concept Report

**Generated:** ${timestamp}
**Branch:** ${branch}
**Commit:** ${commit}

## Executive Summary

This test evaluates whether a single, bounded (3s timeout, 1 query, no retries) Serper Google Search
request per model returns search-result content useful enough to justify a follow-on Gemini
extraction prototype for the \`/api/refine-serial-date\` model-era research step.

${finalRecommendation === 'PROCEED TO GEMINI EXTRACTION PROTOTYPE'
    ? 'Serper appears viable for a limited live-search proof of concept under the evaluation targets used here.'
    : finalRecommendation === 'REVISE SEARCH QUERY AND RETEST'
      ? 'Serper shows partial promise, but result quality or latency did not clear the evaluation targets used here; a revised query strategy is worth testing before further investment.'
      : 'Serper results did not clear the evaluation targets used here for this query strategy and sample.'}

This test evaluates search-result usefulness and latency only, not final model-year accuracy, and
Serper is not being represented as production-ready.

## Overall Metrics

| Metric | Value |
| --- | --- |
| Total models tested | ${summary.totalModels} |
| Successful requests | ${summary.successCount} |
| Timeouts | ${summary.timeoutCount} |
| Provider errors | ${summary.errorCount} |
| Median latency | ${summary.medianDurationMs} ms |
| P95 latency | ${summary.p95DurationMs} ms |
| Fastest request | ${summary.fastestDurationMs} ms |
| Slowest request | ${summary.slowestDurationMs} ms |
| % completed under 2s | ${summary.pctUnder2s}% |
| % completed under 3s | ${summary.pctUnder3s}% |
| % with exact-model match | ${summary.pctExactModelFound}% |
| % with exact model in title | ${summary.pctExactModelInTitle}% |
| % with official manufacturer result | ${summary.pctManufacturerDomainFound}% |
| % with at least one visible year mention | ${summary.pctYearMentionFound}% |

## Per-Model Results

| Brand | Model | Category | Latency | Status | Exact model | Exact title match | Manufacturer result | Year visible | Best-looking result |
| ----- | ----- | -------- | ------: | ------ | ----------- | ------------------ | -------------------- | ------------- | -------------------- |
${tableRows}

## Five Strongest Model Searches

${strongest.map((r, i) => `${i + 1}. **${r.brand} ${r.model}** — ${r.status}, ${r.durationMs} ms, exact-title: ${r.exactModelInTitle ? 'yes' : 'no'}, manufacturer result: ${r.manufacturerDomainFound ? 'yes' : 'no'}`).join('\n')}

## Five Weakest Model Searches

${weakest.map((r, i) => `${i + 1}. **${r.brand} ${r.model}** — ${r.status}, ${r.durationMs} ms, exact match: ${r.exactModelFound ? 'yes' : 'no'}${r.errorMessage ? `, error: ${r.errorMessage}` : ''}`).join('\n')}

## Source-Quality Observations

${sourceTypeLines}

## Important Limitations

- A visible date does not automatically prove manufacture year.
- A manual date may only establish that a document existed by that date.
- A retailer listing date does not establish the complete production range.
- Parts availability does not prove the item was manufactured that year.
- This test evaluates search-result usefulness and latency, not final model-year accuracy.

## Recommendation

**${finalRecommendation}**

Evaluation targets used (not guarantees): ≥80% exact-model match rate, ≥95% of requests succeeding or
stopping within 3 seconds, median latency below 2.5s, and ≥50% of models exposing potentially useful
era-related information in search results.
`;
}

main().catch((error) => {
  console.error('Serper model-search POC failed:', error?.message || error);
  process.exitCode = 1;
});
