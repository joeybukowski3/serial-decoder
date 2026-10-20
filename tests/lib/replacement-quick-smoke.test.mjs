import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  APPROVAL_TOKEN, LIVE_ENV_FLAG, PRICING, SMOKE_QUERY, createGuardedFetch, estimateCost, estimateUpperBound, looksLikeProduction, missingApprovals, runQuickSmoke, scrub,
} from '../../scripts/replacement-quick-smoke-core.mjs';
import { quickEndpoint } from '../../lib/replacement-quick/quick-answer.js';
import { QUICK_MAX_OUTPUT_TOKENS } from '../../lib/replacement-quick/quick-prompt.js';

// OFFLINE ONLY: every "Gemini" below is a mock fetch. No network, no real key.
const FAKE_KEY = 'test-key-0123456789abcdef';
const LIVE_ARGV = ['--confirm-live', `--approve=${APPROVAL_TOKEN}`];
const LIVE_ENV = { [LIVE_ENV_FLAG]: '1', GEMINI_API_KEY: FAKE_KEY };
const NOW = () => new Date('2026-10-19T12:00:00.000Z');
const outDir = () => mkdtempSync(join(tmpdir(), 'quick-smoke-test-'));

const reply = {
  category: 'tv',
  original: { identity: 'LG C3 series 4K OLED smart TV', confidence: 'high', characteristics: ['OLED', '4K'], uncertainty: null },
  requirements: ['Same screen size class', 'OLED or better panel', '4K resolution', 'Enough HDMI 2.1 ports'],
  suggestions: [{ name: 'LG C-series OLED, newest generation', why: 'Direct successor line.', differences: 'Newer processor.', confidence: 'high' }],
  clarify: [],
};
const body = (text = JSON.stringify(reply)) => ({
  candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }],
  usageMetadata: { promptTokenCount: 340, candidatesTokenCount: 420, thoughtsTokenCount: 10, totalTokenCount: 770 },
});
function mockFetch(respond) {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url: String(url), init }); return respond(calls.length); };
  fetchImpl.calls = calls;
  return fetchImpl;
}
const okFetch = (text) => mockFetch(() => new Response(JSON.stringify(body(text)), { status: 200, headers: { 'content-type': 'application/json' } }));
const neverFetch = () => mockFetch(() => { throw new Error('fetch must not be called'); });
const goodInit = { method: 'POST', headers: {}, body: JSON.stringify({ contents: [], generationConfig: {} }) };

// ---------------------------------------------------------------- gates

test('dry run reports the plan, sizes and a cost upper bound, and calls nothing', async () => {
  const fetchImpl = neverFetch();
  const directory = outDir();
  const result = await runQuickSmoke({ argv: [], env: { GEMINI_API_KEY: FAKE_KEY }, fetchImpl, outputDir: directory, now: NOW });
  assert.equal(result.mode, 'DRY_RUN');
  assert.equal(result.exitCode, 0);
  assert.equal(fetchImpl.calls.length, 0);
  assert.equal(readdirSync(directory).length, 0, 'a dry run writes nothing');
  const { report } = result;
  assert.equal(report.model, 'gemini-3.5-flash-lite');
  assert.equal(report.plannedRequests, 1);
  assert.equal(report.retries, 0);
  assert.equal(report.timeoutMs, 5500);
  assert.match(report.tools, /^none/);
  assert.equal(report.generationConfig.thinkingConfig.thinkingLevel, 'minimal');
  assert.equal(report.generationConfig.maxOutputTokens, QUICK_MAX_OUTPUT_TOKENS);
  assert.ok(report.size.promptChars > 0 && report.size.promptChars < 3350);
  assert.ok(report.size.requestBodyChars >= report.size.promptChars);
  assert.ok(report.upperBoundCost.totalUsd > 0 && report.upperBoundCost.totalUsd < 0.01);
  assert.deepEqual(report.stillNeededForLive, [`set ${LIVE_ENV_FLAG}=1`, 'pass --confirm-live', `pass --approve=${APPROVAL_TOKEN}`]);
  assert.equal(report.called, 'nothing');
});

