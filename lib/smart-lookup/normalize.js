import { getGeneralFamilyContext, isLikelyUnusableQuery, matchGeneralFamily } from './family-registry.js';

export { getGeneralFamilyContext };

const BRAND_ALIASES = new Map([
  ['a.o. smith', 'A.O. Smith'], ['ao smith', 'A.O. Smith'], ['acer', 'Acer'], ['amana', 'Amana'],
  ['apple', 'Apple'], ['asus', 'ASUS'], ['bosch', 'Bosch'], ['bradford white', 'Bradford White'],
  ['bryant', 'Bryant'], ['carrier', 'Carrier'], ['dell', 'Dell'], ['electrolux', 'Electrolux'],
  ['frigidaire', 'Frigidaire'], ['ge', 'GE'], ['general electric', 'GE'], ['goodman', 'Goodman'],
  ['google', 'Google'], ['hotpoint', 'Hotpoint'], ['hp', 'HP'], ['jenn-air', 'Jenn-Air'],
  ['jennair', 'Jenn-Air'], ['kenmore', 'Kenmore'], ['kitchenaid', 'KitchenAid'],
  ['lennox', 'Lennox'], ['lenovo', 'Lenovo'], ['lg', 'LG'], ['maytag', 'Maytag'], ['nintendo', 'Nintendo'],
  ['panasonic', 'Panasonic'], ['payne', 'Payne'], ['rheem', 'Rheem'], ['roper', 'Roper'],
  ['ruud', 'Ruud'], ['samsung', 'Samsung'], ['sony', 'Sony'], ['speed queen', 'Speed Queen'],
  ['sub-zero', 'Sub-Zero'], ['sub zero', 'Sub-Zero'], ['trane', 'Trane'], ['vizio', 'Vizio'],
  ['whirlpool', 'Whirlpool'], ['whisker', 'Whisker'], ['york', 'York'],
]);

// Brands Smart Lookup can research but which have NO local serial-decoder
// algorithm. Smart Lookup is deliberately broader than deterministic serial
// decoding: refusing to even recognize a brand that is literally present in
// the query ("H4080BM miele oven" -> brand: Unknown) is a pure product
// failure, not a safety property. These are recognition-only -- they never
// imply a decoder exists, never appear in the serial-decoder brand dropdown
// (which is built from decoder-data.js, not this map), and callers that need
// "does this brand have a decoder?" must use isDecoderBackedBrand below.
const RESEARCH_BRAND_ALIASES = new Map([
  ['beko', 'Beko'], ['bertazzoni', 'Bertazzoni'], ['blomberg', 'Blomberg'],
  ['bluestar', 'BlueStar'], ['briggs & stratton', 'Briggs & Stratton'],
  ['briggs and stratton', 'Briggs & Stratton'], ['cafe', 'Café'], ['café', 'Café'],
  ['dacor', 'Dacor'], ['daikin', 'Daikin'], ['danby', 'Danby'], ['dyson', 'Dyson'],
  ['fisher & paykel', 'Fisher & Paykel'], ['fisher and paykel', 'Fisher & Paykel'],
  ['fujitsu', 'Fujitsu'], ['gaggenau', 'Gaggenau'], ['generac', 'Generac'],
  ['haier', 'Haier'], ['hisense', 'Hisense'], ['insignia', 'Insignia'],
  ['kohler', 'Kohler'], ['liebherr', 'Liebherr'], ['microsoft', 'Microsoft'],
  ['miele', 'Miele'], ['mitsubishi', 'Mitsubishi'], ['monogram', 'Monogram'],
  ['navien', 'Navien'], ['noritz', 'Noritz'],
  ['philips', 'Philips'], ['playstation', 'Sony'], ['razer', 'Razer'],
  ['rinnai', 'Rinnai'], ['roku', 'Roku'], ['sharp', 'Sharp'], ['smeg', 'Smeg'],
  ['tcl', 'TCL'], ['thermador', 'Thermador'], ['toshiba', 'Toshiba'],
  ['u-line', 'U-Line'], ['viking', 'Viking'], ['wolf', 'Wolf'], ['zline', 'ZLINE'],
]);

const ALL_BRAND_ALIASES = new Map([...BRAND_ALIASES, ...RESEARCH_BRAND_ALIASES]);

/**
 * True when the brand has a local serial-decoder algorithm. Research-only
 * brands are recognizable for Smart Lookup research but must never be routed
 * into deterministic serial decoding.
 */
export function isDecoderBackedBrand(brand) {
  if (!brand) return false;
  for (const value of BRAND_ALIASES.values()) {
    if (value.toLowerCase() === String(brand).toLowerCase()) return true;
  }
  return false;
}

