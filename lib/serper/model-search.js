/**
 * Bounded Serper Google Search client for appliance/HVAC model-era research.
 *
 * @typedef {Object} ModelSearchInput
 * @property {string} brand
 * @property {string} model
 * @property {string} [category]
 * @property {number} [timeoutMs]
 *
 * @typedef {Object} NormalizedSearchResult
 * @property {number|null} position
 * @property {string} title
 * @property {string} link
 * @property {string} snippet
 * @property {string|null} date
 * @property {string|null} domain
 *
 * @typedef {Object} ModelSearchTestResult
 * @property {string} brand
 * @property {string} model
 * @property {string|null} category
 * @property {string} query
 * @property {number} durationMs
 * @property {'success'|'timeout'|'provider_error'|'invalid_input'} status
 * @property {number} resultCount
 * @property {boolean} exactModelFound
 * @property {boolean} exactModelInTitle
 * @property {boolean} manufacturerDomainFound
 * @property {boolean} yearMentionFound
 * @property {NormalizedSearchResult[]} results
 * @property {string} [errorMessage]
 */
import { createBoundedAbort } from '../serial-refinement/bounded-abort.js';

export const SERPER_ENDPOINT = 'https://google.serper.dev/search';
export const DEFAULT_TIMEOUT_MS = 3000;
export const DEFAULT_NUM_RESULTS = 5;

// Official manufacturer domains only — retailers, parts sites, manual hosts,
// marketplaces, and forums are intentionally excluded from this allowlist.
export const MANUFACTURER_DOMAINS = new Set([
  'geappliances.com',
  'ge.com',
  'whirlpool.com',
  'maytag.com',
  'kitchenaid.com',
  'samsung.com',
  'lg.com',
  'frigidaire.com',
  'electroluxappliances.com',
  'electrolux.com',
  'vizio.com',
  'carrier.com',
  'trane.com',
  'lennox.com',
  'goodmanmfg.com',
  'rheem.com',
  'ruud.com',
  'americanstandardair.com',
  'york.com',
]);

const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 1980;
const YEAR_PATTERN = /(19[89]\d|20[0-9]\d)/g;

