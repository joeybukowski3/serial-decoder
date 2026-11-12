import { findResearchClaim } from './contract.js';
import { MODEL_PATTERN, SOURCE_REGISTRY, looksLikeExactModel } from './evidence.js';
import { EXCLUSIONS, MAX_EXCERPT, MAX_OBSERVED_MODELS, MAX_RETAILERS, OBSERVATION_STATUS, RETRIEVAL_BASES, sameCode } from './enrich/observations.js';
import { CORE_ATTRIBUTES, SPEC_ATTRIBUTES, SPEC_BASES, SPEC_RESULTS, VALUE_SHAPES } from './enrich/spec-compare.js';

/**
 * The two optional, additive candidate blocks of research.2 Release 2, as the contract carries them. Each normalizer returns the block exactly as the engine builds
 * it, or null when anything about it is off; the validator requires the stored block to equal its own normalization, so an edited or forged block fails.
 *
 *  - `modelObservations`: model codes that recognised sellers' listing titles state, kept apart from price evidence and from verified identity.
 *  - `specComparison`: television attributes compared between the original and the candidate, each with the basis that states it. A listing title is the seller's
 *    wording; nothing here is a manufacturer specification, and nothing is inferred from a generation.
 */

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => isObject(value) && Object.keys(value).sort().join() === [...keys].sort().join();
// A recognised seller is a retailer or a manufacturer's own storefront (the recognised-seller list includes both).
const SELLER_NAMES = new Set(SOURCE_REGISTRY.filter((entry) => ['RETAILER', 'MANUFACTURER'].includes(entry[1])).map((entry) => entry[2]));
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function normalizeObservedItem(raw) {
  const keys = ['model', 'status', 'listings', 'retailers', 'excerpt', 'exclusion', 'retrievedAt', 'retrievedBasis'];
  if (!exactKeys(raw, keys)) return null;
  const model = typeof raw.model === 'string' ? raw.model : '';
  if (!MODEL_PATTERN.test(model) || !looksLikeExactModel(model) || !Object.values(OBSERVATION_STATUS).includes(raw.status)) return null;
  if (!Number.isInteger(raw.listings) || raw.listings < 1 || raw.listings > 99) return null;
  if (!Array.isArray(raw.retailers) || raw.retailers.length > MAX_RETAILERS || !raw.retailers.every((name) => SELLER_NAMES.has(name)) || new Set(raw.retailers).size !== raw.retailers.length
    || raw.retailers.join('|') !== [...raw.retailers].sort().join('|')) return null;
  if (raw.excerpt !== null && (typeof raw.excerpt !== 'string' || !raw.excerpt || raw.excerpt.length > MAX_EXCERPT || /[\u0000-\u001f\u007f]/.test(raw.excerpt) || raw.excerpt !== raw.excerpt.trim() || findResearchClaim(raw.excerpt))) return null;
  // A model the listings price has no exclusion; one that was left out of the price says why.
  if ((raw.status === OBSERVATION_STATUS.PRICED_LISTING) !== (raw.exclusion === null) || (raw.exclusion !== null && !EXCLUSIONS.includes(raw.exclusion))) return null;
  // The retrieval time is a date or unknown. It is never a source's own publication time.
  if (!RETRIEVAL_BASES.includes(raw.retrievedBasis) || (raw.retrievedBasis === 'RETRIEVED') !== (typeof raw.retrievedAt === 'string' && DAY.test(raw.retrievedAt) && Number.isFinite(Date.parse(raw.retrievedAt)))) return null;
  if (raw.retrievedBasis === 'UNKNOWN' && raw.retrievedAt !== null) return null;
  return { model, status: raw.status, listings: raw.listings, retailers: [...raw.retailers], excerpt: raw.excerpt, exclusion: raw.exclusion, retrievedAt: raw.retrievedAt, retrievedBasis: raw.retrievedBasis };
}

/**
 * True when a block of observations fits the candidate it belongs to: a model the listings priced needs a listing-backed status (a price from that model exists), and when
 * the listings state conflicting codes the candidate's name carries no model code, so no code is presented as the candidate's model.
 */
export function observationsFit(block, name, modelStatus) {
  if (!block) return false;
  const priced = block.items.filter((item) => item.status === OBSERVATION_STATUS.PRICED_LISTING);
  if (priced.length && !['LISTED_PROVISIONAL', 'VERIFIED_LISTING'].includes(modelStatus)) return false;
  // A model the listings priced is the model the candidate is named by.
  const named = String(name || '').toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  if (!priced.every((item) => named.some((token) => sameCode(token, item.model)))) return false;
  return !(block.conflict && looksLikeExactModel(String(name || '')));
}

