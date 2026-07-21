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
// Category-scoped comparison criteria for an exact-model deterministic card.
// Deliberately generic and non-committal: these describe what a buyer should
// compare, never what the original unit actually is, so they cannot assert an
// unverified specification. Falls back to a category-agnostic list.
const EXACT_MODEL_COMPARISON_CRITERIA = {
  television: ['Screen size (diagonal)', 'Panel technology and resolution', 'Refresh rate', 'HDMI/input count and version', 'Mounting pattern (VESA)'],
  washer: ['Load capacity (cu. ft.)', 'Load orientation (front-load vs top-load)', 'Cabinet width, depth, and height', 'Stacking compatibility', 'Electrical and water hookup requirements'],
  dryer: ['Load capacity (cu. ft.)', 'Fuel type (electric vs gas)', 'Cabinet width, depth, and height', 'Venting configuration', 'Stacking compatibility'],
  refrigerator: ['Total capacity (cu. ft.)', 'Door configuration', 'Cabinet width, depth, and height', 'Water/ice hookup requirements', 'Counter-depth vs standard-depth'],
  dishwasher: ['Cabinet opening width', 'Place-setting capacity', 'Tub material', 'Electrical and plumbing hookup requirements'],
  'water heater': ['Tank capacity (gallons)', 'Fuel type', 'First-hour rating / recovery rate', 'Physical footprint and venting', 'Energy factor'],
  'air conditioner': ['Cooling capacity (tons / BTU)', 'Efficiency rating (SEER/SEER2)', 'Refrigerant type', 'Electrical requirements', 'Matched indoor coil compatibility'],
  'desktop computer': ['Processor class', 'Installed RAM', 'Storage type and capacity', 'Chassis form factor', 'Display outputs and expansion slots'],
  laptop: ['Processor class', 'Installed RAM', 'Storage type and capacity', 'Display size and resolution', 'Graphics capability'],
};

const GENERIC_COMPARISON_CRITERIA = [
  'Physical dimensions and installation footprint',
  'Capacity or performance rating',
  'Electrical, plumbing, or connection requirements',
  'Feature set relative to the original unit',
];

// An exact-model (or exact-configuration) query is the tier where identity is
// best known, yet it was previously the ONLY tier with no deterministic
// reserve -- so a replacement-research timeout rendered an empty panel for a
// fully identified product (the demonstrated Samsung QN65Q60RAFXZA / LG
// WM3900HWA production failure). This card asserts strictly less than any
// provider path: it confirms only the identity the deterministic classifier
// already established, names no successor, and carries no pricing and no
// sources. `normalizeReplacementResult` derives `configurationUnknown` from
// identity exactness itself, so nothing here needs to restate it.
function buildExactModelReplacementFallback(queryInfo, brand) {
  const category = queryInfo.genericCategory || queryInfo.productType || queryInfo.productRole || null;
  const model = queryInfo.modelIdentity || queryInfo.exactModel || null;
  if (!model) return null;

  const comparisonCriteria = queryInfo.comparisonCriteria?.length
    ? queryInfo.comparisonCriteria
    : ((category && EXACT_MODEL_COMPARISON_CRITERIA[category]) || GENERIC_COMPARISON_CRITERIA);

  const descriptionParts = [
    `Recognized as a specific ${brand} model${category ? ` (${category})` : ''}: ${model}.`,
    'Live replacement research did not complete in time, so no replacement product is named here.',
    'The identification above is deterministic and does not depend on that research.',
  ];

  return {
    itemSummary: {
      name: [brand, model].filter(Boolean).join(' '),
      brand,
      model,
      category: category || 'product',
      description: descriptionParts.join(' '),
      availability: 'Availability Unconfirmed',
    },
    specLabels: [],
    originalSpecs: {},
    successorStatus: {
      type: 'none',
      name: null,
      model: null,
      explanation: 'Replacement research did not complete, so no successor is claimed for this model.',
    },
    replacementOptions: [],
    replacementRelationship: 'none-found',
    replacementRationale: 'Replacement research did not complete within the request budget. The model identification is unaffected; retry for replacement candidates, or compare options against the criteria below.',
    replacement: null,
    replacementCandidates: [],
    replacementSpecs: {},
    materialDifferences: [],
    compatibilityStatus: 'unknown',
    compatibilityWarnings: [],
    originalIdentity: {
      brand,
      family: queryInfo.productFamily || null,
      modelLine: queryInfo.modelLineName || null,
      category: category || null,
      formFactor: queryInfo.formFactorLabel || null,
    },
    knownConfigurationVariants: [],
    comparisonCriteria,
    recommendedMinimumSpecs: [],
    recommendedIdentifiers: [],
    unknownOriginalSpecs: [],
    assumptions: [],
    // Identity is complete for this tier; the gap is the research, not the
    // input, so this card must not ask the user for more identifiers.
    refinementNeeded: false,
  };
}

export function buildDeterministicReplacementResult(queryInfo) {
  if (!queryInfo) return null;
  const brand = queryInfo.brand || queryInfo.recognizedBrand;
  if (queryInfo.querySpecificity === 'exact-model') {
    return brand ? buildExactModelReplacementFallback(queryInfo, brand) : null;
  }
  if (!['model-line', 'product-family', 'brand-category'].includes(queryInfo.querySpecificity)) return null;
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
