/* === smart-lookup-extras.js === */
(function () {
  'use strict';

  var RECENTS_KEY = 'itemAssist.smartRecent.v1';

  function inputEl() {
    return document.getElementById('smart-lookup-input');
  }

  function readRecent() {
    try {
      return JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]');
    } catch (_) {
      return [];
    }
  }

  function writeRecent(items) {
    try { localStorage.setItem(RECENTS_KEY, JSON.stringify(items || [])); } catch (_) {}
  }

  function pushRecent(query) {
    var value = String(query || '').trim();
    var items;
    if (!value) return;
    items = readRecent().filter(function (item) { return item !== value; });
    items.unshift(value);
    writeRecent(items.slice(0, 6));
    renderRecentSmartLookups();
  }

  function renderRecentSmartLookups() {
    var list = document.getElementById('smartRecentList');
    var panel = document.getElementById('smartRecentPanel');
    var items = readRecent();
    if (!list || !panel) return;
    list.innerHTML = items.length ? items.map(function (item) {
      return '<button type="button" class="smart-recent-chip" data-recent-query="' + item.replace(/"/g, '&quot;') + '">' + item + '</button>';
    }).join('') : '<div class="smart-recent-empty">Your recent Smart Lookup searches will appear here.</div>';
    Array.prototype.forEach.call(list.querySelectorAll('[data-recent-query]'), function (btn) {
      btn.addEventListener('click', function () {
        var query = btn.getAttribute('data-recent-query') || '';
        var input = inputEl();
        if (input) input.value = query;
        if (window.ItemAssistAnalytics) window.ItemAssistAnalytics.track('recent_lookup_reused', { context: 'smart-lookup', query: query });
        if (typeof window.runLKQLookup === 'function') window.runLKQLookup();
      });
    });
    panel.classList.remove('hidden');
  }

  window.applySmartLookupExample = function (query) {
    var input = inputEl();
    if (input) input.value = query;
    if (window.ItemAssistAnalytics) window.ItemAssistAnalytics.track('example_click', { context: 'smart-lookup', query: query });
    if (typeof window.runLKQLookup === 'function') window.runLKQLookup();
  };

  window.clearRecentSmartLookups = function () {
    writeRecent([]);
    renderRecentSmartLookups();
  };

  window.recordRecentSmartLookup = pushRecent;
  window.renderRecentSmartLookups = renderRecentSmartLookups;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderRecentSmartLookups);
  } else {
    renderRecentSmartLookups();
  }
}());


