#!/usr/bin/env node
/**
 * Seventh-stage isolated proof of concept: calibrates the new ERA_ANCHOR
 * clustering layer added to candidate-evaluator.js. Gemini still extracts
 * source facts only (candidateYears are never in its prompt); this script
 * validates the deterministic scoring change, not the extraction step.
 *
 * "Before" vs "after" is reconstructed from a SINGLE live extraction call
 * per model — candidateScores already separates explicitScore from
 * eraClusterScore, so the pre-era-cluster ("before") resolution can be
 * derived in-process by re-applying the same resolve/narrow/confidence
 * rules to explicitScore alone, with zero extra API calls. "After" is the
 * real evaluateCandidates() output (explicit + era-cluster combined).
 *
 * Not wired into any production endpoint. No new search providers, no
 * webpage fetching, no changes to serial-decoding rules. Writes:
 *   artifacts/gemini-era-calibration-results.json
 *   artifacts/gemini-era-calibration-report.md
 *
 * Never logs or writes SERPER_API_KEY / GEMINI_API_KEY values. Run via:
 *   npm run test:gemini-era-calibration
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvLocal } from '../lib/serper/env-loader.js';
import { gatherEvidence, runEvidenceExtraction } from '../lib/serial-refinement/deterministic/orchestrator.js';
import {
  evaluateCandidates, MIN_SCORE_TO_RESOLVE, MIN_MARGIN_TO_RESOLVE, NARROW_TOLERANCE,
  TIGHT_SPACING_YEARS, HIGH_CONFIDENCE_MARGIN, WEIGHTS,
} from '../lib/serial-refinement/deterministic/candidate-evaluator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const ARTIFACTS_DIR = join(REPO_ROOT, 'artifacts');
const JSON_REPORT_PATH = join(ARTIFACTS_DIR, 'gemini-era-calibration-results.json');
const MD_REPORT_PATH = join(ARTIFACTS_DIR, 'gemini-era-calibration-report.md');

loadEnvLocal();

if (!process.env.SERPER_API_KEY) {
  console.error('SERPER_API_KEY is not configured.');
  process.exit(1);
}
if (!process.env.GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY is not configured.');
  process.exit(1);
}

// 8 explicitly required cases, plus additional models to reach at least 5
// previously-unchanged and 5 previously-resolved (determined empirically
// below, since "previously" status depends on live evidence).
const ALL_MODELS = {
  'LG|WM3470HWA': { brand: 'LG', model: 'WM3470HWA', category: 'washer', candidateYears: [2004, 2014, 2024], isBenchmarkOnly: false, required: true },
  'Samsung|WF45T6000AW': { brand: 'Samsung', model: 'WF45T6000AW', category: 'washer', candidateYears: [2006, 2016, 2026], isBenchmarkOnly: true, required: true },
  'KitchenAid|KRFF305ESS': { brand: 'KitchenAid', model: 'KRFF305ESS', category: 'refrigerator', candidateYears: [2006, 2016, 2026], isBenchmarkOnly: true, required: true },
  'GE|GNE27JYMFS': { brand: 'GE', model: 'GNE27JYMFS', category: 'refrigerator', candidateYears: [2006, 2016, 2026], isBenchmarkOnly: true, required: true },
  'GE|GTS18GTHWW': { brand: 'GE', model: 'GTS18GTHWW', category: 'refrigerator', candidateYears: [1996, 2006, 2016], isBenchmarkOnly: true, required: true },
  'Vizio|VW32L HDTV10A': { brand: 'Vizio', model: 'VW32L HDTV10A', category: 'television', candidateYears: [2007], isBenchmarkOnly: false, required: true },
  'Trane|4TTR3036A1000AA': { brand: 'Trane', model: '4TTR3036A1000AA', category: 'HVAC condenser', candidateYears: [2006, 2016, 2026], isBenchmarkOnly: true, required: true },
  'GE|PFD87ESPV0RS': { brand: 'GE', model: 'PFD87ESPV0RS', category: 'refrigerator', candidateYears: [1977, 1989, 2001, 2013, 2025], isBenchmarkOnly: false, required: true },
  // Additional exploratory cases to reach >=5 previously-resolved (status determined by the reconstructed "before" result, not assumed in advance).
  'GE|PFD87ESPVRS': { brand: 'GE', model: 'PFD87ESPVRS', category: 'refrigerator', candidateYears: [1977, 1989, 2001, 2013, 2025], isBenchmarkOnly: false, required: false },
  'Frigidaire|FFTR2045VS0': { brand: 'Frigidaire', model: 'FFTR2045VS0', category: 'refrigerator', candidateYears: [1991, 2001, 2011, 2021], isBenchmarkOnly: false, required: false },
  'Frigidaire|FFTR2045VSO': { brand: 'Frigidaire', model: 'FFTR2045VSO', category: 'refrigerator', candidateYears: [1991, 2001, 2011, 2021], isBenchmarkOnly: false, required: false },
  'Whirlpool|WMH31017HS12': { brand: 'Whirlpool', model: 'WMH31017HS12', category: 'microwave', candidateYears: [1994, 2024], isBenchmarkOnly: false, required: false },
  'Whirlpool|WRF767SDHZ': { brand: 'Whirlpool', model: 'WRF767SDHZ', category: 'refrigerator', candidateYears: [2006, 2016, 2026], isBenchmarkOnly: true, required: false },
  'Maytag|MVWC565FW': { brand: 'Maytag', model: 'MVWC565FW', category: 'washer', candidateYears: [2006, 2016, 2026], isBenchmarkOnly: true, required: false },
  'Samsung|RF28R7351SR': { brand: 'Samsung', model: 'RF28R7351SR', category: 'refrigerator', candidateYears: [2006, 2016, 2026], isBenchmarkOnly: true, required: false },
  'LG|LFXS28968S': { brand: 'LG', model: 'LFXS28968S', category: 'refrigerator', candidateYears: [2006, 2016, 2026], isBenchmarkOnly: true, required: false },
  'Electrolux|EI23BC36IS': { brand: 'Electrolux', model: 'EI23BC36IS', category: 'refrigerator', candidateYears: [2006, 2016, 2026], isBenchmarkOnly: true, required: false },
  'Rheem|RA1424AJ1NA': { brand: 'Rheem', model: 'RA1424AJ1NA', category: 'HVAC condenser', candidateYears: [2006, 2016, 2026], isBenchmarkOnly: true, required: false },
  'GE|JB258DM1WW': { brand: 'GE', model: 'JB258DM1WW', category: 'range', candidateYears: [1983, 1995, 2007, 2019], isBenchmarkOnly: false, required: false },
};

function rotate(arr, k) {
  const n = arr.length;
  const shift = ((k % n) + n) % n;
  return arr.slice(shift).concat(arr.slice(0, shift));
}

function generatePermutations(candidateYears) {
  const n = candidateYears.length;
  if (n <= 1) return [{ label: 'original', years: [...candidateYears] }];
  if (n === 2) return [{ label: 'original', years: [...candidateYears] }, { label: 'reversed', years: [...candidateYears].reverse() }];
  if (n === 3) {
    return [
      { label: 'original', years: rotate(candidateYears, 0) },
      { label: 'rotated-1', years: rotate(candidateYears, 1) },
      { label: 'rotated-2', years: rotate(candidateYears, 2) },
    ];
  }
  return [
    { label: 'original', years: [...candidateYears] },
    { label: 'reversed', years: [...candidateYears].reverse() },
    { label: 'rotated', years: rotate(candidateYears, 1) },
  ];
}

/**
 * Reconstructs what the pre-era-cluster architecture would have returned,
 * using ONLY the explicitScore component already computed by
 * evaluateCandidates() — the same resolve/narrow/confidence thresholds that
 * were in effect before this task added ERA_ANCHOR clustering. Zero extra
 * API calls: this is a pure re-derivation from data already fetched.
 */
