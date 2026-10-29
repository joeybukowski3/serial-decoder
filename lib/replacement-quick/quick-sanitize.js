import { CATEGORIES, DISCLOSURE, LIMITS } from './quick-prompt.js';

/**
 * Turns whatever the model returned into the public Fast Answer shape. The model is never trusted: every string is cleaned,
 * length-limited and checked for claims this feature must not make (links, prices, stock, retailers, dates), every list is capped,
 * and every suggestion is labelled unverified by code rather than by the model.
 */

// 2: adds `successor`. Bump on any change to the public answer shape.
export const ANSWER_VERSION = 2;
// RECOMMENDED: a direct successor with no stated shortfall. CONDITIONAL: it carries a stated concern or a low-confidence
// identification, so it is shown as one candidate to weigh, never as an unconditional first choice. Set by code, not by the model.
export const SUCCESSOR_STANDING = Object.freeze({ RECOMMENDED: 'RECOMMENDED', CONDITIONAL: 'CONDITIONAL' });
export const ANSWER_STATUS = Object.freeze({ OK: 'OK', PARTIAL: 'PARTIAL', GUIDANCE_ONLY: 'GUIDANCE_ONLY', UNAVAILABLE: 'UNAVAILABLE', INVALID_REQUEST: 'INVALID_REQUEST' });
export const REQUIREMENTS_SOURCE = Object.freeze({ AI: 'AI_ESTIMATE', MIXED: 'AI_ESTIMATE_PLUS_CATEGORY_GUIDANCE', GUIDANCE: 'CATEGORY_GUIDANCE' });

const GENERIC_GUIDANCE = Object.freeze([
  'Same type of product and similar size or capacity',
  'The key features you use most',
  'Compatible connections, power or accessories',
  'Dimensions that fit the space where it will be used',
]);

/** Safe, model-free requirements used when the model's own list is missing or too short. */
export const CATEGORY_GUIDANCE = Object.freeze({
  tv: Object.freeze([
    'Screen size close to the original so it fits the same space',
    'Same or better resolution (4K or higher)',
    'Same display type if picture quality matters (OLED, QLED or LED)',
    'Enough HDMI ports and the smart apps you use',
    'A mounting pattern (VESA) that fits your wall mount, if you have one',
  ]),
  refrigerator: Object.freeze([
    'Similar total capacity in cubic feet',
    'Same door layout (French door, side-by-side, top or bottom freezer)',
    'Width, height and depth that fit your opening, with door-swing clearance',
    'Same ice and water dispenser setup, if you use it',
    'Similar finish (stainless, black stainless or white)',
  ]),
  appliance: Object.freeze([
    'Similar capacity or size',
    'Same fuel or connection type (electric, gas, water line)',
    'Dimensions that fit the existing space and hookups',
    'The main features you use every day',
  ]),
  electronics: Object.freeze([
    'Same type of device and similar size',
    'Matching or better key performance specs',
    'The ports and connections you rely on',
    'Compatibility with your existing accessories and apps',
  ]),
  other: GENERIC_GUIDANCE,
  unknown: GENERIC_GUIDANCE,
});

// A retailer name alone is not a claim ("Amazon Fire TV", "works with Amazon Alexa" are product names and features). It is only
// removed in a selling context: "at/from/sold by <retailer>" or "<retailer> sells/carries/bundle/deal...".
const RETAILER = String.raw`(?:amazon(?!\s+(?:fire|alexa|echo|kindle|music|appstore|freevee|luna|basics|prime\s+video)\b)|best\s?buy|walmart|home\s?depot|lowe'?s|costco|newegg|ebay|b&h|aj\s?madison)(?![a-z])`;
const RETAILER_CLAIM = new RegExp(
  String.raw`\b(?:at|from|via|through|on|by|sold\s+(?:by|at|on|through)|carried\s+by|stocked\s+by|exclusive\s+to|only\s+(?:at|from|on)|shop\s+(?:at|on))\s+(?:the\s+)?${RETAILER}`
  + String.raw`|\b${RETAILER}(?:'s)?\s+(?:sells?|carr(?:y|ies)|has|stocks?|offers?|bundles?|exclusive|listings?|deals?|prices?|pricing|sales?|clearance|open[-\s]box|only|stores?|website|site|cart|promo\w*|coupon\w*|discount\w*)\b`,
  'i',
);

