const DEFAULT_GEMINI_SEARCH_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_TIMEOUT_MS = 9000;
const MAX_TIMEOUT_MS = 10000;
const MAX_QUERY_LENGTH = 500;
const MAX_SOURCE_COUNT = 8;

const PRECISION_VALUES = new Set([
  'individual_unit',
  'exact_model',
  'model_line',
  'generation',
  'product_family',
  'category_era',
]);

const CONFIDENCE_VALUES = new Set(['high', 'medium', 'low']);

export class GeminiSearchProviderError extends Error {
  constructor(code, message = code, options = {}) {
    super(message);
    this.name = 'GeminiSearchProviderError';
    this.code = code;
    this.provider = 'gemini-search';
    this.status = Number.isFinite(options.status) ? options.status : null;
    this.retryable = Boolean(options.retryable);
    this.diagnostics = options.diagnostics || null;
  }
}

function text(value, maxLength) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function year(value) {
  const parsed = Number(value);
  const maximum = new Date().getFullYear() + 1;
  return Number.isInteger(parsed) && parsed >= 1800 && parsed <= maximum ? parsed : null;
}

function normalizeRange(value) {
  let startYear = year(value?.startYear);
  let endYear = year(value?.endYear);
  if (startYear !== null && endYear !== null && startYear > endYear) {
    [startYear, endYear] = [endYear, startYear];
  }
  return { startYear, endYear };
}

function stringList(value, maxItems = 6) {
  if (!Array.isArray(value)) return [];
  const entries = [];
  const seen = new Set();
  for (const item of value) {
    const normalized = text(item, 300);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    entries.push(normalized);
    if (entries.length >= maxItems) break;
  }
  return entries;
}

export function extractGeminiSearchSources(candidate) {
  const chunks = Array.isArray(candidate?.groundingMetadata?.groundingChunks)
    ? candidate.groundingMetadata.groundingChunks
    : [];
  const sources = [];
  const seen = new Set();

  for (const chunk of chunks) {
    const url = text(chunk?.web?.uri, 1000);
    if (!url || !/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    sources.push({
      title: text(chunk?.web?.title, 200) || url,
      url,
    });
    if (sources.length >= MAX_SOURCE_COUNT) break;
  }

  return sources;
}

function extractJson(textValue) {
  const raw = String(textValue || '').trim();
  if (!raw) return null;
  const unfenced = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(unfenced.slice(start, end + 1));
  } catch (_) {
    return null;
  }
}

function diagnosticValue(value, maxLength = 1000) {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.slice(0, maxLength);
  return value === undefined ? null : `[${Array.isArray(value) ? 'array' : typeof value}]`;
}

function safeParsedObject(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const parsedObject = {};
  for (const key of ['brand', 'product', 'model', 'category', 'bestEstimateYear', 'precision', 'confidence', 'estimateBasis', 'summary', 'isIndividualUnitDate']) {
    if (Object.hasOwn(raw, key)) parsedObject[key] = diagnosticValue(raw[key]);
  }
  if (Object.hasOwn(raw, 'estimatedRange')) {
    parsedObject.estimatedRange = raw.estimatedRange && typeof raw.estimatedRange === 'object'
      ? {
        startYear: diagnosticValue(raw.estimatedRange.startYear, 100),
        endYear: diagnosticValue(raw.estimatedRange.endYear, 100),
      }
      : diagnosticValue(raw.estimatedRange, 100);
  }
  if (Object.hasOwn(raw, 'caveats')) parsedObject.caveats = stringList(raw.caveats);
  return parsedObject;
}

function buildNormalizationDiagnostics(raw, sources) {
  const parsedIsObject = Boolean(raw && typeof raw === 'object' && !Array.isArray(raw));
  const range = normalizeRange(parsedIsObject ? raw.estimatedRange : null);
  const failures = [];
  if (!parsedIsObject) failures.push('parsed_object_required');
  if (!text(raw?.product, 200)) failures.push('missing_product');
  if (!PRECISION_VALUES.has(raw?.precision)) failures.push('invalid_precision');
  if (!CONFIDENCE_VALUES.has(raw?.confidence)) failures.push('invalid_confidence');
  if (!text(raw?.estimateBasis, 600)) failures.push('missing_estimate_basis');
  if (!text(raw?.summary, 1000)) failures.push('missing_summary');

  return {
    parsedKeys: parsedIsObject ? Object.keys(raw).slice(0, 30).map((key) => key.slice(0, 100)) : [],
    parsedObject: safeParsedObject(raw),
    rawPrecision: diagnosticValue(raw?.precision, 100),
    rawConfidence: diagnosticValue(raw?.confidence, 100),
    hasProduct: Boolean(text(raw?.product, 200)),
    hasSummary: Boolean(text(raw?.summary, 1000)),
    hasEstimateBasis: Boolean(text(raw?.estimateBasis, 600)),
    hasBestEstimateYear: year(raw?.bestEstimateYear) !== null,
    hasEstimatedRange: range.startYear !== null || range.endYear !== null,
    groundingSourceCount: sources.length,
    normalizationFailureReason: failures.join(',') || null,
  };
}

