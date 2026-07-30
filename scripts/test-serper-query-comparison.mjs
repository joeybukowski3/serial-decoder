#!/usr/bin/env node
/**
 * Isolated second-stage Serper proof-of-concept: compares three query
 * strategies (baseline / era-focused / document-focused) across the same 20
 * test models used in the first POC.
 *
 * Makes exactly 3 bounded Serper requests per model (60 total, no retries,
 * no webpage fetching) and writes two reports:
 *   artifacts/serper-query-comparison-results.json
 *   artifacts/serper-query-comparison-report.md
 *
 * Reuses the existing lib/serper client unmodified. The client's `category`
 * field is concatenated raw after the two quoted brand/model terms, so the
 * era-focused and document-focused strategies are expressed by passing the
 * desired suffix phrase as `category` — no client changes required.
 *
 * This script is NOT wired into any production workflow, does not call
 * Gemini/OpenAI, does not fetch webpages, and never logs or writes the
 * SERPER_API_KEY value. Run explicitly via:
 *   npm run test:serper-query-comparison
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
const JSON_REPORT_PATH = join(ARTIFACTS_DIR, 'serper-query-comparison-results.json');
const MD_REPORT_PATH = join(ARTIFACTS_DIR, 'serper-query-comparison-report.md');
const TIMEOUT_MS = 3000;
const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 1980;

loadEnvLocal();

if (!process.env.SERPER_API_KEY) {
  console.error('SERPER_API_KEY is not configured.');
  process.exit(1);
}

// Query strategies. `categoryOverride`, when present, replaces the model's
// real category as the raw suffix term passed into the existing client's
// buildModelQuery() — this is how era/document phrasing is expressed
// without touching lib/serper/model-search.js.
const STRATEGIES = [
  { key: 'baseline', label: 'Baseline', categoryOverride: null },
  { key: 'era_focused', label: 'Era-focused', categoryOverride: 'introduced OR released OR discontinued' },
  { key: 'document_focused', label: 'Document-focused', categoryOverride: 'manual specifications' },
];

// { brand, model, category, source, candidateYears, expectedYear?, isBenchmarkOnly }
// candidateYears sourced from tests/fixtures/serial-refinement-cases.json where
// a matching case exists for the exact model string. For the 12 models with no
// repo fixture, candidateYears are clearly marked benchmark-only decade
// placeholders (NOT real decoder output) spaced 10 years apart so the
// "potentially useful" era-narrowing check has something to evaluate against.
const TEST_MODELS = [
  { brand: 'LG', model: 'WM3470HWA', category: 'washer', source: 'repo-fixture', candidateYears: [2004, 2014, 2024], expectedYear: 2014, isBenchmarkOnly: false },
  { brand: 'Whirlpool', model: 'WMH31017HS12', category: 'microwave', source: 'repo-fixture', candidateYears: [1994, 2024], expectedYear: 2024, isBenchmarkOnly: false },
  { brand: 'Frigidaire', model: 'FFTR2045VS0', category: 'refrigerator', source: 'repo-fixture', candidateYears: [1991, 2001, 2011, 2021], expectedYear: 2021, isBenchmarkOnly: false },
  { brand: 'Frigidaire', model: 'FFTR2045VSO', category: 'refrigerator', source: 'repo-fixture (revision-suffix variant: O vs 0)', candidateYears: [1991, 2001, 2011, 2021], expectedYear: 2021, isBenchmarkOnly: false },
  { brand: 'GE', model: 'JB258DM1WW', category: 'range', source: 'repo-fixture', candidateYears: [1983, 1995, 2007, 2019], expectedYear: 2019, isBenchmarkOnly: false },
  { brand: 'GE', model: 'PFD87ESPV0RS', category: 'refrigerator', source: 'repo-fixture (revision-suffix variant)', candidateYears: [1977, 1989, 2001, 2013, 2025], expectedYear: 2025, isBenchmarkOnly: false },
  { brand: 'GE', model: 'PFD87ESPVRS', category: 'refrigerator', source: 'repo-fixture (base model, no suffix)', candidateYears: [1977, 1989, 2001, 2013, 2025], expectedYear: 2025, isBenchmarkOnly: false },
  { brand: 'Vizio', model: 'VW32L HDTV10A', category: 'television', source: 'repo-fixture (older model, ~2007)', candidateYears: [2007], expectedYear: 2007, isBenchmarkOnly: false },
  { brand: 'GE', model: 'GNE27JYMFS', category: 'refrigerator', source: 'added (publicly recognizable, no repo fixture)', candidateYears: [2006, 2016, 2026], isBenchmarkOnly: true },
  { brand: 'GE', model: 'GTS18GTHWW', category: 'refrigerator', source: 'added (older top-freezer model, no repo fixture)', candidateYears: [1996, 2006, 2016], isBenchmarkOnly: true },
  { brand: 'Whirlpool', model: 'WRF767SDHZ', category: 'refrigerator', source: 'added (common current model, no repo fixture)', candidateYears: [2006, 2016, 2026], isBenchmarkOnly: true },
  { brand: 'Maytag', model: 'MVWC565FW', category: 'washer', source: 'added (common current model, no repo fixture)', candidateYears: [2006, 2016, 2026], isBenchmarkOnly: true },
  { brand: 'Samsung', model: 'RF28R7351SR', category: 'refrigerator', source: 'added (publicly recognizable, no repo fixture)', candidateYears: [2006, 2016, 2026], isBenchmarkOnly: true },
  { brand: 'Samsung', model: 'WF45T6000AW', category: 'washer', source: 'added (common current model, no repo fixture)', candidateYears: [2006, 2016, 2026], isBenchmarkOnly: true },
  { brand: 'LG', model: 'LFXS28968S', category: 'refrigerator', source: 'added (common current model, no repo fixture)', candidateYears: [2006, 2016, 2026], isBenchmarkOnly: true },
  { brand: 'Electrolux', model: 'EI23BC36IS', category: 'refrigerator', source: 'added (common current model, no repo fixture)', candidateYears: [2006, 2016, 2026], isBenchmarkOnly: true },
  { brand: 'KitchenAid', model: 'KRFF305ESS', category: 'refrigerator', source: 'added (less-common brand variant, no repo fixture)', candidateYears: [2006, 2016, 2026], isBenchmarkOnly: true },
  { brand: 'Carrier', model: '24ABC636A003', category: 'HVAC condenser', source: 'added (HVAC, no repo fixture)', candidateYears: [2006, 2016, 2026], isBenchmarkOnly: true },
  { brand: 'Trane', model: '4TTR3036A1000AA', category: 'HVAC condenser', source: 'added (HVAC, no repo fixture)', candidateYears: [2006, 2016, 2026], isBenchmarkOnly: true },
  { brand: 'Rheem', model: 'RA1424AJ1NA', category: 'HVAC condenser', source: 'added (HVAC, no repo fixture — distinct from fixture Rheem RHA251405618)', candidateYears: [2006, 2016, 2026], isBenchmarkOnly: true },
];

const MANUFACTURER_DOMAIN_LOOKUP = new Set([
  'geappliances.com', 'ge.com', 'whirlpool.com', 'maytag.com', 'kitchenaid.com',
  'samsung.com', 'lg.com', 'frigidaire.com', 'electroluxappliances.com', 'electrolux.com',
  'vizio.com', 'carrier.com', 'trane.com', 'lennox.com', 'goodmanmfg.com', 'rheem.com',
  'ruud.com', 'americanstandardair.com', 'york.com',
]);

const RETAILER_HINTS = ['bestbuy', 'homedepot', 'lowes', 'amazon', 'walmart', 'abt.com', 'appliancesconnection', 'ajmadison', 'standardtvandappliance', 'qualityapplianceandtvs'];
const MANUAL_HINTS = ['manualslib', 'manua.ls', 'productmanualguide', 'manualzz', 'manuals', '.pdf'];
const PARTS_HINTS = ['repairclinic', 'partselect', 'appliancepartspros', 'encompass', 'searspartsdirect'];
const MARKETPLACE_HINTS = ['ebay', 'craigslist', 'offerup', 'mercari'];
const FORUM_HINTS = ['reddit', 'forum', 'community', 'justanswer', 'fixya', 'appliantology'];

// Words whose presence in title/snippet suggest era- or documentation-relevant
// content, independent of whether a year was also found.
const ERA_KEYWORDS = ['introduced', 'released', 'available', 'discontinued', 'launched', 'model year', 'specifications', 'manual'];

function classifySourceType(domain) {
  if (!domain) return 'forum-or-other';
  if (domain.includes('.gov')) return 'other';
  if (MANUFACTURER_DOMAIN_LOOKUP.has(domain)) return 'manufacturer';
  if (RETAILER_HINTS.some((hint) => domain.includes(hint))) return 'retailer';
  if (MANUAL_HINTS.some((hint) => domain.includes(hint))) return 'manual-or-document-host';
  if (PARTS_HINTS.some((hint) => domain.includes(hint))) return 'parts-site';
  if (MARKETPLACE_HINTS.some((hint) => domain.includes(hint))) return 'marketplace';
  if (FORUM_HINTS.some((hint) => domain.includes(hint))) return 'forum-or-other';
  return 'forum-or-other';
}

function isManualOrPdf(result) {
  const link = String(result.link || '').toLowerCase();
  const domain = result.domain || '';
  return MANUAL_HINTS.some((hint) => domain.includes(hint) || link.includes(hint));
}

function isProductPage(result) {
  const type = classifySourceType(result.domain);
  return type === 'manufacturer' || type === 'retailer';
}

function isRetailerResult(result) {
  return classifySourceType(result.domain) === 'retailer';
}

function containsEraKeyword(result) {
  const text = `${result.title} ${result.snippet}`.toLowerCase();
  return ERA_KEYWORDS.some((word) => text.includes(word));
}

/**
 * Extracts plausible 4-digit years (MIN_YEAR..CURRENT_YEAR) from a result's
 * title/snippet/date, excluding tokens immediately preceded by a copyright
 * marker (© / "copyright") since a copyright year is explicitly disallowed
 * as production-year evidence by this benchmark's methodology. Results from
 * marketplace, parts-site, and forum-or-other domains are excluded entirely
 * from year extraction, since those year signals are most likely listing,
 * parts-availability, or review-publication dates rather than model-existence
 * evidence — also explicitly disallowed.
 *
 * @param {{title:string, snippet:string, date:string|null, domain:string|null}} result
 * @returns {number[]} deduplicated plausible years found in eligible text
 */