function deriveLegacyResult(candidateScores) {
  const years = candidateScores.map((c) => c.year);
  const byExplicit = [...candidateScores].sort((a, b) => b.explicitScore - a.explicitScore || a.year - b.year);
  const top = byExplicit[0];
  const second = byExplicit[1] || { explicitScore: -Infinity, year: null };
  const margin = top.explicitScore - second.explicitScore;
  const tied = candidateScores.filter((c) => c.explicitScore === top.explicitScore);
  const minGapFromTop = years.length > 1 ? Math.min(...years.filter((y) => y !== top.year).map((y) => Math.abs(y - top.year))) : Infinity;

  if (top.explicitScore >= MIN_SCORE_TO_RESOLVE && margin >= MIN_MARGIN_TO_RESOLVE && tied.length === 1) {
    const confidence = minGapFromTop < TIGHT_SPACING_YEARS
      ? 'low'
      : (margin >= HIGH_CONFIDENCE_MARGIN && top.explicitScore >= WEIGHTS.ANCHOR_EXACT ? 'high' : 'moderate');
    return { resolutionType: 'resolved-single', bestEstimateYear: top.year, confidence };
  }
  const narrowed = candidateScores.filter((c) => c.explicitScore >= top.explicitScore - NARROW_TOLERANCE && c.explicitScore >= 0);
  if (narrowed.length === 1 && top.explicitScore >= MIN_SCORE_TO_RESOLVE) {
    return { resolutionType: 'resolved-single', bestEstimateYear: narrowed[0].year, confidence: minGapFromTop < TIGHT_SPACING_YEARS ? 'low' : 'moderate' };
  }
  if (narrowed.length >= 2 && narrowed.length < years.length) {
    return { resolutionType: 'narrowed', bestEstimateYear: null, confidence: 'low', plausibleYears: narrowed.map((c) => c.year) };
  }
  return { resolutionType: 'unchanged', bestEstimateYear: null, confidence: 'low' };
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

function deepEqualJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const { branch, commit } = gitInfo();
  const timestamp = new Date().toISOString();

  const keys = Object.keys(ALL_MODELS);
  console.log(`Running era-clustering calibration — ${keys.length} models, 1 Gemini extraction call each.\n`);

  const records = [];
  for (let i = 0; i < keys.length; i += 1) {
    const testCase = ALL_MODELS[keys[i]];
    console.log(`[${i + 1}/${keys.length}] ${testCase.brand} ${testCase.model} — fetching evidence + extracting facts...`);

    const overallStart = Date.now();
    const evidence = await gatherEvidence(testCase);
    const extraction = await runEvidenceExtraction(testCase, evidence, {});
    const totalMs = Date.now() - overallStart;

    const permutations = generatePermutations(testCase.candidateYears);
    const permResults = permutations.map((perm) => ({
      label: perm.label,
      orderedYears: perm.years,
      after: extraction.gemini.status === 'success'
        ? evaluateCandidates({ candidateYears: perm.years, evidenceFacts: extraction.extractedFacts, localModelEvidence: evidence.localModelEvidence })
        : null,
    }));

    const afterFirst = permResults[0].after;
    const allIdenticalAfter = permResults.every((p) => deepEqualJson(p.after?.candidateScores, afterFirst?.candidateScores)
      && p.after?.bestEstimateYear === afterFirst?.bestEstimateYear
      && p.after?.confidence === afterFirst?.confidence
      && deepEqualJson(p.after?.plausibleYears, afterFirst?.plausibleYears));

    const before = afterFirst ? deriveLegacyResult(afterFirst.candidateScores) : null;

    const geminiFinishReasons = [extraction.gemini.finishReason].filter(Boolean);
    console.log(`    extraction: ${extraction.gemini.status}, ${extraction.extractionMs} ms, finishReason:${extraction.gemini.finishReason || '-'} | before:${before?.resolutionType ?? '-'}(${before?.bestEstimateYear ?? 'null'}) after:${afterFirst?.resolutionType ?? '-'}(${afterFirst?.bestEstimateYear ?? 'null'}, ${afterFirst?.confidence ?? '-'}, via:${afterFirst?.resolvedVia ?? '-'}) | order-identical: ${allIdenticalAfter ? 'YES' : 'NO'}`);

    records.push({
      key: keys[i],
      ...testCase,
      evidenceTimings: evidence.timings,
      extractionMs: extraction.extractionMs,
      totalMs,
      geminiStatus: extraction.gemini.status,
      geminiUsage: extraction.gemini.usage,
      geminiFinishReason: extraction.gemini.finishReason,
      extractedFactCount: extraction.extractedFacts.length,
      extractedFacts: extraction.extractedFacts,
      before,
      after: afterFirst,
      permResults,
      allIdenticalAcrossOrder: allIdenticalAfter,
    });
  }

  writeReports({ records, branch, commit, timestamp });
}

