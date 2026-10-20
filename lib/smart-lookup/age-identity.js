import { compactModel, isSameModel, normalizeBrandIdentity } from './normalize.js';

const GENERIC_WORDS = new Set([
  'all', 'and', 'age', 'appliance', 'computer', 'desktop', 'dryer', 'for', 'in', 'inch',
  'laptop', 'lcd', 'led', 'model', 'number', 'one', 'printer', 'refrigerator', 'serial', 'series', 'tablet',
  'television', 'the', 'united', 'states', 'washer', 'with',
]);
// Evidence labels of results that a research provider produced (as opposed to
// local, static or user-verified data).
const PROVIDER_EVIDENCE = /^(?:gemini|groq|xai|openai|serper)-/;
// "4K", "120 Hz", "65-inch": a number plus a unit describes a spec, never a model.
const SPEC_PHRASE = /(?<![a-z\d])\d+(?:\.\d+)?[\s-]*(?:hz|ghz|mhz|gb|tb|mb|mp|mah|kg|lbs?|mm|cm|inch|in|ft|cu|w|v|k|p|g|l)(?![a-z\d])/gi;

// Fields a provider or cache entry can use to say which product this is. Each
// is judged on its own: one matching field never launders a contradicting one.
const IDENTITY_FIELDS = ['exactModel', 'model', 'likelyProduct', 'displayName', 'identifiedProduct'];
// Broader than a model, so they may only contradict, never establish identity.
const FAMILY_FIELDS = ['productFamily', 'series', 'seriesLine'];
// A dated claim describes one product, so it needs an identity to attach to.
const YEAR_CLAIM_FIELDS = [
  'bestEstimateYear', 'introductionYear', 'estimatedYear', 'familyIntroductionYear',
  'lineIntroductionYear', 'categoryEntryYear', 'modelYearFamilyYear', 'individualManufactureYear',
  'manufactureYearCandidates', 'yearVariants', 'yearRange', 'productionRange', 'estimatedRange',
  'familyRange', 'modelLineRange', 'generationRange', 'estimatedAgeRange', 'estimatedEra',
  'releaseDate', 'endOfRetailAvailability', 'endOfManufacturerSupport',
];
const YEAR_LIKE = /^(?:19|20)\d\d$/;

function words(value) {
  return String(value || '').toLowerCase().match(/[a-z0-9]+/g) || [];
}

function isIdentifier(word) {
  return /\d/.test(word) && (/[a-z]/.test(word) || word.length >= 3);
}

