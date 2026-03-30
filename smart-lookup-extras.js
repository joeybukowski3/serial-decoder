(function () {
  'use strict';

  var RECENTS_KEY = 'itemAssist.smartRecent.v1';

  function inputEl() {
    return document.getElementById('smart-lookup-input');
  }

  function readRecent() {
    try {
      return JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]');
    } catch (_) {
      return [];
    }
  }

  function writeRecent(items) {
    try { localStorage.setItem(RECENTS_KEY, JSON.stringify(items || [])); } catch (_) {}
  }

  function pushRecent(query) {
    var value = String(query || '').trim();
    var items;
    if (!value) return;
    items = readRecent().filter(function (item) { return item !== value; });
    items.unshift(value);
    writeRecent(items.slice(0, 6));
    renderRecentSmartLookups();
  }

  function renderRecentSmartLookups() {
    var list = document.getElementById('smartRecentList');
    var panel = document.getElementById('smartRecentPanel');
    var items = readRecent();
    if (!list || !panel) return;
    list.innerHTML = items.length ? items.map(function (item) {
      return '<button type="button" class="smart-recent-chip" data-recent-query="' + item.replace(/"/g, '&quot;') + '">' + item + '</button>';
    }).join('') : '<div class="smart-recent-empty">Your recent Smart Lookup searches will appear here.</div>';
    Array.prototype.forEach.call(list.querySelectorAll('[data-recent-query]'), function (btn) {
      btn.addEventListener('click', function () {
        var query = btn.getAttribute('data-recent-query') || '';
        var input = inputEl();
        if (input) input.value = query;
        if (window.ItemAssistAnalytics) window.ItemAssistAnalytics.track('recent_lookup_reused', { context: 'smart-lookup', query: query });
        if (typeof window.runLKQLookup === 'function') window.runLKQLookup();
      });
    });
    panel.classList.remove('hidden');
  }

  window.applySmartLookupExample = function (query) {
    var input = inputEl();
    if (input) input.value = query;
    if (window.ItemAssistAnalytics) window.ItemAssistAnalytics.track('example_click', { context: 'smart-lookup', query: query });
    if (typeof window.runLKQLookup === 'function') window.runLKQLookup();
  };

  window.clearRecentSmartLookups = function () {
    writeRecent([]);
    renderRecentSmartLookups();
  };

  window.recordRecentSmartLookup = pushRecent;
  window.renderRecentSmartLookups = renderRecentSmartLookups;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderRecentSmartLookups);
  } else {
    renderRecentSmartLookups();
  }
}());
