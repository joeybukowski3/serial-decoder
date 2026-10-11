import { TIERS } from '../replacement-core/enums.js';
import { normalizeResolution, normalizeTier, numeric } from '../replacement-core/normalize-values.js';

/**
 * Strict allowlist schema for grounded-research payloads.
 *
 * Provider JSON is untrusted research input. Only the fields named here survive
 * validation; everything else (ranks, LKQ verdicts, scores, prices, unknown keys)
 * is dropped and recorded by name only, so a provider cannot carry policy or
 * executable content into replacement-core.
 */

export const RESEARCH_SCHEMA_VERSION = '1.0.0';
export const MAX_RAW_CANDIDATES = 12;
export const RELATIONSHIPS = Object.freeze(['DIRECT_SUCCESSOR', 'SAME_SERIES', 'SAME_BRAND_ALTERNATIVE', 'CROSS_BRAND_ALTERNATIVE', 'FUNCTIONAL_EQUIVALENT', 'UNKNOWN']);
const AVAILABILITY = Object.freeze(['CURRENT', 'DISCONTINUED', 'MARKETPLACE_ONLY', 'UNKNOWN']);
const CONDITIONS = Object.freeze(['NEW', 'OPEN_BOX', 'REFURBISHED', 'USED', 'UNKNOWN']);
const TIER_BASES = Object.freeze(['MODEL_LINE', 'BRAND_CATEGORY', 'PRICE', 'UNKNOWN']);
const CONFIDENCES = Object.freeze(['HIGH', 'MEDIUM', 'LOW']);
const MAX_SOURCES_PER_CLAIM = 4;
const MAX_POSSIBLE_MODELS = 4;
const MAX_TEXT = 80;
const MAX_IGNORED_NAMES = 10;
const MODEL_TOKEN = /^[A-Z0-9][A-Z0-9\-/.]{2,39}$/;
const DOMAIN = /^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/;
const POLICY_KEY = /lkq|classif|score|rank|eligib|similar|verdict|recommend|hard|pass|fail|match|better|worse/i;
const PRICE_KEY = /price|cost|msrp|amount|offer|seller|discount|sale|stock/i;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const safeName = (key) => String(key).replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 40);

const SAFE_TEXT = /^[\p{L}\p{N} .,+/&'()-]+$/u;

/** Display-safe text: no markup characters, so nothing researched can carry HTML into a future renderer. */
export function safeText(value, max = MAX_TEXT) {
  const text = cleanText(value, max);
  return text && SAFE_TEXT.test(text) ? text : null;
}

export function cleanText(value, max = MAX_TEXT) {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned && cleaned.length <= max ? cleaned : null;
}

/** Model codes are compared without punctuation or case. Returns null for anything that is not a model-shaped token. */
export function modelToken(value) {
  const token = cleanText(value, 40)?.toUpperCase();
  return token && MODEL_TOKEN.test(token) ? token : null;
}

export function modelKey(value) {
  return typeof value === 'string' ? value.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
}

/** Accepts "samsung.com", "https://www.samsung.com/us/x" and similar; returns a bare lowercase host or null. */
export function normalizeDomain(value) {
  const raw = cleanText(value, 200)?.toLowerCase();
  if (!raw) return null;
  const host = raw.replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0].replace(/^www\./, '').replace(/:\d+$/, '');
  return DOMAIN.test(host) ? host : null;
}

function sourceList(value) {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  return [...new Set(list.map(normalizeDomain).filter(Boolean))].slice(0, MAX_SOURCES_PER_CLAIM);
}

