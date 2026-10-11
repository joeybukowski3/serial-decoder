# Refrigerator replacement engine — checkpoint and known limitations

Covers Phases 4 through 4E (profile `refrigerator-lkq` 2.1.0, capacity policy 1.0.0). Offline-tested; one end-to-end live proof
succeeded (LG LRFCS25D3S original; candidates LF25H6200S, LF25Z6211S, LF25G8330S; `RETRIEVED_STRONG`; primary LF25H6200S,
`UNCONFIRMED`/LOW). Per-phase notes: `refrigerator-phase4b-offline.md`, `-4c-`, `-4d-`.

## Phase 4E: search provider diagnostics

`searchProducts` now rethrows failures with a normalized `code` (`SERPER_TIMEOUT` when our own abort fired, else
`SERPER_REQUEST_FAILED`; `SERPER_API_KEY_MISSING` unchanged) and bounded `diagnostics` (error name/message capped at 200
characters with the API key redacted, error/cause codes, `timeoutMs`, `aborted`, `elapsedMs`). Purpose/query validation is
unchanged and still strict. Raw response bodies are never persisted.

## Policy preserved

- Refrigerator capacity floor `replacement >= original - 0.2 cu. ft.` is isolated to the `refrigerator-capacity-minimum`
  comparator; TV size behavior is untouched.
- HARD: capacity, installation type, tier, broad configuration, physical fit when intrinsic/documented. Exact 3-door vs 4-door
  layout is STRONG and never merged away by a generic `FRENCH_DOOR` claim.
- Price, provider rank, search rank and discovery priority do not influence LKQ ranking.

## Known non-blocking limitations (not solved)

- **Installation type** stays `UNKNOWN` when manufacturer evidence does not state it; this alone keeps an otherwise strong
  primary at `UNCONFIRMED`/LOW.
- **Tier** stays `ASSUMED` (`BRAND_CATEGORY_BASELINE`) for refrigerators; there is no verified family-to-tier mapping.
- **Identity gate:** support pages whose title/heading does not contain the model and a refrigerator term are rejected
  (`HEADING_MODEL_MISSING` / `TITLE_NOT_REFRIGERATOR`). Product JSON-LD is only honoured as a single top-level object.
- **PDF spec sheets:** the fetch layer now accepts `application/pdf` and extracts text only from simple (optionally
  Flate-compressed) `Tj`/`TJ` text streams. PDFs that rely on font encodings/ToUnicode maps yield no text, and the retrieval
  path takes no spec facts from PDFs (identity heading only). Treat PDF support as unproven, not as working spec extraction.
  The `Accept` header and content-type allow-list of the shared page fetcher were widened for this, so it is not
  refrigerator-only.
- **Serper timeout:** the 4 s per-request budget can still produce `SERPER_TIMEOUT` under slower conditions. The final live
  proof succeeded only because every stage completed inside its budget; an earlier attempt failed with `fetch failed`.
- Test caveat: `serper-model-search.test.mjs` fails if `SERPER_API_KEY` is set in the shell; run validation with it unset.
