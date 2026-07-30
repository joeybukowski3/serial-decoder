#!/usr/bin/env node
/**
 * Fourth-stage isolated proof of concept: candidate-order / positional-bias
 * benchmark for the combined Serper + non-grounded-Gemini era estimator.
 *
 * For each of the same 20 models used in prior benchmarks, Serper (+ local
 * model DB) evidence is fetched EXACTLY ONCE and then reused verbatim across
 * multiple Gemini calls that differ only in the ORDER the candidate years
 * are listed in the prompt. Same prompt template, model, temperature, token
 * settings, thinkingBudget:0, and timeout are used for every call — the only
 * variable under test is candidate ordering.
 *
 * Decision goal: is Gemini selecting the evidence-supported year, or showing
 * positional/middle-candidate bias?
 *
 * Not wired into any production endpoint. No new search providers, no
 * webpage fetching, no changes to serial-decoding rules. Writes:
 *   artifacts/gemini-candidate-order-bias-results.json
 *   artifacts/gemini-candidate-order-bias-report.md
 *
 * Never logs or writes SERPER_API_KEY / GEMINI_API_KEY values. Run via:
 *   npm run test:gemini-order-bias
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
const JSON_REPORT_PATH = join(ARTIFACTS_DIR, 'gemini-candidate-order-bias-results.json');
const MD_REPORT_PATH = join(ARTIFACTS_DIR, 'gemini-candidate-order-bias-report.md');
const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 1980;

loadEnvLocal();

if (!process.env.SERPER_API_KEY) {
  console.error('SERPER_API_KEY is not configured.');
  process.exit(1);
}
if (!process.env.GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY is not configured.');
  process.exit(1);
}

// Same 20-model set as the prior two Serper/Gemini benchmarks.
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

// Smaller control set: non-evenly-spaced SYNTHETIC candidate years (clearly
// benchmark-only regardless of the parent model's real-fixture status),
// reusing the SAME already-fetched evidence for that model/brand.
const CONTROL_SET = [
  { brand: 'LG', model: 'WM3470HWA', candidateYears: [2004, 2016, 2025] },
  { brand: 'GE', model: 'JB258DM1WW', candidateYears: [1985, 2007, 2019] },
  { brand: 'Vizio', model: 'VW32L HDTV10A', candidateYears: [1999, 2007, 2015] },
  { brand: 'GE', model: 'GNE27JYMFS', candidateYears: [2009, 2016, 2023] },
  { brand: 'Samsung', model: 'WF45T6000AW', candidateYears: [2011, 2018, 2025] },
  { brand: 'Trane', model: '4TTR3036A1000AA', candidateYears: [2008, 2017, 2024] },
];

function rotate(arr, k) {
  const n = arr.length;
  const shift = ((k % n) + n) % n;
  return arr.slice(shift).concat(arr.slice(0, shift));
}

/**
 * Generates candidate-order permutations. For exactly 3 candidates, uses
 * cyclic rotations (rotate0/rotate1/rotate2) — this is the ONLY scheme under
 * which every candidate appears once in every list position across the
 * permutation set, matching the worked example
 * ([2006,2016,2026] / [2026,2006,2016] / [2016,2026,2006]). A literal
 * array-reverse of a 3-element list leaves the middle element in the middle
 * position in both the original and reversed list, which would fail that
 * full-coverage guarantee — so "reversed" is implemented as a full cyclic
 * rotation for n=3, per the example, not a literal reversal.
 */
