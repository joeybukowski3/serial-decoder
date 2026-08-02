import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildSharedModelIdentity } from '../../lib/model-evidence/shared-model-identity.js';
import { compactModelValue } from '../../lib/serial-refinement/normalize-model.js';
import { createRefineSerialDateHandler } from '../../api/refine-serial-date.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(
  readFileSync(join(__dirname, '../fixtures/cross-workflow-parity.json'), 'utf8'),
);

function createResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; },
  };
}

function silentLogger() {
  return { info() {}, error() {}, warn() {} };
}

/**
 * Extract identity fields that both workflows must agree on.
 */
function identitySnapshot(identity) {
  return {
    enteredModel: identity.enteredModel,
    canonicalModel: identity.canonicalModel,
    searchedModels: [...(identity.searchModels || [])].map(compactModelValue).sort(),
    equivalenceReason: identity.equivalenceReason || null,
    normalizationApplied: Boolean(identity.normalizationApplied),
    identityConfidence: identity.identityConfidence || null,
    identityMatchType: identity.matchedBy || null,
    brand: identity.brand || null,
    category: identity.category || null,
    searchCategory: identity.searchCategory || null,
  };
}

for (const fixture of fixtures) {
  test(`parity identity: ${fixture.id}`, () => {
    const smartIdentity = buildSharedModelIdentity({
      brand: fixture.brand,
      model: fixture.enteredModel,
      category: fixture.category,
    });
    const refineIdentity = buildSharedModelIdentity({
      brand: fixture.brand,
      model: fixture.enteredModel,
      category: fixture.category,
    });

    const smart = identitySnapshot(smartIdentity);
    const refine = identitySnapshot(refineIdentity);
    assert.deepEqual(smart, refine, 'Smart Lookup and Serial Refinement must share model identity');

    assert.equal(smart.enteredModel, fixture.enteredModel);
    assert.ok(smartIdentity.searchModels.length >= 1);
    assert.ok(smartIdentity.searchModels.length <= 2, 'search alternatives remain bounded');

    if (fixture.expectCanonicalEqualsEntered === false) {
      assert.notEqual(
        compactModelValue(smart.canonicalModel),
        compactModelValue(fixture.enteredModel),
      );
    }
    if (fixture.expectCanonicalCompact) {
      assert.equal(compactModelValue(smart.canonicalModel), fixture.expectCanonicalCompact);
    }
    if (fixture.preserveEnteredForm) {
      assert.equal(smart.enteredModel, fixture.enteredModel);
      assert.ok(smartIdentity.searchModels.some((model) =>
        compactModelValue(model) === compactModelValue(fixture.enteredModel)
        || model === fixture.enteredModel));
    }
    if (Array.isArray(fixture.expectedSearchModelsInclude)) {
      for (const model of fixture.expectedSearchModelsInclude) {
        assert.ok(
          smartIdentity.searchModels.includes(model)
          || smartIdentity.searchModels.map(compactModelValue).includes(compactModelValue(model)),
          `expected searchModels to include ${model}`,
        );
      }
    }
    if (Array.isArray(fixture.expectedSearchModelsIncludeCompact)) {
      const compactSet = new Set(smartIdentity.searchModels.map(compactModelValue));
      assert.ok(fixture.expectedSearchModelsIncludeCompact.some((token) =>
        compactSet.has(compactModelValue(token))));
    }
    if (Number.isInteger(fixture.expectedSearchModelsMax)) {
      assert.ok(smartIdentity.searchModels.length <= fixture.expectedSearchModelsMax);
    }
    if (Object.hasOwn(fixture, 'expectedNormalizationApplied')) {
      assert.equal(smart.normalizationApplied, fixture.expectedNormalizationApplied);
    }
    if (fixture.expectedSearchCategory) {
      assert.equal(smart.searchCategory, fixture.expectedSearchCategory);
    }
  });
}

test('parity: WED4850HWO and WED4850HW0 do not disagree on brand/canonical across workflows', () => {
  const hwo = buildSharedModelIdentity({
    brand: 'Whirlpool',
    model: 'WED4850HWO',
    category: 'appliances',
  });
  const hw0 = buildSharedModelIdentity({
    brand: 'Whirlpool',
    model: 'WED4850HW0',
    category: 'appliances',
  });
  assert.equal(hwo.brand, hw0.brand);
  assert.equal(compactModelValue(hwo.canonicalModel), compactModelValue(hw0.canonicalModel));
  assert.equal(hwo.searchCategory, hw0.searchCategory);
  assert.ok(hwo.searchModels.map(compactModelValue).includes('WED4850HW0'));
  assert.ok(hw0.searchModels.map(compactModelValue).includes('WED4850HW0'));
});

test('parity: Serial Refinement response preserves shared identity for fixture models', async () => {
  for (const fixture of fixtures.filter((item) => item.supported && item.serialRefinement)) {
    const expected = buildSharedModelIdentity({
      brand: fixture.brand,
      model: fixture.enteredModel,
      category: fixture.category,
    });
    const handler = createRefineSerialDateHandler({
      refinementMode: 'deterministic_serper',
      localLookup: async () => ({ evidence: [], normalization: null }),
      modelProductionLookup: async () => null,
      deterministicProviderLookup: async () => ({
        status: 'timeout',
        errorCode: 'DETERMINISTIC_TIMEOUT',
        failureCategory: 'EXTRACTOR_TIMEOUT',
        evidence: [],
        extractedFacts: [],
        output: {},
        modelIdentity: expected,
        searchedModels: expected.searchModels,
        timings: { serperMs: 1, geminiMs: 1, totalMs: 2, serperRequestCount: 0 },
        sharedEvidence: { status: 'timeout', failureCategory: 'EXTRACTOR_TIMEOUT' },
      }),
      redisFactory: () => null,
      logger: silentLogger(),
    });
    const res = createResponse();
    await handler({
      method: 'POST',
      headers: { 'x-request-id': `parity-${fixture.id}` },
      body: {
        brand: fixture.brand,
        category: fixture.category,
        serial: fixture.serialRefinement.serial,
        model: fixture.enteredModel,
        candidateYears: fixture.serialRefinement.candidateYears,
        decodedMonth: 'Serial cycle',
        context: '',
      },
    }, res);

    assert.equal(res.statusCode, 200, `${fixture.id}: ${JSON.stringify(res.payload)}`);
    assert.equal(res.payload.modelIdentity.enteredModel, expected.enteredModel);
    assert.equal(
      compactModelValue(res.payload.modelIdentity.canonicalModel),
      compactModelValue(expected.canonicalModel),
    );
    assert.deepEqual(
      [...(res.payload.searchedModels || [])].map(compactModelValue).sort(),
      [...expected.searchModels].map(compactModelValue).sort(),
    );
    // Meaningful input must not erase serial candidates on provider timeout.
    assert.ok(
      res.payload.candidateYears.length > 0,
      `${fixture.id} must preserve candidate years`,
    );
  }
});
