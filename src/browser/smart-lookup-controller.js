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
      body: 'The lookup took too long, so we stopped before guessing.',
      tryNext: 'Try again, or add more item details.',
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
    PROVIDER_EMPTY: 1,
    GROQ_EMPTY: 1,
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
    if (code === 'RATE_LIMIT') return 'rate-limited';
    if (code === 'PROVIDER_TIMEOUT' || code === 'TOTAL_DEADLINE') return 'timeout';
    if (code === 'INTRODUCTION_AFTER_RANGE' || code === 'REVERSED_RANGE') return 'conflict';
    if (code && MALFORMED_AGE_ERROR_CODES[code]) return 'malformed';
    if (hasUsableAgeInfo(data)) return 'success';
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
    var brand = data && data.brand && data.brand !== 'Unknown' ? data.brand : '';
    if (data && data.exactModel) return [brand, data.exactModel].filter(Boolean).join(' ');
    if (data && data.displayName) return data.displayName;
    if (data && data.productFamily) {
      if (brand === 'LG' && /^OLED\b/i.test(data.seriesLine || '')) return brand + ' ' + data.productFamily + ' OLED TV';
      return [brand, data.productFamily, data.category === 'television' ? 'TV' : ''].filter(Boolean).join(' ');
    }
    return [brand, data && data.model].filter(Boolean).join(' ') || 'Smart Lookup result';
  }

  function providerName(value) {
    var source = String(value || '').toLowerCase();
    if (source === 'groq' || source === 'groq-ungrounded') return 'Groq';
    if (source === 'gemini' || source === 'gemini-ungrounded') return 'Gemini';
    return '';
  }

  function isGroundedProviderResult(data) {
    var evidence = data ? String(data.evidenceSource || '').toLowerCase() : '';
    return Boolean(data)
      && (evidence === 'gemini-grounded' || evidence === 'openai-web')
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
      || source === 'gemini-grounded'
      || source === 'openai-ungrounded'
      || source === 'openai-web'
      || source === 'gemini'
      || source === 'groq'
      || source === 'openai';
  }

  function retrievedDateLabel(data) {
    if (!data || !data.retrievedAt) return '';
    var parsed = new Date(data.retrievedAt);
    if (isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
  }

  function isGroundedTimeoutFallbackResult(data) {
    // groundedFallback is reserved exclusively for a real AI (Gemini/Groq)
    // recovery of a timed-out grounded attempt (fallbackKind
    // 'ungrounded-provider') -- never for a deterministic, non-AI result.
    return Boolean(data) && data.groundedFallback === true && !isGroundedProviderResult(data);
  }

  // A DIFFERENT kind of degradation than isGroundedTimeoutFallbackResult:
  // no AI (Gemini or Groq) ever ran for this result -- a recognized
  // model-line/family/brand-category query's own registry/deterministic
  // data was substituted after a provider attempt failed or timed out. This
  // must never be worded as "AI-assisted" or "research completed".
  var DETERMINISTIC_DEGRADED_WORDING = {
    'deterministic-model-line': 'We recognized this model line, but live research did not finish. This broad timeframe is based on model-line-level information rather than a source-verified exact-model lookup.',
    'deterministic-family': 'We recognized this product family, but live research did not finish. This broad timeframe is based on family-level information rather than a source-verified exact-model lookup.',
    'deterministic-brand-category': 'We recognized this brand and category, but live research did not finish. This broad guidance is based on general brand/category information rather than a source-verified lookup.',
    // Exact-model reserve: identity is confirmed deterministically, but no
    // production-range evidence exists and research did not finish. This must
    // never read as an age estimate -- no year is claimed in this result.
    'deterministic-exact-model': 'We recognized this exact model number, but live research did not finish and no verified production range is on file for it. No manufacture year is estimated here; enter the serial number for a unit-specific date.',
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
    return '<details class="determination-details smart-lookup-sources"><summary>Web sources consulted</summary><ul>' + items + '</ul></details>';
  }

  function renderAge(data) {
    var context = getYearContext(data);
    var primaryYear = formatYearContext(context);
    var yearLabel = context && context.label ? context.label : 'Year context';
    var manufactureMessage = context && context.isExactUnitDate
      ? primaryYear
      : (data && data.productFamily
        ? 'Not available without serial or exact unit evidence'
        : 'Individual manufacture date requires serial number');
    var exactModel = data && data.exactModel
      ? data.exactModel
      : (data && !data.productFamily && data.model ? data.model : 'Not provided');
    var productFamily = data && data.productFamily
      ? (data.brand === 'LG' && /^OLED\b/i.test(data.seriesLine || '') ? data.productFamily + ' OLED TV' : data.productFamily)
      : 'Not identified';
    var variants = Array.isArray(data && data.yearVariants) ? data.yearVariants : [];
    var variantsHtml = variants.length
      ? '<div class="smart-year-variants" style="margin-top:14px;padding:14px 16px;border:1px solid #dbeafe;border-radius:12px;background:#f8fbff"><h4>Model-year variants</h4><ul style="margin:8px 0 0;padding-left:20px">' + variants.map(function (item) {
          return '<li><strong>' + escapeHtml(item.name) + ':</strong> ' + escapeHtml(item.year) + ' model-year family</li>';
        }).join('') + '</ul></div>'
      : '';
    // A verified exact-alias hit resolved the entered value to a different
    // canonical model. Show both so the input never appears silently rewritten.
    var canonicalNote = '';
    if (data && data.canonicalModel && data.enteredModel
      && String(data.canonicalModel).toUpperCase() !== String(data.enteredModel).toUpperCase()) {
      canonicalNote = '<p class="smart-lookup-canonical-note">Entered model <strong>'
        + escapeHtml(data.enteredModel)
        + '</strong> is a verified label variant of canonical model <strong>'
        + escapeHtml(data.canonicalModel) + '</strong>.</p>';
    }
    // A brand/category conflict is disclosed, never silently corrected.
    var conflictNote = '';
    if (data && data.evidenceConflict) {
      conflictNote = '<div class="info-block smart-lookup-evidence-conflict"><h4>Check the '
        + (data.evidenceConflictKind === 'category' ? 'product type' : 'brand')
        + ' on the label</h4><p>'
        + escapeHtml(data.notes || 'The entered details conflict with a verified record for this model number.')
        + '</p></div>';
    }
    var evidence = Array.isArray(data && data.evidence) ? data.evidence.slice(0, 4) : [];
    var evidenceHtml = evidence.length
      ? '<details class="determination-details"><summary>' + escapeHtml(evidenceHeading(data)) + '</summary><ul>' + evidence.map(function (item) {
          return '<li>' + escapeHtml(item.detail || item.source || 'Evidence') + '</li>';
        }).join('') + '</ul></details>'
      : '';
    // fallbackUsed is real API metadata (which provider actually served this
    // result), not a guess -- safe to state plainly here.
    var fallbackNote = data && data.fallbackUsed
      ? '<p class="smart-lookup-fallback-note">A backup provider helped produce this result.</p>'
      : '';
    var qualifier = sourceQualifier(data);
    var qualifierHtml = qualifier
      ? '<p class="smart-lookup-source-note">' + escapeHtml(qualifier) + '</p>'
      : '';
    // Precision badge + plain-language "why is this broad" line -- shown
    // whenever the result is anything less than an exact model match.
    // Suppress the broad-guidance badge and note once research has actually
    // named a specific product: showing "Nintendo Switch 2" directly above
    // "not one specific model" contradicts the answer we just gave. The
    // badge still applies to genuinely broad results.
    var precisionLabel = data && !identifiedProduct && PRECISION_HEADINGS[data.precisionLevel];
    var precisionBadgeHtml = precisionLabel
      ? '<p class="smart-lookup-precision-badge">' + escapeHtml(precisionLabel) + '</p>'
      : '';
    var precisionNote = identifiedProduct ? "" : precisionExplanation(data);
    var precisionNoteHtml = precisionNote
      ? '<p class="smart-lookup-precision-note">' + escapeHtml(precisionNote) + '</p>'
      : '';
    // Concrete, itemized refinement guidance ("enter the code starting with
    // AN515...") takes priority over the single generic refinementSuggestion
    // sentence when the API supplied specific identifiers to ask for.
    var recommendedIdentifiers = Array.isArray(data && data.recommendedIdentifiers) ? data.recommendedIdentifiers : [];
    var refinementHtml = recommendedIdentifiers.length
      ? '<div class="smart-lookup-refinement"><p class="smart-lookup-try-next"><strong>To narrow this result:</strong></p><ul>' +
        recommendedIdentifiers.map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('') +
        '</ul></div>'
      : (data && data.refinementSuggestion
        ? '<p class="smart-lookup-try-next"><strong>Try this next:</strong> ' + escapeHtml(data.refinementSuggestion) + '</p>'
        : '');
    // Usefulness-first "best available result" block. Leads with WHAT the
    // product is when research identified one, so a researched identification
    // is never buried under a "complete model required" clarification.
    var identifiedProduct = data && data.likelyProduct ? data.likelyProduct : '';
    var bestAvailableHtml = '';
    if (identifiedProduct) {
      var timingText = data.releaseDate || data.estimatedEra
        || (data.introductionYear ? String(data.introductionYear) : '')
        || formatRange(data.productionRange, data.yearRange) || 'Not established';
      var confidenceText = data.identityConfidence || data.confidenceLevel || '';
      bestAvailableHtml = '<div class="info-block smart-lookup-best-result">' +
        '<h4>Best available result</h4>' +
        '<p class="smart-lookup-best-product"><strong>' + escapeHtml(identifiedProduct) + '</strong></p>' +
        (data.productType ? '<p class="smart-lookup-best-type">' + escapeHtml(data.productType) + '</p>' : '') +
        '<div class="result-row"><span class="result-label">Estimated model timing</span><span class="result-value">' + escapeHtml(timingText) + '</span></div>' +
        (confidenceText ? '<div class="result-row"><span class="result-label">Confidence</span><span class="result-value">' + escapeHtml(confidenceText.charAt(0).toUpperCase() + confidenceText.slice(1)) + '</span></div>' : '') +
        '<p class="smart-lookup-unit-caveat"><strong>Important:</strong> This describes the product/model era, not necessarily the manufacture date of your individual unit.' +
        (data.serialNeededForExactUnitDate ? ' Enter the serial number to narrow it to your unit.' : '') +
        '</p>' +
        '</div>';
    }
    var caveats = Array.isArray(data && data.caveats) ? data.caveats.slice(0, 3) : [];
    var caveatsHtml = caveats.length
      ? '<div class="info-block smart-lookup-caveats"><h4>Things to keep in mind</h4><ul>' +
        caveats.map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('') + '</ul></div>'
      : '';
    // Candidates instead of a dead end when identity is genuinely ambiguous.
    var alternatives = Array.isArray(data && data.alternativeMatches) ? data.alternativeMatches.slice(0, 3) : [];
    var alternativesHtml = alternatives.length
      ? '<div class="info-block smart-lookup-alternatives"><h4>Other possible matches</h4><ul>' +
        alternatives.map(function (item) {
          return '<li><strong>' + escapeHtml(item.product) + '</strong>'
            + (item.confidence ? ' &mdash; ' + escapeHtml(item.confidence) + ' confidence' : '')
            + (item.reason ? '<br>' + escapeHtml(item.reason) : '')
            + '</li>';
        }).join('') + '</ul></div>'
      : '';
    return '<div class="smart-age-result smart-year-context-result">' +
      '<h3>' + escapeHtml(resultHeading(data)) + '</h3>' +
      conflictNote +
      bestAvailableHtml +
      canonicalNote +
      precisionBadgeHtml +
      precisionNoteHtml +
      fallbackNote +
      qualifierHtml +
      '<div class="smart-year-context-primary" style="display:grid;gap:2px;margin:12px 0 8px;padding:18px;border:1px solid #bfdbfe;border-radius:14px;background:linear-gradient(135deg,#eff6ff,#f8fafc)"><span class="smart-year-context-value" style="font:800 clamp(2.3rem,8vw,3.6rem)/1 JetBrains Mono,monospace;color:#1d4ed8">' + escapeHtml(primaryYear) + '</span><span class="smart-year-context-label" style="font-size:.9rem;font-weight:800;color:#334155">' + escapeHtml(yearLabel) + '</span></div>' +
      '<div class="result-row"><span class="result-label">Brand</span><span class="result-value">' + escapeHtml(data && data.brand && data.brand !== 'Unknown' ? data.brand : 'Not identified') + '</span></div>' +
      (data && data.productFamily ? '<div class="result-row"><span class="result-label">Product family</span><span class="result-value">' + escapeHtml(productFamily) + '</span></div>' : '') +
      '<div class="result-row"><span class="result-label">Exact model</span><span class="result-value">' + escapeHtml(exactModel) + '</span></div>' +
      (data && data.screenSize ? '<div class="result-row"><span class="result-label">Screen size</span><span class="result-value">' + escapeHtml(data.screenSize) + ' inches</span></div>' : '') +
      (data && data.productionRange ? '<div class="result-row"><span class="result-label">Known production/availability</span><span class="result-value">' + escapeHtml(formatRange(data.productionRange, data.yearRange)) + '</span></div>' : '') +
      '<div class="result-row"><span class="result-label">Individual manufacture date</span><span class="result-value">' + escapeHtml(manufactureMessage) + '</span></div>' +
      variantsHtml +
      (data && data.notes ? '<div class="info-block notes"><h4>What this year means</h4><p>' + escapeHtml(data.notes) + '</p></div>' : '') +
      caveatsHtml +
      alternativesHtml +
      refinementHtml +
      evidenceHtml +
      renderGroundedSources(data) +
      '</div>';
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
      }
    }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
  window.SmartLookupController = { run: run };
  window.runLKQLookup = function () { run(); };
}());