function extractEligibleYears(result) {
  const sourceType = classifySourceType(result.domain);
  if (sourceType === 'marketplace' || sourceType === 'parts-site' || sourceType === 'forum-or-other') {
    return [];
  }
  const combined = [result.title, result.snippet, result.date].filter(Boolean).join(' | ');
  const years = new Set();
  const pattern = /(?:©\s*|copyright\s+)?(19[89]\d|20[0-9]\d)/gi;
  let match;
  while ((match = pattern.exec(combined)) !== null) {
    const isCopyright = match[0].toLowerCase().startsWith('©') || match[0].toLowerCase().startsWith('copyright');
    if (isCopyright) continue;
    const year = Number.parseInt(match[1], 10);
    if (year >= MIN_YEAR && year <= CURRENT_YEAR) years.add(year);
  }
  return [...years];
}

/**
 * Conservative, deterministic "potentially useful" check: does any eligible
 * extracted year land close enough to one of the model's candidate years to
 * plausibly help distinguish it from the others? Never claims proof of
 * manufacture year — only that the visible evidence could narrow candidates.
 *
 * Tolerance differs by candidate-year provenance:
 *  - real repo-fixture candidateYears: ±1 year (fixture candidates are tight,
 *    decoder-meaningful values; a ±1 match is a real signal)
 *  - benchmark-only decade placeholders: ±5 years (these are synthetic decade
 *    markers, not real decoder output, so only decade-level proximity is
 *    meaningful — and this must never be reported as a real decoder result)
 *
 * @param {number[]} eligibleYears years pooled from all 3 strategies' results
 * @param {number[]} candidateYears
 * @param {boolean} isBenchmarkOnly
 * @returns {{applicable: boolean, potentiallyUseful: boolean, matchedYear: number|null, matchedCandidate: number|null}}
 */
