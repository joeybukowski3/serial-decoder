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
