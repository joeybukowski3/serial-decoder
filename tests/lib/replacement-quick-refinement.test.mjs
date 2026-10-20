import test from 'node:test';
import assert from 'node:assert/strict';
import { getQuickAnswer } from '../../lib/replacement-quick/quick-answer.js';
import { LIMITS, MAX_QUERY_CHARS, buildQuickPrompt } from '../../lib/replacement-quick/quick-prompt.js';
import { findUnsafeClaim, sanitizeQuickAnswer } from '../../lib/replacement-quick/quick-sanitize.js';

// OFFLINE ONLY: every "Gemini" below is a mock fetch. No network, no real key.
// Covers the quality refinement made after the first live result: newest known generations, technical equivalence,
// family names over invented model codes, and a question when a critical detail (TV screen size) is missing.
const QUERY = 'LG C3 OLED TV';
const SIZE_QUESTION = 'What screen size do you need?';

// What a good reply to "LG C3 OLED TV" looks like under the refined prompt. Product lines are generic on purpose: this is a
// fixture for the response path, not a statement about what exists.
const refinedReply = Object.freeze({
  category: 'tv',
  original: { identity: 'LG C3 series OLED evo TV (2023)', confidence: 'high', characteristics: ['OLED panel', '4K resolution', '120 Hz native refresh', 'Mid-premium OLED tier'], uncertainty: 'Screen size was not given' },
  requirements: ['OLED or QD-OLED display', 'Same screen size class', '4K at 120 Hz', 'HDMI 2.1 on several ports', 'Dolby Vision and HDR10 support'],
  suggestions: [
    { name: 'LG C-series OLED, successor generation', why: 'Same OLED line and tier as the original.', differences: 'Newer processor; the exact model is unconfirmed.', confidence: 'medium' },
    { name: 'Samsung S90-series QD-OLED', why: 'QD-OLED panel at a similar tier and refresh rate.', differences: 'Different panel type; no Dolby Vision.', confidence: 'medium' },
    { name: 'Sony Bravia OLED, mid-premium line', why: 'OLED panel at a similar tier.', differences: null, confidence: 'low' },
  ],
  clarify: ['What screen size are you replacing (for example 55, 65 or 77 inches)?'],
});

const answerFor = (overrides, query = QUERY) => sanitizeQuickAnswer({ ...refinedReply, ...overrides }, { query });
const names = (answer) => answer.suggestions.map((item) => item.name);
const clarifyFor = (query, clarify = []) => answerFor({ clarify }, query).clarify;

function okFetch(reply) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 400, candidatesTokenCount: 450, thoughtsTokenCount: 0 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

// ---------------------------------------------------------------- prompt

test('the prompt asks for the newest generations the model knows, without claiming they are current or available', () => {
  const prompt = buildQuickPrompt(QUERY);
  assert.match(prompt, /newest generation/i);
  assert.match(prompt, /may be out of date/i);
  assert.match(prompt, /never say a suggestion is current, latest, in production or available/i);
  assert.doesNotMatch(prompt, /current equivalents/i, 'the old wording asked for "current" products');
});

test('the prompt ranks technical equivalence for televisions and does not let newer imply better', () => {
  const prompt = buildQuickPrompt(QUERY).toLowerCase();
  assert.match(prompt, /technical equivalence/);
  const positions = ['display technology', 'screen size', 'resolution', 'refresh rate', 'performance class', 'essential features'].map((term) => prompt.indexOf(term));
  assert.ok(positions.every((at) => at >= 0), `every TV factor is named: ${positions}`);
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'the factors appear in priority order');
  assert.match(prompt, /newer is not better/);
  assert.match(prompt, /candidate to compare/);
  assert.match(prompt, /like-kind-and-quality/);
});

test('the prompt prefers families to invented model numbers and keeps asking for the most meaningful difference', () => {
  const prompt = buildQuickPrompt(QUERY);
  assert.match(prompt, /model family or line/i);
  assert.match(prompt, /exact model code only if you are sure it exists/);
  assert.match(prompt, /confidence low when you are unsure/i);
  assert.match(prompt, /most meaningful difference from the original/);
  assert.match(prompt, /use null, do not guess/);
});

test('the prompt asks for a missing critical detail instead of guessing it, and nothing else', () => {
  const prompt = buildQuickPrompt(QUERY);
  assert.match(prompt, /critical detail is missing[^.]*screen size/i);
  assert.match(prompt, /do not guess it/i);
  assert.match(prompt, /no other clarify questions/i);
});