function evaluatePotentiallyUseful(eligibleYears, candidateYears, isBenchmarkOnly) {
  if (!Array.isArray(candidateYears) || candidateYears.length < 2) {
    return { applicable: false, potentiallyUseful: false, matchedYear: null, matchedCandidate: null };
  }
  const tolerance = isBenchmarkOnly ? 5 : 1;
  for (const year of eligibleYears) {
    for (const candidate of candidateYears) {
      if (Math.abs(year - candidate) <= tolerance) {
        return { applicable: true, potentiallyUseful: true, matchedYear: year, matchedCandidate: candidate };
      }
    }
  }
  return { applicable: true, potentiallyUseful: false, matchedYear: null, matchedCandidate: null };
}

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

async function main() {
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const { branch, commit } = gitInfo();
  const timestamp = new Date().toISOString();

  const modelResults = [];
  const totalRequests = TEST_MODELS.length * STRATEGIES.length;
  let requestIndex = 0;
  console.log(`Running Serper query-comparison POC — ${TEST_MODELS.length} models x ${STRATEGIES.length} strategies = ${totalRequests} requests, ${TIMEOUT_MS}ms timeout each.\n`);

  for (const testCase of TEST_MODELS) {
    const byStrategy = {};
    const allEligibleYears = [];

    for (const strategy of STRATEGIES) {
      requestIndex += 1;
      const category = strategy.categoryOverride ?? testCase.category;
      const result = await searchModelWithSerper(
        { brand: testCase.brand, model: testCase.model, category, timeoutMs: TIMEOUT_MS },
      );
      byStrategy[strategy.key] = result;

      const label = `[${requestIndex}/${totalRequests}] ${testCase.brand} ${testCase.model} (${strategy.label})`;
      if (result.status === 'success') {
        console.log(`${label} — success — ${result.durationMs} ms — ${result.resultCount} results`);
        for (const r of result.results) {
          allEligibleYears.push(...extractEligibleYears(r));
        }
      } else {
        console.log(`${label} — ${result.status} — ${result.durationMs} ms`);
      }
    }

    const usefulness = evaluatePotentiallyUseful(allEligibleYears, testCase.candidateYears, testCase.isBenchmarkOnly);

    modelResults.push({
      brand: testCase.brand,
      model: testCase.model,
      category: testCase.category,
      source: testCase.source,
      candidateYears: testCase.candidateYears,
      expectedYear: testCase.expectedYear ?? null,
      isBenchmarkOnly: testCase.isBenchmarkOnly,
      byStrategy,
      eligibleYearsFound: [...new Set(allEligibleYears)].sort((a, b) => a - b),
      usefulness,
    });
  }

  writeReports({ modelResults, branch, commit, timestamp });
}

