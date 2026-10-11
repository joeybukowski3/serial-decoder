# ItemAssist replacement architecture checkpoint

Status: TV retrieval-first proof, isolated from production routes. This document describes the intended next boundary; it does not add a Product Knowledge store or Replacement Catalog.

## Current deterministic path

`lib/replacement-discovery/retrieval-first.js` searches for exact product pages, extracts bounded TV facts, binds each fact to source evidence, and builds candidate drafts. Its discovery priority orders page fetches only. `lib/replacement-core` applies versioned category HARD, STRONG, and SECONDARY rules, fit, scoring, confidence, and classification. `candidate-ranker.js` ranks evaluated candidates from structured comparisons; search-provider rank and price do not decide LKQ. The proof runner is fixed to QN55Q80C and is not called by a production route.

The Samsung Q80 C/D and QN90 D tier entries in `normalize-values.js` are versioned **product-family policy**, supported by a verified series. Model suffix year mapping in `retrieval-first.js` is deterministic discovery policy. Neither is a per-model specification record. Individual screen, resolution, panel, refresh, and dimension values come from retrieved product facts and must eventually reside in product data.

## Reusable product facts

Current `identity.facts` entries have `value`, `status`, `basis`, and evidence references. The retrieval report also carries evidence with source URL, source type, observation time, field claim, subject model, and confidence. These map to a record with `schemaVersion`, category, brand, model, fullModel, family, series, modelYear, `specs` (screenSizeIn, resolution, displayTechnology, refreshHz, smart, hdr, widthIn, heightIn, depthIn), tier (`value`, `status`, `basis`, `registryVersion`), provenance (`sourceUrl`, `sourceType`, `observedAt`, `fields`), and verification (`verifiedAt`, `confidence`). Map `verifiedAt` and record confidence from validated field evidence at persistence time; they are not current top-level identity fields. Preserve per-field status and evidence, including unknown or conflicting values, rather than turning AI prose into a fact. `measuredDiagonalIn` is separate from marketed `screenSizeIn`.

## Future lookup and enrichment

1. Parse user model or partial item information, then try exact or normalized model lookup in Product Knowledge.
2. If the original record is sufficiently fresh for the required fields, use it without original-product web research. Otherwise retrieve, extract, validate, and make the normalized record eligible for persistence.
3. Query the Replacement Catalog for plausible current products. Check catalog freshness and required fact coverage.
4. Run replacement-core and deterministic ranking over the normalized original and candidate records.
5. Use live retrieval or AI only when the original is unknown, the catalog is insufficient or stale, important facts are missing, or model ambiguity needs interpretation.

A future batch job can populate both stores: model list → authoritative retrieval → deterministic extraction → optional bounded AI extraction fallback → validation → normalized product record → persistent Product Knowledge or Replacement Catalog. This researches repeated models once rather than on every customer lookup. Store provenance and freshness with each field; version rules independently of product records so records can be reevaluated after policy changes.

AI may interpret messy input, resolve ambiguous model strings, extract facts from retrieved text, fill unknown catalog entries, and explain a deterministic result. AI must not independently set HARD requirements, tier policy, category rules, final LKQ classification, or final candidate ranking when structured facts are available. Those decisions remain in versioned deterministic code.

## Generalized live facade (Phase 5A-0)

`lib/replacement-discovery/live-retrieval.js` exports `recommendByRetrieval({ category, brand, model, notes, deps, deadlineMs })`, the server-callable entry point for a user-entered model. It is plumbing over the retrieval runners; it adds no evaluation, ranking, tier or pricing logic and has no model/AI path.

- **Support matrix (checked before any provider call):** television / Samsung QLED and Neo QLED (`QN##Q##` or `QN##QN##`, generation letter R, C, D or F); refrigerator / LG (`L` + letters + digits, for example LRFCS25D3S, LF25G8330S). Anything else returns `UNSUPPORTED` (or `INVALID_REQUEST` for malformed input) with zero search and fetch calls.
- **Notes (`notesMode: 'FIT_ONLY'`):** product facts come from the validated brand/model/category only. Notes may supply fit constraints (opening dimensions, mount reuse, panel-ready) and nothing else; any other clause is returned as `NOTE_NOT_SCORED`. `interpretReplacementSearch` defaults to the legacy `FULL` mode for existing callers.
- **Deadline:** one `createDeadline` (default 20 s) governs the run. Each search and fetch is capped by the time remaining; once it is reached no further provider call starts, collected evidence is still evaluated, and the result carries `DEADLINE_REACHED` with status `PARTIAL`.
- **Proof wrappers:** `runRetrievalProof` and `runRefrigeratorProof` keep the fixed-item guard and call the generalized `runTvRetrieval` / `runRefrigeratorRetrieval`.
- **Mount reuse (television, `FIT_ONLY` only):** explicit statements such as "wall mount will be reused", "existing mount will be reused", "must work with existing wall mount", "reuse/keep existing wall mount" set the existing `mountReuseRequired` fit constraint; the unchanged fit rules then evaluate it (unverified without a known mounting pattern). A bare mention such as "TV comes with a mount" is not a requirement and stays `NOTE_NOT_SCORED`. Legacy `FULL` mode keeps the shared fit reader's narrower phrasing.

