/**
 * Prices and valuation for ItemAssist Research (research.2). Pure functions: no network, no clock (the reference date is data), no store.
 *
 * Five kinds of price are kept apart and never blended:
 *   MSRP                an original list price reported by a source        (context and tier, never today's cost)
 *   HISTORICAL_RETAIL   a dated past retail price (including a "current" one that has gone stale)
 *   CURRENT_RETAIL_NEW  a recent new-condition price from a first-party seller, with an observation date
 *   SECONDARY_REPORT    a used, refurbished or marketplace report          (context only)
 *   AI_ESTIMATE         a model estimate with no source                    (never shown as verified)
 *
 * A source-backed price needs real, allow-listed evidence; a price whose evidence is missing, fabricated, about another product, or whose
 * date is missing is refused. Verification can only be downgraded, never upgraded. The valuation then follows fixed rules (see
 * buildValuation): only current prices of candidates that meet every ESSENTIAL requirement can set the range, MSRP only ever supplies
 * context, and a candidate with an essential shortfall is excluded however attractive its price.
 */

import { MODEL_PATTERN, SOURCE_CLASS, daysBetween, looksLikeExactModel, MODEL_RELATION, normalizeDate } from './evidence.js';
import { essentialIds } from './requirements.js';

export const PRICE_KIND = Object.freeze({ MSRP: 'MSRP', HISTORICAL_RETAIL: 'HISTORICAL_RETAIL', CURRENT_RETAIL_NEW: 'CURRENT_RETAIL_NEW', SECONDARY_REPORT: 'SECONDARY_REPORT', AI_ESTIMATE: 'AI_ESTIMATE' });
export const VERIFICATION = Object.freeze({ VERIFIED_PAGE: 'VERIFIED_PAGE', SEARCH_LISTING: 'SEARCH_LISTING', SEARCH_SNIPPET: 'SEARCH_SNIPPET', NONE: 'NONE' });
export const DATE_BASIS = Object.freeze({ OBSERVED: 'OBSERVED', PUBLISHED: 'PUBLISHED', UNKNOWN: 'UNKNOWN' });
export const CANDIDATE_KEYS = Object.freeze(['SUCCESSOR', 'ALT_1', 'ALT_2']);
// VERIFIED_LISTING: a page-confirmed price or specification from a first-party source about the exact model. LISTED_PROVISIONAL: the exact model
// appears in a first-party search listing only. FAMILY_LEVEL: named as a product family, no exact model claimed. UNVERIFIED_MODEL: named by an
// exact-looking model code with nothing behind it (a plausible code is not proof the model exists).
export const MODEL_STATUS = Object.freeze({ VERIFIED_LISTING: 'VERIFIED_LISTING', LISTED_PROVISIONAL: 'LISTED_PROVISIONAL', FAMILY_LEVEL: 'FAMILY_LEVEL', UNVERIFIED_MODEL: 'UNVERIFIED_MODEL' });
export const TIER_LEVEL = Object.freeze(['VALUE', 'STANDARD', 'PREMIUM', 'UPPER_PREMIUM', 'LUXURY', 'UNKNOWN']);
export const TIER_BASIS = Object.freeze(['MSRP_EVIDENCE', 'AI_ESTIMATE', 'UNKNOWN']);
export const COMPARISON_STATUS = Object.freeze(['MEETS', 'EXCEEDS', 'SHORTFALL', 'UNKNOWN']);
export const VALUATION_METHOD = Object.freeze({
  VERIFIED_MULTI: 'VERIFIED_MULTI', VERIFIED_SINGLE: 'VERIFIED_SINGLE', MIXED_VERIFIED_AND_LISTINGS: 'MIXED_VERIFIED_AND_LISTINGS', PROVISIONAL_LISTINGS: 'PROVISIONAL_LISTINGS',
  HISTORICAL_TIER_ESTIMATE: 'HISTORICAL_TIER_ESTIMATE', AI_ESTIMATE_ONLY: 'AI_ESTIMATE_ONLY', INSUFFICIENT: 'INSUFFICIENT',
});
export const VALUATION_BASIS = Object.freeze({
  VERIFIED_CURRENT_RETAIL: 'VERIFIED_CURRENT_RETAIL', MIXED_CURRENT_RETAIL: 'MIXED_CURRENT_RETAIL', PROVISIONAL_LISTINGS: 'PROVISIONAL_LISTINGS',
  TIER_ESTIMATE: 'TIER_ESTIMATE', AI_ESTIMATE: 'AI_ESTIMATE', NONE: 'NONE',
});
export const CONFIDENCES = Object.freeze(['HIGH', 'MEDIUM', 'LOW']);

