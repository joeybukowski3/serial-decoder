import { test, expect } from './helpers/playwright.mjs';

const widths = [320, 375, 430, 768, 1024, 1280, 1440];

for (const width of widths) {
  test(`shared navigation has no overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://localhost:3001/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body > nav')).toHaveCount(1);
    await expect(page.locator('#hamburgerBtn')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    if (width <= 1290) {
      await expect(page.locator('#hamburgerBtn')).toBeVisible();
      await expect(page.locator('body > nav > ul')).toBeHidden();
    } else {
      await expect(page.locator('#hamburgerBtn')).toBeHidden();
      await expect(page.locator('body > nav > ul')).toBeVisible();
    }
  });
}

test('shared mobile drawer updates aria state and keeps Resources reachable', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto('http://localhost:3001/index.html', { waitUntil: 'domcontentloaded' });
  const toggle = page.locator('#hamburgerBtn');
  await toggle.focus();
  await toggle.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('body > nav > ul')).toHaveClass(/open/);
  await page.locator('.nav-dropdown-toggle').click();
  await expect(page.locator('.nav-dropdown-panel')).toHaveClass(/open/);
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});
