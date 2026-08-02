-- ===========================================================================
-- 0003_model_evidence_roles_rls.sql
-- Least-privilege roles and default-deny RLS for the model evidence store.
--
-- PHASE 3B IS READ-ONLY. No INSERT / UPDATE / DELETE is granted to the
-- application role here. Write privileges arrive with Phase 3D, in a separate
-- migration. The read-only deployment is therefore enforced by GRANTS, not by
-- developer discipline.
--
-- Why RLS on a server-only store:
--   Role grants alone are sufficient on plain PostgreSQL, where the only way
--   in is a connection string this application controls. On Supabase there is
--   a second door: PostgREST, reachable with the public anon key. A table
--   without RLS is readable through that door. Enabling RLS with ZERO policies
--   is default-deny, costs nothing on the service-role path (which bypasses
--   RLS by design), and is the only thing that contains a leaked anon key.
--   It is defence in depth, not the primary control.
--
-- Idempotent: safe to re-run.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- Default-deny RLS on every table. No policies are created, so no role other
-- than a BYPASSRLS/owner role can read anything.
-- --------------------------------------------------------------------------
ALTER TABLE products         ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_aliases  ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_claims  ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_sources    ENABLE ROW LEVEL SECURITY;

-- Force RLS for the table owner too, so an accidental connection as the owner
-- does not silently sidestep the policy model.
ALTER TABLE products         FORCE ROW LEVEL SECURITY;
ALTER TABLE product_aliases  FORCE ROW LEVEL SECURITY;
ALTER TABLE evidence_claims  FORCE ROW LEVEL SECURITY;
ALTER TABLE evidence_sources FORCE ROW LEVEL SECURITY;
ALTER TABLE claim_sources    FORCE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------------
-- Application read role.
--
-- NOLOGIN: this role is granted to whichever concrete login role the platform
-- provides (Supabase service role, or a dedicated login user on plain
-- Postgres). Keeping the privilege bundle separate from the login identity
-- means Phase 3D can add a writer role without touching credentials.
--
-- BYPASSRLS is required because the tables above are default-deny with no
-- policies. This is the deliberate trade: the server role sees everything,
-- every other role sees nothing.
-- --------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'model_evidence_reader') THEN
    CREATE ROLE model_evidence_reader NOLOGIN;
  END IF;
END $$;

-- Grant BYPASSRLS separately: it requires superuser and may be unavailable on
-- some managed platforms. Failing to grant it must not abort the migration —
-- the deployment note in db/README.md explains the alternative (attach the
-- privileges to the platform's own service role, which already bypasses RLS).
DO $$
BEGIN
  ALTER ROLE model_evidence_reader BYPASSRLS;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'BYPASSRLS not granted (insufficient privilege). Attach model_evidence_reader to a role that already bypasses RLS, e.g. the Supabase service role.';
END $$;

GRANT USAGE ON SCHEMA public TO model_evidence_reader;

GRANT SELECT ON
  products,
  product_aliases,
  evidence_claims,
  evidence_sources,
  claim_sources
TO model_evidence_reader;

-- Explicitly NOT granted in Phase 3B (documented so the omission reads as a
-- decision rather than an oversight):
--   GRANT INSERT, UPDATE, DELETE ... TO model_evidence_writer;   -- Phase 3D
--   GRANT USAGE ON ALL SEQUENCES ...                             -- Phase 3D

-- --------------------------------------------------------------------------
-- Revoke the permissive defaults. PUBLIC must never reach these tables.
-- --------------------------------------------------------------------------
REVOKE ALL ON products         FROM PUBLIC;
REVOKE ALL ON product_aliases  FROM PUBLIC;
REVOKE ALL ON evidence_claims  FROM PUBLIC;
REVOKE ALL ON evidence_sources FROM PUBLIC;
REVOKE ALL ON claim_sources    FROM PUBLIC;

-- On Supabase specifically, the anon/authenticated roles must hold nothing.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON products, product_aliases, evidence_claims, evidence_sources, claim_sources FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON products, product_aliases, evidence_claims, evidence_sources, claim_sources FROM authenticated';
  END IF;
END $$;
