import { getGeneralFamilyContext } from './family-registry.js';

// Deterministic, provider-free replacement guidance for a recognized
// model-line/product-family/brand-category query when grounded and
// ungrounded provider research both failed within the route deadline
// (Phase 8 -- see docs/smart-lookup-architecture.md "Progressive LKQ
// degradation"). Mirrors the age-lookup deterministic-broad-result ladder
// (`lib/smart-lookup/static-results.js#buildDeterministicBroadResult`):
// a recognized identity always has a safe, instant, non-empty answer in
// reserve, even when every network call fails. Returns a "raw" object in
// the same shape the grounded/ungrounded provider prompts return, so it
// flows through the exact same `normalizeReplacementResult` validation and
// safeguards as a real provider response -- this function never needs to
// duplicate those rules.
export function buildDeterministicReplacementResult(queryInfo) {
  if (!queryInfo) return null;
  if (!['model-line', 'product-family', 'brand-category'].includes(queryInfo.querySpecificity)) return null;
  const brand = queryInfo.brand || queryInfo.recognizedBrand;
  if (!brand) return null;

  const category = queryInfo.genericCategory || queryInfo.productType || queryInfo.productRole || 'product';
  const familyContext = queryInfo.familyId ? getGeneralFamilyContext(brand, queryInfo.familyId) : null;
  const isModelLine = queryInfo.querySpecificity === 'model-line';
  const isProductFamily = queryInfo.querySpecificity === 'product-family';
  const tierLabel = isModelLine
    ? (queryInfo.recognizedSeries || queryInfo.modelLineName || [brand, queryInfo.productFamily].filter(Boolean).join(' '))
    : (queryInfo.productFamily ? `${brand} ${queryInfo.productFamily}` : `${brand} ${category}`);

  const knownConfigurationVariants = queryInfo.knownConfigurationVariants?.length
    ? queryInfo.knownConfigurationVariants
    : (familyContext?.configurationVariants || []);
  const comparisonCriteria = queryInfo.comparisonCriteria?.length
    ? queryInfo.comparisonCriteria
    : (familyContext?.comparisonCriteria || []);
  const recommendedMinimumSpecs = queryInfo.recommendedMinimumSpecs?.length
    ? queryInfo.recommendedMinimumSpecs
    : (familyContext?.recommendedMinimumSpecs || []);
  const recommendedIdentifiers = queryInfo.refinementIdentifiers?.length
    ? queryInfo.refinementIdentifiers
    : (familyContext?.refinementIdentifiers || []);

  const descriptionParts = [];
  if (isModelLine) {
    descriptionParts.push(`Recognized as a ${brand} ${category}${queryInfo.productFamily ? ` (${queryInfo.productFamily} family)` : ''}.`);
    descriptionParts.push(`${tierLabel} was sold across multiple chassis sizes and internal configurations, so the original configuration varies.`);
  } else if (isProductFamily) {
    descriptionParts.push(`Recognized as a ${brand} ${queryInfo.productFamily} ${category}, not one exact model.`);
    descriptionParts.push('Original configuration varies across this product family.');
  } else {
    descriptionParts.push(`Recognized brand (${brand}) and category (${category}) only; no specific model line was identified.`);
  }
  if (queryInfo.formFactorLabel) {
    descriptionParts.push(`Chassis/form-factor hint detected: ${queryInfo.formFactorLabel}. This narrows the physical chassis only -- internal configuration still varies.`);
  }

  return {
    itemSummary: {
      name: [brand, tierLabel].filter(Boolean).join(' '),
      brand,
      model: isModelLine ? (queryInfo.modelIdentity || null) : null,
      category,
      description: descriptionParts.join(' '),
      availability: 'Availability Unconfirmed',
    },
    specLabels: [],
    originalSpecs: {},
    successorStatus: {
      type: 'none',
      name: null,
      model: null,
      explanation: 'No single original configuration was identified, so no specific successor can be named.',
    },
    replacementOptions: [],
    replacementRelationship: 'none-found',
    replacementRationale: comparisonCriteria.length
      ? 'Live replacement research did not complete. Compare candidates against the criteria below rather than assuming one exact original build; supply the form factor and exact specifications for a more precise recommendation.'
      : 'Live replacement research did not complete, and no specific original configuration was identified.',
    replacement: null,
    replacementCandidates: [],
    replacementSpecs: {},
    materialDifferences: [],
    compatibilityStatus: 'unknown',
    compatibilityWarnings: knownConfigurationVariants.length
      ? ['Physical/chassis compatibility is unconfirmed until the form factor is provided.']
      : [],
    originalIdentity: {
      brand,
      family: queryInfo.productFamily || null,
      modelLine: isModelLine ? tierLabel : null,
      category,
      formFactor: queryInfo.formFactorLabel || null,
    },
    knownConfigurationVariants,
    comparisonCriteria,
    recommendedMinimumSpecs,
    recommendedIdentifiers,
    unknownOriginalSpecs: ['Processor', 'Installed RAM', 'Storage type and capacity', 'Graphics capability', 'Display outputs', 'Expansion-card requirements'],
    assumptions: [
      'The original configuration may vary; no processor, RAM, storage, graphics, chassis size, power supply, port selection, or expansion capacity is assumed beyond what was provided.',
    ],
    refinementNeeded: true,
  };
}
