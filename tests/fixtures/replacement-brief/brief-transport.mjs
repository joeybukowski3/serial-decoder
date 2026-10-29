/**
 * Offline stand-in for the single grounded transport call the research brief makes. `reply` is the parsed JSON the model would
 * return ({ original, candidates }), an Error to throw, or a function. No network. All product data in the fixtures that feed it
 * is illustrative mock data, not verified specs.
 */
export function createBriefTransport({ reply, grounding }) {
  const calls = [];
  const transport = async (call) => {
    calls.push(call);
    const value = typeof reply === 'function' ? await reply(call) : reply;
    if (value instanceof Error) throw value;
    return { parsed: structuredClone(value), grounding };
  };
  transport.calls = calls;
  return transport;
}

export const NOW = '2026-10-19T12:00:00.000Z';
