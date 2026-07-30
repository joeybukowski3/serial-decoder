/**
 * Production-supported estimator utilities combine serial candidate years, local
 * model database data (when available), and Serper search evidence into a
 * single fast NON-GROUNDED Gemini call that produces an educational,
 * uncertainty-labeled model-era estimate.
 *
 * Distinct from the rollback-only grounded provider in
 * lib/serial-refinement/provider.js —
 * this call takes NO tools and reasons only over evidence already gathered
 * by this script via the existing Serper client, so it is fast.
 *
 * Product framing (per product decision): DecodeMyItem is an educational
 * model-era estimator, not a forensic certification service. The goal is a
 * useful, defensible RELATIVE-ERA estimate — not documentary proof of an
 * exact manufacture date. A source does not need to state the exact
 * production year; evidence that clearly places the model in one decade or
 * generation (dated exact-model videos, dated forum/ownership-age posts,
 * dated retailer/review listings, manuals, spec sheets, ENERGY STAR/
 * certification records, parts/service docs, predecessor-or-replacement
 * references) is treated as legitimate era evidence and scored on
 * corroboration and credibility rather than excluded by source category.
 * The one hard boundary that never moves: a manufacture year is never
 * asserted outside the serial decoder's own candidate years, and marketplace
 * or undated content can never determine the answer alone.
 */
import { createBoundedAbort } from '../bounded-abort.js';

export const GEMINI_ENDPOINT_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
export const DEFAULT_GEMINI_MODEL = process.env.GEMINI_ESTIMATOR_MODEL || 'gemini-2.5-flash';
export const DEFAULT_GEMINI_TIMEOUT_MS = 8000;

const CONFIDENCE_LEVELS = new Set(['high', 'moderate', 'low']);
const RESOLUTION_TYPES = new Set(['resolved-single', 'narrowed', 'unchanged']);
const SOURCE_TYPES = new Set([
  'manufacturer', 'manual', 'spec-sheet', 'energy-star', 'retailer', 'review',
  'parts', 'youtube', 'reddit-forum', 'local-database', 'other',
]);

// Listing-only marketplaces where the visible "date" is a for-sale/listing
// date, not evidence of when the item was made or first owned. These can
// never count toward corroboration, regardless of what Gemini claims about
// them (e.g. isExactModelMatch/hasDate) — distinguished from Reddit/forum
// posts, which ARE allowed to count when dated and exact-model matched.
const MARKETPLACE_DOMAIN_HINTS = ['ebay', 'craigslist', 'offerup', 'mercari'];

// Candidate years separated by roughly a decade or more are far enough apart
// that even a single strong dated source can safely resolve between them
// (rule A). Below this, single-source resolution is not allowed — the
// spacing is too tight to trust one data point.
const WIDE_SPACING_THRESHOLD_YEARS = 8;
// Below this spacing, evidence genuinely may not be able to distinguish
// candidates (per product framing: "the same evidence may not distinguish
// 2022 from 2024") — confidence is capped at "low" even when nominally
// resolved via narrowing-only rules.
const TIGHT_SPACING_THRESHOLD_YEARS = 5;

function isMarketplaceDomain(domain) {
  if (!domain) return false;
  return MARKETPLACE_DOMAIN_HINTS.some((hint) => domain.includes(hint));
}

function isOfficialSource(source, manufacturerDomains) {
  if (source.type === 'manufacturer' || source.type === 'energy-star') return true;
  return Boolean(source.domain && manufacturerDomains.has(source.domain));
}

/**
 * Builds the single prompt sent to Gemini. All evidence is pre-gathered by
 * this script (Serper results, optional local model DB range) — Gemini is
 * not asked to search, only to reason over what is provided.
 */
