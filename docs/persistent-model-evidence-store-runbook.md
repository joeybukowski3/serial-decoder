# Persistent Model Evidence Store — Runbook (Phase 3B, shadow)

Operational guide for the durable model-knowledge layer.
Design: [`persistent-model-evidence-store-phase3a.md`](./persistent-model-evidence-store-phase3a.md).
Schema: [`../db/README.md`](../db/README.md).

**Status: shadow only.** The store reads, compares, and logs. It cannot change
a user-facing result. Both flags default to **off**.

---

## 1. Architecture

```text
User lookup
  → shared model identity            (buildSharedModelIdentity)
  → local deterministic evidence     (model-age-db, model-production, VIZIO, family-registry)
  → Redis hot cache                  (returns on hit — see §4)
  → persistent evidence store  ◄── SHADOW: compare + log, result discarded
  → Serper → Gemini extraction
  → deterministic evaluator
  → existing fallback ladder
  → user result
```

The store plugs in at exactly one place: **`lookupModelEvidence()` in
`lib/model-evidence/service.js`**, between the Redis read and `gatherEvidence()`.
Smart Lookup and Serial Refinement both reach it through that function and
neither knows Postgres exists. A test asserts no `api/*` route imports the
store or a driver.

## 2. Feature flags

| Variable | Purpose | Phase 3B default |
|---|---|---|
| `MODEL_EVIDENCE_STORE_SHADOW_ENABLED` | read + compare + log, result discarded | **`false`** |
| `MODEL_EVIDENCE_STORE_ENABLED` | reserved for Phase 3C live reads | **`false`** |
| `MODEL_EVIDENCE_DB_URL` | Postgres connection string — **transaction pooler, port 6543** | unset |
| `MODEL_EVIDENCE_DB_MAX_MS` | read cap in ms (clamped 20–1000) | `120` |
| `MODEL_EVIDENCE_MIGRATION_URL` | direct connection (port 5432) for DDL only | unset |
| `MODEL_EVIDENCE_TEST_DB_URL` | local/CI Postgres for the real-DB tests | unset |

All are **server-only**. None may be exposed to the browser; a test scans every
browser-served asset for `MODEL_EVIDENCE_DB_URL`, `postgres://`, service-role
tokens, and driver imports.

**`MODEL_EVIDENCE_STORE_ENABLED` cannot activate live reads in Phase 3B.**
`LIVE_READS_IMPLEMENTED` is `false` in `lib/model-evidence-store/index.js`, so
`resolveStoreMode()` returns `shadow` even if the live flag is set. A premature
flag flip degrades to shadow, not to an untested code path. Phase 3C flips that
constant together with the live read path in one reviewable change.

## 3. Connection configuration

Serverless functions must not open pools. Configured in
`lib/model-evidence-store/postgres-store.js#buildConnectionOptions`:

| Setting | Value | Why |
|---|---|---|
| `max` | `1` | One connection per function instance; Vercel scales by process, so a pool per instance multiplies into slot exhaustion |
| `prepare` | `false` | Transaction-mode pooling does not preserve session state, so server-side prepared statements break |
| `fetch_types` | `false` | Skips the type-introspection round trip per connection |
| `idle_timeout` | `20s` | A frozen instance must not hold a pooler slot |
| `max_lifetime` | `30min` | Bounded connection age |
| `connect_timeout` | `5s` | Fail fast rather than consume the read budget |
| `statement_timeout` | **`MODEL_EVIDENCE_DB_MAX_MS + 30 ms`** | Server-side backstop, *derived* from the client cap |

The client is cached at module level, keyed by URL **and statement timeout**,
so warm invocations reuse one connection and a later caller cannot inherit an
earlier caller's budget.

> **`statement_timeout` is derived, never fixed.** It was originally hard-coded
> to 150 ms, which silently overrode `MODEL_EVIDENCE_DB_MAX_MS`: raising the
> client budget did nothing because Postgres still cancelled at 150 ms and
> returned `57014`, surfacing as a spurious `STORE_TIMEOUT` under load. Keeping
> the server marginally slower than the client means the client timer normally
> fires first and the failure is attributable. Regression-tested.

> **Consequence of `fetch_types: false`:** postgres.js cannot serialize a JS
> array into a Postgres array, so `= ANY(${array})` fails at runtime with
> *malformed array literal*. Every multi-value predicate uses
> `IN ${sql(values)}`, which expands to an ordinary parameterized value list.
> Values stay bound; nothing is interpolated. This was found by the real-Postgres
> tests and would have passed any mocked suite.

## 4. Read placement and budget

Order: **local deterministic → Redis → store → providers.**

- **A Redis hit returns before the store is consulted.** This is deliberate:
  measuring the store where the live read will *not* sit in Phase 3C would
  produce a hit rate that does not describe future behaviour. Tested.
