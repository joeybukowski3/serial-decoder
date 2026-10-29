import { CLASSIFICATIONS, CONFIDENCES, IMPORTANCE, ROLE_LABELS, UPGRADE_LABELS, assessmentFor, describeReason, formatValue } from '../replacement-public/labels.js';
import { getFact } from '../replacement-core/normalize-values.js';
import { RANK } from '../replacement-discovery/evidence-normalizer.js';
import {
  AVAILABILITY_NOTE, CLOSEST_ROLE, CLOSEST_ROLE_LABEL, COMPARISON_TEXT, MATCH_LEVEL, MATCH_SUMMARY, RELATIONSHIP_TEXT, RULED_OUT_TEXT,
  SOURCE_NOTE, SOURCE_STRENGTH, VERIFICATION_LEVEL, briefFactStatus, plainLabel,
} from './brief-text.js';
import { sourceDomains } from './original-facts.js';

/**
 * Provisional suggestions built from evaluator output only. The evaluator's classification, hard failures, comparison rows and
 * ranking are the unchanged replacement-core / candidate-ranker results (kept internally); this module words them for a
 * customer and adds the honest caveats: reported-not-verified, how well the sources tie the model to a real product,
 * availability unchecked, confidence capped. No price or retail field exists here.
 */

const MAX_LINES = 4;
const MAX_UNVERIFIED = 5;
const MAX_SPECS = 10;
const CONFIDENCE_ORDER = Object.freeze({ HIGH: 0, MEDIUM: 1, LOW: 2 });
const OPEN_CODES = new Set(['UNKNOWN', 'VERIFY', 'ASSUMED']);
// Profile labels written for a rule ("Same brand") that read wrongly as a row heading.
const LABEL_OVERRIDES = Object.freeze({ brand: 'Brand' });

const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
const safeModel = (value) => String(value || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 30);
const joinList = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

function rowsOf(evaluation) {
  return evaluation.comparisonRows.map((row) => {
    const importance = IMPORTANCE[row.bucket] || 'ADDITIONAL';
    const isFit = row.key === 'physicalFit';
    return {
      key: String(row.key),
      label: LABEL_OVERRIDES[row.key] || String(row.label),
      importance,
      isFit,
      code: assessmentFor(row.assessment, importance).code,
      original: isFit ? null : formatValue(row.key, row.original?.value),
      replacement: isFit ? null : formatValue(row.key, row.replacement?.value),
      reason: describeReason(row.reasonCode, row.assessment),
    };
  });
}

const comparison = (row) => (row.original && row.replacement ? `${row.label}: ${row.replacement} (original: ${row.original})` : null);

/**
 * How well the cited sources tie this suggestion to a real model. STRONG needs the candidate's own manufacturer domain or a known
 * retailer for the model AND fully grounded material facts; any other resolved source, or partial grounding, is WEAK; nothing
 * resolved (or a baseline with no exact model) is NONE. Even STRONG is domain-level: the product page was never opened.
 */
export function identityStrength(evaluation, evidenceById) {
  const source = evaluation.candidate.source || {};
  const records = source.baseline ? [] : (evaluation.candidate.evidenceRefs || []).map((id) => evidenceById.get(id)).filter((record) => record?.claim?.fieldKey === 'model');
  const best = records.reduce((rank, record) => Math.min(rank, record.sourceRank), RANK.UNSOURCED);
  if (best > RANK.GROUNDED) return SOURCE_STRENGTH.NONE;
  return best <= RANK.RETAILER && source.groundingStatus === 'GROUNDED' ? SOURCE_STRENGTH.STRONG : SOURCE_STRENGTH.WEAK;
}

/** Confidence never exceeds what the evidence allows: STRONG sources top out at MEDIUM; weak, partial or no sources, and any known hard failure, at LOW. */
export function cappedConfidence(raw, strength, hardFailed = false) {
  const ceiling = !hardFailed && strength === SOURCE_STRENGTH.STRONG ? 'MEDIUM' : 'LOW';
  return CONFIDENCE_ORDER[raw] > CONFIDENCE_ORDER[ceiling] ? raw : ceiling;
}

