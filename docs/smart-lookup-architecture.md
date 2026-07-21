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

Setting `SMART_LOOKUP_GROUNDED_AGE=1` (also accepts `true`/`on`; default off) switches the age-lookup Gemini call to Google Search grounding for exact-model queries, and — as of the progressive-specificity work below — also for model-line and product-family queries when no local/registry evidence already answers them outright. Grounding still never runs for brand-category, category-only, free-description, unusable, local-hit, decoder-verified, cache-hit, rate-limited, budget-exhausted, or Redis-outage paths — those keep their existing deterministic-only behavior and never consume grounded capacity. Grounded LKQ replacement research (`SMART_LOOKUP_GROUNDED_LKQ`) remains exact-model only; see "Progressive specificity" below for why.

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

## Progressive specificity

Smart Lookup previously classified a query into a binary "have an exact model" / "don't" shape (`specificityLevel`), which left every unrecognized-but-real product (e.g. an unlisted laptop brand) indistinguishable from meaningless input — both fell into `specificityLevel: 'unknown'` and took the same expensive, timeout-prone path with no deterministic fallback. `lib/smart-lookup/normalize.js` now additionally computes `querySpecificity`, a 7-tier taxonomy, alongside (not replacing) the legacy field:

`exact-model` → `model-line` → `product-family` → `brand-category` → `category-only` → `free-description` → `unusable`

`brand-category` merges the legacy `brand-only` case (a category alone, e.g. "washer", is `category-only`; a recognized brand — with or without a category word — is `brand-category`, since the brand is the stronger signal). `unusable` is a new, narrow, deterministic (non-LLM) classification in `lib/smart-lookup/family-registry.js#isLikelyUnusableQuery` — empty input, near-zero letter content, or a very low vowel ratio in the letter content, checked only after brand/category/family/model recognition all failed. It is deliberately conservative (a false "unusable" call would silently block a real query from ever reaching the provider), and it is the only tier where `providerEligible` is `false` for a reason other than "a fast deterministic answer already exists."

### Family/model-line recognition registry

`lib/smart-lookup/family-registry.js` generalizes the pre-existing TV-only `TV_PRODUCT_FAMILY_SEEDS` mechanism (still used unchanged for Samsung Q-series/LG OLED families) into a brand-agnostic, data-driven `GENERAL_FAMILY_SEEDS` array. Each seed is brand- and category-scoped — a bare number or generic word can never match; the distinctive part of `familyPattern`/`modelLinePattern` always requires the brand's own product-name token (e.g. "Nitro 5", not "5") — which is what prevents cross-brand false positives for short family names. A seed can independently define a `familyPattern` (recognizes the family by name, e.g. "Nitro 5"), a `modelLinePattern` (recognizes a generation prefix without the full configuration suffix, e.g. "AN515-58"), and an `exactModelPattern` (recognizes the complete SKU, e.g. "AN515-58-57Y8"); `classifySmartLookupQuery` picks the most specific match available and — critically — overrides the older, brand-independent "hyphen implies exact" heuristic in `modelCompletenessFor` for any query the registry recognizes as a model-line (that heuristic is preserved unchanged for brands without a registry entry, for backward compatibility).

Initial registry coverage and its sourcing basis (kept intentionally conservative — see `lib/smart-lookup/family-registry.js` for full citations and caveats):

| Brand:family | Category | Confidence | Range basis |
|---|---|---|---|
| Acer:nitro-5 (+ AN515 model line) | laptop | medium | Launched 2017, still current; per-generation years (AN515-41 through -58+) are qualitative eras, not independently verified exact boundaries |
| Dell:inspiron-15 | laptop | low | Modern 3000/5000/7000 naming from ~2014, still current; earlier Inspiron 1525/1545/15R generations noted but not modeled |
| Samsung:galaxy-tab | tablet | medium | Family from 2010; Tab A/S/Active split in 2014, still current |
| Whirlpool:cabrio | washer | low | Approximate mid-2000s–early-2020s window; exact start/end years could not be independently source-verified, so no false precision is asserted |
| Trane:xr13 | air conditioner | low | Long-running, currently-sold single-stage line since roughly the mid-2000s; the line has had several marketing-name changes without a clean generational break |

