import { test, expect } from './helpers/playwright.mjs';

const baseUrl = 'http://localhost:3001';
const widths = [320, 375, 430, 768, 1024, 1140, 1141, 1440];
const representativePages = [
  { route: '/refrigerator-serial-number.html', category: 'appliances' },
  { route: '/dryer-serial-number.html', category: 'appliances' },
  { route: '/range-oven-serial-number.html', category: 'appliances' },
  { route: '/whirlpool-serial-number-lookup.html', category: 'appliances' },
  { route: '/ge-serial-number-lookup.html', category: 'appliances' },
  { route: '/maytag-serial-number-lookup.html', category: 'appliances' },
  { route: '/kenmore-serial-number-lookup.html', category: 'appliances' },
  { route: '/trane-serial-number-lookup.html', category: 'hvac' },
  { route: '/rheem-serial-number-lookup.html', category: 'hvac' },
  { route: '/asus-serial-number-decoder.html', category: 'electronics' }
];

for (const width of widths) {
  test(`generated quality pages remain usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });

    for (const target of representativePages) {
      await page.goto(`${baseUrl}${target.route}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body > nav')).toHaveCount(1);
      await expect(page.locator('#hamburgerBtn')).toHaveCount(1);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator(`.cat-tab.active[data-cat="${target.category}"]`)).toHaveCount(1);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow, max-image-preview:large');

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
      expect(overflow.documentWidth, `${target.route} overflowed at ${width}px: ${JSON.stringify(overflow.elements)}`)
        .toBeLessThanOrEqual(overflow.viewportWidth);
      expect(await page.locator('ins.adsbygoogle:visible, [data-ad-slot]:visible, .ad-container:visible').count(),
        `${target.route} exposed a visible ad unit`).toBe(0);
      expect((await page.locator('main').innerText()).trim().length, `${target.route} rendered empty main content`).toBeGreaterThan(800);
    }

    await page.goto(`${baseUrl}/whirlpool-serial-number-lookup.html`, { waitUntil: 'domcontentloaded' });
    if (width <= 1290) {
      await expect(page.locator('#hamburgerBtn')).toBeVisible();
      await expect(page.locator('body > nav > ul')).toBeHidden();
    } else {
      await expect(page.locator('#hamburgerBtn')).toBeHidden();
      await expect(page.locator('body > nav > ul')).toBeVisible();
    }
  });
}

test('narrowed pages expose accurate recovery actions and working FAQs', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });

  await page.goto(`${baseUrl}/dryer-serial-number.html`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('link', { name: 'Choose Dryer Brand' })).toBeVisible();
  await expect(page.getByText(/does not publish a fabricated cross-brand worked example/i)).toBeVisible();
  await expect(page.locator('.ex-terminal')).toHaveCount(0);

  await page.goto(`${baseUrl}/rheem-serial-number-lookup.html`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: 'Rheem HVAC Serial Number Decoder' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'water-heater age guide' })).toHaveAttribute('href', '/how-old-is-my-plumbing');
  const faq = page.locator('.bp-faq-item').first();
  await faq.locator('summary').click();
  await expect(faq).toHaveAttribute('open', '');
});
