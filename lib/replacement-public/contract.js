import { televisionProfile } from '../replacement-core/profiles/television.js';
import { refrigeratorProfile } from '../replacement-core/profiles/refrigerator.js';
import { classifySource } from '../replacement-discovery/evidence-normalizer.js';
import { buildExplanation } from './explain.js';
import {
  CLASSIFICATIONS, CONFIDENCES, DEADLINE_MESSAGE, ERROR_MESSAGES, IMPORTANCE, IMPORTANCE_ORDER, NOTE_MESSAGES, RETRIEVAL_QUALITY, ROLE_LABELS,
  assessmentFor, describeReason, describeWarning, formatValue, isResolvedAssessment, publicFactStatus,
} from './labels.js';

/**
 * Browser-safe replacement contract. Every public field is copied out of the internal engine report by name; no internal
 * object is ever spread into the response, so a field added to the engine later cannot leak through this layer.
 */

export const CONTRACT_VERSION = '1';
export const PUBLIC_ENGINE_VERSION = '1.0.0';
export const MAX_ALTERNATIVES = 2;
export const MAX_SOURCES = 6;
export const MAX_COMPARISON_ROWS = 12;
const MAX_FACTS = 16;
const MAX_NEEDS = 10;
const MAX_REFINEMENTS = 5;
const MAX_DIFFERENCES = 3;
const MAX_PROMPT_LENGTH = 200;
const PROFILES = Object.freeze({ television: televisionProfile, refrigerator: refrigeratorProfile });
const SOURCE_TYPES = new Set(['MANUFACTURER_PAGE', 'RETAILER_LISTING', 'TECHNICAL_DATABASE']);
const SOURCE_ROLE_ORDER = Object.freeze({ ORIGINAL: 0, REPLACEMENT: 1, SUPPORT: 2 });

/** Cache version tag: bumps whenever the contract, engine wrapper or either rule profile changes, so stale entries are never served. */
export const CACHE_FINGERPRINT = [CONTRACT_VERSION, PUBLIC_ENGINE_VERSION, televisionProfile.profileVersion, refrigeratorProfile.profileVersion].join('+');

const modelKey = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const safeModel = (value) => String(value || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 30);
const unique = (items, keyOf) => { const seen = new Set(); return items.filter((item) => { const key = keyOf(item); if (seen.has(key)) return false; seen.add(key); return true; }); };
const ruleFor = (profile, key) => profile.rules.find((rule) => rule.key === key) || null;
const identityText = (identity, key) => formatValue(key, identity?.facts?.[key]?.value);

export function buildErrorResponse(errorCode, { requestId = null } = {}) {
  const code = ERROR_MESSAGES[errorCode] ? errorCode : 'ENGINE_ERROR';
  return {
    contractVersion: CONTRACT_VERSION,
    status: code === 'UNSUPPORTED' ? 'UNSUPPORTED' : 'ERROR',
    errorCode: code,
    message: ERROR_MESSAGES[code],
    ...(requestId ? { requestId } : {}),
  };
}

function buildOriginalFacts(facts, profile, sourceIds) {
  const wanted = [{ key: 'model', label: 'Model' }, { key: 'brand', label: 'Brand' }, ...profile.rules.filter((rule) => rule.key !== 'brand').map((rule) => ({
    key: rule.key, label: rule.label, required: rule.bucket === 'HARD' || (rule.bucket === 'STRONG' && rule.weightClass === 'HIGH') }))];
  return wanted.flatMap(({ key, label, required }) => {
    const entry = facts[key];
    if (!entry && !required) return [];
    if (entry && entry.status === 'UNKNOWN' && !required) return [];
    return [{ key, label, value: formatValue(key, entry?.value), status: publicFactStatus(entry, sourceIds) }];
  }).slice(0, MAX_FACTS);
}

function buildRow(row) {
  const importance = IMPORTANCE[row.bucket] || 'ADDITIONAL';
  const assessment = assessmentFor(row.assessment, importance);
  const isFit = row.key === 'physicalFit';
  const reason = describeReason(row.reasonCode, row.assessment);
  const showNote = reason.message && (isFit || !isResolvedAssessment(assessment.code));
  return {
    key: String(row.key),
    label: String(row.label),
    importance,
    original: isFit ? null : formatValue(row.key, row.original?.value),
    replacement: isFit ? null : formatValue(row.key, row.replacement?.value),
    assessment,
    note: showNote ? reason.message : null,
  };
}