const number = (min, max, integer = false) => (value) => {
  const parsed = numeric(value);
  return parsed !== null && parsed >= min && parsed <= max && (!integer || Number.isInteger(parsed)) ? parsed : undefined;
};
const bool = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string' && /^(true|yes)$/i.test(value.trim())) return true;
  if (typeof value === 'string' && /^(false|no)$/i.test(value.trim())) return false;
  return undefined;
};
const free = (max = MAX_TEXT) => (value) => safeText(value, max) ?? undefined;
const oneOf = (values, aliases = {}) => (value) => {
  const token = cleanText(value, 40)?.toLowerCase().replace(/[\s_]+/g, '-');
  const match = (Object.hasOwn(aliases, token) ? aliases[token] : undefined) ?? values.find((item) => item.toLowerCase().replace(/[\s_]+/g, '-') === token);
  return match ?? undefined;
};
const resolutionLabel = (value) => ({ 1: '720P', 2: '1080P', 3: '4K', 4: '8K' })[normalizeResolution(value)];
const hdrLabel = (value) => {
  const token = cleanText(value, 60)?.toUpperCase();
  if (!token) return undefined;
  if (/HDR10\s*\+|HDR10PLUS/.test(token)) return 'HDR10+';
  if (/DOLBY\s*VISION/.test(token)) return 'DOLBY VISION';
  if (/HDR10/.test(token)) return 'HDR10';
  return /HDR/.test(token) ? 'HDR' : undefined;
};
const finishLabel = (value) => {
  const token = cleanText(value, 60)?.toLowerCase();
  if (!token) return undefined;
  if (/black\s*stainless/.test(token)) return 'black-stainless';
  if (/stainless/.test(token)) return 'stainless';
  if (/\bwhite\b/.test(token)) return 'white';
  if (/\bblack\b/.test(token)) return 'black';
  return /slate/.test(token) ? 'slate' : safeText(token, 30) ?? undefined;
};
const displayLabel = oneOf(['QLED', 'NEO QLED', 'OLED', 'QNED', 'MINI LED', 'LED', 'LCD'], { 'qd-oled': 'OLED', 'neo-qled': 'NEO QLED', 'mini-led': 'MINI LED' });
const configuration = oneOf(['side-by-side', 'french-door', 'top-freezer', 'bottom-freezer', 'column']);
const mountPatternLabel = (value) => {
  const match = cleanText(value, 30)?.match(/(\d{2,3})\s*[x×]\s*(\d{2,3})/i);
  return match ? `${match[1]}x${match[2]}` : undefined;
};
const yearOf = (value) => number(2005, new Date().getUTCFullYear() + 1, true)(value);

const COMMON = {
  series: { normalize: free(), hint: 'model series/line name' },
  featurePackage: { normalize: free(), hint: 'short major feature package label' },
  modelYear: { normalize: yearOf, hint: 'integer model year' },
  finish: { normalize: finishLabel, hint: 'finish/color' },
};

/** Per-category researchable fields. `physicalFit` is deliberately absent: installed fit is never researchable. */
export const FIELD_SPECS = Object.freeze({
  television: Object.freeze({
    screenSizeIn: { normalize: number(10, 120), hint: 'NOMINAL marketed size class in whole inches (55 for a "55-inch class" TV); never the measured diagonal' },
    measuredDiagonalIn: { normalize: number(10, 130), hint: 'informational measured/viewable diagonal in inches (e.g. 54.6); NOT the marketed class' },
    resolution: { normalize: resolutionLabel, hint: '720p | 1080p | 4K | 8K' },
    displayTechnology: { normalize: displayLabel, hint: 'QLED | NEO QLED | OLED | QNED | MINI LED | LED | LCD' },
    refreshHz: { normalize: number(30, 480, true), hint: 'NATIVE refresh rate in Hz (integer)' },
    smart: { normalize: bool, hint: 'true | false' },
    hdr: { normalize: hdrLabel, hint: 'best supported of HDR10+ | DOLBY VISION | HDR10 | HDR' },
    gamingFeatures: { normalize: free(), hint: 'short label or null' },
    hdmiCount: { normalize: number(0, 12, true), hint: 'integer' },
    smartPlatform: { normalize: free(), hint: 'platform name' },
    widthIn: { normalize: number(10, 120), hint: 'informational published width without stand, inches' },
    heightIn: { normalize: number(10, 120), hint: 'informational published height without stand, inches' },
    depthIn: { normalize: number(1, 40), hint: 'informational published depth without stand, inches' },
    mountPattern: { normalize: mountPatternLabel, hint: 'VESA mount pattern as WxH in mm, e.g. 400x400' },
    ...COMMON,
  }),
  refrigerator: Object.freeze({
    totalCapacityCuFt: { normalize: number(3, 40), hint: 'total cubic feet (number)' },
    installationType: { normalize: oneOf(['freestanding', 'built-in', 'integrated']), hint: 'freestanding | built-in | integrated' },
    configurationFloor: { normalize: configuration, hint: 'side-by-side | french-door | top-freezer | bottom-freezer | column' },
    layout: { normalize: configuration, hint: 'same vocabulary as configurationFloor' },
    counterDepth: { normalize: bool, hint: 'true | false' },
    capacityBalance: { normalize: free(), hint: 'short label, e.g. fresh/freezer cubic feet split' },
    dispenser: { normalize: oneOf(['through-door', 'none', 'internal']), hint: 'through-door | internal | none' },
    iceMaker: { normalize: bool, hint: 'true | false' },
    wifi: { normalize: bool, hint: 'true | false' },
    clearanceWidthIn: { normalize: number(0, 12), hint: 'informational required clearance for width, inches (total)' },
    clearanceHeightIn: { normalize: number(0, 12), hint: 'informational required clearance above, inches' },
    clearanceDepthIn: { normalize: number(0, 12), hint: 'informational required clearance behind, inches' },
    panelReady: { normalize: bool, hint: 'true if panel-ready/integrated, else false' },
    widthIn: { normalize: number(10, 100), hint: 'informational published width, inches' },
    heightIn: { normalize: number(10, 100), hint: 'informational published height, inches' },
    depthIn: { normalize: number(10, 100), hint: 'informational published depth, inches' },
    ...COMMON,
  }),
});

