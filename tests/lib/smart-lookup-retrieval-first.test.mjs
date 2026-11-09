import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLiteralSearch, canonicalIdentifier, containsIdentifier, parseRetrievalQuery,
  retrievalFirstLookup, scoreResults, synthesizeFromEvidence, validateSynthesis,
} from '../../lib/smart-lookup/retrieval-first.js';

const row = (title, domain, snippet = title) => ({ title, snippet, url: `https://${domain}/product`, date: null });
const fixtures = [
  { query: 'mvwx655dw1', brand: 'Maytag', code: 'MVWX655DW1', type: 'washer', rows: [
    row('Maytag MVWX655DW1 top load washer', 'maytag.com', 'Official Maytag MVWX655DW1 washer support and manual'),
    row('Maytag MVWX-655-DW1 washer parts', 'repairclinic.com', 'Replacement parts for Maytag MVWX655DW1 washer'),
  ] },
  { query: 'RUNHOOD EB324', brand: 'Runhood', code: 'EB324', type: 'battery module', rows: [
    row('Runhood EB324 Energy Bar battery module', 'runhoodpower.com', 'Runhood EB-324 modular lithium-ion battery module'),
    row('Runhood Energy Bar EB324 battery', 'batterystore.example', 'Runhood EB324 modular battery'),
  ] },
  { query: 'Ametek 46e 78570r', brand: 'Ametek', code: '78570R', type: 'vacuum motor', rows: [
    row('Ametek Lamb 46E 78570R vacuum motor', 'motors.example', 'Ametek 46E 78570R motor assembly'),
    row('Ametek 78570R vacuum motor assembly', 'parts.example', '46E 78570R Ametek vacuum motor'),
  ] },
];

function synthesis(fixture, overrides = {}) {
  return { identified: true, brand: fixture.brand, model: fixture.code, exactModel: fixture.code,
    originalIdentifier: fixture.code, identifierType: fixture.query.startsWith('Ametek') ? 'part-number' : 'model',
    productType: fixture.type, likelyProduct: `${fixture.brand} ${fixture.code} ${fixture.type}`,
    description: `${fixture.brand} ${fixture.type}`, identityConfidence: 'high', identityBasis: 'Matching independent results',
    estimatedIntroductionYear: null, introductionYearConfidence: 'unknown', introductionYearReason: null,
    introductionYearEvidence: null, productionRange: null, needsMoreDetail: false,
    refinementSuggestion: null, ...overrides };
}

test('literal queries keep the user identifiers and never add a generic category', () => {
  assert.equal(buildLiteralSearch(parseRetrievalQuery('mvwx655dw1')), '"mvwx655dw1"');
  assert.equal(buildLiteralSearch(parseRetrievalQuery('RUNHOOD EB324')), 'RUNHOOD "EB324"');
  assert.equal(buildLiteralSearch(parseRetrievalQuery('Ametek 46e 78570r')), 'Ametek 46e "78570r"');
});

test('canonical identifier comparison accepts separators and rejects longer variants', () => {
  assert.equal(canonicalIdentifier('MVWX-655/DW1'), 'MVWX655DW1');
  assert.equal(containsIdentifier('Maytag MVWX-655-DW1 washer', 'mvwx655dw1'), true);
  assert.equal(containsIdentifier('Maytag MVWX655DW10 washer', 'mvwx655dw1'), false);
});

for (const fixture of fixtures) {
  test(`${fixture.query}: retrieval and yearless synthesis identify the product`, async () => {
    let searches = 0;
    const report = await retrievalFirstLookup(fixture.query, {
      live: true,
      searchImpl: async () => { searches += 1; return fixture.rows; },
      synthesisImpl: async () => ({ ok: true, result: synthesis(fixture), requestCount: 1, usage: { inputTokens: 100, outputTokens: 50 } }),
    });
    assert.equal(searches, 1);
    assert.equal(report.serperRequestCount, 1);
    assert.equal(report.secondarySearchQuery, null);
    assert.equal(report.geminiRequestCount, 1);
    assert.equal(report.independentMatchingDomains, 2);
    assert.equal(report.retrievalQuality, 'STRONG');
    assert.equal(report.validation.accepted, true);
    assert.equal(report.finalRetrievalFirstResult.introductionYear, null);
    assert.equal(report.finalRetrievalFirstResult.dateConfidence, 'unknown');
  });
}

