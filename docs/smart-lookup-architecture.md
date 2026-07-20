# Smart Lookup Architecture

## API call graph

Browser Smart Lookup submits a normalized query to `/api/age-lookup`. If replacement research is enabled, it also submits the same query to `/api/lkq-lookup`. Query interpretation and broad query research use `/api/smart-query-interpret` and `/api/smart-query-general` when the legacy runtime routes a query through those paths.

`age-lookup` flow: validate request, classify query, run local model evidence, run guarded HVAC serial heuristics only when the input has serial intent, run deterministic broad results, read versioned Redis cache and decoder-verified evidence, reuse an identical in-flight provider request when present, rate limit only the first provider invocation, validate provider output, return, and write cache asynchronously when budget remains.

`lkq-lookup` flow: validate request, classify query, read versioned Redis cache, reuse identical in-flight provider request when present, rate limit only the first provider invocation, validate structured provider output for requested brand/model/category compatibility, return, and write cache asynchronously when budget remains.

`smart-query-general` flow: validate request, classify query, return deterministic broad results when possible, read guarded Redis, reuse identical in-flight provider requests, rate limit only the first provider invocation, normalize the provider payload, and return a safe fallback on timeout or malformed output.

## Browser call graph

`src/browser/smart-lookup-controller.js` is the readable source. `npm run build:smart-browser` produces `smart-lookup-controller.js`. Both `index.html` and `smart-lookup.html` load the controller after `script.js` so legacy helpers exist first. The controller owns submit interception, request cancellation, stale response rejection, age rendering, replacement rendering, and retry controls.

## Deadlines

API routes use `createDeadline` with route-level total budgets and smaller stage budgets for Redis, provider, and cache writes. Deadline racing protects responses even when Redis, rate limit, or provider operations ignore `AbortController`.

Gemini and Groq share the same route-level deadline. A Groq fallback never receives a fresh total timeout. A Gemini request that consumes its timeout budget does not start a second Groq timeout chain.

## Cache ordering

Local and deterministic paths return before Redis. Cache reads occur before provider rate limiting. Identical in-flight provider requests are checked before provider rate limiting so concurrent duplicate requests share one paid provider call and one limiter operation. Cache keys are canonical and versioned.

## Rate-limit and Redis-outage policy

Provider rate limiting is cost-aware and has two layers:

- Per-IP/minute limits continue to smooth individual traffic bursts.
- UTC daily global provider budgets cap paid provider work across all direct API and browser callers.

Local, deterministic, verified-model, and cache-hit paths never consume provider limiter or global provider budget capacity. Identical in-flight provider requests share one logical global budget reservation. Groq fallback attempts are tracked as additional actual provider attempts, while the logical lookup remains one user lookup.

If Redis is unavailable after local/cache/static paths miss, paid provider work fails closed with a retryable service-capacity response instead of making uncontrolled Gemini or Groq calls. The public response does not expose quota counts, Redis errors, API keys, or internal infrastructure details.

Provider budgets are keyed by UTC date and do not include query, serial, model, or notes content. Configure daily caps with:

- `SMART_LOOKUP_AGE_DAILY_LIMIT` for age lookup logical provider requests;
- `SMART_LOOKUP_LKQ_DAILY_LIMIT` for LKQ lookup logical provider requests;
- `SMART_LOOKUP_COMBINED_DAILY_LIMIT` for the combined Smart Lookup logical provider budget.

## Provider behavior

Gemini remains the primary Smart Lookup provider. Groq is a short, bounded fallback for immediate Gemini failures that leave enough time inside the original deadline. Eligible primary failures are:

- missing Gemini configuration when Groq is configured;
- Gemini HTTP 429;
- Gemini HTTP 5xx;
- invalid Gemini response JSON;
- empty Gemini output;
- malformed Gemini model JSON.

Network failures and full Gemini stage timeouts do not automatically start Groq, preventing a full sequential timeout chain.

Groq uses the OpenAI-compatible chat-completions endpoint with JSON mode. The default production model is `openai/gpt-oss-20b`; it can be overridden with `GROQ_MODEL`.

Required production configuration:

- `GEMINI_API_KEY` for the primary provider;
- `GROQ_API_KEY` for the fallback provider;
- optional `GROQ_MODEL` to override the default Groq production model.

The provider orchestration attaches internal metadata identifying whether Gemini or Groq produced the response and whether fallback occurred. This metadata is available to API routes for source-aware telemetry without logging raw queries or API keys.

Providers are bounded, mocked in tests, and never used for local validation. Provider output is treated as ungrounded unless backed by structured local evidence. Malformed, unrelated, reversed, future, or impossible output becomes a safe unavailable response.

## Grounded age research (optional)

