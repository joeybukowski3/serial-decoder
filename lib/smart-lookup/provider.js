export class SmartLookupProviderError extends Error {
  constructor(code, message = code, options = {}) {
    super(message);
    this.name = 'SmartLookupProviderError';
    this.code = code;
    this.status = options.status || null;
    this.immediateFallbackEligible = Boolean(options.immediateFallbackEligible);
  }
}

async function callGeminiJson(prompt, options = {}) {
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
  const fetchImpl = options.fetchImpl || fetch;
  const deadline = options.deadline;
  const stage = options.stage || 'gemini-provider';
  if (!apiKey) throw new SmartLookupProviderError('PROVIDER_NOT_CONFIGURED');
  if (!deadline) throw new SmartLookupProviderError('MISSING_DEADLINE');

  return deadline.run(stage, async ({ signal }) => {
    let response;
    try {
      response = await fetchImpl(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: options.temperature ?? 0,
            },
          }),
          signal,
        }
      );
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      throw new SmartLookupProviderError('PROVIDER_NETWORK_ERROR');
    }

    if (!response.ok) {
      const status = Number(response.status || 0);
      if (status === 429) {
        throw new SmartLookupProviderError('PROVIDER_RATE_LIMIT', 'Provider rate limit', {
          status,
          immediateFallbackEligible: true,
        });
      }
      if (status >= 500) {
        throw new SmartLookupProviderError('PROVIDER_5XX', 'Provider unavailable', {
          status,
          immediateFallbackEligible: true,
        });
      }
      throw new SmartLookupProviderError('PROVIDER_HTTP_ERROR', 'Provider request failed', { status });
    }

    let data;
    try {
      data = await response.json();
    } catch (_) {
      throw new SmartLookupProviderError('PROVIDER_RESPONSE_INVALID', 'Provider response was not JSON', {
        immediateFallbackEligible: true,
      });
    }
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new SmartLookupProviderError('PROVIDER_EMPTY', 'Provider returned no content', {
        immediateFallbackEligible: true,
      });
    }
    try {
      return JSON.parse(text);
    } catch (_) {
      throw new SmartLookupProviderError('PROVIDER_MALFORMED_JSON', 'Provider returned malformed JSON', {
        immediateFallbackEligible: true,
      });
    }
  }, {
    maxMs: options.maxMs || 6500,
    reserveMs: options.reserveMs || 350,
  });
}

export function buildAgeProviderPrompt(queryInfo) {
  return `Identify model-level timing information for this physical property item.

Query: "${queryInfo.query}"
Detected brand: ${queryInfo.brand || 'Unknown'}
Detected model token: ${queryInfo.modelIdentity || 'None'}
Input completeness: ${queryInfo.modelCompleteness}

Return model-level information only. Do not estimate the manufacture date of an individual physical unit from a model number. Do not claim that you performed live web research. If the model token is partial, do not silently complete it; return suggestions instead. If the query is generic or brand-only, do not return a precise model date.

Return JSON only:
{
  "brand": "Brand or Unknown",
  "model": "Exact model only when the input is complete, otherwise null",
  "inputComplete": true,
  "specificityLevel": "specific | partial | brand-only | generic | unknown",
  "introductionYear": 2021,
  "productionRange": {"start": 2021, "end": 2022, "basis": "model-availability"},
  "notes": "Short explanation of the model generation or availability window.",
  "evidence": [{"detail": "Short supporting fact", "source": "Model pattern or product-generation knowledge"}],
  "suggestedModelNumbers": []
}`;
}

export function callGeminiAgeProvider(input, options = {}) {
  return callGeminiJson(buildAgeProviderPrompt(input), {
    ...options,
    stage: 'age-provider',
    temperature: 0,
  });
}