### Degradation ladder (why Acer Nitro 5 no longer times out into nothing)

A recognized product-family/model-line/brand-category query always has a safe, instant, deterministic result (`buildDeterministicBroadResult` → `buildGeneralFamilyResult`/the brand-only branch in `lib/smart-lookup/static-results.js`) computed up front in `api/age-lookup.js`, before any network call. When grounded research is disabled or not eligible for the query's tier, that deterministic result **is** the response — same fast, zero-timeout-risk behavior the deterministic brand-only/generic paths already had, and `fallbackKind` stays `'none'` (this was never a degradation). When grounding is enabled and eligible (`queryInfo.groundedEligible`, true for `exact-model`/`model-line`/`product-family` and, as of the brand-category eligibility work below, a *meaningful* `brand-category` query), the handler instead continues past that point to attempt grounded (falling back to ungrounded, per the existing PR #52/#53 machinery) research within the *same* route deadline — with the deterministic result held in reserve and substituted at every failure point (grounded+ungrounded timeout, rate limit, budget exhaustion, invalid provider output, or total-deadline exhaustion) instead of the generic `createUnavailableSmartAgeResult`. No new timeout budget is introduced anywhere in this path; it reuses the identical deadline/budget primitives PR #52/#53 already established. A degraded result is a live, always-current re-derivation (cheap, no I/O), never a stale cached one, and it is never itself written to cache.

This is what fixes the demonstrated failure: "Acer Nitro 5" now resolves `querySpecificity: 'product-family'`, has a deterministic family card ready immediately, and — even if a grounded attempt is enabled and times out — degrades to that same useful card instead of an empty timeout response.

### Fallback labeling: `fallbackKind`, and why `groundedFallback` alone was not enough

An earlier version of this degradation ladder marked every substituted deterministic result with `groundedFallback: true` — the same flag PR #52/#53 use for a *real* Gemini/Groq closed-book recovery of a timed-out grounded call. That is wrong: the browser reads `groundedFallback: true` as "AI-assisted model research completed, but live web verification timed out," and a purely deterministic, registry-derived result was never produced by any AI call. `normalizeSmartAgeResult` now carries an explicit, additive `fallbackKind` field —

`none | ungrounded-provider | deterministic-model-line | deterministic-family | deterministic-brand-category | clarification`

— and the two concepts are kept strictly separate:

