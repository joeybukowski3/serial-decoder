// Live cross-site handoff validation: DecodeMyItem (local static server) ->
// the real, deployed https://itemassist.com/request-age-verification.
//
// SAFETY: these tests read/observe the live destination page only. They
// never click #avr-submit-btn or otherwise submit the remote form -- doing
// so would create a real work request in Item Assist's live intake pipeline
// and send real emails. Ad-hoc validation only; not wired into package.json.
import { test, expect, chromium } from '@playwright/test';

test.setTimeout(60000);

const BASE_URL = process.env.UPSELL_BASE_URL || 'http://localhost:4173';
const ITEM_ASSIST_ORIGIN = 'https://itemassist.com';
const ITEM_ASSIST_PATH = '/request-age-verification';
const ALLOWED_PARAMS = ['brand', 'model', 'category', 'result_id', 'source', 'result_status'];

function isIgnoredConsoleError(message) {
  return /content security policy|err_name_not_resolved|adtrafficquality|googlesyndication|doubleclick|google-analytics|googletagmanager/i.test(String(message || ''));
}

async function openPage(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !isIgnoredConsoleError(msg.text())) consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));
  await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'load' });
  return { context, page, consoleErrors };
}

async function decode(page, brand, serial, model, categoryButtonText) {
  if (categoryButtonText) {
    await page.click(`button:has-text("${categoryButtonText}")`);
    await page.waitForTimeout(300);
  }
  await page.selectOption('#brand', brand);
  await page.fill('#serial', serial);
  if (model !== undefined) await page.fill('#modelNumber', model);
  await page.click('#decodeBtn, .decode-btn');
  await page.locator('#serialResults:not(.hidden)').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('#itemAssistUpsellCard').waitFor({ state: 'attached', timeout: 15000 });
}

function assertUrlContract(urlString) {
  const url = new URL(urlString);
  expect(url.hostname).toBe('itemassist.com');
  expect(url.pathname).toBe(ITEM_ASSIST_PATH);
  const keys = [...url.searchParams.keys()];
  for (const key of keys) {
    expect(ALLOWED_PARAMS, `unexpected query param "${key}" in ${urlString}`).toContain(key);
  }
  expect(url.searchParams.get('source')).toBe('decodemyitem');
  expect(urlString.toLowerCase()).not.toContain('serial');
  return url;
}

for (const [label, brand, serial, model, expectedStatus, category] of [
  // ASUS E5N0CV123456 decodes to a single unambiguous year (2014) with no
  // narrowing needed -- see decoder-regressions.test.mjs:1487. Verified
  // directly against the running app before use (whirlpool RX3026733 +
  // WFE320M0JW0 was tried first per the sibling unit test's model-family
  // match, but the live app's async narrowing path did not resolve it the
  // same way the unit test's direct function call did -- that's a pre-
  // existing narrowing-engine question unrelated to this card, so picked an
  // unambiguous fixture instead of chasing it here).
  ['resolved', 'asus', 'E5N0CV123456', undefined, 'resolved', 'Electronics'],
  ['ambiguous', 'ge', 'GM028928Q', 'GFW850SSNWW', 'ambiguous', undefined],
  ['no-match', 'ge', 'AB1234567', 'GFW850SSNWW', 'no_match', undefined],
]) {
  test(`${label}: CTA opens the live Item Assist route with only the approved params`, async () => {
    const browser = await chromium.launch();
    const { context, page } = await openPage(browser, { width: 1440, height: 1000 });
    await decode(page, brand, serial, model, category);

    const href = await page.locator('#itemAssistUpsellCta').getAttribute('href');
    const url = assertUrlContract(href);
    expect(url.searchParams.get('result_status')).toBe(expectedStatus);
    expect(url.searchParams.get('brand')).toBeTruthy();

    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      page.locator('#itemAssistUpsellCta').click(),
    ]);
    await popup.waitForLoadState('domcontentloaded');
    assertUrlContract(popup.url());
    await browser.close();
  });
}