function validateClaims(rawFacts, specs) {
  const facts = {}, warnings = [], ignored = [];
  if (!isObject(rawFacts)) return { facts, warnings: [{ code: 'FACTS_MISSING' }], ignored };
  for (const key of Object.keys(rawFacts)) {
    if (!Object.hasOwn(specs, key)) { ignored.push(safeName(key)); continue; }
    const entry = rawFacts[key];
    const claim = isObject(entry) && Object.hasOwn(entry, 'value') ? entry : { value: entry };
    const value = specs[key].normalize(claim.value);
    if (value === undefined) { warnings.push({ code: 'FACT_INVALID', key }); continue; }
    facts[key] = { value, sources: sourceList(claim.sources), subjectModel: modelToken(claim.subjectModel) };
  }
  return { facts, warnings, ignored };
}

function validateTier(raw) {
  if (raw === undefined || raw === null) return { tier: null, warnings: [] };
  const claim = isObject(raw) ? raw : { value: raw };
  const value = normalizeTier(claim.value);
  if (!value || !TIERS.includes(value)) return { tier: null, warnings: [{ code: 'TIER_INVALID' }] };
  const basis = TIER_BASES.includes(String(claim.basis).toUpperCase()) ? String(claim.basis).toUpperCase() : 'UNKNOWN';
  return { tier: { value, basis, sources: sourceList(claim.sources), subjectModel: modelToken(claim.subjectModel) }, warnings: [] };
}

function claimedModel(raw) {
  const claim = isObject(raw) ? raw : { value: raw };
  return { value: modelToken(claim.value), sources: sourceList(claim.sources) };
}

/** Job A payload: `{ original: { canonicalModel, possibleModels, facts, tier } }`. */
export function validateOriginalResearch(raw, category) {
  const specs = FIELD_SPECS[category];
  if (!specs) return { status: 'INVALID', errorCode: 'UNSUPPORTED_CATEGORY' };
  if (!isObject(raw) || !isObject(raw.original)) return { status: 'INVALID', errorCode: 'RESEARCH_SCHEMA_INVALID' };
  const { original } = raw;
  const claims = validateClaims(original.facts, specs);
  const tier = validateTier(original.tier);
  const possibleModels = [...new Set((Array.isArray(original.possibleModels) ? original.possibleModels : []).map(modelToken).filter(Boolean))].slice(0, MAX_POSSIBLE_MODELS);
  return {
    status: 'OK',
    canonicalModel: claimedModel(original.canonicalModel),
    possibleModels,
    facts: claims.facts,
    tier: tier.tier,
    ignored: claims.ignored,
    warnings: [...claims.warnings, ...tier.warnings],
  };
}