/**
 * Checks that need the whole response: a comparison may cite the original's manufacturer page only when the response carries one, and a retrieval date is a real recent
 * date no later than the response's own reference date.
 */
export function blocksFitResponse(response) {
  const pages = Array.isArray(response?.original?.manufacturerPages) && response.original.manufacturerPages.length > 0;
  const reference = response?.pricing?.referenceDate;
  const floor = typeof reference === 'string' ? Date.parse(reference) - 31 * 86_400_000 : NaN;
  for (const candidate of [response?.successor, ...(Array.isArray(response?.suggestions) ? response.suggestions : [])]) {
    if (!candidate) continue;
    if (candidate.specComparison && candidate.specComparison.rows.some((row) => row.original && row.original.basis === 'MANUFACTURER_PAGE_TITLE') && !pages) return false;
    for (const item of candidate.modelObservations?.items || []) {
      if (item.retrievedAt !== null && !(item.retrievedAt <= reference && Date.parse(item.retrievedAt) >= floor)) return false;
    }
  }
  return true;
}

/**
 * @returns {{conflict: boolean, items: object[]}|null}
 * `conflict` is true exactly when the items include codes that are not variants of each other; the items are then all that was seen, and none is chosen.
 */
export function normalizeModelObservations(raw) {
  if (!exactKeys(raw, ['conflict', 'items']) || typeof raw.conflict !== 'boolean' || !Array.isArray(raw.items) || !raw.items.length || raw.items.length > MAX_OBSERVED_MODELS) return null;
  const items = raw.items.map(normalizeObservedItem);
  if (items.some((item) => item === null)) return null;
  // One entry per distinct model; a short spelling is the same model as its fuller one.
  for (let index = 0; index < items.length; index += 1) if (items.slice(0, index).some((other) => sameCode(other.model, items[index].model))) return null;
  if (raw.conflict !== (items.length >= 2)) return null;
  return { conflict: raw.conflict, items };
}

function normalizeSide(raw, attribute) {
  if (raw === null) return null;
  if (!exactKeys(raw, ['value', 'basis', 'sources']) || typeof raw.value !== 'string' || !VALUE_SHAPES[attribute].test(raw.value) || !SPEC_BASES.includes(raw.basis)) return null;
  if (!Number.isInteger(raw.sources) || raw.sources < 1 || raw.sources > 99) return undefined;
  return { value: raw.value, basis: raw.basis, sources: raw.sources };
}

/** A comparison, or null. `candidateBases` of a candidate side are listing titles only: nothing else can state a candidate's attribute. */
export function normalizeSpecComparison(raw) {
  if (!exactKeys(raw, ['rows', 'compared', 'notEstablished']) || !Array.isArray(raw.rows) || !Array.isArray(raw.compared) || !Array.isArray(raw.notEstablished) || raw.rows.length < CORE_ATTRIBUTES.length || raw.rows.length > SPEC_ATTRIBUTES.length) return null;
  const rows = [];
  let last = -1;
  for (const row of raw.rows) {
    if (!exactKeys(row, ['attribute', 'original', 'candidate', 'result']) || !SPEC_ATTRIBUTES.includes(row.attribute) || !SPEC_RESULTS.includes(row.result)) return null;
    const order = SPEC_ATTRIBUTES.indexOf(row.attribute);
    if (order <= last) return null;
    last = order;
    const original = normalizeSide(row.original, row.attribute);
    const candidate = normalizeSide(row.candidate, row.attribute);
    if (original === undefined || candidate === undefined || (row.original !== null && original === null) || (row.candidate !== null && candidate === null)) return null;
    if (candidate && candidate.basis !== 'LISTING_TITLE') return null;
    const result = !original || !candidate ? 'NOT_ESTABLISHED' : original.value === candidate.value ? 'MATCH' : 'DIFFERENT';
    if (row.result !== result) return null;
    // An attribute outside the core set appears only when a source states it for at least one side.
    if (!CORE_ATTRIBUTES.includes(row.attribute) && !original && !candidate) return null;
    rows.push({ attribute: row.attribute, original, candidate, result });
  }
  if (!CORE_ATTRIBUTES.every((attribute) => rows.some((row) => row.attribute === attribute))) return null;
  const compared = rows.filter((row) => row.result !== 'NOT_ESTABLISHED').map((row) => row.attribute);
  const notEstablished = rows.filter((row) => row.result === 'NOT_ESTABLISHED').map((row) => row.attribute);
  if (raw.compared.join() !== compared.join() || raw.notEstablished.join() !== notEstablished.join()) return null;
  return { rows, compared, notEstablished };
}
