import { ANSWER_STATUS } from '../replacement-quick/quick-sanitize.js';
import { ANSWER_SOURCE, RESEARCH_KIND, findResearchClaim, isValidResearchResponse } from './contract.js';
import { FIRST_PARTY_CLASSES, MODEL_RELATION, SOURCE_CLASS, looksLikeExactModel, normalizeDate, normalizeEvidence } from './evidence.js';
import {
  CANDIDATE_KEYS, COMPARISON_STATUS, CONFIDENCES, MODEL_STATUS, NOTE_PARAMS, PRICE_KIND, VALUATION_METHOD,
  buildValuation, normalizePrices, normalizeTier,
} from './pricing.js';
import { CATEGORY_PROFILES, IMPORTANCE, ORIGIN, buildRequirements, resolveProfile } from './requirements.js';

/**
 * ItemAssist Research contract research.2: the research.1 answer plus a typed pricing and evidence block, weighted requirements and
 * per-candidate comparisons. Opt-in (the route emits it only when told to); research.1 is untouched.
 *
 * Trust model: free text keeps research.1's claim blocking (no price, link, retailer or assurance wording). Prices, dates, sources and the
 * valuation live only in typed fields built and checked by code. The validator re-derives every typed block from the response's own data
 * and requires an exact match, so a forged, edited or stale field cannot pass it, and a cached entry is re-checked on every read.
 *
 * Trust gate (read before wiring any live path): `verification`, `subjectModel` and `expectedModel` are caller-supplied claims. The builder can
 * only lower them, never prove them, and no stage fetches pages yet, so a page-level confirmation (VERIFIED_PAGE) survives only in a fixture
 * response. Model output must never be passed in as evidence. Only retrieval code that fetched the page itself may supply them, and that
 * stage is what lifts this gate (`trustPageVerification`).
 */

export const RESEARCH_CONTRACT_V2 = 'research.2';
export const DISCLOSURE_V2 = 'Research summary. Figures labelled as estimates are estimates. A price marked as confirmed comes from the cited source on the date shown. Confirm specifications, availability and price with a seller before buying.';

const PUBLIC_STATUSES = Object.freeze([ANSWER_STATUS.OK, ANSWER_STATUS.PARTIAL, ANSWER_STATUS.GUIDANCE_ONLY, ANSWER_STATUS.UNAVAILABLE]);
const CATEGORIES = Object.freeze(['tv', 'refrigerator', 'appliance', 'electronics', 'other', 'unknown']);
const STANDINGS = Object.freeze(['RECOMMENDED', 'CONDITIONAL']);
const BASE_WARNINGS = Object.freeze([
  'UNSAFE_CLAIMS_REMOVED', 'PRODUCT_NOT_IDENTIFIED', 'IDENTIFICATION_UNCERTAIN', 'SUCCESSOR_CONDITIONAL', 'DIFFERENCES_MISSING', 'PROVIDER_UNAVAILABLE',
]);
const DERIVED_WARNINGS = Object.freeze(['PRICE_EVIDENCE_REJECTED', 'CANDIDATE_EXCLUDED_ESSENTIAL', 'MODEL_NOT_VERIFIED', 'VALUATION_ESTIMATE_ONLY', 'VALUATION_INSUFFICIENT']);
const WARNING_CODES_V2 = Object.freeze([...BASE_WARNINGS, ...DERIVED_WARNINGS]);
const REJECTION_SCOPES = Object.freeze(['EVIDENCE', 'PRICE', 'TIER', 'COMPARISON', 'REQUIREMENT', 'CANDIDATE']);
const MAX_TEXT = 160;
const MAX_LIST = 6;
const MAX_REJECTIONS = 12;
const CONFIRMING_CLASSES = Object.freeze([SOURCE_CLASS.MANUFACTURER, SOURCE_CLASS.RETAILER, SOURCE_CLASS.TECH_DATABASE]);

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const confidenceOf = (value) => (typeof value === 'string' && CONFIDENCES.includes(value.toUpperCase()) ? value.toUpperCase() : 'LOW');
const text = (value) => (typeof value === 'string' && value.trim() && !findResearchClaim(value) ? value.trim().replace(/\s+/g, ' ').slice(0, MAX_TEXT) : null);
const todayUtc = (now) => new Date(now).toISOString().slice(0, 10);

