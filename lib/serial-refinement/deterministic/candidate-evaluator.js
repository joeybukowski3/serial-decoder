/**
 * Fully deterministic candidate-year scoring. This is the ONLY place a
 * manufacture-year decision is made in the production architecture — Gemini never
 * sees candidateYears and never proposes, ranks, or eliminates one. Given
 * identical evidenceFacts and candidateYears, this function always returns
 * an identical result regardless of the ORDER candidateYears are passed in
 * (candidateScores are sorted by year value on output; tie-breaks are by
 * year value, never by array position).
 *
 * ============================= SCORING POLICY =============================
 * Two independently-computed score components are combined per candidate:
 *
 * (1) EXPLICIT EVIDENCE — every fact
 *     with a deterministic modelMatchType='exact', a non-marketplace domain, and a resolvable
 *     effective year is classified by dateMeaning into:
 *       LOWER_BOUND  (product_launch, production_start)
 *                    — model didn't exist before this date. Candidates
 *                    at/after get a tiered proximity bonus; before it, penalized.
 *       POINT        (owner_purchase, ownership_age) — proximity bonus in
 *                    EITHER direction, no directional penalty.
 *       UPPER_BOUND  (production_end, discontinuation) — production explicitly ended
 *                    by this date. Later candidates are penalized.
 *       EXISTENCE    (availability/publication/listing/manual/review/
 *                    troubleshooting dates) — proves the model existed by
 *                    the date but applies no directional candidate score.
 *       NONE         (page_updated, unknown) — contributes nothing.
 *
 * (2) ERA_ANCHOR CLUSTERING (new) — a broader, weaker signal for cases with
 *     no single strong explicit fact but multiple dated exact-model sources
 *     that, together, place the model in a period. It requires at least two
 *     independent domains and at least one lifecycle fact. Eligible sources are the
 *     SAME dated/exact-model-matched pool as (1) (so page-update dates,
 *     undated content, partial matches, and marketplace domains are already
 *     excluded), additionally restricted to sourceType values the product
 *     spec lists as legitimate era evidence (ERA_ANCHOR_ELIGIBLE_SOURCE_TYPES
 *     — excludes 'other' and 'local-database'). After per-domain
 *     deduplication, the MEDIAN of their effective years is the "era
 *     center" (median, not mean, so a single outlier source can't drag the
 *     center — this is the "source-quality weighting" trade-off: instead of
 *     hand-tuning per-type weights into the center calculation, robustness
 *     comes from the median itself, and source type is used only as an
 *     eligibility gate, not a weight). Every candidate is scored by its
 *     distance from that center: 0-2yrs +4, 3-5yrs +2, 6-8yrs +1, >8yrs -2.
 *
 * Per-domain deduplication (separately for explicit roles and for the
 * era-anchor pool) prevents mirrored/duplicate listings from inflating a
 * score. Local model-database agreement adds a flat bonus. A "2+ independent
 * sources" bonus applies when 2+ distinct evidence items positively support
 * the same candidate (across either component).
 *
 * RESOLUTION has two paths, in priority order:
 *   EXPLICIT path — the explicit-evidence score ALONE already clears the
 *     resolve threshold (top>=1, margin>=2, no tie) for the same candidate
 *     the combined score picks. Confidence can reach "high".
 *   ERA_CLUSTER path — only reached when the explicit path doesn't resolve
 *     it, and requires ALL of: a qualifying corroborated era cluster exists,
 *     candidates are >= ERA_CLUSTER_MIN_SPACING_YEARS apart from the winner,
 *     the combined score clears the resolve threshold, and explicit
 *     evidence does not itself contradict the winning candidate (a
 *     negative explicit score for that candidate blocks this path — rule 6
 *     of the product spec). Confidence is capped "moderate" — era
 *     clustering documents the model was seen in a period, not proof of an
 *     exact manufacture year.
 * Otherwise the result narrows to every candidate within NARROW_TOLERANCE of
 * the top combined score (excluding net-penalized candidates), falls back to
 * a single-candidate elimination result (confidence capped "moderate") when
 * narrowing collapses to exactly one, or remains fully unchanged when
 * nothing separates the candidates.
 *
 * CONFIDENCE is additionally capped "low" whenever the winning candidate
 * sits closer than TIGHT_SPACING_YEARS to another candidate, regardless of
 * score or path — "the same evidence may not distinguish 2022 from 2024."
 * ===========================================================================
 */

