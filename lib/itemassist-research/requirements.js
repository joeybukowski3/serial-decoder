/**
 * Weighted LKQ requirements for ItemAssist Research (research.2).
 *
 * Importance is decided by code, not by the model. Each profile (television, refrigerator, washer, ...) carries the essentials for that
 * kind of item. The model may refine the wording of an essential and may add further IMPORTANT or MINOR criteria, but it can neither
 * drop an essential, lower one, nor invent a new one: a model-added ESSENTIAL is recorded as DOWNGRADED to IMPORTANT. That keeps an
 * essential shortfall meaningful (it excludes a candidate) and keeps an over-eager reply from excluding every candidate.
 */

import { findResearchClaim } from './contract.js';

export const IMPORTANCE = Object.freeze({ ESSENTIAL: 'ESSENTIAL', IMPORTANT: 'IMPORTANT', MINOR: 'MINOR' });
export const ORIGIN = Object.freeze({ CATEGORY_RULE: 'CATEGORY_RULE', AI_ESTIMATE: 'AI_ESTIMATE' });
export const MAX_REQUIREMENTS = 8;
const MAX_TEXT = 160;
const KEY_PATTERN = /^[a-z][A-Za-z0-9]{1,23}$/;

const E = IMPORTANCE.ESSENTIAL, I = IMPORTANCE.IMPORTANT, M = IMPORTANCE.MINOR;
const rule = (key, importance, text) => Object.freeze({ key, importance, text });

/** Code-owned criteria per profile. Wording avoids any price, link, stock or assurance claim (the contract's text filter would refuse it). */
export const PROFILES = Object.freeze({
  tv: Object.freeze([
    rule('screenSize', E, 'Screen size class close to the original'),
    rule('resolution', E, 'Same or better resolution (4K or higher)'),
    rule('displayClass', E, 'Same display technology class (OLED, QLED or LED)'),
    rule('refresh', I, 'Native refresh rate (120 Hz where the original had it)'),
    rule('hdmi', I, 'HDMI 2.1 ports for current consoles'),
    rule('hdr', I, 'The HDR formats the original supported'),
    rule('smart', M, 'A smart platform with the apps you use'),
  ]),
  refrigerator: Object.freeze([
    rule('capacity', E, 'Total capacity close to the original (cubic feet)'),
    rule('layout', E, 'Same door layout (French door, side-by-side, top or bottom freezer)'),
    rule('fit', E, 'Width, height and depth that fit the opening, with door clearance'),
    rule('dispenser', I, 'The same ice and water dispenser setup'),
    rule('finish', M, 'A similar finish'),
    rule('efficiency', M, 'Comparable energy efficiency'),
  ]),
  washer: Object.freeze([
    rule('capacity', E, 'Drum capacity close to the original (cubic feet)'),
    rule('loading', E, 'Same loading type (front or top load)'),
    rule('fit', E, 'Width, depth and height that fit the space, including stacking height if used'),
    rule('connections', I, 'Matching water and drain connections'),
    rule('spin', I, 'Spin speed and the wash features you use'),
    rule('smart', M, 'Smart or app features'),
  ]),
  dryer: Object.freeze([
    rule('capacity', E, 'Drum capacity close to the original (cubic feet)'),
    rule('fuel', E, 'Same fuel type (electric or gas) and connection'),
    rule('fit', E, 'Width, depth and height that fit the space, including stacking height if used'),
    rule('venting', I, 'Compatible venting'),
    rule('cycles', M, 'Dry cycles and sensors'),
  ]),
  dishwasher: Object.freeze([
    rule('width', E, 'The same built-in width (typically 24 inches)'),
    rule('fit', E, 'Height, depth and cutout that fit the opening'),
    rule('connections', I, 'Matching water, drain and power connections'),
    rule('rackNoise', I, 'Rack layout (such as a third rack) and noise level'),
    rule('tub', M, 'Tub material and drying method'),
  ]),
  range: Object.freeze([
    rule('fuel', E, 'Same fuel type (gas or electric) and connection'),
    rule('width', E, 'Same width and installation style (freestanding or slide-in)'),
    rule('capacity', I, 'Oven capacity close to the original'),
    rule('burners', I, 'Burner or element layout and output'),
    rule('features', M, 'Convection, air fry and controls'),
  ]),
  microwave: Object.freeze([
    rule('type', E, 'Same type (over-the-range, built-in or countertop)'),
    rule('fit', E, 'Dimensions that fit the space and mounting'),
    rule('capacity', I, 'Interior capacity and power'),
    rule('ventilation', I, 'Ventilation, if it replaces a range hood'),
  ]),
  appliance: Object.freeze([
    rule('capacity', E, 'Similar capacity or size'),
    rule('connection', E, 'Same fuel or connection type (electric, gas, water line)'),
    rule('fit', E, 'Dimensions that fit the existing space and hookups'),
    rule('features', I, 'The main features you use every day'),
  ]),
  electronics: Object.freeze([
    rule('formFactor', E, 'Same form factor and size class'),
    rule('capacity', E, 'Storage or capacity at least equal to the original'),
    rule('performance', I, 'Equal or better key performance (processor, memory, display)'),
    rule('ports', I, 'The ports and connections you rely on'),
    rule('compatibility', I, 'Compatibility with your accessories and apps'),
  ]),
  other: Object.freeze([
    rule('type', E, 'Same type of product'),
    rule('size', E, 'Similar size or capacity'),
    rule('features', I, 'The key features you use most'),
  ]),
  unknown: Object.freeze([
    rule('type', E, 'Same type of product'),
    rule('size', E, 'Similar size or capacity'),
    rule('features', I, 'The key features you use most'),
  ]),
});