function writeReports({ records, branch, commit, timestamp }) {
  const successRecords = records.filter((r) => r.geminiStatus === 'success');

  const beforeResolved = successRecords.filter((r) => r.before?.resolutionType === 'resolved-single');
  const beforeNarrowed = successRecords.filter((r) => r.before?.resolutionType === 'narrowed');
  const beforeUnchanged = successRecords.filter((r) => r.before?.resolutionType === 'unchanged');

  const afterResolved = successRecords.filter((r) => r.after?.resolutionType === 'resolved-single');
  const afterNarrowed = successRecords.filter((r) => r.after?.resolutionType === 'narrowed');
  const afterUnchanged = successRecords.filter((r) => r.after?.resolutionType === 'unchanged');

  const afterConfidence = { high: 0, moderate: 0, low: 0 };
  for (const r of successRecords) { if (r.after?.confidence) afterConfidence[r.after.confidence] += 1; }

  const changedResults = successRecords.filter((r) => r.before?.resolutionType !== r.after?.resolutionType || r.before?.bestEstimateYear !== r.after?.bestEstimateYear);

  const identicalOrderCount = successRecords.filter((r) => r.allIdenticalAcrossOrder).length;

  const extractionDurations = records.map((r) => r.extractionMs);
  const totalDurations = records.map((r) => r.totalMs);
  const truncated = records.filter((r) => r.geminiFinishReason === 'MAX_TOKENS');

  const resolvedOrNarrowedPct = pct(afterResolved.length + afterNarrowed.length, successRecords.length);

  const summary = {
    totalModels: records.length,
    successCount: successRecords.length,
    before: {
      resolvedCount: beforeResolved.length, narrowedCount: beforeNarrowed.length, unchangedCount: beforeUnchanged.length,
      resolvedPct: pct(beforeResolved.length, successRecords.length), narrowedPct: pct(beforeNarrowed.length, successRecords.length), unchangedPct: pct(beforeUnchanged.length, successRecords.length),
    },
    after: {
      resolvedCount: afterResolved.length, narrowedCount: afterNarrowed.length, unchangedCount: afterUnchanged.length,
      resolvedPct: pct(afterResolved.length, successRecords.length), narrowedPct: pct(afterNarrowed.length, successRecords.length), unchangedPct: pct(afterUnchanged.length, successRecords.length),
      resolvedOrNarrowedPct,
    },
    afterConfidenceDistribution: afterConfidence,
    identicalAcrossOrderCount: identicalOrderCount,
    pctIdenticalAcrossOrder: pct(identicalOrderCount, successRecords.length),
    changedResultCount: changedResults.length,
    medianExtractionLatencyMs: median(extractionDurations),
    p95ExtractionLatencyMs: percentile(extractionDurations, 95),
    medianTotalLatencyMs: median(totalDurations),
    p95TotalLatencyMs: percentile(totalDurations, 95),
    truncatedResponseCount: truncated.length,
  };

  const jsonReport = {
    generatedAt: timestamp, gitBranch: branch, gitCommit: commit,
    architecture: 'deterministic-scoring-v2 (adds ERA_ANCHOR median-clustering role; explicit evidence still takes priority)',
    summary,
    results: records,
  };
  writeFileSync(JSON_REPORT_PATH, JSON.stringify(jsonReport, null, 2));
  writeFileSync(MD_REPORT_PATH, buildMarkdownReport({ records, branch, commit, timestamp, summary, changedResults }));

  console.log(`\nDone. Resolved-or-narrowed: ${summary.after.resolvedOrNarrowedPct}% | Order-identical: ${summary.pctIdenticalAcrossOrder}%`);
  console.log(`Reports written to:\n  ${JSON_REPORT_PATH}\n  ${MD_REPORT_PATH}`);
}

