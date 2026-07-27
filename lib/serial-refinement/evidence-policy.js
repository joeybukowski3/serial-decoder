import { intersectRanges, parseYearRange } from './candidate-intersection.js';

const OFFICIAL_QUALITIES = new Set(['official']);
const SECONDARY_QUALITIES = new Set(['strong-secondary', 'secondary']);
const MODEL_INTELLIGENCE_QUALITIES = new Set(['model-intelligence']);

function safeHost(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  } catch (_) {
    return '';
  }
}

function sourceIdentity(evidence) {
  // Gemini grounding citations all resolve through the same
  // vertexaisearch.cloud.google.com redirect host, so the source's own
  // reported name/title (the actual publisher) must take priority over
  // the redirect URL's host when judging source independence.
  const label = String(evidence.sourceName || evidence.title || '').trim().toLowerCase();
  return label || safeHost(evidence.sourceUrl);
}

export function evidenceYearRange(evidence, currentYear) {
  if (!evidence || typeof evidence !== 'object') return null;
  const production = parseYearRange({
    start: evidence.productionStart ?? null,
    end: evidence.productionEnd ?? null,
  }, { currentYear });
  if (production && (production.start != null || production.end != null)) return production;

  const availability = parseYearRange({
    start: evidence.availabilityStart ?? null,
    end: evidence.availabilityEnd ?? null,
  }, { currentYear });
  if (availability && (availability.start != null || availability.end != null)) return availability;

  return parseYearRange(evidence.yearRange, { currentYear });
}

export function normalizeEvidenceRecord(evidence, currentYear = new Date().getUTCFullYear()) {
  if (!evidence || typeof evidence !== 'object') return null;
  const range = evidenceYearRange(evidence, currentYear);
  return {
    type: String(evidence.type || 'heuristic'),
    title: String(evidence.title || evidence.sourceName || 'Evidence'),
    sourceUrl: typeof evidence.sourceUrl === 'string' && evidence.sourceUrl.trim() ? evidence.sourceUrl.trim() : null,
    publishedDate: typeof evidence.publishedDate === 'string' && evidence.publishedDate.trim() ? evidence.publishedDate.trim() : null,
    availabilityStart: range ? range.start : null,
    availabilityEnd: range ? range.end : null,
    productionStart: evidence.productionStart == null ? null : Number.parseInt(String(evidence.productionStart), 10),
    productionEnd: evidence.productionEnd == null ? null : Number.parseInt(String(evidence.productionEnd), 10),
    supports: String(evidence.supports || evidence.notes || ''),
    quality: String(evidence.quality || 'heuristic'),
    verified: evidence.verified === true,
    sourceName: String(evidence.sourceName || ''),
    _range: range,
    _sourceIdentity: sourceIdentity(evidence),
  };
}

function hasUsableCitation(evidence) {
  if (evidence.type === 'local-db' && evidence.verified) return true;
  return Boolean(evidence.sourceUrl);
}

export function evaluateEvidencePolicy(evidenceRecords, options = {}) {
  const currentYear = options.currentYear || new Date().getUTCFullYear();
  const normalized = (evidenceRecords || [])
    .map((record) => normalizeEvidenceRecord(record, currentYear))
    .filter(Boolean);
  const displayEvidence = normalized.map(({ _range, _sourceIdentity, ...record }) => record);

  const official = normalized.filter((record) =>
    OFFICIAL_QUALITIES.has(record.quality) && record._range && hasUsableCitation(record));

  if (official.length) {
    const range = intersectRanges(official.map((record) => record._range));
    return {
      sufficient: true,
      confidence: 'high',
      range,
      qualifyingEvidence: official.map(({ _range, _sourceIdentity, ...record }) => record),
      evidence: displayEvidence,
      reason: 'official-evidence',
    };
  }

  const strongSecondary = normalized.filter((record) =>
    SECONDARY_QUALITIES.has(record.quality) && record._range && hasUsableCitation(record));
  const uniqueSources = new Set(strongSecondary.map((record) => record._sourceIdentity).filter(Boolean));
  if (strongSecondary.length >= 2 && uniqueSources.size >= 2) {
    const range = intersectRanges(strongSecondary.map((record) => record._range));
    return {
      sufficient: true,
      confidence: 'medium',
      range,
      qualifyingEvidence: strongSecondary.map(({ _range, _sourceIdentity, ...record }) => record),
      evidence: displayEvidence,
      reason: 'independent-secondary-evidence',
    };
  }

  const modelIntelligence = normalized.filter((record) =>
    MODEL_INTELLIGENCE_QUALITIES.has(record.quality) && record._range);
  if (modelIntelligence.length) {
    const range = intersectRanges(modelIntelligence.map((record) => record._range));
    return {
      sufficient: true,
      confidence: 'low',
      range,
      qualifyingEvidence: modelIntelligence.map(({ _range, _sourceIdentity, ...record }) => record),
      evidence: displayEvidence,
      reason: 'smart-lookup-model-intelligence',
    };
  }

  return {
    sufficient: false,
    confidence: null,
    range: null,
    qualifyingEvidence: [],
    evidence: displayEvidence,
    reason: normalized.length ? 'insufficient-evidence-quality' : 'no-evidence',
  };
}
