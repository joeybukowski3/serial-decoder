import { sanitizeQuickAnswer } from '../replacement-quick/quick-sanitize.js';

/**
 * Server-controlled fixture mode for ItemAssist Research, for a connected Vercel PREVIEW only. It replaces the single Gemini call
 * with a canned reply that still goes through the real sanitizer, the real public contract and the real validity check, so the
 * frontend proxy, its projection and the whole two-panel UI can be exercised end to end with no provider and no cost.
 *
 * What selects it: two server environment variables, evaluated here and nowhere else.
 *   ITEMASSIST_RESEARCH_FIXTURE_MODE === 'preview'  AND  VERCEL_ENV === 'preview'   (VERCEL_ENV is set by the platform)
 * Nothing in a request (body, query string, header, cookie) is ever read to decide this. The query text only chooses WHICH canned
 * reply is returned once the mode is already active.
 *
 * The flag set anywhere else (Production, local, unknown) does not fall back to the real provider: the mode is REFUSED and the route
 * answers API_DISABLED, so a stray variable can neither spend provider budget nor serve canned answers outside a Preview.
 *
 * Fixture mode never touches Redis. The budget, the cache and the usage counters run unchanged against an in-memory store that
 * lives and dies with the function instance, so no fixture answer can ever be read back as a real cached answer.
 */

export const FIXTURE_MODE_ENV = 'ITEMASSIST_RESEARCH_FIXTURE_MODE';
export const FIXTURE_MODE_VALUE = 'preview';
export const FIXTURE_STATE = Object.freeze({ OFF: 'off', ACTIVE: 'active', REFUSED: 'refused' });

/** off: variable absent or empty. active: exactly the Preview combination. refused: the variable is set in any other combination. */
export function fixtureModeState(env = {}) {
  const flag = typeof env[FIXTURE_MODE_ENV] === 'string' ? env[FIXTURE_MODE_ENV].trim() : '';
  if (!flag) return FIXTURE_STATE.OFF;
  return flag === FIXTURE_MODE_VALUE && env.VERCEL_ENV === 'preview' ? FIXTURE_STATE.ACTIVE : FIXTURE_STATE.REFUSED;
}

// The shape a model reply has before the sanitizer sees it. Plain general knowledge, no links, prices, availability or dates.
const TV_REPLY = Object.freeze({
  category: 'tv',
  original: {
    identity: 'LG C3 series 4K OLED smart TV', confidence: 'high',
    characteristics: ['OLED panel with self-lit pixels', '4K resolution', '120 Hz panel', 'webOS smart platform'],
    uncertainty: null,
  },
  requirements: ['Same screen size class as the original', 'OLED or better panel technology', '4K resolution', 'At least four HDMI 2.1 ports for consoles', 'A smart platform with the apps you already use'],
  successor: {
    name: 'LG C4 series OLED', why: 'The next generation of the same LG C-series OLED line.', differences: 'Newer processor and a brighter panel on some sizes.',
    concern: null, confidence: 'high',
  },
  suggestions: [
    { name: 'Samsung S90D QD-OLED', why: 'Comparable premium OLED-class picture quality.', differences: 'Different smart platform and remote.', confidence: 'medium' },
    { name: 'Sony Bravia 8 OLED', why: 'Similar tier with strong picture processing.', differences: 'Fewer gaming features on some sizes.', confidence: 'medium' },
  ],
  clarify: ['What screen size do you need?'],
});

const FRIDGE_REPLY = Object.freeze({
  category: 'refrigerator',
  original: {
    identity: 'Samsung RF28 series French door refrigerator', confidence: 'medium',
    characteristics: ['French door layout', 'About 28 cubic feet of capacity', 'Bottom freezer drawer', 'Ice and water in the door on some versions'],
    uncertainty: 'The exact capacity, finish and dispenser setup were not given.',
  },
  requirements: ['Similar total capacity', 'Same French door layout', 'Width, height and depth that fit your opening', 'Door-swing clearance in your kitchen', 'The same ice and water setup if you use it'],
  successor: {
    // No model code of its own: the sanitizer drops a candidate that repeats the original's code (RF28) as the same product.
    name: 'Samsung Bespoke French door series', why: 'A newer Samsung French door line with the same layout.', differences: 'Updated cooling and a refreshed control panel.',
    concern: 'Depth and door swing can differ between generations, so measure the opening first.', confidence: 'medium',
  },
  suggestions: [
    { name: 'LG LRFXC series French door', why: 'Comparable capacity and layout.', differences: 'Different drawer arrangement and finish options.', confidence: 'medium' },
    { name: 'Whirlpool WRF series French door', why: 'A similar full-size French door layout.', differences: 'Smaller dispenser options.', confidence: 'low' },
  ],
  clarify: ['What is the model number on the label inside the fresh food section?', 'What are the width and height of the opening?'],
});

