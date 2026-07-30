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

test('GE A-code modern serial stays useful without model evidence', async () => {
  const { browser, context, page, diagnostics } = await openPage({ width: 390, height: 844 });
  try {
    await fillDecode(page, 'ge', '  la208110g  ', '');
    await page.click('#decodeBtn');

    await expect(page.locator('#serialResults')).toBeVisible();
    await expect(page.locator('#resultYear')).toHaveText('1977/1989/2001/2013/2025');
    await expect(page.locator('#resultMonth')).toHaveText('June');
    await expect(page.locator('#resultNotes')).toContainText('Possible manufacture years');
    await expect(page.locator('#resultNotes')).toContainText('Add a model number');
    await expect(page.locator('.result-warning')).toHaveClass(/\bhidden\b/);
    await expect(page.locator('#resultEstimatedAge')).toHaveText(/^(|—)$/);
    expectCleanDiagnostics(diagnostics);
  } finally {
    await context.close();
    await browser.close();
  }
});

test('GE dryer label and base model forms refine the serial result to June 2025', async () => {
  const { browser, context, page, diagnostics } = await openPage();
  const requestedModels = [];
  await page.route('**/api/refine-serial-date', async (route) => {
    const body = route.request().postDataJSON();
    requestedModels.push(body.model);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response({
        candidateYears: [1977, 1989, 2001, 2013, 2025],
        remainingCandidateYears: [2025],
        chosenYear: 2025,
        modelProductionRange: { start: 2024, end: null },
        evidence: [{
          type: 'local-db',
          title: 'GE PFD87ESPVRS official production-start record',
          quality: 'official',
          supports: 'Manufactured from February 2024 onward.',
        }],
        summary: 'The model production era resolves the repeating GE year cycle to 2025.',
      })),
    });
  });
  try {
    for (const model of ['PFD87ESPV0RS', 'PFD87ESPVRS']) {
      await fillDecode(page, 'ge', 'LA208110G', model);
      await page.click('#decodeBtn');
      await expect(page.locator('#resultYear')).toHaveText('2025');
      await expect(page.locator('#resultMonth')).toHaveText('June');
      await expect(page.locator('#resultNotes')).toContainText('resolves the repeating GE year cycle');
      await expect(page.locator('.result-warning')).toHaveClass(/\bhidden\b/);
    }

    expect(requestedModels).toEqual(['PFD87ESPV0RS', 'PFD87ESPVRS']);
    await expect(page.getByRole('button', { name: /Possible Error\? Let Us Know/i }).first()).toBeVisible();
    expectCleanDiagnostics(diagnostics);
  } finally {
    await context.close();
    await browser.close();
  }
});

test('GE GFW850 label and family model forms refine FR31424IN to March 2020', async () => {
  const { browser, context, page, diagnostics } = await openPage();
  const requestedModels = [];
  await page.route('**/api/refine-serial-date', async (route) => {
    const body = route.request().postDataJSON();
    requestedModels.push(body.model);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response({
        candidateYears: [1984, 1996, 2008, 2020],
        remainingCandidateYears: [2020],
        chosenYear: 2020,
        modelProductionRange: { start: 2019, end: 2021 },
        modelNormalization: body.model === 'GFW850SPN0DG' ? {
          original: 'GFW850SPN0DG',
          canonical: 'GFW850SPN0DG',
          usedValidatedAlternative: true,
          validatedAlternative: { value: 'GFW850SPNDG', change: 'GFW850SPN0DG→GFW850SPNDG (validated exact model alias)' },
        } : null,
        evidence: [{
          type: 'local-db',
          title: 'GE GFW850SPNDG official production-window record',
          quality: 'official',
          supports: 'Manufactured December 2019 through December 2021.',
        }],
        summary: 'Serial decoding produced 1984, 1996, 2008, 2020. Model evidence eliminates the other serial-valid cycles and leaves 2020.',
      })),
    });
  });
  try {
    for (const model of ['GFW850SPN0DG', 'GFW850SPNDG']) {
      await fillDecode(page, 'ge', 'FR31424IN', model);
      await page.click('#decodeBtn');
      await expect(page.locator('#resultYear')).toHaveText('2020');
      await expect(page.locator('#resultMonth')).toHaveText('March');
      await expect(page.locator('#resultNotes')).toContainText('eliminates the other serial-valid cycles');
      await expect(page.locator('.result-warning')).toHaveClass(/\bhidden\b/);
      await expect(page.locator('#narrowDateOutput')).not.toContainText('Model evidence unavailable');
      await expect(page.locator('[data-serial-refinement-retry="1"]')).toHaveCount(0);
    }

    // The label variant discloses the resolved canonical family; the
    // canonical-model request has nothing to disclose (no alias was used).
    await fillDecode(page, 'ge', 'FR31424IN', 'GFW850SPN0DG');
    await page.click('#decodeBtn');
    await expect(page.locator('.serial-refinement-normalization')).toContainText('GFW850SPN0DG');
    await expect(page.locator('.serial-refinement-normalization')).toContainText('GFW850SPNDG');
    await expect(page.locator('.serial-refinement-evidence summary')).toHaveText('Evidence used');

    expect(requestedModels).toEqual(['GFW850SPN0DG', 'GFW850SPNDG', 'GFW850SPN0DG']);
    expectCleanDiagnostics(diagnostics);
  } finally {
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

test('browser rejects a resolved year outside the original serial candidates', async () => {
  const { browser, context, page, diagnostics } = await openPage();
  await page.route('**/api/refine-serial-date', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response({
        status: 'resolved',
        candidateYears: [2004, 2014, 2024],
        remainingCandidateYears: [2023],
        chosenYear: 2023,
        summary: 'Model research found 2023.',
        provider: 'smart-lookup-openai',
      })),
    });
  });
  try {
    await fillDecode(page, 'lg', '412TATG1H105', 'WM3470HWA');
    await page.click('#decodeBtn');

    await expect(page.locator('#resultYear')).toHaveText('2004/2014/2024');
    await expect(page.locator('#narrowDateOutput')).toContainText('outside the serial-decoded candidates');
    await expect(page.locator('#narrowDateOutput')).not.toContainText('Resolved manufacture year');
    await expect(page.locator('#resultEstimatedAge')).toHaveText(/^(|—)$/);
    expectCleanDiagnostics(diagnostics);
  } finally {
    await context.close();
    await browser.close();
  }
});

test('GE field-pattern warning is informational and never swaps entries', async () => {
  const { browser, context, page, diagnostics } = await openPage();
  await page.route('**/api/refine-serial-date', async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response({
        status: 'unavailable',
        candidateYears: body.candidateYears,
        remainingCandidateYears: body.candidateYears,
        chosenYear: null,
        confidence: null,
        summary: 'Model evidence was unavailable.',
        provider: 'none',
      })),
    });
  });
  try {
    await fillDecode(page, 'ge', 'GDF650SYV0FS', 'HV907351B');
    await page.click('#decodeBtn');

    await expect(page.locator('.serial-refinement-entry-warning')).toBeVisible();
    await expect(page.locator('.serial-refinement-entry-warning')).toContainText('two date-code letters');
    await expect(page.locator('.serial-refinement-entry-warning')).toContainText('entries were not swapped');
    await expect(page.locator('#serial')).toHaveValue('GDF650SYV0FS');
    await expect(page.locator('#modelNumber')).toHaveValue('HV907351B');
    expectCleanDiagnostics(diagnostics);
  } finally {
    await context.close();
    await browser.close();
  }
});
