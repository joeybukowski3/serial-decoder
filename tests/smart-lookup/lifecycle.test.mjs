import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLifecycleFields } from '../../lib/smart-lookup/lifecycle.js';
import { normalizeSmartAgeResult, normalizeCachedSmartAgeResult } from '../../lib/smart-lookup/result-schema.js';
import { prepareResultForCache } from '../../lib/smart-lookup/cache.js';
import { extractGeminiSearchSources } from '../../lib/smart-lookup/gemini-search-provider.js';
import { parseGroundingSources } from '../../lib/smart-lookup/provider.js';
import { extractOpenAiSources } from '../../lib/smart-lookup/openai-provider.js';
import { extractXaiSources } from '../../lib/smart-lookup/xai-provider.js';

const source = { title: 'LG lifecycle notice', domain: 'lg.com', uri: 'https://www.lg.com/us/wm3900hwa/lifecycle',
  evidenceText: [
    'LG WM3900HWA normal new-product retail sales ended in the US in 2022.',
    'LG WM3900HWA technical support ended June 30, 2024.',
  ] };
const queryInfo = {
  query: 'LG WM3900HWA USA', providerQuery: 'LG WM3900HWA USA', brand: 'LG',
  modelCompleteness: 'exact', modelIdentity: 'WM3900HWA', exactModel: 'WM3900HWA',
  specificityLevel: 'specific', querySpecificity: 'exact-model',
};
const retail = {
  product: 'LG WM3900HWA', event: 'normal_new_product_retail_sales_end',
  date: '2022', market: 'US', confidence: 'medium',
  evidenceExcerpt: 'Normal new-product retail sales ended in the US in 2022.',
  sourceUrl: source.uri,
};
const support = {
  product: 'LG WM3900HWA', event: 'manufacturer_support_end',
  date: '2024-06-30', supportCategory: 'technical_support', confidence: 'high',
  evidenceExcerpt: 'Technical support ended June 30, 2024.', sourceUrl: source.uri,
};
const context = { sources: [source], queryInfo, currentYear: 2026 };

test('accepts independent MEDIUM year-only retail and HIGH dated support facts', () => {
  const result = normalizeLifecycleFields({ endOfRetailAvailability: [retail], endOfManufacturerSupport: [support] }, context);
  assert.deepEqual(result.endOfRetailAvailability, {
    date: '2022', precision: 'year', confidence: 'medium', product: retail.product,
    market: 'US', source: { title: source.title, uri: source.uri },
  });
  assert.equal(result.endOfManufacturerSupport.date, '2024-06-30');
  assert.equal(result.endOfManufacturerSupport.precision, 'day');
  assert.equal(result.endOfManufacturerSupport.supportCategory, 'technical_support');
  assert.equal(result.endOfManufacturerSupport.confidence, 'high');
});

test('missing, conflicting, uncited, wrong-model, wrong-region and LOW claims are omitted', () => {
  const cases = [
    null,
    [retail, { ...retail, date: '2023', evidenceExcerpt: 'Retail sales ended in 2023.' }],
    [{ ...retail, sourceUrl: 'https://invented.example/fake' }],
    [{ ...retail, sourceUrl: 'https://www.lg.com/us/support' }],
    [{ ...retail, product: 'LG WM4000HWA' }],
    [{ ...retail, market: 'UK' }],
    [{ ...retail, confidence: 'low' }],
    [{ ...retail, date: '2022-02-30' }],
  ];
  for (const claim of cases) {
    assert.equal(normalizeLifecycleFields({ endOfRetailAvailability: claim }, context).endOfRetailAvailability, null);
  }
  const genericSource = { title: 'LG support', uri: 'https://www.lg.com/us/support' };
  assert.equal(normalizeLifecycleFields({ endOfRetailAvailability: [{ ...retail, sourceUrl: genericSource.uri }] },
    { ...context, sources: [genericSource] }).endOfRetailAvailability, null);
  const wrongRegionSource = { title: 'LG WM3900HWA', uri: 'https://www.lg.com/uk/wm3900hwa/lifecycle' };
  assert.equal(normalizeLifecycleFields({ endOfRetailAvailability: [{ ...retail, sourceUrl: wrongRegionSource.uri }] },
    { ...context, sources: [wrongRegionSource] }).endOfRetailAvailability, null);
  assert.equal(normalizeLifecycleFields({ endOfManufacturerSupport: [{ ...support, confidence: 'low' }] }, context).endOfManufacturerSupport, null);
});