const CLAIM_PATTERNS = Object.freeze([
  ['URL', /https?:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:com|net|org|io|co|us|ca|uk|shop|store)\b/i],
  ['PRICE', /[$€£]\s?\d|\b\d[\d,.]*\s?(?:usd|dollars?|bucks)\b|\bmsrp\b|\bpriced?\s+(?:at|around|about|from|under|near|between)\b|\b(?:discount\w*|coupon\w*|deals?|sale|cheapest|lowest[-\s]price)\b/i],
  ['AVAILABILITY', /\b(?:in[-\s]stock|out[-\s]of[-\s]stock|backorder\w*|pre-?order\w*|available\s+(?:at|from|on|now|today|online|in\s+stores?)|currently\s+(?:sold|available)|(?:still|now)\s+(?:being\s+)?(?:sold|made|produced|manufactured|offered)|(?:still|widely|readily|generally|commonly)\s+available|(?:currently|now)\s+offered|available\s+in\s+\d+|sold\s+(?:in\s+\d+|worldwide|globally|widely)|(?:currently\s+)?in\s+production|on\s+the\s+market|(?:current|latest|newest)\s+(?:model|version|generation|lineup)\s+(?:is\s+|are\s+)?(?:sold|available|offered)|(?:buy|order|shop)\s+(?:it\s+)?(?:now|at|from|on|online)|add\s+to\s+cart|free\s+shipping|ships?\s+(?:in|within)|while\s+supplies\s+last|limited\s+stock)\b/i],
  ['RETAILER', RETAILER_CLAIM],
  ['LIFECYCLE', /\b(?:discontinued|no\s+longer\s+(?:sold|made|available|produced|manufactured)|end[-\s]of[-\s]life|(?:released|launched|introduced|announced)\s+(?:in|on)|(?:released|launched|introduced|announced)\s+(?:early|mid|late)?\s*(?:19|20)\d\d)\b/i],
]);

