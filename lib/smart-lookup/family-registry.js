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
    brand: 'Dell',
    category: 'laptop',
    familyId: 'xps-15',
    familyName: 'XPS 15',
    familyPattern: /\bXPS\s*15\b/i,
    modelLineId: 'xps-15',
    modelLineName: 'XPS 15',
    modelLinePattern: /\bXPS\s*15(?:\s+(\d{4}))?\b/i,
    buildModelLineId: (match) => match[1] ? `xps-15-${match[1]}` : 'xps-15',
    buildModelLineName: (match) => match[1] ? `XPS 15 ${match[1]}` : 'XPS 15',
    dynamicModelLine: true,
    exactModelPattern: null,
  },
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
    brand: 'Sony',
    category: 'television',
    familyId: 'bravia',
    familyName: 'BRAVIA',
    familyPattern: /\bBRAVIA\b/i,
    modelLineId: null,
    modelLineName: null,
    modelLinePattern: null,
    exactModelPattern: null,
  },
  {
    brand: 'Generac',
    category: 'generator',
    familyId: 'guardian',
    familyName: 'Guardian',
    familyPattern: /\bGUARDIAN\b/i,
    modelLineId: null,
    modelLineName: null,
    modelLinePattern: null,
    exactModelPattern: null,
  },
  {
    brand: 'Nintendo',
    category: 'game console',
    familyId: 'switch',
    familyName: 'Switch',
    familyPattern: /\bSWITCH\b/i,
    modelLineId: null,
    modelLineName: null,
    modelLinePattern: null,
    exactModelPattern: null,
  },
  {
    brand: 'Sony',
    category: 'game console',
    familyId: 'playstation',
    familyName: 'PlayStation',
    familyPattern: /\bPLAYSTATION\b/i,
    modelLineId: null,
    modelLineName: null,
    modelLinePattern: /\bPLAYSTATION\s*([1-5])\b|\bPS\s*([1-5])\b/i,
    buildModelLineId: (match) => `playstation-${match[1] || match[2]}`,
    buildModelLineName: (match) => `PlayStation ${match[1] || match[2]}`,
    dynamicModelLine: true,
    exactModelPattern: null,
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
  // Business-computer families. Unlike the fixed-name seeds above, these
  // recognize a *numbered* model line ("OptiPlex 9020", "ThinkCentre M720",
  // "EliteDesk 800 G3") -- the line number itself is captured from the
  // query, not hardcoded per model, so a marketing/retailer-style query
  // resolves to 'model-line' (not 'exact-model': the chassis/CPU/RAM/
  // storage configuration is never determinable from the family name and
  // line number alone) without listing every line number a brand has ever
  // shipped. `dynamicModelLine: true` tells matchGeneralFamily to derive
  // modelLineId/modelLineName from the captured group instead of the
  // static modelLineId/modelLineName used by the seeds above. None of these
  // seeds define an exactModelPattern: a full build (exact CPU/RAM/storage/
  // chassis) is never inferable from product-name text alone, only from a
  // service tag or a manufacturer-verified configuration lookup neither of
  // which this project has evidence for -- see docs/smart-lookup-architecture.md.
  {
    brand: 'Dell',
    category: 'desktop computer',
    productRole: 'business desktop computer',
    familyId: 'optiplex',
    familyName: 'OptiPlex',
    familyPattern: /\bOPTIPLEX\b/i,
    modelLineId: null,
    modelLineName: null,
    modelLinePattern: /\bOPTIPLEX\s*(\d{3,4})\b/i,
    dynamicModelLine: true,
    buildModelLineName: (match) => `OptiPlex ${match[1]}`,
    exactModelPattern: null,
    formFactorAware: true,
  },
  {
    brand: 'Lenovo',
    category: 'desktop computer',
    productRole: 'business desktop computer',
    familyId: 'thinkcentre',
    familyName: 'ThinkCentre',
    familyPattern: /\bTHINKCENTRE\b/i,
    modelLineId: null,
    modelLineName: null,
    modelLinePattern: /\bTHINKCENTRE\s*(M\d{2,4}[A-Z]?)\b/i,
    dynamicModelLine: true,
    buildModelLineName: (match) => `ThinkCentre ${match[1].toUpperCase()}`,
    exactModelPattern: null,
    formFactorAware: true,
  },
  {
    brand: 'HP',
    category: 'desktop computer',
    productRole: 'business desktop computer',
    familyId: 'elitedesk',
    familyName: 'EliteDesk',
    familyPattern: /\bELITEDESK\b/i,
    modelLineId: null,
    modelLineName: null,
    modelLinePattern: /\bELITEDESK\s*(\d{3})(?:\s*(G\d))?\b/i,
    dynamicModelLine: true,
    buildModelLineName: (match) => `EliteDesk ${match[1]}${match[2] ? ` ${match[2].toUpperCase()}` : ''}`,
    exactModelPattern: null,
    formFactorAware: true,
  },
];

