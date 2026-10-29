import test from 'node:test';
import assert from 'node:assert/strict';
import { QUICK_CACHE_VERSION, getQuickAnswer } from '../../lib/replacement-quick/quick-answer.js';
import { LIMITS, QUICK_JSON_SHAPE, QUICK_MAX_OUTPUT_TOKENS, QUICK_PROMPT_VERSION, buildQuickPrompt } from '../../lib/replacement-quick/quick-prompt.js';
import { ANSWER_VERSION, SUCCESSOR_STANDING, buildFallbackAnswer, sanitizeQuickAnswer } from '../../lib/replacement-quick/quick-sanitize.js';

// OFFLINE ONLY: every "Gemini" below is a mock fetch. No network, no real key.
// Successor-first behaviour. Model names in these fixtures exercise the response path; they are not statements about what exists.
const FAKE_KEY = 'test-key-0123456789abcdef';
const QUERY = 'LG C3 OLED TV';

const c3Successor = Object.freeze({
  name: 'LG C4 OLED evo',
  why: 'Next generation of the same C-series OLED line.',
  differences: 'Newer processor and brighter panel.',
  concern: null,
  confidence: 'high',
});

const crossBrand = Object.freeze([
  { name: 'Samsung S90 series QD-OLED', why: 'QD-OLED panel at a similar tier.', differences: 'Different smart platform.', confidence: 'medium' },
  { name: 'Sony Bravia 8 OLED', why: 'OLED panel at a similar tier.', differences: 'Fewer gaming features.', confidence: 'medium' },
  { name: 'Panasonic Z95 series OLED', why: 'Premium OLED with strong processing.', differences: null, confidence: 'low' },
]);

const baseReply = Object.freeze({
  category: 'tv',
  original: { identity: 'LG C3 series OLED evo TV (2023)', confidence: 'high', characteristics: ['OLED panel', '4K', '120 Hz'], uncertainty: null },
  requirements: ['OLED or QD-OLED display', 'Same screen size class', '4K at 120 Hz', 'HDMI 2.1 on several ports'],
  successor: c3Successor,
  suggestions: crossBrand,
  clarify: [],
});

const answerFor = (overrides = {}, query = QUERY) => sanitizeQuickAnswer({ ...baseReply, ...overrides }, { query });
const withOriginal = (overrides) => ({ original: { ...baseReply.original, ...overrides } });

function mockFetch(respond) {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url: String(url), init }); return respond(calls.length); };
  fetchImpl.calls = calls;
  return fetchImpl;
}
const okFetch = (reply) => mockFetch(() => new Response(JSON.stringify({
  candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] }, finishReason: 'STOP' }],
  usageMetadata: { promptTokenCount: 600, candidatesTokenCount: 520, thoughtsTokenCount: 0 },
}), { status: 200, headers: { 'content-type': 'application/json' } }));

// ---------------------------------------------------------------- LG C3: the successor comes first

test('LG C3: the original maker\'s successor is returned as its own field, apart from the alternatives', () => {
  const answer = answerFor();
  assert.equal(answer.status, 'OK');
  assert.equal(answer.successor.name, 'LG C4 OLED evo');
  assert.equal(answer.successor.standing, SUCCESSOR_STANDING.RECOMMENDED);
  assert.equal(answer.successor.concern, null);
  assert.equal(answer.successor.differences, 'Newer processor and brighter panel.');
  assert.equal(answer.successor.unverified, true);
  assert.deepEqual(answer.suggestions.map((item) => item.name), crossBrand.map((item) => item.name));
  assert.deepEqual(answer.warnings, ['DIFFERENCES_MISSING'], 'only the third alternative has no stated difference');
});

test('the successor is a candidate to compare, not an LKQ decision: nothing in the answer claims equivalence or availability', () => {
  const answer = answerFor();
  assert.deepEqual(Object.keys(answer.successor).sort(), ['concern', 'confidence', 'differences', 'name', 'standing', 'unverified', 'why']);
  assert.doesNotMatch(JSON.stringify(answer), /lkq|like[- ]kind/i);
  assert.match(answer.disclosure, /not been verified/);
});

