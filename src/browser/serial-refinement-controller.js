(function () {
  'use strict';

  var API_URL = '/api/refine-serial-date';
  var BROWSER_TIMEOUT_MS = 9000;
  var installAttempts = 0;
  var legacyDecodeSerial = null;
  var legacySetLoadingSuccess = null;
  var legacyRenderSerialSummaryLayer = null;
  var activeRequest = null;
  var requestSequence = 0;
  var inFlightByFingerprint = Object.create(null);
  var lastRefinementOptions = null;
  var serialDecodeActive = false;
  var currentRefinementView = null;

  function safeText(value) {
    return String(value == null ? '' : value);
  }

  function escapeHtml(value) {
    return safeText(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normalizeCandidates(values) {
    var seen = Object.create(null);
    return (values || [])
      .map(function (value) { return parseInt(value, 10); })
      .filter(function (year) {
        if (!Number.isInteger(year) || year < 1800 || year > 2200 || seen[year]) return false;
        seen[year] = true;
        return true;
      })
      .sort(function (a, b) { return a - b; });
  }

  function currentInputSnapshot(candidates, options) {
    var category = typeof window.getActiveDecoderCategory === 'function'
      ? window.getActiveDecoderCategory()
      : '';
    var dom = typeof window.getDecodeDom === 'function' ? window.getDecodeDom() : {};
    var brandEl = dom && dom.brandEl ? dom.brandEl : document.getElementById('brand');
    var serialEl = dom && dom.serialEl ? dom.serialEl : document.getElementById('serial');
    var modelEl = document.getElementById('modelNumber');
    var monthEl = document.getElementById('resultMonth');
    var brand = safeText(options && options.brand).trim();
    if (!brand && brandEl) {
      brand = brandEl.options && brandEl.selectedIndex >= 0
        ? safeText(brandEl.options[brandEl.selectedIndex].textContent || brandEl.value).trim()
        : safeText(brandEl.value).trim();
    }
    return {
      category: safeText(category || 'unknown').trim(),
      brand: brand,
      serial: safeText(serialEl && serialEl.value).trim(),
      model: safeText((options && options.model) || (modelEl && modelEl.value)).trim(),
      candidateYears: normalizeCandidates(candidates),
      decodedMonth: safeText(monthEl && monthEl.textContent).trim(),
      context: safeText(options && options.context).trim(),
    };
  }

  function fingerprint(snapshot) {
    return [
      snapshot.category.toLowerCase(),
      snapshot.brand.toLowerCase(),
      snapshot.serial.toUpperCase(),
      snapshot.model.toUpperCase(),
      snapshot.candidateYears.join(','),
    ].join('|');
  }

  function invalidateActiveRequest() {
    requestSequence += 1;
    if (activeRequest && activeRequest.controller) {
      try { activeRequest.controller.abort(); } catch (_) {}
    }
    activeRequest = null;
    currentRefinementView = null;
    lastRefinementOptions = null;
  }

  function getOriginalCandidates(fallback) {
    if (window.lastSerialResolutionState && Array.isArray(window.lastSerialResolutionState.candidates)) {
      return normalizeCandidates(window.lastSerialResolutionState.candidates);
    }
    return normalizeCandidates(fallback || []);
  }

  function statusHeading(status) {
    if (status === 'resolved') return 'Model evidence resolved the date';
    if (status === 'ambiguous') return 'Date remains ambiguous';
    if (status === 'conflict') return 'Model and serial evidence conflict';
    if (status === 'checking') return 'Checking model-era evidence';
    return 'Model evidence unavailable';
  }

  function evidenceHtml(evidence) {
    if (!Array.isArray(evidence) || !evidence.length) return '';
    var rows = evidence.map(function (item) {
      var title = escapeHtml(item.title || item.sourceName || 'Source');
      var source = item.sourceUrl
        ? '<a href="' + escapeHtml(item.sourceUrl) + '" target="_blank" rel="noopener noreferrer">' + title + '</a>'
        : title;
      var range = [];
      if (item.productionStart != null || item.productionEnd != null) {
        range.push('Production: ' + escapeHtml(String(item.productionStart == null ? '?' : item.productionStart)) + '\u2013' + escapeHtml(String(item.productionEnd == null ? 'present' : item.productionEnd)));
      } else if (item.availabilityStart != null || item.availabilityEnd != null) {
        range.push('Availability: ' + escapeHtml(String(item.availabilityStart == null ? '?' : item.availabilityStart)) + '\u2013' + escapeHtml(String(item.availabilityEnd == null ? 'present' : item.availabilityEnd)));
      }
      if (item.supports) range.push(escapeHtml(item.supports));
      return '<li><strong>' + source + '</strong>' + (range.length ? '<br><span>' + range.join(' \u00b7 ') + '</span>' : '') + '</li>';
    }).join('');
    return '<details class="serial-refinement-evidence"><summary>Evidence used</summary><ul>' + rows + '</ul></details>';
  }

  function normalizationHtml(normalization) {
    if (!normalization || !normalization.usedValidatedAlternative || !normalization.validatedAlternative) return '';
    var alternative = normalization.validatedAlternative;
    return '<p class="serial-refinement-normalization"><strong>Model transcription checked:</strong> ' +
      escapeHtml(normalization.canonical || '') + ' matched validated alternative ' +
      escapeHtml(alternative.value || '') + ' (' + escapeHtml(alternative.change || '') + ').</p>';
  }

  function renderRefinementOutput(response, checking) {
    var output = document.getElementById('narrowDateOutput');
    if (!output) return;
    var status = checking ? 'checking' : safeText(response && response.status || 'unavailable');
    var summary = checking
      ? 'Serial decoded. Checking model-era evidence\u2026'
      : safeText(response && response.summary || 'Model evidence could not be checked.');
    var chosen = !checking && response && response.chosenYear
      ? '<p><strong>Resolved manufacture year:</strong> ' + escapeHtml(String(response.chosenYear)) + '</p>'
      : '';
    var retry = !checking && response && response.status === 'unavailable'
      ? '<button type="button" class="decode-btn serial-refinement-retry" data-serial-refinement-retry="1">Retry</button>'
      : '';
    output.innerHTML = '<div class="info-block refinement serial-refinement-status serial-refinement-status--' + escapeHtml(status) + '">' +
      '<h4>' + escapeHtml(statusHeading(status)) + '</h4>' +
      '<p>' + escapeHtml(summary) + '</p>' +
      chosen +
      normalizationHtml(response && response.modelNormalization) +
      (!checking ? evidenceHtml(response && response.evidence) : '') +
      retry +
      '</div>';
  }

  function revealRefinementPanel() {
    var panel = typeof window.ensureRefinementPanel === 'function' ? window.ensureRefinementPanel() : null;
    if (!panel) return null;
    panel.classList.remove('hidden');
    panel.hidden = false;
    var summaryLayer = document.getElementById('serialSummaryLayer');
    if (summaryLayer) summaryLayer.classList.remove('serial-no-refine');
    return panel;
  }

  function restoreCurrentRefinementView() {
    if (!currentRefinementView) return;
    var panel = revealRefinementPanel();
    if (!panel) return;
    renderRefinementOutput(currentRefinementView.response, currentRefinementView.checking);
  }

  function renderVisibleRefinement(response, checking, sequence) {
    currentRefinementView = {
      response: response || null,
      checking: Boolean(checking),
      sequence: sequence == null ? requestSequence : sequence,
    };
    if (typeof window.renderSerialSummaryLayer === 'function') {
      window.renderSerialSummaryLayer();
    } else {
      restoreCurrentRefinementView();
    }
  }

  function showCheckingWhenReady(sequence) {
    var attempts = 0;
    function tryRender() {
      if (sequence !== requestSequence) return;
      if (currentRefinementView && currentRefinementView.sequence === sequence && !currentRefinementView.checking) return;
      if (document.getElementById('narrowDateOutput')) {
        renderVisibleRefinement(null, true, sequence);
        return;
      }
      attempts += 1;
      if (attempts < 30) setTimeout(tryRender, 25);
    }
    tryRender();
  }

  function updateNotes(response, originalCandidates) {
    var notesEl = document.getElementById('resultNotes');
    if (!notesEl || !response) return;
    var baseNotes = window.lastSerialResolutionState && window.lastSerialResolutionState.baseNotes
      ? window.lastSerialResolutionState.baseNotes
      : notesEl.textContent;
    var prefix = response.summary || '';
    notesEl.textContent = typeof window.sanitizeAlertText === 'function'
      ? window.sanitizeAlertText((prefix ? prefix + ' ' : '') + (baseNotes || ''))
      : (prefix ? prefix + ' ' : '') + (baseNotes || '');
  }

  function applyResponse(response, sequence, snapshot) {
    if (!response || sequence !== requestSequence) return;
    var current = currentInputSnapshot(snapshot.candidateYears, snapshot);
    if (fingerprint(current) !== fingerprint(snapshot)) return;

    var yearEl = document.getElementById('resultYear');
    if (!yearEl) {
      setTimeout(function () { applyResponse(response, sequence, snapshot); }, 25);
      return;
    }

    var originalCandidates = getOriginalCandidates(response.candidateYears || snapshot.candidateYears);
    if (response.status === 'resolved' && response.chosenYear) {
      yearEl.textContent = String(response.chosenYear);
      if (typeof window.setEstimatedAgeVisibility === 'function' && typeof window.computeEstimatedAge === 'function') {
        window.setEstimatedAgeVisibility(true, window.computeEstimatedAge(String(response.chosenYear)));
      }
    } else if (response.status === 'ambiguous' && Array.isArray(response.remainingCandidateYears) && response.remainingCandidateYears.length) {
      yearEl.textContent = normalizeCandidates(response.remainingCandidateYears).join('/');
      if (typeof window.setEstimatedAgeVisibility === 'function') window.setEstimatedAgeVisibility(false, '');
    } else {
      yearEl.textContent = originalCandidates.join('/');
      if (typeof window.setEstimatedAgeVisibility === 'function') window.setEstimatedAgeVisibility(false, '');
    }

    updateNotes(response, originalCandidates);
    if (window.lastSerialResolutionState) {
      window.lastSerialResolutionState.chosenYear = response.status === 'resolved' ? response.chosenYear : null;
      window.lastSerialResolutionState.summary = response.summary || '';
      window.lastSerialResolutionState.refinementResponse = response;
      window.lastSerialResolutionState.candidates = originalCandidates.slice();
    }

    if (typeof window.updateSearchQueryLine === 'function') window.updateSearchQueryLine();
    if (typeof window.updateResultWarning === 'function') {
      var monthEl = document.getElementById('resultMonth');
      var brandEl = document.getElementById('brand');
      window.updateResultWarning({ year: yearEl.textContent, month: monthEl ? monthEl.textContent : '' }, brandEl ? brandEl.value : '');
    }
    renderVisibleRefinement(response, false, sequence);
  }

  function parseJsonSafe(response) {
    return response.text().then(function (text) {
      if (!text) return null;
      try { return JSON.parse(text); } catch (_) { return null; }
    });
  }

  function startBackgroundRefinement(options, forceRetry) {
    var candidates = normalizeCandidates(options && options.candidates);
    var snapshot = currentInputSnapshot(candidates, options || {});
    if (candidates.length <= 1 || !snapshot.model) return null;

    var key = fingerprint(snapshot);
    lastRefinementOptions = {
      candidates: candidates.slice(),
      brand: snapshot.brand,
      model: snapshot.model,
      context: snapshot.context,
    };

    if (!forceRetry && inFlightByFingerprint[key]) {
      if (!currentRefinementView) renderVisibleRefinement(null, true, activeRequest && activeRequest.sequence);
      return inFlightByFingerprint[key];
    }
    if (activeRequest && activeRequest.fingerprint !== key) invalidateActiveRequest();

    var sequence = ++requestSequence;
    var controller = new AbortController();
    var timeoutId = setTimeout(function () { controller.abort(); }, BROWSER_TIMEOUT_MS);
    activeRequest = { fingerprint: key, controller: controller, sequence: sequence };
    currentRefinementView = null;
    showCheckingWhenReady(sequence);

    var promise = fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(snapshot),
    }).then(function (response) {
      return parseJsonSafe(response).then(function (data) {
        if (!response.ok || !data) throw new Error('REFINEMENT_REQUEST_FAILED');
        return data;
      });
    }).catch(function (error) {
      return {
        status: 'unavailable',
        candidateYears: candidates,
        remainingCandidateYears: candidates,
        chosenYear: null,
        confidence: null,
        resolutionBasis: 'serial-plus-model',
        modelProductionRange: null,
        evidence: [],
        summary: error && error.name === 'AbortError'
          ? 'Model evidence lookup timed out. The original serial-valid candidate years are preserved.'
          : 'Model evidence could not be checked. The original serial-valid candidate years are preserved.',
        cacheStatus: 'bypass',
        provider: 'none',
        timings: { localMs: 0, cacheMs: 0, onlineLookupMs: 0, totalMs: 0 },
        errorCode: error && error.name === 'AbortError' ? 'REFINEMENT_TIMEOUT' : 'REFINEMENT_UNAVAILABLE',
      };
    }).then(function (data) {
      applyResponse(data, sequence, snapshot);
      return data;
    }).finally(function () {
      clearTimeout(timeoutId);
      delete inFlightByFingerprint[key];
      if (activeRequest && activeRequest.sequence === sequence) activeRequest = null;
    });

    inFlightByFingerprint[key] = promise;
    return promise;
  }

  async function progressiveResolver(options) {
    var candidates = normalizeCandidates(options && options.candidates);
    var model = safeText(options && options.model).trim();
    var context = safeText(options && options.context).trim();
    if (candidates.length <= 1) {
      return {
        chosenYear: candidates.length === 1 ? candidates[0] : null,
        summary: '',
        confidence: '',
        source: 'not-needed',
        lookupData: null,
      };
    }
    if (!model) {
      return {
        chosenYear: null,
        summary: typeof window.buildAmbiguousYearMessage === 'function'
          ? window.buildAmbiguousYearMessage(candidates, { modelAttempted: false })
          : 'Multiple serial-valid manufacture years remain. Add the full model number to narrow the date.',
        confidence: '',
        source: 'serial-only',
        lookupData: null,
      };
    }

    startBackgroundRefinement({
      candidates: candidates,
      brand: options && options.brand,
      model: model,
      context: context,
    }, false);

    return {
      chosenYear: null,
      summary: 'Serial decoded. Checking model-era evidence\u2026',
      confidence: '',
      source: 'background-refinement',
      lookupData: null,
    };
  }

  function decorateModelOnlyResult() {
    var category = typeof window.getActiveDecoderCategory === 'function' ? window.getActiveDecoderCategory() : '';
    var brandEl = document.getElementById('brand');
    var brand = brandEl ? safeText(brandEl.value).toLowerCase() : '';
    if (category !== 'electronics' || brand.indexOf('vizio') === -1) return;
    var notesEl = document.getElementById('resultNotes');
    if (notesEl && !/model-derived/i.test(notesEl.textContent || '')) {
      notesEl.textContent = 'Model-derived date: the serial format was not directly decoded. ' + notesEl.textContent;
    }
  }


  function disableLegacyModelDateRefinement() {
    var appliances = window.decoderData && window.decoderData.appliances && window.decoderData.appliances.decoders;
    if (!appliances) return;
    ['frigidaire', 'electrolux'].forEach(function (id) {
      var decoder = appliances[id];
      if (!decoder || typeof decoder.decode !== 'function' || decoder.decode.__serialRefinementV2) return;
      var original = decoder.decode;
      var wrapped = function (serial) {
        return original.call(this, serial, '');
      };
      wrapped.__serialRefinementV2 = true;
      wrapped.__legacyDecode = original;
      decoder.decode = wrapped;
    });
  }

  function progressiveDecodeSerial() {
    disableLegacyModelDateRefinement();
    serialDecodeActive = true;
    var originalSetTimeout = window.setTimeout;
    window.setTimeout = function (callback, delay) {
      var args = Array.prototype.slice.call(arguments, 2);
      if (delay === 1400) return originalSetTimeout.apply(window, [callback, 0].concat(args));
      return originalSetTimeout.apply(window, [callback, delay].concat(args));
    };
    var safetyReset = originalSetTimeout(function () { serialDecodeActive = false; }, 2000);
    try {
      return legacyDecodeSerial.apply(this, arguments);
    } finally {
      window.setTimeout = originalSetTimeout;
      originalSetTimeout(function () { clearTimeout(safetyReset); }, 2100);
    }
  }

  function installEventSafety() {
    document.addEventListener('input', function (event) {
      if (!event.target) return;
      if (event.target.id === 'serial' || event.target.id === 'modelNumber' || event.target.id === 'narrowModelInput' || event.target.id === 'narrowContextInput') {
        invalidateActiveRequest();
      }
    }, true);
    document.addEventListener('change', function (event) {
      if (!event.target) return;
      if (event.target.id === 'brand' || event.target.id === 'mobileItemType' || event.target.id === 'eraSelect' || event.target.classList.contains('cat-tab')) {
        invalidateActiveRequest();
      }
    }, true);
    document.addEventListener('click', function (event) {
      var retry = event.target && event.target.closest ? event.target.closest('[data-serial-refinement-retry="1"]') : null;
      if (!retry || !lastRefinementOptions) return;
      event.preventDefault();
      startBackgroundRefinement(lastRefinementOptions, true);
    });
  }

  function install() {
    if (typeof window.decodeSerial !== 'function' || typeof window.resolveSerialYearFromModel !== 'function') {
      installAttempts += 1;
      if (installAttempts < 100) setTimeout(install, 50);
      return;
    }

    legacyDecodeSerial = window.decodeSerial;
    legacySetLoadingSuccess = typeof window.setLoadingSuccess === 'function' ? window.setLoadingSuccess : null;
    legacyRenderSerialSummaryLayer = typeof window.renderSerialSummaryLayer === 'function'
      ? window.renderSerialSummaryLayer
      : null;
    if (legacyRenderSerialSummaryLayer) {
      window.renderSerialSummaryLayer = function () {
        var result = legacyRenderSerialSummaryLayer.apply(this, arguments);
        restoreCurrentRefinementView();
        return result;
      };
    }
    window.resolveSerialYearFromModel = progressiveResolver;
    window.decodeSerial = progressiveDecodeSerial;

    if (legacySetLoadingSuccess) {
      window.setLoadingSuccess = function (callback) {
        if (!serialDecodeActive) return legacySetLoadingSuccess.apply(this, arguments);
        serialDecodeActive = false;
        if (typeof window.setLoadingHidden === 'function') window.setLoadingHidden();
        if (typeof callback === 'function') callback();
        decorateModelOnlyResult();
      };
    }

    installEventSafety();
    window.SerialRefinementController = {
      start: startBackgroundRefinement,
      invalidate: invalidateActiveRequest,
      fingerprint: fingerprint,
      version: '2.0.0',
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
}());