export const WEIGHTS = {
  ANCHOR_EXACT: 4,
  ANCHOR_ERA: 2,
  OWNERSHIP_AGE_BONUS: 2,
  UPPERBOUND_NEAREST: 1,
  CONTRADICTION_PENALTY: 3,
  LOCAL_DB_MATCH: 3,
  MULTI_SOURCE_BONUS: 2,
};

export const EXACT_TOLERANCE_YEARS = 1;
export const ERA_TOLERANCE_YEARS = 4;
export const CONTRADICTION_GRACE_YEARS = 1;

export const MIN_SCORE_TO_RESOLVE = 1;
export const MIN_MARGIN_TO_RESOLVE = 2;
export const HIGH_CONFIDENCE_MARGIN = 4;
export const TIGHT_SPACING_YEARS = 5;
export const NARROW_TOLERANCE = 1;

// Era-cluster proximity tiers: distance (years) from the median era-anchor
// year to a candidate year. Proposed starting values per the product spec,
// not yet empirically tuned against a larger labeled dataset.
export const ERA_CLUSTER_WEIGHTS = { NEAR: 4, CLOSE: 2, FAR: 1, DISTANT: -2 };
export const ERA_CLUSTER_NEAR_YEARS = 2;
export const ERA_CLUSTER_CLOSE_YEARS = 5;
export const ERA_CLUSTER_FAR_YEARS = 8;
// Era clustering may only resolve a single year when the winning candidate
// is at least this far from every other candidate — a broad, multi-source
// "seen in this general period" signal is not precise enough to separate
// closely-spaced candidates on its own.
export const ERA_CLUSTER_MIN_SPACING_YEARS = 8;

const MARKETPLACE_DOMAIN_HINTS = ['ebay', 'craigslist', 'offerup', 'mercari'];

// Explicit lifecycle and ownership evidence remains stronger than a generic
// era anchor. Publication-like evidence is intentionally non-directional.
const LOWER_BOUND_MEANINGS = new Set(['product_launch', 'production_start']);
const POINT_MEANINGS = new Set(['owner_purchase', 'ownership_age']);
const UPPER_BOUND_MEANINGS = new Set(['production_end', 'discontinuation']);
const EXISTENCE_MEANINGS = new Set([
  'product_available', 'publication_date', 'listing_publication', 'manual_published',
  'review_published', 'troubleshooting_date',
]);

// Source types the product spec lists as legitimate era-anchor evidence
// (YouTube, retailer, professional review, Reddit/forum with ownership
// context, service/troubleshooting, manual/spec doc, manufacturer page,
// certification/ENERGY STAR record). 'other' and 'local-database' are
// deliberately excluded — 'other' is too unclassified to trust for a
// clustering signal, and local-DB agreement is already its own bonus.
const ERA_ANCHOR_ELIGIBLE_SOURCE_TYPES = new Set([
  'youtube', 'retailer', 'review', 'reddit-forum', 'parts', 'manual', 'spec-sheet', 'manufacturer', 'energy-star',
]);

function isMarketplaceDomain(domain) {
  if (!domain) return false;
  return MARKETPLACE_DOMAIN_HINTS.some((hint) => domain.includes(hint));
}

// Only the meaning of the extracted date controls direction. A boolean that
// a source mentions "new" or "discontinued" does not prove the accompanying
// page/publication date is a production boundary.
function classifyRole(fact) {
  if (LOWER_BOUND_MEANINGS.has(fact.dateMeaning)) return 'lowerBound';
  if (POINT_MEANINGS.has(fact.dateMeaning)) return 'point';
  if (UPPER_BOUND_MEANINGS.has(fact.dateMeaning)) return 'upperBound';
  if (EXISTENCE_MEANINGS.has(fact.dateMeaning)) return 'existence';
  return 'none';
}

function isLifecycleFact(fact) {
  const role = classifyRole(fact);
  return role === 'lowerBound'
    || role === 'upperBound'
    || fact.dateMeaning === 'product_available';
}