## Retail eligibility: current new retail products only (policy 1.0.0)

A replacement is only ever recommended if a customer can buy it new today. `lib/replacement-discovery/retail-eligibility.js` is a **hard gate that runs before LKQ evaluation**; retail availability is never a soft score and price never enters similarity.

Pipeline: discovery → normalize → **retail eligibility** → hard LKQ eligibility → similarity/classification → rank → recommend. A candidate that fails retail eligibility is never drafted, so it can be neither the primary nor an alternative, and it contributes no evidence. It stays visible internally in `report.retail.rejected` (with reason codes) and `report.candidateDiscovery[].retailEligible === false`.

**Contract** (`retailEligibility`, assessed from the page the specs came from): `condition` NEW | UNKNOWN | NON_NEW; `purchaseStatus` AVAILABLE | UNAVAILABLE | UNKNOWN; `catalogStatus` CURRENT | LEGACY | UNKNOWN; `sellerType` RETAILER | MANUFACTURER | MARKETPLACE | UNKNOWN; `sourceName`, `sourceUrl` (origin + path only), `observedPrice` (optional, eligible candidates only), `observedAt`, `eligible`, `reasons[]`. `eligible` requires NEW + AVAILABLE + CURRENT + a first-party seller. Anything ambiguous fails closed.

**Evidence rules**
- Purchase path must be affirmative: schema.org `InStock`/`LimitedAvailability`/`OnlineOnly`/`InStoreOnly` on a Product (or a `ProductGroup.hasVariant` entry, as on multi-size samsung.com pages) that names the candidate model, **or** a visible "Add to cart"/"Buy now" control together with a price. A page, spec sheet, search mention or old URL is not evidence. Out-of-stock, sold-out, discontinued, pre-order, notify-me and disabled-control signals make the candidate unavailable (a structured in-stock offer outranks loose out-of-stock wording elsewhere on the page).
- The page must identify the candidate model (URL, title/h1 or matching Product JSON-LD); an offer for another product on the page is never used.
- Condition: `UsedCondition`/`RefurbishedCondition` offers, or used / refurbished / renewed / open-box / pre-owned / auction wording in the title, h1, URL or product name, mean NON_NEW. A first-party page with no condition markers is treated as new retail (`CONDITION_ASSUMED_NEW_FIRST_PARTY`). Body mentions (for example an "Open-Box from $X" link on a new product page) are ignored.
- Sellers: manufacturer sites and first-party retailers (Best Buy, Home Depot, Lowe's, Costco, Sam's Club, Walmart, Target, Abt, Crutchfield, AJ Madison, Appliances Connection). A seller named on the page (structured `seller`, or "sold/shipped by") that is not the retailer makes the listing MARKETPLACE. Walmart and Target additionally need an explicit first-party seller or the seller stays UNKNOWN. Marketplace domains (Amazon, eBay, …) are never accepted.
- U.S. only: `samsung.com` and `lg.com` require the `/us/` storefront; a non-USD offer is not a U.S. purchase path. Discovery enforces the same rule (non-U.S. storefront results are not candidates, and television candidate queries target `site:samsung.com/us`) so other storefronts never consume candidate slots.
- Catalog: discontinued/archived wording or archive paths mean LEGACY. A model more than `MAX_MODEL_YEARS_BEHIND` (3) model years behind the current year is LEGACY even if its page still shows an offer; year is one signal, not the only test (a prior-year model with a live purchase path stays eligible). For Samsung TVs the generation letter registry dates the model (R 2019 … F 2025).

**No qualifying candidate:** the facade returns `NO_RESULT` with report reason `NO_CURRENT_RETAIL_REPLACEMENT` (instead of `BASELINE_FALLBACK_USED`) and a `retailAvailability` refinement; the public contract adds a BLOCKING warning of the same code. It never falls back to an obsolete model.

**Public contract (engine 1.1.0):** `primary.retail` and each `alternatives[].retail` carry `statusLabel: "AVAILABLE NEW"`, the fixed condition/status fields, `sellerType`, `sourceName`/`sourceDomain`/`sourceUrl`, `observedPrice` and `observedAt`, separate from the LKQ classification. `buildPublicResponse` removes any primary or alternative without eligible retail evidence, and `isValidPublicResponse` rejects responses that lack it. The cache fingerprint includes the engine version and the retail policy version, so answers cached before this policy can never be served.

