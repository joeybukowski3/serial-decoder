import { MODEL_PATTERN, looksLikeExactModel } from '../evidence.js';
import { modelKey } from './product-tokens.js';

/**
 * Configuration of a laptop, which is what its price depends on. One name ("Vivobook 15") covers entry models near $250 and well-equipped ones
 * near $1,000, so a price for "the family" says nothing about the machine a person owns. The rules here are plain text matching on purpose:
 *   - what the person typed (processor class, memory, storage, screen) is the configuration to match; nothing is assumed about the rest
 *   - a listing is eligible to price a replacement only when its title states each of those and agrees with it
 *   - with the processor, memory or storage not given, no listing is eligible: the right move is to ask, not to guess
 * Nothing here is shown as a fact about a product. It only decides which listings may set a price and which are examples.
 */

export const CONFIG_KIND = Object.freeze({ LAPTOP: 'laptop' });
export const CONFIG_VERDICT = Object.freeze({ MATCH: 'MATCH', MISMATCH: 'MISMATCH', UNKNOWN: 'UNKNOWN' });
const CRITICAL_FACETS = Object.freeze([['cpu', 'processor'], ['ram', 'RAM'], ['storage', 'storage']]);

const LAPTOP_WORDS = /\b(?:laptops?|notebooks?|chromebooks?|macbooks?|ultrabooks?|vivobook|zenbook|ideapad|thinkpad|thinkbook|legion|pavilion|spectre|inspiron|latitude|alienware|aspire|surface laptop|galaxy book)\b/i;

/** `'laptop'` when any of the texts names a laptop, else null. */
export const configKind = (...texts) => (texts.some((text) => LAPTOP_WORDS.test(String(text || ''))) ? CONFIG_KIND.LAPTOP : null);

// Processor classes, entry to top. A title naming two different classes is ambiguous and states none.
const CPU_PATTERNS = Object.freeze([
  [1, /\b(?:celeron|pentium|athlon|atom)\b|\b(?:intel\s+)?processor\s+n\d{2,4}\b|\bintel\s+n\d{2,4}\b|\bn(?:50|95|97|100|150|200|305|355)\b/i],
  ...[3, 5, 7, 9].map((digit, index) => [index + 2, new RegExp(`\\bcore\\s+(?:ultra\\s+)?i?${digit}\\b|\\bryzen\\s+${digit}\\b|\\bi${digit}\\b`, 'i')]),
]);
// An Apple chip is its own class (M1 = 11, M2 = 12, ...): chips of one generation are one machine class whatever the variant.
const APPLE_MAC = /\b(?:macbook|apple|imac|mac mini)\b/i;
const APPLE_CHIP = /\bm([1-4])\b(?!\.)/i;
const CPU_LABELS = Object.freeze({ 1: 'Celeron', 2: 'Core i3', 3: 'Core i5', 4: 'Core i7', 5: 'Core i9' });
export const cpuLabel = (cpu) => (cpu > 10 ? `Apple M${cpu - 10}` : CPU_LABELS[cpu] || null);

const STORAGE_LABELED = /(\d{2,4})\s?gb\s*(?:ssd|nvme|pcie|emmc|hdd|m\.?2|storage|flash)\b|\b(\d)\s?tb\s*(?:ssd|nvme|pcie|hdd|storage)?\b|\b(?:ssd|storage)[:\s]*(\d{2,4})\s?gb\b|\b(?:ssd|storage)[:\s]*(\d)\s?tb\b/i;
const RAM_LABELED = /(\d{1,2})\s?gb\s*(?:of\s+)?(?:ram|memory|ddr\d?x?|lpddr\d?x?)\b|\bram[:\s]*(\d{1,2})\s?gb\b/i;
const BARE_GB = /\b(\d{1,4})\s?gb\b/gi;
const SCREEN = /(\d{2}(?:\.\d)?)\s?(?:"|”|-?\s?inch(?:es)?\b|\bin\b)|\b(1[1-8]\.\d)\b/i;
const TWO_IN_ONE = /\b(?:2[- ]in[- ]1|convertible|flip|x360|fold)\b/i;
const TOUCH = /\btouch[- ]?screen\b|\btouch\b/i;
const RAM_SIZES = new Set([2, 4, 6, 8, 12, 16, 18, 24, 32, 36, 48, 64, 96, 128]);

function cpuOf(text) {
  const tiers = CPU_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([tier]) => tier);
  const chip = APPLE_MAC.test(text) ? APPLE_CHIP.exec(text) : null;
  if (chip) tiers.push(10 + Number(chip[1]));
  return tiers.length === 1 ? tiers[0] : null;
}

