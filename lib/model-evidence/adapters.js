import { attachProviderMetadata } from '../smart-lookup/provider.js';

const DATE_MEANINGS = {
  production_start: 'production_start',
  production_end: 'production_end',
  launch: 'product_launch',
  availability: 'product_available',
  discontinuation: 'discontinuation',
  manual_publication: 'manual_published',
  review_publication: 'review_published',
  listing_publication: 'listing_publication',
  owner_purchase: 'owner_purchase',
  ownership_age: 'ownership_age',
  troubleshooting: 'troubleshooting_date',
  page_update: 'page_updated',
  unknown: 'unknown',
};

function isScoringIdentity(matchType) {
  return matchType === 'exact' || matchType === 'canonical-equivalent';
}

export function sharedEvidenceToRefinementInput(shared) {
  const facts = [];
  for (const [index, item] of (shared?.facts || []).entries()) {
    const resultIndex = Number.isInteger(item.source?.resultIndex) ? item.source.resultIndex : index;
    const matchType = item.identity?.effectiveMatchType || 'unknown';
    const base = {
      resultIndex,
      domain: item.source?.domain || '',
      normalizedDateYear: null,
      modelMatchType: matchType,
      matchedToken: item.identity?.matchedToken || null,
      exactModelMatch: isScoringIdentity(matchType),
      llmExactModelMatch: item.identity?.suggestedMatchType === 'exact',
      suggestedMatchType: item.identity?.suggestedMatchType || 'unknown',
      sourceType: item.source?.sourceType || 'other',
      approximateYear: Number.isInteger(item.fact?.year) ? item.fact.year : null,
      approximateEndYear: Number.isInteger(item.fact?.endYear) ? item.fact.endYear : null,
      dateMeaning: DATE_MEANINGS[item.fact?.eventType] || 'unknown',
      datePrecision: item.fact?.precision || 'unknown',
      evidenceTarget: item.fact?.target || 'source_only',
      extractionConfidence: item.extraction?.confidence || 'low',
      ownershipAgeYears: null,
      explicitlyNewProduct: false,
      explicitlyDiscontinued: item.fact?.eventType === 'discontinuation',
      claimText: item.fact?.claim || '',
    };
    facts.push(base);
    if (base.dateMeaning === 'production_start' && Number.isInteger(base.approximateEndYear)) {
      facts.push({
        ...base,
        approximateYear: base.approximateEndYear,
        approximateEndYear: null,
        dateMeaning: 'production_end',
      });
    }
  }
  return facts;
}

export function sharedEvidenceToRefinementEvidence(shared) {
  return (shared?.facts || []).map((item) => ({
    type: item.source?.sourceType || 'other',
    title: item.source?.title || 'Model evidence source',
    sourceUrl: item.source?.url || null,
    publishedDate: null,
    availabilityStart: item.fact?.eventType === 'availability' ? item.fact.year : null,
    availabilityEnd: null,
    productionStart: item.fact?.eventType === 'production_start' ? item.fact.year : null,
    productionEnd: item.fact?.eventType === 'production_end' ? item.fact.year : null,
    supports: item.fact?.claim || '',
    quality: item.extraction?.confidence === 'high' ? 'official' : 'strong-secondary',
    verified: Boolean(item.source?.url),
    sourceName: item.source?.domain || item.source?.title || '',
    exactModelMatch: isScoringIdentity(item.identity?.effectiveMatchType),
    modelMatchType: item.identity?.effectiveMatchType || 'unknown',
    evidenceYear: Number.isInteger(item.fact?.year) ? item.fact.year : null,
    dateMeaning: DATE_MEANINGS[item.fact?.eventType] || 'unknown',
  }));
}

