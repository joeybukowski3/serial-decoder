// Ad-hoc browser validation pass for the "RCV / ACV Calculator" sidebar card appended
// under the Item Assist card in successful Serial Decoder and Smart Lookup results, plus
// the desktop header links. Same convention as
// tests/upsell/item-assist-upsell-card.browser.spec.js: run manually against a static
// file server, not wired into package.json's test scripts.
import { test, expect, chromium, createAnalyticsBlockingContext } from '../helpers/playwright.mjs';

test.setTimeout(60000);

const BASE_URL = process.env.UPSELL_BASE_URL || 'http://localhost:4173';

function isIgnoredConsoleError(message) {
  return /content security policy|err_name_not_resolved|err_blocked_by_client|adtrafficquality|googlesyndication|doubleclick|google-analytics|googletagmanager/i.test(String(message || ''));
}

async function openPage(browser, url, viewport) {
  const context = await createAnalyticsBlockingContext(browser, { viewport: viewport || { width: 1280, height: 1000 } });
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

// 1. deterministic decoder result produces the sidebar card with a valid age; 2. Water
// Heaters category produces a valid item id; also confirms placement directly under the
// Item Assist card and that no old/duplicate text link remains.
test('deterministic Rheem water-heater decode: sidebar card sits under Item Assist with correct age/item, no duplicate link', async () => {
  const browser = await chromium.launch();
  const { page, consoleErrors } = await openPage(browser, `${BASE_URL}/decoder-tool.html`);
  await decode(page, 'rheem', '0314123456', 'waterHeaters');
  const year = Number((await page.locator('#resultYear').textContent()).trim());
  const expectedAge = new Date().getFullYear() - year;

  // Placement: sidebar card is the next element sibling of the Item Assist card, inside
  // the same right-column mount.
  await page.locator('.rcv-acv-sidebar-card').first().waitFor({ state: 'attached', timeout: 5000 });
  const orderedClasses = await page.evaluate(() => {
    const mount = document.getElementById('itemAssistMount');
    return mount ? Array.from(mount.children).map((el) => el.className) : [];
  });
  expect(orderedClasses).toEqual(['info-block ia-upsell-card', 'rcv-acv-sidebar-card']);

  const card = page.locator('.rcv-acv-sidebar-card').first();
  await expect(card).toBeVisible();
  await expect(card.locator('.rcv-acv-sidebar-title')).toHaveText('RCV / ACV CALCULATOR');
  await expect(card.locator('.rcv-acv-sidebar-body')).toHaveText("Use this item's age to estimate depreciation and actual cash value.");
  await expect(card.locator('.rcv-acv-sidebar-cta')).toHaveText('Estimate RCV / ACV');

  const href = await card.locator('.rcv-acv-sidebar-cta').getAttribute('href');
  const url = new URL(href, BASE_URL);
  expect(url.pathname).toBe('/rcv-acv-calculator');
  expect(url.searchParams.get('age')).toBe(String(expectedAge));
  expect(url.searchParams.get('item')).toBe('water-heaters-plumbing-water-heater-electric-gas-or-oil');
  expect(url.searchParams.get('source')).toBe('serial-decoder');
  expect(url.searchParams.get('basis')).toBe('deterministic');

  // No leftover old-style text link anywhere in the result.
  await expect(page.locator('.rcv-acv-linkout-link')).toHaveCount(0);

  expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  await browser.close();
});

// 3 & 4. Ambiguous/repeating-cycle decode result: card still shown, but with no age and
// no guessed item, and the generic no-age copy.
test('ambiguous GE repeating-cycle decode: sidebar card is shown with generic copy, no guessed age or item', async () => {
  const browser = await chromium.launch();
  const { page } = await openPage(browser, `${BASE_URL}/decoder-tool.html`);
  await decode(page, 'ge', 'GM028928Q');
  const yearText = await page.locator('#resultYear').textContent();
  expect(yearText.includes('/')).toBe(true); // confirms this really is the ambiguous case

  const card = page.locator('.rcv-acv-sidebar-card').first();
  await expect(card).toBeVisible();
  await expect(card.locator('.rcv-acv-sidebar-body')).toHaveText('Estimate depreciation and actual cash value for this item.');
  const url = new URL(await card.locator('.rcv-acv-sidebar-cta').getAttribute('href'), BASE_URL);
  expect(url.searchParams.has('age')).toBe(false);
  expect(url.searchParams.has('item')).toBe(false);
  expect(url.searchParams.get('source')).toBe('serial-decoder');
  await browser.close();
});

// Excluded state: an unsupported/no-match decode never shows the card.
test('no-match decode result does not show the RCV/ACV sidebar card', async () => {
  const browser = await chromium.launch();
  const { page } = await openPage(browser, `${BASE_URL}/decoder-tool.html`);
  await decode(page, 'ge', 'AB1234567');
  await expect(page.locator('.rcv-acv-sidebar-card')).toHaveCount(0);
  await browser.close();
});

// 5. Smart Lookup single (individual-unit) estimate prefills age, with estimate-specific copy.
test('Smart Lookup with an individual manufacture year: sidebar card has correct copy, age, and item', async () => {
  const browser = await chromium.launch();
  const { page, consoleErrors } = await openPage(browser, `${BASE_URL}/smart-lookup.html`);
  await page.route('**/api/age-lookup', (route) => route.fulfill({
    json: { brand: 'GE', model: 'GDT695SSJSS', individualManufactureYear: 2018, itemCategory: 'Dishwasher' },
  }));
  await page.route('**/api/lkq-lookup', (route) => route.fulfill({ json: {} }));
  await page.locator('#smart-lookup-input').fill('GE GDT695SSJSS dishwasher serial ABC123');
  await page.locator('#smartLookupBtn').click();

  // The Item Assist card now mounts here too (previously it silently failed to mount on
  // Smart Lookup's age flow because ensureUpsellCard() required a .results-body element
  // that this DOM branch didn't have) — the RCV/ACV sidebar card must sit directly below
  // it in the same mount, with no duplicates of either card.
  const iaCard = page.locator('#smartLookupItemAssistCard');
  await expect(iaCard).toBeVisible();
  await expect(iaCard.locator('h4')).toHaveText('Advanced Research by a Field Expert');
  await expect(page.locator('#smartLookupItemAssistCard')).toHaveCount(1);

  const card = page.locator('.rcv-acv-sidebar-card').first();
  await expect(card).toBeVisible();
  await expect(card).toHaveCount(1);
  await expect(card.locator('.rcv-acv-sidebar-body')).toHaveText('Use this estimated age to preview depreciation and actual cash value.');

  const orderedIds = await page.evaluate(() => {
    const mount = document.getElementById('smartLookupItemAssistMount');
    return mount ? Array.from(mount.children).map((el) => el.id || el.className) : [];
  });
  expect(orderedIds).toEqual(['smartLookupItemAssistCard', 'rcv-acv-sidebar-card']);

  const url = new URL(await card.locator('.rcv-acv-sidebar-cta').getAttribute('href'), BASE_URL);
  expect(url.searchParams.get('age')).toBe(String(new Date().getFullYear() - 2018));
  expect(url.searchParams.get('item')).toBe('kitchen-appliances-dishwasher');
  expect(url.searchParams.get('source')).toBe('smart-lookup');
  expect(url.searchParams.get('basis')).toBe('estimated');

  // Sidebar card text stays legible against the dark result-shell theme, not overridden
  // by result-shell.css's #smart-lookup-results.results-body * !important text-color rule.
  const ctaColor = await card.locator('.rcv-acv-sidebar-cta').evaluate((el) => getComputedStyle(el).color);
  expect(ctaColor).toBe('rgb(0, 56, 45)');

  await expect(page.locator('.rcv-acv-linkout-link')).toHaveCount(0);
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

  const card = page.locator('.rcv-acv-sidebar-card').first();
  await expect(card).toBeVisible();
  await expect(card.locator('.rcv-acv-sidebar-body')).toHaveText('Estimate depreciation and actual cash value for this item.');
  const url = new URL(await card.locator('.rcv-acv-sidebar-cta').getAttribute('href'), BASE_URL);
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

  const card = page.locator('.rcv-acv-sidebar-card').first();
  await expect(card).toBeVisible();
  const url = new URL(await card.locator('.rcv-acv-sidebar-cta').getAttribute('href'), BASE_URL);
  expect(url.searchParams.has('age')).toBe(false); // introductionYear is not this unit's age
  expect(url.searchParams.get('item')).toBe('kitchen-appliances-dishwasher');
  await browser.close();
});

// Excluded state: an API failure / unrecognized query never shows the card.
test('Smart Lookup failure/no-result state does not show the RCV/ACV sidebar card (existing Item Assist noMatch behavior is preserved)', async () => {
  const browser = await chromium.launch();
  const { page } = await openPage(browser, `${BASE_URL}/smart-lookup.html`);
  await page.route('**/api/age-lookup', (route) => route.fulfill({ status: 502, json: { error: 'down' } }));
  await page.route('**/api/lkq-lookup', (route) => route.fulfill({ json: {} }));
  await page.locator('#smart-lookup-input').fill('totally unknown gibberish xyz');
  await page.locator('#smartLookupBtn').click();
  await page.waitForTimeout(800);
  await expect(page.locator('.rcv-acv-sidebar-card')).toHaveCount(0);
  // Item Assist's own "noMatch" variant is existing, unchanged behavior (mountUpsell has
  // always run on both success and error) — it just couldn't mount before this fix. It
  // must keep showing here, with the same copy it has always used for this variant.
  await expect(page.locator('#smartLookupItemAssistCard')).toHaveCount(1);
  await expect(page.locator('#smartLookupItemAssistBody')).toContainText("couldn't pin this down");
  await browser.close();
});

// Mobile: ~390px, both surfaces stack Item Assist + RCV/ACV cards vertically, no overflow.
test('390px mobile: decoder sidebar card stacks under Item Assist with no horizontal overflow', async () => {
  const browser = await chromium.launch();
  const { page } = await openPage(browser, `${BASE_URL}/decoder-tool.html`, { width: 390, height: 844 });
  await decode(page, 'rheem', '0314123456', 'waterHeaters');
  const card = page.locator('.rcv-acv-sidebar-card').first();
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeVisible();
  const cardBox = await card.boundingBox();
  const iaBox = await page.locator('#itemAssistUpsellCard').boundingBox();
  expect(cardBox.y).toBeGreaterThanOrEqual(iaBox.y + iaBox.height); // stacked below, not beside
  expect(cardBox.width).toBeLessThanOrEqual(390);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await browser.close();
});

test('390px mobile: Smart Lookup Item Assist + sidebar card stack cleanly with no horizontal overflow', async () => {
  const browser = await chromium.launch();
  const { page } = await openPage(browser, `${BASE_URL}/smart-lookup.html`, { width: 390, height: 844 });
  await page.route('**/api/age-lookup', (route) => route.fulfill({
    json: { brand: 'GE', model: 'GDT695SSJSS', individualManufactureYear: 2018, itemCategory: 'Dishwasher' },
  }));
  await page.route('**/api/lkq-lookup', (route) => route.fulfill({ json: {} }));
  await page.locator('#smart-lookup-input').fill('GE GDT695SSJSS dishwasher');
  await page.locator('#smartLookupBtn').click();

  const iaCard = page.locator('#smartLookupItemAssistCard');
  const card = page.locator('.rcv-acv-sidebar-card').first();
  await expect(iaCard).toBeVisible();
  await expect(card).toBeVisible();

  const iaBox = await iaCard.boundingBox();
  const box = await card.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(iaBox.y + iaBox.height - 1); // stacked below, not beside
  expect(box.width).toBeLessThanOrEqual(390);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await browser.close();
});

// ─── Desktop header links ──────────────────────────────────────────────────────────

test('desktop header (>=1550px) shows direct RCV/ACV Calculator and Sales Tax De-Calculator links with no wrapping/overflow', async () => {
  const browser = await chromium.launch();
  const { page, consoleErrors } = await openPage(browser, `${BASE_URL}/decoder-tool.html`, { width: 1920, height: 1000 });
  const links = page.locator('.nav-tool-link a');
  await expect(links).toHaveCount(2);
  await expect(links.nth(0)).toHaveText('RCV / ACV Calculator');
  await expect(links.nth(0)).toHaveAttribute('href', '/rcv-acv-calculator');
  await expect(links.nth(1)).toHaveText('Sales Tax De-Calculator');
  await expect(links.nth(1)).toHaveAttribute('href', '/sales-tax-decalculator');

  const navHeight = (await page.locator('nav > ul').boundingBox()).height;
  expect(navHeight).toBeLessThan(50); // still a single row, not wrapped to two lines
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  await browser.close();
});

// index.html's base nav (no decoder result involved) sits closer to the wrap edge than
// decoder-tool.html's — this is what originally caught a real overflow regression at a
// too-low breakpoint, so it gets its own dedicated check at the two widths right around
// the new 1550px threshold.
test('desktop header at 1550px/1600px on the homepage nav shows no overflow (regression check)', async () => {
  const browser = await chromium.launch();
  for (const width of [1550, 1600]) {
    const { page, context } = await openPage(browser, `${BASE_URL}/index.html`, { width, height: 900 });
    await expect(page.locator('.nav-tool-link').first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `overflow at ${width}px`).toBeLessThanOrEqual(1);
    await context.close();
  }
  await browser.close();
});

test('header links are hidden below the 1550px breakpoint (medium desktop keeps the existing hamburger threshold untouched)', async () => {
  const browser = await chromium.launch();
  for (const width of [1366, 1440, 1500]) {
    const { page, context } = await openPage(browser, `${BASE_URL}/index.html`, { width, height: 900 });
    await expect(page.locator('.nav-tool-link').first()).toBeHidden();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `overflow at ${width}px`).toBeLessThanOrEqual(1);
    await context.close();
  }
  await browser.close();
});

test('390px mobile: header links never appear, even with the hamburger menu open', async () => {
  const browser = await chromium.launch();
  const { page } = await openPage(browser, `${BASE_URL}/decoder-tool.html`, { width: 390, height: 844 });
  await page.click('#hamburgerBtn');
  await expect(page.locator('.nav-tool-link').first()).toBeHidden();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await browser.close();
});
