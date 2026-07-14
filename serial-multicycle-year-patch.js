(function () {
  'use strict';

  var original = window.sanitizeDecodeResult;
  if (typeof original !== 'function' || original.__dmiMultiCycleYearPatch) return;

  function parseExtendedYearCandidates(value) {
    if (typeof value !== 'string') return null;
    var parts = value.split('/');
    if (parts.length < 5 || parts.length > 8) return null;

    var currentYear = new Date().getFullYear();
    var seen = Object.create(null);
    var years = [];

    for (var index = 0; index < parts.length; index += 1) {
      var token = parts[index].trim();
      if (!/^(19|20)\d{2}$/.test(token)) return null;
      var year = Number(token);
      if (year < 1940 || year > currentYear + 1 || seen[token]) return null;
      if (years.length && year <= years[years.length - 1]) return null;
      seen[token] = true;
      years.push(year);
    }

    return years;
  }

  function patchedSanitizeDecodeResult(result) {
    var normallySanitized = original.apply(this, arguments);
    if (normallySanitized) return normallySanitized;
    if (!result || typeof result !== 'object') return normallySanitized;

    var candidates = parseExtendedYearCandidates(result.year);
    if (!candidates) return normallySanitized;

    // Re-run the established sanitizer with four candidates so every other
    // result field and sentinel rule is still validated by the original code.
    var probe = Object.assign({}, result, {
      year: candidates.slice(0, 4).join('/')
    });
    var validated = original.call(this, probe);
    if (!validated) return normallySanitized;

    return Object.assign({}, validated, {
      year: candidates.join('/')
    });
  }

  patchedSanitizeDecodeResult.__dmiMultiCycleYearPatch = true;
  patchedSanitizeDecodeResult.__dmiOriginal = original;
  window.sanitizeDecodeResult = patchedSanitizeDecodeResult;
}());