test('the prompt asks for the same maker\'s successor first, then alternatives, and never presumes the successor is best or LKQ', () => {
  const prompt = buildQuickPrompt(QUERY);
  assert.match(prompt, /newest direct successor series or product family/);
  assert.match(prompt, /Never invent one/);
  assert.match(prompt, /critical shortfall against the original/);
  assert.match(prompt, /do not assume it is the best choice/);
  assert.ok(prompt.indexOf('First set "successor"') < prompt.indexOf('suggestions: alternatives from any maker'), 'successor rule precedes the alternatives rule');
  assert.match(prompt, /Never the original, a variant of it, or the successor/);
  assert.doesNotMatch(prompt, /\blkq\b/i);
  assert.match(prompt, /never say a suggestion is current, latest, in production or available/);
  assert.ok(QUICK_JSON_SHAPE.includes('"successor":{'));
  assert.match(QUICK_JSON_SHAPE, /or null if unsure/);
  assert.ok(QUICK_JSON_SHAPE.indexOf('"successor"') < QUICK_JSON_SHAPE.indexOf('"suggestions"'));
});

// ---------------------------------------------------------------- unknown successor

test('unknown successor: null, missing or unusable values give a null successor and the alternatives are untouched', () => {
  for (const successor of [null, undefined, 'LG C4', ['LG C4'], 7, {}, { name: 'unknown', why: 'n/a' }, { name: 'LG C4', why: null }, { name: null, why: 'Next generation.' }]) {
    const answer = answerFor({ successor });
    assert.equal(answer.successor, null, JSON.stringify(successor));
    assert.equal(answer.status, 'OK');
    assert.equal(answer.suggestions.length, 3);
    assert.ok(!answer.warnings.includes('SUCCESSOR_CONDITIONAL'));
  }
  const omitted = sanitizeQuickAnswer({ ...baseReply, successor: undefined }, { query: QUERY });
  assert.equal(omitted.successor, null);
});

test('unknown successor: with no alternatives either, an identified product is PARTIAL', () => {
  const answer = answerFor({ successor: null, suggestions: [] });
  assert.equal(answer.status, 'PARTIAL');
  assert.equal(answer.successor, null);
});

test('a successor alone is enough for an OK answer', () => {
  const answer = answerFor({ suggestions: [] });
  assert.equal(answer.status, 'OK');
  assert.equal(answer.successor.name, 'LG C4 OLED evo');
});

test('an unidentified product gets no successor, and the withheld reply is flagged', () => {
  const answer = answerFor(withOriginal({ identity: null }), 'something odd');
  assert.equal(answer.status, 'GUIDANCE_ONLY');
  assert.equal(answer.successor, null);
  assert.deepEqual(answer.suggestions, []);
  assert.ok(answer.warnings.includes('SUGGESTIONS_WITHHELD'));
  const successorOnly = answerFor({ ...withOriginal({ identity: null }), suggestions: [] }, 'something odd');
  assert.ok(successorOnly.warnings.includes('SUGGESTIONS_WITHHELD'), 'a dropped successor alone is also reported');
});

test('an obvious category mismatch withholds the successor along with the identification', () => {
  const answer = answerFor({}, 'Whirlpool refrigerator');
  assert.equal(answer.successor, null);
  assert.deepEqual(answer.suggestions, []);
  assert.ok(answer.warnings.includes('CATEGORY_MISMATCH'));
});

test('fallback answers (invalid request, provider down) carry a null successor', () => {
  for (const status of ['UNAVAILABLE', 'INVALID_REQUEST']) assert.equal(buildFallbackAnswer({ status, query: QUERY }).successor, null);
});

// ---------------------------------------------------------------- known critical shortfall

