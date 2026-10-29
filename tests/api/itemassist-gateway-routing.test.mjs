import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import shippedEntry, { createItemAssistReplacementHandler } from '../../api/itemassist-replacement.js';
import { RESEARCH_PATH, createItemAssistGateway, isResearchRequest, requestPathname } from '../../lib/itemassist-gateway/gateway.js';
import { createItemAssistResearchHandler } from '../../lib/itemassist-research/handler.js';
import { FIXTURE_MODE_ENV } from '../../lib/itemassist-research/fixture.js';

// OFFLINE ONLY. Two ItemAssist routes share one Vercel function (Hobby allows 12). These tests prove that the Research handler is chosen by the
// request pathname and nothing else, that each handler keeps its own flag, token and contract, and that the deployment stays within the limit.
// Every provider, store and engine dependency below is a trap: a request that reaches one fails the test.
const TOKEN = 'test-token-0123456789-abcdefghijkl';
const V1_PATH = '/api/itemassist-replacement';
const V1_BODY = Object.freeze({ category: 'television', brand: 'Samsung', model: 'QN55Q80C' });
const bearer = (token = TOKEN) => ({ authorization: `Bearer ${token}` });
const quiet = { info() {} };
const TRAP = async () => assert.fail('a provider, store or engine must not be reached');
const createReq = ({ method = 'POST', url, headers = bearer(), body } = {}) => ({ method, url, headers, body });
const createRes = () => ({ statusCode: 200, body: null, headers: {}, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, setHeader(name, value) { this.headers[name] = value; } });
async function run(handler, request) { const res = createRes(); await handler(request, res); return res; }
const isResearchShape = (body) => body?.kind === 'ITEMASSIST_RESEARCH' && body.contractVersion === 'research.1';
const isV1Shape = (body) => body?.contractVersion === '1' && !('kind' in body);

/** The real two handlers behind the real gateway, with every dependency that could spend money or touch a store trapped. */
function gatewayFor(env) {
  const replacement = createItemAssistReplacementHandler({ env, logger: quiet, redisFactory: TRAP, search: TRAP, recommend: TRAP, requestIdFactory: () => 'req-v1' });
  const research = createItemAssistResearchHandler({ env, logger: quiet, redisFactory: TRAP, getAnswer: TRAP, requestIdFactory: () => 'req-rs' });
  return createItemAssistGateway({ replacement, loadResearch: async () => research });
}
function spies() {
  const seen = { v1: 0, research: 0, loads: 0 };
  const replacement = async (_req, res) => { seen.v1 += 1; res.status(200).json({ handler: 'v1' }); };
  const research = async (_req, res) => { seen.research += 1; res.status(200).json({ handler: 'research' }); };
  return { seen, gateway: createItemAssistGateway({ replacement, loadResearch: async () => { seen.loads += 1; return research; } }) };
}

// ---- how the path is read --------------------------------------------------------------------------------------------------------

test('requestPathname reads the pathname exactly as received: no query, no fragment, no URL parsing, no normalisation', () => {
  assert.equal(requestPathname({ url: '/api/itemassist-research' }), RESEARCH_PATH);
  assert.equal(requestPathname({ url: '/api/itemassist-research?a=1&b=/api/x' }), RESEARCH_PATH);
  assert.equal(requestPathname({ url: '/api/itemassist-research#frag' }), RESEARCH_PATH);
  assert.equal(requestPathname({ url: '//api/itemassist-research' }), '//api/itemassist-research', 'a leading // is not treated as a host');
  assert.equal(requestPathname({ url: '/API/ITEMASSIST-RESEARCH' }), '/API/ITEMASSIST-RESEARCH');
  for (const url of ['http://host/api/itemassist-research', 'api/itemassist-research', '', undefined, null, 42, {}, ['/api/itemassist-research']]) {
    assert.equal(requestPathname({ url }), '', String(url));
  }
  assert.equal(requestPathname(undefined), '');
  assert.equal(requestPathname(null), '');
  assert.equal(isResearchRequest({ url: RESEARCH_PATH }), true);
  assert.equal(isResearchRequest({ url: V1_PATH }), false);
});

// ---- routing ---------------------------------------------------------------------------------------------------------------------

