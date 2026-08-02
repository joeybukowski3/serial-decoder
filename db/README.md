# Persistent Model Evidence Store — database

SQL for the durable model-knowledge layer shared by Smart Lookup and Serial
Refinement. Design source of truth:
[`docs/persistent-model-evidence-store-phase3a.md`](../docs/persistent-model-evidence-store-phase3a.md).
Operations: [`docs/persistent-model-evidence-store-runbook.md`](../docs/persistent-model-evidence-store-runbook.md).

```
db/
  migrations/
    0001_model_evidence_store.sql     enums, 5 tables, CHECK constraints
    0002_model_evidence_indexes.sql   unique + partial indexes
    0003_model_evidence_roles_rls.sql default-deny RLS, read-only role, grants
  seed/
    0001_shadow_test_seed.sql         TEST data only — NOT a production migration
```

## The one rule

**`lib/model-evidence-store/postgres-store.js` is the only file in the
repository allowed to import a database client.** A test enforces it
(`tests/model-evidence-store/security.test.mjs`). Everything else depends on
`store-interface.js`, which is what keeps Postgres out of the API routes, the
browser bundles, and the lookup logic.

## Applying migrations

Run DDL against a **direct** connection (Supabase port **5432**), not the
transaction pooler (6543). Transaction-mode pooling does not reliably support
DDL. The runtime read path is the opposite: it must use the pooler.

```bash
# Local Postgres for development and CI
docker run -d --name dmi-evidence-test \
  -e POSTGRES_PASSWORD=testpw -e POSTGRES_USER=testuser \
  -e POSTGRES_DB=evidence_test -p 55432:5432 postgres:16-alpine

MODEL_EVIDENCE_TEST_DB_URL=postgres://testuser:testpw@localhost:55432/evidence_test \
  npm run db:migrate:evidence-store -- --seed

# Verify only (no writes)
MODEL_EVIDENCE_MIGRATION_URL=<direct-url> npm run db:verify:evidence-store
```

URL resolution order: `--url` → `MODEL_EVIDENCE_MIGRATION_URL` →
`MODEL_EVIDENCE_TEST_DB_URL` → `MODEL_EVIDENCE_DB_URL`.

All migrations are **idempotent** and safe to re-run; a partially applied
migration is a normal recovery scenario.

## Schema at a glance

| Table | Holds | Never holds |
|---|---|---|
| `products` | brand, canonical + normalized model, identity kind/status/confidence, category, family link, `evidence_version` | **any year** |
| `product_aliases` | alias, normalized alias, type, equivalence reason, verification + retirement state | anything under 6 characters |
| `evidence_claims` | typed lifecycle claims (`point_year` / `start_year`+`end_year`), quality, confidence, status, supersession | serial numbers, unit manufacture years |
| `evidence_sources` | url, url hash, domain, type, quality, title, publication date | page prose, provider snippets |
| `claim_sources` | M:N link + per-link identity match + one ≤400-char normalized fact | copyrighted page content |

`products` deliberately has **no year columns**. "What is this thing" lives in
`products`; "when was it made" lives only in `evidence_claims`. That separation
is what keeps the schema stable when response schemas or providers change.

Exact models, model lines and model families share `products`, discriminated by
`identity_kind`, so aliases/claims/sources attach identically to all three
tiers. `family_product_id` links an exact model to its family row.

## Alias poisoning controls

One bad verified alias answers confidently and wrongly, forever, and does not
look like a bug. It is the top-ranked risk in the design. Controls, layered:

| Layer | Control |
|---|---|
| DB | `char_length(normalized_alias) >= 6` (`MIN_EXACT_TOKEN_LENGTH`) |
| DB | `UNIQUE (brand_key, normalized_alias)` — one token, at most one product per brand |
| DB | `user_observed_variant` can never be `is_verified` |
| DB | retirement requires a reason; rows are retired, never deleted |
| DB | normalization assertions (`brand_key` lowercase, `normalized_alias` uppercase alnum) |
| Index | `product_aliases_active_idx` covers only verified, non-retired, identity-bearing types |
| Adapter | matches only `transcription_variant`, `manufacturer_alias`, `revision_variant` |
| Adapter | **ambiguity returns no product at all** rather than picking one |
| Adapter | `isSafeTranscriptionAlias()` enforces the bounded O/0, I/1, L/1 rule |

A bad alias therefore fails toward a provider lookup, never toward a confident
wrong answer.

## Roles and RLS

Phase 3B grants **`SELECT` only**. The read-only deployment is enforced by
grants, not by developer discipline; write grants arrive with Phase 3D in a
separate migration.

RLS is enabled and **forced** on all five tables with **zero policies**
(default deny). On plain PostgreSQL, role grants alone would suffice — the only
way in is a connection string this application controls. On Supabase there is a
second door (PostgREST, reachable with the public anon key), and a table
without RLS is readable through it. Zero-policy RLS costs nothing on the
service-role path and is the only thing that contains a leaked anon key.

`model_evidence_reader` is created `NOLOGIN` and granted `BYPASSRLS` where
permitted. If the platform refuses `BYPASSRLS` (it needs superuser), the
migration emits a notice and continues: grant the role to a login role that
already bypasses RLS, such as the Supabase service role.

## Seed data policy

`db/seed/` is **test data**, tagged `seed:phase3b-shadow`, removable with one
predicate. Every row derives from data already in this repository:

| Seeded | Source in repo |
|---|---|
| Whirlpool `WED4850HW0` + `WED4850HWO` alias + `WED4850H` family | `tests/fixtures/cross-workflow-parity.json` — identity only; the repo holds **no lifecycle years** for this model, so **none were invented** |
| Whirlpool `WMH31017HS12` production_range 2023–2025 | `data/model-age-db.json` `refinementEvidence` (quality `official`, verified) |
| VIZIO `M321i-A2` 2013–2014 + 2 cited sources | `data/vizio-tv-generations.json` |
| Lenovo `ThinkSystem ST50` 2018–2023 (model line) | `lib/smart-lookup/family-registry.js` `familyRange` |

Bulk import of `data/model-age-db.json`, `lib/data/model-production-database.json`
and the full VIZIO registry is **Phase 3G**, not now. Those files remain the
local authoritative fast path and are read *before* the store.
