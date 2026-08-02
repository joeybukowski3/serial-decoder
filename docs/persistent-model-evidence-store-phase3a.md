# Persistent Model Evidence Store — Phase 3A Design

Status: **design only.** No schema created, no packages installed, no code changed.
Scope: durable knowledge layer shared by Smart Lookup (`api/age-lookup.js`) and
Serial Refinement (`api/refine-serial-date.js`) through the existing shared
evidence service (`lib/model-evidence/service.js`).

---

## 1. Executive recommendation

**Build it, but build it small, read-only first, and behind the existing shared
evidence service — not beside it.**

Five findings drive the whole design:

1. **There is already exactly one correct insertion point.** Both routes reach
   Serper/Gemini only through `lookupModelEvidence()` in
   `lib/model-evidence/service.js`. Smart Lookup calls it at `api/age-lookup.js:785`;
   Serial Refinement calls it via `lib/serial-refinement/deterministic-provider.js:53`.
   The persistent store plugs in **inside that one function**, between the Redis
   shared-evidence read and `gatherEvidence()`. Nothing in either API route needs
   to learn that Postgres exists. This is the single most important constraint in
   this document: adding a DB read to both routes would create the "second
   competing lookup architecture" the goal explicitly forbids.

2. **The durable unit of knowledge is already defined.** `service.js` emits a
   normalized `facts[]` array of `{source, fact, identity, extraction}` objects
   with `eventType`, `year`, `endYear`, `precision`, `target`, and
   `effectiveMatchType`. That structure is provider-neutral today. The Postgres
   schema is essentially a normalized, deduplicated, audited persistence of that
   shape — not of any Serper or Gemini payload.

3. **The identity model is already solved and must not be re-implemented.**
   `buildSharedModelIdentity()`, `compactModelToken()`, `normalizeEvidenceBrand()`,
   `isCanonicalTranscriptionEquivalent()`, and `exactMatchKind()` already define
   brand/model normalization and the exact/canonical-equivalent/variant/family
   ladder. The store must import these, never restate them. All normalized columns
   are populated in application code by those exact functions, never by SQL logic
   that could drift.

4. **Redis is already doing durability's job badly.** `SHARED_EVIDENCE_TTL_SECONDS`
   is **180 days** (`lib/serial-refinement/deterministic/cache.js:117`). That is a
   cache pretending to be a database: it silently vanishes on eviction, an outage,
   or a version bump, and every version bump today (`SHARED_EVIDENCE_SCHEMA_VERSION`,
   `EXTRACTION_PROMPT_VERSION`, `IDENTITY_POLICY_VERSION`) throws away every fact
   the system ever learned. Postgres fixes precisely that; Redis then correctly
   drops to a short hot cache.

5. **Do not over-build.** Five tables, one join table, no queue, no EAV, no
   per-brand tables, no Supabase-specific features beyond hosting. Everything
   else is Phase 4+.

**PostgreSQL/Supabase is appropriate.** The workload is small (thousands of rows,
tens of thousands of reads/month), relational (identity → alias → claim → source),
and needs constraints, uniqueness, and multi-row conflict preservation — all of
which Redis and JSON files cannot express. Supabase is a reasonable managed
Postgres; nothing in this design requires Supabase Auth, Realtime, Storage, or
PostgREST. **Access is server-side only, via the service role, from Vercel
functions. Row Level Security is enabled with zero permissive policies** as a
belt-and-braces default-deny, because the anon key must never be able to read
this data and RLS is the only thing that guarantees that if a key ever leaks.

---

## 2. Current data inventory

| # | Source | File / module | Structure | Identity fields | Lifecycle fields | Confidence fields | Provenance | Disposition |
|---|--------|---------------|-----------|-----------------|------------------|-------------------|------------|-------------|
| 1 | Verified model-age DB | `data/model-age-db.json` (26 records) read by `lib/model-age-db.js` + `lib/serial-refinement/local-evidence.js` | `{records:[...]}`, `schemaVersion: serial-refinement-v2` | `brand`, `model`, `normalizedBrand`, `normalizedModel`, `aliases[]`, `exactAliases[]`, `displayModel` | `yearStart`, `yearEnd`, `productionRange`, `productionRangeObject`, `modelYear`, `exactManufactureYear`, `legacyEstimatedYear` | `confidence`, `identityConfidence`, `timingConfidence`, per-evidence `quality` + `verified` | `source`, `notes`, `refinementEvidence[].sourceUrl`/`sourceName` | **Keep local + mirror later** |
| 2 | Model-production DB | `lib/data/model-production-database.json` (2,270 rows, 1.7 MB) read by `lib/model-era-lookup.js` | flat array | `brand`, `model` (**1,804 of 2,270 are wildcard patterns** e.g. `ADFS2524R**`), `modelFamily` | `productionStartYear`, `productionEndYear`, `discontinuedYear` | `confidence` (**100% `strong-secondary`**), `usefulness` (`narrows-strong`/`narrows-weak`/`resolves`) | `introductionSource`, `introductionSourceUrl` (all ENERGY STAR), `lastVerified` | **Migrate later, as families** |
| 3 | VIZIO generation registry | `data/vizio-tv-generations.json` + `lib/vizio/model-generation-resolver.js` | `{schemaVersion:1, exactModels[], generationPatterns[], evidence[]}` — **already normalized with an evidence-id table** | `canonicalModel`, `aliases[]`, `series` | `modelYear`, `productionRange{start,end}` | `identityConfidence`, `timingConfidence`, `estimateBasis` | `evidenceIds[]` → `evidence[]` | **Keep local + mirror later** |
| 4 | General family registry (incl. Lenovo ST50) | `lib/smart-lookup/family-registry.js` (665 lines) | **code**: regexes + `GENERAL_FAMILY_CONTEXT` prose | `familyId`, `modelLineId`, `familyPattern`, `modelLinePattern` | `familyRange`, `modelLineRanges{start,end,current,basis}` | `confidence` | prose citations in comments | **Keep local only** |
| 5 | Smart Lookup static/family results | `lib/smart-lookup/static-results.js`, `replacement-static-results.js` | hand-authored result cards | query text | embedded ranges | embedded | prose | **Do not persist** |
| 6 | Redis evidence caches | `lib/serial-refinement/deterministic/cache.js` | 3 namespaces: raw Serper (24 h), extracted facts (7 d), shared evidence (**180 d** / 15 min negative) | cache-key digests only | inside cached payload | inside payload | inside payload | **Deprecate as durability; keep as hot cache** |
| 7 | Shared evidence objects | `lookupModelEvidence()` return value | `{modelIdentity, requestedIdentity, matchedIdentity, facts[], lifecycle, status, providerSummary, timings}` | `matchedIdentity.{model, normalizedModel, matchType}` | `lifecycle.supported{ProductionStart,ProductionEnd,Discontinuation}Year` | `facts[].extraction.confidence`, `identity.effectiveMatchType` | `facts[].source.{url,domain,title,sourceType}` | **Migrate — this is the write-back payload** |
| 8 | Final response caches | `buildSmartAgeCacheKey`, `buildSerialRefinementCacheKey` | rendered response payloads | key digests | — | — | — | **Do not persist** (presentation, not knowledge) |

### Per-source rationale

**(1) model-age DB — keep local, mirror later.** It is 26 records, checked into
git, code-reviewed, covered by `findExactEvidenceCollisions()` integrity tests,
and read in ~1 ms with zero network. It is the *deterministic accelerator* the
constraints tell us to preserve. Mirroring it into Postgres later is useful for
provenance and conflict detection, but the JSON file stays authoritative and
stays first in the read order.

**(2) model-production DB — migrate later, and only as families.** 79% of its
rows are wildcard patterns, which are **model families, not products**. Importing
them as `products` rows with `identity_kind = 'model_family'` is correct;
importing them as exact models would poison exact-model matching permanently.
Every row is `strong-secondary` ENERGY STAR availability data — real evidence,
but a *proxy* for introduction, exactly as its own `notes` field says. It also
carries `lastVerified: 2026-07-29`, which maps cleanly onto `last_verified_at`.
Import it in Phase 3F, not before, because 2,270 rows of uniform-confidence
proxy data would drown the small volume of genuinely strong evidence during
early tuning.

**(3) VIZIO registry — keep local, mirror later.** Note this file is the closest
existing thing to the proposed schema: `exactModels` with `aliases[]` and
`evidenceIds[]` pointing at a shared `evidence[]` table is *precisely* the
products/aliases/claims/sources shape. It validates itself on load
(`validateVizioGenerationRegistry`) including alias-collision checks. Keep it
local; it is a benchmarked fast path (`tests/benchmarks/vizio-generation-benchmark.test.mjs`).

**(4) family-registry — keep local only, never migrate.** It is regex and prose,
not rows. `modelLinePattern`, `buildModelLineId(match)`, and
`generationSummary[]` are executable logic. Putting regexes in a database means
executing database-sourced regexes, which is both a ReDoS surface and untestable.
The ST50 entry is deliberately conservative code with source citations in
comments; it belongs in code review, not in a table.

**(5) static results — do not persist.** These are rendered UI cards, not claims.

**(6) Redis — deprecate as durability.** Redefined in §14.

**(8) response caches — do not persist.** Response schemas change; the whole
premise is that the DB survives schema changes.

---

## 3. Domain model

Four concepts, five tables plus one join table:

```
products ──1:N──> product_aliases
   │
   ├──1:N──> evidence_claims ──M:N──> evidence_sources
   │              │                (via claim_sources)
   │              └──self-FK──> evidence_claims (superseded_by)
   │
   └──self-FK──> products (family_product_id)
```

**Decisions taken deliberately:**

- **No `product_families` table.** A family is a product whose identity is coarser.
  Discriminate with `identity_kind IN ('exact_model','model_line','model_family')`
  on `products`, and link membership with a self-referencing `family_product_id`.
  Rationale: aliases, claims, and sources attach identically to a family and to an
  exact model; a separate table would duplicate all three relationships and force
  every read query to branch. This directly answers §2's Whirlpool requirement —
  `WED4850HW0` (exact) and `WED4850H` (family) are two rows in `products` linked by
  `family_product_id`, with the family's lifecycle claim stored **once**.
- **No `model_lifecycle_claims` table separate from `evidence_claims`.** Lifecycle
  is a `claim_type` value, not a table.
- **No `evidence_conflicts` table.** A conflict is *the natural state of the data*:
  two `active` claims of the same `claim_type` on the same product with different
  values. Materializing it into a table means keeping two representations in sync.
  Detection is a query (§8); a partial index makes it fast.
- **No `evidence_revisions` table.** `evidence_claims` is **append-only for values**.
  A claim's `start_year`/`end_year`/`point_year` are never UPDATEd. Only `status`,
  `claim_confidence`, `last_verified_at`, `superseded_at`, and `superseded_by_id`
  change. The claims table therefore *is* the audit history.
- **`claim_sources` join table is required, not optional.** One retrieved page
  routinely supports several claims (production start *and* category *and* family
  membership), and one claim is routinely supported by several pages. Denormalizing
  a `source_id` onto claims would duplicate URL rows and break "how one source can
  support multiple evidence claims" (§6).

---

## 4. `products`

```sql
CREATE TYPE product_identity_kind AS ENUM ('exact_model','model_line','model_family');
CREATE TYPE identity_status       AS ENUM ('provisional','accepted','disputed','retired');
CREATE TYPE confidence_level      AS ENUM ('low','medium','high');

CREATE TABLE products (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id           uuid NOT NULL DEFAULT gen_random_uuid(),

  -- Identity ---------------------------------------------------------------
  brand               text NOT NULL,          -- display form, as sourced
  brand_key           text NOT NULL,          -- normalizeEvidenceBrand(); '' = unknown
  canonical_model     text NOT NULL,          -- display form, e.g. 'WED4850HW0'
  normalized_model    text NOT NULL,          -- compactModelToken(), e.g. 'WED4850HW0'
  identity_kind       product_identity_kind NOT NULL,
  identity_status     identity_status  NOT NULL DEFAULT 'provisional',
  identity_confidence confidence_level NOT NULL DEFAULT 'medium',

  -- Classification ---------------------------------------------------------
  category            text,                   -- 'dryer','television',...
  subcategory         text,
  family_product_id   bigint REFERENCES products(id) ON DELETE SET NULL,
  model_line          text,                   -- display label only, e.g. 'ThinkSystem ST50'

  -- Bookkeeping ------------------------------------------------------------
  first_seen_at       timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT products_normalized_model_len CHECK (char_length(normalized_model) BETWEEN 3 AND 64),
  CONSTRAINT products_no_self_family       CHECK (family_product_id IS DISTINCT FROM id)
);
```

