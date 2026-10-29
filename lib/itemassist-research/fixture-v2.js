/**
 * Fixture mode, research.2 flavour. Each scenario is the RAW engine input (the shape a future evidence stage will produce) for the same
 * builder the real path uses (`buildResearchResponseV2`), so the demo exercises the real normalisation, valuation and validation. Nothing
 * here is researched: every amount, date and source page is illustrative demo data, shown only with the Preview's "Demo research data"
 * indicator, and the exact listing models are visibly fictional (DEMO-...) so no plausible real model number is ever presented as verified.
 * Source links point at site section pages, never at a product page that might not exist.
 *
 * Selected by the cleaned query text only, after the fixture mode itself has been decided from the environment.
 */

const ago = (referenceDate, days) => new Date(Date.parse(referenceDate) - days * 86_400_000).toISOString().slice(0, 10);

const source = (id, subject, url, extra = {}) => ({ id, subject, sourceUrl: url, ...extra });
const money = (low, high = low) => ({ currency: 'USD', low, high });
const price = (id, kind, subject, candidate, amount, extra = {}) => ({ id, kind, subject, candidate, model: null, amount, asOf: null, asOfBasis: 'UNKNOWN', verification: 'NONE', evidenceId: null, ...extra });
const cmp = (requirementKey, status, extra = {}) => ({ requirementKey, status, basis: 'AI_ESTIMATE', ...extra });

const LG_TV = 'https://www.lg.com/us/tvs';
const BEST_BUY = 'https://www.bestbuy.com/';
const ABT = 'https://www.abt.com/';
const HOME_DEPOT = 'https://www.homedepot.com/';
const LOWES = 'https://www.lowes.com/';
const CNET = 'https://www.cnet.com/';
const RTINGS = 'https://www.rtings.com/tv';
const SAMSUNG = 'https://www.samsung.com/us/';
const GE = 'https://www.geappliances.com/';

const tvOriginal = (identity, uncertainty = null, confidence = 'high') => ({
  identity, confidence, characteristics: ['OLED panel with self-lit pixels', '4K resolution', '120 Hz panel', 'webOS smart platform'], uncertainty,
});
const tvRequirements = [{ key: 'brightness', text: 'Peak brightness suited to a bright room', importance: 'IMPORTANT' }];