/* === smart-lookup-normalizer.js === */
(function () {
  'use strict';

  function _text(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/\s+/g, ' ').trim();
  }

  function _lower(value) {
    return _text(value).toLowerCase();
  }

  function _firstNonEmpty() {
    var i;
    var value;
    for (i = 0; i < arguments.length; i += 1) {
      value = _text(arguments[i]);
      if (value) return value;
    }
    return '';
  }

  function _toArray(value) {
    return Array.isArray(value) ? value.filter(Boolean) : [];
  }

  function _toConfidenceLevel(score) {
    if (score >= 0.75) return 'High';
    if (score >= 0.45) return 'Medium';
    return 'Low';
  }

  function _buildIdentity(interpret, age, lkq) {
    var summary = (lkq && lkq.itemSummary) || {};
    return {
      title: _firstNonEmpty(summary.name, age && age.model, interpret && interpret.model, interpret && interpret.itemName, 'Smart Lookup Result'),
      brand: _firstNonEmpty(summary.brand, age && age.brand, interpret && interpret.brand),
      model: _firstNonEmpty(summary.modelNumber, summary.model, age && age.model, interpret && interpret.model),
      category: _firstNonEmpty(summary.category, age && age.itemCategory, interpret && interpret.category, interpret && interpret.itemCategory),
      availability: _firstNonEmpty(summary.availability),
      searchType: _firstNonEmpty(interpret && interpret.queryKind, age && age.specificityLevel)
    };
  }

  function _deriveEstimatedYearFromRange(productionRange) {
    var text = _text(productionRange);
    var match;
    var start;
    var end;
    if (!text) return '';
    match = text.match(/((19|20)\d{2})\s*[-–]\s*((19|20)\d{2})/);
    if (!match) return '';
    start = parseInt(match[1], 10);
    end = parseInt(match[3], 10);
    if (!isFinite(start) || !isFinite(end) || end < start) return '';
    return String(Math.ceil((start + end) / 2));
  }

  function _rangeSpanYears(productionRange) {
    var text = _text(productionRange);
    var match;
    var start;
    var end;
    if (!text) return 0;
    match = text.match(/((19|20)\d{2})\s*[-–]\s*((19|20)\d{2})/);
    if (!match) return 0;
    start = parseInt(match[1], 10);
    end = parseInt(match[3], 10);
    if (!isFinite(start) || !isFinite(end) || end < start) return 0;
    return end - start;
  }

  function _buildAgeSummary(age, lkq) {
    var summary = (lkq && lkq.itemSummary) || {};
    var rawEstimatedYear = _firstNonEmpty(age && age.estimatedYear, summary.estimatedYear);
    var productionRange = _firstNonEmpty(age && age.yearRange, summary.estimatedAgeRange);
    var derivedEstimatedYear = _deriveEstimatedYearFromRange(productionRange);
    var specificity = _firstNonEmpty(age && age.specificityLevel);
    var notes = _toArray([
      age && age.notes,
      age && age.inventionSummary,
      age && age.refinementSuggestion
    ]);
    var hasRangeEstimate = !!derivedEstimatedYear && _rangeSpanYears(productionRange) >= 1;
    var estimatedYear = hasRangeEstimate ? derivedEstimatedYear : rawEstimatedYear;

    return {
      estimatedYear: estimatedYear,
      productionRange: productionRange,
      specificity: specificity,
      notes: notes,
      hasRangeEstimate: hasRangeEstimate
    };
  }

  function _buildRecommendation(lkq, candidate) {
    var options = _toArray(lkq && lkq.replacementOptions);
    var primary = candidate || options[0] || null;
    var successorStatus = (lkq && lkq.successorStatus) || {};

    return {
      primary: primary,
      options: options,
      successorStatus: successorStatus,
      bestMatchLabel: _firstNonEmpty(lkq && lkq.bestMatchLabel, 'Best Replacement Option')
    };
  }

  function _buildClaimDecision(identity, ageSummary, recommendation) {
    var primary = recommendation && recommendation.primary;
    var successorStatus = (recommendation && recommendation.successorStatus) || {};
    var rating = _firstNonEmpty(primary && primary.lkqRating, 'Unavailable');
    var statusLabel = 'Replacement review needed';
    var rationale = '';

    if (successorStatus.type === 'direct_successor') {
      statusLabel = 'Direct successor identified';
      rationale = _firstNonEmpty(successorStatus.explanation, 'A direct in-brand successor was found for the searched item.');
    } else if (successorStatus.type === 'same_brand_equivalent') {
      statusLabel = 'Same-brand equivalent identified';
      rationale = _firstNonEmpty(successorStatus.explanation, 'A same-brand equivalent replacement was identified.');
    } else if (primary && _lower(primary.lkqRating) === 'match') {
      statusLabel = 'LKQ match identified';
      rationale = _firstNonEmpty(primary.notes, 'The lead recommendation is marked as an LKQ match.');
    } else if (primary && _lower(primary.lkqRating) === 'close match') {
      statusLabel = 'Close replacement identified';
      rationale = _firstNonEmpty(primary.notes, 'The lead recommendation is a close replacement rather than a direct LKQ match.');
    } else if (primary && _lower(primary.lkqRating) === 'above lkq') {
      statusLabel = 'Upgrade replacement identified';
      rationale = _firstNonEmpty(primary.notes, 'The lead recommendation is an above-LKQ upgrade option.');
    } else if (primary) {
      statusLabel = 'Replacement identified';
      rationale = _firstNonEmpty(primary.notes, 'A replacement option was identified, but it should be reviewed before claim use.');
    } else {
      rationale = 'No primary recommendation is available yet.';
    }

    return {
      label: statusLabel,
      rating: rating,
      rationale: rationale,
      estimatedYear: ageSummary.estimatedYear,
      productionRange: ageSummary.productionRange,
      itemTitle: identity.title
    };
  }

  function _buildConfidence(identity, ageSummary, recommendation, interpret) {
    var primary = recommendation && recommendation.primary;
    var identificationScore = identity.model ? 0.9 : (identity.brand ? 0.65 : 0.35);
    var ageScore = ageSummary.hasRangeEstimate
      ? 0.6
      : (ageSummary.estimatedYear ? 0.85 : (ageSummary.productionRange ? 0.6 : 0.3));
    var replacementScore = primary
      ? (_lower(primary.lkqRating) === 'match' ? 0.9 : (_lower(primary.lkqRating) === 'close match' ? 0.7 : 0.55))
      : 0.25;

    return [
      {
        label: 'Identification',
        level: _toConfidenceLevel(identificationScore),
        reason: _firstNonEmpty(
          identity.model ? 'Model and item identity were resolved.' : '',
          identity.brand ? 'Brand-level identity was resolved.' : '',
          interpret && interpret.queryKind ? 'Search type: ' + interpret.queryKind + '.' : '',
          'Limited identity signals were available.'
        )
      },
      {
        label: 'Age Estimate',
        level: _toConfidenceLevel(ageScore),
        reason: _firstNonEmpty(
          ageSummary.hasRangeEstimate ? 'Estimated year: ' + ageSummary.estimatedYear + ' (midpoint of production range).' : '',
          (!ageSummary.hasRangeEstimate && ageSummary.estimatedYear) ? 'Estimated year: ' + ageSummary.estimatedYear + '.' : '',
          ageSummary.productionRange ? 'Production range: ' + ageSummary.productionRange + '.' : '',
          ageSummary.specificity ? 'Specificity: ' + ageSummary.specificity + '.' : '',
          'Age estimate remains broad.'
        )
      },
      {
        label: 'Replacement',
        level: _toConfidenceLevel(replacementScore),
        reason: _firstNonEmpty(
          primary && primary.lkqRating ? 'Lead replacement rating: ' + primary.lkqRating + '.' : '',
          primary && primary.notes ? primary.notes : '',
          'No lead replacement recommendation is available.'
        )
      }
    ];
  }

  function _buildBadges(identity, ageSummary, recommendation) {
    var primary = recommendation && recommendation.primary;
    var successorStatus = recommendation && recommendation.successorStatus;
    var badges = [identity.brand, identity.category, ageSummary.specificity, primary && primary.lkqRating];
    if (successorStatus && successorStatus.type === 'direct_successor') badges.push('Current successor verified');
    else if (successorStatus && successorStatus.type === 'same_brand_equivalent') badges.push('Same-brand verified');
    return _toArray(badges);
  }

  function _buildVerification(recommendation) {
    var primary = recommendation && recommendation.primary;
    var successorStatus = recommendation && recommendation.successorStatus || {};
    var verified = successorStatus.type === 'direct_successor' || successorStatus.type === 'same_brand_equivalent';
    var badge = verified ? 'Verified' : (primary ? 'Reviewed' : 'Needs review');
    var message = 'No current same-brand successor was verified.';

    if (successorStatus.type === 'direct_successor') {
      message = _firstNonEmpty(successorStatus.explanation, 'Current same-brand successor verified.');
    } else if (successorStatus.type === 'same_brand_equivalent') {
      message = _firstNonEmpty(successorStatus.explanation, 'Current same-brand equivalent verified.');
    } else if (primary && primary.notes) {
      message = primary.notes;
    }

    return {
      badge: badge,
      verified: verified,
      message: message
    };
  }

  function _buildWhyReplacement(identity, recommendation, ageSummary) {
    var primary = recommendation && recommendation.primary;
    var successorStatus = recommendation && recommendation.successorStatus || {};
    var bullets = [];

    if (successorStatus.explanation) bullets.push(successorStatus.explanation);
    if (primary && primary.lkqRating) bullets.push('Lead option is rated ' + primary.lkqRating + ' against the original item profile.');
    if (primary && primary.notes) bullets.push(primary.notes);
    if (identity.category) bullets.push('Comparison is anchored to the same product class: ' + identity.category + '.');
    if (ageSummary.productionRange) bullets.push('Original item timing was estimated using the ' + ageSummary.productionRange + ' production window.');

    return {
      title: 'Why this replacement?',
      summary: _firstNonEmpty(bullets[0], 'This recommendation balances product identity, age estimate, and market availability.'),
      bullets: bullets.slice(0, 4)
    };
  }

  function _buildDifferences(identity, recommendation) {
    var primary = recommendation && recommendation.primary;
    if (!primary) return [];
    return _toArray([
      identity.brand && primary.brand ? 'Brand: ' + identity.brand + ' → ' + primary.brand : '',
      identity.model && primary.model ? 'Model: ' + identity.model + ' → ' + primary.model : '',
      primary.priceRange ? 'Price range: ' + primary.priceRange : '',
      primary.retailerName ? 'Available from ' + primary.retailerName : ''
    ]).slice(0, 4);
  }

  function _buildMethodology(age, lkq, recommendation) {
    var primary = recommendation && recommendation.primary;
    var steps = _toArray([
      'We interpret the search to identify brand, category, and likely model context.',
      'We estimate age using model timelines, release windows, and product-family clues.',
      'We compare current-market replacements against the original item profile and LKQ rating logic.',
      primary && primary.retailerName ? 'Retail availability is surfaced from current-market retailer context such as ' + primary.retailerName + '.' : ''
    ]);
    var sources = _toArray([
      age && age.serialRule ? 'Serial/date rule: ' + age.serialRule : '',
      age && age.serialLocation ? 'Label guidance: ' + age.serialLocation : '',
      lkq && lkq.itemSummary && lkq.itemSummary.availability ? 'Availability note: ' + lkq.itemSummary.availability : ''
    ]);
    return {
      title: 'Source transparency',
      steps: steps,
      sources: sources
    };
  }

  function normalizeSmartLookupResult(input) {
    var payload = input || {};
    var interpret = payload.interpret || {};
    var age = payload.age || {};
    var lkq = payload.lkq || {};
    var identity = _buildIdentity(interpret, age, lkq);
    var ageSummary = _buildAgeSummary(age, lkq);
    var recommendation = _buildRecommendation(lkq, payload.candidate || null);

    return {
      originalQuery: _text(payload.originalQuery),
      normalizedQuery: _firstNonEmpty(_text(payload.normalizedQuery), _lower(payload.originalQuery)),
      interpret: interpret,
      age: age,
      lkq: lkq,
      candidate: payload.candidate || null,
      identity: identity,
      ageSummary: ageSummary,
      recommendation: recommendation,
      claimDecision: _buildClaimDecision(identity, ageSummary, recommendation),
      confidence: _buildConfidence(identity, ageSummary, recommendation, interpret),
      badges: _buildBadges(identity, ageSummary, recommendation),
      verification: _buildVerification(recommendation),
      whyReplacement: _buildWhyReplacement(identity, recommendation, ageSummary),
      differences: _buildDifferences(identity, recommendation),
      methodology: _buildMethodology(age, lkq, recommendation)
    };
  }

  window.normalizeSmartLookupResult = normalizeSmartLookupResult;
}());


