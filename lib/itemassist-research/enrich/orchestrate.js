import { findResearchClaim } from '../contract.js';
import { identifyOriginal } from './identify.js';
import { extractHistory } from './history.js';
import { screenListings } from './listings.js';
import { modelEvidence, originalLayout, originalSpec, sourcedSize, vetIdentification } from './claims.js';
import { doorCountOf, focusTokens, sizeSpec } from './product-tokens.js';
import { unsupportedCodes, withoutCodes } from './model-codes.js';
import { assessCapacity } from './capacity.js';
import { MAX_PRICES } from '../pricing.js';
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
const MAX_ORIGINAL_CURRENT = 2;
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
  const stats = { credits: 0, calls: 0, history: enrich ? 'pending' : 'off', listings: {}, sizeNotStated: {}, seriesDropped: {}, claims: null, category: null };

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
  stats.category = ident.categorySource || null;
  const focuses = focusTokens(query);
  // What the model says about the original is checked against what the registered sources say about the exact model before it can steer
  // anything: an unsupported specific becomes guidance, never a requirement, and never decides which listings are eligible.
  const vetted = vetIdentification(ident.input, modelEvidence(history.rows, focuses));
  stats.claims = { checked: vetted.available, unconfirmed: vetted.unconfirmed.length };
  const identified = vetted.input;
  // The size the original is known to have: the user's words first, then its checked capacity or width, then (for a refrigerator) the capacity and
  // width the sources themselves state for the exact model, which is how a wrong or unconfirmed claim from the model still leaves a known size to
  // hold listings to. A capacity is "equal or greater".
  const sourced = category === 'refrigerator' ? sourcedSize(history.rows, focuses) : { capacity: null, width: null };
  const spec = sizeSpec(category, query) || originalSpec(category, identified.original, vetted.available) || (sourced.capacity ? { kind: 'capacity', value: sourced.capacity, atLeast: true } : null);
  const width = sourced.width;
  stats.sourcedSize = category === 'refrigerator' ? sourced : null;
  const layout = category === 'refrigerator' ? originalLayout(identified.original, vetted.available, vetted.doors, vetted.doorsSettled) : null;
  const keyed = keyedCandidates(identified).slice(0, MAX_SHOPPING_QUERIES);
  const shopped = enrich ? await Promise.all(keyed.map(async ([key, candidate]) => {
    const remaining = deadlineAt - now() - DEADLINE_MARGIN_MS;
    const result = await lookup('listings', 'shopping', shoppingQuery(candidate, { category, profile, spec }), Math.min(SHOPPING_TIMEOUT_MS, remaining));
    stats.listings[key] = result.source;
    const screened = result.rows ? screenListings(result.rows, candidate, { category, spec, focuses, layout, width }) : { items: [], skipped: {}, context: [], originals: [], seriesDropped: [], doorNote: null };
    // Listings that passed screening but did not state the size are context for the researcher only; they are counted, never priced.
    stats.sizeNotStated[key] = screened.context.length;
    if (screened.seriesDropped.length) stats.seriesDropped[key] = screened.seriesDropped;
    // A model code in the candidate's name that nothing retrieved (these listings, or the original's search results) shows is not a product the
    // answer can name. Judged only when listings were actually retrieved for the candidate.
    const retrieved = Array.isArray(result.rows) ? result.rows : [];
    const unsupported = retrieved.length ? unsupportedCodes(candidate.name, [...retrieved.map((row) => row.title), ...(history.rows || []).flatMap((row) => [row.title, row.snippet])]) : [];
    if (unsupported.length) stats.unsupportedCodes = { ...(stats.unsupportedCodes || {}), [key]: unsupported };
    // The candidate's capacity is settled from what its own listings state, not from the model's comparison (see `assessCapacity`).
    const capacity = assessCapacity(candidate, spec, retrieved);
    if (capacity) stats.capacity = { ...(stats.capacity || {}), [key]: capacity.concern ? 'SHORTFALL' : capacity.comparison.find((row) => row.requirementKey === 'capacity')?.status };
    return [key, candidate, { ...screened, unsupportedCodes: unsupported, capacity, demotedName: unsupported.length ? withoutCodes(candidate.name, unsupported, NOUN[profile] || '') : null }];
  })) : [];

  const past = history.rows ? extractHistory(history.rows, { query, category, now: startedAt, spec }).items : [];
  return finish({ ...withoutUnusedLines(identified, shopped, layout), warnings: [], pricing: assemblePricing({ past, shopped, estimates: ident.estimates, tierLevel: ident.tier, referenceDate }) }, null);
}