// dateMeanings where Serper's structured `date` field plausibly describes
// THE SAME EVENT the meaning refers to (a review's date field is when the
// review was published; a forum post's date field is when it was posted) —
// for these, the deterministic field is authoritative over Gemini's
// text-extracted guess. For product_launch/product_available specifically,
// the raw date field is usually just "when this page was last crawled/
// updated," NOT the launch date — a launch claim lives in the page's prose
// (e.g. "produced from 2005"), which only Gemini's approximateYear can
// capture. Blindly preferring the field there overrides a correct in-text
// extraction with an unrelated page-freshness date.
const MEANINGS_WHERE_DATE_FIELD_IS_PRIMARY = new Set([
  'review_published', 'troubleshooting_date', 'ownership_age', 'owner_purchase',
  'publication_date', 'listing_publication', 'manual_published', 'page_updated',
]);

/**
 * Merges the deterministically-computed date (from Serper's structured
 * `date` field, via date-normalizer.js) with Gemini's own text-extracted
 * approximateYear. The deterministic field wins only when it plausibly
 * describes the same event as the fact's dateMeaning; otherwise Gemini's
 * in-text extraction wins, with the field as a fallback when Gemini found
 * nothing. Either way, this merge is pure code — no LLM judgment involved.
 */
export function resolveEffectiveYear(fact) {
  const fieldIsPrimary = MEANINGS_WHERE_DATE_FIELD_IS_PRIMARY.has(fact.dateMeaning);
  if (fieldIsPrimary && Number.isInteger(fact.normalizedDateYear)) return fact.normalizedDateYear;
  if (Number.isInteger(fact.approximateYear)) return fact.approximateYear;
  if (Number.isInteger(fact.normalizedDateYear)) return fact.normalizedDateYear;
  return null;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * @param {{candidateYears:number[], evidenceFacts:Array, localModelEvidence:object|null}} input
 *   evidenceFacts: extracted facts (from evidence-extraction.js) merged with
 *   {domain, normalizedDateYear} carried over from the raw evidence items.
 */
export function evaluateCandidates({ candidateYears, evidenceFacts, localModelEvidence }) {
  const years = [...new Set(candidateYears)];

  const explicitScoreMap = new Map(years.map((y) => [y, 0]));
  const eraClusterScoreMap = new Map(years.map((y) => [y, 0]));
  const supportMap = new Map(years.map((y) => [y, new Set()]));
  const contradictedBy = new Map(years.map((y) => [y, new Set()]));

  function bump(map, year, amount, factIndex, isPenalty = false) {
    if (!map.has(year)) return;
    map.set(year, map.get(year) + amount);
    if (isPenalty) contradictedBy.get(year).add(factIndex);
    else if (amount > 0) supportMap.get(year).add(factIndex);
  }

  const eligibleFacts = evidenceFacts
    .map((fact) => ({ ...fact, effectiveYear: resolveEffectiveYear(fact) }))
    .filter((fact) =>
      (fact.modelMatchType === 'exact' || fact.modelMatchType === 'canonical-equivalent')
      && !isMarketplaceDomain(fact.domain)
      && fact.effectiveYear != null);

  // ---- (1) Explicit evidence: lowerBound / point / upperBound ----
  const seenDomainsByRole = { lowerBound: new Set(), point: new Set(), upperBound: new Set() };

  for (const fact of eligibleFacts) {
    const role = classifyRole(fact);
    if (!seenDomainsByRole[role]) continue;
    const domainKey = fact.domain || fact.claimText || String(fact.resultIndex);
    if (seenDomainsByRole[role].has(domainKey)) continue;
    seenDomainsByRole[role].add(domainKey);

    if (role === 'lowerBound') {
      for (const y of years) {
        if (y >= fact.effectiveYear - CONTRADICTION_GRACE_YEARS) {
          const diff = Math.abs(y - fact.effectiveYear);
          if (diff <= EXACT_TOLERANCE_YEARS) bump(explicitScoreMap, y, WEIGHTS.ANCHOR_EXACT, fact.resultIndex);
          else if (diff <= ERA_TOLERANCE_YEARS) bump(explicitScoreMap, y, WEIGHTS.ANCHOR_ERA, fact.resultIndex);
        } else {
          bump(explicitScoreMap, y, -WEIGHTS.CONTRADICTION_PENALTY, fact.resultIndex, true);
        }
      }
    } else if (role === 'point') {
      for (const y of years) {
        const diff = Math.abs(y - fact.effectiveYear);
        if (diff <= EXACT_TOLERANCE_YEARS) {
          bump(explicitScoreMap, y, WEIGHTS.ANCHOR_EXACT, fact.resultIndex);
          if (fact.ownershipAgeYears != null) bump(explicitScoreMap, y, WEIGHTS.OWNERSHIP_AGE_BONUS, fact.resultIndex);
        } else if (diff <= ERA_TOLERANCE_YEARS) {
          bump(explicitScoreMap, y, WEIGHTS.ANCHOR_ERA, fact.resultIndex);
        }
      }
    } else {
      const atOrBefore = years.filter((y) => y <= fact.effectiveYear + CONTRADICTION_GRACE_YEARS);
      if (atOrBefore.length) {
        const nearest = atOrBefore.reduce((a, b) =>
          Math.abs(b - fact.effectiveYear) < Math.abs(a - fact.effectiveYear) ? b : a);
        bump(explicitScoreMap, nearest, WEIGHTS.UPPERBOUND_NEAREST, fact.resultIndex);
      }
      for (const y of years) {
        if (y > fact.effectiveYear + CONTRADICTION_GRACE_YEARS) {
          bump(explicitScoreMap, y, -WEIGHTS.CONTRADICTION_PENALTY, fact.resultIndex, true);
        }
      }
    }
  }

  // ---- (2) Era-anchor clustering ----
  const seenEraAnchorDomains = new Set();
  const eraAnchorFacts = [];
  for (const fact of eligibleFacts) {
    if (classifyRole(fact) === 'none') continue;
    if (!ERA_ANCHOR_ELIGIBLE_SOURCE_TYPES.has(fact.sourceType)) continue;
    const domainKey = fact.domain || fact.claimText || String(fact.resultIndex);
    if (seenEraAnchorDomains.has(domainKey)) continue;
    seenEraAnchorDomains.add(domainKey);
    eraAnchorFacts.push(fact);
  }

  let eraCenter = null;
  let eraObservedMin = null;
  let eraObservedMax = null;
  const eraClusterEligible = eraAnchorFacts.length >= 2 && eraAnchorFacts.some(isLifecycleFact);
  if (eraClusterEligible) {
    const eraYears = eraAnchorFacts.map((f) => f.effectiveYear);
    eraCenter = median(eraYears);
    eraObservedMin = Math.min(...eraYears);
    eraObservedMax = Math.max(...eraYears);
    // All era-anchor facts collectively determined the median, so all of
    // them are attached as supporting (or contradicting) evidence for
    // whichever candidate(s) that median distance favors or disfavors —
    // the bonus/penalty itself is applied exactly once per candidate.
    const eraAnchorIndexes = eraAnchorFacts.map((f) => f.resultIndex);

    for (const y of years) {
      const distance = Math.abs(y - eraCenter);
      let amount;
      if (distance <= ERA_CLUSTER_NEAR_YEARS) amount = ERA_CLUSTER_WEIGHTS.NEAR;
      else if (distance <= ERA_CLUSTER_CLOSE_YEARS) amount = ERA_CLUSTER_WEIGHTS.CLOSE;
      else if (distance <= ERA_CLUSTER_FAR_YEARS) amount = ERA_CLUSTER_WEIGHTS.FAR;
      else amount = ERA_CLUSTER_WEIGHTS.DISTANT;

      eraClusterScoreMap.set(y, eraClusterScoreMap.get(y) + amount);
      const targetSet = amount > 0 ? supportMap.get(y) : contradictedBy.get(y);
      for (const idx of eraAnchorIndexes) targetSet.add(idx);
    }
  }

  // Local model-database agreement (independent of both components above).
  if (localModelEvidence) {
    const localStart = Number.isInteger(localModelEvidence.start) ? localModelEvidence.start : null;
    const localEnd = Number.isInteger(localModelEvidence.end) ? localModelEvidence.end : null;
    for (const y of years) {
      if ((localStart == null || y >= localStart) && (localEnd == null || y <= localEnd)) {
        bump(explicitScoreMap, y, WEIGHTS.LOCAL_DB_MATCH, -1);
      }
    }
  }

  // Combine, then apply the "2+ independent sources" bonus to the combined
  // total based on how many distinct evidence indexes positively support y.
  const combinedScoreMap = new Map(years.map((y) => [y, explicitScoreMap.get(y) + eraClusterScoreMap.get(y)]));
  for (const y of years) {
    if (supportMap.get(y).size >= 2) {
      combinedScoreMap.set(y, combinedScoreMap.get(y) + WEIGHTS.MULTI_SOURCE_BONUS);
    }
  }

  // Output is sorted by YEAR VALUE, never by input array position — this is
  // what guarantees candidate-order independence.
  const candidateScores = years
    .slice()
    .sort((a, b) => a - b)
    .map((y) => ({
      year: y,
      score: combinedScoreMap.get(y),
      explicitScore: explicitScoreMap.get(y),
      eraClusterScore: eraClusterScoreMap.get(y),
      supportingEvidenceIndexes: [...supportMap.get(y)].sort((a, b) => a - b),
    }));

  const rankedByScore = [...candidateScores].sort((a, b) => b.score - a.score || a.year - b.year);
  const top = rankedByScore[0];
  const second = rankedByScore[1] || { score: -Infinity, year: null };
  const margin = top.score - second.score;
  const tiedTopYears = candidateScores.filter((c) => c.score === top.score);
  const minGapFromTop = years.length > 1
    ? Math.min(...years.filter((y) => y !== top.year).map((y) => Math.abs(y - top.year)))
    : Infinity;

  const rankedByExplicit = [...candidateScores].sort((a, b) => b.explicitScore - a.explicitScore || a.year - b.year);
  const explicitTop = rankedByExplicit[0];
  const explicitSecond = rankedByExplicit[1] || { explicitScore: -Infinity };
  const explicitMargin = explicitTop.explicitScore - explicitSecond.explicitScore;
  const explicitTiedTop = candidateScores.filter((c) => c.explicitScore === explicitTop.explicitScore);

  let bestEstimateYear = null;
  let plausibleYears = null;
  let confidence = 'low';
  let resolutionType = 'unchanged';
  let resolvedVia = null;

  const explicitAloneResolves = explicitTop.explicitScore >= MIN_SCORE_TO_RESOLVE
    && explicitMargin >= MIN_MARGIN_TO_RESOLVE
    && explicitTiedTop.length === 1
    && explicitTop.year === top.year
    && top.score >= MIN_SCORE_TO_RESOLVE
    && margin >= MIN_MARGIN_TO_RESOLVE
    && tiedTopYears.length === 1;

  const eraClusterResolves = !explicitAloneResolves
    && eraClusterEligible
    && minGapFromTop >= ERA_CLUSTER_MIN_SPACING_YEARS
    && top.score >= MIN_SCORE_TO_RESOLVE
    && margin >= MIN_MARGIN_TO_RESOLVE
    && tiedTopYears.length === 1
    && explicitScoreMap.get(top.year) >= 0; // rule 6: explicit evidence must not contradict the winner

  if (explicitAloneResolves) {
    bestEstimateYear = top.year;
    plausibleYears = [top.year];
    resolutionType = 'resolved-single';
    resolvedVia = 'explicit';
    if (minGapFromTop < TIGHT_SPACING_YEARS) {
      confidence = 'low';
    } else if (margin >= HIGH_CONFIDENCE_MARGIN && top.score >= WEIGHTS.ANCHOR_EXACT) {
      confidence = 'high';
    } else {
      confidence = 'moderate';
    }
  } else if (eraClusterResolves) {
    bestEstimateYear = top.year;
    plausibleYears = [top.year];
    resolutionType = 'resolved-single';
    resolvedVia = 'eraCluster';
    // Era clustering never reaches "high" — it documents a period, not an
    // exact-fact manufacture year.
    confidence = minGapFromTop < TIGHT_SPACING_YEARS ? 'low' : 'moderate';
  } else {
    const narrowed = candidateScores.filter((c) => c.score >= top.score - NARROW_TOLERANCE && c.score >= 0);
    const topHasEraInfluence = eraClusterScoreMap.get(top.year) !== 0;
    if (narrowed.length === 1 && top.score >= MIN_SCORE_TO_RESOLVE && !topHasEraInfluence) {
      bestEstimateYear = narrowed[0].year;
      plausibleYears = [narrowed[0].year];
      resolutionType = 'resolved-single';
      resolvedVia = 'elimination';
      confidence = minGapFromTop < TIGHT_SPACING_YEARS ? 'low' : 'moderate';
    } else if (narrowed.length >= 2 && narrowed.length < years.length) {
      resolutionType = 'narrowed';
      plausibleYears = narrowed.map((c) => c.year);
      confidence = 'low';
    } else {
      resolutionType = 'unchanged';
      plausibleYears = null;
      confidence = 'low';
    }
  }

  const estimatedModelEra = eraCenter != null
    ? { startYear: eraObservedMin, endYear: eraObservedMax, centerYear: eraCenter }
    : { startYear: null, endYear: null, centerYear: null };

  const reason = buildReason({
    bestEstimateYear, resolutionType, resolvedVia, candidateScores, evidenceFacts, plausibleYears, estimatedModelEra,
  });

  return {
    bestEstimateYear,
    plausibleYears,
    confidence,
    candidateScores,
    estimatedModelEra,
    resolutionType,
    resolvedVia,
    reason,
    serialOnlyFallback: resolutionType === 'unchanged',
    disclaimer: 'This is an educational estimate for general reference, not a certified appraisal or forensic determination. For insurance, legal, warranty, or resale documentation, verify the manufacture date directly with the manufacturer using the full serial number and model label.',
  };
}

// Converts a year into a plain-language decade position ("early", "mid",
// "late") for product-facing era phrases — purely deterministic templating,
// no LLM involved.
function decadePosition(year) {
  const pos = year % 10;
  if (pos <= 3) return 'early';
  if (pos <= 6) return 'mid';
  return 'late';
}

function decadeLabel(year) {
  return `${Math.floor(year / 10) * 10}s`;
}

function describeEraPhrase(startYear, endYear) {
  if (startYear == null || endYear == null) return null;
  const startDecade = decadeLabel(startYear);
  const endDecade = decadeLabel(endYear);
  if (startDecade === endDecade) {
    const startPos = decadePosition(startYear);
    const endPos = decadePosition(endYear);
    return startPos === endPos ? `the ${startPos} ${startDecade}` : `the ${startPos}-to-${endPos} ${startDecade}`;
  }
  return `the ${decadePosition(startYear)} ${startDecade} to the ${decadePosition(endYear)} ${endDecade}`;
}

function buildReason({ bestEstimateYear, resolutionType, resolvedVia, candidateScores, evidenceFacts, plausibleYears, estimatedModelEra }) {
  const byIndex = new Map(evidenceFacts.map((f) => [f.resultIndex, f]));
  const claimsFor = (indexes) => indexes.map((i) => byIndex.get(i)?.claimText).filter(Boolean);

  if (resolutionType === 'resolved-single' && resolvedVia === 'eraCluster') {
    const phrase = describeEraPhrase(estimatedModelEra.startYear, estimatedModelEra.endYear);
    const alternatives = candidateScores.filter((c) => c.year !== bestEstimateYear).map((c) => c.year);
    return `Dated exact-model references place this model in ${phrase || 'a consistent period'}, making the ${bestEstimateYear} serial interpretation substantially more likely than ${alternatives.join(' or ')}. This documents that the model was seen in that period — it does not prove the exact unit's manufacture date.`;
  }
  if (resolutionType === 'resolved-single') {
    const winner = candidateScores.find((c) => c.year === bestEstimateYear);
    const claims = claimsFor(winner.supportingEvidenceIndexes);
    const contradicted = candidateScores.filter((c) => c.year !== bestEstimateYear && c.score < 0);
    const contradictedNote = contradicted.length
      ? ` This also contradicts ${contradicted.map((c) => c.year).join(', ')} as candidates the evidence does not support.`
      : '';
    return claims.length
      ? `${claims.join('; ')}. This evidence best fits the ${bestEstimateYear} candidate.${contradictedNote}`
      : `Evidence patterns most closely fit the ${bestEstimateYear} candidate.${contradictedNote}`;
  }
  if (resolutionType === 'narrowed') {
    return `Evidence rules out some candidates but does not clearly separate the remaining ${plausibleYears.join(', ')}.`;
  }
  return 'No evidence with a resolvable date and exact-model match was found to distinguish between the candidate years.';
}
