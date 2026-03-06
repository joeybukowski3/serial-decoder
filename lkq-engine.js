/**
 * lkq-engine.js - Centralized LKQ Replacement Evaluation Engine
 *
 * Public API:
 *   LKQEngine.evaluate(instanceId, query, resultsEl, callbacks)
 *   LKQEngine._runCompare(instanceId)
 *   LKQEngine.clearInstance(instanceId)
 */
(function () {
  'use strict';

  // Per-instance state: { originalItem, originalSpecs, specLabels, resultsEl, instanceId }
  var _instances = {};

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
    if (n.indexOf('best buy') !== -1) return 'https://www.bestbuy.com/site/searchpage.jsp?st=' + q;
    if (n.indexOf('grainger') !== -1) return 'https://www.grainger.com/search?searchQuery=' + q;
    if (n.indexOf('ferguson') !== -1) return 'https://www.ferguson.com/search?q=' + q;
    if (n.indexOf('amazon') !== -1) return 'https://www.amazon.com/s?k=' + q;
    return '';
  }

  function _buildIdRow(label, value, extraClass) {
    return (
      '<div class="lkq-id-row' + (extraClass ? (' ' + extraClass) : '') + '">' +
        '<span class="lkq-id-label">' + _esc(label) + '</span>' +
        '<span class="lkq-id-value">' + _esc(value || '—') + '</span>' +
      '</div>'
    );
  }

  function _buildIdCard(summary) {
    var itemName = summary.name || summary.itemName || '';
    var brand = summary.brand || '';
    var modelNumber = summary.modelNumber || summary.model || '';
    var category = summary.category || '';
    var estimatedAge = summary.estimatedAgeRange || '';
    var description = summary.description || '';

    return (
      '<div class="lkq-section-pad lkq-id-card">' +
        '<div class="lkq-id-header">' +
          '<span class="lkq-section-num">1</span>' +
          '<span class="lkq-section-title">Item Identification</span>' +
        '</div>' +
        '<div class="lkq-id-rows">' +
          _buildIdRow('Item Name', itemName) +
          _buildIdRow('Brand', brand) +
          _buildIdRow('Model Number', modelNumber) +
          _buildIdRow('Category', category) +
          _buildIdRow('Estimated Age', estimatedAge) +
          _buildIdRow('Description', description, 'lkq-id-row-desc') +
        '</div>' +
      '</div>'
    );
  }

  function _buildSuccessorRow(ss) {
    var type = (ss && ss.type) || 'none';

    var badgeLabel = 'No In-Brand Match';
    var badgeClass = 'lkq-successor-tag--none';
    if (type === 'direct_successor') {
      badgeLabel = 'Direct Successor';
      badgeClass = 'lkq-successor-tag--direct';
    } else if (type === 'same_brand_equivalent') {
      badgeLabel = 'Same-Brand Equivalent';
      badgeClass = 'lkq-successor-tag--equiv';
    }

    var name = (ss && ss.name) ? ss.name : 'No in-brand replacement found';
    var model = (ss && ss.model) ? ss.model : '—';
    var explanation = (ss && ss.explanation) ? ss.explanation : 'No in-brand replacement is currently available.';

    return (
      '<div class="lkq-section-pad lkq-successor-card">' +
        '<div class="lkq-section-hd">' +
          '<span class="lkq-step-num">2</span>' +
          '<span class="lkq-step-title">Successor / In-Brand Status</span>' +
        '</div>' +
        '<div class="lkq-successor-rowline">' +
          '<span class="lkq-successor-label">Successor / In-Brand Replacement</span>' +
          '<span class="lkq-successor-tag ' + badgeClass + '">' + _esc(badgeLabel) + '</span>' +
        '</div>' +
        '<div class="lkq-successor-name">' + _esc(name) + '</div>' +
        '<div class="lkq-successor-model">Model: ' + _esc(model) + '</div>' +
        '<p class="lkq-successor-desc">' + _esc(explanation) + '</p>' +
      '</div>'
    );
  }

  function _yourPickEditorCell(instanceId) {
    return (
      '<td class="lkq-td lkq-td-yourpick lkq-yourpick-cell" data-yourpick-row="name">' +
        '<div class="lkq-yourpick-editor">' +
          '<input type="text" class="search-input lkq-compare-input" placeholder="Enter brand + model">' +
          '<button class="btn-amber lkq-compare-btn" onclick="LKQEngine._runCompare(\'' + _esc(instanceId) + '\')">Load</button>' +
          '<div class="lkq-compare-status"></div>' +
        '</div>' +
      '</td>'
    );
  }

  function _yourPickEmptyCell(rowKey) {
    return '<td class="lkq-td lkq-td-yourpick lkq-yourpick-cell lkq-yourpick-empty" data-yourpick-row="' + _esc(rowKey) + '">—</td>';
  }

  function _buildTable(summary, originalSpecs, specLabels, options, bestMatchLabel, instanceId) {
    var tableOptions = Array.isArray(options) ? options.slice(0, 3) : [];
    if (!tableOptions.length) {
      return '<p class="lkq-no-options">No replacement options found. Try a more specific query.</p>';
    }

    var headerCells =
      '<th class="lkq-th-label"></th>' +
      '<th class="lkq-th-original">Original Item</th>';

    tableOptions.forEach(function (opt, i) {
      if (i === 0) {
        headerCells += '<th class="lkq-th-best">' + _esc(bestMatchLabel || 'Best Match') + '</th>';
      } else {
        headerCells += '<th class="lkq-th">Option ' + (i + 1) + '</th>';
      }
    });
    headerCells += '<th class="lkq-th-yourpick">Your Pick</th>';

    var rows = '';

    // Item Name / Model row
    rows += '<tr data-row="name"><td class="lkq-td-label">Item Name / Model</td>';
    rows += '<td class="lkq-td lkq-td-original"><div class="lkq-td-name">' + _esc(summary.name || '') + '</div>' +
      ((summary.modelNumber || summary.model) ? '<div class="lkq-td-model">' + _esc(summary.modelNumber || summary.model) + '</div>' : '') + '</td>';
    tableOptions.forEach(function (opt, i) {
      var cls = i === 0 ? 'lkq-td lkq-td-best' : 'lkq-td';
      rows += '<td class="' + cls + '"><div class="lkq-td-name">' + _esc(opt.name || '') + '</div>' +
        (opt.model ? '<div class="lkq-td-model">' + _esc(opt.model) + '</div>' : '') + '</td>';
    });
    rows += _yourPickEditorCell(instanceId);
    rows += '</tr>';

    // LKQ Rating
    rows += '<tr data-row="rating"><td class="lkq-td-label">LKQ Rating</td>';
    rows += '<td class="lkq-td lkq-td-original"><span class="lkq-badge lkq-badge-original">Original</span></td>';
    tableOptions.forEach(function (opt, i) {
      var cls = i === 0 ? 'lkq-td lkq-td-best' : 'lkq-td';
      var rc = _ratingClass(opt.lkqRating);
      rows += '<td class="' + cls + '"><span class="lkq-badge ' + rc + '">' +
        _esc((opt.lkqRating || 'NOT LKQ').toUpperCase().trim()) + '</span></td>';
    });
    rows += _yourPickEmptyCell('rating');
    rows += '</tr>';

    // Brand
    rows += '<tr data-row="brand"><td class="lkq-td-label">Brand</td>';
    rows += '<td class="lkq-td lkq-td-original">' + _esc(summary.brand || '—') + '</td>';
    tableOptions.forEach(function (opt, i) {
      var cls = i === 0 ? 'lkq-td lkq-td-best' : 'lkq-td';
      rows += '<td class="' + cls + '">' + _esc(opt.brand || '—') + '</td>';
    });
    rows += _yourPickEmptyCell('brand');
    rows += '</tr>';

    // Price Range
    rows += '<tr data-row="price"><td class="lkq-td-label">Price Range</td>';
    rows += '<td class="lkq-td lkq-td-original lkq-no-val">—</td>';
    tableOptions.forEach(function (opt, i) {
      var cls = i === 0 ? 'lkq-td lkq-td-best' : 'lkq-td';
      rows += '<td class="' + cls + '">' + _esc(opt.priceRange || '—') + '</td>';
    });
    rows += _yourPickEmptyCell('price');
    rows += '</tr>';

    // Specs
    specLabels.forEach(function (label, si) {
      var rowKey = 'spec-' + si;
      rows += '<tr data-row="' + rowKey + '"><td class="lkq-td-label">' + _esc(label) + '</td>';
      rows += '<td class="lkq-td lkq-td-original">' + _esc((originalSpecs && originalSpecs[label]) || '—') + '</td>';
      tableOptions.forEach(function (opt, i) {
        var cls = i === 0 ? 'lkq-td lkq-td-best' : 'lkq-td';
        var val = (opt.specs && opt.specs[label]) || '—';
        rows += '<td class="' + cls + '">' + _esc(val) + '</td>';
      });
      rows += _yourPickEmptyCell(rowKey);
      rows += '</tr>';
    });

    // Retailer Link
    rows += '<tr data-row="buy"><td class="lkq-td-label">Retailer Link</td>';
    rows += '<td class="lkq-td lkq-td-original lkq-no-val">—</td>';
    tableOptions.forEach(function (opt, i) {
      var cls = i === 0 ? 'lkq-td lkq-td-best' : 'lkq-td';
      var url = _retailerUrl(opt.retailerName || '', opt.retailerSearchQuery || opt.model || '');
      var buyCell = url
        ? '<a class="lkq-buy-link" href="' + _esc(url) + '" target="_blank" rel="noopener noreferrer">' + _esc(opt.retailerName || 'Buy') + ' &#8594;</a>'
        : (opt.retailerName ? '<span class="lkq-no-val">' + _esc(opt.retailerName) + '</span>' : '<span class="lkq-no-val">—</span>');
      rows += '<td class="' + cls + '">' + buyCell + '</td>';
    });
    rows += _yourPickEmptyCell('buy');
    rows += '</tr>';

    // Notes
    rows += '<tr data-row="notes"><td class="lkq-td-label">Notes</td>';
    rows += '<td class="lkq-td lkq-td-original lkq-no-val">—</td>';
    tableOptions.forEach(function (opt, i) {
      var cls = i === 0 ? 'lkq-td lkq-td-best' : 'lkq-td';
      rows += '<td class="' + cls + '"><span class="lkq-notes-text">' + _esc(opt.notes || '—') + '</span></td>';
    });
    rows += _yourPickEmptyCell('notes');
    rows += '</tr>';

    return (
      '<div class="lkq-table-wrap">' +
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
      notes.push('Best Match is the direct generational successor to the original item.');
    } else if (type === 'none') {
      notes.push('No in-brand replacement is available at this time; options shown are closest market equivalents.');
      if (ss && ss.explanation) notes.push(String(ss.explanation));
    } else if (type === 'same_brand_equivalent') {
      notes.push('Best Match is the closest available same-brand equivalent to the original item.');
      if (ss && ss.explanation) notes.push(String(ss.explanation));
    }

    return (
      '<div class="lkq-table-footnotes">' +
        notes.map(function (n) { return '<p><em>' + _esc(n) + '</em></p>'; }).join('') +
      '</div>'
    );
  }

  function _bindYourPickInput(resultsEl, instanceId) {
    var input = resultsEl.querySelector('.lkq-compare-input');
    if (!input) return;
    input.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') LKQEngine._runCompare(instanceId);
    });
  }

  function _renderOutput(instanceId, data, resultsEl) {
    var summary = data.itemSummary || {};
    var options = Array.isArray(data.replacementOptions) ? data.replacementOptions : [];
    var specLabels = Array.isArray(data.specLabels) ? data.specLabels : [];
    var originalSpecs = data.originalSpecs || {};
    var successorStatus = data.successorStatus || { type: 'none', explanation: '' };
    var bestMatchLabel = data.bestMatchLabel || 'Best Match';

    _instances[instanceId] = {
      originalItem: summary.name || '',
      originalSpecs: originalSpecs,
      specLabels: specLabels,
      resultsEl: resultsEl,
      instanceId: instanceId,
    };

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
        _buildTable(summary, originalSpecs, specLabels, options, bestMatchLabel, instanceId) +
        _buildTableFootnotes(successorStatus) +
      '</div>';

    _bindYourPickInput(resultsEl, instanceId);
  }

  function _setYourPickCell(table, rowKey, html) {
    var tr = table.querySelector('tbody tr[data-row="' + rowKey + '"]');
    if (!tr) return;
    var td = tr.querySelector('td[data-yourpick-row="' + rowKey + '"]');
    if (!td) return;
    td.classList.remove('lkq-yourpick-empty');
    td.innerHTML = html;
  }

  async function _runCompare(instanceId) {
    var inst = _instances[instanceId];
    if (!inst || !inst.resultsEl) return;

    var inputEl = inst.resultsEl.querySelector('.lkq-compare-input');
    var statusEl = inst.resultsEl.querySelector('.lkq-compare-status');
    if (!inputEl || !statusEl) return;

    var recommendation = String(inputEl.value || '').trim();
    if (!recommendation) {
      inputEl.focus();
      return;
    }

    statusEl.innerHTML =
      '<div class="lkq-compare-loading">' +
        '<span class="lkq-dot"></span>' +
        '<span class="lkq-dot"></span>' +
        '<span class="lkq-dot"></span>' +
        '<span style="margin-left:0.35rem;">Evaluating...</span>' +
      '</div>';

    try {
      var res = await fetch('/api/lkq-compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalItem: inst.originalItem || '',
          originalSpecs: inst.originalSpecs || {},
          specLabels: inst.specLabels || [],
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

      _appendYourPickColumn(instanceId, data, recommendation);

    } catch (e) {
      console.error('[LKQEngine] _runCompare failed:', e);
      statusEl.innerHTML = '<p class="lkq-compare-err">Compare is temporarily unavailable. Please try again.</p>';
    }
  }

  function _appendYourPickColumn(instanceId, data, recommendation) {
    var inst = _instances[instanceId];
    if (!inst || !inst.resultsEl) return;

    var table = inst.resultsEl.querySelector('.lkq-comparison-table');
    if (!table) return;

    var rc = _ratingClass(data.rating);
    var ratingLabel = (data.rating || 'NOT LKQ').toUpperCase().trim();
    var url = _retailerUrl(data.retailerName || '', data.retailerSearchQuery || recommendation || '');

    _setYourPickCell(
      table,
      'name',
      '<div class="lkq-yourpick-editor">' +
        '<input type="text" class="search-input lkq-compare-input" placeholder="Enter brand + model" value="' + _esc(recommendation) + '">' +
        '<button class="btn-amber lkq-compare-btn" onclick="LKQEngine._runCompare(\'' + _esc(instanceId) + '\')">Load</button>' +
        '<div class="lkq-compare-status"></div>' +
      '</div>' +
      '<div class="lkq-yourpick-loaded">' +
        '<div class="lkq-td-name">' + _esc(data.name || recommendation) + '</div>' +
        (data.model ? '<div class="lkq-td-model">' + _esc(data.model) + '</div>' : '') +
      '</div>'
    );

    _setYourPickCell(table, 'rating', '<span class="lkq-badge ' + rc + '">' + _esc(ratingLabel) + '</span>');
    _setYourPickCell(table, 'brand', _esc(data.brand || '—'));
    _setYourPickCell(table, 'price', _esc(data.priceRange || '—'));

    _setYourPickCell(
      table,
      'buy',
      url
        ? '<a class="lkq-buy-link" href="' + _esc(url) + '" target="_blank" rel="noopener noreferrer">' + _esc(data.retailerName || 'Buy') + ' &#8594;</a>'
        : (data.retailerName ? '<span class="lkq-no-val">' + _esc(data.retailerName) + '</span>' : '<span class="lkq-no-val">—</span>')
    );

    _setYourPickCell(table, 'notes', '<span class="lkq-notes-text">' + _esc(data.notes || data.explanation || '—') + '</span>');

    table.querySelectorAll('tbody tr[data-row^="spec-"]').forEach(function (tr) {
      var rowKey = tr.getAttribute('data-row');
      var idx = parseInt(rowKey.replace('spec-', ''), 10);
      var label = inst.specLabels[idx] || '';
      var val = (data.specs && label && data.specs[label]) || '—';
      _setYourPickCell(table, rowKey, _esc(val));
    });

    _bindYourPickInput(inst.resultsEl, instanceId);
  }

  function clearInstance(instanceId) {
    var inst = _instances[instanceId];
    if (inst && inst.resultsEl) {
      var card = inst.resultsEl.closest('.results-card');
      if (card) card.classList.remove('lkq-results-full');
    }
    delete _instances[instanceId];
  }

  async function evaluate(instanceId, query, resultsEl, callbacks) {
    callbacks = callbacks || {};
    if (!query || !resultsEl) return;

    try {
      var res = await fetch('/api/lkq-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query }),
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

  window.LKQEngine = {
    evaluate: evaluate,
    _runCompare: _runCompare,
    clearInstance: clearInstance,
  };
}());
