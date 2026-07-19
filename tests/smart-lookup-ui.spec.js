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
    // should confirm the backup-source note truthfully -- not the time-based
    // guess shown while waiting.
    await expect(page.locator('#smart-lookup-age-panel')).toContainText('Model introduced');
    await expect(page.locator('#smart-lookup-age-panel')).toContainText('backup data source');
  });

  test('backup-source note does not appear when fallbackUsed is false', async ({ page }) => {
    await page.route('**/api/age-lookup', async (route) => {
      await route.fulfill({ json: { brand: 'Samsung', model: 'QN65Q80A', introductionYear: 2020, fallbackUsed: false } });
    });
    await page.goto('http://localhost:3001/smart-lookup.html');
    await page.locator('#smart-lookup-input').fill('Samsung QN65-Q80A');
    await page.locator('#smartLookupBtn').click();
    await expect(page.locator('#smart-lookup-age-panel')).toContainText('Model introduced');
    await expect(page.locator('#smart-lookup-age-panel')).not.toContainText('backup data source');
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
      await route.fulfill({ json: { errorCode: 'GROQ_MALFORMED_JSON', errorMessage: 'internal stack trace details' } });
    });
    await page.goto('http://localhost:3001/smart-lookup.html');
    await page.locator('#smart-lookup-input').fill('Samsung QN65-Q80A');
    await page.locator('#smartLookupBtn').click();
    await expect(page.locator('#smart-lookup-age-panel')).toContainText('not reliable enough');
    const panelText = await page.locator('#smart-lookup-age-panel').innerText();
    expect(panelText).not.toMatch(/GROQ_MALFORMED_JSON|stack trace|gemini|groq/i);
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