test('a v1 request goes to v1 and only v1; a Research request goes to Research and only Research', async () => {
  const { seen, gateway } = spies();
  assert.equal((await run(gateway, createReq({ url: V1_PATH }))).body.handler, 'v1');
  assert.deepEqual(seen, { v1: 1, research: 0, loads: 0 }, 'the Research module is not even loaded for v1');
  assert.equal((await run(gateway, createReq({ url: RESEARCH_PATH }))).body.handler, 'research');
  assert.equal((await run(gateway, createReq({ url: `${RESEARCH_PATH}?x=1` }))).body.handler, 'research');
  assert.deepEqual(seen, { v1: 1, research: 2, loads: 2 });
});

test('a request with no url (a direct call, as the existing v1 tests make) is v1, exactly as before', async () => {
  const { seen, gateway } = spies();
  await run(gateway, createReq({ url: undefined }));
  assert.deepEqual(seen, { v1: 1, research: 0, loads: 0 });
});

test('nothing the caller sends can select Research: not a header, cookie, query string, body field or forwarded-path claim', async () => {
  const claims = [RESEARCH_PATH, 'research', 'itemassist-research', '1', 'true'];
  for (const claim of claims) {
    const { seen, gateway } = spies();
    const headers = {
      ...bearer(), 'x-route': claim, 'x-itemassist-route': claim, 'x-original-url': claim, 'x-rewrite-url': claim, 'x-forwarded-uri': claim, 'x-forwarded-path': claim,
      'x-matched-path': claim, 'x-invoke-path': claim, 'x-now-route-matches': claim, 'x-vercel-rewrite': claim, 'x-itemassist-research-mode': 'fixture', referer: `https://x${claim}`, cookie: `route=${claim}`,
    };
    for (const url of [V1_PATH, `${V1_PATH}?route=research`, `${V1_PATH}?path=${encodeURIComponent(RESEARCH_PATH)}`, `${V1_PATH}?${RESEARCH_PATH}`, `${V1_PATH}#${RESEARCH_PATH}`]) {
      await run(gateway, createReq({ url, headers, body: { route: 'research', handler: 'research', path: RESEARCH_PATH, query: 'LG C3', ...V1_BODY } }));
    }
    assert.deepEqual(seen, { v1: 5, research: 0, loads: 0 }, claim);
  }
});

test('unknown and look-alike paths never reach Research (they get v1, the only thing this function has ever served besides Research)', async () => {
  const lookalikes = [`${RESEARCH_PATH}/`, `${RESEARCH_PATH}/extra`, `${RESEARCH_PATH}x`, `${RESEARCH_PATH}.js`, `${RESEARCH_PATH}%2f`, '/api/itemassist%2Dresearch', `${RESEARCH_PATH};x=1`,
    `${RESEARCH_PATH}\\`, ` ${RESEARCH_PATH}`, `${RESEARCH_PATH} `, `//api/itemassist-research`, `/x${RESEARCH_PATH}`, '/API/ITEMASSIST-RESEARCH', '/Api/Itemassist-Research',
    `http://example.com${RESEARCH_PATH}`, 'api/itemassist-research', '/api/itemassist', '/api', '/', '/api/unknown', '/api/age-lookup', '/api/smart-query-interpret', '*'];
  for (const url of lookalikes) {
    const { seen, gateway } = spies();
    await run(gateway, createReq({ url }));
    assert.deepEqual(seen, { v1: 1, research: 0, loads: 0 }, JSON.stringify(url));
  }
});

// ---- independence of the two handlers (real handlers, trapped dependencies) ------------------------------------------------------------

