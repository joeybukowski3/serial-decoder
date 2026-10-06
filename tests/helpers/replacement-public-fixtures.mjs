import fs from 'node:fs';
import { createItemAssistReplacementHandler } from '../../api/itemassist-replacement.js';

/** Offline doubles shared by the replacement-public contract and API tests. Nothing here can reach the network. */

export const TOKEN = 'test-token-0123456789-abcdefghijkl';
export const ENV = Object.freeze({
  ITEMASSIST_REPLACEMENT_API_ENABLED: 'true',
  ITEMASSIST_REPLACEMENT_API_TOKEN: TOKEN,
  ITEMASSIST_REPLACEMENT_DAILY_SEARCH_LIMIT: '50',
  SERPER_API_KEY: 'fake-serper-key-for-tests-only',
});

const fixture = (name) => fs.readFileSync(new URL(`../fixtures/replacement-discovery/${name}`, import.meta.url), 'utf8');
export const result = (title, url, rank = 1) => ({ title, url, domain: new URL(url).hostname.replace(/^www\./, ''), snippet: title, providerRank: rank, sourceProvider: 'serper' });

export const q7fUrl = 'https://www.samsung.com/us/tvs/qled-tv/55-class-qled-tv-q7f-sku-qn55q7faafxza/';
export const q80cUrl = 'https://www.samsung.com/us/televisions-home-theater/tvs/qled-4k-tvs/q80c-55-inch-qled-4k-smart-tv-qn55q80cafxza/';
export const q80dUrl = 'https://www.samsung.com/us/tvs/qled-tv/q80d-55-inch-qled-4k-smart-tv-qn55q80dafxza/';
const lg = (model, slug) => `https://www.lg.com/us/refrigerators/lg-${model.toLowerCase()}-${slug}`;
export const lfH6200Url = lg('LF25H6200S', 'french-3-door-refrigerator');
export const lfG8330Url = lg('LF25G8330S', 'french-4-door-refrigerator');
export const lfZ6211Url = lg('LF25Z6211S', 'french-3-door-refrigerator');

export const q7fPage = fixture('samsung-q7f-page.html');
export const q80cPage = fixture('samsung-q80c-page.html');
const fridgePages = { [lfH6200Url]: fixture('lg-lf25h6200s-page.html'), [lfG8330Url]: fixture('lg-lf25g8330s-page.html'), [lfZ6211Url]: fixture('lg-lf25z6211s-page.html') };
export const syntheticTvPage = (model) => `<html><title>Samsung ${model} 55-inch QLED 4K Smart TV</title><h1>${model}</h1><p>Screen size: 55 inch class</p><p>Actual diagonal: 54.6 inches</p><p>Resolution: 3840 x 2160 4K</p><p>Display QLED</p><p>Native refresh rate: 120 Hz</p><p>Smart TV</p><p>HDR10</p></html>`;

export const fakeClock = () => { let now = 0; return { now: () => now, advance: (ms) => { now += ms; } }; };

/** Counting, fixture-backed provider doubles for the Samsung TV flow. */
export function tvProviders({ original = [result('Samsung QN55Q7FAAFXZA 55-inch QLED TV', q7fUrl)], candidates = [result('Samsung QN55Q80CAPXPA 55-inch QLED 4K TV', q80cUrl)],
  pages = { [q7fUrl]: q7fPage, [q80cUrl]: q80cPage }, tick = () => {} } = {}) {
  const calls = { search: [], fetch: [] };
  return {
    calls,
    deps: {
      search: async (request, options) => { calls.search.push({ ...request, options }); tick('search'); return request.purpose === 'original' ? original : candidates; },
      fetchPage: async (url, options) => { calls.fetch.push({ url, options }); tick('fetch'); return { status: 200, elapsedMs: 3, contentType: 'text/html', text: pages[url] ?? '' }; },
    },
  };
}

/** Counting, fixture-backed provider doubles for the LG refrigerator flow (two candidates, so alternatives can form). */
export function fridgeProviders({ candidates = [result('LG LF25G8330S French 4-door refrigerator', lfG8330Url), result('LG LF25Z6211S French 3-door refrigerator', lfZ6211Url)] } = {}) {
  const calls = { search: [], fetch: [] };
  return {
    calls,
    deps: {
      search: async (request) => {
        calls.search.push(request);
        if (request.purpose === 'original') return [result('LG LF25H6200S refrigerator', lfH6200Url)];
        return /builder spec sheet/.test(request.query) ? [] : candidates;
      },
      fetchPage: async (url) => { calls.fetch.push(url); return { status: 200, elapsedMs: 3, contentType: 'text/html', text: fridgePages[url] ?? '' }; },
    },
  };
}

/** In-memory Redis with a faithful emulation of the budget reservation script, plus switches to simulate an outage. */
export function createReplacementRedis({ initial = {}, failGet = false, failEval = false, failSet = false } = {}) {
  const store = new Map(Object.entries(initial));
  const calls = [];
  const ttls = new Map();
  return {
    store, calls, ttls,
    async get(key) { calls.push(['get', key]); if (failGet) throw new Error('store down'); return store.has(key) ? store.get(key) : null; },
    async set(key, value, options = {}) { calls.push(['set', key]); if (failSet) throw new Error('store down'); store.set(key, value); ttls.set(key, options.ex); return 'OK'; },
    async eval(_script, keys, args) {
      calls.push(['eval', ...keys]);
      if (failEval) throw new Error('store down');
      const current = Number(store.get(keys[0]) || 0);
      if (current >= Number(args[0])) return [0, current];
      store.set(keys[0], current + 1); ttls.set(keys[0], Number(args[1]));
      return [1, current + 1];
    },
  };
}

export function createRes() {
  return { statusCode: 200, body: null, headers: {}, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, setHeader(name, value) { this.headers[name] = value; } };
}

export const requestBody = (overrides = {}) => ({ category: 'television', brand: 'Samsung', model: 'QN55Q7F', notes: '', ...overrides });
/** `body: undefined` is a real case (an empty request), so presence is tested with `in`, not with a default. */
export const createReq = (options = {}) => ({
  method: options.method ?? 'POST',
  headers: options.headers ?? { authorization: `Bearer ${TOKEN}` },
  body: 'body' in options ? options.body : requestBody(),
});

export function createLogger() {
  const lines = [];
  return { lines, info: (line) => lines.push(String(line)), warn: (line) => lines.push(String(line)), error: (line) => lines.push(String(line)) };
}

/** Handler wired to counting providers and a fake store. Individual tests override only what they exercise. */
export function buildHandler({ env = ENV, redis = createReplacementRedis(), providers = tvProviders(), logger = createLogger(), ...rest } = {}) {
  const handler = createItemAssistReplacementHandler({
    env, logger, redisFactory: async () => redis, search: providers.deps.search, fetchPage: providers.deps.fetchPage, ...rest,
  });
  return { handler, redis, providers, logger };
}

export async function invoke(handler, request = createReq()) {
  const res = createRes();
  await handler(request, res);
  return res;
}

export const deepKeys = (value, keys = new Set()) => {
  if (Array.isArray(value)) value.forEach((item) => deepKeys(item, keys));
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) { keys.add(key); deepKeys(item, keys); }
  return keys;
};
