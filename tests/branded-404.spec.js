import { test, expect } from '@playwright/test';

const recoveryRoutes = ['/', '/decoder-tool', '/smart-lookup', '/brands', '/serial-number-location-guide'];

for (const viewport of [{ width: 375, height: 812 }, { width: 430, height: 932 }, { width: 768, height: 900 }, { width: 1024, height: 900 }, { width: 1440, height: 1000 }]) {
  test(`branded 404 recovers cleanly at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const response = await page.goto('http://localhost:3001/not-a-real-page', { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'We couldn’t find that page.' })).toBeVisible();
    for (const route of recoveryRoutes) await expect(page.locator(`.not-found-links a[href="${route}"]`)).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator('.not-found-links a').first().focus();
    await expect(page.locator('.not-found-links a').first()).toBeFocused();
  });
}
