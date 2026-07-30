import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCandidates, resolveEffectiveYear } from '../../lib/serial-refinement/deterministic/candidate-evaluator.js';

function fact(overrides) {
  return {
    resultIndex: 0,
    domain: 'example.com',
    normalizedDateYear: null,
    modelMatchType: 'exact',
    exactModelMatch: true,
    sourceType: 'other',
    approximateYear: null,
    dateMeaning: 'unknown',
    ownershipAgeYears: null,
    explicitlyNewProduct: false,
    explicitlyDiscontinued: false,
    claimText: '',
    ...overrides,
  };
}

test('resolves to a single year when one anchor source is close and candidates are widely spaced', () => {
  const result = evaluateCandidates({
    candidateYears: [2004, 2014, 2024],
    evidenceFacts: [
      fact({ resultIndex: 0, domain: 'youtube.com', normalizedDateYear: 2024, dateMeaning: 'product_launch', claimText: 'Promo video published' }),
    ],
    localModelEvidence: null,
  });
  assert.equal(result.bestEstimateYear, 2024);
  assert.equal(result.resolutionType, 'resolved-single');
});

test('does not force a single year when evidence is empty', () => {
  const result = evaluateCandidates({
    candidateYears: [2006, 2016, 2026],
    evidenceFacts: [],
    localModelEvidence: null,
  });
  assert.equal(result.bestEstimateYear, null);
  assert.equal(result.resolutionType, 'unchanged');
});

test('a page_updated date contributes nothing (recent page update does not prove recent model)', () => {
  const result = evaluateCandidates({
    candidateYears: [2006, 2016, 2026],
    evidenceFacts: [
      fact({ resultIndex: 0, domain: 'samsung.com', normalizedDateYear: 2026, dateMeaning: 'page_updated', claimText: 'Page updated 1 day ago' }),
    ],
    localModelEvidence: null,
  });
  assert.equal(result.bestEstimateYear, null);
  assert.equal(result.resolutionType, 'unchanged');
});

test('a review publication date is non-directional and does not penalize later candidates', () => {
  const result = evaluateCandidates({
    candidateYears: [2006, 2016, 2026],
    evidenceFacts: [
      fact({ resultIndex: 0, domain: 'youtube.com', normalizedDateYear: 2022, dateMeaning: 'review_published', claimText: 'Review published 4 years ago' }),
    ],
    localModelEvidence: null,
  });
  const scoreOf = (y) => result.candidateScores.find((c) => c.year === y).score;
  assert.equal(scoreOf(2006), 0);
  assert.equal(scoreOf(2016), 0);
  assert.equal(scoreOf(2026), 0, 'publication does not establish a production upper bound');
  assert.equal(result.bestEstimateYear, null);
});

test('publication-like dates never become production upper bounds', () => {
  const meanings = [
    'publication_date',
    'listing_publication',
    'manual_published',
    'review_published',
    'troubleshooting_date',
  ];

  for (const dateMeaning of meanings) {
    const result = evaluateCandidates({
      candidateYears: [2016, 2026],
      evidenceFacts: [
        fact({
          sourceType: 'manufacturer',
          normalizedDateYear: 2020,
          dateMeaning,
          explicitlyDiscontinued: true,
        }),
      ],
      localModelEvidence: null,
    });
    const later = result.candidateScores.find((candidate) => candidate.year === 2026);
    assert.equal(later.explicitScore, 0, `${dateMeaning} must not penalize a later manufacture candidate`);
  }
});

test('new or discontinued booleans cannot turn an unknown date into a lifecycle boundary', () => {
  for (const flags of [
    { explicitlyNewProduct: true },
    { explicitlyDiscontinued: true },
  ]) {
    const result = evaluateCandidates({
      candidateYears: [2016, 2026],
      evidenceFacts: [
        fact({
          sourceType: 'manufacturer',
          normalizedDateYear: 2020,
          dateMeaning: 'unknown',
          ...flags,
        }),
      ],
      localModelEvidence: null,
    });
    assert.equal(result.bestEstimateYear, null);
    assert.ok(result.candidateScores.every((candidate) => candidate.score === 0));
  }
});