/** A "current" price older than this is a dated price, never a current one. */
export const CURRENT_PRICE_MAX_AGE_DAYS = 14;
export const MAX_PRICES = 12;
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 999_999;
const MAX_ESTIMATE_SPREAD = 8;
const ID_PATTERN = /^p[1-9]\d?$/;

const { MANUFACTURER, RETAILER, REVIEW, TECH_DATABASE, MARKETPLACE } = SOURCE_CLASS;
const KIND_SOURCES = Object.freeze({
  [PRICE_KIND.MSRP]: [MANUFACTURER, RETAILER, REVIEW, TECH_DATABASE],
  [PRICE_KIND.HISTORICAL_RETAIL]: [MANUFACTURER, RETAILER, REVIEW, TECH_DATABASE],
  [PRICE_KIND.CURRENT_RETAIL_NEW]: [MANUFACTURER, RETAILER],
  [PRICE_KIND.SECONDARY_REPORT]: [MARKETPLACE, REVIEW, TECH_DATABASE, RETAILER],
});
const KIND_VERIFICATIONS = Object.freeze({
  [PRICE_KIND.MSRP]: [VERIFICATION.VERIFIED_PAGE, VERIFICATION.SEARCH_SNIPPET],
  [PRICE_KIND.HISTORICAL_RETAIL]: [VERIFICATION.VERIFIED_PAGE, VERIFICATION.SEARCH_LISTING, VERIFICATION.SEARCH_SNIPPET],
  [PRICE_KIND.CURRENT_RETAIL_NEW]: [VERIFICATION.VERIFIED_PAGE, VERIFICATION.SEARCH_LISTING],
  [PRICE_KIND.SECONDARY_REPORT]: [VERIFICATION.VERIFIED_PAGE, VERIFICATION.SEARCH_LISTING, VERIFICATION.SEARCH_SNIPPET],
});

const round2 = (value) => Math.round(value * 100) / 100;
const roundTo = (value, step) => Math.max(1, Math.round(value / step) * step);
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const own = (object, key) => typeof key === 'string' && Object.hasOwn(object, key);

/**
 * @param {unknown} raw  raw price claims
 * @param {{evidence: object[], candidates: Record<string, {name: string}>, referenceDate: string, trustPageVerification?: boolean}} context
 *   normalised evidence and the candidates present. A page-level confirmation (VERIFIED_PAGE) is a claim about a page fetch that only code
 *   can establish. No stage fetches pages yet, so it stands only when the caller sets `trustPageVerification` (the demo fixtures do, as
 *   illustrative data); otherwise it is downgraded like any other unproven verification. Retrieval code must be the only thing that ever sets it.
 * @returns {{items: object[], notes: {scope: string, reason: string, action: string}[]}}
 */
