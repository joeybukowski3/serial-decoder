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
    if (r === 'ABOVE LKQ') return 'above-lkq';
    if (r === 'MATCH') return 'match';
    if (r === 'CLOSE MATCH') return 'close-match';
    return 'not-lkq';
  }

  function _norm(v) {
    return String(v || '').toLowerCase().trim();
  }

  function _extractNumbers(v) {
    var text = String(v || '').replace(/,/g, '').toLowerCase();
    var nums = [];
    var re = /(\d+(?:\.\d+)?)(\s*k)?/g;
    var m;
    while ((m = re.exec(text)) !== null) {
      var n = parseFloat(m[1]);
      if (!isFinite(n)) continue;
      if (m[2]) n *= 1000;
      nums.push(n);
    }
    return nums;
  }

  function _midpointFromValue(v) {
    var nums = _extractNumbers(v);
    if (!nums.length) return null;
    if (nums.length === 1) return nums[0];
    return (nums[0] + nums[1]) / 2;
  }

  function _pctDelta(original, candidate) {
    if (!isFinite(original) || !isFinite(candidate) || original === 0) return null;
    return ((candidate - original) / original) * 100;
  }

  function _panelTier(v) {
    var s = _norm(v);
    if (!s) return null;
    if (s.indexOf('oled') !== -1) return 5;
    if (s.indexOf('mini-led') !== -1 || s.indexOf('mini led') !== -1) return 4;
    if (s.indexOf('qled') !== -1 || s.indexOf('qned') !== -1) return 3;
    if (s.indexOf('led') !== -1) return 2;
    if (s.indexOf('lcd') !== -1) return 1;
    return null;
  }

  function _resolutionTier(v) {
    var s = _norm(v);
    if (!s) return null;
    if (s.indexOf('8k') !== -1) return 4;
    if (s.indexOf('4k') !== -1 || s.indexOf('uhd') !== -1 || s.indexOf('2160') !== -1) return 3;
    if (s.indexOf('1440') !== -1 || s.indexOf('2k') !== -1) return 2;
    if (s.indexOf('1080') !== -1 || s.indexOf('full hd') !== -1) return 1;
    if (s.indexOf('720') !== -1 || s.indexOf('hd') !== -1) return 0;
    return null;
  }

  function _refreshHz(v) {
    var s = _norm(v);
    var m = s.match(/(\d+(?:\.\d+)?)\s*hz/);
    if (m) return parseFloat(m[1]);
    var nums = _extractNumbers(s);
    if (nums.length) return nums[0];
    return null;
  }

  function _outcomeToClass(outcome) {
    if (outcome === 'gold') return 'lkq-spec-dot-gold';
    if (outcome === 'orange') return 'lkq-spec-dot-orange';
    if (outcome === 'red') return 'lkq-spec-dot-red';
    return 'lkq-spec-dot-green';
  }

  function _dotValueHtml(value, outcome) {
    return (
      '<span class="lkq-spec-indicator">' +
        '<span class="lkq-spec-dot ' + _outcomeToClass(outcome) + '"></span>' +
        '<span class="lkq-spec-value">' + _esc(value || '—') + '</span>' +
      '</span>'
    );
  }

  function _evaluatePriceOutcome(originalValue, candidateValue) {
    var o = _midpointFromValue(originalValue);
    var c = _midpointFromValue(candidateValue);
    if (!isFinite(o) || !isFinite(c)) return 'green';
    var d = _pctDelta(o, c);
    if (d === null) return 'green';
    if (Math.abs(d) <= 10) return 'green';
    if (Math.abs(d) <= 20) return 'orange';
    if (d < -20) return 'red';
    return 'gold';
  }

  function _evaluateSpecOutcome(label, originalValue, candidateValue) {
    var l = _norm(label);
    var o = _norm(originalValue);
    var c = _norm(candidateValue);
    if (!c || c === '—' || c === '-') return 'green';
    if (!o || o === '—' || o === '-') return 'green';
    if (o === c) return 'green';

    if (l.indexOf('panel') !== -1 || l.indexOf('display technology') !== -1 || l.indexOf('technology') !== -1) {
      var opt = _panelTier(o);
      var cpt = _panelTier(c);
      if (opt !== null && cpt !== null) {
        if (cpt > opt) return 'gold';
        if (cpt < opt) return 'red';
        return 'orange';
      }
      return 'orange';
    }

    if (l.indexOf('resolution') !== -1) {
      var ort = _resolutionTier(o);
      var crt = _resolutionTier(c);
      if (ort !== null && crt !== null) {
        if (crt > ort) return 'gold';
        if (crt < ort) return 'red';
        return 'green';
      }
      return 'orange';
    }

    if (l.indexOf('refresh') !== -1) {
      var orh = _refreshHz(o);
      var crh = _refreshHz(c);
      if (isFinite(orh) && isFinite(crh)) {
        if (crh > orh) return 'gold';
        if (crh < orh) return 'red';
        return 'green';
      }
      return 'orange';
    }

    if (l.indexOf('smart') !== -1 || l.indexOf('connectivity') !== -1 || l.indexOf('platform') !== -1) {
      var cNoSmart = c.indexOf('none') !== -1 || c.indexOf('no smart') !== -1 || c.indexOf('n/a') !== -1;
      var oHasSmart = o.indexOf('none') === -1 && o.indexOf('no smart') === -1 && o.indexOf('n/a') === -1;
      if (cNoSmart && oHasSmart) return 'red';
      if (o === c) return 'green';
      return 'orange';
    }

    if (
      l.indexOf('fuel') !== -1 ||
      l.indexOf('installation') !== -1 ||
      l.indexOf('mount') !== -1 ||
      l.indexOf('phase') !== -1
    ) {
      if (o === c) return 'green';
      var incompatible = (
        (o.indexOf('gas') !== -1 && c.indexOf('electric') !== -1) ||
        (o.indexOf('electric') !== -1 && c.indexOf('gas') !== -1) ||
        (o.indexOf('single') !== -1 && c.indexOf('three') !== -1) ||
        (o.indexOf('three') !== -1 && c.indexOf('single') !== -1) ||
        (o.indexOf('countertop') !== -1 && c.indexOf('over-the-range') !== -1) ||
        (o.indexOf('over-the-range') !== -1 && c.indexOf('countertop') !== -1) ||
        (o.indexOf('built-in') !== -1 && c.indexOf('countertop') !== -1) ||
        (o.indexOf('ventless') !== -1 && c.indexOf('vented') !== -1) ||
        (o.indexOf('vented') !== -1 && c.indexOf('ventless') !== -1)
      );
      if (incompatible) return 'red';
      return 'orange';
    }

    if (l.indexOf('efficiency') !== -1 || l.indexOf('seer') !== -1 || l.indexOf('energy') !== -1) {
      var oe = _midpointFromValue(o);
      var ce = _midpointFromValue(c);
      if (isFinite(oe) && isFinite(ce)) {
        var de = _pctDelta(oe, ce);
        if (de === null) return 'green';
        if (de > 10) return 'gold';
        if (de >= 0) return 'green';
        if (de >= -10) return 'orange';
        return 'red';
      }
      return 'orange';
    }

    if (
      l.indexOf('size') !== -1 ||
      l.indexOf('capacity') !== -1 ||
      l.indexOf('dimension') !== -1 ||
      l.indexOf('screen') !== -1
    ) {
      var os = _midpointFromValue(o);
      var cs = _midpointFromValue(c);
      if (isFinite(os) && isFinite(cs)) {
        var ds = _pctDelta(os, cs);
        if (ds === null) return 'green';
        if (Math.abs(ds) <= 10) return 'green';
        if (Math.abs(ds) <= 20) return 'orange';
        if (ds < -20) return 'red';
        return 'gold';
      }
    }

    var og = _midpointFromValue(o);
    var cg = _midpointFromValue(c);
    if (isFinite(og) && isFinite(cg)) {
      var dg = _pctDelta(og, cg);
      if (dg === null) return 'green';
      if (Math.abs(dg) <= 5) return 'green';
      if (dg > 5) return 'gold';
      if (dg < -15) return 'red';
      return 'orange';
    }

    return 'orange';
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
    var availability = summary.availability || 'Availability Unconfirmed';
    var description = summary.description || '';

    function _availabilityHtml(v) {
      var norm = String(v || '').toLowerCase();
      var cls = 'lkq-availability-unknown';
      if (norm.indexOf('currently available') !== -1) cls = 'lkq-availability-available';
      else if (norm.indexOf('discontinued') !== -1) cls = 'lkq-availability-discontinued';
      return '<span class="' + cls + '">' + _esc(v || 'Availability Unconfirmed') + '</span>';
    }

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
          '<div class="lkq-id-row">' +
            '<span class="lkq-id-label">Availability</span>' +
            '<span class="lkq-id-value">' + _availabilityHtml(availability) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="lkq-id-desc-block">' +
          '<div class="lkq-id-desc-label">Description</div>' +
          '<div class="lkq-id-desc-value">' + _esc(description || '—') + '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function _buildSuccessorRow(ss) {
    var type = (ss && ss.type) || 'none';

    var badgeLabel = 'None Available';
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

  function _buildDetailsText(text, maxLength) {
    var value = String(text || '').trim();
    var limit = maxLength || 110;
    if (!value) return '<span class="lkq-no-val">—</span>';
    if (value.length <= limit) return '<span class="lkq-card-value">' + _esc(value) + '</span>';
    return (
      '<details class="lkq-inline-details">' +
        '<summary>' + _esc(value.slice(0, limit).trim()) + '…</summary>' +
        '<div class="lkq-inline-details-body">' + _esc(value) + '</div>' +
      '</details>'
    );
  }

  function _buildOptionRow(label, html, extraClass) {
    return (
      '<div class="lkq-option-row' + (extraClass ? (' ' + extraClass) : '') + '">' +
        '<div class="lkq-option-row-label">' + _esc(label) + '</div>' +
        '<div class="lkq-option-row-value">' + html + '</div>' +
      '</div>'
    );
  }

  function _buildOriginalCell(summary, rowKey, label, originalSpecs) {
    if (rowKey === 'name') {
      return '<div class="lkq-td-name">' + _esc(summary.name || '—') + '</div>' +
        ((summary.modelNumber || summary.model) ? '<div class="lkq-td-model">' + _esc(summary.modelNumber || summary.model) + '</div>' : '');
    }
    if (rowKey === 'rating') return '<span class="lkq-rating-badge lkq-rating-original">Original</span>';
    if (rowKey === 'brand') return _esc(summary.brand || '—');
    if (rowKey === 'price') return _esc(summary.originalPriceDisplay || summary.priceRange || '—');
    if (rowKey === 'buy' || rowKey === 'notes') return '<span class="lkq-no-val">—</span>';
    return _esc((originalSpecs && originalSpecs[label]) || '—');
  }

  function _buildOptionCell(option, rowKey, label, summary, originalSpecs) {
    var val;
    var url;
    if (!option) return '<span class="lkq-no-val">—</span>';
    if (rowKey === 'name') {
      return '<div class="lkq-td-name">' + _esc(option.name || '—') + '</div>' +
        (option.model ? '<div class="lkq-td-model">' + _esc(option.model) + '</div>' : '');
    }
    if (rowKey === 'rating') {
      return '<span class="lkq-rating-badge ' + _ratingClass(option.lkqRating) + '">' + _esc((option.lkqRating || 'NOT LKQ').toUpperCase().trim()) + '</span>';
    }
    if (rowKey === 'brand') return _esc(option.brand || '—');
    if (rowKey === 'price') return _dotValueHtml(option.priceRange || '—', _evaluatePriceOutcome(summary.originalPriceDisplay || summary.priceRange || '', option.priceRange || '—'));
    if (rowKey === 'buy') {
      url = _retailerUrl(option.retailerName || '', option.retailerSearchQuery || option.model || option.name || '');
      return url
        ? '<a class="lkq-buy-link" href="' + _esc(url) + '" target="_blank" rel="noopener noreferrer">' + _esc(option.retailerName || 'Buy') + ' &#8594;</a>'
        : _buildDetailsText(option.retailerName || '—', 80);
    }
    if (rowKey === 'notes') return _buildDetailsText(option.notes || '—', 95);
    val = (option.specs && option.specs[label]) || '—';
    return _dotValueHtml(val, _evaluateSpecOutcome(label, (originalSpecs && originalSpecs[label]) || '—', val));
  }

  function _buildYourPickEditorCell(instanceId) {
    return '<div class="lkq-yourpick-editor">' +
      '<input type="text" class="search-input lkq-compare-input" placeholder="Enter brand + model">' +
      '<button class="btn-amber lkq-compare-btn" onclick="LKQEngine._runCompare(\'' + _esc(instanceId) + '\')">Load</button>' +
      '<div class="lkq-compare-status"></div>' +
    '</div>';
  }

  function _buildTable(summary, originalSpecs, specLabels, options, bestMatchLabel, instanceId) {
    var sourceOptions = Array.isArray(options) ? options : [];
    var tableOptions = [sourceOptions[0] || null, sourceOptions[1] || null, sourceOptions[2] || null];
    var hasAnyOption = tableOptions.some(function (o) { return !!o; });
    var rows = '';
    var headerCells;

    if (!hasAnyOption) {
      return '<p class="lkq-no-options">No replacement options found. Try a more specific query.</p>';
    }

    headerCells = '<th class="lkq-th-label"></th>' +
      '<th class="lkq-th-original">Original Item</th>' +
      '<th class="lkq-th-best">' + _esc(bestMatchLabel || 'Best Replacement Option') + '</th>' +
      '<th class="lkq-th">Alternative Replacement 1</th>' +
      '<th class="lkq-th">Alternative Replacement 2</th>' +
      '<th class="lkq-th-yourpick">Your Pick</th>';

    function addRow(rowKey, label) {
      rows += '<tr data-row="' + rowKey + '"><td class="lkq-td-label">' + _esc(label) + '</td>';
      rows += '<td class="lkq-td lkq-td-original">' + _buildOriginalCell(summary, rowKey, label, originalSpecs) + '</td>';
      tableOptions.forEach(function (opt, i) {
        var cls = i === 0 ? 'lkq-td lkq-td-best' : 'lkq-td';
        rows += '<td class="' + cls + '">' + _buildOptionCell(opt, rowKey, label, summary, originalSpecs) + '</td>';
      });
      rows += '<td class="lkq-td lkq-td-yourpick" data-yourpick-row="' + _esc(rowKey) + '">' + (rowKey === 'name' ? _buildYourPickEditorCell(instanceId) : '<span class="lkq-no-val">—</span>') + '</td>';
      rows += '</tr>';
    }

    addRow('name', 'Item Name / Model');
    addRow('rating', 'LKQ Rating');
    addRow('brand', 'Brand');
    addRow('price', 'Price Range');
    (specLabels || []).forEach(function (label, idx) { addRow('spec-' + idx, label); });
    addRow('buy', 'Retailer');
    addRow('notes', 'Notes');

    return '<div class="lkq-table-wrap"><table class="lkq-comparison-table"><colgroup>' +
      '<col class="lkq-col-label"><col class="lkq-col-original"><col class="lkq-col-best"><col class="lkq-col-alt1"><col class="lkq-col-alt2"><col class="lkq-col-yourpick">' +
      '</colgroup><thead><tr>' + headerCells + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function _buildTableFootnotes(ss) {
    var type = (ss && ss.type) || 'none';
    var notes = [];

    if (type === 'direct_successor') {
      notes.push('Best Replacement Option is the current in-market same-brand successor to the original item.');
    } else if (type === 'none') {
      notes.push('No in-brand replacement is available at this time; options shown are closest market equivalents.');
      if (ss && ss.explanation) notes.push(String(ss.explanation));
    } else if (type === 'same_brand_equivalent') {
      notes.push('Best Replacement Option is the current available same-brand equivalent to the original item.');
      if (ss && ss.explanation) notes.push(String(ss.explanation));
    }

    return (
      '<div class="lkq-table-footnotes">' +
        notes.map(function (n) { return '<p><em>- ' + _esc(n) + '</em></p>'; }).join('') +
      '</div>'
    );
  }

  function _buildTableLegend() {
    return (
      '<div class="lkq-table-legend" aria-label="LKQ dot color legend">' +
        '<span class="lkq-table-legend-title">Dot Legend</span>' +
        '<span class="lkq-table-legend-item"><span class="lkq-spec-dot lkq-spec-dot-green"></span><span>LKQ / equivalent</span></span>' +
        '<span class="lkq-table-legend-item"><span class="lkq-spec-dot lkq-spec-dot-gold"></span><span>Above LKQ / major upgrade</span></span>' +
        '<span class="lkq-table-legend-item"><span class="lkq-spec-dot lkq-spec-dot-orange"></span><span>Close Match</span></span>' +
        '<span class="lkq-table-legend-item"><span class="lkq-spec-dot lkq-spec-dot-red"></span><span>Below LKQ / not comparable</span></span>' +
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
    var bestMatchLabel = data.bestMatchLabel || 'Best Replacement Option';

    _instances[instanceId] = {
      originalItem: summary.name || '',
      originalPrice: summary.originalPriceDisplay || summary.priceRange || '',
      originalSpecs: originalSpecs,
      specLabels: specLabels,
      resultsEl: resultsEl,
      instanceId: instanceId,
    };

    var card = resultsEl.closest('.results-card');
    if (card) card.classList.add('lkq-results-full');

    resultsEl.innerHTML =
      '<div class="lkq-top-grid">' +
        _buildIdCard(summary) +
        _buildSuccessorRow(successorStatus) +
      '</div>' +
      '<div class="lkq-section-pad lkq-table-section">' +
        '<div class="lkq-section-hd">' +
          '<span class="lkq-step-num">3</span>' +
          '<span class="lkq-step-title">Replacement Options</span>' +
        '</div>' +
        _buildTable(summary, originalSpecs, specLabels, options, bestMatchLabel, instanceId) +
        _buildTableLegend() +
        _buildTableFootnotes(successorStatus) +
        (instanceId === 'serial-decoder'
          ? '<div class="lkq-bottom-actions"><button class="decode-again-btn btn-amber" type="button" onclick="decodeAnotherItem()">Decode Another Item</button></div>'
          : '') +
      '</div>';

    _bindYourPickInput(resultsEl, instanceId);
  }

  function _setYourPickCell(resultsEl, rowKey, html) {
    var td = resultsEl.querySelector('[data-yourpick-row="' + rowKey + '"]');
    if (!td) return;
    td.innerHTML = html;
  }

  function _renderYourPickFields(inst, data, recommendation) {
    if (!inst || !inst.resultsEl) return;
    var url = _retailerUrl(data.retailerName || '', data.retailerSearchQuery || recommendation || '');
    var ratingClass = _ratingClass(data.rating);

    _setYourPickCell(inst.resultsEl, 'name', _buildYourPickEditorCell(inst.instanceId) + '<div class="lkq-yourpick-loaded"><div class="lkq-td-name">' + _esc(data.name || recommendation) + '</div>' + (data.model ? '<div class="lkq-td-model">' + _esc(data.model) + '</div>' : '') + '</div>');
    _setYourPickCell(inst.resultsEl, 'rating', '<span class="lkq-rating-badge ' + ratingClass + '">' + _esc((data.rating || 'NOT LKQ').toUpperCase().trim()) + '</span>');
    _setYourPickCell(inst.resultsEl, 'brand', _buildDetailsText(data.brand || '—', 60));
    _setYourPickCell(inst.resultsEl, 'price', _dotValueHtml(data.priceRange || '—', _evaluatePriceOutcome(inst.originalPrice || '', data.priceRange || '—')));
    (inst.specLabels || []).forEach(function (label, idx) {
      var val = (data.specs && label && data.specs[label]) || '—';
      _setYourPickCell(inst.resultsEl, 'spec-' + idx, _dotValueHtml(val, _evaluateSpecOutcome(label, (inst.originalSpecs && inst.originalSpecs[label]) || '—', val)));
    });
    _setYourPickCell(inst.resultsEl, 'buy', url
      ? '<a class="lkq-buy-link" href="' + _esc(url) + '" target="_blank" rel="noopener noreferrer">' + _esc(data.retailerName || 'Buy') + ' &#8594;</a>'
      : _buildDetailsText(data.retailerName || '—', 80));
    _setYourPickCell(inst.resultsEl, 'notes', _buildDetailsText(data.notes || data.explanation || '—', 95));
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

    var inputEl = inst.resultsEl.querySelector('.lkq-compare-input');
    if (inputEl) inputEl.value = recommendation || '';

    _renderYourPickFields(inst, data, recommendation);
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
        callbacks.onSuccess(data);
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


