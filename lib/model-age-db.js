import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'model-age-db.json');

let dbCache = null;
const GENERIC_QUERY_STOP_WORDS = new Set([
  'and',
  'appliance',
  'brand',
  'by',
  'dishwasher',
  'door',
  'dryer',
  'electric',
  'equipment',
  'for',
  'french',
  'fridge',
  'freezer',
  'front',
  'gas',
  'heat',
  'heater',
  'hvac',
  'in',
  'inside',
  'machine',
  'model',
  'number',
  'of',
  'oven',
  'profile',
  'pump',
  'range',
  'refrigerator',
  'series',
  'side',
  'split',
  'system',
  'television',
  'tv',
  'unit',
  'washer',
  'water',
  'with'
]);

function uniqueNormalizedValues(values) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );
}

export function normalizeModelNumber(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function normalizeBrandName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');
}

export async function loadLocalModelAgeDb(options = {}) {
  if (dbCache && !options.forceReload) return dbCache;

  const dbPath = options.dbPath || DEFAULT_DB_PATH;
  const raw = await readFile(dbPath, 'utf8');
  const parsed = JSON.parse(raw);
  const records = Array.isArray(parsed.records) ? parsed.records : [];

  dbCache = {
    ...parsed,
    records: records.map((record) => {
      const aliases = Array.isArray(record.aliases) ? record.aliases : [];
      return {
        ...record,
        normalizedBrand: record.normalizedBrand || normalizeBrandName(record.brand),
        normalizedModel: record.normalizedModel || normalizeModelNumber(record.model),
        aliases,
        normalizedAliases: uniqueNormalizedValues(
          aliases.map((alias) => normalizeModelNumber(alias))
        )
      };
    })
  };

  return dbCache;
}

function tokenizeNormalizedModel(value) {
  const normalized = normalizeModelNumber(value);
  if (!normalized) return [];
  return normalized.match(/[a-z]+|\d+/g) || [normalized];
}

function countSharedPrefixLength(a, b) {
  const max = Math.min(a.length, b.length);
  let index = 0;

  while (index < max && a[index] === b[index]) {
    index += 1;
  }

  return index;
}

function computeLevenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));

  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}

function buildSearchTerms(record) {
  return uniqueNormalizedValues([
    record.normalizedModel,
    record.model,
    ...(record.aliases || [])
  ]).map((term) => normalizeModelNumber(term));
}

export function inferLocalModelAgeBrand(records, query) {
  const queryText = String(query || '').toLowerCase();
  if (!queryText) return '';

  const knownBrands = uniqueNormalizedValues(records.map((record) => record.brand))
    .sort((a, b) => b.length - a.length);

  for (const brand of knownBrands) {
    const escaped = String(brand).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(queryText)) {
      return brand;
    }
  }

  return '';
}

export function extractLocalModelAgeLookupTerms(query) {
  const rawQuery = String(query || '').trim();
  const rawTokens = rawQuery.match(/[A-Za-z0-9]+/g) || [];
  const terms = [];

  for (const token of rawTokens) {
    const normalizedToken = normalizeModelNumber(token);
    if (!normalizedToken) continue;
    if (GENERIC_QUERY_STOP_WORDS.has(normalizedToken)) continue;
    if (/\d/.test(token) || normalizedToken.length >= 6) {
      terms.push(token);
    }
  }

  for (let index = 0; index < rawTokens.length; index += 1) {
    for (let size = 2; size <= 3; size += 1) {
      const slice = rawTokens.slice(index, index + size);
      if (slice.length !== size) continue;

      const joined = slice.join('');
      const normalizedJoined = normalizeModelNumber(joined);
      if (!normalizedJoined || normalizedJoined.length < 5) continue;
      if (!/\d/.test(normalizedJoined)) continue;
      terms.push(joined);
    }
  }

  const normalizedFullQuery = normalizeModelNumber(rawQuery);
  if (normalizedFullQuery && /\d/.test(normalizedFullQuery) && normalizedFullQuery.length >= 5) {
    terms.push(rawQuery);
  }

  return uniqueNormalizedValues(terms)
    .sort((a, b) => normalizeModelNumber(b).length - normalizeModelNumber(a).length);
}

export function findExactLocalModelAgeMatch(records, query, brand) {
  const normalizedQuery = normalizeModelNumber(query);
  const normalizedBrand = normalizeBrandName(brand);
  if (!normalizedQuery) return null;

  for (const record of records) {
    if (normalizedBrand && record.normalizedBrand !== normalizedBrand) continue;
    const terms = buildSearchTerms(record);
    if (terms.includes(normalizedQuery)) {
      return {
        record,
        matchType: record.normalizedModel === normalizedQuery ? 'normalized-exact' : 'alias-exact'
      };
    }
  }

  return null;
}

