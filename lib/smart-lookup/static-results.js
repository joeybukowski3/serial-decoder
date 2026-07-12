const CATEGORY_HISTORY = {
  refrigerator: 'Modern household refrigeration developed through the late 1800s and became a mass-market home appliance during the early 1900s. The age of a specific refrigerator still requires a complete model or serial number.',
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

function buildProductFamilyResult(queryInfo, specificityLevel) {
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

export function buildDeterministicBroadResult(queryInfo) {
  if (!queryInfo) return null;
  if (queryInfo.brand === 'LG' && queryInfo.productFamily && queryInfo.exactModel) {
    return buildProductFamilyResult(queryInfo, 'specific');
  }
  if (queryInfo.specificityLevel === 'generic' && queryInfo.genericCategory) {
    return {
      brand: 'Unknown',
      model: null,
      itemCategory: queryInfo.genericCategory,
      category: queryInfo.genericCategory,
      specificityLevel: 'generic',
      inventionSummary: CATEGORY_HISTORY[queryInfo.genericCategory] || `This search describes the ${queryInfo.genericCategory} product category rather than one model.`,
      refinementSuggestion: 'Enter the brand and complete model number for model introduction and production-range information.',
      notes: 'No individual manufacture date is assigned to a category-only search.',
      evidence: [{ detail: 'Category-level historical context only.', source: 'Decode My Item static category guidance' }],
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
    return {
      brand: queryInfo.brand || 'Unknown',
      model: null,
      itemCategory: category,
      category,
      specificityLevel: 'brand-only',
      refinementSuggestion: 'Enter the complete model number from the product label for model-level timing.',
      notes: `${queryInfo.brand || 'This brand'} produces multiple ${category} product generations, so a brand-only search cannot establish a model introduction year or an individual manufacture date.`,
      evidence: [{ detail: 'Brand/category identification only.', source: 'Decode My Item deterministic classification' }],
    };
  }

  return null;
}
