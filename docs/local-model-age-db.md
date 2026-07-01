# Local Model Age DB

This repo now includes a local-first seed database for model age lookups at `data/model-age-db.json`.

## Purpose

The local database is meant to answer high-confidence known model lookups before the app falls back to the existing Smart/API lookup path.

## File Format

The JSON file uses this top-level shape:

```json
{
  "version": 1,
  "lastUpdated": "YYYY-MM-DD",
  "description": "Short description",
  "records": []
}
```

Each record should use this schema:

```json
{
  "brand": "LG",
  "model": "OLED55C3PUA",
  "normalizedBrand": "lg",
  "normalizedModel": "oled55c3pua",
  "category": "television",
  "yearStart": 2023,
  "yearEnd": 2024,
  "estimatedYear": 2023,
  "productionRange": "2023-2024",
  "source": "Where this range came from",
  "notes": "Why this record exists and what the years mean",
  "aliases": ["OLED55C3", "C3"]
}
```

## Field Notes

- `brand`: display brand name.
- `model`: display model number.
- `normalizedBrand`: optional stored normalized brand key. If omitted, the helper derives it.
- `normalizedModel`: optional stored normalized model key. If omitted, the helper derives it.
- `category`: optional product family label used for later filtering or UI hints.
- `yearStart` / `yearEnd`: numeric production window bounds when known.
- `estimatedYear`: single best guess year used for the current age lookup response shape.
- `productionRange`: display-friendly range string returned as `yearRange`.
- `source`: short provenance note for the local record.
- `notes`: reasoning or context that explains the date window.
- `aliases`: alternate model strings, prefixes, family names, or trimmed variants that should still match.

## Matching Design

The helper in `lib/model-age-db.js` is scaffolded for:

- exact model match
- normalized exact match
- alias exact match
- prefix and contains candidate search
- lightweight fuzzy scoring without adding a dependency

Current fuzzy behavior is intentionally simple. The next implementation pass can tune thresholds and use request context such as parsed brand/model tokens.

## How To Extend It

1. Add a new record to `data/model-age-db.json`.
2. Keep `brand`, `model`, `estimatedYear`, `productionRange`, `source`, and `notes` populated whenever possible.
3. Add a few practical `aliases` for trimmed models, family names, or common user-entered variants.
4. Keep normalized fields lowercase and alphanumeric only if you choose to store them explicitly.
5. Prefer evidence-backed windows over speculative single-year guesses.

## Planned Integration

The intended flow for `api/age-lookup.js` is:

1. Normalize incoming brand/model text.
2. Load local DB records.
3. Try exact local match first.
4. If no exact match exists, score close candidates.
5. Return a formatted local response only when confidence clears a defined threshold.
6. Fall back to the current AI lookup path for everything else.


## Serial Refinement v2 Schema

Serial-date refinement uses exact-model records and structured `refinementEvidence`. Broad `estimatedYear` guesses are retained only as `legacyEstimatedYear` metadata and are not used to choose a serial candidate.

Each refinement evidence record can include `type`, `sourceName`, `sourceUrl`, `productionStart`, `productionEnd`, `availabilityStart`, `availabilityEnd`, `quality`, and `verified`. Exact selection is performed only by intersecting the serial-valid candidate years with a defensible evidence window.

Short family prefixes are not exact aliases. O/0 and I/L/1 changes are represented as transcription alternatives and must be validated against a structured exact-model record before use.
