import { FACT_STATUS, TIERS, fact } from './enums.js';

const TIER_BASELINES = Object.freeze({
  television: Object.freeze({ samsung: 'PREMIUM', lg: 'PREMIUM', sony: 'PREMIUM', tcl: 'STANDARD', hisense: 'STANDARD', vizio: 'STANDARD', insignia: 'VALUE' }),
  refrigerator: Object.freeze({ lg: 'PREMIUM', samsung: 'PREMIUM', bosch: 'PREMIUM', ge: 'STANDARD', whirlpool: 'STANDARD', frigidaire: 'STANDARD', kitchenaid: 'UPPER_PREMIUM', 'sub-zero': 'LUXURY' }),
});

// Versioned, category-specific model lines. Extend only with documented positioning.
export const TV_PRODUCT_LINE_TIER_VERSION = '1.0.0';
export const TV_PRODUCT_LINE_TIERS = Object.freeze({
  Q80: Object.freeze({ tier: 'PREMIUM', generations: 'CD', source: 'https://image-us.samsung.com/SamsungUS/samsungbusiness/tv-ci-resources/2023_Samsung_Custom_Install_Premium_Product_Guide.pdf' }),
  QN90: Object.freeze({ tier: 'UPPER_PREMIUM', generations: 'D', source: 'https://www.samsung.com/us/tvs/neoqled-tv/compare/' }),
});

/**
 * Documented product-line lineages (television). Samsung renamed the Q80 line to QN80 (Neo QLED) in later generations; the lines
 * of one lineage are one replacement family and share one tier position. This is explicit policy data: a line that is not
 * listed here is never treated as equivalent to another, whatever its model number looks like. Membership affects family
 * integrity and tier inheritance only; it verifies no specification (refresh rate, display technology, fit ...).
 */
export const TV_FAMILY_LINEAGE_VERSION = '1.0.0';
export const TV_FAMILY_LINEAGES = Object.freeze({
  'samsung-80': Object.freeze({ brand: 'samsung', lines: Object.freeze(['Q80', 'QN80']), source: 'https://www.samsung.com/us/tvs/neoqled-tv/compare/' }),
});

/** Product line of a Samsung QLED / Neo QLED model number (QN55Q80C -> Q80, QN55QN80H -> QN80, QN55Q7F -> Q7), or null. */
export function samsungTvProductLine(model) {
  const match = String(model || '').toUpperCase().replace(/[^A-Z0-9]/g, '').match(/^QN\d{2}(QN|Q)(\d{1,2})[A-Z](?:[A-Z0-9]*)$/);
  return match ? `${match[1]}${match[2]}` : null;
}

/** Product line named by a series label ("Q80 Series" -> Q80, "QN80 Series" -> QN80), or null. */
export function samsungTvSeriesLine(series) {
  const match = String(series || '').toUpperCase().trim().match(/^(QN|Q)\s?(\d{1,2})(?:\s+SERIES)?$/);
  return match ? `${match[1]}${match[2]}` : null;
}

const lineageOf = (line) => Object.values(TV_FAMILY_LINEAGES).find((lineage) => lineage.lines.includes(line)) || null;

/** Documented tier position of a product line: its own registry entry, else that of another line in its lineage. */
function lineTier(line) {
  const own = TV_PRODUCT_LINE_TIERS[line];
  if (own) return own.tier;
  const sibling = lineageOf(line)?.lines.find((name) => TV_PRODUCT_LINE_TIERS[name]);
  return sibling ? TV_PRODUCT_LINE_TIERS[sibling].tier : null;
}

/**
 * Relation of a candidate's product line to the original's, from registry data only (symmetric for equivalence):
 *   SAME_LINE            identical product line
 *   EQUIVALENT_LINEAGE   different lines documented as one lineage (Q80 <-> QN80)
 *   HIGHER_LINE          a documented higher tier position
 *   DIFFERENT_LINE       both lines parse but are not documented as equivalent (and not documented higher)
 *   UNKNOWN              a model number that does not parse
 */
export function tvFamilyRelation(originalModel, candidateModel) {
  return tvLineRelation(samsungTvProductLine(originalModel), samsungTvProductLine(candidateModel));
}

function tvLineRelation(original, candidate) {
  if (!original || !candidate) return { relation: 'UNKNOWN', lineage: null };
  if (original === candidate) return { relation: 'SAME_LINE', lineage: lineageOf(original) };
  const lineage = lineageOf(original);
  if (lineage && lineage === lineageOf(candidate)) return { relation: 'EQUIVALENT_LINEAGE', lineage };
  const ownIndex = TIERS.indexOf(normalizeTier(lineTier(original)));
  const otherIndex = TIERS.indexOf(normalizeTier(lineTier(candidate)));
  return { relation: ownIndex >= 0 && otherIndex > ownIndex ? 'HIGHER_LINE' : 'DIFFERENT_LINE', lineage: null };
}

function registeredTvTier(identity) {
  if (identity.category !== 'television') return null;
  const brand = getFact(identity, 'brand');
  const model = getFact(identity, 'model');
  const series = getFact(identity, 'series');
  if (brand.status !== 'KNOWN' || String(brand.value).toLowerCase() !== 'samsung' || model.status !== 'KNOWN'
    || series.status !== 'KNOWN' || !series.evidenceRefs?.some((ref) => ref !== 'user-input')) return null;
  const match = String(model.value).toUpperCase().match(/^QN\d{2}(QN90|Q80)([A-Z])(?:[A-Z0-9]*)$/);
  if (!match || String(series.value).toUpperCase() !== `${match[1]} SERIES`) return null;
  const line = TV_PRODUCT_LINE_TIERS[match[1]];
  return line?.generations.includes(match[2]) ? { line: match[1], ...line } : null;
}

