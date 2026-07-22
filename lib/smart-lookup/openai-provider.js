import {
  SmartLookupProviderError,
  attachProviderMetadata,
  extractJsonFromText,
  buildOpenAiAgeProviderPrompt,
  callGroqAgeFallback,
  hasTimeForGroqFallback,
} from './provider.js';

// OpenAI Responses API with the built-in web_search tool. This is the primary
// Smart Lookup research provider. Gemini remains implemented in provider.js
// for benchmarking and possible re-enablement, but is deliberately NOT part of
// the active production sequence: live testing showed its grounded stage plus
// closed-book stage consuming the entire ~8.1s route budget without ever
// returning a result, which left no window for any fallback.
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

export const DEFAULT_OPENAI_STAGE_MAX_MS = 5000;
const DEFAULT_MAX_OUTPUT_TOKENS = 4000;
const MAX_SOURCES = 5;

// Structured-output contract. Deliberately permissive (strict:false, every
// field nullable) so the model can omit anything it cannot support rather
// than being forced to invent a value to satisfy a required field -- the
// whole point of the usefulness-first policy is caveated honesty, not
// fabricated completeness. Notably absent: any URL/source field. Citations
// are server-derived from search annotations and must never be model-authored.
const AGE_RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  properties: {
    brand: { type: ['string', 'null'] },
    model: { type: ['string', 'null'] },
    likelyProduct: { type: ['string', 'null'] },
    productType: { type: ['string', 'null'] },
    specificityLevel: { type: ['string', 'null'] },
    introductionYear: { type: ['integer', 'null'] },
    releaseDate: { type: ['string', 'null'] },
    productionRange: {
      type: ['object', 'null'],
      additionalProperties: true,
      properties: {
        start: { type: ['integer', 'null'] },
        end: { type: ['integer', 'null'] },
        basis: { type: ['string', 'null'] },
      },
    },
    estimatedEra: { type: ['string', 'null'] },
    identityConfidence: { type: ['string', 'null'] },
    timingConfidence: { type: ['string', 'null'] },
    individualUnitDateAvailable: { type: ['boolean', 'null'] },
    serialNeededForExactUnitDate: { type: ['boolean', 'null'] },
    notes: { type: ['string', 'null'] },
    evidence: {
      type: ['array', 'null'],
      items: {
        type: 'object',
        additionalProperties: true,
        properties: { detail: { type: ['string', 'null'] }, source: { type: ['string', 'null'] } },
      },
    },
    assumptions: { type: ['array', 'null'], items: { type: 'string' } },
    caveats: { type: ['array', 'null'], items: { type: 'string' } },
    alternativeMatches: {
      type: ['array', 'null'],
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          product: { type: ['string', 'null'] },
          reason: { type: ['string', 'null'] },
          confidence: { type: ['string', 'null'] },
        },
      },
    },
    suggestedModelNumbers: { type: ['array', 'null'], items: { type: 'string' } },
  },
};

/**
 * Approved production research sequence for Smart Lookup age lookups:
 *
 *   OpenAI (Responses API + web_search)  ->  Groq  ->  caller's deterministic reserve
 *
 * Gemini is intentionally absent. Its code remains in provider.js for
 * benchmarking and possible re-enablement, but calling it here would recreate
 * the measured failure: grounded (~4.2s) + closed-book (~3.9s) consumed the
 * whole ~8.1s route budget and left no window for any fallback at all.
 *
 * Unlike the Gemini path, a full OpenAI *timeout* is Groq-eligible -- a
 * timeout is the most common failure, so excluding it made the fallback
 * unreachable in practice. Groq runs only when enough global deadline
 * genuinely remains, and never after a usable OpenAI result.
 */
