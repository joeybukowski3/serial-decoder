import { readFile } from 'node:fs/promises';

import { normalizeVizioModelEntry } from './model-normalization.js';

const DEFAULT_REGISTRY_URL = new URL('../../data/vizio-tv-generations.json', import.meta.url);
const ALLOWED_ESTIMATE_BASES = new Set([
  'verified-model-generation',
  'verified-lineup-generation',
]);

let registryCache = null;

export async function loadVizioGenerationRegistry(options = {}) {
  if (registryCache && !options.forceReload && !options.registryUrl) return registryCache;
  const raw = await readFile(options.registryUrl || DEFAULT_REGISTRY_URL, 'utf8');
  const registry = JSON.parse(raw);
  if (!options.registryUrl) registryCache = registry;
  return registry;
}

function addError(errors, condition, message) {
  if (condition) errors.push(message);
}

export function validateVizioGenerationRegistry(registry) {
  const errors = [];
  const evidenceIds = new Set((registry.evidence || []).map((item) => item.id));
  const canonicalOwners = new Map();
  const aliasOwners = new Map();
  const compiledPatterns = [];

  addError(errors, registry.schemaVersion !== 1, 'schemaVersion must be 1');

  const validateGeneration = (item, owner) => {
    addError(errors, !Number.isInteger(item.modelYear), `${owner}: modelYear must be an integer`);
    addError(errors, !ALLOWED_ESTIMATE_BASES.has(item.estimateBasis), `${owner}: unsupported estimateBasis`);
    const start = item.productionRange?.start;
    const end = item.productionRange?.end;
    addError(errors, !Number.isInteger(start), `${owner}: productionRange.start must be an integer`);
    addError(errors, end != null && !Number.isInteger(end), `${owner}: productionRange.end must be an integer or null`);
    addError(errors, Number.isInteger(start) && Number.isInteger(end) && end < start, `${owner}: productionRange.end is before start`);
    for (const evidenceId of item.evidenceIds || []) {
      addError(errors, !evidenceIds.has(evidenceId), `${owner}: missing evidence reference ${evidenceId}`);
    }
    addError(errors, !Array.isArray(item.evidenceIds) || item.evidenceIds.length === 0, `${owner}: evidenceIds are required`);
  };

  for (const item of registry.exactModels || []) {
    const owner = `exact:${item.canonicalModel}`;
    validateGeneration(item, owner);
    const canonicalKey = String(item.canonicalModel || '').toUpperCase();
    addError(errors, canonicalOwners.has(canonicalKey), `${owner}: duplicate canonical model`);
    canonicalOwners.set(canonicalKey, { owner, year: item.modelYear, item });
    for (const alias of item.aliases || []) {
      const aliasKey = String(alias || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const existing = aliasOwners.get(aliasKey);
      addError(errors, Boolean(existing && existing !== canonicalKey), `${owner}: alias ${alias} belongs to multiple models`);
      aliasOwners.set(aliasKey, canonicalKey);
    }
  }

  for (const pattern of registry.generationPatterns || []) {
    const owner = `pattern:${pattern.id}`;
    validateGeneration(pattern, owner);
    let regex = null;
    try {
      regex = new RegExp(pattern.pattern, 'i');
    } catch (_) {
      errors.push(`${owner}: invalid regex`);
    }
    addError(errors, !Array.isArray(pattern.canonicalModels) || pattern.canonicalModels.length < 2,
      `${owner}: at least two canonicalModels are required`);
    if (regex) {
      for (const canonicalModel of pattern.canonicalModels || []) {
        addError(errors, !regex.test(canonicalModel), `${owner}: ${canonicalModel} does not match its pattern`);
      }
      compiledPatterns.push({ pattern, regex });
    }
  }

  const patternModels = new Map();
  const allPatternCanonicalModels = new Set(
    compiledPatterns.flatMap(({ pattern }) => pattern.canonicalModels || [])
  );
  for (const { pattern, regex } of compiledPatterns) {
    for (const canonicalModel of pattern.canonicalModels || []) {
      const key = canonicalModel.toUpperCase();
      const existing = patternModels.get(key);
      addError(errors, Boolean(existing && existing.year !== pattern.modelYear),
        `pattern:${pattern.id}: ${canonicalModel} overlaps ${existing?.id} with a different year`);
      patternModels.set(key, { id: pattern.id, year: pattern.modelYear });
    }
    for (const [canonicalModel, exact] of canonicalOwners) {
      if (regex.test(canonicalModel)) {
        addError(errors, exact.year !== pattern.modelYear,
          `${exact.owner}: conflicts with pattern ${pattern.id}`);
      }
    }
  }

  for (const canonicalModel of allPatternCanonicalModels) {
    const matches = compiledPatterns.filter(({ regex }) => regex.test(canonicalModel));
    const years = new Set(matches.map(({ pattern }) => pattern.modelYear));
    addError(errors, years.size > 1,
      `${canonicalModel}: overlaps patterns with different years (${matches.map(({ pattern }) => pattern.id).join(', ')})`);
  }

  return { valid: errors.length === 0, errors };
}

function allKnownModels(registry) {
  const exact = (registry.exactModels || []).map((item) => ({ ...item, matchLevel: 'exact' }));
  const patterns = (registry.generationPatterns || []).flatMap((pattern) =>
    (pattern.canonicalModels || []).map((canonicalModel) => ({
      canonicalModel,
      aliases: [],
      matchLevel: 'pattern',
      pattern,
    })));
  return [...exact, ...patterns];
}

function rangeLabel(range) {
  if (!range) return null;
  if (range.end == null) return `${range.start} or later`;
  return range.start === range.end
    ? `Approximately ${range.start}`
    : `Approximately ${range.start}\u2013${range.end}`;
}

function evidenceFor(registry, evidenceIds) {
  const wanted = new Set(evidenceIds || []);
  return (registry.evidence || [])
    .filter((item) => wanted.has(item.id))
    .map((item) => ({ detail: item.title, source: item.publisher, url: item.url }));
}

export async function resolveVizioModelGeneration(value, options = {}) {
  const registry = options.registry || await loadVizioGenerationRegistry(options);
  const validation = validateVizioGenerationRegistry(registry);
  if (!validation.valid) throw new Error(`Invalid VIZIO generation registry: ${validation.errors.join('; ')}`);

  const normalized = normalizeVizioModelEntry(value, allKnownModels(registry));
  if (!normalized) return null;

  const source = normalized.matchLevel === 'exact' ? normalized : normalized.pattern;
  const estimateBasis = source.estimateBasis;
  const series = source.series;
  const productionRange = {
    ...source.productionRange,
    current: source.productionRange.end == null,
    basis: estimateBasis,
  };
  const matchMethod = normalized.matchLevel === 'exact'
    ? normalized.matchedBy
    : 'constrained-lineup-pattern';
  const modelYear = source.modelYear;
  const noteParts = [
    `The ${normalized.canonicalModel} belongs to VIZIO's ${modelYear} ${series} model generation and was likely manufactured around ${rangeLabel(source.productionRange).replace(/^Approximately /, '')}.`,
    'This model-generation evidence does not establish the manufacture date of an individual television.',
    source.notes,
  ].filter(Boolean);

  return {
    brand: registry.brand || 'VIZIO',
    category: String(registry.category || 'Television').toLowerCase(),
    itemCategory: String(registry.category || 'Television').toLowerCase(),
    series,
    seriesLine: series,
    recognizedSeries: series,
    model: normalized.enteredModel,
    enteredModel: normalized.enteredModel,
    canonicalModel: normalized.canonicalModel,
    exactModel: normalized.canonicalModel,
    recognizedModel: normalized.canonicalModel,
    matchedBy: matchMethod,
    normalizationApplied: normalized.normalizationApplied,
    verifiedExact: true,
    bestEstimateYear: modelYear,
    estimatedYear: null,
    estimatedYearType: 'model-production',
    productionRange,
    estimatedRange: productionRange,
    yearRange: rangeLabel(source.productionRange).replace(/^Approximately /, ''),
    rangeLabel: rangeLabel(source.productionRange),
    estimateBasis,
    individualManufactureYear: null,
    identityConfidence: source.identityConfidence || 'high',
    timingConfidence: source.timingConfidence || 'medium',
    confidence: source.identityConfidence || 'high',
    likelyProduct: `VIZIO ${normalized.canonicalModel} ${series} television`,
    specificityLevel: 'specific',
    refinementSuggestion: 'Use a supported VIZIO serial decode or a dated manufacturing label to narrow the individual unit manufacture date.',
    serialNeededForExactUnitDate: true,
    notes: noteParts.join(' '),
    source: 'VIZIO verified television generation registry',
    evidence: evidenceFor(registry, source.evidenceIds),
    _source: 'local-vizio-registry',
    _fallbackUsed: false,
  };
}