function buildNeeds(evaluation, rows, profile, outcome) {
  const items = [];
  const push = (key, label, reason, message) => { if (reason && message) items.push({ key, label, reason, message }); };
  for (const warning of evaluation?.decision.warnings || []) {
    const { reason, message } = describeReason(warning.reasonCode);
    push(warning.key, ruleFor(profile, warning.key)?.label || warning.key, reason, message);
  }
  for (const row of rows.filter((item) => item.importance !== 'ADDITIONAL' && ['UNKNOWN', 'VERIFY', 'ASSUMED'].includes(item.assessment.code))) {
    const reason = row.assessment.code === 'ASSUMED' ? 'ASSUMED' : row.key === 'physicalFit' ? 'UNVERIFIED_FIT' : 'UNKNOWN';
    push(row.key, row.label, reason, row.note || 'This specification could not be verified');
  }
  for (const [key, entry] of Object.entries(evaluation?.normalizedOriginal.facts || {})) {
    const rule = ruleFor(profile, key);
    if (entry.status === 'AMBIGUOUS' && rule) push(key, rule.label, 'AMBIGUOUS', 'Sources disagree on this specification');
  }
  for (const kind of new Set((outcome.notes?.notScored || []).map((note) => (note.kind === 'FEATURE_PREFERENCE' ? note.kind : 'OTHER')))) {
    push('notes', 'Your notes', 'NOTE_NOT_SCORED', NOTE_MESSAGES[kind]);
  }
  if (outcome.deadline?.reached) push('research', 'Research completeness', 'PARTIAL_DEADLINE', DEADLINE_MESSAGE);
  return unique(items, (item) => `${item.key}:${item.reason}`).slice(0, MAX_NEEDS);
}

function buildWarnings(outcome, evaluation, extraCodes, isBestAvailableOnly) {
  const codes = [...(outcome.report?.reasonCodes || []), ...(outcome.reasonCodes || []), ...(evaluation?.decision.reasonCodes || []), ...extraCodes];
  if (isBestAvailableOnly) codes.push('NO_LKQ_CANDIDATE_FOUND');
  return unique(codes.map(describeWarning).filter(Boolean), (warning) => warning.code);
}

function buildRefinements(outcome, evaluation) {
  const suggestions = evaluation?.refinementSuggestions || outcome.report?.refinementSuggestions || [];
  return suggestions.slice(0, MAX_REFINEMENTS).flatMap((item) => (typeof item.fieldKey === 'string' && typeof item.prompt === 'string'
    ? [{ fieldKey: item.fieldKey.slice(0, 60), prompt: item.prompt.slice(0, MAX_PROMPT_LENGTH) }] : []));
}

function publicUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    return { url: `${url.origin}${url.pathname}`, domain: url.hostname.toLowerCase().replace(/^www\./, '') };
  } catch { return null; }
}

function buildSources(evidence, { brand, originalModel, primaryModel }) {
  const sources = (evidence || []).flatMap((record) => {
    const parsed = publicUrl(record?.url);
    if (!parsed || !SOURCE_TYPES.has(classifySource(parsed.domain, brand).sourceType)) return [];
    const subject = modelKey(record.claim?.subjectModel);
    const role = subject === modelKey(originalModel) ? 'ORIGINAL' : subject && subject === modelKey(primaryModel) ? 'REPLACEMENT' : 'SUPPORT';
    return [{ domain: parsed.domain, url: parsed.url, role }];
  });
  return unique(sources, (source) => source.url).sort((a, b) => SOURCE_ROLE_ORDER[a.role] - SOURCE_ROLE_ORDER[b.role]).slice(0, MAX_SOURCES);
}

/** Differences of one alternative against the primary, from published specification values only. */
function differencesFrom(alternative, primary, profile) {
  return profile.rules.filter((rule) => rule.bucket !== 'SECONDARY').flatMap((rule) => {
    const mine = identityText(alternative.candidate.identity, rule.key);
    const theirs = identityText(primary.candidate.identity, rule.key);
    return mine && theirs && mine.toLowerCase() !== theirs.toLowerCase() ? [`${rule.label}: ${mine} (recommended model: ${theirs})`] : [];
  }).slice(0, MAX_DIFFERENCES);
}

function candidateSummary(evaluation, fallbackBrand) {
  const brand = identityText(evaluation.candidate.identity, 'brand') || fallbackBrand;
  const model = safeModel(evaluation.candidate.identity.facts.model?.value);
  return { brand, model, displayName: `${brand} ${model}`.trim() };
}

const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

function buildAlternatives(report, primary, profile, fallbackBrand) {
  return (report?.recommendation?.alternatives || []).slice(0, MAX_ALTERNATIVES).map(({ role, recommendation }) => ({
    ...candidateSummary(recommendation, fallbackBrand),
    classification: pick(recommendation.classification, CLASSIFICATIONS, 'UNCONFIRMED'),
    confidence: pick(recommendation.confidence, CONFIDENCES, 'LOW'),
    role: ROLE_LABELS[role] ? role : 'SAME_BRAND_ALTERNATIVE',
    roleLabel: ROLE_LABELS[role] || ROLE_LABELS.SAME_BRAND_ALTERNATIVE,
    differences: differencesFrom(recommendation, primary, profile),
  }));
}

const isBestAvailable = (evaluation) => evaluation.decision.hardFailures.length > 0 || evaluation.classification === 'NOT_LKQ';

