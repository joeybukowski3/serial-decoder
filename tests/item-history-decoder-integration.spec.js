import { test, expect, chromium, createAnalyticsBlockingContext } from './helpers/playwright.mjs';

test.setTimeout(120000);

function isIgnoredConsoleError(message) {
  return /content security policy|err_name_not_resolved|err_blocked_by_client|adtrafficquality|googlesyndication|doubleclick|google-analytics/i.test(String(message || ''));
}

async function openPage() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await createAnalyticsBlockingContext(browser, { viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const diagnostics = { consoleErrors: [], pageErrors: [] };

  page.on('console', (message) => {
    if (message.type() === 'error' && !isIgnoredConsoleError(message.text())) {
      diagnostics.consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));

  await page.route('https://fonts.googleapis.com/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/css', body: '/* test stub */\n' });
  });

  // The static test server can't handle the model-evidence API's POST, so
  // stub it — this is unrelated to the guide-card integration under test.
  await page.route('**/api/refine-serial-date', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'resolved',
        candidateYears: [2004, 2014, 2024],
        remainingCandidateYears: [2014],
        chosenYear: 2014,
        confidence: 'high',
        resolutionBasis: 'serial-plus-model',
        modelProductionRange: { start: 2013, end: 2016 },
        evidence: [],
        summary: 'Model evidence leaves 2014.',
        cacheStatus: 'bypass',
        provider: 'local-db',
        timings: { localMs: 2, cacheMs: 0, onlineLookupMs: 0, totalMs: 2 },
        errorCode: null,
      }),
    });
  });

  await page.goto('http://localhost:3001/decoder-tool.html', { waitUntil: 'networkidle' });
  return { browser, context, page, diagnostics };
}

async function fillDecode(page, brand, serial, model) {
  await page.selectOption('#brand', brand);
  await page.fill('#serial', serial);
  if (model !== undefined) await page.fill('#modelNumber', model);
}

function expectCleanDiagnostics(diagnostics) {
  expect(diagnostics.consoleErrors).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);
}

test('first valid decoder result gets exactly one guide card', async () => {
  const { browser, page, diagnostics } = await openPage();
  try {
    await expect(page.locator('#serialSummaryLayer .item-history-guide-card')).toHaveCount(0);

    await fillDecode(page, 'whirlpool', 'TRD3481274');
    await page.click('#decodeBtn');

    await expect(page.locator('#serialResults')).toBeVisible({ timeout: 750 });
    await expect(page.locator('#serialSummaryLayer .item-history-guide-card')).toHaveCount(1);

    expectCleanDiagnostics(diagnostics);
  } finally {
    await browser.close();
  }
});

test('second decode into the same persistent #serialSummaryLayer node is also captured, without duplicating the card', async () => {
  const { browser, page, diagnostics } = await openPage();
  try {
    await fillDecode(page, 'whirlpool', 'TRD3481274');
    await page.click('#decodeBtn');
    await expect(page.locator('#serialResults')).toBeVisible({ timeout: 750 });
    await expect(page.locator('#serialSummaryLayer .item-history-guide-card')).toHaveCount(1);

    // Tag the live node so we can prove it survives the second decode instead
    // of being replaced (the observer is expected to react to in-place
    // mutation of this same node, not to a fresh node being added).
    await page.evaluate(() => {
      document.getElementById('serialSummaryLayer').__testMarker = 'same-node';
    });

    await fillDecode(page, 'lg', '412TATG1H105');
    await page.click('#decodeBtn');
    await expect(page.locator('#resultYear')).toHaveText('2004/2014/2024');

    const sameNode = await page.evaluate(() => document.getElementById('serialSummaryLayer').__testMarker === 'same-node');
    expect(sameNode).toBe(true);

    // The second result produced exactly one card — not zero (observer
    // failing to react to the persistent container) and not two (a stale
    // node duplicating the first card).
    await expect(page.locator('#serialSummaryLayer .item-history-guide-card')).toHaveCount(1);

    expectCleanDiagnostics(diagnostics);
  } finally {
    await browser.close();
  }
});

test('refinement re-render of the same result does not duplicate the guide card', async () => {
  const { browser, page, diagnostics } = await openPage();
  try {
    await fillDecode(page, 'lg', '412TATG1H105');
    await page.click('#decodeBtn');
    await expect(page.locator('#resultYear')).toHaveText('2004/2014/2024');
    await expect(page.locator('#serialSummaryLayer .item-history-guide-card')).toHaveCount(1);

    await page.fill('#narrowModelInput', 'WM3470HWA');
    await page.click('#narrowDateBtn');
    await expect(page.locator('#resultYear')).not.toHaveText('2004/2014/2024', { timeout: 5000 });
    await expect(page.locator('#serialSummaryLayer .item-history-guide-card')).toHaveCount(1);

    // The manual refinement step above only exercises one re-render path;
    // also directly re-invoke the render function the way
    // refineAmbiguousResult() does internally, to prove repeated in-place
    // re-renders of the same logical result never accumulate extra cards.
    await page.evaluate(() => {
      if (typeof window.renderSerialSummaryLayer === 'function') window.renderSerialSummaryLayer();
    });

    // refineAmbiguousResult() calls renderSerialSummaryLayer() again, wholly
    // replacing #serialSummaryLayer's children a second time for the same
    // logical result — this must still settle on exactly one card.
    await expect(page.locator('#serialSummaryLayer .item-history-guide-card')).toHaveCount(1);

    expectCleanDiagnostics(diagnostics);
  } finally {
    await browser.close();
  }
});

test('no guide card is injected before any decode runs', async () => {
  const { browser, page, diagnostics } = await openPage();
  try {
    await expect(page.locator('#serialSummaryLayer')).toHaveClass(/\bhidden\b/);
    await expect(page.locator('#serialSummaryLayer .item-history-guide-card')).toHaveCount(0);
    expectCleanDiagnostics(diagnostics);
  } finally {
    await browser.close();
  }
});