/* === smart-lookup-summary-render.js === */
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

  function _wrapInDetails(summaryLabel, panel) {
    var details = document.createElement('details');
    var summary = document.createElement('summary');
    summary.textContent = summaryLabel;
    summary.style.fontSize = '0.75rem';
    summary.style.fontWeight = '700';
    summary.style.color = '#6b7280';
    summary.style.cursor = 'pointer';
    details.appendChild(summary);
    details.appendChild(panel);
    return details;
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
    var confidenceStrip;
    var hero;
    var heroRow;
    var whyPanel;
    var verificationPanel;
    var methodologyPanel;
    var whyTitle;
    var methodTitle;

    if (!normalizedResult) return null;

    layer = _el('section', 'sl-top-summary-layer');
    identityBar = renderResultIdentityBar(normalizedResult);
    confidenceStrip = renderConfidenceStrip(normalizedResult);
    hero = renderRecommendedReplacementHero(normalizedResult);

    whyPanel = renderWhyReplacementPanel(normalizedResult);
    verificationPanel = renderVerificationPanel(normalizedResult);
    methodologyPanel = renderMethodologyPanel(normalizedResult);

    if (identityBar) layer.appendChild(identityBar);
    if (confidenceStrip) layer.appendChild(confidenceStrip);
    if (hero) {
      heroRow = _el('div', 'sl-hero-tier-row');
      hero.style.flex = '1';
      hero.style.minWidth = '0';
      heroRow.appendChild(hero);
      layer.appendChild(heroRow);
    }
    layer.appendChild(renderActionRow());

    if (whyPanel) {
      whyTitle = (normalizedResult.whyReplacement && normalizedResult.whyReplacement.title) || 'Why this replacement?';
      layer.appendChild(_wrapInDetails(whyTitle, whyPanel));
    }
    if (verificationPanel) {
      layer.appendChild(_wrapInDetails('Verification status', verificationPanel));
    }
    if (methodologyPanel) {
      methodTitle = (normalizedResult.methodology && normalizedResult.methodology.title) || 'Source transparency';
      layer.appendChild(_wrapInDetails(methodTitle, methodologyPanel));
    }

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


/* === smart-lookup-upgrade-patch.js === */
(function () {
  'use strict';

  var RECENT_LOOKUPS_KEY = 'itemAssistRecentSmartLookups';
  var MAX_RECENT_LOOKUPS = 6;
  window.itemAssistDataLayer = window.itemAssistDataLayer || [];

  function hasSmartLookupUi() {
    return !!document.getElementById('smart-lookup-input');
  }

  function safeJsonParse(raw, fallback) {
    try { return JSON.parse(raw); } catch (_) { return fallback; }
  }

  function getRecentSmartLookups() {
    try {
      var parsed = safeJsonParse(localStorage.getItem(RECENT_LOOKUPS_KEY) || '[]', []);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function setRecentSmartLookups(items) {
    try {
      localStorage.setItem(RECENT_LOOKUPS_KEY, JSON.stringify(items || []));
    } catch (_) {}
  }

  function trackSmartLookupEvent(name, payload) {
    var event = {
      event: name,
      ts: new Date().toISOString(),
      page: (window.location && window.location.pathname) || '',
      payload: payload || {}
    };
    window.itemAssistDataLayer.push(event);
    try { console.info('[Item Assist analytics]', event); } catch (_) {}
  }
  window.trackSmartLookupEvent = trackSmartLookupEvent;

  function renderRecentSmartLookups() {
    var list = document.getElementById('smartRecentList');
    var items;
    if (!list) return;
    items = getRecentSmartLookups();
    if (!items.length) {
      list.innerHTML = '<div class="smart-recent-empty">Your recent searches stay on this device only.</div>';
      return;
    }
    list.innerHTML = items.map(function (item) {
      return '<button type="button" class="smart-recent-chip" data-recent-query="' + escapeSmartLookupHtml(item.query) + '">' + escapeSmartLookupHtml(item.query) + '</button>';
    }).join('');
    Array.prototype.forEach.call(list.querySelectorAll('[data-recent-query]'), function (btn) {
      btn.addEventListener('click', function () {
        var query = btn.getAttribute('data-recent-query') || '';
        var input = getSmartLookupInputEl();
        if (!query || !input) return;
        input.value = query;
        trackSmartLookupEvent('recent_lookup_clicked', { query: query });
        runLKQLookup();
      });
    });
  }

  function saveRecentSmartLookup(query) {
    var normalized = normalizeSmartLookupQuery(query);
    var items;
    if (!normalized) return;
    items = getRecentSmartLookups().filter(function (item) { return item && item.query !== normalized; });
    items.unshift({ query: normalized, at: Date.now() });
    setRecentSmartLookups(items.slice(0, MAX_RECENT_LOOKUPS));
    renderRecentSmartLookups();
  }

  window.clearRecentSmartLookups = function clearRecentSmartLookups() {
    setRecentSmartLookups([]);
    renderRecentSmartLookups();
    trackSmartLookupEvent('recent_lookups_cleared');
  };

  window.applySmartLookupExample = function applySmartLookupExample(query) {
    var input = getSmartLookupInputEl();
    if (!input) return;
    input.value = query || '';
    trackSmartLookupEvent('example_lookup_selected', { query: query || '' });
    runLKQLookup();
  };

  function setSmartLookupLoadingStep(stepKey) {
    var order = ['interpret', 'identify', 'compare', 'verify'];
    var stepIndex = order.indexOf(stepKey);
    Array.prototype.forEach.call(document.querySelectorAll('.smart-loading-step'), function (node, idx) {
      node.classList.toggle('is-active', idx === stepIndex);
      node.classList.toggle('is-complete', idx < stepIndex);
    });
  }
  window.setSmartLookupLoadingStep = setSmartLookupLoadingStep;

  function patchLoadingState() {
    var originalSetLoadingActive = window.setLoadingActive;
    var originalSetLoadingSuccess = window.setLoadingSuccess;
    if (typeof originalSetLoadingActive === 'function' && !originalSetLoadingActive.__itemAssistPatched) {
      window.setLoadingActive = function () {
        originalSetLoadingActive.apply(this, arguments);
        setSmartLookupLoadingStep('interpret');
      };
      window.setLoadingActive.__itemAssistPatched = true;
    }
    if (typeof originalSetLoadingSuccess === 'function' && !originalSetLoadingSuccess.__itemAssistPatched) {
      window.setLoadingSuccess = function (callback) {
        setSmartLookupLoadingStep('verify');
        return originalSetLoadingSuccess.call(this, callback);
      };
      window.setLoadingSuccess.__itemAssistPatched = true;
    }
  }

  function patchRunSmartLookup() {
    var original = window.runLKQLookup;
    if (typeof original !== 'function' || original.__itemAssistPatched) return;
    window.runLKQLookup = async function () {
      var input = getSmartLookupInputEl();
      var query = normalizeSmartLookupQuery(input && input.value || '');
      if (!query) {
        trackSmartLookupEvent('search_blocked_empty');
        return original.apply(this, arguments);
      }
      saveRecentSmartLookup(query);
      trackSmartLookupEvent('search_started', {
        query: query,
        includeComparisons: shouldIncludeSmartLookupComparisons()
      });
      return original.apply(this, arguments);
    };
    window.runLKQLookup.__itemAssistPatched = true;
  }

  function patchLookupPipelines() {
    var originalExecute = window.executeSmartLookup;
    var originalGeneral = window.runGeneralSmartLookup;
    var originalAgeOnly = window.runAgeOnlyLookup;
    var originalUnrecognized = window.showUnrecognizedSmartLookupResults;
    if (typeof originalExecute === 'function' && !originalExecute.__itemAssistPatched) {
      window.executeSmartLookup = function (query, opts) {
        setSmartLookupLoadingStep('compare');
        trackSmartLookupEvent('specific_lookup_path', { query: query, preserveGeneral: !!(opts && opts.preserveGeneral) });
        return originalExecute.call(this, query, opts);
      };
      window.executeSmartLookup.__itemAssistPatched = true;
    }
    if (typeof originalGeneral === 'function' && !originalGeneral.__itemAssistPatched) {
      window.runGeneralSmartLookup = function (query) {
        setSmartLookupLoadingStep('identify');
        trackSmartLookupEvent('general_lookup_path', { query: query });
        return originalGeneral.call(this, query);
      };
      window.runGeneralSmartLookup.__itemAssistPatched = true;
    }
    if (typeof originalAgeOnly === 'function' && !originalAgeOnly.__itemAssistPatched) {
      window.runAgeOnlyLookup = function (query, opts) {
        setSmartLookupLoadingStep('identify');
        trackSmartLookupEvent('age_only_lookup_path', { query: query });
        return originalAgeOnly.call(this, query, opts);
      };
      window.runAgeOnlyLookup.__itemAssistPatched = true;
    }
    if (typeof originalUnrecognized === 'function' && !originalUnrecognized.__itemAssistPatched) {
      window.showUnrecognizedSmartLookupResults = function (query, interpreted) {
        trackSmartLookupEvent('lookup_needs_refinement', { query: query, suggestions: interpreted && interpreted.suggestions ? interpreted.suggestions.length : 0 });
        return originalUnrecognized.call(this, query, interpreted);
      };
      window.showUnrecognizedSmartLookupResults.__itemAssistPatched = true;
    }
  }

  function patchInterpretationRequest() {
    var original = window.fetchSmartLookupInterpretation;
    if (typeof original !== 'function' || original.__itemAssistPatched) return;
    window.fetchSmartLookupInterpretation = async function (query) {
      setSmartLookupLoadingStep('interpret');
      try {
        var result = await original.call(this, query);
        trackSmartLookupEvent('interpretation_completed', {
          query: query,
          queryKind: result && result.queryKind || '',
          action: result && result.action || ''
        });
        return result;
      } catch (error) {
        trackSmartLookupEvent('interpretation_failed', { query: query, message: error && error.message || 'unknown' });
        throw error;
      }
    };
    window.fetchSmartLookupInterpretation.__itemAssistPatched = true;
  }

  function patchAgeResults() {
    var original = window.showAgeLookupResults;
    if (typeof original !== 'function' || original.__itemAssistPatched) return;
    window.showAgeLookupResults = function (displayQuery, data) {
      original.call(this, displayQuery, data);
      trackSmartLookupEvent('age_results_rendered', { query: displayQuery, specificity: data && data.specificityLevel || '' });
    };
    window.showAgeLookupResults.__itemAssistPatched = true;
  }

  function initSmartLookupUpgradeEnhancements() {
    if (!hasSmartLookupUi()) return;
    renderRecentSmartLookups();
    patchLoadingState();
    patchRunSmartLookup();
    patchLookupPipelines();
    patchInterpretationRequest();
    patchAgeResults();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSmartLookupUpgradeEnhancements);
  } else {
    initSmartLookupUpgradeEnhancements();
  }

  window.initSmartLookupUpgradeEnhancements = initSmartLookupUpgradeEnhancements;
}());


/* === smart-lookup-pricetier.js === */
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
  window.fetchAndRenderPriceTier = function (itemData, containerEl, opts) {
    if (!itemData || !containerEl) return Promise.resolve(false);

    var brand    = itemData.brand || '';
    var category = itemData.category || itemData.itemCategory || '';
    var size     = itemData.size || itemData.screenSize || '';
    var style    = itemData.style || '';
    var finish   = itemData.finish || '';
    var features = itemData.features || itemData.keyFeatures || '';

    if (!brand && !category) return Promise.resolve(false);

    // Inject alongside the hero card when the flex row is present
    var progressiveSlot = opts && opts.progressiveSlot;
    var heroRow = containerEl.querySelector && containerEl.querySelector('.sl-hero-tier-row');
    var target  = progressiveSlot || heroRow || containerEl;

    // Loading indicator
    var loader = null;
    if (!progressiveSlot) {
      loader = _el('div', 'sl-pricetier-loading', 'Finding replacement tier...');
      loader.style.cssText = 'font-size:13px;color:#888;padding:8px 0;flex:1;min-width:0';
      target.appendChild(loader);
    }

    return fetch('/api/pricebook-tier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brand: brand, category: category, size: size, style: style, finish: finish, features: features }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (loader && target.contains(loader)) target.removeChild(loader);
        if (data.matched && data.tier) {
          var card = renderPriceTierCard(data);
          card.style.flex = '1';
          card.style.minWidth = '0';
          if (progressiveSlot) {
            progressiveSlot.classList.remove('is-hidden', 'is-ready', 'is-loading');
            progressiveSlot.innerHTML = '';
            progressiveSlot.appendChild(card);
            requestAnimationFrame(function () {
              progressiveSlot.classList.add('is-ready');
            });
          } else {
            target.appendChild(card);
          }
          return true;
        }
        if (progressiveSlot) {
          progressiveSlot.innerHTML = '';
          progressiveSlot.classList.remove('is-loading', 'is-ready');
          progressiveSlot.classList.add('is-hidden');
        }
        return false;
      })
      .catch(function () {
        try { if (loader && target.contains(loader)) target.removeChild(loader); } catch (_) {}
        if (progressiveSlot) {
          progressiveSlot.innerHTML = '';
          progressiveSlot.classList.remove('is-loading', 'is-ready');
          progressiveSlot.classList.add('is-hidden');
        }
        return false;
      });
  };
})();


