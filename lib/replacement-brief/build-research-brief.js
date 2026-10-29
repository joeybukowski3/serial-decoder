import { evaluateReplacement } from '../replacement-core/evaluate.js';
import { NOTES_MODES, interpretReplacementSearch } from '../replacement-discovery/interpret.js';
import { candidateFieldPlan, planResearch } from '../replacement-discovery/research-priority.js';
import { BRIEF_PROMPT_VERSION, buildResearchBriefPrompt } from '../replacement-discovery/research-prompts.js';
import { discoverCandidatePool } from '../replacement-discovery/candidate-provider.js';
import { MAX_RAW_CANDIDATES } from '../replacement-discovery/research-schema.js';
import { rankEvaluations, selectRecommendations } from '../replacement-discovery/candidate-ranker.js';
import { televisionProfile } from '../replacement-core/profiles/television.js';
import { refrigeratorProfile } from '../replacement-core/profiles/refrigerator.js';
import { formatValue } from '../replacement-public/labels.js';
import { BRIEF_STATUS, BRIEF_VERSION, CLOSEST_ROLE, SOURCE_STRENGTH, SUPPORTED_CATEGORIES, VERIFICATION_LEVEL, warning } from './brief-text.js';
import { buildWhatMatters } from './category-guidance.js';
import { buildChecklist } from './checklist.js';
import { buildOriginalFacts } from './original-facts.js';
import { BRIEF_TOTAL_MS, callBriefTransport, normalizeBriefReply } from './research.js';
import { buildSources } from './sources.js';
import { buildRuledOut, buildSuggestion } from './suggestions.js';
import { createDeadline } from '../smart-lookup/deadline.js';

/**
 * Offline research-brief builder (Phase 1). ONE grounded transport call collects the original item's facts and replacement
 * candidates; the unchanged Phase 3 schema/normalizer turn them into facts and drafts; the unchanged replacement-core
 * evaluator and candidate ranker decide the order. The brief wraps the result with plain-language guidance and states, in
 * every suggestion, that the specifications are reported and not verified.
 *
 * It never throws for provider trouble: a failed or empty call still returns category guidance and a checklist.
 * Nothing here reads a price, a retail record or a provider rank, and nothing imports a production route.
 */

// Candidates the brief asks for and compares. Everything the research returns is evaluated and ranked first; only then is the pool cut.
export const MAX_BRIEF_POOL = 8;
export const DEFAULT_BRIEF_CANDIDATES = MAX_BRIEF_POOL;
export const MAX_SUGGESTIONS = 3;
export const MAX_QUERY_LENGTH = 160;
export const MAX_NOTES_LENGTH = 300;
// Closest options (a hard requirement fails) are added only while fewer than this many suggestions meet every requirement.
const MIN_MEETING_SUGGESTIONS = 2;
const PROFILES = Object.freeze({ television: televisionProfile, refrigerator: refrigeratorProfile });
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g;

const emptyResearch = (status, providerCalls) => ({
  status, errorCode: null, providerCalls, promptVersion: BRIEF_PROMPT_VERSION, sourceCount: 0, searchQueryCount: 0, plannedOriginalResearch: false,
  original: { status: 'SKIPPED', errorCode: null, grounding: null },
  evaluation: { status: 'SKIPPED', failedCandidates: 0, compared: 0, notCompared: 0 },
  candidates: { status: 'SKIPPED', errorCode: null, received: 0, accepted: 0, rejected: 0, grounding: null },
});

function baseBrief(overrides) {
  return {
    briefVersion: BRIEF_VERSION, status: BRIEF_STATUS.UNSUPPORTED, verificationLevel: VERIFICATION_LEVEL, category: null,
    supportedCategories: [...SUPPORTED_CATEGORIES],
    original: { brand: null, model: null, displayName: null, facts: [], conflicts: [], possibleModels: [] },
    whatMatters: [], suggestions: [], ruledOut: [], checklist: [], sources: [], warnings: [], research: emptyResearch('SKIPPED', 0),
    ...overrides,
  };
}

function prepare({ query, notes, notesMode }) {
  const valid = typeof query === 'string' && query.trim() && query.length <= MAX_QUERY_LENGTH
    && typeof notes === 'string' && notes.length <= MAX_NOTES_LENGTH && Object.values(NOTES_MODES).includes(notesMode);
  if (!valid) return { code: 'INVALID_REQUEST' };
  try {
    return { interpretation: interpretReplacementSearch({ query: query.replace(CONTROL, ' ').trim(), notes: notes.replace(CONTROL, ' '), notesMode }) };
  } catch {
    return { code: 'UNSUPPORTED_CATEGORY' };
  }
}

