import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluateReplacement } from '../../lib/replacement-core/evaluate.js';
import { televisionProfile } from '../../lib/replacement-core/profiles/television.js';
import { interpretReplacementSearch } from '../../lib/replacement-discovery/interpret.js';
import { recommendWithResearch } from '../../lib/replacement-discovery/live-recommend.js';
import { createGroundedResearchProvider } from '../../lib/replacement-discovery/providers/grounded-research-provider.js';
import { normalizeCandidateResearch, normalizeOriginalResearch } from '../../lib/replacement-discovery/research-normalizer.js';
import { validateCandidateResearch, validateOriginalResearch } from '../../lib/replacement-discovery/research-schema.js';
import { TV_SIZE_CLASSES, nominalClassOf, splitScreenSize } from '../../lib/replacement-discovery/screen-size-class.js';
import { createMockTransport } from '../fixtures/replacement-discovery/mock-transport.mjs';
import * as tv from '../fixtures/replacement-discovery/grounded-tv-research.mjs';

const cases = JSON.parse(fs.readFileSync(new URL('../fixtures/replacement-core/television-cases.json', import.meta.url)));
const fact = (value, status = 'KNOWN') => ({ status, value, evidenceRefs: ['test'] });
const NOW = '2026-10-01T12:00:00.000Z';

/** Complete TV case: original and candidate both at `nominal`, candidate optionally reporting a measured diagonal. */
function core({ original = 65, candidate = 65, measured = null }) {
  const entry = structuredClone(cases.complete65);
  entry.original.facts.screenSizeIn = fact(original);
  entry.candidate.identity.facts.screenSizeIn = fact(candidate);
  if (measured !== null) entry.candidate.identity.facts.measuredDiagonalIn = fact(measured);
  return evaluateReplacement({ ...entry, profile: televisionProfile });
}
const sizeRow = (result) => result.decision.comparisons.find((row) => row.key === 'screenSizeIn');

test('size classes: a measured diagonal belongs to its own marketed class band, and anything else stays unresolved', () => {
  for (const [measured, nominal] of [[54.6, 55], [55.2, 55], [64.5, 65], [49.5, 50], [74.5, 75], [42.5, 43], [84.6, 85], [54.0, 55], [55.5, 55]]) assert.equal(nominalClassOf(measured), nominal, String(measured));
  for (const measured of [53.0, 52, 56, 56.5, 53.99, 55.6, 61.5, 3, NaN]) assert.equal(nominalClassOf(measured), null, String(measured));
  assert.ok(TV_SIZE_CLASSES.includes(55) && TV_SIZE_CLASSES.includes(65));
});

test('a whole number is the marketed class as stated; only a fraction is treated as a measurement', () => {
  assert.deepEqual(splitScreenSize(50), { nominal: 50, measured: null });
  assert.deepEqual(splitScreenSize(54.6), { nominal: 55, measured: 54.6 });
  assert.deepEqual(splitScreenSize(53.2), { nominal: null, measured: 53.2 });
  assert.deepEqual(splitScreenSize(NaN), { nominal: null, measured: null });
});

test('HARD rule: 55 nominal original vs 55 nominal candidate with a 54.6 measured diagonal passes', () => {
  const result = core({ original: 55, candidate: 55, measured: 54.6 });
  assert.equal(sizeRow(result).assessment, 'MATCH');
  assert.equal(result.decision.hardFailures.length, 0);
  assert.equal(result.classification, 'LKQ');
  assert.equal(sizeRow(result).replacement.value, 55, 'the comparison uses the nominal class');
  assert.equal(result.candidate.identity.facts.measuredDiagonalIn.value, 54.6, 'the measurement is retained as supporting detail');
});

test('HARD rule: 65 nominal vs 65 nominal with a 64.5 measured diagonal passes', () => {
  const result = core({ original: 65, candidate: 65, measured: 64.5 });
  assert.equal(sizeRow(result).assessment, 'MATCH');
  assert.equal(result.classification, 'LKQ');
});

test('HARD rule: a genuinely smaller marketed size still fails (55 vs marketed 50, 65 vs marketed 55)', () => {
  for (const [original, candidate, measured] of [[55, 50, 49.5], [65, 55, 54.6], [55, 50, null]]) {
    const result = core({ original, candidate, measured });
    assert.equal(sizeRow(result).assessment, 'FAIL', `${original} vs ${candidate}`);
    assert.equal(result.classification, 'NOT_LKQ');
    assert.ok(result.decision.hardFailures.some((failure) => failure.key === 'screenSizeIn'));
  }
});

test('HARD rule: a larger marketed class still counts as an upgrade, never a failure', () => {
  assert.equal(sizeRow(core({ original: 55, candidate: 65, measured: 64.5 })).assessment, 'BETTER');
});

test('model-token size: QN55... infers a NOMINAL 55 and QN65... a nominal 65', () => {
  for (const [query, nominal] of [['Samsung QN55Q80C', 55], ['Samsung QN65Q80C', 65], ['Samsung QN55Q80', 55]]) {
    const size = interpretReplacementSearch({ query }).normalizedOriginal.facts.screenSizeIn;
    assert.deepEqual([size.value, size.status, size.basis], [nominal, 'INFERRED', 'MODEL_TOKEN_PATTERN'], query);
  }
});

const candidatesFor = (...entries) => {
  const original = interpretReplacementSearch({ query: 'Samsung QN55Q80C' }).normalizedOriginal;
  const validated = validateCandidateResearch({ candidates: entries }, 'television');
  return normalizeCandidateResearch({ validated, original, grounding: tv.tvGrounding, now: NOW, limit: 6 });
};
const sized = (size, extra = {}) => ({ ...tv.currentQled55, ...extra, facts: { ...tv.currentQled55.facts, screenSizeIn: { value: size, sources: ['samsung.com'], subjectModel: 'QN55Q80D' }, ...(extra.facts || {}) } });

