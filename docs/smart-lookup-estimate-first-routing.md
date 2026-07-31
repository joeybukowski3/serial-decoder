# Smart Lookup estimate-first routing

Ordinary age lookups use one bounded route:

`verified/local -> Redis -> shared Serper + Gemini -> one heavyweight provider -> deterministic estimate`

The shared evidence stage accepts evidence according to `querySpecificity`:

- `exact-model` retains deterministic exact-token identity requirements.
- `model-line` accepts exact, variant, and family evidence and returns line/generation timing with a suffix-variation caveat.
- `product-family` accepts launch, availability, generation, and reputable dated family evidence and returns an introduction period or open-ended range.
- meaningful partial/free-description input accepts a supported candidate and intentionally broad dated period with refinement guidance.

One Serper query is attempted first. A document-focused reformulation is made only when the first result lacks useful signal, and both searches share a 3,000 ms aggregate budget. Gemini extraction is capped at 4,000 ms. Search evidence is domain-deduplicated and capped before extraction.

The route deadline is 15,000 ms. The selected heavyweight provider receives at most 6,500 ms from the remaining global deadline. `SMART_LOOKUP_HEAVY_PROVIDER=xai` selects xAI when configured; otherwise OpenAI is preferred, with xAI selected only when OpenAI is unavailable. The normal route passes `enableXaiFallback: false`, so an OpenAI timeout never starts xAI during the same request.

Successful cited estimates use the versioned `smart-age:v6:estimate-first-single-heavy-1` cache for 180 days. Shared raw search and extracted-fact caches remain versioned; unsuccessful shared retrieval and useful deterministic substitutes returned after a provider failure are negatively cached for 15 minutes. Legacy cached response objects continue through the normalizer, while the route-version bump prevents older policy results from satisfying new lookups.

`SMART_LOOKUP_SHARED_MODEL_EVIDENCE_SHADOW_ENABLED` is safe while the active shared flag is enabled because code only starts exact-model shadow work when the active path is disabled. After deployment validation, set shadow mode to `false`: it no longer adds production value once the generalized active path is accepted, and disabling it removes accidental cost if the active flag is later changed.

Introduction, launch, model-line, and family dates are never labeled as individual-unit manufacture dates. The additive `bestEstimateYear`, `estimatedRange`, `rangeLabel`, `estimateBasis`, `confidence`, and `summary` fields supplement the existing response shape; legacy fields remain normalized and supported.