function normalizeResult(raw, sources) {
  const diagnostics = buildNormalizationDiagnostics(raw, sources);
  if (diagnostics.normalizationFailureReason) return { result: null, diagnostics };

  const product = text(raw.product, 200);
  const precision = PRECISION_VALUES.has(raw.precision) ? raw.precision : null;
  const confidence = CONFIDENCE_VALUES.has(raw.confidence) ? raw.confidence : null;
  const estimateBasis = text(raw.estimateBasis, 600);
  const summary = text(raw.summary, 1000);

  return { result: {
    brand: text(raw.brand, 120),
    product,
    model: text(raw.model, 160),
    category: text(raw.category, 120),
    bestEstimateYear: year(raw.bestEstimateYear),
    estimatedRange: normalizeRange(raw.estimatedRange),
    precision,
    confidence,
    estimateBasis,
    summary,
    isIndividualUnitDate: precision === 'individual_unit' && raw.isIndividualUnitDate === true,
    caveats: stringList(raw.caveats),
    sources,
  }, diagnostics };
}

export function buildGeminiSearchPrompt(query) {
  return `Research this product using Google Search: ${query}

Identify the product as accurately as possible and return the strongest defensible age information: an individual-unit date only when directly supported, otherwise an exact-model introduction or production period, model line, generation, product family, or category era.

Prefer exact-model evidence when available, but broaden rather than fail: exact model -> model line -> generation -> product family -> category era. Distinguish a model or product introduction from the manufacture date of an individual unit. Never fabricate precision. For any meaningful identifiable product, return the strongest useful estimate supported by grounded sources.

Return only one JSON object with this shape:
{
  "brand": "string or null",
  "product": "string",
  "model": "string or null",
  "category": "string or null",
  "bestEstimateYear": "integer or null",
  "estimatedRange": { "startYear": "integer or null", "endYear": "integer or null" },
  "precision": "individual_unit | exact_model | model_line | generation | product_family | category_era",
  "confidence": "high | medium | low",
  "estimateBasis": "brief explanation of what the estimate represents and why",
  "summary": "concise useful research summary",
  "isIndividualUnitDate": false,
  "caveats": ["brief caveat"]
}`;
}

function boundedTimeout(value) {
  const requested = Number(value);
  if (!Number.isFinite(requested) || requested <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(1, requested));
}

async function fetchWithTimeout(url, init, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const request = Promise.resolve().then(() => fetchImpl(url, { ...init, signal: controller.signal }));
  request.catch(() => {});
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new GeminiSearchProviderError(
        'PROVIDER_TIMEOUT',
        'Gemini Search provider timed out',
        { retryable: true },
      ));
    }, timeoutMs);
  });

  try {
    return await Promise.race([request, timeout]);
  } catch (error) {
    if (error instanceof GeminiSearchProviderError) throw error;
    if (error?.name === 'AbortError') {
      throw new GeminiSearchProviderError(
        'PROVIDER_TIMEOUT',
        'Gemini Search provider timed out',
        { retryable: true },
      );
    }
    throw new GeminiSearchProviderError(
      'PROVIDER_NETWORK_ERROR',
      'Gemini Search provider network error',
      { retryable: true },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function callGeminiSearchProvider(query, options = {}) {
  const normalizedQuery = text(query, MAX_QUERY_LENGTH);
  if (!normalizedQuery || !/[a-z0-9]/i.test(normalizedQuery)) {
    throw new GeminiSearchProviderError('INVALID_QUERY', 'A meaningful Smart Lookup query is required');
  }

  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiSearchProviderError(
      'PROVIDER_NOT_CONFIGURED',
      'Gemini Search provider is not configured',
    );
  }

  const fetchImpl = options.fetchImpl || fetch;
  const model = text(options.model, 120) || DEFAULT_GEMINI_SEARCH_MODEL;
  const endpoint = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`;
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildGeminiSearchPrompt(normalizedQuery) }] }],
      tools: [{ google_search: {} }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048,
      },
    }),
  }, fetchImpl, boundedTimeout(options.timeoutMs));

  if (!response?.ok) {
    const status = Number(response?.status || 0);
    if (status === 429) {
      throw new GeminiSearchProviderError(
        'PROVIDER_RATE_LIMIT',
        'Gemini Search provider rate limit',
        { status, retryable: true },
      );
    }
    if (status >= 500) {
      throw new GeminiSearchProviderError(
        'PROVIDER_5XX',
        'Gemini Search provider unavailable',
        { status, retryable: true },
      );
    }
    throw new GeminiSearchProviderError(
      'PROVIDER_HTTP_ERROR',
      'Gemini Search provider request failed',
      { status },
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch (_) {
    throw new GeminiSearchProviderError(
      'PROVIDER_RESPONSE_INVALID',
      'Gemini Search response was not valid JSON',
    );
  }

  const candidate = payload?.candidates?.[0];
  const responseText = Array.isArray(candidate?.content?.parts)
    ? candidate.content.parts.map((part) => part?.text || '').join('')
    : '';
  const parsed = extractJson(responseText);
  if (!parsed) {
    throw new GeminiSearchProviderError(
      'PROVIDER_MALFORMED_JSON',
      'Gemini Search returned malformed structured output',
    );
  }

  const normalized = normalizeResult(parsed, extractGeminiSearchSources(candidate));
  if (!normalized.result) {
    throw new GeminiSearchProviderError(
      'PROVIDER_UNUSABLE_OUTPUT',
      'Gemini Search returned an unusable grounded result',
      { diagnostics: normalized.diagnostics },
    );
  }

  return normalized.result;
}
