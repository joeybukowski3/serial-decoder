# Serial Refinement Production Hardening (Phase 2)

## Unified architecture

Preferred production path:

```text
Local verified evidence
→ model-production evidence
→ Redis cache (mode + policy + identity versioned)
→ shared Serper retrieval (bounded dual-form model search)
→ Gemini structured extraction (non-grounded)
→ deterministic candidate evaluation
→ ranked / resolved / era-context / conflict / clarification result
```

Rollback path (unchanged env default until explicitly switched):

```text
MODEL_REFINEMENT_MODE=legacy_gemini
→ Gemini Google Search grounded provider
→ same response schema + deterministic best-available degradation
```

Shared building blocks:

| Layer | Module |
|-------|--------|
| Model identity (O/0, I/1) | `lib/model-evidence/shared-model-identity.js` |
| Shared evidence service | `lib/model-evidence/service.js` |
| Deterministic provider | `lib/serial-refinement/deterministic-provider.js` |
| Response ladder | `lib/serial-refinement/response-mapping.js` + `response-schema.js` |
| Failure taxonomy | `lib/lookup-failure-taxonomy.js` |
| Telemetry + cost proxies | `lib/serial-refinement/telemetry.js` |
| Budgets | `lib/serial-refinement/budgets.js` |
| Cache TTL policy | `lib/serial-refinement/cache-policy.js` |
| In-flight singleflight | `lib/serial-refinement/inflight.js` |

## Production mode behavior

| Mode | Env value | Provider | When to use |
|------|-----------|----------|-------------|
| Legacy Gemini (default today) | `legacy_gemini` or unset | Grounded Gemini (+ Smart Lookup fallback inside provider) | Rollback only after switch |
| Deterministic Serper (**preferred**) | `deterministic_serper` | Serper → Gemini extraction → deterministic eval | Production target |
| Local only | `local_only` | No online providers | Diagnostics / offline |

Both modes:

- use the same `buildSharedModelIdentity` representation;
- preserve entered vs canonical disclosure;
- emit schema-compatible refinement responses;
- support `resolved`, `ranked`, `ambiguous_with_era`, `ambiguous`, `conflict`, `clarification`, `unavailable`;
- degrade to best-available serial/model context on timeout, rate limit, or malformed provider output;
- include `refinementMode` (as `mode` historically, now also `refinementMode`) in telemetry.

## Recommended production setting

After merge + deploy with **current** mode unchanged, and after canary + smoke pass:

```bash
MODEL_REFINEMENT_MODE=deterministic_serper
```

Do **not** change this during the initial code deploy. Switch in a second deploy.

## Environment variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `MODEL_REFINEMENT_MODE` | `legacy_gemini` \| `deterministic_serper` \| `local_only` | `legacy_gemini` |
| `MODEL_REFINEMENT_SHARED_EVIDENCE_SHADOW_ENABLED` | Shadow deterministic path while on legacy | off |
| `SERPER_API_KEY` | Required for deterministic path online search | unset |
| `GEMINI_API_KEY` / project Gemini key | Extraction (deterministic) or grounded (legacy) | existing |
| `UPSTASH_REDIS_REST_URL` / `TOKEN` | Cache + rate limit | existing |

No other env vars are required for Phase 2.

## Mode-switch procedure

1. Merge hardening code with `MODEL_REFINEMENT_MODE` **unchanged** (keep `legacy_gemini` if that is current).
2. Verify CI (unit, API, canary, Playwright where available).
3. Deploy once.
4. Run `npm run test:lookup-canary` locally/CI (mocked — no paid calls).
5. Set Vercel env: `MODEL_REFINEMENT_MODE=deterministic_serper`.
6. Redeploy once.
7. Run controlled smoke tests (see checklist).
8. Monitor latency, result tier mix, error rate, Serper/Gemini usage.
9. Roll back mode only if thresholds are exceeded (below).

## Rollback procedure

1. Set `MODEL_REFINEMENT_MODE=legacy_gemini` in Vercel.
2. Redeploy once (no code revert required for mode rollback).
3. Confirm telemetry `refinementMode` / `mode` is `legacy_gemini`.
4. Confirm schema-compatible responses and serial candidates still render.
5. If cache pollution is suspected, wait out short negative TTLs (15 min) or bump policy version in a follow-up.

Cache keys include mode + schema/policy/identity versions, so switching modes cannot serve incompatible stale final responses.

## Cache versioning and TTLs

Final response keys (`lib/serial-refinement/cache-key.js`):

- namespace `serial-refinement:v3`
- schema version `3`
- policy version `3`
- identity policy version
- evidence policy version
- model-production DB version
- **refinement mode**
- brand, category, **canonical model**, effective candidates, decoded month

Recommended final-response TTLs (`lib/serial-refinement/cache-policy.js`):

| Result class | TTL |
|--------------|-----|
| Resolved (high confidence) | 60 days |
| Ranked / ambiguous_with_era | 14 days |
| Ambiguous / medium resolved | 10 days |
| Timeout / rate-limit negative | 15 minutes |
| Malformed extraction negative | 5 minutes |