function normalizeForComparison(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[\s\-/]+/g, '');
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeWhitespace(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

/**
 * @param {string} link
 * @returns {string|null}
 */
export function extractDomain(link) {
  try {
    return new URL(link).hostname.toLowerCase().replace(/^www\./, '');
  } catch (_) {
    return null;
  }
}

/**
 * @param {string} normalizedModel already uppercased/separator-stripped
 * @param {string} haystack raw title or snippet text
 * @returns {boolean}
 */
function containsExactModel(normalizedModel, haystack) {
  if (!normalizedModel) return false;
  return normalizeForComparison(haystack).includes(normalizedModel);
}

/**
 * @param {string} text
 * @returns {boolean} true when a plausible 4-digit year (1980..current year) is present
 */
export function containsPlausibleYear(text) {
  const matches = String(text || '').match(YEAR_PATTERN);
  if (!matches) return false;
  return matches.some((match) => {
    const year = Number.parseInt(match, 10);
    return year >= MIN_YEAR && year <= CURRENT_YEAR;
  });
}

/**
 * @param {string} domain
 * @returns {boolean}
 */
export function isManufacturerDomain(domain) {
  if (!domain) return false;
  return MANUFACTURER_DOMAINS.has(domain);
}

/**
 * @param {{ brand: string, model: string, category?: string }} input already-normalized fields
 * @returns {string}
 */
export function buildModelQuery({ brand, model, category }) {
  const categoryTerm = category ? category : 'appliance';
  return `"${brand}" "${model}" ${categoryTerm}`;
}

/**
 * @param {any} rawResult a single Serper organic result entry
 * @param {number} index
 * @returns {NormalizedSearchResult}
 */
function normalizeOrganicResult(rawResult, index) {
  const link = String(rawResult?.link || '');
  return {
    position: Number.isInteger(rawResult?.position) ? rawResult.position : index + 1,
    title: String(rawResult?.title || ''),
    link,
    snippet: String(rawResult?.snippet || ''),
    date: typeof rawResult?.date === 'string' && rawResult.date.trim() ? rawResult.date.trim() : null,
    domain: extractDomain(link),
  };
}

function invalidInputResult(input, message) {
  return {
    brand: normalizeWhitespace(input?.brand),
    model: normalizeForComparison(input?.model) ? normalizeWhitespace(input.model).toUpperCase() : '',
    category: input?.category ? normalizeWhitespace(input.category) : null,
    query: '',
    durationMs: 0,
    status: 'invalid_input',
    resultCount: 0,
    exactModelFound: false,
    exactModelInTitle: false,
    manufacturerDomainFound: false,
    yearMentionFound: false,
    results: [],
    errorMessage: message,
  };
}

/**
 * Runs exactly one bounded Serper search for a single brand/model pair and
 * returns normalized results plus deterministic (non-AI) indicators.
 *
 * @param {ModelSearchInput} input
 * @param {{ apiKey?: string, fetchImpl?: typeof fetch, signal?: AbortSignal }} [options]
 * @returns {Promise<ModelSearchTestResult>}
 */
export async function searchModelWithSerper(input, options = {}) {
  const brand = normalizeWhitespace(input?.brand);
  const modelRaw = normalizeWhitespace(input?.model);
  const model = modelRaw.toUpperCase();
  const category = input?.category ? normalizeWhitespace(input.category).toLowerCase() : null;

  if (!brand || !model) {
    return invalidInputResult(input, 'MISSING_BRAND_OR_MODEL');
  }

  const apiKey = options.apiKey ?? process.env.SERPER_API_KEY;
  if (!apiKey) {
    return {
      brand,
      model,
      category,
      query: '',
      durationMs: 0,
      status: 'provider_error',
      resultCount: 0,
      exactModelFound: false,
      exactModelInTitle: false,
      manufacturerDomainFound: false,
      yearMentionFound: false,
      results: [],
      errorMessage: 'SERPER_API_KEY_MISSING',
    };
  }

  const query = buildModelQuery({ brand, model, category });
  const timeoutMs = Math.max(1, Number(input?.timeoutMs) || DEFAULT_TIMEOUT_MS);
  const fetchImpl = options.fetchImpl || fetch;

  const boundedAbort = createBoundedAbort(options.signal, timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetchImpl(SERPER_ENDPOINT, {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      signal: boundedAbort.signal,
      body: JSON.stringify({
        q: query,
        num: DEFAULT_NUM_RESULTS,
        gl: 'us',
        hl: 'en',
      }),
    });

    const durationMs = Date.now() - startedAt;

    if (!response.ok) {
      return {
        brand,
        model,
        category,
        query,
        durationMs,
        status: 'provider_error',
        resultCount: 0,
        exactModelFound: false,
        exactModelInTitle: false,
        manufacturerDomainFound: false,
        yearMentionFound: false,
        results: [],
        errorMessage: `SERPER_HTTP_${response.status}`,
      };
    }

    const payload = await response.json();
    const organic = Array.isArray(payload?.organic) ? payload.organic.slice(0, DEFAULT_NUM_RESULTS) : [];
    const results = organic.map(normalizeOrganicResult);

    const normalizedModel = normalizeForComparison(model);
    const exactModelFound = results.some((result) =>
      containsExactModel(normalizedModel, result.title) || containsExactModel(normalizedModel, result.snippet));
    const exactModelInTitle = results.some((result) => containsExactModel(normalizedModel, result.title));
    const manufacturerDomainFound = results.some((result) => isManufacturerDomain(result.domain));
    const yearMentionFound = results.some((result) =>
      containsPlausibleYear(result.title) || containsPlausibleYear(result.snippet) || containsPlausibleYear(result.date));

    return {
      brand,
      model,
      category,
      query,
      durationMs,
      status: 'success',
      resultCount: results.length,
      exactModelFound,
      exactModelInTitle,
      manufacturerDomainFound,
      yearMentionFound,
      results,
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const isAbort = error && (error.name === 'AbortError' || String(error?.code) === 'ABORT_ERR');
    return {
      brand,
      model,
      category,
      query,
      durationMs,
      status: isAbort ? 'timeout' : 'provider_error',
      resultCount: 0,
      exactModelFound: false,
      exactModelInTitle: false,
      manufacturerDomainFound: false,
      yearMentionFound: false,
      results: [],
      errorMessage: isAbort ? 'TIMEOUT' : String(error?.message || error),
    };
  } finally {
    boundedAbort.cleanup();
  }
}
