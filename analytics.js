(function () {
  'use strict';

  var STORAGE_KEY = 'itemAssistAnalytics.v1';
  var MAX_EVENTS = 250;
  var listeners = [];

  function nowIso() {
    return new Date().toISOString();
  }

  function safeClone(value) {
    try {
      return JSON.parse(JSON.stringify(value || {}));
    } catch (_) {
      return {};
    }
  }

  function baseState() {
    return {
      version: 1,
      firstSeenAt: nowIso(),
      lastEventAt: null,
      totals: {},
      breakdowns: {},
      recentEvents: [],
      sessions: {
        pageViews: 0,
        mobileViews: 0,
        searches: 0,
        results: 0,
        failures: 0
      }
    };
  }

  function readState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return baseState();
      var parsed = JSON.parse(raw);
      return Object.assign(baseState(), parsed || {});
    } catch (_) {
      return baseState();
    }
  }

  function writeState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  function inc(map, key, amount) {
    if (!key) return;
    map[key] = (map[key] || 0) + (amount || 1);
  }

  function pushRecent(state, event) {
    state.recentEvents.unshift(event);
    if (state.recentEvents.length > MAX_EVENTS) {
      state.recentEvents.length = MAX_EVENTS;
    }
  }

  function emit(state) {
    listeners.slice().forEach(function (listener) {
      try { listener(safeClone(state)); } catch (_) {}
    });
  }

  function track(name, payload) {
    if (!name) return;
    var state = readState();
    var event = {
      name: String(name),
      at: nowIso(),
      path: (typeof location !== 'undefined' && location.pathname) ? location.pathname : '',
      payload: safeClone(payload)
    };
    state.lastEventAt = event.at;
    inc(state.totals, event.name, 1);

    if (payload && payload.category) {
      state.breakdowns.category = state.breakdowns.category || {};
      inc(state.breakdowns.category, payload.category, 1);
    }
    if (payload && payload.brand) {
      state.breakdowns.brand = state.breakdowns.brand || {};
      inc(state.breakdowns.brand, payload.brand, 1);
    }
    if (payload && payload.queryKind) {
      state.breakdowns.queryKind = state.breakdowns.queryKind || {};
      inc(state.breakdowns.queryKind, payload.queryKind, 1);
    }
    if (payload && payload.context) {
      state.breakdowns.context = state.breakdowns.context || {};
      inc(state.breakdowns.context, payload.context, 1);
    }

    if (event.name === 'page_view') state.sessions.pageViews += 1;
    if (event.name === 'mobile_view') state.sessions.mobileViews += 1;
    if (event.name === 'search_started') state.sessions.searches += 1;
    if (event.name === 'result_success') state.sessions.results += 1;
    if (event.name === 'result_failure') state.sessions.failures += 1;

    pushRecent(state, event);
    writeState(state);
    emit(state);
  }

  function reset() {
    writeState(baseState());
    emit(readState());
  }

  function getSummary() {
    var state = readState();
    return safeClone(state);
  }

  function topEntries(map, limit) {
    return Object.keys(map || {})
      .map(function (key) { return { key: key, count: map[key] }; })
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, limit || 8);
  }

  function buildReport() {
    var state = readState();
    return {
      totals: state.totals,
      sessions: state.sessions,
      topBrands: topEntries((state.breakdowns || {}).brand, 6),
      topCategories: topEntries((state.breakdowns || {}).category, 6),
      queryKinds: topEntries((state.breakdowns || {}).queryKind, 6),
      recentEvents: (state.recentEvents || []).slice(0, 20)
    };
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return function () {};
    listeners.push(listener);
    return function () {
      listeners = listeners.filter(function (item) { return item !== listener; });
    };
  }

  function initPageTracking() {
    track('page_view', {
      context: (document && document.body && document.body.getAttribute('data-page-kind')) || 'site',
      page: (document && document.title) || ''
    });
    if (window.matchMedia && window.matchMedia('(max-width: 760px)').matches) {
      track('mobile_view', { context: 'initial-load' });
    }
  }

  window.ItemAssistAnalytics = {
    track: track,
    reset: reset,
    getSummary: getSummary,
    buildReport: buildReport,
    subscribe: subscribe,
    initPageTracking: initPageTracking
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPageTracking);
  } else {
    initPageTracking();
  }
}());