test('unsupported and unrelated model codes are rejected even when AI returns JSON', () => {
  const fixture = fixtures[0];
  const parsed = parseRetrievalQuery(fixture.query);
  const scored = scoreResults(parsed, fixture.rows);
  const unrelated = validateSynthesis(parsed, scored, synthesis(fixture, { model: 'MVWX655DW2' }));
  assert.equal(unrelated.accepted, false);
  assert.equal(unrelated.reason, 'IDENTIFIER_CHANGED');
  const hidden = validateSynthesis(parsed, scored, synthesis(fixture, { exactModel: 'UNRELATED123' }));
  assert.equal(hidden.accepted, false);
  assert.equal(hidden.reason, 'IDENTIFIER_CHANGED');
  const description = validateSynthesis(parsed, scored, synthesis(fixture, { likelyProduct: 'Maytag XYZ123 washer' }));
  assert.equal(description.accepted, false);
  assert.equal(description.reason, 'UNSUPPORTED_DESCRIPTIVE_CODE');
});

test('exact identifiers survive normalized model and product display names', () => {
  for (const [query, brand, code, type, model, exactModel] of [
    ['mvwx655dw1', 'Maytag', 'MVWX655DW1', 'washer', 'mvwx 655 dw1', 'MVWX655DW1'],
    ['Samsung UN55NU7100', 'Samsung', 'UN55NU7100', 'television', 'Samsung UN55-NU7100', 'UN55NU7100'],
    ['Samsung UN55NU7100', 'Samsung', 'UN55NU7100', 'television', 'SamsungUN55NU7100', 'UN55NU7100'],
    ['RUNHOOD EB324', 'Runhood', 'EB324', 'battery module', 'RUNHOOD EB324 Energy Bar', 'EB324'],
    ['ASUS C301SA', 'ASUS', 'C301SA', 'chromebook', 'ASUS Chromebook C301SA', 'C301SA'],
  ]) {
    const fixture = { query, brand, code, type };
    const parsed = parseRetrievalQuery(query);
    const scored = scoreResults(parsed, [row(`${brand} ${code} ${type}`, 'manufacturer.example'),
      row(`${brand} ${code} ${type} support`, 'support.example')]);
    const validated = validateSynthesis(parsed, scored, synthesis(fixture, { model, exactModel }));
    assert.equal(validated.accepted, true, `${query}: ${validated.reason}`);
  }
});

test('genuine exact-model substitutions are rejected', () => {
  for (const [query, brand, code, substitute, type] of [
    ['Samsung UN55NU7100', 'Samsung', 'UN55NU7100', 'UN55TU7000', 'television'],
    ['MVWX655DW1', 'Maytag', 'MVWX655DW1', 'MVWX655DW0', 'washer'],
    ['RUNHOOD EB324', 'Runhood', 'EB324', 'EB325', 'battery module'],
  ]) {
    const fixture = { query, brand, code, type };
    const parsed = parseRetrievalQuery(query);
    const scored = scoreResults(parsed, [row(`${brand} ${code} ${type}`, 'manufacturer.example')]);
    const validated = validateSynthesis(parsed, scored, synthesis(fixture, { model: substitute, exactModel: substitute }));
    assert.equal(validated.reason, 'IDENTIFIER_CHANGED', query);
  }
});

test('year without a retrieved citation is removed without rejecting a supported identity', () => {
  const fixture = fixtures[0];
  const validated = validateSynthesis(parseRetrievalQuery(fixture.query),
    scoreResults(parseRetrievalQuery(fixture.query), fixture.rows),
    synthesis(fixture, { estimatedIntroductionYear: 2018, introductionYearConfidence: 'high',
      introductionYearReason: 'Uncited estimate', productionRange: '2018-2020' }));
  assert.equal(validated.accepted, true);
  assert.equal(validated.result.introductionYear, null);
  assert.equal(validated.result.productionRange, null);
  assert.equal(validated.result.dateConfidence, 'unknown');
});

