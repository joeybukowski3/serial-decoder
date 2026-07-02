(function () {
  'use strict';

  var state = {
    sequence: 0,
    fingerprint: '',
    controller: null,
    age: { status: 'idle', data: null, error: null },
    replacement: { status: 'idle', data: null, error: null },
    lastStartedAt: 0,
  };
  var inflight = new Map();
  var recent = new Map();

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

  function statusCard(title, message, retryPart) {
    return '<div class="info-block smart-lookup-status"><h4>' + escapeHtml(title) + '</h4><p>' + escapeHtml(message) + '</p>' + (retryPart || '') + '</div>';
  }

  function formatRange(range, fallback) {
    if (range && range.start && range.end) return range.start === range.end ? String(range.start) : range.start + '-' + range.end;
    return fallback || 'Not established';
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
    return '<div class="smart-age-result">' +
      '<h3>Model Age Information</h3>' +
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
      return statusCard('Replacement research unavailable', data && data.successorStatus && data.successorStatus.explanation ? data.successorStatus.explanation : 'No grounded replacement option was established.');
    }
    return '<div class="smart-replacement-result"><h3>Replacement Research</h3>' + options.map(function (item) {
      return '<div class="lkq-option"><h4>' + escapeHtml(item.name || item.model || 'Replacement option') + '</h4>' +
        '<p><strong>Rating:</strong> ' + escapeHtml(item.lkqRating || 'Review') + '</p>' +
        '<p><strong>Model:</strong> ' + escapeHtml(item.model || 'Not verified') + '</p>' +
        '<p><strong>Price:</strong> ' + escapeHtml(item.priceRange || 'Unavailable - unverified') + '</p>' +
        '<p>' + escapeHtml(item.notes || '') + '</p></div>';
    }).join('') + '</div>';
  }

  function render(query, includeReplacementState) {
    ensureShell();
    if (state.age.status === 'loading') setPanel('age', statusCard('Checking model age', 'Age information is loading.'));
    if (state.age.status === 'success') setPanel('age', renderAge(state.age.data));
    if (state.age.status === 'error') setPanel('age', statusCard('Age lookup unavailable', state.age.error || 'Try again.', '<button type="button" class="decode-btn" data-smart-lookup-retry="age">Retry</button>'));

    if (!includeReplacementState) {
      setPanel('replacement', '');
      return;
    }
    if (state.replacement.status === 'loading') setPanel('replacement', statusCard('Researching replacements', 'Replacement research is loading independently.'));
    if (state.replacement.status === 'success') setPanel('replacement', renderReplacement(state.replacement.data));
    if (state.replacement.status === 'error') setPanel('replacement', statusCard('Replacement lookup unavailable', state.replacement.error || 'Age information is still available.', '<button type="button" class="decode-btn" data-smart-lookup-retry="replacement">Retry</button>'));
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
    state.age = { status: 'loading', data: null, error: null };
    state.replacement = wantReplacement ? { status: 'loading', data: null, error: null } : { status: 'idle', data: null, error: null };
    showResults();
    render(query, wantReplacement);

    fetchJson('/api/age-lookup', { query: query }, state.controller.signal).then(function (data) {
      if (sequence !== state.sequence || state.fingerprint !== nextFingerprint) return;
      state.age = data && data.errorCode && !data.introductionYear && !data.productionRange
        ? { status: 'error', data: null, error: data.notes || 'Age lookup unavailable.' }
        : { status: 'success', data: data, error: null };
      render(query, wantReplacement);
    }).catch(function (error) {
      if (sequence !== state.sequence || error.name === 'AbortError') return;
      state.age = { status: 'error', data: null, error: error.message || 'Age lookup unavailable.' };
      render(query, wantReplacement);
    });

    if (wantReplacement) {
      fetchJson('/api/lkq-lookup', { query: query }, state.controller.signal).then(function (data) {
        if (sequence !== state.sequence || state.fingerprint !== nextFingerprint) return;
        state.replacement = data && data.errorCode
          ? { status: 'error', data: data, error: data.successorStatus && data.successorStatus.explanation }
          : { status: 'success', data: data, error: null };
        render(query, wantReplacement);
      }).catch(function (error) {
        if (sequence !== state.sequence || error.name === 'AbortError') return;
        state.replacement = { status: 'error', data: null, error: error.message || 'Replacement lookup unavailable.' };
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
      if (!retry) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      run();
    }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
  window.SmartLookupController = { run: run };
  window.runLKQLookup = function () { run(); };
}());