// Identified only at category level: no successor and no alternatives, so the answer is PARTIAL and asks for the model number.
const APPLIANCE_REPLY = Object.freeze({
  category: 'appliance',
  original: {
    identity: 'Built-in dishwasher, model not identified', confidence: 'low',
    characteristics: ['Standard 24 inch built-in width', 'Hidden or top-control panel not confirmed'],
    uncertainty: 'The maker and model were not given, so the exact generation cannot be placed.',
  },
  requirements: ['A standard 24 inch built-in width', 'The same water supply and drain connections', 'A matching hidden or top control style', 'Similar tub capacity and noise level'],
  successor: null,
  suggestions: [],
  clarify: ['Who makes it?', 'What is the model number on the door frame label?'],
});

const GENERIC_REPLY = Object.freeze({ category: 'unknown', original: null, requirements: [], successor: null, suggestions: [], clarify: [] });

// First match wins. The patterns only choose a canned reply; they never read anything but the already-cleaned query text.
const SCENARIOS = Object.freeze([
  { id: 'tv', test: /\b(?:tv|television|oled|qled|c3|bravia)\b/i, reply: TV_REPLY },
  { id: 'refrigerator', test: /\b(?:fridge|refrigerator|freezer|rf28)\b/i, reply: FRIDGE_REPLY },
  { id: 'appliance', test: /\b(?:dishwasher|washer|dryer|oven|range|microwave)\b/i, reply: APPLIANCE_REPLY },
]);

export const FIXTURE_SCENARIO_IDS = Object.freeze([...SCENARIOS.map((scenario) => scenario.id), 'generic']);

// A size the user already gave ("65 inch", '55"', a bare common TV size) is not asked for again, as a real model would not.
const GIVEN_SIZE = /\b\d{2,3}\s?-?\s?(?:"|”|in\b|inch(?:es)?\b)|(?:^|\s)(?:24|27|28|32|40|42|43|48|50|55|58|60|65|70|75|77|82|83|85|86|98)(?=\s|$)/i;
const SIZE_QUESTION = /screen size/i;

/** The canned reply (model-reply shape) for a cleaned query, with the scenario that matched. */
export function fixtureReplyFor(query) {
  const text = String(query || '');
  const scenario = SCENARIOS.find((item) => item.test.test(text));
  if (!scenario) return { id: 'generic', reply: GENERIC_REPLY };
  const clarify = GIVEN_SIZE.test(text) ? scenario.reply.clarify.filter((question) => !SIZE_QUESTION.test(question)) : scenario.reply.clarify;
  return { id: scenario.id, reply: { ...scenario.reply, clarify } };
}

/**
 * Same result shape as getQuickAnswer: `{ answer, meta }`. `requestSent: false` states the truth (no provider request exists), so the
 * route gives its budget reservation straight back and logs no provider call. `errorCode: null` makes it an AI-shaped answer, which is
 * what lets the proxy's fresh-answer quota and the engine cache run exactly as they would for a real answer.
 */
export async function getFixtureAnswer(query) {
  const cleaned = String(query || '');
  const { id, reply } = fixtureReplyFor(cleaned);
  return {
    answer: sanitizeQuickAnswer(reply, { query: cleaned }),
    meta: { fixture: true, scenario: id, requestSent: false, httpStatus: null, durationMs: 0, errorCode: null, usage: {} },
  };
}

const MAX_ENTRIES = 500;

/**
 * In-memory stand-in for the three Redis operations the research modules use (get/set with expiry, the budget's two Lua scripts, the
 * usage pipeline). The scripts are recognised by their content, the same way the offline test store does it; a test runs the real
 * budget module against this store, so a change to either script that this emulation misses fails loudly.
 */
export function createMemoryStore({ now = Date.now, maxEntries = MAX_ENTRIES } = {}) {
  const values = new Map();
  const hashes = new Map();
  const live = (key) => {
    const entry = values.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== null && entry.expiresAt <= now()) { values.delete(key); return undefined; }
    return entry;
  };
  const put = (key, value, expiresAt) => {
    values.delete(key);
    values.set(key, { value, expiresAt });
    while (values.size > maxEntries) values.delete(values.keys().next().value);
  };
  return {
    async get(key) { const entry = live(key); return entry ? entry.value : null; },
    async set(key, value, options = {}) { put(key, value, Number.isFinite(options.ex) ? now() + options.ex * 1000 : null); return 'OK'; },
    async eval(script, keys, args = []) {
      const key = keys[0];
      const entry = live(key);
      const current = Number(entry ? entry.value : 0);
      if (script.includes('DECR')) {
        if (current <= 0) return 0;
        put(key, current - 1, entry.expiresAt);
        return current - 1;
      }
      if (current >= Number(args[0])) return [0, current];
      put(key, current + 1, now() + Number(args[1]) * 1000);
      return [1, current + 1];
    },
    pipeline() {
      const operations = [];
      const api = {
        hincrby(key, field, amount) { operations.push([key, field, amount]); return api; },
        expire() { return api; },
        async exec() {
          for (const [key, field, amount] of operations) {
            const hash = hashes.get(key) || {};
            hash[field] = (hash[field] || 0) + amount;
            hashes.set(key, hash);
          }
          return [];
        },
      };
      return api;
    },
  };
}
