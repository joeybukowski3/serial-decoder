import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendWithResearch } from '../../lib/replacement-discovery/live-recommend.js';
import { createGroundedResearchProvider } from '../../lib/replacement-discovery/providers/grounded-research-provider.js';
import { createMockTransport } from '../fixtures/replacement-discovery/mock-transport.mjs';
import * as tv from '../fixtures/replacement-discovery/grounded-tv-research.mjs';
import * as fridge from '../fixtures/replacement-discovery/grounded-refrigerator-research.mjs';

const run = (query, spec, notes = '') => recommendWithResearch({ query, notes, researchProvider: createGroundedResearchProvider({ transport: createMockTransport(spec) }) });
const tvRun = (candidates, notes = '', original = tv.tvOriginalResearchExact) => run('Samsung QN55Q80C', { original, candidates: { candidates }, grounding: tv.tvGrounding }, notes);
const fridgeRun = (candidates, notes = '', query = 'LG LRSOC2506S side by side refrigerator') => run(query, { original: fridge.fridgeOriginalResearch, candidates: { candidates }, grounding: fridge.fridgeGrounding }, notes);
const modelOf = (item) => item.candidate.identity.facts.model?.value;
const claim = (value, model, domain) => ({ value, sources: [domain], subjectModel: model });

test('an exact-model TV with manufacturer-backed research and no fit constraint now reaches LKQ with a VERIFY_FIT advisory', async () => {
  const result = await tvRun([tv.currentQled55, tv.crossBrand]);
  const primary = result.primaryRecommendation;
  assert.equal(modelOf(primary), 'QN55Q80D');
  assert.equal(primary.classification, 'LKQ');
  assert.ok(['HIGH', 'MEDIUM'].includes(primary.confidence));
  assert.equal(primary.fitAssessment.status, 'ADVISORY');
  assert.equal(primary.fitAssessment.message, 'Not verified — confirm available space before purchase');
  assert.ok(!result.reasonCodes.includes('NO_LKQ_CANDIDATE_FOUND'));
});

test('an exact freestanding refrigerator reaches LKQ / MEDIUM; published dimensions are shown, original dimensions retained', async () => {
  const result = await fridgeRun([fridge.comparableLg, fridge.largerLg, fridge.geAlternative]);
  const primary = result.primaryRecommendation;
  assert.equal(modelOf(primary), 'LRSXC2606S');
  assert.equal(primary.classification, 'LKQ');
  assert.equal(primary.confidence, 'MEDIUM');
  assert.equal(primary.fitAssessment.status, 'ADVISORY');
  assert.deepEqual(primary.fitAssessment.dimensions.replacement, { widthIn: 35.75, heightIn: 69.9, depthIn: 33.5 });
  assert.deepEqual(primary.fitAssessment.dimensions.original, { widthIn: 35.75, heightIn: 69.5, depthIn: 33.5 });
  assert.equal(primary.fitAssessment.dimensions.replacementClearance.clearanceWidthIn, 0.25);
  assert.match(primary.refinementSuggestions.find((item) => item.fieldKey === 'physicalFit').prompt, /opening width, height and depth/);
  const ids = new Set(result.research.evidence.map((record) => record.evidenceId));
  for (const key of ['widthIn', 'heightIn', 'depthIn']) {
    const entry = primary.candidate.identity.facts[key];
    assert.equal(entry.status, 'KNOWN');
    assert.ok(entry.evidenceRefs.every((ref) => ids.has(ref)));
  }
});

test('published dimensions decide fit only against a constraint the user supplied', async () => {
  const fits = await fridgeRun([fridge.comparableLg], 'opening width 36 inches');
  assert.equal(fits.primaryRecommendation.fitAssessment.status, 'VERIFIED');
  assert.equal(fits.primaryRecommendation.classification, 'LKQ');
  assert.equal(fits.primaryRecommendation.confidence, 'MEDIUM');
  const tooNarrow = await fridgeRun([fridge.comparableLg, fridge.largerLg], 'opening width 35.9 inches');
  assert.equal(tooNarrow.primaryRecommendation.classification, 'NOT_LKQ');
  assert.equal(tooNarrow.primaryRecommendation.fitAssessment.status, 'VIOLATION');
  assert.equal(tooNarrow.bestAvailableRecommendation, true);
  assert.ok(tooNarrow.reasonCodes.includes('NO_LKQ_CANDIDATE_FOUND'));
});

