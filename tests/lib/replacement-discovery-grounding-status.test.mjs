import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendWithResearch } from '../../lib/replacement-discovery/live-recommend.js';
import { createGroundedResearchProvider } from '../../lib/replacement-discovery/providers/grounded-research-provider.js';
import { assessFactGrounding, assessJobGrounding, materialKeys } from '../../lib/replacement-discovery/research-grounding.js';
import { televisionProfile } from '../../lib/replacement-core/profiles/television.js';
import { validateCandidateResearch } from '../../lib/replacement-discovery/research-schema.js';
import { createMockTransport, makeGrounding } from '../fixtures/replacement-discovery/mock-transport.mjs';
import * as tv from '../fixtures/replacement-discovery/grounded-tv-research.mjs';

const run = (grounding, { original = tv.tvOriginalResearchExact, candidates = tv.tvCandidatesResearch, query = 'Samsung QN55Q80C' } = {}) => {
  const transport = createMockTransport({ original, candidates, grounding });
  return recommendWithResearch({ query, researchProvider: createGroundedResearchProvider({ transport, now: () => '2026-10-01T12:00:00.000Z' }) });
};
const shown = (result) => [result.primaryRecommendation, ...result.alternatives.map((item) => item.recommendation)].filter(Boolean);
const researchedFacts = (result) => shown(result).flatMap((item) => Object.entries(item.candidate.identity.facts).filter(([key, entry]) => !['category'].includes(key) && entry.basis !== 'DISCOVERY_CONTEXT'));

test('A. real grounding metadata: evidence resolves normally and both jobs are GROUNDED', async () => {
  const result = await run(tv.tvGrounding);
  assert.equal(result.research.grounding.original.status, 'GROUNDED');
  assert.equal(result.research.grounding.candidates.status, 'GROUNDED');
  assert.deepEqual(Object.keys(result.research.grounding.candidates).sort(), ['groundedFacts', 'materialFacts', 'sourceCount', 'status']);
  assert.equal(result.research.grounding.candidates.sourceCount, 5);
  assert.equal(result.primaryRecommendation.candidate.source.groundingStatus, 'GROUNDED');
  assert.equal(result.primaryRecommendation.classification, 'LKQ');
  assert.ok(result.research.evidence.some((record) => record.sourceClass === 'MANUFACTURER' && record.url));
  for (const code of ['LIVE_RESEARCH_UNGROUNDED', 'ORIGINAL_RESEARCH_UNGROUNDED', 'PROVISIONAL_UNSOURCED_RECOMMENDATION']) assert.ok(!result.reasonCodes.includes(code), code);
});

test('B. some candidates grounded and some not: the job is PARTIALLY_GROUNDED, and an ungrounded candidate never outranks the grounded primary', async () => {
  const result = await run(makeGrounding(['samsung.com']));
  assert.equal(result.research.grounding.candidates.status, 'PARTIALLY_GROUNDED');
  const { groundedFacts, materialFacts } = result.research.grounding.candidates;
  assert.ok(groundedFacts > 0 && groundedFacts < materialFacts);
  assert.equal(result.primaryRecommendation.candidate.source.groundingStatus, 'GROUNDED');
  assert.ok(!shown(result).some((item) => item.candidate.identity.facts.brand.value === 'Hisense' && item.candidate.source.groundingStatus === 'GROUNDED'));
  assert.ok(!result.reasonCodes.includes('LIVE_RESEARCH_UNGROUNDED'));
  assert.ok(!result.reasonCodes.includes('PROVISIONAL_UNSOURCED_RECOMMENDATION'), 'the primary itself is grounded');
});