test('a disabled Research does not affect v1: v1 still runs, authenticates and answers in its own contract', async () => {
  const gateway = gatewayFor({ ITEMASSIST_REPLACEMENT_API_ENABLED: 'true', ITEMASSIST_REPLACEMENT_API_TOKEN: TOKEN });
  const research = await run(gateway, createReq({ url: RESEARCH_PATH, body: { query: 'LG C3 OLED TV' } }));
  assert.equal(research.statusCode, 503);
  assert.equal(research.body.errorCode, 'API_DISABLED');
  assert.equal(isResearchShape(research.body), true);

  const v1 = await run(gateway, createReq({ url: V1_PATH, body: V1_BODY }));
  assert.equal(isV1Shape(v1.body), true);
  assert.notEqual(v1.body.errorCode, 'API_DISABLED', 'v1 is enabled and was not switched off by Research being disabled');
  assert.equal(v1.body.errorCode, 'PROVIDER_UNAVAILABLE', 'v1 got as far as its own provider check, which is not configured, so no provider was reachable');
  const unauth = await run(gateway, createReq({ url: V1_PATH, headers: {}, body: V1_BODY }));
  assert.equal(unauth.statusCode, 401);
});

test('a disabled v1 does not affect Research: Research still answers (fixture) in its own contract and v1 stays off', async () => {
  const gateway = gatewayFor({ ITEMASSIST_RESEARCH_ENABLED: 'true', ITEMASSIST_REPLACEMENT_API_TOKEN: TOKEN, [FIXTURE_MODE_ENV]: 'preview', VERCEL_ENV: 'preview' });
  const v1 = await run(gateway, createReq({ url: V1_PATH, body: V1_BODY }));
  assert.equal(v1.statusCode, 503);
  assert.equal(v1.body.errorCode, 'API_DISABLED');
  assert.equal(isV1Shape(v1.body), true);

  const research = await run(gateway, createReq({ url: RESEARCH_PATH, body: { query: 'LG C3 OLED TV' } }));
  assert.equal(research.statusCode, 200);
  assert.equal(isResearchShape(research.body), true);
  assert.equal(research.body.status, 'OK');
  assert.equal(research.body.meta.fixture, true);
  assert.equal(research.headers['X-ItemAssist-Research-Mode'], 'fixture');
});

test('the two flags are independent in every combination, and each path reports only its own flag', async () => {
  for (const [v1On, researchOn] of [[false, false], [true, false], [false, true], [true, true]]) {
    const env = { ITEMASSIST_REPLACEMENT_API_TOKEN: TOKEN, VERCEL_ENV: 'preview', [FIXTURE_MODE_ENV]: 'preview',
      ...(v1On ? { ITEMASSIST_REPLACEMENT_API_ENABLED: 'true' } : {}), ...(researchOn ? { ITEMASSIST_RESEARCH_ENABLED: 'true' } : {}) };
    const gateway = gatewayFor(env);
    const research = await run(gateway, createReq({ url: RESEARCH_PATH, body: { query: 'LG C3 OLED TV' } }));
    const v1 = await run(gateway, createReq({ url: V1_PATH, body: V1_BODY }));
    assert.equal(research.statusCode === 200, researchOn, `research with v1=${v1On} research=${researchOn}`);
    assert.equal(v1.body.errorCode === 'API_DISABLED', !v1On, `v1 with v1=${v1On} research=${researchOn}`);
  }
});

test('unauthorized calls are rejected on both paths with their own contract, before any store, budget, engine or provider', async () => {
  const gateway = gatewayFor({ ITEMASSIST_REPLACEMENT_API_ENABLED: 'true', ITEMASSIST_RESEARCH_ENABLED: 'true', ITEMASSIST_REPLACEMENT_API_TOKEN: TOKEN, VERCEL_ENV: 'preview', [FIXTURE_MODE_ENV]: 'preview' });
  const wrong = [{}, bearer('wrong-token-0123456789-abcdefghijkl'), bearer(`${TOKEN}x`), bearer(TOKEN.slice(0, -1)), { authorization: TOKEN }, { authorization: `Basic ${TOKEN}` }, { authorization: 'Bearer' }];
  for (const headers of wrong) {
    const research = await run(gateway, createReq({ url: RESEARCH_PATH, headers, body: { query: 'LG C3 OLED TV' } }));
    assert.deepEqual([research.statusCode, research.body.errorCode, isResearchShape(research.body)], [401, 'UNAUTHORIZED', true], JSON.stringify(headers));
    const v1 = await run(gateway, createReq({ url: V1_PATH, headers, body: V1_BODY }));
    assert.deepEqual([v1.statusCode, v1.body.errorCode, isV1Shape(v1.body)], [401, 'UNAUTHORIZED', true], JSON.stringify(headers));
    assert.equal(JSON.stringify([research.body, v1.body]).includes(TOKEN), false);
  }
  // No token configured at all: nothing authenticates.
  const open = gatewayFor({ ITEMASSIST_REPLACEMENT_API_ENABLED: 'true', ITEMASSIST_RESEARCH_ENABLED: 'true' });
  for (const url of [RESEARCH_PATH, V1_PATH]) assert.equal((await run(open, createReq({ url, headers: bearer(), body: V1_BODY }))).statusCode, 401, url);
});

