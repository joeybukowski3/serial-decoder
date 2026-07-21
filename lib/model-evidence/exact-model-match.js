// Shared exact-model evidence matching, used by BOTH the serial-refinement
// framework (lib/serial-refinement/local-evidence.js) and the Smart Lookup
// local model-age lookup (lib/model-age-db.js).
//
// Why this exists: `exactAliases` was only ever read by serial refinement, so a
// verified alias such as GFW850SPN0DG resolved there but was invisible to Smart
// Lookup, whose `buildSearchTerms` covers `model` + `aliases` only.
//
// The two alias fields are NOT interchangeable and this module deliberately
// keeps them apart:
//
//   - `model` / `exactAliases` -- verified identifiers for the SAME exact
//     model (label variants, parts-database variants). Compared with strict
//     equality only. Safe to base an exact-model identity claim on.
//   - `aliases` -- broader alternate lookup names. These feed
//     `buildSearchTerms`, which is consumed by Levenshtein/prefix *fuzzy*
//     scoring in `scoreLocalModelAgeConfidence`. Folding verified identifiers
//     into that pool would weaken, not strengthen, exact matching.
//
// This module therefore only ever performs strict equality on the exact fields.
// It never does fuzzy, substring, prefix, or transcription matching.

// An exactAlias shorter than this is too generic to carry an identity claim
// (and would be an unsafe basis for inferring a brand). Every alias currently
// in the database is well above this.
export const MIN_EXACT_TOKEN_LENGTH = 6;

// Project-approved normalization only: case folding plus punctuation/spacing
// removal. Never converts 0<->O, never strips digits or model suffixes.
// Matches lib/model-age-db.js#normalizeModelNumber and
// lib/serial-refinement/normalize-model.js#compactModelValue apart from case.
export function compactModelToken(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function normalizeEvidenceBrand(value) {
  return String(value || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
}

export function canonicalModelToken(record) {
  return compactModelToken(record?.model);
}

export function exactAliasTokens(record) {
  return (Array.isArray(record?.exactAliases) ? record.exactAliases : [])
    .map(compactModelToken)
    .filter((token) => token.length >= MIN_EXACT_TOKEN_LENGTH);
}

// Strict equality against the canonical model or a verified exact alias.
// Returns null when the token matches neither.
export function exactMatchKind(record, token) {
  if (!token || token.length < MIN_EXACT_TOKEN_LENGTH) return null;
  if (canonicalModelToken(record) === token) return 'canonical-model';
  if (exactAliasTokens(record).includes(token)) return 'exact-alias';
  return null;
}

/**
 * Resolve one entered model against verified local evidence.
 *
 * Ambiguity is a first-class outcome: when a token resolves to more than one
 * distinct record, this returns `ambiguous: true` with `record: null` rather
 * than silently choosing the first, so callers degrade to a non-exact
 * classification instead of asserting the wrong product.
 */
export function matchExactModelEvidence(records, enteredModel, options = {}) {
  const token = compactModelToken(enteredModel);
  const empty = {
    record: null, matchedBy: null, canonicalModel: null,
    enteredModel: String(enteredModel || ''), ambiguous: false, matchCount: 0,
  };
  if (!token || !Array.isArray(records)) return empty;

  const brandKey = normalizeEvidenceBrand(options.brand);
  const matches = [];
  for (const record of records) {
    if (brandKey && normalizeEvidenceBrand(record?.brand) !== brandKey) continue;
    const matchedBy = exactMatchKind(record, token);
    if (matchedBy) matches.push({ record, matchedBy });
  }

  if (!matches.length) return empty;

  // Several entries describing the same canonical model are not ambiguous.
  const distinct = new Set(matches.map(({ record }) => `${normalizeEvidenceBrand(record.brand)}::${canonicalModelToken(record)}`));
  if (distinct.size > 1) {
    return { ...empty, ambiguous: true, matchCount: matches.length };
  }

  // A canonical-model hit outranks an exact-alias hit for the same record.
  const best = matches.find(({ matchedBy }) => matchedBy === 'canonical-model') || matches[0];
  return {
    record: best.record,
    matchedBy: best.matchedBy,
    canonicalModel: best.record.model || null,
    enteredModel: String(enteredModel || ''),
    ambiguous: false,
    matchCount: matches.length,
  };
}

/**
 * Data-integrity validation for the evidence database (Phase 7). Returns a list
 * of collision descriptors; an empty list means the exact-evidence space is
 * unambiguous. Surfaced by tests rather than thrown at startup, so one
 * malformed optional alias can never take the site down.
 */
export function findExactEvidenceCollisions(records = []) {
  const collisions = [];
  const canonicalOwners = new Map();
  const aliasOwners = new Map();

  for (const record of records) {
    const brand = normalizeEvidenceBrand(record?.brand);
    const canonical = canonicalModelToken(record);
    if (!canonical) {
      collisions.push({ type: 'missing-canonical-model', brand: record?.brand || null });
      continue;
    }
    const key = `${brand}::${canonical}`;
    if (canonicalOwners.has(key)) {
      collisions.push({ type: 'duplicate-canonical-model', token: canonical, brand: record?.brand || null });
    }
    canonicalOwners.set(key, record);
  }

  for (const record of records) {
    const brand = normalizeEvidenceBrand(record?.brand);
    const canonical = canonicalModelToken(record);
    const rawAliases = Array.isArray(record?.exactAliases) ? record.exactAliases : [];

    for (const rawAlias of rawAliases) {
      const token = compactModelToken(rawAlias);
      if (!token) {
        collisions.push({ type: 'empty-exact-alias', model: record?.model || null });
        continue;
      }
      if (token.length < MIN_EXACT_TOKEN_LENGTH) {
        collisions.push({ type: 'unsafe-short-exact-alias', token, model: record?.model || null });
        continue;
      }
      if (token === canonical) continue; // harmless restatement of the canonical model

      const owner = aliasOwners.get(token);
      if (owner && canonicalModelToken(owner) !== canonical) {
        collisions.push({ type: 'duplicate-exact-alias', token, models: [owner.model, record.model] });
      }
      aliasOwners.set(token, record);

      // An alias that is another record's canonical model would make one token
      // resolve to two different products.
      for (const [key, other] of canonicalOwners) {
        if (canonicalModelToken(other) !== token) continue;
        if (key === `${brand}::${canonical}`) continue;
        collisions.push({ type: 'exact-alias-shadows-canonical-model', token, models: [record.model, other.model] });
      }
    }
  }

  return collisions;
}
