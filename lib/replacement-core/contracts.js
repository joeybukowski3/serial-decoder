import { ASSESSMENT, BUCKET, CLASSIFICATION, CONFIDENCE, CONTRACT_VERSION, FACT_STATUS, HARD_RULE, TIERS } from './enums.js';

/** @typedef {'KNOWN'|'INFERRED'|'ASSUMED'|'UNKNOWN'|'AMBIGUOUS'} FactStatus */
/** @typedef {{status: FactStatus, value: unknown, evidenceRefs: string[], alternatives?: unknown[], basis?: string}} Fact */
/** @typedef {{contractVersion: string, id: string, rawQuery: string|null, category: string, facts: Record<string, Fact>, evidenceRefs: string[]}} NormalizedProductIdentity */
/** @typedef {{key: string, label: string, bucket: 'HARD'|'STRONG'|'SECONDARY', comparator: string, hardRule?: 'MINIMUM'|'MATCH', weightClass?: 'HIGH'|'NORMAL', refinement?: string}} SpecificationRule */
/** @typedef {{contractVersion: string, profileVersion: string, profileId: string, category: string, rules: SpecificationRule[], refinementOrder: string[]}} SpecificationProfile */
/** @typedef {{contractVersion: string, evidenceId: string, sourceType: string, sourceName: string, url: string|null, sourceClass: string, observedAt: string|null, claim: object, confidence: string, firstParty: boolean, supports: string[]}} EvidenceRecord */
/** @typedef {{contractVersion: string, candidateId: string, identity: NormalizedProductIdentity, source: object, relationship: string, discoveryConfidence: string, evidenceRefs: string[], providerRank: number|null}} ReplacementCandidate */
/** @typedef {{key: string, label: string, bucket: string, original: Fact, replacement: Fact, assessment: string, reasonCode: string, maxPoints?: number, earnedPoints?: number}} SpecComparison */
/** @typedef {{contractVersion: string, profileVersion: string, scoringVersion: string, eligible: boolean|null, hardFailures: object[], comparisons: SpecComparison[], score: object, classification: string, confidence: string, reasonCodes: string[]}} CandidateDecision */
/** @typedef {{contractVersion: string, suggestionId: string, fieldKey: string, prompt: string, priority: number, reasonCode: string}} RefinementSuggestion */
/** @typedef {{contractVersion: string, resultId: string, input: string, normalizedOriginal: NormalizedProductIdentity, candidate: ReplacementCandidate, decision: CandidateDecision, comparisonRows: SpecComparison[], refinementSuggestions: RefinementSuggestion[]}} RecommendationResult */
/** @typedef {{contractVersion: string, observationId: string, candidateId: string, exactCandidateModel: string, seller: string, url: string, amount: number, currency: string, condition: string, stockStatus: string, observedAt: string, authorizedRetailer: boolean|null, sourceEvidenceId: string, priceType: 'REGULAR'|'SALE'}} PriceObservation */

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const string = (value) => typeof value === 'string' && value.trim().length > 0;
const refs = (value) => Array.isArray(value) && value.every(string);
const version = (value) => value === CONTRACT_VERSION;

export function validateFact(value) {
  const errors = [];
  if (!object(value)) return ['fact must be an object'];
  if (!FACT_STATUS.includes(value.status)) errors.push('invalid fact status');
  if (!refs(value.evidenceRefs)) errors.push('fact evidenceRefs must be string[]');
  if (['KNOWN', 'INFERRED', 'ASSUMED'].includes(value.status) && (value.value === null || value.value === undefined || value.value === '')) errors.push('resolved fact needs a value');
  if (['UNKNOWN', 'AMBIGUOUS'].includes(value.status) && value.value !== null) errors.push('unresolved fact value must be null');
  if (value.status === 'AMBIGUOUS' && (!Array.isArray(value.alternatives) || value.alternatives.length < 2)) errors.push('ambiguous fact needs alternatives');
  return errors;
}