**Field decisions:**

| Question | Decision |
|---|---|
| `brand` string or FK? | **String + normalized `brand_key`.** A brand table buys nothing today: `normalizeEvidenceBrand()` already canonicalizes, and `lib/model-era-lookup.js` already holds the only alias map (`GENERALELECTRIC → GE`). A FK adds a join to the hottest read path for zero correctness gain. Revisit only if brand-level attributes appear. |
| Unknown brand? | `brand_key = ''` (empty string, **never NULL**) and `brand = ''`. NULL would break the unique index — Postgres treats NULLs as distinct, so two "unknown brand WED4850HW0" rows could both insert. `lookupModelEvidence` already tolerates brandless search (`allowBrandlessSearch: !brand`), and a brandless identity is `identity_confidence = 'low'`. |
| `manufacturer_product_id`? | **Omitted.** No current source supplies one. Adding a nullable column nothing writes is speculative generality (YAGNI). |
| `product_family` as text? | **No** — a text family invites the same family being spelled two ways. Use `family_product_id` FK to a `model_family` row. `model_line` stays free text because it is a *display label*, and its recognition logic lives in `family-registry.js`. |
| Exact models and families in one table? | **Yes, one table, discriminated.** See §3. |
| A meaningful query that is not a SKU? | It becomes a `model_family` or `model_line` product. `Lenovo ThinkSystem ST50` → `identity_kind = 'model_line'`, `normalized_model = 'THINKSYSTEMST50'`. Consumers already distinguish tiers via `querySpecificity`, and `acceptedMatchTypes()` in `service.js` already refuses family evidence for exact-model queries. |
| Which fields belong elsewhere? | Every *year* belongs in `evidence_claims`, never on `products`. `products` answers "what is this thing", never "when was it made". This is the load-bearing rule that keeps the schema stable across provider changes. |
| `last_seen_at` vs `updated_at`? | `last_seen_at` = last time a lookup resolved to this identity (cheap, updated on read-path write-back only when `> 24 h` stale, to avoid a write on every read). `updated_at` = last row mutation. |

`public_id` exists so telemetry and any future debug surface can reference a
product without leaking a sequential internal id (§20).

---

## 5. `product_aliases`

```sql
CREATE TYPE alias_type AS ENUM (
  'transcription_variant',   -- WED4850HWO -> WED4850HW0 (O/0, I/1, L/1)
  'manufacturer_alias',      -- verified label/parts variant (exactAliases today)
  'retailer_alias',
  'revision_variant',        -- trailing revision/suffix differences
  'family_alias',            -- alias of a family/model-line identity
  'legacy_model_number',
  'user_observed_variant'    -- observed in input, never auto-trusted
);

CREATE TABLE product_aliases (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id        bigint NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  brand_key         text NOT NULL,   -- denormalized from products for the unique index
  alias             text NOT NULL,   -- as observed
  normalized_alias  text NOT NULL,   -- compactModelToken()

  alias_type        alias_type NOT NULL,
  equivalence_reason text,           -- 'terminal-o-zero-transcription', 'i-one-transcription', ...
  alias_confidence  confidence_level NOT NULL DEFAULT 'low',
  is_verified       boolean NOT NULL DEFAULT false,
  is_retired        boolean NOT NULL DEFAULT false,
  retired_reason    text,

  source            text NOT NULL,   -- 'local-model-age-db' | 'shared-identity' | 'evidence-corroborated' | 'manual'
  observation_count integer NOT NULL DEFAULT 1,

  first_seen_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at      timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT alias_min_length CHECK (char_length(normalized_alias) >= 6)  -- MIN_EXACT_TOKEN_LENGTH
);
```

The `char_length >= 6` check is `MIN_EXACT_TOKEN_LENGTH` from
`lib/model-evidence/exact-model-match.js` expressed as a database invariant.
A shorter token cannot carry an identity claim and must never be persisted.

### Alias policy

**Globally unique or brand-scoped? — Brand-scoped**, matching
`matchExactModelEvidence(records, model, {brand})`, which filters by brand before
matching. Enforced by `UNIQUE (brand_key, normalized_alias)` (§15). Cross-brand
collisions are *permitted rows* but are surfaced by a data-integrity query — the
Postgres analogue of `findExactEvidenceCollisions()`.

**Safe to persist automatically (Phase 3C):**

- `transcription_variant` where `isCanonicalTranscriptionEquivalent(entered, canonical)`
  returns true **and** at least one accepted exact-match evidence claim already
  resolved to that product. This is exactly the WED4850HWO → WED4850HW0 case, and
  it is safe because the transformation is bounded to single-character O/0, I/1,
  L/1 substitutions of equal length.
- `manufacturer_alias` seeded from `exactAliases[]` in `model-age-db.json`
  (already human-verified and collision-checked).

**Requires corroboration (2+ independent source domains, or one `manufacturer`-type
source) before `is_verified = true`:** `retailer_alias`, `revision_variant`,
`legacy_model_number`.

**Never auto-persisted as verified:** anything a provider *asserted* was an alias
without a matching token in a retrieved page — i.e. `fact.identity.suggestedMatchType`
without a corresponding `deterministicMatchType`. Those may be written as
`user_observed_variant`/`is_verified = false`, which is read-only telemetry data
and never participates in matching.

**When may an alias participate in exact-model matching?**
Only when `is_verified = true AND is_retired = false AND alias_type IN
('transcription_variant','manufacturer_alias','revision_variant')`. This mirrors
the existing separation of `exactAliases` (strict equality, identity-bearing)
from `aliases` (fuzzy search terms) documented in `exact-model-match.js` — and
that separation **must survive into the schema**. `family_alias` never satisfies
an exact-model query.

**Preventing alias poisoning:**
1. Length floor (DB CHECK).
2. Brand-scoped uniqueness (DB UNIQUE).
3. An alias may never equal another product's `normalized_model` in the same brand
   — enforced by a nightly integrity query, not a trigger (a trigger on the write
   path could reject a whole write-back for a data-quality issue).
4. Transcription aliases must pass `isCanonicalTranscriptionEquivalent()` in
   application code before insert.
5. Only verified aliases match; provisional aliases are inert.

**Retiring an alias:** set `is_retired = true` + `retired_reason`, never DELETE.
Deleting loses the fact that the alias was once believed, which is the only way
to diagnose a bad past result. Retirement immediately removes it from the
partial index used for matching (§15).

---

## 6. `evidence_claims`

```sql
CREATE TYPE claim_type AS ENUM (
  'production_start','production_end','introduction_year','availability_year',
  'discontinuation_year','model_generation','family_membership',
  'category','brand_identity','canonical_model'
);
CREATE TYPE claim_status AS ENUM ('active','superseded','disputed','rejected');
CREATE TYPE evidence_quality AS ENUM ('verified','strong','supported','weak','conflicting','deprecated');
CREATE TYPE date_precision AS ENUM ('day','month','year','approximate','unknown');
CREATE TYPE identity_match_type AS ENUM ('exact','canonical-equivalent','variant','family','mismatch','unknown');

CREATE TABLE evidence_claims (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id        bigint NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  claim_type        claim_type NOT NULL,

  -- Typed year columns. Exactly one shape is populated per claim_type.
  start_year        smallint,
  end_year          smallint,
  point_year        smallint,
  -- Non-temporal claims only (category / brand_identity / canonical_model /
  -- family_membership target label). NEVER used for years.
  claim_value       text,

  precision         date_precision NOT NULL DEFAULT 'year',
  identity_match    identity_match_type NOT NULL,
  evidence_quality  evidence_quality NOT NULL,
  claim_confidence  confidence_level NOT NULL,
  status            claim_status NOT NULL DEFAULT 'active',

  basis             text NOT NULL,   -- 'exact-model-lifecycle-evidence','energy-star-availability','local-verified-record',...
  extractor         text,            -- 'gemini' | 'local-database' | 'manual'
  extractor_model   text,            -- e.g. 'gemini-2.5-flash' — provenance, not identity

  first_seen_at     timestamptz NOT NULL DEFAULT now(),
  last_verified_at  timestamptz NOT NULL DEFAULT now(),
  superseded_at     timestamptz,
  superseded_by_id  bigint REFERENCES evidence_claims(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT claim_year_bounds CHECK (
    (start_year  IS NULL OR start_year  BETWEEN 1900 AND 2100) AND
    (end_year    IS NULL OR end_year    BETWEEN 1900 AND 2100) AND
    (point_year  IS NULL OR point_year  BETWEEN 1900 AND 2100)
  ),
  CONSTRAINT claim_range_ordered CHECK (start_year IS NULL OR end_year IS NULL OR end_year >= start_year),
  CONSTRAINT claim_shape CHECK (
    CASE claim_type
      WHEN 'production_start'     THEN point_year IS NOT NULL AND claim_value IS NULL
      WHEN 'production_end'       THEN point_year IS NOT NULL AND claim_value IS NULL
      WHEN 'introduction_year'    THEN point_year IS NOT NULL AND claim_value IS NULL
      WHEN 'availability_year'    THEN point_year IS NOT NULL AND claim_value IS NULL
      WHEN 'discontinuation_year' THEN point_year IS NOT NULL AND claim_value IS NULL
      WHEN 'model_generation'     THEN start_year IS NOT NULL
      ELSE claim_value IS NOT NULL AND point_year IS NULL
    END
  ),
  CONSTRAINT claim_superseded_consistent CHECK (
    (status = 'superseded') = (superseded_at IS NOT NULL)
  ),
  CONSTRAINT claim_value_len CHECK (claim_value IS NULL OR char_length(claim_value) <= 200)
);
```

### Typed columns, not EAV — and why

A generic `(entity, attribute, value text)` table would let the store hold
anything, which sounds flexible and is in fact the failure mode: it moves every
invariant into application code, makes `end_year >= start_year` unexpressible,
makes "find the single active production_start for this product" a text cast, and
makes a bad Gemini extraction indistinguishable from a good one at the storage
layer. Typed columns plus a `claim_shape` CHECK mean **a malformed claim cannot be
stored at all**. The cost is one migration when a genuinely new claim shape
appears — which, given ten claim types cover every fact `service.js` produces
today, is a cost worth paying.

### Claim type mapping from existing code

`service.js` `EVENT_TYPES` → `claim_type`:

| `fact.eventType` (today) | `claim_type` | Notes |
|---|---|---|
| `production_start` | `production_start` | `point_year` |
| `production_end` | `production_end` | `point_year` |
| `launch` | `introduction_year` | |
| `availability` | `availability_year` | ENERGY STAR data lands here |
| `discontinuation` | `discontinuation_year` | |
| `manual_publication`, `review_publication`, `listing_publication`, `page_update` | **not persisted as claims** | `targetForEvent()` already classifies these `source_only`. They are existence evidence, never lifecycle truth. They may be persisted as `evidence_sources` rows attached to another claim, never as claims themselves. |
| `owner_purchase`, `ownership_age` | **never persisted** | `target: 'specific_unit'` — these are *unit* facts. Persisting them as model lifecycle would violate the "do not persist individual manufacture year guesses as model lifecycle truth" constraint. |

**Rule enforced in the adapter, not the DB:** only facts with
`fact.target === 'model_lifecycle'` become temporal claims.

---

## 7. `evidence_sources` and `claim_sources`