export function normalizePrices(raw, { evidence, candidates, referenceDate, trustPageVerification = false }) {
  const items = [], notes = [], seen = new Set();
  const byId = new Map(evidence.map((entry) => [entry.id, entry]));
  const note = (reason, action) => notes.push({ scope: 'PRICE', reason, action });
  const refuse = (reason) => note(reason, 'REJECTED');

  for (const entry of (Array.isArray(raw) ? raw : []).slice(0, MAX_PRICES * 2)) {
    if (!isRecord(entry) || !ID_PATTERN.test(String(entry.id)) || seen.has(entry.id) || !own(PRICE_KIND, entry.kind)) { refuse('SHAPE_INVALID'); continue; }
    if (!['ORIGINAL', 'REPLACEMENT'].includes(entry.subject)) { refuse('SUBJECT_INVALID'); continue; }
    const estimate = entry.kind === PRICE_KIND.AI_ESTIMATE;
    const candidate = entry.candidate ?? null;
    // A replacement price belongs to a candidate that is present; only an estimate may describe the whole class of replacement (no candidate).
    if (entry.subject === 'ORIGINAL' ? candidate !== null : (candidate === null ? !estimate : !own(candidates, candidate))) { refuse('SUBJECT_INVALID'); continue; }

    const amount = isRecord(entry.amount) ? entry.amount : {};
    const low = Number(amount.low), high = Number(amount.high);
    if (amount.currency !== 'USD') { refuse('CURRENCY_UNSUPPORTED'); continue; }
    if (![low, high].every((value) => Number.isFinite(value) && value >= MIN_AMOUNT && value <= MAX_AMOUNT) || low > high
      || (!estimate && low !== high) || (estimate && high / low > MAX_ESTIMATE_SPREAD)) { refuse('AMOUNT_INVALID'); continue; }

    let kind = entry.kind, verification = own(VERIFICATION, entry.verification) ? entry.verification : null;
    let asOf = entry.asOf ?? null;
    const basis = entry.asOfBasis ?? DATE_BASIS.UNKNOWN;
    const evidenceId = entry.evidenceId ?? null;
    if (asOf !== null) asOf = normalizeDate(asOf);
    if ((entry.asOf ?? null) !== null && !asOf) { refuse('DATE_INVALID'); continue; }
    if (!own(DATE_BASIS, basis) || (asOf === null && basis !== DATE_BASIS.UNKNOWN) || (asOf !== null && basis === DATE_BASIS.UNKNOWN)) { refuse('DATE_INVALID'); continue; }
    if (asOf && daysBetween(referenceDate, asOf) > 1) { refuse('DATE_IN_FUTURE'); continue; }

    if (estimate) {
      if (evidenceId !== null) { refuse('ESTIMATE_CITES_SOURCE'); continue; }
      if ((verification !== null && verification !== VERIFICATION.NONE) || asOf !== null) { refuse('SHAPE_INVALID'); continue; }
      verification = VERIFICATION.NONE;
    } else {
      const source = byId.get(evidenceId);
      if (typeof evidenceId !== 'string' || !source) { refuse(typeof evidenceId === 'string' ? 'SOURCE_FABRICATED' : 'SHAPE_INVALID'); continue; }
      if (!verification || verification === VERIFICATION.NONE) { refuse('SHAPE_INVALID'); continue; }
      if (!KIND_SOURCES[kind].includes(source.sourceClass)) { refuse('KIND_SOURCE_MISMATCH'); continue; }
      const expectedSubject = entry.subject === 'ORIGINAL' ? 'ORIGINAL' : candidate;
      if (source.modelRelation === MODEL_RELATION.DIFFERENT || source.subject !== expectedSubject) { refuse('WRONG_PRODUCT'); continue; }
      // A plausible model code is not proof the model exists: a price on a candidate named by an exact code needs evidence about that exact model.
      const exactName = entry.subject === 'REPLACEMENT' && looksLikeExactModel(candidates[candidate].name);
      if (exactName && ![MODEL_RELATION.EXACT, MODEL_RELATION.VARIANT].includes(source.modelRelation)) { refuse('MODEL_UNVERIFIED'); continue; }

      if (kind === PRICE_KIND.CURRENT_RETAIL_NEW) {
        if (asOf === null || basis !== DATE_BASIS.OBSERVED) { refuse('DATE_REQUIRED'); continue; }
        if (daysBetween(asOf, referenceDate) > CURRENT_PRICE_MAX_AGE_DAYS) { kind = PRICE_KIND.HISTORICAL_RETAIL; note('STALE_CURRENT_PRICE', 'DOWNGRADED'); }
      }
      // Verification can only go down. A page-level confirmation needs a non-marketplace source about the exact model.
      const exactSource = [MODEL_RELATION.EXACT, MODEL_RELATION.VARIANT].includes(source.modelRelation) && source.sourceClass !== MARKETPLACE;
      const fallback = [PRICE_KIND.CURRENT_RETAIL_NEW, PRICE_KIND.SECONDARY_REPORT].includes(kind) ? VERIFICATION.SEARCH_LISTING : VERIFICATION.SEARCH_SNIPPET;
      if (verification === VERIFICATION.VERIFIED_PAGE && (!exactSource || !trustPageVerification)) { verification = fallback; note('VERIFICATION_DOWNGRADED', 'DOWNGRADED'); }
      if (!KIND_VERIFICATIONS[kind].includes(verification)) { verification = fallback; note('VERIFICATION_DOWNGRADED', 'DOWNGRADED'); }
    }
    const model = typeof entry.model === 'string' && MODEL_PATTERN.test(entry.model.trim()) ? entry.model.trim() : null;
    seen.add(entry.id);
    items.push({
      id: entry.id, kind, subject: entry.subject, candidate, model, amount: { currency: 'USD', low: round2(low), high: round2(high) },
      asOf, asOfBasis: basis, verification, evidenceId,
    });
    if (items.length >= MAX_PRICES) break;
  }
  return { items, notes };
}