test('production-only and retailer sold-out evidence cannot become retail end', () => {
  for (const evidenceExcerpt of [
    'Production ended in 2022.',
    'Retailer listing sold out in 2022.',
    'This retailer last sold the LG WM3900HWA in the US in 2022.',
    'The model was discontinued in 2022.',
    'Retail sales did not end in 2022.',
  ]) {
    assert.equal(normalizeLifecycleFields({ endOfRetailAvailability: [retail] },
      { ...context, sources: [{ ...source, evidenceText: [`LG WM3900HWA ${evidenceExcerpt}`] }] })
      .endOfRetailAvailability, null);
  }
});

test('a generic support claim or a source list without a claim does not produce a date', () => {
  const result = normalizeLifecycleFields({ endOfManufacturerSupport: [support] },
    { ...context, sources: [{ ...source, evidenceText: ['LG WM3900HWA was discontinued in 2024.'] }] });
  assert.equal(result.endOfManufacturerSupport, null);
  assert.deepEqual(normalizeLifecycleFields({}, context), { endOfRetailAvailability: null, endOfManufacturerSupport: null });
});

test('a real cited URL and fabricated excerpt cannot substitute for source-specific evidence', () => {
  const cases = [
    { evidenceText: [] },
    { evidenceText: ['LG WM3900HWA energy use and dimensions.'] },
    { evidenceText: ['LG WM3900HWA production ended in the US in 2022.'] },
    { evidenceText: ['LG WM4000HWA normal new-product retail sales ended in the US in 2022.'] },
    { evidenceText: ['LG WM3900HWA normal new-product retail sales ended in the UK in 2022.'] },
    { evidenceText: ['LG WM3900HWA product details.'], title: 'LG WM3900HWA retail ended in 2022' },
  ];
  for (const changed of cases) {
    const sources = [{ ...source, ...changed }];
    const normalized = normalizeSmartAgeResult({ brand: 'LG', model: 'WM3900HWA', introductionYear: 2019,
      endOfRetailAvailability: [{ ...retail, evidenceExcerpt: 'Invented US retail end in 2022.' }] },
    { queryInfo, source: 'openai', evidenceSource: 'openai-web', groundedSources: sources, currentYear: 2026 });
    assert.equal(normalized.endOfRetailAvailability, null);
    assert.equal(normalized.introductionYear, 2019);
  }
});

test('a provider-written cached-field shape cannot bypass fresh evidence validation', () => {
  const result = normalizeSmartAgeResult({ brand: 'LG', model: 'WM3900HWA', introductionYear: 2019,
    endOfRetailAvailability: { date: '2022', precision: 'year', confidence: 'medium',
      product: 'LG WM3900HWA', market: 'US', source: { title: source.title, uri: source.uri } } },
  { queryInfo, source: 'openai', evidenceSource: 'openai-web', groundedSources: [source], currentYear: 2026 });
  assert.equal(result.endOfRetailAvailability, null);
  assert.equal(result.introductionYear, 2019);
});

test('day and month precision must match attributed text', () => {
  const dated = { ...support, date: '2024-06-30' };
  for (const evidenceText of [
    'LG WM3900HWA technical support ended June 29, 2024.',
    'LG WM3900HWA technical support ended May 30, 2024.',
    'LG WM3900HWA technical support ended in June 2024.',
  ]) {
    assert.equal(normalizeLifecycleFields({ endOfManufacturerSupport: [dated] },
      { ...context, sources: [{ ...source, evidenceText: [evidenceText] }] }).endOfManufacturerSupport, null);
  }
  const month = { ...support, date: '2024-06' };
  assert.equal(normalizeLifecycleFields({ endOfManufacturerSupport: [month] },
    { ...context, sources: [{ ...source, evidenceText: ['LG WM3900HWA technical support ended on 2024-06-30.'] }] })
    .endOfManufacturerSupport?.date, '2024-06-30');
  assert.equal(normalizeLifecycleFields({ endOfManufacturerSupport: [month] },
    { ...context, sources: [{ ...source, evidenceText: ['LG WM3900HWA technical support ended in June 2024.'] }] })
    .endOfManufacturerSupport?.precision, 'month');
  assert.equal(normalizeLifecycleFields({ endOfManufacturerSupport: [month] },
    { ...context, sources: [{ ...source, evidenceText: ['LG WM3900HWA technical support ended in May 2024.'] }] })
    .endOfManufacturerSupport, null);
});