```sql
CREATE TYPE source_type AS ENUM (
  'manufacturer','manual','manufacturer_support','spec_sheet','energy_star',
  'regulatory_database','retailer','parts_catalog','review','news','forum',
  'reddit','search_snippet','local_database','other'
);
CREATE TYPE source_quality AS ENUM ('primary','strong_secondary','secondary','weak','untrusted');

-- One row per distinct URL, reused across products and claims.
CREATE TABLE evidence_sources (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  url              text NOT NULL,
  url_hash         text NOT NULL,          -- sha256(normalized url), hex
  domain           text NOT NULL,
  source_type      source_type NOT NULL,
  source_quality   source_quality NOT NULL,
  title            text,
  publication_date date,
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_retrieved_at timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT source_url_https CHECK (url ~ '^https://'),
  CONSTRAINT source_url_len   CHECK (char_length(url) <= 2048),
  CONSTRAINT source_title_len CHECK (title IS NULL OR char_length(title) <= 300)
);

-- One row per (claim, source) pair: how this source supports this claim.
CREATE TABLE claim_sources (
  claim_id                  bigint NOT NULL REFERENCES evidence_claims(id) ON DELETE CASCADE,
  source_id                 bigint NOT NULL REFERENCES evidence_sources(id) ON DELETE RESTRICT,

  normalized_fact           text NOT NULL,   -- <= 400 chars, normalized, not page text
  exact_model_match         boolean NOT NULL DEFAULT false,
  canonical_equivalent_match boolean NOT NULL DEFAULT false,
  matched_token             text,
  provider                  text NOT NULL,   -- 'serper' | 'local-database' | 'manual'
  search_query_hash         text,            -- sha256 of the query terms; never the raw query
  retrieved_at              timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (claim_id, source_id),
  CONSTRAINT claim_source_fact_len CHECK (char_length(normalized_fact) <= 400)
);
```

**Decisions:**

| Question | Decision |
|---|---|
| Store the raw extracted fact? | **Yes, but only as a short normalized fact** (`normalized_fact`, ≤ 400 chars), which is what `fact.claimText` already contains — a single-sentence restatement produced by the extractor, not copied page prose. It is required: without it the UI cannot render "why", and `sharedEvidenceToRefinementEvidence()` maps it to `supports`. |
| How much source text? | **Title (≤ 300) + one normalized fact (≤ 400). Nothing else.** No snippets, no HTML, no page bodies. |
| Copyrighted page content? | **Never persisted.** Snippets from Serper stay in the 24-hour Redis raw-search cache and are discarded. Only URL, domain, title, publication date, and the derived fact are durable. This is both a licensing position and a storage-cost position. |
| Only a short normalized fact retained? | Yes — see above. |
| Deduplicate URLs? | **Yes, globally**, on `url_hash` of a normalized URL (lowercase scheme+host, strip `www.`, strip fragment, strip tracking params `utm_*`, `gclid`, `fbclid`, sort remaining query params). One manufacturer spec page supporting forty models is one row. |
| One source supporting multiple claims? | That is exactly what `claim_sources` is for. The per-link identity fields (`exact_model_match`, `matched_token`) live on the join row, because the *same page* can be an exact match for one product and a family match for another. |

`source_quality` is deliberately independent from `evidence_quality`: a
`manufacturer`/`primary` page can still yield a `weak` claim if the extractor
matched only a family token.

---

## 8. Confidence and evidence quality

Four separate dimensions. They are **never** collapsed:

| Dimension | Column | Values | Owner | Existing repo analogue |
|---|---|---|---|---|
| **Source quality** | `evidence_sources.source_quality` | `primary`, `strong_secondary`, `secondary`, `weak`, `untrusted` | Domain/source-type policy, deterministic | `fact.source.sourceType` allowlists in `service.js:383` and `adapters.js:803`; `evidence-policy.js` `OFFICIAL_QUALITIES` / `SECONDARY_QUALITIES` |
| **Identity confidence** | `products.identity_confidence` + `evidence_claims.identity_match` | `low/medium/high`; `exact`…`unknown` | `buildSharedModelIdentity()` + `aggregateIdentity()` | `modelIdentity.identityConfidence`, `matchedIdentity.matchType` |
| **Claim confidence** | `evidence_claims.claim_confidence` + `evidence_quality` | `low/medium/high`; `verified…deprecated` | Corroboration count + source quality + identity match | `fact.extraction.confidence`, `evidence.quality` |
| **Result confidence** | **not stored** | — | Computed per request by `evaluateEvidencePolicy()` / `evaluateCandidates()` | `response.confidence` |

**Storing result confidence would be a bug.** Result confidence depends on the
serial candidate years supplied *in the request*; the same claim yields `resolved`
for one serial and `ambiguous` for another. The deterministic evaluator must stay
the only thing that produces it — which is also the "never bypass the existing
deterministic evaluator" constraint.

**`evidence_quality` promotion ladder** (computed at write time, recomputed when a
new corroborating source attaches):

| Quality | Requirement |
|---|---|
| `verified` | Human-curated (`extractor = 'manual'`) or mirrored from `model-age-db.json` |
| `strong` | `identity_match ∈ {exact, canonical-equivalent}` **and** ≥ 1 `primary` source, **or** ≥ 2 independent `strong_secondary` domains |
| `supported` | `identity_match ∈ {exact, canonical-equivalent}` and exactly 1 `strong_secondary`/`secondary` source |
| `weak` | `identity_match = 'family'`/`'variant'`, or a single `weak` source |
| `conflicting` | Set on **all** participating claims when an unresolved disagreement exists (§9) |
| `deprecated` | Superseded, or its only source is retired/unreachable |

Mapping into the existing `evidence-policy.js` vocabulary on read:
`verified|strong → 'official'`, `supported → 'strong-secondary'`,
`weak → 'model-intelligence'`, `conflicting|deprecated →` excluded from the range
computation but still returned for display. This means **no change to
`evaluateEvidencePolicy()` is required** — the store's output enters the existing
policy through the existing adapter.

---

## 9. Conflict and supersession policy

**Never last-write-wins.** A new claim never UPDATEs an existing one.

### Case A — Source A says production began 2019, Source B says 2020

Two rows in `evidence_claims`, same `product_id`, same `claim_type =
'production_start'`, `point_year` 2019 and 2020, both `status = 'active'`.

Resolution rules, applied in order at **write time**:

1. **Same value → merge, not duplicate.** Attach the new source to the existing
   claim via `claim_sources`, bump `last_verified_at`, possibly promote
   `evidence_quality`. Idempotency (§12).
2. **Different values, one strictly outranks the other** — an `exact`-identity
   `primary`-source claim beats a `family`-identity `secondary`-source claim.
   Loser: `status = 'superseded'`, `superseded_at = now()`,
   `superseded_by_id = <winner>`. Winner keeps `evidence_quality`.
3. **Different values, comparable strength → both stay `active`**, both get
   `evidence_quality = 'conflicting'`, and the product now has an unresolved
   lifecycle disagreement.

**Confidence is recalculated** on the affected claims only (a bounded, single-product
operation), never globally.

**Audit history is retained** by construction: superseded rows are never deleted,
and `superseded_by_id` forms a chain.

**What each consumer receives:**

| Consumer | Behavior on conflicting claims |
|---|---|
| `lookupModelEvidence` | Emits **both** as `facts[]` entries. `uniqueLifecycleYear()` already returns `{value: null, conflict: true}` when it sees two distinct years, and `statusFor()` already maps that to `status: 'partial'`, `failureCategory: 'EVIDENCE_CONFLICT'`. **No new code path.** |
| Serial Refinement | `EVIDENCE_CONFLICT` → `compatibilityStatus()` → `'success'` with partial evidence → deterministic evaluator sees two ranges → `ambiguous`/`ambiguous_with_era`. Serial candidates are preserved. Correct and already implemented. |
| Smart Lookup | `sharedEvidenceToSmartLookupInput()` receives `supportedProductionStartYear: null`; the usable-evidence gate falls through to the broader tier or returns null and research proceeds. Correct today. |

### Case B — Source A recognizes `WED4850HW0`, Source B describes `WED4850HWO` as separate

This is an **identity** conflict, not a lifecycle conflict, and it is resolved
*before* claims are written. `isCanonicalTranscriptionEquivalent('WED4850HW0',
'WED4850HWO')` is true (single terminal O/0 substitution, equal length), so
Source B's token is recorded as a `transcription_variant` alias of the existing
product — **not** as a second product. Source B's fact is attached to the same
`product_id` with `identity_match = 'canonical-equivalent'`.

If a token is *not* transcription-equivalent (e.g. a genuine revision suffix), the
write path creates a **separate product** with `identity_status = 'provisional'`
and no alias link. Two products is the safe outcome; one wrong merged product is
not recoverable.

**Detection query** (also the basis for the partial index in §15):

```sql
SELECT product_id, claim_type, count(DISTINCT coalesce(point_year, start_year)) AS distinct_values
FROM evidence_claims
WHERE status = 'active' AND claim_type IN ('production_start','production_end','introduction_year')
GROUP BY product_id, claim_type
HAVING count(DISTINCT coalesce(point_year, start_year)) > 1;
```

---

## 10. Freshness policy

Four *distinct* clocks. The current architecture conflates them; the store must not.

| Clock | What it governs | Where it lives |
|---|---|---|
| **Evidence freshness** | Is a stored claim still trustworthy without re-verification? | `evidence_claims.last_verified_at` + policy below |
| **Redis TTL** | How long a *rendered* payload may be served without touching Postgres | `deterministic/cache.js`, `smart-lookup/cache.js` |
| **Negative-lookup TTL** | How long "we researched this and found nothing" suppresses re-research | Redis only — **never** Postgres |
| **Revalidation interval** | How often a *fresh* claim is opportunistically re-checked | `last_verified_at` + SWR (§13) |

### Recommended evidence-freshness defaults

Derived from this domain, not from the generic ranges in the brief. The governing
fact: **appliance and TV production windows are historical.** A dryer introduced
in 2019 was still introduced in 2019 next year. What actually decays is (a) the
*end* of a production window for a currently-shipping product, and (b) weak
single-source claims that may be corrected. Start years for discontinued products
barely decay at all.

| Claim class | `stale_after` | `expire_after` (force re-research) | Rationale |
|---|---|---|---|
| `verified` (curated / mirrored from `model-age-db.json`) | **never** | never | Human-reviewed, in git, collision-tested |
| `strong` + `production_start`/`introduction_year`, product has an `end_year` | **365 d** | never | A closed historical window does not change |
| `strong` + `production_start`, product still current (`end_year IS NULL`) | **180 d** | never | Start is fixed; revalidation exists to *find* the end |
| `strong` + `production_end`/`discontinuation_year` | **180 d** | 730 d | End dates get revised as stock clears |
| `supported` (single secondary source) | **90 d** | 540 d | One source may be corrected |
| `weak` (family/variant identity) | **45 d** | 270 d | Weakest useful signal; refresh cheaply |
| `conflicting` | **30 d** | 180 d | Actively wants a tiebreaker source |
| `deprecated`/`superseded` | n/a | n/a | Never served |

Two thresholds, not one: **stale ⇒ serve immediately and schedule a refresh
(§13). Expired ⇒ serve as a reserve but do not count as a DB hit** — research
runs as if it were a miss, and the stale claim is only used if research fails.
This is the estimate-first principle applied to the store.

**Negative results are never persisted to Postgres.** "We found nothing" is a
statement about a provider on a given day, not knowledge about a product. It stays
in Redis at `NEGATIVE_EVIDENCE_TTL_SECONDS` (15 min), where it already lives. This
also keeps table growth proportional to *knowledge*, not to traffic.

---

## 11. Repository interface

Provider-neutral, in `lib/model-evidence/store/`. Structure chosen to sit beside
the existing `lib/model-evidence/` modules rather than creating a parallel
top-level tree (the repo already groups by domain, not by technology).

```
lib/model-evidence/store/
  index.js               # createEvidenceStore(config) -> store | nullStore
  store-interface.js     # JSDoc contracts + createNullStore() (always-miss)
  postgres-store.js      # the ONLY file that imports a pg/supabase client
  normalization.js       # re-exports identity fns; adds URL normalization + url_hash
  freshness.js           # classifyFreshness(claim, now) -> 'fresh'|'stale'|'expired'
  mappers.js             # DB rows <-> shared-evidence facts[] (both directions)
```

**`postgres-store.js` is the only file in the repository permitted to import a
database client.** Everything else depends on the interface. This is what makes
the store swappable and what keeps Supabase out of 99% of the codebase.

