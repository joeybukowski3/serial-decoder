import { test, expect } from './helpers/playwright.mjs';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';

test('Large Loss matches the single-item GE model-assisted refinement result', async ({ page }) => {
  const requests = [];
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  await page.route('**/api/refine-serial-date', async (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'resolved',
        candidateYears: body.candidateYears,
        remainingCandidateYears: [2020],
        chosenYear: 2020,
        confidence: 'high',
        summary: 'Verified local model evidence narrows the serial-valid years to 2020.',
        evidence: [],
      }),
    });
  });

  await page.goto(`${BASE_URL}/index.html?cat=appliances`, { waitUntil: 'networkidle' });
  await page.selectOption('#brand', 'ge');
  await page.fill('#serial', 'FR31424IN');
  await page.fill('#modelNumber', 'GFW850SPN0DG');
  await page.click('#decodeBtn');
  await expect(page.locator('#resultYear')).toHaveText('2020', { timeout: 20000 });
  const singleItemYear = await page.locator('#resultYear').textContent();

  await page.goto(`${BASE_URL}/large-loss-decoder.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.getElementById('row-1') && window.SerialRefinementController?.refine);
  await page.fill('#brand-input-row-1', 'GE');
  await page.locator('#lldBrandListbox li').filter({ hasText: /^GE$/ }).click();
  await page.fill('#serial-row-1', 'FR31424IN');
  await page.fill('#model-row-1', 'GFW850SPN0DG');
  await page.click('#decodeAllBtn');

  await expect(page.locator('#row-1 .lld-result')).toHaveText(singleItemYear || '2020', { timeout: 20000 });
  await expect(page.locator('#row-1 .result-status')).toContainText('Decoded');
  await page.locator('#row-1 .lld-action-btn').click();
  await expect(page.locator('#exp-fields-row-1')).toContainText('narrows the serial-valid years to 2020');
  await expect(page.locator('#exp-fields-row-1')).toContainText('1984/1996/2008/2020');

  expect(requests).toHaveLength(2);
  for (const request of requests) {
    expect(request).toMatchObject({
      category: 'appliances',
      brand: 'GE',
      serial: 'FR31424IN',
      model: 'GFW850SPN0DG',
      candidateYears: [1984, 1996, 2008, 2020],
    });
  }
  expect(consoleErrors).toEqual([]);
});