test('known critical shortfall: the concern is exposed and the successor is conditional, not an unconditional first choice', () => {
  const answer = answerFor({ successor: { ...c3Successor, concern: 'Drops one of the four HDMI 2.1 ports.' } });
  assert.equal(answer.successor.name, 'LG C4 OLED evo');
  assert.equal(answer.successor.concern, 'Drops one of the four HDMI 2.1 ports.');
  assert.equal(answer.successor.standing, SUCCESSOR_STANDING.CONDITIONAL);
  assert.ok(answer.warnings.includes('SUCCESSOR_CONDITIONAL'));
  assert.equal(answer.suggestions.length, 3, 'the alternatives are still offered beside it');
});

test('a low-confidence successor is conditional even with no stated concern', () => {
  const answer = answerFor({ successor: { ...c3Successor, confidence: 'low' } });
  assert.equal(answer.successor.concern, null);
  assert.equal(answer.successor.standing, SUCCESSOR_STANDING.CONDITIONAL);
});

test('a concern that a safety filter removes still keeps the successor conditional', () => {
  const answer = answerFor({ successor: { ...c3Successor, concern: 'Discontinued in some sizes; see www.example.com' } });
  assert.equal(answer.successor.concern, null);
  assert.equal(answer.successor.standing, SUCCESSOR_STANDING.CONDITIONAL);
  assert.ok(answer.removedClaimTypes.includes('URL'));
  assert.ok(answer.warnings.includes('UNSAFE_CLAIMS_REMOVED'));
});

test('placeholder "no concern" text is not a concern', () => {
  for (const concern of ['none', 'None.', 'N/A', 'unknown', 'null', '', '   ', 5, {}]) {
    const answer = answerFor({ successor: { ...c3Successor, concern } });
    assert.equal(answer.successor.concern, null, String(concern));
    assert.equal(answer.successor.standing, SUCCESSOR_STANDING.RECOMMENDED, String(concern));
  }
});

test('a successor is never more certain than the identification it rests on, and a missing difference is flagged, not invented', () => {
  const answer = answerFor({ ...withOriginal({ confidence: 'medium' }), successor: { ...c3Successor, differences: null, confidence: 'high' } });
  assert.equal(answer.successor.confidence, 'medium');
  assert.equal(answer.successor.differences, null);
  assert.ok(answer.warnings.includes('DIFFERENCES_MISSING'));
  const hostile = answerFor({ successor: JSON.parse('{"name":"LG C4 OLED evo","why":"Next generation.","confidence":"__proto__"}') });
  assert.equal(hostile.successor.confidence, 'low');
  assert.equal(hostile.successor.standing, SUCCESSOR_STANDING.CONDITIONAL);
});

// ---------------------------------------------------------------- original-model duplication

test('original-model duplication: a "successor" that is the original or an exact variant of it is dropped', () => {
  for (const name of ['LG C3 OLED TV', 'lg c3 oled tv', 'LG C3 series OLED evo TV (2023)', 'LG OLED65C3PUA', 'LG OLED C3 evo']) {
    const answer = answerFor({ successor: { ...c3Successor, name } });
    assert.equal(answer.successor, null, name);
    assert.equal(answer.status, 'OK', 'the alternatives still make a usable answer');
  }
});

test('original-model duplication: a genuine next generation is not mistaken for the original', () => {
  for (const [query, identity, name] of [
    [QUERY, 'LG C3 series OLED evo TV (2023)', 'LG C4 OLED evo'],
    ['Samsung S90C QD-OLED', 'Samsung S90C QD-OLED TV', 'Samsung S90D QD-OLED'],
    ['Sony A80L OLED', 'Sony Bravia A80L OLED', 'Sony Bravia 8 OLED'],
  ]) {
    const answer = answerFor({ ...withOriginal({ identity }), successor: { ...c3Successor, name }, suggestions: [] }, query);
    assert.equal(answer.successor?.name, name, name);
  }
});

test('original-model duplication: the alternatives never repeat the original', () => {
  const answer = answerFor({ suggestions: [{ name: 'LG OLED55C3PUA', why: 'Same set.' }, ...crossBrand] });
  assert.deepEqual(answer.suggestions.map((item) => item.name), crossBrand.map((item) => item.name));
});

