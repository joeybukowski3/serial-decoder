import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compactModelValue, normalizeModelInput, validateTranscriptionAlternatives } from './normalize-model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_DB_PATH = path.join(__dirname, '..', '..', 'data', 'model-age-db.json');
let cache = null;

function normalizeBrand(value) {
  return String(value || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
}

function recordModels(record) {
  return [record.model, ...(record.aliases || [])].map(compactModelValue).filter(Boolean);
}

function isSafeAliasMatch(inputCompact, record) {
  if (!inputCompact) return false;
  const exactModel = compactModelValue(record.model);
  if (inputCompact === exactModel) return true;
  return (record.aliases || []).some((alias) => {
    const aliasCompact = compactModelValue(alias);
    if (inputCompact !== aliasCompact) return false;
    return aliasCompact.length >= 7 && aliasCompact.length >= Math.ceil(exactModel.length * 0.8);
  });
}

async function loadDb(dbPath = DEFAULT_DB_PATH) {
  if (cache && dbPath === DEFAULT_DB_PATH) return cache;
  const parsed = JSON.parse(await readFile(dbPath, 'utf8'));
  const records = Array.isArray(parsed.records) ? parsed.records : [];
  const value = { ...parsed, records };
  if (dbPath === DEFAULT_DB_PATH) cache = value;
  return value;
}

function legacyEvidence(record) {
  if (!record.productionRange) return [];
  return [{
    type: 'local-db',
    title: `${record.brand || 'Unknown'} ${record.model || ''} legacy model-family range`.trim(),
    sourceUrl: null,
    sourceName: record.source || 'Legacy local model age database',
    yearRange: record.productionRange,
    supports: record.notes || 'Legacy model-family production window.',
    quality: 'heuristic',
    verified: false,
  }];
}

function evidenceForRecord(record) {
  return Array.isArray(record.refinementEvidence) && record.refinementEvidence.length
    ? record.refinementEvidence
    : legacyEvidence(record);
}

export async function findLocalRefinementEvidence({ brand, model, dbPath } = {}) {
  const db = await loadDb(dbPath || DEFAULT_DB_PATH);
  const brandKey = normalizeBrand(brand);
  const brandRecords = db.records.filter((record) => !brandKey || normalizeBrand(record.brand) === brandKey);
  const knownModels = brandRecords.flatMap(recordModels);
  const normalized = validateTranscriptionAlternatives(normalizeModelInput(model), knownModels);
  const inputCompact = normalized.compact;

  let match = brandRecords.find((record) => isSafeAliasMatch(inputCompact, record)) || null;
  let matchedAlternative = null;

  if (!match) {
    for (const alternative of normalized.possibleTranscriptionAlternatives) {
      if (!alternative.validated) continue;
      const alternativeCompact = compactModelValue(alternative.value);
      const candidate = brandRecords.find((record) => isSafeAliasMatch(alternativeCompact, record));
      if (candidate) {
        match = candidate;
        matchedAlternative = alternative;
        break;
      }
    }
  }

  return {
    record: match,
    evidence: match ? evidenceForRecord(match) : [],
    normalization: {
      ...normalized,
      matchedValue: matchedAlternative ? matchedAlternative.value : normalized.canonical,
      usedValidatedAlternative: Boolean(matchedAlternative),
      validatedAlternative: matchedAlternative,
    },
  };
}

export function clearLocalEvidenceCache() {
  cache = null;
}
