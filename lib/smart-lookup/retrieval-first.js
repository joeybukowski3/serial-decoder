import { classifySmartLookupQuery, compactModel, normalizeWhitespace } from './normalize.js';
import { serperRequest, SERPER_CREDITS } from '../serper/transport.js';
import { extractDomain, isManufacturerDomain } from '../serper/model-search.js';
import { usageFromGemini } from './provider-attempts.js';
import { DEFAULT_GUIDANCE_MODEL } from './guidance-provider.js';
import { createBoundedAbort } from '../serial-refinement/bounded-abort.js';

const GEMINI_API_VERSION = 'v1beta';
const GEMINI_API_BASE = `https://generativelanguage.googleapis.com/${GEMINI_API_VERSION}/models`;
const DEFAULT_SERPER_TIMEOUT_MS = 5000;
const IDENTIFIER_TYPES = new Set(['model', 'model-line', 'part-number', 'serial-number', 'service-tag', 'sku', 'unknown']);
const CONFIDENCES = new Set(['high', 'medium', 'low']);
const CATEGORY_WORDS = /\b(washer|dryer|battery|motor|vacuum|microwave|monitor|speaker|television|tv|laptop|chromebook|refrigerator|appliance|power station|energy bar)\b/i;
const DOCUMENT_WORDS = /\b(manual|documentation|support|specifications|datasheet|product page|parts diagram)\b/i;
const SPAM_WORDS = /\b(keyword stuffing|scraped|click here for more|unrelated products)\b/i;
const YEAR_CONTEXT = /\b(introduced|released|launched|debuted|model year|produced|manufactured|production|sold from|sold through)\b/i;
const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'from', 'model', 'product', 'parts', 'part', 'manual', 'official', 'shop', 'buy', 'new', 'used']);

const clean = (value, length = 500) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, length);
const optional = (value, length = 200) => typeof value === 'string' ? clean(value, length) || null : null;
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function isRetrievalFirstEligible(queryInfo, route) {
  const identifier = canonicalIdentifier(queryInfo?.modelIdentity || queryInfo?.model || '');
  return route?.mode === 'precision_research' && queryInfo?.providerEligible === true
    && queryInfo?.identifierClarification !== true && queryInfo?.querySpecificity !== 'unusable'
    && !queryInfo?.serialIdentity && identifier.length >= 3 && /\d/.test(identifier);
}

export function retrievalFirstResponseInput(report) {
  const identity = report?.finalRetrievalFirstResult;
  const strongest = report?.parsed?.strongestIdentifier;
  const sources = (report?.evidencePackage?.topResults || []).filter((row) => row.url && row.domain
    && (identity ? row.exactIdentifier : row.matchedIdentifiers?.length))
    .slice(0, 4).map((row) => ({ title: row.title, domain: row.domain, uri: row.url }));
  if (identity && sources.length) return {
    brand: identity.brand, model: identity.model, exactModel: identity.exactModel,
    productType: identity.productType, category: identity.productType,
    likelyProduct: identity.likelyProduct, summary: identity.description,
    identityConfidence: identity.identityConfidence, timingConfidence: identity.dateConfidence,
    introductionYear: identity.introductionYear, productionRange: identity.productionRange,
    originalIdentifier: identity.originalIdentifier, identifierType: identity.identifierType,
    refinementSuggestion: identity.refinementSuggestion,
    refinementNeeded: identity.needsMoreDetail, needsMoreDetail: identity.needsMoreDetail,
    sources, resultType: 'retrieval-identity', supportedIdentifiers: report.supportedIdentifiers || [],
    unsupportedIdentifiers: report.unsupportedIdentifiers || [],
  };
  if (!report?.validation || report?.geminiRequestCount !== 1) return null;
  const brand = report?.parsed?.brandCandidate || (report?.parsed?.query.match(/^[A-Za-z]{4,}\b/) || [])[0];
  const supported = report?.supportedIdentifiers || [];
  const unsupported = report?.unsupportedIdentifiers || [];
  const rows = report?.evidencePackage?.topResults || [];
  const corroborated = brand && strongest && unsupported.some((code) => canonicalIdentifier(code) === canonicalIdentifier(strongest))
    && supported.length && rows.some((row) => row.matchedIdentifiers?.length && new RegExp(`\\b${escapeRegex(brand)}\\b`, 'i').test(`${row.title} ${row.snippet}`));
  if (!corroborated || !sources.length) return null;
  const suggestion = `The ${strongest} identifier could not be verified as a model or part number. Provide a full label photo or another model or part number.`;
  return { brand, model: null, exactModel: null, originalIdentifier: strongest, identifierType: 'unknown',
    likelyProduct: null, summary: `Some label information appears related to ${brand}, but ${strongest} remains unverified.`,
    identityConfidence: 'low', timingConfidence: 'unknown', refinementSuggestion: suggestion,
    refinementNeeded: true, needsMoreDetail: true, resultType: 'retrieval-partial', sources,
    supportedIdentifiers: supported, unsupportedIdentifiers: unsupported };
}

