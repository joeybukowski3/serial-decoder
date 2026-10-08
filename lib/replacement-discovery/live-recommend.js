import { CONTRACT_VERSION } from '../replacement-core/enums.js';
import { createDeadline } from '../smart-lookup/deadline.js';
import { televisionProfile } from '../replacement-core/profiles/television.js';
import { refrigeratorProfile } from '../replacement-core/profiles/refrigerator.js';
import { interpretReplacementSearch } from './interpret.js';
import { recommendFromInterpretation } from './recommend.js';
import { DEFAULT_DISCOVERY_LIMIT } from './candidate-provider.js';
import { applyOriginalEnrichment, describeOriginal } from './original-enrichment.js';
import { planResearch } from './research-priority.js';
import { buildResearchCacheKey } from './research-cache-key.js';
import { GROUNDING_STATUS } from './research-grounding.js';
import { DEFAULT_RESEARCH_TOTAL_MS, safeErrorCode } from './providers/grounded-research-provider.js';

const PROFILES = { television: televisionProfile, refrigerator: refrigeratorProfile };
const NO_CANDIDATES = Object.freeze({ async discoverCandidates() { return []; } });
const SKIPPED = Object.freeze({ status: 'SKIPPED', errorCode: null, enrichment: null, evidence: [], warnings: [] });
// A provider-side rate limit, cooldown, budget denial or MODEL-configuration failure ends paid research for this request: no
// second call. Generic HTTP errors stay recoverable; only an error clearly about the model itself is terminal (see the transport).
const STOP_CODES = new Set(['PROVIDER_RATE_LIMIT', 'GEMINI_COOLDOWN_ACTIVE', 'LIVE_BUDGET_DENIED', 'PROVIDER_MODEL_UNAVAILABLE']);
// Stop codes that deserve their own explicit reason code in the result (the others are already visible as unavailable research).
const SURFACED_STOP_REASONS = new Set(['PROVIDER_MODEL_UNAVAILABLE']);
const CANDIDATE_STATUSES = new Set(['OK', 'EMPTY', 'INVALID', 'FAILED']);

const list = (value) => (Array.isArray(value) ? value : []);
/** Diagnostic only: an unknown or malformed grounding block from an injected provider simply becomes "not reported". */
const groundingOf = (raw) => (Object.values(GROUNDING_STATUS).includes(raw?.grounding?.status) ? { ...raw.grounding } : null);
const failedOriginal = (errorCode) => ({ status: 'FAILED', errorCode, enrichment: null, evidence: [], warnings: [] });
const failedCandidates = (status, errorCode) => ({ status, errorCode, drafts: [], evidence: [], rejected: [], warnings: [], receivedCount: 0 });

/** Injected providers may throw or return malformed shapes: both become a failed status, never a crash. */
async function guardedOriginal(operation) {
  let raw;
  try { raw = await operation(); } catch (error) { return failedOriginal(safeErrorCode(error)); }
  if (!raw || typeof raw !== 'object') return failedOriginal('PROVIDER_RESULT_INVALID');
  if (raw.status !== 'OK') return failedOriginal(safeErrorCode({ code: raw.errorCode }));
  const enrichment = raw.enrichment;
  if (!enrichment || typeof enrichment.facts !== 'object' || enrichment.facts === null) return failedOriginal('PROVIDER_RESULT_INVALID');
  return { status: 'OK', errorCode: null, enrichment: { facts: enrichment.facts, evidence: list(enrichment.evidence) }, evidence: list(raw.evidence), warnings: list(raw.warnings), grounding: groundingOf(raw) };
}

async function guardedCandidates(operation) {
  let raw;
  try { raw = await operation(); } catch (error) { return failedCandidates('FAILED', safeErrorCode(error)); }
  if (!raw || typeof raw !== 'object' || !CANDIDATE_STATUSES.has(raw.status)) return failedCandidates('INVALID', 'PROVIDER_RESULT_INVALID');
  return {
    status: raw.status,
    errorCode: raw.errorCode ? safeErrorCode({ code: raw.errorCode }) : null,
    drafts: list(raw.drafts), evidence: list(raw.evidence), rejected: list(raw.rejected), warnings: list(raw.warnings),
    receivedCount: Number.isInteger(raw.receivedCount) ? raw.receivedCount : 0,
    grounding: groundingOf(raw),
  };
}

