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
});
