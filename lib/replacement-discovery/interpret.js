import { CONTRACT_VERSION } from '../replacement-core/enums.js';
import { assertValid, validateIdentity } from '../replacement-core/contracts.js';
import { getFact, present, withTierBaseline } from '../replacement-core/normalize-values.js';
import { televisionProfile } from '../replacement-core/profiles/television.js';
import { refrigeratorProfile } from '../replacement-core/profiles/refrigerator.js';
import { recognizeSearch, setFact, stableId } from './normalize-adapter.js';
import { buildSearchStrategy } from './search-strategy.js';
import { addFitConstraintFacts } from './fit-constraints.js';
import { normalizeRefrigeratorConfiguration } from '../replacement-core/refrigerator-configuration.js';

const PROFILES = { television: televisionProfile, refrigerator: refrigeratorProfile };

function matchedValues(text, pattern, transform = (value) => value) {
  return [...new Set([...text.matchAll(pattern)].map((match) => transform(match[1])))];
}

function addMatches(facts, key, values, status = 'KNOWN', basis = null) {
  if (values.length === 1) setFact(facts, key, status, values[0], basis);
  else if (values.length > 1) facts[key] = { status: 'AMBIGUOUS', value: null, alternatives: values, evidenceRefs: ['user-input'], basis: 'CONFLICTING_INPUT' };
}