test('methods: each path keeps its own 405 with Allow: POST, and a body key cannot ride in to change routing or fixture state', async () => {
  const gateway = gatewayFor({ ITEMASSIST_REPLACEMENT_API_ENABLED: 'true', ITEMASSIST_RESEARCH_ENABLED: 'true', ITEMASSIST_REPLACEMENT_API_TOKEN: TOKEN, VERCEL_ENV: 'preview', [FIXTURE_MODE_ENV]: 'preview' });
  for (const method of ['GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']) {
    const research = await run(gateway, createReq({ method, url: RESEARCH_PATH }));
    assert.deepEqual([research.statusCode, research.headers.Allow, isResearchShape(research.body)], [405, 'POST', true], method);
    const v1 = await run(gateway, createReq({ method, url: V1_PATH }));
    assert.deepEqual([v1.statusCode, v1.headers.Allow, isV1Shape(v1.body)], [405, 'POST', true], method);
  }
  const extra = await run(gateway, createReq({ url: RESEARCH_PATH, body: { query: 'LG C3 OLED TV', fixture: true } }));
  assert.deepEqual([extra.statusCode, extra.body.errorCode], [400, 'INVALID_REQUEST']);
  const researchBodyOnV1 = await run(gateway, createReq({ url: V1_PATH, body: { query: 'LG C3 OLED TV' } }));
  assert.equal(isV1Shape(researchBodyOnV1.body), true, 'a Research body sent to the v1 path is a v1 error, never a Research answer');
  assert.equal(researchBodyOnV1.statusCode, 400);
});

test('a Research module that fails to load fails closed for Research only, and v1 keeps working', async () => {
  const replacement = createItemAssistReplacementHandler({ env: { ITEMASSIST_REPLACEMENT_API_ENABLED: 'true', ITEMASSIST_REPLACEMENT_API_TOKEN: TOKEN }, logger: quiet, redisFactory: TRAP, search: TRAP, recommend: TRAP });
  const gateway = createItemAssistGateway({ replacement, loadResearch: async () => { throw new Error('boom with secret detail'); } });
  const research = await run(gateway, createReq({ url: RESEARCH_PATH, body: { query: 'LG C3 OLED TV' } }));
  assert.deepEqual([research.statusCode, research.body.errorCode, isResearchShape(research.body)], [502, 'ENGINE_ERROR', true]);
  assert.equal(JSON.stringify(research.body).includes('secret detail'), false);
  assert.equal(research.headers['Cache-Control'], 'no-store');
  const v1 = await run(gateway, createReq({ url: V1_PATH, body: V1_BODY }));
  assert.equal(isV1Shape(v1.body), true);
});

// ---- the shipped entry point, built exactly as Vercel builds it (environment read per request) ------------------------------------------

async function withEnv(vars, fn) {
  const names = ['ITEMASSIST_RESEARCH_ENABLED', 'ITEMASSIST_REPLACEMENT_API_ENABLED', 'ITEMASSIST_REPLACEMENT_API_TOKEN', FIXTURE_MODE_ENV, 'VERCEL_ENV', 'GEMINI_API_KEY', 'SERPER_API_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    Object.assign(process.env, vars);
    return await fn();
  } finally { for (const name of names) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; } }
}