test('each approval is required on its own; a wrong token is not enough', async () => {
  for (const [argv, env] of [
    [LIVE_ARGV, { GEMINI_API_KEY: FAKE_KEY }],
    [['--approve=' + APPROVAL_TOKEN], LIVE_ENV],
    [['--confirm-live'], LIVE_ENV],
    [['--confirm-live', '--approve=wrong'], LIVE_ENV],
    [LIVE_ARGV, { ...LIVE_ENV, [LIVE_ENV_FLAG]: 'true' }],
  ]) {
    const fetchImpl = neverFetch();
    const result = await runQuickSmoke({ argv, env, fetchImpl, outputDir: outDir(), now: NOW });
    assert.equal(result.mode, 'DRY_RUN');
    assert.equal(fetchImpl.calls.length, 0);
  }
  assert.deepEqual(missingApprovals({ argv: LIVE_ARGV, env: LIVE_ENV }), []);
});

test('a live run is refused in a production-looking environment or without a key, before any request', async () => {
  for (const extra of [{ VERCEL: '1' }, { VERCEL_ENV: 'production' }, { NODE_ENV: 'production' }]) {
    const fetchImpl = neverFetch();
    const result = await runQuickSmoke({ argv: LIVE_ARGV, env: { ...LIVE_ENV, ...extra }, fetchImpl, outputDir: outDir() });
    assert.equal(result.mode, 'REFUSED');
    assert.equal(result.report.refused, 'PRODUCTION_ENVIRONMENT_DETECTED');
    assert.equal(result.exitCode, 2);
    assert.equal(fetchImpl.calls.length, 0);
  }
  const noKey = neverFetch();
  const refused = await runQuickSmoke({ argv: LIVE_ARGV, env: { [LIVE_ENV_FLAG]: '1' }, fetchImpl: noKey, outputDir: outDir() });
  assert.equal(refused.report.refused, 'GEMINI_API_KEY_NOT_SET');
  assert.equal(noKey.calls.length, 0);
  assert.equal(looksLikeProduction({}), false);
});

// ---------------------------------------------------------------- the fetch guard

test('the guard allows exactly one POST to the one Fast Answer URL, with redirects off', async () => {
  const fetchImpl = okFetch();
  const guard = createGuardedFetch(fetchImpl);
  await guard(quickEndpoint(), goodInit);
  assert.equal(fetchImpl.calls[0].init.redirect, 'error');
  assert.equal(guard.state.requests, 1);
  await assert.rejects(() => guard(quickEndpoint(), goodInit), /SMOKE_REQUEST_CAP_REACHED/);
  assert.equal(fetchImpl.calls.length, 1);
});

test('the guard blocks other URLs, other methods and any request that enables tools, before the network', async () => {
  const withTools = { ...goodInit, body: JSON.stringify({ contents: [], tools: [{ google_search: {} }] }) };
  const nestedTools = { ...goodInit, body: JSON.stringify({ contents: [], generationConfig: { tools: [] } }) };
  const toolConfig = { ...goodInit, body: JSON.stringify({ contents: [], toolConfig: {} }) };
  const unreadable = { ...goodInit, body: '{not json' };
  const cases = [
    ['https://example.com/x', goodInit, 'SMOKE_BLOCKED_URL'],
    [quickEndpoint('gemini-3.8-flash'), goodInit, 'SMOKE_BLOCKED_URL'],
    [`${quickEndpoint()}?key=abc`, goodInit, 'SMOKE_BLOCKED_URL'],
    [quickEndpoint(), { ...goodInit, method: 'GET' }, 'SMOKE_BLOCKED_METHOD'],
    [quickEndpoint(), withTools, 'SMOKE_BLOCKED_TOOLS'],
    [quickEndpoint(), nestedTools, 'SMOKE_BLOCKED_TOOLS'],
    [quickEndpoint(), toolConfig, 'SMOKE_BLOCKED_TOOLS'],
    [quickEndpoint(), unreadable, 'SMOKE_BLOCKED_TOOLS'],
  ];
  for (const [url, init, reason] of cases) {
    const fetchImpl = neverFetch();
    const guard = createGuardedFetch(fetchImpl);
    await assert.rejects(() => guard(url, init), new RegExp(reason));
    assert.equal(fetchImpl.calls.length, 0);
    assert.deepEqual(guard.state.blocked, [reason]);
  }
});