function buildPrimary(evaluation, rows, needs, profile, fallbackBrand) {
  const bestAvailable = isBestAvailable(evaluation);
  const failedLabels = evaluation.decision.hardFailures.map((failure) => ruleFor(profile, failure.key)?.label).filter(Boolean);
  const classification = pick(evaluation.classification, CLASSIFICATIONS, 'UNCONFIRMED');
  return {
    ...candidateSummary(evaluation, fallbackBrand),
    classification,
    confidence: pick(evaluation.confidence, CONFIDENCES, 'LOW'),
    explanation: buildExplanation({ classification, isBestAvailableOnly: bestAvailable, rows, needs, upgrades: evaluation.decision.materialUpgrades || [], failedLabels }),
    isBestAvailableOnly: bestAvailable,
  };
}

const PUBLIC_STATUS = Object.freeze({ COMPLETE: 'COMPLETE', PARTIAL: 'PARTIAL', NO_RESULT: 'NO_RESULT' });

/**
 * @param {object} outcome facade result (`recommendByRetrieval`) for a supported request
 * @param {{requestId: string, elapsedMs: number, extraReasonCodes?: string[], budgetLimited?: boolean, cached?: boolean}} options
 */
export function buildPublicResponse(outcome, { requestId, elapsedMs, extraReasonCodes = [], budgetLimited = false, cached = false }) {
  const { category, brand, model } = outcome.input;
  const profile = PROFILES[category];
  const report = outcome.report;
  const evaluation = report?.recommendation?.primary || null;
  const sourceIds = new Set((report?.evidence || []).map((record) => record.evidenceId));
  const rows = (evaluation?.comparisonRows || []).slice(0, MAX_COMPARISON_ROWS).map(buildRow)
    .sort((a, b) => IMPORTANCE_ORDER[a.importance] - IMPORTANCE_ORDER[b.importance]);
  const needs = buildNeeds(evaluation, rows, profile, outcome);
  const primary = evaluation ? buildPrimary(evaluation, rows, needs, profile, brand) : null;
  const status = PUBLIC_STATUS[outcome.status] || 'NO_RESULT';
  return {
    contractVersion: CONTRACT_VERSION,
    status: budgetLimited && status === 'COMPLETE' ? 'PARTIAL' : status,
    category,
    retrievalQuality: RETRIEVAL_QUALITY[outcome.retrievalQuality] || 'FAILED',
    original: {
      brand,
      model,
      displayName: `${brand} ${model}`,
      facts: buildOriginalFacts(evaluation?.normalizedOriginal.facts || report?.original?.facts || {}, profile, sourceIds),
    },
    primary,
    comparison: rows,
    alternatives: evaluation ? buildAlternatives(report, evaluation, profile, brand) : [],
    warnings: buildWarnings(outcome, evaluation, budgetLimited ? [...extraReasonCodes, 'BUDGET_LIMIT_REACHED'] : extraReasonCodes, Boolean(primary?.isBestAvailableOnly)),
    needsVerification: needs,
    refinements: buildRefinements(outcome, evaluation),
    sources: buildSources(report?.evidence, { brand, originalModel: model, primaryModel: primary?.model }),
    meta: {
      requestId,
      elapsedMs: Math.max(0, Math.round(elapsedMs)),
      engineVersion: PUBLIC_ENGINE_VERSION,
      profileVersion: profile.profileVersion,
      cached,
    },
  };
}

const TOP_LEVEL_KEYS = Object.freeze(['contractVersion', 'status', 'category', 'retrievalQuality', 'original', 'primary', 'comparison', 'alternatives',
  'warnings', 'needsVerification', 'refinements', 'sources', 'meta']);

/** Structural check for a stored or outgoing public response. Rejects unknown keys, bad shapes and non-HTTPS sources. */
export function isValidPublicResponse(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== TOP_LEVEL_KEYS.length || !TOP_LEVEL_KEYS.every((key) => keys.includes(key))) return false;
  if (value.contractVersion !== CONTRACT_VERSION || !Object.values(PUBLIC_STATUS).includes(value.status)) return false;
  if (!PROFILES[value.category] || !Object.values(RETRIEVAL_QUALITY).includes(value.retrievalQuality)) return false;
  const lists = ['comparison', 'alternatives', 'warnings', 'needsVerification', 'refinements', 'sources'];
  if (!lists.every((key) => Array.isArray(value[key])) || !Array.isArray(value.original?.facts) || !value.meta || typeof value.meta !== 'object') return false;
  if (value.alternatives.length > MAX_ALTERNATIVES || value.sources.length > MAX_SOURCES) return false;
  if (value.primary !== null && (typeof value.primary?.explanation !== 'string' || !CLASSIFICATIONS.includes(value.primary.classification))) return false;
  return value.sources.every((source) => typeof source.url === 'string' && source.url.startsWith('https://') && typeof source.domain === 'string');
}