function addTelevisionFacts(text, recognition, facts) {
  const sizes = matchedValues(text, /\b(\d{2,3})\s*(?:["”]|-?inch(?:es)?\b|in\b|class\b)/gi, Number);
  if (!sizes.length) sizes.push(...matchedValues(text, /^(\d{2,3})\s+[A-Za-z]/gi, Number));
  if (sizes.length) addMatches(facts, 'screenSizeIn', sizes);
  else if (recognition.exactModel) {
    const modelSize = recognition.exactModel.match(/^(?:QN|UN|OLED)(\d{2})/i);
    if (modelSize) setFact(facts, 'screenSizeIn', 'INFERRED', Number(modelSize[1]), 'MODEL_TOKEN_PATTERN');
  }
  const resolutions = matchedValues(text, /\b(8K|4K|1080P|720P|UHD|FHD)\b/gi, (value) => value.toUpperCase());
  addMatches(facts, 'resolution', resolutions);
  const display = text.match(/\b(NEO\s*QLED|MINI\s*LED|QNED|QLED|OLED|LED|LCD)\b/i);
  if (display) setFact(facts, 'displayTechnology', 'KNOWN', display[1].replace(/\s+/g, ' ').toUpperCase());
  const refresh = matchedValues(text, /\b(60|120|144|240)\s*HZ\b/gi, Number);
  addMatches(facts, 'refreshHz', refresh);
  if (/\bSMART\s*(?:TV|TELEVISION)\b/i.test(text)) setFact(facts, 'smart', 'KNOWN', true);
  const hdr = text.match(/\bHDR10\+|\bHDR10\b|\bDOLBY\s+VISION\b|\bHDR\b/i);
  if (hdr) setFact(facts, 'hdr', 'KNOWN', hdr[0].toUpperCase());
}

function addRefrigeratorFacts(text, facts) {
  const capacities = matchedValues(text, /\b(\d{1,2}(?:\.\d+)?)\s*(?:cu\.?\s*ft\.?|cubic\s*feet)\b/gi, Number);
  addMatches(facts, 'totalCapacityCuFt', capacities);
  if (capacities.length === 1) facts.capacityCuFt = { ...facts.totalCapacityCuFt, precisionCuFt: String(capacities[0]).includes('.') ? 0.1 : 1 };
  if (capacities.length === 1) facts.totalCapacityCuFt.precisionCuFt = facts.capacityCuFt.precisionCuFt;
  const configurations = [
    [/\bside[\s-]*by[\s-]*side\b/i, 'side-by-side'],
    [/\bfrench[\s-]*door\b/i, 'french-door'],
    [/\btop[\s-]*freezer\b/i, 'top-freezer'],
    [/\bbottom[\s-]*freezer\b/i, 'bottom-freezer'],
    [/\bfour[\s-]*door\b/i, 'FOUR_DOOR'],
    [/\bcolumn\b/i, 'COLUMN'],
  ].filter(([pattern]) => pattern.test(text)).map(([, value]) => value);
  if (configurations.length === 1) {
    setFact(facts, 'configurationFloor', 'KNOWN', normalizeRefrigeratorConfiguration(configurations[0]));
    setFact(facts, 'layout', 'KNOWN', normalizeRefrigeratorConfiguration(configurations[0]));
    setFact(facts, 'configuration', 'KNOWN', normalizeRefrigeratorConfiguration(configurations[0]));
  } else if (configurations.length > 1) addMatches(facts, 'configurationFloor', configurations);
  const installation = [
    [/\bbuilt[\s-]*in\b/i, 'built-in'],
    [/\bfreestanding\b/i, 'freestanding'],
    [/\bintegrated\b/i, 'integrated'],
    [/\bcolumn\b/i, 'column'],
  ].filter(([pattern]) => pattern.test(text)).map(([, value]) => value);
  addMatches(facts, 'installationType', installation.map((value) => value.replace('-', '_').toUpperCase()));
  if (/\bcounter[\s-]*depth\b/i.test(text)) setFact(facts, 'counterDepth', 'KNOWN', true);
  if (/\b(?:must|requires?|required|only)\s+(?:be\s+)?counter[\s-]*depth\b|\bcounter[\s-]*depth\s+(?:required|only)\b/i.test(text))
    setFact(facts, 'counterDepthRequired', 'KNOWN', true, 'USER_FIT_CONSTRAINT');
  if (/\bstainless\s*steel\b|\bstainless\b/i.test(text)) setFact(facts, 'finish', 'KNOWN', 'stainless');
  if (/\b(?:ice\s*(?:and|&)\s*water|water\s*(?:and|&)\s*ice)\s+dispenser\b/i.test(text)) setFact(facts, 'dispenser', 'KNOWN', 'WATER_AND_ICE');
  else if (/\bwater\s+dispenser\b/i.test(text)) setFact(facts, 'dispenser', 'KNOWN', 'WATER');
  else if (/\bno\s+(?:ice\s*(?:and|&)\s*water\s+)?dispenser\b/i.test(text)) setFact(facts, 'dispenser', 'KNOWN', 'NONE');
  if (/\bdual\s+ice\s*maker\b/i.test(text)) setFact(facts, 'iceMaker', 'KNOWN', 'DUAL');
  else if (/\b(?:single|factory installed|built.in)\s+ice\s*maker\b/i.test(text)) setFact(facts, 'iceMaker', 'KNOWN', 'SINGLE');
  else if (/\bno\s+ice\s*maker\b/i.test(text)) setFact(facts, 'iceMaker', 'KNOWN', 'NONE');
}

function summarize(original, profile) {
  const knownFacts = [], inferredFacts = [], assumptions = [], unknownImportantFacts = [];
  for (const [key, entry] of Object.entries(original.facts)) {
    const summary = { key, ...entry };
    if (entry.status === 'KNOWN') knownFacts.push(summary);
    if (entry.status === 'INFERRED') inferredFacts.push(summary);
    if (entry.status === 'ASSUMED') assumptions.push(summary);
  }
  const keys = ['model', ...profile.rules.filter((rule) => rule.bucket === 'HARD' || (rule.bucket === 'STRONG' && rule.weightClass === 'HIGH')).map((rule) => rule.key)];
  for (const key of keys) {
    const entry = getFact(original, key);
    if (['UNKNOWN', 'AMBIGUOUS', 'ASSUMED'].includes(entry.status)) unknownImportantFacts.push({ key, ...entry });
  }
  return { knownFacts, inferredFacts, assumptions, unknownImportantFacts };
}

export function buildCandidateDiscoveryHints(normalizedOriginal) {
  const hint = (key) => {
    const entry = getFact(normalizedOriginal, key);
    return present(entry) ? { value: entry.value, status: entry.status } : null;
  };
  return {
    category: normalizedOriginal.category,
    brand: hint('brand'),
    exactModel: hint('model'),
    modelFamily: hint('family'),
    minimumScreenSize: hint('screenSizeIn'),
    minimumResolution: hint('resolution'),
    displayClass: hint('displayTechnology'),
    minimumCapacity: hint('totalCapacityCuFt'),
    configuration: hint('configurationFloor'),
    finish: hint('finish'),
    minimumTier: hint('tier'),
    sameBrandPreferred: Boolean(hint('brand')),
  };
}

/** Re-derives every facts-dependent view after the original's facts change (e.g. research enrichment). */
export function rebuildInterpretation(interpretation, normalizedOriginal) {
  normalizedOriginal = withTierBaseline(normalizedOriginal);
  const searchStrategy = buildSearchStrategy(normalizedOriginal);
  return {
    ...interpretation,
    normalizedOriginal,
    ...summarize(normalizedOriginal, PROFILES[normalizedOriginal.category]),
    searchTermsForDiscovery: searchStrategy.queries.map((item) => item.query),
    candidateDiscoveryHints: buildCandidateDiscoveryHints(normalizedOriginal),
    searchStrategy,
  };
}

export const NOTES_MODES = Object.freeze({ FULL: 'FULL', FIT_ONLY: 'FIT_ONLY' });
const NOTE_SPLIT = /[;\n]|\.(?=\s|$)/;
const NOTE_FRAGMENT_SPLIT = /,|\band\b|&/i;
const FEATURE_PREFERENCE = /\b(?:needs?|wants?|requires?|required|must have|should have|prefer|at least|no less than|minimum)\b|\b(?:hdmi|dispenser|ice\s*maker|hz|refresh|smart|hdr|gaming|speaker|tier)\b/i;

// FIT_ONLY-only phrasings of an explicit mount-reuse statement that the shared fit reader does not match. They write the same
// `mountReuseRequired` fact the shared reader writes. Each needs an explicit reuse verb or "work with the existing mount":
// a bare mention such as "TV comes with a mount" never matches.
const MOUNT = String.raw`(?:(?:the|my|our)\s+)?(?:(?:existing|current)\s+)?(?:wall\s+)?mount(?:ing)?(?:\s+bracket)?`;
const FIT_ONLY_MOUNT_REUSE = new RegExp(
  String.raw`\b${MOUNT}\s+(?:will|is\s+going\s+to|is\s+to|should|must|needs?\s+to|has\s+to)\s+be\s+(?:re-?used|kept|retained)\b`
  + String.raw`|\b(?:must|needs?\s+to|has\s+to)\s+(?:work|fit|be\s+compatible)\s+with\s+(?:(?:the|my|our)\s+)?(?:existing|current)\s+(?:wall\s+)?mount\b`
  + String.raw`|\b(?:re-?use|keep|retain)\s+(?:(?:the|my|our)\s+)?(?:existing|current)\s+(?:wall\s+)?mount\b`, 'i');
const MOUNT_NEGATION = /\b(?:not|no|don'?t|do not|without|doesn'?t|does not|never)\b/i;
const MOUNT_NEGATION_WINDOW = 25;

function addFitOnlyMountReuse(text, category, facts) {
  if (category !== 'television' || facts.mountReuseRequired) return;
  const match = String(text).match(FIT_ONLY_MOUNT_REUSE);
  if (!match) return;
  const negated = MOUNT_NEGATION.test(String(text).slice(Math.max(0, match.index - MOUNT_NEGATION_WINDOW), match.index));
  setFact(facts, 'mountReuseRequired', 'KNOWN', !negated, 'USER_FIT_CONSTRAINT');
}

/** Fit constraints readable from FIT_ONLY notes: the shared fit reader plus the mount-reuse phrasings above. */
function addFitOnlyConstraintFacts(text, category, facts) {
  addFitConstraintFacts(text, category, facts);
  addFitOnlyMountReuse(text, category, facts);
}

/**
 * FIT_ONLY notes handling. Only true installation/fit constraints (opening dimensions, mount reuse, panel-ready) are
 * read from notes; spec-shaped words in notes never become product facts. Everything else is reported, not scored.
 * Clauses split at `;`, newlines and sentence periods, the same boundaries the fit reader already uses for its cue
 * windows, so a clause read alone yields what it would yield inside the whole note.
 */
export function partitionFitNotes(notes, category) {
  const notScored = [];
  const normalized = String(notes).replace(/\s+/g, ' ').trim();
  for (const clause of normalized.split(NOTE_SPLIT).map((item) => item.trim()).filter(Boolean)) {
    const probe = {};
    addFitOnlyConstraintFacts(clause, category, probe);
    const fragments = clause.split(NOTE_FRAGMENT_SPLIT).map((item) => item.trim()).filter(Boolean);
    if (!Object.keys(probe).length) {
      notScored.push({ code: 'NOTE_NOT_SCORED', kind: FEATURE_PREFERENCE.test(clause) ? 'FEATURE_PREFERENCE' : 'OTHER', text: clause });
    } else if (fragments.length > 1) {
      // A fit clause may also carry a feature request ("must fit a 36 inch opening, needs a water dispenser").
      for (const fragment of fragments) {
        const fitProbe = {};
        addFitOnlyConstraintFacts(fragment, category, fitProbe);
        if (!Object.keys(fitProbe).length && FEATURE_PREFERENCE.test(fragment)) notScored.push({ code: 'NOTE_NOT_SCORED', kind: 'FEATURE_PREFERENCE', text: fragment });
      }
    }
  }
  return notScored;
}

/**
 * `notesMode: 'FULL'` (default, legacy) reads query and notes as one description. `'FIT_ONLY'` reads product facts
 * from the query alone and uses notes solely for fit constraints; see partitionFitNotes.
 */
export function interpretReplacementSearch({ query, notes = '', notesMode = NOTES_MODES.FULL }) {
  if (typeof query !== 'string' || !query.trim()) throw new TypeError('nonempty query required');
  if (typeof notes !== 'string') throw new TypeError('notes must be a string');
  if (!Object.values(NOTES_MODES).includes(notesMode)) throw new TypeError('unknown notesMode');
  const fitOnly = notesMode === NOTES_MODES.FIT_ONLY;
  const text = (fitOnly ? query : `${query} ${notes}`).trim();
  const recognition = recognizeSearch(text);
  let category = recognition.productType;
  let categoryStatus = /\b(?:television|tv|refrigerator|fridge)\b/i.test(text) ? 'KNOWN' : 'INFERRED';
  if (!category && /\b(?:OLED|QLED|QNED)\b/i.test(text)) category = 'television';
  if (!PROFILES[category]) throw new TypeError('Phase 2 supports only television and refrigerator searches with a recognizable category');
  const facts = {};
  setFact(facts, 'category', categoryStatus, category, categoryStatus === 'INFERRED' ? 'DETERMINISTIC_CATEGORY_CONTEXT' : null);
  if (recognition.brand) setFact(facts, 'brand', 'KNOWN', recognition.brand);
  if (recognition.exactModel) setFact(facts, 'model', 'KNOWN', recognition.exactModel);
  else if (recognition.modelLineName) setFact(facts, 'modelLine', 'INFERRED', recognition.modelLineName, 'FAMILY_REGISTRY');
  if (recognition.productFamily) setFact(facts, 'family', 'INFERRED', recognition.productFamily, 'FAMILY_REGISTRY');
  if (recognition.seriesLine) setFact(facts, 'series', 'INFERRED', recognition.seriesLine, 'FAMILY_REGISTRY');
  if (recognition.modelYearFamilyYear) setFact(facts, 'modelYear', 'INFERRED', recognition.modelYearFamilyYear, 'MODEL_YEAR_FAMILY');
  if (category === 'television') addTelevisionFacts(text, recognition, facts);
  else addRefrigeratorFacts(text, facts);
  const factsBeforeFit = new Set(Object.keys(facts));
  if (fitOnly) addFitOnlyConstraintFacts(notes, category, facts);
  else addFitConstraintFacts(text, category, facts);
  const fitConstraintKeys = Object.keys(facts).filter((key) => !factsBeforeFit.has(key));
  const explicitTier = text.match(/\btier\s*[:=]\s*(value|standard|premium|upper[\s_-]*premium|luxury)\b|\b(value|standard|premium|upper[\s_-]*premium|luxury)\s+(?:product\s+)?tier\b/i);
  if (explicitTier) setFact(facts, 'tier', 'KNOWN', (explicitTier[1] || explicitTier[2]).replace(/[\s-]+/g, '_').toUpperCase());
  const documentedFit = text.match(/\b(?:physical|installation)\s+fit\s*[:=]\s*(yes|no|true|false)\b/i);
  if (documentedFit) setFact(facts, 'physicalFit', 'KNOWN', /^(?:yes|true)$/i.test(documentedFit[1]), 'DOCUMENTED_USER_FIT');
  const rawIdentity = { contractVersion: CONTRACT_VERSION, id: stableId('original', `${query} ${notes}`.trim().toLowerCase()), rawQuery: query, category, facts, evidenceRefs: ['user-input'] };
  assertValid(validateIdentity(rawIdentity), 'interpreted original');
  const normalizedOriginal = withTierBaseline(rawIdentity);
  const profile = PROFILES[category];
  const summaries = summarize(normalizedOriginal, profile);
  const searchStrategy = buildSearchStrategy(normalizedOriginal);
  const interpretationConfidence = facts.model?.status === 'KNOWN' && facts.brand ? 'HIGH'
    : facts.brand && (facts.screenSizeIn || facts.configurationFloor || facts.totalCapacityCuFt) ? 'MEDIUM' : 'LOW';
  return {
    input: query,
    normalizedOriginal,
    ...summaries,
    detectedCategory: { value: category, status: categoryStatus },
    replacementPrecision: recognition.replacementPrecision,
    interpretationConfidence,
    searchTermsForDiscovery: searchStrategy.queries.map((item) => item.query),
    candidateDiscoveryHints: buildCandidateDiscoveryHints(normalizedOriginal),
    searchStrategy,
    ...(fitOnly ? { notesReport: { mode: notesMode, fitConstraintKeys, notScored: partitionFitNotes(notes, category) } } : {}),
  };
}