Setting `SMART_LOOKUP_GROUNDED_AGE=1` (also accepts `true`/`on`; default off) switches the age-lookup Gemini call to Google Search grounding for exact-model queries only. Grounding never runs for partial, brand-only, generic, product-family, local-hit, decoder-verified, cache-hit, deterministic, rate-limited, budget-exhausted, or Redis-outage paths — those keep their existing behavior and never consume grounded capacity.

Because the Gemini API rejects `responseMimeType: application/json` combined with the `google_search` tool, grounded calls request plain text, instruct JSON-only output, strip optional code fences, and parse. Citations are read exclusively from the response `groundingMetadata` (`groundingChunks[].web.uri/title`) on the server; model-authored JSON can never inject sources. A grounded response with zero retrieved sources is downgraded to `gemini-ungrounded` so citations cannot be fabricated.

Grounded results carry `evidenceSource: "gemini-grounded"`, a `sources` array (max 5 entries of title/domain/redirect URI), and a `retrievedAt` ISO timestamp. The browser renders a "Web sources consulted" list and a grounded source qualifier with the retrieval date. Grounded results share the existing route deadline, per-IP limiter, daily global budgets, and in-flight request sharing; the grounded Gemini attempt occupies the same chain slot as the closed-book Gemini attempt, and the bounded Groq fallback (always ungrounded) is unchanged, so no second timeout chain exists.

Non-timeout grounded failures (HTTP 400/429/5xx, malformed or empty JSON, missing configuration) are already resolved inside `callGeminiWithGroqFallback`'s existing bounded Groq path before they can surface to `api/age-lookup.js`, and continue to fall back exactly like closed-book Gemini failures.

### Grounded-timeout fallback

A grounded call that exceeds its own stage timeout previously had no fallback at all — `deadline.run`'s `SmartLookupTimeoutError` is not a `SmartLookupProviderError`, so the internal Groq eligibility check never triggered, and the request went straight to the standard timeout response even when most of the route deadline remained unused. Because the grounded stage was allowed to consume nearly the entire remaining budget before timing out, there was also no time left for any recovery even if one had existed.

The grounded stage is now bounded below the full provider ceiling (`GROUNDED_STAGE_BUDGET_MS`, 4200ms) so a genuine reserve remains. On a grounded stage timeout specifically:

- if at least `GROUNDED_FALLBACK_MIN_REMAINING_MS` (1200ms) remains after the required reserve, one bounded closed-book (ungrounded) Gemini call runs with whatever time is actually left — reusing the same route deadline, the same daily budget reservation, and the closed-book call's own existing internal Groq eligibility if that call itself immediately fails;
- if less than that remains, the existing safe timeout response is preserved unchanged;
- the grounded attempt is never retried, and a fallback result is always cached and labeled under ungrounded semantics (never as `gemini-grounded`).

A successful recovery is marked `groundedFallback: true` on the result (server-derived on the returned provider value, not just request-local state, so a concurrent request sharing the same in-flight provider call is labeled correctly too) and rendered with distinct wording: "AI-assisted model research completed, but live web verification timed out. Review this as an estimate rather than a source-verified finding." — never the grounded-specific "grounded in live Google Search," "Web sources consulted," or any source links, since a recovered result by definition has no real citations.

Age cache schema is `v5`; grounded and ungrounded modes use distinct cache keys (`g1`/`g0` identity marker) so flipping the flag never serves one mode's cache to the other. Grounded results cache for 7 days and retain their stored `retrievedAt`. Google Search grounding billing: the paid tier includes 1,500 grounded prompts per UTC day for `gemini-2.5-flash` before per-query charges; the existing combined daily budget (default 180) keeps usage inside that free allotment. Roll back by removing the env flag — behavior returns to closed-book Gemini with the previous validation and wording.

## Date semantics

Smart Lookup does not calculate midpoint years. Model data may expose `introductionYear`, `productionRange`, and, only with unit-specific evidence, `individualManufactureYear`. Introduction may precede production availability. An individual manufacture date requires a serial number or equivalent unit-specific evidence.

## Replacement semantics

LKQ replacement models must come from structured evidence or validated provider output. The system does not fabricate current-generation LG successors. Returned brand, model, and category must remain compatible with the requested item. Partial inputs remain partial and are not silently completed to exact model numbers.

### Grounded LKQ research (optional)

