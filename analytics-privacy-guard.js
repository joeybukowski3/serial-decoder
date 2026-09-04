(function (root) {
  'use strict';

  var ALLOWED_EVENT_FIELDS = Object.freeze({
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

  function isSafeScalar(value) {
    return value === null ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value)) ||
      (typeof value === 'string' && value.length <= 80);
  }

  function sanitizeEventParams(params) {
    var safe = {};
    if (!params || typeof params !== 'object' || Array.isArray(params)) return safe;

    Object.keys(params).forEach(function (key) {
      if (!ALLOWED_EVENT_FIELDS[key]) return;
      var value = params[key];
      if (isSafeScalar(value)) safe[key] = value;
    });

    return safe;
  }

  function install(target) {
    if (!target || typeof target.gtag !== 'function' || target.gtag.__dmiPrivacyGuard) return false;

    var original = target.gtag;
    function guardedGtag(command, name, params) {
      if (command === 'event') {
        return original.call(this, command, name, sanitizeEventParams(params));
      }
      return original.apply(this, arguments);
    }

    guardedGtag.__dmiPrivacyGuard = true;
    guardedGtag.__dmiOriginal = original;
    target.gtag = guardedGtag;
    return true;
  }

  var api = Object.freeze({
    allowedEventFields: ALLOWED_EVENT_FIELDS,
    sanitizeEventParams: sanitizeEventParams,
    install: install
  });

  root.ItemAssistAnalyticsPrivacy = api;
  install(root);
})(typeof window !== 'undefined' ? window : globalThis);
