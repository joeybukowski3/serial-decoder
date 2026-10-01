import { CONTRACT_VERSION } from '../replacement-core/enums.js';
import { assertValid, validateEvidence } from '../replacement-core/contracts.js';
import { stableId } from './normalize-adapter.js';
import { modelKey, normalizeDomain } from './research-schema.js';

/**
 * Converts model-claimed source domains into EvidenceRecords and derives a fact
 * status from evidence quality alone.
 *
 * Citations are server-derived: a claimed domain only becomes a URL when it
 * appears in the provider's grounding metadata. Provider prose is never
 * first-party evidence.
 */

const BRAND_DOMAINS = Object.freeze({
  samsung: ['samsung.com'], lg: ['lg.com'], sony: ['sony.com'], tcl: ['tcl.com'], hisense: ['hisense-usa.com', 'hisense.com'],
  vizio: ['vizio.com'], insignia: ['insigniaproducts.com'],
  ge: ['geappliances.com', 'ge.com'], whirlpool: ['whirlpool.com'], frigidaire: ['frigidaire.com'], kitchenaid: ['kitchenaid.com'],
  bosch: ['bosch-home.com'], 'sub-zero': ['subzero-wolf.com'], maytag: ['maytag.com'],
});
const RETAILER_DOMAINS = Object.freeze(['bestbuy.com', 'homedepot.com', 'lowes.com', 'costco.com', 'samsclub.com', 'abt.com', 'crutchfield.com', 'appliancesconnection.com', 'ajmadison.com', 'target.com', 'walmart.com']);
const TECH_DATABASE_DOMAINS = Object.freeze(['rtings.com', 'displayspecifications.com', 'tftcentral.co.uk', 'notebookcheck.net']);
const MARKETPLACE_DOMAINS = Object.freeze(['amazon.com', 'ebay.com', 'aliexpress.com', 'mercari.com', 'offerup.com', 'facebook.com', 'reddit.com']);

/** Evidence rank: 1 manufacturer, 2 authorized-retailer exact model, 3 technical database, 4 grounded result, 5 unsourced/non-authoritative. */
export const RANK = Object.freeze({ MANUFACTURER: 1, RETAILER: 2, TECH_DATABASE: 3, GROUNDED: 4, UNSOURCED: 5 });
const MIN_VARIANT_LENGTH = 6;
const MAX_VARIANT_TAIL = 6;

const sameSite = (a, b) => a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
const inList = (domain, list) => list.some((entry) => sameSite(domain, entry));
const brandKey = (brand) => String(brand || '').trim().toLowerCase().replace(/\s+/g, '-');

export function classifySource(domain, brand) {
  if (inList(domain, BRAND_DOMAINS[brandKey(brand)] || [])) return { sourceClass: 'MANUFACTURER', sourceType: 'MANUFACTURER_PAGE', baseRank: RANK.MANUFACTURER };
  if (inList(domain, MARKETPLACE_DOMAINS)) return { sourceClass: 'OTHER', sourceType: 'MARKETPLACE_LISTING', baseRank: RANK.UNSOURCED };
  if (inList(domain, RETAILER_DOMAINS)) return { sourceClass: 'RETAILER', sourceType: 'RETAILER_LISTING', baseRank: RANK.RETAILER };
  if (inList(domain, TECH_DATABASE_DOMAINS)) return { sourceClass: 'OTHER', sourceType: 'TECHNICAL_DATABASE', baseRank: RANK.TECH_DATABASE };
  return { sourceClass: 'OTHER', sourceType: 'GROUNDED_SEARCH_RESULT', baseRank: RANK.GROUNDED };
}

/** EXACT is identical after normalization; VARIANT tolerates a short regional/suffix tail (QN55Q80D vs QN55Q80DAFXZA). */
export function modelRelation(subject, expected) {
  const a = modelKey(subject), b = modelKey(expected);
  if (!a || !b) return 'UNKNOWN';
  if (a === b) return 'EXACT';
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.length >= MIN_VARIANT_LENGTH && longer.startsWith(shorter) && longer.length - shorter.length <= MAX_VARIANT_TAIL ? 'VARIANT' : 'DIFFERENT';
}

const GROUNDING_REDIRECT_HOST = 'vertexaisearch.cloud.google.com';

/**
 * Grounding URIs are Google redirect URLs whose title carries the real domain. A title is only trusted as a
 * domain behind that redirect host; any other URI is judged by its own host, so page-controlled titles cannot
 * impersonate a manufacturer.
 */
