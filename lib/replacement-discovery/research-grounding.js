import { RANK } from './evidence-normalizer.js';

/**
 * Research-quality diagnostic: how much of what the provider returned is backed by real Google Search grounding.
 * It is judged from evidence resolution (a fact counts only if a claimed source resolved against the grounding
 * metadata the API actually returned), never from the provider's own claims. It is NOT a classification and
 * never changes ranking or LKQ; it only explains how much to trust a result.
 */

export const GROUNDING_STATUS = Object.freeze({ GROUNDED: 'GROUNDED', PARTIALLY_GROUNDED: 'PARTIALLY_GROUNDED', UNGROUNDED: 'UNGROUNDED' });
const CONTEXT_BASIS = 'DISCOVERY_CONTEXT';

/** Material facts: identity plus the HARD and STRONG-HIGH rule keys. Informational detail (dimensions, labels) does not decide the status. */
export function materialKeys(profile) {
  const keys = new Set(['model', 'brand', 'canonicalModel']);
  for (const rule of profile.rules) {
    if (rule.key === 'physicalFit') continue;
    if (rule.bucket === 'HARD' || (rule.bucket === 'STRONG' && rule.weightClass === 'HIGH')) keys.add(rule.key);
  }
  return keys;
}

const isGroundedFact = (fact, byId) => ['KNOWN', 'INFERRED'].includes(fact.status) && fact.evidenceRefs.some((id) => (byId.get(id)?.sourceRank ?? RANK.UNSOURCED) <= RANK.GROUNDED);

function statusOf(material, grounded) {
  if (material === 0 || grounded === 0) return GROUNDING_STATUS.UNGROUNDED;
  return grounded === material ? GROUNDING_STATUS.GROUNDED : GROUNDING_STATUS.PARTIALLY_GROUNDED;
}

/** Grounding of one fact set (a candidate, or the original's researched facts). */
export function assessFactGrounding(facts, evidence, profile) {
  const byId = new Map(evidence.map((record) => [record.evidenceId, record]));
  const keys = materialKeys(profile);
  let material = 0, grounded = 0;
  for (const [key, fact] of Object.entries(facts)) {
    if (!keys.has(key) || fact.basis === CONTEXT_BASIS) continue;
    material += 1;
    if (isGroundedFact(fact, byId)) grounded += 1;
  }
  return { status: statusOf(material, grounded), material, grounded };
}

/** Job level. No usable grounding metadata at all is UNGROUNDED no matter what the model claims. */
export function assessJobGrounding({ sourceCount, factSets, evidence, profile }) {
  const parts = factSets.map((facts) => assessFactGrounding(facts, evidence, profile));
  const material = parts.reduce((sum, part) => sum + part.material, 0);
  const grounded = parts.reduce((sum, part) => sum + part.grounded, 0);
  const noSources = !(sourceCount > 0);
  return { status: noSources ? GROUNDING_STATUS.UNGROUNDED : statusOf(material, grounded), sourceCount: sourceCount || 0, materialFacts: material, groundedFacts: grounded };
}