// ---------------------------------------------------------------- a live run (mock fetch only)

test('a gated live run sends one request, writes a sanitized report outside the repo and never contains the key', async () => {
  const fetchImpl = okFetch();
  const directory = outDir();
  const printed = [];
  const result = await runQuickSmoke({ argv: LIVE_ARGV, env: LIVE_ENV, fetchImpl, outputDir: directory, now: NOW, print: (line) => printed.push(line) });
  assert.equal(result.mode, 'LIVE');
  assert.equal(result.exitCode, 0);
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(fetchImpl.calls[0].url, quickEndpoint());
  assert.equal(fetchImpl.calls[0].init.redirect, 'error');
  assert.equal(result.report.requestsSent, 1);
  assert.deepEqual(result.report.blockedRequests, []);
  assert.equal(result.report.query, SMOKE_QUERY);
  assert.equal(result.report.answer.status, 'OK');
  assert.equal(result.report.finishReason, 'STOP');
  assert.deepEqual(result.report.tokens, { promptTokenCount: 340, candidatesTokenCount: 420, thoughtsTokenCount: 10, totalTokenCount: 770 });
  assert.equal(result.report.estimatedActualCost, estimateCost({ inputTokens: 340, outputTokens: 420, thinkingTokens: 10 }));
  assert.ok(result.report.rawTextChars > 0 && typeof result.report.rawText === 'string');
  assert.ok(Number.isFinite(result.report.latencyMs.total));

  assert.ok(existsSync(result.outputPath));
  assert.ok(!result.outputPath.startsWith(process.cwd()), 'the report is written outside the repository');
  const written = readFileSync(result.outputPath, 'utf8');
  assert.ok(!written.includes(FAKE_KEY));
  assert.ok(!JSON.stringify(printed).includes(FAKE_KEY));
  assert.ok(!/x-goog-api-key/i.test(written));
});

test('a provider failure in a live run is reported with exit code 1, still after exactly one request', async () => {
  const fetchImpl = mockFetch(() => new Response('{}', { status: 429 }));
  const result = await runQuickSmoke({ argv: LIVE_ARGV, env: LIVE_ENV, fetchImpl, outputDir: outDir(), now: NOW });
  assert.equal(result.mode, 'LIVE');
  assert.equal(result.exitCode, 1);
  assert.equal(result.report.errorCode, 'PROVIDER_RATE_LIMIT');
  assert.equal(result.report.httpStatus, 429);
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(result.report.answer.status, 'UNAVAILABLE');
});

// ---------------------------------------------------------------- helpers

test('cost helpers use the published rates and the upper bound assumes the output cap', () => {
  assert.equal(PRICING.model, 'gemini-3.5-flash-lite');
  assert.equal(estimateCost({ inputTokens: 1_000_000, outputTokens: 0 }), 0.30);
  assert.equal(estimateCost({ inputTokens: 0, outputTokens: 600_000, thinkingTokens: 400_000 }), 2.50);
  const bound = estimateUpperBound(1280);
  assert.equal(bound.inputTokens, Math.ceil(1280 / 3));
  assert.equal(bound.outputPlusThinkingTokens, QUICK_MAX_OUTPUT_TOKENS);
  assert.ok(bound.totalUsd < 0.005);
});

test('scrub removes the key and anything shaped like a Google API key', () => {
  const text = scrub(`key ${FAKE_KEY} and AIzaSyA1234567890abcdefghijklmnop`, FAKE_KEY);
  assert.ok(!text.includes(FAKE_KEY));
  assert.ok(!text.includes('AIzaSy'));
});
