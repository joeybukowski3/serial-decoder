import fs from 'node:fs';
import vm from 'node:vm';

// Names exported from the sandboxed script.js onto globalThis.__api.
// Every name must exist in script.js or the export bootstrap throws a ReferenceError.
const API_EXPORTS = [
  'parseCandidateYears',
  'computeEstimatedAge',
  'hasSingleResolvedYear',
  'buildAmbiguousYearMessage',
  'updateSerialResultNotes',
  'chooseCandidateFromLookup',
  'resolveSerialYearFromModel',
  'deterministicRefinement',
  'narrowCandidatesWithEvidence',
  'detectContradictoryEvidence',
  'normalizeModelEvidenceWindow',
  'getCurrentSupplementalModelValue',
  'setStoredSupplementalModel',
  'KENMORE_PREFIX_TO_DECODER',
  'expandKnownSmartLookupQuery',
  'getSupplementalModelConfig',
  'normalizeDecoderCategory',
  'normalizeBrandId',
  'sanitizeDecodeResult',
  'classifyDecodeResult',
  'isIncompleteResult',
  'extractKenmoreModelPrefix',
  'resolveKenmoreDecoderFromPrefix',
  'getVizioModelDecodeInput',
  'isLikelyVizioModelValue',
  'sanitizeAlertText',
  'getKenmorePrefixDropdownOptions',
  'applyKenmorePrefixFallback',
  'isMaytagEraUnselected',
  'computeMaytagDualEraResult',
  'findClientModelEvidence',
  'findClientModelFamilyEvidence',
  'foldOZeroForClientMatching',
  'normalizeClientModelLookupValue',
  'collapseImpossibleFutureYears',
  // Consumer-brand catalog / dropdown surface.
  'getNormalizedBrandCatalog',
  'getCategoryDropdownBrands',
  'getCategoryControlId',
  'getBrandDirectoryItems',
  'getResultBrandDisplayName',
  'getSelectedBrandLabel',
  'resolveDecoderId',
  'CYCLING_BRANDS',
  'MOST_COMMON_APPLIANCE_BRANDS',
  'BRAND_DROPDOWN_EXCLUSIONS',
  'isBrandExcludedFromDropdown'
];

function createMockElement() {
  return {
    style: {},
    classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    appendChild: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    setAttribute: () => {},
    getAttribute: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };
}

export function loadDecoderContext() {
  const ctx = {
    console,
    setTimeout: (fn) => { fn(); return 0; },
    clearTimeout: () => {},
    URL,
    URLSearchParams,
    fetch: async () => ({ ok: false, text: async () => '', json: async () => ({}) }),
    history: { pushState: () => {} },
    window: {
      location: { pathname: '/', search: '', href: 'http://localhost/', origin: 'http://localhost', replace: () => {} },
      addEventListener: () => {},
      scrollTo: () => {},
    },
    document: {
      head: { appendChild: () => {} },
      body: { classList: { toggle: () => {}, add: () => {}, remove: () => {} }, style: {}, appendChild: () => {} },
      addEventListener: () => {},
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
      createElement: () => createMockElement(),
    },
    navigator: { clipboard: { writeText: async () => {} } },
  };
  ctx.window.document = ctx.document;
  vm.createContext(ctx);

  vm.runInContext(fs.readFileSync('decoder-data.js', 'utf8'), ctx);
  vm.runInContext('globalThis.__decoderData = decoderData;', ctx);
  vm.runInContext(fs.readFileSync('script.js', 'utf8'), ctx);
  vm.runInContext(
    `globalThis.__api = { decoderData: __decoderData, ${API_EXPORTS.join(', ')} };`,
    ctx
  );

  return { api: ctx.__api, ctx };
}

// resolveDecoderId() and anything downstream of it read the module-level
// `currentCategory` global rather than taking a category argument.
export function setCurrentCategory(ctx, category) {
  vm.runInContext(`currentCategory = ${JSON.stringify(category)};`, ctx);
}
