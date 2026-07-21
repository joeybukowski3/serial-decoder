import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Same IIFE-extraction pattern as ui-copy.test.mjs (kept in a separate file
// so this suite's focus -- progressive-specificity rendering -- stays
// distinct from the existing outcome-bucket regression matrix).
function loadSmartLookupController() {
  const ctx = {
    console,
    setTimeout: (fn) => { fn(); return 0; },
    clearTimeout: () => {},
    fetch: async () => ({ ok: false, status: 0, json: async () => ({}) }),
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
    document: {
      readyState: 'complete',
      addEventListener: () => {},
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
      createElement: () => ({
        value: '', textContent: '', innerHTML: '',
        classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
        appendChild: () => {}, addEventListener: () => {}, removeEventListener: () => {},
        setAttribute: () => {}, getAttribute: () => null, querySelector: () => null,
        querySelectorAll: () => [], closest: () => null, focus: () => {}, select: () => {},
      }),
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);

  const source = fs.readFileSync('src/browser/smart-lookup-controller.js', 'utf8').replace(/\r\n/g, '\n');
  const openMarker = "(function () {\n  'use strict';\n";
  const closeMarker = '\n}());\n';
  if (!source.startsWith(openMarker) || !source.endsWith(closeMarker)) {
    throw new Error('smart-lookup-controller.js IIFE wrapper markers changed; update the test loader.');
  }
  const body = source.slice(openMarker.length, source.length - closeMarker.length);
  const wrapped = `(function () {\n${body}\n
    globalThis.__smartLookupTestApi = {
      classifyAgeOutcome, copyForAgeOutcome, AGE_OUTCOME_COPY, renderAge, escapeHtml,
      sourceQualifier, isGroundedProviderResult, isGroundedTimeoutFallbackResult,
      isDeterministicDegradedResult, isUngroundedProviderResult,
    };
  }());`;
  vm.runInContext(wrapped, ctx);
  return ctx.__smartLookupTestApi;
}

const api = loadSmartLookupController();

function familyResult(overrides = {}) {
  return {
    brand: 'Acer',
    productFamily: 'Nitro 5',
    querySpecificity: 'product-family',
    precisionLevel: 'family-range',
    recognizedFamily: 'Nitro 5',
    yearContext: { type: 'market-introduction', value: 2017, label: 'Family launched', isExactUnitDate: false },
    recommendedIdentifiers: [
      'Enter the complete model number beginning with AN515.',
      'The configuration suffix narrows the result to one exact build.',
    ],
    notes: 'Acer Nitro 5 is a recognized product family, not one exact configuration.',
    ...overrides,
  };
}

test('broad family heading renders and classifies as success (usable year context)', () => {
  const data = familyResult();
  assert.equal(api.classifyAgeOutcome(data), 'success');
});

test('broad product-family estimate badge and explanation render in renderAge output', () => {
  const html = api.renderAge(familyResult());
  assert.match(html, /Broad product-family estimate/);
  assert.match(html, /overall family rather than one exact configuration/);
});

test('concrete refinement guidance renders as a bulleted list, not the generic single sentence', () => {
  const html = api.renderAge(familyResult());
  assert.match(html, /To narrow this result/);
  assert.match(html, /AN515/);
  assert.doesNotMatch(html, /Try again, or add more item details\./);
});

test('a supported range renders (2017) rather than a fabricated midpoint/end year', () => {
  const html = api.renderAge(familyResult());
  assert.match(html, />2017</);
});

test('exact-model result UI remains unchanged (no precision badge, single refinementSuggestion line)', () => {
  const html = api.renderAge({
    brand: 'Acer',
    exactModel: 'AN515-58-57Y8',
    querySpecificity: 'exact-model',
    precisionLevel: undefined,
    yearContext: { type: 'market-introduction', value: 2022, label: 'Marketplace introduction year', isExactUnitDate: false },
    refinementSuggestion: 'Use the serial number for unit-specific manufacture dating.',
  });
  assert.doesNotMatch(html, /smart-lookup-precision-badge/);
  assert.match(html, /Use the serial number for unit-specific manufacture dating\./);
});

test('brand-category query gets dedicated broad-guidance copy instead of a generic "more details" card', () => {
  const data = {
    brand: 'Whirlpool',
    category: 'washer',
    querySpecificity: 'brand-category',
    notes: 'Whirlpool produces multiple washer product generations, so a brand-only search cannot establish an individual manufacture date.',
    refinementSuggestion: 'Enter the complete model number from the product label for model-level timing.',
  };
  const bucket = api.classifyAgeOutcome(data);
  assert.equal(bucket, 'brand-category-recognized');
  const copy = api.copyForAgeOutcome(bucket, data);
  assert.equal(copy.body, data.notes);
  assert.notEqual(copy.heading, api.AGE_OUTCOME_COPY['missing-input'].heading);
});

test('unusable query gets a clarification card, not "brand needed"/"serial-only" copy', () => {
  const data = { querySpecificity: 'unusable', notes: "We couldn't identify a physical product from this search." };
  const bucket = api.classifyAgeOutcome(data);
  assert.equal(bucket, 'unusable-query');
  const copy = api.copyForAgeOutcome(bucket, data);
  assert.doesNotMatch(copy.body, /[Ss]erial numbers are brand-specific/);
});

test('ungrounded broad family result has no sources block', () => {
  const html = api.renderAge(familyResult({ evidenceSource: 'heuristic', source: 'static' }));
  assert.doesNotMatch(html, /Web sources consulted/);
});

test('no raw provider text (errorCode, provider name literals) leaks into the family card', () => {
  const html = api.renderAge(familyResult());
  assert.doesNotMatch(html, /PROVIDER_TIMEOUT|BUDGET_STORE_UNAVAILABLE|gemini-grounded|groq-ungrounded/);
});

// ── Regression case 7: grounded / AI-fallback / deterministic-fallback /
//    clarification wording are mutually exclusive ──────────────────────────

function groundedSuccessResult() {
  return familyResult({
    evidenceSource: 'gemini-grounded',
    source: 'gemini',
    sources: [{ title: 'Acer', domain: 'acer.com', uri: 'https://www.acer.com/nitro-5' }],
    retrievedAt: '2026-01-01T00:00:00.000Z',
    groundedFallback: false,
    fallbackKind: 'none',
  });
}

function aiFallbackResult() {
  return familyResult({
    evidenceSource: 'gemini-ungrounded',
    source: 'gemini',
    groundedFallback: true,
    fallbackKind: 'ungrounded-provider',
  });
}

function deterministicDegradedResult() {
  return familyResult({
    evidenceSource: 'heuristic',
    source: 'static',
    groundedFallback: false,
    fallbackKind: 'deterministic-family',
  });
}

function deterministicModelLineDegradedResult() {
  return familyResult({
    evidenceSource: 'heuristic',
    source: 'static',
    groundedFallback: false,
    fallbackKind: 'deterministic-model-line',
  });
}

function deterministicBrandCategoryDegradedResult() {
  return familyResult({
    brand: 'Whirlpool',
    productFamily: null,
    recognizedFamily: null,
    evidenceSource: 'heuristic',
    source: 'static',
    groundedFallback: false,
    fallbackKind: 'deterministic-brand-category',
  });
}

test('grounded success is classified as grounded only', () => {
  const data = groundedSuccessResult();
  assert.equal(api.isGroundedProviderResult(data), true);
  assert.equal(api.isGroundedTimeoutFallbackResult(data), false);
  assert.equal(api.isDeterministicDegradedResult(data), false);
});

test('AI-assisted timeout recovery is classified as the AI-fallback case only', () => {
  const data = aiFallbackResult();
  assert.equal(api.isGroundedProviderResult(data), false);
  assert.equal(api.isGroundedTimeoutFallbackResult(data), true);
  assert.equal(api.isDeterministicDegradedResult(data), false);
});

test('deterministic-family degradation is classified as the deterministic-degraded case only', () => {
  const data = deterministicDegradedResult();
  assert.equal(api.isGroundedProviderResult(data), false);
  assert.equal(api.isGroundedTimeoutFallbackResult(data), false);
  assert.equal(api.isDeterministicDegradedResult(data), true);
});

test('grounded wording, AI-fallback wording, and deterministic-fallback wording are all textually distinct', () => {
  const groundedText = api.sourceQualifier(groundedSuccessResult());
  const aiFallbackText = api.sourceQualifier(aiFallbackResult());
  const deterministicText = api.sourceQualifier(deterministicDegradedResult());

  // Grounded success claims live research.
  assert.match(groundedText, /grounded in live Google Search/i);
  // AI fallback claims AI-assisted research that did not finish verifying.
  assert.match(aiFallbackText, /AI-assisted model research completed/i);
  // Deterministic degradation must NOT claim AI involvement or grounded
  // research at all.
  assert.doesNotMatch(deterministicText, /AI-assisted/i);
  assert.doesNotMatch(deterministicText, /grounded in live Google Search/i);
  assert.match(deterministicText, /live research did not finish/i);

  // All three are textually distinct from one another.
  assert.notEqual(groundedText, aiFallbackText);
  assert.notEqual(groundedText, deterministicText);
  assert.notEqual(aiFallbackText, deterministicText);
});

test('deterministic-family, deterministic-model-line, and deterministic-brand-category each get tier-specific wording', () => {
  const familyText = api.sourceQualifier(deterministicDegradedResult());
  const modelLineText = api.sourceQualifier(deterministicModelLineDegradedResult());
  const brandCategoryText = api.sourceQualifier(deterministicBrandCategoryDegradedResult());

  assert.match(familyText, /product family/i);
  assert.match(modelLineText, /model line/i);
  assert.match(brandCategoryText, /brand and category/i);

  assert.notEqual(familyText, modelLineText);
  assert.notEqual(familyText, brandCategoryText);
  assert.notEqual(modelLineText, brandCategoryText);

  // None of the three ever claims AI involvement.
  for (const text of [familyText, modelLineText, brandCategoryText]) {
    assert.doesNotMatch(text, /AI-assisted/i);
    assert.doesNotMatch(text, /grounded in live Google Search/i);
  }
});

test('a rendered deterministic-degradation card shows the distinct wording, not the plain static-logic sentence', () => {
  const html = api.renderAge(deterministicDegradedResult());
  assert.match(html, /live research did not finish/i);
  assert.doesNotMatch(html, /Deterministic Decode My Item model-family logic\./);
  assert.doesNotMatch(html, /AI-assisted/i);
});

test('the always-fast deterministic path (fallbackKind "none", grounding never attempted) keeps the plain static wording, not the degradation wording', () => {
  const html = api.renderAge(familyResult({ evidenceSource: 'heuristic', source: 'static', fallbackKind: 'none' }));
  assert.match(html, /Deterministic Decode My Item model-family logic\./);
  assert.doesNotMatch(html, /live research did not finish/i);
});

test('a clarification result is never described as a researched estimate', () => {
  const data = { querySpecificity: 'unusable', fallbackKind: 'clarification', notes: "We couldn't identify a physical product from this search." };
  const bucket = api.classifyAgeOutcome(data);
  const copy = api.copyForAgeOutcome(bucket, data);
  const combined = copy.heading + ' ' + copy.body + ' ' + copy.tryNext;
  assert.doesNotMatch(combined, /AI-assisted|grounded|research(ed)? estimate|live research/i);
});

// ── Verified exact-alias rendering ──────────────────────────────────────────

function exactAliasResult(overrides = {}) {
  return {
    brand: 'GE', model: 'GFW850SPN0DG', category: 'washer', itemCategory: 'washer',
    enteredModel: 'GFW850SPN0DG', canonicalModel: 'GFW850SPNDG', matchedBy: 'exact-alias',
    querySpecificity: 'exact-model', precisionLevel: 'exact', source: 'local-db',
    evidenceSource: 'local-db', localEvidenceHit: true, yearRange: '2019-2021',
    productionRange: { start: 2019, end: 2021 }, fallbackKind: 'none',
    evidenceConflict: false, evidence: [{ detail: 'Verified GE record', source: 'local-db' }],
    ...overrides,
  };
}

test('a verified exact-alias result shows both the entered and canonical model', () => {
  const html = api.renderAge(exactAliasResult());
  assert.match(html, /GFW850SPN0DG/);
  assert.match(html, /GFW850SPNDG/);
  assert.match(html, /verified label variant/i);
});

test('a verified exact-alias result never renders Unknown, retry, or a fallback warning', () => {
  const html = api.renderAge(exactAliasResult());
  assert.doesNotMatch(html, /Unknown/);
  assert.doesNotMatch(html, /data-smart-lookup-retry/);
  assert.doesNotMatch(html, /live research did not finish/i);
});

test('a brand conflict is disclosed rather than silently corrected', () => {
  const html = api.renderAge(exactAliasResult({
    brand: 'Samsung', source: 'static', evidenceSource: 'heuristic',
    localEvidenceHit: false, evidenceConflict: true, evidenceConflictKind: 'brand',
    canonicalModel: null, enteredModel: null, yearRange: null, productionRange: null,
    notes: 'The entered brand (Samsung) does not match the brand on the verified record for this model number (GE).',
  }));
  assert.match(html, /Check the brand on the label/i);
  assert.match(html, /does not match/i);
  // The user's entry is not overwritten with GE.
  assert.doesNotMatch(html, /verified label variant/i);
});

test('provider-authored text in the conflict note is escaped', () => {
  const html = api.renderAge(exactAliasResult({
    evidenceConflict: true, evidenceConflictKind: 'brand',
    notes: '<img src=x onerror=alert(1)>',
  }));
  assert.doesNotMatch(html, /<img /);
  assert.match(html, /&lt;img /);
});
