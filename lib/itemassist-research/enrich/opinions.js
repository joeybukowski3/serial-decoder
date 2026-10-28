/**
 * Claims in a candidate's text that nothing the search returned can support. The identification is general knowledge about product FAMILIES: it
 * has no source for how reliable a line is, or for what a newer generation changed. Those sentences read as established product facts, so they are
 * omitted (not softened and not flagged with a warning): a reliability opinion anywhere in the candidate's text, and a claim about what changed
 * between generations in its "differences". What is left is the model's plain comparison of layout, capacity and class, which the rest of the answer
 * already labels as unverified.
 */

// Reliability, durability, quality history and repair reputation: opinions no retrieved source states.
const RELIABILITY = /\b(?:(?:un)?reliab\w*|dependab\w*|durab\w*|longevity|pain[- ]?points?|prone to|(?:build|overall) quality|quality[- ]control|breakdowns?|failures?|defects?|recalls?|repairs?|(?:known|common|frequent|recurring|reported|historical|long[- ]term|widespread)\s+(?:\w+\s+){0,2}(?:issues?|problems?|complaints?|concerns?))\b/i;

// What a newer generation changed ("Updated shelving", "refined styling", "processor updates"): a specification change nothing retrieved states.
const FEATURE_CHANGE = /\b(?:updated?|updates|refreshed?|redesigned?|revamped|refined?|upgraded?|enhanced?|improved?|incremental|newer|newest|new (?:design|processor|panel|chip|model|feature|features|technology|generation|version))\b/i;

const sentences = (value) => String(value).split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
const without = (value, pattern) => {
  if (typeof value !== 'string' || !value.trim()) return value;
  return sentences(value).filter((part) => !pattern.test(part)).join(' ').trim() || null;
};

/** What the page says about a candidate when its whole reason was an opinion: the plain fact that it is a comparable family. */
export const NEUTRAL_WHY = 'A comparable product family to consider.';

/**
 * @param {{why: string, differences: string|null, concern: string|null}} fields  a candidate's model-written text
 * @returns {{why: string, differences: string|null, concern: string|null}} the same fields with unsupported sentences removed (null when nothing is left)
 */
export function withoutUnsupportedOpinions({ why, differences, concern }) {
  return {
    why: without(why, RELIABILITY) || NEUTRAL_WHY,
    differences: without(without(differences, RELIABILITY), FEATURE_CHANGE),
    concern: without(concern, RELIABILITY),
  };
}