/* === smart-lookup.js === */
(function () {
  function getInput() {
    return document.getElementById('smart-lookup-input');
  }

  function getResults() {
    return document.getElementById('smart-lookup-results');
  }

  function runSmartLookup() {
    var input = getInput();
    if (!input) return;
    if (typeof window.estimateAge === 'function') window.estimateAge();
  }

  function initSmartLookupPage() {
    var input = getInput();
    var results = getResults();
    if (!input) return;
    if (input.getAttribute('data-smart-lookup-bound') === '1') return;
    input.setAttribute('data-smart-lookup-bound', '1');
    input.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') runSmartLookup();
    });

    // Wire up any button on the page that should trigger Smart Lookup
    var buttons = document.querySelectorAll('[onclick*="estimateAge"], [onclick*="runSmartLookup"], #smartLookupBtn, .smart-lookup-btn, .alt-btn');
    buttons.forEach(function(btn) {
      if (btn.getAttribute('data-sl-bound') === '1') return;
      btn.setAttribute('data-sl-bound', '1');
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        runSmartLookup();
      });
    });
  }

  window.runSmartLookup = runSmartLookup;
  window.initSmartLookupPage = initSmartLookupPage;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSmartLookupPage);
  } else {
    initSmartLookupPage();
  }
})();


/* === shared.js === */
/* ═══════════════════════════════════════════════
   Item Assist — shared.js
   Include at bottom of every page body:
   <script src="shared.js"></script>
   ═══════════════════════════════════════════════ */

