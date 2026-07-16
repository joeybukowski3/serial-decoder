import { test, expect } from '@playwright/test';

const baseUrl = 'http://localhost:3001';
const widths = [320, 375, 430, 768, 1024, 1140, 1141, 1290, 1291, 1440];
const representativePages = [
  '/samsung-tv-serial-number-decoder.html',
  '/sony.html',
  '/bosch.html',
  '/google-pixel.html',
  '/how-old-is-my-electronics.html'
];

for (const width of widths) {
  test(`electronics quality pages remain readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });

    for (const route of representativePages) {
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toBeVisible();
      const overflow = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        elements: [...document.querySelectorAll('body *')]
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return { selector: `${element.tagName.toLowerCase()}.${element.className || ''}`, left: rect.left, right: rect.right, width: rect.width };
          })
          .filter((item) => item.right > window.innerWidth + 1 || item.left < -1)
          .slice(0, 8)
      }));
      expect(overflow.documentWidth, `${route} overflowed at ${width}px: ${JSON.stringify(overflow.elements)}`).toBeLessThanOrEqual(overflow.viewportWidth);
      expect(await page.locator('ins.adsbygoogle:visible, [data-ad-slot]:visible, .ad-container:visible').count(), `${route} exposed a visible ad unit`).toBe(0);
      expect((await page.locator('body').innerText()).trim().length, `${route} rendered an empty body`).toBeGreaterThan(500);
    }

    await page.goto(`${baseUrl}/samsung-tv-serial-number-decoder.html`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body > nav')).toHaveCount(1);
    await expect(page.locator('#hamburgerBtn')).toHaveCount(1);
    if (width <= 1290) {
      await expect(page.locator('#hamburgerBtn')).toBeVisible();
      await expect(page.locator('body > nav > ul')).toBeHidden();
    } else {
      await expect(page.locator('#hamburgerBtn')).toBeHidden();
      await expect(page.locator('body > nav > ul')).toBeVisible();
    }
  });
}

test('narrow and noindex pages expose honest interaction states', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });

  await page.goto(`${baseUrl}/sony.html`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Enter Sony TV Model Number')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check Model Year' })).toBeVisible();
  const sonyFaq = page.locator('.bp-faq-item').first();
  await sonyFaq.locator('summary').click();
  await expect(sonyFaq).toHaveAttribute('open', '');

  await page.goto(`${baseUrl}/google-pixel.html`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
  await expect(page.getByText(/temporarily excluded from search indexing/i)).toBeVisible();
});