- **A local verified record returns before the store is consulted.** Local
  registries are code-reviewed, tested, and zero-latency; the store is a tier
  *below* local evidence and *above* paid research, permanently.
- **`localOnly` requests never consult the store**, so the 2 s diagnostics
  budget is untouched.

**Budget: 120 ms cap, 400 ms route reserve.** Enforced three ways:

1. `deadline.run(..., { maxMs, reserveMs })` — the same abort machinery every
   other stage uses. If less than `maxMs + reserveMs` remains, the read is never
   started (`STORE_NO_BUDGET`).
2. A server-side `statement_timeout` derived from the client cap (§3).
3. An **independent outer bound** in `beginStoreShadowRead` at
   `maxMs + 60 ms`. The safety rule cannot rest on a store implementation
   honouring its own contract; a store that hangs must not hold the lookup open.

The read is *started* before the multi-second provider work and *awaited*
after, so in practice it adds no measurable latency.

> **The budget covers connect + auth, not just the query.** A cold connection on
> a new function instance can therefore exceed 120 ms and return a timeout miss.
> That is correct behaviour (fail fast → miss → research proceeds) and is
> asserted by a test, but it means early shadow metrics will show a cold-start
> timeout tail. Expect it; do not tune it away in 3B.

## 5. Failure behaviour

Every one of these is **indistinguishable from a cache miss** to the lookup:

| Condition | `failureCode` | Result |
|---|---|---|
| flag off | `STORE_DISABLED` | null store; no read attempted |
| credentials missing | `STORE_NOT_CONFIGURED` | null store |
| client construction fails | `STORE_UNAVAILABLE` | null store |
| connection refused / auth failure | `STORE_UNAVAILABLE` | miss |
| query error | `STORE_QUERY_ERROR` | miss |
| exceeded read budget | `STORE_TIMEOUT` | miss |
| no route budget left | `STORE_NO_BUDGET` | not attempted |
| token < 6 chars | `STORE_INVALID_INPUT` | no query issued |
| token maps to >1 product | `STORE_AMBIGUOUS_IDENTITY` | **no product returned** |
| malformed stored row | `STORE_MALFORMED_ROW` | row dropped and counted |

No route needs `try`/`catch` for database availability: the adapter absorbs its
own failures and `createNullStore()` gives callers a single code path.

Failure codes map onto the **existing** shared taxonomy
(`lib/lookup-failure-taxonomy.js`) as `cache_read_failure` — the store is
architecturally a cache tier, and a store failure must not appear on dashboards
as a new class of outage. `STORE_AMBIGUOUS_IDENTITY` maps to
`canonical_ambiguity`. No new `FAILURE_CATEGORIES` entry was added.

## 6. Shadow comparison

`lib/model-evidence-store/comparison.js` is a pure function over two
already-computed objects. Classifications:

| Value | Meaning |
|---|---|
| `store_not_attempted` | no read ran |
| `store_unavailable` / `store_timeout` / `store_ambiguous` | infrastructure or fail-safe |
| `no_store_record` | clean miss |
| `store_malformed` | a row existed but nothing usable survived validation |
| `identity_disagreement` | brand or model genuinely differs |
| `store_stale` | identity agreed, evidence stale or expired |
| `agreement` | windows identical, or both sides silent |
| `identity_agreement_lifecycle_difference` | windows overlap but differ |
| `conflicting_lifecycle` | windows disjoint, or the store holds an internal conflict |
| `store_stronger` / `live_stronger` | only one side has lifecycle evidence |

Policy notes:

- **Overlap, not equality.** Two sources placing a product in the same era with
  different precision is the normal case; demanding equality would make the
  agreement metric useless.
- **A transcription-equivalent identity is agreement**, not disagreement — the
  bounded O/0, I/1, L/1 rule from Phase 1 applies here too.
- **Staleness is its own classification, but the lifecycle relation is still
  computed** into `comparisonDetails.lifecycleRelation`, so "is stale data still
  correct?" stays answerable.
- **One malformed row alongside usable claims does not mask agreement**; it is
  reported in `comparisonDetails.storeMalformedClaimCount`.

## 7. Telemetry

Two places:

1. **`model_evidence_store_shadow`** — the complete standalone observation,
   emitted from the store layer for every shadow read.
2. **`shared_model_evidence`** — carries a compact `persistentStore` summary.

Plus the two route allowlists now carry the full field set, ready for 3C.

**Both allowlists import one shared projection**
(`lib/model-evidence-store/telemetry-fields.js`). This is deliberate: both
loggers silently drop unknown fields, and this repository has already shipped
that bug (the progressive-LKQ fields never reached production logs). A test
asserts the two allowlists carry an identical field set.

