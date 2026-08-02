-- ===========================================================================
-- 0001_model_evidence_store.sql
-- Persistent Model Evidence Store — core schema (Phase 3B).
--
-- Design source of truth: docs/persistent-model-evidence-store-phase3a.md
--
-- This schema stores DURABLE DOMAIN CONCEPTS (product identity, aliases,
-- lifecycle claims, source provenance). It deliberately does NOT store raw
-- provider payloads, rendered responses, serial numbers, user queries, or
-- individual-unit manufacture years.
--
-- Idempotent: safe to re-run.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- Enumerated types
-- --------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE product_identity_kind AS ENUM ('exact_model', 'model_line', 'model_family');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE identity_status AS ENUM ('provisional', 'accepted', 'disputed', 'retired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE confidence_level AS ENUM ('low', 'medium', 'high');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Alias types. Only a subset may ever back an authoritative exact-model
-- identity match; see product_aliases.is_identity_bearing below and
-- lib/model-evidence-store/normalization.js#IDENTITY_BEARING_ALIAS_TYPES.
DO $$ BEGIN
  CREATE TYPE alias_type AS ENUM (
    'transcription_variant',   -- bounded O/0, I/1, L/1 substitution (Phase 1 rules)
    'manufacturer_alias',      -- verified label/parts identifier for the SAME model
    'retailer_alias',
    'revision_variant',
    'family_alias',            -- alias of a family/model-line identity, never exact
    'legacy_model_number',
    'user_observed_variant'    -- observed in user input; NEVER auto-verified
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE claim_type AS ENUM (
    'introduction_year',
    'production_start',
    'production_end',
    'production_range',
    'availability_year',
    'discontinuation_year',
    'model_generation',
    'family_membership',
    'category',
    'brand_identity',
    'canonical_model'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE claim_status AS ENUM ('active', 'superseded', 'disputed', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE evidence_quality AS ENUM (
    'verified', 'strong', 'supported', 'weak', 'conflicting', 'deprecated'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE date_precision AS ENUM ('day', 'month', 'year', 'approximate', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Mirrors the deterministic match ladder in
-- lib/model-evidence/service.js#aggregateIdentity.
DO $$ BEGIN
  CREATE TYPE identity_match_type AS ENUM (
    'exact', 'canonical-equivalent', 'variant', 'family', 'mismatch', 'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE source_type AS ENUM (
    'manufacturer', 'manual', 'manufacturer_support', 'spec_sheet', 'energy_star',
    'regulatory_database', 'retailer', 'parts_catalog', 'review', 'news', 'forum',
    'reddit', 'search_snippet', 'local_database', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE source_quality AS ENUM (
    'primary', 'strong_secondary', 'secondary', 'weak', 'untrusted'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- --------------------------------------------------------------------------
-- products
--
-- One row per resolvable identity. Exact models, model lines, and model
-- families share this table and are discriminated by identity_kind, so
-- aliases / claims / sources attach identically to all three tiers.
--
-- NO YEAR COLUMNS. "What is this thing" lives here; "when was it made" lives
-- exclusively in evidence_claims. This separation is what keeps the schema
-- stable across provider and response-schema changes.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Stable external handle for telemetry; internal bigint ids are never logged.
  public_id           uuid NOT NULL DEFAULT gen_random_uuid(),

  -- Identity -------------------------------------------------------------
  brand               text NOT NULL,   -- display form, as sourced
  brand_key           text NOT NULL,   -- normalizeEvidenceBrand(); '' means unknown brand
  canonical_model     text NOT NULL,   -- display form, e.g. 'WED4850HW0'
  normalized_model    text NOT NULL,   -- compactModelToken(), e.g. 'WED4850HW0'
  identity_kind       product_identity_kind NOT NULL,
  identity_status     identity_status  NOT NULL DEFAULT 'provisional',
  identity_confidence confidence_level NOT NULL DEFAULT 'medium',

  -- Classification -------------------------------------------------------
  category            text,
  subcategory         text,
  family_product_id   bigint REFERENCES products(id) ON DELETE SET NULL,
  model_line          text,            -- display label only; recognition logic stays in code

  -- Cache-coherence ------------------------------------------------------
  -- Bumped by any write that changes the active claim set. Participates in the
  -- Redis shared-evidence key from Phase 3E so a DB write implicitly
  -- invalidates Redis instead of requiring a cross-store delete.
  evidence_version    integer NOT NULL DEFAULT 1,

  -- Bookkeeping ----------------------------------------------------------
  first_seen_at       timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT products_normalized_model_len
    CHECK (char_length(normalized_model) BETWEEN 3 AND 64),
  CONSTRAINT products_no_self_family
    CHECK (family_product_id IS DISTINCT FROM id),
  CONSTRAINT products_evidence_version_positive
    CHECK (evidence_version >= 1),
  -- Assertions that the APPLICATION normalized correctly. These can only
  -- reject, never transform: normalization itself stays in JavaScript
  -- (normalizeEvidenceBrand / compactModelToken) so there is exactly one
  -- implementation and it cannot drift from the lookup path.
  CONSTRAINT products_brand_key_normalized
    CHECK (brand_key = lower(brand_key) AND brand_key !~ '[^a-z0-9]'),
  CONSTRAINT products_model_normalized
    CHECK (normalized_model = upper(normalized_model) AND normalized_model !~ '[^A-Z0-9]'),
  CONSTRAINT products_brand_len    CHECK (char_length(brand) <= 120),
  CONSTRAINT products_model_len    CHECK (char_length(canonical_model) BETWEEN 1 AND 120),
  CONSTRAINT products_category_len CHECK (category IS NULL OR char_length(category) <= 80),
  CONSTRAINT products_model_line_len CHECK (model_line IS NULL OR char_length(model_line) <= 160)
);

-- --------------------------------------------------------------------------
-- product_aliases
--
-- ALIAS POISONING is the top-ranked risk in the Phase 3A design: one bad
-- verified alias answers confidently and wrongly, forever, and does not look
-- like a bug. The protections are layered here at the DB boundary and again
-- in lib/model-evidence-store/normalization.js.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_aliases (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id         bigint NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  -- Denormalized from products so the brand-scoped unique index and the
  -- hot-path partial index need no join.
  brand_key          text NOT NULL,
  alias              text NOT NULL,   -- as observed
  normalized_alias   text NOT NULL,   -- compactModelToken()

  alias_type         alias_type NOT NULL,
  equivalence_reason text,            -- 'terminal-o-zero-transcription', 'i-one-transcription', ...
  alias_confidence   confidence_level NOT NULL DEFAULT 'low',
  is_verified        boolean NOT NULL DEFAULT false,
  -- Retirement, never deletion: deleting loses the fact that the alias was
  -- once believed, which is the only way to diagnose a bad past result.
  is_retired         boolean NOT NULL DEFAULT false,
  retired_reason     text,

  source             text NOT NULL,   -- 'local-model-age-db' | 'shared-identity' | 'evidence-corroborated' | 'manual' | 'seed'
  observation_count  integer NOT NULL DEFAULT 1,

  first_seen_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at       timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),

  -- MIN_EXACT_TOKEN_LENGTH from lib/model-evidence/exact-model-match.js,
  -- expressed as a database invariant. A shorter token is too generic to
  -- carry an identity claim and must never be storable.
  CONSTRAINT product_aliases_min_length
    CHECK (char_length(normalized_alias) >= 6),
  CONSTRAINT product_aliases_normalized
    CHECK (normalized_alias = upper(normalized_alias) AND normalized_alias !~ '[^A-Z0-9]'),
  CONSTRAINT product_aliases_brand_key_normalized
    CHECK (brand_key = lower(brand_key) AND brand_key !~ '[^a-z0-9]'),
  CONSTRAINT product_aliases_alias_len
    CHECK (char_length(alias) BETWEEN 1 AND 120),
  CONSTRAINT product_aliases_reason_len
    CHECK (equivalence_reason IS NULL OR char_length(equivalence_reason) <= 120),
  CONSTRAINT product_aliases_retired_reason_len
    CHECK (retired_reason IS NULL OR char_length(retired_reason) <= 200),
  -- A retired alias must say why it was retired, so retirement is always
  -- auditable rather than an unexplained flag flip.
  CONSTRAINT product_aliases_retired_has_reason
    CHECK (NOT is_retired OR retired_reason IS NOT NULL),
  -- A user-observed typo variant may be recorded for telemetry but can never
  -- be marked verified, which is what gates participation in matching.
  CONSTRAINT product_aliases_user_observed_never_verified
    CHECK (alias_type <> 'user_observed_variant' OR NOT is_verified),
  CONSTRAINT product_aliases_observation_count_positive
    CHECK (observation_count >= 1)
);

-- --------------------------------------------------------------------------
-- evidence_claims
--
-- Durable normalized facts, NOT provider responses.
--
-- Typed columns rather than EAV: a generic (entity, attribute, value) table
-- would make `end_year >= start_year` inexpressible and would let a malformed
-- extraction be stored indistinguishably from a good one. With claim_shape
-- below, a malformed claim CANNOT BE STORED AT ALL.
--
-- Append-only for values: start_year / end_year / point_year / claim_value are
-- never UPDATEd. Only status, claim_confidence, evidence_quality,
-- last_verified_at, superseded_at and superseded_by_id change. The table is
-- therefore its own audit history and no revisions table is needed.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evidence_claims (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id       bigint NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  claim_type       claim_type NOT NULL,

  -- Exactly one shape is populated, enforced by claim_shape.
  start_year       smallint,
  end_year         smallint,
  point_year       smallint,
  -- Non-temporal claims only. NEVER used to carry a year.
  claim_value      text,

  precision        date_precision NOT NULL DEFAULT 'year',
  identity_match   identity_match_type NOT NULL,
  evidence_quality evidence_quality NOT NULL,
  claim_confidence confidence_level NOT NULL,
  status           claim_status NOT NULL DEFAULT 'active',

  basis            text NOT NULL,
  extractor        text,   -- 'gemini' | 'local-database' | 'manual' | 'seed'
  extractor_model  text,   -- provenance only, never identity

  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz NOT NULL DEFAULT now(),
  superseded_at    timestamptz,
  superseded_by_id bigint REFERENCES evidence_claims(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT evidence_claims_year_bounds CHECK (
    (start_year IS NULL OR start_year BETWEEN 1900 AND 2100) AND
    (end_year   IS NULL OR end_year   BETWEEN 1900 AND 2100) AND
    (point_year IS NULL OR point_year BETWEEN 1900 AND 2100)
  ),
  CONSTRAINT evidence_claims_range_ordered
    CHECK (start_year IS NULL OR end_year IS NULL OR end_year >= start_year),

  -- The load-bearing integrity constraint: each claim_type has exactly one
  -- legal payload shape.
  CONSTRAINT evidence_claims_shape CHECK (
    CASE claim_type
      WHEN 'introduction_year'    THEN point_year IS NOT NULL AND claim_value IS NULL AND start_year IS NULL AND end_year IS NULL
      WHEN 'production_start'     THEN point_year IS NOT NULL AND claim_value IS NULL AND start_year IS NULL AND end_year IS NULL
      WHEN 'production_end'       THEN point_year IS NOT NULL AND claim_value IS NULL AND start_year IS NULL AND end_year IS NULL
      WHEN 'availability_year'    THEN point_year IS NOT NULL AND claim_value IS NULL AND start_year IS NULL AND end_year IS NULL
      WHEN 'discontinuation_year' THEN point_year IS NOT NULL AND claim_value IS NULL AND start_year IS NULL AND end_year IS NULL
      WHEN 'production_range'     THEN start_year IS NOT NULL AND point_year IS NULL AND claim_value IS NULL
      WHEN 'model_generation'     THEN start_year IS NOT NULL AND point_year IS NULL AND claim_value IS NULL
      ELSE claim_value IS NOT NULL AND point_year IS NULL AND start_year IS NULL AND end_year IS NULL
    END
  ),

  -- Supersession bookkeeping cannot drift out of sync with status.
  CONSTRAINT evidence_claims_superseded_consistent
    CHECK ((status = 'superseded') = (superseded_at IS NOT NULL)),
  CONSTRAINT evidence_claims_superseded_not_self
    CHECK (superseded_by_id IS DISTINCT FROM id),

  CONSTRAINT evidence_claims_value_len
    CHECK (claim_value IS NULL OR char_length(claim_value) <= 200),
  CONSTRAINT evidence_claims_basis_len
    CHECK (char_length(basis) BETWEEN 1 AND 120),
  CONSTRAINT evidence_claims_extractor_len
    CHECK (extractor IS NULL OR char_length(extractor) <= 60),
  CONSTRAINT evidence_claims_extractor_model_len
    CHECK (extractor_model IS NULL OR char_length(extractor_model) <= 120)
);

-- --------------------------------------------------------------------------
-- evidence_sources
--
-- One row per distinct URL, reused across products and claims.
--
-- Storage posture: URL, domain, type, quality, title and publication date
-- only. Page prose and provider snippets are NEVER durable — they stay in the
-- 24h Redis raw-search cache and are discarded. The short normalized fact
-- lives on claim_sources because the same page can support different facts
-- for different claims.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evidence_sources (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  url               text NOT NULL,
  url_hash          text NOT NULL,   -- sha256 hex of the normalized URL
  domain            text NOT NULL,
  source_type       source_type NOT NULL,
  source_quality    source_quality NOT NULL,
  title             text,
  publication_date  date,
  first_seen_at     timestamptz NOT NULL DEFAULT now(),
  last_retrieved_at timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT evidence_sources_url_https CHECK (url ~ '^https://'),
  CONSTRAINT evidence_sources_url_len   CHECK (char_length(url) BETWEEN 12 AND 2048),
  CONSTRAINT evidence_sources_hash_shape CHECK (url_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT evidence_sources_domain_len CHECK (char_length(domain) BETWEEN 1 AND 253),
  CONSTRAINT evidence_sources_title_len  CHECK (title IS NULL OR char_length(title) <= 300)
);

-- --------------------------------------------------------------------------
-- claim_sources
--
-- M:N. One retrieved page routinely supports several claims, and one claim is
-- routinely supported by several pages. The per-link identity fields live
-- here (not on the source) because the SAME page can be an exact match for
-- one product and a family match for another.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS claim_sources (
  claim_id                   bigint NOT NULL REFERENCES evidence_claims(id) ON DELETE CASCADE,
  -- RESTRICT, not CASCADE: a source row must not vanish while claims cite it.
  source_id                  bigint NOT NULL REFERENCES evidence_sources(id) ON DELETE RESTRICT,

  normalized_fact            text NOT NULL,
  exact_model_match          boolean NOT NULL DEFAULT false,
  canonical_equivalent_match boolean NOT NULL DEFAULT false,
  matched_token              text,
  provider                   text NOT NULL,   -- 'serper' | 'local-database' | 'manual' | 'seed'
  -- sha256 of normalized SEARCH TERMS. Never a raw user query, never a serial.
  search_query_hash          text,
  retrieved_at               timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (claim_id, source_id),

  CONSTRAINT claim_sources_fact_len  CHECK (char_length(normalized_fact) BETWEEN 1 AND 400),
  CONSTRAINT claim_sources_token_len CHECK (matched_token IS NULL OR char_length(matched_token) <= 120),
  CONSTRAINT claim_sources_provider_len CHECK (char_length(provider) BETWEEN 1 AND 60),
  CONSTRAINT claim_sources_query_hash_shape
    CHECK (search_query_hash IS NULL OR search_query_hash ~ '^[0-9a-f]{64}$')
);

COMMENT ON TABLE products IS
  'Resolvable product identities (exact model / model line / model family). Contains no year data by design.';
COMMENT ON TABLE product_aliases IS
  'Alternate identifiers. Only verified, non-retired, identity-bearing alias types may back an exact-model match.';
COMMENT ON TABLE evidence_claims IS
  'Durable normalized lifecycle facts. Append-only for values; supersession preserves history.';
COMMENT ON TABLE evidence_sources IS
  'Deduplicated source provenance. No page prose is stored.';
COMMENT ON TABLE claim_sources IS
  'Join between claims and sources, carrying per-link identity match detail.';
