# GA4 lookup lifecycle events

Decode My Item's repaired lookup lifecycle uses `event_version="2"`. Version 2 begins when this code is deployed; reports that span the cutover must segment on `event_version`, because older completion events used DOM inference and different success/failure semantics.

## Attempt semantics

An attempt begins only after the workflow accepts sufficiently complete input for processing. Each accepted decoder attempt emits one `decode_start`, then at most one terminal `decode_complete`. Each accepted Smart Lookup attempt emits at most one terminal `smart_lookup_complete`. Retries create new in-memory attempts. Rerenders and later refinement of a completed attempt do not emit another completion.

Attempt tokens exist only in browser memory for deduplication. They are never included in analytics payloads.

The lifecycle is emitted explicitly by decoder and Smart Lookup controller branches. It is not inferred from clicks, key presses, rendered text, CSS state, or `MutationObserver` activity.

## Decoder events

`decode_start` fields:

- `event_version="2"`
- `lookup_type="serial-decode"`
- `decoder_path`
- `brand`
- `category`

`decode_complete` fires for every terminal outcome. Its `result_status` is one of:

- `resolved` — a clearly useful resolved result
- `ambiguous` — multiple useful candidate years remain
- `partial` — useful information was returned without a complete resolution
- `unsupported` — no supported decoding rule applies
- `invalid` — the decoder rejected the input/result as invalid
- `no-result` — processing completed without a result
- `error` — an exception or operational error ended the attempt

Safe completion fields, when available, are `event_version`, `lookup_type`, `decoder_path`, `brand`, `category`, `result_status`, `result_precision`, `date_precision`, `candidate_year_count`, `ambiguous`, `refinement_used`, and `evidence_type`.

`decode_success` remains temporarily for historical compatibility. Version 2 emits it only with `result_status="resolved"`; ambiguous and partial results do not count as success.

`decode_fail` is limited to `unsupported`, `invalid`, `no-result`, and `error`. Its `failure_type` is exactly the corresponding controlled value. Ambiguous and partial results are useful outcomes and are not failures.

## Smart Lookup completion

Every accepted Smart Lookup terminal outcome emits `smart_lookup_complete`. Its `result_status` is one of `resolved`, `partial`, `conflict`, `no-result`, or `error`.

Fields are:

- `event_version="2"`
- `lookup_type="smart-lookup"`
- `decoder_path`
- `result_status`
- `identity_level`
- `brand`
- `category`
- `evidence_type`
- `local_evidence_hit`
- `grounded_result`
- `deterministic_fallback_used`
- `provider_attempted`
- `age_result_available`
- `replacement_result_available`
- `clarification_recommended`
- `conflict_detected`
- `timeout_with_useful_fallback`

`replacement_result_available` is derived from structured controller/result state. It is never inferred from rendered copy.

## Controlled decoder paths

- `homepage` — `/` and `index.html`
- `brand-lookup` — dedicated `*-serial-number-lookup` or `*-serial-number-decoder` entry points
- `legacy-brand` — legacy brand routes and other lookup hosts
- `guide` — guide/how-to entry points
- `embedded-tool` — the standalone embedded decoder tool

## Privacy exclusions

Analytics intentionally excludes raw serial numbers, model numbers, free-form queries, notes, URLs, result IDs, provider payloads, request bodies, cache keys, error messages/stacks, and attempt tokens. Unknown fields are dropped by both GA4 privacy allowlists. Tests require those allowlists to remain identical.

## Transport and administration

Events use the existing non-blocking `window.gtag('event', name, parameters)` path. No additional GA installation is added, and blocked/unavailable analytics never blocks a lookup.

After deployment, verify version 2 events in GA4 Realtime/DebugView, segment historical reports at the deployment cutover, mark the desired completion events as Key Events, and register only the approved low-cardinality parameters needed for reporting.