export function retrievalFirstSerperTimeoutMs(env) {
  const value = Number(env?.SMART_LOOKUP_RETRIEVAL_SERPER_TIMEOUT_MS);
  return Number.isInteger(value) && value > 0 ? Math.min(10000, Math.max(1000, value)) : DEFAULT_SERPER_TIMEOUT_MS;
}

export function canonicalIdentifier(value) {
  return compactModel(value);
}

// Boundaries prevent EB324 from matching EB3240. Separators may vary inside a code.
export function containsIdentifier(text, identifier) {
  const code = canonicalIdentifier(identifier);
  if (!code || code.length < 3) return false;
  const pattern = code.split('').map(escapeRegex).join('[\\s\\-/]*');
  return new RegExp(`(^|[^A-Z0-9])${pattern}(?![A-Z0-9])`, 'i').test(String(text ?? ''));
}

export function parseRetrievalQuery(rawQuery) {
  const query = normalizeWhitespace(rawQuery);
  if (!query || query.length > 160) throw new TypeError('QUERY_INVALID');
  const classified = classifySmartLookupQuery(query);
  const tokens = query.match(/[A-Za-z0-9]+(?:[-./][A-Za-z0-9]+)*/g) || [];
  const candidates = [classified.model, ...classified.ambiguousIdentifiers,
    ...tokens.filter((token) => /\d/.test(token) && (canonicalIdentifier(token).length >= 4 || /[A-Za-z]/.test(token) && token.length >= 3))];
  const identifiers = [...new Map(candidates.filter(Boolean).map((value) => [canonicalIdentifier(value), value])).values()];
  const strongestIdentifier = classified.model || identifiers.sort((a, b) => canonicalIdentifier(b).length - canonicalIdentifier(a).length)[0] || null;
  const bareNumeric = /^\d{8,}$/.test(query);
  const parsed = {
    query, brandCandidate: classified.brand || null, category: classified.productType || null,
    strongestIdentifier, identifiers, bareNumeric,
    identifierClarification: Boolean(classified.identifierClarification),
    querySpecificity: classified.querySpecificity, modelCompleteness: classified.modelCompleteness,
  };
  return parsed;
}

export function buildLiteralSearch(parsed) {
  const { query, strongestIdentifier } = parsed;
  if (!strongestIdentifier) return `"${query}"`;
  if (canonicalIdentifier(query) === canonicalIdentifier(strongestIdentifier)) return `"${query}"`;
  const escaped = escapeRegex(strongestIdentifier);
  const marker = new RegExp(`(^|[^A-Za-z0-9])(${escaped})(?=$|[^A-Za-z0-9])`, 'i');
  if (!marker.test(query)) return `"${query}"`;
  const quoted = query.replace(marker, (_, prefix, token) => `${prefix}"${token}"`);
  return quoted;
}

export function buildSecondarySearch(parsed) {
  const strongest = canonicalIdentifier(parsed.strongestIdentifier);
  const remaining = parsed.query.match(/[A-Za-z0-9]+(?:[-./][A-Za-z0-9]+)*/g)?.filter(
    (token) => canonicalIdentifier(token) !== strongest) || [];
  const relaxedTo = remaining.filter((token) => /\d/.test(token) && /[A-Za-z]/.test(token) && canonicalIdentifier(token).length >= 3);
  if (!strongest || !relaxedTo.length) return null;
  return { query: remaining.map((token) => `"${token}"`).join(' '),
    reason: 'Primary retrieval lacked exact identifier evidence; search remaining terms to test a broader product family.',
    relaxedIdentifier: parsed.strongestIdentifier };
}