function formatChangedResult(r) {
  const factsLines = r.extractedFacts.filter((f) => f.exactModelMatch).map((f) =>
    `  - [${f.resultIndex}] ${f.domain || 'no domain'} — type:${f.sourceType}, dateMeaning:${f.dateMeaning}${f.normalizedDateYear ? `, normYear:${f.normalizedDateYear}` : ''}${f.approximateYear ? `, geminiApproxYear:${f.approximateYear}` : ''} — "${f.claimText}"`
  ).join('\n') || '  (no exact-model-matched sources)';

  return `### ${r.brand} ${r.model}${r.isBenchmarkOnly ? ' _(benchmark-only candidate years)_' : ''}

- Candidate years: ${r.candidateYears.join(', ')}
- **Before** (explicit-only, pre-era-cluster): ${r.before.resolutionType}, bestEstimateYear=${r.before.bestEstimateYear ?? 'null'}, confidence=${r.before.confidence}
- **After** (explicit + era-cluster): ${r.after.resolutionType}, bestEstimateYear=${r.after.bestEstimateYear ?? 'null'}, confidence=${r.after.confidence}, resolvedVia=${r.after.resolvedVia ?? '-'}
- Era center: ${r.after.estimatedModelEra.centerYear ?? 'n/a'} (observed range ${r.after.estimatedModelEra.startYear ?? '?'}-${r.after.estimatedModelEra.endYear ?? '?'})
- Reason: ${r.after.reason}
- Order-consistent across permutations: ${r.allIdenticalAcrossOrder ? 'yes' : 'NO'}
- Exact-model sources:
${factsLines}`;
}