/* ─── NAV: mark current page link as active ─── */
(function () {
  if (document.querySelector('nav ul li a.nav-active')) return;
  const links = document.querySelectorAll('nav ul li a');
  links.forEach(link => {
    if (link.href === window.location.href || window.location.pathname.includes(link.dataset.page)) {
      link.classList.add('active');
    }
  });
})();

/* ─── SEARCH BOX TAB SWITCHER ─── */
/* Brand lists per category */
const BRANDS = {
  appliances:   ['GE','Whirlpool','Samsung','LG','Bosch','Maytag','KitchenAid','Frigidaire','Electrolux','Amana','Kenmore','Hotpoint'],
  hvac:         ['Carrier','Trane','Lennox','Rheem','York','Bryant','Goodman','American Standard','Daikin','Heil','Ruud','Payne'],
  electronics:  ['Samsung','LG','Sony','Panasonic','Vizio','TCL','Hisense','Philips','Sharp','Insignia','Toshiba','JVC'],
  waterheaters: ['Rheem','AO Smith','Bradford White','State','American','Kenmore','GE','Navien','Rinnai','Noritz','Lochinvar','Weil-McLain']
};

function setTab(el, tab) {
  document.querySelectorAll('.search-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');

  const decoderPanel = document.getElementById('panel-decoder');
  const smartPanel   = document.getElementById('panel-smart');

  if (!decoderPanel || !smartPanel) return;

  if (tab === 'smart') {
    decoderPanel.style.display = 'none';
    smartPanel.style.display   = 'block';
  } else {
    decoderPanel.style.display = 'block';
    smartPanel.style.display   = 'none';
    const sel    = document.getElementById('brand-select');
    const brands = (BRANDS[tab] || []).slice().sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    if (sel) {
      sel.innerHTML = '<option value="">-- Select Brand --</option>' +
        brands.map(b => `<option>${b}</option>`).join('');
    }
  }
}

