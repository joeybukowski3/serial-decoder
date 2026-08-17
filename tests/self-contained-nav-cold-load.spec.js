import { test, expect } from './helpers/playwright.mjs';

const pages = [
  'how-old-is-my-appliance.html',
  'how-old-is-my-hvac.html',
  'how-old-is-my-plumbing.html',
  'how-old-is-my-electronics.html',
  'serial-number-location-guide.html',
];

const widths = [320, 360, 390, 768, 1400];

for (const file of pages) {
  for (const width of widths) {
    test(`${file}: no horizontal overflow at ${width}px during Material Symbols cold-load`, async ({ page }) => {
      // Simulate the icon webfont not being loaded yet (fallback ligature text, e.g. "menu", "smart_toy",
      // "qr_code_scanner", renders unconstrained before the font swaps in). This previously caused the
      // .mobile-toggle button to overflow the 320px viewport on serial-number-location-guide.html.
      await page.route('https://fonts.googleapis.com/**', async (route) => {
        await route.fulfill({ status: 200, contentType: 'text/css', body: '/* test stub: external fonts disabled */\n' });
      });

      await page.setViewportSize({ width, height: 900 });
      await page.goto(`http://localhost:3001/${file}`, { waitUntil: 'domcontentloaded' });

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(width + 1);
    });
  }
}
