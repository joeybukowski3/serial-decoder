import {
  extractLocalModelAgeLookupTerms,
  findCloseLocalModelAgeCandidates,
  findExactLocalModelAgeMatch,
  formatLocalModelAgeMatch,
  inferLocalModelAgeBrand,
  loadLocalModelAgeDb,
  normalizeModelNumber,
} from '../model-age-db.js';
import { matchExactModelEvidence } from '../model-evidence/exact-model-match.js';

const LOCAL_STRONG_CONFIDENCE = 0.85;
const LOCAL_SCAN_CONFIDENCE = 0.6;
const MIN_UNBRANDED_ALIAS_LENGTH = 5;

const HVAC_CONFIG = [
  { brand: 'Goodman', aliases: ['goodman'], type: 'yyMM' },
  { brand: 'Amana', aliases: ['amana'], type: 'yyMM' },
  { brand: 'Carrier', aliases: ['carrier'], type: 'wwYY' },
  { brand: 'Bryant', aliases: ['bryant'], type: 'wwYY' },
  { brand: 'Payne', aliases: ['payne'], type: 'wwYY' },
  { brand: 'Rheem', aliases: ['rheem'], type: 'letterWWYY' },
  { brand: 'Ruud', aliases: ['ruud'], type: 'letterWWYY' },
  { brand: 'Trane', aliases: ['trane'], type: 'wwYY' },
  { brand: 'Lennox', aliases: ['lennox'], type: 'wwYY' },
  { brand: 'York', aliases: ['york'], type: 'wwYY' },
];

const MONTHS = {
  '01': 'January', '02': 'February', '03': 'March', '04': 'April',
  '05': 'May', '06': 'June', '07': 'July', '08': 'August',
  '09': 'September', '10': 'October', '11': 'November', '12': 'December',
};

const HVAC_CATEGORIES = new Set(['air conditioner', 'furnace', 'heat pump', 'hvac system']);

const HEURISTICS = {
  lg: [
    { pattern: /\binverter\s+directdrive\b|\bdirectdrive\b/i, range: '2009-Present', note: 'LG DirectDrive branding is heuristic context associated with 2009 and newer product cycles.' },
  ],
  samsung: [
    { pattern: /\baddwash\b/i, range: 'Post-2016', note: 'Samsung AddWash is heuristic context associated with post-2016 product generations.' },
    { pattern: /\bvrt\b/i, range: 'Post-2006', note: 'Samsung VRT is heuristic context associated with post-2006 product generations.' },
  ],
  whirlpool: [
    { pattern: /\bdirect\s+drive\b/i, range: '1980s-2010', note: 'Whirlpool Direct Drive is heuristic context associated with older washer platforms.' },
    { pattern: /\bvertical\s+modular\b|\bvmw\b/i, range: '2010-Present', note: 'Whirlpool VMW is heuristic context associated with 2010 and newer washer platforms.' },
  ],
  carrier: [
    { pattern: /\bround\s+cabinet\b/i, range: 'Pre-1980', note: 'A round Carrier cabinet is heuristic context associated with pre-1980 equipment.' },
    { pattern: /\bsquare\s+cabinet\b/i, range: '1980-Present', note: 'A square Carrier cabinet is heuristic context associated with 1980 and newer equipment.' },
  ],
  goodman: [
    { pattern: /\bjanitrol\b/i, range: 'Pre-2000', note: 'Janitrol branding is heuristic context associated with older Goodman-era equipment.' },
  ],
  trane: [
    { pattern: /\bxe\d*\b/i, range: '1990-2009', note: 'Trane XE family naming is heuristic context associated with earlier product cycles.' },
    { pattern: /\bxr\d*\b/i, range: '2000-Present', note: 'Trane XR family naming is heuristic context associated with 2000 and newer cycles.' },
  ],
};

function brandKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z]/g, '');
}

