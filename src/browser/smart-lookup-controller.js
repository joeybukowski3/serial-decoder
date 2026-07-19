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
  };

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
    if (data.productFamily && data.yearContext && data.yearContext.type === 'unknown') return 'product-year-unverified';
    if (data.productFamily && data.exactModel) return 'exact-model-insufficient';
    if (data.productFamily) return 'product-family-recognized';
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
    if (bucket === 'rate-limited' && data && data.notes) {
      return { heading: base.heading, body: data.notes, tryNext: base.tryNext };
    }
    return base;
  }

  function classifyReplacementOutcome(data) {
    if (!data) return 'network-error';
    if (Array.isArray(data.replacementOptions) && data.replacementOptions.length) return 'success';
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

  function isUngroundedProviderResult(data) {
    var source = String((data && (data.evidenceSource || data.source || data.originSource)) || '').toLowerCase();
    return source === 'gemini-ungrounded'
      || source === 'groq-ungrounded'
      || source === 'gemini'
      || source === 'groq';
  }

  function sourceQualifier(data) {
    if (!data) return '';
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
    if (isUngroundedProviderResult(data)) return 'Analysis basis';
    if (data && (data.source === 'cache' || data.cacheStatus === 'hit')) return 'Information considered';
    return 'How this result was determined';
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
    return '<div class="smart-age-result smart-year-context-result">' +
      '<h3>' + escapeHtml(resultHeading(data)) + '</h3>' +
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
      (data && data.refinementSuggestion ? '<p class="smart-lookup-try-next"><strong>Try this next:</strong> ' + escapeHtml(data.refinementSuggestion) + '</p>' : '') +
      evidenceHtml +
      '</div>';
  }

  function renderReplacement(data) {
    var options = Array.isArray(data && data.replacementOptions) ? data.replacementOptions : [];
    if (!options.length) {
      return noResultCard(REPLACEMENT_UNAVAILABLE_COPY, 'replacement');
    }
    return '<div class="smart-replacement-result"><h3>Replacement Research</h3>' + options.map(function (item) {
      return '<div class="lkq-option"><h4>' + escapeHtml(item.name || item.model || 'Replacement option') + '</h4>' +
        '<p><strong>Rating:</strong> ' + escapeHtml(item.lkqRating || 'Review') + '</p>' +
        '<p><strong>Model:</strong> ' + escapeHtml(item.model || 'Not verified') + '</p>' +
        '<p><strong>Price:</strong> ' + escapeHtml(item.priceRange || 'Unavailable - unverified') + '</p>' +
        '<p>' + escapeHtml(item.notes || '') + '</p></div>';
    }).join('') + '</div>';
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
