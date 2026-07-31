# Serial Date Refinement v2

Serial Date Refinement v2 narrows repeating serial-year cycles without replacing the rule-based serial decoder. The browser always renders the serial decoder's valid candidates first. Model evidence is then evaluated in the background and may eliminate impossible cycles, but it may never invent a manufacture year.

> **Phase 2 production hardening:** see [serial-refinement-production-hardening.md](./serial-refinement-production-hardening.md) for mode routing (`deterministic_serper` preferred), budgets, failure taxonomy, cache TTLs, canary commands, and the production mode-switch / rollback runbook.

## Deterministic exact-year rule

```text
remainingCandidateYears = serialCandidateYears ∩ defensibleModelWindow
```

A year is selected only when this intersection contains exactly one serial-valid candidate.

- One remaining candidate: `resolved` and `chosenYear` is that candidate.
- Multiple remaining candidates: `ambiguous`; no year is selected.
- No overlap: `conflict`; the original serial candidates remain visible for review.
- Missing, weak, malformed, timed-out, or rate-limited evidence: `unavailable`; the original serial candidates are preserved.

The v2 path does not use a range midpoint, nearest-candidate selection, newest-year preference, current-year bias, broad model-family representative year, or uncited model output to select a year.

## Request contract

`POST /api/refine-serial-date`

```json
{
  "brand": "Whirlpool",
  "category": "appliances",
  "serial": "TRD3481274",
  "model": "WMH31017HS12",
  "candidateYears": [1994, 2024],
  "decodedMonth": "Week 48",
  "context": "optional user context"
}
```

Validation limits:

- `brand`: required, maximum 80 characters.
- `category`: required after normalization, maximum 40 characters.
- `serial`: required, maximum 80 characters.
- `model`: required, maximum 120 characters.
- `candidateYears`: 1–12 unique integer years between 1800 and 2200.
- `decodedMonth`: optional, maximum 80 characters.
- `context`: optional, maximum 300 characters.

Malformed requests receive HTTP 400. Non-POST requests receive HTTP 405. Valid refinement attempts return HTTP 200 with a structured result, including unavailable and rate-limited outcomes, so the browser can preserve the serial-only result.

## Response contract

```json
{
  "status": "resolved",
  "candidateYears": [1994, 2024],
  "remainingCandidateYears": [2024],
  "chosenYear": 2024,
  "confidence": "high",
  "resolutionBasis": "serial-plus-model",
  "modelProductionRange": { "start": 2023, "end": 2025 },
  "modelNormalization": null,
  "evidence": [],
  "summary": "Serial decoding produced 1994, 2024. Model evidence eliminates the other serial-valid cycles and leaves 2024.",
  "cacheStatus": "bypass",
  "provider": "local-db",
  "timings": {
    "localMs": 1,
    "cacheMs": 0,
    "onlineLookupMs": 0,
    "totalMs": 1
  },
  "errorCode": null
}
```

`chosenYear` is non-null only for `resolved`, and a resolved response must contain exactly one matching `remainingCandidateYears` value. A conflict has no remaining candidates. Other statuses always have `chosenYear: null`.

## Evidence thresholds

Evidence is normalized before deterministic intersection.

A model window is sufficient when either condition is met:

1. At least one cited official source supports a usable production or availability boundary.
2. At least two independent cited strong-secondary sources support compatible boundaries.

Heuristic-only evidence, missing citations, one secondary source, or conflicting evidence cannot select an exact year. Release, manual-publication, retailer, and review dates are treated as boundaries, not proof of an individual item's manufacture date.

## Local evidence

`lib/serial-refinement/local-evidence.js` reads exact structured records from `data/model-age-db.json`.

- Complete model revisions are preserved.
- Broad prefixes and trimmed aliases do not behave as exact records.
- Legacy family ranges may be displayed as heuristic context but cannot independently resolve a year.
- O→0 and I→1 transcription alternatives are disclosed and used only when the alternative matches a complete known structured model record.
- Exact sufficient local evidence returns before Redis, rate limiting, or any remote provider call.

## Grounded lookup

When local evidence is insufficient and no valid cache entry exists, the endpoint may make one Gemini Google Search grounded request through `lib/serial-refinement/provider.js`.

The provider is asked only for evidence-backed availability or production boundaries. It does not choose the final year. Returned JSON and grounding citations are validated locally; deterministic code performs the candidate intersection. Provider output labeled official is downgraded unless its grounded source identity and evidence type support that classification.

The subsystem does not call `/api/smart-query-interpret` or `/api/age-lookup`.

Live Gemini grounding is intentionally not exercised by automated browser tests. Tests use mocked cited evidence and verify that no browser request reaches Gemini or Groq.