const LINE_NOT_FOUND = 'The series number in this name was not found in current listings, so it is matched by brand only.';
const MODEL_NOT_FOUND = 'The suggested model number was not found in current listings, so this is shown as a product family only.';

const MAX_CONCERN = 160;

/**
 * What a candidate's door count means for it, as its concern. A candidate named with another door count than the original's is not known to be
 * like-kind; a price that rests on a door count the sources and the model disagree about is conditional on it. Null when neither applies.
 */
export function doorConcern(note) {
  if (!note) return null;
  const { doors, settled, named, priced } = note;
  if (settled) return named ? `Named ${named}-door, but the original is ${doors}-door; only listings stating ${doors} doors were priced.` : null;
  const basis = priced ? ` Price is conditional on ${doors} doors.` : '';
  return named
    ? `Named ${named}-door; the original's door count is not settled (sources say ${doors}), so a match is not established.${basis}`
    : `The original's door count is not settled (sources say ${doors}), so this price is conditional on ${doors} doors.`;
}

/**
 * Notes a candidate carries from its own screening, as its concern:
 *  - A candidate named with a product line number that no listing of its brand uses ("KitchenAid 300 Series") has a name the model made up. The
 *    number is removed from the name and the doubt is stated; the candidate is then shown by brand.
 *  - A door count the candidate's name or prices depend on (see `doorConcern`).
 */