test('ownership-age statement can resolve decade-separated candidates', () => {
  const result = evaluateCandidates({
    candidateYears: [2014, 2024],
    evidenceFacts: [
      fact({
        resultIndex: 0, domain: 'reddit.com', normalizedDateYear: 2025, dateMeaning: 'ownership_age',
        ownershipAgeYears: 1, claimText: 'Owner says item is one year old',
      }),
    ],
    localModelEvidence: null,
  });
  assert.equal(result.bestEstimateYear, 2024);
  assert.equal(result.resolutionType, 'resolved-single');
});

test('marketplace domains never determine the result alone', () => {
  const result = evaluateCandidates({
    candidateYears: [2004, 2014, 2024],
    evidenceFacts: [
      fact({ resultIndex: 0, domain: 'ebay.com', normalizedDateYear: 2024, dateMeaning: 'product_launch', claimText: 'eBay listing' }),
    ],
    localModelEvidence: null,
  });
  assert.equal(result.bestEstimateYear, null);
});

test('close-together candidates cap confidence at low even when resolved', () => {
  const result = evaluateCandidates({
    candidateYears: [2022, 2024],
    evidenceFacts: [
      fact({ resultIndex: 0, domain: 'a.com', normalizedDateYear: 2024, dateMeaning: 'product_launch', claimText: 'Launch A' }),
      fact({ resultIndex: 1, domain: 'b.com', normalizedDateYear: 2024, dateMeaning: 'product_available', claimText: 'Available B' }),
    ],
    localModelEvidence: null,
  });
  if (result.bestEstimateYear !== null) {
    assert.equal(result.confidence, 'low');
  }
});

test('publication and troubleshooting dates cannot form an era cluster without lifecycle evidence', () => {
  const result = evaluateCandidates({
    candidateYears: [2006, 2016, 2026],
    evidenceFacts: [
      fact({ resultIndex: 0, domain: 'a.com', normalizedDateYear: 2018, dateMeaning: 'review_published', claimText: 'Review A' }),
      fact({ resultIndex: 1, domain: 'b.com', normalizedDateYear: 2019, dateMeaning: 'troubleshooting_date', claimText: 'Troubleshooting B' }),
    ],
    localModelEvidence: null,
  });
  assert.equal(result.bestEstimateYear, null);
  assert.equal(result.estimatedModelEra.centerYear, null);
});

test('local model database agreement contributes to scoring', () => {
  const result = evaluateCandidates({
    candidateYears: [2006, 2016, 2026],
    evidenceFacts: [],
    localModelEvidence: { start: 2014, end: 2018 },
  });
  const scoreOf = (y) => result.candidateScores.find((c) => c.year === y).score;
  assert.ok(scoreOf(2016) > scoreOf(2006));
  assert.ok(scoreOf(2016) > scoreOf(2026));
});

test('result is identical regardless of candidateYears array order', () => {
  const evidenceFacts = [
    fact({ resultIndex: 0, domain: 'geappliances.com', normalizedDateYear: 2016, dateMeaning: 'manual_published', claimText: 'Manual states production window' }),
    fact({ resultIndex: 1, domain: 'homedepot.com', normalizedDateYear: 2015, dateMeaning: 'review_published', claimText: 'Dated review' }),
  ];
  const original = evaluateCandidates({ candidateYears: [1996, 2006, 2016], evidenceFacts, localModelEvidence: null });
  const reversed = evaluateCandidates({ candidateYears: [2016, 2006, 1996], evidenceFacts, localModelEvidence: null });
  const rotated = evaluateCandidates({ candidateYears: [2006, 2016, 1996], evidenceFacts, localModelEvidence: null });

  assert.deepEqual(original.candidateScores, reversed.candidateScores);
  assert.deepEqual(original.candidateScores, rotated.candidateScores);
  assert.equal(original.bestEstimateYear, reversed.bestEstimateYear);
  assert.equal(original.bestEstimateYear, rotated.bestEstimateYear);
  assert.equal(original.confidence, reversed.confidence);
  assert.deepEqual(original.plausibleYears, reversed.plausibleYears);
});

