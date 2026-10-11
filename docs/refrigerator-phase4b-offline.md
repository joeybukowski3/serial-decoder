# Refrigerator Phase 4B offline audit

This records the Phase 4B result before the refrigerator capacity policy changed. See [Phase 4C](refrigerator-phase4c-offline.md) for the current HARD capacity rule, replay, and live-gate audit.

## Capture validation and fixtures

All four local captures are nonempty LG manufacturer product pages. Each has the requested canonical product URL. The three US pages identify their exact model in the HTML title; the Canada page identifies LF25H6330S in product JSON-LD `name` and `@id` and in its visible breadcrumb. Each page has model-bound refrigerator specifications usable by the shared `extractRefrigeratorFacts` path. No capture was rejected.

| Model | Raw capture bytes | Bounded fixture | Source format |
| --- | ---: | --- | --- |
| LF25G8330S | 1,487,713 | `tests/fixtures/replacement-discovery/lg-lf25g8330s-page.html` | Title, H1, embedded LG specification rows |
| LF25H6200S | 1,401,779 | `tests/fixtures/replacement-discovery/lg-lf25h6200s-page.html` | Title, H1, embedded LG specification rows |
| LF25Z6211S | 1,455,631 | `tests/fixtures/replacement-discovery/lg-lf25z6211s-page.html` | Title, H1, embedded LG specification rows, water-dispenser feature |
| LF25H6330S | 2,162,127 | `tests/fixtures/replacement-discovery/lg-lf25h6330s-page.html` | Canonical URL, product JSON-LD, breadcrumb, visible specification rows |

The fixtures keep each page's real identity and relevant specification structure. The shared extractor produces the same supported fact object from each bounded fixture as from its full capture. The full captures remain under `tmp/phase4b-captures/` and must stay uncommitted. Eventually commit the four bounded fixtures, extractor/test changes, and this audit; exclude all four raw `tmp/phase4b-captures/*.html` files.

## Shared extraction

The original LRFCS25D3S and all four candidates use the same exact-model extractor and binder. The original is 25.2 cu. ft., French 3-door, freestanding, standard depth, no dispenser, single ice maker, 32.875 × 69.875 × 35.5 in. The original's tier is `PREMIUM`, status `ASSUMED`, basis `BRAND_CATEGORY_BASELINE`; this is not a verified product-family tier.

| Candidate | Total cu. ft. | Exact layout | Broad floor | Installation | Counter depth | Dispenser | Ice maker | Width × height × depth (in.) | Tier |
| --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| LF25G8330S | 24.5 | `FRENCH_DOOR_4_DOOR` | `FRENCH_DOOR` | UNKNOWN | Yes | Water and ice | Dual | 35.75 × 70.25 × 32.25 | `PREMIUM`, `ASSUMED`, `BRAND_CATEGORY_BASELINE` |
| LF25H6200S | 25.1 | `FRENCH_DOOR_3_DOOR` | `FRENCH_DOOR` | UNKNOWN | No | UNKNOWN | Single | 32.937 × 69.937 × 35.937 | Same assumed baseline |
| LF25Z6211S | 25.1 | `FRENCH_DOOR_3_DOOR` | `FRENCH_DOOR` | UNKNOWN | Yes | Water | Single | 35.75 × 70.25 × UNKNOWN | Same assumed baseline |
| LF25H6330S | 24.5 | `FRENCH_DOOR_3_DOOR` | `FRENCH_DOOR` | UNKNOWN | No | Water and ice | Dual | 32.9375 × 69.9375 × 35.9375 | Same assumed baseline |

The LF25Z6211S source states 27.5 in. **without handles**. The original's 35.5 in. depth includes handles, so the candidate's comparison depth remains UNKNOWN. The source does not explicitly establish freestanding installation for any candidate. LF25H6200S has a water filter and freezer ice maker but its bounded specification rows do not establish a dispenser type; that fact remains UNKNOWN. LF25G8330S has an abbreviated `STS` color entry, which does not establish a normalized finish, so its finish remains UNKNOWN. Family/series is UNKNOWN for all four. No refrigerator tier mapping was added.

The LF25G8330S H1 and canonical URL identify a 4-door French-door refrigerator. Its exact layout is `FRENCH_DOOR_4_DOOR`; only its broad functional floor is `FRENCH_DOOR`. It is not collapsed into a 3-door exact layout.

