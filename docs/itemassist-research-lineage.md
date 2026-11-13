# ItemAssist Research: successor generation discovery

Why a successor is presented as a specific generation, and how to extend it.

## The rule

The model's memory of recent releases is a hypothesis. The generation that is presented comes from what retailer listings state, read by code
(`lib/itemassist-research/enrich/lineage.js`, `enrich/listings.js`). One identification call, one search and two Shopping queries, as before: the
generation census reads the Shopping rows that were already fetched. No provider call, quota or configuration is added.

1. The identification prompt (`enrich/identify.js`) names no example products. It asks for the series, a generation only when the model is sure, the
   original's own generation, uncertainty, and a tier estimate. Exact model codes are still forbidden.
2. The Shopping query is the **series**, not a generation the model guessed (`generalisedName`): "LG C4 OLED" is queried as "LG C-series OLED", so
   the rows span generations and the listings decide which is newest.
3. Each row is parsed with the maker's grammar into series, generation, size and model code. **A generation is ordered by its model year, never by the
   digit or letter**: those wrap (LG C9 is 2019 and C1 is 2021; Samsung T is 2020 and A is 2021). LG's digit is `2020 + digit`, minus ten when that is after
   the request's year; Samsung's letter is read from an explicit table (R 2019 ... H 2026) and a letter not in it is not guessed. Consequently a digit past the
   current year (a C7 in 2026) cannot be told from its 2010s namesake, and no "newer" is claimed for it until the year turns. A listing of another generation, another model code, another
   size (including a model code that contradicts the title), or one that states no generation is never priced for the candidate.
4. `chooseGeneration` presents the **newest generation with a listing in the requested size**. It is priced only if a clean listing of it exists (new,
   single unit, recognised seller). An older generation is presented only when the newer one has no listing in the size, or its listings fail an
   essential requirement (for a television: resolution below 4K, wrong display class). A newer generation is never skipped merely because its listings are
   bundles, protection plans or from sellers outside the accepted list; then it is presented unpriced, with a stated reason.
   A row counts as evidence about a generation only if it is a television: a title that names a generation but no full model code must also read like
   one (4K, UHD or Smart), and an accessory "for" a series is not one. Rows rejected as used, import, rental or part create no generation at all, and a
   title that only omits the word OLED is not a failed essential requirement (one that names QLED or LED is).
5. A model code stated by one seller is kept (provisional). One seller is not corroboration and the status never reaches `VERIFIED_LISTING`; only a cited
   page can do that, and no live stage fetches pages.

## Contract (research.2, additive)

Candidates may carry an optional `lineage` block, built by code only:

| field | values |
| --- | --- |
| `relation` | `SAME_SERIES_NEWER`, `SAME_SERIES_OLDER`, `SAME_BRAND_OTHER_SERIES`, `OTHER_BRAND`, `UNKNOWN` |
| `generation` | `^[A-Z0-9][A-Z0-9-]{1,11}$` or `null` (`null` exactly when `basis` is `NONE`) |
| `basis` | `LISTINGS`, `AI_HYPOTHESIS`, `NONE` |
| `tier` | the model's own estimate against the original: `SAME`, `HIGHER`, `LOWER`, `UNKNOWN` |

Lineage is not comparability (the comparison rows) and not evidence confidence (`modelStatus`). A block that would say nothing is omitted. A successor's
`standing` is `RECOMMENDED` only when a cited page confirms its model (`VERIFIED_LISTING`); the model's confidence never is. The validator
(`contract-v2.js`) rejects anything else, and a response without the block is as valid as before.

**Rollout order:** the frontend that projects the block and words the labels deploys first; the engine second. A frontend that predates the block ignores it.

## Evidence integrity (Release 1)

Four statements stay separate, and one label never implies the others: **identification** (`original.confidence`), **lineage** (`lineage.basis`),
**comparability** (`comparison[].basis`) and **pricing evidence** (`pricing.valuation.confidence`).