export function buildEstimatorPrompt({ brand, model, category, candidateYears, localModelEvidence, serperResults, currentYear }) {
  const evidenceBlock = serperResults.length
    ? serperResults.map((r, i) => `${i + 1}. [${r.strategy}] "${r.title}" (${r.domain || 'unknown domain'})\n   Snippet: ${r.snippet}\n   Visible date: ${r.date || 'none'}`).join('\n')
    : 'No search evidence was returned.';

  const localBlock = localModelEvidence
    ? `Local model database match: production range ${localModelEvidence.start}-${localModelEvidence.end} (${localModelEvidence.verifiedExact ? 'verified exact model match' : 'approximate match'}).`
    : 'No local model database match was found for this exact model.';

  return `You are an educational RELATIVE-ERA estimation assistant for DecodeMyItem, a consumer serial-number decoding tool. This is NOT a forensic or legal certification service. The goal is a useful, defensible era estimate — not documentary proof of an exact manufacture date. Never claim certainty when a conclusion is inferred.

Brand: ${brand}
Model: ${model}
Category: ${category || 'unknown'}
Current year: ${currentYear}

The serial number decoder has already determined this item's manufacture year MUST be one of these candidate years (from the physical serial number format, independent of any search evidence): ${candidateYears.join(', ')}

${localBlock}

Search evidence gathered (titles/snippets only, no full pages fetched):
${evidenceBlock}

RELATIVE-ERA PHILOSOPHY: A source does NOT need to explicitly state the exact production year. Evidence that clearly places the model in one decade or generation is enough when it favors one candidate over the alternatives. You may draw on: exact-model YouTube promotion/review/installation/demonstration videos with dates; exact-model Reddit or forum posts with dates and ownership-age statements (e.g. "bought this a year ago" in a 2025 post implies a ~2024 era); retailer listings and dated reviews; manufacturer product pages; manuals and spec sheets; ENERGY STAR/certification records; service or parts documents; exact-model troubleshooting posts; and predecessor-or-replacement references. Judge each source on credibility and corroboration, not by excluding entire categories (do not reject a dated, exact-model YouTube/Reddit/retailer/review/forum source just because it is not an official manufacturer page).

Examples of valid reasoning:
- A 2024 exact-model promotion video strongly favors 2024 over a 2014 alternative.
- A 2025 owner post stating the item was "one year old" strongly supports a 2024 era.
- Several independent exact-model sources clustered in 2023-2025 may support 2024 over 2014 even without an explicit launch date.
- The same evidence may NOT distinguish 2022 from 2024 — do not force a choice when candidates are close together and evidence is thin.

Reason using ALL of these factors before answering: (1) exact-model match, (2) source date, (3) source type and credibility, (4) ownership-age or release-language evidence, (5) number of independent corroborating sources, (6) distance between candidate years, (7) contradictory evidence, (8) how well each candidate fits the observed model era.

Hard rules (never overridden by the above):
- If you name a best-estimate manufacture year, it MUST be exactly one of the candidate years listed above. Never propose any other year as the final answer.
- Marketplace listings (eBay, Craigslist, OfferUp, Mercari) show a for-sale date, not a manufacture or ownership date — they must never determine the answer alone, and undated content of any kind must never determine the answer alone.
- Do not force a single year when evidence is genuinely ambiguous or candidates are close together with thin evidence — narrowing to 2+ plausible candidates, or leaving the result unchanged, is the honest answer in that case.
- It is fine to describe a broader "model era" range even if it extends beyond the candidate years — that is a descriptive era range, not a manufacture-year claim.

For EVERY source you cite in sourcesUsed, report these structured fields honestly (this is what your credibility judgment is actually graded on):
- isExactModelMatch: true only if the source is unambiguously about this exact model number, not a family/prefix match.
- hasDate: true only if the source shows or clearly implies a specific date, year, or "N years/months ago"-style relative time you can anchor to the current year.
- supportsCandidateYear: which single candidate year (from the list above) this source's date/context most directly supports, or null if it doesn't point to one.
- ownershipAgeStatement: true only if the source contains an explicit ownership-age statement (e.g. "I've had this for 2 years", "bought last year").

Return valid JSON only, matching this exact shape:
{
  "bestEstimateYear": <integer from the candidate list, or null if evidence does not clearly favor one>,
  "candidateYearsNarrowed": [<subset of candidate years that remain plausible>] or null,
  "modelEraStart": <integer or null>,
  "modelEraEnd": <integer or null>,
  "confidence": "high" | "moderate" | "low",
  "resolutionType": "resolved-single" | "narrowed" | "unchanged",
  "reasoning": "<2-4 sentence plain-language explanation a consumer can understand, referencing the actual evidence>",
  "sourcesUsed": [
    {
      "title": "<source title>",
      "domain": "<domain or null>",
      "type": "manufacturer | manual | spec-sheet | energy-star | retailer | review | parts | youtube | reddit-forum | local-database | other",
      "isExactModelMatch": true | false,
      "hasDate": true | false,
      "supportsCandidateYear": <one candidate year or null>,
      "ownershipAgeStatement": true | false
    }
  ]
}`;
}

