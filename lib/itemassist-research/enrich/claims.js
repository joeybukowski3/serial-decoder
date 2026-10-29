import { findResearchClaim } from '../contract.js';
import { SOURCE_CLASS, safeSourceUrl } from '../evidence.js';
import { doorCountOf, escapeRegExp, layoutOf, matchesFocus, modelKey, sizeSpec } from './product-tokens.js';

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
  'same', 'similar', 'key', 'main', 'design', 'technology', 'installation', 'fit', 'interface', 'feature', 'features', 'type', 'style', 'system', 'built', 'layout', 'cuft', 'inch']);

// Words every product of the kind has. They say what sort of product it is, never which feature it has, so they cannot support a feature
// ("door" is in every refrigerator's text; it says nothing about "door-in-door").
const COMMON = new Set(['door', 'doors', 'french', 'freezer', 'refrigerator', 'refrigerators', 'fridge', 'stainless', 'steel', 'capacity', 'storage', 'layout', 'finish',
  'bottom', 'top', 'side', 'dishwasher', 'washer', 'dryer', 'television']);
// Units said many ways ("cubic feet", "cu. ft.", "cu ft", "cuft") are one unit; a quantity is a number with its unit.
const UNITS = [[/\bcubic[\s-]*f(?:ee|oo)t\b|\bcu[\s.-]*f(?:ee|oo)?t\b\.?/g, ' cuft '], [/\binch(?:es)?\b|["”]/g, ' inch ']];
// Each unit's tolerance: a capacity is reported to the nearest tenth by one source and rounded to a foot by another (2% covers that and no more).
const QUANTITY_TOLERANCE = { cuft: (value) => value * 0.02, inch: () => 1 };
const QUANTITY = /(\d+(?:\.\d+)?)\s*(cuft|inch)\b/g;

const unitised = (text) => UNITS.reduce((value, [pattern, unit]) => value.replace(pattern, unit), String(text || '').toLowerCase());
const normalize = (text) => unitised(text).replace(/[-_/]/g, ' ');
const quantitiesOf = (text) => [...unitised(text).matchAll(QUANTITY)].map((match) => ({ value: Number(match[1]), unit: match[2] }));
const withoutQuantities = (text) => unitised(text).replace(QUANTITY, ' ');
const distinctive = (claim) => [...new Set(normalize(withoutQuantities(claim)).match(/[a-z0-9]+/g) || [])].filter((word) => (word.length >= 3 || /\d/.test(word)) && !STOP.has(word));
// "door-in-door", "counter-depth", "x in x": a compound names one feature and is supported only by the whole compound, never by its parts.
const compounds = (claim) => {
  const text = unitised(claim);
  const found = [...text.matchAll(/[a-z0-9]+(?:-[a-z0-9]+)+/g)].map((match) => match[0].replace(/-/g, ' '));
  for (const match of text.matchAll(/\b([a-z]{3,}) in \1\b/g)) found.push(match[0]);
  return [...new Set(found)];
};
// The words a claim adds beyond what every product has and beyond its compounds (those are checked whole).
const contentWords = (claim) => {
  const inCompound = new Set(compounds(claim).flatMap((phrase) => phrase.split(' ')));
  return distinctive(claim).filter((word) => !COMMON.has(word) && !inCompound.has(word));
};
const hasWord = (evidence, word) => (word.length >= 4 ? evidence.includes(word) : new RegExp(`\\b${escapeRegExp(word)}\\b`).test(evidence));
const agrees = (claimed, stated) => stated.unit === claimed.unit && Math.abs(stated.value - claimed.value) <= QUANTITY_TOLERANCE[claimed.unit](Math.max(stated.value, claimed.value));

/**
 * A claim is supported when (1) every measurement it states is matched by one the sources state in the same unit and within tolerance (a
 * different figure in the same unit is a conflict, not a match), (2) every compound feature it names appears whole, and (3) at least half
 * of its distinctive non-generic words appear. A claim made only of generic words is supported by their presence.
 */
const supported = (claim, evidence) => {
  const claimed = quantitiesOf(claim);
  if (claimed.length) {
    const stated = quantitiesOf(evidence);
    if (!claimed.every((quantity) => stated.some((other) => agrees(quantity, other)))) return false;
  }
  const phrases = compounds(claim);
  if (phrases.some((phrase) => !normalize(evidence).includes(phrase))) return false;
  const words = contentWords(claim);
  if (words.length) return words.filter((word) => hasWord(evidence, word)).length / words.length >= SUPPORT_RATIO;
  // Only generic words and whole compounds are left: a measurement stands on its figure and a compound on its phrase ("27.8 cubic feet capacity",
  // "door-in-door storage"); a purely generic claim needs all of its words ("French door layout").
  return claimed.length > 0 || phrases.length > 0 || distinctive(claim).every((word) => hasWord(evidence, word));
};

// A model-looking token in a result's text (RF28R7351SR, GFE28GYNFS): it starts with a letter and holds at least two digits, so "4-Door",
// "3-Year" and "27.7" are not models.
const MODEL_LIKE = /\b[A-Z][A-Z0-9-]{4,}\b/g;
const isModelLike = (token) => (token.match(/\d/g) || []).length >= 2;

/**
 * One field of a search result (its title, or its snippet) with every measurement that belongs to ANOTHER model blanked out. A page about the
 * original often names a sibling ("The GE GFE28GYNFS is ... 36" wide"), and its size is not the original's. A measurement belongs to the model
 * code named before it ("The GFE28GYNFS measures 36" wide and holds 25 cu ft. The PFE28KYNFS holds 27.7 cu ft."); with none before it, to the one
 * named after it in the same sentence ("27.7 cu ft French door, PFE28KYNFS"); with none at all, the field is about the page's own model and the
 * measurement stays. A measurement whose model is not `isFocus` is removed.
 * @param {string} text  the field as the source wrote it
 * @param {(key: string) => boolean} isFocus  whether a model key (letters and digits, upper-case) is the product the measurements must belong to
 * @returns {string} the field in lower case with units normalised (see `unitised`)
 */
function withoutMisattributed(text, isFocus) {
  const unit = unitised(text);
  const named = [...unit.toUpperCase().matchAll(MODEL_LIKE)].filter((match) => isModelLike(match[0])).map((match) => ({ at: match.index, own: isFocus(modelKey(match[0])) }));
  if (!named.some((entry) => !entry.own)) return unit;
  const ends = [...unit.matchAll(/[.!?;|](?=\s)/g)].map((match) => match.index);
  const belongs = (at) => {
    const before = named.filter((entry) => entry.at < at).at(-1);
    if (before) return before.own;
    const sentenceEnd = ends.find((end) => end >= at) ?? Infinity;
    const after = named.find((entry) => entry.at > at && entry.at < sentenceEnd);
    return after ? after.own : true;
  };
  return unit.replace(QUANTITY, (whole, _value, _unit, at) => (belongs(at) ? whole : ' '));
}

/** The measurements in a text that belong to the product `isFocus` accepts: `[{value, unit}]` with unit `cuft` or `inch`. */
export function attributedQuantities(text, isFocus) {
  return quantitiesOf(withoutMisattributed(text, isFocus));
}

/**
 * What the registered, non-marketplace results about the exact original model say, as one lower-case string ('' when they say nothing).
 * Measurements that belong to another model named in the same field are removed, so a sibling's size can never support a claim.
 */
export function modelEvidence(rows, focuses) {
  const { own, isFocus } = rowsAboutModel(rows, focuses);
  const text = own.map((row) => [row.title, row.snippet].map((field) => withoutMisattributed(field, isFocus)).join(' ')).join(' \n ');
  const evidence = normalize(text);
  return evidence.length >= MIN_EVIDENCE_CHARS ? evidence : '';
}

/** The registered, non-marketplace results that name the exact original model, and whether a model key is that model. Shared by what the sources say and what they measure. */
function rowsAboutModel(rows, focuses) {
  const list = (Array.isArray(focuses) ? focuses : []).filter((focus) => focus.length >= 5);
  const patterns = list.map((focus) => new RegExp(`\\b${escapeRegExp(focus)}\\b`, 'i'));
  const isFocus = (key) => list.some((focus) => matchesFocus(key, focus).match);
  if (!patterns.length) return { own: [], isFocus };
  const own = (Array.isArray(rows) ? rows : [])
    .filter((row) => { const source = safeSourceUrl(row?.url); return source && source.sourceClass !== SOURCE_CLASS.MARKETPLACE; })
    .filter((row) => patterns.some((pattern) => pattern.test(`${row.title} ${row.snippet}`)));
  return { own, isFocus };
}

// A refrigerator's nominal width is 24 to 48 inches; a larger inch figure is a height and is never read as a width.
const WIDTH_RANGE = [24, 48];
const MIN_SIZE_ROWS = 2;

/**
 * The original's own total capacity (cu ft) and nominal width (inches) as the sources state them for the EXACT model. A figure counts only when at
 * least two separate results state it for that model and no result states a different one (a sibling's measurements are removed first, see
 * `withoutMisattributed`): otherwise it is unknown, never a guess. This is what lets a listing's stated size be compared with the original when the
 * model's own claim about the size was wrong or unsupported (a 27.8 cu ft claim for a 26.8 cu ft refrigerator).
 * @returns {{capacity: number|null, width: number|null}}
 */
export function sourcedSize(rows, focuses) {
  const { own, isFocus } = rowsAboutModel(rows, focuses);
  // "36-inch" and "26.8-cu. ft." are the same quantities as "36 inch" and "26.8 cu. ft.".
  const spaced = (field) => String(field || '').replace(/(\d)\s*-\s*(?=inch|in\b|cu|cubic)/gi, '$1 ');
  const settle = (unit, within) => {
    const perRow = own.map((row) => [...new Set([row.title, row.snippet].flatMap((field) => attributedQuantities(spaced(field), isFocus)).filter((quantity) => quantity.unit === unit && within(quantity.value)).map((quantity) => quantity.value))]);
    const stating = perRow.filter((values) => values.length);
    const values = stating.flat();
    if (stating.length < MIN_SIZE_ROWS || !values.every((value) => agrees({ value: values[0], unit }, { value, unit }))) return null;
    return [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) / 2)];
  };
  return { capacity: settle('cuft', (value) => value >= 3 && value <= 60), width: settle('inch', (value) => value >= WIDTH_RANGE[0] && value <= WIDTH_RANGE[1]) };
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
