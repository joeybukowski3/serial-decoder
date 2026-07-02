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

export function buildDeterministicBroadResult(queryInfo) {
  if (!queryInfo) return null;
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
