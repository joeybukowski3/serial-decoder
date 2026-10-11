/** Deterministic in-memory provider for tests and local examples; no I/O. */
export function createFixtureProvider(candidateDrafts) {
  if (!Array.isArray(candidateDrafts)) throw new TypeError('candidateDrafts must be an array');
  const snapshot = structuredClone(candidateDrafts);
  return Object.freeze({
    async discoverCandidates({ limit }) {
      return structuredClone(snapshot.slice(0, limit));
    },
  });
}