function titleWords(title, identifiers) {
  const ids = new Set(identifiers.map(canonicalIdentifier));
  return [...new Set((title.toLowerCase().match(/[a-z]{4,}/g) || [])
    .filter((word) => !STOP_WORDS.has(word) && !ids.has(canonicalIdentifier(word))))];
}

export function scoreResults(parsed, results, searchStage = 'primary') {
  const identifier = parsed.strongestIdentifier;
  const scored = results.slice(0, 8).map((result, index) => {
    const title = clean(result.title, 240);
    const snippet = clean(result.snippet, 500);
    const url = clean(result.url || result.link, 1000);
    const domain = result.domain || extractDomain(url);
    const exactTitle = containsIdentifier(title, identifier);
    const exactSnippet = containsIdentifier(snippet, identifier);
    const exactIdentifier = exactTitle || exactSnippet;
    const brandMatch = Boolean(parsed.brandCandidate && new RegExp(`(^|[^a-z0-9])${escapeRegex(parsed.brandCandidate)}($|[^a-z0-9])`, 'i').test(`${title} ${snippet}`));
    const manufacturer = Boolean(domain && isManufacturerDomain(domain));
    const documentation = DOCUMENT_WORDS.test(`${title} ${snippet} ${url}`);
    const categoryContext = CATEGORY_WORDS.test(`${title} ${snippet}`);
    const spam = SPAM_WORDS.test(`${title} ${snippet}`);
    const differentIdentifierInTitle = !exactTitle && exactSnippet
      && /\b(?=[A-Z0-9-]{5,}\b)(?=[A-Z0-9-]*\d)[A-Z0-9-]+\b/i.test(title);
    const matchedIdentifiers = parsed.identifiers.filter((code) => containsIdentifier(`${title} ${snippet}`, code));
    const unsupportedIdentifiers = parsed.identifiers.filter((code) => !matchedIdentifiers.includes(code));
    const diagnostics = { exactTitle, exactSnippet, exactIdentifier, brandMatch, manufacturer, documentation, categoryContext, differentIdentifierInTitle, spam,
      matchedIdentifiers, unsupportedIdentifiers };
    const score = (exactTitle ? 5 : 0) + (exactSnippet ? 3 : 0)
      + (exactIdentifier && brandMatch ? 2 : 0) + (exactIdentifier && manufacturer ? 3 : 0)
      + (exactIdentifier && documentation ? 2 : 0) + (exactIdentifier && categoryContext ? 1 : 0)
      - (spam ? 4 : 0) - (differentIdentifierInTitle ? 2 : 0) - (!exactIdentifier ? 3 : 0);
    return { searchStage, position: Number.isInteger(result.position) ? result.position : index + 1,
      title, snippet, url, domain, date: result.date || null, score, diagnostics };
  }).sort((a, b) => b.score - a.score || a.position - b.position);
  const matching = scored.filter((row) => row.diagnostics.exactIdentifier);
  const independentMatchingDomains = new Set(matching.map((row) => row.domain).filter(Boolean)).size;
  const manufacturerMatch = matching.some((row) => row.diagnostics.manufacturer);
  const contextual = matching.filter((row) => row.diagnostics.categoryContext || row.diagnostics.documentation || row.diagnostics.brandMatch);
  const matchingWords = matching.map((row) => new Set(titleWords(row.title, parsed.identifiers)));
  const repeatedWords = matchingWords.length >= 2 ? [...matchingWords[0]].filter((word) => matchingWords.slice(1).some((words) => words.has(word))) : [];
  const numericConsensus = parsed.bareNumeric && manufacturerMatch && independentMatchingDomains >= 2 && repeatedWords.length > 0;
  let retrievalQuality = 'WEAK';
  if (!scored.length) retrievalQuality = 'EMPTY';
  else if ((parsed.bareNumeric || parsed.identifierClarification) && !numericConsensus) retrievalQuality = 'WEAK';
  else if (matching.length >= 2 && independentMatchingDomains >= 2 && contextual.length >= 2) retrievalQuality = 'STRONG';
  else if (manufacturerMatch && contextual.length >= 1) retrievalQuality = 'STRONG';
  else if (contextual.length >= 1) retrievalQuality = 'MODERATE';
  return { results: scored, exactIdentifierMatchCount: matching.length, independentMatchingDomains, manufacturerMatch, numericConsensus, retrievalQuality };
}

