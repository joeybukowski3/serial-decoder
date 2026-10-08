import { UPGRADE_LABELS } from './labels.js';

/**
 * Deterministic explanation text. Every phrase is assembled from labels and assessments that are already present in the
 * public comparison rows, needs-verification items and engine classification. No facts, numbers or model names are added,
 * and nothing here calls a model.
 */

const MAX_LISTED = 4;
const MAX_LENGTH = 420;

const lower = (label) => label.charAt(0).toLowerCase() + label.slice(1);
const upper = (text) => text.charAt(0).toUpperCase() + text.slice(1);

function list(labels) {
  const items = labels.slice(0, MAX_LISTED).map(lower);
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

const labelsWhere = (rows, predicate) => [...new Set(rows.filter(predicate).map((row) => row.label))];
const byImportance = (rows, ...levels) => rows.filter((row) => levels.includes(row.importance));

function matchedSentence(rows) {
  const matched = labelsWhere(byImportance(rows, 'REQUIRED', 'IMPORTANT'), (row) => row.assessment.code === 'MATCH');
  return matched.length ? `Matches the original ${list(matched)}.` : null;
}

function upgradeSentence(rows, upgrades) {
  const exceeded = labelsWhere(rows, (row) => row.assessment.code === 'EXCEEDS' && row.importance !== 'ADDITIONAL');
  const named = [...new Set(upgrades.map((code) => UPGRADE_LABELS[code]).filter(Boolean))];
  const items = exceeded.length ? exceeded : named;
  return items.length ? `Exceeds the original in ${list(items)}.` : null;
}

function differenceSentence(rows) {
  const differing = labelsWhere(byImportance(rows, 'REQUIRED', 'IMPORTANT'), (row) => row.assessment.code === 'DIFFERS');
  return differing.length ? `Differs from the original in ${list(differing)}.` : null;
}

function openSentence(needs) {
  const fit = needs.filter((item) => item.reason === 'UNVERIFIED_FIT');
  const assumed = needs.filter((item) => item.reason === 'ASSUMED');
  const unverified = needs.filter((item) => ['UNKNOWN', 'AMBIGUOUS'].includes(item.reason));
  const parts = [];
  if (unverified.length) parts.push(upper(`${list([...new Set(unverified.map((item) => item.label))])} could not be verified.`));
  if (assumed.length) parts.push(upper(`${list([...new Set(assumed.map((item) => item.label))])} rests on an assumption.`));
  if (fit.length) parts.push('Confirm available space and mounting before replacement.');
  return parts;
}

function bestAvailableSentences(failed) {
  const sentences = ['No current model met every required specification, so this is the closest available option and not a like-kind-and-quality replacement.'];
  if (failed.length) sentences.push(`Does not meet the required ${list(failed)}.`);
  return sentences;
}

const LEAD = Object.freeze({
  CLOSE_MATCH: 'A close match with meaningful differences.',
  UNCONFIRMED: 'Not enough verified information to confirm a like-kind-and-quality match.',
});

/**
 * @param {{classification: string, isBestAvailableOnly: boolean, rows: Array<{label: string, importance: string, assessment: {code: string}}>,
 *   needs: Array<{label: string, reason: string}>, upgrades?: string[], failedLabels?: string[]}} input
 * @returns {string}
 */
export function buildExplanation({ classification, isBestAvailableOnly, rows, needs, upgrades = [], failedLabels = [] }) {
  const sentences = isBestAvailableOnly
    ? bestAvailableSentences(failedLabels)
    : [LEAD[classification], matchedSentence(rows), upgradeSentence(rows, upgrades), differenceSentence(rows)];
  sentences.push(...openSentence(needs));
  const text = sentences.filter(Boolean).join(' ') || 'Selected as the closest model among those evaluated.';
  if (text.length <= MAX_LENGTH) return text;
  const cut = text.slice(0, MAX_LENGTH);
  return `${cut.slice(0, cut.lastIndexOf('. ') + 1) || cut}`;
}
