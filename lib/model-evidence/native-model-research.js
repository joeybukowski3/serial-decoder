/**
 * Shared native Gemini + Google Search model research.
 *
 * One provider, one query construction, one set of normalization rules, used
 * by BOTH Smart Lookup (api/age-lookup.js) and Serial Refinement
 * (api/refine-serial-date.js). The two features must research a model the
 * same way; only what they are allowed to CONCLUDE differs.
 *
 * What this module deliberately does NOT do:
 *   * It never touches lookupModelEvidence(). That service assembles
 *     per-source dated facts with model-match classification; a native
 *     research call returns a single aggregate conclusion plus a flat
 *     grounding-chunk list. Feeding one into the other would require
 *     inventing per-source attribution.
 *   * It never fabricates multiple independent ranged evidence records from
 *     the grounding sources. Exactly one ranged 'model-intelligence' record
 *     is produced; the remaining sources become zero-range citations that no
 *     evidence tier in evidence-policy.js can ever score.
 *   * It never surfaces `bestEstimateYear` or `isIndividualUnitDate` to the
 *     refinement caller. The serial decoder owns the unit-year candidates;
 *     model research may only CONSTRAIN them.
 */

import { callGeminiSearchProvider } from '../smart-lookup/gemini-search-provider.js';

/** Matches the Smart Lookup native search model. */
export const NATIVE_MODEL_RESEARCH_MODEL = 'gemini-3.5-flash-lite';

/**
 * Introduction dates reported by research sources routinely disagree with a
 * unit's serial cycle by a year (announcement vs. availability vs. first
 * shipments). One year of grace matches CONTRADICTION_GRACE_YEARS in the
 * deterministic evaluator and the default tolerance in
 * rankCandidatesByModelLowerBound.
 */
export const NATIVE_RANGE_GRACE_YEARS = 1;

const MIN_PLAUSIBLE_YEAR = 1800;
const MAX_CITATION_COUNT = 6;

const STRICT_PRODUCTION_LANGUAGE = [
  /\bmanufactur(?:ed|ing)\b/i,
  /\bproduction\s+(?:began|beginning|from|period|range|since|start(?:ed|ing)?|window)\b/i,
];

/**
 * A research "end year" is only a defensible production boundary when the
 * provider actually identified the exact model and was confident about it.
 * At model-line / family / category precision the end year is usually just
 * the newest page the search happened to surface, which would wrongly
 * exclude legitimately later serial cycles.
 */
const UPPER_BOUND_PRECISIONS = new Set(['exact_model', 'individual_unit']);
const UPPER_BOUND_CONFIDENCES = new Set(['high', 'medium']);

export function isNativeModelResearchEnabled(env = process.env) {
  return ['1', 'true', 'yes', 'on'].includes(
    String(env?.SMART_LOOKUP_NATIVE_GEMINI_SEARCH_ENABLED || 'false').trim().toLowerCase(),
  );
}

function integerYear(value) {
  return Number.isInteger(value) && value >= MIN_PLAUSIBLE_YEAR ? value : null;
}

function sourceMatchesManufacturer(source, brand) {
  const brandKey = String(brand || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!brandKey) return false;

  const title = String(source?.title || '').toLowerCase();
  const escapedBrand = brandKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const titleNamesBrand = new RegExp(`(^|[^a-z0-9])${escapedBrand}([^a-z0-9]|$)`, 'i').test(title)
    || (brandKey.length > 3 && title.replace(/[^a-z0-9]/g, '').includes(brandKey));
  if (titleNamesBrand && /\b(?:appliances|manufacturer|official|support)\b/i.test(title)) return true;

  try {
    const labels = new URL(source.url).hostname.toLowerCase().split('.');
    return brandKey.length <= 3
      ? labels.some((label) => label === brandKey || label.startsWith(`${brandKey}appliance`))
      : labels.some((label) => label.includes(brandKey));
  } catch (_) {
    return false;
  }
}

function hasStrictManufacturerProductionStart(raw, sources) {
  const timingDescription = `${raw?.estimateBasis || ''} ${raw?.summary || ''}`;
  return STRICT_PRODUCTION_LANGUAGE.some((pattern) => pattern.test(timingDescription))
    && sources.some((source) => sourceMatchesManufacturer(source, raw?.brand));
}

/**
 * Shared query construction. Mirrors the identity fields Smart Lookup sends,
 * so the same product resolves to the same research query from either entry
 * point. Placeholder categories are dropped rather than searched for.
 */
export function buildNativeModelResearchQuery(request = {}) {
  return [request.brand, request.model, request.category]
    .map((value) => String(value || '').trim())
    .filter((value) => value && value.toLowerCase() !== 'unknown')
    .join(' ');
}

/**
 * Converts a raw native provider result into refinement-safe semantics.
 *
 * @returns {{
 *   usable: boolean, range: {start:number, end:number|null}|null,
 *   upperBoundApplied: boolean, precision: string|null, confidence: string|null,
 *   lowerBoundSemantics: 'strict-production'|'approximate-timing',
 *   refinementConfidence: 'medium'|'low', sources: Array, summary: string,
 *   estimateBasis: string, product: string|null, model: string|null
 * }}
 */