function strategyMetrics(modelResults, strategyKey) {
  const runs = modelResults.map((m) => m.byStrategy[strategyKey]);
  const total = runs.length;
  const successRuns = runs.filter((r) => r.status === 'success');
  const durations = runs.map((r) => r.durationMs);
  const allResults = successRuns.flatMap((r) => r.results);
  const totalResults = allResults.length || 1;

  const manualCount = allResults.filter(isManualOrPdf).length;
  const productPageCount = allResults.filter(isProductPage).length;
  const retailerCount = allResults.filter(isRetailerResult).length;
  const eraKeywordCount = allResults.filter(containsEraKeyword).length;

  return {
    successRate: pct(successRuns.length, total),
    successCount: successRuns.length,
    totalRequests: total,
    medianLatencyMs: median(durations),
    p95LatencyMs: percentile(durations, 95),
    exactModelMatchRate: pct(runs.filter((r) => r.exactModelFound).length, total),
    exactModelInTitleRate: pct(runs.filter((r) => r.exactModelInTitle).length, total),
    manufacturerDomainRate: pct(runs.filter((r) => r.manufacturerDomainFound).length, total),
    visibleYearRate: pct(runs.filter((r) => r.yearMentionFound).length, total),
    manualOrPdfResultRate: pct(manualCount, totalResults),
    productPageResultRate: pct(productPageCount, totalResults),
    retailerResultRate: pct(retailerCount, totalResults),
    eraKeywordResultRate: pct(eraKeywordCount, totalResults),
  };
}

