import { test, expect, chromium } from '@playwright/test';

test.setTimeout(120000);

function isIgnoredConsoleError(message) {
  return /content security policy|err_name_not_resolved|adtrafficquality|googlesyndication|doubleclick|google-analytics/i.test(String(message || ''));
}

async function openPage(viewport = { width: 1440, height: 1000 }) {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const diagnostics = {
    consoleErrors: [],
    pageErrors: [],
    unexpectedApiRequests: [],
    providerRequests: [],
  };

  page.on('console', (message) => {
    if (message.type() === 'error' && !isIgnoredConsoleError(message.text())) {
      diagnostics.consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));
  page.on('request', (request) => {
    const url = request.url();
    if (/generativelanguage\.googleapis\.com|api\.groq\.com/i.test(url)) {
      diagnostics.providerRequests.push(url);
    }
    if (/localhost:3001\/api\//i.test(url) && !/\/api\/refine-serial-date(?:\?|$)/i.test(url)) {
      diagnostics.unexpectedApiRequests.push(url);
    }
  });

  await page.goto('http://localhost:3001/index.html?cat=appliances', { waitUntil: 'networkidle' });
  return { browser, context, page, diagnostics };
}

async function fillDecode(page, brand, serial, model) {
  await page.selectOption('#brand', brand);
  await page.fill('#serial', serial);
  await page.fill('#modelNumber', model || '');
}

async function expectRefinementVisible(page) {
  const panel = page.locator('.narrow-date-panel');
  await expect(panel).toBeVisible();
  await expect(panel).not.toHaveClass(/\bhidden\b/);
  await expect(page.locator('#serialSummaryLayer')).not.toHaveClass(/\bserial-no-refine\b/);
  await expect(page.locator('#narrowDateOutput')).toBeVisible();
}

async function rerenderLegacySummary(page) {
  await page.evaluate(() => {
    if (typeof window.renderSerialSummaryLayer === 'function') window.renderSerialSummaryLayer();
  });
}

function expectCleanDiagnostics(diagnostics) {
  expect(diagnostics.consoleErrors).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(diagnostics.unexpectedApiRequests).toEqual([]);
  expect(diagnostics.providerRequests).toEqual([]);
}

function response(overrides = {}) {
  return {
    status: 'resolved',
    candidateYears: [2004, 2014, 2024],
    remainingCandidateYears: [2014],
    chosenYear: 2014,
    confidence: 'high',
    resolutionBasis: 'serial-plus-model',
    modelProductionRange: { start: 2013, end: 2016 },
    evidence: [],
    summary: 'Model evidence leaves 2014.',
    cacheStatus: 'bypass',
    provider: 'local-db',
    timings: { localMs: 2, cacheMs: 0, onlineLookupMs: 0, totalMs: 2 },
    errorCode: null,
    ...overrides,
  };
}

test('serial candidates and loading status remain visible through legacy summary rerenders', async () => {
  const { browser, context, page, diagnostics } = await openPage();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route('**/api/refine-serial-date', async (route) => {
    await gate;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response({
        evidence: [{ type: 'local-db', title: 'Verified LG model record', quality: 'official', supports: '2013-2016' }],
      })),
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
    await expectRefinementVisible(page);

    await rerenderLegacySummary(page);
    await expect(page.locator('#narrowDateOutput')).toContainText('Checking model-era evidence');
    await expectRefinementVisible(page);

    release();
    await expect(page.locator('#resultYear')).toHaveText('2014');
    await expect(page.locator('.serial-refinement-evidence summary')).toHaveText('Evidence used');
    await expectRefinementVisible(page);
    expectCleanDiagnostics(diagnostics);
  } finally {
    release();
    await context.close();
    await browser.close();
  }
});

test('unavailable refinement preserves candidates and Retry after legacy summary rerender', async () => {
  const { browser, context, page, diagnostics } = await openPage({ width: 390, height: 844 });
  await page.route('**/api/refine-serial-date', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response({
        status: 'unavailable',
        candidateYears: [1994, 2024],
        remainingCandidateYears: [1994, 2024],
        chosenYear: null,
        confidence: null,
        modelProductionRange: null,
        evidence: [],
        summary: 'Model evidence could not be checked.',
        provider: 'none',
        timings: { localMs: 0, cacheMs: 0, onlineLookupMs: 0, totalMs: 10 },
        errorCode: 'REFINEMENT_TIMEOUT',
      })),
    });
  });
  try {
    await fillDecode(page, 'whirlpool', 'TRD3481274', 'WMH31017HS12');
    await page.click('#decodeBtn');
    await expect(page.locator('#resultYear')).toHaveText('1994/2024');
    await expect(page.locator('[data-serial-refinement-retry="1"]')).toBeVisible();
    await expectRefinementVisible(page);

    await rerenderLegacySummary(page);
    await expect(page.locator('[data-serial-refinement-retry="1"]')).toBeVisible();
    await expectRefinementVisible(page);

    const age = page.locator('#resultEstimatedAge');
    await expect(age).toHaveText(/^(|—)$/);
    expectCleanDiagnostics(diagnostics);
  } finally {
    await context.close();
    await browser.close();
  }
});