function validateCandidateEntry(entry, category, specs) {
  if (!isObject(entry)) return { ok: false, reasonCode: 'MALFORMED_ENTRY' };
  const brand = safeText(entry.brand, 40);
  if (!brand) return { ok: false, reasonCode: 'MISSING_BRAND' };
  const returnedCategory = cleanText(entry.category, 30)?.toLowerCase();
  if (!returnedCategory) return { ok: false, reasonCode: 'MISSING_CATEGORY' };
  if (returnedCategory !== category) return { ok: false, reasonCode: 'WRONG_CATEGORY' };
  const model = modelToken(entry.model);
  const baselineLabel = safeText(entry.baselineLabel, MAX_TEXT);
  if (entry.model !== undefined && entry.model !== null && !model && !baselineLabel) return { ok: false, reasonCode: 'VAGUE_MODEL' };
  if (!model && !baselineLabel) return { ok: false, reasonCode: 'MISSING_MODEL' };
  const availability = AVAILABILITY.includes(String(entry.availability).toUpperCase()) ? String(entry.availability).toUpperCase() : 'UNKNOWN';
  const condition = CONDITIONS.includes(String(entry.condition).toUpperCase()) ? String(entry.condition).toUpperCase() : 'UNKNOWN';
  if (['DISCONTINUED', 'MARKETPLACE_ONLY'].includes(availability) || ['OPEN_BOX', 'REFURBISHED', 'USED'].includes(condition)) {
    return { ok: false, reasonCode: 'NOT_CURRENT_NEW_RETAIL', candidateModel: model };
  }
  const claims = validateClaims(entry.facts, specs);
  const tier = validateTier(entry.tier);
  const allowed = new Set(['brand', 'model', 'baselineLabel', 'category', 'availability', 'condition', 'relationship', 'identitySources', 'relationshipSources', 'relatedModel', 'facts', 'tier', 'providerRank', 'providerConfidence']);
  const ignoredNames = [...claims.ignored, ...Object.keys(entry).filter((key) => !allowed.has(key)).map(safeName)];
  const isPolicy = (name) => POLICY_KEY.test(name);
  const isPrice = (name) => !isPolicy(name) && PRICE_KEY.test(name);
  const relationship = String(entry.relationship).toUpperCase();
  return {
    ok: true,
    candidate: {
      brand,
      model,
      baselineLabel: model ? null : baselineLabel,
      availability,
      relationship: RELATIONSHIPS.includes(relationship) ? relationship : 'UNKNOWN',
      identitySources: sourceList(entry.identitySources),
      relationshipSources: sourceList(entry.relationshipSources),
      relatedModel: modelToken(entry.relatedModel),
      facts: claims.facts,
      tier: tier.tier,
      providerRank: Number.isInteger(entry.providerRank) && entry.providerRank >= 1 ? entry.providerRank : null,
      providerConfidence: CONFIDENCES.includes(String(entry.providerConfidence).toUpperCase()) ? String(entry.providerConfidence).toUpperCase() : null,
      policyFieldsIgnored: ignoredNames.filter(isPolicy).slice(0, MAX_IGNORED_NAMES),
      priceFieldsDiscarded: ignoredNames.some(isPrice),
      unsupportedFields: ignoredNames.filter((name) => !isPolicy(name) && !isPrice(name)).slice(0, MAX_IGNORED_NAMES),
    },
    warnings: [...claims.warnings, ...tier.warnings, ...(RELATIONSHIPS.includes(relationship) || entry.relationship === undefined ? [] : [{ code: 'RELATIONSHIP_INVALID' }])],
  };
}

/** Job B payload: `{ candidates: [...] }`. Entries are validated independently so one bad entry cannot sink the rest. */
export function validateCandidateResearch(raw, category) {
  const specs = FIELD_SPECS[category];
  if (!specs) return { status: 'INVALID', errorCode: 'UNSUPPORTED_CATEGORY' };
  if (!isObject(raw) || !Array.isArray(raw.candidates)) return { status: 'INVALID', errorCode: 'RESEARCH_SCHEMA_INVALID' };
  const warnings = [];
  if (raw.candidates.length > MAX_RAW_CANDIDATES) warnings.push({ code: 'CANDIDATES_TRUNCATED', received: raw.candidates.length });
  const entries = raw.candidates.slice(0, MAX_RAW_CANDIDATES).map((entry) => {
    // Hostile shapes (e.g. deeply nested arrays) must reject one entry, never throw out of validation.
    try { return validateCandidateEntry(entry, category, specs); } catch (_) { return { ok: false, reasonCode: 'MALFORMED_ENTRY' }; }
  });
  return {
    status: 'OK',
    receivedCount: raw.candidates.length,
    candidates: entries.filter((entry) => entry.ok).map((entry) => entry.candidate),
    rejected: entries.filter((entry) => !entry.ok).map(({ reasonCode, candidateModel }) => ({ reasonCode, ...(candidateModel ? { candidateModel } : {}) })),
    warnings: [...warnings, ...entries.flatMap((entry) => entry.warnings || [])],
  };
}