function promisingLines(evaluation, rows, failedLabels) {
  if (failedLabels.length) return [`Closest of the models found, but it does not meet ${joinList(failedLabels)}.`];
  const meets = rows.filter((row) => row.importance !== 'ADDITIONAL' && !row.isFit && ['MATCH', 'EXCEEDS'].includes(row.code)).map((row) => plainLabel(row.label));
  const lines = [
    RELATIONSHIP_TEXT[evaluation.candidate.relationship],
    meets.length ? `Reported to meet or exceed the original on ${joinList(meets)}.` : null,
  ].filter(Boolean);
  return (lines.length ? lines : ["Closest of the models found to the original's required specifications."]).slice(0, MAX_LINES);
}

function differenceLines(evaluation, rows) {
  const shown = rows.filter((row) => row.importance !== 'ADDITIONAL' && !row.isFit && ['DIFFERS', 'EXCEEDS'].includes(row.code))
    .map((row) => (comparison(row) ? `${comparison(row)}${row.code === 'EXCEEDS' ? ', higher than the original' : ''}` : `${row.label} differs from the original`));
  const upgrades = (evaluation.decision.materialUpgrades || []).map((code) => UPGRADE_LABELS[code]).filter(Boolean)
    .filter((label) => !rows.some((row) => plainLabel(row.label) === label && row.code === 'EXCEEDS')).map((label) => `Material upgrade in ${label}`);
  return [...shown, ...upgrades].slice(0, MAX_LINES);
}

function failedLines(evaluation, rows) {
  const fromRows = rows.filter((row) => row.code === 'FAIL').map((row) => comparison(row) || `${row.label}: ${row.reason.message || 'requirement not met'}`);
  const rowKeys = new Set(rows.map((row) => row.key));
  const extra = evaluation.decision.hardFailures.filter((failure) => !rowKeys.has(failure.key)).map((failure) => `${failure.key}: requirement not met`);
  return [...fromRows, ...extra].slice(0, MAX_LINES);
}

function unverifiedLines(rows) {
  return rows.filter((row) => row.importance !== 'ADDITIONAL' && OPEN_CODES.has(row.code))
    .map((row) => ({ key: row.key, label: row.label, message: row.reason.message || 'This specification could not be verified' })).slice(0, MAX_UNVERIFIED);
}

/** Each meaningful compared specification with where each side's value came from. Nothing here says "verified". */
function specLines(evaluation, rows, evidenceById) {
  const statusOf = (identity, key) => briefFactStatus(getFact(identity, key), evidenceById);
  return rows.filter((row) => row.importance !== 'ADDITIONAL' && !row.isFit).slice(0, MAX_SPECS).map((row) => ({
    key: row.key,
    label: row.label,
    importance: row.importance,
    original: row.original,
    originalStatus: statusOf(evaluation.normalizedOriginal, row.key),
    replacement: row.replacement,
    replacementStatus: statusOf(evaluation.candidate.identity, row.key),
    replacementSources: sourceDomains(getFact(evaluation.candidate.identity, row.key).evidenceRefs, evidenceById),
    comparison: COMPARISON_TEXT[row.code] || COMPARISON_TEXT.UNKNOWN,
  }));
}