/**
 * The configuration a text states. Any facet it does not state is null.
 * @returns {{cpu: number|null, ram: number|null, storage: number|null, screen: number|null, twoInOne: boolean, touch: boolean}}
 */
export function parseConfig(text) {
  const value = String(text || '');
  const stored = STORAGE_LABELED.exec(value);
  let storage = stored ? (Number(stored[1] || stored[3]) || Number(stored[2] || stored[4]) * 1000) : null;
  const labeled = RAM_LABELED.exec(value);
  let ram = labeled ? Number(labeled[1] || labeled[2]) : null;
  // "i3-1115G4 4GB 128GB SSD" and "i5 16gb 512gb": a bare figure of 120 GB or more is the storage, then a bare memory size that is not the storage is the memory.
  const bare = [...value.matchAll(BARE_GB)].map((match) => Number(match[1]));
  if (storage === null) { const big = [...new Set(bare.filter((size) => size >= 120 && size !== ram))]; if (big.length === 1) storage = big[0]; }
  if (ram === null) { const guesses = [...new Set(bare.filter((size) => RAM_SIZES.has(size) && size !== storage))]; if (guesses.length === 1) ram = guesses[0]; }
  const screen = SCREEN.exec(value);
  const inches = screen ? Number(screen[1] || screen[2]) : null;
  return {
    cpu: cpuOf(value), ram, storage, screen: inches !== null && inches >= 11 && inches <= 18.5 ? inches : null,
    twoInOne: TWO_IN_ONE.test(value), touch: TOUCH.test(value),
  };
}

/**
 * What the person asked for, from their own words, and what is still missing.
 * @returns {{wanted: object, labels: object, missing: string[], complete: boolean}}
 */
export function wantedConfig(query) {
  const wanted = parseConfig(query);
  const labels = {
    cpu: wanted.cpu ? cpuLabel(wanted.cpu) : null, ram: wanted.ram ? `${wanted.ram}GB` : null,
    storage: wanted.storage ? (wanted.storage >= 1000 ? `${wanted.storage / 1000}TB` : `${wanted.storage}GB`) : null,
  };
  const missing = CRITICAL_FACETS.filter(([facet]) => wanted[facet] === null).map(([, name]) => name);
  return { wanted, labels, missing, complete: missing.length === 0 };
}

/** The one question that asks for what is missing. */
export function configQuestion(missing) {
  if (!missing.length) return null;
  const list = missing.length === 3 ? 'processor, RAM and storage' : missing.length === 2 ? `${missing[0]} and ${missing[1]}` : missing[0];
  return `What ${list} does it have?${missing.length === 3 ? ' (for example Core i5, 16 GB, 512 GB)' : ''}`;
}

// How far above the asked memory or storage still counts as the same machine (a 1 TB drive is not a 512 GB one, and 16 GB is not 8 GB).
const UPSIZE_LIMIT = 1.5;
const SCREEN_TOLERANCE = 0.8;

/**
 * Does a listing title agree with the configuration asked for? MISMATCH when it states something different, UNKNOWN when it does not state
 * what was asked, MATCH only when every asked facet is stated and agrees. With a critical facet not asked for at all, nothing can match.
 */
export function judgeConfig(request, title) {
  const { wanted, complete } = request;
  const listed = parseConfig(title);
  if (listed.twoInOne && !wanted.twoInOne) return CONFIG_VERDICT.MISMATCH;
  const verdicts = [];
  const compare = (facet, agrees) => { if (wanted[facet] !== null) verdicts.push(listed[facet] === null ? CONFIG_VERDICT.UNKNOWN : agrees(listed[facet], wanted[facet]) ? CONFIG_VERDICT.MATCH : CONFIG_VERDICT.MISMATCH); };
  compare('cpu', (have, ask) => have === ask);
  compare('ram', (have, ask) => have >= ask && have <= ask * UPSIZE_LIMIT);
  compare('storage', (have, ask) => have >= ask && have <= ask * UPSIZE_LIMIT);
  compare('screen', (have, ask) => Math.abs(have - ask) <= SCREEN_TOLERANCE);
  if (wanted.twoInOne && !listed.twoInOne) verdicts.push(CONFIG_VERDICT.UNKNOWN);
  if (verdicts.includes(CONFIG_VERDICT.MISMATCH)) return CONFIG_VERDICT.MISMATCH;
  if (!complete || verdicts.includes(CONFIG_VERDICT.UNKNOWN)) return CONFIG_VERDICT.UNKNOWN;
  return CONFIG_VERDICT.MATCH;
}

