import { getGeneralFamilyContext } from './family-registry.js';

const CATEGORY_HISTORY = {
  refrigerator: 'Modern household refrigeration developed through the late 1800s and became a mass-market home appliance during the early 1900s. The age of a specific refrigerator still requires a complete model or serial number.',
  laptop: 'Portable personal computers became commercially available in the early 1980s and evolved through many processor, display, and battery generations since. A category-only search cannot identify a specific generation; a complete brand and model number is needed.',
  computer: 'Personal computers have been sold across desktop and portable form factors since the 1970s, with many hardware generations along the way. A complete brand and model number is needed to identify a specific generation.',
  'desktop computer': 'Desktop personal computers have been sold since the 1970s across many hardware generations. A complete brand and model number is needed to identify a specific generation.',
  tablet: 'Modern slate tablet computers became a mainstream consumer category starting around 2010. A complete brand and model number is needed to identify a specific generation.',
  monitor: 'Computer displays have progressed from CRT to LCD, LED, and OLED technology across many decades. A complete brand and model number is needed to identify a specific generation.',
  washer: 'Powered washing machines emerged in the early 1900s and evolved through many mechanical and electronic generations. A specific unit cannot be dated from the category name alone.',
  dryer: 'Automatic clothes dryers became common household appliances during the mid-1900s. A complete brand and model number is needed for model-level timing.',
  dishwasher: 'Domestic dishwashers developed from late-1800s designs and became broadly adopted during the mid-1900s. Category history does not establish the age of a physical unit.',
  television: 'Electronic television systems developed during the early 1900s and entered mass consumer use in the mid-1900s. A model number is required to identify a product generation.',
  'water heater': 'Automatic storage water heaters developed during the late 1800s and early 1900s. A unit-specific manufacture date normally requires the serial number.',
  'air conditioner': 'Mechanical air conditioning was developed in the early 1900s and later adapted for residential use. Model and serial information are needed to date a specific system.',
  furnace: 'Residential furnaces span many fuel, control, and efficiency generations. A category-only search cannot establish a manufacture date.',
  'heat pump': 'Modern heat-pump systems developed through the 1900s and vary substantially by model generation. A complete model or serial is required for precise timing.',
  microwave: 'Microwave cooking technology entered commercial use in the mid-1900s and later became a common home appliance. A complete model identifies the relevant product generation.',
  generator: 'Generators span portable, standby, residential, and commercial product families. A complete model is required to identify an introduction or production window.',
  'electrical panel': 'Electrical service equipment has changed across many code and product generations. Manufacturer, model, and label information are needed to identify an era.',
};

// Per-family context for recognized marketing/retailer product descriptions.
// Keys include the brand because short family names are not globally unique.
const PRODUCT_FAMILY_CONTEXT = {
  'Samsung:Q60 Series': {
    displayName: 'Samsung Q60 Series TV',
    variantsNote: 'Samsung Q60 is a multi-year TV family. The exact model-year variant is not provided, so no single year is selected.',
    yearVariants: [
      { name: 'Q60R / Q60RA', year: 2019 },
      { name: 'Q60T', year: 2020 },
      { name: 'Q60A', year: 2021 },
      { name: 'Q60B', year: 2022 },
      { name: 'Q60C', year: 2023 },
      { name: 'Q60D', year: 2024 },
    ],
    exampleModels: ['QN65Q60RAFXZA', 'QN65Q60AAFXZA', 'QN65Q60DAFXZA'],
  },
  'LG:B3': {
    displayName: 'LG B3 OLED TV',
    familyContext: 'LG B3 is a model-year family commonly associated with the 2023 LG OLED B3 series. Exact screen sizes and regional models vary.',
    exampleModels: ['OLED55B3PUA', 'OLED65B3PUA', 'OLED77B3PUA'],
  },
  'LG:C2': {
    displayName: 'LG C2 OLED TV',
    familyContext: 'LG C2 is a model-year family commonly associated with the 2022 LG OLED C2 series. Exact screen sizes and regional models vary.',
    exampleModels: ['OLED42C2PUA', 'OLED55C2PUA', 'OLED65C2PUA'],
  },
  'LG:C3': {
    displayName: 'LG C3 OLED TV',
    familyContext: 'LG C3 is a model-year family commonly associated with the 2023 LG OLED C3 series. Exact screen sizes and regional models vary.',
    exampleModels: ['OLED42C3PUA', 'OLED48C3PUA', 'OLED55C3PUA', 'OLED65C3PUA', 'OLED77C3PUA', 'OLED83C3PUA'],
  },
  'LG:G3': {
    displayName: 'LG G3 OLED TV',
    familyContext: 'LG G3 is a model-year family commonly associated with the 2023 LG OLED G3 series. Exact screen sizes and regional models vary.',
    exampleModels: ['OLED55G3PUA', 'OLED65G3PUA', 'OLED77G3PUA'],
  },
};

