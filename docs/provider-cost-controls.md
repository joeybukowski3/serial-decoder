# Paid provider cost controls

Why this exists: an audit of a Gemini usage spike (168 API requests for 49 completed Smart Lookups) found
that one lookup could fan out into several Gemini calls, that a Gemini 429 triggered a *second* Gemini
call, that failed native calls were never counted, and that a Redis outage let paid calls through. See
`docs/smart-lookup-architecture.md` for the request flow these rules apply to.

## Rules

1. **A Gemini 429 ends Gemini use for that request.** No second Gemini model is tried. The fallback is
   OpenAI/xAI (if enabled), else Groq closed-book, else the deterministic/local reserve. Malformed,
   unusable, 5xx and timeout results still use the existing fallbacks.
2. **Cooldown.** The first 429 sets `gemini-cooldown:v1` in Redis (default 60 s, sized from `Retry-After`,
   clamped 15-300 s, override with `GEMINI_RATE_LIMIT_COOLDOWN_SECONDS`). While it is set, every route skips
   Gemini immediately. Redis failures never extend it.
3. **Fail closed.** If the per-IP limiter or budget store is missing, slow or erroring, paid providers are
   not called (`RATE_LIMIT_STORE_UNAVAILABLE` / `BUDGET_STORE_UNAVAILABLE`). Local, cached and deterministic
   results still work. Applies to `age-lookup`, `refine-serial-date`, `lkq-lookup`, `smart-query-interpret`,
   `smart-query-general`, `assistant-chat`, `lkq-compare`. The native Gemini path no longer bypasses the
   budget store.
4. **Refinement gate** (`lib/serial-refinement/refinement-gate.js`). `/api/refine-serial-date` skips paid
   research when one candidate is left, or when official-quality local evidence with a *closed* start/end
   window already brackets the candidates. Open-ended ranges, medium/low confidence and unresolved decodes
   still research. The browser already only calls the endpoint for ambiguous decodes (candidates > 1 and a
   model entered); the Retry button sends `trigger: "retry"`.

## Error codes

| Code | Meaning |
|---|---|
| `RATE_LIMIT` | our per-IP limiter denied the request |
| `PROVIDER_RATE_LIMIT` | the provider (Gemini) returned 429 and no alternate provider produced a result |
| `RATE_LIMIT_STORE_UNAVAILABLE` | limiter store down; paid research refused |
| `BUDGET_STORE_UNAVAILABLE`, `GLOBAL_BUDGET_EXHAUSTED` | unchanged |

## Telemetry (no raw queries, serials, IPs, keys or bodies)

* `provider_attempt` log line per paid HTTP attempt: `requestId, route, queryHash, provider, model,
  attemptNumber, providerStatus, httpStatus, fallbackReason, resultSource, cacheStatus,
  backgroundRefinementTriggered, refinementTrigger, inputTokens, outputTokens, thinkingTokens, durationMs`.
  `providerStatus` is one of `ok | rate_limited | server_error | timeout | network_error | malformed | http_error | error`.
  `queryHash` hashes the canonical query (refine: brand+model only, never the serial).
* The request log line (`smart_age_lookup`, `serial_refinement`) carries the roll-up: `providerAttemptCount`
  (`actualProviderAttemptCount` on age), `geminiAttemptCount`, `groqAttemptCount`, `providerRateLimitCount`,
  `fallbackAttemptCount`, `attemptModels`, `inputTokens`, `outputTokens`, `geminiCooldownActive`, `day`;
  refine adds `refinementGateSkipReason`, `refinementTrigger`, `backgroundRefinementTriggered`.
* **Counts are real HTTP attempts.** Providers report their own attempts (Gemini, Groq, the native
  flash-lite call, the shared-evidence extraction, the grounded refinement search), including failed native
  calls that fall through and calls still in flight when the route deadline fires.

## Daily aggregate (Redis)

Vercel runtime logs on this project are kept about an hour, so per-day questions are answered from one Redis
hash per UTC day, `provider-usage:v1:<YYYY-MM-DD>` (45-day TTL): `route|provider|model|calls`,
`...|status:<s>`, `...|in_tokens|out_tokens|think_tokens`, `route|fallback:<reason>`, `route|event:<name>`
(`paid_lookup`, `gate_skip:*`, `cache_hit`, `rate_limited`, `rate_limit_store_unavailable`,
`gemini_cooldown_skip`, `retry`).

```
node --env-file=.env.local scripts/report-provider-usage.mjs [YYYY-MM-DD ...]
```

prints, per route: provider calls (Gemini share), calls per paid lookup, 429 rate, fallback rate,
refinement rate (refine), model usage and tokens. Read-only. Not aggregated: locally-resolved refinements
(no Redis client is created on that path by design).

### Failure diagnosis counters

Added so a failing provider can be diagnosed from the daily hash instead of a one-hour log window. All are
extra fields under the same `route|provider|model|` prefix; none changes an existing field.

| Field | Meaning |
|---|---|
| `http:<code>` | HTTP status of a **non-ok** attempt (e.g. `http:400`, `http:503`, `http:429`). Absent when no response arrived (timeouts, network errors). Named `http:` rather than `status:http_error:<code>` because the summary treats every `status:` field as a failure total |
| `dur:<status>:<bucket>` | attempt latency per outcome; buckets `lt1s, 1-2s, 2-3s, 3-4s, 4-5s, 5-6s, 6-7s, 7-8s, 8-10s, 10-13s, ge13s` (`lib/smart-lookup/provider-diagnostics.js`) |
| `cap_hit` / `timeout_route_limited` | a timeout where the stage cap was the binding limit vs. remaining route time |
| `usable_yes` / `usable_no` | whether a usable response was received (OpenAI stage) |
| `rem:<bucket>` | route budget left when the stage began (OpenAI stage) |

The heavy-provider (OpenAI/xAI) stage cap is `SMART_LOOKUP_HEAVY_PROVIDER_TIMEOUT_MS`. Default **6500**.
Only a plain positive integer is accepted (anything else uses the default) and it is clamped to 2000-12000.
The stage is still bounded by the remaining route deadline, so the route's 15 s limit is unchanged.

The report's section 10 prints, per provider/model, outcome counts, the HTTP status of failures, latency
buckets with the median bucket, and cap-hit / usable-response / budget-at-start for OpenAI. Counters only exist
for attempts made after this change; earlier days print "none recorded". Only categorical values and numbers
are stored: never a response body, query, key or header.

## Known limits

* `assistant-chat` and `lkq-compare` log their attempts and update the aggregate but do not use the cooldown
  (they have no fallback provider); a provider 429 is returned as `PROVIDER_RATE_LIMIT`, not retried.
* Refine has only the per-IP limiter (10/min); there is no daily budget for it yet.