/** Name of the first forbidden claim type found in `text` (URL, PRICE, AVAILABILITY, RETAILER, LIFECYCLE), or null. */
export function findUnsafeClaim(text) {
  const hit = CLAIM_PATTERNS.find(([, pattern]) => pattern.test(text));
  return hit ? hit[0] : null;
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g;
// Only real HTML is removed. Bare "<", ">", "<=" and ">=" are kept: they are specs ("<1 ms", ">= 4 HDMI ports", "> 800 nits").
const HTML_TAG = /<\/?[a-z][a-z0-9-]*(?:\s[^<>]*)?\/?>|<!--[\s\S]*?-->/gi;
const ACTIVE_MARKUP = /<\s*(?:script|style|iframe|object|embed|svg|link|meta|form)\b|javascript:/i;
const FORMATTING = /`|\*\*/g;
const NOT_A_VALUE = /^(?:unknown|n\/a|none|null|undefined|unidentified|unclear|not\s+(?:sure|known|identified))\.?$/i;
const CONFIDENCE_RANK = Object.freeze({ low: 0, medium: 1, high: 2 });
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const squash = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function cleanText(value, max) {
  if (typeof value !== 'string' || ACTIVE_MARKUP.test(value)) return null;
  const text = value.replace(CONTROL, ' ').replace(HTML_TAG, ' ').replace(FORMATTING, '').replace(/\s+/g, ' ').trim();
  if (!text || NOT_A_VALUE.test(text)) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Cleaned text, or null when empty or it makes a forbidden claim (the claim type is added to `removed`). */
function safeText(value, max, removed) {
  const text = cleanText(value, max);
  if (!text) return null;
  const claim = findUnsafeClaim(text);
  if (!claim) return text;
  removed.add(claim);
  return null;
}

const safeList = (value, cap, max, removed) => (Array.isArray(value) ? value : [])
  .map((item) => safeText(item, max, removed)).filter(Boolean).slice(0, cap);

// Own-property check on a string only: "toString", "constructor", "__proto__" and arrays/objects are not confidence labels.
const rankedConfidence = (value) => (typeof value === 'string' && Object.hasOwn(CONFIDENCE_RANK, value) ? value : 'low');
const capConfidence = (value, ceiling) => (CONFIDENCE_RANK[rankedConfidence(value)] <= CONFIDENCE_RANK[ceiling] ? rankedConfidence(value) : ceiling);

/** Cheap keyword guess, used only to pick category guidance when the model gave no usable category. */
export function guessCategory(query) {
  const text = String(query || '').toLowerCase();
  if (/\b(?:tv|television|oled|qled|uhd)\b/.test(text)) return 'tv';
  if (/\b(?:fridge|refrigerator|freezer)\b/.test(text)) return 'refrigerator';
  if (/\b(?:washer|dryer|dishwasher|oven|range|microwave|stove)\b/.test(text)) return 'appliance';
  return 'unknown';
}

const SPEC_TOKEN = /^\d+(?:k|p|x|hz|gb|tb|mb|w|v|l|mm|cm|in|ft|lb|lbs|cu|ms|nits)$/;
const FEATURE_TOKEN = /^(?:hdr|hdmi|wifi|usb|gen|dolby|atmos|bt|cat)\d*\+?$/;
const IGNORED_WORDS = new Set(['the', 'and', 'for', 'with', 'old', 'new', 'my', 'our', 'your', 'this', 'that', 'used']);

const SIZE_QUESTION = 'What screen size do you need?';
const SIZE_WORDS = /\b(?:size|inch|inches|in\.)/i;
const TV_SIZE = '(?:24|27|28|32|40|42|43|48|50|55|58|60|65|70|75|77|82|83|85|86|98)';
// Any number with a unit ("49 inch", '100"', "65-in"); a bare common size ("55", but not "60 Hz"); a size inside a model code
// ("oled65c3pua", "65a80l", "qn65s90c"). "60hz", "s90c" and "c3" are not sizes.
const SCREEN_SIZE = new RegExp(
  String.raw`\b\d{2,3}\s?-?\s?(?:"|”|″|''|in\b|inch(?:es)?\b)|(?:^|\s)${TV_SIZE}(?=\s|$)(?!\s?(?:hz|years?|yrs?|nits|ms|w)\b)|\b${TV_SIZE}[a-z]+\d|\b[a-z]{2,6}${TV_SIZE}[a-z]+\d`,
  'i',
);

/**
 * The questions to show. A confident identification keeps only a size question from the model (the prompt allows nothing else).
 * A television described without a size is always asked for one, first, unless the model already asked.
 */
function clarifyQuestions(rawQuestions, { query, isTv, confident, removed }) {
  const asked = safeList(rawQuestions, LIMITS.maxClarify, LIMITS.maxQuestion, removed);
  const questions = confident ? asked.filter((q) => SIZE_WORDS.test(q)) : asked;
  if (!isTv || !query || SCREEN_SIZE.test(query) || questions.some((q) => SIZE_WORDS.test(q))) return questions;
  return [SIZE_QUESTION, ...questions].slice(0, LIMITS.maxClarify);
}

/** Model-code-like tokens: letters AND digits (c3, s90d, oled55c3pua). Sizes and specs (65, 4k, 120hz, hdr10) are not codes. */
function modelCodes(text) {
  const tokens = String(text || '').toLowerCase().split(/[^a-z0-9]+/);
  return [...new Set(tokens.filter((t) => t.length >= 2 && /[a-z]/.test(t) && /\d/.test(t) && !SPEC_TOKEN.test(t) && !FEATURE_TOKEN.test(t)))];
}

/** True when code `small` appears in `big` as the same model, not as part of a different one. */
function containsCode(big, small) {
  const startsWithLetter = /[a-z]/.test(small[0]);
  const endsWithDigit = /\d/.test(small.at(-1));
  for (let at = big.indexOf(small); at !== -1; at = big.indexOf(small, at + 1)) {
    const before = big[at - 1];
    const rest = big.slice(at + small.length);
    const startOk = !before || (startsWithLetter ? !/[a-z]/.test(before) : !/\d/.test(before));
    // c3 -> c3pua is the same model with a region code; s90 -> s90d (one letter) and a8 -> a80 are different models.
    const endOk = !endsWithDigit || !rest || /^[a-z]{2,}/.test(rest);
    if (startOk && endOk) return true;
  }
  return false;
}

const sameModel = (a, b) => a === b || containsCode(a, b) || containsCode(b, a);

const SPECIFIC_CATEGORIES = new Set(['tv', 'refrigerator', 'appliance']);
/** tv vs refrigerator/appliance is an obvious mismatch; refrigerator vs appliance, and anything vague, is not. */
const categoriesConflict = (keyword, model) => SPECIFIC_CATEGORIES.has(keyword) && SPECIFIC_CATEGORIES.has(model) && (keyword === 'tv') !== (model === 'tv');
const categoriesAgree = (keyword, model) => keyword !== 'unknown' && (keyword === model || (keyword === 'tv' && model === 'electronics')
  || (['refrigerator', 'appliance'].includes(keyword) && ['refrigerator', 'appliance'].includes(model)));

/** Does the model's identity look unrelated to what the user typed? Conflicting model codes, or no shared words and no category support. */
function identityMismatch({ query, identity, modelCategory, keywordCategory }) {
  const queryCodes = modelCodes(query);
  const identityCodes = modelCodes(identity);
  if (queryCodes.length && identityCodes.length) return !queryCodes.some((q) => identityCodes.some((i) => sameModel(q, i)));
  const target = squash(identity);
  const words = String(query).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !IGNORED_WORDS.has(w));
  if (words.some((w) => target.includes(w))) return false;
  return !categoriesAgree(keywordCategory, modelCategory);
}

