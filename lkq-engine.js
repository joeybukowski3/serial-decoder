/**
 * lkq-engine.js — Centralized LKQ Replacement Evaluation Engine
 *
 * Single module that handles the AI prompt, output formatting, replacement
 * table, and Compare Your Own feature. Both the Serial Number Decoder results
 * and the Smart Lookup page feed data into this engine as separate instances.
 *
 * Public API:
 *   LKQEngine.evaluate(instanceId, query, resultsEl, callbacks)
 *   LKQEngine._runCompare(instanceId)          — called from inline onclick
 *   LKQEngine.clearInstance(instanceId)
 */
(function () {
  'use strict';

  // Per-instance state: { originalItem, originalSpecs, resultsEl }
  var _instances = {};

  // ── Private utilities ─────────────────────────────────────────────────────

  function _esc(s) {
    if (s === null || s === undefined) return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function _ratingClass(rating) {
    var r = (rating || '').toUpperCase().trim();
    if (r === 'MATCH') return 'match';
    if (r === 'CLOSE MATCH') return 'close-match';
    return 'not-lkq';
  }

  function _retailerUrl(name, query) {
    var q = encodeURIComponent(query || '');
    var n = (name || '').toLowerCase();
    if (n.indexOf('aj madison') !== -1) return 'https://www.ajmadison.com/cgi-bin/ajmadison/search.html?searchtext=' + q;
    if (n.indexOf('home depot') !== -1) return 'https://www.homedepot.com/s/' + q;
    if (n.indexOf('best buy') !== -1)   return 'https://www.bestbuy.com/site/searchpage.jsp?st=' + q;
    if (n.indexOf('grainger') !== -1)   return 'https://www.grainger.com/search?searchQuery=' + q;
    if (n.indexOf('ferguson') !== -1)   return 'https://www.ferguson.com/search?q=' + q;
    if (n.indexOf('amazon') !== -1)     return 'https://www.amazon.com/s?k=' + q;
    return '';
  }

  // ── Option card ───────────────────────────────────────────────────────────

  function _addOptionCard(container, option, index) {
    var rc = _ratingClass(option.lkqRating);
    var ratingLabel = (option.lkqRating || 'NOT LKQ').toUpperCase().trim();

    var specsHtml = '';
    if (option.keySpecs && typeof option.keySpecs === 'object') {
      Object.keys(option.keySpecs).forEach(function (k) {
        specsHtml += '<span class="lkq-mini-spec"><b>' + _esc(k) + ':</b> ' + _esc(option.keySpecs[k]) + '</span>';
      });
    }

    var url = _retailerUrl(option.retailerName || '', option.retailerSearchQuery || option.model || '');
    var buyHtml = url
      ? '<a class="lkq-buy-link" href="' + _esc(url) + '" target="_blank" rel="noopener noreferrer">' + _esc(option.retailerName || 'Buy') + ' &#8594;</a>'
      : (option.retailerName ? '<span style="font-size:0.78rem;color:#64748b;">' + _esc(option.retailerName) + '</span>' : '');

    var card = document.createElement('div');
    card.className = 'lkq-option-card lkq-row-hidden';
    card.innerHTML =
      '<div class="lkq-option-top">' +
        '<div class="lkq-option-nameblock">' +
          '<div class="lkq-option-name">' + _esc(option.name || '') + '</div>' +
          (option.model ? '<div class="lkq-option-model">' + _esc(option.model) + '</div>' : '') +
        '</div>' +
        '<span class="lkq-badge ' + rc + '">' + _esc(ratingLabel) + '</span>' +
      '</div>' +
      (specsHtml ? '<div class="lkq-option-specs">' + specsHtml + '</div>' : '') +
      (option.lkqRationale ? '<p class="lkq-option-rationale">' + _esc(option.lkqRationale) + '</p>' : '') +
      '<div class="lkq-option-bottom">' +
        '<span class="lkq-option-price">' + _esc(option.priceRange || 'N/A') + '</span>' +
        buyHtml +
      '</div>';

    container.appendChild(card);

    // Staggered reveal
    setTimeout(function () {
      card.classList.remove('lkq-row-hidden');
      card.classList.add('lkq-row-enter');
    }, index * 180);
  }

  // ── Render the three-section output ──────────────────────────────────────

  function _renderOutput(instanceId, data, resultsEl) {
    var summary = data.itemSummary || {};
    var options = Array.isArray(data.replacementOptions) ? data.replacementOptions : [];

    // Persist context for compare feature
    _instances[instanceId] = {
      originalItem:  summary.name || '',
      originalSpecs: summary.keySpecs || {},
      resultsEl:     resultsEl,
    };

    // ── Section 1: Item Summary ──────────────────────────────────────────
    var chips = '';
    if (summary.keySpecs && typeof summary.keySpecs === 'object') {
      Object.keys(summary.keySpecs).forEach(function (k) {
        chips +=
          '<span class="lkq-spec-chip">' +
            '<span class="lkq-chip-label">' + _esc(k) + '</span>' +
            '<span class="lkq-chip-val">' + _esc(summary.keySpecs[k]) + '</span>' +
          '</span>';
      });
    }

    var s1 =
      '<div class="lkq-section">' +
        '<div class="lkq-section-hd">' +
          '<span class="lkq-step-num">1</span>' +
          '<span class="lkq-step-title">Item Summary</span>' +
        '</div>' +
        '<div class="lkq-summary-body">' +
          (summary.name        ? '<div class="lkq-item-name">' + _esc(summary.name) + '</div>' : '') +
          (summary.description ? '<p class="lkq-item-desc">'   + _esc(summary.description) + '</p>' : '') +
          (chips               ? '<div class="lkq-spec-chips">' + chips + '</div>' : '') +
          (summary.estimatedAgeRange
            ? '<div class="lkq-age-line">Estimated Age Range: ' + _esc(summary.estimatedAgeRange) + '</div>'
            : '') +
        '</div>' +
      '</div>';

    // ── Section 2: Replacement Options ───────────────────────────────────
    // Options list container receives a scoped ID for post-render card injection
    var listId = 'lkq-options-' + instanceId;
    var s2 =
      '<div class="lkq-section">' +
        '<div class="lkq-section-hd">' +
          '<span class="lkq-step-num">2</span>' +
          '<span class="lkq-step-title">Replacement Options</span>' +
        '</div>' +
        '<div class="lkq-options-list" id="' + _esc(listId) + '"></div>' +
      '</div>';

    // ── Section 3: Compare Your Own Recommendation ────────────────────────
    // Inline onclick passes instanceId so the engine knows which instance to use
    var safeId = _esc(instanceId);
    var s3 =
      '<div class="lkq-section lkq-compare-section">' +
        '<div class="lkq-section-hd">' +
          '<span class="lkq-step-num">3</span>' +
          '<span class="lkq-step-title">Compare Your Own Recommendation</span>' +
        '</div>' +
        '<p class="lkq-compare-desc">Have a specific replacement in mind? Enter it below to get an LKQ assessment.</p>' +
        '<div class="lkq-compare-row">' +
          '<input type="text" class="search-input lkq-compare-input" placeholder="Enter brand and model (e.g. Samsung WF45R6100AW)">' +
          '<button class="btn-amber lkq-compare-btn" onclick="LKQEngine._runCompare(\'' + safeId + '\')">Compare</button>' +
        '</div>' +
        '<div class="lkq-compare-result"></div>' +
      '</div>';

    resultsEl.innerHTML = s1 + s2 + s3;

    // Bind Enter key on the compare input
    var compareInput = resultsEl.querySelector('.lkq-compare-input');
    if (compareInput) {
      compareInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') LKQEngine._runCompare(instanceId);
      });
    }

    // Populate option cards with staggered animation
    var optList = document.getElementById(listId);
    if (optList && options.length > 0) {
      options.forEach(function (opt, i) { _addOptionCard(optList, opt, i); });
    } else if (optList) {
      optList.innerHTML = '<p style="font-size:0.83rem;color:#64748b;padding:0.5rem 0;">No replacement options found. Try a more specific query.</p>';
    }
  }

  // ── Public: evaluate ──────────────────────────────────────────────────────
  //
  // instanceId  — unique string per entry point ('smart-lookup', 'serial-decoder')
  // query       — search string to send to the API
  // resultsEl   — DOM element to render the 3-section output into
  // callbacks   — { onSuccess(), onError(type, message) }

  async function evaluate(instanceId, query, resultsEl, callbacks) {
    callbacks = callbacks || {};
    if (!query || !resultsEl) return;

    try {
      var res = await fetch('/api/lkq-lookup', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ query: query }),
      });

      if (res.status === 429) {
        if (typeof callbacks.onError === 'function') {
          callbacks.onError('rate-limit', 'You\'ve reached the Smart Lookup usage limit. Please wait a few minutes and try again.');
        }
        return;
      }
      if (res.status === 503) {
        if (typeof callbacks.onError === 'function') {
          callbacks.onError('capacity', 'Capacity limit reached. Please try again shortly.');
        }
        return;
      }

      var data;
      try {
        var ct = (res.headers && res.headers.get('content-type')) || '';
        data = ct.toLowerCase().indexOf('application/json') !== -1
          ? await res.json()
          : { error: 'Unexpected server response. Please try again.' };
      } catch (_) {
        data = { error: 'Could not parse server response. Please try again.' };
      }

      if (data.errorCode === 'RATE_LIMIT') {
        if (typeof callbacks.onError === 'function') {
          callbacks.onError('rate-limit', 'You\'ve reached the Smart Lookup usage limit. Please wait a few minutes and try again.');
        }
        return;
      }
      if (data.error) {
        if (typeof callbacks.onError === 'function') {
          callbacks.onError('api', data.error);
        }
        return;
      }

      _renderOutput(instanceId, data, resultsEl);

      if (typeof callbacks.onSuccess === 'function') {
        callbacks.onSuccess();
      }
    } catch (e) {
      console.error('[LKQEngine] evaluate failed:', e);
      if (typeof callbacks.onError === 'function') {
        callbacks.onError('network', 'Smart Lookup is temporarily unavailable. Please try again.');
      }
    }
  }

  // ── Public: _runCompare ───────────────────────────────────────────────────
  //
  // Called from inline onclick inside the rendered Section 3 output.

  async function _runCompare(instanceId) {
    var inst = _instances[instanceId];
    if (!inst || !inst.resultsEl) return;

    var inputEl  = inst.resultsEl.querySelector('.lkq-compare-input');
    var resultEl = inst.resultsEl.querySelector('.lkq-compare-result');
    if (!inputEl || !resultEl) return;

    var recommendation = String(inputEl.value || '').trim();
    if (!recommendation) { inputEl.focus(); return; }

    resultEl.innerHTML =
      '<div class="lkq-compare-loading">' +
        '<span class="lkq-dot"></span>' +
        '<span class="lkq-dot"></span>' +
        '<span class="lkq-dot"></span>' +
        '<span style="margin-left:0.35rem;">Evaluating...</span>' +
      '</div>';

    try {
      var res = await fetch('/api/lkq-compare', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalItem:  inst.originalItem  || '',
          originalSpecs: inst.originalSpecs || {},
          recommendation: recommendation,
        }),
      });

      if (res.status === 429) {
        resultEl.innerHTML = '<p style="font-size:0.83rem;color:#b45309;padding:0.5rem 0;">Usage limit reached. Please wait a moment and try again.</p>';
        return;
      }

      var data;
      try {
        var ct = (res.headers && res.headers.get('content-type')) || '';
        data = ct.toLowerCase().indexOf('application/json') !== -1
          ? await res.json()
          : { error: 'Unexpected server response.' };
      } catch (_) {
        data = { error: 'Could not parse server response.' };
      }

      if (data.error) {
        resultEl.innerHTML = '<p style="font-size:0.83rem;color:#991b1b;padding:0.5rem 0;">' + _esc(data.error) + '</p>';
        return;
      }

      var rc          = _ratingClass(data.rating);
      var ratingLabel = (data.rating || 'NOT LKQ').toUpperCase().trim();

      resultEl.innerHTML =
        '<div class="lkq-compare-verdict">' +
          '<div class="lkq-compare-verdict-top">' +
            '<span class="lkq-verdict-label">Verdict:</span>' +
            '<span class="lkq-verdict-query">' + _esc(recommendation) + '</span>' +
            '<span class="lkq-badge ' + rc + '">' + _esc(ratingLabel) + '</span>' +
          '</div>' +
          (data.explanation ? '<p class="lkq-verdict-explanation">' + _esc(data.explanation) + '</p>' : '') +
        '</div>';

    } catch (e) {
      console.error('[LKQEngine] _runCompare failed:', e);
      resultEl.innerHTML = '<p style="font-size:0.83rem;color:#991b1b;padding:0.5rem 0;">Compare is temporarily unavailable. Please try again.</p>';
    }
  }

  // ── Public: clearInstance ─────────────────────────────────────────────────

  function clearInstance(instanceId) {
    delete _instances[instanceId];
  }

  // ── Expose ────────────────────────────────────────────────────────────────

  window.LKQEngine = {
    evaluate:      evaluate,
    _runCompare:   _runCompare,
    clearInstance: clearInstance,
  };

}());