const GENERIC_CATEGORIES = new Map([
  ['appliance', 'appliance'],
  ['air conditioner', 'air conditioner'], ['air conditioning', 'air conditioner'], ['ac unit', 'air conditioner'],
  ['dishwasher', 'dishwasher'], ['dryer', 'dryer'], ['electrical panel', 'electrical panel'],
  ['breaker box', 'electrical panel'], ['freezer', 'freezer'], ['furnace', 'furnace'],
  ['generator', 'generator'], ['heat pump', 'heat pump'], ['gaming laptop', 'laptop'], ['laptop', 'laptop'],
  // "HVAC" keeps its own coarse canonical rather than mapping to
  // 'air conditioner': an HVAC unit may equally be a furnace, heat pump, or
  // air handler, and picking one would be an unsafe category inference. This
  // is enough to make a branded query ("Trane HVAC unit") a recognized
  // brand-category instead of an unrecognized, provider-ineligible query.
  ['hvac system', 'hvac system'], ['hvac unit', 'hvac system'], ['hvac', 'hvac system'],
  ['notebook computer', 'laptop'], ['notebook', 'laptop'], ['desktop computer', 'desktop computer'],
  ['desktop', 'desktop computer'], ['computer', 'computer'], ['pc', 'computer'], ['monitor', 'monitor'],
  ['microwave', 'microwave'], ['oven', 'oven'], ['phone', 'phone'], ['printer', 'printer'], ['range', 'range'],
  ['refrigerator', 'refrigerator'], ['fridge', 'refrigerator'], ['tablet', 'tablet'],
  ['television', 'television'], ['tv', 'television'], ['top-load washer', 'washer'],
  ['top load washer', 'washer'], ['top loader', 'washer'], ['front-load washer', 'washer'],
  ['front load washer', 'washer'], ['washer', 'washer'], ['washing machine', 'washer'],
  ['water heater', 'water heater'],
]);

const CATEGORY_WORDS = new Set(Array.from(GENERIC_CATEGORIES.keys()).flatMap((value) => value.split(/\s+/)));
const DESCRIPTIVE_MEASUREMENT = /^(?:\d+(?:\.\d+)?)(?:-|\/)?(?:inch|inches|in|ft|foot|feet|gallon|gallons|gal|lb|lbs|pound|pounds|ton|tons|btu|watt|watts|kw|volt|volts|hz)$/i;

const MODEL_STOP_WORDS = new Set([
  ...CATEGORY_WORDS,
  'brand', 'model', 'number', 'series', 'serial', 'inch', 'inches', 'smart', 'front', 'top',
  'load', 'loading', 'electric', 'gas', 'portable', 'central', 'unit', 'system', 'appliance',
]);

export function normalizeWhitespace(value) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export const SMART_LOOKUP_NOTES_MAX_LENGTH = 300;

export function normalizeSmartLookupNotes(value) {
  return normalizeWhitespace(value);
}

export function normalizeKnownQuery(value) {
  const query = normalizeWhitespace(value);
  const lower = query.toLowerCase();
  if (!query) return '';
  if (/\blr3re(?:-\d+)?\b/.test(lower) && !/\blitter[\s-]*robot\b/.test(lower)) {
    return `${query} Whisker Litter-Robot 3 Open Air self-cleaning litter box`;
  }
  if (/\blitter[\s-]*robot\b/.test(lower) && !/\bwhisker\b/.test(lower)) {
    return `${query} by Whisker`;
  }
  return query.replace(/\s+serial\s+\S+$/i, '').trim();
}

export function compactModel(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function findBrand(query) {
  const lower = ` ${query.toLowerCase()} `;
  const aliases = Array.from(ALL_BRAND_ALIASES.keys()).sort((a, b) => b.length - a.length);
  for (const alias of aliases) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    if (new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i').test(lower)) {
      return { brand: ALL_BRAND_ALIASES.get(alias), alias };
    }
  }
  return { brand: '', alias: '' };
}

function findGenericCategory(query) {
  const lower = query.toLowerCase();
  const entries = Array.from(GENERIC_CATEGORIES.entries()).sort((a, b) => b[0].length - a[0].length);
  for (const [phrase, canonical] of entries) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    if (new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i').test(lower)) return canonical;
  }
  return '';
}

// Filler words that carry no product identity on their own. Kept small and
// explicit: this list only decides whether a query looks like it names *some*
// product, never what that product is.
const NON_DESCRIPTIVE_WORDS = new Set([
  'a', 'an', 'the', 'my', 'our', 'your', 'this', 'that', 'these', 'those',
  'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'i', 'we', 'you',
  'and', 'or', 'but', 'for', 'of', 'in', 'on', 'at', 'to', 'from', 'with',
  'about', 'how', 'what', 'when', 'where', 'which', 'who', 'why', 'can',
  'do', 'does', 'did', 'get', 'got', 'need', 'want', 'help', 'please',
  'old', 'new', 'used', 'year', 'years', 'age', 'date', 'made', 'make',
]);

/**
 * Tokens that could plausibly participate in a commercial product name.
 * Used only as a coarse "does this look like it names a product?" signal for
 * the research-trigger policy -- never to infer what the product actually is.
 */
function collectDescriptiveTokens(query, brandAlias = '') {
  const brandTokens = new Set(
    String(brandAlias || '').toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean)
  );
  return String(query || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 2
      && !NON_DESCRIPTIVE_WORDS.has(token)
      && !brandTokens.has(token)
      // Category words are counted as the category signal, not as a
      // descriptive product name, so "refrigerator" alone stays bare.
      && !CATEGORY_WORDS.has(token)
      // A bare number ("2", "15") is only meaningful next to a name, and the
      // name itself is already counted, so numbers never carry the threshold.
      && /[a-z]/i.test(token));
}