function sanitizeOriginal(raw, removed) {
  const source = isObject(raw) ? raw : {};
  const identity = safeText(source.identity, LIMITS.maxIdentity, removed);
  const uncertainty = safeText(source.uncertainty, LIMITS.maxText, removed);
  if (!identity) {
    return { identity: null, confidence: 'low', characteristics: [], uncertainty: uncertainty || 'This product could not be identified from the description.' };
  }
  return {
    identity,
    confidence: rankedConfidence(source.confidence),
    characteristics: safeList(source.characteristics, LIMITS.maxCharacteristics, LIMITS.maxText, removed),
    uncertainty,
  };
}

/** The original's own model codes: a candidate carrying one is the original or an exact SKU variant of it (C3 -> C4 is not). */
const originalCodesOf = (original, query) => modelCodes(`${query} ${original.identity}`);
const sharesModelCode = (name, codes) => modelCodes(name).some((code) => codes.some((own) => sameModel(code, own)));

/**
 * The original maker's direct successor, or null. It follows the same rules as a suggestion (cleaned, claim-checked, never the
 * original or an exact variant of it, never more certain than the identification) plus a stated `concern`. A successor with a
 * concern, or a low-confidence one, is CONDITIONAL rather than an unconditional first choice.
 */
function sanitizeSuccessor(raw, { original, query, removed }) {
  if (!isObject(raw)) return null;
  const name = safeText(raw.name, LIMITS.maxName, removed);
  const why = safeText(raw.why, LIMITS.maxText, removed);
  if (!name || !why) return null;
  if ([squash(query), squash(original.identity)].includes(squash(name)) || sharesModelCode(name, originalCodesOf(original, query))) return null;
  const concern = safeText(raw.concern, LIMITS.maxText, removed);
  // A concern the model raised but a safety filter removed still counts: dropping its text must not upgrade the successor.
  const concernRaised = Boolean(concern) || cleanText(raw.concern, LIMITS.maxText) !== null;
  const confidence = capConfidence(raw.confidence, original.confidence);
  return {
    name,
    why,
    differences: safeText(raw.differences, LIMITS.maxText, removed),
    concern,
    confidence,
    standing: concernRaised || confidence === 'low' ? SUCCESSOR_STANDING.CONDITIONAL : SUCCESSOR_STANDING.RECOMMENDED,
    unverified: true,
  };
}