function extractJson(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('EMPTY_GEMINI_OUTPUT');
  try {
    return JSON.parse(raw);
  } catch (_) {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) return JSON.parse(fenced[1]);
    const object = raw.match(/\{[\s\S]*\}/);
    if (object) return JSON.parse(object[0]);
    throw new Error('MALFORMED_GEMINI_JSON');
  }
}

/**
 * Single fast non-grounded Gemini call. No tools, no search — reasons only
 * over the evidence text embedded in the prompt.
 */
export async function callGeminiEstimator(prompt, options = {}) {
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const error = new Error('GEMINI_API_KEY_MISSING');
    error.code = 'GEMINI_NOT_CONFIGURED';
    throw error;
  }
  const fetchImpl = options.fetchImpl || fetch;
  const model = options.model || DEFAULT_GEMINI_MODEL;
  const timeoutMs = Math.max(1, Number(options.timeoutMs) || DEFAULT_GEMINI_TIMEOUT_MS);

  const boundedAbort = createBoundedAbort(options.signal, timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetchImpl(
      `${GEMINI_ENDPOINT_BASE}/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        signal: boundedAbort.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            // Default stays 2048 for the richer legacy (relative-era)
            // schema still used by the older estimator scripts. The
            // evidence-extraction call (evidence-extraction.js, via
            // orchestrator.js's runEvidenceExtraction) explicitly passes a
            // smaller value — see the latency-optimization note there.
            maxOutputTokens: options.maxOutputTokens || 2048,
            responseMimeType: 'application/json',
            // Disabled: gemini-2.5-flash's default thinking mode consumes
            // the output-token budget on hidden reasoning tokens before any
            // visible JSON is emitted, truncating the response. This is a
            // fast non-grounded reasoning-over-provided-evidence call by
            // design, not a deep-research call, so thinking is unneeded.
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      },
    );

    const durationMs = Date.now() - startedAt;

    if (!response.ok) {
      const error = new Error(`GEMINI_HTTP_${response.status}`);
      error.status = response.status;
      error.durationMs = durationMs;
      throw error;
    }

    const payload = await response.json();
    const candidate = payload?.candidates?.[0];
    const text = candidate?.content?.parts?.map((part) => part?.text || '').join('') || '';
    const parsed = extractJson(text);
    const usage = payload?.usageMetadata || null;

    return {
      status: 'success',
      model,
      durationMs,
      parsed,
      rawText: text,
      finishReason: candidate?.finishReason || null,
      usage: usage
        ? {
            promptTokenCount: usage.promptTokenCount ?? null,
            candidatesTokenCount: usage.candidatesTokenCount ?? null,
            totalTokenCount: usage.totalTokenCount ?? null,
          }
        : null,
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const isAbort = error && (error.name === 'AbortError' || String(error?.code) === 'ABORT_ERR');
    return {
      status: isAbort ? 'timeout' : 'error',
      model,
      durationMs,
      parsed: null,
      rawText: null,
      finishReason: null,
      usage: null,
      errorMessage: isAbort ? 'TIMEOUT' : String(error?.message || error),
    };
  } finally {
    boundedAbort.cleanup();
  }
}

/**
 * Deterministic, code-enforced candidate-relative scoring over Gemini's
 * structured per-source output. Never trusts the model's self-reported
 * bestEstimateYear or confidence at face value — this is the actual
 * guarantee that a manufacture year outside the serial decoder's candidate
 * years can never surface, that marketplace/undated evidence can never
 * single-handedly decide the answer, and that confidence cannot exceed what
 * the gathered evidence actually supports for THIS candidate relative to the
 * alternatives (factors 1-8 in the product spec).
 *
 * @param {object} parsed raw parsed JSON from Gemini
 * @param {{candidateYears:number[], serperResults:Array, localModelEvidence:object|null, manufacturerDomains:Set<string>}} context
 */
export function enforceEstimatorSafety(parsed, context) {
  const { candidateYears, localModelEvidence, manufacturerDomains } = context;
  const corrections = [];

  let bestEstimateYear = Number.isInteger(parsed?.bestEstimateYear) ? parsed.bestEstimateYear : null;
  if (bestEstimateYear !== null && !candidateYears.includes(bestEstimateYear)) {
    corrections.push(`bestEstimateYear ${bestEstimateYear} was not in candidateYears (${candidateYears.join(', ')}); discarded.`);
    bestEstimateYear = null;
  }

  const sourcesUsed = Array.isArray(parsed?.sourcesUsed)
    ? parsed.sourcesUsed.map((s) => ({
        title: String(s?.title || ''),
        domain: s?.domain ? String(s.domain).toLowerCase() : null,
        type: SOURCE_TYPES.has(s?.type) ? s.type : 'other',
        isExactModelMatch: Boolean(s?.isExactModelMatch),
        hasDate: Boolean(s?.hasDate),
        supportsCandidateYear: Number.isInteger(s?.supportsCandidateYear) && candidateYears.includes(s.supportsCandidateYear)
          ? s.supportsCandidateYear
          : null,
        ownershipAgeStatement: Boolean(s?.ownershipAgeStatement),
      }))
    : [];

  // An "eligible" source is one that can legitimately count toward
  // corroborating a specific candidate year: exact-model match, dated (or
  // ownership-age anchored), not a marketplace listing date, and it points
  // at a specific candidate. This is the code-enforced version of "judge on
  // credibility and corroboration, not category" — every source TYPE is
  // eligible (youtube/reddit-forum/review/retailer included), but only if
  // it meets these structural bars.
  const eligible = sourcesUsed.filter((s) =>
    s.isExactModelMatch && s.hasDate && s.supportsCandidateYear !== null && !isMarketplaceDomain(s.domain));

  // Per-candidate support: independent domain count + whether an official
  // source or an ownership-age statement backs it.
  const supportByCandidate = new Map();
  for (const year of candidateYears) {
    const supporting = eligible.filter((s) => s.supportsCandidateYear === year);
    const domains = new Set(supporting.map((s) => s.domain || s.title));
    supportByCandidate.set(year, {
      independentDomainCount: domains.size,
      hasOfficial: supporting.some((s) => isOfficialSource(s, manufacturerDomains)),
      hasOwnershipAge: supporting.some((s) => s.ownershipAgeStatement),
    });
  }

  const localAgreesWith = (year) =>
    Boolean(localModelEvidence && year >= localModelEvidence.start && year <= localModelEvidence.end);

  function minGapToOtherCandidates(year) {
    const others = candidateYears.filter((y) => y !== year);
    if (!others.length) return Infinity;
    return Math.min(...others.map((y) => Math.abs(y - year)));
  }

  function isContested(year) {
    const mySupport = supportByCandidate.get(year);
    return candidateYears.some((other) => {
      if (other === year) return false;
      const otherSupport = supportByCandidate.get(other);
      return otherSupport.independentDomainCount >= Math.max(1, mySupport.independentDomainCount);
    });
  }

  // Candidate-relative resolution rules — a single year is only allowed
  // when one of these is true, matching the product spec exactly.
  function evaluateResolution(year) {
    const support = supportByCandidate.get(year);
    const minGap = minGapToOtherCandidates(year);
    const contested = isContested(year);

    const ruleA = support.independentDomainCount >= 1 && minGap >= WIDE_SPACING_THRESHOLD_YEARS;
    const ruleB = support.independentDomainCount >= 2;
    const ruleC = support.hasOwnershipAge;
    const ruleD = support.independentDomainCount >= 1 && localAgreesWith(year);

    const allowed = (ruleA || ruleB || ruleC || ruleD) && !contested;
    return { allowed, support, minGap, contested, ruleA, ruleB, ruleC, ruleD };
  }

  let resolution = bestEstimateYear !== null ? evaluateResolution(bestEstimateYear) : null;
  if (bestEstimateYear !== null && !resolution.allowed) {
    if (resolution.contested) {
      corrections.push(`bestEstimateYear ${bestEstimateYear} was contested by comparably-supported alternative candidate(s); discarded.`);
    } else {
      corrections.push(`bestEstimateYear ${bestEstimateYear} did not meet any single-year resolution rule (needs: 1 strong source with ${WIDE_SPACING_THRESHOLD_YEARS}+ year candidate spacing, 2+ independent corroborating sources, an ownership-age statement, or local-DB + web agreement); discarded.`);
    }
    bestEstimateYear = null;
  }

  // candidateYearsNarrowed: clamp to real candidates, and additionally
  // clamp to years that have SOME eligible support (or the model's own
  // narrowed list if Gemini already trimmed it) so "narrowed" isn't just
  // Gemini's unverified guess either.
  let candidateYearsNarrowed = Array.isArray(parsed?.candidateYearsNarrowed)
    ? parsed.candidateYearsNarrowed.filter((y) => Number.isInteger(y) && candidateYears.includes(y))
    : null;
  if (candidateYearsNarrowed && (candidateYearsNarrowed.length === 0 || candidateYearsNarrowed.length >= candidateYears.length)) {
    candidateYearsNarrowed = null;
  }

  // Confidence is capped by the actual support tier for the FINAL
  // bestEstimateYear (post-correction), never by what Gemini claimed.
  let confidence = CONFIDENCE_LEVELS.has(parsed?.confidence) ? parsed.confidence : 'low';
  const rank = { low: 0, moderate: 1, high: 2 };

  let evidenceCap = 'low';
  if (bestEstimateYear !== null) {
    const support = supportByCandidate.get(bestEstimateYear);
    const minGap = minGapToOtherCandidates(bestEstimateYear);
    const wideAndStrong = support.independentDomainCount >= 2 && minGap >= WIDE_SPACING_THRESHOLD_YEARS;
    const officialAndReasonablySpaced = support.hasOfficial && support.independentDomainCount >= 1 && minGap >= TIGHT_SPACING_THRESHOLD_YEARS;
    if ((wideAndStrong || officialAndReasonablySpaced) && !isContested(bestEstimateYear)) {
      evidenceCap = 'high';
    } else if (minGap < TIGHT_SPACING_THRESHOLD_YEARS) {
      // Close-together candidates cap out at low even when nominally
      // resolved, per "the same evidence may not distinguish 2022 from
      // 2024" — a resolved answer here is still only weakly defensible.
      evidenceCap = 'low';
    } else {
      evidenceCap = 'moderate';
    }
  } else if (candidateYearsNarrowed) {
    evidenceCap = 'moderate';
  }

  if (rank[confidence] > rank[evidenceCap]) {
    corrections.push(`confidence "${confidence}" exceeded evidence-supported cap "${evidenceCap}"; downgraded.`);
    confidence = evidenceCap;
  }
  if (bestEstimateYear === null && confidence === 'high') {
    confidence = evidenceCap === 'high' ? 'moderate' : evidenceCap;
    corrections.push('confidence downgraded because no bestEstimateYear was confirmed.');
  }

  let resolutionType = RESOLUTION_TYPES.has(parsed?.resolutionType) ? parsed.resolutionType : 'unchanged';
  if (bestEstimateYear !== null) resolutionType = 'resolved-single';
  else if (candidateYearsNarrowed && candidateYearsNarrowed.length >= 2) resolutionType = 'narrowed';
  else resolutionType = 'unchanged';

  const modelEraStart = Number.isInteger(parsed?.modelEraStart) ? parsed.modelEraStart : null;
  const modelEraEnd = Number.isInteger(parsed?.modelEraEnd) ? parsed.modelEraEnd : null;

  return {
    bestEstimateYear,
    candidateYearsNarrowed,
    modelEraStart,
    modelEraEnd,
    confidence,
    resolutionType,
    reasoning: String(parsed?.reasoning || '').slice(0, 800),
    sourcesUsed,
    corrections,
    serialOnlyFallback: resolutionType === 'unchanged',
    disclaimer: 'This is an educational estimate for general reference, not a certified appraisal or forensic determination. For insurance, legal, warranty, or resale documentation, verify the manufacture date directly with the manufacturer using the full serial number and model label.',
  };
}
