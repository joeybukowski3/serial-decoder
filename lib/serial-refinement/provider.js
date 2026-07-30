import { createDeadline } from '../smart-lookup/deadline.js';
import { findLocalModelAgeResult } from '../smart-lookup/age-legacy.js';
import { classifySmartLookupQuery } from '../smart-lookup/normalize.js';
import {
  callSmartLookupAgeProvider,
  getSmartLookupProviderMetadata,
} from '../smart-lookup/provider.js';
import {
  callSmartLookupOpenAiAgeProvider,
  isOpenAiSmartLookupEnabled,
} from '../smart-lookup/openai-provider.js';
import { normalizeSmartAgeResult } from '../smart-lookup/result-schema.js';
import { evaluateEvidencePolicy } from './evidence-policy.js';

const DEFAULT_MODEL = process.env.GEMINI_GROUNDED_MODEL || 'gemini-2.5-flash';
// Real Gemini Google Search grounding round-trips observed at 4-19s; 3500ms
// aborted genuine in-flight responses before they could return evidence.
const DEFAULT_GROUNDED_BUDGET_MS = 12000;
const DEFAULT_SMART_LOOKUP_BUDGET_MS = 10000;

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

function normalizeSourceTitle(value) {
  return String(value || '').trim().toLowerCase().replace(/^www\./, '');
}

function collectGroundingSources(candidate) {
  const chunks = candidate?.groundingMetadata?.groundingChunks || [];
  return chunks
    .map((chunk, index) => ({
      index,
      sourceUrl: chunk?.web?.uri || null,
      title: chunk?.web?.title || '',
      normalizedTitle: normalizeSourceTitle(chunk?.web?.title),
    }))
    .filter((source) => source.sourceUrl);
}

function matchGroundedSource(item, sources, index) {
  const requestedTitle = normalizeSourceTitle(item.sourceName || item.title || '');
  if (requestedTitle) {
    const exact = sources.find((source) =>
      source.normalizedTitle === requestedTitle ||
      source.normalizedTitle.includes(requestedTitle) ||
      requestedTitle.includes(source.normalizedTitle));
    if (exact) return exact;
  }
  if (typeof item.sourceIndex === 'number' && sources[item.sourceIndex]) return sources[item.sourceIndex];
  return sources[index] || sources[0] || null;
}

function classifyQuality(item, source, brand) {
  const declared = String(item.quality || '').toLowerCase();
  const evidenceType = String(item.type || '').toLowerCase();
  const officialType = /^(manufacturer|manufacturer-support|manual|spec-sheet|regulatory|manufacturer-parts)$/i.test(evidenceType);
  const sourceIdentity = `${source?.title || ''} ${source?.sourceUrl || ''}`.toLowerCase();
  const sourceTitle = String(source?.title || '').toLowerCase();
  const brandTokens = String(brand || '').toLowerCase().match(/[a-z0-9]{2,}/g) || [];
  // Short brand codes (e.g. "GE") are only trustworthy against the clean
  // grounding source title, not the full identity string, since the
  // redirect URL's noisy base64 payload can coincidentally contain any
  // given 2-character substring.
  const sourceMatchesBrand = brandTokens.some((token) =>
    (token.length >= 3 ? sourceIdentity : sourceTitle).includes(token));

  if (source?.sourceUrl && officialType && sourceMatchesBrand) return 'official';
  if (source?.sourceUrl && declared === 'strong-secondary') return 'strong-secondary';
  if (source?.sourceUrl && declared === 'secondary') return 'secondary';
  if (source?.sourceUrl) return 'strong-secondary';
  return 'heuristic';
}

function normalizeProviderEvidence(parsed, sources, request) {
  const items = Array.isArray(parsed?.evidence) ? parsed.evidence : [];
  return items.map((item, index) => {
    const source = matchGroundedSource(item || {}, sources, index);
    return {
      type: String(item?.type || 'review'),
      title: String(item?.title || source?.title || 'Grounded source'),
      sourceName: String(item?.sourceName || source?.title || ''),
      sourceUrl: source?.sourceUrl || null,
      publishedDate: typeof item?.publishedDate === 'string' ? item.publishedDate : null,
      availabilityStart: Number.isInteger(item?.availabilityStart) ? item.availabilityStart : null,
      availabilityEnd: Number.isInteger(item?.availabilityEnd) ? item.availabilityEnd : null,
      productionStart: Number.isInteger(item?.productionStart) ? item.productionStart : null,
      productionEnd: Number.isInteger(item?.productionEnd) ? item.productionEnd : null,
      yearRange: typeof item?.yearRange === 'string' ? item.yearRange : null,
      supports: String(item?.supports || ''),
      quality: classifyQuality(item || {}, source, request?.brand),
      verified: Boolean(source?.sourceUrl),
    };
  });
}