- `groundedFallback: true` + `fallbackKind: 'ungrounded-provider'` — a real Gemini/Groq closed-book call recovered a timed-out grounded attempt (unchanged PR #52/#53 behavior, set in `api/age-lookup.js`'s `providerOptions.fallbackKind = groundedFallbackRecovered ? 'ungrounded-provider' : 'none'`). The browser shows the existing "AI-assisted model research completed..." wording, no sources.
- `groundedFallback: false` + `fallbackKind: 'deterministic-model-line' | 'deterministic-family' | 'deterministic-brand-category'` — the deterministic registry/classification result was substituted after a provider attempt actually failed (set only at the specific substitution points in `api/age-lookup.js` via `degradeToDeterministicFallback()`, never as a blanket default). The browser shows new, distinct, tier-specific wording (e.g. "We recognized this product family, but live research did not finish. This broad timeframe is based on family-level information rather than a source-verified exact-model lookup.") that never claims AI involvement or grounding.
- `fallbackKind: 'clarification'` — the unusable-query result (`buildUnusableResult`); never a researched estimate of any kind.
- `fallbackKind: 'none'` — everything else, including the always-fast deterministic path when grounding was never attempted (not eligible, or the flag is off) and any ordinary grounded/ungrounded provider success.

`src/browser/smart-lookup-controller.js`'s `sourceQualifier()` checks `isDeterministicDegradedResult()` (keyed off `fallbackKind`) before `isGroundedTimeoutFallbackResult()` (keyed off `groundedFallback`), so the two wordings can never be conflated.

Two related schema-level guards close off overclaim paths that only became reachable once brand-category queries could reach a provider at all: `productFamily` in a provider response is trusted only when the deterministic classifier already recognized one (`queryInfo.productFamily` truthy) — a provider can confirm a family, never invent one — and, for a brand-category (`specificityLevel: 'brand-only'`) request, `yearContext` is restricted to broad types (`production-range`, `market-introduction`, `release-year`, `unknown`); a `manufacture-year`/`manufacture-date`/`model-year-family` claim is stripped rather than trusted, since none of those are defensible without an identified model.

### Result schema additions (additive)

`normalizeSmartAgeResult` gained `querySpecificity`, `precisionLevel` (`exact | narrow-range | model-line-range | family-range | broad-range | general-guidance`), `confidenceLevel` (`high | medium | low | unknown`), `fallbackKind` (see above), `recognizedBrand/Category/Family/Series/Model`, `familyRange`/`modelLineRange` (open-ended-safe: `end` may be `null` with `current: true` rather than a synthetic end year), `generationSummary`, `refinementNeeded`/`refinementReason`, and `recommendedIdentifiers`. All are additive; every existing field keeps its prior meaning and validation.

### Cache and prompts

Cache keys (`lib/smart-lookup/cache.js`) now include `querySpecificity`, `familyId`, and `modelLineId` in their identity, so an exact-model, model-line, product-family, and brand-category result for otherwise-identical query text can never collide (`SMART_AGE_POLICY_VERSION` bumped to `model-semantics-3`, `SMART_LKQ_SCHEMA_VERSION` to `v7`). The age grounded/ungrounded prompts (`lib/smart-lookup/provider.js`) gain an additional instruction block — appended only for `model-line`/`product-family`/`brand-category` tiers, so the exact-model prompt text is unchanged — asking for a family/model-line-level range or, for brand-category, only broad known eras/availability periods/common model-number formats, never a selected model or a claimed manufacture year.

### Brand-category grounded eligibility

A *meaningful* brand-category query — both a recognized brand **and** a recognized category (e.g. "Whirlpool top-load washer", "Rheem gas water heater", "Samsung television", "Acer gaming laptop", "Trane heat pump") — is grounded-eligible for bounded research, using the same authoritative route deadline, one logical budget reservation, existing grounded-source validation, and same-deadline degradation behavior as every other tier (`isMeaningfulBrandCategory` in `lib/smart-lookup/normalize.js`). A bare brand with no category (e.g. "Whirlpool" alone) or a bare category with no brand (`category-only`: "refrigerator", "gaming laptop", "washer", "television", "appliance") stays deterministic-only — the audit found no demonstrated benefit from grounding that thin a signal, matching the existing conservative default for `category-only`/`unusable`. `appliance` was added to `GENERIC_CATEGORIES` so it classifies as `category-only` rather than falling through to the (provider-eligible) `free-description` tier.

LKQ grounded eligibility was **not** expanded to brand-category — see "Progressive LKQ specificity" below for what LKQ grounding *was* widened to (model-line and high-confidence product-family), introduced alongside the Dell OptiPlex 9020 fix.

### LKQ interaction

Grounded LKQ replacement research (`SMART_LOOKUP_GROUNDED_LKQ`) was originally exact-model-only (`tests/api/smart-lookup-grounded-lkq.test.mjs`, still valid and passing) and has since been widened to model-line and high-confidence product-family queries — see "Progressive LKQ specificity" below. For non-exact tiers, the closed-book LKQ prompt gains an overclaim guard instructing the model never to name one specific current product as *the* successor to an entire line/family/category, and `lib/smart-lookup/replacement-schema.js` enforces the same rule server-side (downgrading any `direct-successor`/`same-series-successor`/`direct_successor` claim to `similar-alternative`/`none` for `brand-category`/`category-only` queries) so the guarantee holds even if a provider response ignores the prompt. An LKQ failure or downgrade never touches the independent age-lookup result — the two routes share no mutable state.

### Progressive LKQ specificity

The Dell OptiPlex 9020 age result worked ("OptiPlex 9020" is recognizable to a closed-book LLM) while replacement research returned "insufficient information," because `lib/smart-lookup/family-registry.js` had no OptiPlex entry: `classifySmartLookupQuery` fell through to `querySpecificity: 'free-description'`, and the closed-book LKQ overclaim guard told the model "this query identifies only a brand and/or category, not a specific product line" — which was simply false for OptiPlex 9020, so the model complied with the (inaccurate) guard and returned nothing rather than recognizing the line on its own.

`GENERAL_FAMILY_SEEDS` gained three business-computer families (Dell OptiPlex, Lenovo ThinkCentre, HP EliteDesk), generalized with two additions beyond the existing per-seed shape: `dynamicModelLine: true` + `buildModelLineName(match)` derive the model-line id/name from a *captured* line number (e.g. "OptiPlex 9020" → `optiplex-9020`) instead of a fixed id, since these families span many numbered lines rather than one; and `formFactorAware: true` runs a shared, brand-agnostic chassis-hint matcher (`matchFormFactorHint` — SFF/USFF/Micro/MT/Tower) that only ever attaches to a query once one of these seeds already matched, so a stray "MT" elsewhere can never attach a form-factor hint to an unrelated result. None of these seeds define an `exactModelPattern`: a full build is never inferable from a product name and line number alone, so "OptiPlex 9020" (bare, "Dell OptiPlex 9020", or with a form-factor suffix) always resolves to `querySpecificity: 'model-line'`, never `'exact-model'`.

A replacement-specific precision taxonomy (`replacementPrecision`, computed in `normalize.js`, additive alongside the existing age-focused `querySpecificity`) adds a stronger tier above exact-model: `exact-configuration`, `exact-model`, `model-line`, `product-family`, `brand-category`, `category-guidance`, `unusable`. `exact-configuration` requires an exact model *and* user notes mentioning at least two distinct spec categories (CPU/RAM/storage/GPU) — `deriveReplacementPrecision` in `normalize.js` applies this notes-aware upgrade after notes are attached in `api/lkq-lookup.js`, since `classifySmartLookupQuery` itself never sees notes. A bare Dell/Lenovo/HP-style service tag (`isServiceTagIntent`/`looksLikeBareServiceTag`) is never scored as a model token and, alone with no other recognized identity, is treated the same as an unusable query for grounding purposes — it identifies one unit through the manufacturer's own lookup, not a model.

LKQ grounded eligibility (`queryInfo.lkqGroundedEligible`, replacing the old `modelCompleteness === 'exact'` check in `api/lkq-lookup.js`) now covers `exact-model`, `model-line`, and `product-family` *only when the matched family's registry confidence is not `'low'`* — deliberately narrower than age's `groundedEligible`, since naming a replacement product is a stronger claim than an age range. This is why Dell Inspiron 15 (family confidence `'low'`) stays closed-book-only for LKQ grounding while Dell OptiPlex/Lenovo ThinkCentre/HP EliteDesk/Acer Nitro 5 (confidence `'medium'`) qualify.

`lkqOverclaimGuard` in `provider.js` grew a much larger instruction block for `model-line`/`product-family` tiers (shared by both the grounded and ungrounded LKQ prompts): it lists the ten research priorities from original-class identification through refinement guidance, explicitly forbids assuming any spec that was not provided or sourced, forbids `direct-successor` for non-exact original identity, and requests the new JSON fields below. `replacement-schema.js` enforces every one of these server-side (never trusting prompt compliance alone): `downgradeNonExactRelationship` generalizes the old brand-category-only downgrade to *every* non-exact `replacementPrecision` (the top-level `replacementRelationship` and every entry in the new `replacementCandidates` array), and `configurationUnknown` (true whenever identity is not exact) downgrades any `likely-compatible` claim to `compatible-with-caveats` for both the top-level result and each candidate.

New additive schema fields (`replacement-schema.js`): `replacementPrecision`, `originalIdentityLevel` (mirrors `replacementPrecision`), `configurationUnknown`, `originalIdentity` (brand/family/modelLine/category/formFactor), `knownConfigurationVariants`, `comparisonCriteria`, `recommendedMinimumSpecs`, `assumptions` (always has a safe non-provider-authored default when configuration is unknown), `unknownOriginalSpecs`, `recommendedIdentifiers`, `refinementNeeded`, `deterministicFallbackUsed`, and `replacementCandidates[]` (rank/brand/family/model/category/relationship/fitReason/specificationComparison/materialDifferences/compatibilityStatus/compatibilityWarnings/priceObservations — no per-candidate `sources` field; the existing top-level `sources` array, still exclusively grounding-metadata-derived, remains the single citation source of truth).

**Deterministic replacement degradation** (`lib/smart-lookup/replacement-static-results.js#buildDeterministicReplacementResult`, mirroring the existing age-side `buildDeterministicBroadResult` ladder): for any recognized `model-line`/`product-family`/`brand-category` query, `api/lkq-lookup.js` builds this once up front (cheap, no I/O, no provider budget) and substitutes it — via `normalizeDeterministicReplacementResult`, fixed to `source: 'fallback'`, `evidenceSource: 'static'`, no sources, no pricing — at every provider failure point (grounded/ungrounded timeout, rate limit, budget exhaustion, invalid provider output, total-deadline exhaustion) instead of the generic "temporarily unavailable" response. It returns a "raw" object in the same shape a provider response would, so it flows through the exact same `normalizeReplacementResult` validation rather than duplicating any safeguard. Never itself written to cache; never labeled grounded or AI-assisted (`deterministicFallbackUsed: true` on the result, checked by the browser's `isDeterministicLkqFallback` before any other source qualifier).

**Cache identity** (`SMART_LKQ_SCHEMA_VERSION` bumped to `v8`): `replacementPrecision`, `formFactor`, and `serviceTagIntent` now participate in the LKQ cache key identity alongside the existing `querySpecificity`/`familyId`/`modelLineId` components, so "OptiPlex 9020" (bare), "OptiPlex 9020 SFF", "OptiPlex 9020 MT", a generic "OptiPlex" family match, and a service-tag-only lookup can never collide — without the form-factor component specifically, every OptiPlex chassis variant would otherwise share the same numbered `modelLineId` and read/write the same cache entry.

**Browser rendering** (`src/browser/smart-lookup-controller.js`): `classifyReplacementOutcome` now also treats a recognized model-line/product-family/brand-category result with no single named replacement (`replacement: null`, `replacementRelationship: 'none-found'`) as `'success'` when it carries ranked candidates or progressive guidance (`hasProgressiveReplacementGuidance`), instead of falling through to the generic unavailable card. `renderReplacement` renders a precision badge, the recognized original identity, a "configuration varies" note, ranked candidates (with per-candidate relationship/compatibility/pricing), known configuration variants, a comparison checklist, assumptions, unknown-spec list, and refinement identifiers — all gated to non-exact `replacementPrecision` tiers so the existing exact-model rendering path is untouched. `lkqSourceQualifier` checks `isDeterministicLkqFallback` before every other qualifier so a deterministic card is never worded as grounded or AI-assisted.

### Exact-model deterministic reserve

Every specificity tier except `exact-model` had a deterministic reserve. That
inversion was the root cause of the reported production timeouts for
`Samsung QN65Q60RAFXZA` and `LG WM3900HWA`: an exact-model query is
grounded-eligible (and so the most timeout-exposed tier), had no local record,
and had nothing to fall back on — the tier where identity is best known was the
least resilient. Three independent gaps had to close together:

- `buildDeterministicReplacementResult` hard-returned `null` for exact-model, so
  `api/lkq-lookup.js`'s `buildDeterministicFallback() || createUnavailable...`
  always took the unavailable branch.
- `buildDeterministicBroadResult` had no exact-model branch. The age reserve is
  therefore a **separate** `buildExactModelReserveResult`, deliberately not a new
  branch in that function: `buildDeterministicBroadResult` feeds two *fast paths*
  in `api/age-lookup.js` (the "grounding disabled/ineligible, so this IS the
  answer" short-circuit, and the post-local `broadResult` return), and returning
  a card from it would answer every exact-model query without ever consulting the
  local model database or the provider. The reserve is consulted only by
  `degradeToDeterministicFallback()`, i.e. strictly after a provider attempt has
  already failed, so it can never overwrite stronger evidence.
- `hasProgressiveReplacementGuidance` in the browser gated exact tiers out
  entirely, so a server-side reserve alone would still have rendered an empty
  panel. The new branch is gated on `isDeterministicLkqFallback` so the ordinary
  exact-model provider rendering path is untouched.

Both reserves assert strictly less than any provider path: identity only — no
year (`yearContext.type: 'unknown'`), no successor, no pricing, no sources. The
age card is labeled `fallbackKind: 'deterministic-exact-model'` with wording that
never reads as an AI, grounded, or year estimate.

Substituted deterministic cards on both routes now carry the `errorCode` they
stand in for, so a timeout stays attributable in telemetry and retry-gating
rather than looking like a query that never attempted research. Capacity
failures (`RATE_LIMIT`, `GLOBAL_BUDGET_EXHAUSTED`, `BUDGET_STORE_UNAVAILABLE`)
additionally keep their actionable "try again tomorrow" guidance appended, so a
useful card never swallows retry timing.

**Timeout budgets are unchanged.** The grounded LKQ chain was measured
(≈750ms Redis/limiter/budget → 5000ms grounded stage → ≈2900ms for the
same-deadline closed-book fallback, inside a 9000ms route budget and a 10s
Vercel ceiling) and found correctly bounded with a genuine reserve. The defect
was the missing fallback, not the budget sizing, so no timeout was raised and no
second timeout chain was introduced.

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

`tests/smart-lookup/progressive-specificity.test.mjs` and `tests/api/smart-lookup-progressive-specificity.test.mjs` cover the querySpecificity taxonomy, the Acer Nitro 5 regression fixture (family/model-line/exact-model classification, and grounded-timeout degradation to a useful family card), meaningful-brand-category grounded eligibility (Whirlpool/Rheem/Samsung/Acer/Trane examples vs. bare-category/bare-brand non-eligibility), cache-key distinctness across specificity tiers and fallback kinds, schema-level stripping of an invented family or manufacture-year claim in a brand-category response, and the LKQ overclaim guard (including confirmation that LKQ grounding was deliberately not expanded to brand-category). `tests/smart-lookup/progressive-specificity-ui.test.mjs` covers the browser-rendered precision badge, itemized refinement guidance, the `unusable-query`/`brand-category-recognized` outcome buckets, and — critically — that grounded, AI-fallback (`groundedFallback`/`ungrounded-provider`), deterministic-fallback (`fallbackKind: deterministic-*`), and clarification wording are mutually exclusive and never conflated.

`tests/smart-lookup/progressive-lkq.test.mjs` covers the Dell OptiPlex 9020 regression fixture (bare/branded/SFF/MT/USFF/Micro/generic classification, form-factor capture, `modelLineId` distinctness), service-tag safety, the notes-aware `exact-configuration` upgrade, the generalized ThinkCentre/EliteDesk/Inspiron 15/Nitro 5 family behavior, deterministic-fallback content, and LKQ cache-key distinctness across form factor/precision/service-tag-intent. `tests/api/smart-lookup-progressive-lkq.test.mjs` covers the widened grounded-eligibility rule end-to-end (model-line and high-confidence product-family eligible, low-confidence family and bare brand/category not), the non-exact direct-successor downgrade for both the top-level relationship and every `replacementCandidates` entry, ranked same-brand/cross-brand candidates, deterministic degradation on timeout/invalid-output (never consuming an extra budget reservation, never mislabeled grounded), and confirmation that exact-model appliance LKQ, cross-category rejection, Redis fail-closed behavior, and in-flight request sharing are all unaffected. `tests/smart-lookup/progressive-lkq-ui.test.mjs` covers the progressive-guidance success classification, ranked-candidate rendering, the deterministic-fallback wording/no-sources/no-pricing guarantee, and confirms the exact-model rendering path is pixel-identical (no new precision badge or identity block).

## Benchmarks

Mocked benchmark coverage measures local hit, cache hit, provider success, provider timeout, Redis timeout, replacement disabled, replacement enabled, and concurrent identical request scenarios. No live provider calls are made.

## Rollout and rollback

Before production rollout, add `GROQ_API_KEY` to the Vercel production environment and confirm the optional `GROQ_MODEL` value if the default should not be used. Deploy through the normal `main` branch workflow after tests pass. Roll back by reverting the Groq provider orchestration; Gemini remains independently usable.