function discoveryReasonCodes({ candidates, originalResearch, researchProvider, usedFallback }) {
  const codes = [];
  if (originalResearch.status === 'FAILED' || originalResearch.status === 'INVALID') codes.push('ORIGINAL_RESEARCH_UNAVAILABLE');
  if (!researchProvider || ['FAILED', 'INVALID'].includes(candidates.status)) codes.push('LIVE_RESEARCH_UNAVAILABLE');
  else if (candidates.status === 'EMPTY') codes.push('LIVE_DISCOVERY_EMPTY');
  else if (candidates.rejected.length) codes.push('LIVE_DISCOVERY_PARTIAL');
  // Research that returned content but no usable Google Search grounding: still returned (always-return), flagged as low-trust.
  if (originalResearch.status === 'OK' && originalResearch.grounding?.status === GROUNDING_STATUS.UNGROUNDED) codes.push('ORIGINAL_RESEARCH_UNGROUNDED');
  if (candidates.status === 'OK' && candidates.grounding?.status === GROUNDING_STATUS.UNGROUNDED) codes.push('LIVE_RESEARCH_UNGROUNDED');
  for (const code of [originalResearch.errorCode, candidates.errorCode]) if (SURFACED_STOP_REASONS.has(code) && !codes.includes(code)) codes.push(code);
  if (usedFallback) codes.push('FALLBACK_BASELINE_USED');
  return codes;
}

/** Research-specific "what would improve this" prompts, ahead of the Phase 1 suggestions. */
function researchRefinements(view, existing) {
  const ambiguous = view.ambiguities.find((item) => item.key === 'canonicalModel');
  if (!ambiguous) return existing;
  const first = {
    contractVersion: existing[0]?.contractVersion || CONTRACT_VERSION,
    suggestionId: 'research:confirm-exact-model',
    fieldKey: 'model',
    prompt: `Which exact model is it: ${ambiguous.alternatives.join(' or ')}? Check the label on the product.`,
    priority: 1,
    reasonCode: 'MODEL_AMBIGUOUS_AFTER_RESEARCH',
  };
  return [first, ...existing.map((item) => ({ ...item, priority: item.priority + 1 }))];
}

function selectedEvidence(result, evidence) {
  const refs = new Set(result.originalInterpretation.normalizedOriginal.evidenceRefs);
  for (const entry of Object.values(result.originalInterpretation.normalizedOriginal.facts)) entry.evidenceRefs.forEach((ref) => refs.add(ref));
  const shown = [result.primaryRecommendation, ...result.alternatives.map((item) => item.recommendation)].filter(Boolean);
  for (const item of shown) item.candidate.evidenceRefs.forEach((ref) => refs.add(ref));
  return evidence.filter((record) => refs.has(record.evidenceId));
}

/**
 * Phase 3 entry point (isolated, opt-in; no route calls it). Live research may
 * enrich the original and discover candidates, but every candidate still goes
 * through the deterministic Phase 1 evaluator and Phase 2 ranking. Provider
 * failure degrades to `fallbackProvider` (a Phase 2 provider) and never throws;
 * only invalid caller input (empty query, bad limit) is rejected, before any provider call.
 */
