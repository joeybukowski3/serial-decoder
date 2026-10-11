# Replacement research (Phase 3): grounded discovery

Isolated and opt-in. No route, browser bundle, cache or production flag uses it. Entry point:
`recommendWithResearch()` in `lib/replacement-discovery/live-recommend.js`.

## Boundary

Providers may **discover, research, extract, suggest**. They may not decide. Every candidate goes through the
Phase 1 evaluator (`lib/replacement-core`) and Phase 2 ranking (`candidate-ranker.js`). Provider `rank`, LKQ
verdicts, scores, eligibility and prices are dropped at the schema boundary (names only are kept in a warning).

```
query -> interpretReplacementSearch -> planResearch
  Job A researchOriginal   (only if an exact model is known AND a HARD/STRONG-HIGH field is missing)
        -> validate -> evidence -> facts -> applyOriginalEnrichment -> rebuildInterpretation
  Job B researchCandidates (always; <= 6 drafts)
        -> validate -> evidence -> facts/relationship/tier -> candidate drafts
  discoverCandidatePool -> evaluateReplacement -> rankEvaluations -> 1 primary + 0-2 alternatives
  any failure -> fallbackProvider (a Phase 2 provider) or an explicit NO_CANDIDATES_DISCOVERED result
```

Broad queries ("LG side by side refrigerator") skip Job A: there is no exact original to research, so unknowns
stay unknown and Job B establishes a baseline.

## Evidence and fact status

Citations are server-derived: a model-claimed source domain only becomes a URL if it appears in Gemini's
grounding metadata. Status comes from evidence rank alone:

| rank | source | status |
|---|---|---|
| 1 | manufacturer page, exact model | KNOWN |
| 2 | major retailer listing, exact model | KNOWN |
| 3 | technical database, exact model | INFERRED |
| 4 | other grounded result, or any source for a different/unstated model | INFERRED |
| 5 | unresolved domain, marketplace, provider prose | ASSUMED |

Two distinct grounded domains agreeing upgrade INFERRED to KNOWN. For the **original**, a model token that is
only a prefix of the researched model (`QN55Q80` vs `QN55Q80C`) caps facts at INFERRED; candidates tolerate a
short suffix tail. User KNOWN facts are never overwritten (conflicts become warnings). Tier comes only from a
grounded `MODEL_LINE` claim (INFERRED, never KNOWN, never from price); otherwise the brand/category baseline stays.

`physicalFit` (and `brand`/`model` as researchable fields) are never accepted from a provider. Published dimensions, clearances, mount patterns and `panelReady` ARE researchable, as evidence-backed facts.

## Physical fit (policy)

`physicalFit` stays the single HARD rule in each profile, but `lib/replacement-core/fit.js` decides whether it
applies. Semantics only; the user-facing buckets are unchanged.

| situation | outcome |
|---|---|
| known constraint, known violation | NOT_LKQ |
| known constraint, verified compliance | pass (`VERIFIED`) |
| known constraint that cannot be checked yet | `CONSTRAINT_UNVERIFIED`: blocks LKQ (UNCONFIRMED) |
| intrinsic install (built-in, integrated, column, panel-ready) with nothing to verify against | `CONSTRAINT_UNVERIFIED`, fit question ranked first |
| no constraint known (ordinary TV, freestanding refrigerator) | `ADVISORY` / `VERIFY_FIT`: never blocks LKQ |

Constraints come only from the case: `opening{Width,Height,Depth}In` (user-stated space, parsed only next to a cue
word such as "must fit"/"opening"/"cabinet"), `mountReuseRequired` (+ `mountPattern`), `panelReady`, or a documented
`physicalFit: true`. Required space = candidate dimension + published clearance; a mount mismatch only matters when
mount reuse is required. Candidate dimensions are research facts; the provider never states that something fits.

A constraint the user STATED but that cannot be used (conflicting values, inferred/assumed, non-numeric, or text the
parser cannot read such as feet, mm or fractions) is never treated as "no constraint": it is `CONSTRAINT_UNVERIFIED`
and blocks LKQ. Intrinsic installs and a documented fit need all three axes verified; one passing axis is not enough.
The parser only reads dimensions next to a cue in the same clause, honors negation ("no need to reuse the mount"),
reads left-to-right so values cannot cross-pair, and caps input at 2000 characters.

Confidence: an advisory row is not counted as a missing requirement. A *meaningful* advisory (always for
refrigerators; for TVs only when the candidate screen is larger) caps an otherwise HIGH result at MEDIUM.

## Grounding, size semantics and the unsourced fallback

**Search requirement (prompt v2).** Gemini decides whether to call the enabled `google_search` tool; there is no "force search"
parameter, so the prompts make the task itself require verification: every material claim must be verified with Google Search,
never answered from memory, omitted when unverifiable, and never attributed to a domain Search did not return; candidates must be
supported by a grounded source for the exact model, and fewer is better than unsourced. Self-reported domains still count for
nothing: only real grounding metadata creates evidence.

**Grounding status** (diagnostic, never a classification): `GROUNDED` / `PARTIALLY_GROUNDED` / `UNGROUNDED`, per job
(`result.research.grounding`) and per candidate (`candidate.source.groundingStatus`). It is judged from evidence resolution over the
material facts (identity + HARD + STRONG-HIGH keys), and no usable grounding metadata at all is always `UNGROUNDED`. Reason codes:
`ORIGINAL_RESEARCH_UNGROUNDED`, `LIVE_RESEARCH_UNGROUNDED`, and `PROVISIONAL_UNSOURCED_RECOMMENDATION` when the returned primary
itself is ungrounded. The result is still returned (always-return).