/**
 * Evaluator + ranker over every validated draft. The pool is cut only AFTER ranking, so which candidates are compared never
 * depends on the order the provider listed them. A candidate the evaluator cannot compare is reported, not fatal.
 */
async function evaluateDrafts({ interpretation, drafts, profile, limit, evaluate }) {
  const original = interpretation.normalizedOriginal;
  const pool = await discoverCandidatePool({
    candidateProvider: { async discoverCandidates() { return drafts; } }, original, hints: interpretation.candidateDiscoveryHints, limit: drafts.length, maxLimit: MAX_RAW_CANDIDATES,
  });
  const evaluations = [], failedModels = [];
  for (const candidate of pool.candidates) {
    try { evaluations.push(evaluate({ original, candidate, profile })); } catch { failedModels.push(candidate.identity.facts.model?.value); }
  }
  const ranked = rankEvaluations(evaluations);
  const compared = ranked.slice(0, limit);
  return { ranked: compared, poolDropped: ranked.slice(limit), selected: selectRecommendations(compared), failedModels, failed: false };
}

const NO_EVALUATION = Object.freeze({ ranked: [], poolDropped: [], selected: { primaryRecommendation: null, alternatives: [], rejectedSummary: [] }, failedModels: [], failed: false });
const evaluationFailed = (evaluated) => evaluated.failed || evaluated.failedModels.length > 0;

/** One primary and up to two alternatives. Closest options that fail a hard requirement fill a slot only when too few suggestions meet every requirement. */
function chooseSuggestions(evaluated) {
  const { primaryRecommendation, alternatives, rejectedSummary } = evaluated.selected;
  if (!primaryRecommendation) return [];
  const picked = [
    { evaluation: primaryRecommendation, tier: 'PRIMARY', role: null },
    ...alternatives.slice(0, MAX_SUGGESTIONS - 1).map(({ role, recommendation }) => ({ evaluation: recommendation, tier: 'ALTERNATIVE', role })),
  ];
  const byId = new Map(evaluated.ranked.map((evaluation) => [evaluation.candidate.candidateId, evaluation]));
  const meeting = () => picked.filter((entry) => !entry.evaluation.decision.hardFailures.length).length;
  for (const item of rejectedSummary) {
    if (picked.length >= MAX_SUGGESTIONS || meeting() >= MIN_MEETING_SUGGESTIONS) break;
    if (item.reasonCode === 'KNOWN_HARD_FAILURE' && byId.has(item.candidateId)) picked.push({ evaluation: byId.get(item.candidateId), tier: 'ALTERNATIVE', role: CLOSEST_ROLE });
  }
  return picked;
}

function conflictsFor(research, originalFacts) {
  return research.original.conflicts.filter((item) => item.code === 'RESEARCH_CONFLICTS_WITH_INPUT' && item.reported !== null).map((item) => {
    const fact = originalFacts.find((entry) => entry.key === item.key);
    return { key: item.key, label: fact?.label || item.key, provided: fact?.value || 'a different value', reported: formatValue(item.key, item.reported) };
  });
}

/** True when the original's research produced at least one fact backed by a cited search source. */
const originalCited = (research) => research.original.status === 'OK' && research.original.evidence.some((record) => record.url);

function collectWarnings({ call, plan, research, suggestions, possibleModels, conflicts, notScored, evaluated }) {
  const codes = [];
  if (!call.ok) codes.push('RESEARCH_UNAVAILABLE');
  else {
    if (!call.grounding.sources.length) codes.push('RESEARCH_UNGROUNDED');
    if (plan.originalResearch && !originalCited(research)) codes.push('ORIGINAL_UNVERIFIED');
    if (research.candidates.status !== 'OK') codes.push('NO_CANDIDATES_FOUND');
  }
  if (possibleModels.length >= 2) codes.push('MODEL_AMBIGUOUS');
  if (conflicts.length || research?.original.conflicts.length) codes.push('SOURCE_CONFLICT');
  if (suggestions.some((entry) => entry.sourceStrength === SOURCE_STRENGTH.NONE)) codes.push('UNSOURCED_SUGGESTION');
  if (suggestions.some((entry) => entry.sourceStrength === SOURCE_STRENGTH.WEAK)) codes.push('WEAK_SOURCE_SUGGESTION');
  if (suggestions.length) codes.push('PROVISIONAL_RESULTS');
  if (suggestions[0]?.isBestAvailableOnly) codes.push('NO_STRICT_MATCH');
  if (suggestions.slice(1).some((entry) => entry.isBestAvailableOnly)) codes.push('CLOSEST_ALTERNATIVE');
  if (evaluated.poolDropped.length) codes.push('CANDIDATES_NOT_COMPARED');
  if (evaluationFailed(evaluated)) codes.push('EVALUATION_FAILED');
  if (notScored.length) codes.push('NOTE_NOT_SCORED');
  return [...new Set(codes)].map(warning);
}

