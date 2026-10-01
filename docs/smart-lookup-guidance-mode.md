# Smart Lookup route modes: GENERAL_GUIDANCE and PRECISION_RESEARCH

Smart Lookup age lookups choose one of two modes per request (`lib/smart-lookup/route-mode.js`). The
decision uses only the query text, is made before any provider is considered, and is recorded on the
response as `routeMode` (`general_guidance` | `precision_research`; absent when the request never
reached routing, e.g. a local, verified, cached, or unusable answer).

## Router

`GENERAL_GUIDANCE` only when **all** of these hold: the query names only a brand and/or a product
category; there is no model-like token; no recognized family or model line; no serial or service-tag
text; no extra identifier; no digit-bearing token (other than a plain measurement); no descriptive word
beyond brand, category and generic qualifiers; and the user added no notes.

Everything else is `PRECISION_RESEARCH`. **Uncertainty always routes to `PRECISION_RESEARCH`.** The
router has no "invalid" outcome and contains no table of model-number formats: an unfamiliar token can
only ever make a query look more specific. `reasons` on the decision explains why a query went to
precision. Examples:

| Query | Mode |
|---|---|
| `Samsung Refrigerator`, `Whirlpool washer`, `LG TV`, `washer`, `Whirlpool` | general guidance |
| `Samsung french door refrigerator`, `Sony Bravia`, `Honda generator` | precision (distinctive description) |
| `Zephyrix ZX-9000`, `XJ-440B`, `WRF535SWHZ00`, `Dell OptiPlex 9020` | precision (model-like token) |
| `Whirlpool 2015 washer`, `Samsung refrigerator serial: ABC12345` | precision (digit / serial) |

## GENERAL_GUIDANCE path (`lib/smart-lookup/guidance.js`)

- Always builds a deterministic card first (`buildGeneralGuidanceResult`): manufacturer, product type,
  "exact model: not identified", "manufacture date: needs more detail", what to enter next. No year,
  range or lifecycle claim is ever produced. The only historical text is the trusted local
  `CATEGORY_HISTORY` for a category-only query, as before.
- Optionally enriched by **one cheap, ungrounded Gemini call** (`guidance-provider.js`): no
  `google_search` tool, small output cap, one request, never retried. The model may return one short
  sentence of general context and up to three "what to look for" suggestions. Any text containing a
  digit or a date/lifecycle word is dropped, so the card cannot claim a date.
- Enrichment is **off by default**: set `SMART_LOOKUP_GUIDANCE_ENABLED=true`. Model is
  `gemini-3.5-flash-lite` unless `SMART_LOOKUP_GUIDANCE_MODEL` is set; timeout
  `SMART_LOOKUP_GUIDANCE_TIMEOUT_MS` (default 3500).
- Fails closed: it needs the per-IP limiter and its own daily cap
  (`SMART_LOOKUP_GUIDANCE_DAILY_LIMIT`, default 1500, key `smart-budget:guidance:logical:<day>`).
  When either is unavailable or denies, the deterministic card is served without a model call. It never
  touches the grounded-research budget.
- Consumes **no logical research credit** (it is not research). Its provider attempts and tokens are
  still recorded in the daily usage hash.
- Result status is normally `needs-detail`.

## PRECISION_RESEARCH path

Unchanged: local/verified/cache first, then the paid grounded flow with the 429 cooldown, fail-closed
limiter and budget, quota metering (one logical credit per user action; a Retry of the same lookup within
10 minutes is the same credit), and the deterministic reserve on failure.

## Result statuses

`resolved`, `partial`, `needs-detail`, `conflict`, `no-result`, `error`. (`conflict` pre-dates this work
and is in use for brand/category conflicts, so it is kept.)

Classification lives in `lib/smart-lookup/outcome.js` (server logs and counters) and is mirrored in
`src/browser/smart-lookup-controller.js` (GA4). `tests/analytics/smart-lookup-outcome-parity.test.mjs`
runs one fixture table through both and fails on any difference.

- `needs-detail`: the product was recognized or identified, but nothing can date it yet (brand+category,
  exact model with no evidence, a provider that named a product with no year, timing withheld by the
  vague-query guard).
