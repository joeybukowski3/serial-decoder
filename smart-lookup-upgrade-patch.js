(function () {
  'use strict';

  var RECENT_LOOKUPS_KEY = 'itemAssistRecentSmartLookups';
  var MAX_RECENT_LOOKUPS = 6;
  window.itemAssistDataLayer = window.itemAssistDataLayer || [];

  function hasSmartLookupUi() {
    return !!document.getElementById('smart-lookup-input');
  }

  function safeJsonParse(raw, fallback) {
    try { return JSON.parse(raw); } catch (_) { return fallback; }
  }

  function getRecentSmartLookups() {
    try {
      var parsed = safeJsonParse(localStorage.getItem(RECENT_LOOKUPS_KEY) || '[]', []);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function setRecentSmartLookups(items) {
    try {
      localStorage.setItem(RECENT_LOOKUPS_KEY, JSON.stringify(items || []));
    } catch (_) {}
  }

  function trackSmartLookupEvent(name, payload) {
    var event = {
      event: name,
      ts: new Date().toISOString(),
      page: (window.location && window.location.pathname) || '',
      payload: payload || {}
    };
    window.itemAssistDataLayer.push(event);
    try { console.info('[Item Assist analytics]', event); } catch (_) {}
  }
  window.trackSmartLookupEvent = trackSmartLookupEvent;

  function renderRecentSmartLookups() {
    var list = document.getElementById('smartRecentList');
    var items;
    if (!list) return;
    items = getRecentSmartLookups();
    if (!items.length) {
      list.innerHTML = '<div class="smart-recent-empty">Your recent searches stay on this device only.</div>';
      return;
    }
    list.innerHTML = items.map(function (item) {
      return '<button type="button" class="smart-recent-chip" data-recent-query="' + escapeSmartLookupHtml(item.query) + '">' + escapeSmartLookupHtml(item.query) + '</button>';
    }).join('');
    Array.prototype.forEach.call(list.querySelectorAll('[data-recent-query]'), function (btn) {
      btn.addEventListener('click', function () {
        var query = btn.getAttribute('data-recent-query') || '';
        var input = getSmartLookupInputEl();
        if (!query || !input) return;
        input.value = query;
        trackSmartLookupEvent('recent_lookup_clicked', { query: query });
        runLKQLookup();
      });
    });
  }

  function saveRecentSmartLookup(query) {
    var normalized = normalizeSmartLookupQuery(query);
    var items;
    if (!normalized) return;
    items = getRecentSmartLookups().filter(function (item) { return item && item.query !== normalized; });
    items.unshift({ query: normalized, at: Date.now() });
    setRecentSmartLookups(items.slice(0, MAX_RECENT_LOOKUPS));
    renderRecentSmartLookups();
  }

  window.clearRecentSmartLookups = function clearRecentSmartLookups() {
    setRecentSmartLookups([]);
    renderRecentSmartLookups();
    trackSmartLookupEvent('recent_lookups_cleared');
  };

  window.applySmartLookupExample = function applySmartLookupExample(query) {
    var input = getSmartLookupInputEl();
    if (!input) return;
    input.value = query || '';
    trackSmartLookupEvent('example_lookup_selected', { query: query || '' });
    runLKQLookup();
  };

  function setSmartLookupLoadingStep(stepKey) {
    var order = ['interpret', 'identify', 'compare', 'verify'];
    var stepIndex = order.indexOf(stepKey);
    Array.prototype.forEach.call(document.querySelectorAll('.smart-loading-step'), function (node, idx) {
      node.classList.toggle('is-active', idx === stepIndex);
      node.classList.toggle('is-complete', idx < stepIndex);
    });
  }
  window.setSmartLookupLoadingStep = setSmartLookupLoadingStep;

  function patchLoadingState() {
    var originalSetLoadingActive = window.setLoadingActive;
    var originalSetLoadingSuccess = window.setLoadingSuccess;
    if (typeof originalSetLoadingActive === 'function' && !originalSetLoadingActive.__itemAssistPatched) {
      window.setLoadingActive = function () {
        originalSetLoadingActive.apply(this, arguments);
        setSmartLookupLoadingStep('interpret');
      };
      window.setLoadingActive.__itemAssistPatched = true;
    }
    if (typeof originalSetLoadingSuccess === 'function' && !originalSetLoadingSuccess.__itemAssistPatched) {
      window.setLoadingSuccess = function (callback) {
        setSmartLookupLoadingStep('verify');
        return originalSetLoadingSuccess.call(this, callback);
      };
      window.setLoadingSuccess.__itemAssistPatched = true;
    }
  }

  function patchRunSmartLookup() {
    var original = window.runLKQLookup;
    if (typeof original !== 'function' || original.__itemAssistPatched) return;
    window.runLKQLookup = async function () {
      var input = getSmartLookupInputEl();
      var query = normalizeSmartLookupQuery(input && input.value || '');
      if (!query) {
        trackSmartLookupEvent('search_blocked_empty');
        return original.apply(this, arguments);
      }
      saveRecentSmartLookup(query);
      trackSmartLookupEvent('search_started', {
        query: query,
        includeComparisons: shouldIncludeSmartLookupComparisons()
      });
      return original.apply(this, arguments);
    };
    window.runLKQLookup.__itemAssistPatched = true;
  }

  function patchLookupPipelines() {
    var originalExecute = window.executeSmartLookup;
    var originalGeneral = window.runGeneralSmartLookup;
    var originalAgeOnly = window.runAgeOnlyLookup;
    var originalUnrecognized = window.showUnrecognizedSmartLookupResults;
    if (typeof originalExecute === 'function' && !originalExecute.__itemAssistPatched) {
      window.executeSmartLookup = function (query, opts) {
        setSmartLookupLoadingStep('compare');
        trackSmartLookupEvent('specific_lookup_path', { query: query, preserveGeneral: !!(opts && opts.preserveGeneral) });
        return originalExecute.call(this, query, opts);
      };
      window.executeSmartLookup.__itemAssistPatched = true;
    }
    if (typeof originalGeneral === 'function' && !originalGeneral.__itemAssistPatched) {
      window.runGeneralSmartLookup = function (query) {
        setSmartLookupLoadingStep('identify');
        trackSmartLookupEvent('general_lookup_path', { query: query });
        return originalGeneral.call(this, query);
      };
      window.runGeneralSmartLookup.__itemAssistPatched = true;
    }
    if (typeof originalAgeOnly === 'function' && !originalAgeOnly.__itemAssistPatched) {
      window.runAgeOnlyLookup = function (query, opts) {
        setSmartLookupLoadingStep('identify');
        trackSmartLookupEvent('age_only_lookup_path', { query: query });
        return originalAgeOnly.call(this, query, opts);
      };
      window.runAgeOnlyLookup.__itemAssistPatched = true;
    }
    if (typeof originalUnrecognized === 'function' && !originalUnrecognized.__itemAssistPatched) {
      window.showUnrecognizedSmartLookupResults = function (query, interpreted) {
        trackSmartLookupEvent('lookup_needs_refinement', { query: query, suggestions: interpreted && interpreted.suggestions ? interpreted.suggestions.length : 0 });
        return originalUnrecognized.call(this, query, interpreted);
      };
      window.showUnrecognizedSmartLookupResults.__itemAssistPatched = true;
    }
  }

  function patchInterpretationRequest() {
    var original = window.fetchSmartLookupInterpretation;
    if (typeof original !== 'function' || original.__itemAssistPatched) return;
    window.fetchSmartLookupInterpretation = async function (query) {
      setSmartLookupLoadingStep('interpret');
      try {
        var result = await original.call(this, query);
        trackSmartLookupEvent('interpretation_completed', {
          query: query,
          queryKind: result && result.queryKind || '',
          action: result && result.action || ''
        });
        return result;
      } catch (error) {
        trackSmartLookupEvent('interpretation_failed', { query: query, message: error && error.message || 'unknown' });
        throw error;
      }
    };
    window.fetchSmartLookupInterpretation.__itemAssistPatched = true;
  }

  function patchAgeResults() {
    var original = window.showAgeLookupResults;
    if (typeof original !== 'function' || original.__itemAssistPatched) return;
    window.showAgeLookupResults = function (displayQuery, data) {
      original.call(this, displayQuery, data);
      trackSmartLookupEvent('age_results_rendered', { query: displayQuery, specificity: data && data.specificityLevel || '' });
    };
    window.showAgeLookupResults.__itemAssistPatched = true;
  }

  function initSmartLookupUpgradeEnhancements() {
    if (!hasSmartLookupUi()) return;
    renderRecentSmartLookups();
    patchLoadingState();
    patchRunSmartLookup();
    patchLookupPipelines();
    patchInterpretationRequest();
    patchAgeResults();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSmartLookupUpgradeEnhancements);
  } else {
    initSmartLookupUpgradeEnhancements();
  }

  window.initSmartLookupUpgradeEnhancements = initSmartLookupUpgradeEnhancements;
}());
