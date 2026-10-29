#!/usr/bin/env node
/**
 * MANUAL, OPT-IN live smoke test for Fast Answer. Never runs from `npm test`, a build or a route.
 *
 *   node scripts/replacement-quick-smoke.mjs        # DRY RUN: prints the plan, prompt size and a cost upper bound, calls nothing
 *
 * LIVE (exactly ONE ungrounded Gemini request for "LG C3 OLED TV"; see replacement-quick-smoke-core.mjs for the safeguards):
 *   $env:ITEMASSIST_LIVE_QUICK_SMOKE = '1'
 *   node --env-file=.env.local scripts/replacement-quick-smoke.mjs --confirm-live --approve=LGC3OLED-QUICK-1-REQUEST
 *
 * The API key is read from GEMINI_API_KEY and is never printed or written.
 */
import { HARD_STOP_MS, runQuickSmoke } from './replacement-quick-smoke-core.mjs';

const outDirArg = process.argv.find((arg) => arg.startsWith('--out-dir='));
const watchdog = setTimeout(() => {
  console.error(`HARD STOP after ${HARD_STOP_MS} ms. At most one request was sent; no output file was written.`);
  process.exit(3);
}, HARD_STOP_MS);

try {
  const result = await runQuickSmoke({ argv: process.argv.slice(2), outputDir: outDirArg ? outDirArg.slice('--out-dir='.length) : null, print: console.log });
  const { report } = result;
  if (result.mode === 'REFUSED') console.error(`REFUSED: ${report.refused}. Nothing was called.`);
  else if (result.mode === 'DRY_RUN') {
    console.log(JSON.stringify(report, null, 2));
    console.log('DRY RUN: nothing was called.');
  } else {
    console.log(JSON.stringify({
      mode: 'LIVE', requestsSent: report.requestsSent, httpStatus: report.httpStatus, latencyMs: report.latencyMs, errorCode: report.errorCode,
      finishReason: report.finishReason, tokens: report.tokens, estimatedActualCost: report.estimatedActualCost, status: report.answer.status,
      requirements: report.answer.requirements.length,
      successor: report.answer.successor && `${report.answer.successor.name} (${report.answer.successor.standing})`, suggestions: report.answer.suggestions.map((item) => `${item.name} (${item.confidence})`),
      warnings: report.answer.warnings, output: result.outputPath,
    }, null, 2));
  }
  process.exitCode = result.exitCode;
} finally {
  clearTimeout(watchdog);
}
