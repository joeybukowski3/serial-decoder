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

## Model-year rules (Release 3b)

Release 3b adds three television grammars: Samsung UHD / Crystal UHD, LG UHD (LED/LCD) and Sony. A model-year letter is read only when at least one
source states the model year of a specific model printed with that letter. Most of these are the maker's own pages, a major retailer or a test lab.
Letters with no such source are left out of the tables. So are letters whose sources disagree. A title carrying one of them states no generation and is
not priced as a generation. The tables are `SAMSUNG_UHD_YEAR`, `LG_UHD_YEAR` and `SONY_TV_YEAR` in `lineage.js`.

General scheme, from consumer guides; these do not date any single letter:
- [Which?: TV model names explained](https://www.which.co.uk/news/article/dont-buy-the-wrong-tv-model-names-explained-a3kZl6F8vd8X) covers four points:
  - LG LCD letters after the size relate to the year, with "A" for 2025.
  - Samsung's final letter is the year, with F for 2025.
  - Sony's "K-" prefix has been standard since 2024.
  - Letters reset, as LG's did in 2025.
- [Expert Reviews: Sony TV model numbers explained](https://www.expertreviews.co.uk/technology/tvs-home-cinema/sony-tv-model-numbers-explained) covers the K- prefix since 2024, and the 2024–2025 BRAVIA names (K-65XR90, K-55XR8M2, …).

### Samsung UHD / Crystal UHD

Through 2024 the year letter comes before "U": `UN55JU6700F`, `UN55DU7200FXZA`. From 2025 it comes after the four-digit number: `UN55U8000FFXZA`.
The series is the four digits.

| Letter | Year | Model-specific sources |
|---|---|---|
| J | 2015 | UN55JU6700: [DisplayDB](https://www.displaydb.com/tv/samsung-un55ju6700), [TV Parts Today](https://tvpartstoday.com/products/tv-samsung-un55ju6700) |
| M | 2017 | UN55MU8000: [DisplayDB](https://www.displaydb.com/tv/samsung-un55mu8000), [Takespec](https://takespec.com/tv/samsung-mu8000-un55mu8000fxza) |
| N | 2018 | UN55NU7100: [DisplayDB](https://displaydb.com/tv/samsung-un55nu7100), [Takespec](https://takespec.com/tv/samsung-un55nu7100-un55nu7100fxza) |
| R | 2019 | UN55RU7100: [TV Parts Today](https://tvpartstoday.com/products/tv-samsung-un55ru7100), [DisplayDB](https://www.displaydb.com/compare/samsung-un55nu7100/samsung-un55ru7100) |
| T | 2020 | 55" TU7000: [Best Buy (Model Year 2020)](https://www.bestbuy.com/site/samsung-55-class-7-series-led-4k-uhd-smart-tizen-tv/6401735.p), [Takespec](https://takespec.com/tv/samsung-tu7000-un55tu7000bxza) |
| A | 2021 | AU8000: [Samsung (2021)](https://www.samsung.com/sa_en/business/tvs/uhd-4k-tv/au8000-crystal-uhd-4k-smart-tv-ua55au8000uxum), [RTINGS](https://www.rtings.com/tv/reviews/samsung/au8000) |
| B | 2022 | UN55BU8000: [DisplayDB](https://www.displaydb.com/compare/samsung-un55bu8000). This is the weakest row: one database, consistent with the general guides. |
| C | 2023 | 55" CU8000: [Best Buy](https://www.bestbuy.com/site/samsung-55-class-cu8000-crystal-uhd-4k-smart-tizen-tv/6537378.p) |
| D | 2024 | UN55DU7200: [P.C. Richard (Model Year 2024)](https://www.pcrichard.com/samsung-55-class-du7200-series-led-4k-uhd-smart-tizen-tv/UN55DU7200.html), [Walts (2024)](https://walts.com/product/un55du7200bxza) |
| F (after the number) | 2025 | UN55U8000FFXZA: [Samsung US (2025)](https://www.samsung.com/us/tvs/uhd-4k-tv/u8000f-55-inch-crystal-uhd-4k-smart-tv-un55u8000ffxza/), [Best Buy (Model Year 2025)](https://www.bestbuy.com/site/6619250.p) |

Read as unknown:
- K (2016): no model-specific source was found.
- H after the number (2026): no citable model-specific source in this shape.
- Earlier letters.
- Any letter in another shape.

### LG UHD (LED/LCD)

Codes are size, then "U", then the year letter, then four digits, then a suffix: `55UR8000AUA`, `55UT7570PUB`, `75UA7700PUA`. The series is the first
two digits, which also appear in the marketing name (UT75, UA77).

| Letter | Year | Model-specific sources |
|---|---|---|
| N | 2020 | 55UN7300PUF: [DisplayDB](https://displaydb.com/tv/lg-55un7300puf), [RTINGS](https://www.rtings.com/tv/reviews/lg/un7300) |
| P | 2021 | 55UP7000PUA: [LG US (2021 Model)](https://www.lg.com/us/tvs/lg-55up7000pua-uhd-4k-tv), [Datavision](https://datavision.com/products/lg-up7000pua-55-in-4k-uhd-4k-uhd-60hz-smart-tv-55up7000pua-2021) |
| Q | 2022 | 55UQ7570PUJ: [Best Buy (2022)](https://www.bestbuy.com/site/questions/lg-55-class-uq75-series-led-4k-uhd-smart-webos-tv-2022/6501939), [TV Reviews](https://tvreviews.net/lg-uq7570/) |
| R | 2023 | 55UR8000AUA: [LG US (webOS 23)](https://www.lg.com/us/tvs/lg-55ur8000aua), [DisplayDB](https://www.displaydb.com/tv/lg-55ur8000aua) |
| T | 2024 | 55UT7570PUB: [LG US (webOS 24)](https://www.lg.com/us/tvs/lg-55ut7570pub-4k-uhd-tv), [Best Buy (2024)](https://www.bestbuy.com/site/questions/lg-55-class-ut75-series-led-4k-uhd-smart-webos-tv-2024/6578186) |
| A | 2025 | 55UA7000PUB and 75UA7700PUA: [LG US (2025)](https://www.lg.com/us/tvs/lg-55ua7000pub-4k-uhd-tv), [LG US (2025)](https://www.lg.com/us/tvs/lg-75ua7700pua-4k-uhd-tv) |

Read as unknown: M (2019) and earlier. NanoCell and QNED codes, which carry the year elsewhere in the suffix, are not read by this grammar.

### Sony (X LED and A OLED with a year suffix)

Codes are KD, XR or XBR, then the size, then the series, then the year letter: `KD-55X80K`, `XR-65A80L`, `KD-55X7500H`. The series is the letter plus
the first two digits (X80, X75, A80).

| Letter | Year | Model-specific sources |
|---|---|---|
| H | 2020 | X7500H series listed under 2020 in [Sony's wall-mount compatibility article](https://www.sony-asia.com/electronics/support/televisions-projectors-lcd-tvs/articles/00228847). The article returns 403 to automated fetches; this was read from search results. |
| J | 2021 | X80J series listed under 2021 in the same Sony article |
| K | 2022 | X80K series listed under 2022 in the same Sony article; [Sony Support on Best Buy: "KD55X75K is a 2022 model"](https://www.bestbuy.com/site/questions/sony-55-class-x75k-led-4k-uhd-smart-google-tv/6505137) |
| L | 2023 | X80L: [Sony NZ spec (2023)](https://sony.co.nz/bravia/products/x80l-x81bl-series/spec), [Sony MEA spec](https://www.sony-mea.com/en/bravia/products/x80l-x81bl-series/spec); X85L: [Sony Philippines](https://www.sony.com.ph/bravia/products/x85l-series) |

Read as unknown:
- The two-letter "W" suffix (KD-55X75WL). Sony's own pages disagree on its year: the wall-mount article lists it under 2022, the UK spec page says 2023.
- 2024-and-later BRAVIA names (K-55S30, K-65XR80, K-55XR8M2). They carry no year letter.
- G (2019) and earlier.

### What the grammars do and do not change

- The Shopping query text is unchanged for these makers. `generalise` returns the name as given, so the provider is asked the same queries as before.
- A listing whose generation is unknown is never priced as a generation. Listings of another size, another generation, bundles and accessories are
  excluded exactly as for LG OLED and Samsung S/Q.
- For these three grammars, the grammar's own reading of a row's series decides series membership. So "Sony X80K" still matches an X80L listing and the
  newest dated generation can be found, while the Shopping query keeps the name the model gave. LG OLED and Samsung S/Q keep their previous matching.
- A listing of the series at the requested size whose model year cannot be read (an unsourced letter, such as Samsung's 2026 "H") is never priced. It
  adds a note that a newer model may exist, so an older dated generation is not presented as certainly the newest.
- A listing that states both a series designation and a full code ("UR8000-Series … 55UR8000AUA") is read by its full code. This applies in every
  category: a refrigerator title "WRF555-Series … WRF555SDFZ" now reads WRF555SDFZ. A title with no full code is read as before.
- A "successor" the model names from another maker is an alternative replacement, never the manufacturer's successor, in every category. This applies
  only when both makers are recognised names.

## Adding a maker

Grammars exist for LG OLED, LG UHD, Samsung S/Q, Samsung UHD / Crystal UHD and Sony (year-suffix X and A series) televisions. Any other maker or
category has none and behaves exactly as before: a family, priced as before.
To add one, in `lineage.js`:

1. Add a grammar object to `GRAMMARS[category]` with `brand`, `parse(title)` (series, ordinal, label, size, sku from a retailer title), `seriesOf(text)`,
   `rename(name, label)` and `generalise(name, series)`. Ordinals must compare in release order.
2. Test it on **real** titles (the S1 rows in `tests/fixtures/itemassist-research/s1-rows.json` and a saved request), not invented ones, including a title
   that must not match.
3. Do not reuse a television grammar for appliances: model-year codes there are different and are not generations of a "series".

## Market discovery (Release 3b follow-up)

A successor the model names can be a generation that is no longer sold. "Samsung CU7000" is an example: it dates to 2023, and the request was made in 2026. A Shopping lookup pinned to that series then returns old stock at marketplace sellers, and the newer models a shopper would be offered are never retrieved (live request, 2026-11-17).

**When it applies** (`discoveryPlan` in `discovery.js`), all of the following must hold:
- The product is a television of a maker with a generation grammar (Samsung, LG, Sony).
- The size is known.
- The successor is that maker's own.
- The successor's name dates it to a model year more than **two** years before the request year.
- Its grammar keeps the named generation in the Shopping query (Samsung Crystal UHD, LG UHD, Sony). LG OLED and Samsung QLED/OLED queries already span every year, so they are not replaced.

A successor that is current, or has no date in its name, keeps its targeted lookup. A broad lookup can miss a model that a targeted lookup finds.

**What it does**
- **The lookup:** the successor's one Shopping lookup becomes `<maker> <size> inch [4K] [display type] TV`. It is built from the original's own attributes. The number of calls is unchanged: one Gemini call, one search about the original and two Shopping lookups.
- **The successor:** it is screened against those rows exactly as before (its series, its newest dated generation at the size). A code that the broad rows do not show is not treated as invented. If the series is not found, the successor keeps its name, is not priced, and says so.
- **One same-brand alternative:** this can come from the same rows. Each series in the rows is screened as its own candidate, with every existing safeguard:
  - recognised sellers only
  - new single units
  - the stated size
  - a dated generation
  - the model's own code
  - the outlier band

  A model qualifies only if:
  - **at least two** recognised sellers price that exact code at the size;
  - its display type is in the original's family;
  - its model year is no more than two years before the request.

  Candidates are ordered as follows:
  1. The original's display type first.
  2. Then the newest model year.
  3. Then the number of sellers.
  4. Then listing order.

  The newest model or the cheapest model alone never decides.
- **How the alternative is shown:** it takes the place of the suggestion that was never looked up. It is never the successor, it is `LISTED_PROVISIONAL` (never verified), and its text says it is a same-brand alternative.

**Benchmark:** offline, with synthetic and saved fixtures; the fixture states its provenance in `tests/fixtures/itemassist-research/market-discovery-synthetic.json`. Tests are in `tests/api/itemassist-research-discovery.test.mjs`.
- **Improves:** the live-shaped JU6700 case goes from no priced candidate to a priced same-brand model (U8000F, two sellers). The adversarial cases also improve: a newer model offered only renewed, newer premium types, accessories carrying the code, and mixed sizes.
- **Unchanged:** current nominations, undated nominations (LG C3, S90C), LG OLED and Samsung QLED/OLED nominations (their query already spans every year), the Sony benchmark result (a stale "X80K" nomination is now looked up broadly and still finds the X80L) and appliances.
- **Known loss:** a 2023 nomination that is still stocked cleanly is no longer looked up by name.

## Offline reproduction

`tests/api/itemassist-research-lineage.test.mjs` runs the whole live pipeline over captured rows with a mocked model reply. Nothing calls a provider.