test('B2. one candidate with only some of its facts grounded is PARTIALLY_GROUNDED on its own', async () => {
  const half = { ...tv.currentQled55, facts: { ...tv.currentQled55.facts, refreshHz: { value: 120, sources: ['not-in-grounding.example'], subjectModel: 'QN55Q80D' }, smart: { value: true, sources: [] } } };
  const result = await run(tv.tvGrounding, { candidates: { candidates: [half] } });
  assert.equal(result.primaryRecommendation.candidate.source.groundingStatus, 'PARTIALLY_GROUNDED');
  assert.equal(result.research.grounding.candidates.status, 'PARTIALLY_GROUNDED');
  const facts = result.primaryRecommendation.candidate.identity.facts;
  assert.deepEqual([facts.resolution.status, facts.refreshHz.status, facts.smart.status], ['KNOWN', 'ASSUMED', 'ASSUMED']);
});

test('B3. an all-unsourced candidate under real grounding is UNGROUNDED itself while the job reports the mix', async () => {
  const result = await run(makeGrounding(['samsung.com']), { candidates: { candidates: [tv.crossBrand] } });
  assert.equal(result.primaryRecommendation.candidate.source.groundingStatus, 'UNGROUNDED');
  assert.ok(result.reasonCodes.includes('PROVISIONAL_UNSOURCED_RECOMMENDATION'));
});

test('C. no groundingMetadata: UNGROUNDED, facts stay ASSUMED, reason codes added, and a result is still returned', async () => {
  const result = await run(tv.noGrounding);
  assert.equal(result.research.grounding.original.status, 'UNGROUNDED');
  assert.equal(result.research.grounding.candidates.status, 'UNGROUNDED');
  assert.equal(result.research.grounding.candidates.sourceCount, 0);
  assert.ok(['LIVE_RESEARCH_UNGROUNDED', 'ORIGINAL_RESEARCH_UNGROUNDED', 'PROVISIONAL_UNSOURCED_RECOMMENDATION'].every((code) => result.reasonCodes.includes(code)), JSON.stringify(result.reasonCodes));
  assert.ok(result.primaryRecommendation, 'always-return still holds');
  assert.equal(result.primaryRecommendation.classification, 'UNCONFIRMED');
  assert.equal(result.primaryRecommendation.confidence, 'LOW');
  for (const [key, entry] of researchedFacts(result)) assert.equal(entry.status, 'ASSUMED', key);
  const original = result.originalInterpretation.normalizedOriginal.facts;
  for (const key of ['resolution', 'displayTechnology', 'refreshHz']) assert.equal(original[key].status, 'ASSUMED', key);
  assert.equal(result.primaryRecommendation.candidate.source.groundingStatus, 'UNGROUNDED');
});

test('C2. grounding present but nothing the model claimed resolves against it is still UNGROUNDED', async () => {
  const result = await run(makeGrounding(['some-unrelated-site.example']));
  assert.equal(result.research.grounding.candidates.status, 'UNGROUNDED');
  assert.ok(result.research.grounding.candidates.sourceCount > 0);
  assert.ok(result.reasonCodes.includes('LIVE_RESEARCH_UNGROUNDED'));
});

test('D. the model naming samsung.com in its JSON creates NO manufacturer evidence when grounding is absent', async () => {
  const result = await run(tv.noGrounding);
  assert.ok(result.research.evidence.length > 0);
  assert.ok(result.research.evidence.every((record) => record.sourceClass === 'PROVIDER' && record.firstParty === false && record.url === null && record.sourceRank === 5));
  assert.ok(!result.research.evidence.some((record) => record.sourceClass === 'MANUFACTURER'));
  assert.ok(result.research.evidence.some((record) => record.claim.unresolvedSources?.includes('samsung.com')), 'the claimed domain is recorded as unresolved, never as a source');
});

test('E. two model-claimed domains that map to ONE grounding source create no false corroboration', async () => {
  const doubled = (candidate) => ({ ...candidate, identitySources: ['example.com', 'blog.example.com'], facts: Object.fromEntries(Object.entries(candidate.facts).map(([key, claim]) => [key, { ...claim, sources: ['example.com', 'blog.example.com'] }])) });
  const result = await run(makeGrounding(['blog.example.com']), { candidates: { candidates: [doubled(tv.currentQled55)] } });
  const facts = result.primaryRecommendation.candidate.identity.facts;
  for (const key of ['resolution', 'displayTechnology', 'refreshHz', 'smart']) {
    assert.equal(facts[key].status, 'INFERRED', key);
    assert.notEqual(facts[key].basis, 'CORROBORATED_SOURCES', key);
  }
  assert.ok(!researchedFacts(result).some(([, entry]) => entry.status === 'KNOWN'));
});

