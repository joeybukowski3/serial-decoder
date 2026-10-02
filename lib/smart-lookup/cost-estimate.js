/**
 * Application-side cost ESTIMATES for provider usage. Pure: no I/O, no prices
 * built in. Rates come from environment variables so a price change never needs
 * a code change, and a rate that is not configured yields `null`
 * ("cost unavailable"), never an invented number.
 *
 * Environment (all USD, all optional):
 *   COST_<PROVIDER>_INPUT_PER_MILLION    e.g. COST_GEMINI_INPUT_PER_MILLION, COST_OPENAI_...
 *   COST_<PROVIDER>_OUTPUT_PER_MILLION   thinking tokens are priced at the output rate
 *   COST_GROUNDED_REQUEST                per grounded request that returned a response
 *   COST_SEARCH_QUERY                    per search query the provider reported
 * Overrides, most specific first (model beats provider beats the global value;
 * the global value only exists for the two grounding prices):
 *   COST_MODEL_<MODEL>_<SUFFIX>          e.g. COST_MODEL_GEMINI_2_5_FLASH_INPUT_PER_MILLION
 *   COST_<PROVIDER>_<SUFFIX>             e.g. COST_OPENAI_GROUNDED_REQUEST
 * <MODEL>/<PROVIDER> are upper-cased with every non-alphanumeric run as "_".
 *
 * Grounding bills per request on some models and per search query on others, so
 * the two prices are independent: set the one that does not apply to 0.
 *
 * These are NOT invoice figures: token counts x list price, nothing reconciled
 * against billing.
 */

export const COST_UNAVAILABLE = 'cost unavailable';

const TOKENS_PER_MILLION = 1_000_000;

const normalizeName = (value) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');

function parseRate(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** Snapshot of the COST_* variables; the only thing the rest of this module reads. */
export function loadCostConfig(env = process.env) {
  const rates = {};
  for (const [name, raw] of Object.entries(env || {})) {
    if (!name.startsWith('COST_')) continue;
    const rate = parseRate(raw);
    if (rate !== null) rates[name] = rate;
  }
  return { rates };
}

const COMPONENTS = Object.freeze({
  input: { suffix: 'INPUT_PER_MILLION', global: false },
  output: { suffix: 'OUTPUT_PER_MILLION', global: false },
  groundedRequest: { suffix: 'GROUNDED_REQUEST', global: true },
  searchQuery: { suffix: 'SEARCH_QUERY', global: true },
});

/** The variable names consulted for a component, most specific first. */
export function rateKeys(component, provider, model) {
  const { suffix, global } = COMPONENTS[component];
  const keys = [];
  const modelName = normalizeName(model);
  if (modelName) keys.push(`COST_MODEL_${modelName}_${suffix}`);
  const providerName = normalizeName(provider);
  if (providerName) keys.push(`COST_${providerName}_${suffix}`);
  if (global) keys.push(`COST_${suffix}`);
  return keys;
}

function rateFor(config, component, provider, model) {
  for (const key of rateKeys(component, provider, model)) {
    if (key in config.rates) return config.rates[key];
  }
  return null;
}

const ZERO_USAGE = Object.freeze({
  calls: 0, groundedCalls: 0, groundedBillable: 0, searchQueries: 0, searchQueriesReported: 0,
  rateLimited: 0, inputTokens: 0, outputTokens: 0, thinkingTokens: 0,
});

export function addUsage(a = ZERO_USAGE, b = ZERO_USAGE) {
  return Object.fromEntries(Object.keys(ZERO_USAGE).map((key) => [key, (a[key] || 0) + (b[key] || 0)]));
}

export const emptyUsage = () => ({ ...ZERO_USAGE });

/**
 * Estimated cost of one provider/model's usage.
 *   token      input + (output + thinking) tokens at the configured rates
 *   grounding  billable grounded requests x request price + reported queries x query price
 *   total      token + grounding
 * Each part is null when a rate it needs is not configured; `missing` names the
 * variables that would make it computable. A zero volume never needs a rate.
 *
 * Only grounded requests that got a response back are priced per request: a
 * request that failed (429, timeout) returned no usage and is assumed unbilled.
 */
export function estimateUsageCost(config, provider, model, usage) {
  const missing = [];
  const need = (component, volume) => {
    if (!(volume > 0)) return 0;
    const rate = rateFor(config, component, provider, model);
    if (rate === null) {
      // Suggest the broadest variable that would fix it (global where one exists).
      const keys = rateKeys(component, provider, model);
      missing.push(COMPONENTS[component].global ? keys[keys.length - 1] : keys.find((key) => !key.startsWith('COST_MODEL_')));
      return null;
    }
    return rate;
  };

  const inputRate = need('input', usage.inputTokens);
  const outputRate = need('output', (usage.outputTokens || 0) + (usage.thinkingTokens || 0));
  const requestRate = need('groundedRequest', usage.groundedBillable);
  const queryRate = need('searchQuery', usage.searchQueries);

  const token = inputRate === null || outputRate === null
    ? null
    : ((usage.inputTokens || 0) * inputRate + ((usage.outputTokens || 0) + (usage.thinkingTokens || 0)) * outputRate) / TOKENS_PER_MILLION;
  const grounding = requestRate === null || queryRate === null
    ? null
    : (usage.groundedBillable || 0) * requestRate + (usage.searchQueries || 0) * queryRate;

  return {
    token,
    grounding,
    total: token === null || grounding === null ? null : token + grounding,
    missing: [...new Set(missing)],
  };
}

export const EMPTY_COST = Object.freeze({ token: 0, grounding: 0, total: 0, missing: Object.freeze([]) });

/** Adds two costs; a part is null as soon as either side's part is unavailable. */
export function addCosts(a, b) {
  const plus = (x, y) => (x === null || y === null ? null : x + y);
  return {
    token: plus(a.token, b.token),
    grounding: plus(a.grounding, b.grounding),
    total: plus(a.total, b.total),
    missing: [...new Set([...a.missing, ...b.missing])],
  };
}

/** value / count, or null when either is unknown or the denominator is zero. */
export function perUnit(value, count) {
  return value === null || value === undefined || !(count > 0) ? null : value / count;
}

export function formatUsd(value) {
  if (value === null || value === undefined) return COST_UNAVAILABLE;
  const digits = Math.abs(value) >= 1 ? 2 : 4;
  return `$${value.toFixed(digits)}`;
}