test('original-model duplication: an alternative repeating the successor, by name or by model code, is dropped', () => {
  const answer = answerFor({
    suggestions: [
      { name: 'lg c4 oled EVO', why: 'Same as the successor by name.' },
      { name: 'LG OLED65C4PUA', why: 'Same as the successor by model code.' },
      ...crossBrand.slice(0, 2),
    ],
  });
  assert.equal(answer.successor.name, 'LG C4 OLED evo');
  assert.deepEqual(answer.suggestions.map((item) => item.name), ['Samsung S90 series QD-OLED', 'Sony Bravia 8 OLED']);
});

test('original-model duplication: a dropped successor does not hide an alternative that carries its code', () => {
  const answer = answerFor({ successor: { ...c3Successor, name: 'LG C3 OLED TV' }, suggestions: [{ name: 'LG C4 OLED evo', why: 'Next generation of the same line.', differences: 'Brighter.', confidence: 'high' }] });
  assert.equal(answer.successor, null);
  assert.deepEqual(answer.suggestions.map((item) => item.name), ['LG C4 OLED evo']);
});

// ---------------------------------------------------------------- cross-brand alternatives

test('cross-brand alternatives: up to three are kept beside the successor, and the successor does not use up a slot', () => {
  const answer = answerFor({ suggestions: [...crossBrand, { name: 'Hisense U8 series Mini-LED', why: 'Fourth alternative.' }] });
  assert.equal(LIMITS.maxSuggestions, 3);
  assert.equal(answer.suggestions.length, 3);
  assert.ok(answer.successor);
  assert.deepEqual(answer.suggestions.map((item) => item.name.split(' ')[0]), ['Samsung', 'Sony', 'Panasonic']);
  assert.ok(answer.suggestions.every((item) => item.unverified === true));
});

test('cross-brand alternatives: they survive an unknown successor and a conditional one', () => {
  for (const successor of [null, { ...c3Successor, concern: 'No 42-inch size.' }]) {
    const answer = answerFor({ successor });
    assert.deepEqual(answer.suggestions.map((item) => item.name), crossBrand.map((item) => item.name));
  }
});

// ---------------------------------------------------------------- claims and cleaning apply to the successor too

test('the successor cannot carry links, prices, retailers, stock or availability claims', () => {
  const unsafe = [
    ['name', 'LG C4 at www.example.com', 'URL'],
    ['why', 'Priced at $1,299 for 65 inches.', 'PRICE'],
    ['why', 'Currently available at Best Buy.', 'AVAILABILITY'],
    ['why', 'Now in production and widely available.', 'AVAILABILITY'],
    ['why', 'Released in 2024 as the next model.', 'LIFECYCLE'],
  ];
  for (const [field, text, claim] of unsafe) {
    const answer = answerFor({ successor: { ...c3Successor, [field]: text } });
    assert.equal(answer.successor, null, text);
    assert.ok(answer.removedClaimTypes.includes(claim), `${text} -> ${claim}`);
  }
  const optional = answerFor({ successor: { ...c3Successor, differences: 'Sold at Walmart for less.' } });
  assert.equal(optional.successor.differences, null);
  assert.ok(optional.removedClaimTypes.includes('RETAILER') || optional.removedClaimTypes.includes('PRICE'));
});

test('successor text is cleaned and length-limited like every other field', () => {
  const long = 'x'.repeat(400);
  const answer = answerFor({ successor: { name: `<b>LG   C4</b> OLED ${long}`, why: `**Next** generation ${long}`, differences: long, concern: long, confidence: 'HIGH' } });
  assert.ok(answer.successor.name.length <= LIMITS.maxName && !/[<>*]/.test(answer.successor.name));
  assert.ok(answer.successor.why.length <= LIMITS.maxText);
  assert.ok(answer.successor.differences.length <= LIMITS.maxText);
  assert.ok(answer.successor.concern.length <= LIMITS.maxText);
  assert.equal(answer.successor.confidence, 'low', 'unknown label casing is not trusted');
});

test('the successor adds no source, link or price fields to the answer', () => {
  assert.doesNotMatch(JSON.stringify(answerFor()), /"(?:url|link|source|sources|price|retailer|availability)"/i);
});

// ---------------------------------------------------------------- version identifiers

