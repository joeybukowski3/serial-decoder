import { test, expect, chromium } from '@playwright/test';

test.setTimeout(120000);

async function openDecoderPage(viewport) {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: viewport || { width: 1440, height: 1100 }
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const requestFailures = [];
  const badResponses = [];
  const pageErrors = [];
  const providerRequests = [];
  let refinementCalls = 0;

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', error => {
    pageErrors.push(error.message);
  });
  page.on('request', request => {
    if (/generativelanguage\.googleapis\.com|api\.groq\.com/i.test(request.url())) {
      providerRequests.push(request.url());
    }
  });
  page.on('requestfailed', request => {
    requestFailures.push({
      url: request.url(),
      error: request.failure() ? request.failure().errorText : 'request failed'
    });
  });
  page.on('response', response => {
    if (response.status() >= 400) {
      badResponses.push({ url: response.url(), status: response.status() });
    }
  });

  await page.route('**/api/refine-serial-date', async (route) => {
    refinementCalls += 1;
    const body = route.request().postDataJSON();
    const candidates = Array.isArray(body.candidateYears) ? body.candidateYears : [];
    const model = String(body.model || '').toUpperCase();
    let payload;
    if (model === 'WM3470HWA') {
      payload = {
        status: 'resolved', candidateYears: candidates, remainingCandidateYears: [2014], chosenYear: 2014,
        confidence: 'high', resolutionBasis: 'serial-plus-model', modelProductionRange: { start: 2013, end: 2016 },
        evidence: [{ type: 'local-db', title: 'Verified LG model record', quality: 'official', productionStart: 2013, productionEnd: 2016 }],
        summary: 'Model evidence leaves 2014.', cacheStatus: 'bypass', provider: 'local-db',
        timings: { localMs: 1, cacheMs: 0, onlineLookupMs: 0, totalMs: 1 }, errorCode: null,
      };
    } else if (model === 'WMH31017HS12') {
      payload = {
        status: 'resolved', candidateYears: candidates, remainingCandidateYears: [2024], chosenYear: 2024,
        confidence: 'high', resolutionBasis: 'serial-plus-model', modelProductionRange: { start: 2023, end: 2025 },
        evidence: [{ type: 'local-db', title: 'Verified Whirlpool model record', quality: 'official', productionStart: 2023, productionEnd: 2025 }],
        summary: 'Model evidence leaves 2024.', cacheStatus: 'bypass', provider: 'local-db',
        timings: { localMs: 1, cacheMs: 0, onlineLookupMs: 0, totalMs: 1 }, errorCode: null,
      };
    } else {
      payload = {
        status: 'unavailable', candidateYears: candidates, remainingCandidateYears: candidates, chosenYear: null,
        confidence: null, resolutionBasis: 'serial-plus-model', modelProductionRange: null, evidence: [],
        summary: 'Model number could not confidently narrow this repeating serial cycle.',
        cacheStatus: 'bypass', provider: 'none', timings: { localMs: 0, cacheMs: 0, onlineLookupMs: 0, totalMs: 1 },
        errorCode: 'INSUFFICIENT_EVIDENCE',
      };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });

  await page.goto('http://localhost:3001/index.html?cat=appliances', { waitUntil: 'networkidle' });

  return { browser, context, page, consoleErrors, requestFailures, badResponses, pageErrors, providerRequests, getRefinementCalls: () => refinementCalls };
}

async function runDecode(page, brand, serial, model) {
  await page.selectOption('#brand', brand);
  await page.fill('#serial', serial);
  await page.fill('#modelNumber', model || '');
  await page.click('#decodeBtn');
  await page.waitForFunction(() => {
    const results = document.getElementById('serialResults');
    const loading = document.getElementById('ageLoading');
    return results && !results.classList.contains('hidden') &&
      loading && loading.classList.contains('hidden');
  }, { timeout: 20000 });
  if (model) {
    await page.waitForFunction(() => {
      const status = document.querySelector('.serial-refinement-status');
      return status && !status.classList.contains('serial-refinement-status--checking');
    }, { timeout: 20000 });
  }
  return page.evaluate(() => {
    const yearEl = document.getElementById('resultYear');
    const notesEl = document.getElementById('resultNotes');
    const ageEl = document.getElementById('resultEstimatedAge');
    const ageRow = ageEl && ageEl.closest ? ageEl.closest('.result-row') : null;
    const refinePanel = document.querySelector('.narrow-date-panel');
    return {
      year: yearEl ? yearEl.textContent.trim() : '',
      notes: notesEl ? notesEl.textContent.trim() : '',
      age: ageEl ? ageEl.textContent.trim() : '',
      ageVisible: !!(ageRow && window.getComputedStyle(ageRow).display !== 'none'),
      refineVisible: !!(refinePanel && !refinePanel.classList.contains('hidden')),
      refinementStatus: document.querySelector('.serial-refinement-status')?.className || ''
    };
  });
}

async function runRefine(page, model, contextText) {
  await page.waitForSelector('#narrowModelInput', { timeout: 20000 });
  await page.fill('#narrowModelInput', model || '');
  await page.fill('#narrowContextInput', contextText || '');
  await page.click('#narrowDateBtn');
  await page.waitForFunction(() => {
    const output = document.getElementById('narrowDateOutput');
    const yearEl = document.getElementById('resultYear');
    const status = document.querySelector('.serial-refinement-status');
    return output && !/Refining\.\.\./.test(output.textContent || '') &&
      status && status.classList.contains('serial-refinement-status--resolved') &&
      yearEl && /^\d{4}$/.test(yearEl.textContent.trim());
  }, { timeout: 20000 });
  return page.evaluate(() => {
    const yearEl = document.getElementById('resultYear');
    const notesEl = document.getElementById('resultNotes');
    const ageEl = document.getElementById('resultEstimatedAge');
    const ageRow = ageEl && ageEl.closest ? ageEl.closest('.result-row') : null;
    return {
      year: yearEl ? yearEl.textContent.trim() : '',
      notes: notesEl ? notesEl.textContent.trim() : '',
      ageVisible: !!(ageRow && window.getComputedStyle(ageRow).display !== 'none')
    };
  });
}

