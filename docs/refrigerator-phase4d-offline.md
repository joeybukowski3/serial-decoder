# Refrigerator Phase 4D — offline diagnosis of the failed manual live proof

Scope: offline only. No live requests, no commit, push or deploy. Policies are unchanged: refrigerator capacity floor
`replacement >= original - 0.2 cu. ft.`, strict TV size, refrigerator tier and fit policy, STRONG ranking, and the
exclusion of price, provider rank, search rank and discovery priority from LKQ similarity.

## Live failure being diagnosed

`node scripts/refrigerator-retrieval-proof.mjs --live` (report version 1.1.0): both original searches succeeded, both selected
LG sources fetched HTTP 200 with usable text, yet no original facts were research-supported, the candidate searches never ran
and the report ended with `error: "invalid search request"` and `WEB_RETRIEVAL_UNAVAILABLE`. The live response bodies were not
saved.

## Confirmed and fixed offline

1. **Search handoff.** The supplemental spec search sent the orchestration label `original-spec` as the provider `purpose`.
   `searchProducts` accepts only `original` and `candidate`, so it threw `invalid search request` before any network call.
   `doSearch(text, purpose, role)` now sends only the provider purpose; `role` (`original-spec`, `candidate-spec`) stays in
   the report. Provider validation is unchanged and still rejects any other value.
2. **Layout specificity.** A generic `FRENCH_DOOR` layout from a support page no longer overwrites or ambiguates a
   source-bound `FRENCH_DOOR_3_DOOR` / `FRENCH_DOOR_4_DOOR` layout from the product page, in either source order. The specific
   layout keeps its own provenance; `configuration` and `configurationFloor` stay `FRENCH_DOOR` with both sources. 3-door
   versus 4-door claims still merge to `AMBIGUOUS`.
3. **Reason codes.** Search, fetch, extraction and candidate-search failures are reported separately
   (`SEARCH_FAILED`, `SOURCE_FETCH_FAILED`, `SOURCE_EXTRACTION_FAILED`, `CANDIDATE_SEARCH_FAILED`,
   `ORIGINAL_RESEARCH_INSUFFICIENT`). `WEB_RETRIEVAL_UNAVAILABLE` is only a provider error code in `report.error`, no longer a
   report-level reason code. A partial fetch failure with no evidence now reports `SOURCE_FETCH_FAILED` as well.

## Not proven: why live extraction produced zero facts

When the identity gates pass, `extractRefrigeratorFacts` always returns at least `model` and `brand`, which bind to evidence.
Zero evidence from two HTTP-200 sources therefore means both pages were rejected by an identity gate, in this order:

| Gate | Diagnostic `rejectionReason` |
| --- | --- |
| source URL parses | `INVALID_SOURCE_URL` |
| URL path contains the model | `URL_MODEL_MISMATCH` |
| path is not a category/search/compare page | `GENERIC_PAGE_PATH` |
| `<title>`, `<h1>` or a Product JSON-LD name contains the model | `HEADING_MODEL_MISSING` |
| a visible-text line contains the model | `MODEL_LINE_NOT_FOUND` |
| the title or heading contains "refrigerator"/"fridge" | `TITLE_NOT_REFRIGERATOR` |

Which gate rejected the live pages cannot be determined without the response bodies. Known code-level limits, none proven to
be the cause: the heading gate needs the model in `<title>`/`<h1>` (a title such as "<model> | LG USA" fails the
refrigerator-term gate); Product JSON-LD is only honoured as a single top-level object, not an array or `@graph`
(the TV extractor handles both); `__NEXT_DATA__` specs are lost if the page was truncated mid-script (this affects specs,
not identity). No gate was relaxed.

## Diagnostics added to the proof report (bounded, deterministic, no page bodies)

- `queries[]`: `purpose`, `role`, `ok`, `resultCount`, `error`.
- `fetchResults[]`: `contentType`, `bytesRead`, `textLength`, `bound`, `outcome`
  (`SOURCE_FETCH_FAILED | SOURCE_EXTRACTION_FAILED | FACTS_BOUND`) and `extraction`:
  `rejectionReason`, `pathHasModel`, `genericPath`, `headingCount`, `headingHasModel`, `headingHasRefrigeratorTerm`,
  `titleSample` (160 chars max), `jsonLdBlockCount`, `jsonLdProductCount`, `jsonLdAcceptedCount`, `nextDataPresent`,
  `modelLineFound`, `normalizedTextLength`, `extractedFactKeys`, `extractedFactCount`, `specFactCount`.
- `mergeDiagnostics[]`: `inputSourceCount`, `inputFactCounts`, `outputFactCount`, `ambiguousFactKeys`.

One manual proof with these fields identifies the rejecting gate for each source without re-running live.

## Tests

`tests/lib/refrigerator-retrieval-phase4d.test.mjs` (8 tests). Mutation-checked: reintroducing the role-as-purpose bug,
removing the layout-specificity branches, and reverting the fetch-failure reason each make these tests fail.