// Chassis/form-factor hints for the formFactorAware business-computer
// families above. Deliberately generic (brand-agnostic) since the same
// SFF/MT/USFF/tower/micro vocabulary is used across Dell, Lenovo, and HP
// business-desktop lines. Only consulted when a formFactorAware seed
// already matched, so a stray "MT" or "micro" elsewhere in an unrelated
// query can never attach a form-factor hint to a non-desktop result.
const FORM_FACTOR_HINTS = [
  { id: 'small-form-factor', label: 'Small Form Factor (SFF)', pattern: /\b(?:SFF|SMALL[\s-]?FORM[\s-]?FACTOR)\b/i },
  { id: 'ultra-small-form-factor', label: 'Ultra Small Form Factor (USFF)', pattern: /\b(?:USFF|ULTRA[\s-]?SMALL[\s-]?FORM[\s-]?FACTOR)\b/i },
  { id: 'micro', label: 'Micro', pattern: /\bMICRO\b/i },
  { id: 'mini-tower', label: 'Mini Tower (MT)', pattern: /\b(?:MT|MINI[\s-]?TOWER)\b/i },
  { id: 'tower', label: 'Tower', pattern: /\b(?:TWR|FULL[\s-]?TOWER|\bTOWER\b)\b/i },
];

// USFF and Micro are handled as one interpretation for these business-
// desktop lines: HP/Lenovo market a near-identical ultra-compact chassis
// tier under different names ("USFF" for HP/Dell, "Tiny"/"Micro" for
// Lenovo), and this project has no per-brand evidence distinguishing them
// further -- see Phase 3 in the originating task ("only when repository or
// provider evidence supports the exact interpretation").
export function matchFormFactorHint(query) {
  const text = String(query || '');
  for (const hint of FORM_FACTOR_HINTS) {
    if (hint.pattern.test(text)) return { formFactor: hint.id, formFactorLabel: hint.label };
  }
  return null;
}