function filterRelevantConsoleErrors(errors) {
  return (errors || []).filter(message => {
    return !/content security policy|err_name_not_resolved|adtrafficquality|googlesyndication|doubleclick|google-analytics/i.test(String(message || ''));
  });
}

function filterRelevantNetworkFailures(items) {
  return (items || []).filter(item => {
    var url = String((item && item.url) || '');
    var error = String((item && item.error) || '');
    if (/localhost:3001\/api\/age-lookup/i.test(url) && /err_aborted/i.test(error)) {
      return false;
    }
    return /localhost:3001|localhost:59751/i.test(url) && !/favicon\.ico$/i.test(url);
  });
}

test('decoder acceptance flow', async () => {
  const { browser, context, page, consoleErrors, requestFailures, badResponses, pageErrors, providerRequests } = await openDecoderPage();
  try {
    const lgSerialOnly = await runDecode(page, 'lg', '412TATG1H105', '');
    expect(lgSerialOnly.year).toBe('2004/2014/2024');
    expect(lgSerialOnly.ageVisible).toBe(false);
    expect(lgSerialOnly.notes).toContain('Possible manufacture years: 2004, 2014, or 2024.');

    const lgUpfrontValid = await runDecode(page, 'lg', '412TATG1H105', 'WM3470HWA');
    expect(lgUpfrontValid.year).toBe('2014');
    expect(lgUpfrontValid.ageVisible).toBe(true);
    expect(lgUpfrontValid.refineVisible).toBe(true);
    expect(lgUpfrontValid.refinementStatus).toContain('serial-refinement-status--resolved');

    const lgUpfrontInvalid = await runDecode(page, 'lg', '412TATG1H105', 'UNKNOWNMODEL');
    expect(lgUpfrontInvalid.year).toBe('2004/2014/2024');
    expect(lgUpfrontInvalid.ageVisible).toBe(false);
    expect(lgUpfrontInvalid.notes).toContain('Model number could not confidently narrow this repeating serial cycle.');

    const whirlpoolSerialOnly = await runDecode(page, 'whirlpool', 'TRD3481274', '');
    expect(whirlpoolSerialOnly.year).toBe('1994/2024');
    expect(whirlpoolSerialOnly.ageVisible).toBe(false);

    const whirlpoolUpfrontValid = await runDecode(page, 'whirlpool', 'TRD3481274', 'WMH31017HS12');
    expect(whirlpoolUpfrontValid.year).toBe('2024');
    expect(whirlpoolUpfrontValid.ageVisible).toBe(true);

    const relevantConsoleErrors = filterRelevantConsoleErrors(consoleErrors);
    const pageFailures = filterRelevantNetworkFailures(requestFailures);
    const responseFailures = filterRelevantNetworkFailures(badResponses);

    expect(relevantConsoleErrors).toEqual([]);
    expect(pageFailures).toEqual([]);
    expect(responseFailures).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(providerRequests).toEqual([]);
  } finally {
    await context.close();
    await browser.close();
  }
});

test('decoder still completes on mobile width', async () => {
  const { browser, context, page, consoleErrors, requestFailures, badResponses, pageErrors, providerRequests } = await openDecoderPage({ width: 390, height: 844 });
  try {
    const mobileResult = await runDecode(page, 'lg', '412TATG1H105', 'WM3470HWA');
    expect(mobileResult.year).toBe('2014');
    expect(mobileResult.ageVisible).toBe(true);

    const relevantConsoleErrors = filterRelevantConsoleErrors(consoleErrors);
    const pageFailures = filterRelevantNetworkFailures(requestFailures);
    const responseFailures = filterRelevantNetworkFailures(badResponses);

    expect(relevantConsoleErrors).toEqual([]);
    expect(pageFailures).toEqual([]);
    expect(responseFailures).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(providerRequests).toEqual([]);
  } finally {
    await context.close();
    await browser.close();
  }
});

test('narrow the date refinement uses the same shared resolver', async () => {
  const { browser, context, page, consoleErrors, requestFailures, badResponses, pageErrors, providerRequests } = await openDecoderPage();
  try {
    const base = await runDecode(page, 'lg', '412TATG1H105', '');
    expect(base.year).toBe('2004/2014/2024');
    expect(base.ageVisible).toBe(false);

    await page.waitForFunction(() => {
      const panel = document.querySelector('.narrow-date-panel');
      return panel && !panel.classList.contains('hidden');
    }, { timeout: 20000 });

    const refined = await runRefine(page, 'WM3470HWA', '');
    expect(refined.year).toBe('2014');
    expect(refined.ageVisible).toBe(true);

    const relevantConsoleErrors = filterRelevantConsoleErrors(consoleErrors);
    const pageFailures = filterRelevantNetworkFailures(requestFailures);
    const responseFailures = filterRelevantNetworkFailures(badResponses);

    expect(relevantConsoleErrors).toEqual([]);
    expect(pageFailures).toEqual([]);
    expect(responseFailures).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(providerRequests).toEqual([]);
  } finally {
    await context.close();
    await browser.close();
  }
});
