(function () {
  'use strict';

  var state = {
    sequence: 0,
    fingerprint: '',
    controller: null,
    age: { status: 'idle', data: null, error: null, stageIndex: 0, copy: null },
    replacement: { status: 'idle', data: null, error: null, copy: null },
    lastStartedAt: 0,
    ageStageTimers: [],
  };
  var inflight = new Map();
  var recent = new Map();

  // Progressive loading messages shown while a request is in flight. These
  // are honest, generic status updates -- not a claim about which provider
  // is currently running. There is no streaming signal from the server, so
  // the timing here is a best-effort UX heuristic, not confirmed telemetry.
  // Once a response actually arrives, renderAge() shows a real "backup
  // source" note only when the API reports fallbackUsed === true.
  var AGE_LOADING_STAGES = [
    { atMs: 0, message: 'Checking known model and serial data…' },
    { atMs: 900, message: 'Searching trusted model evidence…' },
    { atMs: 3200, message: 'Still working — checking a backup source…' },
  ];
  var REPLACEMENT_LOADING_MESSAGE = 'Checking replacement guidance…';
  var SMART_LOOKUP_NOTES_MAX_LENGTH = 300;

  // Copy for every non-success Smart Lookup age outcome. Each entry keeps a
  // short heading, a plain-language explanation, and one concrete next step.
  // None of these ever fabricate a year or claim more certainty than the API
  // actually has.
  var AGE_OUTCOME_COPY = {
    'missing-input': {
      heading: 'More details needed',
      body: 'We couldn’t verify this yet.',
      tryNext: 'Try adding the brand, model number, category, or serial number.',
    },
    'model-only-insufficient': {
      heading: 'Not enough evidence yet',
      body: 'We found the model-style input, but not enough verified production evidence to estimate a manufacture year.',
      tryNext: 'Add the serial number for a more accurate result, or use the Serial Number Decoder.',
    },
    'serial-only-no-brand': {
      heading: 'Brand needed',
      body: 'Serial numbers are brand-specific.',
      tryNext: 'Add the brand and item type so we can use the right decoding pattern.',
    },
    'brand-missing': {
      heading: 'Brand needed',
      body: 'This looks like a product description, but we could not identify the brand.',
      tryNext: 'Add the brand so we can recognize the product family.',
    },
    'product-family-recognized': {
      heading: 'Product family recognized',
      body: 'This looks like a product-family or retailer-title description, not an exact model number.',
      tryNext: 'Add the exact model number from the product label.',
    },
    'exact-model-insufficient': {
      heading: 'Exact model recognized',
      body: 'We recognized the exact model number, but this product-family context does not establish a unit manufacture date.',
      tryNext: 'Use the serial number for unit-specific manufacture dating.',
    },
    'product-year-unverified': {
      heading: 'Product recognized, year not verified yet',
      body: 'We recognized the product, but do not have enough supported evidence to show a year context.',
      tryNext: 'Add the exact model number or serial number from the product label.',
    },
    timeout: {
      heading: 'Taking longer than expected',
      body: 'Live research did not finish in time. Try again, or add more item details so we can narrow the estimate.',
      tryNext: 'Try again, or add the model number, machine type, or serial number from the product label.',
    },
    'rate-limited': {
      heading: 'Temporarily at capacity',
      body: 'Smart Lookup provider capacity is temporarily limited.',
      tryNext: 'Try again in a moment — local and cached lookups remain available.',
    },
    malformed: {
      heading: 'Result not reliable enough',
      body: 'We found possible information, but it was not reliable enough to show as a verified result.',
      tryNext: 'Try again, or add the exact model number.',
    },
    conflict: {
      heading: 'Conflicting information',
      body: 'The evidence we found about this model does not agree, so we are not choosing a year.',
      tryNext: 'Try adding the exact model number, or use the Serial Number Decoder for a unit-specific date.',
    },
    'unavailable-generic': {
      heading: 'Lookup unavailable',
      body: 'Smart Lookup could not establish a defensible result right now.',
      tryNext: 'Try again in a moment.',
    },
    'network-error': {
      heading: 'Lookup unavailable',
      body: 'We couldn’t reach Smart Lookup just now.',
      tryNext: 'Check your connection and try again.',
    },
    'unusable-query': {
      heading: 'We couldn’t identify a product',
      body: 'This search didn’t contain a recognizable brand, category, or product description.',
      tryNext: 'Add a brand, category, or model number so Smart Lookup can identify the item.',
    },
    'brand-category-recognized': {
      heading: 'Broad brand/category guidance',
      body: 'We recognized the brand and category, but not a specific model.',
      tryNext: 'Enter the complete model number or serial number from the product label.',
    },
  };

  // Headings and short explanations shown for a result whose precision is
  // less than an exact model -- these tell the user WHY the result is
  // broad, what it covers, and what it does not establish, per the
  // progressive-specificity product requirement.
  var PRECISION_HEADINGS = {
    exact: 'Exact model result',
    'narrow-range': 'Narrow model-line estimate',
    'model-line-range': 'Model-line estimate',
    'family-range': 'Broad product-family estimate',
    'broad-range': 'Broad brand/category guidance',
    'general-guidance': 'General product guidance',
  };

  function precisionExplanation(data) {
    if (!data || !data.precisionLevel) return '';
    if (data.precisionLevel === 'family-range') {
      return (data.recognizedFamily || data.productFamily || 'This product name')
        + ' was used across multiple generations, so this result describes the overall family rather than one exact configuration.';
    }
    if (data.precisionLevel === 'model-line-range') {
      return 'This result describes the ' + (data.recognizedSeries || data.seriesLine || 'model line')
        + ' rather than one exact configuration.';
    }
    if (data.precisionLevel === 'broad-range') {
      return 'This result describes the recognized brand and category broadly, not one specific model.';
    }
    if (data.precisionLevel === 'general-guidance') {
      return 'This is general guidance rather than information about one specific product.';
    }
    return '';
  }

  var REPLACEMENT_UNAVAILABLE_COPY = {
    heading: 'Replacement match unavailable',
    body: 'We could not verify a reliable replacement match yet.',
    tryNext: 'Try adding the full model number and item category.',
  };

  // Validation/provider error codes that mean "we got a response, but it did
  // not pass our reliability checks" -- distinct from a timeout (took too
  // long) or a conflict (internally inconsistent data).
  var MALFORMED_AGE_ERROR_CODES = {
    UNRELATED_BRAND: 1,
    UNRELATED_MODEL: 1,
    INVALID_YEAR: 1,
    INVALID_EVIDENCE: 1,
    INVALID_RESULT: 1,
    PROVIDER_MALFORMED_JSON: 1,
    GROQ_MALFORMED_JSON: 1,
    XAI_MALFORMED_RESPONSE: 1,
    XAI_SCHEMA_INVALID: 1,
    PROVIDER_EMPTY: 1,
    GROQ_EMPTY: 1,
    XAI_EMPTY_RESULT: 1,
    INVALID_PROVIDER_RESULT: 1,
    PROVIDER_RESPONSE_INVALID: 1,
    INVALID_YEAR_CONTEXT: 1,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function normalize(value) {
    return String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function normalizeNotes(value) {
    var normalized = normalize(value);
    return normalized.length > SMART_LOOKUP_NOTES_MAX_LENGTH
      ? normalized.slice(0, SMART_LOOKUP_NOTES_MAX_LENGTH).trim()
      : normalized;
  }

  function hashString(value) {
    var text = String(value || '');
    var hash = 2166136261;
    var index;
    for (index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0).toString(16);
  }

  function fingerprint(query, includeReplacement, notes) {
    return JSON.stringify({
      query: normalize(query).toLowerCase(),
      replacement: Boolean(includeReplacement),
      notesHash: normalizeNotes(notes) ? hashString(normalizeNotes(notes)) : '',
    });
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function resultsRoot() {
    return $('smart-lookup-results');
  }

  function includeReplacement() {
    var checkbox = $('include-replacement-comparisons');
    return Boolean(checkbox && checkbox.checked);
  }

  function lookupNotes() {
    var notes = $('lookup-notes');
    return notes ? normalizeNotes(notes.value) : '';
  }

  function requestBody(query, notes) {
    var body = { query: query };
    if (notes) body.notes = notes;
    return body;
  }

  function submitButtons() {
    var buttons = [];
    var legacyButton = $('smartLookupBtn');
    if (legacyButton) buttons.push(legacyButton);
    Array.prototype.forEach.call(document.querySelectorAll('[data-smart-lookup-submit="1"]'), function (button) {
      if (buttons.indexOf(button) === -1) buttons.push(button);
    });
    return buttons;
  }

  function setBusy(isBusy) {
    submitButtons().forEach(function (button) {
      button.disabled = Boolean(isBusy);
      button.setAttribute('aria-busy', isBusy ? 'true' : 'false');
      button.classList.toggle('is-loading', Boolean(isBusy));
    });
  }

  function ensureShell() {
    var root = resultsRoot();
    if (!root) return null;
    if (!root.querySelector('[data-smart-lookup-controller="1"]')) {
      root.innerHTML = '<div class="smart-lookup-controller" data-smart-lookup-controller="1">' +
        '<section class="sl-progressive-card sl-progressive-card--age" id="smart-lookup-age-panel" aria-live="polite"></section>' +
        '<section class="sl-progressive-card sl-progressive-card--lkq" id="smart-lookup-replacement-panel" aria-live="polite"></section>' +
        '</div>';
    }
    return root.querySelector('[data-smart-lookup-controller="1"]');
  }

  function showResults() {
    var loading = $('ageLoading');
    var ageResults = $('ageResults');
    var serialResults = $('serialResults');
    if (loading) loading.classList.add('hidden');
    if (serialResults) serialResults.classList.add('hidden');
    if (ageResults) ageResults.classList.remove('hidden');
  }

  function setPanel(which, html) {
    ensureShell();
    var panel = $(which === 'age' ? 'smart-lookup-age-panel' : 'smart-lookup-replacement-panel');
    if (panel) panel.innerHTML = html;
  }

  function editSearchButton() {
    return '<button type="button" class="smart-lookup-edit-link" data-smart-lookup-edit="1">Edit your search</button>';
  }

  function loadingCard(message) {
    return '<div class="info-block smart-lookup-status smart-lookup-status--loading"><h4>Working on it</h4><p>' + escapeHtml(message) + '</p></div>';
  }

  function noResultCard(copy, retryTarget) {
    var safeCopy = copy || AGE_OUTCOME_COPY['unavailable-generic'];
    var retryPart = retryTarget
      ? '<button type="button" class="decode-btn" data-smart-lookup-retry="' + retryTarget + '">Retry</button> '
      : '';
    return '<div class="info-block smart-lookup-status smart-lookup-status--noresult">' +
      '<h4>' + escapeHtml(safeCopy.heading) + '</h4>' +
      '<p>' + escapeHtml(safeCopy.body) + '</p>' +
      '<p class="smart-lookup-try-next"><strong>Try this next:</strong> ' + escapeHtml(safeCopy.tryNext) + '</p>' +
      '<div class="smart-lookup-status-actions">' + retryPart + editSearchButton() + '</div>' +
      '</div>';
  }

  function formatRange(range, fallback) {
    if (range && range.start && range.end) return range.start === range.end ? String(range.start) : range.start + '-' + range.end;
    return fallback || 'Not established';
  }

  function hasUsableAgeInfo(data) {
    if (!data) return false;
    if (data.serialDetected && data.serialDetected.action === 'use-decoder') return true;
    if (Array.isArray(data.manufactureYearCandidates) && data.manufactureYearCandidates.length) return true;
    if (data.historicalContext || data.inventionSummary) return true;
    var context = data.yearContext;
    if (context && context.type !== 'unknown') {
      if (context.value) return true;
      if (context.startYear && context.endYear) return true;
    }
    if (data.introductionYear) return true;
    if (data.individualManufactureYear) return true;
    var range = data.productionRange;
    if (range && (range.start || range.end)) return true;
    return false;
  }

  function classifyAgeOutcome(data) {
    if (!data) return 'network-error';
    var code = data.errorCode || null;
    // Estimate-first: a payload that already carries a defensible age estimate
    // (including a deterministic reserve substituted after a timeout) must be
    // treated as a successful result card. Timeout/error codes stay on the
    // payload for telemetry, but they must not erase useful product timing.
    if (hasUsableAgeInfo(data)) return 'success';
    if (code === 'RATE_LIMIT') return 'rate-limited';
    if (code === 'PROVIDER_TIMEOUT' || code === 'TOTAL_DEADLINE') return 'timeout';
    if (code === 'INTRODUCTION_AFTER_RANGE' || code === 'REVERSED_RANGE') return 'conflict';
    if (code && MALFORMED_AGE_ERROR_CODES[code]) return 'malformed';
    if (data.querySpecificity === 'unusable') return 'unusable-query';
    if (data.productFamily && data.yearContext && data.yearContext.type === 'unknown') return 'product-year-unverified';
    if (data.productFamily && data.exactModel) return 'exact-model-insufficient';
    if (data.productFamily) return 'product-family-recognized';
    if (!code && data.querySpecificity === 'brand-category') return 'brand-category-recognized';
    if (code === 'INSUFFICIENT_QUERY_DETAIL') return 'missing-input';
    if (!code) {
      // No errorCode at all means the request succeeded but simply had
      // nothing useful to report. Brand presence is the primary signal here
      // -- a recognized brand (with or without a model) must never be
      // reported as "brand needed" or "serial-only".
      var hasBrand = Boolean(data.brand) && data.brand !== 'Unknown';
      if (hasBrand && data.model) return 'model-only-insufficient';
      if (hasBrand) return 'missing-input';
      if (data.category) return 'brand-missing';
      return 'serial-only-no-brand';
    }
    return 'unavailable-generic';
  }

  function copyForAgeOutcome(bucket, data) {
    var base = AGE_OUTCOME_COPY[bucket] || AGE_OUTCOME_COPY['unavailable-generic'];
    if (bucket === 'product-family-recognized') {
      var brandPart = data && data.brand && data.brand !== 'Unknown' ? data.brand + ' ' : '';
      var familyPart = (data && data.productFamily) || 'Product family';
      if (!/\bseries$/i.test(familyPart)) familyPart += ' Series';
      return {
        heading: brandPart + familyPart + ' recognized',
        body: (data && data.notes) || base.body,
        tryNext: (data && data.refinementSuggestion) || base.tryNext,
      };
    }
    if (bucket === 'exact-model-insufficient') {
      return {
        heading: ((data && data.brand && data.brand !== 'Unknown' ? data.brand + ' ' : '') + ((data && data.exactModel) || 'Exact model')) + ' recognized',
        body: (data && data.notes) || base.body,
        tryNext: (data && data.refinementSuggestion) || base.tryNext,
      };
    }
    if (bucket === 'product-year-unverified') {
      return {
        heading: base.heading,
        body: (data && data.notes) || base.body,
        tryNext: (data && data.refinementSuggestion) || base.tryNext,
      };
    }
    if (bucket === 'unavailable-generic' && data && data.notes) {
      return { heading: base.heading, body: data.notes, tryNext: base.tryNext };
    }
    if (bucket === 'unusable-query') {
      return { heading: base.heading, body: (data && data.notes) || base.body, tryNext: base.tryNext };
    }
    if (bucket === 'brand-category-recognized') {
      return {
        heading: base.heading,
        body: (data && data.notes) || base.body,
        tryNext: (data && data.refinementSuggestion) || base.tryNext,
      };
    }
    if (bucket === 'rate-limited' && data && data.notes) {
      return { heading: base.heading, body: data.notes, tryNext: base.tryNext };
    }
    return base;
  }

  // A recognized model-line/product-family/brand-category query can be
  // genuinely useful even with no single named replacement (replacement:
  // null, replacementRelationship: 'none-found') -- ranked candidates, a
  // comparison checklist, known configuration variants, or refinement
  // guidance are all still worth rendering instead of the generic
  // "unavailable" card. See Phase 10 in docs/smart-lookup-architecture.md.
  function hasProgressiveReplacementGuidance(data) {
    if (!data) return false;
    if (Array.isArray(data.replacementCandidates) && data.replacementCandidates.length) return true;
    var precision = data.replacementPrecision;
    // An exact-model/exact-configuration deterministic reserve carries a
    // confirmed identity and comparison criteria but no candidates. Without
    // this branch it fell through to the generic "unavailable" card, which is
    // how a fully identified product (e.g. Samsung QN65Q60RAFXZA) rendered an
    // empty replacement panel purely because live research timed out. Gated
    // on isDeterministicLkqFallback so the ordinary exact-model provider
    // rendering path is untouched.
    if (precision === 'exact-model' || precision === 'exact-configuration') {
      if (!isDeterministicLkqFallback(data)) return false;
      return Boolean(
        (Array.isArray(data.comparisonCriteria) && data.comparisonCriteria.length)
        || (data.originalIdentity && (data.originalIdentity.brand || data.originalIdentity.model))
        || (data.itemSummary && data.itemSummary.model)
      );
    }
    if (precision !== 'model-line' && precision !== 'product-family' && precision !== 'brand-category') return false;
    return Boolean(
      (Array.isArray(data.comparisonCriteria) && data.comparisonCriteria.length)
      || (Array.isArray(data.knownConfigurationVariants) && data.knownConfigurationVariants.length)
      || (Array.isArray(data.recommendedIdentifiers) && data.recommendedIdentifiers.length)
      || (data.originalIdentity && (data.originalIdentity.brand || data.originalIdentity.family || data.originalIdentity.modelLine))
    );
  }

  function classifyReplacementOutcome(data) {
    if (!data) return 'network-error';
    if (Array.isArray(data.replacementOptions) && data.replacementOptions.length) return 'success';
    if (data.replacementRelationship && data.replacementRelationship !== 'none-found' && data.replacement) return 'success';
    if (hasProgressiveReplacementGuidance(data)) return 'success';
    return 'unavailable';
  }

  function copyForReplacementOutcome(data) {
    var summary = data && data.itemSummary;
    var brand = summary && summary.brand && summary.brand !== 'Unknown' ? summary.brand : '';
    var category = summary && summary.category ? summary.category : '';
    var known = [brand, category].filter(Boolean).join(' ');
    if (!known) return REPLACEMENT_UNAVAILABLE_COPY;
    return {
      heading: REPLACEMENT_UNAVAILABLE_COPY.heading,
      body: 'We recognized this as a ' + known + ' item, but could not verify a reliable replacement match yet.',
      tryNext: REPLACEMENT_UNAVAILABLE_COPY.tryNext,
    };
  }

  function getYearContext(data) {
    if (data && data.yearContext && data.yearContext.type !== 'unknown') return data.yearContext;
    if (data && data.individualManufactureYear) {
      return { value: data.individualManufactureYear, type: 'manufacture-year', label: 'Manufacture year', isExactUnitDate: true };
    }
    if (data && data.introductionYear) {
      return { value: data.introductionYear, type: 'market-introduction', label: 'Model introduced', isExactUnitDate: false };
    }
    if (data && data.productionRange && (data.productionRange.start || data.productionRange.end)) {
      return { startYear: data.productionRange.start, endYear: data.productionRange.end, type: 'production-range', label: 'Production range', isExactUnitDate: false };
    }
    return null;
  }

  function formatYearContext(context) {
    if (!context) return 'Not established';
    if (context.value) return String(context.value);
    if (context.startYear && context.endYear) {
      return context.startYear === context.endYear ? String(context.startYear) : context.startYear + '–' + context.endYear;
    }
    return 'Not established';
  }

  function resultHeading(data) {
    var brand = data && data.evidenceConflict && data.recognizedBrand
      ? data.recognizedBrand
      : (data && data.brand && data.brand !== 'Unknown' ? data.brand : '');
    if (data && data.exactModel) return [brand, data.exactModel].filter(Boolean).join(' ');
    if (data && data.displayName) return data.displayName;
    if (data && data.canonicalModel && brand) return brand + ' ' + data.canonicalModel;
    if (data && data.productFamily) {
      if (brand === 'LG' && /^OLED\b/i.test(data.seriesLine || '')) return brand + ' ' + data.productFamily + ' OLED TV';
      return [brand, data.productFamily, data.category === 'television' ? 'TV' : ''].filter(Boolean).join(' ');
    }
    if (data && data.contextLevel === 'brand-category') {
      return [brand, data.category || data.itemCategory].filter(Boolean).join(' ') || 'Brand/category history';
    }
    if (data && data.contextLevel === 'category-history') {
      return ((data.category || data.itemCategory || 'Product category') + ' history').replace(/^\w/, function (letter) { return letter.toUpperCase(); });
    }
    return [brand, data && data.model].filter(Boolean).join(' ') || 'Smart Lookup result';
  }

  // Strongest available product identity for the report title. Prefer curated
  // display names and brand-qualified fields over sparse or lower-case
  // research guesses. Never invent a product name that is not already present.
  function productIdentityHeading(data) {
    if (!data) return 'Smart Lookup result';
    if (data.displayName) return data.displayName;
    if (data.likelyProduct) return data.likelyProduct;
    return resultHeading(data);
  }

  function providerName(value) {
    var source = String(value || '').toLowerCase();
    if (source === 'xai' || source === 'xai-ungrounded' || source === 'xai-web') return 'xAI Grok';
    if (source === 'groq' || source === 'groq-ungrounded') return 'Groq';
    if (source === 'gemini' || source === 'gemini-ungrounded') return 'Gemini';
    return '';
  }

  function estimateBasisLabel(value) {
    var labels = {
      'verified-model-generation': 'Verified exact-model generation',
      'verified-lineup-generation': 'Verified official-lineup generation',
      'serial-decode': 'Serial-number decode',
      'manufacturing-label': 'Manufacturing label',
    };
    return labels[value] || String(value || '').replace(/-/g, ' ').replace(/^\w/, function (letter) { return letter.toUpperCase(); });
  }

  function capitalizeLabel(value) {
    var text = normalize(value);
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function specificityLabel(data) {
    var raw = data && (data.contextLevel || data.querySpecificity || data.precisionLevel) || '';
    var labels = {
      exact: 'Exact model',
      'exact-model': 'Exact model',
      'narrow-range': 'Exact model',
      'model-line': 'Model line',
      'model-line-range': 'Model line',
      'product-family': 'Product family',
      'family-range': 'Product family',
      'brand-category': 'Brand/category',
      'broad-range': 'Brand/category',
      'category-history': 'Brand/category',
      'general-guidance': 'General guidance',
      unusable: 'General guidance',
    };
    if (labels[raw]) return labels[raw];
    if (!raw) return '';
    return String(raw).replace(/-/g, ' ');
  }

  function confidenceLabel(data) {
    var raw = data && (data.contextConfidence || data.identityConfidence || data.confidenceLevel || (data.yearContext && data.yearContext.confidence)) || '';
    if (!raw) return '';
    var normalized = String(raw).toLowerCase();
    if (normalized === 'high') return 'High';
    if (normalized === 'medium' || normalized === 'moderate' || normalized === 'partial') return 'Moderate';
    if (normalized === 'low') return 'Low';
    if (normalized === 'unknown') return 'Unknown';
    return capitalizeLabel(normalized);
  }

  function estimatedTimingText(data) {
    if (!data) return 'Not established';
    if (data.rangeLabel) return String(data.rangeLabel);
    if (data.estimatedRange && (data.estimatedRange.start || data.estimatedRange.end)) {
      return formatRange(data.estimatedRange, '');
    }
    if (data.bestEstimateYear) return 'Approximately ' + data.bestEstimateYear;
    if (data.releaseDate) return String(data.releaseDate);
    if (data.estimatedEra) return String(data.estimatedEra);
    if (data.generationRange) return String(data.generationRange);
    if (data.lineIntroductionYear) return String(data.lineIntroductionYear);
    if (data.familyIntroductionYear) return String(data.familyIntroductionYear);
    if (data.categoryEntryYear) return String(data.categoryEntryYear);
    if (data.introductionYear) return String(data.introductionYear);
    if (data.productionRange) return formatRange(data.productionRange, data.yearRange);
    if (data.yearRange) return String(data.yearRange);
    var context = getYearContext(data);
    if (context) return formatYearContext(context);
    return 'Not established';
  }

  // Compact display for hero metrics (e.g. "2021 or later" → "2021+") while
  // keeping the full wording available for accessible labels.
  function compactTimingDisplay(data) {
    var full = estimatedTimingText(data);
    var text = String(full || '').trim();
    var orLater = text.match(/^(\d{4})\s+or\s+later$/i);
    if (orLater) return { display: orLater[1] + '+', full: text };
    var openPlus = text.match(/^(\d{4})\+$/);
    if (openPlus) return { display: openPlus[1] + '+', full: text };
    return { display: text, full: text };
  }

  function hasIndividualUnitDateEvidence(data, context) {
    if (context && context.isExactUnitDate) return true;
    if (data && data.individualManufactureYear != null) return true;
    if (data && data.estimateBasis === 'serial-decode') return true;
    if (data && data.yearContext && data.yearContext.isExactUnitDate) return true;
    return false;
  }

  // Concise primary year-panel label. One short phrase only.
  function heroPrimaryLabel(data, context, manufactureAmbiguous) {
    if (manufactureAmbiguous) return 'Ambiguous manufacture year';
    if (hasIndividualUnitDateEvidence(data, context)) return 'Manufacture year';
    if (data && data.estimatedYearType === 'model-production') return 'Estimated production period';
    if (context && context.type === 'production-range') return 'Estimated production period';
    if (context && context.type === 'market-introduction') return 'Estimated introduction';
    if (data && data.introductionYear) return 'Estimated introduction';
    if (context && context.label) {
      var raw = String(context.label);
      if (/introduction/i.test(raw)) return 'Estimated introduction';
      if (/production|period/i.test(raw)) return 'Estimated production period';
      if (/model.?era|model.?year/i.test(raw)) return 'Estimated introduction';
      return raw;
    }
    return 'Estimated timing';
  }

  // Optional precision label under the primary year label. Must not restate
  // nearly the same introduction/production phrase as the primary label.
  function heroEstimateTypeLabel(data, context, manufactureAmbiguous) {
    if (manufactureAmbiguous) return 'Ambiguous candidates';
    if (hasIndividualUnitDateEvidence(data, context)) {
      if (data && data.estimateBasis === 'serial-decode') return 'Serial-decoded unit date';
      return 'Individual manufacture year';
    }
    if (data && data.estimatedYearType === 'model-production') return 'Model-generation estimate';
    if (data && (data.estimatedYearType === 'model-year' || (context && context.type === 'model-year-family'))) {
      return 'Model-year estimate';
    }
    if (data && data.precisionLevel === 'model-line-range') return 'Model-line estimate';
    if (data && data.precisionLevel === 'family-range') return 'Product-family estimate';
    if (data && (data.precisionLevel === 'broad-range' || data.contextLevel === 'brand-category' || data.contextLevel === 'category-history')) {
      return 'Broad category estimate';
    }
    if (data && data.introductionYear) return 'Model-line estimate';
    return '';
  }

  function detailMetaRow(label, value) {
    if (value == null || value === '') return '';
    return '<div class="smart-age-detail-row">'
      + '<dt class="result-label smart-age-detail-label">' + escapeHtml(label) + '</dt>'
      + '<dd class="result-value smart-age-detail-value">' + escapeHtml(value) + '</dd>'
      + '</div>';
  }

  function summaryMetricRow(label, valueHtml, valueText) {
    if (!valueText && !valueHtml) return '';
    return '<div class="smart-age-metric-row">'
      + '<span class="smart-age-metric-label">' + escapeHtml(label) + '</span>'
      + '<span class="smart-age-metric-value">' + (valueHtml || escapeHtml(valueText)) + '</span>'
      + '</div>';
  }

  // --- ItemAssist referral (same destination, copy, and analytics as Serial Decoder) ---
  var ITEM_ASSIST_REPORT_URL = 'https://itemassist.com/request-age-verification';
  var ITEM_ASSIST_SOURCE = 'decodemyitem';
  var UPSELL_VARIANT_COPY = {
    resolved: 'Want this backed by documentation? A human reviewer can verify this finding and provide supporting sources.',
    ambiguous: 'Our automated tool narrowed this to a few possible years. A human reviewer can dig deeper and resolve it.',
    noMatch: 'Automated decoding couldn\'t pin this down. Our team can do deeper manual research to find an answer.',
  };
  var lastSmartUpsellViewSignature = '';

  function trackSmartAnalytics(name, props) {
    try {
      if (typeof window !== 'undefined' && window.ItemAssistAnalytics && typeof window.ItemAssistAnalytics.track === 'function') {
        window.ItemAssistAnalytics.track(name, props || {});
      }
    } catch (err) { /* analytics must never break rendering */ }
  }

  function generateSmartResultId() {
    try {
      if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
      }
    } catch (err) { /* fall through */ }
    return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function upsellResultStatusFromVariant(variant) {
    return variant === 'noMatch' ? 'no_match' : (variant || 'no_match');
  }

  // Mirrors script.js buildItemAssistReportUrl — approved params only; never serial.
  function buildItemAssistReportUrl(context) {
    var ctx = context || {};
    var pairs = [];
    function pushParam(key, value) {
      if (value == null || value === '') return;
      pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
    }
    pushParam('brand', ctx.brand);
    pushParam('model', ctx.model);
    pushParam('category', ctx.category);
    pushParam('result_id', ctx.resultId);
    pushParam('result_status', ctx.resultStatus);
    pushParam('source', ITEM_ASSIST_SOURCE);
    return ITEM_ASSIST_REPORT_URL + '?' + pairs.join('&');
  }

  function smartUpsellVariant(data, context, manufactureAmbiguous) {
    if (manufactureAmbiguous) return 'ambiguous';
    if (!data) return 'noMatch';
    if (data.querySpecificity === 'unusable' || (!getYearContext(data) && !data.introductionYear && !data.bestEstimateYear && !data.productionRange && !data.rangeLabel)) {
      return 'noMatch';
    }
    if (data.manufactureYearCandidates && data.manufactureYearCandidates.length > 1) return 'ambiguous';
    return 'resolved';
  }

  function renderItemAssistReferral(data, context, manufactureAmbiguous) {
    var variant = smartUpsellVariant(data, context, manufactureAmbiguous);
    var resultStatus = upsellResultStatusFromVariant(variant);
    var brand = data && data.evidenceConflict && data.recognizedBrand
      ? data.recognizedBrand
      : (data && data.brand && data.brand !== 'Unknown' ? data.brand : '');
    var model = data && (data.exactModel || data.canonicalModel || data.model || data.productFamily) || '';
    var category = data && (data.category || data.itemCategory || data.productType) || '';
    var resultId = generateSmartResultId();
    var href = buildItemAssistReportUrl({
      brand: brand || undefined,
      model: model || undefined,
      category: category || undefined,
      resultId: resultId,
      resultStatus: resultStatus,
    });
    var bodyCopy = UPSELL_VARIANT_COPY[variant] || UPSELL_VARIANT_COPY.noMatch;
    var viewSignature = [resultId, resultStatus, brand, model, category].join('|');
    if (viewSignature !== lastSmartUpsellViewSignature) {
      lastSmartUpsellViewSignature = viewSignature;
      trackSmartAnalytics('item_assist_upsell_viewed', {
        context: 'item-assist-upsell',
        category: category || undefined,
        resultStatus: resultStatus,
      });
    }
    // Same structure, classes, pricing, disclosure, and CTA copy as Serial Decoder.
    // Smart Lookup uses scoped IDs so both tools can coexist on index.html.
    return '<aside class="info-block ia-upsell-card smart-age-upsell" id="itemAssistSmartUpsellCard" data-item-assist-upsell="1"'
      + ' data-result-status="' + escapeHtml(resultStatus) + '"'
      + ' data-category="' + escapeHtml(category) + '"'
      + ' data-result-id="' + escapeHtml(resultId) + '">'
      + '<h4>Need This Confirmed by a Person?</h4>'
      + '<p id="itemAssistSmartUpsellBody">' + escapeHtml(bodyCopy) + '</p>'
      + '<p class="ia-upsell-pricing">Starting at $35 &mdash; $25 professional review plus $10 per item.</p>'
      + '<a href="' + escapeHtml(href) + '" id="itemAssistSmartUpsellCta" class="ia-upsell-cta" target="_blank" rel="noopener"'
      + ' data-item-assist-upsell-cta="1">Request Human-Reviewed Report</a>'
      + '<details class="determination-details">'
      + '<summary>What&rsquo;s included?</summary>'
      + '<div class="determination-body">'
      + '<p><strong>Free Automated Result</strong></p>'
      + '<ul>'
      + '<li>Instant serial-number decoding</li>'
      + '<li>Candidate manufacture year(s)</li>'
      + '<li>General educational use</li>'
      + '</ul>'
      + '<p><strong>Human-Reviewed Age Verification &mdash; Starting at $35</strong></p>'
      + '<ul>'
      + '<li>Human reviewer confirms or narrows the estimate</li>'
      + '<li>Documented model/serial research</li>'
      + '<li>Supporting sources included</li>'
      + '<li>Confidence level explained</li>'
      + '<li>Good for: insurance documentation, resale, personal records</li>'
      + '</ul>'
      + '<p><strong>Full Item Valuation Report &mdash; Item Assist</strong></p>'
      + '<ul>'
      + '<li>Everything in Age Verification, plus:</li>'
      + '<li>Current replacement pricing</li>'
      + '<li>Like-kind-and-quality comparisons</li>'
      + '<li>RCV/ACV valuation support</li>'
      + '<li>Best for: insurance claims, multi-item loss, disputes</li>'
      + '</ul>'
      + '</div>'
      + '</details>'
      + '<p class="ia-upsell-trust">Reviewed by a person. 24&ndash;48 hour turnaround. Not a manufacturer certification.</p>'
      + '</aside>';
  }

  function searchIconHtml() {
    return '<span class="smart-age-report__icon" aria-hidden="true">'
      + '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg">'
      + '<circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="2"/>'
      + '<path d="M16.2 16.2L20 20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
      + '</svg></span>';
  }

  function isGroundedProviderResult(data) {
    var evidence = data ? String(data.evidenceSource || '').toLowerCase() : '';
    return Boolean(data)
      && (evidence === 'gemini-grounded' || evidence === 'openai-web' || evidence === 'xai-web')
      && Array.isArray(data.sources)
      && data.sources.length > 0;
  }

  function isUngroundedProviderResult(data) {
    if (isGroundedProviderResult(data)) return false;
    var source = String((data && (data.evidenceSource || data.source || data.originSource)) || '').toLowerCase();
    // A grounded/web label without retrieved sources degrades to the honest
    // ungrounded wording rather than claiming live research.
    return source === 'gemini-ungrounded'
      || source === 'groq-ungrounded'
      || source === 'xai-ungrounded'
      || source === 'gemini-grounded'
      || source === 'openai-ungrounded'
      || source === 'openai-web'
      || source === 'xai-web'
      || source === 'gemini'
      || source === 'groq'
      || source === 'xai'
      || source === 'openai';
  }

  function retrievedDateLabel(data) {
    if (!data || !data.retrievedAt) return '';
    var parsed = new Date(data.retrievedAt);
    if (isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
  }

  function isGroundedTimeoutFallbackResult(data) {
    // groundedFallback is reserved exclusively for a real AI
    // recovery of a timed-out grounded attempt (fallbackKind
    // 'ungrounded-provider') -- never for a deterministic, non-AI result.
    return Boolean(data) && data.groundedFallback === true && !isGroundedProviderResult(data);
  }

  // A DIFFERENT kind of degradation than isGroundedTimeoutFallbackResult:
  // no AI ever ran for this result -- a recognized
  // model-line/family/brand-category query's own registry/deterministic
  // data was substituted after a provider attempt failed or timed out. This
  // must never be worded as "AI-assisted" or "research completed".
  var DETERMINISTIC_DEGRADED_WORDING = {
    'deterministic-model-line': 'Live research did not finish in time, so this result uses the broader product-generation information available for this model line rather than a source-verified exact-model lookup.',
    'deterministic-family': 'Live research did not finish in time, so this result uses the broader product-generation information available for this product family rather than a source-verified exact-model lookup.',
    'deterministic-brand-category': 'Live research did not finish in time, so this result uses broader brand and category information rather than a source-verified lookup.',
    'deterministic-broad': 'Live research did not finish in time, so this result uses broader deterministic product information rather than a source-verified lookup.',
    // Exact-model reserve: identity is confirmed deterministically, but no
    // production-range evidence exists and research did not finish. This must
    // never read as an age estimate -- no year is claimed in this result.
    'deterministic-exact-model': 'We recognized this exact model number, but live research did not finish in time and no verified production range is on file for it. No manufacture year is estimated here; enter the serial number for a unit-specific date.',
  };

  function isDeterministicDegradedResult(data) {
    return Boolean(data) && Object.prototype.hasOwnProperty.call(DETERMINISTIC_DEGRADED_WORDING, data.fallbackKind);
  }

  function sourceQualifier(data) {
    if (!data) return '';
    if (isGroundedProviderResult(data)) {
      var retrievedOn = retrievedDateLabel(data);
      // Provider-neutral wording: this path now serves OpenAI web search as
      // well as Gemini grounding, so naming one search engine would be wrong
      // for most results.
      return 'AI research grounded in live web search results'
        + (retrievedOn ? ' retrieved ' + retrievedOn : '')
        + '; review the cited web sources below.';
    }
    if (isDeterministicDegradedResult(data)) {
      return DETERMINISTIC_DEGRADED_WORDING[data.fallbackKind];
    }
    if (isGroundedTimeoutFallbackResult(data)) {
      return 'AI-assisted model research completed, but live web verification timed out. Review this as an estimate rather than a source-verified finding.';
    }
    if (isUngroundedProviderResult(data)) {
      var provider = providerName(data.evidenceSource || data.source || data.originSource);
      var prefix = provider ? provider + ' AI-assisted analysis' : 'AI-assisted analysis';
      return prefix + ' based on the information entered; no live manufacturer source was verified.';
    }
    if (data.source === 'cache' || data.cacheStatus === 'hit') {
      return 'Previously cached Smart Lookup result; review the details below before relying on it.';
    }
    if (data.source === 'decoder-verified' || data.evidenceSource === 'user-verified') {
      return 'Verified Decode My Item model evidence from a prior successful serial-number decode.';
    }
    if (data.source === 'static' || data.evidenceSource === 'heuristic') {
      return 'Deterministic Decode My Item model-family logic.';
    }
    if (data.source === 'local-db' || data.evidenceSource === 'local-db') {
      return 'Local Decode My Item model evidence.';
    }
    return '';
  }

  function evidenceHeading(data) {
    if (isGroundedProviderResult(data)) return 'Findings from current web sources';
    if (isUngroundedProviderResult(data)) return 'Analysis basis';
    if (data && (data.source === 'cache' || data.cacheStatus === 'hit')) return 'Information considered';
    return 'How this result was determined';
  }

  function renderGroundedSources(data) {
    if (!isGroundedProviderResult(data)) return '';
    var items = data.sources.slice(0, 5).map(function (item) {
      if (!item || !item.title) return '';
      var label = escapeHtml(item.title);
      if (item.uri && /^https:\/\//i.test(item.uri)) {
        return '<li><a href="' + escapeHtml(item.uri) + '" target="_blank" rel="noopener nofollow">' + label + '</a></li>';
      }
      return '<li>' + label + '</li>';
    }).filter(Boolean).join('');
    if (!items) return '';
    return '<details class="determination-details smart-lookup-sources smart-age-accordion">'
      + '<summary aria-expanded="false">Web sources consulted</summary>'
      + '<ul>' + items + '</ul></details>';
  }

  function renderSerialDetected(data) {
    var detected = data && data.serialDetected;
    if (!detected || detected.action !== 'use-decoder' || !detected.token) return '';
    var href = '/index.html?serial=' + encodeURIComponent(detected.token) + '#decoder-tool';
    return '<div class="info-block smart-lookup-serial-notice smart-age-notice smart-age-notice--info">' +
      '<h4>Serial number detected</h4>' +
      '<p>Use the Serial Number Decoder for unit-specific manufacture-date decoding. ' +
      '<a href="' + escapeHtml(href) + '">Open Serial Number Decoder</a></p>' +
      '</div>';
  }

  function renderAge(data) {
    var context = getYearContext(data);
    var primaryYear = formatYearContext(context);
    var manufactureCandidates = Array.isArray(data && data.manufactureYearCandidates)
      ? data.manufactureYearCandidates
      : [];
    var manufactureAmbiguous = Boolean(data && data.manufactureDateAmbiguous && manufactureCandidates.length);
    if (manufactureAmbiguous) {
      primaryYear = manufactureCandidates.join(' or ');
    }
    var unitDateEvidence = hasIndividualUnitDateEvidence(data, context);
    var yearLabel = heroPrimaryLabel(data, context, manufactureAmbiguous);
    var estimateTypeLabel = heroEstimateTypeLabel(data, context, manufactureAmbiguous);
    // Avoid near-duplicate year-panel captions (e.g. two "introduction" lines).
    if (estimateTypeLabel && normalize(estimateTypeLabel) === normalize(yearLabel)) {
      estimateTypeLabel = '';
    }
    var manufactureMessage = manufactureAmbiguous
      ? 'Ambiguous; model-era evidence is required to choose a candidate year'
      : (unitDateEvidence
        ? primaryYear
        : (data && data.productFamily
          ? 'Not available without serial or exact unit evidence'
          : 'Individual manufacture date requires serial number'));
    var exactModelDisplay = data && data.exactModel
      ? data.exactModel
      : (data && !data.productFamily && data.model ? data.model : '');
    var exactModel = exactModelDisplay || 'Not provided';
    var productFamily = data && data.productFamily
      ? (data.brand === 'LG' && /^OLED\b/i.test(data.seriesLine || '') ? data.productFamily + ' OLED TV' : data.productFamily)
      : '';
    var seriesValue = data && (data.series || data.recognizedSeries || data.seriesLine) || '';
    var brandValue = data && data.brand && data.brand !== 'Unknown' ? data.brand : '';
    if (data && data.evidenceConflict && data.recognizedBrand) {
      brandValue = data.brand && data.brand !== 'Unknown' ? data.brand : brandValue;
    }
    var categoryValue = data && (data.category || data.itemCategory || data.productType) || '';
    var variants = Array.isArray(data && data.yearVariants) ? data.yearVariants : [];
    var variantsHtml = variants.length
      ? '<div class="smart-year-variants"><h4>Model-year variants</h4><ul>' + variants.map(function (item) {
          return '<li><span class="smart-year-variant-name">' + escapeHtml(item.name) + ':</span> '
            + '<span class="smart-year-variant-year">' + escapeHtml(item.year) + ' model-year family</span></li>';
        }).join('') + '</ul></div>'
      : '';
    // A verified exact-alias hit resolved the entered value to a different
    // canonical model. Show both so the input never appears silently rewritten.
    var canonicalNote = '';
    var enteredDiffersFromCanonical = Boolean(
      data && data.canonicalModel && data.enteredModel
      && String(data.canonicalModel).toUpperCase() !== String(data.enteredModel).toUpperCase()
    );
    if (enteredDiffersFromCanonical) {
      canonicalNote = '<p class="smart-lookup-canonical-note">Entered model <strong>'
        + escapeHtml(data.enteredModel)
        + '</strong> is a verified label variant of canonical model <strong>'
        + escapeHtml(data.canonicalModel) + '</strong>.</p>';
    }
    // A brand/category conflict is disclosed, never silently corrected.
    var conflictNote = '';
    if (data && data.evidenceConflict) {
      var enteredBrand = data.enteredBrand || data.brand || 'the entered brand';
      var recognizedBrand = data.recognizedBrand || 'a different brand';
      conflictNote = '<div class="info-block smart-lookup-evidence-conflict smart-age-notice smart-age-notice--warning" role="status">'
        + '<h4>Check the '
        + (data.evidenceConflictKind === 'category' ? 'product type' : 'brand')
        + ' on the label</h4><p>'
        + escapeHtml(data.evidenceConflictKind === 'brand'
          ? 'The entered brand was ' + enteredBrand + ', but this model number matches ' + recognizedBrand + '. The entered values were preserved and were not silently changed.'
          : (data.notes || 'The entered details conflict with a verified record for this model number.'))
        + '</p></div>';
    }
    var evidence = Array.isArray(data && data.evidence) ? data.evidence.slice(0, 4) : [];
    var evidenceHtml = evidence.length
      ? '<details class="determination-details smart-age-accordion"><summary aria-expanded="false">'
        + escapeHtml(evidenceHeading(data))
        + '</summary><ul>'
        + evidence.map(function (item) {
          return '<li>' + escapeHtml(item.detail || item.source || 'Evidence') + '</li>';
        }).join('')
        + '</ul></details>'
      : '';
    // fallbackUsed is real API metadata (which provider actually served this
    // result), not a guess -- safe to state plainly here.
    var fallbackNote = data && data.fallbackUsed
      ? '<p class="smart-lookup-fallback-note smart-age-notice-line">A backup provider helped produce this result.</p>'
      : '';
    var qualifier = sourceQualifier(data);
    var qualifierHtml = qualifier
      ? '<p class="smart-lookup-source-note smart-age-notice-line">' + escapeHtml(qualifier) + '</p>'
      : '';
    var serialDetectedHtml = renderSerialDetected(data);
    // Prefer the strongest identity fields for the report title. Suppress the
    // broad-guidance badge once research has named a specific product.
    var productHeading = productIdentityHeading(data);
    var identifiedProduct = data && data.likelyProduct ? data.likelyProduct : '';
    var hasNamedProduct = Boolean(identifiedProduct || data && data.displayName || exactModelDisplay || productFamily || brandValue);
    var precisionLabel = data && !identifiedProduct && !data.displayName && PRECISION_HEADINGS[data.precisionLevel];
    var precisionBadgeHtml = precisionLabel
      ? '<p class="smart-lookup-precision-badge">' + escapeHtml(precisionLabel) + '</p>'
      : '';
    var precisionNote = identifiedProduct || (data && data.displayName) ? '' : precisionExplanation(data);
    // Concrete, itemized refinement guidance takes priority over the single
    // generic refinementSuggestion sentence.
    var recommendedIdentifiers = Array.isArray(data && data.recommendedIdentifiers) ? data.recommendedIdentifiers : [];
    var refinementHtml = recommendedIdentifiers.length
      ? '<div class="smart-lookup-refinement"><p class="smart-lookup-try-next">To narrow this result:</p><ul>' +
        recommendedIdentifiers.map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('') +
        '</ul></div>'
      : (data && data.refinementSuggestion
        ? '<p class="smart-lookup-try-next">Try this next: ' + escapeHtml(data.refinementSuggestion) + '</p>'
        : '');
    var timingCompact = compactTimingDisplay(data);
    var confidenceText = confidenceLabel(data);
    var specificityText = specificityLabel(data);
    var contextText = data && (data.historicalContext || data.inventionSummary) || '';
    var unitCaveatText = unitDateEvidence
      ? ''
      : ('This describes '
        + (identifiedProduct || exactModelDisplay || data && data.displayName ? 'the product/model era' : 'historical context')
        + ', not the manufacture date of your individual unit.'
        + (data && data.serialNeededForExactUnitDate ? ' Enter the serial number to narrow it to your unit.' : ''));
    var timingMetricLabel = unitDateEvidence
      ? 'Unit timing'
      : (identifiedProduct || exactModelDisplay || data && data.displayName ? 'Estimated timing' : 'Historical timing');
    var confidenceMetricHtml = confidenceText
      ? '<span class="smart-age-confidence smart-age-confidence--' + escapeHtml(String(confidenceText).toLowerCase()) + '">'
        + escapeHtml(confidenceText)
        + '</span>'
      : '';
    var bestAvailableHtml = '';
    if (hasNamedProduct) {
      bestAvailableHtml = '<div class="smart-lookup-best-result smart-age-summary-panel">'
        + '<div class="smart-age-summary-main">'
        + '<p class="smart-age-eyebrow">Best available result</p>'
        + '<h3 class="smart-lookup-best-product smart-age-report__product">' + escapeHtml(productHeading) + '</h3>'
        + (categoryValue ? '<p class="smart-lookup-best-type">' + escapeHtml(categoryValue) + '</p>' : '')
        + (contextText ? '<p class="smart-age-summary-context">' + escapeHtml(contextText) + '</p>' : '')
        + (unitCaveatText ? '<p class="smart-lookup-unit-caveat">' + escapeHtml(unitCaveatText) + '</p>' : '')
        + '</div>'
        + '<div class="smart-age-summary-metrics" role="group" aria-label="Summary metrics">'
        + summaryMetricRow(
          timingMetricLabel,
          '<span class="smart-age-metric-timing" title="' + escapeHtml(timingCompact.full) + '" aria-label="' + escapeHtml(timingCompact.full) + '">'
            + escapeHtml(timingCompact.display)
            + '</span>',
          timingCompact.display
        )
        + (specificityText ? summaryMetricRow('Scope', null, specificityText) : '')
        + (confidenceText ? summaryMetricRow('Confidence', confidenceMetricHtml, confidenceText) : '')
        + '</div>'
        + '</div>';
    }
    var caveats = Array.isArray(data && data.caveats) ? data.caveats.slice(0, 3) : [];
    var keepInMindItems = caveats.slice();
    if (data && data.refinementSuggestion && !recommendedIdentifiers.length) {
      keepInMindItems.push(data.refinementSuggestion);
    }
    if (data && data.evidenceConflict && data.evidenceConflictKind === 'brand') {
      keepInMindItems.push('Your original entry was preserved. Confirm the brand and model printed on the product label.');
    }
    // Deduplicate against hero caveat and notes so explanation cards do not
    // restate content already shown above.
    var notesText = data && data.notes ? normalize(data.notes) : '';
    var unitCaveatNorm = unitCaveatText ? normalize(unitCaveatText) : '';
    var contextNorm = contextText ? normalize(contextText) : '';
    keepInMindItems = keepInMindItems.filter(function (item, index, list) {
      if (!item) return false;
      var normalizedItem = normalize(item);
      if (notesText && normalizedItem === notesText) return false;
      if (unitCaveatNorm && normalizedItem === unitCaveatNorm) return false;
      if (contextNorm && normalizedItem === contextNorm) return false;
      return list.findIndex(function (other) { return normalize(other) === normalizedItem; }) === index;
    }).slice(0, 5);
    var keepInMindHtml = keepInMindItems.length
      ? '<div class="info-block smart-lookup-caveats smart-age-explain-card"><h4>Things to Keep in Mind</h4><ul>'
        + keepInMindItems.map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('')
        + '</ul></div>'
      : '';
    var alternatives = Array.isArray(data && data.alternativeMatches) ? data.alternativeMatches.slice(0, 3) : [];
    var alternativesHtml = alternatives.length
      ? '<div class="info-block smart-lookup-alternatives"><h4>Other possible matches</h4><ul>' +
        alternatives.map(function (item) {
          return '<li><span class="smart-alt-product">' + escapeHtml(item.product) + '</span>'
            + (item.confidence ? ' &mdash; ' + escapeHtml(item.confidence) + ' confidence' : '')
            + (item.reason ? '<br>' + escapeHtml(item.reason) : '')
            + '</li>';
        }).join('') + '</ul></div>'
      : '';

    var meansParts = [];
    if (data && data.notes) meansParts.push('<p>' + escapeHtml(data.notes) + '</p>');
    // Historical context already appears in the hero when present — omit here.
    if (contextText && !hasNamedProduct && !(data && data.notes && normalize(data.notes) === normalize(contextText))) {
      meansParts.push('<p>' + escapeHtml(contextText) + '</p>');
    }
    if (precisionNote && !(data && data.notes && normalize(data.notes).indexOf(normalize(precisionNote)) !== -1)) {
      meansParts.push('<p>' + escapeHtml(precisionNote) + '</p>');
    }
    var whatYearMeansHtml = meansParts.length
      ? '<div class="info-block notes smart-age-explain-card"><h4>What This Year Means</h4>' + meansParts.join('') + '</div>'
      : '';

    var evidenceSourceLabel = '';
    if (data && data.evidenceSource) {
      if (isGroundedProviderResult(data)) evidenceSourceLabel = 'Live web research';
      else if (data.source === 'cache' || data.cacheStatus === 'hit') evidenceSourceLabel = 'Cached result';
      else if (data.source === 'decoder-verified' || data.evidenceSource === 'user-verified') evidenceSourceLabel = 'Verified local model evidence';
      else if (data.source === 'static' || data.evidenceSource === 'heuristic' || data.evidenceSource === 'local-db' || data.source === 'local-db') {
        evidenceSourceLabel = 'Local model evidence';
      } else if (isUngroundedProviderResult(data)) {
        evidenceSourceLabel = 'AI-assisted analysis';
      } else {
        evidenceSourceLabel = estimateBasisLabel(data.evidenceSource);
      }
    } else if (data && data.source === 'cache') {
      evidenceSourceLabel = 'Cached result';
    }

    // Confidence rows: accurate labels only. Individual-unit confidence is
    // omitted unless the result actually contains unit-specific evidence.
    var identityConfidenceRow = data && data.identityConfidence
      ? detailMetaRow('Identity confidence', capitalizeLabel(data.identityConfidence))
      : '';
    var unitTimingConfidenceRow = '';
    var estimateConfidenceRow = '';
    if (unitDateEvidence && data && data.timingConfidence) {
      unitTimingConfidenceRow = detailMetaRow('Individual-unit date confidence', capitalizeLabel(data.timingConfidence));
    } else if (!unitDateEvidence && data && data.timingConfidence) {
      estimateConfidenceRow = detailMetaRow('Estimate confidence', capitalizeLabel(data.timingConfidence));
    } else if (!unitDateEvidence && context && context.confidence && !(data && data.identityConfidence)) {
      estimateConfidenceRow = detailMetaRow('Estimate confidence', capitalizeLabel(context.confidence));
    }

    var leftDetailRows = [
      detailMetaRow('Brand', brandValue || 'Not identified'),
      productFamily ? detailMetaRow('Product family', productFamily) : '',
      detailMetaRow('Exact model', exactModel),
      seriesValue ? detailMetaRow('Series', seriesValue) : '',
      categoryValue ? detailMetaRow('Category', categoryValue) : '',
      data && data.screenSize ? detailMetaRow('Screen size', data.screenSize + ' inches') : '',
    ].join('');

    var rightDetailRows = [
      data && data.productionRange ? detailMetaRow('Known production/availability', formatRange(data.productionRange, data.yearRange)) : '',
      data && data.bestEstimateYear ? detailMetaRow('Best estimate', 'Approximately ' + data.bestEstimateYear) : '',
      detailMetaRow('Individual manufacture date', manufactureMessage),
      data && data.estimateBasis ? detailMetaRow('Estimate basis', estimateBasisLabel(data.estimateBasis)) : '',
      evidenceSourceLabel ? detailMetaRow('Evidence source', evidenceSourceLabel) : '',
      identityConfidenceRow,
      estimateConfidenceRow,
      unitTimingConfidenceRow,
      enteredDiffersFromCanonical ? detailMetaRow('Entered model', data.enteredModel) : '',
      enteredDiffersFromCanonical ? detailMetaRow('Canonical model', data.canonicalModel) : '',
      data && data.evidenceConflict && data.recognizedBrand ? detailMetaRow('Recognized model brand', data.recognizedBrand) : '',
    ].join('');

    var noticesHtml = [conflictNote, fallbackNote, qualifierHtml, precisionBadgeHtml, canonicalNote]
      .filter(Boolean)
      .join('');

    var yearAria = yearLabel + ': ' + primaryYear
      + (estimateTypeLabel ? ' (' + estimateTypeLabel + ')' : '');

    return '<article class="smart-age-result smart-year-context-result smart-age-report">'
      + '<header class="smart-age-report__header">'
      + searchIconHtml()
      + '<h2 class="smart-age-report__title">Smart Lookup Results</h2>'
      + '</header>'
      + '<div class="smart-age-report__body">'
      + serialDetectedHtml
      + '<div class="smart-age-hero">'
      + '<div class="smart-year-context-primary smart-age-hero__year" aria-label="' + escapeHtml(yearAria) + '">'
      + '<span class="smart-year-context-value">' + escapeHtml(primaryYear) + '</span>'
      + '<span class="smart-year-context-label">' + escapeHtml(yearLabel) + '</span>'
      + (estimateTypeLabel
        ? '<span class="smart-age-estimate-type">' + escapeHtml(estimateTypeLabel) + '</span>'
        : '')
      + '</div>'
      + (bestAvailableHtml || (
        '<div class="smart-age-summary-panel">'
        + '<div class="smart-age-summary-main">'
        + '<h3 class="smart-lookup-best-product smart-age-report__product">' + escapeHtml(productHeading) + '</h3>'
        + '</div></div>'
      ))
      + '</div>'
      + (noticesHtml ? '<div class="smart-age-notices">' + noticesHtml + '</div>' : '')
      + '<div class="smart-age-detail-grid" role="group" aria-label="Result details">'
      + '<dl class="smart-age-detail-col">' + leftDetailRows + '</dl>'
      + '<dl class="smart-age-detail-col">' + rightDetailRows + '</dl>'
      + '</div>'
      + variantsHtml
      + ((whatYearMeansHtml || keepInMindHtml)
        ? '<div class="smart-age-explain-grid">' + whatYearMeansHtml + keepInMindHtml + '</div>'
        : '')
      + alternativesHtml
      + (recommendedIdentifiers.length ? refinementHtml : '')
      + '<div class="smart-age-evidence">'
      + evidenceHtml
      + renderGroundedSources(data)
      + '</div>'
      + renderItemAssistReferral(data, context, manufactureAmbiguous)
      + '</div>'
      + '</article>';
  }

  var LKQ_RELATIONSHIP_LABELS = {
    'direct-successor': 'Direct manufacturer successor',
    'same-series-successor': 'Same-series successor',
    'functional-equivalent': 'Current functional equivalent',
    'similar-alternative': 'Similar alternative',
    'none-found': 'No defensible replacement found',
  };

  var LKQ_COMPATIBILITY_LABELS = {
    'likely-compatible': 'Likely compatible',
    'compatible-with-caveats': 'Compatible with caveats',
    'not-directly-compatible': 'Not directly compatible',
    unknown: 'Compatibility unknown',
  };

  function isGroundedLkqResult(data) {
    return Boolean(data)
      && (data.evidenceSource === 'manufacturer-grounded' || data.evidenceSource === 'retailer-grounded' || data.evidenceSource === 'mixed-grounded')
      && Array.isArray(data.sources)
      && data.sources.length > 0;
  }

  function isLkqTimeoutFallbackResult(data) {
    return Boolean(data) && data.groundedFallback === true && !isGroundedLkqResult(data);
  }

  // A deterministic (Phase 8) replacement card was never produced by any
  // provider call -- it must never be described as AI-assisted or grounded,
  // even though it shares the same success/candidate rendering as a real
  // provider result. Checked before every other qualifier below.
  function isDeterministicLkqFallback(data) {
    return Boolean(data) && data.deterministicFallbackUsed === true;
  }

  function lkqSourceQualifier(data) {
    if (isDeterministicLkqFallback(data)) {
      return 'Deterministic Decode My Item model-line/family guidance; live replacement research did not complete.';
    }
    if (isGroundedLkqResult(data)) {
      var retrievedOn = data.retrievedAt ? String(data.retrievedAt).slice(0, 10) : '';
      return 'Grounded in live Google Search results' + (retrievedOn ? ' retrieved ' + retrievedOn : '') + '; review the cited sources below.';
    }
    if (isLkqTimeoutFallbackResult(data)) {
      return 'AI-assisted replacement research completed, but live web verification timed out. Review this as an estimate rather than a source-verified finding.';
    }
    return 'AI-assisted analysis based on the information entered; no live source was verified.';
  }

  var REPLACEMENT_PRECISION_LABELS = {
    'exact-configuration': 'Exact configuration match',
    'exact-model': 'Exact model result',
    'model-line': 'Model-line guidance',
    'product-family': 'Product-family guidance',
    'brand-category': 'Broad brand/category guidance',
    'category-guidance': 'General category guidance',
  };

  var REPLACEMENT_PRECISION_NOTES = {
    'model-line': 'This result describes the recognized model line broadly -- the exact original configuration was not provided, so it may vary.',
    'product-family': 'This result describes the recognized product family broadly, not one exact original model or configuration.',
    'brand-category': 'This result describes the recognized brand and category broadly, not one specific product line.',
  };

  function renderOriginalIdentity(data) {
    var identity = data && data.originalIdentity;
    if (!identity || (!identity.brand && !identity.family && !identity.modelLine)) return '';
    var rows = [
      ['Brand', identity.brand],
      ['Product family', identity.family],
      ['Model line', identity.modelLine],
      ['Category', identity.category],
      ['Form factor', identity.formFactor],
    ].filter(function (pair) { return pair[1]; });
    if (!rows.length) return '';
    var rowsHtml = rows.map(function (pair) {
      return '<div class="result-row"><span class="result-label">' + escapeHtml(pair[0]) + '</span><span class="result-value">' + escapeHtml(pair[1]) + '</span></div>';
    }).join('');
    return '<div class="lkq-original-identity">' + rowsHtml + '</div>';
  }

  function renderStringListBlock(title, items) {
    var list = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!list.length) return '';
    return '<div class="info-block"><h4>' + escapeHtml(title) + '</h4><ul>' +
      list.map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('') + '</ul></div>';
  }

  function renderConfigurationVaries(data) {
    if (!data || !data.configurationUnknown) return '';
    return '<p class="smart-lookup-precision-note">Original configuration varies. No processor, RAM, storage, graphics, chassis size, power supply, port selection, or expansion capacity is assumed beyond what was provided.</p>';
  }

  function renderCandidateRelationship(value) {
    return LKQ_RELATIONSHIP_LABELS[value] || value;
  }

  function renderReplacementCandidates(data) {
    var candidates = Array.isArray(data && data.replacementCandidates) ? data.replacementCandidates : [];
    if (!candidates.length) return '';
    var items = candidates.map(function (candidate) {
      var label = [candidate.brand, candidate.model || candidate.family].filter(Boolean).join(' ') || 'Candidate';
      var specRows = candidate.specificationComparison && typeof candidate.specificationComparison === 'object'
        ? Object.keys(candidate.specificationComparison).map(function (key) {
            return '<div class="result-row"><span class="result-label">' + escapeHtml(key) + '</span><span class="result-value">' + escapeHtml(candidate.specificationComparison[key]) + '</span></div>';
          }).join('')
        : '';
      var differences = Array.isArray(candidate.materialDifferences) && candidate.materialDifferences.length
        ? '<ul>' + candidate.materialDifferences.map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('') + '</ul>'
        : '';
      var compatibility = candidate.compatibilityStatus
        ? '<p class="lkq-candidate-compatibility"><strong>Compatibility:</strong> ' + escapeHtml(LKQ_COMPATIBILITY_LABELS[candidate.compatibilityStatus] || candidate.compatibilityStatus) + '</p>'
        : '';
      var warnings = Array.isArray(candidate.compatibilityWarnings) && candidate.compatibilityWarnings.length
        ? '<ul>' + candidate.compatibilityWarnings.map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('') + '</ul>'
        : '';
      var pricing = Array.isArray(candidate.priceObservations) && candidate.priceObservations.length
        ? '<ul>' + candidate.priceObservations.map(function (item) { return '<li>' + formatPriceObservation(item) + '</li>'; }).join('') + '</ul>'
        : '';
      return '<div class="lkq-candidate">' +
        '<h4>#' + escapeHtml(candidate.rank) + ' ' + escapeHtml(label) + ' — ' + escapeHtml(renderCandidateRelationship(candidate.relationship)) + '</h4>' +
        (candidate.category ? '<p class="lkq-candidate-category">' + escapeHtml(candidate.category) + '</p>' : '') +
        (candidate.fitReason ? '<p>' + escapeHtml(candidate.fitReason) + '</p>' : '') +
        specRows +
        differences +
        compatibility +
        warnings +
        pricing +
        '</div>';
    }).join('');
    return '<div class="lkq-candidates"><h4>Ranked replacement candidates</h4>' + items + '</div>';
  }

  function renderLkqCompatibility(data) {
    var status = data && data.compatibilityStatus;
    if (!status) return '';
    var warnings = Array.isArray(data.compatibilityWarnings) ? data.compatibilityWarnings : [];
    var warningsHtml = warnings.length
      ? '<ul>' + warnings.map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('') + '</ul>'
      : '';
    return '<div class="lkq-compatibility"><h4>Compatibility: ' + escapeHtml(LKQ_COMPATIBILITY_LABELS[status] || status) + '</h4>' + warningsHtml + '</div>';
  }

  function formatPriceObservation(item) {
    var priceText = '$' + Number(item.price).toFixed(2);
    var typeText = item.priceType === 'sale' ? ' (sale price)' : '';
    var conditionText = item.condition && item.condition !== 'new' ? ' (' + item.condition + ')' : '';
    var stockText = item.stockStatus === 'out-of-stock' ? ' — out of stock' : '';
    var dateText = item.observedAt ? ' as of ' + String(item.observedAt).slice(0, 10) : '';
    return escapeHtml(item.seller) + ': ' + escapeHtml(priceText) + typeText + conditionText + stockText + dateText;
  }

  function renderLkqPricing(data) {
    var observations = Array.isArray(data && data.priceObservations) ? data.priceObservations : [];
    if (!observations.length) return '';
    var rows = observations.map(function (item) { return '<li>' + formatPriceObservation(item) + '</li>'; }).join('');
    var rangeHtml = '';
    // A range only ever renders when the schema itself already computed one
    // (>=2 qualifying observations or one manufacturer-labeled price); a
    // single retailer observation is never presented as a market range.
    if (data.replacementCostRange) {
      var range = data.replacementCostRange;
      var rangeText = range.low === range.high
        ? '$' + Number(range.low).toFixed(2)
        : '$' + Number(range.low).toFixed(2) + '–$' + Number(range.high).toFixed(2);
      var basisText = range.basis === 'manufacturer-listed' ? 'manufacturer-listed price' : 'based on multiple current observations';
      rangeHtml = '<p class="lkq-price-range"><strong>Replacement-cost guidance:</strong> ' + escapeHtml(rangeText) + ' (' + escapeHtml(basisText) + ')</p>';
    }
    return '<div class="lkq-pricing"><h4>Current price observations</h4>' + rangeHtml + '<ul>' + rows + '</ul></div>';
  }

  function renderLkqSources(data) {
    if (!isGroundedLkqResult(data)) return '';
    var items = data.sources.slice(0, 5).map(function (item) {
      if (!item || !item.title) return '';
      var label = escapeHtml(item.title);
      if (item.uri && /^https:\/\//i.test(item.uri)) {
        return '<li><a href="' + escapeHtml(item.uri) + '" target="_blank" rel="noopener nofollow">' + label + '</a></li>';
      }
      return '<li>' + label + '</li>';
    }).filter(Boolean).join('');
    if (!items) return '';
    return '<details class="determination-details smart-lookup-sources"><summary>Sources consulted</summary><ul>' + items + '</ul></details>';
  }

  function renderReplacement(data) {
    var legacyOptions = Array.isArray(data && data.replacementOptions) ? data.replacementOptions : [];
    var relationship = data && data.replacementRelationship;
    var replacement = data && data.replacement;
    var hasGroundedResult = Boolean(relationship && relationship !== 'none-found' && replacement);
    var hasProgressiveGuidance = hasProgressiveReplacementGuidance(data);

    if (!hasGroundedResult && !legacyOptions.length && !hasProgressiveGuidance) {
      return noResultCard(REPLACEMENT_UNAVAILABLE_COPY, 'replacement');
    }

    var html = '<div class="smart-replacement-result"><h3>Replacement Research</h3>';

    // Every precision-badge/identity/configuration-varies addition below is
    // gated to non-exact tiers only, so exact-model rendering (the existing,
    // already-tested path) stays pixel-for-pixel unchanged.
    var precision = data && data.replacementPrecision;
    var isNonExactPrecision = precision === 'model-line' || precision === 'product-family'
      || precision === 'brand-category' || precision === 'category-guidance';
    if (isNonExactPrecision) {
      var precisionLabel = REPLACEMENT_PRECISION_LABELS[precision];
      if (precisionLabel) html += '<p class="smart-lookup-precision-badge">' + escapeHtml(precisionLabel) + '</p>';
      var precisionNote = REPLACEMENT_PRECISION_NOTES[precision];
      if (precisionNote) html += '<p class="smart-lookup-precision-note">' + escapeHtml(precisionNote) + '</p>';
      html += renderOriginalIdentity(data);
      html += renderConfigurationVaries(data);
    }

    if (relationship === 'none-found' && data.replacementRationale) {
      // A deterministic reserve means research never completed -- saying we
      // "found" nothing would misrepresent a timeout as an exhaustive search.
      var noneFoundHeading = isDeterministicLkqFallback(data)
        ? 'Replacement research did not complete'
        : 'No single defensible replacement found';
      html += '<div class="info-block"><h4>' + noneFoundHeading + '</h4><p>' + escapeHtml(data.replacementRationale) + '</p></div>';
    }

    if (hasGroundedResult) {
      var replacementLabel = [replacement.brand, replacement.model || replacement.name].filter(Boolean).join(' ') || 'Replacement identified';
      html += '<div class="lkq-best-match"><h4>' + escapeHtml(LKQ_RELATIONSHIP_LABELS[relationship] || relationship) + '</h4>' +
        '<p class="smart-lookup-source-note">' + escapeHtml(lkqSourceQualifier(data)) + '</p>' +
        '<p><strong>' + escapeHtml(replacementLabel) + '</strong></p>' +
        (data.replacementRationale ? '<p>' + escapeHtml(data.replacementRationale) + '</p>' : '') +
        '</div>';
      var differences = Array.isArray(data.materialDifferences) ? data.materialDifferences : [];
      if (differences.length) {
        html += '<div class="lkq-differences"><h4>Important specification differences</h4><ul>' +
          differences.map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('') + '</ul></div>';
      }
      html += renderLkqCompatibility(data);
      html += renderLkqPricing(data);
      html += renderLkqSources(data);
    } else if (hasProgressiveGuidance) {
      // No single named replacement, but a recognized model-line/family/
      // brand-category query still has useful broad guidance -- render it
      // instead of falling through to the unavailable card.
      html += '<p class="smart-lookup-source-note">' + escapeHtml(lkqSourceQualifier(data)) + '</p>';
      html += renderReplacementCandidates(data);
      html += renderStringListBlock('Known configuration variants', data.knownConfigurationVariants);
      html += renderStringListBlock('Compare candidates on', data.comparisonCriteria);
      html += renderStringListBlock('Recommended minimum specifications', data.recommendedMinimumSpecs);
      html += renderStringListBlock('Assumptions', data.assumptions);
      html += renderStringListBlock('Specifications not known from this query', data.unknownOriginalSpecs);
      html += renderLkqSources(data);
    }

    if (isNonExactPrecision && Array.isArray(data.recommendedIdentifiers) && data.recommendedIdentifiers.length) {
      html += '<div class="smart-lookup-refinement"><p class="smart-lookup-try-next"><strong>To narrow this result:</strong></p><ul>' +
        data.recommendedIdentifiers.map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('') + '</ul></div>';
    }

    if (legacyOptions.length) {
      html += legacyOptions.map(function (item) {
        return '<div class="lkq-option"><h4>' + escapeHtml(item.name || item.model || 'Replacement option') + '</h4>' +
          '<p><strong>Rating:</strong> ' + escapeHtml(item.lkqRating || 'Review') + '</p>' +
          '<p><strong>Model:</strong> ' + escapeHtml(item.model || 'Not verified') + '</p>' +
          '<p><strong>Price:</strong> ' + escapeHtml(item.priceRange || 'Unavailable - unverified') + '</p>' +
          '<p>' + escapeHtml(item.notes || '') + '</p></div>';
      }).join('');
    }

    return html + '</div>';
  }

  function currentAgeStageMessage() {
    var idx = state.age.stageIndex || 0;
    var stage = AGE_LOADING_STAGES[Math.min(idx, AGE_LOADING_STAGES.length - 1)];
    return stage.message;
  }

  function clearAgeStageTimers() {
    (state.ageStageTimers || []).forEach(function (id) { clearTimeout(id); });
    state.ageStageTimers = [];
  }

  function scheduleAgeStages(sequence, query, wantReplacement) {
    clearAgeStageTimers();
    var timers = [];
    var stageIndex;
    for (stageIndex = 1; stageIndex < AGE_LOADING_STAGES.length; stageIndex += 1) {
      (function (index) {
        var id = setTimeout(function () {
          if (sequence !== state.sequence || state.age.status !== 'loading') return;
          state.age.stageIndex = index;
          render(query, wantReplacement);
        }, AGE_LOADING_STAGES[index].atMs);
        timers.push(id);
      }(stageIndex));
    }
    state.ageStageTimers = timers;
  }

  function render(query, includeReplacementState) {
    ensureShell();
    if (state.age.status === 'loading') setPanel('age', loadingCard(currentAgeStageMessage()));
    if (state.age.status === 'success') setPanel('age', renderAge(state.age.data));
    if (state.age.status === 'error') setPanel('age', noResultCard(state.age.copy, 'age'));

    if (!includeReplacementState) {
      setPanel('replacement', '');
      return;
    }
    if (state.replacement.status === 'loading') setPanel('replacement', loadingCard(REPLACEMENT_LOADING_MESSAGE));
    if (state.replacement.status === 'success') setPanel('replacement', renderReplacement(state.replacement.data));
    if (state.replacement.status === 'error') setPanel('replacement', noResultCard(state.replacement.copy || REPLACEMENT_UNAVAILABLE_COPY, 'replacement'));
  }

  function fetchJson(url, body, signal) {
    var key = url + '|' + JSON.stringify(body || {});
    if (inflight.has(key)) return inflight.get(key);
    var recentHit = recent.get(key);
    if (recentHit && Date.now() - recentHit.startedAt < 1000) return recentHit.promise;
    var promise = fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      signal: signal,
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (payload) {
        if (!response.ok && response.status !== 429) throw new Error(payload.error || 'Request failed');
        return payload;
      });
    }).finally(function () {
      inflight.delete(key);
    });
    inflight.set(key, promise);
    recent.set(key, { promise: promise, startedAt: Date.now() });
    setTimeout(function () {
      var current = recent.get(key);
      if (current && current.promise === promise) recent.delete(key);
    }, 1200);
    return promise;
  }

  function run(requestedQuery, options) {
    var query = normalize(requestedQuery != null ? requestedQuery : ($('smart-lookup-input') || {}).value);
    var notes = normalizeNotes(options && options.notes != null ? options.notes : lookupNotes());
    var wantReplacement = options && typeof options.includeReplacement === 'boolean' ? options.includeReplacement : includeReplacement();
    if (!query) {
      if (state.controller) state.controller.abort();
      state.sequence += 1;
      clearAgeStageTimers();
      state.fingerprint = '';
      state.age = { status: 'error', data: null, error: null, stageIndex: 0, copy: AGE_OUTCOME_COPY['missing-input'] };
      state.replacement = { status: 'idle', data: null, error: null, copy: null };
      setBusy(false);
      showResults();
      render('', false);
      var input = $('smart-lookup-input');
      if (input) input.focus();
      return;
    }
    var nextFingerprint = fingerprint(query, wantReplacement, notes);
    var now = Date.now();
    if (state.fingerprint === nextFingerprint && (state.age.status === 'loading' || now - state.lastStartedAt < 750)) return;
    state.sequence += 1;
    var sequence = state.sequence;
    state.fingerprint = nextFingerprint;
    state.lastStartedAt = now;
    if (state.controller) state.controller.abort();
    state.controller = new AbortController();
    clearAgeStageTimers();
    state.age = { status: 'loading', data: null, error: null, stageIndex: 0, copy: null };
    state.replacement = wantReplacement ? { status: 'loading', data: null, error: null, copy: null } : { status: 'idle', data: null, error: null, copy: null };
    setBusy(true);
    showResults();
    render(query, wantReplacement);
    scheduleAgeStages(sequence, query, wantReplacement);

    var requests = [];
    var ageRequest = fetchJson('/api/age-lookup', requestBody(query, notes), state.controller.signal).then(function (data) {
      if (sequence !== state.sequence || state.fingerprint !== nextFingerprint) return;
      clearAgeStageTimers();
      var bucket = classifyAgeOutcome(data);
      state.age = bucket === 'success'
        ? { status: 'success', data: data, error: null, copy: null }
        : { status: 'error', data: null, error: null, copy: copyForAgeOutcome(bucket, data) };
      render(query, wantReplacement);
    }).catch(function (error) {
      if (sequence !== state.sequence || error.name === 'AbortError') return;
      clearAgeStageTimers();
      state.age = { status: 'error', data: null, error: null, copy: AGE_OUTCOME_COPY['network-error'] };
      render(query, wantReplacement);
    });
    requests.push(ageRequest);

    if (wantReplacement) {
      var replacementRequest = fetchJson('/api/lkq-lookup', requestBody(query, notes), state.controller.signal).then(function (data) {
        if (sequence !== state.sequence || state.fingerprint !== nextFingerprint) return;
        var bucket = classifyReplacementOutcome(data);
        state.replacement = bucket === 'success'
          ? { status: 'success', data: data, error: null, copy: null }
          : { status: 'error', data: null, error: null, copy: copyForReplacementOutcome(data) };
        render(query, wantReplacement);
      }).catch(function (error) {
        if (sequence !== state.sequence || error.name === 'AbortError') return;
        state.replacement = { status: 'error', data: null, error: null, copy: REPLACEMENT_UNAVAILABLE_COPY };
        render(query, wantReplacement);
      });
      requests.push(replacementRequest);
    }
    Promise.allSettled(requests).then(function () {
      if (sequence === state.sequence && state.fingerprint === nextFingerprint) setBusy(false);
    });
  }

  function bind() {
    var input = $('smart-lookup-input');
    var buttons = [];
    var legacyButton = $('smartLookupBtn');
    if (legacyButton) buttons.push(legacyButton);
    Array.prototype.forEach.call(document.querySelectorAll('[data-smart-lookup-submit="1"]'), function (button) { buttons.push(button); });
    buttons.forEach(function (button) {
      if (button.getAttribute('data-smart-controller-bound') === '1') return;
      button.setAttribute('data-smart-controller-bound', '1');
      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopImmediatePropagation();
        run();
      }, true);
    });
    if (input && input.getAttribute('data-smart-controller-bound') !== '1') {
      input.setAttribute('data-smart-controller-bound', '1');
      input.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        event.stopImmediatePropagation();
        run();
      }, true);
    }
    document.addEventListener('click', function (event) {
      var retry = event.target && event.target.closest ? event.target.closest('[data-smart-lookup-retry]') : null;
      if (retry) {
        event.preventDefault();
        event.stopImmediatePropagation();
        run();
        return;
      }
      var editButton = event.target && event.target.closest ? event.target.closest('[data-smart-lookup-edit="1"]') : null;
      if (editButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        var searchInput = $('smart-lookup-input');
        if (searchInput) {
          searchInput.focus();
          if (searchInput.select) searchInput.select();
        }
        return;
      }
      // ItemAssist referral CTA — same analytics event as Serial Decoder.
      var upsellCta = event.target && event.target.closest
        ? event.target.closest('[data-item-assist-upsell-cta="1"]')
        : null;
      if (upsellCta) {
        var upsellCard = upsellCta.closest('[data-item-assist-upsell="1"]');
        trackSmartAnalytics('item_assist_upsell_clicked', {
          context: 'item-assist-upsell',
          category: upsellCard ? upsellCard.getAttribute('data-category') || undefined : undefined,
          resultStatus: upsellCard ? upsellCard.getAttribute('data-result-status') || undefined : undefined,
        });
      }
    }, true);

    // Keep aria-expanded in sync for native <details> accordions in the
    // redesigned age card (and any replacement details that use the same class).
    document.addEventListener('toggle', function (event) {
      var details = event.target;
      if (!details || details.tagName !== 'DETAILS') return;
      if (!details.classList || !details.classList.contains('determination-details')) return;
      var summary = details.querySelector('summary');
      if (summary) summary.setAttribute('aria-expanded', details.open ? 'true' : 'false');
      // Match Serial Decoder: fire once when the upsell "What's included?" opens.
      if (details.open && details.closest && details.closest('[data-item-assist-upsell="1"]')) {
        trackSmartAnalytics('item_assist_upsell_details_expanded', { context: 'item-assist-upsell' });
      }
    }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
  window.SmartLookupController = { run: run };
  window.runLKQLookup = function () { run(); };
}());
