(function () {
  'use strict';

  var API_URL = '/api/refine-serial-date';
  // Keep under/near API global budget (12–14s) so the UI never waits past policy.
  var BROWSER_TIMEOUT_MS = 15000;
  var SLOW_CHECKING_NOTICE_MS = 5000;
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
  var GE_DATE_CODE_LETTERS = 'ADFGHLMRSTVZ';

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

  function matchesCommonGeSerialPattern(value) {
    var compact = safeText(value).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    var pattern = new RegExp('^[' + GE_DATE_CODE_LETTERS + ']{2}\\d{6}[A-Z0-9]{0,2}$');
    return pattern.test(compact);
  }

  function geEntryWarningHtml() {
    var brandEl = document.getElementById('brand');
    var serialEl = document.getElementById('serial');
    var mainModelEl = document.getElementById('modelNumber');
    var narrowModelEl = document.getElementById('narrowModelInput');
    var brand = safeText(brandEl && brandEl.value).trim().toLowerCase();
    var model = safeText((narrowModelEl && narrowModelEl.value) || (mainModelEl && mainModelEl.value)).trim();
    var serial = safeText(serialEl && serialEl.value).trim();
    var geFamily = brand === 'ge' || brand === 'cafe' || brand === 'ge_caf'
      || brand === 'ge_profile' || brand === 'ge_monogram' || brand === 'hotpoint';
    if (!geFamily || !model || matchesCommonGeSerialPattern(serial) || !matchesCommonGeSerialPattern(model)) return '';
    return '<div class="info-block warning serial-refinement-entry-warning" role="status">' +
      '<h4>Double-check the serial and model entries</h4>' +
      '<p>This decoder expects common GE appliance serials to begin with two date-code letters, followed by six digits and up to two suffix characters. The value entered as the model matches that serial pattern, while the serial entry does not. Older or uncommon formats can differ. The entries were not swapped.</p>' +
      '</div>';
  }

  function constrainResponseToSerialCandidates(response, candidates) {
    var original = normalizeCandidates(candidates);
    var allowed = Object.create(null);
    original.forEach(function (year) { allowed[year] = true; });
    var next = Object.assign({}, response || {});
    var remaining = normalizeCandidates(next.remainingCandidateYears || [])
      .filter(function (year) { return Boolean(allowed[year]); });
    var chosen = Number(next.chosenYear);
    var preferred = Number(next.preferredCandidateYear);
    var resolvedIsValid = next.status === 'resolved'
      && Number.isInteger(chosen)
      && Boolean(allowed[chosen])
      && remaining.length === 1
      && remaining[0] === chosen;
    var ambiguousIsValid = (next.status === 'ambiguous' || next.status === 'ambiguous_with_era')
      && remaining.length > 1;
    var rankedIsValid = next.status === 'ranked'
      && Number.isInteger(preferred)
      && Boolean(allowed[preferred])
      && remaining.length > 1
      && remaining.indexOf(preferred) !== -1;

    next.candidateYears = original.slice();
    next.chosenYear = null;
    next.preferredCandidateYear = null;
    next.remainingCandidateYears = original.slice();

    if (resolvedIsValid) {
      next.chosenYear = chosen;
      next.remainingCandidateYears = [chosen];
      return next;
    }
    if (rankedIsValid) {
      next.preferredCandidateYear = preferred;
      next.remainingCandidateYears = remaining;
      return next;
    }
    if (ambiguousIsValid) {
      next.remainingCandidateYears = remaining;
      return next;
    }
    if (next.status === 'conflict') {
      next.remainingCandidateYears = [];
      return next;
    }
    if (next.status === 'resolved' || next.status === 'ambiguous' || next.status === 'ranked' || next.status === 'ambiguous_with_era') {
      next.status = 'unavailable';
      next.confidence = null;
      next.errorCode = 'INVALID_REFINEMENT_CANDIDATE';
      next.summary = 'Model evidence returned a year outside the serial-decoded candidates. The original serial result is preserved.';
    }
    return next;
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
      snapshot.context.toLowerCase(),
    ].join('|');
  }

  function invalidateActiveRequest() {
    requestSequence += 1;
    if (activeRequest && activeRequest.fingerprint) {
      delete inFlightByFingerprint[activeRequest.fingerprint];
    }
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
    if (status === 'ranked') return 'Most likely manufacture year';
    if (status === 'ambiguous_with_era') return 'Serial candidates with model era';
    if (status === 'ambiguous') return 'Date remains ambiguous';
    if (status === 'conflict') return 'Model and serial evidence conflict';
    if (status === 'clarification') return 'More information needed';
    if (status === 'checking') return 'Checking model-era evidence';
    return 'Model evidence unavailable';
  }

  // The deterministic lifecycle ranking rule always produces a primary Best
  // Estimate whenever it fires; confidence describes evidence strength only
  // and no longer gates whether this primary layout is used.
  function isStrongRankedResponse(response) {
    return Boolean(response && response.status === 'ranked' && response.preferredCandidateYear);
  }

  function rankedDateLabel(year) {
    var monthEl = document.getElementById('resultMonth');
    var month = safeText(monthEl && monthEl.textContent).trim();
    var monthMatch = month.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)\b/i);
    return (monthMatch ? monthMatch[1] + ' ' : '') + String(year);
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

  function identityDisclosureHtml(response) {
    var identity = response && response.modelIdentity;
    var normalization = response && response.modelNormalization;
    var entered = identity && identity.enteredModel
      ? identity.enteredModel
      : (normalization && normalization.canonical ? normalization.canonical : '');
    var recognized = identity && identity.canonicalModel
      ? identity.canonicalModel
      : (normalization && normalization.usedValidatedAlternative && normalization.validatedAlternative
        ? normalization.validatedAlternative.value
        : '');
    if (!entered && !recognized) return '';
    if (entered && recognized && String(entered).toUpperCase() !== String(recognized).toUpperCase()) {
      var reason = (identity && identity.equivalenceReason)
        || (normalization && normalization.validatedAlternative && normalization.validatedAlternative.change)
        || 'transcription check';
      return '<p class="serial-refinement-normalization"><strong>Model entered:</strong> ' +
        escapeHtml(entered) + '<br><strong>Recognized model:</strong> ' +
        escapeHtml(recognized) + ' <span>(' + escapeHtml(reason) + ')</span></p>';
    }
    if (normalization && normalization.usedValidatedAlternative && normalization.validatedAlternative) {
      var alternative = normalization.validatedAlternative;
      return '<p class="serial-refinement-normalization"><strong>Model transcription checked:</strong> ' +
        escapeHtml(normalization.canonical || '') + ' matched validated alternative ' +
        escapeHtml(alternative.value || '') + ' (' + escapeHtml(alternative.change || '') + ').</p>';
    }
    return entered
      ? '<p class="serial-refinement-normalization"><strong>Model entered:</strong> ' + escapeHtml(entered) + '</p>'
      : '';
  }

  function rankedDetailsHtml(response) {
    if (!response || response.status !== 'ranked' || !response.preferredCandidateYear) return '';
    var others = normalizeCandidates(response.remainingCandidateYears || [])
      .filter(function (year) { return year !== response.preferredCandidateYear; });
    var confidence = response.confidence ? String(response.confidence) : 'medium';
    var why = response.rankingExplanation || response.summary || '';
    var alternateEntries = others.map(function (year) {
      return '<div class="serial-refinement-alternate-entry">' +
        '<div class="serial-refinement-alternative-years">' + escapeHtml(rankedDateLabel(year)) + '</div>' +
        '<p>This year remains technically possible based on the serial pattern.</p>' +
        '</div>';
    }).join('');
    return '<div class="serial-refinement-primary-result">' +
      '<div class="serial-refinement-result-label">Best Estimate</div>' +
      '<div class="serial-refinement-result-date">' + escapeHtml(rankedDateLabel(response.preferredCandidateYear)) + '</div>' +
      '<span class="serial-refinement-confidence serial-refinement-confidence--' + escapeHtml(confidence) + '">' +
        escapeHtml(confidence.toUpperCase()) + ' CONFIDENCE</span>' +
      (why ? '<p class="serial-refinement-ranking-reason">' + escapeHtml(why) + '</p>' : '') +
      '</div>' +
      (others.length ? '<div class="serial-refinement-alternatives">' +
        '<div class="serial-refinement-alternative-label">Alternate' + (others.length === 1 ? '' : 's') + '</div>' +
        alternateEntries +
        '</div>' : '');
  }

  function eraDetailsHtml(response) {
    if (!response || response.status !== 'ambiguous_with_era') return '';
    var range = response.modelProductionRange || {};
    var eraText = range.start != null
      ? (range.end != null ? String(range.start) + '\u2013' + String(range.end) : String(range.start) + ' or later')
      : 'Modern production period';
    var candidates = normalizeCandidates(response.remainingCandidateYears || response.candidateYears || []);
    return '<p><strong>Serial candidates:</strong> ' + escapeHtml(candidates.join(' or ')) + '</p>' +
      '<p><strong>Model era:</strong> ' + escapeHtml(eraText) + '</p>';
  }

  function renderRefinementOutput(response, checking, slowChecking) {
    var output = document.getElementById('narrowDateOutput');
    if (!output) return;
    var status = checking ? 'checking' : safeText(response && response.status || 'unavailable');
    var summary = checking
      ? (slowChecking
        ? 'Still checking model-era evidence\u2026 this can take up to 15 seconds for less common models.'
        : 'Serial decoded. Checking model-era evidence\u2026')
      : safeText(response && response.summary || 'Model evidence could not be checked.');
    var chosen = !checking && response && response.chosenYear
      ? '<p><strong>Resolved manufacture year:</strong> ' + escapeHtml(String(response.chosenYear)) + '</p>'
      : '';
    var retry = !checking && response && response.status === 'unavailable'
      ? '<button type="button" class="decode-btn serial-refinement-retry" data-serial-refinement-retry="1">Retry</button>'
      : '';
    output.innerHTML = geEntryWarningHtml() +
      '<div class="info-block refinement serial-refinement-status serial-refinement-status--' + escapeHtml(status) + '">' +
      (isStrongRankedResponse(response) && !checking ? '' : '<h4>' + escapeHtml(statusHeading(status)) + '</h4>') +
      (!checking && status === 'ranked' ? rankedDetailsHtml(response) : '') +
      (!checking && status === 'ambiguous_with_era' ? eraDetailsHtml(response) : '') +
      (status === 'ranked' || status === 'ambiguous_with_era' ? '' : '<p>' + escapeHtml(summary) + '</p>') +
      (status === 'ambiguous_with_era'
        ? '<p class="serial-refinement-summary-detail">' + escapeHtml(summary) + '</p>'
        : '') +
      chosen +
      identityDisclosureHtml(response) +
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
    renderRefinementOutput(currentRefinementView.response, currentRefinementView.checking, currentRefinementView.slowChecking);
  }

  // The primary hero card (#serialSummaryLayer .serial-result-hero) is fully
  // rebuilt from #resultYear's textContent by legacy renderSerialSummaryLayer()
  // on every call, using data that has not been updated yet while a refinement
  // request is in flight. This overlays a loading state on that freshly-built
  // hero so the candidate years never sit there looking idle while the request
  // that will replace them is active.
  function applyPrimaryLoadingState(checking) {
    if (!checking) return;
    var hero = document.querySelector('#serialSummaryLayer .serial-result-hero, #serialSummaryLayer .rs-primary-card');
    if (!hero) return;
    var eyebrow = hero.querySelector('.serial-result-eyebrow');
    var main = hero.querySelector('.serial-result-main, .rs-years');
    if (!eyebrow || !main) return;
    var notice = hero.querySelector('.rs-notice');
    if (notice) notice.classList.add('hidden');
    eyebrow.textContent = 'Refining Result';
    main.classList.add('rs-years--loading');
    main.setAttribute('role', 'status');
    main.setAttribute('aria-live', 'polite');
    main.innerHTML = '<span class="rs-refining-spinner" aria-hidden="true"></span>' +
      '<span class="rs-refining-text">Refining<span class="rs-refining-dots"><span>.</span><span>.</span><span>.</span></span></span>';
  }

  function renderVisibleRefinement(response, checking, sequence, slowChecking) {
    currentRefinementView = {
      response: response || null,
      checking: Boolean(checking),
      slowChecking: Boolean(slowChecking),
      sequence: sequence == null ? requestSequence : sequence,
    };
    if (typeof window.renderSerialSummaryLayer === 'function') {
      window.renderSerialSummaryLayer();
    } else {
      restoreCurrentRefinementView();
      applyPrimaryLoadingState(Boolean(checking));
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

    var originalCandidates = getOriginalCandidates(snapshot.candidateYears);
    response = constrainResponseToSerialCandidates(response, originalCandidates);
    var yearEl = document.getElementById('resultYear');
    if (!yearEl) {
      setTimeout(function () { applyResponse(response, sequence, snapshot); }, 25);
      return;
    }

    if (response.status === 'resolved' && response.chosenYear) {
      yearEl.textContent = String(response.chosenYear);
      if (typeof window.setEstimatedAgeVisibility === 'function' && typeof window.computeEstimatedAge === 'function') {
        window.setEstimatedAgeVisibility(true, window.computeEstimatedAge(String(response.chosenYear)));
      }
    } else if (response.status === 'ranked' && response.preferredCandidateYear) {
      // The Best Estimate gets one focal year; alternatives remain visible in
      // the refinement card and in the preserved response candidate arrays.
      yearEl.textContent = String(response.preferredCandidateYear);
      if (typeof window.setEstimatedAgeVisibility === 'function') window.setEstimatedAgeVisibility(false, '');
    } else if ((response.status === 'ambiguous' || response.status === 'ambiguous_with_era')
      && Array.isArray(response.remainingCandidateYears) && response.remainingCandidateYears.length) {
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

  function unavailableResponse(candidates, error) {
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
  }

  function requestRefinement(snapshot, signal) {
    return fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: signal,
      body: JSON.stringify(snapshot),
    }).then(function (response) {
      return parseJsonSafe(response).then(function (data) {
        if (!response.ok || !data) throw new Error('REFINEMENT_REQUEST_FAILED');
        return data;
      });
    });
  }

  async function refineSnapshot(options) {
    var candidates = normalizeCandidates(options && (options.candidates || options.candidateYears));
    var model = safeText(options && options.model).trim();
    if (candidates.length <= 1 || !model) return null;

    var snapshot = {
      category: safeText(options && options.category || 'unknown').trim(),
      brand: safeText(options && options.brand).trim(),
      serial: safeText(options && options.serial).trim(),
      model: model,
      candidateYears: candidates,
      decodedMonth: safeText(options && options.decodedMonth).trim(),
      context: safeText(options && options.context).trim(),
    };
    var controller = new AbortController();
    var timeoutId = setTimeout(function () { controller.abort(); }, BROWSER_TIMEOUT_MS);
    try {
      var response = await requestRefinement(snapshot, controller.signal);
      return constrainResponseToSerialCandidates(response, candidates);
    } catch (error) {
      return unavailableResponse(candidates, error);
    } finally {
      clearTimeout(timeoutId);
    }
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
    var slowNoticeTimeoutId = setTimeout(function () {
      if (sequence !== requestSequence) return;
      if (!currentRefinementView || currentRefinementView.sequence !== sequence || !currentRefinementView.checking) return;
      renderVisibleRefinement(null, true, sequence, true);
    }, SLOW_CHECKING_NOTICE_MS);
    activeRequest = { fingerprint: key, controller: controller, sequence: sequence };
    currentRefinementView = null;
    showCheckingWhenReady(sequence);

    var promise = requestRefinement(snapshot, controller.signal).catch(function (error) {
      return unavailableResponse(candidates, error);
    }).then(function (data) {
      applyResponse(data, sequence, snapshot);
      return data;
    }).finally(function () {
      clearTimeout(timeoutId);
      clearTimeout(slowNoticeTimeoutId);
      if (inFlightByFingerprint[key] === promise) delete inFlightByFingerprint[key];
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
    if (document.head && typeof document.querySelector === 'function'
      && !document.querySelector('link[data-serial-refinement-styles]')) {
      var styleLink = document.createElement('link');
      styleLink.rel = 'stylesheet';
      styleLink.href = '/serial-refinement.css';
      styleLink.setAttribute('data-serial-refinement-styles', '1');
      document.head.appendChild(styleLink);
    }
    legacySetLoadingSuccess = typeof window.setLoadingSuccess === 'function' ? window.setLoadingSuccess : null;
    legacyRenderSerialSummaryLayer = typeof window.renderSerialSummaryLayer === 'function'
      ? window.renderSerialSummaryLayer
      : null;
    if (legacyRenderSerialSummaryLayer) {
      window.renderSerialSummaryLayer = function () {
        var result = legacyRenderSerialSummaryLayer.apply(this, arguments);
        if (typeof window.reattachItemAssistCard === 'function') window.reattachItemAssistCard();
        restoreCurrentRefinementView();
        // Legacy code (e.g. refineAmbiguousResult in script.js) also calls
        // renderSerialSummaryLayer() directly, bypassing renderVisibleRefinement.
        // Re-apply the loading overlay here so any rebuild that happens while a
        // refinement request is still in flight keeps it, instead of the fresh
        // hero briefly showing stale candidate years again.
        applyPrimaryLoadingState(Boolean(currentRefinementView && currentRefinementView.checking));
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
        if (window.HomePageUI && typeof window.HomePageUI.runSerialResultCallback === 'function') {
          window.HomePageUI.runSerialResultCallback(callback);
        } else if (typeof callback === 'function') {
          callback();
        }
        decorateModelOnlyResult();
      };
    }

    installEventSafety();
    window.SerialRefinementController = {
      start: startBackgroundRefinement,
      refine: refineSnapshot,
      invalidate: invalidateActiveRequest,
      fingerprint: fingerprint,
      matchesCommonGeSerialPattern: matchesCommonGeSerialPattern,
      constrainResponseToSerialCandidates: constrainResponseToSerialCandidates,
      isStrongRankedResponse: isStrongRankedResponse,
      version: '2.0.0',
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
}());