function hasValue(value) {
  if (value == null || value === false || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  return typeof value !== 'object' || Object.keys(value).length > 0;
}

// A range context carries startYear/endYear and no value, so every year slot counts.
function hasYearContextClaim(context) {
  return Boolean(context && typeof context === 'object' && context.type !== 'unknown'
    && ['value', 'startYear', 'endYear'].some((field) => context[field] != null && context[field] !== ''));
}

function hasYearClaim(result) {
  return YEAR_CLAIM_FIELDS.some((field) => hasValue(result[field])) || hasYearContextClaim(result.yearContext);
}

// Years the server itself derived from the request (a seeded model-year
// family) say nothing about what a provider claimed, so cache validation of
// provider claims ignores them.
const SERVER_YEAR_FIELDS = new Set(['modelYearFamilyYear']);
const SERVER_YEAR_CONTEXT_SOURCES = new Set(['local-seed', 'local-model-evidence', 'serial']);

function hasProviderYearClaim(result) {
  return YEAR_CLAIM_FIELDS.some((field) => !SERVER_YEAR_FIELDS.has(field) && hasValue(result[field]))
    || (hasYearContextClaim(result.yearContext) && !SERVER_YEAR_CONTEXT_SOURCES.has(result.yearContext.source));
}

function segments(word) {
  return word.match(/[a-z]+|\d+/g) || [];
}

// Model-shaped words of a product name, without years and spec phrases.
function modelTokens(value) {
  return words(String(value || '').replace(SPEC_PHRASE, ' '))
    .filter((word) => isIdentifier(word) && !YEAR_LIKE.test(word));
}

// A product-name token ("q60b") belongs to a model ("qn55q60bafxza") when its
// whole letter/digit segments appear in order as whole segments of the model.
// Only a final letter run may be a prefix, because marketing names trim the
// trailing SKU suffix ("q60b" for "...q60bafxza"). Plain substrings do not
// count: "q6" and "q600" are not the "q60" line, "c3" is not inside "nc3".
function modelCarriesToken(model, token) {
  const have = segments(model);
  const wanted = segments(token);
  if (!wanted.length) return false;
  const last = wanted.length - 1;
  for (let start = 0; start + wanted.length <= have.length; start += 1) {
    const matches = wanted.every((segment, offset) => (offset === last && last > 0 && /^[a-z]+$/.test(segment)
      ? have[start + offset].startsWith(segment)
      : have[start + offset] === segment));
    if (matches) return true;
  }
  return false;
}

// True when a product name names the exact model, or at least one model-shaped
// token of it and every such token belongs to that model.
function namesExactModel(value, exactModel) {
  const model = normalizeBrandIdentity(exactModel);
  if (normalizeBrandIdentity(value).includes(model)) return true;
  const tokens = modelTokens(value);
  return tokens.length > 0 && tokens.every((token) => modelCarriesToken(model, token));
}

// A marketing name may drop the SKU, so it is only incompatible when it names a
// model-shaped token that the requested model does not carry.
function compatibleWithExactModel(value, exactModel) {
  const model = normalizeBrandIdentity(exactModel);
  return normalizeBrandIdentity(value).includes(model)
    || modelTokens(value).every((token) => modelCarriesToken(model, token));
}

// A letter+digit request token ("q60", "c3") names a series or line, so an
// exact model that carries it as whole alphanumeric segments ("qn55q60bafxza",
// "oled65c3pua") is a more specific member of it. A raw substring is not enough:
// "c3" is not inside "oled65nc3pua" because that segment is "nc", "3".
function embedsIdentifier(word, id) {
  if (!/[a-z]/.test(id) || !/\d/.test(id)) return false;
  const wanted = segments(id);
  const have = segments(word);
  for (let start = 0; start + wanted.length <= have.length; start += 1) {
    if (wanted.every((segment, offset) => have[start + offset] === segment)) return true;
  }
  return false;
}

function carriesIdentifier(valueWords, id) {
  return valueWords.includes(id) || valueWords.some((word) => embedsIdentifier(word, id));
}

// True when whole words of the value spell the request's model identity
// ("XPS 15" -> "xps15"), so "Dell XPS 15 9530" extends a request for "XPS 15"
// while "XPS 150" and "XPS 13" do not.
function extendsRequestModel(value, queryInfo) {
  const target = compactModel(queryInfo.modelIdentity);
  if (!/[A-Z]/.test(target) || !/\d/.test(target)) return false;
  const valueWords = words(value);
  for (let start = 0; start < valueWords.length; start += 1) {
    let joined = '';
    for (let end = start; end < valueWords.length && joined.length < target.length; end += 1) {
      joined += valueWords[end].toUpperCase();
      if (joined === target) return true;
    }
  }
  return false;
}

function requestIdentifiers(queryInfo) {
  const serial = compactModel(queryInfo.serialIdentity);
  return [...new Set(words(queryInfo.normalizedQuery || queryInfo.query || '')
    .filter(isIdentifier)
    .filter((word) => compactModel(word) !== serial))];
}

function requestModelIds(queryInfo) {
  return queryInfo.exactModel ? [normalizeBrandIdentity(queryInfo.exactModel)] : requestIdentifiers(queryInfo);
}

// True when the field names a model-shaped token that the request does not.
// A year or a field with no model token is neutral, never a contradiction.
function contradictsRequest(value, queryInfo, requestIds, { isFamily = false } = {}) {
  // The normalizer writes the request's own model identity back as the compact model.
  if (isSameModel(value, queryInfo.modelIdentity) || isSameModel(value, queryInfo.exactModel)) return false;
  const valueWords = words(value);
  const tokens = valueWords.filter((word) => isIdentifier(word) && !YEAR_LIKE.test(word));
  if (!tokens.length || !requestIds.length) return false;
  if (isFamily) return tokens.some((token) => !requestIds.some((id) => id.includes(token) || token.includes(id)));
  if (queryInfo.exactModel) return !compatibleWithExactModel(value, queryInfo.exactModel);
  return !requestIds.every((id) => carriesIdentifier(valueWords, id));
}

// A series line that carries every requested model token states the product
// line itself ("XPS 15 9530"); a bare family label ("Galaxy Tab") does not.
function namesRequestedModel(result, requestIds, queryInfo) {
  return ['series', 'seriesLine'].some((field) => result[field]
    && (requestIds.length
      ? requestIds.every((id) => words(result[field]).includes(id))
      : extendsRequestModel(result[field], queryInfo)));
}

// A model-bearing request that has no model-shaped token ("Dell XPS 15") is
// still model-bearing when the classifier extracted a model identity.
// A calendar year in the request ("washer 2015") dates the item; it is not a model.
function requestNamesModel(queryInfo, requestIds) {
  return requestIds.some((id) => !YEAR_LIKE.test(id)) || Boolean(compactModel(queryInfo.modelIdentity));
}

// Without model-shaped request tokens, a product may still be a more specific
// member of the requested line. Every field that carries a model number must
// then agree: one extending field never launders a conflicting one.
function agreesWithRequestedLine(result, queryInfo, request) {
  const fields = IDENTITY_FIELDS.map((field) => result[field]).filter(Boolean).map(String);
  if (!fields.some((value) => extendsRequestModel(value, queryInfo))) return null;
  return fields.every((value) => !words(value).some((word) => /\d/.test(word))
    || extendsRequestModel(value, queryInfo)
    || normalizeBrandIdentity(request).includes(normalizeBrandIdentity(value)));
}

export function isSmartAgeProductCompatible(result, queryInfo) {
  if (!result || !queryInfo) return false;
  if (queryInfo.brand && result.brand
    && normalizeBrandIdentity(result.brand) !== normalizeBrandIdentity(queryInfo.brand)) return false;
  const modelIds = requestModelIds(queryInfo);
  if (IDENTITY_FIELDS.some((field) => result[field]
      && contradictsRequest(String(result[field]), queryInfo, modelIds))
    || FAMILY_FIELDS.some((field) => result[field]
      && contradictsRequest(String(result[field]), queryInfo, modelIds, { isFamily: true }))) return false;
  const identified = IDENTITY_FIELDS.map((field) => result[field]).filter(Boolean).join(' ');
  // Fail closed: for a model-bearing request, a request fingerprint only binds
  // the cache key and cannot stand in for the returned product's identity.
  if (!identified) {
    return !(requestNamesModel(queryInfo, modelIds) && hasYearClaim(result)
      && !namesRequestedModel(result, modelIds, queryInfo));
  }
  const request = queryInfo.normalizedQuery || queryInfo.query || '';
  if (queryInfo.exactModel) {
    if (result.exactModel && !isSameModel(result.exactModel, queryInfo.exactModel)) return false;
    if (result.model && !isSameModel(result.model, queryInfo.exactModel)) return false;
    if (result.likelyProduct && !compatibleWithExactModel(result.likelyProduct, queryInfo.exactModel)) return false;
    return normalizeBrandIdentity(identified).includes(normalizeBrandIdentity(queryInfo.exactModel));
  }
  if (queryInfo.modelIdentity && result.model
    && isSameModel(result.model, queryInfo.modelIdentity)
    && !result.exactModel
    && !words(result.likelyProduct).some((word) => /\d/.test(word))) return true;

  const requestWords = words(request);
  const identifiedWords = words(identified);
  const identifiers = requestIdentifiers(queryInfo);
  if (identifiers.length > 1 && !queryInfo.modelIdentity) return false;
  if (identifiers.length && !identifiers.every((word) => carriesIdentifier(identifiedWords, word))) return false;
  const brandWords = new Set(words(queryInfo.brand));
  // A bare number ("9530") is shared across product lines, so the line word
  // beside it ("XPS") is what tells Dell's XPS 9530 from a Latitude 9530.
  const minWordLength = identifiers.length && identifiers.every((word) => /^\d+$/.test(word)) ? 3 : 4;
  const distinctiveWords = requestWords.filter((word) => word.length >= minWordLength
    && /[a-z]/.test(word) && !brandWords.has(word) && !GENERIC_WORDS.has(word));
  if (identifiers.length && distinctiveWords.length
    && !distinctiveWords.every((word) => identifiedWords.includes(word))) return false;
  if (identifiers.length) {
    if (result.likelyProduct && (!identifiers.every((word) => carriesIdentifier(words(result.likelyProduct), word))
      || (distinctiveWords.length && !distinctiveWords.every((word) => words(result.likelyProduct).includes(word))))) return false;
    for (const model of [result.exactModel, result.model]) {
      if (!model) continue;
      const modelWords = words(model);
      const modelIdentifiers = modelWords.filter((word) => /\d/.test(word));
      if (modelIdentifiers.length && !identifiers.every((word) => carriesIdentifier(modelWords, word))) return false;
      const modelNames = modelWords.filter((word) => word.length >= 4 && /[a-z]/.test(word));
      if (modelNames.length && distinctiveWords.length
        && !modelNames.some((word) => distinctiveWords.includes(word))) return false;
    }
    return true;
  }

  const lineVerdict = agreesWithRequestedLine(result, queryInfo, request);
  if (lineVerdict !== null) return lineVerdict;

  // A named product without a model-shaped token must match the request's
  // complete product phrase. A bare brand/category cannot establish a model.
  if (result.likelyProduct) {
    const product = normalizeBrandIdentity(result.likelyProduct);
    const brand = normalizeBrandIdentity(result.brand);
    const namedProduct = brand && product.startsWith(brand) ? product.slice(brand.length) : product;
    if (!namedProduct || !normalizeBrandIdentity(request).includes(namedProduct)) return false;
  }
  const model = result.exactModel || result.model;
  if (model && normalizeBrandIdentity(request).includes(normalizeBrandIdentity(model))) return true;
  if (result.likelyProduct && normalizeBrandIdentity(request).includes(normalizeBrandIdentity(result.likelyProduct))) return true;
  return normalizeBrandIdentity(result.likelyProduct || '') === normalizeBrandIdentity(queryInfo.canonicalQuery || request)
    && !result.exactModel;
}

// Exact-model cache keys carry no request fingerprint, so an entry written
// before the identity guard existed can hold another product's year behind the
// echoed model. Entries written by this code are stamped with the model they
// were validated for; an unstamped provider result that dates the product must
// name the requested model in its own (unechoed) product text to be reused.
export function hasCachedExactModelEvidence(value, queryInfo) {
  const exactModel = queryInfo?.exactModel;
  if (!exactModel || !value || !hasProviderYearClaim(value)) return true;
  if (!PROVIDER_EVIDENCE.test(String(value.evidenceSource || ''))) return true;
  if (value.guardedExactModel === compactModel(exactModel)) return true;
  return [value.likelyProduct, value.displayName].some((product) => product && namesExactModel(String(product), exactModel));
}
