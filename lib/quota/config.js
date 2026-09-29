/**
 * Quota configuration for AI-backed Smart Lookups.
 *
 * Only lookups that cross into a paid provider path are ever counted; local,
 * cached and deterministic answers are unlimited and never touch a quota
 * counter. Limits are configuration, not logic: pricing tiers can change
 * without touching the engine, and no billing provider is referenced here.
 *
 * Two independent flags (both OFF by default):
 *   SMART_LOOKUP_QUOTA_METERING  count logical AI lookups and log what WOULD
 *                                have happened ("shadow mode").
 *   SMART_LOOKUP_QUOTA_ENFORCE   actually refuse over-limit lookups. Ignored
 *                                unless metering is also on.
 *
 * A limit of `null` means "no limit of that kind".
 */

export const QUOTA_TIERS = Object.freeze(['anonymous', 'free', 'pro', 'business']);

export const DEFAULT_TIER_LIMITS = Object.freeze({
  anonymous: Object.freeze({ daily: 5, monthly: null }),
  free: Object.freeze({ daily: 10, monthly: 50 }),
  pro: Object.freeze({ daily: null, monthly: 500 }),
  business: Object.freeze({ daily: null, monthly: 2500 }),
});

/** Shadow-only abuse signal: AI lookups per hashed IP per UTC day, across all visitor IDs. */
export const DEFAULT_IP_DAILY_LIMIT = 30;

function flag(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
}

/** Positive integer, or `null` for the literal "none"/"unlimited", else the fallback. */
function limit(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const text = String(value).trim().toLowerCase();
  if (text === 'none' || text === 'unlimited') return null;
  const parsed = Number.parseInt(text, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function isQuotaMeteringEnabled(env = process.env) {
  return flag(env?.SMART_LOOKUP_QUOTA_METERING);
}

export function isQuotaEnforcementEnabled(env = process.env) {
  return isQuotaMeteringEnabled(env) && flag(env?.SMART_LOOKUP_QUOTA_ENFORCE);
}

export function loadQuotaConfig(env = process.env) {
  const d = DEFAULT_TIER_LIMITS;
  return {
    metering: isQuotaMeteringEnabled(env),
    enforce: isQuotaEnforcementEnabled(env),
    tiers: {
      anonymous: {
        daily: limit(env?.QUOTA_ANONYMOUS_DAILY, d.anonymous.daily),
        monthly: limit(env?.QUOTA_ANONYMOUS_MONTHLY, d.anonymous.monthly),
      },
      free: {
        daily: limit(env?.QUOTA_FREE_DAILY, d.free.daily),
        monthly: limit(env?.QUOTA_FREE_MONTHLY, d.free.monthly),
      },
      pro: {
        daily: limit(env?.QUOTA_PRO_DAILY, d.pro.daily),
        monthly: limit(env?.QUOTA_PRO_MONTHLY, d.pro.monthly),
      },
      business: {
        daily: limit(env?.QUOTA_BUSINESS_DAILY, d.business.daily),
        monthly: limit(env?.QUOTA_BUSINESS_MONTHLY, d.business.monthly),
      },
    },
    ipDailyLimit: limit(env?.QUOTA_IP_DAILY, DEFAULT_IP_DAILY_LIMIT),
    // Optional salt for the visitor/IP hashes. Not a secret that protects the
    // service, only a privacy measure so hashes cannot be looked up offline.
    hashSalt: String(env?.QUOTA_HASH_SALT || 'dmi-quota-v1'),
  };
}
