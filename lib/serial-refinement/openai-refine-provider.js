import { extractOpenAiSources } from '../smart-lookup/openai-provider.js';

// OpenAI Responses API (web_search tool) as the serial-refinement grounding
// provider, replacing Gemini as the default. Request shape mirrors
// lib/smart-lookup/openai-provider.js's callOpenAiResponses for consistency.
// The prompt/schema still only ask for evidence boundaries -- evaluateEvidencePolicy
// and resolveCandidateIntersection (unchanged) remain the only code that ever
// picks chosenYear, preserving the same anti-hallucination invariant the
// Gemini path (provider.js) already enforces.
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-4o';
const DEFAULT_MAX_OUTPUT_TOKENS = 3000;
const DEFAULT_MAX_MS = 20000;

export const REFINE_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  properties: {
    modelIdentity: { type: ['string', 'null'] },
    evidence: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          type: { type: 'string' },
          title: { type: 'string' },
          sourceName: { type: 'string' },
          sourceIndex: { type: 'integer' },
          publishedDate: { type: ['string', 'null'] },
          availabilityStart: { type: ['integer', 'null'] },
          availabilityEnd: { type: ['integer', 'null'] },
          productionStart: { type: ['integer', 'null'] },
          productionEnd: { type: ['integer', 'null'] },
          yearRange: { type: ['string', 'null'] },
          supports: { type: 'string' },
          quality: { type: 'string', enum: ['official', 'strong-secondary', 'secondary', 'heuristic'] },
        },
      },
    },
    notes: { type: 'string' },
  },
  required: ['evidence'],
};

export function buildOpenAiRefinementPrompt({ brand, model, category, candidateYears, decodedMonth, context }) {
  return `You are researching model availability boundaries for a serial-number date refinement system, using web search.

Brand: ${brand}
Model: ${model}
Category: ${category || 'unknown'}
Serial-valid candidate years: ${candidateYears.join(', ')}
Decoded month or period: ${decodedMonth || 'unknown'}
Optional user context: ${context || 'none'}

Research the exact model, not merely a broad family prefix. Prefer sources in this order: official manufacturer product pages and manuals, official specification sheets and support pages, manufacturer parts literature or regulatory records, then reputable independent reviews or major retailers -- clearly label independent sources as secondary.

Do not select a manufacture year. Do not calculate a midpoint. Do not choose the nearest candidate. Return only evidence-backed availability or production boundaries that can be used by deterministic code to eliminate impossible candidate years.

Important distinctions:
- Release, manual-publication, review, and retailer dates are boundaries, not the individual item's manufacture date.
- Preserve regional, revision, and suffix differences in the model number.
- If the model cannot be verified, return an empty evidence array.
- Unsupported inference must be labeled heuristic and must not claim an exact year.
- Never write a URL you did not actually retrieve through web search. Citations are taken from the search tool itself, not from anything you write in the JSON.

Return valid JSON only:
{
  "modelIdentity": "exact identified model or null",
  "evidence": [
    {
      "type": "manufacturer | manufacturer-support | manual | spec-sheet | regulatory | manufacturer-parts | archive | retailer | review | heuristic",
      "title": "source title",
      "sourceName": "publisher or site shown in the cited source",
      "sourceIndex": 0,
      "publishedDate": "YYYY-MM-DD or null",
      "availabilityStart": 2023,
      "availabilityEnd": 2025,
      "productionStart": 2023,
      "productionEnd": 2025,
      "yearRange": "optional display range",
      "supports": "specific boundary supported by this source",
      "quality": "official | strong-secondary | secondary | heuristic"
    }
  ],
  "notes": "brief limitations"
}`;
}

function normalizeSourceTitle(value) {
  return String(value || '').trim().toLowerCase().replace(/^www\./, '');
}

function matchCitedSource(item, sources, index) {
  const requestedTitle = normalizeSourceTitle(item.sourceName || item.title || '');
  if (requestedTitle) {
    const exact = sources.find((source) => {
      const title = normalizeSourceTitle(source.title);
      return title === requestedTitle || title.includes(requestedTitle) || requestedTitle.includes(title);
    });
    if (exact) return exact;
  }
  if (typeof item.sourceIndex === 'number' && sources[item.sourceIndex]) return sources[item.sourceIndex];
  return sources[index] || sources[0] || null;
}

function classifyQuality(item, source, brand) {
  const declared = String(item.quality || '').toLowerCase();
  const evidenceType = String(item.type || '').toLowerCase();
  const officialType = /^(manufacturer|manufacturer-support|manual|spec-sheet|regulatory|manufacturer-parts)$/i.test(evidenceType);
  const sourceIdentity = `${source?.title || ''} ${source?.domain || ''}`.toLowerCase();
  const brandTokens = String(brand || '').toLowerCase().match(/[a-z0-9]{2,}/g) || [];
  const sourceMatchesBrand = brandTokens.some((token) => sourceIdentity.includes(token));

  if (source?.uri && officialType && sourceMatchesBrand) return 'official';
  if (source?.uri && declared === 'strong-secondary') return 'strong-secondary';
  if (source?.uri && declared === 'secondary') return 'secondary';
  if (source?.uri) return 'strong-secondary';
  return 'heuristic';
}

