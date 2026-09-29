# AI-lookup quota foundation (shadow metering)

Foundation for a future freemium model. **Nothing is blocked and no UI is shown.** Only AI-backed Smart
Lookups are ever counted; serial decoding, local, cached and deterministic answers are unlimited and never
touch a quota counter. Cost controls are documented separately in `docs/provider-cost-controls.md`.

## Turning it on

| Env var | Default | Meaning |
|---|---|---|
| `SMART_LOOKUP_QUOTA_METERING` | off | count logical AI lookups, log what *would* happen, write daily traffic counters |
| `SMART_LOOKUP_QUOTA_ENFORCE` | off | actually refuse over-limit AI lookups (`AI_QUOTA_EXCEEDED`). Ignored unless metering is on |
| `QUOTA_ANONYMOUS_DAILY` / `_MONTHLY` | 5 / none | anonymous limits |
| `QUOTA_FREE_DAILY` / `_MONTHLY` | 10 / 50 | future free account |
| `QUOTA_PRO_DAILY` / `_MONTHLY` | none / 500 | future Pro |
| `QUOTA_BUSINESS_DAILY` / `_MONTHLY` | none / 2500 | future Business |
| `QUOTA_IP_DAILY` | 30 | shadow abuse signal: AI lookups per hashed IP per day (all visitor IDs combined) |
| `QUOTA_HASH_SALT` | built-in | optional salt for visitor/IP hashes (privacy only) |

`none`/`unlimited` removes a limit. To start collecting shadow data: set `SMART_LOOKUP_QUOTA_METERING=1`.
Days and months are UTC, matching the existing provider budget.

## What counts as one lookup

One user action that crosses into a paid-provider path (after the local DB, cache, HVAC shortcut and
deterministic reserve all miss) is **one logical AI lookup**, however many providers, fallbacks or retries run
behind it (`age-lookup.js`, just before the provider chain).

* **Retry:** the same subject asking the same query again within 10 minutes is not counted again.
* **Refund:** a lookup that ends without an AI result (provider failure, rate-limit/budget refusal,
  deterministic fallback) is refunded, so failures never spend allowance; a later success then counts once.
* **Shared in-flight calls:** each user who receives a shared provider result counts once (the global
  budget counts provider chains instead, so the two are not comparable).
* **Fails open:** any quota-store error never blocks a lookup. (The paid path itself still fails closed on
  the rate limiter/budget, unchanged.)

## Identity

`subject = acct:<hash>` (future) or `anon:<sha256(salt + visitorId)>`. The visitor ID is a random value the
browser creates and keeps in its own `localStorage` (`dmi_visitor_v1`), sent as `X-Visitor-Id` **only** to
`/api/age-lookup`; it is not derived from the device (no fingerprinting) and never goes to analytics.
Without one the subject is a day-scoped IP hash (`anon:ip-<hash>`). The IP hash is tracked separately and
rotates daily. Different visitor IDs behind one IP have separate allowances; the existing per-IP rate limiter
(raw IP, 15/min) is unchanged, and the daily IP counter adds a shadow-only signal for ID rotation.

## Quota engine

`lib/quota/resolver.js` `resolveQuota({identity, usedToday, usedThisMonth, config})` returns `tier`,
`dailyLimit`, `monthlyLimit`, `usedToday`, `usedThisMonth`, `remainingDaily`, `remainingMonthly`, `remaining`,
`allowed`, `blockReason`. Counters include the lookup being evaluated, so the 5th anonymous lookup is allowed
and the 6th is not. Tiers: `anonymous | free | pro | business`. A future auth layer supplies
`{accountId, tier}` through the injectable `accountResolver`; the engine contains no billing logic.

## Data (Redis, hashes only)

`quota:v1:d:<day>` and `quota:v1:m:<month>` (subject -> count, TTL 45 / 100 days), `quota:v1:ip:<day>`,
`quota:v1:tx:<subject>:<query>` (retry marker, 10 min). Day events go in the existing
`provider-usage:v1:<day>` hash: `outcome:local|cache|deterministic|ai|other`, `ai_lookup`,
`ai_lookup_refunded`, `ai_lookup_duplicate`, `quota_would_block`, `quota_blocked`, `quota_store_error`.
Local/cache/deterministic outcomes are written best-effort *after* the reply, only when metering is on.

Request log lines gain `quotaMode, quotaTier, quotaIdSource, quotaVisitorHash, quotaIpHash` (12-char hash
prefixes), `logicalAiLookupCount` (0/1 for this request), `quotaUsedToday, quotaUsedThisMonth,
quotaRemainingDaily, quotaRemainingMonthly, quotaWouldAllow, quotaWouldBlock, quotaBlockReason,
quotaIpWouldBlock, quotaDuplicate, quotaRefunded, quotaBlocked, quotaStoreError`.

## Report

```
node --env-file=.env.local scripts/report-provider-usage.mjs [YYYY-MM-DD ...]
```

Five sections: Traffic, AI utilization, Cost-control performance, User usage distribution (1/2/3/4/5/6-10/
11-25/26+ buckets, median/P90/P95/P99, top 1%/5%/10% share) and Hypothetical quota impact (users who
*hit* vs would be *blocked* at 5/day and 10/day, lookups and share of AI usage that would have been blocked,
IPs over the IP limit). Read-only; hashes only.

## Dormant UI

`src/browser/smart-lookup-quota-ui.js` renders four states (usage remaining, limit reached, create free
account, upgrade to Pro) from the resolver's output. It is not loaded by any page, not in any build, renders
nothing unless called with `{enabled: true}`, and the server never sends the quota object. Copy only ever
refers to "AI-assisted" lookups and states that decoding and saved results remain available. The account
and pricing links (`/account`, `/pricing`) are placeholders for pages that do not exist yet.

## Before enabling in production

* The visitor ID is a new persistent (pseudonymous) identifier. `privacy-policy.html` currently describes
  functional cookies and Google Analytics only; review its wording before turning metering on.
* Not metered by design: `lkq-lookup` (the UI no longer calls it) and serial refinement.
* Set `QUOTA_HASH_SALT` in Vercel so hashes cannot be reproduced from the repo.