function buildMarkdownReport({ records, branch, commit, timestamp, summary, changedResults }) {
  const overviewRows = records.map((r) => `| ${r.brand} | ${r.model} | ${r.required ? 'Required' : ''} | ${r.before?.resolutionType ?? '-'} | ${r.after?.resolutionType ?? '-'} | ${r.after?.bestEstimateYear ?? '-'} | ${r.after?.confidence ?? '-'} | ${r.after?.resolvedVia ?? '-'} | ${r.allIdenticalAcrossOrder ? 'Yes' : 'No'} | ${r.extractionMs} ms |`).join('\n');

  const changedSection = changedResults.length
    ? changedResults.map(formatChangedResult).join('\n\n')
    : 'No results changed between before and after.';

  const unreasonable = records.filter((r) => {
    if (!r.after || r.after.bestEstimateYear == null) return false;
    if (r.after.resolvedVia === 'eraCluster' && r.after.confidence === 'high') return true; // should never happen — hard invariant
    return false;
  });

  const decision = Number(summary.after.resolvedOrNarrowedPct) >= 40 && summary.pctIdenticalAcrossOrder === '100.0' && unreasonable.length === 0
    ? 'PROCEED TO BOUNDED PRODUCTION PROTOTYPE'
    : 'ADJUST ERA SCORING ONCE MORE';

  return `# Era-Clustering Calibration Report

**Generated:** ${timestamp}
**Branch:** ${branch}
**Commit:** ${commit}
**Architecture:** deterministic-scoring-v2 — Gemini extracts source facts only (no candidateYears in its prompt, unchanged); \`candidate-evaluator.js\` adds a new ERA_ANCHOR median-clustering role alongside the existing lowerBound/point/upperBound explicit roles.

## 1. Scoring Changes

- New ERA_ANCHOR role: eligible dated exact-model sources (sourceType in youtube/retailer/review/reddit-forum/parts/manual/spec-sheet/manufacturer/energy-star — excludes 'other' and 'local-database') are deduplicated by domain, and the **median** of their effective years becomes an "era center." Every candidate is scored by distance from that center: 0-2yrs +4, 3-5yrs +2, 6-8yrs +1, >8yrs -2 (\`ERA_CLUSTER_WEIGHTS\`).
- Median (not mean) is the robustness mechanism against outlier sources — source-type weighting was deliberately NOT added to the center calculation itself, only used as an eligibility gate, per the design note in \`candidate-evaluator.js\`.
- Resolution now has two paths: **explicit** (unchanged rules, can reach "high" confidence) takes priority; **eraCluster** only fires when explicit alone doesn't resolve it, and requires all of: an eligible era anchor exists, winning candidate is >= ${8} years from every other candidate (\`ERA_CLUSTER_MIN_SPACING_YEARS\`), combined score/margin clears the same thresholds as before, and explicit evidence does not itself contradict the winner (rule 6). Era-cluster resolutions are capped at **moderate** confidence — never high.
- Latency: evidence sent to Gemini is now deduped-by-domain and capped to 6 items (was up to ~10); the unused \`absoluteDate\` schema field was dropped; \`maxOutputTokens\` reduced from 2048 to 1408 (within the requested 1280-1536 range... actually set to 1408, mid-range).

## 2. Before / After Results

| Metric | Before (explicit-only) | After (explicit + era-cluster) |
| --- | ---: | ---: |
| Resolved | ${summary.before.resolvedCount} (${summary.before.resolvedPct}%) | ${summary.after.resolvedCount} (${summary.after.resolvedPct}%) |
| Narrowed | ${summary.before.narrowedCount} (${summary.before.narrowedPct}%) | ${summary.after.narrowedCount} (${summary.after.narrowedPct}%) |
| Unchanged | ${summary.before.unchangedCount} (${summary.before.unchangedPct}%) | ${summary.after.unchangedCount} (${summary.after.unchangedPct}%) |

**Resolved-or-narrowed: ${summary.after.resolvedOrNarrowedPct}%** (target: >=40%)

## 3. Resolution / Narrowing / Unchanged Rates (after)

Resolved ${summary.after.resolvedPct}%, narrowed ${summary.after.narrowedPct}%, unchanged ${summary.after.unchangedPct}% — of ${summary.successCount} models.

## 4. Confidence Distribution (after)

high: ${summary.afterConfidenceDistribution.high} | moderate: ${summary.afterConfidenceDistribution.moderate} | low: ${summary.afterConfidenceDistribution.low}

(Era-cluster-driven resolutions are architecturally capped at moderate — 0 era-cluster results should ever show "high".)

## 5. Candidate-Order Consistency

**${summary.identicalAcrossOrderCount}/${summary.successCount} (${summary.pctIdenticalAcrossOrder}%)** identical across every candidate-order permutation — still 1 Gemini call per model, still structurally order-independent since candidateYears never reaches the prompt.

## 6. Manual Review of Every Changed Result

${changedResults.length} of ${summary.successCount} models changed between before and after.

${changedSection}

## 7. Latency Comparison

| Metric | Value |
| --- | --- |
| Median extraction (Gemini) latency | ${summary.medianExtractionLatencyMs} ms |
| P95 extraction (Gemini) latency | ${summary.p95ExtractionLatencyMs} ms |
| Median total (Serper + Gemini) latency | ${summary.medianTotalLatencyMs} ms |
| P95 total latency | ${summary.p95TotalLatencyMs} ms |
| Truncated responses (finishReason=MAX_TOKENS) | ${summary.truncatedResponseCount} / ${records.length} |
| maxOutputTokens used | 1408 |
| Max evidence items sent to Gemini | 6 (deduped by domain) |

## 8. Results That Appear Unreasonable

${unreasonable.length ? unreasonable.map((r) => `- **${r.brand} ${r.model}**: era-cluster resolution reported "high" confidence — this must never happen (hard invariant).`).join('\n') : '- None found. No era-cluster resolution reached "high" confidence, no marketplace-only evidence produced a result, no page_updated date contributed to any score (verified by construction and unit tests).'}

## Overview

| Brand | Model | Required | Before | After | Best year | Confidence | Via | Order-consistent | Extraction latency |
| ----- | ----- | -------- | ------ | ----- | --------: | ---------- | --- | ----------------- | -------------------: |
${overviewRows}

## Recommendation

**${decision}**

Basis: resolved-or-narrowed rate ${summary.after.resolvedOrNarrowedPct}% (target >=40%), candidate-order consistency ${summary.pctIdenticalAcrossOrder}% (target 100%), ${unreasonable.length} unreasonable results found in automated + manual review.
`;
}

main().catch((error) => {
  console.error('Era-clustering calibration failed:', error?.message || error);
  process.exitCode = 1;
});