test('version identifiers move so a cache of older answers can be discarded', async () => {
  assert.equal(ANSWER_VERSION, 2);
  assert.equal(QUICK_PROMPT_VERSION, 2);
  assert.equal(QUICK_CACHE_VERSION, 'answer-2.prompt-2');
  assert.equal(answerFor().version, ANSWER_VERSION);
  const { answer, meta } = await getQuickAnswer(QUERY, { apiKey: FAKE_KEY, fetchImpl: okFetch(baseReply) });
  assert.equal(answer.version, ANSWER_VERSION);
  assert.equal(meta.cacheVersion, QUICK_CACHE_VERSION);
  const failed = await getQuickAnswer(QUERY, { apiKey: FAKE_KEY, fetchImpl: mockFetch(() => new Response('{}', { status: 500 })) });
  assert.equal(failed.meta.cacheVersion, QUICK_CACHE_VERSION, 'failures carry it too');
  assert.equal(failed.answer.version, ANSWER_VERSION);
});

// ---------------------------------------------------------------- transport and budget are unchanged

test('still ONE ungrounded Flash-Lite call: minimal thinking, no tools, no retry, the existing 5.5 s timeout', async () => {
  const fetchImpl = okFetch(baseReply);
  const { answer, meta } = await getQuickAnswer(QUERY, { apiKey: FAKE_KEY, fetchImpl });
  assert.equal(answer.successor.name, 'LG C4 OLED evo');
  assert.equal(fetchImpl.calls.length, 1);
  const body = JSON.parse(fetchImpl.calls[0].init.body);
  assert.deepEqual(Object.keys(body).sort(), ['contents', 'generationConfig'], 'no tools entry');
  assert.deepEqual(body.generationConfig.thinkingConfig, { thinkingLevel: 'minimal' });
  assert.equal(body.generationConfig.maxOutputTokens, 1400);
  assert.equal(QUICK_MAX_OUTPUT_TOKENS, 1400);
  assert.equal(meta.model, 'gemini-3.5-flash-lite');
  assert.equal(meta.timeoutMs, 5500);
  assert.match(fetchImpl.calls[0].url, /gemini-3\.5-flash-lite:generateContent$/);
  assert.doesNotMatch(JSON.stringify(body), /googleSearch|google_search|tools/);

  const failing = mockFetch(() => new Response('{}', { status: 500 }));
  const failed = await getQuickAnswer(QUERY, { apiKey: FAKE_KEY, fetchImpl: failing });
  assert.equal(failing.calls.length, 1, 'a provider error is not retried');
  assert.equal(failed.answer.status, 'UNAVAILABLE');
  assert.equal(failed.answer.successor, null);
});

test('a reply that fills every limit, successor included, still fits well inside the output cap', () => {
  const text = (length) => 'x'.repeat(length);
  const full = {
    category: 'tv',
    original: { identity: text(LIMITS.maxIdentity), confidence: 'high', characteristics: Array(LIMITS.maxCharacteristics).fill(text(LIMITS.maxText)), uncertainty: text(LIMITS.maxText) },
    requirements: Array(LIMITS.maxRequirements).fill(text(LIMITS.maxText)),
    successor: { name: text(LIMITS.maxName), why: text(LIMITS.maxText), differences: text(LIMITS.maxText), concern: text(LIMITS.maxText), confidence: 'medium' },
    suggestions: Array(LIMITS.maxSuggestions).fill({ name: text(LIMITS.maxName), why: text(LIMITS.maxText), differences: text(LIMITS.maxText), confidence: 'medium' }),
    clarify: Array(LIMITS.maxClarify).fill(text(LIMITS.maxQuestion)),
  };
  // About 3.6 characters per token (the ratio behind the "~800-900 tokens" worst case before the successor field), JSON keys
  // included. The cap must also leave room for minimal thinking.
  const estimatedTokens = Math.ceil(JSON.stringify(full).length / 3.6);
  assert.ok(estimatedTokens <= QUICK_MAX_OUTPUT_TOKENS - 250, `worst case is about ${estimatedTokens} tokens`);
});