// ---- the product line --------------------------------------------------------------------------------------------------------------------

const LINE_FILLER = new Set(['series', 'laptop', 'laptops', 'notebook', 'family', 'line', 'class', 'the', 'and', 'with', 'new', 'newest', 'latest', 'current', 'generation', 'model', 'models']);
// A word right after a product line's name that makes it another line of the same brand (Vivobook Go, Vivobook S, Vivobook Pro, Vivobook Flip).
const LINE_QUALIFIERS = new Set(['go', 's', 'pro', 'flip', 'plus', 'max', 'ultra', 'fold', 'duo']);
const words = (text) => String(text || '').toLowerCase().split(/[^a-z0-9.]+/).filter(Boolean);

/** A laptop candidate's line: its brand, the words that name the line, and the number in its name (the screen class or generation). */
export function laptopLine(name) {
  const tokens = words(String(name || '').replace(/,.*$/, ' ').replace(/\([^)]*\)/g, ' '));
  const [brand = '', ...rest] = tokens;
  const meaningful = rest.filter((token) => !LINE_FILLER.has(token));
  return { brand, names: meaningful.filter((token) => !/^\d/.test(token)), number: meaningful.find((token) => /^\d{1,4}$/.test(token)) || null, own: new Set(rest) };
}

const hasNumber = (title, number) => new RegExp(`(?<![A-Za-z0-9.])${number}(?!\\d)`).test(title);

/** True when a listing title names this line: its words, its number, and no qualifier that makes it another line of the brand. */
export function laptopLineMatches(line, title) {
  const tokens = words(title);
  if (!line.names.every((name) => tokens.includes(name))) return false;
  if (line.number && !hasNumber(String(title), line.number)) return false;
  const last = Math.max(...line.names.map((name) => tokens.lastIndexOf(name)), -1);
  if (last < 0) return !line.names.length;
  const next = tokens.slice(last + 1, last + 4).filter((token) => token !== line.number && !/^\d+(?:\.\d)?$/.test(token))[0];
  // A single letter ("Vivobook S 15", "Vivobook R"), a letter with a size ("S15") or a known qualifier makes it another line, unless the candidate's own name has it.
  const another = next && !line.own.has(next) && (LINE_QUALIFIERS.has(next) || /^[a-z]$/.test(next) || /^[a-z]\d{2}$/.test(next));
  return !another;
}

// ---- the model code a listing names -------------------------------------------------------------------------------------------------------

// Hardware and display names that look like a model code ("RTX4060", "DDR5") but name a part, never the product.
const NOT_A_PRODUCT_CODE = /^(?:RTX|GTX|RX|ARC|DDR|LPDDR|USB|HDMI|WIFI|WIN|HD|UHD|FHD|QHD|WQHD|IPS|LED|RAM|NVME|PCIE|SSD|HDD|EMMC|CORE|RYZEN|INTEL|AMD|GB|TB|HZ)\d/;
const SKU_TOKEN = /\b[A-Z]{1,4}\d{2,4}[A-Z0-9]{0,12}(?:-[A-Z0-9]{2,10})?\b/g;

/** The exact model code a listing title names ("F1502ZA-OS34", "OLED55C4PUA"), or null. A part number or a spec is not a model. */
export function skuOf(title) {
  for (const match of String(title || '').toUpperCase().matchAll(SKU_TOKEN)) {
    const token = match[0];
    if (NOT_A_PRODUCT_CODE.test(modelKey(token)) || !MODEL_PATTERN.test(token) || !looksLikeExactModel(token)) continue;
    return token;
  }
  return null;
}