## Timeouts

- Browser refinement request: 9 seconds.
- Endpoint total budget: 8 seconds.
- Grounded provider budget: 6.5 seconds.

Timeouts return `unavailable` and preserve the original candidates. The endpoint races the provider against its own deadline, including providers that ignore `AbortController`.

## Provider rate limit

The remote grounded lookup is limited to approximately 10 provider-eligible requests per client IP per minute using an Upstash sliding window.

The limit runs only after:

1. local evidence has failed to resolve or conflict;
2. Redis has been checked; and
3. no valid cache hit was found.

Therefore local serial decoding, sufficient local model evidence, and valid cache hits are not blocked by this limit. If Redis or the limiter is unavailable, rate limiting fails open. An exceeded limit returns a safe structured `unavailable` response with `errorCode: "GROUNDING_RATE_LIMIT"`; it does not expose reset timestamps or Redis errors.

## Cache behavior

Cache keys include:

- namespace `serial-refinement:v1`;
- schema version;
- evidence-policy version;
- normalized brand and category;
- complete compact model value;
- sorted serial candidate years; and
- decoded period.

TTL policy:

- high-confidence official evidence: 60 days;
- medium-confidence independent secondary evidence: 10 days;
- unavailable, malformed, weak, conflicting, or rate-limited results: not cached.

Redis failures fail open. Cached responses are revalidated against the response invariant and current candidate list before use.

## Progressive browser behavior

`src/browser/serial-refinement-controller.js` wraps the existing serial flow rather than replacing the decoder rules.

1. The serial decoder renders its candidates immediately.
2. Estimated age remains hidden while multiple candidates remain.
3. The controller starts one background refinement request when a complete model is present.
4. Identical in-flight requests are deduplicated.
5. Category, brand, serial, model, era, or context changes invalidate and abort stale work.
6. The legacy summary renderer is allowed to rebuild its markup first; the controller then restores the current loading/result view, unhides the refinement panel, and removes the legacy `serial-no-refine` hiding class.
7. Resolved, ambiguous, conflict, unavailable, Retry, and Evidence used views remain visible after later legacy summary rerenders.
8. Timeout or failure preserves the original candidates and shows Retry.
9. The automatic flow and the manual Narrow the Date form use the same endpoint and controller.

The readable source is the authoritative file. `serial-refinement-controller.js` is generated and must not be edited manually.

## Browser build and HTML injection

```bash
npm run build:browser
npm run build:inject
npm run build
```

- `build:browser` minifies the readable source with Terser.
- `build:inject` adds the controller after the legacy `script.js` only on HTML pages that contain both `#serial` and `#decodeBtn`.
- Injection is idempotent and skips pages already containing the tag.
- The default production build is intentionally limited to the controller build and decoder-page injection. SEO regeneration remains an explicit `npm run build:seo` task so refinement builds do not rewrite unrelated pages or the sitemap.

## Tests

```bash
npm ci
npm run build
npm test
npm run test:unit
npm run test:api
npm run test:playwright
```

`npm test` runs the complete decoder regression, refinement unit, and API suites. The Playwright command runs the existing decoder smoke suite and the dedicated serial-refinement suite in Microsoft Edge. Browser tests intercept `/api/refine-serial-date`, reject unexpected application/provider calls, and assert no unexpected console or page errors.

CI also runs the focused production build twice and requires `git diff --exit-code` after each run to prevent generated drift or duplicate controller tags.

## Environment variables

Required for remote grounding:

- `GEMINI_API_KEY`

Required for shared cache and distributed provider rate limiting:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Optional:

- `GEMINI_GROUNDED_MODEL` — defaults to `gemini-2.5-flash`.

Without Gemini configuration, sufficient local evidence and valid cached results still work. Otherwise the endpoint returns a safe unavailable result. Without Redis configuration, cache and distributed limiting are bypassed and the request fails open to the configured provider.

## Known limitations

- Live paid Gemini Google Search grounding is not part of automated validation and requires separate authorization before a production test.
- Local structured evidence is intentionally limited to records that have been explicitly migrated and reviewed.
- Rheem `RHA251405618` remains governed by the existing decoder behavior; the v2 change does not introduce a new authoritative Rheem rule.
- Legacy minified model heuristics may remain in `script.js`, but the v2 controller replaces the global serial model resolver and bypasses the affected Frigidaire/Electrolux model argument path. They are retained to avoid a broad unrelated rewrite.
- A release or support-literature window can eliminate impossible cycles, but it is not proof of an individual item's exact manufacture date unless the serial candidate intersection leaves exactly one year.
