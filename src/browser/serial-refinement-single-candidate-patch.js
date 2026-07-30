(function () {
  'use strict';

  var installAttempts = 0;
  var active = null;
  var sequence = 0;

  function text(value) { return String(value == null ? '' : value); }
  function years(values) {
    return (values || []).map(function (value) { return parseInt(value, 10); })
      .filter(function (value, index, list) { return Number.isInteger(value) && list.indexOf(value) === index; })
      .sort(function (a, b) { return a - b; });
  }
  function escapeHtml(value) {
    return text(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  function snapshot(options, candidates) {
    var brandEl = document.getElementById('brand');
    var serialEl = document.getElementById('serial');
    var modelEl = document.getElementById('modelNumber');
    var monthEl = document.getElementById('resultMonth');
    return {
      category: text(typeof window.getActiveDecoderCategory === 'function' ? window.getActiveDecoderCategory() : 'unknown').trim(),
      brand: text(options && options.brand || brandEl && brandEl.value).trim(),
      serial: text(serialEl && serialEl.value).trim(),
      model: text(options && options.model || modelEl && modelEl.value).trim(),
      candidateYears: candidates,
      decodedMonth: text(monthEl && monthEl.textContent).trim(),
      context: text(options && options.context).trim(),
    };
  }
  function fingerprint(value) {
    return [value.category.toLowerCase(), value.brand.toLowerCase(), value.serial.toUpperCase(),
      value.model.toUpperCase(), value.candidateYears.join(',')].join('|');
  }
  function panel() {
    var value = typeof window.ensureRefinementPanel === 'function' ? window.ensureRefinementPanel() : null;
    if (value) { value.classList.remove('hidden'); value.hidden = false; }
    var summary = document.getElementById('serialSummaryLayer');
    if (summary) summary.classList.remove('serial-no-refine');
    return value;
  }
  function evidenceHtml(evidence) {
    if (!Array.isArray(evidence) || !evidence.length) return '';
    return '<details class="serial-refinement-evidence"><summary>Evidence used</summary><ul>' + evidence.map(function (item) {
      var range = item.productionStart != null || item.productionEnd != null
        ? 'Production: ' + text(item.productionStart == null ? '?' : item.productionStart) + '–' + text(item.productionEnd == null ? 'present' : item.productionEnd)
        : '';
      return '<li><strong>' + escapeHtml(item.title || item.sourceName || 'Model evidence') + '</strong>' +
        (range ? '<br><span>' + escapeHtml(range) + '</span>' : '') +
        (item.supports ? '<br><span>' + escapeHtml(item.supports) + '</span>' : '') + '</li>';
    }).join('') + '</ul></details>';
  }
  function renderChecking(slow) {
    panel();
    var output = document.getElementById('narrowDateOutput');
    var message = slow
      ? 'Still verifying the model against the decoded year… this can take up to 20 seconds for less common models.'
      : 'Serial decoded. Verifying the model against the decoded year…';
    if (output) output.innerHTML = '<div class="info-block refinement serial-refinement-status serial-refinement-status--checking"><h4>Checking model-era evidence</h4><p>' + message + '</p></div>';
  }
  function render(response, originalYear) {
    panel();
    var output = document.getElementById('narrowDateOutput');
    if (!output) return;
    var status = text(response && response.status || 'unavailable');
    var heading = status === 'resolved' ? 'Model evidence supports the serial date'
      : status === 'conflict' ? 'Model and serial evidence conflict'
        : status === 'ambiguous' ? 'Date remains ambiguous' : 'Model evidence unavailable';
    var summary = text(response && response.summary || 'Model evidence could not be checked.');
    output.innerHTML = '<div class="info-block refinement serial-refinement-status serial-refinement-status--' + escapeHtml(status) + '"><h4>' +
      escapeHtml(heading) + '</h4><p>' + escapeHtml(summary) + '</p>' +
      (status === 'resolved' ? '<p><strong>Confirmed manufacture year:</strong> ' + escapeHtml(originalYear) + '</p>' : '') +
      evidenceHtml(response && response.evidence) + '</div>';
  }
  function verify(options, candidates) {
    var current = snapshot(options, candidates);
    var key = fingerprint(current);
    if (active && active.key === key) return active.promise;
    if (active && active.controller) active.controller.abort();
    var controller = new AbortController();
    var localSequence = ++sequence;
    renderChecking(false);
    var timeout = setTimeout(function () { controller.abort(); }, 25000);
    var slowNoticeTimeout = setTimeout(function () {
      if (!active || active.sequence !== localSequence) return;
      renderChecking(true);
    }, 5000);
    var promise = fetch('/api/refine-serial-date', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify(current),
    }).then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok) throw new Error('REFINEMENT_REQUEST_FAILED');
        return data;
      });
    }).then(function (data) {
      if (localSequence !== sequence || fingerprint(snapshot(options, candidates)) !== key) return data;
      if (window.SerialRefinementController
        && typeof window.SerialRefinementController.constrainResponseToSerialCandidates === 'function') {
        data = window.SerialRefinementController.constrainResponseToSerialCandidates(data, candidates);
      }
      render(data, candidates[0]);
      if (window.lastSerialResolutionState) window.lastSerialResolutionState.refinementResponse = data;
      return data;
    }).catch(function (error) {
      if (localSequence === sequence && error && error.name !== 'AbortError') {
        render({ status: 'unavailable', summary: 'Model evidence could not be checked. The serial-decoded year is preserved.', evidence: [] }, candidates[0]);
      }
      return null;
    }).finally(function () {
      clearTimeout(timeout);
      clearTimeout(slowNoticeTimeout);
      if (active && active.sequence === localSequence) active = null;
    });
    active = { key: key, controller: controller, sequence: localSequence, promise: promise };
    return promise;
  }
  function install() {
    if (typeof window.resolveSerialYearFromModel !== 'function' || !window.SerialRefinementController) {
      installAttempts += 1;
      if (installAttempts < 100) setTimeout(install, 50);
      return;
    }
    if (window.resolveSerialYearFromModel.__singleCandidateModelPatch) return;
    var original = window.resolveSerialYearFromModel;
    var patched = async function (options) {
      var candidates = years(options && options.candidates);
      var model = text(options && options.model).trim();
      if (candidates.length !== 1 || !model) return original.apply(this, arguments);
      verify(options || {}, candidates);
      return {
        chosenYear: candidates[0],
        summary: 'Serial decoded. Verifying the model against the decoded year…',
        confidence: '', source: 'background-refinement', lookupData: null,
      };
    };
    patched.__singleCandidateModelPatch = true;
    patched.__originalResolver = original;
    window.resolveSerialYearFromModel = patched;
    window.SerialRefinementSingleCandidatePatch = { verify: verify, version: '1.0.0' };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
}());
