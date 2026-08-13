// Ad-hoc browser validation pass for the RCV/ACV calculator's ?age/?item/?source/?basis
// query-param prefill (fed by the Serial Decoder and Smart Lookup "Estimate RCV / ACV"
// CTA). Same convention as tests/upsell/item-assist-upsell-card.browser.spec.js: run
// manually against a static file server, not wired into package.json's test scripts.
import { test, expect, chromium } from '@playwright/test';

test.setTimeout(60000);

const BASE_URL = process.env.UPSELL_BASE_URL || 'http://localhost:4173';

function isIgnoredConsoleError(message) {
  return /content security policy|err_name_not_resolved|adtrafficquality|googlesyndication|doubleclick|google-analytics|googletagmanager/i.test(String(message || ''));
}

async function openCalculator(browser, query) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !isIgnoredConsoleError(msg.text())) consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));
  await page.goto(`${BASE_URL}/rcv-acv-calculator.html${query || ''}`, { waitUntil: 'load' });
  return { context, page, consoleErrors };
}

// 7 & 9: valid age + valid item id prefill and the item loads its canonical rate.
test('valid age and item query params prefill the fields and load the canonical Claims Pages rate', async () => {
  const browser = await chromium.launch();
  const { page, consoleErrors } = await openCalculator(browser, '?age=8&item=kitchen-appliances-dishwasher&source=serial-decoder&basis=deterministic');

  await expect(page.locator('#calcAgeYears')).toHaveValue('8');
  await expect(page.locator('#calcItemType')).toHaveValue('kitchen-appliances-dishwasher');
  // Dishwasher's canonical rate is 10.00%/yr — must come from rcv-acv-items.js, not the URL.
  await expect(page.locator('#calcAnnualRate')).toHaveValue('10');
  await expect(page.locator('#calcSourceDisplay')).toBeVisible();
  await expect(page.locator('#calcAgePrefillNote')).toBeVisible();
  await expect(page.locator('#calcAgePrefillNote')).toHaveText(/Decode My Item serial-number result/);

  expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  await browser.close();
});

test('smart-lookup source with basis=estimated shows the estimate-specific disclosure copy', async () => {
  const browser = await chromium.launch();
  const { page } = await openCalculator(browser, '?age=5&source=smart-lookup&basis=estimated');
  await expect(page.locator('#calcAgeYears')).toHaveValue('5');
  await expect(page.locator('#calcAgePrefillNote')).toHaveText(/Smart Lookup estimate. Review it before calculating/);
  await browser.close();
});

// 8: invalid age param is ignored.
test('a negative, non-numeric, or absurdly large age query param is ignored', async () => {
  const browser = await chromium.launch();

  const { page: p1 } = await openCalculator(browser, '?age=-5&source=serial-decoder');
  await expect(p1.locator('#calcAgeYears')).toHaveValue('');
  await expect(p1.locator('#calcAgePrefillNote')).toBeHidden();

  const { page: p2 } = await openCalculator(browser, '?age=notanumber&source=serial-decoder');
  await expect(p2.locator('#calcAgeYears')).toHaveValue('');

  const { page: p3 } = await openCalculator(browser, '?age=99999&source=serial-decoder');
  await expect(p3.locator('#calcAgeYears')).toHaveValue('');

  await browser.close();
});

// 10: invalid item id is ignored.
test('an unknown item query param is ignored and the select stays at its default', async () => {
  const browser = await chromium.launch();
  const { page } = await openCalculator(browser, '?item=totally-fake-item-id&age=8&source=serial-decoder');
  await expect(page.locator('#calcItemType')).toHaveValue('');
  // The age param is still independently valid and should still apply.
  await expect(page.locator('#calcAgeYears')).toHaveValue('8');
  await browser.close();
});

// 11: query params cannot override canonical Claims Pages rates (no rate/annualRate param is ever read).
test('a rate query param has no effect — the annual rate always comes from the dataset', async () => {
  const browser = await chromium.launch();
  const { page } = await openCalculator(browser, '?item=kitchen-appliances-dishwasher&rate=1&annualRate=1&age=8&source=serial-decoder');
  await expect(page.locator('#calcAnnualRate')).toHaveValue('10'); // still the canonical 10.00%/yr, not "1"
  await browser.close();
});

// 12: user can edit the pre-filled age normally, and editing it retracts the disclosure note.
test('editing a pre-filled age is allowed and hides the now-stale prefill disclosure', async () => {
  const browser = await chromium.launch();
  const { page } = await openCalculator(browser, '?age=8&source=serial-decoder&basis=deterministic');
  await expect(page.locator('#calcAgePrefillNote')).toBeVisible();

  await page.fill('#calcAgeYears', '12');
  await expect(page.locator('#calcAgeYears')).toHaveValue('12');
  await expect(page.locator('#calcAgePrefillNote')).toBeHidden();
  await browser.close();
});

// 13: Reset behavior remains sensible (clears prefilled age, item, and the disclosure
// note). The Reset button lives in the results body, which only appears after a
// calculation — so this exercises the realistic flow: prefill, fill cost, Calculate,
// then Reset.
test('Reset clears a pre-filled age, item, and the disclosure note', async () => {
  const browser = await chromium.launch();
  const { page } = await openCalculator(browser, '?age=8&item=kitchen-appliances-dishwasher&source=serial-decoder&basis=deterministic');
  await expect(page.locator('#calcAgeYears')).toHaveValue('8');

  await page.fill('#calcReplacementCost', '1000');
  await page.click('#calcCalculateBtn');
  await expect(page.locator('#calcResultBody')).toBeVisible();

  await page.click('#calcResetBtn');
  await expect(page.locator('#calcAgeYears')).toHaveValue('');
  await expect(page.locator('#calcItemType')).toHaveValue('');
  await expect(page.locator('#calcAgePrefillNote')).toBeHidden();
  await expect(page.locator('#calcEmptyState')).toBeVisible();
  await browser.close();
});

// 14: a direct visit with no query params behaves exactly as before (no console errors, empty state).
test('a direct visit with no query params shows the untouched default empty state', async () => {
  const browser = await chromium.launch();
  const { page, consoleErrors } = await openCalculator(browser, '');
  await expect(page.locator('#calcAgeYears')).toHaveValue('');
  await expect(page.locator('#calcItemType')).toHaveValue('');
  await expect(page.locator('#calcAgePrefillNote')).toBeHidden();
  await expect(page.locator('#calcEmptyState')).toBeVisible();
  expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  await browser.close();
});

// The disclosure note must never appear without an explicit, recognized source param —
// an age param with no source is presumably a manually-typed/shared link, not a decoder
// or Smart Lookup handoff, so no "pre-filled from..." claim should be shown.
test('an age param without a recognized source does not show a prefill disclosure', async () => {
  const browser = await chromium.launch();
  const { page } = await openCalculator(browser, '?age=8');
  await expect(page.locator('#calcAgeYears')).toHaveValue('8');
  await expect(page.locator('#calcAgePrefillNote')).toBeHidden();
  await browser.close();
});
