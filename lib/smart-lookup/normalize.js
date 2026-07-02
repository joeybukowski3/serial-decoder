const BRAND_ALIASES = new Map([
  ['a.o. smith', 'A.O. Smith'], ['ao smith', 'A.O. Smith'], ['amana', 'Amana'],
  ['apple', 'Apple'], ['asus', 'ASUS'], ['bosch', 'Bosch'], ['bradford white', 'Bradford White'],
  ['bryant', 'Bryant'], ['carrier', 'Carrier'], ['electrolux', 'Electrolux'],
  ['frigidaire', 'Frigidaire'], ['ge', 'GE'], ['general electric', 'GE'], ['goodman', 'Goodman'],
  ['google', 'Google'], ['hotpoint', 'Hotpoint'], ['hp', 'HP'], ['jenn-air', 'Jenn-Air'],
  ['jennair', 'Jenn-Air'], ['kenmore', 'Kenmore'], ['kitchenaid', 'KitchenAid'],
  ['lennox', 'Lennox'], ['lg', 'LG'], ['maytag', 'Maytag'], ['nintendo', 'Nintendo'],
  ['panasonic', 'Panasonic'], ['payne', 'Payne'], ['rheem', 'Rheem'], ['roper', 'Roper'],
  ['ruud', 'Ruud'], ['samsung', 'Samsung'], ['sony', 'Sony'], ['speed queen', 'Speed Queen'],
  ['sub-zero', 'Sub-Zero'], ['sub zero', 'Sub-Zero'], ['trane', 'Trane'], ['vizio', 'Vizio'],
  ['whirlpool', 'Whirlpool'], ['whisker', 'Whisker'], ['york', 'York'],
]);

const GENERIC_CATEGORIES = new Map([
  ['air conditioner', 'air conditioner'], ['air conditioning', 'air conditioner'], ['ac unit', 'air conditioner'],
  ['dishwasher', 'dishwasher'], ['dryer', 'dryer'], ['electrical panel', 'electrical panel'],
  ['breaker box', 'electrical panel'], ['freezer', 'freezer'], ['furnace', 'furnace'],
  ['generator', 'generator'], ['heat pump', 'heat pump'], ['laptop', 'laptop'], ['microwave', 'microwave'],
  ['oven', 'oven'], ['phone', 'phone'], ['printer', 'printer'], ['range', 'range'],
  ['refrigerator', 'refrigerator'], ['fridge', 'refrigerator'], ['tablet', 'tablet'],
  ['television', 'television'], ['tv', 'television'], ['washer', 'washer'], ['washing machine', 'washer'],
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
  const aliases = Array.from(BRAND_ALIASES.keys()).sort((a, b) => b.length - a.length);
  for (const alias of aliases) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    if (new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i').test(lower)) {
      return { brand: BRAND_ALIASES.get(alias), alias };
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

function candidateTokens(query, brandAlias) {
  let withoutBrand = query;
  if (brandAlias) {
    const escaped = brandAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    withoutBrand = withoutBrand.replace(new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`, 'ig'), ' ');
  }
  return withoutBrand.match(/[A-Za-z0-9]+(?:[-./][A-Za-z0-9]+)*/g) || [];
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

function chooseModel(query, brandAlias) {
  const tokens = candidateTokens(query, brandAlias).filter((token) => !MODEL_STOP_WORDS.has(token.toLowerCase()));
  const candidates = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (looksModelLike(token)) candidates.push(token);
    const next = tokens[index + 1];
    if (next && looksModelLike(token) && looksModelLike(next)) {
      const joined = `${token}${next}`;
      if (compactModel(joined).length <= 32) candidates.push(joined);
    }
  }
  candidates.sort((a, b) => compactModel(b).length - compactModel(a).length);
  const selected = candidates[0] || '';
  const identity = compactModel(selected);
  if (!identity) return { model: '', modelIdentity: '', modelCompleteness: 'none' };

  const completeness = modelCompletenessFor(selected, brandAlias);
  return { model: selected.toUpperCase(), modelIdentity: identity, modelCompleteness: completeness };
}

function canonicalizeQuery(query, brand, category, modelIdentity) {
  if (brand && modelIdentity) return `${brand.toLowerCase()} ${modelIdentity.toLowerCase()}`;
  if (modelIdentity) return modelIdentity.toLowerCase();
  if (brand && category) return `${brand.toLowerCase()} ${category}`;
  if (brand) return brand.toLowerCase();
  if (category) return category;
  return query.toLowerCase().replace(/\s*[-./]\s*/g, '-');
}

export function classifySmartLookupQuery(value) {
  const query = normalizeKnownQuery(value);
  const normalizedQuery = query.toLowerCase();
  const { brand, alias } = findBrand(query);
  const genericCategory = findGenericCategory(query);
  const modelInfo = chooseModel(query, alias);
  let specificityLevel = 'unknown';

  if (modelInfo.modelCompleteness === 'exact') specificityLevel = 'specific';
  else if (modelInfo.modelCompleteness === 'partial') specificityLevel = 'partial';
  else if (brand && genericCategory) specificityLevel = 'brand-only';
  else if (brand) specificityLevel = 'brand-only';
  else if (genericCategory) specificityLevel = 'generic';

  const canonicalQuery = canonicalizeQuery(query, brand, genericCategory, modelInfo.modelIdentity);
  return {
    query,
    normalizedQuery,
    canonicalQuery,
    brand,
    genericCategory,
    ...modelInfo,
    specificityLevel,
    providerEligible: ['specific', 'partial', 'unknown'].includes(specificityLevel),
    interpretationRequired: specificityLevel === 'unknown',
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