// Progressive-specificity result for a brand not covered by the legacy
// LG/Samsung TV-only PRODUCT_FAMILY_CONTEXT map above -- i.e. anything
// recognized through GENERAL_FAMILY_SEEDS (family-registry.js). Distinct
// from buildProductFamilyResult's TV-specific branches below so those
// well-tested paths stay completely unchanged; dispatch happens in
// buildProductFamilyResult itself based on queryInfo.familyId.
function buildGeneralFamilyResult(queryInfo, tier) {
  const category = queryInfo.genericCategory || queryInfo.productType || 'product';
  const brand = queryInfo.brand || 'Unknown';
  const context = getGeneralFamilyContext(brand, queryInfo.familyId);
  const familyRange = context?.familyRange || null;
  const modelLineRange = (tier === 'model-line' && context?.modelLineRanges)
    ? context.modelLineRanges[queryInfo.modelLineId] || familyRange
    : null;
  const activeRange = modelLineRange || familyRange;

  let yearContext;
  if (activeRange && activeRange.start != null) {
    yearContext = activeRange.end != null
      ? {
          startYear: activeRange.start,
          endYear: activeRange.end,
          type: 'production-range',
          label: tier === 'model-line' ? 'Model-line production window' : 'Family production window',
          confidence: context?.confidence === 'low' ? 'low' : 'medium',
          source: 'local-seed',
          isExactUnitDate: false,
        }
      : {
          value: activeRange.start,
          type: 'market-introduction',
          label: tier === 'model-line' ? 'Model-line introduced' : 'Family launched',
          confidence: context?.confidence === 'low' ? 'low' : 'medium',
          source: 'local-seed',
          isExactUnitDate: false,
        };
  } else {
    yearContext = { type: 'unknown', label: 'Year context', confidence: 'partial', source: 'local-seed', isExactUnitDate: false };
  }

  const seriesLabel = tier === 'model-line' ? (queryInfo.recognizedSeries || queryInfo.seriesLine) : null;
  const displayName = context?.displayName || [brand, queryInfo.productFamily].filter(Boolean).join(' ');
  const contextLevel = tier === 'model-line' ? 'model-line' : 'product-family';
  const currentNote = activeRange?.current ? ' This family remains current, so no end year is asserted.' : '';
  const notesParts = [];
  notesParts.push(tier === 'model-line'
    ? `${seriesLabel || 'This model line'} is a recognized ${brand} model line within the ${queryInfo.productFamily} family; the exact configuration suffix was not provided, so specifications within this line may vary.${currentNote}`
    : `${brand} ${queryInfo.productFamily} is a recognized product family, not one exact configuration.${currentNote}`);
  if (context?.generationSummary?.length) {
    notesParts.push(`Known generations: ${context.generationSummary.join(' ')}`);
  }
  notesParts.push('This does not establish the manufacture date of an individual unit.');

  const refinementIdentifiers = context?.refinementIdentifiers || [];

  return {
    status: 'partial-success',
    outcome: tier === 'model-line' ? 'model-line-year-context' : 'product-family-year-context',
    resultType: tier === 'model-line' ? 'model-line-recognized' : 'product-family-recognized',
    brand,
    displayName,
    contextLevel,
    historicalContext: notesParts.join(' '),
    familyIntroductionYear: familyRange?.start || null,
    lineIntroductionYear: modelLineRange?.start || null,
    generationRange: activeRange
      ? (activeRange.end ? `${activeRange.start}-${activeRange.end}` : `${activeRange.start}-present`)
      : null,
    contextConfidence: context?.confidence || 'low',
    model: null,
    exactModel: null,
    itemCategory: category,
    category,
    specificityLevel: queryInfo.specificityLevel,
    productFamily: queryInfo.productFamily,
    seriesLine: seriesLabel || queryInfo.seriesLine || null,
    yearContext,
    yearVariants: [],
    isProductFamilyQuery: true,
    isMarketingDescription: true,
    needsExactModel: true,
    refinementSuggestion: refinementIdentifiers[0] || 'Enter the complete model number from the product label for model-level timing.',
    notes: notesParts.join(' '),
    evidence: [{ detail: `${queryInfo.productFamily} recognized from deterministic brand/family matching.`, source: 'Decode My Item deterministic classification' }],
    querySpecificity: queryInfo.querySpecificity,
    precisionLevel: tier === 'model-line' ? 'model-line-range' : 'family-range',
    confidenceLevel: context?.confidence || 'low',
    recognizedBrand: brand !== 'Unknown' ? brand : null,
    recognizedCategory: category,
    recognizedFamily: queryInfo.productFamily,
    recognizedSeries: seriesLabel || null,
    familyRange,
    modelLineRange: tier === 'model-line' ? modelLineRange : null,
    generationSummary: context?.generationSummary || [],
    refinementNeeded: true,
    refinementReason: tier === 'model-line'
      ? 'The configuration suffix was not provided, so this reflects the model line rather than one exact build.'
      : 'An exact model number was not provided, so this reflects the overall product family rather than one exact configuration.',
    recommendedIdentifiers: refinementIdentifiers,
  };
}