// Family-level facts, keyed "Brand:familyId". Kept separate from the seed
// patterns above so recognition (does this query match?) and evidence (what
// do we know about it?) can be reviewed and sourced independently.
export const GENERAL_FAMILY_CONTEXT = {
  'Dell:xps-15': {
    displayName: 'Dell XPS 15',
    confidence: 'medium',
    familyRange: { start: 2010, end: 2024, current: false, basis: 'model-line-history' },
    modelLineRanges: {
      'xps-15': { start: 2010, end: 2024, current: false, basis: 'model-line-history' },
      'xps-15-9530': { start: 2023, end: 2024, current: false, basis: 'model-availability' },
    },
    generationSummary: [
      'The XPS 15 name spans many generations and configuration suffixes; the line began around the early-2010s XPS L501x generation.',
      '9530 is associated with the 2023 XPS 15 generation using 13th Gen Intel Core processors; Dell also used related XPS 15 numbering in earlier generations, so source verification is important.',
      'Dell later shifted its premium XPS laptop naming toward 13-, 14-, and 16-inch models, so XPS 15 history should be treated as a product-line context rather than a current exact-unit date.',
    ],
    refinementIdentifiers: [
      'Enter the full Dell model designation or configuration suffix from the bottom label or system information.',
      'Enter the Dell service tag for one exact original configuration through Dell support; Smart Lookup does not decode service tags locally.',
      'For XPS 15 9530, include processor/GPU/display details if you need generation-specific replacement comparison.',
    ],
  },
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
  'Sony:bravia': {
    displayName: 'Sony BRAVIA',
    confidence: 'medium',
    familyRange: { start: 2005, end: null, current: true, basis: 'brand-subbrand-history' },
    modelLineRanges: {},
    generationSummary: [
      'Sony introduced BRAVIA as a flat-panel LCD HDTV sub-brand in 2005, and later used it across many LCD, OLED, Mini LED, and Google TV generations.',
      'A bare BRAVIA query does not identify one model year; the full model code, such as KDL-, XBR-, XR-, or K- series identifiers, is needed.',
    ],
    refinementIdentifiers: [
      'Enter the full Sony TV model number from the rear label or Settings > System > About.',
      'Include the screen size and suffix letters if visible, because Sony reuses BRAVIA branding across many generations.',
    ],
  },
  'Generac:guardian': {
    displayName: 'Generac Guardian',
    confidence: 'low',
    familyRange: { start: 2008, end: 2025, current: false, basis: 'product-family-history' },
    modelLineRanges: {},
    generationSummary: [
      'Guardian is a long-running Generac home standby generator family with multiple controller, enclosure, and power-output generations.',
      'Recent Guardian air-cooled standby generators share similar enclosure conventions, but the exact generation depends on the model and serial/rating label.',
    ],
    refinementIdentifiers: [
      'Enter the Generac model number from the generator data plate, often beginning with G00 or a four-to-seven digit model code.',
      'Enter the serial number from the data plate for unit-specific manufacture dating through Generac support or serial decoding.',
    ],
  },
  'Nintendo:switch': {
    displayName: 'Nintendo Switch',
    confidence: 'medium',
    familyRange: { start: 2017, end: null, current: true, basis: 'console-family-history' },
    modelLineRanges: {},
    generationSummary: [
      'Nintendo Switch is a console family rather than one exact hardware revision; original, Lite, OLED, and successor generations use different model identifiers.',
      'The exact unit revision requires the model code and serial prefix from the console label.',
    ],
    refinementIdentifiers: [
      'Enter the model code from the console label, such as HAC, HDH, HEG, or a successor-generation code.',
      'Enter the serial prefix if you need a narrower hardware-revision estimate.',
    ],
  },
  'Sony:playstation': {
    displayName: 'Sony PlayStation',
    confidence: 'medium',
    familyRange: { start: 1994, end: null, current: true, basis: 'console-family-history' },
    modelLineRanges: {
      'playstation-1': { start: 1994, end: 2006, current: false, basis: 'console-generation-history' },
      'playstation-2': { start: 2000, end: 2013, current: false, basis: 'console-generation-history' },
      'playstation-3': { start: 2006, end: 2017, current: false, basis: 'console-generation-history' },
      'playstation-4': { start: 2013, end: 2025, current: false, basis: 'console-generation-history' },
      'playstation-5': { start: 2020, end: null, current: true, basis: 'console-generation-history' },
    },
    generationSummary: [
      'The PlayStation brand began with the original console in Japan in 1994 and spans multiple generations.',
      'A bare PlayStation query is brand/family history; PS4, PS5, Slim, Pro, and model codes narrow the generation.',
    ],
    refinementIdentifiers: [
      'Enter PS1, PS2, PS3, PS4, PS5, Slim, Pro, or the CFI/CUH/SCPH model code from the console label.',
      'Enter the serial/model label if you need hardware-revision or unit-specific dating.',
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

// Shared refinement/comparison metadata reused across every business-
// computer family below -- what varies model-to-model is the family name
// and generation range, not what a buyer needs to compare on. Kept as one
// constant so a new business-computer family only needs to add its own
// generationSummary/serviceTagNote, not re-author this list.
const BUSINESS_COMPUTER_COMPARISON_CRITERIA = [
  'Chassis/form factor (tower, small form factor, ultra small form factor, or micro)',
  'Processor generation and core count',
  'Installed RAM (amount and type)',
  'Storage type and capacity',
  'Graphics capability (integrated vs. discrete, if required)',
  'Display outputs and count needed',
  'Expansion-card and drive-bay requirements',
  'Operating system requirements',
];
const BUSINESS_COMPUTER_REFINEMENT_IDENTIFIERS = [
  'Enter the chassis/form factor (Tower, SFF, USFF, or Micro) from the case label or order confirmation.',
  'Enter the processor, installed RAM, and storage type/capacity if known.',
  'Enter graphics, display-output, and expansion-card requirements.',
  'A service tag or asset tag identifies one exact unit\'s original configuration but is not itself a model number -- it is looked up through the manufacturer, not decoded locally.',
];
const BUSINESS_COMPUTER_RECOMMENDED_MINIMUM_SPECS = [
  'Match or exceed the original processor generation for the intended workload.',
  'Match or exceed the original installed RAM.',
  'Match the original storage capacity; prefer SSD over HDD when the original was HDD-only.',
  'Confirm the replacement supports the required display outputs and expansion cards.',
];

export const GENERAL_FAMILY_CONTEXT_BUSINESS_COMPUTERS = {
  'Dell:optiplex': {
    displayName: 'Dell OptiPlex',
    confidence: 'medium',
    familyRange: { start: 2001, end: null, current: true, basis: 'model-availability' },
    modelLineRanges: {},
    generationSummary: [
      'Dell has sold the OptiPlex business-desktop line continuously since 2001, with model-number generations refreshed roughly every one to two years alongside new Intel/AMD processor platforms.',
      'Individual OptiPlex numbered lines (for example 9020, 7040, 5090) were each sold across multiple chassis/form-factor variants (Tower, Small Form Factor, Micro/USFF) and multiple internal configurations -- the model number alone does not determine one exact build.',
    ],
    configurationVariants: [
      'Tower (full-size chassis, most expansion capacity)',
      'Small Form Factor (SFF)',
      'Micro / Ultra Small Form Factor (USFF)',
    ],
    comparisonCriteria: BUSINESS_COMPUTER_COMPARISON_CRITERIA,
    recommendedMinimumSpecs: BUSINESS_COMPUTER_RECOMMENDED_MINIMUM_SPECS,
    refinementIdentifiers: BUSINESS_COMPUTER_REFINEMENT_IDENTIFIERS,
    serviceTagNote: 'Dell service tags (typically 7 characters, on a pull-out tag or bottom label) identify one exact original configuration through Dell\'s own lookup tool -- Smart Lookup does not decode Dell service tags locally.',
  },
  'Lenovo:thinkcentre': {
    displayName: 'Lenovo ThinkCentre',
    confidence: 'medium',
    familyRange: { start: 2005, end: null, current: true, basis: 'model-availability' },
    modelLineRanges: {},
    generationSummary: [
      'Lenovo has sold the ThinkCentre business-desktop line since 2005 (continuing IBM\'s prior ThinkCentre naming), refreshed with new M-series model numbers roughly every one to two processor generations.',
      'Individual ThinkCentre M-series lines (for example M720, M920, M75q) were each sold across multiple chassis variants (Tower, Small Form Factor, Tiny/Micro) and multiple internal configurations.',
    ],
    configurationVariants: [
      'Tower',
      'Small Form Factor (SFF)',
      'Tiny (Lenovo\'s micro/USFF-class chassis)',
    ],
    comparisonCriteria: BUSINESS_COMPUTER_COMPARISON_CRITERIA,
    recommendedMinimumSpecs: BUSINESS_COMPUTER_RECOMMENDED_MINIMUM_SPECS,
    refinementIdentifiers: BUSINESS_COMPUTER_REFINEMENT_IDENTIFIERS,
    serviceTagNote: 'Lenovo serial/MTM numbers on the case label identify one exact original configuration through Lenovo\'s own lookup tool -- Smart Lookup does not decode them locally.',
  },
  'HP:elitedesk': {
    displayName: 'HP EliteDesk',
    confidence: 'medium',
    familyRange: { start: 2014, end: null, current: true, basis: 'model-availability' },
    modelLineRanges: {},
    generationSummary: [
      'HP has sold the EliteDesk business-desktop line since 2014, refreshed with new generation suffixes (G1 through the current generation) roughly every one to two processor generations.',
      'Individual EliteDesk lines (for example 800 G3, 800 G5) were each sold across multiple chassis variants (Tower, Small Form Factor, Micro) and multiple internal configurations.',
    ],
    configurationVariants: [
      'Tower',
      'Small Form Factor (SFF)',
      'Micro (USFF-class chassis)',
    ],
    comparisonCriteria: BUSINESS_COMPUTER_COMPARISON_CRITERIA,
    recommendedMinimumSpecs: BUSINESS_COMPUTER_RECOMMENDED_MINIMUM_SPECS,
    refinementIdentifiers: BUSINESS_COMPUTER_REFINEMENT_IDENTIFIERS,
    serviceTagNote: 'The HP serial number on the case label identifies one exact original configuration through HP\'s own lookup tool -- Smart Lookup does not decode it locally.',
  },
};
Object.assign(GENERAL_FAMILY_CONTEXT, GENERAL_FAMILY_CONTEXT_BUSINESS_COMPUTERS);

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
// A keyboard-mash string can pass the overall vowel-ratio check by accident
// (one stray vowel keystroke among a run of adjacent keys) while still
// containing a run of consecutive consonants no real word, brand, or product
// name produces within a single token. Checked per-token (never across a
// word boundary, so a real multi-word phrase can never be flagged only
// because two words happen to abut with consonant-heavy edges) and only as
// an ADDITION alongside the vowel-ratio check, never a replacement for it.
const UNUSABLE_MAX_CONSONANT_RUN = 6;

function hasImplausibleConsonantRun(trimmed) {
  return trimmed.split(/\s+/).some((rawToken) => {
    const tokenAlpha = rawToken.replace(/[^A-Za-z]/g, '');
    return tokenAlpha
      .replace(/[aeiouAEIOU]/g, ' ')
      .split(' ')
      .some((run) => run.length >= UNUSABLE_MAX_CONSONANT_RUN);
  });
}

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
  if (hasImplausibleConsonantRun(trimmed)) return true;
  const tokens = trimmed.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const meaninglessWords = new Set(['random', 'nonsense', 'gibberish', 'asdf', 'test', 'unknown']);
  if (tokens.length && tokens.every((token) => meaninglessWords.has(token))) return true;
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
    // Dynamic seeds (business-computer families) derive the model-line id/
    // name from the captured line number/designation instead of the fixed
    // modelLineId/modelLineName the earlier static seeds use -- see the
    // seed comment above GENERAL_FAMILY_SEEDS.
    const dynamicMatch = hasModelLine && seed.dynamicModelLine ? (exactMatch || lineMatch) : null;
    const modelLineId = !hasModelLine
      ? null
      : (seed.dynamicModelLine && seed.buildModelLineId
        ? seed.buildModelLineId(dynamicMatch)
        : seed.dynamicModelLine
        ? `${seed.familyId}-${String(dynamicMatch[1] || '').toLowerCase()}`
        : seed.modelLineId);
    const modelLineName = !hasModelLine
      ? null
      : (seed.dynamicModelLine && seed.buildModelLineName
        ? seed.buildModelLineName(dynamicMatch)
        : seed.modelLineName);
    const formFactorHint = seed.formFactorAware ? matchFormFactorHint(text) : null;

    return {
      brand: seed.brand,
      category: seed.category,
      familyId: seed.familyId,
      familyName: seed.familyName,
      seriesLine: seed.familyName,
      modelLineId,
      modelLineName,
      exactModel: exactMatch ? exactMatch[0].toUpperCase().replace(/\s+/g, ' ') : null,
      // The raw matched model-line token (e.g. "AN515-58") when only the
      // line -- not the full configuration suffix -- was matched. Used by
      // normalize.js to force modelCompleteness to 'partial' for this token,
      // overriding the generic hyphen-implies-exact heuristic, which would
      // otherwise wrongly promote a bare model-line token to exact-model.
      modelLineToken: (!exactMatch && lineMatch) ? lineMatch[0].toUpperCase().replace(/\s+/g, ' ') : null,
      formFactor: formFactorHint ? formFactorHint.formFactor : null,
      formFactorLabel: formFactorHint ? formFactorHint.formFactorLabel : null,
      productRole: seed.productRole || null,
    };
  }
  return null;
}

export function getGeneralFamilyContext(brand, familyId) {
  if (!brand || !familyId) return null;
  return GENERAL_FAMILY_CONTEXT[`${brand}:${familyId}`] || null;
}

export { escapeRegExp };
