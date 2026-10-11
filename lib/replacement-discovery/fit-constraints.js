import { setFact } from './normalize-adapter.js';

/**
 * Reads fit constraints the USER actually states (available space, required mount reuse, panel-ready).
 *
 * - A dimension only counts when a cue word ("must fit", "opening", "cabinet", "max"...) is NEAR it:
 *   "current unit is 36 inches wide" describes a product, it does not constrain the replacement.
 * - Dimensions are read in one left-to-right pass so "width 36 height 70" and "36 wide 70 high" cannot cross-pair.
 * - A physical-space statement that cannot be read (feet, mm, fractions, "36w x 84h") is never dropped: it is
 *   recorded as `fitConstraintStated` so the fit check treats it as UNVERIFIED instead of "no constraint".
 * - Input is length-capped and whitespace-collapsed first; every pattern is linear-time.
 */

const MAX_TEXT_LENGTH = 2000;
const CUE_BEFORE = 40;
const CUE_AFTER = 25;
const CUE_AFTER_SHORT = 14;
const MIN_OPENING_IN = 10;
const MAX_OPENING_IN = 150;
const CUE = /\b(?:must fit|needs? to fit|fits? (?:in|into|within)|opening|cutout|cabinet|niche|alcove|space|max(?:imum)?|no more than|not (?:more|wider|taller|deeper|larger) than|no (?:wider|taller|deeper|larger) than|up to|at most)\b/i;
const STRONG_CUE = /\b(?:must fit|needs? to fit|fits? (?:in|into|within)|opening|cutout|cabinet|niche|alcove|space)\b/gi;
const AXIS_KEY = Object.freeze({ wide: 'Width', width: 'Width', high: 'Height', tall: 'Height', height: 'Height', deep: 'Depth', depth: 'Depth' });
const NUMBER = String.raw`(\d{2,3}(?:\.\d+)?)`;
const UNIT = String.raw`(?:"|”|-? ?inch(?:es)?|in\b)`;
// Axis-first ("width 36") OR number-first ("36 wide"); leftmost match wins, so neighbours cannot cross-pair.
const DIMENSION = new RegExp(String.raw`\b(width|wide|height|high|tall|depth|deep)\b(?: ?[=:]| (?:of|is|up to|max(?:imum)?))? ?${NUMBER}(?: ?${UNIT})?|${NUMBER} ?${UNIT}?[- ]?\b(wide|width|high|tall|height|deep|depth)\b`, 'gi');
// A number with a unit/marker the dimension pattern cannot read: feet, mm/cm, fractions, "36w x 84h", "36 1/2 inches wide".
const UNREAD = /\d+ ?\/ ?\d+|\d ?(?:ft|feet|foot|mm|cm|meters?|')|\d ?[whd]\b|\d\S{0,12} ?(?:wide|width|high|tall|height|deep|depth)/i;
const NEGATION = /\b(?:not|no|don'?t|do not|without|doesn'?t|does not|never)\b/i;
const MOUNT_REUSE = /\b(?:reuse|re-use|keep|use)(?: the| my)? existing (?:wall )?mount\b|\bmount reuse(?: required)?\b|\bmust (?:reuse|fit)(?: the)?(?: existing)?(?: wall)? mount\b/i;
const MOUNT_PATTERN = /\b(?:VESA ?)?(\d{2,3}) ?[x×] ?(\d{2,3})\b/i;
const PANEL_READY = /\bpanel[ -]?ready\b|\bcabinet[ -]?panel\b|\bcustom panel\b/i;
const basis = 'USER_FIT_CONSTRAINT';

/** The cue must be in the same clause: before the number (40 chars, not across a sentence break) or right after it (12 chars, not across punctuation). */
function cueNear(text, index, length) {
  const before = text.slice(Math.max(0, index - CUE_BEFORE), index).split(/[;.]/).at(-1);
  const after = text.slice(index + length, index + length + CUE_AFTER_SHORT).split(/[;,.]/)[0];
  return CUE.test(`${before} ${text.slice(index, index + length)} ${after}`);
}
const negated = (text, index) => NEGATION.test(text.slice(Math.max(0, index - CUE_AFTER), index));

function openingValues(text) {
  const found = {};
  for (const match of text.matchAll(DIMENSION)) {
    if (!cueNear(text, match.index, match[0].length)) continue;
    const axis = AXIS_KEY[(match[1] || match[4]).toLowerCase()];
    const value = Number(match[2] || match[3]);
    if (!(value >= MIN_OPENING_IN && value <= MAX_OPENING_IN)) continue;
    found[axis] = [...new Set([...(found[axis] || []), value])];
  }
  return found;
}

/** A physical-space cue followed by a number we could not read as inches. Runs on text with the readable dimensions removed. */
function hasUnreadStatement(text) {
  const rest = text.replace(DIMENSION, ' ');
  for (const cue of rest.matchAll(STRONG_CUE)) {
    if (UNREAD.test(rest.slice(cue.index + cue[0].length, cue.index + cue[0].length + CUE_BEFORE))) return true;
  }
  return false;
}

export function addFitConstraintFacts(rawText, category, facts) {
  const text = String(rawText).slice(0, MAX_TEXT_LENGTH).replace(/\s+/g, ' ');
  const openings = openingValues(text);
  for (const [axis, values] of Object.entries(openings)) {
    const key = `opening${axis}In`;
    if (values.length === 1) setFact(facts, key, 'KNOWN', values[0], basis);
    else facts[key] = { status: 'AMBIGUOUS', value: null, alternatives: values, evidenceRefs: ['user-input'], basis: 'CONFLICTING_INPUT' };
  }
  if (hasUnreadStatement(text)) setFact(facts, 'fitConstraintStated', 'KNOWN', true, 'UNPARSED_FIT_STATEMENT');
  if (category === 'television') {
    const reuse = text.match(MOUNT_REUSE);
    if (reuse) setFact(facts, 'mountReuseRequired', 'KNOWN', !negated(text, reuse.index), basis);
    const pattern = text.match(MOUNT_PATTERN);
    if (pattern) setFact(facts, 'mountPattern', 'KNOWN', `${pattern[1]}x${pattern[2]}`, 'USER_INPUT');
  }
  if (category === 'refrigerator') {
    const panel = text.match(PANEL_READY);
    if (panel) setFact(facts, 'panelReady', 'KNOWN', !negated(text, panel.index), basis);
  }
}