test('the prompt still forbids URLs, prices and availability, treats the query as data, and the request has no tools', async () => {
  const prompt = buildQuickPrompt('x" injected');
  assert.match(prompt, /Never include URLs, prices, deals, store names, stock or availability/);
  assert.match(prompt, /claims about release or discontinuation dates/);
  assert.ok(prompt.includes(JSON.stringify('x" injected')));
  const fetchImpl = okFetch(refinedReply);
  await getQuickAnswer(QUERY, { apiKey: 'test-key-0123456789abcdef', fetchImpl });
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(JSON.parse(fetchImpl.calls[0].init.body).tools, undefined);
});

// ---------------------------------------------------------------- response behavior

test('a refined reply passes through whole: specs, family names, uncertainty labels and the size question', async () => {
  const { answer } = await getQuickAnswer(QUERY, { apiKey: 'test-key-0123456789abcdef', fetchImpl: okFetch(refinedReply) });
  assert.equal(answer.status, 'OK');
  assert.deepEqual(answer.original.characteristics, refinedReply.original.characteristics);
  assert.equal(answer.original.uncertainty, 'Screen size was not given');
  assert.deepEqual(answer.requirements, refinedReply.requirements);
  assert.equal(answer.requirementsSource, 'AI_ESTIMATE');
  assert.deepEqual(names(answer), refinedReply.suggestions.map((item) => item.name));
  assert.deepEqual(answer.suggestions.map((item) => item.confidence), ['medium', 'medium', 'low']);
  assert.ok(answer.suggestions.every((item) => item.unverified === true), 'availability and specs stay unverified at every confidence');
  assert.deepEqual(answer.clarify, refinedReply.clarify);
  assert.deepEqual(answer.removedClaimTypes, []);
  assert.deepEqual(answer.warnings, ['DIFFERENCES_MISSING']);
});

test('claims that a suggestion is current, still sold or in production are removed; generation wording is kept', () => {
  const removed = [
    'The current model is sold in most sizes', 'Still sold in several sizes', 'Now being manufactured', 'Currently in production',
    'The latest model available', 'The newest generation is offered in 65 inches', 'Widely on the market',
  ];
  removed.push('Still available in 65 inches', 'Widely available', 'Available in 55, 65 and 77 inches', 'Currently offered', 'Sold in 65 inch', 'Sold worldwide');
  for (const sample of removed) assert.equal(findUnsafeClaim(sample), 'AVAILABILITY', sample);
  const kept = ['Next generation after the C3', 'Newest generation of the S90 line I know of', 'Newer processor and brighter panel', 'Successor to the 2023 model', 'Uses a production-grade panel'];
  for (const sample of kept) assert.equal(findUnsafeClaim(sample), null, sample);

  const answer = answerFor({
    suggestions: [
      { name: 'LG C-series OLED, next generation', why: 'Same line.', differences: 'The latest model available has a newer processor.', confidence: 'medium' },
      { name: 'Samsung S90-series QD-OLED', why: 'Currently in production at a similar tier.', differences: 'Different panel.', confidence: 'medium' },
    ],
  });
  assert.deepEqual(names(answer), ['LG C-series OLED, next generation']);
  assert.equal(answer.suggestions[0].differences, null);
  assert.ok(answer.removedClaimTypes.includes('AVAILABILITY'));
  assert.ok(answer.suggestions.every((item) => item.unverified === true));
});

// ---------------------------------------------------------------- the missing-size question

test('a television described without a size is asked for one, even when the model forgot', () => {
  for (const query of ['LG C3 OLED TV', 'Samsung S90C', 'Sony A80L OLED', 'TCL 4K 120hz QLED TV', 'LG C3 OLED TV 60hz']) {
    assert.deepEqual(clarifyFor(query), [SIZE_QUESTION], query);
  }
  const unsure = sanitizeQuickAnswer({ ...refinedReply, original: { ...refinedReply.original, confidence: 'medium' }, clarify: ['Do you use it for gaming?', 'Is it wall mounted?'] }, { query: QUERY });
  assert.equal(unsure.clarify[0], SIZE_QUESTION);
  assert.equal(unsure.clarify.length, LIMITS.maxClarify, 'the size question counts toward the cap');
});