/** Key-order independent JSON, for comparing a stored block with its re-derivation. */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}

/** How well each candidate's exact model is evidenced: page-confirmed (VERIFIED_LISTING) or only in a first-party search listing (LISTED_PROVISIONAL). */
function modelLevels(prices, evidence, candidates) {
  const byId = new Map(evidence.map((entry) => [entry.id, entry]));
  const exact = (entry) => entry && FIRST_PARTY_CLASSES.includes(entry.sourceClass) && [MODEL_RELATION.EXACT, MODEL_RELATION.VARIANT].includes(entry.modelRelation);
  const levels = new Map();
  const raise = (key, level) => { if (levels.get(key) !== MODEL_STATUS.VERIFIED_LISTING) levels.set(key, level); };
  for (const price of prices) {
    const entry = byId.get(price.evidenceId);
    if (!price.candidate || price.kind === PRICE_KIND.AI_ESTIMATE || !exact(entry) || entry.subject !== price.candidate) continue;
    raise(price.candidate, price.verification === 'VERIFIED_PAGE' ? MODEL_STATUS.VERIFIED_LISTING : MODEL_STATUS.LISTED_PROVISIONAL);
  }
  for (const candidate of candidates) for (const row of candidate.comparison) {
    const entry = byId.get(row.evidenceId);
    if (row.evidenceId && exact(entry) && entry.subject === candidate.key) raise(candidate.key, MODEL_STATUS.VERIFIED_LISTING);
  }
  return levels;
}

const statusFor = (candidate, levels) => levels.get(candidate.key) || (looksLikeExactModel(candidate.name) ? MODEL_STATUS.UNVERIFIED_MODEL : MODEL_STATUS.FAMILY_LEVEL);

function normalizeComparison(rows, key, requirements, evidence, notes) {
  const byEvidence = new Map(evidence.map((entry) => [entry.id, entry]));
  const out = [], seen = new Set();
  for (const row of (Array.isArray(rows) ? rows : []).slice(0, 24)) {
    if (!isObject(row)) continue;
    const requirement = requirements.find((item) => item.id === row.requirementId || (row.requirementKey && item.key === row.requirementKey));
    if (!requirement || seen.has(requirement.id) || !COMPARISON_STATUS.includes(row.status)) continue;
    let basis = row.basis === 'CONFIRMED' ? 'CONFIRMED' : 'AI_ESTIMATE';
    let evidenceId = basis === 'CONFIRMED' && typeof row.evidenceId === 'string' ? row.evidenceId : null;
    if (basis === 'CONFIRMED') {
      const source = byEvidence.get(evidenceId);
      const confirms = source && CONFIRMING_CLASSES.includes(source.sourceClass) && source.subject === key && [MODEL_RELATION.EXACT, MODEL_RELATION.VARIANT].includes(source.modelRelation);
      if (!confirms) { basis = 'AI_ESTIMATE'; evidenceId = null; notes.push({ scope: 'COMPARISON', reason: 'COMPARISON_NOT_CONFIRMED', action: 'DOWNGRADED' }); }
    }
    seen.add(requirement.id);
    out.push({ requirementId: requirement.id, status: row.status, basis, evidenceId });
  }
  return out.sort((a, b) => requirements.findIndex((item) => item.id === a.requirementId) - requirements.findIndex((item) => item.id === b.requirementId));
}

