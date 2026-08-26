import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  searchModelWithSerper,
  buildModelQuery,
  extractDomain,
  isManufacturerDomain,
  containsPlausibleYear,
} from '../../lib/serper/model-search.js';

function fakeOrganicResponse(overrides = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      organic: [
        {
          position: 1,
          title: 'GE GNE27JYMFS French Door Refrigerator',
          link: 'https://www.geappliances.com/appliance/GE-French-Door-Refrigerator-GNE27JYMFS',
          snippet: 'Released in 2019, this GE refrigerator model GNE27JYMFS...',
          date: '2019-05-01',
        },
      ],
      ...overrides,
    }),
  };
}

test('buildModelQuery constructs an exact-model query with category', () => {
  assert.equal(
    buildModelQuery({ brand: 'GE', model: 'GNE27JYMFS', category: 'refrigerator' }),
    '"GE" "GNE27JYMFS" refrigerator',
  );
});

test('buildModelQuery falls back to "appliance" when category is unknown', () => {
  assert.equal(
    buildModelQuery({ brand: 'Whirlpool', model: 'WMH31017HS12', category: null }),
    '"Whirlpool" "WMH31017HS12" appliance',
  );
});

test('extractDomain strips www and returns lowercase hostname', () => {
  assert.equal(extractDomain('https://WWW.GEAppliances.com/foo'), 'geappliances.com');
});

test('extractDomain returns null for invalid links', () => {
  assert.equal(extractDomain('not a url'), null);
});

test('isManufacturerDomain recognizes allowlisted manufacturer domains only', () => {
  assert.equal(isManufacturerDomain('geappliances.com'), true);
  assert.equal(isManufacturerDomain('products.geappliances.com'), true);
  assert.equal(isManufacturerDomain('www.lg.com'), true);
  assert.equal(isManufacturerDomain('support.whirlpool.com'), true);
  assert.equal(isManufacturerDomain('somegeappliances.com'), false);
  assert.equal(isManufacturerDomain('lgappliances-retailer.example'), false);
  assert.equal(isManufacturerDomain('geapplianceparts.com'), false);
  assert.equal(isManufacturerDomain('bestbuy.com'), false);
  assert.equal(isManufacturerDomain(''), false);
});

test('containsPlausibleYear detects a 4-digit year within range', () => {
  assert.equal(containsPlausibleYear('Released in 2019'), true);
  assert.equal(containsPlausibleYear('Model number ABC1234'), false);
  assert.equal(containsPlausibleYear('Built in 1975'), false); // before MIN_YEAR
  assert.equal(containsPlausibleYear(`Coming in ${new Date().getFullYear() + 5}`), false); // beyond current year
});

test('searchModelWithSerper normalizes model to uppercase and trims whitespace', async () => {
  const fetchImpl = async () => fakeOrganicResponse();
  const result = await searchModelWithSerper(
    { brand: '  GE  ', model: ' gne27jymfs ', category: 'refrigerator' },
    { apiKey: 'test-key', fetchImpl },
  );
  assert.equal(result.model, 'GNE27JYMFS');
  assert.equal(result.brand, 'GE');
  assert.equal(result.query, '"GE" "GNE27JYMFS" refrigerator');
});

test('searchModelWithSerper detects an exact model match in title and snippet', async () => {
  const fetchImpl = async () => fakeOrganicResponse();
  const result = await searchModelWithSerper(
    { brand: 'GE', model: 'GNE27JYMFS', category: 'refrigerator' },
    { apiKey: 'test-key', fetchImpl },
  );
  assert.equal(result.status, 'success');
  assert.equal(result.exactModelFound, true);
  assert.equal(result.exactModelInTitle, true);
  assert.equal(result.manufacturerDomainFound, true);
  assert.equal(result.yearMentionFound, true);
  assert.equal(result.resultCount, 1);
});

