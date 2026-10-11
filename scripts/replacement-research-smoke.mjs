#!/usr/bin/env node
/**
 * MANUAL, OPT-IN live smoke test for grounded replacement research (Phase 3).
 * Never runs from `npm test` or any build step; nothing imports or schedules it.
 *
 *   node scripts/replacement-research-smoke.mjs                       # dry run: prints the plan, calls nothing
 *   ITEMASSIST_LIVE_RESEARCH_SMOKE=1 node --env-file=.env.local \
 *     scripts/replacement-research-smoke.mjs --confirm-live ["query"]  # LIVE: at most 2 Gemini calls
 *
 * Live mode needs BOTH the env flag and --confirm-live, plus GEMINI_API_KEY.
 * Calls made: up to two grounded Gemini requests (gemini-2.5-flash + Google Search):
 * one researching the original item (skipped for broad queries) and one discovering
 * candidates. A local in-memory gate hard-caps the run at 2 requests. No Redis,
 * no production route, no writes. The API key and raw provider text are never printed.
 */
import { recommendWithResearch } from '../lib/replacement-discovery/live-recommend.js';
import { createGroundedResearchProvider, MAX_RESEARCH_CALLS } from '../lib/replacement-discovery/providers/grounded-research-provider.js';
import { createGeminiGroundedTransport } from '../lib/replacement-discovery/providers/gemini-grounded-transport.js';
import { createAttemptRecorder, runWithAttemptRecorder } from '../lib/smart-lookup/provider-attempts.js';
import { planResearch } from '../lib/replacement-discovery/research-priority.js';
import { interpretReplacementSearch } from '../lib/replacement-discovery/interpret.js';
import { televisionProfile } from '../lib/replacement-core/profiles/television.js';
import { refrigeratorProfile } from '../lib/replacement-core/profiles/refrigerator.js';

const args = process.argv.slice(2);
const query = args.find((arg) => !arg.startsWith('--')) || 'Samsung QN55Q80';
const live = process.env.ITEMASSIST_LIVE_RESEARCH_SMOKE === '1' && args.includes('--confirm-live');

const original = interpretReplacementSearch({ query }).normalizedOriginal;
const plan = planResearch(original, original.category === 'television' ? televisionProfile : refrigeratorProfile);
const plannedCalls = plan.originalResearch ? MAX_RESEARCH_CALLS : 1;

console.log(`query: ${JSON.stringify(query)}  mode: ${plan.mode}  planned Gemini calls: ${plannedCalls} (hard cap ${MAX_RESEARCH_CALLS})`);
if (!live) {
  console.log('DRY RUN: nothing was called. Set ITEMASSIST_LIVE_RESEARCH_SMOKE=1 and pass --confirm-live to run live.');
  process.exit(0);
}
if (!process.env.GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY is not set (try node --env-file=.env.local ...). Nothing was called.');
  process.exit(1);
}

let used = 0;
const budgetGate = async () => ({ allowed: (used += 1) <= MAX_RESEARCH_CALLS });
// In-process stand-in for the shared Gemini cooldown: a 429 stops the second call. No Redis is touched.
let rateLimited = false;
const cooldown = { isActive: async () => rateLimited, mark: async () => { rateLimited = true; return 0; } };
const transport = createGeminiGroundedTransport({ budgetGate, cooldown });
const recorder = createAttemptRecorder({ route: 'replacement-research-smoke', logger: { info() {} } });
const result = await runWithAttemptRecorder(recorder, () => recommendWithResearch({ query, researchProvider: createGroundedResearchProvider({ transport }) }));

const shown = [result.primaryRecommendation, ...result.alternatives.map((item) => item.recommendation)].filter(Boolean);
console.log(JSON.stringify({
  research: { ...result.research.originalResearch, job: 'original' },
  candidates: result.research.candidateResearch,
  reasonCodes: result.reasonCodes,
  warningCodes: [...new Set(result.research.warnings.map((warning) => warning.code))],
  providerAttempts: recorder.attempts.map(({ provider, model, providerStatus, httpStatus, durationMs, inputTokens, outputTokens }) => ({ provider, model, providerStatus, httpStatus, durationMs, inputTokens, outputTokens })),
  shown: shown.map((item) => ({ model: item.candidate.identity.facts.model?.value ?? null, classification: item.classification, confidence: item.confidence, relationship: item.candidate.relationship })),
  evidenceRecords: result.research.evidence.length,
}, null, 2));
