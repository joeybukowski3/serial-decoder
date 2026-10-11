import { classifySmartLookupQuery, normalizeWhitespace } from '../smart-lookup/normalize.js';
import { CONTRACT_VERSION, fact } from '../replacement-core/enums.js';
import { assertValid, validateCandidate, validateIdentity } from '../replacement-core/contracts.js';

export function recognizeSearch(text) {
  return classifySmartLookupQuery(normalizeWhitespace(text));
}

export function stableId(prefix, text) {
  let hash = 2166136261;
  for (const character of text) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `${prefix}-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function setFact(facts, key, status, value = null, basis = null, evidenceRefs = ['user-input']) {
  facts[key] = { ...fact(status, value, status === 'UNKNOWN' ? [] : evidenceRefs), ...(basis ? { basis } : {}) };
}

/** Accepts a complete Phase 1 candidate or an explicit fact-bearing draft. */
export function normalizeCandidateDraft(draft) {
  if (!draft || typeof draft !== 'object') throw new TypeError('candidate draft must be an object');
  if (draft.identity) {
    assertValid(validateCandidate(draft), 'candidate');
    return structuredClone(draft);
  }
  const category = draft.category;
  const facts = {};
  for (const [key, entry] of Object.entries(draft.facts || {})) {
    if (!entry || !entry.status) throw new TypeError(`candidate ${key} needs explicit fact status`);
    facts[key] = structuredClone(entry);
  }
  const identity = {
    contractVersion: CONTRACT_VERSION,
    id: draft.identityId || stableId('candidate-identity', draft.candidateId || ''),
    rawQuery: null,
    category,
    facts,
    evidenceRefs: draft.evidenceRefs || [],
  };
  assertValid(validateIdentity(identity), 'candidate identity');
  const candidate = {
    contractVersion: CONTRACT_VERSION,
    candidateId: draft.candidateId,
    identity,
    source: draft.source,
    relationship: draft.relationship || 'UNKNOWN',
    discoveryConfidence: draft.discoveryConfidence || 'LOW',
    evidenceRefs: draft.evidenceRefs || [],
    providerRank: draft.providerRank ?? null,
  };
  assertValid(validateCandidate(candidate), 'candidate');
  return candidate;
}
