/**
 * Offline stand-in for a grounded-search transport. Each job (`original`,
 * `candidates`) maps to a payload, an Error to throw, or a function. No network.
 * All product data in these fixtures is illustrative mock data, not verified specs.
 */
export function makeGrounding(domains) {
  return {
    sources: domains.map((domain) => ({ title: domain, domain, uri: `https://vertexaisearch.cloud.google.com/grounding-api-redirect/${domain.replace(/\W/g, '-')}` })),
    searchQueryCount: 1,
  };
}

export function createMockTransport({ original = null, candidates = null, grounding }) {
  const calls = [];
  const transport = async ({ job, prompt, stage, deadline }) => {
    calls.push({ job, prompt, stage, hasDeadline: Boolean(deadline) });
    const response = job === 'original' ? original : candidates;
    const value = typeof response === 'function' ? await response({ job, prompt, deadline }) : response;
    if (value instanceof Error) throw value;
    if (value === null || value === undefined) throw Object.assign(new Error('no mock configured'), { code: 'PROVIDER_EMPTY' });
    return { parsed: structuredClone(value), grounding };
  };
  transport.calls = calls;
  return transport;
}

export const providerError = (code) => Object.assign(new Error(code), { code });