// Deterministic, provider-free clarification for a query with no usable
// product signal at all (empty, keyboard-mash, pure symbols). Distinct from
// every other branch in this file: those always recognized *something*
// (a brand, a category, or a family); this one recognized nothing and says
// so plainly instead of guessing.
function buildUnusableResult(queryInfo) {
  const recommendedIdentifiers = [
    'Enter the brand name.',
    'Enter the product category (for example washer, laptop, or water heater).',
    'Enter the complete model number from the product label.',
  ];
  return {
    status: 'unusable',
    outcome: 'unusable-query',
    resultType: 'unusable',
    brand: 'Unknown',
    model: null,
    itemCategory: null,
    category: null,
    specificityLevel: 'unknown',
    querySpecificity: 'unusable',
    precisionLevel: 'general-guidance',
    confidenceLevel: 'unknown',
    refinementNeeded: true,
    refinementReason: 'The search text did not contain a recognizable brand, category, or product description.',
    recommendedIdentifiers,
    refinementSuggestion: recommendedIdentifiers[0],
    notes: "We couldn't identify a physical product from this search.",
    evidence: [],
    // Always 'clarification' -- this result was never a researched estimate
    // of any kind, deterministic or AI-assisted.
    fallbackKind: 'clarification',
  };
}

function buildProductFamilyResult(queryInfo, specificityLevel) {
  if (queryInfo.familyId) {
    return buildGeneralFamilyResult(queryInfo, queryInfo.modelLineId ? 'model-line' : 'product-family');
  }
  const category = queryInfo.genericCategory || queryInfo.productType || 'product';
  const brand = queryInfo.brand || 'Unknown';
  const sizeText = queryInfo.screenSize ? `${queryInfo.screenSize}-inch ` : '';
  const exactModel = queryInfo.exactModel || null;
  const context = PRODUCT_FAMILY_CONTEXT[`${brand}:${queryInfo.productFamily}`];
  const familyYear = queryInfo.modelYearFamilyYear || null;
  const yearVariants = familyYear ? [] : (context?.yearVariants || []);
  const yearContext = familyYear
    ? {
        value: familyYear,
        type: 'model-year-family',
        label: 'Model-year family',
        confidence: 'high',
        source: 'local-seed',
        isExactUnitDate: false,
      }
    : yearVariants.length
      ? {
          startYear: yearVariants[0].year,
          endYear: yearVariants[yearVariants.length - 1].year,
          type: 'production-range',
          label: 'Model-year variants',
          confidence: 'high',
          source: 'local-seed',
          isExactUnitDate: false,
        }
      : {
          type: 'unknown',
          label: 'Year context',
          confidence: 'partial',
          source: 'local-seed',
          isExactUnitDate: false,
        };
  const notesParts = [];

  if (exactModel) {
    notesParts.push(`${exactModel} is an exact ${brand} ${queryInfo.seriesLine || queryInfo.productFamily} model number.`);
    if (queryInfo.modelYearFamilyLabel) {
      notesParts.push(`Product family context: ${queryInfo.modelYearFamilyLabel}; this does not establish the manufacture date of an individual TV.`);
    }
  } else if (brand === 'LG') {
    if (context?.familyContext) notesParts.push(context.familyContext);
    notesParts.push('This is not the exact manufacture date of an individual unit.');
  } else {
    notesParts.push(`This is a recognized ${brand} ${sizeText}${queryInfo.productFamily} ${category} description.`);
    if (queryInfo.modelYearFamilyLabel) notesParts.push(`Model-year family evidence: ${queryInfo.modelYearFamilyLabel}. The complete regional model number is still not provided.`);
    else if (context?.variantsNote) notesParts.push(context.variantsNote);
    notesParts.push('This does not establish the manufacture date of an individual unit.');
  }

  return {
    status: yearContext.type === 'unknown' ? 'partial' : 'partial-success',
    outcome: yearContext.type === 'unknown'
      ? 'product-recognized-year-unverified'
      : (exactModel ? 'exact-model-year-context' : 'product-family-year-context'),
    resultType: exactModel ? 'exact-model-insufficient' : 'product-family-recognized',
    brand,
    displayName: context?.displayName || null,
    model: exactModel,
    exactModel,
    itemCategory: category,
    category,
    specificityLevel,
    productFamily: queryInfo.productFamily,
    seriesLine: queryInfo.seriesLine || null,
    screenSize: queryInfo.screenSize || null,
    productType: queryInfo.productType || category,
    modelYearFamilyYear: queryInfo.modelYearFamilyYear || null,
    modelYearFamilyLabel: queryInfo.modelYearFamilyLabel || null,
    yearContext,
    yearVariants,
    isProductFamilyQuery: !exactModel,
    isMarketingDescription: !exactModel,
    needsExactModel: !exactModel,
    refinementSuggestion: exactModel
      ? 'Use the TV serial number for unit-specific manufacture dating.'
      : context && context.exampleModels.length && brand === 'LG'
        ? `For exact model details, look for ${context.exampleModels.join(', ')} on the rear label, box, receipt, or TV settings.`
        : context && context.exampleModels.length
          ? `Look for a model number like ${context.exampleModels.join(', ')} on the back label or in the TV settings.`
      : 'Enter the complete model number from the product label for model-level timing.',
    notes: notesParts.join(' '),
    evidence: [{ detail: `${queryInfo.productFamily} product-family identification from the description.`, source: 'Decode My Item deterministic classification' }],
  };
}

