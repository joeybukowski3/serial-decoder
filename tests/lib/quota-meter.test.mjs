import test from 'node:test';
import assert from 'node:assert/strict';

import { createQuotaMeter, quotaKeys } from '../../lib/quota/meter.js';
import { createFakeRedis } from '../helpers/fake-redis.mjs';

const DAY1 = Date.UTC(2026, 8, 29, 12, 0, 0);
const DAY2 = Date.UTC(2026, 8, 30, 12, 0, 0);
const NEXT_MONTH = Date.UTC(2026, 9, 1, 12, 0, 0);

const VISITOR_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const VISITOR_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const VISITOR_C = 'cccccccccccccccccccccccccccccccc';

function makeMeter({ env = {}, clock = { now: DAY1 }, accountResolver } = {}) {
  const meter = createQuotaMeter({
    env: { SMART_LOOKUP_QUOTA_METERING: '1', ...env },
    now: () => clock.now,
    accountResolver,
  });
  return { meter, clock };
}

function request(visitor, ip = '198.51.100.7') {
  return { headers: { 'x-visitor-id': visitor, 'x-forwarded-for': ip } };
}

/** One user action that reaches the paid path. */
async function lookup(meter, redis, { visitor = VISITOR_A, ip, query = 'q1', produced = true } = {}) {
  const session = meter.createSession({ req: request(visitor, ip) });
  session.setRedis(redis);
  const decision = await session.admit({ redis, queryKey: query });
  if (produced) session.markAiProduced();
  return { session, decision };
}

const today = (redis, day, subject) => Number(redis.hash(quotaKeys.daily(day))[subject] || 0);

// ---------------------------------------------------------------- counting

test('a paid-path lookup counts exactly one logical AI lookup, however it is later served', async () => {
  const redis = createFakeRedis();
  const { meter } = makeMeter();
  const { decision } = await lookup(meter, redis);

  assert.equal(decision.counted, true);
  assert.equal(decision.usedToday, 1);
  assert.equal(decision.usedThisMonth, 1);
  assert.equal(decision.tier, 'anonymous');
  assert.equal(decision.remainingDaily, 4);
  assert.equal(decision.wouldAllow, true);
  assert.equal(decision.wouldBlock, false);
  assert.equal(today(redis, '2026-09-29', decision.internal.identity.subjectId), 1);
});

test('a retry of the same query by the same visitor is not counted again', async () => {
  const redis = createFakeRedis();
  const { meter } = makeMeter();
  await lookup(meter, redis, { query: 'same' });
  const retry = await lookup(meter, redis, { query: 'same' });

  assert.equal(retry.decision.duplicate, true);
  assert.equal(retry.decision.counted, false);
  assert.equal(retry.decision.usedToday, 1, 'still one logical lookup');
  assert.equal(retry.session.telemetry().logicalAiLookupCount, 0);
});

test('different queries by the same visitor are separate logical lookups', async () => {
  const redis = createFakeRedis();
  const { meter } = makeMeter();
  await lookup(meter, redis, { query: 'one' });
  const second = await lookup(meter, redis, { query: 'two' });
  assert.equal(second.decision.usedToday, 2);
});

test('the same anonymous visitor is recognised across requests and other visitors are unaffected', async () => {
  const redis = createFakeRedis();
  const { meter } = makeMeter();
  await lookup(meter, redis, { visitor: VISITOR_A, query: 'x' });
  await lookup(meter, redis, { visitor: VISITOR_A, query: 'y' });
  const other = await lookup(meter, redis, { visitor: VISITOR_B, query: 'x' });
  assert.equal(other.decision.usedToday, 1);
  const again = await lookup(meter, redis, { visitor: VISITOR_A, query: 'z' });
  assert.equal(again.decision.usedToday, 3);
});