function combineScored(parsed, primary, secondary) {
  const results = [...primary.results, ...secondary.results].sort((a, b) => b.score - a.score || a.position - b.position);
  const supportedIdentifiers = parsed.identifiers.filter((code) => results.some((row) => row.diagnostics.matchedIdentifiers.includes(code)));
  const unsupportedIdentifiers = parsed.identifiers.filter((code) => !supportedIdentifiers.includes(code));
  const strongestSupported = supportedIdentifiers.some((code) => canonicalIdentifier(code) === canonicalIdentifier(parsed.strongestIdentifier));
  const familyRows = results.filter((row) => row.diagnostics.matchedIdentifiers.some((code) => canonicalIdentifier(code) !== canonicalIdentifier(parsed.strongestIdentifier))
    && (row.diagnostics.categoryContext || row.diagnostics.documentation));
  const familyDomains = new Set(familyRows.map((row) => row.domain).filter(Boolean));
  let retrievalQuality = primary.retrievalQuality;
  if (!strongestSupported) retrievalQuality = familyDomains.size >= 2 || familyRows.some((row) => row.diagnostics.manufacturer) ? 'MODERATE'
    : results.length ? 'WEAK' : 'EMPTY';
  else {
    const originalRows = results.filter((row) => row.diagnostics.matchedIdentifiers.some(
      (code) => canonicalIdentifier(code) === canonicalIdentifier(parsed.strongestIdentifier)));
    retrievalQuality = scoreResults(parsed, originalRows).retrievalQuality === 'STRONG' ? 'STRONG' : 'MODERATE';
  }
  return { results, exactIdentifierMatchCount: results.filter((row) => row.diagnostics.matchedIdentifiers.some(
    (code) => canonicalIdentifier(code) === canonicalIdentifier(parsed.strongestIdentifier))).length,
    independentMatchingDomains: new Set(results.filter((row) => row.diagnostics.matchedIdentifiers.includes(parsed.strongestIdentifier)).map((row) => row.domain).filter(Boolean)).size,
    manufacturerMatch: results.some((row) => row.diagnostics.manufacturer && row.diagnostics.matchedIdentifiers.includes(parsed.strongestIdentifier)),
    numericConsensus: primary.numericConsensus, retrievalQuality, supportedIdentifiers, unsupportedIdentifiers };
}

export function buildEvidencePackage(parsed, scored) {
  const seen = new Set();
  const topResults = scored.results.filter((row) => {
    if (!row.domain || seen.has(row.domain)) return false;
    seen.add(row.domain);
    return true;
  }).slice(0, 6).map(({ searchStage, position, title, snippet, url, domain, date, score, diagnostics }) =>
    ({ searchStage, position, title, snippet, url, domain, date, score, exactIdentifier: diagnostics.exactIdentifier,
      matchedIdentifiers: diagnostics.matchedIdentifiers, unsupportedIdentifiers: diagnostics.unsupportedIdentifiers }));
  const counts = new Map();
  for (const row of topResults) for (const word of titleWords(row.title, parsed.identifiers)) counts.set(word, (counts.get(word) || 0) + 1);
  const repeatedDescriptionWords = [...counts].filter(([, count]) => count >= 2).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([word, count]) => ({ word, domains: count }));
  const exactTitles = topResults.filter((row) => row.exactIdentifier).map((row) => ({ domain: row.domain, title: row.title }));
  const categories = [...new Set(exactTitles.flatMap((row) => row.title.match(CATEGORY_WORDS) || []).map((word) => word.toLowerCase()))];
  const disagreements = categories.length > 1 ? [`Different category words in matching titles: ${categories.join(', ')}`] : [];
  return { originalQuery: parsed.query, identifiers: parsed.identifiers, strongestIdentifier: parsed.strongestIdentifier,
    supportedIdentifiers: scored.supportedIdentifiers || parsed.identifiers.filter((code) => scored.results.some((row) => row.diagnostics.matchedIdentifiers.includes(code))),
    unsupportedIdentifiers: scored.unsupportedIdentifiers || parsed.identifiers.filter((code) => !scored.results.some((row) => row.diagnostics.matchedIdentifiers.includes(code))),
    brandCandidate: parsed.brandCandidate, bareNumeric: parsed.bareNumeric, retrievalQuality: scored.retrievalQuality,
    exactIdentifierMatchCount: scored.exactIdentifierMatchCount, independentMatchingDomains: scored.independentMatchingDomains,
    repeatedDescriptionWords, exactTitles, disagreements, topResults };
}