export function validateIdentity(value) {
  const errors = [];
  if (!object(value)) return ['identity must be an object'];
  if (!version(value.contractVersion)) errors.push('invalid contractVersion');
  if (!string(value.id)) errors.push('identity id required');
  if (!string(value.category)) errors.push('category required');
  if (value.rawQuery !== null && typeof value.rawQuery !== 'string') errors.push('rawQuery must be string or null');
  if (!refs(value.evidenceRefs)) errors.push('identity evidenceRefs must be string[]');
  if (!object(value.facts)) errors.push('facts must be an object');
  else for (const [key, entry] of Object.entries(value.facts)) errors.push(...validateFact(entry).map((error) => `${key}: ${error}`));
  return errors;
}

export function validateRule(value) {
  const errors = [];
  if (!object(value)) return ['rule must be an object'];
  if (!string(value.key) || !string(value.label)) errors.push('rule key and label required');
  if (!BUCKET.includes(value.bucket)) errors.push('invalid bucket');
  if (!string(value.comparator)) errors.push('comparator required');
  if (value.bucket === 'HARD' && !HARD_RULE.includes(value.hardRule)) errors.push('hard rule needs MINIMUM or MATCH');
  if (value.bucket !== 'HARD' && value.hardRule != null) errors.push('non-hard rule cannot have hardRule');
  if (value.bucket === 'STRONG' && !['HIGH', 'NORMAL'].includes(value.weightClass)) errors.push('strong rule needs weightClass');
  return errors;
}

export function validateCandidate(value) {
  const errors = [];
  if (!object(value)) return ['candidate must be an object'];
  if (!version(value.contractVersion)) errors.push('invalid contractVersion');
  if (!string(value.candidateId)) errors.push('candidateId required');
  errors.push(...validateIdentity(value.identity).map((error) => `identity: ${error}`));
  if (!object(value.source) || !string(value.source.kind)) errors.push('candidate source required');
  if (!string(value.relationship)) errors.push('relationship required');
  if (!CONFIDENCE.includes(value.discoveryConfidence)) errors.push('invalid discoveryConfidence');
  if (!refs(value.evidenceRefs)) errors.push('candidate evidenceRefs must be string[]');
  if (value.providerRank !== null && (!Number.isInteger(value.providerRank) || value.providerRank < 1)) errors.push('invalid providerRank');
  return errors;
}