test('different visitor IDs behind one IP are metered separately, and the IP-level abuse signal still trips', async () => {
  const redis = createFakeRedis();
  const { meter } = makeMeter({ env: { QUOTA_IP_DAILY: '2' } });
  const a = await lookup(meter, redis, { visitor: VISITOR_A, ip: '203.0.113.50' });
  const b = await lookup(meter, redis, { visitor: VISITOR_B, ip: '203.0.113.50' });
  const c = await lookup(meter, redis, { visitor: VISITOR_C, ip: '203.0.113.50' });

  for (const { decision } of [a, b, c]) assert.equal(decision.usedToday, 1, 'each visitor has their own allowance');
  assert.equal(c.decision.allowed, true, "the third visitor's own allowance is untouched by the others");
  assert.equal(a.decision.ipWouldBlock, false);
  assert.equal(b.decision.ipWouldBlock, false);
  assert.equal(c.decision.ipToday, 3);
  assert.equal(c.decision.ipWouldBlock, true, 'a third visitor from one IP crosses the IP-level shadow limit');
  assert.equal(c.decision.blockReason, 'ip');
  assert.equal(c.decision.wouldBlock, true);
  assert.equal(c.decision.blocked, false, 'shadow mode never blocks');
  // and a different IP is unaffected
  const elsewhere = await lookup(meter, redis, { visitor: VISITOR_A, ip: '203.0.113.99', query: 'other' });
  assert.equal(elsewhere.decision.ipToday, 1);
});

// ---------------------------------------------------------------- shadow vs enforce

test('shadow mode identifies wouldBlock but never blocks', async () => {
  const redis = createFakeRedis();
  const { meter } = makeMeter();
  const decisions = [];
  for (let i = 1; i <= 7; i += 1) decisions.push((await lookup(meter, redis, { query: `q${i}` })).decision);

  assert.equal(decisions[4].wouldBlock, false, 'the 5th lookup fits');
  assert.equal(decisions[5].wouldBlock, true, 'the 6th would be blocked');
  assert.equal(decisions[5].wouldAllow, false);
  assert.equal(decisions[5].blockReason, 'daily');
  assert.equal(decisions[5].remainingDaily, 0);
  assert.equal(decisions.every((d) => d.blocked === false), true, 'nothing is ever blocked in shadow mode');
  assert.equal(decisions.every((d) => d.counted === true), true, 'over-limit usage is still measured for the distribution');
  assert.equal(decisions[6].usedToday, 7);
  assert.equal(meter.enforce, false);
});

test('enforcement is a separate flag: when on, the over-limit lookup is blocked and does not spend allowance', async () => {
  const redis = createFakeRedis();
  const { meter } = makeMeter({ env: { SMART_LOOKUP_QUOTA_ENFORCE: '1' } });
  for (let i = 1; i <= 5; i += 1) await lookup(meter, redis, { query: `q${i}` });
  const sixth = await lookup(meter, redis, { query: 'q6' });

  assert.equal(sixth.decision.blocked, true);
  assert.equal(sixth.decision.counted, false);
  assert.equal(today(redis, '2026-09-29', sixth.decision.internal.identity.subjectId), 5, 'a blocked lookup is not stored');
  // a retry of the blocked lookup is evaluated afresh (still blocked), not treated as a duplicate
  const retry = await lookup(meter, redis, { query: 'q6' });
  assert.equal(retry.decision.blocked, true);
  assert.equal(retry.decision.duplicate, false);
});

test('metering off means nothing is counted and no Redis command runs', async () => {
  const redis = createFakeRedis();
  const meter = createQuotaMeter({ env: {}, now: () => DAY1 });
  const session = meter.createSession({ req: request(VISITOR_A) });
  assert.equal(session.enabled, false);
  assert.equal(await session.admit({ redis, queryKey: 'q' }), null, 'admit is a no-op when metering is off');
  await session.settle({ getRedis: () => redis, outcome: 'local' });
  assert.equal(redis.log.length, 0);
  assert.deepEqual(session.telemetry(), {});
});

// ---------------------------------------------------------------- refunds / provider failures

test('a lookup that produced no AI result is refunded and a later success counts exactly once', async () => {
  const redis = createFakeRedis();
  const { meter } = makeMeter();
  const failed = await lookup(meter, redis, { query: 'flaky', produced: false });
  assert.equal(await failed.session.refundUnproduced(redis), true);
  assert.equal(await failed.session.refundUnproduced(redis), false, 'refund is idempotent');
  const subject = failed.decision.internal.identity.subjectId;
  assert.equal(today(redis, '2026-09-29', subject), 0);
  assert.equal(subject in redis.hash(quotaKeys.daily('2026-09-29')), false, 'zeroed fields are removed');
  assert.equal(Number(redis.hash(quotaKeys.monthly('2026-09'))[subject] || 0), 0);
  assert.equal(failed.session.telemetry().logicalAiLookupCount, 0);
  assert.equal(failed.session.telemetry().quotaRefunded, true);

  const retry = await lookup(meter, redis, { query: 'flaky' });
  assert.equal(retry.decision.counted, true, 'the retry after a failure is a fresh lookup');
  assert.equal(retry.decision.usedToday, 1, 'net one lookup after fail + success');
});