Setting `SMART_LOOKUP_GROUNDED_LKQ=1` (also accepts `true`/`on`; default off) switches `/api/lkq-lookup` to Google Search grounding for exact-model queries only, using the exact same eligibility rule, timeout-safe fallback chain, and text-mode JSON parsing already proven for grounded age research (`lib/smart-lookup/provider.js`'s `extractJsonFromText`/`parseGroundingSources` are shared, not duplicated).

Identity comes before pricing: the grounded prompt requires the model to identify the original item, find the best-supported replacement candidate, compare specifications, and classify the replacement relationship *before* gathering price evidence, and price observations are only ever trusted (`priceObservations`, `replacementCostRange`) when the result actually ended up grounded (`manufacturer-grounded` / `retailer-grounded` / `mixed-grounded`) -- an ungrounded or timeout-recovered result never carries price data regardless of what the provider text claims.

Replacement relationship values: `direct-successor`, `same-series-successor`, `functional-equivalent`, `similar-alternative`, `none-found`. A `direct-successor` claim requires at least one grounded source whose domain has the original brand's own normalized name as an exact dot-separated label (e.g. `lg.com`, not a substring match, to avoid false positives like "walgreens.com" for brand "LG"); lacking that evidence, the claim is downgraded to `same-series-successor` rather than rejected. A malformed or partial replacement model token is dropped (never trusted) and, if the relationship implied a specific successor, downgraded to `functional-equivalent`. A replacement in a different product category is rejected outright (`REPLACEMENT_CATEGORY_MISMATCH`), matching the existing `UNRELATED_CATEGORY` check on the original item.

Compatibility values: `likely-compatible`, `compatible-with-caveats`, `not-directly-compatible`, `unknown` -- never guessed; a missing critical specification stays `unknown` rather than being inferred.

Evidence-source values: `manufacturer-grounded`, `retailer-grounded`, `mixed-grounded` (computed server-side from which source domains matched the brand, never trusted from provider JSON), `gemini-ungrounded`, `groq-ungrounded`, `static`, `none`. A grounded classification with zero retrieved sources downgrades to the matching ungrounded label, exactly like the age contract.

Grounded LKQ research is bounded below the full provider ceiling (`GROUNDED_LKQ_STAGE_BUDGET_MS`, 5000ms -- larger than age's 4200ms because a single LKQ pass covers original identity, replacement identity, compatibility, and pricing, not just a date) so a genuine reserve remains for a same-deadline, same-budget-reservation ungrounded fallback on a stage timeout (`GROUNDED_LKQ_FALLBACK_MIN_REMAINING_MS`, 1500ms). The outer `lkq-provider-result-wait` wrapper tracks the true remaining route deadline for grounded requests (not a `providerBudgetMs`-sized sub-ceiling), applying the same nested-timeout fix already shipped for grounded age research from the start, rather than reintroducing that bug class. A successful fallback recovery is marked `groundedFallback: true` on the shared resolved provider value itself (not just request-local state), so a concurrent request sharing the same in-flight promise is labeled correctly too.

## Pricing rules

Pricing is evidence-based and computed server-side from validated `priceObservations`, never trusted directly from provider JSON. Each observation requires an identifiable seller and a numeric price; entries matching accessory/part/warranty/installation-only/refurbished/used/open-box keywords are dropped. Default is new-condition only. A `replacementCostRange` is produced only when at least two same-currency new-condition observations exist, or exactly one observation explicitly labeled as a manufacturer/official/MSRP price -- a single ordinary retailer observation renders as an observation, never a range, and mixed currencies never merge into one range.

## Pricing limitations

Provider-only price and retailer claims are volatile and unverified. Ungrounded prices are marked unavailable and retailers are marked not verified. Stable successor identity is separated from volatile price and availability context. The identity/pricing cache split considered in the LKQ grounding design was not implemented: a single cache entry keeps the added Redis round-trips and invalidation surface low for this feature's first version, with the TTL itself already capped low (3 days) whenever price observations are present so stale pricing does not persist long; this can be revisited if production traffic shows the identity portion is disproportionately expensive to re-research every few days.

## Build commands

- `npm run build:browser` builds the Serial Refinement controller.
- `npm run build:smart-browser` builds the Smart Lookup controller.
- `npm run build` runs both browser builds and the existing injection step.

## Tests

Smart Lookup tests include Node unit tests, API handler tests with mocked Redis/providers, provider fallback tests, Playwright browser behavior tests, and mocked benchmark tests. Existing Serial Refinement browser tests remain under `npm run test:playwright`.

Provider fallback tests verify:

- Gemini remains primary;
- eligible immediate Gemini failures invoke Groq;
- Groq uses the expected endpoint, authorization header, model, and JSON mode;
- missing Gemini configuration can use Groq;
- a Gemini timeout does not start Groq;
- dual-provider failure returns a bounded aggregate error;
- the original total deadline remains authoritative.

## Benchmarks

Mocked benchmark coverage measures local hit, cache hit, provider success, provider timeout, Redis timeout, replacement disabled, replacement enabled, and concurrent identical request scenarios. No live provider calls are made.

## Rollout and rollback

Before production rollout, add `GROQ_API_KEY` to the Vercel production environment and confirm the optional `GROQ_MODEL` value if the default should not be used. Deploy through the normal `main` branch workflow after tests pass. Roll back by reverting the Groq provider orchestration; Gemini remains independently usable.
