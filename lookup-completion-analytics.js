(function () {
  'use strict';

  var EVENT_NAMES = {
    decode: 'decode_complete',
    smart: 'smart_lookup_complete',
  };

  var ALLOWED_PARAMETERS = {
    decode_complete: {
      lookup_type: 1,
      result_status: 1,
      result_precision: 1,
      brand_category: 1,
      date_precision: 1,
      candidate_year_count: 1,
      ambiguous: 1,
      refinement_used: 1,
      evidence_type: 1,
      decoder_path: 1,
    },
    smart_lookup_complete: {
      lookup_type: 1,
      result_status: 1,
      identity_level: 1,
      evidence_type: 1,
      local_evidence_hit: 1,
      grounded_result: 1,
      deterministic_fallback_used: 1,
      provider_attempted: 1,
      age_result_available: 1,
      replacement_result_available: 1,
      clarification_recommended: 1,
      brand_category: 1,
      conflict_detected: 1,
      timeout_with_useful_fallback: 1,
    },
  };

  var state = {
    decodeSequence: 0,
    smartSequence: 0,
    decodeFiredFor: 0,
    smartFiredFor: 0,
    observer: null,
    scheduled: false,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function isVisible(element) {
    return Boolean(element) && !element.classList.contains('hidden') && element.getAttribute('aria-hidden') !== 'true';
  }

  function normalizeEnum(value, fallback) {
    var normalized = String(value || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    return normalized || fallback || 'unknown';
  }

  function sanitizeParameters(eventName, parameters) {
    var allowlist = ALLOWED_PARAMETERS[eventName] || {};
    var clean = {};
    Object.keys(parameters || {}).forEach(function (key) {
      if (!allowlist[key]) return;
      var value = parameters[key];
      if (typeof value === 'boolean') clean[key] = value;
      else if (typeof value === 'number' && isFinite(value)) clean[key] = Math.max(0, Math.min(100, Math.round(value)));
      else if (typeof value === 'string') clean[key] = normalizeEnum(value, 'unknown').slice(0, 40);
    });
    return clean;
  }

  function track(eventName, parameters) {
    try {
      if (!ALLOWED_PARAMETERS[eventName]) return false;
      if (typeof window.gtag !== 'function') return false;
      window.gtag('event', eventName, sanitizeParameters(eventName, parameters));
      return true;
    } catch (_) {
      return false;
    }
  }

  function selectedBrandCategory() {
    var active = document.querySelector('.cat-tab.active[data-cat]');
    var value = active ? active.getAttribute('data-cat') : '';
    return normalizeEnum(value || 'unknown', 'unknown');
  }

  function yearCandidates(text) {
    var matches = String(text || '').match(/\b(?:19|20)\d{2}\b/g) || [];
    var unique = {};
    matches.forEach(function (value) { unique[value] = true; });
    return Object.keys(unique);
  }

  function decodeMetadata() {
    var root = $('serialResults');
    var summary = $('serialSummaryLayer');
    var text = String((summary && summary.textContent) || (root && root.textContent) || '');
    var years = yearCandidates(text);
    var monthText = String(($('resultMonth') || {}).textContent || '');
    var yearText = String(($('resultYear') || {}).textContent || '');
    var useful = isVisible(root) && Boolean(
      (summary && summary.textContent && summary.textContent.trim()) ||
      yearText.trim() ||
      monthText.trim()
    );
    if (!useful) return null;
    if (/unable to decode|invalid serial|unsupported|no result/i.test(text) && !years.length) return null;

    var ambiguous = years.length > 1 || /candidate|possible years|multiple valid/i.test(text);
    var hasWeek = /\bweek\b/i.test(text + ' ' + monthText);
    var hasMonth = /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(text + ' ' + monthText);
    var precision = ambiguous ? 'candidate-years' : (hasWeek ? 'year-week' : (hasMonth ? 'year-month' : (years.length ? 'year' : 'partial')));
    var datePrecision = ambiguous ? 'multiple-candidates' : (hasWeek ? 'week-year' : (hasMonth ? 'month-year' : (years.length ? 'year-only' : 'unknown')));

    return {
      lookup_type: 'serial_decode',
      result_status: ambiguous ? 'ambiguous' : (years.length ? 'resolved' : 'partial'),
      result_precision: precision,
      brand_category: selectedBrandCategory(),
      date_precision: datePrecision,
      candidate_year_count: years.length,
      ambiguous: ambiguous,
      refinement_used: Boolean(root.querySelector('[data-serial-refinement-status="resolved"], .serial-refinement-resolved, .serial-refinement-success')),
      evidence_type: root.querySelector('.serial-refinement-resolved, .serial-refinement-success') ? 'model-refinement' : 'serial-rule',
      decoder_path: 'homepage',
    };
  }

  function smartPanelUseful(panel) {
    if (!panel || !panel.textContent || !panel.textContent.trim()) return false;
    if (panel.querySelector('.smart-lookup-status--loading')) return false;
    if (panel.querySelector('.smart-age-result, .smart-replacement-result, .lkq-best-match, .lkq-candidates, .smart-lookup-precision-badge')) return true;
    if (panel.querySelector('.result-row') && !panel.querySelector('.smart-lookup-status--noresult')) return true;
    return /conflicting information|product family recognized|exact model recognized|broad brand\/category guidance/i.test(panel.textContent);
  }

  function smartMetadata() {
    var root = $('smart-lookup-results');
    if (!root || !isVisible($('ageResults'))) return null;
    var agePanel = $('smart-lookup-age-panel');
    var replacementPanel = $('smart-lookup-replacement-panel');
    var ageAvailable = smartPanelUseful(agePanel);
    var replacementAvailable = smartPanelUseful(replacementPanel);
    if (!ageAvailable && !replacementAvailable) return null;

    var text = String(root.textContent || '');
    var classes = String(root.innerHTML || '');
    var conflict = /conflicting information|conflict/i.test(text);
    var timeout = /taking longer than expected|timed out|did not finish|research did not complete/i.test(text);
    var local = /local database|local-db|verified model-era evidence/i.test(text + ' ' + classes);
    var grounded = /sources consulted|source-verified|researched with/i.test(text);
    var deterministic = /deterministic|live research did not finish|research did not complete/i.test(text + ' ' + classes);
    var identityLevel = 'weak-description';
    if (/exact model/i.test(text)) identityLevel = 'exact-model';
    else if (/model-line/i.test(text)) identityLevel = 'model-line';
    else if (/product family/i.test(text)) identityLevel = 'product-family';
    else if (/brand\/category|brand and category/i.test(text)) identityLevel = 'brand-category';

    var evidenceType = local ? 'local-db' : (grounded ? 'grounded' : (deterministic ? 'static' : 'unknown'));
    var resultStatus = conflict ? 'conflict' : (deterministic ? 'fallback' : (ageAvailable && replacementAvailable ? 'resolved' : 'partial'));

    return {
      lookup_type: 'smart_lookup',
      result_status: resultStatus,
      identity_level: identityLevel,
      evidence_type: evidenceType,
      local_evidence_hit: local,
      grounded_result: grounded,
      deterministic_fallback_used: deterministic,
      provider_attempted: grounded || deterministic || timeout,
      age_result_available: ageAvailable,
      replacement_result_available: replacementAvailable,
      clarification_recommended: /try this next|to narrow this result|edit your search/i.test(text),
      brand_category: 'unknown',
      conflict_detected: conflict,
      timeout_with_useful_fallback: timeout && (ageAvailable || replacementAvailable),
    };
  }

  function evaluate() {
    state.scheduled = false;
    if (state.decodeSequence && state.decodeFiredFor !== state.decodeSequence) {
      var decode = decodeMetadata();
      if (decode && track(EVENT_NAMES.decode, decode)) state.decodeFiredFor = state.decodeSequence;
    }
    if (state.smartSequence && state.smartFiredFor !== state.smartSequence) {
      var smart = smartMetadata();
      if (smart && track(EVENT_NAMES.smart, smart)) state.smartFiredFor = state.smartSequence;
    }
  }

  function scheduleEvaluate() {
    if (state.scheduled) return;
    state.scheduled = true;
    setTimeout(evaluate, 50);
  }

  function beginDecodeAttempt() {
    state.decodeSequence += 1;
    scheduleEvaluate();
  }

  function beginSmartAttempt() {
    state.smartSequence += 1;
    scheduleEvaluate();
  }

  function bind() {
    document.addEventListener('click', function (event) {
      var target = event.target && event.target.closest ? event.target.closest('#decodeBtn, [data-smart-lookup-submit="1"]') : null;
      if (!target) return;
      if (target.id === 'decodeBtn') beginDecodeAttempt();
      else beginSmartAttempt();
    }, true);

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && event.target && event.target.id === 'smart-lookup-input') beginSmartAttempt();
    }, true);

    state.observer = new MutationObserver(scheduleEvaluate);
    state.observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'aria-hidden', 'data-serial-refinement-status'],
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

  window.DecodeMyItemAnalytics = {
    track: track,
    sanitizeParameters: sanitizeParameters,
    beginDecodeAttempt: beginDecodeAttempt,
    beginSmartAttempt: beginSmartAttempt,
    evaluate: evaluate,
  };
}());