export function validateEvidence(value) {
  const errors = [];
  if (!object(value)) return ['evidence must be an object'];
  if (!version(value.contractVersion)) errors.push('invalid contractVersion');
  if (!string(value.evidenceId) || !string(value.sourceName)) errors.push('evidence ID/source required');
  if (!string(value.sourceType) || !['MANUFACTURER', 'RETAILER', 'PROVIDER', 'USER', 'OTHER'].includes(value.sourceClass)) errors.push('invalid evidence source');
  if (value.url !== null && (typeof value.url !== 'string' || !/^https:\/\//.test(value.url))) errors.push('invalid evidence URL');
  if (value.observedAt !== null && !Number.isFinite(Date.parse(value.observedAt))) errors.push('invalid observedAt');
  if (!object(value.claim) || !string(value.claim.fieldKey)) errors.push('evidence claim required');
  if (!CONFIDENCE.includes(value.confidence) || typeof value.firstParty !== 'boolean') errors.push('invalid evidence confidence/firstParty');
  if (!Array.isArray(value.supports) || !value.supports.every((item) => ['IDENTITY', 'SPECIFICATION', 'RELATIONSHIP', 'PRICING'].includes(item))) errors.push('invalid evidence supports');
  return errors;
}

export function validatePriceObservation(value) {
  const errors = [];
  if (!object(value)) return ['price observation must be an object'];
  if (!version(value.contractVersion)) errors.push('invalid contractVersion');
  for (const key of ['observationId', 'candidateId', 'exactCandidateModel', 'seller', 'sourceEvidenceId']) if (!string(value[key])) errors.push(`${key} required`);
  if (!string(value.url) || !/^https:\/\//.test(value.url)) errors.push('valid HTTPS URL required');
  if (!Number.isFinite(value.amount) || value.amount <= 0) errors.push('positive amount required');
  if (!/^[A-Z]{3}$/.test(value.currency || '')) errors.push('ISO currency required');
  if (!['NEW', 'OPEN_BOX', 'REFURBISHED', 'USED', 'UNKNOWN'].includes(value.condition)) errors.push('invalid condition');
  if (!['IN_STOCK', 'OUT_OF_STOCK', 'UNKNOWN'].includes(value.stockStatus)) errors.push('invalid stockStatus');
  if (!['REGULAR', 'SALE'].includes(value.priceType)) errors.push('invalid priceType');
  if (!Number.isFinite(Date.parse(value.observedAt))) errors.push('valid observedAt required');
  if (![true, false, null].includes(value.authorizedRetailer)) errors.push('invalid authorizedRetailer');
  return errors;
}

export function assessPriceObservation(value, evaluatedAt, candidateModel) {
  const errors = validatePriceObservation(value);
  if (!Number.isFinite(Date.parse(evaluatedAt))) errors.push('valid evaluatedAt required');
  if (errors.length) return { valid: false, stale: true, contributesToCurrentCost: false, exclusionReasons: errors, expiresAt: null };
  const expiresAt = new Date(Date.parse(value.observedAt) + (value.priceType === 'SALE' ? 24 : 72) * 3600000).toISOString();
  const stale = Date.parse(evaluatedAt) > Date.parse(expiresAt);
  const exclusionReasons = [];
  if (value.exactCandidateModel.toUpperCase() !== String(candidateModel || '').toUpperCase()) exclusionReasons.push('MODEL_MISMATCH');
  if (value.condition !== 'NEW') exclusionReasons.push('NOT_NEW');
  if (value.stockStatus !== 'IN_STOCK') exclusionReasons.push('NOT_IN_STOCK');
  if (stale) exclusionReasons.push('STALE');
  if (Date.parse(value.observedAt) > Date.parse(evaluatedAt)) exclusionReasons.push('FUTURE_OBSERVATION');
  return { valid: true, stale, contributesToCurrentCost: exclusionReasons.length === 0, exclusionReasons, expiresAt };
}

export function validateDecision(value) {
  if (!object(value)) return ['decision must be an object'];
  const errors = [];
  if (!version(value.contractVersion) || !string(value.profileVersion) || !string(value.scoringVersion)) errors.push('decision versions required');
  if (![true, false, null].includes(value.eligible)) errors.push('invalid eligible');
  if (!CLASSIFICATION.includes(value.classification) || !CONFIDENCE.includes(value.confidence)) errors.push('invalid classification/confidence');
  if (!Array.isArray(value.comparisons) || !value.comparisons.every((row) => ASSESSMENT.includes(row.assessment))) errors.push('invalid comparisons');
  if (!Array.isArray(value.hardFailures) || !Array.isArray(value.reasonCodes)) errors.push('decision reasons required');
  return errors;
}

export function validateRefinementSuggestion(value) {
  if (!object(value)) return ['suggestion must be an object'];
  return version(value.contractVersion) && string(value.suggestionId) && string(value.fieldKey) && string(value.prompt) && Number.isFinite(value.priority) && string(value.reasonCode) ? [] : ['invalid refinement suggestion'];
}

export function validateRecommendationResult(value) {
  if (!object(value)) return ['result must be an object'];
  const errors = [];
  if (!version(value.contractVersion) || !string(value.resultId) || typeof value.input !== 'string') errors.push('result identity required');
  errors.push(...validateIdentity(value.normalizedOriginal).map((error) => `original: ${error}`));
  errors.push(...validateCandidate(value.candidate).map((error) => `candidate: ${error}`));
  errors.push(...validateDecision(value.decision).map((error) => `decision: ${error}`));
  if (!Array.isArray(value.refinementSuggestions) || value.refinementSuggestions.some((item) => validateRefinementSuggestion(item).length)) errors.push('invalid refinementSuggestions');
  if (!Array.isArray(value.comparisonRows) || value.comparisonRows.some((row) => !ASSESSMENT.includes(row.assessment))) errors.push('invalid comparisonRows');
  return errors;
}

export function assertValid(errors, label) {
  if (errors.length) throw new TypeError(`${label}: ${errors.join('; ')}`);
}

export { TIERS };
