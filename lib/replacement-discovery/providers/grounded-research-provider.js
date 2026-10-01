import { createDeadline } from '../../smart-lookup/deadline.js';
import { televisionProfile } from '../../replacement-core/profiles/television.js';
import { refrigeratorProfile } from '../../replacement-core/profiles/refrigerator.js';
import { validateCandidateResearch, validateOriginalResearch } from '../research-schema.js';
import { normalizeCandidateResearch, normalizeOriginalResearch } from '../research-normalizer.js';
import { buildCandidateDiscoveryPrompt, buildOriginalResearchPrompt } from '../research-prompts.js';
import { candidateFieldPlan, planResearch } from '../research-priority.js';
import { assessFactGrounding, assessJobGrounding } from '../research-grounding.js';

/**
 * Provider-neutral grounded research. `transport` performs ONE grounded call and
 * returns `{ parsed, grounding }`; Gemini is one implementation, tests inject a
 * mock. Research methods return status objects instead of throwing so a provider
 * failure degrades the recommendation instead of destroying it.
 */

// Phase 3 research has its OWN budgets, separate from the Smart Lookup route (8.5 s) which is untouched. Grounded Gemini 3.8
// research is slower than a Smart Lookup call: the second live smoke timed out at 6.5 s per call.
export const DEFAULT_RESEARCH_TOTAL_MS = 55000;
export const MAX_RESEARCH_CALLS = 2; // one per job: original research, then candidate discovery
export const CALL_MAX_MS = 25000;
export const CALL_RESERVE_MS = 350;
const PROFILES = { television: televisionProfile, refrigerator: refrigeratorProfile };

export class GroundedResearchError extends Error {
  constructor(code) {
    super(`Grounded research failed: ${code}`);
    this.name = 'GroundedResearchError';
    this.code = code;
  }
}

export const safeErrorCode = (error) => (/^[A-Z][A-Z0-9_]{2,39}$/.test(String(error?.code)) ? error.code : 'PROVIDER_ERROR');

export function createGroundedResearchProvider({ transport, now = () => new Date().toISOString(), totalMs = DEFAULT_RESEARCH_TOTAL_MS } = {}) {
  if (typeof transport !== 'function') throw new TypeError('transport function required');

  async function run({ job, prompt, deadline }) {
    try {
      const bound = deadline || createDeadline({ totalMs });
      const stage = `replacement-research-${job}`;
      // The provider, not the transport, owns the time bound so a hung transport cannot outlive the deadline.
      const { parsed, grounding } = await bound.run(stage, ({ signal }) => transport({ job, prompt, stage, signal, deadline: bound }), { maxMs: CALL_MAX_MS, reserveMs: CALL_RESERVE_MS });
      return { ok: true, parsed, grounding };
    } catch (error) {
      return { ok: false, errorCode: safeErrorCode(error) };
    }
  }

  async function researchOriginal({ original, plan, deadline }) {
    const failed = (status, errorCode) => ({ status, errorCode, enrichment: null, evidence: [], warnings: [] });
    const call = await run({ job: 'original', prompt: buildOriginalResearchPrompt({ original, plan }), deadline });
    if (!call.ok) return failed('FAILED', call.errorCode);
    const validated = validateOriginalResearch(call.parsed, original.category);
    if (validated.status !== 'OK') return failed('INVALID', validated.errorCode);
    const enrichment = normalizeOriginalResearch({ validated, original, grounding: call.grounding, now: now() });
    const grounding = assessJobGrounding({ sourceCount: call.grounding?.sources?.length, factSets: [enrichment.facts], evidence: enrichment.evidence, profile: PROFILES[original.category] });
    return { status: 'OK', errorCode: null, enrichment, evidence: enrichment.evidence, warnings: enrichment.warnings, grounding };
  }

  async function researchCandidates({ original, hints, plan, limit, deadline }) {
    const empty = { drafts: [], evidence: [], rejected: [], warnings: [], receivedCount: 0 };
    const profile = PROFILES[original.category];
    const prompt = buildCandidateDiscoveryPrompt({ original, plan, hints, limit, candidateFields: candidateFieldPlan(profile) });
    const call = await run({ job: 'candidates', prompt, deadline });
    if (!call.ok) return { ...empty, status: 'FAILED', errorCode: call.errorCode };
    const validated = validateCandidateResearch(call.parsed, original.category);
    if (validated.status !== 'OK') return { ...empty, status: 'INVALID', errorCode: validated.errorCode };
    const normalized = normalizeCandidateResearch({ validated, original, grounding: call.grounding, now: now(), limit });
    // Each candidate carries its own grounding status so the pipeline can tell a sourced recommendation from a provisional one.
    const drafts = normalized.drafts.map((draft) => ({ ...draft, source: { ...draft.source, groundingStatus: assessFactGrounding(draft.facts, normalized.evidence, profile).status } }));
    const grounding = assessJobGrounding({ sourceCount: call.grounding?.sources?.length, factSets: drafts.map((draft) => draft.facts), evidence: normalized.evidence, profile });
    return { ...normalized, drafts, grounding, receivedCount: validated.receivedCount, status: drafts.length ? 'OK' : 'EMPTY', errorCode: null };
  }

  return Object.freeze({
    researchOriginal,
    researchCandidates,
    /** Phase 2 provider contract: candidate drafts only. Failures throw so plain `recommendReplacement` callers see them. */
    async discoverCandidates({ original, hints, limit }) {
      const result = await researchCandidates({ original, hints, limit, plan: planResearch(original, PROFILES[original.category]) });
      if (result.status === 'FAILED' || result.status === 'INVALID') throw new GroundedResearchError(result.errorCode);
      return result.drafts;
    },
  });
}
