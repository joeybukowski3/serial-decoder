const known = (value) => ({ status: 'KNOWN', value, evidenceRefs: ['fixture-spec'] });

function draft(category, candidateId, values, relationship = 'SAME_BRAND_ALTERNATIVE', discoveryConfidence = 'HIGH') {
  return {
    candidateId,
    category,
    facts: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, known(value)])),
    source: { kind: 'FIXTURE', name: 'static candidate pool' },
    relationship,
    discoveryConfidence,
    evidenceRefs: ['fixture-spec'],
    providerRank: null,
  };
}

const tv = (id, model, brand, size, tier, display, overrides = {}) => draft('television', id, {
  model, brand, screenSizeIn: size, resolution: '4K', tier, physicalFit: true,
  displayTechnology: display, refreshHz: 120, smart: true, hdr: 'HDR10+',
  series: 'Q80 Series', featurePackage: 'premium-picture', ...overrides,
});

export const televisionPool = Object.freeze([
  tv('tv-samsung-qled-55', 'SAMSUNG-QLED-55', 'Samsung', 55, 'PREMIUM', 'QLED'),
  tv('tv-samsung-qled-50', 'SAMSUNG-QLED-50', 'Samsung', 50, 'PREMIUM', 'QLED'),
  { ...tv('tv-samsung-led-standard', 'SAMSUNG-LED-55', 'Samsung', 55, 'STANDARD', 'LED'), discoveryConfidence: 'LOW' },
  tv('tv-samsung-neo-55', 'SAMSUNG-NEO-55', 'Samsung', 55, 'LUXURY', 'NEO QLED', { series: 'QN90 Series' }),
  tv('tv-sony-qled-55', 'SONY-QLED-55', 'Sony', 55, 'PREMIUM', 'QLED', { series: 'Bravia Series' }),
]);

const refrigerator = (id, model, brand, capacity, configuration, overrides = {}) => draft('refrigerator', id, {
  model, brand, totalCapacityCuFt: capacity, installationType: 'freestanding', physicalFit: true,
  tier: 'PREMIUM', configurationFloor: configuration, layout: configuration,
  counterDepth: false, capacityBalance: 'standard-split', dispenser: 'through-door',
  iceMaker: true, finish: 'stainless', featurePackage: 'premium', ...overrides,
});

export const refrigeratorPool = Object.freeze([
  refrigerator('fridge-lg-sbs-25', 'LG-SBS-25', 'LG', 25, 'side-by-side'),
  { ...refrigerator('fridge-lg-sbs-24', 'LG-SBS-24', 'LG', 24, 'side-by-side'), discoveryConfidence: 'LOW' },
  refrigerator('fridge-lg-sbs-30', 'LG-SBS-30', 'LG', 30, 'side-by-side'),
  refrigerator('fridge-lg-top-freezer', 'LG-TOP-25', 'LG', 25, 'top-freezer'),
  refrigerator('fridge-ge-sbs-25', 'GE-SBS-25', 'GE', 25, 'side-by-side'),
]);

export { draft, tv, refrigerator };