test('attributed evidence determines full-date, month, or year precision', () => {
  for (const [evidenceText, claimDate, expectedDate, precision] of [
    ['LG WM3900HWA technical support ended June 30, 2024.', '2024', '2024-06-30', 'day'],
    ['LG WM3900HWA technical support ended on 2024-06-30.', '2024-06', '2024-06-30', 'day'],
    ['LG WM3900HWA technical support ended in June 2024.', '2024', '2024-06', 'month'],
    ['LG WM3900HWA technical support ended in 2024.', '2024', '2024', 'year'],
  ]) {
    const result = normalizeLifecycleFields({ endOfManufacturerSupport: [{ ...support, date: claimDate }] },
      { ...context, sources: [{ ...source, evidenceText: [evidenceText] }] }).endOfManufacturerSupport;
    assert.equal(result?.date, expectedDate);
    assert.equal(result?.precision, precision);
    assert.equal(result?.source.uri, source.uri);
    assert.equal(result?.supportCategory, 'technical_support');
  }
});

test('wrong, conflicting, and unsupported evidence dates omit the optional field', () => {
  for (const [evidenceText, claimDate] of [
    ['LG WM3900HWA technical support ended June 29, 2024.', '2024-06-30'],
    ['LG WM3900HWA technical support ended May 2024.', '2024-06'],
    ['LG WM3900HWA technical support ended in 2024.', '2024-06'],
    ['LG WM3900HWA technical support ended June 31, 2024.', '2024'],
    ['LG WM3900HWA technical support ended 06/30/2024.', '2024'],
    ['LG WM3900HWA technical support ended June 30, 2024 or July 1, 2024.', '2024'],
  ]) {
    const result = normalizeLifecycleFields({ endOfManufacturerSupport: [{ ...support, date: claimDate }] },
      { ...context, sources: [{ ...source, evidenceText: [evidenceText] }] });
    assert.equal(result.endOfManufacturerSupport, null, evidenceText);
  }
  const conflicting = { ...source, evidenceText: [
    'LG WM3900HWA technical support ended June 30, 2024.',
    'LG WM3900HWA technical support ended July 1, 2024.',
  ] };
  assert.equal(normalizeLifecycleFields({ endOfManufacturerSupport: [{ ...support, date: '2024' }] },
    { ...context, sources: [conflicting] }).endOfManufacturerSupport, null);
});

test('an end to one support type does not establish an end to another', () => {
  const result = normalizeLifecycleFields({ endOfManufacturerSupport: [support] },
    { ...context, sources: [{ ...source, evidenceText: [
      'LG WM3900HWA software updates ended June 30, 2024. Technical support continues.',
    ] }] });
  assert.equal(result.endOfManufacturerSupport, null);
});