test('grounding is judged from evidence resolution, never from provider claims or fact count', () => {
  const evidence = [{ evidenceId: 'g', sourceRank: 1 }, { evidenceId: 'p', sourceRank: 5 }];
  const facts = { model: { status: 'KNOWN', evidenceRefs: ['g'] }, resolution: { status: 'ASSUMED', evidenceRefs: ['p'] }, hdmiCount: { status: 'ASSUMED', evidenceRefs: ['p'] }, category: { status: 'KNOWN', evidenceRefs: [], basis: 'DISCOVERY_CONTEXT' } };
  assert.deepEqual(assessFactGrounding(facts, evidence, televisionProfile), { status: 'PARTIALLY_GROUNDED', material: 2, grounded: 1 });
  assert.equal(assessFactGrounding({}, evidence, televisionProfile).status, 'UNGROUNDED');
  // Defense in depth: even a (hand-built) resolved fact whose only evidence is unsourced provider prose is not grounded.
  const resolvedButUnsourced = { resolution: { status: 'INFERRED', evidenceRefs: ['p'] }, refreshHz: { status: 'KNOWN', evidenceRefs: ['p'] } };
  assert.equal(assessFactGrounding(resolvedButUnsourced, evidence, televisionProfile).status, 'UNGROUNDED');
  assert.equal(assessFactGrounding({ resolution: { status: 'INFERRED', evidenceRefs: ['missing-record'] } }, evidence, televisionProfile).status, 'UNGROUNDED');
  assert.ok(materialKeys(televisionProfile).has('screenSizeIn') && !materialKeys(televisionProfile).has('hdmiCount') && !materialKeys(televisionProfile).has('physicalFit'));
  const job = assessJobGrounding({ sourceCount: 0, factSets: [{ model: { status: 'KNOWN', evidenceRefs: ['g'] } }], evidence, profile: televisionProfile });
  assert.equal(job.status, 'UNGROUNDED', 'no usable grounding metadata is UNGROUNDED even if some fact claims a grounded record');
});

test('category is a context-derived fact: no provider evidence reference, and a wrong category is still rejected', async () => {
  const result = await run(tv.noGrounding);
  for (const item of shown(result)) {
    assert.deepEqual(item.candidate.identity.facts.category, { status: 'KNOWN', value: 'television', evidenceRefs: [], basis: 'DISCOVERY_CONTEXT' });
  }
  const bad = validateCandidateResearch({ candidates: [{ ...tv.currentQled55, category: 'refrigerator' }] }, 'television');
  assert.deepEqual(bad.rejected.map((item) => item.reasonCode), ['WRONG_CATEGORY']);
  const wrong = await run(tv.tvGrounding, { candidates: { candidates: [{ ...tv.currentQled55, category: 'refrigerator' }, tv.crossBrand] } });
  assert.ok(wrong.rejectedSummary.some((item) => item.reasonCode === 'WRONG_CATEGORY'));
  assert.ok(shown(wrong).every((item) => item.candidate.identity.category === 'television'));
});

test('no KNOWN fact is ever backed only by unsourced evidence (the third-smoke audit finding)', async () => {
  for (const grounding of [tv.noGrounding, makeGrounding(['samsung.com']), tv.tvGrounding]) {
    const result = await run(grounding);
    const byId = new Map(result.research.evidence.map((record) => [record.evidenceId, record]));
    for (const item of shown(result)) {
      for (const [key, entry] of Object.entries(item.candidate.identity.facts)) {
        if (entry.status !== 'KNOWN' || !entry.evidenceRefs.length) continue;
        assert.ok(entry.evidenceRefs.some((id) => (byId.get(id)?.sourceRank ?? 5) <= 4), `${key} is KNOWN but only unsourced`);
      }
    }
  }
});
