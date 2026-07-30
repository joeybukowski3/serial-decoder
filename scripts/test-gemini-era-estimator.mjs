#!/usr/bin/env node
/**
 * Third-stage isolated proof of concept: benchmarks the combined
 * local-candidate-years + local-model-DB + Serper(baseline, conditional
 * document-focused) + one fast non-grounded Gemini call pipeline across the
 * same 20 test models used in the prior two Serper benchmarks.
 *
 * Decision goal: does this estimator produce useful, plausible results
 * quickly enough for an initial production release?
 *
 * Not wired into any production endpoint. Writes:
 *   artifacts/gemini-era-estimator-results.json
 *   artifacts/gemini-era-estimator-report.md
 *
 * Never logs or writes SERPER_API_KEY / GEMINI_API_KEY values. Run via:
 *   npm run test:gemini-estimator
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvLocal } from '../lib/serper/env-loader.js';
import { runEraEstimator } from '../lib/serial-refinement/deterministic/orchestrator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const ARTIFACTS_DIR = join(REPO_ROOT, 'artifacts');
const JSON_REPORT_PATH = join(ARTIFACTS_DIR, 'gemini-era-estimator-results.json');
const MD_REPORT_PATH = join(ARTIFACTS_DIR, 'gemini-era-estimator-report.md');

loadEnvLocal();

if (!process.env.SERPER_API_KEY) {
  console.error('SERPER_API_KEY is not configured.');
  process.exit(1);
}
if (!process.env.GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY is not configured.');
  process.exit(1);
}

// Same 20-model set used in both prior Serper benchmarks. candidateYears for
// the 8 repo-fixture models come from tests/fixtures/serial-refinement-cases.json;
// the other 12 have NO real fixture and use clearly marked benchmark-only
// decade placeholders (NOT real decoder output — see isBenchmarkOnly).
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
  console.log(`Running Gemini era-estimator benchmark — ${TEST_MODELS.length} models, combined Serper+Gemini pipeline.\n`);

  for (let i = 0; i < TEST_MODELS.length; i += 1) {
    const testCase = TEST_MODELS[i];
    const result = await runEraEstimator(testCase);
    modelResults.push({ ...testCase, ...result });

    const label = `[${i + 1}/${TEST_MODELS.length}] ${testCase.brand} ${testCase.model}`;
    if (result.gemini.status === 'success' && result.output) {
      console.log(`${label} — ${result.output.resolutionType} — confidence:${result.output.confidence} — total ${result.timings.totalMs} ms (serper ${result.timings.serperMs}ms x${result.timings.serperRequestCount}, gemini ${result.timings.geminiMs}ms)`);
    } else {
      console.log(`${label} — gemini:${result.gemini.status} — total ${result.timings.totalMs} ms`);
    }
  }

  writeReports({ modelResults, branch, commit, timestamp });
}

function writeReports({ modelResults, branch, commit, timestamp }) {
  const total = modelResults.length;
  const withOutput = modelResults.filter((m) => m.gemini.status === 'success' && m.output);
  const geminiFailures = modelResults.filter((m) => m.gemini.status !== 'success');

  const resolvedSingle = withOutput.filter((m) => m.output.resolutionType === 'resolved-single');
  const narrowed = withOutput.filter((m) => m.output.resolutionType === 'narrowed');
  const unchanged = withOutput.filter((m) => m.output.resolutionType === 'unchanged');

  const confidenceCounts = { high: 0, moderate: 0, low: 0 };
  for (const m of withOutput) confidenceCounts[m.output.confidence] += 1;

  const geminiDurations = modelResults.map((m) => m.timings.geminiMs);
  const totalDurations = modelResults.map((m) => m.timings.totalMs);
  const serperRequestCounts = modelResults.map((m) => m.timings.serperRequestCount);

  const sourceTypeCounts = {};
  for (const m of withOutput) {
    for (const s of m.output.sourcesUsed) {
      sourceTypeCounts[s.type] = (sourceTypeCounts[s.type] || 0) + 1;
    }
  }

  const correctedModels = withOutput.filter((m) => m.output.corrections.length > 0);
  const benchmarkOnlyResolved = resolvedSingle.filter((m) => m.isBenchmarkOnly);

  const summary = {
    totalModels: total,
    geminiFailureCount: geminiFailures.length,
    pctResolvedSingle: pct(resolvedSingle.length, withOutput.length),
    pctNarrowed: pct(narrowed.length, withOutput.length),
    pctUnchanged: pct(unchanged.length, withOutput.length),
    confidenceDistribution: {
      high: confidenceCounts.high,
      moderate: confidenceCounts.moderate,
      low: confidenceCounts.low,
      highPct: pct(confidenceCounts.high, withOutput.length),
      moderatePct: pct(confidenceCounts.moderate, withOutput.length),
      lowPct: pct(confidenceCounts.low, withOutput.length),
    },
    medianGeminiLatencyMs: median(geminiDurations),
    p95GeminiLatencyMs: percentile(geminiDurations, 95),
    medianCombinedLatencyMs: median(totalDurations),
    p95CombinedLatencyMs: percentile(totalDurations, 95),
    medianSerperRequestsPerModel: median(serperRequestCounts),
    correctionsAppliedCount: correctedModels.length,
  };

  const jsonReport = {
    generatedAt: timestamp,
    gitBranch: branch,
    gitCommit: commit,
    config: {
      serperTimeoutMs: 3000,
      geminiTimeoutMs: 8000,
      geminiModel: modelResults[0]?.gemini?.model || 'gemini-2.5-flash',
      grounded: false,
      maxSerperRequestsPerModel: 2,
      geminiRequestsPerModel: 1,
    },
    modelCount: total,
    summary,
    sourceTypesUsed: sourceTypeCounts,
    correctedModels: correctedModels.map((m) => ({ brand: m.brand, model: m.model, corrections: m.output.corrections })),
    results: modelResults.map((m) => ({
      brand: m.brand,
      model: m.model,
      category: m.category,
      source: m.source,
      isBenchmarkOnly: m.isBenchmarkOnly,
      candidateYears: m.candidateYears,
      expectedYear: m.expectedYear ?? null,
      localModelEvidence: m.localModelEvidence,
      geminiStatus: m.gemini.status,
      geminiErrorMessage: m.gemini.errorMessage || null,
      geminiUsage: m.gemini.usage,
      timings: m.timings,
      output: m.output,
    })),
  };
  writeFileSync(JSON_REPORT_PATH, JSON.stringify(jsonReport, null, 2));
  writeFileSync(MD_REPORT_PATH, buildMarkdownReport({ modelResults, branch, commit, timestamp, summary, sourceTypeCounts, correctedModels, benchmarkOnlyResolved, withOutput }));

  console.log(`\nDone. Resolved: ${summary.pctResolvedSingle}% | Narrowed: ${summary.pctNarrowed}% | Unchanged: ${summary.pctUnchanged}%`);
  console.log(`Median combined latency: ${summary.medianCombinedLatencyMs} ms | P95: ${summary.p95CombinedLatencyMs} ms`);
  console.log(`Reports written to:\n  ${JSON_REPORT_PATH}\n  ${MD_REPORT_PATH}`);
}

function recommendation(summary) {
  const resolvedOrNarrowed = Number(summary.pctResolvedSingle) + Number(summary.pctNarrowed);
  const combinedLatencyOk = summary.p95CombinedLatencyMs != null && summary.p95CombinedLatencyMs < 6000;
  const highConfidenceReasonable = Number(summary.confidenceDistribution.highPct) <= 60; // high should be the minority, not the default
  const noSystemicFailures = summary.geminiFailureCount === 0;

  if (resolvedOrNarrowed >= 50 && combinedLatencyOk && highConfidenceReasonable && noSystemicFailures) {
    return 'PROCEED — USEFUL AND FAST ENOUGH FOR INITIAL RELEASE';
  }
  if (resolvedOrNarrowed >= 25 && noSystemicFailures) {
    return 'PROMISING — REVISE PROMPT/EVIDENCE POLICY AND RETEST';
  }
  return 'NOT YET READY — INSUFFICIENT RESOLUTION OR RELIABILITY';
}

function buildMarkdownReport({ modelResults, branch, commit, timestamp, summary, sourceTypeCounts, correctedModels, benchmarkOnlyResolved, withOutput }) {
  const sourceTypeLines = Object.entries(sourceTypeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `- **${type}**: ${count} sources`)
    .join('\n') || '- No sources cited across any model.';

  const tableRows = modelResults.map((m) => {
    const o = m.output;
    return `| ${m.brand} | ${m.model} | ${m.isBenchmarkOnly ? 'Yes' : 'No'} | ${o ? o.resolutionType : `gemini:${m.gemini.status}`} | ${o ? o.confidence : '-'} | ${o?.bestEstimateYear ?? '-'} | ${o?.candidateYearsNarrowed?.join('/') ?? '-'} | ${m.timings.totalMs} ms | ${o?.corrections?.length ? 'Yes' : 'No'} |`;
  }).join('\n');

  const finalRecommendation = recommendation(summary);

  const unreasonableFlags = [];
  for (const m of withOutput) {
    if (m.output.corrections.length > 0) {
      unreasonableFlags.push(`**${m.brand} ${m.model}**: ${m.output.corrections.join('; ')}`);
    }
  }
  if (benchmarkOnlyResolved.length) {
    unreasonableFlags.push(`${benchmarkOnlyResolved.length} model(s) resolved to a single year using benchmark-only decade placeholder candidates (not real serial-decoder output): ${benchmarkOnlyResolved.map((m) => `${m.brand} ${m.model}`).join(', ')}. These should not be read as validated decoding accuracy.`);
  }

  const reviewSection = modelResults.map((m) => {
    const o = m.output;
    return `### ${m.brand} ${m.model}${m.isBenchmarkOnly ? ' _(benchmark-only candidate years)_' : ''}

- Candidate years: ${m.candidateYears.join(', ')}${m.expectedYear ? ` (fixture expected: ${m.expectedYear})` : ''}
- Local model DB match: ${m.localModelEvidence ? `${m.localModelEvidence.start}-${m.localModelEvidence.end}${m.localModelEvidence.verifiedExact ? ' (verified exact)' : ''}` : 'none'}
- Serper requests: ${m.timings.serperRequestCount} (document-focused ${m.timings.baselineSufficient ? 'skipped — baseline sufficient' : 'run — baseline insufficient'})
- Gemini: ${m.gemini.status}, ${m.timings.geminiMs} ms
- Result: ${o ? `${o.resolutionType}, confidence ${o.confidence}, bestEstimateYear ${o.bestEstimateYear ?? 'none'}, narrowed ${o.candidateYearsNarrowed ? o.candidateYearsNarrowed.join('/') : 'none'}` : `no output (${m.gemini.errorMessage || m.gemini.status})`}
- Reasoning: ${o ? o.reasoning : 'n/a'}
- Safety corrections applied: ${o?.corrections?.length ? o.corrections.join('; ') : 'none'}`;
  }).join('\n\n');

  return `# Serper + Gemini Combined Era-Estimator Benchmark Report

**Generated:** ${timestamp}
**Branch:** ${branch}
**Commit:** ${commit}

## Product Framing

DecodeMyItem is an educational model-era estimator, not a forensic certification service. This pipeline
combines the serial decoder's own candidate years, the local model database (when it has an exact match),
Serper baseline search results, a conditional Serper document-focused follow-up, and exactly one fast
non-grounded Gemini call to produce the most useful reasonable answer supported by real evidence — with
uncertainty always labeled and a manufacture year never asserted outside the serial decoder's own candidate
years. This is enforced in code (\`lib/serial-refinement/deterministic/gemini-estimator.js: enforceEstimatorSafety\`), not just
requested in the prompt.

## Decision Goal

Determine whether this estimator produces useful, plausible results quickly enough for an initial production
release.

## Executive Summary

Across ${modelResults.length} models (${modelResults.length * 1} Gemini calls, ${modelResults.reduce((s, m) => s + m.timings.serperRequestCount, 0)} total Serper requests):

- **${summary.pctResolvedSingle}%** resolved to a single best-estimate year
- **${summary.pctNarrowed}%** narrowed to 2+ plausible candidates
- **${summary.pctUnchanged}%** were left unchanged (serial-only fallback — evidence added nothing useful)
- Confidence distribution: high ${summary.confidenceDistribution.highPct}%, moderate ${summary.confidenceDistribution.moderatePct}%, low ${summary.confidenceDistribution.lowPct}%
- Median Gemini latency: ${summary.medianGeminiLatencyMs} ms | P95: ${summary.p95GeminiLatencyMs} ms
- Median combined (Serper + Gemini) latency: ${summary.medianCombinedLatencyMs} ms | P95: ${summary.p95CombinedLatencyMs} ms
- Gemini call failures: ${summary.geminiFailureCount}/${modelResults.length}
- Code-enforced safety corrections applied (raw Gemini output exceeded what evidence supported): ${summary.correctionsAppliedCount}/${modelResults.length}

## Metrics

| Metric | Value |
| --- | --- |
| Resolved to one year | ${summary.pctResolvedSingle}% |
| Narrowed to 2+ candidates | ${summary.pctNarrowed}% |
| Unchanged (serial-only fallback) | ${summary.pctUnchanged}% |
| High confidence | ${summary.confidenceDistribution.highPct}% (${summary.confidenceDistribution.high}) |
| Moderate confidence | ${summary.confidenceDistribution.moderatePct}% (${summary.confidenceDistribution.moderate}) |
| Low confidence | ${summary.confidenceDistribution.lowPct}% (${summary.confidenceDistribution.low}) |
| Median Gemini latency | ${summary.medianGeminiLatencyMs} ms |
| P95 Gemini latency | ${summary.p95GeminiLatencyMs} ms |
| Median combined production latency | ${summary.medianCombinedLatencyMs} ms |
| P95 combined production latency | ${summary.p95CombinedLatencyMs} ms |
| Median Serper requests/model | ${summary.medianSerperRequestsPerModel} |
| Gemini failures | ${summary.geminiFailureCount} |

## Source Types Used

${sourceTypeLines}

## Individually Flagged Estimates (unreasonable / safety-corrected)

${unreasonableFlags.length ? unreasonableFlags.map((f) => `- ${f}`).join('\n') : '- None flagged.'}

## Per-Model Results (summary table)

| Brand | Model | Benchmark-only years | Resolution | Confidence | Best year | Narrowed to | Total latency | Corrected |
| ----- | ----- | --------------------- | ---------- | ---------- | --------: | ------------ | -------------: | --------- |
${tableRows}

## All Individual Model Outputs (for human review)

${reviewSection}

## Limitations

- Confidence and resolution are conservative by design and code-enforced: a manufacture year is never
  reported outside the serial decoder's candidate years, and confidence can never exceed the tier of
  evidence actually cited (marketplace/forum evidence alone can never produce a best-estimate year or high
  confidence).
- ${modelResults.filter((m) => m.isBenchmarkOnly).length} of ${modelResults.length} models used benchmark-only
  decade-placeholder candidate years (not real serial-decoder output) because no repo fixture exists for
  them; any "resolved-single" result among those models is illustrative of pipeline behavior only, not a
  validated real-world decoding accuracy claim.
- This is a single-run benchmark (20 models); Gemini output is not fully deterministic even at low
  temperature, so individual results may vary slightly between runs.
- Local model database coverage was whatever the existing local DB already contains — this benchmark did not
  add or curate any local model data.
- No webpages were fetched; Gemini reasoned only over Serper's title/snippet/domain-level evidence.
- Reasoning text is Gemini-authored; while resolutionType/confidence/bestEstimateYear are code-enforced, the
  prose explanation itself is not independently fact-checked here.

## Recommendation

**${finalRecommendation}**

Evaluation targets used (not guarantees): ≥50% of models resolved-or-narrowed, P95 combined latency under
6s, high confidence used for a minority of results (not the default), and no systemic Gemini call failures.
`;
}

main().catch((error) => {
  console.error('Gemini era-estimator benchmark failed:', error?.message || error);
  process.exitCode = 1;
});