function aggregate(notes) {
  const counts = new Map();
  for (const { scope, reason, action } of notes) {
    const id = `${scope}|${reason}|${action}`;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(0, MAX_REJECTIONS).map(([id, count]) => { const [scope, reason, action] = id.split('|'); return { scope, reason, action, count }; });
}

function candidateText(raw, withStanding, seen) {
  const t = (value) => { const kept = text(value); if (kept === null && typeof value === 'string' && value.trim()) seen.dropped = true; return kept; };
  if (!isObject(raw) || !t(raw.name) || !t(raw.why)) return null;
  const concern = t(raw.concern);
  const withheld = typeof raw.concern === 'string' && raw.concern.trim() !== '' && concern === null;
  return {
    name: t(raw.name), why: t(raw.why), differences: t(raw.differences), concern, confidence: confidenceOf(raw.confidence),
    ...(withStanding ? { standing: STANDINGS.includes(raw.standing) && !withheld && !concern ? raw.standing : 'CONDITIONAL' } : {}),
  };
}

/**
 * @param {object} input  engine data: `{category, profile?, original, requirements, successor, suggestions, clarify, warnings?, pricing: {referenceDate?, tier, prices, evidence}}`
 * @param {{requestId: string, elapsedMs: number, cached?: boolean, answerSource: string, fixture?: boolean, now?: number}} meta
 */
export function buildResearchResponseV2(input, { requestId, elapsedMs, cached = false, answerSource, fixture = false, now = Date.now() }) {
  const source = isObject(input) ? input : {};
  const original = isObject(source.original) ? source.original : {};
  const rawPricing = isObject(source.pricing) ? source.pricing : {};
  const seen = { dropped: false };
  const t = (value) => { const kept = text(value); if (kept === null && typeof value === 'string' && value.trim()) seen.dropped = true; return kept; };
  const items = (value) => (Array.isArray(value) ? value.map(t).filter(Boolean).slice(0, MAX_LIST) : []);
  const notes = [];

  const category = CATEGORIES.includes(source.category) ? source.category : 'unknown';
  const profile = resolveProfile(category, source.profile);
  const identity = t(original.identity);
  const unidentified = !identity;
  const requirements = buildRequirements(source.requirements, profile);
  notes.push(...requirements.notes);

  // Candidate keys follow output order: SUCCESSOR, then the first and second suggestion that survive cleaning (ALT_1, ALT_2).
  const successorDraft = unidentified ? null : { raw: source.successor, base: candidateText(source.successor, true, seen) };
  const altDrafts = unidentified ? [] : (Array.isArray(source.suggestions) ? source.suggestions : []).slice(0, 8).map((raw) => ({ raw, base: candidateText(raw, false, seen) })).filter((entry) => entry.base).slice(0, 2);
  const drafts = [...(successorDraft && successorDraft.base ? [{ key: 'SUCCESSOR', ...successorDraft }] : []), ...altDrafts.map((entry, index) => ({ key: `ALT_${index + 1}`, ...entry }))];

  const referenceDate = normalizeDate(rawPricing.referenceDate) || todayUtc(now);
  const evidence = normalizeEvidence(rawPricing.evidence);
  notes.push(...evidence.rejections.map(({ reason }) => ({ scope: 'EVIDENCE', reason, action: 'REJECTED' })));
  // Page-level verification is a claim only fetching code can establish, and none exists yet: only the demo fixtures may carry it.
  const priced = normalizePrices(rawPricing.prices, {
    evidence: evidence.items, candidates: Object.fromEntries(drafts.map((entry) => [entry.key, { name: entry.base.name }])), referenceDate, trustPageVerification: fixture === true,
  });
  notes.push(...priced.notes);
  const tiered = normalizeTier(rawPricing.tier, priced.items);
  notes.push(...tiered.notes);

  const candidates = drafts.map((entry) => ({ key: entry.key, ...entry.base, comparison: normalizeComparison(entry.raw.comparison, entry.key, requirements.items, evidence.items, notes) }));
  const levels = modelLevels(priced.items, evidence.items, candidates);
  const finished = candidates.map(({ key, comparison, ...rest }) => {
    const modelStatus = statusFor({ key, name: rest.name }, levels);
    const claimed = drafts.find((entry) => entry.key === key).raw.modelStatus;
    if (claimed && claimed !== modelStatus && ([MODEL_STATUS.VERIFIED_LISTING, MODEL_STATUS.LISTED_PROVISIONAL].includes(claimed) || modelStatus === MODEL_STATUS.UNVERIFIED_MODEL)) notes.push({ scope: 'CANDIDATE', reason: 'MODEL_STATUS_DOWNGRADED', action: 'DOWNGRADED' });
    return { key, ...rest, verified: false, modelStatus, comparison };
  });

  // Evidence nobody uses is dropped: no orphan citations.
  const used = new Set([...priced.items.map((item) => item.evidenceId), ...finished.flatMap((entry) => entry.comparison.map((row) => row.evidenceId))].filter(Boolean));
  const keptEvidence = evidence.items.filter((entry) => used.has(entry.id));
  const valuation = buildValuation({ prices: priced.items, requirements: requirements.items, candidates: finished, tier: tiered.tier, profile, referenceDate });

  const publicOf = ({ key, ...rest }) => rest;
  const successor = finished.find((entry) => entry.key === 'SUCCESSOR');
  const suggestions = finished.filter((entry) => entry.key !== 'SUCCESSOR').map(publicOf);
  const status = unidentified ? ANSWER_STATUS.GUIDANCE_ONLY : !successor && !suggestions.length ? ANSWER_STATUS.PARTIAL : ANSWER_STATUS.OK;
  const rejections = aggregate(notes);
  const warnings = new Set((Array.isArray(source.warnings) ? source.warnings : []).filter((code) => BASE_WARNINGS.includes(code)));
  for (const code of derivedWarnings({ seen, unidentified, finished, valuation, rejections })) warnings.add(code);

  return {
    contractVersion: RESEARCH_CONTRACT_V2, kind: RESEARCH_KIND, status, category, profile,
    original: { identity, confidence: confidenceOf(original.confidence), characteristics: items(original.characteristics).slice(0, 4), uncertainty: t(original.uncertainty) },
    requirements: requirements.items,
    requirementsSource: requirements.items.some((item) => item.origin === ORIGIN.AI_ESTIMATE) ? 'AI_ESTIMATE_PLUS_CATEGORY_GUIDANCE' : 'CATEGORY_GUIDANCE',
    successor: successor ? publicOf(successor) : null,
    suggestions,
    pricing: { referenceDate, tier: tiered.tier, prices: priced.items, evidence: keptEvidence, valuation, rejections },
    clarify: items(source.clarify).slice(0, 2),
    disclosure: DISCLOSURE_V2,
    warnings: [...warnings].filter((code) => WARNING_CODES_V2.includes(code)),
    meta: { requestId, elapsedMs: Math.max(0, Math.round(elapsedMs) || 0), cached: Boolean(cached), answerSource, ...(fixture === true ? { fixture: true } : {}) },
  };
}

function derivedWarnings({ seen, unidentified, finished, valuation, rejections }) {
  const codes = [];
  if (seen.dropped) codes.push('UNSAFE_CLAIMS_REMOVED');
  if (unidentified) codes.push('PRODUCT_NOT_IDENTIFIED');
  if (finished.some((entry) => !entry.differences)) codes.push('DIFFERENCES_MISSING');
  if (rejections.some((entry) => entry.action === 'REJECTED' && ['EVIDENCE', 'PRICE', 'COMPARISON'].includes(entry.scope))) codes.push('PRICE_EVIDENCE_REJECTED');
  if (valuation.excluded.some((entry) => entry.reason.endsWith('ESSENTIAL_SHORTFALL'))) codes.push('CANDIDATE_EXCLUDED_ESSENTIAL');
  if (finished.some((entry) => entry.modelStatus === MODEL_STATUS.UNVERIFIED_MODEL)) codes.push('MODEL_NOT_VERIFIED');
  if ([VALUATION_METHOD.HISTORICAL_TIER_ESTIMATE, VALUATION_METHOD.AI_ESTIMATE_ONLY].includes(valuation.method)) codes.push('VALUATION_ESTIMATE_ONLY');
  if (valuation.method === VALUATION_METHOD.INSUFFICIENT) codes.push('VALUATION_INSUFFICIENT');
  return codes;
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Validation

const TOP_KEYS_V2 = ['category', 'clarify', 'contractVersion', 'disclosure', 'kind', 'meta', 'original', 'pricing', 'profile', 'requirements', 'requirementsSource', 'status', 'successor', 'suggestions', 'warnings'];
const sameKeys = (value, keys) => isObject(value) && Object.keys(value).sort().join() === [...keys].sort().join();
const safeString = (value) => typeof value === 'string' && value.length <= MAX_TEXT && !findResearchClaim(value);
const safeOrNull = (value) => value === null || safeString(value);
const META_KEYS = ['requestId', 'elapsedMs', 'cached', 'answerSource'];

function validCandidateV2(item, withStanding, requirementIds) {
  const keys = ['name', 'why', 'differences', 'concern', 'confidence', 'verified', 'modelStatus', 'comparison', ...(withStanding ? ['standing'] : [])];
  return sameKeys(item, keys) && safeString(item.name) && safeString(item.why) && safeOrNull(item.differences) && safeOrNull(item.concern) && item.verified === false
    && CONFIDENCES.includes(item.confidence) && Object.values(MODEL_STATUS).includes(item.modelStatus) && (!withStanding || (STANDINGS.includes(item.standing) && !(item.standing === 'RECOMMENDED' && item.concern !== null)))
    && Array.isArray(item.comparison) && item.comparison.every((row) => sameKeys(row, ['requirementId', 'status', 'basis', 'evidenceId']) && requirementIds.has(row.requirementId)
      && COMPARISON_STATUS.includes(row.status) && ['CONFIRMED', 'AI_ESTIMATE'].includes(row.basis) && (row.basis === 'CONFIRMED') === (typeof row.evidenceId === 'string'));
}

function validNotes(notes) {
  return Array.isArray(notes) && notes.length <= 16 && notes.every((entry) => isObject(entry) && Object.hasOwn(NOTE_PARAMS, entry.code)
    && Object.keys(entry).every((key) => key === 'code' || NOTE_PARAMS[entry.code].includes(key))
    && NOTE_PARAMS[entry.code].every((key) => (key === 'candidate' ? CANDIDATE_KEYS.includes(entry[key]) : Number.isFinite(entry[key]))));
}

function validPricing(pricing, { requirements, successor, suggestions, profile, trustPageVerification }) {
  if (!sameKeys(pricing, ['referenceDate', 'tier', 'prices', 'evidence', 'valuation', 'rejections']) || normalizeDate(pricing.referenceDate) !== pricing.referenceDate) return false;
  if (!Array.isArray(pricing.rejections) || pricing.rejections.length > MAX_REJECTIONS || !pricing.rejections.every((row) => sameKeys(row, ['scope', 'reason', 'action', 'count'])
    && REJECTION_SCOPES.includes(row.scope) && /^[A-Z_]{3,40}$/.test(row.reason) && ['REJECTED', 'DOWNGRADED'].includes(row.action) && Number.isInteger(row.count) && row.count > 0)) return false;
  const evidence = normalizeEvidence(pricing.evidence);
  if (evidence.rejections.length || canonical(evidence.items) !== canonical(pricing.evidence)) return false;
  const present = [['SUCCESSOR', successor], ...suggestions.map((item, index) => [`ALT_${index + 1}`, item])].filter(([, item]) => item);
  const names = Object.fromEntries(present.map(([key, item]) => [key, { name: item.name }]));
  const prices = normalizePrices(pricing.prices, { evidence: evidence.items, candidates: names, referenceDate: pricing.referenceDate, trustPageVerification });
  if (prices.notes.length || canonical(prices.items) !== canonical(pricing.prices)) return false;
  const tier = normalizeTier(pricing.tier, prices.items);
  if (tier.notes.length || canonical(tier.tier) !== canonical(pricing.tier)) return false;
  const candidates = present.map(([key, item]) => ({ key, ...item }));
  const used = new Set([...prices.items.map((item) => item.evidenceId), ...candidates.flatMap((entry) => entry.comparison.map((row) => row.evidenceId))].filter(Boolean));
  if (evidence.items.some((entry) => !used.has(entry.id))) return false;
  // Each candidate's model status and comparison basis must be what the evidence supports.
  const levels = modelLevels(prices.items, evidence.items, candidates);
  if (candidates.some((entry) => entry.modelStatus !== statusFor(entry, levels))) return false;
  const byEvidence = new Map(evidence.items.map((entry) => [entry.id, entry]));
  // The same test the builder applies: a confirmed row needs a confirming source about this candidate's own exact model (or a short variant of it).
  if (candidates.some((entry) => entry.comparison.some((row) => row.basis === 'CONFIRMED' && !(byEvidence.get(row.evidenceId)
    && CONFIRMING_CLASSES.includes(byEvidence.get(row.evidenceId).sourceClass) && byEvidence.get(row.evidenceId).subject === entry.key
    && [MODEL_RELATION.EXACT, MODEL_RELATION.VARIANT].includes(byEvidence.get(row.evidenceId).modelRelation))))) return false;
  const valuation = buildValuation({ prices: prices.items, requirements, candidates, tier: tier.tier, profile, referenceDate: pricing.referenceDate });
  return canonical(valuation) === canonical(pricing.valuation) && validNotes(pricing.valuation.notes);
}

/** Structural and trust check run before every send and every cache read. `meta.fixture` is valid only when the caller allows fixture mode. */
export function isValidResearchResponseV2(value, { allowFixture = false } = {}) {
  try {
    if (!sameKeys(value, TOP_KEYS_V2) || value.contractVersion !== RESEARCH_CONTRACT_V2 || value.kind !== RESEARCH_KIND || value.disclosure !== DISCLOSURE_V2) return false;
    if (!PUBLIC_STATUSES.includes(value.status) || !CATEGORIES.includes(value.category) || !(CATEGORY_PROFILES[value.category] || []).includes(value.profile)) return false;
    const { original } = value;
    if (!sameKeys(original, ['identity', 'confidence', 'characteristics', 'uncertainty']) || !safeOrNull(original.identity) || !safeOrNull(original.uncertainty)
      || !CONFIDENCES.includes(original.confidence) || !Array.isArray(original.characteristics) || !original.characteristics.every(safeString)) return false;
    if (!Array.isArray(value.clarify) || !value.clarify.every(safeString) || !Array.isArray(value.warnings) || !value.warnings.every((code) => WARNING_CODES_V2.includes(code))) return false;
    const rebuilt = buildRequirements(value.requirements, value.profile);
    if (rebuilt.notes.length || canonical(rebuilt.items) !== canonical(value.requirements)) return false;
    if (!value.requirements.every((item) => sameKeys(item, ['id', 'key', 'text', 'importance', 'origin']) && Object.hasOwn(IMPORTANCE, item.importance) && Object.hasOwn(ORIGIN, item.origin))) return false;
    const requirementIds = new Set(value.requirements.map((item) => item.id));
    if (value.requirementsSource !== (value.requirements.some((item) => item.origin === ORIGIN.AI_ESTIMATE) ? 'AI_ESTIMATE_PLUS_CATEGORY_GUIDANCE' : 'CATEGORY_GUIDANCE')) return false;
    if (value.successor !== null && !validCandidateV2(value.successor, true, requirementIds)) return false;
    if (!Array.isArray(value.suggestions) || value.suggestions.length > 2 || !value.suggestions.every((item) => validCandidateV2(item, false, requirementIds))) return false;
    const hasCandidates = value.successor !== null || value.suggestions.length > 0;
    const expectedStatus = original.identity === null ? ANSWER_STATUS.GUIDANCE_ONLY : hasCandidates ? ANSWER_STATUS.OK : ANSWER_STATUS.PARTIAL;
    if (value.status !== expectedStatus || (original.identity === null && hasCandidates)) return false;
    const trustPageVerification = allowFixture === true && isObject(value.meta) && value.meta.fixture === true;
    if (!validPricing(value.pricing, { requirements: value.requirements, successor: value.successor, suggestions: value.suggestions, profile: value.profile, trustPageVerification })) return false;
    const candidates = [value.successor, ...value.suggestions].filter(Boolean);
    const derived = derivedWarnings({ seen: { dropped: false }, unidentified: original.identity === null, finished: candidates, valuation: value.pricing.valuation, rejections: value.pricing.rejections });
    if (!derived.filter((code) => code !== 'UNSAFE_CLAIMS_REMOVED').every((code) => value.warnings.includes(code))) return false;
    const metaKeys = allowFixture && isObject(value.meta) && value.meta.fixture === true ? [...META_KEYS, 'fixture'] : META_KEYS;
    return sameKeys(value.meta, metaKeys) && Object.values(ANSWER_SOURCE).includes(value.meta.answerSource);
  } catch { return false; }
}

/** Either contract version. Anything else is invalid. */
export const isValidAnyResearchResponse = (value, options) => (isObject(value) && value.contractVersion === RESEARCH_CONTRACT_V2 ? isValidResearchResponseV2(value, options) : isValidResearchResponse(value, options));
