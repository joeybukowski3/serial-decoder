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

## Cache ordering

Local and deterministic paths return before Redis. Cache reads occur before provider rate limiting. Identical in-flight provider requests are checked before provider rate limiting so concurrent duplicate requests share one paid provider call and one limiter operation. Cache keys are canonical and versioned.

## Rate-limit and Redis-outage policy

Provider rate limiting is cost-aware. If the Redis-backed limiter is unavailable or times out, the route fails open for eligible provider work rather than blocking all Smart Lookup usage. Local and cache paths never consume provider limiter capacity.

## Provider behavior

Providers are bounded, mocked in tests, and never used for local validation. Provider output is treated as ungrounded unless backed by structured local evidence. Malformed, unrelated, reversed, future, or impossible output becomes a safe unavailable response.

## Date semantics

Smart Lookup does not calculate midpoint years. Model data may expose `introductionYear`, `productionRange`, and, only with unit-specific evidence, `individualManufactureYear`. Introduction may precede production availability. An individual manufacture date requires a serial number or equivalent unit-specific evidence.

## Replacement semantics

LKQ replacement models must come from structured evidence or validated provider output. The system does not fabricate current-generation LG successors. Returned brand, model, and category must remain compatible with the requested item. Partial inputs remain partial and are not silently completed to exact model numbers.

## Pricing limitations

Provider-only price and retailer claims are volatile and unverified. Ungrounded prices are marked unavailable and retailers are marked not verified. Stable successor identity is separated from volatile price and availability context.

## Build commands

- `npm run build:browser` builds the Serial Refinement controller.
- `npm run build:smart-browser` builds the Smart Lookup controller.
- `npm run build` runs both browser builds and the existing injection step.

## Tests

Smart Lookup tests include Node unit tests, API handler tests with mocked Redis/providers, Playwright browser behavior tests, and mocked benchmark tests. Existing Serial Refinement browser tests remain under `npm run test:playwright`.

## Benchmarks

Mocked benchmark coverage measures local hit, cache hit, provider success, provider timeout, Redis timeout, replacement disabled, replacement enabled, and concurrent identical request scenarios. No live provider calls are made.

## Rollout and rollback

Roll out by pushing this branch after local validation and owner approval. Roll back by reverting the Smart Lookup controller/build/page integration and API changes, leaving the previous legacy `script.js` runtime untouched.
