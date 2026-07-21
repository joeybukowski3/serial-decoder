# Smart Lookup / Serial Refinement Inclusivity & Reliability Audit — 2026-07

Audit branch: `audit/smart-lookup-refinement-inclusivity`
Base: `origin/main` @ `f3fd5f7b2262b3297ec6a1462dd4e7f69946306d`

Scope: Smart Lookup (`/api/age-lookup`, `/api/lkq-lookup`) and serial refinement only.
Read-only audit; no behavior changed on this branch.

## A. Current strengths

The framework is substantially more mature than the prompt assumed. Already present and verified working:

- A 7-tier age taxonomy (`querySpecificity`) and a parallel 7-tier replacement taxonomy
  (`replacementPrecision`) with a notes-aware `exact-configuration` upgrade.
- Brand/category-scoped family registry that cannot match on a bare number or generic word.
- Deterministic degradation ladders on both routes, substituted at every provider failure point.
- Strict separation of `groundedFallback` (real AI recovery) from `fallbackKind`
  (`deterministic-*`) so deterministic content is never worded as AI-assisted or grounded.
- Server-derived citations only; provider JSON can never inject sources.
- One authoritative deadline; no second timeout chain; grounded stage bounded below the
  provider ceiling to preserve a genuine fallback reserve.
- Redis fail-closed for paid provider work; cache identity includes specificity, family,
  model line, form factor, and service-tag intent.

The audit did **not** find broad fuzzy matching, fabricated exact ages, or lower-quality
results overwriting stronger local evidence. Those safeguards hold.

## B. P0 — Exact-model queries have no deterministic reserve on either route

**This is the root cause of the reported production timeouts for
`Samsung QN65Q60RAFXZA` and `LG WM3900HWA`.**

Measured classifier output (see `Evidence` below):

| Query | querySpecificity | grounded eligible | deterministic age | deterministic LKQ |
|---|---|---|---|---|
| Samsung QN65Q60RAFXZA | exact-model | yes | **NONE** | **NONE** |
| LG WM3900HWA | exact-model | yes | **NONE** | **NONE** |
| GE GFW850SPN0DG | exact-model | yes | **NONE** | **NONE** |
| Dell OptiPlex 9020 | model-line | yes | YES | YES |
| Samsung QLED television | brand-category | yes | YES | YES |

The inversion is the defect: **the tier where identity is best known is the only tier with
no fallback**, while still being grounded-eligible and therefore the most timeout-exposed.

Three independent contributing gaps:

1. `lib/smart-lookup/replacement-static-results.js:17` —
   `buildDeterministicReplacementResult` hard-returns `null` unless
   `querySpecificity` is `model-line`/`product-family`/`brand-category`.
   In `api/lkq-lookup.js:409` the failure path is
   `buildDeterministicFallback() || createUnavailableReplacementResult(...)`,
   so exact-model always takes the generic unavailable branch.

2. `lib/smart-lookup/static-results.js:279` — `buildDeterministicBroadResult` has branches
   for `unusable`, LG-family, `generic`, `partial`, and `brand-only` but **none for
   exact-model**, so it returns `undefined`. `api/age-lookup.js:205`'s
   `hasDeterministicFallback` gate is additionally `Boolean(productFamily) || brand-category`,
   which is already true for Samsung Q60 — but the builder still yields `null`, so
   `degradeToDeterministicFallback()` degrades to nothing.

3. `src/browser/smart-lookup-controller.js:396` —
   `hasProgressiveReplacementGuidance` gates on
   `precision !== 'model-line' && precision !== 'product-family' && precision !== 'brand-category'`.
   An exact-model deterministic card with no `replacementCandidates` returns `false`,
   so `classifyReplacementOutcome` returns `'unavailable'`.
   **A server-only fix would still render an empty panel.**

Safest correction: give exact-model a deterministic reserve that asserts only what is
already known (brand, model, category, family where matched), names **no** successor,
carries **no** pricing and **no** sources, and states plainly that live research did not
complete. False-positive risk is low — it claims strictly less than any provider path.

