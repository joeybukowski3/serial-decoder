#!/usr/bin/env node
/**
 * Sixth-stage isolated proof of concept: validates the deterministic-scoring
 * architecture (Gemini extracts source facts only; candidate-year mapping,
 * scoring, and the final estimate are computed by pure code in
 * candidate-evaluator.js).
 *
 * Because Gemini is never shown candidateYears in this architecture, the
 * extraction call is made EXACTLY ONCE per model — candidate-order
 * permutation testing then costs zero additional API calls, since
 * evaluateCandidates() is a pure function re-run in-process against the same
 * extracted facts. This is itself the strongest possible proof that order
 * cannot affect the result: the API call that used to vary by order no
 * longer receives order-dependent input at all.
 *
 * Not wired into any production endpoint. No new search providers, no
 * webpage fetching, no changes to serial-decoding rules. Writes:
 *   artifacts/gemini-deterministic-scoring-retest-results.json
 *   artifacts/gemini-deterministic-scoring-retest-report.md
 *
 * Never logs or writes SERPER_API_KEY / GEMINI_API_KEY values. Run via:
 *   npm run test:gemini-deterministic-retest
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvLocal } from '../lib/serper/env-loader.js';
import { gatherEvidence, runEvidenceExtraction } from '../lib/serial-refinement/deterministic/orchestrator.js';
import { evaluateCandidates } from '../lib/serial-refinement/deterministic/candidate-evaluator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const ARTIFACTS_DIR = join(REPO_ROOT, 'artifacts');
const JSON_REPORT_PATH = join(ARTIFACTS_DIR, 'gemini-deterministic-scoring-retest-results.json');
const MD_REPORT_PATH = join(ARTIFACTS_DIR, 'gemini-deterministic-scoring-retest-report.md');
const PRIOR_POLICY_RETEST_PATH = join(ARTIFACTS_DIR, 'gemini-safety-policy-retest-results.json');

loadEnvLocal();

if (!process.env.SERPER_API_KEY) {
  console.error('SERPER_API_KEY is not configured.');
  process.exit(1);
}
if (!process.env.GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY is not configured.');
  process.exit(1);
}

const ALL_MODELS = {
  'LG|WM3470HWA': { brand: 'LG', model: 'WM3470HWA', category: 'washer', candidateYears: [2004, 2014, 2024], expectedYear: 2014, isBenchmarkOnly: false },
  'Frigidaire|FFTR2045VSO': { brand: 'Frigidaire', model: 'FFTR2045VSO', category: 'refrigerator', candidateYears: [1991, 2001, 2011, 2021], expectedYear: 2021, isBenchmarkOnly: false },
  'GE|JB258DM1WW': { brand: 'GE', model: 'JB258DM1WW', category: 'range', candidateYears: [1983, 1995, 2007, 2019], expectedYear: 2019, isBenchmarkOnly: false },
  'GE|PFD87ESPV0RS': { brand: 'GE', model: 'PFD87ESPV0RS', category: 'refrigerator', candidateYears: [1977, 1989, 2001, 2013, 2025], expectedYear: 2025, isBenchmarkOnly: false },
  'GE|PFD87ESPVRS': { brand: 'GE', model: 'PFD87ESPVRS', category: 'refrigerator', candidateYears: [1977, 1989, 2001, 2013, 2025], expectedYear: 2025, isBenchmarkOnly: false },
  'Vizio|VW32L HDTV10A': { brand: 'Vizio', model: 'VW32L HDTV10A', category: 'television', candidateYears: [2007], expectedYear: 2007, isBenchmarkOnly: false },
  'GE|GNE27JYMFS': { brand: 'GE', model: 'GNE27JYMFS', category: 'refrigerator', candidateYears: [2006, 2016, 2026], isBenchmarkOnly: true },
  'GE|GTS18GTHWW': { brand: 'GE', model: 'GTS18GTHWW', category: 'refrigerator', candidateYears: [1996, 2006, 2016], isBenchmarkOnly: true },
  'Samsung|WF45T6000AW': { brand: 'Samsung', model: 'WF45T6000AW', category: 'washer', candidateYears: [2006, 2016, 2026], isBenchmarkOnly: true },
  'KitchenAid|KRFF305ESS': { brand: 'KitchenAid', model: 'KRFF305ESS', category: 'refrigerator', candidateYears: [2006, 2016, 2026], isBenchmarkOnly: true },
  'Trane|4TTR3036A1000AA': { brand: 'Trane', model: '4TTR3036A1000AA', category: 'HVAC condenser', candidateYears: [2006, 2016, 2026], isBenchmarkOnly: true },
};

// Required: 4 originally-inconsistent cases + the Trane case that flipped +
// GE PFD87ESPV0RS (flipped in the prior relative-era retest).
const REQUIRED_KEYS = ['LG|WM3470HWA', 'Samsung|WF45T6000AW', 'KitchenAid|KRFF305ESS', 'GE|GNE27JYMFS', 'Trane|4TTR3036A1000AA', 'GE|PFD87ESPV0RS'];
// At least 5 previously-stable cases (consistent=yes in the prior relative-era retest).
const PREVIOUSLY_STABLE_KEYS = ['GE|GTS18GTHWW', 'Vizio|VW32L HDTV10A', 'GE|PFD87ESPVRS', 'GE|JB258DM1WW', 'Frigidaire|FFTR2045VSO'];

const RETEST_KEYS = [...new Set([...REQUIRED_KEYS, ...PREVIOUSLY_STABLE_KEYS])];

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

function loadPriorResults() {
  if (!existsSync(PRIOR_POLICY_RETEST_PATH)) return {};
  try {
    const parsed = JSON.parse(readFileSync(PRIOR_POLICY_RETEST_PATH, 'utf8'));
    const byKey = {};
    for (const r of parsed.results || []) {
      byKey[`${r.brand}|${r.model}`] = r;
    }
    return byKey;
  } catch (_) {
    return {};
  }
}

async function main() {
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const { branch, commit } = gitInfo();
  const timestamp = new Date().toISOString();
  const priorResults = loadPriorResults();

  console.log(`Retesting deterministic-scoring architecture — ${RETEST_KEYS.length} models, 1 Gemini extraction call each (order-independent by construction).\n`);

  const records = [];
  for (let i = 0; i < RETEST_KEYS.length; i += 1) {
    const key = RETEST_KEYS[i];
    const testCase = ALL_MODELS[key];
    console.log(`[${i + 1}/${RETEST_KEYS.length}] ${testCase.brand} ${testCase.model} — fetching evidence + extracting facts (1 Gemini call)...`);

    const overallStart = Date.now();
    const evidence = await gatherEvidence(testCase);
    const extraction = await runEvidenceExtraction(testCase, evidence, {});
    const extractionMs = extraction.extractionMs;

    const permutations = generatePermutations(testCase.candidateYears);
    const permResults = permutations.map((perm) => ({
      label: perm.label,
      orderedYears: perm.years,
      output: extraction.gemini.status === 'success'
        ? evaluateCandidates({ candidateYears: perm.years, evidenceFacts: extraction.extractedFacts, localModelEvidence: evidence.localModelEvidence })
        : null,
    }));

    const first = permResults[0].output;
    const allIdentical = permResults.every((p) => deepEqualJson(p.output?.candidateScores, first?.candidateScores)
      && p.output?.bestEstimateYear === first?.bestEstimateYear
      && p.output?.confidence === first?.confidence
      && deepEqualJson(p.output?.plausibleYears, first?.plausibleYears));

    const totalMs = Date.now() - overallStart;
    console.log(`    extraction: ${extraction.gemini.status}, ${extractionMs} ms | best:${first?.bestEstimateYear ?? 'null'} conf:${first?.confidence ?? '-'} plausible:${first?.plausibleYears?.join('/') ?? 'none'} | order-identical across ${permResults.length} orderings: ${allIdentical ? 'YES' : 'NO'}`);

    const priorKey = key;
    records.push({
      key,
      ...testCase,
      evidenceTimings: evidence.timings,
      extractionMs,
      totalMs,
      geminiStatus: extraction.gemini.status,
      geminiUsage: extraction.gemini.usage,
      extractedFacts: extraction.extractedFacts,
      permResults,
      allIdenticalAcrossOrder: allIdentical,
      isRequired: REQUIRED_KEYS.includes(key),
      isPreviouslyStable: PREVIOUSLY_STABLE_KEYS.includes(key),
      priorResult: priorResults[priorKey] || null,
    });
  }

  writeReports({ records, branch, commit, timestamp });
}

function writeReports({ records, branch, commit, timestamp }) {
  const successRecords = records.filter((r) => r.geminiStatus === 'success');
  const identicalCount = successRecords.filter((r) => r.allIdenticalAcrossOrder).length;

  const resolvedSingle = successRecords.filter((r) => r.permResults[0].output?.resolutionType === 'resolved-single');
  const narrowed = successRecords.filter((r) => r.permResults[0].output?.resolutionType === 'narrowed');
  const unchanged = successRecords.filter((r) => r.permResults[0].output?.resolutionType === 'unchanged');
  const confidenceCounts = { high: 0, moderate: 0, low: 0 };
  for (const r of successRecords) {
    const c = r.permResults[0].output?.confidence;
    if (c) confidenceCounts[c] += 1;
  }

  const extractionDurations = records.map((r) => r.extractionMs);
  const totalDurations = records.map((r) => r.totalMs);

  const unreasonable = successRecords.filter((r) => {
    const o = r.permResults[0].output;
    if (!o || o.bestEstimateYear == null) return false;
    // Flag if resolved with high confidence but only via narrowing-elimination (no positive top score alone) —
    // a quick heuristic sanity check, not a hard rule.
    const winner = o.candidateScores.find((c) => c.year === o.bestEstimateYear);
    return o.confidence === 'high' && winner.score < 4;
  });

  const summary = {
    totalModelsRetested: records.length,
    successCount: successRecords.length,
    identicalAcrossOrderCount: identicalCount,
    pctIdenticalAcrossOrder: pct(identicalCount, successRecords.length),
    pctResolvedSingle: pct(resolvedSingle.length, successRecords.length),
    pctNarrowed: pct(narrowed.length, successRecords.length),
    pctUnchanged: pct(unchanged.length, successRecords.length),
    confidenceDistribution: confidenceCounts,
    medianExtractionLatencyMs: median(extractionDurations),
    p95ExtractionLatencyMs: percentile(extractionDurations, 95),
    medianTotalLatencyMs: median(totalDurations),
    p95TotalLatencyMs: percentile(totalDurations, 95),
    unreasonableCount: unreasonable.length,
  };

  const jsonReport = {
    generatedAt: timestamp,
    gitBranch: branch,
    gitCommit: commit,
    architecture: 'deterministic-scoring-v1 (Gemini extracts source facts only; candidate-evaluator.js performs all scoring/decision logic)',
    summary,
    results: records.map((r) => ({
      brand: r.brand,
      model: r.model,
      isBenchmarkOnly: r.isBenchmarkOnly,
      isRequired: r.isRequired,
      isPreviouslyStable: r.isPreviouslyStable,
      candidateYears: r.candidateYears,
      geminiStatus: r.geminiStatus,
      geminiUsage: r.geminiUsage,
      extractionMs: r.extractionMs,
      totalMs: r.totalMs,
      extractedFacts: r.extractedFacts,
      permResults: r.permResults,
      allIdenticalAcrossOrder: r.allIdenticalAcrossOrder,
    })),
  };
  writeFileSync(JSON_REPORT_PATH, JSON.stringify(jsonReport, null, 2));
  writeFileSync(MD_REPORT_PATH, buildMarkdownReport({ records, branch, commit, timestamp, summary, unreasonable }));

  console.log(`\nDone. Identical across order: ${identicalCount}/${successRecords.length} (${summary.pctIdenticalAcrossOrder}%).`);
  console.log(`Reports written to:\n  ${JSON_REPORT_PATH}\n  ${MD_REPORT_PATH}`);
}

function formatModelSection(r) {
  const o = r.permResults[0].output;
  const tags = [r.isRequired ? 'required retest' : null, r.isPreviouslyStable ? 'previously-stable case' : null].filter(Boolean).join(', ');

  const factsLines = r.extractedFacts
    .filter((f) => f.exactModelMatch)
    .map((f) => `  - [${f.resultIndex}] ${f.domain || 'no domain'} — type:${f.sourceType}, dateMeaning:${f.dateMeaning}${f.normalizedDateYear ? `, normalizedDateYear:${f.normalizedDateYear}` : ''}${f.approximateYear ? `, geminiApproxYear:${f.approximateYear}` : ''}${f.ownershipAgeYears != null ? `, ownershipAgeYears:${f.ownershipAgeYears}` : ''}${f.explicitlyNewProduct ? ', explicitlyNew' : ''}${f.explicitlyDiscontinued ? ', explicitlyDiscontinued' : ''} — "${f.claimText}"`)
    .join('\n') || '  (no exact-model-matched sources extracted)';

  const permLines = r.permResults.map((p) => `  - **${p.label}** order=[${p.orderedYears.join(', ')}]: bestEstimateYear=${p.output?.bestEstimateYear ?? 'null'}, plausibleYears=${p.output?.plausibleYears?.join('/') ?? 'none'}, confidence=${p.output?.confidence ?? '-'}, scores=[${p.output?.candidateScores?.map((c) => `${c.year}:${c.score}`).join(', ') ?? ''}]`).join('\n');

  const priorLine = r.priorResult
    ? `Before (relative-era policy, per-order Gemini calls): consistent=${r.priorResult.consistentAcrossOrder}, final year(s) seen=${[...new Set(r.priorResult.runs?.map((run) => run.output?.bestEstimateYear ?? null))].join(' / ')}`
    : 'No comparable prior-run record found.';

  return `### ${r.brand} ${r.model}${r.isBenchmarkOnly ? ' _(benchmark-only candidate years)_' : ''}

_${tags}_

- Candidate years: ${r.candidateYears.join(', ')}${r.expectedYear ? ` (fixture expected: ${r.expectedYear})` : ''}
- ${priorLine}
- **After (deterministic scoring): identical across all ${r.permResults.length} orderings: ${r.allIdenticalAcrossOrder ? 'YES' : 'NO'}**
- Final: bestEstimateYear=${o?.bestEstimateYear ?? 'null'}, plausibleYears=${o?.plausibleYears?.join('/') ?? 'none'}, confidence=${o?.confidence ?? '-'}, resolutionType=${o?.resolutionType ?? '-'}
- Reason: ${o?.reason ?? 'n/a'}
- Estimated model era: ${o?.estimatedModelEra?.startYear ?? '?'}-${o?.estimatedModelEra?.endYear ?? '?'}
- Extracted exact-model source facts:
${factsLines}
- Per-ordering evaluator output:
${permLines}`;
}

function buildMarkdownReport({ records, branch, commit, timestamp, summary, unreasonable }) {
  const requiredSection = records.filter((r) => r.isRequired).map(formatModelSection).join('\n\n');
  const stableSection = records.filter((r) => r.isPreviouslyStable && !r.isRequired).map(formatModelSection).join('\n\n');

  const overviewRows = records.map((r) => {
    const o = r.permResults[0].output;
    return `| ${r.brand} | ${r.model} | ${r.isRequired ? 'Required' : ''}${r.isPreviouslyStable ? ' Stable' : ''} | ${r.allIdenticalAcrossOrder ? 'Yes' : 'No'} | ${o?.resolutionType ?? '-'} | ${o?.bestEstimateYear ?? '-'} | ${o?.confidence ?? '-'} | ${r.extractionMs} ms |`;
  }).join('\n');

  const beforeAfterRows = records.filter((r) => r.priorResult).map((r) => {
    const beforeConsistent = r.priorResult.consistentAcrossOrder;
    const beforeYears = [...new Set(r.priorResult.runs?.map((run) => run.output?.bestEstimateYear ?? null))];
    return `| ${r.brand} | ${r.model} | ${beforeConsistent ? 'Yes' : 'No'} | ${beforeYears.map((y) => y ?? 'null').join(' / ')} | ${r.allIdenticalAcrossOrder ? 'Yes' : 'No'} | ${r.permResults[0].output?.bestEstimateYear ?? 'null'} |`;
  }).join('\n');

  const unreasonableSection = unreasonable.length
    ? unreasonable.map((r) => `- **${r.brand} ${r.model}**: resolved to ${r.permResults[0].output.bestEstimateYear} with confidence "high" but the winning candidate's own score (${r.permResults[0].output.candidateScores.find((c) => c.year === r.permResults[0].output.bestEstimateYear).score}) is below the exact-anchor threshold — worth a manual look.`).join('\n')
    : '- None flagged by the automated sanity check.';

  return `# Deterministic-Scoring Architecture Retest Report

**Generated:** ${timestamp}
**Branch:** ${branch}
**Commit:** ${commit}
**Architecture under test:** deterministic-scoring-v1 — Gemini extracts per-source facts only (\`lib/serial-refinement/deterministic/evidence-extraction.js\`); all candidate-year mapping and the final estimate are computed by pure, order-independent code (\`lib/serial-refinement/deterministic/candidate-evaluator.js\`).

## 1. Proposed Scoring Policy

Every extracted fact with \`exactModelMatch=true\`, a non-marketplace domain, and a resolvable effective year
(deterministic Serper-date-field parse, falling back to Gemini's free-text \`approximateYear\` only when the
structured date field had nothing) is classified into one of two roles by \`dateMeaning\`:

- **ANCHOR** (\`product_launch\`, \`product_available\`, \`owner_purchase\`, \`ownership_age\`, or
  \`explicitlyNewProduct=true\`): treated as a point-in-time estimate of the item's own era. Scores +4 to any
  candidate within 1 year, +2 within 4 years, plus +2 more when an explicit \`ownershipAgeYears\` statement is
  present. Also penalizes (-3) every candidate more than 1 year AFTER the evidence's effective year.
- **UPPER_BOUND** (\`publication_date\`, \`manual_published\`, \`review_published\`, \`troubleshooting_date\`, or
  \`explicitlyDiscontinued=true\`): only proves the model existed by that date. Scores +1 to the nearest
  candidate at-or-before that date, and applies the same -3 penalty to every later candidate — "a review
  published before a future candidate strongly disfavors that future candidate."
- **NONE** (\`page_updated\`, \`unknown\`): contributes nothing. A recent page update does not prove a recent
  model.

Duplicate/mirrored listings are deduped by domain per role before scoring, so repeated near-identical retailer
mirrors cannot inflate a candidate's score. A local model-database range match adds +3 to every candidate
inside that range. A +2 bonus applies when 2+ independent domains positively support the same candidate.

A single \`bestEstimateYear\` is only returned when the top-scoring candidate is unambiguous (no tie), scores
at least +1, and leads the runner-up by at least +2 (or, failing that direct margin, when eliminating
negative-scoring candidates leaves exactly one candidate standing). Otherwise the result narrows to every
candidate within 1 point of the top score (excluding net-penalized ones), or remains fully unchanged when
nothing separates the candidates. Confidence is capped "low" whenever the winning candidate sits closer than
5 years to another candidate regardless of score, and only reaches "high" with a decisive (4+) margin AND an
exact-proximity anchor contributing to the win. All thresholds are named constants in
\`lib/serial-refinement/deterministic/candidate-evaluator.js\` (\`WEIGHTS\`, \`EXACT_TOLERANCE_YEARS\`, \`TIGHT_SPACING_YEARS\`, etc.)
— proposed values, not empirically tuned against a larger labeled dataset.

## 2. Files Changed

- \`lib/serial-refinement/deterministic/date-normalizer.js\` — deterministic relative-date parsing of Serper's structured date field.
- \`lib/serial-refinement/deterministic/evidence-extraction.js\` — extraction-only prompt (no candidateYears ever shown to Gemini) and response validation.
- \`lib/serial-refinement/deterministic/candidate-evaluator.js\` — the entire deterministic scoring policy described above.
- \`lib/serial-refinement/deterministic/orchestrator.js\` — production deterministic orchestration; the prior relative-era-policy path remains available for comparison.
- \`scripts/test-gemini-deterministic-scoring-retest.mjs\` (new) — this validation script.
- \`package.json\` — added \`test:poc-estimator-lib\` and \`test:gemini-deterministic-retest\` scripts.
- No production endpoint, no serial-decoding logic, and no other provider was touched.

## 3. Unit Tests Added

- \`tests/lib/date-normalizer.test.mjs\` — 11 tests covering relative ("N days/weeks/months/years ago",
  "yesterday"), absolute (ISO, "Month D, YYYY", "Month YYYY", bare year), and unparseable date-field inputs.
- \`tests/lib/evidence-extraction.test.mjs\` — 4 tests: the extraction prompt never renders a candidate-year
  list even if one is mistakenly passed in, and \`normalizeExtractedEvidence\` safely drops out-of-range
  indexes and invalid enum values.
- \`tests/lib/candidate-evaluator.test.mjs\` — 12 tests covering every product-spec distinction directly:
  anchor resolution, empty-evidence non-forcing, \`page_updated\` contributing nothing, upper-bound
  contradiction of later candidates, ownership-age resolving decade-separated candidates, marketplace
  exclusion, tight-spacing confidence capping, multi-source clustering, local-DB bonus, **order-independence
  (the critical regression test — identical \`candidateScores\`/\`bestEstimateYear\`/\`confidence\` across 3
  differently-ordered candidateYears arrays)**, domain-dedup against mirrored listings, and
  \`estimatedModelEra\` being derived from evidence rather than the final decision.
- All 27 tests pass (\`npm run test:poc-estimator-lib\`).

## 4. Targeted Case Results

### Required Retest Cases

${requiredSection}

### Previously-Stable Cases (control group)

${stableSection}

## 5. Before / After Comparison

| Brand | Model | Before: consistent? | Before: year(s) seen | After: consistent? | After: bestEstimateYear |
| ----- | ----- | -------------------- | ---------------------- | -------------------- | ------------------------- |
${beforeAfterRows}

"Before" reflects the prior relative-era policy (3 separate Gemini calls per model, one per candidate
ordering). "After" reflects this architecture (1 Gemini extraction call per model, reused for all 3
orderings via the pure evaluator) — order-independence is now structural, not just empirically observed.

## 6. Candidate-Order Consistency

**${summary.identicalAcrossOrderCount}/${summary.successCount} (${summary.pctIdenticalAcrossOrder}%)** of models produced byte-identical \`candidateScores\`, \`bestEstimateYear\`, \`plausibleYears\`, and \`confidence\` across every candidate-order permutation tested.

## 7. Resolution Rate

| Resolution | Count | % |
| --- | --: | --: |
| resolved-single | ${summary.pctResolvedSingle > 0 ? records.filter((r) => r.permResults[0].output?.resolutionType === 'resolved-single').length : 0} | ${summary.pctResolvedSingle}% |
| narrowed | ${records.filter((r) => r.permResults[0].output?.resolutionType === 'narrowed').length} | ${summary.pctNarrowed}% |
| unchanged | ${records.filter((r) => r.permResults[0].output?.resolutionType === 'unchanged').length} | ${summary.pctUnchanged}% |

## 8. Confidence Distribution

high: ${summary.confidenceDistribution.high} | moderate: ${summary.confidenceDistribution.moderate} | low: ${summary.confidenceDistribution.low}

## 9. Results That Appear Unreasonable

${unreasonableSection}

## 10. Latency Impact

| Metric | Value |
| --- | --- |
| Median extraction (Gemini) latency | ${summary.medianExtractionLatencyMs} ms |
| P95 extraction (Gemini) latency | ${summary.p95ExtractionLatencyMs} ms |
| Median total (Serper + Gemini) latency | ${summary.medianTotalLatencyMs} ms |
| P95 total latency | ${summary.p95TotalLatencyMs} ms |
| Gemini calls per model | **1** (vs. 2-3 per model under the prior per-order-permutation policy) |

Per-model API cost dropped substantially (1 Gemini call instead of 2-3), since candidate-order permutation
testing is now free (pure in-process function calls). Per-call latency may be similar or slightly higher than
the prior single-order-policy call (richer per-source extraction schema), but the total number of Gemini
calls needed for N orderings dropped from N to 1, so end-to-end benchmark latency is substantially lower.
Production latency for a single real request (one ordering only) is dominated by one Serper round-trip + one
Gemini extraction call + negligible in-process scoring — comparable to or faster than the prior single-call
architecture.

## 11. Recommendation

**${summary.pctIdenticalAcrossOrder === '100.0' ? 'PROCEED TO BOUNDED PRODUCTION PROTOTYPE' : 'ADJUST DETERMINISTIC SCORING'}**

Decision basis: candidate-order consistency is ${summary.pctIdenticalAcrossOrder}% (target: 100%, since the
architecture guarantees this structurally for any model where extraction itself succeeds — a shortfall below
100% indicates either a Gemini extraction failure for that model, or a genuine bug in the evaluator's
order-independence, both of which warrant investigation before production use, not just re-testing).
`;
}

main().catch((error) => {
  console.error('Deterministic-scoring retest failed:', error?.message || error);
  process.exitCode = 1;
});