test('MVWX655DW1 accepts Gemini medium-confidence estimate from dated exact-model evidence', () => {
  const fixture = fixtures[0];
  const rows = [row('Maytag MVWX655DW1 washer technical documentation', 'maytag.com',
    'Maytag/Whirlpool technical documentation for MVWX655DW1 dated May 2016'), ...fixture.rows];
  const parsed = parseRetrievalQuery(fixture.query);
  const result = validateSynthesis(parsed, scoreResults(parsed, rows), synthesis(fixture, {
    estimatedIntroductionYear: 2016, introductionYearConfidence: 'medium',
    introductionYearReason: 'Exact-model dated evidence places this washer in the market by 2016.',
    introductionYearEvidence: { description: 'Maytag MVWX655DW1 dated evidence', sourceUrl: 'https://maytag.com/product' },
  })).result;
  assert.equal(result.brand, 'Maytag');
  assert.equal(result.productType, 'washer');
  assert.equal(result.estimatedIntroductionYear, 2016);
  assert.equal(result.introductionYearConfidence, 'medium');
  assert.match(result.introductionYearReason, /2016/);
  assert.doesNotMatch(result.introductionYearEvidence.description, /manufactured in 2016/i);
});

test('MVWX655DW1 accepts a knowledge-based estimate with exact-model corroboration but no snippet year', () => {
  const fixture = fixtures[0];
  const parsed = parseRetrievalQuery(fixture.query);
  const validated = validateSynthesis(parsed, scoreResults(parsed, fixture.rows), synthesis(fixture, {
    estimatedIntroductionYear: 2016, introductionYearConfidence: 'medium',
    introductionYearReason: "The model's known mid-2010s market position and retrieved exact-model evidence support a 2016 estimate.",
    introductionYearEvidence: { description: 'Retrieved exact-model support', sourceUrl: 'https://maytag.com/product' },
  }));
  assert.equal(validated.accepted, true);
  assert.equal(validated.result.exactModel, 'MVWX655DW1');
  assert.equal(validated.result.estimatedIntroductionYear, 2016);
  assert.equal(validated.result.introductionYearConfidence, 'medium');
  assert.match(validated.result.introductionYearReason, /2016 estimate/);
  assert.equal(validated.result.introductionYearEvidence.sourceUrl, 'https://maytag.com/product');
});

test('weak identity can still return an unknown introduction year', () => {
  const fixture = fixtures[0];
  const parsed = parseRetrievalQuery(fixture.query);
  const scored = scoreResults(parsed, [row('MVWX655DW1', 'unknown.example')]);
  const validated = validateSynthesis(parsed, scored, synthesis(fixture, { brand: null, identityConfidence: 'low' }));
  assert.equal(scored.retrievalQuality, 'WEAK');
  assert.equal(validated.accepted, true);
  assert.equal(validated.result.estimatedIntroductionYear, null);
  assert.equal(validated.result.introductionYearConfidence, 'unknown');
});

test('explicit manufacturer launch supports Gemini high confidence', () => {
  const fixture = fixtures[0];
  const parsed = parseRetrievalQuery(fixture.query);
  const rows = [
    row('Maytag MVWX655DW1 washer launch', 'maytag.com', 'Maytag MVWX655DW1 washer launched in 2016'),
    row('Maytag MVWX655DW1 washer technical manual', 'parts.example', 'Maytag MVWX655DW1 manual dated May 2017'),
  ];
  const result = validateSynthesis(parsed, scoreResults(parsed, rows), synthesis(fixture, {
    estimatedIntroductionYear: 2016, introductionYearConfidence: 'high',
    introductionYearReason: 'Manufacturer states this exact model launched in 2016.',
    introductionYearEvidence: { description: 'Manufacturer launch statement', sourceUrl: 'https://maytag.com/product' },
  })).result;
  assert.equal(result.estimatedIntroductionYear, 2016);
  assert.equal(result.introductionYearConfidence, 'high');
});

test('multiple dated exact-model sources support a Gemini estimate', () => {
  const fixture = fixtures[0];
  const parsed = parseRetrievalQuery(fixture.query);
  const rows = [
    row('Maytag MVWX655DW1 washer service manual', 'repairclinic.com', 'Maytag MVWX655DW1 service manual dated June 2018'),
    row('Maytag MVWX655DW1 washer technical bulletin', 'parts.example', 'Maytag MVWX655DW1 technical bulletin dated May 2016'),
  ];
  const result = validateSynthesis(parsed, scoreResults(parsed, rows), synthesis(fixture, {
    estimatedIntroductionYear: 2016, introductionYearConfidence: 'medium',
    introductionYearReason: 'The 2016 bulletin predates a 2018 exact-model manual.',
    introductionYearEvidence: { description: '2016 exact-model bulletin', sourceUrl: 'https://parts.example/product' },
  })).result;
  assert.equal(result.estimatedIntroductionYear, 2016);
  assert.equal(result.introductionYearConfidence, 'medium');
});

