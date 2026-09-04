(function () {
  'use strict';

  var STORAGE_KEY = 'itemAssistAnalytics.v1';
  var subscribers = [];
  var ALLOWED_GA4_FIELDS = Object.freeze({
    brand: true,
    category: true,
    confidence: true,
    era_used: true,
    entry_page: true,
    failure_type: true,
    source: true,
    lookup_mode: true,
    result_type: true,
    batch_row_count: true,
    mobile: true,
    success: true,
    reason: true,
    provider: true,
    fallback_used: true,
    event_version: true,
    lookup_type: true,
    decoder_path: true,
    result_status: true,
    result_precision: true,
    date_precision: true,
    candidate_year_count: true,
    ambiguous: true,
    refinement_used: true,
    evidence_type: true,
    identity_level: true,
    local_evidence_hit: true,
    grounded_result: true,
    deterministic_fallback_used: true,
    provider_attempted: true,
    age_result_available: true,
    replacement_result_available: true,
    clarification_recommended: true,
    conflict_detected: true,
    timeout_with_useful_fallback: true
  });

  function isSafeGa4Scalar(value) {
    return value === null ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value)) ||
      (typeof value === 'string' && value.length <= 80);
  }

  function sanitizeGa4EventParams(params) {
    var safe = {};
    if (!params || typeof params !== 'object' || Array.isArray(params)) return safe;
    Object.keys(params).forEach(function (key) {
      if (ALLOWED_GA4_FIELDS[key] && isSafeGa4Scalar(params[key])) safe[key] = params[key];
    });
    return safe;
  }

  function installGtagPrivacyGuard() {
    if (typeof window.gtag !== 'function' || window.gtag.__dmiPrivacyGuard) return false;
    var original = window.gtag;
    function guardedGtag(command, name, params) {
      if (command === 'event') {
        return original.call(this, command, name, sanitizeGa4EventParams(params));
      }
      return original.apply(this, arguments);
    }
    guardedGtag.__dmiPrivacyGuard = true;
    guardedGtag.__dmiOriginal = original;
    window.gtag = guardedGtag;
    return true;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function clone(value) {
    try {
      return JSON.parse(JSON.stringify(value || {}));
    } catch (_) {
      return {};
    }
  }

  function blankState() {
    return {
      version: 1,
      firstSeenAt: nowIso(),
      lastEventAt: null,
      totals: {},
      breakdowns: {},
      recentEvents: [],
      sessions: { pageViews: 0, mobileViews: 0, searches: 0, results: 0, failures: 0 }
    };
  }

  function readState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return blankState();
      return Object.assign(blankState(), JSON.parse(raw) || {});
    } catch (_) {
      return blankState();
    }
  }

  function writeState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  function increment(target, key, amount) {
    if (key) target[key] = (target[key] || 0) + (amount || 1);
  }

  function notify(state) {
    subscribers.slice().forEach(function (subscriber) {
      try {
        subscriber(clone(state));
      } catch (_) {}
    });
  }

  function track(name, payload) {
    if (!name) return;
    var state = readState();
    var event = {
      name: String(name),
      at: nowIso(),
      path: typeof location !== 'undefined' && location.pathname ? location.pathname : '',
      payload: clone(payload)
    };

    state.lastEventAt = event.at;
    increment(state.totals, event.name, 1);
    if (payload && payload.category) {
      state.breakdowns.category = state.breakdowns.category || {};
      increment(state.breakdowns.category, payload.category, 1);
    }
    if (payload && payload.brand) {
      state.breakdowns.brand = state.breakdowns.brand || {};
      increment(state.breakdowns.brand, payload.brand, 1);
    }
    if (payload && payload.queryKind) {
      state.breakdowns.queryKind = state.breakdowns.queryKind || {};
      increment(state.breakdowns.queryKind, payload.queryKind, 1);
    }
    if (payload && payload.context) {
      state.breakdowns.context = state.breakdowns.context || {};
      increment(state.breakdowns.context, payload.context, 1);
    }

    if (event.name === 'page_view') state.sessions.pageViews += 1;
    if (event.name === 'mobile_view') state.sessions.mobileViews += 1;
    if (event.name === 'search_started') state.sessions.searches += 1;
    if (event.name === 'result_success') state.sessions.results += 1;
    if (event.name === 'result_failure') state.sessions.failures += 1;

    state.recentEvents.unshift(event);
    if (state.recentEvents.length > 250) state.recentEvents.length = 250;
    writeState(state);
    notify(state);
  }

  function topEntries(values, limit) {
    return Object.keys(values || {})
      .map(function (key) { return { key: key, count: values[key] }; })
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, limit || 8);
  }

  function initPageTracking() {
    track('page_view', {
      context: document && document.body && document.body.getAttribute('data-page-kind') || 'site',
      page: document && document.title || ''
    });
    if (window.matchMedia && window.matchMedia('(max-width: 760px)').matches) {
      track('mobile_view', { context: 'initial-load' });
    }
  }

  installGtagPrivacyGuard();
  window.ItemAssistAnalyticsPrivacy = window.ItemAssistAnalyticsPrivacy || Object.freeze({
    allowedEventFields: ALLOWED_GA4_FIELDS,
    sanitizeEventParams: sanitizeGa4EventParams,
    install: function () { return installGtagPrivacyGuard(); }
  });

  window.ItemAssistAnalytics = {
    track: track,
    reset: function () {
      writeState(blankState());
      notify(readState());
    },
    getSummary: function () { return clone(readState()); },
    buildReport: function () {
      var state = readState();
      return {
        totals: state.totals,
        sessions: state.sessions,
        topBrands: topEntries((state.breakdowns || {}).brand, 6),
        topCategories: topEntries((state.breakdowns || {}).category, 6),
        queryKinds: topEntries((state.breakdowns || {}).queryKind, 6),
        recentEvents: (state.recentEvents || []).slice(0, 20)
      };
    },
    subscribe: function (subscriber) {
      if (typeof subscriber !== 'function') return function () {};
      subscribers.push(subscriber);
      return function () {
        subscribers = subscribers.filter(function (item) { return item !== subscriber; });
      };
    },
    initPageTracking: initPageTracking
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPageTracking);
  } else {
    initPageTracking();
  }
})();
