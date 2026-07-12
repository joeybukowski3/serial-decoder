import { test, expect } from '@playwright/test';

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
    await page.locator('[data-smart-lookup-submit="1"]').click();
    await expect(page.locator('#smart-lookup-age-panel')).toContainText('Model introduced');
    await expect(page.locator('#smart-lookup-age-panel')).toContainText('Known production/availability');
    await expect(page.locator('#smart-lookup-age-panel')).toContainText('Individual manufacture date requires serial number');
    await expect(page.locator('#smart-lookup-age-panel')).not.toContainText('midpoint');
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

  test('double-click and Enter/click deduplicate requests', async ({ page }) => {
    let ageCalls = 0;
    await page.route('**/api/age-lookup', async (route) => { ageCalls += 1; await route.fulfill({ json: { brand: 'Samsung', model: 'QN65Q80A', introductionYear: 2020 } }); });
    await page.goto('http://localhost:3001/index.html?mode=smart#panel-smart');
    await page.locator('#smart-lookup-input').fill('Samsung QN65-Q80A');
    await Promise.all([page.locator('[data-smart-lookup-submit="1"]').click(), page.locator('[data-smart-lookup-submit="1"]').click()]);
    await expect.poll(() => ageCalls).toBe(1);
    await page.locator('#smart-lookup-input').fill('Samsung QN65-Q80A second');
    await Promise.all([page.locator('#smart-lookup-input').press('Enter'), page.locator('[data-smart-lookup-submit="1"]').click()]);
    await expect.poll(() => ageCalls).toBe(2);
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

  test('LG C3 and C2 family searches render prominent model-year context from the local API', async ({ page }) => {
    await page.unroute('**/api/age-lookup');
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
    }
  });

  test('exact LG OLED and Samsung Q60 family variants render year context correctly', async ({ page }) => {
    await page.unroute('**/api/age-lookup');
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

    await page.locator('#smart-lookup-input').fill('Samsung Q60 Series TV');
    await page.locator('#smartLookupBtn').click();
    await expect(panel).toContainText('Samsung Q60 Series TV');
    await expect(panel.locator('.smart-year-context-value')).toHaveText('2019–2024');
    await expect(panel).toContainText('Q60R / Q60RA: 2019 model-year family');
    await expect(panel).toContainText('Q60D: 2024 model-year family');
    await expect(panel).not.toContainText('Brand needed');
    await expect(panel).not.toContainText('Serial numbers are brand-specific');

    await page.locator('#smart-lookup-input').fill('Samsung Q60A 65 inch TV');
    await page.locator('#smartLookupBtn').click();
    await expect(panel.locator('.smart-year-context-value')).toHaveText('2021');
    await expect(panel).toContainText('Model-year family');
    await expect(panel).not.toContainText('manufacture year is 2021');
  });
});