export async function callSmartLookupOpenAiAgeProvider(queryInfo, options = {}) {
  const prompt = options.prompt || buildOpenAiAgeProviderPrompt(queryInfo);
  const deadline = options.deadline;
  try {
    return await callOpenAiResponses(prompt, options);
  } catch (primaryError) {
    // A deadline timeout arrives as the generic STAGE_TIMEOUT; attribute it to
    // OpenAI specifically so telemetry and callers can distinguish "OpenAI ran
    // out of time" from any other stage timing out.
    const isTimeout = primaryError?.name === 'SmartLookupTimeoutError' || primaryError?.code === 'STAGE_TIMEOUT';
    const primaryCode = isTimeout
      ? 'OPENAI_TIMEOUT'
      : (primaryError?.code || 'OPENAI_UNAVAILABLE');
    if (options.enableGroqFallback === false) throw primaryError;
    const groqApiKey = options.groqApiKey ?? (options.env || process.env).GROQ_API_KEY;
    if (!groqApiKey || !hasTimeForGroqFallback(deadline, options)) throw primaryError;

    const reserveMs = options.reserveMs || 350;
    const groqMaxMs = Math.max(1, Math.min(options.groqMaxMs || 2500, deadline.remainingMs(reserveMs)));
    try {
      const value = await callGroqAgeFallback(prompt, { ...options, groqMaxMs });
      return attachProviderMetadata(value, {
        provider: 'groq',
        fallbackUsed: true,
        primaryProvider: 'openai',
        primaryErrorCode: primaryCode,
        // A Groq answer is always closed-book: it must never be presented as
        // web-researched, and it carries no citations.
        grounded: false,
        webSearchUsed: false,
        groundedSources: [],
        searchQueryCount: 0,
      });
    } catch (fallbackError) {
      throw new SmartLookupProviderError(
        'PROVIDERS_UNAVAILABLE',
        'OpenAI and Groq providers were unavailable',
        {
          provider: 'groq',
          primaryErrorCode: primaryCode,
          fallbackErrorCode: fallbackError?.code || 'GROQ_UNAVAILABLE',
        },
      );
    }
  }
}

export function isOpenAiSmartLookupEnabled(env = process.env) {
  const value = String(env?.SMART_LOOKUP_OPENAI_ENABLED || '').toLowerCase();
  return value === '1' || value === 'true' || value === 'on';
}

export function getOpenAiSmartLookupModel(env = process.env) {
  return String(env?.OPENAI_SMART_LOOKUP_MODEL || '').trim();
}

/**
 * Safe, non-secret snapshot of OpenAI configuration for telemetry and
 * validation. Deliberately reports only whether a key EXISTS -- never its
 * value, length, prefix, or any part of an authorization header.
 */
export function describeOpenAiConfig(env = process.env) {
  return {
    keyConfigured: Boolean(env?.OPENAI_API_KEY),
    enabled: isOpenAiSmartLookupEnabled(env),
    model: getOpenAiSmartLookupModel(env) || null,
  };
}

/**
 * Citations are read ONLY from the Responses API's own url_citation
 * annotations and web_search_call output -- never from URLs the model wrote
 * into its free-form JSON, which it can fabricate at will. Same server-derived
 * rule the Gemini grounding path already enforces.
 */
export function extractOpenAiSources(payload) {
  const out = [];
  const seen = new Set();
  const items = Array.isArray(payload?.output) ? payload.output : [];
  for (const item of items) {
    const contents = Array.isArray(item?.content) ? item.content : [];
    for (const content of contents) {
      const annotations = Array.isArray(content?.annotations) ? content.annotations : [];
      for (const annotation of annotations) {
        if (annotation?.type !== 'url_citation') continue;
        const rawUrl = String(annotation.url || '');
        let parsed;
        try {
          parsed = new URL(rawUrl);
        } catch (_) {
          continue;
        }
        // Only https. An http/javascript/data URL must never reach the card.
        if (parsed.protocol !== 'https:') continue;
        const key = parsed.href.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          title: cleanSourceText(annotation.title) || parsed.hostname,
          domain: parsed.hostname,
          uri: parsed.href,
        });
        if (out.length >= MAX_SOURCES) return out;
      }
    }
  }
  return out;
}