function generatePermutations(candidateYears) {
  const n = candidateYears.length;
  if (n <= 1) {
    return [{ label: 'original', years: [...candidateYears] }];
  }
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

function positionOf(year, orderedYears) {
  const index = orderedYears.indexOf(year);
  if (index === -1) return null;
  if (index === 0) return 'first';
  if (index === orderedYears.length - 1) return 'last';
  return 'middle';
}

/**
 * Lightweight heuristic (independent of Gemini) for whether the gathered
 * evidence appears to genuinely single out one candidate year: a plausible
 * 4-digit year appearing in eligible (non-marketplace/forum) result text
 * that matches exactly one candidate, within a loose tolerance.
 */
function evidenceGenuinelySupportsOneCandidate(serperResults, candidateYears) {
  const YEAR_PATTERN = /(19[89]\d|20[0-9]\d)/g;
  const found = new Set();
  for (const r of serperResults) {
    const tier = String(r.domain || '');
    const isNoisy = ['ebay', 'craigslist', 'offerup', 'mercari', 'reddit', 'forum', 'community', 'justanswer', 'fixya'].some((h) => tier.includes(h));
    if (isNoisy) continue;
    const text = `${r.title || ''} ${r.snippet || ''}`;
    let match;
    while ((match = YEAR_PATTERN.exec(text)) !== null) {
      const year = Number.parseInt(match[1], 10);
      if (year >= MIN_YEAR && year <= CURRENT_YEAR) found.add(year);
    }
  }
  const matchingCandidates = candidateYears.filter((c) => [...found].some((y) => Math.abs(y - c) <= 1));
  return { supportsOne: matchingCandidates.length === 1, matchingCandidates: matchingCandidates, allYearsFound: [...found].sort((a, b) => a - b) };
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

function sameSet(a, b) {
  if (a === null && b === null) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
}

function plausibleYearsOf(output) {
  if (!output) return null;
  if (output.bestEstimateYear !== null) return [output.bestEstimateYear];
  if (output.candidateYearsNarrowed) return output.candidateYearsNarrowed;
  return null;
}

async function runPermutationSet(baseInput, evidence, permutations, allCalls) {
  const runs = [];
  for (const perm of permutations) {
    const permInput = { ...baseInput, candidateYears: perm.years };
    const { gemini, output, geminiMs, rawParsed } = await runGeminiEstimateOverEvidence(permInput, evidence, {});
    const rawBestYear = Number.isInteger(rawParsed?.bestEstimateYear) ? rawParsed.bestEstimateYear : null;
    const run = {
      label: perm.label,
      orderedYears: perm.years,
      geminiStatus: gemini.status,
      geminiMs,
      usage: gemini.usage,
      rawParsed,
      rawBestYear,
      rawPosition: rawBestYear !== null ? positionOf(rawBestYear, perm.years) : null,
      output,
      finalPosition: output?.bestEstimateYear != null ? positionOf(output.bestEstimateYear, perm.years) : null,
    };
    runs.push(run);
    allCalls.push({ geminiMs, usage: gemini.usage, status: gemini.status, serperRequestCount: 0 });
    const label = `    [${perm.label}] years=${perm.years.join(',')} -> raw:${rawBestYear ?? 'null'}(${run.rawPosition ?? '-'}) final:${output?.bestEstimateYear ?? 'null'} conf:${output?.confidence ?? '-'} ${geminiMs}ms`;
    console.log(label);
  }
  return runs;
}

async function main() {
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const { branch, commit } = gitInfo();
  const timestamp = new Date().toISOString();

  const modelRecords = [];
  const allCalls = [];
  const serperCallTimings = [];

  console.log(`Running Gemini candidate-order bias benchmark — ${TEST_MODELS.length} models (+ ${CONTROL_SET.length} control-set cases), evidence fetched once per model.\n`);

  for (let i = 0; i < TEST_MODELS.length; i += 1) {
    const testCase = TEST_MODELS[i];
    console.log(`[${i + 1}/${TEST_MODELS.length}] ${testCase.brand} ${testCase.model} — fetching evidence once...`);
    const evidence = await gatherEvidence(testCase);
    serperCallTimings.push(evidence.timings);

    const permutations = generatePermutations(testCase.candidateYears);
    const evidenceSupport = evidenceGenuinelySupportsOneCandidate(evidence.serperResults, testCase.candidateYears);
    const mainRuns = await runPermutationSet(testCase, evidence, permutations, allCalls);

    let controlRuns = null;
    const controlCase = CONTROL_SET.find((c) => c.brand === testCase.brand && c.model === testCase.model);
    if (controlCase) {
      console.log(`  control set (synthetic non-evenly-spaced years ${controlCase.candidateYears.join(',')}):`);
      const controlPermutations = generatePermutations(controlCase.candidateYears);
      controlRuns = await runPermutationSet({ ...testCase, candidateYears: controlCase.candidateYears }, evidence, controlPermutations, allCalls);
    }

    modelRecords.push({
      ...testCase,
      evidenceTimings: evidence.timings,
      evidenceSupport,
      mainRuns,
      controlCandidateYears: controlCase ? controlCase.candidateYears : null,
      controlRuns,
    });
  }

  writeReports({ modelRecords, branch, commit, timestamp, allCalls, serperCallTimings });
}

function analyzeModel(record) {
  const runs = record.mainRuns;
  if (runs.length < 2) {
    return {
      applicable: false,
      note: 'Only one candidate year — no ordering to test.',
    };
  }
  const finalYears = runs.map((r) => r.output?.bestEstimateYear ?? null);
  const sameBestYear = finalYears.every((y) => y === finalYears[0]);
  const plausible = runs.map((r) => plausibleYearsOf(r.output));
  const samePlausible = plausible.every((p) => sameSet(p, plausible[0]));
  const confidences = runs.map((r) => r.output?.confidence ?? null);
  const sameConfidence = confidences.every((c) => c === confidences[0]);
  const orderOnlyChangedAnswer = !sameBestYear;

  return {
    applicable: true,
    sameBestYear,
    samePlausibleYears: samePlausible,
    confidenceChanged: !sameConfidence,
    orderOnlyChangedAnswer,
    finalYears,
    plausible,
    confidences,
  };
}

function tallyPositions(runs, useRaw) {
  const tally = { first: 0, middle: 0, last: 0 };
  let resolvedCount = 0;
  for (const r of runs) {
    const pos = useRaw ? r.rawPosition : r.finalPosition;
    const year = useRaw ? r.rawBestYear : r.output?.bestEstimateYear ?? null;
    if (year === null || !pos) continue;
    tally[pos] += 1;
    resolvedCount += 1;
  }
  return { tally, resolvedCount };
}

function writeReports({ modelRecords, branch, commit, timestamp, allCalls, serperCallTimings }) {
  const applicableModels = modelRecords.filter((m) => m.mainRuns.length >= 2);
  const analyses = applicableModels.map((m) => ({ record: m, analysis: analyzeModel(m) }));

  const realFixtureAnalyses = analyses.filter((a) => !a.record.isBenchmarkOnly);
  const benchmarkOnlyAnalyses = analyses.filter((a) => a.record.isBenchmarkOnly);

  function summarizeGroup(group) {
    const total = group.length;
    const sameBest = group.filter((a) => a.analysis.sameBestYear).length;
    const samePlausible = group.filter((a) => a.analysis.samePlausibleYears).length;
    const confChanged = group.filter((a) => a.analysis.confidenceChanged).length;
    const orderChangedAnswer = group.filter((a) => a.analysis.orderOnlyChangedAnswer).length;
    return {
      total,
      pctSameBestEstimateYear: pct(sameBest, total),
      pctSamePlausibleYears: pct(samePlausible, total),
      pctConfidenceChanged: pct(confChanged, total),
      pctOrderOnlyChangedAnswer: pct(orderChangedAnswer, total),
    };
  }

  const overallSummary = summarizeGroup(analyses);
  const realFixtureSummary = summarizeGroup(realFixtureAnalyses);
  const benchmarkOnlySummary = summarizeGroup(benchmarkOnlyAnalyses);

  const allMainRuns = modelRecords.flatMap((m) => m.mainRuns);
  const allControlRuns = modelRecords.flatMap((m) => m.controlRuns || []);
  const allRuns = [...allMainRuns, ...allControlRuns];

  const rawPositionsAll = tallyPositions(allRuns, true);
  const finalPositionsAll = tallyPositions(allRuns, false);
  const rawPositionsMain = tallyPositions(allMainRuns, true);
  const finalPositionsMain = tallyPositions(allMainRuns, false);
  const rawPositionsControl = tallyPositions(allControlRuns, true);
  const finalPositionsControl = tallyPositions(allControlRuns, false);

  const geminiDurations = allCalls.map((c) => c.geminiMs);
  const combinedDurations = modelRecords.flatMap((m) =>
    [...m.mainRuns, ...(m.controlRuns || [])].map((r) => m.evidenceTimings.serperMs + r.geminiMs));

  const totalGeminiCalls = allCalls.length;
  const totalSerperCalls = modelRecords.reduce((sum, m) => sum + m.evidenceTimings.serperRequestCount, 0);
  const totalInputTokens = allCalls.reduce((sum, c) => sum + (c.usage?.promptTokenCount || 0), 0);
  const totalOutputTokens = allCalls.reduce((sum, c) => sum + (c.usage?.candidatesTokenCount || 0), 0);

  const inconsistentCases = analyses.filter((a) => a.analysis.orderOnlyChangedAnswer || a.analysis.confidenceChanged);

  function positionBiasShare(tallyResult) {
    const { tally, resolvedCount } = tallyResult;
    if (!resolvedCount) return { first: '0.0', middle: '0.0', last: '0.0', resolvedCount: 0 };
    return {
      first: pct(tally.first, resolvedCount),
      middle: pct(tally.middle, resolvedCount),
      last: pct(tally.last, resolvedCount),
      resolvedCount,
    };
  }

  const positionSummary = {
    raw: {
      all: positionBiasShare(rawPositionsAll),
      main: positionBiasShare(rawPositionsMain),
      control: positionBiasShare(rawPositionsControl),
    },
    final: {
      all: positionBiasShare(finalPositionsAll),
      main: positionBiasShare(finalPositionsMain),
      control: positionBiasShare(finalPositionsControl),
    },
  };

  const maxRawShare = Math.max(
    Number(positionSummary.raw.all.first),
    Number(positionSummary.raw.all.middle),
    Number(positionSummary.raw.all.last),
  );
  const systematicBiasDetected = maxRawShare >= 55 && positionSummary.raw.all.resolvedCount >= 10;

  const weakEvidenceModels = analyses.filter((a) => !a.record.evidenceSupport.supportsOne);
  const weakEvidenceRepeatedlyResolved = weakEvidenceModels.filter((a) => {
    const finalYears = a.analysis.finalYears || [];
    return finalYears.every((y) => y !== null);
  });

  const p95Combined = percentile(combinedDurations, 95);
  const decision = decideRecommendation({
    overallSummary,
    realFixtureSummary,
    systematicBiasDetected,
    weakEvidenceRepeatedlyResolvedCount: weakEvidenceRepeatedlyResolved.length,
    weakEvidenceModelCount: weakEvidenceModels.length,
    p95Combined,
  });

  const summary = {
    modelCount: modelRecords.length,
    applicableModelCount: applicableModels.length,
    controlSetCount: modelRecords.filter((m) => m.controlRuns).length,
    overall: overallSummary,
    realFixture: realFixtureSummary,
    benchmarkOnly: benchmarkOnlySummary,
    positionBias: positionSummary,
    systematicBiasDetected,
    medianGeminiLatencyMs: median(geminiDurations),
    p95GeminiLatencyMs: percentile(geminiDurations, 95),
    medianCombinedLatencyMs: median(combinedDurations),
    p95CombinedLatencyMs: p95Combined,
    totalGeminiCalls,
    totalSerperCalls,
    totalInputTokens,
    totalOutputTokens,
    inconsistentCaseCount: inconsistentCases.length,
    weakEvidenceModelCount: weakEvidenceModels.length,
    weakEvidenceRepeatedlyResolvedCount: weakEvidenceRepeatedlyResolved.length,
  };

  const jsonReport = {
    generatedAt: timestamp,
    gitBranch: branch,
    gitCommit: commit,
    config: {
      geminiModel: allCalls[0] ? 'gemini-2.5-flash' : null,
      thinkingBudget: 0,
      temperature: 0.1,
      geminiTimeoutMs: 8000,
      serperTimeoutMs: 3000,
      evidenceFetchedOncePerModel: true,
    },
    summary,
    results: modelRecords.map((m) => ({
      brand: m.brand,
      model: m.model,
      isBenchmarkOnly: m.isBenchmarkOnly,
      candidateYears: m.candidateYears,
      expectedYear: m.expectedYear ?? null,
      evidenceSupport: m.evidenceSupport,
      evidenceTimings: m.evidenceTimings,
      mainRuns: m.mainRuns.map((r) => ({
        label: r.label,
        orderedYears: r.orderedYears,
        geminiStatus: r.geminiStatus,
        geminiMs: r.geminiMs,
        usage: r.usage,
        rawParsed: r.rawParsed,
        rawBestYear: r.rawBestYear,
        rawPosition: r.rawPosition,
        finalOutput: r.output,
        finalPosition: r.finalPosition,
      })),
      controlCandidateYears: m.controlCandidateYears,
      controlRuns: m.controlRuns ? m.controlRuns.map((r) => ({
        label: r.label,
        orderedYears: r.orderedYears,
        geminiStatus: r.geminiStatus,
        geminiMs: r.geminiMs,
        usage: r.usage,
        rawParsed: r.rawParsed,
        rawBestYear: r.rawBestYear,
        rawPosition: r.rawPosition,
        finalOutput: r.output,
        finalPosition: r.finalPosition,
      })) : null,
    })),
  };
  writeFileSync(JSON_REPORT_PATH, JSON.stringify(jsonReport, null, 2));
  writeFileSync(MD_REPORT_PATH, buildMarkdownReport({
    modelRecords, branch, commit, timestamp, summary, analyses, inconsistentCases, decision, positionSummary,
  }));

  console.log(`\nDone. ${summary.totalGeminiCalls} Gemini calls, ${summary.totalSerperCalls} Serper calls.`);
  console.log(`Same best-estimate year across order: ${overallSummary.pctSameBestEstimateYear}% | Order-only changed answer: ${overallSummary.pctOrderOnlyChangedAnswer}%`);
  console.log(`Recommendation: ${decision.verdict}`);
  console.log(`Reports written to:\n  ${JSON_REPORT_PATH}\n  ${MD_REPORT_PATH}`);
}

function decideRecommendation({ overallSummary, realFixtureSummary, systematicBiasDetected, weakEvidenceRepeatedlyResolvedCount, weakEvidenceModelCount, p95Combined }) {
  const consistencyOk = Number(overallSummary.pctSameBestEstimateYear) >= 90;
  const noBias = !systematicBiasDetected;
  const realFixtureStable = Number(realFixtureSummary.pctSameBestEstimateYear) === 100 || realFixtureSummary.total === 0;
  const weakEvidenceOk = weakEvidenceModelCount === 0 || (weakEvidenceRepeatedlyResolvedCount / weakEvidenceModelCount) < 0.5;
  const latencyOk = p95Combined != null && p95Combined < 6000;

  const allOk = consistencyOk && noBias && realFixtureStable && weakEvidenceOk && latencyOk;

  return {
    verdict: allOk ? 'PROCEED TO BOUNDED PRODUCTION PROTOTYPE' : 'ADJUST PROMPT/SAFETY POLICY AND RETEST',
    checks: { consistencyOk, noBias, realFixtureStable, weakEvidenceOk, latencyOk },
  };
}

function buildMarkdownReport({ modelRecords, branch, commit, timestamp, summary, analyses, inconsistentCases, decision, positionSummary }) {
  const flaggedSection = inconsistentCases.length
    ? inconsistentCases.map(({ record, analysis }) => {
        const runsDetail = record.mainRuns.map((r) =>
          `  - **${r.label}** order=[${r.orderedYears.join(', ')}] → raw bestEstimateYear=${r.rawBestYear ?? 'null'} (${r.rawPosition ?? '-'}), raw confidence=${r.rawParsed?.confidence ?? '-'} | final bestEstimateYear=${r.output?.bestEstimateYear ?? 'null'} (${r.finalPosition ?? '-'}), final confidence=${r.output?.confidence ?? '-'}, resolutionType=${r.output?.resolutionType ?? '-'}${r.output?.corrections?.length ? `, corrections=[${r.output.corrections.join('; ')}]` : ''}`
        ).join('\n');
        return `### ${record.brand} ${record.model}${record.isBenchmarkOnly ? ' _(benchmark-only candidate years)_' : ''}

- Candidate years supplied (canonical order): ${record.candidateYears.join(', ')}
- Evidence supplied: ${record.evidenceSupport.allYearsFound.length ? `visible years found in eligible evidence: ${record.evidenceSupport.allYearsFound.join(', ')}` : 'no plausible years found in eligible evidence'}
- Evidence genuinely supports one candidate: **${record.evidenceSupport.supportsOne ? `yes (${record.evidenceSupport.matchingCandidates.join(', ')})` : 'no / ambiguous'}**
- Same best-estimate year across all orderings: ${analysis.sameBestYear ? 'yes' : '**no — order changed the answer**'}
- Same plausible-years set across all orderings: ${analysis.samePlausibleYears ? 'yes' : 'no'}
- Confidence changed across orderings: ${analysis.confidenceChanged ? 'yes' : 'no'}
- Expected resolution given evidence: ${record.evidenceSupport.supportsOne ? 'resolve to the one supported candidate' : 'narrow (if 2+ sources cluster) or remain unchanged — should NOT resolve to a single year based on order alone'}

Runs:
${runsDetail}`;
      }).join('\n\n')
    : 'No inconsistent cases were flagged — every applicable model produced the same best-estimate year (or the same unchanged/narrowed state) across all candidate-order permutations tested.';

  const allModelsTable = modelRecords.map((m) => {
    const a = analyses.find((x) => x.record === m)?.analysis;
    return `| ${m.brand} | ${m.model} | ${m.isBenchmarkOnly ? 'Yes' : 'No'} | ${m.mainRuns.length} | ${a?.applicable ? (a.sameBestYear ? 'Yes' : 'No') : 'N/A (1 candidate)'} | ${a?.applicable ? (a.confidenceChanged ? 'Yes' : 'No') : 'N/A'} | ${m.evidenceSupport.supportsOne ? 'Yes' : 'No'} | ${m.controlRuns ? 'Yes' : 'No'} |`;
  }).join('\n');

  return `# Gemini Candidate-Order / Middle-Bias Benchmark Report

**Generated:** ${timestamp}
**Branch:** ${branch}
**Commit:** ${commit}

## Objective

Determine whether Gemini is selecting the evidence-supported manufacture-year candidate, or showing
positional/middle-candidate bias, when the same evidence is presented with candidate years listed in
different orders. This follows up directly on a pattern observed in the prior combined-pipeline benchmark,
where 11 of 12 benchmark-only (evenly decade-spaced) models resolved to the middle candidate.

## Methodology

- Serper (+ local model DB) evidence was fetched **exactly once per model** and reused verbatim across every
  candidate-order permutation for that model, so evidence is held constant and only candidate order varies.
- Same prompt template, model (\`gemini-2.5-flash\`), temperature (0.1), token settings, \`thinkingBudget: 0\`,
  and timeout were used for every call. Candidate years are never sorted before being placed in the prompt.
- For 3-candidate lists, permutations are the 3 **cyclic rotations** (not a literal array reverse), since
  that is the only 3-permutation scheme where every candidate appears once in every list position — matching
  the worked example ([2006,2016,2026] / [2026,2006,2016] / [2016,2026,2006]). A literal reverse of a
  3-element list leaves the middle element in the middle position in both the original and reversed order,
  which would fail that coverage guarantee.
- For other candidate-count cases: original / full-reverse / rotate-by-1 (2-candidate cases only have 2
  distinct orderings, since rotating a 2-element list is identical to reversing it). The single 1-candidate
  case (Vizio) has no ordering to test and is excluded from order-bias metrics.
- A smaller control set of 6 models was also run with **synthetic, non-evenly-spaced** candidate years
  (e.g. [2004, 2016, 2025]), clearly marked benchmark-only, reusing the same already-fetched evidence.
- \`enforceEstimatorSafety()\` (the existing code-level safety net) remained active for every call; both the
  raw Gemini output and the final safety-adjusted output are recorded for every run.

## Executive Summary

- **${summary.overall.pctSameBestEstimateYear}%** of applicable models (${summary.applicableModelCount}/${summary.modelCount}, excluding the 1-candidate case) produced the **same final best-estimate year** across every candidate-order permutation.
- **${summary.overall.pctSamePlausibleYears}%** produced the same plausible-years set across all orderings.
- **${summary.overall.pctConfidenceChanged}%** had confidence change purely due to candidate order.
- **${summary.overall.pctOrderOnlyChangedAnswer}%** of models had candidate order alone change the final best-estimate year.
- Real-fixture cases: ${summary.realFixture.pctSameBestEstimateYear}% consistent (${summary.realFixture.total} applicable models).
- Benchmark-only cases: ${summary.benchmarkOnly.pctSameBestEstimateYear}% consistent (${summary.benchmarkOnly.total} applicable models).
- Positional selection frequency (raw Gemini output, before safety enforcement, among all resolved runs, n=${positionSummary.raw.all.resolvedCount}): first ${positionSummary.raw.all.first}%, middle ${positionSummary.raw.all.middle}%, last ${positionSummary.raw.all.last}%.
- Positional selection frequency (final safety-adjusted output, n=${positionSummary.final.all.resolvedCount}): first ${positionSummary.final.all.first}%, middle ${positionSummary.final.all.middle}%, last ${positionSummary.final.all.last}%.
- Systematic positional bias detected: **${summary.systematicBiasDetected ? 'YES' : 'no'}** (threshold: any position ≥55% of resolved raw outputs, with ≥10 resolved samples).
- Median / P95 Gemini latency: ${summary.medianGeminiLatencyMs} ms / ${summary.p95GeminiLatencyMs} ms.
- Median / P95 combined estimated production latency (1 Serper round-trip + 1 Gemini call): ${summary.medianCombinedLatencyMs} ms / ${summary.p95CombinedLatencyMs} ms.
- Total API calls this run: ${summary.totalGeminiCalls} Gemini calls, ${summary.totalSerperCalls} Serper calls.
- Total tokens: ~${summary.totalInputTokens} input, ~${summary.totalOutputTokens} output.

## Metrics

| Metric | Overall | Real-fixture | Benchmark-only |
| --- | ---: | ---: | ---: |
| Applicable models | ${summary.overall.total} | ${summary.realFixture.total} | ${summary.benchmarkOnly.total} |
| Same best-estimate year across order | ${summary.overall.pctSameBestEstimateYear}% | ${summary.realFixture.pctSameBestEstimateYear}% | ${summary.benchmarkOnly.pctSameBestEstimateYear}% |
| Same plausible-years set across order | ${summary.overall.pctSamePlausibleYears}% | ${summary.realFixture.pctSamePlausibleYears}% | ${summary.benchmarkOnly.pctSamePlausibleYears}% |
| Confidence changed by order | ${summary.overall.pctConfidenceChanged}% | ${summary.realFixture.pctConfidenceChanged}% | ${summary.benchmarkOnly.pctConfidenceChanged}% |
| Order alone changed the answer | ${summary.overall.pctOrderOnlyChangedAnswer}% | ${summary.realFixture.pctOrderOnlyChangedAnswer}% | ${summary.benchmarkOnly.pctOrderOnlyChangedAnswer}% |

## Positional Selection Frequency

| | First | Middle | Last | n (resolved) |
| --- | ---: | ---: | ---: | ---: |
| Raw Gemini output — all runs | ${positionSummary.raw.all.first}% | ${positionSummary.raw.all.middle}% | ${positionSummary.raw.all.last}% | ${positionSummary.raw.all.resolvedCount} |
| Raw Gemini output — main set only | ${positionSummary.raw.main.first}% | ${positionSummary.raw.main.middle}% | ${positionSummary.raw.main.last}% | ${positionSummary.raw.main.resolvedCount} |
| Raw Gemini output — control set only | ${positionSummary.raw.control.first}% | ${positionSummary.raw.control.middle}% | ${positionSummary.raw.control.last}% | ${positionSummary.raw.control.resolvedCount} |
| Final safety-adjusted — all runs | ${positionSummary.final.all.first}% | ${positionSummary.final.all.middle}% | ${positionSummary.final.all.last}% | ${positionSummary.final.all.resolvedCount} |
| Final safety-adjusted — main set only | ${positionSummary.final.main.first}% | ${positionSummary.final.main.middle}% | ${positionSummary.final.main.last}% | ${positionSummary.final.main.resolvedCount} |
| Final safety-adjusted — control set only | ${positionSummary.final.control.first}% | ${positionSummary.final.control.middle}% | ${positionSummary.final.control.last}% | ${positionSummary.final.control.resolvedCount} |

A roughly even ~33/33/33 split across first/middle/last indicates the model is reasoning from evidence rather
than defaulting to a list position. A skew toward one position — especially "middle" for evenly-spaced
3-candidate lists — indicates positional bias independent of evidence.

## Flagged Inconsistent Cases

${flaggedSection}

## All Models — Consistency Overview

| Brand | Model | Benchmark-only | Orderings tested | Same best year across order | Confidence changed | Evidence supports one candidate | Control set run |
| ----- | ----- | -------------- | ----------------: | ---------------------------- | ------------------- | -------------------------------- | ---------------- |
${allModelsTable}

## Estimated API Consumption

- Gemini calls: ${summary.totalGeminiCalls} (1 per permutation per model, main + control sets combined)
- Serper calls: ${summary.totalSerperCalls} (baseline, plus conditional document-focused — fetched once per model, reused across all permutations)
- Estimated tokens: ~${summary.totalInputTokens} input, ~${summary.totalOutputTokens} output (API-reported \`usageMetadata\` where available)

## Limitations

- Evidence was fetched once per model and reused across permutations by design (per the task's evidence-reuse
  requirement) — this measures ordering sensitivity holding evidence fixed, not full end-to-end run-to-run
  variance including fresh search results.
- Gemini output is not fully deterministic even at low temperature; a different run could show different
  individual flagged cases even though the aggregate pattern should be similar.
- The "evidence genuinely supports one candidate" heuristic is a simple year-extraction check (excluding
  marketplace/forum-sourced years), not independent human fact-checking — it is a useful directional signal,
  not a ground truth.
- ${modelRecords.filter((m) => m.isBenchmarkOnly).length} of ${modelRecords.length} main-set models and all 6 control-set cases use synthetic,
  clearly-marked benchmark-only candidate years, not real serial-decoder output.
- This is a single run; with only 1-3 orderings per model the per-model consistency signal is directional,
  though the aggregate positional-frequency metric across ${positionSummary.raw.all.resolvedCount} resolved
  raw outputs is a more statistically meaningful sample for detecting systematic bias.

## Recommendation

**${decision.verdict}**

Decision checks:
- ≥90% of applicable cases materially consistent across candidate order: ${decision.checks.consistencyOk ? 'PASS' : 'FAIL'} (${summary.overall.pctSameBestEstimateYear}%)
- No systematic first/middle/last positional bias detected: ${decision.checks.noBias ? 'PASS' : 'FAIL'}
- Real-fixture cases stable: ${decision.checks.realFixtureStable ? 'PASS' : 'FAIL'} (${summary.realFixture.pctSameBestEstimateYear}%)
- Weak-evidence cases do not repeatedly resolve solely due to ordering: ${decision.checks.weakEvidenceOk ? 'PASS' : 'FAIL'} (${summary.weakEvidenceRepeatedlyResolvedCount}/${summary.weakEvidenceModelCount} weak-evidence models resolved on every ordering)
- P95 combined estimated production latency under 6s: ${decision.checks.latencyOk ? 'PASS' : 'FAIL'} (${summary.p95CombinedLatencyMs} ms)
`;
}

main().catch((error) => {
  console.error('Gemini candidate-order bias benchmark failed:', error?.message || error);
  process.exitCode = 1;
});