function bestStrategyForModel(model) {
  let best = null;
  let bestScore = -Infinity;
  for (const strategy of STRATEGIES) {
    const r = model.byStrategy[strategy.key];
    if (r.status !== 'success') continue;
    const score = (r.exactModelInTitle ? 3 : r.exactModelFound ? 2 : 0)
      + (r.manufacturerDomainFound ? 1 : 0)
      + (r.yearMentionFound ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = strategy;
    }
  }
  return best ? best.label : 'None succeeded';
}

function recommendation(metricsByStrategy, usefulnessRate) {
  const baseline = metricsByStrategy.baseline;
  const era = metricsByStrategy.era_focused;
  const doc = metricsByStrategy.document_focused;

  const strategies = [
    { key: 'baseline', label: 'Baseline', exact: Number(baseline.exactModelInTitleRate), era: Number(baseline.eraKeywordResultRate) },
    { key: 'era_focused', label: 'Era-focused', exact: Number(era.exactModelInTitleRate), era: Number(era.eraKeywordResultRate) },
    { key: 'document_focused', label: 'Document-focused', exact: Number(doc.exactModelInTitleRate), era: Number(doc.eraKeywordResultRate) },
  ];

  const bestExact = [...strategies].sort((a, b) => b.exact - a.exact)[0];
  const bestEra = [...strategies].sort((a, b) => b.era - a.era)[0];
  const usefulnessOk = Number(usefulnessRate) >= 40;

  if (bestExact.key === bestEra.key && bestExact.exact >= 80 && usefulnessOk) {
    return { verdict: 'PROCEED TO GEMINI EXTRACTION PROTOTYPE', primary: bestExact.label, fallback: null };
  }

  const exactMargin = bestExact.exact - Math.min(...strategies.map((s) => s.exact));
  const eraMargin = bestEra.era - Math.min(...strategies.map((s) => s.era));

  if (bestExact.key !== bestEra.key && bestExact.exact >= 70 && bestEra.era - strategies.find((s) => s.key === bestExact.key).era >= 15) {
    return { verdict: 'COMBINE TWO QUERY STRATEGIES', primary: bestExact.label, fallback: bestEra.label };
  }

  if (usefulnessOk && (exactMargin >= 10 || eraMargin >= 10)) {
    return { verdict: 'REVISE AND RETEST', primary: bestExact.label, fallback: null };
  }

  if (!usefulnessOk) {
    return { verdict: 'SEARCH SNIPPETS ARE INSUFFICIENT', primary: null, fallback: null };
  }

  return { verdict: 'REVISE AND RETEST', primary: bestExact.label, fallback: null };
}

