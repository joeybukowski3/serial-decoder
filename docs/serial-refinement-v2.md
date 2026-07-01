# Serial Date Refinement v2

This subsystem narrows repeating serial-year cycles without replacing the rule-based serial decoder.

## Safety rule

The final year is deterministic:

```text
remainingCandidateYears = serialCandidateYears ∩ defensibleModelWindow
```

A year is selected only when the intersection contains exactly one serial-valid candidate. Multiple candidates remain ambiguous, no overlap is a conflict, and unavailable or insufficient evidence preserves the original candidates.

The subsystem never uses a range midpoint, nearest-year selection, current-year bias, a representative family-prefix year, or uncited model output to select a year.

## Components

- `lib/serial-refinement/normalize-model.js` preserves exact model suffixes and exposes unvalidated transcription alternatives.
- `lib/serial-refinement/candidate-intersection.js` contains the pure decision engine.
- `lib/serial-refinement/evidence-policy.js` enforces official or independent-secondary evidence thresholds.
- `lib/serial-refinement/local-evidence.js` reads exact structured records from `data/model-age-db.json`.
- `lib/serial-refinement/provider.js` performs one optional Gemini Google Search grounded lookup.
- `api/refine-serial-date.js` validates, caches, times, logs, and returns the structured result.
- `src/browser/serial-refinement-controller.js` renders the serial result first and refines it in the background.

## Browser build

```bash
npm run build:browser
```

The readable controller source is committed under `src/browser`. Terser creates `serial-refinement-controller.js`. The production build regenerates the bundle, generates SEO pages, and injects the controller after the legacy runtime.

## Tests

```bash
npm test
npm run test:playwright
```

Routine tests mock Redis and Gemini. They never make paid grounded-search calls.

## Environment

The endpoint reuses:

- `GEMINI_API_KEY`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Optional:

- `GEMINI_GROUNDED_MODEL` (defaults to `gemini-2.5-flash`)

Without Gemini configuration, exact local evidence and cached results continue to work; otherwise the endpoint returns `unavailable` and the browser keeps the serial-only result.
