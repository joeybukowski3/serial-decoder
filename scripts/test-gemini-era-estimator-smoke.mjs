#!/usr/bin/env node
/**
 * Single-case smoke test for the combined Serper + non-grounded-Gemini era
 * estimator proof of concept. Makes at most 2 Serper requests (baseline,
 * conditional document-focused) and exactly 1 Gemini request for ONE model,
 * to validate auth, JSON schema compliance, and latency before spending
 * credits on the full 20-model benchmark.
 *
 * Never logs or writes SERPER_API_KEY / GEMINI_API_KEY values. Run via:
 *   npm run test:gemini-estimator-smoke
 */
import { loadEnvLocal } from '../lib/serper/env-loader.js';
import { runEraEstimator } from '../lib/serial-refinement/deterministic/orchestrator.js';

loadEnvLocal();

if (!process.env.SERPER_API_KEY) {
  console.error('SERPER_API_KEY is not configured.');
  process.exit(1);
}
if (!process.env.GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY is not configured.');
  process.exit(1);
}

// One repo-fixture case with real serial-decoder candidate years (not a
// benchmark-only placeholder), for the most meaningful single-case signal.
const SMOKE_CASE = {
  brand: 'GE',
  model: 'JB258DM1WW',
  category: 'range',
  candidateYears: [1983, 1995, 2007, 2019],
};

function estimateTokens(text) {
  // Rough fallback estimate (~4 chars/token) used only when the API omits
  // usageMetadata; never presented as an authoritative count.
  return Math.ceil(String(text || '').length / 4);
}

async function main() {
  console.log(`Running single-case smoke test: ${SMOKE_CASE.brand} ${SMOKE_CASE.model}\n`);

  const result = await runEraEstimator(SMOKE_CASE);

  const { gemini, output, timings, serper } = result;

  console.log('--- Serper evidence gathering ---');
  console.log(`Baseline: ${serper.baseline.status}, ${serper.baseline.resultCount} results, ${serper.baseline.durationMs} ms`);
  if (serper.documentFocused) {
    console.log(`Document-focused (baseline insufficient): ${serper.documentFocused.status}, ${serper.documentFocused.resultCount} results, ${serper.documentFocused.durationMs} ms`);
  } else {
    console.log('Document-focused: skipped (baseline evidence judged sufficient)');
  }

  console.log('\n--- Gemini call ---');
  console.log(`Model: ${gemini.model}`);
  console.log(`Status: ${gemini.status}`);
  console.log(`Latency: ${gemini.durationMs} ms`);

  if (gemini.status !== 'success') {
    console.log(`Error: ${gemini.errorMessage || 'unknown'}`);
    console.log('\nSMOKE TEST FAILED — stopping before the full benchmark.');
    process.exitCode = 1;
    return;
  }

  console.log(`JSON validity: ${output ? 'valid, schema-conformant after safety enforcement' : 'INVALID / failed enforcement'}`);

  if (gemini.usage) {
    console.log(`Input tokens (API-reported): ${gemini.usage.promptTokenCount}`);
    console.log(`Output tokens (API-reported): ${gemini.usage.candidatesTokenCount}`);
    console.log(`Total tokens (API-reported): ${gemini.usage.totalTokenCount}`);
  } else {
    console.log(`Input tokens (rough estimate, no usageMetadata returned): ~${estimateTokens(result.prompt)}`);
    console.log(`Output tokens (rough estimate, no usageMetadata returned): ~${estimateTokens(gemini.rawText)}`);
  }

  console.log(`\nCombined latency (Serper + Gemini): ${timings.totalMs} ms`);

  console.log('\n--- Resulting estimate ---');
  if (output) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log('No output produced (Gemini response failed safety enforcement).');
  }

  if (output && output.corrections.length) {
    console.log('\nSafety corrections applied to raw Gemini output:');
    for (const c of output.corrections) console.log(`  - ${c}`);
  }

  console.log('\nSMOKE TEST SUCCEEDED.');
}

main().catch((error) => {
  console.error('Smoke test crashed:', error?.message || error);
  process.exitCode = 1;
});
