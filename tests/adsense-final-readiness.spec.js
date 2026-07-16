import { test, expect } from '@playwright/test';

const baseUrl = 'http://localhost:3001';
const widths = [320, 375, 430, 768, 1024, 1140, 1141, 1440];
const representativePages = [
  '/index.html',
  '/privacy-policy.html',
  '/about.html',
  '/appliance-age-estimator.html',
  '/goodman-serial-number-lookup.html',
  '/methodology.html',
  '/404.html'
];

async function overflowEvidence(page) {
  return page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    offenders: [...document.querySelectorAll('body *')]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { tag: element.tagName.toLowerCase(), className: String(element.className || ''), left: rect.left, right: rect.right };
      })
      .filter((item) => item.left < -1 || item.right > window.innerWidth + 1)
      .slice(0, 8)
  }));
}

for (const width of widths) {
  test(`final readiness pages remain usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });

    for (const route of representativePages) {
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toBeVisible();
      const overflow = await overflowEvidence(page);
      expect(overflow.documentWidth, `${route} overflowed at ${width}px: ${JSON.stringify(overflow.offenders)}`)
        .toBeLessThanOrEqual(overflow.viewportWidth);
      await expect(page.locator('ins.adsbygoogle:visible, [data-ad-slot]:visible, .ad-container:visible')).toHaveCount(0);
    }

    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.editorial-trust')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Read the Methodology' })).toHaveAttribute('href', '/methodology');
    if (width <= 1290) {
      const toggle = page.locator('#hamburgerBtn');
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press('Escape');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    } else {
      await expect(page.locator('#hamburgerBtn')).toBeHidden();
      const resources = page.locator('.nav-dropdown-toggle');
      await resources.click();
      await expect(resources).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press('Escape');
      await expect(resources).toHaveAttribute('aria-expanded', 'false');
    }
  });
}

test('Privacy tables scroll locally without widening the small viewport', async ({ page }) => {
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${baseUrl}/privacy-policy.html`, { waitUntil: 'domcontentloaded' });
    const dimensions = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      tables: [...document.querySelectorAll('#policy-tab-privacy .table-scroll')].map((wrapper) => ({
        clientWidth: wrapper.clientWidth,
        scrollWidth: wrapper.scrollWidth
      }))
    }));
    expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
    expect(dimensions.tables.length).toBe(3);
    expect(dimensions.tables.every((table) => table.clientWidth <= dimensions.viewportWidth)).toBe(true);
    expect(dimensions.tables.some((table) => table.scrollWidth > table.clientWidth)).toBe(true);

    const firstTable = page.locator('#policy-tab-privacy .table-scroll').first();
    await firstTable.focus();
    await expect(firstTable).toBeFocused();
    const outline = await firstTable.evaluate((element) => getComputedStyle(element).outlineStyle);
    expect(outline).not.toBe('none');
    await expect(page.getByText('Scroll horizontally to read all columns.').first()).toBeVisible();
  }
});

test('all retained workflow utilities expose the final noindex policy', async ({ page }) => {
  for (const route of [
    '/appliance-age-estimator.html',
    '/replacement-lookup.html',
    '/hvac-replacement-guide.html',
    '/tv-replacement-guide.html'
  ]) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.getByRole('link', { name: /Smart Lookup/i }).first()).toHaveAttribute('href', '/smart-lookup');
  }
});