test('the shipped entry serves Research (lazy-loaded) in fixture mode on a Preview only, and never in Production-shaped environments', async () => {
  const base = { ITEMASSIST_RESEARCH_ENABLED: 'true', ITEMASSIST_REPLACEMENT_API_TOKEN: TOKEN };
  const ask = () => run(shippedEntry, createReq({ url: RESEARCH_PATH, body: { query: 'LG C3 OLED TV' } }));
  const preview = await withEnv({ ...base, [FIXTURE_MODE_ENV]: 'preview', VERCEL_ENV: 'preview' }, ask);
  assert.deepEqual([preview.statusCode, preview.body.meta.fixture, preview.headers['X-ItemAssist-Research-Mode']], [200, true, 'fixture']);

  for (const vercelEnv of ['production', 'development', undefined, '', 'Preview', 'PREVIEW', ' preview']) {
    const res = await withEnv({ ...base, [FIXTURE_MODE_ENV]: 'preview', ...(vercelEnv === undefined ? {} : { VERCEL_ENV: vercelEnv }) }, ask);
    assert.deepEqual([res.statusCode, res.body.errorCode], [503, 'API_DISABLED'], `fixture flag with VERCEL_ENV=${vercelEnv}: refused, not served, not sent to a provider`);
    assert.equal(JSON.stringify(res.body).includes('fixture'), false);
    assert.equal(res.headers['X-ItemAssist-Research-Mode'], undefined);
  }
  // Production with no fixture flag and no provider key: a normal, non-canned refusal. No provider exists to call.
  const prod = await withEnv({ ...base, VERCEL_ENV: 'production' }, ask);
  assert.deepEqual([prod.statusCode, prod.body.errorCode], [503, 'PROVIDER_UNAVAILABLE']);
  assert.equal(JSON.stringify(prod.body).includes('fixture'), false);
});

test('the shipped entry is v1 by default and unaffected by the Research or fixture variables', async () => {
  const v1Disabled = await withEnv({ ITEMASSIST_RESEARCH_ENABLED: 'true', [FIXTURE_MODE_ENV]: 'preview', VERCEL_ENV: 'preview', ITEMASSIST_REPLACEMENT_API_TOKEN: TOKEN },
    () => run(shippedEntry, createReq({ url: V1_PATH, body: V1_BODY })));
  assert.deepEqual([v1Disabled.statusCode, v1Disabled.body.errorCode, isV1Shape(v1Disabled.body)], [503, 'API_DISABLED', true]);
  const nothing = await withEnv({}, () => run(shippedEntry, createReq({ url: V1_PATH, body: V1_BODY })));
  assert.deepEqual([nothing.statusCode, nothing.body.errorCode], [503, 'API_DISABLED']);
  const researchNothing = await withEnv({}, () => run(shippedEntry, createReq({ url: RESEARCH_PATH, body: { query: 'LG C3 OLED TV' } })));
  assert.deepEqual([researchNothing.statusCode, researchNothing.body.errorCode, isResearchShape(researchNothing.body)], [503, 'API_DISABLED', true]);
});

// ---- deployment shape ------------------------------------------------------------------------------------------------------------

/** Vercel turns every file under api/ into a function, except names starting with '_' or '.'. */
function deployedFunctions(dir = 'api') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) return [];
    const path = join(dir, entry.name).replaceAll('\\', '/');
    return entry.isDirectory() ? deployedFunctions(path) : [path];
  });
}
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const VERCEL_HOBBY_FUNCTION_LIMIT = 12;

test('the deployment has no more than 12 serverless functions, and Research is not one of them', () => {
  const functions = deployedFunctions();
  assert.ok(functions.length <= VERCEL_HOBBY_FUNCTION_LIMIT, `${functions.length} functions: ${functions.join(', ')}`);
  assert.equal(existsSync('api/itemassist-research.js'), false);
  assert.ok(functions.includes('api/itemassist-replacement.js'));
  assert.equal(functions.some((file) => /research/.test(file)), false);
  assert.equal(existsSync('lib/itemassist-research/handler.js'), true);
});

test('every vercel.json functions entry matches a real function (an unmatched pattern fails the build) and the v1 duration is unchanged', () => {
  const config = readJson('vercel.json');
  const functions = new Set(deployedFunctions());
  for (const pattern of Object.keys(config.functions)) assert.ok(functions.has(pattern), `${pattern} matches no function`);
  assert.equal(config.functions['api/itemassist-replacement.js'].maxDuration, 30);
  assert.equal(config.functions['api/age-lookup.js'].maxDuration, 35);
  assert.equal(config.functions['api/refine-serial-date.js'].maxDuration, 30);
});

