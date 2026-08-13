// Ad-hoc browser validation pass for the "Estimate RCV / ACV" CTA appended to successful
// Serial Decoder and Smart Lookup results. Same convention as
// tests/upsell/item-assist-upsell-card.browser.spec.js: run manually against a static
// file server, not wired into package.json's test scripts.
import { test, expect, chromium } from '@playwright/test';

test.setTimeout(60000);

const BASE_URL = process.env.UPSELL_BASE_URL || 'http://localhost:4173';

function isIgnoredConsoleError(message) {
  return /content security policy|err_name_not_resolved|adtrafficquality|googlesyndication|doubleclick|google-analytics|googletagmanager/i.test(String(message || ''));
}

async function openPage(browser, url, viewport) {
  const context = await browser.newContext({ viewport: viewport || { width: 1280, height: 1000 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !isIgnoredConsoleError(msg.text())) consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));
  await page.goto(url, { waitUntil: 'load' });
  return { context, page, consoleErrors };
}

async function decode(page, brand, serial, category) {
  if (category) await page.click(`[data-cat="${category}"]`);
  await page.selectOption('#brand', brand);
  await page.fill('#serial', serial);
  await page.click('#decodeBtn, .decode-btn');
  await page.locator('#serialResults:not(.hidden)').waitFor({ state: 'visible', timeout: 15000 });
}

// 1. deterministic decoder result produces the CTA with a valid age; 2. Water Heaters
// category produces a valid item id.
test('deterministic Rheem water-heater decode: CTA has a correct age and the Water Heater item id', async () => {
  const browser = await chromium.launch();
  const { page, consoleErrors } = await openPage(browser, `${BASE_URL}/decoder-tool.html`);
  await decode(page, 'rheem', '0314123456', 'waterHeaters');
  const year = Number((await page.locator('#resultYear').textContent()).trim());
  const expectedAge = new Date().getFullYear() - year;

  const link = page.locator('.rcv-acv-linkout-link').first();
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href');
  const url = new URL(href, BASE_URL);
  expect(url.pathname).toBe('/rcv-acv-calculator');
  expect(url.searchParams.get('age')).toBe(String(expectedAge));
  expect(url.searchParams.get('item')).toBe('water-heaters-plumbing-water-heater-electric-gas-or-oil');
  expect(url.searchParams.get('source')).toBe('serial-decoder');
  expect(url.searchParams.get('basis')).toBe('deterministic');

  expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  await browser.close();
});

// 3 & 4. Ambiguous/repeating-cycle decode result: CTA still shown, but with no age and no
// guessed item (Appliances category is intentionally never mapped).
test('ambiguous GE repeating-cycle decode: CTA is shown without a guessed age or item', async () => {
  const browser = await chromium.launch();
  const { page } = await openPage(browser, `${BASE_URL}/decoder-tool.html`);
  await decode(page, 'ge', 'GM028928Q');
  const yearText = await page.locator('#resultYear').textContent();
  expect(yearText.includes('/')).toBe(true); // confirms this really is the ambiguous case

  const link = page.locator('.rcv-acv-linkout-link').first();
  await expect(link).toBeVisible();
  const url = new URL(await link.getAttribute('href'), BASE_URL);
  expect(url.searchParams.has('age')).toBe(false);
  expect(url.searchParams.has('item')).toBe(false);
  expect(url.searchParams.get('source')).toBe('serial-decoder');
  await browser.close();
});

// Excluded state: an unsupported/no-match decode never shows the CTA.
test('no-match decode result does not show the RCV/ACV CTA', async () => {
  const browser = await chromium.launch();
  const { page } = await openPage(browser, `${BASE_URL}/decoder-tool.html`);
  await decode(page, 'ge', 'AB1234567');
  await expect(page.locator('.rcv-acv-linkout-link')).toHaveCount(0);
  await browser.close();
});

// 5. Smart Lookup single (individual-unit) estimate prefills age.
test('Smart Lookup with an individual manufacture year prefills a correct age and item', async () => {
  const browser = await chromium.launch();
  const { page, consoleErrors } = await openPage(browser, `${BASE_URL}/smart-lookup.html`);
  await page.route('**/api/age-lookup', (route) => route.fulfill({
    json: { brand: 'GE', model: 'GDT695SSJSS', individualManufactureYear: 2018, itemCategory: 'Dishwasher' },
  }));
  await page.route('**/api/lkq-lookup', (route) => route.fulfill({ json: {} }));
  await page.locator('#smart-lookup-input').fill('GE GDT695SSJSS dishwasher serial ABC123');
  await page.locator('#smartLookupBtn').click();

  const link = page.locator('.rcv-acv-linkout-link').first();
  await expect(link).toBeVisible();
  const url = new URL(await link.getAttribute('href'), BASE_URL);
  expect(url.searchParams.get('age')).toBe(String(new Date().getFullYear() - 2018));
  expect(url.searchParams.get('item')).toBe('kitchen-appliances-dishwasher');
  expect(url.searchParams.get('source')).toBe('smart-lookup');
  expect(url.searchParams.get('basis')).toBe('estimated');

  expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  await browser.close();
});

