export const CONTRACT_VERSION = '1.0.0';
export const SCORING_VERSION = '1.0.0';

export const FACT_STATUS = Object.freeze(['KNOWN', 'INFERRED', 'ASSUMED', 'UNKNOWN', 'AMBIGUOUS']);
export const BUCKET = Object.freeze(['HARD', 'STRONG', 'SECONDARY']);
export const HARD_RULE = Object.freeze(['MINIMUM', 'MATCH']);
export const WEIGHT_CLASS = Object.freeze(['HIGH', 'NORMAL']);
export const ASSESSMENT = Object.freeze(['MATCH', 'BETTER', 'DIFFERENT', 'UNKNOWN', 'ASSUMED', 'UNVERIFIED', 'FAIL']);
export const CLASSIFICATION = Object.freeze(['ABOVE_LKQ', 'LKQ', 'CLOSE_MATCH', 'NOT_LKQ', 'UNCONFIRMED']);
export const CONFIDENCE = Object.freeze(['HIGH', 'MEDIUM', 'LOW']);
export const TIERS = Object.freeze(['VALUE', 'STANDARD', 'PREMIUM', 'UPPER_PREMIUM', 'LUXURY']);

export const fact = (status, value = null, evidenceRefs = []) => ({ status, value, evidenceRefs });