/** Just enough of Vercel's source syntax for the unconditional rules in this file: literal paths and the (.*) wildcard. Anything else fails loudly. */
function sourceToRegExp(source) {
  assert.equal(/[:*]/.test(source.replaceAll('(.*)', '')), false, `unsupported pattern syntax in ${source}`);
  return new RegExp(`^${source.split('(.*)').map((part) => part.replace(/[.+?^${}|[\]\\()]/g, '\\$&')).join('.*')}$`);
}

test('the vercel.json rewrite sends exactly /api/itemassist-research to the shared function, ahead of the /api catch-all, with nothing earlier matching it', () => {
  const { rewrites, redirects } = readJson('vercel.json');
  const index = rewrites.findIndex((rule) => rule.source === RESEARCH_PATH);
  assert.ok(index >= 0, 'the rewrite exists');
  assert.deepEqual(rewrites[index], { source: RESEARCH_PATH, destination: V1_PATH });
  assert.equal(rewrites.filter((rule) => rule.source === RESEARCH_PATH).length, 1);
  const catchAll = rewrites.findIndex((rule) => rule.source === '/api/(.*)');
  assert.ok(catchAll > index, 'the identity /api/(.*) rewrite would otherwise win for this path');
  // Nothing before it (rewrite or redirect, without a host condition) may match the Research path.
  for (const rule of [...redirects.filter((entry) => !entry.has), ...rewrites.slice(0, index).filter((entry) => !entry.has)]) {
    assert.equal(sourceToRegExp(rule.source).test(RESEARCH_PATH), false, `${rule.source} would capture ${RESEARCH_PATH}`);
  }
  assert.ok(redirects.filter((entry) => entry.has).every((entry) => entry.has.every((cond) => cond.type === 'host')), 'only host redirects are conditional');
  // The rewrite never widens: no other rule points at the Research path, and no rule other than the catch-all matches the v1 path.
  assert.equal(rewrites.some((rule) => rule.destination === RESEARCH_PATH), false);
  for (const rule of rewrites) {
    if (rule.source === RESEARCH_PATH || rule.source === '/api/(.*)') continue;
    assert.equal(sourceToRegExp(rule.source).test(V1_PATH), false, `${rule.source} would capture ${V1_PATH}`);
  }
});

test('vercel.json carries no legacy routing (routes/builds), no environment values and no fixture switch', () => {
  const config = readJson('vercel.json');
  assert.equal('routes' in config, false);
  assert.equal('builds' in config, false);
  assert.equal('env' in config, false);
  assert.equal('build' in config, false);
  const text = readFileSync('vercel.json', 'utf8');
  for (const forbidden of [FIXTURE_MODE_ENV, 'FIXTURE', 'ITEMASSIST_RESEARCH', 'x-itemassist']) assert.equal(text.includes(forbidden), false, forbidden);
});

// ---- source-level isolation ------------------------------------------------------------------------------------------------------

test('the gateway reads no environment, request header, cookie or body, imports no provider, and the v1 file only gains the gateway import and default export', () => {
  const source = readFileSync('lib/itemassist-gateway/gateway.js', 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  for (const forbidden of ['process.env', 'env.', 'headers', 'cookie', 'body', 'query', 'fixture', 'FIXTURE', 'fetch(', 'gemini', 'Redis']) assert.equal(source.includes(forbidden), false, forbidden);
  const imports = [...source.matchAll(/(?:from|import\()\s*'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(imports, ['../itemassist-research/contract.js', '../itemassist-research/handler.js']);

  const v1 = readFileSync('api/itemassist-replacement.js', 'utf8');
  assert.equal(v1.includes('itemassist-research'), false);
  assert.equal(v1.includes('ITEMASSIST_RESEARCH'), false);
  assert.equal(v1.includes('FIXTURE'), false);
  assert.equal((v1.match(/createItemAssistGateway/g) || []).length, 2, 'one import, one use');
  assert.match(v1, /export default createItemAssistGateway\(\{ replacement: createItemAssistReplacementHandler\(\) \}\);/);
  assert.match(v1, /export function createItemAssistReplacementHandler\(/);
});