- `no-result`: reserved for input with nothing to recognize (unusable text, nothing identified).
- `error`: every technical failure, including 429, `RATE_LIMIT`, `PROVIDER_RATE_LIMIT`,
  `RATE_LIMIT_STORE_UNAVAILABLE`, timeouts, capacity, malformed provider output, and failures that still
  returned a recognized-product reserve card.
- Year information a provider returned is preserved: a lone `bestEstimateYear` and open-ended ranges
  ("2015 or later") become a dated result (`year_signal` = `year` / `open-ended`). The vague-query guard
  that withholds model-level timing for an unidentified product is unchanged; it now reports
  `needs-detail` / `low-confidence-estimate` instead of silently becoming no-result.

## Cache and Retry

- Yearless, needs-detail, guidance and withheld-timing answers are cached for **30 minutes**
  (`SMART_AGE_NEEDS_DETAIL_TTL_SECONDS`, inside 15-60). Dated answers keep their existing TTLs.
- The route mode is part of the cache key, and the policy version was bumped to
  `estimate-first-single-heavy-2`, so entries written under the old policy (which cached yearless answers
  for 7-180 days) are never read again. Expect one cold-cache period after deploy.
- The browser sends `retry: true` on an explicit Retry; the server skips the cache read, researches
  again, and overwrites the entry. The verified-evidence read and the quota de-duplication are unaffected.

## Telemetry

GA4 `smart_lookup_complete` adds `outcome_reason`, `year_signal`, `route_mode` and
`refinement_of_needs_detail` (true only when a different query follows a `needs-detail` result within
10 minutes; no query text is sent). Add them to the two GA allowlists and the parity test (done) and
register them as event-scoped custom dimensions in GA4 (not retroactive).

`outcome_reason` values (hyphenated): `dated-result`, `deterministic-fallback`, `family-range`,
`broad-range`, `general-guidance`, `brand-category-recognized`, `product-recognized-undated`,
`exact-model-undated`, `model-recognized-undated`, `brand-recognized`, `category-recognized`,
`product-identified-no-year`, `low-confidence-estimate`, `history-only`, `serial-handoff`,
`evidence-conflict`, `unusable-query`, `insufficient-input`, `nothing-recognized`, `network-error`,
`provider-timeout`, `provider-rate-limited`, `rate-limited`, `rate-limit-store-unavailable`,
`provider-malformed`, `provider-unavailable`, `capacity`, `internal-error`.
`year_signal`: `exact-unit`, `candidates`, `range`, `open-ended`, `year`, `none`.

Server log line `smart_age_lookup` adds `routeMode`, `resultStatus`, `outcomeReason`, `yearSignal`,
`isRetry`, `retryBypassedCache`, `guidanceEnrichment`, `guidanceFailureCode`, `guidanceModel` (the
`telemetry.js` allowlist drops anything not named there).

Daily Redis counters (`provider-usage:v1:<UTC day>`, route `age`; see
`lib/smart-lookup/outcome-counters.js`): `result_status:*`, `result_reason:*`, `year_signal:*`,
`route_mode:*`, `route_status:<mode>:<status>`, `route_attempts:<mode>`, `route_tokens_in|out:<mode>`,
`route_grounded:<mode>`, `route_logical_ai:<mode>`, `route_retry:<mode>`, plus the traffic bucket
`outcome:guidance`. They are written whenever Redis was already used by the request or quota metering is
on; local, verified and deterministic answers stay Redis-free otherwise.

Report: `node --env-file=.env.local scripts/report-provider-usage.mjs [day ...]` prints section
"3b. ROUTE MODES": volume per mode, useful / needs-detail / no-result / error rates, provider attempts
and tokens per request, grounding share, credits and retries, plus top outcome reasons and year signals.
"Useful" = resolved or partial; for general guidance the intended outcome is needs-detail, reported
separately.

## Migration notes

- Historical GA4 `no-result` is not comparable to `no-result` after this ships: recognized-but-undated
  outcomes moved to `needs-detail`, rate limits moved to `error`. `outcome_reason` is present only on
  new events, so its presence marks the new semantics. `event_version` was not bumped (it is shared with
  the decoder events and existing reports filter on `2`).
- `needs-detail` is a new `result_status` value: dashboards that enumerate statuses need updating.
- Labeled serial-only input (`Serial: X`) still reports `resolved` (reason `serial-handoff`), unchanged.
