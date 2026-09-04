(function () {
  'use strict';

  var EVENT_VERSION = '2';
  var DECODE_TERMINAL_STATUSES = {
    resolved: 1,
    ambiguous: 1,
    partial: 1,
    unsupported: 1,
    invalid: 1,
    'no-result': 1,
    error: 1,
  };
  var DECODE_FAILURE_STATUSES = {
    unsupported: 1,
    invalid: 1,
    'no-result': 1,
    error: 1,
  };
  var SMART_TERMINAL_STATUSES = {
    resolved: 1,
    partial: 1,
    conflict: 1,
    'no-result': 1,
    error: 1,
  };
  var ALLOWED_PARAMETERS = {
    decode_start: {
      event_version: 1,
      lookup_type: 1,
      decoder_path: 1,
      brand: 1,
      category: 1,
    },
    decode_complete: {
      event_version: 1,
      lookup_type: 1,
      decoder_path: 1,
      brand: 1,
      category: 1,
      result_status: 1,
      result_precision: 1,
      date_precision: 1,
      candidate_year_count: 1,
      ambiguous: 1,
      refinement_used: 1,
      evidence_type: 1,
    },
    decode_success: {
      event_version: 1,
      lookup_type: 1,
      decoder_path: 1,
      brand: 1,
      category: 1,
      result_status: 1,
      result_precision: 1,
      date_precision: 1,
      candidate_year_count: 1,
      ambiguous: 1,
      refinement_used: 1,
      evidence_type: 1,
    },
    decode_fail: {
      event_version: 1,
      lookup_type: 1,
      decoder_path: 1,
      brand: 1,
      category: 1,
      result_status: 1,
      failure_type: 1,
      evidence_type: 1,
    },
    smart_lookup_complete: {
      event_version: 1,
      lookup_type: 1,
      decoder_path: 1,
      result_status: 1,
      identity_level: 1,
      brand: 1,
      category: 1,
      evidence_type: 1,
      local_evidence_hit: 1,
      grounded_result: 1,
      deterministic_fallback_used: 1,
      provider_attempted: 1,
      age_result_available: 1,
      replacement_result_available: 1,
      clarification_recommended: 1,
      conflict_detected: 1,
      timeout_with_useful_fallback: 1,
    },
  };
  var sequence = 0;

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
      else if (typeof value === 'string') clean[key] = normalizeEnum(value, 'unknown').slice(0, 80);
    });
    return clean;
  }

  function track(eventName, parameters) {
    try {
      if (!ALLOWED_PARAMETERS[eventName] || typeof window.gtag !== 'function') return false;
      window.gtag('event', eventName, sanitizeParameters(eventName, parameters));
      return true;
    } catch (_) {
      return false;
    }
  }

  function decoderPath() {
    var pathname = String((window.location && window.location.pathname) || '').toLowerCase();
    var pageKind = String((document.body && document.body.getAttribute('data-page-kind')) || '').toLowerCase();
    if (pathname === '/' || /\/index(?:\.html)?$/.test(pathname)) return 'homepage';
    if (/\/[^/]+-serial-number-(?:lookup|decoder)(?:\.html)?$/.test(pathname)) return 'brand-lookup';
    if (/\/(?:how-to-|[^/]+-guide|appliance-age-by-|hvac-age-by-)/.test(pathname) || pageKind === 'guide') return 'guide';
    if (/\/decoder-tool(?:\.html)?$/.test(pathname) || pageKind === 'embedded-tool') return 'embedded-tool';
    return 'legacy-brand';
  }

  function makeAttempt(kind, metadata) {
    sequence += 1;
    return {
      id: sequence,
      kind: kind,
      completed: false,
      metadata: Object.assign({}, metadata || {}),
    };
  }

  function decodeBase(metadata) {
    return Object.assign({
      event_version: EVENT_VERSION,
      lookup_type: 'serial-decode',
      decoder_path: decoderPath(),
    }, metadata || {});
  }

  function smartBase(metadata) {
    return Object.assign({
      event_version: EVENT_VERSION,
      lookup_type: 'smart-lookup',
      decoder_path: decoderPath(),
    }, metadata || {});
  }

  function beginDecodeAttempt(metadata) {
    var attempt = makeAttempt('decode', decodeBase(metadata));
    track('decode_start', attempt.metadata);
    return attempt;
  }

  function completeDecodeAttempt(attempt, outcome) {
    if (!attempt || attempt.kind !== 'decode' || attempt.completed) return false;
    var status = normalizeEnum(outcome && outcome.result_status, 'error');
    if (!DECODE_TERMINAL_STATUSES[status]) status = 'error';
    attempt.completed = true;
    var parameters = decodeBase(Object.assign({}, attempt.metadata, outcome || {}, { result_status: status }));
    track('decode_complete', parameters);
    if (status === 'resolved') track('decode_success', parameters);
    if (DECODE_FAILURE_STATUSES[status]) {
      track('decode_fail', Object.assign({}, parameters, { failure_type: status }));
    }
    return true;
  }

  function beginSmartAttempt(metadata) {
    return makeAttempt('smart', smartBase(metadata));
  }

  function completeSmartAttempt(attempt, outcome) {
    if (!attempt || attempt.kind !== 'smart' || attempt.completed) return false;
    var status = normalizeEnum(outcome && outcome.result_status, 'error');
    if (!SMART_TERMINAL_STATUSES[status]) status = 'error';
    attempt.completed = true;
    track('smart_lookup_complete', smartBase(Object.assign({}, attempt.metadata, outcome || {}, { result_status: status })));
    return true;
  }

  window.DecodeMyItemAnalytics = {
    track: track,
    sanitizeParameters: sanitizeParameters,
    decoderPath: decoderPath,
    beginDecodeAttempt: beginDecodeAttempt,
    completeDecodeAttempt: completeDecodeAttempt,
    beginSmartAttempt: beginSmartAttempt,
    completeSmartAttempt: completeSmartAttempt,
  };
}());