test('Gemini can cite the earlier of two exact-model documents', () => {
  const fixture = fixtures[0];
  const parsed = parseRetrievalQuery(fixture.query);
  const rows = [
    row('Maytag MVWX655DW1 washer manual', 'maytag.com', 'Maytag MVWX655DW1 manual dated May 2018'),
    row('Maytag MVWX655DW1 washer service bulletin', 'parts.example', 'Maytag MVWX655DW1 service bulletin dated May 2016'),
  ];
  const result = validateSynthesis(parsed, scoreResults(parsed, rows), synthesis(fixture, {
    estimatedIntroductionYear: 2016, introductionYearConfidence: 'medium',
    introductionYearReason: 'A 2016 service bulletin places this model in use by then.',
    introductionYearEvidence: { description: '2016 service bulletin', sourceUrl: 'https://parts.example/product' },
  })).result;
  assert.equal(result.estimatedIntroductionYear, 2016);
  assert.equal(result.introductionYearConfidence, 'medium');
});

for (const [name, rows] of [
  ['generic brand and family page', [row('Maytag washer family', 'maytag.com', 'Maytag washers introduced in 2016'), ...fixtures[0].rows]],
  ['unrelated model date', [row('Maytag MVWX655DW2 washer manual', 'maytag.com', 'Maytag MVWX655DW2 manual dated May 2016'), ...fixtures[0].rows]],
  ['page footer date', [row('Maytag MVWX655DW1 washer manual', 'maytag.com', 'Maytag MVWX655DW1 manual copyright 2016'), ...fixtures[0].rows]],
  ['page update date', [row('Maytag MVWX655DW1 washer manual', 'maytag.com', 'Maytag MVWX655DW1 manual last updated May 2016'), ...fixtures[0].rows]],
  ['no credible date', fixtures[0].rows],
]) {
  test(`${name} cannot date the exact model, but identity still succeeds`, () => {
    const fixture = fixtures[0];
    const parsed = parseRetrievalQuery(fixture.query);
    const validated = validateSynthesis(parsed, scoreResults(parsed, rows), synthesis(fixture));
    assert.equal(validated.accepted, true);
    assert.equal(validated.result.estimatedIntroductionYear, null);
    assert.equal(validated.result.introductionYearConfidence, 'unknown');
  });
}

test('one credible exact-model listing allows a low-confidence estimate without date keywords', () => {
  const fixture = fixtures[0];
  const parsed = parseRetrievalQuery(fixture.query);
  const rows = [row('Maytag MVWX655DW1 top load washer, 2016 listing', 'retailer.example')];
  const result = validateSynthesis(parsed, scoreResults(parsed, rows), synthesis(fixture, {
    estimatedIntroductionYear: 2016, introductionYearConfidence: 'low',
    introductionYearReason: 'A dated exact-model retailer listing places it in the market by 2016.',
    introductionYearEvidence: { description: '2016 exact-model listing', sourceUrl: 'https://retailer.example/product' },
  })).result;
  assert.equal(result.estimatedIntroductionYear, 2016);
  assert.equal(result.introductionYearConfidence, 'low');
});

for (const [name, year, url] of [
  ['future year', new Date().getFullYear() + 1, 'https://maytag.com/product'],
  ['impossible year', 1800, 'https://maytag.com/product'],
  ['unretrieved URL', 2016, 'https://invented.example/product'],
  ['unrelated model URL', 2016, 'https://other.example/product'],
]) {
  test(`${name} cannot become a model introduction estimate`, () => {
    const fixture = fixtures[0];
    const parsed = parseRetrievalQuery(fixture.query);
    const rows = [...fixture.rows, row('Maytag MVWX655DW2 washer 2016', 'other.example')];
    const validated = validateSynthesis(parsed, scoreResults(parsed, rows), synthesis(fixture, {
      estimatedIntroductionYear: year, introductionYearConfidence: 'medium',
      introductionYearReason: 'A claimed estimate.',
      introductionYearEvidence: { description: 'Claimed support', sourceUrl: url },
    }));
    assert.equal(validated.accepted, true);
    assert.equal(validated.result.estimatedIntroductionYear, null);
    assert.equal(validated.result.introductionYearConfidence, 'unknown');
  });
}

