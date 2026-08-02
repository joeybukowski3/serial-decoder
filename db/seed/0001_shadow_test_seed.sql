-- ===========================================================================
-- 0001_shadow_test_seed.sql
--
-- *** TEST / SHADOW-VALIDATION SEED — NOT A PRODUCTION DATA MIGRATION ***
--
-- Purpose: a small deterministic dataset that exercises canonical matching,
-- alias matching, family linkage, source provenance, and the identity-only
-- (no lifecycle claim) case during Phase 3B shadow validation.
--
-- PROVENANCE RULE: every row below is derived from data ALREADY IN THIS
-- REPOSITORY. No external fact is introduced by this file.
--
--   * Whirlpool WED4850HW0 / WED4850HWO ... tests/fixtures/cross-workflow-parity.json
--                                           (identity + category only — the repo
--                                            holds NO lifecycle years for this
--                                            model, so NO lifecycle claim is
--                                            seeded for it. See note below.)
--   * Whirlpool WMH31017HS12 ............... data/model-age-db.json
--                                           (refinementEvidence, quality
--                                            "official", verified true)
--   * VIZIO M321i-A2 ....................... data/vizio-tv-generations.json
--                                           (exactModels + evidence[] URLs)
--   * Lenovo ThinkSystem ST50 .............. lib/smart-lookup/family-registry.js
--                                           (familyRange, basis
--                                            "model-line-history")
--
-- Bulk import of data/model-age-db.json, lib/data/model-production-database.json
-- and the full VIZIO registry is explicitly OUT OF SCOPE (Phase 3G). Those
-- files remain the local authoritative fast path.
--
-- Every row is tagged basis/source 'seed:phase3b-shadow' so the entire seed is
-- removable with a single predicate.
--
-- Idempotent: safe to re-run.
-- ===========================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- 1. Whirlpool WED4850H family + WED4850HW0 exact model.
--
--    IDENTITY ONLY. This is deliberate and is itself a test case: the shadow
--    comparison must handle "the store knows the product but has no lifecycle
--    evidence" without reporting false agreement or false conflict.
-- --------------------------------------------------------------------------
INSERT INTO products (
  brand, brand_key, canonical_model, normalized_model,
  identity_kind, identity_status, identity_confidence, category
)
VALUES ('Whirlpool', 'whirlpool', 'WED4850H', 'WED4850H',
        'model_family', 'accepted', 'medium', 'dryer')
ON CONFLICT (brand_key, normalized_model, identity_kind) DO NOTHING;

INSERT INTO products (
  brand, brand_key, canonical_model, normalized_model,
  identity_kind, identity_status, identity_confidence, category,
  family_product_id
)
SELECT 'Whirlpool', 'whirlpool', 'WED4850HW0', 'WED4850HW0',
       'exact_model', 'accepted', 'high', 'dryer',
       (SELECT id FROM products
         WHERE brand_key = 'whirlpool' AND normalized_model = 'WED4850H'
           AND identity_kind = 'model_family')
ON CONFLICT (brand_key, normalized_model, identity_kind) DO NOTHING;

-- The O/0 transcription variant. Verified because it satisfies the Phase 1
-- bounded-substitution rule (single terminal O<->0, equal length) — the same
-- rule isCanonicalTranscriptionEquivalent() applies at runtime.
INSERT INTO product_aliases (
  product_id, brand_key, alias, normalized_alias,
  alias_type, equivalence_reason, alias_confidence, is_verified, source
)
SELECT p.id, 'whirlpool', 'WED4850HWO', 'WED4850HWO',
       'transcription_variant', 'terminal-o-zero-transcription', 'high', true,
       'seed:phase3b-shadow'
FROM products p
WHERE p.brand_key = 'whirlpool' AND p.normalized_model = 'WED4850HW0'
  AND p.identity_kind = 'exact_model'
ON CONFLICT (brand_key, normalized_alias) DO NOTHING;