// 6. Smart Lookup production-range-only (or introduction-year-only) result never turns
// the range/launch date into an age.
test('Smart Lookup with only a production range never turns the midpoint into an age', async () => {
  const browser = await chromium.launch();
  const { page } = await openPage(browser, `${BASE_URL}/smart-lookup.html`);
  await page.route('**/api/age-lookup', (route) => route.fulfill({
    json: { brand: 'Samsung', model: 'QN65Q80A', productionRange: { start: 2013, end: 2016 }, itemCategory: 'Television' },
  }));
  await page.route('**/api/lkq-lookup', (route) => route.fulfill({ json: {} }));
  await page.locator('#smart-lookup-input').fill('Samsung QN65Q80A TV');
  await page.locator('#smartLookupBtn').click();

  const link = page.locator('.rcv-acv-linkout-link').first();
  await expect(link).toBeVisible();
  const url = new URL(await link.getAttribute('href'), BASE_URL);
  expect(url.searchParams.has('age')).toBe(false);
  expect(url.searchParams.get('source')).toBe('smart-lookup');
  await browser.close();
});

test('Smart Lookup with only a product-family introduction year does not use it as unit age', async () => {
  const browser = await chromium.launch();
  const { page } = await openPage(browser, `${BASE_URL}/smart-lookup.html`);
  await page.route('**/api/age-lookup', (route) => route.fulfill({
    json: { brand: 'GE', model: 'GDT695SSJSS', introductionYear: 2018, itemCategory: 'Dishwasher' },
  }));
  await page.route('**/api/lkq-lookup', (route) => route.fulfill({ json: {} }));
  await page.locator('#smart-lookup-input').fill('GE GDT695SSJSS dishwasher');
  await page.locator('#smartLookupBtn').click();

  const link = page.locator('.rcv-acv-linkout-link').first();
  await expect(link).toBeVisible();
  const url = new URL(await link.getAttribute('href'), BASE_URL);
  expect(url.searchParams.has('age')).toBe(false); // introductionYear is not this unit's age
  expect(url.searchParams.get('item')).toBe('kitchen-appliances-dishwasher');
  await browser.close();
});

// Excluded state: an API failure / unrecognized query never shows the CTA.
test('Smart Lookup failure/no-result state does not show the RCV/ACV CTA', async () => {
  const browser = await chromium.launch();
  const { page } = await openPage(browser, `${BASE_URL}/smart-lookup.html`);
  await page.route('**/api/age-lookup', (route) => route.fulfill({ status: 502, json: { error: 'down' } }));
  await page.route('**/api/lkq-lookup', (route) => route.fulfill({ json: {} }));
  await page.locator('#smart-lookup-input').fill('totally unknown gibberish xyz');
  await page.locator('#smartLookupBtn').click();
  await page.waitForTimeout(800);
  await expect(page.locator('.rcv-acv-linkout-link')).toHaveCount(0);
  await browser.close();
});

// Mobile: ~390px, both surfaces, no horizontal overflow, CTA visible.
test('390px mobile: decoder CTA is visible with no horizontal overflow', async () => {
  const browser = await chromium.launch();
  const { page } = await openPage(browser, `${BASE_URL}/decoder-tool.html`, { width: 390, height: 844 });
  await decode(page, 'rheem', '0314123456', 'waterHeaters');
  const link = page.locator('.rcv-acv-linkout-link').first();
  await expect(link).toBeVisible();
  const box = await link.boundingBox();
  expect(box.width).toBeLessThanOrEqual(390);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await browser.close();
});

test('390px mobile: Smart Lookup CTA is visible with no horizontal overflow', async () => {
  const browser = await chromium.launch();
  const { page } = await openPage(browser, `${BASE_URL}/smart-lookup.html`, { width: 390, height: 844 });
  await page.route('**/api/age-lookup', (route) => route.fulfill({
    json: { brand: 'GE', model: 'GDT695SSJSS', individualManufactureYear: 2018, itemCategory: 'Dishwasher' },
  }));
  await page.route('**/api/lkq-lookup', (route) => route.fulfill({ json: {} }));
  await page.locator('#smart-lookup-input').fill('GE GDT695SSJSS dishwasher');
  await page.locator('#smartLookupBtn').click();
  const link = page.locator('.rcv-acv-linkout-link').first();
  await expect(link).toBeVisible();
  const box = await link.boundingBox();
  expect(box.width).toBeLessThanOrEqual(390);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await browser.close();
});