/* ─── MOBILE HAMBURGER ─── */
(function() {
  var btn = document.getElementById('hamburgerBtn');
  var nav = document.querySelector('nav ul');
  if (!btn || !nav) return;

  function closeMenu() {
    btn.classList.remove('active');
    nav.classList.remove('open');
    btn.setAttribute('aria-label', 'Open menu');
    document.body.classList.remove('nav-menu-open');
  }

  function openMenu() {
    btn.classList.add('active');
    nav.classList.add('open');
    btn.setAttribute('aria-label', 'Close menu');
    document.body.classList.add('nav-menu-open');
  }

  btn.addEventListener('click', function() {
    if (nav.classList.contains('open')) closeMenu();
    else openMenu();
  });
  nav.querySelectorAll('a').forEach(function(link) {
    link.addEventListener('click', function() {
      var href = this.getAttribute('href');
      // Never intercept absolute navigation links.
      if (href && (href.indexOf('/') === 0 || href.indexOf('http') === 0)) return;
      closeMenu();
    });
  });
  document.addEventListener('click', function(e) {
    if (!btn.contains(e.target) && !nav.contains(e.target)) {
      closeMenu();
    }
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeMenu();
  });
})();

/* --- Internal version timestamp badge (obfuscated) --- */
(function () {
  function pad2(n) { return String(n).padStart(2, '0'); }

  var now = new Date();
  // Format example: 6/1204 => day-of-month / HHMM
  var code = now.getDate() + '/' + pad2(now.getHours()) + pad2(now.getMinutes());

  var badge = document.createElement('div');
  badge.className = 'internal-version-badge';
  badge.setAttribute('aria-hidden', 'true');
  badge.textContent = code;
  document.body.appendChild(badge);
})();