**Nominal vs measured TV size.** `screenSizeIn` is the NOMINAL marketed class (HARD rule); `measuredDiagonalIn` (54.6) is separate
supporting detail. A whole number is taken as the stated class; a fraction is a measurement, mapped to a class only when it falls in
that class's own band (`screen-size-class.js`: 1.0 in below to 0.5 in above, from a fixed class table, not a percentage tolerance).
A measurement matching no single class leaves the nominal unresolved (UNVERIFIED), and a derived nominal is capped at INFERRED.
`QN55...` still infers a nominal 55 from the model token.

**Sparse-evidence ranking.** After every ordinary key (hard failures, classification, similarity, confidence, smaller upgrade) comes a
likeness ladder: category, nominal size/capacity class, brand, family/display/configuration, closest non-excessive specification
match. `candidateId` is only the final mechanical tie-break. No provider rank and no price. `result.rankingExplanation` names the
key that decided the primary against every other candidate.

**Category provenance.** Candidate `category` is a context-derived fact (`basis: DISCOVERY_CONTEXT`, no evidence refs): the discovery
job constrains it and a wrong category is still rejected at the schema.

## Relationships

A provider relationship is a ceiling. `DIRECT_SUCCESSOR` needs a grounded manufacturer/retailer source plus a
`relatedModel` matching the original; otherwise it downgrades to `SAME_SERIES` / `SAME_BRAND_ALTERNATIVE`.
Cross-brand and baseline candidates cannot claim same-brand relationships.

## Failure, fallback, reason codes

Research methods return status objects and never throw into the pipeline; malformed provider return shapes and a throwing fallback also degrade instead of crashing. Only invalid caller input (empty query, `discoveryLimit` outside 1-6) is rejected, and it is rejected before any provider call. A rate limit, cooldown, budget denial or MODEL-unavailable error (`PROVIDER_MODEL_UNAVAILABLE`: HTTP 404 NOT_FOUND, or 400 INVALID_ARGUMENT, whose message is about the model) on Job A skips Job B; any other 404/400/5xx stays recoverable. Live drafts that all fail final validation still reach the fallback. Codes: `ORIGINAL_RESEARCH_UNAVAILABLE`,
`LIVE_RESEARCH_UNAVAILABLE`, `LIVE_DISCOVERY_EMPTY`, `LIVE_DISCOVERY_PARTIAL`, `FALLBACK_BASELINE_USED`.
Error text is never propagated; only a sanitized code is kept.

## Cost and deadline bounds

* At most `MAX_RESEARCH_CALLS` (2) provider calls per recommendation, no retries, <= 6 candidates, <= 12 parsed.
* The provider owns the deadline (`CALL_MAX_MS` 25000, total 55000 by default, both Phase 3 only; Smart Lookup keeps its 8500 ms
  route budget) so a hung transport is cut off. Grounded Gemini 3.8 research timed out at the old 6.5 s per call.
* Request settings (gemini-3.8-flash, `generateContent`): `tools: [{ google_search: {} }]`,
  `generationConfig: { maxOutputTokens: 8192, thinkingConfig: { thinkingLevel: "low" } }`. No temperature/topP/topK (Gemini 3
  defaults are advised), no thinking budget, no thought summaries. Thinking tokens share `maxOutputTokens`.
* `createGeminiGroundedTransport` requires an injected `budgetGate` (fail closed), honours the Gemini cooldown
  interface, treats a 429 as the end of Gemini use, and records attempts through `provider-attempts.js`.
* It deliberately does **not** call `reserveProviderBudget`: that draws from the production `age`/`lkq` daily counters.

## Reuse from the existing runtime (imports only, no edits)

`extractJsonFromText`, `parseGroundingSources`, `SmartLookupProviderError` (provider.js). The model is NOT shared:
Phase 3 has its own `PHASE3_GEMINI_MODEL` (`gemini-3.8-flash`) in the transport, because the shared `GEMINI_AGE_MODEL`
(`gemini-2.5-flash`) is unavailable to new API keys and also serves existing Smart Lookup paths;
`recordProviderAttempt`, `classifyProviderFailure`, `usageFromGemini` (provider-attempts.js); `createDeadline`;
`hashCanonicalQuery` (cache.js). The grounded HTTP shell is re-implemented because `callGeminiJson` is not exported.

## Cache identity (design only, nothing reads or writes Redis)

`buildResearchCacheKey({ job, original, mode, limit })` -> `replacement-research:v1:<job>:<category>:<hash>`.
The hash covers schema/prompt versions, job, mode, limit, category, brand, normalized model, model line and the
material KNOWN/INFERRED facts. Raw text, spacing/casing and ASSUMED baselines are excluded; physicalFit is excluded.

## Known limits

* Fit is verified only against constraints the user supplied; with none, the answer is always an advisory.
  Built-in style installs stay UNCONFIRMED until an opening is supplied.
* Successor support verifies that the cited domain was grounded and is a manufacturer/retailer, not that the
  page text mentions both models.
* Series labels are compared as strings (`Q80 Series` vs `Q80D Series` counts as different).
* If a provider returns more than the pool limit, truncation follows provider order (not authoritative, but unavoidable before evaluation).
* Real Gemini output shape is untested here; run the smoke script once before relying on it.

## Manual smoke test

`node scripts/replacement-research-smoke.mjs` is a dry run. Live needs `ITEMASSIST_LIVE_RESEARCH_SMOKE=1`,
`--confirm-live` and `GEMINI_API_KEY`; it makes at most 2 requests through an in-memory cap, uses no Redis, and
prints only sanitized fields. It is referenced by no npm script, build step or CI.