test('a mixed pool: the candidate that exceeds the supplied opening is rejected, the one that fits is recommended', async () => {
  const wide = fridge.fridgeCandidate({ model: 'LRSXW2706S', capacity: 26.8, width: 36.5 });
  const result = await fridgeRun([wide, fridge.comparableLg], 'opening width 36 inches');
  assert.equal(modelOf(result.primaryRecommendation), 'LRSXC2606S');
  assert.ok(result.rejectedSummary.some((item) => item.reasonCode === 'KNOWN_HARD_FAILURE'));
});

test('a TV space constraint from the user is enforced against researched dimensions', async () => {
  const tooWide = await tvRun([tv.currentQled55], 'must fit a 40 inch wide cabinet');
  assert.equal(tooWide.primaryRecommendation.classification, 'NOT_LKQ');
  const fits = await tvRun([tv.currentQled55], 'must fit a 50 inch wide cabinet');
  assert.equal(fits.primaryRecommendation.classification, 'LKQ');
  assert.equal(fits.primaryRecommendation.fitAssessment.status, 'VERIFIED');
});

test('required mount reuse is checked against researched VESA patterns; without the requirement a mismatch is ignored', async () => {
  const sameMount = tv.tvCandidate({ model: 'QN55Q80D', mount: '300x300', relationship: 'DIRECT_SUCCESSOR', relationshipSources: ['samsung.com'], relatedModel: 'QN55Q80C' });
  const otherMount = tv.tvCandidate({ model: 'QN55Q80D', mount: '400x400', relationship: 'DIRECT_SUCCESSOR', relationshipSources: ['samsung.com'], relatedModel: 'QN55Q80C' });
  const notes = 'must reuse existing wall mount';
  assert.equal((await tvRun([sameMount], notes)).primaryRecommendation.fitAssessment.status, 'VERIFIED');
  assert.equal((await tvRun([otherMount], notes)).primaryRecommendation.classification, 'NOT_LKQ');
  const relaxed = await tvRun([otherMount]);
  assert.equal(relaxed.primaryRecommendation.classification, 'LKQ');
  assert.equal(relaxed.primaryRecommendation.fitAssessment.status, 'ADVISORY');
});

test('a built-in refrigerator with no known envelope is still returned but UNCONFIRMED, with the fit question first', async () => {
  const builtIn = (candidate) => ({ ...candidate, facts: { ...candidate.facts, installationType: claim('built-in', candidate.model, 'lg.com') } });
  const spec = { original: { original: { ...fridge.fridgeOriginalResearch.original, facts: { ...fridge.fridgeOriginalResearch.original.facts, installationType: claim('built-in', 'LRSOC2506S', 'lg.com') } } }, candidates: { candidates: [builtIn(fridge.comparableLg)] }, grounding: fridge.fridgeGrounding };
  const result = await run('LG LRSOC2506S side by side refrigerator', spec);
  assert.ok(result.primaryRecommendation);
  assert.equal(result.primaryRecommendation.classification, 'UNCONFIRMED');
  assert.equal(result.primaryRecommendation.fitAssessment.intrinsic, true);
  assert.deepEqual([result.refinementSuggestions[0].fieldKey, result.refinementSuggestions[0].priority], ['physicalFit', 1]);
});

test('the provider can report dimensions but can never claim that a product fits', async () => {
  const claimsFit = { ...tv.currentQled55, facts: { ...tv.currentQled55.facts, physicalFit: claim(true, 'QN55Q80D', 'samsung.com') }, fits: true, fitVerdict: 'FITS_PERFECTLY' };
  const result = await tvRun([claimsFit], 'must fit a 40 inch wide cabinet');
  const primary = result.primaryRecommendation;
  assert.ok(!('physicalFit' in primary.candidate.identity.facts));
  assert.equal(primary.classification, 'NOT_LKQ');
  assert.equal(primary.fitAssessment.status, 'VIOLATION');
  const unsupported = result.research.warnings.find((item) => item.code === 'UNSUPPORTED_FIELDS_IGNORED');
  const policy = result.research.warnings.find((item) => item.code === 'PROVIDER_POLICY_FIELDS_IGNORED');
  assert.deepEqual(unsupported.fields, ['physicalFit', 'fits']);
  assert.deepEqual(policy.fields, ['fitVerdict']);
});

test('a bad provider #1 is still overridden by the deterministic HARD size rule', async () => {
  const result = await tvRun([tv.smaller50, tv.currentQled55]);
  assert.equal(modelOf(result.primaryRecommendation), 'QN55Q80D');
  assert.ok(result.rejectedSummary.some((item) => item.reasonCode === 'KNOWN_HARD_FAILURE'));
  const only = await tvRun([tv.smaller50]);
  assert.equal(only.primaryRecommendation.classification, 'NOT_LKQ');
});