export function normalizeNativeModelResearch(raw) {
  const startYear = integerYear(raw?.estimatedRange?.startYear);
  const endYear = integerYear(raw?.estimatedRange?.endYear);
  const precision = typeof raw?.precision === 'string' ? raw.precision : null;
  const confidence = typeof raw?.confidence === 'string' ? raw.confidence : null;
  const sources = (Array.isArray(raw?.sources) ? raw.sources : [])
    .filter((source) => typeof source?.url === 'string' && /^https?:\/\//i.test(source.url))
    .slice(0, MAX_CITATION_COUNT);

  const upperBoundEligible = UPPER_BOUND_PRECISIONS.has(precision)
    && UPPER_BOUND_CONFIDENCES.has(confidence)
    && startYear !== null
    && endYear !== null
    && endYear >= startYear;
  const strictProductionStart = startYear !== null
    && hasStrictManufacturerProductionStart(raw, sources);

  // Without a start year there is no lower bound and therefore no defensible
  // constraint at all — an end year alone would only ever eliminate NEWER
  // candidates on the weakest possible evidence.
  const range = startYear === null
    ? null
    : {
      start: strictProductionStart
        ? startYear
        : Math.max(MIN_PLAUSIBLE_YEAR, startYear - NATIVE_RANGE_GRACE_YEARS),
      end: upperBoundEligible ? endYear + NATIVE_RANGE_GRACE_YEARS : null,
    };

  // Model-timing confidence is NOT unit-year confidence. It is downgraded one
  // step on the way in, and can never reach 'high' from research alone.
  const refinementConfidence = UPPER_BOUND_PRECISIONS.has(precision)
    && confidence === 'high'
    && sources.length >= 2
    ? 'medium'
    : 'low';

  return {
    usable: Boolean(range),
    range,
    upperBoundApplied: Boolean(range && range.end !== null),
    lowerBoundSemantics: strictProductionStart ? 'strict-production' : 'approximate-timing',
    precision,
    confidence,
    refinementConfidence,
    sources,
    summary: String(raw?.summary || ''),
    estimateBasis: String(raw?.estimateBasis || ''),
    product: typeof raw?.product === 'string' ? raw.product : null,
    model: typeof raw?.model === 'string' ? raw.model : null,
    // bestEstimateYear and isIndividualUnitDate are intentionally dropped.
  };
}

function rangeLabel(range) {
  if (!range) return 'an undetermined period';
  return range.end == null ? `${range.start} or later` : `${range.start}-${range.end}`;
}

/**
 * Builds the refinement evidence list for one research conclusion:
 * exactly ONE ranged 'model-intelligence' record, plus zero-range citation
 * records for the remaining grounding sources. Citation records carry no
 * years, so evaluateEvidencePolicy() can never treat them as independent
 * ranged corroboration.
 */
export function nativeModelResearchEvidence(normalized, request = {}) {
  if (!normalized?.usable) return [];
  const { range, sources } = normalized;
  const label = [request.brand, request.model].map((value) => String(value || '').trim())
    .filter(Boolean).join(' ') || normalized.product || 'This model';
  const lowerBoundNote = normalized.lowerBoundSemantics === 'strict-production'
    ? 'The first-party manufacturing start is preserved as a strict lower bound.'
    : 'One year of introduction-date tolerance is applied to the lower bound.';
  const boundNote = normalized.upperBoundApplied
    ? `Exact-model research supports both a start and an end of the production window. ${lowerBoundNote} One year of tolerance is applied to the upper bound.`
    : `Only a lower bound is used; the research end year was not specific or confident enough to exclude later serial cycles. ${lowerBoundNote}`;

  const primary = {
    type: 'native-model-research',
    title: `${label} model timing research`,
    sourceName: 'Gemini + Google Search model research',
    sourceUrl: sources[0]?.url || null,
    publishedDate: null,
    availabilityStart: range.start,
    availabilityEnd: range.end,
    productionStart: range.start,
    productionEnd: range.end,
    yearRange: rangeLabel(range),
    supports: `Native model research places ${label} in ${rangeLabel(range)}. ${boundNote} ${normalized.estimateBasis || normalized.summary || ''}`.trim(),
    quality: 'model-intelligence',
    verified: false,
  };

  const citations = sources.slice(1).map((source) => ({
    type: 'native-model-research-citation',
    title: source.title || source.url,
    sourceName: source.title || source.url,
    sourceUrl: source.url,
    publishedDate: null,
    availabilityStart: null,
    availabilityEnd: null,
    productionStart: null,
    productionEnd: null,
    supports: 'Grounding source cited by the model research conclusion above.',
    quality: 'citation',
    verified: false,
  }));

  return [primary, ...citations];
}

/**
 * Runs one native Gemini + Google Search research call for a model identity.
 * Returns null when there is nothing meaningful to research. Provider errors
 * propagate so the caller can fall back to its previous research path.
 */
export async function researchModelTiming(request = {}, options = {}) {
  const query = buildNativeModelResearchQuery(request);
  if (!query) return null;

  const raw = await (options.providerLookup || callGeminiSearchProvider)(query, {
    apiKey: options.apiKey,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    model: options.model || NATIVE_MODEL_RESEARCH_MODEL,
  });

  const normalized = normalizeNativeModelResearch(raw);
  return {
    ...normalized,
    query,
    evidence: nativeModelResearchEvidence(normalized, request),
  };
}