-- --------------------------------------------------------------------------
-- 2. Whirlpool WMH31017HS12 — verified local record WITH lifecycle evidence.
--    Source: data/model-age-db.json refinementEvidence[0]
--            productionStart 2023, productionEnd 2025, quality "official",
--            verified true, sourceUrl null.
--    sourceUrl is null in the repo, so NO evidence_sources row is created.
--    A claim with zero sources is legal and honest here: the provenance is the
--    curated local database, recorded via basis/extractor.
-- --------------------------------------------------------------------------
INSERT INTO products (
  brand, brand_key, canonical_model, normalized_model,
  identity_kind, identity_status, identity_confidence, category
)
VALUES ('Whirlpool', 'whirlpool', 'WMH31017HS12', 'WMH31017HS12',
        'exact_model', 'accepted', 'high', 'microwave')
ON CONFLICT (brand_key, normalized_model, identity_kind) DO NOTHING;

INSERT INTO evidence_claims (
  product_id, claim_type, start_year, end_year,
  precision, identity_match, evidence_quality, claim_confidence, status,
  basis, extractor
)
SELECT p.id, 'production_range', 2023, 2025,
       'year', 'exact', 'verified', 'high', 'active',
       'seed:phase3b-shadow', 'local-database'
FROM products p
WHERE p.brand_key = 'whirlpool' AND p.normalized_model = 'WMH31017HS12'
  AND p.identity_kind = 'exact_model'
  AND NOT EXISTS (
    SELECT 1 FROM evidence_claims c
    WHERE c.product_id = p.id AND c.claim_type = 'production_range'
  );

-- --------------------------------------------------------------------------
-- 3. VIZIO M321i-A2 — the one seeded product with real cited source URLs.
--    Source: data/vizio-tv-generations.json
--            modelYear 2013, productionRange {start:2013,end:2014},
--            evidenceIds [vizio-2013-m-series, vizio-m321i-a2-manual]
--
--    publication_date is stored only where the registry gives a full date.
--    The manual entry's publishedDate is the bare year "2013", which is not a
--    date, so it is stored as NULL rather than fabricated as 2013-01-01.
-- --------------------------------------------------------------------------
INSERT INTO products (
  brand, brand_key, canonical_model, normalized_model,
  identity_kind, identity_status, identity_confidence, category, model_line
)
VALUES ('VIZIO', 'vizio', 'M321i-A2', 'M321IA2',
        'exact_model', 'accepted', 'high', 'television', 'M-Series')
ON CONFLICT (brand_key, normalized_model, identity_kind) DO NOTHING;

-- Registry aliases that clear the 6-character identity-bearing floor.
-- "M321i A2" and "M321I-A2" both normalize to M321IA2 (the canonical model
-- itself) and so are intentionally not inserted as aliases.
INSERT INTO product_aliases (
  product_id, brand_key, alias, normalized_alias,
  alias_type, equivalence_reason, alias_confidence, is_verified, source
)
SELECT p.id, 'vizio', v.alias, v.normalized_alias,
       'transcription_variant'::alias_type, 'i-one-transcription', 'high', true,
       'seed:phase3b-shadow'
FROM products p
CROSS JOIN (VALUES
  ('M32li-A2', 'M32LIA2'),
  ('M32LI-A2', 'M32LIA2')
) AS v(alias, normalized_alias)
WHERE p.brand_key = 'vizio' AND p.normalized_model = 'M321IA2'
  AND p.identity_kind = 'exact_model'
ON CONFLICT (brand_key, normalized_alias) DO NOTHING;

INSERT INTO evidence_sources (url, url_hash, domain, source_type, source_quality, title, publication_date)
VALUES
  ('https://www.vizio.com/en/press/2013/may/new-vizio-m-series-delivers-faster-smarter-all-led-hdtvs',
   encode(sha256('https://www.vizio.com/en/press/2013/may/new-vizio-m-series-delivers-faster-smarter-all-led-hdtvs'::bytea), 'hex'),
   'vizio.com', 'manufacturer', 'primary',
   'New VIZIO M-Series Delivers Faster, Smarter, All-LED HDTVs', DATE '2013-05-28'),
  ('https://cdn.vizio.com/documents/downloads/hdtv/M321iA2/UM_M321iA2.pdf',
   encode(sha256('https://cdn.vizio.com/documents/downloads/hdtv/M321iA2/UM_M321iA2.pdf'::bytea), 'hex'),
   'cdn.vizio.com', 'manual', 'primary',
   'M321i-A2 User Manual', NULL)