function groundedHost(source) {
  let host;
  try { host = new URL(source?.uri).hostname; } catch (_) { return null; }
  return host === GROUNDING_REDIRECT_HOST ? normalizeDomain(source.domain) : normalizeDomain(host);
}

function findGrounded(grounding, domain) {
  const sources = Array.isArray(grounding?.sources) ? grounding.sources : [];
  return sources.find((source) => {
    const host = groundedHost(source);
    return host && sameSite(host, domain);
  }) || null;
}

function record({ fieldKey, value, subjectModel, relation, supports, now, domain, grounded, classification, rank, unresolved }) {
  const evidence = {
    contractVersion: CONTRACT_VERSION,
    evidenceId: stableId('evidence', [domain || 'provider', fieldKey, JSON.stringify(value), subjectModel || ''].join('|')),
    sourceType: classification?.sourceType || 'PROVIDER_CLAIM',
    sourceName: grounded ? (grounded.title || domain) : 'Provider statement (no grounded source)',
    url: grounded?.uri || null,
    sourceClass: classification?.sourceClass || 'PROVIDER',
    observedAt: now,
    claim: { fieldKey, value, subjectModel: subjectModel || null, modelRelation: relation, ...(unresolved.length ? { unresolvedSources: unresolved } : {}) },
    confidence: rank <= RANK.MANUFACTURER ? 'HIGH' : rank <= RANK.TECH_DATABASE ? 'MEDIUM' : 'LOW',
    firstParty: classification?.sourceClass === 'MANUFACTURER' && rank === RANK.MANUFACTURER,
    supports,
    domain: domain || null,
    sourceRank: rank,
  };
  assertValid(validateEvidence(evidence), 'evidence');
  return evidence;
}

function statusFor(rankedRecords, exact) {
  const resolved = rankedRecords.filter((item) => item.sourceRank <= RANK.GROUNDED);
  const bestRank = rankedRecords.length ? Math.min(...rankedRecords.map((item) => item.sourceRank)) : RANK.UNSOURCED;
  if (bestRank === RANK.MANUFACTURER) return { status: 'KNOWN', basis: 'MANUFACTURER_SOURCE', bestRank };
  if (bestRank === RANK.RETAILER) return { status: 'KNOWN', basis: 'RETAILER_EXACT_MODEL_SOURCE', bestRank };
  // Corroboration needs a page about the right model and two DISTINCT grounded sources (by citation, not by claimed string).
  if (exact && new Set(resolved.map((item) => item.url)).size >= 2) return { status: 'KNOWN', basis: 'CORROBORATED_SOURCES', bestRank };
  if (resolved.length) return { status: 'INFERRED', basis: bestRank === RANK.TECH_DATABASE ? 'TECHNICAL_DATABASE_SOURCE' : 'GROUNDED_SEARCH_SOURCE', bestRank };
  return { status: 'ASSUMED', basis: 'PROVIDER_UNSOURCED', bestRank };
}

/**
 * Evidence for one claim. `expectedModel` is the model the claim is about;
 * `allowVariant` lets candidates accept suffix variants while originals (often
 * incomplete user tokens) stay strict.
 */
export function buildClaimEvidence({ fieldKey, value, supports = ['SPECIFICATION'], sources = [], subjectModel = null, expectedModel = null, brand, grounding = null, now, allowVariant = false }) {
  const relation = modelRelation(subjectModel, expectedModel);
  const exact = relation === 'EXACT' || (allowVariant && relation === 'VARIANT');
  const records = [], unresolved = [];
  for (const domain of sources) {
    const grounded = findGrounded(grounding, domain);
    if (!grounded) { unresolved.push(domain); continue; }
    const classification = classifySource(domain, brand);
    const rank = exact ? classification.baseRank : Math.max(classification.baseRank, RANK.GROUNDED);
    records.push(record({ fieldKey, value, subjectModel, relation, supports, now, domain, grounded, classification, rank, unresolved: [] }));
  }
  if (!records.length) records.push(record({ fieldKey, value, subjectModel, relation, supports, now, domain: null, grounded: null, classification: null, rank: RANK.UNSOURCED, unresolved }));
  const assessment = statusFor(records, exact);
  return { records, ...assessment, evidenceIds: records.map((item) => item.evidenceId) };
}

export function mergeEvidence(...lists) {
  const byId = new Map();
  for (const item of lists.flat()) if (!byId.has(item.evidenceId)) byId.set(item.evidenceId, item);
  return [...byId.values()];
}