Fields: `persistentStoreAttempted`, `persistentStoreAvailable`,
`persistentStoreHit`, `persistentStoreFresh`, `persistentStoreStale`,
`persistentStoreDurationMs`, `persistentStoreMatchType`,
`persistentStoreProductMatched`, `persistentStoreAliasMatched`,
`persistentStoreEvidenceCount`, `persistentStoreEvidenceAgeDays`,
`persistentStoreComparison`, `persistentStoreAgreement`,
`persistentStoreIdentityDisagreement`, `persistentStoreLifecycleDisagreement`,
`persistentStoreAmbiguous`, `persistentStoreMalformed`,
`persistentStoreTimedOut`, `persistentStoreFailureCode`, `providerAvoided`,
`refreshScheduled`.

Safety: values are boolean, finite number, uuid, or categorical token.
`persistentStoreProductMatched` accepts a **uuid only**, so an internal bigint
id cannot be logged. Free text and connection-string-shaped values are dropped.
No serials, queries, URLs, or source text.

`providerAvoided` and `refreshScheduled` are **hard-coded `false`** in Phase 3B
and asserted by tests — a shadow read must never skip a provider call or
schedule a refresh. The fields exist now so the metric series is continuous
into 3C/3F.

## 8. Freshness policy

Two thresholds. Stale ⇒ serve and schedule a refresh (3F). Expired ⇒ do not
count as a hit; research as if it were a miss.

| Claim class | stale after | expired after |
|---|---|---|
| `verified` (curated / mirrored) | never | never |
| `strong` start claim, closed window | 365 d | never |
| `strong` start claim, open window | 180 d | never |
| `strong` end / discontinuation | 180 d | 730 d |
| `supported` | 90 d | 540 d |
| `weak` | 45 d | 270 d |
| `conflicting` | 30 d | 180 d |

An unreadable `last_verified_at` degrades to **expired**, never fresh.
**Negative results are never persisted** — "we found nothing" is a statement
about a provider on a day, not knowledge about a product, and stays in Redis at
15 minutes.

## 9. Redis relationship — unchanged in 3B

```
Postgres = durable learned knowledge (empty in 3B)
Redis    = hot cache / negative cache / rate limits / request dedupe
```

No Redis TTL was changed, no key format was changed, and no invalidation
semantics were activated. `products.evidence_version` exists and is populated
so Phase 3E can add it to the Redis key (making a DB write implicitly
invalidate Redis), but nothing reads it yet.

## 10. No write-back

Phase 3B performs **no runtime writes**. Enforced at three levels:

1. `upsertProduct`, `upsertAlias`, `persistEvidence`, `attachSource`, and
   `supersedeEvidence` throw `NOT_IMPLEMENTED` (asserted by a test).
2. The database role holds `SELECT` only — no INSERT/UPDATE/DELETE grants.
3. The provider path has no store reference; `gatherEvidence` and
   `runEvidenceExtraction` receive none.

Seeding is a manual, explicit operation via `db/seed/`.

---

## 11. Rollout

1. Merge with **both flags off**. Verify no behavioural change (`npm test`).
2. Deploy. Flags off → null store → nothing changes.
3. Provision Postgres **in the same region as the Vercel functions**.
   Cross-region alone can exceed the 120 ms budget.
4. Apply migrations against a **direct** connection:
   `MODEL_EVIDENCE_MIGRATION_URL=<direct-url> npm run db:migrate:evidence-store`
5. Verify: `npm run db:verify:evidence-store` → 5 tables, 19 indexes,
   36 check constraints, RLS enabled + forced on all five.
6. Seed only approved high-confidence records (`-- --seed`), or leave empty.
7. Set `MODEL_EVIDENCE_DB_URL` to the **transaction pooler** URL (port 6543),
   Production only.
8. Set `MODEL_EVIDENCE_STORE_SHADOW_ENABLED=true`. Redeploy once.
9. Observe shadow telemetry for 48–72 h against §12.
10. **Do not set `MODEL_EVIDENCE_STORE_ENABLED`.** That is Phase 3C.

## 12. Shadow success metrics and go/no-go

Collect from `model_evidence_store_shadow` over ≥48 h of production traffic.

| Metric | Go | Investigate | No-go |
|---|---|---|---|
| p50 `persistentStoreDurationMs` | ≤ 25 ms | 25–60 ms | > 60 ms |
| p95 `persistentStoreDurationMs` | ≤ 90 ms | 90–120 ms | > 120 ms |
| timeout rate | < 1% | 1–5% | > 5% |
| connection-failure rate | < 0.5% | 0.5–2% | > 2% |
| route p95 delta vs pre-shadow | ≤ +10 ms | +10–30 ms | > +30 ms |
| canonical hit rate | — | — | report only (store starts empty) |
| alias hit rate | — | — | report only |
| store miss rate | — | — | report only |
| identity agreement (of hits) | ≥ 99% | 95–99% | < 95% |
| lifecycle agreement (of hits) | ≥ 90% | 75–90% | < 75% |
| conflict rate | < 5% | 5–15% | > 15% |
| stale rate | < 10% | 10–30% | > 30% |
| Smart vs Refinement parity | 100% | — | anything < 100% |

