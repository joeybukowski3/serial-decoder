/**
 * Stage budget for the single heavyweight research provider (OpenAI / xAI).
 *
 * The default is the long-standing 6500 ms; SMART_LOOKUP_HEAVY_PROVIDER_TIMEOUT_MS
 * only lets it be tuned without a code change. The stage is always further
 * bounded by the remaining route deadline, so a large value can never extend
 * the route itself.
 */
export const DEFAULT_HEAVY_PROVIDER_TIMEOUT_MS = 6500;
export const MIN_HEAVY_PROVIDER_TIMEOUT_MS = 2000;
export const MAX_HEAVY_PROVIDER_TIMEOUT_MS = 12000;

/**
 * Anything that is not a plain positive integer (empty, text, negative, zero,
 * decimals, exponent notation) is ignored and the default is used; a valid
 * integer outside the safe range is clamped to it.
 */
export function heavyProviderStageBudgetMs(env = process.env) {
  const raw = String(env?.SMART_LOOKUP_HEAVY_PROVIDER_TIMEOUT_MS ?? '').trim();
  if (!/^\d{1,9}$/.test(raw)) return DEFAULT_HEAVY_PROVIDER_TIMEOUT_MS;
  const value = Number(raw);
  if (value <= 0) return DEFAULT_HEAVY_PROVIDER_TIMEOUT_MS;
  return Math.min(MAX_HEAVY_PROVIDER_TIMEOUT_MS, Math.max(MIN_HEAVY_PROVIDER_TIMEOUT_MS, value));
}