function shouldReturnExact(match, term, inferredBrand) {
  if (!match) return false;
  if (match.matchType === 'normalized-exact') return true;
  return Boolean(inferredBrand) || normalizeModelNumber(term).length >= MIN_UNBRANDED_ALIAS_LENGTH;
}

function shouldReturnCandidate(candidate, term, inferredBrand) {
  const normalizedTerm = normalizeModelNumber(term);
  if (!candidate || !normalizedTerm) return false;
  if (candidate.matchType === 'normalized-exact') return true;
  if (candidate.matchType === 'alias-exact') {
    return Boolean(inferredBrand) || normalizedTerm.length >= MIN_UNBRANDED_ALIAS_LENGTH;
  }
  if (candidate.confidence < LOCAL_STRONG_CONFIDENCE) return false;
  if (!inferredBrand && normalizedTerm.length < 6) return false;
  if (candidate.matchType === 'fuzzy' && candidate.metrics.bestDistance > 1) return false;
  if (candidate.matchType === 'prefix' && candidate.metrics.bestPrefix < 6) return false;
  if (candidate.metrics.bestDistance > 2 && !candidate.metrics.sharedTokens) return false;
  return ['contains', 'prefix', 'fuzzy'].includes(candidate.matchType);
}

export async function findLocalModelAgeResult(query, normalizedQuery = String(query || '').toLowerCase()) {
  const localDb = await loadLocalModelAgeDb();
  const records = Array.isArray(localDb.records) ? localDb.records : [];
  const inferredBrand = inferLocalModelAgeBrand(records, query);
  const terms = extractLocalModelAgeLookupTerms(query);
  if (!terms.length) return null;

  for (const term of terms) {
    const exact = findExactLocalModelAgeMatch(records, term, inferredBrand);
    if (!shouldReturnExact(exact, term, inferredBrand)) continue;
    return applyEraHints(formatLocalModelAgeMatch(exact.record, {
      confidence: 1,
      matchType: exact.matchType,
      matchedBy: exact.matchedBy || null,
      verifiedExact: Boolean(exact.verifiedExact),
      // Preserve exactly what the user typed rather than the canonical model.
      enteredModel: exact.verifiedExact ? (exact.enteredModel || term) : null,
    }), normalizedQuery);
  }

  let best = null;
  let bestTerm = '';
  for (const term of terms) {
    const [candidate] = findCloseLocalModelAgeCandidates(records, term, inferredBrand, {
      minConfidence: LOCAL_SCAN_CONFIDENCE,
      limit: 1,
    });
    if (candidate && (!best || candidate.confidence > best.confidence)) {
      best = candidate;
      bestTerm = term;
    }
  }
  if (!shouldReturnCandidate(best, bestTerm, inferredBrand)) return null;
  return applyEraHints(formatLocalModelAgeMatch(best.record, {
    confidence: best.confidence,
    matchType: best.matchType,
  }), normalizedQuery);
}

// Brand-agnostic verified exact-evidence probe, used ONLY to detect a conflict
// between a user-supplied brand and the brand on a verified record.
// findLocalModelAgeResult scopes its search to the inferred brand, so
// "Samsung GFW850SPN0DG" simply misses and falls through to a paid provider
// call with no disclosure that the model is a verified GE product. This lets
// the caller surface that conflict instead of silently researching a
// contradictory identity. It never overwrites the user's brand.
export async function findVerifiedExactEvidenceRecord(query) {
  const localDb = await loadLocalModelAgeDb();
  const records = Array.isArray(localDb.records) ? localDb.records : [];
  for (const term of extractLocalModelAgeLookupTerms(query)) {
    const match = matchExactModelEvidence(records, term);
    if (match.ambiguous) return null;
    if (match.record) {
      return { record: match.record, matchedBy: match.matchedBy, enteredModel: term };
    }
  }
  return null;
}

