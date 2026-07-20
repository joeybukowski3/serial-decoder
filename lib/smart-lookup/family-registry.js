// Kept local (not imported from normalize.js) to avoid a circular module
// dependency -- normalize.js imports matchGeneralFamily from this file.
function normalizeBrandIdentity(value) {
  return String(value || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
}

// Data-driven product-family / model-line recognition, generalized from the
// original TV-only seed mechanism in normalize.js. Adding a new family only
// requires a new entry here -- no control-flow changes elsewhere. Each entry
// stays brand- and category-scoped (mirroring the TV seeds' discipline) so a
// short family token (e.g. "5", "15") never becomes a cross-brand guess; the
// distinctive part of familyPattern/modelLinePattern always requires the
// brand's own product-name token, not a bare number.
//
// Every *Range below is deliberately the coarsest range this project could
// source-verify (see docs/smart-lookup-architecture.md for citations); where
// a narrower per-generation range was not independently verifiable, the
// generationSummary/refinementIdentifiers explain the qualitative eras
// instead of asserting a number that was not confirmed.
export const GENERAL_FAMILY_SEEDS = [
  {
    brand: 'Acer',
    category: 'laptop',
    familyId: 'nitro-5',
    familyName: 'Nitro 5',
    familyPattern: /\bNITRO\s*5\b/i,
    modelLineId: 'an515',
    modelLineName: 'AN515 (15.6")',
    modelLinePattern: /\bAN515(?:-(\d{2}))?\b/i,
    exactModelPattern: /\bAN515-(\d{2})-([A-Z0-9]{3,10})\b/i,
  },
  {
    brand: 'Dell',
    category: 'laptop',
    familyId: 'inspiron-15',
    familyName: 'Inspiron 15',
    familyPattern: /\bINSPIRON\s*15\b/i,
    modelLineId: 'inspiron-15-series',
    modelLineName: 'Inspiron 15 3000/5000/7000 series',
    modelLinePattern: /\bINSPIRON\s*15\s*(3000|5000|7000)\b/i,
    exactModelPattern: /\bINSPIRON\s*15\s*(3000|5000|7000)[\s-]*(\d{3,4})\b/i,
  },
  {
    brand: 'Samsung',
    category: 'tablet',
    familyId: 'galaxy-tab',
    familyName: 'Galaxy Tab',
    familyPattern: /\bGALAXY\s*TAB\b/i,
    modelLineId: 'galaxy-tab-s',
    modelLineName: 'Galaxy Tab S series',
    modelLinePattern: /\bGALAXY\s*TAB\s*(S|A|ACTIVE)\b/i,
    exactModelPattern: /\bSM-[A-Z]\d{3}[A-Z0-9]{0,4}\b/i,
  },
  {
    brand: 'Whirlpool',
    category: 'washer',
    familyId: 'cabrio',
    familyName: 'Cabrio',
    familyPattern: /\bCABRIO\b/i,
    modelLineId: null,
    modelLineName: null,
    modelLinePattern: null,
    exactModelPattern: /\bWTW\d{4}[A-Z]{1,3}\b/i,
  },
  {
    brand: 'Trane',
    category: 'air conditioner',
    familyId: 'xr13',
    familyName: 'XR13',
    familyPattern: /\bXR\s?13\b/i,
    modelLineId: null,
    modelLineName: null,
    modelLinePattern: null,
    exactModelPattern: /\b4TTR3\d{3}[A-Z0-9]{0,4}\b/i,
  },
];

// Family-level facts, keyed "Brand:familyId". Kept separate from the seed
// patterns above so recognition (does this query match?) and evidence (what
// do we know about it?) can be reviewed and sourced independently.
export const GENERAL_FAMILY_CONTEXT = {
  'Acer:nitro-5': {
    displayName: 'Acer Nitro 5',
    confidence: 'medium',
    familyRange: { start: 2017, end: null, current: true, basis: 'model-availability' },
    modelLineRanges: {
      an515: { start: 2017, end: null, current: true, basis: 'model-availability' },
    },
    generationSummary: [
      'AN515-41/42/51/52 (circa 2017-2018, early Kaby Lake / Ryzen Mobile generation)',
      'AN515-54/55 (circa 2019-2020)',
      'AN515-57 (2021, 11th Gen Intel refresh)',
      'AN515-58 and later (2022-present, current chassis and platform generation)',
    ],
    refinementIdentifiers: [
      'Enter the complete model number beginning with AN515, found on the bottom label or in system information.',
      'The configuration suffix after the generation number (for example -57Y8) narrows the result to one exact build.',
    ],
  },
  'Dell:inspiron-15': {
    displayName: 'Dell Inspiron 15',
    confidence: 'low',
    familyRange: { start: 2014, end: null, current: true, basis: 'model-availability' },
    modelLineRanges: {
      'inspiron-15-series': { start: 2014, end: null, current: true, basis: 'model-availability' },
    },
    generationSummary: [
      'Earlier Inspiron 1525/1545/15R generations (2008-2013) used a different naming scheme.',
      'Inspiron 15 3000/5000/7000 series naming has been used from roughly 2014 to the present, refreshed most years with new processor generations.',
    ],
    refinementIdentifiers: [
      'Enter the complete model number, including the 3000/5000/7000 series and the numeric suffix (for example Inspiron 15 3520).',
      'The service tag on the bottom label identifies one exact configuration.',
    ],
  },
  'Samsung:galaxy-tab': {
    displayName: 'Samsung Galaxy Tab',
    confidence: 'medium',
    familyRange: { start: 2010, end: null, current: true, basis: 'model-availability' },
    modelLineRanges: {
      'galaxy-tab-s': { start: 2014, end: null, current: true, basis: 'model-availability' },
    },
    generationSummary: [
      'Original Galaxy Tab (2010-2011).',
      'Galaxy Tab 2 (2012) and Galaxy Tab 3 (2013).',
      'Since 2014 the line has been split into the entry-level Galaxy Tab A, premium Galaxy Tab S, and ruggedized Galaxy Tab Active families, each still updated today.',
    ],
    refinementIdentifiers: [
      'Enter the model number beginning with SM-, found in Settings > About tablet or on the original box.',
      'Naming the A, S, or Active line narrows which family this estimate applies to.',
    ],
  },
  'Whirlpool:cabrio': {
    displayName: 'Whirlpool Cabrio',
    confidence: 'low',
    familyRange: { start: 2007, end: 2022, current: false, basis: 'category-inference' },
    modelLineRanges: {},
    generationSummary: [
      'Cabrio-branded top-load and front-load laundry pairs were sold across roughly the mid-2000s through the early 2020s.',
      'The exact introduction and discontinuation years could not be independently source-verified and are treated as an approximate window, not a confirmed range.',
    ],
    refinementIdentifiers: [
      'Enter the complete model number, typically beginning with WTW (washer) or WED/WGD (dryer), from the door frame or rear label.',
      'The serial number provides an individual manufacture date through the Serial Number Decoder.',
    ],
  },
  'Trane:xr13': {
    displayName: 'Trane XR13',
    confidence: 'low',
    familyRange: { start: 2005, end: null, current: true, basis: 'category-inference' },
    modelLineRanges: {},
    generationSummary: [
      'The XR13 single-stage air conditioner line has been sold under this and closely related naming since the mid-2000s and remains part of Trane\'s current lineup.',
      'Trane has periodically adjusted this tier\'s marketing name; the underlying model line has continued with incremental updates rather than a clean generational break.',
    ],
    refinementIdentifiers: [
      'Enter the complete model number, typically beginning with 4TTR3, from the outdoor unit\'s rating plate.',
      'The serial number on the rating plate provides an individual manufacture date.',
    ],
  },
};

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Distinguishes a genuinely meaningless query (empty, keyboard-mash, pure
// symbols) from real-but-unrecognized product text. Deliberately
// conservative: a false "unusable" call blocks a legitimate query from ever
// reaching the provider, which is worse than the reverse, so this only fires
// when there is close to zero letter content or the letter content shows no
// vowel structure at all. Real brand/category/family/model signal is checked
// by the caller first and always wins.
const UNUSABLE_MIN_ALPHA_FOR_VOWEL_CHECK = 4;
const UNUSABLE_MIN_VOWEL_RATIO = 0.18;

export function isLikelyUnusableQuery(query, signals = {}) {
  const trimmed = String(query || '').trim();
  if (!trimmed) return true;
  if (signals.classifiedBrand || signals.genericCategory || signals.productFamily || signals.exactModel) return false;
  if (signals.modelCompleteness === 'partial') return false;
  const alpha = trimmed.replace(/[^A-Za-z]/g, '');
  if (alpha.length < 2) return true;
  if (alpha.length >= UNUSABLE_MIN_ALPHA_FOR_VOWEL_CHECK) {
    const vowels = (alpha.match(/[aeiouAEIOU]/g) || []).length;
    if (vowels / alpha.length < UNUSABLE_MIN_VOWEL_RATIO) return true;
  }
  return false;
}

// Brand/category-scoped match against GENERAL_FAMILY_SEEDS. Returns the most
// specific hit available (exact model > model line > family name only) or
// null. A model-line/exact-model pattern match implies the seed's brand even
// when the brand word itself was not typed (e.g. a bare "AN515-58" query),
// the same way the existing TV exactModelPattern seeds already behave -- but
// an explicit, different recognized brand in the query always wins (no
// cross-brand override).
export function matchGeneralFamily(query, brand, genericCategory) {
  const text = String(query || '');
  for (const seed of GENERAL_FAMILY_SEEDS) {
    const explicitBrand = brand && normalizeBrandIdentity(brand) === normalizeBrandIdentity(seed.brand);
    if (brand && !explicitBrand) continue;

    const exactMatch = seed.exactModelPattern ? text.match(seed.exactModelPattern) : null;
    const lineMatch = !exactMatch && seed.modelLinePattern ? text.match(seed.modelLinePattern) : null;
    const familyMatch = seed.familyPattern ? text.match(seed.familyPattern) : null;
    if (!exactMatch && !lineMatch && !familyMatch) continue;
    if (!explicitBrand && !exactMatch && !lineMatch && !familyMatch) continue;

    const hasModelLine = Boolean(exactMatch || lineMatch);
    return {
      brand: seed.brand,
      category: seed.category,
      familyId: seed.familyId,
      familyName: seed.familyName,
      seriesLine: seed.familyName,
      modelLineId: hasModelLine ? seed.modelLineId : null,
      modelLineName: hasModelLine ? seed.modelLineName : null,
      exactModel: exactMatch ? exactMatch[0].toUpperCase().replace(/\s+/g, ' ') : null,
      // The raw matched model-line token (e.g. "AN515-58") when only the
      // line -- not the full configuration suffix -- was matched. Used by
      // normalize.js to force modelCompleteness to 'partial' for this token,
      // overriding the generic hyphen-implies-exact heuristic, which would
      // otherwise wrongly promote a bare model-line token to exact-model.
      modelLineToken: (!exactMatch && lineMatch) ? lineMatch[0].toUpperCase().replace(/\s+/g, ' ') : null,
    };
  }
  return null;
}

export function getGeneralFamilyContext(brand, familyId) {
  if (!brand || !familyId) return null;
  return GENERAL_FAMILY_CONTEXT[`${brand}:${familyId}`] || null;
}

export { escapeRegExp };