test('duplicate/mirrored availability domains cannot activate era clustering', () => {
  const evidenceFacts = [
    fact({ resultIndex: 0, domain: 'parts.com', normalizedDateYear: 2016, dateMeaning: 'product_available', claimText: 'Listing 1' }),
    fact({ resultIndex: 1, domain: 'parts.com', normalizedDateYear: 2016, dateMeaning: 'product_available', claimText: 'Listing 2 (mirrored)' }),
    fact({ resultIndex: 2, domain: 'parts.com', normalizedDateYear: 2016, dateMeaning: 'product_available', claimText: 'Listing 3 (mirrored)' }),
  ];
  const result = evaluateCandidates({ candidateYears: [2006, 2016, 2026], evidenceFacts, localModelEvidence: null });
  const scoreOf = (y) => result.candidateScores.find((c) => c.year === y).score;
  assert.equal(scoreOf(2016), 0);
  assert.equal(result.bestEstimateYear, null);
});

test('a manufacturer-stated production-window launch date resolves the candidate INSIDE that window, not just at the start year (regression: explicitlyDiscontinued must not override a product_launch dateMeaning)', () => {
  // Regression case: GE GTS18GTHWW manual states "manufactured Oct 2014 to
  // Nov 2019". Gemini extracts approximateYear=2014 (the start) with
  // dateMeaning='product_launch' AND explicitlyDiscontinued=true (because
  // the source also mentions an end date). The correct candidate is 2016,
  // which falls INSIDE that window — a naive "penalize anything after the
  // launch year" rule would incorrectly contradict 2016 for coming after
  // 2014.
  const result = evaluateCandidates({
    candidateYears: [1996, 2006, 2016],
    evidenceFacts: [
      fact({
        resultIndex: 0, domain: 'products.geappliances.com', sourceType: 'manual',
        dateMeaning: 'product_launch', approximateYear: 2014, explicitlyDiscontinued: true,
        claimText: 'Manufactured October 2014 to November 2019',
      }),
    ],
    localModelEvidence: null,
  });
  assert.equal(result.bestEstimateYear, 2016);
  const scoreOf = (y) => result.candidateScores.find((c) => c.year === y).score;
  assert.ok(scoreOf(1996) < 0, 'candidate before the launch date should be contradicted');
  assert.ok(scoreOf(2006) < 0, 'candidate before the launch date should be contradicted');
  assert.ok(scoreOf(2016) > 0, 'candidate at/after the launch date should NOT be contradicted');
});

test('an availability date does not contradict later candidates (existence evidence, not an upper bound)', () => {
  const result = evaluateCandidates({
    candidateYears: [2010, 2020],
    evidenceFacts: [
      fact({ resultIndex: 0, domain: 'a.com', dateMeaning: 'product_available', approximateYear: 2010, claimText: 'Available starting 2010' }),
    ],
    localModelEvidence: null,
  });
  const scoreOf = (y) => result.candidateScores.find((c) => c.year === y).score;
  assert.ok(scoreOf(2020) >= 0, 'a later candidate must not be contradicted by an earlier launch date');
});

test('for a product_launch fact, in-text approximateYear wins over the raw date field (regression: page-edit date is not the launch date)', () => {
  // Regression case: Trane HVAC Wiki page's raw Serper `date` field says the
  // *page* was edited "May 26, 2025" (normalizedDateYear=2025), but its
  // prose says the model was "produced from 2005" (approximateYear=2005,
  // dateMeaning='product_launch'). The launch year is 2005, not 2025 — using
  // the page-edit year as the launch year previously sent the wrong
  // (future) candidate to the top with high confidence.
  const result = evaluateCandidates({
    candidateYears: [2006, 2016, 2026],
    evidenceFacts: [
      fact({
        resultIndex: 0, domain: 'hvac.miraheze.org', sourceType: 'other',
        dateMeaning: 'product_launch', normalizedDateYear: 2025, approximateYear: 2005,
        claimText: 'Produced from 2005 to 2024',
      }),
    ],
    localModelEvidence: null,
  });
  assert.notEqual(result.bestEstimateYear, 2026, 'must not resolve to a candidate the evidence explicitly places after production ended');
  assert.equal(result.bestEstimateYear, 2006);
});

test('resolveEffectiveYear prefers the date field for meanings where it describes the same event', () => {
  const withField = fact({ dateMeaning: 'review_published', normalizedDateYear: 2022, approximateYear: 2019 });
  assert.equal(resolveEffectiveYear(withField), 2022);
});

