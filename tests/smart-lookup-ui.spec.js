import { test, expect } from '@playwright/test';

function modelYearContext(value) {
  return {
    value,
    type: 'model-year-family',
    label: 'Model-year family',
    confidence: 'high',
    source: 'local-seed',
    isExactUnitDate: false,
  };
}

function yearContextFixture(query) {
  if (query === 'LG C3 TV' || query === 'LG OLED C3') {
    return {
      brand: 'LG', displayName: 'LG C3 OLED TV', category: 'television', productType: 'television',
      productFamily: 'C3 OLED TV', model: null, exactModel: null,
      status: 'partial-success', outcome: 'product-family-year-context', yearContext: modelYearContext(2023),
      individualManufactureYear: null, manufactureYear: null, needsExactModel: true,
    };
  }
  if (query === 'LG C2 TV') {
    return {
      brand: 'LG', displayName: 'LG C2 OLED TV', category: 'television', productType: 'television',
      productFamily: 'C2 OLED TV', model: null, exactModel: null,
      status: 'partial-success', outcome: 'product-family-year-context', yearContext: modelYearContext(2022),
      individualManufactureYear: null, manufactureYear: null, needsExactModel: true,
    };
  }
  if (query === 'LG OLED65C3PUA') {
    return {
      brand: 'LG', category: 'television', productType: 'television', productFamily: 'C3 OLED TV',
      model: 'OLED65C3PUA', exactModel: 'OLED65C3PUA', screenSize: 65,
      status: 'partial-success', outcome: 'exact-model-year-context', yearContext: modelYearContext(2023),
      individualManufactureYear: null, manufactureYear: null,
    };
  }
  if (query === 'Samsung Q60 Series TV') {
    return {
      brand: 'Samsung', displayName: 'Samsung Q60 Series TV', category: 'television', productType: 'television',
      productFamily: 'Q60 Series', model: null, exactModel: null,
      status: 'partial-success', outcome: 'product-family-year-context',
      individualManufactureYear: null, manufactureYear: null, needsExactModel: true,
      yearContext: {
        startYear: 2019, endYear: 2024, type: 'production-range', label: 'Model-year variants',
        confidence: 'high', source: 'local-seed', isExactUnitDate: false,
      },
      yearVariants: [
        { name: 'Q60R / Q60RA', year: 2019 }, { name: 'Q60T', year: 2020 }, { name: 'Q60A', year: 2021 },
        { name: 'Q60B', year: 2022 }, { name: 'Q60C', year: 2023 }, { name: 'Q60D', year: 2024 },
      ],
    };
  }
  if (query === 'Samsung Q60A 65 inch TV') {
    return {
      brand: 'Samsung', displayName: 'Samsung Q60A TV', category: 'television', productType: 'television',
      productFamily: 'Q60A', model: null, exactModel: null, screenSize: 65,
      status: 'partial-success', outcome: 'product-family-year-context', yearContext: modelYearContext(2021),
      individualManufactureYear: null, manufactureYear: null, needsExactModel: true,
    };
  }
  return null;
}

async function mockYearContextAgeLookup(page) {
  const interceptedQueries = [];
  await page.unroute('**/api/age-lookup');
  await page.route('**/api/age-lookup*', async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    if (request.method() !== 'POST' || requestUrl.pathname !== '/api/age-lookup') {
      throw new Error(`Unexpected Smart Lookup age request: ${request.method()} ${request.url()}`);
    }
    const body = request.postDataJSON();
    const fixture = yearContextFixture(body?.query);
    if (!fixture) throw new Error(`No Smart Lookup age fixture for query: ${body?.query || '(missing query)'}`);
    interceptedQueries.push(body.query);
    await route.fulfill({ json: fixture });
  });
  return interceptedQueries;
}