export function synthesisPrompt(evidence) {
  return `You are identifying a physical product from Google Search results already retrieved by our application. Do not search the web or use outside knowledge. Do not invent facts. The user's literal identifier is authoritative. Source snippets may conflict. Determine only what the supplied evidence collectively supports. Primary and secondary search results are labeled separately. supportedIdentifiers are directly corroborated; unsupportedIdentifiers remain unresolved. Never turn an unsupported identifier into a model, exactModel, product association, or known identifier type. You may return a broader product-family identity with model and exactModel null, originalIdentifier preserved, identifierType unknown, needsMoreDetail true, and medium or low confidence when supported. A product identity without a defensible year is a success; do not guess a year. A bare numeric identifier can occur in unrelated contexts; ask for detail unless the results clearly establish one product. Return JSON with exactly these fields: identified (boolean), brand, model, exactModel, originalIdentifier, identifierType (model|model-line|part-number|serial-number|service-tag|sku|unknown), productType, likelyProduct, description, identityConfidence (high|medium|low), identityBasis, introductionYear (number|null), productionRange (string|null), dateConfidence (high|medium|low|unknown), needsMoreDetail (boolean), refinementSuggestion (string|null). Use null for unsupported fields. Evidence:\n${JSON.stringify(evidence)}`;
}

function providerErrorField(value) {
  if (Number.isInteger(value) && value >= 100 && value <= 599) return value;
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(value) ? value : null;
}