test('resolveEffectiveYear prefers Gemini extraction over the date field for product_launch/product_available', () => {
  const launch = fact({ dateMeaning: 'product_launch', normalizedDateYear: 2025, approximateYear: 2005 });
  assert.equal(resolveEffectiveYear(launch), 2005);
});

test('a single dated source cannot activate era clustering', () => {
  const result = evaluateCandidates({
    candidateYears: [2004, 2024],
    evidenceFacts: [
      fact({ resultIndex: 0, domain: 'a.com', sourceType: 'youtube', dateMeaning: 'review_published', approximateYear: 2023, claimText: 'YouTube review from 2023' }),
    ],
    localModelEvidence: null,
  });
  assert.equal(result.bestEstimateYear, null);
  assert.equal(result.resolvedVia, null);
  assert.equal(result.estimatedModelEra.centerYear, null);
});

test('two independent exact-model sources including lifecycle evidence can activate era clustering', () => {
  const result = evaluateCandidates({
    candidateYears: [2004, 2014, 2024],
    evidenceFacts: [
      fact({ resultIndex: 0, domain: 'review.example', sourceType: 'review', dateMeaning: 'review_published', approximateYear: 2023 }),
      fact({ resultIndex: 1, domain: 'retailer.example', sourceType: 'retailer', dateMeaning: 'product_available', approximateYear: 2024 }),
    ],
    localModelEvidence: null,
  });

  assert.equal(result.bestEstimateYear, 2024);
  assert.equal(result.resolvedVia, 'eraCluster');
  assert.equal(result.confidence, 'moderate');
});

test('era-anchor clustering does not resolve when candidates are closer than the minimum spacing', () => {
  const result = evaluateCandidates({
    candidateYears: [2020, 2024],
    evidenceFacts: [
      fact({ resultIndex: 0, domain: 'a.com', sourceType: 'youtube', dateMeaning: 'review_published', approximateYear: 2023, claimText: 'Review' }),
      fact({ resultIndex: 1, domain: 'b.com', sourceType: 'retailer', dateMeaning: 'product_available', approximateYear: 2023, claimText: 'Available in 2023' }),
    ],
    localModelEvidence: null,
  });
  assert.notEqual(result.resolvedVia, 'eraCluster', 'candidates closer than ERA_CLUSTER_MIN_SPACING_YEARS must not resolve via era clustering');
});

test('sourceType "other" is not eligible as an era anchor even with a valid dateMeaning', () => {
  const result = evaluateCandidates({
    candidateYears: [2004, 2014, 2024],
    evidenceFacts: [
      fact({ resultIndex: 0, domain: 'a.com', sourceType: 'other', dateMeaning: 'review_published', approximateYear: 2024, claimText: 'Unclassified source' }),
    ],
    localModelEvidence: null,
  });
  assert.equal(result.estimatedModelEra.centerYear, null, 'an "other" sourceType must not contribute to the era-anchor median');
});

test('explicit evidence takes priority over era clustering when both point to different candidates', () => {
  const result = evaluateCandidates({
    candidateYears: [2004, 2014, 2024],
    evidenceFacts: [
      // Strong explicit fact for 2014.
      fact({ resultIndex: 0, domain: 'mfr.com', sourceType: 'manufacturer', dateMeaning: 'product_launch', approximateYear: 2014, claimText: 'Manufacturer states launched 2014' }),
      // Weaker era-anchor cluster pulling toward 2024.
      fact({ resultIndex: 1, domain: 'b.com', sourceType: 'youtube', dateMeaning: 'review_published', approximateYear: 2023, claimText: 'Review from 2023' }),
    ],
    localModelEvidence: null,
  });
  assert.equal(result.resolvedVia, 'explicit');
});

test('era clustering respects the marketplace exclusion (still cannot decide alone)', () => {
  const result = evaluateCandidates({
    candidateYears: [2004, 2014, 2024],
    evidenceFacts: [
      fact({ resultIndex: 0, domain: 'ebay.com', sourceType: 'retailer', dateMeaning: 'review_published', approximateYear: 2024, claimText: 'eBay listing' }),
    ],
    localModelEvidence: null,
  });
  assert.equal(result.bestEstimateYear, null);
  assert.equal(result.estimatedModelEra.centerYear, null);
});