function writeReports({ modelResults, branch, commit, timestamp }) {
  const metricsByStrategy = {
    baseline: strategyMetrics(modelResults, 'baseline'),
    era_focused: strategyMetrics(modelResults, 'era_focused'),
    document_focused: strategyMetrics(modelResults, 'document_focused'),
  };

  const applicableModels = modelResults.filter((m) => m.usefulness.applicable);
  const usefulModels = applicableModels.filter((m) => m.usefulness.potentiallyUseful);
  const usefulnessRate = pct(usefulModels.length, applicableModels.length);

  const totalRequests = modelResults.length * STRATEGIES.length;
  const estimatedCreditsUsed = totalRequests; // Serper: 1 credit per search request

  const jsonReport = {
    generatedAt: timestamp,
    gitBranch: branch,
    gitCommit: commit,
    config: {
      endpoint: 'https://google.serper.dev/search',
      timeoutMs: TIMEOUT_MS,
      numResultsRequested: 5,
      strategiesPerModel: STRATEGIES.length,
      modelCount: modelResults.length,
      totalRequests,
      estimatedCreditsUsed,
      retriesEnabled: false,
      webpageFetchingEnabled: false,
      aiExtractionEnabled: false,
    },
    strategies: STRATEGIES.map((s) => ({ key: s.key, label: s.label, categoryOverride: s.categoryOverride })),
    metricsByStrategy,
    usefulness: {
      methodology: 'Conservative: a model is "potentially useful" only when a plausible year (excluding copyright-marked years and marketplace/parts-site/forum-or-other domains) lands within tolerance of one of the model\'s candidate years. Tolerance is ±1 year for real repo-fixture candidateYears and ±5 years for benchmark-only decade placeholders. This never claims manufacture-year proof — only that visible evidence could help narrow candidates.',
      applicableModelCount: applicableModels.length,
      excludedModelCount: modelResults.length - applicableModels.length,
      excludedReason: 'candidateYears.length < 2 (nothing to distinguish)',
      potentiallyUsefulCount: usefulModels.length,
      potentiallyUsefulRate: usefulnessRate,
    },
    results: modelResults,
  };
  writeFileSync(JSON_REPORT_PATH, JSON.stringify(jsonReport, null, 2));
  writeFileSync(
    MD_REPORT_PATH,
    buildMarkdownReport({ modelResults, branch, commit, timestamp, metricsByStrategy, applicableModels, usefulModels, usefulnessRate, totalRequests, estimatedCreditsUsed }),
  );

  console.log(`\nDone. ${totalRequests} total requests across ${modelResults.length} models x ${STRATEGIES.length} strategies.`);
  console.log(`Potentially useful for era-narrowing: ${usefulModels.length}/${applicableModels.length} applicable models (${usefulnessRate}%).`);
  console.log(`Reports written to:\n  ${JSON_REPORT_PATH}\n  ${MD_REPORT_PATH}`);
}

function formatMetricsRow(label, m) {
  return `| ${label} | ${m.successRate}% | ${m.medianLatencyMs} ms | ${m.p95LatencyMs} ms | ${m.exactModelMatchRate}% | ${m.exactModelInTitleRate}% | ${m.manufacturerDomainRate}% | ${m.visibleYearRate}% | ${m.manualOrPdfResultRate}% | ${m.productPageResultRate}% | ${m.retailerResultRate}% | ${m.eraKeywordResultRate}% |`;
}

function bestResultExample(result) {
  if (!result || !result.results.length) return null;
  const preferred = result.results.find((r) => isManualOrPdf(r) || classifySourceType(r.domain) === 'manufacturer') || result.results[0];
  return preferred;
}