### Contracts

```js
/**
 * @typedef {Object} ProductIdentityRow
 * @property {string}  publicId
 * @property {string}  brand
 * @property {string}  brandKey
 * @property {string}  canonicalModel
 * @property {string}  normalizedModel
 * @property {'exact_model'|'model_line'|'model_family'} identityKind
 * @property {'low'|'medium'|'high'} identityConfidence
 * @property {string|null} category
 * @property {string|null} familyPublicId
 * @property {'canonical-model'|'exact-alias'|'transcription-alias'|'family'} matchedBy
 * @property {string|null} equivalenceReason
 */

/**
 * @typedef {Object} StoredClaim
 * @property {string} claimType
 * @property {number|null} pointYear
 * @property {number|null} startYear
 * @property {number|null} endYear
 * @property {string|null} claimValue
 * @property {'exact'|'canonical-equivalent'|'variant'|'family'|'mismatch'|'unknown'} identityMatch
 * @property {'verified'|'strong'|'supported'|'weak'|'conflicting'|'deprecated'} evidenceQuality
 * @property {'low'|'medium'|'high'} claimConfidence
 * @property {string} basis
 * @property {string} lastVerifiedAt
 * @property {'fresh'|'stale'|'expired'} freshness
 * @property {StoredSource[]} sources
 */

/**
 * @typedef {Object} StoredSource
 * @property {string} url
 * @property {string} domain
 * @property {string} sourceType
 * @property {string} sourceQuality
 * @property {string|null} title
 * @property {string} normalizedFact
 * @property {boolean} exactModelMatch
 */

/**
 * @typedef {Object} EvidenceBundle
 * @property {ProductIdentityRow} product
 * @property {StoredClaim[]} claims
 * @property {'fresh'|'stale'|'expired'} freshness   // weakest across lifecycle claims
 * @property {boolean} conflict
 * @property {number} readMs
 */
```

**Read API** (all return `null` on miss, **never throw** to callers):

```js
findProductByCanonicalModel({ brandKey, normalizedModel })      -> ProductIdentityRow|null
findProductByAlias({ brandKey, normalizedAlias })               -> ProductIdentityRow|null
resolveProductIdentity({ brand, model, searchModels[], category })
                                                                 -> ProductIdentityRow|null
getEvidenceClaims({ productId, claimTypes?, includeSuperseded? })-> StoredClaim[]
getEvidenceSources({ claimIds[] })                               -> Map<claimId, StoredSource[]>
getBestLifecycleEvidence({ brand, model, searchModels[], category, now })
                                                                 -> EvidenceBundle|null
```

`getBestLifecycleEvidence` is the **only** function the read path calls. It is one
round trip (§15) and internally does identity resolution + claims + sources.
The others exist for tests, tooling, and write-back.

**Write API** (Phase 3C+, all idempotent):

```js
upsertProduct(identity, { source })                       -> { productId, created }
upsertAlias({ productId, alias, aliasType, ... })         -> { aliasId, created }
persistEvidence({ productId, claims[] }, { requestId })   -> { written, merged, rejected[] }
attachSource({ claimId, source, link })                   -> { sourceId, linked }
markEvidenceStale({ claimId, reason })                    -> void
supersedeEvidence({ claimId, bySupersedingClaimId })      -> void
recordConflict({ productId, claimType, claimIds[] })      -> void   // sets quality='conflicting'
touchProductLastSeen({ productId })                       -> void   // throttled to 24h
```

`resolveProductIdentity` **calls `buildSharedModelIdentity()`** to produce
`searchModels` — it does not implement its own normalization. This is the
"do not create a second identity-normalization implementation" constraint made
structural.

### Null store

`createEvidenceStore()` returns a **null store** — every read resolves to `null`,
every write is a no-op — when the flag is off, credentials are absent, or the
client fails to construct. Callers therefore have **exactly one code path**, and
"DB unavailable" is indistinguishable from "DB miss" by construction. This is
the mechanism that guarantees DB failure can never degrade behavior.

---

## 12. Read-only integration (Phase 3B)

### Single insertion point

`lib/model-evidence/service.js`, inside `lookupModelEvidence()`, immediately
after the Redis shared-evidence read (currently line ~403) and before
`gatherEvidence()` (line ~601):

```
existing: local record check
existing: Redis getSharedEvidence()          <- returns cached shared-evidence object
NEW:      store.getBestLifecycleEvidence()   <- bounded, flag-gated, failure-silent
existing: gatherEvidence() -> runEvidenceExtraction()
```

**Both consumers get it for free.** Smart Lookup (`api/age-lookup.js:785`) and
Serial Refinement (`deterministic-provider.js:53`) call this function and receive
the same `facts[]` shape; the store's claims are mapped into `facts[]` by
`mappers.js` using the same structure `localFacts()` already produces for local
DB records. `sharedEvidenceToSmartLookupInput()` and
`sharedEvidenceToRefinementInput()` need **no changes**.

Neither API route file is modified in Phase 3B except to pass a store instance
through `dependencies` for testability.

### Answers to the ordering questions

**Before or after Redis? — After.** Redis is a sub-10 ms colocated read with a
180-day TTL on this exact payload; Postgres is a 20–80 ms network round trip.
Checking Postgres first would add latency to the majority path for no benefit.
Order: `local deterministic → Redis shared-evidence → Postgres → providers`.

**Should Redis cache persistent-store results? — Yes.** A Postgres hit is
converted to a full shared-evidence object and written to Redis via the existing
`cache.setSharedEvidence()`, so the next request for the same model skips
Postgres entirely. But the TTL for a DB-sourced entry drops from 180 days to
**7 days** (§14) — durability now lives in Postgres, so Redis no longer needs a
long TTL, and a shorter one bounds how long a Postgres correction takes to
propagate.

**Should local deterministic registries outrank the DB? — Yes, unconditionally.**
`model-age-db.json`, the VIZIO registry, and `family-registry.js` are
code-reviewed, tested, and zero-latency. They run first and short-circuit. The DB
is a tier *below* local and *above* providers. This preserves "local deterministic
registries" as required.

**What happens when the DB is unavailable?** The null-store/bounded-read design
makes it identical to a miss: research proceeds, the result is unchanged, and
telemetry records `persistentStoreAttempted: true, persistentStoreHit: false,
persistentStoreError: <code>`. Availability is never mandatory.

**Latency budget: 120 ms hard cap, 400 ms reserve.** Rationale: the existing
`boundedRedisGet` uses `maxMs: 180, reserveMs: 500` for the shared-evidence read;
Serper+Gemini together need ~4–7 s of the 30–35 s function budget, and the route
deadline (`createDeadline`) is the real constraint. 120 ms is enough for a single
indexed round trip from a Vercel function to a same-region Postgres including
pooler overhead, and small enough that a slow DB costs less than 2% of the budget.
Implemented with the existing `deadline.run(stage, fn, {maxMs, reserveMs})` helper
so it participates in the same abort machinery, plus a `statement_timeout` of
`150ms` set on the connection as a server-side backstop.

---

## 13. Write-back design (Phase 3C — design only)

**The provider never writes to Postgres.** Enforced structurally: `postgres-store.js`
is imported only by `service.js`, and `gatherEvidence`/`runEvidenceExtraction`
receive no store reference.

```
Serper -> Gemini extraction -> facts[] -> deterministic validation in service.js
       -> aggregateIdentity() / uniqueLifecycleYear() (existing)
       -> acceptForPersistence() filter (NEW, pure function, unit-testable)
       -> store.persistEvidence()  -> Postgres
```

### Minimum quality for automatic persistence

A fact is persisted **only if all** hold:

1. `fact.target === 'model_lifecycle'` (excludes unit facts and publication dates)
2. `identity.effectiveMatchType ∈ {exact, canonical-equivalent, family}` — and
   `family` claims attach to the **family product**, never to an exact model
3. `Number.isInteger(fact.year)` and `1900 ≤ year ≤ currentYear + 1`
4. `source.url` matches `^https://` and the domain is not in a denylist
5. `extraction.confidence !== 'low'` **or** a second independent domain asserts
   the same value
6. The overall shared-evidence `status` is `success` or `partial` — never
   `timeout`, `error`, or `unavailable`

### What may be stored as weak/provisional

Single-source `supported`/`weak` claims from `retailer`, `parts_catalog`, or
`review` sources, and `family`-identity claims. They are stored, participate in
freshness/revalidation, and are usable — but they can never alone produce a
`resolved` result, because the deterministic evaluator (unchanged) already
requires official or two-independent-secondary evidence.

### What must never be auto-persisted

- Owner-purchase / ownership-age facts (`target: 'specific_unit'`)
- Publication, review, page-update dates as lifecycle claims
- Any fact where `deterministicMatchType === 'unknown'` and only
  `suggestedMatchType` (i.e. the LLM asserted a match no retrieved token supports)
- Anything from a `variant` or `mismatch` identity
- Serial numbers, in any column, ever
- Anything derived from a decoded serial candidate year

### Canonical aliases

**Yes, automatically — but only transcription variants**, only when
`isCanonicalTranscriptionEquivalent()` returns true, and only when an accepted
exact-identity claim already resolved to the product. Every other alias type
requires corroboration (§5) and lands as `is_verified = false`.

### Comparing updates with stored claims

Match key: `(product_id, claim_type, coalesce(point_year, start_year), coalesce(end_year, -1))`.

- **Exact key match** → merge: `attachSource()`, bump `last_verified_at`, recompute
  `evidence_quality`. No new claim row.
- **Same `claim_type`, different value** → new row; run the §9 resolution rules.
- **New `claim_type`** → new row.

### Idempotency

- `products`: `ON CONFLICT (brand_key, normalized_model, identity_kind) DO UPDATE
  SET last_seen_at = now()`.
- `product_aliases`: `ON CONFLICT (brand_key, normalized_alias) DO UPDATE SET
  observation_count = observation_count + 1, last_seen_at = now()`.
- `evidence_sources`: `ON CONFLICT (url_hash) DO UPDATE SET last_retrieved_at = now()`.
- `claim_sources`: `ON CONFLICT (claim_id, source_id) DO UPDATE SET retrieved_at = now()`.
- `evidence_claims`: no natural unique key (values may legitimately repeat across
  supersession chains), so idempotency is the **application-level match key above**,
  applied inside a single transaction with `SELECT … FOR UPDATE` on the product row.

Replaying the same request N times must produce exactly the row set of one
request. This is a required test (§21).

---

## 14. Redis relationship

```
Postgres = durable learned knowledge   (survives eviction, restart, version bumps)
Redis    = hot cache, request dedupe, rate limits, negative cache
```

### Changes to Redis behavior

| Key namespace | Today | After Phase 3D |
|---|---|---|
| `model-evidence:serper:v2` (raw search) | 24 h | **unchanged** (raw provider payloads are never durable) |
| `model-evidence:facts:v3` (extracted facts) | 7 d | **unchanged** |
| `model-evidence:normalized:v2` (shared evidence) | **180 d** | **7 d**, and the key gains an `evidenceVersion` component sourced from the store (below) |
| shared evidence, negative | 15 min | **unchanged** — negatives stay Redis-only |
| `serial-refinement:v3` (final responses) | 60 d / 14 d / 10 d | **unchanged** — these are rendered payloads, orthogonal to the store |
| `smart-age:v6` (final responses) | up to 180 d | **cap at 30 d** for `evidenceSource = 'serper-extracted'` once the store is authoritative |
| rate limits, in-flight singleflight | — | unchanged |

Dropping the shared-evidence TTL from 180 days to 7 is safe *only because*
Postgres now holds the knowledge — before the store exists, that TTL is the only
thing preventing repeat provider spend, which is exactly the problem this project
solves.

### Evidence versioning and invalidation

Add a monotonically increasing `evidence_version` to each product, bumped by any
write that changes its active claim set:

```sql
ALTER TABLE products ADD COLUMN evidence_version integer NOT NULL DEFAULT 1;
```

The Redis shared-evidence key gains `evidence_version` as a key component, so a
Postgres write **implicitly invalidates** the Redis entry — no explicit DEL, no
cross-store delete that can fail halfway. This is the cleanest available answer
to "DB updates invalidating Redis" and avoids the classic dual-write bug.

