import { CONTRACT_VERSION, fact } from '../replacement-core/enums.js';
import { getFact, present } from '../replacement-core/normalize-values.js';
import { stableId } from './normalize-adapter.js';
import { RANK, buildClaimEvidence, mergeEvidence, modelRelation } from './evidence-normalizer.js';
import { resolveRelationship } from './relationship.js';
import { RESEARCH_SCHEMA_VERSION, modelKey } from './research-schema.js';
import { nominalClassOf } from './screen-size-class.js';

/**
 * Raw validated provider claims -> Phase 1 facts, EvidenceRecords and candidate
 * drafts. Fact status always comes from evidence quality, never from provider
 * assertion, and provider rank/LKQ/price fields never get this far.
 */

const CONFIDENCE_ORDER = Object.freeze({ HIGH: 0, MEDIUM: 1, LOW: 2 });
const HIGH_CONFIDENCE_KNOWN_SHARE = 0.6;
const MIN_SPEC_FACTS_FOR_HIGH = 3;
const lower = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : null);
const brandKey = (value) => lower(value)?.replace(/\s+/g, '-') || '';
const minConfidence = (a, b) => (b && CONFIDENCE_ORDER[b] > CONFIDENCE_ORDER[a] ? b : a);

const valueOf = (identity, key) => {
  const entry = getFact(identity, key);
  return present(entry) ? entry.value : null;
};

function toFact(assessment, value) {
  return { status: assessment.status, value, evidenceRefs: assessment.evidenceIds, basis: assessment.basis };
}

/** Tier hierarchy: evidenced model-line tier > brand/category baseline (kept by replacement-core) > unknown. Tier is never KNOWN and never derived from price. */
function researchedTier(tier, context) {
  if (!tier) return { fact: null, evidence: [], warnings: [] };
  if (tier.basis === 'PRICE') return { fact: null, evidence: [], warnings: [{ code: 'TIER_FROM_PRICE_REJECTED' }] };
  if (tier.basis !== 'MODEL_LINE') return { fact: null, evidence: [], warnings: [] };
  const assessment = buildClaimEvidence({ fieldKey: 'tier', value: tier.value, sources: tier.sources, subjectModel: tier.subjectModel, ...context });
  if (assessment.bestRank > RANK.GROUNDED) return { fact: null, evidence: [], warnings: [{ code: 'TIER_UNSOURCED_REJECTED' }] };
  return {
    fact: { status: 'INFERRED', value: tier.value, evidenceRefs: assessment.evidenceIds, basis: 'MODEL_LINE_EVIDENCE' },
    evidence: assessment.records,
    warnings: [],
  };
}

const capInferred = (status) => (status === 'KNOWN' ? 'INFERRED' : status);

/**
 * TV size semantics. `screenSizeIn` is the NOMINAL marketed class; a fractional value (54.6) is a measured diagonal and
 * is kept separately as `measuredDiagonalIn`. A nominal derived from a measurement is only ever an inference (capped at
 * INFERRED) and is left unresolved when the measurement matches no single marketed class. Measured never replaces nominal.
 */
function applyTelevisionSize(facts) {
  const warnings = [];
  const stated = facts.screenSizeIn;
  const measured = stated && !Number.isInteger(stated.value) ? stated : !stated ? facts.measuredDiagonalIn : null;
  if (!measured) return warnings;
  if (stated && measured === stated) facts.measuredDiagonalIn = facts.measuredDiagonalIn || { ...stated };
  const nominal = nominalClassOf(measured.value);
  if (nominal === null) {
    if (stated) delete facts.screenSizeIn;
    return [{ code: 'NOMINAL_SIZE_UNRESOLVED', measuredDiagonalIn: measured.value }];
  }
  facts.screenSizeIn = { ...measured, value: nominal, status: capInferred(measured.status), basis: 'NOMINAL_CLASS_FROM_MEASURED' };
  return [{ code: 'MEASURED_DIAGONAL_NORMALIZED', measuredDiagonalIn: measured.value, nominalScreenSizeIn: nominal }];
}

function claimFacts(claims, context, category, supports = ['SPECIFICATION']) {
  const facts = {}, evidence = [];
  for (const [key, claim] of Object.entries(claims)) {
    const assessment = buildClaimEvidence({ fieldKey: key, value: claim.value, supports, sources: claim.sources, subjectModel: claim.subjectModel, ...context(claim) });
    facts[key] = toFact(assessment, claim.value);
    evidence.push(...assessment.records);
  }
  if (facts.configurationFloor && !facts.layout) facts.layout = facts.configurationFloor;
  const warnings = category === 'television' ? applyTelevisionSize(facts) : [];
  return { facts, evidence, warnings };
}

