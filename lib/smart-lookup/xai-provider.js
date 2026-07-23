import {
  SmartLookupProviderError,
  attachProviderMetadata,
  extractJsonFromText,
} from './provider.js';
import { AGE_RESULT_SCHEMA } from './age-provider-schema.js';

const XAI_RESPONSES_URL = 'https://api.x.ai/v1/responses';
const DEFAULT_XAI_FALLBACK_MAX_MS = 6000;
const DEFAULT_XAI_FALLBACK_MIN_MS = 100;
const DEFAULT_MAX_OUTPUT_TOKENS = 4000;
const MAX_SOURCES = 5;

export function isXaiSmartLookupEnabled(env = process.env) {
  const value = String(env?.SMART_LOOKUP_XAI_ENABLED || '').toLowerCase();
  return value === '1' || value === 'true' || value === 'on';
}

export function getXaiSmartLookupModel(env = process.env) {
  return String(env?.XAI_SMART_LOOKUP_MODEL || '').trim();
}

export function describeXaiConfig(env = process.env) {
  return {
    keyConfigured: Boolean(env?.XAI_API_KEY),
    enabled: isXaiSmartLookupEnabled(env),
    model: getXaiSmartLookupModel(env) || null,
  };
}

export function hasTimeForXaiFallback(deadline, options = {}) {
  const reserveMs = options.reserveMs || 350;
  const minimumMs = options.xaiMinMs || DEFAULT_XAI_FALLBACK_MIN_MS;
  return Boolean(deadline?.hasTime(minimumMs, reserveMs));
}

function cleanSourceText(value) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function sourceFromUrl(url, title = '') {
  let parsed;
  try {
    parsed = new URL(String(url || ''));
  } catch (_) {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  return {
    title: cleanSourceText(title) || parsed.hostname,
    domain: parsed.hostname,
    uri: parsed.href,
  };
}

export function extractXaiSources(payload) {
  const sources = [];
  const seen = new Set();
  function add(source) {
    if (!source || sources.length >= MAX_SOURCES) return;
    const key = source.uri.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    sources.push(source);
  }

  const items = Array.isArray(payload?.output) ? payload.output : [];
  for (const item of items) {
    const contents = Array.isArray(item?.content) ? item.content : [];
    for (const content of contents) {
      const annotations = Array.isArray(content?.annotations) ? content.annotations : [];
      for (const annotation of annotations) {
        if (annotation?.type && annotation.type !== 'url_citation') continue;
        add(sourceFromUrl(annotation?.url || annotation?.uri, annotation?.title || annotation?.label));
      }
    }
  }

  const citations = Array.isArray(payload?.citations) ? payload.citations : [];
  for (const citation of citations) {
    if (typeof citation === 'string') add(sourceFromUrl(citation));
    else add(sourceFromUrl(citation?.url || citation?.uri, citation?.title || citation?.label));
  }

  return sources;
}

export function didUseXaiWebSearch(payload) {
  const items = Array.isArray(payload?.output) ? payload.output : [];
  return items.some((item) => String(item?.type || '').includes('web_search'));
}

function collectOutputText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text;
  }
  const items = Array.isArray(payload?.output) ? payload.output : [];
  const chunks = [];
  for (const item of items) {
    const contents = Array.isArray(item?.content) ? item.content : [];
    for (const content of contents) {
      if (content?.type === 'output_text' && typeof content.text === 'string') {
        chunks.push(content.text);
      }
    }
  }
  return chunks.join('\n').trim();
}