test('live destination: shows the DecodeMyItem referral banner and preselects Professional Age Verification', async () => {
  const browser = await chromium.launch();
  const { context, page } = await openPage(browser, { width: 1440, height: 1000 });
  await decode(page, 'ge', 'LA208110G', 'GFW850SSNWW');

  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('#itemAssistUpsellCta').click(),
  ]);
  // Real production page: analytics/tracking requests keep the network busy
  // indefinitely, so networkidle never resolves. Wait on DOM readiness plus
  // the specific element instead.
  await popup.waitForLoadState('domcontentloaded');

  const banner = popup.locator('#avr-referral-banner');
  await expect(banner).toBeVisible({ timeout: 15000 });
  await expect(banner).toContainText(/imported from DecodeMyItem/i);

  const serviceSelect = popup.locator('#avr-requested-service');
  await expect(serviceSelect).toHaveValue('age_verification');

  // Confirm the service is still user-changeable (not locked/disabled), per spec.
  await expect(serviceSelect).toBeEnabled();

  await browser.close();
});

test('live destination: brand, model, and category are safely prefilled from the handoff URL', async () => {
  const browser = await chromium.launch();
  const { context, page } = await openPage(browser, { width: 1440, height: 1000 });
  await decode(page, 'asus', 'E5N0CV123456', undefined, 'Electronics');

  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('#itemAssistUpsellCta').click(),
  ]);
  await popup.waitForLoadState('domcontentloaded');

  // Item blocks render client-side into #avr-items-list; wait for the first one.
  const itemsList = popup.locator('#avr-items-list');
  await expect(itemsList).toBeVisible({ timeout: 15000 });
  const firstItem = itemsList.locator(':scope > *').first();
  await expect(firstItem).toBeVisible({ timeout: 10000 });

  // Prefill values live in <input>/<select> .value, which .innerText never
  // exposes -- read the actual form controls, not the container's text.
  const brandField = firstItem.locator('input[name*="brand" i], select[name*="brand" i]').first();
  const modelField = firstItem.locator('input[name*="model" i]').first();
  const categoryField = firstItem.locator('select[name*="category" i]').first();

  await expect(brandField).toHaveValue(/ASUS/i);

  // Item Assist now maps DecodeMyItem's internal category key to its own
  // option label (fix deployed and confirmed live). "electronics" ->
  // "Television / Home Electronics".
  const categoryValue = await categoryField.inputValue().catch(() => '');
  expect(categoryValue).toBe('Television / Home Electronics');
  await expect(categoryField).toBeEnabled();

  const modelValue = await modelField.inputValue().catch(() => null);
  if (modelValue !== null) {
    // ASUS fixture above passes no model; if a model field exists it must be
    // safely empty, not literally the string "undefined".
    expect(modelValue).not.toBe('undefined');
  }

  await browser.close();
});