## C. P0 root-cause finding — timeouts are not a budget-sizing problem

Measured LKQ grounded chain (`api/lkq-lookup.js`, `vercel.json` `maxDuration: 10`):

```
TOTAL_BUDGET_MS               9000
PROVIDER_BUDGET_MS            7000
GROUNDED_LKQ_STAGE_BUDGET_MS  5000
GROUNDED_LKQ_FALLBACK_MIN     1500
```

Redis read + rate limit + budget reserve ≈ 750ms → grounded stage receives its full 5000ms
→ on stage timeout ≈ 3250ms remains → closed-book fallback receives ≈ 2900ms to cover
identity + replacement + compatibility + pricing in one pass.

The chain is correctly bounded and the reserve arithmetic is sound. When the second call
also exceeds its budget the result is `PROVIDER_TIMEOUT`, and the *only* reason the user
sees an empty panel is the missing exact-model reserve in section B.

**Recommendation: do not raise any timeout.** Raising budgets would push the route toward
the 10s Vercel ceiling for no correctness gain. The correct fix is the deterministic
reserve. One logical budget reservation and a single timeout chain remain authoritative.

## D. P1 — Recognition gaps

- `Trane HVAC unit` → `brand-category`, but `genericCategory` is **unset** and
  `providerEligible`/`groundedEligible` are **false**. "HVAC"/"HVAC unit"/"HVAC system" is
  not a recognized category token, so a legitimate branded query is demoted below
  `isMeaningfulBrandCategory`. Narrow, data-only correction.
- `wm3900hwa` (lowercase, brand omitted) → `free-description`, no deterministic fallback,
  not grounded-eligible — while `LG WM3900HWA` is `exact-model`. Brand inference from a
  bare model prefix is explicitly out of bounds per the task constraints
  (no weak/shared-family brand inference), so this is recorded, **not** fixed.

## E. Evidence-coverage gaps

`data/model-age-db.json` holds **24 records total**. Neither reported failing model is
present, so both were fully provider-dependent:

- `LG WM3900HWA` — absent, though the adjacent `LG WM3470HWA` is already a record.
- `Samsung QN65Q60RAFXZA` — absent (`Q60` series entirely absent).

Deferred to the backlog rather than guessed: adding production-range records requires
independent manufacturer/retail source verification, which is out of scope for a
correctness-focused pass and must not be filled with speculative years.

## F. Non-findings (explicitly checked, no change required)

- `category-only` (`old refrigerator`, `desktop computer`) is provider-ineligible by design
  and is served by the `generic` branch of `buildDeterministicBroadResult`. Not a gap.
- Bare brand (`Samsung`) correctly stays deterministic-only.
- `unusable` (empty, `xyzzzq`) correctly short-circuits to clarification on both routes.
- Serial refinement (`api/refine-serial-date.js`, `lib/serial-refinement/`) showed no
  empty-result path with recoverable local evidence; the GE GFW850 alias fix from PR #57
  is intact.

## G. Prioritization

| ID | Change | Priority |
|---|---|---|
| B1 | Deterministic replacement reserve for exact-model/exact-configuration | **P0** |
| B2 | Deterministic age reserve for exact-model | **P0** |
| B3 | Browser: render exact-tier deterministic guidance instead of unavailable | **P0** |
| D1 | Recognize `HVAC` as a category token | P1 |
| E1 | Source-verified local records (WM3900HWA, Q60 series) | deferred |
| D2 | Brand inference from bare model prefix | deferred (unsafe) |

Proceeding with B1–B3 and D1 on `feat/smart-lookup-refinement-inclusivity`.

## Evidence

Classifier probe run against `lib/smart-lookup/normalize.js`,
`replacement-static-results.js`, and `static-results.js` at the audited SHA; results
reproduced in the table in section B and covered by regression tests added on the
implementation branch.