function canonicalModelFact(validated, userModel, context) {
  const { canonicalModel, possibleModels } = validated;
  const compatible = (model) => !userModel || ['EXACT', 'VARIANT'].includes(modelRelation(model, userModel));
  if (canonicalModel.value && !compatible(canonicalModel.value)) return { fact: null, evidence: [], warnings: [{ code: 'CANONICAL_MODEL_MISMATCH' }] };
  if (canonicalModel.value) {
    const assessment = buildClaimEvidence({
      fieldKey: 'canonicalModel', value: canonicalModel.value, supports: ['IDENTITY'], sources: canonicalModel.sources,
      subjectModel: canonicalModel.value, expectedModel: canonicalModel.value, brand: context.brand, grounding: context.grounding, now: context.now,
    });
    const sameAsInput = modelKey(userModel) === modelKey(canonicalModel.value);
    const status = sameAsInput || assessment.status !== 'KNOWN' ? assessment.status : 'INFERRED';
    return { fact: { ...toFact(assessment, canonicalModel.value), status, ...(sameAsInput ? {} : { basis: 'CANONICAL_MODEL_INFERENCE' }) }, evidence: assessment.records, warnings: [] };
  }
  const alternatives = possibleModels.filter(compatible);
  if (alternatives.length >= 2) return { fact: { status: 'AMBIGUOUS', value: null, alternatives, evidenceRefs: [], basis: 'MULTIPLE_MODELS_MATCH' }, evidence: [], warnings: [] };
  return { fact: null, evidence: [], warnings: [] };
}

/** Job A: facts that enrich the ORIGINAL, to be merged by `applyOriginalEnrichment`. */
export function normalizeOriginalResearch({ validated, original, grounding, now }) {
  const userModel = valueOf(original, 'model');
  const brand = valueOf(original, 'brand');
  // Original tokens are often incomplete (QN55Q80); a page for a longer model only vouches for it as an inference.
  const context = (claim) => ({
    expectedModel: userModel, brand, grounding, now,
    allowVariant: Boolean(userModel && claim?.subjectModel && modelKey(userModel).length >= modelKey(claim.subjectModel).length),
  });
  const claims = claimFacts(validated.facts, context, original.category);
  const canonical = canonicalModelFact(validated, userModel, { brand, grounding, now });
  const tier = researchedTier(validated.tier, context(validated.tier));
  const facts = {
    ...claims.facts,
    ...(canonical.fact ? { canonicalModel: canonical.fact } : {}),
    ...(tier.fact ? { tier: tier.fact } : {}),
  };
  return {
    facts,
    evidence: mergeEvidence(claims.evidence, canonical.evidence, tier.evidence),
    warnings: [...validated.warnings, ...claims.warnings, ...canonical.warnings, ...tier.warnings, ...(validated.ignored.length ? [{ code: 'UNSUPPORTED_FIELDS_IGNORED', fields: validated.ignored }] : [])],
  };
}

/** `specFacts` are researched specifications only: identity facts are always as strong as the identity source and must not pad the share. */
function deriveDiscoveryConfidence({ candidate, identity, specFacts }) {
  if (!candidate.model) return 'LOW';
  const statuses = Object.values(specFacts).map((entry) => entry.status);
  const knownShare = statuses.length ? statuses.filter((status) => status === 'KNOWN').length / statuses.length : 0;
  let confidence = 'LOW';
  const wellSourced = statuses.length >= MIN_SPEC_FACTS_FOR_HIGH && knownShare >= HIGH_CONFIDENCE_KNOWN_SHARE;
  if (identity.bestRank <= RANK.RETAILER && candidate.availability === 'CURRENT' && wellSourced) confidence = 'HIGH';
  else if (identity.bestRank <= RANK.GROUNDED) confidence = 'MEDIUM';
  if (candidate.availability === 'UNKNOWN') confidence = minConfidence(confidence, 'MEDIUM');
  return minConfidence(confidence, candidate.providerConfidence);
}