**Parity must be exactly 100%.** The store must never interpret the same model
differently for the two workflows; any deviation is a defect, not a threshold.

Hit-rate metrics are reported but carry no threshold in 3B: the store is empty
or nearly so, so a low hit rate is expected and is not a signal about the
design. They become meaningful after Phase 3D write-back.

Do not enable live reads until every "Go" column is met.

## 13. Rollback

| Symptom | Action | Time |
|---|---|---|
| latency regression | `MODEL_EVIDENCE_STORE_SHADOW_ENABLED=false` | < 1 min |
| store errors in logs | same | < 1 min |
| anything worse | unset `MODEL_EVIDENCE_DB_URL` | < 1 min |
| schema mistake | drop and re-apply — the database is empty in 3B, which is why shadow-first is the right first deployment | minutes |

**No code revert is required for a shadow-only rollback**, and no rollback
touches user-facing behaviour, because shadow reads never influenced it.

## 14. Testing

```bash
npm run test:evidence-store       # 131 tests; real-DB tests skip without a URL

# With real PostgreSQL (required before any schema change is trusted)
docker run -d --name dmi-evidence-test \
  -e POSTGRES_PASSWORD=testpw -e POSTGRES_USER=testuser \
  -e POSTGRES_DB=evidence_test -p 55432:5432 postgres:16-alpine
MODEL_EVIDENCE_TEST_DB_URL=postgres://testuser:testpw@localhost:55432/evidence_test \
  npm run test:evidence-store
```

| File | Covers |
|---|---|
| `schema.test.mjs` | **real Postgres**: migrations execute and are idempotent, every CHECK rejects, indexes exist, RLS forced with zero policies, role has SELECT only |
| `store-adapter.test.mjs` | canonical/alias/miss/ambiguity against real SQL; failure, timeout, cold connection, malformed rows via a stub |
| `shadow-integration.test.mjs` | every store outcome leaves the lookup byte-identical and the provider still runs |
| `comparison-telemetry.test.mjs` | comparison policy; both allowlists carry an identical field set |
| `normalization-freshness.test.mjs` | token derivation, alias safety, URL normalization, freshness thresholds |
| `parity.test.mjs` | Smart Lookup vs Serial Refinement store interpretation |
| `security.test.mjs` | browser isolation, driver boundary, flag defaults, injection resistance, no credential logging |

Without `MODEL_EVIDENCE_TEST_DB_URL`, 44 real-DB tests **skip** rather than
fail, so `npm test` stays offline-safe. Mocked adapter tests do **not** prove
the migration executes — run the real-Postgres suite before trusting a schema
change.

Note `--test-concurrency=1`: the suite shares one database, and
`schema.test.mjs` takes exclusive DDL locks that would otherwise race the
adapter's SELECTs.

## 15. Known limitations

1. **The store is empty.** Phase 3B ships schema, adapter, and measurement.
   Hit rate will be near zero until Phase 3D write-back, by design.
2. **Cold-start timeouts.** The read budget includes connect + auth, so the
   first read from a new function instance may time out. Correct, but it puts a
   tail on shadow latency metrics.
3. **No shadow read on a Redis hit.** Intentional (§4), but it means shadow hit
   rate describes the post-Redis population only — which is exactly the
   population Phase 3C will serve.
4. **No live-read path exists yet.** `LIVE_READS_IMPLEMENTED` is `false`; the
   live flag is inert.
5. **Route-level telemetry is wired but unused.** The allowlist fields are
   populated only from the store layer's own event in 3B; forwarding them
   through `api/age-lookup.js` and `api/refine-serial-date.js` is Phase 3C work
   and was left out to avoid touching the routes.
6. **`BYPASSRLS` may be refused** by a managed platform; see `db/README.md`.

## 16. Phase 3C (next)

Flip reads live, still behind a flag:

1. Set `LIVE_READS_IMPLEMENTED = true` and add the live branch in
   `lookupModelEvidence()` — on a fresh store hit, map the bundle into the
   standard shared-evidence result via `mappers.js` and return early.
2. Write the mapped result into Redis via the existing
   `cache.setSharedEvidence()`, with a **7-day** TTL for DB-sourced entries.
3. Set `providerAvoided: true` when a store hit prevents research.
4. Forward the persistent-store fields through both route loggers (the
   allowlists already accept them).
5. Keep `expired` records as a reserve only: research first, use the stored
   record only if research fails.
6. Roll out on `MODEL_EVIDENCE_STORE_ENABLED=true` only after §12 passes.