test('a produced AI result is never refunded', async () => {
  const redis = createFakeRedis();
  const { meter } = makeMeter();
  const ok = await lookup(meter, redis, { produced: true });
  assert.equal(await ok.session.refundUnproduced(redis), false);
  await ok.session.settle({ getRedis: () => redis });
  assert.equal(today(redis, '2026-09-29', ok.decision.internal.identity.subjectId), 1);
});

test('refunds can never push a counter below zero', async () => {
  const redis = createFakeRedis();
  const { meter } = makeMeter();
  const { session, decision } = await lookup(meter, redis, { produced: false });
  redis.hashes.get(quotaKeys.daily('2026-09-29')).set(decision.internal.identity.subjectId, 0); // e.g. an expired/reset key
  await session.refundUnproduced(redis);
  assert.equal(today(redis, '2026-09-29', decision.internal.identity.subjectId), 0);
});

test('provider failures never corrupt counters across many failed and successful lookups', async () => {
  const redis = createFakeRedis();
  const { meter } = makeMeter();
  let successes = 0;
  for (let i = 0; i < 12; i += 1) {
    const ok = i % 3 === 0;
    const { session, decision } = await lookup(meter, redis, { query: `q${i}`, produced: ok });
    if (ok) successes += 1;
    await session.settle({ getRedis: () => redis });
    assert.ok(today(redis, '2026-09-29', decision.internal.identity.subjectId) >= 0);
  }
  const subject = (await lookup(meter, redis, { query: 'probe' })).decision.internal.identity.subjectId;
  assert.equal(today(redis, '2026-09-29', subject), successes + 1, 'only successful lookups (plus the probe) remain counted');
});

// ---------------------------------------------------------------- resets

test('the daily allowance resets at the UTC day boundary while the monthly total carries on', async () => {
  const redis = createFakeRedis();
  const { meter, clock } = makeMeter();
  for (let i = 1; i <= 6; i += 1) await lookup(meter, redis, { query: `d1-${i}` });
  clock.now = DAY2;
  const next = await lookup(meter, redis, { query: 'd2-1' });
  assert.equal(next.decision.usedToday, 1, 'a new UTC day starts from zero');
  assert.equal(next.decision.usedThisMonth, 7, 'the month keeps accumulating');
  assert.equal(next.decision.wouldBlock, false);
});

test('the monthly counter resets at the UTC month boundary', async () => {
  const redis = createFakeRedis();
  const { meter, clock } = makeMeter();
  for (let i = 1; i <= 3; i += 1) await lookup(meter, redis, { query: `s-${i}` });
  clock.now = NEXT_MONTH;
  const october = await lookup(meter, redis, { query: 'o-1' });
  assert.equal(october.decision.usedThisMonth, 1);
  assert.equal(october.decision.usedToday, 1);
});

test('free-tier monthly exhaustion is reported while the daily allowance still has room', async () => {
  const redis = createFakeRedis();
  const clock = { now: DAY1 };
  const { meter } = makeMeter({
    clock,
    env: { QUOTA_FREE_DAILY: '100', QUOTA_FREE_MONTHLY: '3' },
    accountResolver: async () => ({ accountId: 'acct-1', tier: 'free' }),
  });
  const results = [];
  for (let i = 1; i <= 5; i += 1) results.push((await lookup(meter, redis, { query: `m${i}` })).decision);
  assert.equal(results[2].wouldBlock, false);
  assert.equal(results[3].wouldBlock, true);
  assert.equal(results[3].blockReason, 'monthly');
  assert.equal(results[3].tier, 'free');
  assert.equal(results[3].remainingMonthly, 0);
});