function buildDraft({ candidate, original, category, grounding, now }) {
  const originalContext = { model: valueOf(original, 'model'), brand: valueOf(original, 'brand'), series: valueOf(original, 'series') };
  const subject = candidate.model || null;
  const context = () => ({ expectedModel: subject, brand: candidate.brand, grounding, now, allowVariant: true });
  const identity = buildClaimEvidence({ fieldKey: 'model', value: subject || candidate.baselineLabel, supports: ['IDENTITY'], sources: candidate.identitySources, subjectModel: subject, ...context() });
  const claims = claimFacts(candidate.facts, context, category);
  const tier = researchedTier(candidate.tier, context());
  const relationshipEvidence = buildClaimEvidence({
    fieldKey: 'relationship', value: candidate.relationship, supports: ['RELATIONSHIP'], sources: candidate.relationshipSources,
    subjectModel: subject, expectedModel: subject, brand: candidate.brand, grounding, now,
  });
  const relationship = resolveRelationship({
    claimed: candidate.relationship,
    original: originalContext,
    candidate: { brand: candidate.brand, model: subject, series: candidate.facts.series?.value || null, relatedModel: candidate.relatedModel },
    evidence: relationshipEvidence,
  });
  const facts = {
    // Category is constrained by the discovery job itself (a wrong-category candidate is rejected at the schema), so it is a
    // context-derived fact, not a researched claim: no evidence reference may imply the provider established it.
    category: { ...fact('KNOWN', category, []), basis: 'DISCOVERY_CONTEXT' },
    brand: toFact(identity, candidate.brand),
    ...(subject ? { model: toFact(identity, subject) } : {}),
    ...claims.facts,
    ...(tier.fact ? { tier: tier.fact } : {}),
  };
  const evidence = mergeEvidence(identity.records, claims.evidence, tier.evidence, relationshipEvidence.records);
  const candidateId = stableId('grounded', [category, brandKey(candidate.brand), subject ? modelKey(subject) : `baseline:${lower(candidate.baselineLabel)}`].join('|'));
  const warnings = [
    ...tier.warnings,
    ...claims.warnings,
    ...(candidate.policyFieldsIgnored.length ? [{ code: 'PROVIDER_POLICY_FIELDS_IGNORED', fields: candidate.policyFieldsIgnored }] : []),
    ...(candidate.priceFieldsDiscarded ? [{ code: 'INCIDENTAL_PRICE_DISCARDED' }] : []),
    ...(candidate.unsupportedFields.length ? [{ code: 'UNSUPPORTED_FIELDS_IGNORED', fields: candidate.unsupportedFields }] : []),
    ...(relationship.downgradedFrom === 'DIRECT_SUCCESSOR' ? [{ code: 'UNSUPPORTED_SUCCESSOR_CLAIM_DOWNGRADED', from: 'DIRECT_SUCCESSOR', to: relationship.relationship }] : []),
  ].map((warning) => ({ ...warning, candidateId }));
  return {
    draft: {
      candidateId,
      category,
      facts,
      source: {
        kind: 'GROUNDED_RESEARCH',
        name: 'Grounded product research',
        schemaVersion: RESEARCH_SCHEMA_VERSION,
        availability: candidate.availability,
        baseline: !subject,
        ...(subject ? {} : { baselineLabel: candidate.baselineLabel }),
      },
      relationship: relationship.relationship,
      discoveryConfidence: deriveDiscoveryConfidence({ candidate, identity, specFacts: { ...claims.facts, ...(tier.fact ? { tier: tier.fact } : {}) } }),
      evidenceRefs: evidence.map((item) => item.evidenceId),
      providerRank: candidate.providerRank,
    },
    evidence,
    warnings,
  };
}

/** Job B: validated candidate entries -> drafts accepted by `normalizeCandidateDraft`. Duplicates are dropped, not merged. */
export function normalizeCandidateResearch({ validated, original, grounding, now, limit }) {
  const category = original.category;
  const drafts = [], rejected = [...validated.rejected], warnings = [...validated.warnings];
  let evidence = [];
  const seen = new Set();
  for (const candidate of validated.candidates) {
    const built = buildDraft({ candidate, original, category, grounding, now });
    if (seen.has(built.draft.candidateId)) { rejected.push({ candidateId: built.draft.candidateId, reasonCode: 'DUPLICATE_MODEL' }); continue; }
    seen.add(built.draft.candidateId);
    if (drafts.length >= limit) { rejected.push({ candidateId: built.draft.candidateId, reasonCode: 'POOL_LIMIT_APPLIED' }); continue; }
    drafts.push(built.draft);
    evidence = mergeEvidence(evidence, built.evidence);
    warnings.push(...built.warnings);
  }
  return { drafts, evidence, rejected, warnings };
}