(function enhanceLandingPageCards() {
  if (!document.body || document.body.dataset.pageKind !== 'landing') return;
  document.querySelectorAll('.prose').forEach(function (prose) {
    if (!prose || prose.dataset.cardified === 'true') return;

    var children = Array.from(prose.children);
    if (!children.length) return;

    var fragment = document.createDocumentFragment();
    var currentCard = null;

    children.forEach(function (node) {
      var tag = (node.tagName || '').toUpperCase();
      if (tag === 'H2') {
        currentCard = document.createElement('section');
        currentCard.className = 'landing-info-card';
        fragment.appendChild(currentCard);
      }

      if (!currentCard) {
        currentCard = document.createElement('section');
        currentCard.className = 'landing-info-card';
        fragment.appendChild(currentCard);
      }

      if (tag === 'UL') node.classList.add('landing-bullet-list');
      if (node.classList.contains('cta-block')) node.classList.add('landing-cta-card');
      currentCard.appendChild(node);
    });

    prose.appendChild(fragment);
    prose.dataset.cardified = 'true';
  });
})();

(function enhanceBrandPageToolCards() {
  if (!document.body) return;
  if (!document.querySelector('.brand-helper-wrap')) return;

  var decoderPanel = document.getElementById('panel-decoder');
  var smartPanel = document.getElementById('panel-smart');
  var powerBar = document.querySelector('.power-bar');
  if (!decoderPanel || !smartPanel || !powerBar) return;

  document.body.classList.add('brand-tool-layout-active');

  function ensureButton(panel, selector, text, className, handlerName, id) {
    if (!panel) return;
    var slot = panel.querySelector('.panel-action-slot');
    if (!slot) {
      slot = document.createElement('div');
      slot.className = 'panel-action-slot';
      panel.appendChild(slot);
    }
    var btn = slot.querySelector(selector);
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = className;
      if (id) btn.id = id;
      btn.textContent = text;
      btn.addEventListener('click', function () {
        if (typeof window[handlerName] === 'function') window[handlerName]();
      });
      slot.appendChild(btn);
    }
    return btn;
  }

  var decodeBtn = ensureButton(decoderPanel, '.panel-decode-btn', 'Decode Serial Number', 'btn-primary power-btn panel-decode-btn', 'decodeSerial', 'brandPanelDecodeBtn');
  var searchBtn = ensureButton(smartPanel, '.panel-search-btn', 'Search', 'btn-amber power-btn panel-search-btn', 'runLKQLookup', 'brandPanelSearchBtn');

  function syncDecodeDisabled() {
    var source = document.getElementById('decodeBtn');
    if (source && decodeBtn) decodeBtn.disabled = !!source.disabled;
  }

  syncDecodeDisabled();
  var observerTarget = document.getElementById('decodeBtn');
  if (observerTarget && !observerTarget.dataset.brandMirrorBound) {
    observerTarget.dataset.brandMirrorBound = '1';
    new MutationObserver(syncDecodeDisabled).observe(observerTarget, { attributes: true, attributeFilter: ['disabled', 'class'] });
  }
})();

(function loadBoltAiAssistBubble() {
  var path = window.location.pathname || '';
  if (path === '/assistant' || path.endsWith('/assistant.html') || path.endsWith('assistant.html')) return;
  if (document.getElementById('bolt-ai-bubble-script')) return;
  var script = document.createElement('script');
  script.id = 'bolt-ai-bubble-script';
  script.src = '/components/chat/chat-bubble.js';
  document.body.appendChild(script);
})();
