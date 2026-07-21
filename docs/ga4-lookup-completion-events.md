# GA4 lookup completion events

Decode My Item emits two browser-side GA4 events through the site's existing direct `gtag.js` installation:

- `decode_complete`
- `smart_lookup_complete`

The events are intentionally separate so traditional serial decoding and Smart Lookup can be analyzed independently.

## Firing rules

`decode_complete` fires once per logical decoder submission after a useful serial result is visible. Exact, ambiguous candidate-year, and meaningful partial results qualify. Blank, invalid, unsupported, network-error, and empty outcomes do not.

`smart_lookup_complete` fires once per logical Smart Lookup submission after the age or replacement workflow produces useful content. Local evidence, grounded research, deterministic reserves, model-line/family guidance, and useful timeout fallbacks qualify. Loading, unusable input, and empty unavailable cards do not.

Retries and rerenders do not create another completion after a useful result has already been counted. A genuinely new user submission receives a new in-memory completion sequence.

## Analytics transport

The helper calls only the existing direct GA path:

```js
window.gtag('event', eventName, parameters)
```

It does not add another GA script, does not push a second GTM event, does not await analytics, and silently returns when `gtag` is unavailable or blocked.

## Privacy

Payloads use an explicit parameter allowlist. They never include raw serials, model numbers, Smart Lookup queries, service tags, part numbers, SKUs, notes, source URLs, provider payloads, raw error text, request bodies, or cache keys.

## `decode_complete` parameters

- `lookup_type`
- `result_status`
- `result_precision`
- `brand_category`
- `date_precision`
- `candidate_year_count`
- `ambiguous`
- `refinement_used`
- `evidence_type`
- `decoder_path`

## `smart_lookup_complete` parameters

- `lookup_type`
- `result_status`
- `identity_level`
- `evidence_type`
- `local_evidence_hit`
- `grounded_result`
- `deterministic_fallback_used`
- `provider_attempted`
- `age_result_available`
- `replacement_result_available`
- `clarification_recommended`
- `brand_category`
- `conflict_detected`
- `timeout_with_useful_fallback`

## Local testing

Automated tests mock `window.gtag`. They verify that the helper is non-blocking, drops unknown parameters, rejects unsupported event names, and omits recognizable raw fixture values.

The production property must not be used for automated tests.

## GA4 administration after deployment

1. Verify both event names in GA4 Realtime or DebugView.
2. In GA4 Admin, mark `decode_complete` and `smart_lookup_complete` as Key Events.
3. Register only the parameters needed for reporting as event-scoped custom dimensions.

Recommended custom dimensions:

### Decode

- `result_status`
- `result_precision`
- `date_precision`
- `ambiguous`
- `refinement_used`
- `evidence_type`
- `brand_category`

### Smart Lookup

- `result_status`
- `identity_level`
- `evidence_type`
- `local_evidence_hit`
- `deterministic_fallback_used`
- `age_result_available`
- `replacement_result_available`
- `conflict_detected`
- `timeout_with_useful_fallback`
- `brand_category`

Key Event and custom-dimension configuration is an Analytics Admin task and is not performed by repository code.
