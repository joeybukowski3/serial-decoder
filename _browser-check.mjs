import { chromium, devices } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.PREVIEW_URL;
const QUERIES = ['Nintendo Switch 2', 'H4080BM miele oven', 'H4080BM'];

const VIEWPORTS = [
  { label: 'desktop', options: { viewport: { width: 1440, height: 900 } } },
  { label: 'mobile', options: { ...devices['iPhone 13'] } },
];

const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
  const context = await browser.newContext(vp.options);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  for (const query of QUERIES) {
    await page.goto(`${BASE}/smart-lookup`, { waitUntil: 'domcontentloaded' });
    const input = page.locator('input[type="text"], input[type="search"], textarea').first();
    await input.fill(query);
    await page.keyboard.press('Enter');
    // Wait for a real result card rather than a fixed sleep.
    await page.waitForFunction(() => {
      const el = document.querySelector('.smart-age-result, .smart-lookup-status');
      return el && !el.className.includes('loading');
    }, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1200);

    const card = page.locator('.smart-age-result').first();
    const text = (await card.count()) ? (await card.innerText()) : '(no result card)';
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

    console.log(`\n========== [${vp.label}] ${query} ==========`);
    console.log(text.replace(/\n{3,}/g, '\n\n').slice(0, 1400));
    console.log(`--- horizontal overflow: ${overflow} | console errors: ${consoleErrors.length}`);
  }
  if (consoleErrors.length) console.log(`[${vp.label}] console errors:`, consoleErrors.slice(0, 3));
  await context.close();
}
await browser.close();