test('era-cluster result stays order-independent across candidate permutations', () => {
  const evidenceFacts = [
    fact({ resultIndex: 0, domain: 'a.com', sourceType: 'youtube', dateMeaning: 'review_published', approximateYear: 2023, claimText: 'Review A' }),
    fact({ resultIndex: 1, domain: 'b.com', sourceType: 'retailer', dateMeaning: 'product_available', approximateYear: 2024, claimText: 'Available B' }),
  ];
  const a = evaluateCandidates({ candidateYears: [2004, 2014, 2024], evidenceFacts, localModelEvidence: null });
  const b = evaluateCandidates({ candidateYears: [2024, 2004, 2014], evidenceFacts, localModelEvidence: null });
  const c = evaluateCandidates({ candidateYears: [2014, 2024, 2004], evidenceFacts, localModelEvidence: null });
  assert.deepEqual(a.candidateScores, b.candidateScores);
  assert.deepEqual(a.candidateScores, c.candidateScores);
  assert.equal(a.bestEstimateYear, b.bestEstimateYear);
  assert.equal(a.bestEstimateYear, c.bestEstimateYear);
});

test('estimatedModelEra is derived from evidence and separate from the final decision', () => {
  const result = evaluateCandidates({
    candidateYears: [2016],
    evidenceFacts: [
      fact({ resultIndex: 0, domain: 'a.com', sourceType: 'manufacturer', normalizedDateYear: 2015, dateMeaning: 'product_launch', claimText: 'Launch' }),
      fact({ resultIndex: 1, domain: 'b.com', sourceType: 'youtube', normalizedDateYear: 2020, dateMeaning: 'review_published', claimText: 'Later review' }),
    ],
    localModelEvidence: null,
  });
  assert.equal(result.estimatedModelEra.startYear, 2015);
  assert.equal(result.estimatedModelEra.endYear, 2020);
});

test('a recent troubleshooting post cannot pull an old exact model toward a recent serial candidate', () => {
  const result = evaluateCandidates({
    candidateYears: [2006, 2016, 2026],
    evidenceFacts: [
      fact({
        resultIndex: 0,
        domain: 'repair.example',
        sourceType: 'reddit-forum',
        normalizedDateYear: 2025,
        dateMeaning: 'troubleshooting_date',
        claimText: 'Troubleshooting post from 2025',
      }),
    ],
    localModelEvidence: null,
  });

  assert.equal(result.bestEstimateYear, null);
  assert.ok(result.candidateScores.every((candidate) => candidate.score === 0));
});

test('an explicit production end can penalize later candidates', () => {
  const result = evaluateCandidates({
    candidateYears: [2006, 2016, 2026],
    evidenceFacts: [
      fact({
        domain: 'manufacturer.example',
        sourceType: 'manufacturer',
        approximateYear: 2019,
        dateMeaning: 'production_end',
        claimText: 'Production ended in 2019',
      }),
    ],
    localModelEvidence: null,
  });

  const scoreOf = (year) => result.candidateScores.find((candidate) => candidate.year === year).score;
  assert.ok(scoreOf(2026) < 0);
  assert.ok(scoreOf(2016) > scoreOf(2006));
});

test('variant and family facts never enter candidate scoring', () => {
  for (const modelMatchType of ['variant', 'family', 'mismatch']) {
    const result = evaluateCandidates({
      candidateYears: [2006, 2016, 2026],
      evidenceFacts: [
        fact({
          modelMatchType,
          exactModelMatch: true,
          sourceType: 'manufacturer',
          approximateYear: 2024,
          dateMeaning: 'product_launch',
        }),
      ],
      localModelEvidence: null,
    });
    assert.equal(result.bestEstimateYear, null);
    assert.ok(result.candidateScores.every((candidate) => candidate.score === 0));
  }
});

test('every selected year remains one of the supplied serial candidates', () => {
  const candidateYears = [2004, 2014, 2024];
  const result = evaluateCandidates({
    candidateYears,
    evidenceFacts: [
      fact({ sourceType: 'manufacturer', approximateYear: 2023, dateMeaning: 'product_launch' }),
    ],
    localModelEvidence: null,
  });

  assert.ok(result.bestEstimateYear === null || candidateYears.includes(result.bestEstimateYear));
});
