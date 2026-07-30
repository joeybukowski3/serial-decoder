import assert from 'node:assert/strict';
import test from 'node:test';
import {
  sharedEvidenceToRefinementInput,
  sharedEvidenceToSmartLookupInput,
} from '../../lib/model-evidence/adapters.js';
import { lookupModelEvidence } from '../../lib/model-evidence/service.js';
import {
  buildExtractedFactsCacheKey,
  buildSharedEvidenceCacheKey,
  createDeterministicCache,
} from '../../lib/serial-refinement/deterministic/cache.js';
import { createDeadline } from '../../lib/smart-lookup/deadline.js';

function response(payload) {
  return { ok: true, status: 200, json: async () => payload };
}

function localRecord() {
  return {
    record: {
      brand: 'Test Brand',
      model: 'ABCD1234LONG',
      yearStart: 2018,
      yearEnd: 2021,
    },
    evidence: [{
      title: 'Verified model lifecycle record',
      sourceUrl: 'https://manufacturer.example/ABCD1234LONG',
      productionStart: 2018,
      productionEnd: 2021,
      verified: true,
    }],
    normalization: { usedValidatedAlternative: false },
  };
}

function serperPayload(sourceModel) {
  return {
    organic: [
      {
        position: 1,
        title: `${sourceModel} manufacturer lifecycle`,
        link: 'https://manufacturer.example/model',
        snippet: `${sourceModel} lifecycle information for 2019.`,
        date: '2019-03-01',
      },
      {
        position: 2,
        title: `${sourceModel} supporting document`,
        link: 'https://documents.example/model',
        snippet: `${sourceModel} documentation.`,
        date: '2019-04-01',
      },
      {
        position: 3,
        title: `${sourceModel} specifications`,
        link: 'https://specifications.example/model',
        snippet: `${sourceModel} specifications.`,
        date: '2019-05-01',
      },
    ],
  };
}

function geminiPayload(extractedEvidence) {
  return {
    candidates: [{
      finishReason: 'STOP',
      content: {
        parts: [{ text: JSON.stringify({ extractedEvidence }) }],
      },
    }],
  };
}

async function webLookup(sourceModel, extractedEvidence) {
  return lookupModelEvidence({
    brand: 'Test Brand',
    model: 'ABCD1234LONG',
    category: 'appliance',
    purpose: 'test',
  }, {
    localLookup: async () => null,
    serperApiKey: 'serper-test-key',
    geminiApiKey: 'gemini-test-key',
    serperFetchImpl: async () => response(serperPayload(sourceModel)),
    geminiFetchImpl: async () => response(geminiPayload(extractedEvidence)),
  });
}

test('both consumers receive the same normalized exact-model facts', async () => {
  const options = {
    localLookup: async () => localRecord(),
  };
  const refinement = await lookupModelEvidence({
    brand: 'Test Brand',
    model: 'ABCD1234LONG',
    purpose: 'model_refinement',
    requestContext: { consumer: 'model_refinement', localOnly: true },
  }, options);
  const smart = await lookupModelEvidence({
    brand: 'Test Brand',
    model: 'ABCD1234LONG',
    purpose: 'smart_lookup',
    requestContext: { consumer: 'smart_lookup', localOnly: true },
  }, options);

  assert.deepEqual(refinement.facts, smart.facts);
  assert.deepEqual(refinement.lifecycle, smart.lifecycle);
  assert.equal(refinement.matchedIdentity.matchType, 'exact');
  assert.equal(smart.matchedIdentity.matchType, 'exact');
  assert.equal(sharedEvidenceToRefinementInput(refinement).length, 2);
  assert.equal(sharedEvidenceToSmartLookupInput(smart, {
    brand: 'Test Brand',
    genericCategory: 'appliance',
  }).productionRange.basis, 'exact-model-lifecycle-evidence');
});

test('deterministic identity remains authoritative for exact, variant, family, and mismatch sources', async () => {
  const cases = [
    ['ABCD1234LONG', 'exact'],
    ['ABCD1234LONX', 'variant'],
    ['ABCD123', 'family'],
    ['ZZZZ9999', 'mismatch'],
  ];
  for (const [sourceModel, expected] of cases) {
    const result = await webLookup(sourceModel, [{
      resultIndex: 0,
      exactModelMatch: true,
      suggestedMatchType: 'exact',
      sourceType: 'manufacturer',
      approximateYear: 2019,
      dateMeaning: 'production_start',
      claimText: 'The extractor suggests exact identity.',
      extractionConfidence: 'high',
    }]);
    assert.equal(result.facts[0].identity.effectiveMatchType, expected);
    assert.equal(result.matchedIdentity.matchType, expected);
    assert.equal(result.matchedIdentity.deterministicExact, expected === 'exact');
  }
});