export async function synthesizeFromEvidence(evidence, { apiKey, fetchImpl = fetch, env = process.env, timeoutMs = 6500 } = {}) {
  const model = String(env?.SMART_LOOKUP_RETRIEVAL_GEMINI_MODEL || '').trim() || DEFAULT_GUIDANCE_MODEL;
  const diagnostics = { httpStatus: null, providerErrorCode: null, providerErrorStatus: null, model, apiVersion: GEMINI_API_VERSION };
  if (!apiKey) return { ok: false, error: 'GEMINI_API_KEY_MISSING', requestCount: 0, usage: null, diagnostics };
  const bounded = createBoundedAbort(null, timeoutMs);
  try {
    const response = await fetchImpl(`${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      signal: bounded.signal,
      body: JSON.stringify({ contents: [{ parts: [{ text: synthesisPrompt(evidence) }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0, maxOutputTokens: 1200 } }),
    });
    if (!response.ok) {
      diagnostics.httpStatus = Number.isInteger(response.status) ? response.status : null;
      try {
        const providerError = (await response.json())?.error;
        diagnostics.providerErrorCode = providerErrorField(providerError?.code);
        diagnostics.providerErrorStatus = providerErrorField(providerError?.status);
      } catch (_) { /* Provider error body is optional. */ }
      return { ok: false, error: `GEMINI_HTTP_${response.status}`, requestCount: 1, usage: null, diagnostics };
    }
    const payload = await response.json();
    const content = payload?.candidates?.[0]?.content?.parts?.filter((part) => !part.thought).map((part) => part.text || '').join('') || '';
    return { ok: true, result: JSON.parse(content), requestCount: 1, usage: usageFromGemini(payload), model };
  } catch (error) {
    return { ok: false, error: error?.name === 'AbortError' ? 'GEMINI_TIMEOUT' : 'GEMINI_INVALID_RESPONSE', requestCount: 1, usage: null, diagnostics };
  } finally { bounded.cleanup(); }
}

function hasSupportedYear(value, results) {
  if (!value) return false;
  const years = String(value).match(/\b(?:19|20)\d{2}\b/g) || [];
  if (!years.length) return false;
  return years.every((year) => results.some((row) => {
    const text = `${row.title} ${row.snippet}`;
    const at = text.indexOf(year);
    return row.diagnostics.exactIdentifier && at >= 0 && YEAR_CONTEXT.test(text.slice(Math.max(0, at - 80), at + 30));
  }));
}

export function validateSynthesis(parsed, scored, raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { accepted: false, reason: 'INVALID_SYNTHESIS', result: null };
  const result = {
    identified: raw.identified === true, brand: optional(raw.brand), model: optional(raw.model),
    exactModel: optional(raw.exactModel), originalIdentifier: optional(raw.originalIdentifier),
    identifierType: IDENTIFIER_TYPES.has(raw.identifierType) ? raw.identifierType : 'unknown',
    productType: optional(raw.productType), likelyProduct: optional(raw.likelyProduct),
    description: optional(raw.description, 500), identityConfidence: CONFIDENCES.has(raw.identityConfidence) ? raw.identityConfidence : 'low',
    identityBasis: optional(raw.identityBasis, 500), introductionYear: Number.isInteger(raw.introductionYear) ? raw.introductionYear : null,
    productionRange: optional(raw.productionRange), dateConfidence: CONFIDENCES.has(raw.dateConfidence) ? raw.dateConfidence : 'unknown',
    needsMoreDetail: raw.needsMoreDetail === true, refinementSuggestion: optional(raw.refinementSuggestion),
  };
  if (!result.identified) return { accepted: false, reason: 'NOT_IDENTIFIED', result };
  if (scored.retrievalQuality === 'EMPTY' || !scored.results.some((row) => row.diagnostics.matchedIdentifiers.length))
    return { accepted: false, reason: 'NO_EXACT_EVIDENCE', result };
  if ((parsed.bareNumeric || parsed.identifierClarification) && !scored.numericConsensus)
    return { accepted: false, reason: 'AMBIGUOUS_BARE_NUMERIC_IDENTIFIER', result: { ...result, identified: false, needsMoreDetail: true } };
  if (parsed.brandCandidate && result.brand && canonicalIdentifier(parsed.brandCandidate) !== canonicalIdentifier(result.brand))
    return { accepted: false, reason: 'BRAND_CONTRADICTION', result };
  const identities = [...new Set([result.model, result.exactModel, result.originalIdentifier].filter(Boolean))];
  if (!identities.length) return { accepted: false, reason: 'MISSING_IDENTIFIER', result };
  const strongestSupported = scored.results.some((row) => row.diagnostics.matchedIdentifiers.some(
    (code) => canonicalIdentifier(code) === canonicalIdentifier(parsed.strongestIdentifier)));
  if (!strongestSupported && (result.model || result.exactModel || result.identifierType !== 'unknown'
    || !result.needsMoreDetail || !result.refinementSuggestion || !result.originalIdentifier
    || canonicalIdentifier(result.originalIdentifier) !== canonicalIdentifier(parsed.strongestIdentifier)))
    return { accepted: false, reason: 'UNRESOLVED_IDENTIFIER_CLAIM', result };
  if (!strongestSupported && containsIdentifier(result.identityBasis, parsed.strongestIdentifier)
    && !/\b(unresolved|unsupported|unverified|unknown|uncorroborated)\b/i.test(result.identityBasis))
    return { accepted: false, reason: 'UNRESOLVED_IDENTIFIER_CLAIM', result };
  for (const identity of identities) {
    const isUnresolvedOriginal = !strongestSupported && identity === result.originalIdentifier;
    const supported = scored.results.some((row) => row.diagnostics.matchedIdentifiers.length && containsIdentifier(`${row.title} ${row.snippet}`, identity));
    if (isUnresolvedOriginal) continue;
    if (!supported) return { accepted: false, reason: 'UNSUPPORTED_IDENTIFIER', result };
    const code = canonicalIdentifier(identity);
    const strongest = canonicalIdentifier(parsed.strongestIdentifier);
    const rawCode = canonicalIdentifier(parsed.query);
    if (strongest && !(code === strongest || (code.includes(strongest) && rawCode.includes(code))))
      return { accepted: false, reason: 'IDENTIFIER_CHANGED', result };
  }
  const descriptiveCodes = `${result.likelyProduct || ''} ${result.description || ''}`.match(/\b(?=[A-Z0-9-]{5,}\b)(?=[A-Z0-9-]*[A-Z])(?=[A-Z0-9-]*\d)[A-Z0-9]+(?:[-/][A-Z0-9]+)*\b/gi) || [];
  if (descriptiveCodes.some((code) => !scored.results.some((row) => row.diagnostics.matchedIdentifiers.length
    && containsIdentifier(`${row.title} ${row.snippet}`, code))))
    return { accepted: false, reason: 'UNSUPPORTED_DESCRIPTIVE_CODE', result };
  if (result.brand && !scored.results.some((row) => row.diagnostics.matchedIdentifiers.length
    && new RegExp(`(^|[^a-z0-9])${escapeRegex(result.brand)}($|[^a-z0-9])`, 'i').test(`${row.title} ${row.snippet}`)))
    return { accepted: false, reason: 'UNSUPPORTED_BRAND', result };
  if (!strongestSupported && result.productType && !scored.results.some((row) => row.diagnostics.matchedIdentifiers.length
    && result.productType.toLowerCase().split(/\s+/).every((word) => new RegExp(`\\b${escapeRegex(word)}\\b`, 'i').test(`${row.title} ${row.snippet}`))))
    return { accepted: false, reason: 'UNSUPPORTED_PRODUCT_TYPE', result };
  if (!strongestSupported && scored.retrievalQuality !== 'MODERATE') result.identityConfidence = 'low';
  if (!strongestSupported && result.identityConfidence === 'high') result.identityConfidence = 'medium';
  if (result.introductionYear && !hasSupportedYear(result.introductionYear, scored.results)) result.introductionYear = null;
  if (result.productionRange && !hasSupportedYear(result.productionRange, scored.results)) result.productionRange = null;
  if (!result.introductionYear && !result.productionRange) result.dateConfidence = 'unknown';
  if (scored.retrievalQuality === 'WEAK') result.identityConfidence = 'low';
  if (scored.retrievalQuality === 'MODERATE' && result.identityConfidence === 'high') result.identityConfidence = 'medium';
  return { accepted: true, reason: null, result };
}

export async function retrievalFirstLookup(rawQuery, { live = true, serperApiKey, geminiApiKey, serperFetchImpl, geminiFetchImpl, searchImpl, synthesisImpl, env = process.env, searchTimeoutMs, synthesisTimeoutMs } = {}) {
  const startedAt = Date.now();
  const parsed = parseRetrievalQuery(rawQuery);
  const searchQuery = buildLiteralSearch(parsed);
  const report = { inputQuery: parsed.query, parsed, searchQueriesIssued: [], plannedSearchQuery: searchQuery,
    primarySearchQuery: searchQuery, secondarySearchQuery: null, secondarySearchReason: null, relaxedIdentifier: null,
    serperRequestCount: 0, geminiRequestCount: 0, latencyMs: 0, rawNormalizedTopResults: [], scoredResults: [],
    exactIdentifierMatchCount: 0, independentMatchingDomains: 0, manufacturerMatch: false,
    retrievalQuality: 'EMPTY', primaryRetrievalQuality: 'EMPTY', secondaryRetrievalQuality: null,
    combinedRetrievalQuality: 'EMPTY', supportedIdentifiers: [], unsupportedIdentifiers: parsed.identifiers,
    evidencePackage: null, geminiSynthesis: null, geminiDiagnostics: null, geminiModel: null, validation: null,
    finalRetrievalFirstResult: null, failureReason: null, providerUsage: { serperCredits: 0, gemini: null } };
  if (!live) { report.failureReason = 'DRY_RUN'; return report; }
  try {
    if (!searchImpl && !serperApiKey) throw new Error('SERPER_API_KEY_MISSING');
    const search = async (query) => {
      report.searchQueriesIssued.push(query);
      report.serperRequestCount += 1;
      report.providerUsage.serperCredits += SERPER_CREDITS.search;
      const rows = searchImpl ? await searchImpl(query) : await serperRequest(
        { kind: 'search', query }, { apiKey: serperApiKey, fetchImpl: serperFetchImpl || fetch,
          preserveProviderMetadata: true, maxOrganicResults: 8, timeoutMs: searchTimeoutMs || retrievalFirstSerperTimeoutMs(env) });
      return rows.slice(0, 8).map((row, index) => ({
        position: Number.isInteger(row.position) ? row.position : index + 1, title: row.title,
        snippet: row.snippet, url: row.url || row.link, domain: row.domain || extractDomain(row.url || row.link), date: row.date || null,
      }));
    };
    report.rawNormalizedTopResults = await search(searchQuery);
    const primary = scoreResults(parsed, report.rawNormalizedTopResults);
    report.primaryRetrievalQuality = primary.retrievalQuality;
    let scored = primary;
    if ((!primary.results.length || (primary.exactIdentifierMatchCount === 0 && ['EMPTY', 'WEAK'].includes(primary.retrievalQuality)))) {
      const secondary = buildSecondarySearch(parsed);
      if (secondary) {
        report.secondarySearchQuery = secondary.query;
        report.secondarySearchReason = secondary.reason;
        report.relaxedIdentifier = secondary.relaxedIdentifier;
        const secondaryRows = await search(secondary.query);
        const secondaryParsed = { ...parsed, strongestIdentifier: parsed.identifiers.find((code) =>
          canonicalIdentifier(code) !== canonicalIdentifier(parsed.strongestIdentifier)) };
        const secondaryScored = scoreResults(secondaryParsed, secondaryRows, 'secondary');
        report.secondaryRetrievalQuality = secondaryScored.retrievalQuality;
        scored = combineScored(parsed, primary, secondaryScored);
      }
    }
    report.scoredResults = scored.results;
    report.exactIdentifierMatchCount = scored.exactIdentifierMatchCount;
    report.independentMatchingDomains = scored.independentMatchingDomains;
    report.manufacturerMatch = scored.manufacturerMatch;
    report.retrievalQuality = scored.retrievalQuality;
    report.combinedRetrievalQuality = scored.retrievalQuality;
    report.supportedIdentifiers = scored.supportedIdentifiers || parsed.identifiers.filter((code) => scored.results.some((row) => row.diagnostics.matchedIdentifiers.includes(code)));
    report.unsupportedIdentifiers = parsed.identifiers.filter((code) => !report.supportedIdentifiers.includes(code));
    report.evidencePackage = buildEvidencePackage(parsed, scored);
    Object.assign(report.evidencePackage, { primarySearchQuery: report.primarySearchQuery,
      secondarySearchQuery: report.secondarySearchQuery, secondarySearchReason: report.secondarySearchReason,
      relaxedIdentifier: report.relaxedIdentifier, primaryRetrievalQuality: report.primaryRetrievalQuality,
      secondaryRetrievalQuality: report.secondaryRetrievalQuality, combinedRetrievalQuality: report.combinedRetrievalQuality });
    if (scored.retrievalQuality === 'EMPTY') { report.failureReason = 'NO_SEARCH_RESULTS'; return report; }
    if (report.secondarySearchQuery && !report.supportedIdentifiers.length) {
      report.failureReason = scored.results.length ? 'INSUFFICIENT_EVIDENCE' : 'NO_SEARCH_RESULTS';
      return report;
    }
    const synthesis = synthesisImpl ? await synthesisImpl(report.evidencePackage) : await synthesizeFromEvidence(
      report.evidencePackage, { apiKey: geminiApiKey, fetchImpl: geminiFetchImpl || fetch, env, timeoutMs: synthesisTimeoutMs || 6500 });
    report.geminiRequestCount = synthesis.requestCount ?? 0;
    report.providerUsage.gemini = synthesis.usage || null;
    report.geminiModel = synthesis.model || synthesis.diagnostics?.model || null;
    report.geminiSynthesis = synthesis.ok ? synthesis.result : null;
    report.geminiDiagnostics = synthesis.diagnostics || null;
    if (!synthesis.ok) { report.failureReason = synthesis.error || 'GEMINI_FAILED'; return report; }
    report.validation = validateSynthesis(parsed, scored, synthesis.result);
    report.finalRetrievalFirstResult = report.validation.accepted ? report.validation.result : null;
    report.failureReason = report.validation.reason;
    return report;
  } catch (error) {
    const code = String(error?.code || error?.message || 'SEARCH_FAILED');
    report.failureReason = /^(?:SERPER_[A-Z0-9_]{1,56}|GEMINI_[A-Z0-9_]{1,56}|SEARCH_FAILED|QUERY_INVALID)$/.test(code)
      ? code : 'SEARCH_FAILED';
    return report;
  } finally { report.latencyMs = Date.now() - startedAt; }
}
