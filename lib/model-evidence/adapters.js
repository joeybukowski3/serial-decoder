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

export function sharedEvidenceToRefinementInput(shared) {
  const facts = [];
  for (const [index, item] of (shared?.facts || []).entries()) {
    const resultIndex = Number.isInteger(item.source?.resultIndex) ? item.source.resultIndex : index;
    const base = {
      resultIndex,
      domain: item.source?.domain || '',
      normalizedDateYear: null,
      modelMatchType: item.identity?.effectiveMatchType || 'unknown',
      exactModelMatch: item.identity?.effectiveMatchType === 'exact',
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
    exactModelMatch: item.identity?.effectiveMatchType === 'exact',
    modelMatchType: item.identity?.effectiveMatchType || 'unknown',
    evidenceYear: Number.isInteger(item.fact?.year) ? item.fact.year : null,
    dateMeaning: DATE_MEANINGS[item.fact?.eventType] || 'unknown',
  }));
}

export function sharedEvidenceToSmartLookupInput(shared, queryInfo) {
  if (!shared?.matchedIdentity?.deterministicExact) return null;
  const exactFacts = (shared.facts || []).filter((item) => item.identity?.effectiveMatchType === 'exact');
  const sources = exactFacts
    .filter((item) => /^https:\/\//i.test(item.source?.url || ''))
    .map((item) => ({
      uri: item.source.url,
      title: item.source.title,
      domain: item.source.domain,
    }));
  const start = shared.lifecycle?.supportedProductionStartYear;
  const end = shared.lifecycle?.supportedProductionEndYear
    ?? shared.lifecycle?.supportedDiscontinuationYear;
  const launchYears = exactFacts
    .filter((item) => item.fact?.eventType === 'launch' && Number.isInteger(item.fact?.year))
    .map((item) => item.fact.year);
  const introductionYear = launchYears.length === 1
    ? launchYears[0]
    : (Number.isInteger(start) ? start : null);
  const productionRange = Number.isInteger(start) && Number.isInteger(end) && end >= start
    ? { start, end, basis: 'exact-model-lifecycle-evidence' }
    : null;

  const raw = {
    brand: shared.requestedIdentity.brand || queryInfo?.brand || 'Unknown',
    model: shared.matchedIdentity.model || shared.requestedIdentity.model,
    category: queryInfo?.genericCategory || queryInfo?.productType || null,
    specificityLevel: 'specific',
    introductionYear,
    productionRange,
    notes: productionRange
      ? 'Exact-model lifecycle evidence supports this production window; publication dates were not used as production boundaries.'
      : 'The exact model was verified, but the available evidence does not establish a complete production window.',
    refinementSuggestion: 'Use the physical unit serial number to determine an individual manufacture date.',
    evidence: exactFacts.map((item) => ({
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
    model: exactFacts.find((item) => item.extraction?.provider !== 'local-database')?.extraction?.model || null,
    actualProviderAttemptCount: (shared.providerSummary?.searchCount || 0)
      + (Number.isInteger(shared.providerSummary?.extractorCallCount)
        ? shared.providerSummary.extractorCallCount
        : (shared.providerSummary?.extractorUsed ? 1 : 0)),
    sharedModelEvidence: shared,
  });
}