test('research: a measured 54.6 is stored separately; the nominal is a derived INFERENCE, never KNOWN, never the measured value', () => {
  const { drafts, warnings } = candidatesFor(sized(54.6));
  const facts = drafts[0].facts;
  assert.deepEqual([facts.screenSizeIn.value, facts.screenSizeIn.status, facts.screenSizeIn.basis], [55, 'INFERRED', 'NOMINAL_CLASS_FROM_MEASURED']);
  assert.deepEqual([facts.measuredDiagonalIn.value, facts.measuredDiagonalIn.status], [54.6, 'KNOWN']);
  assert.ok(warnings.some((warning) => warning.code === 'MEASURED_DIAGONAL_NORMALIZED' && warning.nominalScreenSizeIn === 55 && warning.measuredDiagonalIn === 54.6));
  assert.notEqual(facts.screenSizeIn.value, 54.6);
});

test('research: a whole-number marketed size is used as stated (its status follows its evidence) and an explicit measurement is kept alongside', () => {
  const { drafts } = candidatesFor(sized(55, { facts: { measuredDiagonalIn: { value: 54.6, sources: ['samsung.com'], subjectModel: 'QN55Q80D' } } }));
  const facts = drafts[0].facts;
  assert.deepEqual([facts.screenSizeIn.value, facts.screenSizeIn.status], [55, 'KNOWN']);
  assert.deepEqual([facts.measuredDiagonalIn.value, facts.measuredDiagonalIn.status], [54.6, 'KNOWN']);
  assert.equal(candidatesFor(sized(50)).drafts[0].facts.screenSizeIn.value, 50);
});

test('research: a measurement matching no single marketed class leaves the nominal UNRESOLVED instead of guessing', () => {
  const { drafts, warnings } = candidatesFor(sized(53.3));
  assert.ok(!('screenSizeIn' in drafts[0].facts));
  assert.equal(drafts[0].facts.measuredDiagonalIn.value, 53.3);
  assert.ok(warnings.some((warning) => warning.code === 'NOMINAL_SIZE_UNRESOLVED'));
});

test('research: a measured diagonal reported only in measuredDiagonalIn still yields a derived nominal; unsourced stays ASSUMED', () => {
  const only = { ...tv.currentQled55, facts: { ...tv.currentQled55.facts, measuredDiagonalIn: { value: 64.5, sources: ['samsung.com'], subjectModel: 'QN55Q80D' } } };
  delete only.facts.screenSizeIn;
  const derived = candidatesFor(only).drafts[0].facts;
  assert.deepEqual([derived.screenSizeIn.value, derived.screenSizeIn.status], [65, 'INFERRED']);
  const unsourced = candidatesFor(sized(54.6, { facts: {} }), tv.unsourcedTv({ model: 'QN55Q85XA', size: 54.6 })).drafts[1].facts;
  assert.deepEqual([unsourced.screenSizeIn.value, unsourced.screenSizeIn.status], [55, 'ASSUMED']);
});

test('research (original side): a measured diagonal for the original never overwrites the nominal from the query', () => {
  const original = interpretReplacementSearch({ query: 'Samsung QN55Q80C' }).normalizedOriginal;
  const raw = { original: { canonicalModel: { value: null, sources: [] }, possibleModels: [], facts: { screenSizeIn: { value: 54.6, sources: ['samsung.com'], subjectModel: 'QN55Q80C' } } } };
  const enrichment = normalizeOriginalResearch({ validated: validateOriginalResearch(raw, 'television'), original, grounding: tv.tvGrounding, now: NOW });
  assert.equal(enrichment.facts.screenSizeIn.value, 55);
  assert.equal(enrichment.facts.measuredDiagonalIn.value, 54.6);
});

const pipeline = (candidates) => recommendWithResearch({
  query: 'Samsung QN55Q80C',
  researchProvider: createGroundedResearchProvider({ transport: createMockTransport({ original: tv.tvOriginalResearchExact, candidates: { candidates }, grounding: tv.tvGrounding }) }),
});

test('end to end: the live-style 54.6 candidate is a 55-inch replacement for a nominal 55 original (no false hard failure)', async () => {
  const result = await pipeline([tv.measuredDiagonalCandidate]);
  const primary = result.primaryRecommendation;
  assert.equal(primary.candidate.identity.facts.screenSizeIn.value, 55);
  assert.equal(primary.candidate.identity.facts.measuredDiagonalIn.value, 54.6);
  assert.equal(sizeRow(primary).assessment, 'MATCH');
  assert.equal(primary.decision.hardFailures.length, 0);
  assert.equal(primary.classification, 'LKQ');
});

test('end to end: marketed 50 (or a 49.5 measured 50-class) still fails against 55; an unresolvable 53.3 is UNVERIFIED, not a silent pass', async () => {
  for (const size of [50, 49.5]) {
    const result = await pipeline([sized(size)]);
    assert.equal(result.primaryRecommendation.classification, 'NOT_LKQ', String(size));
    assert.ok(result.primaryRecommendation.decision.hardFailures.some((failure) => failure.key === 'screenSizeIn'));
  }
  const unresolved = (await pipeline([sized(53.3)])).primaryRecommendation;
  assert.notEqual(unresolved.classification, 'LKQ');
  assert.equal(unresolved.decision.hardFailures.length, 0);
  assert.equal(sizeRow(unresolved).assessment, 'UNVERIFIED');
});