test('Gemini grounding binds a claim span to its one cited chunk', () => {
  const text = 'LG WM3900HWA normal new-product retail sales ended in the US in 2022.';
  const candidate = { groundingMetadata: {
    groundingChunks: [{ web: { uri: source.uri, title: source.title } },
      { web: { uri: 'https://www.lg.com/us/wm3900hwa/specs', title: 'LG specs' } }],
    groundingSupports: [{ segment: { startIndex: 0, endIndex: text.length }, groundingChunkIndices: [0] }],
  } };
  const native = extractGeminiSearchSources(candidate, text);
  assert.deepEqual(native[0].evidenceText, [text]);
  assert.equal(native[1].evidenceText, undefined);
  const legacy = parseGroundingSources(candidate, text).sources;
  assert.deepEqual(legacy[0].evidenceText, [text]);
  assert.equal(legacy[1].evidenceText, undefined);
  const redirect = { title: 'lg.com', domain: 'lg.com',
    uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc', evidenceText: [text] };
  const result = normalizeSmartAgeResult({ brand: 'LG', model: 'WM3900HWA', introductionYear: 2019,
    endOfRetailAvailability: [{ ...retail, sourceUrl: redirect.uri }] },
  { queryInfo, source: 'gemini', evidenceSource: 'gemini-grounded', groundedSources: [redirect], currentYear: 2026 });
  assert.equal(result.endOfRetailAvailability?.date, '2022');
  assert.equal(normalizeSmartAgeResult(result, { queryInfo, source: 'gemini', evidenceSource: 'gemini-grounded',
    lifecycleAlreadyValidated: true,
    groundedSources: [redirect], currentYear: 2026 }).endOfRetailAvailability?.date, '2022');
});

test('OpenAI and xAI use only URL-attributed spans, never general citations', () => {
  const text = 'LG WM3900HWA normal new-product retail sales ended in the US in 2022.';
  const payload = { output: [{ content: [{ text, annotations: [{ type: 'url_citation',
    url: source.uri, title: source.title, start_index: 0, end_index: text.length }] }] }],
  citations: [source.uri] };
  assert.deepEqual(extractOpenAiSources(payload)[0].evidenceText, [text]);
  assert.deepEqual(extractXaiSources(payload)[0].evidenceText, [text]);
  assert.equal(extractOpenAiSources({ output: [{ content: [{ text, annotations: [{ type: 'url_citation', url: source.uri }] }] }] })[0].evidenceText, undefined);
  assert.equal(extractXaiSources({ citations: [source.uri] })[0].evidenceText, undefined);
});

test('introduction-year result is identical with valid, invalid, and absent lifecycle fields', () => {
  const base = { brand: 'LG', model: 'WM3900HWA', introductionYear: 2019, confidence: 'high' };
  const options = { queryInfo, source: 'openai', evidenceSource: 'openai-web', groundedSources: [source], currentYear: 2026 };
  const results = [
    normalizeSmartAgeResult(base, options),
    normalizeSmartAgeResult({ ...base, endOfRetailAvailability: [retail], endOfManufacturerSupport: [support] }, options),
    normalizeSmartAgeResult({ ...base, endOfRetailAvailability: [{ ...retail, sourceUrl: 'https://fake.example' }] }, options),
    normalizeSmartAgeResult({ ...base, endOfManufacturerSupport: [{ ...support, date: '2024-06-29' }] }, options),
  ];
  for (const result of results) {
    assert.equal(result.introductionYear, 2019);
    assert.equal(result.yearContext.value, 2019);
    assert.equal(result.confidence, 'high');
    assert.equal(result.yearSignal, 'year');
  }
  assert.equal(results[1].endOfRetailAvailability.date, '2022');
  assert.equal(results[2].endOfRetailAvailability, null);
  assert.equal(results[3].endOfManufacturerSupport, null);
});

test('accepted fields survive age normalization and cache; legacy cache records remain readable', () => {
  const options = { queryInfo, source: 'openai', evidenceSource: 'openai-web', groundedSources: [source], currentYear: 2026 };
  const result = normalizeSmartAgeResult({
    brand: 'LG', model: 'WM3900HWA', introductionYear: 2019,
    endOfRetailAvailability: [retail], endOfManufacturerSupport: [{ ...support, date: '2024' }],
  }, options);
  assert.equal(result.endOfManufacturerSupport.date, '2024-06-30');
  const secondPass = normalizeSmartAgeResult(result, { ...options, lifecycleAlreadyValidated: true });
  const restored = normalizeCachedSmartAgeResult(prepareResultForCache(secondPass), { queryInfo, currentYear: 2026 });
  assert.equal(restored.endOfRetailAvailability.date, '2022');
  assert.equal(restored.endOfManufacturerSupport.date, '2024-06-30');
  assert.equal(restored.source, 'cache');
  const oldEntry = prepareResultForCache(normalizeSmartAgeResult({ brand: 'LG', model: 'WM3900HWA', introductionYear: 2019 }, options));
  delete oldEntry.endOfRetailAvailability;
  delete oldEntry.endOfManufacturerSupport;
  const legacy = normalizeCachedSmartAgeResult(oldEntry, { queryInfo, currentYear: 2026 });
  assert.equal(legacy.introductionYear, 2019);
  assert.equal(legacy.endOfRetailAvailability, null);
  assert.equal(legacy.endOfManufacturerSupport, null);
});
