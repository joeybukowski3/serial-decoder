import { QUOTA_TIERS } from './config.js';

/**
 * Pure quota calculation. Given who is asking, what they have used and the
 * configured limits, say what the allowance looks like. No I/O, no billing.
 *
 * `usedToday` / `usedThisMonth` INCLUDE the lookup being evaluated (they are
 * the counters after it was recorded), so `allowed` answers "does this lookup
 * fit inside the allowance?" and `remaining*` is what is left afterwards.
 * A null limit means unlimited: its `remaining` is null and it never blocks.
 */
export function resolveQuota({ identity, usedToday = 0, usedThisMonth = 0, config }) {
  const tier = QUOTA_TIERS.includes(identity?.tier) ? identity.tier : 'anonymous';
  const limits = config.tiers[tier];
  const dailyLimit = limits.daily;
  const monthlyLimit = limits.monthly;

  const remainingDaily = dailyLimit === null ? null : Math.max(0, dailyLimit - usedToday);
  const remainingMonthly = monthlyLimit === null ? null : Math.max(0, monthlyLimit - usedThisMonth);
  const finite = [remainingDaily, remainingMonthly].filter((value) => value !== null);

  const overDaily = dailyLimit !== null && usedToday > dailyLimit;
  const overMonthly = monthlyLimit !== null && usedThisMonth > monthlyLimit;

  return {
    tier,
    dailyLimit,
    monthlyLimit,
    usedToday,
    usedThisMonth,
    remainingDaily,
    remainingMonthly,
    remaining: finite.length ? Math.min(...finite) : null,
    allowed: !overDaily && !overMonthly,
    blockReason: overDaily ? 'daily' : (overMonthly ? 'monthly' : null),
  };
}