test('a confident identification keeps only a size question: off-topic, price and retailer questions never reach the customer', () => {
  const offTopic = ["What's your budget?", 'Which retailer do you prefer?', 'Best Buy for $500?', 'Check www.lg.com?'];
  assert.deepEqual(clarifyFor('LG C3 OLED 65 inch', offTopic), []);
  assert.deepEqual(clarifyFor(QUERY, offTopic), [SIZE_QUESTION]);
  assert.deepEqual(clarifyFor(QUERY, ['Which screen size do you have?', ...offTopic]), ['Which screen size do you have?']);
  const answer = answerFor({ clarify: offTopic });
  assert.ok(answer.removedClaimTypes.includes('URL') && answer.removedClaimTypes.includes('PRICE'), 'unsafe claims are still reported');
  // A low-confidence identification still lets the model ask what it needs, with the same claim filters.
  const low = sanitizeQuickAnswer({ ...refinedReply, original: { ...refinedReply.original, confidence: 'low' }, clarify: ['What is the model number?', 'Best Buy for $500?'] }, { query: QUERY });
  assert.deepEqual(low.clarify, [SIZE_QUESTION, 'What is the model number?']);
});

test('a TV the model filed as electronics still gets the size question; a refrigerator never does', () => {
  const asElectronics = sanitizeQuickAnswer({ ...refinedReply, category: 'electronics', clarify: [] }, { query: QUERY });
  assert.deepEqual(asElectronics.clarify, [SIZE_QUESTION]);
  const noCategory = sanitizeQuickAnswer({ ...refinedReply, category: undefined, clarify: [] }, { query: QUERY });
  assert.deepEqual(noCategory.clarify, [SIZE_QUESTION]);
  const laptop = sanitizeQuickAnswer({ category: 'electronics', original: { identity: 'Dell XPS 13', confidence: 'high' }, clarify: [] }, { query: 'Dell XPS 13' });
  assert.deepEqual(laptop.clarify, []);
});

test('refresh rates and ages are not screen sizes; sizes outside the common list and prime marks are', () => {
  for (const query of ['Vizio 60 Hz TV 4k', 'Old 40 year tv', 'Samsung 50 Hz LED TV', 'TCL 120 nits QLED TV']) assert.deepEqual(clarifyFor(query), [SIZE_QUESTION], query);
  for (const query of ['Samsung 7 series 49 inch TV', 'LG 100 inch OLED TV', 'LG 55″ C3 OLED TV', "Sony 65'' A80L TV", 'Hisense 100" U8 TV', 'TCL 44-inch LED TV']) assert.deepEqual(clarifyFor(query), [], query);
});

test('the prompt, for a maximum-length query, stays inside the budget', () => {
  const longest = 'LG C3 OLED TV'.padEnd(MAX_QUERY_CHARS, 'x');
  assert.equal(longest.length, MAX_QUERY_CHARS);
  assert.ok(buildQuickPrompt(longest).length < 3350, `prompt is ${buildQuickPrompt(longest).length} chars`);
});

test('the size question is not added when the size is given, already asked, or irrelevant', () => {
  for (const query of ['LG C3 OLED 65 inch', 'LG C3 OLED 65-inch TV', 'LG 55" C3 OLED', 'LG OLED65C3PUA', 'Samsung QN65S90C', 'Sony 65A80L', 'LG C3 55', 'Hisense 75 in U8']) {
    assert.deepEqual(clarifyFor(query), [], query);
  }
  assert.deepEqual(clarifyFor(QUERY, ['Which screen size is it?']), ['Which screen size is it?'], 'not duplicated');
  assert.deepEqual(clarifyFor(QUERY, ['What inch class?']), ['What inch class?']);
  assert.deepEqual(sanitizeQuickAnswer({ ...refinedReply, clarify: [] }).clarify, [], 'no query, nothing to judge');
  const fridge = sanitizeQuickAnswer({ ...refinedReply, category: 'refrigerator', clarify: [] }, { query: 'Whirlpool french door refrigerator' });
  assert.deepEqual(fridge.clarify, [], 'a category mismatch asks nothing');
  const appliance = sanitizeQuickAnswer({ category: 'appliance', original: { identity: 'Whirlpool WRF535', confidence: 'high' }, clarify: [] }, { query: 'Whirlpool WRF535' });
  assert.deepEqual(appliance.clarify, [], 'only televisions get the size question');
});

test('the size question is bounded and counts toward the two-question cap', async () => {
  const { answer } = await getQuickAnswer('Sony A80L OLED', { apiKey: 'test-key-0123456789abcdef', fetchImpl: okFetch({ ...refinedReply, clarify: ['Q one?', 'Q two?', 'Q three?'] }) });
  assert.equal(answer.clarify.length, LIMITS.maxClarify);
  assert.ok(answer.clarify.every((question) => question.length <= LIMITS.maxQuestion));
  assert.equal(answer.clarify[0], SIZE_QUESTION);
});