**Stale Redis vs fresh Postgres precedence:** the versioned key makes the question
moot — a Redis entry keyed on version 3 is simply unreachable once the product is
at version 4. For entries written before this scheme exists, the 7-day TTL bounds
the divergence window. **There is never a moment when both stores are consulted
and their answers must be reconciled**, which is the "avoid maintaining conflicting
truths" requirement.

---

## 15. Indexes and constraints

```sql
-- ---------- products ----------
-- Primary identity lookup. Case handled by storing already-normalized values
-- (uppercase compact for models, lowercase for brand_key) via application code,
-- so no functional/citext index is needed and the index is directly usable.
CREATE UNIQUE INDEX products_identity_uq
  ON products (brand_key, normalized_model, identity_kind);

CREATE INDEX products_family_idx
  ON products (family_product_id) WHERE family_product_id IS NOT NULL;

-- Supports brandless resolution (allowBrandlessSearch) without a full scan.
CREATE INDEX products_model_only_idx
  ON products (normalized_model);

-- ---------- product_aliases ----------
CREATE UNIQUE INDEX product_aliases_identity_uq
  ON product_aliases (brand_key, normalized_alias);

-- The hot path: only verified, non-retired, identity-bearing aliases.
CREATE INDEX product_aliases_active_idx
  ON product_aliases (brand_key, normalized_alias)
  WHERE is_verified AND NOT is_retired;

CREATE INDEX product_aliases_product_idx ON product_aliases (product_id);

-- ---------- evidence_claims ----------
-- Covers the read path: "active claims of these types for this product".
CREATE INDEX evidence_claims_active_idx
  ON evidence_claims (product_id, claim_type)
  WHERE status = 'active';

-- Revalidation sweep (§13) — only touches claims that can go stale.
CREATE INDEX evidence_claims_revalidate_idx
  ON evidence_claims (last_verified_at)
  WHERE status = 'active' AND evidence_quality <> 'verified';

CREATE INDEX evidence_claims_superseded_by_idx
  ON evidence_claims (superseded_by_id) WHERE superseded_by_id IS NOT NULL;

-- ---------- evidence_sources ----------
CREATE UNIQUE INDEX evidence_sources_url_hash_uq ON evidence_sources (url_hash);
CREATE INDEX evidence_sources_domain_idx ON evidence_sources (domain);

-- ---------- claim_sources ----------
-- PK (claim_id, source_id) covers the forward join; this covers the reverse
-- ("what does this source support?") used by source-retirement tooling.
CREATE INDEX claim_sources_source_idx ON claim_sources (source_id);
```

### Delete behavior

| FK | Action | Why |
|---|---|---|
| `product_aliases.product_id` | `ON DELETE CASCADE` | An alias without a product is meaningless |
| `evidence_claims.product_id` | `ON DELETE CASCADE` | Same |
| `claim_sources.claim_id` | `ON DELETE CASCADE` | Same |
| `claim_sources.source_id` | **`ON DELETE RESTRICT`** | A source row must not vanish while claims cite it; retire it instead |
| `products.family_product_id` | `ON DELETE SET NULL` | Losing a family must not delete its members |
| `evidence_claims.superseded_by_id` | `ON DELETE SET NULL` | Preserve the superseded row even if the superseder is removed |

### Case-insensitive handling and normalization

**Normalization happens in JavaScript, never in SQL.** `brand_key` is written by
`normalizeEvidenceBrand()` (lowercase, `&`→`and`, strip non-alphanumeric);
`normalized_model`/`normalized_alias` are written by `compactModelToken()`
(uppercase, strip non-alphanumeric). No `citext`, no `lower()` functional indexes,
no `ILIKE` on the read path. Reason: two normalization implementations *will*
drift, and the JS one is the tested one. A CHECK constraint asserts the shape:

```sql
ALTER TABLE products ADD CONSTRAINT products_brand_key_normalized
  CHECK (brand_key = lower(brand_key) AND brand_key !~ '[^a-z0-9]');
ALTER TABLE products ADD CONSTRAINT products_model_normalized
  CHECK (normalized_model = upper(normalized_model) AND normalized_model !~ '[^A-Z0-9]');
```

These are *assertions that the application normalized correctly*, not a second
implementation — they can only reject, never transform.

### Latency

The whole read is **one round trip**:

```sql
WITH resolved AS (
  SELECT p.*, 'canonical-model' AS matched_by, NULL::text AS equivalence_reason
    FROM products p
   WHERE p.brand_key = $1 AND p.normalized_model = ANY($2)
  UNION ALL
  SELECT p.*, 'alias' AS matched_by, a.equivalence_reason
    FROM product_aliases a JOIN products p ON p.id = a.product_id
   WHERE a.brand_key = $1 AND a.normalized_alias = ANY($2)
     AND a.is_verified AND NOT a.is_retired
   ORDER BY 1 LIMIT 1
)
SELECT ... FROM resolved r
  JOIN evidence_claims c ON c.product_id = r.id AND c.status = 'active'
  LEFT JOIN claim_sources cs ON cs.claim_id = c.id
  LEFT JOIN evidence_sources s ON s.id = cs.source_id;
```

Both branches of the UNION are unique-index lookups. `$2` is the array of
`searchModels` from `buildSharedModelIdentity()` (≤ 2 entries), so the canonical
and transcription forms are checked in the same query. At the table sizes in §17
this is an index-only-ish plan in single-digit milliseconds; the 120 ms budget is
almost entirely network and pooler.

---

## 16. Security model

