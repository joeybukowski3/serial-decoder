import { NOTE_MESSAGES } from '../replacement-public/labels.js';
import { plainLabel } from './brief-text.js';
import { FIT_CHECK, MODEL_LOCATION_TIP } from './category-guidance.js';

/**
 * Practical customer checklist, assembled from open questions the brief itself found. Wording is fixed here; model names and
 * labels come from validated fields. Items are ordered by how much they change the decision.
 */

const MAX_ITEMS = 12;
const MAX_SPEC_ITEMS = 3;
const MAX_ORIGINAL_ITEMS = 2;
const SKIP_ORIGINAL_KEYS = new Set(['model', 'brand', 'tier', 'physicalFit']);
const item = (id, kind, text) => ({ id, kind, text });

/**
 * @param {{category: string, suggestions: object[], originalFacts: object[], conflicts: Array<{key: string, label: string, provided: string, reported: string}>,
 *   possibleModels: string[], modelKnown: boolean, notScoredKinds: string[], evaluationFailed?: boolean}} input
 */
export function buildChecklist({ category, suggestions, originalFacts, conflicts, possibleModels, modelKnown, notScoredKinds, evaluationFailed = false }) {
  const items = [];
  if (possibleModels.length >= 2) items.push(item('confirm-model', 'CONFIRM_MODEL', `Confirm the exact model of your item: ${possibleModels.join(' or ')}. ${MODEL_LOCATION_TIP[category]}`));
  else if (!modelKnown) items.push(item('find-model', 'CONFIRM_MODEL', `${MODEL_LOCATION_TIP[category]} An exact model number gives much better results.`));

  for (const conflict of conflicts) {
    items.push(item(`conflict-${conflict.key}`, 'CONFLICT', `Check ${plainLabel(conflict.label)}: you entered ${conflict.provided}, but a source reports ${conflict.reported}.`));
  }

  if (suggestions.length) {
    items.push(item('availability', 'AVAILABILITY', 'Confirm each suggested model exists, is currently sold new and is in stock. Availability and price were not checked.'));
  }
  if (evaluationFailed) items.push(item('compare-manually', 'EVALUATION', 'Some models were found but could not be compared automatically. Compare their published specifications with the original yourself.'));

  const seen = new Set();
  const specs = suggestions.flatMap((suggestion) => suggestion.unverified.map((entry) => ({ suggestion, entry })))
    .filter(({ entry }) => !seen.has(entry.key) && seen.add(entry.key) && entry.key !== 'physicalFit').slice(0, MAX_SPEC_ITEMS);
  for (const { suggestion, entry } of specs) {
    items.push(item(`verify-${entry.key}`, 'SPEC', `Check ${plainLabel(entry.label)} for ${suggestion.displayName} on the manufacturer's product page.`));
  }

  const open = originalFacts.filter((fact) => ['UNKNOWN', 'ASSUMED', 'AMBIGUOUS'].includes(fact.status) && !SKIP_ORIGINAL_KEYS.has(fact.key)).slice(0, MAX_ORIGINAL_ITEMS);
  for (const fact of open) items.push(item(`original-${fact.key}`, 'ORIGINAL_SPEC', `Confirm your original's ${plainLabel(fact.label)} from its label, manual or manufacturer page.`));

  for (const suggestion of suggestions.filter((entry) => entry.sourceStrength !== 'STRONG')) {
    const reason = suggestion.sourceStrength === 'NONE' ? 'No source could be tied to it.' : "It was found only through a source that is not its manufacturer or a known retailer, or is only partly sourced.";
    items.push(item(`exists-${suggestion.model || 'baseline'}`, 'UNSOURCED', `Confirm that ${suggestion.displayName} exists on the manufacturer's site. ${reason}`));
  }

  items.push(item('fit', 'FIT', FIT_CHECK[category]));
  for (const kind of new Set(notScoredKinds)) items.push(item(`notes-${kind.toLowerCase()}`, 'NOTES', NOTE_MESSAGES[kind] || NOTE_MESSAGES.OTHER));
  return items.slice(0, MAX_ITEMS);
}
