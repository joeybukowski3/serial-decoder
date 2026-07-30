#!/usr/bin/env node
/**
 * Fifth-stage isolated proof of concept: retests the revised relative-era
 * safety policy (lib/serial-refinement/deterministic/gemini-estimator.js) against the four
 * cases that were previously inconsistent under candidate-order permutation,
 * plus at least five strong-evidence and five weak-evidence cases from the
 * existing 20-model set, to check whether the new candidate-relative scoring
 * resolves cases the old categorical marketplace/forum-exclusion policy
 * could not, while still respecting evidence limits.
 *
 * Evidence is fetched once per model and reused across all candidate-order
 * permutations (same approach as the order-bias benchmark), so any answer
 * change vs. the prior benchmark reflects the POLICY change, not new search
 * results.
 *
 * Not wired into any production endpoint. No new search providers, no
 * webpage fetching, no changes to serial-decoding rules. Writes:
 *   artifacts/gemini-safety-policy-retest-results.json
 *   artifacts/gemini-safety-policy-retest-report.md
 *
 * Never logs or writes SERPER_API_KEY / GEMINI_API_KEY values. Run via:
 *   npm run test:gemini-policy-retest
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvLocal } from '../lib/serper/env-loader.js';
import { gatherEvidence, runGeminiEstimateOverEvidence } from '../lib/serial-refinement/deterministic/orchestrator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const ARTIFACTS_DIR = join(REPO_ROOT, 'artifacts');
const JSON_REPORT_PATH = join(ARTIFACTS_DIR, 'gemini-safety-policy-retest-results.json');
const MD_REPORT_PATH = join(ARTIFACTS_DIR, 'gemini-safety-policy-retest-report.md');

loadEnvLocal();

if (!process.env.SERPER_API_KEY) {
  console.error('SERPER_API_KEY is not configured.');
  process.exit(1);
}
if (!process.env.GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY is not configured.');
  process.exit(1);
}

// Full 20-model definitions (same as prior benchmarks), needed so any of
// them can be selected into the retest groups below with correct metadata.
const ALL_MODELS = {
  'LG|WM3470HWA': { brand: 'LG', model: 'WM3470HWA', category: 'washer', candidateYears: [2004, 2014, 2024], expectedYear: 2014, isBenchmarkOnly: false },
  'Whirlpool|WMH31017HS12': { brand: 'Whirlpool', model: 'WMH31017HS12', category: 'microwave', candidateYears: [1994, 2024], expectedYear: 2024, isBenchmarkOnly: false },
  'Frigidaire|FFTR2045VS0': { brand: 'Frigidaire', model: 'FFTR2045VS0', category: 'refrigerator', candidateYears: [1991, 2001, 2011, 2021], expectedYear: 2021, isBenchmarkOnly: false },
  'Frigidaire|FFTR2045VSO': { brand: 'Frigidaire', model: 'FFTR2045VSO', category: 'refrigerator', candidateYears: [1991, 2001, 2011, 2021], expectedYear: 2021, isBenchmarkOnly: false },
  'GE|JB258DM1WW': { brand: 'GE', model: 'JB258DM1WW', category: 'range', candidateYears: [1983, 1995, 2007, 2019], expectedYear: 2019, isBenchmarkOnly: false },
  'GE|PFD87ESPV0RS': { brand: 'GE', model: 'PFD87ESPV0RS', category: 'refrigerator', candidateYears: [1977, 1989, 2001, 2013, 2025], expectedYear: 2025, isBenchmarkOnly: false },
  'GE|PFD87ESPVRS': { brand: 'GE', model: 'PFD87ESPVRS', category: 'refrigerator', candidateYears: [1977, 1989, 2001, 2013, 2025], expectedYear: 2025, isBenchmarkOnly: false },
  'Vizio|VW32L HDTV10A': { brand: 'Vizio', model: 'VW32L HDTV10A', category: 'television', candidateYears: [2007], expectedYear: 2007, isBenchmarkOnly: false },
  'GE|GNE27JYMFS': { brand: 'GE', model: 'GNE27JYMFS', category: 'refrigerator', candidateYears: [2006, 2016, 2026], isBenchmarkOnly: true },
  'GE|GTS18GTHWW': { brand: 'GE', model: 'GTS18GTHWW', category: 'refrigerator', candidateYears: [1996, 2006, 2016], isBenchmarkOnly: true },
  'Whirlpool|WRF767SDHZ': { brand: 'Whirlpool', model: 'WRF767SDHZ', category: 'refrigerator', candidateYears: [2006, 2016, 2026], isBenchmarkOnly: true },
  'Maytag|MVWC565FW': { brand: 'Maytag', model: 'MVWC565FW', category: 'washer', candidateYears: [2006, 2016, 2026], isBenchmarkOnly: true },
  'Samsung|RF28R7351SR': { brand: 'Samsung', model: 'RF28R7351SR', category: 'refrigerator', candidateYears: [2006, 2016, 2026], isBenchmarkOnly: true },
  'Samsung|WF45T6000AW': { brand: 'Samsung', model: 'WF45T6000AW', category: 'washer', candidateYears: [2006, 2016, 2026], isBenchmarkOnly: true },
  'LG|LFXS28968S': { brand: 'LG', model: 'LFXS28968S', category: 'refrigerator', candidateYears: [2006, 2016, 2026], isBenchmarkOnly: true },
  'Electrolux|EI23BC36IS': { brand: 'Electrolux', model: 'EI23BC36IS', category: 'refrigerator', candidateYears: [2006, 2016, 2026], isBenchmarkOnly: true },
  'KitchenAid|KRFF305ESS': { brand: 'KitchenAid', model: 'KRFF305ESS', category: 'refrigerator', candidateYears: [2006, 2016, 2026], isBenchmarkOnly: true },
  'Carrier|24ABC636A003': { brand: 'Carrier', model: '24ABC636A003', category: 'HVAC condenser', candidateYears: [2006, 2016, 2026], isBenchmarkOnly: true },
  'Trane|4TTR3036A1000AA': { brand: 'Trane', model: '4TTR3036A1000AA', category: 'HVAC condenser', candidateYears: [2006, 2016, 2026], isBenchmarkOnly: true },
  'Rheem|RA1424AJ1NA': { brand: 'Rheem', model: 'RA1424AJ1NA', category: 'HVAC condenser', candidateYears: [2006, 2016, 2026], isBenchmarkOnly: true },
};

// Required retest set: previously inconsistent under candidate-order
// permutation in the prior (pre-policy-revision) benchmark.
const REQUIRED_RETEST_KEYS = ['LG|WM3470HWA', 'Samsung|WF45T6000AW', 'KitchenAid|KRFF305ESS', 'GE|GNE27JYMFS'];

// Strong-evidence cases: previously resolved cleanly with a clear,
// citable source in the earlier combined-pipeline benchmark.
const STRONG_EVIDENCE_KEYS = ['GE|GTS18GTHWW', 'Trane|4TTR3036A1000AA', 'Vizio|VW32L HDTV10A', 'GE|PFD87ESPV0RS', 'GE|PFD87ESPVRS'];

// Weak-evidence cases: previously left "unchanged" (no dates/no era signal)
// or flagged as order-inconsistent with genuinely ambiguous evidence.
const WEAK_EVIDENCE_KEYS = ['LG|WM3470HWA', 'GE|JB258DM1WW', 'Frigidaire|FFTR2045VSO', 'Carrier|24ABC636A003', 'KitchenAid|KRFF305ESS'];

const RETEST_KEYS = [...new Set([...REQUIRED_RETEST_KEYS, ...STRONG_EVIDENCE_KEYS, ...WEAK_EVIDENCE_KEYS])];

function rotate(arr, k) {
  const n = arr.length;
  const shift = ((k % n) + n) % n;
  return arr.slice(shift).concat(arr.slice(0, shift));
}

function generatePermutations(candidateYears) {
  const n = candidateYears.length;
  if (n <= 1) return [{ label: 'original', years: [...candidateYears] }];
  if (n === 2) {
    return [
      { label: 'original', years: [...candidateYears] },
      { label: 'reversed', years: [...candidateYears].reverse() },
    ];
  }
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

function gitInfo() {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: REPO_ROOT }).toString().trim();
    const commit = execSync('git rev-parse HEAD', { cwd: REPO_ROOT }).toString().trim();
    return { branch, commit };
  } catch (_) {
    return { branch: 'unknown', commit: 'unknown' };
  }
}

function pct(count, total) {
  if (!total) return '0.0';
  return ((count / total) * 100).toFixed(1);
}

async function main() {
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const { branch, commit } = gitInfo();
  const timestamp = new Date().toISOString();

  console.log(`Retesting revised relative-era safety policy — ${RETEST_KEYS.length} models (4 required + strong/weak evidence groups, overlaps counted once).\n`);

  const records = [];
  for (let i = 0; i < RETEST_KEYS.length; i += 1) {
    const key = RETEST_KEYS[i];
    const testCase = ALL_MODELS[key];
    console.log(`[${i + 1}/${RETEST_KEYS.length}] ${testCase.brand} ${testCase.model} — fetching evidence once...`);
    const evidence = await gatherEvidence(testCase);
    const permutations = generatePermutations(testCase.candidateYears);

    const runs = [];
    for (const perm of permutations) {
      const permInput = { ...testCase, candidateYears: perm.years };
      const { gemini, output, geminiMs } = await runGeminiEstimateOverEvidence(permInput, evidence, {});
      runs.push({ label: perm.label, orderedYears: perm.years, geminiStatus: gemini.status, geminiMs, usage: gemini.usage, output });
      console.log(`    [${perm.label}] years=${perm.years.join(',')} -> ${output?.resolutionType ?? gemini.status} best:${output?.bestEstimateYear ?? 'null'} conf:${output?.confidence ?? '-'} ${geminiMs}ms`);
    }

    const finalYears = runs.map((r) => r.output?.bestEstimateYear ?? null);
    const consistent = runs.length < 2 || finalYears.every((y) => y === finalYears[0]);

    records.push({
      key,
      ...testCase,
      isRequiredRetest: REQUIRED_RETEST_KEYS.includes(key),
      isStrongEvidenceGroup: STRONG_EVIDENCE_KEYS.includes(key),
      isWeakEvidenceGroup: WEAK_EVIDENCE_KEYS.includes(key),
      evidenceTimings: evidence.timings,
      runs,
      consistentAcrossOrder: consistent,
    });
  }

  writeReports({ records, branch, commit, timestamp });
}

function writeReports({ records, branch, commit, timestamp }) {
  const applicable = records.filter((r) => r.runs.length >= 2);
  const consistentCount = applicable.filter((r) => r.consistentAcrossOrder).length;

  const requiredCases = records.filter((r) => r.isRequiredRetest);
  const strongCases = records.filter((r) => r.isStrongEvidenceGroup);
  const weakCases = records.filter((r) => r.isWeakEvidenceGroup);

  const summary = {
    totalModelsRetested: records.length,
    applicableForConsistency: applicable.length,
    consistentAcrossOrderCount: consistentCount,
    pctConsistentAcrossOrder: pct(consistentCount, applicable.length),
    requiredRetestCount: requiredCases.length,
    strongEvidenceCount: strongCases.length,
    weakEvidenceCount: weakCases.length,
  };

  const jsonReport = {
    generatedAt: timestamp,
    gitBranch: branch,
    gitCommit: commit,
    policyVersion: 'relative-era-v2 (candidate-relative scoring, non-manufacturer sources eligible when dated + exact-model matched)',
    summary,
    results: records,
  };
  writeFileSync(JSON_REPORT_PATH, JSON.stringify(jsonReport, null, 2));
  writeFileSync(MD_REPORT_PATH, buildMarkdownReport({ records, branch, commit, timestamp, summary, requiredCases, strongCases, weakCases }));

  console.log(`\nDone. Consistent across order: ${summary.consistentAcrossOrderCount}/${summary.applicableForConsistency} (${summary.pctConsistentAcrossOrder}%).`);
  console.log(`Reports written to:\n  ${JSON_REPORT_PATH}\n  ${MD_REPORT_PATH}`);
}

function formatModelSection(r) {
  const groupTags = [
    r.isRequiredRetest ? 'required retest (previously inconsistent)' : null,
    r.isStrongEvidenceGroup ? 'strong-evidence case' : null,
    r.isWeakEvidenceGroup ? 'weak-evidence case' : null,
  ].filter(Boolean).join(', ');

  const runsDetail = r.runs.map((run) => {
    const o = run.output;
    const sources = o?.sourcesUsed?.length
      ? o.sourcesUsed.map((s) => `${s.title} (${s.domain || 'no domain'}, ${s.type}${s.isExactModelMatch ? ', exact-model' : ''}${s.hasDate ? ', dated' : ', undated'}${s.supportsCandidateYear ? `, supports ${s.supportsCandidateYear}` : ''}${s.ownershipAgeStatement ? ', ownership-age statement' : ''})`).join('; ')
      : 'none';
    return `- **${run.label}** order=[${run.orderedYears.join(', ')}]: ${o ? `${o.resolutionType}, confidence ${o.confidence}, bestEstimateYear ${o.bestEstimateYear ?? 'none'}, narrowed ${o.candidateYearsNarrowed ? o.candidateYearsNarrowed.join('/') : 'none'}` : `no output (${run.geminiStatus})`}, ${run.geminiMs} ms\n  - Reasoning: ${o?.reasoning || 'n/a'}\n  - Sources: ${sources}${o?.corrections?.length ? `\n  - Safety corrections: ${o.corrections.join('; ')}` : ''}`;
  }).join('\n');

  return `### ${r.brand} ${r.model}${r.isBenchmarkOnly ? ' _(benchmark-only candidate years)_' : ''}

_${groupTags}_

- Candidate years: ${r.candidateYears.join(', ')}${r.expectedYear ? ` (fixture expected: ${r.expectedYear})` : ''}
- Consistent across all candidate-order permutations: **${r.consistentAcrossOrder ? 'yes' : 'no'}**

${runsDetail}`;
}

function buildMarkdownReport({ records, branch, commit, timestamp, summary, requiredCases, strongCases, weakCases }) {
  const requiredSection = requiredCases.map(formatModelSection).join('\n\n');
  const strongOnly = strongCases.filter((r) => !r.isRequiredRetest);
  const weakOnly = weakCases.filter((r) => !r.isRequiredRetest);
  const strongSection = strongOnly.length ? strongOnly.map(formatModelSection).join('\n\n') : '_(all strong-evidence cases were already covered in the required-retest section above)_';
  const weakSection = weakOnly.length ? weakOnly.map(formatModelSection).join('\n\n') : '_(all weak-evidence cases were already covered in the required-retest section above)_';

  const overviewRows = records.map((r) => {
    const finalYears = [...new Set(r.runs.map((run) => run.output?.bestEstimateYear ?? null))];
    return `| ${r.brand} | ${r.model} | ${r.isRequiredRetest ? 'Required' : ''}${r.isStrongEvidenceGroup ? ' Strong' : ''}${r.isWeakEvidenceGroup ? ' Weak' : ''} | ${r.runs.length} | ${r.consistentAcrossOrder ? 'Yes' : 'No'} | ${finalYears.map((y) => y ?? 'null').join(' / ')} |`;
  }).join('\n');

  return `# Gemini Relative-Era Safety Policy Retest Report

**Generated:** ${timestamp}
**Branch:** ${branch}
**Commit:** ${commit}
**Policy under test:** relative-era-v2 — candidate-relative scoring (\`lib/serial-refinement/deterministic/gemini-estimator.js: enforceEstimatorSafety\`), non-manufacturer sources eligible for corroboration when dated and exact-model matched, single-year resolution allowed via 4 explicit rules (wide spacing + 1 source, 2+ independent sources, ownership-age statement, or local-DB + web agreement), contested candidates blocked.

## Objective

Retest whether the revised safety policy resolves the cases that were inconsistent under candidate-order
permutation in the prior benchmark (LG WM3470HWA, Samsung WF45T6000AW, KitchenAid KRFF305ESS, GE GNE27JYMFS),
while confirming it does not force answers when evidence is genuinely weak, and remains order-consistent for
already-strong cases.

## Executive Summary

- **${summary.pctConsistentAcrossOrder}%** (${summary.consistentAcrossOrderCount}/${summary.applicableForConsistency}) of retested models with 2+ orderings produced the **same final best-estimate year across every candidate-order permutation** under the new policy.
- ${summary.requiredRetestCount} required retest cases, ${summary.strongEvidenceCount} strong-evidence cases, ${summary.weakEvidenceCount} weak-evidence cases (${records.length} distinct models total, some cases belong to multiple groups).

## Required Retest Cases (previously inconsistent under candidate order)

${requiredSection}

## Additional Strong-Evidence Cases

${strongSection}

## Additional Weak-Evidence Cases

${weakSection}

## Consistency Overview

| Brand | Model | Group(s) | Orderings tested | Consistent across order | Final year(s) seen |
| ----- | ----- | -------- | -----------------: | ------------------------ | ------------------- |
${overviewRows}

## Limitations

- Evidence was fetched once per model and reused across permutations, so this measures ordering sensitivity
  under the new policy holding evidence fixed, not full run-to-run variance from fresh search results.
- Gemini output is not fully deterministic even at low temperature; a repeat run could show slightly
  different per-source structured fields even when the aggregate resolution is the same.
- The candidate-relative scoring rules (wide-spacing threshold of ${'8'} years, tight-spacing threshold of ${'5'} years) are explicit, documented thresholds chosen to match the product spec's examples and guidance, not empirically tuned against a larger labeled dataset.
- This is a focused retest of 12 models, not the full 20-model set; the prior order-bias benchmark remains
  the source for full-set positional statistics.
`;
}

main().catch((error) => {
  console.error('Gemini safety-policy retest failed:', error?.message || error);
  process.exitCode = 1;
});
