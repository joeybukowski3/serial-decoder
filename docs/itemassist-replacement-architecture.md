# ItemAssist replacement architecture checkpoint

Status: TV retrieval-first proof, isolated from production routes. This document describes the intended next boundary; it does not add a Product Knowledge store or Replacement Catalog.

## Current deterministic path

`lib/replacement-discovery/retrieval-first.js` searches for exact product pages, extracts bounded TV facts, binds each fact to source evidence, and builds candidate drafts. Its discovery priority orders page fetches only. `lib/replacement-core` applies versioned category HARD, STRONG, and SECONDARY rules, fit, scoring, confidence, and classification. `candidate-ranker.js` ranks evaluated candidates from structured comparisons; search-provider rank and price do not decide LKQ. The proof runner is fixed to QN55Q80C and is not called by a production route.

The Samsung Q80 C/D and QN90 D tier entries in `normalize-values.js` are versioned **product-family policy**, supported by a verified series. Model suffix year mapping in `retrieval-first.js` is deterministic discovery policy. Neither is a per-model specification record. Individual screen, resolution, panel, refresh, and dimension values come from retrieved product facts and must eventually reside in product data.

## Reusable product facts

Current `identity.facts` entries have `value`, `status`, `basis`, and evidence references. The retrieval report also carries evidence with source URL, source type, observation time, field claim, subject model, and confidence. These map to a record with `schemaVersion`, category, brand, model, fullModel, family, series, modelYear, `specs` (screenSizeIn, resolution, displayTechnology, refreshHz, smart, hdr, widthIn, heightIn, depthIn), tier (`value`, `status`, `basis`, `registryVersion`), provenance (`sourceUrl`, `sourceType`, `observedAt`, `fields`), and verification (`verifiedAt`, `confidence`). Map `verifiedAt` and record confidence from validated field evidence at persistence time; they are not current top-level identity fields. Preserve per-field status and evidence, including unknown or conflicting values, rather than turning AI prose into a fact. `measuredDiagonalIn` is separate from marketed `screenSizeIn`.

## Future lookup and enrichment

1. Parse user model or partial item information, then try exact or normalized model lookup in Product Knowledge.
2. If the original record is sufficiently fresh for the required fields, use it without original-product web research. Otherwise retrieve, extract, validate, and make the normalized record eligible for persistence.
3. Query the Replacement Catalog for plausible current products. Check catalog freshness and required fact coverage.
4. Run replacement-core and deterministic ranking over the normalized original and candidate records.
5. Use live retrieval or AI only when the original is unknown, the catalog is insufficient or stale, important facts are missing, or model ambiguity needs interpretation.

A future batch job can populate both stores: model list → authoritative retrieval → deterministic extraction → optional bounded AI extraction fallback → validation → normalized product record → persistent Product Knowledge or Replacement Catalog. This researches repeated models once rather than on every customer lookup. Store provenance and freshness with each field; version rules independently of product records so records can be reevaluated after policy changes.

AI may interpret messy input, resolve ambiguous model strings, extract facts from retrieved text, fill unknown catalog entries, and explain a deterministic result. AI must not independently set HARD requirements, tier policy, category rules, final LKQ classification, or final candidate ranking when structured facts are available. Those decisions remain in versioned deterministic code.