// Failure-time-only reserve for an exact-model age query.
//
// Deliberately NOT part of buildDeterministicBroadResult: that function feeds
// two fast paths in api/age-lookup.js (the "grounding disabled/ineligible, so
// this deterministic result IS the answer" short-circuit, and the post-local
// broadResult return). Returning an exact-model card from it would make every
// exact-model query answer "no verified production range" without ever
// consulting the local model database or the provider. This reserve is
// therefore consulted only by degradeToDeterministicFallback(), i.e. strictly
// after a provider attempt has already failed.
//
// It claims NO year. It confirms only the deterministic identification, states
// that the production window is unverified, and points at the serial number --
// the only evidence that can establish a unit manufacture date. Being strictly
// less assertive than any local-evidence or provider result, it can never
// overwrite stronger evidence.
export function buildExactModelReserveResult(queryInfo) {
  if (!queryInfo) return null;
  if (queryInfo.querySpecificity !== 'exact-model') return null;
  const exactModel = queryInfo.exactModel || queryInfo.modelIdentity;
  if (!exactModel) return null;

  const brand = queryInfo.brand || 'Unknown';
  const category = queryInfo.genericCategory || queryInfo.productType || null;
  const recommendedIdentifiers = [
    'Enter the serial number from the product label for a unit-specific manufacture date.',
    'Confirm every character of the model number, including any regional suffix characters.',
  ];

  return {
    brand,
    model: exactModel,
    exactModel,
    itemCategory: category,
    category,
    specificityLevel: queryInfo.specificityLevel || 'exact',
    productFamily: queryInfo.productFamily || null,
    yearContext: {
      type: 'unknown',
      label: 'Year context',
      confidence: 'partial',
      source: 'local-seed',
      isExactUnitDate: false,
    },
    refinementSuggestion: recommendedIdentifiers[0],
    notes: `${exactModel} was recognized as a complete ${brand}${category ? ` ${category}` : ''} model number, but no verified production range is available for it and live research did not finish. No manufacture year is estimated here.`,
    evidence: [{ detail: 'Exact model-number identification from the search text.', source: 'Decode My Item deterministic classification' }],
    querySpecificity: 'exact-model',
    precisionLevel: 'general-guidance',
    confidenceLevel: 'unknown',
    recognizedBrand: queryInfo.brand || null,
    recognizedCategory: category,
    recognizedModel: exactModel,
    recognizedFamily: queryInfo.productFamily || null,
    refinementNeeded: true,
    refinementReason: 'The model number was recognized, but no production-range evidence is available for it and live research did not finish.',
    recommendedIdentifiers,
  };
}