- **Candidate confidence is capped at `MEDIUM`** unless a cited page confirms the model (`modelStatus === VERIFIED_LISTING`). One retailer listing naming a model
  supports "this model exists in a listing", not "this is the right replacement". The builder lowers a `HIGH`; the validator rejects `HIGH` on anything else. An answer cached before the
  cap (HIGH on an unconfirmed model, at most one day old) is served with that one label lowered to `MEDIUM` (`lowerUnsupportedConfidence`, applied on read in `cache.js`)
  only if the lowered copy passes the full validator; the stored entry is not rewritten (its expiry stands), no provider is called and no budget is used. An entry
  that is invalid for any other reason is a miss, as before. No cache prefix change.
- **Samsung television model years** are one table, `SAMSUNG_TV_MODEL_YEAR` in `lineage.js` (R 2019, T 2020, A 2021, B 2022, C 2023, D 2024, F 2025, H 2026). `N` (2018)
  was removed: nothing evidences it. A letter outside the table is never guessed. A test compares the table with the classic pipeline through its exports.
- **The original's own manufacturer page** (`original.manufacturerPages`, optional, at most two): taken only from the search results the engine already fetched about
  the original (`enrich/original-source.js`). The address must be exactly one a result carried (nothing is built from a naming pattern), a registered manufacturer
  of the original's brand, the US storefront, and carry exactly one model code that is the model asked about (not a regional, family, comparison or other-size page).
  It evidences only that the maker lists that model. It is never read for specifications or prices, never opened, and never used for a successor. The validator
  re-derives every field from the address and refuses an edited or unrecognised page.

## Model evidence and specification comparison (Release 2)

Two optional, additive candidate blocks (television candidates with a generation grammar), built only from rows already retrieved. No provider call is added.

- **`modelObservations`** `{conflict, items[]}`: model codes that recognised sellers' listing titles state for the presented generation in the size asked about, kept apart from
  price evidence and from verified identity. Each item: `model`, `status` (`PRICED_LISTING` or `EXCLUDED_FROM_PRICE`), `listings`, `retailers` (registry names of recognised
  sellers), a bounded claim-free `excerpt`, `exclusion` (`PROTECTION_PLAN`, `BUNDLE`, `NOT_USED_IN_PRICE`, `CONFLICTING_CODES`) and `retrievedAt`/`retrievedBasis`.
  A bundle or protection-plan listing shows that a model exists but never sets a price. An accessory kit "for" a model is not observed. Variants of one code are one model; codes
  that are not variants are a **conflict**: none is chosen, the candidate is named without a code, and its listings are priced only as the family. An observed code never raises a
  model status (when nothing can be priced the existing UNVERIFIED_MODEL naming from an observed code is unchanged).
- **Retrieval time:** the Serper row cache now stores `at` with each entry. A fresh lookup is stamped with its retrieval time, a cache hit carries its entry's stored time, and an entry
  stored before this existed is `UNKNOWN`. It is never a source's own publication time, and price `asOf` is unchanged.
- **`specComparison`** `{rows[], compared[], notEstablished[]}`: per attribute (`SCREEN_SIZE`, `DISPLAY_CLASS`, `RESOLUTION`, `REFRESH_RATE` always; `DOLBY_VISION`, `HDMI_2_1` only
  when a source states them) the original's value and the candidate's value, each with its basis, and `MATCH` / `DIFFERENT` / `NOT_ESTABLISHED`. The original's value comes from the
  person's own words (not when they say what they *want*), the original manufacturer page's result **title** (Release 1, not opened) or listing titles of the original model; the
  candidate's only from listing titles of the presented generation. Two sources that disagree leave a side not established. The model's own reply is never a source, and nothing is
  inferred from a generation.
- **Validation:** `evidence-blocks.js` normalizes each block and the validator requires equality with it (null blocks, extra keys, free text, results that do not follow, a candidate
  value from a page or the person, a page basis with no `original.manufacturerPages`, a priced model the name does not carry, implausible retrieval dates all fail).
  A response without the blocks is as valid as before; a web that predates them ignores them.

## Release 2.1 corrections

- **"Your description" is what the person wrote, not what a model code implies.** The person's words are read with every model identifier removed (`withoutModelIdentifiers`: letters, digits,
  then more letters, as in `OLED55C3PUA` or `QN65S90C`), so the `OLED` in `OLED55C3PUA` is not a `USER_STATED` display class and the `55` is not a stated size. Shorthand such as `OLED55`
  is not an identifier and is still the person's description. With no page or listing of the original to read, that side is `NOT_ESTABLISHED`. This reads only the person's words:
  a listing or page title that contains nothing but a code (`OLED55C6PUA`) can still yield a display class, labelled as that title's wording.
