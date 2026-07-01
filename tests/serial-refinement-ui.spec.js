import { test, expect, chromium } from '@playwright/test';

test.setTimeout(120000);

async function openPage(viewport = { width: 1440, height: 1000 }) {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto('http://localhost:3001/index.html?cat=appliances', { waitUntil: 'networkidle' });
  return { browser, context, page };
}

async function fillDecode(page, brand, serial, model) {
  await page.selectOption('#brand', brand);
  await page.fill('#serial', serial);
  await page.fill('#modelNumber', model || '');
}

test('serial candidates render before background refinement completes', async () => {
  const { browser, context, page } = await openPage();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route('**/api/refine-serial-date', async (route) => {
    await gate;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'resolved', candidateYears: [2004, 2014, 2024], remainingCandidateYears: [2014], chosenYear: 2014,
        confidence: 'high', resolutionBasis: 'serial-plus-model', modelProductionRange: { start: 2013, end: 2016 },
        evidence: [{ type: 'local-db', title: 'Verified LG model record', quality: 'official', supports: '2013-2016' }],
        summary: 'Model evidence leaves 2014.', cacheStatus: 'bypass', provider: 'local-db',
        timings: { localMs: 2, cacheMs: 0, onlineLookupMs: 0, totalMs: 2 }, errorCode: null,
      }),
    });
  });
  try {
    await fillDecode(page, 'lg', '412TATG1H105', 'WM3470HWA');
    const started = Date.now();
    await page.click('#decodeBtn');
    await expect(page.locator('#serialResults')).toBeVisible({ timeout: 500 });
    await expect(page.locator('#resultYear')).toHaveText('2004/2014/2024');
    expect(Date.now() - started).toBeLessThan(500);
    await expect(page.locator('#narrowDateOutput')).toContainText('Checking model-era evidence');
    release();
    await expect(page.locator('#resultYear')).toHaveText('2014');
    await expect(page.locator('summary')).toContainText('Evidence used');
  } finally {
    release();
    await context.close();
    await browser.close();
  }
});

test('unavailable refinement preserves candidates and offers Retry', async () => {
  const { browser, context, page } = await openPage({ width: 390, height: 844 });
  await page.route('**/api/refine-serial-date', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'unavailable', candidateYears: [1994, 2024], remainingCandidateYears: [1994, 2024], chosenYear: null,
        confidence: null, resolutionBasis: 'serial-plus-model', modelProductionRange: null, evidence: [],
        summary: 'Model evidence could not be checked.', cacheStatus: 'bypass', provider: 'none',
        timings: { localMs: 0, cacheMs: 0, onlineLookupMs: 0, totalMs: 10 }, errorCode: 'REFINEMENT_TIMEOUT',
      }),
    });
  });
  try {
    await fillDecode(page, 'whirlpool', 'TRD3481274', 'WMH31017HS12');
    await page.click('#decodeBtn');
    await expect(page.locator('#resultYear')).toHaveText('1994/2024');
    await expect(page.locator('[data-serial-refinement-retry="1"]')).toBeVisible();
    const age = page.locator('#resultEstimatedAge');
    await expect(age).toHaveText(/^(|—)$/);
  } finally {
    await context.close();
    await browser.close();
  }
});

test('changed input prevents a stale response from overwriting current candidates', async () => {
  const { browser, context, page } = await openPage();
  let firstRoute;
  let calls = 0;
  await page.route('**/api/refine-serial-date', async (route) => {
    calls += 1;
    if (calls === 1) { firstRoute = route; return; }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      status: 'ambiguous', candidateYears: [2004, 2014, 2024], remainingCandidateYears: [2004, 2014, 2024], chosenYear: null,
      confidence: null, resolutionBasis: 'serial-plus-model', modelProductionRange: null, evidence: [], summary: 'Still ambiguous.',
      cacheStatus: 'bypass', provider: 'none', timings: { localMs: 0, cacheMs: 0, onlineLookupMs: 0, totalMs: 1 }, errorCode: null,
    }) });
  });
  try {
    await fillDecode(page, 'lg', '412TATG1H105', 'WM3470HWA');
    await page.click('#decodeBtn');
    await expect(page.locator('#resultYear')).toHaveText('2004/2014/2024');
    await page.fill('#modelNumber', 'DIFFERENTMODEL');
    await firstRoute.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      status: 'resolved', candidateYears: [2004, 2014, 2024], remainingCandidateYears: [2014], chosenYear: 2014,
      confidence: 'high', resolutionBasis: 'serial-plus-model', modelProductionRange: { start: 2013, end: 2016 }, evidence: [],
      summary: 'Stale response.', cacheStatus: 'miss', provider: 'gemini-google-search', timings: { localMs: 0, cacheMs: 0, onlineLookupMs: 1, totalMs: 1 }, errorCode: null,
    }) });
    await page.waitForTimeout(100);
    await expect(page.locator('#resultYear')).toHaveText('2004/2014/2024');
  } finally {
    await context.close();
    await browser.close();
  }
});


test('identical rapid decode clicks reuse one in-flight refinement request', async () => {
  const { browser, context, page } = await openPage();
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route('**/api/refine-serial-date', async (route) => {
    calls += 1;
    await gate;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      status: 'resolved', candidateYears: [2004, 2014, 2024], remainingCandidateYears: [2014], chosenYear: 2014,
      confidence: 'high', resolutionBasis: 'serial-plus-model', modelProductionRange: { start: 2013, end: 2016 }, evidence: [],
      summary: 'Resolved.', cacheStatus: 'bypass', provider: 'local-db', timings: { localMs: 1, cacheMs: 0, onlineLookupMs: 0, totalMs: 1 }, errorCode: null,
    }) });
  });
  try {
    await fillDecode(page, 'lg', '412TATG1H105', 'WM3470HWA');
    await page.click('#decodeBtn');
    await expect(page.locator('#serialResults')).toBeVisible({ timeout: 500 });
    await page.click('#decodeBtn');
    await page.waitForTimeout(100);
    expect(calls).toBe(1);
    release();
    await expect(page.locator('#resultYear')).toHaveText('2014');
  } finally {
    release();
    await context.close();
    await browser.close();
  }
});

test('resolved result keeps the explanation and Evidence used section visible', async () => {
  const { browser, context, page } = await openPage();
  await page.route('**/api/refine-serial-date', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      status: 'resolved', candidateYears: [1994, 2024], remainingCandidateYears: [2024], chosenYear: 2024,
      confidence: 'high', resolutionBasis: 'serial-plus-model', modelProductionRange: { start: 2023, end: 2025 },
      evidence: [{ type: 'manufacturer-support', title: 'Whirlpool support', sourceUrl: 'https://www.whirlpool.com/', quality: 'official', availabilityStart: 2023, availabilityEnd: 2025 }],
      summary: 'Model evidence leaves 2024.', cacheStatus: 'miss', provider: 'gemini-google-search', timings: { localMs: 0, cacheMs: 0, onlineLookupMs: 1, totalMs: 1 }, errorCode: null,
    }) });
  });
  try {
    await fillDecode(page, 'whirlpool', 'TRD3481274', 'WMH31017HS12');
    await page.click('#decodeBtn');
    await expect(page.locator('#resultYear')).toHaveText('2024');
    await expect(page.locator('.serial-refinement-status')).toBeVisible();
    await expect(page.locator('.serial-refinement-evidence summary')).toHaveText('Evidence used');
  } finally {
    await context.close();
    await browser.close();
  }
});
