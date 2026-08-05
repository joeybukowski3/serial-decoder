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

  // Without a start year there is no lower bound and therefore no defensible
  // constraint at all — an end year alone would only ever eliminate NEWER
  // candidates on the weakest possible evidence.
  const range = startYear === null
    ? null
    : {
      start: Math.max(MIN_PLAUSIBLE_YEAR, startYear - NATIVE_RANGE_GRACE_YEARS),
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
  const boundNote = normalized.upperBoundApplied
    ? 'Exact-model research supports both a start and an end of the production window (one year of tolerance applied at each edge).'
    : 'Only a lower bound is used; the research end year was not specific or confident enough to exclude later serial cycles.';

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