test('publication dates stay source-only while explicit lifecycle bounds are preserved', async () => {
  const result = await webLookup('ABCD1234LONG', [
    {
      resultIndex: 0,
      exactModelMatch: true,
      sourceType: 'review',
      approximateYear: 2025,
      dateMeaning: 'review_published',
      claimText: 'A review was published in 2025.',
    },
    {
      resultIndex: 1,
      exactModelMatch: true,
      sourceType: 'manufacturer',
      approximateYear: 2018,
      dateMeaning: 'production_start',
      claimText: 'Production began in 2018.',
    },
    {
      resultIndex: 2,
      exactModelMatch: true,
      sourceType: 'manufacturer',
      approximateYear: 2021,
      dateMeaning: 'production_end',
      claimText: 'Production ended in 2021.',
    },
  ]);

  const review = result.facts.find((item) => item.fact.eventType === 'review_publication');
  assert.equal(review.fact.target, 'source_only');
  assert.equal(result.lifecycle.supportedProductionStartYear, 2018);
  assert.equal(result.lifecycle.supportedProductionEndYear, 2021);
});

test('mismatch facts cannot affect lifecycle aggregation', async () => {
  const result = await webLookup('ZZZZ9999', [{
    resultIndex: 0,
    exactModelMatch: true,
    sourceType: 'manufacturer',
    approximateYear: 2024,
    dateMeaning: 'production_end',
    claimText: 'A different model ended production in 2024.',
  }]);

  assert.equal(result.matchedIdentity.matchType, 'mismatch');
  assert.equal(result.lifecycle.supportedProductionEndYear, null);
  assert.equal(sharedEvidenceToRefinementInput(result)[0].modelMatchType, 'mismatch');
  assert.equal(sharedEvidenceToSmartLookupInput(result, {}), null);
});

test('provider timeout returns verified local evidence as the best available result', async () => {
  const deadline = createDeadline({ totalMs: 25 });
  const result = await lookupModelEvidence({
    brand: 'Test Brand',
    model: 'ABCD1234LONG',
    purpose: 'smart_lookup',
    deadline,
  }, {
    localLookup: async () => localRecord(),
    serperApiKey: 'serper-test-key',
    geminiApiKey: 'gemini-test-key',
    serperFetchImpl: async () => new Promise(() => {}),
  });

  assert.equal(result.status, 'partial');
  assert.equal(result.matchedIdentity.deterministicExact, true);
  assert.equal(result.lifecycle.supportedProductionStartYear, 2018);
  assert.equal(result.lifecycle.supportedProductionEndYear, 2021);
  assert.ok(['SERPER_TIMEOUT', 'GLOBAL_BUDGET_EXHAUSTED'].includes(result.failureCategory));
});

test('invalid extractor output is classified and cannot be cached as successful evidence', async () => {
  const result = await lookupModelEvidence({
    brand: 'Test Brand',
    model: 'ABCD1234LONG',
    purpose: 'smart_lookup',
  }, {
    localLookup: async () => null,
    serperApiKey: 'serper-test-key',
    geminiApiKey: 'gemini-test-key',
    serperFetchImpl: async () => response(serperPayload('ABCD1234LONG')),
    geminiFetchImpl: async () => response({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'not json' }] } }],
    }),
  });
  assert.equal(result.status, 'partial');
  assert.equal(result.failureCategory, 'EXTRACTOR_SCHEMA_INVALID');

  let writes = 0;
  const cache = createDeterministicCache({
    redis: { set: async () => { writes += 1; } },
  });
  await cache.setSharedEvidence({
    brand: 'Test Brand',
    model: 'ABCD1234LONG',
    category: 'appliance',
  }, result);
  assert.equal(writes, 0);
});

test('shared cache identity excludes consumer purpose and serial candidate ordering', () => {
  const base = {
    brand: 'Test Brand',
    model: 'ABCD-1234-LONG',
    category: 'appliance',
    geminiModel: 'gemini-test',
    extractorProvider: 'gemini',
  };
  assert.equal(
    buildSharedEvidenceCacheKey({
      ...base,
      purpose: 'model_refinement',
      candidateYears: [2001, 2011, 2021],
    }),
    buildSharedEvidenceCacheKey({
      ...base,
      purpose: 'smart_lookup',
      candidateYears: [2021, 2001, 2011],
    }),
  );

  const evidenceItems = [{ title: 'A', snippet: 'B', domain: 'example.test' }];
  assert.notEqual(
    buildExtractedFactsCacheKey({ ...base, evidenceItems }),
    buildExtractedFactsCacheKey({ ...base, evidenceItems: [{ ...evidenceItems[0], snippet: 'Changed' }] }),
  );
});