test.describe('Smart Lookup controller', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/age-lookup', async (route) => {
      await route.fulfill({ json: { brand: 'Samsung', model: 'QN65Q80A', introductionYear: 2020, productionRange: { start: 2021, end: 2021 }, notes: 'Model data only.', evidence: [{ detail: 'Fixture evidence' }] } });
    });
    await page.route('**/api/lkq-lookup', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      await route.fulfill({ json: { itemSummary: { brand: 'Samsung', model: 'QN65Q80A' }, replacementOptions: [{ name: 'Samsung Q80C', model: 'QN65Q80C', lkqRating: 'MATCH', priceRange: 'Unavailable - unverified', notes: 'Fixture replacement.' }] } });
    });
  });

  test('age renders before replacements and uses semantic date labels', async ({ page }) => {
    await page.goto('http://localhost:3001/index.html?mode=smart#panel-smart');
    await page.locator('#include-replacement-comparisons').check();
    await page.locator('#smart-lookup-input').fill('Samsung QN65-Q80A');
    await Promise.all([
      page.waitForResponse((response) => response.url().includes('/api/age-lookup') && response.request().method() === 'POST'),
      page.locator('[data-smart-lookup-submit="1"]').click(),
    ]);
    const agePanel = page.locator('#smart-lookup-age-panel');
    await expect(agePanel.locator('.smart-year-context-label')).toHaveText('Model introduced');
    await expect(agePanel).toContainText('Known production/availability');
    await expect(agePanel).toContainText('Individual manufacture date requires serial number');
    await expect(agePanel).not.toContainText('midpoint');
    await expect(page.locator('#smart-lookup-replacement-panel')).toContainText('Samsung Q80C');
  });

  test('replacement failure preserves age and retry control', async ({ page }) => {
    await page.route('**/api/lkq-lookup', async (route) => route.fulfill({ status: 502, json: { error: 'down' } }));
    await page.goto('http://localhost:3001/smart-lookup.html');
    await page.locator('#include-replacement-comparisons').check();
    await page.locator('#smart-lookup-input').fill('Samsung QN65-Q80A');
    await page.locator('#smartLookupBtn').click();
    await expect(page.locator('#smart-lookup-age-panel')).toContainText('Model introduced');
    await expect(page.locator('[data-smart-lookup-retry="replacement"]')).toBeVisible();
  });

  test('empty submission shows validation feedback and makes no API calls', async ({ page }) => {
    let apiCalls = 0;
    await page.route('**/api/age-lookup', async (route) => {
      apiCalls += 1;
      await route.fulfill({ json: {} });
    });
    await page.route('**/api/lkq-lookup', async (route) => {
      apiCalls += 1;
      await route.fulfill({ json: {} });
    });
    await page.goto('http://localhost:3001/smart-lookup.html');
    await page.locator('#smart-lookup-input').fill('   ');
    await page.locator('#smartLookupBtn').click();
    await expect(page.locator('#smart-lookup-age-panel')).toContainText('More details needed');
    await expect(page.locator('#smart-lookup-age-panel')).toContainText('Try adding the brand, model number, category, or serial number');
    await expect(page.locator('#smart-lookup-input')).toBeFocused();
    expect(apiCalls).toBe(0);
  });

  test('dedicated page sends normalized notes as a separate request field', async ({ page }) => {
    const ageBodies = [];
    const replacementBodies = [];
    await page.route('**/api/age-lookup', async (route) => {
      ageBodies.push(route.request().postDataJSON());
      await route.fulfill({ json: { brand: 'Samsung', model: 'QN65Q80A', introductionYear: 2020 } });
    });
    await page.route('**/api/lkq-lookup', async (route) => {
      replacementBodies.push(route.request().postDataJSON());
      await route.fulfill({ json: { itemSummary: { brand: 'Samsung', model: 'QN65Q80A' }, replacementOptions: [{ name: 'Samsung Q80C', model: 'QN65Q80C', lkqRating: 'MATCH' }] } });
    });
    await page.goto('http://localhost:3001/smart-lookup.html');
    await page.locator('#include-replacement-comparisons').check();
    await page.locator('#smart-lookup-input').fill('Samsung QN65-Q80A');
    await page.locator('#lookup-notes').fill('  Label says\nparts were replaced   ');
    await page.locator('#smartLookupBtn').click();
    await expect(page.locator('#smart-lookup-age-panel')).toContainText('Model introduced');
    expect(ageBodies).toEqual([{ query: 'Samsung QN65-Q80A', notes: 'Label says parts were replaced' }]);
    expect(replacementBodies).toEqual([{ query: 'Samsung QN65-Q80A', notes: 'Label says parts were replaced' }]);
  });

  test('age result stays visible while a slow grounded LKQ lookup is still loading', async ({ page }) => {
    await page.route('**/api/lkq-lookup', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      await route.fulfill({ json: {
        itemSummary: { brand: 'Samsung', model: 'QN65Q80A' },
        replacementRelationship: 'direct-successor',
        replacement: { name: 'Samsung QN65Q80C', brand: 'Samsung', model: 'QN65Q80C', category: 'television' },
        evidenceSource: 'manufacturer-grounded',
        sources: [{ title: 'samsung.com', domain: 'samsung.com', uri: 'https://vertexaisearch.cloud.google.com/x' }],
        priceObservations: [],
      } });
    });
    await page.goto('http://localhost:3001/smart-lookup.html');
    await page.locator('#include-replacement-comparisons').check();
    await page.locator('#smart-lookup-input').fill('Samsung QN65-Q80A');
    await page.locator('#smartLookupBtn').click();
    await expect(page.locator('#smart-lookup-age-panel')).toContainText('Model introduced');
    await expect(page.locator('#smart-lookup-replacement-panel')).toContainText('Checking replacement guidance');
    await expect(page.locator('#smart-lookup-age-panel')).toContainText('Model introduced');
  });

  test('grounded LKQ success renders relationship, compatibility, pricing, and sources independently of age', async ({ page }) => {
    await page.route('**/api/lkq-lookup', async (route) => {
      await route.fulfill({ json: {
        itemSummary: { brand: 'Samsung', model: 'QN65Q80A', category: 'television' },
        replacementRelationship: 'direct-successor',
        replacementRationale: 'Samsung lists the QN65Q80C as the current-year successor.',
        replacement: { name: 'Samsung QN65Q80C', brand: 'Samsung', model: 'QN65Q80C', category: 'television' },
        materialDifferences: ['Newer processor generation'],
        compatibilityStatus: 'likely-compatible',
        compatibilityWarnings: [],
        evidenceSource: 'manufacturer-grounded',
        retrievedAt: '2026-07-19T12:00:00.000Z',
        sources: [{ title: 'samsung.com', domain: 'samsung.com', uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/a' }],
        priceObservations: [
          { seller: 'Best Buy', price: 1299.99, currency: 'USD', priceType: 'regular', condition: 'new', stockStatus: 'in-stock' },
          { seller: 'Samsung.com', price: 1349.99, currency: 'USD', priceType: 'regular', condition: 'new', stockStatus: 'in-stock' },
        ],
        replacementCostRange: { low: 1299.99, high: 1349.99, currency: 'USD', basis: 'multiple-observations' },
      } });
    });
    await page.goto('http://localhost:3001/smart-lookup.html');
    await page.locator('#include-replacement-comparisons').check();
    await page.locator('#smart-lookup-input').fill('Samsung QN65-Q80A');
    await page.locator('#smartLookupBtn').click();
    const panel = page.locator('#smart-lookup-replacement-panel');
    await expect(panel).toContainText('Direct manufacturer successor');
    await expect(panel).toContainText('Grounded in live Google Search results retrieved 2026-07-19');
    await expect(panel).toContainText('Samsung QN65Q80C');
    await expect(panel).toContainText('Newer processor generation');
    await expect(panel).toContainText('Compatibility: Likely compatible');
    await expect(panel).toContainText('Best Buy: $1299.99');
    await expect(panel).toContainText('Replacement-cost guidance:');
    await expect(panel).toContainText('$1299.99');
    await expect(panel).toContainText('Sources consulted');
    await expect(panel).toContainText('samsung.com');
    const sourceLink = panel.locator('.smart-lookup-sources a').first();
    await expect(sourceLink).toHaveAttribute('rel', 'noopener nofollow');
  });

  test('a compatibility caveat and a not-directly-compatible result both render their warnings', async ({ page }) => {
    await page.route('**/api/lkq-lookup', async (route) => {
      await route.fulfill({ json: {
        itemSummary: { brand: 'Samsung', model: 'QN65Q80A', category: 'television' },
        replacementRelationship: 'similar-alternative',
        replacement: { name: 'Samsung QN65Q70C', brand: 'Samsung', model: 'QN65Q70C', category: 'television' },
        compatibilityStatus: 'not-directly-compatible',
        compatibilityWarnings: ['Different panel technology than the original unit'],
        evidenceSource: 'retailer-grounded',
        sources: [{ title: 'bestbuy.com', domain: 'bestbuy.com', uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/b' }],
        priceObservations: [],
      } });
    });
    await page.goto('http://localhost:3001/smart-lookup.html');
    await page.locator('#include-replacement-comparisons').check();
    await page.locator('#smart-lookup-input').fill('Samsung QN65-Q80A');
    await page.locator('#smartLookupBtn').click();
    const panel = page.locator('#smart-lookup-replacement-panel');
    await expect(panel).toContainText('Compatibility: Not directly compatible');
    await expect(panel).toContainText('Different panel technology than the original unit');
  });

  test('a single retailer price observation never renders as a market range', async ({ page }) => {
    await page.route('**/api/lkq-lookup', async (route) => {
      await route.fulfill({ json: {
        itemSummary: { brand: 'Samsung', model: 'QN65Q80A', category: 'television' },
        replacementRelationship: 'functional-equivalent',
        replacement: { name: 'Samsung QN65Q80C', brand: 'Samsung', model: 'QN65Q80C', category: 'television' },
        compatibilityStatus: 'likely-compatible',
        evidenceSource: 'retailer-grounded',
        sources: [{ title: 'bestbuy.com', domain: 'bestbuy.com', uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/c' }],
        priceObservations: [{ seller: 'Best Buy', price: 1299.99, currency: 'USD', priceType: 'regular', condition: 'new', stockStatus: 'in-stock' }],
        replacementCostRange: null,
      } });
    });
    await page.goto('http://localhost:3001/smart-lookup.html');
    await page.locator('#include-replacement-comparisons').check();
    await page.locator('#smart-lookup-input').fill('Samsung QN65-Q80A');
    await page.locator('#smartLookupBtn').click();
    const panel = page.locator('#smart-lookup-replacement-panel');
    await expect(panel).toContainText('Best Buy: $1299.99');
    await expect(panel).not.toContainText('Replacement-cost guidance');
  });

  test('an ungrounded LKQ timeout-fallback result shows the estimate wording without a source list', async ({ page }) => {
    await page.route('**/api/lkq-lookup', async (route) => {
      await route.fulfill({ json: {
        itemSummary: { brand: 'Samsung', model: 'QN65Q80A', category: 'television' },
        replacementRelationship: 'functional-equivalent',
        replacement: { name: 'Samsung QN65Q80C', brand: 'Samsung', model: 'QN65Q80C', category: 'television' },
        compatibilityStatus: 'unknown',
        evidenceSource: 'gemini-ungrounded',
        groundedFallback: true,
        sources: [],
        priceObservations: [],
      } });
    });
    await page.goto('http://localhost:3001/smart-lookup.html');
    await page.locator('#include-replacement-comparisons').check();
    await page.locator('#smart-lookup-input').fill('Samsung QN65-Q80A');
    await page.locator('#smartLookupBtn').click();
    const panel = page.locator('#smart-lookup-replacement-panel');
    await expect(panel).toContainText('AI-assisted replacement research completed, but live web verification timed out.');
    await expect(panel).not.toContainText('Sources consulted');
    await expect(panel).not.toContainText('Grounded in live Google Search');
  });

  test('a genuine LKQ timeout with no recovered replacement does not erase the age result', async ({ page }) => {
    await page.route('**/api/lkq-lookup', async (route) => {
      await route.fulfill({ json: { errorCode: 'PROVIDER_TIMEOUT', replacementOptions: [], replacementRelationship: 'none-found' } });
    });
    await page.goto('http://localhost:3001/smart-lookup.html');
    await page.locator('#include-replacement-comparisons').check();
    await page.locator('#smart-lookup-input').fill('Samsung QN65-Q80A');
    await page.locator('#smartLookupBtn').click();
    await expect(page.locator('#smart-lookup-age-panel')).toContainText('Model introduced');
    await expect(page.locator('[data-smart-lookup-retry="replacement"]')).toBeVisible();
  });

  test('no raw provider payload leaks into the LKQ panel', async ({ page }) => {
    await page.route('**/api/lkq-lookup', async (route) => {
      await route.fulfill({ json: {
        itemSummary: { brand: 'Samsung', model: 'QN65Q80A', category: 'television' },
        replacementRelationship: 'direct-successor',
        replacement: { name: 'Samsung QN65Q80C', brand: 'Samsung', model: 'QN65Q80C', category: 'television' },
        compatibilityStatus: 'likely-compatible',
        evidenceSource: 'manufacturer-grounded',
        sources: [{ title: 'samsung.com', domain: 'samsung.com', uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/d' }],
        priceObservations: [],
        __groundedFallbackRecovered: true,
        rawProviderDebug: 'internal-only-debug-string',
      } });
    });
    await page.goto('http://localhost:3001/smart-lookup.html');
    await page.locator('#include-replacement-comparisons').check();
    await page.locator('#smart-lookup-input').fill('Samsung QN65-Q80A');
    await page.locator('#smartLookupBtn').click();
    const panel = page.locator('#smart-lookup-replacement-panel');
    await expect(panel).toContainText('Direct manufacturer successor');
    await expect(panel).not.toContainText('rawProviderDebug');
    await expect(panel).not.toContainText('internal-only-debug-string');
    await expect(panel).not.toContainText('__groundedFallbackRecovered');
  });

  test('grounded LKQ rendering remains usable at mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.route('**/api/lkq-lookup', async (route) => {
      await route.fulfill({ json: {
        itemSummary: { brand: 'Samsung', model: 'QN65Q80A', category: 'television' },
        replacementRelationship: 'direct-successor',
        replacement: { name: 'Samsung QN65Q80C', brand: 'Samsung', model: 'QN65Q80C', category: 'television' },
        compatibilityStatus: 'compatible-with-caveats',
        compatibilityWarnings: ['Slightly larger cabinet depth'],
        evidenceSource: 'manufacturer-grounded',
        sources: [{ title: 'samsung.com', domain: 'samsung.com', uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/e' }],
        priceObservations: [{ seller: 'Best Buy', price: 1299.99, currency: 'USD', priceType: 'regular', condition: 'new', stockStatus: 'in-stock' }],
      } });
    });
    await page.goto('http://localhost:3001/smart-lookup.html');
    await page.locator('#include-replacement-comparisons').check();
    await page.locator('#smart-lookup-input').fill('Samsung QN65-Q80A');
    await page.locator('#smartLookupBtn').click();
    const panel = page.locator('#smart-lookup-replacement-panel');
    await expect(panel).toContainText('Direct manufacturer successor');
    await expect(panel).toContainText('Compatibility: Compatible with caveats');
    var box = await panel.boundingBox();
    expect(box.width).toBeLessThanOrEqual(375);
  });

  test('submit button is disabled and busy during active lookup, then restores after success and error', async ({ page }) => {
    let ageCalls = 0;
    await page.route('**/api/age-lookup', async (route) => {
      ageCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 200));
      await route.fulfill({ json: { brand: 'Samsung', model: 'QN65Q80A', introductionYear: 2020 } });
    });
    await page.goto('http://localhost:3001/smart-lookup.html');
    const input = page.locator('#smart-lookup-input');
    const submit = page.locator('#smartLookupBtn');
    await input.fill('Samsung QN65-Q80A');
    await submit.click();
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveAttribute('aria-busy', 'true');
    await input.press('Enter');
    await expect(page.locator('#smart-lookup-age-panel')).toContainText('Model introduced');
    await expect(submit).toBeEnabled();
    await expect(submit).toHaveAttribute('aria-busy', 'false');
    expect(ageCalls).toBe(1);

    await page.route('**/api/age-lookup', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 75));
      await route.fulfill({ status: 502, json: { error: 'down' } });
    });
    await input.fill('Samsung QN65-Q80A error');
    await submit.click();
    await expect(submit).toBeDisabled();
    await expect(page.locator('#smart-lookup-age-panel')).toContainText('Lookup unavailable');
    await expect(submit).toBeEnabled();
  });

  test('double-click and Enter/click deduplicate requests', async ({ page }) => {
    const ageQueries = [];
    await page.route('**/api/age-lookup', async (route) => {
      const body = route.request().postDataJSON();
      ageQueries.push(body.query);
      // Keep the request in flight long enough for both browser events to
      // exercise the controller's real deduplication path.
      await new Promise((resolve) => setTimeout(resolve, 75));
      await route.fulfill({ json: { brand: 'Samsung', model: body.query, introductionYear: 2020 } });
    });
    await page.goto('http://localhost:3001/index.html?mode=smart#panel-smart');
    const input = page.locator('#smart-lookup-input');
    const submit = page.locator('[data-smart-lookup-submit="1"]');
    const agePanel = page.locator('#smart-lookup-age-panel');
    const queryA = 'Samsung QN65-Q80A';
    const queryB = 'Samsung QN65-Q80A second';

    await input.fill(queryA);
    await submit.dblclick();
    await expect(agePanel).toContainText(queryA);
    await expect.poll(() => ageQueries.filter((query) => query === queryA).length).toBe(1);

    // Start a genuinely independent submission only after Query A has
    // visibly settled. Enter and click are two events for this one attempt.
    await input.fill(queryB);
    await input.press('Enter');
    await submit.click();
    await expect(agePanel).toContainText(queryB);
    await expect.poll(() => ageQueries.filter((query) => query === queryB).length).toBe(1);
    expect(ageQueries).toEqual([queryA, queryB]);
  });

  test('stale result rejection keeps latest query', async ({ page }) => {
    await page.route('**/api/age-lookup', async (route) => {
      const body = route.request().postDataJSON();
      if (body.query.includes('old')) await new Promise((resolve) => setTimeout(resolve, 100));
      await route.fulfill({ json: { brand: 'Samsung', model: body.query, introductionYear: body.query.includes('new') ? 2022 : 2010 } });
    });
    await page.goto('http://localhost:3001/smart-lookup.html');
    await page.locator('#smart-lookup-input').fill('old model 123');
    await page.locator('#smartLookupBtn').click();
    await page.locator('#smart-lookup-input').fill('new model 123');
    await page.locator('#smartLookupBtn').click();
    await expect(page.locator('#smart-lookup-age-panel')).toContainText('2022');
    await expect(page.locator('#smart-lookup-age-panel')).not.toContainText('2010');
  });

  test('mobile has no unexpected console or page errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://localhost:3001/smart-lookup.html');
    await page.locator('#smart-lookup-input').fill('Samsung QN65-Q80A');
    await page.locator('#smartLookupBtn').click();
    await expect(page.locator('#smart-lookup-age-panel')).toContainText('Model introduced');
    expect(errors).toEqual([]);
  });

  test('loading message appears immediately on submit', async ({ page }) => {
    await page.route('**/api/age-lookup', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fulfill({ json: { brand: 'Samsung', model: 'QN65Q80A', introductionYear: 2020 } });
    });
    await page.goto('http://localhost:3001/smart-lookup.html');
    await page.locator('#smart-lookup-input').fill('Samsung QN65-Q80A');
    await page.locator('#smartLookupBtn').click();
    await expect(page.locator('#smart-lookup-age-panel')).toContainText('Checking known model and serial data');
  });

  test('progressive message advances while the provider is still working', async ({ page }) => {
    await page.route('**/api/age-lookup', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 4000));
      await route.fulfill({ json: { brand: 'Samsung', model: 'QN65Q80A', introductionYear: 2020, fallbackUsed: true } });
    });
    await page.goto('http://localhost:3001/smart-lookup.html');
    await page.locator('#smart-lookup-input').fill('Samsung QN65-Q80A');
    await page.locator('#smartLookupBtn').click();
    await expect(page.locator('#smart-lookup-age-panel')).toContainText('Checking known model and serial data');
    await expect(page.locator('#smart-lookup-age-panel')).toContainText('Searching trusted model evidence', { timeout: 2000 });
    await expect(page.locator('#smart-lookup-age-panel')).toContainText('checking a backup source', { timeout: 3000 });
    // Once the response actually arrives, the real fallbackUsed metadata
    // should confirm the backup-provider note truthfully -- not the time-based
    // guess shown while waiting.
    await expect(page.locator('#smart-lookup-age-panel')).toContainText('Model introduced');
    await expect(page.locator('#smart-lookup-age-panel')).toContainText('backup provider');
  });

  test('backup-source note does not appear when fallbackUsed is false', async ({ page }) => {
    await page.route('**/api/age-lookup', async (route) => {
      await route.fulfill({ json: { brand: 'Samsung', model: 'QN65Q80A', introductionYear: 2020, fallbackUsed: false } });
    });
    await page.goto('http://localhost:3001/smart-lookup.html');
    await page.locator('#smart-lookup-input').fill('Samsung QN65-Q80A');
    await page.locator('#smartLookupBtn').click();
    await expect(page.locator('#smart-lookup-age-panel')).toContainText('Model introduced');
    await expect(page.locator('#smart-lookup-age-panel')).not.toContainText('backup provider');
  });

  test('timeout response renders timeout-specific no-result copy', async ({ page }) => {
    await page.route('**/api/age-lookup', async (route) => {
      await route.fulfill({ json: { errorCode: 'PROVIDER_TIMEOUT', notes: 'Smart Lookup could not establish a defensible model introduction or production range.' } });
    });
    await page.goto('http://localhost:3001/smart-lookup.html');
    await page.locator('#smart-lookup-input').fill('Samsung QN65-Q80A');
    await page.locator('#smartLookupBtn').click();
    await expect(page.locator('#smart-lookup-age-panel')).toContainText('Taking longer than expected');
    await expect(page.locator('#smart-lookup-age-panel')).toContainText('Try this next');
    await expect(page.locator('#smart-lookup-age-panel')).not.toContainText('PROVIDER_TIMEOUT');
  });

  test('malformed provider output renders reliability-specific copy, not a raw error', async ({ page }) => {
    await page.route('**/api/age-lookup', async (route) => {
      await route.fulfill({ json: { errorCode: 'UNRELATED_BRAND' } });
    });
    await page.goto('http://localhost:3001/smart-lookup.html');
    await page.locator('#smart-lookup-input').fill('Samsung QN65-Q80A');
    await page.locator('#smartLookupBtn').click();
    await expect(page.locator('#smart-lookup-age-panel')).toContainText('not reliable enough');
    await expect(page.locator('#smart-lookup-age-panel')).not.toContainText('UNRELATED_BRAND');
  });

  test('global budget exhaustion renders retryable capacity copy without raw internal details', async ({ page }) => {
    await page.route('**/api/age-lookup', async (route) => {
      await route.fulfill({ json: { errorCode: 'GLOBAL_BUDGET_EXHAUSTED', notes: 'Smart Lookup provider capacity is temporarily limited. Please try again tomorrow.' } });
    });
    await page.goto('http://localhost:3001/smart-lookup.html');
    await page.locator('#smart-lookup-input').fill('Samsung QN65-Q80A');
    await page.locator('#smartLookupBtn').click();
    const panel = page.locator('#smart-lookup-age-panel');
    await expect(panel).toContainText('Smart Lookup provider capacity is temporarily limited');
    await expect(panel).toContainText('Try this next');
    const panelText = await panel.innerText();
    expect(panelText).not.toMatch(/GLOBAL_BUDGET_EXHAUSTED|quota|redis|upstash|gemini|groq/i);
  });

  test('Redis unavailable capacity response is user-friendly and retryable', async ({ page }) => {
    await page.route('**/api/age-lookup', async (route) => {
      await route.fulfill({ json: { errorCode: 'BUDGET_STORE_UNAVAILABLE', notes: 'Smart Lookup provider capacity is temporarily limited. Please try again tomorrow.' } });
    });
    await page.goto('http://localhost:3001/smart-lookup.html');
    await page.locator('#smart-lookup-input').fill('Samsung QN65-Q80A');
    await page.locator('#smartLookupBtn').click();
    const panel = page.locator('#smart-lookup-age-panel');
    await expect(panel).toContainText('Lookup unavailable');
    await expect(panel).toContainText('try again tomorrow');
    await expect(panel).not.toContainText('BUDGET_STORE_UNAVAILABLE');
  });

  test('ungrounded provider success is labeled as AI-assisted analysis, not live research', async ({ page }) => {
    await page.route('**/api/age-lookup', async (route) => {
      await route.fulfill({ json: {
        source: 'gemini',
        evidenceSource: 'gemini-ungrounded',
        brand: 'Samsung',
        model: 'QN65Q80A',
        introductionYear: 2020,
        evidence: [{ detail: 'Model pattern knowledge' }],
      } });
    });
    await page.goto('http://localhost:3001/smart-lookup.html');
    await page.locator('#smart-lookup-input').fill('Samsung QN65-Q80A');
    await page.locator('#smartLookupBtn').click();
    const panel = page.locator('#smart-lookup-age-panel');
    await expect(panel).toContainText('AI-assisted analysis based on the information entered');
    await expect(panel).toContainText('no live manufacturer source was verified');
    await expect(panel).toContainText('Analysis basis');
    await expect(panel).not.toContainText('Evidence used');
  });

  test('grounded provider success renders retrieval qualifier and cited web sources', async ({ page }) => {
    await page.route('**/api/age-lookup', async (route) => {
      await route.fulfill({ json: {
        source: 'gemini',
        evidenceSource: 'gemini-grounded',
        brand: 'LG',
        model: 'WM3900HWA',
        introductionYear: 2019,
        retrievedAt: '2026-07-19T12:00:00.000Z',
        evidence: [{ detail: 'Listed on the manufacturer product page.' }],
        sources: [
          { title: 'lg.com', domain: 'lg.com', uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/a' },
          { title: 'energystar.gov', domain: 'energystar.gov', uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/b' },
        ],
      } });
    });
    await page.goto('http://localhost:3001/smart-lookup.html');
    await page.locator('#smart-lookup-input').fill('LG WM3900HWA');
    await page.locator('#smartLookupBtn').click();
    const panel = page.locator('#smart-lookup-age-panel');
    await expect(panel).toContainText('AI research grounded in live web search results retrieved 2026-07-19');
    await expect(panel).toContainText('Web sources consulted');
    await expect(panel).toContainText('lg.com');
    await expect(panel).toContainText('energystar.gov');
    await expect(panel).not.toContainText('no live manufacturer source was verified');
    const sourceLink = panel.locator('.smart-lookup-sources a').first();
    await expect(sourceLink).toHaveAttribute('rel', 'noopener nofollow');
  });

  test('grounded response without sources falls back to ungrounded wording', async ({ page }) => {
    await page.route('**/api/age-lookup', async (route) => {
      await route.fulfill({ json: {
        source: 'gemini',
        evidenceSource: 'gemini-grounded',
        brand: 'LG',
        model: 'WM3900HWA',
        introductionYear: 2019,
        sources: [],
      } });
    });
    await page.goto('http://localhost:3001/smart-lookup.html');
    await page.locator('#smart-lookup-input').fill('LG WM3900HWA');
    await page.locator('#smartLookupBtn').click();
    const panel = page.locator('#smart-lookup-age-panel');
    await expect(panel).toContainText('AI-assisted analysis');
    await expect(panel).not.toContainText('Web sources consulted');
  });

  test('grounded-timeout fallback renders the estimate wording without any grounded claim or source links', async ({ page }) => {
    await page.route('**/api/age-lookup', async (route) => {
      await route.fulfill({ json: {
        source: 'gemini',
        evidenceSource: 'gemini-ungrounded',
        groundedFallback: true,
        brand: 'LG',
        model: 'WM3900HWA',
        introductionYear: 2019,
        retrievedAt: null,
        sources: [],
        evidence: [{ detail: 'Model pattern knowledge.' }],
      } });
    });
    await page.goto('http://localhost:3001/smart-lookup.html');
    await page.locator('#smart-lookup-input').fill('LG WM3900HWA');
    await page.locator('#smartLookupBtn').click();
    const panel = page.locator('#smart-lookup-age-panel');
    await expect(panel).toContainText('AI-assisted model research completed, but live web verification timed out.');
    await expect(panel).toContainText('Review this as an estimate rather than a source-verified finding.');
    await expect(panel).not.toContainText('grounded in live Google Search');
    await expect(panel).not.toContainText('Web sources consulted');
    await expect(panel).not.toContainText('no live manufacturer source was verified');
    await expect(panel.locator('.smart-lookup-sources')).toHaveCount(0);
    await expect(panel.locator('a[href*="vertexaisearch"]')).toHaveCount(0);
  });

  test('grounded-timeout fallback via xAI still renders the estimate wording, not the generic AI-assisted phrasing', async ({ page }) => {
    await page.route('**/api/age-lookup', async (route) => {
      await route.fulfill({ json: {
        source: 'xai',
        evidenceSource: 'xai-ungrounded',
        groundedFallback: true,
        fallbackUsed: true,
        brand: 'LG',
        model: 'WM3900HWA',
        introductionYear: 2019,
        sources: [],
      } });
    });
    await page.goto('http://localhost:3001/smart-lookup.html');
    await page.locator('#smart-lookup-input').fill('LG WM3900HWA');
    await page.locator('#smartLookupBtn').click();
    const panel = page.locator('#smart-lookup-age-panel');
    await expect(panel).toContainText('AI-assisted model research completed, but live web verification timed out.');
    await expect(panel).not.toContainText('xAI Grok AI-assisted analysis based on the information entered');
  });

  test('a genuine grounded timeout with no recoverable fallback still renders the existing timeout-only copy', async ({ page }) => {
    await page.route('**/api/age-lookup', async (route) => {
      await route.fulfill({ json: {
        errorCode: 'PROVIDER_TIMEOUT',
        evidenceSource: 'none',
        groundedFallback: false,
        brand: 'LG',
        model: 'WM3900HWA',
      } });
    });
    await page.goto('http://localhost:3001/smart-lookup.html');
    await page.locator('#smart-lookup-input').fill('LG WM3900HWA');
    await page.locator('#smartLookupBtn').click();
    const panel = page.locator('#smart-lookup-age-panel');
    await expect(panel).toContainText('Taking longer than expected');
    await expect(panel).not.toContainText('AI-assisted model research completed');
  });

  test('existing successful grounded rendering is unaffected by the timeout-fallback wording addition', async ({ page }) => {
    await page.route('**/api/age-lookup', async (route) => {
      await route.fulfill({ json: {
        source: 'gemini',
        evidenceSource: 'gemini-grounded',
        groundedFallback: false,
        brand: 'LG',
        model: 'WM3900HWA',
        introductionYear: 2019,
        retrievedAt: '2026-07-19T12:00:00.000Z',
        sources: [
          { title: 'lg.com', domain: 'lg.com', uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/a' },
        ],
      } });
    });
    await page.goto('http://localhost:3001/smart-lookup.html');
    await page.locator('#smart-lookup-input').fill('LG WM3900HWA');
    await page.locator('#smartLookupBtn').click();
    const panel = page.locator('#smart-lookup-age-panel');
    await expect(panel).toContainText('AI research grounded in live web search results retrieved 2026-07-19');
    await expect(panel).toContainText('Web sources consulted');
    await expect(panel).not.toContainText('live web verification timed out');
  });

  test('replacement unavailable copy does not claim a verified replacement, and age still renders', async ({ page }) => {
    await page.route('**/api/lkq-lookup', async (route) => {
      await route.fulfill({ json: { errorCode: 'PROVIDER_TIMEOUT', replacementOptions: [] } });
    });
    await page.goto('http://localhost:3001/smart-lookup.html');
    await page.locator('#include-replacement-comparisons').check();
    await page.locator('#smart-lookup-input').fill('Samsung QN65-Q80A');
    await page.locator('#smartLookupBtn').click();
    await expect(page.locator('#smart-lookup-age-panel')).toContainText('Model introduced');
    await expect(page.locator('#smart-lookup-replacement-panel')).toContainText('Replacement match unavailable');
    await expect(page.locator('#smart-lookup-replacement-panel')).toContainText('Try adding the full model number');
    await expect(page.locator('[data-smart-lookup-retry="replacement"]')).toBeVisible();
  });

  test('form input is not reset after a failure, and Edit your search refocuses it', async ({ page }) => {
    await page.route('**/api/age-lookup', async (route) => {
      await route.fulfill({ json: { errorCode: 'PROVIDER_TIMEOUT' } });
    });
    await page.goto('http://localhost:3001/smart-lookup.html');
    await page.locator('#smart-lookup-input').fill('Samsung QN65-Q80A');
    await page.locator('#smartLookupBtn').click();
    await expect(page.locator('#smart-lookup-age-panel')).toContainText('Taking longer than expected');
    await expect(page.locator('#smart-lookup-input')).toHaveValue('Samsung QN65-Q80A');
    await page.locator('[data-smart-lookup-edit="1"]').click();
    await expect(page.locator('#smart-lookup-input')).toBeFocused();
    await expect(page.locator('#smart-lookup-input')).toHaveValue('Samsung QN65-Q80A');
  });

  test('no raw error/provider details are rendered in the DOM on failure', async ({ page }) => {
    await page.route('**/api/age-lookup', async (route) => {
      await route.fulfill({ json: { errorCode: 'XAI_SCHEMA_INVALID', errorMessage: 'internal stack trace details' } });
    });
    await page.goto('http://localhost:3001/smart-lookup.html');
    await page.locator('#smart-lookup-input').fill('Samsung QN65-Q80A');
    await page.locator('#smartLookupBtn').click();
    await expect(page.locator('#smart-lookup-age-panel')).toContainText('not reliable enough');
    const panelText = await page.locator('#smart-lookup-age-panel').innerText();
    expect(panelText).not.toMatch(/XAI_SCHEMA_INVALID|stack trace|gemini|xai|grok/i);
  });

  test('detected serial renders a prefilled handoff to the deterministic decoder', async ({ page }) => {
    await page.route('**/api/age-lookup', async (route) => {
      await route.fulfill({ json: {
        brand: 'GE',
        model: 'GFW850SPN0DG',
        introductionYear: 2019,
        individualManufactureYear: null,
        serialDetected: { token: 'FR31424IN', action: 'use-decoder' },
      } });
    });
    await page.goto('http://localhost:3001/smart-lookup.html');
    await page.locator('#smart-lookup-input').fill('serial FR31424IN model GFW850SPN0DG');
    await page.locator('#smartLookupBtn').click();

    const panel = page.locator('#smart-lookup-age-panel');
    await expect(panel).toContainText('Serial number detected');
    await expect(panel).toContainText('Use the Serial Number Decoder for unit-specific manufacture-date decoding.');
    await expect(panel.getByRole('link', { name: 'Open Serial Number Decoder' })).toHaveAttribute(
      'href',
      '/index.html?serial=FR31424IN#decoder-tool'
    );
    await expect(panel).not.toContainText('serial has been decoded');
  });

  test('LG C3 and C2 family searches render prominent model-year context from the mocked API', async ({ page }) => {
    const interceptedQueries = await mockYearContextAgeLookup(page);
    await page.goto('http://localhost:3001/smart-lookup.html');
    for (const [query, year, heading] of [['LG C3 TV', '2023', 'LG C3 OLED TV'], ['LG OLED C3', '2023', 'LG C3 OLED TV'], ['LG C2 TV', '2022', 'LG C2 OLED TV']]) {
      await page.locator('#smart-lookup-input').fill(query);
      await page.locator('#smartLookupBtn').click();
      const panel = page.locator('#smart-lookup-age-panel');
      await expect(panel).toContainText(heading);
      await expect(panel.locator('.smart-year-context-value')).toHaveText(year);
      await expect(panel).toContainText('Model-year family');
      await expect(panel).toContainText('Exact model');
      await expect(panel).toContainText('Not provided');
      await expect(panel).toContainText('Not available without serial or exact unit evidence');
      await expect(panel).not.toContainText('Brand needed');
      await expect(panel).not.toContainText('Serial numbers are brand-specific');
      await expect(panel).not.toContainText('Lookup unavailable');
      await expect(panel).not.toContainText('manufacture year is 2023');
      await expect.poll(() => interceptedQueries.filter((value) => value === query).length, {
        message: `Expected the /api/age-lookup mock to intercept ${query}`,
      }).toBe(1);
    }
  });

  test('exact LG OLED and Samsung Q60 family variants render year context correctly', async ({ page }) => {
    const interceptedQueries = await mockYearContextAgeLookup(page);
    await page.goto('http://localhost:3001/smart-lookup.html');
    await page.locator('#smart-lookup-input').fill('LG OLED65C3PUA');
    await page.locator('#smartLookupBtn').click();
    const panel = page.locator('#smart-lookup-age-panel');
    await expect(panel).toContainText('LG OLED65C3PUA');
    await expect(panel.locator('.smart-year-context-value')).toHaveText('2023');
    await expect(panel).toContainText('Model-year family');
    await expect(panel).toContainText('Screen size');
    await expect(panel).toContainText('65 inches');
    await expect(panel).toContainText('Not available without serial or exact unit evidence');
    await expect(panel).not.toContainText('manufacture year is 2023');
    await expect.poll(() => interceptedQueries.filter((value) => value === 'LG OLED65C3PUA').length, {
      message: 'Expected the /api/age-lookup mock to intercept LG OLED65C3PUA',
    }).toBe(1);

    await page.locator('#smart-lookup-input').fill('Samsung Q60 Series TV');
    await page.locator('#smartLookupBtn').click();
    await expect(panel).toContainText('Samsung Q60 Series TV');
    await expect(panel.locator('.smart-year-context-value')).toHaveText('2019–2024');
    await expect(panel).toContainText('Q60R / Q60RA: 2019 model-year family');
    await expect(panel).toContainText('Q60D: 2024 model-year family');
    await expect(panel).not.toContainText('Brand needed');
    await expect(panel).not.toContainText('Serial numbers are brand-specific');
    await expect.poll(() => interceptedQueries.filter((value) => value === 'Samsung Q60 Series TV').length, {
      message: 'Expected the /api/age-lookup mock to intercept Samsung Q60 Series TV',
    }).toBe(1);

    await page.locator('#smart-lookup-input').fill('Samsung Q60A 65 inch TV');
    await page.locator('#smartLookupBtn').click();
    await expect(panel.locator('.smart-year-context-value')).toHaveText('2021');
    await expect(panel).toContainText('Model-year family');
    await expect(panel).not.toContainText('manufacture year is 2021');
    await expect.poll(() => interceptedQueries.filter((value) => value === 'Samsung Q60A 65 inch TV').length, {
      message: 'Expected the /api/age-lookup mock to intercept Samsung Q60A 65 inch TV',
    }).toBe(1);
  });
});
