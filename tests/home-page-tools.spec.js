import { test, expect } from './helpers/playwright.mjs';

async function recordScrolls(page) {
  await page.addInitScript(() => {
    window.__resultScrolls = [];
    Element.prototype.scrollIntoView = function (options) {
      window.__resultScrolls.push({ id: this.id, options: options || null });
    };
  });
}

async function openHome(page, width = 375, height = 820) {
  await page.setViewportSize({ width, height });
  await page.goto('/index.html?cat=appliances', { waitUntil: 'networkidle' });
}

async function resultScrolls(page, id) {
  return page.evaluate((targetId) => window.__resultScrolls.filter((entry) => entry.id === targetId), id);
}

test.describe('home page immediate tool access', () => {
  test('randomized Apple serial shows an incomplete date and one Item Assist card', async ({ page }) => {
    await page.goto('/index.html?cat=electronics', { waitUntil: 'networkidle' });
    await page.selectOption('#brand', 'apple');
    await page.fill('#serial', 'JXJQYGDQP3');
    await page.click('#decodeBtn');
    await expect(page.locator('#serialResults')).toBeVisible();
    const hero = page.locator('#serialSummaryLayer .serial-result-hero');
    await expect(hero).toContainText('Manufacture date unavailable');
    await expect(hero).toContainText('Randomized Apple serial');
    await expect(hero).toContainText('A2901');
    await expect(hero).toContainText('Smart Lookup');
    await expect(hero.locator('.rs-years')).toHaveCount(0);
    await expect(page.locator('#resultEstimatedAge')).toHaveText('—');
    await expect(page.locator('#serialResults #itemAssistUpsellCard')).toHaveCount(1);
    await expect(page.locator('#serialResults .ia-upsell-card')).toHaveCount(1);
    await expect(page.locator('#serialResults .ia-upsell-cta')).toHaveText('Request Expert Review');
    await expect(page.locator('#serialResults .ia-upsell-card details')).toHaveCount(0);
    await expect(page.locator('#serialResults')).not.toContainText('Pricing & details');
    await page.evaluate(() => renderSerialSummaryLayer());
    await expect(page.locator('#serialResults .ia-upsell-card')).toHaveCount(1);
  });

  test('serial searches, refinement rerender, and Smart Lookup keep one card per result', async ({ page }) => {
    await page.route('**/api/age-lookup', async (route) => {
      await route.fulfill({ json: { brand: 'Apple', model: 'Mac Studio', exactModel: 'A2901',
        likelyProduct: 'Apple Mac Studio', identityConfidence: 'low',
        introductionYear: 2023, estimatedIntroductionYear: 2023, introductionYearConfidence: 'low',
        estimateBasis: 'model-introduction', yearSignal: 'year', status: 'success',
        individualManufactureYear: null } });
    });
    await page.goto('/index.html?mode=smart#panel-smart', { waitUntil: 'networkidle' });
    await page.fill('#smart-lookup-input', 'A2901');
    await page.locator('[data-smart-lookup-submit="1"]').click();
    await expect(page.locator('#smart-lookup-age-panel')).toContainText('Estimated introduction year of the model');
    await expect(page.locator('#smart-lookup-age-panel')).toContainText('2023');
    await expect(page.locator('#ageResults .ia-upsell-card')).toHaveCount(1);
    await page.locator('.search-tab[data-cat="electronics"]').first().click();
    await page.selectOption('#brand', 'apple');
    await page.fill('#serial', 'JXJQYGDQP3');
    await page.click('#decodeBtn');
    await expect(page.locator('#serialResults .ia-upsell-card')).toHaveCount(1);
    await page.evaluate(() => renderSerialSummaryLayer());
    await expect(page.locator('#serialResults .ia-upsell-card')).toHaveCount(1);
    await page.locator('.search-tab[data-cat="appliances"]').first().click();
    await page.selectOption('#brand', 'ge');
    await page.fill('#serial', 'GM028928Q');
    await page.click('#decodeBtn');
    await expect(page.locator('#serialResults .ia-upsell-card')).toHaveCount(1);
    await page.evaluate(() => renderSerialSummaryLayer());
    await expect(page.locator('#serialResults .ia-upsell-card')).toHaveCount(1);
    await page.fill('#serial', 'LA208110G');
    await page.click('#decodeBtn');
    await expect(page.locator('#serialResults .ia-upsell-card')).toHaveCount(1);
  });

  test('ambiguous serial model refinement keeps one Item Assist card', async ({ page }) => {
    await page.route('**/api/refine-serial-date', async (route) => {
      await route.fulfill({ json: { status: 'resolved', candidateYears: [2004, 2014, 2024],
        remainingCandidateYears: [2014], chosenYear: 2014, confidence: 'high',
        resolutionBasis: 'serial-plus-model', modelProductionRange: { start: 2013, end: 2016 },
        evidence: [], summary: 'Model evidence leaves 2014.', provider: 'local-db', errorCode: null } });
    });
    await page.goto('/index.html?cat=appliances', { waitUntil: 'networkidle' });
    await page.selectOption('#brand', 'lg');
    await page.fill('#serial', '412TATG1H105');
    await page.click('#decodeBtn');
    await expect(page.locator('#serialResults .ia-upsell-card')).toHaveCount(1);
    await page.fill('#narrowModelInput', 'WM3470HWA');
    await page.click('#narrowDateBtn');
    await expect(page.locator('#resultYear')).toHaveText('2014');
    await expect(page.locator('#serialResults .ia-upsell-card')).toHaveCount(1);
  });

  test('mobile explanation tiles default collapsed and toggle by pointer and keyboard', async ({ page }) => {
    await openHome(page);
    const toggles = page.locator('[data-home-explainers] .hero-path-toggle');
    await expect(toggles).toHaveCount(2);
    await expect(toggles.nth(0)).toHaveAttribute('aria-expanded', 'false');
    await expect(toggles.nth(1)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#decoder-explainer-details')).toBeHidden();
    await expect(page.locator('#smart-explainer-details')).toBeHidden();

    await toggles.nth(0).click();
    await expect(toggles.nth(0)).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#decoder-explainer-details')).toBeVisible();

    await toggles.nth(0).focus();
    await page.keyboard.press('Enter');
    await expect(toggles.nth(0)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#decoder-explainer-details')).toBeHidden();
  });

  test('all four mobile category tabs stay in one row without horizontal overflow', async ({ page }) => {
    await openHome(page);
    const tabs = page.locator('.home-tools-grid .search-tab.cat-tab');
    await expect(tabs).toHaveCount(4);
    const layout = await page.locator('.home-tools-grid .search-tabs').first().evaluate((container) => ({
      flexWrap: getComputedStyle(container).flexWrap,
      tops: Array.from(container.children).map((tab) => Math.round(tab.getBoundingClientRect().top)),
      fits: container.scrollWidth <= container.clientWidth,
      waterBreak: container.querySelector('[data-cat="waterHeaters"] br') !== null,
    }));
    expect(layout.flexWrap).toBe('nowrap');
    expect(new Set(layout.tops).size).toBe(1);
    expect(layout.fits).toBe(true);
    expect(layout.waterBreak).toBe(true);
  });

  test('successful serial decode requests a smooth start-aligned results scroll', async ({ page }) => {
    await recordScrolls(page);
    await openHome(page, 375, 500);
    await page.selectOption('#brand', 'whirlpool');
    await page.fill('#serial', 'TRD3481274');
    await page.click('#decodeBtn');
    await expect(page.locator('#serialResults')).toBeVisible({ timeout: 15000 });
    await expect.poll(() => resultScrolls(page, 'serialResults')).toHaveLength(1);
    const [scroll] = await resultScrolls(page, 'serialResults');
    expect(scroll.options).toEqual({ behavior: 'smooth', block: 'start' });
    await expect(page.locator('#serialResults')).toHaveCSS('scroll-margin-top', /\d+px/);
  });

  test('decoder validation/no-result render does not request a results scroll', async ({ page }) => {
    await recordScrolls(page);
    await openHome(page, 375, 500);
    await page.selectOption('#brand', 'whirlpool');
    await page.fill('#serial', 'BAD');
    await page.click('#decodeBtn');
    await expect(page.locator('#serialResults')).toBeVisible({ timeout: 15000 });
    expect(await resultScrolls(page, 'serialResults')).toEqual([]);
  });

  test('successful Smart Lookup requests one smooth start-aligned results scroll', async ({ page }) => {
    await recordScrolls(page);
    let releaseResponse;
    const responseGate = new Promise((resolve) => { releaseResponse = resolve; });
    await page.route('**/api/age-lookup', async (route) => {
      await responseGate;
      await route.fulfill({
        json: {
          brand: 'Samsung',
          exactModel: 'QN65Q80A',
          category: 'television',
          yearContext: { value: 2021, type: 'model-year-family', label: 'Model-year family', isExactUnitDate: false },
        },
      });
    });
    await openHome(page, 375, 500);
    await page.fill('#smart-lookup-input', 'Samsung QN65Q80A');
    await page.click('[data-smart-lookup-submit="1"]');
    await page.evaluate(() => window.scrollTo(0, 0));
    releaseResponse();
    await expect(page.locator('#smart-lookup-age-panel')).toContainText('2021');
    await expect.poll(() => resultScrolls(page, 'ageResults')).toHaveLength(1);
    const [scroll] = await resultScrolls(page, 'ageResults');
    expect(scroll.options).toEqual({ behavior: 'smooth', block: 'start' });
  });

  test('Smart Lookup API errors render feedback without scrolling results', async ({ page }) => {
    await recordScrolls(page);
    await page.route('**/api/age-lookup', (route) => route.fulfill({ status: 500, json: { error: 'Unavailable' } }));
    await openHome(page, 375, 500);
    await page.fill('#smart-lookup-input', 'Samsung QN65Q80A');
    await page.click('[data-smart-lookup-submit="1"]');
    await expect(page.locator('#smart-lookup-age-panel')).toContainText('Lookup unavailable');
    expect(await resultScrolls(page, 'ageResults')).toEqual([]);
  });

  for (const width of [375, 430, 768, 1440]) {
    test(`${width}px layout has no page overflow and keeps tool controls usable`, async ({ page }) => {
      await openHome(page, width);
      const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        decoderVisible: document.querySelector('#serial').getBoundingClientRect().width > 0,
        smartVisible: document.querySelector('#smart-lookup-input').getBoundingClientRect().width > 0,
        smartButtonVisible: document.querySelector('[data-smart-lookup-submit="1"]').getBoundingClientRect().width > 0,
      }));
      expect(layout).toEqual({ overflow: false, decoderVisible: true, smartVisible: true, smartButtonVisible: true });
      const expectedExpanded = width > 600 ? 'true' : 'false';
      await expect(page.locator('.hero-path-toggle').first()).toHaveAttribute('aria-expanded', expectedExpanded);
    });
  }
});
