import { readFile } from 'node:fs/promises';
import { normalizeCandidateYears } from './serial-refinement/candidate-intersection.js';

const DEFAULT_DB_URL = new URL('./data/model-production-database.json', import.meta.url);
const VERIFIED_DB_URL = new URL('../data/model-age-db.json', import.meta.url);
const BRAND_ALIASES = new Map([
  ['GENERALELECTRIC', 'GE'],
  ['GEAPPLIANCES', 'GE'],
  ['KITCHENAID', 'KITCHENAID'],
]);

let databasePromise = null;

function normalizeIdentifier(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeBrand(value) {
  const normalized = normalizeIdentifier(value);
  return BRAND_ALIASES.get(normalized) || normalized;
}

function normalizePattern(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9*]/g, '');
}

function wildcardPattern(pattern, prefixOnly = false) {
  const normalized = normalizePattern(pattern);
  if (!normalized) return null;
  const expression = normalized
    .split(/(\*+)/)
    .filter(Boolean)
    .map((part) => (/^\*+$/.test(part) ? '[A-Z0-9]*' : part))
    .join('');
  return new RegExp(`^${expression}${prefixOnly ? '[A-Z0-9]*' : ''}$`);
}

function familyMatches(model, family) {
  const normalizedFamily = normalizePattern(family);
  if (!normalizedFamily) return false;
  if (normalizedFamily.includes('*')) {
    return wildcardPattern(normalizedFamily, true).test(model);
  }
  return model.startsWith(normalizedFamily);
}

function matchRecord(model, record) {
  const pattern = normalizePattern(record.model);
  if (!pattern) return null;

  if (!pattern.includes('*')) {
    return pattern === model
      ? { type: 'exact', specificity: pattern.length }
      : null;
  }

  if (!familyMatches(model, record.modelFamily)) return null;
  if (!wildcardPattern(pattern).test(model)) return null;
  return {
    type: 'model-family',
    specificity: pattern.replace(/\*/g, '').length,
  };
}

function isSingleEditApart(left, right) {
  if (left === right || Math.abs(left.length - right.length) > 1) return false;
  let leftIndex = 0;
  let rightIndex = 0;
  let edits = 0;

  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) leftIndex += 1;
    else if (right.length > left.length) rightIndex += 1;
    else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }

  if (leftIndex < left.length || rightIndex < right.length) edits += 1;
  return edits === 1;
}

async function loadDatabase() {
  if (!databasePromise) {
    databasePromise = Promise.all([
      readFile(DEFAULT_DB_URL, 'utf8'),
      readFile(VERIFIED_DB_URL, 'utf8'),
    ])
      .then(([content, verifiedContent]) => {
        const records = JSON.parse(content);
        if (!Array.isArray(records)) throw new Error('Invalid model production database');

        const byBrand = new Map();
        for (const record of records) {
          const brandKey = normalizeBrand(record.brand);
          if (!brandKey) continue;
          const brandRecords = byBrand.get(brandKey) || [];
          brandRecords.push(record);
          byBrand.set(brandKey, brandRecords);
        }

        const verifiedByBrand = new Map();
        const verifiedRecords = JSON.parse(verifiedContent)?.records || [];
        for (const record of verifiedRecords) {
          const brandKey = normalizeBrand(record.brand);
          if (!brandKey) continue;
          const acceptedModels = verifiedByBrand.get(brandKey) || new Set();
          [record.model, ...(record.exactAliases || [])]
            .map(normalizeIdentifier)
            .filter(Boolean)
            .forEach((value) => acceptedModels.add(value));
          verifiedByBrand.set(brandKey, acceptedModels);
        }

        return { byBrand, verifiedByBrand };
      })
      .catch((error) => {
        databasePromise = null;
        throw error;
      });
  }
  return databasePromise;
}

function confidenceForMatch(matchType, record) {
  if (matchType === 'exact' && record.confidence === 'strong-secondary') return 'medium';
  return 'low';
}

export async function lookupModelProduction(brand, model, serialCandidates) {
  const brandKey = normalizeBrand(brand);
  const modelKey = normalizeIdentifier(model);
  const candidateYears = normalizeCandidateYears(serialCandidates);
  if (!brandKey || !modelKey || !candidateYears.length) return null;

  const { byBrand, verifiedByBrand } = await loadDatabase();
  const acceptedVerifiedModels = verifiedByBrand.get(brandKey) || new Set();
  if (!acceptedVerifiedModels.has(modelKey)
    && [...acceptedVerifiedModels].some((knownModel) => isSingleEditApart(modelKey, knownModel))) {
    return null;
  }

  const matches = (byBrand.get(brandKey) || [])
    .map((record) => ({ record, match: matchRecord(modelKey, record) }))
    .filter(({ record, match }) => match && Number.isInteger(record.productionStartYear));
  if (!matches.length) return null;

  const exactMatches = matches.filter(({ match }) => match.type === 'exact');
  const eligibleMatches = exactMatches.length ? exactMatches : matches;
  const highestSpecificity = Math.max(...eligibleMatches.map(({ match }) => match.specificity));
  const bestMatches = eligibleMatches.filter(({ match }) => match.specificity === highestSpecificity);
  const startYears = new Set(bestMatches.map(({ record }) => record.productionStartYear));
  if (startYears.size !== 1) return null;

  const { record, match } = bestMatches[0];
  const productionStartYear = record.productionStartYear;
  const narrowedYears = candidateYears.filter((year) => year >= productionStartYear - 1);

  return {
    narrowedYears,
    confidence: confidenceForMatch(match.type, record),
    source: record.introductionSource || 'Local model production database',
    sourceUrl: record.introductionSourceUrl || null,
    productionStartYear,
    matchedModel: record.model,
    matchType: match.type,
  };
}

export function clearModelProductionCache() {
  databasePromise = null;
}