export function buildInterpretProviderPrompt(queryInfo) {
  return `Interpret this short query as physical property or equipment used in an insurance claim workflow.

Query: "${queryInfo.query}"

Return JSON only:
{
  "action": "bypass | suggest | no_results | out_of_scope",
  "queryKind": "general | specific",
  "confidence": "high | medium | low",
  "scopeValid": true,
  "message": null,
  "suggestions": ["Up to five concise physical-item interpretations"]
}

Use bypass when the query already identifies a usable item. Use suggest only for a genuine typo or ambiguous phrase. Treat Apple as electronics, Carrier as HVAC, Nest as a thermostat/device, and Shark as household equipment. Never invent a complete model number from a partial token.`;
}

export function callGeminiInterpretProvider(input, options = {}) {
  return callGeminiJson(buildInterpretProviderPrompt(input), {
    ...options,
    stage: 'interpret-provider',
    temperature: 0,
    maxMs: options.maxMs || 2500,
    reserveMs: options.reserveMs || 250,
  });
}

export function buildLkqProviderPrompt(queryInfo) {
  return `Evaluate Like Kind and Quality replacement options for this physical property item.

Query: "${queryInfo.query}"
Detected brand: ${queryInfo.brand || 'Unknown'}
Detected model: ${queryInfo.modelIdentity || 'Unknown'}

This is model inference, not live retailer research. Preserve an exact input model token. Recommend only new-condition replacement candidates that are plausibly current equivalents. Do not force a replacement when confidence is low. Normal generational improvements remain MATCH; use ABOVE LKQ only for a material tier, capacity, value, or performance upgrade. Return no CLOSE MATCH or NOT LKQ candidates.

Return JSON only:
{
  "itemSummary": {
    "name": "Identified item name",
    "brand": "Brand",
    "model": "Exact model or null",
    "category": "Short category",
    "description": "Short description",
    "estimatedAgeRange": "Model availability range or null",
    "availability": "Currently Available | Discontinued | Availability Unconfirmed",
    "originalPriceDisplay": "Price context or N/A"
  },
  "specLabels": ["Five category-relevant labels"],
  "originalSpecs": {"Label": "value"},
  "successorStatus": {
    "type": "direct_successor | same_brand_equivalent | none",
    "name": "Current equivalent or null",
    "model": "Model or null",
    "explanation": "Short explanation"
  },
  "bestMatchLabel": "Best Replacement Option",
  "replacementOptions": [{
    "name": "Product name",
    "model": "Model",
    "brand": "Brand",
    "specs": {"Label": "value"},
    "lkqRating": "MATCH | ABOVE LKQ",
    "notes": "Concise comparison",
    "priceRange": "Range or N/A",
    "retailerName": "Retailer context or N/A",
    "retailerSearchQuery": "Brand and model"
  }]
}`;
}

export function callGeminiLkqProvider(input, options = {}) {
  return callGeminiJson(buildLkqProviderPrompt(input), {
    ...options,
    stage: 'lkq-provider',
    temperature: 0,
    maxMs: options.maxMs || 7000,
    reserveMs: options.reserveMs || 350,
  });
}

export function buildGeneralProviderPrompt(queryInfo) {
  return `Summarize this broad physical-property item query for an insurance workflow.

Query: "${queryInfo.query}"
Detected brand: ${queryInfo.brand || 'Unknown'}
Detected category: ${queryInfo.genericCategory || 'Unknown'}

Do not claim live web research. Do not assign a precise manufacture date. Return concise model-family context and up to five realistic refinement queries. Do not invent a complete model from a partial model token.

Return JSON only:
{
  "itemCategory": "Short category",
  "brand": "Brand or empty string",
  "overview": "Short general overview",
  "refineOptions": [{"label": "Specific refinement label", "query": "Refinement query", "year": ""}],
  "averageModelLabel": "",
  "averageModelQuery": "",
  "averageModelCategory": "Short category"
}`;
}

export function callGeminiGeneralProvider(input, options = {}) {
  return callGeminiJson(buildGeneralProviderPrompt(input), {
    ...options,
    stage: 'general-provider',
    temperature: 0,
    maxMs: options.maxMs || 3500,
    reserveMs: options.reserveMs || 250,
  });
}