test('changed input prevents a stale response from overwriting current candidates', async () => {
  const { browser, context, page, diagnostics } = await openPage();
  let firstRoute;
  let calls = 0;
  await page.route('**/api/refine-serial-date', async (route) => {
    calls += 1;
    if (calls === 1) { firstRoute = route; return; }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response({
        status: 'ambiguous',
        remainingCandidateYears: [2004, 2014, 2024],
        chosenYear: null,
        confidence: null,
        modelProductionRange: null,
        summary: 'Still ambiguous.',
        provider: 'none',
      })),
    });
  });
  try {
    await fillDecode(page, 'lg', '412TATG1H105', 'WM3470HWA');
    await page.click('#decodeBtn');
    await expect(page.locator('#resultYear')).toHaveText('2004/2014/2024');
    await page.fill('#modelNumber', 'DIFFERENTMODEL');
    try {
      await firstRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(response({ summary: 'Stale response.', provider: 'gemini-google-search' })),
      });
    } catch (_) {
      // The request may already be aborted, which is the expected cancellation path.
    }
    await page.waitForTimeout(100);
    await expect(page.locator('#resultYear')).toHaveText('2004/2014/2024');
    expect(diagnostics.consoleErrors).toEqual([]);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(diagnostics.unexpectedApiRequests).toEqual([]);
    expect(diagnostics.providerRequests).toEqual([]);
  } finally {
    await context.close();
    await browser.close();
  }
});

test('identical rapid decode clicks reuse one in-flight refinement request', async () => {
  const { browser, context, page, diagnostics } = await openPage();
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route('**/api/refine-serial-date', async (route) => {
    calls += 1;
    await gate;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response()) });
  });
  try {
    await fillDecode(page, 'lg', '412TATG1H105', 'WM3470HWA');
    await page.click('#decodeBtn');
    await expect(page.locator('#serialResults')).toBeVisible({ timeout: 500 });
    await page.click('#decodeBtn');
    await page.waitForTimeout(100);
    expect(calls).toBe(1);
    await expect(page.locator('#narrowDateOutput')).toContainText('Checking model-era evidence');
    await expectRefinementVisible(page);
    release();
    await expect(page.locator('#resultYear')).toHaveText('2014');
    expectCleanDiagnostics(diagnostics);
  } finally {
    release();
    await context.close();
    await browser.close();
  }
});

test('resolved result keeps explanation and Evidence used visible', async () => {
  const { browser, context, page, diagnostics } = await openPage();
  await page.route('**/api/refine-serial-date', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response({
        candidateYears: [1994, 2024],
        remainingCandidateYears: [2024],
        chosenYear: 2024,
        modelProductionRange: { start: 2023, end: 2025 },
        evidence: [{
          type: 'manufacturer-support',
          title: 'Whirlpool support',
          sourceUrl: 'https://www.whirlpool.com/',
          quality: 'official',
          availabilityStart: 2023,
          availabilityEnd: 2025,
        }],
        summary: 'Model evidence leaves 2024.',
        cacheStatus: 'miss',
        provider: 'gemini-google-search',
      })),
    });
  });
  try {
    await fillDecode(page, 'whirlpool', 'TRD3481274', 'WMH31017HS12');
    await page.click('#decodeBtn');
    await expect(page.locator('#resultYear')).toHaveText('2024');
    await expect(page.locator('.serial-refinement-status')).toBeVisible();
    await expect(page.locator('.serial-refinement-evidence summary')).toHaveText('Evidence used');
    await expectRefinementVisible(page);

    await rerenderLegacySummary(page);
    await expect(page.locator('.serial-refinement-evidence summary')).toHaveText('Evidence used');
    await expectRefinementVisible(page);
    expectCleanDiagnostics(diagnostics);
  } finally {
    await context.close();
    await browser.close();
  }
});

test('ambiguous refinement remains visible and never exposes an estimated age', async () => {
  const { browser, context, page, diagnostics } = await openPage();
  await page.route('**/api/refine-serial-date', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response({
        status: 'ambiguous',
        remainingCandidateYears: [2014, 2024],
        chosenYear: null,
        confidence: 'medium',
        modelProductionRange: { start: 2013, end: 2025 },
        summary: 'Model evidence narrows the result to 2014 or 2024.',
        provider: 'gemini-google-search',
      })),
    });
  });
  try {
    await fillDecode(page, 'lg', '412TATG1H105', 'WM3470HWA');
    await page.click('#decodeBtn');
    await expect(page.locator('#resultYear')).toHaveText('2014/2024');
    await expect(page.locator('.serial-refinement-status--ambiguous')).toBeVisible();
    await expectRefinementVisible(page);
    await expect(page.locator('#resultEstimatedAge')).toHaveText(/^(|—)$/);
    expectCleanDiagnostics(diagnostics);
  } finally {
    await context.close();
    await browser.close();
  }
});

test('conflict refinement preserves original candidates and remains visible', async () => {
  const { browser, context, page, diagnostics } = await openPage();
  await page.route('**/api/refine-serial-date', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response({
        status: 'conflict',
        candidateYears: [1994, 2024],
        remainingCandidateYears: [],
        chosenYear: null,
        confidence: null,
        modelProductionRange: { start: 2010, end: 2012 },
        summary: 'The model evidence does not overlap the serial-valid years.',
        provider: 'local-db',
      })),
    });
  });
  try {
    await fillDecode(page, 'whirlpool', 'TRD3481274', 'WMH31017HS12');
    await page.click('#decodeBtn');
    await expect(page.locator('#resultYear')).toHaveText('1994/2024');
    await expect(page.locator('.serial-refinement-status--conflict')).toBeVisible();
    await expectRefinementVisible(page);
    expectCleanDiagnostics(diagnostics);
  } finally {
    await context.close();
    await browser.close();
  }
});