export function applyEraHints(base, normalizedQuery) {
  const output = { ...(base || {}) };
  const rules = HEURISTICS[brandKey(output.brand)] || [];
  const matched = rules.filter((rule) => rule.pattern.test(String(normalizedQuery || '')));
  if (!matched.length) return output;

  output.notes = [output.notes, ...matched.map((rule) => `Heuristic context: ${rule.note}`)]
    .filter(Boolean)
    .join(' ');
  output.evidence = [
    ...(Array.isArray(output.evidence) ? output.evidence : []),
    ...matched.map((rule) => ({
      detail: rule.note,
      source: 'Heuristic model-family context',
      type: 'heuristic',
      yearRange: rule.range,
    })),
  ];
  output.heuristicRanges = matched.map((rule) => rule.range);
  return output;
}

function resolveCandidateYears(twoDigits, currentYear = new Date().getFullYear()) {
  const value = Number(twoDigits);
  return [1900 + value, 2000 + value]
    .filter((year) => year <= currentYear + 1);
}

function findHvacBrand(query) {
  return HVAC_CONFIG.find((config) => config.aliases.some((alias) => new RegExp(`\\b${alias}\\b`, 'i').test(query))) || null;
}

export function decodeHvacSerial(query, normalizedQuery = String(query || '').toLowerCase(), queryInfo = null, options = {}) {
  const config = findHvacBrand(normalizedQuery);
  if (!config) return null;
  if (queryInfo?.genericCategory && !HVAC_CATEGORIES.has(queryInfo.genericCategory)) return null;
  const serial = String(queryInfo?.serialToken || '');
  if (!serial || queryInfo?.serialSource !== 'labeled') return null;
  const currentYear = options.currentYear || new Date().getFullYear();

  function ambiguousResult(yearDigits, detail, serialRule) {
    const manufactureYearCandidates = resolveCandidateYears(yearDigits, currentYear);
    if (!manufactureYearCandidates.length) return null;
    return applyEraHints({
      brand: config.brand,
      estimatedYear: null,
      estimatedYearType: null,
      individualManufactureYear: null,
      manufactureDateAmbiguous: true,
      manufactureYearCandidates,
      yearContext: {
        type: 'unknown',
        label: 'Ambiguous manufacture year',
        confidence: 'partial',
        source: 'serial',
        isExactUnitDate: false,
      },
      notes: `${detail} The two-digit year repeats by century, so the serial alone does not support one exact manufacture year.`,
      serialRule,
      yearRange: null,
      refinementNeeded: true,
      refinementReason: 'The HVAC serial pattern repeats and does not establish one century without model-era evidence.',
      refinementSuggestion: 'Enter the complete model number or provide nameplate/model-era evidence to resolve the candidate year.',
      recommendedIdentifiers: [
        'Enter the complete model number from the same equipment nameplate.',
        'Provide an installation record or dated model-era document that can distinguish the serial cycle.',
      ],
    }, normalizedQuery);
  }

  if (config.type === 'letterWWYY') {
    const match = serial.match(/[A-Za-z](\d{2})(\d{2})/);
    if (!match) return null;
    const week = Number(match[1]);
    if (week < 1 || week > 53) return null;
    return ambiguousResult(
      match[2],
      `Week ${match[1]} matches the manufacturer WWYY serial pattern.`,
      `${config.brand}: four digits following a letter represent production week and year (WWYY).`
    );
  }

  const match = serial.match(/(?:^|\D)(\d{2})(\d{2})/);
  if (!match) return null;
  if (config.type === 'yyMM') {
    const month = MONTHS[match[2]];
    if (!month) return null;
    return ambiguousResult(
      match[1],
      `${month} matches the manufacturer YYMM serial pattern.`,
      `${config.brand}: first two digits are year and next two digits are month (YYMM).`
    );
  }

  const week = Number(match[1]);
  if (week < 1 || week > 53) return null;
  return ambiguousResult(
    match[2],
    `Week ${match[1]} matches the manufacturer WWYY serial pattern.`,
    `${config.brand}: first two digits are week and next two digits are year (WWYY).`
  );
}
