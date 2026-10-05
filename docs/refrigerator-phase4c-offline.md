# Refrigerator Phase 4C: capacity policy and offline replay

## Versioned HARD capacity policy

`REFRIGERATOR_CAPACITY_POLICY_VERSION = 1.0.0`; the refrigerator profile is version `2.1.0`. For **refrigerators only**, a replacement may be up to **0.2 cu. ft. below** the original **total capacity** and still satisfy the HARD capacity requirement. Small manufacturer-stated differences of 0.1–0.2 cu. ft. are treated as functionally equivalent for LKQ purposes. This is not a general product-size tolerance; television screen size and other categories retain their own rules. No percentage is used.

For comparable total-capacity facts, the rule compares exact base-10 decimal values and passes when `replacement >= original - 0.2`. It does not round the compared values. Equal values receive `CAPACITY_MATCH`; a lower value within the refrigerator tolerance receives `CAPACITY_WITHIN_REFRIGERATOR_TOLERANCE`; a value below the floor receives `CAPACITY_BELOW_ALLOWED_FLOOR`; a larger value receives `CAPACITY_ABOVE_ORIGINAL`.

The shared extractor labels a model-bound `Total Capacity` / `Volume Total` specification `TOTAL_SPECIFICATION` and a headline or generic `Capacity` number `NOMINAL_MARKETING`. A nominal or otherwise incompatible capacity value cannot receive the 0.2 pass and returns `CAPACITY_COMPARISON_UNVERIFIED`. Ambiguous and unresolved capacity facts also remain unverified. Facts already supplied as `totalCapacityCuFt` without an explicit incompatible basis retain the existing contract meaning of total capacity. A compatible finer manufacturer specification can supersede a rounded marketing value when the shared source merger finds them consistent.

| Original → replacement (cu. ft.) | HARD result | Reason |
| --- | --- | --- |
| 25.2 → 25.2 | MATCH | `CAPACITY_MATCH` |
| 25.2 → 25.1 | MATCH | `CAPACITY_WITHIN_REFRIGERATOR_TOLERANCE` |
| 25.2 → 25.0 | MATCH | `CAPACITY_WITHIN_REFRIGERATOR_TOLERANCE` |
| 25.2 → 24.9 | FAIL | `CAPACITY_BELOW_ALLOWED_FLOOR` |
| 25.2 → 24.5 | FAIL | `CAPACITY_BELOW_ALLOWED_FLOOR` |
| 25.0 → 24.8 | MATCH | `CAPACITY_WITHIN_REFRIGERATOR_TOLERANCE` |
| 25.0 → 24.7 | FAIL | `CAPACITY_BELOW_ALLOWED_FLOOR` |

## Four-candidate fixture replay

The original LRFCS25D3S and each candidate were read through the same shared extractor and local fixture-backed search/fetch callbacks. Zero live requests were made. The original and all candidates have model-bound precise total-capacity specifications. Retrieval quality was `RETRIEVED_STRONG` with five selected local pages (one original, four candidates). The ranking recalculated naturally:

| Rank | Candidate | Total cu. ft. | HARD capacity / reason | Classification | Confidence | STRONG similarity / coverage | Unresolved HARD |
| ---: | --- | ---: | --- | --- | --- | --- | ---: |
| 1 | LF25Z6211S | 25.1 | MATCH / tolerance | `UNCONFIRMED` | LOW | 88% / 71.4% | 2 |
| 2 | LF25H6200S | 25.1 | MATCH / tolerance | `UNCONFIRMED` | LOW | 100% / 57.1% | 2 |
| 3 | LF25H6330S | 24.5 | FAIL / below floor | `NOT_LKQ` | LOW | 76% / 71.4% | 2 |
| 4 | LF25G8330S | 24.5 | FAIL / below floor | `NOT_LKQ` | LOW | 60% / 64.3% | 2 |

All four have `installationType = UNKNOWN`. None of the bounded exact-model fixtures states an installation type. The product's French-door layout, standard/counter depth, and dimensions do not establish `FREESTANDING`. No installation type was inferred. Fit remains an advisory to verify available space, and tier remains `PREMIUM / ASSUMED / BRAND_CATEGORY_BASELINE`. LF25G8330S remains exact `FRENCH_DOOR_4_DOOR` with broad `FRENCH_DOOR` compatibility.

The first adjacent ranking decision is weighted similarity score (53.4 for LF25Z6211S versus 48.6 for LF25H6200S). The second is the known HARD capacity failure; the third is STRONG similarity. Provider rank, search rank, discovery priority, and price do not enter final ranking. The candidate ID stability tie-break was not reached.

## Broader test failure audit and live gate

The relevant replacement-core, discovery/retrieval, and guarded-fetch suite passed **320/320** after this change. `node --check` passed for **19/19** changed or new JS/MJS files; `git diff --check` passed (line-ending notices only). The broader `tests/lib` run passed **543/548**; five test files could not load `@upstash/redis`. That package is declared in the unchanged `package.json` and `package-lock.json` but absent from local `node_modules`; the five test files and dependency manifests are tracked and unchanged. These are pre-existing local dependency/setup failures, unrelated to Phase 4 behavior. Dependencies were not changed. With the requested relevant validation green and the broader failures classified as environmental, the gate is **READY FOR ONE MANUAL LIVE PROOF**. No live proof was run.