function safeRateLimitHeaders(headers) {
  const out = {};
  for (const key of ['x-ratelimit-limit-requests', 'x-ratelimit-remaining-requests', 'x-ratelimit-reset-requests', 'retry-after']) {
    const value = headers?.get?.(key);
    if (value) out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}

function errorForStatus(status, bodyText, options = {}) {
  const code = String(bodyText || '').slice(0, 400);
  const common = {
    status,
    provider: 'xai',
    model: options.model || null,
    latencyMs: options.latencyMs,
    rateLimitHeaders: options.rateLimitHeaders || null,
  };
  if (status === 401 || status === 403) {
    return new SmartLookupProviderError('XAI_AUTH_ERROR', 'xAI rejected the credentials', common);
  }
  if (status === 404 || /model_not_found|does not exist|unknown model|not found/i.test(code)) {
    return new SmartLookupProviderError('XAI_MODEL_UNAVAILABLE', 'Configured xAI model is unavailable', common);
  }
  if (status === 429) {
    return new SmartLookupProviderError('XAI_RATE_LIMIT', 'xAI rate limit or quota reached', common);
  }
  return new SmartLookupProviderError('XAI_HTTP_ERROR', 'xAI request failed', common);
}

export async function callXaiResponses(prompt, options = {}) {
  const env = options.env || process.env;
  const apiKey = options.xaiApiKey ?? env.XAI_API_KEY;
  const model = options.xaiModel || getXaiSmartLookupModel(env);
  const fetchImpl = options.xaiFetchImpl || options.fetchImpl || fetch;
  const deadline = options.deadline;
  const stage = options.xaiStage || 'age-provider-xai-fallback';

  if (!isXaiSmartLookupEnabled(env) && options.xaiEnabledOverride !== true) {
    throw new SmartLookupProviderError('XAI_DISABLED', 'xAI Smart Lookup fallback is disabled', { provider: 'xai' });
  }
  if (!apiKey) {
    throw new SmartLookupProviderError('XAI_NOT_CONFIGURED', 'xAI provider is not configured', { provider: 'xai' });
  }
  if (!model) {
    throw new SmartLookupProviderError('XAI_NOT_CONFIGURED', 'xAI model is not configured', { provider: 'xai' });
  }
  if (!deadline) {
    throw new SmartLookupProviderError('MISSING_DEADLINE', 'Smart Lookup provider deadline is required', { provider: 'xai' });
  }

  return deadline.run(stage, async ({ signal }) => {
    let response;
    const startedAt = Date.now();
    const requestBody = {
      model,
      input: prompt,
      tools: [{ type: 'web_search' }],
      include: ['no_inline_citations'],
      store: false,
      max_output_tokens: options.maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS,
      text: {
        format: {
          type: 'json_schema',
          name: 'smart_lookup_age_result',
          strict: false,
          schema: AGE_RESULT_SCHEMA,
        },
      },
    };
    const reasoningEffort = options.xaiReasoningEffort || env.XAI_REASONING_EFFORT;
    if (reasoningEffort) requestBody.reasoning = { effort: reasoningEffort };
    try {
      response = await fetchImpl(XAI_RESPONSES_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal,
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      throw new SmartLookupProviderError('XAI_NETWORK_ERROR', 'xAI provider network error', {
        provider: 'xai',
        model,
        latencyMs: Date.now() - startedAt,
      });
    }

    const latencyMs = Date.now() - startedAt;
    if (!response.ok) {
      let bodyText = '';
      try { bodyText = await response.text(); } catch (_) { /* optional */ }
      throw errorForStatus(Number(response.status || 0), bodyText, {
        model,
        latencyMs,
        rateLimitHeaders: safeRateLimitHeaders(response.headers),
      });
    }

    let payload;
    try {
      payload = await response.json();
    } catch (_) {
      throw new SmartLookupProviderError('XAI_MALFORMED_RESPONSE', 'xAI response was not JSON', {
        provider: 'xai',
        status: Number(response.status || 0),
        model,
        latencyMs,
      });
    }

    const text = collectOutputText(payload);
    if (!text) {
      throw new SmartLookupProviderError('XAI_EMPTY_RESULT', 'xAI returned no usable output', {
        provider: 'xai',
        model,
        latencyMs,
      });
    }

    let parsed;
    try {
      const jsonText = extractJsonFromText(text);
      parsed = jsonText ? JSON.parse(jsonText) : null;
    } catch (_) {
      parsed = null;
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new SmartLookupProviderError('XAI_SCHEMA_INVALID', 'xAI output was not a usable JSON object', {
        provider: 'xai',
        model,
        latencyMs,
      });
    }

    const sources = extractXaiSources(payload);
    const webSearchUsed = didUseXaiWebSearch(payload) || sources.length > 0;
    return attachProviderMetadata(parsed, {
      provider: 'xai',
      fallbackUsed: Boolean(options.fallbackUsed),
      primaryProvider: options.primaryProvider || 'xai',
      primaryErrorCode: options.primaryErrorCode || null,
      model,
      webSearchUsed,
      grounded: webSearchUsed && sources.length > 0,
      groundedSources: sources,
      searchQueryCount: webSearchUsed ? 1 : 0,
      latencyMs,
      usage: {
        inputTokens: payload?.usage?.input_tokens ?? null,
        outputTokens: payload?.usage?.output_tokens ?? null,
      },
    });
  }, {
    maxMs: options.xaiMaxMs || DEFAULT_XAI_FALLBACK_MAX_MS,
    reserveMs: options.reserveMs || 350,
  });
}