- **No cross-model price comparison.** The original's list price stays as dated context (`MSRP_CONTEXT_ONLY`: it never sets the range). The engine no longer emits
  `CURRENT_BELOW_ORIGINAL` (a present-day listing as a share of an older list price): a replacement is a different model. The validator rebuilds the valuation and so rejects an answer
  that carries the note; an answer cached by the Release 2 engine does, so the cache read removes the note from the copy it serves (`withoutRetiredValuationNotes`, the same pattern as
  `lowerUnsupportedConfidence`: validated before serving, the stored entry never rewritten, no price, range or confidence touched). Without that, every such cached answer would have become a
  miss and a fresh provider call. The web no longer words the note.
- **Cache tail and rollback.** The answer-cache key is unchanged, so an answer cached by the Release 2 engine is served for up to 24 h as it was built (including a `USER_STATED` display
  class read from a model code); only the retired note is removed. Rolling the engine back is safe but not free: the Release 2 engine rejects a cached 2.1 answer that lacks the note when the
  list price is under 75% of the listing, which is a cache miss (one extra provider call), not an error.
- **Observation diagnostics (internal).** `enrichment.observations.<candidate>` in the structured log line explains why a `modelObservations` block is or is not emitted. They are never
  in the public response and carry only small integers, booleans and fixed labels (never a title, seller, link, model code or query). Fields, in the order a block can be lost:
  `rowsConsidered` (Shopping rows screened) → `sellersRecognised` → `rowsOfSeries` → `rowsObservable` (size asked, recognised seller, reads as a television) →
  `rowsOfPresentedGeneration` (rows judged to be the original model itself are not counted in `rowsOfSeries`); `rowsWithCodeToken` (rows with anything shaped like a model code, whatever the seller or generation); `identifiersRecognised` (distinct codes the maker's
  grammar read, any generation); `accessoryRowsSkipped`; `observationsRetained` (at most 3) with `observationsExcluded` by reason (`PROTECTION_PLAN`, `BUNDLE`, `NOT_USED_IN_PRICE`,
  `CONFLICTING_CODES`); `conflict`; and `emitted` (added from the response actually built: `observationsRetained > 0` with `emitted: false` means the contract dropped the block; `ALT_n` is matched to the n-th suggestion by position, so for
  an alternative it is a close approximation). The counters are best effort: if they cannot be computed they are absent and the answer is unaffected. The same log line already carries
  other enrichment fields (for example `unsupportedCodes`); the counters themselves hold only integers, booleans and fixed labels.
  Typical absences: `rowsWithCodeToken: 0` (Shopping titles state no code), `identifiersRecognised: 0` with code tokens present (a code the grammar does not read), or
  `rowsOfPresentedGeneration: 0` (no listing of the presented generation in the size asked).

## Cache

`RESEARCH_CACHE_PREFIX` is `v3`. Answers cached under `v2` (a generic family, mixed-generation prices, `RECOMMENDED` on confidence) are never read;
nothing is deleted. The Serper row caches hold raw rows keyed by query text and are unchanged.

## Adding a maker

Grammars exist for LG OLED and Samsung television only. Any other maker or category has none and behaves exactly as before (a family; prices as before).
To add one, in `lineage.js`:

1. Add a grammar object to `GRAMMARS[category]` with `brand`, `parse(title)` (series, ordinal, label, size, sku from a retailer title), `seriesOf(text)`,
   `rename(name, label)` and `generalise(name, series)`. Ordinals must compare in release order.
2. Test it on **real** titles (the S1 rows in `tests/fixtures/itemassist-research/s1-rows.json` and a saved request), not invented ones, including a title
   that must not match.
3. Do not reuse a television grammar for appliances: model-year codes there are different and are not generations of a "series".

## Offline reproduction

`tests/api/itemassist-research-lineage.test.mjs` runs the whole live pipeline over captured rows with a mocked model reply. Nothing calls a provider.
