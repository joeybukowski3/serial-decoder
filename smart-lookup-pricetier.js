// smart-lookup-pricetier.js
// Called after Smart Lookup identifies an item.
// Fetches pricebook tier match and renders it into the results panel.

(function () {
  'use strict';

  function _el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls)  node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function _fmt(price) {
    if (!price && price !== 0) return '—';
    return '$' + Number(price).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  // ── Tier badge color map ──────────────────────────────────────────────────
  var TIER_COLORS = {
    'Value':         { bg: '#f5f5f5', text: '#757575', border: '#bdbdbd' },
    'Standard':      { bg: '#e3f2fd', text: '#1565c0', border: '#90caf9' },
    'Premium':       { bg: '#e8f5e9', text: '#2e7d32', border: '#a5d6a7' },
    'Upper Premium': { bg: '#f3e5f5', text: '#7b1fa2', border: '#ce93d8' },
    'Luxury':        { bg: '#fff8e1', text: '#f57f17', border: '#ffe082' },
  };

  function renderPriceTierCard(data) {
    var tier     = data.tier;
    var colors   = TIER_COLORS[tier.brand_tier] || TIER_COLORS['Standard'];
    var card     = _el('div', 'sl-summary-card sl-pricetier-card');

    // Header
    var header = _el('div', 'sl-pricetier-header');
    var badge  = _el('span', 'sl-pricetier-badge', tier.brand_tier + ' Tier');
    badge.style.cssText = 'background:' + colors.bg + ';color:' + colors.text + ';border:1px solid ' + colors.border + ';padding:3px 10px;border-radius:12px;font-weight:bold;font-size:12px';
    var title  = _el('h4', null, '📊 Replacement Pricing Tier');
    title.style.marginBottom = '6px';
    header.appendChild(title);
    header.appendChild(badge);
    card.appendChild(header);

    // Explanation
    if (data.explanation) {
      var exp = _el('p', 'sl-pricetier-explanation', data.explanation);
      exp.style.cssText = 'font-size:13px;color:#555;margin:8px 0 12px';
      card.appendChild(exp);
    }

    // Price range row
    var priceRow = _el('div', 'sl-pricetier-prices');
    priceRow.style.cssText = 'display:flex;gap:16px;margin-bottom:12px;flex-wrap:wrap';

    var priceItems = [
      { label: 'Market Price', value: _fmt(tier.market_price), highlight: true },
      { label: 'Price Low',    value: _fmt(tier.price_low) },
      { label: 'Price High',   value: _fmt(tier.price_high) },
    ];
    priceItems.forEach(function(p) {
      var box = _el('div', 'sl-pricetier-price-box');
      box.style.cssText = 'text-align:center;padding:8px 16px;border-radius:8px;background:' +
        (p.highlight ? colors.bg : '#f9f9f9') + ';border:1px solid ' + (p.highlight ? colors.border : '#e0e0e0');
      var val = _el('div', null, p.value);
      val.style.cssText = 'font-size:18px;font-weight:bold;color:' + (p.highlight ? colors.text : '#333');
      var lbl = _el('div', null, p.label);
      lbl.style.cssText = 'font-size:11px;color:#888;margin-top:2px';
      box.appendChild(val);
      box.appendChild(lbl);
      priceRow.appendChild(box);
    });
    card.appendChild(priceRow);

    // Key features
    if (tier.features) {
      var featRow = _el('div', 'sl-summary-row');
      var featLabel = _el('strong', null, 'Typical Features: ');
      featRow.appendChild(featLabel);
      featRow.appendChild(document.createTextNode(tier.features));
      featRow.style.cssText = 'font-size:13px;margin-bottom:10px';
      card.appendChild(featRow);
    }

    // BB Reference price
    if (tier.bb_sku && tier.bb_price) {
      var bbSection = _el('div', 'sl-pricetier-bb');
      bbSection.style.cssText = 'background:#e8f5e9;border:1px solid #a5d6a7;border-radius:8px;padding:10px 14px;margin-top:8px';

      var bbTitle = _el('div', null, '🛒 Best Buy Reference');
      bbTitle.style.cssText = 'font-size:11px;font-weight:bold;color:#2e7d32;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px';
      bbSection.appendChild(bbTitle);

      var bbName = _el('div', null, tier.bb_description || '');
      bbName.style.cssText = 'font-size:13px;color:#333;margin-bottom:4px';
      bbSection.appendChild(bbName);

      var bbBottom = _el('div');
      bbBottom.style.cssText = 'display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px';

      var bbPrice = _el('span', null, _fmt(tier.bb_price));
      bbPrice.style.cssText = 'font-size:16px;font-weight:bold;color:#2e7d32';
      bbBottom.appendChild(bbPrice);

      if (tier.bb_link) {
        var bbLink = _el('a', null, 'View on Best Buy →');
        bbLink.href = tier.bb_link;
        bbLink.target = '_blank';
        bbLink.rel = 'noopener noreferrer';
        bbLink.style.cssText = 'font-size:12px;color:#1565c0;text-decoration:underline';
        bbBottom.appendChild(bbLink);
      }

      bbSection.appendChild(bbBottom);
      card.appendChild(bbSection);
    } else {
      var noBB = _el('p', null, 'No Best Buy reference available for this tier.');
      noBB.style.cssText = 'font-size:12px;color:#999;margin-top:8px';
      card.appendChild(noBB);
    }

    return card;
  }

  // ── Main export: call after Smart Lookup resolves ─────────────────────────
  window.fetchAndRenderPriceTier = function (itemData, containerEl) {
    if (!itemData || !containerEl) return;

    var brand    = itemData.brand || '';
    var category = itemData.category || itemData.itemCategory || '';
    var size     = itemData.size || itemData.screenSize || '';
    var style    = itemData.style || '';
    var finish   = itemData.finish || '';
    var features = itemData.features || itemData.keyFeatures || '';

    if (!brand && !category) return;

    // Loading indicator
    var loader = _el('div', 'sl-pricetier-loading', 'Finding replacement tier...');
    loader.style.cssText = 'font-size:13px;color:#888;padding:8px 0';
    containerEl.appendChild(loader);

    fetch('/api/pricebook-tier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brand: brand, category: category, size: size, style: style, finish: finish, features: features }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        containerEl.removeChild(loader);
        if (data.matched && data.tier) {
          containerEl.appendChild(renderPriceTierCard(data));
        }
        // If not matched, silently omit — don't show error to user
      })
      .catch(function () {
        try { containerEl.removeChild(loader); } catch (_) {}
      });
  };
})();