export function buildGroundedRefinementPrompt({ brand, model, category, candidateYears, decodedMonth, context }) {
  return `You are researching model availability boundaries for a serial-number date refinement system.

Brand: ${brand}
Model: ${model}
Category: ${category || 'unknown'}
Serial-valid candidate years: ${candidateYears.join(', ')}
Decoded month or period: ${decodedMonth || 'unknown'}
Optional user context: ${context || 'none'}

Research the exact model, not merely a broad family prefix. Use official manufacturer product pages, official support pages, manuals, specification sheets, regulatory records, or manufacturer parts literature whenever possible. If no official source is available, use reputable independent sources and clearly label them secondary.

Do not select a manufacture year. Do not calculate a midpoint. Do not choose the nearest candidate. Return only evidence-backed availability or production boundaries that can be used by deterministic code to eliminate impossible candidate years.

Important distinctions:
- Release, manual-publication, review, and retailer dates are boundaries, not the individual item's manufacture date.
- Preserve regional, revision, and suffix differences in the model number.
- If the model cannot be verified, return an empty evidence array.
- Unsupported inference must be labeled heuristic and must not claim an exact year.

Return valid JSON only:
{
  "modelIdentity": "exact identified model or null",
  "evidence": [
    {
      "type": "manufacturer | manufacturer-support | manual | spec-sheet | regulatory | manufacturer-parts | archive | retailer | review | heuristic",
      "title": "source title",
      "sourceName": "publisher or site shown in the grounded source",
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

export async function callGeminiGroundedSearchOnly(request, options = {}) {
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const error = new Error('GEMINI_API_KEY_MISSING');
    error.code = 'GROUNDING_NOT_CONFIGURED';
    throw error;
  }
  const fetchImpl = options.fetchImpl || fetch;
  const model = options.model || DEFAULT_MODEL;
  const prompt = buildGroundedRefinementPrompt(request);
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: options.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.1 },
      }),
    },
  );

  if (!response.ok) {
    const error = new Error(`GEMINI_GROUNDED_HTTP_${response.status}`);
    error.status = response.status;
    error.code = response.status === 429 ? 'GROUNDING_RATE_LIMIT' : 'GROUNDING_PROVIDER_ERROR';
    throw error;
  }

  const payload = await response.json();
  const candidate = payload?.candidates?.[0];
  const text = candidate?.content?.parts?.map((part) => part?.text || '').join('') || '';
  const sources = collectGroundingSources(candidate);
  if (!sources.length) {
    const error = new Error('GROUNDING_METADATA_MISSING');
    error.code = 'GROUNDING_METADATA_MISSING';
    throw error;
  }

  const parsed = extractJson(text);
  const evidence = normalizeProviderEvidence(parsed, sources, request);
  if (!evidence.some((item) => item.sourceUrl)) {
    const error = new Error('GROUNDING_CITATIONS_MISSING');
    error.code = 'GROUNDING_CITATIONS_MISSING';
    throw error;
  }

  return {
    modelIdentity: parsed?.modelIdentity || null,
    evidence,
    notes: String(parsed?.notes || ''),
    groundingSources: sources,
    provider: 'gemini-google-search',
  };
}

function createBoundedSignal(parentSignal, timeoutMs) {
  const controller = new AbortController();
  const abort = () => {
    try { controller.abort(); } catch (_) {}
  };
  if (parentSignal?.aborted) abort();
  else if (parentSignal?.addEventListener) parentSignal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, Math.max(25, timeoutMs));
  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer);
      if (parentSignal?.removeEventListener) parentSignal.removeEventListener('abort', abort);
    },
  };
}

function modelQuery(request) {
  return [request?.brand, request?.model, request?.category]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ');
}

function smartLookupEvidence(result, provider) {
  const range = result?.productionRange;
  if (!range || !Number.isInteger(range.start)) return null;
  const providerLabels = {
    'smart-lookup-local': 'Smart Lookup local model database',
    'smart-lookup-openai': 'Smart Lookup via OpenAI',
    'smart-lookup-xai': 'Smart Lookup via xAI',
    'smart-lookup-groq': 'Smart Lookup via Groq',
    'smart-lookup-gemini': 'Smart Lookup via Gemini',
  };
  const lowerBound = Math.max(1800, range.start - 1);
  return {
    modelIdentity: result.model || null,
    evidence: [{
      type: 'smart-lookup-model-range',
      title: `${result.brand || 'Unknown'} ${result.model || ''} model availability`.trim(),
      sourceName: providerLabels[provider] || 'Smart Lookup model research',
      sourceUrl: null,
      publishedDate: null,
      availabilityStart: lowerBound,
      availabilityEnd: null,
      productionStart: lowerBound,
      productionEnd: null,
      yearRange: `since ${lowerBound}`,
      supports: `Smart Lookup places the model era around ${range.start}-${Number.isInteger(range.end) ? range.end : 'present'}. With one year of introduction-date tolerance, this is used only to exclude earlier serial cycles; it is not the unit's manufacture year.`,
      quality: 'model-intelligence',
      verified: false,
    }],
    notes: result.notes || 'Smart Lookup supplied an advisory model-era lower bound.',
    groundingSources: [],
    provider,
    fallbackUsed: true,
  };
}

