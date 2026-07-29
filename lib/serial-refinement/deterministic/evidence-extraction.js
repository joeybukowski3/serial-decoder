/**
 * Production deterministic-scoring Gemini stage: EXTRACTION ONLY.
 *
 * Unlike the earlier estimator policy, this prompt never shows Gemini the
 * serial decoder's candidate years and never asks it to pick, eliminate, or
 * rank a manufacture year. It only asks Gemini to describe, per cited
 * source, objective facts about that source (is it about this exact model,
 * what kind of source is it, what date/timeframe does it reference, what
 * that date represents, and any explicit new/discontinued language). All
 * candidate-year mapping, scoring, and the final estimate are computed
 * afterward by deterministic code in candidate-evaluator.js — removing the
 * stochastic "which candidate does this ambiguous date support" judgment
 * that caused candidate-order inconsistency in the prior policy.
 */

export const DATE_MEANINGS = new Set([
  'publication_date', 'product_launch', 'product_available', 'manual_published',
  'review_published', 'owner_purchase', 'ownership_age', 'troubleshooting_date',
  'page_updated', 'unknown',
]);

export const SOURCE_TYPES = new Set([
  'manufacturer', 'manual', 'spec-sheet', 'energy-star', 'retailer', 'review',
  'parts', 'youtube', 'reddit-forum', 'marketplace', 'local-database', 'other',
]);

/**
 * @param {{brand:string, model:string, category?:string, currentYear:number, evidenceItems:Array}} input
 * evidenceItems: [{index, strategy, title, snippet, domain, rawDate, normalizedDateYear, normalizedDatePrecision}]
 */
export function buildEvidenceExtractionPrompt({ brand, model, category, currentYear, evidenceItems }) {
  const evidenceBlock = evidenceItems.length
    ? evidenceItems.map((e) =>
        `${e.index}. [${e.strategy}] "${e.title}" (${e.domain || 'unknown domain'})\n   Snippet: ${e.snippet}\n   Raw date field: ${e.rawDate || 'none'}${e.normalizedDateYear ? ` (deterministically computed reference year: ${e.normalizedDateYear}, precision: ${e.normalizedDatePrecision})` : ''}`)
        .join('\n')
    : 'No search evidence was returned.';

  return `You are an evidence-extraction assistant for DecodeMyItem, a consumer serial-number decoding tool. Your ONLY job is to describe objective facts about each cited source below. You are NOT deciding a manufacture year, NOT comparing candidate years, and NOT told what the candidate years are — that decision is made separately by deterministic code, not by you. Do not infer or mention any "best" year; only describe what each source itself shows.

Brand: ${brand}
Model: ${model}
Category: ${category || 'unknown'}
Current year: ${currentYear}

Search evidence (titles/snippets only, no full pages fetched):
${evidenceBlock}

For EVERY numbered source above, extract these fields honestly and independently of the other sources:

- resultIndex: the source's number above.
- exactModelMatch: true only if the source is unambiguously about this exact model number, not a family/prefix match.
- sourceType: one of manufacturer | manual | spec-sheet | energy-star | retailer | review | parts | youtube | reddit-forum | marketplace | local-database | other.
- approximateYear: your best-effort year extracted from any date-like text in the title/snippet itself (NOT from the "Raw date field" — that field is already handled deterministically and you do not need to re-derive it). Use null if no year is discernible from the title/snippet text.
- dateMeaning: classify what the date (either the raw date field or any date found in the text) represents — exactly one of: publication_date, product_launch, product_available, manual_published, review_published, owner_purchase, ownership_age, troubleshooting_date, page_updated, unknown. A generic "page last updated" or "in stock" freshness stamp is page_updated, NOT product_launch.
- ownershipAgeYears: if the source contains an explicit ownership-age statement (e.g. "I've had this for 2 years", "bought it a year ago"), the number of years stated; otherwise null.
- explicitlyNewProduct: true only if the source explicitly frames the item as new/just-released/just-launched (not merely "current" or "available").
- explicitlyDiscontinued: true only if the source explicitly states the item is discontinued or no longer produced.
- claimText: a short (under 20 words) neutral restatement of what this specific source actually shows, for a human reviewer.

Return valid JSON only, matching this exact shape:
{
  "extractedEvidence": [
    {
      "resultIndex": 0,
      "exactModelMatch": true,
      "sourceType": "youtube",
      "approximateYear": 2022,
      "dateMeaning": "review_published",
      "ownershipAgeYears": null,
      "explicitlyNewProduct": false,
      "explicitlyDiscontinued": false,
      "claimText": "Exact-model review published approximately four years ago"
    }
  ]
}`;
}

/**
 * Validates and normalizes Gemini's raw extraction JSON into a safe shape.
 * Never trusts field values beyond type/enum checks — anything malformed is
 * dropped to a safe default rather than propagated into scoring.
 *
 * @param {object} parsed raw parsed JSON from Gemini
 * @param {number} evidenceItemCount
 */
export function normalizeExtractedEvidence(parsed, evidenceItemCount) {
  const items = Array.isArray(parsed?.extractedEvidence) ? parsed.extractedEvidence : [];
  return items
    .filter((item) => Number.isInteger(item?.resultIndex) && item.resultIndex >= 0 && item.resultIndex < evidenceItemCount)
    .map((item) => ({
      resultIndex: item.resultIndex,
      exactModelMatch: Boolean(item.exactModelMatch),
      sourceType: SOURCE_TYPES.has(item.sourceType) ? item.sourceType : 'other',
      approximateYear: Number.isInteger(item.approximateYear) ? item.approximateYear : null,
      dateMeaning: DATE_MEANINGS.has(item.dateMeaning) ? item.dateMeaning : 'unknown',
      ownershipAgeYears: Number.isFinite(item.ownershipAgeYears) && item.ownershipAgeYears >= 0 ? item.ownershipAgeYears : null,
      explicitlyNewProduct: Boolean(item.explicitlyNewProduct),
      explicitlyDiscontinued: Boolean(item.explicitlyDiscontinued),
      claimText: String(item.claimText || '').slice(0, 200),
    }));
}
