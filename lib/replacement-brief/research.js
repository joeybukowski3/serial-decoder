import { createDeadline } from '../smart-lookup/deadline.js';
import { validateCandidateResearch, validateOriginalResearch } from '../replacement-discovery/research-schema.js';
import { normalizeCandidateResearch, normalizeOriginalResearch } from '../replacement-discovery/research-normalizer.js';
import { assessFactGrounding, assessJobGrounding } from '../replacement-discovery/research-grounding.js';
import { applyOriginalEnrichment } from '../replacement-discovery/original-enrichment.js';
import { modelRelation } from '../replacement-discovery/evidence-normalizer.js';
import { MAX_RAW_CANDIDATES } from '../replacement-discovery/research-schema.js';
import { safeErrorCode } from '../replacement-discovery/providers/grounded-research-provider.js';

/**
 * The single grounded call and the translation of its reply into the existing Phase 3 structures. Validation, normalization,
 * evidence ranking and grounding assessment are the unchanged Phase 3 modules; this file only wires them to one payload.
 */

// Sized for a 30 s serverless route with room for evaluation. Phase 2 must retune these after one measured live call.
export const BRIEF_TOTAL_MS = 24_000;
export const BRIEF_CALL_MAX_MS = 22_000;
export const BRIEF_CALL_RESERVE_MS = 350;
export const BRIEF_STAGE = 'replacement-brief';

export const createBriefDeadline = () => createDeadline({ totalMs: BRIEF_TOTAL_MS });

/** Exactly one transport call. Never throws: a failure becomes `{ ok: false, errorCode }`. */
export async function callBriefTransport({ transport, prompt, deadline }) {
  if (typeof transport !== 'function') return { ok: false, errorCode: 'RESEARCH_PROVIDER_MISSING' };
  try {
    const { parsed, grounding } = await deadline.run(BRIEF_STAGE,
      ({ signal }) => transport({ job: 'brief', prompt, stage: BRIEF_STAGE, signal, deadline }),
      { maxMs: BRIEF_CALL_MAX_MS, reserveMs: BRIEF_CALL_RESERVE_MS });
    return { ok: true, parsed, grounding: grounding || { sources: [], searchQueryCount: 0 } };
  } catch (error) {
    return { ok: false, errorCode: safeErrorCode(error) };
  }
}

const CONFLICT_CODES = new Set(['RESEARCH_CONFLICTS_WITH_INPUT', 'RESEARCH_CONFLICTS_WITH_INFERENCE']);

function researchOriginal({ parsed, interpretation, plan, grounding, profile, now }) {
  const base = { status: 'SKIPPED', errorCode: null, evidence: [], warnings: [], conflicts: [], grounding: null, interpretation };
  if (!plan.originalResearch) return base;
  const validated = validateOriginalResearch(parsed, interpretation.normalizedOriginal.category);
  if (validated.status !== 'OK') return { ...base, status: 'INVALID', errorCode: validated.errorCode };
  const enrichment = normalizeOriginalResearch({ validated, original: interpretation.normalizedOriginal, grounding, now });
  const applied = applyOriginalEnrichment(interpretation, enrichment);
  return {
    ...base,
    status: 'OK',
    evidence: enrichment.evidence,
    warnings: [...enrichment.warnings, ...applied.warnings],
    conflicts: applied.warnings.filter((item) => CONFLICT_CODES.has(item.code)).map((item) => ({ key: item.key, code: item.code, reported: enrichment.facts[item.key]?.value ?? null })),
    grounding: assessJobGrounding({ sourceCount: grounding?.sources?.length, factSets: [enrichment.facts], evidence: enrichment.evidence, profile }),
    interpretation: applied.interpretation,
  };
}

/**
 * The original product, or a variant of it, is never its own replacement. An exact match covers the typed token, the researched
 * full model and any model the token could mean; a suffix variant (QN55Q80C vs QN55Q80CAFXZA) is judged only against a RESOLVED
 * full model, because a partial token ("QN55Q80") is a prefix of its own successor.
 */
export function isOriginalModel(candidateModel, original) {
  const canonical = original.facts.canonicalModel;
  const exact = [original.facts.model?.value, canonical?.value, ...(canonical?.alternatives || [])].filter(Boolean);
  const resolvedFull = canonical && ['KNOWN', 'INFERRED'].includes(canonical.status) ? canonical.value : null;
  return exact.some((model) => modelRelation(candidateModel, model) === 'EXACT')
    || Boolean(resolvedFull && modelRelation(candidateModel, resolvedFull) === 'VARIANT');
}

function researchCandidates({ parsed, original, grounding, profile, now }) {
  const base = { status: 'INVALID', errorCode: null, drafts: [], evidence: [], rejected: [], warnings: [], receivedCount: 0, grounding: null };
  const validated = validateCandidateResearch(parsed, original.category);
  if (validated.status !== 'OK') return { ...base, errorCode: validated.errorCode };
  // No response-order pool limit here: every valid candidate is kept for evaluation and the pool is cut AFTER ranking.
  const normalized = normalizeCandidateResearch({ validated, original, grounding, now, limit: MAX_RAW_CANDIDATES });
  const ownModel = (draft) => draft.facts.model?.value && isOriginalModel(draft.facts.model.value, original);
  const accepted = normalized.drafts.filter((draft) => !ownModel(draft));
  const ownRejections = normalized.drafts.filter(ownModel).map((draft) => ({ candidateId: draft.candidateId, candidateModel: draft.facts.model.value, reasonCode: 'ORIGINAL_MODEL' }));
  // Each draft carries its own grounding status so the brief can tell a sourced suggestion from an unsourced one.
  const drafts = accepted.map((draft) => ({ ...draft, source: { ...draft.source, groundingStatus: assessFactGrounding(draft.facts, normalized.evidence, profile).status } }));
  return {
    ...base,
    status: drafts.length ? 'OK' : 'EMPTY',
    drafts,
    evidence: normalized.evidence,
    rejected: [...normalized.rejected, ...ownRejections],
    warnings: normalized.warnings,
    receivedCount: validated.receivedCount,
    grounding: assessJobGrounding({ sourceCount: grounding?.sources?.length, factSets: drafts.map((draft) => draft.facts), evidence: normalized.evidence, profile }),
  };
}

/**
 * @returns {{ interpretation: object, original: object, candidates: object }} original/candidates are status objects; neither throws.
 * Original research is applied first so candidate relationships are judged against the enriched original.
 */
export function normalizeBriefReply({ parsed, grounding, interpretation, plan, profile, now }) {
  const failure = (errorCode) => ({
    interpretation,
    original: { status: 'INVALID', errorCode, evidence: [], warnings: [], conflicts: [], grounding: null, interpretation },
    candidates: { status: 'INVALID', errorCode, drafts: [], evidence: [], rejected: [], warnings: [], receivedCount: 0, grounding: null },
  });
  if (!parsed || typeof parsed !== 'object') return failure('RESEARCH_SCHEMA_INVALID');
  try {
    const original = researchOriginal({ parsed, interpretation, plan, grounding, profile, now });
    const candidates = researchCandidates({ parsed, original: original.interpretation.normalizedOriginal, grounding, profile, now });
    return { interpretation: original.interpretation, original, candidates };
  } catch {
    return failure('BRIEF_NORMALIZATION_FAILED');
  }
}