/** A suggestion research can call complete: strong sources, fully grounded, meets every requirement, and a real evaluator verdict. */
const isCompleteSuggestion = (entry) => entry.sourceStrength === SOURCE_STRENGTH.STRONG && entry.grounding === 'GROUNDED' && !entry.isBestAvailableOnly && entry.matchLevel !== 'UNCONFIRMED';

function statusFor({ call, research, suggestions, evaluated, possibleModels }) {
  if (!call.ok) return BRIEF_STATUS.GUIDANCE_ONLY;
  if (!suggestions.length && !originalCited(research)) return BRIEF_STATUS.GUIDANCE_ONLY;
  // COMPLETE means "research finished well", never "verified": an evaluation failure, an ambiguous model, a weak or partial source,
  // or a failed requirement keeps the brief PARTIAL.
  const originalSettled = research.original.status === 'SKIPPED' || (research.original.status === 'OK' && research.original.grounding?.status === 'GROUNDED');
  const complete = suggestions.length && !evaluationFailed(evaluated) && possibleModels.length < 2 && call.grounding.sources.length && originalSettled && suggestions.every(isCompleteSuggestion);
  return complete ? BRIEF_STATUS.COMPLETE : BRIEF_STATUS.PARTIAL;
}

function researchSummary(call, research, plan, evaluated) {
  if (!call.ok) return { ...emptyResearch('FAILED', call.errorCode === 'RESEARCH_PROVIDER_MISSING' ? 0 : 1), errorCode: call.errorCode };
  return {
    ...emptyResearch('OK', 1),
    sourceCount: call.grounding.sources.length,
    searchQueryCount: Number.isInteger(call.grounding.searchQueryCount) ? call.grounding.searchQueryCount : 0,
    original: { status: research.original.status, errorCode: research.original.errorCode, grounding: research.original.grounding?.status || null },
    evaluation: {
      status: evaluationFailed(evaluated) ? 'FAILED' : research.candidates.drafts.length ? 'OK' : 'SKIPPED',
      failedCandidates: evaluated.failedModels.length, compared: evaluated.ranked.length, notCompared: evaluated.poolDropped.length,
    },
    candidates: {
      status: research.candidates.status, errorCode: research.candidates.errorCode, received: research.candidates.receivedCount,
      accepted: research.candidates.drafts.length, rejected: research.candidates.rejected.length, grounding: research.candidates.grounding?.status || null,
    },
    plannedOriginalResearch: plan.originalResearch,
  };
}

/**
 * @param {{query: string, notes?: string, notesMode?: 'FIT_ONLY'|'FULL', transport: Function, deadline?: object,
 *   now?: () => string, candidateLimit?: number, evaluate?: Function}} request
 *   `transport` is the grounded-search transport used by Phase 3: ({ job, prompt, stage, signal, deadline }) => { parsed, grounding }.
 *   `candidateLimit` (1 through 8) is how many candidates the research asks for and how many are compared; at most 3 are suggested.
 *   `evaluate` is the replacement-core evaluator; it is a parameter only so tests can simulate an evaluation failure.
 */
