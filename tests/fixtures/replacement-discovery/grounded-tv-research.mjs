import { makeGrounding } from './mock-transport.mjs';

// Illustrative mock research payloads. Model codes/specs are not verified product data.
export const tvGrounding = makeGrounding(['samsung.com', 'bestbuy.com', 'rtings.com', 'hisense-usa.com', 'homedepot.com']);

const claim = (value, sources, subjectModel) => ({ value, sources, subjectModel });

/** Job A for the partial token "Samsung QN55Q80": the provider cannot pin one model, so it is AMBIGUOUS. */
export const tvOriginalResearch = {
  original: {
    canonicalModel: { value: null, sources: [] },
    possibleModels: ['QN55Q80B', 'QN55Q80C'],
    facts: {
      resolution: claim('4K', ['samsung.com'], 'QN55Q80C'),
      displayTechnology: claim('QLED', ['samsung.com'], 'QN55Q80C'),
      refreshHz: claim(120, ['samsung.com'], 'QN55Q80C'),
      smart: claim(true, ['samsung.com', 'bestbuy.com'], 'QN55Q80C'),
      hdr: claim('HDR10+', ['rtings.com'], 'QN55Q80C'),
    },
    tier: { value: 'PREMIUM', basis: 'MODEL_LINE', sources: ['samsung.com'], subjectModel: 'QN55Q80C' },
  },
};

/** Job A for the FULL token "Samsung QN55Q80C": nothing is ambiguous, so facts are manufacturer-backed KNOWN. */
export const tvOriginalResearchExact = {
  original: {
    canonicalModel: { value: 'QN55Q80C', sources: ['samsung.com'] },
    possibleModels: [],
    facts: {
      resolution: claim('4K', ['samsung.com'], 'QN55Q80C'),
      displayTechnology: claim('QLED', ['samsung.com'], 'QN55Q80C'),
      refreshHz: claim(120, ['samsung.com'], 'QN55Q80C'),
      smart: claim(true, ['samsung.com'], 'QN55Q80C'),
      hdr: claim('HDR10+', ['samsung.com'], 'QN55Q80C'),
      widthIn: claim(48.4, ['samsung.com'], 'QN55Q80C'),
      heightIn: claim(27.8, ['samsung.com'], 'QN55Q80C'),
      mountPattern: claim('300x300', ['samsung.com'], 'QN55Q80C'),
    },
    tier: { value: 'PREMIUM', basis: 'MODEL_LINE', sources: ['samsung.com'], subjectModel: 'QN55Q80C' },
  },
};

export function tvCandidate({ model, brand = 'Samsung', domain = 'samsung.com', size = 55, display = 'QLED', refresh = 120, hdr = 'HDR10+', resolution = '4K', series = 'Q80 Series', tier = 'PREMIUM', width = 48.4, height = 27.8, mount = '300x300', ...extra }) {
  const f = (value) => claim(value, [domain], model);
  return {
    brand, model, category: 'television', availability: 'CURRENT', condition: 'NEW',
    identitySources: [domain], relationship: 'SAME_BRAND_ALTERNATIVE', relationshipSources: [], relatedModel: null,
    facts: { screenSizeIn: f(size), resolution: f(resolution), displayTechnology: f(display), refreshHz: f(refresh), smart: f(true), hdr: f(hdr), series: f(series), widthIn: f(width), heightIn: f(height), mountPattern: f(mount) },
    tier: { value: tier, basis: 'MODEL_LINE', sources: [domain], subjectModel: model },
    ...extra,
  };
}

export const currentQled55 = tvCandidate({
  model: 'QN55Q80D', relationship: 'DIRECT_SUCCESSOR', relationshipSources: ['samsung.com'], relatedModel: 'QN55Q80C', providerRank: 2,
});
export const smaller50 = tvCandidate({ model: 'QN50Q60D', size: 50, series: 'Q60 Series', providerRank: 1, lkq: true, classification: 'LKQ', score: 99, price: 499 });
export const crossBrand = tvCandidate({
  model: 'U8N-55', brand: 'Hisense', domain: 'hisense-usa.com', series: 'U8 Series', relationship: 'CROSS_BRAND_ALTERNATIVE', providerRank: 4,
});
export const lowerTier = tvCandidate({ model: 'UN55DU7200', display: 'LED', refresh: 60, series: 'Crystal UHD', tier: 'STANDARD', providerRank: 5 });
export const neoQled = tvCandidate({ model: 'QN55QN90D', display: 'NEO QLED', series: 'QN90 Series', tier: 'UPPER_PREMIUM', providerRank: 3 });
export const discontinued = tvCandidate({ model: 'QN55Q80B', availability: 'DISCONTINUED', providerRank: 6 });

/** Job B for the exact-model scenario: five usable candidates plus one discontinued model, in provider (not policy) order. */
export const tvCandidatesResearch = { candidates: [smaller50, currentQled55, neoQled, crossBrand, lowerTier, discontinued] };

// ---------------------------------------------------------------- grounding / size / unsourced-fallback fixtures
/** Gemini returned no groundingMetadata at all (what the third live smoke saw). */
export const noGrounding = { sources: [], searchQueryCount: 0 };

/** A candidate whose facts carry NO sources, exactly like an ungrounded provider answer: every researched fact becomes ASSUMED. */
export function unsourcedTv({ model, brand = 'Samsung', size = 55, display = 'QLED', series = 'Q80 Series', ...extra }) {
  const bare = (value) => ({ value });
  return {
    brand, model, category: 'television', availability: 'CURRENT', condition: 'NEW', identitySources: [], relationship: 'SAME_BRAND_ALTERNATIVE', relationshipSources: [], relatedModel: null,
    facts: { screenSizeIn: bare(size), resolution: bare('4K'), displayTechnology: bare(display), refreshHz: bare(120), smart: bare(true), hdr: bare('HDR10+'), series: bare(series) },
    ...extra,
  };
}

/** The "55 Samsung QLED TV" fallback pool: same brand/display/size, cross brand, different display, and an unnecessary 65-inch premium upgrade. */
export const unsourcedPool = {
  sameBrandSameDisplay: unsourcedTv({ model: 'QN55Q80XA' }),
  crossBrand: unsourcedTv({ model: 'K-55XR70', brand: 'Sony', series: 'Bravia 7' }),
  sameBrandLed: unsourcedTv({ model: 'UN55DU7XA', display: 'LED', series: 'Crystal UHD' }),
  upgrade65: unsourcedTv({ model: 'QN65QN90XA', size: 65, series: 'QN90 Series' }),
};

/** A 55-inch-CLASS TV whose measured diagonal is 54.6 inches, reported (as the live model did) in the size field. */
export const measuredDiagonalCandidate = tvCandidate({ model: 'QN55Q80D', size: 54.6, relationship: 'DIRECT_SUCCESSOR', relationshipSources: ['samsung.com'], relatedModel: 'QN55Q80C' });