export function resolved(entry) {
  return Boolean(entry && ['KNOWN', 'INFERRED'].includes(entry.status) && entry.value !== null);
}

export function present(entry) {
  return Boolean(entry && ['KNOWN', 'INFERRED', 'ASSUMED'].includes(entry.status) && entry.value !== null);
}

export function getFact(identity, key) {
  return identity.facts[key] || fact('UNKNOWN');
}

export function withTierBaseline(identity) {
  const existing = getFact(identity, 'tier');
  if ((present(existing) && existing.status !== 'ASSUMED') || existing.status === 'AMBIGUOUS') return identity;
  const registered = registeredTvTier(identity);
  if (registered) return { ...identity, facts: { ...identity.facts, tier: {
    ...fact('INFERRED', registered.tier, getFact(identity, 'series').evidenceRefs), basis: 'PRODUCT_LINE_REGISTRY',
    registryVersion: TV_PRODUCT_LINE_TIER_VERSION, productLine: registered.line, source: registered.source,
  } } };
  if (present(existing)) return identity;
  const brand = getFact(identity, 'brand');
  if (!present(brand)) return identity;
  const baseline = TIER_BASELINES[identity.category]?.[String(brand.value).trim().toLowerCase()];
  if (!baseline) return identity;
  return {
    ...identity,
    facts: { ...identity.facts, tier: { ...fact('ASSUMED', baseline), basis: 'BRAND_CATEGORY_BASELINE' } },
  };
}

/**
 * Same-product-line tier equivalence (television only). A candidate whose tier is only a generic brand baseline (ASSUMED) or
 * missing inherits the original's resolved tier when BOTH carry the same retrieved series (for example "Q80 Series" on two
 * generations). That is deterministic positioning evidence: one product line has one tier. A different series never inherits
 * anything, so an assumed brand baseline can never stand in for a verified family comparison.
 */
export function inheritSameSeriesTier(original, identity) {
  if (identity.category !== 'television') return identity;
  const candidateTier = getFact(identity, 'tier');
  if (resolved(candidateTier) || candidateTier.status === 'AMBIGUOUS') return identity;
  const originalTier = getFact(original, 'tier');
  const originalSeries = getFact(original, 'series');
  const candidateSeries = getFact(identity, 'series');
  const retrieved = (entry) => entry.status === 'KNOWN' && entry.value !== null && entry.evidenceRefs?.some((ref) => ref !== 'user-input');
  if (!resolved(originalTier)) return identity;
  if (retrieved(originalSeries) && retrieved(candidateSeries)
    && String(originalSeries.value).toLowerCase() === String(candidateSeries.value).toLowerCase()) {
    return { ...identity, facts: { ...identity.facts, tier: {
      ...fact('INFERRED', originalTier.value, candidateSeries.evidenceRefs), basis: 'SAME_SERIES_AS_ORIGINAL', productLine: String(candidateSeries.value),
    } } };
  }
  return inheritLineageTier(original, identity, originalTier, retrieved(candidateSeries) ? candidateSeries.value : null);
}

/**
 * Tier inheritance through a documented lineage (Q80 <-> QN80). It needs the candidate's model to be retrieved evidence and
 * both product lines to be registered in one lineage; it carries the original's tier only and verifies nothing else.
 */
function inheritLineageTier(original, identity, originalTier, retrievedSeries) {
  const originalModel = getFact(original, 'model');
  const candidateModel = getFact(identity, 'model');
  if (originalModel.status !== 'KNOWN' || candidateModel.status !== 'KNOWN' || !candidateModel.evidenceRefs?.some((ref) => ref !== 'user-input')) return identity;
  const { relation, lineage } = tvFamilyRelation(originalModel.value, candidateModel.value);
  if (!lineage || !['SAME_LINE', 'EQUIVALENT_LINEAGE'].includes(relation)) return identity;
  // A retrieved series that names a different line contradicts the model number, so nothing is inherited.
  const named = retrievedSeries === null ? null : samsungTvSeriesLine(retrievedSeries);
  if (named && !['SAME_LINE', 'EQUIVALENT_LINEAGE'].includes(tvLineRelation(samsungTvProductLine(originalModel.value), named).relation)) return identity;
  return { ...identity, facts: { ...identity.facts, tier: {
    ...fact('INFERRED', originalTier.value, candidateModel.evidenceRefs), basis: 'FAMILY_LINEAGE_REGISTRY',
    lineageVersion: TV_FAMILY_LINEAGE_VERSION, productLine: samsungTvProductLine(candidateModel.value), lineage: lineage.lines.join('/'), source: lineage.source,
  } } };
}

export function normalizeTier(value) {
  const token = String(value || '').trim().toUpperCase().replace(/[ -]+/g, '_');
  return TIERS.includes(token) ? token : null;
}

export function normalizeResolution(value) {
  const token = String(value || '').trim().toLowerCase();
  const levels = { '720p': 1, hd: 1, '1080p': 2, fhd: 2, '4k': 3, uhd: 3, '2160p': 3, '8k': 4, '4320p': 4 };
  return levels[token] ?? null;
}

export function numeric(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && /^\s*\d+(?:\.\d+)?\s*$/.test(value)) return Number(value);
  return null;
}

export function comparableValue(key, value) {
  if (key === 'tier') return normalizeTier(value);
  if (key === 'resolution') return normalizeResolution(value);
  if (['screenSizeIn', 'totalCapacityCuFt', 'refreshHz', 'hdmiCount', 'modelYear'].includes(key)) return numeric(value);
  return value;
}

export function normalizedFact(status, value, evidenceRefs = [], basis = undefined) {
  if (!FACT_STATUS.includes(status)) throw new TypeError('invalid fact status');
  return { status, value, evidenceRefs, ...(basis ? { basis } : {}) };
}
