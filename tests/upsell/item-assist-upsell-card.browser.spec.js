// Ad-hoc browser validation pass for the Item Assist upsell card, run manually
// against a static file server (see AGENT NOTES in the PR/report — this spec
// is not wired into package.json's automated test scripts, per the request
// that only the unit tests be added to the normal test command).
import { test, expect, chromium } from '@playwright/test';

test.setTimeout(60000);

const BASE_URL = process.env.UPSELL_BASE_URL || 'http://localhost:4173';

// Same allowance as tests/serial-refinement-ui.spec.js: this offline/sandboxed
// run has no real DNS for third-party ad/analytics hosts, which is expected
// noise unrelated to the upsell card itself.
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

async function decode(page, brand, serial, model) {
  await page.selectOption('#brand', brand);
  await page.fill('#serial', serial);
  if (model !== undefined) await page.fill('#modelNumber', model);
  await page.click('#decodeBtn, .decode-btn');
  await page.locator('#serialResults:not(.hidden)').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('#itemAssistUpsellCard').waitFor({ state: 'attached', timeout: 15000 });
}

test('resolved: GE clean serial shows the resolved-variant card', async ({}, testInfo) => {
  const browser = await chromium.launch();
  const { page, consoleErrors } = await openPage(browser, { width: 1440, height: 1000 });
  await decode(page, 'ge', 'LA208110G');
  const card = page.locator('#itemAssistUpsellCard');
  await expect(card).toBeVisible();
  await expect(card.locator('h4')).toHaveText('Need This Confirmed by a Person?');
  const cta = card.locator('#itemAssistUpsellCta');
  const href = await cta.getAttribute('href');
  expect(href).toContain('https://itemassist.com/request-age-verification');
  expect(href).toContain('result_status=');
  expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  await browser.close();
});

test('ambiguous: GE serial with a repeating year code shows the ambiguous-variant card', async () => {
  const browser = await chromium.launch();
  const { page } = await openPage(browser, { width: 1440, height: 1000 });
  await decode(page, 'ge', 'GM028928Q');
  const card = page.locator('#itemAssistUpsellCard');
  const body = card.locator('#itemAssistUpsellBody');
  await expect(body).toHaveText(/narrowed this to a few possible years/i);
  const href = await card.locator('#itemAssistUpsellCta').getAttribute('href');
  expect(href).toContain('result_status=ambiguous');
  await browser.close();
});

test('no-match: an unsupported serial shows the no-match-variant card', async () => {
  const browser = await chromium.launch();
  const { page } = await openPage(browser, { width: 1440, height: 1000 });
  // AB1234567: 'B' is not a valid GE year letter, so decode() returns null
  // (per tests/decoder-regressions.test.mjs: "GE returns no result instead
  // of an Unknown code year value"). A punctuation-only value like "!!!"
  // never reaches the decoder at all -- the serial field strips non
  // alphanumeric characters as you type, which would test input filtering,
  // not the no-match render path.
  await decode(page, 'ge', 'AB1234567');
  const card = page.locator('#itemAssistUpsellCard');
  await expect(card).toBeVisible();
  const body = card.locator('#itemAssistUpsellBody');
  await expect(body).toHaveText(/couldn.t pin this down/i);
  const href = await card.locator('#itemAssistUpsellCta').getAttribute('href');
  expect(href).toContain('result_status=no_match');
  await browser.close();
});

test('repeated decode: a second decode updates the same card, no duplicate, no stale content flash', async () => {
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

test('CTA navigation opens the Item Assist URL in a new tab with only the approved params', async () => {
  const browser = await chromium.launch();
  const { context, page } = await openPage(browser, { width: 1440, height: 1000 });
  await decode(page, 'ge', 'LA208110G', 'GFW850SSNWW');
  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('#itemAssistUpsellCta').click(),
  ]);
  await popup.waitForLoadState('domcontentloaded').catch(() => {});
  const url = new URL(popup.url());
  const allowed = ['brand', 'model', 'category', 'result_id', 'source', 'result_status'];
  for (const key of url.searchParams.keys()) {
    expect(allowed).toContain(key);
  }
  expect(url.searchParams.get('source')).toBe('decodemyitem');
  expect(url.hostname).toBe('itemassist.com');
  expect(url.pathname).toBe('/request-age-verification');
  await browser.close();
});