export function scoreLocalModelAgeConfidence({ query, brand, record, matchType }) {
  const normalizedQuery = normalizeModelNumber(query);
  const normalizedBrand = normalizeBrandName(brand);
  const modelTerms = buildSearchTerms(record);
  const prefixScore = Math.max(...modelTerms.map((term) => countSharedPrefixLength(normalizedQuery, term)), 0);
  const containsHit = modelTerms.some((term) => term.includes(normalizedQuery) || normalizedQuery.includes(term));
  const distanceScore = Math.min(...modelTerms.map((term) => computeLevenshteinDistance(normalizedQuery, term)));

  let confidence = 0.35;

  if (normalizedBrand && normalizedBrand === record.normalizedBrand) confidence += 0.15;
  if (matchType === 'normalized-exact') confidence += 0.4;
  if (matchType === 'alias-exact') confidence += 0.3;
  if (containsHit) confidence += 0.15;
  if (prefixScore >= 6) confidence += 0.1;
  if (distanceScore <= 2) confidence += 0.1;
  if (distanceScore >= 6) confidence -= 0.1;

  return Math.max(0, Math.min(1, Number(confidence.toFixed(2))));
}

export function findCloseLocalModelAgeCandidates(records, query, brand, options = {}) {
  const normalizedQuery = normalizeModelNumber(query);
  const normalizedBrand = normalizeBrandName(brand);
  const minConfidence = options.minConfidence ?? 0.45;
  const limit = options.limit ?? 5;

  if (!normalizedQuery) return [];

  return records
    .filter((record) => !normalizedBrand || record.normalizedBrand === normalizedBrand)
    .map((record) => {
      const terms = buildSearchTerms(record);
      const bestDistance = Math.min(...terms.map((term) => computeLevenshteinDistance(normalizedQuery, term)));
      const bestPrefix = Math.max(...terms.map((term) => countSharedPrefixLength(normalizedQuery, term)), 0);
      const queryTokens = tokenizeNormalizedModel(normalizedQuery);
      const termTokens = tokenizeNormalizedModel(record.normalizedModel);
      const sharedTokens = queryTokens.filter((token) => termTokens.includes(token)).length;
      const containsHit = terms.some((term) => term.includes(normalizedQuery) || normalizedQuery.includes(term));

      let matchType = 'fuzzy';
      if (terms.includes(normalizedQuery)) matchType = 'normalized-exact';
      else if (containsHit) matchType = 'contains';
      else if (bestPrefix >= 5) matchType = 'prefix';

      const confidence = scoreLocalModelAgeConfidence({
        query: normalizedQuery,
        brand,
        record,
        matchType
      });

      return {
        record,
        matchType,
        confidence,
        metrics: {
          bestDistance,
          bestPrefix,
          sharedTokens
        }
      };
    })
    .filter((candidate) => candidate.confidence >= minConfidence)
    .sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      if (a.metrics.bestDistance !== b.metrics.bestDistance) return a.metrics.bestDistance - b.metrics.bestDistance;
      return b.metrics.bestPrefix - a.metrics.bestPrefix;
    })
    .slice(0, limit);
}

function getExactManufactureYear(record) {
  if (record.exactManufactureYear != null) return record.exactManufactureYear;
  if (Number.isInteger(record.yearStart) && record.yearStart === record.yearEnd) return record.yearStart;
  return null;
}

export function formatLocalModelAgeMatch(record, options = {}) {
  const confidence = options.confidence ?? null;
  const matchType = options.matchType || 'local-db';
  const confidenceText = confidence !== null ? `Confidence: ${Math.round(confidence * 100)}%.` : null;
  const notes = [
    `Matched from the internal model age database using a known production range for ${record.brand || 'this product'} ${record.model || ''}.`.trim(),
    record.notes,
    confidenceText
  ]
    .filter(Boolean)
    .join(' ');

  return {
    brand: record.brand || 'Unknown',
    model: record.displayModel || record.model || null,
    itemCategory: record.category || null,
    category: record.category || null,
    estimatedYear: getExactManufactureYear(record) != null ? String(getExactManufactureYear(record)) : null,
    yearRange: record.productionRange || null,
    specificityLevel: record.model ? 'specific' : 'brand-only',
    inventionSummary: null,
    refinementSuggestion: 'For the most accurate result, verify the exact brand and complete model number from the product label.',
    notes: notes || 'Matched from the local model age database.',
    source: record.source || 'Local model age database',
    evidence: [
      {
        detail: record.source || 'Matched from the local model age database.',
        source: 'Local model age database'
      }
    ],
    serialLocation: options.serialLocation || null,
    serialRule: options.serialRule || 'Use the Serial Decoder tab above for precise dating when a serial format is available.',
    exampleModelNumber: null,
    suggestedModelNumbers: [],
    _source: 'local-model-age-db',
    _fallbackUsed: false,
    _local: {
      confidence,
      matchType,
      category: record.category || null
    }
  };
}
