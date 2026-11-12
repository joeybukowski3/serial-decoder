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
3. Each row is parsed with the maker's grammar into series, generation, size and model code. A listing of another generation, another model code, another
   size (including a model code that contradicts the title), or one that states no generation is never priced for the candidate.
4. `chooseGeneration` presents the **newest generation with a listing in the requested size**. It is priced only if a clean listing of it exists (new,
   single unit, recognised seller). An older generation is presented only when the newer one has no listing in the size, or its listings fail an
   essential requirement (for a television: resolution below 4K, wrong display class). A newer generation is never skipped merely because its listings are
   bundles, protection plans or from sellers outside the accepted list; then it is presented unpriced, with a stated reason.
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
