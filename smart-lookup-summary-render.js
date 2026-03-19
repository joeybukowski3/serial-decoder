(function () {
  'use strict';

  function _text(value) {
    if (value === null || value === undefined) return '';
    return String(value);
  }

  function _el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function _appendRow(card, label, value) {
    if (!value) return;
    var row = _el('div', 'sl-summary-row');
    var strong = document.createElement('strong');
    strong.textContent = label + ': ';
    row.appendChild(strong);
    row.appendChild(document.createTextNode(_text(value)));
    card.appendChild(row);
  }

  function _appendBadges(container, badges) {
    var list = Array.isArray(badges) ? badges.filter(Boolean).slice(0, 4) : [];
    var i;
    if (!list.length) return;
    for (i = 0; i < list.length; i += 1) {
      container.appendChild(_el('span', 'sl-badge', list[i]));
    }
  }

  function renderResultIdentityBar(normalizedResult) {
    var identity;
    var bar;
    var textWrap;
    var resultRow;
    var queryRow;
    var resultLabel;
    var queryLabel;
    var meta;

    if (!normalizedResult || !normalizedResult.identity) return null;
    identity = normalizedResult.identity;
    bar = _el('div', 'sl-result-identity-bar');
    textWrap = _el('div', 'sl-result-identity-text');

    resultRow = _el('div', 'sl-result-identity-line');
    resultLabel = _el('strong', null, 'Result: ');
    resultRow.appendChild(resultLabel);
    resultRow.appendChild(document.createTextNode(identity.title || 'Smart Lookup Result'));

    queryRow = _el('div', 'sl-result-identity-line');
    queryLabel = _el('strong', null, 'Search Query: ');
    queryRow.appendChild(queryLabel);
    queryRow.appendChild(document.createTextNode(normalizedResult.originalQuery ? '"' + normalizedResult.originalQuery + '"' : '—'));

    textWrap.appendChild(resultRow);
    textWrap.appendChild(queryRow);

    meta = _el('div');
    _appendBadges(meta, normalizedResult.badges);
    bar.appendChild(textWrap);
    bar.appendChild(meta);
    return bar;
  }

  function renderIdentifiedItemSummaryCard(normalizedResult) {
    var card;
    var identity;
    var ageSummary;

    if (!normalizedResult) return null;
    identity = normalizedResult.identity || {};
    ageSummary = normalizedResult.ageSummary || {};
    card = _el('div', 'sl-summary-card');
    card.appendChild(_el('h4', null, 'Identified Item'));
    _appendRow(card, 'Brand', identity.brand);
    _appendRow(card, 'Model', identity.model);
    _appendRow(card, 'Category', identity.category);
    _appendRow(card, 'Estimated year', ageSummary.estimatedYear);
    _appendRow(card, 'Production range', ageSummary.productionRange);
    return card;
  }

  function renderBestMatchSummaryCard(normalizedResult) {
    var card;
    var recommendation;
    var primary;
    var successorStatus;

    if (!normalizedResult) return null;
    recommendation = normalizedResult.recommendation || {};
    primary = recommendation.primary || null;
    successorStatus = recommendation.successorStatus || {};
    card = _el('div', 'sl-summary-card');
    card.appendChild(_el('h4', null, recommendation.bestMatchLabel || 'Best Replacement Option'));

    if (primary) {
      _appendRow(card, 'Item', primary.name || primary.model);
      _appendRow(card, 'Model', primary.model);
      _appendRow(card, 'Brand', primary.brand);
      _appendRow(card, 'LKQ Rating', primary.lkqRating);
      _appendRow(card, 'Price Range', primary.priceRange);
      _appendRow(card, 'Retailer', primary.retailerName);
      _appendRow(card, 'Reason', primary.notes || primary.explanation);
      return card;
    }

    _appendRow(card, 'Status', successorStatus.type || 'Unavailable');
    _appendRow(card, 'Reason', successorStatus.explanation || 'No qualifying replacement option is available yet.');
    return card;
  }

  function renderSummaryBand(normalizedResult) {
    var band;
    var itemCard;
    var bestMatchCard;

    if (!normalizedResult) return null;
    band = _el('div', 'sl-summary-band');
    itemCard = renderIdentifiedItemSummaryCard(normalizedResult);
    bestMatchCard = renderBestMatchSummaryCard(normalizedResult);
    if (itemCard) band.appendChild(itemCard);
    if (bestMatchCard) band.appendChild(bestMatchCard);
    return band;
  }

  function renderConfidenceCard(label, level, reason) {
    var card = _el('div', 'sl-confidence-card');
    _appendRow(card, label, level);
    if (reason) {
      var row = _el('div', 'sl-summary-row');
      row.textContent = reason;
      card.appendChild(row);
    }
    return card;
  }

  function renderConfidenceStrip(normalizedResult) {
    var strip;
    var confidence;
    var i;

    if (!normalizedResult) return null;
    confidence = Array.isArray(normalizedResult.confidence) ? normalizedResult.confidence : [];
    if (!confidence.length) return null;
    strip = _el('div', 'sl-confidence-strip');
    for (i = 0; i < confidence.length; i += 1) {
      strip.appendChild(renderConfidenceCard(confidence[i].label, confidence[i].level, confidence[i].reason));
    }
    return strip;
  }

  function renderRecommendedReplacementHero(normalizedResult) {
    var hero;
    var recommendation;
    var primary;
    var list;
    var items;
    var i;

    if (!normalizedResult || !normalizedResult.recommendation) return null;
    recommendation = normalizedResult.recommendation;
    primary = recommendation.primary;
    if (!primary) return null;

    hero = _el('div', 'sl-recommendation-hero');
    hero.appendChild(_el('h4', null, recommendation.bestMatchLabel || 'Best Replacement Option'));
    _appendRow(hero, 'Model', primary.model || primary.name);
    _appendRow(hero, 'Brand', primary.brand);
    _appendRow(hero, 'LKQ rating', primary.lkqRating);
    _appendRow(hero, 'Price range', primary.priceRange);

    items = [];
    if (primary.notes) items.push(primary.notes);
    if (primary.retailerName) items.push('Retailer: ' + primary.retailerName);
    if (primary.name && primary.model && primary.name !== primary.model) items.push(primary.name);

    if (items.length) {
      list = _el('ul', 'sl-bullet-list');
      for (i = 0; i < items.length; i += 1) {
        list.appendChild(_el('li', null, items[i]));
      }
      hero.appendChild(list);
    }

    return hero;
  }

  function renderSmartLookupTopSummaryLayer(normalizedResult) {
    var layer;
    var identityBar;
    var summaryBand;
    var confidenceStrip;

    if (!normalizedResult) return null;

    layer = _el('section', 'sl-top-summary-layer');
    identityBar = renderResultIdentityBar(normalizedResult);
    summaryBand = renderSummaryBand(normalizedResult);
    confidenceStrip = renderConfidenceStrip(normalizedResult);

    if (identityBar) layer.appendChild(identityBar);
    if (summaryBand) layer.appendChild(summaryBand);
    if (confidenceStrip) layer.appendChild(confidenceStrip);

    return layer.childNodes.length ? layer : null;
  }

  window.renderSmartLookupTopSummaryLayer = renderSmartLookupTopSummaryLayer;
  window.renderResultIdentityBar = renderResultIdentityBar;
  window.renderSummaryBand = renderSummaryBand;
  window.renderIdentifiedItemSummaryCard = renderIdentifiedItemSummaryCard;
  window.renderBestMatchSummaryCard = renderBestMatchSummaryCard;
  window.renderConfidenceStrip = renderConfidenceStrip;
  window.renderConfidenceCard = renderConfidenceCard;
  window.renderRecommendedReplacementHero = renderRecommendedReplacementHero;
}());
