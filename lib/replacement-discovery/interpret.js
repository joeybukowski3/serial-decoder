import { CONTRACT_VERSION } from '../replacement-core/enums.js';
import { assertValid, validateIdentity } from '../replacement-core/contracts.js';
import { getFact, present, withTierBaseline } from '../replacement-core/normalize-values.js';
import { televisionProfile } from '../replacement-core/profiles/television.js';
import { refrigeratorProfile } from '../replacement-core/profiles/refrigerator.js';
import { recognizeSearch, setFact, stableId } from './normalize-adapter.js';
import { buildSearchStrategy } from './search-strategy.js';

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
  const configurations = [
    [/\bside[\s-]*by[\s-]*side\b/i, 'side-by-side'],
    [/\bfrench[\s-]*door\b/i, 'french-door'],
    [/\btop[\s-]*freezer\b/i, 'top-freezer'],
    [/\bbottom[\s-]*freezer\b/i, 'bottom-freezer'],
    [/\bcolumn\b/i, 'column'],
  ].filter(([pattern]) => pattern.test(text)).map(([, value]) => value);
  addMatches(facts, 'configurationFloor', configurations);
  addMatches(facts, 'layout', configurations);
  const installation = [
    [/\bbuilt[\s-]*in\b/i, 'built-in'],
    [/\bfreestanding\b/i, 'freestanding'],
    [/\bintegrated\b/i, 'integrated'],
  ].filter(([pattern]) => pattern.test(text)).map(([, value]) => value);
  addMatches(facts, 'installationType', installation);
  if (/\bcounter[\s-]*depth\b/i.test(text)) setFact(facts, 'counterDepth', 'KNOWN', true);
  if (/\bstainless\s*steel\b|\bstainless\b/i.test(text)) setFact(facts, 'finish', 'KNOWN', 'stainless');
  if (/\bthrough[\s-]*door\b/i.test(text)) setFact(facts, 'dispenser', 'KNOWN', 'through-door');
  else if (/\bno\s+dispenser\b/i.test(text)) setFact(facts, 'dispenser', 'KNOWN', 'none');
  if (/\bice\s*maker\b/i.test(text)) setFact(facts, 'iceMaker', 'KNOWN', true);
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

export function interpretReplacementSearch({ query, notes = '' }) {
  if (typeof query !== 'string' || !query.trim()) throw new TypeError('nonempty query required');
  if (typeof notes !== 'string') throw new TypeError('notes must be a string');
  const text = `${query} ${notes}`.trim();
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
  const explicitTier = text.match(/\btier\s*[:=]\s*(value|standard|premium|upper[\s_-]*premium|luxury)\b|\b(value|standard|premium|upper[\s_-]*premium|luxury)\s+(?:product\s+)?tier\b/i);
  if (explicitTier) setFact(facts, 'tier', 'KNOWN', (explicitTier[1] || explicitTier[2]).replace(/[\s-]+/g, '_').toUpperCase());
  const documentedFit = text.match(/\b(?:physical|installation)\s+fit\s*[:=]\s*(yes|no|true|false)\b/i);
  if (documentedFit) setFact(facts, 'physicalFit', 'KNOWN', /^(?:yes|true)$/i.test(documentedFit[1]), 'DOCUMENTED_USER_FIT');
  const rawIdentity = { contractVersion: CONTRACT_VERSION, id: stableId('original', text.toLowerCase()), rawQuery: query, category, facts, evidenceRefs: ['user-input'] };
  assertValid(validateIdentity(rawIdentity), 'interpreted original');
  const normalizedOriginal = withTierBaseline(rawIdentity);
  const profile = PROFILES[category];
  const summaries = summarize(normalizedOriginal, profile);
  const hint = (key) => {
    const entry = getFact(normalizedOriginal, key);
    return present(entry) ? { value: entry.value, status: entry.status } : null;
  };
  const candidateDiscoveryHints = {
    category,
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
    candidateDiscoveryHints,
    searchStrategy,
  };
}