/** The market tier. MSRP_EVIDENCE as a basis needs an accepted, source-backed original price; otherwise it is an AI estimate at best. */
export function normalizeTier(raw, prices) {
  const notes = [];
  const level = isRecord(raw) && TIER_LEVEL.includes(raw.level) ? raw.level : 'UNKNOWN';
  let basis = isRecord(raw) && TIER_BASIS.includes(raw.basis) ? raw.basis : 'UNKNOWN';
  if (level === 'UNKNOWN') return { tier: { level: 'UNKNOWN', basis: 'UNKNOWN' }, notes };
  const backed = prices.some((item) => item.subject === 'ORIGINAL' && [PRICE_KIND.MSRP, PRICE_KIND.HISTORICAL_RETAIL].includes(item.kind));
  if (basis === 'MSRP_EVIDENCE' && !backed) { basis = 'AI_ESTIMATE'; notes.push({ scope: 'TIER', reason: 'TIER_BASIS_DOWNGRADED', action: 'DOWNGRADED' }); }
  if (basis === 'UNKNOWN') basis = 'AI_ESTIMATE';
  return { tier: { level, basis }, notes };
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Valuation

// Broad ratios of a current comparable's price to the original's reported price, by kind of item. They are a documented placeholder for
// when no current price exists, deliberately wide, and are replaced by evidence the moment evidence exists. `older` applies when the
// original price is three or more years old or undated.
export const HISTORICAL_BANDS = Object.freeze({
  tv: Object.freeze({ recent: [0.55, 1.0], older: [0.4, 0.9] }),
  appliance: Object.freeze({ recent: [0.75, 1.1], older: [0.65, 1.05] }),
  electronics: Object.freeze({ recent: [0.5, 1.0], older: [0.3, 0.8] }),
  other: Object.freeze({ recent: [0.5, 1.1], older: [0.4, 1.0] }),
});
export const bandGroup = (profile) => (profile === 'tv' ? 'tv' : profile === 'electronics' ? 'electronics' : ['other', 'unknown'].includes(profile) ? 'other' : 'appliance');
const UNKNOWN_TIER_WIDENING = 0.1;
const OLDER_AFTER_YEARS = 3;
const BELOW_ORIGINAL_RATIO = 0.75;

/** The parameters each valuation note may carry. Notes are codes plus numbers; the page supplies the wording. */
export const NOTE_PARAMS = Object.freeze({
  BASED_ON_VERIFIED: ['count'], BASED_ON_LISTINGS: ['count'], ONE_COMPARABLE: [], LISTINGS_NOT_CONFIRMED: [], TIER_ESTIMATE_BAND: ['low', 'high'],
  AI_ESTIMATE_ONLY: [], INSUFFICIENT: [], MSRP_CONTEXT_ONLY: [], CURRENT_BELOW_ORIGINAL: ['ratio'], ORIGINAL_DATE_UNKNOWN: [], TIER_UNKNOWN_WIDENED: [],
  EXCLUDED_CONFIRMED_SHORTFALL: ['candidate'], EXCLUDED_SUSPECTED_SHORTFALL: ['candidate'], EXCLUDED_NO_CURRENT_PRICE: ['candidate'],
  STALE_PRICES_NOT_CURRENT: ['count'], NOT_AN_APPRAISAL: [],
});

const ratioOf = (low, high) => (low > 0 ? high / low : Infinity);
const byPriceId = (a, b) => a.id.localeCompare(b.id, undefined, { numeric: true });
// Sorted by id so the result never depends on the order the prices arrived in.
const pick = (prices, kind) => prices.filter((item) => item.kind === kind).sort(byPriceId);
const EVIDENCE_ORDER = [VERIFICATION.VERIFIED_PAGE, VERIFICATION.SEARCH_SNIPPET, VERIFICATION.SEARCH_LISTING];
const best = (list) => [...list].sort((a, b) => EVIDENCE_ORDER.indexOf(a.verification) - EVIDENCE_ORDER.indexOf(b.verification) || a.id.localeCompare(b.id))[0] || null;

/** Candidates that must not set the range, with the reason. A confirmed shortfall outranks a suspected one. */
export function exclusionsFor(candidates, requirements) {
  const essential = new Set(essentialIds(requirements));
  const result = {};
  for (const candidate of candidates) {
    const shortfalls = (candidate.comparison || []).filter((row) => essential.has(row.requirementId) && row.status === 'SHORTFALL');
    if (shortfalls.some((row) => row.basis === 'CONFIRMED')) result[candidate.key] = 'CONFIRMED_ESSENTIAL_SHORTFALL';
    else if (shortfalls.length) result[candidate.key] = 'SUSPECTED_ESSENTIAL_SHORTFALL';
  }
  return result;
}

/**
 * The replacement value, by fixed rules. Candidates meeting every ESSENTIAL requirement are the only ones that can set the range; the
 * original's MSRP never does (it is context, or, with no current price at all, the anchor of a clearly labelled band).
 *   1. >= 1 verified current price    -> VERIFIED_MULTI / VERIFIED_SINGLE  (mixed with listings -> MIXED_VERIFIED_AND_LISTINGS)
 *   2. only provisional listings      -> PROVISIONAL_LISTINGS
 *   3. a sourced original price       -> HISTORICAL_TIER_ESTIMATE (broad category band; never verified)
 *   4. AI estimates                   -> AI_ESTIMATE_ONLY
 *   5. nothing                        -> INSUFFICIENT (no range, no invention)
 * One verified comparable is enough; three are never required.
 */
export function buildValuation({ prices, requirements, candidates, tier, profile, referenceDate }) {
  const excluded = [], notes = [];
  const reasons = exclusionsFor(candidates, requirements);
  const qualifies = (key) => !own(reasons, key);
  const replacement = prices.filter((item) => item.subject === 'REPLACEMENT');
  const usable = pick(replacement, PRICE_KIND.CURRENT_RETAIL_NEW).filter((item) => item.candidate !== null && qualifies(item.candidate));
  const verified = usable.filter((item) => item.verification === VERIFICATION.VERIFIED_PAGE);
  const listings = usable.filter((item) => item.verification === VERIFICATION.SEARCH_LISTING);
  const estimates = pick(replacement, PRICE_KIND.AI_ESTIMATE).filter((item) => item.candidate === null || qualifies(item.candidate));
  // Context for the original: its MSRP if one is sourced, otherwise a sourced past retail price. Never an AI estimate.
  const originals = prices.filter((item) => item.subject === 'ORIGINAL');
  const referencePrice = best(pick(originals, PRICE_KIND.MSRP)) || best(pick(originals, PRICE_KIND.HISTORICAL_RETAIL)) || null;

  for (const candidate of candidates) {
    if (!qualifies(candidate.key)) {
      excluded.push({ candidate: candidate.key, reason: reasons[candidate.key] });
      notes.push({ code: reasons[candidate.key] === 'CONFIRMED_ESSENTIAL_SHORTFALL' ? 'EXCLUDED_CONFIRMED_SHORTFALL' : 'EXCLUDED_SUSPECTED_SHORTFALL', candidate: candidate.key });
    } else if (!usable.some((item) => item.candidate === candidate.key)) {
      excluded.push({ candidate: candidate.key, reason: 'NO_CURRENT_PRICE' });
      if (usable.length) notes.push({ code: 'EXCLUDED_NO_CURRENT_PRICE', candidate: candidate.key });
    }
  }
  const staleCount = pick(replacement, PRICE_KIND.HISTORICAL_RETAIL).length;
  if (staleCount) notes.push({ code: 'STALE_PRICES_NOT_CURRENT', count: staleCount });

  let method, basis, selected = [], range = null, confidence = 'LOW';
  if (usable.length) {
    selected = [...verified, ...listings];
    const low = Math.min(...selected.map((item) => item.amount.low)), high = Math.max(...selected.map((item) => item.amount.high));
    range = { currency: 'USD', low, high };
    const spread = ratioOf(low, high);
    if (verified.length && listings.length) {
      method = VALUATION_METHOD.MIXED_VERIFIED_AND_LISTINGS; basis = VALUATION_BASIS.MIXED_CURRENT_RETAIL; confidence = spread <= 2 ? 'MEDIUM' : 'LOW';
      notes.unshift({ code: 'BASED_ON_VERIFIED', count: verified.length }, { code: 'BASED_ON_LISTINGS', count: listings.length }, { code: 'LISTINGS_NOT_CONFIRMED' });
    } else if (verified.length) {
      method = verified.length > 1 ? VALUATION_METHOD.VERIFIED_MULTI : VALUATION_METHOD.VERIFIED_SINGLE; basis = VALUATION_BASIS.VERIFIED_CURRENT_RETAIL;
      confidence = verified.length > 1 ? (spread <= 1.35 ? 'HIGH' : spread <= 2 ? 'MEDIUM' : 'LOW') : 'MEDIUM';
      notes.unshift(...(verified.length === 1 ? [{ code: 'BASED_ON_VERIFIED', count: 1 }, { code: 'ONE_COMPARABLE' }] : [{ code: 'BASED_ON_VERIFIED', count: verified.length }]));
    } else {
      method = VALUATION_METHOD.PROVISIONAL_LISTINGS; basis = VALUATION_BASIS.PROVISIONAL_LISTINGS; confidence = listings.length > 1 && spread <= 1.5 ? 'MEDIUM' : 'LOW';
      notes.unshift({ code: 'BASED_ON_LISTINGS', count: listings.length }, { code: 'LISTINGS_NOT_CONFIRMED' });
    }
    if (referencePrice) {
      notes.push({ code: 'MSRP_CONTEXT_ONLY' });
      const ratio = round2(range.high / referencePrice.amount.low);
      if (ratio < BELOW_ORIGINAL_RATIO) notes.push({ code: 'CURRENT_BELOW_ORIGINAL', ratio });
    }
  } else if (referencePrice) {
    method = VALUATION_METHOD.HISTORICAL_TIER_ESTIMATE; basis = VALUATION_BASIS.TIER_ESTIMATE;
    const years = referencePrice.asOf ? daysBetween(referencePrice.asOf, referenceDate) / 365 : null;
    const older = years === null || years >= OLDER_AFTER_YEARS;
    const group = HISTORICAL_BANDS[bandGroup(profile)];
    let [lowRatio, highRatio] = older ? group.older : group.recent;
    if (tier.level === 'UNKNOWN') { lowRatio = Math.max(0.2, round2(lowRatio - UNKNOWN_TIER_WIDENING)); notes.push({ code: 'TIER_UNKNOWN_WIDENED' }); }
    const anchor = referencePrice.amount.low;
    range = { currency: 'USD', low: roundTo(anchor * lowRatio, 10), high: roundTo(anchor * highRatio, 10) };
    notes.unshift({ code: 'TIER_ESTIMATE_BAND', low: lowRatio, high: highRatio });
    if (referencePrice.asOf === null) notes.push({ code: 'ORIGINAL_DATE_UNKNOWN' });
  } else if (estimates.length) {
    method = VALUATION_METHOD.AI_ESTIMATE_ONLY; basis = VALUATION_BASIS.AI_ESTIMATE;
    range = { currency: 'USD', low: Math.min(...estimates.map((item) => item.amount.low)), high: Math.max(...estimates.map((item) => item.amount.high)) };
    selected = estimates;
    notes.unshift({ code: 'AI_ESTIMATE_ONLY' });
  } else {
    method = VALUATION_METHOD.INSUFFICIENT; basis = VALUATION_BASIS.NONE;
    notes.unshift({ code: 'INSUFFICIENT' });
  }
  notes.push({ code: 'NOT_AN_APPRAISAL' });

  const currentSelected = selected.filter((item) => item.kind === PRICE_KIND.CURRENT_RETAIL_NEW);
  return {
    method, basis, verified: method === VALUATION_METHOD.VERIFIED_MULTI || method === VALUATION_METHOD.VERIFIED_SINGLE, range, confidence,
    asOf: currentSelected.length ? currentSelected.map((item) => item.asOf).sort().at(-1) : null,
    comparables: selected.map((item) => ({ priceId: item.id, candidate: item.candidate, verification: item.verification })),
    excluded, reference: referencePrice ? { priceId: referencePrice.id, kind: referencePrice.kind } : null, notes,
  };
}