export function sharedEvidenceToSmartLookupInput(shared, queryInfo) {
  const tier = queryInfo?.querySpecificity || 'exact-model';
  const allowedMatches = tier === 'exact-model'
    ? new Set(['exact', 'canonical-equivalent'])
    : new Set(['exact', 'canonical-equivalent', 'variant', 'family']);
  if (tier === 'exact-model' && !shared?.matchedIdentity?.deterministicExact) return null;

  const relevantFacts = (shared?.facts || []).filter((item) =>
    allowedMatches.has(item.identity?.effectiveMatchType));
  const datedFacts = relevantFacts.filter((item) => Number.isInteger(item.fact?.year));
  const lifecycleFacts = datedFacts.filter((item) =>
    ['launch', 'availability', 'production_start', 'production_end', 'discontinuation'].includes(item.fact?.eventType));
  const startFacts = lifecycleFacts.filter((item) =>
    ['launch', 'availability', 'production_start'].includes(item.fact?.eventType));
  const independentDomains = new Set(datedFacts
    .map((item) => item.source?.domain)
    .filter(Boolean));

  // Exact queries retain exact-identity acceptance. Broader tiers accept one
  // explicit lifecycle fact, two independent dated sources, or a recognized
  // family fact. A lone publication/listing date is existence evidence only
  // and cannot manufacture a precise production boundary.
  const credibleDatedFact = datedFacts.some((item) =>
    ['manufacturer', 'manual', 'spec-sheet', 'energy-star', 'retailer', 'review', 'parts'].includes(item.source?.sourceType));
  const hasUsableEvidence = startFacts.length > 0
    || independentDomains.size >= 2
    || credibleDatedFact
    || (tier !== 'exact-model' && datedFacts.some((item) => item.identity?.effectiveMatchType === 'family'));
  if (!hasUsableEvidence) return null;

  const seenSources = new Set();
  const sources = relevantFacts
    .filter((item) => /^https:\/\//i.test(item.source?.url || ''))
    .filter((item) => {
      const key = (item.source?.domain || item.source?.url || '').toLowerCase();
      if (!key || seenSources.has(key)) return false;
      seenSources.add(key);
      return true;
    })
    .map((item) => ({
      uri: item.source.url,
      title: item.source.title,
      domain: item.source.domain,
    }))
    .slice(0, 5);
  const start = shared.lifecycle?.supportedProductionStartYear;
  const end = shared.lifecycle?.supportedProductionEndYear
    ?? shared.lifecycle?.supportedDiscontinuationYear;
  const introductionYears = startFacts
    .filter((item) => tier !== 'model-line' || item.identity?.effectiveMatchType !== 'family')
    .map((item) => item.fact.year);
  const introductionYear = introductionYears.length
    ? Math.min(...introductionYears)
    : (Number.isInteger(start) ? start : null);
  const productionRange = Number.isInteger(start) && Number.isInteger(end) && end >= start
    ? { start, end, basis: `${tier}-lifecycle-evidence` }
    : null;
  const allYears = datedFacts.map((item) => item.fact.year);
  const evidenceYear = introductionYear ?? (allYears.length ? Math.min(...allYears) : null);
  const broadStart = evidenceYear == null ? null : Math.floor(evidenceYear / 5) * 5;
  const broadEnd = broadStart == null ? null : broadStart + 4;
  const officialLifecycle = startFacts.some((item) =>
    item.source?.sourceType === 'manufacturer' && item.extraction?.confidence === 'high');
  const confidence = officialLifecycle ? 'high' : (startFacts.length || independentDomains.size >= 2 ? 'medium' : 'low');
  const estimateBasis = tier === 'product-family'
    ? 'product-family-introduction'
    : (tier === 'model-line'
      ? 'model-line-generation'
      : (tier === 'exact-model' ? 'exact-model-dated-source' : 'heuristic'));
  const estimatedRange = productionRange
    ? { start: productionRange.start, end: productionRange.end }
    : (introductionYear != null
      ? { start: introductionYear, end: null }
      : { start: broadStart, end: broadEnd });
  const rangeLabel = estimatedRange.start == null
    ? null
    : (estimatedRange.end == null
      ? `${estimatedRange.start} or later`
      : (estimatedRange.start === estimatedRange.end
        ? String(estimatedRange.start)
        : `${estimatedRange.start}-${estimatedRange.end}`));
  const identityConfidence = shared.matchedIdentity?.matchType === 'exact'
    ? (tier === 'exact-model' ? 'high' : 'medium')
    : (shared.matchedIdentity?.matchType === 'variant' ? 'medium' : 'low');
  const identityLabel = queryInfo?.query || shared.requestedIdentity?.model || 'This product';
  const unitQualifier = 'This is model or product introduction timing, not the manufacture date of an individual unit.';
  const tierNote = tier === 'model-line'
    ? 'Suffix and configuration variants within this model line may have different dates.'
    : (tier === 'product-family'
      ? 'An individual unit may have been produced later.'
      : (tier !== 'exact-model' ? 'The identity is incomplete, so the estimate is intentionally broad.' : ''));

  const raw = {
    brand: shared.requestedIdentity.brand || queryInfo?.brand || 'Unknown',
    model: tier === 'exact-model' ? (shared.matchedIdentity.model || shared.requestedIdentity.model) : null,
    likelyProduct: identityLabel,
    category: queryInfo?.genericCategory || queryInfo?.productType || null,
    specificityLevel: tier === 'exact-model' ? 'specific' : 'partial',
    introductionYear: tier === 'exact-model' ? introductionYear : null,
    lineIntroductionYear: tier === 'model-line' ? introductionYear : null,
    familyIntroductionYear: tier === 'product-family' ? introductionYear : null,
    productionRange,
    estimatedEra: !introductionYear && broadStart != null ? `approximately ${broadStart}-${broadEnd}` : null,
    bestEstimateYear: introductionYear,
    estimatedRange,
    rangeLabel,
    estimateBasis,
    confidence,
    confidenceLevel: confidence,
    precisionLevel: tier === 'exact-model'
      ? 'narrow-range'
      : (tier === 'model-line'
        ? 'model-line-range'
        : (tier === 'product-family' ? 'family-range' : 'broad-range')),
    identityConfidence,
    timingConfidence: confidence,
    summary: introductionYear != null
      ? `${identityLabel} was introduced or available by ${introductionYear}, so a unit was likely manufactured in ${introductionYear} or later.`
      : `${identityLabel} is supported by dated evidence from approximately ${rangeLabel}.`,
    notes: [productionRange
      ? 'Lifecycle evidence supports this production window; publication dates were not used as production boundaries.'
      : 'Available dated evidence supports an approximate period without establishing a complete production window.', tierNote, unitQualifier]
      .filter(Boolean).join(' '),
    refinementNeeded: tier !== 'exact-model',
    refinementSuggestion: tier === 'exact-model'
      ? 'Use the physical unit serial number or manufacturing label to determine an individual manufacture date.'
      : 'Provide the complete model number and serial or manufacturing label for a narrower unit estimate.',
    evidence: relevantFacts.slice(0, 5).map((item) => ({
      detail: item.fact?.claim || `${item.fact?.eventType || 'Model'} evidence from ${item.source?.title || 'a cited source'}.`,
      source: item.source?.domain || item.source?.title || 'Model evidence source',
    })),
    sources,
  };

  return attachProviderMetadata(raw, {
    provider: shared.providerSummary?.serperUsed ? 'serper' : 'local-db',
    fallbackUsed: false,
    primaryProvider: shared.providerSummary?.serperUsed ? 'serper' : 'local-db',
    primaryErrorCode: shared.failureCategory || null,
    grounded: sources.length > 0,
    groundedSources: sources,
    webSearchUsed: shared.providerSummary?.serperUsed === true,
    model: relevantFacts.find((item) => item.extraction?.provider !== 'local-database')?.extraction?.model || null,
    actualProviderAttemptCount: (shared.providerSummary?.searchCount || 0)
      + (Number.isInteger(shared.providerSummary?.extractorCallCount)
        ? shared.providerSummary.extractorCallCount
        : (shared.providerSummary?.extractorUsed ? 1 : 0)),
    sharedModelEvidence: shared,
  });
}