function sanitizeSuggestions(raw, { original, query, successor, removed }) {
  const seen = new Set([squash(query), squash(original.identity), ...(successor ? [squash(successor.name)] : [])]);
  const originalCodes = originalCodesOf(original, query);
  // A suggestion repeating the successor's model code is the same product listed twice.
  const successorCodes = successor ? modelCodes(successor.name) : [];
  const kept = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    if (kept.length >= LIMITS.maxSuggestions) break;
    const name = isObject(item) ? safeText(item.name, LIMITS.maxName, removed) : null;
    const why = isObject(item) ? safeText(item.why, LIMITS.maxText, removed) : null;
    if (!name || !why || seen.has(squash(name))) continue;
    if (sharesModelCode(name, originalCodes) || sharesModelCode(name, successorCodes)) continue;
    seen.add(squash(name));
    kept.push({
      name,
      why,
      differences: safeText(item.differences, LIMITS.maxText, removed),
      // A suggestion can never be more certain than the identification it rests on. Model codes are always unverified.
      confidence: capConfidence(item.confidence, original.confidence),
      unverified: true,
    });
  }
  return kept;
}

function buildRequirements(aiItems, category) {
  const guidance = CATEGORY_GUIDANCE[category] || GENERIC_GUIDANCE;
  if (aiItems.length >= LIMITS.minRequirements) return { requirements: aiItems, source: REQUIREMENTS_SOURCE.AI };
  const have = new Set(aiItems.map(squash));
  const topUp = guidance.filter((item) => !have.has(squash(item))).slice(0, LIMITS.minRequirements - aiItems.length);
  return { requirements: [...aiItems, ...topUp], source: aiItems.length ? REQUIREMENTS_SOURCE.MIXED : REQUIREMENTS_SOURCE.GUIDANCE };
}

const uncertainIdentification = (original) => original.confidence === 'low' || (original.confidence === 'medium' && Boolean(original.uncertainty));

function warningsFor({ removed, requirementsSource, original, successor, suggestions, mismatch, droppedSuggestions }) {
  const identified = Boolean(original.identity);
  return [
    ...(removed.size ? ['UNSAFE_CLAIMS_REMOVED'] : []),
    ...(requirementsSource === REQUIREMENTS_SOURCE.AI ? [] : ['REQUIREMENTS_FROM_CATEGORY_GUIDANCE']),
    ...(identified ? [] : ['PRODUCT_NOT_IDENTIFIED']),
    ...(droppedSuggestions ? ['SUGGESTIONS_WITHHELD'] : []),
    ...(mismatch ? [mismatch] : []),
    ...(identified && !mismatch && uncertainIdentification(original) ? ['IDENTIFICATION_UNCERTAIN'] : []),
    ...(successor?.standing === SUCCESSOR_STANDING.CONDITIONAL ? ['SUCCESSOR_CONDITIONAL'] : []),
    // A missing difference is flagged, never filled in.
    ...([successor, ...suggestions].some((item) => item && !item.differences) ? ['DIFFERENCES_MISSING'] : []),
  ];
}