export async function callSmartLookupModelEvidence(request, options = {}) {
  const query = modelQuery(request);
  if (!query) return null;
  const queryInfo = classifySmartLookupQuery(query);
  const localLookup = options.smartLocalLookup || findLocalModelAgeResult;
  const local = await localLookup(query, query.toLowerCase());
  if (local?.productionRange) {
    const normalized = normalizeSmartAgeResult(local, {
      queryInfo,
      source: 'local-db',
      originSource: 'local-db',
      evidenceSource: 'local-db',
      providerAttempted: false,
      currentYear: new Date().getFullYear(),
    });
    return smartLookupEvidence(normalized, 'smart-lookup-local');
  }

  const budgetMs = Math.max(250, options.smartLookupBudgetMs || DEFAULT_SMART_LOOKUP_BUDGET_MS);
  const deadline = options.deadline || createDeadline({ totalMs: budgetMs });
  const env = options.env || process.env;
  const openAiEnabled = options.openAiEnabled
    ?? (isOpenAiSmartLookupEnabled(env) && Boolean(env.OPENAI_API_KEY));
  const raw = openAiEnabled
    ? await (options.openAiProviderLookup || callSmartLookupOpenAiAgeProvider)(queryInfo, {
        deadline,
        openAiMaxMs: Math.min(13000, Math.max(100, deadline.remainingMs(150))),
        xaiMaxMs: Math.min(10000, Math.max(100, deadline.remainingMs(150))),
        reserveMs: 150,
        fetchImpl: options.fetchImpl,
        env,
      })
    : await (options.smartProviderLookup || callSmartLookupAgeProvider)(queryInfo, {
        deadline,
        maxMs: Math.max(100, Math.min(budgetMs - 100, deadline.remainingMs(75))),
        reserveMs: 75,
        groqMaxMs: Math.min(5000, Math.max(100, deadline.remainingMs(150))),
        groqMinMs: 75,
        fetchImpl: options.fetchImpl,
        apiKey: options.apiKey,
        groqApiKey: options.groqApiKey,
        groqModel: options.groqModel,
      });
  const metadata = getSmartLookupProviderMetadata(raw);
  const providerName = ['openai', 'xai', 'groq'].includes(metadata.provider)
    ? metadata.provider
    : 'gemini';
  const normalized = normalizeSmartAgeResult(raw, {
    queryInfo,
    source: providerName,
    originSource: providerName,
    evidenceSource: `${providerName}-ungrounded`,
    providerAttempted: true,
    fallbackUsed: metadata.fallbackUsed,
    currentYear: new Date().getFullYear(),
  });
  return smartLookupEvidence(normalized, `smart-lookup-${providerName}`);
}

export async function callSerialRefinementProvider(request, options = {}) {
  let grounded = null;
  let groundedError = null;
  const groundedScope = createBoundedSignal(
    options.signal,
    options.groundedBudgetMs || DEFAULT_GROUNDED_BUDGET_MS,
  );
  try {
    grounded = await callGeminiGroundedSearchOnly(request, {
      ...options,
      signal: groundedScope.signal,
    });
  } catch (error) {
    groundedError = error;
  } finally {
    groundedScope.cleanup();
  }

  const groundedPolicy = evaluateEvidencePolicy(grounded?.evidence || []);
  if (groundedPolicy.sufficient) return grounded;

  try {
    const smart = await callSmartLookupModelEvidence(request, options);
    if (smart) {
      return {
        ...smart,
        evidence: [...(grounded?.evidence || []), ...(smart.evidence || [])],
        notes: [grounded?.notes, smart.notes].filter(Boolean).join(' '),
      };
    }
  } catch (smartError) {
    if (!grounded) throw groundedError || smartError;
  }

  if (grounded) return grounded;
  throw groundedError || Object.assign(new Error('SERIAL_REFINEMENT_PROVIDER_UNAVAILABLE'), {
    code: 'REFINEMENT_UNAVAILABLE',
  });
}

export async function callGeminiGroundedSearch(request, options = {}) {
  return callSerialRefinementProvider(request, options);
}
