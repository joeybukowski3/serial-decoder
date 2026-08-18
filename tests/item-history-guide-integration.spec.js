import { test, expect, chromium, createAnalyticsBlockingContext } from './helpers/playwright.mjs';

// Exercises item-history-guide-integration.js's decoder-side MutationObserver
// in isolation, against a minimal fixture that reproduces the one fact that
// matters: #serialSummaryLayer is a static node present at page load, and
// every "new result" is just that same node's innerHTML being replaced
// wholesale — it is never removed/re-added. script.js additionally builds
// its own guide card inline, so testing through the full decoder page can't
// tell a working observer from a dead one; this fixture isolates the
// integration file's own reactivity.

test.setTimeout(60000);

async function openFixture() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await createAnalyticsBlockingContext(browser, { viewport: { width: 1024, height: 800 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.goto('http://localhost:3001/tests/fixtures/item-history-decoder-fixture.html', { waitUntil: 'load' });
  return { browser, page, consoleErrors };
}

function cardCount(page) {
  return page.locator('#serialSummaryLayer .item-history-guide-card').count();
}

test('first render into the persistent layer is captured', async () => {
  const { browser, page, consoleErrors } = await openFixture();
  try {
    expect(await cardCount(page)).toBe(0);

    await page.evaluate(() => window.simulateDecoderRender());
    await expect(page.locator('#serialSummaryLayer .item-history-guide-card')).toHaveCount(1);

    expect(consoleErrors).toEqual([]);
  } finally {
    await browser.close();
  }
});

test('a second render into the same persistent node (no outer replacement) is also captured, without duplicating', async () => {
  const { browser, page } = await openFixture();
  try {
    await page.evaluate(() => window.simulateDecoderRender('<div class="rs-primary-row">Result 1</div>'));
    await expect(page.locator('#serialSummaryLayer .item-history-guide-card')).toHaveCount(1);

    // Tag the live node to prove the second render reuses it rather than
    // the layer being torn down and recreated.
    await page.evaluate(() => { document.getElementById('serialSummaryLayer').__marker = 'persisted'; });

    await page.evaluate(() => window.simulateDecoderRender('<div class="rs-primary-row">Result 2</div>'));

    const persisted = await page.evaluate(() => document.getElementById('serialSummaryLayer').__marker === 'persisted');
    expect(persisted).toBe(true);

    await expect(page.locator('#serialSummaryLayer .item-history-guide-card')).toHaveCount(1);
  } finally {
    await browser.close();
  }
});

test('a render that already contains its own guide card is not duplicated', async () => {
  const { browser, page } = await openFixture();
  try {
    await page.evaluate(() => {
      window.simulateDecoderRender(
        '<div class="serial-guide-section">' +
          '<div class="sl-summary-card item-history-guide-card"><h4>Inline card</h4></div>' +
        '</div>'
      );
    });

    await expect(page.locator('#serialSummaryLayer .item-history-guide-card')).toHaveCount(1);
  } finally {
    await browser.close();
  }
});

test('clearing the layer back to empty/hidden does not leave or create a card', async () => {
  const { browser, page } = await openFixture();
  try {
    await page.evaluate(() => window.simulateDecoderRender());
    await expect(page.locator('#serialSummaryLayer .item-history-guide-card')).toHaveCount(1);

    await page.evaluate(() => window.simulateDecoderClear());
    await expect(page.locator('#serialSummaryLayer')).toHaveClass(/\bhidden\b/);
    await expect(page.locator('#serialSummaryLayer .item-history-guide-card')).toHaveCount(0);
  } finally {
    await browser.close();
  }
});

test('nothing is injected before any render happens', async () => {
  const { browser, page } = await openFixture();
  try {
    await expect(page.locator('#serialSummaryLayer')).toHaveClass(/\bhidden\b/);
    expect(await cardCount(page)).toBe(0);
  } finally {
    await browser.close();
  }
});