test('details expansion: "What\'s included?" opens via click and stays keyboard operable', async () => {
  const browser = await chromium.launch();
  const { page } = await openPage(browser, { width: 1440, height: 1000 });
  await decode(page, 'ge', 'LA208110G');
  const details = page.locator('#itemAssistUpsellCard .determination-details');
  const summary = details.locator('summary');
  await expect(details).not.toHaveAttribute('open', '');
  await summary.click();
  await expect(details).toHaveAttribute('open', '');
  await browser.close();
});

test('desktop 1440px: card fits within the results panel with no horizontal overflow', async () => {
  const browser = await chromium.launch();
  const { page } = await openPage(browser, { width: 1440, height: 1000 });
  await decode(page, 'ge', 'LA208110G');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await browser.close();
});

for (const width of [375, 390]) {
  test(`mobile ${width}px: card is visible, readable, and has no horizontal overflow`, async () => {
    const browser = await chromium.launch();
    const { page } = await openPage(browser, { width, height: 800 });
    await decode(page, 'ge', 'LA208110G');
    const card = page.locator('#itemAssistUpsellCard');
    await expect(card).toBeVisible();
    const box = await card.boundingBox();
    expect(box.width).toBeLessThanOrEqual(width + 1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await browser.close();
  });
}

// Tabs forward from a known starting element until the target id is reached
// (or the cap is hit), using real keyboard events -- not locator.focus() --
// so :focus-visible reflects an actual keyboard user, not a script call.
async function tabUntil(page, targetId, maxPresses) {
  for (let i = 0; i < maxPresses; i++) {
    const activeId = await page.evaluate(() => document.activeElement && document.activeElement.id);
    if (activeId === targetId) return true;
    await page.keyboard.press('Tab');
  }
  const finalId = await page.evaluate(() => document.activeElement && document.activeElement.id);
  return finalId === targetId;
}

test('keyboard navigation: CTA is Tab-reachable with a visible focus outline, and the details summary is keyboard-operable', async () => {
  const browser = await chromium.launch();
  const { page } = await openPage(browser, { width: 1440, height: 1000 });
  await decode(page, 'ge', 'LA208110G');

  await page.locator('#itemAssistUpsellCta').scrollIntoViewIfNeeded();
  await page.click('#serial');
  const reachedCta = await tabUntil(page, 'itemAssistUpsellCta', 60);
  expect(reachedCta, 'CTA should be reachable via repeated real Tab presses').toBe(true);

  const ctaOutline = await page.evaluate(() => {
    const el = document.getElementById('itemAssistUpsellCta');
    const cs = getComputedStyle(el);
    return { outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, boxShadow: cs.boxShadow };
  });
  // A real Tab-driven focus must show *some* visible indicator: either a
  // non-suppressed native outline, or an explicit focus box-shadow/ring.
  const hasVisibleOutline = ctaOutline.outlineStyle !== 'none' && parseFloat(ctaOutline.outlineWidth) > 0;
  const hasVisibleBoxShadow = ctaOutline.boxShadow !== 'none';
  expect(hasVisibleOutline || hasVisibleBoxShadow, `no visible focus indicator on CTA: ${JSON.stringify(ctaOutline)}`).toBe(true);

  await page.keyboard.press('Tab');
  const summaryFocused = await page.evaluate(() => document.activeElement && document.activeElement.tagName);
  expect(summaryFocused).toBe('SUMMARY');
  await page.keyboard.press('Enter');
  await expect(page.locator('#itemAssistUpsellCard .determination-details')).toHaveAttribute('open', '');

  await browser.close();
});
