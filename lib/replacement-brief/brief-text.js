/**
 * Fixed vocabulary and wording for the research brief. Every sentence a customer can read is either defined here or built
 * from profile labels and evaluator output; nothing researched is passed through as prose.
 */

export const BRIEF_VERSION = '1.0.0';
export const VERIFICATION_LEVEL = 'PROVISIONAL';
export const SUPPORTED_CATEGORIES = Object.freeze(['television', 'refrigerator']);
export const BRIEF_STATUS = Object.freeze({ COMPLETE: 'COMPLETE', PARTIAL: 'PARTIAL', GUIDANCE_ONLY: 'GUIDANCE_ONLY', UNSUPPORTED: 'UNSUPPORTED' });

/** There is deliberately no VERIFIED: a grounded source domain alone never proves a specification. */
export const FACT_STATUS = Object.freeze(['PROVIDED', 'REPORTED', 'INFERRED', 'ASSUMED', 'AMBIGUOUS', 'UNKNOWN']);

/** PROVIDED = the user entered it. REPORTED = a cited search source states it (domain-level, page not checked). */
export function briefFactStatus(entry, researchEvidenceIds) {
  const status = entry?.status;
  if (status === 'KNOWN') return (entry.evidenceRefs || []).some((id) => researchEvidenceIds.has(id)) ? 'REPORTED' : 'PROVIDED';
  if (status === 'INFERRED' || status === 'ASSUMED' || status === 'AMBIGUOUS') return status;
  return 'UNKNOWN';
}

const WARNINGS = Object.freeze({
  PROVISIONAL_RESULTS: ['WARNING', 'Suggestions are based on reported specifications that have not been checked against the product pages. Availability and price were not checked.'],
  RESEARCH_UNAVAILABLE: ['WARNING', 'Live research could not be completed, so this guidance is general rather than specific to your product.'],
  RESEARCH_UNGROUNDED: ['WARNING', 'The research returned no usable search sources, so the specifications below are unconfirmed.'],
  ORIGINAL_UNVERIFIED: ['WARNING', 'The original product could not be confirmed from the sources found.'],
  NO_CANDIDATES_FOUND: ['WARNING', 'No replacement models could be confirmed as current.'],
  SOURCE_CONFLICT: ['WARNING', 'A reported specification differs from what you entered. Your value was kept.'],
  MODEL_AMBIGUOUS: ['WARNING', 'More than one model matches what you entered. Confirm the exact model.'],
  UNSOURCED_SUGGESTION: ['WARNING', 'At least one suggestion could not be tied to a search source. Confirm that the model exists.'],
  WEAK_SOURCE_SUGGESTION: ['WARNING', 'At least one suggestion was found only through a source that is not its manufacturer or a known retailer, or its details are only partly sourced. Confirm the model on the manufacturer site.'],
  CLOSEST_ALTERNATIVE: ['WARNING', 'Not enough models meet every required specification, so some alternatives are the closest options found. Each lists the requirement it does not meet.'],
  CANDIDATES_NOT_COMPARED: ['INFO', 'More models were found than are compared. The lowest-ranked ones are listed as ruled out.'],
  EVALUATION_FAILED: ['WARNING', 'Some of the models found could not be compared with the original, so this list may be incomplete.'],
  NO_STRICT_MATCH: ['BLOCKING', 'No model found meets every required specification. The suggestion shown is the closest option, not an equivalent.'],
  NOTE_NOT_SCORED: ['INFO', 'Part of your notes was recorded but is not included in the comparison.'],
  UNSUPPORTED_CATEGORY: ['BLOCKING', 'Research is available for televisions and refrigerators only.'],
  INVALID_REQUEST: ['BLOCKING', 'Enter a brand and model, or a short description of a television or refrigerator.'],
});

/** Lower-cases ordinary capitalised words of a rule label for use mid-sentence, keeping acronyms ("Smart TV functionality" -> "smart TV functionality"). */
export const plainLabel = (label) => String(label).replace(/\b([A-Z])([a-z]+)\b/g, (_, first, rest) => `${first.toLowerCase()}${rest}`);

export function warning(code) {
  const [severity, message] = WARNINGS[code];
  return { code, severity, message };
}