function buildMarkdownReport({ modelResults, branch, commit, timestamp, metricsByStrategy, applicableModels, usefulModels, usefulnessRate, totalRequests, estimatedCreditsUsed }) {
  const rankedByExactness = [...modelResults].sort((a, b) => {
    const scoreA = ['baseline', 'era_focused', 'document_focused'].reduce((acc, k) => acc + (a.byStrategy[k].exactModelInTitle ? 1 : 0), 0);
    const scoreB = ['baseline', 'era_focused', 'document_focused'].reduce((acc, k) => acc + (b.byStrategy[k].exactModelInTitle ? 1 : 0), 0);
    return scoreB - scoreA;
  });
  const strongest = rankedByExactness.slice(0, 5);
  const weakest = rankedByExactness.slice(-5).reverse();

  const comparisonTable = STRATEGIES.map((s) => formatMetricsRow(s.label, metricsByStrategy[s.key])).join('\n');

  const bestPerModelRows = modelResults.map((m) => `| ${m.brand} | ${m.model} | ${bestStrategyForModel(m)} | ${m.usefulness.applicable ? (m.usefulness.potentiallyUseful ? 'Yes' : 'No') : 'N/A (single candidate)'} |`).join('\n');

  const rec = recommendation(metricsByStrategy, usefulnessRate);

  const examples = STRATEGIES.map((s) => {
    const sampleModel = modelResults.find((m) => m.byStrategy[s.key].status === 'success' && m.byStrategy[s.key].results.length);
    if (!sampleModel) return `### ${s.label}\n\nNo successful example with results.`;
    const r = bestResultExample(sampleModel.byStrategy[s.key]);
    return `### ${s.label} — ${sampleModel.brand} ${sampleModel.model}\n\nQuery: \`${sampleModel.byStrategy[s.key].query}\`\n\n"${r.title}" — ${r.domain || 'unknown domain'}\n> ${r.snippet}`;
  }).join('\n\n');

  return `# Serper Query-Strategy Comparison Report

**Generated:** ${timestamp}
**Branch:** ${branch}
**Commit:** ${commit}

## 1. Executive Summary

This benchmark compares three Serper Google Search query strategies — baseline, era-focused, and
document-focused — across the same 20 test models used in the first Serper POC, to determine which
strategy (or combination) produces the most useful raw search-result evidence for the
\`/api/refine-serial-date\` model-era research step. Each model received exactly 3 bounded requests
(1 per strategy, 3s timeout, 5-result cap), for ${totalRequests} live requests total. No webpages were
fetched and no AI extraction (Gemini/OpenAI) was performed — this evaluates raw search-result signal only.

Of the ${applicableModels.length} models with 2+ candidate years to distinguish between, ${usefulModels.length}
(${usefulnessRate}%) showed at least one visible year in eligible search results landing close enough to a
candidate year to plausibly help narrow it down. This is evaluated conservatively: copyright years and
years sourced from marketplace, parts-site, or forum/review domains are excluded, and no claim is made that
any manufacture year has been proven.

## 2. Metrics by Query Strategy

${STRATEGIES.map((s) => {
  const m = metricsByStrategy[s.key];
  return `### ${s.label}\n\n- Success rate: ${m.successRate}%\n- Median latency: ${m.medianLatencyMs} ms | P95: ${m.p95LatencyMs} ms\n- Exact-model match: ${m.exactModelMatchRate}% | Exact model in title: ${m.exactModelInTitleRate}%\n- Manufacturer-domain result: ${m.manufacturerDomainRate}%\n- Visible year: ${m.visibleYearRate}%\n- Manual/PDF result rate: ${m.manualOrPdfResultRate}% | Product-page result rate: ${m.productPageResultRate}% | Retailer result rate: ${m.retailerResultRate}%\n- Era/spec keyword present in result: ${m.eraKeywordResultRate}%`;
}).join('\n\n')}

## 3. Side-by-Side Comparison

| Strategy | Success | Median | P95 | Exact match | Exact in title | Mfr domain | Visible year | Manual/PDF | Product page | Retailer | Era keyword |
| -------- | ------: | -----: | --: | -----------: | --------------: | ---------: | ------------: | ---------: | ------------: | -------: | -----------: |
${comparisonTable}