export function buildDeterministicBroadResult(queryInfo) {
  if (!queryInfo) return null;
  if (queryInfo.querySpecificity === 'unusable') {
    return buildUnusableResult(queryInfo);
  }
  if (queryInfo.brand === 'LG' && queryInfo.productFamily && queryInfo.exactModel) {
    return buildProductFamilyResult(queryInfo, 'specific');
  }
  if (queryInfo.specificityLevel === 'generic' && queryInfo.genericCategory) {
    const history = CATEGORY_HISTORY[queryInfo.genericCategory] || `This search describes the ${queryInfo.genericCategory} product category rather than one model.`;
    return {
      brand: 'Unknown',
      model: null,
      itemCategory: queryInfo.genericCategory,
      category: queryInfo.genericCategory,
      specificityLevel: 'generic',
      contextLevel: 'category-history',
      historicalContext: history,
      inventionSummary: history,
      refinementSuggestion: 'Enter the brand and complete model number for model introduction and production-range information.',
      notes: 'No individual manufacture date is assigned to a category-only search.',
      evidence: [{ detail: 'Category-level historical context only.', source: 'Decode My Item static category guidance' }],
      querySpecificity: 'category-only',
      precisionLevel: 'general-guidance',
      confidenceLevel: 'low',
      contextConfidence: 'low',
      refinementNeeded: true,
      refinementReason: 'The query names a product category, not a specific brand or model.',
      recommendedIdentifiers: [
        'Enter the brand name for brand/category history.',
        'Enter the complete model number from the product label for model-level timing.',
      ],
    };
  }

  if (queryInfo.specificityLevel === 'partial') {
    if (queryInfo.productFamily) return buildProductFamilyResult(queryInfo, 'partial');
    return {
      brand: queryInfo.brand || 'Unknown',
      model: queryInfo.modelIdentity || null,
      itemCategory: queryInfo.genericCategory || null,
      category: queryInfo.genericCategory || null,
      specificityLevel: 'partial',
      refinementSuggestion: 'Enter the complete model number, including all suffix and regional characters, for a model-level introduction and production window.',
      notes: 'The entered model token appears incomplete. Smart Lookup preserves the partial token and does not invent a complete model or exact date.',
      evidence: [{ detail: 'Partial model-token classification only.', source: 'Decode My Item deterministic classification' }],
      suggestedModelNumbers: [],
    };
  }

  if (queryInfo.specificityLevel === 'brand-only') {
    if (queryInfo.productFamily) return buildProductFamilyResult(queryInfo, 'brand-only');
    const category = queryInfo.genericCategory || 'property equipment';
    const recommendedIdentifiers = [
      'Enter the complete model number from the product label.',
      'Enter the serial number for a unit-specific manufacture date.',
    ];
    return {
      brand: queryInfo.brand || 'Unknown',
      model: null,
      itemCategory: category,
      category,
      specificityLevel: 'brand-only',
      refinementSuggestion: recommendedIdentifiers[0],
      notes: `${queryInfo.brand || 'This brand'} produces multiple ${category} product generations, so a brand-only search cannot establish a model introduction year or an individual manufacture date.`,
      evidence: [{ detail: 'Brand/category identification only.', source: 'Decode My Item deterministic classification' }],
      // Progressive-specificity fields for the brand-category deterministic
      // path -- see docs/smart-lookup-architecture.md "Progressive
      // specificity" (brand-category grounded eligibility).
      querySpecificity: queryInfo.querySpecificity,
      precisionLevel: queryInfo.querySpecificity === 'brand-only' ? 'general-guidance' : 'broad-range',
      confidenceLevel: 'low',
      recognizedBrand: queryInfo.brand || null,
      recognizedCategory: queryInfo.genericCategory || null,
      refinementNeeded: true,
      refinementReason: queryInfo.querySpecificity === 'brand-only'
        ? 'No product category or model number was provided, so this reflects brand-level guidance only.'
        : 'No model number was provided, so this reflects general brand and category information rather than one specific product.',
      recommendedIdentifiers,
    };
  }

  return null;
}