const withheldOriginal = () => ({
  identity: null, confidence: 'low', characteristics: [],
  uncertainty: 'The identified product does not match the type of item you described, so no specific replacements are shown.',
});

/**
 * Backs up the model's own uncertainty with checks against what the user typed.
 *  - CATEGORY_MISMATCH (obvious, e.g. a TV for a refrigerator): the identification and its suggestions are withheld.
 *  - IDENTITY_MISMATCH (conflicting model codes, or nothing in common with the description): confidence is forced to low.
 */
function assessIdentity(original, { query, modelCategory, keywordCategory }) {
  if (!original.identity || !query) return { original, mismatch: null };
  if (categoriesConflict(keywordCategory, modelCategory)) return { original: withheldOriginal(), mismatch: 'CATEGORY_MISMATCH' };
  if (identityMismatch({ query, identity: original.identity, modelCategory, keywordCategory })) return { original: { ...original, confidence: 'low' }, mismatch: 'IDENTITY_MISMATCH' };
  return { original, mismatch: null };
}

/**
 * @param {unknown} parsed  the model's parsed JSON (anything; non-objects yield category guidance only)
 * @param {{query?: string}} [context]
 * @returns the public answer; never throws, never contains more than the limits allow
 */
export function sanitizeQuickAnswer(parsed, { query = '' } = {}) {
  const raw = isObject(parsed) ? parsed : {};
  const removed = new Set();
  const keywordCategory = guessCategory(query);
  const modelCategory = CATEGORIES.includes(raw.category) ? raw.category : 'unknown';
  const { original, mismatch } = assessIdentity(sanitizeOriginal(raw.original, removed), { query, modelCategory, keywordCategory });
  const categoryConflict = mismatch === 'CATEGORY_MISMATCH';
  // On an obvious conflict the user's own words decide the category, and the model's category-specific lists are not used.
  const category = categoryConflict ? keywordCategory : modelCategory !== 'unknown' ? modelCategory : keywordCategory;
  const identified = Boolean(original.identity);
  // An unidentified product gets no successor and no product suggestions: category guidance is the safe answer.
  const successor = identified ? sanitizeSuccessor(raw.successor, { original, query, removed }) : null;
  const suggestions = identified ? sanitizeSuggestions(raw.suggestions, { original, query, successor, removed }) : [];
  const droppedSuggestions = !identified && ((Array.isArray(raw.suggestions) && raw.suggestions.length > 0) || isObject(raw.successor));
  const aiRequirements = categoryConflict ? [] : safeList(raw.requirements, LIMITS.maxRequirements, LIMITS.maxText, removed);
  const { requirements, source } = buildRequirements(aiRequirements, category);
  const confident = identified && original.confidence === 'high' && (suggestions.length > 0 || Boolean(successor));
  // The user's own words count too: a model that files a TV under "electronics" still gets the size question.
  const isTv = category === 'tv' || keywordCategory === 'tv';
  const clarify = categoryConflict ? [] : clarifyQuestions(raw.clarify, { query, isTv, confident, removed });

  return {
    version: ANSWER_VERSION,
    status: !identified ? ANSWER_STATUS.GUIDANCE_ONLY : successor || suggestions.length ? ANSWER_STATUS.OK : ANSWER_STATUS.PARTIAL,
    category,
    original,
    requirements,
    requirementsSource: source,
    successor,
    suggestions,
    clarify,
    disclosure: DISCLOSURE,
    warnings: warningsFor({ removed, requirementsSource: source, original, successor, suggestions, mismatch, droppedSuggestions }),
    removedClaimTypes: [...removed].sort(),
  };
}

/** Category guidance only, for a request that was invalid or whose provider call failed. */
export function buildFallbackAnswer({ status, query = '' }) {
  const answer = sanitizeQuickAnswer(null, { query });
  return { ...answer, status, warnings: [...answer.warnings, ...(status === ANSWER_STATUS.UNAVAILABLE ? ['PROVIDER_UNAVAILABLE'] : [])] };
}