const SCENARIOS = Object.freeze([
  // Mixed evidence that the engine must refuse, reduced to what is supportable.
  { id: 'unsupported-claims', test: /\b(?:unsupported|bogus|made-up|fake)\b/i, build: (ref) => ({
    category: 'tv', profile: 'tv', original: tvOriginal('LG C3 series 4K OLED smart TV', 'Screen size was not given.'),
    requirements: [...tvRequirements, { text: 'Same remote style', importance: 'ESSENTIAL' }],
    successor: { name: 'LG OLED77C4PUA', why: 'The next generation of the same LG C-series OLED line.', differences: 'Currently $999 at Best Buy.', concern: null, confidence: 'high', standing: 'RECOMMENDED', comparison: [cmp('displayClass', 'MEETS')] },
    suggestions: [{ name: 'Samsung S90-series QD-OLED', why: 'Comparable premium OLED-class picture quality.', differences: 'Different smart platform and remote.', confidence: 'medium', comparison: [cmp('refresh', 'MEETS')] }],
    clarify: ['What screen size do you need?'],
    pricing: {
      referenceDate: ref, tier: { level: 'PREMIUM', basis: 'MSRP_EVIDENCE' },
      evidence: [
        source('e1', 'SUCCESSOR', 'https://example-deals.shop/lg-c4', { subjectModel: 'DEMO-C4-77', expectedModel: 'DEMO-C4-77' }),
        source('e2', 'SUCCESSOR', 'http://www.bestbuy.com/', { subjectModel: 'DEMO-C4-77', expectedModel: 'DEMO-C4-77' }),
        source('e3', 'ALT_1', BEST_BUY, { observedAt: ago(ref, 40), subjectModel: 'DEMO-S90-65', expectedModel: 'DEMO-S90-65' }),
        source('e4', 'SUCCESSOR', ABT, { observedAt: ago(ref, 2) }),
        source('e5', 'SUCCESSOR', LOWES, { observedAt: ago(ref, 2), subjectModel: 'DEMO-OTHER-65', expectedModel: 'DEMO-C4-77' }),
      ],
      prices: [
        price('p1', 'CURRENT_RETAIL_NEW', 'REPLACEMENT', 'SUCCESSOR', money(1099), { asOf: ago(ref, 1), asOfBasis: 'OBSERVED', verification: 'VERIFIED_PAGE', evidenceId: 'e1' }),
        price('p2', 'CURRENT_RETAIL_NEW', 'REPLACEMENT', 'SUCCESSOR', money(1049), { asOf: ago(ref, 1), asOfBasis: 'OBSERVED', verification: 'VERIFIED_PAGE', evidenceId: 'e9' }),
        price('p3', 'CURRENT_RETAIL_NEW', 'REPLACEMENT', 'ALT_1', money(1199), { verification: 'SEARCH_LISTING', evidenceId: 'e3' }),
        price('p4', 'CURRENT_RETAIL_NEW', 'REPLACEMENT', 'ALT_1', money(1149), { asOf: ago(ref, 40), asOfBasis: 'OBSERVED', verification: 'SEARCH_LISTING', evidenceId: 'e3' }),
        price('p5', 'CURRENT_RETAIL_NEW', 'REPLACEMENT', 'SUCCESSOR', money(999), { asOf: ago(ref, 1), asOfBasis: 'OBSERVED', verification: 'SEARCH_LISTING', evidenceId: 'e4' }),
        price('p8', 'CURRENT_RETAIL_NEW', 'REPLACEMENT', 'SUCCESSOR', money(949), { asOf: ago(ref, 2), asOfBasis: 'OBSERVED', verification: 'SEARCH_LISTING', evidenceId: 'e5' }),
        price('p6', 'AI_ESTIMATE', 'REPLACEMENT', null, money(900, 1600), { evidenceId: 'e3' }),
        price('p7', 'AI_ESTIMATE', 'REPLACEMENT', null, money(900, 1600)),
      ],
    },
  }) },
  { id: 'ambiguous-model', test: /^\s*samsung\s+\d{2}\s*(?:inch|in|")?\s*(?:tv|television)\s*$/i, build: (ref) => ({
    category: 'tv', profile: 'tv',
    original: { identity: 'Samsung 65-inch television, model not identified', confidence: 'low', characteristics: ['65 inch screen class', 'Samsung smart TV'], uncertainty: 'The model, panel technology and model year were not given, so the original’s tier cannot be placed.' },
    requirements: [],
    successor: null, suggestions: [], clarify: ['What is the model number on the back of the TV or in its settings menu?', 'Is it an OLED, QLED or standard LED model?'],
    pricing: { referenceDate: ref, tier: { level: 'UNKNOWN', basis: 'UNKNOWN' }, evidence: [], prices: [
      price('p1', 'AI_ESTIMATE', 'ORIGINAL', null, money(400, 1500)),
      price('p2', 'AI_ESTIMATE', 'REPLACEMENT', null, money(450, 1400)),
    ] },
  }) },
  { id: 'tv-strong-retail', test: /\b(?:s90d|bravia\s*8|strong retail)\b/i, build: (ref) => ({
    category: 'tv', profile: 'tv', original: tvOriginal('Samsung S90C 65-inch QD-OLED smart TV', null, 'high'), requirements: tvRequirements,
    successor: { name: 'Samsung S90-series QD-OLED, current generation', why: 'The maker’s current line of the same QD-OLED family.', differences: 'Newer processor and a brighter panel.', concern: null, confidence: 'high', standing: 'RECOMMENDED',
      comparison: [cmp('screenSize', 'MEETS', { basis: 'CONFIRMED', evidenceId: 'e2' }), cmp('resolution', 'MEETS'), cmp('displayClass', 'MEETS', { basis: 'CONFIRMED', evidenceId: 'e2' })] },
    suggestions: [{ name: 'Sony Bravia 8-series OLED', why: 'A comparable premium OLED line with strong processing.', differences: 'Different smart platform and speaker design.', concern: null, confidence: 'medium',
      comparison: [cmp('screenSize', 'MEETS', { basis: 'CONFIRMED', evidenceId: 'e4' }), cmp('refresh', 'MEETS')] }],
    clarify: [],
    pricing: {
      referenceDate: ref, tier: { level: 'PREMIUM', basis: 'MSRP_EVIDENCE' },
      evidence: [
        source('e1', 'ORIGINAL', SAMSUNG, { publishedAt: '2023-04-05', subjectModel: 'DEMO-S90C-65', expectedModel: 'DEMO-S90C-65' }),
        source('e2', 'SUCCESSOR', BEST_BUY, { observedAt: ago(ref, 1), subjectModel: 'DEMO-S90-65', expectedModel: 'DEMO-S90-65' }),
        source('e3', 'SUCCESSOR', SAMSUNG, { observedAt: ago(ref, 1), subjectModel: 'DEMO-S90-65', expectedModel: 'DEMO-S90-65' }),
        source('e4', 'ALT_1', ABT, { observedAt: ago(ref, 3), subjectModel: 'DEMO-BR8-65', expectedModel: 'DEMO-BR8-65' }),
      ],
      prices: [
        price('p1', 'MSRP', 'ORIGINAL', null, money(2199), { model: 'DEMO-S90C-65', asOf: '2023-04-05', asOfBasis: 'PUBLISHED', verification: 'VERIFIED_PAGE', evidenceId: 'e1' }),
        price('p2', 'CURRENT_RETAIL_NEW', 'REPLACEMENT', 'SUCCESSOR', money(1599), { model: 'DEMO-S90-65', asOf: ago(ref, 1), asOfBasis: 'OBSERVED', verification: 'VERIFIED_PAGE', evidenceId: 'e2' }),
        price('p3', 'CURRENT_RETAIL_NEW', 'REPLACEMENT', 'SUCCESSOR', money(1649), { model: 'DEMO-S90-65', asOf: ago(ref, 1), asOfBasis: 'OBSERVED', verification: 'VERIFIED_PAGE', evidenceId: 'e3' }),
        price('p4', 'CURRENT_RETAIL_NEW', 'REPLACEMENT', 'ALT_1', money(1499), { model: 'DEMO-BR8-65', asOf: ago(ref, 3), asOfBasis: 'OBSERVED', verification: 'VERIFIED_PAGE', evidenceId: 'e4' }),
      ],
    },
  }) },
  { id: 'tv-premium-oled', test: /\b(?:tv|television|oled|qled|c3|bravia)\b/i, build: (ref) => ({
    category: 'tv', profile: 'tv', original: tvOriginal('LG C3 series 4K OLED smart TV', 'Screen size was not given.'), requirements: tvRequirements,
    successor: { name: 'LG C-series OLED, current generation', why: 'The next generation of the same LG C-series OLED line.', differences: 'Newer processor and a brighter panel on some sizes.', concern: null, confidence: 'high', standing: 'RECOMMENDED',
      comparison: [cmp('screenSize', 'UNKNOWN'), cmp('resolution', 'MEETS'), cmp('displayClass', 'MEETS'), cmp('refresh', 'MEETS'), cmp('hdmi', 'MEETS')] },
    suggestions: [
      { name: 'Samsung S90-series QD-OLED', why: 'Comparable premium OLED-class picture quality.', differences: 'Different smart platform and remote.', concern: null, confidence: 'medium', comparison: [cmp('displayClass', 'MEETS'), cmp('refresh', 'MEETS')] },
      { name: 'Sony Bravia 8-series OLED', why: 'Similar tier with strong picture processing.', differences: 'Fewer gaming features on some sizes.', concern: 'Check the HDMI 2.1 port count for your size.', confidence: 'medium', comparison: [cmp('displayClass', 'MEETS'), cmp('hdmi', 'UNKNOWN')] },
    ],
    clarify: ['What screen size do you need?'],
    pricing: {
      referenceDate: ref, tier: { level: 'PREMIUM', basis: 'MSRP_EVIDENCE' },
      evidence: [
        source('e1', 'ORIGINAL', CNET, { publishedAt: '2023-03-20', subjectModel: 'DEMO-C3-65', expectedModel: 'DEMO-C3-65' }),
        source('e2', 'SUCCESSOR', BEST_BUY, { observedAt: ago(ref, 2), subjectModel: 'DEMO-C4-65', expectedModel: 'DEMO-C4-65' }),
        source('e3', 'ALT_1', ABT, { observedAt: ago(ref, 2), subjectModel: 'DEMO-S90-65', expectedModel: 'DEMO-S90-65' }),
        source('e4', 'ALT_2', HOME_DEPOT, { observedAt: ago(ref, 3), subjectModel: 'DEMO-BR8-65', expectedModel: 'DEMO-BR8-65' }),
      ],
      prices: [
        price('p1', 'MSRP', 'ORIGINAL', null, money(1999), { model: 'DEMO-C3-65', asOf: '2023-03-20', asOfBasis: 'PUBLISHED', verification: 'SEARCH_SNIPPET', evidenceId: 'e1' }),
        price('p2', 'CURRENT_RETAIL_NEW', 'REPLACEMENT', 'SUCCESSOR', money(1299), { model: 'DEMO-C4-65', asOf: ago(ref, 2), asOfBasis: 'OBSERVED', verification: 'SEARCH_LISTING', evidenceId: 'e2' }),
        price('p3', 'CURRENT_RETAIL_NEW', 'REPLACEMENT', 'ALT_1', money(1199), { model: 'DEMO-S90-65', asOf: ago(ref, 2), asOfBasis: 'OBSERVED', verification: 'SEARCH_LISTING', evidenceId: 'e3' }),
        price('p4', 'CURRENT_RETAIL_NEW', 'REPLACEMENT', 'ALT_2', money(1399), { model: 'DEMO-BR8-65', asOf: ago(ref, 3), asOfBasis: 'OBSERVED', verification: 'SEARCH_LISTING', evidenceId: 'e4' }),
      ],
    },
  }) },
  { id: 'fridge-constraints', test: /\b(?:fridge|refrigerator|freezer|rf28)\b/i, build: (ref) => ({
    category: 'refrigerator', profile: 'refrigerator',
    original: { identity: 'Samsung RF28 series French door refrigerator', confidence: 'medium', characteristics: ['French door layout', 'About 28 cubic feet of capacity', 'Bottom freezer drawer', 'Ice and water in the door'], uncertainty: 'The exact finish and dispenser setup were not given.' },
    requirements: [],
    successor: { name: 'Samsung Bespoke French door series', why: 'A newer Samsung French door line with the same layout and capacity class.', differences: 'Updated cooling and a refreshed control panel.', concern: 'Depth and door swing can differ between generations, so measure the opening first.', confidence: 'medium', standing: 'CONDITIONAL',
      comparison: [cmp('capacity', 'MEETS', { basis: 'CONFIRMED', evidenceId: 'e2' }), cmp('layout', 'MEETS', { basis: 'CONFIRMED', evidenceId: 'e2' }), cmp('fit', 'UNKNOWN')] },
    suggestions: [
      { name: 'LG French door series', why: 'Comparable capacity and layout.', differences: 'Different drawer arrangement and finish options.', concern: null, confidence: 'medium', comparison: [cmp('capacity', 'MEETS'), cmp('layout', 'MEETS'), cmp('fit', 'UNKNOWN')] },
      { name: 'GE side-by-side series', why: 'Similar total capacity and a through-the-door dispenser.', differences: 'A side-by-side layout instead of French doors.', concern: 'The door layout is different from the original.', confidence: 'medium',
        comparison: [cmp('capacity', 'MEETS'), cmp('layout', 'SHORTFALL', { basis: 'CONFIRMED', evidenceId: 'e4' })] },
    ],
    clarify: ['What are the width and height of the opening?'],
    pricing: {
      referenceDate: ref, tier: { level: 'PREMIUM', basis: 'MSRP_EVIDENCE' },
      evidence: [
        source('e1', 'ORIGINAL', SAMSUNG, { publishedAt: '2021-06-10', subjectModel: 'DEMO-RF28', expectedModel: 'DEMO-RF28' }),
        source('e2', 'SUCCESSOR', LOWES, { observedAt: ago(ref, 1), subjectModel: 'DEMO-BESPOKE-28', expectedModel: 'DEMO-BESPOKE-28' }),
        source('e3', 'ALT_2', HOME_DEPOT, { observedAt: ago(ref, 1), subjectModel: 'DEMO-GE-SBS1', expectedModel: 'DEMO-GE-SBS1' }),
        source('e4', 'ALT_2', GE, { observedAt: ago(ref, 1), subjectModel: 'DEMO-GE-SBS1', expectedModel: 'DEMO-GE-SBS1' }),
      ],
      prices: [
        price('p1', 'MSRP', 'ORIGINAL', null, money(2799), { model: 'DEMO-RF28', asOf: '2021-06-10', asOfBasis: 'PUBLISHED', verification: 'VERIFIED_PAGE', evidenceId: 'e1' }),
        price('p2', 'CURRENT_RETAIL_NEW', 'REPLACEMENT', 'SUCCESSOR', money(2399), { model: 'DEMO-BESPOKE-28', asOf: ago(ref, 1), asOfBasis: 'OBSERVED', verification: 'VERIFIED_PAGE', evidenceId: 'e2' }),
        // The higher advertised price of a candidate that does not meet an essential requirement never enters the range.
        price('p3', 'CURRENT_RETAIL_NEW', 'REPLACEMENT', 'ALT_2', money(3299), { model: 'DEMO-GE-SBS1', asOf: ago(ref, 1), asOfBasis: 'OBSERVED', verification: 'VERIFIED_PAGE', evidenceId: 'e3' }),
      ],
    },
  }) },
  { id: 'washer-dimensions', test: /\b(?:washer|washing machine|wm4000)\b/i, build: (ref) => ({
    category: 'appliance', profile: 'washer',
    original: { identity: 'Front load washer, 27 inch wide, about 4.5 cubic feet', confidence: 'medium', characteristics: ['Front load', 'About 4.5 cubic feet', '27 inch wide cabinet', 'Steam and smart features'], uncertainty: 'The exact maker and model were not given.' },
    requirements: [{ key: 'height', text: 'Total height with the stacked dryer under the cabinet limit', importance: 'IMPORTANT' }],
    successor: { name: 'LG front load washer series', why: 'Matching capacity and a 27 inch cabinet.', differences: 'Slightly different cycle options.', concern: null, confidence: 'medium', standing: 'RECOMMENDED',
      comparison: [cmp('capacity', 'MEETS'), cmp('loading', 'MEETS'), cmp('fit', 'MEETS', { basis: 'CONFIRMED', evidenceId: 'e2' })] },
    suggestions: [
      { name: 'Samsung front load washer series', why: 'Comparable capacity and a 27 inch cabinet.', differences: 'Different wash-cycle naming and controls.', concern: null, confidence: 'medium', comparison: [cmp('capacity', 'MEETS'), cmp('loading', 'MEETS'), cmp('fit', 'MEETS')] },
      { name: 'Whirlpool front load washer series', why: 'Comparable capacity at a lower advertised price.', differences: 'A wider 29 inch cabinet.', concern: 'It is wider than the 27 inch space.', confidence: 'medium',
        comparison: [cmp('capacity', 'MEETS'), cmp('loading', 'MEETS'), cmp('fit', 'SHORTFALL', { basis: 'CONFIRMED', evidenceId: 'e4' })] },
    ],
    clarify: ['Who makes it, and what is the model number on the door frame label?'],
    pricing: {
      referenceDate: ref, tier: { level: 'STANDARD', basis: 'AI_ESTIMATE' },
      evidence: [
        source('e1', 'ORIGINAL', RTINGS, { publishedAt: '2022-02-01', subjectModel: 'DEMO-WASH-27', expectedModel: 'DEMO-WASH-27' }),
        source('e2', 'SUCCESSOR', BEST_BUY, { observedAt: ago(ref, 1), subjectModel: 'DEMO-LG-WASH-27', expectedModel: 'DEMO-LG-WASH-27' }),
        source('e3', 'ALT_1', ABT, { observedAt: ago(ref, 1), subjectModel: 'DEMO-SS-WASH-27', expectedModel: 'DEMO-SS-WASH-27' }),
        source('e4', 'ALT_2', HOME_DEPOT, { observedAt: ago(ref, 1), subjectModel: 'DEMO-WP-WASH-29', expectedModel: 'DEMO-WP-WASH-29' }),
      ],
      prices: [
        price('p1', 'HISTORICAL_RETAIL', 'ORIGINAL', null, money(1049), { model: 'DEMO-WASH-27', asOf: '2022-02-01', asOfBasis: 'PUBLISHED', verification: 'SEARCH_SNIPPET', evidenceId: 'e1' }),
        price('p2', 'CURRENT_RETAIL_NEW', 'REPLACEMENT', 'SUCCESSOR', money(1099), { model: 'DEMO-LG-WASH-27', asOf: ago(ref, 1), asOfBasis: 'OBSERVED', verification: 'VERIFIED_PAGE', evidenceId: 'e2' }),
        price('p3', 'CURRENT_RETAIL_NEW', 'REPLACEMENT', 'ALT_1', money(999), { model: 'DEMO-SS-WASH-27', asOf: ago(ref, 1), asOfBasis: 'OBSERVED', verification: 'SEARCH_LISTING', evidenceId: 'e3' }),
        // Cheaper, but 29 inches wide in a 27 inch space: excluded however good the price looks.
        price('p4', 'CURRENT_RETAIL_NEW', 'REPLACEMENT', 'ALT_2', money(799), { model: 'DEMO-WP-WASH-29', asOf: ago(ref, 1), asOfBasis: 'OBSERVED', verification: 'VERIFIED_PAGE', evidenceId: 'e4' }),
      ],
    },
  }) },
  { id: 'sparse-estimate', test: /\b(?:dishwasher|dryer|oven|range|microwave|sparse)\b/i, build: (ref) => ({
    category: 'appliance', profile: 'dishwasher',
    original: { identity: 'Bosch 500 series 24 inch built-in dishwasher', confidence: 'medium', characteristics: ['24 inch built-in width', 'Third rack', 'Stainless steel tub'], uncertainty: 'No current retail price is included in this research for comparable models.' },
    requirements: [],
    successor: null,
    suggestions: [{ name: 'Bosch 500 series, current line', why: 'The same maker’s current mid-tier dishwasher line.', differences: 'Updated controls and cycle options.', concern: null, confidence: 'low', comparison: [cmp('width', 'MEETS'), cmp('fit', 'UNKNOWN')] }],
    clarify: ['What is the model number on the door frame label?'],
    pricing: {
      referenceDate: ref, tier: { level: 'STANDARD', basis: 'MSRP_EVIDENCE' },
      evidence: [source('e1', 'ORIGINAL', CNET, { publishedAt: '2020-06-01', subjectModel: 'DEMO-DW-500', expectedModel: 'DEMO-DW-500' })],
      prices: [price('p1', 'MSRP', 'ORIGINAL', null, money(949), { model: 'DEMO-DW-500', asOf: '2020-06-01', asOfBasis: 'PUBLISHED', verification: 'SEARCH_SNIPPET', evidenceId: 'e1' })],
    },
  }) },
]);