for (const [dmiCategory, expectedOption] of [
  ['appliances', 'Major Household Appliance'],
  ['hvac', 'HVAC Equipment'],
  ['waterHeaters', 'Water Heater'],
]) {
  test(`live destination: category=${dmiCategory} maps to "${expectedOption}"`, async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const url = `${ITEM_ASSIST_ORIGIN}${ITEM_ASSIST_PATH}?source=decodemyitem&result_status=resolved&category=${encodeURIComponent(dmiCategory)}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    const categorySelect = page.locator('#avr-items-list select[name$="_category"]').first();
    await categorySelect.waitFor({ state: 'attached', timeout: 10000 });
    await expect(categorySelect).toHaveValue(expectedOption);
    await expect(categorySelect).toBeEnabled();
    await browser.close();
  });
}

test('live destination: an unknown category key leaves the field unselected, not forced to a wrong value', async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const url = `${ITEM_ASSIST_ORIGIN}${ITEM_ASSIST_PATH}?source=decodemyitem&result_status=resolved&category=furniture`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  const categorySelect = page.locator('#avr-items-list select[name$="_category"]').first();
  await categorySelect.waitFor({ state: 'attached', timeout: 10000 });
  await expect(categorySelect).toHaveValue('');
  await expect(categorySelect).toBeEnabled();
  await browser.close();
});

test('live destination: rejects/escapes hostile query param content instead of executing it', async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  let dialogFired = false;
  page.on('dialog', async (dialog) => { dialogFired = true; await dialog.dismiss(); });

  const hostileUrl = `${ITEM_ASSIST_ORIGIN}${ITEM_ASSIST_PATH}?source=decodemyitem&brand=${encodeURIComponent('<img src=x onerror=alert(1)>')}&model=GFW850&category=appliances&result_id=xss-test&result_status=resolved`;
  await page.goto(hostileUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000); // let client-side prefill JS run and settle

  expect(dialogFired, 'a query param produced an executed alert() -- reflected XSS').toBe(false);
  const bodyHtml = await page.evaluate(() => document.body.innerHTML);
  expect(bodyHtml).not.toContain('onerror=alert(1)');
  await browser.close();
});

test('repeated DecodeMyItem lookups update the same card rather than duplicating it', async () => {
  const browser = await chromium.launch();
  const { page } = await openPage(browser, { width: 1440, height: 1000 });
  await decode(page, 'ge', 'LA208110G');
  const firstHref = await page.locator('#itemAssistUpsellCta').getAttribute('href');

  await decode(page, 'ge', 'GM028928Q');
  const secondHref = await page.locator('#itemAssistUpsellCta').getAttribute('href');
  expect(secondHref).not.toEqual(firstHref);

  const cardCount = await page.locator('#itemAssistUpsellCard').count();
  expect(cardCount).toBe(1);
  await browser.close();
});

for (const [device, width] of [['desktop', 1440], ['mobile 375px', 375], ['mobile 390px', 390]]) {
  test(`${device}: CTA is present, correctly targeted, and reachable`, async () => {
    const browser = await chromium.launch();
    const { context, page } = await openPage(browser, { width, height: width === 1440 ? 1000 : 800 });
    await decode(page, 'ge', 'LA208110G', 'GFW850SSNWW');

    const cta = page.locator('#itemAssistUpsellCta');
    await expect(cta).toBeVisible();
    expect(await cta.getAttribute('target')).toBe('_blank');
    expect(await cta.getAttribute('rel')).toContain('noopener');

    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      cta.click(),
    ]);
    await popup.waitForLoadState('domcontentloaded');
    assertUrlContract(popup.url());
    await browser.close();
  });
}

test('analytics: no sensitive values appear in any tracked event payload', async () => {
  const browser = await chromium.launch();
  const { page } = await openPage(browser, { width: 1440, height: 1000 });

  const trackedCalls = [];
  await page.exposeFunction('__captureAnalytics', (name, props) => trackedCalls.push({ name, props }));
  await page.evaluate(() => {
    window.ItemAssistAnalytics = { track: (name, props) => window.__captureAnalytics(name, props) };
  });

  await decode(page, 'ge', 'LA208110G', 'GFW850SSNWW');
  const cta = page.locator('#itemAssistUpsellCta');
  await cta.click({ modifiers: [] }).catch(() => {}); // click fires the analytics hook even if the popup itself isn't inspected here
  await page.locator('#itemAssistUpsellCard .determination-details summary').click();

  expect(trackedCalls.length).toBeGreaterThan(0);
  const serialNeedle = 'LA208110G';
  for (const call of trackedCalls) {
    const serialized = JSON.stringify(call.props || {});
    expect(serialized).not.toContain(serialNeedle);
    expect(Object.prototype.hasOwnProperty.call(call.props || {}, 'serial')).toBe(false);
  }
  await browser.close();
});
