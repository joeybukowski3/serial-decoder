// Shared structured-output contract for Smart Lookup age research providers.
// Keep permissive: providers may omit unsupported fields rather than inventing
// values to satisfy a required schema.
export const AGE_RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  properties: {
    brand: { type: ['string', 'null'] },
    model: { type: ['string', 'null'] },
    likelyProduct: { type: ['string', 'null'] },
    productType: { type: ['string', 'null'] },
    specificityLevel: { type: ['string', 'null'] },
    contextLevel: { type: ['string', 'null'] },
    historicalContext: { type: ['string', 'null'] },
    categoryEntryYear: { type: ['integer', 'null'] },
    familyIntroductionYear: { type: ['integer', 'null'] },
    lineIntroductionYear: { type: ['integer', 'null'] },
    generationRange: { type: ['string', 'null'] },
    contextConfidence: { type: ['string', 'null'] },
    refinementNeeded: { type: ['boolean', 'null'] },
    refinementSuggestion: { type: ['string', 'null'] },
    introductionYear: { type: ['integer', 'null'] },
    releaseDate: { type: ['string', 'null'] },
    productionRange: {
      type: ['object', 'null'],
      additionalProperties: true,
      properties: {
        start: { type: ['integer', 'null'] },
        end: { type: ['integer', 'null'] },
        basis: { type: ['string', 'null'] },
      },
    },
    estimatedEra: { type: ['string', 'null'] },
    identityConfidence: { type: ['string', 'null'] },
    timingConfidence: { type: ['string', 'null'] },
    individualUnitDateAvailable: { type: ['boolean', 'null'] },
    serialNeededForExactUnitDate: { type: ['boolean', 'null'] },
    notes: { type: ['string', 'null'] },
    evidence: {
      type: ['array', 'null'],
      items: {
        type: 'object',
        additionalProperties: true,
        properties: { detail: { type: ['string', 'null'] }, source: { type: ['string', 'null'] } },
      },
    },
    assumptions: { type: ['array', 'null'], items: { type: 'string' } },
    caveats: { type: ['array', 'null'], items: { type: 'string' } },
    alternativeMatches: {
      type: ['array', 'null'],
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          product: { type: ['string', 'null'] },
          reason: { type: ['string', 'null'] },
          confidence: { type: ['string', 'null'] },
        },
      },
    },
    suggestedModelNumbers: { type: ['array', 'null'], items: { type: 'string' } },
  },
};