## Four-candidate HARD and STRONG replay

The replay used fixture-backed `search` and `fetchPage` callbacks. Both callbacks read local data only; there were zero live requests. It selected one original page and four candidate pages, found four exact-model candidates, and returned `RETRIEVED_STRONG` retrieval quality. HARD capacity compares the stated precision intervals: 25.1 versus 25.2 is `UNVERIFIED`; 24.5 versus 25.2 is `FAIL`. No installation opening dimensions were supplied, so required physical fit is `UNVERIFIED` and every candidate has a `VERIFY_FIT` advisory.

| Rank | Candidate | HARD: capacity / installation / tier / floor / fit | Classification; confidence | STRONG similarity; coverage | Unresolved HARD | Fit advisory |
| ---: | --- | --- | --- | --- | ---: | --- |
| 1 | LF25Z6211S | UNVERIFIED / UNVERIFIED / ASSUMED / MATCH / UNVERIFIED | `UNCONFIRMED`; LOW | 88%; 71.4% | 3 | Verify available space; width and height grow, depth unknown |
| 2 | LF25H6200S | UNVERIFIED / UNVERIFIED / ASSUMED / MATCH / UNVERIFIED | `UNCONFIRMED`; LOW | 100%; 57.1% | 3 | Verify available space; each dimension grows slightly |
| 3 | LF25H6330S | FAIL / UNVERIFIED / ASSUMED / MATCH / UNVERIFIED | `NOT_LKQ`; LOW | 76%; 71.4% | 2 | Verify available space; each dimension grows slightly |
| 4 | LF25G8330S | FAIL / UNVERIFIED / ASSUMED / MATCH / UNVERIFIED | `NOT_LKQ`; LOW | 60%; 64.3% | 2 | Verify available space; width and height grow |

STRONG detail against the original:

| Candidate | Exact layout | Counter depth | Capacity balance | Dispenser | Ice maker | Finish | Brand | Family/series |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| LF25Z6211S | MATCH | BETTER | UNKNOWN | DIFFERENT | MATCH | MATCH | MATCH | UNKNOWN |
| LF25H6200S | MATCH | MATCH | UNKNOWN | UNVERIFIED | MATCH | MATCH | MATCH | UNKNOWN |
| LF25H6330S | MATCH | MATCH | UNKNOWN | DIFFERENT | DIFFERENT | MATCH | MATCH | UNKNOWN |
| LF25G8330S | DIFFERENT | BETTER | UNKNOWN | DIFFERENT | DIFFERENT | UNVERIFIED | MATCH | UNKNOWN |

`capacityBalance` is UNKNOWN in the current evaluator despite known compartment capacities; no new derived fact was invented for this replay. `featurePackage` is also UNKNOWN for all four.

## Ranking audit

LF25Z6211S ranks above LF25H6200S because its weighted similarity score is 53.4 versus 48.6. It has a known water dispenser difference, but its additional known STRONG evidence raises overall weighted score and coverage. LF25H6200S has higher similarity among the STRONG facts that are known; its dispenser remains unresolved. The 24.5 cu. ft. LF25H6330S and LF25G8330S follow because each has one known HARD capacity failure. Between those two, LF25H6330S wins on STRONG similarity (76% versus 60%): its exact 3-door layout and standard depth match, while LF25G8330S has a distinct 4-door layout and unresolved finish.

Adjacent ranking decisions are `similarity score`, `hard-rule failures`, and `strong similarity`, respectively. The final ranking uses no provider rank, search rank, discovery priority, or price. Discovery priority only affects which search results enter the bounded pool; all four entered this replay. The candidate ID stability tie-break was **not reached**. No candidate was forced into an LKQ classification.

## Validation and live gate

The offline replay is complete. The requested refrigerator/replacement-core, replacement-discovery/retrieval, and guarded-fetch suite passed **316/316**. `node --check` passed for **16/16** changed or new JS/MJS files. `git diff --check` passed (Git emitted line-ending notices only). An additional broader `tests/lib/*.test.mjs` run reported **539 passed and 5 failed out of 544**: five unrelated test files could not load because this workspace lacks the declared `@upstash/redis` package. This broader validation is not green, so the strict live gate remains closed until those environmental failures are resolved and the suite passes. No live proof was run.
