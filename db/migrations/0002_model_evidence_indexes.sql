-- ===========================================================================
-- 0002_model_evidence_indexes.sql
-- Indexes and uniqueness constraints for the persistent model evidence store.
--
-- Latency contract: the shadow/live read must complete inside a 120 ms cap
-- (MODEL_EVIDENCE_DB_MAX_MS). Every read-path predicate below is served by a
-- unique or partial index; nothing on the hot path performs a sequential scan.
--
-- Case handling: all comparisons use already-normalized columns
-- (brand_key lowercased, normalized_model/normalized_alias uppercased) written
-- by JavaScript. No citext, no functional lower()/upper() indexes, no ILIKE on
-- the read path — a second normalization implementation would drift.
--
-- Idempotent: safe to re-run.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- products
-- --------------------------------------------------------------------------

-- Primary identity lookup, and the uniqueness guarantee that one
-- (brand, model, tier) triple can only ever describe one product.
CREATE UNIQUE INDEX IF NOT EXISTS products_identity_uq
  ON products (brand_key, normalized_model, identity_kind);

CREATE UNIQUE INDEX IF NOT EXISTS products_public_id_uq
  ON products (public_id);

-- Family membership traversal (exact model -> its family row).
CREATE INDEX IF NOT EXISTS products_family_idx
  ON products (family_product_id)
  WHERE family_product_id IS NOT NULL;

-- Brandless resolution (service.js allows brandless search when no brand was
-- supplied) without a sequential scan.
CREATE INDEX IF NOT EXISTS products_model_only_idx
  ON products (normalized_model);

-- --------------------------------------------------------------------------
-- product_aliases
-- --------------------------------------------------------------------------

-- Brand-scoped alias uniqueness. This is a PRIMARY alias-poisoning control:
-- one alias token can resolve to at most one product within a brand, so an
-- alias can never authoritatively point at two products.
CREATE UNIQUE INDEX IF NOT EXISTS product_aliases_identity_uq
  ON product_aliases (brand_key, normalized_alias);

-- The hot path: only verified, non-retired, identity-bearing alias types are
-- ever consulted for matching. Provisional and retired aliases are inert by
-- construction because they are not in this index and the query filters on the
-- same predicate.
CREATE INDEX IF NOT EXISTS product_aliases_active_idx
  ON product_aliases (brand_key, normalized_alias)
  WHERE is_verified
    AND NOT is_retired
    AND alias_type IN ('transcription_variant', 'manufacturer_alias', 'revision_variant');

CREATE INDEX IF NOT EXISTS product_aliases_product_idx
  ON product_aliases (product_id);

-- --------------------------------------------------------------------------
-- evidence_claims
-- --------------------------------------------------------------------------

-- The read path: "active claims of these types for this product".
CREATE INDEX IF NOT EXISTS evidence_claims_active_idx
  ON evidence_claims (product_id, claim_type)
  WHERE status = 'active';

-- Freshness / revalidation sweep. Partial so it only covers claims that can
-- actually go stale ('verified' curated claims never expire).
CREATE INDEX IF NOT EXISTS evidence_claims_revalidate_idx
  ON evidence_claims (last_verified_at)
  WHERE status = 'active' AND evidence_quality <> 'verified';

-- Supersession chain traversal for audit queries.
CREATE INDEX IF NOT EXISTS evidence_claims_superseded_by_idx
  ON evidence_claims (superseded_by_id)
  WHERE superseded_by_id IS NOT NULL;

-- Conflict detection sweep (two active lifecycle claims of the same type with
-- different values for one product).
CREATE INDEX IF NOT EXISTS evidence_claims_conflict_scan_idx
  ON evidence_claims (product_id, claim_type, point_year, start_year)
  WHERE status = 'active';

-- --------------------------------------------------------------------------
-- evidence_sources
-- --------------------------------------------------------------------------

-- Global URL deduplication: one manufacturer page supporting forty models is
-- one row.
CREATE UNIQUE INDEX IF NOT EXISTS evidence_sources_url_hash_uq
  ON evidence_sources (url_hash);

-- Source-quality and domain reporting; also used by source-retirement tooling.
CREATE INDEX IF NOT EXISTS evidence_sources_domain_idx
  ON evidence_sources (domain);

-- --------------------------------------------------------------------------
-- claim_sources
-- --------------------------------------------------------------------------

-- The PK (claim_id, source_id) already serves the forward join. This covers
-- the reverse question, "what does this source support?", used when a source
-- is retired or found unreachable.
CREATE INDEX IF NOT EXISTS claim_sources_source_idx
  ON claim_sources (source_id);