test('a future Pro account plugs in through the resolver without any billing logic', async () => {
  const redis = createFakeRedis();
  const { meter } = makeMeter({ accountResolver: async () => ({ accountId: 'acct-9', tier: 'pro' }) });
  let last;
  for (let i = 1; i <= 8; i += 1) last = (await lookup(meter, redis, { query: `p${i}` })).decision;
  assert.equal(last.tier, 'pro');
  assert.equal(last.wouldBlock, false, 'pro has no daily limit');
  assert.equal(last.remainingDaily, null);
  assert.equal(last.remainingMonthly, 492);
  assert.match(last.internal.identity.subjectId, /^acct:/);
});

// ---------------------------------------------------------------- store failures / privacy

test('a quota store failure fails open: the lookup is never blocked, even when enforcing', async () => {
  const broken = createFakeRedis();
  broken.set = async () => { throw new Error('ECONNREFUSED'); };
  const { meter } = makeMeter({ env: { SMART_LOOKUP_QUOTA_ENFORCE: '1' } });
  const { decision, session } = await lookup(meter, broken);
  assert.equal(decision.metered, false);
  assert.equal(decision.storeError, 'QUOTA_STORE_UNAVAILABLE');
  assert.equal(decision.blocked, false);
  assert.equal(decision.wouldAllow, true);
  assert.equal(session.telemetry().logicalAiLookupCount, 0);

  const noRedis = await meter.createSession({ req: request(VISITOR_A) }).admit({ redis: null, queryKey: 'q' });
  assert.equal(noRedis.blocked, false);
  assert.equal(noRedis.storeError, 'QUOTA_STORE_UNAVAILABLE');
});

test('a hung quota store cannot stall a lookup', async () => {
  const hung = createFakeRedis();
  hung.set = () => new Promise(() => {});
  const { meter } = makeMeter();
  const started = Date.now();
  const { decision } = await lookup(meter, hung);
  assert.equal(decision.storeError, 'QUOTA_STORE_UNAVAILABLE');
  assert.ok(Date.now() - started < 2000);
});

test('telemetry carries hash prefixes and numbers only: never the visitor ID, IP or a query', async () => {
  const redis = createFakeRedis();
  const { meter } = makeMeter();
  const { session } = await lookup(meter, redis, { visitor: VISITOR_A, ip: '198.51.100.77', query: 'Whirlpool WRS325' });
  const fields = session.telemetry();
  const text = JSON.stringify(fields);
  assert.equal(text.includes(VISITOR_A), false);
  assert.equal(text.includes('198.51.100.77'), false);
  assert.equal(text.includes('Whirlpool'), false);
  assert.match(fields.quotaVisitorHash, /^[0-9a-f]{12}$/);
  assert.match(fields.quotaIpHash, /^[0-9a-f]{12}$/);
  assert.equal(fields.quotaMode, 'shadow');
  assert.equal(fields.logicalAiLookupCount, 1);
  assert.equal(fields.quotaTier, 'anonymous');
  assert.equal(fields.quotaWouldAllow, true);
  assert.equal(fields.quotaRemainingDaily, 4);
  // Redis holds only hashes too
  for (const key of redis.hashes.keys()) {
    for (const field of Object.keys(redis.hash(key))) assert.equal(field.includes(VISITOR_A) || field.includes('198.51.100.77'), false);
  }
});

// ---------------------------------------------------------------- settle: traffic events

test('settle writes the day\'s events: AI lookup, refund, would-block and local outcomes', async () => {
  const redis = createFakeRedis();
  const { meter } = makeMeter();
  const usageKey = 'provider-usage:v1:2026-09-29';

  const local = meter.createSession({ req: request(VISITOR_A) });
  await local.settle({ getRedis: () => redis, outcome: 'local' });
  assert.equal(Number(redis.hash(usageKey)['age|event:outcome:local']), 1);
  assert.equal(redis.hashes.has(quotaKeys.daily('2026-09-29')), false, 'a local outcome never touches a quota counter');

  const failed = await lookup(meter, redis, { query: 'fails', produced: false });
  await failed.session.settle({ getRedis: () => redis });
  await failed.session.settle({ getRedis: () => redis }); // idempotent
  const events = redis.hash(usageKey);
  assert.equal(Number(events['age|event:outcome:ai']), 1);
  assert.equal(Number(events['age|event:ai_lookup']), 1);
  assert.equal(Number(events['age|event:ai_lookup_refunded']), 1);
});
