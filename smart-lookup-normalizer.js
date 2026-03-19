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
      searchType: _firstNonEmpty(interpret && interpret.queryKind, age && age.specificityLevel)
    };
  }

  function _deriveEstimatedYearFromRange(productionRange) {
    var text = _text(productionRange);
    var match;
    var start;
    var end;
    if (!text) return '';
    match = text.match(/(19|20)\d{2}\s*[-–]\s*((19|20)\d{2})/);
    if (!match) return '';
    start = parseInt(match[0].match(/(19|20)\d{2}/)[0], 10);
    end = parseInt(match[2], 10);
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
    return _toArray([
      identity.brand,
      identity.category,
      ageSummary.specificity,
      primary && primary.lkqRating
    ]);
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
      badges: _buildBadges(identity, ageSummary, recommendation)
    };
  }

  window.normalizeSmartLookupResult = normalizeSmartLookupResult;
}());