export const RELATIONSHIP_TEXT = Object.freeze({
  DIRECT_SUCCESSOR: 'Reported as the successor to the original model',
  SAME_SERIES: 'Same series as the original',
  SAME_BRAND_ALTERNATIVE: 'Same brand as the original',
  CROSS_BRAND_ALTERNATIVE: 'Different brand with comparable reported specifications',
  FUNCTIONAL_EQUIVALENT: 'Functionally comparable to the original',
});

/** Customer-facing match levels. The evaluator's own classification stays internal; nothing here says "verified". */
export const MATCH_LEVEL = Object.freeze({
  LKQ: ['MEETS_REPORTED', 'Appears to meet the required specifications (reported, not verified)'],
  ABOVE_LKQ: ['EXCEEDS_REPORTED', 'Appears to meet the required specifications and exceed some (reported, not verified)'],
  CLOSE_MATCH: ['CLOSE_MATCH', 'Close match with meaningful differences (reported, not verified)'],
  UNCONFIRMED: ['UNCONFIRMED', 'Not enough confirmed information to say'],
  NOT_LKQ: ['CLOSEST_OPTION', 'Closest option found: does not meet a required specification'],
});
export const MATCH_LEVELS = Object.freeze(Object.values(MATCH_LEVEL).map(([level]) => level));
export const CLOSEST_ROLE = 'CLOSEST_OPTION';
export const CLOSEST_ROLE_LABEL = 'Closest option (does not meet a requirement)';

/** How well the cited sources tie a suggestion to a real model. Domain-level: no product page is opened. */
export const SOURCE_STRENGTH = Object.freeze({ STRONG: 'STRONG', WEAK: 'WEAK', NONE: 'NONE' });

export const SOURCE_NOTE = Object.freeze({
  STRONG: 'A manufacturer or known-retailer domain was cited for this model. The product page was not opened, so its existence and specifications are reported, not confirmed.',
  WEAK: "Found only through a source that is not its manufacturer or a known retailer, or only partly sourced. Confirm the model on the manufacturer's site.",
  NONE: 'No source could be tied to this model. Confirm that it exists.',
});

export const COMPARISON_TEXT = Object.freeze({
  MATCH: 'Reported to match', EXCEEDS: 'Reported higher than the original', DIFFERS: 'Reported different from the original',
  FAIL: 'Does not meet the requirement', UNKNOWN: 'Not enough information', ASSUMED: 'Assumed, not reported', VERIFY: 'Needs checking',
});

export const MATCH_SUMMARY = Object.freeze({
  LKQ: 'Reported specifications appear to meet every required item. They have not been checked against the product pages.',
  ABOVE_LKQ: 'Reported specifications appear to meet the requirements and exceed the original in some areas.',
  CLOSE_MATCH: 'A close match with meaningful differences, based on reported specifications.',
  UNCONFIRMED: 'Not enough confirmed information to say whether this meets the requirements.',
  NOT_LKQ: 'Does not meet one or more required specifications. Shown as the closest option found.',
});

export const RULED_OUT_TEXT = Object.freeze({
  KNOWN_HARD_FAILURE: 'Does not meet a required specification',
  SEVERE_STRONG_LOSSES: 'Loses too many important features compared with the original',
  BELOW_QUALITY_FLOOR: 'Less well supported than the top suggestion',
  LOWER_FAMILY_THAN_PRIMARY: 'A lower product line than the top suggestion',
  LESS_DEFENSIBLE_THAN_PRIMARY: 'Less well supported than the top suggestion',
  INFERIOR_SIMILARITY: 'Less similar to the original than the top suggestion',
  NO_MEANINGFUL_DISTINCTION: 'Too similar to another suggestion to be worth listing',
  USER_FACING_LIMIT: 'Another option ranked higher',
  NOT_CURRENT_NEW_RETAIL: 'Reported as discontinued, used or sold only through marketplaces',
  EVALUATION_FAILED: 'Could not be compared with the original',
  ORIGINAL_MODEL: 'This is the model you already have',
  POOL_LIMIT_APPLIED: 'Found, but ranked below the models compared',
});

export const AVAILABILITY_NOTE = 'Availability, condition and price were not checked. Confirm the model is sold new before relying on it.';