/** @param {{evaluation: object, tier: 'PRIMARY'|'ALTERNATIVE', role?: string, evidenceById: Map<string, object>, fallbackBrand: string}} input */
export function buildSuggestion({ evaluation, tier, role = null, evidenceById, fallbackBrand }) {
  const rows = rowsOf(evaluation);
  const facts = evaluation.candidate.identity.facts;
  const source = evaluation.candidate.source || {};
  const brand = formatValue('brand', facts.brand?.value) || fallbackBrand;
  const model = safeModel(facts.model?.value) || null;
  const classification = pick(evaluation.classification, CLASSIFICATIONS, 'UNCONFIRMED');
  const isBestAvailableOnly = evaluation.decision.hardFailures.length > 0 || classification === 'NOT_LKQ';
  const [matchLevel, matchLabel] = MATCH_LEVEL[isBestAvailableOnly ? 'NOT_LKQ' : classification];
  const strength = identityStrength(evaluation, evidenceById);
  const effectiveRole = tier === 'ALTERNATIVE' && isBestAvailableOnly ? CLOSEST_ROLE : role;
  const failedLabels = rows.filter((row) => row.code === 'FAIL').map((row) => plainLabel(row.label));
  return {
    tier,
    brand,
    model,
    displayName: `${brand} ${model || source.baselineLabel || ''}`.trim(),
    ...(effectiveRole ? { role: effectiveRole, roleLabel: effectiveRole === CLOSEST_ROLE ? CLOSEST_ROLE_LABEL : ROLE_LABELS[effectiveRole] || ROLE_LABELS.SAME_BRAND_ALTERNATIVE } : {}),
    verification: VERIFICATION_LEVEL,
    matchLevel,
    matchLabel,
    isBestAvailableOnly,
    matchSummary: MATCH_SUMMARY[isBestAvailableOnly ? 'NOT_LKQ' : classification],
    confidence: cappedConfidence(pick(evaluation.confidence, CONFIDENCES, 'LOW'), strength, isBestAvailableOnly),
    relationship: evaluation.candidate.relationship,
    whyPromising: promisingLines(evaluation, rows, failedLabels),
    differences: differenceLines(evaluation, rows),
    failedRequirements: failedLines(evaluation, rows),
    specs: specLines(evaluation, rows, evidenceById),
    unverified: unverifiedLines(rows),
    availability: { status: 'UNVERIFIED', reported: source.availability === 'CURRENT' ? 'CURRENT' : 'UNKNOWN', note: AVAILABILITY_NOTE },
    grounding: source.groundingStatus || 'UNGROUNDED',
    sourceStrength: strength,
    sourceNote: SOURCE_NOTE[strength],
    sourced: strength !== SOURCE_STRENGTH.NONE,
    sources: sourceDomains(evaluation.candidate.evidenceRefs, evidenceById),
  };
}

const MAX_RULED_OUT = 10;

/**
 * Candidates that were researched but not suggested, each with a plain reason (never a score). `shownIds` are candidates
 * already suggested (including closest options); `poolDropped` are evaluated candidates cut from the compared pool after ranking.
 */
export function buildRuledOut({ ranked, selected, shownIds = new Set(), poolDropped = [], draftRejected, failedModels }) {
  const byId = new Map(ranked.map((evaluation) => [evaluation.candidate.candidateId, evaluation]));
  const brandOf = (evaluation) => formatValue('brand', evaluation.candidate.identity.facts.brand?.value);
  const modelOf = (evaluation) => safeModel(evaluation.candidate.identity.facts.model?.value) || null;
  const fromSelection = selected.rejectedSummary.filter((item) => !shownIds.has(item.candidateId)).flatMap((item) => {
    const evaluation = byId.get(item.candidateId);
    if (!evaluation) return [];
    const failed = item.reasonCode === 'KNOWN_HARD_FAILURE' ? rowsOf(evaluation).filter((row) => row.code === 'FAIL').map((row) => plainLabel(row.label)) : [];
    const base = RULED_OUT_TEXT[item.reasonCode] || RULED_OUT_TEXT.USER_FACING_LIMIT;
    return [{ brand: brandOf(evaluation), model: modelOf(evaluation), reason: failed.length ? `${base}: ${joinList(failed)}` : base }];
  });
  const fromPool = poolDropped.map((evaluation) => ({ brand: brandOf(evaluation), model: modelOf(evaluation), reason: RULED_OUT_TEXT.POOL_LIMIT_APPLIED }));
  const fromDrafts = draftRejected.filter((item) => item.candidateModel && RULED_OUT_TEXT[item.reasonCode])
    .map((item) => ({ brand: null, model: safeModel(item.candidateModel), reason: RULED_OUT_TEXT[item.reasonCode] }));
  const fromErrors = failedModels.map((model) => ({ brand: null, model: safeModel(model) || null, reason: RULED_OUT_TEXT.EVALUATION_FAILED }));
  return [...fromSelection, ...fromPool, ...fromDrafts, ...fromErrors].slice(0, MAX_RULED_OUT);
}