test('a different model in the cited title cannot support the exact-model estimate', () => {
  const fixture = fixtures[0];
  const parsed = parseRetrievalQuery(fixture.query);
  const rows = [
    ...fixture.rows,
    row('Maytag MVWX655DW2 washer listing', 'other.example', 'Maytag MVWX655DW1 may also appear here in 2016'),
  ];
  const result = validateSynthesis(parsed, scoreResults(parsed, rows), synthesis(fixture, {
    estimatedIntroductionYear: 2016, introductionYearConfidence: 'low',
    introductionYearReason: 'Claimed 2016 listing.',
    introductionYearEvidence: { description: 'Listing', sourceUrl: 'https://other.example/product' },
  })).result;
  assert.equal(result.estimatedIntroductionYear, null);
});

test('ambiguous bare numeric identifier cannot become an asserted product', async () => {
  const report = await retrievalFirstLookup('0011579166', { live: true,
    searchImpl: async () => [
      row('0011579166 refrigerator part', 'parts.example'),
      row('0011579166 bicycle part', 'cycles.example'),
    ],
    synthesisImpl: async () => ({ ok: true, requestCount: 1, result: synthesis(fixtures[0], {
      model: '0011579166', exactModel: '0011579166', originalIdentifier: '0011579166',
    }) }),
  });
  assert.equal(report.retrievalQuality, 'WEAK');
  assert.equal(report.validation.reason, 'AMBIGUOUS_BARE_NUMERIC_IDENTIFIER');
  assert.equal(report.finalRetrievalFirstResult, null);
});

test('dry mode performs no searches or synthesis', async () => {
  const report = await retrievalFirstLookup('RUNHOOD EB324', { live: false, searchImpl: () => { throw Error('search called'); },
    synthesisImpl: () => { throw Error('synthesis called'); } });
  assert.equal(report.failureReason, 'DRY_RUN');
  assert.equal(report.serperRequestCount, 0);
  assert.equal(report.geminiRequestCount, 0);
});

test('Gemini synthesis request contains supplied evidence and no search tools', async () => {
  let request;
  let endpoint;
  const result = await synthesizeFromEvidence({ originalQuery: 'RUNHOOD EB324', topResults: [] }, {
    apiKey: 'test', env: {}, fetchImpl: async (url, options) => {
      endpoint = url;
      request = JSON.parse(options.body);
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"identified":false}' }] } }] }) };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.requestCount, 1);
  assert.equal(result.model, 'gemini-3.5-flash-lite');
  assert.equal(endpoint, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
  assert.equal(Object.hasOwn(request, 'tools'), false);
  assert.equal(request.contents[0].parts[0].text.includes('RUNHOOD EB324'), true);
  assert.match(request.contents[0].parts[0].text, /Your primary objective is to identify the model and provide the best reasonable estimate/);
  assert.match(request.contents[0].parts[0].text, /Use both the retrieved evidence below and your own general product knowledge/);
});

test('Gemini synthesis uses the configured retrieval model', async () => {
  let endpoint;
  const result = await synthesizeFromEvidence({}, {
    apiKey: 'test', env: { SMART_LOOKUP_RETRIEVAL_GEMINI_MODEL: 'gemini-test-model' },
    fetchImpl: async (url) => {
      endpoint = url;
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }) };
    },
  });
  assert.equal(result.model, 'gemini-test-model');
  assert.equal(endpoint, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model:generateContent');
});

test('Gemini 404 reports sanitized diagnostics and makes one request', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: false, status: 404, json: async () => ({ error: {
      code: 404, status: 'NOT_FOUND', message: 'secret prompt and API key', details: ['private'],
    } }) };
  };
  const report = await retrievalFirstLookup('RUNHOOD EB324', {
    live: true, searchImpl: async () => fixtures[1].rows, geminiApiKey: 'secret-key', geminiFetchImpl: fetchImpl,
  });
  assert.equal(calls, 1);
  assert.equal(report.geminiRequestCount, 1);
  assert.equal(report.failureReason, 'GEMINI_HTTP_404');
  assert.deepEqual(report.geminiDiagnostics, {
    httpStatus: 404, providerErrorCode: 404, providerErrorStatus: 'NOT_FOUND',
    model: 'gemini-3.5-flash-lite', apiVersion: 'v1beta',
  });
  assert.equal(JSON.stringify(report.geminiDiagnostics).includes('secret'), false);
});