ON CONFLICT (url_hash) DO NOTHING;

INSERT INTO evidence_claims (
  product_id, claim_type, start_year, end_year,
  precision, identity_match, evidence_quality, claim_confidence, status,
  basis, extractor
)
SELECT p.id, 'production_range', 2013, 2014,
       'year', 'exact', 'verified', 'high', 'active',
       'seed:phase3b-shadow', 'local-database'
FROM products p
WHERE p.brand_key = 'vizio' AND p.normalized_model = 'M321IA2'
  AND p.identity_kind = 'exact_model'
  AND NOT EXISTS (
    SELECT 1 FROM evidence_claims c
    WHERE c.product_id = p.id AND c.claim_type = 'production_range'
  );

INSERT INTO evidence_claims (
  product_id, claim_type, point_year,
  precision, identity_match, evidence_quality, claim_confidence, status,
  basis, extractor
)
SELECT p.id, 'introduction_year', 2013,
       'year', 'exact', 'verified', 'high', 'active',
       'seed:phase3b-shadow', 'local-database'
FROM products p
WHERE p.brand_key = 'vizio' AND p.normalized_model = 'M321IA2'
  AND p.identity_kind = 'exact_model'
  AND NOT EXISTS (
    SELECT 1 FROM evidence_claims c
    WHERE c.product_id = p.id AND c.claim_type = 'introduction_year'
  );

-- Both registry sources support both VIZIO claims (M:N is the point of the
-- join table). normalized_fact restates the registry's own supporting text.
INSERT INTO claim_sources (
  claim_id, source_id, normalized_fact,
  exact_model_match, canonical_equivalent_match, matched_token, provider
)
SELECT c.id, s.id,
       CASE
         WHEN s.domain = 'vizio.com'
           THEN 'VIZIO announced the 2013 M-Series LED HDTV lineup, which includes the M321i-A2.'
         ELSE 'The VIZIO M321i-A2 user manual is published under the 2013 M-Series generation.'
       END,
       true, false, 'M321IA2', 'seed'
FROM evidence_claims c
JOIN products p ON p.id = c.product_id
CROSS JOIN evidence_sources s
WHERE p.brand_key = 'vizio' AND p.normalized_model = 'M321IA2'
  AND c.claim_type IN ('production_range', 'introduction_year')
  AND s.domain IN ('vizio.com', 'cdn.vizio.com')
ON CONFLICT (claim_id, source_id) DO NOTHING;

-- --------------------------------------------------------------------------
-- 4. Lenovo ThinkSystem ST50 — a MODEL LINE, not an exact model.
--    Source: lib/smart-lookup/family-registry.js
--            familyRange { start: 2018, end: 2023, basis: 'model-line-history' }
--    Quality is 'supported', not 'verified': the registry's own comments call
--    this a conservative model-line window, not an exact-model fact, and the
--    V2/V3 generations are deliberately left undated there.
-- --------------------------------------------------------------------------
INSERT INTO products (
  brand, brand_key, canonical_model, normalized_model,
  identity_kind, identity_status, identity_confidence, category, model_line
)
VALUES ('Lenovo', 'lenovo', 'ThinkSystem ST50', 'THINKSYSTEMST50',
        'model_line', 'accepted', 'medium', 'server', 'ThinkSystem ST50')
ON CONFLICT (brand_key, normalized_model, identity_kind) DO NOTHING;

INSERT INTO evidence_claims (
  product_id, claim_type, start_year, end_year,
  precision, identity_match, evidence_quality, claim_confidence, status,
  basis, extractor
)
SELECT p.id, 'production_range', 2018, 2023,
       'year', 'family', 'supported', 'medium', 'active',
       'seed:phase3b-shadow', 'local-database'
FROM products p
WHERE p.brand_key = 'lenovo' AND p.normalized_model = 'THINKSYSTEMST50'
  AND p.identity_kind = 'model_line'
  AND NOT EXISTS (
    SELECT 1 FROM evidence_claims c
    WHERE c.product_id = p.id AND c.claim_type = 'production_range'
  );

COMMIT;