export const FIXTURE_V2_SCENARIO_IDS = Object.freeze([...SCENARIOS.map((scenario) => scenario.id), 'insufficient']);

const INSUFFICIENT = (ref) => ({
  category: 'unknown', profile: 'unknown', original: { identity: null, confidence: 'low', characteristics: [], uncertainty: 'This item could not be identified from the description.' },
  requirements: [], successor: null, suggestions: [], clarify: ['What is the brand and model number?'],
  pricing: { referenceDate: ref, tier: { level: 'UNKNOWN', basis: 'UNKNOWN' }, evidence: [], prices: [] },
});

/** The scenario and its raw engine input for a cleaned query. `referenceDate` (YYYY-MM-DD) is the "today" the demo dates are measured from. */
export function fixtureResearch2For(query, referenceDate) {
  const text = String(query || '');
  const scenario = SCENARIOS.find((item) => item.test.test(text));
  return scenario ? { id: scenario.id, input: scenario.build(referenceDate) } : { id: 'insufficient', input: INSUFFICIENT(referenceDate) };
}

/** The server flag that makes fixture mode emit research.2. Unset (the default) keeps the research.1 fixture exactly as before. */
export const FIXTURE_CONTRACT_ENV = 'ITEMASSIST_RESEARCH_FIXTURE_CONTRACT';