test('Serper transport preserves provider position and date for retrieval-first', async () => {
  let request;
  const report = await retrievalFirstLookup('RUNHOOD EB324', { live: true, serperApiKey: 'test',
    serperFetchImpl: async (_url, options) => {
      request = JSON.parse(options.body);
      return { ok: true, body: null, text: async () => JSON.stringify({ organic: [{
        position: 4, title: 'Runhood EB324 battery', snippet: 'Runhood EB324 battery module',
        link: 'https://runhoodpower.com/battery', date: '3 months ago',
      }] }) };
    },
    synthesisImpl: async () => ({ ok: true, result: synthesis(fixtures[1]), requestCount: 1 }),
  });
  assert.equal(request.q, 'RUNHOOD "EB324"');
  assert.equal(request.num, 8);
  assert.equal(report.rawNormalizedTopResults[0].position, 4);
  assert.equal(report.rawNormalizedTopResults[0].date, '3 months ago');
  assert.equal(report.serperRequestCount, 1);
});

test('Serper timeout defaults to 5000 ms and accepts a bounded env override', async (t) => {
  const delays = [];
  const originalSetTimeout = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (callback, delay, ...args) => {
    delays.push(delay);
    return originalSetTimeout(callback, delay, ...args);
  });
  for (const [env, expected] of [
    [{}, 5000],
    [{ SMART_LOOKUP_RETRIEVAL_SERPER_TIMEOUT_MS: '7000' }, 7000],
    [{ SMART_LOOKUP_RETRIEVAL_SERPER_TIMEOUT_MS: '100' }, 1000],
    [{ SMART_LOOKUP_RETRIEVAL_SERPER_TIMEOUT_MS: '20000' }, 10000],
    [{ SMART_LOOKUP_RETRIEVAL_SERPER_TIMEOUT_MS: 'invalid' }, 5000],
  ]) {
    const report = await retrievalFirstLookup('RUNHOOD EB324', {
      live: true, env, serperApiKey: 'test',
      serperFetchImpl: async () => ({ ok: true, body: null, text: async () => '{"organic":[]}' }),
    });
    assert.equal(delays.at(-1), expected);
    assert.equal(report.serperRequestCount, 1);
  }
});

