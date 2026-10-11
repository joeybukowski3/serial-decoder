import { makeGrounding } from './mock-transport.mjs';

// Illustrative mock research payloads. Model codes/specs are not verified product data.
export const fridgeGrounding = makeGrounding(['lg.com', 'bestbuy.com', 'geappliances.com', 'homedepot.com']);

const claim = (value, sources, subjectModel) => ({ value, sources, subjectModel });

/** Job A for the exact freestanding original "LG LRSOC2506S" (mock): manufacturer-backed KNOWN facts plus published dimensions. */
export const fridgeOriginalResearch = {
  original: {
    canonicalModel: { value: 'LRSOC2506S', sources: ['lg.com'] },
    possibleModels: [],
    facts: {
      totalCapacityCuFt: { value: 25, sources: ['lg.com'], subjectModel: 'LRSOC2506S' },
      installationType: { value: 'freestanding', sources: ['lg.com'], subjectModel: 'LRSOC2506S' },
      counterDepth: { value: false, sources: ['lg.com'], subjectModel: 'LRSOC2506S' },
      dispenser: { value: 'through-door', sources: ['lg.com'], subjectModel: 'LRSOC2506S' },
      iceMaker: { value: true, sources: ['lg.com'], subjectModel: 'LRSOC2506S' },
      finish: { value: 'Stainless Steel', sources: ['lg.com'], subjectModel: 'LRSOC2506S' },
      series: { value: 'Side-by-Side', sources: ['lg.com'], subjectModel: 'LRSOC2506S' },
      widthIn: { value: 35.75, sources: ['lg.com'], subjectModel: 'LRSOC2506S' },
      heightIn: { value: 69.5, sources: ['lg.com'], subjectModel: 'LRSOC2506S' },
      depthIn: { value: 33.5, sources: ['lg.com'], subjectModel: 'LRSOC2506S' },
    },
    tier: { value: 'PREMIUM', basis: 'MODEL_LINE', sources: ['lg.com'], subjectModel: 'LRSOC2506S' },
  },
};

export function fridgeCandidate({ model, brand = 'LG', domain = 'lg.com', capacity, configuration = 'side-by-side', tier = 'PREMIUM', series = 'Side-by-Side', width = 35.75, height = 69.9, depth = 33.5, clearance = 0.25, ...extra }) {
  const f = (value) => claim(value, [domain], model);
  return {
    brand, model, category: 'refrigerator', availability: 'CURRENT', condition: 'NEW',
    identitySources: [domain], relationship: 'SAME_BRAND_ALTERNATIVE', relationshipSources: [], relatedModel: null,
    facts: {
      totalCapacityCuFt: f(capacity), installationType: f('freestanding'), configurationFloor: f(configuration), counterDepth: f(false),
      dispenser: f('through-door'), iceMaker: f(true), finish: f('Stainless Steel'), series: f(series),
      widthIn: f(width), heightIn: f(height), depthIn: f(depth), clearanceWidthIn: f(clearance),
    },
    tier: { value: tier, basis: 'MODEL_LINE', sources: [domain], subjectModel: model },
    ...extra,
  };
}

export const comparableLg = fridgeCandidate({ model: 'LRSXC2606S', capacity: 25.5, providerRank: 1 });
export const largerLg = fridgeCandidate({ model: 'LRSXS2706S', capacity: 26.8, providerRank: 2 });
export const smallerLg = fridgeCandidate({ model: 'LRSOS2306S', capacity: 22, providerRank: 3 });
export const geAlternative = fridgeCandidate({ model: 'GSS25GYHFS', brand: 'GE', domain: 'geappliances.com', capacity: 25.3, tier: 'STANDARD', series: 'GE Side-by-Side', relationship: 'CROSS_BRAND_ALTERNATIVE', providerRank: 4 });
export const wrongConfiguration = fridgeCandidate({ model: 'LRTLS2403S', capacity: 24, configuration: 'top-freezer', providerRank: 5 });

/** Job B for "LG side-by-side refrigerator 25 cu ft" (broad: no exact original model, so no Job A call). */
export const fridgeCandidatesResearch = { candidates: [comparableLg, largerLg, smallerLg, geAlternative, wrongConfiguration] };
