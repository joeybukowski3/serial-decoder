import { readFileSync } from 'node:fs';

/**
 * Offline stand-ins for the live research.2 tests: an in-memory Redis with every Lua script the research stack uses, and a routed fetch
 * that answers Gemini and Serper from canned data and records what was asked. Nothing here touches the network or a real store.
 */

export const S1_ROWS = JSON.parse(readFileSync(new URL('../fixtures/itemassist-research/s1-rows.json', import.meta.url), 'utf8'));

export function createRedis({ failEval = false } = {}) {
  const store = new Map();
  const hashes = new Map();
  const ttls = new Map();
  const calls = [];
  return {
    store, hashes, ttls, calls,
    async get(key) { calls.push(['get', key]); return store.has(key) ? store.get(key) : null; },
    async set(key, value, options = {}) { calls.push(['set', key]); store.set(key, value); ttls.set(key, options.ex); return 'OK'; },
    async eval(script, keys, args) {
      calls.push(['eval', ...keys]);
      if (failEval) throw new Error('store down');
      const current = Number(store.get(keys[0]) || 0);
      if (script.includes('INCRBY')) {
        const [cost, limit, ttl] = args.map(Number);
        if (current + cost > limit) return [0, current];
        store.set(keys[0], current + cost); ttls.set(keys[0], ttl);
        return [1, current + cost];
      }
      if (script.includes('DECRBY')) { const next = Math.max(0, current - Number(args[0])); store.set(keys[0], next); return next; }
      if (script.includes('DECR')) { if (current <= 0) return 0; store.set(keys[0], current - 1); return current - 1; }
      if (current >= Number(args[0])) return [0, current];
      store.set(keys[0], current + 1); ttls.set(keys[0], Number(args[1]));
      return [1, current + 1];
    },
    pipeline() {
      const ops = [];
      const api = {
        hincrby(key, field, amount) { ops.push([key, field, amount]); return api; },
        expire() { return api; },
        async exec() { for (const [key, field, amount] of ops) { const hash = hashes.get(key) || {}; hash[field] = (hash[field] || 0) + amount; hashes.set(key, hash); } return []; },
      };
      return api;
    },
  };
}

export const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
export const geminiBody = (reply) => ({
  candidates: [{ content: { parts: [{ text: typeof reply === 'string' ? reply : JSON.stringify(reply) }] }, finishReason: 'STOP' }],
  usageMetadata: { promptTokenCount: 600, candidatesTokenCount: 700, thoughtsTokenCount: 10 },
});

/** The stored rows in the shape Serper really returns them. */
export const rawOrganic = (rows) => ({ organic: rows.map((row, index) => ({ position: index + 1, title: row.title, link: row.url, snippet: row.snippet, date: row.date || undefined })) });
export const rawShopping = (rows) => ({ shopping: rows.map((row, index) => ({ position: index + 1, title: row.title, source: row.seller, price: `$${row.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, link: 'https://www.google.com/search?q=x' })) });

/**
 * A fetch that routes by URL. `gemini` is a reply object or a function (call number) => Response; `history(query)` and `listings(query)` return
 * the stored rows for a query. Every call is recorded with its decoded body, never its headers.
 */
export function routedFetch({ gemini, history = () => [], listings = () => [], serperStatus = 200 } = {}) {
  const calls = { gemini: [], search: [], shopping: [], other: [] };
  const fetchImpl = async (url, init = {}) => {
    const href = String(url);
    const body = init.body ? JSON.parse(init.body) : {};
    if (href.includes('generativelanguage.googleapis.com')) {
      calls.gemini.push(body);
      if (typeof gemini === 'function') return gemini(calls.gemini.length);
      return jsonResponse(geminiBody(gemini));
    }
    if (href === 'https://google.serper.dev/search') {
      calls.search.push(body.q);
      return serperStatus === 200 ? jsonResponse(rawOrganic(history(body.q))) : jsonResponse({ message: 'x' }, serperStatus);
    }
    if (href === 'https://google.serper.dev/shopping') {
      calls.shopping.push(body.q);
      return serperStatus === 200 ? jsonResponse(rawShopping(listings(body.q))) : jsonResponse({ message: 'x' }, serperStatus);
    }
    calls.other.push(href);
    throw new Error(`unexpected fetch ${href}`);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}