test('Serper timeout reports SERPER_TIMEOUT without retry or synthesis', async () => {
  let requests = 0;
  let syntheses = 0;
  const report = await retrievalFirstLookup('RUNHOOD EB324', {
    live: true, env: { SMART_LOOKUP_RETRIEVAL_SERPER_TIMEOUT_MS: '1000' }, serperApiKey: 'test',
    serperFetchImpl: async (_url, { signal }) => {
      requests += 1;
      return new Promise((_resolve, reject) => signal.addEventListener('abort',
        () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
    },
    synthesisImpl: async () => { syntheses += 1; throw Error('unexpected synthesis'); },
  });
  assert.equal(report.failureReason, 'SERPER_TIMEOUT');
  assert.equal(requests, 1);
  assert.equal(report.serperRequestCount, 1);
  assert.equal(syntheses, 0);
  assert.equal(report.geminiRequestCount, 0);
});

const familyRows = [
  row('Ametek 46E vacuum motor', 'motors.example', 'Ametek 46E vacuum motor assembly'),
  row('Ametek 46E vacuum motor replacement', 'parts.example', 'Ametek 46E vacuum motor parts'),
];
const partialAmetek = {
  identified: true, brand: 'Ametek', model: null, exactModel: null, originalIdentifier: '78570R',
  identifierType: 'unknown', productType: 'Vacuum Motor', likelyProduct: 'Ametek 46E vacuum motor',
  description: 'Ametek 46E vacuum motor family', identityConfidence: 'high', identityBasis: 'Two independent 46E motor results; 78570R unresolved',
  introductionYear: null, productionRange: null, dateConfidence: 'unknown', needsMoreDetail: true,
  refinementSuggestion: 'Provide a full label photo or additional part number.',
};

test('empty primary runs one deterministic secondary search and accepts supported family only', async () => {
  const queries = [];
  let syntheses = 0;
  const report = await retrievalFirstLookup('Ametek 46e 78570r', { live: true,
    searchImpl: async (query) => { queries.push(query); return queries.length === 1 ? [] : familyRows; },
    synthesisImpl: async (evidence) => {
      syntheses += 1;
      assert.deepEqual(evidence.supportedIdentifiers, ['46e']);
      assert.deepEqual(evidence.unsupportedIdentifiers, ['78570r']);
      assert.equal(evidence.topResults[0].searchStage, 'secondary');
      return { ok: true, result: partialAmetek, requestCount: 1 };
    },
  });
  assert.deepEqual(queries, ['Ametek 46e "78570r"', '"Ametek" "46e"']);
  assert.equal(report.serperRequestCount, 2);
  assert.equal(syntheses, 1);
  assert.equal(report.primaryRetrievalQuality, 'EMPTY');
  assert.equal(report.secondaryRetrievalQuality, 'STRONG');
  assert.equal(report.combinedRetrievalQuality, 'MODERATE');
  assert.deepEqual(report.supportedIdentifiers, ['46e']);
  assert.deepEqual(report.unsupportedIdentifiers, ['78570r']);
  assert.equal(report.relaxedIdentifier, '78570R');
  assert.equal(report.finalRetrievalFirstResult.identityConfidence, 'medium');
  assert.equal(report.finalRetrievalFirstResult.model, null);
});

test('weak primary without exact identifier allows secondary search', async () => {
  const queries = [];
  const report = await retrievalFirstLookup('Ametek 46e 78570r', { live: true,
    searchImpl: async (query) => { queries.push(query); return queries.length === 1
      ? [row('Ametek motor catalog', 'catalog.example')] : familyRows; },
    synthesisImpl: async () => ({ ok: true, result: partialAmetek, requestCount: 1 }),
  });
  assert.equal(report.primaryRetrievalQuality, 'WEAK');
  assert.equal(report.serperRequestCount, 2);
  assert.equal(report.finalRetrievalFirstResult.identityConfidence, 'medium');
});

test('secondary search with no results skips synthesis and stops at two Serper calls', async () => {
  let searches = 0;
  let syntheses = 0;
  const report = await retrievalFirstLookup('Ametek 46e 78570r', { live: true,
    searchImpl: async () => { searches += 1; return []; },
    synthesisImpl: async () => { syntheses += 1; throw Error('unexpected synthesis'); },
  });
  assert.equal(searches, 2);
  assert.equal(syntheses, 0);
  assert.equal(report.geminiRequestCount, 0);
  assert.equal(report.failureReason, 'NO_SEARCH_RESULTS');
  assert.equal(report.combinedRetrievalQuality, 'EMPTY');
});

test('a secondary transport failure is not retried', async () => {
  let searches = 0;
  const report = await retrievalFirstLookup('Ametek 46e 78570r', { live: true,
    searchImpl: async () => { searches += 1; if (searches === 1) return []; throw Error('SERPER_TIMEOUT'); },
    synthesisImpl: async () => { throw Error('unexpected synthesis'); },
  });
  assert.equal(searches, 2);
  assert.equal(report.serperRequestCount, 2);
  assert.equal(report.geminiRequestCount, 0);
  assert.equal(report.failureReason, 'SERPER_TIMEOUT');
});

test('unsupported original identifier cannot become an exact model or product association', async () => {
  for (const override of [
    { model: '78570R' }, { exactModel: '78570R' }, { identifierType: 'part-number' },
    { likelyProduct: 'Ametek 78570R vacuum motor' },
    { identityBasis: '78570R identifies the Ametek 46E vacuum motor' },
  ]) {
    const report = await retrievalFirstLookup('Ametek 46e 78570r', { live: true,
      searchImpl: async (query) => query.includes('78570r') ? [] : familyRows,
      synthesisImpl: async () => ({ ok: true, result: { ...partialAmetek, ...override }, requestCount: 1 }),
    });
    assert.equal(report.serperRequestCount, 2);
    assert.equal(report.validation.accepted, false);
    assert.equal(report.finalRetrievalFirstResult, null);
  }
});
