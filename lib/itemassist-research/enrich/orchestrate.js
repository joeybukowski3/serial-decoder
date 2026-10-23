import { findResearchClaim } from '../contract.js';
import { identifyOriginal } from './identify.js';
import { extractHistory } from './history.js';
import { screenListings } from './listings.js';
import { focusTokens, sizeSpec } from './product-tokens.js';
import { SERPER_CREDITS, serperRequest } from './serper.js';

/**
 * Live research.2: ONE Gemini identification, ONE dated web search and up to TWO Shopping queries, assembled into the engine input that
 * the existing research.2 builder validates (`buildResearchResponseV2`). Nothing is confirmed here: every price is a labelled search
 * snippet or Shopping listing, and anything the sources cannot support falls back to the contract's own ladder (a dated tier band, then
 * a labelled AI estimate, then "not enough evidence").
 *
 *   t=0   Gemini identify  ||  Serper search (dated launch / list price of the original)
 *   then  Serper Shopping for the first two replacement families, only with time left before the engine deadline
 *
 * Serper is optional at every step: no key, no credits left, a timeout or an HTTP error each leave that part empty and the answer is
 * still built. Credits are reserved just before a request, rows come from the cache first, and nothing is retried.
 */

// Server-side switches, both default off. The first makes the live route answer in research.2 (Gemini identification only); the second adds
// the Serper history and Shopping lookups. Nothing in a request can set either.
export const LIVE_CONTRACT_ENV = 'ITEMASSIST_RESEARCH_LIVE_CONTRACT';
export const ENRICHMENT_ENV = 'ITEMASSIST_RESEARCH_ENRICHMENT';
export const ENGINE_DEADLINE_MS = 7200;
export const SEARCH_TIMEOUT_MS = 2500;
export const SHOPPING_TIMEOUT_MS = 2500;
export const MIN_SHOPPING_MS = 1200;
const DEADLINE_MARGIN_MS = 300;
const MAX_SHOPPING_QUERIES = 2;
const NOUN = Object.freeze({ tv: 'TV', refrigerator: 'refrigerator', washer: 'washer', dryer: 'dryer', dishwasher: 'dishwasher', range: 'range', microwave: 'microwave' });

const money = (low, high = low) => ({ currency: 'USD', low, high });
const today = (now) => new Date(now).toISOString().slice(0, 10);

/** Candidates in the order and with the keys the builder will give them (it drops a candidate whose name or reason fails the claim filter). */
export function keyedCandidates(input) {
  const survives = (entry) => entry && !findResearchClaim(entry.name) && !findResearchClaim(entry.why);
  const ordered = [input.successor ? ['SUCCESSOR', input.successor] : null, ...input.suggestions.filter(survives).slice(0, 2).map((entry, index) => [`ALT_${index + 1}`, entry])].filter(Boolean);
  return ordered.filter(([, entry]) => survives(entry));
}

/** The Shopping query for a candidate family: its name (no trailing detail), the size the user asked about, and the product noun. */
export function shoppingQuery(candidate, { category, profile, spec }) {
  const name = String(candidate.name).replace(/,.*$/, ' ').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const noun = NOUN[category === 'tv' ? 'tv' : profile];
  const size = spec ? (spec.kind === 'capacity' ? `${spec.value} cu ft` : `${spec.value} inch`) : '';
  return [name, size, noun && !new RegExp(`\\b${noun}\\b`, 'i').test(name) ? noun : ''].filter(Boolean).join(' ').slice(0, 100);
}

export function guidanceInput(referenceDate) {
  return {
    category: 'unknown', profile: 'unknown', original: { identity: null, confidence: 'low', characteristics: [], uncertainty: null }, requirements: [],
    successor: null, suggestions: [], clarify: [], warnings: ['PROVIDER_UNAVAILABLE'],
    pricing: { referenceDate, tier: { level: 'UNKNOWN', basis: 'UNKNOWN' }, evidence: [], prices: [] },
  };
}

/**
 * @param {string} query  the cleaned user query
 * @param {object} deps  `serperBudget` and `enrichCache` are required for enrichment; everything else has a default and exists for tests.
 * @returns {Promise<{input: object, meta: {requestSent: boolean, errorCode: string|null, usage: object, serperCredits: number, serperCalls: number, enrichment: object}}>}
 */