export async function recommendWithResearch({ query, notes = '', researchProvider = null, fallbackProvider = null, discoveryLimit = DEFAULT_DISCOVERY_LIMIT, requirements = [], deadline = createDeadline({ totalMs: DEFAULT_RESEARCH_TOTAL_MS }) }) {
  if (!Number.isInteger(discoveryLimit) || discoveryLimit < 1 || discoveryLimit > DEFAULT_DISCOVERY_LIMIT) throw new RangeError('discovery limit must be 1 through 6');
  const interpretation = interpretReplacementSearch({ query, notes });
  const profile = PROFILES[interpretation.normalizedOriginal.category];
  const plan = planResearch(interpretation.normalizedOriginal, profile);
  const warnings = [];
  let providerCalls = 0;

  let originalResearch = SKIPPED;
  let enriched = interpretation;
  if (researchProvider && plan.originalResearch) {
    providerCalls += 1;
    originalResearch = await guardedOriginal(() => researchProvider.researchOriginal({ original: interpretation.normalizedOriginal, plan, deadline }));
    if (originalResearch.status === 'OK') {
      const applied = applyOriginalEnrichment(interpretation, originalResearch.enrichment);
      enriched = applied.interpretation;
      warnings.push(...originalResearch.warnings, ...applied.warnings);
    }
  }

  const original = enriched.normalizedOriginal;
  let candidates = failedCandidates('FAILED', 'RESEARCH_PROVIDER_MISSING');
  if (researchProvider && STOP_CODES.has(originalResearch.errorCode)) {
    candidates = failedCandidates('FAILED', originalResearch.errorCode);
  } else if (researchProvider) {
    providerCalls += 1;
    candidates = await guardedCandidates(() => researchProvider.researchCandidates({ original, hints: enriched.candidateDiscoveryHints, plan, limit: discoveryLimit, deadline }));
  }
  warnings.push(...candidates.warnings);

  const evaluate = (candidateProvider) => recommendFromInterpretation({ input: { query, notes }, originalInterpretation: enriched, candidateProvider, discoveryLimit, requirements });
  const safely = (candidateProvider) => evaluate(candidateProvider).catch(() => null);
  let candidateSource = 'NONE';
  let result = null;
  let reasonStatus = candidates.status;
  if (candidates.status === 'OK') {
    result = await safely({ async discoverCandidates() { return candidates.drafts; } });
    if (result?.primaryRecommendation) candidateSource = 'LIVE_RESEARCH';
    else if (fallbackProvider) { result = null; reasonStatus = 'EMPTY'; } // every live draft failed final validation
  }
  if (!result && fallbackProvider) {
    result = await safely(fallbackProvider);
    if (result) candidateSource = 'FALLBACK_BASELINE';
  }
  result = result || await evaluate(NO_CANDIDATES);

  const evidence = [...originalResearch.evidence, ...candidates.evidence];
  const reasonCodes = discoveryReasonCodes({ candidates: { ...candidates, status: reasonStatus }, originalResearch, researchProvider, usedFallback: candidateSource === 'FALLBACK_BASELINE' });
  const originalView = describeOriginal({ interpretation: enriched, evidence });
  // A primary whose own facts could not be tied to any grounded source is only a provisional pick: say so, still return it.
  if (candidateSource === 'LIVE_RESEARCH' && result.primaryRecommendation?.candidate.source?.groundingStatus === GROUNDING_STATUS.UNGROUNDED) reasonCodes.push('PROVISIONAL_UNSOURCED_RECOMMENDATION');
  return {
    ...result,
    refinementSuggestions: researchRefinements(originalView, result.refinementSuggestions),
    rejectedSummary: [...candidates.rejected, ...result.rejectedSummary],
    reasonCodes: [...new Set([...reasonCodes, ...result.reasonCodes])],
    research: {
      mode: plan.mode,
      candidateSource,
      plannedFields: plan.priorityFields.map((field) => field.key),
      originalResearch: { status: originalResearch.status, errorCode: originalResearch.errorCode ?? null },
      grounding: { original: originalResearch.grounding ?? null, candidates: candidates.grounding ?? null },
      candidateResearch: { status: candidates.status, errorCode: candidates.errorCode ?? null, receivedCount: candidates.receivedCount, acceptedCount: candidates.drafts.length },
      originalView,
      evidence: selectedEvidence(result, evidence),
      warnings,
      providerCalls,
      cacheKeys: {
        original: buildResearchCacheKey({ job: 'original', original: interpretation.normalizedOriginal, mode: plan.mode }),
        candidates: buildResearchCacheKey({ job: 'candidates', original, mode: plan.mode, limit: discoveryLimit }),
      },
    },
  };
}