Shared evidence layer TTLs remain in `lib/serial-refinement/deterministic/cache.js` (raw Serper 1d, facts 7d, normalized evidence 180d, negative 15m).

In-process singleflight (`runSharedInflight`) shares duplicate concurrent provider work per instance.

## Timeout budgets

| Stage | Target |
|-------|--------|
| Browser hard timeout | **15s** |
| API global (`deterministic_serper`) | **12s** |
| API global (`legacy_gemini`) | **14s** (still under browser) |
| Local + model-production DB | ≤ 500ms |
| Redis read/write phase | ≤ 500ms total intent; 250ms / 200ms caps |
| Serper aggregate | **3s** |
| Gemini extraction | **4.5s** |
| Deterministic completion reserve | **400ms** |

Global deadline always reserves completion time so timeouts still assemble ranked/era/serial context instead of blank UI.

No automatic retry doubles provider cost. Search alternatives remain capped at 2 model forms.

## Failure taxonomy

Shared codes in `lib/lookup-failure-taxonomy.js`:

`input_unusable`, `identity_unresolved`, `local_evidence_miss`, `cache_read_failure`, `cache_write_failure`, `search_timeout`, `search_rate_limited`, `search_no_results`, `extraction_timeout`, `extraction_malformed`, `extraction_no_usable_facts`, `identity_mismatch`, `canonical_ambiguity`, `evidence_conflict`, `candidate_intersection_empty`, `provider_unavailable`, `global_deadline`, `budget_exhausted`, `schema_invalid`.

Each degraded/failed request should carry:

- `failureCategory`
- `failureStage`
- `failureCode`
- `resultTierReturned` (telemetry)
- `deterministicFallbackUsed`
- `usefulContextPreserved` (telemetry)

These distinguish **provider failed, useful result returned** from **provider failed, no useful context**.

## Interpreting telemetry

Event: `serial_refinement` (JSON log line).

Key questions:

| Question | Fields |
|----------|--------|
| What did the user enter? | `enteredModel`, `enteredBrand` (no raw serial) |
| Canonical model? | `canonicalModel`, `equivalenceReason` |
| Alternatives searched? | `searchedModels` |
| Mode? | `refinementMode` |
| Local / cache / Serper / Gemini? | `localEvidenceHit`, `cacheStatus`, `sharedEvidenceAttempted`, `cost.serperCallCount`, `cost.geminiExtractionRan` |
| Stage failed? | `failureStage`, `failureCategory`, `failureCode` |
| Result tier? | `resultTier`, `preferredCandidateYear`, `remainingCandidateYears` |
| Latency? | `totalMs`, `serperDurationMs`, `geminiDurationMs`, `localMs`, `cacheMs` |
| Cost proxy? | `cost.estimatedCostUsd`, `cost.cacheHit` |

Never logged: API keys, auth headers, raw serial numbers, unbounded free-text context.

## Canary command

```bash
npm run test:lookup-canary
```

Also:

```bash
npm run test:parity
npm run test:refinement-hardening
```

Canaries are **fully mocked** — no paid live Serper/Gemini/OpenAI/xAI sweeps.

## Production smoke-test checklist

After mode switch:

1. Whirlpool serial + `WED4850HWO` → ranked or resolved modern year; entered/recognized disclosure present.
2. Same serial + `WED4850HW0` → same canonical identity.
3. VIZIO `M321i-A2` → local/generation path or non-fabricated estimate.
4. Lenovo ThinkSystem ST50 → useful estimate/era under timeout degradation.
5. Nintendo Switch 2 / Sony Bravia → no invented exact manufacture date.
6. Force provider timeout in staging → serial candidates still visible; taxonomy fields present in logs.
7. Confirm no sequential OpenAI→xAI (or dual heavy providers) on a single refinement request.
8. Confirm `refinementMode=deterministic_serper` in logs and p95 `totalMs` under budget.

## Rollback thresholds (suggested)

Roll mode back to `legacy_gemini` if within 30–60 minutes of switch:

- error rate for refinement > 2× pre-switch baseline, or
- share of blank/unavailable results for meaningful model inputs rises sharply with loss of ranked/era tiers, or
- p95 latency exceeds browser timeout policy, or
- Serper/Gemini error storms without useful degraded results.

## Future evidence database interface

Phase 2 intentionally stops short of Postgres/Supabase. Call sites already isolate:

- local verified evidence
- model-production DB
- shared evidence service

A future persistent evidence store should implement the same lookup surface as `lookupModelEvidence` / local evidence adapters without forking Serial Refinement and Smart Lookup identity logic.

## Deployment sequence (summary)

1. Merge code with current mode unchanged.
2. Verify CI.
3. Deploy.
4. Run deterministic canary.
5. Change `MODEL_REFINEMENT_MODE` to `deterministic_serper`.
6. Redeploy once.
7. Run controlled smoke tests.
8. Monitor latency, result tier, error rate, provider usage.
9. Roll back mode only if documented thresholds are exceeded.

**This document does not authorize deploy.** Apply only after explicit operator instruction.