| Control | Design |
|---|---|
| **Credentials** | `MODEL_EVIDENCE_DB_URL` (pooled connection string) or Supabase `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. Vercel **server-side** environment variables only. Never prefixed `NEXT_PUBLIC_`/`VITE_`. This is a static site — no bundler inlines env vars — but the rule is stated so a future build step cannot regress it. |
| **Browser access** | **None, ever.** No Supabase JS client is added to any browser bundle. The browser talks only to `/api/*` as it does today. `scripts/build-smart-lookup-browser.js` and `build-serial-refinement-browser.js` must not gain a store import; a test asserts the built browser bundles contain no `supabase`/`postgres`/`SERVICE_ROLE` substring. |
| **RLS** | **Enabled on all five tables with zero policies** (default deny). The service role bypasses RLS by design; the anon key gets nothing. Without RLS, a leaked anon key exposes the whole store via PostgREST. |
| **Least privilege** | Phase 3B uses a `evidence_reader` role with `SELECT` only. Write privileges arrive with Phase 3C via a separate `evidence_writer` role. The read-only deployment is enforced by grants, not by discipline. |
| **Query parameterization** | 100% parameterized. No string interpolation into SQL anywhere. Enforced by keeping all SQL in `postgres-store.js` and lint-reviewing that one file. |
| **Input sanitization** | Brand/model reach SQL only after `normalizeEvidenceBrand()`/`compactModelToken()`, which strip everything outside `[a-z0-9]`/`[A-Z0-9]`. A model number is structurally incapable of carrying SQL metacharacters by the time it reaches a query. |
| **Source URL validation** | `^https://` CHECK, ≤ 2048 chars, host must resolve publicly, and a denylist for known-bad domains. `http://`, `data:`, `javascript:`, and private/loopback hosts are rejected at write time and by the CHECK. |
| **Stored text limits** | `title` ≤ 300, `normalized_fact` ≤ 400, `claim_value` ≤ 200, `url` ≤ 2048 — all DB CHECKs, so a runaway extractor cannot inflate the table. |
| **PII / user data** | The store holds **product knowledge only**. No serials, no queries, no IPs, no user identifiers. `search_query_hash` is a SHA-256 of normalized search *terms* and is optional; if it is ever felt to be query-adjacent, drop the column — nothing depends on it. |
| **Rate limiting** | Unchanged (Upstash). The store adds no new public surface. |
| **Statement timeout** | `SET statement_timeout = '150ms'` on the read connection so a pathological plan cannot hold a Vercel function open. |

---

## 17. Cost and capacity estimate

Ranges, for capacity planning. **Not a pricing quote; vendor pricing changes.**

### Row growth model

Assume ~35% of lookups are for a *distinct* model (heavy repeat traffic is the
premise of the project), and an accepted research result produces ~1 product,
~0.3 aliases, ~2.5 claims, ~3 sources, ~4 claim_source links.

| Traffic | New distinct models/day | Rows/day (all tables) | Rows/year | DB size/year |
|---|---|---|---|---|
| 100 lookups/day | ~10–35 | ~110–380 | ~40 k–140 k | **~15–60 MB** |
| 1,000 lookups/day | ~100–350 | ~1.1 k–3.8 k | ~400 k–1.4 M | **~150–550 MB** |
| 10,000 lookups/day | ~700–3,000 | ~8 k–33 k | ~3 M–12 M | **~1.2–5 GB** |

Row width is dominated by URLs and facts: ~250 B/product, ~150 B/alias,
~200 B/claim, ~400 B/source, ~500 B/claim_source. Growth is **sublinear** — the
distinct-model rate falls as coverage grows, which is the entire point.

### Read/write volume

| Traffic | DB reads/day | DB writes/day (Phase 3C+) |
|---|---|---|
| 100 | ~35–70 (post-Redis misses only) | ~10–35 transactions |
| 1,000 | ~350–700 | ~100–350 |
| 10,000 | ~3.5 k–7 k | ~700–3,000 |

These are trivial for Postgres. **Connection count, not query volume, is the real
constraint on Vercel** — see §25 for the pooler requirement.

### Plan tier

- 100/day and 1,000/day: comfortably within a Supabase **Free**-tier footprint on
  size; Free-tier project pausing after inactivity makes **Pro** the right choice
  for anything user-facing.
- 10,000/day: **Pro** tier, with attention to storage growth past year 2 and a
  retention policy for `deprecated`/`superseded` claims older than ~3 years.

### Savings

The measurable win is provider-call avoidance. Using the repo's own cost proxies
(`COST_PROXIES_USD` in `lib/serial-refinement/telemetry.js`): `serperQuery
$0.001`, `geminiExtraction $0.0025` → **~$0.0035–0.0045 per avoided research
cycle** (a typical cycle is 1–2 Serper queries plus one extraction), and
**~$0.015–0.017** when a heavy provider (OpenAI/xAI) would otherwise have run.

Today, every Redis expiry or version bump re-pays that cost. Expected steady-state
provider-call reduction once the store is warm and SWR is live: **50–75% of
post-Redis research misses**, i.e. at 10,000 lookups/day roughly 2–5 k avoided
research cycles/day → **~$7–20/day** in provider spend, against a Pro-tier DB
cost of roughly $1/day. The store pays for itself well below 1,000 lookups/day;
below ~100/day the driver is *reliability during provider outages*, not cost.

---

## 18. Migration strategy

The proposed sequence is **almost right — with one change and one addition.**

| Phase | Content | Change from brief |
|---|---|---|
| **3A** | Schema + design (this document) | — |
| **3B** | Create DB, migrations, read adapter, **shadow-mode reads** (query, compare, log, discard) | **Changed:** the first deployment reads in *shadow* only. It cannot change any response, so rollout risk is exactly zero, and it produces real hit-rate/latency data before the store influences anything. The repo already has this pattern (`lib/model-evidence/shadow.js`, `startShadowTask`/`observeSmartLookupShadow`) — reuse it. |
| **3C** | Flip reads live behind `MODEL_EVIDENCE_STORE_ENABLED` | Was 3B |
| **3D** | Write-back of high-confidence accepted evidence | Was 3C |
| **3E** | Store becomes a normal lookup tier (Redis TTLs drop, evidence_version keying) | Was 3D |
| **3F** | Stale-while-revalidate | Was 3E |
| **3G** | Bulk enrichment (model-production DB as families; mirror model-age-db + VIZIO) | Was 3F |
| **3H** | *(added)* Data-integrity job + retention policy | **New** — collision detection, unreachable-source retirement, superseded-claim pruning. Without it the store degrades silently over years. |

**Why shadow-first:** the biggest unknown is not correctness, it is *hit rate*. If
the store's hit rate is 5%, the whole latency budget conversation changes. Shadow
mode answers that for the price of one deploy.

**Why writes before SWR:** an empty store has nothing to revalidate. SWR built
before write-back is untestable in production.

### Rollback at every stage

| Phase | Rollback | Blast radius |
|---|---|---|
| 3A | Delete the document | None |
| 3B | `MODEL_EVIDENCE_STORE_SHADOW_ENABLED=0`; shadow reads never touch responses | None |
| 3C | `MODEL_EVIDENCE_STORE_ENABLED=0` → null store → identical to today | None; no data change |
| 3D | `MODEL_EVIDENCE_STORE_WRITE_ENABLED=0`. Bad rows: `UPDATE evidence_claims SET status='rejected' WHERE created_at > $t` — reversible, nothing deleted | Bounded by time window |
| 3E | Restore Redis TTL constants (one commit) and set the store flag off | Cache-only |
| 3F | `MODEL_EVIDENCE_STORE_SWR_ENABLED=0` → stale entries served as before | None |
| 3G | Bulk imports tagged `basis = 'bulk-import:<dataset>@<date>'`; roll back with a single `UPDATE … SET status='rejected' WHERE basis LIKE 'bulk-import:%'` | Bounded by tag |
| 3H | Disable the cron | None |

Every rollback is an **environment variable or a status UPDATE**. No rollback
requires a code revert, a data restore, or a migration reversal.

---

## 19. Existing-data migration recommendations

| Dataset | Recommendation | Reasoning |
|---|---|---|
| `data/model-age-db.json` (26 verified records) | **Yes, later (3G) — mirror only** | Import as `identity_kind='exact_model'`, `evidence_quality='verified'`, `identity_status='accepted'`, plus `exactAliases[]` as `manufacturer_alias`/`is_verified=true`. **The JSON file stays authoritative and stays first in the read order.** The mirror buys unified conflict detection (a web source contradicting a curated record becomes visible) and gives write-back a verified anchor to attach corroborating sources to. It must never become the source of truth — it is git-reviewed and collision-tested today, and a DB copy has neither property. |
| `lib/data/model-production-database.json` (2,270 rows) | **Yes, later (3G) — as families, not products** | 1,804 of 2,270 rows are wildcard patterns; those become `identity_kind='model_family'` products keyed on the de-wildcarded `modelFamily` prefix. Claims: `availability_year` (not `production_start` — the source's own `notes` say ENERGY STAR certification is a *proxy*), `evidence_quality='supported'`, one shared `evidence_sources` row for `data.energystar.gov` with `source_type='energy_star'`, `source_quality='strong_secondary'`, `last_verified_at` from `lastVerified`. The 466 non-wildcard rows become `exact_model` products. **Do this last** — 2,270 rows of uniform-confidence proxy data would dominate the store during early tuning and make hit-rate telemetry meaningless. `lib/model-era-lookup.js` continues reading the JSON directly regardless; the import is additive. |
| `data/vizio-tv-generations.json` | **Yes, later (3G) — mirror only** | Structurally it is already this schema (`exactModels` + `aliases[]` + `evidenceIds[]` → `evidence[]`), so the mapping is mechanical. But it is self-validating on load, benchmarked, and zero-latency. Keep it local and first; mirror for conflict visibility. |
| `lib/smart-lookup/family-registry.js` (incl. Lenovo/ST50) | **Do not import** | It is regexes and prose, not rows. `modelLinePattern`, `buildModelLineId(match)`, `generationSummary[]` are executable logic; moving them to a table means executing DB-sourced regexes (ReDoS surface, untestable). The ST50 entry's conservatism — `V2`/`V3` with explicit `{start: null, end: null}` — is a *code review* artifact and belongs where reviewers see it. |
| `lib/smart-lookup/static-results.js`, `replacement-static-results.js` | **Do not import** | Rendered UI cards, not claims. |
| Redis cache contents | **Do not import** | Provider payloads and rendered responses; importing them would be exactly the "persist raw API response blobs" anti-pattern. Let them expire. |

**Guiding principle:** import only what is *evidence about a product*, tagged with
its real quality. The temptation to bulk-load `family-registry` prose or Redis
payloads "because the data exists" is precisely how a durable store becomes
unusable.

---

## 20. Observability

Extend the two existing allowlist-based loggers. **Both allowlists silently drop
unknown fields** (`logSmartLookup` in `lib/smart-lookup/telemetry.js`,
`buildRefinementTelemetryEvent` in `lib/serial-refinement/telemetry.js`) — a known
trap in this repo — so **every field below must be added to both allowlists or it
will never reach production logs.**

| Field | Type | Notes |
|---|---|---|
| `persistentStoreAttempted` | boolean | |
| `persistentStoreHit` | boolean | |
| `persistentStoreFreshness` | `'fresh'\|'stale'\|'expired'\|null` | Replaces separate `Fresh`/`Stale` booleans — one field, mutually exclusive states |
| `persistentStoreDurationMs` | number | |
| `persistentStoreErrorCode` | string\|null | `STORE_TIMEOUT`, `STORE_UNAVAILABLE`, `STORE_DISABLED` |
| `productPublicId` | uuid\|null | **`public_id`, never the bigint `id`** |
| `aliasMatched` | boolean | |
| `aliasType` | string\|null | |
| `evidenceRecordCount` | number\|null | |
| `evidenceAgeDays` | number\|null | Age of the oldest active lifecycle claim served |
| `evidenceConflictPresent` | boolean | |
| `providerAvoided` | boolean | True when a store hit prevented Serper/Gemini |
| `refreshScheduled` | boolean | SWR (3F) |
| `writeBackAttempted` | boolean | |
| `writeBackAccepted` | boolean | |
| `writeBackClaimsWritten` | number\|null | |
| `writeBackClaimsMerged` | number\|null | |
| `writeBackRejectedReason` | string\|null | Categorical: `IDENTITY_UNRESOLVED`, `NON_LIFECYCLE_FACT`, `LOW_CONFIDENCE`, `INVALID_SOURCE`, `STATUS_NOT_ACCEPTED` |

**Never emitted:** internal bigint ids, raw model numbers beyond what is already
emitted (`enteredModel`/`canonicalModel` are already in the refinement allowlist),
serials, URLs, source text.

Failure taxonomy additions (`lib/lookup-failure-taxonomy.js`): map
`STORE_TIMEOUT → 'cache_read_failure'` and `STORE_UNAVAILABLE →
'cache_read_failure'`. **No new failure category** — the store is architecturally
a cache tier, and a store failure must never look like a new class of outage on
existing dashboards.

Derived dashboard metrics: store hit rate, `providerAvoided` rate, p50/p95/p99
`persistentStoreDurationMs`, write-back acceptance rate, rejection reason
histogram, conflict rate, claims-per-product distribution.

---

## 21. Testing strategy

All deterministic. **No test may require a paid provider or a live database.**

### Adapter unit tests — `tests/model-evidence-store/`

Against an in-memory fake implementing `store-interface.js`:

| Test | Assertion |
|---|---|
| canonical lookup | `WED4850HW0` resolves to the product |
| alias lookup | `WED4850HWO` resolves via a verified transcription alias, `matchedBy='alias'` |
| unverified alias inert | `is_verified=false` alias returns **no** match |
| retired alias inert | `is_retired=true` alias returns no match |
| brand scoping | Same normalized model under a different brand does not match |
| brandless resolution | `brand_key=''` resolves without cross-brand leakage |
| family never satisfies exact | A `model_family` product is not returned for an `exact-model` query |
| DB failure | Thrown client error → `null`, no exception escapes `lookupModelEvidence` |
| DB timeout | Exceeds 120 ms → `null` + `STORE_TIMEOUT`, research proceeds |
| stale record | `freshness='stale'` → served **and** `refreshScheduled=true` |
| expired record | Not counted as a hit; research runs; used only if research fails |
| conflicting claims | Two active `production_start` values → both in `facts[]`, `uniqueLifecycleYear` returns `conflict: true` |
| weak evidence | `weak` claim alone never yields `resolved` from the evaluator |
| supersession | Superseded claim excluded from active reads, present with `includeSuperseded` |
| source dedup | Same URL with different tracking params → one `evidence_sources` row |
| write-back idempotency | Same payload ×3 → identical row set; `observation_count` increments only for aliases |
| provider failure after stale hit | Stale served, research fails → stale result returned, not an error |

### Schema constraint tests — `tests/model-evidence-store/schema.test.mjs`

Run against a real Postgres **only when `MODEL_EVIDENCE_TEST_DB_URL` is set**;
skipped otherwise so `npm test` stays offline-safe.

Assert each constraint rejects: short alias (< 6), duplicate `(brand_key,
normalized_alias)`, duplicate `(brand_key, normalized_model, identity_kind)`,
`end_year < start_year`, out-of-range year, `claim_shape` violation
(`production_start` with `claim_value` but no `point_year`), non-`https` URL,
oversized `normalized_fact`, un-normalized `brand_key`/`normalized_model`,
`superseded` status without `superseded_at`, `family_product_id = id`.

### Integration

- **Redis/DB consistency:** a store write bumps `evidence_version` → the previously
  cached Redis key becomes unreachable → next request re-derives from Postgres.
- **Smart/Refinement parity:** extend `tests/fixtures/cross-workflow-parity.json`
  and `tests/lib/cross-workflow-parity.test.mjs` with store-backed cases — both
  workflows must see identical `matchedIdentity` and `lifecycle` from the same
  store bundle.
- **Canary:** add store-hit, store-miss, store-timeout, and store-conflict
  scenarios to `tests/canary/lookup-canary.test.mjs` with an injected fake store.
- **Browser-bundle safety:** assert the built browser bundles contain no
  `supabase`/`postgres`/`SERVICE_ROLE` substring.
- **Flag-off equivalence:** with `MODEL_EVIDENCE_STORE_ENABLED=0`, every existing
  API test must produce byte-identical responses. This is the strongest possible
  guarantee that the read-only deployment is safe.

### Fixtures — `tests/fixtures/model-evidence-store/`

`whirlpool-wed4850hw0.json` (fresh, exact, two sources), `-stale.json` (400 days
old), `-conflict.json` (2019 vs 2020), `vizio-m321i-a2.json` (mirrored registry),
`lenovo-st50.json` (model-line identity, null end year),
`whirlpool-wed4850h-family.json` (family with a member).

---

## 22. Whirlpool walkthrough

```
Brand: Whirlpool   Entered: WED4850HWO   Canonical: WED4850HW0
Serial candidates: 1992 / 2022 (from tests/fixtures/cross-workflow-parity.json)
```

`buildSharedModelIdentity()` produces (verified against the existing fixture):
`enteredModel='WED4850HWO'`, `canonicalModel='WED4850HW0'`,
`searchModels=['WED4850HWO','WED4850HW0']`,
`equivalenceReason='terminal-o-zero-transcription'`, `searchCategory='dryer'`,
`normalizationApplied=true`.

### A. First-ever lookup — no DB evidence

1. `local-evidence.js`: no `model-age-db.json` record → miss.
2. `model-era-lookup.js`: confirmed — **no `WED4850` row exists** in
   `model-production-database.json` → miss.
3. Redis shared-evidence: miss.
4. **Store read:** `getBestLifecycleEvidence({brandKey:'whirlpool',
   searchModels:['WED4850HWO','WED4850HW0']})` → both UNION branches miss → `null`.
   Telemetry: `persistentStoreAttempted=true, persistentStoreHit=false`.
5. Serper + Gemini run exactly as today. Suppose facts return `production_start
   2019` from a manufacturer spec page and `availability 2019` from a retailer,
   both `identity_match='canonical-equivalent'` (matched token `WED4850HW0`).
6. Deterministic evaluator: model window `2019+` ∩ `{1992, 2022}` = `{2022}` →
   **`resolved`, chosenYear 2022**.
7. **Write-back (Phase 3D):**

| Table | Rows created |
|---|---|
| `products` | 1 — `brand_key='whirlpool'`, `canonical_model='WED4850HW0'`, `normalized_model='WED4850HW0'`, `identity_kind='exact_model'`, `category='dryer'`, `identity_confidence='high'`, `identity_status='provisional'` |
| `products` | 1 — family `WED4850H`, `identity_kind='model_family'`; the exact row's `family_product_id` points at it |
| `product_aliases` | 1 — `alias='WED4850HWO'`, `normalized_alias='WED4850HWO'`, `alias_type='transcription_variant'`, `equivalence_reason='terminal-o-zero-transcription'`, `is_verified=true` (passes `isCanonicalTranscriptionEquivalent` **and** an exact claim resolved) |
| `evidence_claims` | 2 — `production_start point_year=2019` (`strong`, `high`) and `availability_year point_year=2019` (`supported`, `medium`) |
| `evidence_sources` | 2 — manufacturer spec page (`primary`), retailer listing (`strong_secondary`) |
| `claim_sources` | 2 — with `exact_model_match=false`, `canonical_equivalent_match=true`, `matched_token='WED4850HW0'` |

8. Redis shared-evidence written (7 d, keyed with `evidence_version=1`).

### B. Second lookup — evidence persisted

- Redis hit → returns immediately, Postgres never touched. (This is the common case
  and the store's real job is to survive Redis, not to replace it.)
- If Redis expired: local miss → Redis miss → **store hit**. The alias branch
  matches `WED4850HWO` **or** the canonical branch matches `WED4850HW0`; either
  resolves to the same `product_id`. Claims mapped to `facts[]` with
  `extraction.provider='persistent-store'`. `freshness='fresh'`.
  **Serper and Gemini are not called.** `providerAvoided=true`.
  Result identical to A: `resolved`, 2022. Redis re-warmed.

### C. Six months later — stale

`last_verified_at` is 183 days old; the claim is `strong` + `production_start` on a
product with `end_year IS NULL` → threshold 180 d → **stale, not expired**.

- Response returned **immediately** from the stale claim (`resolved`, 2022).
- `persistentStoreFreshness='stale'`, `refreshScheduled=true`.
- Refresh per §13's execution model. If refresh confirms 2019: `last_verified_at`
  bumped, no new row, `attachSource` may add a third source.

### D. Provider outage — stored evidence exists

Serper returns 503 / Gemini times out. **The store read happens before providers**,
so the store hit already produced a complete `facts[]`. `service.js` never reaches
`gatherEvidence()`. The user gets `resolved` 2022 with full citations during a
total provider outage — which is the single most valuable property of this project.

If the entry had been *expired* rather than fresh, research would have been
attempted, failed, and the expired claim would then be served as the reserve with
`evidence_quality` presented as `supported` rather than `strong`.

### E. New source contradicts the original lifecycle start

A later research pass returns `production_start 2020` from a second manufacturer-support
page (`primary`, `canonical-equivalent`).

1. Match key `(product_id, 'production_start', 2020, -1)` finds no existing claim.
2. §9 rule 2: both are `primary` + exact-identity → **comparable strength** → rule 3.
3. New `evidence_claims` row (`point_year=2020`); **both** rows set
   `evidence_quality='conflicting'`; both remain `active`. Nothing is overwritten.
4. `products.evidence_version` → 2, so the Redis entry keyed on version 1 is
   unreachable.
5. Next lookup: `uniqueLifecycleYear()` sees `{2019, 2020}` → `{value: null,
   conflict: true}` → `statusFor()` → `status='partial'`,
   `failureCategory='EVIDENCE_CONFLICT'`.
6. Serial Refinement: `compatibilityStatus()` maps `partial` → `success`; the
   evaluator now has no single lower bound. With candidates `{1992, 2022}`, **both
   2019 and 2020 still exclude 1992**, so the intersection is still `{2022}` →
   **still `resolved`**. Correctness is preserved *because* the conflict was
   preserved rather than resolved by last-write-wins.
7. Smart Lookup: `supportedProductionStartYear` is null; the card degrades to the
   broader dated-evidence path and discloses both years.
8. A later `manufacturer` (not `manufacturer_support`) page asserting 2019 would
   let §9 rule 2 supersede the 2020 claim and restore `strong` quality.

---

## 23. VIZIO / Lenovo walkthrough

### `M321i-A2` (VIZIO)

`compactModelToken('M321i-A2') = 'M321IA2'`. Note the registry already carries the
`M32li-A2` (lowercase-L) confusion alias — the *same class* of transcription
problem as `WED4850HWO`, solved locally today.

Order: **VIZIO registry (local) → miss? → model-age-db → Redis → store → providers.**

The registry hits first and returns `modelYear 2013`, `productionRange
{2013,2014}`, `estimateBasis='verified-model-generation'`,
`identityConfidence='high'`. **The store is never consulted.** Serial candidates
`{2013, 2014}` intersect the registry window to `{2013, 2014}` → `ambiguous_with_era`,
unchanged from today.

After the 3G mirror, a `products` row `('vizio','M321I-A2','exact_model')` exists
with `evidence_quality='verified'`, its five aliases as `manufacturer_alias`, and
its two `evidenceIds` as `evidence_sources`. **It is never read on the hot path.**
Its purpose is conflict visibility: if web research ever asserts 2014 for
`M321i-A2`, §9 records the disagreement against a `verified` claim, which rule 2
resolves in the registry's favor — and the disagreement becomes a *reviewable
signal* that the registry may need updating, rather than silently competing truth.

### `Lenovo ThinkSystem ST50`

`family-registry.js` recognizes it as `modelLineId='thinksystem-st50'` with
`familyRange {2018, 2023, basis:'model-line-history'}`, and explicitly refuses to
assign years to `V2`/`V3` (`{start:null, end:null}`).

Order: **family-registry (code) → store → providers.** The registry answers first
for the model-line tier. The store may hold a *separate* `model_line` product row
(`normalized_model='THINKSYSTEMST50'`) accumulating web evidence — but with
`querySpecificity='model-line'`, `acceptedMatchTypes()` already admits `family`
evidence, and `evaluateEvidencePolicy()` already ranks the registry's
high-confidence range above `supported` web claims.

**How two sources of truth are avoided — three structural rules:**

1. **Strict precedence, never merge.** Local deterministic registries are read
   first and short-circuit. The store is consulted only on a local miss. There is
   no code path where both answer the same question and a tiebreak is needed.
2. **Different identity granularity.** The registry answers *model-line* questions
   (`thinksystem-st50`); the store accumulates evidence for *exact models*
   (`7Y48`, `7Y49`). They are different `products` rows with different
   `identity_kind`. They are not competing — they are complementary tiers of the
   same ladder that `querySpecificity` already encodes.
3. **The mirror is subordinate by quality, not by convention.** Mirrored registry
   claims carry `evidence_quality='verified'`, the top rung, so §9's supersession
   rules make it *arithmetically impossible* for a web-sourced `strong` claim to
   displace a registry claim. The registry stays authoritative even inside the
   database.

The ST50 case shows the value: a query for `Lenovo 7Y48` gets the registry's
model-line context *and*, once learned, exact-model evidence from the store —
neither contradicting the other, because they are answering different questions.

---

## 24. Architecture diagram

```
                                  ┌──────────────┐
                                  │   Browser    │  (static site; no DB awareness)
                                  └──────┬───────┘
                                         │ POST /api/age-lookup
                                         │ POST /api/refine-serial-date
                          ┌──────────────┴──────────────┐
                          ▼                             ▼
             ┌────────────────────────┐    ┌──────────────────────────┐
             │ Smart Lookup adapter   │    │ Serial Refinement adapter│
             │ api/age-lookup.js      │    │ api/refine-serial-date.js│
             │ + classify / normalize │    │ + serial decoder candidates│
             └───────────┬────────────┘    └────────────┬─────────────┘
                         │                              │
                         │   ┌──────────────────────────┘
                         ▼   ▼
              ┌─────────────────────────────────┐
              │   SHARED MODEL IDENTITY         │
              │ buildSharedModelIdentity()      │
              │ entered / canonical / searchModels
              │ O-0, I-1, L-1 alternatives      │
              └───────────────┬─────────────────┘
                              ▼
        ┌──────────────────────────────────────────────────┐
        │  SHARED EVIDENCE SERVICE  lib/model-evidence/    │
        │             service.js                           │   ◄── the ONLY
        │  ┌────────────────────────────────────────────┐  │       insertion
        │  │ 1  LOCAL DETERMINISTIC EVIDENCE            │  │       point
        │  │    model-age-db.json · model-production DB │  │
        │  │    VIZIO registry · family-registry (code) │  │
        │  └──────────────┬─────────────────────────────┘  │
        │                 │ miss                            │
        │  ┌──────────────▼─────────────────────────────┐  │
        │  │ 2  REDIS HOT CACHE  (Upstash)              │  │
        │  │    raw search 24h · facts 7d               │  │
        │  │    shared evidence 7d (was 180d)           │  │
        │  │    negatives 15m · rate limit · singleflight│ │
        │  └──────────────┬─────────────────────────────┘  │
        │                 │ miss                            │
        │  ┌──────────────▼─────────────────────────────┐  │
        │  │ 3  PERSISTENT EVIDENCE STORE   ★ NEW ★     │  │
        │  │    lib/model-evidence/store/               │  │
        │  │    ≤120ms · flag-gated · null-store on fail│  │
        │  │    ┌─────────────────────────────────────┐ │  │
        │  │    │ PostgreSQL (Supabase)               │ │  │
        │  │    │  products · product_aliases         │ │  │
        │  │    │  evidence_claims · evidence_sources │ │  │
        │  │    │  claim_sources                      │ │  │
        │  │    └─────────────────────────────────────┘ │  │
        │  └──────────────┬─────────────────────────────┘  │
        │                 │ miss / expired                  │
        │  ┌──────────────▼─────────────────────────────┐  │
        │  │ 4  RESEARCH                                │  │
        │  │    Serper  ──►  Gemini extraction          │  │
        │  │    (optional heavy: OpenAI / xAI —         │  │
        │  │     Smart Lookup route only)               │  │
        │  └──────────────┬─────────────────────────────┘  │
        │                 ▼                                 │
        │  ┌────────────────────────────────────────────┐  │
        │  │ 5  DETERMINISTIC EVALUATOR                 │  │
        │  │    candidate-evaluator · evidence-policy   │  │
        │  │    candidate-intersection                  │  │
        │  │    (never bypassed; owns result confidence)│  │
        │  └──────────────┬─────────────────────────────┘  │
        │                 │ accepted evidence               │
        │  ┌──────────────▼─────────────────────────────┐  │
        │  │ 6  WRITE-BACK  (Phase 3D)                  │  │
        │  │    acceptForPersistence() ► persistEvidence│  │
        │  │    provider NEVER writes directly          │  │
        │  └──────────────┬─────────────────────────────┘  │
        └─────────────────┼─────────────────────────────────┘
                          │ bumps products.evidence_version
                          │ → invalidates Redis key implicitly
                          ▼
        ┌─────────────────────────────────────────────────┐
        │  TELEMETRY  (allowlist loggers — add fields to   │
        │  BOTH or they are silently dropped)              │
        │  smart-lookup/telemetry.js                       │
        │  serial-refinement/telemetry.js                  │
        │  lookup-failure-taxonomy.js                      │
        └─────────────────────────────────────────────────┘
```

---

## 25. Phase 3B implementation plan

Goal: **create the database and a shadow-mode read adapter that cannot change any
response.** Default off.

### Feature flags

Repo convention is `<SUBSYSTEM>_<FEATURE>_ENABLED`
(`SMART_LOOKUP_SHARED_MODEL_EVIDENCE_ENABLED`,
`MODEL_REFINEMENT_SHARED_EVIDENCE_SHADOW_ENABLED`). Because the store serves both
subsystems through the shared service, it takes the neutral `MODEL_EVIDENCE_`
prefix:

| Variable | Phase | Default |
|---|---|---|
| `MODEL_EVIDENCE_STORE_SHADOW_ENABLED` | **3B** | `0` (off) |
| `MODEL_EVIDENCE_STORE_ENABLED` | 3C | `0` (off) |
| `MODEL_EVIDENCE_STORE_WRITE_ENABLED` | 3D | `0` (off) |
| `MODEL_EVIDENCE_STORE_SWR_ENABLED` | 3F | `0` (off) |
| `MODEL_EVIDENCE_DB_URL` | 3B | unset |
| `MODEL_EVIDENCE_DB_MAX_MS` | 3B | `120` |

Parsed with the existing idiom: `['1','true','yes','on'].includes(String(v).trim().toLowerCase())`.

### New files

| Path | Purpose | Approx. size |
|---|---|---|
| `lib/model-evidence/store/index.js` | `createEvidenceStore(config)`; returns null store when disabled/unconfigured | ~80 |
| `lib/model-evidence/store/store-interface.js` | JSDoc contracts + `createNullStore()` | ~120 |
| `lib/model-evidence/store/postgres-store.js` | **Only** file importing the DB client; parameterized SQL; bounded reads | ~280 |
| `lib/model-evidence/store/normalization.js` | Re-exports identity fns; adds `normalizeSourceUrl()` + `urlHash()` | ~90 |
| `lib/model-evidence/store/freshness.js` | `classifyFreshness(claim, now)` + the §10 table as constants | ~110 |
| `lib/model-evidence/store/mappers.js` | `storedBundleToSharedFacts()` / `sharedFactsToStoredClaims()` | ~200 |
| `db/migrations/0001_model_evidence_store.sql` | Enums, 5 tables, constraints | — |
| `db/migrations/0002_model_evidence_indexes.sql` | Indexes from §15 | — |
| `db/migrations/0003_model_evidence_roles_rls.sql` | RLS enable (no policies), `evidence_reader` role, grants | — |
| `db/README.md` | How to apply migrations; the "no client outside postgres-store.js" rule | — |
| `scripts/verify-model-evidence-store.js` | Ops: connectivity + constraint smoke, safe to run against prod read replica | ~120 |
| `tests/model-evidence-store/store-adapter.test.mjs` | §21 adapter tests | — |
| `tests/model-evidence-store/freshness.test.mjs` | §10 boundaries | — |
| `tests/model-evidence-store/mappers.test.mjs` | Round-trip claims ↔ facts | — |
| `tests/model-evidence-store/schema.test.mjs` | Constraint tests, skipped without `MODEL_EVIDENCE_TEST_DB_URL` | — |
| `tests/fixtures/model-evidence-store/*.json` | §21 fixtures | — |
| `docs/persistent-model-evidence-store.md` | Operator runbook (this doc becomes the design record) | — |

### Existing files likely to change

| File | Change | Risk |
|---|---|---|
| `lib/model-evidence/service.js` | Accept `options.evidenceStore`; after the Redis read, run a **shadow** store read (compare + log + **discard**). No response change in 3B. | Low — additive, behind a flag |
| `lib/smart-lookup/telemetry.js` | Add §20 fields to the allowlist | **Low but mandatory** — omission silently drops fields |
| `lib/serial-refinement/telemetry.js` | Same | Same |
| `lib/lookup-failure-taxonomy.js` | Map `STORE_TIMEOUT`/`STORE_UNAVAILABLE` → `cache_read_failure` | Low |
| `api/age-lookup.js` | Pass `dependencies.evidenceStore` into the evidence lookup options (test seam only) | Low |
| `api/refine-serial-date.js` | Same, via `deterministic-provider.js` options | Low |
| `lib/serial-refinement/deterministic-provider.js` | Forward `evidenceStore` | Low |
| `package.json` | Add `postgres` (or `@supabase/supabase-js`) + `test:evidence-store` script | Low |
| `.gitignore` | Ensure no `.env` variant with DB creds is committable | Low |
| `docs/serial-refinement-production-hardening.md` | Add the store to the layer table + env table | None |

**Driver choice:** prefer the lightweight `postgres` (postgres.js) client over
`@supabase/supabase-js` — PostgREST adds an HTTP hop and its own semantics for
zero benefit here, and a plain connection string keeps the store portable off
Supabase, which §1 requires. **Use the Supabase transaction-mode pooler
(port 6543), not a direct connection**: Vercel functions are ephemeral and would
otherwise exhaust connection slots. Configure `max: 1`, `idle_timeout: 20`,
`connect_timeout: 5`, `prepare: false` (transaction-mode pooling does not support
prepared statements).

### SQL migrations

`0001` — enums (`product_identity_kind`, `identity_status`, `confidence_level`,
`alias_type`, `claim_type`, `claim_status`, `evidence_quality`, `date_precision`,
`identity_match_type`, `source_type`, `source_quality`) and the five tables with
every CHECK from §4–§7.
`0002` — every index from §15.
`0003` — `ALTER TABLE … ENABLE ROW LEVEL SECURITY` on all five (no policies);
`CREATE ROLE evidence_reader NOLOGIN`; `GRANT SELECT` on the five tables;
**no INSERT/UPDATE/DELETE grants in Phase 3B**.

### Adapter functions delivered in 3B

Read-only subset: `resolveProductIdentity`, `findProductByCanonicalModel`,
`findProductByAlias`, `getEvidenceClaims`, `getEvidenceSources`,
`getBestLifecycleEvidence`, plus `createNullStore()`. Write functions are declared
in `store-interface.js` with JSDoc and **throw `NOT_IMPLEMENTED`** in
`postgres-store.js` until 3D — so the contract is reviewable now and unusable now.

### Read-path insertion point (exact)

`lib/model-evidence/service.js`, in `lookupModelEvidence()`, between the Redis
`cache.getSharedEvidence()` block (currently ends ~line 411) and the
`requestContext.localOnly` early return (~line 422):

```js
// Phase 3B: shadow only — read, compare, log, discard.
if (store && !requestContext.localOnly && !local?.record) {
  const bundle = await store.getBestLifecycleEvidence({ ... }, { deadline });
  recordStoreShadow(bundle, /* the result computed below */);
}
```

In 3C this becomes an early return that maps the bundle into the standard
shared-evidence result via `mappers.js`.

### Tests to add/run

New: the four `tests/model-evidence-store/*` suites.
Extend: `tests/lib/cross-workflow-parity.test.mjs`, `tests/canary/lookup-canary.test.mjs`.
Must still pass unchanged: `npm run test:unit`, `test:api`, `test:smart-unit`,
`test:smart-api`, `test:parity`, `test:lookup-canary`, `test:refinement-hardening`.
Add `"test:evidence-store": "node --test tests/model-evidence-store/*.test.mjs"`
and include it in `npm test`.

### Rollout procedure

1. Merge with **all flags off**. Zero behavior change; verify by running the full
   suite and confirming responses are byte-identical.
2. Provision the Postgres project (same region as the Vercel functions — cross-region
   would blow the 120 ms budget on its own).
3. Apply `0001`–`0003`. Verify with `scripts/verify-model-evidence-store.js`.
4. Set `MODEL_EVIDENCE_DB_URL` (pooler, port 6543) in Vercel **Production only**.
5. Deploy. Flags still off → null store → nothing changes.
6. Set `MODEL_EVIDENCE_STORE_SHADOW_ENABLED=1`. Redeploy.
7. Observe 48–72 h: `persistentStoreDurationMs` p95 < 120 ms, error rate < 1%,
   no change in route p95, no change in result-tier mix.
8. **Stop.** Phase 3B is complete with an empty database and a proven, bounded,
   zero-impact read path. Phase 3C flips reads live; Phase 3D fills the store.

### Rollback procedure

| Symptom | Action | Time |
|---|---|---|
| Latency regression | `MODEL_EVIDENCE_STORE_SHADOW_ENABLED=0` | < 1 min (env only) |
| Store errors in logs | Same; null store is the default path | < 1 min |
| Anything worse | Unset `MODEL_EVIDENCE_DB_URL` | < 1 min |
| Schema mistake | Drop and re-apply — **the database is empty in 3B**, which is precisely why shadow-first is the right first deployment | minutes |

No code revert, no data loss, no user-visible change at any point.

---

## 26. Product-owner decisions required

1. **Managed Postgres provider.** Supabase (assumed) vs Neon vs Vercel Postgres.
   The design is portable; the decision affects pooling config and cost only.
2. **Region.** Must match the Vercel function region. Cross-region alone can
   exceed the 120 ms budget.
3. **Plan tier now.** Free-tier project pausing makes Pro the safe choice for a
   user-facing dependency, even at low volume.
4. **Is ~$25/month justified at current traffic?** Below ~100 lookups/day the
   store's value is outage resilience, not cost savings (§17).
5. **Shadow-first accepted?** This design adds Phase 3B-shadow ahead of live
   reads. It costs one extra deploy and removes essentially all rollout risk.
6. **Provider-fact retention.** Confirm that storing title + one ≤400-char
   normalized fact + URL (never page prose) is the intended posture.
7. **Bulk import of the 2,270-row production DB (3G).** Confirm ENERGY STAR data
   should be persisted as `availability_year`/`supported` rather than
   `production_start`/`strong` — this is a deliberate downgrade from how
   `model-era-lookup.js` currently uses it as a `productionStartYear` lower bound.
8. **Retention.** How long to keep `superseded`/`rejected` claims (proposed: 3
   years, then archive).

---

## 27. Final recommendation

**Is PostgreSQL/Supabase appropriate?** Yes. The workload is small, relational,
constraint-heavy, and needs to preserve disagreement — none of which Redis or JSON
files can do. Nothing in this design depends on Supabase-specific features;
Supabase is a hosting choice, not an architectural one.

**Is the schema stable enough to implement?** Yes, with one caveat. `products`,
`product_aliases`, `evidence_sources`, and `claim_sources` are stable — they encode
identity and provenance, which this repo has already settled through the shared
identity work. `evidence_claims` is the one table likely to gain a `claim_type`
value or a nullable column within a year (a month-precision lifecycle field is the
most probable). That is a routine additive migration, and the `claim_shape` CHECK
makes such an addition explicit rather than silent — which is the entire argument
for typed columns over EAV.

**What should be built first?** Phase 3B exactly as specified: migrations, the
read-only adapter, the null store, and a **shadow-mode** read at the single
insertion point in `lib/model-evidence/service.js`. Nothing else. The first deploy
should be incapable of changing a single response.

**What should remain local?** `model-age-db.json`, the VIZIO registry, and
`family-registry.js` — all read first, all short-circuit, all zero-latency. The
store is a tier *below* local deterministic evidence and *above* paid research,
permanently.

**What should never be persisted?** Serial numbers; individual-unit manufacture
years; owner-purchase and ownership-age facts; publication/review/page-update dates
as lifecycle claims; raw provider payloads; page prose; negative results;
rendered response payloads; user queries.

**What can wait?** Write-back (3D), Redis TTL reduction (3E), stale-while-revalidate
(3F), all bulk imports (3G), the integrity job (3H). Notably, a **queue is not
needed** — at these volumes, synchronous write-back inside the existing route
deadline (a single small transaction, ~10–30 ms, after the response payload is
already assembled) is sufficient, and Vercel's `waitUntil` is available as an
improvement if measurement shows the write is on the critical path. Introducing a
queue now would add an operational component with no failure it currently prevents.

**Main migration risks, in order:**

1. **Alias poisoning.** One bad verified alias makes a wrong product answer
   confidently and permanently, and it will not look like a bug. Mitigations:
   length floor, brand-scoped uniqueness, transcription-equivalence gate,
   corroboration requirement, retirement-not-deletion, integrity job.
2. **Latency creep.** A cross-region DB, a direct (non-pooled) connection, or an
   unindexed query turns a 120 ms budget into a route timeout. Mitigations: same
   region, transaction pooler, `statement_timeout`, hard `deadline.run` cap,
   shadow-mode latency measurement before any behavior change.
3. **Two sources of truth.** The failure mode where the store and a local registry
   disagree and callers must reconcile. Mitigations: strict precedence with
   short-circuit, different identity granularity per tier, `verified` quality for
   mirrored registry data, and `evidence_version`-keyed Redis so the two caches can
   never both be live.
4. **Silent telemetry loss.** Both loggers drop unknown fields. If §20's fields are
   not added to *both* allowlists, the rollout is flown blind. This has already
   happened once in this repo (the progressive-LKQ fields).
5. **Premature bulk import.** Loading 2,270 uniform `strong-secondary` rows before
   the store is tuned would make hit-rate and quality telemetry meaningless.
   Hence 3G, last.

**Stop here.** No schema has been created, no packages installed, no code changed.
```