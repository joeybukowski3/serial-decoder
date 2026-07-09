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
  };

  function $(id) {
    return document.getElementById(id);
  }

  function normalize(value) {
    return String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function fingerprint(query, includeReplacement) {
    return JSON.stringify({ query: normalize(query).toLowerCase(), replacement: Boolean(includeReplacement) });
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
    if (data.introductionYear) return true;
    if (data.individualManufactureYear) return true;
    var range = data.productionRange;
    if (range && (range.start || range.end)) return true;
    return false;
  }

  function classifyAgeOutcome(data) {
    if (!data) return 'network-error';
    if (hasUsableAgeInfo(data)) return 'success';
    var code = data.errorCode || null;
    if (code === 'RATE_LIMIT') return 'rate-limited';
    if (code === 'PROVIDER_TIMEOUT' || code === 'TOTAL_DEADLINE') return 'timeout';
    if (code === 'INTRODUCTION_AFTER_RANGE' || code === 'REVERSED_RANGE') return 'conflict';
    if (code && MALFORMED_AGE_ERROR_CODES[code]) return 'malformed';
    if (code === 'INSUFFICIENT_QUERY_DETAIL') return 'missing-input';
    // No errorCode at all means the request succeeded but simply had
    // nothing useful to report. Whether a model was actually recognized
    // distinguishes "add a serial number" from "add a brand" guidance.
    if (!code) return data.model ? 'model-only-insufficient' : 'serial-only-no-brand';
    return 'unavailable-generic';
  }

  function copyForAgeOutcome(bucket, data) {
    var base = AGE_OUTCOME_COPY[bucket] || AGE_OUTCOME_COPY['unavailable-generic'];
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

  function renderAge(data) {
    var introduced = data && data.introductionYear ? data.introductionYear : 'Not established';
    var production = formatRange(data && data.productionRange, data && data.yearRange);
    var serialMessage = data && data.individualManufactureYear
      ? String(data.individualManufactureYear)
      : 'Individual manufacture date requires serial number';
    var evidence = Array.isArray(data && data.evidence) ? data.evidence.slice(0, 4) : [];
    var evidenceHtml = evidence.length
      ? '<details class="determination-details"><summary>Evidence used</summary><ul>' + evidence.map(function (item) {
          return '<li>' + escapeHtml(item.detail || item.source || 'Evidence') + '</li>';
        }).join('') + '</ul></details>'
      : '';
    // fallbackUsed is real API metadata (which provider actually served this
    // result), not a guess -- safe to state plainly here.
    var fallbackNote = data && data.fallbackUsed
      ? '<p class="smart-lookup-fallback-note">A backup data source helped verify this result.</p>'
      : '';
    return '<div class="smart-age-result">' +
      '<h3>Model Age Information</h3>' +
      fallbackNote +
      '<div class="result-row result-row--primary"><span class="result-label">Model introduced</span><span class="result-value">' + escapeHtml(introduced) + '</span></div>' +
      '<div class="result-row"><span class="result-label">Known production/availability</span><span class="result-value">' + escapeHtml(production) + '</span></div>' +
      '<div class="result-row"><span class="result-label">Individual manufacture date</span><span class="result-value">' + escapeHtml(serialMessage) + '</span></div>' +
      (data && data.notes ? '<div class="info-block notes"><h4>Notes</h4><p>' + escapeHtml(data.notes) + '</p></div>' : '') +
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
    var wantReplacement = options && typeof options.includeReplacement === 'boolean' ? options.includeReplacement : includeReplacement();
    if (!query) return;
    var nextFingerprint = fingerprint(query, wantReplacement);
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
    showResults();
    render(query, wantReplacement);
    scheduleAgeStages(sequence, query, wantReplacement);

    fetchJson('/api/age-lookup', { query: query }, state.controller.signal).then(function (data) {
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

    if (wantReplacement) {
      fetchJson('/api/lkq-lookup', { query: query }, state.controller.signal).then(function (data) {
        if (sequence !== state.sequence || state.fingerprint !== nextFingerprint) return;
        var bucket = classifyReplacementOutcome(data);
        state.replacement = bucket === 'success'
          ? { status: 'success', data: data, error: null, copy: null }
          : { status: 'error', data: null, error: null, copy: REPLACEMENT_UNAVAILABLE_COPY };
        render(query, wantReplacement);
      }).catch(function (error) {
        if (sequence !== state.sequence || error.name === 'AbortError') return;
        state.replacement = { status: 'error', data: null, error: null, copy: REPLACEMENT_UNAVAILABLE_COPY };
        render(query, wantReplacement);
      });
    }
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