export async function researchLiveV2(query, deps) {
  const { env = process.env, now = Date.now, fetchImpl, identify = identifyOriginal, serper = serperRequest, serperBudget, enrichCache, enrich = true } = deps;
  const startedAt = now();
  const deadlineAt = startedAt + ENGINE_DEADLINE_MS;
  const referenceDate = today(startedAt);
  const serperKey = typeof env.SERPER_API_KEY === 'string' && env.SERPER_API_KEY.trim() ? env.SERPER_API_KEY.trim() : null;
  const stats = { credits: 0, calls: 0, history: enrich ? 'pending' : 'off', listings: {} };

  /** Cache, then budget, then one request. Never throws; `rows` is null when nothing could be read. */
  async function lookup(kind, endpoint, text, timeoutMs) {
    const cached = enrichCache ? await enrichCache.read(kind, text) : null;
    if (cached) return { rows: cached, source: 'cache' };
    if (!serperKey) return { rows: null, source: 'no_key' };
    if (!serperBudget) return { rows: null, source: 'budget_unavailable' };
    if (timeoutMs < MIN_SHOPPING_MS && endpoint === 'shopping') return { rows: null, source: 'deadline' };
    const reservation = await serperBudget.reserve(SERPER_CREDITS[endpoint]);
    if (!reservation.allowed) return { rows: null, source: reservation.status === 'denied' ? 'budget_denied' : 'budget_unavailable' };
    stats.credits += reservation.credits;
    stats.calls += 1;
    try {
      const rows = await serper({ kind: endpoint, query: text }, { apiKey: serperKey, fetchImpl, timeoutMs });
      if (enrichCache) await enrichCache.write(kind, text, rows);
      return { rows, source: 'serper' };
    } catch (error) { return { rows: null, source: typeof error?.code === 'string' ? error.code : 'SERPER_REQUEST_FAILED' }; }
  }

  const historyQuery = `${query} launch price MSRP`;
  const historyTask = (enrich ? lookup('history', 'search', historyQuery, SEARCH_TIMEOUT_MS) : Promise.resolve({ rows: null, source: 'off' }))
    .catch(() => ({ rows: null, source: 'error' }));

  const ident = await identify(query, { apiKey: env.GEMINI_API_KEY, fetchImpl: deps.geminiFetchImpl || fetchImpl });
  const history = await historyTask;
  stats.history = history.source;
  const base = { requestSent: ident.meta.requestSent, usage: ident.meta.usage };
  // An answer built while a lookup failed or was skipped is returned but not cached: the next ask should be able to do better.
  const complete = () => [stats.history, ...Object.values(stats.listings)].every((source) => ['serper', 'cache', 'off'].includes(source));
  const finish = (input, errorCode) => ({ input, meta: { ...base, errorCode, serperCredits: stats.credits, serperCalls: stats.calls, enrichment: stats, cacheable: complete() } });
  if (!ident.ok) return finish(guidanceInput(referenceDate), ident.meta.errorCode);
  if (!ident.input.original.identity) return finish({ ...ident.input, warnings: [], pricing: { referenceDate, tier: { level: 'UNKNOWN', basis: 'UNKNOWN' }, evidence: [], prices: [] } }, null);

  const { category, profile } = ident;
  const spec = sizeSpec(category, query);
  const keyed = keyedCandidates(ident.input).slice(0, MAX_SHOPPING_QUERIES);
  const shopped = enrich ? await Promise.all(keyed.map(async ([key, candidate]) => {
    const remaining = deadlineAt - now() - DEADLINE_MARGIN_MS;
    const result = await lookup('listings', 'shopping', shoppingQuery(candidate, { category, profile, spec }), Math.min(SHOPPING_TIMEOUT_MS, remaining));
    stats.listings[key] = result.source;
    return [key, candidate, result.rows ? screenListings(result.rows, candidate, { category, spec, focuses: focusTokens(query) }) : { items: [], skipped: {} }];
  })) : [];

  const past = history.rows ? extractHistory(history.rows, { query, category, now: startedAt }).items : [];
  return finish({ ...ident.input, warnings: [], pricing: assemblePricing({ past, shopped, estimates: ident.estimates, tierLevel: ident.tier, referenceDate }) }, null);
}

/**
 * The engine's pricing block from the screened history and listings. Pure. Evidence is one entry per source and subject; a listing cites
 * the seller's site (a Shopping row has no page of its own), a history price cites the dated page it came from. Labelled AI estimates are
 * added only for a side that has no source-backed price.
 */
export function assemblePricing({ past, shopped, estimates, tierLevel, referenceDate }) {
  const evidence = [], prices = [];
  const addEvidence = (entry) => {
    const found = evidence.find((item) => item.subject === entry.subject && item.sourceUrl === entry.sourceUrl);
    if (found) return found.id;
    evidence.push({ id: `e${evidence.length + 1}`, ...entry });
    return evidence.at(-1).id;
  };
  const addPrice = (entry) => { prices.push({ id: `p${prices.length + 1}`, model: null, asOf: null, asOfBasis: 'UNKNOWN', verification: 'NONE', evidenceId: null, ...entry }); };

  for (const item of past) {
    const evidenceId = addEvidence({ subject: 'ORIGINAL', sourceUrl: item.url, publishedAt: item.publishedAt, ...(item.subjectModel ? { subjectModel: item.subjectModel, expectedModel: item.expectedModel } : {}) });
    addPrice({ kind: item.kind, subject: 'ORIGINAL', candidate: null, model: item.model, amount: money(item.amount), asOf: item.publishedAt, asOfBasis: 'PUBLISHED', verification: 'SEARCH_SNIPPET', evidenceId });
  }
  let listed = 0;
  for (const [key, , screened] of shopped) {
    for (const item of screened.items) {
      const evidenceId = addEvidence({ subject: key, sourceUrl: `https://www.${item.host}/`, observedAt: referenceDate });
      addPrice({ kind: 'CURRENT_RETAIL_NEW', subject: 'REPLACEMENT', candidate: key, model: item.model, amount: money(item.amount), asOf: referenceDate, asOfBasis: 'OBSERVED', verification: 'SEARCH_LISTING', evidenceId });
      listed += 1;
    }
  }
  if (!past.length && estimates.original) addPrice({ kind: 'AI_ESTIMATE', subject: 'ORIGINAL', candidate: null, amount: money(estimates.original.low, estimates.original.high) });
  if (!listed && estimates.replacement) addPrice({ kind: 'AI_ESTIMATE', subject: 'REPLACEMENT', candidate: null, amount: money(estimates.replacement.low, estimates.replacement.high) });
  return { referenceDate, tier: { level: tierLevel, basis: past.length ? 'MSRP_EVIDENCE' : 'AI_ESTIMATE' }, evidence, prices };
}
