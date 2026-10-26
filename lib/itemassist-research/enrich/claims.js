import { findResearchClaim } from '../contract.js';
import { SOURCE_CLASS, safeSourceUrl } from '../evidence.js';
import { doorCountOf, escapeRegExp, layoutOf, sizeSpec } from './product-tokens.js';

/**
 * Control of what the model claims about the original. The identification is general knowledge, and it can be wrong in exactly the details a
 * replacement search then depends on (a refrigerator "with a Family Hub touchscreen" that has none, a dishwasher "with CrystalDry" that is a
 * step down from that line). So a specific the model adds is kept as a requirement or a characteristic ONLY when the registered sources the search
 * returned for the exact original model say it too. A specific nothing supports is not dropped silently: it moves to the uncertainty line as
 * guidance ("not found in the sources checked"), where the researcher can still see it, and it never becomes something a replacement MUST have.
 *
 * Plain word matching on purpose: a claim is supported when at least half of its distinctive words appear in the model's own source text. With no
 * source text about the model at all there is nothing to check against, so nothing is changed (and nothing derived from the claims is trusted
 * either: see `originalSpec`).
 */

const MIN_EVIDENCE_CHARS = 40;
const SUPPORT_RATIO = 0.5;
const MAX_UNCERTAINTY = 158;
const MAX_NOTED = 3;
// Words that carry no specific of their own.
const STOP = new Set(['must', 'have', 'has', 'include', 'includes', 'with', 'and', 'the', 'for', 'like', 'any', 'all', 'are', 'can', 'will', 'should', 'need', 'needs', 'required',
  'same', 'similar', 'key', 'main', 'design', 'technology', 'installation', 'fit', 'interface', 'feature', 'features', 'type', 'style', 'system', 'built']);

const normalize = (text) => String(text || '').toLowerCase().replace(/[-_/]/g, ' ');
const distinctive = (claim) => [...new Set(normalize(claim).match(/[a-z0-9]+/g) || [])].filter((word) => (word.length >= 3 || /\d/.test(word)) && !STOP.has(word));
const supported = (claim, evidence) => {
  const words = distinctive(claim);
  return words.length === 0 || words.filter((word) => evidence.includes(word)).length / words.length >= SUPPORT_RATIO;
};

/** What the registered, non-marketplace results about the exact original model say, as one lower-case string ('' when they say nothing). */
export function modelEvidence(rows, focuses) {
  const patterns = (Array.isArray(focuses) ? focuses : []).filter((focus) => focus.length >= 5).map((focus) => new RegExp(`\\b${escapeRegExp(focus)}\\b`, 'i'));
  if (!patterns.length) return '';
  const text = (Array.isArray(rows) ? rows : [])
    .filter((row) => { const source = safeSourceUrl(row?.url); return source && source.sourceClass !== SOURCE_CLASS.MARKETPLACE; })
    .map((row) => `${row.title} ${row.snippet}`)
    .filter((entry) => patterns.some((pattern) => pattern.test(entry)))
    .join(' \n ');
  const evidence = normalize(text);
  return evidence.length >= MIN_EVIDENCE_CHARS ? evidence : '';
}

const lead = (text) => { const clean = String(text).replace(/^\s*must\s+(?:have|include|be)\s+(?:an?\s+)?/i, '').replace(/[.\s]+$/, ''); return clean.charAt(0).toUpperCase() + clean.slice(1); };

/** Adds sentences while they fit and are not themselves a claim the contract would withhold. */
function compose(existing, sentences) {
  let result = typeof existing === 'string' && existing.trim() ? existing.trim() : '';
  for (const sentence of sentences) {
    const next = result ? `${result} ${sentence}` : sentence;
    if (next.length <= MAX_UNCERTAINTY && !findResearchClaim(sentence)) result = next;
  }
  return result || null;
}

/**
 * @param {object} input  engine input (research.2) from the identification
 * @param {string} evidence  from `modelEvidence`
 * @returns {{input: object, available: boolean, unconfirmed: string[], doors: number|null, doorsSettled: boolean}}  `doors` is the door count the sources
 *   give; it is `doorsSettled` only when the model did not say another count and the sources do not disagree among themselves
 */
export function vetIdentification(input, evidence) {
  if (!evidence) return { input, available: false, unconfirmed: [], doors: null, doorsSettled: true };
  const original = input.original;
  const characteristics = original.characteristics.filter((item) => supported(item, evidence));
  const requirements = input.requirements.filter((item) => supported(item.text, evidence));
  const dropped = [...original.characteristics.filter((item) => !characteristics.includes(item)), ...input.requirements.filter((item) => !requirements.includes(item)).map((item) => lead(item.text))];
  // One note per specific: a later claim that shares a distinctive word with an earlier one is the same detail.
  const unconfirmed = [];
  for (const item of dropped) if (!unconfirmed.some((other) => distinctive(other).some((word) => distinctive(item).includes(word)))) unconfirmed.push(item);

  // A door count the model gives that every source contradicts is not shown as the product's name.
  let identity = original.identity;
  const claimed = doorCountOf(identity);
  const stated = [...new Set([...evidence.matchAll(/\b(\d) door\b/g)].map((match) => Number(match[1])))];
  const sentences = [];
  const contradicted = Boolean(claimed && stated.length && !stated.includes(claimed));
  if (contradicted) identity = identity.replace(/\b\d[- ]door\s+/i, '');
  // A door count is settled only when the sources agree on one and the model did not say another. Otherwise it is a reading, not a fact:
  // listings are still matched to the count the sources give, but every price that depends on it is shown as conditional.
  const settled = stated.length === 1 && !contradicted;
  if (contradicted) sentences.push(`Door count not settled: sources say ${stated.join(' or ')}-door, first reading said ${claimed}.`);
  else if (stated.length > 1) sentences.push(`Door count not settled: sources mention ${stated.join(' and ')}-door.`);
  if (unconfirmed.length) sentences.push(`Not found in the sources checked: ${unconfirmed.slice(0, MAX_NOTED).join('; ')}.`);
  const doors = stated.length === 1 ? stated[0] : null;
  return {
    input: { ...input, requirements, original: { ...original, identity, characteristics, uncertainty: compose(original.uncertainty, sentences) } },
    available: true, unconfirmed, doors, doorsSettled: settled || stated.length === 0,
  };
}

/**
 * The original's own size when the user's words do not give it: its capacity or width from the identification. Used only when the sources
 * support it (`available`): an unchecked specific must not decide which listings are eligible. A capacity is "equal or greater" (`atLeast`).
 */
export function originalSpec(category, original, available) {
  if (!available) return null;
  const spec = sizeSpec(category, [original.identity, ...original.characteristics].filter(Boolean).join(' '));
  return spec && spec.kind === 'capacity' ? { ...spec, atLeast: true } : spec;
}

/**
 * The original's door configuration, from checked characteristics only: its kind (FRENCH_DOOR...) and, when the sources agree on one, its door
 * count. Null when unknown or unchecked. A generic "French door" description says nothing about depth, so no depth is ever read from it.
 */
export function originalLayout(original, available, doors = null, settled = true) {
  const kind = available ? layoutOf([original.identity, ...original.characteristics].filter(Boolean).join(' ')) : null;
  return kind ? { kind, doors, settled } : null;
}