function normalizeProviderEvidence(parsed, sources, request) {
  const items = Array.isArray(parsed?.evidence) ? parsed.evidence : [];
  return items.map((item, index) => {
    const source = matchCitedSource(item || {}, sources, index);
    return {
      type: String(item?.type || 'review'),
      title: String(item?.title || source?.title || 'Cited source'),
      sourceName: String(item?.sourceName || source?.title || ''),
      sourceUrl: source?.uri || null,
      publishedDate: typeof item?.publishedDate === 'string' ? item.publishedDate : null,
      availabilityStart: Number.isInteger(item?.availabilityStart) ? item.availabilityStart : null,
      availabilityEnd: Number.isInteger(item?.availabilityEnd) ? item.availabilityEnd : null,
      productionStart: Number.isInteger(item?.productionStart) ? item.productionStart : null,
      productionEnd: Number.isInteger(item?.productionEnd) ? item.productionEnd : null,
      yearRange: typeof item?.yearRange === 'string' ? item.yearRange : null,
      supports: String(item?.supports || ''),
      quality: classifyQuality(item || {}, source, request?.brand),
      verified: Boolean(source?.uri),
    };
  });
}

function extractJson(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('EMPTY_PROVIDER_OUTPUT');
  try {
    return JSON.parse(raw);
  } catch (_) {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) return JSON.parse(fenced[1]);
    const object = raw.match(/\{[\s\S]*\}/);
    if (object) return JSON.parse(object[0]);
    throw new Error('MALFORMED_PROVIDER_JSON');
  }
}

function collectOutputText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text;
  const items = Array.isArray(payload?.output) ? payload.output : [];
  const chunks = [];
  for (const item of items) {
    const contents = Array.isArray(item?.content) ? item.content : [];
    for (const content of contents) {
      if (content?.type === 'output_text' && typeof content.text === 'string') chunks.push(content.text);
    }
  }
  return chunks.join('\n').trim();
}

function errorForStatus(status) {
  const code = status === 429 ? 'GROUNDING_RATE_LIMIT' : 'GROUNDING_PROVIDER_ERROR';
  const error = new Error(`OPENAI_REFINEMENT_HTTP_${status}`);
  error.status = status;
  error.code = code;
  return error;
}

/**
 * One bounded OpenAI Responses call with web search for serial-refinement
 * evidence. Uses the caller-supplied deadline's run() the same way Smart
 * Lookup's callOpenAiResponses does, so budget accounting stays consistent
 * across both callers.
 */
export async function callOpenAiRefinement(request, options = {}) {
  const env = options.env || process.env;
  const apiKey = options.openAiApiKey ?? env.OPENAI_API_KEY;
  const model = options.openAiModel || env.OPENAI_SERIAL_REFINEMENT_MODEL || DEFAULT_MODEL;
  const fetchImpl = options.fetchImpl || fetch;
  const deadline = options.deadline;
  const prompt = options.prompt || buildOpenAiRefinementPrompt(request);

  if (!apiKey) {
    const error = new Error('OPENAI_API_KEY_MISSING');
    error.code = 'GROUNDING_NOT_CONFIGURED';
    throw error;
  }
  if (!deadline) {
    const error = new Error('MISSING_DEADLINE');
    error.code = 'GROUNDING_NOT_CONFIGURED';
    throw error;
  }

  return deadline.run('refine-serial-date-openai', async ({ signal }) => {
    let response;
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
          store: false,
          max_output_tokens: options.maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS,
          reasoning: { effort: options.reasoningEffort || env.OPENAI_REASONING_EFFORT || 'low' },
          text: {
            format: {
              type: 'json_schema',
              name: 'serial_refinement_result',
              strict: false,
              schema: REFINE_SCHEMA,
            },
          },
        }),
        signal,
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      const networkError = new Error('OPENAI_REFINEMENT_NETWORK_ERROR');
      networkError.code = 'GROUNDING_PROVIDER_ERROR';
      throw networkError;
    }

    if (!response.ok) throw errorForStatus(Number(response.status || 0));

    let payload;
    try {
      payload = await response.json();
    } catch (_) {
      const error = new Error('OPENAI_REFINEMENT_MALFORMED_RESPONSE');
      error.code = 'GROUNDING_PROVIDER_ERROR';
      throw error;
    }

    const text = collectOutputText(payload);
    if (!text) {
      const error = new Error('OPENAI_REFINEMENT_EMPTY_RESULT');
      error.code = 'GROUNDING_PROVIDER_ERROR';
      throw error;
    }

    let parsed;
    try {
      parsed = extractJson(text);
    } catch (_) {
      const error = new Error('OPENAI_REFINEMENT_SCHEMA_INVALID');
      error.code = 'REFINEMENT_SCHEMA_INVALID';
      throw error;
    }

    const sources = extractOpenAiSources(payload);
    const evidence = normalizeProviderEvidence(parsed, sources, request);

    return {
      modelIdentity: parsed?.modelIdentity || null,
      evidence,
      notes: String(parsed?.notes || ''),
      groundingSources: sources,
      provider: 'openai-web-search',
    };
  }, {
    maxMs: options.openAiMaxMs || DEFAULT_MAX_MS,
    reserveMs: options.reserveMs || 10,
  });
}