export function withoutUnusedLines(input, shopped, layout = null) {
  const changes = ([, , screened]) => screened.seriesDropped.length || doorConcern(screened.doorNote) || screened.demotedName || screened.capacity || (screened.unrecognised || []).length;
  const replaced = new Map(shopped.filter(changes).map(([, candidate, screened]) => {
    const dropped = screened.seriesDropped.length;
    const pattern = dropped ? new RegExp(`\\b(?:${screened.seriesDropped.join('|')})[- ]?series\\b`, 'i') : null;
    // An exact model code nothing retrieved supports is removed, not replaced: the candidate is kept by family.
    const base = screened.demotedName || candidate.name;
    const name = pattern ? base.replace(pattern, ' ').replace(/\s+/g, ' ').trim() : base;
    // A capacity shortfall and a model code nothing supports are the notes a reader must not miss: they come first, and win a tight limit.
    const shortfall = screened.capacity?.concern || null;
    const must = [shortfall, screened.demotedName ? MODEL_NOT_FOUND : null].filter(Boolean);
    const notes = [...must, dropped ? LINE_NOT_FOUND : null, doorConcern(screened.doorNote)].filter(Boolean);
    const fitting = (list) => { const joined = list.join(' '); return joined.length <= MAX_CONCERN ? joined : null; };
    const joined = fitting(notes) || fitting(must) || must[0] || notes.at(-1);
    const concern = must.length ? joined : candidate.concern || joined;
    const listings = (screened.unrecognised || []).length ? { otherSellerListings: screened.unrecognised } : {};
    const settled = screened.capacity ? { comparison: screened.capacity.comparison } : {};
    return [candidate, { ...candidate, name: name || candidate.name, concern: concern || null, ...settled, ...listings }];
  }));
  // A candidate that was not priced can still be named with another door count than the original's.
  const named = (entry) => {
    const doors = layout?.doors, count = doorCountOf(entry?.name);
    const concern = doors && count && count !== doors ? doorConcern({ doors, settled: layout.settled !== false, named: count, priced: false }) : null;
    return concern && !entry.concern ? { ...entry, concern } : entry;
  };
  const resolve = (entry) => replaced.get(entry) || named(entry);
  const successor = input.successor ? resolve(input.successor) : input.successor, suggestions = input.suggestions.map(resolve);
  return successor === input.successor && suggestions.every((entry, index) => entry === input.suggestions[index]) ? input : { ...input, successor, suggestions };
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

  // `past` holds list prices and dated past retail prices (history that explains the original's tier) and, apart from them, undated listings of
  // the exact original model. A listing never counts as history: one discount listing says nothing about what the product listed for.
  const sourced = past.filter((item) => item.kind !== 'ORIGINAL_LISTING');
  const addHistory = (item) => {
    const evidenceId = addEvidence({ subject: 'ORIGINAL', sourceUrl: item.url, ...(item.publishedAt ? { publishedAt: item.publishedAt } : {}), ...(item.subjectModel ? { subjectModel: item.subjectModel, expectedModel: item.expectedModel } : {}) });
    addPrice({ kind: item.kind, subject: 'ORIGINAL', candidate: null, model: item.model, amount: money(item.amount), asOf: item.publishedAt || null, asOfBasis: item.publishedAt ? 'PUBLISHED' : 'UNKNOWN', verification: 'SEARCH_SNIPPET', evidenceId });
  };
  sourced.forEach(addHistory);
  let listed = 0;
  for (const [key, , screened] of shopped) {
    for (const item of screened.items) {
      const evidenceId = addEvidence({ subject: key, sourceUrl: `https://www.${item.host}/`, observedAt: referenceDate });
      addPrice({ kind: 'CURRENT_RETAIL_NEW', subject: 'REPLACEMENT', candidate: key, model: item.model, amount: money(item.amount), asOf: referenceDate, asOfBasis: 'OBSERVED', verification: 'SEARCH_LISTING', evidenceId, ...(item.compatibilityOpen ? { compatibilityOpen: true } : {}) });
      listed += 1;
    }
  }
  // The original model's own listings come next: undated ones from the search results, and current ones from the Shopping rows that named
  // the original itself. They are context for the original's price, kept apart from replacement prices.
  const estimateRoom = (!sourced.length && estimates.original ? 1 : 0) + (!listed && estimates.replacement ? 1 : 0);
  past.filter((item) => item.kind === 'ORIGINAL_LISTING').forEach((item) => { if (prices.length + estimateRoom < MAX_PRICES) addHistory(item); });
  const current = shopped.flatMap(([, , screened]) => screened.originals || []);
  for (const item of current.length > MAX_ORIGINAL_CURRENT ? [current[0], current.at(-1)] : current) {
    if (prices.length + estimateRoom >= MAX_PRICES) break;
    const evidenceId = addEvidence({ subject: 'ORIGINAL', sourceUrl: `https://www.${item.host}/`, observedAt: referenceDate });
    addPrice({ kind: 'ORIGINAL_LISTING', subject: 'ORIGINAL', candidate: null, model: item.model, amount: money(item.amount), asOf: referenceDate, asOfBasis: 'OBSERVED', verification: 'SEARCH_LISTING', evidenceId });
  }
  // Television listings that state no size follow as examples marked `sizeConfirmed: false`; they take only the room the other prices leave.
  for (const [key, , screened] of shopped) {
    for (const item of screened.context || []) {
      if (prices.length + estimateRoom >= MAX_PRICES) break;
      const evidenceId = addEvidence({ subject: key, sourceUrl: `https://www.${item.host}/`, observedAt: referenceDate });
      addPrice({ kind: 'CURRENT_RETAIL_NEW', subject: 'REPLACEMENT', candidate: key, model: item.model, amount: money(item.amount), asOf: referenceDate, asOfBasis: 'OBSERVED', verification: 'SEARCH_LISTING', evidenceId, sizeConfirmed: false });
    }
  }
  if (!sourced.length && estimates.original) addPrice({ kind: 'AI_ESTIMATE', subject: 'ORIGINAL', candidate: null, amount: money(estimates.original.low, estimates.original.high) });
  if (!listed && estimates.replacement) addPrice({ kind: 'AI_ESTIMATE', subject: 'REPLACEMENT', candidate: null, amount: money(estimates.replacement.low, estimates.replacement.high) });
  return { referenceDate, tier: { level: tierLevel, basis: sourced.length ? 'MSRP_EVIDENCE' : 'AI_ESTIMATE' }, evidence, prices };
}
