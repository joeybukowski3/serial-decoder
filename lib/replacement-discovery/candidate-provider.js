import { normalizeCandidateDraft } from './normalize-adapter.js';

export const DEFAULT_DISCOVERY_LIMIT = 6;

/** Provider-neutral contract: discoverCandidates({ original, hints, limit }) -> drafts[]. */
export async function discoverCandidatePool({ candidateProvider, original, hints, limit = DEFAULT_DISCOVERY_LIMIT }) {
  if (!candidateProvider || typeof candidateProvider.discoverCandidates !== 'function') throw new TypeError('candidateProvider.discoverCandidates required');
  if (!Number.isInteger(limit) || limit < 1 || limit > DEFAULT_DISCOVERY_LIMIT) throw new RangeError('discovery limit must be 1 through 6');
  const drafts = await candidateProvider.discoverCandidates({ original, hints, limit });
  if (!Array.isArray(drafts)) throw new TypeError('candidate provider must return an array');
  const candidates = [], rejected = [], seen = new Set();
  for (const draft of drafts.slice(0, limit)) {
    try {
      const candidate = normalizeCandidateDraft(draft);
      if (seen.has(candidate.candidateId)) {
        rejected.push({ candidateId: candidate.candidateId, reasonCode: 'DUPLICATE_CANDIDATE_ID' });
        continue;
      }
      seen.add(candidate.candidateId);
      candidates.push(candidate);
    } catch (error) {
      rejected.push({ candidateId: draft?.candidateId || null, reasonCode: 'INVALID_CANDIDATE_DRAFT', detail: error.message });
    }
  }
  return { candidates, rejected, receivedCount: drafts.length };
}
