import { rebuildInterpretation } from './interpret.js';

/**
 * Merges researched facts into the interpreted original without letting research
 * overwrite what the user said. The user's own KNOWN facts always win; research
 * can only fill gaps, corroborate, or surface a conflict.
 */

const union = (...lists) => [...new Set(lists.flat())];
const sameValue = (a, b) => (typeof a === 'number' && typeof b === 'number' ? a === b : String(a).toLowerCase() === String(b).toLowerCase());
const isResolved = (entry) => ['KNOWN', 'INFERRED'].includes(entry.status);

function mergeFact(existing, researched) {
  if (!existing || existing.status === 'UNKNOWN') return { fact: researched, warnings: [] };
  if (existing.status === 'AMBIGUOUS') return { fact: existing, warnings: [] };
  if (existing.status === 'ASSUMED') return { fact: isResolved(researched) ? researched : existing, warnings: [] };
  if (!isResolved(researched)) return { fact: existing, warnings: [] };
  const agrees = sameValue(existing.value, researched.value);
  const refs = union(existing.evidenceRefs, researched.evidenceRefs);
  if (existing.status === 'KNOWN') {
    return agrees ? { fact: { ...existing, evidenceRefs: refs, sourceIds: union(existing.sourceIds || [], researched.sourceIds || []) }, warnings: [] } : { fact: existing, warnings: [{ code: 'RESEARCH_CONFLICTS_WITH_INPUT' }] };
  }
  // existing is INFERRED (for example size read from a model token)
  if (agrees) return { fact: researched.status === 'KNOWN' ? { ...researched, evidenceRefs: refs } : { ...existing, evidenceRefs: refs }, warnings: [] };
  if (researched.status === 'KNOWN') {
    return { fact: { status: 'AMBIGUOUS', value: null, alternatives: [existing.value, researched.value], evidenceRefs: refs, basis: 'RESEARCH_CONFLICTS_WITH_INFERENCE' }, warnings: [{ code: 'RESEARCH_CONFLICTS_WITH_INFERENCE' }] };
  }
  return { fact: existing, warnings: [{ code: 'RESEARCH_CONFLICTS_WITH_INFERENCE' }] };
}

export function applyOriginalEnrichment(interpretation, enrichment) {
  const original = interpretation.normalizedOriginal;
  const facts = { ...original.facts };
  const warnings = [];
  for (const [key, researched] of Object.entries(enrichment.facts)) {
    const merged = mergeFact(facts[key], researched);
    facts[key] = merged.fact;
    warnings.push(...merged.warnings.map((warning) => ({ ...warning, key })));
  }
  const evidenceRefs = union(original.evidenceRefs, enrichment.evidence.map((item) => item.evidenceId));
  return { interpretation: rebuildInterpretation(interpretation, { ...original, facts, evidenceRefs }), warnings };
}

const sourceSummary = (record) => ({
  evidenceId: record.evidenceId, sourceName: record.sourceName, url: record.url, sourceClass: record.sourceClass,
  sourceType: record.sourceType, sourceRank: record.sourceRank, confidence: record.confidence,
});

/** Answers "what came from my query, what came from research, what is still uncertain?" */
export function describeOriginal({ interpretation, evidence = [] }) {
  const byId = new Map(evidence.map((item) => [item.evidenceId, item]));
  const original = interpretation.normalizedOriginal;
  const knownFromInput = [], researchSupported = [], inferredFromInput = [], corroboratedByResearch = [], assumptions = [], ambiguities = [];
  for (const [key, entry] of Object.entries(original.facts)) {
    const researchRefs = entry.evidenceRefs.filter((ref) => byId.has(ref));
    const fromInput = entry.evidenceRefs.includes('user-input');
    if (entry.status === 'AMBIGUOUS') ambiguities.push({ key, alternatives: entry.alternatives, basis: entry.basis || null });
    if (entry.status === 'ASSUMED') assumptions.push({ key, value: entry.value, basis: entry.basis || null, sources: researchRefs.map((ref) => sourceSummary(byId.get(ref))) });
    if (!isResolved(entry)) continue;
    if (fromInput && entry.status === 'KNOWN') {
      knownFromInput.push({ key, value: entry.value });
      if (researchRefs.length) corroboratedByResearch.push(key);
    } else if (researchRefs.length) {
      researchSupported.push({ key, value: entry.value, status: entry.status, basis: entry.basis || null, sources: researchRefs.map((ref) => sourceSummary(byId.get(ref))) });
    } else {
      inferredFromInput.push({ key, value: entry.value, basis: entry.basis || null });
    }
  }
  return {
    knownFromInput, inferredFromInput, researchSupported, corroboratedByResearch, assumptions, ambiguities,
    unknowns: interpretation.unknownImportantFacts.map(({ key, status }) => ({ key, status })),
  };
}
