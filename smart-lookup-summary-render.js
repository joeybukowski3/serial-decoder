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

  function _appendBadges(container, badges, className) {
    var list = Array.isArray(badges) ? badges.filter(Boolean).slice(0, 6) : [];
    var i;
    if (!list.length) return;
    for (i = 0; i < list.length; i += 1) {
      container.appendChild(_el('span', className || 'sl-badge', list[i]));
    }
  }

  function _appendBulletList(parent, items, className) {
    var list = Array.isArray(items) ? items.filter(Boolean) : [];
    var ul;
    var i;
    if (!list.length) return;
    ul = _el('ul', className || 'sl-bullet-list');
    for (i = 0; i < list.length; i += 1) {
      ul.appendChild(_el('li', null, list[i]));
    }
    parent.appendChild(ul);
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

    meta = _el('div', 'sl-badge-row');
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
    _appendRow(card, 'Availability', identity.availability);
    return card;
  }

  function renderBestMatchSummaryCard(normalizedResult) {
    var card;
    var recommendation;
    var primary;
    var verification;

    if (!normalizedResult) return null;
    recommendation = normalizedResult.recommendation || {};
    primary = recommendation.primary || null;
    verification = normalizedResult.verification || {};
    card = _el('div', 'sl-summary-card');
    card.appendChild(_el('h4', null, recommendation.bestMatchLabel || 'Best Replacement Option'));

    if (primary) {
      _appendRow(card, 'Item', primary.name || primary.model);
      _appendRow(card, 'Model', primary.model);
      _appendRow(card, 'Brand', primary.brand);
      _appendRow(card, 'LKQ rating', primary.lkqRating);
      _appendRow(card, 'Price range', primary.priceRange);
      _appendRow(card, 'Retailer', primary.retailerName);
      _appendRow(card, 'Verification', verification.badge);
      return card;
    }

    _appendRow(card, 'Status', verification.badge || 'Unavailable');
    _appendRow(card, 'Reason', verification.message || 'No qualifying replacement option is available yet.');
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
    var verification;
    var badgeRow;
    var verificationText;

    if (!normalizedResult || !normalizedResult.recommendation) return null;
    recommendation = normalizedResult.recommendation;
    primary = recommendation.primary;
    verification = normalizedResult.verification || {};
    if (!primary) return null;

    hero = _el('div', 'sl-recommendation-hero');
    hero.appendChild(_el('h4', null, recommendation.bestMatchLabel || 'Best Replacement Option'));
    badgeRow = _el('div', 'sl-badge-row');
    _appendBadges(badgeRow, [primary.lkqRating, verification.badge], 'sl-badge sl-badge-strong');
    hero.appendChild(badgeRow);
    _appendRow(hero, 'Model', primary.model || primary.name);
    _appendRow(hero, 'Brand', primary.brand);
    _appendRow(hero, 'Price range', primary.priceRange);
    verificationText = _el('p', 'sl-panel-copy', verification.message || '');
    if (verificationText.textContent) hero.appendChild(verificationText);
    _appendBulletList(hero, normalizedResult.differences || []);
    return hero;
  }

  function renderPanel(title, items, copy, className) {
    var card = _el('div', 'sl-summary-card ' + (className || ''));
    card.appendChild(_el('h4', null, title));
    if (copy) card.appendChild(_el('p', 'sl-panel-copy', copy));
    _appendBulletList(card, items || []);
    return card;
  }

  function renderWhyReplacementPanel(normalizedResult) {
    var data = normalizedResult && normalizedResult.whyReplacement;
    if (!data) return null;
    return renderPanel(data.title || 'Why this replacement?', data.bullets || [], data.summary || '', 'sl-panel-why');
  }

  function renderVerificationPanel(normalizedResult) {
    var verification = normalizedResult && normalizedResult.verification;
    var card;
    var badgeRow;
    if (!verification) return null;
    card = _el('div', 'sl-summary-card sl-panel-verify');
    card.appendChild(_el('h4', null, 'Verification status'));
    badgeRow = _el('div', 'sl-badge-row');
    _appendBadges(badgeRow, [verification.badge, verification.verified ? 'Current-market check' : 'Manual review recommended'], 'sl-badge');
    card.appendChild(badgeRow);
    card.appendChild(_el('p', 'sl-panel-copy', verification.message || ''));
    return card;
  }

  function renderMethodologyPanel(normalizedResult) {
    var methodology = normalizedResult && normalizedResult.methodology;
    var card;
    if (!methodology) return null;
    card = renderPanel(methodology.title || 'Source transparency', methodology.steps || [], 'How this result was built and what signals were used.', 'sl-panel-method');
    if (methodology.sources && methodology.sources.length) {
      card.appendChild(_el('div', 'sl-panel-subhead', 'Signals surfaced'));
      _appendBulletList(card, methodology.sources, 'sl-bullet-list sl-bullet-list-compact');
    }
    return card;
  }

  function renderDifferencesPanel(normalizedResult) {
    var differences = normalizedResult && normalizedResult.differences;
    if (!differences || !differences.length) return null;
    return renderPanel('Quick comparison summary', differences, 'Fast scan of the biggest differences between the searched item and the recommended replacement.', 'sl-panel-diff');
  }

  function renderActionRow() {
    var row = _el('div', 'sl-action-row');
    var reportBtn = _el('button', 'sl-inline-action', 'Report incorrect replacement');
    reportBtn.type = 'button';
    reportBtn.addEventListener('click', function () {
      if (typeof window.openFeedbackModal === 'function') window.openFeedbackModal('replacement_incorrect');
    });
    row.appendChild(reportBtn);
    return row;
  }

  function renderSmartLookupTopSummaryLayer(normalizedResult) {
    var layer;
    var identityBar;
    var summaryBand;
    var confidenceStrip;
    var hero;
    var panels;
    var whyPanel;
    var verificationPanel;
    var differencesPanel;
    var methodologyPanel;

    if (!normalizedResult) return null;

    layer = _el('section', 'sl-top-summary-layer');
    identityBar = renderResultIdentityBar(normalizedResult);
    summaryBand = renderSummaryBand(normalizedResult);
    confidenceStrip = renderConfidenceStrip(normalizedResult);
    hero = renderRecommendedReplacementHero(normalizedResult);

    panels = _el('div', 'sl-panel-grid');
    whyPanel = renderWhyReplacementPanel(normalizedResult);
    verificationPanel = renderVerificationPanel(normalizedResult);
    differencesPanel = renderDifferencesPanel(normalizedResult);
    methodologyPanel = renderMethodologyPanel(normalizedResult);

    if (identityBar) layer.appendChild(identityBar);
    if (summaryBand) layer.appendChild(summaryBand);
    if (confidenceStrip) layer.appendChild(confidenceStrip);
    if (hero) layer.appendChild(hero);
    if (whyPanel) panels.appendChild(whyPanel);
    if (verificationPanel) panels.appendChild(verificationPanel);
    if (differencesPanel) panels.appendChild(differencesPanel);
    if (methodologyPanel) panels.appendChild(methodologyPanel);
    if (panels.childNodes.length) layer.appendChild(panels);
    layer.appendChild(renderActionRow());

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