export const CATEGORY_PROFILES = Object.freeze({
  tv: ['tv'], refrigerator: ['refrigerator'], appliance: ['washer', 'dryer', 'dishwasher', 'range', 'microwave', 'appliance'],
  electronics: ['electronics'], other: ['other'], unknown: ['unknown'],
});

/** The profile to use: the requested one if it belongs to the category, otherwise the category's default. */
export function resolveProfile(category, requested) {
  const allowed = CATEGORY_PROFILES[category] || CATEGORY_PROFILES.unknown;
  return allowed.includes(requested) ? requested : allowed[allowed.length - 1];
}

const ORDER = [E, I, M];

/**
 * What each code-owned criterion is about, as plain patterns, so an added criterion that only restates one ("55 inch screen size" beside
 * "Screen size class close to the original") is recognised. Keys not listed here are matched on exact wording only.
 */
const RESTATES = Object.freeze({
  screenSize: /\b(?:screen|display|panel) size\b|\bsize class\b|\b\d{2,3}[- ]?(?:inch|in)\b|\b\d{2,3}"/i,
  resolution: /\b(?:4k|8k|uhd|1080p|resolution)\b/i,
  displayClass: /\b(?:oled|qd-?oled|qled|neo qled|mini-?led|led)\b|\b(?:display|panel) (?:technology|class|type)\b/i,
  refresh: /\b\d{2,3} ?hz\b|\brefresh rate\b/i,
  hdmi: /\bhdmi\b/i,
  hdr: /\b(?:hdr10?\+?|dolby vision|hlg)\b|\bhdr formats?\b/i,
});

/** True when `text` only restates a criterion the category rules already own for this profile. */
const restatesOwned = (text, base) => base.some((owned) => RESTATES[owned.key]?.test(text));

/**
 * @param {unknown} raw model- or fixture-supplied criteria: `{key?, text, importance?}` objects (a bare string is a MINOR addition)
 * @returns {{items: object[], notes: {scope: string, reason: string, action: string}[]}}
 */
export function buildRequirements(raw, profile) {
  const base = PROFILES[profile] || PROFILES.unknown;
  const notes = [];
  const supplied = (Array.isArray(raw) ? raw : []).slice(0, 24).map((entry) => (typeof entry === 'string' ? { text: entry } : entry)).filter((entry) => entry && typeof entry === 'object');
  const byKey = new Map(supplied.filter((entry) => typeof entry.key === 'string').map((entry) => [entry.key, entry]));
  const safe = (value) => (typeof value === 'string' && value.trim() && !findResearchClaim(value) ? value.trim().slice(0, MAX_TEXT) : null);

  const items = base.map((owned) => {
    const refined = safe(byKey.get(owned.key)?.text);
    const wanted = byKey.get(owned.key)?.importance;
    if (wanted && wanted !== owned.importance) notes.push({ scope: 'REQUIREMENT', reason: 'IMPORTANCE_FIXED_BY_CODE', action: 'DOWNGRADED' });
    return { key: owned.key, text: refined || owned.text, importance: owned.importance, origin: ORIGIN.CATEGORY_RULE };
  });
  const ownedKeys = new Set(base.map((entry) => entry.key));
  for (const entry of supplied) {
    if (typeof entry.key === 'string' && ownedKeys.has(entry.key)) continue;
    const text = safe(entry.text);
    if (!text || items.some((item) => item.text.toLowerCase() === text.toLowerCase())) continue;
    // Code-owned criteria take precedence: an addition that only restates one is dropped, so it neither repeats it nor uses up a place.
    if (restatesOwned(text, base)) continue;
    let importance = typeof entry.importance === 'string' && Object.hasOwn(IMPORTANCE, entry.importance) ? IMPORTANCE[entry.importance] : M;
    if (importance === E) { importance = I; notes.push({ scope: 'REQUIREMENT', reason: 'ESSENTIAL_FROM_AI_DOWNGRADED', action: 'DOWNGRADED' }); }
    const key = typeof entry.key === 'string' && KEY_PATTERN.test(entry.key) ? entry.key : null;
    items.push({ key, text, importance, origin: ORIGIN.AI_ESTIMATE });
  }
  // Every code-owned criterion is kept; additions fill the places that remain, most important first. Essentials come first in the list.
  const owned = items.filter((item) => item.origin === ORIGIN.CATEGORY_RULE);
  const room = Math.max(0, MAX_REQUIREMENTS - owned.length);
  const added = items.filter((item) => item.origin !== ORIGIN.CATEGORY_RULE).sort((a, b) => ORDER.indexOf(a.importance) - ORDER.indexOf(b.importance)).slice(0, room);
  const ordered = [...owned, ...added].sort((a, b) => ORDER.indexOf(a.importance) - ORDER.indexOf(b.importance));
  return { items: ordered.map((item, index) => ({ id: `r${index + 1}`, ...item })), notes };
}

export const essentialIds = (requirements) => requirements.filter((item) => item.importance === E).map((item) => item.id);