function candidateTokens(query, brandAlias) {
  let withoutBrand = query;
  if (brandAlias) {
    const escaped = brandAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    withoutBrand = withoutBrand.replace(new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`, 'ig'), ' ');
  }
  const tokens = withoutBrand.match(/[A-Za-z0-9]+(?:[-./][A-Za-z0-9]+)*/g) || [];
  // A separator run that contains two or more independently complete
  // identifiers ("GE-FR31424IN-GFW850SPN0DG") is a label line joined by
  // hyphens, not one hyphenated model. Split it so the real model is
  // recoverable. Models whose hyphen is structural ("AN515-58") are untouched:
  // their parts are not independently standalone, so the run is left intact.
  const expanded = [];
  for (const token of tokens) {
    const parts = token.split(/[-./]/).filter(Boolean);
    const standaloneParts = parts.filter((part) => looksStandaloneIdentifier(part));
    if (parts.length > 1 && standaloneParts.length >= 2) expanded.push(...parts);
    else expanded.push(token);
  }
  return expanded;
}

function modelShape(value) {
  const raw = String(value || '');
  const compact = compactModel(raw);
  const groups = raw.match(/[A-Za-z]+|\d+/g) || [];
  const alphaGroups = groups.filter((group) => /[A-Za-z]/.test(group));
  const digitGroups = groups.filter((group) => /\d/.test(group));
  return {
    compact,
    groups,
    alphaGroups,
    digitGroups,
    hasSeparator: /[-./]/.test(raw),
    alphaCount: (compact.match(/[A-Z]/g) || []).length,
    digitCount: (compact.match(/\d/g) || []).length,
  };
}

function looksModelLike(value) {
  const { compact } = modelShape(value);
  if (DESCRIPTIVE_MEASUREMENT.test(String(value || '').replace(/\s+/g, ''))) return false;
  if (/^\d+(?:INCH|INCHES|GALLON|GALLONS|GAL|LB|LBS|TON|TONS|BTU|WATT|WATTS|KW|VOLT|VOLTS|HZ)$/.test(compact)) return false;
  return compact.length >= 4 && /[A-Z]/.test(compact) && /\d/.test(compact);
}

function modelCompletenessFor(value, brandAlias) {
  const shape = modelShape(value);
  if (!shape.compact) return 'none';
  if (shape.compact.length <= 5) return 'partial';
  if (shape.compact.length > 28 && !shape.hasSeparator) return 'partial';
  if (shape.alphaCount < 2 || shape.digitCount < 2) return 'partial';
  if (!brandAlias && !shape.hasSeparator) return 'partial';
  if (shape.hasSeparator || shape.groups.length >= 3) return 'exact';
  if (brandAlias && shape.alphaGroups.length >= 1 && shape.digitGroups.length >= 1) return 'exact';
  return 'partial';
}

// Explicit "model:"/"serial:"/"s/n:" labels are the only zero-risk way to
// assign token roles, so they are honored before any shape-based reasoning.
// Returns the labeled values plus the query with those label+value pairs
// removed, so downstream shape-based selection never re-considers them.
// Alternation is first-match-wins, so the longer label spellings MUST precede
// their prefixes -- otherwise "model no. X" matches bare "model" and captures
// "no" as the identifier value.
const IDENTIFIER_LABEL_PATTERN = /\b(serial\s*(?:number|no\.?|#)|serial|model\s*(?:number|no\.?|#)|model|s\/n|sn)\s*[:#-]?\s*([A-Za-z0-9]+(?:[-./][A-Za-z0-9]+)*)/gi;

export function extractLabeledIdentifiers(query) {
  const source = String(query || '');
  let labeledModel = '';
  let labeledSerial = '';
  let residual = source;
  const matches = [...source.matchAll(IDENTIFIER_LABEL_PATTERN)];
  for (const match of matches) {
    const label = match[1].toLowerCase().replace(/[\s.]/g, '');
    const value = match[2];
    if (!value) continue;
    const isSerial = label.startsWith('serial') || label === 's/n' || label === 'sn';
    if (isSerial && !labeledSerial) labeledSerial = value;
    else if (!isSerial && !labeledModel) labeledModel = value;
    residual = residual.replace(match[0], ' ');
  }
  return { labeledModel, labeledSerial, residual: residual.replace(/\s+/g, ' ').trim() };
}

// Two tokens that are EACH independently a complete identifier (e.g. a serial
// and a model on one label line) are two distinct identifiers, never one model
// split across a space. Joining them produced the demonstrated
// "FR31424IN" + "GFW850SPN0DG" -> "FR31424INGFW850SPN0DG" collapse, which then
// won candidate selection outright because candidates are sorted longest-first.
// The join is still allowed when at least one side is only a fragment
// ('partial'), which is the case it was written for (a model split by a stray
// space), so that behavior is preserved.
// Brand-independent test for "this token could stand alone as a full
// identifier". modelCompletenessFor cannot serve here: without a brand alias it
// reports 'partial' for any separator-less token, so an unbranded
// "GFW850SPN0DG FR31424IN" would still be joined. Thresholds are deliberately
// conservative -- a genuine split fragment ("QN65", "WM") fails this test, so
// the legitimate join case is preserved.
function looksStandaloneIdentifier(value) {
  const shape = modelShape(value);
  return shape.compact.length >= 8 && shape.alphaCount >= 2 && shape.digitCount >= 2;
}

function canJoinTokens(token, next, brandAlias) {
  if (!looksModelLike(token) || !looksModelLike(next)) return false;
  if (compactModel(`${token}${next}`).length > 32) return false;
  // Two independently complete identifiers are two distinct identifiers (a
  // serial and a model on one label line), never one model split by a space.
  if (looksStandaloneIdentifier(token) && looksStandaloneIdentifier(next)) return false;
  const tokenComplete = modelCompletenessFor(token, brandAlias) === 'exact';
  const nextComplete = modelCompletenessFor(next, brandAlias) === 'exact';
  return !(tokenComplete && nextComplete);
}

function chooseModel(query, brandAlias) {
  const tokens = candidateTokens(query, brandAlias).filter((token) => !MODEL_STOP_WORDS.has(token.toLowerCase()));
  const candidates = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (looksModelLike(token)) candidates.push(token);
    const next = tokens[index + 1];
    if (next && canJoinTokens(token, next, brandAlias)) candidates.push(`${token}${next}`);
  }
  candidates.sort((a, b) => compactModel(b).length - compactModel(a).length);
  const selected = candidates[0] || '';
  const identity = compactModel(selected);
  if (!identity) return { model: '', modelIdentity: '', modelCompleteness: 'none' };

  const completeness = modelCompletenessFor(selected, brandAlias);
  return { model: selected.toUpperCase(), modelIdentity: identity, modelCompleteness: completeness };
}

// Identifier tokens the query offered that were NOT selected as the model.
// These are reported as ambiguous candidates rather than assigned a role:
// without an explicit label or corroborating evidence, deciding which of two
// complete identifiers is "the serial" would be a guess.
function collectResidualIdentifiers(query, brandAlias, selectedModelIdentity) {
  return candidateTokens(query, brandAlias)
    .filter((token) => !MODEL_STOP_WORDS.has(token.toLowerCase()))
    .filter((token) => looksModelLike(token))
    .map((token) => compactModel(token))
    // Exclude any token the selected model already consumed. When the model was
    // assembled by joining a split fragment ("QN65" + "Q80A"), its parts are
    // part of the model, not separate identifiers -- reporting them would also
    // make "QN65-Q80A" and "QN65 Q80A" produce different cache identities for
    // what is the same product.
    .filter((token) => token && !selectedModelIdentity.includes(token));
}

function canonicalizeQuery(query, brand, category, modelIdentity, productFamily) {
  if (brand && modelIdentity) return `${brand.toLowerCase()} ${modelIdentity.toLowerCase()}`;
  if (modelIdentity) return modelIdentity.toLowerCase();
  if (brand && productFamily) return `${brand.toLowerCase()} ${productFamily.toLowerCase()}`;
  if (brand && category) return `${brand.toLowerCase()} ${category}`;
  if (brand) return brand.toLowerCase();
  if (category) return category;
  return query.toLowerCase().replace(/\s*[-./]\s*/g, '-');
}

const SCREEN_SIZE_PATTERN = /(\d{2,3})\s*(?:"|”|-?inch(?:es)?\b|-inch|\bin\b|-?class\b)/i;

// Small, deterministic seed layer for recognizing TV-style marketing/retailer
// product titles even when no exact model number is present. Each seed remains
// brand- and category-scoped so short family tokens never become global model
// guesses.
const TV_PRODUCT_FAMILY_SEEDS = [
  {
    brand: 'Samsung',
    categoryHint: 'television',
    familyPattern: /Q(\d{2})([A-Z]{0,2})/,
    buildFamily: (match) => `Q${match[1]} Series`,
    buildSeriesLine: (match) => `Q${match[1]} Series`,
  },
  {
    brand: 'LG',
    categoryHint: 'television',
    familyPattern: /\b(?:OLED[\s-]*)?([BCG])\s*-?\s*([23])\b/,
    exactModelPattern: /\bOLED[\s-]*(42|48|55|65|77|83|97)[\s-]*([BCG][23])[\s-]*([A-Z0-9]{3,5})\b/,
    allowedFamilies: new Set(['B3', 'C2', 'C3', 'G3']),
    buildFamily: (match) => `${match[1]}${match[2]}`,
    buildSeriesLine: (match) => `OLED ${match[1]}${match[2]}`,
  },
];

// Samsung's TV model-number suffix letter is a publicly documented
// model-YEAR-FAMILY convention (e.g. QN65Q60RAFXZA -> "R" = 2019-family).
// This is deliberately kept separate from any estimatedYear/productionRange
// field so it can never be read as a claimed manufacture date.
const SAMSUNG_TV_MODEL_YEAR_FAMILIES = {
  R: { year: 2019, label: 'R-series (2019 model-year family)' },
  T: { year: 2020, label: 'T-series (2020 model-year family)' },
  A: { year: 2021, label: 'A-series (2021 model-year family)' },
  B: { year: 2022, label: 'B-series (2022 model-year family)' },
  C: { year: 2023, label: 'C-series (2023 model-year family)' },
  D: { year: 2024, label: 'D-series (2024 model-year family)' },
};

const LG_TV_MODEL_YEAR_FAMILY = {
  B3: { year: 2023, label: '2023 LG OLED B3 model-year family' },
  C2: { year: 2022, label: '2022 LG OLED C2 model-year family' },
  C3: { year: 2023, label: '2023 LG OLED C3 model-year family' },
  G3: { year: 2023, label: '2023 LG OLED G3 model-year family' },
};

function findScreenSize(query) {
  const match = query.match(SCREEN_SIZE_PATTERN);
  if (!match) return null;
  const size = Number.parseInt(match[1], 10);
  return Number.isInteger(size) && size >= 10 && size <= 120 ? size : null;
}

function findGeneralProductFamily(query, brand, genericCategory) {
  const match = matchGeneralFamily(query, brand, genericCategory);
  if (!match) return null;
  return {
    brand: match.brand,
    family: match.familyName,
    seriesLine: match.modelLineName || match.seriesLine,
    category: match.category,
    screenSize: null,
    exactModel: match.exactModel,
    modelYearFamilyLetter: null,
    modelYearFamilyYear: null,
    modelYearFamilyLabel: null,
    familyId: match.familyId,
    modelLineId: match.modelLineId,
    modelLineName: match.modelLineName,
    modelLineToken: match.modelLineToken,
    formFactor: match.formFactor || null,
    formFactorLabel: match.formFactorLabel || null,
    productRole: match.productRole || null,
  };
}

// A bare Dell/Lenovo/HP-style service tag or serial identifies one exact
// original unit through the manufacturer's own lookup tool, not through a
// model-number pattern this project can decode -- so it must never be
// scored as a model token by chooseModel/looksModelLike, and a query built
// entirely from one (no brand/category/family recognized alongside it)
// must never reach grounded replacement research purely on the strength of
// looking "model-like." Dell service tags are canonically 7 characters;
// Lenovo/HP serials vary more, so only the explicit "service tag"/"asset
// tag" phrasing is trusted for those brands -- a bare 7-character token is
// treated as service-tag-like only when nothing else in the query was
// recognized, keeping this conservative in the same direction as
// isLikelyUnusableQuery.
const SERVICE_TAG_PHRASE = /\b(?:service|asset)\s*tag\b/i;
const BARE_SERVICE_TAG_SHAPE = /^[A-Z0-9]{7}$/;

export function isServiceTagIntent(query) {
  return SERVICE_TAG_PHRASE.test(String(query || ''));
}

function looksLikeBareServiceTag(query) {
  const tokens = String(query || '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length !== 1) return false;
  const token = tokens[0].toUpperCase();
  if (!BARE_SERVICE_TAG_SHAPE.test(token)) return false;
  return /[A-Z]/.test(token) && /\d/.test(token);
}

function findProductFamily(query, brand, genericCategory) {
  const upper = query.toUpperCase();
  for (const seed of TV_PRODUCT_FAMILY_SEEDS) {
    const exactMatch = seed.exactModelPattern ? upper.match(seed.exactModelPattern) : null;
    const explicitBrand = normalizeBrandIdentity(brand) === normalizeBrandIdentity(seed.brand);
    if (brand && !explicitBrand) continue;
    if (!explicitBrand && !exactMatch) continue;
    const match = upper.match(seed.familyPattern);
    if (!match && !exactMatch) continue;
    const isTvContext = genericCategory === 'television'
      || /\b(TV|QLED|OLED|UHD|4K|TIZEN)\b/.test(upper)
      || Boolean(exactMatch)
      || (seed.brand === 'Samsung' && Boolean(match));
    if (!isTvContext) continue;
    const family = seed.brand === 'LG' && exactMatch ? exactMatch[2] : seed.buildFamily(match);
    if (seed.allowedFamilies && !seed.allowedFamilies.has(family)) continue;

    if (seed.brand === 'LG') {
      const modelYearFamily = LG_TV_MODEL_YEAR_FAMILY[family] || null;
      const exactModel = exactMatch
        ? `OLED${exactMatch[1]}${exactMatch[2]}${exactMatch[3]}`
        : null;
      return {
        brand: seed.brand,
        family,
        seriesLine: `OLED ${family}`,
        category: seed.categoryHint,
        screenSize: exactMatch ? Number.parseInt(exactMatch[1], 10) : null,
        exactModel,
        modelYearFamilyLetter: null,
        modelYearFamilyYear: modelYearFamily ? modelYearFamily.year : null,
        modelYearFamilyLabel: modelYearFamily ? modelYearFamily.label : null,
      };
    }

    const suffix = match[2] || '';
    const yearLetter = suffix ? suffix[0] : null;
    const modelYearFamily = yearLetter ? SAMSUNG_TV_MODEL_YEAR_FAMILIES[yearLetter] || null : null;
    return {
      brand: seed.brand,
      family,
      seriesLine: seed.buildSeriesLine(match),
      category: seed.categoryHint,
      screenSize: null,
      exactModel: null,
      modelYearFamilyLetter: yearLetter,
      modelYearFamilyYear: modelYearFamily ? modelYearFamily.year : null,
      modelYearFamilyLabel: modelYearFamily ? modelYearFamily.label : null,
    };
  }
  return null;
}

export function classifySmartLookupQuery(value) {
  const query = normalizeKnownQuery(value);
  const normalizedQuery = query.toLowerCase();
  const { brand, alias } = findBrand(query);
  const genericCategory = findGenericCategory(query);
  const productFamilyInfo = findProductFamily(query, brand, genericCategory) || findGeneralProductFamily(query, brand, genericCategory);
  const classifiedBrand = brand || (productFamilyInfo ? productFamilyInfo.brand : '');
  // Explicit labels win over shape-based selection: "Serial: X Model: Y" states
  // the roles outright, so there is nothing to infer.
  const labeled = extractLabeledIdentifiers(query);
  let modelInfo = labeled.labeledModel
    ? {
        model: labeled.labeledModel.toUpperCase(),
        modelIdentity: compactModel(labeled.labeledModel),
        modelCompleteness: modelCompletenessFor(labeled.labeledModel, alias || classifiedBrand),
      }
    : chooseModel(query, alias);
  if (productFamilyInfo?.exactModel) {
    modelInfo = {
      model: productFamilyInfo.exactModel,
      modelIdentity: productFamilyInfo.exactModel,
      modelCompleteness: 'exact',
    };
  } else if (productFamilyInfo?.modelLineToken) {
    // A registry model-line match (e.g. "AN515-58") is authoritative over
    // the generic hasSeparator-implies-exact heuristic in
    // modelCompletenessFor -- that heuristic would otherwise wrongly treat
    // any hyphenated token as an exact model regardless of whether the
    // brand's own configuration suffix was actually provided.
    modelInfo = {
      model: productFamilyInfo.modelLineToken,
      modelIdentity: compactModel(productFamilyInfo.modelLineToken),
      modelCompleteness: 'partial',
    };
  }

  const productFamily = productFamilyInfo ? productFamilyInfo.family : null;
  const productType = genericCategory || (productFamilyInfo ? productFamilyInfo.category : null) || null;
  const exactModel = modelInfo.modelCompleteness === 'exact' ? modelInfo.modelIdentity : null;
  const screenSize = (productFamilyInfo && productFamilyInfo.screenSize) || findScreenSize(query);
  // A registry model-line match (e.g. "AN515-58" without the configuration
  // suffix) is a distinct, narrower tier than a bare product-family name
  // match ("Nitro 5" alone) -- see querySpecificity below.
  const modelLineId = !exactModel && productFamilyInfo ? productFamilyInfo.modelLineId || null : null;
  const modelLineName = !exactModel && productFamilyInfo ? productFamilyInfo.modelLineName || null : null;
  const familyId = productFamilyInfo ? productFamilyInfo.familyId || null : null;

  let specificityLevel = 'unknown';
  if (exactModel) specificityLevel = 'specific';
  else if (productFamily || modelInfo.modelCompleteness === 'partial') specificityLevel = 'partial';
  else if (classifiedBrand) specificityLevel = 'brand-only';
  else if (genericCategory) specificityLevel = 'generic';

  const isMarketingDescription = Boolean(!exactModel && (productFamily || screenSize));
  const isProductFamilyQuery = Boolean(productFamily && !exactModel);
  const isSerialOnly = !classifiedBrand && !genericCategory && !productFamily && specificityLevel === 'unknown';
  const isModelOnly = Boolean(exactModel) && !classifiedBrand && !genericCategory;
  const needsExactModel = Boolean(!exactModel && (isMarketingDescription || productFamily));

  // Progressive-specificity taxonomy (additive; specificityLevel above is
  // kept unchanged for backward compatibility with existing callers/tests).
  // See docs/smart-lookup-architecture.md for the full tier definitions.
  // A bare service-tag-like token with no other recognized identity is
  // treated the same as an unusable query for grounded-research purposes:
  // it is real input, but it names one unit through the manufacturer's own
  // lookup, not a model, so it must not be scored as if it were a partial
  // model number -- see looksLikeBareServiceTag above.
  const serviceTagIntent = isServiceTagIntent(query);
  const isServiceTagOnly = isSerialOnly && (serviceTagIntent || looksLikeBareServiceTag(query));
  const isUnusable = (isSerialOnly && isLikelyUnusableQuery(query, {
    classifiedBrand, genericCategory, productFamily, exactModel,
    modelCompleteness: modelInfo.modelCompleteness,
  })) || isServiceTagOnly;
  let querySpecificity;
  if (isUnusable) querySpecificity = 'unusable';
  else if (exactModel) querySpecificity = 'exact-model';
  else if (modelLineId) querySpecificity = 'model-line';
  else if (productFamily) querySpecificity = 'product-family';
  else if (classifiedBrand && genericCategory) querySpecificity = 'brand-category';
  else if (classifiedBrand) querySpecificity = 'brand-only';
  else if (genericCategory) querySpecificity = 'category-only';
  else querySpecificity = 'free-description';

  // A "meaningful" brand-category query -- a recognized brand AND a
  // recognized category together (e.g. "Whirlpool top-load washer",
  // "Rheem gas water heater") -- carries enough signal to be worth a
  // bounded grounded-research attempt for broad era/availability guidance.
  // A bare brand with no category (or a category with no brand, which is
  // 'category-only', not 'brand-category') stays deterministic-only: the
  // audit found no demonstrated benefit from grounding that thin a signal.
  const isMeaningfulBrandCategory = querySpecificity === 'brand-category'
    && Boolean(classifiedBrand)
    && Boolean(genericCategory);

  // Research-trigger policy (usefulness-first).
  //
  // Previously `groundedEligible` was a narrow allowlist of specificity
  // tiers, which made deterministic classification a *gatekeeper*: a query
  // the local parser failed to fully classify was denied research entirely
  // and fell through to a clarification card. That inverted the product
  // intent -- the queries the local parser understands least are exactly the
  // ones that most need research. Classification now supplies hints to the
  // provider instead of deciding whether research is permitted.
  //
  // Research runs whenever the query carries at least one meaningful product
  // signal, and is withheld only for genuinely unusable input.
  // Tokens left after removing the recognized brand, recognized category
  // words, and pure filler -- i.e. the part of the query that actually names
  // a *product* rather than a brand or a category. "Nintendo Switch 2" keeps
  // ["switch"]; a bare "Whirlpool" or bare "refrigerator" keeps nothing.
  const descriptiveTokens = collectDescriptiveTokens(query, alias);
  const hasProductSignal = Boolean(
    // A model-like token or a recognized family is a product signal on its own.
    modelInfo.modelCompleteness !== 'none'
    || productFamily
    // Brand AND category together carry enough for broad era guidance -- the
    // pre-existing "meaningful brand-category" rule, preserved.
    || (classifiedBrand && genericCategory)
    // A recognized brand or category PLUS anything descriptive names a
    // specific product line ("Nintendo Switch 2", "PlayStation 5 Slim").
    || ((classifiedBrand || genericCategory) && descriptiveTokens.length >= 1)
    // An unrecognized multi-word phrase is still very often a real
    // commercial product name. Two tokens keeps single stray words out.
    || descriptiveTokens.length >= 2
  );
  // A bare brand ("Whirlpool") or bare category ("refrigerator") is
  // deliberately NOT research-eligible: there is no product to identify, so
  // a provider call could only restate the brand card while consuming paid
  // budget. Those keep their existing instant deterministic answer.
  const researchEligible = !isUnusable && hasProductSignal;

  // Grounded (live web search) research follows the same trigger policy:
  // these queries are precisely the ones whose answers are not reliably in
  // model parametric memory (recent product launches, obscure model tokens),
  // so closed-book-only would defeat the purpose. Bounded by the existing
  // route deadline, per-IP limiter, and daily global provider budget --
  // no new timeout or cost ceiling is introduced here.
  const groundedEligible = researchEligible;
  const familyContext = classifiedBrand && familyId ? getGeneralFamilyContext(classifiedBrand, familyId) : null;
  const refinementIdentifiers = familyContext?.refinementIdentifiers || [];
  const familyConfidence = familyContext?.confidence || null;

  // Deliberately narrower than age's `groundedEligible`: LKQ grounded
  // research names a *replacement product*, which is a stronger claim than
  // an age/date range, so a product-family match only qualifies when the
  // registry itself has at least medium confidence in that family
  // (`familyConfidence !== 'low'`) -- see Phase 4 in
  // docs/smart-lookup-architecture.md. A category/brand match with no
  // recognized family, or a family/genericCategory pairing that disagrees
  // (e.g. a desktop-computer family matched alongside an explicit,
  // different recognized category elsewhere in the query), never qualifies
  // -- there is not enough identity to avoid an arbitrary category-wide
  // product match.
  const hasConflictingCategoryEvidence = Boolean(
    genericCategory && productFamilyInfo?.category && genericCategory !== productFamilyInfo.category
  );
  const lkqGroundedEligible = !hasConflictingCategoryEvidence && (
    querySpecificity === 'exact-model'
    || querySpecificity === 'model-line'
    || (querySpecificity === 'product-family' && familyConfidence && familyConfidence !== 'low')
  );

  // Replacement-specific precision taxonomy (Phase 2, additive). Kept
  // distinct from `querySpecificity` (age/date semantics) even though the
  // two overlap for most tiers today, so age and replacement can diverge
  // later without a breaking rename. 'exact-configuration' is not derived
  // here -- it requires user-notes evidence of a fully specified build,
  // which is only available to the LKQ route after notes are attached to
  // queryInfo; see deriveReplacementPrecision below.
  let replacementPrecision;
  if (querySpecificity === 'unusable') replacementPrecision = 'unusable';
  else if (querySpecificity === 'exact-model') replacementPrecision = 'exact-model';
  else if (querySpecificity === 'model-line') replacementPrecision = 'model-line';
  else if (querySpecificity === 'product-family') replacementPrecision = 'product-family';
  else if (querySpecificity === 'brand-category') replacementPrecision = 'brand-category';
  else replacementPrecision = 'category-guidance';

  const formFactor = productFamilyInfo ? productFamilyInfo.formFactor || null : null;
  const formFactorLabel = productFamilyInfo ? productFamilyInfo.formFactorLabel || null : null;
  const productRole = productFamilyInfo ? productFamilyInfo.productRole || null : null;
  const knownConfigurationVariants = familyContext?.configurationVariants || [];
  const comparisonCriteria = familyContext?.comparisonCriteria || [];
  const recommendedMinimumSpecs = familyContext?.recommendedMinimumSpecs || [];
  const serviceTagNote = familyContext?.serviceTagNote || null;

  const canonicalQuery = canonicalizeQuery(query, classifiedBrand, productType, modelInfo.modelIdentity, productFamily);
  // Structured identifier fields. `serialIdentity` is populated ONLY from an
  // explicit label -- an unlabeled second identifier stays in
  // `ambiguousIdentifiers` rather than being guessed into a serial role, so a
  // service tag, part number, or SKU can never be silently promoted.
  const residualIdentifiers = collectResidualIdentifiers(query, alias, modelInfo.modelIdentity);
  const serialIdentity = labeled.labeledSerial ? compactModel(labeled.labeledSerial) : '';
  const ambiguousIdentifiers = residualIdentifiers.filter((token) => token !== serialIdentity);
  return {
    query,
    normalizedQuery,
    canonicalQuery,
    brand: classifiedBrand,
    genericCategory,
    ...modelInfo,
    serialIdentity,
    serialSource: serialIdentity ? 'labeled' : 'none',
    ambiguousIdentifiers,
    specificityLevel,
    // A truly unusable query (empty, keyboard-mash, pure noise) never
    // reaches the provider; every other "unknown" case keeps the existing
    // let-the-model-try behavior. A meaningful brand-category query (brand
    // AND category both recognized) is also provider-eligible for bounded
    // grounded research -- a bare brand or bare category alone is not.
    // Provider eligibility now follows the same usefulness-first research
    // policy. The former rule excluded a bare recognized brand with no
    // category word, which silently blocked real, fully-identifiable
    // products ("Nintendo Switch 2", "Dell XPS 15 9530") from ever reaching
    // research -- the brand was recognized, and that was held *against* the
    // query. Only genuinely unusable input is withheld now.
    providerEligible: researchEligible,
    interpretationRequired: specificityLevel === 'unknown',
    productType,
    productFamily,
    seriesLine: productFamilyInfo ? productFamilyInfo.seriesLine : null,
    screenSize,
    exactModel,
    modelYearFamilyLetter: productFamilyInfo ? productFamilyInfo.modelYearFamilyLetter : null,
    modelYearFamilyYear: productFamilyInfo ? productFamilyInfo.modelYearFamilyYear : null,
    modelYearFamilyLabel: productFamilyInfo ? productFamilyInfo.modelYearFamilyLabel : null,
    querySpecificity,
    researchEligible,
    hasProductSignal,
    groundedEligible,
    recognizedBrand: classifiedBrand || null,
    recognizedCategory: productType,
    recognizedFamily: productFamily,
    recognizedSeries: modelLineName,
    recognizedModel: exactModel,
    familyId,
    modelLineId,
    modelLineName,
    refinementIdentifiers,
    isProductFamilyQuery,
    isMarketingDescription,
    isSerialOnly,
    isModelOnly,
    needsExactModel,
    // Replacement-specific fields (Phase 2/3, additive). See
    // docs/smart-lookup-architecture.md "Progressive LKQ specificity".
    replacementPrecision,
    lkqGroundedEligible,
    familyConfidence,
    formFactor,
    formFactorLabel,
    productRole,
    knownConfigurationVariants,
    comparisonCriteria,
    recommendedMinimumSpecs,
    serviceTagNote,
    serviceTagIntent,
  };
}

export function getVerifiedModelKey(queryInfo) {
  if (!queryInfo?.brand || queryInfo?.modelCompleteness !== 'exact' || !queryInfo.modelIdentity) return null;
  return `decoder-verified:${queryInfo.brand.toLowerCase().replace(/[^a-z0-9]/g, '')}:${queryInfo.modelIdentity}`;
}

export function normalizeBrandIdentity(value) {
  return String(value || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
}

export function isSameModel(a, b) {
  const left = compactModel(a);
  const right = compactModel(b);
  return Boolean(left && right && left === right);
}

// At least two distinct spec categories mentioned in user-supplied notes
// (untrusted free text) alongside an exact model is treated as "the user
// told us the actual build," upgrading replacementPrecision from
// exact-model to exact-configuration. Deliberately requires 2+ categories
// -- a single stray word (e.g. notes mentioning only "SSD") is not treated
// as a fully specified configuration.
const CONFIG_SPEC_KEYWORD_GROUPS = [
  /\b(?:cpu|processor|core\s*i[3579]|ryzen)\b/i,
  /\b(?:ram|memory)\b/i,
  /\b(?:ssd|hdd|storage|hard\s*drive)\b/i,
  /\b(?:gpu|graphics|video\s*card)\b/i,
];

export function deriveReplacementPrecision(queryInfo, notes) {
  const base = queryInfo?.replacementPrecision || 'unusable';
  if (base !== 'exact-model') return base;
  const text = String(notes || '');
  const matchedGroups = CONFIG_SPEC_KEYWORD_GROUPS.filter((pattern) => pattern.test(text)).length;
  return matchedGroups >= 2 ? 'exact-configuration' : base;
}