test('searchModelWithSerper does not fuzzy-match a different model number', async () => {
  const fetchImpl = async () => fakeOrganicResponse({
    organic: [{
      position: 1,
      title: 'GE GNE25JSKSS Refrigerator',
      link: 'https://www.geappliances.com/some-other-model',
      snippet: 'A completely different model.',
      date: null,
    }],
  });
  const result = await searchModelWithSerper(
    { brand: 'GE', model: 'GNE27JYMFS', category: 'refrigerator' },
    { apiKey: 'test-key', fetchImpl },
  );
  assert.equal(result.exactModelFound, false);
  assert.equal(result.exactModelInTitle, false);
});

test('searchModelWithSerper normalizes separators when matching revision-suffix models', async () => {
  const fetchImpl = async () => fakeOrganicResponse({
    organic: [{
      position: 1,
      title: 'Frigidaire FFTR2045-VS0 Refrigerator Manual',
      link: 'https://www.manualslib.com/manual/frigidaire-fftr2045vs0',
      snippet: 'Manual for the FFTR2045VS0.',
      date: null,
    }],
  });
  const result = await searchModelWithSerper(
    { brand: 'Frigidaire', model: 'FFTR2045VS0', category: 'refrigerator' },
    { apiKey: 'test-key', fetchImpl },
  );
  assert.equal(result.exactModelFound, true);
  assert.equal(result.manufacturerDomainFound, false);
});

test('searchModelWithSerper does not treat retailer or manual-host domains as manufacturer results', async () => {
  const fetchImpl = async () => fakeOrganicResponse({
    organic: [{
      position: 1,
      title: 'GE GNE27JYMFS at Best Buy',
      link: 'https://www.bestbuy.com/site/ge-gne27jymfs',
      snippet: 'Buy the GNE27JYMFS today.',
      date: null,
    }],
  });
  const result = await searchModelWithSerper(
    { brand: 'GE', model: 'GNE27JYMFS', category: 'refrigerator' },
    { apiKey: 'test-key', fetchImpl },
  );
  assert.equal(result.manufacturerDomainFound, false);
});

test('searchModelWithSerper returns invalid_input when brand or model is missing', async () => {
  const result = await searchModelWithSerper({ brand: '', model: 'GNE27JYMFS' }, { apiKey: 'test-key' });
  assert.equal(result.status, 'invalid_input');
  assert.equal(result.errorMessage, 'MISSING_BRAND_OR_MODEL');
});

test('searchModelWithSerper reports provider_error with no key leakage when SERPER_API_KEY is missing', async () => {
  const result = await searchModelWithSerper(
    { brand: 'GE', model: 'GNE27JYMFS' },
    { apiKey: undefined, fetchImpl: async () => { throw new Error('should not be called'); } },
  );
  assert.equal(result.status, 'provider_error');
  assert.equal(result.errorMessage, 'SERPER_API_KEY_MISSING');
});

test('searchModelWithSerper reports timeout status when the request is aborted', async () => {
  const fetchImpl = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      reject(error);
    });
  });
  const result = await searchModelWithSerper(
    { brand: 'GE', model: 'GNE27JYMFS', timeoutMs: 25 },
    { apiKey: 'test-key', fetchImpl },
  );
  assert.equal(result.status, 'timeout');
  assert.equal(result.errorMessage, 'TIMEOUT');
});

test('searchModelWithSerper reports provider_error on non-2xx responses without exposing headers', async () => {
  const fetchImpl = async () => ({ ok: false, status: 500, json: async () => ({}) });
  const result = await searchModelWithSerper(
    { brand: 'GE', model: 'GNE27JYMFS' },
    { apiKey: 'test-key', fetchImpl },
  );
  assert.equal(result.status, 'provider_error');
  assert.equal(result.errorMessage, 'SERPER_HTTP_500');
});

test('searchModelWithSerper normalizes a full Serper response into bounded fields only', async () => {
  const fetchImpl = async () => fakeOrganicResponse();
  const result = await searchModelWithSerper(
    { brand: 'GE', model: 'GNE27JYMFS', category: 'refrigerator' },
    { apiKey: 'test-key', fetchImpl },
  );
  const [first] = result.results;
  assert.deepEqual(Object.keys(first).sort(), ['date', 'domain', 'link', 'position', 'snippet', 'title'].sort());
  assert.equal(first.domain, 'geappliances.com');
});