export async function buildResearchBrief({ query, notes = '', notesMode = NOTES_MODES.FIT_ONLY, transport, deadline, now = () => new Date().toISOString(), candidateLimit = DEFAULT_BRIEF_CANDIDATES, evaluate = evaluateReplacement } = {}) {
  const prepared = prepare({ query, notes, notesMode });
  if (!prepared.interpretation) return baseBrief({ warnings: [warning(prepared.code)] });
  const limit = Number.isInteger(candidateLimit) ? Math.min(MAX_BRIEF_POOL, Math.max(1, candidateLimit)) : DEFAULT_BRIEF_CANDIDATES;
  const category = prepared.interpretation.normalizedOriginal.category;
  const profile = PROFILES[category];
  const plan = planResearch(prepared.interpretation.normalizedOriginal, profile);
  const prompt = buildResearchBriefPrompt({ original: prepared.interpretation.normalizedOriginal, plan, hints: prepared.interpretation.candidateDiscoveryHints, limit, candidateFields: candidateFieldPlan(profile) });
  const call = await callBriefTransport({ transport, prompt, deadline: deadline || createDeadline({ totalMs: BRIEF_TOTAL_MS }) });
  const research = call.ok ? normalizeBriefReply({ parsed: call.parsed, grounding: call.grounding, interpretation: prepared.interpretation, plan, profile, now: now() }) : null;
  const interpretation = research ? research.interpretation : prepared.interpretation;

  let evaluated = NO_EVALUATION;
  if (research?.candidates.drafts.length) {
    // A failure here is reported (EVALUATION_FAILED warning, never COMPLETE), not hidden: the original's facts and checklist still return.
    try { evaluated = await evaluateDrafts({ interpretation, drafts: research.candidates.drafts, profile, limit, evaluate }); } catch { evaluated = { ...NO_EVALUATION, failed: true }; }
  }
  return assemble({ category, profile, plan, call, research, interpretation, evaluated, notScored: prepared.interpretation.notesReport?.notScored || [] });
}

function assemble({ category, profile, plan, call, research, interpretation, evaluated, notScored }) {
  const original = interpretation.normalizedOriginal;
  const evidence = research ? [...research.original.evidence, ...research.candidates.evidence] : [];
  const evidenceById = new Map(evidence.map((record) => [record.evidenceId, record]));
  const researchIds = new Set(evidenceById.keys());
  const brand = formatValue('brand', original.facts.brand?.value);
  const model = formatValue('model', original.facts.model?.value);
  const chosen = chooseSuggestions(evaluated);
  const suggestions = chosen.map(({ evaluation, tier, role }) => buildSuggestion({ evaluation, tier, role, evidenceById, fallbackBrand: brand }));

  const originalFacts = buildOriginalFacts({ original, profile, researchIds, evidenceById });
  const conflicts = research ? conflictsFor(research, originalFacts) : [];
  const possibleModels = (original.facts.canonicalModel?.status === 'AMBIGUOUS' ? original.facts.canonicalModel.alternatives : []) || [];
  const referencedIds = new Set([
    ...originalFacts.flatMap((fact) => original.facts[fact.key]?.evidenceRefs || []),
    ...chosen.flatMap(({ evaluation }) => evaluation.candidate.evidenceRefs),
  ]);
  // A typed model that research could not identify is treated like a missing one: ask the customer to re-check the label.
  const modelRecognized = original.facts.model?.status === 'KNOWN' && !(research && plan.originalResearch && !originalCited(research));
  const warnings = collectWarnings({ call, plan, research, suggestions, possibleModels, conflicts, notScored, evaluated });
  const shownIds = new Set(chosen.map(({ evaluation }) => evaluation.candidate.candidateId));
  return baseBrief({
    status: statusFor({ call, research, suggestions, evaluated, possibleModels }),
    category,
    original: {
      brand: brand || null,
      model: model || null,
      displayName: `${brand || ''} ${model || ''}`.trim() || String(original.rawQuery || '').replace(CONTROL, ' ').trim().slice(0, 80),
      facts: originalFacts,
      conflicts: conflicts.map(({ key, label, provided, reported }) => ({ key, label, provided, reported })),
      possibleModels,
    },
    whatMatters: buildWhatMatters(category, originalFacts),
    suggestions,
    ruledOut: research ? buildRuledOut({ ranked: evaluated.ranked, selected: evaluated.selected, shownIds, poolDropped: evaluated.poolDropped, draftRejected: research.candidates.rejected, failedModels: evaluated.failedModels }) : [],
    checklist: buildChecklist({
      category, suggestions, originalFacts, conflicts, possibleModels, modelKnown: modelRecognized, notScoredKinds: notScored.map((entry) => entry.kind), evaluationFailed: evaluationFailed(evaluated),
    }),
    sources: buildSources({ evidence, referencedIds }),
    warnings,
    research: researchSummary(call, research, plan, evaluated),
  });
}
