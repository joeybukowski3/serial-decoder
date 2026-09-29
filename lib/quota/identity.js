import { createHash } from 'node:crypto';
import { QUOTA_TIERS } from './config.js';

/**
 * Who a lookup is metered against. Anonymous visitors are identified by a
 * random first-party ID the browser generates and stores itself (never a
 * fingerprint); without one the subject falls back to a day-scoped IP hash.
 * Everything that leaves this module is a hash. The IP hash is tracked
 * separately, only for abuse signals, and rotates daily so it cannot link a
 * person across days.
 *
 * `accountId` / `tier` are inputs a future auth layer supplies through an
 * injectable resolver; nothing here knows about billing or sessions.
 */

const VISITOR_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const HASH_LENGTH = 24;

export function isValidVisitorId(value) {
  return typeof value === 'string' && VISITOR_ID_PATTERN.test(value);
}

function digest(parts) {
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, HASH_LENGTH);
}

export function hashVisitorId(visitorId, salt) {
  return digest([salt, 'visitor', visitorId]);
}

export function hashIp(ip, salt, day) {
  return digest([salt, 'ip', day, String(ip || 'unknown')]);
}

export function utcDay(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

export function utcMonth(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 7);
}

function header(req, name) {
  const value = req?.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * @param {object} args
 * @param {object} args.req            the HTTP request (headers only are read)
 * @param {string} args.ip             client IP (raw, never returned or logged)
 * @param {object} args.config         loadQuotaConfig() result
 * @param {number} args.now
 * @param {{accountId?: string, tier?: string}|null} [args.account]  from a future auth resolver
 */
export function buildIdentity({ req, ip, config, now = Date.now(), account = null }) {
  const day = utcDay(now);
  const ipHash = hashIp(ip, config.hashSalt, day);
  const tier = account?.accountId && QUOTA_TIERS.includes(account.tier) ? account.tier : 'anonymous';

  if (account?.accountId) {
    return {
      tier,
      accountId: String(account.accountId),
      subjectId: `acct:${digest([config.hashSalt, 'account', account.accountId])}`,
      idSource: 'account',
      visitorHash: null,
      ipHash,
    };
  }

  const rawVisitorId = header(req, 'x-visitor-id');
  if (isValidVisitorId(rawVisitorId)) {
    const visitorHash = hashVisitorId(rawVisitorId, config.hashSalt);
    return { tier, accountId: null, subjectId: `anon:${visitorHash}`, idSource: 'visitor', visitorHash, ipHash };
  }
  // No usable visitor ID (blocked storage, an API caller, a bot): meter by the
  // day-scoped IP hash so such traffic is still visible and bounded.
  return { tier, accountId: null, subjectId: `anon:ip-${ipHash}`, idSource: 'ip', visitorHash: null, ipHash };
}