**Known limits of v1:** television discovery queries target `samsung.com`, so availability evidence is manufacturer-direct unless a retailer result surfaces; refrigerator discovery reads one retailer page per ineligible candidate when its spec pages prove no purchase path. Pages that render the buy box only with JavaScript fail closed.

## Successor-first discovery, family integrity and the primary quality floor (television)

**Discovery order** (`planCandidateQueries(facts, originalModel)`, at most four candidate searches, all `site:samsung.com/us`): (1) exact later-generation model numbers of the same family, derived from the parsed original (QN55Q80C → QN55Q80D/F/H and the QN80 spelling; letters follow Samsung's release order, E and G unused), (2) the same family and size, (3) a higher product line only if the tier registry documents one (Q80 → QN90), (4) the performance class, then a broad fallback. These are search hypotheses; a result must still pass candidate identity, the retail gate and the LKQ rules. No result is hardcoded.

**Slots:** `applySizePolicy` drops smaller sizes (they cannot pass the screen-size HARD rule), fills slots with the original's exact size first, and admits at most one larger size, only when fewer than three exact-size candidates exist.

**Ranking keys** (after hard-rule failures): verified performance regression, recommendation quality floor, classification, **product-family integrity**, then the existing similarity keys. Family integrity ranks the original's verified series first, a different series with a VERIFIED equal-or-higher tier second, an unknown series third and a verified different series with only an assumed brand-baseline tier last. Extraction completeness and the 0.4 partial credit for a known-different series cannot outrank a better family.

**Tier integrity:** a generic assumed tier is never a verified HARD pass. A candidate inherits the original's tier only when both carry the same retrieved series (`SAME_SERIES_AS_ORIGINAL`, INFERRED); a different or user-typed series inherits nothing. No hierarchy is invented beyond the documented registry.

**Material regression** (`replacement-core/regression.js`): a HIGH strong capability VERIFIED on both sides and below 75% of the original's value (native 120 Hz → verified 60 Hz), or a verified smart-TV capability lost, is reported in `decision.materialRegressions`. Unknown candidate values are never regressions; they remain needs-verification.

**Primary quality floor** (`quality-floor.js`): a normal "Recommended Replacement" needs no hard failure, verified HARD rules (an assumed tier fails this), no verified regression, a LKQ / ABOVE_LKQ / CLOSE_MATCH classification and strong-evidence coverage of at least 0.5. Below the floor a candidate is still returned if it is retail-eligible, but as `recommendationLevel: "BEST_AVAILABLE"` with `isBestAvailableOnly: true`, a BLOCKING `NO_CONFIRMED_LKQ` warning and explanation text that says it is not a confirmed equivalent. Alternatives below the floor are rejected (`BELOW_QUALITY_FLOOR`) when the primary meets it. Television only; the refrigerator profile is unchanged. The public engine version is 1.3.0.

**U.S.-only original lookup:** the original's specifications are first searched with `site:samsung.com/us`. A non-U.S. storefront page (`/latin_en/`, `/ca/` ...) is never taken from that search. Only if no U.S. page matches does the broad `site:samsung.com` fallback run; it still ranks U.S. pages first, and a non-U.S. page is used only as a last resort, reported as `ORIGINAL_SOURCE_NON_US` (a public WARNING).

**Documented family lineage** (`TV_FAMILY_LINEAGES` in `normalize-values.js`): Samsung's Q80 and QN80 lines are one lineage (`samsung-80`). Equivalence is explicit registry data, symmetric, and parsed from the retrieved model number; lines not listed are never equivalent (Q7 is not Q80; QN90 is a documented higher line, not the same family). A candidate in the original's lineage ranks as the same family (family integrity 0) and inherits the original's resolved tier as INFERRED with basis `FAMILY_LINEAGE_REGISTRY`, unless its retrieved series names a different line. Nothing else is inferred: refresh rate, HDR, series, physical fit stay needs-verification, hard gates (size, resolution, tier) still apply, and retail eligibility is unchanged.

**Lower-family alternative suppression** (`isLowerFamilyThanPrimary`): when the primary is in the original's family, is below the floor only for unverified facts (no hard failure, no verified regression), and another candidate is a verified lower or different family that resolves no hard requirement the primary leaves open, that candidate is rejected as `LOWER_FAMILY_THAN_PRIMARY` and not shown. Equivalent, higher and unknown families, and alternatives that verify a hard requirement the primary does not, are kept.