function cleanSourceText(value) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export function didUseWebSearch(payload) {
  const items = Array.isArray(payload?.output) ? payload.output : [];
  return items.some((item) => String(item?.type || '').startsWith('web_search'));
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

/**
 * Maps an OpenAI HTTP failure to a stable internal code. The raw OpenAI error
 * body is deliberately NOT propagated: it can echo request details, and it is
 * never needed by a caller that only has to choose a fallback.
 */
function errorForStatus(status, bodyText) {
  const code = String(bodyText || '').slice(0, 400);
  if (status === 401 || status === 403) {
    return new SmartLookupProviderError('OPENAI_AUTH_ERROR', 'OpenAI rejected the credentials', {
      status, provider: 'openai',
    });
  }
  if (status === 404 || /model_not_found|does not exist|unknown model/i.test(code)) {
    return new SmartLookupProviderError('OPENAI_MODEL_UNAVAILABLE', 'Configured OpenAI model is unavailable to this project', {
      status, provider: 'openai',
    });
  }
  if (status === 429) {
    return new SmartLookupProviderError('OPENAI_RATE_LIMIT', 'OpenAI rate limit or quota reached', {
      status, provider: 'openai',
    });
  }
  return new SmartLookupProviderError('OPENAI_HTTP_ERROR', 'OpenAI request failed', {
    status, provider: 'openai',
  });
}

/**
 * One bounded OpenAI Responses call with web search. Exactly one request per
 * lookup -- there is no internal retry, so a transient failure can never
 * silently double-charge.
 */
export async function callOpenAiResponses(prompt, options = {}) {
  const env = options.env || process.env;
  const apiKey = options.openAiApiKey ?? env.OPENAI_API_KEY;
  const model = options.openAiModel || getOpenAiSmartLookupModel(env);
  const fetchImpl = options.fetchImpl || fetch;
  const deadline = options.deadline;
  const stage = options.openAiStage || 'age-provider-openai';

  if (!isOpenAiSmartLookupEnabled(env) && options.enabledOverride !== true) {
    throw new SmartLookupProviderError('OPENAI_DISABLED', 'OpenAI Smart Lookup research is disabled', { provider: 'openai' });
  }
  if (!apiKey) {
    throw new SmartLookupProviderError('OPENAI_NOT_CONFIGURED', 'OpenAI provider is not configured', { provider: 'openai' });
  }
  if (!model) {
    throw new SmartLookupProviderError('OPENAI_NOT_CONFIGURED', 'OpenAI model is not configured', { provider: 'openai' });
  }
  if (!deadline) {
    throw new SmartLookupProviderError('MISSING_DEADLINE', 'Smart Lookup provider deadline is required', { provider: 'openai' });
  }

  return deadline.run(stage, async ({ signal }) => {
    let response;
    const startedAt = Date.now();
    try {
      response = await fetchImpl(OPENAI_RESPONSES_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: prompt,
          tools: [{ type: 'web_search' }],
          // Smart Lookup has no need for server-side response retention, and
          // not storing keeps user query text out of OpenAI-side state.
          store: false,
          // Reasoning models spend output tokens on reasoning before emitting
          // any text, so a tight cap truncates the JSON mid-object and shows
          // up as OPENAI_SCHEMA_INVALID. Measured: a 1200 cap produced
          // unparseable output 100% of the time.
          max_output_tokens: options.maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS,
          // Web search plus full reasoning measured ~13.5s end to end, which
          // does not fit any acceptable user-facing budget. Low effort keeps
          // the search while cutting the reasoning that dominated that time.
          reasoning: { effort: options.reasoningEffort || 'low' },
          // Guarantees a parseable object instead of relying on the model to
          // obey a "JSON only" instruction while also running a tool.
          text: {
            format: {
              type: 'json_schema',
              name: 'smart_lookup_age_result',
              strict: false,
              schema: AGE_RESULT_SCHEMA,
            },
          },
        }),
        signal,
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      throw new SmartLookupProviderError('OPENAI_NETWORK_ERROR', 'OpenAI provider network error', { provider: 'openai' });
    }

    if (!response.ok) {
      let bodyText = '';
      try { bodyText = await response.text(); } catch (_) { /* body is optional for classification */ }
      throw errorForStatus(Number(response.status || 0), bodyText);
    }

    let payload;
    try {
      payload = await response.json();
    } catch (_) {
      throw new SmartLookupProviderError('OPENAI_MALFORMED_RESPONSE', 'OpenAI response was not JSON', { provider: 'openai' });
    }

    const text = collectOutputText(payload);
    if (!text) {
      throw new SmartLookupProviderError('OPENAI_EMPTY_RESULT', 'OpenAI returned no usable output', { provider: 'openai' });
    }

    // extractJsonFromText returns the JSON *substring* (unfenced), not an
    // object -- it still has to be parsed here.
    let parsed;
    try {
      const jsonText = extractJsonFromText(text);
      parsed = jsonText ? JSON.parse(jsonText) : null;
    } catch (_) {
      parsed = null;
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new SmartLookupProviderError('OPENAI_SCHEMA_INVALID', 'OpenAI output was not a usable JSON object', { provider: 'openai' });
    }

    const sources = extractOpenAiSources(payload);
    const webSearchUsed = didUseWebSearch(payload);
    return attachProviderMetadata(parsed, {
      provider: 'openai',
      fallbackUsed: false,
      primaryProvider: 'openai',
      primaryErrorCode: null,
      model,
      webSearchUsed,
      // An OpenAI answer only counts as web-grounded when the tool actually
      // ran AND returned citations. Otherwise it is a model-assisted estimate
      // and must never be described to the user as web researched.
      grounded: webSearchUsed && sources.length > 0,
      groundedSources: sources,
      searchQueryCount: webSearchUsed ? 1 : 0,
      latencyMs: Date.now() - startedAt,
      usage: {
        inputTokens: payload?.usage?.input_tokens ?? null,
        outputTokens: payload?.usage?.output_tokens ?? null,
      },
    });
  }, {
    maxMs: options.openAiMaxMs || DEFAULT_OPENAI_STAGE_MAX_MS,
    reserveMs: options.reserveMs || 350,
  });
}
