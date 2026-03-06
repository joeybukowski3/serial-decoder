/**
 * lkq-engine.js — Centralized LKQ Replacement Evaluation Engine
 *
 * Renders a 4-section column-based comparison table. Both the Serial Number
 * Decoder results and the Smart Lookup page feed data into this engine.
 *
 * Public API:
 *   LKQEngine.evaluate(instanceId, query, resultsEl, callbacks)
 *   LKQEngine._runCompare(instanceId)          — called from inline onclick
 *   LKQEngine.clearInstance(instanceId)
 */
(function () {
  'use strict';

  // Per-instance state: { originalItem, originalSpecs, specLabels, resultsEl }
  var _instances = {};

  // ── Utilities ─────────────────────────────────────────────────────────────

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

  // ── Section builders ──────────────────────────────────────────────────────

  function _buildIdCard(summary) {
    var pills = '';
    if (summary.category) {
      pills += '<span class="lkq-pill">' + _esc(summary.category) + '</span>';
    }

    var ageRows = '';
    if (summary.manufactureYear) {
      ageRows += '<div class="sl-result-row"><span class="sl-result-label">Confirmed Manufacture Year</span><span class="sl-result-value sl-result-highlight">' + _esc(summary.manufactureYear) + '</span></div>';
    }
    if (summary.retailAvailability) {
      ageRows += '<div class="sl-result-row"><span class="sl-result-label">Confirmed Retail Availability</span><span class="sl-result-value sl-result-highlight">' + _esc(summary.retailAvailability) + '</span></div>';
    }
    if (summary.estimatedAgeRange) {
      ageRows += '<div class="sl-result-row"><span class="sl-result-label">Estimated Age</span><span class="sl-result-value sl-result-highlight">' + _esc(summary.estimatedAgeRange) + '</span></div>';
    }

    return (
      '<div class="lkq-id-card">' +
      '<div class="lkq-id-header">' +
      '<span class="lkq-section-num">1</span>' +
      '<span class="lkq-section-title">Item Identification</span>' +
      '</div>' +
      '<div class="lkq-id-name">' + _esc(summary.name || '') + '</div>' +
      (summary.modelNumber ? '<div class="lkq-id-model">Model: ' + _esc(summary.modelNumber) + '</div>' : '') +
      (summary.specs ? '<div class="lkq-id-specs">' + _esc(summary.specs) + '</div>' : '') +
      '<div class="lkq-pills">' + pills + '</div>' +
      ageRows +
      (summary.description ? '<div class="lkq-id-desc">' + _esc(summary.description) + '</div>' : '') +
      '</div>'
    );
  }

  function _buildSuccessorRow(ss) {
    var type = (ss && ss.type) || 'none';
    var inner = '';

    if (type === 'direct_successor') {
      inner =
        '<span class="lkq-successor-tag lkq-successor-tag--direct">Direct Successor</span>' +
        '<span class="lkq-successor-item">' +
          _esc(ss.name || '') + (ss.model ? ' &middot; ' + _esc(ss.model) : '') +
        '</span>' +
        (ss.explanation ? '<span class="lkq-successor-expl">' + _esc(ss.explanation) + '</span>' : '');
    } else if (type === 'same_brand_equivalent') {
      inner =
        '<span class="lkq-successor-tag lkq-successor-tag--equiv">Same-Brand Equivalent</span>' +
        '<span class="lkq-successor-item">' +
          _esc(ss.name || '') + (ss.model ? ' &middot; ' + _esc(ss.model) : '') +
        '</span>' +
        (ss.explanation ? '<span class="lkq-successor-expl">' + _esc(ss.explanation) + '</span>' : '');
    } else {
      inner =
        '<span class="lkq-successor-none-text">No in-brand replacement currently available</span>' +
        (ss && ss.explanation ? '<span class="lkq-successor-expl">' + _esc(ss.explanation) + '</span>' : '');
    }

    return (
      '<div class="lkq-section-pad lkq-successor-section">' +
        '<div class="lkq-section-hd">' +
          '<span class="lkq-step-num">2</span>' +
          '<span class="lkq-step-title">Successor / In-Brand Status</span>' +
        '</div>' +
        '<div class="lkq-successor-row">' + inner + '</div>' +
      '</div>'
    );
  }

  function _buildTable(summary, originalSpecs, specLabels, options, bestMatchLabel) {
    if (!options.length) {
      return '<p class="lkq-no-options">No replacement options found. Try a more specific query.</p>';
    }

    // Header row
    var headerCells =
      '<th class="lkq-th-label"></th>' +
      '<th class="lkq-th-original">Original Item</th>';

    options.forEach(function (opt, i) {
      if (i === 0) {
        headerCells += '<th class="lkq-th-best">' + _esc(bestMatchLabel || 'Best Match') + '</th>';
      } else {
        headerCells += '<th class="lkq-th">Option ' + (i + 1) + '</th>';
      }
    });

    var rows = '';

    // Item Name row
    rows += '<tr data-row="name"><td class="lkq-td-label">Item</td>';
    rows += '<td class="lkq-td lkq-td-original"><div class="lkq-td-name">' + _esc(summary.name || '') + '</div>' +
      (summary.model ? '<div class="lkq-td-model">' + _esc(summary.model) + '</div>' : '') + '</td>';
    options.forEach(function (opt, i) {
      var cls = i === 0 ? 'lkq-td lkq-td-best' : 'lkq-td';
      rows += '<td class="' + cls + '"><div class="lkq-td-name">' + _esc(opt.name || '') + '</div>' +
        (opt.model ? '<div class="lkq-td-model">' + _esc(opt.model) + '</div>' : '') + '</td>';
    });
    rows += '</tr>';

    // LKQ Rating row
    rows += '<tr data-row="rating"><td class="lkq-td-label">LKQ Rating</td>';
    rows += '<td class="lkq-td lkq-td-original"><span class="lkq-badge lkq-badge-original">Original</span></td>';
    options.forEach(function (opt, i) {
      var cls = i === 0 ? 'lkq-td lkq-td-best' : 'lkq-td';
      var rc = _ratingClass(opt.lkqRating);
      rows += '<td class="' + cls + '"><span class="lkq-badge ' + rc + '">' +
        _esc((opt.lkqRating || 'NOT LKQ').toUpperCase().trim()) + '</span></td>';
    });
    rows += '</tr>';

    // Brand row
    rows += '<tr data-row="brand"><td class="lkq-td-label">Brand</td>';
    rows += '<td class="lkq-td lkq-td-original">' + _esc(summary.brand || '—') + '</td>';
    options.forEach(function (opt, i) {
      var cls = i === 0 ? 'lkq-td lkq-td-best' : 'lkq-td';
      rows += '<td class="' + cls + '">' + _esc(opt.brand || '—') + '</td>';
    });
    rows += '</tr>';

    // Price Range row
    rows += '<tr data-row="price"><td class="lkq-td-label">Price Range</td>';
    rows += '<td class="lkq-td lkq-td-original lkq-no-val">—</td>';
    options.forEach(function (opt, i) {
      var cls = i === 0 ? 'lkq-td lkq-td-best' : 'lkq-td';
      rows += '<td class="' + cls + '">' + _esc(opt.priceRange || '—') + '</td>';
    });
    rows += '</tr>';

    // Spec rows
    specLabels.forEach(function (label, si) {
      rows += '<tr data-row="spec-' + si + '"><td class="lkq-td-label">' + _esc(label) + '</td>';
      rows += '<td class="lkq-td lkq-td-original">' + _esc((originalSpecs && originalSpecs[label]) || '—') + '</td>';
      options.forEach(function (opt, i) {
        var cls = i === 0 ? 'lkq-td lkq-td-best' : 'lkq-td';
        var val = (opt.specs && opt.specs[label]) || '—';
        rows += '<td class="' + cls + '">' + _esc(val) + '</td>';
      });
      rows += '</tr>';
    });

    // Where to Buy row
    rows += '<tr data-row="buy"><td class="lkq-td-label">Where to Buy</td>';
    rows += '<td class="lkq-td lkq-td-original lkq-no-val">—</td>';
    options.forEach(function (opt, i) {
      var cls = i === 0 ? 'lkq-td lkq-td-best' : 'lkq-td';
      var url = _retailerUrl(opt.retailerName || '', opt.retailerSearchQuery || opt.model || '');
      var buyCell = url
        ? '<a class="lkq-buy-link" href="' + _esc(url) + '" target="_blank" rel="noopener noreferrer">' + _esc(opt.retailerName || 'Buy') + ' &#8594;</a>'
        : (opt.retailerName ? '<span class="lkq-no-val">' + _esc(opt.retailerName) + '</span>' : '<span class="lkq-no-val">—</span>');
      rows += '<td class="' + cls + '">' + buyCell + '</td>';
    });
    rows += '</tr>';

    // Notes row
    rows += '<tr data-row="notes"><td class="lkq-td-label">Notes</td>';
    rows += '<td class="lkq-td lkq-td-original lkq-no-val">—</td>';
    options.forEach(function (opt, i) {
      var cls = i === 0 ? 'lkq-td lkq-td-best' : 'lkq-td';
      rows += '<td class="' + cls + '"><span class="lkq-notes-text">' + _esc(opt.notes || '—') + '</span></td>';
    });
    rows += '</tr>';

    return (
      '<div class="lkq-table-scroll">' +
        '<table class="lkq-comparison-table">' +
          '<thead><tr>' + headerCells + '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>'
    );
  }

  function _buildTableFootnotes(ss) {
    var type = (ss && ss.type) || 'none';
    var notes = [];

    if (type === 'direct_successor') {
      notes.push('&#9733; Best Match is the direct successor model from the original manufacturer.');
    } else if (type === 'same_brand_equivalent') {
      notes.push('&#9733; Best Match is the same-brand equivalent from the original manufacturer.');
    } else {
      notes.push('&#9432; No in-brand replacement is currently available from the original manufacturer.');
    }

    return (
      '<div class="lkq-table-footnotes">' +
        notes.map(function (n) { return '<p>' + n + '</p>'; }).join('') +
      '</div>'
    );
  }

  function _buildCompareSection(instanceId) {
    var safeId = _esc(instanceId);
    return (
      '<div class="lkq-section-pad lkq-compare-section">' +
        '<div class="lkq-section-hd">' +
          '<span class="lkq-step-num">4</span>' +
          '<span class="lkq-step-title">Compare Your Own Recommendation</span>' +
        '</div>' +
        '<p class="lkq-compare-desc">Have a specific replacement in mind? Enter it below to add it as a column in the table above.</p>' +
        '<div class="lkq-compare-row">' +
          '<input type="text" class="search-input lkq-compare-input" placeholder="Enter brand and model (e.g. Samsung WF45R6100AW)">' +
          '<button class="btn-amber lkq-compare-btn" onclick="LKQEngine._runCompare(\'' + safeId + '\')">Compare</button>' +
        '</div>' +
        '<div class="lkq-compare-status"></div>' +
      '</div>'
    );
  }

  // ── Render output ─────────────────────────────────────────────────────────

  function _renderOutput(instanceId, data, resultsEl) {
    var summary        = data.itemSummary || {};
    var options        = Array.isArray(data.replacementOptions) ? data.replacementOptions : [];
    var specLabels     = Array.isArray(data.specLabels) ? data.specLabels : [];
    var originalSpecs  = data.originalSpecs || {};
    var successorStatus = data.successorStatus || { type: 'none', explanation: '' };
    var bestMatchLabel = data.bestMatchLabel || 'Best Match';

    // Persist context for compare
    _instances[instanceId] = {
      originalItem:  summary.name || '',
      originalSpecs: originalSpecs,
      specLabels:    specLabels,
      resultsEl:     resultsEl,
    };

    // Expand results card to full width
    var card = resultsEl.closest('.results-card');
    if (card) card.classList.add('lkq-results-full');

    resultsEl.innerHTML =
      _buildIdCard(summary) +
      _buildSuccessorRow(successorStatus) +
      '<div class="lkq-section-pad lkq-table-section">' +
        '<div class="lkq-section-hd">' +
          '<span class="lkq-step-num">3</span>' +
          '<span class="lkq-step-title">Replacement Options</span>' +
        '</div>' +
        _buildTable(summary, originalSpecs, specLabels, options, bestMatchLabel) +
        _buildTableFootnotes(successorStatus) +
      '</div>' +
      _buildCompareSection(instanceId);

    // Bind Enter key on compare input
    var compareInput = resultsEl.querySelector('.lkq-compare-input');
    if (compareInput) {
      compareInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') LKQEngine._runCompare(instanceId);
      });
    }
  }

  // ── _runCompare: append "Your Pick" column ────────────────────────────────

  async function _runCompare(instanceId) {
    var inst = _instances[instanceId];
    if (!inst || !inst.resultsEl) return;

    var inputEl  = inst.resultsEl.querySelector('.lkq-compare-input');
    var statusEl = inst.resultsEl.querySelector('.lkq-compare-status');
    if (!inputEl || !statusEl) return;

    var recommendation = String(inputEl.value || '').trim();
    if (!recommendation) { inputEl.focus(); return; }

    statusEl.innerHTML =
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
          originalItem:   inst.originalItem  || '',
          originalSpecs:  inst.originalSpecs || {},
          specLabels:     inst.specLabels    || [],
          recommendation: recommendation,
        }),
      });

      if (res.status === 429) {
        statusEl.innerHTML = '<p class="lkq-compare-err">Usage limit reached. Please wait a moment and try again.</p>';
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
        statusEl.innerHTML = '<p class="lkq-compare-err">' + _esc(data.error) + '</p>';
        return;
      }

      _appendYourPickColumn(inst.resultsEl, inst.specLabels, data, recommendation);
      statusEl.innerHTML = '';

    } catch (e) {
      console.error('[LKQEngine] _runCompare failed:', e);
      statusEl.innerHTML = '<p class="lkq-compare-err">Compare is temporarily unavailable. Please try again.</p>';
    }
  }

  function _appendYourPickColumn(resultsEl, specLabels, data, recommendation) {
    var table = resultsEl.querySelector('.lkq-comparison-table');
    if (!table) return;

    // Remove any existing "Your Pick" column
    table.querySelectorAll('.lkq-yourpick-cell').forEach(function (el) { el.remove(); });

    // Add header cell
    var thead = table.querySelector('thead tr');
    if (thead) {
      var th = document.createElement('th');
      th.className = 'lkq-th-yourpick lkq-yourpick-cell';
      th.textContent = 'Your Pick';
      thead.appendChild(th);
    }

    var rc         = _ratingClass(data.rating);
    var ratingLabel = (data.rating || 'NOT LKQ').toUpperCase().trim();
    var url        = _retailerUrl(data.retailerName || '', data.retailerSearchQuery || recommendation || '');

    // Handlers for each data-row type
    var rowHandlers = {
      'name': function () {
        var td = _td('lkq-td lkq-td-yourpick lkq-yourpick-cell');
        td.innerHTML =
          '<div class="lkq-td-name">' + _esc(data.name || recommendation) + '</div>' +
          (data.model ? '<div class="lkq-td-model">' + _esc(data.model) + '</div>' : '');
        return td;
      },
      'rating': function () {
        var td = _td('lkq-td lkq-td-yourpick lkq-yourpick-cell');
        td.innerHTML = '<span class="lkq-badge ' + rc + '">' + _esc(ratingLabel) + '</span>';
        return td;
      },
      'brand': function () {
        var td = _td('lkq-td lkq-td-yourpick lkq-yourpick-cell');
        td.textContent = data.brand || '—';
        return td;
      },
      'price': function () {
        var td = _td('lkq-td lkq-td-yourpick lkq-yourpick-cell');
        td.textContent = data.priceRange || '—';
        return td;
      },
      'buy': function () {
        var td = _td('lkq-td lkq-td-yourpick lkq-yourpick-cell');
        td.innerHTML = url
          ? '<a class="lkq-buy-link" href="' + _esc(url) + '" target="_blank" rel="noopener noreferrer">' + _esc(data.retailerName || 'Buy') + ' &#8594;</a>'
          : (data.retailerName ? '<span class="lkq-no-val">' + _esc(data.retailerName) + '</span>' : '<span class="lkq-no-val">—</span>');
        return td;
      },
      'notes': function () {
        var td = _td('lkq-td lkq-td-yourpick lkq-yourpick-cell');
        td.innerHTML = '<span class="lkq-notes-text">' + _esc(data.notes || data.explanation || '—') + '</span>';
        return td;
      },
    };

    table.querySelectorAll('tbody tr[data-row]').forEach(function (tr) {
      var rowKey = tr.getAttribute('data-row');
      var td;

      if (rowHandlers[rowKey]) {
        td = rowHandlers[rowKey]();
      } else if (rowKey && rowKey.indexOf('spec-') === 0) {
        var si    = parseInt(rowKey.replace('spec-', ''), 10);
        var label = specLabels[si] || '';
        td = _td('lkq-td lkq-td-yourpick lkq-yourpick-cell');
        td.textContent = (data.specs && label && data.specs[label]) || '—';
      }

      if (td) tr.appendChild(td);
    });

    // Scroll table into view so the new column is visible
    var scroll = resultsEl.querySelector('.lkq-table-scroll');
    if (scroll) {
      scroll.scrollLeft = scroll.scrollWidth;
    }
  }

  function _td(className) {
    var el = document.createElement('td');
    el.className = className;
    return el;
  }

  // ── clearInstance ─────────────────────────────────────────────────────────

  function clearInstance(instanceId) {
    var inst = _instances[instanceId];
    if (inst && inst.resultsEl) {
      var card = inst.resultsEl.closest('.results-card');
      if (card) card.classList.remove('lkq-results-full');
    }
    delete _instances[instanceId];
  }

  // ── evaluate ──────────────────────────────────────────────────────────────

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

  // ── Expose ────────────────────────────────────────────────────────────────

  window.LKQEngine = {
    evaluate:      evaluate,
    _runCompare:   _runCompare,
    clearInstance: clearInstance,
  };

}());