## 4. Per-Model Best-Performing Query

| Brand | Model | Best strategy | Potentially useful for era-narrowing |
| ----- | ----- | -------------- | ------------------------------------- |
${bestPerModelRows}

## 5. Five Strongest Cases

${strongest.map((m, i) => `${i + 1}. **${m.brand} ${m.model}** — best strategy: ${bestStrategyForModel(m)}, exact-title hits: ${['baseline', 'era_focused', 'document_focused'].filter((k) => m.byStrategy[k].exactModelInTitle).length}/3, potentially useful: ${m.usefulness.applicable ? (m.usefulness.potentiallyUseful ? 'yes' : 'no') : 'N/A'}`).join('\n')}

## 6. Five Weakest Cases

${weakest.map((m, i) => `${i + 1}. **${m.brand} ${m.model}** — best strategy: ${bestStrategyForModel(m)}, exact-title hits: ${['baseline', 'era_focused', 'document_focused'].filter((k) => m.byStrategy[k].exactModelInTitle).length}/3, potentially useful: ${m.usefulness.applicable ? (m.usefulness.potentiallyUseful ? 'yes' : 'no') : 'N/A'}`).join('\n')}

## 7. Representative Result Examples

${examples}

## 8. Estimated Credit Consumption

- Requests made this run: ${totalRequests} (${modelResults.length} models × ${STRATEGIES.length} strategies)
- Serper billing model: 1 credit per search request (no retries were performed, so this is exact, not estimated)
- Estimated credits consumed: **${estimatedCreditsUsed}**
- Combined with the first POC's 20 requests, cumulative credits consumed across both benchmarks: ${estimatedCreditsUsed + 20}

## 9. Limitations

- A visible year does not prove manufacture year; it only shows the model was potentially referenced by that
  point in time.
- Copyright dates, page-update dates, parts-availability dates, marketplace-listing dates, and
  review-publication dates are explicitly excluded from the "potentially useful" evidence pool by this
  benchmark's methodology (see Section "Usefulness methodology" in the JSON report), but the exclusion
  relies on domain classification and text heuristics, not certainty — some noise may remain.
- ${modelResults.filter((m) => m.isBenchmarkOnly).length} of ${modelResults.length} models have no real
  repo-fixture candidate years; their candidateYears are clearly marked benchmark-only decade placeholders,
  NOT actual decoder output, and results involving them should not be read as validating real-world
  decoding accuracy — only search-result usefulness patterns.
- This benchmark evaluates raw search-result signal only. No AI extraction, ranking, or synthesis was
  performed, and no webpages were fetched beyond the search-result snippets Serper itself returns.
- Sample size (20 models, 60 requests) is small; strategy rankings here are directional, not statistically
  conclusive.

## 10. Recommendation

**${rec.verdict}**${rec.primary ? `\n\nPrimary strategy: **${rec.primary}**${rec.fallback ? `, with **${rec.fallback}** as a conditional fallback query` : ''}.` : ''}

This benchmark evaluated three strategies to inform a design choice for the eventual production lookup path:
the target is one primary query, with at most one conditional fallback query — never three live searches per
production lookup. ${rec.verdict === 'COMBINE TWO QUERY STRATEGIES' ? `${rec.primary} is recommended as the primary query for exact-model/product-page discovery, with ${rec.fallback} issued only as a fallback when the primary query's results lack visible era evidence.` : rec.verdict === 'PROCEED TO GEMINI EXTRACTION PROTOTYPE' ? `${rec.primary} cleared both the exact-match and era-evidence targets used here without needing a second query.` : 'No AI extraction or production integration was implemented as part of this benchmark; this report is a decision input only.'}
`;
}

main().catch((error) => {
  console.error('Serper query-comparison POC failed:', error?.message || error);
  process.exitCode = 1;
});
